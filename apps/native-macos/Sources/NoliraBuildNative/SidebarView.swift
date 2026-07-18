import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var store: AppStore
    @State private var renamingTaskID: UUID?
    @State private var renameText = ""
    @State private var search = ""
    @State private var collapsedProjects: Set<UUID> = []

    var body: some View {
        VStack(spacing: 0) {
            sidebarHeader
            searchField

            HStack {
                SectionEyebrow(title: "Workspace", trailing: "\(store.tasks.count) tasks")
                Button {
                    store.createTask()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(NoliraTheme.softText)
                        .frame(width: 22, height: 22)
                        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .help("New task")
            }
            .padding(.horizontal, 12)
            .padding(.top, 13)
            .padding(.bottom, 8)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 13) {
                    ForEach(store.projects) { project in
                        projectSection(project)
                    }
                }
                .padding(.horizontal, 7)
                .padding(.bottom, 16)
            }

            runtimeFooter
        }
        .background(NoliraTheme.chrome.opacity(0.89))
        .sheet(item: $renamingTaskID) { taskID in
            RenameTaskSheet(title: $renameText) {
                store.renameTask(taskID, to: renameText)
                renamingTaskID = nil
            } onCancel: {
                renamingTaskID = nil
            }
            .preferredColorScheme(.dark)
        }
    }

    private var sidebarHeader: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("NOLIRA")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(1.7)
                    .foregroundStyle(NoliraTheme.purple)
                Text("Build workspace")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
            }
            Spacer()
            Button {
                store.addProjectWithPicker()
            } label: {
                Image(systemName: "folder.badge.plus")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(NoliraTheme.softText)
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .help("Open project")
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.top, 38)
        .padding(.bottom, 13)
    }

    private var searchField: some View {
        HStack(spacing: 7) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(NoliraTheme.faintText)
            TextField("Search tasks", text: $search)
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .rounded))
            ShortcutKey(text: "⌘K")
        }
        .padding(.horizontal, 9)
        .frame(height: 32)
        .background(Color.black.opacity(0.17), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(Color.white.opacity(0.055), lineWidth: 1)
        }
        .padding(.horizontal, 10)
    }

    @ViewBuilder
    private func projectSection(_ project: WorkspaceProject) -> some View {
        let tasks = filteredTasks(for: project.id)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Button {
                    withAnimation(.easeOut(duration: 0.16)) {
                        if collapsedProjects.contains(project.id) {
                            collapsedProjects.remove(project.id)
                        } else {
                            collapsedProjects.insert(project.id)
                        }
                    }
                } label: {
                    Image(systemName: collapsedProjects.contains(project.id) ? "chevron.right" : "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(NoliraTheme.faintText)
                        .frame(width: 14, height: 18)
                }
                .buttonStyle(.plain)

                Image(systemName: "vault.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(store.selectedProjectID == project.id ? NoliraTheme.purple : NoliraTheme.softText)
                Text(project.name)
                    .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                Spacer(minLength: 4)
                Button {
                    store.openProjectContext(project.id)
                } label: {
                    Image(systemName: "brain.head.profile")
                }
                .buttonStyle(.plain)
                .foregroundStyle(NoliraTheme.faintText)
                .help("Project intelligence")
                Button {
                    store.createTask(in: project.id)
                } label: {
                    Image(systemName: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(NoliraTheme.faintText)
                .help("New task")
            }
            .padding(.horizontal, 7)
            .frame(height: 26)
            .contentShape(Rectangle())
            .contextMenu {
                Button("Remove Project", role: .destructive) { store.deleteProject(project.id) }
            }

            if !collapsedProjects.contains(project.id) {
                if tasks.isEmpty {
                    Text(search.isEmpty ? "No tasks yet" : "No matching tasks")
                        .font(.caption2)
                        .foregroundStyle(NoliraTheme.faintText)
                        .padding(.leading, 31)
                        .padding(.vertical, 6)
                } else {
                    ForEach(tasks) { task in
                        TaskSidebarRow(
                            task: task,
                            state: store.taskStates[task.id] ?? .idle,
                            selected: store.selectedTaskID == task.id,
                            onSelect: { store.select(taskID: task.id) },
                            onRename: {
                                renameText = task.title
                                renamingTaskID = task.id
                            },
                            onDelete: { store.deleteTask(task.id) }
                        )
                    }
                }
            }
        }
    }

    private func filteredTasks(for projectID: UUID) -> [BuildTask] {
        let tasks = store.tasks(for: projectID)
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return tasks }
        return tasks.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    private var runtimeFooter: some View {
        HStack(spacing: 9) {
            ZStack {
                Circle()
                    .fill(NoliraTheme.green.opacity(0.12))
                    .frame(width: 27, height: 27)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(store.runtimeStatus.hasPrefix("Ready") ? NoliraTheme.green : NoliraTheme.warning)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(store.runtimeStatus.hasPrefix("Ready") ? "Grok connected" : "Runtime attention")
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                Text(store.runtimeStatus)
                    .font(.system(size: 9.5, design: .rounded))
                    .foregroundStyle(NoliraTheme.faintText)
                    .lineLimit(1)
            }
            Spacer(minLength: 2)
            SettingsLink {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 11))
                    .foregroundStyle(NoliraTheme.softText)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(Color.black.opacity(0.14))
        .overlay(alignment: .top) {
            Rectangle().fill(NoliraTheme.separator).frame(height: 1)
        }
    }
}

private struct TaskSidebarRow: View {
    let task: BuildTask
    let state: BuildTaskState
    let selected: Bool
    let onSelect: () -> Void
    let onRename: () -> Void
    let onDelete: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 8) {
                taskIcon
                VStack(alignment: .leading, spacing: 3) {
                    Text(task.title)
                        .font(.system(size: 11.5, weight: selected ? .semibold : .medium, design: .rounded))
                        .foregroundStyle(selected ? .white : Color.white.opacity(0.74))
                        .lineLimit(1)
                    HStack(spacing: 5) {
                        Text(task.updatedAt, style: .relative)
                        if task.mode == .plan {
                            Text("PLAN")
                                .foregroundStyle(NoliraTheme.purple)
                        }
                    }
                    .font(.system(size: 9.5, weight: .medium, design: .rounded))
                    .foregroundStyle(NoliraTheme.faintText)
                }
                Spacer(minLength: 2)
                if hovered && state == .idle {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(NoliraTheme.faintText)
                } else {
                    stateIndicator
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selected ? NoliraTheme.purple.opacity(0.15) : (hovered ? Color.white.opacity(0.035) : .clear),
            in: RoundedRectangle(cornerRadius: 9, style: .continuous)
        )
        .overlay {
            if selected {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(NoliraTheme.purple.opacity(0.18), lineWidth: 1)
            }
        }
        .onHover { hovered = $0 }
        .contextMenu {
            Button("Rename", action: onRename)
            Button("Delete", role: .destructive, action: onDelete)
        }
    }

    private var taskIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(selected ? NoliraTheme.purple.opacity(0.20) : Color.white.opacity(0.045))
                .frame(width: 27, height: 27)
            Image(systemName: task.mode == .plan ? "list.bullet.clipboard" : "message.fill")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(selected ? NoliraTheme.purple : NoliraTheme.softText)
        }
    }

    @ViewBuilder
    private var stateIndicator: some View {
        switch state {
        case .connecting, .streaming:
            ProgressView().controlSize(.mini).tint(NoliraTheme.purple)
        case .waitingForApproval:
            StatusDot(color: NoliraTheme.warning, pulsing: true)
        case .failed:
            StatusDot(color: .red)
        case .idle:
            StatusDot(color: Color.white.opacity(0.20))
        }
    }
}

private struct RenameTaskSheet: View {
    @Binding var title: String
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            WorkspaceBackdrop()
            VStack(alignment: .leading, spacing: 16) {
                SectionEyebrow(title: "Rename task")
                TextField("Task name", text: $title)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, design: .rounded))
                    .padding(.horizontal, 12)
                    .frame(height: 38)
                    .background(Color.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.08)) }
                    .onSubmit(onSave)
                HStack {
                    Spacer()
                    Button("Cancel", action: onCancel).buttonStyle(.plain)
                    Button("Save", action: onSave)
                        .buttonStyle(.borderedProminent)
                        .tint(NoliraTheme.purple)
                }
            }
            .padding(22)
            .noliraGlass(cornerRadius: 18, tint: NoliraTheme.purple.opacity(0.06))
            .padding(16)
        }
        .frame(width: 410, height: 190)
    }
}

extension UUID: @retroactive Identifiable {
    public var id: UUID { self }
}
