import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { Apns, endPayload, makeJwt, startPayload, updatePayload } from '../src/apns.js';
import { Dispatcher } from '../src/dispatcher.js';
import { createServer } from '../src/http.js';
import { Poller } from '../src/poller.js';
import { Store } from '../src/store.js';

const ev = (clock, home, away, detail, state = 'in') => ({
  id: '500', date: new Date(Date.now() - 3600_000).toISOString(),
  competitions: [{
    status: { clock, type: { state, shortDetail: detail ?? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')} - 4th` } },
    competitors: [
      { homeAway: 'home', score: String(home), team: { id: '17', abbreviation: 'LVA', location: 'Las Vegas', color: 'a6192e' } },
      { homeAway: 'away', score: String(away), team: { id: '9', abbreviation: 'NYL', location: 'New York', color: '1f7f6c' } },
    ],
  }],
});

function rig(clockMode = 'step') {
  let now = 1_800_000_000_000;
  const poller = new Poller({ fetchScoreboard: async () => [], now: () => now, clockMode });
  const emitted = [];
  poller.on('game', (g, prev, significant) => emitted.push({ g, significant }));
  return { poller, emitted, advance: (ms) => (now += ms) };
}

test('poller: stepped clock pushes changes at most every 10 s, scores at once', () => {
  const { poller, emitted, advance } = rig();
  poller.ingest('wnba', [ev(302, 74, 78)]);
  advance(4000); poller.ingest('wnba', [ev(298, 74, 78)]);
  assert.equal(emitted.length, 1, 'clock-only change inside 10 s is held');
  advance(4000); poller.ingest('wnba', [ev(290, 76, 78)]);
  assert.equal(emitted.length, 2, 'score change goes immediately');
  assert.equal(emitted[1].g.state.clockRunning, false);
  advance(4000); poller.ingest('wnba', [ev(286, 76, 78)]);
  advance(4000); poller.ingest('wnba', [ev(282, 76, 78)]);
  assert.equal(emitted.length, 2);
  advance(4000); poller.ingest('wnba', [ev(278, 76, 78)]);
  assert.equal(emitted.length, 3, 'clock catches up after 10 s');
  assert.equal(emitted[2].g.state.clockSeconds, 278);
  for (let i = 0; i < 5; i++) { advance(4000); poller.ingest('wnba', [ev(278, 76, 78)]); }
  assert.equal(emitted.length, 3, 'a stopped clock sends nothing');
});

test('poller (infer mode): running clock is inferred and does not spam pushes', () => {
  const { poller, emitted, advance } = rig('infer');
  poller.ingest('wnba', [ev(302, 74, 78)]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].g.state.clockRunning, false);

  advance(4000); poller.ingest('wnba', [ev(298, 74, 78)]);
  assert.equal(emitted.length, 2, 'clock started: one push');
  assert.equal(emitted[1].g.state.clockRunning, true);

  for (const c of [294, 290, 286]) { advance(4000); poller.ingest('wnba', [ev(c, 74, 78)]); }
  assert.equal(emitted.length, 2, 'steady countdown sends nothing');

  advance(4000); poller.ingest('wnba', [ev(282, 76, 78)]);
  assert.equal(emitted.length, 3, 'score change pushes');

  for (let i = 0; i < 3; i++) { advance(4000); poller.ingest('wnba', [ev(282, 76, 78)]); }
  assert.equal(emitted.length, 4, 'clock stop pushes once');
  assert.equal(emitted[3].g.state.clockRunning, false);
  assert.equal(emitted[3].g.state.clockSeconds, 282);
});

test('poller: TV Sync returns the state as it stood N seconds ago', () => {
  const { poller, advance } = rig();
  poller.ingest('wnba', [ev(302, 74, 78)]);
  advance(20_000); poller.ingest('wnba', [ev(302, 77, 78)]);
  advance(5_000);
  assert.equal(poller.gameAt('wnba-500', 0).state.homeScore, 77);
  assert.equal(poller.gameAt('wnba-500', 10).state.homeScore, 74);
  assert.equal(poller.gameAt('wnba-500', 60).state.homeScore, 74);
  assert.equal(poller.gameAt('nope', 0), null);
});

test('poller: games that leave the scoreboard are dropped', () => {
  const { poller } = rig();
  let gone = 0;
  poller.on('gone', () => gone++);
  poller.ingest('wnba', [ev(302, 74, 78)]);
  poller.ingest('wnba', []);
  assert.equal(poller.games.size, 0);
  assert.equal(gone, 1);
});

test('apns payloads match what ActivityKit expects', () => {
  const { poller } = rig();
  poller.ingest('wnba', [ev(302, 74, 78)]);
  const game = poller.games.get('wnba-500');
  const up = updatePayload(game.state, 100);
  assert.equal(up.aps.event, 'update');
  assert.equal(up.aps['content-state'].homeScore, 74);
  const start = startPayload(game, 100);
  assert.equal(start.aps['attributes-type'], 'ScoreBugAttributes');
  assert.deepEqual(Object.keys(start.aps.attributes).sort(), ['away', 'gameId', 'home', 'league', 'leagueName', 'sport', 'startTime']);
  assert.ok(start.aps.alert.title);
  assert.equal(endPayload(game.state, 100, 3600).aps['dismissal-date'], 3700);
  assert.ok(JSON.stringify(start).length < 4096, 'fits the APNs 4 KB limit');
});

test('apns JWT is a valid ES256 signature', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwt = makeJwt({ key: privateKey.export({ type: 'pkcs8', format: 'pem' }), keyId: 'KEY123', teamId: 'TEAM456' }, 1000);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { iss: 'TEAM456', iat: 1000 });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('dispatcher: start for followers, update on change, end at final, honoring delay', async () => {
  const { poller, advance } = rig();
  const store = new Store(null);
  const sent = [];
  const timers = [];
  const apns = { send: async (token, payload) => (sent.push({ token, event: payload.aps.event, state: payload.aps['content-state'] }), { ok: true }) };
  const d = new Dispatcher({ poller, store, apns, log: () => {}, setTimer: (fn, ms) => timers.push({ fn, ms }) });
  clearInterval(d.sweep);

  store.upsertDevice('device-aaaa', { teams: ['wnba-9'], pushToStartToken: 'ab'.repeat(32) });
  store.upsertDevice('device-bbbb', { teams: ['wnba-17'], pushToStartToken: 'cd'.repeat(32), delaySeconds: 30 });
  store.upsertDevice('device-cccc', { teams: ['nba-1'], pushToStartToken: 'ef'.repeat(32) });

  poller.ingest('wnba', [ev(302, 74, 78)]);
  await Promise.resolve();
  assert.deepEqual(sent.map((s) => s.event), ['start'], 'immediate device starts now');
  assert.equal(timers.length, 1, 'delayed device is held');
  assert.equal(timers[0].ms, 30_000);
  timers.shift().fn();
  await Promise.resolve();
  assert.equal(sent.length, 2);
  assert.ok(!sent.some((s) => s.token.startsWith('ef')), 'non-followers get nothing');

  store.setActivity('device-aaaa', 'wnba-500', '11'.repeat(32));
  advance(4000); poller.ingest('wnba', [ev(302, 76, 78)]);
  await Promise.resolve();
  assert.equal(sent.at(-1).event, 'update');
  assert.equal(sent.at(-1).state.homeScore, 76);
  assert.equal(sent.filter((s) => s.event === 'start').length, 2, 'no second start');

  advance(4000); poller.ingest('wnba', [ev(0, 80, 78, 'Final', 'post')]);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.at(-1).event, 'end');
  assert.equal(store.activitiesForGame('wnba-500').length, 0);
});

test('apns dry-run never opens a connection', async () => {
  const lines = [];
  const res = await new Apns({ log: (l) => lines.push(l) }).send('ab'.repeat(32), updatePayload({ homeScore: 1 }, 1));
  assert.deepEqual(res, { ok: true, dryRun: true });
  assert.match(lines[0], /dry-run/);
});

test('http api: reads, registration, validation, auth', async (t) => {
  const { poller } = rig();
  poller.ingest('wnba', [ev(302, 74, 78)]);
  const store = new Store(null);
  const fetchTeams = async () => [{ id: '9', abbreviation: 'NYL', location: 'New York', displayName: 'New York Liberty', color: '86cebc', alternateColor: '000000' }];
  const server = createServer({ poller, store, fetchTeams, apiKey: 'secret', log: () => {} }).listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { authorization: 'Bearer secret', ...(init.headers ?? {}) } });
  const put = (path, body) => call(path, { method: 'PUT', body: JSON.stringify(body) });

  assert.equal((await fetch(`${base}/v1/games`)).status, 401);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.match(await (await fetch(base)).text(), /Score Bug server/);

  const games = await (await call('/v1/games?league=wnba')).json();
  assert.equal(games.games[0].id, 'wnba-500');
  assert.equal((await (await call('/v1/games?team=wnba-9')).json()).games.length, 1);
  assert.equal((await (await call('/v1/games?team=wnba-1')).json()).games.length, 0);
  assert.equal((await (await call('/v1/games/wnba-500')).json()).game.home.abbr, 'LVA');
  assert.equal((await call('/v1/games/wnba-999')).status, 404);
  assert.equal((await call('/v1/games?league=xxx')).status, 400);
  assert.equal((await (await call('/v1/teams?league=wnba')).json()).teams[0].id, 'wnba-9');
  assert.equal((await (await call('/v1/leagues')).json()).leagues.length, 13);

  assert.equal((await put('/v1/devices/device-aaaa', { teams: ['wnba-9'], delaySeconds: 30, pushToStartToken: 'ab'.repeat(32), environment: 'sandbox' })).status, 200);
  assert.deepEqual(store.devices['device-aaaa'].teams, ['wnba-9']);
  assert.equal((await put('/v1/devices/device-aaaa', { teams: ['../etc'] })).status, 400);
  assert.equal((await put('/v1/devices/device-aaaa', { delaySeconds: 999 })).status, 400);
  assert.equal((await put('/v1/devices/device-aaaa', { pushToStartToken: 'not hex' })).status, 400);
  assert.equal((await put('/v1/devices/x', { teams: [] })).status, 404);
  assert.equal((await call('/v1/devices/device-aaaa', { method: 'PUT', body: 'x'.repeat(20_000) })).status, 413);

  assert.equal((await put('/v1/devices/device-aaaa/activities/wnba-500', { pushToken: '11'.repeat(32) })).status, 200);
  assert.equal(store.activitiesForGame('wnba-500').length, 1);
  assert.equal((await call('/v1/devices/device-aaaa/activities/wnba-500', { method: 'DELETE' })).status, 200);
  assert.equal(store.activitiesForGame('wnba-500').length, 0);
});
