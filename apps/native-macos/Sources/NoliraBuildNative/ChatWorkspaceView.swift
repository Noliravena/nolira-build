import SwiftUI

struct ChatWorkspaceView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        if let task = store.selectedTask, let project = store.project(for: task) {
            VStack(spacing: 0) {
                taskHeader(task: task, project: project)
                Divider()
                transcript(task: task)
                composer(task: task)
            }
            .background(Color(nsColor: .textBackgroundColor))
        } else {
            VStack(spacing: 14) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 34))
                    .foregroundStyle(.tertiary)
                Text("Select or create a task")
                    .foregroundStyle(.secondary)
                Button("New Task") { store.createTask() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func taskHeader(task: BuildTask, project: WorkspaceProject) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.headline)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "folder")
                    Text(project.path)
                        .lineLimit(1)
                    Text("·")
                    Text("Grok Build")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if let tokens = store.contextTokens[task.id] {
                Text("\(tokens.formatted()) tokens")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.quaternary.opacity(0.5), in: Capsule())
            }
            statusBadge
            Button {
                store.inspectorTab = .changes
                store.inspectorVisible.toggle()
                if store.inspectorVisible { store.refreshGitSummary() }
            } label: {
                Image(systemName: "sidebar.trailing")
            }
            .buttonStyle(.plain)
            .help("Toggle inspector")
        }
        .padding(.horizontal, 18)
        .padding(.top, 38)
        .padding(.bottom, 12)
        .background(.bar)
    }

    @ViewBuilder
    private var statusBadge: some View {
        let state = store.selectedTaskState
        HStack(spacing: 5) {
            if state == .connecting || state == .streaming {
                ProgressView().controlSize(.mini)
            } else {
                Circle()
                    .fill(statusColor(state))
                    .frame(width: 7, height: 7)
            }
            Text(statusText(state))
        }
        .font(.caption2.weight(.medium))
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(.quaternary.opacity(0.45), in: Capsule())
    }

    private func transcript(task: BuildTask) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if task.messages.isEmpty {
                        emptyPrompt(project: store.project(for: task)?.name ?? "this project")
                    }

                    ForEach(task.messages) { message in
                        MessageView(message: message)
                            .id(message.id)
                    }

                    if !task.tools.isEmpty {
                        ToolTimelineView(tools: task.tools)
                    }

                    if let permission = store.pendingPermission, permission.taskID == task.id {
                        PermissionCard(permission: permission)
                            .environmentObject(store)
                            .id("permission")
                    }

                    Color.clear.frame(height: 1).id("bottom")
                }
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 30)
                .padding(.vertical, 28)
            }
            .onChange(of: task.messages) {
                withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: store.pendingPermission) {
                withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    private func emptyPrompt(project: String) -> some View {
        VStack(spacing: 15) {
            BrandMark(size: 50)
            Text("What should Grok build?")
                .font(.title2.weight(.semibold))
            Text("Grok can inspect, edit, run, and verify code in \(project). You stay in control of tool approvals.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 480)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }

    private func composer(task: BuildTask) -> some View {
        VStack(spacing: 0) {
            Divider()
            VStack(spacing: 8) {
                TextEditor(text: $store.composer)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 58, maxHeight: 120)
                    .padding(.horizontal, 5)
                    .overlay(alignment: .topLeading) {
                        if store.composer.isEmpty {
                            Text("Ask Grok to build, inspect, or explain…")
                                .foregroundStyle(.tertiary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 9)
                                .allowsHitTesting(false)
                        }
                    }

                HStack(spacing: 10) {
                    Label("Grok", systemImage: "sparkles")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Picker(
                        "Model",
                        selection: Binding(
                            get: { task.modelID },
                            set: { store.updateModel($0) }
                        )
                    ) {
                        ForEach(store.modelOptions) { option in
                            Text(option.name).tag(option.id)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .fixedSize()

                    Picker(
                        "Effort",
                        selection: Binding(
                            get: { task.reasoningEffort },
                            set: { store.updateEffort($0) }
                        )
                    ) {
                        ForEach(ReasoningEffort.allCases) { effort in
                            Text(effort.label).tag(effort)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .fixedSize()

                    Spacer()

                    if store.isSelectedTaskBusy {
                        Button {
                            store.stopSelectedTask()
                        } label: {
                            Image(systemName: "stop.fill")
                        }
                        .buttonStyle(.bordered)
                        .help("Stop turn")
                    } else {
                        Text("⌘↩ to send")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        Button {
                            store.sendComposer()
                        } label: {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 13, weight: .bold))
                                .frame(width: 22, height: 22)
                        }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.circle)
                        .disabled(store.composer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .keyboardShortcut(.return, modifiers: [.command])
                        .help("Send")
                    }
                }
                .controlSize(.small)
            }
            .padding(10)
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.primary.opacity(0.09), lineWidth: 1)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .background(.bar)
    }

    private func statusText(_ state: BuildTaskState) -> String {
        switch state {
        case .idle: "Ready"
        case .connecting: "Connecting"
        case .streaming: "Working"
        case .waitingForApproval: "Approval"
        case .failed: "Needs attention"
        }
    }

    private func statusColor(_ state: BuildTaskState) -> Color {
        switch state {
        case .idle: .green
        case .connecting, .streaming: .blue
        case .waitingForApproval: .orange
        case .failed: .red
        }
    }
}

private struct MessageView: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 80)
                Text(message.text)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            }
        case .assistant:
            VStack(alignment: .leading, spacing: 12) {
                if !message.thought.isEmpty {
                    DisclosureGroup {
                        Text(message.thought)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                            .padding(.top, 6)
                    } label: {
                        Label("Reasoning", systemImage: "brain.head.profile")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
                if message.text.isEmpty {
                    HStack(spacing: 7) {
                        ProgressView().controlSize(.small)
                        Text("Grok is working…").foregroundStyle(.secondary)
                    }
                } else {
                    Text(message.text)
                        .font(.body)
                        .lineSpacing(4)
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .system:
            Label(message.text, systemImage: "info.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct ToolTimelineView: View {
    let tools: [ToolActivity]

    var body: some View {
        DisclosureGroup {
            VStack(spacing: 0) {
                ForEach(tools) { tool in
                    HStack(alignment: .top, spacing: 10) {
                        toolIcon(tool.status)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tool.title).font(.callout.weight(.medium))
                            if let input = tool.input, !input.isEmpty {
                                Text(input)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                                    .lineLimit(3)
                            }
                            if let output = tool.output, !output.isEmpty {
                                Text(output)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                                    .lineLimit(6)
                            }
                        }
                        Spacer()
                    }
                    .padding(.vertical, 8)
                    if tool.id != tools.last?.id { Divider() }
                }
            }
            .padding(.top, 6)
        } label: {
            Label("Agent activity · \(tools.count)", systemImage: "hammer")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func toolIcon(_ status: ToolStatus) -> some View {
        if status == .running || status == .pending {
            ProgressView().controlSize(.mini).frame(width: 14, height: 14)
        } else {
            Image(systemName: status == .completed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(status == .completed ? Color.green : Color.red)
        }
    }
}

private struct PermissionCard: View {
    @EnvironmentObject private var store: AppStore
    let permission: PendingPermission

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "exclamationmark.shield.fill")
                    .foregroundStyle(.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Approval required").font(.headline)
                    Text(permission.toolName).font(.caption).foregroundStyle(.secondary)
                }
            }
            Text(permission.summary)
            if let detail = permission.detail, !detail.isEmpty {
                Text(detail)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .padding(9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.black.opacity(0.05), in: RoundedRectangle(cornerRadius: 7))
                    .textSelection(.enabled)
            }
            HStack {
                Button("Deny") { store.resolvePermission(.deny) }
                Spacer()
                Button("Allow for session") { store.resolvePermission(.allowSession) }
                Button("Allow once") { store.resolvePermission(.allowOnce) }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(15)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12).stroke(Color.orange.opacity(0.35))
        }
    }
}
