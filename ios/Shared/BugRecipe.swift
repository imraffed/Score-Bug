import SwiftUI

/// A score bug design is a recipe, not code: Live Activities cannot download code,
/// so every bug (built-in or user-made) is a set of values one renderer understands.
/// These are original era-inspired designs. No network marks, no team logos.
struct BugRecipe: Codable, Hashable, Identifiable {
    enum Material: String, Codable, CaseIterable, Identifiable {
        case overlay, panel, chrome, glass, flat
        var id: String { rawValue }
        var label: String {
            switch self {
            case .overlay: return "Text over picture"
            case .panel: return "Boxed panel"
            case .chrome: return "Chrome bevel"
            case .glass: return "Glass strip"
            case .flat: return "Flat color"
            }
        }
    }

    enum Typeface: String, Codable, CaseIterable, Identifiable {
        case block, condensed, techno, light, modern, mono
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    var id: String
    var name: String
    var blurb: String
    var material: Material
    var typeface: Typeface
    var italic: Bool
    var scoreColor: String
    var panelColor: String
    var accentColor: String
    var scanlines: Bool
    var useCityNames: Bool

    func labelFont(_ size: CGFloat) -> Font {
        let font: Font
        switch typeface {
        case .block: font = .system(size: size * 0.82, weight: .black).width(.expanded)
        case .condensed: font = .system(size: size * 1.12, weight: .bold).width(.condensed)
        case .techno: font = .system(size: size, weight: .heavy, design: .rounded)
        case .light: font = .system(size: size, weight: .semibold)
        case .modern: font = .system(size: size, weight: .heavy)
        case .mono: font = .system(size: size, weight: .bold, design: .monospaced)
        }
        return italic ? font.italic() : font
    }

    func scoreFont(_ size: CGFloat) -> Font {
        if typeface == .light { return .system(size: size * 1.1, weight: .light) }
        return labelFont(size)
    }

    static let presets: [BugRecipe] = [
        BugRecipe(id: "cg85", name: "'85 Character Generator",
                  blurb: "Before the permanent score box. Heavy block type with a hard shadow and tube-TV scanlines.",
                  material: .overlay, typeface: .block, italic: false,
                  scoreColor: "#FFE14A", panelColor: "#000000", accentColor: "#FFE14A", scanlines: true, useCityNames: true),
        BugRecipe(id: "box94", name: "'94 Corner Box",
                  blurb: "The first always-on score box. Deep blue panel, gold keyline, italic condensed type.",
                  material: .panel, typeface: .condensed, italic: true,
                  scoreColor: "#FFFFFF", panelColor: "#16327F", accentColor: "#D9B44A", scanlines: false, useCityNames: false),
        BugRecipe(id: "chrome01", name: "'01 Chrome Banner",
                  blurb: "Peak bevel. Brushed-metal frame, glossy team plates, yellow digits on black.",
                  material: .chrome, typeface: .techno, italic: false,
                  scoreColor: "#FFE14A", panelColor: "#0B0B0D", accentColor: "#B3121C", scanlines: false, useCityNames: false),
        BugRecipe(id: "glass10", name: "'10 HD Glass",
                  blurb: "Early widescreen HD. A thin translucent strip, light numerals, team color as an edge stripe.",
                  material: .glass, typeface: .light, italic: false,
                  scoreColor: "#FFFFFF", panelColor: "#141820", accentColor: "#FFFFFF", scanlines: false, useCityNames: false),
        BugRecipe(id: "flat24", name: "Modern Flat",
                  blurb: "Today's look. Solid team color blocks, tight heavy type, nothing decorative.",
                  material: .flat, typeface: .modern, italic: false,
                  scoreColor: "#FFFFFF", panelColor: "#FFFFFF", accentColor: "#0B0B0D", scanlines: false, useCityNames: false),
    ]

    static let customDefault = BugRecipe(
        id: "custom", name: "My Bug", blurb: "Your own design.",
        material: .panel, typeface: .mono, italic: false,
        scoreColor: "#7CFFB2", panelColor: "#10231A", accentColor: "#7CFFB2", scanlines: true, useCityNames: false)
}

extension Color {
    /// "#RRGGBB" or "RRGGBB". Falls back to gray on anything else.
    init(hex: String) {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else {
            self = .gray
            return
        }
        self.init(.sRGB,
                  red: Double((value >> 16) & 0xFF) / 255,
                  green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255,
                  opacity: 1)
    }
}
