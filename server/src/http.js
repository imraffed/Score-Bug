// JSON API for the app and widgets, plus a small live-scores page at /.
import http from 'node:http';
import crypto from 'node:crypto';
import { LEAGUES, leagueList } from './leagues.js';
import { teamColor } from './normalize.js';

const ID = /^[A-Za-z0-9-]{8,64}$/;
const TOKEN = /^[0-9a-fA-F]{32,400}$/;
const TEAM = /^[a-z]{2,6}-[A-Za-z0-9]{1,12}$/;
const GAME = /^[a-z]{2,6}-[A-Za-z0-9]{1,16}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new HttpError(413, 'Body too large');
    chunks.push(chunk);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Body must be a JSON object');
}

export function createServer({ poller, store, fetchTeams, apiKey = '', log = console.log }) {
  const teamCache = new Map();

  function authorize(req) {
    if (!apiKey) return;
    const given = Buffer.from(String(req.headers.authorization ?? ''));
    const want = Buffer.from(`Bearer ${apiKey}`);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(401, 'Missing or wrong API key');
  }

  async function teams(leagueKey) {
    const hit = teamCache.get(leagueKey);
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.teams;
    const raw = await fetchTeams(leagueKey);
    const list = raw
      .map((t) => ({
        id: `${leagueKey}-${t.id}`,
        abbr: String(t.abbreviation || t.shortDisplayName || '?').toUpperCase().slice(0, 5),
        name: t.location || t.displayName,
        fullName: t.displayName,
        color: teamColor(t.color, t.alternateColor),
      }))
      .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
    teamCache.set(leagueKey, { at: Date.now(), teams: list });
    return list;
  }

  async function route(req, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const q = url.searchParams;

    if (req.method === 'GET' && parts.length === 0) return { html: DEBUG_PAGE };
    if (req.method === 'GET' && url.pathname === '/health') return { json: { ok: true, leagues: poller.status() } };
    if (parts[0] !== 'v1') throw new HttpError(404, 'Not found');
    authorize(req);

    if (req.method === 'GET' && parts[1] === 'leagues') return { json: { leagues: leagueList() } };

    if (req.method === 'GET' && parts[1] === 'teams') {
      const key = q.get('league') ?? '';
      if (!LEAGUES[key]) throw new HttpError(400, 'Unknown league');
      return { json: { teams: await teams(key) } };
    }

    if (req.method === 'GET' && parts[1] === 'games' && parts.length <= 3) {
      const delay = Math.max(0, Math.min(120, Number(q.get('delay')) || 0));
      if (parts[2]) {
        const game = poller.gameAt(parts[2], delay);
        if (!game) throw new HttpError(404, 'No such game on today\'s scoreboard');
        poller.touch(game.league);
        return { json: { game } };
      }
      let games = [...poller.games.values()];
      const league = q.get('league');
      const ids = q.get('ids');
      const team = q.get('team');
      if (league) {
        if (!LEAGUES[league]) throw new HttpError(400, 'Unknown league');
        games = games.filter((g) => g.league === league);
      }
      if (ids) {
        const want = new Set(ids.split(',').slice(0, 20));
        games = games.filter((g) => want.has(g.id));
      }
      if (team) {
        const want = new Set(team.split(',').slice(0, 50));
        games = games.filter((g) => want.has(g.home.id) || want.has(g.away.id));
      }
      for (const key of new Set(games.map((g) => g.league))) if (league || ids || team) poller.touch(key);
      games = games.map((g) => poller.gameAt(g.id, delay)).sort((a, b) => a.startTime - b.startTime);
      return { json: { games } };
    }

    if (parts[1] === 'devices' && ID.test(parts[2] ?? '')) {
      const deviceId = parts[2];
      if (req.method === 'PUT' && parts.length === 3) {
        const body = await readJson(req);
        const fields = {};
        if ('pushToStartToken' in body) {
          if (body.pushToStartToken !== null && !TOKEN.test(body.pushToStartToken)) throw new HttpError(400, 'Bad pushToStartToken');
          fields.pushToStartToken = body.pushToStartToken;
        }
        if ('teams' in body) {
          if (!Array.isArray(body.teams) || body.teams.length > 50 || !body.teams.every((t) => typeof t === 'string' && TEAM.test(t) && LEAGUES[t.split('-')[0]])) {
            throw new HttpError(400, 'Bad teams');
          }
          fields.teams = [...new Set(body.teams)];
        }
        if ('delaySeconds' in body) {
          if (!Number.isInteger(body.delaySeconds) || body.delaySeconds < 0 || body.delaySeconds > 120) throw new HttpError(400, 'delaySeconds must be 0-120');
          fields.delaySeconds = body.delaySeconds;
        }
        if ('environment' in body) {
          if (!['sandbox', 'production'].includes(body.environment)) throw new HttpError(400, 'Bad environment');
          fields.environment = body.environment;
        }
        const device = store.upsertDevice(deviceId, fields);
        for (const key of store.followedLeagues()) poller.touch(key, 24 * 3600 * 1000);
        return { json: { ok: true, teams: device.teams, delaySeconds: device.delaySeconds } };
      }
      if (parts[3] === 'activities' && GAME.test(parts[4] ?? '') && parts.length === 5) {
        const gameId = parts[4];
        if (req.method === 'PUT') {
          const body = await readJson(req);
          if (!TOKEN.test(body.pushToken ?? '')) throw new HttpError(400, 'Bad pushToken');
          if (!store.devices[deviceId]) store.upsertDevice(deviceId, {});
          store.setActivity(deviceId, gameId, body.pushToken);
          poller.touch(gameId.split('-')[0], 24 * 3600 * 1000);
          return { json: { ok: true } };
        }
        if (req.method === 'DELETE') {
          store.removeActivity(deviceId, gameId);
          return { json: { ok: true } };
        }
      }
    }
    throw new HttpError(404, 'Not found');
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const out = await route(req, url);
      if (out.html) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
        res.end(out.html);
      } else {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(out.json));
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log(`[http] ${req.method} ${req.url} failed: ${err.stack ?? err}`);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Server error' : err.message }));
    }
  });
}

// Scores are written with textContent only, so feed text can never run as markup.
const DEBUG_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Score Bug server</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;background:#0b141f;color:#e4ebf2;margin:0;padding:20px;max-width:760px;margin-inline:auto}
h1{font-size:20px;margin:0 0 4px}p{color:#93a4b8;margin:0 0 16px}
select{font:inherit;padding:6px 10px;background:#122131;color:inherit;border:1px solid #263b52;border-radius:6px;margin-bottom:16px}
.g{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding:12px 14px;background:#122131;border:1px solid #263b52;border-radius:8px;margin-bottom:8px}
.t{display:flex;gap:8px;align-items:center;font-weight:600}.t i{width:12px;height:12px;border:1px solid #fff8}
.t b{margin-left:auto;font-variant-numeric:tabular-nums;font-size:18px}
.m{grid-row:1/3;grid-column:2;align-self:center;text-align:right;font:13px ui-monospace,monospace;color:#93a4b8;white-space:pre-line}
.in .m{color:#ffc233}
</style>
<h1>Score Bug server</h1><p>Live view of the normalized feed the phones receive. Refreshes every 3 seconds.</p>
<select id="lg" aria-label="League"></select><div id="list"></div>
<script>
const lg=document.getElementById('lg'),list=document.getElementById('list');
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
function row(t,score){const d=document.createElement('div');d.className='t';const i=document.createElement('i');i.style.background=t.color;const n=document.createElement('span');n.textContent=t.abbr+'  '+t.name;const b=document.createElement('b');b.textContent=score;d.append(i,n,b);return d}
async function load(){try{
  const r=await fetch('/v1/games?league='+lg.value);const {games}=await r.json();list.replaceChildren();
  if(!games.length){list.textContent='No games on the scoreboard for this league right now.'}
  for(const g of games){const s=g.state,el=document.createElement('div');el.className='g '+s.status;
    const m=document.createElement('div');m.className='m';
    let clock=s.clockSeconds==null?'':fmt(s.clockRunning?Math.max(0,s.clockSeconds-(Date.now()/1000-s.clockAsOf)):s.clockSeconds)+(s.clockRunning?' ▶':' ❚❚');
    m.textContent=s.status==='pre'?new Date(g.startTime*1000).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'}):[s.periodLabel,clock,s.situation].filter(Boolean).join('\\n');
    el.append(row(g.away,s.awayScore),m,row(g.home,s.homeScore));list.append(el)}
}catch(e){list.textContent='Could not load games: '+e.message}}
fetch('/v1/leagues').then(r=>r.json()).then(({leagues})=>{for(const l of leagues){const o=document.createElement('option');o.value=l.key;o.textContent=l.name;lg.append(o)}
  lg.value=location.hash.slice(1)||'nba';lg.onchange=()=>{location.hash=lg.value;load()};load();setInterval(load,3000)});
</script>`;
