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

**Shape.** Thirteen journeys, in the order a person meets them: **1–5** are
rooms (get in, get others in, leave, split), **6–7** are characters (build
them, be handed one), **8–11** are the session itself (roll a thing, keep it
legible, control who sees it, follow along), **12** is the table's rules and
**13** is not losing any of it. The session block is where all the time goes
and it was **entirely absent** from every list before this file: Joe's five
are about rooms, PROFILES' two are about characters, and nobody owned the
evening in between.

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

### CUJ8 — "I want to roll this specific thing." ⚠️ **NEWLY NAMED**

*Actor:* every player, dozens of times an evening. The single most-repeated
act in the product.
**Done when:** an intended roll — dice, modifiers, target, advantage,
keep/drop, a name for what it is — can be composed, thrown, and read, without
leaving the felt and without typing notation unless you want to.
*Surfaces:* the well and the rim, the die palette, the rack and the collapsed
rail, digits, the ± popover, the notation box, the ceremony, the verdict card.
*Proof (parts):* `compose-grammar`, `spent-draft`, `draft-intent`,
`digit-reach`, `rail-multi-pick`, `rail-compose-rules`, `named-verb`,
`preview-honest`, `per-die-read`, `source-read`, `crit-budget`,
`folded-card`, `shared-roll`.
*Proof (composed):* **none** → **C1**.
**SHIPPED in pieces.**

### CUJ9 — "I want the table to stay legible all evening." ⚠️ **NEWLY NAMED**

*Actor:* every player, but the cost lands on whoever is running the game.
**Done when:** thirty rolls into a session you can still see what is on the
felt, find what happened earlier, repeat a roll you liked, and clear what you
are done with — without the table becoming the chaos goal 5 forbids.
*Surfaces:* the shelf, auto-collect, the peek, the log and its flyout, Clear
table, reroll and its provenance.
*Proof (parts):* `collect-peek`, `shelf-quiet`, `shelf-actions`,
`auto-collect`, `shelf-cap`, `tidy-away`, `clear-scope`, `log-flyout`,
`reroll-history`, `reroll-provenance-gate`, `endurance-log`,
`endurance-outline`, `endurance-banner-actions`.
*Proof (composed):* **none** → **C1**.
**SHIPPED in pieces.** This is the journey goal 5 ("organized over
realistic") exists to serve, and ROADMAP **U20** — the shelf ships invisible,
with `title` as its entire information channel — is a hole in the middle of
it.

### CUJ10 — "I want to control who sees this roll." ⚠️ **NEWLY NAMED**

*Actor:* the roller, or the person offering the roll.
**Done when:** a roll can be open, face-down, secret, or whispered to named
players; the choice is legible before you commit to it and after it lands;
and nothing leaks by any path — including the raw wire.
*Surfaces:* the ± popover's Visibility seg, the audience picker, offers, the
reveal verb, the shroud.
*Proof (parts):* the whole `visibility` tag — `held-roll`, `secret-roll`,
`whisper-roll`, `whisper-unknown-audience`, `gm-screen-offer`,
`targeted-offer`, `whisper-offer`, `reveal-authority`, `reveal-mid-playback`,
`raw-sse-leak`, `resync-shrouded`, `fold-visibility`.
*Proof (composed):* **none** → **C1**.
**SHIPPED in pieces.** Serves goal 11 ("secrecy without hierarchy"). The
best-covered journey in the product by part-count, and the one whose failure
mode is worst, which is why `raw-sse-leak` asserts on the wire and not the
DOM.

### CUJ11 — "I'm at this table to follow along, not to roll." ⚠️ **NEWLY NAMED**

*Actor:* someone present and not rolling — waiting a turn, adjudicating
someone else's roll, or watching a held roll they cannot reveal. **Not a
role** (goal 10): the same person rolls two minutes later. It is a *posture*,
and the product has surfaces that only exist for it.
**Done when:** someone who never touches the dice can still follow what
happened — whose roll it was, what it meant, what is still hidden — at their
own reading pace.
*Surfaces:* the result banner as a spectator sees it, the log, the shelf,
teammate pills, the roster, the shroud.
*Proof:* `shared-roll`, `fold-visibility` (the spectator half),
`shared-pools`, `presence`-tagged work.
**PARTLY SHIPPED — and the gap was already found by inspection.** ROADMAP
**U26**: *"the spectator's banner hover-hold silently does nothing —
`armAutoCollect` bails on `!mine`, so the roller's 3 s clock yanks the card a
spectator is reading."* A spectator-journey defect, found by reading code
because no journey named the spectator. That defect is the argument for this
entry; **U26**'s bullet is now this journey's first item.

### CUJ12 — "This table plays a different game than the last one."

*Actor:* whoever sets the table's rules; any player, per goal 10.
**Done when:** the interpretation system, felt, dice set and zoom are the
table's, every surface re-reads under the new lens, and a player whose active
profile does not match is told and given a way out rather than silently
mis-read.
*Surfaces:* Settings, the system picker, the profile mismatch banner.
*Proof:* `settings-sync`, `zoom-syncs`, `profile-systems`, `themed-*`,
`pool-set-override`.
**SHIPPED** (the mismatch banner's three exits, PROFILES §11 X1/X9).

**Adding a NEW interpretation system is not a journey** (ruled 2026-08-08).
Goal 6's "others addable" means the `js/meanings.js` profile interface stays
clean and documented — it is at v3 with six methods — **addable by a
developer, in a commit**. There is no user-facing surface owed for authoring
a chart, and this file says so once so the question stops being reopened.
Goal 12 draws the same line: not a chat, not a character sheet, not a
campaign manager, and not a rules editor.

### CUJ13 — "I don't want to lose my characters." ⚠️ **NEWLY NAMED**

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

**A. No journey owned the session itself.** CUJ8–CUJ11 above. Everything
between "I joined" and "I left" — the whole reason the app exists — was
absent from every list, so no roadmap item was ever sequenced against it and
the entire UX audit had to be conducted by reading code. Split into four on
Joe's call (2026-08-08): one journey covering 60% of the app cannot tell you
what is missing, which is the failure being fixed. → **C1**.

**B. CUJ5 has no code and no scenario.** Known (`L4`), listed here so the
zero shows in the same table as everything else.

**C. CUJ13 is one-directional.** Export exists; restore does not. → **C2**.

**D. No journey→scenario map, so journeys fail whole while passing in
parts.** → **C3**.

**E. `R8` was a journey filed as a requirement**, which is why the scenario
that proves the product's headline story is named after a requirement number.
→ folded into **C1**.

**G. The spectator had no journey, and a spectator defect proves it.** CUJ11
above. ROADMAP U26's *"the spectator's banner hover-hold silently does
nothing"* is a journey gap that had to be found by reading `armAutoCollect`.
Named on Joe's call (2026-08-08); U26's bullet is now CUJ11's first item.

**F. Namespace collisions have no owner** — `CUJ2` twice, `UX.md §7.24`
twice, in the same week. → **C4**.

---

## Decided by Joe, 2026-08-08

1. **CUJ8 is four journeys, not one** — *roll a thing* / *keep it legible* /
   *who sees it* / *follow along* (CUJ8–CUJ11). One journey covering most of
   the app cannot drive gaps, and driving gaps is the point.
2. **The spectator is a journey** (CUJ11) — a *posture*, not a role, since
   the same person rolls two minutes later. Goal 10 is untouched.
3. **Adding an interpretation system is a developer act, not a journey.**
   Goal 6's "addable" means the `js/meanings.js` interface stays clean and
   documented; there is no surface owed for authoring a chart. Recorded in
   CUJ12 so the question stops being reopened.
4. **PROFILES' open questions** get triaged first. **Done** — and the
   count was wrong: §11.9's ten are *decisions taken*, not questions. Of
   §10's four, three are closed (the date is now; deployment is Cloud Run and
   live; §11.9 (4) already says a profile carries no felt). **One is live:**
   whether the organizer's Apply-to-table should also rename the room. One
   ops residual: DEPLOY.md's >60-minute reconnect check is unverified.

## Still open

**One product question**, from the PROFILES triage: *should the organizer's
`Apply to table` also rename the room?* The standing proposal is no — the
file carries `table.name`, and the `?room=` key stays whatever the link says,
because the key is the durable address and the name is cosmetic. Unruled
since 2026-08-06. Everything else conceptual is decided; what remains is the
build work in ROADMAP Tier C.
