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

const JOIN_TIMEOUT_MS = 4000;
const POST_TIMEOUT_MS = 8000;
const STREAM_OPEN_TIMEOUT_MS = 3000;
const REOPEN_MIN_MS = 1000;
const REOPEN_MAX_MS = 15000;
const SSE_EVENTS = ['hello', 'player-joined', 'player-left', 'roll', 'clear'];

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
 * @returns {Promise<object>} connection handle (see module header)
 */
export async function connect({ room, name, onEvent, onStatus } = {}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const report = typeof onStatus === 'function' ? onStatus : () => {};

  const joined = await postJson('/api/join', { room, name }, JOIN_TIMEOUT_MS);
  if (!joined.ok || !joined.data || !joined.data.playerId) {
    // No server (or it refused us): the caller falls back to solo play.
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

    // Ask the server to roll. Values arrive later on the 'roll' event — the
    // caller must never animate from this return value.
    async roll(dice, label = '') {
      const res = await withPlayer('/api/roll', { dice: [...dice], label: label || '' });
      return res.ok && res.data ? res.data.roll : null;
    },

    async clear() {
      const res = await withPlayer('/api/clear', {});
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
      return true;
    })();
    rejoining = pending.then(
      (ok) => { rejoining = null; return ok; },
      () => { rejoining = null; return false; }
    );
    return rejoining;
  }

  // POST to an endpoint that needs a live playerId; one silent re-join and one
  // retry if the server has forgotten us (404).
  async function withPlayer(path, extra) {
    if (closed) return { ok: false, status: 0, data: null };
    await streamReady();
    let res = await postJson(path, { room, playerId, ...extra }, POST_TIMEOUT_MS);
    if (res.status === 404) {
      const ok = await rejoin();
      if (!ok) { setStatus('offline'); return res; }
      openStream();
      await streamReady();     // wait for the fresh stream before retrying
      res = await postJson(path, { room, playerId, ...extra }, POST_TIMEOUT_MS);
    }
    if (res.ok) setStatus('online');
    else if (res.status === 0) setStatus('offline');
    return res;
  }

  openStream();
  // Give the stream a moment to attach so an immediate roll is not missed;
  // the join already succeeded, so a slow stream still counts as online.
  await streamReady();
  if (lastStatus === null) setStatus('online');
  return conn;
}
