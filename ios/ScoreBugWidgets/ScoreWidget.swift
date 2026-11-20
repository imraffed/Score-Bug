import SwiftUI
import WidgetKit

/// Home Screen and Lock Screen widget. iOS budgets widget refreshes, so this shows a
/// recent score, not a live one. The Live Activity is the real-time surface.
struct ScoreEntry: TimelineEntry {
    let date: Date
    let game: Game?
    let recipe: BugRecipe
    let message: String?
}

struct ScoreProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScoreEntry {
        ScoreEntry(date: Date(), game: .sample, recipe: SharedSettings.recipe, message: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (ScoreEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            Task { completion(await load()) }
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScoreEntry>) -> Void) {
        Task {
            let entry = await load()
            let live = entry.game?.state.status == "in"
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(live ? 5 * 60 : 30 * 60))))
        }
    }

    private func load() async -> ScoreEntry {
        let recipe = SharedSettings.recipe
        let favorites = SharedSettings.favorites
        guard !favorites.isEmpty else {
            return ScoreEntry(date: Date(), game: nil, recipe: recipe, message: "Pick a team in Score Bug")
        }
        do {
            let games = try await API.current.games(teams: favorites)
            // Live first, then the next game to start, then the most recent final.
            let live = games.first { $0.state.status == "in" }
            let next = games.filter { $0.state.status == "pre" }.min { $0.startTime < $1.startTime }
            let last = games.filter { $0.state.status == "post" }.max { $0.startTime < $1.startTime }
            guard let pick = live ?? next ?? last else {
                return ScoreEntry(date: Date(), game: nil, recipe: recipe, message: "No games today")
            }
            return ScoreEntry(date: Date(), game: pick, recipe: recipe, message: nil)
        } catch {
            return ScoreEntry(date: Date(), game: nil, recipe: recipe, message: "Can't reach the score server")
        }
    }
}

struct ScoreWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ScoreWidget", provider: ScoreProvider()) { entry in
            ScoreWidgetView(entry: entry)
        }
        .configurationDisplayName("Score Bug")
        .description("Your team's latest score in your chosen bug.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct ScoreWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ScoreEntry

    var body: some View {
        content
            .containerBackground(for: .widget) { Color(hex: "#14181F") }
            .widgetURL(entry.game?.attributes.deepLink)
    }

    @ViewBuilder
    private var content: some View {
        if let game = entry.game {
            let attrs = game.attributes
            let rows = attrs.lineup(game.state)
            switch family {
            case .accessoryInline:
                Text(line(rows, game))
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    ForEach(rows) { row in
                        HStack {
                            Text(row.team.abbr).fontWeight(.bold)
                            Spacer()
                            if game.state.status != "pre" { Text("\(row.score)").monospacedDigit() }
                        }
                    }
                    Text(statusLine(game)).font(.caption2).foregroundStyle(.secondary)
                }
            case .systemSmall:
                VStack(alignment: .leading, spacing: 6) {
                    header(game)
                    Spacer(minLength: 0)
                    ForEach(rows) { row in
                        HStack(spacing: 7) {
                            TeamDot(color: row.team.color)
                            Text(row.team.abbr).font(entry.recipe.labelFont(20))
                            Spacer(minLength: 2)
                            if game.state.status != "pre" {
                                Text("\(row.score)")
                                    .font(entry.recipe.labelFont(20))
                                    .monospacedDigit()
                                    .foregroundStyle(Color(hex: entry.recipe.scoreColor))
                            }
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    }
                    Spacer(minLength: 0)
                    Text(statusLine(game))
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.6))
                }
                .foregroundStyle(.white)
            default:
                VStack(spacing: 10) {
                    header(game)
                    BugView(attrs: attrs, state: game.state, recipe: entry.recipe)
                }
            }
        } else {
            Text(entry.message ?? "Score Bug")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private func header(_ game: Game) -> some View {
        HStack {
            Text(game.leagueName.uppercased())
            Spacer()
            Text("AS OF ") + Text(entry.date, style: .time)
        }
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(.white.opacity(0.6))
        .lineLimit(1)
    }

    private func statusLine(_ game: Game) -> String {
        if game.state.status == "pre" {
            return game.attributes.startDate.formatted(.dateTime.weekday(.abbreviated).hour().minute())
        }
        if let clock = game.state.clockSeconds {
            return "\(game.state.periodLabel) \(ClockText.format(clock))"
        }
        return game.state.periodLabel
    }

    private func line(_ rows: [LineupRow], _ game: Game) -> String {
        if game.state.status == "pre" {
            return "\(rows[0].team.abbr) vs \(rows[1].team.abbr) \(statusLine(game))"
        }
        return "\(rows[0].team.abbr) \(rows[0].score), \(rows[1].team.abbr) \(rows[1].score) · \(game.state.periodLabel)"
    }
}
