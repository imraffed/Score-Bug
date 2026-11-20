import ActivityKit
import Foundation

struct TeamInfo: Codable, Hashable, Identifiable {
    var id: String
    var abbr: String
    var name: String
    var color: String
}

/// The Live Activity contract. `ContentState` is the JSON the server pushes as
/// `content-state`; keep its keys in sync with server/src/normalize.js.
/// Times are Unix seconds (not `Date`) so the push JSON decodes without a custom strategy.
struct ScoreBugAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String  // "pre" | "in" | "post"
        var homeScore: Int
        var awayScore: Int
        var periodLabel: String
        var clockSeconds: Double?
        var clockRunning: Bool
        var clockAsOf: Double
        var situation: String?
        var bases: [Bool]?  // first, second, third
        var possession: String?  // "home" | "away"
    }

    var gameId: String
    var league: String
    var leagueName: String
    var sport: String
    var startTime: Double
    var home: TeamInfo
    var away: TeamInfo
}

typealias GameState = ScoreBugAttributes.ContentState

struct LineupRow: Identifiable {
    let team: TeamInfo
    let score: Int
    let side: String
    var id: String { side }
}

extension ScoreBugAttributes {
    /// Display order: away on top for North American sports, home first for soccer.
    func lineup(_ state: GameState) -> [LineupRow] {
        let h = LineupRow(team: home, score: state.homeScore, side: "home")
        let a = LineupRow(team: away, score: state.awayScore, side: "away")
        return sport == "soccer" ? [h, a] : [a, h]
    }

    var startDate: Date { Date(timeIntervalSince1970: startTime) }
    var deepLink: URL? { URL(string: "scorebug://game/\(gameId)") }
}
