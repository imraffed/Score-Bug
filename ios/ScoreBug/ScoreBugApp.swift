import SwiftUI

@main
struct ScoreBugApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .onOpenURL { model.open($0) }
                .task { await model.launch() }
        }
        .onChange(of: scenePhase) { _, phase in
            model.setActive(phase == .active)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView(selection: $model.tab) {
            GamesView().tabItem { Label("Games", systemImage: "sportscourt") }.tag(AppModel.Tab.games)
            TeamsView().tabItem { Label("My Teams", systemImage: "star") }.tag(AppModel.Tab.teams)
            BugsView().tabItem { Label("Bugs", systemImage: "tv") }.tag(AppModel.Tab.bugs)
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }.tag(AppModel.Tab.settings)
        }
    }
}
