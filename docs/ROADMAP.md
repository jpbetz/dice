# Roadmap

Sequenced against [GOALS.md](GOALS.md) (the authority on priorities: core
mechanics → organization → secrecy → systems literacy → effects →
customization) and the 2026-07-30 goals audit, which verified every gap
below empirically. [UX.md](UX.md) holds component specs; where it still
references the rescinded DM seat, GOALS.md's superseded-decisions note wins
until step 4's doc sweep.

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

The §3.0 redaction architecture minus the rescinded seat:

- `visibility` field beside mods: `open` | `held` (face-down today) |
  `secret` (roller only — `/selfroll` gets real semantics) |
  `whisper:[names]`; notation + popover picker + palette parity.
- **Server-side redaction**: per-recipient projection on broadcast, join,
  and hello (the broadcast loop already iterates player-by-player — the
  hook point exists). Today's face-down is honor-system: values ship to
  every client.
- **Shrouded dice**: redacted viewers get the identity-correction replay
  with numberless obsidian material (they cannot compute face corrections
  without values — the wire change forces this anyway); reveal plays a
  flip + staged beat. Face-down rolls join ceremonies (public stakes,
  held result) instead of silently downgrading to Plain.
- **Offer visibility**: offers carry visibility incl. offerer-audience
  (result visible only to the offerer, reveal authority = offerer) — the
  role-free GM-screen roll. Today's face-down offer gives the claimer sole
  reveal authority, the exact inverse.
- Doc sweep: purge the nine audited DM-seat references from UX.md/ROADMAP.

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
- Interim reveal beat for held rolls (chip chorus + verdict stagger) ahead
  of the full §3.1 flip.

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
