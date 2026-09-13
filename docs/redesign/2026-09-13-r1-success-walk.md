<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R1 composed success walk — 2026-09-13

The scripted success walk in [People, dice and tables §10](../PEOPLE-DICE-TABLES.md#10-validation-and-the-success-walk)
now connects the local guest experience to recovery, a saved home, and an
offline invitation in one actual-app run. The walk keeps one returning Soul
Deal participant a guest throughout. This is integration evidence, not
newcomer observation or production durability certification.

Base: `7a2cd82` plus the saved-home visible-input correction `75b0a10`.
The only runtime change in this increment assigns the existing `idm-item`
class to the dynamically added Account & private library menu entry. The
entry previously appeared as a browser-default white button among the other
identity-menu rows. Its behavior, permissions and labels do not change.

## The joined sequence

Every user action uses hit-tested pointer input, native text insertion or
keyboard events. No `element.click()` or domain action hook substitutes for
renaming, choosing dice, rolling, saving, account creation/recovery, library
choice, home capture, contact request, invitation acceptance or joining.
Debug hooks read state, advance already-authored playback, and arrange only
the returning player's existing Soul Deal data. The guest link uses the real
browser clipboard; all recipients are isolated local fixture people.

| Step | Joined consequence asserted | Existing CUJs extended |
| --- | --- | --- |
| Fresh guest renames to Sam | Same live seat, empty saved pools remain empty | CUJ1, CUJ2 |
| Search Sea-glass, practice, favorite, Use | Practice adds no shared log entry and does not select; Use changes future dice | CUJ8, CUJ9 |
| Type `2d6+3`, Enter, save Travel check | Native Roll closes the builder; both faces plus the attributed +3 produce the total; saved notation is exact | CUJ1, CUJ8, CUJ13 |
| Name The Copper Lantern and Apply Copper artwork | Same seat and room key; title carries the table name | CUJ2, CUJ12 |
| Copy guest link; Riley takes a seat | Same named table, authored dice set, values, total and Sam attribution | CUJ2, CUJ3, CUJ11 |
| Mira joins with an existing Soul Deal rack | All 18 existing pools, profile IDs, names and systems remain; she can roll without an account | CUJ3, CUJ7, CUJ13 |
| Sam creates recovery, chooses the device library, enables sync | Account creation alone keeps the local library; explicit choice retains the exact library, favorite and default dice; sharing stays empty | CUJ13 |
| Capture and Save the home | Saves the same table address and public setup; Travel check is absent from the public capture | CUJ2, CUJ13 |
| Establish a fixture friendship; close every live page; restart Node | No former organizer remains to repush a saved setup | CUJ4, CUJ13 |
| Clean phone browser recovers Sam | Recovery alone leaves the new browser library intact; choosing the account version restores the exact saved library/default/favorite | CUJ13 |
| Explicit saved-home Join | Restores Copper name/artwork and the same room address from the durable store, with zero old log entries | CUJ3, CUJ4, CUJ12 |
| Send a People invitation while Riley has no open client | The addressed home is the saved Copper home | CUJ2, CUJ3 |
| Riley recovers, opens a private turn, accepts the invitation | URL, seat, values and remaining private turn all remain unchanged; accepting does not enable sync or publication | CUJ3, CUJ10 |
| Riley chooses Join now | Moves only then to the same named saved home | CUJ3, CUJ4 |
| Mira returns as a guest; Sam and Mira roll | Kept Soul Deal content survives again; all three browsers agree on Sam's values, total, appearance and every keyframe double | CUJ8, CUJ11, CUJ13 |

Profile-content preservation compares IDs, names, systems and every saved
pool; it does not pin usage timestamps. Mira's fixture is arranged with the
existing Soul Deal dealer before following the new table's guest link. She
never creates an account or enables sync. Riley creates an account to receive
the durable invitation but never enables library sync. Sam explicitly enables
sync and separately saves the public home.

The final shared roll is compared between two recovered members and the
unchanged guest, after the real process restart. Home restoration asserts an
empty live log: saved homes do not recover old roll history or unfinished
turns. Riley's other-room private turn is deliberately left only by Join now.
The retained [report](2026-09-13-r1-success-walk/report.json) records checkpoint
completion and fixture result values, and contains no recovery/contact keys.

## Account startup boundary

A faster no-capture run exposed a fixture assumption: `netReady` and the
Copper model becoming ready do not mean the optional account module has
finished confirming and adopting the private namespace. The main walk now
waits for that actual namespace boundary before reading the recovered kit.
It does not delay the room or manufacture account readiness.

A second test holds the real `accountui.js` HTTP response across navigation.
The room still accepts a visible `1d6` roll and Save while the guest library is
open. Releasing the module restores the complete prior private document
exactly and leaves the captured guest copy in its separate namespace, with
no publication. Because IDB already held an older guest working version,
the startup-time localStorage capture becomes a retained alternative. After
sign-out, the test opens the visible comparison, uses the keyboard to select
that alternative, and explicitly restores the exact saved roll. No account,
HTTP, cache or identity result is fabricated. The
[boundary report](2026-09-13-r1-success-walk/library-hydration.json) records
these assertions without any credential.

This behavior has a visible limitation: the private kit can appear after the
room is already playable, and a guest capture made during loading may require
the existing kept-version comparison to reopen. This increment proves
preservation; it does not claim immediate account hydration or change the
account startup UI.

## Inspected moments

Desktop 1440×900:

- [Normal name editor and corrected account entry](2026-09-13-r1-success-walk/00-desktop-name-editor.png).
- [Actual local practice die](2026-09-13-r1-success-walk/01-desktop-practice.png), with Practice and Use both reachable.
- [First attributed result](2026-09-13-r1-success-walk/02-desktop-first-result.png).
- [Loaded Copper setup preview](2026-09-13-r1-success-walk/03-desktop-setup-ready.png). The first walk capture occurred during optional preview loading; this separate visible-control capture shows the ready artwork. The retained walk now waits for that state before taking its picture.
- [Explicit library comparison](2026-09-13-r1-success-walk/04-desktop-library-comparison.png) and [saved home beside live play](2026-09-13-r1-success-walk/05-desktop-saved-home.png).

Phone emulation 390×844, configured before the clean browser first navigates:

- [Account-version choice](2026-09-13-r1-success-walk/06-phone-recovery-comparison.png), with the action visible beneath the saved library summary.
- [Recovered home with explicit Join](2026-09-13-r1-success-walk/07-phone-recovered-home.png).
- [Pending invitation](2026-09-13-r1-success-walk/08-phone-incoming-invitation.png) and [accepted invitation while still at the original table](2026-09-13-r1-success-walk/09-phone-accepted-still-at-own-turn.png).
- [Return to a shared table with the guest](2026-09-13-r1-success-walk/10-phone-return-with-guest-results.png), readable result rows and the preserved Travel check shortcut. Document width is 390px.
- [Guest capture during the held library load](2026-09-13-r1-success-walk/11-phone-during-library-load.png) and [explicit comparison of the captured guest alternative](2026-09-13-r1-success-walk/12-phone-loading-capture-comparison.png).
- Separate [390×440 name editor](2026-09-13-r1-success-walk/phone-name-keyboard.png) checks the shortened viewport used to approximate an open software keyboard; it is not a physical keyboard observation.

All of these pictures were inspected. A software-rendered Sea-glass die can
have a bright specular face in the table view; the explicit result row remains
readable. This increment does not retune the authored material or claim that
the 3D face alone is sufficient for the read.

## Reproduction and limits

```sh
npm run test:r1
node tools/drive.mjs tools/steps/r1-success-walk.mjs
node tools/drive.mjs tools/steps/r1-success-walk.mjs menu
node tools/drive.mjs tools/steps/r1-success-walk.mjs preview
node tools/drive.mjs tools/steps/r1-success-walk.mjs hydration
```

Validation: `npm run test:r1` passed both tests (joined walk 238.9s, held
module boundary 8.0s); `node tests/library-session.test.mjs` also passed.
Syntax checks and `git diff --check` passed. The retained screenshot report
comes from the first successful look run; the subsequent no-capture regression
adds the full post-recovery keyframe comparison and explicit namespace wait.
Menu, ready-preview and held-module screenshots are separate focused captures.

`test:r1` is also part of `test:e2e:full`, so the composed seam participates in
the release gate without adding its multiple-browser restart cost to every
smoke run. It reuses `people-app.mjs` for isolated file storage, independent
Chrome profiles, and actual Node stop/restart, plus `visible-input.mjs` for
controls. Each run owns and cleans up its ephemeral ports, store and browsers.
No port 8123, real contact, cloud service, or deployment is touched.

The existing focused checks remain the more detailed proofs for offline
conflicts, recipient isolation, held results, failed persistence, safe home
capture and retries (`account-ui`, `home-ui`, `people-ui`, private-library and
home browser tests). Existing `first-play-kept-library` and
`join-quick-or-explicit-random` additionally cover legacy schema/seed-shaped
libraries and explicit starter-kit addition. Their coverage is not inferred
from this one successful walk. The earlier R2 four-player layout proofs also
remain separate; this walk has three people and two displayed final results.

Outstanding: actual newcomer/returning-player observation, physical phones,
midrange hardware characterization and production provisioning/deployment.
The browser uses the normal SwiftShader harness. No battery-life or hardware
performance claim, global discovery test, or user timing claim is made.
