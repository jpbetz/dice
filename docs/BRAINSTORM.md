# BRAINSTORM — the mixing-it-up doc (opened 2026-08-31)

A shared scratch surface for big visual/UI swings. Ground rules, agreed at
opening:

- **This doc decides nothing.** GOALS stays the design authority; nothing
  here is scheduled until it earns a ROADMAP line. Ideas here are allowed to
  contradict shipped rulings — that is the point of the doc.
- **No competing.** Add, riff, extend. Nobody argues an idea down in here;
  pruning happens later, somewhere else.
- Sign what you add (`— Joe`, `— Claude`) so riffs can find their source.
- Numbers are just handles for pointing at ideas, not priorities.

Context for why: we have built our way into a system held in place by a lot
of guardrails — great for stability, bad for innovation. The core
capabilities are relatively sane; the dramatic room to move is at the high
level of the UI.

---

## 1. A seat at the table — Joe

The table has a name place marker for each player. Two players get opposing
markers; six players get a hexagon; and so on. Each player sees their own
marker nearest them, and their rolls land in a region near them.

**Riffs — Claude:**

- The camera identity follows: every player sees the table rotated so *their*
  seat is at the bottom edge. Same shared felt, same dice, different
  orientation per viewer — like actually sitting around a table rather than
  everyone watching the same broadcast.
- The throw physics follow too: your dice enter from *your* edge of the
  table, thrown away from you. Someone else's roll visibly comes from their
  side, so you can read who rolled without reading a log line.
- The place marker is a physical object in the scene (engraved brass stand,
  chalk on the felt rim — venue-appropriate), not a DOM label floating over
  the canvas. Grounded-register law says it should cast a shadow.
- Seat regions give the felt a social geography the log never had: "the roll
  is near Alice's marker" replaces a timestamp.

## 2. Dice leave the table differently — Joe

What if dice disappeared in a different way? Disintegrated, or something —
there's a bunch of ways we could do it.

**Riffs — Claude:**

- Theme-keyed exits, since houses already exist (THEMES.md): Emberforge dice
  burn out to embers, Tidewrack dissolves to seafoam, Rimehold shatters to
  frost, Reliquary crumbles to bone dust, Umbra is swallowed by its own
  shadow. The exit becomes part of what you bought when you picked the set.
- The grounded-register exit is different: a croupier stick sweeps them off,
  or a hand (implied, off-frame) collects them — physical, not magical.
- Entrances deserve the same pass: dice currently appear; they could
  condense out of the fog, pour from a cup at your seat edge (seat idea, §1),
  or be pushed in by the same stick that sweeps them away.
- Cheap first slice: sink into the felt. No particles, just a downward ease
  and a fading contact shadow — probably one afternoon, and it would prove
  whether exits are worth the fancier versions.

## 3. More views than expanded/collapsed — Joe

A DM wants what is effectively a collapsed view, but *per player*, so they
can offer rolls easily — plus some pools of their own for DM / NPC /
environment purposes.

**Riffs — Claude:**

- Name them **lenses**: Player lens (what we have), DM lens (a strip per
  seat + a private DM shelf), Spectator lens (chrome-free full-bleed camera
  for casting to a TV), Pocket lens (the phone view IMMERSION.md Wave 2 §4
  already proposes). One switcher, four contracts, instead of a growing pile
  of panel toggles.
- The DM lens is really a *permission* shape wearing a layout: "offer a roll
  to Bob's seat" is a new verb, and it pairs naturally with seat markers
  (§1) — the offered roll appears as dice waiting at Bob's edge.
- The spectator lens might be the cheapest of the four and the most
  demo-able: it is mostly *removing* things.

## 4. The chrome dissolves into the table — Claude

The panels are the last un-grounded part of the UX. What if the pools panel
were a physical dice tray sitting at your table edge — drag dice from tray
to felt to roll them — and the log were a paper scroll / chalk slate lying
at the rim, in the venue's own material language? The DOM keeps
accessibility and the keyboard path (MECHANICS M2c), but the *picture* is
all table. This is the most radical version of "mix it up at the high level
of the UI without touching core capabilities": same verbs, no panels.

## 5. Act on the die, not in a panel — Claude

Tap/click a settled die and get a small radial menu right at the die: keep,
reroll, interpret, dismiss. Kills the die→panel→die round trip that every
mechanic currently pays. Pairs with M2b's keep semantics, and with §4 it is
most of what the panels still do during play.

## 6. Results live on the felt — Claude

The sum currently lives in DOM text. It could assemble *on the table*: the
number chalked on the felt near where the pool settled (near your seat
marker, §1), fading as the next roll lands. Past rolls could leave ghost
imprints — faint chalk marks that fade over minutes — so the recent history
is readable off the surface itself, the way a real table remembers where
drinks were. The log panel becomes the archival view, not the primary one.

## 7. Throw as a gesture — Claude

Rolling is a button. It could be a motion: drag back on the felt and release
(slingshot — direction and vigor from the gesture, feeding the same seeded
physics), or shake the phone. The gesture sets the throw vector from *your*
seat edge (§1). Vigor already exists as a concept in the engine; this gives
it a hand.

## 8. Presence as shadows — Claude

Other players at the table today are log lines. Cheap ambient presence:
when another player is hovering/aiming a roll, a faint hand-shadow or
reach-shadow crosses the felt from their seat edge. You'd see someone
*about* to roll, the way you do at a real table. No avatars, no cursors —
just shadow-play, which the grounded register already speaks.

## 9. The table keeps time — Claude

Session-arc lighting: the venue's light very slowly changes across a long
session — candles burn down, the tavern fire dims, the glade shifts toward
dusk. Nothing mechanical, purely atmospheric, and nobody notices it
happening — they only notice, two hours in, that the table feels like it
has been played at. (Would need a way to opt out for streamers who want
consistent footage.)

---

*Add below or riff above. — opened by Joe & Claude, 2026-08-31*
