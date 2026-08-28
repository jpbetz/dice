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

**Status: PROPOSAL, written 2026-08-27 at Joe's ask. Nothing here is
authority yet.** [GOALS.md](GOALS.md) still wins every tie and none of its
lines have moved. This file argues that a few of them should, states the
replacement text so the decision is a yes/no rather than an essay, and
sequences the work that follows. The open questions are at the bottom.

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

The project has never had a definition of "best" that anything could be
measured against, which is why the answer to "are we there yet" has to be a
feeling. Proposed: **the coverage target is the families of dice mechanic**,
written down, with an honest status column. That turns the question into a
checklist and makes a gap visible before somebody plays into it.

| family | example | today |
| --- | --- | --- |
| single-throw resolution vs a target | `d20+5 dc15` | shipped |
| pools with attributed modifiers | `2d8[Wisdom]+3` | shipped |
| keep/drop inside one throw | `4d6dl1` | shipped |
| advantage / disadvantage pairs | `2d20kh1` | shipped |
| exploding, chained | `d6!` | shipped (chain cap 3) |
| per-die reading, no sum | *Your Soul Deal* | shipped |
| rule-driven rerolls | `4d6r<2` | shipped |
| secrecy ladder | held / secret / whisper | shipped |
| **success counting** | pool vs a threshold, count hits | **not shipped** (§8) |
| **symbol faces** | Fudge, King of Tokyo, Zombie Dice | **not shipped** (§8 names it) |
| **roll-and-lock across throws** | Yahtzee, King of Tokyo | **not shipped — no primitive** |
| **push-your-luck** | Farkle, Zombie Dice, Pig | **not shipped — no primitive** |
| **dice drawn from a bag** | Zombie Dice | **not shipped** |
| **opposed rolls** | two players, one comparison | **not shipped** — every roll is read alone; nothing on any surface compares two |
| initiative order | §7 | not shipped, already on the roadmap |

Five of those are one campaign. The three at the top of the "not shipped"
block are the campaign this file proposes.

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
| **M1** | **Touch a die.** A pointer→die path: raycast against `tableDice`, a selection model, touch-first (hover does not exist there), a keyboard equivalent, and a debug hook so scenarios can select without scraping. | med | no | everything below; also V5's felt echo and §7.1 physical pool building, both stalled on exactly this |
| **M2** | **The throw becomes a turn.** `throws:N` + free keep, end to end: `composeThrow` beside `composeRoll`, an entry that carries N throws, a film per throw baked over the kept dice as static bodies, the `t3` flag in the notation, the verdict and log reading a turn rather than a roll. | large | no | Yahtzee, King of Tokyo, Farkle, Can't Stop, Pig — with the human judging the bust |
| **M3** | **Faces that are not numbers.** A face-set registry behind the existing `glyph` seam, symbol dice (Fudge first — three faces, no ambiguity), the chips and the log learning glyphs, `odds.js` refusing non-numeric sums honestly rather than summing nonsense. | med | no | King of Tokyo's actual dice, Fudge, Zombie Dice, and ROADMAP §8, which has been blocked on this line since it was written |
| **M4** | **Procedures as a registry.** `PROCEDURES` beside `SYSTEMS`: throws, keep rule, bust rule, tally, bank verb. Farkle and Zombie Dice become assisted rather than merely possible. | med–large | **yes — this is the goal 6 decision** | automatic bust, running tally, the bank verb |
| **M5** | **The decision as a beat.** Ceremony at the choice point: the tally at stake, the live bust odds, the moment. `js/odds.js` already forecasts; UX §2.1's `showOdds` exists and is deliberately unbuilt, and push-your-luck is the case that makes odds obviously worth showing rather than a crutch. | med | no (rides ⑤) | the reason to use this instead of physical dice |
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

Honest sequencing: **M1 and M3 are cheap enough to interleave with Track B**
and both close items already on the roadmap (V5's substrate, §8). **M2 is the
large bet and it competes directly with T15** — three baked skins versus the
mechanic Joe says the product is bad at. Recommendation: M1 now, then M2,
and let T15 wait, because a re-baked skin makes the existing thing prettier
while M2 makes the product cover a family it cannot play at all today.

## Open questions — these are Joe's

**Q1. How far does the app go?** Recommendation: **through M3 under today's
goals, and decide M4 when M2 has been played with.** M2+M3 make King of Tokyo
work with the human doing the thinking, which is what a physical table does
anyway. M4 is the first thing that requires the app to know what a face
*means*, and that judgement is much easier to make with a working turn on the
felt than in the abstract.

**Q2. Does visibility belong to a turn or a throw?** Recommendation: the
turn. Simplest, safe, matches the secrecy ladder we have.

**Q3. Do symbol dice get real art, or placeholder glyphs first?** The forge
and the dice-art work say this project's bar is high; the counter-argument is
that Fudge dice are three flat glyphs and shipping them plainly proves the
whole registry in a fraction of the time. Recommendation: plain glyphs to
prove M3, art as a separate owner-track round.

**Q4. Is "the best possible dice simulator" the goal statement you want?**
It is not in GOALS.md today in those words, and if it is the real ambition
then goal 16's family table is the version of it that can be checked. Worth
saying out loud, because it reprioritises: it makes coverage a first-class
goal alongside immersion, and this project has spent most of 2026-08 on
immersion.
