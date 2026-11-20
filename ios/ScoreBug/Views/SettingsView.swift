import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel

    private let presets: [(String, Int)] = [("Live", 0), ("Cable or satellite", 10), ("Streaming", 30), ("Slow streaming", 45)]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("My TV is", selection: Binding(get: { model.delaySeconds }, set: { model.setDelay($0) })) {
                        ForEach(presets, id: \.1) { Text($0.0).tag($0.1) }
                        if !presets.contains(where: { $0.1 == model.delaySeconds }) {
                            Text("Custom").tag(model.delaySeconds)
                        }
                    }
                    Stepper("Hold scores \(model.delaySeconds) s",
                            value: Binding(get: { model.delaySeconds }, set: { model.setDelay($0) }),
                            in: 0...120, step: 5)
                } header: {
                    Text("TV Sync")
                } footer: {
                    Text("Scores can reach your phone before your TV shows the play. Add a delay so the bug matches what you see.")
                }

                Section {
                    TextField("Server address", text: $model.serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("API key (optional)", text: $model.apiKey)
                    Button("Save and Reconnect") { model.saveServer() }
                } header: {
                    Text("Score server")
                } footer: {
                    Text("In the Simulator use http://localhost:8787. On a phone use your computer's address on the same Wi-Fi, such as http://192.168.1.20:8787.")
                }

                Section("Status") {
                    LabeledContent("Server", value: model.errorMessage == nil ? "Connected" : "Not reachable")
                    LabeledContent("Live Activities", value: model.activities.enabled ? "Allowed" : "Turned off")
                    LabeledContent("On Lock Screen now", value: "\(model.activeGameIds.count)")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
