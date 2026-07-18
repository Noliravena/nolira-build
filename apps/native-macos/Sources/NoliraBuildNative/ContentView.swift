import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        HSplitView {
            SidebarView()
                .environmentObject(store)
                .frame(minWidth: 220, idealWidth: 248, maxWidth: 300)

            if store.projects.isEmpty {
                WelcomeView()
                    .environmentObject(store)
                    .frame(minWidth: 620, maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ChatWorkspaceView()
                    .environmentObject(store)
                    .frame(minWidth: 560, maxWidth: .infinity, maxHeight: .infinity)
            }

            if store.inspectorVisible, !store.projects.isEmpty {
                InspectorView()
                    .environmentObject(store)
                    .frame(minWidth: 280, idealWidth: 340, maxWidth: 460)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

struct WelcomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 24) {
            BrandMark(size: 68)
            VStack(spacing: 8) {
                Text("Build with Grok")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                Text("Open a local project to start a native Grok Build task.")
                    .foregroundStyle(.secondary)
            }
            Button {
                store.addProjectWithPicker()
            } label: {
                Label("Open Project", systemImage: "folder.badge.plus")
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            HStack(spacing: 22) {
                FeaturePill(icon: "bolt.horizontal", text: "ACP streaming")
                FeaturePill(icon: "checkmark.shield", text: "Tool approvals")
                FeaturePill(icon: "arrow.triangle.branch", text: "Git-aware")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(40)
    }
}

private struct FeaturePill: View {
    let icon: String
    let text: String

    var body: some View {
        Label(text, systemImage: icon)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.quaternary.opacity(0.5), in: Capsule())
    }
}

struct BrandMark: View {
    var size: CGFloat = 30

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.29, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [Color(red: 0.23, green: 0.19, blue: 0.34), .black],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay {
                Image(systemName: "sparkles")
                    .font(.system(size: size * 0.42, weight: .medium))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
            .shadow(color: .black.opacity(0.15), radius: 8, y: 3)
    }
}
