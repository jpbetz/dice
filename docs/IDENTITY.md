# IDENTITY.md — what a "who" is at this table (2026-08-17, §8 added 2026-08-18, decision 7 added 2026-08-31)

> **Guidance, not law (2026-09-02).** Every rule, law, ruling, invariant, gate
> and budget in this file is a dated lesson somebody paid for, with its reason
> beside it. Read it before building near it; a design may set any of it aside
> by saying, in the commit, which rule it set aside and why. The eight things
> that may NOT be set aside are in [GOALPOST.md](GOALPOST.md) — where this file
> and that one disagree, this file is history.


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

**And it shipped with a five-second window, which was the next defect** — the
condition above is about a seat the roster still holds, and that is
`DISCONNECT_GRACE_MS`. [§8](#8-rung-1s-window-was-the-next-defect--shipped-2026-08-18)
is the pass that separated what the roster shows from what the server
remembers; read it before touching either.

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
7. **A body at the table needs its own two words, because `seat` and
   `chair` are already spoken for.** *(2026-08-31, with the design behind
   [ROADMAP](ROADMAP.md) THE ORDER #14, "A place at the table". Recorded
   here rather than in the feature's own doc because §1's whole point is
   that three objects already wear the word "who" and a fourth arriving
   quietly is how they got confused in the first place.)*

   - **`place`** — the STATION at the table: an integer 0–7, assigned by
     the server, sticky for as long as the player is there and for the
     60 s of the vacated stub after they go. Code: `place`, `PLACE_MAX`,
     `freePlace`, `keepPlace`, `placeOrbit`, `placeAnchor(id)`.
   - **`placard`** — the OBJECT standing there, the folded name card that
     the station is read from. Code: `js/placard.js`, `PLACARD_*`.
   - **`seat` is untouched** — it is still the `playerId`, still the sole
     credential, decision 3 above. **`chair` is untouched** — it is still
     the dashed unclaimed-seat pill in the presence row (UX §7.20). A
     place is not a seat you take; it is where the seat you already hold
     is standing.

   **What `place` may and may not do.** It is display state and it is
   allowed to be wrong for a frame: nothing downstream of a pixel reads
   it. So — **it is never read off a request body** (the server assigns
   it and only the server assigns it), it is **never in
   `GET /api/table`** (the one unauthenticated read keeps its written-out
   budget), it is **not in the portable YAML** and **not in the URL**
   (goal 7: the URL addresses a table and carries no user state). It
   authorizes nothing and gates nothing (goal 10). **It owns its region of
   the felt for landing, and nothing else** *(amended 2026-09-01 by Joe's
   word — "there is not enough room for two people to roll the dice at the
   same time"; the risk clause at [IMMERSION](IMMERSION.md) item 16 carries
   the quote and the one clause it amends)*: a placed roll is thrown into
   its chair's region, and the felt holds one roll PER PLACE — a placed
   arrival puts away only its roller's own priors and any placeless roll,
   never another chair's. Still not a claim: nothing refuses a die for
   where it stops.

   **§5's five must-nots govern `who`, not this.** `place` is displayed
   and it does ride broadcasts — that is the entire point of it. What it
   shares with `who` is only the last must-not: it is never persisted
   beyond the room's own life, because rooms die whole.

   **The two clocks of §8, one each.** The **placard** answers the
   ROSTER clock (`DISCONNECT_GRACE_MS`, 5 s): it vanishes when the player
   does, because presence is asserted, never inferred. Their dice and
   their log rows keep their names on the HISTORY clock and do not
   vanish. The **place** answers the MEMORY clock (`RESUME_TTL_MS`,
   60 s): the vacated stub holds the station, so a reload lands you back
   where you were sitting rather than at the next free station.

   **What is NOT identity, and must never be filed here.** The film's
   inputs — `roll.entry` (which edge a throw comes in over) and
   `roll.lane` — are stamped onto the ROLL by the server and ride the
   roll payload in the seed's determinism class. They are not roster
   state, they are not a "who", and the film never reads the roster to
   get them. If a later pass finds itself adding a position field beside
   `playerId` to make the dice come from the right side, it has taken the
   wrong turn: the turn was taken here, on purpose.

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
  reload or a crashed tab a non-event rather than a lost reveal. *(As shipped
  on 2026-08-17 that held for five seconds, which is shorter than this app's
  own boot — §8 is the pass that made this sentence true.)*
- **A GONE browser does not.** Clearing storage, a new device, a new profile:
  the stake is unrevealable and anyone at the table may sweep it. Not a bug.
  **Anything that reports this as a defect should be closed with this
  paragraph**, which is why it is written in the doc rather than a commit.
- What this buys: no durable credential anywhere, and nothing at the server's
  front door that can be told "no" because of who asked — the property that
  keeps this off [§4](#4-b1s-server-half-is-killed-and-the-defect-has-a-name)'s
  killed ground.

## 8. Rung 1's WINDOW was the next defect — SHIPPED 2026-08-18

*UX §7.57. §7 above says "a LAPSED seat comes back". It did — for five
seconds, which is less than one boot of this app. This section is that
sentence made true.*

**The measurement, because the diagnosis is the whole of this record.**
`resumableSeatFor` only answers for a seat with `clients.size === 0` — one
the ROSTER still holds — and a closed stream arms `scheduleReap(...,
DISCONNECT_GRACE_MS)`, which is 5 000 ms. A returning tab was landing its
`/api/join` **4.2–5.4 s** after the old tab's socket closed. Measured three
reloads at a time, on an idle machine, with a warm cache: the document
answers in 15 ms and every module is loaded by 200 ms, but
`DOMContentLoaded` and `/api/join` land in the *same millisecond* at
4197 / 5278 / 5442 ms. It was never the network. `initNet()` is the last
line of main.js's module body, so the join waited behind the whole scene
build. Against a 5 s grace that is a coin toss, and `seat-resume` — the
scenario asserting rung 1's own promise — failed **four runs in six**.

**Why the naive fix is wrong.** Lengthening the grace makes every test of
this pass and puts an abandoned pill back on everyone's roster: the
production ghost bug (four seats, one real window, `/api/events` latencies
of exactly 3601 s) whose fix cost the whole heartbeat/pong liveness
protocol. So the fix is to stop one clock answering two questions:

| | Clock | Question | Sized for |
| --- | --- | --- | --- |
| **Roster** | `DISCONNECT_GRACE_MS` = 5 s, **untouched** | what is SHOWN | a gone browser stops being drawn in seconds |
| **Memory** | `RESUME_TTL_MS` = 60 s, new | what is REMEMBERED | a cold boot, a crashed tab, a closed lid |

**The stub (`room.vacated`).** `removePlayer` writes one on the DISCONNECT
reap: `{id, who, color, at}` — ~200 bytes, keyed by playerId, capped at
`MAX_VACATED_PER_ROOM` = 8 per room with the oldest evicted, expired
entries pruned on write. Deliberately NOT the pools or library: the
returning client re-publishes those on its first hello anyway, and a stub
that carried them would make the memory bound argument depend on caps that
live elsewhere. There is no timer — expiry is checked on read — so nothing
here can hold the event loop open or leak a handle. Rooms still die whole
(goal 7); a lingering §G6 room keeps its stubs and they expire on their own
clock, because the player who trips that path is the organizer reloading
alone in a prepared room.

**What it is NOT allowed to be, and how each is held:**

- **Never a way to see a player who is not there.** `room.vacated` is not
  `room.players`; `publicPlayers` walks the latter and every payload goes
  through it. Asserted by grepping a bystander's bytes for the vacated id
  *and* the key (tests/identity.test.mjs).
- **Never a live seat.** A stub exists only for a player `removePlayer` has
  already deleted, it is CONSUMED on return, and the lookup re-checks
  `room.players` anyway.
- **Never a refusal at the door.** A miss falls through to an ordinary
  join, exactly as rung 1's does. §4's killed ground stays killed.
- **Never the gesture.** `removePlayer(..., 'left')` — 'Leave & switch
  seat' — buries nothing, and a seat that never streamed is an arrival that
  gave up, not a lapse (`everStreamed`, same bit as rung 1's).
- **Never rung 2.** Sixty seconds is the accident, not "come back
  tomorrow". §7's paragraph still answers anything that asks for more, and
  a browser past the window still holds no authority over the stake it
  left — asserted, with the 403.

**The client half, which is not the same fix.** The server no longer LOSES
the race, but the roster blink was still real, so `js/net.js` gained
`prejoinSeat` — the *door knock*: for a tab that already holds a seat in
this room (a reload, the one join the server answers silently), the join
POST is fired from the top of main.js's module body instead of the bottom.
Measured: **~300 ms**, not ~4700. It is gated to that case on purpose — a
knock for a browser with no seat would mint a pill before the app that owns
it exists and hold it for the 60 s join grace if the boot died, which is a
ghost. The lobby and `&as=` (which can end at a modal the player dismisses)
do not knock.

**The two claims, and where each fails if it stops being true:** the seat
returns (`seat-revive` e2e + nine protocol checks, five written red) and the
roster still lets a gone browser go on the old schedule — an upper BOUND,
run against the real five seconds in `tests/identity.test.mjs` and again in
the browser in `seat-revive`. That second one is the assertion that fails
the day somebody "fixes" a flake by lengthening the grace.
