import SwiftUI

struct ChatWorkspaceView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        if let task = store.selectedTask, let project = store.project(for: task) {
            VStack(spacing: 0) {
                taskHeader(task: task, project: project)
                transcript(task: task, project: project)
                composer(task: task)
            }
            .background(NoliraTheme.canvas.opacity(0.78))
        } else {
            emptySelection
        }
    }

    private func taskHeader(task: BuildTask, project: WorkspaceProject) -> some View {
        HStack(spacing: 13) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Image(systemName: "vault.fill")
                        .font(.system(size: 9.5))
                        .foregroundStyle(NoliraTheme.purple)
                    Text(project.name)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 7, weight: .bold))
                    Text("Tasks")
                }
                .font(.system(size: 10.5, weight: .medium, design: .rounded))
                .foregroundStyle(NoliraTheme.faintText)

                Text(task.title)
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .lineLimit(1)
            }

            Spacer(minLength: 10)

            if let tokens = store.contextTokens[task.id] {
                HeaderMetric(icon: "circle.hexagongrid", text: "\(tokens.formatted())", tint: NoliraTheme.cyan)
            }

            if task.mode == .plan {
                HeaderMetric(icon: "list.bullet.clipboard", text: "Plan", tint: NoliraTheme.purple)
            }

            statusBadge

            HStack(spacing: 2) {
                headerButton("checklist", help: "Review working tree") {
                    store.reviewCurrentChanges()
                }
                headerButton("arrow.triangle.branch", help: "Fork task") {
                    store.forkSelectedTask()
                }
                headerButton("brain.head.profile", help: "Project intelligence") {
                    store.openProjectContext(project.id)
                }
                headerButton("sidebar.trailing", help: "Toggle inspector") {
                    store.inspectorVisible.toggle()
                    if store.inspectorVisible { store.refreshGitSummary() }
                }
            }
            .padding(3)
            .noliraGlass(cornerRadius: 11, tint: NoliraTheme.purple.opacity(0.045))
        }
        .padding(.leading, 20)
        .padding(.trailing, 13)
        .padding(.top, 34)
        .padding(.bottom, 11)
        .background(NoliraTheme.chrome.opacity(0.80))
        .overlay(alignment: .bottom) {
            Rectangle().fill(NoliraTheme.separator).frame(height: 1)
        }
    }

    @ViewBuilder
    private func headerButton(_ icon: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(NoliraTheme.softText)
                .frame(width: 29, height: 27)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private var statusBadge: some View {
        let state = store.selectedTaskState
        return HStack(spacing: 3) {
            if state == .connecting || state == .streaming {
                ProgressView()
                    .controlSize(.mini)
                    .tint(NoliraTheme.purple)
                    .frame(width: 14, height: 14)
            } else {
                StatusDot(color: statusColor(state), pulsing: state == .waitingForApproval)
            }
            Text(statusText(state))
                .font(.system(size: 10.5, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(Color.white.opacity(0.72))
        .padding(.leading, 5)
        .padding(.trailing, 9)
        .frame(height: 27)
        .background(Color.white.opacity(0.045), in: Capsule())
        .overlay { Capsule().stroke(Color.white.opacity(0.05), lineWidth: 1) }
    }

    private func transcript(task: BuildTask, project: WorkspaceProject) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if task.messages.isEmpty {
                        emptyPrompt(project: project)
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
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 26)
                .padding(.top, 22)
                .padding(.bottom, 28)
            }
            .background {
                LinearGradient(
                    colors: [NoliraTheme.canvas.opacity(0.62), NoliraTheme.canvas.opacity(0.92)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .onChange(of: task.messages) {
                withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: store.pendingPermission) {
                withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    private func emptyPrompt(project: WorkspaceProject) -> some View {
        VStack(spacing: 21) {
            ZStack {
                Circle()
                    .fill(NoliraTheme.purple.opacity(0.20))
                    .frame(width: 112, height: 112)
                    .blur(radius: 35)
                BrandMark(size: 58)
            }

            VStack(spacing: 7) {
                Text("What should Grok build?")
                    .font(.system(size: 23, weight: .semibold, design: .rounded))
                Text("Grok can inspect, edit, run, and verify code in \(project.name).")
                    .font(.system(size: 12.5, design: .rounded))
                    .foregroundStyle(NoliraTheme.softText)
            }

            HStack(spacing: 9) {
                PromptSuggestion(
                    icon: "checklist",
                    title: "Review changes",
                    detail: "Find regressions",
                    tint: NoliraTheme.green
                ) {
                    store.composer = "Review the current working tree without editing files. Focus on correctness, regressions, security, and missing tests."
                }
                PromptSuggestion(
                    icon: "list.bullet.clipboard",
                    title: "Plan a feature",
                    detail: "Explore first",
                    tint: NoliraTheme.purple
                ) {
                    store.updateMode(.plan)
                    store.composer = "Explore this project and propose a concrete implementation plan for "
                }
                PromptSuggestion(
                    icon: "map",
                    title: "Map the codebase",
                    detail: "Explain structure",
                    tint: NoliraTheme.cyan
                ) {
                    store.composer = "Explain the architecture of this codebase, its key modules, and the safest place to start making changes."
                }
            }
            .frame(maxWidth: 650)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 72)
        .padding(.bottom, 46)
    }

    private func composer(task: BuildTask) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 9) {
                if !store.composerAttachments.isEmpty {
                    attachmentsRow
                }

                TextEditor(text: $store.composer)
                    .font(.system(size: 13.5, design: .rounded))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 58, maxHeight: 112)
                    .padding(.horizontal, 3)
                    .overlay(alignment: .topLeading) {
                        if store.composer.isEmpty {
                            Text("Ask Grok to build, inspect, or explain…")
                                .font(.system(size: 13.5, design: .rounded))
                                .foregroundStyle(NoliraTheme.faintText)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 7)
                                .allowsHitTesting(false)
                        }
                    }

                Rectangle().fill(Color.white.opacity(0.055)).frame(height: 1)

                HStack(spacing: 7) {
                    Button {
                        store.chooseAttachments()
                    } label: {
                        Image(systemName: "paperclip")
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(NoliraTheme.softText)
                            .frame(width: 27, height: 25)
                            .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain)
                    .help("Attach files or images")

                    providerChip
                    modelMenu(task)
                    modeMenu(task)
                    approvalMenu(task)
                    effortMenu(task)

                    Spacer(minLength: 8)

                    if store.isSelectedTaskBusy {
                        Button {
                            store.stopSelectedTask()
                        } label: {
                            Label("Stop", systemImage: "stop.fill")
                                .font(.system(size: 11, weight: .semibold, design: .rounded))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .frame(height: 28)
                                .background(Color.red.opacity(0.70), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    } else {
                        ShortcutKey(text: "⌘↩")
                        Button {
                            store.sendComposer()
                        } label: {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 29, height: 29)
                                .background(NoliraTheme.accentGradient, in: Circle())
                                .shadow(color: NoliraTheme.purple.opacity(0.35), radius: 8, y: 3)
                        }
                        .buttonStyle(.plain)
                        .disabled(
                            store.composer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                && store.composerAttachments.isEmpty
                        )
                        .opacity(
                            store.composer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                && store.composerAttachments.isEmpty ? 0.35 : 1
                        )
                        .keyboardShortcut(.return, modifiers: [.command])
                        .help("Send")
                    }
                }
            }
            .padding(11)
            .noliraGlass(cornerRadius: 18, tint: NoliraTheme.purple.opacity(0.055), interactive: true)
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [NoliraTheme.purple.opacity(0.35), Color.white.opacity(0.08), NoliraTheme.magenta.opacity(0.18)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .noliraShadow()
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 13)
        }
        .background(
            LinearGradient(
                colors: [NoliraTheme.canvas.opacity(0.25), NoliraTheme.chrome.opacity(0.93)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private var attachmentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(store.composerAttachments) { attachment in
                    HStack(spacing: 6) {
                        Image(systemName: attachment.mime?.hasPrefix("image/") == true ? "photo" : "doc")
                            .foregroundStyle(NoliraTheme.purple)
                        Text(attachment.name).lineLimit(1)
                        Button {
                            store.removeAttachment(attachment)
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(NoliraTheme.faintText)
                    }
                    .font(.system(size: 10.5, weight: .medium, design: .rounded))
                    .padding(.horizontal, 8)
                    .frame(height: 27)
                    .background(NoliraTheme.purple.opacity(0.10), in: RoundedRectangle(cornerRadius: 7))
                    .overlay { RoundedRectangle(cornerRadius: 7).stroke(NoliraTheme.purple.opacity(0.14)) }
                }
            }
        }
    }

    private var providerChip: some View {
        HStack(spacing: 5) {
            Image(systemName: "sparkles")
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(NoliraTheme.magenta)
            Text("Grok")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(Color.white.opacity(0.75))
        .padding(.horizontal, 7)
        .frame(height: 25)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
    }

    private func modelMenu(_ task: BuildTask) -> some View {
        Menu {
            ForEach(store.modelOptions) { option in
                Button {
                    store.updateModel(option.id)
                } label: {
                    if option.id == task.modelID { Label(option.name, systemImage: "checkmark") }
                    else { Text(option.name) }
                }
            }
        } label: {
            RaycastChip(
                icon: "cpu",
                text: store.modelOptions.first(where: { $0.id == task.modelID })?.name ?? "Default",
                tint: NoliraTheme.cyan
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private func modeMenu(_ task: BuildTask) -> some View {
        Menu {
            ForEach(TaskMode.allCases) { mode in
                Button {
                    store.updateMode(mode)
                } label: {
                    if mode == task.mode { Label(mode.label, systemImage: "checkmark") }
                    else { Text(mode.label) }
                }
            }
        } label: {
            RaycastChip(
                icon: task.mode == .plan ? "list.bullet.clipboard" : "hammer",
                text: task.mode.label,
                tint: NoliraTheme.purple,
                active: task.mode == .plan
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private func approvalMenu(_ task: BuildTask) -> some View {
        Menu {
            ForEach(ApprovalMode.allCases) { mode in
                Button {
                    store.updateApprovalMode(mode)
                } label: {
                    if mode == task.approvalMode { Label(mode.label, systemImage: "checkmark") }
                    else { Text(mode.label) }
                }
            }
        } label: {
            RaycastChip(
                icon: "shield",
                text: task.approvalMode.label,
                tint: task.approvalMode == .fullAccess ? NoliraTheme.warning : NoliraTheme.green,
                active: task.approvalMode == .fullAccess
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private func effortMenu(_ task: BuildTask) -> some View {
        Menu {
            ForEach(ReasoningEffort.allCases) { effort in
                Button {
                    store.updateEffort(effort)
                } label: {
                    if effort == task.reasoningEffort { Label(effort.label, systemImage: "checkmark") }
                    else { Text(effort.label) }
                }
            }
        } label: {
            RaycastChip(icon: "dial.medium", text: task.reasoningEffort.label, tint: NoliraTheme.magenta)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private var emptySelection: some View {
        VStack(spacing: 14) {
            Image(systemName: "rectangle.stack.badge.plus")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(NoliraTheme.faintText)
            Text("Select or create a task")
                .font(.system(size: 16, weight: .semibold, design: .rounded))
            Button("New Task") { store.createTask() }
                .buttonStyle(.borderedProminent)
                .tint(NoliraTheme.purple)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NoliraTheme.canvas.opacity(0.72))
    }

    private func statusText(_ state: BuildTaskState) -> String {
        switch state {
        case .idle: "Ready"
        case .connecting: "Connecting"
        case .streaming: "Working"
        case .waitingForApproval: "Approval"
        case .failed: "Attention"
        }
    }

    private func statusColor(_ state: BuildTaskState) -> Color {
        switch state {
        case .idle: NoliraTheme.green
        case .connecting, .streaming: NoliraTheme.cyan
        case .waitingForApproval: NoliraTheme.warning
        case .failed: .red
        }
    }
}

private struct HeaderMetric: View {
    let icon: String
    let text: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .frame(height: 27)
            .background(tint.opacity(0.09), in: Capsule())
            .overlay { Capsule().stroke(tint.opacity(0.12), lineWidth: 1) }
    }
}

private struct PromptSuggestion: View {
    let icon: String
    let title: String
    let detail: String
    let tint: Color
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 29, height: 29)
                    .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                    Text(detail)
                        .font(.system(size: 10.5, design: .rounded))
                        .foregroundStyle(NoliraTheme.faintText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(11)
            .background(
                hovered ? Color.white.opacity(0.055) : Color.white.opacity(0.025),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(hovered ? tint.opacity(0.20) : Color.white.opacity(0.05), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}

private struct MessageView: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case .user:
            userMessage
        case .assistant:
            assistantMessage
        case .system:
            systemMessage
        }
    }

    private var userMessage: some View {
        HStack(alignment: .top, spacing: 10) {
            Spacer(minLength: 76)
            VStack(alignment: .leading, spacing: 8) {
                Text("YOU")
                    .font(.system(size: 8.5, weight: .bold, design: .rounded))
                    .tracking(1)
                    .foregroundStyle(NoliraTheme.purple)
                if !message.text.isEmpty {
                    Text(message.text)
                        .font(.system(size: 13, design: .rounded))
                        .lineSpacing(3)
                        .textSelection(.enabled)
                }
                if !message.attachments.isEmpty {
                    attachments
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(NoliraTheme.purple.opacity(0.13), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(NoliraTheme.purple.opacity(0.15), lineWidth: 1)
            }
        }
    }

    private var assistantMessage: some View {
        HStack(alignment: .top, spacing: 10) {
            BrandMark(size: 27)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("GROK")
                        .font(.system(size: 8.5, weight: .bold, design: .rounded))
                        .tracking(1)
                        .foregroundStyle(NoliraTheme.magenta)
                    Spacer()
                    Text(message.createdAt, style: .time)
                        .font(.system(size: 9.5, design: .monospaced))
                        .foregroundStyle(NoliraTheme.faintText)
                }

                if !message.thought.isEmpty {
                    DisclosureGroup {
                        Text(message.thought)
                            .font(.system(size: 11.5, design: .rounded))
                            .lineSpacing(3)
                            .foregroundStyle(NoliraTheme.softText)
                            .textSelection(.enabled)
                            .padding(.top, 6)
                    } label: {
                        Label("Reasoning", systemImage: "brain.head.profile")
                            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                            .foregroundStyle(NoliraTheme.softText)
                    }
                    .padding(10)
                    .background(Color.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 9))
                }

                if message.text.isEmpty {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small).tint(NoliraTheme.purple)
                        Text("Grok is working…")
                            .font(.system(size: 12.5, design: .rounded))
                            .foregroundStyle(NoliraTheme.softText)
                    }
                } else {
                    Text(message.text)
                        .font(.system(size: 13, design: .rounded))
                        .lineSpacing(4)
                        .textSelection(.enabled)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.025), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.045), lineWidth: 1)
            }
        }
    }

    private var systemMessage: some View {
        Label(message.text, systemImage: "info.circle.fill")
            .font(.system(size: 10.5, design: .rounded))
            .foregroundStyle(NoliraTheme.softText)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(NoliraTheme.cyan.opacity(0.07), in: RoundedRectangle(cornerRadius: 8))
    }

    private var attachments: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(message.attachments) { attachment in
                Label(
                    attachment.name,
                    systemImage: attachment.mime?.hasPrefix("image/") == true ? "photo" : "doc"
                )
                .font(.system(size: 10.5, design: .rounded))
                .foregroundStyle(NoliraTheme.softText)
            }
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
                            Text(tool.title)
                                .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                            if let input = tool.input, !input.isEmpty {
                                Text(input)
                                    .font(.system(size: 10.5, design: .monospaced))
                                    .foregroundStyle(NoliraTheme.softText)
                                    .lineLimit(3)
                            }
                            if let output = tool.output, !output.isEmpty {
                                Text(output)
                                    .font(.system(size: 10.5, design: .monospaced))
                                    .foregroundStyle(NoliraTheme.softText)
                                    .lineLimit(6)
                            }
                        }
                        Spacer()
                    }
                    .padding(.vertical, 8)
                    if tool.id != tools.last?.id {
                        Rectangle().fill(NoliraTheme.separator).frame(height: 1)
                    }
                }
            }
            .padding(.top, 7)
        } label: {
            HStack {
                Label("Agent activity", systemImage: "hammer.fill")
                Spacer()
                Text("\(tools.count)")
                    .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                    .foregroundStyle(NoliraTheme.purple)
            }
            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
            .foregroundStyle(NoliraTheme.softText)
        }
        .padding(12)
        .background(Color.white.opacity(0.025), in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.05)) }
    }

    @ViewBuilder
    private func toolIcon(_ status: ToolStatus) -> some View {
        if status == .running || status == .pending {
            ProgressView().controlSize(.mini).tint(NoliraTheme.purple).frame(width: 15, height: 15)
        } else {
            Image(systemName: status == .completed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(status == .completed ? NoliraTheme.green : Color.red)
        }
    }
}

private struct PermissionCard: View {
    @EnvironmentObject private var store: AppStore
    let permission: PendingPermission

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.shield.fill")
                    .font(.system(size: 17))
                    .foregroundStyle(NoliraTheme.warning)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Approval required")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                    Text(permission.toolName)
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(NoliraTheme.softText)
                }
            }
            Text(permission.summary)
                .font(.system(size: 12.5, design: .rounded))
            if let detail = permission.detail, !detail.isEmpty {
                Text(detail)
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(NoliraTheme.softText)
                    .padding(9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 8))
                    .textSelection(.enabled)
            }
            HStack {
                Button("Deny") { store.resolvePermission(.deny) }
                    .buttonStyle(.plain)
                    .foregroundStyle(NoliraTheme.softText)
                Spacer()
                Button("Allow for session") { store.resolvePermission(.allowSession) }
                    .buttonStyle(.bordered)
                Button("Allow once") { store.resolvePermission(.allowOnce) }
                    .buttonStyle(.borderedProminent)
                    .tint(NoliraTheme.warning)
            }
            .controlSize(.small)
        }
        .padding(15)
        .noliraGlass(cornerRadius: 14, tint: NoliraTheme.warning.opacity(0.08))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(NoliraTheme.warning.opacity(0.25), lineWidth: 1)
        }
    }
}
