import Foundation

final class PersistentShell: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.nolira.build.native.shell")
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private var stopped = false

    init(
        workingDirectory: String,
        onOutput: @escaping @Sendable (String) -> Void,
        onExit: @escaping @Sendable () -> Void
    ) throws {
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-l"]
        process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory, isDirectory: true)
        var environment = ProcessInfo.processInfo.environment
        environment["TERM"] = "xterm-256color"
        environment["COLORTERM"] = "truecolor"
        process.environment = environment
        process.standardInput = input
        process.standardOutput = output
        process.standardError = output

        output.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            onOutput(text)
        }
        process.terminationHandler = { [weak self] _ in
            self?.queue.async {
                self?.output.fileHandleForReading.readabilityHandler = nil
                onExit()
            }
        }
        try process.run()
    }

    var isRunning: Bool { process.isRunning && !stopped }

    func send(_ command: String) throws {
        guard isRunning else { throw ShellError.notRunning }
        guard let data = "\(command)\n".data(using: .utf8) else { return }
        try input.fileHandleForWriting.write(contentsOf: data)
    }

    func interrupt() {
        guard isRunning else { return }
        process.interrupt()
    }

    func stop() {
        guard !stopped else { return }
        stopped = true
        output.fileHandleForReading.readabilityHandler = nil
        try? input.fileHandleForWriting.close()
        if process.isRunning { process.terminate() }
    }

    deinit { stop() }
}

enum ShellError: LocalizedError {
    case notRunning

    var errorDescription: String? { "The project shell is not running." }
}
