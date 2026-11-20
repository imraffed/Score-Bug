import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeEvent, periodLabel, pushKey, teamColor } from '../src/normalize.js';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const STATE_KEYS = ['awayScore', 'bases', 'clockAsOf', 'clockRunning', 'clockSeconds', 'homeScore', 'periodLabel', 'possession', 'situation', 'status'];

test('real ESPN events normalize into the shared game shape', () => {
  for (const league of ['ncaam', 'nfl', 'epl', 'nba', 'mlb']) {
    for (const ev of fixture(league)) {
      const g = normalizeEvent(league, ev);
      assert.ok(g, `${league} event normalizes`);
      assert.match(g.id, new RegExp(`^${league}-\\d+$`));
      assert.deepEqual(Object.keys(g.state).sort(), STATE_KEYS);
      for (const t of [g.home, g.away]) {
        assert.match(t.id, new RegExp(`^${league}-\\w+$`));
        assert.ok(t.abbr.length >= 1 && t.abbr.length <= 5);
        assert.match(t.color, /^#[0-9A-F]{6}$/);
      }
      assert.ok(g.startTime > 1_700_000_000);
      assert.equal(g.state.status, ev.competitions[0].status.type.state);
    }
  }
});

test('finished NFL game carries the final score and label', () => {
  const g = normalizeEvent('nfl', fixture('nfl').find((e) => e.competitions[0].status.type.state === 'post'));
  assert.equal(g.state.periodLabel, 'FINAL');
  assert.equal(g.state.clockSeconds, null);
  assert.ok(g.state.homeScore + g.state.awayScore > 0);
});

test('period labels', () => {
  assert.equal(periodLabel('in', '5:02 - 4th'), '4TH');
  assert.equal(periodLabel('in', '0:47.3 - 2nd'), '2ND');
  assert.equal(periodLabel('in', 'Top 7th'), 'TOP 7TH');
  assert.equal(periodLabel('in', 'Halftime'), 'HALFTIME');
  assert.equal(periodLabel('in', 'End of 3rd'), 'END 3RD');
  assert.equal(periodLabel('in', "67'"), "67'");
  assert.equal(periodLabel('post', 'Final/OT'), 'FINAL/OT');
  assert.equal(periodLabel('pre', '11/22 - 1:00 PM EST'), '');
});

const live = (sport, over) => ({
  id: '1', date: '2026-11-20T20:00Z',
  competitions: [{
    status: { clock: 302, displayClock: '5:02', period: 4, type: { state: 'in', shortDetail: '5:02 - 4th' } },
    competitors: [
      { homeAway: 'home', score: '74', team: { id: '17', abbreviation: 'LVA', location: 'Las Vegas', color: 'a6192e' } },
      { homeAway: 'away', score: '78', team: { id: '9', abbreviation: 'NYL', location: 'New York', color: '86cebc', alternateColor: '000000' } },
    ],
    ...over,
  }],
});

test('live basketball has a clock; halftime does not', () => {
  const g = normalizeEvent('wnba', live());
  assert.equal(g.state.clockSeconds, 302);
  assert.equal(g.state.periodLabel, '4TH');
  assert.equal(g.away.color, '#000000', 'light primary falls back to the darker alternate');
  const half = normalizeEvent('wnba', live('basketball', { status: { clock: 0, period: 2, type: { state: 'in', shortDetail: 'Halftime' } } }));
  assert.equal(half.state.clockSeconds, null);
});

test('football situation and possession', () => {
  const g = normalizeEvent('nfl', live('football', { situation: { shortDownDistanceText: '2nd & 7', possession: '9' } }));
  assert.equal(g.state.situation, '2ND & 7');
  assert.equal(g.state.possession, 'away');
});

test('baseball situation and runners', () => {
  const ev = live('baseball', { status: { type: { state: 'in', shortDetail: 'Top 7th' } }, situation: { balls: 3, strikes: 2, outs: 2, onFirst: true, onSecond: false, onThird: true } });
  const g = normalizeEvent('mlb', ev);
  assert.equal(g.state.situation, '2 OUT · 3-2');
  assert.deepEqual(g.state.bases, [true, false, true]);
  assert.equal(g.state.clockSeconds, null);
});

test('team colors stay readable under white text', () => {
  assert.equal(teamColor('ffffff', '003b75'), '#003B75');
  assert.notEqual(teamColor('ffd700', 'ffffff'), '#FFD700');
  assert.equal(teamColor(undefined, undefined), '#3A4454');
});

test('a ticking clock alone is not a visible change', () => {
  const s = normalizeEvent('wnba', live()).state;
  assert.equal(pushKey(s), pushKey({ ...s, clockSeconds: 290, clockAsOf: 99 }));
  assert.notEqual(pushKey(s), pushKey({ ...s, homeScore: 76 }));
  assert.notEqual(pushKey(s), pushKey({ ...s, clockRunning: true }));
});

test('malformed events are skipped, not thrown', () => {
  assert.equal(normalizeEvent('nba', {}), null);
  assert.equal(normalizeEvent('nba', { competitions: [{ competitors: [] }] }), null);
});
