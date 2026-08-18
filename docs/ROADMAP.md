# Roadmap

Open work only, priority-sorted. Shipped work, killed designs and verified
patterns live in [SHIPPED.md](SHIPPED.md); section numbers are preserved
there so cross-references still resolve.

Sequenced against [GOALS.md](GOALS.md) (the authority). [UX.md](UX.md) holds
component specs; [TESTING.md](TESTING.md) governs how each step is checked.
**What people come here to DO is [CUJS.md](CUJS.md)** — thirteen numbered
journeys, and the only place a CUJ number is assigned. Items below cite them;
none of them mints one.

---

## How this file is sequenced — read this before THE ORDER

**Two tracks run in parallel.** Track A is the debt — correctness, capture,
organization, ops — sequenced by GOALS' ladder. Track B is the owner's track —
venues, towers, dice art, immersion — sequenced by what Joe asks for next and
by *finishing what is in flight*.

**Two batches, 2026-08-15 and 2026-08-16, took nineteen entries off this file**
(record in [SHIPPED.md](SHIPPED.md)). What is left has a different shape:

1. **Track A has no data-loss hole, no ops hole, no accessibility hole, and no
   loose tail.** Restore ships, `/health` ships, the static handler serves the
   app, the seat picker is a real modal, and every item the first batch left
   behind is closed. What remains is one half-built feature, one structural
   bet, and a long design-first tail.
2. **Track B is BUILT and entirely blocked on Joe.** Tier W has no unbuilt
   step. **Seven** LOOK verdicts and **ten** unheard voices stand between it
   and done, plus two judgements no measurement can make. There is now a single
   page that turns all of it into one sitting — `shots/verdicts.html`, **which
   is rendered and then built, in that order**
   ([how](#the-sittings-page-is-rendered-then-built-in-that-order); the frames
   are not taken by the tool that embeds them, and assuming otherwise is what
   put stale frames in front of a verdict once) — which makes the queue the
   cheapest high-value hour in this file and the reason it stays at the top.
3. **The docs go stale in one specific way, and the fix is a COMMAND, not a
   date.** ~20 claims were found false on 08-15 and more since. Two of them
   were written *during those very cleanups* — C27's table turned out to be
   three cells of a different tool's probe grid filed under the wrong heading
   (it never drifted; it was wrong on the day), and C24's correction contained
   a false sentence of its own. **Both came from the same habit: correcting a
   stale claim without re-running the thing it claimed.** So: a number anybody
   will later quote gets the command that reproduces it written beside it.
   `frame-residual.mjs`, `sumread --bench` and `glade-frame.mjs` are the
   pattern; a bare date is not good enough and has now failed twice.

---

## THE ORDER

| # | Item | Why it is here | Size | Track |
| --- | --- | --- | --- | --- |
| 1 | [**Joe's LOOK and LISTEN sitting**](#tier-w--the-first-fantasy-venue-the-fae-set--built-the-look-and-the-listen-are-joes) | **Not a build item, and that is why it is first.** Tier W is finished except for being *seen and heard*; **seven** LOOKs and ten voices gate it (the page's own item list — "five verdicts" was a notch stale), and nothing on Track B advances until they move. One page carries every frame beside the question it answers, and `docs/AUDIO.md` §9 is ten rows of two clicks. **`shots/verdicts.html`, and it is TWO commands, not one** — [see below](#the-sittings-page-is-rendered-then-built-in-that-order): re-render the frames from the tree you are judging, *then* `node tools/verdict-sheet.mjs`, which now REFUSES (exit 1) when a frame predates the code it shows. | ~1 hr of Joe | B |
| ~~2~~ | ~~[**§2l ⑥'s RENDERING**](#2l-pool-analysis--①⑥-all-shipped-the-last-of-them-2026-08-17)~~ **SHIPPED 2026-08-17** | The curve of the total renders in `#pop-preview` on every ± door, plus a target clause in the one-line validator. §2l is now ①–⑥ complete; **it is owed a move to SHIPPED.md**, which this pass did not own. Its two live dependents are #4's sibling (§5's local statistics, now unblocked — `sumForecast(…).mean`/`.sd` are the expected term) and UX §2.1's `showOdds`, still deliberately unbuilt. | — | A |
| ~~3~~ | ~~C22's `room.setup` stamp~~ — **SHIPPED 2026-08-17** ([C22](#c22-a-versioning-contract-for-client-state--shipped-2026-08-15-closed-2026-08-17), UX §7.49 ⑥) | Not ~10 lines and not `maybeRepushTable`: the server **rewrote** the payload field by field, so the stamp needed `server.js` and `js/net.js` too, and the authoring writer is `portablePushToTable`. The three wrong claims are recorded in C22. | small | A |
| ~~4~~ | ~~§5 — roll-log export~~ — **SHIPPED 2026-08-17** ([§5](#5-capture-mechanisms), UX §7.49) | Plain-text transcript, `Copy` + `Download` in a log-flyout foot. `portableDownload()` was in `js/main.js`, not `js/portable.js`; **CSV was refused** and the reason is in UX §7.49 ②. | small | A |
| 5 | [**9d follow-up** — `venue` in the portable YAML](#9d-follow-up-venue-in-the-portable-yaml--tower-shipped-2026-08-17) | **`tower` SHIPPED 2026-08-17** ([UX §7.50](UX.md)) — `TABLE_KEYS` is `{name, felt, system, zoom, tower}` and a prepared table arrives with its tower up. What is left is GOALS' punt: how a **venue** rides the file. Shipping the tower alone exposed that a file can now prepare *half a fae venue*, which is the argument for sequencing this next. | small | A |
| 6 | [**C30 residual** — RUN 2026-08-17, REFUSED](#c30-residual-deadengrip--run-2026-08-17-and-refused-on-the-pile-alone) | **Closed as a build item; no longer sized.** `feltgrip+gate4` was run and passes **five of six gates** — shake −35%, hops −32%, every pool faster, clock 1.01× — and is refused on the pile: +6.3pp at close/6d6, flat throws 33/40 → 23/40, and it reaches the canonical trio. Five of the old row's claims were false; the flip had already moved the baseline. What remains is a **LOOK for Joe** (folded into row 1's sitting), not work. | — | A |
| 7 | [**§3b L2**](#3b-the-lobby-and-the-table-flow--l4-shipped-l2-is-a-judgment-call) | **Decision record written 2026-08-17; recommends NO and needs Joe's yes/no.** The premise was stale: the peek has disclosed the display name of any seated player holding a profile since C17, and the join door renders them under a heading reading "At this table". A count's only new information is a player who published nothing. What the item actually owes is a corrected budget comment in `handleTableInfo` and the assertion that would have caught it. | small | A |
| 8 | [**U16**, **U21**, **C26**](#u16-draft-intent-in-the-well--designed-2026-08-17-ready-to-build) | **All three are DESIGNS now, not stuck items** (2026-08-17) — each was adjudicated, one stale sub-claim struck per item, and each has a smallest-first-commit named. C26's label is killed for good: the name wipe is load-bearing, so the gesture returns as **`Take a prepared seat…`**. U21 carries the one fact the UX audit predates — a player who collapses the rail inside a breakout has **no way back on screen**. | med, now buildable | A |
| ~~9~~ | ~~IDENTITY~~ — **the whole item is CLOSED 2026-08-17** ([IDENTITY.md](IDENTITY.md), UX §7.52) | **Rung 1 shipped**: `dice.who.v1` resumes a *lapsed* seat on the same `playerId`, which was also the fix for two bugs on no roadmap item — a held roll whose reveal died with its tab, and your own secret rolls vanishing from your own log. **B1's server half is killed** with a named defect (enrolment is an open keyword, so the entitlement is self-issued whoever carries it). **Rung 2 is closed by Joe's answer**: a stake that outlives its keeper is a different feature wearing goal 11's words, so a gone browser's held roll stays sweepable-unread by design — IDENTITY §7 is the paragraph to close any report of it with. | — | A |
| 10 | [**T15**](#t15-re-bake-the-three-classic-skins-through-the-forge--large-scoped-2026-08-14) | Owner-commissioned, explicitly not a side quest. **Queued behind #1** — its bar is Joe's eye, and starting three more rounds while seven verdicts are outstanding lengthens the queue instead of clearing it. | large | B |
| 11 | [**§4b**, **V3**, **V5**, **U28b**'s two refused families](#4b-visibility-refinements--all-four-are-design-first-none-is-a-one-line-fix) | The tail, after triage (2026-08-17): **V4's instrument and U28b's rail foot shipped, and V4's pixel-ratio gap was never real on any day**. What is left is NOT small — §4b is four design-first bullets that all re-verified true, V3 is a sixth wear pass plus a LOOK, V5's hover half has no substrate (no pointer→die path exists at all), and both remaining touch families are priced refusals. The one build item left is V4's draw-budget **assertion**, whose contract is written and sabotage-checked. | design-first + 1 scenario | A |
| — | everything else | Design-first, record-only, or deliberately deferred. Named in its tier with the reason. | | |

**Two standing calls that are not build items:** what comes out of beta
([B3](#tier-b--the-closed-beta)) — no criterion exists and none should be
invented before there is a second beta feature to generalise from; and the
"pools and settings" reading, left as name + system + dice set + pools with
sound and chips device-global.

---

## Tier 0 — Performance & foundation

*The 2026-08-05 big pass shipped 20 commits across §0b/0d/0e/0g and killed 31
designs with named defects. Both records are in [SHIPPED.md](SHIPPED.md) —
read the killed list before re-proposing anything in this tier. Bench baseline
is pinned in `.claude/…/memory/perf-baseline.md`.*

### 0a. Roll-arrival Commit C — TWO ATTEMPTS REVERTED, and now DEMOTED

**Re-assessed 2026-08-14: this is no longer "highest priority" and the claim
is withdrawn.** A+B shipped 2026-08-04. Commit C has been attempted twice and
reverted twice (`1fbb2c9` → `e612d25` for face-correction pop + ringIdx race;
the 2026-08-05 six-sub-design attempt killed by three-lens verify). Since
then the whole film changed shape underneath it — the displacement terminator,
`allowSleep false` and the tempo projector (C30e/C31) rewrote when and how a
roll resolves — and **no field complaint has ever named this**. A third
attempt against a two-revert design, on a hazard nobody has reported, on a
film that has moved, is not the next best hour.

**Before a third attempt: re-measure.** If arrival hitching is still real on a
deployed table, the design constraints the second attempt earned still hold
and are worth every line:

- publish `currentRoll` before slicing so every reader sees a consistent
  pointer (fields may populate later, but the object must exist and reads must
  be safe);
- hide dice at spawn under `buildProducerState` for **plain** rolls, not just
  ceremony — `spawnDie` never syncs `mesh.position` to `body.position`, and
  today's flow only gets away with it because the first prime runs before any
  frame renders;
- make `playbackHeld` a first-class per-roll flag with enumerated early-return
  sites (`fastForwardPlayback` reads `currentRoll.duration`, undefined during
  production — the guard just spins and a hidden-tab roll stalls forever);
- audit every `currentRoll` consumer for read-during-hold safety — five sites
  read frames/duration/keyframes/sounds/ringIdx during the hold window;
- ship the `perf-slicing` scenario (direct sync-vs-sliced bit-identity) that
  both reverted attempts skipped.

### 0h. Cache face topology per die type — standing sign-off, medium risk

One of two survivors from seven killed build-time-deferral designs (the rest
are in SHIPPED.md; their common failure was referencing symbols and seams that
do not exist). Ships as a small follow-up when someone re-audits with the
missing seams accounted for. The *concepts* the killed set shared — defer
PMREM, cache face topology, precompute shelf poses — are sound; the designs
were not.

### 0j. Operational going-online (deploy-side)

**`/health` + `GIT_SHA` and the room-creation budget SHIPPED 2026-08-15**
(SHIPPED.md). What is left is one decision and a short list.

**THE DECISION, and it is Joe's: do NOT buy Cloud Armor yet.** The entry above
said "Cloud Armor rate rule, not in-server buckets", and both halves needed
re-deriving:

- §0d's F1 objection — that `req.socket.remoteAddress` collapses behind the
  proxy — **was already stale**. `clientAddr()` has parsed `X-Forwarded-For`
  leftmost for weeks and `handleClientError` already shipped a per-IP limiter
  keyed off it. So an in-server budget went in.
- The **real** objection, which this file never stated, is that Cloud Run
  *appends* to client-supplied XFF, so the leftmost hop is forgeable —
  evadable by rotation, and abusable to spend a victim's budget. That is why
  the shipped rule fails OPEN and is defence in depth, not a boundary.
- Cloud Armor attaches to a **backend service**, so it means a global external
  ALB (~$18–25/mo — the same one DEPLOY.md already refused on cost), plus
  ~$5/mo policy and ~$1/mo/rule, plus replacing the domain mapping, **and the
  `run.app` URL bypasses all of it** unless ingress changes too. Against an
  attack that is not persistent (unprepared rooms die on empty; a streamless
  joiner is reaped in ~60 s), detect-and-respond wins. The free log-based-metric
  alert is written up in DEPLOY.md; running it is a `gcloud` act only Joe can do.

**Nice-to-have:** memory>80% Cloud Monitoring alert, `make logs-tail`,
`X-Robots-Tag: noindex` on HTML, `/admin/rooms` behind a shared secret, a
DEPLOY footnote for "if you leave Cloud Run", and a DEPLOY note that an OOM
restart silently wipes rooms.

**Two small things the C29 pass found and did not own:** `.gcloudignore`'s
comment omits `models/` (which does ship), and `gpu-trace.csv` is tracked at
top level and uploaded to production for no reason.

---

## Tier 1 — Core mechanics completion

### 1. Notation totality closeout — SHIPPED 2026-08-15

**CLOSED, both bullets.** `/api/join` carrying `offers` was already closed
(`joinSnapshot` returns them). The struck-die half shipped: the gate was one
line in the SYSTEM PROFILE, not the renderer. Record in [SHIPPED.md](SHIPPED.md);
the surface is UX §7.43.

### 2b follow-ups (from prior shipped passes)

- **720×480 e2e sweep.** The Pools Rack's small-window pass was never landed;
  dense chip line + dots-only switcher + sticky headers need a headless pin at
  phone-narrow. *(Related and sharper: [C11](#c11-the-seat-picker-on-the-phone-it-is-designed-for--shipped-2026-08-15)
  — the picker's rendered surface is unproven at any width.)*
- **Drag-and-drop staging as an additive affordance** *(Joe 2026-08-03 play
  notes)*: tap-to-stage was hard to discover. Tap stays primary; DnD is the
  intuition players arrive with.

### 2l. Pool analysis — ①–⑥ ALL SHIPPED, the last of them 2026-08-17

**BUILT, all six slices** — and *built* is the honest word, because the LOOK is
still owed (first bullet below). ①–④ 2026-08-06 · ⑤ the ledger sheet
2026-08-15 (UX §7.44) · ⑥'s engine 2026-08-16 (`sumForecast(dice, mods)` in
`js/odds.js`) · ⑥'s rendering 2026-08-17 (UX §7.48).
**Record in [SHIPPED.md](SHIPPED.md)**: what renders, the four findings from
the rendering half (the 22 `#pop-preview` assertions that did NOT break and why
the inference from a live number was wrong · `stageGroup` not having dropped
mods/dc since 2026-08-08 · `renderPopEcho`'s preview path never having branched
on which door opened it · the `sumAtLeast` deep-tail underflow, found by
LOOKING and not by the suite), the three typed refusals and their two
corrections, and the four proofs with the command that reproduces the bench.
Reasoning, data and killed designs: [POOL-ANALYSIS.md](POOL-ANALYSIS.md).

**This heading survives the move because two things are still LIVE:**

- ~~**STILL OWED: the LOOK.**~~ **TAKEN 2026-08-17, and it did NOT go on Joe's
  queue — one of the three questions was a defect.** Every number had been
  verified in the running app while nothing had been seen rendered (the Browser
  pane would not composite), so this bullet asked for an eye.
  `node tools/drive.mjs tools/steps/sumread-look.mjs` shoots one frame per
  question, each on the worst case for it: the touching columns **stay** (judged
  at `40d20dl1`'s 47 cells, where a gutter would be noise and a joined outline
  is what a continuous total means), the flat block **stays** (`1d20+5` fills
  the box, and *"flat — every total 5%"* under it is what keeps the truest frame
  from reading as a broken one), and **the coincident marks were a bug**: on
  `2d6 dc7` the dashed target painted exactly onto the solid average and the
  pair read as ONE mark, so the target vanished on the pool where it is easiest
  to clear. Fixed (`.sf-dc-near`). **`dcAt` was correct throughout** — the hook
  printed the right number while the mark it names was invisible, which is why
  no assertion could have separated the two right answers from the wrong one.
  Full record in UX §7.48 ⑨.
- **§5's local statistics are UNBLOCKED**, and the block was ⑥'s engine rather
  than its rendering: `sumForecast(dice, mods).mean` and `.sd` are the
  *expected* term §5 had no source for. §5's own second blocker is untouched —
  online the client persists no log (`if (!netOnline) save(LS_LOG, log)`), so
  there is no durable substrate for a per-player distribution yet. The item
  itself lives at [§5](#5-capture-mechanisms).
- **UX §2.1's `showOdds` is deliberately UNBUILT.** §2.1 promises *"72% to
  clear 15"* on the intent card, mid-ceremony. ⑥ supplies the arithmetic and
  stops, because two ceremony questions are open and neither is a rendering
  detail (POOL-ANALYSIS §9's last bullet): whether a REFUSED curve leaves the
  promised line blank at a drama beat, and whether a derived number belongs on
  a card whose shipped ruling is that it shows *what was declared*. `showOdds`
  exists in this repo only as a line of UX.md — `grep -rn showOdds js/
  index.html tests/` finds nothing — which is the honest state for a slot that
  is not a half-build.

---

## Tier 2 — Organization (goal 5)

### 3. Table organization & concurrency — SHIPPED / DEAD 2026-08-15

**Table resync shipped**, and three of the four bullets turned out to be dead
post-C25 — the felt holds one roll, so per-roll chips lifetime, per-roll landing
zones and ordered eviction have nothing left to organise. Record in
[SHIPPED.md](SHIPPED.md). *If [§12](#12-per-player-roll-mats) or
[6b](#6b-dice-on-card--bg3-cinematics--the-seated-shelf--decisions-pending) ever
needs landing zones, they are unbuilt — this section is not where that lives.*

### 3b. The lobby and the table flow — L4 SHIPPED, L2 is a judgment call

The journeys this serves are **CUJ1–CUJ5**; `Ln` builds `CUJ(n+1)`. L0, L1 and
L3 shipped 2026-08-07 (detail in SHIPPED.md §3b).

**L2. Arriving (CUJ3) — the judgment call, decided-shaped 2026-08-17.** The
pre-join peek shows the table name and the prepared seats (`GET /api/table`),
and C10's offer banner serves a returning player after the join. The open
question was whether the peek should also say **how many people are here**.

**Recommendation: no. Close L2 as decided-no** — and spend the commit on the
two things that turned out to be actually owed (⑤ below). Nothing here needs
`server.js` to change to *add* a field; what it needs is for `server.js` to
stop claiming something that stopped being true a week after it was written.

#### ① The premise is stale, and this is the finding

The framing above says `handleTableInfo` "deliberately omits the roster… a
privacy decision, not an oversight". That is true of the FIELD and **materially
false about what the endpoint discloses.** C17 (2026-08-09) gave the peek a
second seat source — every seated player's published `library`, each seat
carrying `from`, *which is that player's display name* (server.js
`handleTableInfo`, the `for (const pl of room.players.values())` loop).

**The stale artifact is THIS FILE, not the code — checked, and the first
version of this very finding got it backwards.** It said the budget comment
*"No players, no roster, no log, no offers"* still sat one screen above the
loop and needed correcting. That string is **nowhere in `server.js`**:
`git log -S "No players, no roster" -- server.js` puts its removal in
`a3d4976` on **2026-08-08**, the commit that added the second source, one day
*before* C17 — so the comment was rewritten by the change that invalidated it,
which is the system working. What stands there today is a long note naming both
sources and explaining `from` in as many words (*"whose character this is"*,
and why a copy you did not know you were making is the `#g=` mistake with
better manners). The quotation survived only in the docs that cite it, this one
included.

Measured, not read (`node server.js` on any free port that is **not 8123**,
then `POST /api/join`, `POST /api/pools` with a `library`, then
`GET /api/table?room=…`):

```
A. one player seated, nothing published:   {"system":"soul-deal"}
B. after that same player publishes:        {"system":"soul-deal","seats":[
     {"name":"Wren","pools":1,"system":"dnd","from":"Alice Cooper"}]}
C. plus a second, library-less player:       (unchanged — Bob is invisible)
```

Publishing is not a user act: `/api/pools` carries the whole library with "no
push, no YAML pane, no explicit apply — their library IS the seats", the client
re-shares on every hello, and visibility is "deliberately WIDE for now".

And the client already **renders** it at the door. `renderSeatMine` paints a
group head reading literally **"At this table"** over rows that say
`Alice Cooper · 1 pool`, with the title *"Alice Cooper's 'Wren' — taking it
copies it…"* — before the join, from the peek, because "the peek is the one
pre-join source and it carries `from` for exactly this" (js/main.js ~25590).

**So the peek does not merely leak presence; the join door announces it by
name.** The question is therefore not "open the roster surface or keep it
closed" — it is "what is left over".

#### ② What a count leaks that a name does not

Exactly one thing, and stating it precisely is the whole decision:

> **A count is the first field on this endpoint that describes a player who has
> published nothing.**

Bob, in the probe, did nothing but sit down. `from` is bounded by an act — a
player who published a character is disclosed *by that character*; presence is
**asserted**, which is the rule GOALS holds everywhere else ("presence is
asserted, never inferred"). A count is presence *inferred from occupancy*, and
it answers for the people who asserted nothing. Two consequences follow:

- **A count turns the peek into a feed.** It is unauthenticated, creates no
  room, and changes on every join and leave, so a key-holder can poll it into
  an occupancy time series — when the game started, when it ended, whether
  anyone is there right now — without ever taking a seat. `from` changes only
  when somebody edits a library, which is rare and is a thing they did. Goal 12
  ("not a chat, a character sheet, or a campaign manager") and §3b's own
  standing ruling (*no lobby presence, no summon, nothing chat-shaped*) are
  what a pollable occupancy signal on a forwarded key runs into.
- **The delta is "without joining", and that is all it is.** Anyone with the
  key can walk in and read the roster (goal 10 — no access control, the key is
  the door). So a count breaks no secret; it makes one **cheap to take without
  arriving**. Every argument above is a restatement of that sentence, and the
  owner is really deciding one thing: does standing at the door entitle you to
  the room's occupancy, or does sitting down?

**What it does not leak,** stated so the refusal is not overclaimed: no
identity, no notation, no log, no rolls, nothing a joiner would not see seconds
later. The projection invariant is untouched either way — *redaction is absent
data, never hidden data*, and a count is a new derived field rather than a
masked one. **The invariant is not the blocker.** The stale budget sentence is,
and it is stale in either direction.

#### ③ Bucketing is not a third option

It is a worse version of the count, on three checkable grounds:

1. **The domain is 0–12** (`PROFILES_AT_TABLE`, and the server's own 12). A
   bucket over thirteen values removes almost nothing, and the bit that
   actually leaks is **0-vs-nonzero** — which every bucketing scheme preserves
   by construction, because that is the bit CUJ3 is asking for.
2. **It cannot do the job.** "A few people" cannot be reconciled with "we're
   five", so a joiner cannot use it to catch the wrong-link case, which was the
   entire reason to add a number.
3. **It invents a vocabulary this surface does not have.** Every field on the
   peek is a real value or absent. A bucket is an approximation — hidden data
   in a friendly hat — on the one endpoint whose rule is the opposite.

If a count ships anyway, the honest floor is `present: true` — one boolean, no
cardinality, absent when nobody is there. It is a smaller trespass over the
same line, not a different one, and it still describes Bob.

#### ④ What CUJ3 actually needs — and it is not this

[CUJS.md](CUJS.md) CUJ3 is **done when** *"following the link lands them at the
right table under their own name, having seen enough before joining to know it
is the right one."* The criterion is **recognition**, and recognition is served
twice already: the table's NAME (which is what CUJ2's invite flow exists to
set) and the seat names — including, under a heading that says "At this table",
the names of the people who are there.

The peek's real CUJ3 failure case is a room that is **unnamed and unprepared**:
it answers `{system}` and nothing else. **A count does not fix that** — "3
people are here" does not tell you they are *your* people; a name does. So the
residual CUJ3 weakness is not the peek's budget, it is that an unnamed table is
unrecognizable at the door, and that is CUJ2's surfaces, not this endpoint.

There is also no consumer. Nothing in the client reads the peek except the seat
picker (`seatPeekInfo` → name, system, seats), so a count is not "cheap
plumbing plus a judgment" — it is a judgment plus a new decision about where a
number appears on a join modal. C10 priced this exact option once already, as
its answer (1) (*"a bare integer, no names… discloses strictly less than the
seat names the peek already carries"*), shipped (2)+(3) instead, and recorded
*"(1) … stays unbuilt and unneeded"*. Its `seatsOpen` counted unclaimed SEATS
where L2 counts PEOPLE, so the precedent is directional, not binding.

#### ⑤ The one thing this actually owes, whichever way it is decided

1. ~~**Correct `handleTableInfo`'s budget comment.**~~ **Withdrawn 2026-08-17:
   there is no such comment to correct.** It was removed in `a3d4976` on
   2026-08-08 by the change that added the second source, and what stands there
   now describes both sources and `from` in full. ① has the receipt. Keeping
   this item would have sent somebody to fix a line that was already right —
   which is the same cost as the stale claim it was written to fix.
2. **Assert it.** `prepared-seat`'s peek check loops a leak-list
   (`1d20`, `playerId`, `rev`, `log`, `felt`) and says nothing about presence,
   which is exactly why `from` walked in unremarked. The assertion that would
   have caught it: seat a player who has published NOTHING and assert the peek
   does not mention them.

*(Both land in `server.js` / `tests/e2e/scenarios.mjs`, which this pass did not
own. Neither is a behavior change.)*

**L4. Sub-tables (CUJ5) — SHIPPED 2026-08-15.** UX §7.46,
`POST /api/split`, `tests/subtables.test.mjs`. §13's claim that identity walks
into a breakout for free was **verified true**: `dice.name.v1`,
`dice.groups.v1` and `dice.profiles.v1` carry no room suffix and
`dice.seat.v1:<room>` does. Both open questions were decided and argued in
SHIPPED.md: the child inherits `felt·system·zoom·tower·venue` **as a copy,
never a link**, and refuses the parent's *name*; and the orphan needs no
reaping at all, because **the pointer is a room KEY, not a handle** — following
it walks into a room with that key exactly as any invite link does. What ends
with the parent is its *directory*, which `lingerRoom` clears beside `log` and
`offers`, because a room returning eleven hours later listing dead doors would
be lying.

*The blocker this section named — §0j's room-creation throttle — landed the
same day. A split mints no room: the child is created by the splitter's
ordinary `/api/join` under the same budget, and a split-specific allowance
would be strictly weaker, since joining is never throttled.*

**Two seams recorded rather than hidden:** a *solo* splitter loses their own
directory when the parent dies with them (a split implies someone stays, and
the §G6-shaped heal would be a second writer nobody needs), and the breakout
ghost renders ahead of the unclaimed-seat chairs because that branch returns.

**Joe's three standing rulings, recorded so the review does not re-litigate
them:**

- **No public global tables.** The lobby lists only the tables THIS browser
  has visited — client-side, so goal 7 is untouched and the server never
  publishes a directory of live rooms. This is also what keeps goal 10 honest:
  there is no access control and there never will be, so a *listed* table is a
  *walk-in-able* table. The room key is the door.
- **Sub-tables are public to the top-level table.** The one directory in the
  system is scoped to a parent, in memory on a room the server already holds.
- **URL sharing gets people to the start table — "but make the link sharing
  easy".** With no directory the link is the *only* way in, so it carries CUJ2
  and CUJ3 by itself.

**What does not change:** goal 7 (recents client-side, sub-table directory
in-memory) · goal 9 (the lobby IS the static-hosting table) · goal 10 (no
access control — which is *why* there is no public list) · goal 12 (no lobby
presence, no summon, nothing chat-shaped).

### 3c. Dice on the table before they are rolled — Joe's own "not as urgent"

*"…the ability to put the dice on the table (in a collect area), so that you
can roll them in the future might be useful, but not as urgent."* (2026-08-07)

Recorded so it does not evaporate. **What it composes with:** the draft/tray
is already "dice chosen but not yet thrown", so the question is largely
whether the draft gains a PHYSICAL representation on the felt rather than a
new mechanism; §3's landing zones would have to know about a reserved area
that is not a roll.

**Open before it can be designed:** is the placed set per-player or shared
(goal 10 argues shared, but then two players' set-asides collide on one felt)
· does it survive a reload and a rejoin (the tray does not, and goal 7 says
the server holds no state) · what "roll them" means — does the set-aside carry
a pool identity and modifiers, or is it bare dice, in which case the
attributed-math invariant has nothing to attribute.

---

## Tier 3 — Secrecy refinements (goal 11)

The visibility core shipped. What remains is refinement; nothing here blocks
the ladder.

### 4b. Visibility refinements — ALL FOUR ARE DESIGN-FIRST; none is a one-line fix

**Re-verified against the tree 2026-08-17 and every claim below HELD** — which
is itself the finding, and an unusual one for this file. Two of these bullets
are claims *about today's code* and both are still exactly true; the other two
are unbuilt by decision rather than by neglect. So THE ORDER's "several
one-line" describes V4 and U28b, **not this section** — there is nothing here
an hour can close, and the two that look smallest are the two that touch the
wire.

- **Sticky mode + its badge, as one change.** A remembered per-player default
  (Foundry's roll-mode ergonomic) is only safe alongside a standing eye-slash
  badge on the Roll button and the mini pills — a sticky non-open default with
  no persistent signal is the accident vector §3.2 names. **Ship both or
  neither.** *Verified unbuilt:* `grep -rn "sticky\|eye-slash" js/ css/ index.html`
  finds only CSS `position: sticky` and one mockup helper
  (`docs/mockups/dice-sets.html:771`); the picker is seeded from the notation it
  opened on, and [UX §3.2](UX.md) says so in its own words at docs/UX.md:730
  ("Not sticky, and therefore un-badged"). **Bigger than the tail:** the badge
  half is a persistent signal on the Roll button *and* every mini pill *and*
  every saved-pool row, on the one control whose mistake cannot be undone.
- **Silent whisper.** A whisper whose bystanders learn *nothing*, not even
  that a roll happened. Today every rung but `secret` makes existence public,
  and PF2e's precedent is that roll-existence is itself mechanically
  meaningful. This is a fifth rung, not a tweak: `secret`'s omit-entirely
  projection with `whisper`'s audience. **Bigger than the tail, and
  structurally:** the rungs are an enum on the wire (`VIS_MODES`,
  js/main.js:14607) with a projection branch per rung (`projectEntryFor`,
  server.js:1737) — a fifth rung owes a projection, a picker sub-line, a
  reveal-authority answer, and an answer for every `visMode` reader that
  switches on three names.
- **Reveal to a subset.** Rejected for step 4 because reveal is currently
  total and one-way, which is what makes it auditable. Revisit only with a
  concrete table need.
- **Audience legibility.** A shrouded viewer reads the audience only when the
  roll has no `# comment` — `label` carries one or the other. Decide whether
  "who was whispered to" deserves its own always-present field, or whether
  comment-shadowing is the correct privacy default. *Verified true today:* the
  redacted projection carries `label` (server.js:1757) and deliberately never
  the audience (the comment at server.js:1774 says so), and `label` is
  `res.comment || res.canonical` (js/main.js:15461) — so `1d20 w:Kira` shows a
  bystander the audience and `1d20 w:Kira # Perception` hides it. **This is a
  decision, not a defect:** an always-present audience field is a new wire
  field on the one payload whose whole job is to omit, so it cannot be a
  refinement of the renderer.

---

## Tier 4 — State capture (goal 7)

### 5. Capture mechanisms

- **Roll-log export — SHIPPED 2026-08-17.** `Copy` and `Download` in a new foot
  of the log flyout, writing a plain-text transcript (`js/main.js`
  `logExportSnapshot`, UX §7.49). `portableDownload(text, name, type)` took
  defaults rather than gaining a twin, so there is still one writer to disk.
  **Two corrections to this entry:** `portableDownload()` lives in `js/main.js`,
  not `js/portable.js` (it reads `portableSnapshot`/`portableFilename`, which are
  main.js's); and **CSV was refused, not shipped** — its reader is a spreadsheet,
  what you do in a spreadsheet is the statistics bullet below, and that bullet
  will choose its own columns when §2l's sum read lands. `logExportLine` is one
  function, so a CSV row is a small change against a settled column list. The
  refusal is argued in UX §7.49 ②; reopen it there, not here.
- **Local roll statistics** (per-player distribution, average-vs-expected) —
  the OBSERVED half, and a **dependent of [§2l](#2l-pool-analysis--①⑥-all-shipped-the-last-of-them-2026-08-17)**,
  not its sibling: §2l's engine is the only source of an *expected* value in
  the tree. **That blocker cleared 2026-08-16** — `sumForecast(dice,
  mods).mean` and `.sd` are the expected term. What remains is the second
  blocker, untouched: online the client persists no log at all (`if
  (!netOnline) save(LS_LOG, log)`), so there is no durable substrate for a
  per-player distribution yet.

*The file door, the table file and "persistent identity and saves" left this
tier into Tier G and shipped (SHIPPED.md). The restore half is
[C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--shipped-2026-08-15),
which is #1 in THE ORDER.*

### 5b. Persistence beyond the file — DEFERRED, and the cut is a decision

Both were asked for in the game-night brief and both were cut with reasons.
**Neither is needed:** the table file plus G6's re-push cover it
(PROFILES.md §5).

- **Server-side persistence.** A `DICE_STATE_FILE` snapshot of room setups
  gives real durability *locally* and **nothing on Cloud Run**: the filesystem
  is ephemeral and `--min-instances 0` means the instance goes away between
  sessions. Genuine durability there means GCS or Firestore — a network
  dependency in the request path and an explicit amendment to goal 7. Revisit
  only with a reason the file cannot serve.
- **Google sign-in.** Serves neither CUJ better than the file does. The cost
  is not the button — it is OAuth redirect handling, RS256/JWKS verification,
  **a real per-user server store** (i.e. the goal-7 amendment above), a
  consent surface, and an account concept in an app whose help text currently
  says, correctly, that there are none. Revisit if players actually ask.

---

## Tier 5 — Effects & ceremony polish

### 6. Ceremony refinements

- Roller-held declare phase (§2.4's user-controlled dwell with a commit
  button; the fixed 1.35 s timer stays as the spectator fallback).
- "Always skip roll ceremony" personal setting; crit overlay made skippable;
  Esc joins click/Space as ceremony skip.
- Reveal-beat polish: chip chorus + verdict stagger on the revealed entry.

### 6b. Dice-on-card — BG3 cinematics & the seated shelf — DECISIONS PENDING

*Joe 2026-08-04 · research done, doctrine calls pending.* Two ideas sharing
one technical question: **card cinematics** (BG3 rolls its skill-check die ON
an ornate card — the card is the stage) and **the seated shelf** (collected
dice remaining physically on the table, seated on a card that carries their
identity).

**The research, preserved.** A single WebGL canvas is ONE rectangle in the DOM
stacking order, so HTML sits entirely above or below it, never between two
meshes. Four routes were priced; three lost:

- **(i) The sandwich** — a second `alpha:true` canvas above the panel. Real,
  standard, and wrong here: GL contexts share nothing, so the top canvas
  re-instantiates geometry, themed materials, PMREM env, shader clocks and its
  own post chain, or the dice visibly lose their §9 dress mid-ceremony —
  worst exactly where fidelity matters most.
- **(ii) Fully diegetic panel** — correct depth and lighting, but the panel's
  text becomes pixels: violates the text-layer audit rule. Rejected as the
  general mechanism.
- **(iii) The bakery illusion** — bake THIS roll's dice at settled
  orientation via the diceart bakery seam and place the images IN the HTML
  panel. Perfect compositing, works everywhere including peek and log; cannot
  give tumble-on-card.
- **(iv) IN-SCENE CARD SURFACE, DOM TYPOGRAPHY — the recommended shape for
  both.** The card's SURFACE is a textured plane mesh in the scene (a static
  physics box, so dice really land, bounce and rest on it with true shadows);
  the card's TEXT stays HTML over the canvas, exactly how chips and every
  overlay already work. No second context, no rasterized text, the §9 ladder
  untouched. BG3's look decomposes into: in-scene stage + overlay type + a
  throw aimed at the stage.

**Decisions pending before either ships:**

- **Quiet-chrome tension.** The shipped contract is dot-only markers with the
  peek doing the talking; a standing card per collected roll is louder
  standing chrome. New contract vs. a middle state (card fades in on approach,
  seats the dice always). Doctrine change — Joe's call, not a drive-by.
- **Felt real estate.** Seated cards occupy zones; [§3](#3-table-organization--concurrency--shipped--dead-2026-08-15)
  should land first or together, and eviction must know how to retire a card.
- **Ceremony surface ownership.** Recommendation: keep the HTML cards as the
  type layer (a11y unchanged, aria-live intact), let the plane be pure stage.
- **Effects budget & camera.** A card plane wants shadows and maybe a die-light
  catch — cheap; but if the ceremony camera moves in (BG3 frames tight), felt
  LOD, vignette and post need a pass. Camera choreography is its own decision.
- **Physics honesty.** A card must never trap a die half-on/half-off
  illegibly: zone aim + a low lip, or a settle-nudge, decides this.

*Solo/static parity is free — all of it is client render machinery.*

### 7. Initiative helper

One shared action; everyone's roll collects into a sorted order list visible
to the room until cleared.

### 8. Special dice & success counting

Fate/Fudge dice, coins, d100 paired-read display; success-counting joins the
system-profile registry. Needs dice.js custom face sets.

---

## Tier 6 — Customization & delight

*Most of §9's engineering is closed (SHIPPED.md §9). The dice tower's full
build record — five models, the dressing pass, the portal-floors campaign —
is in SHIPPED.md §9d.*

### 9d follow-up. `venue` in the portable YAML — `tower` SHIPPED 2026-08-17

**`tower` shipped** ([UX §7.50](UX.md)): `TABLE_KEYS` is
`{ name, felt, system, zoom, tower }`, `portableSnapshot` writes the key when a
tower is up, and `portablePushToTable` is the catalogue door. The format judges
SHAPE and the apply site judges the CATALOGUE against `TOWERS` — the tower list
grows, and a hand-mirrored copy in the format would be a fourth home for it
with no drift guard reachable from Node. Three failure modes, all decided and
tested (`node tests/portable.test.mjs` → 96): an id this build cannot raise
parses, rides through `Open → Download` verbatim, and is dropped at the push
and named in the receipt (never sent — `validateSettingsPatch` refuses the
*whole* push for one bad value); `'none'` survives the parse because it is the
only way to lower a raised tower, while the *emitter* stays silent about it
because an older reader refuses an unknown key inside `table:` and every
export would otherwise become unreadable; an absent key is silence.

**`venue` still waits, and it is now the only half left.** GOALS' punt
(2026-08-15) — *how a venue rides the portable YAML and the room settings* —
is untouched. The two were separable: nothing in the tower work needed a venue
key. What shipping `tower` alone exposes is that a file can now prepare **half
a fae venue** (`tower: 'hollowbole'` with no venue), which is a state two
clicks already reach — `selectVenue('table')` sends no tower, so leaving a
venue leaves its tree standing — and which nothing guards. Read that as an
argument for sequencing `venue` next, not as a defect in the tower key.

*Verified 2026-08-14, still true when it was fixed 2026-08-17: `TABLE_KEYS` was
`{ name, felt, system, zoom }`.*

*Known cost, recorded rather than hidden: a 40-die pour is ~25 s of film and
up to five bake attempts (~3 s synchronous). Forty dice through one chute is
forty entries, transits and exits that may not overlap; the bake cost is the
exit guarantee's price and only the largest pool pays it.*

### 9. Dice sets — art direction continues

Creative brief (Joe 2026-08-03): cool-looking dice of different materials and
types, natural AND supernatural — *faerie*, *dryadic*, *wizard*, *warrior*.
Special effects and strong themes **merged subtly into the dice themselves** —
theme lives in material, edge, glow and face treatment, never as noise on top;
the numbers stay readable (GOALS legibility invariant) and the physics /
face-correction machinery is untouched. Small experimental sets to find the
bar; new sets earn their way in. *(Moonmoot Witchlight shipped under W4 and is
the current bar.)*

### 9b. Pool icons

*Joe 2026-08-03.* An icon on a pool's tile where die art stands today. A
default icon set for Your Soul Deal's attributes plus a library players pick
from. Zero-dep: hand-drawn inline SVG sprites, no icon fonts or CDNs. The icon
is pool identity, so it rides everywhere the pool does — tile, draft source
chips, popover identity strip, published racks, the portable YAML
(present-or-absent; unknown icon ids fail closed to die art).

### 9c. Tumbled resin — Tier 3

Subdivide faces, blend toward a superellipsoid for the no-flat-anywhere
pocket-dice look; today's `wear` displacement is a crude version. Constraint:
the dead-flat digit plane (legibility) — face bulge stays subtle or
shading-only, as `pillow` already is.

**Waiting on Joe:** which recipe the standard dice wear. True fillets shipped;
`std` is still the sharp cut because only he can pick. Decide on the lab bench
(`lab.html`): `std` ↕ `round .090` ↕ `round .130`.

**Rejected (record):** normal-map edge rounding (edge bands are deliberately
UV-less; falls apart close-up — inferior to Tier 2 at similar effort) · SDF
raymarched dice (perfect rounding, but a custom-shader universe that forfeits
the three.js lighting/shadow/post pipeline — a rewrite, not a feature).

**Invariant, restated:** all fillet tiers are RENDER ONLY. The physics hull,
face values and read logic stay canonical.

### 10. Custom experience templates

The editor UI for the (currently dormant) `experiences` settings key; until
this ships the key stays server-validated but unconsumed by design.

### 11. Physical pool building — DEMOTED

The §7.1 shelf/felt delight, demoted per goals 3–4: physical interaction is
optional delight, never required toil.

### 12. Per-player roll mats

Visual skin over §3's zone machinery; mat color per-player, visible to all.

### 13. Breakout rooms — SHIPPED 2026-08-15 as §3b L4

Section number kept so cross-references resolve.

---

## Tier C — the CUJ audit's open items

*From [CUJS.md](CUJS.md), the only place a CUJ number is assigned. The audit's
landings — C6–C10, C16–C21, C23, C30–C33 — are in SHIPPED.md.*

### C1 / C3. The composed journey walks — SHIPPED 2026-08-15

Twelve composed walks and a `journey` tag; `--only journey` is a release gate
in [TESTING.md](TESTING.md), with the journey→scenario table and what makes a
walk *composed* rather than merely tagged. `journey-roll-this-thing` is the
shape: **thirteen part-scenarios get dice on the felt via `commandRoll`, which
is the thing CUJ8's done-when forbids** — the walk types nothing and sets dc,
advantage and name with real controls.

Kept as a record because the premise was measured, not argued: `prepared-seat`
was green for weeks while CUJ3/CUJ7 were broken for **every returning player**,
because the fixture seeded no name and so only ever tested first-timers.

**Two things the pass found and could not fix:**

- **`playRoll` does not wipe the felt** (§7.7 retired the overflow wipe), so a
  film is baked against whatever bodies are standing. A stray die left on one
  client's felt made two of three replayed dice bounce off it and turned
  byte-identical poses into a coin flip. Production is safe *because
  auto-collect keeps every client's felt equal* — but that is the mechanism by
  which any future stray-body bug becomes a **cross-client divergence**, and
  nothing asserts the precondition.
- **`record.ranks` caps at 5** (the shelf cap), so CUJ9's "find what happened
  earlier" past five put-away rolls runs through the log and its filter, not
  the record. `journey-legible-evening` asserts both halves; whether five is
  the right number is a design question nobody has asked.

### C2 / C15. Restore a library from the file it was written to — see C15

C2 was the sketch; [C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--shipped-2026-08-15)
is the measured shape and supersedes it. Number kept so links resolve.

### C3. One composed scenario per journey — folded into C1

Section number kept so cross-references resolve.

### C4. One owner per numbering namespace — SHIPPED 2026-08-15

UX.md §7 now carries a NEXT FREE SECTION NUMBER line. It earned itself the same
afternoon: eight parallel passes claimed §7.39–§7.46, four first wrote themselves
as §7.39 and two more independently claimed §7.45.

### C5. CUJ5 has zero code and zero scenarios — SHIPPED 2026-08-15

L4 shipped: `POST /api/split`, the parent pointer, the scoped directory, and the
way back. CUJ5 has code; its scenarios are the open half.

### C11. The seat picker on the phone it is designed for — SHIPPED 2026-08-15

UX §7.39. `#name-panel` scrolls, the picker family is 44px at coarse, `#name-input`
is 16px so iOS stops zooming, and focus waits for `(pointer: fine)`.

### C12. Three smaller arrival gaps — SHIPPED 2026-08-15

UX §7.39. Esc + ✕ out of the picker (dismissing to `null` — you are LOOKING, not
sitting), `Stay as ⟨name⟩` carries the pick and says so, and `⚄ Random` mints only
at join. **Two claims in this entry were wrong** — see SHIPPED.md.

### C13. What a shelf marker owes, past U20 — SHIPPED 2026-08-15

Folded into C25 Stage 2 as designed. Rank renders, waiting-on-you is visible to a
sighted player, and the ring comment that would have stopped the next person is gone.

### C14. Finding and repeating a roll — SHIPPED 2026-08-15

UX §7.42. `Find a roll…`, the at-cap note, `Clear history`'s real scope, and the ≣'s
accessible name written every render.

### C15. Restore: the file this app writes cannot be read back — SHIPPED 2026-08-15

**The data-loss hole is closed.** `Replace my library…`, plus the four defects in the
same journey. UX §7.40, PROFILES §12, `js/profiles.js` `rebuildStore`.

### C22. A versioning contract for client state — SHIPPED 2026-08-15, CLOSED 2026-08-17

`js/schema.js`, one `ver: 'E.M.m'` string on the store, the portable file and the
crash report. **The `room.setup` half shipped 2026-08-17** — UX §7.49 ⑥.
The client mints (`portablePushToTable`), `js/net.js pushTable` pipes,
`server.js handleTable` carries verbatim and never judges, and
`js/main.js adoptRoomSetup` is the one judged reader for hello, join and
`'table-setup'` alike. Pinned by `tests/schema.test.mjs` (22 tests): four source
pins that fail if any link stops stamping, plus a real server proving carry,
present-or-absent and `bad_ver`.

**Three things this entry got wrong, recorded because the shapes recur:**

1. **`maybeRepushTable` is not the writer.** It REPLAYS a record some earlier
   build wrote; the authoring writer is `portablePushToTable`, which is also the
   ONE place `dice.table.v1:<room>` is written. The replay forwards the record's
   own stamp and must never mint one — a stamp naming the build that merely
   stored the bytes is the same lie as one naming the server.
2. **"~10 lines" was wrong because the server rewrote the payload.**
   `handleTable` built `room.setup` field by field (`{rev, table, profiles, at}`),
   so a client stamp was dropped on the way in and could not survive one round
   trip. Closing this needed `server.js` and `js/net.js` as well.
3. **C22's own header excludes the live wire protocol**, so the residual read as
   out of scope on the doc's own terms. It is not: `net.pushTable` destructures
   exactly four fields, so an older build replaying a newer record silently drops
   whatever it does not know **at the same rev, over the room's setup** — the
   whole table's preparation degraded by an act nobody clicked. That argument,
   not the wire, is why the refusal is worth having.

**One defect found while wiring it:** the `'table-setup'` note wrote
"X prepared the table" over the refusal sentence, on a shared pill and through
`announce` — a reassuring lie in the slot holding the only explanation. Fixed in
the same commit.

### C24 → merged into C27. The mat cannot keep shrinking

**C24's measurement stands and is load-bearing; its prescription shipped as
C27.** Kept as a pointer because the *instruction* it carries is still
binding:

**Do not take another notch off the mat.** Measured 2026-08-09 after three
tightenings and one refused fourth — dice at rest counted above y=1.2:

| mat | 6d6 | 12d6 | 20d6 | 40d6 | max height |
| --- | --- | --- | --- | --- | --- |
| 8.6×5.2 | 1 | 2 | 9/20 | 27/40 | 4.7 |
| 6.7×4.1 | 2 | 5 | 15/20 | 32/40 | 6.3 |
| 5.2×3.2 *(a fourth notch, refused)* | 3 | 10/12 | 17/20 | 32/40 | **9.0** |

**THE PRESET NAMES were struck here on 2026-08-14 and that was HALF RIGHT and
half an over-correction — re-measured 2026-08-17** with
`node tools/drive.mjs tools/steps/frame-residual.mjs --pile`:

| mat | 6d6 | 12d6 | 20d6 | 40d6 | max height |
| --- | --- | --- | --- | --- | --- |
| `wide` 14.1×8.6 | 0 | 0 [0..1] | 2 [1..4] | 13 [12..15] | 3.3 |
| `medium` 11×6.7 | 0 | 3 [1..3] | 4 [1..4] | 20 [18..21] | 4.4 |
| `close` 8.6×5.2 | 0 [0..1] | 3 [1..3] | **9 [9..10]** | **28 [27..29]** | 5.3 |

- **Today's `close` IS the 8.6×5.2 row — identical, not larger** — so the
  2026-08-14 amendment's second sentence ("every mat now in the app is larger
  than the two it measured") was **false**, and "do not quote a preset name out
  of this table" over-corrected. That row is quotable as `close`, and it
  **re-measures true** a week and a whole settle campaign later: 20d6 `9/20`
  then and `9 [9..10]` now, 40d6 `27/40` then and `28 [27..29]` now.
- **Only the two mats that never shipped stay unquotable** — 6.7×4.1 and the
  refused 5.2×3.2.
- **The original table had no row for the two mats most players are on.**
  `wide` and `medium` were never in it. They are above.
- **The instruction is confirmed live rather than merely archived:** 40d6
  piling goes 13 → 20 → 28 and max height 3.3 → 4.4 → 5.3 down the shipped
  ladder. A fourth notch still breaks goal 5 and goal 1. **The mat is the
  PHYSICS WALLS** — identical on every client, because a seeded roll replayed
  against different walls lands differently — so it cannot vary by device and
  must hold the largest pool anyone rolls. `dice-land-flat` is the pin.

*Two documentation errors on the same table in three days, both from the same
habit: correcting a stale claim without re-running the thing it claimed.
`tools/steps/pile.mjs`'s own header carries the third instance — it says "at
`medium` … `TABLE_W` is 8.6", which is `close`.*

### C25. The physical shelf does not fit the mat any more — SHIPPED 2026-08-15

**Stage 2 shipped.** UX §7.42, and it absorbed U20 and C13 as designed. Joe's literal
felt strip was **refused with arithmetic** — five panels across a 390px phone is 78px
each, which is C24's smudge applied to UI — and `rec-phone-open.png` +
`rec-five-open.png` are the pair that let him overrule that in one look.

### C26. `Change seat…` — DECIDED 2026-08-17: the label never returns; the gesture does

**Re-verified 2026-08-17:** hidden unconditionally (js/main.js:24522,
`touch-doors` pins it); the handler is `leaveTable()` — `forgetSeat` +
**`localStorage.removeItem(LS_NAME)`** + re-enter `initNet()`
(js/main.js:24647-24671); the label still reads `Change seat…`
(index.html:522). The stuck reason survived contact and **sharpened**: the
name deletion is not incidental, it is *load-bearing* — a stored name skips
the door (U3's gate), so wiping the name is the only way the verb can force
the seat picker open. The whole mechanism is amnesia used as navigation:
per-join identity means the round trip also mints a new `playerId`, quietly
orphaning reveal/Done authority on every roll you had out
([docs/IDENTITY.md](IDENTITY.md) §3). Every journey the label suggests
already has a lossless verb — a new name is `Change name…`, a different
character is `Profile…`, a different table is `Leave table` — so the
re-labelled button has no journey left except "reopen the door", which it
performs by burning the furniture.

**The decision.** ① The label `Change seat…` is retired permanently; the
hidden button and `leaveTable()` stay exactly as they are, as the scripted
door to a `netOnline === false` state — tests-only, forever, and "un-hiding
is one boolean" stops being the plan. ② The gesture that returns is the
one PROFILES made real: **taking one of this table's free prepared seats
while already seated** — name + character in one move, on the SAME seat.

**The words (the whole point of a design-first item):** identity-menu item
**`Take a prepared seat…`**, between `Profile…` and `Leave table`. Present
only when `unclaimedSeats()` is non-empty — absent otherwise, never
disabled (the `idm-split` grammar: an item that can only refuse is worse
than no item). `title="Sit as one of this table's free prepared seats —
your name here becomes the seat's; your dice, rolls and profiles stay
yours."` Each row: the seat's name with its pool count, the same read the
door's picker gives.

**The mechanism reuses two shipped pieces and adds none:** the item opens
`openRailMenu` (the anchored-menu machinery the chip already uses) listing
`unclaimedSeats()`; picking a row runs the door's own preview-then-apply
(`seatPlan` / seat-apply — the character is a rack you RECEIVE, so §9.2's
preview rule binds); **Apply = `applyRename(seatName)` + the previewed
profile apply, `playerId` untouched.** No leave, no rejoin, nothing wiped,
nothing written before Apply. The chairs row heals itself by construction:
your old name frees its chair, the taken seat's chair retires
(`unclaimedSeats` recomputes on `player-renamed`).

**Smallest first commit:** the conditional menu item + rail menu + rename-
plus-preview apply path, with one scenario: seated player takes a free
prepared seat, asserts the roster shows the new name, the rack previews
before it lands, and `net.playerId` is unchanged across the whole gesture.
It must NOT: call `leaveTable()`, touch the connection or seat storage,
write anything before Apply, offer OCCUPIED seats (the roster filter is the
physical intuition — you cannot sit in Bob's chair while Bob is in it), or
appear at a table with no prepared seats.

### C27. The framing target was never the dice — **SHIPPED ON 2026-08-18**

Joe's answer on the `v-crop` frames was **"turn preferDice on"**, and it is the
shipped default. `FRAMING.preferDice` is `true`: rung 1 stopped being a
terminator, and where the mat fits the camera now frames the **dice** instead —
kept only when it loses no die and makes them at least `gain` (1.15×) bigger.
Record, the re-measured grid, the corrections and the four things this entry got
wrong are in [SHIPPED.md](SHIPPED.md); the surface spec is **UX §7.55**.

**The headline, re-run on the tree that shipped it** (2026-08-18, medians over
5 seeds a cell): iPad-portrait **119 → 351 px** at 1d20 and **119 → 199** at
3d6; desktop **200 → 246** at 1d20; a phone gains **nothing at the median** and
40d6 is **unchanged at every width**. Over 90 paired throws: **0 shrank, 0 lost
a die, 30 fired.**

**"IT IS A LOSS AT 40d6" IS STRUCTURALLY IMPOSSIBLE AND WAS NEVER TRUE.** The
gain gate returns rung 1's own span or a bigger one and nothing else, so the
big-pool carve-out is already in the code, is derived from the cluster on the
felt, and needs no die-count constant. The archived `200 → 184` was
`framingProbe()`'s UNGATED scan — the number the gate exists to throw away.

**The one instruction that outlives this entry, because it is what two days
were lost to:** a number anybody will later quote gets the command that
reproduces it, not a date.

```
node tools/drive.mjs tools/steps/frame-residual.mjs [--verbose]   # the numbers
node tools/drive.mjs tools/steps/frame-look.mjs                   # the pictures
```

**C24's instruction is NOT closed by this and still binds: do not take another
notch off the mat.** `frame-residual.mjs --pile` re-asks its dice-above-the-plane
measurement of the presets that actually ship, so the instruction has a live
number under it.

**Still open, and small.** ① `FRAMING.floor` — letting the eye come *closer*
than the zoom preset — stays at 1. Nobody asked about it, and the 2.95× tablet
win did not need it; it is the only dial C27 leaves unspent. ② The **rail** is
still the phone's real lever (a 390px phone gives the felt 278px), and the two
do not compose: a full-width felt makes the mat *fit*, which sends the frame
back to rung 1 and makes dice **smaller** (85 → 66). ③ Quarter-turning a
**desktop** is now reachable (5 of 30 throws, always for a bigger frame, never
for a lost die) — Joe's approved frame `v-crop-desktop-3d6-on.png` is one of
them, so it is inside the call rather than a side effect of it, but it has been
looked at exactly once and only at 3d6.

### C28. Two more things the zoom ladder left behind — SHIPPED 2026-08-15

Both. The spawn clamp asked the wrong axis and **16 of 144 throws started a die
through the z-wall**; the deferred room change now flushes on the predicate, because
there were **four** release paths, not the two named. Two of this entry's claims were
wrong — see SHIPPED.md.

### C29. The static handler serves the repo, not the app — SHIPPED 2026-08-15

Allowlist of roots. **This entry's "no credential or config exposure, verified path by
path" was false in two ways** and one of them was serving `deploy/config.mk` with the
billing account in it to any local reader — see SHIPPED.md.

### C30 residual. Deaden+grip — RUN 2026-08-17, and REFUSED on the pile alone

*The settle campaign shipped (C30e's displacement terminator + `allowSleep
false` + the tempo curve + `pileScale`, 2026-08-11). Full five-pass record in
SHIPPED.md.* The residual rung has now been run. **It is the best physics
candidate ever measured on this table — five of six gates pass — and it is
refused, because the sixth is the pile and the pile got worse, not better.**

**The one command that reproduces every number below** (16 shake seeds, 40
pile seeds; the two counts are separate arguments and no row mixes them):

```
node tools/drive.mjs tools/steps/settle-matrix.mjs 16 40 feltgrip+gate4,deaden+gate4
```

`feltgrip+gate4` **is** the pairing this entry asked for: `GRIP` (floor
friction 0.6 / dice 0.4 / wall 0.2) + `DEADEN` (floor restitution 0.15 / dice
0.2 / wall 0.5) + the speed-gated damping. Per-gate, against the same run's
`shipped` row:

| gate | bar | `feltgrip+gate4` | `deaden+gate4` |
| --- | --- | --- | --- |
| a shake | ≥20% mean cut | **PASS −35%** (−30 to −43 per pool) | PASS −34% |
| b dur | no pool over +5% | **PASS −2%** worst; every pool faster | fail **+19%** (4d6) |
| c caps | ≤ shipped, 20d6 ≤1 | **PASS 0/1**, 20d6 0 | PASS 0/1 |
| d pile | every cell ≤+2pp, flat ≥ | **fail +6.3pp, flat 33/40 → 23/40** | fail +6.3pp |
| e clock | ≤1.5× | **PASS 1.01×** | PASS 1.10× |
| f rest | forward: disp<eps, loose 0 | **PASS 0.019988 < 0.02, loose 0** | PASS 0.019994 |

Hops, the meter that states Joe's complaint literally, run **−14% to −32%**.

**FIVE OF THIS ENTRY'S OWN CLAIMS WERE FALSE, and four were false because the
2026-08-11 flip moved the baseline they were measured against.**

1. **"Four of six gates fail."** Two do, for `deaden+gate4` — and only one for
   `feltgrip+gate4`. The flip already paid down most of the costs this entry
   lists as outstanding.
2. **"Fails on duration, 8d6 +57%."** 8d6 is **−6%** under grip and **+8%**
   without it. The glide that "nobody has an answer to" **is answered**: grip
   takes 8d6 from deaden-alone's 2.85 s past shipped's 2.19 s to 2.06 s —
   120% of the glide recovered, not 70%.
3. **"Clock 1.64×."** 1.01×. **"Creep +45%."** Unmeasurable as stated — see
   below.
4. **"Grip has never been run with sleep off."** Sleep-off has been the
   *shipped default* since the flip, so `feltgrip+gate4` could not have been
   run any other way. The `sleepoff` override in the matrix is now a **no-op**,
   which also means `deaden+sleepoff+gate4` ≡ `deaden+gate4` and
   `disp02+sleepoff` ≡ `shipped`: three rows that read as A/B pairs are the
   same variant twice. Now commented at `SLEEPOFF`.
5. **"The pile's untried lever is spawn geometry, which moved on 08-15."** It
   moved on **2026-08-14** (`b2a3326`), and it is not a lever: what shipped was
   `SPAWN.axis 'clamp'`, which is *bit-identical wherever the old line was
   legal* and only moves the 16-of-144 dice that were born inside a wall. The
   variant that does widen the spread — `'own'` — **was measured and refused
   for piling** (close 6d6 flat 21/24 → 17/24). `js/main.js` says so at
   `SPAWN`: *"Nor is the clamp a piling lever in either direction."* The pile's
   untried lever is still unnamed.

**Why it is refused.** The pile is worse on **all four cells**, and at 40 seeds
it is worse than a 10-seed run says — the 10-seed probe read close/6d6 +3.3pp
where 40 reads **+6.3pp** (23 of 240 dice against shipped's 8), and medium/trio
reads clean at 10 seeds and +0.8pp at 40. *SHIPPED.md's warning that a 10-seed
pile row is noise holds in the flattering direction too.* The damage reaches
**the canonical trio** — attribute+skill+motivation, the roll `dice-land-flat`
pins as a floor at every zoom — at close (flat 39/40 → 36/40) and at medium
(40/40 → 39/40). The mechanism is C30c's, unchanged and now confirmed against
a cheap terminator: **on this mat sliding apart is how dice separate**, and
grip is the instrument that stops the slide. Deaden takes the bounce that
separates them and grip takes the skid; the shake win and the pile loss are
the same fact.

**And `dice-land-flat` would not have caught it**, which is the part to keep.
It samples three throws and needs 2 of 3 flat; at a per-throw flat rate of
36/40 it passes ~99% of the time. It caught C30c because that regression was
an order larger (3 clean throws in 10). **The C24 floor is a floor, not a pile
meter** — a ±2.5pp trio regression sits under its sampling power, and only the
40-seed matrix can see it.

**Two harness defects found on the way, both fixed here** (`settle-matrix.mjs`):

- **The canary had been missing on every run since the flip.** `CANARY_DUR`/
  `CANARY_SHAKE` held the pre-flip baseline, so the rig printed *"THE CANARY
  MISSED. The verdict above is not evidence"* under verdict tables that were
  fine. Re-anchored to a measured run reproduced across **two independent stage
  boots**, identical to every digit (soul 2.26 → **1.47** s, 20d6 6.25 →
  **4.15** s). A gate that is always red is a gate everyone scrolls past.
- **Gate f could not read a tuning row at all.** It judges creep *backward*
  from each die's settle frame, and switched to the forward meter only for rows
  that swap the terminator — but grip moves the settle frame too (duration
  −20%), sliding the window into the tumble. That is why "creep +45%" cannot be
  read: creep rose 17–171% on rows whose shake fell 35% and whose hops fell
  32%, which is `restMotion`'s own documented ambiguous case. The anchor test
  now also fires on a ≥5% duration move, and the forward bar asserts the
  terminator's **promise** (`dispMax < eps`, `loose == 0`, caps ≤ shipped)
  instead of *comparing* two quantities that both saturate at eps — the old
  bar failed both rows by 3.4e-5 of a die-width, printed as `0.0200` vs
  `0.0200`. Neither fix changes a ship decision: both rows are refused on d.

**What is left, and it is one question.** Deaden+grip is a shake/hops/duration
win with no cost anywhere except that dice end up on each other. Every
instrument aimed at the pile has now been tried and priced: the nudge
(`pileScale`, a die off the pile once in 24 seeds), the terminator (cheap, and
it *causes* a little of it), and the spawn line (bit-identical where it was
legal; the wide variant piles). **Nobody has proposed a mechanism that makes
dice separate without the skid.** Until someone does, this rung stays refused
and the entry is a record, not a task.

**One thing for Joe, and only if the pile is negotiable.** This candidate is
what *"really magnetize themselves to the surface once they're landed, no more
bounding like they're on the moon"* actually looks like — hops −32% at 20d6 is
the largest move on that meter ever measured here. The gate it fails is
`close`/6d6, and `close` is opt-in density whose own tooltip says so. If Joe
would trade +6.3pp of piling at `close` for the calmest dice on the table, that
is a judgment no measurement can make and the refusal above is overturnable by
his eye. **It needs a LOOK, not a re-measurement.**

The pair is shot and waiting — `node tools/drive.mjs tools/steps/grip-look.mjs
1000`, frames in `tools/out/grip-<zoom>-<pool>-<shipped|feltgrip>`:

- **`grip-close-6d6-shipped` vs `grip-close-6d6-feltgrip`** — *the question.*
  Shipped puts six dice flat and spread; the candidate clusters them and perches
  one at maxY 2.03, plainly on top of another. **Is that heap worth calmer
  dice?** If yes, the gate d bar is what should change, not the tuning.
- **`grip-medium-trio-shipped` vs `grip-medium-trio-feltgrip`** — *the
  reassurance.* Zero piled under both, and the candidate is arguably the cleaner
  frame (it separates the d8/d6 shipped leaves touching). So the trio's 40/40 →
  39/40 is a **counting** regression, not a reading one.

*Judge the pile off these stills; do NOT judge the shake off them.* The win is
motion over the last 0.6 s and a still cannot show it — that is what the shake
and hops columns are for.

**Also standing:** `C30b` — 20d6 can still reach the cap with dice genuinely
tumbling (3 of 16 seeds). That is real motion, so shortening `SETTLE_CAP`
would truncate it and show dice snapping. Left alone deliberately.

**Two rules from the campaign that bind any future physics claim.** Pair every
measurement with `__diceDebug.throwSeeded(types, seed)` — the first sweep was
unpaired and concluded the materials barely mattered, on the largest single
win. And judge a replay-drift candidate **one pool per invocation**: the
pool-generalized runner made shipped's 20d6 read 8/8 identical where running
20d6 alone is 4/8. *A passing drift run is weak evidence; a failing one is
strong.*

---

## Tier U — the converged UX: what is still open

*Five stances read the shipped experience at `1b7a8f2` against the source and
sixteen captured frames. Findings live in [UX-AUDIT.md](UX-AUDIT.md); the
twenty-five that shipped (U1–U15, U17 steps 1–4, U18, U19, U22, U24, U27–U30)
are in SHIPPED.md. Seven entries are open; per TESTING.md each ships with its
e2e scenario.*

### U16. Draft intent in the well — DESIGNED 2026-08-17, ready to build

*Audit A5 (moderate).* **The core claim re-verified true 2026-08-17:**
`renderTray` builds source chips, loose dice and the cue and nothing else
(js/main.js:14653), so `2d8 check dc15 w:Ann # The Duel` is pixel-identical
to bare `2d8`. The state carrier exists and is even proven — `boxExtras`
holds dc/exp/comment/visibility and the `draft-intent` scenario asserts the
intent *rides* — but nothing asserts, or renders, that it *shows*. The
sharpest form: staging a pool whose stored notation carries `secret` puts
two bare-looking dice in the well that will roll invisibly to the table,
with nothing on screen saying so unless ± is open or Notation is on.

**One supporting claim was STALE:** "± hides the dc, per U11." False since
U17 #28/#29 — Target (DC) sits in its own always-visible section
(index.html:945-950; only `.sec-sum` and `.sec-pair` fold under per-die
systems, css:3666-3668), and the ± popover also carries the Visibility seg.
So ± is already a complete intent *viewer*; what it is not is ambient — it
is transient, on demand, and covers the well while open.

**The design: the draft wears the offer card's own detail line.** An offer
IS a draft published to the table, and `renderOffers` already solved this
exact read — `label · formula · modsSummary · vs DC · visibility · moment`
(js/main.js:24356-24380, `offerVisText`, `modsSummary`). One muted line in
`#draft-zone`, between the well cluster and the action rail, built by the
same extracted renderer so the two surfaces can never drift. Present ONLY
when the draft carries intent beyond bare dice — a bare `2d8` draft stays
pixel-identical to today, so no standing chrome and the empty-draft
collapse (see Refuted: the section-bar ruling) is untouched. Visibility
words are draft-context ("only you see it", not the offer's "only the
offerer sees the result"); whisper names resolve via the same roster path
`offerVisText` uses. Interaction rulings: the line lives OUTSIDE
`#tray-roll` (the cluster is the button; a read must not be a click
target), the cue band is untouched, the heat ladder is light-only (§7.10)
and does not drive the line, and the geometry cost is absorbed by the
`--draft-h` ResizeObserver exactly as wrapping source chips already are
(js/main.js:14451-14457). Not gated on system: intent is notation-level and
notation totality is app-wide.

**Smallest first commit:** render the line in `updateTrayButtons` (the
funnel every draft mutation already hits) from `boxExtras` + `cmdResult`,
sharing the extracted offer-detail builder; extend `draft-intent` with one
assertion that the line's text names the visibility and dc. It must NOT:
touch the cue, add an empty standing row, gate on `usesTotal`, or grow
edit affordances (± is the editor; this is a read).

**Rider — `#verdict-subtitle`, decided: the subtitle joins the eyebrow.**
Verified: no subtitle element exists on the verdict card (index.html:814-830)
and `verdict-eyebrow` already composes `who + label` (js/main.js:7672).
`# The Duel | Charisma` renders as eyebrow `Ann — The Duel · Charisma`:
zero new markup, zero new CSS, no third line, and the card's virtue — *the
name, the answer, the exits* — is untouched because a subtitle is
eyebrow-weight material by definition. Closes the one residual asymmetry in
§7.24's eight-surface table at the cost of a text join.

### U17 residuals — ALL THREE STALE, closed 2026-08-15

Every one was fixed in `68fdc7a` — *the commit that wrote §7.24* — and neither the
entry nor §7.24's own *Not closed* paragraph was re-read against the diff beside it.
Kept as a record because that is the failure mode this file keeps paying for.

### U20. The shelf's read at rest, and the peek's lifetime — SHIPPED 2026-08-15

Folded into C25 Stage 2. The peek now retires on a new roll, on a ceremony and with
the log. **The `body.mini` bullet was not reproducible** and a different occlusion is
open in its place — see the new findings below.

### U21. What the launcher owes the table — DECIDED 2026-08-17, ready to build

*Audit E3 (moderate).* **Re-verified 2026-08-17, and the finding splits
three ways.** Still true: roster, chairs, Invite, nameplate and the ghost
row are all inside `#rail-roster`/`#rail`, hidden collapsed
(css:2384, css:3298); the offer verb lives in `#builder-panel`, also gone
(css:395); the sole browse signal is `#identity-chip[aria-pressed="false"]
{opacity:.68}` (css:2868); `applyPanels` clears rail picks on EXPAND and
nothing on collapse (js/main.js:23075), so `poolsOwner` survives it; and
`setPoolsOwner` never surfaces the pools section, so with Pools off a
teammate pill flips `aria-pressed` under a rack that is `display:none`
(css:791). **Stale, struck:** "during a profile swap that is Alice's pools
rolling under your name." The G3 rack swap is deleted — "the rack is now
always the profile in your own hands, so a publish is always honest"
(js/main.js:16549, PROFILES §11.8). The collapsed rail can only ever list
YOUR active profile's pools; what it cannot do is *name which* profile,
which is a labelling gap, not a leak. **New since the audit, and sharper:**
L4 put `↩ Main table` and `Breakouts ▾` in the presence row — so a player
in a breakout with the panel collapsed (the immersion state) has NO way
back on screen at all, and the `Take a seat` ghost (C12's fourth presence
state) vanishes the same way.

**The decision — the presence carve-out, mirroring §7.4's.** A launcher may
drop presence *chrome* (people are visible through their acts: every roll,
banner, offer card and log row on the felt carries name and color, and the
expanded panel is one keystroke away, `n`) — **on the condition that
presence STATE cannot outlive its signal, and DOORS are not chrome.**
Concretely, three rulings:

1. **Collapse falls home.** `applyPanels`, in the same breath that exits
   manage mode (js/main.js:23068 — the P2 precedent, same function, same
   reasoning: a transient view of the expanded rack cannot outlive the
   rack), clears `poolsOwner`. Browsing is a view, not composed work, so
   §7.23's "nothing is destroyed by navigation" is untouched — the picks
   survive; the vantage point resets. This dissolves the browse-signal
   question instead of answering it with new chrome: collapsed, the chip is
   always home-pressed and `.68` never shows unanchored.
2. **The pill's tap surfaces what it changed.** `setPoolsOwner` turns the
   pools section on transiently — `setSection('pools', true, false)`, the
   exact `loadIntoBox` door the audit itself pointed at — so a teammate
   pill can never again change nothing on screen.
3. **Doors survive collapse.** The conditional ghosts that are navigation,
   not presence — `↩ Main table`, `Take a seat` — render in the collapsed
   column too (the rail already has the row grammar: 86px rows, horizontal
   ellipsized words). They already obey "exist only when meaningful"
   (§7.46: a table that never splits carries not one new pixel), so this
   adds zero standing chrome. The roster pills, chairs, Invite and
   nameplate stay expanded-only — that is the carve-out working, not a gap
   in it.

**Smallest first commit:** rulings 1+2 — two call sites, both named above,
plus one scenario asserting collapse resets `poolsOwner` and that a pill
tap with Pools off leaves the rack visible. It must NOT: add a roster to
the rail (a bare dot column is the "complete garbage UI" Joe already
killed, css:2385), give the rail Offer or intent editing (Refuted list;
§7.4's carve-out stands), or persist the transient section bit (the
two-object `sectionsStored`/`sectionsTransient` split exists precisely so
it cannot). Ruling 3 is its own commit with its own look, and it carries
the L4 follow-up: the collapsed breakout scenario that does not exist
today.

### U23. A token layer for the doctrine — SHIPPED 2026-08-15

UX §7.41. **THE KIND OF CHOICE PICKS THE DRESS, DOM ANCESTRY DOES NOT.** Two thirds of
this entry's evidence was stale and the third was right by coincidence — SHIPPED.md.

### U25. The table's smaller seams — SHIPPED 2026-08-15

UX §7.45. Five of six; **"a room that dies says nothing" was deliberately dropped** and
is below.

### U26. Lifecycle reads, transport door, terminology — SHIPPED 2026-08-15

UX §7.45. **The first bullet — the one CUJS.md names as CUJ11's first item — was
stale**: §7.28 deleted the auto-collect clock on 2026-08-10, four days after the
audit found it. CUJ11's first item shipped by deletion before the journey was named.

### U28b. Touch findings — TWO SHIPPED, then the RAIL FOOT; two families still refused

`.rd-cell` and the rim wrap shipped (UX §7.45), both coarse-only.

**The rail foot shipped 2026-08-17** — `.btn.ghost` and `.corner-btn`, which
turned out to be the *same row*, so the pair is one change and it cost the rack
**3px**. See SHIPPED.md, *U28b — the expanded rail foot*. All four measurements
in the original entry were re-taken first and **all four were still exact**
(31 / 28 / 19 / 26).

**Every figure below reruns: `node tools/steps/touch-price.mjs`.** It prints the
families' live geometry and prices each candidate as a delta inside one run
(the shipped rule by reverting it), at U30's worst frame, with the same reader
`touch-targets` asserts on.

**Still refused, and now with the number that refuses them:**

- **`.btn.tiny` at 19px** — the worst of the four and the one that must not be
  done alone. It is ~25 buttons in the densest rows in the app (the portable
  door's five-across, the profile row, the offer row), and its dress is
  explicitly *label-bearing* — "`.btn.tiny` verbs, muted words, no new colour"
  (css/style.css:3815). 19 → 34 is +15px on rows that already have an
  overflow defect on the record (index.html:1164: a settings destination
  "overflowed a 459px window by 251px"). It needs the settings modal
  re-measured in the same pass, which is what makes it not a one-liner.
- **`#section-bar` cells at 26px** — unchanged reason (U30's rack budget), and
  the measurement now says something sharper than "spends it": the bar lives
  *inside* the scrollport, so bumping it costs **0px of scrollport and 8px of
  the rack's own content**, i.e. it is paid in the one place U30 exists to
  protect. §7.41 also has it as a SWITCH set, not a button family.

**And one NEW near-miss the original list missed.** The *collapsed* foot's
controls are 18–19px **WIDE** on coarse — `toggle-settings 19×39`,
`rail-log 18×39`, `rail-palette 18×39`, `corner-clear 18×37` — so they clear
the floor on height and fail it on width, and `touch-targets` never looks
(its list is expanded-state). This is not fixable by a rule: four controls plus
the contextual ✕ in an 86px content box already use 81px (measured, and the
budget is written at css/style.css:2434). It is U28a's shape — a **layout**
change before a size one — and it belongs with U21, which is already the
"collapsed rail deletes multiplayer" entry.

**Raise by family with the measurement, never in bulk** — that rule held up:
of the four families it says to price separately, one was nearly free (3px), one
is paid in the protected place, one carries a known overflow, and the fifth
thing it did not list cannot be priced at all. It held up in a second way too:
the first write-up of the shipped bump said **4px**, measured on a
padding-based candidate rather than on the rule that shipped, and only the
committed tool step caught it (SHIPPED.md has the postmortem).

---

## Tier V — the immersion audit's shortlist

*[IMMERSION-AUDIT.md](IMMERSION-AUDIT.md) cross-checked the detail work
against the industry canon: seven pillars STRONG, three PARTIAL, one GAP. V1
(audio phase one) and V2 (dust motes) shipped — see SHIPPED.md.*

### V3. Finish the wear dossier — **NOT small; it is a fifth wear pass and a LOOK**
Audit §2's two designed-but-unbuilt items: hand-polish roughness zones (tray,
jambs — "polished where hands and dice pass") and the arris ribbon (sparse
chip decals that break the long straight edges). Completes "aged" into "aged
and handled."

**Re-scoped 2026-08-17 (verified unbuilt: `grep -rn "arris\|burnish\|polish"`
over `js/` finds the word only in *comments explaining existing bevels*, never
a pass).** This is not tail work and it should not be started as tail work:

- The wear stack is FIVE analytic passes shared by every tower
  (`weatherPass`, `grimePass`, `dustPass`, `mossPass`, `gravityStain` — all
  exported from js/towerskin.js and called by towerhollow/towerbastion/
  towerdress). A polish pass is a **sixth**, it INVERTS the others' sign
  (roughness *down* where they all push it up), and it needs a zone predicate
  ("where hands and dice pass") that no existing pass has any notion of — the
  four dials are curvature, concavity, up-vector and drift.
- Then it has to be **dialled per tower and per palette**, which is
  T6's "two palettes cost two of everything", and accepted **by Joe's eye** —
  and five LOOK verdicts are already outstanding at #1. Shipping a wear pass
  into that queue lengthens it.
- The arris ribbon is the cheaper half and still not small: `DecalField`
  (js/decals.js) is a FELT-impact system, so edge chips on tower geometry are
  either a new decal domain or baked into each skin.

**Leave it whole for a materials round with a LOOK slot booked.** Salvage: it
is the natural companion to [T15](#t15-re-bake-the-three-classic-skins-through-the-forge--large-scoped-2026-08-14),
which is already re-baking the three classic skins and already queued behind
Joe.

### V4. Performance guardrails — **the instrument SHIPPED 2026-08-17; the assertion and the throttle are what is left**
Audit §10 asked for three things and one of the three was **never true**:

- ✅ **`renderer.info.render.calls`, as a number a test can hold** — SHIPPED
  (SHIPPED.md, *V4 (instrument)*). `__diceDebug.renderAudit()` reports the
  frame's real cost, and the reason it took more than one line is the trap:
  three.js resets that counter inside *every* `renderer.render()`, and
  js/post.js issues up to eight per frame, so the obvious read reports the
  closing quad's single draw and passes any budget. `renderer.info.autoReset`
  is now ours (js/main.js:655) and tick() resets once per frame
  (js/main.js:8657).
- ❌ **"pixel ratio not clamped"** — **the audit was wrong on the day it was
  written.** `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
  has been there since the repo's first commit: `git log -S
  "setPixelRatio(Math.min" --oneline -- js/main.js` returns `2036d59 init` and
  nothing else. Recorded in SHIPPED.md's wrong-claims table; `renderAudit()`
  now reports `pixelRatio` so the clamp is assertable rather than re-asserted
  from memory.
- ⬜ **The assertion itself** — a scenario, and the contract is written **and
  sabotage-checked**, which changed it. Read on `blackanvil` (the heaviest
  registry tower) with a settled `4d6`:
  - plain frame: `passes === 1`, `post === false`, `calls <= 220` (measured
    **186**);
  - then `postForce(true)` and wait for `passes > 1`: `passes === 8`,
    `calls <= 300` (measured **246**), and **`calls > 40`**;
  - `pixelRatio <= 2`.

  **The floor belongs on the POST frame and nowhere else, and the first
  version of this contract had it in the wrong place.** With
  `renderer.info.autoReset` sabotaged back to `true`, the post frame reads
  **1 call in 8 passes** (the closing quad) — caught. The *plain* frame reads
  **81 instead of 186**, because the engine's reset point only hides the shadow
  pass there: still far above any sane floor, so a plain-frame floor is theatre.
  A ceiling-only budget passes the sabotage on both. Incidentally measured the
  same way: the 2048² shadow pass is **77 of blackanvil's 170** idle draw calls
  (170 shipped vs 93 sabotaged, no dice) — 45% of the frame, and exactly what
  the default counter does not show you.

  Per-tower, after settle, headless at dpr 1: empty felt **2**, 4d6 on bare
  felt **58**, `heartwood` **133**, `bastion` **141**, `blackanvil` **186**,
  `nullstone` **68**, `hollowbole` **79**. Owner: whoever owns
  `tests/e2e/scenarios.mjs` next.

  **Every number above reruns: `node tools/steps/draw-price.mjs`** — it walks
  the registry, finds the worst plain frame itself rather than trusting this
  list, forces the post frame, and then *evaluates the five assertions above and
  prints PASS/FAIL for each*, so the scenario can be written from a run instead
  of from this paragraph. It also carries the instruction for re-running the
  sabotage.
- ⬜ **The idle tick throttle — NOT a one-liner, because its gate is an eye.**
  The measurement is why it is worth keeping: idle with no tower is **2 draw
  calls**, and idle with `blackanvil` up is **186, every frame, forever**. So
  the payoff is real. But "idle" here still has the ember breath, the sway and
  the smoke running by design (the audit says so itself), so a reduced idle
  rate is a *visible* change to the breathing world, and the only thing that
  can accept or refuse it is Joe's eye — which is the queue at #1. Do not
  land it as tail work; take it with a LOOK slot.

### V5. Diegetic nudges — DESIGN FIRST, and the hover half has no substrate
Audit §11: a result echo on the felt near the deciding die; hover warmth on
dice ("everything you can touch touches back"). The mat's painted text is the
precedent that this is buildable without a framework.

**Checked 2026-08-17: there is no pointer→die path in the app at all.** The
only `pointermove` on the canvas is CAMPEEK's hold-drag (js/main.js:747), and
it deliberately *swallows* the click that follows a pivot — so "hover warmth"
starts by adding a per-frame raycast against `tableDice` and then owes an
answer for touch, where hover does not exist and every one of those frames is
the drag. The felt echo is the more promising half and the mat precedent does
hold, but it needs the ruling U16 needs: the app has no worldspace text
renderer, only painted mat texture. Both stay design-first.

### V6. Taste items, someday — record only
A trauma²-curve table-nudge on the heaviest single-die landing; a grade LUT.
Both sit in the canon's hazard-adjacent column; neither moves until Joe asks.

### V1 phase two — record only
Hidden-transit rolling voices (the shaft is silent apart from clunks); the
rough/surface track feeding wall-vs-felt *timbre* rather than only level; a
stone-chamber tail if the dry table ever asks for one (a shared send with
`g ≤ 0.90`, never a ConvolverNode). **And the bed does not ship on by default
until Joe has listened to it for an hour straight.**

---

## Tier W — the first fantasy venue: the fae set — **BUILT; the LOOK and the LISTEN are Joe's**

*Design authority is GOALS goals 13–15 (venues, the two registers,
atmosphere-serves-the-roll); the punted questions (multi-dice-set venues,
unbundling, portability) are recorded there. The engineering rules are
untouched in this register: one seed one film, zero-dep, e2e per feature, the
camera rulings, the perf budget.*

**W0, W1, W2, W2b, W2c, W3, W4 and W5 are built** — the venue mechanism and
set toggle, the glade room, its composition doctrine
([VENUE-COMPOSITION.md](VENUE-COMPOSITION.md) + `/new-venue`), the
grown-not-placed round, the forge-baked Hollow Bole through round 8, Moonmoot
Witchlight, and the living layer. Full record in SHIPPED.md.

### The sitting's page is RENDERED, then BUILT, in that order

**`tools/verdict-sheet.mjs` embeds frames; it does not take them.** Run it
alone and it happily publishes whatever is in `shots/` — which is how the copy
that sat waiting for a verdict came to carry frames taken at `660d48d` while
`js/main.js` had moved 259 lines and `index.html` (where C25's panels live) had
moved too. Its stamp read *"every frame rendered fresh from this tree"* as a
**hardcoded string**. The page whose whole job is to prevent a stale look was
the thing asserting freshness without checking it.

Fixed 2026-08-17, and the fix is a refusal rather than a warning:

```
node tools/drive.mjs tools/steps/verdict-shots.mjs
node tools/drive.mjs --steps tools/steps/glade-look.mjs,tools/steps/life-look.mjs,tools/steps/record-look.mjs
git checkout 9f1e592 -- js/fae-lab.js && node tools/drive.mjs tools/steps/glade-look.mjs tag=before && git checkout HEAD -- js/fae-lab.js
node tools/verdict-sheet.mjs        # exits 1 if any frame predates the code it shows
```

- **The bar is per row**, the newest of (the app the frames photograph) and
  (only the steps that row's own regen command names). One bar for the whole
  page meant any new probe step under `tools/steps/` reddened all 48 frames,
  and a warning that fires on unrelated work is a warning that gets switched
  off.
- **The bar is a COMMIT DATE, not an mtime**, because mtime lies in both
  directions here: the BEFORE frames' own `git checkout … -- js/fae-lab.js`
  dance restores byte-identical content with a fresh mtime, and a frame copied
  in from another worktree arrives looking new. Uncommitted edits to those same
  files still count — they are real and have no commit to date them.
- **Verified in both directions** (an uncommitted file under `js/` → 48 rows
  red, exit 1; removed → 48/0/0, exit 0) and the page was opened, not just
  generated: 49 images, none broken, no console errors.
- What it still cannot catch: a frame carried in from a different tree. Only
  the steps writing their own provenance would close that, and they do not.

**So a page built before a batch lands is stale by the time the batch lands.**
Re-render after the merge, not before it.

### W5's LOOK read — OPEN, and it was never actually asked

Joe's W7 verdict answered a question about the *composition and the model*,
not about the living layer — nothing in it is about the fireflies or the
procession. **Recording that distinction rather than banking an approval
nobody gave.** Re-ask it on frames where the staging is no longer the loudest
problem. `tools/steps/life-look.mjs` is the loop; a static room is fair to
photograph once, a moving one is not.

### W7 ②. The staging — SHIPPED 2026-08-13, VERIFIED 2026-08-15, LOOK OPEN

**This entry said "② has not started". It shipped on 2026-08-13** (`583b569`,
`c67977f`) with `venue-set` claims. What had never happened was frame-space
verification or a LOOK, and both were the point.

`tools/steps/glade-frame.mjs` now states the claim **in the FRAME**: seven geometry
gates through the live camera at the resting eye plus one on rendered pixels, each
run twice — over the live stage and over a frozen W2c table — and **the step refuses
to pass unless at least three discriminate**. Two defects nobody had seen: the
mushroom scatter, authored to look irregular in plan, **projected into three mirror
pairs across the tower** — "symmetrical and formal", arrived at by accident; and the
foreground wing sat at 58% and 17% of its own footprint in frame.

**OPEN, and it is Joe's:** `shots/glade-before-{moonrise,foxfire}-resting.png` →
`glade-{moonrise,foxfire}-resting.png`. One reservation worth his eye: the after is
dimmer overall — most new mass reads as dark silhouette and the only strongly-lit
cluster is bottom-left and clipped by the frame edge. That is either "in a scene" or
a value problem, and the gates cannot tell him which.

### W6. The venue's audio palette — SHIPPED 2026-08-16. **TIER W IS BUILT.**

One table, `VENUE_AUDIO`, read through `venueAudio()`. Two rows per venue,
because two things had never travelled with the venue while the tower's
`clunkVoice` and the staged set's `sound` already did: **the bed** (the shipped
pink+brown+crackle is a *hearth*, and there is no fire in a clearing — brown
cut hardest, the pink pair lowpassed under §1's 1.5 kHz wood/metal boundary,
the tick layer re-derived from a spark into condensation off the canopy) and
**the ground** (the glade's floor is moss over soil, so a second timbre tier
multiplies in beside `IMPACT_SOFT_*` and rides impacts, the settle tail, the
rolling band and the tilt curve).

Four properties made checkable rather than promised, and all four verified
against the live graph: the grounded row is all 1s and an inaudible cutoff, so
**the shipped table is unchanged by construction**; a baffle knock is never
trimmed (a die inside the trunk is not on the moss); the trim is **timbre
only**, so §4's film-derived level list stays literally true; and it applies
*outside* the 0.35 clamp, so a venue can only subtract from the mix plan.

**Refusal 14, new:** a venue changes what the room is **made of**, never
whether the room is **audible** — so the bed still rides the existing
Room-tone switch and defaults off. V1's phase-two note (the bed does not ship
on by default until Joe has listened to it for an hour straight) stands.

**The living layer has no voice, deliberately**, and the law is worth more than
the feature: *audio may be anonymous and unsynchronized, or synchronized and
tied to a visible thing, but never unsynchronized and tied to a visible thing.*
A moot chime's onset would ride `FAECONCEPT.t`, which starts at zero when each
client enters the venue — two people in one room would hear the ring speak at
different moments while watching the same caps light. Marked at the site where
the next person will reach for it.

**What is left is LISTENING, and it is #1 in THE ORDER.** `docs/AUDIO.md` §9
is the script: **ten** rows of exactly two clicks, ordered so one thing changes
between consecutive rows. Note the count the roadmap had wrong — **there are
FIVE tower clunk voices, not four** (`nullstone`'s hush was missed), so with
the Witchlight chime and W6's numbers **every voice in the app is unheard**.

*Five claims in docs/AUDIO.md were false against the code and are corrected in
place — including `perHitBufferAllocs` "must stay 0", which actually reads 2
whenever the bed is up and is 0 in every scenario only because ambience
defaults off.*

### W2c ledger — next tower round, not W2c

The pale MACHINED FACE at the shell's x-clamp plane (x 3.13, y 0.70–0.85, z
0..−0.4) reads as a sawn plank in side views. Pre-existing (round 5 renders it
identically, A/B'd), and more visible now that everything around it is
organic.

---

## Tier T — the tower contract: what the cosmetic/physics split still owes

*The law: **physics and film are a function of (portal spec, engine constants,
seed); the model is not an input** — enforced, not aspirational. The model
contributes zero colliders, and a mesh change that leaves `tower-spec-digest`
and `towerFilmDigest` unmoved provably cannot move a roll. T1, T2, T3, T4, T7,
T8(a), T10 and T14 shipped; record in SHIPPED.md.*

**Measured cost of a tower today:** bake + nine refusals **~30 s** (both
palettes), the whole cosmetic gate `npm run gate:cosmetic <id>` **1m47s**, and
**zero dice simulations** for a mesh-only change.

### T15. Re-bake the three classic skins through the forge — LARGE, scoped 2026-08-14

Commissioned by Joe off T14's measurement. **A code-built skin costs 3–18× the
draw calls of a baked one** — heartwood 49, bastion 61, blackanvil 88 against
nullstone's 5 and hollowbole's 16 — because a code skin is dozens of separate
meshes with their own materials and a baked GLB is a handful of merged
primitives. Nothing is visibly wrong today and the scene is nowhere near a
draw-call limit; this is about cost, consistency, and retiring a second way of
building the same thing.

**The portal half is free** — all three sit on `DEFAULT_PORTALS`, so the
physics core does not move and `tower-contract-freeze` should stay
byte-identical throughout, which is also the check that proves each step was
cosmetic.

**What makes it large, and it is not the geometry.** These skins are seeded
canvas bakes (`bakeWood`, `bakeStone`, `bakeEmber`), Sobel normal maps,
raycast vertex AO, alpha-tested ivy panels and instanced leaf fields, plus
swaying dress. A forge recipe bakes COLOR_0 and one material per mesh, so
every one of those has to become either baked vertex colour or a decision to
lose it. **The look is the risk**: this re-opens three shipped towers'
appearance, and the bar is Joe's eye, not the gates.

**Order, cheapest lesson first.** blackanvil (88 draws, the biggest win, and
the least organic); then bastion; then heartwood, which has the most
hand-authored texture story. One tower per round, each with its own LOOK gate
and A/B against the current skin, and each ending in a `DRAW_WAIVER` line
**deleted rather than lowered**.

**Do not start it as a side quest.** Every round is a `/new-tower`-shaped job
with a review gate, and a half-migrated tower is a fourth way of building one.

*(T15 supersedes **T9**, which said "do not spend on it". T9's question — "why
are there two ways to build a tower" — now has an end date rather than an
answer on paper.)*

### T5. Recipe authorship is the new bottleneck — DESIGN FIRST, medium

The headline finding of the whole pass. With gates at 30 s and 1m47s, machine
time is no longer what a tower costs; a "five-minute mesh" is still 20–60
minutes of Blender Python. Two candidate levers, neither chosen:

- **(a) A higher-level recipe vocabulary** — the shapes `hollowbole.py` and
  `B4_gnarl.py` keep re-deriving (trunk with root flare, spire crown, torn
  aperture, shelf placement) lifted into parameterized forge helpers.
- **(b) An adopt-a-mesh path** — take geometry authored or generated anywhere,
  declare portals against it, and let the gates rule on whether it sockets.
  The larger unlock and the larger risk (no COLOR_0, no budget discipline, no
  material story, and the vertex-colour laws this project learned the hard
  way).

### T6. Two palettes cost two of everything — small

COLOR_0 is baked data, so every fae tower bakes twice and is LOOKed twice.
Tolerable at one tower, a tax at five. The bake half is nearly free already
(28.4 s covers both variants in one invocation); the human half is not. Fix
shape: a single contact sheet putting both palettes side by side at the same
eyes, so the LOOK is one pass instead of two.

### T8 (b). The SOLID exit/hood classification is still a printed report — designed

MEASURED while arming (a): the 18 points are THREE samples (x −0.9, 0, +0.9 at
y 3.77, z −7.42) seen from six eyes, crossing the wall plane at |x| ≤ 0.85 and
y ∈ [4.04, 4.32] — just over a declared head of 3.5, in a narrow central
column. **Legal:** Hollow Bole's torn arch really does top out at 4.95, and a
portal is a MINIMUM.

**The design, and why it is not done:** the allowance must be a **MEASURED
aperture**, not a typed rectangle. Hand-writing "the opening is 4.0 × 4.05" on
the registry row means fitting the number to the leak, which is how a gate
gets neutered; and the wound is a radial window on a curved surface, so its
wall-plane span is not a constant anybody can read off the recipe. The right
shape is the one the portals already use: **the RECIPE knows its cutter loop
exactly**, so it should export the real opening as GLB extras beside
`portalOut`, the loader should carry it, and the tool should refuse any SOLID
crossing outside it (plus a consistency check that the aperture CONTAINS the
portal). A forge-helper + loader + tool change and a re-bake of both palettes
— worth doing deliberately, not bolted onto another pass.

*The lesson (a) earned three times over, and it is this file's most repeated
one: an unarmed gate reads exactly like a passing one. `front_height_needed`
was the occlusion floor alone while `gate_front_carries_the_dark` required a
second, independent floor no tool computed; hollowbole had **never run** that
gate at all, for weeks, while fourteen others were green.*

### T11. Judge three massings at once, not one after another — small, NEEDS JOE'S CALL

The remaining serial cost in the loop is the author's, not the tools': nullstone
was refined one shape at a time — author, look, rewrite, look. Baking three
candidate massings and judging them on one sheet picks a direction from
evidence instead of converging on a guess, for roughly the same token spend and
a third of the wall time. **Needs Joe's say-so because it means fanning out
agents** — which Tier N then did once, with a good result.

### T12. There is no MAXIMUM door width — small, needs a measured ceiling

`TOWER_PORTAL_LIMITS` floors `out.w` at 3.2·S = 4.0 and never caps it, but the
doorway is cut out of the back wall by two flanking boxes, so the narrower jamb
is `TABLE_W/2 − w/2 − |out.x|` and goes NEGATIVE once `w + 2|out.x| > TABLE_W`.
At `close` (TABLE_W 8.6) with the x knob at its limit that is `w > 7.1`,
against a widest shipped door of 5.0 — so nothing can reach it and it is filed
rather than clamped. Clamping would hand a player a doorway the modeller never
proved, and picking a ceiling by taste is what the portal FLOORS campaign
exists to argue against: the number wants **measuring** (at what width does the
lintel stop channelling? does a door wider than the flight envelope buy
anything?). The inequality is written beside the limits in js/main.js so the
next person meets it before the bug.

### T13. `clearH` is quoted from two different datums — DOCS, and it is a trap

The engine is unambiguous: `towerColliders` puts the lintel's underside at
`v.door.h` = `spec.out.clearH`, measured from the FELT. `sillY` is also
absolute. So the height a die actually gets is `clearH − sillY`.

**The prose is not.** THE MINIMUMS in docs/TOWER.md argues the 3.375 floor
against "≈2.85 **over the sill**" and calls the old 4.5 floor "~58% more
height than any die ever used" — which only works if 4.5 is being read as an
over-sill number too. Both readings appear in one paragraph. Taken literally, a
legal spec of `sillY 1.375, clearH 3.375` leaves 2.0 over the sill, which the
same paragraph says is under what a lone d20 needs.

Nothing is broken in the field. **But it is the kind that ships a bad tower:**
an author who reads "clearH ≥ 3.375 over the sill" and raises their sill to
1.375 builds a door 0.85 shorter than they think, and the limits will not stop
them. Fix shape: state the datum once, in the contract, next to the limits;
re-quote every number in THE MINIMUMS against it; and decide whether the FLOOR
should be over-sill (in which case `clearHMin` becomes a function of `sillY`
and the validator gains a rule).

### Tier N residual. The carved spill — IDEA CONFIRMED, BAKE REFUSED

Nullstone divergence ③. **The base is a clear win**: the foot flares into an
unmirrored skirt of broken stone and the delivery slab stops being a tray
parked in front of a building, which paint had already failed to fix twice
(hollowbole's tongue took a 0.39 value drop and still shipped a gangplank).
**Not landable as it stands:** its body carries the OLD doorway that ② exists
to have fixed, and its **cost is wrong by ratio** — ~10570 tris against a whole
tower of 4304, landing near 14874/15000 (~0.8% headroom) and freezing nullstone
against any later change. 71% of the model for the bottom fifth of the frame,
seen mostly at grazing angles.

**NEXT ROUND, NOT A MERGE:** re-derive the heightfield at a coarser density and
keep the silhouette law (no straight outline run over ~0.8 u, crest broken by
asymmetric shoulders).

*Two findings from the same pass that outlive their swings, both about tools
lying, both fixed on master: the `tower-try` lamp and the front-height floor.
And one that belongs to every tower — **the room lights from ABOVE, so detail
cut INTO a player-facing vertical face never appears in a frame**; an arch was
carried three rounds and was invisible in every one.*

---

## Tier B — the closed beta

*Shipped 2026-08-14 (UX §7.38, `js/stability.js`, e2e `stability-gate`): two
channels, redeemed by `?stability=beta`, revoked by `?stability=stable`,
persisted per browser and stripped from the address bar. **It gates the OFFER
and never the CAPABILITY** — goal 15 forbids anything else, since a client
that refused the room's tower would bake a different film and put different
dice on screen from the seat beside it.*

- **B1. The server does not know about channels — RULED 2026-08-17: and it
  never will.** The server half is **KILLED** ([docs/IDENTITY.md](IDENTITY.md)
  §4, record in SHIPPED.md). The named defect: *B1 asked the server to refuse
  an entitlement that does not exist, for a threat the client gate already
  ends, in violation of the channel's own one law.* Enrolment is an open
  keyword (`?stability=beta`), so any client that can name a beta tower id
  can enrol first — there is no unentitled class to refuse, with or without
  durable identity; goal 10 ("no access control and there never will be")
  forbids a settings write refused by who asks; and `js/stability.js`'s one
  law — the channel gates the OFFER, never the CAPABILITY — is exactly what
  a server refusal would break. The discoverability gate as shipped is the
  whole feature. **Consequence for THE ORDER #9:** the identity pass stops
  being scheduled against B1; what identity IS, the bill it has actually
  run up (a held roll's reveal dies with its tab), and the one design that
  survives (`dice.who.v1`, rung 1 buildable in ~25 lines) are in
  [docs/IDENTITY.md](IDENTITY.md). The "identity anchored to browser-storage
  shape" entry under Structural risks should be read with that record beside
  it — its "B1 is that feature" sentence is superseded by this ruling.
- **B4. `dice.who.v1` rung 1 — SHIPPED 2026-08-17** (UX §7.52, IDENTITY §5,
  `tests/identity.test.mjs`, `server.js` `resumableSeatFor`). Filed under this
  tier only because B1 is where the pass was scheduled from; it is **not a beta
  feature** and has no channel — the key ships to everybody, because the two
  things it fixes were broken for everybody. *Written red first: the reveal of a
  held roll came back `403 not_reveal_authority` after the tab that chose it
  closed, and a player's own secret rolls were absent from their own log on
  rejoin — neither on any roadmap item, neither visible to the suite.* The fix
  hands the same `playerId` back to a browser rejoining a seat **nobody is
  sitting in**, so every authority check and `projectEntryFor` heal untouched.
  A live seat is never resumed (`clients.size === 0 && everStreamed` — the
  second half stops a session restore landing two tabs on one seat), refusal is
  a fresh seat rather than an error, and `who` never leaves the front door.
  **Rung 2 is named and NOT scheduled** (return after the reap): it would widen
  four authority sites and change `projectEntryFor`'s redaction-suite-pinned
  signature, and IDENTITY §7's question to Joe is what decides whether it is
  ever built.
- **B2. Nothing tells a beta tester how to leave.** The revoke link exists and
  is proven; no surface offers it. A one-line "you are on the beta channel"
  row with the stable link belongs in Your stuff — but the panel is at its
  measured cap (§7.38: two designs were abandoned this pass for 24px and
  21px), so it costs something else its place. Worth doing when the panel next
  gains room, not before.
- **B3. What comes OUT of beta, and how it is decided.** Towers and venues
  leave the channel when Joe says they are finished; there is no criterion
  written down and **no reason to invent one before there is a second beta
  feature to generalise from.**

---

## What the 2026-08-15 batch left behind — **ALL EIGHT CLOSED 2026-08-16**

Record in [SHIPPED.md](SHIPPED.md). Three were wrong about themselves, and the
corrections are the reason this section is kept rather than deleted:

- **The flyout occlusion was mis-framed twice.** It is **not** a `body.mini`
  rule — at 1440×900 with panels collapsed (still mini) the overlap is exactly
  **zero**. The real condition is a felt narrower than ~324px, where both boxes
  saturate to the same column. And "covers it entirely" is **83%**; a ~23px
  strip carrying `#result-label` survives. Understated in one way, though: the
  banner has no clock, so the occlusion lasted until the next roll.
- **The prescribed fix for `.roster-name` would not have made its comment
  true.** Hoisting `.rp-item`'s overrides makes the pill match `.rp-item` — but
  the comment claims it wears *the panel's seg controls'* dress, and those segs
  are **SWITCHes** (`--sw-fill`, no ring) while the pill is a **PICK**.
  Converging across kinds is the one thing §7.41 forbids. The comment was
  corrected instead; the hoist is priced at `css/style.css:3037-3049` and is
  one look if anyone wants it.
- **`--gold-dim` was never a pixel question.** Its fallback is `--muted`'s
  `:root` value to the byte, so it converted at zero cost. `--panel-bg` really
  is blocked, but not for the stated reason: its two sites carry **different**
  fallbacks, so there is no single value to define. Both dead references
  deleted.

**One item found a third hole it did not name:** `.gcloudignore` **replaces**
`.gitignore` rather than supplementing it, so everything gitignored is
invisible to a check that trusts `.gitignore` — `shots/` was uploading too.
That rule is now written into the file. `gpu-trace.csv` was **not** deleted: it
is the raw evidence behind the `DICE_E2E_CORES` cap, and removing Joe's
measurement data is his call; the defect (the upload) is closed either way.

**Still open from that list: nothing.** The dead-room notice shipped as UX
§7.47 — *a receipt, not an obituary*: the app already healed this case in
silence (name from `recentTables`, setup from `maybeRepushTable`), and the gap
was that an act performed on your behalf went unreported. It never says why,
because four causes are indistinguishable from a client.

---

## Structural risks (bets, not bugs — each gets more expensive to reverse)

- **System capability flags as scattered per-surface render gates.**
  `usesTotal` is consulted independently at every render site — verdict card,
  banner, log, dock strip, popover, preview — and *every* system finding in
  the audit is the same failure: a gate written for sum systems, applied or
  missed one call site at a time. The default system is the one that exercises
  the `false` branches, so **Joe's own game is where the drift lands.** The
  durable fix is an inversion: the profile should *supply* the renderers (as
  it already does for `forecastFor` and `outcomesFor`) rather than surfaces
  querying booleans. **Three live instances are open right now** — see
  [U17 residuals](#u17-residuals--all-three-stale-closed-2026-08-15).
  Until the inversion, every new result surface re-litigates what a per-die
  system shows, and loses somewhere.
- **Identity anchored to browser-storage shape — and the bill has arrived.**
  U3, U19 and the lobby's stale interpretation system are one bet:
  `dice.name.v1` origin-global, `playerId` minted per-join with
  `sessionStorage` resume only, `dice.roomsettings.v1`/`dice.log.v1`
  global-not-room-scoped. GOALS §7 defers persistent identity to "a later
  pass" — fine — but these keys are load-bearing for **authority**
  (`revealAuthority`) and **routing** (the seat door), not just convenience.
  The standing instruction was *"schedule the later pass before the next
  feature that needs a stable who"*; **[B1](#tier-b--the-closed-beta) is that
  feature and it has already arrived.**
- **The size question: main.js is large; UX.md is failing.** Six stances
  traced every path through js/main.js and the choke-point architecture held —
  findings located to single lines, and **no finding was caused by the file's
  size**. docs/UX.md is the opposite: its append-only §7-in-commit-order
  structure has produced two self-documented shipped-on-superseded-doctrine
  incidents and four more stale-authority findings. **The document, not the
  code, is the structure actively generating defects.** U4's WHAT IS TRUE
  TODAY table shipped as the mitigation; [C4](#c4-one-owner-per-numbering-namespace--shipped-2026-08-15)'s
  remaining half (a next-free-section-number line in the document that assigns
  them) is the other half.
- **ROADMAP.md was becoming the same failure.** It reached 3,723 lines, of
  which ~2,000 were shipped narrative, killed designs and verified-pattern
  records — i.e. everything its own header says lives in SHIPPED.md. It also
  carried a priority order nobody had followed for six weeks. *Recorded here
  because the fix (this cleanup, 2026-08-14) is a treatment, not a cure: the
  rule is that a section that says SHIPPED moves out in the commit that ships
  it.*

---

## Refuted — do not re-litigate

*Verified by the audit passes and preserved so they stay dead.*

**Product and UX**

- **Do not make the section bar sticky.** The 31px-permanent argument is
  sound; the crowding fix is letting `#draft-zone` collapse toward the rim when
  the draft is empty — the ResizeObserver makes the shrink structurally free,
  and it returns 114px in exactly the state with nothing to show.
- **Do not add a confirmation dialog to `c` / Clear table.** Goal 10 makes
  sweeping the felt everyone's right and the table should stay fast. The
  shipped answer is scope + arming (C7), not a modal.
- **Do not badge visibility on every result surface.** The un-badged ruling is
  reasoned and correct — the mode is never sticky, and composing-time
  announcement ships. The gap is *retrospection* only; one muted token in the
  log row (derived from `entry.visibility`, reusing `offerVisText`) answers it
  without reopening the ruling.
- **Do not change the server's collect-on-arrival rule for held rolls.** It is
  deliberate, documented at the call site, and the shelf is the designed home
  of a held roll. The defect is that the record cannot show it — fix the view
  (C25 Stage 2), not the state machine.
- **Do not give the rail Offer or full intent editing.** §7.4's launcher
  carve-out is right: a launcher fires intents authored elsewhere. *(The
  carve-out sentence is in GOALS as of U4.)*
- **Do not unify the two bars by making the rail multi-select, and do not
  suppress the leading `1` in the dice counter.** Exclusivity is correct for a
  mode switch and the counter's grammar is correct as shipped.
- **Do not make import destructive.** Union-only, preview-then-merge is the
  load-bearing lesson of the `#g=` post-mortem and it held under every stance.
  The missing operation is an explicit, separately-named replace
  ([C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--shipped-2026-08-15)),
  not a sharper Apply.
- **Do not split js/main.js as a reflex, and do not reach for a framework.**
  Zero-dependency single-file is upholding its end — the audit traversed it six
  ways and the architecture held. Split only when a specific change is
  demonstrably harder because of the file, and record that demonstration when
  it happens.

**Performance**

- **`renderTray` layout thrash.** Real (16 forced reflows per palette tap, +18
  recalc, ~20 ms wall) but the fix-attributable share is only ~5 ms of a ~20 ms
  tap; the full tap is under the 150 ms budget and the loose-die overlay cap
  holds ✕ count at 7 regardless of dice count. Skip.
- **`projectEntryFor` per-recipient allocation.** Measurable (~1 ms/broadcast
  at 40-player caps) but not player-felt.
- **In-server rate limiting** (§0d F1/F3/F4/F6, killed). `req.socket.remoteAddress`
  collapses to one value behind Cloud Run's proxy, and a 429 on `/api/events`
  trips a self-inflicted stream storm. **Cloud Armor is the correct place** —
  this is why [§0j](#0j-operational-going-online-deploy-side)'s throttle is
  written as an infrastructure rule.
- **Do not replace cannon-es yet.** *Not a plan, a bookmark* — the survey is
  in SHIPPED.md (C32). Two of the settle campaign's dead ends were *engine*
  limitations solved upstream elsewhere. **Jolt** is the only vendorable
  candidate but its npm build lacks the determinism flag and JoltPhysics#2092
  should close first; **Rapier is rejected** (per-pair contact materials and
  per-body sleep thresholds absent from the JS bindings, both of which this
  table tunes today). Nothing in that survey was benchmarked here.

---

## Where things went

**2026-08-14 cleanup**

| Was | Now |
| --- | --- |
| Tier 0 §0b/0d/0e/0g/0h killed-design catalogues | SHIPPED.md — "Tier 0 — the designs that were KILLED" |
| §0i (closed), §2k (closed), §13 (moved to L4) | closed; §13 keeps a pointer |
| §9d's build record (five towers, dressing, portal floors) | SHIPPED.md §9d; the portable-YAML follow-up stays here |
| C6–C10, C16–C21, C23, C30–C33 | SHIPPED.md; C30's one unshipped rung and C24's binding measurement stay here |
| V1, V2 | SHIPPED.md; V1's phase-two list stays here |
| W0, W1, W2, W2b, W2c, W3, W4, W5 | SHIPPED.md; W5's LOOK, W6, W7 ② and the W2c ledger stay here |
| T1, T2, T3, T4, T7, T8(a), T10, T14 | SHIPPED.md; T8(b) stays here |
| Tier B's shipped half, Tier N's judgments | SHIPPED.md; B1–B3 and N's ③ stay here |
| "Conformances to protect", "Healthy patterns", "Patterns to protect" | SHIPPED.md — records of what was verified, not open work |
| Two separate "Refuted" lists | merged into one section above |
| T9 ("do not re-bake the classics") | **superseded by T15**, which commissions exactly that |
| C2 (restore, sketch) | **superseded by C15**, the measured shape |
| C24's prescription | **shipped as C27**; the measurement and the "do not shrink the mat" instruction stay |
| U20's shelf half, C13 | **fold into C25 Stage 2**; U20's peek half stays independent |
| §1's two headline violations | closed per GOALS and verified in the tree; §1 is now a re-audit item |

**2026-08-15 batch** — fifteen of sixteen ORDER entries worked in one pass.

| Was | Now |
| --- | --- |
| §1, §3, C4, C5, C11, C12, C13, C14, C15, C22, C25, C28, C29, U17, U20, U23, U25, U26, §13 | **SHIPPED** — each keeps a pointer line here; the record and the corrections are in SHIPPED.md |
| §0j's two bullets | shipped; §0j now holds one **decision** (do not buy Cloud Armor yet, with the pricing) and the nice-to-haves |
| §2l ⑤ | shipped; ⑥ was the open half and became #2 in THE ORDER — **since shipped in full** (engine 08-16, rendering 08-17), record in SHIPPED.md |
| §3b L4 / CUJ5 | shipped; L2's judgment call is all that is left of §3b |
| C27's residual | ~~**measured and refused as a default** — 0 px gain at 390, a loss at 40d6. Shipped as an inert instrument; the call is Joe's~~ **BOTH REASONS WERE FALSE and the entry SHIPPED ON 2026-08-18.** "A loss at 40d6" was an UNGATED probe reading of a frame the option cannot return; "0 px at 390" is true of the median phone and was never an argument about the tablet, where the win is 2.95×. See C27 |
| C24's mat table | **its preset LABELS were a full notch stale** and are struck; the measurement still binds |
| W7 ② | had already shipped 2026-08-13 — what landed 2026-08-15 was the frame-space verification it never had, plus two defects it found |
| U28b | two shipped; the near-miss size families still open with their reasons |
| C1, C3 | the composed-scenario half — see Tier C |
| ~20 claims in this file | **verified FALSE against the tree** — the table in SHIPPED.md is the durable record |

