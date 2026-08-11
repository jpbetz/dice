# TOWER_CORE — the tower geometry contract

The engine owns one fixed core geometry; tower models are **occluding skins**
around it. The baked film — entry drop, despawn, hidden transit, clunk times,
exit spawn and trajectory — is a function of TOWER_CORE and the seed only,
NEVER of the model. Swapping skins can never change how a roll plays or
replays. (This is the same cheat the whole table runs on: the server declares
the values, the visuals are theater. The tower interior is simply more film.)

Scale anchors, from `js/dice.js` DIE_DEFS: the largest die is the d20,
circumradius 1.25 → Ø 2.5 bounding sphere. d6 edge 1.35. All units are world
units. **THE CORE SCALE `S = 1.25` (sixth lab look):** every dimension in
this document is a BASE value; the shipped core is base × 1.25. Dice are
fixed world-size, and at base scale the clearances were tight everywhere —
the pour proved it die by die. The slope angle and all clearance arithmetic
are scale-invariant; the tunneling thickness only gets safer. The anchor point is `A = (0, 0, z0)` where `z0 = -TABLE_D / 2` — the
midpoint of the back wall. The anchor moves with the zoom preset; the core's
offsets from it never do. Dice are fixed world size, so the tower is too: on
`close` it reads big, and that is physical honesty, not a bug.

## The six engine-owned volumes

**1. SOCKET — the maximum exterior hull.** Every vertex of a model lives
inside: `x ∈ [-2.6, 2.6]`, `z ∈ [z0 − 4.2, z0 + 0.2]`, `y ∈ [0, 10]`.
The tower's body stands BEHIND the back wall, outside the play volume — it
spends apron, not felt. Nothing crosses `z0 + 0.2` toward the player except
the APRON.

**2. APRON — the delivery slope, and it runs the WHOLE tower floor.**
An engine-owned static box, rotated: the top surface is a 28° slope from
deep inside the tower (`z0 − 3.6` base, under the shaft) down through the
doorway sill `(z0, y 0.8)` to the felt at `z0 + 1.5` — the bottom baffle
IS the exit ramp, so the interior has no flat floor a knocked-back die
could rest on (probe run 9). A flat slick LIP (its own box, ~5° tilt,
0.08 proud of the felt) extends the outrun from the chute base to
`z0 + 3.9`: the die's first flat contact levels it without eating forward
speed, and the tilt drains parked dice — a dead-flat lip was a parking
lot that grew until it latched the door (probe run 5). Both faces are a
28°-family slope
(`atan(0.8/1.5)`), width `x ∈ [-1.9, 1.9]`, and it is a SLICK CHUTE: its
own contact material, friction 0.03, restitution 0.3 — polished slide,
not felt. At felt friction (0.25) dice stalled on the 28° slope (fourth
lab look); wall restitution (0.7) trampolined the first flat-tray cut;
and a step's edge hop read as artificial where a slope lets gravity make
the delivery ("let physics help us out more", third lab look). It also keeps settled dice from rolling under the exit,
and it is thick: 1.0 through its face — tunneling arithmetic, since a die
at hand-throw exit speed covers ~0.33 per 60 Hz step and the 0.3-thin
first ramp let dice pass straight through and vanish underneath (fifth
lab look). Sim steps near the tower run at 120 Hz for the same reason. Models may SKIN
it (a wooden chute, a stone slide) but never alter, extend, or duplicate
its collision. Models add zero colliders, ever; that is what makes a skin
swap replay-safe.

**2b. DOORWAY — the opening in the back wall.** While a tower is socketed,
the back wall is not an unbroken plane: it carries an engine-owned clear
opening centred on `x = 0`, width 3.0, height 3.6 (wall segments flank it).
The exit spawn sits BEHIND the wall plane, and the die flies out through
the doorway — this is what makes emergence read as travel. A model's port
must align with the doorway and may decorate its frame, never narrow it.

**3. MOUTH — the entry.** A clear vertical shaft of aperture ≥ Ø 3.4
centred on `(0, z0 − 1.6)`, rim top edge at `y = 7.0 ± 0.5`. The engine
drops dice through the aim box `|x| ≤ 0.4, |z − (z0 − 1.6)| ≤ 0.4` from
`y = 9`. The entry fall is SCRIPTED — hidden dice have no physics bodies,
and the mouth has no rim colliders — so a model cannot deflect an entry.
Aperture arithmetic: d20 radius 1.25 + aim jitter 0.4 → clear radius 1.65;
Ø 3.4 leaves 0.05 of visual margin. Do not shrink the mouth below Ø 3.4.

**The COWL (added 2026-08-12, first lab look):** the mouth's +z face must be
occluded from `y = 6.2` up to `y ≥ 8.6`. Derived, not styled: the shipped
cameras look in OVER the front rim, and at the `wide` eye the sightline
reaches y ≈ 6.4 inside an open-top shaft — below a d20's top at the despawn
line, so the vanish would be watchable. 8.6 closes the leak at every shipped
eye with margin. A hood, a canted funnel roof, a chimney cap — any shape
works if the +z projection covers that band. Dice remain visible falling
from above the cowl; the despawn happens in its shadow.

**4. OCCLUSION — what a skin must hide, from every shipped camera** (the
steepest is the `close` preset's mini eye; check that one and the rest
follow). (a) The SHAFT: a falling die is fully hidden by `y = 5.8`; despawn
happens at `y = 5.6`. The model is opaque around the shaft from `y = 5.8`
down to the hood. (b) The HOOD: `x ∈ [-1.7, 1.7]`, `y ∈ [0.8, 3.2]`,
`z ∈ [z0, z0 + 0.5]` — the shadowed pocket over the apron where exit spawn
happens. A die materialising inside the hood must not be visible until its
own motion carries it out.

**5. EXIT — the spawn inside, the flight out.** The model leaves the hood's
front face clear: width ≥ 3.0, clear height from apron top (`y = 0.8`) up
to ≥ 3.4, aligned with the DOORWAY. The body first exists at
`P = (x: ±0.6 seeded, y: 2.0, z: z0 − 1.2)` — a full unit INSIDE the tower,
in occluded interior, already tumbling at exit speed. Emergence must read
as TRAVEL through the doorway, never materialisation at the spout (first
lab look; also: y = 1.6 overlapped the apron box at spawn for a d20, and
the penetration resolver's kick read as a launch — y = 2.0 clears it).
Velocity seeded from: speed 14–20 u/s — hand-throw speed (14–22 leaves
the hand on a normal roll); 9–15 stalled on the ramp, 6–11 read as
dribbling — yaw within ±12° of +z (chutes throw straight; ±30°
clipped the door jambs — clearance is radius arithmetic: 0.4 jitter +
tan 12°·0.9 travel + 1.25 d20 radius ≈ 1.84 against the door's 2.0),
pitch PARALLEL TO THE CHUTE: −28° ± 3° (seventh look — horizontal
launches fell ~2 units under g=−110 and arrived nearly vertical at
~20 u/s; the normal impulse plus its friction bite ate the forward
motion in one contact, and the pour jammed at its own doorstep; grazing
the slope, the speed survives). Spawn height is PER-DIE arithmetic
(eighth look — the first version forgot the gravity drop over the
run-up, and dice arrived below the sill, slammed its end-face, and
bounced back into the tower):

    y = sill + 0.15 margin + die radius
        + runup·tan(slope)                          (slope drop)
        + g/2 · (runup / (cos(slope)·speed))²       (gravity drop)

with `speed` this die's own seeded exit speed. One formula clears a d20
and a d4 alike; a fixed height cannot, because the radius and the
speed-dependent gravity term both move the answer by more than the
margin. The die rides the chute and leaves its end at a shallow angle
that skips across the felt — the felt itself is the shared table physics
and is never retuned for the tower.

**The EXIT GUARANTEE (probe runs 1–10):** a die may never rest hidden and
may never be lost. Three layers, each earned by a measured failure:

1. **No mutex — the pile is the mechanism.** Every wait-your-turn scheme
   deadlocked measurably (landing-zone guard: 3/20 out; behind-wall
   guard: pit dice blocking each other's rescue; spawn-sphere guard: a
   propped die 0.18 past the stalled cutoff latching everything). Exits
   never wait: a die whose lane is occupied spawns ABOVE the occupants
   (capped under the lintel) and cascades off the pile, which is exactly
   what a real tower's stream does to its own tray.
2. **The interior cannot hold a die.** The chute runs the whole tower
   floor (§2), so knocked-back dice slide back out by gravity; and a
   WATCHDOG catches the rest — a die LOST (out of bounds, under floor,
   NaN) or STALLED in the skin-occluded zone, slow and old, is RE-QUEUED:
   it stops being a body and re-enters the hidden-transit queue (a
   teleporting rescue deadlocked when its target was occupied; a die
   that does not exist cannot conflict). With a skin on this reads as
   time on a baffle.
3. **The bake is the last backstop.** The lab steps live; the FEATURE
   bakes the pour offline before frame one. A bake that ends with any
   die hidden is discarded and re-baked with a nudged seed — the one
   remaining lab failure class (a heavy-congestion seed leaving one die
   creeping behind the door) is solved by construction in the product.

Measured (probe, 25–45 s windows): 8-die pours CLEAN across seeds;
20-die pours CLEAN or 1-hidden on the worst congestion seed — the class
layer 3 exists to absorb. Everything
after spawn is the normal pipeline — real bounces, displacement
terminator, face correction, tempo curve — untouched.

**6. TRANSIT — the cadence and the sound.** All seeded. Entries POUR at
0.12–0.2 s per die — time-staggered, never height-staggered (equal height
gaps compress to ~50 ms arrival gaps at terminal speed; measured in the
first lab cut, which exited "kinda all at once"; 0.25–0.4 s then read as
too spread — the pour should feel like one motion of the hand). Hidden transit 0.5–1.6 s
per die; exits staggered ≥ 0.2 s apart. 2–4 synthetic baffle clunks per die
at seeded film times,
injected into the same film-time click gate the table already uses. Models
register a SOUND PALETTE (wood / stone / metal — a sample set), never
timings.

## What a model must prove

A tower model is valid iff: (a) it fits the SOCKET; (b) it occludes the
SHAFT and HOOD volumes from the shipped cameras; (c) it leaves the MOUTH
and EXIT apertures clear; (d) it contributes no colliders. Four checks, all
geometric, all testable headlessly against the model's mesh.

## Consequences worth naming

- Because the film never reads the model, tower SKINS are per-viewer
  cosmetic candidates (ruling ② pattern — like the camera, invisible to
  other players). Tower ON/OFF, by contrast, changes the film and is a
  room setting with the queueZoom defer rule (never mid-roll).
- The mouth/shaft sit behind the back wall plane. Scripted entries never
  touch physics, so the wall never sees them; the one body that ever exists
  near the wall is the exit spawn, placed inside it and moving away.
- MAX_DICE_ON_TABLE (40) and every settle/nudge invariant apply unchanged —
  the tower changes where dice enter the felt, not what they do on it.
