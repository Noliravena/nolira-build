import SwiftUI

@main
struct NoliraBuildNativeApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup("Nolira Build Native") {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: 1_040, minHeight: 680)
                .onDisappear { store.shutdown() }
        }
        .defaultSize(width: 1_320, height: 840)
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unifiedCompact)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Task") { store.createTask() }
                    .keyboardShortcut("n", modifiers: [.command])
                Button("Open Project…") { store.addProjectWithPicker() }
                    .keyboardShortcut("o", modifiers: [.command])
            }
            CommandMenu("Workspace") {
                Button("Refresh Changes") { store.refreshGitSummary() }
                    .keyboardShortcut("g", modifiers: [.command, .shift])
                Button(store.inspectorVisible ? "Hide Inspector" : "Show Inspector") {
                    store.inspectorVisible.toggle()
                }
                .keyboardShortcut("b", modifiers: [.command, .option])
            }
        }

        Settings {
            SettingsView()
                .environmentObject(store)
                .frame(width: 590, height: 430)
        }
    }
}
