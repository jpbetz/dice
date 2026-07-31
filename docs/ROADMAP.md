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
  the 720×480 small-window e2e pass.

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
- **Targeted offers** *(TODO, Joe 2026-07-31)*: offer a roll claimable only
  by a named player ("Bo, roll this save") instead of the whole table. The
  machinery rhymes with whisper audiences — pin the claimant's `playerId`
  at offer time, fail closed on unknown names — and the offer card shows
  everyone the stakes while only the target gets the claim strip.
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
