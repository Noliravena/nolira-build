import XCTest
@testable import NoliraBuildNative

final class DomainTests: XCTestCase {
    func testTaskTitleUsesPromptAndClampsLongInput() {
        XCTAssertEqual(TaskTitle.suggest(from: "  Fix   the login flow  "), "Fix the login flow")

        let title = TaskTitle.suggest(from: String(repeating: "a", count: 80))
        XCTAssertEqual(title.count, 43)
        XCTAssertTrue(title.hasSuffix("…"))
    }

    func testPermissionDecisionsMatchGrokACPOptions() {
        XCTAssertEqual(PermissionDecision.allowOnce.acpOptionID, "allow-once")
        XCTAssertEqual(PermissionDecision.allowSession.acpOptionID, "allow-always")
        XCTAssertEqual(PermissionDecision.deny.acpOptionID, "reject-once")
    }

    func testGrokProviderAdvertisesRequiredCoreCapabilities() {
        let capabilities = ProviderCatalog.grok.capabilities
        XCTAssertTrue(capabilities.contains(.streaming))
        XCTAssertTrue(capabilities.contains(.tools))
        XCTAssertTrue(capabilities.contains(.permissions))
        XCTAssertTrue(capabilities.contains(.attachments))
        XCTAssertTrue(capabilities.contains(.images))
        XCTAssertTrue(capabilities.contains(.planMode))
        XCTAssertTrue(capabilities.contains(.fork))
        XCTAssertTrue(capabilities.contains(.resume))
    }

    func testArtifactParserFindsHTMLAndSVGBlocks() {
        let message = ChatMessage(
            role: .assistant,
            text: """
            Prototype:
            ```html
            <button>Hello</button>
            ```
            ```svg
            <svg><circle r="4" /></svg>
            ```
            """
        )
        let artifacts = ArtifactParser.parse(messages: [message])
        XCTAssertEqual(artifacts.map(\.language), ["html", "svg"])
        XCTAssertTrue(artifacts[0].content.contains("button"))
    }

    func testLocalForkContextReplaysConversation() {
        let prompt = LocalForkContext.prompt(
            messages: [ChatMessage(role: .assistant, text: "The build is green.")],
            currentPrompt: "Now add tests."
        )
        XCTAssertTrue(prompt.contains("Assistant: The build is green."))
        XCTAssertTrue(prompt.hasSuffix("Current user request:\nNow add tests."))
    }

    func testMethodNotFoundDetection() {
        XCTAssertTrue(AgentProviderError.rpc(code: -32601, message: "Method not found").isMethodNotFound)
        XCTAssertFalse(AgentProviderError.disconnected.isMethodNotFound)
    }
}
