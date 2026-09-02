/*
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
*/

// THE CAST — a dev instrument for looking at a full table in ONE TAB
// (BRIEF-V4, Joe 2026-09-01: "a demo mode where you can have a dial to
// control player count (random names) and some extra lines on the table to
// show the various regions dividing up the table that are hidden in normal
// play").
//
// It is DEV TOOLING, not player chrome. Nothing here is offered to anybody
// who did not open developer mode, nothing here is on the wire, and nothing
// here changes a film that is not this tab's own.
//
// ── THE DOOR IS DEVELOPER MODE (docs/DEVMODE.md, 2026-09-02) ───────────────
// The backtick key on any table, or `__diceDebug.devOpen()`, and the cast is
// a section of that panel. `?demo=1` was the first door and is GONE (Joe,
// DEVMODE revision 3: "I don't need ?demo=1 once this is implemented"): the
// URL carries no dev state at all, the room-mint suppression went with it,
// and a dev tab is an ordinary tab — at a real table of one, with a real
// place the server handed out — that has dealt a cast AROUND itself.
//
// ── A TABLE OF ONE, AND WHY THAT IS A LAW RATHER THAN A PREFERENCE ────────
// The cast stands FAKE PLAYERS in the roster the placards read and its
// throws are stamped locally with the seat the server would have stamped.
// Both are lawful in exactly one situation: THERE IS NO SECOND VIEWER. A
// table of one has no other client to disagree with, so a locally-stamped
// film is not a fork of anybody's film — it is the only film. Put the same
// code at a real table of two and it would be a client inventing roster rows
// and film inputs, which is goal 15 broken at the source. So the FILM LOCK
// (js/main.js devFilmSync): when a second real seat appears in the roster
// the cast is dealt to zero and stays refused until the seat leaves.
//
// ── ZERO-DEP AND PURE ──────────────────────────────────────────────────────
// No DOM, no three.js, no cannon — the same discipline js/places.js keeps, so
// the decisions with rules in them (who sits where, what a throw sweeps) are
// unit-testable without a browser. The scene overlay and the roll path live
// in js/main.js behind `devOn()`.

// How many players a table holds — 8 is PLACE_MAX, a full house — and so how
// far the cast dial can reach when the viewer's own chair is not counted. 0
// is a legal setting (an empty table is a picture too, and it is the one
// that proves the door adds no cards of its own).
export const DEMO_MAX = 8;

import { seatValid } from './places.js';

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

// THE NAMES ARE A TEST FIXTURE WEARING A COSTUME. They are chosen for what
// they do to the CARD, not for flavour: the fitter measures a name down from
// 160 px to a 108 px floor and then truncates it with a visible ellipsis
// (js/placard.js), and a list of five-letter names would prove none of that
// ever runs. So the list carries a two-letter name, a 23-character one (the
// longest a real roster can hold — index.html caps the name inputs at 24 and
// server.js cleanName cuts to the same), an emoji name (a surrogate pair, the
// case `cutText` has an explicit unpaired-high-surrogate branch for), an
// apostrophe, and a diacritic.
export const DEMO_NAMES = Object.freeze([
  'Priya',
  'Bo',
  'Aleksandrina Quillfeath',
  '🎲 Dicey',
  'Wren',
  "Sam O'Dell",
  'Thorbjörn',
  'Mx. Quill',
  'Gus',
  'Ríoghnach',
  'Oleander Vex',
  'Kit',
]);

// THE HUES ARE server.js's PALETTE, IN ITS ORDER — a hand copy, because
// server.js does not run in a browser and the app has never had a client-side
// copy of it (the roster wears whatever hue the wire hands it). A copy that
// can drift is the bug, so tests/demo.test.mjs imports BOTH and asserts they
// are the same array: the mirror is pinned rather than trusted.
export const DEMO_PALETTE = Object.freeze([
  '#e2574c', '#e08a2e', '#d9c534', '#5fbe55',
  '#38b2a3', '#4a8ede', '#8d6ae0', '#dd5c9e',
]);

// ---------------------------------------------------------------------------
// The deal
// ---------------------------------------------------------------------------

// THE LOWEST FREE STATION, exactly as server.js freePlace decides it, over a
// set of held stations. Written as the same loop rather than as `i` because
// the loop is the claim: a fresh table fills 0, 1, 2… in the ladder order
// js/places.js writes down (long edges first, heads at N >= 5, the centre
// slots last), and a demo table that merely numbered its rows would agree
// with that by coincidence and stop agreeing the day the ladder changes.
export function freeDemoPlace(held) {
  for (let i = 0; i < DEMO_MAX; i++) if (!held.has(i)) return i;
  return null;
}

// STAND N FAKE PLAYERS. Returns rows in station order:
//   { id, name, color, place, demo: true }
//
// `id` is a demo id and is MARKED AS ONE ('demo:0'), because these rows go
// into the roster the placards read and a debugging session must never have
// to wonder whether a row came from a server. Nothing ever sends one
// anywhere: the cast is local to the tab that dealt it.
//
// `occupied` (2026-09-02, developer mode) is the set of places already held
// by REAL players — the viewer's own server-assigned chair at a table of one
// — and the deal fills around them exactly as server.js freePlace would fill
// around a seated player: a cast of four dealt beside a viewer at place 0
// stands at 1, 2, 3, 4. The table has eight chairs in all, so a full cast
// beside one real player is seven, and an eighth asked for is not dealt
// rather than dealt into somebody's lap.
//
// The hue is PALETTE[place], not PALETTE[joinOrder]: the server hands hues out
// round-robin from a per-room cursor and a fresh room's first eight players
// therefore get PALETTE[0..7] in join order, which at a fresh table IS station
// order. Keying on the station is the same answer with a property the join
// cursor lacks — reshuffling the names never moves a hue, so a station keeps
// its colour while you flip through casts and the overlay's tint stays the
// thing you were reading.
//
// `rand` is the draw (Math.random in the app, a seeded generator in a test).
// It is consumed ONLY for the name shuffle, so a deal of the same n with the
// same draw is the same cast, and nothing about the LAYOUT depends on it.
export function dealDemo(n, rand = Math.random, occupied = null) {
  const count = Math.max(0, Math.min(DEMO_MAX, Math.floor(Number(n) || 0)));
  const pool = [...DEMO_NAMES];
  // Fisher-Yates, top-down — the shuffle every deck in this repo uses.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const held = new Set();
  for (const p of occupied || []) if (Number.isInteger(p)) held.add(p);
  const rows = [];
  for (let k = 0; k < count; k++) {
    const place = freeDemoPlace(held);
    if (place === null) break;            // the table is full: a 9th would be placeless
    held.add(place);
    rows.push({
      id: `demo:${place}`,
      name: pool[k % pool.length],
      color: DEMO_PALETTE[place % DEMO_PALETTE.length],
      place,
      demo: true,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

// WHICH STANDING ROLLS A NEW ONE TAKES AWAY — server.js arrivalSweep, mirrored
// for the one caller that has no server: the cast's own throws.
//
// Solo already had an arrival beat (js/main.js soloAutoCollect: a new roll
// collects EVERYTHING this session still has on the felt), and that is the
// pre-places rule — correct for a table with one chair in it and wrong for a
// cast table, where the whole point of standing eight players is to watch
// eight pools coexist. The server's rule is the one that makes "the felt holds
// one roll PER PLACE" literal, and it is three clauses:
//
//   · a TOWER table keeps the old whole-felt sweep (row 15's debt: while a
//     tower is socketed the entries collide, so per-place would be per-edge
//     and would take away the wrong player's dice), and so does an arrival
//     that carries no stamp at all;
//   · otherwise a roll goes if it is the SAME ROLLER's, or if it stands at
//     the same STAMP (the chair, not the person — a chair handed on sweeps
//     the roll its last sitter left standing), or if it is UNSTAMPED (a
//     placeless roll takes the whole felt and gives it up to the next placed
//     one).
//
// `standing` is [{ playerId, entry, lane }] and the return is the subset to
// collect, in the order given.
export function demoArrivalSweep(standing, arriving, towerUp = false) {
  const rows = Array.isArray(standing) ? standing : [];
  if (!arriving || !seatValid(arriving.seat, arriving.seats, arriving.arc || 0) || towerUp) return [...rows];
  return rows.filter((r) => r.playerId === arriving.playerId
    || (Number.isInteger(arriving.place) && r.place === arriving.place)
    || !seatValid(r.seat, r.seats, r.arc || 0));
}
