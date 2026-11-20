// Device registry. A JSON file is enough for a prototype; move to Postgres for beta.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    /** @type {Record<string, {pushToStartToken: string|null, teams: string[], delaySeconds: number, environment: 'sandbox'|'production', updatedAt: number}>} */
    this.devices = {};
    /** key: `${deviceId}|${gameId}` @type {Record<string, {pushToken: string}>} */
    this.activities = {};
    /** `${deviceId}|${gameId}` pairs we already sent a start push for @type {Record<string, number>} */
    this.started = {};
    this.saveTimer = null;
    if (file && fs.existsSync(file)) {
      try {
        Object.assign(this, JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch {
        /* start empty on a corrupt file */
      }
    }
  }

  #save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const data = JSON.stringify({ devices: this.devices, activities: this.activities, started: this.started });
      fs.writeFileSync(`${this.file}.tmp`, data, { mode: 0o600 });
      fs.renameSync(`${this.file}.tmp`, this.file);
    }, 250);
    this.saveTimer.unref?.();
  }

  upsertDevice(id, fields) {
    const cur = this.devices[id] ?? { pushToStartToken: null, teams: [], delaySeconds: 0, environment: 'sandbox' };
    this.devices[id] = { ...cur, ...fields, updatedAt: Date.now() };
    this.#save();
    return this.devices[id];
  }

  setActivity(deviceId, gameId, pushToken) {
    this.activities[`${deviceId}|${gameId}`] = { pushToken };
    this.started[`${deviceId}|${gameId}`] = Date.now();
    this.#save();
  }

  removeActivity(deviceId, gameId) {
    delete this.activities[`${deviceId}|${gameId}`];
    this.#save();
  }

  activitiesForGame(gameId) {
    return Object.entries(this.activities)
      .filter(([key]) => key.endsWith(`|${gameId}`))
      .map(([key, a]) => ({ deviceId: key.split('|')[0], pushToken: a.pushToken, device: this.devices[key.split('|')[0]] }));
  }

  devicesFollowing(teamIds) {
    return Object.entries(this.devices)
      .filter(([, d]) => d.teams.some((t) => teamIds.includes(t)))
      .map(([deviceId, device]) => ({ deviceId, device }));
  }

  markStarted(deviceId, gameId) {
    this.started[`${deviceId}|${gameId}`] = Date.now();
    this.#save();
  }

  wasStarted(deviceId, gameId) {
    return Boolean(this.started[`${deviceId}|${gameId}`]);
  }

  forgetGame(gameId) {
    for (const key of Object.keys(this.activities)) if (key.endsWith(`|${gameId}`)) delete this.activities[key];
    for (const key of Object.keys(this.started)) if (key.endsWith(`|${gameId}`)) delete this.started[key];
    this.#save();
  }

  followedLeagues() {
    const out = new Set();
    for (const d of Object.values(this.devices)) for (const t of d.teams) out.add(t.split('-')[0]);
    for (const key of Object.keys(this.activities)) out.add(key.split('|')[1].split('-')[0]);
    return out;
  }
}
