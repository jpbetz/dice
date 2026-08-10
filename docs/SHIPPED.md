# Shipped

Historical detail for work that's landed. Split from
[ROADMAP.md](ROADMAP.md) so the roadmap reads as open work only; nothing
here is a to-do. Cross-referenced from UX.md; commits cited inline.
Section numbers preserved from the pre-cleanup roadmap so incoming links
still resolve.

Ordering is by tier (matches GOALS.md's priority ladder: core mechanics →
organization → secrecy → systems literacy → effects → customization).

---

## Joe's cleanup notes — the key, the fold, the withheld verb, the departure (2026-08-09)

Design authority: [UX.md](UX.md) §7.11b (amended) and §7.26. Four small
items from one message; the two that were design rather than cleanup went to
[ROADMAP.md](ROADMAP.md) as **C25** (the collection phase's space cost) and
**C26** (what `Change seat…` owes before it comes back).

### The hover key — SHIPPED 2026-08-09

*"The reveal window highlights dice on hover, which is awesome, but it
doesn't have any UX that maps the outline highlight color of the dice with
the pools the color relates to."* Each pool label on the result card now
leads with its own hue as a filled dot. The hue assignment moved into one
function (`sourceColorMap`, keyed by source name, walked in die order) that
both the felt shells and the card read — they used to compute nothing in
common, which is the whole reason the highlight could teach grouping and
never attribution. A key, not a recolor: the label keeps `--muted` small-caps
so tier colors keep their monopoly on meaning-bearing color. The loose group
gets its ivory dot too, and takes a label cell of its own in the ledger.
Banner only — the peek and verdict card do not hover-outline anything, and a
key to a highlight that never paints is decoration.

`__diceDebug.cardKey` reads the painted DOM; `folded-card` and `source-read`
pair it against `outlineState` off the shell materials, so the pin is
cross-surface rather than one function checked against itself.

### d20 pairing folds under Your Soul Deal — SHIPPED 2026-08-09

*"D20 pairing is not useful for 'Your Soul Deal', remove from modification
options."* U17 had brought it back on the reasoning that advantage decides
WHICH DIE COUNTS and so is a fact under every system — true of the notation,
and not a tool this chart wants. `.sec-pair` joins `.sec-sum` in the
`pop-perdie` fold; its own class because the reason is the chart and not the
arithmetic, and the two must be able to move apart again. It round-trips
invisibly the way Target once did, which is the accepted cost of everything
in that fold (notation totality is app-wide).

### `Change seat…` withheld — SHIPPED 2026-08-09

*"Maybe not fully thought through. Strongly consider hiding it for now."*
`openIdentityMenu` hides it unconditionally now (it was already hidden in the
lobby). The verb reads as "sit somewhere else at this table" and actually
drops the seat, **deletes `LS_NAME`**, and re-enters `initNet()` — §3b/L3
split it out of `Leave & switch seat` so that the name would travel with the
player, then left the name-wiping verb wearing the seat-shaped label. Safe to
withhold because C10 shipped: the door offers a returning player their
prepared seat, so `Leave table` → the door is the same journey without the
name loss. The button, its handler and `leaveTable()` stay — still the only
scripted door to a `netOnline === false` state. ROADMAP C26 holds the
redesign. `touch-doors` pins the hide at a table, `identity-lobby` in it.

### How a die leaves — SHIPPED 2026-08-09

*"The way dice disappear is not my favorite… the speed is good but the effect
is not."* Speed untouched (0.3 s); the motion inside it replaced. `sink` (drop
2.4 units, shrink to 0.65, leave by passing through the felt) gave way to
`lift` (rise 1.15 on an ease-out, shrink to zero) — the collect whisk's carry
arc, pointed at a second destination. Full reasoning and the alternatives
table in [UX.md](UX.md) §7.26. `fold` and `sink` stay switchable via
`__diceDebug.setClearStyle` so the taste call can be re-made side by side,
and `dice-depart` uses `sink` as the proof that its `dy >= 0` assertion can
fail — a green check that would have passed against the thing Joe asked us to
replace is the failure mode this repo keeps hitting.

---

## Joe's UI notes — the named verb and the pool rail (2026-08-07)

Design authority: [UX.md](UX.md) §7.21 and §7.22. Both came out of a
multi-agent design pass (two surfaces × three stances, judged, then
adversarially verified against the tree); the verify pass is what caught
the `[hidden]` bug below and the same-type glue trap in §7.22's compose.

### The `hidden` that never hid — SHIPPED 2026-08-07 (`631a562`)

`el.hidden = true` sets a property; the paint is a separate question. The
UA sheet's `[hidden] { display: none }` is user-agent origin, so any
author-origin `display` beats it regardless of specificity — and
`.banner-foot` (css:3018) and `.pool-roll` (css:797) both declare
`display: flex`. Since the Tier 0 §0e/L8 mount-once rewrite, which
replaced *build the verb when it applies* with *mount both and toggle
`.hidden`*, every face-up result card shipped a live **Reveal** the server
answers with 403, and every held card a **REROLL** of a spec nobody at the
table can read. The suite stayed green for one reason: it asserted the
PROPERTY (`revealHidden === true` — always true, always beside the point).
Fixed with a global `[hidden] { display: none !important }`, verified safe
by grepping every attribute write in `js/` (exactly the four card-actions
sites) — the `.idm-item` trap uses inline `style.display`, not the
attribute. Pinned by `fold-visibility`, which fails on the old CSS.

### The named verb — SHIPPED 2026-08-07 (`8a28827`)

Joe: *"the 'x' on the main body is probably too non-intuitive. I think we
need that to remain the main action but find a better UX."* Both halves
honoured: clearing stays the main act and gains a name. Every result
surface's fold now LEADS with a standing worded primary — `✕ Clear`,
`✕ Dismiss`, or `❯❯ Skip` while a ceremony beat still plays — at `flex: 1`
and full opacity, first in the tab order. **Hierarchy is area, not
volume** (2i-C's fourth law): the primary never wins by being redder.
The body stays a clear target but loses `role`/`tabindex`/`title` and its
keydown twin; hovering it lights the named bar (*the linked press*)
instead of painting a 72px ✕ watermark that only a cursor could find.
Retired: the watermarks and body washes on all three surfaces, the
`.card-actions-empty` gate, the verdict card's blanket rest-dim and the
un-stack rule it forced, dead `.banner-row` and `.clear-x`. One
`runCardClear` now owns every clear, so the re-entrancy guard rides the
button's `disabled` (visible) instead of two silent closure booleans; and
the touch mirror of hover-holds-the-clock landed, so a thumb on the banner
holds the tidy-away that used to collect the roll mid-read. Six scenarios,
including this suite's first assertions on computed display.

### The collapsed pool rail — SHIPPED 2026-08-07 (`fd9d9b0`)

Joe listed five defects and offered to drop the surface entirely. Every
defect was downstream of one number — 56px — so the rail is **112px** and
they go together: shelf heads spelled, names horizontal and ellipsized,
44px rows, and a tap that SELECTS (steel — gold belongs to the one bar
that rolls) so the common *Your Soul Deal* roll of an attribute, a skill
and a motivation is three taps and a bar. **2i-G: a selection is not a
draft** — rack-ordered, never persisted, spent by its roll, dropped on
expand — which is how "clear it after each roll" coexists with 2i-E's
surviving draft. A single pick launches its pool verbatim; a multi-pick
composes dice, per-die sources and labelled flat modifiers, and says out
loud what it set aside. Glue mods are stripped **unconditionally**: a
same-type sum like `4d6dl1 + 2d6` parses happily as `6d6dl1`, so a
try-and-catch design would have silently changed the distribution. Mixed
visibility fails closed to `secret`. The set-aside note lives in the rail,
because `showSettingsNote` falls through to a status pill the collapsed
rail folds to a 10px colorless dot. Two fixes the interactive pass caught
that no assertion would have: the ✓ gutter stands empty rather than
appearing on selection (a name that fit would truncate the moment you
picked it), and the rail repaints above `renderGroups`' foreign-rack
return, so a teammate's rack no longer leaves it stale.

---

## §3b — The lobby and the table flow (2026-08-07)

Design authority: [ROADMAP.md](ROADMAP.md) §3b (CUJs and rulings) and
[UX.md](UX.md) §7.20 (surfaces). Rooms had worked since the beginning;
nothing in the UI ever let a player *reach* a second one. L0/L1/L3
shipped together because a lobby you cannot leave is not a lobby.

### The lobby exists — SHIPPED 2026-08-07 (`94f3069`)

`?room=` absent no longer falls back to the key `table`. `ROOM` is
nullable, `IN_LOBBY` is the question every room-assuming site now asks,
and `initNet()` exits before `promptName()` — so a first-time visitor
meets dice instead of a modal titled *Take a seat* about a table they
never asked for (CUJ1), and the bare deployed URL stops seating every
stranger on one shared felt. Nothing about it is a fallback: the lobby
does not call `connect()`, so there is no failed join to report, and it
does not call `peekTable()` either.

**`solo` deleted as the lobby's indicator, kept where it was always
true.** The four-count argument is UX §7.20; the load-bearing one is that
`#status-pill` is a shared TRANSIENT channel — `showSettingsNote`
borrows it on a 3 s timer under an explicit *"a status change may have
taken the pill"* guard — so a permanent state parked there is destroyed
by the first note and never restored. It survives only for "you asked
for a table (`?room=` is set) and there is no server": a state with no
next action, which is when a readout is the right object, and where no
settings event can steal the slot because there is no server to send one.

**The suppression pass, by one rule** — a surface that speaks about YOU
keeps working; a surface that speaks about THE TABLE is absent, never
disabled and never silently downgraded to local. `inviteUrl()` returns
null instead of fabricating a working link to the room named `table`;
the *Everyone at the table* heading and the Table name row do not render;
`Apply to table` goes (its only roomless outcome was a refusal); the felt
and system tooltips stop claiming an audience; the offer refusal names
the exit instead of diagnosing you. The **phantom name** is gone —
`tableName` no longer survives `LS_ROOMSETTINGS` into the nameplate, the
tab title, or the download slug.

### The presence row, three states — SHIPPED 2026-08-07 (`94f3069`, `765b7da`)

`renderPlayers()` is now their renderer and runs in **both** branches.
The row already asked "who is here", so when the answer is "nobody yet"
it carries the fix, in the slot where the people will appear — an
**affordance, not prose**, which is the only way past the actively
enforced *empty renders nothing* law (`.tray-invite` was killed the day
it shipped; `#groups-empty` went the same way). A dashed ghost pill in a
solid roster pill's geometry reads as a chair nobody is sitting in.

- **Lobby:** `+ New table`, and `Tables ▾` only once a table has been
  visited.
- **Unprepared table, nobody else here:** the `Invite` chair. It stands
  only while you are alone — an unprepared table has nothing to
  enumerate, and a permanent Invite pill would be the standing chrome
  §7.9 kills; the link keeps its home in the identity menu.
- **Prepared table:** one chair per UNCLAIMED seat, wearing that seat's
  name and copying that seat's `&as=` link. `roomSetup.profiles` minus
  the live roster, client-side: no endpoint, no wire key, no new state.
  These stand **for as long as the seats are empty, not only while you
  are alone** — the first arrival must not take the other five chairs
  off the wall. They retire per seat, at the grain of a seat rather than
  the row. *(Corrected the same day: the first gate was `!others.length`,
  which made the documented "the outlines fill in one by one"
  impossible. Caught by driving a three-seat prepared table in a
  browser — seated as Bo, the row must read Ada and Kit.)*
- **Table with people, no free seats:** unchanged, and no new chrome.

The label lives in its own `.rg-label` span (`765b7da`): the copy
feedback swaps it to `Copied!`, and a `btn.textContent =` would take the
whole subtree with it, deleting a seat chair's dot permanently on first
use.

### New table, recents, and leaving — SHIPPED 2026-08-07 (`f1575ac`, `b4f5a6f`, `94f3069`)

`js/tables.js` is the store: `recentTables` / `rememberTable` /
`forgetTable` / `mintRoomKey`, never-throws, capped at 8, with its own
unit suite. **The key is minted, never the name** — this app has no
access control by design (goal 10), so the key IS the door and
`?room=soulseal` would be one anyone can guess; a readable slug carries
~83 bits of `crypto.getRandomValues` behind it, verified byte-identical
through the server's own `cleanString`/`MAX_ROOM` gate.

**`Leave table` is its own verb and deliberately does not reuse
`leaveTable()`**, which drops the seat *and* deletes `LS_NAME` and then
re-enters `initNet()` — wiring it up would have silently wiped the
player's display name and, in a lobby, looped back into *Take a seat*
with nowhere to go. The seat belongs to the table; the name comes with
you. `Leave & switch seat` became `Change seat…`, which is what it
always did.

**The name survives the round trip.** An unprepared room is deleted when
its last player leaves (only a room holding a setup lingers — §G6), so
leaving and returning landed in a new room with the name gone while your
own Tables list still showed it. The join now restores a remembered name
to a room that has none — the same trade `maybeRepushTable()` already
makes for setups, with the same accepted cost (it can bring back a name
somebody deliberately cleared).

### Two traps worth keeping

**Module-evaluation TDZ.** `ROOM`/`IN_LOBBY` are declared at the TOP of
main.js, beside `ZOOM_LEVELS` and for the identical reason: `setSound()`
→ `syncSettingsUI()` builds the felt and system pickers *during module
evaluation*, and those tooltips now read `IN_LOBBY`. Declared beside the
other net constants, it killed the whole module in TDZ — the page still
rendered from static markup, which is what made it briefly look like a
render bug rather than a dead module.

**No global `.hidden`.** Menu items hide by inline `display` because
`.idm-item`'s own `display: block` outranks the `[hidden]` attribute and
this codebase has no global `.hidden` utility (every hideable element
carries its own rule).

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

---

## Tier U — the converged UX (2026-08-08)

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

*Moved here from ROADMAP 2026-08-08, per this file's own opening rule — the
roadmap reads as open work only. Twenty-five entries; the seven still open
(U16, U20, U21, U23, U25, U26, U28b) stayed behind. Entry numbers preserved
so incoming links resolve.*

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

### U3. The prepared seat never reaches a returning player (CUJ7) — DEFECT, medium  
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

### U18. Crit frequency under soul-deal — SHIPPED

*Audit B2 (major), second half.* `soul-deal.critFor` fires when *any* die
lands a crit cell, and those cells exist on d10/d12/d20 — so a `3d10` pool
crits on **48.8%** of rolls, each one a full-viewport wash plus a 1700 ms
shake. §2.4 budgets crit as a rare accent; on a d10-heavy Soul Deal pool it
is the **median outcome**, and "excitement outranks physicality" inverts into
noise. This is a chart/threshold question, not a rendering one: decide what
"crit" means for a multi-die per-die pool. (U8 ships the reduced-motion half
independently and first.)

**Decided 2026-08-08 — SHIPPED.** It is a *ceremony* question, and the audit's
framing above is half wrong. The chart is correct and is untouched: face 10 on
a d10 IS a Critical Success, 1 in 10, as its author wrote it. The defect is
that `critFor` is a `some()` over N independent readings — the one place the
soul-deal profile AGGREGATES, under its own no-aggregation law
(POOL-ANALYSIS §2, "every number describes exactly one die") — and it fed a
full-viewport wash that makes a claim about the ROLL, which a per-die system
has no verdict to make.

So the two questions are split. `critFor` still answers *did something crit*,
and the word always lands (U8's rule; the per-die card prints it regardless).
A new optional profile method `critCeremony(entry)` answers *does the table
stop*. Soul Deal says yes only when a **strict majority of the crit-CAPABLE
dice** agree — d4/d6/d8 have no crit cell and so are not in the denominator,
without which the canonical attribute+skill+motivation roll (one d10 among
three dice) could never clear a majority and would lose the accent entirely.
D&D states `critCeremony: () => true` explicitly: a d20 system has one
verdict, and a natural 20 under advantage is a crit *because* the other d20
disagreed.

Measured (2e6 rolls each, wash rate before → after):

| pool | before | after | |
|---|---|---|---|
| `1d10` | 20.0% | 20.0% | the author's rate, unchanged |
| `d8+d6+d10` | 20.0% | 20.0% | the canonical attribute+skill+motivation |
| `3d10` | 48.8% | 5.3% | the audit's case: median → accent |
| `d10+d12+d20` | 40.0% | 3.2% | |
| `4d20` | 34.4% | 0.1% | strict majority of four is a big ask |

The shapes Soul Deal actually plays cost nothing; only the crit-capable STACK
is rationed, which is exactly the pool that was drowning. **The threshold is
the tunable** — strict majority is a defensible default, not a law, and it is
one comparison in `soul-deal.critCeremony` for Joe to retune against play.
Pinned by unit tests (7 cases) and the `crit-budget` scenario, which was
verified to FAIL against pre-U18 behavior.

### U19. `playerId` succession for reveal and offer authority — SHIPPED

*Audit E2 (major).* Reveal authority and offer ownership are pinned to an
ephemeral `playerId` with **no fallback**. Lose your stream past the 5 s
grace, rejoin with a fresh id, and your own held rolls become unrevealable
*by anyone*, forever. An offerer who leaves strands an un-withdrawable gold
card; a claimed dice-tower offer from a departed offerer whispers to a dead
id — a roll nobody can ever see. Rolls got a universal-housekeeping escape
once collected (§7.7); offers and reveals did not, for no stated reason.
**Decided 2026-08-08 — SHIPPED.** Neither option as written. The two halves
have different stakes and got different answers:

- **Seat-name fallback: REFUSED, permanently.** `resolveVisibility`'s own
  contract is that *duplicate player names all join* (server.js:1376, :2045).
  Matching a departed authority by name would let anyone sit down under the
  roller's name and reveal their held rolls — a privacy hole traded for a
  convenience. Any real succession needs durable identity, which GOALS
  defers. This is the same bet as U3, and the answer stays "not yet".
- **Offers: §7.7 extended.** An offer whose creator has left is table
  furniture — the invitation was public and its spec was public the moment
  it was made, so withdrawing discloses nothing. Anyone may now rescind an
  orphaned offer; while the creator is present it stays theirs, unchanged.
- **Reveals: no fallback, but no longer immovable.** A held roll whose
  authority is gone stays unrevealable forever — that is the *correct*
  failure direction, and inventing a successor is the only way to get it
  wrong. What was actually broken is that it also could not be **cleared**,
  so it sat on the felt for the rest of the session. Clearing sends dice
  away and never discloses a value, so it is now universal once the roller
  is away. The values die with the seat; the felt comes back.

The client half matters as much as the server's: the banner and verdict card
paint their verb once, so a departure now repaints them (`repaintAwayVerbs`,
called from `renderPlayers`) from a local Dismiss to a real red Clear. An
empty roster reads as "we don't know yet", never "everyone left", so a
reconnect does not flicker red. Pinned by `orphan-clear`.

### U22. Modal semantics and the focus pass — SHIPPED

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
  *(Closed by U28 — this bullet shipped there, including the `#offer-pick`
  specificity fault it names.)*

**SHIPPED 2026-08-08.** One sweep, as the entry asked for.

- **The trap, and an honest `aria-modal`.** `openModal`/`closeModal` put every
  OTHER body child `inert` — which removes the rest of the page from the tab
  order, from hit-testing and from the accessibility tree in one property,
  rather than three hand-rolled mechanisms each getting it subtly wrong — plus
  a Tab wrap (inert bounds where focus may GO, not where it wraps) and focus
  RETURN to the opener. `role`/`aria-modal`/`aria-labelledby` are now set by
  that same function, so the annotation and the containment cannot ship apart:
  the audit's finding was a true `aria-modal` on a dialog Tab walked straight
  out of, which is a promise to AT that the rest of the page is not there.
  Applied to `#help-overlay`, `#kbd-overlay`, `#settings-modal`.
- **The focus ring.** `.cmd-in:focus { outline: none }` had nothing put back —
  the primary text input and the command palette, no indicator at all. It is a
  **box-shadow**, not the border swap the file's three other instances use,
  because `.cmd-in`'s border already carries a STATE (`.cmd.is-invalid` paints
  it red) and a focus indicator that overwrites the error is a worse trade
  than none. Two channels: border says valid/invalid, ring says focused, and
  the invalid ring is red so the two never fight. Plus `aria-invalid` and
  `aria-describedby` pointing at the slot that was already the validator's
  voice — the wire between them was simply never run.
- **Names.** `aria-label` on every glyph-only button (`⚙ ≣ ? ❯`, the corner
  clear, `.die-x`, the cheatsheet `?`): accname never reaches `title` for a
  button that HAS content, and `⚙` is content, so a title-only icon button
  announces as its glyph and nothing else. `title` stays — it is the sighted
  hover read, and both say the same thing on purpose.
- **A seg is a choice.** `segSet` — the single place all four popover segs are
  painted — now emits `radiogroup`/`radio`/`aria-checked` with a roving
  tabindex and arrow-key selection, replacing `aria-pressed` (which says "this
  button is on", invites turning several on, and says nothing about the four
  being one decision — on Visibility, the control whose mistake cannot be
  undone). `#zoom-picker` no longer sets both `aria-pressed` and
  `aria-checked` on `role="radio"`; pressed is not valid there, so one of the
  two was always wrong.
- **Reach.** `.rd-x` is tabbable — it was `tabIndex=-1` three lines under a
  comment calling the touch version of the same omission a trap, and Esc
  (which drops the whole pick) was the only other undo. Shelf markers are
  `role="button"`, `tabIndex=0`, named per-render with Enter/Space: they were
  unlabelled tabindex-less `<div>`s, so the table's history was a flat 2.1.1
  failure and a keyboard player could not reveal their own held roll at all.
- **Structure and focus retention.** An `<h1>` and a `<main>` where there were
  neither, `aria-label` on the panel so it is a named region rather than an
  anonymous "complementary", `scroll-padding-top: calc(var(--draft-h) + 34px)`
  so Shift+Tab does not park a focus ring under the sticky well, and
  `keepFocusThrough` on both rail renders — they rebuild from
  `textContent = ''`, so picking three pools by keyboard cost three full
  tab-walks from the top while the expanded twin kept focus throughout.

Pinned by `a11y-modals`, verified to FAIL when `openModal` stops setting
`inert` — i.e. it catches the exact "annotated but not contained" shape the
audit found, which an attribute-only assertion would have passed.

### U24. Ordinals versus the dealt rack — SHIPPED

*Audit G4 (moderate).* `1 2 3 Enter` — the roll the design says the surface
exists for — **cannot be typed on the rack the app deals**.
`dealStartingRack` seeds 9 attributes, then skills at ordinal 10 and
motivations at 16; ordinals render only for `ord ≤ 9`, and there is no
reorder affordance. UX.md asserts the claim in the paragraph *directly above*
the dealt-rack amendment that broke it (1536-1539 vs 1542-1563), and
main.js:10948's comment advertises a sequence that now means Strength + Wit +
Intelligence. **Either interleave ordinals across shelves or re-scope the
promise; either way fix both doc sites and the code comment.**

**Decided 2026-08-08 — SHIPPED.** Interleaved. The nine digits are dealt
ACROSS the shelves rather than down the first one: `digitPools` gives every
non-empty section at least one slot, then hands the remainder out largest-
section-first. On the rack the app actually deals (18 pools — 9 attributes,
6 skills, 3 motivations) that lands 3/3/3, so `1 4 7 Enter` is an attribute
plus a skill plus a motivation — the cross-section roll the surface exists
for, and the exact roll the old ordering made untypable. `digitOf` reads the
position back out of `renderedPools`, so the badge and the key agree by
construction rather than by a parallel count. Pinned by `digit-reach`.

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

### U28. The coarse-pointer size pass — SHIPPED

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

### U29. iOS text-input zoom and the keyboard-occluded foot — SHIPPED

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

### U30. A short-viewport branch that trims the well, not the rack — SHIPPED

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

**SHIPPED 2026-08-08 (U28, U29, U30 together).** Every rule is in `css/style.css`
plus one line of `index.html` (the viewport meta gains
`interactive-widget=resizes-content` and NOTHING else — `initial-scale=1` with
no `user-scalable=no` and no `maximum-scale` is what keeps pinch-zoom alive,
and pinch-zoom is what makes an undersized target recoverable rather than
impossible). Pinned by `touch-targets`, which walks a LIST rather than
asserting one control — the audit's finding was that seven of the eight
`(pointer: coarse)` blocks fixed *visibility* and exactly one fixed *size*,
and nothing caught it because every touch assertion pointed at the same
button. U30's branch gates at **max-height: 780px**, deliberately a height
question and not a touch one (a 1366×768 laptop has the identical problem),
and deliberately below 800 so the 1440×900 class — where the rack already
gets ~349px and there is nothing to buy — stays out of it.

**Two cascade faults, both worth keeping on the record.** `#tray-mods` carries
no `class="btn"`, so `.draft-actions .btn`'s coarse rule never matched it; it
reached row height only because `align-items: stretch` dragged it there. And
`#offer-pick { padding: 4px 6px }` is (1,0,0) against the coarse rule's
(0,2,0) — **media queries add no specificity**, so the id won regardless of
source order. Both are answered at id weight. The markup fix for `#tray-mods`
is deliberately NOT taken: it has a full dress of its own at `#tray-mods`, and
adding `.btn` would layer a second one under it for no behavioural gain.

### U28a. The rack's delete ✕ needs a layout change before it needs a bigger target — SHIPPED

**Found by LOOKING, after U28 shipped and was partly reverted the same day**
(`tools/steps/touch-look.mjs`, `touch-manage.png`). `.tile-del` went 24 → 36
with the rest of the batch. It measured correctly and every assertion passed.
It was also visibly broken: a pool with a count wears its `×2` badge
immediately left of the ✕, and at the shipped 24px the badge's right edge
*already* overlapped the button's left edge by 2px — a designed near-touch
with no free space beside it. At 36 that overlap is **14px**, so the button's
box lands on top of the "2" on every counted pool (5 of 18 on the dealt rack).

Ink/target separation — how `#edge-toggle`, `.die-x` and `.sw` all reach 34+
in this same batch — does not rescue it: the halo would still swallow the
badge, and this is the rack's one destructive control with **no confirm and no
undo** (js/main.js filters and saves on the first tap). A hit area that
quietly extends over a neighbouring label is exactly how the wrong pool gets
deleted; a bigger target is worth less than the accident it invites.

**SHIPPED 2026-08-08, both halves.** The ✕ came off the corner and became a
**rail**: in manage mode the tile is `[content | 34px rail]`, `.tile-stage`
gives up the width and the ✕ takes the full height of what it gave up. The
badge and the button no longer share an axis at all, so there is nothing left
to collide. Flush to the right edge is safe here in a way a flush corner was
not — a miss to the right crosses the 6px grid gap into the NEXT tile's left
side, which is its stage/edit door, so the worst miss is a wrong-tile *edit*,
never a wrong-tile *delete*.

And the **undo is a tombstone in the slot**: the deleted pool leaves a
ghost-footprint cell reading `↩ Undo` exactly where it stood, which is where
your eye and finger already are. No toast, no timer racing the read, no
z-index, nothing to find. It restores at the REMEMBERED INDEX (clamped) —
a pool that reappears somewhere else has not been restored, and on a rack
with digit shortcuts it would silently move under the keys. One slot, not a
stack, and it closes when manage mode does: an undo that outlives its gate is
a stale door. Pinned by `pool-undo` (including the delete-from-the-middle and
last-on-shelf cases) and by `touch-targets`, whose delete assertion is now a
NO-OVERLAP check rather than a size — a size assertion alone is exactly what
passed while the shipped control was visibly broken.

**And it happened again, in the same commit.** The tombstone's gold dress sat
150 lines above `.ghost-add .ghost-plus` at the identical (0,2,0), so
ivory-at-0.4 won on source order and the rescue rendered as grey furniture —
indistinguishable from the `+` ghost beside it. Caught by looking; every
assertion was green. That is three equal-specificity source-order losses in
this file in as many weeks, which is the argument for U23's token layer.

**The tooling lesson generalises.** `rail-look` and `panel-look` both frame a
FINE pointer at a tall desktop viewport — the one configuration U28/U29/U30 do
not change — so they were structurally incapable of showing this batch at all.
`touch-look.mjs` is the third look tool: coarse pointer, tablet portrait, plus
a short-laptop frame for U30's height branch. A coarse-only rule is invisible
to a tool that never emulates touch, which is the same blindness the audit
found in the suite itself.
