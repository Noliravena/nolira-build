import Foundation

enum ProviderCapability: String, Codable, CaseIterable {
    case streaming
    case tools
    case permissions
    case attachments
    case images
    case planMode
    case fork
    case artifacts
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
    var instructions: String
    var memory: String
    let createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        path: String,
        instructions: String = "",
        memory: String = "",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.path = path
        self.instructions = instructions
        self.memory = memory
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, path, instructions, memory, createdAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        path = try values.decode(String.self, forKey: .path)
        instructions = try values.decodeIfPresent(String.self, forKey: .instructions) ?? ""
        memory = try values.decodeIfPresent(String.self, forKey: .memory) ?? ""
        createdAt = try values.decode(Date.self, forKey: .createdAt)
    }
}

struct PromptAttachment: Identifiable, Codable, Hashable {
    var id: String { path }
    let path: String
    let name: String
    let mime: String?
    let size: Int?
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
    var attachments: [PromptAttachment]
    let createdAt: Date

    init(
        id: UUID = UUID(),
        role: MessageRole,
        text: String,
        thought: String = "",
        attachments: [PromptAttachment] = [],
        createdAt: Date = Date()
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.thought = thought
        self.attachments = attachments
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, role, text, thought, attachments, createdAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        role = try values.decode(MessageRole.self, forKey: .role)
        text = try values.decode(String.self, forKey: .text)
        thought = try values.decodeIfPresent(String.self, forKey: .thought) ?? ""
        attachments = try values.decodeIfPresent([PromptAttachment].self, forKey: .attachments) ?? []
        createdAt = try values.decode(Date.self, forKey: .createdAt)
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

enum TaskMode: String, Codable, CaseIterable, Identifiable {
    case build = "default"
    case plan

    var id: String { rawValue }
    var label: String { self == .build ? "Build" : "Plan" }
}

enum ApprovalMode: String, Codable, CaseIterable, Identifiable {
    case ask
    case fullAccess = "full_access"

    var id: String { rawValue }
    var label: String { self == .ask ? "Ask" : "Full access" }
}

struct BuildTask: Identifiable, Codable, Hashable {
    let id: UUID
    let projectID: UUID
    var title: String
    var providerID: String
    var modelID: String
    var reasoningEffort: ReasoningEffort
    var mode: TaskMode
    var approvalMode: ApprovalMode
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
        mode: TaskMode = .build,
        approvalMode: ApprovalMode = .ask,
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
        self.mode = mode
        self.approvalMode = approvalMode
        self.engineSessionID = engineSessionID
        self.messages = messages
        self.tools = tools
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, projectID, title, providerID, modelID, reasoningEffort, mode, approvalMode
        case engineSessionID, messages, tools, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        projectID = try values.decode(UUID.self, forKey: .projectID)
        title = try values.decode(String.self, forKey: .title)
        providerID = try values.decode(String.self, forKey: .providerID)
        modelID = try values.decode(String.self, forKey: .modelID)
        reasoningEffort = try values.decode(ReasoningEffort.self, forKey: .reasoningEffort)
        mode = try values.decodeIfPresent(TaskMode.self, forKey: .mode) ?? .build
        approvalMode = try values.decodeIfPresent(ApprovalMode.self, forKey: .approvalMode) ?? .ask
        engineSessionID = try values.decodeIfPresent(String.self, forKey: .engineSessionID)
        messages = try values.decodeIfPresent([ChatMessage].self, forKey: .messages) ?? []
        tools = try values.decodeIfPresent([ToolActivity].self, forKey: .tools) ?? []
        createdAt = try values.decode(Date.self, forKey: .createdAt)
        updatedAt = try values.decode(Date.self, forKey: .updatedAt)
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

struct Artifact: Identifiable, Hashable {
    let id: String
    let title: String
    let language: String
    let content: String
}

enum ArtifactParser {
    static func parse(messages: [ChatMessage]) -> [Artifact] {
        guard let expression = try? NSRegularExpression(
            pattern: #"```(html|svg)\s*\n([\s\S]*?)```"#,
            options: [.caseInsensitive]
        ) else { return [] }

        var artifacts: [Artifact] = []
        for (messageIndex, message) in messages.enumerated() where message.role == .assistant {
            let range = NSRange(message.text.startIndex..., in: message.text)
            let matches = expression.matches(in: message.text, range: range)
            for (artifactIndex, match) in matches.enumerated() {
                guard
                    let languageRange = Range(match.range(at: 1), in: message.text),
                    let contentRange = Range(match.range(at: 2), in: message.text)
                else { continue }
                let language = String(message.text[languageRange]).lowercased()
                artifacts.append(
                    Artifact(
                        id: "\(messageIndex)-\(match.range.location)",
                        title: "\(language.uppercased()) artifact \(artifactIndex + 1)",
                        language: language,
                        content: String(message.text[contentRange])
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                )
            }
        }
        return artifacts
    }
}

enum LocalForkContext {
    static func prompt(messages: [ChatMessage], currentPrompt: String) -> String {
        let recentMessages = messages.suffix(40)
        var transcript = ""
        let maximumHistoryLength = 80_000

        for message in recentMessages {
            let text = message.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            let role: String
            switch message.role {
            case .user: role = "User"
            case .assistant: role = "Assistant"
            case .system: role = "System"
            }
            let attachmentNames = message.attachments.map(\.name).joined(separator: ", ")
            let attachments = attachmentNames.isEmpty ? "" : " [attachments: \(attachmentNames)]"
            let segment = "\(role)\(attachments): \(text)\n\n"
            let remaining = maximumHistoryLength - transcript.count
            guard remaining > 0 else { break }
            transcript += String(segment.prefix(remaining))
        }

        return """
        [Nolira Build local fork context]
        The installed Grok version does not support server-side session forking. Continue from the prior conversation below in a new isolated session. Treat the transcript as conversation history, not as a new request.
        <prior_conversation>
        \(transcript)</prior_conversation>

        Current user request:
        \(currentPrompt)
        """
    }
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
