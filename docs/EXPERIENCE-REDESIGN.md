<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Experience redesign — plan of record

**Adopted 2026-09-12.** Joe approved the September experience audit's three
priorities: “Great ideas. I'm all in.” His instruction is to record the plan
and begin **planning item (1)**. This is the current investment order.
On 2026-09-13 he asked to focus on one area and start implementing: the
[first personal-kit slice](SHIPPED.md#personal-name-and-dice-collection-2026-09-13)
now delivers direct name editing and a visual dice collection. The
[compact table-controls follow-up](SHIPPED.md#compact-table-controls-and-setup-2026-09-13)
fits that entry into the name row and reuses the table label for shared setup,
following his instruction to conserve the rolling area's space. The larger
release remains in progress. Joe then authorized autonomous implementation
through all three priorities, with agents and reviewed increments;
[REDESIGN-PROGRESS.md](REDESIGN-PROGRESS.md) records execution. The detailed R1 design is in
[PEOPLE-DICE-TABLES.md](PEOPLE-DICE-TABLES.md).

The product direction is approved. Release boundaries and technical choices
below are the working plan, not additional statements attributed to Joe.
[GOALPOST.md](GOALPOST.md) retains the product promises; its dated amendment
records the persistence and identity changes this direction requires.

## The decision

Prioritize structural redesign over additional features. The app has deep
dice mechanics and artwork, but ordinary tasks are hard to discover and the
shared surface delivers less visual interest than its controls. Make it easy
to find your dice, recognize your people, and return to your group's table.

**Space and focus, clarified by Joe 2026-09-13:** keep the root interface that
stays on display economical. Once the player opens a task, give it the space
it needs, including expanded panels or full-screen and near-full-screen
dialogs. Compact entry points can lead to generous workspaces. Size each view
for its content and keep the return to the same live table clear.

| Priority | Investment | First useful release | What follows |
| --- | --- | --- | --- |
| **1 — implementation started** | **People, personal dice, and persistent tables.** Three clear destinations: Tables, My dice & rolls, People. Direct identity editing, a visual dice collection, visible table setup, familiar first rolls, and an optional recoverable identity. | Direct name editing, a usable dice gallery with favorites and practice, named table controls, and Quick dice with explicitly chosen starter kits. | Durable table homes, identity recovery, synchronized libraries, friends, presence, and an invitation inbox. |
| **2 — three compositions implemented** | **The whole shared playing surface.** Compose recognizable tables and places for people; keep names and each player's latest visible result readable together. | One excellent multiplayer composition and a phone layout with a full-width table, bottom roll tray, and sheets for dice, people, and history. | Explore three complete designs: a worn tavern table with brass inlays, an illustrated navigation table, and a carved stone circle. Explore concurrent or grouped roll presentation. |
| **3 — measured engineering track** | **Lightweight play.** Reduce delivery, simulation, and rendering costs while retaining character and readable dice. | Verify production compression and establish a reproducible baseline; implement missing compressed delivery and reduce dice-face material draws. | Load optional features on demand, move heavy simulation into a worker, stop unnecessary rendering at rest, and develop an attractive Battery saver presentation with an optional instant result. |

These are investment priorities, not a waterfall. Item (1)'s mobile shell
must agree with (2)'s bottom tray before implementation; its gallery must
avoid loading the whole art catalogue at startup, serving (3). Small,
measured delivery improvements can land while the product design develops.
The identity backend does not delay the first discoverability release.

**R3 delivery slice, 2026-09-13:** production was verified to send six entry
assets uncompressed even when offered Brotli/gzip. The server now negotiates
and caches compressed public text responses. The same six local assets fall
from 3.93 MB to 1.10 MB with Brotli; this is an encoded-byte comparison, not
a page-load or battery claim. The reproducible probe and operational details
are in [DEPLOY → Static delivery](DEPLOY.md#static-delivery-2026-09-13).
The [dice-face atlas slice](redesign/2026-09-13-dice-materials.md) now reduces
standard d20s from 21 actual draw groups to two, preserving face art and
physics. Procedural flow/dissolve keeps its established rendering path.
The [ordinary-throw worker slice](redesign/2026-09-13-film-worker.md) now moves
the real solver off the main thread. Seated 40d20 input return falls from
263–292 ms to 4.8–5.8 ms in desktop/phone emulation, with identical films.
The [turn-worker follow-up](redesign/2026-09-13-film-turns.md) now retains
complete ordered turn/reveal/collection events and moves rethrows off-thread,
with 24 complete first/rethrow films matching the pre-worker baseline. Towers
and silent reconstruction retain the shared inline bake. Physical devices and rendering startup remain open. The optional scenery and
[model-parser graphs](redesign/2026-09-13-optional-model-parser.md) now load on
first use, saving 67,256 encoded startup bytes in the recorded local comparison. The [on-demand render
loop](redesign/2026-09-13-idle-render.md) now draws zero settled frames for
Table and all three baked designs on desktop/phone emulation (previously
60 fps), with audio continuing independently and all 24 films unchanged.
No physical-device battery or active-frame-rate claim is made.
The [Battery saver](redesign/2026-09-13-battery-presentation.md) and
[Instant results](redesign/2026-09-13-instant-results.md) preferences are now
implemented independently. Battery keeps baked artwork and responsive 3D dice,
reduces post effects and stops animated rest; Instant completes the same prepared
film without early reveals. Eight composed preference/turn/privacy/fallback
checks pass. Full remains the default; Auto is deferred until measurements can
support an automatic choice instead of guessing a device's capability.

**R2 first composition, 2026-09-13:** [player results](PLAYER-RESULTS.md) now
keep upright names, crests and the group’s latest visible reads together. The
[table design slice](TABLE-COMPOSITIONS.md) adds Copper Lantern, Navigation
Table and Stone Circle, a real setup preview and inspected four-player
desktop/phone views. The [compact arrival experiment](PLAYER-RESULTS.md#rolls-arriving-together)
shows who is rolling, who is next, and waiting players' previously displayed
results. It keeps sequential films and adds no scene-space cost; simultaneous
physical playback is not implemented. Model size now follows shared zoom;
a [round collision envelope](ROUND-TABLE-PHYSICS.md) is now integrated with full
model-support proof and a retained cost record. The subsequent
[camera correction](TABLE-CAMERA.md) keeps all entered dice visible and all
settled painted bounds inside the scene, using geometry rather than outcomes.
Sixty seeded visibility cases pass and all 36 baseline complete films agree.
The inspected close stress view makes an early outward camera movement to keep
that read; its motion and playback-CPU costs are recorded.
[History now reserves the result region](redesign/2026-09-13-history-read/README.md),
including a usable short-window history. Full composed release and physical
device observations remain open.

**R1 durable workflows, 2026-09-13:** optional accounts, explicit private-library
comparison/sync, saved-home capture/retained-version management and People
contacts/invitations/presence now have local durable implementations and
actual-app proofs. Recovery after a real process restart is exercised in a
clean browser. Invitation acceptance preserves the current seat and unfinished
turn; joining the named home is a separate visible action. Contact/location
sharing stays explicit and presence expires. These are local service and
browser proofs; production enablement and human observation remain separate.
The composed success walk and current Help are being completed.

For **R2**, design landmarks, interesting edges, and quiet rolling areas as
one composition. Explore personal crests, dice pouches or trays, readable
names, and each player's latest result as part of that table. Where
perspective lettering fails, keep names/results upright in screen space.
Give the active roll emphasis while the group's other visible results stay
available. Test simultaneous animation or a compact presentation of rolls
arriving together; do not partition play into tiny fenced areas. The phone
composition and one excellent multiplayer table come before the other two
art directions.

For **R3**, Battery saver should have its own attractive presentation:
illustrated or baked surroundings with responsive 3D dice and adaptive
effects. Personal Full / Battery saver choices and optional instant
results serve different devices and preferences without changing shared
values or revealing them early. Idle rendering, static shadows, pixel
ratio, and effects are candidates for measurement; a visually richer table
need not require more real-time scene work.

Additional mechanics, isolated mat textures, towers, and ceremony work move
behind these priorities unless required for correctness or explicitly
reordered by the owner. The Foundry catalogue is already shipped. Existing
open work in ROADMAP remains a backlog, not a competing execution order.

## Evidence and its limits

The source is the local audit at
`tools/out/ux-audit-2026-09-12-extra/AUDIT.md`, against revision `1915bd7`.
Its scripts, reports, CPU profiles, and full screenshot set remain in
`tools/out/ux-audit-2026-09-12-{extra,software}/` (ignored working artifacts,
not guaranteed in a fresh clone). The decision-relevant baseline is retained
here, with two checked-in captures:

- [Desktop dice selection](redesign/2026-09-12-dice-menu.png): a narrow
  dropdown inside Settings → You, with small swatches and much of the
  collection hidden. A normal click on your own name can do nothing;
  renaming is behind right-click or long-press.
- [Fresh four-player phone result](redesign/2026-09-12-phone-result.png):
  at 390 × 844 the compact rail is 112 px wide (29%); expanded tools occupy
  about 315 px (81%). A die is clipped at the bottom. Fresh mobile starts
  compact; resized desktop is not evidence of a different mobile default.
- Fresh users get 18 Soul Deal pools and the Soul Deal interpretation
  system. A general-purpose `2d6+3` roll can consequently present per-die
  interpretations instead of the summed result the visitor expects.
- Table names already reach the browser title. The weakness is the
  generated `Table ABC123` identity and fragmented controls, not absent
  title wiring. Settings did not overflow at 1440 × 900; resizing that
  dialog alone does not solve its organization.
- Local cold-load bodies totalled about 5.08 MB, including a 1.85 MB main
  script. Offline Brotli reduced inspected static JS/CSS from 4.92 MB to
  1.19 MB. These are local uncompressed delivery observations; production
  compression was not inspected.
- With a verified RTX 4090 backend, ordinary sampled rolls were responsive.
  A 40d20 stress sample produced about 1,662 draws/frame and a 200 ms long
  task; a different throw with 4× CPU throttling produced 1,683 draws and a
  1,485 ms long task. Single samples with different throws are neither a
  typical-player benchmark nor a controlled device comparison.

For the original hardware pass, from the repository root:

```sh
CHROME_BIN="$PWD/tools/out/ux-audit-2026-09-12-extra/chrome-gpu" node tools/drive.mjs tools/out/ux-audit-2026-09-12-extra/audit-extra.mjs
```

That command requires the retained local audit artifacts. Before using a
number as a new acceptance threshold, establish a checked-in, seeded probe
with backend, viewport, DPR, workload, repetitions, and command recorded.
The audit was expert inspection, not a usability study; phone layouts were
emulated, not measured on physical phones. Production, lower-end GPUs,
poor networks, long sessions, and battery use remain unmeasured. The planning
pass inspected the two captures above and re-read the relevant code; it did
not rerun the performance experiment or change the application.

## What each investment must prove

**(1):** Without coaching, a newcomer edits their name, chooses dice, rolls
a familiar expression, invites a friend, and both return to the same named
table later. Measure task completion, confusion, and time to first shared
roll. The first release proves the local tasks and guest link; the later
release proves in-app invitations and return after server restart on a
second device. A browser-local recent entry is not that durability proof.

**(2):** Four players on desktop and phone can identify the roller, read
the result, compare everyone's latest visible result, and find the next
roll. Inspect entry, tumble, reveal, rest, and a second player's arrival;
preserve hidden-result projection and open turns. Judge actual seated
compositions before extending the catalogue. Concurrent animation is an
experiment requiring shared-truth and visibility proof, not removal of a
queue in isolation.

**(3):** Compare cold/warm starts, first feedback after Roll, longest UI
pause, frame pacing, and idle work on a midrange laptop and physical phone,
including play alongside voice chat. Separate a four-player ordinary
workload from stress rolls. Worker boundaries and alternate presentation
must preserve authored values, reveals, arithmetic, and the full result
when drama is skipped. Battery claims require battery/device measurements.

All implementation slices use scripted checks and a look at the actual
moment on the target layout, per GOALPOST 8. Use the harness's ephemeral
ports; port 8123 is the owner's live table and is never a test target.

## Scope changes and reconciliation

The owner-approved direction supersedes the old refusal of durable server
state and recoverable accounts. GOALPOST 3–4 now distinguish private account
and home data from equal participation at a live table. Guest access, honest
rolls, per-roll privacy, explicit capture, safe merging, and a static solo
table remain product promises. A table's live roll session can still live
in one process; its saved home must survive that process.

The detailed plan identifies the surfaces and old decisions replaced by
(1). Other design guidance can be changed with its reason recorded. No
provider, paid service, database, or new runtime dependency is selected by
this plan. Those choices need a concrete design and evidence when the
durable slice begins; they do not reopen the approved product direction.

This campaign adds no game-state management, chat, campaign wiki, public
social feed, or purchases. Item (2)'s landmarks and item (3)'s lightweight
art should use the existing authoring pipeline when production assets are
built. No new artwork is commissioned by this planning commit.

## Record maintenance

[ROADMAP → THE ORDER](ROADMAP.md#the-order) points here first. Use `R1`,
`R2`, and `R3` for these investments so old roadmap numbers keep their
meaning; these are not CUJ numbers. Cite the existing journeys from
[CUJS.md](CUJS.md), extending their proofs when the corresponding behavior
ships. Record shipped slices in SHIPPED.md and update the working plan and
UX specification in the same commit. Do not mark this campaign shipped when
only the first local release exists.
