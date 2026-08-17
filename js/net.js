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
//   {online: true, playerId, color, players, log, roll, clear, forgetSeat,
//    disconnect}
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
  'settings-changed', 'table-setup', 'table-split',
];

function apiUrl(path) {
  // Same-origin, absolute: the server mounts the API at /api/* next to the app.
  return new URL(path, window.location.origin).toString();
}

// An id for one SSE stream. Only ever compared for equality against the id
// this same client sent, so any collision-free-enough string will do —
// randomUUID is unavailable over plain http on a LAN address, which is a
// perfectly ordinary way to run this for a table in one room.
function newStreamId() {
  try { return crypto.randomUUID(); } catch { /* insecure context */ }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

// -- the seat, remembered ----------------------------------------------------
//
// A refresh used to mint a whole new player: the roster showed two pills with
// your name until the abandoned seat reaped 5s later, and the palette handed
// you a different color. So the tab remembers which seat it is sitting in and
// offers it back to /api/join (see server.js handleJoin's RESUME path).
//
// sessionStorage, NOT localStorage, is the right drawer: it is scoped to the
// TAB, so a reload sits back down while a SECOND tab is genuinely a second
// player — which is what a shared screen expects, and what the e2e harness
// relies on when it seats several tables against one origin.
//
// The stored color is only a PREFERENCE, honored for a seat that has already
// lapsed (a slow reload, a restarted server); the server refuses it if
// someone else is wearing that hue.
const seatKey = (room) => `dice.seat.v1:${room}`;

function readSeat(room) {
  try {
    const seat = JSON.parse(sessionStorage.getItem(seatKey(room)) || 'null');
    return seat && typeof seat.id === 'string' ? seat : null;
  } catch { return null; }
}

function writeSeat(room, id, color) {
  try { sessionStorage.setItem(seatKey(room), JSON.stringify({ id, color })); } catch { /* ignore */ }
}

/** Give up the seat: the next join takes a fresh one ('Leave & switch seat'). */
export function forgetSeat(room) {
  try { sessionStorage.removeItem(seatKey(room)); } catch { /* ignore */ }
}

// -- the browser, remembered (`dice.who.v1`) ---------------------------------
//
// ONE KEY, ONE JOB: to let a seat outlive its tab (docs/IDENTITY.md §5, rung 1).
//
// The seat above is per-TAB by design, and that design is right — but it made
// the seat's life the AUTHORITY's life, and authority was meant to belong to a
// person. Close the tab on a held roll and nobody could ever reveal it; come
// back and your own secret rolls were gone from your own log. This key is the
// whole fix: the server hands the same playerId back to the browser that was
// sitting in a seat nobody is on now, and every authority check heals untouched.
//
// WHAT IT IS: an opaque bearer string, minted once per browser. NEVER displayed,
// never broadcast, never in any snapshot or projection — it rides exactly one
// place, the /api/join request body. It is NOT a login and must never become
// one: it authorizes nothing but sitting back down in a seat that is already
// yours and currently empty, and nothing else in this app may branch on it.
//
// NO SCHEMA STAMP (ROADMAP C22, IDENTITY §5): it is a single opaque value, not a
// shaped blob, and stamping it would invent a schema for a string. Recorded here
// so nobody adds one. It IS on main.js's PURGE_KEEPS list, by that list's own
// two arguments — there is no shape an unidentifiable old build could have left
// it in, and losing it is silent (a lapsed seat simply stops being resumable).
export const LS_WHO = 'dice.who.v1';

// randomUUID is unavailable over plain http on a LAN address, which is an
// ordinary way to run this for a table in one room — hence the same fallback
// newStreamId uses. A browser that will not store returns '' and simply keeps
// the behavior it had before this shipped: the field is present-or-absent all
// the way through, and absent is what every client did yesterday.
function browserWho() {
  try {
    const held = localStorage.getItem(LS_WHO);
    if (typeof held === 'string' && held.length >= 8) return held;
    let minted;
    try { minted = crypto.randomUUID(); } catch { minted = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
    localStorage.setItem(LS_WHO, minted);
    // Read back rather than trust the write: a storage that silently refuses
    // must not leave us offering a key the next boot will not recognise.
    return localStorage.getItem(LS_WHO) === minted ? minted : '';
  } catch { return ''; }
}

/**
 * Pre-join peek at a room's prepared table (GET /api/table — ROADMAP §G5).
 *
 * The seat picker's one impossible read: it renders BEFORE the join, and
 * everything else a client knows about a room arrives in the join response.
 * Answers {name?, seats?: [{name, pools}]} — just enough to draw the picker —
 * or null for every failure there is: no server (static hosting answers 404),
 * a refusal, junk, or nothing inside the timeout. Callers treat null as
 * "show the plain free-text prompt"; the join must NEVER hang on this, which
 * is what the short timeout is for (goal 9: the picker is an enhancement, and
 * an enhancement that can stall the door is a regression wearing a feature's
 * name).
 */
export async function peekTable(room, { timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      apiUrl(`/api/table?room=${encodeURIComponent(room)}`),
      { cache: 'no-store', signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
  } catch {
    return null; // no server / aborted / non-JSON — the plain prompt is the answer
  } finally {
    clearTimeout(timer);
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

  // The seat this tab last sat in (if any) rides the join: the server hands
  // the same playerId and color back instead of minting a new player.
  //
  // …and BESIDE it, the browser key (see browserWho): the seat memory covers a
  // reload, the key covers a tab that closed. Both, not either — the seat id is
  // still the truth when this tab has one, and the server only falls back to
  // the key when it does not (server.js resumableSeatFor).
  const seat = readSeat(room);
  const who = browserWho();
  const joinBody = {
    room,
    name,
    ...(seat ? { playerId: seat.id, color: seat.color } : {}),
    ...(who ? { who } : {}),
  };

  let joined = await postJson('/api/join', joinBody, JOIN_TIMEOUT_MS);
  // status 0 = the fetch itself died (a transient network/browser hiccup —
  // observed in practice on a fresh origin's very first request). A real
  // static host answers instantly with 404/405, so ONE short-backoff retry
  // cannot meaningfully delay solo detection — and it keeps a live player
  // from being silently stranded in solo play by a single dropped request.
  if (!joined.ok && joined.status === 0) {
    await new Promise((r) => setTimeout(r, 600));
    joined = await postJson('/api/join', joinBody, JOIN_TIMEOUT_MS);
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
  writeSeat(room, playerId, joined.data.color);   // survive this tab's next reload
  let source = null;
  let closed = false;
  let rejoining = null;         // in-flight silent re-join
  let reopenTimer = null;
  let reopenDelay = REOPEN_MIN_MS;
  let streamFailures = 0;       // consecutive CLOSED streams since last onopen
  let lastStatus = null;
  let streamOpen = null;        // resolves once the current stream is live
  let settleStream = null;
  // The id of the stream we are on now. The server treats each open stream as
  // separately alive (server.js findStream), and both the leave beacon and the
  // pong name one — a beacon from a closing tab must not be able to drop the
  // stream a RELOAD has already opened, and the id is what tells them apart.
  let streamId = null;

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
    // The room's prepared table as of this join — {rev, table, profiles, at}
    // (ROADMAP §G4) — or null when nobody has pushed one. A SNAPSHOT, exactly
    // like `players`/`log`/`settings` above: net.js does not keep it current,
    // it hands later 'table-setup' events to onEvent and the caller owns the
    // state from there, the same way it owns settings after 'settings-changed'.
    setup: joined.data.setup || null,
    // Sub-tables (ROADMAP §3b L4): the table this one broke out of, and the
    // breakouts running off it. Snapshots like everything above — later
    // 'table-split' events go to onEvent and the caller owns the state.
    parent: joined.data.parent || null,
    children: joined.data.children || [],

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
      // Dice-set identity (Tier 6 §9) — also outside the split, for the same
      // reason: cosmetic, rides beside either shape. Validated server-side.
      if (typeof opts.set === 'string' && opts.set) body.set = opts.set;
      // Per-die sets (§9 mixed pools): aligned to the BASE dice; null entries
      // wear the roll-level set. Also cosmetic, also server-validated.
      if (Array.isArray(opts.sets) && opts.sets.some(Boolean)) body.sets = opts.sets.map((s) => s || null);
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

    // scope: 'mine' (default — your rolls only) or 'table' (everyone's).
    // See server handleClear and UX §7.7's housekeeping rule.
    async clear(scope = 'mine') {
      const res = await withPlayer('/api/clear', { scope });
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
    // §9: your default dice set rides the same publish (present-or-absent,
    // absent = standard) so foreign racks resolve unmarked pools to YOUR
    // skin, not the viewer's.
    // §11: `profile` and `system` label the rack — WHICH of your profiles this
    // is and what it was built for — so a teammate browsing it can name it and
    // copy it. Present-or-absent, and absent is exactly what shipped before.
    // `library` (C17): every profile this player holds, so the table can
    // offer them as seats without anyone pushing a setup. Rides this call
    // rather than earning its own, because it changes exactly when the rack
    // does and the server's no-op guard already covers both.
    async setPools(pools, set, profile = null, system = null, library = null) {
      const res = await withPlayer('/api/pools', {
        pools,
        ...(set ? { set } : {}),
        ...(profile ? { profile } : {}),
        ...(system ? { system } : {}),
        ...(library ? { library } : {}),
      });
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
    async claim(offerId, opts = {}) {
      const body = { offerId };
      // The claimer throws their OWN dice: their set rides the claim.
      if (typeof opts.set === 'string' && opts.set) body.set = opts.set;
      const res = await withPlayer('/api/claim', body, { rejoinOn404: false });
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

    // Push the prepared table — the organizer's room settings plus the player
    // profiles they built (ROADMAP §G4). Any player may, and it grants no
    // power: it is furniture like the felt colour, and it is authority over
    // nobody's saved pools (the seat picker previews and applies on a click).
    //
    // `rev` is a monotonic counter the caller keeps beside its own copy of the
    // setup. The server takes the push only when rev BEATS the room's, so two
    // organizer tabs cannot ping-pong. Losing is NOT an error — the answer is
    // {applied: false, rev} naming the rev that won, which is what a re-push
    // needs in order to either stand down or beat it. null means the request
    // itself failed (offline, refused).
    //
    // Everyone — us included — learns of a winning push on the 'table-setup'
    // event; apply on that echo, never optimistically, exactly as with
    // settings. The whole thing goes through withPlayer, so it inherits the
    // one re-join-on-404 retry every other POST here uses.
    async pushTable({ rev, table, profiles } = {}) {
      const body = { rev };
      if (table) body.table = table;
      if (Array.isArray(profiles)) body.profiles = profiles;
      const res = await withPlayer('/api/table', body);
      if (!res.ok || !res.data) return null;
      return { applied: res.data.applied === true, rev: res.data.rev };
    },

    // SUB-TABLES (ROADMAP §3b L4, CUJ5). One endpoint, two ends — see
    // server.js handleSplit. Both answer {applied} rather than throwing when
    // they lose a race, and both grant no power: any player may split, and a
    // split is furniture, not a role (goal 10).

    // Called at the PARENT, before navigating: "this table has a breakout at
    // key `child`". Await it — if it does not land, the breakout exists but
    // nobody at the main table can see it, which is the one failure worth
    // stopping for. null means the request itself failed.
    async split({ child, childName } = {}) {
      const res = await withPlayer('/api/split', { child, childName: childName || '' });
      if (!res.ok || !res.data) return null;
      return { applied: res.data.applied === true, children: res.data.children || [] };
    },

    // Called at the CHILD, right after joining: "this table is a breakout of
    // `parent`", carrying the felt/system to inherit. Losing (somebody
    // declared first, or the table has already been played at) is {applied:
    // false} and needs no handling — the server's answer already stands.
    async declareParent({ parent, parentName, settings } = {}) {
      const body = { parent, parentName: parentName || '' };
      if (settings && Object.keys(settings).length) body.settings = settings;
      const res = await withPlayer('/api/split', body);
      if (!res.ok || !res.data) return null;
      return { applied: res.data.applied === true, parent: res.data.parent || null };
    },

    // Give up the seat for good — 'Leave & switch seat', never a reload.
    forgetSeat() { forgetSeat(room); },

    /**
     * Say we are going instead of letting the server infer it (server.js
     * handleLeave). Two shapes, and the difference is not politeness:
     *
     *   leave()                  — the pagehide beacon. Drops THIS stream and
     *                              leaves the seat on the ordinary grace, so a
     *                              reload (which fires the identical beacon)
     *                              sits back down untouched.
     *   leave({immediate: true}) — 'Leave & switch seat'. The seat goes now.
     *
     * sendBeacon, not fetch, for the beacon: a page being torn down does not
     * live long enough to own a response, and it is the one transport the
     * browser promises to deliver anyway. It cannot be awaited or checked —
     * which is exactly why the server's liveness sweep still has to exist.
     */
    leave({ immediate = false } = {}) {
      if (closed) return Promise.resolve(false);
      const body = { room, playerId, streamId, ...(immediate ? { immediate: true } : {}) };
      // The gesture is a normal POST: the page is staying, so we can wait for
      // the answer and the caller can act on the room being rid of us.
      if (immediate) return postJson('/api/leave', body, POST_TIMEOUT_MS).then((res) => res.ok);
      try {
        // A plain string beacon is sent as text/plain — CORS-safelisted, so it
        // never needs a preflight the dying page could not complete. The
        // server parses the body by content, not by its content type.
        if (navigator.sendBeacon(apiUrl('/api/leave'), JSON.stringify(body))) {
          return Promise.resolve(true);
        }
      } catch { /* fall through to keepalive */ }
      // sendBeacon refused (over quota, or unavailable). keepalive: true is
      // the same promise in fetch's clothing — the request outlives the page.
      try {
        fetch(apiUrl('/api/leave'), {
          method: 'POST', body: JSON.stringify(body), keepalive: true, cache: 'no-store',
        }).catch(() => {});
      } catch { /* nothing left to try; the sweep covers us */ }
      return Promise.resolve(true);
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
    streamId = newStreamId();
    const url = apiUrl(
      `/api/events?room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`
      + `&streamId=${encodeURIComponent(streamId)}`
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

    // The server's liveness question, answered (server.js LIVENESS_TIMEOUT_MS).
    // Deliberately NOT in SSE_EVENTS: the app has no business seeing a
    // heartbeat, and net.js owning it keeps the whole mechanism in the one
    // module that owns the stream.
    //
    // Fire-and-forget. A pong that fails tells us nothing the stream's own
    // error handling does not already own, and retrying it would pile load
    // onto a server we have just failed to reach. Missing one is safe by
    // design: the server allows three.
    es.addEventListener('ping', (ev) => {
      if (source !== es || closed) return;
      setStatus('online');
      // Answer with the id the SERVER named, falling back to ours — they
      // differ only if a stream outlived the variable, and the server's
      // is the one that identifies the stream it is asking about.
      let id = streamId;
      try {
        const data = ev.data ? JSON.parse(ev.data) : null;
        if (data && typeof data.streamId === 'string') id = data.streamId;
      } catch { /* keep ours */ }
      if (!id) return;
      postJson('/api/pong', { room, playerId, streamId: id }, POST_TIMEOUT_MS).then((res) => {
        // 'unknown_stream' means the server is no longer holding this stream —
        // we are listening to a connection nothing will ever be sent down
        // (server.js handlePong says why). It is the ONE answer worth acting
        // on: reopen, and the next ping confirms it. Anything else, including
        // a network failure, is the stream's own business.
        if (source !== es || closed) return;
        if (res.data && res.data.code === 'unknown_stream') openStream();
      });
    });

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
      // The seat we hold was just REFUSED (that is what brought us here), so
      // this is a fresh join — but the color still rides along as a
      // preference, and a restarted server hands it straight back.
      //
      // The browser key rides too, and it is the same argument as the color
      // only stronger. Two stream failures in a row is not proof the room
      // forgot us: a proxy blip can close an EventSource while our seat is
      // still there with nobody on it. Before the key, THIS was the path that
      // orphaned a player's own rolls — a brand-new playerId, and their
      // Done/Reveal 403ing forever afterwards. If the seat is still there and
      // empty the server sits us back down in it; if it truly is gone, this is
      // exactly the fresh join it always was.
      const mine = browserWho();
      const res = await postJson(
        '/api/join',
        { room, name, color: conn.color, ...(mine ? { who: mine } : {}) },
        JOIN_TIMEOUT_MS,
      );
      if (!res.ok || !res.data || !res.data.playerId) return false;
      playerId = res.data.playerId;
      writeSeat(room, playerId, res.data.color);
      conn.playerId = res.data.playerId;
      conn.color = res.data.color;
      conn.players = res.data.players || [];
      conn.log = res.data.log || [];
      conn.offers = res.data.offers || [];
      conn.settings = res.data.settings || conn.settings;
      // Absent means the room genuinely has NO prepared table — a restarted
      // server forgot it — so this falls to null rather than keeping the last
      // one we saw. §G6's re-push is what heals that, and it can only notice
      // the gap if the gap is visible here.
      conn.setup = res.data.setup || null;
      // Same rule for the sub-table wiring: absent means the room genuinely
      // holds none (a restarted server forgot the split), so it falls to
      // empty rather than keeping what we last saw.
      conn.parent = res.data.parent || null;
      conn.children = res.data.children || [];
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
