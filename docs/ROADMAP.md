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
   step. Five LOOK verdicts and **ten** unheard voices stand between it and
   done, plus two judgements no measurement can make. There is now a single
   page that turns all of it into one sitting — **`tools/verdict-sheet.mjs`
   builds it; see [#1](#the-order)** — which makes the queue the cheapest
   high-value hour in this file and the reason it stays at the top.
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
| 1 | [**Joe's LOOK and LISTEN sitting**](#tier-w--the-first-fantasy-venue-the-fae-set--built-the-look-and-the-listen-are-joes) | **Not a build item, and that is why it is first.** Tier W is finished except for being *seen and heard*; five verdicts and ten voices gate it, and nothing on Track B advances until they move. One page now carries every frame side by side with the question each answers, and `docs/AUDIO.md` §9 is ten rows of two clicks. Rebuild it with `node tools/verdict-sheet.mjs`. | ~1 hr of Joe | B |
| 2 | [**§2l ⑥'s RENDERING**](#2l-pool-analysis--⑤-and-⑥s-engine-shipped-the-rendering-is-the-open-half) | The engine landed 08-16, proven four ways, 5.5 ms worst case — and is **inert**: `kind:'sum'` is matched nowhere, so nothing renders. Goal 4 names summing as toil the system owes the player, and the app still cannot say a word about `4d6dl1`. The smaller half of the work and the whole of the payoff. | med | A |
| 3 | [**C22's `room.setup` stamp**](#c22-a-versioning-contract-for-client-state--shipped-2026-08-15) | Half a contract is worse than none. The stamp must come from the WRITER (`maybeRepushTable`); a stamp only the server writes is a stamp nobody can trust. ~10 lines once someone owns that site. | small | A |
| 4 | [**§5** — roll-log export](#5-capture-mechanisms) | Goal 7's last uncapturable surface: the online log cannot be copied or downloaded. Reuses `portableDownload()`. The half of §5 that does **not** wait on #2. | small | A |
| 5 | [**9d follow-up** — `tower` in the portable YAML](#9d-follow-up-tower-and-venue-in-the-portable-yaml) | `TABLE_KEYS` is still `{name, felt, system, zoom}`, so a prepared table cannot arrive with its tower up. Ship `tower` alone; GOALS punted how a venue rides the file. | small | A |
| 6 | [**C30 residual** — deaden + grip, sleep off](#c30-residual-deaden--the-only-lever-that-touches-the-dithering) | The best shake and hop numbers measured anywhere on this table, failing four of six gates. Grip recovers 70% of the glide and **has never been run with sleep off**. The pile's untried lever is spawn geometry — **which moved on 08-15**, so the pairing is genuinely worth re-running now. | med | A |
| 7 | [**§3b L2**](#3b-the-lobby-and-the-table-flow--l4-shipped-l2-is-a-judgment-call) | Judgment, not plumbing: should the pre-join peek say how many people are here? Runs straight into `handleTableInfo`'s deliberate privacy omission. | small | A |
| 8 | [**U16**, **U21**, **C26**](#u16-draft-intent-in-the-well--design-first-medium) | The design-first trio, stuck for one reason each: no carrier for intent in the live draft; the collapsed rail deletes multiplayer; `Change seat…` wears a seat-shaped label on a name-wiping verb. | med | A |
| 9 | [**B1** / identity persistence](#tier-b--the-closed-beta) | The structural bet whose bill arrived: `dice.name.v1` is origin-global and `playerId` is minted per-join, both load-bearing for **authority** and **routing**. Now the oldest un-actioned item here. | med | A |
| 10 | [**T15**](#t15-re-bake-the-three-classic-skins-through-the-forge--large-scoped-2026-08-14) | Owner-commissioned, explicitly not a side quest. **Queued behind #1** — its bar is Joe's eye, and starting three more rounds while five verdicts are outstanding lengthens the queue instead of clearing it. | large | B |
| 11 | [**§4b**, **V3–V5**, **U28b**'s near-misses](#4b-visibility-refinements) | The tail. Real, none urgent, several one-line. | small each | A |
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

### 2l. Pool analysis — ⑤ and ⑥'s ENGINE shipped; **the RENDERING is the open half**

Full detail: [POOL-ANALYSIS.md](POOL-ANALYSIS.md). ①–④ shipped 2026-08-06; ⑤
the ledger sheet 2026-08-15 (UX §7.44); **⑥'s math floor 2026-08-16** —
`sumForecast(dice, mods)` in `js/odds.js`, supplied by `SYSTEMS.dnd` and
`SYSTEMS.none` through one shared `sumForecastFor`.

**It is wired and INERT.** `kind:'sum'` is matched nowhere in `js/main.js`, so
both call sites still fall through to the shipped `fmtPreview` line. Nothing
renders differently today. **That is the open work**, and it is the smaller
half:

- Three things the renderer must not re-derive: `sumAtLeast`/`sumAtMost` are
  the only place cdf arithmetic belongs (they return **`null`** on a refusal,
  so nobody prints `0%` for "we don't know"); a refusal still owes the
  min/avg/max line **beside** it, never instead of it — `previewOf` is still
  exact for the average of `8d8+2d20 kh4` whose curve cannot be drawn; and
  `values` is **sparse** (`1d6!` has no total of 6).
- `#pop-preview` is asserted **22 times** in the suite, so a rewrite of that
  node breaks tests by design. Read them first.
- POOL-ANALYSIS §9's four rendering questions got **sharper, not answered**:
  which popover doors forecast · what a pool-scope forecast forecasts, given
  `stageGroup` drops mods while the rail rolls them · the offer card · UX
  §2.1's odds line.

**Three typed refusals, and they are the load-bearing part**: `mixed-keep`,
`reroll-cap`, `explode-cap`. Two corrections came with them, both of which
would have shipped wrong numbers:

- **The detector POOL-ANALYSIS prescribed is insufficient, and the
  counter-example is one paragraph above it.** `new Set(spec.dice).size === 1`
  waves through `21d20 adv kh3` — one *type*, two *distributions*, because the
  advantage cap pairs only 19. The shipped detector compares the counting
  **pmfs**.
- **Advantage-with-explosion is not a gap at all.** The adv loser is
  `counts:false` before the explosion loop runs, so only the ordinary slot
  budget bites. It is exact and pinned against enumeration, where the roadmap
  had assumed a blanket refusal.

Proven four ways (exhaustive enumeration of `composeRoll`; published closed
forms nobody here derived; agreement with `previewOf`'s independent
order-statistic path; seeded Monte Carlo at 5σ), 108 checks. **Worst legal
case `40d20 dl1` = 5.5 ms warmed**, against the ~110 ms POOL-ANALYSIS
predicted — its conclusion strengthens rather than weakens. `node
tests/sumread.test.mjs --bench` reproduces the table.

**GOALS: 4** (goal 4 names *summing values* as toil the system owes the
player) · **5** · **6** · **7** · **12** closed by the session-only ruling.
Still the blocker on §5's local statistics, which have no source of an
*expected* value without it.

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

**L2. Arriving (CUJ3) — mostly shipped, needs a judgment call.** The pre-join
peek shows the table name and the prepared seats (`GET /api/table`), and C10's
offer banner serves a returning player after the join. What is left is
judgment, not plumbing: whether the peek should also say **how many people are
here** (roster count is live presence, cheap, and answers "did I follow the
right link?"). Note the constraint C10's first attempt found the hard way —
`handleTableInfo` deliberately omits the roster (server.js — *"No players, no
roster, no log, no offers"*), and that is a privacy decision, not an oversight.

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

- **Roll-log export** (copy/download text + CSV) — the online log is currently
  uncapturable. Reuses G1's `portableDownload()` rather than inventing a
  second save path.
- **Local roll statistics** (per-player distribution, average-vs-expected) —
  the OBSERVED half, and a **dependent of §2l**, not its sibling: §2l's engine
  is the only source of an *expected* value in the tree. Second blocker:
  online the client persists no log at all (`if (!netOnline) save(LS_LOG,
  log)`), so there is no durable substrate for a per-player distribution yet.

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

### 9d follow-up. `tower` and `venue` in the portable YAML

Verified open 2026-08-14: `TABLE_KEYS` in js/portable.js is
`{ name, felt, system, zoom }`. A prepared table cannot arrive with its tower
up or its venue set — the one place these settings are not treated like their
neighbours. **Note GOALS' punt** (2026-08-15): *how a venue rides the portable
YAML and the room settings* is explicitly deferred, so shipping `tower` alone
is the coherent smaller move, and `venue` waits on that ruling.

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

### C22. A versioning contract for client state — SHIPPED 2026-08-15

`js/schema.js`, one `ver: 'E.M.m'` string on the store, the portable file and the
crash report. **One half is open and it is not small:** `room.setup`'s stamp must
come from the WRITER (`maybeRepushTable`), and a stamp only the server writes is a
stamp nobody can trust. ~10 lines once someone owns that site.

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

### C26. `Change seat…` — WITHHELD, owes a design before it returns

Hidden unconditionally since 2026-08-09 (`touch-doors` pins the hide). The
button, its handler and `leaveTable()` all stay: the function is still the
only scripted door to a `netOnline === false` state mid-scenario, and
un-hiding is one boolean.

**Why it was not thought through.** The verb reads as "sit somewhere else at
this table", and what it does is drop the seat, **delete `LS_NAME`**, and
re-enter `initNet()`. The name deletion is the part no one would predict from
the label — §3b/L3 split it out of `Leave & switch seat` precisely so that
"the seat belongs to the table; the NAME is yours and comes with you"… and
then left the name-wiping verb wearing the seat-shaped label.

**What it owes before it comes back:** a decision about what "change seat"
means when seats are *prepared characters* (PROFILES) rather than places at a
table. Swapping which prepared seat you occupy is a real and useful gesture,
and it is not "drop everything and rejoin". If that is the verb, it belongs
next to the profile picker, not under a menu item that also deletes your name.

### C27. The framing target was never the dice — **INSTRUMENT SHIPPED, THE CALL IS JOE'S**

**The spine still stands:** `framingPoints` returns four corners at `y = 0` — a
floor-plane frame in a world with height — so "the mat is on screen" was only
ever a proxy for "the dice are on screen", and it diverges exactly where the
stacking is worst. Rung 1's descent and the portrait quarter-turn shipped in
the immersion wave; containing the mat was priced and declined at ~24% of die
size.

**The residual is a COMMAND now, not a date:**
`node tools/drive.mjs tools/steps/frame-residual.mjs`. Die span in px, 5 seeds
a cell, `preferDice` off and on read from ONE settled throw so the delta is the
camera and provably nothing else. Seed #1 of each cell is the seed the old
table used (`3d6` 7002, `6d6` 7004, `40d6` 7007, …), the rest +1000 apart.
Measured 2026-08-17 at zoom `medium`:

| pool | phone 390 | iPad-p 834 | desktop 1600 |
| --- | --- | --- | --- |
| 1d20 | 215 → 239 [191..266] · fires 2/5 | 119 → **351** [306..405] · **5/5** | 200 → 246 [200..287] · 4/5 |
| **3d6** *(the canonical Soul Deal roll)* | 73 → 74 [71..113] · 1/5 | 119 → **199** [184..242] · **5/5** | 200 → 200 [200..253] · 2/5 |
| 6d6 | 62 → 68 [62..91] · 3/5 | 119 → **159** [119..227] · **4/5** | 200 → 200 · 0/5 |
| 12d6 | 59 → 63 [59..69] · 2/5 | 119 → 119 [119..168] · 1/5 | 200 → 200 [200..235] · 1/5 |
| 20d6 | 59 → 59 · 0/5 | 119 → 119 · 0/5 | 200 → 200 · 0/5 |
| 40d6 | 59 → 59 · 0/5 | 119 → 119 · 0/5 | 200 → 200 · 0/5 |

**THE TABLE THAT WAS HERE WAS TWO INSTRUMENTS UNDER ONE HEADING, and it did
not drift — it was wrong on the day.** The tree at `c29d429`, the commit that
wrote it, runs the step above to numbers byte-identical with today's. Its phone
and iPad columns are `frame-small`'s GATED `preferDice` readings and they
reproduce exactly, every digit. Its desktop column is `frame-price`'s UNGATED
probe grid — and not even one column of that: 3d6's `245` and 40d6's `184` are
`land 1.0`, while 6d6's `236` is `land .55`, **a different option's column**
(its `land 1.0` is 221). What `preferDice` actually does on those three seeds
is 253 · no change · no change.

**So "it makes 40d6 worse" is struck, and it was never a thing the option can
do.** Rung 2 is kept only if it beats rung 1 by `FRAMING.gain` (1.15), so the
instrument returns rung 1's span or a bigger one and nothing else. Over 90
paired throws: **0 shrank, 0 lost a die, 30 fired.**

**And "at 390px it gains nothing at all" is half struck.** The MEDIAN phone
throw still gains nothing (1.00 at every pool but 6d6, which is 1.06) — but 8
of 30 phone throws fire, at +6% to +69%, and the reason given here was wrong
twice. The cluster for 3d6 is 3.5×6.2, not 3.9×3.0, and the ladder is NOT
"correctly declining to act": on a phone it is already at rung 2 for every pool
up to 12d6, which this entry's own prose says two paragraphs up.
**`preferDice` is two options wearing one name** — where the mat fits it runs
rung 2 and crops the felt; where the mat does not fit (every phone) rung 2 is
already running and all it changes is `computeFraming`'s ORBIT tie-break, from
"completeness" to "completeness, then size". That second half is what
quarter-turns a table, **including a DESKTOP**, and nobody has looked at it.

**Where the win actually is: the tablet, and only the tablet.** iPad portrait
fires 5/5, 5/5, 4/5 on 1d20 / 3d6 / 6d6 at 1.34×–2.95×. Desktop fires 7 of 30
and turns the table when it does — the same roll, two orientations, decided by
which way the dice happened to settle, because desktop's gain sits astride the
1.15 gate (rung2 1.09–1.23) where the tablet's does not (1.31–3.40). **A coin
flip is worse than either answer.** The camera is per-viewer — that is what
makes it safe to vary by device where the MAT never can (C24) — so the honest
shape of the decision is not on-or-off but a **device split**: on for the
tablet band, off on desktop until the flip is fixed, near-no-op on a phone.

*Cheap lever, argued and deliberately not made: the desktop coin flip is
`FRAMING.gain` at 1.15 sitting inside desktop's distribution. Raising it makes
desktop consistently off and leaves the tablet untouched — one constant, buying
the device split with no device gate. Worth measuring before anyone writes one.*

**It therefore still ships as an instrument, not a default.**
`__diceDebug.setFraming({ preferDice: true })` (add `floor: 0.55` for the
aggressive version) is inert, and `framing-instrument-is-inert` pins that.
**The question is still not measurable and still his — but it is a different
question now:** not "is +23% worth a loss at 40d6" (that trade does not exist),
but **"is a 1.67×–2.95× tablet frame worth losing the felt on small rolls, and
may a desktop table turn?"** Roll 3d6 then 6d6 then 40d6 with it on, at a
tablet width.

**The rail, not the camera, is the phone's real lever** — a 390px phone gives
the felt 278px — but the two only pay off together: a full-width felt makes the
mat *fit*, which sends the frame back to rung 1 and makes dice **smaller**
(85 → 66).

**THE RULE this entry named, in its FOURTH shape — *nothing fails loudly when a
stand-in stops standing in*.** `SHELF_SLOT_W` stopped tracking `TABLE_W` (C25).
The spawn-spread comment stopped tracking the mat (C28 ①). The framing TARGET
stopped tracking the thing it stood for. And now the entry's own EVIDENCE: a
probe reading wearing an instrument's label, for two days, load-bearing on a
shipping decision. The verification run at the time ("every span matches the
pre-change run") **could not** catch it — it compared the shipped frame, which
is bit-identical by construction when the option is off, and never asked
whether the ON column came from the option. **A number somebody will later
quote gets a command, not a date.**

*Also refuted while re-measuring: the suspicion that spawn geometry moved these
numbers. At `medium` — the zoom every C27 figure is taken at — 0 of 30 throws
is born inside a wall under either formula, and the three archived seeds clear
by 0.13/0.21/0.14, so the two are bit-identical on the exact throws in
question. The instrument is not blind: the same probe at `close` catches 3 of
16 wall births, reproducing C28 ①.*

*One thing found in passing and recorded nowhere else: on desktop at 40d6 with
`preferDice` OFF, 39 of 40 dice are on screen on 2 of 5 seeds, mat fitting.
Rung 1 guarantees only the DECIDING die, so a piled non-hero die can be cropped
at rung 1 on a desktop. Consistent with the shipped design; simply never
written down.*

### C28. Two more things the zoom ladder left behind — SHIPPED 2026-08-15

Both. The spawn clamp asked the wrong axis and **16 of 144 throws started a die
through the z-wall**; the deferred room change now flushes on the predicate, because
there were **four** release paths, not the two named. Two of this entry's claims were
wrong — see SHIPPED.md.

### C29. The static handler serves the repo, not the app — SHIPPED 2026-08-15

Allowlist of roots. **This entry's "no credential or config exposure, verified path by
path" was false in two ways** and one of them was serving `deploy/config.mk` with the
billing account in it to any local reader — see SHIPPED.md.

### C30 residual. Deaden — the only lever that touches the dithering

*The settle campaign shipped (C30e's displacement terminator + `allowSleep
false` + the tempo curve + `pileScale`, 2026-08-11). Full five-pass record in
SHIPPED.md.* One rung is measured, wins big, and has never landed:

**`deaden+sleepoff+gate4` buys shake −21% to −34% and hops −19% to −40% — the
best numbers measured anywhere on this table — and replays 16/16.** It fails
on duration (8d6 +57%), piling (medium/6d6 +8pp, flat throws 33/40 → 16/40),
clock 1.64× and creep +45%. **Four of six gates fail; glide and pile are the
two nobody has an answer to.** Grip was measured to recover 70% of the glide
(C30c) and has **never been run with sleep off** — that is the untried
experiment. The pile's untried lever is spawn geometry (see
[C28 ①](#c28-two-more-things-the-zoom-ladder-left-behind--shipped-2026-08-15)),
not the nudge — `NUDGE.pileScale` was measured and takes a die off the pile
once in 24 seeds.

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

### U16. Draft intent in the well — DESIGN FIRST, medium

*Audit A5 (moderate).* `renderTray` builds chips and the cue and nothing else,
so `2d8 check dc15 w:Ann # The Duel` is pixel-identical to bare `2d8` — and
with Notation off (the default), the only ways to see the dc, moment, comment
or whisper are ± (which hides the dc, per U11) or turning the box on. Saved
pools got notation carriage precisely so a stored roll could not lie about
itself; **the live draft — the object you are about to spend — has no carrier
for intent.** It interacts with the cue band and the heat ladder, so design
before code.

**Rider — `#verdict-subtitle`.** The verdict card has **no subtitle element**,
under any system, for any notation, so `# The Duel | Charisma` declares its
subtitle on the intent card and the dock strip and then loses it at the
verdict. U17 deferred it deliberately: a **missing element, uniform across all
three profiles** — not a gate, not part of the stake/arithmetic conflation.
Adding it means new markup, new CSS and a third small line between the eyebrow
and the answer on a card whose whole virtue is *the name, the answer, the
exits*. That is a hierarchy call. It is the one residual asymmetry in UX.md
§7.24's eight-surface table.

### U17 residuals — ALL THREE STALE, closed 2026-08-15

Every one was fixed in `68fdc7a` — *the commit that wrote §7.24* — and neither the
entry nor §7.24's own *Not closed* paragraph was re-read against the diff beside it.
Kept as a record because that is the failure mode this file keeps paying for.

### U20. The shelf's read at rest, and the peek's lifetime — SHIPPED 2026-08-15

Folded into C25 Stage 2. The peek now retires on a new roll, on a ceremony and with
the log. **The `body.mini` bullet was not reproducible** and a different occlusion is
open in its place — see the new findings below.

### U21. What the launcher owes the table — DESIGN FIRST, medium

*Audit E3 (moderate).* The collapsed rail deletes multiplayer: roster, chairs,
Invite, nameplate and offer verb are all expanded-only, and the sole
browse-mode signal left is `opacity:.68` on the chip with no roster to compare
against. §7.4's launcher carve-out covers *offering*; it does not cover
*presence*. Meanwhile `poolsOwner` survives collapse (nothing in `applyPanels`
clears it), so you can collapse out of Bob's rack, see no signal, and expand
straight back into it — and with the Pools *section* off, clicking a teammate
pill flips `aria-pressed` and changes nothing on screen. Related and worse:
the collapsed rail lists *your* `groups` unconditionally, so during a profile
swap that is Alice's pools, unlabelled, rolling under your name.

**Decide the minimum social state a launcher owes.** At least: a browse-mode
signal, and clearing `poolsOwner` on collapse.

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
**4px**. See SHIPPED.md, *U28b — the expanded rail foot*. All four measurements
in the original entry were re-taken first and **all four were still exact**
(31 / 28 / 19 / 26).

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
of the four families it says to price separately, one was free (4px), one is
paid in the protected place, one carries a known overflow, and the fifth thing
it did not list cannot be priced at all.

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
- ⬜ **The assertion itself** — a scenario, and the contract is written:
  a settled `4d6` frame with any registry tower up must sit **under 260 draw
  calls and over 40**, the floor being the anti-collapse guard (if
  `autoReset` ever came back the count would fall to ~1 and a ceiling-only
  budget would still pass). Measured 2026-08-17 with
  `renderAudit()` per tower, after settle, headless at dpr 1 — empty felt **2**,
  4d6 on bare felt **58**, `heartwood` **133**, `bastion` **141**,
  `blackanvil` **186**, `nullstone` **68**, `hollowbole` **79**, and the post
  stack forced **70 in 8 passes**. Owner: whoever owns
  `tests/e2e/scenarios.mjs` next.
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

- **B1. The server does not know about channels, and cannot.** There is no
  identity to attach an entitlement to, so the allowlist still accepts any
  registered tower id from any client. This is a **DISCOVERABILITY gate, not a
  security boundary**, and calling it one would be the lie. It becomes
  possible the day seats have durable identity — **which makes B1 the feature
  that the identity structural bet below is now blocking.**
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
| §2l ⑤ | shipped; **⑥ the sum read is the open half** and is now #2 in THE ORDER |
| §3b L4 / CUJ5 | shipped; L2's judgment call is all that is left of §3b |
| C27's residual | **measured and refused as a default** — 0 px gain at 390, a loss at 40d6. Shipped as an inert instrument; the call is Joe's |
| C24's mat table | **its preset LABELS were a full notch stale** and are struck; the measurement still binds |
| W7 ② | had already shipped 2026-08-13 — what landed 2026-08-15 was the frame-space verification it never had, plus two defects it found |
| U28b | two shipped; the near-miss size families still open with their reasons |
| C1, C3 | the composed-scenario half — see Tier C |
| ~20 claims in this file | **verified FALSE against the tree** — the table in SHIPPED.md is the durable record |

