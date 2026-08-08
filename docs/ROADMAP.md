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
**SHIPPED 2026-08-08 (`07099a7`).**

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
**SHIPPED 2026-08-08 (`07099a7`).**

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
**SHIPPED 2026-08-08 (`5a0b45b`).**

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
**SHIPPED 2026-08-08 (`e76b723`).**

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
**SHIPPED 2026-08-08 (`e76b723`).**

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
**SHIPPED 2026-08-08 (`6285473`).**

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
**SHIPPED 2026-08-08 (`485616d`).**

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
**SHIPPED 2026-08-08 (`485616d`).**

*Audit B2 (major), first half.* UX.md:962 explicitly orders "always drop
shake/flash/sweep" under `prefers-reduced-motion`; the shipped block scopes
to `#ceremony-layer *` and misses both the full-viewport radial wash and
`container.classList.add('shake')` on `#scene-container` for 1700 ms
(main.js:3452 — an element outside the layer). `matchMedia` appears **once**
in all of js/, for `navigator.share`. **Add `.shake`/`#crit-text`/
`#crit-overlay` to the block *and* gate the class in `playCritEffect` on
`matchMedia`.** The frequency half is U18.

### U9. Rail dice rows — the cascade tie and the floating ✕ — small  
**SHIPPED 2026-08-08 (`6285473`).**

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
**SHIPPED 2026-08-08 (`485616d`).**

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
**SHIPPED 2026-08-08 (`0f34acc`).**

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
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit D5 (moderate, touch).* Both have `contextmenu` only, and iOS Safari
never fires it on long-press — so a shelved roll's **±**, "Open in draft" and
"Save as pool…" are unreachable on an iPhone. The long-press helper already
exists ~5,700 lines up, on pool tiles. Closes the iOS hole and the GOALS
uniformity gap in one wiring change.

### U13. `Save as pool…` in the banner fold, `Edit notation…` on the pure branch — small  
**SHIPPED 2026-08-08 (`6285473`).**

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
**SHIPPED 2026-08-08 (`44b71a4`).**

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
**SHIPPED 2026-08-08 (`07099a7`).**

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

**Rider from U17 — `#verdict-subtitle`.** The verdict card has **no subtitle
element**, under any system, for any notation, so `# The Duel | Charisma`
declares its subtitle on the intent card and the dock strip and then loses it
at the verdict. U17 deferred it deliberately: it is a **missing element,
uniform across all three profiles** — not a gate, not part of the
stake/arithmetic conflation, and not something a lens can be blamed for.
Adding it means new markup, new CSS, and a third small line between the
eyebrow and the answer on a card whose whole virtue is *the name, the answer,
the exits*. That is a hierarchy call, which is why it lands here rather than
in a gate pass. It is the one residual asymmetry in UX.md §7.24's
eight-surface table.

### U17. What a per-die system's Check shows — **STEPS 1–4 SHIPPED 2026-08-08; 5–6 OPEN**

**Steps 1–4 shipped** `fe9acbd` (the stake renders; only its adjudication is
gated) · `ba03e88` (the mute gold `?` leaves the total slot) · `f5359d8`
(steps 3 & 4 — arithmetic and selection split; the `meaningFor` channel
deleted). **Step 5 (docs) is this pass. Step 6 (the look) is open**, and per
the repo's standing rule U17 is not "done" before it: the verdict card's stake
line rhythm and the peek's `.pk-held` word have not been seen rendered.

**THE LIVE RULE NOW LIVES IN [UX.md §7.24](UX.md).** Everything below this
block is the **build spec and the record of the defect** — the surface-by-
surface renders, the gate table, every disagreement ruled, the strongest
objection and its answer. It is kept because it is what was decided and why,
and it is written in the present tense of 2026-08-08 *before* the build. Read
§7.24 for what a surface shows today; read this for why.

**Two sites still disagree with the rule, verified against source 2026-08-08**
— one a gate the spec listed and the build missed, one a site the spec never
listed. Both are recorded in §7.24's *Not closed*, and both are small:

- **#26 — `modsSummary`'s `values` option.** Never added; `renderOffers` still
  calls `modsSummary(o.mods)` with no options, so **an offer card still prints
  the flat `+5`** under a per-die lens while the intent card it becomes drops
  it. The last declaration surface on the wrong side of the split.
- **The log's total column still answers `?`** for a held roll under a per-die
  lens — the same mute gold glyph step 2 removed from the banner and the peek,
  making the same claim of a withheld sum that will never exist. The spec
  never listed this site (it enumerated `#result-total` and `.pk-total` only);
  by the spec's own reasoning it is the same defect.

**One claim in the spec below overstates what shipped.** Step 3 says
`4d6dl1`'s dropped die "returns to the verdict card, banner and peek." It
returned to the **verdict card** only, as a `DL1 dropped` attribution card.
`renderOutcomeRows` prints only the dice `outcomesFor` returns
(`p.counts && !p.child`) and the breakdown line folds wherever those rows
render, so the banner and the peek still show no struck die under a per-die
lens. That is a live half of GOALS' *Attributed math* and it is a **rows**
question, not a stake question — it belongs to whoever next touches
`renderOutcomeRows`, not to a gate.

**The new scenario landed under an existing name.** The spec's `stake-read`
was folded into **`per-die-read`** (smoke) rather than added beside it, which
is why `grep stake-read` finds nothing; the assertions are there. Its old
pin — "no DC verdict under per-die" — was pinning the defect and is re-pointed
to the contract.

---

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

**THE DESIGN IS SETTLED — this entry is now a build spec, not a question.**
Five agents: one mapping every gate site in source, three stances (a target is
a stake / invert the profile interface / render less, not more), one decider.
The full record is in the workflow journal; the decision follows verbatim.

*One correction the pass made to the audit itself:* the audit said FOUR
surfaces disagree. It is **eight**, rendering **six** different subsets — the
offer card and the ceremony's screen-reader announce were never gated at all,
so an offered Check declares both stakes under soul-deal and rolling it shows
neither, and a blind player hears `target 15` while the sighted player's card
says `d20 8 quiet`. The 2026-07-31 gate sweep touched five sites and missed
three; that is the whole shape of the bug.

---

**Stance A leads.** Its rule is right and its gate table is the one that survives contact with the source. I graft three things onto it:

- **From C — the flat modifier.** A and B both keep `+5` alive under a per-die lens (A as a "receipt" in the log, B by restoring the mod-card outright). C is right and they are wrong. `.log-mod` is `var(--gold-bright)` at weight 700 (`css/style.css:3572`) — louder than the die it sits beside — feeding a total column the lens has emptied. A dangling `+5` is the one surface that actually *implies* the sum. It goes. C's "quote register" also wins on the intent card's notation line: it stays whole, `dc15` included (A's proposal to truncate it is rejected — a canonical echo that silently drops a token is worse than a duplicate, and `ledger-read` already pins that line as a verbatim declaration of pools).
- **From B — the interface gets smaller, not larger.** B's diagnosis is correct (`usesMods` does two unrelated jobs) and its cure is too big for 2026-08-13. I take the subtraction without the rewrite: **`usesMods` is deleted outright**, `meaningFor` with it, and nothing replaces them. Three members out, one tiny one in. B's `readFor` is refused — see *Deferred, and what it costs*.
- **Against all three — the naming.** If the gold target ring returns to the declaration under Joe's own game, it currently reads **`DIFFICULTY CLASS`**. That is a D&D mechanic's name printed in 9.5px gold caps on a Soul Deal table at the app's most deliberate beat. Nobody caught it. One new profile string fixes it, and it is the correct shape for the whole decision: *the stake renders under every system; the profile names it.*

Also ruled: **§2.5 is struck to a pointer and the live rule goes into a new §7.24 with WHAT IS TRUE TODAY rows.** A rewrites §2.5 in place — that puts binding spec back inside the §1–§6 block the document's own banner declares to be history, which is the exact failure mode §7's table exists to prevent (it has already shipped two wrong builds).

And **the verdict card's subtitle is deferred** — against A and B. It is a missing *element*, uniform across all three systems, not a gate; it is not part of the conflation, and it costs new markup at the one beat where hierarchy is most fragile.

---

## The rule

> **A stake renders on every surface under every system. Its adjudication — the comparison of a result against it — renders only where the system produces a single number to compare (`usesTotal`). The two never share a slot.**
>
> A **stake** is a condition of the moment the player declared: the target, the title, the subtitle, and the mechanics that decide *which dice land and which count*. A stake is a fact about the roll and does not ask the app to compute anything.
>
> **Arithmetic** is a term in a sum: the flat modifier, named bonus parts, the total, the margin, the ring's ratio, `Success`/`Failure`, `✓`/`✗`. Arithmetic renders where its sum renders, and nowhere else.
>
> The dividing question at every site is **"did the player type this, or did we compute it?"** — with one refinement: a typed value that has no meaning except as an operand of an absent operation is arithmetic, not a stake. A target stands on its own (*we are throwing at 15*). A `+5` does not.

Three consequences, stated so a future reader does not re-derive them:

1. **`usesTotal` narrows to one sentence** and that sentence goes into `js/meanings.js`'s contract prose: *gates the SUM and everything derived from it — the big number, the margin delta, the ring's ratio, and the Success/Failure adjudication of a target. **It does not gate the target.***
2. **`usesMods` is deleted.** It never distinguished anything (all three profiles set it equal to `usesTotal`) and it conflated arithmetic with selection. After the split, arithmetic keys off `usesTotal` and selection mods are universal — so the interface loses a member and the conflation this audit found becomes unspellable.
3. **No per-die comparator is built, now or in this change.** `grep -rn "cmp\b" --include=*.js` → zero hits; `js/odds.js` has no threshold concept; `docs/UX.md:346` reserves `scope:'each'` for roadmap §8 success counting under a *different* notation (`cs>=N`) and a different verdict rendering (success pips, not a ring). U17 says so in one line so the next reader does not re-litigate it.

### Why the app's own record already says a target is a stake

Not argued from taste — three places in this repo already decided it:

- `index.html:758` — *"The improviser's hot pair rides near the top (CUJ2): **a target and a moment are the stakes**."* The markup calls it a stake.
- `docs/UX.md:348` — *"There is **no `target.hidden`**: stakes are public on every visibility rung (§3.0), so the target number and its odds line render the same for everybody — the drama comes from the held *result*, not a secret number."*
- `docs/GOALS.md` superseded decisions — the DM seat's fourth power, *hidden Targets*, **was rejected outright, "because stakes are public on every visibility rung."**

The held branch at `js/main.js:4052-4059` already ships the exact shape C calls incoherent: `vs DC 15` over `Face down`, commented *"Public stakes, hidden result."* Nobody has ever filed that as a bug. A per-die read is the same case — *unavailable because this system does not judge* instead of *unavailable because not yet*. The code already knew how to render a stake without a verdict; it never noticed it had a second reason to.

**And the decisive one for the default table:** under UX.md §2.3, `dc15` *with no experience implies a Check* — "a target with no staging would be mute." Under C, `2d6 dc15` on a Soul Deal table stages a full Ordeal ceremony — card, title, dwell, dock, verdict — whose sole trigger is a number the app then refuses to name on any surface. Staging a ceremony because of a fact and then suppressing the fact is worse than either extreme. C's "dormant notation" analogy (chart words under `dnd`) fails on exactly this point: a chart word is *the app's reading*, which a lens legitimately governs. A target is *the player's sentence*, which no lens authored and no lens may retract.

---

## What each surface shows, exactly

Fixture `1d20+5 check dc15 # The Duel`, system `soul-deal`, the d20 lands **8** (the d20's null band is faces 4–9, `js/meanings.js:46`; the chart reads the **raw** face — the `+5` never touches it). Node-confirmed: `# The Duel` is the **comment**, not the subtitle; `exp = {kind:'check'}`. Where a subtitle exists (`… # The Duel | Charisma`) it is shown in parentheses.

### 1 · Intent card — `renderIntentCard` (declare)

```
                ( J )
             O R D E A L
              The Duel
           (C H A R I S M A)
              ╭────────╮
              │   15   │        gold ornament, IVORY numeral, ~96px
              ╰────────╯
              T A R G E T       9.5px/0.24em gold caps  ← was DIFFICULTY CLASS
                                #intent-mods empty (:empty shrinks the gap)
             1d20+5 dc15        10px mono, muted — unchanged, whole
```

The badge returns under every system. The `+5` chip does **not** — it is arithmetic. `2d6 adv dc15` *would* show an `ADV Advantage` chip, because advantage decides which face the chart reads.

The label becomes profile-supplied (`targetWord`, below). The notation line is untouched: it is the app **quoting the player**, in the evidence register, and a quote that drops a token is a lie. The dnd double-print (badge + `dc15` in mono) already ships and stays.

Look at `tools/out/lifecycle/07-check-declare.png`: today there is a conspicuous dead band between `CHARISMA` and the mono line, where the badge was suppressed. The card reads as though something failed to load. The badge fills the hole it was designed to fill.

### 2 · Dock strip — `renderDockStrip` — **no change**

`js/main.js:3921` (`const hasDc = Number.isInteger(roll.dc);`) is already the rule. `git blame` shows the gate sweep `c39df53` rewrote exactly two `hasDc` declarations and never visited this function — it was an omission, and the omission happened to be correct. Its correctness is now derived rather than accidental. The cinematic-only *paint* stays: A is right that `css/style.css:4374-4376` carries that decision in prose (*"The docked strip is CINEMATIC furniture only"*) — a presence decision about a bar riding the top of the screen, not a content decision about stakes.

### 3 · Verdict card — `renderVerdictCard` — the card that showed nothing

```
      J O E   ·   T H E   D U E L        11px muted tracked caps
                                          ← ring folded (usesTotal), the gap it leaves
              v s   D C   1 5             10px/0.2em muted caps, numeral IVORY
          ╭──────────╮
          │  d20 8   │   quiet            .oc-solo hero scale, 19px
          ╰──────────╯
      ───────────────────────────
      [    ✕  Clear    ]   REROLL ❯❯❯
```

Text layer: **`JOE · THE DUEL vs DC 15 d20 8 quiet ✕ Clear REROLL ❯ ❯ ❯`**
Captured today (`tools/out/lifecycle/facts.json`): `JOE · THE DUEL d20 8 quiet ✕ Clear REROLL ❯ ❯ ❯`.

**The branch-order trap dissolves rather than being patched.** `renderOutcomeRows` runs first at 4061, so `else if (hasDc)` at 4065 is unreachable under soul-deal *regardless of what `hasDc` evaluates to* — which is why flipping only `&& sysTotals` at 4039 changes nothing visible. The fix is not a gate flip: **the stake is written into `#verdict-margin` unconditionally, above and outside the entire hero chain.** Stake and reading are different slots; the rows owning the hero can no longer suppress the stake.

`#verdict-margin` is the correct home and needs no new element: the ring is a **ratio** (`total/dc`) and `.vtotal` is the **result** slot — putting `15` there is the "dice-count read as a total" confusion 2i-B killed. The slot already proves it works; `js/main.js:4055` writes a bare `vs DC 15` into it on the held branch today.

Held, per-die (`… dc15 held`): `vs DC 15` / *Face down* — identical text, now reached under every system.

**dnd, same fixture, unchanged:** eyebrow / ring at `13/15 = .867` with `.fail` / **13** at clamp(36px,8.6vmin,62px) / `vs DC 15 · margin −2` / **FAILURE** in red / a `+5 Modifier` card flying up.

### 4 · Roll log — `buildLogEntryEl`

```
Joe · The Duel                    ⟳                        (total column empty)
[d20 art]  d20 8  ·  vs 15  ·  a quiet roll                        09:28
```

`vs 15` renders, **without `✓`/`✗` and without `.ok`/`.bad`** — that is the comparator, and it does not exist. **The `+5` is gone.** `.log-mod` exists to decompose `.log-total`; it gates with the column it feeds. This is the audit's own named inversion (the log shows `+5` and not `15`) closed in both directions at once.

**dnd unchanged:** `d20 8 +5 · vs 15 ✗`, total **13** gold.

### 5 · Result banner — `renderRollResults`

A ceremony never paints it (`ceremonyEnterSettle` returns before `showResults`); this is the reloaded / revealed / plain path.

```
Joe · The Duel
                                  #result-total — display:none, and EMPTY in the DOM
V S   D C   1 5                   15px display caps, no hue class, numeral ivory
d20 8   quiet                     #result-meaning.result-outcomes
                                  #result-breakdown folded (the rows carry it)
```

Held whisper, per-die: `Joe · A word in your ear` / `VS DC 14` / ***Whispered*** in the held dress. Today (`facts.json.whisperBystander`): a mute 52px gold `?` and a `✕ Dismiss`.

Free correctness win: `js/main.js:2987` routes the SR sentence through `resultVerdictEl.textContent`, so the banner now says `vs DC 15` and **finally agrees with `ceremonyEnterSettle:3677`'s ungated `target 15`**. The two announce sites stop contradicting each other and their own cards.

### 6 · Peek — `renderPeek`

```
Joe · The Duel
d20 8  quiet
vs DC 15
✕ Clear    REROLL ❯❯❯
```

Hidden, per-die: ***Face down*** / ***Whispered*** in the held dress replaces the 30px gold `?`. The `?` for `!entry` (a collected roll carrying no data) **is preserved** — C caught this; there the `?` is not a lens question.

### 7 · SR announce, offer card

`ceremonyEnterSettle:3677` (`target 15`) stays ungated — correct by rule, now for a reason. `renderOffers:11888` (`vs 15`) stays ungated. `modsSummary` gains a `values` option so an offer's arithmetic follows the same law as everything else: **`d20 · advantage · vs 15 · Check — Charisma`** under soul-deal, `+5` restored under dnd. The `9176` call site (the ± variant row — a quote surface) passes nothing and is unchanged.

### The eight-surface table, after

| surface | title | subtitle | dc | flat +5 | selection mods | Success/Fail |
|---|---|---|---|---|---|---|
| offer card | ✅ | ✅ | ✅ `vs 15` | ❌ | ✅ | — |
| intent card | ✅ | ✅ | ✅ **gold ring, ivory 15** | ❌ | ✅ chips | — |
| dock strip | ✅ | ✅ | ✅ pill *(cinematic paint)* | ❌ | — | — |
| SR announce | ✅ | — | ✅ `target 15` | ❌ | — | ❌ |
| verdict card | ✅ | ⚠️ *no element — deferred* | ✅ `vs DC 15` | ❌ | ✅ mod-cards | ❌ |
| result banner | ✅ | — | ✅ `VS DC 15` | ❌ | — | ❌ |
| roll log | ✅ | — | ✅ `vs 15` | ❌ | ✅ struck/✴ | ❌ |
| peek | ✅ | — | ✅ `vs DC 15` | ❌ | ✅ (breakdown) | ❌ |

Six subsets → **one**, with one honest, uniform, system-independent gap (the verdict card's subtitle) held open in the roadmap.

---

## What `#result-total` does under a per-die system

**Nothing. It never paints — and it never holds a number.**

`#result-total` is `css/style.css:2738-2745`: `var(--font-display)` **52px/700**, `color: var(--gold-bright)` = `#ffd766` (css:22). `.roll-cue` is `rgba(255,215,102,0.34)` (css:1070-1082) — `rgb(255,215,102)` **is** `#ffd766`. The 52px number is literally the roll verb's hue at full alpha, and under soul-deal it is `display:none` for every open roll and springs to life only to announce an absence.

```js
// js/main.js:2937-2938
resultTotalEl.style.display = sysTotals ? '' : 'none';                    // drop `|| hidden`
resultTotalEl.textContent   = sysTotals ? (hidden ? '?' : String(entry.total)) : '';
```

Two things happen there and both matter. The display gate loses `|| hidden`; and **the textContent write moves inside the gate.** Today line 2938 writes `entry.total` into the node on *every paint under every system* and only CSS withholds it — the sum is in the DOM at all times, one devtools inspection or one CSS regression from leaking. That closes.

The `?` leaving is a **correctness** fix, not taste. Under dnd a `?` is right: a number exists and is being withheld. Under soul-deal **no number is being withheld** — *words* are. A `?` in the total slot claims a hidden sum that will never exist. The state is a fact of the roll (goal 11), so it is spoken in words in the slot that already holds words — exactly what the verdict card (`.verdict-hero.held`) and the log (`.log-hidden`) already do. Three surfaces converge on one vocabulary, factored into `heldWord(entry)`.

This resolves the 2i-C hue collision by **deletion, not re-hueing** — no new colour decision — and §7.21's *hierarchy is AREA, not volume* is satisfied because the outcome rows already own the hero area.

Same edit at `js/main.js:1566` for `.pk-total`, with a `.pk-held` dress.

**Explicitly out of scope, and named:** `#dock-strip .strip-dc` (gold-bright) and `.offer-vs` (`--gold`) are gold numerals on *pre-roll declaration* surfaces. They ship that way, nobody has complained, and retinting them is a §7.9 / 2i-C hue pass I cannot judge without looking. U17 governs the **post-roll** register only: on a result surface, gold and red mean *adjudicated*. An unadjudicated stake takes the muted register with an ivory numeral.

---

## What happens to the dead `meaningFor` surface

**Delete the channel — producer, all consumers, its CSS, and its spec section.** All three profiles declare `meaningFor: () => null` (`js/meanings.js:177, 239, 258`), so `entryMeaning` returns `null` on every path. Unreachable, untested render code with live CSS is debt wearing a socket's costume.

| site | disposition |
|---|---|
| `js/meanings.js:177, 239, 258` + contract prose at 161 | `meaningFor` removed from all three profiles and from the interface |
| `js/main.js:2470-2477` `entryMeaning` | deleted (behaviour-neutral: it returned null on every path) |
| `js/main.js:2474` the dc short-circuit | deleted **with the doctrine restated, not lost** — see below |
| `js/main.js:2544-2545` `critWord`'s `if (meaning)` | deleted; signature becomes `critWord(crit, entry)`; both call sites (2994, 2997) updated. It always fell through already |
| `js/main.js:2944, 2951-2953` banner else-branch | replaced by `hidden ? heldWord(entry) : ''` |
| `js/main.js:1588-1596` `.pk-meaning` element | deleted, markup and producer |
| `js/main.js:4048, 4076-4078` verdict `else if (meaning)` | deleted; the chain becomes rows → adjudication → `''` |
| `js/main.js:9319-9323, 9335` log `meaningHtml` | keys off `outcomes` alone; the `else slot.textContent = meaning.word` goes |
| `css/style.css:3521-3522` `.pk-meaning` | deleted (live CSS with no producer) |
| `css/style.css:4507-4508` `.verdict-hero.tier-crit-success/-crit-fail` | deleted — reachable *only* through the deleted branch (`renderOutcomeRows` puts tier classes on child `.oc-word` spans, never on `heroEl`) |

**The one thing that must not die with it.** `entryMeaning:2474` (`if (Number.isInteger(entry.dc)) return null;`) encodes real doctrine — *a roll with a target is a Check and the verdict is its entire read*, the gate that killed "Failure beside a chart Success." That is precisely the conflation U17 names: "a dc is present" wired as "the sum verdict owns the hero." **This rule supersedes it and states it better:** the hero holds the READING, `#verdict-margin` holds the STAKE, and they never contend for one slot — so a target no longer needs to suppress anything.

**Doc placement (my ruling, against all three).** §2.5's ruling is retired. It does **not** get rewritten in place: §1–§6 are declared history by the document's own banner, and the §7 table exists because two agents already shipped wrong builds by reading a section that *described* a surface instead of the one that *changed* it. So:

- **`docs/UX.md` §2.5** is struck to a two-line pointer: *"Retired by §7.24. The one-hero-slot conflict it arbitrates cannot arise — `meaningFor` is gone — and the conflict it feared is resolved by moving the target out of the hero, not by silencing the chart."*
- **New `docs/UX.md` §7.24 — THE STAKE AND THE READ**: the rule at the head of this document, the stake/arithmetic/selection taxonomy, the eight-surface table, the note that no per-die comparator exists and `cs>=N` is roadmap §8's.
- **WHAT IS TRUE TODAY gains/updates rows** in the same commit for **Verdict card**, **Result banner**, **Peek**, **Roll log** and **± popover** — each pointing at §7.24 for stakes and naming §2.5 under *Do not build from*. The table's own rule is "update the row in the same commit that changes the surface"; U17 changes five surfaces. This is the item ROADMAP U4 already lists.
- **`js/meanings.js`'s interface prose** (lines 138–169) is rewritten to interface **v3**: `usesTotal` narrowed to the one sentence above, `usesMods` and `meaningFor` gone, `targetWord` added, and one line recording that selection mods are universal because `outcomesFor` filters on `p.counts && !p.child`.

---

## Which existing gates change, and to what

### The profile interface (`js/meanings.js`)

**Removed:** `usesMods` (176/238/257), `meaningFor` (177/239/258).
**Kept, narrowed in prose:** `usesTotal` (175/237/256).
**Added — one string:**

```js
targetWord: 'Target'            // soul-deal, none
targetWord: 'Difficulty Class'  // dnd
```

Used by exactly one site: `#intent-target-label`. The profile owns the *name* of the stake; nothing about whether it renders. `aggregate` stays as-is (still consulted by nothing but comments — not U17's problem).

**Why this field exists.** With the badge ungated, a Soul Deal declaration would print `DIFFICULTY CLASS` in gold caps under a 96px ring — a D&D mechanic's proper noun on Joe's own game, at the beat GOALS goal 3 calls the app's most deliberate. `Target` is the word the ± popover (`Target (DC)`), the SR announce (`target 15`) and UX §2.1's own record field already use. Cost: nothing — dnd keeps its flavour, and the terse post-roll strings (`vs DC 15`, `vs 15`) are unchanged because they are readbacks of the `dc` token itself, not names of a concept.

### `js/main.js` — new helpers (next to `entryOutcomes`, ~2480)

```js
const heldWord = (entry) => (entry.visMode === 'whisper' ? 'Whispered' : 'Face down');

// The stake, one string, no system in it — deliberately.
function stakeInto(el, entry, adjudicated) {
  el.append('vs DC ');
  if (adjudicated) { el.append(String(entry.dc)); return; }
  const n = document.createElement('span');
  n.className = 'stake-num';       // unadjudicated register: muted label, ivory numeral
  n.textContent = String(entry.dc);
  el.appendChild(n);
}
```

### The render sites

| # | site | from | to |
|---|---|---|---|
| 1 | `renderIntentCard`:3890 | `Number.isInteger(roll.dc) && activeSystem().usesTotal` | `Number.isInteger(roll.dc)` — the cleanest case in the file: this runs at *declare*, with no `entry`, no `total`, no comparison. It was withholding a literal the player typed on the grounds of an arithmetic that had not happened and would not be shown either way |
| 2 | `renderIntentCard`, target label | static `Difficulty Class` in `index.html:616` | `= activeSystem().targetWord` |
| 3 | `renderIntentCard`:3897 | `activeSystem().usesMods ? preModChips(m) : []` | `preModChips(m, { arithmetic: activeSystem().usesTotal })` |
| 4 | `preModChips`:3849-3854 | unconditional | the flat/named block runs only `if (opts.arithmetic)`; 3855-3859 (ADV/DIS, keep, `RO≤`, `!`) **always** emit |
| 5 | `renderIntentCard`:3906-3912 | — | **unchanged.** The notation line stays whole, `dc15` included |
| 6 | `renderDockStrip`:3921 | — | **unchanged** |
| 7 | `renderVerdictCard`:4038-4039 | `sysTotals`; `hasDc = …&& sysTotals` | `const hasDc = Number.isInteger(entry.dc);`<br>`const adjudicable = hasDc && sysTotals && !hidden;` |
| 8 | `renderVerdictCard`:4042, 4044 | `hasDc && !hidden` | `adjudicable` |
| 9 | **new, immediately after `marginEl.textContent = ''`** | — | `if (hasDc) stakeInto(marginEl, entry, adjudicable);` — **written once, above and outside every branch, including the hidden early-return** |
| 10 | `renderVerdictCard`:4055 | `if (hasDc) marginEl.append(…)` | deleted (line 9 covers it); hero ← `heldWord(entry)` |
| 11 | `renderVerdictCard`:4065-4075 | `else if (hasDc)` + `marginEl.append('vs DC N · margin ')` | `else if (adjudicable)` + `marginEl.append(' · margin ')` — the prefix is already on screen. Byte-identical dnd output |
| 12 | `renderVerdictCard`:4087 | `activeSystem().usesMods ? attributionCards(…) : []` | `attributionCards(roll, entry, { arithmetic: activeSystem().usesTotal })` |
| 13 | `attributionCards`:3932-3937 | unconditional | the flat/named block runs only `if (opts.arithmetic)`; adv (3938-49), reroll (3950-61), keep (3962-70), explode (3971-74) **always** emit |
| 14 | `renderRollResults`:2937-2938 | see above | display gate loses `\|\| hidden`; textContent write moves **inside** the gate |
| 15 | `renderRollResults`:2951-2953 | `meaning ? meaning.word : ''` | `hidden ? heldWord(entry) : ''`, `className = hidden ? 'held' : ''` |
| 16 | `renderRollResults`:2961 | `if (Number.isInteger(entry.dc) && sysTotals)` | `if (Number.isInteger(entry.dc))` → `stakeInto(el, entry, adjudicated)`, then the `— Success/Failure` tail + hue class only when `adjudicated` |
| 17 | `renderRollResults`:2986 | — | unchanged (already `usesTotal`-gated) |
| 18 | `ceremonyEnterSettle`:3676-3677 | — | **unchanged.** Correct by rule; and #16 makes the banner's twin agree with it |
| 19 | `renderPeek`:1566 | `if (hidden \|\| !entry) total.textContent = '?'` | `!entry` keeps `'?'`; `hidden` → `heldWord(entry)` + `.pk-held` under a per-die lens, `'?'` under a totals lens |
| 20 | `renderPeek`:1571 | `total.textContent = String(entry.total)` | `activeSystem().usesTotal ? String(entry.total) : ''` — closes the ungated sum fallback (unreachable today only by accident) |
| 21 | `renderPeek`:1575-1585 | `… && activeSystem().usesTotal` | same nested shape as #16 |
| 22 | `buildLogEntryEl`:9281-9290 | ungated `modPartsOf` / `entry.modifier` | wrap the whole chain in `activeSystem().usesTotal` |
| 23 | `buildLogEntryEl`:9314-9318 | `!Number.isInteger(dc) \|\| !usesTotal ? '' : …` | `!Number.isInteger(dc) ? '' : (hidden \|\| !usesTotal) ? \`<span class="log-verdict">vs <span class="stake-num">${dc}</span></span>\` : \`<span class="log-verdict ${ok}">vs ${dc} ✓/✗</span>\` ` |
| 24 | `buildLogEntryEl`:9328, 9361 | — | unchanged (Bucket A) |
| 25 | `renderBreakdown`:2752 | `if (!mods.length) return;` then `= ${entry.sum}` + tail | `if (!mods.length \|\| !activeSystem().usesTotal) return;` — **missed by A and B.** Reachable under per-die when `outcomesFor` returns null on a visible roll (all-child / all-discarded pools) |
| 26 | `modsSummary`:11810 | `modsSummary(mods)` | `modsSummary(mods, { values })`; value clauses skipped when `values` is false, shape clauses always. `renderOffers`:11880 passes `{ values: activeSystem().usesTotal }`; `9176` passes nothing |
| 27 | `renderOffers`:11888 | — | **unchanged** |
| 28 | `openPopover`:8246 | `toggle('pop-perdie', !activeSystem().usesMods)` | `toggle('pop-perdie', !activeSystem().usesTotal)` |
| 29 | `index.html`:761-762 | `class="sec tight sec-sum"` / `prow prow-sum` on **Target (DC)** | both dropped — a target is a stake and must be **authorable** under every system |
| 30 | `index.html`:748, 802, 819 | `sec-sum` on d20 pairing / Keep-drop / Reroll-Exploding | dropped — these decide *which dice count*, which `outcomesFor` reads (`p.counts && !p.child`) and `forecastFor` refuses to pre-read **because** of it |
| 31 | `index.html`:735 | `sec sec-sum` on **Modifier** | **kept** — the one genuinely sum-world section. Joe's 2026-08-06 fold ruling ("entirely — no note") stands exactly over it |
| 32 | `updateTrayModsWord`:5945 | `const full = activeSystem().usesMods` → `± Modify` / `± Moment` | `± Modify` unconditionally; the per-die title drops "Modifiers" and gains a tail |

**#29 is not optional.** With the dc on five more surfaces, a target that round-trips invisibly — `popStateFromParse`:8168 loads it, `popCanonical`:8626 emits it, `#pop-echo`:8798 prints it, and the editor shows no row — becomes a worse split than the one U17 is closing. It is U11's own named remaining hole ("re-add via ± is impossible for `dc`").

**#32 applies U11's rule, it does not overturn it.** `± Moment` was correct when the popover held two of seven sections; after #29-#31 it holds **six of seven**, and naming one of six is the same defect U11 fixed.

### CSS — four rules, two deletions

```css
/* the unadjudicated stake: muted label, ivory numeral. One register,
   four surfaces (verdict margin, banner verdict, peek verdict, log). */
.stake-num { color: var(--ivory); font-variant-numeric: tabular-nums lining-nums; }

/* with the ring folded the stake must caption the ROWS, not echo the
   eyebrow: 6px under an 11px caps line reads as a second eyebrow. */
#verdict-card .ring-wrap.hidden + .margin-line { margin-top: clamp(10px, 2vmin, 18px); }

/* the held word takes the slot the `?` vacated, in the dress the verdict
   card already owns (.verdict-hero.held, css:4506). */
#result-meaning.held { color: var(--muted); font-style: italic; letter-spacing: 0.06em; }
.pk-total.pk-held  { color: var(--muted); font-style: italic; letter-spacing: 0.06em;
                     font-size: 15px; text-shadow: none; }
```

Deleted: `.pk-meaning` (3521-3522), `.verdict-hero.tier-crit-success/-crit-fail` (4507-4508).

**Not renamed:** `.margin-line` / `#verdict-margin` keep their names (against A's #20). A rename buys a nicer word and risks a stale selector in `tools/steps/*`, the look tools and the suite. The section that explains the slot is §7.24; that is where the name lives.

---

## Does it look right?

**The verdict card, soul-deal, after — described as a reader meets it.**

A translucent gold-cornered card sits at the top anchor, 300–430px wide, and it now runs **head, caption, answer, exits** — four bands, top to bottom, with real air between them.

The head is unchanged: `JOE · THE DUEL` in 11px muted tracked caps, the roller's name in their colour.

Then a gap — and this gap is the one thing that had to be got right. The ring is folded, so the stake line would otherwise land 6px under the eyebrow, and two small tracked-caps lines stacked 6px apart read as *one doubled eyebrow*, not as a head and a caption. That is exactly the "measured clean, looked bad" failure this repo keeps post-morteming, and none of the three stances saw it. So `#verdict-card .ring-wrap.hidden + .margin-line` opens the gap to clamp(10px, 2vmin, 18px), and the stake line falls into the seat the ring vacated — closer to the answer than to the head, which is what it is: a caption over the reading.

The caption reads **`v s   D C   1 5`** — 10px, 0.2em tracking, uppercase, `--muted`, with the numeral in `--ivory`. That ivory numeral is doing real work. It gives the line a focal point without hue, so the eye lands on *15* rather than sliding past a grey ribbon; and it is not an invention — the intent card's `.tnum` is already `--ivory` inside a gold ornament, so the card that declared the stake and the card that answers it now spell the number the same colour. Gold on a result surface would say *how it went*, and nothing has gone.

Then the answer, and it is unmistakably the largest thing on the card: one pill reading `d20 8` in mono, and beside it *quiet* in italic grey, at `.oc-solo` hero scale — 19px, roughly double the caption. §7.21's law holds without argument: the reading wins the **area**, the stake is the small line above it. The hero's gold flanking bars stay suppressed by `verdict-outcomes` (`content: none`), so the row reads as evidence, not as a proclamation.

Hairline, then the fold: `✕ Clear` in red at `flex:1`, `REROLL ❯❯❯` resting at 0.45. Unchanged.

What the card no longer does is the thing the audit caught it doing: stand at the moment of the verdict with a name and a die and nothing about the moment that was declared. And what it still refuses to do is conclude. There is no ring, no empty gold circle implying a missing number, no `?`, no `Success`, no `13`. The absence of the ring is what keeps `vs DC 15` reading as a **caption** rather than a **gap** — there is no vacant socket beside it announcing that something failed to arrive.

Compare `tools/out/lifecycle/09-check-verdict.png`: today the card is head, chip, rule, buttons — three bands with a large unexplained void between the head and the chip. The stake line fills that void with the one fact the player is holding in their head.

**One line I will not certify from source.** The intent card's badge under soul-deal I can predict confidently (it is dnd's shipped render with one word changed and `tools/out/lifecycle/07-check-declare.png` shows the hole it fills), but per this repo's own standing rule — *look before "done"* — the stake line's vertical rhythm on the verdict card, and the `.pk-held` word replacing a 30px gold numeral on the peek, get an interactive look before U17 is called shipped. That look is one pass over the existing `tools/steps/lifecycle-*` fixtures, not a validation sweep.

---

## Every disagreement, ruled

| # | question | ruling | who wins |
|---|---|---|---|
| 1 | Is a dc a stake without a summed verdict? | **Yes.** It is the player's sentence, not the app's reading; three places in the repo already say so; and `dc` alone stages the ceremony that then hides it | A, B |
| 2 | Gate the dock strip? | **No.** Ungated `hasDc` is the model. CSS cinematic-only paint stays — `css:4374-4376` states that decision in prose | A, B |
| 3 | Gate the offer card's `vs 15`? | **No** | A, B |
| 4 | Gate the SR announce's `target 15`? | **No** — and #16 makes the banner's twin agree with it for free | A, B |
| 5 | The flat / named modifier under a per-die lens? | **Renders nowhere in the app's voice — intent chip, mod-card, log, offer summary, breakdown tail all gate on `usesTotal`.** `.log-mod` is gold-bright/700 feeding an empty column; it is the surface that most implies the sum | **C** |
| 6 | Selection mods (adv, keep/drop, reroll, explode)? | **Universal.** `outcomesFor` filters on `p.counts && !p.child` and `forecastFor` refuses keep/drop *because* they matter. Today a `4d6dl1` under soul-deal shows no dropped die on the verdict card, banner or peek — a live break of GOALS' *Attributed math* on the default system | A, B |
| 7 | Rewrite the interface as `readFor(entry)`? | **No.** See the deferral below | A over B |
| 8 | Keep `usesMods`? | **No — delete it.** It never distinguished anything | A, B |
| 9 | Strip `dc` from the intent notation line? | **No.** It is a verbatim quote; a canonical echo that drops a token is a lie, and `ledger-read` pins that line as a declaration of pools | **C** over A |
| 10 | Rename `.margin-line` → `.stake-line`? | **No.** Churn with selector risk across tools, look tools and suite | against A |
| 11 | Add `#verdict-subtitle`? | **Deferred** — see below | against A, B |
| 12 | `#result-total`'s `?` under per-die? | **Gone, and the textContent write moves inside the gate.** State goes to words via `heldWord` | unanimous |
| 13 | `meaningFor`? | **Deleted**, producer + 5 consumers + 2 CSS rules, with its dc-doctrine restated by the new rule | unanimous |
| 14 | Where does the live ruling live? | **New §7.24 + WHAT IS TRUE TODAY rows.** §2.5 struck to a pointer | **mine** — A rewrites a dead section |
| 15 | `± Moment` → `± Modify`? | **Yes, unconditionally.** Six of seven sections now stand under a per-die lens | A |
| 16 | Popover `Target (DC)` folded? | **Unfolded.** Also pairing, keep/drop, reroll/explode. Modifier stays folded | A, refined |
| 17 | The badge's label under soul-deal? | **`targetWord`, profile-supplied.** `Target` / `Difficulty Class` | **mine** — all three missed it |
| 18 | Hue for the unadjudicated stake? | **`.stake-num` — muted label, ivory numeral, one register on four surfaces.** Pre-roll gold (dock pill, offer `vs`) explicitly out of scope | **mine** |
| 19 | Build a per-die comparator? | **No.** `cs>=N` / `target.cmp` / `scope:'each'` stay roadmap §8, and U17 says so in one line | unanimous |

---

## Deferred, and what the deferral costs

*(Both are now recorded in **UX.md §7.24, "Deferred, with the cost named"** —
the section a reader reaches from the WHAT IS TRUE TODAY table. This is the
reasoning; that is the durable notice.)*

**1. B's `readFor(entry)` interface.** Refused for 2026-08-13. It changes nothing the player sees versus this spec; it is ~70 lines across the file's most-repainted functions five days before a play date; and its own shape (`{headline, verdict, ring}`) presumes the sum world's furniture, so the first genuinely different profile would force a redesign anyway. **Cost of deferring:** hero arbitration stays in `js/main.js` rather than in the profile, so the day a hybrid system (chart words *and* totals) ships, whoever builds it re-opens the one-hero-slot question §2.5 was invented for. §7.24 records that explicitly, so it is a known door and not a rediscovery. B's real content — a smaller interface, the stake and the read in separate slots — ships here by subtraction.

**2. `#verdict-subtitle`.** The verdict card has no subtitle element (`index.html:647-664`), under any system, for any notation. That is a **missing element**, uniform across all three profiles — not a gate, not part of the conflation, and not something a lens can be blamed for. Adding it means new markup, new CSS, and a third small line between the eyebrow and the answer on a card whose whole virtue is *the name, the answer, the exits* — a hierarchy call I decline to make from source. **Cost:** the eight-surface table keeps one residual asymmetry (row 5, subtitle). Named in §7.24, and filed as a ROADMAP rider under U16 (which owns the draft's intent read) rather than left to be re-audited.

**3. Pre-roll gold numerals** (`.strip-dc`, `.offer-vs`). Named above; a §7.9 hue pass, not U17's.

---

## The strongest objection, and the answer

> **`vs DC 15` beside `d20 8 quiet` is a promise the app cannot keep.** You replaced a silent card with one that raises a question and refuses to answer it. The player has a target on screen and no arithmetic anywhere, so they will do it in their head — and `entry.total` is sitting at **13** (`entryFromRoll`:2595 computes `sum + modifier` unconditionally, every system, forever), while the chart beside it read the raw **8**. Two numbers, one die, one card. And at N > 1 it is worse: `3d10 dc15` prints three independent chart words above a target that can only be met by *adding them* — the one act Joe's law forbids in ten words. Silence was safer.

Four answers.

**1. Removing the `+5` removes the arithmetic, and that is why C had to be grafted in.** This is where A and B were genuinely vulnerable and this spec is not. Under A's version the card shows `vs DC 15`, a `+5 Modifier` flying up, and a raw `8` — every operand of the phantom sum, laid out, minus the operation. Here the card shows `vs DC 15` and `d20 8 quiet`, and **13 appears on no surface under this lens** — not the banner, not the peek, not the ring, not the log's total column, not the log's detail, not the breakdown tail (#25), not the offer card. The mental arithmetic the objection fears now requires the player to supply an operand the app never showed them. Today's build is the one that lays the trap: `d20 8 +5 · a quiet roll`, a bonus added to a number that is nowhere on screen.

**2. The invitation exists whether we print it or not.** The player typed `dc15`. It is on the offer card, in the dock pill, in `popCanonical`, in `#pop-echo`, in the saved-pool record, in the YAML export, and — in a build four days old — **spoken aloud** to a blind player as `target 15` at `ceremonyEnterSettle:3677`. Withholding it from four surfaces does not un-declare it; it guarantees that the one place a player looks at the decisive moment is the one place it is missing. The audit's sentence is exact.

**3. Declining to conclude is obedience, not evasion.** GOALS goal 6 draws the line: *"Dice, not game rules. How rolls fit into an RPG's mechanics is the players' business."* `total >= dc` is not a fact about dice — it is a house rule, true under D&D-style play and undefined under Soul Deal. `usesTotal:false` is a profile saying *I do not define that comparison*. Silence on the **verdict** is obedience; silence on the **stake** is amnesia. Printing `Success` would invent a rule; printing `vs DC 15` repeats what the table said before it rolled.

**4. On N > 1: this rule is what *prevents* the sum, and the current build is what implies it.** `13` lives only in `entry.total`, and every render of it stays behind `usesTotal`. Under soul-deal `3d10 dc15` shows three chart words and `vs DC 15`; it never shows 22, never draws a ring at 22/15, never says cleared, and after #22 never prints a bonus to be added to anything. And the card already ships this exact shape without complaint: **`vs DC 15` over `Face down`**, `js/main.js:4052-4059`, commented *"Public stakes, hidden result."* The code knew how to hold a stake without a verdict. It never noticed a per-die system is the same case.

**The residual cost, stated plainly.** A Soul Deal player who wants a target *judged* still cannot have one, and now sees it rendered without a judgement — which makes the absence more visible than it was. That is the correct trade. The absence is real, inventing a per-die comparator to paper over it would be the app deciding how a target works in someone else's game, and roadmap §8 owns that decision. Making the gap visible is how it gets designed rather than forgotten.

---

## Build order — smallest independently-committable steps

Each step leaves the app coherent and shippable on its own. Total: ~90 lines touched in `js/main.js`, about a third of them deletions; −3/+1 members in `js/meanings.js`; 5 lines of `index.html`; +4/−4 CSS rules.

**Step 1 — The stake renders.** *(the audit's core; ships alone)* — **SHIPPED `fe9acbd`.**
`heldWord` + `stakeInto` helpers · gates #1, #7, #8, #9, #10, #11, #16, #19(dc half), #21, #23 · `targetWord` in all three profiles + gate #2 · the `.stake-num` and `.ring-wrap.hidden + .margin-line` CSS rules.
After this commit: the dc renders on all eight surfaces, no surface prints an unearned `✓`/`✗`/`Success`, and the verdict card's branch-order trap is gone. `+5` is still inconsistent — that is step 3.
*As shipped:* all of it, plus one defect only LOOKING caught — U13's "Save as pool…" was deriving its class by string-stripping `revealClass` and shipped with **no dress**, a browser-default white button between a red Clear and a gold REROLL, every assertion green. Fixed in the same commit.

**Step 2 — The `?` leaves the total slot.** — **SHIPPED `ba03e88`.**
Gates #14, #15, #19(held half), #20 · `#result-meaning.held` and `.pk-held` CSS.
Independently valuable: the app's headline privacy feature stops answering with a mute 52px gold glyph, and the sum leaves the DOM under a lens that refuses it.
*As shipped:* banner and peek only. **The log's total column still answers `?`** — a site the gate table never listed (see the status block).

**Step 3 — Arithmetic and selection split.** — **SHIPPED `f5359d8`** *(with #26 missed)*.
Gates #3, #4, #12, #13, #22, #25, #28, #32 · `index.html` #29, #30 (#31 untouched) · delete `usesMods` from all three profiles.
Independently valuable even without steps 1–2: it closes the *Attributed math* invariant break on the default system and makes the dc authorable in the ± popover.
*As shipped:* **#26 did not land** — `modsSummary` has no `values` option and `renderOffers` passes none, so the offer card still prints the flat `+5`. And the dropped-die claim was narrower than written: it returned to the **verdict card** only (see the status block).

**Step 4 — Delete the `meaningFor` channel.** — **SHIPPED `f5359d8`** (same commit as step 3). JS + CSS per the table above; `critWord` signature and both call sites. Pure subtraction, behaviour-neutral.

**Step 5 — Docs, one commit.** *(this pass)* `js/meanings.js` interface prose · UX.md §2.5 → struck to a pointer · new §7.24 · WHAT IS TRUE TODAY rows · GOALS' *Attributed math* gains the clause that it governs math which happens · ROADMAP U17 marked step by step, with the two deferrals (`readFor`, `#verdict-subtitle`) recorded where the next reader will find them — §7.24's *Deferred* and, for the subtitle, a rider under U16.
*Note:* the interface prose in `js/meanings.js` was rewritten during steps 1 and 3, so step 5 inherits it. Its heading still reads **"Profile interface v2"** over a v3 member list — a one-word correction for whoever is next in that file.

**Step 6 — Look. — OPEN.** One interactive pass over the existing lifecycle fixtures: check-declare (badge + `TARGET`), check-verdict (stake line rhythm), peek held, whisper banner. Per the repo's standing rule, U17 is not "done" before this.

---

## Test plan — scenarios by tag, `__diceDebug` hooks needed, existing pins to re-point

**No new `__diceDebug` hooks are required.** Everything the new assertions need already exists and is exercised by `ledger-read`: `commandRoll`, `sim`, `skipCeremony`, `ceremonyState`, `retireCeremony`, `setSystem`, `openPopoverFor`, `closePopover`, `cardActs`, `logTop`. Per §7.21's lesson, **every visibility assertion reads computed `display`/`offsetParent`, never a class.**

### Existing pins to re-point

| file:line | today | becomes | step |
|---|---|---|---|
| `tests/e2e/scenarios.mjs:811` (`per-die-read`, **smoke**) | `assert.ok(!logTop().includes('vs 15'))` | `assert.ok(logTop().includes('vs 15') && !/[✓✗]/.test(logTop()), 'the stake shows; the verdict does not')` | 1 |
| `scenarios.mjs:817` (same) | `assert.ok(logTop().includes('vs 15'))` under dnd | **must tighten** to `/vs 15 [✓✗]/` — it stops discriminating otherwise | 1 |
| `scenarios.mjs:801-803` `#result-total` computed `display === 'none'` | — | **survives, becomes more true** (no `?` flicker on the hidden path) | — |
| `scenarios.mjs:806-807` `.log-total` textContent `''` | — | **survives** | — |
| `scenarios.mjs:~830` `secVisible` over `.sec-sum, .prow-sum` | asserts all fold under per-die | re-scope to the **Modifier** section only; add positive computed-visibility assertions that `#pop-dc`, `#pop-seg-adv`, `#pop-seg-keep`, `#pop-sw-reroll`, `#pop-sw-explode` are **visible** under soul-deal (four of these currently assert the opposite) | 3 |
| `scenarios.mjs:838` `#pop-sysnote === null` | — | **survives** — no note returns, per Joe's 2026-08-06 ruling | — |
| `scenarios.mjs:3597, 3610` (`rim-word`, **smoke**) | `'± Moment'` under soul-deal | `'± Modify'` under both; assert the *title tail* differs instead of the word, and keep the `!/tweak/i` ban | 3 |
| `scenarios.mjs:996-999` (`ledger-read`) ring folds | — | **survives** — the ring folds on `usesTotal` (4004), untouched | — |
| `scenarios.mjs:~991` `#intent-notation` includes `[Wisdom]` | — | **survives** — the notation line stays whole | — |
| `tests/meanings.test.mjs:81` `sd.usesMods === false` | — | **deleted** (field is gone) | 3 |
| `tests/meanings.test.mjs:82` `sd.meaningFor() === null` | — | **deleted**; replace with `assert.equal(sd.targetWord, 'Target')` and `assert.equal(SYSTEMS.dnd.targetWord, 'Difficulty Class')` | 4/1 |

### New scenario — `stake-read`, tags `['smoke','meanings']`

One pass, one fixture (`1d20+5 check dc15 # The Duel | Charisma`) under soul-deal, then the same log re-read under dnd:

1. **Declare:** `#intent-target` computed-visible; `#intent-target-label` textContent `Target`; `#intent-notation` still contains `dc15`; `#intent-mods` has **no** `+5` chip.
2. **Verdict:** `#verdict-margin` textContent is exactly `vs DC 15`; `#verdict-hero` contains none of `Success`, `Failure`, `13`; `#verdict-hero` carries `verdict-outcomes`; `#verdict-modcards` is empty; `#verdict-margin .stake-num` exists.
3. **Selection mods return** *(step 3's real payload)*: `4d6dl1 check` under soul-deal → `#verdict-modcards` contains a `DL1 dropped …` card, and the dropped die's label appears inside an `<s>`. This is the GOALS *Attributed math* pin.
4. **Log:** `.log-verdict` reads `vs 15` with no `ok`/`bad` class; the line contains **no** `+5`; `.log-total` is `''`.
5. **Banner / peek:** `#result-verdict` has neither `verdict-success` nor `verdict-fail`; `#result-total` computed `display === 'none'` **and** `textContent === ''`.
6. **Hidden:** a whispered roll's banner → `#result-meaning` reads `Whispered`, carries `held`, and `#result-total` is both `display:none` and empty. Peek → `Face down` with `.pk-held`.
7. **SR agreement:** after a ceremony settle `#sr-live` contains `target 15`; after a banner paint the announce contains `vs DC 15`. *(The one assertion that pins the two announce sites to each other.)*
8. **The relit re-read:** `setSystem('dnd')` on the standing card → `#verdict-margin` becomes `vs DC 15 · margin −2`, `#verdict-hero` reads `Failure`, the ring unfolds, a `+5 Modifier` mod-card appears. `setSystem('soul-deal')` → all of it withdraws and `vs DC 15` remains. This is the lens contract, pinned in one place.

### Run path

`npm test` (unit + fuzz + e2e smoke) after every step — `per-die-read`, `ledger-read`, `rim-word` and `stake-read` are all smoke-tagged, so the whole U17 surface is covered by the seconds-long script. `node tests/e2e/run.mjs --only meanings` for the targeted loop. Full sweep is a pre-release gate, not a per-step cost.

---

## What NOT to do

- **Do not build a per-die comparator.** No `target.cmp`, no `scope:'each'`, no `cs>=N`, nothing in `outcomesFor` that consults `entry.dc`. It would burn a field UX.md §2.1 explicitly reserves for roadmap §8 (which already rules that case needs a *different verdict rendering* — success pips, not a ring) and it would have the app decide how a target works in someone else's system. §7.24 says this in one line so it is not re-derived.
- **Do not flip `renderVerdictCard`'s `hasDc` gate alone and call U17 done.** It changes exactly three things: `strokeDashoffset` and `.fail` computed on an element `css:4460` has set to `display:none`, and the held-branch line at 4055. The verdict card — the surface the audit is *about* — shows nothing new, because `renderOutcomeRows` at 4061 blocks the `else if` at 4065. The stake must be written **outside** the chain.
- **Do not flip the log's gate at 9314 alone.** It prints `vs 15 ✗` off a phantom **13** while the chart beside it reads the raw **8**. Worse than doing nothing.
- **Do not un-gate `#result-total` in CSS.** Line 2938 writes `entry.total` into the node on every paint under every system; only `display:none` withholds it. The textContent write must move inside the gate.
- **Do not restore the flat `+5` anywhere** — not as an intent chip, not as a mod-card, not in the log detail, not in the breakdown tail, not in the offer summary. It is the operand of an operation this lens does not perform.
- **Do not strip `dc15` from `#intent-notation`.** It is a verbatim canonical echo. The dnd double-print is intentional and already ships.
- **Do not gate the dock strip, the offer card's `vs`, or `ceremonyEnterSettle`'s `target N`.** They are correct; they were only accidentally correct before.
- **Do not restore `#pop-sysnote` or add any "the dc does nothing here" note.** Joe deleted that species of note on 2026-08-06 ("entirely — no note"), it would fire per keystroke, and it would be false: `dc15` under soul-deal stages the Check (`notationIntent`) and arms the dnd re-read.
- **Do not un-fold the popover's Modifier section.** #31 stays `sec-sum`. It is the one genuinely sum-world section and Joe's ruling sits exactly over it.
- **Do not rename `.margin-line` / `#verdict-margin`,** and do not add `#verdict-subtitle` in this pass.
- **Do not touch U18.** `soul-deal.critFor` fires on any crit chart cell — a `3d10` pool crits 48.8% of the time. It is inside the same file and outside this decision.
- **Do not re-tint `.strip-dc` or `.offer-vs`.** Pre-roll declaration hue is a §7.9 pass.
- **Do not restructure the profile interface** (`readFor`) before 2026-08-13. Take the subtraction, leave the rewrite.
- **Do not add a `declaresStakes` profile bit.** It would equal `usesTotal` for every shipped profile, and the one future system that legitimately reads per-die targets needs real design, not a boolean.
- **Do not touch port 8123.**

---

**Rode with it — both CLOSED** *(B3 in `ba03e88`, B4 in `f5359d8`)*, kept as
the statement of what was wrong. ~~the only 52 px gold number a Soul Deal
table sees is `?` — `#result-total` is dead for every open roll and springs to
life, in the roll verb's own hue, only to announce an absence, with the banner
never saying *why* (the verdict card and log both name the state; the banner
is mute). And the meanings migration left dead surface: all three profiles
define `meaningFor: () => null`, so the non-ledger `#result-meaning` branch,
`.pk-meaning`, the verdict's `else if (meaning)` and §2.5's entire hero-slot
ruling are unreachable while §2.5 is still written as live spec (retire it
with U4's pass).~~ The banner and the peek name the rung now (`Face down` /
`Whispered`); the channel is deleted, producer and consumers and CSS; §2.5 is
struck to a pointer at UX.md §7.24. **The one residue: the log's total column
still answers `?`** for a held roll under a per-die lens.

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

### U27. The identity menu's touch path is dead code — DEFECT, small  
**SHIPPED 2026-08-08 (`07099a7`).**

*Audit T4 (major).* `identityChip` arms a 500ms long-press that calls
`openIdentityMenu()` (js/main.js:11683-11695), and the `click` listener
four lines up (11664) closes the menu on the same release. There is no
`lpFired` suppressor, so on a tablet the menu flashes and vanishes — and
that menu is the **only** door to *Change name…*, *Change seat…* and
*Leave table*. `Copy invite link` has a second home as a `.rail-ghost`; the
other three do not, so a touch-only player cannot rename, re-seat or leave.

The fix is a copy, not a design: the pool tile at js/main.js:7053-7095 is the
correct implementation — 500ms timer, 10px `pointermove` cancel,
`pointerup`/`pointercancel` teardown, `lpFired` checked and reset at the top
of the click handler, and the Android `contextmenu` handler clearing the
timer so the door cannot double-toggle. Lift it into a shared
`attachLongPress(el, fn)` while doing this; **U12 needs the same helper** for
`.shelf-marker` and `#peek-card`, so do U27 and U12 together and write the
helper once.

**Scenario:** extend `sheet-touch` — synthesize `pointerdown`, wait 550ms,
`pointerup`, assert the menu is still open. The existing pool-tile pin is the
model; the identity chip has no touch coverage at all today, which is why a
dead path shipped.

### U28. The coarse-pointer size pass — batch, medium

*Audit T1, T2, T3, T6, T7, T8, T9, T12.* **The structural finding, and the
reason this is one batch rather than eight entries: seven of the eight
`(pointer: coarse)` blocks in the stylesheet fix *visibility*, and exactly
one fixes *size*.** Touch was given things to see, not things it can hit.
Two of them are removers that were deliberately made to STAND on coarse
pointers by rules written to make them reachable, while staying 20px and
18px — `.die-x` (css:527) over 34px die art with no gap to its neighbour,
and `.rd-x` (css:1831) absolutely positioned **on top of the row that
increments**, holding x∈[64,82] of an 86px row, so a finger centred left of
it adds a die instead of removing one. §7.23 argued that ✕ must stand
"because a counted row you cannot decrement by touch is a trap"; it made it
visible, not tappable.

Measured, against a 9mm pad ≈ 34 CSS px:

| control | now | file |
|---|---|---|
| `#edge-toggle` — the ONLY pointer path to collapse/expand | 14px wide | css:236 |
| `.sw` switch (adv, explode, reroll, **sound**) | 30×17 | css:3843 |
| `.stepper button` (± mod, dc, keep/drop) | 23×24 | css:3839 |
| `#offer-pick` | ≈21 wide | css:891 |
| `.pop-close` | ≈17×21 | css:3748 |
| `.rd-x` | 18×18 | css:1831 |
| `.die-x` | 20×20 | css:527 |
| collapsed foot ⚙ ≣ ❯ ✕ | ≈19×27 | css:1760 |
| `#rail-mode` cells | 39×23 | css:1797 |
| `.tile-del` (destructive, no confirm) | 24×24, 6px from the next tile | css:1234 |
| `.roster-name` / `.rail-ghost` (Invite, + New table, Tables ▾) | ≈24 tall | css:2181 |
| `.rp-item` | 38 (deliberate, §7.22) | css:1898 |

Two selector faults to fix while in here, both of which explain why a bump
that exists did not land: **`#tray-mods` carries no `class="btn"`**
(index.html:196) so `.draft-actions .btn`'s coarse rule never matches it — it
reaches row height only because `align-items: stretch` drags it there — and
**`#offer-pick`'s id rule (1,0,0) out-specifies the coarse rule (0,2,0)**;
media queries add no specificity, so the id wins regardless of source order.
That is the one place in the stylesheet where an id beats a coarse bump, and
it is worth a comment when fixed.

Budgets are known, so this is arithmetic rather than design: the collapsed
foot has 6px of slack (80 of 86) — `padding: 10px 2px` gets four glyphs to
~35px inside it; `#rail-mode` has vertical room for `padding: 11px 2px`
(39×35); the ± popover is 312px wide with `overflow-y: auto` and can afford
the height. `#rail` is `flex-wrap: wrap`, so growing the roster pills wraps
the row instead of overflowing it. `#edge-toggle` should keep its 14px *ink*
and widen only its *target* (`::before` into the felt side, which has no
competing handler).

One addition that teaches rather than enlarges, and is the cheapest item
here: `.tile-add` (css:1224) — the `+` whisper that is the only thing saying
a rack tile *stages into the well* rather than rolling — is `opacity: 0`,
hover-only, with no coarse branch. On touch nothing distinguishes a rack tile
from a `.pool-roll` strip that fires immediately.

**Do this behind U23's token layer if U23 lands first** — a `--tap-min`
token is exactly the kind of thing that keeps this fixed. **Scenario:** a
`touch-targets` scenario that walks a list of selectors under
`emulateCoarsePointer` and asserts `getBoundingClientRect()` ≥ the floor;
`named-verb-touch` is the model, and a list-driven pin is what stops the next
control from shipping at 23px.

### U29. iOS text-input zoom and the keyboard-occluded foot — small

*Audit T11 (moderate).* Every text input in the app is under 16px —
`.cmd-in` 12.5 (css:3499), `.tin` 12, `.pid-name-input` 13,
`.new-shelf-input` 12, `.portable-text` 11, `.btn-row input` 13 — and iOS
Safari auto-zooms the whole layout on focus below that threshold. So tapping
the notation box, renaming a pool or naming a shelf jolts the table. Raise
them to 16px under `(pointer: coarse)` only; the mono face keeps the visual
register at that size.

Separately, `#left-panel { position: fixed; top: 0; bottom: 0 }`
(css:150-153) uses no `dvh` unit, and the viewport meta (index.html:20) has
no `interactive-widget=resizes-content` — so `#rail-foot` (⚙ ≣ ? ❯ and
✕ Clear table) sits *under* the software keyboard whenever any input is
focused. One meta attribute plus a `dvh` fallback.

Note index.html:20 is otherwise correct and should be left alone:
`initial-scale=1` with no `user-scalable=no` and no `maximum-scale` is what
keeps pinch-zoom alive, and pinch-zoom is what makes every undersized target
in U28 *recoverable* rather than impossible.

### U30. A short-viewport branch that trims the well, not the rack — small

*Audit T10 (moderate).* `.draft-zone` measures **203px** (167 with the rim
hidden) and it is sticky, so it is subtracted from every scroll. On a
**1024×768 landscape tablet** the panel body is 654px; minus the sticky zone
leaves 451px, and the section bar (46) + palette (152) + `#cmd` (~50) take
248 of it — **≈203px for the rack**, about two tile rows. The device with the
most screen puts the whole rack behind a scroll. Portrait (768×1024) is
comfortable at 707px.

**Nothing in the stylesheet keys off height.** The `@media (max-width: 640px)`
branch is a single rule that computes to no change at 640px and only bites
below 372px wide, so neither tablet orientation ever enters it.

Add a `max-height` branch that shrinks the *well* (`.tray-cluster` /
`.tray-roll` to ~84px, `.draft-zone` padding to 10px) rather than the rack —
`--draft-h` is recomputed from `offsetHeight` (js/main.js:5501), so the
sticky shelf-head offset follows automatically with no second edit. This
composes with the empty-draft shrink already argued for in **What NOT To Do**
(do not make the section bar sticky; let the well collapse toward the rim
when there is nothing staged).
