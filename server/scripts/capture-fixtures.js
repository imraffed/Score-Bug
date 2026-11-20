// Saves trimmed real scoreboard events as test fixtures: node scripts/capture-fixtures.js nba nhl
import fs from 'node:fs';
import { fetchScoreboard } from '../src/espn.js';

const DROP = ['leaders', 'headlines', 'highlights', 'odds', 'tickets', 'broadcasts', 'geoBroadcasts', 'venue', 'notes', 'links', 'weather'];
for (const key of process.argv.slice(2)) {
  const events = await fetchScoreboard(key);
  const picked = [];
  for (const state of ['pre', 'in', 'post']) {
    const ev = events.find((e) => e.competitions?.[0]?.status?.type?.state === state);
    if (!ev) continue;
    for (const k of DROP) { delete ev[k]; delete ev.competitions[0][k]; }
    for (const c of ev.competitions[0].competitors) { for (const k of ['leaders', 'statistics', 'records', 'linescores', 'probables']) delete c[k]; delete c.team.links; }
    picked.push(ev);
  }
  fs.writeFileSync(new URL(`../test/fixtures/${key}.json`, import.meta.url), JSON.stringify(picked, null, 1));
  console.log(key, picked.map((e) => e.competitions[0].status.type.state).join(','));
}
