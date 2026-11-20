import SwiftUI
import UIKit

struct BugsView: View {
    @EnvironmentObject private var model: AppModel

    /// Preview with a live game if there is one, so people see their own night's scores.
    private var previewGame: Game {
        model.leagueGames.first { $0.state.status == "in" } ?? model.leagueGames.first ?? .sample
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Eras") {
                    ForEach(BugRecipe.presets) { recipe in
                        row(recipe)
                    }
                }
                Section("Yours") {
                    row(model.customRecipe)
                    NavigationLink("Edit My Bug") { BugEditorView() }
                }
            }
            .navigationTitle("Bugs")
        }
    }

    private func row(_ recipe: BugRecipe) -> some View {
        Button {
            model.choose(recipe)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(recipe.name).font(.headline).foregroundStyle(.primary)
                    Spacer()
                    if recipe.id == model.recipe.id {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue)
                    }
                }
                BugView(attrs: previewGame.attributes, state: previewGame.state, recipe: recipe)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Color(hex: "#14181F")))
                Text(recipe.blurb).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}

struct BugEditorView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = SharedSettings.customRecipe

    var body: some View {
        Form {
            Section {
                BugView(attrs: Game.sample.attributes, state: Game.sample.state, recipe: draft)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Color(hex: "#14181F")))
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
            }
            Section("Shape") {
                Picker("Material", selection: $draft.material) {
                    ForEach(BugRecipe.Material.allCases) { Text($0.label).tag($0) }
                }
                Picker("Type", selection: $draft.typeface) {
                    ForEach(BugRecipe.Typeface.allCases) { Text($0.label).tag($0) }
                }
                Toggle("Italic", isOn: $draft.italic)
                Toggle("City names instead of abbreviations", isOn: $draft.useCityNames)
                Toggle("Scanlines", isOn: $draft.scanlines)
            }
            Section("Colors") {
                ColorPicker("Score", selection: color(\.scoreColor), supportsOpacity: false)
                ColorPicker("Panel", selection: color(\.panelColor), supportsOpacity: false)
                ColorPicker("Accent", selection: color(\.accentColor), supportsOpacity: false)
            }
            Section {
                Button("Use This Bug") { model.choose(draft) }
            } footer: {
                Text("Your bug stays on this phone.")
            }
        }
        .navigationTitle("My Bug")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func color(_ keyPath: WritableKeyPath<BugRecipe, String>) -> Binding<Color> {
        Binding(
            get: { Color(hex: draft[keyPath: keyPath]) },
            set: { draft[keyPath: keyPath] = Self.hex($0) })
    }

    private static func hex(_ color: Color) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        let clamp = { (v: CGFloat) in Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", clamp(r), clamp(g), clamp(b))
    }
}
