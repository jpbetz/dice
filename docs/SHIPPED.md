# Shipped

Historical detail for work that's landed. Split from
[ROADMAP.md](ROADMAP.md) so the roadmap reads as open work only; nothing
here is a to-do. Cross-referenced from UX.md; commits cited inline.
Section numbers preserved from the pre-cleanup roadmap so incoming links
still resolve.

Ordering is by tier (matches GOALS.md's priority ladder: core mechanics →
organization → secrecy → systems literacy → effects → customization).

---

## Tier G — Game night: the prepared table (2026-08-06)

Design authority: [PROFILES.md](PROFILES.md). Built in one pass against a
fixed date — Joe's *Your Soul Deal* game on 2026-08-13 — so the sequence
was chosen for "playable if we stop here" rather than for tidiness. The
shape the whole tier rests on: **the file is the truth, the room is a
convenience, the link is an address**, which is what let it land without
amending goal 7.

### G0. Pre-flight — SHIPPED 2026-08-06 (`6c7ca9f`)

The two ROADMAP §0i/§0j patches that only cost anything if they are
missing on game day. `package.json` engines went from `>=18` to
`>=22 <25`: the old range let the Cloud Run buildpack pick a new major
silently, *on the deploy itself*. A bare `24.x` was rejected as the fix —
it converts a missing runtime on the buildpack into a deploy-day failure,
whereas the range blocks the silent jump while still landing on 24 (what
the tree is actually tested against) or falling back to 22. Node >=22 was
already a hard floor: the e2e harness drives CDP over Node's built-in
WebSocket.

`uncaughtException` now logs the stack and exits 1 instead of limping on
with half-torn-down streams. Armed under `IS_MAIN` only — the redaction
suite imports server.js in-process and its own failures must not become a
process exit.

### G1. The file door — SHIPPED 2026-08-06 (`e2a3b9d`)

Settings → *Your data* can finally put the rack on disk and take it back:
`#portable-download` (Blob + `a[download]`, reserializing a fresh
snapshot rather than the textarea's scratch text) and `#portable-openfile`
→ hidden `#portable-file`, read with `File.text()`. **Open only fills the
textarea and calls the existing `portablePreview()`** — there is
deliberately no second import path, because preview-then-apply is the
whole safety contract (GOALS §7's `#g=` post-mortem).

Filename is `<slug>-YYYY-MM-DD.dice.yaml`, slug from the table name, else
the `?room=` key, else `dice-table`. Oversize (>512 KB) refuses by name
and size and **disarms Apply**, so a refusal can never leave a stale plan
armed. `__diceDebug.portable = {snapshot, filename, loadText, acceptFile,
maxBytes}`; e2e `file-door` (`bbd69ce`) drives the real picked-file path
through `DataTransfer` because Chrome forbids assigning `input.files`.

### G2. The table file — SHIPPED 2026-08-06 (`b6a0828`)

`js/portable.js` grew `table:` and `players:`, both present-or-absent so
every file that parsed before still parses byte-identically. A player
block **nests `pools:`** rather than putting shelves at the name's depth:
shelf labels are user-authored, so a shelf named `set` or `pools` is
legal, and nesting puts the reserved keys where a shelf can never appear.
The inner block is the same grammar as the top-level one — one shelf/pool
parser, called at two base indents.

Caps: `MAX_POOLS_PER_PLAYER = 40` (top level *and* per profile),
`MAX_POOLS_PER_FILE = 300`, `MAX_PROFILES = 12`. The document cap could
not be both derived and reachable — 12×40+40 = 520, so anything ≥520 is
dead code — so 300 was chosen as a genuine second constraint that names
itself in its error.

**Unknown top-level sections now skip and warn** instead of aborting the
document, closing the forward-compatibility question POOL-ANALYSIS §9 left
open; a top-level line that is not *section-shaped* still refuses, and a
known section's contents stay strict. An unknown section's body is not
examined at all, so a future section written with tabs cannot break the
document the skip exists to save. `#` in a profile name is a line-numbered
refusal (a profile name becomes a display name, and display names are
whisper addresses) while `#` in `tableName` stays legal — the asymmetry
the server already had, now matched rather than quietly diverged from.
Tests 25 → 57.

### G3. Profile authoring — the rack swap — SHIPPED 2026-08-06 (`6adf2d4`)

**The MVP.** An organizer builds someone else's character by loading it
into their OWN rack, so the editor, the ± popover, the spectrum bars and
the §2l dice-value ledger read it **unmodified** — closing the gap
POOL-ANALYSIS §11 named (manage mode forces `poolsOwner = null`, so the
budget read was your-own-rack-only and could not price Alice). Verified
interactively: with Alice's profile loaded, the Attributes head reads
**34** (3d6 + 2d8) and the region figure agrees. *Rejected:*
parameterizing every management surface off `poolsOwner` — wide blast
radius to save one click.

`#portable-profiles` lists the file's `players:` with **Edit** and **Save
to** per row, plus *Save as new profile*. `#profile-banner` is sticky
above the pools head for exactly as long as a swap is live, and the
category heads yield their sticky pin to it (`#groups-list.profile-editing`
makes the same call `#pools-head.foreign` already makes).

The guardrails are the feature:

- the operator's rack goes to `dice.groups.mine.v1` and **the write is
  read back and verified before `groups` moves** — unverifiable storage
  refuses the swap rather than proceeding;
- `publishPools()` no-ops while a profile is loaded (one egress, so it
  covers the debounce, hello-join, silent-rejoin and debug paths) —
  otherwise every teammate's owner switcher would show Rill's pools under
  Alice's name;
- a **reload restores the operator's own rack** and drops the editing
  state. Deliberate, of the two the design allowed: the banner and the
  file text do not survive a reload, so booting with a profile still in
  `dice.groups.v1` would be someone else's rack under your name with
  nothing on screen saying so — the `#g=` codec's exact failure;
- `Save to` rewrites the **text**, never the disk, and files carrying
  skip-and-warn'd unknown sections are read-only to both verbs, because a
  rewrite would drop what the parser deliberately did not read.

e2e `profile-swap` + `profile-swap-reload` (`76c5e55`). A second tab
booting mid-edit consumes the localStorage stash, which is safe:
`portableDoneEditing` prefers the in-memory copy.

### G4. The room setup key — SHIPPED 2026-08-06 (`326f1cd`)

`POST /api/table` → `room.setup = {rev, table, profiles, at}`, echoed
present-or-absent in `/api/join` and `hello` (so unprepared rooms stay
byte-identical on the wire) and broadcast as `table-setup`. Settings ride
the **existing** validator and echo — `validateSettingsPatch` +
`commitSettings` were factored out of `/api/settings` and shared, so a
setup push fires the same `settings-changed` every other settings write
fires. Profiles go through the existing `sanitizePools` and `cleanName`.

**Anyone may push it** (goal 10); last write wins, guarded by a monotonic
`rev`. A stale push is a *silent no-op returning the winning rev*, not a
409 — `net.js` turns every non-404 into a player-visible toast, and the
loser of a two-tab race (or of §G6's re-push-on-hello, which races by
design) did nothing wrong. Caps refuse (`bad_profiles`, `bad_pools`);
unusable records drop (empty `cleanName`, duplicate names, unparseable
notation). e2e `table-setup-wire` (`f0ba179`) drives it over raw HTTP+SSE
with no client in the path and checks the setup **bytes** for `values` /
`rollId` / `total` / `visibility`, because `projectEntryFor` must remain
the only egress a roll entry ever takes.

### G5. The seat picker — SHIPPED 2026-08-06 (`8f89fd4`, `71b5d53`)

CUJ2: one link, six people, each at the right table under their own name
with their own pools.

**The ordering problem, and §2k closed as a side effect.** `initNet()`
awaits `promptName()` *before* `connect()`, so when the modal is on
screen the client has not joined and cannot know the room's setup. Solved
with **`GET /api/table?room=`** — public, read-only, no `playerId`,
returning `{name?, seats?:[{name, pools}]}` and `200 {}` for an unknown or
unprepared room. Projected field by field: no roster, log, offers,
notations, `rev`, or settings beyond the table name; uses `rooms.get`, so
a peek never creates a room and never disturbs a linger TTL. That is
exactly the pre-join peek ROADMAP §2k wanted for showing a table's name.

Prepared seats render in `#seat-list` above *Someone else…*, which keeps
today's free-text path verbatim. Choosing one takes the name and joins,
then shows the **existing** preview (`✓ 1 new · 2 updates — Apply takes
them`, the shared verdict grammar) with `#seat-apply` / `#seat-skip` — and
**applies nothing until that click**, which is the assertion the whole
design turns on. `&as=Name` pre-selects case-insensitively and does
nothing else; an `as=` naming no profile is ignored silently, so a stale
link cannot break a join. `inviteUrl()` is unchanged: one link for
everyone stays the primary form.

**Fixed in the interactive pass (`71b5d53`):** both phase panes rendered
at once. This stylesheet has no global `.hidden` utility — every element
carries its own `#id.hidden` rule — so the markup's bare `class="hidden"`
styled nothing, and Apply/Not now sat under the seat list while you were
still choosing. The logic was correct throughout, which is why the e2e
missed it; `prepared-seat` now asserts computed display in both phases.

### G6 (server half). The room TTL — SHIPPED 2026-08-06 (`2802197`)

`dropRoomIfEmpty` deleted a room the instant its last player left — so an
organizer who set the felt, named the table and built six seats lost all
of it by **walking away**, no restart required. That was the most
surprising gap in the audit and the one this tier most exists to close.

A room holding a `setup` now lingers: `log`, `offers`, `collectSeq` and
`colorCursor` clear (per-session), `setup` and `settings` survive
(per-preparation — the organizer chose that felt deliberately), and an
`unref()`'d timer deletes it for real at `SETUP_TTL_MS` (12 h, overridable
by `DICE_SETUP_TTL_MS` at boot, which is how the e2e tests it in seconds).
A join cancels the timer through `getRoom`.

**At `MAX_ROOMS` a new room evicts the oldest linger** — a
prepared-but-empty room must never be why a group can't sit down, and
without it a join-push-leave loop over 500 names could squat every slot
for 12 hours. e2e `room-linger` (`8d5a001`) polls the server's own log,
since a room lingering has no wire surface by definition.

### G6 (client half). Re-push on hello — SHIPPED 2026-08-06 (`0de9873`)

The organizer's browser is the durable copy, so a room that has lost its
setup heals as soon as an authoring tab reconnects. `dice.table.v1:<room>`
is written in exactly **one** place — a push the server *applied* — and
re-pushed on every hello (plus once post-join) when the room's `rev` is
absent or lower. G4's silent-no-op-on-stale rule is what makes this safe
to fire unconditionally.

The counterpart is what keeps it honest: **a player who merely joined
holds no authorship record** (`stored: 0`) and can never re-push a setup
they did not author. G4 landed no client push origin, so this slice also
added `#portable-push` ("Apply to table") as the one place a setup is
pushed from.

e2e `setup-repush` (`77c20a0`) tests the real path rather than a
synthetic one: everyone leaves, the room lingers, the TTL expires it, and
the organizer's tab reopens on the same origin — which is what a server
restart looks like from the client's side. It pins that the heal restores
the felt as well as the seats.

---

## Presence: departure is said out loud (2026-08-06)

**Shipped (`5888a87`).** Reported from the live table: "when players leave
their names are staying around forever." They were — but only in
production, which is why nothing caught it. Locally a closed tab reaps in
5 s and the e2e suite proves it. Behind Cloud Run's front end the
container never sees the close, its writes keep succeeding into the proxy,
and `clients.size` never reaches 0 — so no grace was ever armed and the
seat sat there until the platform force-closed the request an hour later.
The deployed logs said it plainly: `players=4` with one real window open,
no `left` lines since instance start, and `/api/events` latencies of
exactly 3601 s. [DEPLOY.md](DEPLOY.md#the-front-end-hides-departures-2026-08-06)
carries the operator's version.

The defect underneath was a design one, not a Cloud Run one: **presence
was inferred from a socket**, and every socket signal we had describes our
connection to a proxy, not the player's to us. Two layers replace it:

- **`POST /api/leave`** — a `pagehide` beacon, so the common case costs
  seconds instead of an hour. It names the stream it is leaving, which is
  the whole reason a reload survives it: a refresh fires the *identical*
  event, and only the id distinguishes the beacon of a dying page from the
  stream its successor already opened. `seat-resume` (no `player-left`
  churn across a refresh) is the standing guard on that. 'Leave & switch
  seat' passes `immediate: true` and gives the seat up at once.
- **`POST /api/pong`** — the heartbeat became a *question*. `': ping'` was
  an SSE comment no client could ever see, let alone answer; it is now an
  event the client answers, and a stream that stops answering is dropped
  regardless of what the socket claims. A pong for a stream the server no
  longer holds answers `unknown_stream` — the one way a deaf client
  (swept, evicted, or restored from bfcache holding a connection the proxy
  kept warm) is ever told to reopen.

Best-effort and backstop, deliberately layered: a beacon cannot be
awaited, confirmed, or relied on (crashes, killed tabs, dead networks skip
it), so the sweep is what actually closes the hole. Streams that carry no
`streamId` are exempt from staleness — a client cached from before this
cannot pong, and reaping it would loop it through a new seat and colour
every liveness window; it keeps today's behavior and heals on its next
reload.

Covered by `tests/presence.test.mjs` (11 protocol cases, clocks shrunk via
`DICE_HEARTBEAT_MS` / `DICE_LIVENESS_TIMEOUT_MS`) and the
`seat-closed-tab` e2e (a real tab closes, a real roster empties, and the
log still carries the departed player's roll — history is not presence).

## Tier 0 — Performance & foundation (2026-08-04 audit)

Bench + review pass 2026-08-04 (perf-audit workflow, 4 empirical benches
under `tools/drive.mjs` × 4 hot-path code reviews × adversarial
verification; the measured baseline is pinned in
`.claude/…/memory/perf-baseline.md`, so future changes have a
before/after). Findings sequenced by **impact** — player-felt magnitude ×
frequency.

### 0a. The roll-arrival pass A+B — SHIPPED 2026-08-04

**Shipped (2036b9b, 3ed606d):** Per-die settle + SAP broadphase. A landed
die now freezes to STATIC mid-sim without waiting for the group's slowest
sibling — kills the group-clock reset that made one twitching die drive
the whole roll to the 9 s cap. SAP broadphase retires the O(N²) shelf tax
(`js/main.js:446`); verified against a new `perf-determinism` cross-client
keyframe-hash e2e (1d20, 8d6, 20d6 — bit-identical across clients under
seeded throws). Bench after A+B: `8d6-loaded` collapses from ~139–349 ms
baseline to ~117 ms max longtask (under the 150 ms budget); large mixed-
die rolls (10d20 + 10d12 + 10d10 + 10d8) still hit the SETTLE_CAP at 540
frames — Commit C (§0a in ROADMAP.md) is still needed to close the
invariant for that class.

### 0b. Boot & bandwidth — bulk SHIPPED 2026-08-05

Three wins landed in the Tier 0 big pass (workflow `wf_707277c0-0ee`):

- **LOG_CAP=100 (`747acf5`).** `server.js` LOG_CAP halved from 200 to
  match the client's `MAX_LOG_ENTRIES=100` ceiling (js/main.js:44).
  Every hello had been shipping ~50% dead weight the client discarded
  on arrival — zero protocol change, immediate ~50% payload cut on
  reconnects.
- **304 revalidation for statics + immutable /vendor/ (`6ebd3e0`).**
  `streamFile` now compares `if-modified-since` to `stat.mtime` and
  answers 304 when unchanged. `/vendor/` files (three.js, cannon-es —
  never edited by rule) additionally ship
  `Cache-Control: public, max-age=31536000, immutable`. Browser
  reload pre-fix: 1,619,828 bytes re-transferred every load; now
  those turn into 304s.
- **Drop per-viewer dice-array clone in projectEntryFor (`b526572`).**
  Shrouded projection cloned the whole dice array per viewer even
  when the shroud logic left the array untouched. Aliased when the
  projection is byte-equal, only clones when actually diverging.
  Small serialization win amplifies at 40-player caps.

**Deferred/killed** (see ROADMAP §0b): delta hello over Last-Event-ID
(F3, 2 blockers — secret rollId leak in `retained`, executeRoll
never stamps roll birth with seq) and memoize projections + JSON
payloads per broadcast (F4, Map-identity precondition unmet).

### 0c. GPU idle discipline — SHIPPED 2026-08-04 (`84c1074`)

**S3, closed.** The gate now mirrors `collectShimmerSources` and excludes
shelved bloom dice from the wake predicate; `PostStack.render` brackets
`renderer.shadowMap.autoUpdate = false` between the base and glow renders
(one shadow-map pass saved per stack frame). Bench after fix (same
headless reproducer as the audit): 4 bloom dice shelved on an empty felt
drops from ~905 µs/frame to ~538 µs/frame — ~370 µs saved per frame,
`postInfo.active` observable flips false. Level 5 bypass equivalence held
(empty table renders the released direct path before roll AND after
clear). New `postInfo().bloomDiceLive` (felt-only) drives the gate;
`bloomDice` (felt+shelf) kept for pin compat. Extended `themed-post` e2e
pins the observable. Verified adversarially — reveal, whisk, hello-resync
and shelved-die reveal-in-place all funnel through `shelveRoll`, and the
gate exemption keys on `shelfClusters.has(d.rollId)` (race-free —
`shelveRoll` sets the cluster before any tick could read the state).

The findings, for the record: after collect the table's resting state has
40+ dice sitting on the shelf. `js/main.js:3671` gated the post pipeline
on `tableDice.some((d) => d.mesh.userData.bloom)` — and `tableDice`
includes shelved dice (compare `js/main.js:3687` where shimmer explicitly
excludes the shelf). Any of the six glowing sets (tidewrack, stormcall,
rimehold, emberforge, arcanum, umbra) kept the full bloom stack — mask
render + threshold + 4 blur passes + composite, plus a second full 2048²
PCFSoft shadow-map render — running every frame the archive was on
screen. Headless: 1658 µs/frame with 4 bloom dice on the felt vs 1104 µs
stripped (+50%); 1199 µs with all four shelved. Felt as fan noise /
battery drain on laptops, dropped frames on integrated GPUs — never a
hitch, hid forever.

### 0d. Server hygiene — bulk SHIPPED 2026-08-05

Six landed in the Tier 0 big pass:

- **endStream forces socket teardown (`052c92b`).** Eviction/dead
  paths now `res.destroy()` (not `res.end()`) so buffered data frees
  immediately and the socket-close event fires deterministically to
  trigger the reap path.
- **Centralize non-onClose stream drops through `dropStream()`
  (`d8ca535`).** Four places previously dropped a stream from
  `player.clients` without going through onClose, so the reap
  scheduler never fired. `dropStream(res, player)` is the single
  point that removes AND schedules reap.
- **30s TCP keepalive `initialDelay` (`96f7714`).** SSE sockets get
  `setKeepAlive(true, 30_000)` so a dead TCP peer is noticed in ~30s
  (default is 2h). Combines with the heartbeat + backpressure work.
- **MAX_PHYSICAL_DICE=40 citation (`d14697c`).** No-op audit trail
  above LOG_CAP capturing why bounds are what they are (physical
  constraint: 40 dice per player).
- **Gate high-volume server logs behind `DICE_LOG_LEVEL` (`759c31e`).**
  Chatty request/broadcast log lines now gated behind
  `DICE_LOG_LEVEL=debug`. Default `info` is quiet enough for Cloud
  Run logs to stay readable at low room counts.
- **Quote user-derived values in setting log lines (`2570088`).**
  User-supplied strings (tableName, playerName, notation) now
  JSON.stringify-wrapped in log lines, closing a log-injection hole
  where a name containing `\n[worker] ` could forge log rows.

**Deferred/killed** (see ROADMAP §0d): SSE stream eviction on write
buffer (128 KB threshold below realistic hello worst case), HttpOnly
cookie for playerId (multi-tab identity swap; TLS-behind-proxy
detection inverted), in-process token-bucket rate limits
(clientIp collapses under Cloud Run proxy; 429 on /api/events
triggers stream storm), strict security headers (blocks the
importmap and lab.html inline modules), SSE stream cap per IP
(counter leak with existing early-delete), global player cap
(undefined `totalStreams`), coalesce settings broadcasts (throttle-
vs-debounce prose mismatch), /api/pools rate limit (undefined `i`
in patchSketch).

### 0e. Endurance leak — bulk SHIPPED 2026-08-05

Eight targeted fixes landed in the Tier 0 big pass:

- **Delegate log ⟳ + append-plus-prune #log-list (`7083467`).**
  `renderLog()` had rebuilt the whole flyout on every roll arrival
  and rebound one click closure per row. Now uses one delegated
  listener on `#log-list` keyed by `row.dataset.rollId`; new rows
  prepend and old rows prune from the tail. Behavior change:
  incremental append preserves scrollTop so a user reading history
  isn't jerked to the top by every arrival.
- **Clear roll-dice outline whenever banner hides (`4f75851`).**
  The card-hover outline anchored on banner mouseenter/mouseleave,
  but sites that hid the banner without a mouseleave (new roll
  spawning, auto-collect, clearRoll, resetTableSurface, banner-main
  click) stranded per-die MeshBasicMaterial + scene-graph children
  forever. Route every hide through `hideBanner()`. New
  `endurance-outline` scenario asserts `outlinedCount === 0` after
  60 rolls.
- **Cluster marker as sinking record (`b2bbdbe`).** Sink cleanup
  relied on a die's chip ref to find its marker; when the marker
  belonged to a whole cluster (not any single die), the ref was
  lost. Now each cluster marker sinks as its own record.
- **Lazy DecalField atlas + mesh construction (`856794f`).** The
  decal atlas + mesh warmed at boot even though
  `DECALS_DEFAULT_ENABLED = false` (Joe kept the kill switch on).
  Now warms only on first `decalsEnable(true)` call. Zero cost while
  the switch stays dark.
- **Persistent Reveal/Reroll banner buttons (`538c471`).** Action
  buttons on banner + verdict fold rebuilt per render; now mount
  once and toggle visibility. Kills per-render listener churn.
- **Reuse one persistent felt CanvasTexture (`b752395`).** The
  felt-mat canvas + CanvasTexture were being allocated on every
  shelf repaint; three.js `Texture.dispose()` never called, so
  GPU-side texture handles accumulated. Now one persistent
  CanvasTexture, redrawn in place.
- **Pool shimmer sources + reuse PostStack V2 scratches (`21e3b10`).**
  Every frame allocated a fresh array of shimmer source records and
  a fresh Vector2 scratch for PostStack.setShimmer. Now pooled at
  module scope.
- **Hoist positionChips/positionShelfMarkers scratch V3s (`130e813`).**
  Vector3 scratches allocated inside per-frame loops. Moved to
  module scope.

**Deferred/killed** (see ROADMAP §0e): bound rollStates by deleting
cleared entries (breaks Enter/Esc on cleared rolls via
`lastRollActionable`), drop stagedVerdict on new roll (redundant with
`dismissCeremonyUI` + kills refreshRevealSurfaces repaint), skip
world.addBody for shelved dice (crashes resetTableSurface's
unguarded `removeBody`, violates physics-truth invariant at
:1071-1075), dedupe renderPeek (snap misses entry.dc, entry.dice,
entry.playerName), gate __diceDebug on __diceTestMode (mechanism
claim false — ES module module-scope state pinned by module
registry, not by __diceDebug getters; removes decalsEnable(true)
diagnostic surface Joe uses).

### 0f. The seat survives a refresh — SHIPPED 2026-08-04

**Closed.** "When I refresh my browser, the player pills show two players
with my name briefly… my color changes on the reload instead of being
preserved." One cause, both symptoms: `/api/join` minted a new
`crypto.randomUUID()` seat on **every** page load and took the next
`colorCursor` hue, while the abandoned seat lived on until its stream
close reaped it `DISCONNECT_GRACE_MS` (5s) later. Every refresh was a
*stranger joining* as far as the room was concerned.

- **The tab remembers its seat** (`js/net.js`,
  `sessionStorage['dice.seat.v1:<room>'] = {id, color}`) and offers it
  back on join. `sessionStorage`, not `localStorage`, is the whole
  design: it is scoped to the browsing context, so a reload resumes
  while a SECOND TAB is genuinely a second player — which is what a
  shared screen expects, and what the e2e harness relies on when it
  seats several tables against one origin.
- **`/api/join` RESUME** (`server.js handleJoin`): a known seat id in a
  live room sits back down — same `playerId`, same color, same snapshot,
  and **no `player-joined` broadcast**, so no other screen blinks. The
  id IS the credential (every mutating POST already carries it alone),
  so holding it is authority enough; an id the server has no record of
  is never adopted, it falls through to a fresh seat. Resume runs AHEAD
  of the entity caps: it adds no player, so a FULL room must still let
  its own players reload.
- **`scheduleReap` never shortens a pending grace.** A refresh races two
  timers — the dying tab's stream close (5s) can land after the new
  tab's join has asked for the full `JOIN_GRACE_MS` (60s), and the
  shorter one would reap a seat that is mid-resume.
- **Color is a preference, not a claim.** A seat that lapsed entirely
  (grace expired, server restarted, room recycled) asks for the hue it
  wore; `keepColor` honors it when it is a real palette entry and
  nobody in the room is wearing it, otherwise the round-robin cursor
  answers — and the cursor only advances when it is the one that
  answered, so an honored request never burns a hue. The silent
  re-join path carries the preference too, which is what keeps a
  color across a server restart.
- **`forgetSeat`** is the difference between LEAVING and reloading:
  'Leave & switch seat' drops the remembered seat (by room name, so it
  also clears one left by a solo boot) or the fresh join would resume
  the player who just left.

Covered by `seat-resume` (tag `seat`): same id + color across a real
`Page.navigate` reload, a watcher's raw SSE stream seeing **zero**
join/leave/rename events across it, exactly one Alice on every roster,
the resumed seat still rolling under its own name, a second same-origin
tab still a separate player, leave clearing the seat, and the color
preference honored when free / refused when worn.

---

### 0g. Hot-path polish — SHIPPED 2026-08-05 (new)

Three of the per-frame allocations + O(N²) loops that the fresh hot-
path scan surfaced (the other three landed under §0e since they were
allocation-leak fixes as much as hot-path fixes):

- **byId map in renderLog (`5c9cc8f`).** `renderLog()` was doing
  O(N²) reverse-copy + N linear lookups per arrival. Build the byId
  map once, drop the reverse copy.
- **stepPlayback per-frame forEach → index loop (`7ccfe81`).** Saves
  one closure allocation per frame per die under playback.
- **Hoist banner-cell DOM lookups to module scope (`75051d4`).**
  `document.getElementById()` on hot banner-update paths hoisted to
  module init.

Companions under §0e (same cross-cutting concern, listed there):
`130e813` (positionChips/shelfMarkers scratch V3s), `21e3b10`
(shimmer sources + PostStack V2 scratches), `b752395` (persistent
felt CanvasTexture).

**Deferred/killed** (see ROADMAP §0g): replace bloom-live scan with
felt-bloom counter (missing seams in resetTableSurface/shelveRoll
branches), track live range in Particle/DecalField
(BufferAttribute.updateRange deprecated in vendored three.js r160;
replacement addUpdateRange allocates {start,count} per call and
breaks the allocation-free claim).

---

## Tier 1 — Core mechanics landings

### 2. Interpretation system profiles v2 — SHIPPED (through 2b–2i)

`meanings.js:94-108` declares the v2 profile interface (`aggregate:
'per-die' | 'sum'`, `usesTotal`, `usesMods`, `outcomesFor`, `meaningFor`,
crit predicate). Soul Deal reads per-die against the chart's rank
columns; dnd/none keep their sum/total behavior. Result surfaces (banner,
verdict, peek, log rows) all read through the profile via §2i A's
`renderOutcomeRows`. Success counting is a straight per-die profile away
when a table needs it. The 2026-07-31 pre-revision natural-crit gate and
its unit tests were superseded and replaced.

### 2b. Multi-pool rolls & pool groups (goal 6 + goal 5)

Soul Deal play composes a roll from SEVERAL pools (attribute + skill +
motivation); Joe wanted this semi-generic — useful under every system.

Build order shipped 2026-07-31 (`7740f30`, `d092e84`, `4d1b67a` + the
source-read commit):

- **Dice-term attribution in notation** (foundation; preserves notation
  totality): `3d6[Strength]+2d8[Swords]` — attributed DICE terms,
  mirroring the existing `+2[Proficiency]` modifier grammar. Parser,
  canonical form, rollspec perDie `source` label, server re-parse,
  codec.
- **Pool categories**: saved pools gain an optional group ('Attributes',
  'Skills', 'Motivations'); the Pools panel renders category sections;
  manage mode edits the category; every carrier takes it present-or-
  absent.
- **The Pools Rack** (agreed with Joe 2026-08-01): sources add, the pool
  rolls. Pools render as TILES in category-section grids; tapping a
  tile STAGES its dice into the sticky draft cluster (source chips, one
  ✕ each; loose palette dice keep per-type ✕); ONLY the draft wears
  gold/the ROLL cue. Digits stage by rendered order; Enter rolls the
  draft when one exists (else keeps the last roll); Esc clears it (else
  sweeps). Sticky section headers, fixed trio order
  (Attributes/Skills/Motivations, others, uncategorized). Owner
  switcher: players' pools publish to the room
  (name+notation+category; localStorage stays owner truth); foreign
  lists show a standing 'BOB'S POOLS · read-only' banner-chip (also the
  way back), stage-only (no ±/manage), drafts persist across switches,
  chips snapshot notation at stage time, digits always act on YOUR
  pools. Staging a modded pool sets +N/dc aside with a one-line whisper
  on its chip. First stage from the hover flyout promotes it to the
  pinned panel.

Racks publish via `/api/pools` ('pools-changed', display copy —
localStorage stays owner truth), and attribution rides `spec.sources` on
the wire (present-or-absent; redaction drops spec wholesale, so hidden
rolls stay hidden). Breakdown, tally and log group per pool; rerolls
keep their labels (sources join the canonical and ride the notation
shape — the same single-carrier rule as visibility).

### 2c. The Sheet Pass — SHIPPED 2026-08-01

Editing un-bolted (designed by a 4-design judge panel; UX.md §7.9
records the full contract): the pool popover grows an identity strip
(rename in place, shelf chips, die-rank ladder fail-closed to NdX);
ghost '+' tiles end every shelf (creation card, newborn contract, the
shelf IS the category); the save morph gains shelf chips; manage mode
slims to the destructive gate (standing bar + grown ✕, per-tile ✎
retired); the notation card slims to the complex-pool escape hatch.

### 2d. The Trigger Pass — one way to roll — SHIPPED 2026-08-03

From Joe's 2026-08-03 play notes; refined the 2b/2c surfaces while they
were fresh, and settled where offers live *before* targeted offers (4b)
built on that surface. UX.md §7.10 records the contract: popover = pure
editor (tray live-syncs into the box canonical; group commits with ONE
Save by id + Duplicate…; shelf goes Open in draft); Offer lives on the
draft row, hidden solo; the identity strip composes counts like the
creation card (pure-dice pools, last-die guarded, 40-cap); per-die
tables fold the sum-world sections behind 'Show anyway'; the result
banner and offer cards hold fixed geometry. The original brief:

- **One roll trigger.** The ± popover loses `Roll` and `Offer to table`;
  every roll and offer fires from the draft's ROLL ❯❯❯ strip. The
  popover becomes a pure editor — tweaks land in the draft (or write to
  the saved pool), never roll directly. Extends the staging inversion
  to its last holdout.
- **One commit verb.** Editing a pool shows both 'Update this pool' and
  the save morph side by side — confusing. One primary Save that writes
  by id; additive twin demotes to explicit 'Duplicate…' or leaves the
  edit flow.
- **Count editing composes.** Identity strip's die-rank ladder swapped
  rank only; Joe expected the creation card's idiom (tap palette dice
  to add, tap preview units to remove). Same composer for pool editing
  everywhere.
- **Hide non-applying mechanics.** Under a per-die system (Soul Deal)
  the ± popover still rendered sum-world controls (keep/drop, DC, mods)
  with a note; hide them behind a small disclosure so they stay
  reachable.
- **Layout stability.** Tiles change height with long names, ROLL ❯❯❯
  strip resized when a ×2 chip appeared. Fixed tile geometry (clamped
  two-line names), reserved multiplier space, constant-width action
  strips — ambient chrome never jumps under state changes.

### 2e. Result-card IA under per-die systems — SHIPPED 2026-08-03

The reveal/result surface accumulated per-die outcome chips, the tally,
the hero word, and the action strip — nearly all of it *needed* under
Soul Deal, but muddled as a layout (Joe, 2026-08-03). UX.md §7.12: the
diagnosis was DUPLICATION at equal weight — the tally line and the
breakdown line repeated the same source labels, and reading which die
said what meant cross-referencing the two. The fix is ONE structure:
each pool is a ROW — label leading, then one chip per die [dX face →
tier-colored outcome word]. The word answers, the face is evidence
beside it; the separate breakdown line folds wherever rows stand
(banner, verdict card, peek — log keeps its compact line). The verdict
ring stops showing the dice-count-as-total (the exact confusion); under
per-die its center is empty and the rows are the verdict. The text
layer keeps the whole story row by row for copy/paste and screen
readers.

### 2f. The Workbench + reroll clarity — SHIPPED 2026-08-03

Ultracode draft-zone pass (judged 3-way design panel): the draft became
a WELL over a RAIL — the well wears the same recessed dress as the
notation box (one draft, two editors, both finally looking like
editors) and holds the ± inside it; the rail's verbs (Save · Offer ·
✕ Clear) STAND while a draft exists instead of hiding behind hover
(UX.md §7.14). Reroll clarity rode the same pass: exactly ONE clear
affordance per collected roll chosen by the opening gesture (§7.15),
every replay trigger says REROLL ❯❯❯ (the draft keeps plain ROLL), and
the log carries server-substantiated reroll provenance — `rerollOfId`
gated AT BIRTH by `entryExistsForAll`, so a reroll of a secret roll is
recorded as a plain roll and no existence oracle forms; the newest row
wears a quiet 'reroll' chip, the superseded row 'rerolled'. Verified
same day: the two-lens fleet (suite runner 47/47 ×3 + adversarial, 3
confirmed findings fixed) and the pre-release sweeps after (49/49).

### 2g. The beacon pass — the draft well goes further — SHIPPED 2026-08-03

Same day as Joe's cleanup batch (UX.md §7.11b): the FEED (two
converging gold funnels, shapes not words, framing the workbench so the
palette above and pools below visibly pour into the well), stepped heat
(the funnels brighten, the well gains its gold under-glow, the standing
ROLL whisper gathers toward 0.55 as dice land — light and depth, never
size), the FOLDED CARD (banner's body is the one big removal target
with a red ✕-watermark dress — slate for a spectator's dismiss — and
the fold below holds REROLL/Reveal untinted), and the HOVER READ
(inverted-hull WebGL outlines on the roll's dice, one color per source
pool).

### 2h. THE SIDE PANEL — the felt owns zero standing chrome — SHIPPED 2026-08-04

Joe's call, iterated live: Pools panel is a dedicated layout COLUMN,
not an overlay — one vertical divider (also the collapse control), the
canvas sized beside it (refitView / `--table-left`; every projection
went felt-rect-relative and felt-anchored overlays re-center over the
felt), no "Pools" title. The rail split into the panel: presence on top
(status · roster · you), utility verbs at the foot (❯ ≣ ⚙ + contextual
✕ Clear table, which left the felt corner); their menus still drop as
overlays. Collapsed = a slim icon rail with a SUPER-MINIMAL quick list
(named pools as vertical names alone, unnamed as die chips alone, tap =
roll directly, zero edit chrome); the hover flyout retired. NEUTRAL
graphite dress — the dice themes carry the color, gold survives only on
roll verbs, and the draft well wears the one warm bronze surface with a
larger balanced ❯❯❯ ROLL ❯❯❯ cue (Joe: the outer brown looked like a
dirt hole; brown/gold lives inside the tray only). The rack's owner row
gained air so 'You' reads as the rack's header. e2e: side-panel (tags
`smoke`,`chrome`,`groups`) replaces pool-flyout; control-rail asserts
the split; stills in tools/out/side-panel/.

### 2i. THE SOUL DEAL AUDIT — reveal read, chrome consistency, material, labs — SHIPPED 2026-08-04

All six families shipped same day (UX.md §7.16 records the as-built
laws; only E's `no-newcomer-path` stands open, by design — Joe owns the
orientation direction).

Joe asked for a UI audit of the left panel, the reveal panel, the
collect peek, and the check/cinematic screens under Your Soul Deal,
with multi-pool flow ("I find some of the presentation difficult to
parse… consider a table?"). 21 stills + a 5-lens adversarially-verified
review (33 findings survived, 2 refuted). Stills + the ledger prototype
pairs in `tools/out/souldeal-audit/` (scripts committed 943a949:
`souldeal-audit-shots.mjs`, `souldeal-ledger-proto.mjs`; full findings
JSON sits beside the stills). Severity S1–S5; each finding kept its
audit id.

**A · The reveal read (banner · peek · verdict share renderOutcomeRows) — the LEDGER family. `2631702`**:
the grid ledger (oc-ledger label spine, per-pool .oc-cell hanging
indent), layout-owned chip gap with the copyable space kept, the
exactly-once silence rule (in-chip dash beside worded dice, one
restyled 'quiet' for an all-quiet pool), header demoted to a wrapping
identity caption, oc-solo hero scale for one-die rolls, reduced-
strength tier borders, and B's ring fold rode along (a hidden roll
keeps the ring as its face-down stage). Pinned by the `ledger-read`
e2e. The findings as audited:

- S5 `chip-fusion` — `.oc-chip` is inline-flex, so the whitespace box
  between die evidence and word collapses ("d6 1Fail"). The pixels lie
  while copy/paste stays correct.
- S4 `rows-center-independently-no-shared-column` — every outcome row
  centers itself; the label column exists in intent, not geometry.
- S4 `row-wrap-orphans-worded-chip` — a wrapped chip carries no label
  and no hanging indent; the orphan can be the pool's ONLY worded die.
- S4 `quiet-grammar-three-ways` — silence rendered three ways.
  ADJUSTED by doctrine verifier: in-chip mark mandated by text-layer
  rule; "quiet" STAYS in the answer slot (§7.9), fix its weight only.
- S3 `notation-header-duplicates-rows` — the loudest line repeated
  what the rows said, wrapped inside `[PEER RESPECT]`, ellipsized on
  the peek. Demoted to a quiet identity caption; rows are the data.
- S3 `one-die-answer-not-hero-scale` — a one-die Soul Deal roll (the
  common case) rendered its whole verdict as one 15px word where dnd
  showed a 52px gold total.
- S2 `card-chips-ignore-tier-border-felt-teaches` — felt's value chips
  tier-color their borders; the card chips directly above didn't.
  ADJUSTED: apply at reduced strength.

**B · The ceremony cards. `0ef95d5`; ring fold in `2631702`**: intent
card speaks its pools (spec.sources through canonicalNotation), the
verdict action row joins the rest-dim grammar (the last invisible→
visible holdout), chips keep lowercase mono under the hero dress, and
the hero's flanking hairlines fold under rows (as generated content
they'd have joined the ledger grid as stray items and sheared the
label column).

- S4 `empty-verdict-ring` — under Soul Deal the verdict ring was a
  giant empty gold circle: main.js ~L3397 set the center to `''` while
  its own comment promised "the outcome count… so the ring stays a
  stage, not a lie". A16 still shows the card with ring folded and
  ledger as its center.
- S4 `intent-card-drops-pool-names` — renderIntentCard (~L3317)
  omitted `spec.sources` from canonicalNotation, so the declaration
  read "2d8+1d10" where "Wisdom + Sword" was the stake.
- S3 `verdict-actions-invisible-at-rest` — verdict card used the
  invisible→visible grammar the folded card retired; banner/peek rest-
  dimmed instead.
- S2 `verdict-uppercases-shared-chips` — inherited text-transform made
  shared chips shout ("D8 5 PARTIAL SUCCESS").

**C · Action grammar & control consistency. `d8673b1`**: verdict fold
builds through appendCardActions (one codepath; strip rerolls THIS
card's entry), one confirm-weight Reveal dress sized by surface, three
visibility CODES (disabled = grayscale drain; rest stays 0.45; absent =
explicit display:none), destruction hovers RED everywhere (✕ Clear
table's gold hover gone), the steel-hover law unscoped app-wide with
the log ⟳'s gold written down as the density exemption, and the draft
✕ anchored inside its chip.

- S4 `three-button-families-two-codepaths` — verdict card's icon row
  (static markup in index.html) vs banner/peek's body-click-to-clear +
  REROLL strip (built by appendCardActions): a design split that was
  also a code split.
- S4 `reveal-verb-three-dresses` — Reveal wore gold primary on banner,
  10px chip on peek, plain ghost on verdict card.
- S4 `rest-dim-reads-as-disabled` — resting reveal-tier opacity was
  numerically the disabled dress. ADJUSTED: three states three codes.
- S3 `clear-family-five-dresses-gold-hover` — clear/destroy wore five
  dresses, and ✕ Clear table (most destructive) invited with GOLD
  hover.
- S2 `done-word-three-meanings` — Done was three controls in three
  dresses. ADJUSTED: unify dress and hover; role-split semantics stay.
- S2 `steel-hover-law-stops-at-panel-edge` — neutralization was scoped
  to #left-panel; verdict Done/⟳, banner Reveal-ghost, log Clear and
  corner pill hovered gold. Unscoped; log per-row ⟳ written down as
  density exemption.
- S1 `tray-x-floats-between-chips` — proximity ✕ rendered in gutter
  between adjacent pool chips.

Proposed rule set: ONE DRESS PER VERB sized by surface · THREE
VISIBILITY STATES, never invisible-interactive · HUE = ACT globally
(gold rolls, red destroys, steel tools).

**D · Panel material — stone/bronze vs steel/silver answer. `531360d`**:
Scheme C — steel got its body (gradient + bevel + seat shadow on
palette tiles, pool tiles, the rim), column's muted tier re-tokened
cool (#99a1a9, tray re-warms its own token on purpose), bronze-bleed
balance swept with C's hover-law pass (confirm borders ivory, pool-
name hover ivory; the ± editor-open rings stay bronze — the ± belongs
to the roll world, §7.14.1).

- S3 `material-scheme-recommendation` — neither temperature swap:
  stone/bronze narrowed tray-vs-column contrast 2h just built; steel/
  silver split the app into two temperature worlds and fought ivory
  type. Scheme C wins: keep graphite/bronze, make the steel REAL.
- S3 `steel-has-no-body` — outside the tray, "steel" was flat
  translucent white over graphite: no gradient body, no bevel, no
  seat shadow.
- S2 `temperature-schism-khaki-on-graphite` — neutral re-dress was
  half-done: cool graphite panel tokens under warm khaki section
  heads.
- S1 `bronze-bleed-ambient-chrome` — bronze leaked onto non-roll
  chrome inside the neutral column through unscoped globals.

**E · Multi-pool flow. `70bc4d8`** (where it was ours to ship): spent
draft (survives its roll, cools until the next edit — `spent-draft`
e2e), and A's peek-identity wrap serves the shelf-anonymity finding
within the quiet-chrome contract until §6b's seated-shelf decision
reopens it. `no-newcomer-path` stands — Joe's. The chain rack → tray →
reveal rows keeps staged order faithfully.

- S3 `rolled-draft-accretes-on-restage` — draft survived its roll with
  no spent state: tapping pools for the NEXT roll silently doubled a
  pool. ADJUSTED: spent/refresh cue, not auto-clear.
- S3 `shelf-clusters-anonymous-at-rest` — collected rolls rested as
  unlabeled dice piles. ADJUSTED: standing mark must respect quiet-
  chrome shelf contract; §6b seated-shelf idea would answer wholesale.
- S2 `no-newcomer-path-to-first-stage` — nothing taught "tap a pool,
  then ROLL"; cut ghost text left the compose loop undiscoverable.
  Joe owns replacement direction; standing, not new.

**F · Labs — chrome-lab.html, contact-sheet index, rotted-mockups
banner. `ccbca1f`**: chrome-lab.html (pose-driver shape exactly — real
app in an iframe, posed through __diceDebug), tools/contact-sheet.mjs
(per-directory captioned grids + top index), docs/mockups marked
ROTTED (README + per-file banners).

- S4 `no-chrome-lab` — lab.html covered 3D die materials; nothing
  showed the 2D chrome side by side. Pose-driver upgrades directly on
  the card builders extract.
- S3 `mockups-rotted` — docs/mockups/*.html drifted (<1 week);
  disqualifies static-mockup shape.
- S2 `contact-sheets-have-no-index` — each drive suite dropped 20+
  loose PNGs; stitched index page per run.

**Refuted:** a worded "Collect" on the banner/peek fold (re-litigates
§7.9's retired Done); unifying the card strips' chevrons with the
tray's engraved lozenge (re-litigates §7.14.1's same-day boundary).

### 2j. The flow to collected + the one-way rim — SHIPPED 2026-08-04

Two directives landing on the audit pass's fresh surfaces (`30289fd`,
`d2c7b30`; UX.md §7.16):

- **"Cinematics have too many stages."** The ceremony's handoff into
  the standing banner is GONE: the verdict card is a folded card —
  body = the role-split clear target wearing the banner's removal
  grammar (click mid-moment SKIPS first; always interruptible), fold =
  the built REROLL/Reveal, no ✕, no Done — and its clock (hover holds
  it) flows the roll STRAIGHT to the shelf. A hidden card stands until
  its reveal re-arms the clock. Check and cinematic alike: one card
  family. e2e: `ceremony-retire` rewritten.
- **"One way to do most things."** The rim's Save and its whole
  inline morph retired — keeping a draft is pool editing's job (✎
  ghost tiles mint with shelf-at-birth, the popover's Duplicate…
  copies, the peek's Save-as-pool keeps a rolled result; writes stay
  by-id only) — and the freed room lets the modifier tool wear its
  word: **± Modify** (Joe's pick list was Modify/Customize, never
  "Tweak"). The tray popover's standing title says *Draft* now.

### 2k. The panel anatomy pass — the quiet nameplate + the region head — SHIPPED 2026-08-04

Joe asked for the panel's four regions (table & users · dice · roll
tray · pools) to read explicitly, unobtrusively, text allowed, "best UX
should win." Run as a four-entrant judged design panel (typographic ·
structural · identity-first · minimal, three adversarial lenses each +
completeness critic); UX.md §7.17 records the shipped synthesis: the
table is NAMEABLE (room-wide `tableName` on the settings channel,
renamed from Settings → Everyone at the table), the rail wears the
name at its right edge (name → chosen ?room= key → NOTHING — never a
placeholder) and document.title carries it; `SAVED POOLS` heads the
rack with a rule-to-edge rank mark, yielding to the owner banner on
foreign racks; the dice and tray regions get deliberate NOTHING
(pressed Dice segment and the bronze well already speak). e2e:
`panel-anatomy` (chrome, settings); stills in tools/out/anatomy/.

Follow-ups from the critic that shipped same day:
- roster-pill ↔ owner-chip duplication — rail pill is the browse verb,
  `buildPoolsSwitcher` retired, aria-pressed steel dress, press-again-
  to-close, disabled in manage mode, `ROSTER_MAX` 4→6.
- ownership legibility mid-scroll on foreign racks — `#pools-head.
  foreign` joins the sticky stack; category heads yield sticky in
  foreign state.

### 2l partial — slices ①–④: honesty, seam, ledger, spectrum — SHIPPED 2026-08-06

The math floor under pool analysis (`b91a32b`, `4c92ae6`); slices ⑤–⑦
remain open in ROADMAP §2l. `js/odds.js` `previewOf(dice, mods)` →
`{min, avg, max, exact}`: each capped mechanic is classified per spec —
VOID (the 40-die cap zeroes it: `40d20!`, `40d6 ro<=3` — exact with the
mechanic ignored), FREE (the cap can never bind — exact via per-die
pmfs, a tie-proof top-k threshold identity that handles mixed-type
keep/drop, and closed-form explosion chains), BINDING (truncation
depends on rolled values, which breaks per-die independence — seeded
4,000-roll sampling, and the preview line SAYS so: `· sampled — 4,000
rolls`, never a bare ≈). min is the provable floor in every tier.
`budgetOf` (dice value, POOL-ANALYSIS §4) landed beside `DIE_MAX` in
rollspec.js with the caps exported; both adv spellings of 2d20-keep-1
read 40. `fmtPreview` re-pointed in all rendered surfaces (command box +
quick palette via `renderCmdState`, ± popover echo) — the old
`previewSpec(…, 800)` Monte-Carlo line was wrong at both ends for any
pool past 3d6 (9d6: never right) and jittered per repaint. Verification:
`tests/odds.test.mjs` (53 tests) cross-checks the exact tier against
exhaustive enumeration of composeRoll's own rng-draw tree — caps, ties
and sort stability captured mechanically; e2e `preview-honest`
(`notation`, `smoke`) pins the literal preview text, an assertion that
was impossible under Monte Carlo.

Slices ②–④ followed the same day (profile seam `755808f` · dice-value
ledger `25012c6` · spectrum bars `711771e`), then a ten-commit polish
wave (`c7b90fc`…`fea43e6`) driven by Joe's screenshots. The forecast
lives in the ± popover under a labeled **Pool stats** head: per-die
spectrum bars in chart row order, identical (source, rank, transform)
dice deduplicated into one counted bar, keep/drop and binding-reroll
specs refused in plain words rather than shown wrong. Display amendment
(POOL-ANALYSIS §8): a multi-bar pool opens as ONE count-weighted mixture
line — `P(O) = (n₁·p₁(O) + n₂·p₂(O) + …) ÷ N`, exact, laid out in
`OUTCOME_LADDER` order — with a `per die` toggle; results still never
fold. Sliver honesty (Joe: a 3% Blemish vanished and its neighbor color
swallowed it): 1px mosaic rules between segments, 2px minimum segment
width, a sequential within-tier lightness palette, and a fixed readout
strip below the bar — caret at the hovered segment's midpoint, `Blemish
· 3%` — which replaced both the in-segment letters and the tick-lane
callouts (kept "for print" in POOL-ANALYSIS). Around it the popover
reorganized: Set and Saved-pool sections, Visibility above Moment,
comment folded into Moment and gated to check/cinematic, one title at
the top (the head is the rename affordance), and Soul Deal folds
sum-only mechanics plus the sysnote outright. Help arrived
concept-first (Joe: durable concepts over UI choreography): a rail `?`
door and a Pool-stats `(?)` bubble open one sectioned dialog — seven
topics (fair rolls & the pose seed, systems-as-lens, notation,
visibility, the mixture math, pools, your data) with in-dialog anchors
because the URL carries nothing. "Rack" left the UI vocabulary for
"pools" (US slang collision, Joe); `racks?` joined the terminology
sweep's banned regex and `#help-overlay` its swept roots, so the ruling
is test-enforced. Verified: `pool-forecast` + `rack-dice-value` e2e,
meanings unit vectors incl. collapsed-mixture exactness, and a clean
33-scenario gate at `fea43e6` (sole failure the known-environmental
`seat-resume`, proven pre-existing at baseline `4d7161a`).

---

## Tier 3 — Secrecy landings

### 4b partial — Targeted offers — SHIPPED 2026-08-03

The first multi-player CUJ, landing right on the Trigger Pass's single
offer surface; UX.md §7.11. Offer a roll claimable only by a named
player ("Bo, roll this save"). Name resolves against the roster at
offer creation exactly like a whisper audience (case-insensitive,
duplicates all join, 400 `unknown_target` fail-closed); pinned
`playerId`s ARE the claim gate — server-enforced (403
`not_offer_target`), never just which client drew the button. Card
shows everyone the stakes including who it's for; only the target
wears the claim strip (bystanders read 'waiting on Bo'). UI: a ▾ split
button beside the draft row's *Offer to table* (plain click keeps
one-click table-wide muscle memory; the ▾ waits for a teammate).

### 4b partial — Whisper-offer auto-targeting — SHIPPED 2026-08-03

Joe: "a whisper roll is already assigned to someone, so the offer
should always be to that person". An offered `whisper` roll derives
its claim gate FROM its audience, server-side in `handleOffer` — `w:Bo`
offered is claimable by Bo, full stop; table-wide whisper offers cease
to exist by construction (Joe: weird, arguably not useful). Multi-name
whispers are claimable by any audience member; the ▾ may still NARROW
to one of them; a target outside the audience refuses (400
`target_not_in_audience`). A whisper whose only audience is the offerer
has nobody to offer to: refused at offer time. `secret` (dice tower —
open claiming is the point) and `held` offers untouched. UI: ▾ picker
hides while draft carries whisper visibility (target already decided);
card reads 'for Bo' through existing `to` machinery. Ships with
`whisper-offer` e2e; the superseded bystander-can-claim-blind contract
left `tests/redaction.test.mjs` with a supersession note; rewritten
redaction test pins the new one.

---

## Tier 4 — State capture landings

### 5 partial — Pools & settings export/import (portable YAML) — SHIPPED 2026-08-03

Joe: human-editable YAML view of the rack (shelves; pools as name +
canonical notation) plus the just-you settings (sound, numbers), in
Settings → *Your data* — ONE textarea, two directions: Export fills
it, pasting/editing re-parses live into a preview line (`✓ 1 new · 1
update · 2 unchanged — Apply takes them`), and Apply merges by name
through the by-id writer, deleting nothing. `js/portable.js` is the
zero-dep emitter + strict YAML-subset parser (fails closed with a line
number, like the codec); every scalar is single-quoted on export because
notation carries `#` (YAML's comment) and names may carry `: `. 20 unit
tests + the `portable` e2e scenario. UX.md §7.13.

---

## Tier 6 — Customization & delight landings

### 9. Dice sets, colors & THEMES

**EXPERIMENT PHASE SHIPPED 2026-08-03**: docs/THEMES.md holds the
taxonomy — nine houses (Tidewrack · Wildwood · Stormcall · Rimehold ·
Emberforge · Arcanum · Umbra · Reliquary · Gildhall), each with
palette, material feel, and REASONED signature effects. js/themes.js
carries the material recipes; dice.js's (type,variant) seam accepts a
theme id (colors re-baked, finish + internal glow applied — geometry/
physics untouched). lab.html is the review rig (grid of every theme ×
die, effect prototype buttons, env cycle for glow judging, PNG
capture); tools/lab-shots.mjs drives it headless for review stills.

**LADDER Levels 1–3.5** shipped: texture-space maps, shader injection,
impact-keyed particles (js/particles.js + the lab's cannon-es drop
rig), geometry identity (per-set bevel/profile/wear/nicks/pillow on
the render mesh only, physics hull canonical; see THEMES.md).

**PICKER + WIRE SHIPPED 2026-08-03**: "Dice set" in settings ("Just
you" — grouped by house, felt-swatch language, localStorage); `set`
rides every roll AND claim request (present-or-absent like exp;
server validates against SET_IDS, 400 unknown_set; the CLAIMER's set
— whoever throws wears their own dice), survives redaction (cosmetic
identity like name/color), lands for everyone, and the shelf, reveal
flips (geometry + materials restore the set, shroud outranks
identity) and reload replay all keep the skin. Main table gained the
lab's PMREM reflection environment (std/shroud pinned to
envMapIntensity 0.35 — the released look holds), the SHADER_TIME
clock, and the particle field fed by fast-forward's recorded contacts
({time, strength, at} — the roll.sounds seam, realized). e2e:
themed-dice (tag `themes`).

**LADDER L4 SHIPPED 2026-08-03**: felt decals (js/decals.js — frost
crackle, drying rings, scorch with cooling ember rim, dust smudge;
instanced quads over a two-tone procedural atlas, stamped from same
recorded impacts, transient by contract) and die-parented lights
(js/dielights.js — fixed pool of 4, wave/breathe/flicker/steady modes,
Umbra pools shadow with NEGATIVE intensity; felt-only — collect
extinguishes, reveal ignites, shroud smothers). Restraint recipes:
six sets mark, five glow, four leave the table untouched on purpose.
The lab drop rig gained the coupon/rails/linger/dropView furniture
to review it at table pitch. e2e: themed-fx (tag `themes`). Marks
half retired same evening to a kill switch (Joe kept the whole ladder
except the felt residue): `DECALS_DEFAULT_ENABLED = false` gates
stamping everywhere.

**LADDER L5 SHIPPED 2026-08-03 — THE EFFECTS LADDER IS COMPLETE**:
hand-rolled postprocessing (js/post.js, core three only): selective
bloom via a blacked-out mask render (a std/shrouded die cannot bloom
by construction; no strength knob — whatever L1-2 made bright is
what burns), impact-keyed shock rings off the roll's hardest landing
(negative amp = Umbra implodes), heat shimmer above settled iron, and
a strict bypass: a std table renders the released direct path,
proven equivalent at 61.8 dB PSNR. e2e: themed-post (tag `themes`).

**CHROME WEARS THE SET (2026-08-03)**: the diceart.js bakery — baking
std chips from the real meshes since P1 — went (type, variant): one
lazy warm per set (all seven types, GL context released after),
unknown ids normalize to std, failed slots fall back to std art.
Palette tiles and tray/pool/offer strips wear MY set and re-dress in
place on a set change (refreshDieArt walks data-art-type imgs); log
chips wear each ROLL's set on every screen, and hidden entries wear
obsidian (shroud > set > std, same as the felt). e2e: themed-chrome
(tag `themes`).

**SAVED-POOL SET OVERRIDE SHIPPED (2026-08-03) — §9's engineering
seams are all closed**: a pool can pin the set its rolls wear (absent
/ 'std'-pinned / house set), chosen through one compact select shared
by the settings row and the popover identity strip ('Your set'
default). Same evening, PER-DIE (Joe: a mixed draft collapsing to one
set read as broken, and a teammate's rack wore the VIEWER's skin —
information loss at the whitelists): every die wears its own pool's
set — wire `sets` aligned to the base dice (server-validated,
redaction-preserved), provenance-chasing rollDieSet/entryDieSet for
explosion/adv/reroll extras, per-die impact effects off sounds[].di
(each recorded contact knows its die), per-die lights / bloom /
reveals / shelf / log chips, and the pools broadcast carries pool
sets so foreign racks show the OWNER's skins and staging them carries
pool identity. A YAML @-suffix carries the override through export/
import, failing closed on unknown ids. Save/variant flows inherit;
rerolls keep per-die sets; claims keep shipped semantics.
e2e: pool-set-override (tags `themes`, `groups`); units in the
portable tests.

Next morning (Joe 2026-08-04): the OWNER'S DEFAULT set rides the
pools publish too (top-level present-or-absent `set` on /api/pools,
roster + pools-changed relay, republish on every set switch), so a
foreign rack resolves explicit pool set → owner default → classics
with every strip pinned — "if you look at another player's pools,
they look identical to what that player sees." And staging a foreign
pool snapshots that resolved skin as a pin (Joe's same-day correction
— the tray had switched staged foreign pools to the borrower's
default; 'std' worlds pin std): what you saw is what you stage. Your
own rack still stages unpinned, following you.

**SLICE 0+1+2 SHIPPED (2026-08-04)** — deep aesthetic pass, judged
workflow: turn-downs across nine themes (stormcall flicker light out,
blackanvil neon digits halved, seaglass flashlight removed, umbra
violet halo halved, arcanum breathing pulse cut, plus six more),
retired eight cheap effects the critics named (heartwood firefly
motes, seaglass Mario bubbles, scrimshaw dust puff, four
proposed-but-unshipped screamers), retired two derivative sub-sets
(`rimehold.firstfrost`, `wildwood.mosstone`), added THE CLASSICS
house (8 unadorned matte variants incl. Vegas-pipped Ivory — the
honest option every RPG dice bag has), added the `glyph` field (pips
are the first family; roman + runes queue behind a glyph library),
the `sound` field with 5-body impact voice replacing the single
hard-coded click, and the `rate` field for per-set playback retiming
(vine catch · glacial arrest · ceremonial hover). Full contract in
docs/THEMES.md §0.

**SLICE 3 (rest cadence) SHIPPED (2026-08-04)** (`fc9d38d`): settled
dice breathe per set (seaglass swells sub-mm, heartwood creaks 0.4°,
scrimshaw ticks once and stays still, sapamber declares stillness);
alloc-free stepResting reads d.finalPos/d.finalQuat live so reveal
becomes the new cadence baseline for free; shipped after §0c's
shelf-bloom fix opened the perf headroom. e2e: rest-cadence.

**Configurable edge tint (`geo.tint`, 2026-08-04)** (`cac1fa2`): the
darker-color edge tint became a recipe field (0–1 range widened from
0–0.25, color parameter added — was hard-coded black lerp); applied
to onyx (`#e8e2d2` @ 0.14), brass (`#3a2708` @ 0.55), heartwood
(`#1a0a05` @ 0.35), scrimshaw (`#4a3520` @ 0.5). Lab exposes both
knobs in the builder.

### 9c. THE SOFTER EDGE — Tiers 0–2

**Tier 0 — data only. SHIPPED 2026-08-04** (`f220ef1` + seams
`64941de`): THE GEO BENCH in the lab — eight `geo` recipes swept over
otherwise-standard dice (sets may now omit body/text to inherit std
per-type colors; house-less sets read std finish) — plus THE SET
BUILDER (every recipe knob live, themes.js-shaped copy-out) and hero
die framing (canvas click, ↑/↓ same-die-across-sets surfing). e2e:
lab-geo-bench (tag `lab`); stills: tools/geo-bench-shots.mjs.

Bench verdict, post-hole-fix: the first verdict — "even round .130
reads as dark grooves" — was measuring THE HOLE (Joe found: order-
blind stitcher paired each edge's two inset segments, but consistently
wound faces traverse a shared edge in OPPOSITE orders — every band
quad was a bowtie: one triangle doubled, the other half a triangular
hole showing scene background as a pure-black wedge). Fixed by
endpoint-aligned pairing; e2e scenario now asserts every render mesh
is watertight — including through the builder's wear/nicks
displacement. With whole bands, cut recipes read as clean machined
chamfers and `round .090` reads GENUINELY soft at hero distance — the
fillet shading rolls a smooth highlight along the edge.

**Tiers 1+2 — true fillets. SHIPPED 2026-08-04** (with the `ink`
knob, Joe's ask: "turn down the darker color on the beveled edges").
Every `round` edge is now `segments` (default 3) quadratic-Bézier arc
strips, control point = the ORIGINAL sharp edge — tangent to both
faces by construction (q→ctrl lies in q's plane), never outside the
base solid, never below the resting plane (bottom edge's ctrl lies IN
bottom plane, so canonicalDiePose holds). Corners are domes fanned
over shared arc instances (watertight with no angular sort —
consecutive arcs share ring endpoints); normals are ANALYTIC:
face-exact at rims (zero crease), blended across the arc, corner-ray
at apexes. Worn sets keep the 0.65 sphere-blend after displacement.
`geo.ink` (0..1) dials the painted face outline + band material
together (they are one visual system); bench row `lab.selfink` shows
.04. House round sets upgraded free.

Deliberately NOT done: metric-radius insets (`r / tan(dihedral/2)`
per edge — the d10's kites carry two dihedrals, so fillet widths are
slightly uneven there; share-based insets keep today's proportions).
Pick that up only if the d10/d10x reads unevenly on the bench.

**Fillet review outcomes (2026-08-04, 7 confirmed):** fixed — pillow
re-opened the zero-crease guarantee at band rims on pristine round
sets (~14° step ringing every face on heartwood/sapamber/scrimshaw;
the pillow pass now tilts rim vertices identically), builderSet
bypassed the profile-flip ink snap (recipes fossilized the old
default), the e2e "inside the sharp corner" bound was looser than
the corner itself (now bounded by the base solid's actual radius),
and ink/tint/segments had zero positive coverage (now asserted off
the live band material + vertex counts). ACCEPTED, not fixed: the
builder's ink slider pops the face outline one step off the round
default — inherent to the coupled ink semantics; a split knob would
betray the one-visual-system rule.

---

## Later landings (terse index)

- **Mat zoom (2026-08-04)** (`642b71b` + `dec573c`) — three-level
  room-wide setting (wide 30×17 default · medium 24×14 · close 18×11);
  walls repositioned in place, shelf pitch derives from TABLE_W, shadow
  frustum tracks, camera eye preset shrinks with mat. Deferred
  interaction rule: mid-roll zoom queues to next roll boundary to keep
  keyframes bit-identical across clients. e2e: `zoom-syncs`.

---

## Baseline shipped (older, one-line summary)

Multiplayer core (SSE rooms, server-authoritative values, simulate-ahead
replay with face correction, solo fallback) · Soul Deal meanings · saved
pools (localStorage; the `#g=` URL codec that once carried them shipped
2026-07 and was dropped 2026-08-04 — GOALS §7) · player rename · roll
mechanics engine (shared rollspec: modifier/adv/keep/reroll/explode,
attributed parts, per-die metadata) · offers (offer/claim/withdraw) ·
face-down + reveal (UI-level; real redaction is step 4) · reroll-last ·
notation layer (Roll20 dialect, 561 tests + fuzz, command box, ± popover)
· room settings channel + felt themes + settings modal · roll ceremonies
(intent card, mat-text felt decal, staged verdict, cinematic slow-mo,
skip) · quick-roll palette + keyboard shortcuts · capability matrix
across all roll surfaces · per-roll Done-clears · **visibility core
(step 4, goal 11)**: the role-free ladder open · held · secret · whisper
riding notation (`held`/`secret`/`w:Name` + the offer-only `blind`
alias), server-side per-recipient projection on every egress, server-
enforced reveal authority, offer visibility incl. the dice-tower roll,
shrouded obsidian playback with deferred mid-playback reveals, solo
degradation, the cross-tool terminology pass (`/gmroll` family →
`secret`, `/sr` refused as ambiguous, labels *Only me* · *Whisper to…*
· *Dice tower*), and the `#`-in-player-names ban that keeps whisper
addressing total · **quiet chrome (UX.md §7.9)**: the documented z ladder
with ceremony above table labels, value chips off by default, dot-only
shelf markers with the peek doing the talking, one clear-this-roll
gesture everywhere, a persistent rail that no view can strand,
independently collapsible panels with compact view as their emergent
state (the Players panel later retired into rail roster pills, and the
remaining panels merged into the ONE Pools panel — 2026-07 cleanup),
the identity chip (rename · leave & switch · invite link) solo and
online, by-id saved-pool editing, and the *pool / saved pool* naming.
