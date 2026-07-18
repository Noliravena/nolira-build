import Foundation

enum ProviderCapability: String, Codable, CaseIterable {
    case streaming
    case tools
    case permissions
    case attachments
    case resume
    case models
}

struct ProviderDescriptor: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let detail: String
    let transport: String
    let capabilities: Set<ProviderCapability>
    let isAvailable: Bool
}

struct WorkspaceProject: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var path: String
    let createdAt: Date
}

enum BuildTaskState: String, Codable {
    case idle
    case connecting
    case streaming
    case waitingForApproval
    case failed
}

enum MessageRole: String, Codable {
    case user
    case assistant
    case system
}

struct ChatMessage: Identifiable, Codable, Hashable {
    let id: UUID
    let role: MessageRole
    var text: String
    var thought: String
    let createdAt: Date

    init(
        id: UUID = UUID(),
        role: MessageRole,
        text: String,
        thought: String = "",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.thought = thought
        self.createdAt = createdAt
    }
}

enum ToolStatus: String, Codable {
    case pending
    case running
    case completed
    case failed
    case cancelled
}

struct ToolActivity: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var kind: String
    var status: ToolStatus
    var input: String?
    var output: String?
}

struct BuildTask: Identifiable, Codable, Hashable {
    let id: UUID
    let projectID: UUID
    var title: String
    var providerID: String
    var modelID: String
    var reasoningEffort: ReasoningEffort
    var engineSessionID: String?
    var messages: [ChatMessage]
    var tools: [ToolActivity]
    let createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        projectID: UUID,
        title: String = "New task",
        providerID: String = "grok",
        modelID: String = "",
        reasoningEffort: ReasoningEffort = .medium,
        engineSessionID: String? = nil,
        messages: [ChatMessage] = [],
        tools: [ToolActivity] = [],
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.providerID = providerID
        self.modelID = modelID
        self.reasoningEffort = reasoningEffort
        self.engineSessionID = engineSessionID
        self.messages = messages
        self.tools = tools
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

enum ReasoningEffort: String, Codable, CaseIterable, Identifiable {
    case low
    case medium
    case high
    case xhigh

    var id: String { rawValue }

    var label: String {
        switch self {
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        case .xhigh: "Extra high"
        }
    }
}

struct PendingPermission: Identifiable, Hashable {
    let id: String
    let taskID: UUID
    let toolName: String
    let summary: String
    let detail: String?
}

struct ModelOption: Identifiable, Codable, Hashable {
    let id: String
    let name: String
}

struct PersistedState: Codable {
    var projects: [WorkspaceProject]
    var tasks: [BuildTask]
    var selectedProjectID: UUID?
    var selectedTaskID: UUID?
}

enum PermissionDecision: String {
    case allowOnce
    case allowSession
    case deny

    var acpOptionID: String {
        switch self {
        case .allowOnce: "allow-once"
        case .allowSession: "allow-always"
        case .deny: "reject-once"
        }
    }
}

enum AgentEvent {
    case ready(sessionID: String, models: [ModelOption])
    case messageDelta(String)
    case thoughtDelta(String)
    case toolStarted(ToolActivity)
    case toolUpdated(ToolActivity)
    case plan([String])
    case permission(PendingPermission)
    case contextUsage(Int)
    case completed
    case failed(String)
}

enum TaskTitle {
    static func suggest(from prompt: String) -> String {
        let compact = prompt
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !compact.isEmpty else { return "New task" }
        if compact.count <= 42 { return compact }
        let end = compact.index(compact.startIndex, offsetBy: 41)
        return String(compact[...end]) + "…"
    }
}
