<!--
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
-->

# Handoff — W3 Hollow Bole (fae venue tower) and the venue arc

> **TAKEN OVER 2026-08-13, and the arc is closed.** Joe's call on §"The
> forge changes everything": re-author through the forge. That decision
> grew into the TOWER_CORE v2 PORTAL CONTRACT (item 7 of the open-work
> list below — promised here, delivered there) and the shell shipped as
> the app's first baked GLB tower after four review-gated rounds. See
> docs/SHIPPED.md "TOWER_CORE v2", docs/TOWER.md "THE PORTAL CONTRACT",
> and ROADMAP W3 for the resolution. Of the open-work list: items 2-4, 6
> and 7 are done (verdict via the rebuild, pours WATCHED in both palettes
> mid-flight, docs reconciled, portals shipped); item 1 (the 8123 restart)
> and item 5 (LISTENING to the clunk voice) still wait on Joe/the main
> session; item 9 stands (no deploy unasked). The hard-won lessons below
> all held — the port-mask/flight-envelope one twice.
>
> **Later the same day:** item 1 CLOSED — Joe restarted 8123 himself
> (07:44, from the main tree, postdating the allowlist commit) and poured
> through the venue live. Item 8's first half landed: **W2 the glade room
> is DONE** (ROADMAP W2 — mist-band horizon, landed moonbeam, re-staged
> moot, the mirror pool, placement-law assertions); W4–W6 remain. Item 5
> is now a two-click audition on the live table and stays Joe's ears.

**Written:** 2026-08-12, main session pausing for compaction/handoff.
**Where the work lives:** main worktree `/home/jpbetz/projects/dice`, branch
`master`. My last commit is `7a02706` ("W3 rebuild, stage 2: the ghost in
every frame, and the tower that was under it"). Commits `c6c8f14..eea181d`
above it are a CONCURRENT session's forge pipeline — not mine, don't claim
or second-guess them, but DO read them (see "The forge changes everything"
below). Working tree was clean at handoff.

## What this arc is

Joe pushed immersion to full fantasy: **venues** — complete stagings
(felt + tower + dice + atmosphere) chosen atomically, split into grounded
vs fantasy registers. Doctrine is in GOALS goals 13–15 (fantasy venue
REPLACES the à-la-carte felt/tower/diceset pickers; atmosphere serves the
roll — fog thins over the resolve area, results readable at ≥2.5:1;
punted: multi-dice-set venues, unbundling, portability). Spec draft:
`docs/FAE-VENUE-SPEC-DRAFT.md`. Roadmap: Tier W (W0 concept plates DONE +
Joe-approved; W1 venue mechanism SHIPPED; W3 tower in flight = this
handoff; W2 glade fidelity light-touch pending; W4 dice / W5 living layer
/ W6 audio not started).

**Directive from Joe, verbatim and still in force:** "You're the director
now. Start with that and take it over the finish line. No short cuts. You
need to solve the dice dropping-in and existing-out… Also integrate the
tree fully... Roots? Moss? Lichen? a edge along the top? Growth on the
rot?" Mid-arc he escalated hard ("You're just gunning for the finish line
and we're going to get garbage out.. LOOK at the pictures") — the bar is
*looks right in the rendered frame*, not *proofs pass*.

## State at handoff

The tower (`hollowbole`, form reference: Joe's photo of a broken hollow
stump — stocky ~2:1, splintered multi-spire crown, front torn open into a
dark hollow, heavy root flare, pale weathered wood) finally renders as ONE
organism as of `7a02706`: waisted mossy trunk, torn dark mouth, ramp onto
the felt, ember door. All proofs green at that commit:

- fit audit: 13 overruns, every one a named legal class (incl. the new
  VENUE GROUNDS class — venueOnly towers may extend backward past the
  socket plane; see towerModelAudit in js/main.js).
- occlusion: 99/99, shaft + cowl occluded at all six shipped eyes.
- pour: 8/8 dice delivered, hidden=0.
- e2e: tower-hollowbole, venue-set, mood-motes green; suite 48/48.

Joe has NOT yet given a verdict on the one-organism frame
(`bole-one-organism.png`, sent at the pause). My own honest read: ~70%.

## Key files (all on master, main worktree)

- `js/towerbole.js` — the organic shell. `buildStumpShell(ctx)`:
  fiber-bundle ridge field (~12 continuous ridges root→spire, one
  identity), rawPoint (mesh) vs surfPoint (clamped, for prop anchors) —
  keep that split, it bit twice. Port mask hw 2.05 = flight envelope, NOT
  the collider gap (cutting the 5.0 collider width tore the trunk's face
  off — the "black rectangle" incident). Interior liner radius−0.16,
  emissive 0.07, capped y 6.5. FrontSide shell + unlit BackSide dark twin
  (DoubleSide catches moonlight through the open crown). Vertex colors:
  wood ramp, moss in valleys, lichen on crests, damp base, wound fringe.
- `js/towerhollow.js` — the seam/scaffolding: `buildHollowBoleSkin(v,
  {shell})` consumes `shell(ctx) → SURFACE descriptor` and adds dressing
  (crown moot, attendants, door, lining tube + black back plane at
  zFI−0.012, veil, stains, contact shadows). zFI semantics = "back of the
  front plane", currently z0−1.2 — this was wrong twice before landing.
- `js/main.js` — VENUES registry {table, moonrise, foxfire},
  venueTowerFor, selectVenue (atomic {venue, tower} patch), TOWERS row
  hollowbole (venueOnly: true → skipped by renderTowerPicker), FAECONCEPT
  preset (pooled moon: lampZ 1.0, angle 0.55 — decay-0 spot floods
  through walls if widened), towerModelAudit VENUE GROUNDS class,
  towerOcclusionCheck `missed` point arrays, setVisibleByName forensics
  hook, MOOD motes (Heartwood-only; Joe's dials peak 0.07 / rMax 12 /
  count 200).
- `js/fae-lab.js` — W0 concept lab. The stump PROP was removed from
  buildFaeConcept (see "the ghost" below); buildStumpShell historic
  export lives on.
- `js/motes.js`, `server.js` (SETTING_SPECS venue + hollowbole in tower
  list), `tests/e2e/scenarios.mjs` (mood-motes reads live dials;
  venue-set asserts tower === venueInfo().venueTower; tower-hollowbole
  mesh bar ≥10).
- Look drivers: `node tools/drive.mjs tools/steps/hollow-look.mjs` →
  shots/hollow-*.png. Also tools/steps/{bole-audit,fae-stump,fae-plates,
  motes-look}.mjs. stage.shot writes extensionless PNGs in tools/out/ —
  copy to .png before SendUserFile or Joe's preview breaks.
- Research: scratchpad fae-research dossiers may be gone post-session;
  the durable rules are in FAE-VENUE-SPEC-DRAFT.md (two glow hues + one
  warm accent, dice brightest, ≤8% bloom, one moon shaft, no gold).

## Hard-won lessons (do not relearn these)

1. **The ghost.** Four rounds of "unfixable" frames were TWO towers
   rendered atop each other — the W0 concept-lab stump prop still planted
   by buildFaeConcept under the real socketed tower. Found by
   setVisibleByName hide-one-at-a-time, not by theorizing. When a frame
   won't cohere: stop theorizing, start hiding.
2. Occlusion probe misses at z0 meant my wall leaned BACK off the sample
   plane; the fix is a FORWARD bulge (cowl r≥2.98). The sign of that term
   was the whole lesson.
3. Stale test constants masquerade as regressions (mote bounds,
   settle-displacement 2e-4 bar). Tests should follow live dials;
   sabotage-check any bar that goes green first try.
4. three.js: emissive is NOT multiplied by vertex colors; bakeVertexAO
   REPLACES the color attribute (exclude the organic shell).
5. Joe's "invisible physics elements" grant: engine volumes stay
   untouched/invisible; the visual body may diverge (that grant + VENUE
   GROUNDS unlocked the stocky silhouette).

## The forge changes everything (read before more inline geometry)

While paused, another session landed `c6c8f14..eea181d`: a **forge
pipeline** — Blender headless bake → GLB, with gates and a preview — plus
a `forge-model` skill (load it via the Skill tool) and
`docs/FORGE-BAKEOFF.md`. CLAUDE.md was amended. The remaining W3 look
problems (rectangular quad notches on the torn lintel, crown tear drama,
mouth fringe) are exactly the class of problem a sculpted bake solves
better than more inline three.js vertex pushing. **Decision for the next
session:** either polish the inline shell or re-author the hollowbole
skin through the forge. Read FORGE-BAKEOFF.md and the skill first; don't
grind the inline mesh further without making that call deliberately.

## Open work, in order

1. **Restart 8123** (main session only — hard rule). server.js gained
   'hollowbole' in the tower allowlist and the live table has NOT been
   restarted since; until then, selecting a fae venue online is rejected
   by the old process. Check first whether a concurrent session already
   restarted it (`curl -s localhost:8123/healthz` or ask Joe).
2. **Get Joe's verdict** on bole-one-organism.png; expect notes on crown
   tear, mouth fringe, moss/lichen taste pass.
3. **Watch a pour** — dice actually falling in and exiting out has NEVER
   been visually verified (Joe named it explicitly). Mid-flight frames
   through the mouth, both palettes (moonrise palette also unreviewed).
4. Look polish loop: mouth torn-edge quality, crown from more angles,
   moot/attendants/door/shelf placement on the rebuilt crown. Consider
   the forge (above) before hand-tuning.
5. Clunk voice (clack/0.55/36 + 4.2ms comb) has never been LISTENED to.
6. Docs: ROADMAP W3 status, UX.md tower entry, TOWER.md VENUE GROUNDS
   documentation, spec graduation from DRAFT.
7. **TOWER_CORE v2 "portals" spec** — promised to Joe (drop-in portal /
   exit portal placeable in any model; entry cheap, exit reopens the
   probe campaign). Record as its own ROADMAP arc.
8. W2 glade fidelity (light touch — "concept fidelity is just fine"),
   then W4 fae dice, W5 living layer, W6 audio.
9. Not deployed since e742a51's era; do not deploy unasked
   (`/usr/bin/make deploy` when he does ask).

## Standing constraints (verbatim ones that bite)

Port 8123 is Joe's live table — never test against it; restart only from
the main session and only when server.js changed. Zero-dep, no build
step, vendor/ never edited. Apache 2.0 header on every first-party file.
Small commits — agents die mid-task. Scripted validation first
(npm test; `node tests/e2e/run.mjs --only <tags>`); interactive browser
only for judging NEW visuals. Concurrent sessions share this tree —
"modified on disk" means a second writer; take a worktree for parallel
agents. Model split ~25% Fable (judgment/verification) / rest Opus.
