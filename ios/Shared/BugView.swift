import SwiftUI

/// Draws any game in any bug design. Used on the Lock Screen, in widgets and in the app.
struct BugView: View {
    let attrs: ScoreBugAttributes
    let state: GameState
    let recipe: BugRecipe
    var scale: CGFloat = 1

    private var material: BugRecipe.Material { recipe.material }
    private var tight: Bool { material == .flat || material == .glass }

    var body: some View {
        HStack(spacing: tight ? 0 : 6 * scale) {
            VStack(spacing: tight ? 0 : 4 * scale) {
                ForEach(attrs.lineup(state)) { row in
                    teamRow(row)
                }
            }
            .padding(material == .panel ? 3 * scale : 0)
            .background(teamsBackground)
            meta
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(material == .chrome ? 4 * scale : 0)
        .background(frameBackground)
        .clipShape(RoundedRectangle(cornerRadius: frameRadius, style: .continuous))
        .overlay {
            if recipe.scanlines { Scanlines().clipShape(RoundedRectangle(cornerRadius: frameRadius, style: .continuous)) }
        }
        .foregroundStyle(.white)
    }

    private var frameRadius: CGFloat {
        switch material {
        case .flat: return 12 * scale
        case .chrome: return 5 * scale
        case .glass: return 3 * scale
        default: return 6 * scale
        }
    }

    // MARK: Team rows

    private func teamRow(_ row: LineupRow) -> some View {
        HStack(spacing: 8 * scale) {
            if material == .panel {
                Rectangle()
                    .fill(Color(hex: row.team.color))
                    .frame(width: 12 * scale, height: 12 * scale)
                    .overlay(Rectangle().stroke(Color.white.opacity(0.6), lineWidth: 1))
            }
            Text(recipe.useCityNames ? row.team.name.uppercased() : row.team.abbr)
                .font(recipe.labelFont(19 * scale))
                .tracking(recipe.typeface == .light ? 1.5 * scale : 0)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if state.possession == row.side {
                Image(systemName: "arrowtriangle.left.fill").font(.system(size: 8 * scale))
            }
            Spacer(minLength: 4 * scale)
            if state.status != "pre" {
                Text("\(row.score)")
                    .font(recipe.scoreFont(23 * scale))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(Color(hex: recipe.scoreColor))
                    .padding(.horizontal, material == .chrome ? 6 * scale : 0)
                    .background {
                        if material == .chrome {
                            RoundedRectangle(cornerRadius: 2 * scale).fill(Color(hex: recipe.panelColor))
                        }
                    }
            }
        }
        .padding(.leading, (material == .glass ? 13 : 8) * scale)
        .padding(.trailing, (material == .chrome ? 3 : 8) * scale)
        .padding(.vertical, (material == .flat ? 6 : 3) * scale)
        .frame(maxHeight: .infinity)
        .background { rowBackground(row.team) }
        .shadow(color: .black.opacity(material == .overlay || material == .chrome ? 0.9 : 0), radius: 0,
                x: material == .overlay ? 2 : 1, y: material == .overlay ? 2 : 1)
    }

    @ViewBuilder
    private func rowBackground(_ team: TeamInfo) -> some View {
        switch material {
        case .chrome:
            ZStack {
                Color(hex: team.color)
                LinearGradient(colors: [.white.opacity(0.5), .white.opacity(0), .black.opacity(0.28)],
                               startPoint: .top, endPoint: .bottom)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3 * scale))
        case .flat:
            Color(hex: team.color)
        case .glass:
            HStack(spacing: 0) {
                Color(hex: team.color).frame(width: 5 * scale)
                Color.clear
            }
        case .overlay, .panel:
            Color.clear
        }
    }

    @ViewBuilder
    private var teamsBackground: some View {
        if material == .panel {
            let panel = Color(hex: recipe.panelColor)
            RoundedRectangle(cornerRadius: 6 * scale)
                .fill(LinearGradient(colors: [panel.opacity(0.75), panel], startPoint: .top, endPoint: .bottom))
                .background(RoundedRectangle(cornerRadius: 6 * scale).fill(Color.white.opacity(0.25)))
                .overlay(RoundedRectangle(cornerRadius: 6 * scale).stroke(Color(hex: recipe.accentColor), lineWidth: 2 * scale))
        }
    }

    @ViewBuilder
    private var frameBackground: some View {
        switch material {
        case .chrome:
            LinearGradient(stops: [
                .init(color: Color(hex: "#F4F6F9"), location: 0),
                .init(color: Color(hex: "#8A92A0"), location: 0.48),
                .init(color: Color(hex: "#5D6470"), location: 0.52),
                .init(color: Color(hex: "#C5CAD2"), location: 1),
            ], startPoint: .top, endPoint: .bottom)
        case .glass:
            LinearGradient(colors: [.white.opacity(0.18), .white.opacity(0.04), .black.opacity(0.25)],
                           startPoint: .top, endPoint: .bottom)
                .overlay(Rectangle().stroke(Color.white.opacity(0.22), lineWidth: 1))
        default:
            Color.clear
        }
    }

    // MARK: Period, clock, situation

    private var meta: some View {
        VStack(spacing: 2 * scale) {
            if state.status == "pre" {
                Text(attrs.startDate, format: .dateTime.weekday(.abbreviated))
                Text(attrs.startDate, format: .dateTime.hour().minute())
            } else {
                if !state.periodLabel.isEmpty {
                    Text(state.periodLabel).fontWeight(material == .flat ? .heavy : nil)
                }
                ClockText(state: state)
                if let bases = state.bases, bases.count == 3 {
                    BasesView(bases: bases, size: 7 * scale)
                }
                if let situation = state.situation, !situation.isEmpty {
                    Text(situation)
                }
            }
        }
        .font(recipe.labelFont(13 * scale))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .multilineTextAlignment(.center)
        .foregroundStyle(metaColor)
        .padding(.horizontal, 8 * scale)
        .padding(.vertical, 3 * scale)
        .frame(width: 84 * scale)
        .frame(maxHeight: .infinity)
        .background { metaBackground }
        .shadow(color: .black.opacity(material == .overlay ? 0.9 : 0), radius: 0, x: 2, y: 2)
    }

    private var metaColor: Color {
        switch material {
        case .overlay, .panel: return Color(hex: recipe.accentColor)
        case .flat: return Color(hex: recipe.accentColor)
        case .chrome, .glass: return .white
        }
    }

    @ViewBuilder
    private var metaBackground: some View {
        switch material {
        case .panel:
            RoundedRectangle(cornerRadius: 6 * scale)
                .fill(Color.black)
                .overlay(RoundedRectangle(cornerRadius: 6 * scale).stroke(Color(hex: recipe.accentColor), lineWidth: 2 * scale))
        case .chrome:
            let accent = Color(hex: recipe.accentColor)
            ZStack {
                accent
                LinearGradient(colors: [.white.opacity(0.15), .black.opacity(0.45)], startPoint: .top, endPoint: .bottom)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3 * scale))
        case .glass:
            HStack(spacing: 0) {
                Color.white.opacity(0.22).frame(width: 1)
                Color.clear
            }
        case .flat:
            Color(hex: recipe.panelColor)
        case .overlay:
            Color.clear
        }
    }
}

/// Game clock. Counts down on the phone when the server says the clock is running,
/// so a running clock costs no pushes.
struct ClockText: View {
    let state: GameState

    var body: some View {
        if let seconds = state.clockSeconds {
            if state.clockRunning && seconds > 0 {
                let start = Date(timeIntervalSince1970: state.clockAsOf)
                Text(timerInterval: start...start.addingTimeInterval(seconds), countsDown: true)
                    .monospacedDigit()
            } else {
                Text(Self.format(seconds)).monospacedDigit()
            }
        }
    }

    static func format(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// Baseball diamond: second base on top, third at left, first at right.
struct BasesView: View {
    let bases: [Bool]
    var size: CGFloat = 7

    var body: some View {
        ZStack {
            base(bases[1]).offset(y: -size * 0.8)
            base(bases[2]).offset(x: -size * 1.5, y: size * 0.7)
            base(bases[0]).offset(x: size * 1.5, y: size * 0.7)
        }
        .frame(width: size * 5, height: size * 3.4)
        .accessibilityLabel(label)
    }

    private func base(_ occupied: Bool) -> some View {
        Rectangle()
            .fill(.foreground)
            .opacity(occupied ? 1 : 0)
            .background(Rectangle().stroke(.foreground, lineWidth: 1.2))
            .frame(width: size, height: size)
            .rotationEffect(.degrees(45))
    }

    private var label: String {
        let names = ["first", "second", "third"]
        let on = names.indices.filter { bases[$0] }.map { names[$0] }
        return on.isEmpty ? "Bases empty" : "Runners on " + on.joined(separator: ", ")
    }
}

struct Scanlines: View {
    var body: some View {
        GeometryReader { geo in
            Path { path in
                var y: CGFloat = 0
                while y < geo.size.height {
                    path.addRect(CGRect(x: 0, y: y, width: geo.size.width, height: 1))
                    y += 3
                }
            }
            .fill(Color.black.opacity(0.28))
        }
        .allowsHitTesting(false)
    }
}

/// Team color dot with a light ring so dark colors stay visible on black.
struct TeamDot: View {
    let color: String
    var size: CGFloat = 10

    var body: some View {
        Circle()
            .fill(Color(hex: color))
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.white.opacity(0.75), lineWidth: 1.5))
    }
}
