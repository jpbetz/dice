<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: load the model parser with the first model

`towerglb.js` eagerly imported the GLTF parser, which also loaded
`BufferGeometryUtils.js` on every ordinary table. That eager consumer defeated
the lazy import already used by table designs and their previews.

The parser import now runs alongside the model fetch inside `towerGlbEnsure`.
Both must finish before parsing, portal validation, cache readiness and
socketing. The existing retry ladder and non-rejecting error result handle
parser failure. Multiple tower variants, previews and table designs share
the browser's cached module graph. No vendor code, public API, portal
contract, physics or film queue changed in this slice.

## Measured resource change

The same `tools/steps/optional-loading.mjs` run measures real Resource Timing
body bytes with HTTP caching disabled, on desktop 1440 × 900 and emulated
390 × 844. Backend: ANGLE / NVIDIA RTX 4090 / OpenGL ES 3.2. Figures below
compare the prior scenery-loading commit `88cacc8` with this parser change
plus the independent [pending-tower cancellation fix](2026-09-13-tower-pending-cancel.md).
As in the earlier capture, these are completed same-origin resources;
HTML navigation and the open SSE connection are excluded.

| Initial resources, both layouts | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Requests | 58 | 56 | 2 |
| Encoded body bytes | 1,511,949 | 1,480,306 | 31,643 |
| Decoded body bytes | 5,048,686 | 4,907,507 | 141,179 |

At first model use the browser requests `GLTFLoader.js` (109,259 decoded /
24,361 encoded bytes) and `BufferGeometryUtils.js` (32,292 / 7,390). Neither
is requested by the initial ordinary table. Changing from a tower to a table
design requests neither module again. Net savings account for the small
loader and pending-cancellation source additions.

Together with the preceding scenery slice, the measured initial resource
change is **60 → 56 requests, 67,256 fewer encoded body bytes and 234,894
fewer decoded body bytes**. This is a startup delivery reduction, not a claim
of faster physics, scene activation or battery life. A first model use still
loads and parses its model, and the existing held-replay deadline/failure
behavior is retained.

- [Prior capture](2026-09-13-optional-after.json)
- [Final parser capture](2026-09-13-optional-parser-after.json)
- [Desktop first model use](2026-09-13-optional-parser-desktop.png)
- [390-pixel phone first model use](2026-09-13-optional-parser-phone.png)

Both final captures were inspected. The real scene activates and the result
card remains readable. The old experimental scene's desktop framing still
crops the tower and physical dice; this matches the previous slice's noted
composition limitation and is not changed by deferring its parser.

## Validation

Full unit suite passes. Twelve distinct targeted browser cases pass:

- New `optional-parser-replay`: a real delayed parser request holds a late
  joiner's actual hidden roll before any wrong-core film is baked; parsed
  portals and the complete replay then match the existing client's film,
  held values stay redacted until reveal, and a subsequent table design
  reuses the same parser graph.
- New `optional-parser-cancel`: None supersedes a pending parser/model,
  late arrival cannot restore the tower, world bodies stay unchanged,
  and later activation uses the validated model cache.
- New `optional-parser-failure`: the actual parser URL is unavailable,
  all existing retries complete, no guessed portals/colliders install,
  pending configuration remains explicit, selecting None allows ordinary
  play, and reload retries the module graph successfully.
- `tower-pending-cancel`, `tower-default-core-freeze`, `tower-glb-loader`,
  `tower-glb-freshness`, `table-designs`, `table-design-failure`,
  `table-design-cancel-load`, `render-model-load-wake`, and
  `battery-ambient-wake`.

Both viewport runs preserve the complete 40d20 seed-90090 film hash
`5a4c74a773053e33d473f6787a8510fdc6daf614cbe827cb7fe12b30ccd15695`.
The parser test also compares all actual first/replay keyframes, sounds,
roughness, landings, nudges and values across clients with different loading
states. No settings-order assertion was weakened: the separate cancellation
prerequisite was first reproduced with a real held GLB on the unchanged
baseline, then fixed through the existing queue path.

## Remaining R3 work

The two confirmed optional module graphs are deferred. The main module,
Three.js and Cannon still dominate initial delivery; additional extraction
needs a genuine unused consumer boundary. Optional imports do not remove the
main-thread work of constructing a requested scene. Tower films still use
the documented inline solver path. Cold shader stalls and costly material
fallbacks remain, as do measurements on physical devices; Auto presentation
still lacks a reliable measured criterion. This slice makes no deployment
or cloud change.
