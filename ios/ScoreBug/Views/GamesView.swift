import SwiftUI

struct GamesView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack(path: $model.path) {
            List {
                if let error = model.errorMessage {
                    Section {
                        Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.orange)
                        Text("Check the server address in Settings.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if model.leagueGames.isEmpty && model.errorMessage == nil {
                    Text("No games on the scoreboard for this league right now.").foregroundStyle(.secondary)
                }
                ForEach(model.leagueGames) { game in
                    NavigationLink(value: game.id) {
                        VStack(alignment: .leading, spacing: 6) {
                            BugView(attrs: game.attributes, state: game.state, recipe: model.recipe, scale: 0.9)
                            if model.activeGameIds.contains(game.id) {
                                Label("On your Lock Screen", systemImage: "lock.iphone").font(.caption).foregroundStyle(.green)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color(hex: "#14181F"))
                }
            }
            .navigationTitle("Games")
            .navigationDestination(for: String.self) { GameDetailView(gameId: $0) }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("League", selection: $model.selectedLeague) {
                        ForEach(model.leagues) { Text($0.name).tag($0.key) }
                    }
                }
            }
            .onChange(of: model.selectedLeague) { _, _ in
                Task { await model.refresh() }
            }
            .refreshable { await model.refresh() }
        }
    }
}

struct GameDetailView: View {
    @EnvironmentObject private var model: AppModel
    let gameId: String

    var body: some View {
        ScrollView {
            if let game = model.games[gameId] {
                VStack(spacing: 20) {
                    BugView(attrs: game.attributes, state: game.state, recipe: model.recipe, scale: 1.3)
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 22).fill(Color(hex: "#14181F")))
                        .animation(.snappy, value: game.state)

                    let active = model.activeGameIds.contains(game.id)
                    Button {
                        model.toggleActivity(for: game)
                    } label: {
                        Label(active ? "Remove from Lock Screen" : "Put on Lock Screen",
                              systemImage: active ? "xmark.circle" : "lock.iphone")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(active ? .gray : .blue)
                    .disabled(game.state.status == "post" && !active)

                    if !model.activities.enabled {
                        Text("Live Activities are turned off for Score Bug. Turn them on in Settings > Score Bug.")
                            .font(.footnote).foregroundStyle(.orange)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Bug").font(.headline)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(BugRecipe.presets + [model.customRecipe]) { recipe in
                                    Button(recipe.name) { model.choose(recipe) }
                                        .buttonStyle(.bordered)
                                        .tint(recipe.id == model.recipe.id ? .blue : .gray)
                                }
                            }
                        }
                    }
                }
                .padding()
            } else {
                ContentUnavailableView("Game not on today's scoreboard", systemImage: "sportscourt")
                    .padding(.top, 80)
            }
        }
        .navigationTitle(model.games[gameId].map { "\($0.away.abbr) at \($0.home.abbr)" } ?? "Game")
        .navigationBarTitleDisplayMode(.inline)
    }
}
