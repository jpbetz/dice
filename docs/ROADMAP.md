# Roadmap

> **UX spec:** [UX.md](UX.md) is the authoritative design for notation, roll
> experiences, visibility/DM seat, and dice sets, with mockups in
> [mockups/](mockups/). Its §7 addendum (physical tray, attributed modifiers,
> room-wide experiences) supersedes conflicting details anywhere else.

## Design principles (from Joe, guiding all UX work)

- **Physical analogy over UI.** Prefer manipulating the world to abstract
  widgets: build a tray by grabbing/dragging actual 3D dice into an actual
  tray on the table. Panels and buttons are the fallback, not the default.
- **Notation as the power-user escape hatch.** A mini-terminal accepting the
  community-standard dice notation (Roll20/Foundry dialect) coexists with the
  physical input — DMs paste commands; everyone else touches dice.
- **Rolls are planned experiences.** A roll has a setup (what's being rolled
  and why), known expectations and stakes (target number, title text on the
  mat), a rolling phase everyone watches, and a big reveal connected back to
  those expectations. Never just "numbers appeared".
- **Bonuses are attributed.** Modifiers carry named sources ("+2 Proficiency",
  "+1 Guidance") shown as labeled chips on the roll card, BG3-style.
- **Advantage shows both dice.** Twin hero dice side by side; the discarded
  one visibly loses.
- **Shared first.** The table is a room-wide experience: templates, settings,
  and moments sync to everyone; per-player privacy is the exception, added
  late (see build order).

## Build order

Each step is independently shippable and sets up the next. Rationale in one
line per step.

### 1. Notation layer (UX.md §1 + §7.2)

`js/notation.js` (Roll20 dialect: glued mods on single-type pools,
trailing flags on mixed, `2d20kh1`→adv collapse, inclusive-`<`
normalization, `d100` expansion, `+N[label]` attributed parts, `dc N`,
`# comment`), canonical renderer replacing `formula()`, command box with
three-state validation + Monte Carlo preview + history, the ± popover per
`mockups/panel.html`, codec v2, `rollspec.mods.parts`, server re-parse.
*Why first: the engine already does all of this — notation is the missing
compose surface, and every later feature describes rolls in this language.*

### 2. Room settings channel + settings panel (UX.md §7.3; old settings item)

Server: room `settings` object in `hello` + a `settings-changed` event, any
player may write (no roles). Client: gear → modal with "Just you" (mute,
mini pref) and "Everyone at the table" (felt/background theme) sections;
solo persists globals locally.
*Why second: room-wide experiences (Joe's call) and later mats/sets ride
this channel; background themes come along nearly free.*

### 3. Roll moments / experiences (UX.md §2, room-wide per §7.3)

Template records (Plain / Check / Cinematic) stored in room settings;
intent card with mat text (canvas decal in the felt) and visible Target;
staging timeline with hit-stop, chip stagger, attributed-modifier fly-ins,
top-anchored verdict; ≤1.6s post-settle, always skippable; mini-mode
degradation. Hidden DCs wait for step 10.
*Why third: this is the headline experience the app is building toward,
and steps 1–2 are exactly its prerequisites.*

### 4. Physical build-a-tray (UX.md §7.1)

Shelf of real dice at the felt edge; click/drag into a recessed tray;
tray = draft group, two-way-bound to the notation box; rolling hurls those
dice. Buttons remain for mini/accessibility.
*Why here: shares step 3's raycast/decal machinery; input polish lands
best right after the output ceremony exists.*

### 5. Dice sets & colors (UX.md §4)

`(type, setId)` material cache, 10 launch sets with `extends` inheritance,
per-player identity set (synced via step 2's channel), per-group override,
picker per `mockups/dice-sets.html` with live thumbnails.
*Why here: pure delight layer; benefits from settings sync and the picker
slots into the roll moment.*

### 6. Per-player roll mats

Table splits into labeled per-player areas; throws target the roller's
mat; mat color/style is per-player but visible to all (step 2 channel);
corner ✕ clears your mat, long-press clears all.
*Why here: needs settings sync (2) + decal machinery (3); pairs naturally
with sets (5) for per-player identity.*

### 7. Initiative helper

One shared "roll initiative" action; everyone rolls once; sorted order
list visible to the room until cleared.
*Why here: most-requested table utility that needs nothing from the
privacy work.*

### 8. Success counting + special dice

Dice-pool success counting (`cs>=N`, banner shows successes, Soul Deal
skipped), Fate/Fudge dice, coins, d100 paired-read (notation side shipped
in step 1). Needs dice.js custom face sets.

### 9. Roll statistics (local) + log export

Per-player distribution / average-vs-expected from locally retained
history; copy/download the log as text/CSV.

### 10. Visibility suite + DM seat (UX.md §3) — deprioritized per Joe

Server-side redaction projections, Secret-to-me and Whisper-by-name modes,
the shrouded-die replay (obsidian-blank material, flip on reveal —
upgrades today's UI-only face-down), optional claimable DM seat (whisper
default, blind offers, hidden DCs, housekeeping).

### 11. Breakout rooms / advanced privacy (future)

Side tables: a subset of players splits into a linked room (same
identities, quick switch, maybe a shared "return to main table" rail),
for private scenes and side conversations. Design TBD when we get here.

## Shipped

- **Multiplayer core** — SSE rooms, server-authoritative values,
  simulate-ahead replay with face correction, solo fallback.
- **Soul Deal meanings** — summed total against the chart; crit effects.
- **Mini mode** + persistent corner controls (⤡/⤢ toggle, ✕ clear).
- **Groups in the URL** (`#g=`), copy-link.
- **Player rename** (inline, propagated).
- **Roll mechanics engine** — shared `js/rollspec.js` (modifier, adv/dis,
  keep/drop, reroll-low, exploding) on server and solo; per-die metadata
  display (struck discards, ✴ children, `17 = 14 + 3`); face-down `?` +
  Reveal; offered-roll cards (offer/claim/withdraw); reroll-last ⟳.
