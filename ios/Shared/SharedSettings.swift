import Foundation

/// Settings shared between the app and the widget extension through the App Group.
/// The bug design lives here, on the phone. It is never sent to the server.
enum SharedSettings {
    static let appGroup = "group.com.jeffmchale.scorebug"
    static let defaults = UserDefaults(suiteName: appGroup) ?? .standard

    static var serverURL: String {
        get { defaults.string(forKey: "serverURL") ?? "http://localhost:8787" }
        set { defaults.set(newValue, forKey: "serverURL") }
    }

    static var apiKey: String {
        get { defaults.string(forKey: "apiKey") ?? "" }
        set { defaults.set(newValue, forKey: "apiKey") }
    }

    static var favorites: [String] {
        get { defaults.stringArray(forKey: "favorites") ?? [] }
        set { defaults.set(newValue, forKey: "favorites") }
    }

    static var delaySeconds: Int {
        get { defaults.integer(forKey: "delaySeconds") }
        set { defaults.set(newValue, forKey: "delaySeconds") }
    }

    static var deviceId: String {
        if let id = defaults.string(forKey: "deviceId") { return id }
        let id = UUID().uuidString.lowercased()
        defaults.set(id, forKey: "deviceId")
        return id
    }

    static var recipe: BugRecipe {
        get { decode("recipe") ?? BugRecipe.presets[0] }
        set { encode(newValue, "recipe") }
    }

    static var customRecipe: BugRecipe {
        get { decode("customRecipe") ?? BugRecipe.customDefault }
        set { encode(newValue, "customRecipe") }
    }

    private static func decode(_ key: String) -> BugRecipe? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(BugRecipe.self, from: data)
    }

    private static func encode(_ value: BugRecipe, _ key: String) {
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
    }
}
