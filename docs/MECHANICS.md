<!--
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# MECHANICS.md — what a dice simulator has to cover

**Status: RULED ON 2026-08-27, the same day it was written.** Joe answered
two of its four questions plus the sequencing call, and the answers are
recorded where they were asked. **Q2 was answered on 2026-08-28** (visibility
belongs to the turn) and Q3 is still open, blocking nothing. **M5 shipped
2026-08-28** — the decision point now has numbers on it — so what is left of
Track C is M4, M6, the keyboard path M2b owes, and one bug M5 found and did not
fix (a ceremony turn auto-collects with throws left; see M5's record). What was
settled:

- **Scope: M1 through M3, and M4 waits.** Build the substrate, the turn and
  symbol faces. Decide whether the app should detect a bust and keep a tally
  once there is a turn on the felt to play with. **All three shipped
  2026-08-28**, and they turned up one more item that was not on the list:
  M2b, the player-facing gesture — M2 works from the API and the debug seam,
  and M1's pick path is still dark, so nothing yet joins them up.
- **Sequencing: mechanics before T15.** The three classic skins wait.
- **Goal 16 is adopted** — the coverage table now lives in
  [GOALS.md](GOALS.md) and this file cites it rather than holding a copy.
- **Visibility belongs to the TURN, not the throw** (2026-08-28, Q2).
- **M1 is SHIPPED** (2026-08-28). M2 is next and nothing gates it.

[GOALS.md](GOALS.md) still wins every tie. **All five goal edits have now
shipped** (2026-08-28): ② with the coverage table, and ①③④⑤ when Joe said
*"continue through all of Track C"*, which is the decision ① was waiting for —
M4 is in Track C and M4 is the goal 6 change.

*Recorded because it is the failure this repo names most often: ③④⑤ were
written as "they land in the commit that ships M2, so nothing dangles", and
then M2 shipped without them. A promise about a future commit is not a
mechanism. They landed three commits late, found by re-reading GOALS rather
than by anything failing.*

## The ask

> "If the goal is to have the best possible virtual dice rolling simulator, I
> don't think we're really there yet. We've invested in RPG rolling and in
> Walter's *Your Soul Deal*. We're terrible at stuff where you roll-and-lock
> or push-your-luck. I also play King of Tokyo sometimes and it has the
> mechanic but we're incapable of supporting it today." — Joe, 2026-08-27

## The finding, in one line

**This product models a ROLL. Every mechanic he named is a TURN.**

A roll here is atomic by construction: you declare it, it is composed once,
it is filmed once, it lands, it is read, it is done. A turn is a state
machine — throw, look, choose, throw again — and there is no state between
throws anywhere in the system to put that choice in.

Evidence, all re-derived against the tree on 2026-08-27:

| what is true | where | why it binds |
| --- | --- | --- |
| `composeRoll(dice, mods, rng)` returns every value and the total in one pass | `js/rollspec.js:111` | a roll's values all exist at birth; there is no second draw |
| its "reroll" is reroll-below-N, decided by the rule and applied inside the same throw | `js/rollspec.js` (`validateMods`, `reroll.below`) | the app has re-rolling, but the *rule* chooses, never the player |
| the server composes once and the log entry is complete when it is created | `server.js:2114` (`executeRoll`) | an entry is a finished fact; nothing reopens one |
| the film is baked before frame one and the dice end static at their corrected final pose | `js/main.js:5186`ff | one seed, one film, one throw |
| an interpretation system READS a finished entry (`outcomesFor(entry)`) | `js/meanings.js:238` | three systems, two aggregates (`per-die`, `sum`); no method in the interface can ask for another throw |
| `rerollOfId` links a new roll to a parent for provenance only | `server.js:2279` | "she rerolled that check" — a second, separate roll; nothing is kept |
| there is no pointer→die path in the app at all | ROADMAP V5, re-checked 2026-08-17 | you cannot say *which* dice to keep, because you cannot touch one |
| every die type is numeric | `DIE_MAX`, `js/rollspec.js:30` | d4 d6 d8 d10 d10x d12 d20; the only face-glyph seam is `glyph:'pip'` for d6 (`js/dice.js:283`) |

## The three gaps, and they are independent

1. **A roll ends when the dice stop.** There is no turn: no second throw, no
   state carried between throws, no notation for one.
2. **You cannot point at a die.** Keeping is a per-die choice by a human, and
   the app has no path from a pointer to a die on the felt. This is the
   substrate gap, and it is smaller than it sounds — `THREE.Raycaster` is
   already used elsewhere in the app for geometry work, never for input.
3. **Faces are numbers.** King of Tokyo's dice read 1, 2, 3, energy, claw,
   heart. ROADMAP §8 already names this need ("Fate/Fudge dice, coins…
   **needs dice.js custom face sets**") and it has sat unsequenced.

What each named game needs:

| game | 1. turn | 2. touch a die | 3. symbol faces | extra |
| --- | --- | --- | --- | --- |
| Yahtzee | yes | yes | — | — |
| King of Tokyo | yes | yes | yes | — |
| Farkle | yes | yes | — | a bust judgement |
| Pig | yes | — (all or nothing) | — | a bust judgement |
| Can't Stop | yes | yes | — | pairing 4d6 |
| Zombie Dice | yes | — | yes | dice drawn from a bag |

## What "best possible" would have to mean

The project had no definition of "best" that anything could be measured
against, which is why the answer to "are we there yet" had to be a feeling.
**That is now [GOALS.md](GOALS.md) goal 16**, adopted 2026-08-27: the unit of
coverage is the *family of dice mechanic*, the table is maintained there and
nowhere else, and an open row is a legitimate thing to prioritise against
immersion work.

Five rows are open and this campaign closes four of them — symbol faces
(M3), roll-and-lock (M2), push-your-luck (M2/M4) and the bag (M6). Success
counting is ROADMAP §8 and rides M3's face-set work. Two more rows are open
and are *not* this campaign: initiative order (§7) and **opposed rolls**,
which was found by writing the table and appears on no roadmap item — every
roll in this product is read alone and nothing on any surface compares two.

## The line: procedures, not game rules

Goal 6 says "Dice, not game rules", and read quickly it forbids all of this.
Read properly it does not, and the distinction it is already making is the
right one — the app is *literate in conventions* and *ignorant of games*. It
just draws that line in one layer only.

Today the system is literate in how a roll is **read**: the interpretation
registry is pluggable and documented. It has no vocabulary at all for how a
roll is **structured**: how many throws, what may be kept between them, what
ends a turn, what the running tally is. Both of those are conventions of
dice. Neither is a rule of any game.

**The concrete test, and the sentence worth keeping:** for King of Tokyo the
app throws six symbol dice, lets you keep any of them, throws the rest, up to
three times, and shows you the six faces you ended with. It never knows what
a claw does, never tracks your energy or your health, and never knows Tokyo
exists. We are not implementing King of Tokyo. We are making its dice work.

## The proposed goal changes

Five edits, written as replacement text.

**① Goal 6 becomes "Dice and their procedures, not game rules."**

> This is a dice-rolling system. How rolls fit into a game's rules is the
> players' business. But the system is *literate in the conventions of dice*,
> in two layers, both pluggable and neither hardcoded: how a roll is **read**
> (interpretation systems — meaning words, DC verdicts, success counting) and
> how a roll is **structured** (procedures — how many throws a turn may take,
> what may be kept between them, what ends a turn, what the running tally
> is). What stays outside, permanently: game state. Victory points, health,
> resources, the board, whose turn it is. A procedure knows about dice. It
> never knows what the answer means.

**② New goal 16 — the families are the coverage target.** The table above,
moved into GOALS.md and maintained there, so "best possible dice simulator"
has a definition that can be checked instead of felt.

**③ New invariant — the procedure never plays for you.** Every choice a
procedure creates — which dice to keep, whether to throw again, whether to
bank — belongs to the player. The app may show what is at stake and what the
odds are; it never chooses, never auto-keeps, never auto-banks, and never
hides a legal option. This is goal 10's "no roles, ever" applied to
automation rather than to people: the reason to trust the table is that
nothing acts for you.

**④ Goal 5 rider — a turn holds its space.** Goal 5 allocates table space per
roll and whisks settled dice aside. A turn occupies its zone across several
throws and possibly minutes of thinking, and the kept dice sitting where they
landed *are* the read. Nothing may reclaim, collect or tidy a turn's zone
until the turn ends. (Auto-collect's 3 s clock is the specific hazard;
see the M2 risks below.)

**⑤ Goal 3 rider — the decision can be the beat.** "Excitement outranks
physicality" currently attaches ceremony to the throw. In push-your-luck the
drama is not the throw, it is the moment before it, with a tally on the felt
that you are about to risk. The ceremony machinery has to be able to attach
to a **decision point**, not only to a throw and a reveal.

## What does not change, and one thing that costs design work

Untouched by all of this, and each is a gate the campaign must pass:

- **Determinism.** "One seed, one film" becomes *one seed per throw, N films
  per turn*, and it still holds — a kept die's resting pose is already
  bit-identical on every client (that is what the whole bake contract buys),
  so a second throw baked over static kept dice is deterministic everywhere
  for the same reason the first one is.
- **One shared truth / server authority.** Every throw's values are composed
  server-side by the same `composeRoll`. A turn is N compositions, not a
  client that keeps rolling on its own.
- **No roles.** A procedure is a property of a roll, not of a table or a
  person. Nothing here introduces a turn order or anyone to enforce it.
- **Always interruptible.** A turn adds a *waiting* state, which is new: the
  skip path must resolve a turn as well as a film.
- **Results readable.** Symbol faces have to reach the chips and the log, not
  just the felt. A glyph nobody can read in the result card is a broken roll
  under the existing invariant.

**The one that costs real design work is notation totality** — every roll has
a text notation, every notation is buildable in the UI, and the round trip is
a fixed point. A turn has two halves and only one of them is a declaration:

- the **procedure** is declared, and rides the notation: `6d6 t3` = throw up
  to three times, keeping what you choose between throws. It sits with the
  trailing flags, canonical order after keep/reroll and before the moment
  flags, and it round-trips like every other flag.
- the **transcript** — which dice were kept on which throw — is an outcome,
  not a declaration, and rides the log entry beside `values` and `perDie`.
  Precedent: values, seeds and totals are not in the notation either, and
  `specEquals` compares declarations.

That split is what keeps the invariant true, and it is the first thing to
sanity-check if the design is attacked.

## The roadmap

The important structural point first, because it changes the price:

**M2 needs no goals fight and no game knowledge.** "Throw up to three times,
keep what you like between throws" is a dice affordance, not a rule — it is
what your hands do at a physical table, and the human decides everything. It
makes Yahtzee, King of Tokyo, Farkle, Pig and Can't Stop *playable*. Goal 6's
line only has to move for **M4**, which is what makes them *assisted* (the
app detecting a bust, keeping the tally, offering a bank verb). So the
sequence buys the whole of Joe's complaint before the contested question has
to be answered.

| # | item | size | needs a goal change | what it unblocks |
| --- | --- | --- | --- | --- |
| ~~**M1**~~ | ~~**Touch a die.**~~ **SHIPPED 2026-08-28** — see "M1, and the two bugs only a screenshot could find" below. | med | no | everything below; also V5's felt echo and §7.1 physical pool building, both stalled on exactly this |
| ~~**M2**~~ | ~~**The throw becomes a turn.**~~ **SHIPPED 2026-08-28**, minus the player gesture — see the record below. | large | no | Yahtzee, King of Tokyo, Farkle, Can't Stop, Pig — with the human judging the bust |
| ~~**M2b**~~ | ~~**Pick becomes keep.**~~ **SHIPPED 2026-08-28** — a turn is playable by a person; see the record below. | small–med | no | any of Track C being usable without the API |
| ~~**M3**~~ | ~~**Faces that are not numbers.**~~ **SHIPPED 2026-08-28** — `symbols.monster` and `symbols.fate`; see "M3, and the game we are not naming" below. | med | no | King of Tokyo's actual dice, Fudge, and ROADMAP §8's first half |
| **M4** | **Procedures as a registry.** `PROCEDURES` beside `SYSTEMS`: throws, keep rule, bust rule, tally, bank verb. Farkle and Zombie Dice become assisted rather than merely possible. | med–large | **yes — this is the goal 6 decision** | automatic bust, running tally, the bank verb |
| ~~**M5**~~ | ~~**The decision as a beat.**~~ **SHIPPED 2026-08-28** — the readout forecasts in the shape the table READS, and refuses in writing where it cannot. See the record below. | med | no (rides ⑤) | the reason to use this instead of physical dice |
| **M6** | **The bag.** Dice drawn at random from a defined cup. | small–med | no | Zombie Dice; and it is the honest primitive behind any "draw 3 of these 13" |

**M1 first, and it is worth doing even if Joe stops the campaign there** — it
is the substrate for M2, and it independently unblocks two design-first items
that have been stuck on the same missing path for weeks.

### M2's named risks, so the design is not attacked by surprise

- **Auto-collect will eat a turn.** The 3 s clock and the shelf both assume a
  roll is finished when it settles. A turn in its thinking state must be
  exempt, and that exemption is goal-5 rider ④ written as code.
- **Visibility across throws is a real question, not a detail.** A held turn
  — three throws, revealed at the end — is coherent and probably what a
  hidden Farkle wants. A secret turn is coherent. A *whispered* turn where
  the audience watches throw two but not throw one is not obviously
  anything. Ruling needed before build; the safe default is that visibility
  belongs to the turn, not to a throw.
- **The re-bake is over a non-empty felt.** The kept dice are already static
  bodies at corrected poses, so they participate as obstacles — which is
  physically right and is the fun of it, and also means the pour's
  hidden-die backstop now has furniture to fail against. Expect the bake
  attempt budget to matter more, and gate on it.
- **40 physical dice is the cap** (`MAX_PHYSICAL_DICE`), unchanged; a turn
  does not raise it, it just throws fewer dice more often.

### What this displaces

This is a third track. Track A is debt, Track B is the owner's track
(venues, towers, dice art — currently T15 plus a design-first tail), and this
would be Track C. It does not fit inside either, and pretending it does is
how it would get starved.

**RULED 2026-08-27: mechanics first, T15 waits.** The reasoning below is what
was put to him and what he chose.

Honest sequencing: **M1 and M3 are cheap enough to interleave with Track B**
and both close items already on the roadmap (V5's substrate, §8). **M2 is the
large bet and it competes directly with T15** — three baked skins versus the
mechanic Joe says the product is bad at. Recommendation: M1 now, then M2,
and let T15 wait, because a re-baked skin makes the existing thing prettier
while M2 makes the product cover a family it cannot play at all today.


## M1, and the two bugs only a screenshot could find — SHIPPED 2026-08-28

**What shipped.** `pickDieAt(x, y)` raycasts the settled dice and returns one
or null; a tap toggles it; picked dice wear a ring on the ground. The gesture
is DARK by default (`PICK_DEFAULT_ENABLED = false`) — nothing consumes a pick
until M2, and a die that highlights and then does nothing teaches the wrong
thing. M2 flips one constant. The trade is the one `js/decals.js` already
makes with `DECALS_DEFAULT_ENABLED`: machinery whole, switched off, armable.

**What may be picked** is deliberately permissive — this is a substrate, and
WHOSE dice may be kept is M2's policy. Three exclusions that do not depend on
M2: an invisible die (a poured die parked in the tower), a shrouded die (goal
11 — its dice are not supposed to be distinguishable), and a die whose own
film is still running (playback owns the mesh transform).

**The keyboard path is deliberately NOT here.** `toggleDiePick` is
input-agnostic so M2 only adds a binding, but inventing a keybinding for an
action that does nothing is a binding players have to unlearn. It is owed by
M2, with the word for "keep".

**The marker is provisional and M2 owns the real one.** What a KEPT die looks
like is a turn's vocabulary. This is a plain ring, enough to judge tap
accuracy on a phone. It reads as a crescent from the resting eye, because the
die standing in it occludes the far side — correct, and worth revisiting when
the look is designed.

### The two bugs, because both were invisible to every green check

The e2e asserted the selection AND `marks` — the InstancedMesh's live count —
specifically so a selection that draws nothing could not pass. It passed
anyway, twice, because **an instance drawn where nobody can see it is still an
instance**. Only rendering the frame and looking at it found either one.

1. **The marker drew under the atmosphere.** At `renderOrder 2` it was behind
   a fae venue's three fog sheets (5/6/7, `js/fae-lab.js`). Gold at 0.75
   opacity under three stacked teal sheets is nothing at all. Fixed by
   drawing after them at 10 — which costs no occlusion that matters, because
   the sheets set `depthWrite: false` while the dice are opaque, so a ring
   still disappears correctly behind the die standing on it. GOALS goal 15
   exactly: the mood loses to readability.

2. **The marker drew under the floor, and this one is W3 round 9 repeating.**
   Its height came from the DIE — the bottom of its bounding box. A settled
   die *sinks* into what it rests on: in a fae venue the dice come to rest
   with their undersides at y ~0.001 while `faeGround`, an opaque
   depth-writing disc, stands at y 0.02. So the ring sat a centimetre under
   the floor. **This was reintroduced in a comment that cited the stump bug as
   the reason for the very line that caused it** — "derive the floor from the
   object" is not the lesson; *measure the surface* is. Fixed by raycasting
   down for the highest depth-writing surface under the die.

**The assertion that now catches both** is `pickRingProbe()`, and it reports
CAUSES rather than counts: anything that paints over the felt and outranks the
marker, and any depth-writing surface standing above it at its own spot. Both
lists must be empty, and the scenario checks them **in a fae venue with a pick
made in that venue** — a pick made on the felt says nothing about the glade's
floor. Sabotage-verified in both directions.

`tools/steps/pick-look.mjs` renders the marker in both registers and on both
viewports and **fails** if either list is non-empty, so the look is
re-runnable and the claim is stated in the frame rather than in a count.


## M2, a throw becomes a turn — SHIPPED 2026-08-28 (no player gesture yet)

`6d6 t3` declares a turn: throw up to three times, keeping whichever dice you
choose between throws. `/api/rethrow` spends one throw; the server owns the
budget and the values.

**A turn is a plain pool**, and the refusal is deliberate. `adv/keep/reroll/!`
are within-throw mechanics that decide which dice count, and stacking them on
a procedure that re-throws a chosen subset asks questions this repo has no
answer to — does `4d6dl1 t3` drop the lowest of each throw or of the final
faces? Answering would be inventing a rule (goal 6). A modifier rides, because
it is arithmetic rather than a choice about dice.

**The whole turn rides one film.** `dice`, `values`, `perDie`, `keyframes` and
`chips` are index-aligned to the roll everywhere in this app, so a film of just
the thrown subset would misalign every result surface. The kept dice join the
cast as the static, already-frozen bodies they became when they last landed:
constant track, real collisions, and no downstream reader knows a re-throw
happened. Face correction needed no special case — a die that has not moved is
already showing its target, so the correction comes out identity.

**A re-throw is thrown, never poured**, even with a tower up: you do not post
dice back through the tower, you scoop the ones you are not keeping.

**Still open:** the player-facing gesture. M1's pick path is dark and nothing
wires pick → keep yet, so today a turn is driven from `__diceDebug.throwAgain`
or the API. That is the next slice, and it is where M1 gets switched on.


## M2b, pick becomes keep — SHIPPED 2026-08-28

**A turn is now playable by a person.** Click the dice you want to keep, press
**Throw N again** on the card, and the rest are thrown. Three throws, then the
verb retires.

**The arming rule is the whole design.** M1 shipped dark because a die that
highlights and then does nothing teaches the wrong thing. What gives a pick
meaning is a turn, so a die is pickable exactly while a turn of yours is open
with throws left — and nowhere else. That rule lives in ONE place
(`pickableDice`); the click handler does not test a flag at all, because when
nothing is pickable the raycast has no targets and the click is inert.

**Keeping nothing is a normal move.** Throwing all six again is most turns'
first decision, so the verb is live from the start and says "Throw 6 again".
The one refusal is keeping EVERY die — that is "I am done", not a throw, and
the server refuses it too (`nothing_thrown`), so the button must not offer an
act that would 400.

**The selection does not survive the throw.** It described *that* throw;
carrying it forward would silently keep dice nobody has looked at yet.

**Three things this cost, all the same shape.** The budget had to be threaded
through four separate explicit field lists — the SSE roll dispatch, the solo
roll, the reload replay, and `currentRoll` — and each one silently dropped it
until it was added. A whitelist is the right pattern here (it is what keeps a
plain roll's payload byte-identical), but it means a new field is invisible
until every list names it, and the symptom each time was a verb that simply
did not appear.

**And one that was a real bug:** the verb is painted by `updateCardActions`,
which the banner AND the verdict card both go through. Repainting only the
banner left the other one saying "Throw again" (disabled) with three dice
picked, and `document.querySelector` finds whichever is first. The repaint now
walks the same `mountedActionHolders` registry `repaintAwayVerbs` uses, and
one function decides what the verb says — so the mount, the repaint and a
selection change cannot drift.

**Still owed: the keyboard path.** M1 deliberately did not invent a binding
for an action that did nothing; the action exists now, so the binding is real
work with a real name to choose. `toggleDiePick` is input-agnostic and the
verb is a real `<button>` that already takes Enter, so what is missing is a
way to reach the DICE without a pointer. That is the next small thing, and it
is an *Always interruptible* obligation, not a nice-to-have.

## M3, and the game we are not naming — SHIPPED 2026-08-28

Two sets, both d6: **`symbols.monster`** (1 · 2 · 3 · energy · attack · heal)
and **`symbols.fate`** (two plus, two minus, two blank — which closes the first
half of ROADMAP §8, blocked on "needs dice.js custom face sets" since it was
written).

**Values stay 1–6 on the wire.** The server rolls a d6 and the FACE is a
reading of it, so nothing about the RNG, the physics, the log format or
redaction changes. A face set is a skin, and skins are already per-die (§9
mixed pools), so a pool can hold three symbol dice and three ordinary ones and
each chip answers for its own die.

**The symbols are drawn, not typed, and defined once.** A glyph like U+26A1
renders as a colour emoji in some font stacks, an outline in others, and
nothing in a few — and on a texture baked once at load, "nothing" is a blank
face nobody notices until a player says the dice are broken. So each symbol is
one SVG path used in both places it has to appear: filled into the die texture
with `Path2D`, and inlined into the readout chip. Two hand-kept copies drift;
a chip reading "5" beside a die showing a claw is the *results readable on
screen* invariant broken in the most confusing direction there is.

**THE HOUSE IS NAMED FOR THE MECHANIC, NOT FOR A GAME.** These are the faces a
monster-brawl push-your-luck game uses, and the obvious published example is
somebody's trademark. Shipping a set under that name would be borrowing their
brand to describe our dice. What this app provides is symbol dice; which game
you play with them is yours.

**Known and NOT fixed: a numeric interpretation system reads symbol faces.**
With the room set to *Your Soul Deal*, a monster die showing a claw is read as
"5 — Success", because the system reads the value under the face. That is not
wrong so much as meaningless, and the honest fix is the table setting the
system to **None**, which CUJ12 already makes a per-table choice. Making a
skin suppress the interpretation layer would be a cosmetic field silently
overriding the meaning layer, which is worse. The real answer is M4: a
procedure that knows what a face means is exactly what a procedure registry
is for.

## M5, the decision is the beat — SHIPPED 2026-08-28

**The question it answers, and it is the only one it answers:** *if I throw
these N again, what happens to THEM?* It appears on the card while a turn of
yours is open with throws left, it recounts the moment you keep or unkeep a
die, and it goes when the turn goes.

**THE KEPT DICE AND THE MODIFIER CANCEL,** which is what makes the read both
cheap and exact. A re-throw leaves the kept dice where they landed and adds the
same modifier either way, so `new total > old total ⟺ sum(fresh N) > sum(those
N now)` — the whole question collapses onto the subset in your hand, and
nothing here needs the turn's total, its budget or its meaning.

### It forecasts in the shape the table READS

This is the whole design, and it is goal 6's two layers meeting at the decision
point. "Improving" is not one thing:

| what is being thrown | the read | why |
| --- | --- | --- |
| number dice, at a table that reads TOTALS | `48% higher · 9% same · 43% lower`, plus `worth 12 now · 14.0 on average` | a total is a fact of play there; the three come exactly off `sumForecast` |
| number dice, at a table that reads PER DIE | for each word the system reads — `67% each  Fail · Partial Success · Success · Success & Bonus` | under a per-die profile *"a sum is not a fact of play"* (`js/meanings.js`): the ring folds and no total renders, so forecasting one would quote odds on a number the rest of the app refuses to show |
| SYMBOL dice (M3) | the same at-least-one read over the drawn faces | their values are 1–6 on the wire so a total is computable and meaningless — a claw is not greater than a bolt |

**"HIGHER", NEVER "BETTER".** The three numbers are a statement about the
total, which is a fact; whether a bigger total is a good thing is the player's
game. The invariant *the procedure never plays for you* is written into the
copy, and the e2e asserts the absence of the advisory words.

**The words are the SYSTEM'S, asked through its own `outcomesFor`** with a
synthetic one-part-per-value entry — not by reaching for `outcomeForDie`, which
is Soul Deal's chart, and Soul Deal is merely the only per-die system *today*.
Cached per (system, die type).

### What it refuses, in writing

A refusal with a reason beats a confident wrong number, so each one says why
and the surface prints the sentence rather than going blank:

- **`no-total`** — symbol faces. **This bites the FUDGE die too, for a subtler
  reason worth keeping:** plus really *is* better than minus, so "higher is
  better" looks safe there — but the raw values map 1,2 → minus · 3,4 → blank ·
  5,6 → plus, so a forecast on raw sums scores a 1→2 change as an improvement
  when the die did not move. Forecasting the Fudge *scale* instead would mean
  reading a face **as** a number, which is M4's job and not `js/odds.js`'s.
- **`no-sum`** — the table reads each die on its own.
- **`mixed-faces`** — symbol dice and number dice in one throw. Neither read
  covers both and choosing one silently drops the other half.
- **`no-values`** — a face-down turn. `canThrowAgain` already refuses there
  ("you cannot choose faces you cannot see"); this is the belt to that brace,
  because a sum over `null` prints a confident NaN.
- **`nothing-thrown`** — every die kept. The box says so instead of blanking,
  which is also the explanation for the disabled verb beside it.
- …**plus every `SUM_REFUSALS` code, passed through.** Unreachable today (a
  turn is a plain pool, so `sumForecast` is called with no mods and none of its
  three refusals can fire) and kept anyway, because that is a RULE rather than
  a construction. Recorded here so a later reader does not mistake an
  untestable line for an untested one.

### `showOdds` is the WRONG gate — considered and rejected

UX §2.1's `showOdds` is a field of an **experience record** (plain / check /
cinematic / user templates). It gates *"72% to clear 15"* on the intent card,
for a **declared target**, at the roll-moment beat, and ROADMAP §2l's two open
questions about it are questions about *that* surface. Three reasons:

- it defaults false and is per-experience, and `6d6 t3` carries no experience
  at all — so gating on it would hide the readout in exactly the case that
  motivated the feature;
- this is not a declared target and not a drama beat before a throw; it is the
  player's own decision, on their own open turn, about dice they can see;
- the scoping it would provide already exists and is tighter: the readout is
  `canThrowAgain`'s gate exactly — yours, open, throws left, face up — and
  there is no state to switch off. It costs two `div`s at mount and nothing per
  frame.

If a table ever wants to mute it, that is a room setting of its own; borrowing
an unbuilt field with different semantics is how two features come to share one
confusing switch. **`showOdds` stays unbuilt.**

### Three things only the frame could say

`tools/steps/decision-look.mjs` renders five states on two viewports and fails
if a card offers the readout with no geometry.

1. **The whole per-die branch exists because of a frame.** The first build
   forecast the total under every system, and the screenshot showed
   `55% higher · 9% same · 36% lower` sitting directly under a row of
   *Success / Partial Success / Fail* chips. Every test was green. It was not
   *false* — it was a forecast of a number that table does not read.
2. **Three SVG faces stacked down the left edge, outside the card.** A second
   `.chip-glyph` rule at equal specificity, later in the file, won `display`
   and made the glyphs full-width blocks. `turnOdds().cards[].glyphs` counted a
   cheerful 3 throughout — the same lesson M1's marker taught, one surface
   over. One rule now, with the story attached.
3. **The within-group separator vanished on a phone.** At `--muted` and 0.65
   opacity, *"Fail · Partial Success · Success"* read as one four-word phrase,
   which is the one thing that line must not do. Ivory at 0.5 with its own
   margin.

And one copy fix that is an honesty fix: a group is N labels that *share* one
chance, so a bare `52%` after six faces invites "52% for at least one of these
six" — false, and badly so, since for a fair set that union is 100%. The word
is **`52% each`**.

### Found while building it, NOT fixed — a ceremony turn auto-collects

**A turn declared with a moment (`6d6 t3 check`) is collected out from under
the player after 7 s with throws left.** `armCeremonyRetire`'s
`CEREMONY_DISMISS_MS` clock calls `retireCeremonyFlow`, which calls
`requestCollectRoll` for any of your own face-up rolls without asking whether a
turn is still open. That is **GOALS goal 5 rider ④** — *"nothing may reclaim,
collect or tidy a turn's zone until the turn ends"* — violated by the second
clock in the app, while the M2 risk list only ever named auto-collect's.
Measured: `throws {max:3,used:1}` at +3 s, the roll gone at +9 s. It lives in
the ceremony retire path rather than anywhere M5 owns, so it is recorded here
rather than patched in passing. **It is M2's bug and it is owed a fix.**

A second, milder thing the same probe turned up: a retired card holder keeps
its last paint — a stale `Throw again` and now a stale readout — until
something repaints it. Nobody can see it (the card itself is `display: none`)
and the readout deliberately matches the verb beside it rather than
self-cleaning, because one of the two going quiet while the other lies would be
worse. The consequence is for TESTS: `document.querySelector` finds the verdict
card first, so any DOM read of these surfaces must be scoped to the roll it
means. `turnOdds()` reports each card's `rollId` for exactly that reason, and
the scenario's ⑧ pins it.

## The questions, and the answers — 2026-08-27

**Q1 and Q4 were put to Joe and answered the day this was written, along with
the sequencing call under "What this displaces". Q2 was answered on 2026-08-28
and Q3 is still open**, blocking nothing. The recommendations are kept below as written, so a later reader can
see what was recommended and what was chosen.

**Q1. How far does the app go?** — **ANSWERED: through M3, decide M4 later.** Recommendation: **through M3 under today's
goals, and decide M4 when M2 has been played with.** M2+M3 make King of Tokyo
work with the human doing the thinking, which is what a physical table does
anyway. M4 is the first thing that requires the app to know what a face
*means*, and that judgement is much easier to make with a working turn on the
felt than in the abstract.

**Q2. Does visibility belong to a turn or a throw? — ANSWERED 2026-08-28: the
TURN.** Joe took the recommendation. So a held turn is revealed once, at the
end; a secret turn is secret throughout; and there is no such thing as a turn
whose audience sees throw two but not throw one. M2 is no longer gated. Recommendation: the
turn. Simplest, safe, matches the secrecy ladder we have.

**Q3. Do symbol dice get real art, or placeholder glyphs first?** — **STILL OPEN**, and it does not block M1 or M2. The forge
and the dice-art work say this project's bar is high; the counter-argument is
that Fudge dice are three flat glyphs and shipping them plainly proves the
whole registry in a fraction of the time. Recommendation: plain glyphs to
prove M3, art as a separate owner-track round.

**Q4. Is "the best possible dice simulator" the goal statement you want?** — **ANSWERED: yes**, and it shipped as GOALS goal 16.
It is not in GOALS.md today in those words, and if it is the real ambition
then goal 16's family table is the version of it that can be checked. Worth
saying out loud, because it reprioritises: it makes coverage a first-class
goal alongside immersion, and this project has spent most of 2026-08 on
immersion.
