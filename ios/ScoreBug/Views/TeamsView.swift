import SwiftUI

struct TeamsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var league = "nba"
    @State private var search = ""

    private var filtered: [Team] {
        let all = model.teams[league] ?? []
        guard !search.isEmpty else { return all }
        return all.filter { $0.fullName.localizedCaseInsensitiveContains(search) || $0.abbr.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("League", selection: $league) {
                        ForEach(model.leagues) { Text($0.name).tag($0.key) }
                    }
                } footer: {
                    Text("When a starred team plays, its bug appears on your Lock Screen by itself about ten minutes before the start. That needs push set up on the server.")
                }
                Section {
                    if model.teams[league] == nil {
                        ProgressView()
                    }
                    ForEach(filtered) { team in
                        Button {
                            model.toggleFavorite(team.id)
                        } label: {
                            HStack(spacing: 10) {
                                TeamDot(color: team.color, size: 14)
                                Text(team.fullName).foregroundStyle(.primary)
                                Spacer()
                                Text(team.abbr).font(.caption.monospaced()).foregroundStyle(.secondary)
                                Image(systemName: model.favorites.contains(team.id) ? "star.fill" : "star")
                                    .foregroundStyle(model.favorites.contains(team.id) ? Color.yellow : Color.secondary)
                            }
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Find a team")
            .navigationTitle("My Teams (\(model.favorites.count))")
            .task(id: league) { await model.loadTeams(league) }
            .onAppear { league = model.selectedLeague }
        }
    }
}
