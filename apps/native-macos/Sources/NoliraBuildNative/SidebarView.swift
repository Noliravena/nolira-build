import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var store: AppStore
    @State private var renamingTaskID: UUID?
    @State private var renameText = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                BrandMark(size: 29)
                Text("Nolira Build")
                    .font(.system(.headline, design: .rounded, weight: .semibold))
                Spacer()
                Button {
                    store.addProjectWithPicker()
                } label: {
                    Image(systemName: "folder.badge.plus")
                }
                .buttonStyle(.plain)
                .help("Open project")
            }
            .padding(.horizontal, 14)
            .padding(.top, 40)
            .padding(.bottom, 12)

            Button {
                store.createTask()
            } label: {
                Label("New task", systemImage: "square.and.pencil")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(Color.accentColor.opacity(0.09), in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 10)
            .padding(.bottom, 10)

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    ForEach(store.projects) { project in
                        projectSection(project)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 12)
            }

            Divider()
            HStack(spacing: 8) {
                Circle()
                    .fill(store.runtimeStatus.hasPrefix("Ready") ? Color.green : Color.orange)
                    .frame(width: 7, height: 7)
                Text(store.runtimeStatus)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                SettingsLink {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.plain)
            }
            .padding(12)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.72))
        .sheet(item: $renamingTaskID) { taskID in
            RenameTaskSheet(title: $renameText) {
                store.renameTask(taskID, to: renameText)
                renamingTaskID = nil
            } onCancel: {
                renamingTaskID = nil
            }
        }
    }

    @ViewBuilder
    private func projectSection(_ project: WorkspaceProject) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Image(systemName: "folder")
                    .foregroundStyle(.secondary)
                Text(project.name)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Button {
                    store.createTask(in: project.id)
                } label: {
                    Image(systemName: "plus")
                }
                .buttonStyle(.plain)
                .help("New task in \(project.name)")
            }
            .padding(.horizontal, 6)
            .contextMenu {
                Button("Remove Project", role: .destructive) { store.deleteProject(project.id) }
            }

            ForEach(store.tasks(for: project.id)) { task in
                Button {
                    store.select(taskID: task.id)
                } label: {
                    HStack(spacing: 8) {
                        stateIndicator(for: task.id)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title)
                                .lineLimit(1)
                            Text(task.updatedAt, style: .relative)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 7)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(
                    store.selectedTaskID == task.id ? Color.primary.opacity(0.08) : .clear,
                    in: RoundedRectangle(cornerRadius: 7)
                )
                .contextMenu {
                    Button("Rename") {
                        renameText = task.title
                        renamingTaskID = task.id
                    }
                    Button("Delete", role: .destructive) { store.deleteTask(task.id) }
                }
            }
        }
    }

    @ViewBuilder
    private func stateIndicator(for taskID: UUID) -> some View {
        let state = store.taskStates[taskID] ?? .idle
        switch state {
        case .connecting, .streaming:
            ProgressView().controlSize(.mini).frame(width: 10, height: 10)
        case .waitingForApproval:
            Circle().fill(.orange).frame(width: 8, height: 8)
        case .failed:
            Circle().fill(.red).frame(width: 8, height: 8)
        case .idle:
            Circle().fill(.secondary.opacity(0.35)).frame(width: 8, height: 8)
        }
    }
}

private struct RenameTaskSheet: View {
    @Binding var title: String
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Rename task").font(.headline)
            TextField("Task name", text: $title)
                .textFieldStyle(.roundedBorder)
                .onSubmit(onSave)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                Button("Save", action: onSave)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(22)
        .frame(width: 380)
    }
}

extension UUID: @retroactive Identifiable {
    public var id: UUID { self }
}
