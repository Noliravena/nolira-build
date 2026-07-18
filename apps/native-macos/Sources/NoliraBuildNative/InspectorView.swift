import AppKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct InspectorView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            inspectorHeader
            switch store.inspectorTab {
            case .changes:
                changesView
            case .terminal:
                terminalView
            case .artifacts:
                artifactsView
            }
        }
        .background(NoliraTheme.chrome.opacity(0.87))
    }

    private var inspectorHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionEyebrow(title: "Inspector")
                if store.inspectorTab != .artifacts {
                    Button {
                        if store.inspectorTab == .changes { store.refreshGitSummary() }
                        else { store.clearTerminal() }
                    } label: {
                        Image(systemName: store.inspectorTab == .changes ? "arrow.clockwise" : "trash")
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(NoliraTheme.softText)
                            .frame(width: 25, height: 25)
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain)
                    .help(store.inspectorTab == .changes ? "Refresh changes" : "Clear terminal")
                }
            }

            HStack(spacing: 4) {
                InspectorTabButton(
                    title: "Changes",
                    icon: "point.3.connected.trianglepath.dotted",
                    selected: store.inspectorTab == .changes
                ) { store.inspectorTab = .changes }
                InspectorTabButton(
                    title: "Terminal",
                    icon: "terminal",
                    selected: store.inspectorTab == .terminal
                ) { store.inspectorTab = .terminal }
                InspectorTabButton(
                    title: "Artifacts",
                    icon: "sparkles.rectangle.stack",
                    selected: store.inspectorTab == .artifacts,
                    count: store.selectedArtifacts.count
                ) { store.inspectorTab = .artifacts }
            }
            .padding(3)
            .background(Color.black.opacity(0.17), in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.045)) }
        }
        .padding(.horizontal, 11)
        .padding(.top, 36)
        .padding(.bottom, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(NoliraTheme.separator).frame(height: 1)
        }
    }

    private var changesView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Button {
                    store.reviewCurrentChanges()
                } label: {
                    Label("Review", systemImage: "checklist")
                }
                .buttonStyle(.borderedProminent)
                .tint(NoliraTheme.purple)

                Button("Stage all") { store.stageAllChanges() }
                    .buttonStyle(.bordered)
                Button("Unstage") { store.unstageAllChanges() }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .font(.system(size: 10.5, weight: .medium, design: .rounded))
            .controlSize(.small)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)

            Rectangle().fill(NoliraTheme.separator).frame(height: 1)

            ScrollView([.horizontal, .vertical]) {
                Text(store.gitSummary)
                    .font(.system(size: 11, design: .monospaced))
                    .lineSpacing(3)
                    .foregroundStyle(Color.white.opacity(0.72))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(13)
            }
            .background(NoliraTheme.terminal.opacity(0.78))
            .overlay(alignment: .topLeading) {
                HStack(spacing: 5) {
                    Circle().fill(Color.red.opacity(0.65)).frame(width: 6, height: 6)
                    Circle().fill(NoliraTheme.warning.opacity(0.65)).frame(width: 6, height: 6)
                    Circle().fill(NoliraTheme.green.opacity(0.65)).frame(width: 6, height: 6)
                }
                .padding(8)
                .allowsHitTesting(false)
                .opacity(store.gitSummary.isEmpty ? 1 : 0)
            }
        }
    }

    private var terminalView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                StatusDot(
                    color: store.terminalRunning ? NoliraTheme.green : Color.white.opacity(0.22),
                    pulsing: store.terminalRunning
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(store.terminalRunning ? "Persistent shell" : "Shell is idle")
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                    Text(store.terminalRunning ? "Session state is preserved" : "Starts on first command")
                        .font(.system(size: 9.5, design: .rounded))
                        .foregroundStyle(NoliraTheme.faintText)
                }
                Spacer()
                Button("⌃C") { store.interruptTerminal() }
                    .buttonStyle(.bordered)
                Button("Stop") { store.stopTerminal() }
                    .buttonStyle(.bordered)
            }
            .controlSize(.mini)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)

            Rectangle().fill(NoliraTheme.separator).frame(height: 1)

            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    Text(store.terminalOutput)
                        .font(.system(size: 11, design: .monospaced))
                        .lineSpacing(3)
                        .foregroundStyle(Color(red: 0.76, green: 0.83, blue: 0.86))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(12)
                        .id("terminal-bottom")
                }
                .background(NoliraTheme.terminal)
                .onChange(of: store.terminalOutput) {
                    proxy.scrollTo("terminal-bottom", anchor: .bottom)
                }
            }

            Rectangle().fill(NoliraTheme.separator).frame(height: 1)

            HStack(spacing: 7) {
                Text("❯")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(NoliraTheme.purple)
                TextField("Run in project shell", text: $store.terminalCommand)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11.5, design: .monospaced))
                    .onSubmit { store.runTerminalCommand() }
                ShortcutKey(text: "↩")
                Button { store.runTerminalCommand() } label: {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(NoliraTheme.purple.opacity(0.72), in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(Color.black.opacity(0.16))
        }
    }

    @ViewBuilder
    private var artifactsView: some View {
        if let artifact = store.selectedArtifact {
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(store.selectedArtifacts) { item in
                            Button {
                                store.selectedArtifactID = item.id
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: item.language == "svg" ? "scribble.variable" : "chevron.left.forwardslash.chevron.right")
                                    Text(item.title)
                                }
                                .font(.system(size: 10.5, weight: .medium, design: .rounded))
                                .foregroundStyle(item.id == artifact.id ? .white : NoliraTheme.softText)
                                .padding(.horizontal, 9)
                                .frame(height: 27)
                                .background(
                                    item.id == artifact.id ? NoliraTheme.purple.opacity(0.18) : Color.white.opacity(0.035),
                                    in: RoundedRectangle(cornerRadius: 7)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(8)
                }

                Rectangle().fill(NoliraTheme.separator).frame(height: 1)

                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(artifact.language.uppercased())
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .tracking(1)
                            .foregroundStyle(NoliraTheme.purple)
                        Text("Sandboxed preview")
                            .font(.system(size: 9.5, design: .rounded))
                            .foregroundStyle(NoliraTheme.faintText)
                    }
                    Spacer()
                    Button("Copy") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(artifact.content, forType: .string)
                    }
                    Button("Save") { save(artifact) }
                        .buttonStyle(.borderedProminent)
                        .tint(NoliraTheme.purple)
                }
                .controlSize(.small)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)

                Rectangle().fill(NoliraTheme.separator).frame(height: 1)

                ArtifactWebView(artifact: artifact)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(8)

                DisclosureGroup("Source") {
                    ScrollView([.horizontal, .vertical]) {
                        Text(artifact.content)
                            .font(.system(size: 10.5, design: .monospaced))
                            .foregroundStyle(NoliraTheme.softText)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                            .padding(8)
                    }
                    .frame(maxHeight: 190)
                    .background(NoliraTheme.terminal, in: RoundedRectangle(cornerRadius: 8))
                }
                .font(.system(size: 10.5, weight: .medium, design: .rounded))
                .padding(8)
            }
        } else {
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(NoliraTheme.purple.opacity(0.16))
                        .frame(width: 74, height: 74)
                        .blur(radius: 18)
                    Image(systemName: "sparkles.rectangle.stack")
                        .font(.system(size: 27, weight: .light))
                        .foregroundStyle(NoliraTheme.purple)
                }
                Text("No artifacts yet")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                Text("Ask Grok for an HTML or SVG prototype.\nFenced output appears here live.")
                    .font(.system(size: 10.5, design: .rounded))
                    .lineSpacing(3)
                    .foregroundStyle(NoliraTheme.softText)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(NoliraTheme.canvas.opacity(0.46))
        }
    }

    private func save(_ artifact: Artifact) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "artifact.\(artifact.language == "svg" ? "svg" : "html")"
        panel.allowedContentTypes = artifact.language == "svg" ? [.svg] : [.html]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? artifact.content.write(to: url, atomically: true, encoding: .utf8)
    }
}

private struct InspectorTabButton: View {
    let title: String
    let icon: String
    let selected: Bool
    var count = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 9.5, weight: .semibold))
                Text(title)
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 8.5, weight: .bold, design: .monospaced))
                        .foregroundStyle(NoliraTheme.purple)
                }
            }
            .foregroundStyle(selected ? .white : NoliraTheme.faintText)
            .frame(maxWidth: .infinity)
            .frame(height: 28)
            .background(
                selected ? Color.white.opacity(0.075) : .clear,
                in: RoundedRectangle(cornerRadius: 7)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct ArtifactWebView: NSViewRepresentable {
    let artifact: Artifact

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.setValue(false, forKey: "drawsBackground")
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        view.loadHTMLString(document, baseURL: nil)
    }

    private var document: String {
        let policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'\">"
        let baseStyle = "<style>html,body{min-height:100%;margin:0;background:#111018;color:#f4f0ff;font-family:-apple-system,BlinkMacSystemFont,sans-serif}body{box-sizing:border-box;padding:16px}</style>"
        if artifact.language == "svg" {
            return "<!doctype html><html><head>\(policy)<style>html,body{height:100%;margin:0;background:#111018;display:grid;place-items:center}svg{max-width:100%;max-height:100%}</style></head><body>\(artifact.content)</body></html>"
        }
        if artifact.content.localizedCaseInsensitiveContains("<html") {
            if artifact.content.localizedCaseInsensitiveContains("<head>") {
                return artifact.content.replacingOccurrences(
                    of: "<head>",
                    with: "<head>\(policy)\(baseStyle)",
                    options: [.caseInsensitive]
                )
            }
            return artifact.content
        }
        return "<!doctype html><html><head>\(policy)\(baseStyle)<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>\(artifact.content)</body></html>"
    }
}
