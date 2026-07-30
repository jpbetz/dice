# Roadmap

Sequenced against [GOALS.md](GOALS.md) (the authority on priorities: core
mechanics → organization → secrecy → systems literacy → effects →
customization) and the 2026-07-30 goals audit, which verified every gap
below empirically. [UX.md](UX.md) holds component specs; its §3 is now the
as-built role-free visibility spec and the rescinded DM seat is gone from
the docs (step 4's sweep).

## Tier 1 — Core mechanics completion

### 1. Notation totality closeout

Close the audited invariant violations so groups, history, and `#g=` links
carry a roll's FULL intent:

- Implement UX.md §7.6: `check` / `cinematic` trailing flags,
  `# Title | Subtitle` pipe split, `exp` in parse results and canonical
  output, popover Moment round-trip.
- Give face-down a canonical spelling that survives round-tripping
  (recommended: a `held` trailing flag, with the `/gmroll` family
  normalizing to it), so saved variants stop silently dropping privacy.
- Small-batch correctness from the audit: banner breakdown shows struck
  dice and ✴ children (attributed-math invariant); plain-roll playback
  skippable (click/Space fast-forward — the machinery exists); reveal
  state replayed on hello resync (mirrors `cleared`); `/api/join` carries
  `offers`.

### 2. Interpretation system profiles (goal 6)

The audit's six-site hardcode inventory becomes a registry:

- `js/meanings.js` → profile registry: `soul-deal` (today's chart + DC
  pairing), `dnd` (DC verdicts + natural-20/1 crits, no chart), `none`
  (numbers only). Profile provides `meaningFor`, a crit predicate, and its
  readout slots.
- `system` key in SETTING_SPECS (default `soul-deal`), room-synced like
  felt; settings modal picker under "Everyone at the table".
- Thread the active profile through entryFromRoll, banner, ceremony
  verdict, verdict card, and log. §2.5's hero-slot separation is the seam.
- Success counting (dice-pool systems) joins later as another profile.

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

### 4. Visibility core

UX.md §3's redaction architecture, minus the rescinded seat. The full
contract is UX.md §3 (wire, projection, audience, reveal, offers) and
§7.8 (notation):

- `visibility` field beside mods — **absent = open** (present-or-absent,
  like `cleared`/`exp`, so plain payloads stay byte-identical);
  `{mode: 'held'|'secret'|'whisper', audience[], revealAuthority}`.
  `held` = face-down for everyone *including the roller*; `secret` = the
  roll exists only for the roller, no reveal path (`/selfroll` gets real
  semantics); `whisper` = named audience live, everyone else shrouded.
  Notation flags `held` / `secret` / `w:Name` + popover picker + palette
  parity.
- **Server-side projection**: `projectEntryFor(entry, viewerId)` on
  *every* egress — roll broadcast, the roller's roll response, the
  claimer's claim response, reveal, hello, `/api/join`, shelf/log resync.
  The broadcast loop already iterates player-by-player, but four of those
  paths do not go through it. Today's face-down is honor-system: values
  ship to every client.
- **Audience resolution**: `w:` names matched case-insensitively against
  the current roster at roll/offer creation, stored as ids; an unmatched
  name rejects the action (`unknown_audience`) rather than silently
  widening or narrowing it.
- **Shrouded dice**: redacted viewers get the identity-correction replay
  with numberless obsidian material (they cannot compute face corrections
  without values — the wire change forces this anyway); reveal plays a
  flip + staged beat, deferred if it lands mid-playback (the 7f9cdf5
  race). Held rolls keep their full ceremony (public stakes, held result)
  instead of silently downgrading to Plain.
- **Reveal authority is the chooser**, server-enforced
  (`403 not_reveal_authority`), and the reveal event carries the full
  entry because shrouded clients never had the values.
- **Offer visibility**: offers carry visibility chosen by the offerer,
  applied verbatim to the claimer's roll; reveal authority = offerer. The
  claimer is not in the audience unless named — that asymmetry is the
  role-free GM-screen roll. Today's face-down offer gives the claimer sole
  reveal authority *and* the values, the exact inverse.
- Accepted leak, documented: an exploding roll shows its extra dice to
  shrouded viewers (physical analogy).
- Doc sweep: purge the audited DM-seat references from UX.md/ROADMAP
  (the count was nine; the real total was ~37 lines plus the mockup token
  list in `docs/mockups/panel.html`).

### 4b. Visibility refinements (future)

Deferred out of step 4, each with its reason. Nothing here blocks the
ladder; all of it is polish, vocabulary, or a new rung.

- **Terminology pass (approved, not applied).** The cross-tool survey in
  UX.md §3.2's terminology note requires three changes step 4 shipped
  without: `/gmroll` and `/gmr` normalize to **`secret`**, not `held`
  (Roll20's `/gmroll` guarantees the roller sees the result and the table
  learns nothing — `secret` matches both axes, `held` inverts both);
  `/sr` stops binding silently and parses **invalid** with a teaching
  error, because Foundry's self-roll and Roll20's secret roll are
  opposites under the same two letters; and `blind` joins as an accepted
  input flag — an alias for `secret` on an **offer**'s notation (the
  dice-tower roll), invalid on a self-roll with "a blind roll needs
  someone else to hold the result — offer this roll instead". UI labels
  become *Open* · *Face down* · *Only me* · *Whisper to…* · *Dice tower*
  (offers), so no mode name is ever a word that reads as its own opposite.
  UX.md §7.8's prefix table and `index.html`'s cheatsheet row move with
  the bindings; the unit suite pins the new messages.
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
- **`#` in a player name misdirects a whisper (open defect).** The comment
  split runs before the flag scan, so the canonical `1d20 w:a#b` re-parses
  as a whisper to `a` with the comment `b`. The server accepts it with 200
  and resolves the audience to the *wrong player*; the intended recipient
  gets the shrouded projection, and the label silently becomes `b`. The
  popover's audience picker offers `#`-bearing roster names, so this is
  reachable without typing notation by hand. It contradicts §3.0's
  fail-closed promise ("a typo must never quietly broadcast the roll, and
  must never quietly narrow it either"). Fix candidates: quote names
  containing `#` in `canonicalNotation` and teach the quoted-name scanner
  to survive the comment split, or reject `#` in names at join. Until then
  the round trip is not a fixed point for those names (GOALS.md,
  notation totality).
- **Audience legibility.** A shrouded viewer reads the audience only when
  the roll has no `# comment` (§3.0) — `label` carries one or the other.
  Decide whether "who was whispered to" deserves its own always-present
  field, or whether comment-shadowing is the correct privacy default.

## Tier 4 — State capture (goal 7)

### 5. Capture mechanisms

- Roll-log export (copy/download text + CSV) — the online log is currently
  uncapturable.
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

### 7. Initiative helper

One shared action; everyone's roll collects into a sorted order list
visible to the room until cleared.

### 8. Special dice & success counting

Fate/Fudge dice, coins, d100 paired-read display; success-counting joins
the system-profile registry from step 2. Needs dice.js custom face sets.

## Tier 6 — Customization & delight

### 9. Dice sets & colors — (type,setId) material cache, launch sets,
per-player identity set, group override, picker. A bare color derives an
anonymous set.

### 10. Custom experience templates — the editor UI for the (currently
dormant) `experiences` settings key; until this ships the key stays
server-validated but unconsumed by design.

### 11. Physical build-a-tray — the §7.1 shelf/tray delight (demoted per
goals 3–4: physical interaction is optional delight, never required toil).

### 12. Per-player roll mats — visual skin over step 3's zone machinery;
mat color per-player, visible to all.

### 13. Breakout rooms — side tables with shared identities (goal 11's
"lower priority" advanced privacy; design when reached).

## Shipped

Multiplayer core (SSE rooms, server-authoritative values, simulate-ahead
replay with face correction, solo fallback) · Soul Deal meanings · mini
mode + corner controls · groups in URL (#g= codec v2 carrying notation) ·
player rename · roll mechanics engine (shared rollspec: modifier/adv/
keep/reroll/explode, attributed parts, per-die metadata) · offers
(offer/claim/withdraw) · face-down + reveal (UI-level; real redaction is
step 4) · reroll-last · notation layer (Roll20 dialect, 561 tests + fuzz,
command box, ± popover) · room settings channel + felt themes + settings
modal · roll ceremonies (intent card, mat-text felt decal, staged verdict,
cinematic slow-mo, skip) · quick-roll palette + keyboard shortcuts ·
capability matrix across all roll surfaces · per-roll Done-clears.

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
across all four layers with surrogate-safe truncation · `playerGone()`
rejoins only on unknown_player/room (never mints identities on expected
404s) · broadcast already loops per-player (step 4's redaction hook).
