import SwiftUI

struct InspectorView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("Inspector", selection: $store.inspectorTab) {
                    ForEach(AppStore.InspectorTab.allCases) { tab in
                        Text(tab.label).tag(tab)
                    }
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                Spacer()
                Button {
                    if store.inspectorTab == .changes { store.refreshGitSummary() }
                    else { store.clearTerminal() }
                } label: {
                    Image(systemName: store.inspectorTab == .changes ? "arrow.clockwise" : "trash")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.top, 38)
            .padding(.bottom, 10)
            .background(.bar)

            Divider()

            switch store.inspectorTab {
            case .changes:
                changesView
            case .terminal:
                terminalView
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.72))
    }

    private var changesView: some View {
        ScrollView([.horizontal, .vertical]) {
            Text(store.gitSummary)
                .font(.system(size: 11.5, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .padding(14)
        }
        .overlay(alignment: .bottomTrailing) {
            Text("Git working tree")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .padding(9)
        }
    }

    private var terminalView: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    Text(store.terminalOutput)
                        .font(.system(size: 11.5, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(12)
                        .id("terminal-bottom")
                }
                .background(Color(nsColor: .textBackgroundColor))
                .onChange(of: store.terminalOutput) {
                    proxy.scrollTo("terminal-bottom", anchor: .bottom)
                }
            }
            Divider()
            HStack(spacing: 7) {
                Text("❯").foregroundStyle(.secondary)
                TextField("Run in project", text: $store.terminalCommand)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, design: .monospaced))
                    .onSubmit { store.runTerminalCommand() }
                    .disabled(store.terminalRunning)
                if store.terminalRunning {
                    ProgressView().controlSize(.small)
                } else {
                    Button { store.runTerminalCommand() } label: {
                        Image(systemName: "return")
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
        }
    }
}
