# CUJS.md — the critical user journeys

*Audited and unified 2026-08-08. **This file is the only place a CUJ number
is assigned.** Everything else — ROADMAP, PROFILES, UX, UX-AUDIT, SHIPPED,
commit messages, e2e comments — cites numbers from here and never mints one.*

Read [GOALS.md](GOALS.md) first: it says what the product is and what may
never be traded away. This file says **what people actually come here to
do**, in their own words, and holds each journey to an end-to-end proof.

---

## Why this file exists

The repo had **three** journey-numbering schemes and no owner, and two of
them used the same numbers for different journeys:

| Scheme | Where | What CUJ2 meant there |
| --- | --- | --- |
| "Joe's five" (2026-08-07) | ROADMAP §3b → `L0`–`L4` | *set up a table and get players to join* |
| "The two jobs" (2026-08-06) | PROFILES §1 → gates `G3`/`G5` | *the player arriving with their own pools* |
| "The nine requirements" | PROFILES §11.1 → `R1`–`R9` | (no CUJ2; `R8` is a journey wearing a requirement's number) |

So `CUJ2` named two different journeys in three documents. It had already
gone wrong in practice: **ROADMAP U3** reports *"the prepared seat never
reaches a returning player (CUJ2)"*, which is PROFILES' CUJ2, three sections
from ROADMAP `L1` claiming CUJ2 for itself. UX-AUDIT E1 uses the PROFILES
sense; SHIPPED uses the ROADMAP sense.

The same defect landed one level down in the same week: the profile-library
merge found **both branches had written a `UX.md §7.24`**. One namespace, two
authors, no owner. The fix is the same in both cases — one file assigns, and
the thing that shipped first keeps its number.

**Numbering rule.** Joe's five keep **1–5**: they are the numbers that
shipped, and SHIPPED.md records "CUJs 1–4 run end to end" against them.
Everything the audit found unnamed is added from **6** up. The retired
schemes are mapped at the bottom, not silently dropped.

---

## The journeys

Each is one sentence a player would actually say, an actor, a **done when**
that can be tested, and the scenario that proves it end to end.

### CUJ1 — "I just need to do a dice roll NOW."

*Actor:* anyone, first time, no account, no table, no setup.
**Done when:** the bare URL rolls dice without asking for a name, and does
not put a stranger on someone else's felt.
*Surfaces:* the lobby (UX §7.20), the panel, the felt.
*Proof:* `lobby-no-prompt`, `lobby-exits`, `lobby-no-phantom-table`,
`lobby-suppresses-table-surfaces`.
**SHIPPED** (ROADMAP `L0`, `f1575ac`).

### CUJ2 — "I'm setting up a table and need to get my friends into it."

*Actor:* the person who called the game.
**Done when:** a table exists at an unguessable key, and its link reaches
five other people in one gesture.
*Surfaces:* New table, the nameplate, the invite chair, per-seat chairs.
*Proof:* `new-table`, `invite-chair`, `table-name-survives-round-trip`,
`table-setup-wire`, `setup-repush`.
**SHIPPED** (ROADMAP `L1`, `94f3069`). *Open rung:* QR for in-person night
(zero-dep means hand-rolling an encoder — its own decision).

### CUJ3 — "My friend invited me. I want to join up with them."

*Actor:* the invited player, who may or may not have used the app before.
**Done when:** following the link lands them at the right table under their
own name, having seen enough before joining to know it is the right one.
*Surfaces:* the pre-join peek, the seat picker, `&as=`.
*Proof:* `prepared-seat`, `prepared-seat-chairs`, `prepared-seat-declined`,
`seat-resume`, `room-linger`.
**MOSTLY SHIPPED.** ROADMAP `L2` holds the remaining judgment call: whether
the peek should say how many people are already here.

### CUJ4 — "This game is over. I want another table, or to go home."

*Actor:* a player between games.
**Done when:** leaving is a verb, and the tables they have visited are
listed to go back to.
*Surfaces:* the lobby's recents, `Leave table`.
*Proof:* `leave-to-lobby`, `lobby-exits`.
**SHIPPED** (ROADMAP `L3`, `765b7da`).

### CUJ5 — "We need to split into two groups for a bit, then come back."

*Actor:* a table mid-session.
**Done when:** a child table exists, is listed to the parent's players, and
carries a way back.
*Surfaces:* none yet.
*Proof:* **none.**
**OPEN** — ROADMAP `L4` holds the design. The only journey with no code and
no scenario at all.

### CUJ6 — "Before game night I want to build the characters."

*Actor:* a player with a plan. **Not a role** — goal 10 stands, and every
power this journey uses belongs to every player. What makes someone "the
organizer" is having done this first, nothing else.
*(Was **PROFILES CUJ1**, "the organizer".)*
**Done when:** several named characters exist, each priced against the
system's creation budget, each kept and switchable, and none of them lost by
closing the browser.
*Surfaces:* the profile library (UX §7.25), the rack, the ✎ ledger, shelves.
*Proof:* `profile-library`, `profile-library-reload`, `profile-copy`,
`profile-systems`, `sheet-pass`, `rack-dice-value`, `soul-seed`.
**SHIPPED** (PROFILES §11).

### CUJ7 — "I showed up and was handed my character."

*Actor:* the arriving player, who has never opened the app.
*(Was **PROFILES CUJ2**'s second half, and **`R8`** — "DMs author for
players, who use them at join".)*
**Done when:** they open the link, are offered exactly the characters
prepared for them **by name**, take theirs, and it is a profile of their own
that persists — without typing notation, without an import walkthrough, and
without overwriting anything they already had.
*Surfaces:* the seat picker's profile selector, preview-then-apply, `&as=`.
*Proof:* `profile-dm-prepares` (the whole evening, composed), `profile-join-pick`,
`profile-random`.
**SHIPPED.**

### CUJ8 — "We're playing. I keep rolling things." ⚠️ **NEWLY NAMED**

*Actor:* every player, for the entire session — this is where all the time
goes.
**Done when:** a roll can be composed, thrown, read, kept or cleared, made
secret or shown, repeated, and found again later — without leaving the felt
and without the table becoming chaos.
*Surfaces:* substantially the whole app — the well and the rim, the collapsed
rail, the ceremony, the verdict card, the shelf, the log, the ± popover,
visibility, offers.
*Proof:* ~60 scenarios covering the **parts** (`shared-roll`, `folded-card`,
`collect-peek`, `held-roll`, `draft-offer`, `digit-reach`, `rail-mode`,
`clear-scope`, `reroll-history`, the whole `visibility` tag …) and **none
covering the whole**.
**SHIPPED in pieces, never named.** See gap **A** below — this is the largest
journey in the product and it had no entry in any list, which is why all 30
Tier U findings had to be found by inspection rather than by walking it.

### CUJ9 — "This table plays a different game than the last one."

*Actor:* whoever sets the table's rules; any player, per goal 10.
**Done when:** the interpretation system, felt, dice set and zoom are the
table's, every surface re-reads under the new lens, and a player whose active
profile does not match is told and given a way out rather than silently
mis-read.
*Surfaces:* Settings, the system picker, the profile mismatch banner.
*Proof:* `settings-sync`, `zoom-syncs`, `profile-systems`, `themed-*`,
`pool-set-override`.
**SHIPPED** (the mismatch banner's three exits, PROFILES §11 X1/X9).

### CUJ10 — "I don't want to lose my characters." ⚠️ **NEWLY NAMED**

*Actor:* anyone whose browser is the only copy.
**Done when:** a library can be written to a file they hold, and **restored
from that file** onto a fresh browser.
*Surfaces:* Your data → export/import, the profile file.
*Proof:* `portable`, `file-door`, `profile-file`, `url-carries-nothing`.
**HALF SHIPPED.** The export half works. The restore half does not exist —
see gap **C**. For a system whose durable copy is a file, *restore from that
file* is the one operation it does not offer.

---

## Coverage rule (why a journey needs its own scenario)

**A journey with no end-to-end scenario can pass in every part and fail as a
whole.** This is measured, not theoretical: `prepared-seat` was green for
weeks while CUJ3/CUJ7 were **broken for every returning player**, because the
fixture seeded no name and so only ever tested first-timers (UX-AUDIT E1,
fixed in ROADMAP U3). The parts were all correct. The journey was not.

So: every journey above owns **one composed scenario** that walks it the way
a person does, in addition to the part-scenarios. `profile-dm-prepares` is
the model — one tab authors, another arrives, and the assertion is about what
the second person ends up holding.

---

## Retired numbering — where the old numbers went

| Old | Said | Now |
| --- | --- | --- |
| ROADMAP "Joe's five" 1–5 | table navigation | **CUJ1–CUJ5, unchanged** |
| ROADMAP `L0`–`L4` | the build items for those | unchanged; `Ln` builds `CUJ(n+1)` |
| PROFILES CUJ1 "the organizer" | preparing characters | **CUJ6** |
| PROFILES CUJ2 "the player arriving" | link → right table, own name, own pools | split: the routing half is **CUJ3**, the character half is **CUJ7** |
| PROFILES `R8` | "DMs author for players, who use them at join" | **CUJ7** — it was a journey, not a requirement |
| PROFILES `R1`–`R7`, `R9` | library caps, names, systems, last-used, copy, selector | **stay requirements** of CUJ6/CUJ7, in PROFILES §11.1 |
| PROFILES gates `G1`–`G6` | build order | unchanged; `G3` serves CUJ6, `G5` serves CUJ7 |

---

## Gaps this audit found

Solvable ones are ROADMAP items **C1–C5**. The ones that are Joe's call are
listed after them and are **not** in the roadmap.

**A. No journey owned the session itself.** CUJ8 above. Everything between
"I joined" and "I left" — the whole reason the app exists — was absent from
every list, so no roadmap item was ever sequenced against it and the entire
UX audit had to be conducted by reading code. → **C1**.

**B. CUJ5 has no code and no scenario.** Known (`L4`), listed here so the
zero shows in the same table as everything else.

**C. CUJ10 is one-directional.** Export exists; restore does not. → **C2**.

**D. No journey→scenario map, so journeys fail whole while passing in
parts.** → **C3**.

**E. `R8` was a journey filed as a requirement**, which is why the scenario
that proves the product's headline story is named after a requirement number.
→ folded into **C1**.

**F. Namespace collisions have no owner** — `CUJ2` twice, `UX.md §7.24`
twice, in the same week. → **C4**.

---

## Open questions — Joe's call, deliberately not decided here

1. **Is CUJ8 one journey or four?** It could split into *compose a roll* /
   *read a result* / *keep a table legible* / *decide who sees what*. One
   journey keeps the list honest about where the time goes; four would let
   roadmap items sequence against something narrower. I left it as one and
   flagged it rather than guessing at a decomposition of Joe's own game.
2. **Is there a spectator journey?** Goal 10 says no roles, but held rolls,
   whispers and the GM-screen offer all imply someone who is present and
   *not* rolling. No journey covers "I am at this table to watch."
3. **Is "add a new interpretation system" a CUJ?** Goal 6 promises
   "D&D-style and others addable". If a table owner is ever meant to do that
   without editing `js/meanings.js`, it is a journey with no surfaces at all.
   If it is an engineering concern, this file should say so once.
4. **PROFILES §10 still holds four open questions** (the date, deployed vs
   local, whether a profile carries a felt, whether Apply-to-table renames
   the room) and §11 ten more decisions. They gate CUJ6/CUJ7 refinements and
   are unanswered since 2026-08-06.
