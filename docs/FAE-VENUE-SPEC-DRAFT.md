# THE MOONRISE GLADE — venue spec (W0 draft, for Joe's judgment with the plates)

Authority: GOALS goals 13–15. Sources: fae-research/grammar.md (16 rules,
palette tables, moot stagings), fae-research/techniques.md (the kit, the
traps, repo measurements). This document graduates to docs/ when Joe
approves the concept.

## The place

A night glade. No felt, no table edge, no room — mossy ground ringed by
dark tree masses that dissolve into fog, one moonbeam landing exactly
where dice come to rest (the resolve area is the clearing, and the
clearing is a narrative fact). A vacated faerie moot — an ellipse of
glowing mushroom caps, two dark, one fallen and still lit — sits where
a tower will stand in W3. The dice are the brightest thing in the frame,
always, by construction (grammar rule 2: "the dice are Ori").

## Palette: MOONRISE GLADE (candidate A; Foxfire Hollow is the A/B)

- base: void #090c16 · fog #101728 · deep ground #17203a
- mid (violet-leaning, never nearer than 40° hue to the glow):
  #232f4e ground · #33436c bark/stone · #4a5c86 moon edge
- glow (teal, green-leaning): #3fbfb4 core · #5fdccb cap · #8ff0e2 rim
- accent: #ff9a44 ember/door (= Heartwood's ember — the one warmth)
- The roll verb's gold #d4af37 is FORBIDDEN as a venue colour (rule 15).

## The four Vegas gates (shipped as assertions, not taste)

≤8% of pixels above bloom threshold (hard fail 12%) · ≤2 glow hues + 1
warm accent · three tiers ≥2 stops apart (primary = dice only; secondary
= moot/wisp 0.35–0.6 linear; tertiary field ≤0.25, can never bloom) ·
3–9 countable sources (fields exempt but monochrome).

## Legibility (GOALS goal 15 made mechanical)

- Three dense fog sheets at y 0.12/0.35/0.62 — BELOW every die top face
  (lowest is y 0.68). Fog can never cross a result.
- The high veil (y 3.4) has a baked clearing hole (alpha 0 inside r 7).
- A settled die clears its pocket: lattice brightening within ~2.5 u,
  die face ≥2.5:1 luminance against the fog behind it — e2e-sampled.
- One moonbeam, on the resolve area, no second shaft (rule 12).

## The kit (techniques.md, all existing idioms)

- Fog: 4 subdivided planes, MeshBasicMaterial, itemSize-4 vertex color,
  map.offset drift, CPU emitter lattice (<0.1 ms). fog retreats to
  near 22 / far 60 under the glade preset.
- Moon: a MOOD preset (presets table: grounded room vs glade) — no new rig.
- Dice glow: digit emissive (exists) + dieLights (exists) + ONE merged
  halo-disc mesh (5 slots). Bloom reserved for digits.
- Moot: Staging 2 (vacated ellipse ring, 11 caps, one fallen) at ground;
  emissive bakes + merged glow pools, ZERO new PointLights; mushroom
  fog-light folded into the sheets' base array at build time.
- Wisps: motes.js sibling — box wander, blink envelope power ~6, fog:true,
  ONE lead wisp with the venue's single dynamic light and a heading.
- Traps honored: post.js maskHide patch FIRST (T1); no userData.bloom on
  venue props (T2); floor material swap past fogFar (free perf, §7.4).

## The venue mechanism (W1, built only after plate approval)

- VENUES registry; venue zero = the grounded room (exactly today's table).
- Room setting like `tower`; full-set toggle REPLACES felt/dice/tower
  pickers while a fantasy venue is active (GOALS 13). Per-player dice-set
  choice is overridden by the venue's set while active (the punt, recorded).
- The fae dice set is likely a TENTH house (cold nocturnal light-logic,
  not sunlit Wildwood) — decided at W4.

## The concept plates (this pass)

Lab-gated prototype (js/fae-lab.js behind __diceDebug.faeConcept), four
plates: Moonrise empty · Moonrise with settled glowing dice · Foxfire
empty · Foxfire with dice. Judged by Joe before any production code.

## The tower form (Joe's reference photo, 2026-08-16)

A broken hollow STUMP, not a tall snag: stocky ~2:1 height-to-width over
the full socket width; the whole front torn open into one ragged dark
wound (the tower's mouth — doorway clearance inside its lower lip);
a splintered crown of uneven spires, tallest never centered; heavy
flared buttress roots gripping the ground as the tray surround; pale
barkless weathered wood with vertical fiber striation, bark only in low
patches — then moss sleeves, lichen, punky rot and foxfire shelves ON
that skeleton. Dead in shape, alive in covering. The tiny ember door
sits in a root buttress beside the wound, not on the flat face.
