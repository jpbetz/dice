# The goal post

*The eight things this project actually cares about. Everything else in
`docs/` is guidance — a recorded lesson with a date and a reason — and a
design may override guidance by saying why. Nothing below is a mechanism;
each names a promise a player or the owner would notice broken.*

*Written 2026-09-02 from Joe's brief ("you've become over constrained …
reduce it down to 5–10 items we actually care about"), after an inventory of
487 stated rules across the docs and an adversarial pass over the candidates.
Where this file and any other document disagree, this file wins, and the
other document is wrong or stale.*

## What this is

A virtual dice table: real 3D dice with real physics on a shared felt,
dramatised — stakes declared, reveals accentuated — and a static page is a
working solo table. Joe's ambition is "the best possible virtual dice rolling
simulator." When real players used it, the thing they named was **the read**:
dice they could read, results they could trust.

## The eight

1. **The read is the product.** Results are readable on screen, the
   arithmetic is attributed, and which dice counted is always visible. No
   squinting at 3D faces. Depth goes here before anywhere else.

2. **Honest, shared values.** Values are server-authored and never rigged,
   smoothed or engineered toward a near-miss; nothing spoils a result before
   its reveal (no outcome-aware framing, sound or light); every player sees
   the same values and the same log, and the server re-parses the notation
   rather than trusting a client's terms. *Today this is kept by "one seed,
   one film" and a keyframe-hash check — a technique, replaceable by any
   other that keeps the promise.*

3. **Privacy is a per-roll choice, and it fails closed.** No roles and no
   access control, ever — the room key is the only gate. A hidden value
   leaves the server through exactly one redaction path; a value hidden only
   by CSS is not hidden; no log line, health surface or crash report carries
   a key, a name or a value.

4. **Nothing takes what you keep.** Saved pools and profiles are captured on
   purpose and restored the same way; an import previews and merges, never
   replaces; nothing durable rides the URL. The server holds no durable
   state, and every room lives in one process.

5. **No toil, and the table never stops.** The system picks up, sums,
   attributes and tidies finished rolls — never a turn still in progress.
   Building dice by hand is delight, never a step. Anyone can roll at any
   time; nothing modal ever locks the shared table.

6. **Dice and their procedures, not game rules.** The app is literate in how
   dice are read and how turns are structured; game state stays outside,
   permanently, and a procedure never chooses for the player.

7. **A dramatised table you can always leave.** Where drama and realism
   conflict, drama wins — and every beat is escapable to its complete result.
   The deciding die is never out of frame. Framing and pacing may differ per
   viewer; what the dice did may not.

8. **Measure the moment a player actually has.** Before trusting a green
   check, look at the thing the owner named, on the device they named. A
   scripted check is the floor, not the proof; a golden pins the current
   answer, not the right one.

## Everything else is guidance

The docs hold several hundred rules — camera rulings, composition rules,
draw and triangle budgets, the tower's portal contract, audio's refusals,
CSS token ladders, test process, word rules, dead-end ledgers. From today
each of them is **guidance**: a lesson somebody paid for, with a date and a
reason, worth reading before you build near it. None of them is law.

- A design may override guidance by saying, in the commit, which rule it set
  aside and why. It may not override the eight above.
- A budget is a measurement from a real frame: re-measure before you move
  it, and say what you measured.
- A golden or a "byte-identical" gate is a change detector. If it blocks a
  better design, re-record it and say why.
- A ruling is about the thing it ruled on. When that thing changes, the
  ruling is history, not a veto.
- A dead-end ledger ("refused, do not re-litigate") is there so you do not
  repeat the argument by accident. Repeating it on purpose, with new
  evidence, is allowed.

## Before you design: challenge the assumptions

What actually went wrong here, and the habit that would have caught it:

1. **Name the assumption you inherited, in one line, before building on
   it.** The mat stayed rectangular through three passes after a round table
   had been asked for.
2. **Ask who wanted each existing part.** Walls, wedges and hull caps
   survived because nobody asked; a "no die may land in your region" clause
   was law until the owner said otherwise.
3. **Separate the goal from its mechanism, and be willing to kill the
   mechanism.** Mat inscriptions shipped broken at every zoom for the life of
   the feature because the decal was defended instead of the beat.
4. **When a request has two readings that lead to different builds, ask the
   owner in one line, or show a five-minute sketch — before any large run.**
5. **A green check is the dominant failure mode.** Prove with numbers, then
   look; an unarmed gate reads exactly like a passing one.
6. **When a measurement contradicts your eye, doubt the measurement's
   model.**
7. **Don't quote a doc from memory, and don't trust a rule because it is
   old.** Read the line; check the date; ask if the thing it protected still
   exists.
8. **Backward compatibility is an assumption too.** There is no production
   use; "hard drop it" has been the owner's answer every time.
9. **Simplify until it embarrasses you, then stop.** "Why do you need a
   wall?" The answer was: you don't.
10. **Write down what you are not covering** — the open mechanic families
    were found by writing a table, not by playing.
