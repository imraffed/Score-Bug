import ActivityKit
import SwiftUI
import WidgetKit

/// The live product: Lock Screen banner plus the three Dynamic Island sizes.
/// The bug design is read from the App Group each time the system redraws.
struct ScoreBugLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ScoreBugAttributes.self) { context in
            LockScreenBug(attrs: context.attributes, state: context.state, stale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.78))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(context.attributes.deepLink)
        } dynamicIsland: { context in
            let attrs = context.attributes
            let state = context.state
            let recipe = SharedSettings.recipe
            let rows = attrs.lineup(state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    IslandTeam(row: rows[0], state: state, recipe: recipe, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    IslandTeam(row: rows[1], state: state, recipe: recipe, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(attrs.leagueName.uppercased()).foregroundStyle(.secondary)
                        if state.status == "pre" {
                            Text(attrs.startDate, format: .dateTime.hour().minute())
                        } else {
                            Text(state.periodLabel)
                            ClockText(state: state).foregroundStyle(.white)
                        }
                    }
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if state.bases != nil || !(state.situation ?? "").isEmpty {
                        HStack(spacing: 10) {
                            if let bases = state.bases, bases.count == 3 { BasesView(bases: bases, size: 6) }
                            if let situation = state.situation { Text(situation) }
                        }
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.8))
                        .padding(.top, 4)
                    }
                }
            } compactLeading: {
                IslandCompact(row: rows[0], state: state, recipe: recipe, scoreFirst: false)
            } compactTrailing: {
                IslandCompact(row: rows[1], state: state, recipe: recipe, scoreFirst: true)
            } minimal: {
                Text(state.status == "pre" ? rows[0].team.abbr : "\(rows[0].score)-\(rows[1].score)")
                    .font(recipe.labelFont(11))
                    .foregroundStyle(Color(hex: recipe.scoreColor))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .widgetURL(attrs.deepLink)
            .keylineTint(Color(hex: rows[0].team.color))
        }
    }
}

struct LockScreenBug: View {
    let attrs: ScoreBugAttributes
    let state: GameState
    var stale: Bool = false

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(attrs.leagueName.uppercased())
                Spacer()
                if state.status == "in" {
                    Text(stale ? "RECONNECTING" : "● LIVE").foregroundStyle(stale ? Color.gray : Color.red)
                } else if state.status == "post" {
                    Text("FINAL")
                }
            }
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(.white.opacity(0.6))
            BugView(attrs: attrs, state: state, recipe: SharedSettings.recipe)
        }
        .padding(12)
    }
}

private struct IslandCompact: View {
    let row: LineupRow
    let state: GameState
    let recipe: BugRecipe
    let scoreFirst: Bool

    var body: some View {
        HStack(spacing: 5) {
            if scoreFirst { score }
            if !scoreFirst { TeamDot(color: row.team.color, size: 9) }
            Text(row.team.abbr).font(recipe.labelFont(14)).foregroundStyle(.white)
            if scoreFirst { TeamDot(color: row.team.color, size: 9) }
            if !scoreFirst { score }
        }
        .lineLimit(1)
    }

    @ViewBuilder
    private var score: some View {
        if state.status != "pre" {
            Text("\(row.score)")
                .font(recipe.labelFont(14))
                .monospacedDigit()
                .foregroundStyle(Color(hex: recipe.scoreColor))
                .contentTransition(.numericText())
        }
    }
}

private struct IslandTeam: View {
    let row: LineupRow
    let state: GameState
    let recipe: BugRecipe
    let alignment: HorizontalAlignment

    var body: some View {
        VStack(alignment: alignment, spacing: 0) {
            HStack(spacing: 6) {
                if alignment == .leading { TeamDot(color: row.team.color) }
                Text(row.team.abbr).font(recipe.labelFont(16))
                if alignment == .trailing { TeamDot(color: row.team.color) }
            }
            if state.status != "pre" {
                Text("\(row.score)")
                    .font(recipe.scoreFont(32))
                    .monospacedDigit()
                    .foregroundStyle(Color(hex: recipe.scoreColor))
                    .contentTransition(.numericText())
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .padding(alignment == .leading ? .leading : .trailing, 4)
    }
}
