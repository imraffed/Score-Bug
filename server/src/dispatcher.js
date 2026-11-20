// Turns game changes into pushes: start a Live Activity shortly before a
// followed team's game, update it on each visible change, end it at the final.
import { endPayload, startPayload, updatePayload } from './apns.js';

export class Dispatcher {
  constructor({ poller, store, apns, startLeadSeconds = 600, lingerSeconds = 3600, log = console.log, setTimer = setTimeout }) {
    Object.assign(this, { poller, store, apns, startLeadSeconds, lingerSeconds, log, setTimer });
    poller.on('game', (game, prev, significant) => this.onGame(game, significant));
    poller.on('gone', (game) => store.forgetGame(game.id));
    this.sweep = setInterval(() => this.checkStarts(), 30_000);
    this.sweep.unref?.();
  }

  // TV Sync: hold each phone's push by the delay its owner chose.
  #later(device, fn) {
    const ms = Math.max(0, Math.min(120, device?.delaySeconds ?? 0)) * 1000;
    if (ms === 0) fn();
    else this.setTimer(fn, ms);
  }

  onGame(game, significant) {
    this.#maybeStart(game);
    if (!significant) return;
    const now = () => Math.floor(Date.now() / 1000);
    for (const { deviceId, pushToken, device } of this.store.activitiesForGame(game.id)) {
      const final = game.state.status === 'post';
      this.#later(device, async () => {
        const payload = final ? endPayload(game.state, now(), this.lingerSeconds) : updatePayload(game.state, now());
        const res = await this.apns.send(pushToken, payload, device?.environment);
        if (res.gone || final) this.store.removeActivity(deviceId, game.id);
        if (!res.ok) this.log(`[push] ${payload.aps.event} failed for ${game.id}: ${res.status ?? ''} ${res.reason ?? ''}`);
      });
    }
  }

  checkStarts() {
    for (const game of this.poller.games.values()) this.#maybeStart(game);
  }

  #maybeStart(game) {
    const s = game.state.status;
    const nowS = Date.now() / 1000;
    const due = s === 'in' || (s === 'pre' && game.startTime - nowS <= this.startLeadSeconds && game.startTime - nowS > -3600);
    if (!due) return;
    for (const { deviceId, device } of this.store.devicesFollowing([game.home.id, game.away.id])) {
      if (!device.pushToStartToken || this.store.wasStarted(deviceId, game.id)) continue;
      this.store.markStarted(deviceId, game.id);
      this.#later(device, async () => {
        const res = await this.apns.send(device.pushToStartToken, startPayload(game, Math.floor(Date.now() / 1000)), device.environment);
        if (res.gone) this.store.upsertDevice(deviceId, { pushToStartToken: null });
        if (!res.ok) this.log(`[push] start failed for ${game.id}: ${res.status ?? ''} ${res.reason ?? ''}`);
      });
    }
  }
}
