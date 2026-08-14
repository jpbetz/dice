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

**Two tracks run in parallel, and pretending otherwise is what made this file
stop being read.** For six weeks GOALS' ladder (core mechanics → organization
→ secrecy → systems literacy → effects → customization) was the whole
sequencing story. It is not what happened. Everything that landed between
2026-08-11 and 2026-08-15 — Tiers W, T, N, B, V — is the *last* band of that
ladder, and every line of it was commissioned by Joe directly. Meanwhile this
file went on calling Tier 0 "highest priority" and Tier 2 "the biggest
experience gap" while neither moved.

Neither half of that is wrong. The venue and tower work is the owner steering,
which outranks a document. The debt is real debt. What was wrong was a single
ranked list that described neither.

- **Track A — the debt.** Correctness, capture, organization, ops. Sequenced
  by GOALS' ladder, worked when the owner is not steering elsewhere.
- **Track B — the owner's track.** Venues, towers, dice art, the immersion
  shortlist. Sequenced by what Joe asks for next, and by *finishing what is in
  flight* before opening the next tier.

**THE ORDER below interleaves them and is the real answer to "what next".**
It cites sections; the sections hold the reasoning.

**One judgement call still Joe's**, carried from the library pass: "pools and
settings" was read as name + system + dice set + pools, leaving sound and
chips device-global on js/portable.js's existing reasoning.

---

## THE ORDER

| # | Item | Why it is here | Size | Track |
| --- | --- | --- | --- | --- |
| 1 | [**C15** — restore a library from its file](#c15-restore-the-file-this-app-writes-cannot-be-read-back--cuj13-small-medium) | The only **data-loss** hole open. Export works; restore does not exist. A player holding the file still cannot get their characters back. Goal 7's whole persistence story rests on this one verb, and the design is already written against the tree. | small-med | A |
| 2 | [**§0j** — per-IP room-creation throttle](#0j-operational-going-online-deploy-side) | A script burns all 500 `MAX_ROOMS` slots and locks a real game out with `server_full`. Cloud Armor rule, not in-server (§0d's F1 lesson). Also the named **blocker on §3b L4**. | small | A |
| 3 | [**§0j** — `/health` + `GIT_SHA`](#0j-operational-going-online-deploy-side) | No way to say which commit is live. This is the operational half of the frozen-mtime incident that already cost a production debugging session. | tiny | A |
| 4 | [**W5 look**, **W6**, **W7 ②**](#tier-w--the-first-fantasy-venue-the-fae-set) | Tier W is the only tier in flight. Finishing it beats opening anything. W5's own read is genuinely unasked (W7 answered a different question); W6 is the tier's last step; W7 ② is the staging Joe named. | med | B |
| 5 | [**C25 Stage 2**](#c25-the-physical-shelf-does-not-fit-the-mat-any-more--stage-2-open) | The hole in the middle of **CUJ9**: with the log closed a collected roll has no ambient presence at all. **Absorbs U20 and C13** rather than solving the same surface three times. The store is already correct — this is a VIEW. | med | A |
| 6 | [**C1** + **C3**'s open half](#c1-cuj8cuj11--the-session-named-and-then-walked--medium) | Composed scenarios for CUJ8–CUJ11 (and CUJ2, CUJ4, CUJ12). Measured, not theoretical: `prepared-seat` was green for weeks while CUJ3/CUJ7 were broken for **every returning player**. Every part passed; the journey did not. | med | A |
| 7 | [**C11** + **C12**](#c11-the-seat-picker-is-unusable-on-the-phone-it-is-designed-for--cuj7-small) | CUJ7 on the device the link actually arrives on. The picker overflows a phone with no scroll — **and no scenario ever clicks a real `.seat-btn`**, so all six CUJ7 scenarios are green through it. | small | A |
| 8 | [**C27** residual (merge **C24**)](#c27-the-framing-target-was-never-the-dice--one-case-left) | The canonical Soul Deal roll — attribute + skill + motivation, three dice — gained nothing from either shipped framing fix, on the device Joe named. It is the roll this app is most often asked to show. | med | A |
| 9 | [**C14**](#c14-finding-and-repeating-a-roll--cuj9-small-medium) | CUJ9's other half. The log is the only path to "ten minutes ago" and has no search, filter or anchor; the ≣ unread count exists only as a `title` that touch and screen readers never get. | small-med | A |
| 10 | [**C29**, **C28**, **C22**](#c29-the-static-handler-serves-the-repo-not-the-app--small) | The verified-small batch. Static allowlist; the spawn clamp that stopped tracking `TABLE_W`; the ceremony path that never flushes a deferred zoom (a real determinism seam); a versioning contract for client state. | small each | A |
| 11 | [**U23** — the token layer](#u23-a-token-layer-for-the-doctrine--design-first-medium) | Structural. It is what makes U6, U9 and U10 *stay* fixed: `[aria-pressed="true"]` resolves to nine dresses across four hue families, selected by DOM ancestry. Also the vocabulary C25 Stage 2 needs. | med | A |
| 12 | [**§1** re-audit](#1-notation-totality-closeout--re-audit-first) + [**§2l** ⑤–⑦](#2l-pool-analysis--the-ledger-sheet-and-the-sum-read--⑤⑦-open) | §1 is mostly stale — GOALS records both headline violations CLOSED and the tree agrees. Re-audit what is genuinely left before building. §2l's ledger sheet is the typed session target C8 deliberately did not ship. | small | A |
| 13 | [**§3** re-derivation](#3-table-organization--concurrency--needs-re-derivation-post-c25) | Goal 5's tier. **Written before C25 took the shelf off the felt**, so per-roll chips and landing zones may be largely moot. The live half is **table resync**: a reload shows an empty felt while everyone else sees dice — a goal 8 divergence on every reload. | med | A |
| 14 | [**U25**, **U26**](#u25-the-tables-smaller-seams--batch-small-medium) | The two audit batches. Each item is small; together they are what a first table night runs into. U26's spectator bullet is **CUJ11's first item**. | small-med | A |
| 15 | [**T15**](#t15-re-bake-the-three-classic-skins-through-the-forge--large-scoped-2026-08-14) | Owner-commissioned off T14's measurement, and explicitly **not a side quest**: every round is a `/new-tower`-shaped job and a half-migrated tower is a fourth way of building one. Do it deliberately or not at all. | large | B |
| 16 | [**L4** / CUJ5](#3b-the-lobby-and-the-table-flow--l2-and-l4-open) | The only journey with **zero code and zero scenarios**. Blocked on #2, and nobody has asked for it — which is why it sits below work that is being felt. | med | A |
| — | everything else | Design-first, record-only, or deliberately deferred. Named in its tier below with the reason it is not above this line. | | |

**Three standing calls that are not build items** and should be made before
the work they gate:

- **Identity.** `dice.name.v1` is origin-global, `playerId` is minted
  per-join, and both are load-bearing for **authority** (`revealAuthority`)
  and **routing** (the seat door). GOALS §7 defers persistent identity to "a
  later pass" — and **B1 is the feature that needs it**. Schedule the pass
  before the next one arrives. See [Structural risks](#structural-risks-bets-not-bugs--each-gets-more-expensive-to-reverse).
- **What comes out of beta** ([B3](#tier-b--the-closed-beta)) — no criterion
  exists and none should be invented before there is a second beta feature to
  generalise from.
- **Joe's LOOK and LISTEN queue** is the real critical path on Track B: four
  outstanding LOOK verdicts and five voices reasoned from a table and never
  heard. No tower or venue is *done* before its frame is seen.

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

- **Add `/health` + bake `GIT_SHA` into deploy** — verified absent
  2026-08-14: neither string appears in `server.js` or the Makefile. There is
  no way to confirm which commit is live without triggering known behavior,
  which is exactly the position the frozen-mtime bug left us in. Small code +
  Makefile change (`--set-env-vars GIT_SHA=$(git rev-parse HEAD)`).
- **Per-IP room-creation throttle** — a script can burn all 500 `MAX_ROOMS`
  slots and lock friends out with `server_full`. **Cloud Armor rate rule, not
  in-server buckets**: §0d's killed F1 established that
  `req.socket.remoteAddress` collapses to a single value behind Cloud Run's
  proxy. This is the named blocker on §3b L4.

**Nice-to-have:** memory>80% Cloud Monitoring alert, `make logs-tail`,
`X-Robots-Tag: noindex` on HTML, `/admin/rooms` behind a shared secret, a
DEPLOY footnote for "if you leave Cloud Run", and a DEPLOY note that an OOM
restart silently wipes rooms.

---

## Tier 1 — Core mechanics completion

### 1. Notation totality closeout — RE-AUDIT FIRST

**Mostly stale, verified 2026-08-14.** [GOALS.md](GOALS.md)'s Notation
totality invariant records both audited violations as **closed and
re-verified**, and the tree agrees: `js/notation.js` carries `check`/
`cinematic`/`held`/`secret`/`w:` in `FLAG_KEYWORDS`, the `# Title | Subtitle`
pipe split with escaping, and `exp` in both parse results and canonical
output. `skipPlainPlayback` exists. Reveal state is projected on every egress
(`revealed:` in `projectEntryFor`).

**What is left is the small-batch remainder, and it needs re-auditing rather
than building from this list**, which was written before four passes touched
these surfaces:

- **struck dice and ✴ children in the banner breakdown** — genuinely open, and
  narrower than written: U17's build record establishes that `4d6dl1`'s
  dropped die returned to the **verdict card only**; `renderOutcomeRows`
  prints only the dice `outcomesFor` returns, so the banner and the peek still
  show no struck die *under a per-die lens*. That is a live half of GOALS'
  *Attributed math* and it belongs to whoever next touches
  `renderOutcomeRows`.
- `/api/join` carrying `offers` — verify against `joinSnapshot` before
  scheduling.

### 2b follow-ups (from prior shipped passes)

- **720×480 e2e sweep.** The Pools Rack's small-window pass was never landed;
  dense chip line + dots-only switcher + sticky headers need a headless pin at
  phone-narrow. *(Related and sharper: [C11](#c11-the-seat-picker-is-unusable-on-the-phone-it-is-designed-for--cuj7-small)
  — the picker's rendered surface is unproven at any width.)*
- **Drag-and-drop staging as an additive affordance** *(Joe 2026-08-03 play
  notes)*: tap-to-stage was hard to discover. Tap stays primary; DnD is the
  intuition players arrive with.

### 2l. Pool analysis — the ledger sheet and the sum read — ⑤–⑦ OPEN

Full detail: [POOL-ANALYSIS.md](POOL-ANALYSIS.md) — the reasoning, the
generated data, and what was killed and why. Every figure is reproducible:
`node tools/pool-analysis-data.mjs`. Serves **CUJ6** and **CUJ8**.

Slices ①–④ shipped 2026-08-06 (math floor, honest preview, profile seam,
dice-value ledger, spectrum bars, polish wave); pinned by `pool-forecast` and
`rack-dice-value`.

**Still to build:** ⑤ the ledger sheet (`placeAnchored` extracted from
`openSetMenuFor`, not ported; session-only target) · ⑥ the sum read · ⑦
verification + docs.

⑤ is the **typed session target** C8 deliberately did not ship: C8 put the
*system's* budget on the shelf head (`SYSTEMS['soul-deal'].budget`, `100/100`)
and left "I am building to 80 tonight" to this slice.

**Decisions still open** (POOL-ANALYSIS §9): whether the parser stops
collapsing `2d20kh1` · portable-YAML forward compatibility · which popover
doors forecast · what a pool-scope forecast forecasts, given `stageGroup`
drops mods while the rail rolls them · the offer card · the e2e tag · where
the rack figure lives, given `#pools-head` is deliberately non-sticky.

**GOALS: 4** (goal 4 names *summing values* as toil the system owes the
player) · **5** · **6** · **7** (render-time, client-side) · **12** closed by
the session-only ruling.

---

## Tier 2 — Organization (goal 5)

### 3. Table organization & concurrency — NEEDS RE-DERIVATION POST-C25

**Written before C25 Stage 1 took the shelf off the felt**, and that changed
the premise. The felt now holds one roll at a time with prior rolls
auto-collected, so "a new roll erases every older roll's chips while its dice
remain" may no longer be reachable. **Re-derive against the shipped felt
before building any of this.** What each bullet is worth today:

- **Per-roll chips lifetime** (chips keyed by rollId, kept until Done/evicted)
  — likely moot; verify.
- **Per-roll landing zones** (deterministic allocation from the roll
  seed/order) — likely moot for concurrency, but it is the machinery
  [§12](#12-per-player-roll-mats) and [6b](#6b-dice-on-card--bg3-cinematics--the-seated-shelf--decisions-pending)
  both assume exists.
- **Ordered eviction, not the 40-dice wipe** — evict oldest settled rolls one
  at a time via the existing sink/fade, ordered by server roll time so all
  clients converge; kill the client-relative full reset.
- **Table resync — THE LIVE HALF, and it is a goal 8 defect.** Hello does not
  carry which logged rolls still sit on the table, so joining or reloading
  shows an empty felt while everyone else still sees dice. `replaySettledRoll`
  already exists (built for the tower's held-replay path) and is most of the
  mechanism; the missing piece is the hello payload and the settled (final
  pose, no tumble) replay path for the general case.

*§3 is ONE felt's organization. Organizing across tables is §3b, which shares
only the word "table".*

### 3b. The lobby and the table flow — L2 and L4 open

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

**L4. Sub-tables (CUJ5) — the only journey with zero code and zero
scenarios.** Split creates a child room, listed to the parent's players (the
scoped directory below) and carrying a parent pointer, so "return to the main
table" is a link rather than a thing you have to remember. **§13's hard part
turns out not to be hard:** the display name is origin-global
(`dice.name.v1`) and so are the pools, so identity walks into a breakout for
free; the seat being per-room is *correct* — a child table mints its own.
Open: whether a child inherits the parent's felt and system (probably — same
game), and what an orphaned child is when the parent's linger expires
(answer: just a table).

**BLOCKER before any of this is exposed publicly: [§0j](#0j-operational-going-online-deploy-side)'s
per-IP room-creation throttle.** L1 turned room creation into an
unauthenticated write; 500 slots are burnable by a script today.

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

### 4b. Visibility refinements

- **Sticky mode + its badge, as one change.** A remembered per-player default
  (Foundry's roll-mode ergonomic) is only safe alongside a standing eye-slash
  badge on the Roll button and the mini pills — a sticky non-open default with
  no persistent signal is the accident vector §3.2 names. **Ship both or
  neither.**
- **Silent whisper.** A whisper whose bystanders learn *nothing*, not even
  that a roll happened. Today every rung but `secret` makes existence public,
  and PF2e's precedent is that roll-existence is itself mechanically
  meaningful. This is a fifth rung, not a tweak: `secret`'s omit-entirely
  projection with `whisper`'s audience.
- **Reveal to a subset.** Rejected for step 4 because reveal is currently
  total and one-way, which is what makes it auditable. Revisit only with a
  concrete table need.
- **Audience legibility.** A shrouded viewer reads the audience only when the
  roll has no `# comment` — `label` carries one or the other. Decide whether
  "who was whispered to" deserves its own always-present field, or whether
  comment-shadowing is the correct privacy default.

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
[C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--cuj13-small-medium),
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
- **Felt real estate.** Seated cards occupy zones; [§3](#3-table-organization--concurrency--needs-re-derivation-post-c25)
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

### 13. Breakout rooms — MOVED to §3b L4

Section number kept so cross-references resolve.

---

## Tier C — the CUJ audit's open items

*From [CUJS.md](CUJS.md), the only place a CUJ number is assigned. The audit's
landings — C6–C10, C16–C21, C23, C30–C33 — are in SHIPPED.md.*

### C1. CUJ8–CUJ11 — the session, named and then walked — medium

The largest journey in the product had no entry anywhere. Everything between
"I joined" and "I left" was absent from Joe's five (entirely about *rooms*)
and from PROFILES' two jobs (entirely about *characters*). **The measurable
cost: all 30 Tier U findings were found by reading code**, because there was
no journey to walk.

**Decided 2026-08-08 (Joe): four journeys, not one** — CUJ8 *roll this
specific thing*, CUJ9 *keep the table legible*, CUJ10 *control who sees this*,
CUJ11 *follow along without rolling*. One journey covering 60% of the app
cannot tell you what is missing.

**Change:** a **composed** end-to-end scenario for each, on the
`profile-dm-prepares` model — two players, a whole sequence, assertions about
what a person ends up holding rather than about a widget.

### C2 / C15. Restore a library from the file it was written to — see C15

C2 was the sketch; [C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--cuj13-small-medium)
is the measured shape and supersedes it. Number kept so links resolve.

### C3. One composed scenario per journey — tags SHIPPED, composed scenarios open

**A journey with no end-to-end scenario passes in every part and fails as a
whole**, and this is measured rather than argued: `prepared-seat` was green for
weeks while CUJ3/CUJ7 were broken for **every returning player**, because the
fixture seeded no name and so only tested first-timers.

**Shipped half (2026-08-08):** 109 scenarios carry `cuj1`…`cuj13`, so
`--only cuj7` runs the journey rather than a surface.

**Open half:** the missing composed scenarios (CUJ8–CUJ11 via C1; CUJ2, CUJ4
and CUJ12 have parts but no walk). Plus a line in [TESTING.md](TESTING.md): a
journey's composed scenario is a release gate, and a feature that changes a
journey updates it in the same commit.

### C4. One owner per numbering namespace — small, mostly done

CUJS.md owns CUJ numbers (done — it says so at the top). **What is left:** the
matching line in UX.md §7 stating the next free section number in the document
that assigns them, so a branch that is out for a week can see what is taken.
`UX.md §7.24` was written **twice in the same week** by two branches and only
caught at merge; `CUJ2` collided across three documents. Same root cause, no
owner. Also repoint the stale citations that say "CUJ2" meaning CUJ7.

### C5. CUJ5 has zero code and zero scenarios — see L4

Not a new item — [L4](#3b-the-lobby-and-the-table-flow--l2-and-l4-open) holds
the design — listed so the zero appears in the same table as everything else.

### C11. The seat picker is unusable on the phone it is designed for — CUJ7, small

*CUJ7, step 1 — the link arrives in Discord and is opened on a phone.*
`#name-panel` is `width: 320px` with **no `max-height` and no `overflow`**,
inside a centred flex overlay — centred overflow, where the top clips and
becomes unreachable. `#settings-panel` got exactly this fix with a comment
explaining why, so the pattern is known and the picker was simply not
revisited when it grew to hold six seats plus a profile list (seats cap at 12,
profiles render uncapped to 32). Compounding: `promptName` focuses the input
unconditionally *before* the peek resolves, and the viewport meta carries
`interactive-widget=resizes-content`, so the keyboard halves the viewport at
the exact moment the seats arrive. No `@media` rule touches `#name-panel`.
`.seat-btn` computes to ~31px, under the 34/44 floor U28 established.

**Why the suite is green through this:** no scenario ever clicks a real
`.seat-btn` — every seat act goes through `__diceDebug`. The picker's
*rendered* surface is unproven by all six CUJ7 scenarios.

### C12. Three smaller arrival gaps — CUJ7, batch, small

- **No way out of the picker.** `#name-modal` is not a rung in the Esc ladder
  (settings, three menus, the popover, the peek and the flyout all are) and
  has no ✕ and no cancel. You cannot look at the table before committing.
- **"Stay as ⟨your name⟩" silently forfeits the prepared character**, one line
  under a hint that says the link offers it. Recovery exists — Settings → Your
  profiles → *At this table* → `Copy` — three levels down, unnamed at the
  door, and `Copy` does not activate, so it takes a second act.
- **`⚄ Random` at the door mints and persists on the tap**, with no undo, to
  the 32 cap; it is the row pre-selected for a first-timer, i.e. the one Enter
  aims at, and the only row in that block that is not a lossless pointer move.

### C13. What a shelf marker owes, past U20 — CUJ9, design → FOLD INTO C25 Stage 2

*Do not solve this surface three times.* CUJS.md and C25 both say C13 and U20
fold into [C25 Stage 2](#c25-the-physical-shelf-does-not-fit-the-mat-any-more--stage-2-open).
The three facts C13 contributes that U20's text does not name:

- **Rank.** Slots are ranks oldest→newest — the single most useful fact for
  "find what happened earlier" — and nothing renders it.
- **Waiting-on-you.** A held roll's Reveal exists *only* in its peek; the
  marker writes `— hidden` into its **`aria-label`** and nowhere else. A
  screen-reader user is told which shelved roll awaits its reveal and a
  sighted player is not. That inversion is the sharpest evidence the read was
  decided and half-shipped.
- **The glow is claimed as the substitute and is not.** The roller-tinted ring
  blends 45% toward gold and caps alpha at 0.10 — two players' rings differ by
  ~10/255 on dark felt. The code comment calling it "the joiner's at-a-glance
  attribution, restored at zero chrome cost" is what would stop the next
  person from fixing it.

*Note the C25 Stage 1 shift: the marker itself is gone. These are now claims
about what the log row and the ambient signal owe.*

### C14. Finding and repeating a roll — CUJ9, small-medium

- **The log has no search, filter or anchor** (verified 2026-08-14: no such
  input exists). It is the only path to "ten minutes ago": a 300px column of
  three-line rows, capped at 100 both ends. Four hours × five players blows
  100. A late joiner gets the last 100 with `logDroppedTotal` at 0, so they
  are told nothing about what already fell off.
- **`Clear history` scope** — re-verify: since C6 the handler *does* clear
  shelved rolls server-side (`requestClearRoll`), but `log = []` is still
  local-only, so ordinary logged rolls return on the next `hello`. The label
  still carries no scope word either way.
- **The ≣ unread count exists only as a `title`** — U20's exact failure in a
  second place. `aria-label="Roll log"` is static and *overrides* `title` in
  the accname algorithm, so screen readers never get the count and touch gets
  nothing. `__diceDebug` exposes the number, so tests can assert a signal no
  user can perceive.
- **Reroll carries state correctly; finding it is the problem.** `r` repeats
  `lastEntry`, which auto-collect replaced 3 s ago, so the real path is ≣ →
  hover the row → `⟳`, and `.log-again` is `opacity:0` until hover. Two
  adjacent notes: `canReroll` refuses hidden entries, so the roller cannot
  repeat their own unrevealed held roll; and the server substantiates
  `rerollOfId` on parent existence alone with no same-roller check, so
  rerolling Bob's roll stamps *Bob's* row `rerolled` in everyone's log.

### C15. Restore: the file this app writes cannot be read back — CUJ13, small-medium

**#1 in THE ORDER.** Export is complete and whole-library. Restore is three
paths and none of them is one: **Apply import** merges only the file's
top-level `pools:` and ignores `players:` entirely; **Add** and **Add all N**
run every name through `uniqueName`, so a restored "Nessa" lands as "Nessa 2".
A fresh browser deals one profile at boot, so `Add all` on a 32-profile file
needs 32 slots against a cap of 32 and lands **31 of your characters, renamed
on collision, beside a stranger's dealt profile, with the wrong one in hand.**

**Design (verified against the tree; still absent 2026-08-14 —
`grep 'Replace my library'` finds nothing):** one verb, `Replace my library…`,
in the `#import-profiles` block, using the app's existing two-step in-place
destructive confirm — armed state **names what is destroyed**, not just counts
it, and offers `Download` inline first, since the thing being replaced may be
the only copy. Build the replacement store from `importableProfiles()` via
`emptyStore()` + `addProfile()` with **no `uniqueName`** (the file's names are
already unique by `parsePortable`), persist it and **check the return** before
swapping the live pointer, then `adoptRack()` the profile the file's
`profile:` key names — the pointer every current path silently drops. The cap
problem dissolves: replacing starts from empty, so 32 fit exactly.

**This is an explicit, separately-named verb — never a sharper Apply.** The
distinction is the whole safety property: Apply merges and deletes nothing,
which is what makes it safe to press on a rack you care about. Union-only,
preview-then-merge is the load-bearing lesson of the `#g=` post-mortem.

Also in this journey, and separate:

- **`parsePortable`'s `warnings` are dead end to end** — produced,
  unit-tested, returned, and read by nothing. PROFILES §3.1 states the
  requirement in so many words: *"the warning must reach the preview status
  line, not vanish."* A file from a newer version silently loses sections and
  reads as a clean `✓`.
- **An empty file reads as success-with-nothing-said** (blank status line),
  while a comments-only file refuses properly. Inconsistent.
- **Boot normalization is lossy and the loss is written back**: profiles past
  32, pools past 40 and duplicate lowercase names are dropped *silently*,
  `STORE_VERSION` is written but never checked, and the normalized result is
  persisted on the first paint before the user touches anything.
- **`LS_GROUPS` is a fossil sold as a recovery path.** The comment calls it
  "the one recovery path if the library is ever cleared"; it is read once at
  boot and never written again. For anyone whose first visit postdates the
  library, the key does not exist.

### C22. A versioning contract for client state — DESIGN, then small

*Joe 2026-08-09, written after the frozen-mtime bug put months-old clients in
front of a current server with nobody able to say what they were carrying.*

**Three numbers, `epoch.major.minor`, on every stored blob and every wire
payload that carries state** (`dice.profiles.v1`, the portable file's
`version:`, `room.setup`).

| Part | Means | Reader's duty when it does not match |
| --- | --- | --- |
| **epoch** | *A different data model.* No compatibility offered or implied. | **Purge it**, unless a converter is registered for that exact epoch. A registered converter runs once and rewrites forward. |
| **major** | *New capabilities exist in this data.* | A reader supporting a LOWER major must **refuse and say so to the user** — never load it partially. Older data with a lower major loads normally. |
| **minor** | *A compatible change.* Tracking only. | Load it. Nothing branches on minor; it exists so a bug report names a build. |

**The asymmetry is the point, and it is easy to get backwards.** *Older* data
is a migration problem — the reader knows more than the writer did. *Newer*
data is a refusal — the reader knows less, and loading it means silently
dropping what it did not understand. **The loud door is where a human is
standing.**

**What exists today:** `dice.schema.v1 = 2` does the purge half only.
`STORE_VERSION` is written into the profile store and **never read**.
`normalizeStore`/`migrateGroup` are the lossless-migration path and the right
home for *major*. The portable file has no version field at all.

**Build order.** (1) Fold `dice.schema.v1` into one `{epoch, major, minor}`
stamp read in one place. (2) Give it a converter registry (`epoch N → N+1`) at
boot; the purge stays the default. (3) Make **major** refuse out loud with the
app's `✗ …` grammar, and say what to do. (4) Put the same triple in the
portable file and `room.setup`. (5) Report the numbers with every crash
(js/report.js) so the field log says which build wrote the state that broke.

**Not for this:** the live wire protocol. A live client can be told to reload,
which stored data cannot.

### C24 → merged into C27. The mat cannot keep shrinking

**C24's measurement stands and is load-bearing; its prescription shipped as
C27.** Kept as a pointer because the *instruction* it carries is still
binding:

**Do not take another notch off the mat.** Measured 2026-08-09 after three
tightenings and one refused fourth — dice at rest counted above y=1.2:

| mat | 6d6 | 12d6 | 20d6 | 40d6 | max height |
| --- | --- | --- | --- | --- | --- |
| 8.6×5.2 *(`medium`)* | 1 | 2 | 9/20 | 27/40 | 4.7 |
| 6.7×4.1 *(`close`)* | 2 | 5 | 15/20 | 32/40 | 6.3 |
| 5.2×3.2 *(a fourth notch, refused)* | 3 | 10/12 | 17/20 | 32/40 | **9.0** |

A 12-die pool at the proposed fourth notch had ten of twelve dice off the
felt. That breaks goal 5 and goal 1, and the camera is framed for a flat mat,
so a tower reads as a smudge. **The mat is the PHYSICS WALLS** — identical on
every client, because a seeded roll replayed against different walls lands
differently — so it cannot vary by device and must hold the largest pool
anyone rolls. `dice-land-flat` is the pin.

### C25. The physical shelf does not fit the mat any more — STAGE 2 OPEN

**Stage 1 shipped 2026-08-09** (SHIPPED.md): the 3D shelf is gone, collecting
takes dice off the felt via §7.26's lift, and the roll log is the record — a
collected roll's ROW is the door to the peek card its felt marker used to
open. Zero wire change, ~220 lines and one invariant deleted.

**STAGE 2 — OPEN, and it is the creative half.** Joe's sketch, unchanged:
*"previous N rolls as panels across the bottom… maybe we just show the roll
log briefly and then show it collapse into a UI element that expands the roll
log… we'd need UI that goes beyond basic buttons and has some elements that
visually fit together. We'd need to get creative."*

**Stage 1 deliberately left one thing worse and it is the thing Stage 2
fixes: with the log closed, a collected roll has no ambient presence at all.**
The ≣ button carries an unread count in its `title` and nothing else. (The bar
is lower than it sounds — the marker it replaced drew *nothing* at rest
either — but a row inside a closed panel is a step further away.)

**What Stage 2 takes as settled by Stage 1:** the store exists and is already
correct, so this is a VIEW; the card is reusable verbatim; and anchoring to a
DOM row rather than a projected 3D point is what made the whole thing cheap.
**[C13](#c13-what-a-shelf-marker-owes-past-u20--cuj9-design--fold-into-c25-stage-2)
and [U20](#u20-the-shelfs-read-at-rest-and-the-peeks-lifetime--design-first--fold-into-c25-stage-2)
fold in here rather than being solved twice**, and
[U23](#u23-a-token-layer-for-the-doctrine--design-first-medium)'s token layer
is the vocabulary for "elements that visually fit together" — this is its
first real customer.

**What must not regress:** the tidy-away (a finished roll leaves the middle of
the table on its own) is load-bearing and nobody has complained about it;
§7.7's collect/clear state machine and its `rollStates` rows are wire, not
rendering; CUJ9's find-and-repeat ([C14](#c14-finding-and-repeating-a-roll--cuj9-small-medium))
currently walks the shelf and must walk the record instead.

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

### C27. The framing target was never the dice — ONE CASE LEFT

**The spine: `framingPoints` returns four corners at `y = 0`** — a
floor-plane frame in a world with height. "The mat is on screen" was only ever
a *proxy* for "the dice are on screen", and it diverges **exactly where the
stacking is worst**. Confirmed in the wild: desktop 1440 at 40d6 had the
deciding die off screen while the mat reported `fits`.

**WHAT SHIPPED (the immersion wave, `d064c04`…`b35b411`)**, both per-viewer —
the camera shows no one else anything, which is what makes it safe to vary by
device where the MAT never can be: rung 1 of the framing ladder descends when
the deciding die is off screen (20 consecutive lone d20s on a 390px phone: 0
misses); a quarter-turn orbit in portrait when landscape cannot contain the
mat (20d6 and 40d6 on a 390px phone: 20/20 and 40/40, was 19/20 and 32/40).
Containing the mat was priced and **declined** — it costs ~24% of die size.

**WHAT IS LEFT, and it is the common case.** The orbit engages at 20d6+; the
ladder declines to crop when nothing is being lost. So **the canonical Soul
Deal roll — attribute + skill + motivation, three dice — gained nothing**: mat
does not fit, mode is dice-cropped, ~75px per die on a 390px phone. A lone d20
gets 219px and forty dice get all forty on screen; the roll in between gets
neither. **That is the roll this app is most often asked to show**, and it is
#8 in THE ORDER.

**THE RULE this entry named, in its third shape — *nothing fails loudly when a
stand-in stops standing in*.** `SHELF_SLOT_W` was a constant that stopped
tracking `TABLE_W` (C25). The spawn-spread comment was a rationale that
stopped tracking the mat (C28 ①). This was a framing TARGET that stopped
tracking the thing it stood for. None of the three threw an error, failed a
test, or looked wrong in code review. `grep -n "TABLE_W" js/main.js` is this
shape's audit, worth running whenever the ladder moves again.

### C28. Two more things the zoom ladder left behind — SMALL, both verified open

**① `spawnDie`'s spread clamp is binding at every preset** (js/main.js:3163 —
`Math.min(TABLE_W - 4.4, count * 2.6)`, unchanged as of 2026-08-14). Its own
comment reasons from a mat that no longer exists (*"TABLE_W=18:
TABLE_W-4.4=13.6, still ample"*).

| preset | TABLE_W | cap | clamp binds from | 12 dice share |
| --- | --- | --- | --- | --- |
| wide | 11 | 6.6 | 3 dice | 6.6 units — 3.7 die widths |
| medium *(default)* | 8.6 | 4.2 | **2 dice** | 4.2 units — 2.3 die widths |
| close | 6.7 | **2.3** | **1 die** | 2.3 units — **1.3 die widths** |

A die is ~1.8 units across and the intended spread is `count * 2.6`. The clamp
overrides that from the *second* die at the default. **This is upstream of the
contact-recorder starvation** fixed in `5a5a8ce` (*"20 dice interpenetrate on
frame zero and dispatch 280 contacts in that ONE step"*): widening the spread
should reduce the frame-zero contact count directly, and `contactStats()` is
already the instrument. *(Caution: this is also the lever C30c/C33 name for
piling — measure paired, with `throwSeeded`.)*

**② The ceremony path never flushes a deferred room change** (verified
2026-08-14). `stepPlayback`'s ordinary completion ends `else
tryFlushRoomChanges()`; `ceremonyFinish` ends at `if (rollQueue.length)
playRoll(rollQueue.shift())` **with no `else`**. So a room-wide zoom or tower
arriving during a ceremony roll, with nothing queued behind it, does not land
when that ceremony ends. It waits for the next collect, the next non-ceremony
completion, or a hello.

**Why this matters more than it looks:** the mat is the physics walls and is
room-wide *precisely* so every client replays a seeded roll against the same
geometry. A client sitting on the old preset while the room moved is the
divergence the deferral exists to prevent, and the ceremony path is the one
that skips it. Since C25 a collect fires on the next roll's arrival, so it
self-heals quickly — which is exactly why it has gone unnoticed. One line,
plus a scenario that rolls a ceremony roll, zooms mid-beat, and asserts
`wallPositions()` matches the new preset with an empty queue.

### C29. The static handler serves the repo, not the app — SMALL

**The important half is already handled, deliberately.** `safeResolve` blocks
traversal and every dotfile, so `.git/config`, `.git/HEAD` and
`.deploy.config` all return 403, and `Makefile` and `docs/*.md` 404 because
their extensions are not in `MIME`. **No credential or config exposure**,
verified path by path.

What is exposed is SOURCE: `curl https://<service>/server.js` returns the
server's own source, 200. So does `/package.json`, and every `.mjs` under
`tests/` and `tools/` — 530 KB of `scenarios.mjs` included. The rule is "the
extension is servable", where it wants to be "the file is part of the app".

**Why small rather than nothing.** Goal 10 already says there is no access
control — the room key is the door — so the threat model does not change. But
it hands a reader the server's exact validation logic, room and player caps
and refusal paths with no effort, and puts half a megabyte of test source
inside a 1 GiB/month egress allowance for no reason.

**The fix is an allowlist of roots, not a denylist of names** — serve
`index.html`, `js/`, `css/`, `vendor/`, `models/` and whatever assets exist,
404 everything else. A denylist would have to grow every time a directory is
added, which is the same shape as the constants in C28. Nothing in `js/` or
`index.html` fetches `package.json`, so narrowing costs nothing today.

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
[C28 ①](#c28-two-more-things-the-zoom-ladder-left-behind--small-both-verified-open)),
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

### U17 residuals — three sites still disagree with the shipped rule — small

*The rule ("a stake renders on every surface under every system; its
adjudication renders only where the system produces a single number to
compare") shipped in steps 1–4 and lives in UX.md §7.24. Three sites did not
follow, and they are the exact shape of the structural risk below.*

- **`modsSummary`'s `values` option was never added** — `renderOffers` still
  calls `modsSummary(o.mods)` with no options, so **an offer card still prints
  the flat `+5`** under a per-die lens while the intent card it becomes drops
  it. The last declaration surface on the wrong side of the split.
- **The log's total column still answers `?`** for a held roll under a per-die
  lens — the same mute gold glyph step 2 removed from the banner and the peek,
  making the same claim of a withheld sum that will never exist.
- **Step 6, the LOOK, is open.** Per the repo's standing rule U17 is not
  "done" before it: the verdict card's stake-line rhythm and the peek's
  `.pk-held` word have not been seen rendered.

*(The struck-die half is filed under [§1](#1-notation-totality-closeout--re-audit-first),
where the attributed-math invariant lives.)*

### U20. The shelf's read at rest, and the peek's lifetime — DESIGN FIRST → FOLD INTO C25 Stage 2

*Audit F1, F2 (moderate).* The shelf half is superseded by C25 Stage 1 (the
markers are gone) and its *question* is what Stage 2 answers: how much read
does a collected roll owe at rest.

**The peek half is still live and independent.** It closes on nothing a player
expects — not a new roll, not a ceremony, not the log — and at z 30 outranks
all of them (the repo's own capture run shows it standing through an entire
Check); two cards can wear a red `✕ Clear` for two different rolls with
nothing marking which is live; in `body.mini` the banner's top edge cuts into
the peek; and one roll gets three presentations by arrival path (dressed
`top:3vh` for 7 s, plain `bottom:26px` for 3 s, reloaded Check comes back
plain because `replaySettledRoll` passes `exp:null`).

**Do not change the collect-on-arrival rule** — see Refuted.

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

### U23. A token layer for the doctrine — DESIGN FIRST, medium

*Audit C2–C6, and the structural-risk read.* `--dim-rest`/`--dim-off`/
`--drain`, `--on-fill`/`--on-ink`/`--on-ring`, three die-art sizes, one
`--label-sm` recipe. **This is what makes U6, U9 and U10 stay fixed.** The
evidence that it is needed and not taste: thirteen `:disabled` recipes with
six missing grayscale; `[aria-pressed="true"]` resolving to **nine distinct
dresses across four hue families**, selected by DOM ancestry rather than by
kind of choice; and three `.rp-*`/`.seg` cascade ties in three commits, all
silently winning against the rail block, from one 4.5k-line stylesheet with no
token layer. **Cascade ties — not file size — are the measured cost of the CSS
as it stands.** Also the vocabulary C25 Stage 2 needs.

### U25. The table's smaller seams — batch, small-medium

*Audit E4.* Each is small; together they are what a first table night runs
into.

- **Copying the invite link has no primary gesture.** At a table with one
  other person the Invite chair is gone and the link lives behind
  right-click/long-press on a chip whose left-click is a visible no-op; the
  manual is a `title` touch never renders; no keyboard shortcut touches the
  table at all.
- **Roster pills shrink to unreadable stubs before `+N` folds** (bare dots
  plus *two* overflow pills).
- **`publishPools` broadcasts your entire rack on every edit with no
  disclosure**, while the one tooltip about pool sharing asserts the opposite
  ("Pools travel via Settings → Your data → Export").
- **The change note never names the setting** — "Alice changed the table" for
  a system flip that reinterprets every result.
- **An unnamed table renders its minted key** (`drive egw19x`) as the
  nameplate and tab title, against its own markup comment ("else NOTHING").
  The marginal *security* cost is nil; the presentation is wrong by its own
  rule.
- **A room that dies says nothing** to the group whose link it was (12 h
  linger, `--min-instances 0`).

### U26. Lifecycle reads, transport door, and the terminology sweep — batch, small-medium

*Audit F3, plus the two closing results.*

- **The spectator's banner hover-hold silently does nothing** — `armAutoCollect`
  bails on `!mine`, so the roller's 3 s clock yanks the card a spectator is
  reading. **This is CUJ11's first item**, and it was found by reading code
  because no journey named the spectator.
- **The log row duplicates every source label across two lines** — the
  diagnosis §7.12 wrote and fixed on the other three surfaces, unfixed here.
- **A shelved roll whose log row is gone renders a peek with a live body-click
  and no named verb** — the pre-§7.21 defect surviving in an edge state.
- **Spectator reroll is deliberate and defensible, but nothing signals the
  attribution flip or the shelf eviction it causes.**
- **The whisper sub-line "others see you rolled, not what"** describes a
  deliberate, thrice-documented stakes-are-public leak in four words that read
  as the opposite; the offer-context tooltip specified for Only-me was never
  built.
- **The terminology sweep found one real contradiction** — one button labelled
  "shelf" with a tooltip saying "category" — but **the durable half is the
  suite**: the e2e's banned-word regex omits "category" and sweeps none of the
  result surfaces.

*(U26's transport bullet was re-scoped and is now
[C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--cuj13-small-medium):
the unit is the **library**, not the rack.)*

### U28b. Two smaller touch findings, deliberately deferred — batch, small

- **`.rd-cell`'s 86px cannot hold art + name + remover** at the longest
  labels; the grown `.rd-x` overlaps a 34px lane of the name. The stylesheet
  refuses to fix this in cascade — the answer is markup in `renderRailDice`.
- **The rim is a no-wrap flex row.** At coarse the four tools come to ~240px
  of the expanded panel's 260 — fine on a tablet, but it already overflows
  below a ~320px viewport. `flex-wrap` on `.draft-actions`, or a narrower
  phone dress.
- **Near-misses the size pass did not take**, because a blanket coarse `.btn`
  bump touches ~30 surfaces and bumping `#section-bar` spends U30's rack
  budget directly: the `.btn.ghost` family at 31px, `.corner-btn` at 28
  expanded, `.btn.tiny` at 19, `#section-bar` cells at 26.

---

## Tier V — the immersion audit's shortlist

*[IMMERSION-AUDIT.md](IMMERSION-AUDIT.md) cross-checked the detail work
against the industry canon: seven pillars STRONG, three PARTIAL, one GAP. V1
(audio phase one) and V2 (dust motes) shipped — see SHIPPED.md.*

### V3. Finish the wear dossier — small-medium
Audit §2's two designed-but-unbuilt items: hand-polish roughness zones (tray,
jambs — "polished where hands and dice pass") and the arris ribbon (sparse
chip decals that break the long straight edges). Completes "aged" into "aged
and handled."

### V4. Performance guardrails — small
Audit §10: assert `renderer.info.render.calls` in `tower-roll` (a budget as a
failing test, not a vibe) · clamp `setPixelRatio` · an idle tick throttle
(render-on-demand proper conflicts with the breathing world; the applicable
form is a reduced idle rate). *(T14 already made the tower draw budget an
assertion at 20 total — this is the same discipline for the scene.)*

### V5. Diegetic nudges — small, DESIGN FIRST
Audit §11: a result echo on the felt near the deciding die; hover warmth on
dice ("everything you can touch touches back"). The mat's painted text is the
precedent that this is buildable without a framework.

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

## Tier W — the first fantasy venue: the fae set

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

### W7 ②. The staging — OPEN

*Joe 2026-08-13: "Looks too staged. The gesture is not right. I want the dice
tower to be in a scene, not the centerpiece of it in a symmetrical and formal
way. Consider moving the mushroom ring more to the foreground (Don't worry
about where the dice land too much), and maybe move the pool backward and
completely change it's size.. Also more mushrooms throughout the scene would
help."*

① (the stump — crown shear, monotone lintel tear, inverted taper) shipped and
Joe called the frames *"Beautiful"*. ② has not started: the moot moves toward
the FOREGROUND, the pool moves back and changes size outright, and mushrooms
spread through the scene instead of pooling in one ring.

**Note what his parenthesis licenses and what it does not.** *"Don't worry
about where the dice land too much"* relaxes the composition's deference to
the mat, but the placement law is about **LEGIBILITY** — the stage carries no
colliders, so a die that comes to rest inside a mushroom is unreadable rather
than merely untidy. **The foreground band (in front of the front wall) is
dice-free by construction** and is where a forward moot can go while still
obeying it; take that first and only spend the licence if the frame still
refuses.

**The lesson round 7 earned, and it outlives the model:** the three new gates
(`assert_silhouette_is_not_a_face`, `assert_taper_is_a_stump`,
`assert_lintel_is_a_tear`) are stated **in the FRAME** and bin the built mesh's
edges into a projected outline. A gate phrased in plan could not have caught
any of it, because round 6 already satisfied every plan-space claim it was
asked for. Same for W2b: rule 6's check was run in the wrong space —
plan-depth moves cannot break a line-reading at an eye that compresses the
back band into one horizontal screen strip.

### W6. The venue's audio palette — the tier's last step

Ships with its e2e proof; the venue is judged as a WHOLE against goal 14's
internal-consistency contract. **The standing debt it inherits:** every fae
voice reasoned so far — the four tower clunks and the Witchlight chime — has
never been LISTENED to.

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
  [U17 residuals](#u17-residuals--three-sites-still-disagree-with-the-shipped-rule--small).
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
  TODAY table shipped as the mitigation; [C4](#c4-one-owner-per-numbering-namespace--small-mostly-done)'s
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
  ([C15](#c15-restore-the-file-this-app-writes-cannot-be-read-back--cuj13-small-medium)),
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

## Where things went (2026-08-14 cleanup)

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
