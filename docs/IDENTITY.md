# IDENTITY.md — what a "who" is at this table (2026-08-17)

*THE ORDER #9. The structural-bet entry said "schedule the later pass before
the next feature that needs a stable who; B1 is that feature and it has
already arrived." This record is that pass. Its two results: **B1's server
half is killed with a named defect** (§4 — identity cannot unlock it, and
goal 10 forbids what it asks for), and the pass that survives is one small,
invisible key whose only job is to let a seat outlive its tab (§5). Every
claim below was re-verified against the tree on 2026-08-17; file:line refs
are from that reading.*

## 1. Three objects wear the word, and they are different things

| | **The name** (`dice.name.v1`) | **The seat** (`playerId`) | **The library** (`dice.profiles.v1`) |
| --- | --- | --- | --- |
| What it names | How tables **address** you | Presence at ONE table from ONE tab | **Characters** — fiction, not persons |
| What it authorizes | **Nothing.** The server never authorizes by name; whispers *resolve* names against the roster and duplicates all join (documented, server.js `resolveVisibility`) | **Everything.** "The id IS the credential: every mutating POST already carries it alone" (server.js handleJoin's RESUME comment). Reveal authority, Done, mine-scope clear, offer targeting, whisper membership | Nothing on the wire — published racks are display copies (`publishPools`) |
| Minted | Typed at the door; adopted from the server's `cleanName` echo | `crypto.randomUUID()` **per join** (server.js handleJoin) | Dealt at boot (`js/seed.js`) |
| Survives tab close | yes (localStorage) | **no** (sessionStorage `dice.seat.v1:<room>`, per tab BY DESIGN — "a SECOND tab is genuinely a second player", js/net.js) | yes |
| Survives room change | yes — this is what made L4 "identity walks into a breakout for free" TRUE | no (per room) | yes |
| Second browser, same machine | fresh | fresh | fresh |
| Two people, one browser profile | shared | separate seats (per tab) | shared |

## 2. Load-bearing by design vs by accident

**By design:**
- **The seat as sole credential.** Stated in so many words at the resume path,
  and the tab scoping is argued (shared screens; the e2e harness seats several
  tables against one origin).
- **The name as address, never credential.** Duplicate names are legal and
  documented; `#` is banned at every entry point so the address survives the
  notation round trip. Nothing may ever *authorize* by name.

**By accident:**
- **The name as routing gate.** `initNet` reads the origin-global key as "has
  this person been here before" and gates the door on it. That is U3's whole
  bill (`&as=` did nothing for returning players), paid 2026-08-08 by making
  the link outrank the name — the gate itself remains, and C26's withheld verb
  is the same accident from the other side: *deleting* the name to force the
  door open, amnesia as navigation.
- **Authority on a tab's lifetime.** Goal 11 hangs a held roll's reveal on a
  PERSON ("revealable by whoever chose it"); the implementation hangs it on a
  playerId whose life is shorter than the roll's. See §3.

## 3. The bill, itemized (each verified in the tree this pass)

1. **A held roll's reveal dies with the tab.** Hold a roll, close the tab,
   come back: the rejoin mints a new playerId, `handleReveal` compares
   `revealAuthority` strictly (server.js:2080), and nobody can ever reveal
   it. After the old seat reaps, U19 lets *anyone* sweep it
   (server.js:2163's departed-roller admission) — so an orphaned stake can
   be cleared unread but never read. Goal 11's wound, not a cosmetic one.
2. **Your own secret rolls vanish from your own log.** Online, the server
   owns the log (js/main.js:20021); the rejoin snapshot is projected for the
   NEW playerId, and `projectEntryFor` omits secret entries for anyone but
   their roller. Same tab-close, same cause.
3. **Done/collect continuity** — same shape, smaller stakes (roller-only
   checks at server.js:2118, 2149).
4. **Two people on one browser profile share name and library.** RULED, not
   fixed: **one browser profile ≈ one person's dice bag.** The OS's profile
   switcher is the account layer this app refuses to rebuild (PROFILES §6).
   Leaving your bag on the family computer is a physical-table problem too.

**And what the same bet PAID, so the ledger is honest:** L4 sub-tables got
"identity walks into a breakout for free" *because* name and library are
origin-global; solo→online is one continuity; and the door has zero account
friction, which PROFILES §6 defends at length. The bet is not a mistake —
it is a bet with a bill, and the bill is items 1–3.

## 4. B1's server half is KILLED, and the defect has a name

> **B1 asked the server to refuse an entitlement that does not exist, for a
> threat the client-side gate already ends, in violation of the one law the
> channel was built under.**

Three parts, any one fatal:

1. **There is no unentitled class to refuse.** Enrolment is `?stability=beta`
   — an open, guessable keyword, by design (js/stability.js). Any client that
   can name a beta tower id can enrol itself first. A server-side check would
   enforce "has typed the keyword," which is the client gate with a refusal
   bolted on. Durable identity does not change this: the claim stays
   self-issued whoever carries it. Making it real means minted invitation
   secrets plus an administered allowlist — accounts and an admin surface,
   the exact cost list PROFILES §6 deferred, now with nobody even asking.
2. **Goal 10 forbids the end state.** "There is no access control and there
   never will be." A settings write refused by *who asks* is access control —
   the first per-seat capability asymmetry in the app, a role wearing a
   validator.
3. **The one law already answers it.** "THE CHANNEL GATES THE OFFER, NEVER
   THE CAPABILITY" (js/stability.js, load-bearing for goal 15's one-seed-one-
   film). A server refusal IS a capability gate. The same file states the
   conclusion: "the server does not know about channels and does not need
   to."

The gate as shipped is **complete for its stated threat** — production
players meeting staging *by accident* (stability.js:20-22). A player who
deliberately POSTs a beta tower id has deliberately opted into beta content,
which open enrolment already permits. There is no remaining attacker.

**Consequence:** the identity pass stops being scheduled against B1. What
B1's text got right — "calling it a security boundary would be the lie" —
becomes the permanent ruling instead of a waiting room.

## 5. The design that survives: `dice.who.v1` — authority outlives the tab

One key, one job. Minted once per browser (`crypto.randomUUID()`,
localStorage), an opaque bearer string, **never displayed, never broadcast**.
It rides exactly one place: the `/api/join` request body, beside the seat it
may resume. Trust parity with `playerId`, which already rides the SSE URL —
`who` is the same class of credential with a longer life, which is exactly
why it must never appear in any snapshot, broadcast, or projection
(redaction is absent data; a credential in a roster payload is a leak with a
schema).

**Rung 1 — SHIPPED 2026-08-17** (UX §7.52, ROADMAP B4). What landed matched
this section, with **one condition added that this design did not have**, and it
is worth recording because it is a race the design's single test would have
missed: `clients.size === 0` alone cannot tell a LAPSED seat from an ARRIVING
one. A seat between its join and its EventSource attaching has zero clients too
— so a browser session-restoring five tabs of one room would have landed two of
them on one seat, with two tabs then driving one playerId. The server tracks
`everStreamed` (set in `handleEvents`, never cleared) and requires it: *was
anybody ever sitting here* and *is anybody sitting here now* are two questions.

Everything else held as written: the same `playerId` comes back,
`projectEntryFor` is untouched, no signature changed, and refusal is a fresh
seat rather than an error. Two additions beyond the design's text, both small:
`who` is re-bound on the seatId resume too (a browser that minted its key after
taking the seat would otherwise hold a seat no key points at), and the resume
log line carries `by=seat|who` — one path, but which door opened is not
inferable from anything else in the log. Proved in `tests/identity.test.mjs`
(11 checks; three were written red and are quoted in ROADMAP B4).

*The design as written, kept below for the record:*

**Rung 1 — the first commit (fixes §3 items 1–3 for the common case).**
`handleJoin`, after the existing seatId RESUME branch: a join carrying `who`
that matches a seat with **zero live clients** resumes that seat — same
playerId, same color, same rolls, exactly the code path the seatId resume
already runs. Because the playerId survives, *every* authority check and the
secret-log projection are healed with **no signature changes and no new
checks**: reveal, Done, collect, mine-clear, `projectEntryFor` all just
work. Client side: mint/read the key (~6 lines), add it to both join bodies
(js/net.js `connect` and `rejoin`).

- **A live seat is never stolen.** `clients.size > 0` ⇒ mint fresh. The
  second tab of a shared screen stays a second player (the net.js design
  holds); who-resume exists only for the seat nobody is on.
- Store `who` on the player at join/resume; never emit it (roomSnapshot's
  player projection gains nothing).
- `leaveTable()` / `Leave & switch seat` semantics unchanged: an *immediate*
  leave deletes the seat, so there is nothing for who to resume — leaving on
  purpose still means leaving.
- Window: a lapsed seat lives ~74 s (liveness sweep) plus grace. Rung 1
  heals the accidental close-and-return, which is the common accident.
- Purge: `dice.who.v1` qualifies for `PURGE_KEEPS` by that list's own two
  arguments (no shape an old build could corrupt; loss is silent) — add it
  when the key ships, with this sentence.
- C22: no stamp. It is an opaque single value, not a shaped blob; stamping
  it would invent a schema for a string. Recorded so nobody adds one.

**Rung 2 — named, not scheduled.** Covering return *after* the reap (as long
as the room lives) means stamping `who` on entries at birth and
`revealAuthorityWho` on visibility, widening four authority sites, and
projecting secrets by viewer-who — which changes `projectEntryFor`'s
exported, redaction-suite-pinned signature. Real cost, real benefit, and it
only matters for "come back tomorrow to a table still playing." Do not build
it until the felt asks; the question that decides it is §7's.

**The five must-nots** (each one is a design boundary, not a style note):
never displayed · never in any broadcast, snapshot, or projection · never an
entitlement hook (§4 is dead and stays dead) · never resumes a seat with
live clients · never persisted server-side beyond the room's own life
(goal 7: rooms die whole).

## 6. Decisions (numbered so they are not re-litigated)

1. **The app has no person object, and that is a ruling, not a gap.** One
   browser profile ≈ one dice bag. The OS profile layer is the account
   layer.
2. **The name is an address.** It may route (the door) and label (the
   roster, whispers); it must never authorize. Duplicates stay legal.
3. **The seat is the credential; `who` exists only so a seat can survive
   its tab.** No other power accretes to it.
4. **B1's server enforcement is killed** (§4). The discoverability gate is
   the whole feature.
5. **`who` never leaves the server's front door** — request bodies in,
   nothing out.
6. **Google sign-in stays deferred**; PROFILES §6 is unamended by this
   pass.

## 7. The question, and Joe's answer: **rung 2 is CLOSED**

*Asked and answered 2026-08-17.* A held roll whose chooser's browser is gone
for good can only be swept unread. Is that the intended price of goal 11, or
should rung 2 make "come back tomorrow and reveal it" work for as long as the
room lives?

**Joe: sweeping unread is the intended price.** Goal 11 keeps its narrow
promise — *a secret roll belongs to the moment it was made in*. A stake that
outlives its keeper is a different feature wearing the same words, and it would
need a browser key with a longer life than a seat to carry it.

So the ladder stops at rung 1, deliberately, and the shape of what remains is
worth stating so nobody re-opens it by accident:

- **A LAPSED seat comes back** — same `playerId`, same authority, while the
  room lives. That is rung 1, shipped, and it is what makes an accidental
  reload or a crashed tab a non-event rather than a lost reveal.
- **A GONE browser does not.** Clearing storage, a new device, a new profile:
  the stake is unrevealable and anyone at the table may sweep it. Not a bug.
  **Anything that reports this as a defect should be closed with this
  paragraph**, which is why it is written in the doc rather than a commit.
- What this buys: no durable credential anywhere, and nothing at the server's
  front door that can be told "no" because of who asked — the property that
  keeps this off [§4](#4-b1s-server-half-is-killed-and-the-defect-has-a-name)'s
  killed ground.
