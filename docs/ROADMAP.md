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

### 9d. The dice tower — **SHIPPED 2026-08-12**; three models by 2026-08-14; dressed 2026-08-11; one follow-up left

The lab became the product. `tower` is a room setting whose value is a
tower id — `none` (default), `heartwood`, `bastion` and `blackanvil` — and a tower roll is baked
as a POUR: scripted entry, hidden transit behind the skin, exit through
the doorway, then the ordinary settle. The contract, the socket, the bake,
the amended camera ruling and the measurements are
[TOWER.md](TOWER.md)'s STATUS section; the player-facing spec is
[UX.md §7.31](UX.md#731-the-tower-and-what-a-poured-roll-looks-like-2026-08-12).
Scenario `tower-roll` (tag `tower`), and the whole pre-existing suite
passes **unchanged**, which is what THE FIRST LAW ("don't change anything
about how the system works without a tower") means in practice.

**DONE 2026-08-13 — a second tower, and the sound palette it forced.**
`bastion` (js/towerbastion.js) is a stone turret, and it cost what the
registry promised: a skin file, a row in TOWERS, one id in the server's
validate list. The shared techniques moved behind `export` in
js/towerskin.js with Heartwood's output byte-for-byte unchanged. The
replay-safety claim is now measured rather than argued: 8 dice, seed 42,
through heartwood and through bastion, every resting position identical
to the last digit — which is only true because a skin adds zero colliders
and the film never reads it. And `clunkVoice` is live: a baffle knock is
voiced by the socketed tower (wood clacks, stone thuds), resolved at
render time, so the bake, the film timings and the replay hashes never
learn which model is standing. Proofs and the three findings the build
turned up are in [TOWER.md](TOWER.md)'s STATUS.

**DONE 2026-08-14 — a third tower, and the registry stopped being a claim.**
`blackanvil` (js/toweranvil.js) is the Emberforge family's forge: a
soot-blackened anvil block with a barred furnace grate glowing over the
casting channel, a fire-brick stack strapped in oxidised bronze with one
ember vent, and a flared crucible lip. Same price as the second — a skin
file, a row, one server id — plus `bakeStone` moving into the shared kit,
witnessed pixel-for-pixel against the pre-move source rather than asserted.
It establishes the house's ONE legal glow: an emissive map baked from the
same seeded canvas pass, dim, inside a recess, no light and no bloom.

What the third model changed about the tooling, which is the part that
compounds: `tower-roll`'s swap / socket / voice / pour block is now a LOOP
over the registry's skinned models instead of a block naming one tower, so
a fourth row is covered the day it is registered; `tower-resting-eye.mjs`
takes a tower id like the other proofs (it hard-coded heartwood);
`tower-family-shots.mjs` takes a LIST of siblings so the lineup is the whole
family. And two claims are pinned that only a third model could motivate —
every skinned row carries a `clunkVoice` and no two are the same, and the
picker's row still LAYS OUT at four chips (the paint assertions would have
stayed green with the chips overflowing).

Recorded, not fixed *(and then fixed — see the dressing pass below)*:
**Bastion's arrow loop does not show its dark slot** — the `shadowStone` sits
0.012 behind a granite facade panel spanning the same x/y, so the granite is
in front and the loop reads as a surround with plain wall inside it. Cosmetic
and pre-existing; Black Anvil cuts its facade into panels around the grate
and the vent to avoid the same shape of mistake.

**DONE 2026-08-11 — the dressing pass, and a fourth discipline.** Joe: "I
like the general shape. The exterior could maybe benefit from more detail…
2–5 cosmetics per tower." The three models were architecture and read as
architecture: nothing on any of them had been put there by a person. Each
now carries two to five props — one bold, the rest quiet — out of a new
shared prop kit, `js/towerdress.js`: cloth with a real fold field, heraldry
under the rule of tincture, heater shields, cressets and sconces, ivy as a
guided walk, moss as a pixel pass, rope, chain, a horseshoe, and six quads of
smoke that are not a particle system. Manifests, budgets and the traps are in
[TOWER.md](TOWER.md) under DRESSING; the player-facing story is
[UX.md §7.31](UX.md#731-the-tower-and-what-a-poured-roll-looks-like-2026-08-12).

Three things it established that outlive it:

- **A warm focal light is the FAMILY TRAIT.** Every skinned row now carries
  `ember`, and `tower-roll` fails a row without one. Black Anvil's grate
  stopped being one tower's feature and became the house's.
- **Weathering belongs in the vertex colours.** Every wall texture here tiles
  at WORLD scale, so a gravity stain painted into a tile repeats wherever the
  tile does and cannot know where the bands are. `gravityStain` runs in world
  space after the AO bake: zero triangles, zero textures, zero draw calls.
- **tower-fit NAMES every overrun or goes red.** Six legal classes against the
  engine volumes that grant them; UNCLASSIFIED fails. It caught a real gap in
  its own taxonomy on the way in, which is the useful kind of red check.

And Bastion's arrow loop is a recess again.

What is left:

- **`tower` in the portable YAML.** `table:` carries name/felt/system/zoom
  (js/portable.js `TABLE_KEYS`), so a prepared table cannot yet arrive
  with its tower already up — the one place the setting is not treated
  like its neighbours.
- ~~**The exit portal's minimum height is too generous**~~ — **RESOLVED
  2026-08-13, same day.** The portal-floors campaign
  (tools/steps/portal-probe.mjs; ~420 pours over film-scan envelopes,
  below-floor candidate specs via `towerProbePortals`, retry knees off
  the exit guarantee) measured the true floors and re-derived
  `TOWER_PORTAL_LIMITS` in all three mirrored places + the skill:
  `clearH 3.6·S→2.7·S` (the old door carried ~58% more height than any
  die used; the binding case is CONGESTION at the doorway, not the lone
  d20 — solo need is 2.85, retries turn up at 3.0), `w 4.0·S→3.2·S`
  (jambs channel, they don't jam), `clearR 1.7·S→1.6·S` (entry is
  scripted; envelope exactly 1.816). Full derivation in docs/TOWER.md
  "THE MINIMUMS". Floors only moved down — classic stays legal, the
  freeze golden untouched. The Hollow Bole re-bake to wear the floor is
  the arc's last step.

Known cost, recorded rather than hidden: a 40-die pour is ~25 s of film
and up to five bake attempts (~3 s synchronous). Forty dice through one
chute is forty staggered entries, forty transits and forty exits that may
not overlap, so the length is honest; the bake cost is the exit
guarantee's price and only the largest pool pays it.

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

### C17. The table offers what the players hold — no push — SHIPPED

*CUJ6/CUJ7, Joe 2026-08-09: "I was imagining a simpler approach where all
profiles are available for use when joining a table… all profiles available
for now, we can refine visibility later."*

The organizer's headline act — **hand these characters out** — was five
gestures behind a YAML textarea: Settings → Your data → `Export / import…` →
`Fill with my data` → `Apply to table`. A developer-shaped door on the most
important verb in the preparation journey.

**SHIPPED 2026-08-09.** A player's whole **library** now rides the publish
their active rack already rode, and a table offers what the people at it are
holding. The organizer builds six characters and sits down; the table offers
six. Nothing is pushed and Settings is never opened.

**Per-player, not folded into `room.setup`.** Setup carries a rev and a
conflict rule because it is ONE shared object — six players publishing into it
would take turns replacing each other's characters. This rides `handlePools`'
shape instead: a field on the player, broadcast when it changes, with the
existing no-op guard extended to cover it. That shape already scales to forty
streams.

**Two sources, one list**, and they do different jobs: `room.setup` is what a
FILE prepared the table with and survives everyone leaving (SETUP_TTL_MS);
live libraries are zero-effort and leave when their owner does. Setup wins a
name collision — it was chosen deliberately for this table, a live library is
whatever somebody happens to be carrying. `tableOffers()` is the one merge,
used by the seat door and the in-room list alike, so a seat the picker offers
is always a seat the door can open.

The ACTIVE profile publishes from `groups` (the live rack) rather than its
stored copy: an edit in progress has not been written back, and offering
yesterday's version of the character you are visibly editing is worse than
offering none.

**Visibility is deliberately wide** — every profile, to anyone with the link.
Joe's call, explicitly for now. The narrowing belongs in one place when it
comes: the `sanitizeProfiles(body.value.library)` call in `handlePools`.

The YAML path is untouched and still does table settings + seats, because a
file is the only thing that crosses a browser or outlives a room. What changed
is that it is no longer the ONLY door.

Pinned by `library-is-the-seats`, verified to fail when the server stops
merging live libraries. `setup-repush` re-pointed from `deepEqual` to
`includes`: asserting the exact seat list there would now be asserting that
nobody is sitting at the table.

### C21. The dice are too small, especially on a phone — SHIPPED

*Joe 2026-08-09: "I want to see the dice more closely, particularly on
mobile… maybe make what is currently the closest setting the widest setting
and make the medium and close setting even closer."*

**SHIPPED — the whole ladder moved one step in.** `wide` is byte-for-byte the
old `close` (18×11) and the two below continue the ladder's own ×0.78 pitch:
`medium` 14×8.6, `close` 11×6.7. **`medium` is the new default**, because
leaving it at `wide` would ship the view a player previously had to go and
choose.

**Why the mat and not the camera.** The mat is the PHYSICS WALLS and must be
identical on every client — a seeded roll replayed against different walls
lands differently — so it cannot vary by device. And `applyCameraFraming`
only ever pulls the camera BACK from the preset until the mat fits, never
closer. A smaller mat is therefore the one lever that makes dice bigger, and
it shrinks the shelf with it (slot pitch derives from `TABLE_W`), which is
what forces the retreat on a narrow screen in the first place.

**Measured** (`__diceDebug.zoomProbe()` — a unit-radius span at the mat's
centre through the live camera, so it accounts for preset, viewport and
framing retreat at once), in CSS px per die:

| | wide | medium | close |
|---|---|---|---|
| desktop 1440, rail | 124 | **160** | 203 |
| desktop 1440, panel open | 107 | **138** | 175 |
| phone 390, rail | 38 | **49** | 62 |

**The mobile gap that remains is structural, and worth naming.** A phone is
portrait (≈278×844 of canvas beside the rail) and the mat is landscape, so
WIDTH binds and the camera retreats hard — `camY` 40 on a phone against 12.9
on a desktop at the same preset. Closing that would mean either a
portrait-shaped mat (a room-wide setting every client shares, so a mixed
phone/desktop table would have to agree) or framing less than the whole mat
(dice can land at any wall, so cropping loses them). Both are real options
and neither is free; not taken here.

One thing the measuring turned up: with the panel OPEN a 390px phone leaves a
**74px** canvas, and the camera retreats to `camY 62`. The boot rule already
collapses the panel under 640px, so a real phone gets the rail — but any
future affordance that opens a region on a phone should know it costs four
fifths of the felt.

`zoom-syncs` re-pointed to read `ZOOM_PRESETS` through a debug accessor
instead of carrying its own copy of the numbers: a scenario that hard-codes
the ladder asserts a decision rather than a behaviour, and fails on a retune
that is working exactly as intended. What it is for — every client agrees,
the walls and shelf pitch follow the setting — is what it checks now.

### C23. Three things a phone showed — SHIPPED

*Joe 2026-08-09, with a screenshot, once mobile was working again.*

- **The dice were still too small.** The whole ladder moved in one more step:
  each level became the next one down (`wide` and `medium` are the previous
  `medium` and `close`, values already looked at) and a genuinely closer
  `close` was added below. Default stays `medium`. Measured die span on a
  phone with the rail: **40 → 49 px**.
- **The result panel ran off the right edge**, with its outcome words cut in
  half. Two separate causes, both about measuring the wrong thing: the card
  was bounded by `100vw` while being centered on the **felt**, which beside
  the panel is ~278px on a phone — so a 320px floor produced a card wider
  than the surface it sits on. And inside it, the ledger's label spine is an
  `auto` column that takes ~90px for a word like STRENGTH, leaving too little
  for `d8 7 Success & Bonus`. Below 560px the spine now stacks above its row,
  and the longest reading wraps rather than truncating — a chip is `nowrap`
  because a split phrase reads worse than a narrow one, but that only holds
  while the alternative is SHORTER, not CUT.
- **The felt's standing vignette is gone.** `radial-gradient(ellipse …)` sizes
  to its box, so the same declaration was a soft corner-darkening on a wide
  desktop felt and a visible oval with an edge on a tall narrow one — two
  pictures, one of them designed. The ceremony's own vignette stays: a
  transient beat with a reason to be seen, not standing furniture.

### C24. The mat cannot keep shrinking — frame the DICE, not the table — DESIGN, medium

**Measured 2026-08-09, after three tightenings and one refused fourth.** Every
zoom step shrinks the physics floor those dice have to land on, and nobody was
measuring what that did. Dice at rest, counted above y=1.2 (i.e. resting on
another die rather than on the felt):

| mat | 6d6 | 12d6 | 20d6 | 40d6 | max height |
| --- | --- | --- | --- | --- | --- |
| 8.6×5.2 *(today's `medium`)* | 1 | 2 | 9/20 | 27/40 | 4.7 |
| 6.7×4.1 *(today's `close`)* | 2 | 5 | 15/20 | 32/40 | 6.3 |
| 5.2×3.2 *(a fourth notch, refused)* | 3 | 10/12 | 17/20 | 32/40 | **9.0** |

A 40-die pool is a heap several dice tall, and a 12-die pool at the proposed
fourth notch had ten of twelve dice off the felt. That breaks goal 5
("organized over realistic" — the system keeps rolls legible) and goal 1
(real dice on a real surface), and the camera is framed for a flat mat, so a
tower reads as a smudge.

**The fourth notch was reverted rather than shipped.** Today's ladder stands.

**Why the mat is the wrong lever, now that it is measured.** It is the
PHYSICS WALLS — identical on every client, because a seeded roll replayed
against different walls lands differently — so it cannot vary by device, and
it must be big enough for the largest pool anyone rolls. Those two facts put a
floor under it that the "make dice bigger" requests keep pushing against.

**The lever that is left is the CAMERA, and it is currently pointed at the
wrong thing.** `applyCameraFraming` frames the MAT: it starts at the preset
eye and pulls BACK until the whole table fits, so a three-die Soul Deal roll
is shown at the same distance as a forty-die one. Framing the **settled
cluster** instead would give a canonical attribute+skill+motivation roll big
dice on a phone *and* leave a 40-die pool room to land flat.

Sketch, in the order the risks appear:
1. Frame the dice AABB (plus the shelf, which must stay reachable) rather
   than `TABLE_W`/`TABLE_D`. `framingPoints()` is already the single place
   that decides what must stay on screen.
2. Ease to it after settle, never during — the roll's own motion is the
   ceremony, and a camera moving under a tumbling die is nausea. §7.7's
   whisk already establishes "one motion at a time".
3. Keep a floor so a single d20 does not fill the screen, and a ceiling so a
   40-die pool does not retreat past today's `wide`.
4. It is per-viewer, not room state: the camera shows no one else anything,
   which is what makes it safe to vary by device where the mat is not.

**Do not take another notch off the mat until this exists.** The measurement
above is what that instruction rests on, and `dice-land-flat` is the pin: it
requires the canonical attribute+skill+motivation roll to land flat at EVERY
level, and a six-die pool to land flat at the default and above. It
deliberately does not require it at `close` — that level is opt-in, its own
tooltip says "biggest dice, best on a phone", and it measurably piles 2 of 6.
Asserting there would either fail on the shipped app or drag the bar down
everywhere; recording it is what stops the next tightening claiming ignorance.

### C30. The wiggle was a predicate — **SHIPPED 2026-08-10**; two threads left

*Joe 2026-08-10: "there is a very slow, very shaky process by which the dice
then slide and wiggle-move until they are stable. It can take quite some time
and it's super awkward to watch."* He asked whether to change the collider
shapes and said that, forced to choose, he would accept dice repelled by
boxes slightly larger than themselves.

**No shape change was needed or possible in that direction.** The colliders
are exact convex hulls off each die's render mesh. The tail was mostly a
still table: a die judged cocked was refused a freeze and sat motionless to
`SETTLE_CAP` = 9 s. 15 of the 17 dice that reached the cap across 36 throws
were not moving. Shipped: `cockedDot` 0.82 → 0.6 and a tail cut that
credits a timed-out die with its last moving frame. Soul Deal −12%, 20d6
−14%, caps 13/16 → 4/16. The felt contact numbers were measured, win far
bigger, and are held back — see C30c. Full account in UX §7.29; pinned by
`settle-tail`; priced by `tools/steps/settle-paired.mjs`.

**What shipped does NOT fix: the shakiness itself.** Joe's word was "shaky",
and the reversing is caused by the absent damping — the shipped subset moves
`shake` by 0% to −4%. The worst throws got much shorter; the dithering is
untouched. That is C30c.

**C30c — the felt tuning is measured, wins big, and is blocked on the spawn.**
Grip 0.6 / bounce 0.15 / damping 0.1/0.14 buys Soul Deal −43%, 20d6 −1.63s,
**and 20–38% less shake — the only thing that touches the dithering at all.**
It is not shipped because it PILES: on this mat sliding apart is how dice
separate, `spawnDie` spreads a throw by `min(TABLE_W - 4.4, count × 2.6)`, and
at `medium` that clamp bites hard (TABLE_W 8.6 → six dice start 0.84 apart
when the spacing wants 2.6). Stop the skid and they stop on each other: at
`close`, 6d6 went 17% → 33% of dice piled, 3 clean throws in 10 → 1.
`dice-land-flat` caught it (3 failures in 13 runs vs 0 in 8 on the parent) —
the C24 floor working. Halving the damping did not halve the piling, so this
is not a knob-tweak. Priced by `tools/steps/pile.mjs` and `settle-paired.mjs`.

**C30c, pass three (2026-08-10) — still not shipped, and the story has
changed.** `tools/steps/settle-matrix.mjs` now judges shake, duration, caps,
piling, creep and the clock together on 16 paired seeds behind a canary that
refuses the run if the rig cannot reproduce a known answer. Four things it
established, none of which were the "wider spawn" the paragraph above
predicted:

- **The shake win is restitution, not damping.** Deadening alone is −23% to
  −37% shake on every multi-die pool; speed-gated damping alone is worth
  ZERO. What the gate buys is the slow half (20d6 −22%, caps 7→2).
- **Deadening's duration cost is glide.** 8d6 on one 10-seed family: shipped
  2.13 s, deaden+gate4 3.71 s, deaden+**grip**+gate4 2.60 s. Grip recovers
  70% of it — restitution was where a die's vertical energy went, and
  removing it leaves the skid on a floor of friction 0.25. **This closes
  C30a**, which had guessed damping.
- **Deadening does not replay.** Throw a seed family, run 700 unrelated
  throws, throw it again: one seed in sixteen becomes a materially different
  throw (2.267 s → 2.600 s, 137 → 157 frames). That is the same disease that
  took the sleep raise off the table, it is independent of the pile work, and
  it disqualifies deaden on its own. `tools/steps/replay-drift.mjs`, with
  `sleepier` kept as the control that must fail. Nothing here is byte-
  identical across a tab's lifetime — even shipped moves rest positions by
  ~5e-6 — so the bar that means anything is whether duration or frame count
  moved.
- **The pile cannot be nudged away.** `NUDGE.pileScale` (shipped inert)
  refuses a freeze to a die resting above its hull's circumradius — the
  highest a convex die touching the felt can hold its centre, so the bar is a
  theorem rather than a fit — and hands it to the existing nudge. It recovers
  part of the medium regression (6d6 flat throws 17/40 → 22/40 against
  shipped's 33/40) and no more: at `close`, across 24 seeds, it takes a die
  off the pile ONCE, at 4.60 s → 8.73 s. On a crowded mat a hurled die comes
  down on another die. Pinned by `pile-refusal`; calibrated by
  `tools/steps/pile-bar.mjs`.

The candidate deaden+gate4+pile-nudge failed 4 of 7 gates (duration +67% on
8d6, piling +5pp at medium/6d6, wall clock 1.68×, creep +45%). **The open
rungs are grip and the throw target, not the settle predicate.**

**A bar worth reusing, and a caution.** `dice-land-flat`'s `y > 1.2` is the
d6 circumradius (1.169) and change — sound for the pools that scenario rolls,
a coincidence for anything else. A solo d20 was measured resting legitimately
at **1.190**. Any future check that calls a die piled by height should use
`restCeiling(type)`, not 1.2.

**C30d — the sim is in slow motion, the drift was cannon's sleep, and the
missing restitution threshold is not the fix (2026-08-10, pass four).**

*Joe: dice must "really magnetize themselves to the surface once they're
landed, no more bounding like they're on the moon."* Pass four took that
literally and measured two mechanisms. One is a theorem and works; one is an
emulation of a real engine feature and fails. The by-product is the answer to
why deaden could never ship.

**The moon is arithmetic.** `GRAVITY` is −110 in a world where a d6 is 1.35
units. A d6 is ~16 mm, so a unit is ~11.9 mm and 9.81 m/s² is ~826 units/s²
here. The world runs at 110 — **7.5× too weak** — and a trajectory's
timescale goes as 1/√g, so everything on this table falls, bounces and
settles **2.7× too slowly**. Joe's word is a correct reading of the number,
not a matter of taste. Corroborated: `NUDGE.lift` 7 buys 2·7/110 = 0.13 s of
hang time, which is a hop and reads as a float.

**And the minimal correct fix is not a physics change.** Newton is invariant
under t → t/k when g → k²g and v → k·v — identical curve, identical rest
pose, k× sooner. `playRoll` already bakes the whole throw into keyframes
before frame one, so the fix is a **projector speed on `stepPlayback`**: same
film, faster. No re-bake, no determinism risk, no pile risk. Shipped inert as
`TEMPO.k` (1 = byte-identical), applied only on a real-time frame — `tick()`
takes a `realtime` flag, `animate()` is its one caller, so `sim(n)` and every
e2e scenario keep stepping the film one baked frame at a time. Three theorem
checks (`tools/steps/tempo-check.mjs`):

- the **bake is untouched** at k=2 — tails (duration, frames, nudges, landing
  frames, sound count) identical 6/6, largest pose delta 5.25e-6 against
  1.10e-5 for a paired k=1 control, i.e. *less* than the tab moves it alone;
- **playback tracks duration/k** — worst deviation 2.0%, mean speedup 1.980×
  (measured in frames of real time under `holdClock`; this tab fires rAF at
  ~50 fps and without the hold every drain read 2–10% short);
- **`npm test` 48/48 with the default left at k=2**, then returned to 1.

The click gate rides the projector too: `max(12, 35/k)` ms, so at k=1 it is
exactly the 35 ms that shipped and at any k the *same set* of impacts
survives — no landing thump can be dropped by construction. Past k = 35/12 ≈
2.9 the 12 ms hard floor bites first, which is above the 2.7 the arithmetic
asks for. **Ceremony beats are not dice**: the declare hold, the settle
phase, reveal flips, the sink, rest cadence, camera easing and FX lifetimes
all stay unscaled.

**The floor magnet fails, and on its own axis.** cannon-es has no restitution
threshold — Bullet and PhysX both zero restitution below an impact speed,
because a slowly-landing die sticks rather than bounces. `MAGNET.vy` is that
missing threshold (a die in floor contact rising slower than `vy` has vy
zeroed), shipped inert. At vy 1/2/4 over 16 paired seeds:

| | vy1 | vy2 | vy4 |
|---|---|---|---|
| shake, soul (16 seeds) | **+38%** | +29% | +27% |
| hops, soul (16 seeds) | **+13%** | +5% | +13% |
| dur, 8d6 (16 seeds) | +13% | **+47%** | +15% |
| creep, 1d20 (16 seeds) | +9% | +46% | +28% |
| pile, close/6d6 (**10 seeds**) | +0pp | +5pp | +5pp |
| replay, soul (16 seeds) | 15/16, **tail moved** | 15/16, **tail moved** | — |

*The pile row is a TEN-seed measurement and the rest are sixteen; the table
printed them side by side unlabelled, which reads as one run and is not.
`settle-matrix.mjs` takes the two counts as separate arguments, so any row
quoted from it has to carry the one it was measured at. At 40 seeds a ±2pp
pile difference is 5 dice out of 240; at 10 it is 1 or 2, which is noise.*

Every gate fails except the clock. The reason is that **zeroing vy does not
glue a die down**: the contact solver re-supplies the push on the very next
step, so the clamp trades one smooth ballistic arc for per-step chatter. In
this solver what the eye reads at rest is *contact chatter, not bounce*. It
also **adds** replay drift (seed 32676 comes back a 435-frame throw instead
of 450) where shipped's movers are pose-only at 5e-6 — the prediction that
quantising to zero would absorb float divergence is falsified. And
`settle-tail` names the damage in one line: *"2 dice stopped and were refused
a freeze"* — the clamp pins a cocked die before it can rock flat, recreating
the exact bug C30 shipped a fix for. `dice-land-flat` is 10/10 with it armed,
so the C24 floor survives; nothing else does.

**A new instrument: `hops`.** The count of separate times a die goes back UP
in its last 0.6 s, read off the baked keyframes in `restMotion` — the
complaint stated literally, where `shake` cannot tell a hop from a horizontal
jitter. Validated with a positive control: deaden moves it −17% to −38%, in
step with its shake win. So the magnet's flat reading is the mechanism
failing, not the meter.

**THE DRIFT IS CANNON'S SLEEP.** The pass-four result that matters. Deaden's
disqualification was that it does not replay. `tools/steps/replay-drift.mjs`,
16 seeds, 700 throws of churn:

| variant | replays | note |
|---|---|---|
| shipped | 14/16 | movers pose-only, 5.10e-6 / 5.25e-6 |
| deaden | 15/16 | mover 2.267 s/137 fr → 2.600 s/157 fr |
| **sleepoff** | **16/16** | byte-identical — *better than shipped* |
| **deaden+sleepoff** | **16/16** | byte-identical |
| deaden+sleepoff+gate4 | 16/16 | |
| sleepoff+gate4 | 16/16 | |

`sleepoff` beating shipped **overturns a documented belief**: the ~5e-6 pose
noise was blamed on the SAP broadphase's axis list having seen a different
history (`pile-refusal`'s comment says exactly that). It is the sleep
decision. The app already has its own retirement predicate — `stillTime >=
SETTLE_STILL`, then `freezeInPlace` — and cannon's sleep is a *second*,
independent one running underneath it, the one that cannot be reproduced from
a seed.

**Which reopens deaden.** What sleep-off costs is the slow half (soul +31%,
caps 7→11), and that is exactly what the damping gate was measured to buy
back. `deaden+sleepoff+gate4`: **shake −21% to −34%, hops −19% to −40%** (the
best numbers measured anywhere on this table), **replay 16/16**. It still
fails on duration (8d6 +57%) and piling (medium/6d6 +8pp, flat throws 16/40
against shipped's 33/40), plus clock 1.64× and creep +45%. **Deaden's three
objections became four gates failing, not two.** This paragraph originally
said "down to two — glide and pile", counting only the two it had a story
for, in the same breath as naming the clock and the creep. Four of six gates
fail; glide and pile are the two nobody has an answer to, which is a
different sentence and the one that was meant.
`sleepoff+gate4` on its own is nearly free (dur −1%, caps 5/7, clock 1.01×,
pile +1pp) and replays 16/16, which makes it a *determinism* candidate with
no shake claim attached.

**Open rungs, in order.** (1) The tempo, which is done and waiting on an eye.
(2) `sleepoff+gate4` as a determinism fix on its own merits. (3) Deaden's
glide — grip was measured to recover 70% of it (C30c) and has never been run
with sleep off. (4) Deaden's pile, still unsolved; the nudge is the wrong
instrument (C30c) and the spawn geometry is the untried one.

**C30e — the terminator was the bug, and sleepoff's price was the terminator
leaning on the thing it removed (2026-08-10, pass five).**

The freeze predicate is `velocity² < 0.05` held for 0.45 s — speed under
0.224 units/s, roughly **nine times stricter than any shipping engine's rest
test**, and structurally the wrong shape. An oscillation has velocity at every
instant however small the excursion, so a dithering die cannot pass a velocity
bar however long it waits. What actually retires one today is **cannon's own
sleep**, which hard-zeroes both velocities underneath us — and cannon's sleep
flaps (a body re-enters AWAKE the instant combined speed crosses
`sleepSpeedLimit` once inside `sleepTimeLimit`, resetting its own timer). So
the app's retirement predicate has been leaning on the one mechanism that
cannot be reproduced from a seed.

`SETTLEGATE.mode = 'displacement'` is the standard answer — Eric Lengyel's
jitter-tolerant sleep condition (*Game Engine Gems 2* ch. 23), as shipped in
Jolt and in Rapier 0.35. Three points per die (centre of mass plus probes on
the local +X and +Y at the half-width, because **one point cannot see
rotation**), each growing an AABB; any box reaching `eps` restarts all three
and restarts the clock; all three inside `eps` for `SETTLE_STILL` means at
rest. `eps` is a fraction of the die's WIDTH, so a d4 and a d20 are judged by
the same visual bar. Shipped inert (`velocity` = byte-identical).

**The eps sweep**, 16 paired seeds behind a passing canary:

| | soul dur | 8d6 dur | 20d6 dur | caps (of 80) |
|---|---|---|---|---|
| shipped | 2.26 | 2.42 | 6.58 | 7, of which 6 on 20d6 |
| eps 0.01 | −23% | −15% | +2% | **5**, of which 5 on 20d6 |
| **eps 0.02** | **−37%** | **−23%** | **−47%** | **0** |
| eps 0.05 | −45% | −38% | −71% | 0, but pile +3pp |

0.01 of a die-width is *under this solver's own contact chatter*, so the box
never holds and the cap fires anyway. 0.05 wins biggest and starts piling.
**0.02 is the pick.**

**And the headline.** `sleepoff` alone reproduces its known price exactly —
soul +31%, caps 7 → 11 — and pairing it with the box test **inverts** that:
soul −35%, 8d6 −28%, 20d6 −43%, caps 0. The +31% was never sleep-off's cost.
It was the freeze gate's dependence on the sleep it was removing, which is
what pass five was written to test. `gate4` on top is **not** wanted: it
pushes close/6d6 to +5pp with the flat count 3/10 → 2/10.

**What it costs, honestly.** Two gates do not pass and neither is dismissible
by assertion:

- **Creep +114% on 20d6** — and the meter's anchor moved. `creep` reads the
  0.6 s BEFORE each die's settle frame, so retiring a die sooner drags the
  window back into the tumble. Asked *forward* instead of backward, the same
  throws move their worst die **0.0200 of a die-width** over the window that
  earned its freeze, with **zero** clean freezes over the bar; shipped's worst
  is 0.0279 with three, and `sleepoff`'s 0.0319 with four. The end-of-film
  discontinuity gets **smaller**. `endDisp` is not a self-report: `settleProbe`
  re-derives it from the baked keyframes and the two agree to 6.6e-16.
- **Pile +2.5pp at close/6d6 over 40 seeds** — 55 dice of 240 against
  shipped's 49, with the flat-throw count level at 6/40; and medium/6d6 8 →
  13 of 240 with flat 33/40 → 28/40. Real, and about a third of deaden's
  (+8pp, flat 33/40 → 16/40). The mechanism is plausible: a die that freezes
  earlier turns STATIC earlier, so a neighbour landing on it can no longer
  shove it aside. `NUDGE.pileScale` exists for exactly this and has never been
  run against a terminator this cheap.

**A one-frame bug found on the way.** `SETTLE_STILL` is 0.45 s and every
comment in `js/main.js` called that "exactly 27 frames". Twenty-seven
additions of 1/60 sum to 0.44999999999999996, which is under the bar — the
window is **28 frames**. Harmless to the sim (the loop is self-consistent) and
not harmless to anything re-deriving it: `settleProbe` disagreed with the
mechanism by 11% of `eps` until it was fixed.

### C31. The same values, a different film — master does not replay 20d6

**A live production bug, measured 2026-08-10.** Every client fast-forwards a
roll from its seed and must agree; `perf-determinism` compares two FRESHLY
LOADED tabs, so it cannot see a divergence that only appears once a tab has
been open a while. `tools/steps/replay-drift.mjs` can: throw a seed family,
churn 900 unrelated throws, throw it again.

On **shipped master**, 20d6, 8 seeds, **4 of 8 come back a materially
different throw**:

| seed | before | after |
|---|---|---|
| 1000 | 4.683 s / 282 fr | 5.333 s / 321 fr |
| 8919 | 5.5 s / 331 fr | **8.55 s / 514 fr** |
| 16838 | 3.217 s / 194 fr | 3.0 s / 181 fr |
| 24757 | 9.0 s / 541 fr | 7.067 s / 425 fr |

Two players an hour apart see the same declared values over a visibly
different throw — one of them watching three extra seconds of it. The cause is
cannon's sleep (C30d), and the cure is `allowSleep = false`, which needs a
terminator that does not depend on sleep to be affordable — C30e. With
`dispgate + sleepoff` the same families replay byte-for-byte.

**RESOLVED — SHIPPED 2026-08-11.** `SETTLEGATE 'displacement'` +
`BODYFLAGS.allowSleep false` are the defaults (with the tempo curve and
`NUDGE.pileScale 1.05`, Joe's A/B picks). Cleared by an adversarial pre-flip
audit that re-ran every pivotal number; the audit's three conditions (scenario
pins re-anchored to the shipped defaults, the matrix's creep gate replaced
with a forward bound on terminator rows, and the C33 ledger entry below) ship
in the flip commit.

**AND THE INSTRUMENT CAN REPORT A FALSE NEGATIVE, which is the part to
remember.** The pool-generalized runner throws soul, then 20d6, then 8d6, then
churns, then repeats — and in that shape shipped's 20d6 came back **8/8
identical**. Run 20d6 on its own and it is 4/8. The drift is a knife edge, and
how much unrelated history precedes a family decides which side it lands on.
**A passing drift run is weak evidence; a failing one is strong.** Judge a
candidate one pool per invocation.

### C32. If we ever replace cannon-es — the reserve position

**Not a plan, a bookmark.** Recorded 2026-08-10 so the next person who hits
cannon-es's limits does not re-do the survey. Two of this pass's dead ends —
the missing restitution threshold (C30d) and a sleep decision that cannot be
reproduced from a seed (C30e/C31) — are *engine* limitations, not tuning
problems, and both are solved upstream elsewhere.

**Sourced from a research sweep, NOT verified in this repo.** Nothing below
was built, benchmarked or vendored here. Treat every claim as needing
confirmation before a line of code moves.

- **Jolt** is the only candidate that is single-file vendorable, ships a
  tunable restitution velocity threshold (`mMinVelocityForRestitution` — the
  exact mechanism `MAGNET.vy` was emulating by hand and failing at), and has
  CI-verified cross-platform WASM determinism. Two blockers: the published npm
  package is **not** built with the determinism flag, so we would have to
  vendor our own emscripten build; and **JoltPhysics#2092**, a NaN-at-sleep
  bug, should close first. Wait for it.
- **Rapier** is rejected. Per-pair contact materials and per-body sleep
  thresholds are absent from the JS bindings — both are things this table
  tunes today (`cmFloor`/`cmDice`/`cmWall`, `SLEEP`) — and issue **#797**, a
  `setRotation` determinism problem, is open.

The zero-dependency rule (no npm installs, no build step) is what makes "a
single file we can vendor" a hard requirement rather than a preference, and it
is also why an emscripten build of our own is a real cost and not a footnote.

### C33. 20d6 at `medium` piles slightly more under the flip — the ledger entry

**Measured by the pre-flip audit, 2026-08-11, and shipped with eyes open.**
Paired 8 seeds, 20d6 at `medium` (8.6 × 5.2), dice above `restCeiling`:
shipped **80/160** → flip set **86–87/160** (+6, 4 of 8 seeds worse by one or
two dice; `pileScale` does NOT buy this pool back the way it buys 6d6 —
nudged dice land back on a mat that is already past capacity). The
counterweight on the same seeds: shipped ran **26 dice across 5/8 seeds to
the 9 s cap** (mean throw 8.37 s, ceremony beats declined on every capped
roll) versus the flip's **0 caps, mean 4.14 s**. Twenty dice on this mat is
past its flat capacity in BOTH worlds — the old build just spent nine seconds
grinding before freezing the same tower. The honest statement is "+6 piled
dice in 160, minus 26 cap-outs and 4 s of dead time"; the earlier claim
"candidate ≤ shipped everywhere probed" was false and is corrected here. If
20d6-at-medium flatness ever matters, the lever is spawn/landing geometry
(aimed slots, C30c's spread notes) — not the terminator, and not more nudge
budget (raising it to 8 changes nothing; there is nowhere flat to send them).

**C30b — 20d6 can still reach the cap with dice genuinely tumbling** (3 of 16
seeds). That is real motion, so shortening `SETTLE_CAP` would truncate it and
show dice snapping. Left alone deliberately. If big pools matter later, the
fix is a gentler nudge or a smaller spawn spread, not a smaller cap.

**What this cost to find, and the reusable part.** The first sweep was
unpaired and concluded the materials barely mattered — variance, on the
largest single win. `__diceDebug.throwSeeded(types, seed)` replays a fixed
tumble, so any future physics claim can be paired; do not price one without
it. Same rule as C25's: `settleProfile()` also reports what the *old* rule
would have played, so before/after comes off one simulation.

### C25. The physical shelf does not fit the mat any more — **STAGE 1 SHIPPED 2026-08-09**; Stage 2 open

*Joe 2026-08-09: "Collected dice take up too much space… consider dropping the
collection phase altogether… The space is a problem. It wouldn't be so bad if
not for mobile."* Then: **"dig into C25 hard. Either find space or drop the
feature entirely."** This is what the digging found.

**It is not cramped. It is broken.** `SHELF_PITCH` is
`(TABLE_W - SHELF_SLOT_W) / (SHELF_SLOTS - 1)`, so it shrinks with the mat —
and the zoom ladder took `TABLE_W` from 30 to 8.6 over three tightenings on
2026-08-09 while `SHELF_SLOT_W` stayed at the 5.4 it was given for a 30-unit
mat. Measured with `__diceDebug.shelfFit` (`tools/steps/shelf-fit.mjs`):

| zoom | mat | pitch | one 3d6 cluster | overlapping neighbours | band as share of mat depth |
| --- | --- | --- | --- | --- | --- |
| wide | 11 × 6.7 | 1.40 | 3.26 wide | **all four** | 54% |
| medium *(default)* | 8.6 × 5.2 | 0.80 | 3.26 wide | **all four** | 69% |
| close | 6.7 × 4.1 | 0.32 | 3.26 wide | **all four** | 88% |

**The second collected roll already fuses with the first** — overlap −2.46
units, 75% of a cluster's own width (`tools/steps/shelf-depth.mjs`). Five of
them at `close` render as a single slab of interpenetrating dice with
z-fighting across the whole table. No roll on that shelf is readable, and no
test caught it: the nine `shelf`-tagged scenarios assert `shelf.length`, seq
ordering and slot compaction — **never that two clusters do not occupy the
same space.** It broke at `fe24840` (mat 30 → 14), the first tightening.

**The camera was the wrong suspect.** The thesis going in was that the shelf's
real cost is `framingPoints` — six of its eight points are the shelf's, so the
whole view retreats to keep trays and marker pills on screen. Priced with
`__diceDebug.framingCost`: taking the shelf out of the framing buys
**1.08–1.18×** die size on desktop, laptop and iPad, and **1.00× on a
phone** — nothing at all on the device Joe named. The marker pills' 90px
headroom never binds anywhere. Recorded so nobody re-runs this experiment.

**There is no space to find.** Every lever, priced:

- **Fewer slots.** Two 3d6 clusters need 6.5 units and overlap at every zoom;
  even at `wide` the pitch is 1.40 against a 3.26-wide cluster. The only
  non-overlapping shelf today holds **one** roll. Capacity 5 → 1 is not
  finding space.
- **Narrower clusters** (one die abreast): 5 × 1.8 = 9.0 > 8.6, so it *still*
  does not fit at the default — and it forces three-storey towers, which C24
  already refused ("a tower reads as a smudge").
- **Smaller shelved dice.** They would stop being the objects the player just
  rolled, which is the only thing a physical shelf buys over a panel; and
  their static bodies still have to be somewhere.
- **A bigger mat.** Forbidden by C24 — the mat is the physics walls, identical
  on every client, and growing it undoes the three tightenings Joe asked for.

The felt is under five dice wide. A shelf of five rolls cannot live on it, and
the mat and the shelf have been competing for one scarce resource that C24
already awarded to the dice.

**DECISION: the collection phase stays; its 3D rendering goes.** The feature
survives almost free, because *collected is already a list, not a place*:

- `entry.collected` is an integer sequence on a log entry and `shelfEntries()`
  returns them ordered. **Zero wire change** — the server never knew about
  slots.
- `renderPeek` already rebuilds its whole card from
  `log.find((e) => e.rollId === peekRollId)`. The cluster is used for exactly
  two things: does this roll still exist, and where to put the card.
- Deleting the felt shelf deletes `clusterPoses`, `placeCluster`,
  `spawnShelvedDie`, `canonicalDiePose`, `shroudPoseValue`, the whisk, the
  glow-ring compositing, six of eight framing points, and the invariant that
  no shelved die may stand on the active felt — ~220 lines and a constraint.
- Collect and clear converge on one motion: the dice leave by `lift` (§7.26,
  shipped the same day) and the only difference is whether the entry stays in
  the record.

**STAGE 1 — SHIPPED 2026-08-09.** Collecting a roll takes its dice off the
felt (§7.26's lift) and the existing roll log is the record; a collected
roll's ROW is the door to the peek card its felt marker used to open, with the
same content, the same folded-card grammar, the same right-click and long-press
to the tweak popover. Detail in [UX.md](UX.md) §7.27. Deleted:
`canonicalDiePose`, `clusterPoses`, `spawnShelvedDie`, `placeCluster`,
`reflowShelf`, the whisk, the marker pills, the under-glow rings, six of eight
`framingPoints`, `revealShelvedRoll`, and the invariant that no shelved die may
stand on the active felt. Zero wire change, as predicted.

**STAGE 2 — OPEN, and it is the creative half.** Joe's sketch, unchanged:
*"previous N rolls as panels across the bottom… maybe we just show the roll log
briefly and then show it collapse into a UI element that expands the roll log…
we'd need UI that goes beyond basic buttons and has some elements that visually
fit together. We'd need to get creative."* Stage 1 deliberately left one thing
worse and it is the thing Stage 2 fixes: **with the log closed, a collected
roll has no ambient presence at all.** The ≣ button carries an unread count in
its `title` and nothing else. (The bar is lower than it sounds — the marker it
replaced drew *nothing* at rest either, and U20 has been open about that since
2026-08-08 — but a row inside a closed panel is a step further away.)

What Stage 2 should take as settled by Stage 1: the store exists and is
already correct, so this is a VIEW; the card is reusable verbatim; and
anchoring it to a DOM row rather than a projected 3D point is what made the
whole thing cheap. C13 ("what a shelf marker owes") and U20 ("the shelf's read
at rest") are about this same surface and should be folded in rather than
solved twice. U23's token layer is the vocabulary for "elements that visually
fit together" and this is its first real customer.

**What must not regress:** the tidy-away (a finished roll leaves the middle of
the table on its own) is load-bearing and nobody has complained about it;
§7.7's collect/clear state machine and its `rollStates` rows are wire, not
rendering; CUJ9's find-and-repeat (C14) currently walks the shelf and must
walk the record instead; C13 and U20 are about this same surface and should be
folded into Stage 2 rather than solved twice.

### C26. `Change seat…` — WITHHELD 2026-08-09, owes a design before it returns

*Joe 2026-08-09: "'Change seat…' is maybe not fully thought through. Strongly
consider hiding it for now."* Done — `openIdentityMenu` now hides it
unconditionally (it was already hidden in the lobby), and `touch-doors` pins
the hide at a table as well as in it. The button, its handler and
`leaveTable()` all stay: the function is still the only scripted door to a
`netOnline === false` state mid-scenario, and un-hiding is one boolean.

**Why it was not thought through, stated plainly so the redesign has a
target.** The verb reads as "sit somewhere else at this table", and what it
does is drop the seat, **delete `LS_NAME`**, and re-enter `initNet()`. The
name deletion is the part no one would predict from the label — §3b/L3 split
it out of `Leave & switch seat` precisely so that "the seat belongs to the
table; the NAME is yours and comes with you"… and then left the name-wiping
verb wearing the seat-shaped label. UX-AUDIT **E1** leaned on this item as
the *recovery path* for a returning player whose `&as=` invite did nothing;
**C10 has since shipped**, so the door itself offers a returning player their
prepared seat, and `Leave table` → the door is now the same journey without
the name loss. That is what makes hiding it safe rather than merely quiet.

**What it owes before it comes back:** a decision about what "change seat"
means when seats are *prepared characters* (PROFILES) rather than places at a
table — swapping which prepared seat you occupy is a real and useful gesture,
and it is not "drop everything and rejoin". If that is the verb, it belongs
next to the profile picker, not under a menu item that also deletes your name.

### C27. The framing target was never the dice — **mostly answered 2026-08-09/10**; one case left

**The spine of this entry, and the thing to read first: `framingPoints`
returns four corners at `y = 0`.**

```js
new THREE.Vector3(±TABLE_W / 2, 0, ±TABLE_D / 2)
```

It is a **floor-plane frame in a world with height**. Not a missing case — a
target that was never capable of the guarantee people read into it. "The mat
is on screen" was only ever a *proxy* for "the dice are on screen", and C24
already measured where the proxy breaks:

| mat | 40d6 resting on another die | max height |
| --- | --- | --- |
| 8.6×5.2 *(today's `medium`)* | 27 of 40 | 4.7 |
| 6.7×4.1 *(today's `close`)* | 32 of 40 | 6.3 |

A die at y=4.7 near a corner projects well outside the y=0 corner beneath it.
So `mat fits` and `the dice fit` diverge **exactly where the stacking is
worst** — big pools on a tight mat — which is exactly where being unable to
see a die matters most. Confirmed in the wild: desktop 1440 at 40d6 had the
deciding die off screen while the mat reported `fits`. Two measurements taken
weeks apart for unrelated reasons turn out to be one finding from opposite
ends.

**THE RULE, since this is its third shape tonight — *nothing fails loudly when
a stand-in stops standing in.*** `SHELF_SLOT_W` was a constant that stopped
tracking `TABLE_W` (C25). The spawn-spread comment was a rationale that
stopped tracking the mat (C28 ①). This is a framing TARGET that stopped
tracking the thing it stood for. None of the three threw an error, failed a
test, or looked wrong in code review. `b35b411` carries the same statement in
the code.

**The landscape measurement, which is still exactly true** and is what every
desktop and every small pool uses. `__diceDebug.matFit()`,
`tools/steps/mat-fits.mjs`; |NDC| > 1 is off screen:

| viewport | felt px | zoom | worst \|ndc.x\| | worst \|ndc.y\| | verdict |
| --- | --- | --- | --- | --- | --- |
| desktop 1600 | 1284×1000 | medium | 0.972 | 0.630 | fits |
| iPad portrait 834 | 722×1112 | medium | 0.972 | 0.361 | fits |
| **phone 390** | 278×844 | wide / medium / close | **1.279 / 1.284 / 1.292** | 0.24–0.27 | **off screen** |
| **phone 360** | 248×780 | wide / medium / close | **1.325 / 1.330 / 1.339** | 0.24–0.27 | **off screen** |

`fitCameraTo` scans a bounded range (~3.67×) and its own comment permits the
exit — *"the eye stays where the last step left it rather than retreating
without end"* — so on a phone the scan is exhausted and the loop falls out
having satisfied nothing. `atScanLimit: true` on all six phone rows.

Three things that read wrong before this was measured, kept because each was
believed by someone:

1. **C21/C23's three tightenings could never have fixed it.** The overflow
   ratio is nearly *constant* across wide/medium/close (1.279 → 1.292):
   shrinking the mat moves the camera proportionally closer and preserves it.
2. **It explains C25's phone number** (removing six of eight framing points
   bought 1.00×) and makes that conclusion stronger than its stated reason.
   Not "the felt's corners bind first" — the fit had already failed, and no
   subset can move a camera parked at its scan limit.
3. **C24 is righter than its own argument**, which reasoned from dice piling
   up rather than from a framing that is unsatisfiable.

**WHAT SHIPPED (`d064c04`…`b35b411`, the immersion wave).** Two answers, both
per-viewer — the camera shows no one else anything, which is what makes it
safe to vary by device where the MAT never can be:

- **Rung 1 of the framing ladder descends when the deciding die is off
  screen**, measured per roll from live positions. This is what makes "never
  crops the die that decided it" unconditional — it does not depend on the
  orbit engaging. 20 consecutive lone d20s on a 390px phone: **0 misses**.
- **A quarter-turn orbit in portrait**, engaged only when landscape cannot
  contain the mat, portrait can, and landscape is dropping dice. At 20d6 and
  40d6 on a 390px phone every die is now on screen (**20/20 and 40/40**, was
  19/20 and 32/40).
- **Containing the mat was priced and declined**: it costs ~24% of die size
  (80px → 61px at the default on a 390px phone), a direct reversal of C21.
  Cropping on purpose, with the deciding die guaranteed, is the shipped
  answer instead.

**WHAT IS LEFT, and it is the common case.** The orbit engages at 20d6+; the
ladder declines to crop when nothing is being lost. So **the canonical Soul
Deal roll — attribute + skill + motivation, three dice — gained nothing**: mat
does not fit, mode is dice-cropped, ~75px per die on a 390px phone. A lone d20
gets 219px and forty dice get all forty on screen; the roll in between gets
neither. That is the next thing worth measuring on the phone, and it is the
roll this app is most often asked to show.

### C29. The static handler serves the repo, not the app — SMALL

**Noticed 2026-08-10 while verifying a deploy** by diffing every served asset
against its commit: `curl https://<service>/server.js` returns the server's
own source, 200. So does `/package.json`, and so does every `.mjs` under
`tests/` and `tools/` — 530 KB of `scenarios.mjs` included.

**The important half is already handled, deliberately.** `safeResolve` blocks
traversal and every dotfile — *"no traversal, no dotfiles (keeps .git/.claude
private)"* — so `.git/config`, `.git/HEAD` and `.deploy.config` all return
403, and `Makefile` and `docs/*.md` 404 because their extensions are not in
`MIME`. **No credential or config exposure.** Verified path by path.

What is exposed is SOURCE: anything with a `MIME`-listed extension, anywhere
in the tree that is not a dotfile. The rule is "the extension is servable",
where it wants to be "the file is part of the app".

**Why it is small rather than nothing.** Goal 10 already says there is no
access control and never will be — the room key is the door — so the threat
model does not change. But it hands a reader the server's exact validation
logic, room and player caps, and refusal paths with no effort, and it puts
half a megabyte of test source inside a 1 GiB/month egress allowance for no
reason. Neither is urgent; both are avoidable.

**The fix is an allowlist of roots, not a denylist of names** — serve
`index.html`, `js/`, `css/`, `vendor/`, and whatever assets exist, and 404
everything else. A denylist would have to grow every time a directory is
added, which is the same shape as the constants in C28. Check before
changing: nothing in `js/` or `index.html` fetches `package.json`, so
narrowing costs nothing today (grepped).

### C28. Two more things the zoom ladder left behind — SMALL, both verified

**C25 was not a one-off.** `TABLE_W` moved from 30 to 8.6 on 2026-08-09 and
`SHELF_SLOT_W` stayed at the 5.4 it was sized for, which is what made five
collected rolls one interpenetrating slab. Two more constants were sized
against the old mat and did not follow. Both found by reading
[IMMERSION.md](IMMERSION.md) §21's build notes, both confirmed here against
shipped code.

**① `spawnDie`'s spread clamp is binding at every preset** (js/main.js, the
`spread` line). It reads `Math.min(TABLE_W - 4.4, count * 2.6)` and its own
comment reasons from a mat that no longer exists: *"the clamp is tighter than
TABLE_W so the outer dice never spawn inside a wall at the CLOSE preset
(TABLE_W=18: TABLE_W-4.4=13.6, still ample)."*

| preset | TABLE_W | cap | clamp binds from | 12 dice share |
| --- | --- | --- | --- | --- |
| wide | 11 | 6.6 | 3 dice | 6.6 units — 3.7 die widths |
| medium *(default)* | 8.6 | 4.2 | **2 dice** | 4.2 units — 2.3 die widths |
| close | 6.7 | **2.3** | **1 die** | 2.3 units — **1.3 die widths** |

A die is ~1.8 units across, and the intended spread is `count * 2.6` — one
comfortable die-and-a-half per die. The clamp now overrides that from the
*second* die at the default. Sides 2 and 3 halve it again (`offset * 0.5`).

**This is upstream of the contact-recorder starvation** fixed the same night
in `5a5a8ce`: *"20 dice interpenetrate on frame zero and dispatch 280 contacts
in that ONE step."* The per-step cap treats the storm; the collapsed spread is
why the storm is that violent. Widening the spread should reduce the frame-zero
contact count directly, and `contactStats()` is already the instrument for
measuring whether it does. Not negative in landscape (that needs
`TABLE_W < 4.4`), so no die spawns inside a wall today — §21's "negative"
case is the portrait `close` it was proposing, 4.1 wide.

**② The ceremony path never flushes a deferred zoom.** `stepPlayback`'s
ordinary completion ends `else tryFlushZoom()`; the ceremony branch returns at
`ceremonyEnterSettle` and `ceremonyFinish` ends at
`if (rollQueue.length) playRoll(rollQueue.shift())` with no `else`. So a
room-wide zoom arriving during a ceremony roll, with nothing queued behind it,
does not land when that ceremony ends. It waits for the next collect
(`shelveRoll` calls it), the next non-ceremony completion, or a hello.

**Why this one matters more than it looks:** the mat is the physics walls and
is room-wide *precisely* so every client replays a seeded roll against the
same geometry. A client sitting on the old preset while the room moved is the
divergence the deferral exists to prevent, and the ceremony path is the one
that skips it. Since C25 a collect fires on the next roll's arrival, so in
practice it self-heals quickly — which is exactly why it has gone unnoticed.
One line, and a scenario that rolls a ceremony roll, zooms mid-beat, and
asserts `wallPositions()` matches the new preset with an empty queue.

**The pattern worth naming:** a constant derived from `TABLE_W` follows the
ladder; a constant sized *against* it in a comment does not. That is one of
three shapes of the same rule — **nothing fails loudly when a stand-in stops
standing in** — stated in full at [C27](#c27-the-framing-target-was-never-the-dice--mostly-answered-2026-08-0910-one-case-left),
which is where it belongs because the framing target is the clearest case.
`grep -n "TABLE_W" js/main.js` is this shape's audit, worth running whenever
the ladder moves again.

### C22. A versioning contract for client state — DESIGN, then small

*Joe 2026-08-09: "I'd like to establish some diligence on client state… an
epoch part, a major number which indicates new capabilities, and a minor
version to track each compatible change."* Written after the frozen-mtime bug
put months-old clients in front of a current server with nobody able to say
what they were carrying.

**Three numbers, `epoch.major.minor`, on every stored blob and every wire
payload that carries state** (`dice.profiles.v1`, the portable file's
`version:`, `room.setup`).

| Part | Means | Reader's duty when it does not match |
| --- | --- | --- |
| **epoch** | *This is a different data model.* No compatibility is offered or implied. | **Purge it**, unless a converter is registered for that exact epoch. A registered converter runs once and rewrites forward. |
| **major** | *New capabilities exist in this data.* | A reader that supports a LOWER major must **refuse and say so to the user** — never load it partially. Older data with a lower major loads normally. |
| **minor** | *A compatible change.* Tracking only. | Load it. Nothing branches on minor; it exists so a bug report names a build. |

**The asymmetry is the point, and it is easy to get backwards.** *Older* data
is a migration problem — the reader knows more than the writer did and can
fill the gap. *Newer* data is a refusal — the reader knows less than the
writer did, and loading it means silently dropping whatever it did not
understand. PROFILES §11.9 (8) already rules this for one case ("an unknown
system falls back in the store and refuses in the file"); this generalises it
and states the reason: **the loud door is where a human is standing.**

**What exists today, and what it is missing.** `dice.schema.v1 = 2` shipped
2026-08-09 as the epoch mechanism, doing the purge half only: a client below
it drops every `dice.*` key once. `STORE_VERSION` is written into the profile
store and **never read**. `normalizeStore` and `migrateGroup` are the
lossless-migration path and are the right home for *major* handling. The
portable file has no version field at all.

**Build order.**
1. Fold `dice.schema.v1` into a single `{epoch, major, minor}` stamp and read
   it in one place, so there is one function that answers "can I load this".
2. Give it a **converter registry**: `epoch N → N+1`, run at boot, so the next
   break has an alternative to a purge. The purge stays the default; a
   converter is what you write when the data is worth carrying.
3. Make **major** refuse out loud, with the app's existing refusal grammar
   (`✗ …`) rather than a silent fallback — and say what to do (download your
   data, update the page).
4. Put the same triple in the **portable file** and in `room.setup`, since a
   file crosses versions by definition and is the one artefact meant to
   outlive a browser.
5. **Report the numbers with every crash** (js/report.js already sends what it
   is told) so the field log says which build wrote the state that broke.

**Not for this:** the room's wire protocol between a live client and server.
That is a different problem with a different answer — a live client can be
told to reload, which stored data cannot.

### C18. The result panel is too busy — SHIPPED

*Joe 2026-08-09.* Two cuts, both subtractive:

- **Drop `Save as pool…` from the result panel.** It was added in U13 to give
  "save what I just rolled" a door that was not an invisible 150px disc behind
  a right-click. That reasoning still holds for the *peek*, but on the result
  panel it is a third verb competing with the roll's own reading.
- **Stop printing the roll's text form in the panel's title.** Show **who
  rolled** and nothing else. The notation is already on the card body, in the
  log, and on the felt as dice; the title repeating it is what tipped the
  surface from "a result" into a list of facts about a result.

### C19. Buttons should not ask questions — SHIPPED

*Joe 2026-08-09, on C7's armed clear:* the double-press is right, the wording
is not. `Clear 1 more?` puts a question in a control. **Buttons guide, they do
not interrogate** — a question belongs in a modal, and this is deliberately
not one.

**SHIPPED 2026-08-09.** `Clear mine` → press → `Clear all`. Same two-tap,
same red escalation dress, no question mark. The COUNT moved to the title and
the announcement, where a number informs rather than interrogates — and the
title is where it has to live anyway, because the collapsed rail hides
`.cb-label` and the hover read is the only channel left there. Swept the rest
of the app's controls: this was the only one that asked.

### C20. `.hidden` is a class this stylesheet does not define — SHIPPED

*Found 2026-08-09 while rebuilding the join door.* `css/style.css` has a
global rule for the `[hidden]` **attribute** and **no generic `.hidden`
class** — every one is scoped to its element (`#settings-modal.hidden`,
`.popover.hidden`, …). So `classList.add('hidden')` on any element without its
own rule **is a no-op that reads exactly like a fix**.

Three were found in the seat modal alone: `#seat-someone` ("Someone else…")
had been visible every time the code asked it not to be, plus `#seat-list` and
`#seat-table-name`. Those three are now named individually.

**SHIPPED 2026-08-09.** 48 elements are toggled by class; **four had no rule**
— `#seat-someone`, `#seat-list`, `#seat-table-name` (named the day before) and
`#seat-preview-btns`, found by this audit. The last went unnoticed because its
PARENT `#seat-preview` has a rule and hides the whole block during the pick,
so the only visible symptom was the Apply/Not now row lingering after a seat
had already been applied.

The blanket `.hidden` stays refused, and `hidden-means-hidden` is what makes
that safe: it walks 35 elements the code actually toggles and proves each one
OBEYS — a rule-by-rule sheet stays honest by being checked, not by being
replaced. Two candidates the grep raised were false positives (`#draft-actions`
and `#strip-dc` hide via class-scoped rules; `#name-input` was a same-named
variable in another scope), which is the argument for testing computed display
rather than reading selectors.

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

### C10. The generic invite link never offers a prepared seat to a returning player — SHIPPED

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

**SHIPPED 2026-08-09 — option (3), with (2) folded in.** A standing,
dismissible **offer banner** in the panel, not a modal at the door. It cannot
block a join at all, which is the property the first attempt lacked, and it
serves every arrival rather than only the ones whose name happens to match.

The join stays exactly as it was: a stored name with no `&as=` still joins
straight through, and the pin asserts that no modal was added. What changed is
that the table now *says* it is holding characters — the switcher over the
rack has listed them since C17, and this points at it. Two exits: `Choose…`
opens that switcher, `Not now` is remembered **per room** so it does not nag
all evening.

**(2) is the banner's lead line.** `unclaimedSeats` matches prepared seats
against roster NAMES, so a player whose stored name equals a character
silently claims that chair on everyone's rail while holding none of its pools
— C10's second half. When the offer includes a character with your name, the
banner leads with it: *"**Bo** was prepared for you by Walter."* The collision
becomes the invitation.

(1) — a `seatsOpen` count on the peek — stays unbuilt and unneeded: nothing
here reads the peek, so the roster-privacy boundary is untouched.

Pinned by `table-offers-you`, which asserts the straight-through join, the
banner, the per-room dismissal, and the name-collision lead.

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

## Tier V — The immersion audit's shortlist (2026-08-12)

[IMMERSION-AUDIT.md](IMMERSION-AUDIT.md) cross-checked the detail work
against the industry canon: seven pillars STRONG, three PARTIAL, one GAP.
These items are that audit's ranked list; each names its pillar.

### V1. Audio phase one — the pillar-sized gap, medium-large — SHIPPED 2026-08-12
The one BASELINE-tier hole in the audit (§5): mono today, no rolling
contact, no room tone, no space. Shipped: equal-power stereo panning by die
position · a rolling-contact loop (gain from load, rate from film-derived
speed — dice must sound like they tumble, not just land) · settling taps ·
a faint synthesized room tone · a delay-line "shaft" color on tower clunks.
All synthesized, zero-dep, film-deterministic; no convolution, no samples.

Design authority is now [AUDIO.md](AUDIO.md); the player-facing surface is
UX §7.32; the proofs carry tag `audio`. Eight increments, one commit each,
each with a red check recorded in its commit message.

**Three things the build found that the design had wrong**, kept here
because they are facts about this codebase rather than about audio:

- **`landings[].frame` is not when a die stops moving.** It is the
  *recovered* stop instant — the bake rewinds it by SETTLE_STILL from the
  freeze it earned — so ~27 frames of real sub-millimetre motion follow it,
  and on a 4d6 one die is still over the rolling EXIT bar afterwards. The
  phase machine's absorbing settle is therefore load-bearing, not tidiness.
- **The frozen tail is not in the film.** `frozenPose` is pushed by
  reference after a freeze, but the tail cut truncates the reel at the last
  landing, so the byte-identical frames a check might want to exercise are
  exactly the ones that were deleted.
- **A rolling voice's leak is only visible mid-roll.** The end of the film
  silences the pool on its own, so `settle() → clearTable()` is green with
  the teardown removed. The claim has to be made with dice still turning.

**Still open (phase two, none of it blocking):** hidden-transit rolling
voices (the shaft is silent apart from clunks); the rough/surface track
feeding wall-vs-felt *timbre* rather than only level; a stone-chamber tail
if the dry table ever asks for one (a shared send with `g ≤ 0.90`, never a
ConvolverNode). And the bed does not ship on by default until Joe has
listened to it for an hour straight.

### V2. Dust motes in the lamplight — small — SHIPPED 2026-08-15
The canon's highest-ratio atmosphere cue (audit §3). Shipped as
[js/motes.js](../js/motes.js): one THREE.Points draw call of ~130 additive
glints falling slowly through the mood lamp's cone, brightness-enveloped so
no mote ever pops, riding the accumulated-dt clock (holdClock freezes the
air). The impact-keyed particle contract stayed intact by staying out of
it; the smoke's never-additive rule does not apply because a mote is
visible *only* as scattered lamplight. Field is a pure function of a fixed
seed and the mood dials — every client breathes identical air, and lamp
dials move the cone and its dust together. Proof: `mood-motes` (tag `fx`),
sabotage-checked; dials live at `__diceDebug.motesTune/motesInfo`. The
band deliberately stops at y=10: motes higher up paint the black backdrop
and read as a night sky, not dust (A/B in the commit). Same-day owner
pass: Joe re-dialed the field room-wide and much fainter (peak 0.07,
rMax 12, count 200) and scoped it to HEARTWOOD ONLY — a registry family
trait (`TOWERS[id].motes`) set through towerSocket, so the dust rises and
settles with its tower and every other body of air stays clean.

### V3. Finish the wear dossier — small-medium
Audit §2's two designed-but-unbuilt items: hand-polish roughness zones
(tray, jambs — "polished where hands and dice pass") and the arris ribbon
(sparse chip decals that break the long straight edges). Completes "aged"
into "aged and handled."

### V4. Performance guardrails — small
Audit §10: assert `renderer.info.render.calls` in tower-roll (a budget as
a failing test, not a vibe) · clamp `setPixelRatio` · an idle tick
throttle (render-on-demand proper conflicts with the breathing world; the
applicable form is a reduced idle rate).

### V5. Diegetic nudges — small, DESIGN FIRST
Audit §11: a result echo on the felt near the deciding die; hover warmth
on dice ("everything you can touch touches back"). The mat's painted text
is the precedent that this is buildable without a framework.

### V6. Taste items, someday — record only
A trauma²-curve table-nudge on the heaviest single-die landing; a grade
LUT. Both sit in the canon's hazard-adjacent column; neither moves until
Joe asks.

## Tier W — The first fantasy venue: the fae set (commissioned 2026-08-15)

Joe: "go full fantasy... an entire dice/tower/background/mat set focused
around faye/farie. No holding back... faerie moots around glowing
mushrooms on the dice tower... dense fog that the dice swirl and light up
with a glow." Design authority is GOALS goals 13–15 (venues, the two
registers, atmosphere-serves-the-roll), amended the same day; the punted
questions (multi-dice-set venues, unbundling, portability) are recorded
there. The engineering rules are untouched in this register: one seed one
film, zero-dep, e2e per feature, the camera rulings, the perf budget.

### W0. Research + concept — DONE 2026-08-15, JOE-APPROVED
Two dossiers (scratchpad/fae-research/ — grammar.md's sixteen rules and
four Vegas gates; techniques.md's fog/glow kit with two traps found in
post.js before they shipped), the venue spec draft
([FAE-VENUE-SPEC-DRAFT.md](FAE-VENUE-SPEC-DRAFT.md)), and four concept
plates from the gated lab (js/fae-lab.js, four rounds of iteration).
Joe: "That's awesome. I love them both" — BOTH palettes ship, as two
venues over one build. Tower direction: the rotted hollow trunk (a
natural shaft; foxfire is literally the glow of decaying wood; the moot
stages on it), with a mirror pool as glade dressing.

### W1. The venue mechanism + the set toggle — SHIPPED 2026-08-15
`VENUES` registry (table / moonrise / foxfire), `venue` as a room
setting (server SETTING_SPECS, the tower's unknown-id rule client-side),
a Venue picker in settings, and goal 13 enforced: while a fantasy venue
is active the felt/tower/dice-set pickers leave the panel, and selecting
a fantasy venue sends {venue, tower:'none'} as ONE patch so no client
ever pours through a tower another client does not draw. The W0 lab rig
is the interim stage — W2 upgrades fidelity in place. Proof: `venue-set`
(settings/fx/tower), sabotage-checked on the staged-means-in-the-scene
claim.

### W3. The fae tower — RESOLVED 2026-08-13: the shell is the first forge-baked GLB tower

**The route-1 ending.** The radius-field JS shell (route 2) landed on
2026-08-12 and its proofs went green, but Joe's verdict on the LOOK was
still open at the handoff (docs/handoff/2026-08-12-w3-hollowbole.md), and
his call came back: re-author through the forge, "mostly from scratch, an
organic looking model of the stump, turned into a dice tower in a clean
way". The clean way became a whole arc — **the TOWER_CORE v2 PORTAL
CONTRACT** (the handoff's own item 7, promised and now delivered; see
docs/TOWER.md "THE PORTAL CONTRACT" and docs/SHIPPED.md): a tower model
declares its dice-in/dice-out portals and the engine derives volumes,
film, colliders, camera and proofs from them, with the classic numbers as
the byte-frozen default spec.

The shell shipped after four review-gated bake rounds (form → roots/mass/
interior darkness → envelope fit + the cowl curtain → tongue value): two
palette variants from one deterministic recipe (`tools/forge/recipes/
hollowbole.py`, shared geometry digest, palette as bake input), 7.8k tris,
served from models/towers/ through js/towerglb.js, seated by the loader,
dressed through a raycast-synthesized surface descriptor so the
Joe-approved moot/attendants/door survived the shell swap (and the
θ-convention debt died with it — the moot gap finally faces front-left).
Battery: fit CLEAN (shell VENUE GROUNDS, tongue LIP CLADDING), occlusion
99/99 shaft+cowl at all six eyes (the interior liner's cowl CURTAIN
carries the band over the splintered crown), probe matrix 6/6, pour
29/29, suite 48/48, tower tag 8/8 with the new held-replay scenario.
The original W3 text below stands as history.

*(original entry, for the record:)* REGISTERED 2026-08-12, SHELL OUTSTANDING
`hollowbole` (`js/towerhollow.js`), the first `venueOnly` tower: no chip,
chosen by choosing the venue. Everything that is not the shell is done and
proven — the registry row and its hollow-log clunk voice, the lit door and
its ember light, `motes: false`, the server allowlist, the picker skip, the
crown moot and shelf fungus authored to the bloom threshold under BOTH fae
palettes, the scenario `tower-hollowbole` (tags tower/fx) with its red
checks, and the four contract proofs green.

**What is left is the SILHOUETTE, and it needs a technique this repo does
not have yet.** The owner's reference is a broken stump — stocky, a torn
frontal wound opening into black, splinter spires, heavy buttress roots,
pale barkless fibre — and `js/towerskin.js`'s vocabulary is boxes and
extrusions, which reads as a rectangular tower wearing bark. The shell is
isolated behind one function and one `(θ, y)` surface descriptor
(`buildLobedShell` → `buildHollowBoleSkin(v, { shell })`), named
`towerSkinBolePlaceholder`, so the parametric displaced shell drops in
without touching the moot, the door, the palette work or the proofs.
The general finding for docs/TOWER.md: the surface kit is ARCHITECTURE,
and organic forms want a radius field, not a box stack.

*(2026-08-12, recorded for whoever owns the shell: the missing technique
now exists in-repo. The forge pipeline —
[FORGE-BAKEOFF.md](FORGE-BAKEOFF.md), tools/forge/, the `/forge-model`
skill — was built exactly for organic-beyond-boxes, and its battery
includes a gnarled root-flared stump (tools/forge/recipes/B4_gnarl.py)
that is most of this brief. Two routes, owner's choice: bake the shell to
GLB (needs the app's first GLTFLoader vendoring — deliberately not done
yet, see tools/forge/README.md integration note), or use forge/Blender as
the ITERATION rig and port the converged radius/displacement field back
into the existing `(θ, y)` descriptor seam — zero new runtime deps, and
the field math is the same either way.)*

### W2. The glade room — DONE 2026-08-13
The interim W0 rig upgraded in place at the resting eye (the frame a
player lives in), all four named dimensions: **horizon** — a wrap-safe
pale MIST BAND inside the treeline, whose void-coloured canopy against a
void sky over void-tinted fog had never read at any eye (the silhouette
finally has something to stand against, and so does the tower's dark
trunk); **atmosphere** — fog retreat to the spec's own numbers (22/60)
and real billow structure in the sheets (three octaves of wrapped blobs
over a continuous bed); **lighting** — the moonbeam narrowed from
frame-wide haze into a column that LANDS on the resolve area (grammar
12; a beam is visible where it ISN'T — probed by hide-one-at-a-time
before tuning); **surface** — two-scale moss and a clearing-detail
layer where grammar 14 puts the one place of detail. The moot re-staged
out from under the W3 tower (the W0 ellipse stood "where a tower will
stand", and then one did) onto the left flank, ring rotated so the gap
and the fallen cap face the clearing; and the MIRROR POOL — Joe's
approved W0 dressing, finally built — holds the right: night water a
step PALER than its banks (it mirrors the sky), the moon's glint a
broken column of wavelet dashes, unlit by design (a mirror's light is
its bake). Placement law ships as `venue-set` assertions off
`venueInfo().stage` — flank props dice-unreachable at their NEAREST
point beyond the widest back wall and clear of the tower envelope, beam
on the clearing, three dense sheets below every die top — red-checked
on the beam's old wrong position. `tools/steps/glade-look.mjs` is the
fast look loop with element forensics. Both palettes LOOK-gated at the
resting eye and in the spread; suite 48/48, tower+fx 15/15 with the
contract freeze untouched.

### W2b. Scene integration and the venue skill — TRACKED 2026-08-13 (Joe)

Joe's verdict on the W2 room, verbatim: *"The scene is arranged as three
set pieces… The tower, the mushroom ring, and the pool. They are good
set pieces overall, but the scene lacks integration. And setting them
next to each other in this way is simplistic. Please consider the visual
flow of the scene as a whole. You might need to research design a bit
for this and start to build out a venue skill that defines how to reason
about layout, flow… you did great on a theme and a color palette."*

So: theme ✓, palette ✓, **composition is the open craft.** The shape of
the work, in order:

1. **Research the discipline** — scene composition and visual flow for
   staged environments (leading lines, depth layering and overlap,
   grouping/rhythm vs. the three-islands failure, negative space, how
   ground cover and light carry the eye between features). Distill to a
   dossier the way fae-research/grammar.md distilled palette law.
2. **A venue skill** (`/new-venue` or similar) that encodes HOW TO
   REASON about layout and flow — the composition counterpart to
   `/new-tower`'s portal arithmetic: what gets placed where and why,
   what connects features (paths, spill, roots, mist gradients,
   shared edges), what the eye should do from the resting eye, and the
   gates that check it (occlusion/overlap between features, sightline
   probes, the placement law W2 shipped).
3. **Apply it to the glade** — integrate tower, moot and pool into ONE
   scene (candidates to evaluate under the researched doctrine, not
   commitments: moss/ground-cover gradients that flow between features,
   the moot's spill trailing toward the tower's roots, the pool catching
   the tower's silhouette, mist density carrying the eye, overlap
   instead of adjacency).

Sequenced AFTER W4 per Joe ("track these issues for later; go ahead with
the dice").

**DONE 2026-08-13 — all three steps.** (1) The doctrine is
[VENUE-COMPOSITION.md](VENUE-COMPOSITION.md): ten rules with CHECKs,
grounded in the one fact that makes them mechanical — a venue is a
DIORAMA, watched from one composed eye. (2) The skill is `/new-venue`
(eyes before opinions, diagnose by CHECK, triangle inside the placement
law, tissue in the stage's own idioms, both-palette LOOK, the trap
list). (3) The glade integrated per its own diagnosis: pool moved back
and out (7.2, −7.4 — bookend depth broken, background layer gains a
tenant), its glint re-aimed at the tower's foot (the one dissenting
arrow), a five-cap SPILL walking from the moot toward the root flare,
two connective moss lobes baked into the ground (socket→moot,
socket→pool), base transitions (damp pool margin, trampled court), and
the mist band's bites azimuth-weighted (thin at the circuit's release,
dense behind the pool). Placement-law claims held as inequalities off
venueInfo().stage — no scenario edit needed for the move, which is what
reading the contract instead of constants buys. Suite 48/48;
fx+settings 21/21; LOOK both palettes.

### W2c. Grown, not placed — the aesthetic goals (2026-08-13, Joe)

Joe's verdict on the integrated W2b room, verbatim: *"When I look at the
scene, I see three set pieces, the mushroom ring, the stump tower, and
the pond. They are placed next to each other in a line in the most basic
way. There is no aesthetic to it, there is no visual continuity
transforming them from set pieces into a unified scene with a flow. Part
of the problem is the seams around the stump. It's not part of its
environment. It lacks a convincing connection to the ground. It looks
like an item set on a table, not a stump that grew out of the ground. It
needs to either blend into the fog fully, or the ground needs to be
visible and it needs to better integrate with it via roots or something.
The other part of the problem is that the ramp out of the stump is not
part of the immersion and instead plays against it. Making it look like
part of the ground (dirt, maybe moss, maybe roots) that happens to be
placed in the right location, would work far better. It's also weird
that the exit hole extends below the ramp's highest point…"* And the
directive: *"use this information to build out the design aesthetic
goals for all venues so we track this for future builds."*

**The post-mortem W2b owes, recorded so the doctrine can absorb it:**
W2b moved features in PLAN, and the resting eye compresses the placement
law's back band (features live behind z −4.3 in a strip a few units
deep) into one horizontal screen band — so plan-depth moves cannot break
a line-reading. Rule 6's check was run in the wrong space. The levers
that exist at the eye are angular-size contrast, silhouette overlap,
terrain, and the untouched FOREGROUND band (in front of the front wall,
dice-free by construction). Fresh frames confirm the rest: the stump's
base meets the moss in a clean seam (the W2b lobes are too soft to read
at exposure); the baked wooden tongue reads as a gangplank propped
against a prop — round 4 already tried paint (make_tongue_paint, a 0.39
value drop) and a tinted prop is still a prop; the wound's ragged
threshold (0.90, teeth lower) shows below the ramp crest (sill 1.00);
and the pool is half-cropped out of the resting frame and near-invisible
in foxfire.

The work, in order:
1. **Doctrine** — VENUE-COMPOSITION.md gains rules 11–13 (grown-not-
   placed; engine furniture wears the world; the scenery tier) and rule
   6's check moves to SCREEN space; `/new-venue` absorbs them; GOALS
   goal 14 points at the dossier as the venue-scene law. Chosen fork of
   Joe's either/or on the stump: GROUND-INTEGRATION, not fog-blend —
   the tower is the hero (rule 1) and a hero dissolved into fog forfeits
   the frame. **DONE (1939666).**
2. **The stump grows its ground (hollowbole round 6)** — the model owns
   its transition: the wooden tongue re-authored as an EARTHEN BERM
   (crest exactly on the ramp collider plane inside the dice lane;
   lumpy wings outside it, pressed flush into the wound base so the
   below-sill rag is buried, not squared); root-flare fingers diving
   into the soil; moss-creep vertex color low on the trunk blending
   toward each palette's ground. Venue side: the contact ring retuned
   tight and dark, a disturbed-soil ring. **DONE (d088bf9 + promotion).**
   A first candidate re-built the RAMP with parapets and was rejected at
   review (Joe caught it live); the accepted mound is a heightfield with
   the lane carved through it — the trap and construction are recorded
   in the recipe header and the skill.
3. **Re-flow at the eye + the scenery tier** — the pool into frame and
   up a value step; angular-size and overlap contrast between the
   three; foreground-band scenery (dark tufts, a stone, framing the
   bottom corners) and mid-ground connective bits (a fallen mossy
   branch, bank stones) — value-quiet, zero new sources; every moved
   placement lands as a documented new claim in `venue-set`.
   **DONE (c4c2f17)** — with a probe-driven correction: `worldToScreen`
   showed the resting eye crops nearly the whole front band, so the
   fore tier is ONE bottom-left corner wing (near-corner legality =
   outside the dice BOX, past the front wall OR the x wall).

**Two bugs the round surfaced, both fixed with red-checked claims:**
- **The palette flip that never re-dressed.** The two fae venues share
  tower id `hollowbole`, so a palette change queued no socket and the
  moonrise model stood in the foxfire world — invisible for two rounds
  of pale wood, loud the moment the berm carried baked soil. Fix:
  `towerReskin()` — visual-only in-place skin swap on venue change
  (variants share portals + geometry digest, so bodies and the film
  never move), guarded by a portal-match refusal. `venue-set` asserts
  the berm's baked vertex-color means DIFFER across the flip (identical
  means was the smoking gun) and that no body moved.
- **The grounded env on venue towers.** scene.environment stays the
  grounded room's env in every register, and a dark surface is mostly
  reflection — the berm (albedo ~0.025) took a visible foreign blue
  cast at the C5 house-rule 0.45. Fix: `towerEnvPolicy()` — 0.45
  grounded, 0.08 fantasy, applied at socket + reskin, asserted by the
  audit's offPolicy check from the same function.

**Ledger — next tower round (not W2c):** the pale MACHINED FACE at the
shell's x-clamp plane (x 3.13, y 0.70–0.85, z 0..−0.4) reads as a sawn
plank in side views; pre-existing (round 5 renders it identically,
A/B'd), and more visible now that everything around it is organic.

### W4. The dice set — DONE 2026-08-13 (pending Joe's LOOK verdict)
Moonmoot Witchlight (THEMES.md §10; js/themes.js): tumbled labradorite,
all the light in the deep-carved numerals — "rune glow" delivered as
carving + witchlight rather than a runic alphabet (a recorded refusal:
the legibility invariant outranks the brief's word, and the glyph
library stays the later slice themes.js already names). One set serves
both skies (its digit color sits between the two palettes' rims). The
venue STAGES it at roll creation — venueDiceSet through wireSet/
rollSetOf/draftDieSets, the GOALS 13 punt delivered — so the roll
RECORD carries the set: replay, late joiners and every client agree off
the record, dice on the felt keep the skin they landed with, and your
own choice resumes with the room. `venueOnly` (no chip anywhere) and
`fog` (per-set venue fog breath) joined the recipe language. Voice: a
long cold chime, reasoned and NEVER LISTENED TO (Joe's dial, same
ledger as every tower clunk). Die lights deliberately absent: the venue
lights its dice (followers, halos, fog) and a set light would
double-glow — restraint recorded in the recipe. Proof: `venue-dice`
(record-level, both tabs, release-on-exit, picker refusal),
red-checked; suite 48/48; fx+settings+tower 23/23. throwSeeded now
records the set a real roll would (absent for std — every existing
record byte-identical), so look-drivers photograph the product's dice.

### W5. The living layer — BUILT 2026-08-13; its own LOOK read still open (see W7)

The glade is inhabited, and it minds the table. [js/faelife.js](../js/faelife.js)
is venue-generic — a FIELD of fireflies that says the place is alive and
a WISP PROCESSION that says somebody lives here — and the glade supplies
only composition data: four zones where life is legal, and a ten-waypoint
route that rides the eye's own circuit (rule 7). The vacated moot stays
vacated and gains VISITORS: a pulse travels cap to cap, the fallen one
answers out of turn, and the ring lifts when the procession is standing
in it. Doctrine is [VENUE-COMPOSITION.md](VENUE-COMPOSITION.md) rule 14.

**THE ONE LAW: nothing alive ever crosses the dice box** — held by
construction, not by good waypoints. Members are seated outside the
widest mat's walls with their own wander included, a runtime clamp
backstops the seat, and both counters must read zero. Rule 1, goal 15 and
the placement law collapse into that one sentence.

**The budget shaped it more than taste did.** A census counts NINE
countable sources against a ceiling of nine, and two glow hues plus one
warm accent against a limit of exactly that — so the field is tertiary
and grayscale-per-point (the hue lives in one material, which is what
keeps a field exempt from the count), and the wisps are a procession
rather than a swarm: one bright lead, which REPLACES the lead the stage
has carried since W0, plus three followers at the field's ceiling. Net
new countable sources: zero.

**The governor** is what makes it serve the roll instead of decorating
it: the glade withdraws while the film runs (fast — startled is quick)
and leans back in once dice are readable (slow, cautious), where the lean
is dwell and value on the route's near arc and never a step toward the
table. One crit beat, keyed to `entryCritCeremony` and never `entryCrit`
— U18's lesson is that a per-die system calls about half of all pools a
crit.

**Two findings worth more than the feature.** (1) A TIER IS A LUMINANCE
and an authored scalar is not one: the field was written at 0.22 "against
a ceiling of 0.25" and rendered at 0.09, because the palette's teal
carries a luma of 0.416 — two thirds of the budget unspent, and the gate
would have passed it (rule 8 as amended; the probe now reports the
product). (2) A `THREE.Points` size is world units scaled by
halfHeight/depth, so 0.20 at ~17 units is about two device pixels: the
census said fifty-one lit fireflies were in frame while the frame showed
two, and no brightness change was ever going to fix it. A size ladder at
0.2/0.5/0.9 picked 0.5 — 0.9 makes blobs that contest the moot's caps.

**Three bugs it surfaced, none of them W5's:** the stage clock never
reset across a restage (so a client that had toggled venues breathed
differently from one that had not, and no screenshot after a toggle
reproduced); a POURED die parked inside the tower was lighting a fog
pocket from inside the trunk; and the sixth halo slot had been built and
never written to on every fae frame since W0.

Proof: `venue-life` (tags fx, settings) — the law over every member at
six points around the route, the tiers as RENDERED, the sim-clock freeze,
a re-staged glade breathing identically, the governor under a seeded
throw, the ring waking and quieting across a lap under the bloom
threshold, and the two skies dressing the life differently (the P9
content check — every other number the hook reports is
palette-independent by construction). Six red checks recorded in the
commits. `tools/steps/life-look.mjs` is the look loop: a static room is
fair to photograph once, a moving one is not.

### W7. The stump stops being a helmet, and the scene stops being staged — 2026-08-13 (Joe)

Joe's verdict on the W5 frames, verbatim: *"Looks too staged. The gesture
is not right. I want the dice tower to be in a scene, not the centerpiece
of it in a symmetrical and formal way. Consider moving the mushroom ring
more to the foreground (Don't worry about where the dice land too much),
and maybe move the pool backward and completely change it's size.. Also
more mushrooms throughout the scene would help.. Lastly, the dice tower
looks like a demonic helmet more than it looks like stump. It's too
symmetrical, and the opening looks too much like either a gaping mouth or
like the face opening of a helmet."*

**Read it for what it is: he answered a question about the LIVING LAYER
and talked about the composition and the model.** The fireflies and the
procession are not what he responded to — nothing in the verdict is about
them — so W5's own read is still genuinely open and should be re-asked on
frames where the staging is no longer the loudest problem. Recording that
distinction rather than banking an approval nobody gave.

Two arcs, and he picked the model first.

**① Round 7 — the stump. DONE 2026-08-13** (Joe, on the frames:
*"Beautiful"*). Shipped: a crown SHEAR (y_top 11.55 left vs 9.50 right, a
2.05 gap against the 2.00 floor) so the break is a monotone diagonal to
ONE shard at +0.83 rad instead of two peaks at the silhouette edges; the
mouth's lintel a monotone tear climbing 1.03 across the throat with the
periodic term deleted; the taper inverted back to a stump — base(y)
strictly decreasing, outline half-width 3.08 at the felt → 2.48 at the
rim, 23.8%, widest row at y 1.50; and the x-clamp face broken up with
noise so max|x| is 3.083 rather than a hard plane at 3.130. 7956/8000
tris, watertight, 25/25 on both approach and exit rays, both palettes
from one bake with the SHARED geometry digest `set=3c13ab67b2f42533`,
digests reproduced by an independent re-bake at the review gate.

**The round's own lesson, and it outlives the model:** the three new
gates — `assert_silhouette_is_not_a_face`, `assert_taper_is_a_stump`,
`assert_lintel_is_a_tear` — are stated in the FRAME and bin the built
mesh's edges into a projected outline, and all three are red-checked
against round 6's field, which fails them on seven counts. A gate phrased
in plan could not have caught any of this, because round 6 already
satisfied every plan-space claim it was asked for.

**Residuals, recorded rather than fixed.** The cheek's fibre is
low-frequency and reads as soft shading in the forge rig — but the rig's
key is not the app's, and at the resting eye under the moon and the fog
it reads as weathered wood, so this is closed unless Joe says otherwise.
The taper is compliant but not dramatic, and it cannot become dramatic
without a different budget: XLIM 3.13 clamps the foot and clearR 2.20
plus the wall floors the crown, so both ends are pinned. From dead front
the trunk is still columnar, with two darks and a light between them —
now a parallelogram rather than a face.

*(the brief, for the record:)* THE HELMET READ IS THE BRIEF, and the
x-clamp facet ledgered in W2c is now the small half of it. Diagnosed
shape of the problem, to be confirmed against fresh isolated frames: the
trunk is close to a body of revolution, so its silhouette is near-mirror
about the view axis; the crown's break line reads as EVEN CRENELLATION
rather than as splintered wood; and the wound is a large, centred,
symmetrically-framed dark aperture with a scalloped upper edge — pale
wood on both sides of a dark hole with teeth is a visor, and the eye
resolves faces first. **The hard constraint is that the wound IS the
doorway**: `TOWER_PORTAL_LIMITS` bounds its clear aperture and the film
is baked against it, so the fix has to make the wound's silhouette
asymmetric and torn OUTSIDE the clear box while leaving the box itself
untouched — an overhanging splinter that intrudes on it is a die
collision, not a detail.

**AND THE TAPER IS INVERTED** (Joe, same day: *"did you notice how the
stump is not particularly wide at the bottom and gets much wider near the
top? Most stumps are dramatically wider at the bottom… This needs
work"*). Arithmetic, not taste — `base(y)` evaluates to **2.74 at the
foot, 2.47 at the waist, 2.90 at the shoulder**, so the shoulder is 6%
wider than the ground. That is a vase, and it feeds the helmet read
directly, because a helmet flares at the top and a stump flares at the
bottom. Two constraints make it non-trivial and both hold: XLIM 3.13
(plus the tilt term) caps the foot, which is why the answer is mostly to
NARROW THE CROWN rather than to fatten the foot; and `PORTAL_IN`'s
clearR 2.20 at rimY 9.40 is an INNER radius, so crown room has to be
bought by retuning `wall(y)`. The buttress web also dies by y 3.3, which
makes the flare a skirt at the ankle instead of a base that flares.

**A LESSON WORTH MORE THAN THE FIX:** the comment above `base` says
"heavy foot… a crown that flares back out". The heavy foot is 0.32 of
exponential and the crown flare is 0.48 of smoothstep — **the comment
describes the opposite of what the numbers do**, and it survived four
review-gated rounds because everyone who looked at that function read the
prose. Same family as "never write a comment claiming a check passed",
and the reason the correction was sent as EVALUATED VALUES at named
heights rather than as a curve someone would have to trust.

**② The staging.** The moot moves toward the FOREGROUND, the pool moves
back and changes size outright, and mushrooms spread through the scene
instead of pooling in one ring. Note what his parenthesis licenses and
what it does not: *"don't worry about where the dice land too much"*
relaxes the composition's deference to the mat, but the placement law is
about LEGIBILITY — the stage carries no colliders, so a die that comes to
rest inside a mushroom is unreadable rather than merely untidy. The
foreground band (in front of the front wall) is dice-free by construction
and is where a forward moot can go while still obeying it; take that
first and only spend the licence if the frame still refuses.

### W6. The venue's audio palette
The last step of the tier. Ships with its e2e proof; the venue is judged
as a WHOLE against goal 14's internal-consistency contract. Note the
standing debt it inherits: every fae voice reasoned so far — the four
tower clunks and the Witchlight chime — has never been LISTENED to.

## Tier T — The tower contract: what the cosmetic/physics split still owes (2026-08-13)

Joe commissioned an adversarial pass over every surface that defines how a
tower is built, with one goal: **if a tower is 100% cosmetic, stop paying
for physics tests to prove it.** The law that came out of it — *physics and
film are a function of (portal spec, engine constants, seed); the model is
not an input* — is enforced, not aspirational: the model contributes zero
colliders, and a mesh change that leaves `tower-spec-digest` and
`towerFilmDigest` unmoved provably cannot move a roll. Round 1 (merged
2026-08-13, 25 commits) built that spine and demonstrated it on its own
work: a restructure touching every registry row, plus a rewritten occlusion
proof and a new cladding audit, returned byte-identical film digests.

Measured cost of a tower today: bake + nine refusals **~30s** (both
palettes), the whole cosmetic gate `npm run gate:cosmetic <id>` **1m47s**
for six steps and ~13 rendered frames, and **zero dice simulations** for a
mesh-only change. Rounds 2–4 of the lock (harness surgery, descriptor
purge, docs/skills) are sequenced separately; T3 and T4 below are their
first two items, recorded here because this file is the durable copy.

### T1. `TABLE_D` drifts a float on every tower swap — FIXED 2026-08-13
Found by the occlusion probe, not by a failing test. `towerDeepenMat(+4.5)`
followed by `(−4.5)` did not return: at 'medium' the mat came back
6.699999999999999, one ulp low, once per unsocket. z0 is −TABLE_D/2 and z0 is
the anchor every volume, collider and keyframe hangs off, so two clients with
different socket histories could bake one seed against interiors differing in
the last bit — goal 15's exact failure, hidden because `applyZoom` re-assigns
`TABLE_D` from the preset and every ONLINE client takes a zoom at hello.

Fixed as designed: depth is a SUM of named layers (`MAT_DEPTH` = base + socket
+ lab), re-derived by `towerMatDepth(layer, extra)`, which takes what a layer
IS rather than how much to add. Putting a layer away restores the base
exactly, and the sum's fixed order means a room reached by different routes is
the same double either way. It also closed a second hole for free: the LAB
used to undeepen by whatever its dial said later, so moving the dial
mid-session left the mat permanently off by the difference.

Two witnesses, both pre-existing and both moved from documenting the bug to
refusing it: `tower-glb-loader`'s restoration assertion was literally
`assert.equal(downExtents.d, 6.7 + 4.5 - 4.5)` — the hardest tab in the suite
(four towers, two tower→tower swaps, a lab cycle nested inside a socketed
tower) — and is now `deepEqual` against the preset; and
`tower-contract-freeze` went RED on `medium.none` and `close.none`. That
re-capture is the deliberate kind: 13 fields moved, every one of them by
exactly one ulp (max 8.9e-16), no field added or dropped, and every new value
is the exact preset-derived number.

### T2. The doorway ignores the portal it belongs to — DECIDED + FIXED 2026-08-13
**The decision: keep the knob and make it coherent.** Deleting `out.x` the way
`out.z` was deleted was the other honest end, and it lost: the freedom is
already 80% built — apron, lip, hood, exit spawn and the flight envelope all
follow `out.x` — so the bug was never the knob, it was three bodies that had
not been told. And it was not hypothetical: BOTH committed test fixtures
declare an off-centre exit (the portal-stress fixture −0.15, the min-tower
fixture +0.25), so each had a jamb standing 0.15–0.25 inside its own modelled
opening, where a die grazing the edge meets an invisible wall.

`doorL`/`doorR`/`lintel` now derive from `v.door.x`, written `anchor ⊕ delta`
like the rest of `towerVolumes` (`+ ox / 2` is `+ 0 / 2` at the classic spec,
and `x + 0.0` is `x`), so no classic body moved and the freeze needed only an
additive `door.x` re-capture — no value moved, proved by a key-by-key walk.
`tower-occlusion`'s doorway classifier follows the same centreline; its old
NOTE apologised for the mismatch and is now a statement of where the aperture
is. Red-checked by forcing `ox` back to 0: RED on the lintel and both jamb
edges.

**What this does NOT buy:** shipping a tower with an off-centre exit still
owes the probe matrix, exactly as an off-classic sill does. What is proven
today is that the door is coherent and that a 3d6 pour delivers through
`out.x` 0.25 (`tower-glb-loader`); a real off-centre product tower wants
`portal-probe` across seeds and pool sizes before the sill is called final.

### T2 (original entry, kept for the reasoning) — small, DECIDE FIRST
`doorL`/`doorR`/`lintel` are built centred at x=0 while the apron, lip and
exit spawn all follow `portals.out.x` (legal range ±0.75). The first tower
to use that freedom gets a doorway that does not line up with its own exit
lane. No shipped tower exercises it; `tower-occlusion` prints a NOTE when
`out.x ≠ 0`. Two honest ends, both cheap: derive the three bodies from
`out.x`, or delete the knob the way `out.z` was deleted on Joe's ruling.
Deciding is the item — keeping it means engine work *plus* a probe campaign
for off-centre exits, which is the cost the ±0.75 range was meant to buy.

### T3. Re-pin the two fixtures — and decide what the spec digest is FOR — SHIPPED 2026-08-13
Both proof fixtures were red, for the same benign reason: each was captured
in a worktree before the merge added fields. Re-pinned with a mechanically
reviewed diff — `git diff --stat` on the contract golden reads *0 deletions*,
and a walk over the old fixture confirmed **no value moved**, only fields
appeared. Three things came out of it that were not just a re-pin:

- **The freeze now runs on two axes.** Z0: three presets × {unsocketed,
  heartwood}, as before. SPEC: every OTHER registered tower at one preset,
  which freezes the portal spec each one asks for and the core derived from
  it. Hollow Bole was frozen nowhere at all until this; a baked row whose
  portals silently failed to load and fell back to the classic core is a
  different bug wearing identical volumes, and `source` (`model` vs
  `default`) is now frozen next to the numbers that tell them apart.
- **A new tower must be frozen too.** The registry is read live and every id
  must have a row, so registering a tower without capturing its contract is
  RED — with the message saying that this re-capture is the legitimate,
  purely-additive kind. Red-checked by deleting `wide.hollowbole`.
- **The spec digest stopped pinning DERIVED fields.** It covers the declared
  spec + source + limits only. An engine-constant change used to move every
  row at once on work that renegotiated no portal, and churn is how a gate
  gets re-pinned without being read. Derivation drift has two better owners,
  both byte-level: the freeze above (whole derived core, every tower) and
  `towerFilmDigest` (spec + volumes + POUR + the plan pourPlan draws).
  Red-checked: a declared `out.w` edit still reports `portals.out.w: 4.6 → 4.2`.

### T4. Split the cosmetic lane in the e2e suite — SHIPPED 2026-08-14
All four wants, and the fourth found something.

- **The `look` tag is enforced, not documented.** `runScenarios` reads
  `__diceDebug.diceEverMade()` from every tab after a `look` scenario and
  fails on any non-zero count — or on a counter it cannot READ, because a
  guard that passes when its instrument is missing is this project's
  dominant failure mode. `DICE_MADE` counts die BODIES at the three places
  one comes into existence (throw, pour, lab drop), which fails closed: a
  body built and never stepped still means dice were in play.
- **`tower-dressing`** (tags `tower`, `look`) holds the claims that moved out
  of `tower-roll`: 13s against 38s, and it covers every skinned row instead
  of every row-but-the-first.
- **The budget is an assertion**, and it was a wish: the day it ran,
  heartwood measured 11 dressing draw calls and bastion 9 against a written
  rule of 8. Triangles are fine everywhere (worst: hollowbole 2644 of 4000).
  See T14 — the two are waived by name AND by value rather than by raising
  the budget to fit them, and the waiver is self-cleaning (a listed row that
  comes back inside the budget FAILS, so a fix forces its line to be deleted).
- **Claims are aggregates** over the `towerSkin*` subtree, not named meshes.

Red checks, all three seen: a `look` scenario that rolls → RED; with the
scenario's own assertion removed, the RUNNER catches it → RED with the same
count; with the debug hook renamed away, the guard refuses to pass → RED.

### T14. Two towers have been over the dressing draw budget the whole time — small
Found the moment T4 turned "≤ 4k triangles and ≤ 8 draw calls of dressing"
from a printed number into an assertion: heartwood's dressing is **11** draw
calls (9 in `towerSkinDress`, 2 in `towerDressFx`) and bastion's is **9**.
Both are inside the triangle half by a wide margin, and every newer tower is
inside both. Nothing is visibly wrong — this is frame cost on a scene that
already spends 49–88 draws — but the rule has been decorative since the
dressing pass, which is exactly the thing T4 existed to stop.
Fix shape: a merge pass on the two classic prop kits (they are 9 and 8
separate meshes; the kit already knows how to bake a shared canvas, so this is
geometry merging rather than art). Until then `DRESS_DRAW_WAIVER` in
`tower-dressing` names them with their measured counts, so neither can grow
and fixing one deletes its line.

### T4 (original entry, kept for the shape it asked for) — small-medium
The policy exists in the tools (`gate:cosmetic`) but not yet in
`scenarios.mjs`, so a pure mesh change still drags a 38s physics scenario.
Wants: a `look` tag with a fail-closed no-roll guard in `run.mjs` (a
cosmetic scenario that simulates a die should FAIL, not pass quietly);
`tower-roll`'s dressing block split out; the dressing budget (≤4k tris,
≤8 draws) turned from a printed number into an assertion; and every
cosmetic claim anchored to an aggregate over the `towerSkin*` subtree
rather than one deletable mesh name — `venue-set` breaking on a deleted
berm is the precedent that named the rule.

### T10. The look loop — SHIPPED 2026-08-13 (nullstone's postmortem, made mechanical)
Building Nullstone measured where a tower's time actually goes: the gates
cost four minutes of machine time across seven bakes and caught five real
defects, and **the look loop cost more than everything else in the job put
together.** Two causes, both now fixed rather than noted:

- **`tools/steps/tower-try.mjs`** + `__diceDebug.lookSheet()` — six views of a
  bake, rendered through the SHIPPED path (same tick, post stack, lights and
  tone map a player gets), composited into ONE labelled sheet, with the fit
  and occlusion verdicts printed above it. It sockets a raw
  `tools/forge/out/*.glb` through `towerRegisterGlb`, so nothing is promoted
  or committed to be judged and a rejected round leaves no trace. Judging in
  the FORGE PREVIEW — whose rig is not the room's — cost four rounds of value
  decisions that were all retaken the moment an app frame existed.
- **`tools/forge/towerplan.py`** — what a portal spec leaves you room to
  BUILD, before you model: per-heading reach with the wall floor under it and
  the inset budget between them, the doorway's jambs and probe box, the
  lane's two collider planes, and how tall the front must be for the
  occlusion proof to pass (9.568 for the classic-family rim — the number that
  is otherwise invisible until a browser finds it). Four of nullstone's five
  gate failures were answerable from that table.
- **`tools/forge/towerkit.py`** — `tri_array`, the ray caster and the seven
  gates every recipe was copying, wrapped around `towergates`.
  `run_battery()` returns the gates it ran, so "every gate ran" is a
  comparison rather than a hand-kept manifest. Proven a pure lift: nullstone
  re-baked on it to a byte-identical digest.

**The finding worth keeping**, recorded in `/new-tower` §1.9: nullstone round
1 passed every refusal in the contract — occlusion 99/99 at six eyes, lane
clad 243/243, throats clear — and rendered as a picket fence around a bucket.
The contract proves a tower is LEGAL; only a frame says it is a tower. Still
open from the same pass: `hollowbole.py` has not been moved onto the kit (it
carries its own copy of both helpers), and nothing yet renders CANDIDATE
massings side by side, which is T11.

### T11. Judge three massings at once, not one after another — small, needs the call
The remaining serial cost in the loop is mine, not the tools': nullstone was
refined one shape at a time — author, look, rewrite, look. Baking three
candidate massings and judging them on one sheet picks a direction from
evidence instead of converging on a guess, for roughly the same token spend
and a third of the wall time. Needs Joe's say-so because it means fanning out
agents, which is why it is written down rather than done.

### T5. Recipe authorship is the new bottleneck — DESIGN FIRST, medium
The headline finding of the whole pass. With gates at 30s and 1m47s,
machine time is no longer what a tower costs; a "five-minute mesh" is still
20–60 minutes of Blender Python. Two candidate levers, neither chosen:
(a) **a higher-level recipe vocabulary** — the shapes `hollowbole.py` and
`B4_gnarl.py` keep re-deriving (trunk with root flare, spire crown, torn
aperture, shelf placement) lifted into parameterized forge helpers;
(b) **an adopt-a-mesh path** — take geometry authored or generated
anywhere, declare portals against it, and let the gates rule on whether it
sockets. (b) is the larger unlock and the larger risk (no COLOR_0, no
budget discipline, no material story, and the vertex-colour laws this
project learned the hard way). Design before build.

### T6. Two palettes cost two of everything — small
COLOR_0 is baked data, so every fae tower bakes twice and is LOOKed twice.
Tolerable at one tower, a tax at five. The bake half is nearly free already
(28.4s covers both variants in one invocation); the human half is not. Fix
shape: a single contact sheet that puts both palettes side by side at the
same eyes, so the LOOK is one pass instead of two.

### T7. Promotion is manual and main-session-only — small, and it has already bitten
**2026-08-13, found by accident:** the shipped `hollowbole_*.glb` had been two
commits behind their recipe since that morning — round 1's forge work added a
`doorPad` marker, re-baked, and correctly did not promote (models/towers/ was
outside its cluster), and nothing then noticed. The digest baseline could not:
`set` is over GEOMETRY, and the geometry never moved. **A digest proves a model
did not change; it says nothing about whether the file anybody serves is the
file the recipe writes.** Promoted and proven the same day, but the gap is the
item.


An agent can bake a GLB and prove it, but cannot ship it: copying into
`models/towers/`, adding the static-cache manifest entry and re-pinning the
digest are main-session acts. The gate is deliberate — the frozen-mtime
production bug lives in exactly this class — but it is the one seam where
an otherwise autonomous tower build stops dead. Refinement: a `promote`
step that performs all three edits as one reviewed diff, so the human act
is approving a diff rather than remembering three files.

### T8. Two gates that cannot be armed yet — (a) ARMED 2026-08-13, (b) designed
- **`tower_fixture.py` was RED on the bake-side occlusion gate** (cowl 11/99
  at `wide.full`) — REBUILT, not waived. The cause was one line and it
  generalises: `HEIGHT = PORTAL_IN["rimY"]`, "the rim IS the top edge, so they
  are one number". THE RIM IS NOT A HEIGHT CAP. The cowl band's top is
  despawnY + a die's radius, and a high eye's ray to it crosses the model's
  front plane ABOVE the rim, so a model as tall as its own mouth cannot hide
  the vanish — by construction, however closed the rest of the shell is. The
  fixture now builds its front to `front_height_needed() + 0.15`. Building to
  that number the first time still left 1/99, which was the second finding:
  both hand-written copies of that arithmetic measured the sample on the BORE
  AXIS, while the binding one is the deepest point of the widest disc (9.854
  vs 10.120 here) — a planning number a compliant model fails is worse than
  none, so it moved into `towergates.front_height_rows` and both callers ask
  it. The in-app half is a VERDICT now too: `tower-glb-loader` asserts shaft
  and cowl fully blocked at all six eyes, red-checked against the old bytes
  (87/99 at wide.full). It could not have carried that assertion before — a
  leaking asset cannot police the leak.
- **`tower-occlusion`'s SOLID exit/hood classification is still a printed
  report.** MEASURED while arming (a): the 18 points are THREE samples
  (x −0.9, 0, +0.9 at y 3.77, z −7.42) seen from six eyes, crossing the wall
  plane at |x| ≤ 0.85 and y ∈ [4.04, 4.32] — just over a declared head of 3.5,
  in a narrow central column. Legal: Hollow Bole's torn arch really does top
  out at 4.95 (`W_YC + W_YUP`), and a portal is a MINIMUM.
  **The design, and why it is not done:** the allowance must be a MEASURED
  aperture, not a typed rectangle. Hand-writing "the opening is 4.0 × 4.05" on
  the registry row means fitting the number to the leak, which is how a gate
  gets neutered; and the wound is a radial window on a curved surface, so its
  wall-plane span is not a constant anybody can read off the recipe. The right
  shape is the one the portals already use: the RECIPE knows its cutter loop
  exactly, so it should export the real opening as GLB extras beside
  portalOut, the loader should carry it, and the tool should refuse any SOLID
  crossing outside it (plus a consistency check that the aperture CONTAINS the
  portal). That is a forge-helper + loader + tool change and a re-bake of both
  palettes — worth doing deliberately, not bolted onto this pass.

### T9. The classic three are still code skins — record only
`js/towerskin.js` is a second construction path kept alive for heartwood,
bastion and blackanvil. They work, they are pinned by the classic spec, and
re-baking them through the forge is pure cost until something forces it.
Recorded so "why are there two ways to build a tower" has an answer on
paper; do not spend on it.

### T13. `clearH` is quoted from two different datums — DOCS, and it is a trap
The engine is unambiguous: `towerColliders` puts the lintel's underside at
`v.door.h`, which is `spec.out.clearH`, measured from the FELT. `sillY` is
also absolute. So the height a die actually gets is `clearH − sillY`.

The prose is not. THE MINIMUMS section of docs/TOWER.md argues the 3.375 floor
against "≈2.85 **over the sill**", and calls the old 4.5 floor "~58% more
height than any die ever used" — 2.85 × 1.58 = 4.5, which only works if 4.5 is
being read as an over-the-sill number too. Both readings appear in one
paragraph. Taken literally, a legal spec of `sillY 1.375, clearH 3.375` leaves
2.0 over the sill, which that same paragraph says is under what a lone d20
needs.

Nothing is broken in the field: the floors campaign measured the real engine
whatever the prose said, and Hollow Bole ships `clearH 3.5` over `sillY 1.0` —
2.5 of over-sill height — and delivers clean in every probe and every shipped
pour. So this is a documentation defect, not a physics one. But it is the kind
that ships a bad tower: an author who reads "clearH ≥ 3.375 over the sill" and
raises their sill to 1.375 builds a door 0.85 shorter than they think they
did, and the limits will not stop them. Fix shape: state the datum once, in
the contract, next to the limits; re-quote every number in THE MINIMUMS
against it; and decide whether the FLOOR should be over-sill (in which case
`clearHMin` becomes a function of `sillY` and the validator gains a rule).

### T12. There is no MAXIMUM door width — small, needs a measured ceiling
Found while fixing T2. `TOWER_PORTAL_LIMITS` floors `out.w` at 3.2·S = 4.0 and
never caps it, but the doorway is cut out of the back wall by two flanking
boxes, so the narrower jamb is `TABLE_W/2 − w/2 − |out.x|` and goes NEGATIVE
once `w + 2|out.x| > TABLE_W`. At the 'close' preset (TABLE_W 8.6) with the x
knob at its limit that is `w > 7.1`, against a widest shipped door of 5.0 — so
nothing can reach it and it is filed rather than clamped. Clamping would hand
a player a doorway the modeller never proved, and picking a ceiling by taste
is what the portal FLOORS campaign exists to argue against: the number wants
measuring (at what width does the lintel stop channelling? does a door wider
than the flight envelope buy anything at all?). The inequality is written down
beside the limits in js/main.js so the next person meets it before the bug.

## Tier B — The closed beta (2026-08-14)

Joe: *"I consider the dice towers and the stages to be in closed Beta. I don't
know how to properly hide this from others. Maybe we just require
`?stability=beta` in the URL? I'm okay with something simple."*

**Shipped** (UX §7.38, `js/stability.js`, e2e `stability-gate`): two channels,
redeemed by `?stability=beta` and revoked by `?stability=stable`, persisted
per browser and stripped from the address bar. The gate takes the venue and
tower rows off the Staging destination and drops those two keys from your own
solo settings on restore. **It gates the OFFER and never the CAPABILITY** —
goal 15 forbids anything else, since a client that refused the room's tower
would bake a different film and put different dice on screen from the seat
beside it.

Left open, deliberately:

- **B1. The server does not know about channels, and cannot.** There is no
  identity to attach an entitlement to, so the allowlist still accepts any
  registered tower id from any client. This is a DISCOVERABILITY gate, not a
  security boundary, and calling it one would be the lie. It becomes possible
  the day seats have durable identity (goal 7's later pass); until then a
  determined player can set a tower through the console, which costs nothing
  and tells us nothing we did not already accept when `setTower` became a
  debug hook.
- **B2. Nothing tells a beta tester how to leave.** The revoke link exists and
  is proven; no surface offers it. A one-line "you are on the beta channel"
  row with the stable link in it belongs in Your stuff — but the panel is at
  its measured cap (§7.38: two designs were abandoned this pass for 24px and
  21px), so it costs something else its place. Worth doing when the panel next
  gains room, not before.
- **B3. What comes OUT of beta, and how it is decided.** Towers and venues
  leave the channel when Joe says they are finished; there is no criterion
  written down and no reason to invent one before there is a second beta
  feature to generalise from.

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
