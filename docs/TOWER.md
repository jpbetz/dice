# TOWER_CORE — the tower geometry contract

The engine owns one fixed core geometry; tower models are **occluding skins**
around it. The baked film — entry drop, despawn, hidden transit, clunk times,
exit spawn and trajectory — is a function of TOWER_CORE and the seed only,
NEVER of the model. Swapping skins can never change how a roll plays or
replays. (This is the same cheat the whole table runs on: the server declares
the values, the visuals are theater. The tower interior is simply more film.)

Scale anchors, from `js/dice.js` DIE_DEFS: the largest die is the d20,
circumradius 1.25 → Ø 2.5 bounding sphere. d6 edge 1.35. All units are world
units. The anchor point is `A = (0, 0, z0)` where `z0 = -TABLE_D / 2` — the
midpoint of the back wall. The anchor moves with the zoom preset; the core's
offsets from it never do. Dice are fixed world size, so the tower is too: on
`close` it reads big, and that is physical honesty, not a bug.

## The six engine-owned volumes

**1. SOCKET — the maximum exterior hull.** Every vertex of a model lives
inside: `x ∈ [-2.6, 2.6]`, `z ∈ [z0 − 4.2, z0 + 0.2]`, `y ∈ [0, 10]`.
The tower's body stands BEHIND the back wall, outside the play volume — it
spends apron, not felt. Nothing crosses `z0 + 0.2` toward the player except
the APRON.

**2. APRON — the only collider in the play volume.** An engine-owned static
box: `x ∈ [-1.9, 1.9]`, `z ∈ [z0, z0 + 1.1]`, `y ∈ [0, 0.8]`. It exists so
settled dice cannot roll under the exit or through the tower's base, and it
is thick — no tunneling class at felt-level speeds. Models may SKIN it (a
tray lip, a stone step) but never alter, extend, or duplicate its collision.
Models add zero colliders, ever; that is what makes a skin swap replay-safe.

**3. MOUTH — the entry.** A clear vertical shaft of aperture ≥ Ø 3.4
centred on `(0, z0 − 1.6)`, rim top edge at `y = 7.0 ± 0.5`. The engine
drops dice through the aim box `|x| ≤ 0.4, |z − (z0 − 1.6)| ≤ 0.4` from
`y = 9`. The entry fall is SCRIPTED — hidden dice have no physics bodies,
and the mouth has no rim colliders — so a model cannot deflect an entry.
Aperture arithmetic: d20 radius 1.25 + aim jitter 0.4 → clear radius 1.65;
Ø 3.4 leaves 0.05 of visual margin. Do not shrink the mouth below Ø 3.4.

**4. OCCLUSION — what a skin must hide, from every shipped camera** (the
steepest is the `close` preset's mini eye; check that one and the rest
follow). (a) The SHAFT: a falling die is fully hidden by `y = 5.8`; despawn
happens at `y = 5.6`. The model is opaque around the shaft from `y = 5.8`
down to the hood. (b) The HOOD: `x ∈ [-1.7, 1.7]`, `y ∈ [0.8, 3.2]`,
`z ∈ [z0, z0 + 0.5]` — the shadowed pocket over the apron where exit spawn
happens. A die materialising inside the hood must not be visible until its
own motion carries it out.

**5. EXIT — the port and the spray.** The model leaves the hood's front face
clear: width ≥ 3.0, clear height from apron top (`y = 0.8`) up to ≥ 3.4.
Exit spawn is engine-owned and INSIDE the physics walls (hidden dice have no
bodies; a body first exists here): `P = (x: ±0.6 seeded, y: 1.6,
z: z0 + 0.35)`, already tumbling, velocity seeded from: speed 6–11 u/s, yaw
within ±30° of +z, pitch 0° to −10°. Everything after spawn is the normal
pipeline — real bounces, displacement terminator, face correction, tempo
curve — untouched.

**6. TRANSIT — the hidden time and the sound.** Per-die seeded: 0.45–1.1 s
hidden, exits staggered ≥ 80 ms apart so a 20-die pour cascades instead of
machine-gunning. 2–4 synthetic baffle clunks per die at seeded film times,
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
