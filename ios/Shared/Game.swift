import Foundation

struct Game: Codable, Identifiable, Hashable {
    var id: String
    var league: String
    var leagueName: String
    var sport: String
    var startTime: Double
    var home: TeamInfo
    var away: TeamInfo
    var state: GameState

    var attributes: ScoreBugAttributes {
        ScoreBugAttributes(gameId: id, league: league, leagueName: leagueName, sport: sport,
                           startTime: startTime, home: home, away: away)
    }

    static let sample = Game(
        id: "wnba-sample", league: "wnba", leagueName: "WNBA", sport: "basketball",
        startTime: Date().timeIntervalSince1970 - 5400,
        home: TeamInfo(id: "wnba-17", abbr: "LVA", name: "Las Vegas", color: "#A6192E"),
        away: TeamInfo(id: "wnba-9", abbr: "NYL", name: "New York", color: "#1F7F6C"),
        state: GameState(status: "in", homeScore: 74, awayScore: 78, periodLabel: "4TH",
                         clockSeconds: 302, clockRunning: false, clockAsOf: 0,
                         situation: nil, bases: nil, possession: nil))
}

struct League: Codable, Identifiable, Hashable {
    var key: String
    var name: String
    var sport: String
    var id: String { key }
}

struct Team: Codable, Identifiable, Hashable {
    var id: String
    var abbr: String
    var name: String
    var fullName: String
    var color: String
}

struct GamesResponse: Codable { var games: [Game] }
struct TeamsResponse: Codable { var teams: [Team] }
struct LeaguesResponse: Codable { var leagues: [League] }
