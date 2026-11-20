import SwiftUI
import WidgetKit

@MainActor
final class AppModel: ObservableObject {
    enum Tab { case games, teams, bugs, settings }

    @Published var tab: Tab = .games
    @Published var path: [String] = []  // game ids pushed on the Games tab

    @Published var leagues: [League] = []
    @Published var selectedLeague: String = UserDefaults.standard.string(forKey: "selectedLeague") ?? "nba" {
        didSet { UserDefaults.standard.set(selectedLeague, forKey: "selectedLeague") }
    }
    @Published var games: [String: Game] = [:]
    @Published var teams: [String: [Team]] = [:]
    @Published var activeGameIds: [String] = []
    @Published var errorMessage: String?

    @Published var favorites: [String] = SharedSettings.favorites
    @Published var recipe: BugRecipe = SharedSettings.recipe
    @Published var customRecipe: BugRecipe = SharedSettings.customRecipe
    @Published var delaySeconds: Int = SharedSettings.delaySeconds
    @Published var serverURL: String = SharedSettings.serverURL
    @Published var apiKey: String = SharedSettings.apiKey

    let activities = LiveActivityManager()
    private var pollTask: Task<Void, Never>?
    private var startToken: String?

    var leagueGames: [Game] {
        games.values.filter { $0.league == selectedLeague }.sorted {
            let rank = ["in": 0, "pre": 1, "post": 2]
            let a = rank[$0.state.status] ?? 3, b = rank[$1.state.status] ?? 3
            return a != b ? a < b : $0.startTime < $1.startTime
        }
    }

    // MARK: Lifecycle

    func launch() async {
        activities.onStartToken = { [weak self] token in
            self?.startToken = token
            Task { await self?.syncDevice() }
        }
        activities.onActivityToken = { [weak self] gameId, token in
            Task { await self?.registerActivity(gameId: gameId, token: token) }
        }
        activities.onChange = { [weak self] in
            guard let self else { return }
            self.activeGameIds = self.activities.activeGameIds
        }
        activities.startObserving()
        activeGameIds = activities.activeGameIds
        await loadLeagues()
        await syncDevice()
        setActive(true)
    }

    func setActive(_ active: Bool) {
        pollTask?.cancel()
        pollTask = nil
        guard active else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(4))
            }
        }
    }

    func open(_ url: URL) {
        guard url.scheme == "scorebug", url.host == "game" else { return }
        let id = url.lastPathComponent
        guard !id.isEmpty, id != "/" else { return }
        tab = .games
        path = [id]
    }

    // MARK: Data

    func loadLeagues() async {
        do {
            let res: LeaguesResponse = try await API.current.get("/v1/leagues")
            leagues = res.leagues
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            let api = API.current
            var fresh = try await api.games(league: selectedLeague, delay: delaySeconds)
            let extra = Set(activeGameIds + path).subtracting(fresh.map(\.id))
            if !extra.isEmpty {
                fresh += try await api.games(ids: Array(extra), delay: delaySeconds)
            }
            for game in fresh { games[game.id] = game }
            errorMessage = nil
            if leagues.isEmpty { await loadLeagues() }
            await activities.apply(fresh)
            activeGameIds = activities.activeGameIds
        } catch is CancellationError {
        } catch let error as URLError where error.code == .cancelled {
            _ = error
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadTeams(_ league: String) async {
        guard teams[league] == nil else { return }
        do {
            let res: TeamsResponse = try await API.current.get("/v1/teams", query: [URLQueryItem(name: "league", value: league)])
            teams[league] = res.teams
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Favorites and settings

    func toggleFavorite(_ teamId: String) {
        if let i = favorites.firstIndex(of: teamId) { favorites.remove(at: i) } else { favorites.append(teamId) }
        SharedSettings.favorites = favorites
        WidgetCenter.shared.reloadAllTimelines()
        Task { await syncDevice() }
    }

    func setDelay(_ seconds: Int) {
        delaySeconds = seconds
        SharedSettings.delaySeconds = seconds
        Task { await syncDevice() }
    }

    func saveServer() {
        SharedSettings.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        SharedSettings.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        games = [:]
        teams = [:]
        Task {
            await loadLeagues()
            await syncDevice()
            await refresh()
        }
    }

    func choose(_ newRecipe: BugRecipe) {
        recipe = newRecipe
        SharedSettings.recipe = newRecipe
        if newRecipe.id == "custom" {
            customRecipe = newRecipe
            SharedSettings.customRecipe = newRecipe
        }
        WidgetCenter.shared.reloadAllTimelines()
        Task { await activities.redraw() }
    }

    // MARK: Live Activities

    func toggleActivity(for game: Game) {
        if activities.isActive(game.id) {
            Task {
                await activities.end(gameId: game.id)
                try? await API.current.delete("/v1/devices/\(SharedSettings.deviceId)/activities/\(game.id)")
            }
        } else {
            do {
                try activities.start(game)
            } catch {
                errorMessage = "Couldn't start the Live Activity: \(error.localizedDescription)"
            }
        }
    }

    private func syncDevice() async {
        var body: [String: Any] = ["teams": favorites, "delaySeconds": delaySeconds]
        #if DEBUG
        body["environment"] = "sandbox"
        #else
        body["environment"] = "production"
        #endif
        if let startToken { body["pushToStartToken"] = startToken }
        try? await API.current.put("/v1/devices/\(SharedSettings.deviceId)", json: body)
    }

    private func registerActivity(gameId: String, token: String) async {
        try? await API.current.put("/v1/devices/\(SharedSettings.deviceId)/activities/\(gameId)", json: ["pushToken": token])
    }
}
