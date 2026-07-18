import Foundation

final class GrokACPClient: AgentProvider, @unchecked Sendable {
    let descriptor = ProviderCatalog.grok

    private let eventHandler: @MainActor (AgentEvent) -> Void
    private let queue = DispatchQueue(label: "com.nolira.build.native.grok-acp")
    private var process: Process?
    private var standardInput: FileHandle?
    private var standardOutput: FileHandle?
    private var standardError: FileHandle?
    private var outputBuffer = Data()
    private var nextRequestID = 1
    private var pending: [Int: CheckedContinuation<[String: Any], Error>] = [:]
    private var pendingPermissions: [String: Any] = [:]
    private var engineSessionID: String?
    private var shuttingDown = false

    init(eventHandler: @escaping @MainActor (AgentEvent) -> Void) {
        self.eventHandler = eventHandler
    }

    var isConnected: Bool {
        queue.sync {
            process?.isRunning == true && engineSessionID != nil
        }
    }

    func connect(options: AgentConnectionOptions) async throws {
        if isConnected { return }

        let executableURL = try Self.resolveExecutable(customPath: options.customExecutablePath)
        let process = Process()
        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = executableURL
        process.arguments = Self.processArguments(
            modelID: options.modelID,
            approvalMode: options.approvalMode
        )
        process.currentDirectoryURL = URL(fileURLWithPath: options.workingDirectory, isDirectory: true)
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        let stdout = stdoutPipe.fileHandleForReading
        let stderr = stderrPipe.fileHandleForReading

        stdout.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.queue.async {
                self?.consume(data)
            }
        }
        stderr.readabilityHandler = { handle in
            _ = handle.availableData
        }
        process.terminationHandler = { [weak self] process in
            self?.queue.async {
                guard let self else { return }
                self.standardOutput?.readabilityHandler = nil
                self.standardError?.readabilityHandler = nil
                self.engineSessionID = nil
                self.failPending(with: AgentProviderError.disconnected)
                if !self.shuttingDown {
                    self.emit(.failed("Grok agent exited with code \(process.terminationStatus)."))
                }
            }
        }

        queue.sync {
            shuttingDown = false
            self.process = process
            standardInput = stdinPipe.fileHandleForWriting
            standardOutput = stdout
            standardError = stderr
        }

        do {
            try process.run()
        } catch {
            shutdown()
            throw error
        }

        _ = try await request(
            method: "initialize",
            params: [
                "protocolVersion": 1,
                "clientInfo": [
                    "name": "Nolira Build Native",
                    "version": "0.1.0",
                ],
                "clientCapabilities": [
                    "fs": ["readTextFile": false, "writeTextFile": false],
                    "terminal": false,
                ],
            ]
        )

        let sessionResult: [String: Any]
        if let existing = options.existingSessionID, !existing.isEmpty {
            do {
                sessionResult = try await request(
                    method: "session/load",
                    params: [
                        "sessionId": existing,
                        "cwd": options.workingDirectory,
                        "mcpServers": [],
                    ]
                )
            } catch {
                sessionResult = try await createSession(workingDirectory: options.workingDirectory)
            }
        } else {
            sessionResult = try await createSession(workingDirectory: options.workingDirectory)
        }

        guard let sessionID = (sessionResult["sessionId"] ?? sessionResult["session_id"]) as? String else {
            throw AgentProviderError.invalidResponse("session/new did not return a sessionId")
        }

        let models = Self.extractModels(from: sessionResult)
        queue.sync {
            engineSessionID = sessionID
        }
        emit(.ready(sessionID: sessionID, models: models))
    }

    func send(
        prompt: String,
        attachments: [PromptAttachment],
        project: WorkspaceProject,
        modelID: String?,
        effort: ReasoningEffort,
        mode: TaskMode
    ) async throws {
        guard let sessionID = queue.sync(execute: { engineSessionID }) else {
            throw AgentProviderError.processUnavailable
        }

        if let modelID, !modelID.isEmpty {
            _ = try? await request(
                method: "session/set_model",
                params: ["sessionId": sessionID, "modelId": modelID]
            )
        }

        var metadata: [String: Any] = [
            "reasoningEffort": effort.rawValue,
            "x.ai/effort": effort.rawValue,
            "mode": mode.rawValue,
        ]
        if let modelID, !modelID.isEmpty {
            metadata["modelId"] = modelID
        }

        do {
            _ = try await request(
                method: "session/prompt",
                params: [
                    "sessionId": sessionID,
                    "prompt": try Self.promptBlocks(
                        prompt: prompt,
                        attachments: attachments,
                        project: project
                    ),
                    "_meta": metadata,
                ]
            )
            emit(.completed)
        } catch {
            emit(.failed(error.localizedDescription))
            throw error
        }
    }

    func fork(workingDirectory: String, modelID: String?) async throws -> String {
        guard let sourceSessionID = queue.sync(execute: { engineSessionID }) else {
            throw AgentProviderError.processUnavailable
        }
        var params: [String: Any] = [
            "sourceSessionId": sourceSessionID,
            "sourceCwd": workingDirectory,
            "newCwd": workingDirectory,
            "sessionKind": "fork",
        ]
        if let modelID, !modelID.isEmpty { params["newModelId"] = modelID }
        let result = try await request(method: "x.ai/session/fork", params: params)
        if let sessionID = result["newSessionId"] as? String { return sessionID }
        if let nested = result["result"] as? [String: Any],
           let sessionID = nested["newSessionId"] as? String
        {
            return sessionID
        }
        throw AgentProviderError.invalidResponse("Grok did not return a forked session id")
    }

    func cancel() async {
        guard let sessionID = queue.sync(execute: { engineSessionID }) else {
            shutdown()
            return
        }
        _ = try? await request(
            method: "session/cancel",
            params: ["sessionId": sessionID]
        )
    }

    func resolvePermission(id: String, decision: PermissionDecision) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard let rpcID = self.pendingPermissions.removeValue(forKey: id) else {
                    continuation.resume(throwing: AgentProviderError.invalidResponse("unknown permission request"))
                    return
                }
                do {
                    try self.write([
                        "jsonrpc": "2.0",
                        "id": rpcID,
                        "result": [
                            "outcome": [
                                "outcome": "selected",
                                "optionId": decision.acpOptionID,
                            ],
                        ],
                    ])
                    continuation.resume(returning: ())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func shutdown() {
        queue.async {
            self.shuttingDown = true
            self.standardOutput?.readabilityHandler = nil
            self.standardError?.readabilityHandler = nil
            if self.process?.isRunning == true {
                self.process?.terminate()
            }
            self.engineSessionID = nil
            self.pendingPermissions.removeAll()
            self.failPending(with: AgentProviderError.disconnected)
            self.standardInput = nil
            self.standardOutput = nil
            self.standardError = nil
            self.process = nil
        }
    }

    private func createSession(workingDirectory: String) async throws -> [String: Any] {
        try await request(
            method: "session/new",
            params: ["cwd": workingDirectory, "mcpServers": []]
        )
    }

    private func request(method: String, params: [String: Any]) async throws -> [String: Any] {
        let requestID = queue.sync { () -> Int in
            defer { nextRequestID += 1 }
            return nextRequestID
        }

        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard self.process?.isRunning == true else {
                    continuation.resume(throwing: AgentProviderError.processUnavailable)
                    return
                }
                self.pending[requestID] = continuation
                do {
                    try self.write([
                        "jsonrpc": "2.0",
                        "id": requestID,
                        "method": method,
                        "params": params,
                    ])
                } catch {
                    self.pending.removeValue(forKey: requestID)
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func write(_ object: [String: Any]) throws {
        guard let standardInput else { throw AgentProviderError.processUnavailable }
        var data = try JSONSerialization.data(withJSONObject: object)
        data.append(0x0A)
        try standardInput.write(contentsOf: data)
    }

    private func consume(_ data: Data) {
        outputBuffer.append(data)
        while let newline = outputBuffer.firstIndex(of: 0x0A) {
            let line = outputBuffer[..<newline]
            outputBuffer.removeSubrange(...newline)
            guard !line.isEmpty else { continue }
            handle(line: Data(line))
        }
    }

    private func handle(line: Data) {
        guard
            let object = try? JSONSerialization.jsonObject(with: line),
            let payload = object as? [String: Any]
        else { return }

        let method = payload["method"] as? String
        if method == nil, let rawID = payload["id"], let requestID = Self.integerID(rawID) {
            guard let continuation = pending.removeValue(forKey: requestID) else { return }
            if let error = payload["error"] as? [String: Any] {
                let code = (error["code"] as? NSNumber)?.intValue ?? -1
                let message = error["message"] as? String ?? "Unknown error"
                continuation.resume(throwing: AgentProviderError.rpc(code: code, message: message))
            } else {
                continuation.resume(returning: payload["result"] as? [String: Any] ?? [:])
            }
            return
        }

        guard let method else { return }
        let normalizedMethod = method.hasPrefix("_") ? String(method.dropFirst()) : method
        let params = payload["params"] as? [String: Any] ?? [:]

        switch normalizedMethod {
        case "session/update", "x.ai/session/update":
            let update = params["update"] as? [String: Any] ?? params
            map(update: update, params: params)
        case "session/request_permission", "request_permission":
            guard let rpcID = payload["id"] else { return }
            let requestID = UUID().uuidString
            pendingPermissions[requestID] = rpcID
            let toolCall = params["toolCall"] as? [String: Any]
            let name = (toolCall?["title"] ?? toolCall?["kind"] ?? params["toolName"]) as? String ?? "Tool"
            let summary = (toolCall?["title"] ?? params["summary"]) as? String ?? "Grok requests permission"
            let detail = Self.jsonString(toolCall?["rawInput"] ?? params["description"])
            emit(
                .permission(
                    PendingPermission(
                        id: requestID,
                        taskID: UUID(),
                        toolName: name,
                        summary: summary,
                        detail: detail
                    )
                )
            )
        default:
            if let rpcID = payload["id"] {
                try? write(["jsonrpc": "2.0", "id": rpcID, "result": [:]])
            }
        }
    }

    private func map(update: [String: Any], params: [String: Any]) {
        let kind = (update["sessionUpdate"] ?? update["session_update"]) as? String ?? ""
        switch kind {
        case "agent_message_chunk":
            if let text = Self.extractText(update), !text.isEmpty { emit(.messageDelta(text)) }
        case "agent_thought_chunk":
            if let text = Self.extractText(update), !text.isEmpty { emit(.thoughtDelta(text)) }
        case "tool_call":
            emit(.toolStarted(Self.toolActivity(from: update, defaultStatus: .running)))
        case "tool_call_update":
            emit(.toolUpdated(Self.toolActivity(from: update, defaultStatus: .running)))
        case "plan":
            let entries = update["entries"] as? [[String: Any]] ?? []
            let steps = entries.compactMap { ($0["content"] ?? $0["title"]) as? String }
            emit(.plan(steps))
        default:
            break
        }

        let meta = (update["_meta"] as? [String: Any])
            ?? (params["_meta"] as? [String: Any])
        if let total = (meta?["totalTokens"] ?? meta?["total_tokens"]) as? NSNumber {
            emit(.contextUsage(total.intValue))
        }
    }

    private func failPending(with error: Error) {
        let continuations = pending.values
        pending.removeAll()
        for continuation in continuations {
            continuation.resume(throwing: error)
        }
    }

    private func emit(_ event: AgentEvent) {
        Task { @MainActor in
            eventHandler(event)
        }
    }

    private static func processArguments(
        modelID: String?,
        approvalMode: ApprovalMode
    ) -> [String] {
        var arguments = ["agent"]
        if let modelID, !modelID.isEmpty {
            arguments.append(contentsOf: ["--model", modelID])
        }
        if approvalMode == .fullAccess {
            arguments.append("--always-approve")
        }
        arguments.append("stdio")
        return arguments
    }

    private static func promptBlocks(
        prompt: String,
        attachments: [PromptAttachment],
        project: WorkspaceProject
    ) throws -> [[String: Any]] {
        var blocks: [[String: Any]] = []
        if !project.instructions.isEmpty {
            blocks.append([
                "type": "text",
                "text": "Project instructions (follow these for this workspace):\n\(project.instructions)",
            ])
        }
        if !project.memory.isEmpty {
            blocks.append([
                "type": "text",
                "text": "Project memory (user-maintained context):\n\(project.memory)",
            ])
        }
        if !prompt.isEmpty {
            blocks.append(["type": "text", "text": prompt])
        }

        for attachment in attachments {
            let url = URL(fileURLWithPath: attachment.path)
            let data = try Data(contentsOf: url)
            if attachment.mime?.hasPrefix("image/") == true {
                guard data.count <= 8 * 1_024 * 1_024 else {
                    throw AgentProviderError.invalidResponse(
                        "Image \(attachment.name) exceeds the 8 MB Grok prompt limit"
                    )
                }
                blocks.append([
                    "type": "image",
                    "mimeType": attachment.mime ?? "image/png",
                    "data": data.base64EncodedString(),
                ])
            } else if isTextAttachment(attachment), let content = String(data: data, encoding: .utf8) {
                blocks.append([
                    "type": "text",
                    "text": "Attached file: \(attachment.name)\nPath: \(attachment.path)\n\n\(content.prefix(200_000))",
                ])
            } else {
                blocks.append([
                    "type": "text",
                    "text": "Attached binary file: \(attachment.name)\nPath: \(attachment.path)",
                ])
            }
        }
        return blocks
    }

    private static func isTextAttachment(_ attachment: PromptAttachment) -> Bool {
        if attachment.mime?.hasPrefix("text/") == true { return true }
        if let mime = attachment.mime,
           ["application/json", "application/xml", "application/javascript"].contains(mime)
        {
            return true
        }
        let extensions: Set<String> = [
            "c", "cc", "cpp", "css", "go", "h", "hpp", "html", "java", "js", "json",
            "kt", "md", "mjs", "py", "rb", "rs", "sh", "sql", "swift", "toml", "ts",
            "tsx", "txt", "xml", "yaml", "yml",
        ]
        return extensions.contains(URL(fileURLWithPath: attachment.path).pathExtension.lowercased())
    }

    private static func resolveExecutable(customPath: String?) throws -> URL {
        let fileManager = FileManager.default
        let home = fileManager.homeDirectoryForCurrentUser.path
        let candidates = [
            customPath,
            "\(home)/.grok/bin/grok",
            "/opt/homebrew/bin/grok",
            "/usr/local/bin/grok",
            "/usr/bin/grok",
        ].compactMap { $0 }

        guard let match = candidates.first(where: { fileManager.isExecutableFile(atPath: $0) }) else {
            throw AgentProviderError.executableNotFound
        }
        return URL(fileURLWithPath: match)
    }

    private static func integerID(_ value: Any) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String { return Int(string) }
        return nil
    }

    private static func extractText(_ update: [String: Any]) -> String? {
        if let content = update["content"] as? String { return content }
        if let content = update["content"] as? [String: Any] {
            return content["text"] as? String
        }
        return update["text"] as? String
    }

    private static func toolActivity(
        from update: [String: Any],
        defaultStatus: ToolStatus
    ) -> ToolActivity {
        let id = (update["toolCallId"] ?? update["tool_call_id"]) as? String ?? UUID().uuidString
        let statusValue = update["status"] as? String
        let status: ToolStatus = switch statusValue {
        case "pending": .pending
        case "completed", "success": .completed
        case "failed", "error": .failed
        case "cancelled", "canceled": .cancelled
        default: defaultStatus
        }
        return ToolActivity(
            id: id,
            title: update["title"] as? String ?? "Tool",
            kind: update["kind"] as? String ?? "other",
            status: status,
            input: jsonString(update["rawInput"] ?? update["input"]),
            output: extractToolOutput(update)
        )
    }

    private static func extractToolOutput(_ update: [String: Any]) -> String? {
        if let raw = update["rawOutput"] { return jsonString(raw) }
        guard let content = update["content"] as? [[String: Any]], let first = content.first else {
            return nil
        }
        if let nested = first["content"] as? [String: Any] {
            return nested["text"] as? String
        }
        return first["text"] as? String
    }

    private static func jsonString(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let string = value as? String { return string }
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted])
        else { return String(describing: value) }
        return String(data: data, encoding: .utf8)
    }

    private static func extractModels(from result: [String: Any]) -> [ModelOption] {
        let modelsContainer = result["models"] as? [String: Any]
        let rawModels = (modelsContainer?["availableModels"] ?? result["availableModels"]) as? [[String: Any]] ?? []
        let models = rawModels.compactMap { model -> ModelOption? in
            guard let id = (model["modelId"] ?? model["id"]) as? String, !id.isEmpty else {
                return nil
            }
            return ModelOption(id: id, name: model["name"] as? String ?? id)
        }
        if !models.isEmpty { return models }
        return [
            ModelOption(id: "", name: "Grok default"),
            ModelOption(id: "grok-code", name: "Grok Code"),
            ModelOption(id: "grok-build", name: "Grok Build"),
        ]
    }
}
