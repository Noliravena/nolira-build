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
        XCTAssertTrue(capabilities.contains(.resume))
    }
}
