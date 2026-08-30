# Design Goals

The durable statement of what this system is and how design decisions get
made. [ROADMAP.md](ROADMAP.md) sequences work against these goals; [UX.md](UX.md)
specifies components within them. Where the three disagree, this document wins.

**The word is "pool."** The dice you assemble to roll are a *pool*; the named
preset you keep is a *saved pool*. "Tray" and "group" are gone from every
label a player reads and survive only as identifiers — `dice.groups.v1`,
`id="tray"` — which stay put so stored state keeps working (UX.md's naming
note).

## The experience

1. **Grounded in the physical table.** The UX looks and feels like a real
   tabletop: actual 3D dice with real physics, a felt surface, results that
   land where they're thrown. Prefer showing real dice whenever that does not
   conflict with a higher goal. *(Scoped 2026-08-15: this is the law of the
   GROUNDED register — see The venues, goal 13. A fantasy venue trades
   material realism for a different believability contract, deliberately.
   The default table remains grounded.)*
2. **Fantasy-forward.** Effects beyond what a physical table can do — the
   roll-moment ceremony, mat inscriptions, crit fanfare, themed dice — are
   core to the experience, not decoration. (They are, however, sequenced
   after core mechanics; see Priorities.) *(Amended 2026-08-29: **mat
   inscriptions are retired as a mechanism, not as a goal.** The declare
   beat is told in LIGHT now — the room closes in and reopens as the dice
   return (UX §5.4, "Held Breath"). The effect this goal asks for is
   stronger for it, and it is no longer bounded by what a floor texture
   can hold. See Superseded decisions.)*
3. **Excitement outranks physicality.** Rolls are planned experiences: stakes
   declared, anticipation built, reveals accentuated and connected back to
   the stakes. Where drama and realism conflict, drama wins. *(Rider, added
   2026-08-28 with MECHANICS M5: **the decision can be the beat.** Ceremony
   has attached to the throw and the reveal. In a push-your-luck turn the
   drama is neither — it is the moment before the next throw, with a tally on
   the felt you are about to risk. A ceremony must be able to attach to a
   DECISION POINT, not only to a throw.)*
4. **Supplement the table; eliminate the toil.** Players never have to
   emulate the tedious parts: picking up and positioning dice, summing
   values, applying modifiers, cleaning the table. When dice settle, the
   system computes and expresses the net result immediately. Physical
   *interaction* (dragging dice, building pools by hand) is optional
   delight — never a required step.
5. **Organized over realistic.** Concurrent rolls must not become chaos. The
   system actively keeps rolls visually separate — allocating table space
   per roll, whisking settled dice aside or away (per-roll Done), and
   keeping the surface legible. A clean look-and-feel beats simulation
   fidelity. *(Rider, added 2026-08-28 with MECHANICS M2: **a turn holds its
   space.** A turn occupies its zone across several throws and possibly
   minutes of thinking, and the kept dice sitting where they landed ARE the
   read. Nothing may reclaim, collect or tidy a turn's zone until the turn
   ends — auto-collect's clock is the specific hazard.)*

## The scope

6. **Dice and their procedures, not game rules.** *(Amended 2026-08-28. The
   entry read "Dice, not game rules" and drew its line in one layer only;
   MECHANICS M4 is the work that needed the second one. What it always
   protected — that this is not a game implementation — is unchanged and is
   restated at the end.)* This is a dice-rolling system. How rolls fit into a
   game's rules is the players' business. But the system is *literate in the
   conventions of dice*, in two layers, both pluggable and neither hardcoded:

   - how a roll is **READ** — interpretation systems (meaning words, DC
     verdicts, success counting), starting with "Your Soul Deal", D&D-style
     and others addable, toggled by the table as a room setting;
   - how a roll is **STRUCTURED** — procedures: how many throws a turn may
     take, what may be kept between them, what ends a turn, and what the
     running tally is.

   Both are conventions of *dice*. Neither is a rule of any game.

   **What stays outside, permanently: game state.** Victory points, health,
   resources, the board, whose turn it is. A procedure knows about dice; it
   never knows what the answer means. The worked example is the one that
   opened this: for a monster-brawl dice game the app throws six symbol dice,
   lets you keep any of them, throws the rest, up to three times, and shows
   you the six faces you ended with — and never knows what a claw does, never
   tracks your energy, and never knows the city exists. We are not
   implementing that game. We are making its dice work.

## The architecture

7. **Stateless server, capturable client.** The server holds no persistent
   state — rooms live and die in memory. Anything worth keeping (saved pools,
   history, logs, statistics) is captured client-side: localStorage plus
   **explicit** export/import (`js/portable.js`). Capture is a thing the
   player *does*, not a side effect of where they are.

   *(Superseded 2026-08-04, Joe: "we have no production use, nor any
   backward compatibility needs — hard drop it." The URL used to BE the save
   file: the whole saved-pool rack rode the address bar as `#g=<base64url>`,
   rewritten on every edit and read at boot ahead of localStorage. Measured
   consequence: opening someone else's pools link silently replaced the
   visitor's own rack, no preview, no undo — the opposite of the YAML
   import's preview-and-merge. The codec, its module, its tests and its
   links are gone. The URL addresses a TABLE — `?room=` — and carries no
   user state at all. Persistent identity and saves are a later pass.)*

   *(Amended 2026-08-30: **every page now HAS a table address.** A page
   opened with no `?room=` mints a key and writes it into the address bar,
   so the bare url is a table and the lobby is a place you go on purpose
   (`?lobby`). The rule above is unchanged and is why this is allowed: a
   minted room key is the TABLE's address, not user state — nothing durable
   rides the URL, and the key is the door (goal 10), which is why it is 82
   bits of crypto random rather than anything guessable. The change is
   CUJ2's, not the architecture's: the link a host naturally shares was the
   front door, the front door was a lobby, and four remote players each
   landed on their own private felt. UX §7.20a.)*

   *(Amended 2026-08-14: `?stability=beta|stable` is the ONE other parameter
   the app reads, and it is a KEY rather than a setting — redeemed once into
   localStorage and then **stripped from the address bar** (`js/stability.js`,
   UX §7.38). So the rule above still holds literally: nothing durable rides
   the URL. The strip is not tidiness. The share flow hands out
   `location.href`, so a channel left in the query string would enrol every
   player a beta host invited — the closed beta leaking through its own
   invite link.)*
8. **One shared truth.** Every player sees the same values, attribution, and
   log. Presentation *pacing* is client-local (skips, ceremony timing);
   *information* never diverges except through deliberate visibility
   choices. Values are server-authored (crypto RNG) — no client can forge
   or predict a roll, and no player needs to trust another's browser.
9. **Zero-install, degrade gracefully.** Static hosting yields a fully
   working solo table. The server adds sharing, nothing else.

## The social model

10. **No roles. Ever.** Like a physical table, anyone can grab dice, roll,
    offer, clear their own roll, change table settings. Every capability a
    DM needs exists; all of them belong to every player. There is no access
    control and there never will be.
11. **Secrecy without hierarchy.** Privacy is a per-roll choice by the
    roller (or offerer), not a privilege: a roll can be entirely secret,
    result-secret (held — face-down for everyone including the roller,
    revealable by whoever chose it), or visible only to a selected
    audience of named players. Offered rolls may carry these visibilities
    (an offer whose result only the offerer sees reproduces the classic
    GM-screen roll — without a GM role).
12. **Interaction = the shared table.** Players interact through the shared
    view of the tabletop plus performing rolls, offering rolls, and
    visibility choices. This system is not a chat, a character sheet, or a
    campaign manager.

## The venues (added 2026-08-15)

13. **The table travels — as one thing.** A *venue* is the complete staging
    of the table: surface, horizon, atmosphere (fog, light), tower family,
    dice set, ambient life, and audio palette, chosen as ONE coherent whole.
    Selecting a venue is a full-set toggle: while a venue is active it
    REPLACES the à-la-carte pickers (felt theme, dice theme, tower) rather
    than layering over them — coherence is where immersion lives, and a
    venue must never be assembled into incoherence one dropdown at a time.
    The shipped room (felt, wooden towers, the lamp) is itself a venue: the
    grounded one, and the default. *(Scoped 2026-08-14: the full-set
    replacement is the PRODUCTION player's experience. The closed-beta
    channel is offered every picker even while a venue stands — "the whole
    idea was to make it so beta gives access to everything" (Joe) — because
    the beta exists to judge pieces inside wholes, and a beta browser mixing
    deliberately is composition work, not incoherence. As first shipped the
    replacement ran on every channel and, by bug, took the venue's own
    picker with it: an empty Staging panel with no way out of the glade,
    reading exactly like revoked beta access. UX §7.38.)*
14. **Two registers of belief.** A **grounded** venue is believed the way a
    fine miniature is believed — small object, real material, real light
    (the LEGO case; docs/IMMERSION-AUDIT.md §9). A **fantasy** venue is a
    place that never existed and does not apologize for it; it is believed
    through INTERNAL CONSISTENCY instead: one light-logic, one palette, one
    place, effects native to that place. Wonder outranks material realism
    there — dice may glow, air may swirl, the ground need not be a table.
    Neither register is allowed to be half-believed: a fantasy venue that
    keeps one foot on the casino felt reads as a costume, which is why goal
    13 makes the set atomic. *How a venue's SCENE earns internal
    consistency is law elsewhere: docs/VENUE-COMPOSITION.md (fifteen rules
    as of 2026-08-14 — hierarchy, flow, depth, grown-not-placed, engine
    furniture wearing the world, the scenery tier, the living layer, and
    rule 15: a composition gate is stated in the FRAME) is normative for
    every venue build, enforced through the `/new-venue` process (added
    2026-08-13, Joe's W2c directive). Do not quote the count from memory —
    it was written here as "thirteen" while the file held fifteen.*
15. **Atmosphere serves the roll.** Every invariant below binds in every
    register, and two bind *hardest* exactly when a venue is at its most
    atmospheric: results stay readable (fog THINS over the resolve area, or
    settled dice burn through it — a Success you cannot read is a broken
    roll, not a mood), and ceremonies stay skippable. Determinism is
    unchanged: one seed, one film, every client — a venue changes what a
    roll looks like, never what it is. If an effect cannot meet these, the
    effect is cut, not the rule.

## The coverage (added 2026-08-27)

16. **The families of dice mechanic are the coverage target.** "The best
    possible virtual dice rolling simulator" is the ambition (Joe,
    2026-08-27), and it is only a goal if it can be checked — until this
    section existed, the answer to "are we there yet" could only be a
    feeling. The unit of coverage is the **family**, not the game: a family
    is a way dice get used that needs machinery of its own. The table is
    maintained HERE and nowhere else, and an open row is a legitimate thing
    to prioritise against immersion work.

| family | example | today |
| --- | --- | --- |
| single-throw resolution vs a target | `d20+5 dc15` | shipped |
| pools with attributed modifiers | `2d8[Wisdom]+3` | shipped |
| keep/drop inside one throw | `4d6dl1` | shipped |
| advantage / disadvantage pairs | `2d20kh1` | shipped |
| exploding, chained | `d6!` | shipped (chain cap 3) |
| per-die reading, no sum | *Your Soul Deal* | shipped |
| rule-driven rerolls | `4d6r<2` | shipped |
| the secrecy ladder | held / secret / whisper | shipped |
| success counting | pool vs a threshold, count hits | **mostly** — `6d6 push>=5` reports how many dice scored, which IS a success count (M4). What is still open is success counting as an INTERPRETATION system, so a table can read every roll that way without declaring it: ROADMAP §8 |
| symbol faces | Fudge, monster brawls | **shipped 2026-08-28** — MECHANICS M3; `symbols.fate` closes §8's Fudge half |
| roll-and-lock across throws | Yahtzee, King of Tokyo | **shipped 2026-08-28** — `6d6 t3`; MECHANICS M2/M2b/M2c |
| push-your-luck | Pig, Farkle-shaped games | **shipped 2026-08-28** — `1d6 push>=2`, bust and bank; MECHANICS M4 |
| dice drawn from a bag | a cup of mixed dice | **shipped 2026-08-28** — `3d6 bag:6@a,4@b`; MECHANICS M6. It does NOT do a cup that DEPLETES across a turn — that is stateful and the bag has no memory by design |
| opposed rolls | two players, one comparison | **open** — every roll is read alone; nothing on any surface compares two |
| dice drafting | Sagrada, Dice Forge — roll a shared pool, take turns picking from it | **open** — MECHANICS M7. The one family that breaks an assumption rather than adding to it: every roll here belongs to ONE player |
| initiative order | one shared action, sorted | **open** — ROADMAP §7 |

    **Five rows closed on 2026-08-28** (MECHANICS M1–M6, one day's Track C
    campaign) and symbol faces gained their READING the same week (the
    `monster` system). **Three remain open, and the pattern in them is worth
    seeing:** initiative order, opposed rolls and dice drafting all involve
    MORE THAN ONE PLAYER'S dice at once, which is the assumption every mechanic
    shipped so far leaves untouched. None of the three was found by playing —
    each was found by writing this table down, which is what it is for.

    **A family may be deliberately refused**, and a refused row says so with
    its reason — coverage is a goal, not a mandate, and this project kills
    designs on purpose. What a family may not be is *unnamed*: the opposed-roll
    row was found by writing this table and appears on no roadmap item.

    [MECHANICS.md](MECHANICS.md) holds the campaign that closes the open rows
    and the evidence for why they are open. **Goal 6 draws the line this table
    may never cross** — a family is a way DICE are used, never a game's rules.

*Punted, recorded so nobody re-litigates them by accident (2026-08-15,
Joe: "let's punt on that sort of thing"): whether a venue can host multiple
dice sets; whether venue pieces later unbundle for à-la-carte use; how a
venue rides the portable YAML and the room settings. None of these block
the first fantasy venue.*

## Invariants (every feature must preserve these)

- **The procedure never plays for you.** *(Added 2026-08-28 with goal 6's
  second layer.)* Every choice a procedure creates — which dice to keep,
  whether to throw again, whether to bank — belongs to the player. The app
  may show what is at stake and what the odds are; it never chooses, never
  auto-keeps, never auto-banks, and never hides a legal option. This is goal
  10's "no roles, ever" applied to automation rather than to people: the
  reason to trust this table is that nothing acts for you.
- **Notation totality.** Every possible roll has a text notation, and every
  notation is buildable through the UI. The canonical form is a byte-stable
  round-trip fixed point. *(The two violations audited 2026-07-30 are
  closed and re-verified 2026-07-30: roll moments canonicalize as
  `check`/`cinematic` + `# Title | Subtitle`, and the whole visibility
  ladder canonicalizes as `held` / `secret` / `w:Name`, so saved pools, history
  and exports carry both. The last audited violation — a player name
  containing `#` silently misdirecting a whisper through the comment
  split — is closed by **banning `#` in player names at every entry
  point** (server `cleanName` at join/rename, loud client refusals), so
  the round trip is total over every name that can exist. Pinned in the
  redaction suite; see UX.md §3.0.)*
- **Uniform roll surfaces.** Every UI element that triggers a roll offers
  the same capabilities (the UX.md §7.4 matrix): full intent editing, both
  verbs (Roll / Offer), in both full and compact view. *(One carve-out,
  added 2026-08-08 to match what has always shipped: this binds **authoring**
  surfaces, the ones where a roll's intent is composed. A **launcher** — the
  collapsed column's pool rail and dice list — fires intents authored
  elsewhere and is exempt from the Offer and intent-editing columns, on the
  condition that an authoring surface is one keystroke away, `n` or `/`. What
  a launcher may send is bounded so the exemption cannot hide anything: a
  single pick rides its pool's stored intent verbatim, a multi-pick composes
  only what the grammar can union and names what it set aside, the dice list
  sends a bare `NdX`, and a visibility conflict fails closed to `secret`.
  UX.md §7.4 holds the matrix and §7.22/§7.23 the reasoning.)*
- **Immersion is never a downgrade.** Compact view hides chrome only; the
  experience renders identically.
- **Always interruptible.** Any ceremony or effect is skippable to its
  complete result in under 150 ms. Keyboard paths exist for the common
  actions. Excitement never costs control.
- **Results readable on screen.** No squinting at 3D faces: chips, totals,
  breakdowns, and interpretation are presented directly, with attribution
  (named bonuses, kept-over-struck dice) visible.
- **The table is never blocked.** Anyone can roll at any time; nothing
  modal locks the shared surface; concurrent rolls are safe.
- **Attributed math.** Bonuses carry named sources; discarded dice stay
  visible (struck); the arithmetic of a result is always inspectable.
  *(It governs math that **happens**. An interpretation system that reads each
  die computes no sum, so there is no term to attribute and the flat bonus
  renders nowhere in the app's voice — while **which dice counted** is a fact
  under every system and stays attributed, which is the half that was being
  broken. The player's declaration is untouched either way: the canonical
  notation still carries the `+5` and the `dc`, so notation totality is
  unaffected. UX.md §7.24.)*
- **Presence is asserted, never inferred.** A seat on the roster means a
  client said it was there — a beacon on the way out, an answered heartbeat
  while it stays. Socket-level signals (a `close` event, a write that
  throws) describe our connection to whatever proxy is in front of us, not
  the player's connection to us; on a deployed table they can stay healthy
  for an hour after the browser is gone, and taking them for presence is
  what put four ghosts on the roster (2026-08-06, see
  [SHIPPED.md](SHIPPED.md#presence-departure-is-said-out-loud-2026-08-06)).
  The roster is live state and answers to this; the roll log is history and
  does not — a departed player's name stays on the rolls they made.

## Priorities

When sequencing work: **core mechanics** (rolling, notation, interpretation
systems, visibility, organization/concurrency) come before **presentation
effects** and before **customization** (dice sets, custom themes, physical
pool-building delight). Fantasy-forward effects are core to the vision but follow a
working, coherent mechanical foundation.

## Superseded decisions (flagged 2026-07-30)

*History, not instructions. Each entry records a decision that was
overturned and where the replacement now lives; the replacement documents
are authoritative, and nothing here needs to be consulted to build.*

- **The DM seat is rescinded** by goal 10. *Settled:* UX.md §3 has been
  rewritten as the role-free visibility spec and every trace of the seat is
  gone from it — no `room.host`, no `/api/host/*`, no `host-changed`, no
  host-gated reveal. Three of its four powers returned as per-roll choices
  (whisper audiences, offers with restricted result visibility, universal
  housekeeping); the fourth, hidden Targets, was rejected outright, because
  stakes are public on every visibility rung. Its redaction architecture
  survived and became the shipped projection model. Read UX.md §3 for what
  is true; this entry only explains why an older draft said otherwise.
- **"Physical analogy over UI" is softened** by goals 3–4: physical
  look-and-feel grounds the experience; physical interaction is optional
  delight. Building a pool by hand (UX.md §7.1) moves to the delight tier.
- **Interpretation is a system toggle** (goal 6): the always-on pairing of
  Soul Deal words + DC verdicts becomes the "Your Soul Deal" system profile;
  a "D&D"-style profile (DC verdicts, nat-20/1 crits, no meaning chart) and
  a "None" profile (numbers only) join it as room settings.
- **"Grounded everywhere" is narrowed to the grounded register
  (2026-08-15)** by goals 13–14: the miniature-believability strategy
  (small object, real material — no tilt-shift, no impossible light) was
  the whole table's law; it is now the law of grounded venues only. The
  audit rows written against it (IMMERSION-AUDIT.md §6, §9) remain correct
  *for that register*. Joe: "go full fantasy... nothing needs to be real
  dice on a real table."
- **The declaration left the felt (2026-08-29)**: UX §5.4 promised the
  declaration as a canvas-texture decal on the table plane, "diegetic and
  looks like nothing else on the web". It shipped that way and was broken
  at every zoom for the life of the feature — fitted to 26 world units and
  seated at a constant `z +3.4`, both survivors of the 30-unit mat that C25
  also caught out at the shelf. At `medium`, the default, "THE GATE OF
  STORMS" rendered as `ATE OF ST`.
  It could not be fixed in place. The floor atlas gave **12.8 px per world
  unit**, so no font size sets a legible line inside a mat 8.6–14.1 units
  wide; the old code's oversizing was the only way to make it readable at
  all. Joe's call: **Held Breath instead** — on the declare beat the lamp
  narrows and lifts, the hemisphere and rim fall away, and the table is
  left in a smaller pool of light; it reopens as the dice come back.
  Nothing is drawn, which is why it works on all nine cloths and on every
  mat that ever ships, and costs nothing on the wire. The words were never
  the felt's job: the intent card names the moment and still does.
- **The felt keeps no marks (2026-08-03)**: Level 4's impact decals
  (frost / drying ring / scorch / smudge) shipped and were switched off
  the same evening — the ladder stayed, the residue went. The machinery is
  whole behind `DECALS_DEFAULT_ENABLED` in js/decals.js (per-page re-arm:
  `__diceDebug.decalsEnable(true)`); die lights and the Level 5 stack are
  untouched. THEMES.md ladder entry 4 is authoritative.
