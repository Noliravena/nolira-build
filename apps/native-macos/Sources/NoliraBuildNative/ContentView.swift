import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            WorkspaceBackdrop()

            HStack(spacing: 0) {
                WorkspaceRibbon()
                    .environmentObject(store)
                    .frame(width: 52)

                WorkspaceDivider()

                HSplitView {
                    SidebarView()
                        .environmentObject(store)
                        .frame(minWidth: 228, idealWidth: 252, maxWidth: 310)

                    Group {
                        if store.projects.isEmpty {
                            WelcomeView()
                                .environmentObject(store)
                        } else {
                            ChatWorkspaceView()
                                .environmentObject(store)
                        }
                    }
                    .frame(minWidth: 590, maxWidth: .infinity, maxHeight: .infinity)

                    if store.inspectorVisible, !store.projects.isEmpty {
                        InspectorView()
                            .environmentObject(store)
                            .frame(minWidth: 300, idealWidth: 356, maxWidth: 500)
                    }
                }
            }
        }
        .background(WindowConfigurator().allowsHitTesting(false))
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.projectContextPresented) {
            ProjectContextSheet()
                .environmentObject(store)
                .preferredColorScheme(.dark)
        }
    }
}

private struct WorkspaceRibbon: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 9) {
            BrandMark(size: 30)
                .padding(.top, 38)
                .padding(.bottom, 9)

            GlassIconButton(
                systemName: "square.and.pencil",
                help: "New task · ⌘N"
            ) {
                store.createTask()
            }

            GlassIconButton(
                systemName: "doc.text.magnifyingglass",
                help: "Review working tree"
            ) {
                store.reviewCurrentChanges()
            }

            Rectangle()
                .fill(NoliraTheme.separator)
                .frame(width: 25, height: 1)
                .padding(.vertical, 3)

            GlassIconButton(
                systemName: "point.3.connected.trianglepath.dotted",
                help: "Changes",
                selected: store.inspectorVisible && store.inspectorTab == .changes
            ) {
                showInspector(.changes)
            }

            GlassIconButton(
                systemName: "terminal",
                help: "Terminal",
                selected: store.inspectorVisible && store.inspectorTab == .terminal
            ) {
                showInspector(.terminal)
            }

            GlassIconButton(
                systemName: "sparkles.rectangle.stack",
                help: "Artifacts",
                selected: store.inspectorVisible && store.inspectorTab == .artifacts,
                badge: store.selectedArtifacts.isEmpty ? nil : "\(store.selectedArtifacts.count)"
            ) {
                showInspector(.artifacts)
            }

            Spacer()

            if let project = store.selectedProject {
                GlassIconButton(
                    systemName: "brain.head.profile",
                    help: "Project instructions and memory"
                ) {
                    store.openProjectContext(project.id)
                }
            }

            GlassIconButton(systemName: "folder.badge.plus", help: "Open project · ⌘O") {
                store.addProjectWithPicker()
            }

            SettingsLink {
                Image(systemName: "gearshape")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.58))
                    .frame(width: 31, height: 31)
                    .background(Color.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 9))
            }
            .buttonStyle(.plain)
            .help("Settings · ⌘,")
            .padding(.bottom, 12)
        }
        .frame(maxHeight: .infinity)
        .background(NoliraTheme.chrome.opacity(0.91))
    }

    private func showInspector(_ tab: AppStore.InspectorTab) {
        if store.inspectorVisible && store.inspectorTab == tab {
            store.inspectorVisible = false
        } else {
            store.inspectorTab = tab
            store.inspectorVisible = true
            if tab == .changes { store.refreshGitSummary() }
        }
    }
}

private struct ProjectContextSheet: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            WorkspaceBackdrop()

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    BrandMark(size: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(store.contextProject?.name ?? "Project")
                            .font(.system(size: 20, weight: .semibold, design: .rounded))
                        Text("Project intelligence")
                            .font(.caption)
                            .foregroundStyle(NoliraTheme.softText)
                    }
                    Spacer()
                    Text("LOCAL")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .tracking(1)
                        .foregroundStyle(NoliraTheme.cyan)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(NoliraTheme.cyan.opacity(0.10), in: Capsule())
                }

                ContextEditorCard(
                    title: "INSTRUCTIONS",
                    subtitle: "Rules and working preferences injected into every Grok turn.",
                    icon: "text.badge.checkmark",
                    text: $store.projectInstructionsDraft
                )

                ContextEditorCard(
                    title: "MEMORY",
                    subtitle: "Durable project facts you want Grok to remember.",
                    icon: "brain.head.profile",
                    text: $store.projectMemoryDraft
                )

                HStack {
                    Label("Stored only in Application Support", systemImage: "lock.fill")
                        .font(.caption2)
                        .foregroundStyle(NoliraTheme.faintText)
                    Spacer()
                    Button("Cancel") { store.projectContextPresented = false }
                        .buttonStyle(.plain)
                        .foregroundStyle(NoliraTheme.softText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                    Button {
                        store.saveProjectContext()
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: "checkmark")
                            Text("Save context")
                        }
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 15)
                        .padding(.vertical, 8)
                        .background(NoliraTheme.accentGradient, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(24)
            .noliraGlass(cornerRadius: 22, tint: NoliraTheme.purple.opacity(0.07))
            .noliraShadow()
            .padding(20)
        }
        .frame(width: 700, height: 620)
    }
}

private struct ContextEditorCard: View {
    let title: String
    let subtitle: String
    let icon: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundStyle(NoliraTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(1)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(NoliraTheme.softText)
                }
            }

            TextEditor(text: $text)
                .font(.system(size: 12.5, design: .monospaced))
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(minHeight: 150)
                .background(NoliraTheme.terminal.opacity(0.72), in: RoundedRectangle(cornerRadius: 11))
                .overlay {
                    RoundedRectangle(cornerRadius: 11)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                }
        }
        .padding(14)
        .background(Color.white.opacity(0.025), in: RoundedRectangle(cornerRadius: 14))
    }
}

struct WelcomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            NoliraTheme.canvas.opacity(0.58)

            VStack(spacing: 26) {
                ZStack {
                    Circle()
                        .fill(NoliraTheme.purple.opacity(0.22))
                        .frame(width: 150, height: 150)
                        .blur(radius: 40)
                    BrandMark(size: 76)
                }

                VStack(spacing: 9) {
                    Text("Build at the speed of thought")
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                    Text("A native Grok workspace for code, context, terminal, and artifacts.")
                        .font(.system(size: 14, design: .rounded))
                        .foregroundStyle(NoliraTheme.softText)
                }

                Button {
                    store.addProjectWithPicker()
                } label: {
                    HStack(spacing: 9) {
                        Image(systemName: "folder.badge.plus")
                        Text("Open a project")
                        ShortcutKey(text: "⌘O")
                    }
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 17)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
                .noliraGlass(cornerRadius: 13, tint: NoliraTheme.purple.opacity(0.18), interactive: true)

                HStack(spacing: 10) {
                    FeaturePill(icon: "bolt.horizontal.fill", text: "ACP streaming", tint: NoliraTheme.cyan)
                    FeaturePill(icon: "checkmark.shield.fill", text: "Safe approvals", tint: NoliraTheme.green)
                    FeaturePill(icon: "square.stack.3d.up.fill", text: "Project memory", tint: NoliraTheme.purple)
                }
            }
            .padding(46)
        }
    }
}

private struct FeaturePill: View {
    let icon: String
    let text: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundStyle(Color.white.opacity(0.72))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(tint.opacity(0.08), in: Capsule())
            .overlay { Capsule().stroke(tint.opacity(0.12), lineWidth: 1) }
    }
}

struct BrandMark: View {
    var size: CGFloat = 30

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.29, style: .continuous)
                .fill(NoliraTheme.accentGradient)
            RoundedRectangle(cornerRadius: size * 0.29, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [.white.opacity(0.20), .clear, .black.opacity(0.20)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(systemName: "sparkles")
                .font(.system(size: size * 0.40, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .overlay {
            RoundedRectangle(cornerRadius: size * 0.29, style: .continuous)
                .stroke(Color.white.opacity(0.20), lineWidth: 0.8)
        }
        .shadow(color: NoliraTheme.purple.opacity(0.30), radius: size * 0.32, y: size * 0.12)
    }
}
