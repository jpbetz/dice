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

**Track C is MECHANICS, opened and ruled on 2026-08-27**
([MECHANICS.md](MECHANICS.md)). Joe's read: the product is bad at
roll-and-lock and push-your-luck, and King of Tokyo's mechanic cannot be
played here at all. The cause is structural — **this system models a ROLL and
those mechanics are TURNS** — so it is a campaign, not a feature. His rulings:
**M1–M3 are in scope, M4 waits, and mechanics go before T15.** Coverage is now
a stated goal ([GOALS.md](GOALS.md) goal 16) with a family table that has six
open rows.

**Track C's rows in THE ORDER are keyed `M1`/`M2`, not integers.** The
integers 1–11 are taken, several by struck rows that keep their numbers as
history (C4: one owner per numbering namespace, and a reused number is how
that rule got written). They sit in priority position, which is what the
ordering means; their key is an identifier, not a rank.

**Two batches, 2026-08-15 and 2026-08-16, took nineteen entries off this file**
(record in [SHIPPED.md](SHIPPED.md)). What is left has a different shape:

1. **Track A has no data-loss hole, no ops hole, no accessibility hole, and no
   loose tail.** Restore ships, `/health` ships, the static handler serves the
   app, the seat picker is a real modal, and every item the first batch left
   behind is closed. What remains is one half-built feature, one structural
   bet, and a long design-first tail.
2. **Track B is BUILT and entirely blocked on Joe.** Tier W has no unbuilt
   step. **Seven** LOOK verdicts stand between it and done, plus two judgements
   no measurement can make. **The voices are no longer among them** — all ten
   were heard on 2026-08-18, eight are approved and one design was killed
   ([W6b](#w6b-the-listening--done-2026-08-18-no-audio-item-is-open)); one small
   unheard row (`IMPACT_VOICES.chime`) is all that is left of the audio queue.
   There is now a single
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
| ~~1~~ | ~~Joe's LOOK and LISTEN sitting~~ — **SAT 2026-08-18, all eight answered** ([the record](#the-sitting--sat-2026-08-18-and-it-is-the-day-this-tier-stopped-waiting)) | **The whole of Track B was gated on this and is not any more.** Four approvals (W7 ②, W5, W4, C25 Stage 2), one *not yet* (the grounded stump — *"still a set piece… nothing to make it feel rooted"*), two decisions that are now build items (`preferDice` ON, the standard dice wear `round .090`) and ten voices heard, eight needing work. **Cost him about an hour; five separate askings over the previous fortnight had produced one verdict.** Refill the page to eight and ask once — never drip-feed it. | done | B |
| ~~1b~~ | ~~**The re-asks the sitting created**~~ — **ALL THREE ANSWERED 2026-08-18 in a second sitting; the queue is EMPTY** (`794374d`, "Write the sitting page plainly, and empty the queue" — see `tools/verdict-sheet.mjs`, whose `ITEMS` is `[]` on purpose and whose header carries the record). **This row said three questions were open and stood for nine days after they were answered** — found 2026-08-27. The base shape was approved; the pale band at the foot is what is still unsettled, and its next step is the paint bisect, not another verdict. | ~~The stump's round 7, eight of the ten voices, and a re-listen.~~ Rendered then built, 12 frames, 0 missing, 0 stale, opened and read. **① W3 round 10's re-baked base** (with the pale band stated first, before the frames), ~~**② C30's pile** off the stills~~ — **answered 2026-08-17 without them, and the tuning shipped 2026-08-18** (row 6, [UX §7.61](UX.md)), **③ the two fae ground impacts** re-listened on the live table — the only item that is not answerable from the page. **`IMPACT_VOICES.chime` is deliberately NOT on it**: unheard is not rejected, and a question whose honest answer is "I don't know" costs him a click and buys nothing. Rebuild with the commands in [the note below](#the-sittings-page-is-rendered-then-built-in-that-order), which now point at the generator's header as the single copy. | ~15 min of Joe | B |
| ~~2~~ | ~~[**§2l ⑥'s RENDERING**](#2l-pool-analysis--①⑥-all-shipped-the-last-of-them-2026-08-17)~~ **SHIPPED 2026-08-17** | The curve of the total renders in `#pop-preview` on every ± door, plus a target clause in the one-line validator. §2l is now ①–⑥ complete; **it is owed a move to SHIPPED.md**, which this pass did not own. Its two live dependents are #4's sibling (§5's local statistics, now unblocked — `sumForecast(…).mean`/`.sd` are the expected term) and UX §2.1's `showOdds`, still deliberately unbuilt. | — | A |
| ~~3~~ | ~~C22's `room.setup` stamp~~ — **SHIPPED 2026-08-17** ([C22](#c22-a-versioning-contract-for-client-state--shipped-2026-08-15-closed-2026-08-17), UX §7.49 ⑥) | Not ~10 lines and not `maybeRepushTable`: the server **rewrote** the payload field by field, so the stamp needed `server.js` and `js/net.js` too, and the authoring writer is `portablePushToTable`. The three wrong claims are recorded in C22. | small | A |
| ~~4~~ | ~~§5 — roll-log export~~ — **SHIPPED 2026-08-17** ([§5](#5-capture-mechanisms), UX §7.49) | Plain-text transcript, `Copy` + `Download` in a log-flyout foot. `portableDownload()` was in `js/main.js`, not `js/portable.js`; **CSV was refused** and the reason is in UX §7.49 ②. | small | A |
| ~~M1~~ | ~~[**Touch a die**](MECHANICS.md)~~ — **SHIPPED 2026-08-28** ([the record](MECHANICS.md)) | Two bugs in it were invisible to a green check and only a rendered frame found them — the marker drew under a venue's fog, then under its floor, while the count said three were drawn. The second is W3 round 9 repeating, reintroduced in a comment that cited it. **The substrate the whole of Track C stands on, and it was stuck work already on this file.** There is no pointer→die path in the app at all (V5, re-checked 2026-08-17): the only canvas `pointermove` is CAMPEEK's hold-drag. Keeping dice between throws is a per-die choice by a human, so M2 cannot start until a human can point at one. Independently closes V5's blocked half and §7.1's physical pool building, both stalled on this same missing path. **Do it even if the campaign stops here.** | med | C |
| ~~M2~~ | ~~[**The throw becomes a turn**](MECHANICS.md)~~ — **SHIPPED 2026-08-28**, minus the player gesture ([the record](MECHANICS.md)) | Throw up to N times, keeping what you choose between throws. **Needs no goals change and no game knowledge** — it is what hands do at a physical table — and it makes Yahtzee, King of Tokyo, Farkle, Pig and Can't Stop playable with the human judging the bust. The large bet, and the one that beat T15 in a straight comparison on 2026-08-27. **Q2 answered 2026-08-28: visibility belongs to the TURN** — a held turn reveals once at the end, and no turn has an audience that sees throw two but not throw one. Nothing gates the build; M1 shipped the same day. | large | C |
| ~~M3~~ | ~~[**Faces that are not numbers**](MECHANICS.md)~~ — **SHIPPED 2026-08-28** ([the record](MECHANICS.md)) | A face-set registry behind the `glyph` seam that already exists (`js/dice.js:283`, where `glyph:'pip'` draws Vegas pips on a d6). Fudge first — three faces, no ambiguity — then King of Tokyo's six. **Closes ROADMAP §8**, which has been blocked on this exact line since it was written ("needs dice.js custom face sets"), and success counting rides the same work. Cheap enough to interleave; the chips and the log must learn glyphs too, or the *results readable* invariant breaks. | med | C |
| ~~M2b~~ | ~~[**Pick becomes keep**](MECHANICS.md)~~ — **SHIPPED 2026-08-28**; a turn is playable by a person ([the record](MECHANICS.md)) | A turn works end to end today only from the API or the debug seam: M1's pick path is dark and nothing wires a picked die to a kept one. **It is the smallest remaining piece of Track C and the one that makes any of it usable** — and it is keyed `M2b`, not M4, because M4 already names the procedure registry in MECHANICS.md — arm `PICK_DEFAULT_ENABLED`, name the verb, and give it the keyboard path M1 deliberately did not invent. Q3 (symbol dice: drawn glyphs or commissioned art) is still open and blocks nothing. | small–med | C |
| ~~M2c~~ | ~~[**The keyboard path to the dice**](MECHANICS.md)~~ — **SHIPPED 2026-08-28** | M1 deliberately did not invent a binding for an action that did nothing; M2b gave it one. There is now a gesture — keep this die — reachable only with a pointer, and *Always interruptible* says keyboard paths exist for the common actions. Small, and it needs a name for the verb more than it needs code. | small | C |
| ~~M4~~ | ~~[**Push-your-luck**](MECHANICS.md)~~ — **SHIPPED 2026-08-28** ([the record](MECHANICS.md)) | The item that moved GOALS goal 6. It turned out not to need a registry of games: `6d6 push>=5` DECLARES which faces score, so the app is literate in a dice convention and ignorant of every game that uses one. |
| ~~M6~~ | ~~[**The bag**](MECHANICS.md)~~ — **SHIPPED 2026-08-28** ([the record](MECHANICS.md)) | A cup you draw from. Never had a row in this table until it shipped, which is its own small lesson. It adds no new payload field — a drawn die is a dice SET, and `sets` was already per-die. |
| M5 | [**The decision is the beat**](MECHANICS.md) | The last unshipped row of Track C. A push turn now says what you are holding and what would score; what it does not say is what a re-throw is WORTH. `js/odds.js` can forecast and already refuses honestly where it cannot, and push-your-luck is the case that makes odds obviously worth showing rather than a crutch. **It may never advise** — GOALS' new invariant, "the procedure never plays for you". | med | C |
| M7 | [**Dice drafting**](MECHANICS.md) — DESIGN FIRST | Roll a shared pool, players take turns TAKING dice from it (Sagrada, Dice Forge, Quarriors). Queued 2026-08-28 at Joe's ask. **It is the first mechanic that breaks an assumption rather than adding to one:** every roll in this app belongs to exactly one player — `playerId` is stamped at birth in `executeRoll` and the whole visibility ladder hangs off it — and drafting needs a roll nobody owns that several people take from in turn. That is not a notation flag; it touches a roll's identity and brushes goal 10, which has always steered around turn order. **Design first, and the design has to answer who owns an undrafted die before a line is written.** | large, design-first | C |
| 5 | [**9d follow-up** — `venue` in the portable YAML](#9d-follow-up-venue-in-the-portable-yaml--tower-shipped-2026-08-17) | **`tower` SHIPPED 2026-08-17** ([UX §7.50](UX.md)) — `TABLE_KEYS` is `{name, felt, system, zoom, tower}` and a prepared table arrives with its tower up. What is left is GOALS' punt: how a **venue** rides the file. Shipping the tower alone exposed that a file can now prepare *half a fae venue*, which is the argument for sequencing this next. | small | A |
| ~~6~~ | ~~**C30 residual**~~ — **SHIPPED 2026-08-18** ([the record](SHIPPED.md), [UX §7.61](UX.md)) | `feltgrip+gate4` is what the table now runs: shake −30% to −43%, hops −14% to −32%, every pool faster, caps 1 → 0, clock 1.03×. It was refused for four passes on the sixth gate — piling, +6.3pp at close/6d6 with flat throws 33/40 → 23/40 — and **Joe overturned that**: *"Pilling is OK. If you throw a lot of dice, it's your fault if they pile up. Let's not try to prevent it."* Gate d is now a **heap floor** and the pile rate is a reported number. The LOOK this row was waiting for was never needed; the answer was a ruling, not a frame. | done | A |
| 7 | [**§3b L2**](#3b-the-lobby-and-the-table-flow--l4-shipped-l2-is-a-judgment-call) | **Decision record written 2026-08-17; recommends NO and needs Joe's yes/no.** The premise was stale: the peek has disclosed the display name of any seated player holding a profile since C17, and the join door renders them under a heading reading "At this table". A count's only new information is a player who published nothing. What the item actually owes is a corrected budget comment in `handleTableInfo` and the assertion that would have caught it. | small | A |
| 8 | [**U16**, **U21**, **C26**](#u16-draft-intent-in-the-well--designed-2026-08-17-ready-to-build) | **All three are DESIGNS now, not stuck items** (2026-08-17) — each was adjudicated, one stale sub-claim struck per item, and each has a smallest-first-commit named. C26's label is killed for good: the name wipe is load-bearing, so the gesture returns as **`Take a prepared seat…`**. U21 carries the one fact the UX audit predates — a player who collapses the rail inside a breakout has **no way back on screen**. | med, now buildable | A |
| ~~9~~ | ~~IDENTITY~~ — **the whole item is CLOSED 2026-08-17** ([IDENTITY.md](IDENTITY.md), UX §7.52) | **Rung 1 shipped**: `dice.who.v1` resumes a *lapsed* seat on the same `playerId`, which was also the fix for two bugs on no roadmap item — a held roll whose reveal died with its tab, and your own secret rolls vanishing from your own log. **B1's server half is killed** with a named defect (enrolment is an open keyword, so the entitlement is self-issued whoever carries it). **Rung 2 is closed by Joe's answer**: a stake that outlives its keeper is a different feature wearing goal 11's words, so a gone browser's held roll stays sweepable-unread by design — IDENTITY §7 is the paragraph to close any report of it with. | — | A |
| 10 | [**T15**](#t15-re-bake-the-three-classic-skins-through-the-forge--large-scoped-2026-08-14) | **DEMOTED 2026-08-27 behind MECHANICS M2, by Joe, on a straight comparison** — a re-baked skin makes an existing thing prettier, M2 makes the product cover a family it cannot play at all. Nothing decays while it waits. Owner-commissioned, explicitly not a side quest. **Un-queued 2026-08-18** — the reason it waited (seven outstanding verdicts) is gone. It is still three rounds that end at his eye, so it goes on the SAME page as #1b's re-asks rather than becoming a second queue. **Do 9c first**: T15 re-bakes the three classic skins, and 9c just changed what edge a standard die wears — baking three skins against the old edge would be three wasted rounds. | large | B |
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
read the killed list before re-proposing anything in this tier.*

> **THERE IS NO PINNED BENCH BASELINE, and this file said there was.** Two
> places cited `.claude/…/memory/perf-baseline.md` as the authority a perf
> change is judged against; `find` says no such file exists, and the directory
> it names holds fifteen other memories. Found 2026-08-18 by the 9c pass, which
> went looking for the budget its 3.4× vertex count had to fit inside — the one
> circumstance in which the citation mattered, and the file was not there.
> **A missing authority is worse than no authority**: it stops the reader
> measuring, and nothing fails when it is absent. Until one is generated, the
> budget claims that ARE real are the ones with a command beside them —
> `scene-draw-budget`'s `calls <= 220` in the suite, and
> `node tools/drive.mjs tools/steps/edge-price.mjs 40 d20` for geometry cost.

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

### 8. Special dice & success counting — Fate/Fudge SHIPPED 2026-08-28

**The blocker is gone.** This entry read "needs dice.js custom face sets" from
the day it was written; MECHANICS M3 built them, and `symbols.fate` is the
Fudge die (two plus, two minus, two blank). What is left: coins, the d100
paired-read display, and success-counting joining the system-profile registry
— which is a MEANINGS question now, not a rendering one.

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

**The edge question is CLOSED — Joe chose `round .090` on 2026-08-18** and it
shipped the same day (SHIPPED §9c, "the standard edge"). This entry was the
oldest open item in the file and its "waiting on Joe" line was the whole of
it; what is left is Tier 3 above, which is a different question (face
curvature, not edge width). Nothing here waits on anyone now.

Three things that entry got wrong while it waited, all worth knowing before
the Tier 3 work re-reads it:

- **The bench recipes live in `js/lab.js`, not `js/fae-lab.js`** — the
  `BENCH` table near the top. `js/fae-lab.js` is the venue lab and contains
  the string `bevel` zero times.
- **`std` was never a recipe.** It was the ABSENCE of one: `bevel` fell back
  to a module constant and `profile` fell back to `'cut'`, independently. So
  "make std wear round .090" could not be done by editing a `std` entry, and
  flipping the profile default would have re-cut five themed sets that state a
  bevel and say nothing about profile (focuscrystal's `0.02` means a lapidary
  CUT). The standard edge is now one frozen object applied as a unit —
  `STD_EDGE` in `js/dice.js` — to recipes that name neither field.
- **`.claude/…/memory/perf-baseline.md`, cited at the head of Tier 0 and in
  SHIPPED's Tier 0, does not exist.** There is no pinned bench baseline to
  measure a change against; what does exist is `scene-draw-budget`'s
  `calls <= 220` and the steps under `tools/`. Treat every "against the pinned
  baseline" phrase in this file as unbacked until someone writes that file.

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

### C30 residual. Deaden+grip — SHIPPED 2026-08-18

**The full record moved to [SHIPPED.md](SHIPPED.md) in the commit that shipped
it**, per CLAUDE.md. In one paragraph: `feltgrip+gate4` — grip + deaden + the
speed-gated damping — is what `PHYS` and `DAMPGATE` now hold. Shake −30% to
−43% on every pool, hops −14% to −32%, every pool faster, caps 1 → 0, clock
1.03×, and piling worse on all four cells (close/6d6 +6.3pp, flat throws 33/40
→ 23/40). It passed five of six gates for four passes and was refused on the
sixth; Joe overturned that on 2026-08-17 — *"Pilling is OK. If you throw a lot
of dice, it's your fault if they pile up. Let's not try to prevent it."* The
pile rate is now a reported number in settle-matrix and gate d blocks only on a
HEAP. UX [§7.61](UX.md).

The A/B is repeatable in both directions — the old tuning is the matrix's new
`classic` row:

```
node tools/drive.mjs tools/steps/settle-matrix.mjs 16 40 classic
```

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

**A third rule this ship earned.** A tuning change rewrites the film, so every
recorded expectation that pins one is a deliberate update — re-measured, never
adjusted by applying a quoted percentage. Seven sites were re-anchored here,
and the kind that does not look like a pin at all is **a seed chosen for an
outcome**: `pile-refusal` named two 6d6 seeds because they landed flat, and
`audio-phases` named one because a die on it was still turning after the bake
called it landed. The tuning broke both. A seed picked for a result is a
recorded film wearing a number.

**And three of the seven were found by the FULL sweep, not by reasoning about
the change** — the two `audio-phases` carriers and a camera rung. The
`physics,perf` tags alone would have missed the audio pair entirely, which is
the argument for the sweep being the gate rather than the tags.

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

Fixed 2026-08-17, and the fix is a refusal rather than a warning.

**THE RENDER COMMANDS LIVE IN THE GENERATOR'S OWN HEADER, not here.** They
change every time the queue is refilled — this block listed four steps for the
eight-item queue and every one of them was wrong within a day of the sitting —
so `tools/verdict-sheet.mjs`'s header is the single copy and this is a worked
example of the SHAPE. For the 2026-08-18 refill:

```
node tools/drive.mjs tools/steps/flare-look.mjs                              # the AFTER leg
git checkout 48bd128 -- models/towers/ \
  && node tools/drive.mjs tools/steps/flare-look.mjs tag=before \
  && git checkout HEAD -- models/towers/                                     # the BEFORE leg
node tools/drive.mjs tools/steps/grip-look.mjs 1000
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
  generated: 49 images, none broken, no console errors. Re-verified on the
  refilled page 2026-08-18 against the path that was newly watched: an
  untracked file under `models/` → 12 rows red, exit 1; removed → 12/0/0,
  exit 0.
- **`models` is watched too, since 2026-08-18.** A tower LOOK photographs a
  baked GLB, so for that row the model IS the code the frame shows; without it
  a re-bake could land while the frames stood still and the stamp would go on
  saying every frame was newer than every source that could restage it.
- What it still cannot catch: a frame carried in from a different tree. Only
  the steps writing their own provenance would close that, and they do not.
  **A step that exists is worth more than a rename that worked:** round 10's
  four flare frames were `rooted-<venue>-shipped.png` renamed by hand, which
  is a provenance record nobody can re-run and nothing can date — hence
  `tools/steps/flare-look.mjs`.

**So a page built before a batch lands is stale by the time the batch lands.**
Re-render after the merge, not before it.

### THE SITTING — sat 2026-08-18, and it is the day this tier stopped waiting

**Joe went through the page and answered all eight items in one pass.** His
words are kept verbatim below because they are the specification for
everything they opened, and because this is the first end-to-end judgement
this venue work has ever had. Record and consequences in
[SHIPPED.md](SHIPPED.md).

| # | item | verdict | his words |
|---|---|---|---|
| 1 | W7 ② the staging | **approve** | *"Focus is the dice. This looks perfectly fine."* |
| 2 | W5 the living layer | **approve** | — |
| 3 | the round-6 grounded stump | **not yet** | *"It's still a set piece in my eyes… nothing to make it feel rooted."* |
| 4 | W4 the Witchlight set art | **approve** | — |
| 5 | the ten voices | heard, 8 of 10 need work | see [AUDIO.md](AUDIO.md) §9 |
| 6 | C25 Stage 2's location | **approve** | — the build's arithmetic refusal stands |
| 7 | C27 the cropped felt | **turn `preferDice` on** | |
| 8 | 9c the standard dice edge | **`round .090`** | the soft candidate, not the ceiling |

**Four approvals close four items** (W7 ②, W5, W4, C25 Stage 2) — including
one this file was deliberately withholding: the W5 re-ask, recorded as *"never
actually asked"* rather than banked off the W7 verdict, was asked properly and
answered.

**Three verdicts are WORK, and the two-word ones are the biggest:** ⑦ and ⑧ are
each a single instruction with a measured complication behind it (⑦ gains 0 px
at 390 and was measured as a *loss* at 40d6; ⑧ triples the vertex count of every
die), and ③ is a re-do of the thing round 6 was already for.

**The lesson for the next sitting: eight verdicts cost him about an hour and
un-blocked an entire track.** Five separate askings over two weeks had produced
one. The page is the mechanism (`shots/verdicts.html` — see
[the note above](#the-sittings-page-is-rendered-then-built-in-that-order)), and
the queue is *refilled and asked once*, never drip-fed.

#### REFILLED 2026-08-18 — and it is THREE items, not eight

Everything the sitting opened has been built and deployed (`/health` reports
`bcdb78a88300`). What is genuinely open is three, and the page is short on
purpose:

| # | item | the question, in his agent's own words |
|---|---|---|
| 1 | **W3 round 10** — the Hollow Bole's re-baked base | *"the foot no longer tucks under itself and the roots no longer end together — is the base a better shape, even though the pale band is still there?"* — and the page says the pale band is still there in its FIRST sentence, before the frames |
| ~~2~~ | ~~**C30's pile**~~ — **ANSWERED 2026-08-17, SHIPPED 2026-08-18** | He did not need the stills. *"Pilling is OK. If you throw a lot of dice, it's your fault if they pile up. Let's not try to prevent it."* The tuning shipped, gate d became a heap floor, and this row is closed — [UX §7.61](UX.md). **The lesson for the next page: the question was answerable in a sentence and had been queued as a LOOK.** Ask which it is before you spend a render. |
| 3 | **the two fae ground impacts, re-listened** | not a frame — two clicks on the live table. The ringing die is deleted; the venues keep a trim that only darkens, so a fae landing is a third of an octave darker than the grounded table **by design**, not as a leftover |

**"Refill it to eight" is a rule about not drip-feeding, NOT a quota.** Three
questions that are all real beat eight where five are invented, and re-asking
something he has answered is how a queue stops being trusted. **Deliberately
NOT on the page:** `IMPACT_VOICES.chime`'s unjudged re-voice on three
grounded-table sets. It is *unheard*, not rejected, on sets nobody has
complained about, and the honest answer to "is this right?" about a sound he
has never had a reason to play is "I don't know" — which costs him a click and
buys nothing. It stays a named row in
[W6b](#w6b-the-listening--done-2026-08-18-no-audio-item-is-open) for a future
listening pass.

**What the last sitting CLOSED is rendered at the top of the page**, above the
queue, with no verdict control on any of its rows. The page's own argument for
sitting again is that the queue went from eight to three, and an argument
nobody can see is not an argument.

### W7 ②. The staging — SHIPPED 2026-08-13, VERIFIED 2026-08-15, **APPROVED 2026-08-18**

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

*Five claims in docs/AUDIO.md were false against the code and are corrected in
place — including `perHitBufferAllocs` "must stay 0", which actually reads 2
whenever the bed is up and is 0 in every scenario only because ambience
defaults off.*

### W6b. The listening — DONE 2026-08-18. **NO AUDIO ITEM IS OPEN.**

*This entry said "what is left is LISTENING, and it is #1 in THE ORDER". It was
sat twice in one day and there is nothing left to ask. Record:
[SHIPPED.md](SHIPPED.md) and [AUDIO.md](AUDIO.md) §9.0 / §9.0b.*

**Eight voices APPROVED** — *"All other audio sounds good"* / *"Everything else
is fine"*: the three room beds (with their ×5 level fix, the `u^1.6` tick law,
the **pitched** fae drips and the new swell layer) and all five tower clunks
(the Heartwood/Bastion swap, Black Anvil's new `bell`, and the two that were
already good). **The first sign-off this palette has ever had.**
`tests/voices.test.mjs` freezes them as `APPROVED_2026_08_18` with equality
assertions — a verdict costs an hour of Joe and cannot be re-derived.

**One design KILLED — the ringing die** (C1/C2/C3). *"When the dice hit the
ground it sounds horrible in the two venues… just use a normal sound."* The
Witchlight set's `sound: {body: 'chime'}` recipe is deleted, so the fae venues'
dice land on `IMPACT_DEFAULT_BODY` — the ordinary knock. **The named defect:**
*a resonant, partial-bearing body is a bell, and a landing here is never struck
once* — one die brings a sine partial plus a five-tap settle cluster inside
145 ms, times every die in the pour, so a voice that is an event at one strike
is clanking at forty. It had already been re-tuned once for *"far less sharp"*
(3400 → 1750, Q 2.8 → 1.5, −37% centroid) and he rejected that too, which is
what makes this a kill rather than a third attempt.

**Two things a follow-up pass should NOT re-open:** the venues' `ground` trims
(zeroing them would have made the rejected voice *brighter* — 1745 → 2344 Hz —
so they were never implicated; the remaining cost is that a fae landing is a
third of an octave darker than a grounded one, and that is Joe's one lever if
he wants it) and the **fae bed drips**, which this pass nearly deleted on a
well-evidenced misreading and which are now frozen as approved.

**The one audio thing still unheard, and it is small:** `IMPACT_VOICES.chime`
survives for three grounded-table sets (seaglass, sealed resin, focuscrystal).
Its 3400 → 1750 re-voice was commissioned by the caller that has just been
deleted, so those three now carry an unjudged change. **One row for the next
listening page** — not a blocker for anything.

### W3 round 9. The stump is rooted — SHIPPED 2026-08-18, **LOOK SUPERSEDED by round 10**

Joe's round-8 verdict on the grounding work, verbatim: *"It's still a set piece
in my eyes… nothing to make it feel rooted."* **It was one number, and it was
not on the model.**

`js/towerhollow.js` had always built AO layer (d) — the pair of unlit contact
quads every code-built skin carries — at **y 0.006**, authored against the FELT
at y 0. `js/fae-lab.js` stands the glade's ground at **y 0.02** and its clearing
detail at **0.035**. So in the only venues this tower is ever raised in, its
contact shadow was under the floor, and had been since the venue shipped. Every
proof stayed green for five rounds because **no proof in this repo had ever
looked at the ground.** Rounds 4, 6 and 8 spent themselves re-painting, growing
and then deleting geometry on the OBJECT.

Measured at the resting eye, before: hiding the entire twelve-unit stump changed
**0.058%** of the moonrise frame outside its own footprint (0.034% foxfire), and
the ground *brightened* to **1.95×** approaching the foot. Shipped: the ring
follows the model's footprint and the re-bake takes the flare's own value down
(`flare/ground` 1.32 → 1.13, geometry digest and triangle count unchanged, so
the film provably did not move).

| gate (`tools/steps/rooted.mjs`) | rejected | shipped moonrise | shipped foxfire |
| --- | --- | --- | --- |
| G1 seam — median R, k 4..18 (≤ 0.78) | 0.998 | 0.732 | 0.766 |
| G2 reach — first k with R ≥ 0.96 (≥ 70 px) | 4 | 143 | 139 |
| G3 depth — Σ(1−R) (≥ 18 px) | 0.06 | 22.5 | 19.5 |
| G4 no rim (≤ 0.025) | 0.000 | 0.000 | 0.000 — a declared FLOOR |

**NOT open, and it was never answered on its own terms — round 10 replaced the
question before it was asked** (deliberately: a superseded frame in front of him
is how a queue starts getting ignored). Its reservation *was* round 10's brief,
round 10 shipped, and Joe approved the base shape on 2026-08-18. Corrected
2026-08-27, when this heading still read "LOOK OPEN". The frames it was going to
ask with: `shots/rooted-before-{moonrise,foxfire}-resting.png` →
`shots/rooted-after-{moonrise,foxfire}-resting.png`, the resting eye, four
frames. One reservation worth his eye and the gates cannot answer it: the root
flare is *less* bright than it was but it is still the lightest structure near
the ground, and the next lever on it is the shape of the flare rather than its
paint. Foxfire clears G1 by 0.014 — the tightest number in the round.

**Two debts this turned up, both real and neither in scope here:** `nullstone`
is a bare `towerGlbSkin` row with no dressing file and therefore **no AO layer
(d) at all**; and T15's re-bake of the three classic skins would drop theirs
unless whatever replaces `buildTowerSkin` carries the layer over. Both are in
docs/TOWER.md under AO LAYER (d).

*(Latent, not live: `DECAL_Y` is 0.021 — dice-impact marks on the felt would be
z-fighting the glade ground at 0.02 and buried under the clearing detail at
0.035. `DECALS_DEFAULT_ENABLED` is false, so nothing ships broken; anyone
turning them back on inherits the same floor problem.)*

### W3 round 10. The flare is re-baked — SHIPPED 2026-08-18, **LOOK ANSWERED 2026-08-18** (read ⑤ first)

Joe on round 9's frame: the flare "is still the lightest structure near the
ground", and the next lever is **the shape, not the paint**. He and the reviewer
answered that independently and the same way, so this round was a BAKE and was
forbidden to touch a colour.

**It was a bell, and that is arithmetic rather than taste.** Three separable
terms shared one envelope in y — a buttress web held OFF the soil by round 2's
shoulder, one foot envelope for all six roots, one finger envelope for all
seven, and a sill apron that was a lens with its maximum in mid-air. Measured
at the resting eye's arc:

| gate (`assert_the_flare_is_not_a_skirt`, on the built mesh) | round 9 | shipped |
| --- | --- | --- |
| headings widest ABOVE the soil, of those with a flare | **13 of 13** | **0 of 10** |
| tuck under the maximum at ±50° | 0.44 | — |
| knee spread (p90−p10 of where the roots turn in) | 0.20 | 0.60 |

The re-bake: one `grip` per root split between web and foot (so neither has to
be staggered in height to stay inside the mat wall), a per-root shoulder ladder
0.38…1.42 with the two front diagonals carrying the wood the deleted sill apron
used to, per-finger shoulders, and bays that close at their own neighbours'
heights instead of at one. **Portals bit-identical** (in 0/9.40/−2.55/2.20, out
0/1.00/4.20/3.50), throat 25/25, approach 25/25, occlusion 99/99 cowl and shaft
at all six eyes, sill holes 0/2304, lane clad 0/162 and 0/81, 7258 tris.
`rooted` unchanged in both venues (moonrise G1 0.733 / G2 141 / G3 22.2;
foxfire 0.766 / 138 / 19.2).

**⑤ THE RUFFLE IS STILL IN THE FRAME.** The gates are green and they are not
the answer. Hiding groups one at a time at the resting eye
(`tools/steps/flare-probe.mjs`) proves the band is `towerSkinBoleShell` and
nothing else — but three separate changes to the shell's outer radius field
(root envelopes, bay ceiling, base-band grain frequency) each moved the field
measurably and **none moved those pleats**. Most likely the wound's own lower
cut face: radial by construction, pale by design, level by construction. The
instrument this round wanted is a **paint bisect** — one diagnostic bake with
each surface class at a flat separable colour. Ten minutes, and it replaces
three bakes of guessing. Next round does that before touching geometry.

**ANSWERED 2026-08-18, in the second sitting: the base shape is APPROVED and
settled.** The pale band is not, and its next step is the paint bisect above —
a diagnostic bake, not another guess and not another verdict. *(This paragraph
read "OPEN, and it is Joe's" until 2026-08-27, nine days after he answered it.
The record was in `tools/verdict-sheet.mjs`'s `CLOSED_LAST_SITTING` the whole
time; the roadmap was never re-read against it.)* The ask that was put to him: *the foot no longer tucks under itself
and the roots no longer end together — is the base a better shape, even though
the pale band is still there?* If the answer is "the pale band IS the
complaint", that is the paint bisect's round and this one bought the ground
under it.

The frames are `shots/flare-{before,after}-{moonrise,foxfire}-{resting,foot}.png`
and they are **taken by `tools/steps/flare-look.mjs`**, not by hand. This round
made them by running `rooted.mjs`, keeping `rooted-<venue>-shipped.png` and
renaming it — twice, with a GLB swap between — which is a provenance record
nobody can re-run and the freshness guard cannot date. Two commands now, and
the BEFORE leg swaps the MODEL rather than the code (`git checkout 48bd128 --
models/towers/`), because this round was forbidden to touch a colour and the
A/B has to keep that true. The `-foot` pair is the same frame magnified, with
the crop box derived from the built mesh's own world footprint through the live
camera — the base is what the question is about and it is a third of the room's
width in the wide frame.

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
| C6–C10, C16–C21, C23, C30–C33 | SHIPPED.md; C24's binding measurement stays here. **C30's one unshipped rung shipped 2026-08-18** and its record moved too — what is left here is a pointer plus `C30b` and the three rules that bind a future physics claim |
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

