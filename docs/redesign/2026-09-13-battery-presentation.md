<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: personal Battery saver presentation

Preferences now offers **Full** and **Battery saver**, saved for this device.
Full is the default. Auto is deliberately omitted: there is no measured,
reliable energy/capability criterion for choosing it automatically. A narrow
viewport, reduced-motion preference or a powerful desktop in phone emulation
is not a battery measurement.

Battery saver retains the baked table model, textured/numbered 3D dice,
ordinary film playback, camera behavior, reveal semantics and audio. It freezes
procedural material/rest/ambient clocks; hides ambient particles and optional
fae life; clears and suppresses impact particles, marks, bloom, rings and
shimmer; and removes animated per-die light contributions. The fixed light
pool remains allocated at zero intensity to avoid recompiling every die
when this preference changes during a throw. Shader arithmetic remains
installed with a fixed time uniform, so this is not an atlas rewrite.

This preference never writes physics bodies, tuning, seeds, authored values,
room settings or library data. Resting cosmetic offsets return to the already
recorded final pose; active playback and reveal transforms retain ownership.
Returning to Full resumes the existing effects. A setting change during an
async scene load is honored by the next real scene paint.

## Actual work measured

The instrumented scene is Copper Lantern with **40 Emberforge Black Anvil
d20s**, physics seed 90090. Both modes use the same original film. The paired
comparison holds the identical active film pose at one second, paints Full,
then paints Battery without advancing film time or changing the 40-die count.
Backend: verified ANGLE / NVIDIA RTX 4090 / OpenGL ES 3.2. Desktop is 1440×900;
phone is 390×844 with mobile/coarse-pointer emulation, both DPR 1.

| Same active picture | Full draws | Battery draws | Full passes | Battery passes |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 1,193 | 1,014 | 8 | 1 |
| Emulated phone | 2,455 | 1,645 | 8 | 1 |

Different camera/frustum and shadow work explains why the layouts have
different draw counts. The comparison is paired within each actual picture.
Separate real-time playback samples also retain one pass in Battery versus
eight in Full. The animated settled scene renders about 91 pictures / 728
passes in 1.5 seconds under Full; Battery renders **zero**, with no animation
frame pending. See the [raw counters and exact stress-film hashes](2026-09-13-battery.json).

These are reduced rendering-work measurements on a desktop GPU. They do not
establish battery lifetime, thermal behavior, physical-phone performance,
lower memory use or a faster solver. The scene's single-pass geometry cost
remains substantial; freezing time does not remove procedural shader code.

## Validation and appearance

Full units pass. Targeted browser checks exercise keyboard selection, device
persistence, a second viewer retaining Full, unchanged shared settings,
identical first and kept-die rethrow films, held redaction and legitimate
reveal, real light intensities and post passes, zero idle clocks/frames, and
Full restoring animated effects. Experimental Moonrise scenery also goes
idle, resumes on Full, and can switch to a later-loaded baked table. Existing
idle, turn FIFO/resync, model-load and local-practice checks pass.

The cross-client film comparison includes every keyframe, sound, rough byte,
landing, nudge, final pose and authored value. The seeded 40d20 benchmark
produces exactly the same complete fingerprint in both modes and layouts.

Inspected actual captures:
[desktop Preferences](2026-09-13-battery-desktop-preferences.png),
[desktop result](2026-09-13-battery-desktop-result.png),
[phone Preferences](2026-09-13-battery-phone-preferences.png), and
[phone result](2026-09-13-battery-phone-result.png). The selector has 44-pixel
minimum targets and uses the existing keyboard radio behavior. Textured dark
dice retain warm, readable digits without bloom, beside the upright result.
The existing circular-artwork/rectangular-physics mismatch remains: a die
can rest beyond Copper's decorative edge. This change does not alter that
shared collision envelope.

```sh
node tools/drive.mjs tools/steps/battery-presentation.mjs
node tests/e2e/run.mjs --only presentation,idle-render,film-turns,dice-practice,table-designs,rest-cadence
```

Use the same verified GPU backend for comparison. Instant result presentation
is the next independent preference; this commit leaves playback timing intact.
