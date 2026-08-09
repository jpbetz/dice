# The Prepared Table — profiles, the table file, and the shared link

*Design authority for ROADMAP Tier G. Written 2026-08-06 against Joe's
game-night ask: "one person sets up all the saved pools for all the
players ahead of time and sets up the table configuration… never lose
it… share a URL with all the players to get them into the game."*

Read [GOALS.md](GOALS.md) first — this pass leans on goal 7 (stateless
server, capturable client), goal 10 (no roles, ever) and goal 12 (not a
character sheet), and it is designed to land **without amending any of
them**. Where it comes close to an amendment, the entry says so and
names the decision as Joe's.

Referenced from [POOL-ANALYSIS.md](POOL-ANALYSIS.md) §9 and §11 (which
named CUJ1 before this document existed).

---

## 1. The two jobs

> **RENUMBERED 2026-08-08.** These two were written before
> [CUJS.md](CUJS.md) existed and collided with ROADMAP §3b's five, which use
> the same numbers for different journeys. They are now **CUJ6** (the
> organizer) and — split, because it was really two — **CUJ3** for the
> routing half and **CUJ7** for the character half. The prose below is kept
> verbatim as the record of what was asked for; CUJS.md assigns the numbers.
> `R8` in §11.1 is CUJ7 as well: it was a journey wearing a requirement's
> number.

**CUJ1 (now CUJ6) — the organizer.** One person (Joe or Walter) sits down before
game night and builds *six characters*: each a named profile with
Attribute / Skill / Motivation shelves of saved pools, priced against
*Your Soul Deal*'s 100-point creation budget. They also set the table's
look and rules — felt, interpretation system, table name, mat zoom.
Then they put it somewhere it cannot be lost.

**CUJ2 (now CUJ3 + CUJ7) — the player arriving.** One link lands in Discord. Six people
open it, and each ends up at the right table, under their own name,
with their own pools in hand — without typing notation, without being
walked through an import, and without a stranger's pools silently
replacing anything they already had.

Everything below is in service of exactly those two.

---

## 2. What already exists (verified 2026-08-06 against the tree)

Most of the machinery is built. The gaps are narrow and specific.

| Piece | State | Where |
| --- | --- | --- |
| Saved pools with shelves + per-pool dice set | shipped | `dice.groups.v1` in localStorage |
| Portable YAML emit/parse/merge-preview | shipped | `js/portable.js`, UX §7.13 |
| Import previews and merges by name, deletes nothing | shipped | `planImport` |
| Publish a rack to the room; teammates browse it | shipped | `POST /api/pools`, `sanitizePools`, owner switcher |
| Room settings, validated + echoed + broadcast | shipped | `SETTING_SPECS`, `POST /api/settings` |
| Seat resume across a reload | shipped | `dice.seat.v1:<room>` (sessionStorage), `js/net.js` |
| `?room=` link + Copy invite link | shipped | `inviteUrl()` |
| Dice-value ledger / spectrum (the 100-point read) | shipped | ROADMAP §2l ①–④ |

**The five gaps:**

1. **No file door.** "Your data" is one textarea plus a clipboard Copy.
   There is no Download and no Open — so the durable copy Joe wants
   does not exist, and a six-character setup travels as a paste blob.
2. **The file holds one rack, not a table.** `exportYaml` emits exactly
   two sections, `pools:` and `settings:` (just-you sound/numbers). It
   cannot carry room settings and it cannot carry a second person.
3. **Room config is more fragile than "until a restart."**
   `dropRoomIfEmpty` (server.js:341) deletes the room the moment the
   **last player leaves**. Prep the felt, the system and the table name
   on Tuesday, close the tab, and it is gone Tuesday — no restart
   required.
4. **The link carries nothing but the room.** A player must type a
   name and then perform an import by hand.
5. **The organizer cannot see the budget for someone else's rack.**
   POOL-ANALYSIS §11 already named this: manage mode forces
   `poolsOwner = null`, so the dice-value ledger reads **your own rack
   only** — useless for pricing Alice's character to 100.

---

## 3. The shape: one file, one room key, one link

> **The file is the truth. The room is a convenience. The link is an
> address.**

That sentence is the whole design, and it is what keeps goal 7 intact.
The organizer's `.dice.yaml` file is the durable artifact — in Drive,
in git, in a mail to themselves. The server holds a *copy* of the setup
as room furniture, exactly the way it already holds published pools:
useful, replaceable, and never the authority. The link addresses the
table and, optionally, names a seat.

### 3.1 The table file

Two new top-level sections, both **present-or-absent**, so every file
that parses today still parses:

```yaml
# Dice Table — the prepared table
table:
  name: 'Your Soul Deal — Session 3'
  felt: 'obsidian'
  system: 'soul-deal'
  zoom: 'wide'
players:
  'Alice':
    set: 'emberforge.blackanvil'
    pools:
      Attributes:
        - 'Strength': '3d6'
        - 'Agility': '2d8+1d4'
      Skills:
        - 'Larceny': '1d20'
  'Walter':
    pools:
      Attributes:
        - 'Strength': '4d6'
pools:            # unchanged — the exporting browser's own rack
  Attributes:
    - 'Strength': '3d6'
settings:         # unchanged — just-you sound/numbers
  sound: true
  numbers: false
```

**Why a player block nests `pools:` instead of putting shelves
directly under the name.** Shelf labels are user-authored, so a shelf
called `set` or `pools` is legal — putting reserved keys at the same
depth as shelves creates a collision with no clean escape. Nesting
puts `set:` and `pools:` at a fixed depth where a shelf can never
appear, and makes the inner block **byte-identically the same grammar**
as the top-level `pools:` section: one parser function, called at two
base indents. Verbosity bought with total absence of ambiguity.

**Parser consequences, named so they are not discovered late:**

- The shelf/pool matchers hardcode their indent (`/^ {2}\S/`,
  `/^ {4}- /`, `raw.slice(6)`). They take a base indent. **Refactor,
  not rewrite.**
- `MAX_POOLS = 40` is currently a *document* cap. It must become
  **per profile**, with a separate document cap — six players × 20
  pools is 120 and must not be a refusal.
- Profile names become **display names**, which are whisper addresses.
  They take `cleanName`, not `cleanString` — the `#` ban applies (see
  GOALS notation-totality invariant). A file with `'Bo#b'` fails
  loudly at its line, never silently.
- `table:` keys map 1:1 onto `SETTING_SPECS` (`name` → `tableName`).
  `experiences` is **out** — §10's editor does not exist, so the key
  would carry nothing.
- **Unknown top-level sections become skip-and-warn**, not abort.
  Today the parser aborts the whole document on an unrecognized
  top-level line, which makes every future key a hard version break
  (POOL-ANALYSIS §9 raised this and left it open). The skip must know
  where a block *ends* — the next zero-indent line — and the warning
  must reach the preview status line, not vanish. **This decision is
  taken here**: tolerance, with the count of skipped sections shown.

### 3.2 The room key

`POST /api/table` — body `{room, playerId, rev, table:{…}, profiles:[…]}`.

- Settings go through the **existing** settings path so echo,
  validation and broadcast semantics are unchanged. No second
  validator for felt.
- Each profile's pools go through the existing `sanitizePools` (which
  already carries `category` and per-pool `set`); names through
  `cleanName`; the list capped at `MAX_PROFILES` (12).
- Stored as `room.setup = {rev, profiles, at}` and echoed in `hello`
  and `/api/join`; broadcast as `table-setup`.
- **Anyone may push it.** Last write wins, guarded by a monotonic
  `rev` so two organizers' tabs cannot ping-pong. This is goal 10
  compliance, not an oversight: it is furniture, exactly like the felt
  colour, which any player can already change.
- It is **not** an authority over anyone's saved pools. A player's
  localStorage stays the truth for their own rack — the setup is an
  *offer*.

### 3.3 The link

`?room=soul-deal` already works and stays the primary form —
**one link for everyone**, which is what actually gets shared in
Discord. `&as=Alice` is a *shortcut* that pre-selects a seat, never a
requirement, and never an auto-apply.

The "Take a seat" modal, when the room has a setup, lists the prepared
profiles as choosable seats plus *Someone else…* (free text, today's
behaviour). Choosing a seat:

1. takes the profile's name as the display name,
2. shows the **existing** import preview for its pools —
   `✓ 8 new · 0 updates — Apply takes them`,
3. applies on an explicit click, through `planImport`, deleting
   nothing.

**Step 2 is not negotiable.** GOALS §7 records exactly why the `#g=`
codec was killed: opening someone else's link silently replaced the
visitor's own rack, no preview, no undo. A prepared seat that
overwrites a player's pools on arrival re-commits that sin with better
manners. Preview-then-apply is the shipped, tested machinery; use it.

---

## 4. Authoring six characters (the CUJ1 mechanic)

The organizer needs the pool editor **and** the dice-value ledger
pointed at *someone else's* rack. The cheap way to get both is to not
build a second editor:

> **Load a profile into your own rack, edit it, save it back.**

The "Your data" pane lists the profiles in the loaded table file.
`Edit Alice` swaps `groups` to Alice's pools; the rack renderer,
manage mode, the popover, the spectrum bars and the ledger all work
**unmodified**, because as far as they know it is your rack.
`Save to Alice` writes it back into the file.

- Fixes gap 5 for free — no `poolsOwner` plumbing, no ledger change,
  no new surface. (POOL-ANALYSIS §11's stated gap closes without
  touching §2l.)
- The swap is explicit and shows what it is about to replace; the
  organizer's own pools live in the file as a profile like any other,
  so nothing is stranded.
- Download sits in the same pane, one click away, the whole time.

**Rejected: a second, foreign-rack editor.** Every management surface
(`✎`, the drag reorder, the shelf popover, `editPoolById`) assumes it
is writing your own `dice.groups.v1`. Parameterizing all of them is a
large, invasive change with a wide blast radius, in exchange for
saving one click.

---

## 5. Surviving the restart, without amending goal 7

Three mechanisms, ordered by cost. The first two are free of any
persistence amendment.

1. **The file.** One click restores everything, from a copy that
   outlives the server, the browser, and the laptop. This is the
   answer to "I'd like to never lose it," and it is the only mechanism
   that is *actually* durable.
2. **Client re-push.** The pushing client keeps the setup in
   `dice.table.v1:<room>` with its `rev` and re-pushes on `hello`
   whenever the room's `rev` is lower or absent. A restart self-heals
   the moment any organizer tab reconnects — which, on game night, is
   seconds. Costs nothing, breaks nothing.
3. **Room lifetime.** Give a room that has a setup a TTL instead of
   instant deletion when the last player leaves (`dropRoomIfEmpty`).
   The log and offers still clear; only the small setup lingers, and a
   timer reaps it. This is what makes "prep Tuesday, play Thursday"
   work while the instance stays warm.

**Genuine cross-restart persistence is a separate, optional item and
it is the one that touches GOALS §7.** A `DICE_STATE_FILE` env — write
room setups (never logs, never seats) to a JSON file on a debounce,
reload at boot — gives real durability *locally*. It does **not** help
on Cloud Run: the filesystem is ephemeral and `--min-instances 0` means
the instance goes away between sessions (DEPLOY.md). True durability
there means GCS or Firestore, i.e. a network dependency in the request
path and an amendment to "the server holds no persistent state."
**Recommendation: don't.** Mechanisms 1–3 cover game night. If Joe
wants it anyway, it is a post-game item with its own design.

---

## 6. Google sign-in — deferred, with the reasoning

Joe offered it: *"players can optionally log in via google and the
ones that log in can somehow save state."*

**Recommendation: not before game night.** It is the largest item on
the list and the one that serves the two CUJs least:

- It does not help CUJ1 at all. The organizer is the durable store,
  and §5's file already beats an account.
- It only helps CUJ2 for a player who wants their rack on a second
  device and kept no file — a real want, but not a game-night blocker.
- The cost is not the button. It is: OAuth redirect handling, ID-token
  verification (RS256 + JWKS, doable zero-dep with `node:crypto` but
  fiddly and security-sensitive), **a real server-side per-user store**
  — which is exactly the goal-7 amendment §5 just avoided — plus a
  consent surface, and an account concept in an app whose help text
  currently states, correctly, that there are none.
- It puts a login wall between a friend and a dice table, on the one
  night that must not have friction.

Revisit after the game, as its own pass, if players actually ask.

---

## 7. Build order

Each slice is independently shippable and leaves the app working.
**The line marked ⟨MVP⟩ is the minimum that makes game night work** —
everything after it is ergonomics.

| # | Slice | Buys |
| --- | --- | --- |
| G1 | **File door** — Download + Open file… in "Your data" (`Blob` + `a[download]`, `<input type=file>`; zero-dep). Filename from table name or room + date. | "Never lose it." Works today's format, no format change yet. |
| G2 | **Table file format** — `table:` + `players:` sections, per-profile pool cap, base-indent refactor, skip-and-warn on unknown sections, `cleanName` on profile names. Unit tests in `tests/portable.test.mjs`. | One file holds six characters + the table config. |
| G3 | **Profile authoring** — the profile list in "Your data"; `Edit ⟨name⟩` swaps the rack, `Save to ⟨name⟩` writes back. Ledger works unchanged. | ⟨MVP⟩ CUJ1 end to end, entirely client-side. **The game is playable from here** — hand each player their file. |
| G4 | **Room setup key** — `POST /api/table`, `room.setup`, hello echo, `table-setup` broadcast, `rev` guard, caps. Apply-to-table button. | The setup lives at the table instead of in six DMs. |
| G5 | **The seat picker** — prepared profiles in "Take a seat"; preview-then-apply on selection; `&as=` pre-select. | ⟨the URL ask⟩ CUJ2 end to end. One link, six players, right pools. |
| G6 | **Durability** — client re-push on hello behind `rev`; room TTL for rooms holding a setup. | Survives a restart and a Tuesday. |

Slices G1–G3 have **no server component at all** and cannot break a
running table. G4–G6 touch the wire and need the redaction/projection
conformances re-checked (§8).

**Testing** (per [TESTING.md](TESTING.md)): unit coverage for the
format in `tests/portable.test.mjs` (round-trip, per-profile caps, the
`#` refusal, skip-and-warn); new e2e tags `table-file` (G1–G3) and
`prepared-seat` (G4–G6). Reach via `window.__diceDebug`, never DOM
scraping. G3 and G5 each earn ONE interactive pass on an ephemeral
port — **never 8123**.

---

## 8. Conformances this pass must not break

Checked against ROADMAP's standing list:

- **`projectEntryFor` stays the only egress for roll entries.** The
  setup carries pools and settings — no roll entries, no values. It
  must not become a second path by which anything roll-shaped leaves
  the server.
- **Fail closed on hostile input.** The YAML parser names the line;
  `sanitizePools` drops what it cannot parse and keeps the canonical
  spelling; unknown dice-set ids fall closed to no override. New code
  matches, including the skip-and-warn path — *skipping a section is
  not the same as tolerating garbage inside a section it knows.*
- **`#` is banned in player names at every entry point.** Profile
  names are player names. This is the one place the new format can
  silently misdirect a whisper if it takes the wrong sanitizer.
- **Static-hosting solo works completely.** G1–G3 are client-only by
  construction. G5's seat picker must degrade to today's free-text
  prompt when there is no server.
- **Settings echo-apply with no optimistic divergence.** The
  apply-to-table path reuses the settings endpoint rather than writing
  a parallel one.
- **The canonical form is a byte-stable fixed point.** Notations
  normalize on import, as they already do.

---

## 9. Decisions taken here (record, so they are not re-litigated)

1. **The file is the durable copy; the server copy is furniture.**
   Keeps goal 7 whole.
2. **Preview-then-apply on every rack a player receives**, including a
   prepared seat. The `#g=` codec died for the alternative.
3. **Player blocks nest `pools:`** rather than putting shelves at the
   name's depth — no reserved-key collision, one grammar.
4. **Unknown top-level sections skip and warn** (closes POOL-ANALYSIS
   §9's open question).
5. **Authoring is rack-swap, not a foreign-rack editor** — closes
   POOL-ANALYSIS §11's ledger gap at no cost.
6. **One shared link stays the primary form**; `&as=` is a shortcut.
7. **No server-side persistence, no Google sign-in, before game
   night.**

## 10. Open questions for Joe

- **The date.** "Next week" was read as the week of 2026-08-10. If it
  is sooner, G4–G6 are the ones to cut — G1–G3 alone make the game
  playable.
- **Deployed or local?** DEPLOY.md targets Cloud Run and
  `deploy/config.mk` exists locally. If game night runs on Cloud Run,
  §5's mechanism 3 (room TTL) is worth more than mechanism 2, because
  the instance scales to zero between sessions. Worth confirming the
  deployment is live and that the >60-minute reconnect check in
  DEPLOY.md "Operating it" has actually been done.
- **Does a profile carry a felt or a dice set?** The set is designed
  in (per-player identity, §4.2). Felt is room-wide by design and
  stays that way.
- **Should the organizer's Apply-to-table also *rename* the room?**
  `tableName` is cosmetic and dies with the room; the `?room=` key is
  the durable address. Proposal: the file carries `table.name` only,
  and the `?room=` key stays whatever the link says.

---

# 11. The library — many profiles, one in your hands (2026-08-08)

*Design authority for the multi-profile pass. Written against Joe's ask:
"a player can have multiple profiles of pools and settings… up to 32
profiles per user… whatever profile they pick should be retained as the
one in use until they switch… players should be able to see profiles
from other players and even copy the profile for their own use… profiles
should be associated with a rolling system and a player should only be
able to pick a profile for the roll system of the table… when they join
a table they should use the last used profile for that rolling system…
I expect DMs to create profiles for players and have the players use
them when they log in."*

§1–§10 above designed the **prepared table**: a file holding six
characters, a room that offers them as seats, a link that addresses the
table. That shipped whole (Tier G). What it never had was a **home for a
player's own characters**. A rack was singular — `dice.groups.v1`, one
per browser — and §4's authoring worked by *borrowing* it: swap a
profile's pools in, stash yours aside, remember to give it back. This
section replaces the borrowing with a library.

## 11.1 The nine requirements

R1 a library of profiles per browser, cap **32** · R2 profiles have
**names** · R3 each is bound to a **rolling system** · R4 the picked one
**stays in use until switched** · R5 only profiles matching **the
table's system** are pickable there · R6 joining a table takes **the
last-used profile for that system** · R7 players can **see and copy**
each other's profiles · R8 DMs **author for players**, who **use them at
join** · R9 the join surface carries the **selector**, defaulting to
last-used, with a **Random** option and the table's other profiles.

## 11.2 The one sentence

> **The store owns the pools, and the active profile IS the rack.**

`dice.profiles.v1` is one JSON value:

```js
{ v: 1, seq: 7, activeId: 'p3',
  profiles: [
    { id: 'p3', name: 'Rill', system: 'soul-deal',
      set: 'emberforge.blackanvil',
      pools: [{id, name, notation, category?, set?}], at: 1754… } ] }
```

`at` is "last taken in hand". Everything else derives from it.

**Why one key rather than two.** The tempting shape is *the store holds
the other profiles and `dice.groups.v1` stays the live rack* — no writer
changes, tiny diff. Three designs were built out before this one and two
of them chose exactly that; **both named the same worst defect in their
own self-critique.** A switch is then three writes across two keys —
park the outgoing pools, write the incoming rack, move the pointer — with
only the first verified. A throw in the tail leaves the pointer naming
one profile and the rack holding another, and every repair for that state
is itself a data-loss path (one of the two designs traced its own X6 heal
deleting the outgoing rack). One key means `activeId` and both racks move
in **one `setItem`**: there is no torn intermediate state to survive.

The objection to one key is that `saveGroups` would have to fan out to
many writers. It does not: `saveGroups` (js/main.js) is the **only**
writer of the rack key, so pointing that one function at the store costs
one line. The real cost is that a pool edit re-serializes the whole
library — at 32 × 40 pools that is ~100 KB of `JSON.stringify` per
committed edit, which is sub-millisecond and synchronous, exactly as
today's write already is.

**Why a switch loses nothing, and why that is not the `#g=` sin.** GOALS
§7 records why the address-bar codec was deleted: it *replaced* a
visitor's rack sight unseen. A profile switch replaces nothing — both
racks are in the store, in the same write, and the outgoing one keeps
every pool it had. This is the distinction the whole design turns on:

> **Preview-then-apply guards a rack you RECEIVE. It does not guard
> authorship.** Taking your own profile in hand, or dealing yourself a
> new one, is not an import and has nothing to preview. Adopting someone
> else's rack still previews, through the shipped `planImport`.

Because the failure class is gone by construction, Tier G's stash — the
write-and-verify, the boot guard, the publish gate — is **deleted rather
than ported** (§11.8).

**Last-used-per-system is derived, never stored.** `lastUsedFor(system)`
is `profilesFor(system)[0]`, i.e. the most recent `at` among profiles
bound to that system. A stored `lastBySystem` map goes stale at exactly
the table R6 was written for: any player may flip the room's system
(goal 10), nothing is swapped when they do, and the map then files a Soul
Deal profile as your last D&D one. One field cannot disagree with itself.

## 11.3 One record, three places

| Place | What it is | Cap |
| --- | --- | --- |
| `dice.profiles.v1` | **my library** | 32 |
| `players:` in the portable file | the library's **durable copy**, or a DM's prepared set | 32 |
| `room.setup.profiles` | profiles **published to a table** | 12 |

The same `{name, system, set?, pools}` shape in all three (`toWire` /
`fromWire` in `js/profiles.js`). A DM's prepared table and a player's own
library are **the same document read by two people** — which is why the
file's cap moved to 32 rather than a second section being invented. The
room's cap stays 12 on purpose: 32 is how many characters a person keeps,
12 is how many seats a table has.

## 11.4 What a profile carries — and what it does not

**Carries:** the name, the system, the dice set, the pools. That is the
reading of "pools and settings" this pass takes: the settings that are
*about the character* — which rulebook reads its dice, which dice it
throws — travel with it.

**Does not carry:** `sound` and `numbers`. Those are about the room you
are physically in and the eyes you are reading with, not the character;
js/portable.js already decided this for a player block ("sound and
numbers are the receiving browser's, never the organizer's") and nothing
here overturns it. Nor felt, zoom or table name: those belong to the
table (goal 10 — room-wide, any player may change them).

*Flagged for Joe: this is the one judgement call in the pass. If a
profile should also remember its own sound/chips, say so and it is a
present-or-absent pair on the record and a reserved key in the file.*

## 11.5 The surfaces

Three anchors, each earning its place. **A library of one shows nothing
new anywhere** — the whole design is invisible until a second profile
exists, which is how it obeys "empty renders nothing" and §7.9's
no-standing-chrome rule.

**① The join chooser** — a `Profile` row in `#name-modal`, beside the
name. Lists my profiles **for this table's system**, most-recent first
with the last-used pre-selected (R6/R9), then `Random`, then the
prepared seats (unchanged §G5 behaviour, still preview-then-apply), then
`Someone else…`. The existing `Join` button confirms it: no second verb,
no wizard, no new phase.

The modal opens exactly where it opens today (no stored display name),
**plus** when `&as=` names a seat — a link that names a seat is a link
that wants you to take it, so it asks even of a returning player. A
reload never re-prompts (the seat resumes), and the lobby still asks
nothing at all: L0's "the first tap rolls" is untouched. Where the modal
does not open, the last-used profile for the table's system is taken in
hand silently — which is R6 stated literally, and it is lossless.

**② The switcher** — `openRailMenu`, the app's existing anchored-menu
machinery (viewport clamping, arrow nav, focus-out close, already a rung
in the Esc chain and a term in `modalOpen`). Anchored from **two**
places, and the second is not redundancy: `#pools-head` sits inside a
panel section §7.23 lets the player switch off, so a pools-panel-only
anchor is unreachable for anyone who collapsed Pools. The identity menu
carries the other. One builder, two anchors.

Off-system profiles render **greyed, not absent** — R5 without amnesia.
"Where did my fighter go" is answered by an affordance, not a sentence.

**③ The library list** in Settings → Your data, replacing §G3's profile
rows: name · system · pool count · in-hand tag · `Use` · `Copy` ·
rename · delete, plus `＋ New profile…` and `＋ Random…`, plus an **At
this table** group (prepared profiles and teammates' published racks,
each with `Copy`) that is absent when there is nothing at the table.
Manage-frequency work lives here rather than in the menu, because a
menu that closes on focus-out is the wrong container for a rename field
and a 32-row list is a panel wearing a menu's clothes.

**Mismatch (X1/X2).** When the profile in hand is bound to another
system than the table reads, the pools-panel head surfaces the profile's
system as a tag and `#profile-banner` — Tier G's, now in a `.mismatch`
variant — offers `Switch profile…` / `Keep`. Nothing is swapped, nothing
is reverted, no one is blamed for having flipped the setting, and the
rack stays rollable throughout: pools are notation, and a system is a
render-time lens (goal 6), so a mismatch is a **labelling** problem and
never a validity one.

## 11.6 Random

`js/seed.js` grows `dealRack(system, rng)` and `dealName(system, rng)`;
`dealStartingRack` keeps its name, signature and behaviour byte for byte,
so its exactness sweep still holds.

- **`soul-deal`** — unchanged: Attributes 9/100, Skills 6/100,
  Motivations 3/30, dice drawn inside the price.
- **`dnd`** — 12 pools: six skill checks and three saves as `1d20+M`,
  then a weapon's attack, its damage, and a spell. Unpriced by
  construction (there is no creation budget to hit), so the draw is in
  the names and the modifiers. A zero modifier emits no modifier — `+0`
  is not the canonical spelling of nothing.
- **`none`** — a **tray**, six plain pools drawn from ten, named for the
  dice they hold, and the dealt profile is called `Dice tray`. "Numbers
  only" declares it has no character model; inventing a person for it
  would say something untrue. Random still exists there, because a
  first-timer at a numbers-only table needs a rack in one tap.

Consequence, named so it is not found late: `buildSections`'
`ensureTrio` hardcodes the Soul Deal trio, so a D&D rack in manage mode
would stand three empty Soul Deal shelves. It becomes system-aware.

## 11.7 Caps

library **32** (client only — the server never sees a library) · pools
per profile **40** (the rack cap, unchanged) · names **24**, `#` banned ·
file profiles **32**, whole-file pools **1320** (now exactly the
structural maximum) · room profiles **12**.

## 11.8 What this deletes

`dice.groups.mine.v1` and its boot guard · the write-and-verify stash
dance · `portableEditProfile` / `portableSaveToProfile` /
`portableDoneEditing` / `portableAddProfile` · `portableEditing` /
`portableMine` · the `publishPools` gate that stopped a borrowed rack
leaking (publishing is now always honest, because the rack is always
your own active profile) · `#profile-banner`'s Save/Done pair · the
`Save as new profile` row. Two e2e scenarios (`profile-swap`,
`profile-swap-reload`) lose their subject and are replaced.

## 11.9 Decisions taken here

1. **One store key, one write.** Two-key designs were built and rejected
   on their own named defect: a switch with an unverified tail.
2. **A switch is not an import.** Preview-then-apply guards a rack you
   receive; authorship has nothing to preview. §9.2 is unamended.
3. **Last-used-per-system is derived from `at`**, never a stored map.
4. **A profile carries name, system, dice set, pools** — not sound, not
   chips, not felt.
5. **The room's cap stays 12 while the file's moves to 32.** A table has
   seats; a person has characters.
6. **The peek discloses the room's system.** Named in server.js: without
   it the picker filters against a guess and corrects itself after the
   seat lands, which is a silent swap wearing a spinner.
7. **Off-system profiles are greyed, not hidden.**
8. **An unknown system falls back in the store and refuses in the file.**
   The loud door is where a human is standing.
9. **Rejected: `&profile=` in the URL.** A link that decides which rack
   you are wearing is the `#g=` codec with better manners (GOALS §7).
10. **Rejected: version pointers on a copied profile.** A copy is a copy;
    tracking "the DM has since edited this" needs a profile identity on
    the wire that goal 7 does not want (goal 12 territory besides).
