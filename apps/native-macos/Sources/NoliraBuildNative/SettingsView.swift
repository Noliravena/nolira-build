import AppKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        TabView {
            Form {
                Section("Grok runtime") {
                    LabeledContent("Status") {
                        Text(store.runtimeStatus)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    LabeledContent("Executable") {
                        HStack {
                            TextField("Auto-detect ~/.grok/bin/grok", text: $store.customExecutablePath)
                                .textFieldStyle(.roundedBorder)
                            Button("Choose…") { chooseExecutable() }
                            Button("Reset") { store.resetEnginePath() }
                        }
                    }
                    Text("Credentials remain owned by the local Grok CLI. Nolira Build never copies API keys into project files.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Provider architecture") {
                    ForEach(store.providers) { provider in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: provider.isAvailable ? "checkmark.circle.fill" : "circle.dashed")
                                .foregroundStyle(provider.isAvailable ? Color.green : Color.secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(provider.name).fontWeight(.medium)
                                Text("\(provider.detail) · \(provider.transport)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(provider.isAvailable ? "Enabled" : "Roadmap")
                                .font(.caption2)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(.quaternary, in: Capsule())
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .padding(.top, 8)
            .tabItem { Label("Providers", systemImage: "cpu") }

            VStack(alignment: .leading, spacing: 14) {
                Text("Nolira Build Native")
                    .font(.title2.weight(.semibold))
                Text("A native SwiftUI client for Grok Build. Conversations and task metadata are stored in Application Support; Grok owns its ACP session history.")
                    .foregroundStyle(.secondary)
                Divider()
                LabeledContent("Version", value: "0.1.0")
                LabeledContent("Transport", value: "ACP over stdio")
                LabeledContent("Minimum macOS", value: "14.0")
                Spacer()
            }
            .padding(28)
            .tabItem { Label("About", systemImage: "info.circle") }
        }
    }

    private func chooseExecutable() {
        let panel = NSOpenPanel()
        panel.title = "Choose the Grok executable"
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            store.customExecutablePath = url.path
            store.checkRuntime()
        }
    }
}
