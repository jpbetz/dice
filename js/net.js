/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Networking for multiplayer Dice Table.
//
// This module owns every fetch and the EventSource stream; nothing else in the
// app talks to the server. It is deliberately dumb about dice: it ships die
// type lists up and hands server-authored roll events back to the caller.
//
// connect() resolves to either
//   {online: true, playerId, color, players, log, roll, clear, disconnect}
// or {online: false} when there is no server (the app is on static hosting),
// which is the caller's cue to run in solo mode.

// JOIN is generous on purpose: a REAL static host answers /api/join
// instantly with a 404 (that is the solo-detection path), so this timeout
// only ever fires against a live-but-slow server — where silently dropping
// the player into solo play is the worst answer. 4s proved trigger-happy:
// a loaded machine's second tab joined in ~6s and got stranded solo.
const JOIN_TIMEOUT_MS = 12000;
const POST_TIMEOUT_MS = 8000;
const STREAM_OPEN_TIMEOUT_MS = 3000;
const REOPEN_MIN_MS = 1000;
const REOPEN_MAX_MS = 15000;
const SSE_EVENTS = [
  'hello', 'player-joined', 'player-left', 'player-renamed', 'pools-changed',
  'roll', 'clear', 'reveal', 'roll-cleared', 'roll-collected',
  'offer', 'offer-claimed', 'offer-rescinded',
  'settings-changed',
];

function apiUrl(path) {
  // Same-origin, absolute: the server mounts the API at /api/* next to the app.
  return new URL(path, window.location.origin).toString();
}

async function postJson(path, body, timeout) {
  const controller = timeout > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body (e.g. static host) */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };   // network error / aborted
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Join a room and stream its events.
 *
 * @param {object}   opts
 * @param {string}   opts.room      room name
 * @param {string}   opts.name      display name (server trims + caps at 24)
 * @param {function} opts.onEvent   (type, data) for hello/player-joined/player-left/roll/clear
 * @param {function} opts.onStatus  ('online' | 'offline')
 * @param {function} opts.onRefused ({path, status, code, message}) when the
 *   server REFUSES an action we took — a whisper to nobody, a reveal we do not
 *   hold. Every such answer used to resolve to a quiet null and the player was
 *   left staring at a table where nothing happened.
 * @returns {Promise<object>} connection handle (see module header)
 */
export async function connect({ room, name, onEvent, onStatus, onRefused } = {}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const report = typeof onStatus === 'function' ? onStatus : () => {};
  const refused = typeof onRefused === 'function' ? onRefused : () => {};

  let joined = await postJson('/api/join', { room, name }, JOIN_TIMEOUT_MS);
  // status 0 = the fetch itself died (a transient network/browser hiccup —
  // observed in practice on a fresh origin's very first request). A real
  // static host answers instantly with 404/405, so ONE short-backoff retry
  // cannot meaningfully delay solo detection — and it keeps a live player
  // from being silently stranded in solo play by a single dropped request.
  if (!joined.ok && joined.status === 0) {
    await new Promise((r) => setTimeout(r, 600));
    joined = await postJson('/api/join', { room, name }, JOIN_TIMEOUT_MS);
  }
  if (!joined.ok || !joined.data || !joined.data.playerId) {
    // No server (or it refused us): the caller falls back to solo play.
    // Say why on the console — a silent solo fallback against a live server
    // is otherwise undiagnosable from inside the app.
    if (joined.status === 0) console.error('dice: /api/join failed at the network layer (twice) — falling back to solo');
    report('offline');
    return { online: false };
  }

  let playerId = joined.data.playerId;
  let source = null;
  let closed = false;
  let rejoining = null;         // in-flight silent re-join
  let reopenTimer = null;
  let reopenDelay = REOPEN_MIN_MS;
  let streamFailures = 0;       // consecutive CLOSED streams since last onopen
  let lastStatus = null;
  let streamOpen = null;        // resolves once the current stream is live
  let settleStream = null;

  function setStatus(next) {
    if (next === lastStatus) return;
    lastStatus = next;
    report(next);
  }

  const conn = {
    online: true,
    playerId,
    color: joined.data.color,
    players: joined.data.players || [],
    log: joined.data.log || [],
    offers: joined.data.offers || [],
    settings: joined.data.settings || {},

    // Ask the server to roll. Values arrive later on the 'roll' event — the
    // caller must never animate from this return value.
    // opts: {mods, faceDown, dc, notation, exp}. When notation is present it
    // is sent ALONE (plus label): the server re-parses it with js/notation.js
    // and derives dice/mods/dc/faceDown/exp itself — the client's parse is
    // preview only, and the wire contract rejects notation combined with
    // dice/mods. Since UX §7.6 the roll moment has a spelling too ('check' /
    // 'cinematic' + the comment's '| subtitle'), so on the notation shape it
    // rides IN the string and an exp field beside it is dropped rather than
    // sent: the server refuses one that disagrees, and agreement is the
    // string's job. On the explicit shape exp {kind, subtitle?} is a sibling
    // of dice/mods (UX §2) and is echoed on the roll broadcast.
    async roll(dice, label = '', opts = {}) {
      const body = { label: label || '' };
      // Reroll provenance — OUTSIDE the notation/explicit split below: the
      // reroll paths ride the notation shape whenever visibility or sources
      // are present and the explicit shape otherwise, so a field inside
      // either branch would mark only half the rerolls. A claim, not a
      // fact: the server substantiates it (and silently drops what it
      // cannot), so this never gates on anything client-side.
      if (typeof opts.rerollOfId === 'string' && opts.rerollOfId) body.rerollOfId = opts.rerollOfId;
      if (typeof opts.notation === 'string' && opts.notation) {
        body.notation = opts.notation;
      } else {
        body.dice = [...(dice || [])];
        if (opts.mods) body.mods = opts.mods;
        if (opts.faceDown) body.faceDown = true;
        if (Number.isInteger(opts.dc)) body.dc = opts.dc;
        if (opts.exp) body.exp = opts.exp;
      }
      const res = await withPlayer('/api/roll', body);
      return res.ok && res.data ? res.data.roll : null;
    },

    async clear() {
      const res = await withPlayer('/api/clear', {});
      return res.ok;
    },

    // Change display name; everyone learns via the 'player-renamed' event.
    async rename(newName) {
      const res = await withPlayer('/api/rename', { name: newName });
      if (res.ok) name = newName; // future silent re-joins use the new name
      return res.ok;
    },

    // Publish your saved pools for the owner switcher (UX §7.9 / ROADMAP
    // 2b). A display copy only — localStorage stays the owner's truth. The
    // table (you included) learns via the 'pools-changed' broadcast.
    async setPools(pools) {
      const res = await withPlayer('/api/pools', { pools });
      return res.ok;
    },

    // Flip a hidden (held/whispered) roll for the whole table. The server
    // enforces reveal authority and answers everyone with a per-recipient
    // 'reveal' event carrying the newly-authorized full entry. Note there is
    // deliberately NO visibility field on any request: visibility rides the
    // notation string (the server re-parses it), or faceDown for plain held.
    async reveal(rollId) {
      const res = await withPlayer('/api/reveal', { rollId });
      return res.ok;
    },

    // Per-roll Done (UX §7.5): remove one roll's dice for everyone. Roller
    // only for a roll still on the felt; once it is COLLECTED anyone may tidy
    // it away (§7.7). The table reacts to the 'roll-cleared' event.
    async clearRoll(rollId) {
      const res = await withPlayer('/api/clear-roll', { rollId });
      return res.ok;
    },

    // Collect a roll onto the shelf (UX §7.7). Roller only, like reveal; the
    // table reacts to the 'roll-collected' {rollId, seq} broadcast — never to
    // this return value.
    async collectRoll(rollId) {
      const res = await withPlayer('/api/collect-roll', { rollId });
      return res.ok;
    },

    // Broadcast a prepared roll card anyone can execute once. Same exclusive
    // notation-vs-dice/mods wire shape as roll(), and the same rule for the
    // moment: in the string on the notation shape, a sibling field otherwise.
    // `to` (a player name) makes it a TARGETED offer — only that player may
    // claim (ROADMAP 4b); it rides beside either shape, and the server
    // resolves it against the roster (400 unknown_target on no match).
    async offer({ label, dice, mods, faceDown, dc, notation, exp, to } = {}) {
      const body = { label: label || '' };
      if (typeof to === 'string' && to) body.to = to;
      if (typeof notation === 'string' && notation) {
        body.notation = notation;
      } else {
        body.dice = [...(dice || [])];
        if (mods) body.mods = mods;
        if (faceDown) body.faceDown = true;
        if (Number.isInteger(dc)) body.dc = dc;
        if (exp) body.exp = exp;
      }
      const res = await withPlayer('/api/offer', body);
      return res.ok && res.data ? res.data.offer : null;
    },

    // Execute an offered roll as yourself. A 404 usually means someone else
    // claimed it first — a quiet no-op, and NOT grounds for the silent
    // re-join that withPlayer normally does on 404.
    async claim(offerId) {
      const res = await withPlayer('/api/claim', { offerId }, { rejoinOn404: false });
      return res.ok;
    },

    // Withdraw your own offer.
    async unoffer(offerId) {
      const res = await withPlayer('/api/unoffer', { offerId });
      return res.ok;
    },

    // Patch the room-wide settings (any player may). The merged result comes
    // back to everyone — us included — on the 'settings-changed' event; the
    // caller applies on that echo, never optimistically.
    async setSettings(patch) {
      const res = await withPlayer('/api/settings', { settings: patch });
      return res.ok;
    },

    disconnect() {
      if (closed) return;
      closed = true;
      clearTimeout(reopenTimer);
      closeStream();
      setStatus('offline');
    },
  };

  // -- SSE ------------------------------------------------------------------

  function closeStream() {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    try { source.close(); } catch { /* ignore */ }
    source = null;
  }

  // Roll events are only animated when they arrive over the stream, so never
  // POST a roll into a gap where the stream is not listening yet.
  function streamReady() {
    if (!streamOpen) return Promise.resolve(false);
    return Promise.race([
      streamOpen,
      new Promise((resolve) => setTimeout(() => resolve(false), STREAM_OPEN_TIMEOUT_MS)),
    ]);
  }

  function openStream() {
    if (closed) return;
    closeStream();
    const url = apiUrl(
      `/api/events?room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`
    );
    // Anything waiting on the previous stream is released; a new gate opens.
    if (settleStream) settleStream(false);
    streamOpen = new Promise((resolve) => { settleStream = resolve; });

    const es = new EventSource(url);
    source = es;

    es.onopen = () => {
      if (source !== es || closed) return;
      reopenDelay = REOPEN_MIN_MS;
      streamFailures = 0;
      if (settleStream) settleStream(true);
      settleStream = null;
      streamOpen = Promise.resolve(true);
      setStatus('online');
    };

    for (const type of SSE_EVENTS) {
      es.addEventListener(type, (ev) => {
        if (source !== es || closed) return;
        setStatus('online');
        let data = null;
        try { data = ev.data ? JSON.parse(ev.data) : null; } catch { return; }
        emit(type, data);
      });
    }

    es.onerror = () => {
      if (source !== es || closed) return;
      if (settleStream) settleStream(false);
      settleStream = null;
      // Resolved-false, never pending: a roll must never block on a dead stream.
      streamOpen = Promise.resolve(false);
      setStatus('offline');
      // readyState CONNECTING: the browser is already retrying — leave it alone.
      // CLOSED: the connection failed for good (our server 404s an unknown
      // playerId after a restart), so re-join silently and open a fresh stream.
      if (es.readyState !== EventSource.CLOSED) return;
      const delay = reopenDelay;
      reopenDelay = Math.min(reopenDelay * 2, REOPEN_MAX_MS);
      clearTimeout(reopenTimer);
      reopenTimer = setTimeout(async () => {
        if (closed || source !== es) return;
        // A CLOSED stream is not proof the server forgot us — a proxy blip
        // can close an EventSource while the player is still alive within
        // the server's grace window. Retry with the same playerId first;
        // only mint a new identity if that retry also dies (e.g. the server
        // restarted and 404s our playerId).
        if (streamFailures >= 1) {
          await rejoin();        // if it fails we still retry the stream
        }
        streamFailures++;
        if (!closed && source === es) openStream();
      }, delay);
    };
  }

  // -- silent re-join (server restarted / forgot us) ------------------------

  function rejoin() {
    if (closed) return Promise.resolve(false);
    if (rejoining) return rejoining;
    const pending = (async () => {
      const res = await postJson('/api/join', { room, name }, JOIN_TIMEOUT_MS);
      if (!res.ok || !res.data || !res.data.playerId) return false;
      playerId = res.data.playerId;
      conn.playerId = res.data.playerId;
      conn.color = res.data.color;
      conn.players = res.data.players || [];
      conn.log = res.data.log || [];
      conn.offers = res.data.offers || [];
      conn.settings = res.data.settings || conn.settings;
      return true;
    })();
    rejoining = pending.then(
      (ok) => { rejoining = null; return ok; },
      () => { rejoining = null; return false; }
    );
    return rejoining;
  }

  // POST to an endpoint that needs a live playerId; one silent re-join and one
  // retry if the server has forgotten us (404). Endpoints whose 404 is an
  // expected outcome (claiming an already-claimed offer) opt out.
  //
  // A 404 alone is NOT proof the server forgot us: reveal/clear-roll answer
  // 404 unknown_roll for a roll that fell off the log, and unoffer answers
  // unknown_offer for one already gone. Re-joining on those would silently
  // mint a NEW playerId, permanently orphaning every roll the player still
  // owns (their Done/Reveal would 403 forever). Only the lookup codes —
  // unknown_player / unknown_room — mean "the server forgot me"; any other
  // code is about the thing being acted on, not about us.
  function playerGone(res) {
    const code = res.data && res.data.code;
    if (typeof code !== 'string') return true; // no code (proxy 404): old behavior
    return code === 'unknown_player' || code === 'unknown_room';
  }

  async function withPlayer(path, extra, { rejoinOn404 = true } = {}) {
    if (closed) return { ok: false, status: 0, data: null };
    await streamReady();
    let res = await postJson(path, { room, playerId, ...extra }, POST_TIMEOUT_MS);
    if (res.status === 404 && rejoinOn404 && playerGone(res)) {
      const ok = await rejoin();
      if (!ok) { setStatus('offline'); return res; }
      openStream();
      await streamReady();     // wait for the fresh stream before retrying
      res = await postJson(path, { room, playerId, ...extra }, POST_TIMEOUT_MS);
    }
    if (res.ok) setStatus('online');
    else if (res.status === 0) setStatus('offline');
    else reportRefusal(path, res);
    return res;
  }

  // A refusal is the server saying "no, and here is why" — worth telling the
  // player. A 404 is NOT one: an already-claimed offer, a roll that aged out
  // of the log, a re-join race all answer 404 as an expected no-op, and
  // nagging about those would be noise.
  function reportRefusal(path, res) {
    if (res.status === 404) return;
    const data = res.data || {};
    if (typeof data.error !== 'string') return;
    refused({
      path,
      status: res.status,
      code: typeof data.code === 'string' ? data.code : 'error',
      message: data.error,
    });
  }

  openStream();
  // Give the stream a moment to attach so an immediate roll is not missed;
  // the join already succeeded, so a slow stream still counts as online.
  await streamReady();
  if (lastStatus === null) setStatus('online');
  return conn;
}
