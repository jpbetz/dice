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
   after core mechanics; see Priorities.)
3. **Excitement outranks physicality.** Rolls are planned experiences: stakes
   declared, anticipation built, reveals accentuated and connected back to
   the stakes. Where drama and realism conflict, drama wins.
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
   fidelity.

## The scope

6. **Dice, not game rules.** This is a dice-rolling system. How rolls fit
   into an RPG's mechanics is the players' business. But the system is
   *literate* in major dice-rolling conventions: it understands
   interpretation systems (starting with "Your Soul Deal"; D&D-style and
   others addable) and lets the table **toggle** between them as a room
   setting. The interpretation layer (meaning words, DC verdicts, success
   counting) is pluggable per system — not hardcoded.

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
    consistency is law elsewhere: docs/VENUE-COMPOSITION.md (the thirteen
    rules — hierarchy, flow, depth, grown-not-placed, engine furniture
    wearing the world, the scenery tier) is normative for every venue
    build, enforced through the `/new-venue` process (added 2026-08-13,
    Joe's W2c directive).*
15. **Atmosphere serves the roll.** Every invariant below binds in every
    register, and two bind *hardest* exactly when a venue is at its most
    atmospheric: results stay readable (fog THINS over the resolve area, or
    settled dice burn through it — a Success you cannot read is a broken
    roll, not a mood), and ceremonies stay skippable. Determinism is
    unchanged: one seed, one film, every client — a venue changes what a
    roll looks like, never what it is. If an effect cannot meet these, the
    effect is cut, not the rule.

*Punted, recorded so nobody re-litigates them by accident (2026-08-15,
Joe: "let's punt on that sort of thing"): whether a venue can host multiple
dice sets; whether venue pieces later unbundle for à-la-carte use; how a
venue rides the portable YAML and the room settings. None of these block
the first fantasy venue.*

## Invariants (every feature must preserve these)

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
- **The felt keeps no marks (2026-08-03)**: Level 4's impact decals
  (frost / drying ring / scorch / smudge) shipped and were switched off
  the same evening — the ladder stayed, the residue went. The machinery is
  whole behind `DECALS_DEFAULT_ENABLED` in js/decals.js (per-page re-arm:
  `__diceDebug.decalsEnable(true)`); die lights and the Level 5 stack are
  untouched. THEMES.md ladder entry 4 is authoritative.
