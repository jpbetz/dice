# Roadmap

Open work only, priority-sorted. Shipped work moved to
[SHIPPED.md](SHIPPED.md); section numbers preserved so cross-references
still resolve.

Sequenced against [GOALS.md](GOALS.md) (the authority: core mechanics →
organization → secrecy → systems literacy → effects → customization).
[UX.md](UX.md) holds component specs; [TESTING.md](TESTING.md) governs
how each step is checked. A broken invariant outranks a new feature.

**What people come here to DO is [CUJS.md](CUJS.md)** — thirteen numbered
journeys, and the only place a CUJ number is assigned. Items below cite them;
none of them mints one.

**How we got here (records, not plans).** Four passes landed between
2026-08-06 and 2026-08-08 and their narratives live in
[SHIPPED.md](SHIPPED.md): **Tier G**, the prepared table for game night
(design in [PROFILES.md](PROFILES.md)); **§3b L0/L1/L3**, the lobby and the
table flow; **Joe's three UI notes** ([UX.md §7.21](UX.md#721-the-named-verb--a-cards-main-act-says-its-name-2026-08-07),
[§7.22](UX.md#722-the-collapsed-pool-rail--pick-three-roll-once-2026-08-07));
and **the library**, a rack becoming thirteen-journey-worth of profiles
([PROFILES.md §11](PROFILES.md#11-the-library--many-profiles-one-in-your-hands-2026-08-08),
[UX.md §7.25](UX.md#725-the-profile-library--the-pick-the-switch-the-copy-2026-08-08)).
What each deliberately left undone is an item below — not a paragraph up
here.

**One judgement call still Joe's**, carried from the library pass: "pools and
settings" was read as name + system + dice set + pools, leaving sound and
chips device-global on js/portable.js's existing reasoning.

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

### 2l. Pool analysis — the die spectrum and the dice-value ledger — **⑤–⑦ open**

(2026-08-05, Joe: *"I want to support analysis of dice pools"*.)

**Full detail: [POOL-ANALYSIS.md](POOL-ANALYSIS.md)** — the reasoning, the
generated data, and the record of what was killed and why. Every figure in it
is reproducible: `node tools/pool-analysis-data.mjs`. Serves
[CUJS.md](CUJS.md) **CUJ6** (building a character whose shelves want dice
summing to a price) and **CUJ8** (reading a pool before you throw it).

**Slices ①–④ SHIPPED 2026-08-06** — the math floor and the honest preview,
the profile seam, the dice-value ledger, the spectrum bars, then the polish
wave (collapsed-mixture default, hover readout, sectioned help, the 'pools'
vocabulary). Detail in [SHIPPED.md](SHIPPED.md) §2l; pinned by
`pool-forecast` and `rack-dice-value`.

**Still to build:** ⑤ the ledger sheet (`placeAnchored` extracted from
`openSetMenuFor`, not ported; session-only target) · ⑥ the sum read · ⑦
verification + docs.

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

### 3b. The lobby and the table flow — **L2 and L4 open**

(Joe: *"the roadmap is not well aligned against core CUJs where the users
use the UI… I think we need a lobby → table flow"*)

**The journeys this serves are [CUJS.md](CUJS.md) CUJ1–CUJ5** — that file
owns them and is the only place a CUJ number is assigned. `Ln` builds
`CUJ(n+1)`.

**L2** (arrival polish) and **L4** (sub-tables, CUJ5) are what remain. The
blocker restated: §0j's per-IP room-creation throttle is owed *before this is
exposed publicly*, because L1 turned room creation into an unauthenticated
write.

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

**L0 · L1 · L3 — SHIPPED.** The lobby and its suppression pass, New table
with a minted key, the invite chair and per-seat chairs, the recents list and
Leave table. Detail in [SHIPPED.md](SHIPPED.md) §3b.

**L2. Arriving (CUJ3) — mostly shipped, needs an audit.** §2k closed
above: the peek shows the table name and prepared seats pre-join. What
is left is judgment, not plumbing — whether the peek should also say how
many people are here (roster count is live presence, cheap, and answers
"did I follow the right link?"), and what arrival looks like for a
visitor with a stored name versus one without.

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
  CUJ10 only for a player who wants their pools on a second device and
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

## Tier C — The CUJ audit closeout (2026-08-08)

*From [CUJS.md](CUJS.md), which is now **the only place a CUJ number is
assigned**. The audit found three overlapping journey-numbering schemes with
no owner and two of them using the same numbers for different journeys —
`CUJ2` named one journey in ROADMAP `L1` and a different one in PROFILES §1,
UX-AUDIT E1 and this file's own **U3**. Ten journeys are now named; two of
them (CUJ8, CUJ10) had never appeared in any list.*

### C1. CUJ8–CUJ11 — the session, named and then walked — medium

The largest journey in the product had no entry anywhere. Everything between
"I joined" and "I left" — composing a roll, throwing it, reading it, keeping
the table legible, deciding who sees what — was absent from Joe's five (which
are entirely about *rooms*) and from PROFILES' two jobs (which are entirely
about *characters*). The measurable cost: **all 30 Tier U findings were found
by reading code**, because there was no journey to walk. An audit that starts
from a journey finds different things than one that starts from a file.

**Decided 2026-08-08 (Joe): four journeys, not one** — CUJ8 *roll this
specific thing*, CUJ9 *keep the table legible all evening*, CUJ10 *control
who sees this roll*, CUJ11 *follow along without rolling*. One journey
covering 60% of the app cannot tell you what is missing, which is the failure
being fixed.

**Change:** a **composed** end-to-end scenario for each, on the
`profile-dm-prepares` model — two players, a whole sequence, assertions about
what a person ends up holding rather than about a widget. Then a pass
re-reading Tier U's open items against them: **U20** (the shelf ships
invisible) is a hole in the middle of CUJ9, and **U26**'s spectator bullet is
CUJ11's first item — both were found by inspection because no journey named
the thing they break.

Folds in **`R8`**, which was a journey filed as a requirement: it is why the
scenario proving the product's headline story is named after a requirement
number. It is CUJ7 now.

### C2. CUJ13 — restore a library from the file it was written to — small-medium

*Gap C.* For a system whose durable copy is a file, **restore from that file
is the one operation it does not offer.** Export works (`portable`,
`file-door`, `profile-file`); the way back is import-as-merge only — no
replace-library, no bulk delete, and a wholesale refusal at the 40-pool cap.
A player who loses their browser cannot get their characters back even
holding the file.

**Change:** an **explicit, separately-named** *"Replace my library from this
file"* — never a sharper Apply. The distinction is the whole safety property:
Apply merges and deletes nothing, which is what makes it safe to press on a
rack you care about, and overloading it would take that away. This is
ROADMAP **U26**'s transport bullet, re-scoped: U26 said *rack*, and since the
profile-library merge the unit is the **library**.

### C3. One composed scenario per journey — **tags SHIPPED, composed scenarios open**

*Gap D.* **A journey with no end-to-end scenario passes in every part and
fails as a whole**, and this is measured rather than argued: `prepared-seat`
was green for weeks while CUJ3/CUJ7 were broken for **every returning
player**, because the fixture seeded no name and so only tested first-timers
(UX-AUDIT E1 → U3). Every part was correct; the journey was not.

**SHIPPED half (2026-08-08):** 109 scenarios carry `cuj1`…`cuj13`, so
`--only cuj7` runs the journey rather than a surface, and TESTING.md records
both the rule and why scenarios *without* a journey tag are deliberate
(cross-cutting quality gates prove no single journey). **Open half:** Add the missing
composed scenarios (CUJ8–CUJ11 via C1; CUJ2, CUJ4, CUJ12 have parts but no
walk).
Add a line to [TESTING.md](TESTING.md): a journey's composed scenario is a
release gate, and a feature that changes a journey updates it in the same
commit — the rule WHAT IS TRUE TODAY already applies to surfaces.

### C4. One owner per numbering namespace — small

*Gap F.* `CUJ2` collided across three documents; `UX.md §7.24` was written
**twice in the same week** by two branches and only caught at merge. Same
root cause, no owner.

**Change:** CUJS.md owns CUJ numbers (done — it says so at the top). Add the
matching line to UX.md §7: the next free section number, stated in the
document that assigns them, so a branch that is out for a week can see what
is taken. Repoint the stale citations: **U3** and **UX-AUDIT E1** say "CUJ2"
meaning what is now CUJ7; **SHIPPED.md** says "CUJs 1–4" in the surviving
sense and is correct as written.

### C5. CUJ5 (sub-tables) is the one journey with nothing at all — see L4

Zero code, zero scenarios. Not a new item — [`L4`](#3b-the-lobby-and-the-table-flow--l0-l1-l3-shipped-2026-08-07)
holds the design — but it is listed here so the zero appears in the same
table as everything else rather than only in a section about lobbies.

### C6. `Clear history` orphans the shelf — SHIPPED

*CUJ9.* `clear-log` is `log = []; renderLog()` (js/main.js:10341-10345) and
nothing else — but `log` is the **backing store for every shelf read**:
`renderShelfMarkers`, `glowTint`, `renderPeek`, the tweak popover. With
`entry === null` a shelved roll's peek reports it as *hidden* when it is
merely unlogged, its header degrades to "collected roll", its total to `?`,
**and the entire fold — the named `✕ Clear` primary and Reveal — is never
built**, leaving only the undocumented body-click. Every marker title
collapses to "Collected roll" and every glow falls back to one gold, so
colour attribution goes uniform. One click makes five shelved rolls
anonymous, unreadable, unrerollable and strips their advertised control.

The same handler skips `updateLogDroppedNote()`, so the flyout shows "No
rolls yet." and "37 earlier rolls rolled off the end" simultaneously.

**SHIPPED 2026-08-08.** The shelf goes with it. Clearing history is
housekeeping on the table's *record*, and the markers are that record's dice
— leaving them behind is not "keeping" them, it is keeping five discs nobody
can read. `logDroppedTotal` resets with the thing it counted, the peek closes,
and the sweep is announced. Pinned by `clear-consequences`, verified to fail
without the fix.

### C7. `Clear table` wipes five people's evening — SHIPPED

*CUJ9.* `handleClear` (server.js:2301-2319) has **no authority check** and
sets `cleared` on every uncleared roll in `room.log` — the felt *plus every
shelved roll from every player*. It broadcasts `{playerId, playerName}` and
the client throws both away (`case 'clear': clearTable(); break;`). It is
bound to an unmodified `c`. There is no `confirm()` anywhere in main.js.

The asymmetry names itself: **deleting one pool from your own rack has an
undo tombstone (U28a); wiping five players' shelves has nothing** — not a
confirmation, not attribution, not a way back.

**① SHIPPED 2026-08-08.** The broadcast always carried `{playerId,
playerName}`; the client now reads it. A neighbour's sweep says who, on the
pill and to a screen reader — and is deliberately *not* narrated back at the
person who pressed it. New `#status-pill.notice` dress: `.refused`'s shape
(a sentence, not a shout) without the lie in the class name.
**② SHIPPED 2026-08-08** (Joe's call: scope split, arm the wide one). One
press clears **yours** — instant, and what almost every press means. When
other people's rolls remain it **arms in place** for the wider sweep, same
two-tap grammar as the rack's delete, disarming after 4 s; skipped entirely
when your rolls were all the rolls, because pressing twice to clear a table
you are alone at is a toll rather than a safeguard. `c` routes through the
button, so the key and the control are one path and the arm is not
mouse-only.

The server takes a `scope` and **gates nothing** — goal 10 means there is no
permission to check, so the arming is a courtesy to the presser, not an
access control. The broadcast now names the cleared rollIds, because a scoped
sweep cannot be re-derived from `clearTable()` — that call removes
everything, which is right for `table` and wrong for `mine`.

Still open, and small: **no "clear the shelf, keep the felt"**. Nobody has
asked for it; noting it so the absence stays deliberate.

### C8. The creation budget exists in code and never reaches a screen — SHIPPED

*CUJ6, the journey's stated done-when.* Shelves print a bare integer
(`shelfDiceValue`) with **no target, no over/under, no colour**. The prices
the journey is measured against — Attributes 9 pools/100 points, Skills
6/100, Motivations 3/30 — are in `js/seed.js` (`SEED_SHELVES`) and are
imported **only by tests**; main.js imports just the dealers. So "priced
against the system's creation budget" is currently served by the player
remembering 100 from a design document.

Partly tracked already as §2l ⑤ (the ledger sheet, "session-only target")
and ruled in POOL-ANALYSIS §9 ("the number `100` appears nowhere in code").
**The ruling and the journey are in tension** and that is the thing to
decide: a budget that cannot be shown cannot be spent deliberately.

**SHIPPED 2026-08-08 (Joe's call: the system profile names its budget).**
`SYSTEMS['soul-deal'].budget` sits beside the chart — the same place every
other fact of that rulebook lives, which is what makes it pluggable rather
than hardcoded (goal 6). Shelf heads read it through one accessor and print
`100/100`; a system naming no budget prints a bare total, which is what D&D
does. §9's ruling is **amended, not overturned**, in POOL-ANALYSIS itself:
what it protected — no Soul Deal rule scattered across render sites — is
intact, and the session-only half (no storage, no wire key, no portable
field) is untouched. Over-budget is the only state with a hue: being part-way
through building a character is not an error, and colouring it would nag at
every step of the thing the figure exists to help.

The budget follows the **profile's** system, like the trio shelves — a
character is priced by the rulebook it was built for, not by whichever table
it is briefly sitting at. §2l ⑤'s *typed* session target is still unbuilt and
is still the right home for "I am building to 80 tonight". Pinned by
`creation-budget`.

### C9. Four small preparation defects — SHIPPED

- **The `dice value` caption never renders while you build your first
  character.** The rack figure builds only under `!foreign && poolsEdit`, and
  the head is hidden unless `.foreign` or `.profiled` — and `.profiled`
  needs *more than one* profile. A player with one profile gets unlabelled
  integers on shelf heads. `rack-dice-value` passes anyway because it reads
  `textContent` through `display:none`. **UX.md and the stylesheet both still
  assert the figure "never reaches a screen"; since `.profiled` landed that
  is only true at a library of one, so two comments are wrong today.**
- **`Apply to table` hands out a stale snapshot.** It reads the textarea,
  which refills only on first open of the pane, on *Fill with my data*, or on
  *Open file*. Edit a character after opening the pane and the room silently
  gets the pre-edit set. `Download`, in the same row, calls `portableSnapshot()`
  live — so two buttons an inch apart disagree about what your data is.
- **`⚄ Random` ignores the name you just typed**, while `＋ New` (which reads
  it) makes an *empty* profile. So the realistic six-character path is Random
  → rename, every time. Related: the picker's `＋ New profile…` creates
  nothing — it opens Settings and force-expands the unrelated YAML pane.
- **`ensureTrio` was promised system-aware and is not.** It forces
  attributes/skills/motivations into every rack in manage mode whatever the
  profile's system — PROFILES §11.6 names exactly this: *"a D&D rack in manage
  mode would stand three empty Soul Deal shelves. It becomes system-aware."*

**SHIPPED 2026-08-08.** All four. Notes worth keeping:

- The head gained a **fourth** reason to stand (`.ledgered`) rather than a
  looser gate. §11's `.profiled` had already narrowed this bug without fixing
  it, leaving it aimed at the player holding one profile — i.e. exactly the
  person building their first character. `rack-dice-value` is re-pointed at
  **computed display**: it passed for weeks reading `textContent` straight
  through `display:none`, which is the failure §7.21 already named.
- The head now hides its region NAME when it stands only for the ledger.
  Otherwise manage mode printed "SAVED POOLS" one line under the section
  bar's "Pools" — §7.23's own rule, broken by the fix for something else.
- `Apply to table` re-snapshots **only when the box still holds exactly what
  we put there**. Always re-snapshotting would silently discard an opened
  file, which is the worse failure by a distance; a hand-edited box goes as
  it reads.
- The trio follows the **profile's** system, not the table's — a D&D profile
  briefly sitting at a Soul Deal table is what the mismatch banner is for, and
  it must not also grow three shelves its own system never had.
- Pinned by `prep-affordances`, verified to fail without the fixes. It also
  surfaced a latent fragility: `panel-anatomy` asserted the head is absent
  while *inheriting* a library from whatever ran before it on that origin.
  Both scenarios now establish their own state.

### C16. Authoring a character crossed the Settings modal — SHIPPED

*CUJ6, raised by Joe 2026-08-09: "I'm not convinced a player preparing a game
for a group has a sufficiently easy process."* Counted honestly, preparing six
characters cost about thirty gestures **and six modal round trips**, because
the two halves of one job sat on opposite sides of one: Settings is
`position: fixed; inset: 0` with a blur — it **covers the rack** — so
"make a profile" and "build its pools" could never be seen together.

The picker's `＋ New profile…` was the sharpest instance: the one row that
promises a new character called `openSettingsAtLibrary()`, which opened the
modal **and force-expanded the YAML box**. It delivered a text editor.

**SHIPPED 2026-08-09.** `＋ New profile…` mints an empty profile under a dealt
name and takes it in hand, like `⚄ Random…` beside it already did. Renaming
moved to the rack: a `✎` beside the name on the region head opens an input
**in place** — Enter commits, Esc abandons. This does not fight PROFILES
§11.5 ③, which refused a rename field inside the *picker menu* because a menu
closes on focus-out; the head is standing furniture and does not close.

Two follow-on corrections, both found by looking:

- The `✎` first rendered as a **floating pencil with no name beside it**,
  because §11.5 ② hides the picker at a library of one. At rest that is still
  right — no new chrome for a player who never makes a second profile — but in
  manage mode it is wrong twice: the head is already standing for its ledger
  (C8), and the menu is the one place a *second* character gets made. So while
  you are deliberately editing a character, the head names it.
- That turned `.profiled` on and brought back **"SAVED…"**, truncated, one
  line under the section bar's "Pools". C9's rule had been aimed at the
  symptom (`:not(.profiled)`); the honest rule is that **your own rack never
  carries a region name at all** — only a foreign rack's head names anything,
  because the section bar names the region (§7.23).

Pinned by `author-in-place`.

### C10. The generic invite link never offers a prepared seat to a returning player — DEFECT, medium — **DESIGN REOPENED**

*CUJ7, steps 2 and 7.* The picker is gated on `name && AS_PARAM`. With a
stored `dice.name.v1` and **no `&as=`**, `initNet` skips both `peekTable` and
`promptName` and joins straight through — no modal, no seats, no offer. The
player lands under their old name holding their old rack. Worse:
`unclaimedSeats()` matches seats against roster names, so if their stored
name happens to equal a prepared seat, **that chair vanishes from everyone's
rail** and the organizer reads it as claimed by someone holding none of its
pools.

U3 fixed exactly this bug class for `&as=` links and stopped there, while
UX §7.19 still says *"one link for everyone stays the primary form"* — which
is the link this breaks. ROADMAP L2 raises the question ("what arrival looks
like for a visitor with a stored name versus one without") and does not
answer it.

**Decided 2026-08-08 (Joe):** offer the picker when the table has **unclaimed
prepared seats** and you have not already settled a seat at this room — so an
ordinary re-open of a plain table still joins straight through, and a reload
after choosing or declining does not re-ask.

**FIRST ATTEMPT REVERTED THE SAME DAY, and the reason is the design.** The
gate was written against the pre-join peek's `seats` list, which made it fire
for *anyone* arriving at a prepared table — including **the organizer at the
table they just prepared**, and three scenarios hung waiting for a join that
never came. The word doing the work in Joe's ruling is **unclaimed**, and the
peek cannot know it: `handleTableInfo` deliberately omits the roster
(server.js:2540 — *"No players, no roster, no log, no offers"*), which is a
privacy decision, not an oversight. `unclaimedSeats()` can only run in-room,
after the join the gate is deciding whether to make.

**So the open question is where "unclaimed" comes from**, and there are three
answers, none free:
1. **Put a count on the peek** — `seatsOpen: n`, a bare integer, no names. The
   cheapest, and it discloses strictly less than the seat names the peek
   already carries.
2. **Offer on name-match instead of on vacancy** — if your stored name equals
   a prepared seat, that seat is *yours*; take it rather than shadow it. This
   also fixes the second half of the defect (a stored name silently claiming a
   chair on everyone's rail) and needs nothing new on the wire.
3. **Offer after joining**, as a dismissible in-room invitation rather than a
   modal at the door — no peek change at all, and it cannot hang a join.

(2) and (3) compose and are probably the answer together; (1) is the one that
touches the privacy surface. **Decide before rebuilding.**

### C11. The seat picker is unusable on the phone it is designed for — CUJ7, small

*CUJ7, step 1 — the link arrives in Discord and is opened on a phone.*
`#name-panel` is `width: 320px` with **no `max-height` and no `overflow`**,
inside a centred flex overlay — centred overflow, where the top clips and
becomes unreachable. `#settings-panel` got exactly this fix with a comment
explaining why, so the pattern is known and the picker was simply not
revisited when it grew to hold six seats plus a profile list (seats cap at
12, profiles render uncapped to 32). Compounding: `promptName` focuses the
input unconditionally *before* the peek resolves, and the viewport meta now
carries `interactive-widget=resizes-content`, so the keyboard halves the
viewport at the exact moment the seats arrive. No `@media` rule touches
`#name-panel`. `.seat-btn` computes to ~31px, under the 34/44 floor U28
established — and U28's own near-miss list does not mention it.

**Why the suite is green through this:** no scenario ever clicks a real
`.seat-btn` — every seat act goes through `__diceDebug`. The picker's
*rendered* surface is unproven by all six CUJ7 scenarios.

### C12. Three smaller arrival gaps — CUJ7, batch, small

- **No way out of the picker.** `#name-modal` is not a rung in the Esc
  ladder (settings, three menus, the popover, the peek and the flyout all
  are) and has no ✕ and no cancel. You cannot look at the table before
  committing to a seat.
- **"Stay as ⟨your name⟩" silently forfeits the prepared character**, one
  line under a hint that says the link offers it. Recovery exists — Settings
  → Your profiles → *At this table* → `Copy` — three levels down, unnamed at
  the door, and `Copy` does not activate, so it takes a second act.
- **`⚄ Random` at the door mints and persists on the tap**, with no undo, to
  the 32 cap; it is the row pre-selected for a first-timer, i.e. the one
  Enter aims at, and the only row in that block that is not a lossless
  pointer move. Same defect as C9's Random, at a worse moment.

### C13. What a shelf marker owes, past U20 — CUJ9, design

*Extends U20 rather than restating it.* The felt is never ambiguous — one
roll at a time, prior rolls auto-collected — so goal 5 is satisfied on the
felt **by eviction**, and every cost of that lands on the shelf. Three
things U20's text does not name:

- **Rank.** Slots are ranks oldest→newest — the single most useful fact for
  "find what happened earlier" — and nothing renders it.
- **Waiting-on-you.** A held roll's Reveal exists *only* in its peek, and the
  marker is the sole door; the marker writes `— hidden` into its
  **`aria-label`**. So a screen-reader user is told which shelved roll awaits
  its reveal and a sighted player is not. That inversion is the sharpest
  evidence the read was decided and half-shipped.
- **The glow is claimed as the substitute and is not.** The roller-tinted
  ring blends 45% toward gold and caps alpha at 0.10 — two players' rings
  differ by ~10/255 on dark felt. The code comment calling it "the joiner's
  at-a-glance attribution, restored at zero chrome cost" is what would stop
  the next person from fixing it.

### C14. Finding and repeating a roll — CUJ9, small-medium

- **The log has no search, filter or anchor.** It is the only path to "ten
  minutes ago": a 300px column of three-line rows, capped at 100 both ends,
  with no input element of any kind. Four hours × five players blows 100. A
  late joiner gets the last 100 with `logDroppedTotal` at 0, so they are told
  nothing about what already fell off.
- **`Clear history` online is a lie** — it clears the local array, never
  calls the server, and the next reconnect's `hello` restores everything.
  The label carries no scope word.
- **The ≣ unread count exists only as a `title`** — U20's exact failure in a
  second place. `aria-label="Roll log"` is static and *overrides* `title` in
  the accname algorithm, so screen readers never get the count either, and
  touch gets nothing. `__diceDebug` exposes the number, so tests can assert a
  signal no user can perceive.
- **Reroll carries state correctly; finding it is the problem.** `r` repeats
  `lastEntry`, which auto-collect replaced 3s ago, so the real path is ≣ →
  hover the row → `⟳`, and `.log-again` is `opacity:0` until hover. Two
  adjacent notes: `canReroll` refuses hidden entries, so the roller cannot
  repeat their own unrevealed held roll; and the server substantiates
  `rerollOfId` on parent existence alone with no same-roller check, so
  rerolling Bob's roll stamps *Bob's* row `rerolled` in everyone's log.

### C15. Restore: the file this app writes cannot be read back — CUJ13, small-medium

*Supersedes C2's sketch with the measured shape.* Export is complete and
whole-library. Restore is three paths and none of them is one: **Apply
import** merges only the file's top-level `pools:` and ignores `players:`
entirely; **Add** and **Add all N** run every name through `uniqueName`, so
a restored "Nessa" lands as "Nessa 2". A fresh browser deals one profile at
boot, so `Add all` on a 32-profile file needs 32 slots against a cap of 32
and lands **31 of your characters, renamed on collision, beside a stranger's
dealt profile, with the wrong one in hand.**

**Design (verified against the tree):** one verb, `Replace my library…`, in
the `#import-profiles` block, using the app's existing two-step in-place
destructive confirm — armed state **names what is destroyed**, not just
counts it, and offers `Download` inline first, since the thing being replaced
may be the only copy. Build the replacement store from `importableProfiles()`
via `emptyStore()` + `addProfile()` with **no `uniqueName`** (the file's names
are already unique by `parsePortable`), persist it and **check the return**
before swapping the live pointer, then `adoptRack()` the profile the file's
`profile:` key names — the pointer every current path silently drops. The cap
problem dissolves: replacing starts from empty, so 32 fit exactly.

Also in this journey, and separate:

- **`parsePortable`'s `warnings` are dead end to end** — produced,
  unit-tested, returned, and read by nothing. PROFILES §3.1 states the
  requirement in so many words: *"the warning must reach the preview status
  line, not vanish."* A file from a newer version silently loses sections and
  reads as a clean `✓`.
- **An empty file reads as success-with-nothing-said** (blank status line),
  while a comments-only file refuses properly. Inconsistent.
- **Boot normalization is lossy and the loss is written back**: profiles past
  32, pools past 40, and duplicate lowercase names are dropped *silently*,
  `STORE_VERSION` is written but never checked, and the normalized result is
  persisted on the first paint before the user touches anything.
- **`LS_GROUPS` is a fossil sold as a recovery path.** The comment calls it
  "the one recovery path if the library is ever cleared"; it is read once at
  boot and never written again. For anyone whose first visit postdates the
  library, the key does not exist.

## Tier U — The converged UX: what is still open (2026-08-08)

*The audit that produced this tier, and the twenty-five entries that shipped
out of it, are in [SHIPPED.md](SHIPPED.md) — including **U17**'s full build
spec, which was ~560 lines of shipped design living inside this file under
`##` headings that sat at the same level as the tiers.*

**What it was.** Five stances (newcomer, GM/table, accessibility, doctrine,
consistency) read the shipped experience at `1b7a8f2` against the source and
sixteen captured frames; touch/tablet errored and was re-run separately.
Every finding was adversarially verified and only survivors were recorded.
Findings live in [UX-AUDIT.md](UX-AUDIT.md); the ones that shipped are in
SHIPPED.md; **what remains is below.**

Seven entries are open. Four are DESIGN FIRST, two are batches, one is the
deferred half of the touch pass. Per [TESTING.md](TESTING.md) each ships with
its e2e scenario, and per [CUJS.md](CUJS.md) each now has a journey to hang
on — **U20** is a hole in the middle of CUJ9 (the shelf ships invisible) and
**U26**'s spectator bullet is CUJ11's first item.

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

### U28b. Two smaller touch findings, deliberately deferred — batch, small

Left alone by U28 with reasons in the stylesheet, and worth a decision rather
than a silent omission:

- **`.rd-cell`'s 86px cannot hold art + name + remover** at the longest
  labels; the grown `.rd-x` overlaps a 34px lane of the name. The stylesheet
  refuses to fix this in cascade — the answer is markup (drop the art on a
  counted row, or move the count out of the name) in `renderRailDice`.
- **The rim is a no-wrap flex row.** At coarse the four tools come to ~240px
  of the expanded panel's 260 — fine on a tablet, but it already overflows
  below a ~320px viewport (pre-existing). `flex-wrap` on `.draft-actions`, or
  a narrower phone dress.
- **Near-misses the size pass did not take**, because a blanket coarse `.btn`
  bump touches ~30 surfaces and bumping `#section-bar` spends U30's rack
  budget directly (it is in the scroll, not the sticky zone): the `.btn.ghost`
  family at 31px, `.corner-btn` at 28 expanded, `.btn.tiny` at 19,
  `#section-bar` cells at 26.

## Structural risks (bets, not bugs — each gets more expensive to reverse)

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
