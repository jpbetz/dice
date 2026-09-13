<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Ordinary throws bake off the main thread

Follow-up: [complete turn events and worker baking](2026-09-13-film-turns.md)
now includes turns and rethrows. The measurements below describe the first slice.

R3's third engineering slice moves the actual Cannon solver loop to a module
worker for ordinary non-turn throws, including held/whispered films. Authored
values and their final face correction stay on the main thread. No server,
account, camera, artwork, vendor, dependency or deployment changes.

## Boundary and fallback

`film-bake.js` is the existing complete bake, moved out of `main.js`: collision
recording, rough surface track, damping, displacement termination, nudges,
landings, tail cutting and tower retries. Its inline and worker callers share
one algorithm. Worker imports use explicit relative vendor URLs, independent
of the document's import map; no DOM, canvas or textures enter the worker.

`film-wire.js` captures ordered bodies, canonical shared hulls and face
normals, contact materials, solver settings, collision matrices, SAP order,
body state, remaining PRNG state and tuning. No authored result array enters
this DTO. Results transfer Float64 poses and Uint8 rough tracks, plus sound,
landing and solver-state records. Restoring the original SAP array **in
place** matters: Cannon's add/remove listeners retain that array's identity.

Replies merge **only their own cast** into the live world. Another player's
old dice can leave or reveal during the bake. Those bodies are never restored
from the snapshot: surviving poses and newer configuration stay live, removed
bodies stay absent, and newly added colliders remain. Contact matrices are
remapped by surviving body IDs because removal renumbers Cannon's indices;
SAP retains its array, filters removed IDs, includes new bodies and rechecks
its bounds/order. Only the completed solver clock advances. The film still
uses the immutable pre-event snapshot, as when a synchronous bake completed
before the same event was processed.

This is proved with Alice's shared 40d20 while Bob clears, collects or reveals
an older settled roll. The clear case hung on the initial implementation;
all three now complete without losing the later mutation. A separate unit
proof compares the entire next film to the original live-world inline bake
followed by the same remove/move/add/tuning event, including contact matrices.
Venue changes are visual; their tower changes and normal zoom changes already
defer through the busy predicate. The developer tower lab can move the main
world's back wall immediately, which is why the merge also preserves moved
and newly added colliders, rather than special-casing old-roll removals.

One `currentRoll.baking` reservation keeps existing FIFO, busy checks and
pending reveal/collect/clear behavior. A whole-table clear terminates the
worker and retires the reservation; old replies and old worker errors cannot
alter a replacement. A skip during preparation is honored when the film
arrives. Workers are reused between throws; unavailable workers, load/errors
or a 15-second timeout run the captured snapshot through the inline fallback.
Unsupported collider types also keep the original inline path.

This first slice kept towers, turns, rethrows and late-join reconstruction
inline. The turn queue lost keep metadata when a rethrow arrived during prior
playback. The [turn follow-up](2026-09-13-film-turns.md) fixes that complete-event
queue and moves turns/rethrows to the worker; towers and reconstruction remain
inline.
Existing synchronous `throwSeeded` probes remain inline unless they explicitly
opt in with `useFilmWorker(true)`; the seeded developer bench uses the product
worker path.

## Measured result

Owned ephemeral servers only. Chromium, 1440×900 desktop and 390×844 touch
phone emulation, DPR 1. The observed backend was ANGLE / NVIDIA RTX 4090 /
OpenGL ES 3.2 in every row. The CPU×4 rows throttle the **main target**;
worker timing did not scale by four, so they do not represent an entire slow
phone. No physical-phone, battery, memory-heap or energy claim.

Seated `devBench` throws, seeds 90090 and 32676, same 40d20 workload:

| View / main CPU | Before input return | Worker input return | Before main long task | Worker main long task |
| --- | ---: | ---: | ---: | ---: |
| Desktop / ×1 | 276–292 ms | 5.7–5.8 ms | 276–292 ms | none ≥50 ms |
| Phone / ×1 | 263–286 ms | 4.8–5.8 ms | 262–285 ms | none ≥50 ms |
| Desktop / ×4 | 1,059–1,135 ms | 19–34 ms | 1,059–1,135 ms | none ≥50 ms |
| Phone / ×4 | 1,044–1,145 ms | 22–34 ms | 1,044–1,145 ms | none ≥50 ms |

A scheduled DOM click ran **during the real bake** in every worker sample;
its latency closely follows input-return time. Worker film readiness was
262–368 ms for stress throws. This is a responsiveness win, not a solver
speedup. Samples are individual seeded observations, not population averages.
The first cold desktop 4d6 still triggered a 236 ms render/shader task after
film arrival (210 ms on the original build). Initial worker startup also
raised that first film's ready time from 20 to 62 ms. Warm 4d6 preparation
remains small. Rendering startup and optional loading remain open R3 work.

A 40d20 snapshot occupied about 173–175 KB when serialized as diagnostic JSON;
its transferred poses were 363–883 KB, depending on the film length. These
are data sizes, not heap residency. The worker also parses its own Three and
Cannon modules; memory and battery effects need separate measurement.

## Evidence and verification

All **12 seated films** match the actual pre-worker commit `37dad90` exactly:
poses, authored final faces, sounds, rough bytes, landings and nudges. No
physics golden changed. [Original measurements](2026-09-13-film-before.json)
and [worker measurements](2026-09-13-film-after.json) retain full fingerprints.

`film-worker-parity` separately compares live-world and reconstructed-world
bakes across seven mixed die types, three seeds, 40d20 stress, and collisions
with existing settled dice. Lifecycle tests cover worker reuse, unavailable
and failed workers, stale messages/errors, timeout, cancellation, FIFO, skip,
reveal received during a hidden bake, and late join. Original placement and
tower goldens, determinism, turns, clear/zoom deferral and developer bench
are retained. Full units passed with integration's corrected schema fixture;
the fixture is not duplicated in this commit.

`turn-keep-gesture` also failed on the untouched pre-worker base: it could
observe idle before the rethrow request's event arrived. It now waits for the
server-authored final throw budget before waiting for idle.

Reproduce with the same `tools/steps/film-worker.mjs` on both checkouts:

```
CHROME_BIN=/path/to/verified-gpu-wrapper node tools/drive.mjs tools/steps/film-worker.mjs before
CHROME_BIN=/path/to/verified-gpu-wrapper node tools/drive.mjs tools/steps/film-worker.mjs after --compare=/path/to/before/report.json
node tests/e2e/run.mjs --only film-worker,perf-determinism,place-seeds-unchanged,tower-roll,turn-throws,resync-shrouded
```

The desktop and phone screenshots were inspected. Dice retain their exact
poses and artwork. The inherited rail/camera clipping remains visible before
and after: [phone](2026-09-13-film-phone.png),
[desktop stress](2026-09-13-film-desktop.png). Those observations predate the
parallel R2 phone/table redesign and are not a claim that framing is solved.
