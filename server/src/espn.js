// Data provider adapter: ESPN's public scoreboard endpoints.
// Unofficial and undocumented. Fine for the prototype and private beta; swap this
// file (and normalize.js) for a licensed provider before a public launch.
import { LEAGUES } from './leagues.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

async function getJson(url, timeoutMs = 10_000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': 'scorebug-prototype/0.1' },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

export async function fetchScoreboard(leagueKey) {
  const l = LEAGUES[leagueKey];
  const json = await getJson(`${BASE}/${l.path}/scoreboard${l.query ? `?${l.query}` : ''}`);
  return json.events ?? [];
}

export async function fetchTeams(leagueKey) {
  const l = LEAGUES[leagueKey];
  const json = await getJson(`${BASE}/${l.path}/teams?limit=1000`, 20_000);
  return (json.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team).filter(Boolean);
}
