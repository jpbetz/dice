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

# IMMERSION AUDIT — the detail work vs the industry checklist (2026-08-12)

Joe: "cross check all our detail work so far against industry standards for
building immersive graphical environments." The standard side comes from a
research pass over the canon (Level Design Book, Yang's GDC lighting talks,
Worch & Smith's environmental-storytelling deck, Swink's *Game Feel*, the
juice/camera GDC series, Substance generator docs, WebAudio performance
literature — the full cited taxonomy lives in the research dossiers). The
"ours" column names the shipped mechanism, so this stays auditable.

Verdict shape: **STRONG** (at or above the baseline, sometimes above the
polish bar) · **PARTIAL** (baseline met, named polish gaps) · **GAP** (the
pillar's baseline items are unattempted).

## 1. Lighting — STRONG

Covered: three-point grammar (warm key, warm/dark hemisphere, cool rim —
temperature contrast built in); the industry's single highest-leverage rule
("dim the unimportant") is literally the MOOD rig — room dropped to hemi 0.1,
a lamp pooled over the roll area; MOTIVATED PRACTICALS are the tower family
trait (ember grate, cresset, sconce — each with a registry-declared engine
light, i.e. the fixture visibly IS the source); IBL via the painted-equirect
PMREM environment; the raking tower lantern is textbook focal/rim work on the
subject; disciplined shadow budget (one 2048 map whose frustum tracks the
mat); baked contact shadows ground the towers.

Gaps (all POLISH/SIT): no volumetric fake for the lamp cone (an additive
billboard under the mood lamp is the cheap 80%); no light probes for dice
(hemisphere carries them; fine at our palette); PCF not PCSS.

## 2. Materials & texturing — STRONG

Covered: PBR discipline (MeshStandardMaterial, linear/sRGB kept straight in
the kit, G10); world-scale planarUV = texel density consistency by
construction; the macro/meso/micro hierarchy is deliberately truncated at
micro BECAUSE WE MEASURED the pixel budget (1 texel ≈ 1 screen px — the
industry's "micro is wasted at distance" caveat, quantified); the full
Substance wear stack shipped WITHOUT SHADERS (weatherPass: analytic convex
curvature, AO-as-concave, up-vector dust, per-part drift; grimePass/dustPass
at texel scale; gravityStain for directional streaks) — this is the audit's
strongest materials row; per-tower wear dials judged by the owner's eye;
tiling breakup via part drift + grime patches; decal permanence exists
(felt marks from impacts, DecalField).

Gaps: ROUGHNESS ZONES — the "polished where hands and dice pass" inversion
(tray/jamb burnish, the research's cheapest realism gain) is designed,
unbuilt; the ARRIS RIBBON (chip decals that break long straight edges) is
designed, unbuilt; no roughness mottle band at the 24–40 cycle scale.

## 3. Atmosphere & environmental VFX — PARTIAL

Covered: depth fog as a deliberate stylistic device (the mood rig's horizon
dissolution — the audit's SIT row used correctly); "the world breathes" has
begun: gonfalon and cresset sway on the two-sine idiom, the forge smokes,
the ember light breathes.

Gaps: NO AMBIENT PARTICLES — dust motes drifting in the mood lamp's cone is
the canon's highest-ratio "this air is real" cue and our clearest unbuilt
item. (Constraint to respect: js/particles.js is impact-keyed BY CONTRACT;
motes need the smoke-quad pattern generalized or a contract amendment for an
ambient layer, not a timer bolted onto the impact system.) Ivy and moss are
static; the breathing is confined to the towers.

## 4. Motion & game feel — STRONG (with documented restraint)

Covered: easing everywhere (camEase cubic, CLEAR_STYLES departures, the
peek pivot's 120 ms spring, per-ease duration for the look-down pan);
transition choreography as a design authority (the pour's two acts, cued off
the film; ceremonies staged); permanence (decals, chips, dice that stay);
asymptotic smoothing idioms; the camera rulings (① move only under a quiet
picture, ② the deciding die is never cropped) are exactly the "juice serves
legibility" counterpoint the literature warns most juicers to read.

Gaps (deliberate, revisitable): no hit-stop, no screen shake (a trauma²
table-nudge on heavy landings is the tasteful version if ever wanted); no
squash-and-stretch (dice are rigid bodies; correct).

## 5. Audio — GAP (the thinnest pillar vs standard)

Covered: synthesized material-keyed impact voices (five bodies, per-set);
tower clunk voices = material-pair keying in embryo (die↔tower ≠ die↔felt);
velocity→gain with weight→frequency; the film-time click gate is a real
anti-machine-gun mechanism; per-hit randomized filter frequency.

Gaps — every one a BASELINE row in the canon: no ambient bed/room tone; no
spatialization at all (mono — not even equalpower stereo panning by die
position, the cheap half); no ROLLING/CONTINUOUS contact (our dice are
silent between clacks — the three-phase impact/rolling/settling machine is
missing its middle, and the canon calls this the most audible tell in a
dice app specifically); no reverb send (tower clunks happen "inside" a
resonant box and sound like the same dry room); no distance lowpass; no bus
hierarchy (fine at our voice count; the click gate is our voice cap).

## 6. Post-processing — STRONG BY RESTRAINT

Covered: deliberate ACESFilmic + tuned exposure (the audit's "cheapest win"
was already chosen, not defaulted); bloom exists but is per-mesh selective
and skips whole frames (the disciplined shape); no vignette/grain/CA/motion
blur — all listed taste hazards, all correctly absent; DoF correctly
REFUSED: the miniature-faking research says tilt-shift would make the table
read as a toy, and our believability strategy is the LEGO case ("small
object, real material") — material and light correctness over blur.

Gap worth a look: a subtle color-grade LUT is the one high-ratio absent
item; the mood rig currently does its grading with light, which is arguably
the more honest tool.

## 7. Composition & readability — STRONG

Covered: focal hierarchy (each tower's warm light is its focal anchor —
the research's convergence point, made a family trait); value structure via
the mood rig; saturation reserved for the interactive layer (dice and
heraldry pop against a muted room ≈ the 60-30-10 budget); quiet zones as
contract (the shaft "stays quiet — it is the longest read"); the framing
ladder + the resting eye are authored composition per state; fixed camera
means the contested leading-lines rule resolves in our favor (the tray's
converging lines lead to the doorway).

## 8. Environmental storytelling — STRONG (above the bar)

Covered: the dressing pass ran on the Worch/Smith playbook with research in
hand — hero/filler/micro prop hierarchy, clustering, asymmetry, placement
by weather-logic, and the two story devices the literature ranks highest:
the repair+failure timescale pair (pale plank + sprung shingles; fresh
mortar + broken merlon; unrusted band) and the implied inhabitant (a LIT
cresset means someone lit it tonight; tongs left crooked mean interrupted
work). The family lineup shot is our prop zoo — the auditable QA artifact
the industry names.

## 9. Scale & believability — STRONG

Covered: internal consistency via the TOWER_CORE contract (every dimension
derived from S and towerVolumes); dice are the scene's scale anchors;
real-scale texture tiling; camera height/FOV locked and now owner-tuned;
contact shadows everywhere; the miniature-cue inversion understood and
applied (no tilt-shift; correctness of material and light instead); edge
rounding on every part (the macro-range micro-imperfection that reads).

## 10. Performance as aesthetic enabler — PARTIAL

Covered: InstancedMesh (ivy, chains) and merged statics (stains, smoke,
tool racks) as habit; draw-call costs REPORTED per tower by the dressing
pass; frustum culling default; bakes memoized per page.

Gaps: no `renderer.info.render.calls` assertion in the e2e (the audit's
"turns a budget from a vibe into a failing test" — fits our __diceDebug
pattern exactly); ~~pixel ratio not clamped (worth checking on laptops)~~;
no idle render throttling — and note render-on-demand proper now conflicts
with the breathing world (sway/smoke/ember run every frame by design), so
the applicable version is a reduced idle tick rate, not a stopped loop.

**CORRECTION 2026-08-17 — the pixel-ratio gap was never real.** The clamp is
`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` at
js/main.js:641 and it has been there since the repo's first commit:
`git log -S "setPixelRatio(Math.min" --oneline -- js/main.js` → `2036d59 init`,
nothing else. Struck rather than deleted because the *habit* is the finding:
this row was written from a reading, copied into ROADMAP V4, and read twice
more before anybody ran a grep. The other two gaps stand, and the first now
has its instrument — `__diceDebug.renderAudit()`, which also reports
`pixelRatio` so this claim can be *asserted* instead of remembered
(SHIPPED.md, *V4 (instrument)*).

## 11. Interaction & diegesis — PARTIAL

Covered: camera agency shipped (the peek pivot — hold-drag, spring home);
sub-100 ms feedback (rolls bake fast and start on the gesture); both direct
and indirect paths exist for most acts; some worldspace UI already exists
(the mat's painted text is diegetic by implementation).

Gaps: most state lives in the overlay HUD (results card, log, panels) —
the Fagerholt/Lorentzon matrix says the highest immersion-per-line move is
pushing readouts into the world (a result glow on the felt, a total chalked
on the tray); no hover response on 3D objects (the "everything you can
touch touches back" contract); no player photo mode (dress-look is
dev-only); no drag-to-throw gesture (SIT — the film contract makes it a
real design problem, not a small feature).

## The ranked shortlist (payoff × fit, for when Joe wants the next arc)

1. **Audio phase one** — the pillar-sized gap: equalpower stereo panning by
   die position; a rolling-contact loop (gain from load, rate from speed)
   so dice sound like they tumble, not just land; settle taps; a faint room
   tone; a delay-line "shaft" color on tower clunks. All cheap WebAudio; no
   convolution needed.
2. **Dust motes in the lamplight** — the canonical air-is-real cue; the
   smoke-quad pattern generalized to an ambient layer (respecting the
   impact-keyed particle contract by staying out of it).
3. **Finish the wear dossier** — hand-polish roughness zones on tray/jambs
   and the arris ribbon. Completes "aged" into "aged and handled."
4. **Perf guardrails** — draw-call count asserted in tower-roll; pixel
   ratio clamp; idle tick throttle.
5. **Diegetic nudges** — result echo on the felt near the deciding die;
   hover warmth on dice.
6. **(Taste, someday)** — a trauma²-curve table-nudge on the heaviest
   single-die landing of a roll; a grade LUT.

## What the standards audit says we do that the industry would notice

Determinism as an aesthetic (one seed, one film, every client — replay as a
first-class artifact); measurement culture (the pixel budget, the lime
proof, red-checked assertions, refusal ledgers in every doc); and restraint
in the hazard categories (no CA/grain/DoF/shake) — the audit's taste-hazard
list is empty here, which is rarer than it should be.
