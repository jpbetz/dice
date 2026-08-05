# Roadmap

Sequenced against [GOALS.md](GOALS.md) (the authority on priorities: core
mechanics → organization → secrecy → systems literacy → effects →
customization) and the 2026-07-30 goals audit, which verified every gap
below empirically. [UX.md](UX.md) holds component specs; its §3 is now the
as-built role-free visibility spec and the rescinded DM seat is gone from
the docs (step 4's sweep).

## Tier 0 — Performance & foundation (2026-08-04 audit)

*Sits above Tier 1 on purpose: a broken invariant outranks a new feature.
GOALS.md pins `always interruptible` (skip to complete result in
`<150ms`) as an invariant, and the audit found it broken on any lived-in
table.*

Bench + review pass 2026-08-04 (perf-audit workflow, 4 empirical benches
under `tools/drive.mjs` × 4 hot-path code reviews × adversarial
verification; the measured baseline is pinned in
`.claude/…/memory/perf-baseline.md`, so future changes have a
before/after). Findings are sequenced by **impact** — player-felt
magnitude × frequency — not by fix cost; the cost gradient is called out
inside each section so the ship order remains visible. Numbers below
were measured on headless SwiftShader; JS wall-clock inside a function
transfers to real CPUs (rAF throttling only affects render fps, not JS
execution), so the roll-arrival milliseconds are real. Reported ms are
capped at what benches proved; anything softer is called out.

### 0a. The roll-arrival pass — SHIPPED A+B 2026-08-04; C reverted, redesign pending

**Shipped (2036b9b, 3ed606d):** Per-die settle + SAP broadphase. A
landed die now freezes to STATIC mid-sim without waiting for the
group's slowest sibling — kills the group-clock reset that made one
twitching die drive the whole roll to the 9 s cap. SAP broadphase
retires the O(N²) shelf tax (`js/main.js:446`); verified against a
new `perf-determinism` cross-client keyframe-hash e2e (1d20, 8d6,
20d6 — bit-identical across clients under seeded throws). Bench
after A+B: `8d6-loaded` collapses from ~139–349 ms baseline to ~117 ms
max longtask (under the 150 ms budget); large mixed-die rolls (10d20
+ 10d12 + 10d10 + 10d8) still hit the SETTLE_CAP at 540 frames and
report ~1 s of longtasks in the arrival window — Commit C is still
needed to close the invariant for that class.

**Reverted (Commit C, sliced fast-forward, `1fbb2c9` → `e612d25`).**
The workflow's implementer shipped a sliced producer/consumer that
correctly kills the sync burst (≤ 0.4 ms `commandRoll` wall for every
case). But the adversarial verifier caught two real defects on the
exact code path C targets — large plain rolls:

- **Face-correction pop.** `d.correction` starts identity; playback
  starts at frame 3 with identity in effect; `finalizeProducer`
  doesn't run until all dice settle (many slices later); every die
  visibly pops by up to 180° when finalize fires. Ceremony rolls
  hide it via the 1.35 s declare hold; plain rolls do not. The
  `perf-determinism` scenario hashes raw keyframes, not the applied
  correction — the pop passes tests undetected.
- **`ringIdx` race.** `roll.ringIdx` is null until finalize; a
  loud ringing landing consumed before finalize consumes `sIdx ===
  null`, and when finalize later stamps `ringIdx` to that
  already-consumed index, `postStack.ring()` is silently dropped.

**Next design for C** (candidate — needs Joe's sign-off): hold
playback until `finalizeProducer` completes, and slice the producer
across rAF frames. Arrival returns immediately (no sync burst); dice
hold at spawn poses while the sim slices; playback begins with
correction already computed (no pop). Cost: brief hold at spawn for
large rolls (~150–300 ms for 40 mixed dice at the current 8 ms slice
budget). Under the invariant, and eliminates the pop by construction.
Compute `ringIdx` eagerly (max-so-far during production; unlock the
firing only after `producerDone`, with a retroactive fire at the
current playback time if it points at an already-consumed sound).

**Also standing open** (§0a stretch): the `perf-slicing` scenario
the design named — direct sync-vs-sliced bit-identity — was skipped
in the workflow. When Commit C reships it should include that scenario
so the equivalence claim is checked, not inferred.

### 0b. Boot & bandwidth — every visit, every reconnect, remote-player-felt

Small changes, huge win for anyone not on localhost. **Ship this pass
first if optimizing for user-facing wins per line changed** — it's a
half-day of work.

- **Server `LOG_CAP=100` (S3, ONE LINE, immediate 50% reduction).**
  `server.js:54` caps the log at 200, `js/main.js:44` caps the client
  at 100 — every hello ships ~50% dead weight the client discards on
  arrival. `server.js:54` from 200 → 100 halves the payload with zero
  protocol change and no consequence. This lands before any
  Last-Event-ID work.
- **Vendor `if-modified-since` handling (S3, ~6 lines).**
  `server.js:1821-1834` `streamFile` always answers 200 with the full
  body under `Cache-Control: no-cache` and emits `Last-Modified`, but
  grep of the file finds **zero readers of `if-modified-since`** — the
  revalidation the headers invite can never succeed. Browser reload
  measurement: 1,619,828 bytes re-transferred, status 200 both loads,
  for immutable-by-project-rule files. ~6 lines: compare
  `req.headers['if-modified-since']` to `stat.mtime`, answer 304. For
  `/vendor/` specifically go further: `Cache-Control: public,
  max-age=31536000, immutable` — those files are never edited by rule.
- **Last-Event-ID delta hello (S3, half a day, protocol work).**
  Hello and `/api/join` reship the whole log on every stream (re)open
  (`server.js:590-595, 543-550`); no `id:` field is written, no
  `Last-Event-ID` is read, so EventSource's native resume is unusable.
  Realistic mixed 200-roll table = 108 KB per hello; heavy 40d6 =
  765 KB — every proxy blip pays that. Stamp broadcasts with `id:
  <room-scoped seq>` in `sendEvent`, honor `Last-Event-ID` in
  `handleEvents`: when the client's last id is still inside `room.log`,
  send only the newer entries plus current players/offers/settings.
  Care needed: entries mutate in place after broadcast
  (`revealed`/`cleared`), so a naive resume can miss a flag flip — the
  delta must carry those state deltas separately or replay from before
  the last mutation. Not urgent, but the biggest bandwidth cut once
  the LOG_CAP alignment lands.

### 0c. GPU idle discipline — SHIPPED 2026-08-04 (`84c1074`)

**S3, closed.** The gate now mirrors `collectShimmerSources` and
excludes shelved bloom dice from the wake predicate;
`PostStack.render` brackets `renderer.shadowMap.autoUpdate = false`
between the base and glow renders (one shadow-map pass saved per
stack frame). Bench after fix (same headless reproducer as the
audit): 4 bloom dice shelved on an empty felt drops from ~905 µs/frame
to ~538 µs/frame — ~370 µs saved per frame, `postInfo.active`
observable flips false. Level 5 bypass equivalence held (empty table
renders the released direct path before roll AND after clear). New
`postInfo().bloomDiceLive` (felt-only) drives the gate; `bloomDice`
(felt+shelf) kept for pin compat. Extended `themed-post` e2e pins the
observable. Verified adversarially — reveal, whisk, hello-resync and
shelved-die reveal-in-place all funnel through `shelveRoll`, and the
gate exemption keys on `shelfClusters.has(d.rollId)` (race-free —
`shelveRoll` sets the cluster before any tick could read the state).

The findings, for the record: after collect the table's resting state
has 40+ dice sitting on the shelf. `js/main.js:3671` gated the post
pipeline on `tableDice.some((d) => d.mesh.userData.bloom)` — and
`tableDice` includes shelved dice (compare `js/main.js:3687` where
shimmer explicitly excludes the shelf). Any of the six glowing sets
(tidewrack, stormcall, rimehold, emberforge, arcanum, umbra) kept the
full bloom stack — mask render + threshold + 4 blur passes + composite,
plus a second full 2048² PCFSoft shadow-map render — running every
frame the archive was on screen. Headless: 1658 µs/frame with 4 bloom
dice on the felt vs 1104 µs stripped (+50%); 1199 µs with all four
shelved. Felt as fan noise / battery drain on laptops, dropped frames
on integrated GPUs — never a hitch, hid forever.

### 0d. Server hygiene — operator-side risk, silent room retention

- **SSE write backpressure (S4 operational, unbounded server memory).**
  `sendEvent` (`server.js:350`) ignores `res.write()`'s return value,
  and the heartbeat (`server.js:378-392`) only checks
  `res.writableEnded/destroyed` — a stalled-but-established socket
  buffers forever. Grep confirms `writableLength/drain/highWaterMark`
  appear nowhere. Measured: **50 SSE streams opened and never read =
  +10,984 kB server RSS**, and the zombie non-reading client keeps
  `player.clients` non-empty, so `scheduleReap`
  (`server.js:597-602`) never fires and the room + its log are
  retained indefinitely — "last player leaves, room dies" silently
  stops being true. Fix: in `sendEvent` and the heartbeat, treat
  `res.writableLength > cap` as a dead stream (endStream + destroy);
  change `endStream` on eviction/dead paths to `res.destroy()`
  instead of `res.end()` so buffered data frees immediately.
- **Broadcast serialization dedup (S2, small).** `server.js:368-376`
  loops players × streams calling `sendEvent`, which
  `JSON.stringify`s inside the loop — one payload is serialized up to
  P × 4 times (160 caps). Measured 0.89 ms per broadcast at cap;
  imperceptible today, first bite if room caps ever grow. Memoize
  serialization per distinct payload; cache the shared redacted copy
  in the `projectFor` closure. Note only; not urgent.

### 0e. Endurance — the roller-side node/listener leak

**S3, needs numbers before touching.** After 60 rolls, the roller's tab
holds **15,141 nodes / 634 listeners** vs a late joiner rendering the
identical room state at **7,585 / 414** — a ~2× gap that doesn't come
back on collect. ~7 extra listeners per roll, monotonic. Not measured
under normal-length sessions; the trajectory says "hours of play, real
memory pressure." **Do heap-snapshot detached-node hunting first** to
name what's retained (chips? shelf markers? ceremony strips? popover
closures?), then a targeted fix. Do not blind-refactor.

### 0f. The seat survives a refresh — SHIPPED 2026-08-04 (Joe's report)

**Closed.** "When I refresh my browser, the player pills show two
players with my name briefly… my color changes on the reload instead
of being preserved." One cause, both symptoms: `/api/join` minted a
new `crypto.randomUUID()` seat on **every** page load and took the
next `colorCursor` hue, while the abandoned seat lived on until its
stream close reaped it `DISCONNECT_GRACE_MS` (5s) later. Every
refresh was a *stranger joining* as far as the room was concerned.

- **The tab remembers its seat** (`js/net.js`,
  `sessionStorage['dice.seat.v1:<room>'] = {id, color}`) and offers it
  back on join. `sessionStorage`, not `localStorage`, is the whole
  design: it is scoped to the browsing context, so a reload resumes
  while a SECOND TAB is genuinely a second player — which is what a
  shared screen expects, and what the e2e harness relies on when it
  seats several tables against one origin.
- **`/api/join` RESUME** (`server.js handleJoin`): a known seat id in
  a live room sits back down — same `playerId`, same color, same
  snapshot, and **no `player-joined` broadcast**, so no other screen
  blinks. The id IS the credential (every mutating POST already
  carries it alone), so holding it is authority enough; an id the
  server has no record of is never adopted, it falls through to a
  fresh seat. Resume runs AHEAD of the entity caps: it adds no
  player, so a FULL room must still let its own players reload.
- **`scheduleReap` never shortens a pending grace.** A refresh races
  two timers — the dying tab's stream close (5s) can land after the
  new tab's join has asked for the full `JOIN_GRACE_MS` (60s), and
  the shorter one would reap a seat that is mid-resume.
- **Color is a preference, not a claim.** A seat that lapsed
  entirely (grace expired, server restarted, room recycled) asks for
  the hue it wore; `keepColor` honors it when it is a real palette
  entry and nobody in the room is wearing it, otherwise the
  round-robin cursor answers — and the cursor only advances when it
  is the one that answered, so an honored request never burns a hue.
  The silent re-join path carries the preference too, which is what
  keeps a color across a server restart.
- **`forgetSeat`** is the difference between LEAVING and reloading:
  'Leave & switch seat' drops the remembered seat (by room name, so
  it also clears one left by a solo boot) or the fresh join would
  resume the player who just left.

Covered by `seat-resume` (tag `seat`): same id + color across a real
`Page.navigate` reload, a watcher's raw SSE stream seeing **zero**
join/leave/rename events across it, exactly one Alice on every roster,
the resumed seat still rolling under its own name, a second same-origin
tab still a separate player, leave clearing the seat, and the color
preference honored when free / refused when worn.

### Refuted, recorded so they stay dead

- **`renderTray` layout thrash.** Real (16 forced reflows per palette
  tap, +18 recalc, ~20 ms wall) but the fix-attributable share is only
  ~5 ms of a ~20 ms tap; the full tap is under the 150 ms budget and
  the loose-die overlay cap holds ✕ count at 7 regardless of dice
  count. Skip.
- **`projectEntryFor` per-recipient allocation.** Measurable
  (~1 ms/broadcast at 40-player caps) but not player-felt; folded into
  the S2 "serialization dedup" note in §0d — not standalone work.

### Healthy patterns to protect (verified by the same pass)

- Level 5 post bypass **is** bypassing when idle (empty table renders
  the released direct path, proven at 61.8 dB PSNR — the audit
  reconfirmed it).
- The `(type, set)` material cache is doing its job — no per-roll
  material rebuild.
- `measurePeek`/`positionPeek`'s write-only rAF discipline holds (no
  forced reflow per animation frame).
- The `--draft-h` ResizeObserver keeps the shelf-head pin fresh under
  every non-`renderTray` height change.
- Server projection is honest: every egress path runs
  `projectEntryFor`, and the pass found no leak of hidden values.

## Tier 1 — Core mechanics completion

### 1. Notation totality closeout

Close the audited invariant violations so saved pools, history, and `#g=` links
carry a roll's FULL intent:

- Implement UX.md §7.6: `check` / `cinematic` trailing flags,
  `# Title | Subtitle` pipe split, `exp` in parse results and canonical
  output, popover Moment round-trip.
- Give face-down a canonical spelling that survives round-tripping
  (shipped as the `held` trailing flag — the `/gmroll` family normalizes
  to `secret` since the terminology amendment, UX.md §3.2), so saved
  variants stop silently dropping privacy.
- Small-batch correctness from the audit: banner breakdown shows struck
  dice and ✴ children (attributed-math invariant); plain-roll playback
  skippable (click/Space fast-forward — the machinery exists); reveal
  state replayed on hello resync (mirrors `cleared`); `/api/join` carries
  `offers`.

### 2. Interpretation system profiles v2 (goal 6) — REVISED 2026-07-31

**The Soul Deal correction (from the system's author, via Joe):** dice
values do NOT sum. Each die is read INDIVIDUALLY against the chart — the
chart's rank columns (Mug … Bóaire) are DIE ranks, not pool sizes: a d4's
face reads the d4 column, a d20's the d20 column. A 2d4 roll of [1, 4] is
one Blemish and one Minor Success — N dice, N outcomes. Totals, modifiers,
DC targets and keep/drop are mechanics of OTHER systems and simply do not
apply under Soul Deal (they keep existing app-wide; the profile decides
what a table reads). The shipped sum-based soul-deal profile — including
the 2026-07-31 natural-crit gate and its unit tests — is superseded by
this rework and gets replaced, not patched.

- **Profile interface v2**: a profile declares its READ, semi-generically —
  `aggregate: 'sum' | 'per-die'`, `usesTotal` (gates the big total, DC
  verdicts and margin lines), `usesMods` (the ± popover marks non-applying
  mechanics as such under the active system), `outcomesFor(entry)` →
  per-die `{dieIndex, word, tier}` list for per-die systems, `meaningFor`
  (the hero word) for sum systems, plus the crit predicate.
- **Soul Deal profile**: per-die chart read (null cells = a quiet die, no
  outcome word); the result surfaces show OUTCOME CHIPS — each die's art
  token beside its word, tier-colored — instead of a total; a tally line
  summarizes ('2× Success · 1× Blemish'). Crit fanfare fires on any die
  landing a crit row. The banner/verdict hero slot, log lines, peek and
  per-die value chips all read through the profile (the §2.5 seam).
- `dnd` and `none` keep their sum/total behavior unchanged.
- Success counting (dice-pool systems) becomes trivial under this
  interface: another per-die profile that counts outcomes.

### 2b. Multi-pool rolls & pool groups (goal 6 + goal 5) — NEW 2026-07-31

Soul Deal play composes a roll from SEVERAL pools (attribute + skill +
motivation), and Joe wants this semi-generic — it is useful under every
system:

- **Dice-term attribution in notation** (the foundation; preserves
  notation totality): `3d6[Strength]+2d8[Swords]` — attributed DICE terms,
  mirroring the existing `+2[Proficiency]` modifier grammar. Parser,
  canonical form, rollspec perDie `source` label, server re-parse, codec.
- **Pool categories**: saved pools gain an optional group ('Attributes',
  'Skills', 'Motivations'); the Pools panel renders category sections;
  manage mode edits the category; `#g=` codec v3 carries it (backward
  compatible).
- **The Pools Rack (agreed with Joe 2026-08-01)** — sources add, the pool
  rolls: pools render as TILES in category-section grids (the palette's
  own tile idiom — art on top, name beneath; tile icons replace die art
  later, die art is the v1 default). Tapping a tile STAGES its dice into
  the sticky draft cluster (source chips, one ✕ each; loose palette dice
  keep per-type ✕); ONLY the draft wears gold/the ROLL cue. Digits stage
  by rendered order; Enter rolls the draft when one exists (else keeps
  the last roll); Esc clears it (else sweeps). Sticky section headers,
  fixed trio order (Attributes/Skills/Motivations, others, uncategorized).
  Owner switcher: players' pools publish to the room (name+notation+
  category; localStorage stays owner truth); foreign lists show a standing
  'BOB'S POOLS · read-only' banner-chip (also the way back), stage-only
  (no ±/manage), drafts persist across switches, chips snapshot notation
  at stage time, digits always act on YOUR pools. Staging a modded pool
  sets +N/dc aside with a one-line whisper on its chip. First stage from
  the hover flyout promotes it to the pinned panel. Small windows: dense
  chip line + dots-only switcher + sticky headers (720x480 e2e).
  Build order: ① dice-term attribution → ② categories+codec v3 →
  ③ staging inversion + keyboard → ④ pool publishing + switcher →
  ⑤ source-grouped results. **All five shipped 2026-07-31** (`7740f30`,
  `d092e84`, `4d1b67a` + the source-read commit): racks publish via
  `/api/pools` ('pools-changed', display copy — localStorage stays owner
  truth), and attribution rides `spec.sources` on the wire (present-or-
  absent; redaction drops spec wholesale, so hidden rolls stay hidden).
  Breakdown, tally and log group per pool; rerolls keep their labels
  (sources join the canonical and ride the notation shape — the same
  single-carrier rule as visibility). Still open from the critique:
  the 720×480 small-window e2e pass. Also open (Joe's 2026-08-03 play
  notes): tap-to-stage was hard to discover — consider drag-and-drop
  from tile to draft/felt as an *additive* affordance (tap stays the
  primary; DnD is the intuition players arrive with).

### 2c. The Sheet Pass (2026-08-01) — SHIPPED

Editing un-bolted (designed by a 4-design judge panel; docs/UX.md §7.9
records the full contract): the pool popover grows an identity strip
(rename in place, shelf chips, die-rank ladder fail-closed to NdX); ghost
'+' tiles end every shelf (creation card, newborn contract, the shelf IS
the category); the save morph gains shelf chips; manage mode slims to the
destructive gate (standing bar + grown ✕, per-tile ✎ retired); the
notation card slims to the complex-pool escape hatch.

### 2d. The Trigger Pass — one way to roll (2026-08-03) — SHIPPED

From Joe's 2026-08-03 play notes; refines the 2b/2c surfaces while they
are fresh, and settles where offers live *before* targeted offers (4b)
builds on that surface. **Shipped same day** (docs/UX.md §7.10 records the
contract): popover = pure editor (tray live-syncs into the box canonical;
group commits with ONE Save by id + Duplicate…; shelf goes Open in draft);
Offer lives on the draft row, hidden solo; the identity strip composes
counts like the creation card (pure-dice pools, last-die guarded, 40-cap);
per-die tables fold the sum-world sections behind 'Show anyway'; the
result banner and offer cards hold fixed geometry. The original brief:

- **One roll trigger.** The ± popover loses `Roll` and `Offer to table`;
  every roll and offer fires from the draft's ROLL ❯❯❯ strip. The
  popover becomes a pure editor — tweaks land in the draft (or write to
  the saved pool), never roll directly. This extends the staging
  inversion (sources add, the pool rolls) to its last holdout.
- **One commit verb.** Editing a pool shows both 'Update this pool' and
  the save morph side by side — confusing. One primary Save that writes
  by id; the additive twin demotes to an explicit 'Duplicate…' or leaves
  the edit flow entirely.
- **Count editing composes.** The identity strip's die-rank ladder swaps
  rank only; Joe expected the creation card's idiom (tap palette dice to
  add, tap preview units to remove). Give pool editing the same
  composer — one idiom for building dice everywhere.
- **Hide non-applying mechanics.** Under a per-die system (Soul Deal)
  the ± popover still renders sum-world controls (keep/drop, DC, mods)
  with a note; hide them instead, behind a small disclosure so they stay
  reachable. Supersedes step 2's 'marks non-applying mechanics as such'.
- **Layout stability.** Tiles change height with long names, and the
  ROLL ❯❯❯ strip resizes when a ×2 chip appears. Fixed tile geometry
  (clamped two-line names), reserved multiplier space, constant-width
  action strips — ambient chrome never jumps under state changes.

### 2e. Result-card IA under per-die systems (2026-08-03) — SHIPPED

The reveal/result surface accumulated per-die outcome chips, the tally,
the hero word, and the action strip — nearly all of it *needed* under
Soul Deal, but muddled as a layout (Joe, 2026-08-03). **Shipped same day**
(UX.md §7.12): the diagnosis was DUPLICATION at equal weight — the tally
line and the breakdown line repeated the same source labels, and reading
which die said what meant cross-referencing the two. The fix is ONE
structure: each pool is a ROW — label leading, then one chip per die
[dX face → tier-colored outcome word]. The word answers, the face is
evidence beside it; the separate breakdown line folds wherever rows stand
(banner, verdict card, peek — the log keeps its compact line). The
verdict ring stops showing the dice-count-as-total (the exact confusion);
under per-die its center is empty and the rows are the verdict. The text
layer keeps the whole story row by row for copy/paste and screen readers.

### 2f. The Workbench + reroll clarity (2026-08-03) — SHIPPED

The ultracode draft-zone pass (judged 3-way design panel): the draft
became a WELL over a RAIL — the well wears the same recessed dress as
the notation box (one draft, two editors, both finally looking like
editors) and holds the ± inside it; the rail's verbs (Save · Offer ·
✕ Clear) STAND while a draft exists instead of hiding behind hover
(UX.md §7.14). Reroll clarity rode the same pass: exactly ONE clear
affordance per collected roll chosen by the opening gesture (§7.15),
every replay trigger says REROLL ❯❯❯ (the draft keeps plain ROLL), and
the log carries server-substantiated reroll provenance — `rerollOfId`
gated AT BIRTH by `entryExistsForAll`, so a reroll of a secret roll is
recorded as a plain roll and no existence oracle forms; the newest row
wears a quiet 'reroll' chip, the superseded row 'rerolled'. Verified same day: the
two-lens fleet (suite runner 47/47 ×3 + adversarial, 3 confirmed findings
fixed) and the pre-release sweeps after (49/49).

### 2g. The beacon pass — the draft well goes further (2026-08-03) —
SHIPPED

Delivered same day as Joe's cleanup batch (UX.md §7.11b records all
three): the FEED (two converging gold funnels, shapes not words, framing
the workbench so the palette above and pools below visibly pour into the
well), stepped heat (the funnels brighten, the well gains its gold
under-glow, the standing ROLL whisper gathers toward 0.55 as dice land —
light and depth, never size), the FOLDED CARD (the banner's body is the
one big removal target with a red ✕-watermark dress — slate for a
spectator's dismiss — and the fold below holds REROLL/Reveal untinted),
and the HOVER READ (inverted-hull WebGL outlines on the roll's dice,
one color per source pool). The original sketch:

Joe, after the Workbench (§7.14) landed: "the Roll ❯❯❯ looks a LOT
better. What if we were to take it further? … make the UI around it even
more eye catching, and the Roll ❯❯❯ overlay even stronger and more
compelling." A design-first pass (small panel, like the Sheet Pass) to
escalate the draft well's stage presence: the well as the panel's
unmistakable center of gravity, and the ROLL cue as a promise you can
feel — treatments to explore include gold that gathers as the pool
grows, a deeper well, a cue that breathes on approach. Constraints that
make it interesting: P1 still holds (an EMPTY well stays quiet — the
escalation keys on a draft existing, intent already shown), gold stays
the roll verb's alone (this pass spends that budget deliberately), fixed
geometry (§7.10 — presence from light and depth, never from size
jitter), and the tier rule (the rail's verbs don't get louder just
because the well does). Naming note: the chrome never says "tray" — the
thing is the DRAFT in its well; any new visible label speaks that
vocabulary.

### 2h. THE SIDE PANEL — the felt owns zero standing chrome (2026-08-04)
— SHIPPED

Joe's call, iterated live: the Pools panel is a dedicated layout COLUMN,
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

### 2i. THE SOUL DEAL AUDIT — reveal read, chrome consistency, material,
labs (2026-08-04) — **ALL SIX FAMILIES SHIPPED same day** (UX.md §7.16
records the as-built laws; only E's `no-newcomer-path` stands open, by
design — Joe owns the orientation direction)

Joe asked for a UI audit of the left panel, the reveal panel, the collect
peek, and the check/cinematic screens under Your Soul Deal, with
multi-pool flow ("I find some of the presentation difficult to parse…
consider a table?"). 21 stills + a 5-lens adversarially-verified review
(33 findings survived, 2 refuted). Stills + the ledger prototype pairs in
`tools/out/souldeal-audit/` (scripts committed 943a949:
`souldeal-audit-shots.mjs`, `souldeal-ledger-proto.mjs` — the prototype
is runtime CSS injection only; full findings JSON sits beside the
stills). Severity S1–S5; each finding keeps its audit id.

**A · The reveal read (banner · peek · verdict share renderOutcomeRows)
— the LEDGER family. SHIPPED 2026-08-04 (`2631702`)**: the grid ledger
(oc-ledger label spine, per-pool .oc-cell hanging indent), layout-owned
chip gap with the copyable space kept, the exactly-once silence rule
(in-chip dash beside worded dice, one restyled 'quiet' for an all-quiet
pool), header demoted to a wrapping identity caption, oc-solo hero
scale for one-die rolls, reduced-strength tier borders, and B's ring
fold rode along (a hidden roll keeps the ring as its face-down stage).
Pinned by the `ledger-read` e2e. The findings as audited:

- S5 `chip-fusion` — `.oc-chip` is inline-flex, so the whitespace box
  between die evidence and word collapses: "d6 1Fail", "d10 10Critical
  Success". The pixels lie while copy/paste stays correct (the nbsp
  lesson's sibling: a gap belongs to the layout, never to a text node).
- S4 `rows-center-independently-no-shared-column` — every outcome row
  centers itself, so five pools give five left edges; the label column
  exists in intent, not geometry.
- S4 `row-wrap-orphans-worded-chip` — a wrapped chip carries no label
  and no hanging indent; the orphan can be the pool's ONLY worded die
  (still 16: WISDOM's answer floated unattributed). Worst on the verdict
  card, whose larger uppercase type wraps earliest.
- S4 `quiet-grammar-three-ways` — silence renders three ways (dim chip
  alone · serif "quiet" at outcome weight · nothing in the copyable
  text). ADJUSTED by the doctrine verifier: the in-chip mark ("d6 3 —")
  is mandated by the text-layer rule, but "quiet" STAYS in the answer
  slot (§7.9: a pool's answer IS the silence) — fix its weight only.
- S3 `notation-header-duplicates-rows` (+ `banner-header-wraps-mid-pool-
  name`, `peek-header-truncates-roll-identity`) — the loudest line on
  the card repeats what the rows say, wraps inside `[PEER RESPECT]`,
  ellipsizes on the peek, and orders terms canonically while rows keep
  staged order (the two lines on one card disagree — the lead's finding
  c). Demote to a quiet identity caption; the rows are the data.
- S3 `one-die-answer-not-hero-scale` — the layout ignores roll size: a
  one-die Soul Deal roll (the common case) renders its whole verdict as
  one 15px word where dnd shows a 52px gold total.
- S2 `card-chips-ignore-tier-border-felt-teaches` — the felt's value
  chips tier-color their borders; the card chips directly above them
  don't. ADJUSTED: apply at reduced strength so tier stays subordinate
  to the word.
- The ledger prototype (A05/A11/A12/A16 stills) is the proposed shape:
  two-column grid, right-aligned label spine, left-aligned dice cells,
  hanging indent free, quiet-dash, tier borders, demoted header. Two
  reconciliations for the real pass: chips left-align to the gutter
  (the CSS-table prototype centers them), and an all-quiet pool must
  not double-mark (dash + word).

**B · The ceremony cards. SHIPPED 2026-08-04 (`0ef95d5`; the ring fold
in `2631702`)**: intent card speaks its pools (spec.sources through
canonicalNotation), the verdict action row joins the rest-dim grammar
(the last invisible→visible holdout), chips keep lowercase mono under
the hero dress, and the hero's flanking hairlines fold under rows (as
generated content they'd have joined the ledger grid as stray items and
sheared the label column). The findings as audited:

- S4 `empty-verdict-ring` (lead b) — under Soul Deal the verdict ring is
  a giant empty gold circle: main.js ~L3397 sets the center to `''`
  while its own comment promises "the outcome count… so the ring stays
  a stage, not a lie". Comment/code drift; the A16 still shows the card
  with the ring folded and the ledger as its center.
- S4 `intent-card-drops-pool-names` — renderIntentCard (~L3317) omits
  `spec.sources` from its canonicalNotation call, so the declaration
  reads "2d8+1d10" exactly where "Wisdom + Sword" is the stake.
- S3 `verdict-actions-invisible-at-rest` — the verdict card still uses
  the invisible→visible grammar (opacity 0 action row) that the folded
  card retired everywhere else; banner/peek rest-dim instead.
- S2 `verdict-uppercases-shared-chips` — inherited text-transform makes
  the shared chips shout ("D8 5 PARTIAL SUCCESS"), breaking the
  lowercase-mono evidence identity the other surfaces keep.

**C · Action grammar & control consistency ("deepen consistency across
buttons on all surfaces"). SHIPPED 2026-08-04 (`d8673b1`)** under the
proposed rule set verbatim: the verdict fold builds through
appendCardActions (one codepath; the strip rerolls THIS card's entry),
one confirm-weight Reveal dress sized by surface, three visibility CODES
(disabled = grayscale drain; rest stays 0.45; absent = explicit
display:none — the fold strip's triple dim collapsed), destruction
hovers RED everywhere (✕ Clear table's gold hover gone), the steel-hover
law unscoped app-wide with the log ⟳'s gold written down as the density
exemption (reroll IS a roll act), and the draft ✕ anchored inside its
chip. The findings as audited:

- S4 `three-button-families-two-codepaths` (lead d, deepened) — the
  verdict card's icon row (⟳ / ✕ / Done, static markup in index.html)
  vs banner/peek's body-click-to-clear + REROLL strip (built by
  appendCardActions): a design split that is also a code split.
- S4 `reveal-verb-three-dresses` — Reveal (the completing act for a
  hidden roll) wears gold primary on the banner, a 10px chip on the
  peek, plain ghost on the verdict card.
- S4 `rest-dim-reads-as-disabled` — the resting reveal-tier opacity is
  numerically the disabled dress, and the fold's REROLL strip stacks
  three dim layers. ADJUSTED: fix by giving the three states three
  codes (disabled / resting-dim / absent), not by brightening rest.
- S3 `clear-family-five-dresses-gold-hover` — clear/destroy wears five
  dresses, and ✕ Clear table (the most destructive control in the app)
  invites with a GOLD hover — the color the language reserves for the
  roll act.
- S2 `done-word-three-meanings` — Done is three controls in three
  dresses (popover close-editor · pools exit-manage · verdict
  collect-or-dismiss role split). ADJUSTED: unify dress and hover; the
  role-split semantics are settled and stay.
- S2 `steel-hover-law-stops-at-panel-edge` — the "gold survives only
  where it means roll" neutralization is scoped to #left-panel; verdict
  Done/⟳, banner Reveal-ghost, log Clear and the corner pill still
  hover gold. ADJUSTED: unscope the law, with the log's per-row ⟳
  written down as the density exemption.
- S1 `tray-x-floats-between-chips` — the proximity ✕ renders in the
  gutter between adjacent pool chips, ambiguous about which pool it
  removes.
- Proposed rule set (the smallest that unifies): ONE DRESS PER VERB
  sized by surface · THREE VISIBILITY STATES, never invisible-
  interactive · HUE = ACT globally (gold rolls, red destroys, steel
  tools).

**D · Panel material — the stone/bronze vs steel/silver answer.
SHIPPED 2026-08-04 (`531360d`)**: Scheme C as recommended — the steel
got its body (gradient + bevel + seat shadow on palette tiles, pool
tiles, the rim), the column's muted tier re-tokened cool (#99a1a9, the
tray re-warms its own token on purpose), and the bronze-bleed balance
swept with C's hover-law pass (confirm borders ivory, pool-name hover
ivory; the ± editor-open rings stay bronze — the ± belongs to the roll
world, §7.14.1). The findings as audited:

- S3 `material-scheme-recommendation` — neither temperature swap:
  stone/bronze narrows the tray-vs-column contrast 2h just built;
  steel/silver splits the app into two temperature worlds and fights
  the ivory type. Scheme C wins: keep graphite/bronze, make the steel
  REAL (all three schemes with concrete CSS values live in the
  findings JSON).
- S3 `steel-has-no-body` — outside the tray, "steel" is flat
  translucent white over graphite: no gradient body, no bevel, no seat
  shadow, on palette tiles, pool tiles and the rim.
- S2 `temperature-schism-khaki-on-graphite` — the neutral re-dress is
  half-done: cool graphite panel tokens under warm khaki section heads.
- S1 `bronze-bleed-ambient-chrome` — bronze leaks onto non-roll chrome
  inside the neutral column through unscoped globals. ADJUSTED: sweep
  alongside the hover-law unscoping, one pass.

**E · Multi-pool flow. SHIPPED 2026-08-04 (`70bc4d8`) where it was
ours to ship**: the spent draft (survives its roll, cools until the next
edit — `spent-draft` e2e), and A's peek-identity wrap serves the
shelf-anonymity finding within the quiet-chrome contract until §6b's
seated-shelf decision reopens it. `no-newcomer-path` stands — Joe's.
(The chain rack → tray → reveal rows keeps staged order faithfully —
only the canonical header broke it, fixed in A. Staging itself
confirmed good.)

- S3 `rolled-draft-accretes-on-restage` — the draft survives its roll
  with no spent state: tapping pools for the NEXT roll silently doubles
  a pool (Wisdom becomes ×4), and tray ROLL + banner REROLL stand lit
  together as near-duplicate repeat verbs. ADJUSTED: any fix must keep
  the deliberate repeat-roll muscle memory — a spent/refresh cue, not
  an auto-clear.
- S3 `shelf-clusters-anonymous-at-rest` — collected rolls rest as
  unlabeled dice piles; identity requires hovering each in turn.
  ADJUSTED: any standing mark must respect the quiet-chrome shelf
  contract (dot-only markers, the peek does the talking) — explore
  within it, e.g. the peek's identity line made worth the hover (E's
  truncation finding compounds this). Joe's same-day seated-shelf idea
  (Tier 5 §6b: the cluster seated ON a visible card until cleared)
  would answer this wholesale, at the price of reopening the
  quiet-chrome contract — the §6b decision list owns that call.
- S2 `no-newcomer-path-to-first-stage` — nothing teaches "tap a pool,
  then ROLL"; the cut ghost text (Joe 2026-08-03) left the compose loop
  undiscoverable by inspection. Joe owns the replacement direction;
  standing, not new.

**F · Labs ("do we need more labs?") — yes, one, plus an index.
SHIPPED 2026-08-04 (`ccbca1f`)**: chrome-lab.html (the recommended
pose-driver shape exactly — the real app in an iframe, posed through
__diceDebug), tools/contact-sheet.mjs (per-directory captioned grids +
a top index), and docs/mockups marked ROTTED (README + per-file
banners). The findings as audited:

- S4 `no-chrome-lab` — lab.html covers 3D die materials; nothing shows
  the 2D chrome side by side, so cross-surface drift is only visible in
  after-the-fact still audits. RECOMMENDED SHAPE: a pose-driver —
  chrome-lab.html embeds the real app and poses states through
  __diceDebug (every hook this audit needed already exists): real CSS,
  real hovers, zero forked markup. Upgrade path to direct-import once
  the card builders extract from main.js (the C code-split fix).
- S3 `mockups-rotted` — docs/mockups/*.html have already drifted from
  the shipped app (<1 week); disqualifies the static-mockup shape and
  is a trap for agents told the mockups are load-bearing.
- S2 `contact-sheets-have-no-index` — each drive suite drops 20+ loose
  PNGs; a stitched index page per run would make runs reviewable and
  comparable at a glance.

**Refuted by the doctrine verifier (recorded so they stay dead):** a
worded "Collect" on the banner/peek fold (re-litigates §7.9's retired
Done — auto-collect owns the idle path); unifying the card strips'
chevrons with the tray's engraved lozenge (re-litigates §7.14.1's
same-day boundary: the cue overlay form belongs to card strips).

### 2j. The flow to collected + the one-way rim (2026-08-04, Joe's
same-day play notes) — SHIPPED

Two directives landing on the audit pass's fresh surfaces (`30289fd`,
`d2c7b30`; UX.md §7.16 holds both contracts):

- **"Cinematics have too many stages."** The ceremony's handoff into the
  standing banner is GONE: the verdict card is a folded card — body =
  the role-split clear target wearing the banner's removal grammar (a
  click mid-moment SKIPS first; always interruptible), fold = the built
  REROLL/Reveal, no ✕, no Done — and its clock (hover holds it) flows
  the roll STRAIGHT to the shelf. A hidden card stands until its reveal
  re-arms the clock. Check and cinematic alike: one card family. e2e:
  `ceremony-retire` rewritten to the new contract (flow lands on the
  shelf with no banner between; the body clears early; a held card
  stands then flows after reveal).
- **"One way to do most things."** The rim's Save and its whole inline
  morph retired — keeping a draft is pool editing's job (✎ ghost tiles
  mint with shelf-at-birth, the popover's Duplicate… copies, the peek's
  Save-as-pool keeps a rolled result; writes stay by-id only) — and the
  freed room lets the modifier tool wear its word: **± Modify** (Joe's
  pick list was Modify/Customize, never "Tweak"). The tray popover's
  standing title says *Draft* now, the vocabulary word.

### 2k. The panel anatomy pass — the quiet nameplate + the region head
(2026-08-04, Joe: "this all feels under defined") — SHIPPED

Joe asked for the panel's four regions (table & users · dice · roll
tray · pools) to read explicitly, unobtrusively, text allowed, "best UX
should win." Run as a four-entrant judged design panel (typographic ·
structural · identity-first · minimal, three adversarial lenses each +
a completeness critic); UX.md §7.17 records the shipped synthesis: the
table is NAMEABLE (room-wide `tableName` on the settings channel,
renamed from Settings → Everyone at the table), the rail wears the name
at its right edge (name → chosen ?room= key → NOTHING — never a
placeholder) and document.title carries it; `SAVED POOLS` heads the
rack with a rule-to-edge rank mark, yielding to the owner banner on
foreign racks; the dice and tray regions get deliberate NOTHING (the
pressed Dice segment and the bronze well already speak). e2e:
`panel-anatomy` (chrome, settings); stills in tools/out/anatomy/.
Follow-ups surfaced by the critic:
- roster-pill ↔ owner-chip duplication (one per-player surface for
  presence + pool-browsing) — **SHIPPED same day**: rail pill is the
  browse verb, `buildPoolsSwitcher` retired, aria-pressed steel dress,
  press-again-to-close, disabled in manage mode, `ROSTER_MAX` 4→6.
- ownership legibility mid-scroll on foreign racks — **SHIPPED same day**:
  `#pools-head.foreign` joins the sticky stack; category heads yield
  sticky in foreign state. One head, one dress, two states.
- the join modal's inability to show the table name pre-join —
  **still open**: settings arrive in the join response, so a pre-join
  peek needs a new endpoint or a name-in-URL surface. Not urgent.

## Tier 2 — Organization (goal 5, the audit's biggest experience gap)

### 3. Table organization & concurrency

- **Per-roll chips lifetime**: chips keyed by rollId and kept until that
  roll is Done/evicted (today a new roll erases every older roll's chips
  while its dice remain — only the latest roll is readable on screen).
- **Per-roll landing zones**: deterministic zone allocation from the roll
  seed/order; throws target the roll's zone; settled older pools nudge or
  whisk toward the edge when a zone is granted. (Per-player mats later
  become a visual skin over this machinery.)
- **Ordered eviction, not the 40-dice wipe**: evict oldest settled rolls
  one at a time via the existing sink/fade, ordered by server roll time so
  all clients converge; kill the client-relative full reset.
- **Table resync**: hello carries which logged rolls still sit on the
  table; joining/reloading clients replay them settled (final pose, no
  tumble) — today a reload shows an empty felt while everyone else still
  sees dice.

## Tier 3 — Secrecy, role-free (goal 11)

Step 4 — the **visibility core** — is shipped (see Shipped below): the
ladder, server-side projection, reveal authority, offer visibility, the
shrouded-dice playback, the cross-tool terminology pass, and the `#`-in-
names ban. What remains in this tier is its refinement backlog.

### 4b. Visibility refinements (future)

Deferred out of step 4, each with its reason. Nothing here blocks the
ladder; all of it is polish or a new rung.

- **Sticky mode + its badge, as one change.** A remembered per-player
  default (Foundry's roll-mode ergonomic) is only safe alongside a
  standing eye-slash badge on the Roll button and the mini pills — a
  sticky non-open default with no persistent signal is the accident vector
  §3.2 names. Ship both or neither.
- **Silent whisper.** A whisper whose bystanders learn *nothing*, not even
  that a roll happened. Today every rung but `secret` makes existence
  public (§3.1's shrouded dice), and PF2e's precedent is that
  roll-existence is itself mechanically meaningful information. This is a
  fifth rung, not a tweak: it needs `secret`'s omit-entirely projection
  with `whisper`'s audience.
- **Reveal to a subset.** Fantasy Grounds reveals to one player; module
  precedent exists for "reveal to the roller". §3.3 rejected it for step 4
  because reveal is currently total and one-way, which is what makes it
  auditable. Revisit only with a concrete table need.
- **Targeted offers** *(TODO Joe 2026-07-31; SHIPPED 2026-08-03 — the
  first multi-player CUJ, landing right on the Trigger Pass's single
  offer surface; UX.md §7.11)*: offer a roll claimable only by a named
  player ("Bo, roll this save"). As designed: the name resolves against
  the roster at offer creation exactly like a whisper audience
  (case-insensitive, duplicates all join, 400 `unknown_target` fail-closed)
  and the pinned `playerId`s ARE the claim gate — server-enforced
  (403 `not_offer_target`), never just which client drew the button. The
  card shows everyone the stakes including who it's for; only the target
  wears the claim strip (bystanders read 'waiting on Bo'). UI: a ▾ split
  button beside the draft row's *Offer to table* (plain click keeps its
  one-click table-wide muscle memory; the ▾ waits for a teammate).
- **Whisper-offer auto-targeting** *(Joe 2026-08-03: "a whisper roll is
  already assigned to someone, so the offer should always be to that
  person"; SHIPPED same day, as designed below — the superseded
  bystander-can-claim-blind contract left tests/redaction.test.mjs with
  a supersession note; `whisper-offer` e2e + the rewritten redaction
  test pin the new one)*: an offered `whisper` roll
  derives its claim gate FROM its audience, server-side in `handleOffer` —
  `w:Bo` offered is claimable by Bo, full stop; table-wide whisper offers
  cease to exist by construction (Joe: weird, arguably not useful).
  Multi-name whispers are claimable by any audience member, and the ▾ may
  still NARROW to one of them; a target outside the audience refuses
  (400 `target_not_in_audience`, a teaching message — never a silent
  override). A whisper whose only audience is the offerer has nobody to
  offer to: refused at offer time. `secret` (dice tower — open claiming
  is the point) and `held` offers are untouched. UI: the ▾ picker hides
  while the draft carries whisper visibility (the target is already
  decided); the card reads 'for Bo' through the existing `to` machinery.
  Ships with a `whisper-offer` e2e: the 403 + surviving card, the
  conflict refusal, and the claimed roll keeping the whisper's read
  (audience + offerer see, bystanders shrouded).
- **Audience legibility.** A shrouded viewer reads the audience only when
  the roll has no `# comment` (§3.0) — `label` carries one or the other.
  Decide whether "who was whispered to" deserves its own always-present
  field, or whether comment-shadowing is the correct privacy default.

## Tier 4 — State capture (goal 7)

### 5. Capture mechanisms

- Roll-log export (copy/download text + CSV) — the online log is currently
  uncapturable.
- **Pools & settings export/import** *(Joe 2026-08-03; SHIPPED same day —
  UX.md §7.13)*: a human-editable YAML view of the rack (shelves; pools as
  name + canonical notation) plus the just-you settings (sound, numbers),
  in Settings → *Your data* — ONE textarea, two directions: Export fills
  it, pasting/editing re-parses live into a preview line (`✓ 1 new ·
  1 update · 2 unchanged — Apply takes them`), and Apply merges by name
  through the by-id writer, deleting nothing. `js/portable.js` is the
  zero-dep emitter + strict YAML-subset parser (fails closed with a line
  number, like the codec); every scalar is single-quoted on export because
  notation carries `#` (YAML's comment) and names may carry `: `. 20 unit
  tests + the `portable` e2e scenario.
- Local roll statistics (per-player distribution, average-vs-expected).
- Room settings snapshot into the copy-link URL (felt/system ride `#g=`'s
  neighbor) so a bookmarked table restores its look and rules.

## Tier 5 — Effects & ceremony polish

### 6. Ceremony refinements

- Roller-held declare phase (§2.4's user-controlled dwell with a commit
  button; the fixed 1.35 s timer stays as the spectator fallback).
- "Always skip roll ceremony" personal setting; crit overlay made
  skippable; Esc joins click/Space as ceremony skip.
- Reveal-beat polish on top of step 4's §3.1 flip: chip chorus + verdict
  stagger on the revealed entry (the flip itself ships with visibility).

### 6b. Dice-on-card — BG3-style card cinematics & the seated shelf
(Joe 2026-08-04) — IDEAS + RESEARCH, decisions pending

Two ideas from Joe, sharing one technical question ("can WebGL dice sit
on top of an HTML panel?"):

1. **Card cinematics.** Baldur's Gate 3 rolls its skill-check die ON an
   ornate card — the card is the stage, the die drops onto it, bounces,
   settles in its center, and the tally dresses around it. "It looks
   super cool. I was wondering if we could achieve that for our
   cinematics" — i.e., the check/cinematic ceremony's dice tumble on
   the card instead of on open felt below a floating card.
2. **The seated shelf.** Collected dice REMAIN physically on the table,
   "with the card more clearly shown until cleared, and maybe placing
   the dice on the card" — the cluster seated on a visible card/plaque
   that carries its identity, instead of today's anonymous whisked pile
   (see §2i E `shelf-clusters-anonymous-at-rest`, which this would
   answer wholesale).

**The research (2026-08-04, preserved).** A single WebGL canvas is ONE
rectangle in the DOM stacking order: the browser composites whole
elements, so HTML can sit entirely above or entirely below the canvas,
never between two meshes. Four ways to get dice "on" a card:

- **(i) The sandwich** — a second `alpha:true` canvas above the HTML
  panel, `pointer-events:none`, camera-synced, rendering only the dice
  that ride the card. Standard technique; real. Cost HERE: GL contexts
  share nothing, so the top canvas re-instantiates dice geometry, the
  themed materials, PMREM env, shader clocks, and its own post chain
  (js/post.js) or the dice visibly lose their §9 dress mid-ceremony —
  worst exactly where fidelity matters most. Extra-context precedent
  exists (diceart bakery, lab rig), but "pixel-identical dice in a
  second context" is a project, not a trick.
- **(ii) Fully diegetic panel** — the card as a textured quad in-scene,
  text rasterized into it. Correct depth/lighting/shadows, but the
  panel's text becomes pixels: violates the text-layer audit rule
  (copy/paste + screen readers keep the read) unless a parallel DOM is
  maintained. Rejected as the general mechanism.
- **(iii) The bakery illusion** — no live dice at all: bake THIS roll's
  dice at settled orientation, rolled face up, via the diceart (type,
  set) bakery seam, and place the images IN the HTML panel (the ledger
  rows' evidence slot — composes with §2i A). Perfect compositing,
  works on every surface incl. peek and log. The right answer for
  "the panel shows the actual dice"; it cannot give tumble-on-card.
- **(iv) IN-SCENE CARD SURFACE, DOM TYPOGRAPHY — the recommended shape
  for both ideas.** The card's SURFACE is a textured plane mesh in the
  3D scene (parchment/bronze plaque, slightly proud of the felt, a
  static physics box so dice really land, bounce, and rest on it with
  true shadows/effects); the card's TEXT stays HTML floating over the
  canvas — exactly how chips, the mat-text decal, and every overlay
  already work. No second context, no rasterized text, and the §9
  effects ladder applies to the dice untouched. The ceremony already
  controls the throw, and every projection went felt-rect-relative in
  2h, so aiming the tumble at a card-shaped zone (screen rect → felt
  coords) is existing machinery. BG3's look decomposes into: in-scene
  stage + overlay type + a throw aimed at the stage.

**Tradeoffs & decisions pending before either ships:**

- **Quiet-chrome tension (the seated shelf).** The shipped shelf
  contract is dot-only markers, the peek does the talking; a standing
  card per collected roll is louder standing chrome. Decide: new
  contract (the card IS the marker, identity at rest) vs. a middle
  state (card fades in on approach, seats the dice always). This is a
  doctrine change, Joe's call, not a drive-by.
- **Felt real estate & Tier 2 interplay.** Seated cards occupy zones;
  step 3 (landing zones, ordered eviction, resync) should probably land
  first or together — a seated card is a natural zone visualization,
  and eviction must know how to retire one.
- **Ceremony surface ownership.** Does the in-scene card REPLACE the
  HTML intent/verdict cards (one stage, §2.4 rewritten) or sit beneath
  them as the landing stage while the HTML cards keep the typography?
  Recommendation: keep HTML cards as the type layer (a11y unchanged,
  aria-live intact), let the plane be pure stage.
- **Effects budget.** A card plane wants shadows, maybe a decal edge,
  maybe a die-light catch — cheap; but if the ceremony camera moves in
  (BG3 frames tight), the felt LOD/vignette and post tuning need a
  pass. Camera choreography is its own design decision.
- **Physics honesty.** Dice must genuinely land on the raised card box
  (face correction untouched — the correction happens before the
  visual settle), and a card must never trap a die half-on/half-off
  illegibly: the zone aim + a low lip, or a settle-nudge, decides this.
- **Solo/static parity.** All of it is client render machinery — works
  offline; nothing rides the wire except what already does.

### 7. Initiative helper

One shared action; everyone's roll collects into a sorted order list
visible to the room until cleared.

### 8. Special dice & success counting

Fate/Fudge dice, coins, d100 paired-read display; success-counting joins
the system-profile registry from step 2. Needs dice.js custom face sets.

## Tier 6 — Customization & delight

### 9. Dice sets, colors & THEMES — (type,setId) material cache, launch
sets, per-player identity set, saved-pool override, picker. A bare color
derives an anonymous set. **EXPERIMENT PHASE SHIPPED 2026-08-03**:
docs/THEMES.md holds the taxonomy — nine houses (Tidewrack · Wildwood ·
Stormcall · Rimehold · Emberforge · Arcanum · Umbra · Reliquary ·
Gildhall), each with palette, material feel, and REASONED signature
effects. js/themes.js carries the material recipes; dice.js's
(type,variant) seam now accepts a theme id (colors re-baked, finish +
internal glow applied — geometry/physics untouched). lab.html is the
review rig (grid of every theme × die, effect prototype buttons, env
cycle for glow judging, PNG capture); tools/lab-shots.mjs drives it
headless for review stills. Ladder Levels 1-3.5 shipped (texture-space
maps, shader injection, impact-keyed particles — js/particles.js + the
lab's cannon-es drop rig — and geometry identity: per-set bevel/profile/
wear/nicks/pillow on the render mesh only, physics hull canonical; see
THEMES.md). **PICKER + WIRE SHIPPED 2026-08-03**: "Dice set" in settings
("Just you" — grouped by house, felt-swatch language, localStorage);
`set` rides every roll AND claim request (present-or-absent like exp;
server validates against SET_IDS, 400 unknown_set; the CLAIMER's set —
whoever throws wears their own dice), survives redaction (cosmetic
identity like name/color), lands for everyone, and the shelf, reveal
flips (geometry + materials restore the set, shroud outranks identity)
and reload replay all keep the skin. Main table gained the lab's PMREM
reflection environment (std/shroud pinned to envMapIntensity 0.35 — the
released look holds), the SHADER_TIME clock, and the particle field
fed by the fast-forward's recorded contacts ({time, strength, at} — the
roll.sounds seam, realized). e2e: themed-dice (tag `themes`).
**LADDER L4 SHIPPED 2026-08-03**: felt decals (js/decals.js — frost
crackle, drying rings, scorch with a cooling ember rim, dust smudge;
instanced quads over a two-tone procedural atlas, stamped from the same
recorded impacts, transient by contract) and die-parented lights
(js/dielights.js — fixed pool of 4, wave/breathe/flicker/steady modes,
Umbra pools shadow with NEGATIVE intensity; felt-only — collect
extinguishes, reveal ignites, shroud smothers). Restraint recipes: six
sets mark, five glow, four leave the table untouched on purpose. The
lab drop rig gained the coupon/rails/linger/dropView furniture to
review it at table pitch. e2e: themed-fx (tag `themes`). **The marks
half was retired to a kill switch the same evening** (Joe kept the
whole ladder except the felt residue): `DECALS_DEFAULT_ENABLED = false`
in js/decals.js gates stamping everywhere — table and lab —
`decalsEnable(true)` re-arms one page, and recipes, die lights and the
toggle-proving themed-fx all stay.
**LADDER L5 SHIPPED 2026-08-03 — THE EFFECTS LADDER IS COMPLETE**:
hand-rolled postprocessing (js/post.js, core three only): selective
bloom via a blacked-out mask render (a std/shrouded die cannot bloom by
construction; no strength knob — whatever L1-2 made bright is what
burns), impact-keyed shock rings off the roll's hardest landing
(negative amp = Umbra implodes), heat shimmer above settled iron, and a
strict bypass: a std table renders the released direct path, proven
equivalent at 61.8 dB PSNR (the tone-mapping-on-render-targets lesson
lives in THEMES.md). e2e: themed-post (tag `themes`).
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
seams are all closed**: a pool can pin the set its rolls wear (absent /
'std'-pinned / house set), chosen through one compact select shared by
the settings row and the popover identity strip ('Your set' default).
Same evening, PER-DIE (Joe: a mixed draft collapsing to one set read
as broken, and a teammate's rack wore the VIEWER's skin — information
loss at the whitelists): every die wears its own pool's set — wire
`sets` aligned to the base dice (server-validated,
redaction-preserved), provenance-chasing rollDieSet/entryDieSet for
explosion/adv/reroll extras, per-die impact effects off sounds[].di
(each recorded contact knows its die), per-die lights / bloom /
reveals / shelf / log chips, and the pools broadcast carries pool sets
so foreign racks show the OWNER's skins and staging them carries pool
identity. Codec v4 and a YAML @-suffix carry the override through
every share shape, failing closed on unknown ids. Save/variant flows
inherit; rerolls keep per-die sets; claims keep shipped semantics.
e2e: pool-set-override (tags `themes`, `groups`); units in
urlgroups/portable tests. Next morning (Joe 2026-08-04): the OWNER'S
DEFAULT set rides the pools publish too (top-level present-or-absent
`set` on /api/pools, roster + pools-changed relay, republish on every
set switch), so a foreign rack resolves explicit pool set → owner
default → classics with every strip pinned — "if you look at another
player's pools, they look identical to what that player sees." And
staging a foreign pool snapshots that resolved skin as a pin (Joe's
same-day correction — the tray had switched staged foreign pools to
the borrower's default; 'std' worlds pin std): what you saw is what
you stage. Your own rack still stages unpinned, following you. What remains in §9 is art direction, not
plumbing: the creative-brief experiments continue, and 9b pool icons
stands as its own item. **SLICE 0+1+2 SHIPPED (2026-08-04)** — deep aesthetic pass, judged
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
docs/THEMES.md §0. Perf-guardrail: Slice 3 (rest cadence) waits on
the S3 shelf-bloom fix (memory/perf-baseline.md).

**Creative brief (Joe 2026-08-03):** cool-looking dice of different materials and types,
natural AND supernatural — imagine what *faerie* dice, *dryadic* dice,
*wizard* dice, *warrior* dice might look like. Special effects and strong
themes **merged subtly into the dice themselves** — theme lives in
material, edge, glow and face treatment, never as noise on top; the
numbers stay readable (GOALS legibility invariant) and the physics/face
correction machinery is untouched (a theme is a skin over dice.js
geometry + materials). Start with a small experimental set to find the
bar before building the full picker.

### 9c. THE SOFTER EDGE — real fillets on the render mesh (Joe 2026-08-04:
"all the edges are crazy looking hard lines… a lot [of real dice] don't
have such perfect flat surfaces and perfectly chamfered edges")

**Diagnosis** (research preserved): the hard look had TWO causes, and
the dominant one was a bug. (1) **THE HOLE (found by Joe, fixed
2026-08-04):** the edge stitcher paired each edge's two inset segments
order-blind, but consistently wound faces traverse a shared edge in
OPPOSITE orders — every band quad was a bowtie: one triangle doubled,
the other half a triangular hole showing the scene background as a
pure-black wedge. Every edge of every die, shipped since the bevel
landed; confirmed by an unpaired-directed-edge probe (4 per die edge),
fixed by endpoint-aligned pairing, and the e2e scenario now asserts
every render mesh is watertight — including through the builder's
wear/nicks displacement. (2) Structural: `buildBeveledGeometry`
stitches each edge with ONE flat band, flat-shaded — a narrow 45°
strip whose bounding creases carry hard shading discontinuities.
`profile:'round'` LERPS band normals 65% toward the sphere direction —
a shading approximation over a single strip, polygonal silhouette.

**The ladder** (each tier subsumes the one before):

- **Tier 0 — data only. SHIPPED 2026-08-04** (`f220ef1` + seams
  `64941de`): THE GEO BENCH in the lab — eight `geo` recipes swept over
  otherwise-standard dice (sets may now omit body/text to inherit std
  per-type colors; house-less sets read std finish) — plus THE SET
  BUILDER (every recipe knob live, themes.js-shaped copy-out) and hero
  die framing (canvas click, ↑/↓ same-die-across-sets surfing). e2e:
  lab-geo-bench (tag `lab`); stills: tools/geo-bench-shots.mjs.
  **Bench verdict, post-hole-fix** (the first verdict — "even round
  .130 reads as dark grooves" — was measuring the hole, not the
  recipes; retracted): with whole bands, cut recipes read as clean
  machined chamfers and `round .090` reads GENUINELY soft at hero
  distance — the fillet shading rolls a smooth highlight along the
  edge. Tier 0 is now a real choice, not a least-bad one; Joe picks
  from the bench. Tiers 1–2 remain as refinements (exact fillet
  normals; true curved silhouette) rather than the rescue they looked
  like before the fix.
- **Tiers 1+2 — true fillets. SHIPPED 2026-08-04** (with the `ink`
  knob, Joe's ask: "turn down the darker color on the beveled edges").
  Every `round` edge is now `segments` (default 3) quadratic-Bézier arc
  strips, control point = the ORIGINAL sharp edge — tangent to both
  faces by construction (q→ctrl lies in q's plane), never outside the
  base solid, never below the resting plane (the bottom edge's ctrl
  lies IN the bottom plane, so canonicalDiePose holds). Corners are
  domes fanned over shared arc instances (watertight with no angular
  sort — consecutive arcs share ring endpoints); normals are ANALYTIC:
  face-exact at rims (zero crease), blended across the arc, corner-ray
  at apexes. Worn sets keep the 0.65 sphere-blend after displacement
  (the dents-went-black lesson). `geo.ink` (0..1) dials the painted
  face outline + band material together (they are one visual system);
  bench row `lab.selfink` shows .04. House round sets upgraded free.
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
  default — inherent to the coupled ink semantics (`cac1fa2`: outline
  and band ride ONE value; only OMITTED ink yields the .25/.12 round
  pair). A split knob would betray the one-visual-system rule; revisit
  only if tuning round sets in the builder proves painful.
- **Tier 3 — tumbled resin** (composes with Tier 2): subdivide faces,
  blend toward a superellipsoid for the no-flat-anywhere pocket-dice
  look; today's `wear` displacement is a crude version. Constraint:
  the dead-flat digit plane (legibility) — face bulge stays subtle or
  shading-only, as `pillow` already is.

**Rejected:** normal-map edge rounding (edge bands are deliberately
UV-less; silhouette stays hard; falls apart close-up — inferior to
Tier 2 at similar effort) · SDF raymarched dice (perfect rounding, but
a custom-shader universe that forfeits the three.js lighting/shadow/
post pipeline — a rewrite, not a feature).

**Invariant, restated:** all tiers are RENDER ONLY. The physics hull,
face values and read logic stay canonical — a soft edge can never
change how a die lands (the §9 Level 3.5 contract).

### 9b. Pool icons — an icon on a pool's tile where die art stands today
(the Rack anticipated this: "tile icons replace die art later"). **Joe
2026-08-03:** a default icon set for Your Soul Deal's attributes
(Strength and kin) plus a library players pick from for custom pools.
Zero-dep: hand-drawn inline SVG sprites, no icon fonts or CDNs. The icon
is pool identity, so it rides everywhere the pool does: the tile, the
draft's source chips, the popover identity strip (picker lives there,
beside name/shelf), published racks (display copy), and the `#g=` codec
(v4, present-or-absent — old links stay valid, unknown icon ids fail
closed to die art). Die art remains the default for icon-less pools.

### 10. Custom experience templates — the editor UI for the (currently
dormant) `experiences` settings key; until this ships the key stays
server-validated but unconsumed by design.

### 11. Physical pool building — the §7.1 shelf/felt delight (demoted per
goals 3–4: physical interaction is optional delight, never required toil).

### 12. Per-player roll mats — visual skin over step 3's zone machinery;
mat color per-player, visible to all.

### 13. Breakout rooms — side tables with shared identities (goal 11's
"lower priority" advanced privacy; design when reached).

## Shipped

Multiplayer core (SSE rooms, server-authoritative values, simulate-ahead
replay with face correction, solo fallback) · Soul Deal meanings · saved
pools in URL (#g= codec v2 carrying notation) ·
player rename · roll mechanics engine (shared rollspec: modifier/adv/
keep/reroll/explode, attributed parts, per-die metadata) · offers
(offer/claim/withdraw) · face-down + reveal (UI-level; real redaction is
step 4) · reroll-last · notation layer (Roll20 dialect, 561 tests + fuzz,
command box, ± popover) · room settings channel + felt themes + settings
modal · roll ceremonies (intent card, mat-text felt decal, staged verdict,
cinematic slow-mo, skip) · quick-roll palette + keyboard shortcuts ·
capability matrix across all roll surfaces · per-roll Done-clears ·
**visibility core (step 4, goal 11)**: the role-free ladder open · held ·
secret · whisper riding notation (`held`/`secret`/`w:Name` + the offer-only
`blind` alias), server-side per-recipient projection on every egress,
server-enforced reveal authority, offer visibility incl. the dice-tower
roll, shrouded obsidian playback with deferred mid-playback reveals, solo
degradation, the cross-tool terminology pass (`/gmroll` family → `secret`,
`/sr` refused as ambiguous, labels *Only me* · *Whisper to…* · *Dice
tower*), and the `#`-in-player-names ban that keeps whisper addressing
total · **quiet chrome (UX.md §7.9)**: the documented z ladder with ceremony
above table labels, value chips off by default, dot-only shelf markers with
the peek doing the talking, one clear-this-roll gesture everywhere, a
persistent rail that no view can strand, independently collapsible panels
with compact view as their emergent state (the Players panel later retired
into rail roster pills, and the remaining panels merged into the ONE Pools
panel — 2026-07 cleanup), the identity chip (rename ·
leave & switch · invite link) solo and online, by-id saved-pool editing,
and the *pool / saved pool* naming.

## Conformances to protect (from the audit)

How these are checked is governed by [TESTING.md](TESTING.md): scripted-first
(unit + fuzz + tagged e2e per step; full sweep pre-release), and every build
step ships with its e2e scenario.

Server is the sole value authority (client-sent values ignored) · notation
re-parsed server-side, never trusted from the client · canonical form is a
tested byte-stable fixed point · codec fails closed on hostile input ·
static-hosting solo works completely · the capability matrix is one shared
code path, not parallel implementations · settings echo-apply with no
optimistic divergence · `cleared`/`exp` flags are present-or-absent so
plain payloads stay byte-identical · control/bidi stripping is mirrored
across all four layers with surrogate-safe truncation (and `#` is banned
from player names at every entry point — whisper addressing must stay
total) · `playerGone()` rejoins only on unknown_player/room (never mints
identities on expected 404s) · broadcast already loops per-player (step
4's redaction hook) · server-side per-recipient projection
(`projectEntryFor`) is the ONLY path a roll entry ever leaves the server —
every egress (roll broadcast, POST responses, reveal, hello, `/api/join`,
shelf/log resync) goes through it · redaction is **absent data, never
hidden data**: a redacted or omitted projection carries no values for a
client to decline to render · whisper audiences pin `playerId`s at
roll/offer creation (a rename never changes who may read a roll; unknown
names fail closed as `unknown_audience`) · reveal is authority-checked
server-side (`revealAuthority`, 403 `not_reveal_authority`), never gated
by which client drew the button.
