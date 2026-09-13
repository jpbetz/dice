<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->
# Shared result seats and playable phone turns

R2 increment, 2026-09-13. The inherited assumption was that a large floating
latest-roll card was the best read. In a multiplayer table it hides other
people's results; on a 390px phone, the push card and odds conceal real dice.

Each present player now has a standing result seat above the actual scene:
a readable name, color crest, total or face reading, counted/struck faces, and
explicit privacy/turn state. The four-player phone layout shows all four seats
in two rows. The strip reserves layout space; it never covers dice. Larger
rooms scroll this bounded strip. A long roll previews six faces plus a count;
opening the seat shows the complete existing outcome/breakdown and actions.
Symbol faces use the same drawn glyphs as the dice, including an outlined blank;
per-die sets follow provenance. A symbolic pool is not summarized as a sum of
its underlying face IDs. Push scoring marks remain visible under Numbers only.

Only locally settled, redacted history feeds these seats. Secret rolls leave
no result or activity change on another viewer's seat. Held results contain no
face reading; the flip and rethrow phases show no incoming values. The rethrow
handoff is explicitly marked before replacing history, preserving the control
region through a final or busted throw until the film actually finishes.

An unfinished own turn has a standing Throw again/Bank row with the current
keep count or push tally. On phones it uses the existing bottom tray, replacing
quick shortcuts while a turn is open; Build a roll and Roll draft remain.
Desktop reserves the row's height below the scene. Complete odds/actions open
in a detail drawer or phone sheet with one Back to table action. A fresh ordinary
roll does not discard the unfinished turn or remove its controls.

The large plain-result banner now yields to the standing seat when that exact
result is represented. Ceremony stages retain their existing escape path.
The phone's former extra camera margin for an overlaid card is removed: framing
still fits the entire occupied region and all dice, independent of face values.
The redundant desktop keyboard hint sits below the result band; phones use the
turn's touch instruction and no overlapping keyboard hint.

People uses this same display projection and opens a working complete result.
Stable action/player keys preserve keyboard focus across roster/result updates;
unchanged Tables/People snapshots do not rebuild their controls.

Validation: `npm run -s test:unit`; targeted `player-results`, `workspaces`,
`symbol-faces`, and `roll-history`. Scenarios cover four-player totals and
struck dice; actual painted mesh vertices during phone flight, settled, and
after a sheet closes; held/revealed symbolic faces; mixed numeric/symbol sets;
secret unfinished turns and kept values through Throw again; final-throw phase
layout; playable old turns after a fresh roll; and the bottom Bank action.

`node tools/drive.mjs tools/steps/player-results-look.mjs` reproduces inspected
1440×900 desktop and 390×844 phone captures in `tools/out/player-results-*`.
The four-player phone reserves y68–244 for results and y618–844 for tools,
leaving a 390×374 scene. The 12-die push capture has every painted vertex inside
that scene, with the push controls below it. These measurements are of mesh
vertices, not world AABB corners. The optional detail capture shows full odds
and keep/bank/clear actions and a single return control.

This completes the persistent result/active-turn layout slice, not all R2.
Table artwork, richer on-surface props, simultaneous roll presentation, and
further 3D phone die enlargement are separate work. The existing table art and
physics placements are unchanged by this slice.
