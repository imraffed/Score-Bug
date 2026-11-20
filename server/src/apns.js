// Apple Push Notification service client for Live Activity pushes.
// With no signing key configured it runs in dry-run mode and logs what it would send.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';

const HOSTS = { sandbox: 'https://api.sandbox.push.apple.com', production: 'https://api.push.apple.com' };
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function makeJwt({ key, keyId, teamId }, nowSeconds) {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: nowSeconds }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64url(sig)}`;
}

export function updatePayload(state, nowSeconds) {
  return { aps: { timestamp: nowSeconds, event: 'update', 'content-state': state } };
}

export function endPayload(state, nowSeconds, lingerSeconds) {
  return { aps: { timestamp: nowSeconds, event: 'end', 'content-state': state, 'dismissal-date': nowSeconds + lingerSeconds } };
}

export function startPayload(game, nowSeconds) {
  const { state, ...attributes } = game;
  return {
    aps: {
      timestamp: nowSeconds,
      event: 'start',
      'attributes-type': 'ScoreBugAttributes',
      attributes: {
        gameId: attributes.id,
        league: attributes.league,
        leagueName: attributes.leagueName,
        sport: attributes.sport,
        startTime: attributes.startTime,
        home: attributes.home,
        away: attributes.away,
      },
      'content-state': state,
      alert: { title: `${game.away.abbr} at ${game.home.abbr}`, body: `${game.leagueName} is on your Lock Screen.` },
    },
  };
}

export class Apns {
  constructor({ keyPath, keyId, teamId, bundleId, log = console.log } = {}) {
    this.log = log;
    this.bundleId = bundleId;
    this.enabled = Boolean(keyPath && keyId && teamId && bundleId);
    if (this.enabled) this.auth = { key: fs.readFileSync(keyPath, 'utf8'), keyId, teamId };
    this.sessions = {};
    this.jwt = null;
    this.jwtAt = 0;
  }

  #token() {
    const now = Math.floor(Date.now() / 1000);
    if (!this.jwt || now - this.jwtAt > 50 * 60) {
      this.jwt = makeJwt(this.auth, now);
      this.jwtAt = now;
    }
    return this.jwt;
  }

  #session(environment) {
    const cur = this.sessions[environment];
    if (cur && !cur.closed && !cur.destroyed) return cur;
    const s = http2.connect(HOSTS[environment] ?? HOSTS.sandbox);
    s.on('error', (err) => this.log(`[apns] connection error: ${err.message}`));
    s.on('goaway', () => s.close());
    this.sessions[environment] = s;
    return s;
  }

  /** @returns {Promise<{ok: boolean, gone?: boolean, status?: number, reason?: string, dryRun?: boolean}>} */
  send(deviceToken, payload, environment = 'sandbox') {
    const body = JSON.stringify(payload);
    if (!this.enabled) {
      this.log(`[apns dry-run] ${payload.aps.event} -> …${deviceToken.slice(-6)} ${body.length}B ${body.slice(0, 220)}`);
      return Promise.resolve({ ok: true, dryRun: true });
    }
    return new Promise((resolve) => {
      let req;
      try {
        req = this.#session(environment).request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${this.#token()}`,
          'apns-push-type': 'liveactivity',
          'apns-topic': `${this.bundleId}.push-type.liveactivity`,
          'apns-priority': '10',
          'content-type': 'application/json',
        });
      } catch (err) {
        resolve({ ok: false, reason: err.message });
        return;
      }
      let status = 0;
      let data = '';
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', (h) => (status = h[':status']));
      req.on('data', (d) => (data += d));
      req.on('error', (err) => resolve({ ok: false, reason: err.message }));
      req.on('close', () => {
        if (status === 200) return resolve({ ok: true, status });
        let reason = data;
        try {
          reason = JSON.parse(data).reason;
        } catch {
          /* keep raw */
        }
        const gone = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken';
        resolve({ ok: false, status, reason, gone });
      });
      req.end(body);
    });
  }

  close() {
    for (const s of Object.values(this.sessions)) s.close();
  }
}
