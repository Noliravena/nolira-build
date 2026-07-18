// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "NoliraBuildNative",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "NoliraBuildNative", targets: ["NoliraBuildNative"]),
    ],
    targets: [
        .executableTarget(
            name: "NoliraBuildNative",
            path: "Sources/NoliraBuildNative"
        ),
        .testTarget(
            name: "NoliraBuildNativeTests",
            dependencies: ["NoliraBuildNative"],
            path: "Tests/NoliraBuildNativeTests"
        ),
    ]
)
