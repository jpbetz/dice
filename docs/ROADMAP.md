# Roadmap

Open work only, priority-sorted. Shipped work moved to
[SHIPPED.md](SHIPPED.md); section numbers preserved so cross-references
still resolve.

Sequenced against [GOALS.md](GOALS.md) (the authority: core mechanics →
organization → secrecy → systems literacy → effects → customization).
[UX.md](UX.md) holds component specs; [TESTING.md](TESTING.md) governs
how each step is checked. A broken invariant outranks a new feature.

**2026-08-06 — the ladder was interrupted by a date, and the interruption
is over.** Joe's *Your Soul Deal* game is Thursday 2026-08-13, and the
system could not be *set up* for one: nobody could prepare another
player's pools, nothing survived the room evaporating, and the link
carried only a room name. **Tier G shipped whole the same day** —
G0–G6, seven slices, detail in [SHIPPED.md](SHIPPED.md#tier-g--game-night-the-prepared-table-2026-08-06),
design in [PROFILES.md](PROFILES.md). Two of Joe's asks (server-side
persistence, Google sign-in) were deliberately left out with the
reasoning recorded in PROFILES.md §5–§6; what remains of them is
[§5b](#5b-persistence-beyond-the-file-deferred-2026-08-06) below.
**Normal sequencing resumes at Tier 0.**

---

## Tier 0 — Performance & foundation

*Back at the top as of 2026-08-06: Tier G shipped and §0a resumes its
invariant standing. §0i (exit on `uncaughtException`) and §0j's Node pin
left this tier early — Tier G's G0 pre-flight shipped both, since they
only cost anything if they are missing on game day.*

*2026-08-05 big-pass update (workflow `wf_707277c0-0ee`): 20 commits
shipped across §0b/0d/0e/0g (details in SHIPPED.md); 31 designs killed
by three-lens adversarial verify with named defects, preserved below so
future passes don't re-attempt them naively. Ordered by impact
(player-felt magnitude × frequency). Bench baseline pinned in
`.claude/…/memory/perf-baseline.md`.*

### 0a. Roll-arrival Commit C — TWO ATTEMPTS REVERTED, needs third design

**Invariant work. Highest priority.** A+B shipped 2026-08-04
(SHIPPED.md §0a). Commit C first attempt reverted (`1fbb2c9` →
`e612d25`) for face-correction pop + ringIdx race. Second attempt
(2026-08-05 workflow, D1–D6 six sub-designs) killed by three-lens
verify — record the specific defects so the third attempt addresses
them by construction:

- **D1 finalizeProducer would pop dice visible during ceremony
  declare.** `finalizeProducer` unconditionally sets
  `d.mesh.visible = true`; `beginCeremony`'s hide (:3311) fires only
  once. Fix: call `beginCeremony` from within `buildProducerState`,
  not after finalize.
- **D1 `spawnDie` (:788) never syncs mesh.position to body.position.**
  Today's sync flow gets away with it because the first prime at
  :1941 runs before any frame renders. Under slicing, non-ceremony
  rolls would show meshes at origin (0,0,0) until finalize.
- **D1 `fastForwardPlayback` (:4064-4072) reads `currentRoll.duration`
  (undefined during production).** Guard just spins, roll never
  resolves; hidden-tab rolls stall indefinitely.
- **D2 currentRoll population timing undefined.** Today `currentRoll`
  populates at :1962 AFTER face-correction. The design's mapping says
  frames/duration/keyframes/sounds/ringIdx publish at finalize — but
  five sites (broadcast-collect at :9443-9447, skipPlainPlayback
  :3772, skipCeremony :3457-3462, etc.) read those fields during the
  hold window.
- **D6 gate-expression contradiction.** Sketch says commit 2 gates on
  `syncProducer = window.__diceTestMode` AND commit 3 "flips the
  default" to the SAME expression. Under literal read, commit 3 is a
  no-op.

**Third design must:** (a) publish `currentRoll` before slicing so
every reader sees a consistent pointer (fields can populate later, but
the object must exist and reads must be safe); (b) hide dice at spawn
under `buildProducerState` for plain rolls (not just ceremony);
(c) make `playbackHeld` a first-class per-roll flag with enumerated
early-return sites; (d) audit every currentRoll consumer for
read-during-hold safety.

**Also standing open:** the `perf-slicing` scenario the first design
named — direct sync-vs-sliced bit-identity — was skipped in both
reverted attempts. Include it next time.

### 0b. Boot & bandwidth — 3 shipped, delta hello killed

Three shipped 2026-08-05 (SHIPPED.md §0b): LOG_CAP=100,
`if-modified-since` + immutable `/vendor/`, drop per-viewer
dice-array clone.

**Killed:**

- **Delta hello over Last-Event-ID (F3)** — 2 blockers, needs
  redesign. (i) `retained: room.log.map(r => r.rollId)` unfiltered
  leaks secret rollIds to non-rollers, breaking visibility invariant
  (GOALS.md goal 11); must filter by `entryExistsFor(r, viewerId)`.
  (ii) `executeRoll` (server.js:1235) — the primary broadcast — was
  not enumerated in the seq-stamping list, so fresh rolls silently
  drop from the delta (exact failure mode the design claimed to fix).
  A working redesign must stamp roll birth AND every mutation path
  (revealed/cleared/whisper flips) AND filter the retained rollId
  list per viewer.
- **Memoize projections + JSON per broadcast (F4)** — the Map-identity
  precondition it depends on isn't met by current `projectEntryFor`
  (redacted branch allocates fresh `{}` per viewer). The design's fix
  is dismissed as "future pass" — bundle the projectEntryFor stability
  work with F4 next time, don't ship F4 solo.

### 0d. Server hygiene — 6 shipped, 8 killed

Six shipped 2026-08-05 (SHIPPED.md §0d): endStream socket teardown,
centralize `dropStream()`, 30s TCP keepalive, MAX_PHYSICAL_DICE cite,
`DICE_LOG_LEVEL` gate, quote user-derived log values.

**Killed:**

- **Evict SSE streams with growing write buffer** — 128 KB threshold
  below realistic hello worst case (LOG_CAP=200 × 1-2 KB pre-fix);
  can evict fresh healthy WAN joiners before kernel drainage. Needs
  instrumentation on real slow-client join before a threshold gets
  picked, plus coupling to sendEvent's try/catch not to lose it.
- **HttpOnly cookie for playerId (F9)** — multi-tab identity swap
  (cookies per-origin, sessionStorage per-tab, first tab's SSE
  reconnect authenticates as whichever seat wrote last);
  `req.socket.encrypted` is FALSE behind a TLS terminator, so the
  design's Secure-flag detection is inverted; no reduction in URL
  log surface because client still puts playerId in SSE URL.
- **In-process token-bucket rate limits per playerId + IP (F1)** —
  `clientIp = req.socket.remoteAddress` collapses to global under
  Cloud Run's proxy; 429 on `/api/events` trips a self-inflicted
  stream storm (EventSource → CLOSED → reopen → rejoin). Cloud Armor
  rate rule is the correct place, not in-server buckets.
- **Strict security headers (F2)** — `script-src 'self'` blocks
  `index.html`'s `<script type="importmap">` and `lab.html`/
  `chrome-lab.html` inline modules; app fails to boot. Redesign
  needs hash allowlist per inline script or extract-and-serve.
- **Cap concurrent SSE streams per IP + globally (F3)** — counter
  leak: server.js already deletes from `player.clients` OUTSIDE
  onClose in four places before triggering the close event, so
  counter decrement races the eviction. Missing `sendRateLimit`
  helper the sketch calls.
- **Rate-limit /api/pools + cache canonical (F4)** — patchSketch
  internally inconsistent about where the cache lives (`p.__raw`
  vs `player.__poolsRawCache`); final line has undefined `i` and
  index-alignment bug in the map.
- **Global player cap + capacity heartbeat (F6)** — undefined
  `totalStreams` var in log line; MAX_PLAYERS_TOTAL=2000 is a 10×
  cut from currently-legal headroom (MAX_ROOMS × MAX_PLAYERS_PER_ROOM
  = 20 000) and wasn't called out as semantic change; `server_full`
  error code collides with existing MAX_ROOMS cap.
- **Coalesce settings-changed broadcasts (F7)** — fixShape says
  debounce, patchSketch implements leading-edge throttle;
  scenario asserts wrong event type (server.js:668 sends `hello` not
  `settings-changed`).

### 0e. Endurance leak — 8 shipped, 5 killed

Eight shipped 2026-08-05 (SHIPPED.md §0e): log ⟳ delegation + append-
plus-prune, outline clear on banner hide, cluster marker as sinking
record, lazy DecalField, persistent Reveal/Reroll banner buttons,
felt CanvasTexture reuse, shimmer source pool + PostStack scratches,
hoist positionChips scratch V3s.

**Killed:**

- **Bound rollStates by deleting cleared entries (L2)** —
  `applyClearRoll` never nulls `lastEntry`; deleting the rollStates
  row makes `lastRollActionable` (:8869) return `lastEntry` for a
  cleared roll, so Enter/Esc calls `requestCollectRoll` on it.
  Mouseleave re-arm (:2229) and `retireCeremonyFlow` (:3408) hit the
  same shape. Needs `applyClearRoll` to null `lastEntry` first, or
  a different tombstone scheme.
- **Drop stagedVerdict when new roll takes stage (L4)** — redundant
  with `dismissCeremonyUI` (:1765) which already nulls stagedVerdict
  unconditionally at every non-queued playRoll; self-admitted
  regression to `refreshRevealSurfaces` (:3012) which repaints on
  hidden-roll reveal.
- **Skip world.addBody for shelved dice (L7)** — `resetTableSurface`
  (:799, reached from clearTable:1725, 9594, 9705) calls
  `world.removeBody(d.body)` unguarded; would crash post-shelve.
  Also violates physics-truth invariant documented at :1071-1075
  (STATIC bodies parked in world so fast-forward collides with the
  shelf as it is).
- **Dedupe renderPeek and reuse .pk-main (L9)** — snap misses
  `entry.dc` (mods flip Success↔Failure with same total, guard skips
  repaint), `entry.dice/parts` (tweak preserves total, stale per-die
  rows), `entry.playerName/color/label` (header identity can change
  without touching guarded keys).
- **Gate __diceDebug installation on __diceTestMode (L10)** —
  mechanism claim false: main.js is an ES module, so removing
  `window.__diceDebug` frees no module-scope state (bindings pinned
  by module registry, not by __diceDebug getters). Also removes
  live-tab diagnostic surface (`decalsEnable(true)`) Joe uses in
  production.

### 0g. Hot-path polish — 3 shipped, 2 killed

Three shipped 2026-08-05 (SHIPPED.md §0g): byId map in renderLog
(O(N²)→O(N)), stepPlayback per-frame forEach → index loop, hoist
banner-cell DOM lookups. Three companion allocation fixes shipped
under §0e (positionChips scratch V3s, shimmer pool, felt canvas
reuse — cross-cutting concern).

**Killed:**

- **Replace bloom-live scan with felt-bloom counter (T0-NEW-6)** —
  missing seams: `resetTableSurface` (:796-816) wipes tableDice
  directly without going through `removeRollDice`; `shelveRoll` has
  a hello-reconstruction branch (:1181) that calls
  `spawnShelvedDie` for dice that never lived on the felt;
  `applyReveal` has two callees (beginRevealFlip felt vs
  revealShelvedRoll shelf) the design's increment doesn't
  distinguish. Fixable, but the design as-is would leave the
  counter drifting.
- **Track live range in Particle/DecalField (T0-NEW-3)** — uses
  `BufferAttribute.updateRange`, deprecated in three.js r160 (the
  vendored version) — 8-14 console.warn/frame per pool. Replacement
  `addUpdateRange()` allocates `{start,count}` per call, breaks the
  design's allocation-free claim.

### 0h. Build-time vs runtime — ALL 7 KILLED, needs fresh discovery

Seven build-time deferral designs proposed (idle-warm shader programs,
lazy PostStack RT alloc, defer PMREM env, precompute std
shelfPoseCache, dispose PostStack RTs, freeze SETS/SET_IDS registries,
idle-warm bakery, fan out picker warms); all killed. The common
failure mode: designs referenced symbols not in current source
(`warmPrograms`, `warmVariantAsync`), seams that reveal/URL-groups
paths bypass (`getDie` at :3045/:3093 skips the `createDieMesh`
seam), `!window.__lab` gate misfires under ES module hoisting on the
lab page, or `__diceDebug` hooks not yet added. The *concept* is
sound (defer PMREM, cache face topology, precompute shelf poses) —
each design cascaded on a specific missing seam that a fresh
discovery pass would surface.

**Standing sign-off (medium risk):** Cache face topology per die type
— one of the 2 items that survived verify. Ships as a small
follow-up when someone re-audits with the missing seams accounted
for.

### 0i. Server production hygiene — CLOSED 2026-08-06

**Exit + restart on `uncaughtException`** shipped in Tier G's G0
pre-flight (`6c7ca9f`, SHIPPED.md §G0) — armed under `IS_MAIN` only, so
the redaction suite's in-process import can't turn its own failures into
a process exit. Nothing else stands in this section.

### 0j. Operational going-online (deploy-side, 2026-08-05 audit)

Three important items surfaced by a complementary operational audit
(not covered by the in-code Tier 0 workflow); the Node pin shipped with
G0 and the other two remain:

- ~~**Pin Node major**~~ — SHIPPED 2026-08-06 (`6c7ca9f`) as `>=22 <25`
  rather than a bare major: the range blocks the buildpack's silent jump
  while still landing on 24 (what the tree is tested against) or falling
  back to 22, where `24.x` would have turned a missing runtime into a
  deploy-day failure.
- **Add `/health` + bake `GIT_SHA` into deploy** — no way to confirm
  which commit is live without triggering known behavior. Small code
  + Makefile change (`--set-env-vars GIT_SHA=$(git rev-parse HEAD)`).
- **Per-IP room-creation throttle** — a script can burn all 500
  `MAX_ROOMS` slots and lock friends out with `server_full`. Either
  in-server LRU on `remoteAddress` OR Cloud Armor rate rule (Cloud
  Armor is the correct place given the F1 lesson above).

**Nice-to-have:** memory>80% Cloud Monitoring alert, `make logs-tail`,
`X-Robots-Tag: noindex` on HTML, `/admin/rooms` behind shared
secret, DEPLOY footnote for "if you leave Cloud Run", DEPLOY note
that OOM restart silently wipes rooms.

### Refuted, recorded so they stay dead

- **`renderTray` layout thrash.** Real (16 forced reflows per palette
  tap, +18 recalc, ~20 ms wall) but the fix-attributable share is
  only ~5 ms of a ~20 ms tap; the full tap is under the 150 ms
  budget and the loose-die overlay cap holds ✕ count at 7 regardless
  of dice count. Skip.
- **`projectEntryFor` per-recipient allocation.** Measurable
  (~1 ms/broadcast at 40-player caps) but not player-felt; folded
  into the S2 "serialization dedup" note in §0d — not standalone
  work.

### Healthy patterns to protect (verified by the same passes)

- Level 5 post bypass **is** bypassing when idle (empty table renders
  the released direct path, proven at 61.8 dB PSNR — the audit
  reconfirmed it).
- The `(type, set)` material cache is doing its job — no per-roll
  material rebuild.
- `measurePeek`/`positionPeek`'s write-only rAF discipline holds
  (no forced reflow per animation frame).
- The `--draft-h` ResizeObserver keeps the shelf-head pin fresh
  under every non-`renderTray` height change.
- Server projection is honest: every egress path runs
  `projectEntryFor`, and the pass found no leak of hidden values.

---

## Tier 1 — Core mechanics completion

### 1. Notation totality closeout

Close the audited invariant violations so saved pools, history, and
exports carry a roll's FULL intent:

- Implement UX.md §7.6: `check` / `cinematic` trailing flags,
  `# Title | Subtitle` pipe split, `exp` in parse results and
  canonical output, popover Moment round-trip.
- Give face-down a canonical spelling that survives round-tripping
  (shipped as the `held` trailing flag — the `/gmroll` family
  normalizes to `secret` since the terminology amendment, UX.md
  §3.2), so saved variants stop silently dropping privacy.
- Small-batch correctness from the audit: banner breakdown shows
  struck dice and ✴ children (attributed-math invariant); plain-roll
  playback skippable (click/Space fast-forward — the machinery
  exists); reveal state replayed on hello resync (mirrors
  `cleared`); `/api/join` carries `offers`.

### 2b / 2k follow-ups (from prior shipped passes)

- **2b — 720×480 e2e sweep.** The Pools Rack's small-window pass
  wasn't landed; dense chip line + dots-only switcher + sticky
  headers need a headless pin at phone-narrow.
- **2b — drag-and-drop staging as additive affordance** *(Joe
  2026-08-03 play notes)*: tap-to-stage was hard to discover —
  consider DnD from tile to draft/felt. Tap stays primary; DnD is
  the intuition players arrive with.
- **2k — join modal shows the table name pre-join.** Settings arrive
  in the join response, so a pre-join peek needs a new endpoint or
  a name-in-URL surface. Not urgent.

### 2l. Pool analysis — the die spectrum and the dice-value ledger
(2026-08-05, Joe: "I want to support analysis of dice pools") —
**DESIGN, four decisions taken. Slices ①–④ SHIPPED 2026-08-06
(SHIPPED.md §2l); ⑤–⑦ open.**

**Full detail: [POOL-ANALYSIS.md](POOL-ANALYSIS.md)** — the
reasoning, the generated data, and the record of what was killed
and why. Every figure in it is reproducible:
`node tools/pool-analysis-data.mjs`.

Two reads, serving one CUJ — setting up a *Your Soul Deal*
player whose attribute and skill shelves want dice summing to
100. **(1)** the outcome distribution, read *by outcome* not by
value. **(2)** the summed die **maximums** of a shelf — a
character-creation point budget, not a roll total. Unobtrusive
by Joe's own constraint: *"I don't need to see this all the
time… maybe only when editing the saved pools?"*

Designed as a three-entrant judged panel (three adversarial
lenses + a completeness critic); eleven claims that had survived
into all three designs were refuted, including two of the
survey's own numbers. **Then Joe's ruling cut deeper than any
lens**, and the per-die half of the design is his:

> *"We never fold together results in this system. Each die has
> a result. We track those results."* — and, asked whether that
> also forbids counting across the dice in a pool: **per-die
> only, no aggregation.**

**THE NO-AGGREGATION LAW.** Every cross-die device the panel
built dies: the Poisson-binomial count ladder, the per-word "at
least one" line, the chart-order cumulative read, the
combination list Joe himself floated, and the whole *"what does
2× success fold together"* question. **It costs nothing**,
because the joint distribution **factorizes** — dice are
independent and each reads its own column, so a per-die spectrum
is not a summary of the distribution, it **is** the distribution
in its only compact form. Any combination is recoverable by
multiplying. And the alternative was unreadable anyway:
enumerated exactly, `3d6` has 35 combinations topping out at
**5.6%** (nine needed for half the mass) and `1d20+1d8` has 63
topping out at 7.5%. **Recorded consequence:** the forecast
never prints "2× Success" — Joe's own opening phrase — because
that counts across dice. The math is preserved so revisiting
costs a decision, not a re-derivation.

**Ask 1 — THE SPECTRUM BAR.** One bar per die: that die's whole
probability mass in the chart's **own row order** (already
written worst→best, so it reads as a ladder), one tier-colored
segment per word, quiet included. Identical ranks share a bar —
deduplication, not aggregation; mixed pools get one bar per rank
**under its source label**, which lands §2b's requirement for
free (the forecast now mirrors the result row for row, where the
panel's flat list would have forecast one line against a three-
row result). Exact by construction, and **nearly free**: at most
20 lookups per distinct rank, measured 1.3 µs for a d20 and 3.6
µs for `40d20`. No DP, no convolution, no combinatorics —
`pmf()` and `js/odds.js` exist **only for the sum profiles**.

*Why it earns its place:* rank is not a magnitude knob but a
different outcome space. A `d4` **can never** produce a Success,
an Advantage or either Critical — its column runs Blemish →
Minor Success and stops. Five `d4` and one `d20` cost the same
20 points and are not the same purchase in any respect, which is
invisible to a player adding maximums by hand.

**Ask 2 — THE DICE-VALUE LEDGER. [JOE: count physical dice.]**
Sum `DIE_MAX` over the dice guaranteed to hit the felt — base
list plus **advantage partners**, capped at 40; reroll and
explosion excluded as *value-conditional* (`composeRoll` pushes
those only after seeing a value). Verified: `2d20` → 40 ·
`1d20+1d4` → 24 · `d100` → 100 · the seeded nine `1d6` → 54.
**This is what kills the spelling bug:** `2d20kh1` canonicalizes
to `1d20 adv` and the canonical is what gets *stored*, so a
`spec.dice` count would silently price it 20 against
`2d20 kh1`'s 40, undiscoverably. Counting physical dice makes
both read **40** — removed, not documented. **The word is
`dice value`, never "ceiling"** (false in both directions: `4d6dl1`
values 24 and caps at 18; `1d6!` values 6 and reaches 24).

**Where it lives. [JOE: on with `✎ Edit pools`]** — one gate, no
new control; manage mode becomes **manage-and-measure** and
§7.18 must say so rather than let the gate widen by accident.
**[JOE: the target is session-only]** — no localStorage, no
YAML, no `dice.*.v1` key, so goal 12 stays unexposed and
PROFILES [JOE-2] stays unmade; `100` appears nowhere in code.
Shelf and region figures form **one right-flush ledger column**,
steel and ivory, no gold in the management column; `.ph-rule`
keeps its hairline (promoting it to a data track would regrade
§7.17). **Both render paths build `.pool-sec-head`** — the
foreign path needs the same wrapper with no figure, or foreign
heads silently lose their dress.

**THE HONESTY PASS — SHIPPED 2026-08-06** (`b91a32b`,
`4c92ae6`, detail in SHIPPED.md §2l): every rendered preview now
prints exact min/avg/max from `js/odds.js`, with the rare
cap-truncation corners seeded-sampled and labeled. Two warnings
from the audit still govern slice ④'s per-die branch: §1.3 makes
the preview string load-bearing ("the preview *is* the
validator") in a fixed-height slot, so the per-die branch must
**replace** it, never blank it; and the success branch ends in
`visSuffix`, so a naive rewrite drops the visibility echo — the
`preview-honest` e2e now pins the box surface, but `#pop-preview`
still has no assertion.

**BUILD ORDER — seven slices, each independently shippable.** ①
the math floor + the honest preview — **SHIPPED 2026-08-06** · ② ③ ④
— **SHIPPED 2026-08-06** (seam `755808f` · ledger `25012c6` · bars
`711771e`, then the polish wave `c7b90fc`…`fea43e6` — collapsed
mixture default, hover readout, sectioned help, 'pools' vocabulary;
SHIPPED.md §2l) · the profile
seam (`forecastFor(spec, tools)` with `pmf` injected so
meanings.js stays dependency-free) · ③ the dice-value ledger —
**ask (2) usable here** · ④ the spectrum bars — **ask (1) ships
here**, now the *smallest* UI slice · ⑤ the ledger sheet
(`placeAnchored` extracted from `openSetMenuFor`, not ported;
session-only target) · ⑥ the sum read · ⑦ verification + docs.
Slices ③ and ④ each earn ONE interactive pass (ephemeral port —
never 8123).

**Verification — this breaks exactly TWO assertions, both in
`sheet-pass`** (lines 2104 and 2118, the two read while manage
mode is on): appending a figure makes `.pool-sec-head`'s
textContent `'Attributes54'`. Re-point them at `.psh-word`.
Nine assertions read that text across four scenarios and the
manage-mode-only rule protects the other seven **by
construction** — rest-state reads and the foreign rack never see
a figure. **Build it CSS-hidden instead and all nine break**
(`display:none` still concatenates), which is why the figure must
be *not built* rather than hidden. New: `pool-forecast`
(`groups`, `meanings`) and `rack-dice-value` (`groups`,
`chrome`). Units hand-appended to `package.json`'s literal `&&`
chain — there is no glob. `rerenderInterpretation()` must gain
the popover, or a teammate flipping the room's system leaves a
stale forecast with no visible cause.

**Decisions still open** (POOL-ANALYSIS.md §9): whether the
parser stops collapsing `2d20kh1` · portable-YAML forward
compatibility · which popover doors forecast · what a pool-scope
forecast forecasts, given `stageGroup` drops mods while the rail
rolls them · the offer card · the e2e tag · where the rack
figure lives, given `#pools-head` is deliberately non-sticky.

**GOALS: 4** (goal 4 names *summing values* as toil the system
owes the player — this is that sentence applied to character
creation) · **5** · **6** (profile-produced; no Soul Deal rule
and no `100` outside meanings.js) · **7** (render-time, client-
side: no endpoint, no wire key, no stored field, no build step)
· **12** closed by the session-only ruling.

---

## Tier 2 — Organization (goal 5, the biggest experience gap)

### 3. Table organization & concurrency

- **Per-roll chips lifetime**: chips keyed by rollId and kept until
  that roll is Done/evicted (today a new roll erases every older
  roll's chips while its dice remain — only the latest roll is
  readable on screen).
- **Per-roll landing zones**: deterministic zone allocation from the
  roll seed/order; throws target the roll's zone; settled older
  pools nudge or whisk toward the edge when a zone is granted.
  (Per-player mats later become a visual skin over this machinery.)
- **Ordered eviction, not the 40-dice wipe**: evict oldest settled
  rolls one at a time via the existing sink/fade, ordered by server
  roll time so all clients converge; kill the client-relative full
  reset.
- **Table resync**: hello carries which logged rolls still sit on
  the table; joining/reloading clients replay them settled (final
  pose, no tumble) — today a reload shows an empty felt while
  everyone else still sees dice.

---

## Tier 3 — Secrecy refinements (goal 11)

The visibility core shipped (step 4). What remains is refinement.

### 4b. Visibility refinements

Deferred out of step 4, each with its reason. Nothing here blocks the
ladder; all of it is polish or a new rung.

- **Sticky mode + its badge, as one change.** A remembered per-
  player default (Foundry's roll-mode ergonomic) is only safe
  alongside a standing eye-slash badge on the Roll button and the
  mini pills — a sticky non-open default with no persistent signal
  is the accident vector §3.2 names. Ship both or neither.
- **Silent whisper.** A whisper whose bystanders learn *nothing*,
  not even that a roll happened. Today every rung but `secret`
  makes existence public (§3.1's shrouded dice), and PF2e's
  precedent is that roll-existence is itself mechanically
  meaningful information. This is a fifth rung, not a tweak: it
  needs `secret`'s omit-entirely projection with `whisper`'s
  audience.
- **Reveal to a subset.** Fantasy Grounds reveals to one player;
  module precedent exists for "reveal to the roller". §3.3 rejected
  it for step 4 because reveal is currently total and one-way,
  which is what makes it auditable. Revisit only with a concrete
  table need.
- **Audience legibility.** A shrouded viewer reads the audience
  only when the roll has no `# comment` (§3.0) — `label` carries
  one or the other. Decide whether "who was whispered to" deserves
  its own always-present field, or whether comment-shadowing is the
  correct privacy default.

---

## Tier 4 — State capture (goal 7)

*Two of this tier's items were pulled up into **Tier G** on 2026-08-06:
the file door (download/open) and "persistent identity and saves", which
Tier G answers as the prepared table. What stays here is what game night
does not need.*

### 5. Capture mechanisms

- Roll-log export (copy/download text + CSV) — the online log is
  currently uncapturable. *(Tier G's `Blob`/`a[download]` helper shipped
  in G1 — `portableDownload()` in main.js; this reuses it rather than
  inventing a second save path.)*
- Local roll statistics (per-player distribution, average-vs-
  expected) — the OBSERVED half, and a **dependent of §2l**, not
  its sibling: §2l's engine is the only source of an *expected*
  value in the tree. Second blocker, unnamed until the §2l pass
  found it: online the client persists no log at all
  (`if (!netOnline) save(LS_LOG, log)`), so there is no durable
  substrate for a per-player distribution yet.
- ~~Room settings (felt/system) in the portable YAML~~ — **moved to
  Tier G §G2** as the `table:` section. *(Was "snapshot them into the
  copy-link URL beside `#g=`" — dead with the URL codec, 2026-08-04.
  The URL carries no user state; export is where capture lives.)*
- ~~**Persistent identity and saves**~~ *(Joe 2026-08-04)* — the thing
  the URL was pretending to be. **Answered by Tier G**: the table file
  is the durable copy ([PROFILES.md](PROFILES.md) §5), and the two
  heavier readings of "persistent" — a server-side store and Google
  sign-in — are recorded there as deliberately deferred, with cost, and
  restated as §5b below.

### 5b. Persistence beyond the file — DEFERRED (2026-08-06)

Joe asked for both of these in the game-night brief; both were cut from
Tier G with reasons, and they are here so the cut stays a decision
rather than an omission. **Neither is needed for game night** — the
table file plus G6's re-push cover it (PROFILES.md §5).

- **Server-side persistence.** A `DICE_STATE_FILE` snapshot of room
  setups (never logs, never seats) gives real durability *locally* and
  **nothing on Cloud Run**: the filesystem is ephemeral and
  `--min-instances 0` means the instance goes away between sessions
  (DEPLOY.md). Genuine durability there means GCS or Firestore — a
  network dependency in the request path and an explicit amendment to
  goal 7's "the server holds no persistent state." Revisit only with a
  reason the file cannot serve.
- **Google sign-in.** Serves neither CUJ better than the file does: it
  does nothing for CUJ1 (the organizer *is* the durable store) and helps
  CUJ2 only for a player who wants their pools on a second device and
  kept no file. The cost is not the button — it is OAuth redirect
  handling, RS256/JWKS ID-token verification, **a real per-user server
  store** (i.e. exactly the goal-7 amendment above), a consent surface,
  and an account concept in an app whose help text currently says,
  correctly, that there are none. Revisit if players actually ask.

---

## Tier 5 — Effects & ceremony polish

### 6. Ceremony refinements

- Roller-held declare phase (§2.4's user-controlled dwell with a
  commit button; the fixed 1.35 s timer stays as the spectator
  fallback).
- "Always skip roll ceremony" personal setting; crit overlay made
  skippable; Esc joins click/Space as ceremony skip.
- Reveal-beat polish on top of step 4's §3.1 flip: chip chorus +
  verdict stagger on the revealed entry (the flip itself ships with
  visibility).

### 6b. Dice-on-card — BG3 cinematics & the seated shelf — DECISIONS PENDING

*Joe 2026-08-04 · ideas + research done, doctrine calls pending.*

Two ideas from Joe, sharing one technical question ("can WebGL dice
sit on top of an HTML panel?"):

1. **Card cinematics.** Baldur's Gate 3 rolls its skill-check die
   ON an ornate card — the card is the stage, the die drops onto it,
   bounces, settles in its center, and the tally dresses around it.
   "It looks super cool. I was wondering if we could achieve that
   for our cinematics" — i.e., the check/cinematic ceremony's dice
   tumble on the card instead of on open felt below a floating
   card.
2. **The seated shelf.** Collected dice REMAIN physically on the
   table, "with the card more clearly shown until cleared, and
   maybe placing the dice on the card" — the cluster seated on a
   visible card/plaque that carries its identity, instead of
   today's anonymous whisked pile (answers §2i E
   `shelf-clusters-anonymous-at-rest` wholesale).

**Research (2026-08-04, preserved).** A single WebGL canvas is ONE
rectangle in the DOM stacking order: the browser composites whole
elements, so HTML can sit entirely above or entirely below the
canvas, never between two meshes. Four ways to get dice "on" a
card:

- **(i) The sandwich** — a second `alpha:true` canvas above the
  HTML panel, `pointer-events:none`, camera-synced, rendering only
  the dice that ride the card. Real; standard technique. Cost
  HERE: GL contexts share nothing, so the top canvas re-instantiates
  dice geometry, the themed materials, PMREM env, shader clocks,
  and its own post chain or the dice visibly lose their §9 dress
  mid-ceremony — worst exactly where fidelity matters most.
- **(ii) Fully diegetic panel** — the card as a textured quad
  in-scene, text rasterized into it. Correct depth/lighting/shadows,
  but the panel's text becomes pixels: violates the text-layer
  audit rule (copy/paste + screen readers keep the read) unless a
  parallel DOM is maintained. Rejected as the general mechanism.
- **(iii) The bakery illusion** — no live dice at all: bake THIS
  roll's dice at settled orientation, rolled face up, via the
  diceart (type, set) bakery seam, and place the images IN the HTML
  panel (the ledger rows' evidence slot — composes with §2i A).
  Perfect compositing, works on every surface incl. peek and log.
  The right answer for "the panel shows the actual dice"; it
  cannot give tumble-on-card.
- **(iv) IN-SCENE CARD SURFACE, DOM TYPOGRAPHY — the recommended
  shape for both ideas.** The card's SURFACE is a textured plane
  mesh in the 3D scene (parchment/bronze plaque, slightly proud of
  the felt, a static physics box so dice really land, bounce, and
  rest on it with true shadows/effects); the card's TEXT stays HTML
  floating over the canvas — exactly how chips, the mat-text decal,
  and every overlay already work. No second context, no rasterized
  text, and the §9 effects ladder applies to the dice untouched.
  The ceremony already controls the throw, and every projection
  went felt-rect-relative in 2h, so aiming the tumble at a
  card-shaped zone (screen rect → felt coords) is existing
  machinery. BG3's look decomposes into: in-scene stage + overlay
  type + a throw aimed at the stage.

**Tradeoffs & decisions pending before either ships:**

- **Quiet-chrome tension (the seated shelf).** The shipped shelf
  contract is dot-only markers, the peek does the talking; a
  standing card per collected roll is louder standing chrome.
  Decide: new contract (the card IS the marker, identity at rest)
  vs. a middle state (card fades in on approach, seats the dice
  always). This is a doctrine change, Joe's call, not a drive-by.
- **Felt real estate & Tier 2 interplay.** Seated cards occupy
  zones; step 3 (landing zones, ordered eviction, resync) should
  probably land first or together — a seated card is a natural
  zone visualization, and eviction must know how to retire one.
- **Ceremony surface ownership.** Does the in-scene card REPLACE
  the HTML intent/verdict cards (one stage, §2.4 rewritten) or sit
  beneath them as the landing stage while the HTML cards keep the
  typography? Recommendation: keep HTML cards as the type layer
  (a11y unchanged, aria-live intact), let the plane be pure stage.
- **Effects budget.** A card plane wants shadows, maybe a decal
  edge, maybe a die-light catch — cheap; but if the ceremony camera
  moves in (BG3 frames tight), the felt LOD/vignette and post
  tuning need a pass. Camera choreography is its own design
  decision.
- **Physics honesty.** Dice must genuinely land on the raised card
  box (face correction untouched — the correction happens before
  the visual settle), and a card must never trap a die
  half-on/half-off illegibly: the zone aim + a low lip, or a
  settle-nudge, decides this.
- **Solo/static parity.** All of it is client render machinery —
  works offline; nothing rides the wire except what already does.

### 7. Initiative helper

One shared action; everyone's roll collects into a sorted order list
visible to the room until cleared.

### 8. Special dice & success counting

Fate/Fudge dice, coins, d100 paired-read display; success-counting
joins the system-profile registry from step 2. Needs dice.js custom
face sets.

---

## Tier 6 — Customization & delight

Most of §9's engineering is closed (see SHIPPED.md §9). What remains
is art direction, one pool-icon delta, and the tumbled-resin
geometry tier.

### 9. Dice sets — art direction continues

Creative brief (Joe 2026-08-03): cool-looking dice of different
materials and types, natural AND supernatural — imagine what
*faerie* dice, *dryadic* dice, *wizard* dice, *warrior* dice might
look like. Special effects and strong themes **merged subtly into
the dice themselves** — theme lives in material, edge, glow and
face treatment, never as noise on top; the numbers stay readable
(GOALS legibility invariant) and the physics/face correction
machinery is untouched (a theme is a skin over dice.js geometry +
materials). Small experimental sets to find the bar; new sets earn
their way in.

### 9b. Pool icons

*Joe 2026-08-03.* An icon on a pool's tile where die art stands
today (the Rack anticipated this: "tile icons replace die art
later"). A default icon set for Your Soul Deal's attributes
(Strength and kin) plus a library players pick from for custom
pools. Zero-dep: hand-drawn inline SVG sprites, no icon fonts or
CDNs. The icon is pool identity, so it rides everywhere the pool
does: the tile, the draft's source chips, the popover identity
strip (picker lives there, beside name/shelf), published racks
(display copy), and the portable YAML (present-or-absent — unknown
icon ids fail closed to die art). Die art remains the default for
icon-less pools.

### 9c Tier 3 — Tumbled resin

Composes with Tiers 1+2 (shipped, see SHIPPED.md §9c). Subdivide
faces, blend toward a superellipsoid for the no-flat-anywhere
pocket-dice look; today's `wear` displacement is a crude version.
Constraint: the dead-flat digit plane (legibility) — face bulge
stays subtle or shading-only, as `pillow` already is.

**Rejected (record):** normal-map edge rounding (edge bands are
deliberately UV-less; silhouette stays hard; falls apart close-up
— inferior to Tier 2 at similar effort) · SDF raymarched dice
(perfect rounding, but a custom-shader universe that forfeits the
three.js lighting/shadow/post pipeline — a rewrite, not a feature).

**Invariant, restated:** all fillet tiers are RENDER ONLY. The
physics hull, face values and read logic stay canonical — a soft
edge can never change how a die lands (the §9 Level 3.5 contract).

### 10. Custom experience templates

The editor UI for the (currently dormant) `experiences` settings
key; until this ships the key stays server-validated but unconsumed
by design.

### 12. Per-player roll mats

Visual skin over step 3's zone machinery; mat color per-player,
visible to all.

### 13. Breakout rooms

Side tables with shared identities (goal 11's "lower priority"
advanced privacy; design when reached).

### 11. Physical pool building — DEMOTED

The §7.1 shelf/felt delight (demoted per goals 3–4: physical
interaction is optional delight, never required toil).

---

## Conformances to protect (from the audit)

How these are checked is governed by [TESTING.md](TESTING.md):
scripted-first (unit + fuzz + tagged e2e per step; full sweep pre-
release), and every build step ships with its e2e scenario.

Server is the sole value authority (client-sent values ignored) ·
notation re-parsed server-side, never trusted from the client ·
canonical form is a tested byte-stable fixed point · every rack
transport fails closed on hostile input (the YAML parser names the
line; migrateGroup drops what it cannot read, never the pool) ·
static-hosting solo works completely · the capability matrix is one
shared code path, not parallel implementations · settings echo-
apply with no optimistic divergence · `cleared`/`exp` flags are
present-or-absent so plain payloads stay byte-identical · control/
bidi stripping is mirrored across all four layers with surrogate-
safe truncation (and `#` is banned from player names at every entry
point — whisper addressing must stay total) · `playerGone()`
rejoins only on unknown_player/room (never mints identities on
expected 404s) · broadcast already loops per-player (step 4's
redaction hook) · server-side per-recipient projection
(`projectEntryFor`) is the ONLY path a roll entry ever leaves the
server — every egress (roll broadcast, POST responses, reveal,
hello, `/api/join`, shelf/log resync) goes through it · redaction
is **absent data, never hidden data**: a redacted or omitted
projection carries no values for a client to decline to render ·
whisper audiences pin `playerId`s at roll/offer creation (a rename
never changes who may read a roll; unknown names fail closed as
`unknown_audience`) · reveal is authority-checked server-side
(`revealAuthority`, 403 `not_reveal_authority`), never gated by
which client drew the button.
