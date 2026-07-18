import AppKit
import Foundation
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class AppStore: ObservableObject {
    enum InspectorTab: String, CaseIterable, Identifiable {
        case changes
        case terminal
        case artifacts

        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    @Published private(set) var projects: [WorkspaceProject] = []
    @Published private(set) var tasks: [BuildTask] = []
    @Published var selectedProjectID: UUID?
    @Published var selectedTaskID: UUID?
    @Published var composer = ""
    @Published var composerAttachments: [PromptAttachment] = []
    @Published var taskStates: [UUID: BuildTaskState] = [:]
    @Published var pendingPermission: PendingPermission?
    @Published var modelOptions = [ModelOption(id: "", name: "Grok default")]
    @Published var contextTokens: [UUID: Int] = [:]
    @Published var inspectorVisible = true
    @Published var inspectorTab: InspectorTab = .changes
    @Published var gitSummary = "Select a task to inspect its working tree."
    @Published var terminalCommand = ""
    @Published private(set) var terminalOutputs: [UUID: String] = [:]
    @Published private(set) var terminalRunningIDs: Set<UUID> = []
    @Published var projectContextPresented = false
    @Published var contextProjectID: UUID?
    @Published var projectInstructionsDraft = ""
    @Published var projectMemoryDraft = ""
    @Published var selectedArtifactID: String?
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
    private var terminalSessions: [UUID: PersistentShell] = [:]
    private let stateURL: URL
    private static let enginePathKey = "nolira.native.customEnginePath"
    private static let maxAttachmentBytes = 25 * 1_024 * 1_024

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

    var contextProject: WorkspaceProject? {
        guard let contextProjectID else { return nil }
        return projects.first(where: { $0.id == contextProjectID })
    }

    var selectedTaskState: BuildTaskState {
        guard let selectedTaskID else { return .idle }
        return taskStates[selectedTaskID] ?? .idle
    }

    var isSelectedTaskBusy: Bool {
        [.connecting, .streaming, .waitingForApproval].contains(selectedTaskState)
    }

    var terminalOutput: String {
        guard let selectedTaskID else { return "Nolira Build persistent terminal\n" }
        return terminalOutputs[selectedTaskID] ?? "Nolira Build persistent terminal\n"
    }

    var terminalRunning: Bool {
        selectedTaskID.map { terminalRunningIDs.contains($0) } ?? false
    }

    var selectedArtifacts: [Artifact] {
        ArtifactParser.parse(messages: selectedTask?.messages ?? [])
    }

    var selectedArtifact: Artifact? {
        selectedArtifacts.first(where: { $0.id == selectedArtifactID }) ?? selectedArtifacts.first
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
        composerAttachments = []
        pendingPermission = nil
        selectedArtifactID = selectedArtifacts.first?.id
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
            name: url.lastPathComponent.isEmpty ? path : url.lastPathComponent,
            path: path
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
        } else {
            _ = addProjectWithPicker()
        }
    }

    func createTask(in projectID: UUID) {
        let item = BuildTask(projectID: projectID)
        tasks.append(item)
        selectedProjectID = projectID
        selectedTaskID = item.id
        taskStates[item.id] = .idle
        composerAttachments = []
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
        terminalSessions.removeValue(forKey: taskID)?.stop()
        guard let removed = tasks.first(where: { $0.id == taskID }) else { return }
        tasks.removeAll { $0.id == taskID }
        taskStates.removeValue(forKey: taskID)
        contextTokens.removeValue(forKey: taskID)
        terminalOutputs.removeValue(forKey: taskID)
        terminalRunningIDs.remove(taskID)
        if selectedTaskID == taskID {
            selectedTaskID = tasks(for: removed.projectID).first?.id
        }
        persist()
    }

    func deleteProject(_ projectID: UUID) {
        let taskIDs = tasks.filter { $0.projectID == projectID }.map(\.id)
        for taskID in taskIDs {
            clients.removeValue(forKey: taskID)?.shutdown()
            terminalSessions.removeValue(forKey: taskID)?.stop()
            taskStates.removeValue(forKey: taskID)
            terminalOutputs.removeValue(forKey: taskID)
            terminalRunningIDs.remove(taskID)
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
        mutateSelectedTask { $0.modelID = modelID }
    }

    func updateEffort(_ effort: ReasoningEffort) {
        mutateSelectedTask { $0.reasoningEffort = effort }
    }

    func updateMode(_ mode: TaskMode) {
        mutateSelectedTask { $0.mode = mode }
    }

    func updateApprovalMode(_ mode: ApprovalMode) {
        guard let selectedTaskID, selectedTask?.approvalMode != mode else { return }
        clients.removeValue(forKey: selectedTaskID)?.shutdown()
        mutateSelectedTask { $0.approvalMode = mode }
    }

    func chooseAttachments() {
        let panel = NSOpenPanel()
        panel.title = "Attach files or images"
        panel.prompt = "Attach"
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }

        var additions: [PromptAttachment] = []
        for url in panel.urls.prefix(20) {
            guard
                let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
                values.isRegularFile == true
            else { continue }
            let size = values.fileSize ?? 0
            guard size <= Self.maxAttachmentBytes else {
                runtimeStatus = "Attachment \(url.lastPathComponent) exceeds 25 MB"
                continue
            }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            additions.append(
                PromptAttachment(
                    path: url.standardizedFileURL.path,
                    name: url.lastPathComponent,
                    mime: mime,
                    size: size
                )
            )
        }
        let existing = Set(composerAttachments.map(\.path))
        composerAttachments.append(contentsOf: additions.filter { !existing.contains($0.path) })
    }

    func removeAttachment(_ attachment: PromptAttachment) {
        composerAttachments.removeAll { $0.path == attachment.path }
    }

    func openProjectContext(_ projectID: UUID) {
        guard let project = projects.first(where: { $0.id == projectID }) else { return }
        contextProjectID = projectID
        projectInstructionsDraft = project.instructions
        projectMemoryDraft = project.memory
        projectContextPresented = true
    }

    func saveProjectContext() {
        guard
            let contextProjectID,
            let index = projects.firstIndex(where: { $0.id == contextProjectID })
        else { return }
        projects[index].instructions = projectInstructionsDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        projects[index].memory = projectMemoryDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        projectContextPresented = false
        persist()
    }

    func sendComposer() {
        let prompt = composer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let task = selectedTask, (!prompt.isEmpty || !composerAttachments.isEmpty), !isSelectedTaskBusy else {
            return
        }
        if prompt == "/plan" {
            composer = ""
            updateMode(task.mode == .plan ? .build : .plan)
            return
        }
        if prompt == "/fork" {
            composer = ""
            forkSelectedTask()
            return
        }
        if prompt == "/review" {
            composer = ""
            reviewCurrentChanges()
            return
        }
        if prompt == "/terminal" {
            composer = ""
            inspectorVisible = true
            inspectorTab = .terminal
            return
        }
        guard let project = project(for: task) else { return }

        let attachments = composerAttachments
        let agentPrompt = task.engineSessionID == nil && !task.messages.isEmpty
            ? LocalForkContext.prompt(messages: task.messages, currentPrompt: prompt)
            : prompt
        composer = ""
        composerAttachments = []
        let assistantID = UUID()
        mutateTask(task.id) { item in
            if item.title == "New task" {
                let source = prompt.isEmpty ? "Inspect \(attachments.first?.name ?? "attachment")" : prompt
                item.title = TaskTitle.suggest(from: source)
            }
            item.messages.append(ChatMessage(role: .user, text: prompt, attachments: attachments))
            item.messages.append(ChatMessage(id: assistantID, role: .assistant, text: ""))
            item.updatedAt = Date()
        }
        activeAssistantIDs[task.id] = assistantID
        taskStates[task.id] = .connecting
        persist()

        let client = client(for: task.id)
        let options = connectionOptions(task: task, project: project)
        Task {
            do {
                try await client.connect(options: options)
                taskStates[task.id] = .streaming
                runtimeStatus = "Grok connected over ACP"
                try await client.send(
                    prompt: agentPrompt,
                    attachments: attachments,
                    project: project,
                    modelID: task.modelID.isEmpty ? nil : task.modelID,
                    effort: task.reasoningEffort,
                    mode: task.mode
                )
            } catch {
                handle(.failed(error.localizedDescription), for: task.id, assistantID: assistantID)
            }
        }
    }

    func reviewCurrentChanges() {
        guard !isSelectedTaskBusy else { return }
        inspectorVisible = true
        inspectorTab = .changes
        composer = "Review the current working tree without editing files. Focus on correctness, regressions, security, data loss, and missing tests. Report concrete findings ordered by severity with file paths and line references."
        sendComposer()
    }

    func forkSelectedTask() {
        guard let task = selectedTask, let project = project(for: task), !isSelectedTaskBusy else { return }
        taskStates[task.id] = .connecting
        let activeClient = clients[task.id].flatMap { $0.isConnected ? $0 : nil }
        Task {
            do {
                let sessionID: String?
                if let activeClient {
                    do {
                        sessionID = try await activeClient.fork(
                            workingDirectory: project.path,
                            modelID: task.modelID.isEmpty ? nil : task.modelID
                        )
                    } catch let error as AgentProviderError where error.isMethodNotFound {
                        sessionID = nil
                        runtimeStatus = "This Grok version uses a local context fork."
                    }
                } else {
                    sessionID = nil
                    runtimeStatus = "Created an isolated local context fork."
                }
                let now = Date()
                let fork = BuildTask(
                    projectID: task.projectID,
                    title: "\(task.title) · fork",
                    providerID: task.providerID,
                    modelID: task.modelID,
                    reasoningEffort: task.reasoningEffort,
                    mode: task.mode,
                    approvalMode: task.approvalMode,
                    engineSessionID: sessionID,
                    messages: task.messages,
                    createdAt: now,
                    updatedAt: now
                )
                tasks.append(fork)
                taskStates[task.id] = .idle
                taskStates[fork.id] = .idle
                selectedTaskID = fork.id
                selectedProjectID = fork.projectID
                persist()
            } catch {
                taskStates[task.id] = .failed
                runtimeStatus = error.localizedDescription
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
                let staged = Self.runProcess("/usr/bin/git", ["diff", "--cached", "--", "."], at: path)
                let diff = Self.runProcess("/usr/bin/git", ["diff", "--", "."], at: path)
                return [status, stat, String(staged.prefix(30_000)), String(diff.prefix(48_000))]
                    .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                    .joined(separator: "\n\n")
            }.value
            gitSummary = result.isEmpty ? "Working tree clean." : result
        }
    }

    func stageAllChanges() {
        guard let project = selectedProject else { return }
        Task {
            _ = await Task.detached {
                Self.runProcess("/usr/bin/git", ["add", "--all"], at: project.path)
            }.value
            refreshGitSummary()
        }
    }

    func unstageAllChanges() {
        guard let project = selectedProject else { return }
        Task {
            _ = await Task.detached {
                Self.runProcess("/usr/bin/git", ["restore", "--staged", "."], at: project.path)
            }.value
            refreshGitSummary()
        }
    }

    func runTerminalCommand() {
        let command = terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty, let task = selectedTask, let project = selectedProject else { return }
        terminalCommand = ""
        terminalOutputs[task.id, default: "Nolira Build persistent terminal\n"] += "\n❯ \(command)\n"
        do {
            let shell = try shell(for: task.id, project: project)
            try shell.send(command)
        } catch {
            terminalOutputs[task.id, default: ""] += "\(error.localizedDescription)\n"
            terminalRunningIDs.remove(task.id)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            self?.refreshGitSummary()
        }
    }

    func interruptTerminal() {
        guard let selectedTaskID else { return }
        terminalSessions[selectedTaskID]?.interrupt()
    }

    func stopTerminal() {
        guard let selectedTaskID else { return }
        terminalSessions.removeValue(forKey: selectedTaskID)?.stop()
        terminalRunningIDs.remove(selectedTaskID)
    }

    func clearTerminal() {
        guard let selectedTaskID else { return }
        terminalOutputs[selectedTaskID] = "Nolira Build persistent terminal\n"
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
        for terminal in terminalSessions.values { terminal.stop() }
        clients.removeAll()
        terminalSessions.removeAll()
        terminalRunningIDs.removeAll()
        persist()
    }

    private func client(for taskID: UUID) -> GrokACPClient {
        if let existing = clients[taskID] { return existing }
        let client = GrokACPClient { [weak self] event in
            guard let self else { return }
            self.handle(event, for: taskID, assistantID: self.activeAssistantIDs[taskID])
        }
        clients[taskID] = client
        return client
    }

    private func connectionOptions(
        task: BuildTask,
        project: WorkspaceProject
    ) -> AgentConnectionOptions {
        let customPath = customExecutablePath.trimmingCharacters(in: .whitespacesAndNewlines)
        return AgentConnectionOptions(
            workingDirectory: project.path,
            existingSessionID: task.engineSessionID,
            modelID: task.modelID.isEmpty ? nil : task.modelID,
            approvalMode: task.approvalMode,
            customExecutablePath: customPath.isEmpty ? nil : customPath
        )
    }

    private func shell(for taskID: UUID, project: WorkspaceProject) throws -> PersistentShell {
        if let existing = terminalSessions[taskID], existing.isRunning { return existing }
        terminalSessions.removeValue(forKey: taskID)?.stop()
        let shell = try PersistentShell(
            workingDirectory: project.path,
            onOutput: { [weak self] text in
                Task { @MainActor in
                    guard let self else { return }
                    let output = "\(self.terminalOutputs[taskID] ?? "")\(text)"
                    self.terminalOutputs[taskID] = String(output.suffix(240_000))
                }
            },
            onExit: { [weak self] in
                Task { @MainActor in
                    self?.terminalSessions.removeValue(forKey: taskID)
                    self?.terminalRunningIDs.remove(taskID)
                }
            }
        )
        terminalSessions[taskID] = shell
        terminalRunningIDs.insert(taskID)
        return shell
    }

    private func handle(_ event: AgentEvent, for taskID: UUID, assistantID: UUID?) {
        switch event {
        case let .ready(sessionID, models):
            mutateTask(taskID) { $0.engineSessionID = sessionID }
            if !models.isEmpty { modelOptions = models }
            persist()
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
            mutateTask(taskID) { $0.updatedAt = Date() }
            selectedArtifactID = selectedArtifacts.first?.id
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
        selectedTaskID = state.selectedTaskID.flatMap { id in
            tasks.contains(where: { $0.id == id }) ? id : nil
        }
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
