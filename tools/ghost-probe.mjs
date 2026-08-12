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

// GHOST-SEAT PROBE — run against PRODUCTION (or BASE=http://... any server):
// one deaf client that ignores every ping, one watcher that answers all of
// them. Proves the liveness reap (server.js LIVENESS_TIMEOUT_MS) retires
// the deaf stream on the ~70s application clock instead of Cloud Run's
// 3601s platform ceiling, and that the watcher receives the `player-left`
// roster event ~5s later (DISCONNECT_GRACE_MS). A deaf-but-connected
// client is indistinguishable, container-side, from the closed-tab stream
// the proxy never reports — which is exactly the ghost this reproduces.
//
// Uses a throwaway room; the room dies when the probe's seats reap.
// Verified green against dice-00028-fbg on 2026-08-15: drop at +73.8s,
// player-left at +78.8s.
//
//   node tools/ghost-probe.mjs
const BASE = process.env.BASE || 'https://dice-5wi5rwk2oa-uc.a.run.app';
const room = `ghost-probe-${Math.random().toString(36).slice(2, 10)}`;
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function join(name) {
  const r = await fetch(`${BASE}/api/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room, name }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`join ${name}: ${JSON.stringify(j)}`);
  return j.playerId ?? j.id ?? j.player?.id;
}

function openStream(name, playerId, { pong }) {
  const streamId = `probe-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const url = `${BASE}/api/events?room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}&streamId=${streamId}`;
  return fetch(url, { headers: { accept: 'text/event-stream' } }).then(async (r) => {
    console.log(`${ts()} ${name}: stream open (${r.status})`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = /^event: (.*)$/m.exec(chunk)?.[1];
        const data = /^data: (.*)$/m.exec(chunk)?.[1];
        if (!ev) continue;
        if (ev === 'ping') {
          if (pong) {
            let id = streamId;
            try { const d = JSON.parse(data); if (d && typeof d.streamId === 'string') id = d.streamId; } catch {}
            fetch(`${BASE}/api/pong`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ room, playerId, streamId: id }),
            }).catch(() => {});
            console.log(`${ts()} ${name}: ping -> pong`);
          } else {
            console.log(`${ts()} ${name}: ping (IGNORED)`);
          }
        } else if (ev.startsWith('player-') || ev === 'hello') {
          console.log(`${ts()} ${name}: event ${ev} ${data?.slice(0, 120)}`);
        }
      }
    }
    console.log(`${ts()} ${name}: STREAM CLOSED BY SERVER`);
  });
}

const watcherId = await join('Watcher');
const ghostId = await join('Ghost');
console.log(`${ts()} joined room ${room}`);
const watcher = openStream('Watcher', watcherId, { pong: true });
const ghost = openStream('Ghost', ghostId, { pong: false });
await ghost; // resolves when the server force-drops the deaf stream
// give the grace reap + roster event a moment, then let the watcher report
await new Promise((r) => setTimeout(r, 12000));
process.exit(0);
