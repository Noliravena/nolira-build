import AppKit
import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    enum InspectorTab: String, CaseIterable, Identifiable {
        case changes
        case terminal

        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    @Published private(set) var projects: [WorkspaceProject] = []
    @Published private(set) var tasks: [BuildTask] = []
    @Published var selectedProjectID: UUID?
    @Published var selectedTaskID: UUID?
    @Published var composer = ""
    @Published var taskStates: [UUID: BuildTaskState] = [:]
    @Published var pendingPermission: PendingPermission?
    @Published var modelOptions = [ModelOption(id: "", name: "Grok default")]
    @Published var contextTokens: [UUID: Int] = [:]
    @Published var inspectorVisible = true
    @Published var inspectorTab: InspectorTab = .changes
    @Published var gitSummary = "Select a task to inspect its working tree."
    @Published var terminalCommand = ""
    @Published var terminalOutput = "Nolira Build terminal\n"
    @Published var terminalRunning = false
    @Published var runtimeStatus = "Grok runtime not checked"
    @Published var customExecutablePath: String {
        didSet {
            UserDefaults.standard.set(customExecutablePath, forKey: Self.enginePathKey)
            runtimeStatus = "Runtime setting changed"
        }
    }

    let providers = ProviderCatalog.all

    private var clients: [UUID: GrokACPClient] = [:]
    private var activeAssistantIDs: [UUID: UUID] = [:]
    private let stateURL: URL
    private static let enginePathKey = "nolira.native.customEnginePath"

    init() {
        customExecutablePath = UserDefaults.standard.string(forKey: Self.enginePathKey) ?? ""
        stateURL = Self.makeStateURL()
        load()
        checkRuntime()
    }

    var selectedTask: BuildTask? {
        guard let selectedTaskID else { return nil }
        return tasks.first(where: { $0.id == selectedTaskID })
    }

    var selectedProject: WorkspaceProject? {
        if let task = selectedTask {
            return projects.first(where: { $0.id == task.projectID })
        }
        guard let selectedProjectID else { return nil }
        return projects.first(where: { $0.id == selectedProjectID })
    }

    var selectedTaskState: BuildTaskState {
        guard let selectedTaskID else { return .idle }
        return taskStates[selectedTaskID] ?? .idle
    }

    var isSelectedTaskBusy: Bool {
        [.connecting, .streaming, .waitingForApproval].contains(selectedTaskState)
    }

    func tasks(for projectID: UUID) -> [BuildTask] {
        tasks
            .filter { $0.projectID == projectID }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func project(for task: BuildTask) -> WorkspaceProject? {
        projects.first(where: { $0.id == task.projectID })
    }

    func select(projectID: UUID) {
        selectedProjectID = projectID
        if let first = tasks(for: projectID).first {
            select(taskID: first.id)
        } else {
            createTask(in: projectID)
        }
        persist()
    }

    func select(taskID: UUID) {
        selectedTaskID = taskID
        if let task = tasks.first(where: { $0.id == taskID }) {
            selectedProjectID = task.projectID
        }
        pendingPermission = nil
        refreshGitSummary()
        persist()
    }

    @discardableResult
    func addProjectWithPicker() -> WorkspaceProject? {
        let panel = NSOpenPanel()
        panel.title = "Open a project for Grok Build"
        panel.prompt = "Open Project"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true

        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        let path = url.standardizedFileURL.path

        if let existing = projects.first(where: { $0.path == path }) {
            select(projectID: existing.id)
            return existing
        }

        let project = WorkspaceProject(
            id: UUID(),
            name: url.lastPathComponent.isEmpty ? path : url.lastPathComponent,
            path: path,
            createdAt: Date()
        )
        projects.append(project)
        selectedProjectID = project.id
        createTask(in: project.id)
        persist()
        return project
    }

    func createTask() {
        if let selectedProjectID {
            createTask(in: selectedProjectID)
            return
        }
        _ = addProjectWithPicker()
    }

    func createTask(in projectID: UUID) {
        let item = BuildTask(projectID: projectID)
        tasks.append(item)
        selectedProjectID = projectID
        selectedTaskID = item.id
        taskStates[item.id] = .idle
        persist()
        refreshGitSummary()
    }

    func renameTask(_ taskID: UUID, to title: String) {
        guard let index = tasks.firstIndex(where: { $0.id == taskID }) else { return }
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        tasks[index].title = clean
        tasks[index].updatedAt = Date()
        persist()
    }

    func deleteTask(_ taskID: UUID) {
        clients.removeValue(forKey: taskID)?.shutdown()
        guard let removed = tasks.first(where: { $0.id == taskID }) else { return }
        tasks.removeAll { $0.id == taskID }
        taskStates.removeValue(forKey: taskID)
        contextTokens.removeValue(forKey: taskID)
        if selectedTaskID == taskID {
            selectedTaskID = tasks(for: removed.projectID).first?.id
        }
        persist()
    }

    func deleteProject(_ projectID: UUID) {
        let taskIDs = tasks.filter { $0.projectID == projectID }.map(\.id)
        for taskID in taskIDs {
            clients.removeValue(forKey: taskID)?.shutdown()
            taskStates.removeValue(forKey: taskID)
        }
        tasks.removeAll { $0.projectID == projectID }
        projects.removeAll { $0.id == projectID }

        if selectedProjectID == projectID {
            selectedProjectID = projects.first?.id
            selectedTaskID = selectedProjectID.flatMap { tasks(for: $0).first?.id }
        }
        persist()
    }

    func updateModel(_ modelID: String) {
        mutateSelectedTask { task in
            task.modelID = modelID
        }
    }

    func updateEffort(_ effort: ReasoningEffort) {
        mutateSelectedTask { task in
            task.reasoningEffort = effort
        }
    }

    func sendComposer() {
        let prompt = composer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, let task = selectedTask, !isSelectedTaskBusy else { return }
        guard let project = project(for: task) else { return }

        composer = ""
        let assistantID = UUID()
        mutateTask(task.id) { item in
            if item.title == "New task" {
                item.title = TaskTitle.suggest(from: prompt)
            }
            item.messages.append(ChatMessage(role: .user, text: prompt))
            item.messages.append(ChatMessage(id: assistantID, role: .assistant, text: ""))
            item.updatedAt = Date()
        }
        activeAssistantIDs[task.id] = assistantID
        taskStates[task.id] = .connecting
        persist()

        let client: GrokACPClient
        if let existing = clients[task.id] {
            client = existing
        } else {
            client = GrokACPClient { [weak self] event in
                guard let self else { return }
                self.handle(event, for: task.id, assistantID: self.activeAssistantIDs[task.id])
            }
            clients[task.id] = client
        }

        let customPath = customExecutablePath.trimmingCharacters(in: .whitespacesAndNewlines)
        let options = AgentConnectionOptions(
            workingDirectory: project.path,
            existingSessionID: task.engineSessionID,
            modelID: task.modelID.isEmpty ? nil : task.modelID,
            customExecutablePath: customPath.isEmpty ? nil : customPath
        )

        Task {
            do {
                try await client.connect(options: options)
                taskStates[task.id] = .streaming
                runtimeStatus = "Grok connected over ACP"
                try await client.send(
                    prompt: prompt,
                    modelID: task.modelID.isEmpty ? nil : task.modelID,
                    effort: task.reasoningEffort
                )
            } catch {
                handle(.failed(error.localizedDescription), for: task.id, assistantID: assistantID)
            }
        }
    }

    func stopSelectedTask() {
        guard let taskID = selectedTaskID, let client = clients[taskID] else { return }
        Task {
            await client.cancel()
            taskStates[taskID] = .idle
            mutateTask(taskID) { task in
                task.messages.append(ChatMessage(role: .system, text: "Turn cancelled."))
            }
            persist()
        }
    }

    func resolvePermission(_ decision: PermissionDecision) {
        guard let permission = pendingPermission, let client = clients[permission.taskID] else { return }
        Task {
            do {
                try await client.resolvePermission(id: permission.id, decision: decision)
                pendingPermission = nil
                taskStates[permission.taskID] = .streaming
            } catch {
                handle(.failed(error.localizedDescription), for: permission.taskID, assistantID: nil)
            }
        }
    }

    func refreshGitSummary() {
        guard let project = selectedProject else {
            gitSummary = "Select a task to inspect its working tree."
            return
        }
        gitSummary = "Refreshing…"
        Task {
            let path = project.path
            let result = await Task.detached(priority: .utility) {
                let status = Self.runProcess("/usr/bin/git", ["status", "--short", "--branch"], at: path)
                let stat = Self.runProcess("/usr/bin/git", ["diff", "--stat"], at: path)
                let diff = Self.runProcess("/usr/bin/git", ["diff", "--", "."], at: path)
                return [status, stat, String(diff.prefix(48_000))]
                    .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                    .joined(separator: "\n\n")
            }.value
            gitSummary = result.isEmpty ? "Working tree clean." : result
        }
    }

    func runTerminalCommand() {
        let command = terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty, !terminalRunning, let project = selectedProject else { return }
        terminalCommand = ""
        terminalRunning = true
        terminalOutput += "\n❯ \(command)\n"

        Task {
            let output = await Task.detached(priority: .userInitiated) {
                Self.runProcess("/bin/zsh", ["-lc", command], at: project.path)
            }.value
            terminalOutput += output + (output.hasSuffix("\n") ? "" : "\n")
            terminalRunning = false
            refreshGitSummary()
        }
    }

    func clearTerminal() {
        terminalOutput = "Nolira Build terminal\n"
    }

    func resetEnginePath() {
        customExecutablePath = ""
        checkRuntime()
    }

    func checkRuntime() {
        let path = customExecutablePath.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates = [
            path.isEmpty ? nil : path,
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".grok/bin/grok").path,
            "/opt/homebrew/bin/grok",
            "/usr/local/bin/grok",
        ].compactMap { $0 }
        if let match = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            runtimeStatus = "Ready · \(match)"
        } else {
            runtimeStatus = "Grok CLI not found"
        }
    }

    func shutdown() {
        for client in clients.values { client.shutdown() }
        clients.removeAll()
        persist()
    }

    private func handle(_ event: AgentEvent, for taskID: UUID, assistantID: UUID?) {
        switch event {
        case let .ready(sessionID, models):
            mutateTask(taskID) { task in task.engineSessionID = sessionID }
            if !models.isEmpty { modelOptions = models }
        case let .messageDelta(text):
            appendToAssistant(taskID: taskID, assistantID: assistantID, text: text, thought: false)
        case let .thoughtDelta(text):
            appendToAssistant(taskID: taskID, assistantID: assistantID, text: text, thought: true)
        case let .toolStarted(tool):
            mutateTask(taskID) { task in
                task.tools.removeAll { $0.id == tool.id }
                task.tools.append(tool)
            }
        case let .toolUpdated(tool):
            mutateTask(taskID) { task in
                if let index = task.tools.firstIndex(where: { $0.id == tool.id }) {
                    task.tools[index] = tool
                } else {
                    task.tools.append(tool)
                }
            }
        case let .plan(steps):
            guard !steps.isEmpty else { break }
            let plan = ToolActivity(
                id: "plan",
                title: "Plan",
                kind: "plan",
                status: .running,
                input: nil,
                output: steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
            )
            mutateTask(taskID) { task in
                task.tools.removeAll { $0.id == "plan" }
                task.tools.append(plan)
            }
        case let .permission(permission):
            pendingPermission = PendingPermission(
                id: permission.id,
                taskID: taskID,
                toolName: permission.toolName,
                summary: permission.summary,
                detail: permission.detail
            )
            taskStates[taskID] = .waitingForApproval
        case let .contextUsage(tokens):
            contextTokens[taskID] = tokens
        case .completed:
            taskStates[taskID] = .idle
            pendingPermission = nil
            activeAssistantIDs.removeValue(forKey: taskID)
            mutateTask(taskID) { task in task.updatedAt = Date() }
            persist()
            refreshGitSummary()
        case let .failed(message):
            taskStates[taskID] = .failed
            pendingPermission = nil
            activeAssistantIDs.removeValue(forKey: taskID)
            mutateTask(taskID) { task in
                if let assistantID,
                   let index = task.messages.firstIndex(where: { $0.id == assistantID }),
                   task.messages[index].text.isEmpty
                {
                    task.messages[index].text = "Unable to complete the turn: \(message)"
                } else {
                    task.messages.append(ChatMessage(role: .system, text: message))
                }
            }
            persist()
        }
    }

    private func appendToAssistant(
        taskID: UUID,
        assistantID: UUID?,
        text: String,
        thought: Bool
    ) {
        mutateTask(taskID) { task in
            let index = assistantID.flatMap { id in task.messages.firstIndex(where: { $0.id == id }) }
                ?? task.messages.lastIndex(where: { $0.role == .assistant })
            if let index {
                if thought { task.messages[index].thought += text }
                else { task.messages[index].text += text }
            } else {
                task.messages.append(
                    ChatMessage(role: .assistant, text: thought ? "" : text, thought: thought ? text : "")
                )
            }
        }
    }

    private func mutateSelectedTask(_ mutation: (inout BuildTask) -> Void) {
        guard let selectedTaskID else { return }
        mutateTask(selectedTaskID, mutation)
        persist()
    }

    private func mutateTask(_ taskID: UUID, _ mutation: (inout BuildTask) -> Void) {
        guard let index = tasks.firstIndex(where: { $0.id == taskID }) else { return }
        mutation(&tasks[index])
    }

    private func load() {
        guard
            let data = try? Data(contentsOf: stateURL),
            let state = try? JSONDecoder.nolira.decode(PersistedState.self, from: data)
        else { return }
        projects = state.projects.filter { FileManager.default.fileExists(atPath: $0.path) }
        let projectIDs = Set(projects.map(\.id))
        tasks = state.tasks.filter { projectIDs.contains($0.projectID) }
        selectedProjectID = state.selectedProjectID.flatMap { projectIDs.contains($0) ? $0 : nil }
        selectedTaskID = state.selectedTaskID.flatMap { id in tasks.contains(where: { $0.id == id }) ? id : nil }
        if selectedTaskID == nil {
            selectedTaskID = tasks.sorted { $0.updatedAt > $1.updatedAt }.first?.id
        }
    }

    private func persist() {
        let snapshot = PersistedState(
            projects: projects,
            tasks: tasks,
            selectedProjectID: selectedProjectID,
            selectedTaskID: selectedTaskID
        )
        guard let data = try? JSONEncoder.nolira.encode(snapshot) else { return }
        do {
            try FileManager.default.createDirectory(
                at: stateURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: stateURL, options: .atomic)
        } catch {
            runtimeStatus = "Could not save app state: \(error.localizedDescription)"
        }
    }

    private static func makeStateURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base
            .appendingPathComponent("NoliraBuildNative", isDirectory: true)
            .appendingPathComponent("state.json")
    }

    nonisolated private static func runProcess(
        _ executable: String,
        _ arguments: [String],
        at directory: String
    ) -> String {
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.currentDirectoryURL = URL(fileURLWithPath: directory, isDirectory: true)
        process.standardOutput = output
        process.standardError = output
        do {
            try process.run()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return error.localizedDescription
        }
    }
}

private extension JSONEncoder {
    static var nolira: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var nolira: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
