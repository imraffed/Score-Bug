// Polls each league's scoreboard, tracks game clocks over time, and emits a
// "game" event whenever a game is new or its state changed.
import { EventEmitter } from 'node:events';
import { LEAGUES } from './leagues.js';
import { normalizeEvent, pushKey } from './normalize.js';

const HISTORY_SECONDS = 130;

export class Poller extends EventEmitter {
  /**
   * @param {{fetchScoreboard: (league: string) => Promise<any[]>, liveMs?: number, idleMs?: number,
   *          now?: () => number, log?: (...a: any[]) => void}} opts
   */
  constructor(opts) {
    super();
    this.fetchScoreboard = opts.fetchScoreboard;
    this.liveMs = opts.liveMs ?? 4000;
    this.idleMs = opts.idleMs ?? 60_000;
    // 'step': send the feed's clock value as it changes (right for ESPN, whose clock
    // only moves when a play is logged). 'infer': guess running/stopped and let the
    // phone count down itself (right for feeds that update the clock continuously).
    this.clockMode = opts.clockMode ?? 'step';
    this.clockPushMinMs = opts.clockPushMinMs ?? 10_000;
    this.now = opts.now ?? (() => Date.now());
    this.log = opts.log ?? (() => {});
    /** @type {Map<string, any>} */ this.games = new Map();
    /** @type {Map<string, {value: number|null, changedAt: number, seen: number}>} */ this.clocks = new Map();
    /** @type {Map<string, {t: number, state: any}[]>} */ this.history = new Map();
    /** @type {Map<string, any>} */ this.lastPushed = new Map();
    /** @type {Map<string, number>} */ this.interest = new Map();
    this.timers = new Map();
    this.lastOk = new Map();
    this.stopped = false;
  }

  /** Mark a league as being watched so it polls at the live rate. */
  touch(leagueKey, ttlMs = 90_000) {
    if (!LEAGUES[leagueKey]) return;
    const until = this.now() + ttlMs;
    const wasCold = (this.interest.get(leagueKey) ?? 0) < this.now();
    this.interest.set(leagueKey, Math.max(until, this.interest.get(leagueKey) ?? 0));
    if (wasCold && this.timers.has(leagueKey)) this.#schedule(leagueKey, 0);
  }

  start() {
    Object.keys(LEAGUES).forEach((key, i) => this.#schedule(key, i * 400));
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
  }

  #schedule(key, ms) {
    if (this.stopped) return;
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.#tick(key), ms));
  }

  async #tick(key) {
    let next = this.idleMs;
    try {
      const events = await this.fetchScoreboard(key);
      this.ingest(key, events);
      this.lastOk.set(key, this.now());
      next = this.#isHot(key) ? this.liveMs : this.idleMs;
    } catch (err) {
      this.log(`[poll] ${key} failed: ${err.message}`);
      next = 15_000;
    }
    this.#schedule(key, next);
  }

  #isHot(key) {
    if ((this.interest.get(key) ?? 0) < this.now()) return false;
    const soon = this.now() / 1000 + 15 * 60;
    for (const g of this.games.values()) {
      if (g.league !== key) continue;
      if (g.state.status === 'in' || (g.state.status === 'pre' && g.startTime <= soon)) return true;
    }
    return false;
  }

  /** Apply one scoreboard response. Exposed for tests. */
  ingest(leagueKey, events) {
    const now = this.now();
    const seen = new Set();
    for (const ev of events) {
      const game = normalizeEvent(leagueKey, ev);
      if (!game) continue;
      seen.add(game.id);
      this.#applyClock(game, now);
      const prev = this.games.get(game.id);
      this.games.set(game.id, game);
      this.#record(game, now);
      const significant = this.#isSignificant(game, now);
      if (significant) this.lastPushed.set(game.id, { state: game.state, at: now });
      if (!prev || significant) this.emit('game', game, prev ?? null, significant);
    }
    for (const [id, g] of this.games) {
      if (g.league === leagueKey && !seen.has(id)) {
        this.games.delete(id);
        this.clocks.delete(id);
        this.history.delete(id);
        this.lastPushed.delete(id);
        this.emit('gone', g);
      }
    }
  }

  // The feed only gives a clock value, not whether it is running. In 'infer' mode a
  // clock that changed between polls is running; one unchanged for 8 s is stopped.
  #applyClock(game, now) {
    const s = game.state;
    if (s.clockSeconds == null) {
      this.clocks.delete(game.id);
      return;
    }
    const c = this.clocks.get(game.id);
    if (!c) {
      this.clocks.set(game.id, { value: s.clockSeconds, changedAt: 0, seen: now });
    } else if (c.value !== s.clockSeconds) {
      c.value = s.clockSeconds;
      c.changedAt = now;
    }
    const cur = this.clocks.get(game.id);
    s.clockRunning = this.clockMode === 'infer' && cur.changedAt > 0 && now - cur.changedAt < 8000 && s.clockSeconds > 0;
    s.clockAsOf = Math.floor(now / 1000);
  }

  #isSignificant(game, now) {
    const last = this.lastPushed.get(game.id);
    if (!last) return true;
    if (pushKey(last.state) !== pushKey(game.state)) return true;
    const s = game.state;
    if (s.clockSeconds == null) return false;
    if (this.clockMode === 'step') {
      return s.clockSeconds !== last.state.clockSeconds && now - last.at >= this.clockPushMinMs;
    }
    // Same visible state: only resend if the phone's own countdown would be visibly off.
    const elapsed = (now - last.at) / 1000;
    const phoneShows = last.state.clockRunning ? Math.max(0, last.state.clockSeconds - elapsed) : last.state.clockSeconds;
    return Math.abs(phoneShows - s.clockSeconds) > 6;
  }

  #record(game, now) {
    const h = this.history.get(game.id) ?? [];
    const last = h[h.length - 1];
    if (!last || JSON.stringify(last.state) !== JSON.stringify(game.state)) h.push({ t: now, state: game.state });
    while (h.length > 1 && h[1].t <= now - HISTORY_SECONDS * 1000) h.shift();
    this.history.set(game.id, h);
  }

  /** The game as it stood `delaySeconds` ago (TV Sync). */
  gameAt(id, delaySeconds = 0) {
    const game = this.games.get(id);
    if (!game) return null;
    if (!delaySeconds) return game;
    const cutoff = this.now() - delaySeconds * 1000;
    const h = this.history.get(id) ?? [];
    let state = h[0]?.state ?? game.state;
    for (const entry of h) if (entry.t <= cutoff) state = entry.state;
    return { ...game, state };
  }

  status() {
    const out = {};
    for (const key of Object.keys(LEAGUES)) {
      const games = [...this.games.values()].filter((g) => g.league === key);
      out[key] = {
        games: games.length,
        live: games.filter((g) => g.state.status === 'in').length,
        lastOkSecondsAgo: this.lastOk.has(key) ? Math.round((this.now() - this.lastOk.get(key)) / 1000) : null,
        polling: this.#isHot(key) ? 'live' : 'idle',
      };
    }
    return out;
  }
}
