import Foundation

struct APIError: LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

/// Client for the Score Bug server. Used by the app and by the widget extension.
struct API {
    var base: String
    var apiKey: String

    static var current: API { API(base: SharedSettings.serverURL, apiKey: SharedSettings.apiKey) }

    private func request(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) throws -> URLRequest {
        let trimmed = base.hasSuffix("/") ? String(base.dropLast()) : base
        guard var comps = URLComponents(string: trimmed + path) else { throw APIError(message: "The server address is not a valid URL.") }
        if !query.isEmpty { comps.queryItems = query }
        guard let url = comps.url else { throw APIError(message: "The server address is not a valid URL.") }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = method
        req.httpBody = body
        if body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if !apiKey.isEmpty { req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization") }
        return req
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "No response from the server.") }
        guard (200..<300).contains(http.statusCode) else {
            let detail = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw APIError(message: detail ?? "The server returned \(http.statusCode).")
        }
        return data
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(try request(path, query: query)))
    }

    func put(_ path: String, json: [String: Any]) async throws {
        let body = try JSONSerialization.data(withJSONObject: json)
        _ = try await send(try request(path, method: "PUT", body: body))
    }

    func delete(_ path: String) async throws {
        _ = try await send(try request(path, method: "DELETE"))
    }

    func games(league: String? = nil, ids: [String] = [], teams: [String] = [], delay: Int = 0) async throws -> [Game] {
        var q: [URLQueryItem] = []
        if let league { q.append(URLQueryItem(name: "league", value: league)) }
        if !ids.isEmpty { q.append(URLQueryItem(name: "ids", value: ids.joined(separator: ","))) }
        if !teams.isEmpty { q.append(URLQueryItem(name: "team", value: teams.joined(separator: ","))) }
        if delay > 0 { q.append(URLQueryItem(name: "delay", value: String(delay))) }
        let res: GamesResponse = try await get("/v1/games", query: q)
        return res.games
    }
}
