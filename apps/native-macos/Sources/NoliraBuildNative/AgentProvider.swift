import Foundation

struct AgentConnectionOptions {
    let workingDirectory: String
    let existingSessionID: String?
    let modelID: String?
    let approvalMode: ApprovalMode
    let customExecutablePath: String?
}

protocol AgentProvider: AnyObject {
    var descriptor: ProviderDescriptor { get }
    var isConnected: Bool { get }

    func connect(options: AgentConnectionOptions) async throws
    func send(
        prompt: String,
        attachments: [PromptAttachment],
        project: WorkspaceProject,
        modelID: String?,
        effort: ReasoningEffort,
        mode: TaskMode
    ) async throws
    func fork(workingDirectory: String, modelID: String?) async throws -> String
    func cancel() async
    func resolvePermission(id: String, decision: PermissionDecision) async throws
    func shutdown()
}

enum ProviderCatalog {
    static let grok = ProviderDescriptor(
        id: "grok",
        name: "Grok Build",
        detail: "Local Grok CLI over Agent Client Protocol",
        transport: "ACP · stdio",
        capabilities: [
            .streaming, .tools, .permissions, .attachments, .images,
            .planMode, .fork, .artifacts, .resume, .models,
        ],
        isAvailable: true
    )

    static let futureProvider = ProviderDescriptor(
        id: "acp-custom",
        name: "Custom ACP provider",
        detail: "Reserved for another ACP-compatible coding agent",
        transport: "ACP · configurable",
        capabilities: [.streaming, .tools, .permissions, .resume],
        isAvailable: false
    )

    static let all = [grok, futureProvider]
}

enum AgentProviderError: LocalizedError {
    case executableNotFound
    case processUnavailable
    case invalidResponse(String)
    case rpc(code: Int, message: String)
    case disconnected

    var errorDescription: String? {
        switch self {
        case .executableNotFound:
            "Grok CLI not found. Install Grok or choose its executable in Settings."
        case .processUnavailable:
            "The Grok agent process is unavailable."
        case let .invalidResponse(detail):
            "Invalid ACP response: \(detail)"
        case let .rpc(code, message):
            "Grok ACP error \(code): \(message)"
        case .disconnected:
            "The Grok agent process exited."
        }
    }

    var isMethodNotFound: Bool {
        guard case let .rpc(code, message) = self else { return false }
        return code == -32601 || message.localizedCaseInsensitiveContains("method not found")
    }
}
