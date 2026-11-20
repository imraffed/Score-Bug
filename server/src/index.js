import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Apns } from './apns.js';
import { Dispatcher } from './dispatcher.js';
import { fetchScoreboard, fetchTeams } from './espn.js';
import { createServer } from './http.js';
import { Poller } from './poller.js';
import { Store } from './store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = process.env;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const store = new Store(env.DATA_FILE ?? path.join(root, 'data', 'devices.json'));
const poller = new Poller({ fetchScoreboard, liveMs: Number(env.POLL_LIVE_MS) || 4000, idleMs: Number(env.POLL_IDLE_MS) || 60_000, clockMode: env.CLOCK_MODE === 'infer' ? 'infer' : 'step', clockPushMinMs: (Number(env.CLOCK_PUSH_MIN_SECONDS) || 10) * 1000, log });
const apns = new Apns({ keyPath: env.APNS_KEY_PATH, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, bundleId: env.APNS_BUNDLE_ID, log });
new Dispatcher({ poller, store, apns, startLeadSeconds: Number(env.START_LEAD_SECONDS) || 600, lingerSeconds: Number(env.LINGER_SECONDS) || 3600, log });

if (env.LOG_CHANGES) {
  poller.on('game', (g, prev, significant) => {
    if (prev && significant) log(`[game] ${g.id} ${g.away.abbr} ${g.state.awayScore} - ${g.home.abbr} ${g.state.homeScore} ${g.state.periodLabel} ${g.state.clockSeconds ?? ''}${g.state.clockRunning ? ' running' : ''} ${g.state.situation ?? ''}`);
  });
}

for (const key of store.followedLeagues()) poller.touch(key, 24 * 3600 * 1000);
poller.start();

const port = Number(env.PORT) || 8787;
createServer({ poller, store, fetchTeams, apiKey: env.API_KEY ?? '', log }).listen(port, env.HOST ?? '0.0.0.0', () => {
  log(`Score Bug server on http://localhost:${port}  (APNs: ${apns.enabled ? 'live' : 'dry-run, no key configured'})`);
});
