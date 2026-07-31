# Roadmap

Sequenced against [GOALS.md](GOALS.md) (the authority on priorities: core
mechanics → organization → secrecy → systems literacy → effects →
customization) and the 2026-07-30 goals audit, which verified every gap
below empirically. [UX.md](UX.md) holds component specs; its §3 is now the
as-built role-free visibility spec and the rescinded DM seat is gone from
the docs (step 4's sweep).

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
per-player identity set, saved-pool override, picker. A bare color derives an
anonymous set.

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
persistent rail that no view can strand, four independently collapsible
panels with compact view as their emergent state, the identity chip (rename
· leave & switch · invite link) solo and online, by-id saved-pool editing,
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
