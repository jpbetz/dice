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

**CUJ1 — the organizer.** One person (Joe or Walter) sits down before
game night and builds *six characters*: each a named profile with
Attribute / Skill / Motivation shelves of saved pools, priced against
*Your Soul Deal*'s 100-point creation budget. They also set the table's
look and rules — felt, interpretation system, table name, mat zoom.
Then they put it somewhere it cannot be lost.

**CUJ2 — the player arriving.** One link lands in Discord. Six people
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
