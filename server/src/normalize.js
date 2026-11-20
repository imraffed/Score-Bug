// Converts a provider event into the one game shape every bug design draws from.
// `state` is exactly the Live Activity ContentState the iOS app decodes, so keep
// its keys in sync with ios/Shared/ScoreBugAttributes.swift.
import { LEAGUES } from './leagues.js';

const CLOCK_SPORTS = new Set(['basketball', 'football', 'hockey']);

function luminance(hex) {
  const n = parseInt(hex, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function darken(hex, factor) {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(v * factor).toString(16).padStart(2, '0'))
    .join('');
}

/** A team color that white text stays readable on. */
export function teamColor(primary, alternate) {
  const valid = (c) => typeof c === 'string' && /^[0-9a-f]{6}$/i.test(c);
  const candidates = [primary, alternate].filter(valid);
  if (candidates.length === 0) return '#3A4454';
  const ok = candidates.find((c) => luminance(c) < 0.35);
  if (ok) return `#${ok.toUpperCase()}`;
  let c = candidates[0];
  while (luminance(c) >= 0.35) c = darken(c, 0.8);
  return `#${c.toUpperCase()}`;
}

/** "5:02 - 4th" -> "4TH", "Top 7th" -> "TOP 7TH", "Final/OT" -> "FINAL/OT". */
export function periodLabel(status, shortDetail) {
  if (status === 'pre') return '';
  const detail = String(shortDetail ?? '').trim();
  const dash = detail.match(/^[\d:.]+\s+-\s+(.+)$/);
  return (dash ? dash[1] : detail).toUpperCase().replace(/^END OF /, 'END ');
}

function team(leagueKey, competitor) {
  const t = competitor.team ?? {};
  const abbr = (t.abbreviation || t.shortDisplayName || t.displayName || '?').toUpperCase().slice(0, 5);
  return {
    id: `${leagueKey}-${t.id}`,
    abbr,
    name: t.location || t.shortDisplayName || t.displayName || abbr,
    color: teamColor(t.color, t.alternateColor),
  };
}

function situation(sport, comp, homeId, awayId) {
  const s = comp.situation;
  const out = { situation: null, bases: null, possession: null };
  if (!s) return out;
  if (sport === 'baseball' && typeof s.outs === 'number') {
    out.situation = `${s.outs} OUT · ${s.balls ?? 0}-${s.strikes ?? 0}`;
    out.bases = [Boolean(s.onFirst), Boolean(s.onSecond), Boolean(s.onThird)];
  } else if (sport === 'football') {
    const text = s.shortDownDistanceText || s.downDistanceText;
    if (text) out.situation = String(text).toUpperCase();
    if (s.possession != null) {
      if (String(s.possession) === homeId) out.possession = 'home';
      else if (String(s.possession) === awayId) out.possession = 'away';
    }
  }
  return out;
}

export function normalizeEvent(leagueKey, ev) {
  const league = LEAGUES[leagueKey];
  const comp = ev?.competitions?.[0];
  const st = comp?.status ?? ev?.status;
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  if (!league || !st?.type || !home || !away) return null;

  const status = ['pre', 'in', 'post'].includes(st.type.state) ? st.type.state : 'pre';
  const shortDetail = st.type.shortDetail ?? st.type.detail ?? '';
  const midPeriod = /^[\d:.]+\s+-\s+/.test(shortDetail);
  const hasClock = status === 'in' && CLOCK_SPORTS.has(league.sport) && typeof st.clock === 'number' && midPeriod;
  const startMs = Date.parse(comp.date ?? ev.date);

  return {
    id: `${leagueKey}-${ev.id}`,
    league: leagueKey,
    leagueName: league.name,
    sport: league.sport,
    startTime: Number.isFinite(startMs) ? Math.floor(startMs / 1000) : 0,
    home: team(leagueKey, home),
    away: team(leagueKey, away),
    state: {
      status,
      homeScore: parseInt(home.score, 10) || 0,
      awayScore: parseInt(away.score, 10) || 0,
      periodLabel: periodLabel(status, shortDetail),
      clockSeconds: hasClock ? st.clock : null,
      clockRunning: false, // filled in by the poller, which sees the clock over time
      clockAsOf: 0,
      ...situation(league.sport, comp, String(home.team?.id), String(away.team?.id)),
    },
  };
}

/** Everything a viewer would notice, minus the ticking clock value itself. */
export function pushKey(state) {
  const { clockSeconds, clockAsOf, ...rest } = state;
  return JSON.stringify({ ...rest, hasClock: clockSeconds != null });
}
