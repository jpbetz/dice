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

**2026-08-07 — the front door was never on the ladder.** Joe: *"the
roadmap is not well aligned against core CUJs where the users use the
UI… I think we need a lobby → table flow."* Rooms have worked since the
beginning, but nothing in the UI ever let a player *reach* a second one,
and the bare URL put every stranger on one shared felt. Five CUJs and
three decisions are recorded in
[§3b](#3b-the-lobby-and-the-table-flow--design-three-decisions-taken);
§2k closed (G5 shipped it) and §13 moved there from the bottom of Tier
6. **§3b L0 is a defect and outranks the rest of §3b**; L1–L4 sequence
normally, behind §0j's room-creation throttle.

**2026-08-07 (later) — Joe's three UI notes, two shipped the same day.** A
multi-agent UX design pass (two surfaces, three stances each, judged and
adversarially verified) produced the two specs now in
[UX.md §7.21](UX.md#721-the-named-verb--a-cards-main-act-says-its-name-2026-08-07)
and [§7.22](UX.md#722-the-collapsed-pool-rail--pick-three-roll-once-2026-08-07);
both shipped. The verify pass also turned up a **live bug** the suite could
not see — `el.hidden` was setting a property no author-origin `display` was
obeying, so every face-up card shipped a Reveal the server 403s and every
held card a REROLL of an unreadable spec (fixed, `631a562`). Joe's third
note is [§3c](#3c-dice-on-the-table-before-they-are-rolled-joe-2026-08-07)
below — his own "not as urgent".

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
- ~~**2k — join modal shows the table name pre-join.**~~ — **CLOSED
  2026-08-07, shipped by G5.** The entry said a pre-join peek "needs a
  new endpoint"; the endpoint shipped as `GET /api/table`
  (server.js:2480, `rooms.get` not `getRoom` so a peek can neither mint
  a room nor touch a lingering room's TTL), and the seat modal renders
  the name and the prepared seats before you commit
  (`renderSeatChoices`, main.js:10998). Arrival is now §3b's L2, which
  audits what the peek should say beyond the name.

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

*§3 is ONE felt's organization — zones, eviction, resync. Organizing
across tables is §3b, which shares only the word "table".*

### 3b. The lobby and the table flow — **L0, L1, L3 SHIPPED 2026-08-07**
(Joe: *"the roadmap is not well aligned against core CUJs where the users
use the UI… I think we need a lobby → table flow"*)

**Status.** L0 (the lobby exists, and the suppression pass), L1 (New
table, the minted key, the invite chair and the per-seat chairs) and L3
(the recents list, Leave table) shipped — `f1575ac`, `94f3069`,
`765b7da`, detail in [SHIPPED.md](SHIPPED.md). CUJs 1–4 run end to end.
**L2** (arrival polish — whether the pre-join peek should also say how
many people are here) and **L4** (sub-tables, CUJ5) remain open below.
The blocker restated: §0j's per-IP room-creation throttle is now owed
*before this is exposed publicly*, because L1 turned room creation into a
button.

Rooms have been real since the beginning — `?room=` addresses a table
(main.js:10123), 500 live rooms (server.js:70), per-room settings, seats
and prepared profiles (Tier G), a 12-hour linger (server.js:154), and a
seat scoped per room by construction (`seatKey(room)`, net.js:100). What
has never existed is a way to **reach** a second table. You hand-edit the
address bar. The roadmap's only multi-table entry was §13, parked at the
bottom of Tier 6 with "design when reached".

**The surfaces — the lobby row, the empty seat, what the lobby must
suppress — are specified in
[UX.md §7.20](UX.md#720-the-lobby-the-empty-seat-and-the-way-to-a-table).**
This section holds the sequencing and the rulings; that one holds the
components.

**Sequenced against the CUJs, not against the machinery** (Joe's five,
2026-08-07):

1. *"I just need to do a dice roll NOW"* → **L0**
2. *"I'm preparing to play with friends, I need to set up a table and
   then somehow get all the players to join my table"* → **L1**
3. *"My friend invited me to play, I want to join up on them"* → **L2**
4. *"My game is over, I want to join another table with other friends,
   or return to the lobby"* → **L3**
5. *"I need to split a group into two smaller groups at their own tables
   for a bit, and maybe return to the main table"* → **L4**

**[JOE: no public global tables.]** The lobby lists only the tables THIS
browser has visited — client-side, so goal 7 is untouched and the server
never publishes a directory of live rooms. This is also what keeps goal
10 honest: there is no access control and there never will be, so a
*listed* table is a *walk-in-able* table, and a public list would make
every game in progress interruptible by any stranger who loaded the
deployment. The room key is the door.

**[JOE: sub-tables are public to the top-level table.]** The one
directory in the system is scoped to a parent: a table that splits lists
its children to everyone sitting at it. In-memory on a room the server
already holds — no persistence, no new store.

**[JOE: URL sharing gets people to the start table — "but make the link
sharing easy".]** With no directory, the link is the *only* way in, so
it carries CUJ2 and CUJ3 by itself. Today it is the third item in a menu
behind the identity chip (index.html:301). That is the gap L1 closes.

**The engine is already built.** `initNet()` (main.js:11256) has exactly
the branch a lobby needs — join, else `netOnline = false`, its own felt
settings (`LS_ROOMSETTINGS`), its own log, its own collect mirror
(`soloCollectEntries`). The lobby is a third state of that branch, not
new machinery: **the lobby is what static hosting already renders**, so
goal 9 gains a name rather than a burden.

**L0. The front door is a lobby, not a shared room — DEFECT, ships
first.** Today no `?room=` joins a server room literally named `table`
(main.js:10123), so on the deployed table every stranger who opens the
bare URL lands on **one shared felt** together. And a first-time visitor
is stopped by the name prompt before they can roll anything, which is
CUJ1's whole complaint. Change: no `?room=` means the lobby, and the
lobby does not call `connect()` at all. No name is asked — you are alone
and nobody needs to address you; the prompt moves to where it is already
asked, on entering a table, where G5's peek already runs.

**L0 is bigger than routing, and the surfaces are specified in
[UX.md §7.20](UX.md#720-the-lobby-the-empty-seat-and-the-way-to-a-table).**
A 2026-08-07 audit of every room-assuming site found **no crash and no
unguarded `net.` dereference** — the lobby is safe. It is not *honest*:
the page keeps talking like a table. `inviteUrl()` fabricates a working
link to the shared room named `table`; the "Everyone at the table"
settings section silently becomes personal under a heading that is a lie;
`Apply to table` stands enabled with a refusal as its only outcome; a
held roll offers a Reveal to nobody; and `roomSettings.tableName`
survives from `LS_ROOMSETTINGS` into the nameplate **and the tab title**,
so the lobby wears the name of whatever table you last configured. The
`solo` pill is deleted rather than reworded — it is a `<span>` in a
channel `showSettingsNote` borrows on a 3 s timer, so it can neither be
tapped nor reliably survive; §7.20 has the four-count argument and the
affordance that replaces it. **One live bug surfaced on the way**, owed
regardless of this tier: a whisper-spelled saved pool opened offline
prints "no one else is at the table yet" and silently empties the pool's
audience (main.js:7752, 7761).

**L1. Making a table, and the link that gets people in (CUJ2).** A "New
table" verb: name it, land in it. Keys must be unguessable rather than
`?room=barn` — with no access control the key IS the door, and
server.js:2472 already carries the comment worrying about crawlers
guessing `?room=` values. Then the sharing pass: the invite comes out of
the identity menu to a visible affordance at the table, one tap to copy,
`navigator.share` where it exists (a phone hand-off is literally CUJ2's
"somehow get all the players to join"). **Half of this is already
built** — `&as=Name` pre-selects a prepared seat (main.js:10969), which
PROFILES.md's G5 row already calls "CUJ2 end to end. One link, six
players, right pools." A per-seat link ("Bo, this is your seat") is
composition, not new work. *Deferred rung:* a QR code for in-person night — zero-dep
means hand-rolling an encoder, so it earns its own decision.

**L2. Arriving (CUJ3) — mostly shipped, needs an audit.** §2k closed
above: the peek shows the table name and prepared seats pre-join. What
is left is judgment, not plumbing — whether the peek should also say how
many people are here (roster count is live presence, cheap, and answers
"did I follow the right link?"), and what arrival looks like for a
visitor with a stored name versus one without.

**L3. Leaving — the table switcher (CUJ4).** A recents list in the lobby
(`{room, name, last seen}`, localStorage, capped, with a forget), and
"Leave table → lobby" as a real verb. **Naming collision to resolve
first:** `idm-leave` is today "Leave & switch seat" (index.html:300) and
switches SEATS, not tables. Mechanism: **navigate** (`?room=`, full
reload). A same-page swap reads nicer but `ROOM` is a module-level
`const` (main.js:10123) and `netOnline` appears at 49 sites, all of them
assuming the room identity does not change under them — an invasive
refactor for a transition that happens a few times a session. Navigate
first; record the swap as an optimization gated on boot cost (§0h).

**L4. Sub-tables (CUJ5) — this is §13, redefined and pulled up.** Split
creates a child room, listed to the parent's players (the scoped
directory above) and carrying a parent pointer, so "return to the main
table" is a link rather than a thing you have to remember. **§13's hard
part turns out not to be hard:** the display name is origin-global
(`dice.name.v1`, main.js:10122) and so are the pools, so identity walks
into a breakout for free; the seat being per-room is *correct*, not a
gap — a child table mints its own. Open: whether a child inherits the
parent's felt and system (probably — same game), and what an orphaned
child is when the parent's linger expires (answer: just a table).

**BLOCKER before any of this is exposed publicly: §0j's per-IP
room-creation throttle.** L1 turns room creation into a button; 500
slots (server.js:70) are burnable by a script today, and §0d's F1 lesson
already named Cloud Armor as the right place rather than in-server
buckets.

**What does not change** — recorded so the review does not re-litigate
it: goal 7 (recents are client-side, the sub-table directory is
in-memory) · goal 9 (the lobby IS the static-hosting table) · goal 10
(no access control — which is *why* there is no public list) · goal 12
(no lobby presence, no summon, nothing chat-shaped).

### 3c. Dice on the table before they are rolled (Joe 2026-08-07)

*"I think in addition to being able to roll dice, the ability to put the
dice on the table (in a collect area), so that you can roll them in the
future might be useful, but not as urgent."*

His own priority: **not as urgent**, recorded here so it does not evaporate.
Physical dice-set-aside — you place dice on the felt now and roll them
later — which is the physical-table instinct goals 1 and 3 keep pointing at,
and which §11 (physical pool building, DEMOTED) is the neighbouring idea.

**What already exists that this composes with:** the collect shelf (§7.7)
is a *post*-roll parking area with five slot positions and real settled
poses — this asks for the same furniture *pre*-roll · the draft/tray is
already "dice chosen but not yet thrown", so the question is largely whether
the draft gains a PHYSICAL representation on the felt rather than a new
mechanism · §3's landing zones and ordered eviction would have to know about
a reserved area that is not a roll.

**Open before it can be designed:** is the placed set per-player or shared
(goal 10 says anyone can grab dice, which argues shared, but then two
players' set-asides collide on one felt) · does it survive a reload and a
rejoin (the tray does not, and goal 7 says the server holds no state) · what
it means to "roll them" — does the set-aside carry a pool identity and
modifiers, or is it bare dice, in which case the attributed-math invariant
has nothing to attribute.

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

### 13. Breakout rooms — MOVED to §3b L4 (2026-08-07)

Side tables with shared identities. Sat here on "design when reached"
because it read as advanced privacy (goal 11's "lower priority"); it is
actually **navigation**, and it was the roadmap's only multi-table entry
while the front door had no lobby at all. Joe's CUJ5 (*"split a group
into two smaller groups… and maybe return to the main table"*) sequences
it with the rest of the table flow, and the "shared identities" half is
most of the way there already (§3b L4). Section number kept so
cross-references resolve.

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

---

## Tier U — The converged UX: the audit closeout (2026-08-08)

**2026-08-08 — a week of convergence, audited.** Joe: *"It's taken a week,
but we're finally starting to converge on a UX that is simpler and more
consistent. I'd like you to do a full analysis of it and catalog its
strengths and weaknesses."* Five stances (newcomer, GM/table, accessibility,
doctrine, consistency) read the shipped experience at
`1b7a8f2` against the source and sixteen captured frames; every finding was
adversarially verified and only survivors are recorded here. (Five stances
ran in the main pass — newcomer, GM/table, accessibility, doctrine,
consistency; touch/tablet errored and was re-run separately, see
[UX-AUDIT.md](UX-AUDIT.md) §H.) **This is a
design audit, not a bug hunt** — but two of its findings are defects, and
one is a shipped CUJ that stopped working for returning players.

**What landed.** The hard part converged: the primary verb is one
constructed object in both views, geometry no longer moves, sections
migrate losslessly, and privacy is architectural rather than cosmetic. The
week did not finish the seams — the draft silently drops the intent the
notation exists to carry, the default system (*Your Soul Deal*) keeps
falling through render gates written for sum systems, and UX.md is stale on
the newest surface it describes.

**Where this sits.** **U1–U3 are defects and outrank the rest of the
ladder** — U1 and U2 break goal 11 and §7.8's notation-totality invariant
in the *fail-open* direction, and U3 breaks the CUJ2 claim G5 shipped
against, with game night on 2026-08-13. **U4–U15 are cheap and clearly
right** and can ship in any order behind them. **U16–U26 are marked DESIGN
FIRST or carry a batch** and sequence normally, behind Tier 1. Sizes are in
the headings. Per [TESTING.md](TESTING.md) each rung ships with its e2e
scenario; where the audit found the suite *blind*, the scenario fix is named
in the entry rather than left to the step.

### U1. The draft drops its intent — `stageGroup` carries only dice — DEFECT, small

*Audit A1 (major). The sharpest finding in the audit.* The same pool sends
two different rolls depending on whether the panel is open. `rollRailPool`
(main.js:7547) round-trips the pool through the grammar and fires with
everything — dc, moment, visibility, keep/drop, reroll, explode, set.
`stageGroup` (main.js:6503) — the expanded rack's tap, the digit keys, **the
primary path** — pushes only dice, source label and set; its `dropped` note
is built from `mods` and `dc` alone, and **`res.exp` (moment + subtitle),
`res.comment` and the parsed visibility are never read**. So
`Sneak Attack = 3d6+2 dc12 cinematic held` fires face-down and cinematic
from the 112px rail and lands as a bare open `3d6` in the workbench — the
exact failure §7.8 names as a GOALS-level violation (*"a pool meant to be
secret rolls in the open on the next machine that opens it"*, UX.md:1262),
failing **open** on a goal-11 surface, while `rollRailSelection` fails
*closed* to `secret` on the same data a few dozen lines away.

**Change:** write `res.exp`, `res.comment` and `visOfParse(res)` into
`boxExtras` — the fields exist and `syncBoxFromTray` already preserves them.
Anything that genuinely cannot ride must join `dropped`. Also silent and in
scope: the partial stage at the 40-die cap (a chip labelled "Strength"
holding half of Strength). Closes the expanded/collapsed behavioural fork in
the same change.

### U2. An invalid box plus staged dice rolls the tray, open — DEFECT, small

*Audit A2 (major).* `usable = cmdResult.ok || tray.length > 0`
(main.js:5504) arms the plate on staged dice alone; `paintCmd` only syncs
when `res.ok`; `rollDraft` falls through to
`requestRoll([...tray], formula(tray))` (5563) carrying **no visibility, no
dc, no exp, no mods**. Type `2d8 secret`, break it with one character, press
the plate: it rolls `2d8` in the open. `offerDraft` has the identical
fallthrough (5602). The box's own Enter is correctly gated (6049) — the
hazard is the plate click and the global Enter. §1.3's "one spec object, two
projections" has no answer for the moment the projections disagree; the safe
answer is to do nothing, loudly.

**Change:** when the box is non-empty and the parse fails, disable the plate
or route the press to the existing `cmd-shake` + `#cmd-slot` error path.
Stop silently substituting the stale tray.

### U3. The prepared seat never reaches a returning player (CUJ2) — DEFECT, medium

*Audit E1 (major).* `initNet` prompts for a seat only when `dice.name.v1` is
empty, and that key is **origin-global**. A returning player opening an
`&as=Bo` invite never sees the seat picker, never gets Bo's pools; the
parameter does nothing. §7.19's *"one link in Discord, six people, each
landing at the right seat"* — and PROFILES.md's G5 row, *"CUJ2 end to end.
One link, six players, right pools"* — hold only for six people who have
**never opened the app**. The only recovery is `Change seat…`, which says
nothing about prepared seats.

**Suite is blind:** the `prepared-seat` scenario passes because the harness
seeds no name. Fix the fixture in the same step — a returning-player variant
with `dice.name.v1` pre-seeded — or this reopens silently.

**Design call inside it:** how origin-global identity and per-table seats
interact. Minimum: an `&as=` link reaches the picker despite a stored name,
pre-selecting the named seat. **Game night is 2026-08-13** — this is the
one audit finding with a date on it.

### U4. The record: a WHAT IS TRUE TODAY table, four amendments, one GOALS sentence — small-medium

*Audit G1, G2, G3 (major/moderate). Cuts off the defect class that has now
bitten six times* — twice as shipped-on-superseded-doctrine incidents UX.md
already post-mortems, four more found by this audit.

- **§7.23 describes a section bar that does not exist, in the commit that
  shipped it.** The doc, both index.html comments and a second CSS comment
  all say "no track, no lit cell, weight alone, 0.72/0.45"; the shipped CSS
  has a track, a lit recess, and 0.42/0.78, with the third iteration
  recorded *only* at css:405 ("THE INK MARKS THE CONTROL, THE WEIGHT MARKS
  THE STATE"). Rewrite the paragraph from that comment. Also dead: the
  `rail-seg` selector (matches nothing), "104px" at css:1780.
- **A ~30-line "WHAT IS TRUE TODAY" table at the head of §7**, one row per
  surface naming the one authoritative section. Answering *"what is true
  about the rack today"* currently means reconciling §7.9, §7.10, §7.16,
  §7.17, §7.18, §7.22 and §7.23 by hand — demonstrably how four stale-
  doctrine findings survived.
- **Banner or move §1–§6**, verified dead letter with no markers: §1.3's
  notation-box placement, §1.4's click-to-copy formula (no JS producer),
  §2.1/§2.3's experience records (the server refuses the key), §2.4's
  user-held dwell and Roll button (shipped: a 1.35 s timer, no button),
  §2.5's meaning hero (unreachable — see U17).
- **Amend §7.15** (the one-✕ machinery is fully retired in code and still
  cited as live doctrine from two places in §7.9), **§7.17** (`SAVED POOLS`
  no longer stands over the rack), and the **shelf-marker dot** §7.7/§7.9
  still spec, which ships invisible (see U20).
- **Add the launcher carve-out sentence to GOALS.** GOALS' Uniform-roll-
  surfaces invariant has no carve-out while GOALS is the document that wins
  ties, so the shipped rail is formally out of compliance with the file every
  agent reads first. The carve-out is right (§7.4); the omission is the bug.

**Suite is blind, and it is the same lesson inverted:** §7.17's deletion took
the dice-value ledger's caption with it — the whole-rack `.ph-fig` never
renders (`#pools-head:not(.foreign){display:none}`), the shelf figures are
four bare integers with no unit, **and the `rack-dice-value` scenario still
passes because `textContent` of a `display:none` node reads fine.** That is
the exact inverse of the build-not-hide lesson §2l recorded. Fix the
assertion with the doc.

### U5. Live-region triage — the ceremony and both notice channels are silent — small

*Audit D1, D2 (major), plus B3's wrong word.* The largest verified a11y gap,
and three fixes share one shape.

- **Ceremony rolls are completely silent to a screen reader.**
  `#banner-live` is the app's only working live region and it lives inside
  `#result-banner`, which a ceremony never paints — `stepPlayback` returns
  into `ceremonyEnterSettle` before `showResults` (main.js:2216-2222), and
  the sole write to the region is on the banner path. Every Check and every
  Cinematic — the rolls carrying a DC, a moment and a subtitle — lands
  unannounced. **Change:** a permanently-mounted body-level `sr-live` node,
  written from the settle stage as well as from `renderRollResults`.
- **Both notice channels are silent by construction.** `railNote()` sets
  `textContent` and clears `hidden` in the same task, so the region is out
  of the a11y tree at mutation time and the 40-die cap refusal — which
  exists *because* the collapsed pill is invisible — never announces.
  `#status-pill` has no `aria-live`/`role="status"` at all; collapsed it is
  a colourless 10 px dot (`color:transparent`), and `showSettingsNote`
  passes no class so it is graphite-on-graphite. index.html:105 documents
  the irony exactly: `#rail-note` was built because "a note sent there would
  be invisible in exactly the state that sends it" — and the table's notices
  were never routed to it. **Change:** one `notify(msg, {scope})` that picks
  the visible channel from panel state; live regions mounted-and-empty,
  never `hidden`; `role="status"` on the pill.
- **`renderRollResults` says `'held'` for a *whisper*** (main.js:2941) — the
  one channel a blind player has, using the wrong rung's word. One line.

### U6. Hue-law and legibility one-liners — small

*Audit C1, C2, C3, C4 (major/moderate).* Four measured breaks, four small
changes, no new machinery.

- **The primary verb is least legible on the surface that owns it.** The
  well's ROLL cue measures **1.42:1** empty and **~1.9-2.0:1 armed with a
  draft staged**; the rail plate — same builder, same word — is **6.2:1
  armed** and **2.33:1 disabled**. The workbench's live, armed primary act
  is dimmer than the launcher's dead one, because the heat ladder caps cue
  opacity at 0.65 over an already-dim base while the rail ships
  `rgba(255,215,102,.62)` at opacity 1. §7.21's amendment says "the primary
  act stands at full opacity"; four CSS lines say otherwise. **Floor the
  well cue at the rail's value and let heat ride the pocket bloom alone**
  (heat was specified as light-only anyway).
- **Live and disabled controls tie at ~2.2:1.** Unpressed section-bar cells
  measure **2.23:1** (opacity 0.42, undershooting 2i-C's own documented
  0.45); disabled rim tools measure **2.27:1**. Three visibility codes
  collapse to one percept, and at 11.5-12 px the live cells are a flat WCAG
  1.4.3 failure — in the all-off floor state (`panel-all-off.png`) the only
  route back to the sections is three ghosts at 2.23:1. **Raise unpressed
  cells to ≥4.5:1 (~0.72 on `--muted`), push disabled to grayscale(1)/~0.30,
  and reconcile 0.42 vs 0.45 in whichever direction is intended.**
- **HUE = ACT breaks three ways in one popover.** `#pop-save` is the app's
  only `.btn.primary` — the gold roll gradient on a pure save, violating the
  comment four lines above the rule it breaks (css:289) while the correct
  `.btn.confirm` dress ships on the adjacent button. Every `.seg` inside
  `#mods-popover` lights **gold** because the ivory override is scoped
  `#left-panel .seg` and the popover is body-level, so "Face down",
  "Cinematic" and "kh" wear the roll hue three inches from a panel where the
  identical control wears ivory precisely so it would not
  (`audit-popover.png` shows three pressed dresses in one 300 px card).
  **`#pop-save` → `btn confirm` (one attribute); invert the seg default to
  ivory with an explicit gold opt-in.**
- **Name `#rail-roll`'s bronze in 2i-C.** Disabled has thirteen recipes, six
  without grayscale; the rail plate's bespoke bronze is a fourth visibility
  code that *works well* and exists only as an unwritten exception. Write it
  down here; the base-rule-plus-named-exceptions collapse is U23.

### U7. Gate the box preview on `forecastFor` — small

*Audit A4 (major).* `renderCmdState` calls `fmtPreview` with no system gate
(main.js:5883), so the notation box forecasts a **sum total** under
soul-deal, where no total ever lands anywhere — while the app's own Help
(index.html:504-523) states the per-die rule the box contradicts on the same
screen. The correct branch already exists: the popover's preview at 8446
calls `activeSystem().forecastFor` with a comment claiming coverage of
"every ± door alike". **Wire the popover's branch into `renderCmdState`;
fixes the quick palette too.** §2l's two standing warnings govern the
rewrite: the preview *is* the validator in a fixed-height slot (replace,
never blank), and the success branch ends in `visSuffix` (a naive rewrite
drops the visibility echo).

### U8. Reduced-motion the crit — small

*Audit B2 (major), first half.* UX.md:962 explicitly orders "always drop
shake/flash/sweep" under `prefers-reduced-motion`; the shipped block scopes
to `#ceremony-layer *` and misses both the full-viewport radial wash and
`container.classList.add('shake')` on `#scene-container` for 1700 ms
(main.js:3452 — an element outside the layer). `matchMedia` appears **once**
in all of js/, for `navigator.share`. **Add `.shake`/`#crit-text`/
`#crit-overlay` to the block *and* gate the class in `playCritEffect` on
`matchMedia`.** The frequency half is U18.

### U9. Rail dice rows — the cascade tie and the floating ✕ — small

*Audit C6 (moderate).* `.rd-item { flex:1 }` (css:1829) loses to
`.rp-item { flex:none }` (css:1896) — equal specificity, later wins — so the
selection box shrink-wraps to the label and breaks the "same 86 px box"
promise: measured **74.0 / 51.7 / 72.7** CSS px across the frames, the box
growing under your finger with every digit. The `.rd-x` remover is anchored
to the full-width cell, not the shrunk button, so it floats ~19 px right of
the row at `3d6` and lands on the label at `10d10x`. **This is the third
`.rp-*`/`.seg` tie in three commits to silently win against the rail block;
the pattern is the finding** (the durable half is U23).

**Change:** `.rd-cell .rp-item { flex:1 }`, anchor the ✕ to the button, drop
its `tabIndex=-1` (see U22), and add a hover frame to `rail-look.mjs` —
`.rd-x` currently appears in **zero** captured frames.

### U10. The mode switch stops destroying the dice pick — small-medium

*Audit C5 (moderate).* `#section-bar` (checkbox, 0-3 lit) and `#rail-mode`
(radio, exactly one lit) are styled by the same selector and are
indistinguishable — one dress, two grammars. Compounding it:
`setRailMode('pools')` executes `railDice = []` (main.js:7196, immediately
after a comment reading "BOTH PICKS SURVIVE… except this one") and the digit
path repeats the wipe (10954) — three counted taps gone, no undo, from a
control that *looks* like the harmless bar upstairs. §7.23 states "Nothing is
ever destroyed by navigation" as law; the code destroys twice.

**Change:** reorder the mode resolution so an explicit choice outranks a live
dice pick, then drop both wipes; give the exclusive bar a visibly different
affordance (thumb or underline). **Recorded so it is not re-attempted:** the
previously proposed fix — setting `railModeVisit` instead of clearing — does
**not** work; `railMode()`'s resolution order is the mechanism.

### U11. `± Modify` cannot modify anything in the shipped default system — small

*Audit A3 (major).* `soul-deal` has `usesMods:false`, and `pop-perdie` folds
Modifier, d20 pairing, Target, keep/drop and reroll/explode (main.js:7896);
`audit-popover.png` shows what is left — Visibility, Moment, Pool stats. The
rim's loudest tool says "Modify" with `title="Modifiers, target, moment"`,
two of which are absent by default. It also invalidates the remedy U1's
`dropped` note points at ("re-add via ±" is impossible for `dc`).

**Change:** derive the rim button's word and title from `activeSystem()`.
**And amend the contract:** js/meanings.js:152-154 still documents
`usesMods:false` as "the popover NOTES that modifiers do not change
outcomes", while index.html:678 records Joe's superseding ruling
("entirely — no note").

### U12. Long-press on `.shelf-marker` and `#peek-card` — small

*Audit D5 (moderate, touch).* Both have `contextmenu` only, and iOS Safari
never fires it on long-press — so a shelved roll's **±**, "Open in draft" and
"Save as pool…" are unreachable on an iPhone. The long-press helper already
exists ~5,700 lines up, on pool tiles. Closes the iOS hole and the GOALS
uniformity gap in one wiring change.

### U13. `Save as pool…` in the banner fold, `Edit notation…` on the pure branch — small

*Audit A6 (moderate).* A draft is buildable, editable, spendable, repeatable
— and **keepable only by spending**. §7.16 retired the rim's Save on the
grounds that the peek's "Save as pool…" covers it; verified coverage is: wait
out the 3 s auto-collect → find an invisible 150-200 px circle → right-click
(no long-press, see U12) → find a button in the popover — additionally gated
on `canReroll` (main.js:1313, 1611). Meanwhile the creation card accepts only
a name and a d4-d20 multiset, and a pure pool's popover early-returns
*before* `Edit notation…` (main.js:8178 — the ghost verb exists in the
unreachable branch; `beginEditGroup` has exactly one call site, inside it).

**Change:** add `Save as pool…` to the banner's existing `appendCardActions`
fold, and keep `Edit notation…` standing on the pure branch (one
`appendChild`). Both are wiring into existing builders — no new surface.

### U14. Guard scope, one label, one discarded count — small

*Audit E5 (moderate), F3.* Three unrelated one-liners that all cost a real
table something.

- **`c` sweeps the felt for everyone and stays live under two menus.** The
  `modalOpen` guard's own comment names the hazard and covers one of three;
  `isIdentityMenuOpen()` and `isOfferMenuOpen()` already exist and are absent
  from it. Add them. *(Do NOT add a confirmation — see the refuted list.)*
- **Rename the log flyout's header `Clear` to `Clear history`.** The flyout
  is deliberately un-modal (correct for `r`), so `c` pressed while looking at
  a button that says Clear sweeps the felt instead of the history — and the
  same word means local-and-recoverable online but permanent solo.
- **Surface the `dropped` count the log already computes** and discards
  (main.js:9082); `LOG_CAP` drops history silently today.

### U15. Re-fixture the look tools with the dealt rack — small

*Audit G5 (minor), and §7.22's own closing rule: "Run it, and look, before
calling a visual change done."* Both look tools fixture a hand-authored
12-pool sheet the app never deals — the real rack is 18 pools and scrolls
below ~975 px with `scrollbar-width:none`. **No frame shows** a populated
roster, a live `#rail-note`, a hovered `.rd-x`, a spent draft, or an invalid
box; the presence row is the one geometry that *moves* (wraps at 3-4
players) and no capture shows it. Re-fixture with `dealStartingRack`'s
output and add the missing frames, including a short collapsed viewport.

### U16. Draft intent in the well — DESIGN FIRST, medium

*Audit A5 (moderate).* `renderTray` builds chips and the cue and nothing
else, so `2d8 check dc15 w:Ann # The Duel` is pixel-identical to bare `2d8`
— and with Notation off (the default), the only ways to see the dc, moment,
comment or whisper are ± (which hides the dc, per U11) or turning the box
on. Saved pools got notation carriage precisely so a stored roll could not
lie about itself; **the live draft — the object you are about to spend — has
no carrier for intent.** The composing surface needs one (dc/moment/
visibility chips or equivalent); it interacts with the cue band and the heat
ladder, so design before code. U1 closes the *transport*; this closes the
*read*.

### U17. What a per-die system's Check shows — DESIGN FIRST, medium

*Audit B1 (major), B3, B4.* `1d20+5 check dc15 # The Duel` renders on the
verdict card as one chip and a word — no DC, no `+5`, no subtitle — because
`hasDc` is gated on `usesTotal` and mod cards on `usesMods`. **Four surfaces
render four different subsets of the same stake:** the intent card shows the
subtitle but buries the dc in 9 px mono; the dock strip (cinematic only)
shows the dc because `renderDockStrip` has *no* gate; the verdict card shows
none of it; the log shows `+5` but not the dc. The player typed a target and
a bonus, the app rolled with both, and showed neither at the moment of the
verdict. **The gates conflate "this system sums" with "this system has
stakes" — different facts.** Decide once (is a dc a stake even without a
summed verdict?), then apply to all four surfaces together.

**Rides with it:** the only 52 px gold number a Soul Deal table sees is `?`
— `#result-total` is dead for every open roll and springs to life, in the
roll verb's own hue, only to announce an absence, with the banner never
saying *why* (the verdict card and log both name the state; the banner is
mute). And the meanings migration left dead surface: all three profiles
define `meaningFor: () => null`, so the non-ledger `#result-meaning` branch,
`.pk-meaning`, the verdict's `else if (meaning)` and §2.5's entire hero-slot
ruling are unreachable while §2.5 is still written as live spec (retire it
with U4's pass).

### U18. Crit frequency under soul-deal — DESIGN FIRST, then small

*Audit B2 (major), second half.* `soul-deal.critFor` fires when *any* die
lands a crit cell, and those cells exist on d10/d12/d20 — so a `3d10` pool
crits on **48.8%** of rolls, each one a full-viewport wash plus a 1700 ms
shake. §2.4 budgets crit as a rare accent; on a d10-heavy Soul Deal pool it
is the **median outcome**, and "excitement outranks physicality" inverts into
noise. This is a chart/threshold question, not a rendering one: decide what
"crit" means for a multi-die per-die pool. (U8 ships the reduced-motion half
independently and first.)

### U19. `playerId` succession for reveal and offer authority — DESIGN FIRST, medium

*Audit E2 (major).* Reveal authority and offer ownership are pinned to an
ephemeral `playerId` with **no fallback**. Lose your stream past the 5 s
grace, rejoin with a fresh id, and your own held rolls become unrevealable
*by anyone*, forever. An offerer who leaves strands an un-withdrawable gold
card; a claimed dice-tower offer from a departed offerer whispers to a dead
id — a roll nobody can ever see. Rolls got a universal-housekeeping escape
once collected (§7.7); offers and reveals did not, for no stated reason.
**Decide:** seat-based fallback, or extend §7.7's escape. Note this is the
same bet as U3 — see the structural risks below.

### U20. The shelf's read at rest, and the peek's lifetime — DESIGN FIRST, small-medium

*Audit F1, F2 (moderate).* Five collected rolls render as dice plus an
invisible glow: `.shelf-marker { background:none; border:none }`, `title` as
the entire information channel (never on touch), `.sm-dot` styled in CSS
**with no producer**. You cannot tell who rolled what, what it meant, or
which held roll awaits its reveal — and the shelf is the *designed* home of a
held roll (main.js:1346). With `PEEK_HOVER_MS = 0` and 150-200 px targets,
dragging along the table's bottom edge fires five 300-460 px cards in
sequence.

**Change:** produce the styled-but-orphaned `.sm-dot`, add a shroud glyph for
hidden entries, and decide how much read the shelf owes *before* touching
peek lifetime. Then the peek: it closes on nothing a player expects — not a
new roll, not a ceremony, not the log — and at z 30 outranks all of them (the
repo's own capture run shows it standing through an entire Check); two cards
can wear a red `✕ Clear` for two different rolls with nothing marking which
is live (`19-shelf.png`); in `body.mini` the banner's top edge cuts into
shelf slot 2; and one roll gets three presentations by arrival path (dressed
`top:3vh` for 7 s, plain `bottom:26px` for 3 s, reloaded Check comes back
plain because `replaySettledRoll` passes `exp:null`). **Do not change the
collect-on-arrival rule** — see the refuted list.

### U21. What the launcher owes the table — DESIGN FIRST, medium

*Audit E3 (moderate).* The collapsed rail deletes multiplayer: roster,
chairs, Invite, nameplate and offer verb are all expanded-only, and the sole
browse-mode signal left is `opacity:.68` on the chip with no roster to
compare against. §7.4's launcher carve-out covers *offering*; it does not
cover *presence*. Meanwhile `poolsOwner` survives collapse (nothing in
`applyPanels` clears it), so you can collapse out of Bob's rack, see no
signal, and expand straight back into it — and with the Pools *section* off,
clicking a teammate pill flips `aria-pressed` and changes nothing on screen
(`setPoolsOwner` never surfaces the section; the transient door `loadIntoBox`
proves exists was not used). Related and worse: the collapsed rail lists
*your* `groups` unconditionally, so during a G3 profile swap that is Alice's
pools, unlabelled, rolling under your name — and `sec-off-pools` can hide the
G3 banner with both its exits.

**Decide the minimum social state a launcher owes.** At least: a browse-mode
signal, and clearing `poolsOwner` on collapse.

### U22. Modal semantics and the focus pass — DESIGN FIRST (mechanical, broad), medium

*Audit D3 (major), D4, D5.* Batch this; it is one sweep, not eleven fixes.

- **Six modal-ish surfaces, zero focus containment, one dishonest
  `aria-modal`.** `#help-overlay` is the app's only `role="dialog"
  aria-modal="true"` and has no trap — Tab walks into content AT has been
  told does not exist (focus real, speech silent). The other five overlays
  are anonymous `<div>`s; nothing sets `inert`; `#mods-popover` sits after
  `</aside>` in the DOM, ~26 tab stops from the button that opens it;
  `#name-modal` — the blocking front door, no cancel, no Esc rung — is the
  least accessible surface a new player meets. **Until a trap exists, *drop*
  `aria-modal` from help**: an honest un-annotated dialog beats a lying
  annotated one.
- **`.cmd-in:focus { outline:none }` with nothing put back** — the primary
  text input and the palette have no focus indicator, the cleanest 2.4.7
  failure in the app; the correct swap-for-border pattern ships three times
  in the same file. Add `aria-invalid`/`aria-describedby` for box errors.
- **Names that are not names.** Icon-only foot buttons and `.die-x` are named
  by `title`, which the accname algorithm never reaches for a button with
  glyph content — while `.rd-x` and `#edge-toggle` do it right in the same
  file. Popover segments are mutually exclusive but announce as independent
  unlabelled toggles — on Visibility, the one control whose mistake cannot be
  undone. `#zoom-picker` sets both `aria-checked` and the invalid
  `aria-pressed` on `role="radio"`.
- **Keyboard traps and dead ends.** `.rd-x` is `tabIndex=-1` beside the
  comment "a counted row you cannot decrement by touch is a trap" — the
  identical keyboard trap left standing (Esc clears the whole pick). Shelf
  markers are invisible, unlabelled, tabindex-less `<div>`s, so the table's
  history is a flat 2.1.1 failure — and once a roll is shelved the peek is the
  *only* door to Reveal.
- **Structure and focus retention.** No `<main>`, no `<h1>`, no skip link —
  the workbench announces as "complementary". Every rail re-render drops
  focus to `<body>` (picking three pools by keyboard costs three Tab-walks
  from the top) while the expanded rack, via `renderTray`, does not — twins
  behaving oppositely. Add `scroll-padding-top: calc(var(--draft-h) + 34px)`
  so Shift+Tab does not land focus rings under the 203 px sticky zone.
- **Touch floor.** The 44 px coarse floor reached only the card-action row
  (css:4415); the ± popover — reached on touch by the app's hardest gesture,
  a 500 ms hold — is built from 23 px seg cells, 23×24 steppers and 30×17
  switches, and `#offer-pick`'s ID rule beats the coarse bump, leaving ~20 px.

### U23. A token layer for the doctrine — DESIGN FIRST, medium

*Audit C2-C6, and the structural-risk read.* `--dim-rest`/`--dim-off`/
`--drain`, `--on-fill`/`--on-ink`/`--on-ring`, three die-art sizes, one
`--label-sm` recipe. **This is what makes U6, U9 and U10 stay fixed.** The
evidence that it is needed and not taste: thirteen `:disabled` recipes with
six missing grayscale; `[aria-pressed="true"]` resolving to **nine distinct
dresses across four hue families**, selected by DOM ancestry rather than by
kind of choice; and three `.rp-*`/`.seg` cascade ties in three commits, all
silently winning against the rail block, from one 4.5k-line stylesheet with
no token layer. Cascade ties — not file size — are the measured cost of the
CSS as it stands.

### U24. Ordinals versus the dealt rack — DESIGN FIRST (small code), small

*Audit G4 (moderate).* `1 2 3 Enter` — the roll the design says the surface
exists for — **cannot be typed on the rack the app deals**.
`dealStartingRack` seeds 9 attributes, then skills at ordinal 10 and
motivations at 16; ordinals render only for `ord ≤ 9`, and there is no
reorder affordance. UX.md asserts the claim in the paragraph *directly above*
the dealt-rack amendment that broke it (1536-1539 vs 1542-1563), and
main.js:10948's comment advertises a sequence that now means Strength + Wit +
Intelligence. **Either interleave ordinals across shelves or re-scope the
promise; either way fix both doc sites and the code comment.**

### U25. The table's smaller seams — batch, small-medium

*Audit E4 (moderate, several).* Each is small; together they are what a
first table night runs into.

- **Copying the invite link has no primary gesture.** At a table with one
  other person the Invite chair is gone and the link lives behind
  right-click/long-press on a chip whose left-click is a visible no-op; the
  manual is a `title` touch never renders; no keyboard shortcut touches the
  table at all.
- **Roster pills shrink to unreadable stubs before `+N` folds**
  (`row-eight.png`: bare dots plus *two* overflow pills).
- **`publishPools` broadcasts your entire rack on every edit with no
  disclosure**, while the one tooltip about pool sharing asserts the opposite
  ("Pools travel via Settings → Your data → Export").
- **The change note never names the setting** — "Alice changed the table" for
  a system flip that reinterprets every result.
- **An unnamed table renders its minted key** (`drive egw19x`) as the
  nameplate and tab title, against its own markup comment ("else NOTHING")
  and against a superseded goal-7 rationale. The marginal *security* cost is
  nil (the URL bar already shows it); the presentation is wrong by its own
  rule.
- **A room that dies says nothing** to the group whose link it was (12 h
  linger, `--min-instances 0`).

### U26. Lifecycle reads, transport door, and the terminology sweep — batch, small-medium

*Audit F3 (minor, several), plus the two closing results.*

- **The spectator's banner hover-hold silently does nothing** —
  `armAutoCollect` bails on `!mine`, so the roller's 3 s clock yanks the card
  a spectator is reading.
- **The log row duplicates every source label across two lines** — the
  diagnosis §7.12 wrote and fixed on the other three surfaces, unfixed here,
  against its own "compact list line" ruling.
- **A shelved roll whose log row is gone renders a peek with a live
  body-click and no named verb** — the pre-§7.21 defect surviving in an edge
  state.
- **Spectator reroll is deliberate and defensible, but nothing signals the
  attribution flip or the shelf eviction it causes.**
- **The whisper sub-line "others see you rolled, not what"** describes a
  deliberate, thrice-documented stakes-are-public leak in four words that
  read as the opposite; the offer-context tooltip UX.md:656 specifies for
  Only-me was never built.
- **Transport has one real hole:** for a system whose durable copy is a file,
  *restore from that file* is the one operation it does not offer (no
  replace-rack, no bulk delete, refusal-wholesale at the 40 cap) — and the
  rack has no door to its own transport (four levels deep, verbs spelled
  `Fill with my data` / `Download` / `Apply import` beside `Apply to table`).
  The missing operation is an **explicit, separately-named** "replace my rack
  from this file", never a sharper Apply (see refuted).
- **The terminology sweep found one real contradiction** — one button
  labelled "shelf" with a tooltip saying "category" — but **the durable half
  is the suite**: the e2e's banned-word regex omits "category" and sweeps
  none of the result surfaces.

### Structural risks (bets, not bugs — each gets more expensive to reverse)

- **System capability flags as scattered per-surface render gates.**
  `usesTotal`/`usesMods` are consulted independently at every render site —
  verdict card, banner, log, dock strip, popover, preview — and *every*
  system finding in this audit is the same failure: a gate written for sum
  systems, applied or missed one call site at a time (the dock strip shows
  the dc because its author forgot the gate; the box shows a sum forecast
  because its author never added one). The default system is the one that
  exercises the `false` branches, so **Joe's own game is where the drift
  lands**. The durable fix is an inversion: the profile should *supply* the
  renderers (as it already does for `forecastFor` and `outcomesFor`) rather
  than surfaces querying booleans. Until then every new result surface
  re-litigates what a per-die system shows, and loses somewhere.
- **Identity anchored to browser-storage shape.** U3, U19 and the lobby's
  stale interpretation system are one bet: `dice.name.v1` origin-global,
  `playerId` minted per-join with `sessionStorage` resume only,
  `dice.roomsettings.v1`/`dice.log.v1` global-not-room-scoped. GOALS §7
  defers persistent identity to "a later pass" — fine — but these keys are
  load-bearing for **authority** (`revealAuthority`) and **routing** (the
  seat door), not just convenience. **Schedule the later pass before the next
  feature that needs a stable "who".**
- **The size question: main.js is large; UX.md is failing.** Six stances
  traced every path through js/main.js (12.6k lines) and the choke-point
  architecture held — findings located to single lines, and **no finding was
  caused by the file's size**. docs/UX.md at 3.1k lines is the opposite: its
  append-only §7-in-commit-order structure has produced two self-documented
  shipped-on-superseded-doctrine incidents and four more stale-authority
  findings here. **The document, not the code, is the structure actively
  generating defects** — which is why U4 sits third in this tier.

### Patterns to protect (verified by all six stances)

- `projectEntryFor` (server.js:1440) on all six egress paths, redacted branch
  as a **whitelist construction** — a future field is private by default;
  `secret` returns `null`, not a blanked record. `entryExistsFor`/
  `entryExistsForAll` gate housekeeping; `400 unknown_audience` refuses the
  whole roll rather than narrowing the audience; shrouded dice carry an
  identity face-correction, so dice nobody can read have nothing written on
  them; the dice tower works with **no roles** because `revealAuthority` is
  separated from `playerId`.
- The three choke points: `entryHidden()` (three lines, 18 call sites),
  `editPoolById` (the sole by-id mutator), `CARD_VERBS` + `appendCardActions`
  (five viewer/mode combinations, one table).
- `buildRollCue()` — seven call sites — is why the two views cannot drift;
  the rail plate's gradients are byte-copied with the lesson at the site
  (css:2017).
- "Flush" and "one click target" are true by CSS *structure*
  (`#tray-actions::after`, `padding:0`, `pointer-events:none`, the
  `:has(.die-x:hover)` honesty override), pinned by `elementFromPoint` at
  four positions (scenarios.mjs:3251).
- Failure directions chosen by state shape: `sec-off-*` classes degrade to a
  visible panel; `sectionsStored`/`sectionsTransient` make laundering
  unrepresentable; `applyImportPlan` has no delete path; `rollRailSelection`
  fails closed to `secret` and strips glue mods unconditionally.
- Geometry observed, never asserted (`--draft-h` ResizeObserver); real
  `disabled` so keyboards skip dead stops; `[hidden]{display:none!important}`
  and its generalized suite rule, "pin computed display, never class names"
  (UX.md:2746).
- Server owns the shared state machine: ordered `collectEntries`, shelf slots
  as ranks off a monotonic `collectSeq`, a losing `/api/table` rev as a
  silent `200 {applied:false}`, presence *asserted* via `pagehide` beacon +
  application-layer heartbeat.
- "The count is the label" (`d6 → 1d6 → 3d6`) — counter, notation and wire
  payload in one token, leading `1` deliberately kept.
- Input-model care: `e.repeat` rejected at the top of the global handler;
  `isComposing` in both notation editors; the Esc chain as one ordered ladder
  mirroring `--z-*` backwards; accessible names computed from the parse
  ("Roll 3 pools: Wisdom, Swordplay, Zeal"); both real menus complete down to
  focus restoration on close.

### Refuted, recorded so they stay dead

- **Do not make the section bar sticky.** The 31px-permanent argument
  (index.html:225) is sound; the crowding fix is letting `#draft-zone`
  collapse toward the rim when the draft is empty — the ResizeObserver makes
  the shrink structurally free, and it returns 114 px in exactly the state
  with nothing to show.
- **Do not add a confirmation dialog to `c` / Clear table.** Goal 10 makes
  sweeping the felt everyone's right and the table should stay fast. The
  verified defects are guard scope and a colliding label (U14); a confirm
  would tax every legitimate sweep to protect against a typo the guard
  already almost catches.
- **Do not badge visibility on every result surface.** The un-badged ruling
  (UX.md:659) is reasoned and correct — the mode is never sticky, and
  composing-time announcement ships. The gap is *retrospection* only; one
  muted token in the log row (derived from `entry.visibility`, reusing
  `offerVisText`) answers it without reopening the ruling.
- **Do not change the server's collect-on-arrival rule for held rolls.** It
  is deliberate, documented at the call site, and the shelf is the designed
  home of a held roll. The defect is that the shelf cannot show it — fix the
  marker (U20), not the state machine.
- **Do not give the rail Offer or full intent editing.** §7.4's launcher
  carve-out is right: a launcher fires intents authored elsewhere. The fix is
  putting the carve-out sentence in GOALS (U4), not bringing the rail into
  compliance with an invariant that should be amended.
- **Do not unify the two bars by making the rail multi-select, and do not
  suppress the leading `1` in the dice counter.** Exclusivity is correct for
  a mode switch and the counter's grammar is correct as shipped; the fixes
  are a distinct dress and an end to the state-destruction (U10).
- **Do not make import destructive.** Union-only, preview-then-merge is the
  load-bearing lesson of the `#g=` post-mortem and it held under every
  stance. The missing operation is an explicit, separately-named "replace my
  rack from this file" (U26), not a sharper Apply.
- **Do not split js/main.js as a reflex, and do not reach for a framework.**
  Zero-dependency single-file is upholding its end — the audit traversed it
  six ways and the architecture held. Split only when a specific change is
  demonstrably harder because of the file, and record that demonstration when
  it happens.
