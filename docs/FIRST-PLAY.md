<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Familiar first rolls — R1-C

Implemented 2026-09-13 as the first-play slice of
[People, personal dice, and persistent tables](PEOPLE-DICE-TABLES.md).

New rooms and static solo sessions start with **Numbers only**. A genuinely
new library starts with one empty personal profile. Quick dice supplies
`1d4`, `1d6`, `1d8`, `1d10`, `1d12`, `1d20`, `2d6`, and `d100` as immediate
roll actions in the existing dice workspace. These shortcuts are product
controls, never generated saved pools. They use the ordinary shared roll
request path and preserve any staged expression or unfinished turn. Build dice remains available in the
same space; switching views keeps staged work. The compact phone rail uses
the same shortcuts. The interpretation label stays beside these controls.

**Choose a starter kit** is reachable from the personal menu and saved-roll
management. Soul Deal, D&D, and Everyday rolls display their generated name,
interpretation, and exact roll list before Add. Deal another changes only
the preview. Add creates a new profile through the existing transactional
library writer and leaves the shared interpretation unchanged. The existing
profile/system mismatch controls remain the explicit next choice.

The inherited assumption that recognizable starter pools were disposable is
retired. Existing profiles and legacy racks are preserved, including the old
Attack/Damage/Percentile shape. Library, legacy rack, chosen system, name, and
dice-set keys are exempt from the historical UI schema purge so their
versioned readers can migrate or refuse them safely. The legacy
`meanings.js DEFAULT_SYSTEM` remains Soul Deal for unstamped historical data;
`NEW_TABLE_SYSTEM` separately specifies the new-session default. Joining an
occupied room always adopts that room's authoritative interpretation.

Validation: the existing unit suite passed, plus the new firstplay unit
check. `node tests/e2e/run.mjs --only first-play,schema-reset` passed 4/4.
These cover attributed numeric results, real Quick rolls, no implicit pool
creation, exact preview/add contents, preservation/reload, schema-purge
preservation, occupied Soul Deal rooms, and 390 × 844 quick-control bounds.

The focused follow-up checks `quick-preserves-work` and
`quick-preserves-solo-turn` both passed. They exposed an inherited arrival
sweep that collected an unfinished turn when its owner rolled again. Server
and solo arrivals now share `turnIsOpen` from rollspec.js and leave unfinished
turns standing. The proof preserves a private turn, its kept die choice, a
staged whisper expression, and a public turn visible to a second player; the
original private turn remains rethrowable without exposing it to that peer.
Targeted rollspec (27), turns (26), and places-wire (26) checks passed.
The existing server history cap can still evict a sufficiently old open turn;
that separate long-session limit remains to be redesigned.

Reproduce desktop, four-player phone, and kit-preview captures with
`node tools/drive.mjs tools/steps/first-play-look.mjs`. Captures are working
artifacts under `tools/out/first-play-*.png`. The controls fit and the numeric
result is readable. The four-player phone scene still fails to show the dice
in this captured result; the shared-surface/framing work in R2 remains open.
These are emulated phone captures, not physical-phone observations. This
slice does not complete the R1 destination shell or R2 playing surface.
