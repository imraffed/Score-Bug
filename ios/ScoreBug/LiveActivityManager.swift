import ActivityKit
import Foundation

/// Starts, updates and ends Live Activities, and reports push tokens.
///
/// Two update paths exist on purpose:
///  - Push (the real one): the server sends APNs pushes, so the bug updates with the app closed.
///  - Local (prototype fallback): while the app is open it polls the server and updates the
///    activity itself. This works in the Simulator and without an Apple push key.
@MainActor
final class LiveActivityManager {
    var onStartToken: ((String) -> Void)?
    var onActivityToken: ((_ gameId: String, _ token: String) -> Void)?
    var onChange: (() -> Void)?

    private var observed = Set<String>()
    private var started = false

    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    var activeGameIds: [String] {
        Activity<ScoreBugAttributes>.activities
            .filter { $0.activityState == .active || $0.activityState == .stale }
            .map { $0.attributes.gameId }
    }

    func isActive(_ gameId: String) -> Bool { activeGameIds.contains(gameId) }

    /// Begin listening for tokens and for activities the server started by push.
    func startObserving() {
        guard !started else { return }
        started = true
        for activity in Activity<ScoreBugAttributes>.activities { observe(activity) }
        Task {
            for await activity in Activity<ScoreBugAttributes>.activityUpdates {
                self.observe(activity)
                self.onChange?()
            }
        }
        Task {
            for await data in Activity<ScoreBugAttributes>.pushToStartTokenUpdates {
                self.onStartToken?(Self.hex(data))
            }
        }
    }

    private func observe(_ activity: Activity<ScoreBugAttributes>) {
        guard observed.insert(activity.id).inserted else { return }
        let gameId = activity.attributes.gameId
        Task {
            for await data in activity.pushTokenUpdates {
                self.onActivityToken?(gameId, Self.hex(data))
            }
        }
        Task {
            for await _ in activity.activityStateUpdates {
                self.onChange?()
            }
        }
    }

    func start(_ game: Game) throws {
        guard !isActive(game.id) else { return }
        let content = ActivityContent(state: game.state, staleDate: nil)
        let activity: Activity<ScoreBugAttributes>
        do {
            activity = try Activity<ScoreBugAttributes>.request(attributes: game.attributes, content: content, pushType: .token)
        } catch {
            // No push entitlement (for example a free Apple ID): fall back to app-driven updates.
            activity = try Activity<ScoreBugAttributes>.request(attributes: game.attributes, content: content, pushType: nil)
        }
        observe(activity)
        onChange?()
    }

    func end(gameId: String) async {
        for activity in Activity<ScoreBugAttributes>.activities where activity.attributes.gameId == gameId {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        onChange?()
    }

    /// Local update path: apply fresh server state to any matching activity.
    func apply(_ games: [Game]) async {
        let byId = Dictionary(games.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for activity in Activity<ScoreBugAttributes>.activities {
            guard activity.activityState == .active || activity.activityState == .stale,
                  let game = byId[activity.attributes.gameId],
                  activity.content.state != game.state else { continue }
            let content = ActivityContent(state: game.state, staleDate: nil)
            if game.state.status == "post" {
                await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3600)))
            } else {
                await activity.update(content)
            }
        }
    }

    /// Redraw with the current state so a newly chosen bug design shows immediately.
    func redraw() async {
        for activity in Activity<ScoreBugAttributes>.activities where activity.activityState == .active {
            await activity.update(activity.content)
        }
    }

    private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
