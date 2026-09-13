<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: load fantasy scenery on demand

The inherited assumption was that every table needed the fantasy scenery
module graph at startup. Its only consumers are Moonrise/Foxfire scenery and
the developer concept hook. The ordinary table now requests neither
`fae-lab.js` nor `faelife.js` until one of those consumers activates.

Two dynamic imports share one cached promise, using the gallery's existing
pattern. Venue identity, tower selection, collider readiness and rolls retain
their existing synchronous paths. A generation counter cancels obsolete
scenery continuations when the viewer switches palettes or leaves the scene.
Module arrival mounts only the current request, applies the current Battery
preference and invalidates the sleeping renderer. Subsequent mounts and
life-tuning restages use the loaded runtime synchronously. The concept debug
hook awaits first activation so existing concept-plate tools retain their
meaning.

An unavailable module leaves the base surface playable and reports
“Scenery couldn’t load. Reload to retry.” No rejected import escapes an SSE
handler. Browsers cache a failed module graph, so a document reload is the
explicit retry. No framework, dependency, vendor file or physics code changed.

## Actual request measurements

`tools/steps/optional-loading.mjs` starts an ephemeral server and owned Chrome,
disables HTTP caching before navigation, and records browser Resource Timing
entries. Each layout has a fresh ordinary room. The request-on-use sample
clicks the actual Moonrise setup candidate and Apply, waits for the scenery
and tower, then changes to Foxfire. Battery freezes presentation for captures;
a separate Full-mode test proves life animation and rendering resume.

These are completed same-origin **resource** requests, including CSS and API
responses; the HTML navigation and long-lived SSE connection are excluded.
“Encoded” is the body bytes actually delivered, not an offline compression
estimate. `transfer` in the JSON is the browser's header-inclusive accounting.
The backend was ANGLE / NVIDIA RTX 4090 / OpenGL ES 3.2. Phone is Chrome
390 × 844 emulation, not a physical-device energy measurement.

| Initial resources, both 1440 × 900 and 390 × 844 | Before (`81466ef`) | After | Reduction |
| --- | ---: | ---: | ---: |
| Completed requests | 60 | 58 | 2 |
| Encoded body bytes | 1,547,562 | 1,511,949 | 35,613 (2.30%) |
| Decoded body bytes | 5,142,401 | 5,048,686 | 93,715 (1.82%) |

The two modules themselves total **95,655 decoded / 35,992 encoded bytes**:
70,574 / 25,687 for `fae-lab.js`, and 25,081 / 10,305 for `faelife.js`.
Before, both arrive at startup and neither makes a new first-use request.
After, neither arrives at startup and both arrive on first use. Switching
palettes reuses the same module graph. Net savings account for the small
addition to `main.js`.

The first-use timing includes tower loading, scene construction, CDP polling
and local scheduling. It is recorded for context, not a claim of faster
scene activation. This change avoids bytes and parsing for people who never
use these experimental scenes; it does not move scene construction off the
main thread or reduce the cost once the scene is active.

- [Before resource capture](2026-09-13-optional-before.json)
- [After resource capture](2026-09-13-optional-after.json)
- [Desktop Moonrise](2026-09-13-optional-desktop-moonrise.png), [Desktop Foxfire](2026-09-13-optional-desktop-foxfire.png)
- [Phone Moonrise](2026-09-13-optional-phone-moonrise.png), [Phone Foxfire](2026-09-13-optional-phone-foxfire.png)

All four captures were inspected. The blue/green stages and their actual
populations load, palette changes appear, and the result card remains
readable. The existing experimental scenery is still framed poorly against
the newer square table: the desktop crop does not show the entire tower or
all four physical dice. This slice preserves that artwork and framing; it
is not a visual-composition fix.

## Validation

- Full unit suite passes.
- Four new browser cases pass: real delayed import while two clients play a
  held/revealed roll; rapid palette changes and leaving before reply; failed
  import with network-failed API/solo fallback and successful reload retry;
  Full-mode activation, deterministic restaging, real frame wake and idle
  sleep after removal.
- Eight existing targeted cases pass: `render-idle-wake`,
  `render-hidden-worker`, `render-model-load-wake`, `render-live-effects`,
  `battery-ambient-wake`, `instant-held-reveal-fifo`, `stability-gate`, and
  `dev-venue-shut`. Twelve distinct passing browser cases in total.
- Desktop and phone before/after runs retain the full 40d20 seed-90090 film
  hash `5a4c74a773053e33d473f6787a8510fdc6daf614cbe827cb7fe12b30ccd15695`.
  The payload includes every keyframe, sounds, roughness, landing/nudge data,
  authored values and final transforms. The shared delayed-import case also
  compares the actual complete film before and after mount and keeps all
  held values redacted until reveal.

Three additional legacy scene checks fail on the unchanged `81466ef`
baseline as well as this branch: `venue-set` expects three venue offerings
instead of six; `venue-life` expects the old rectangular box and zero
build-clamps (the current square box causes 260 authored members to be
clamped at build); `venue-dice` assumes a seeded starter pool that the new
Quick-dice first visit no longer supplies. Those fixtures and the associated
legacy composition review are outside this loading change. No assertion was
weakened to obtain a passing result.

## Remaining R3 work

The startup audit found another concrete seam: `towerglb.js` eagerly imports
`GLTFLoader.js` (109,259 decoded bytes), pulling in `BufferGeometryUtils.js`
(32,292). This defeats the already-lazy loader in the new table-design
registry. The subsequent [model-parser slice](2026-09-13-optional-model-parser.md)
defers that graph within the existing tower-model readiness gate, with
separate failure/cancellation/portal tests.

The large main module (1,876,713 decoded bytes in this capture), Three.js and
Cannon still dominate startup. Further extraction needs an actual consumer
boundary; removing an import while another eager consumer still reaches it
will not save a request. Tower simulation still uses its documented inline
fallback. Cold shader work, expensive material fallbacks, and physical-device
power/memory measurements remain open; Auto presentation still lacks a
reliable measured criterion. No deployment or cloud configuration changed.
