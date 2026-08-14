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

// THE STABILITY CHANNEL — which unfinished work this browser is offered.
//
// Towers and venues are in closed beta (Joe, 2026-08-14). They are shipped,
// they work, and they are not finished being decided; production players
// should not meet them by accident. So a browser sits on one of two channels
// and the channel decides what the SETTINGS PANEL OFFERS.
//
// ── THE ONE LAW ────────────────────────────────────────────────────────────
// THE CHANNEL GATES THE OFFER, NEVER THE CAPABILITY. A stable client that
// walks into a beta player's room still applies that room's tower and venue,
// exactly as before — it just cannot pick one.
//
// This is not politeness, it is GOALS goal 15 (one seed, one film, every
// client). The pour is a pure function of (portal spec, engine constants,
// seed): a client that refused to socket the room's tower would bake a
// DIFFERENT FILM from everyone else at the table and the dice would visibly
// disagree seat to seat. applyRoomSettings already carries this reasoning for
// unknown tower ids ("keeping the table is the right call, and it is not
// free"); a channel is the same situation with a different cause, so it gets
// the same answer. Nothing here is a security boundary and nothing here is on
// the wire — the server does not know about channels and does not need to.
//
// The shape is deliberately the one the registry already uses: `venueOnly` is
// "a CATALOGUE rule about how this tower is chosen… a picker rule, not a
// capability" (js/main.js, TOWERS). The channel is a second catalogue rule on
// the same axis.
//
// ── HOW A BROWSER CHANGES CHANNEL ──────────────────────────────────────────
//   ?stability=beta    →  this browser is a beta browser, from now on
//   ?stability=stable  →  …and back again
//
// The param is a KEY, NOT A SETTING: it is redeemed once, written to
// localStorage, and STRIPPED from the URL. That matters twice over.
//
//   1. GOALS §7 says the URL addresses a TABLE — `?room=` — and carries no
//      user state; the `#g=` save-link codec was dropped for it. A channel
//      that lived in the query string would be exactly the thing that rule
//      forbids, re-grown under a new name.
//   2. It would LEAK. The share flow hands out `location.href`. A beta host
//      who copied their address bar would silently enrol every player they
//      invited — which is the failure this whole feature exists to prevent,
//      arriving through the front door.
//
// Redemption is per BROWSER, not per profile: it is about which build of the
// app you are being shown, not who you are sitting down as.

export const PARAM = 'stability';
export const CHANNELS = Object.freeze(['stable', 'beta']);
export const DEFAULT_CHANNEL = 'stable';

/** True for a channel name this build knows. */
export function isChannel(v) {
  return typeof v === 'string' && CHANNELS.includes(v);
}

// Resolve the channel for this boot. Pure on purpose — localStorage, the URL
// and history.replaceState are all the caller's business, so the PRECEDENCE
// (which is the part with rules in it) is unit-testable without a browser.
//
// Returns { channel, write, strip }:
//   channel — the channel in force for this boot
//   write   — the value to persist, or null when the store already agrees
//   strip   — whether to rewrite the URL without the param
export function resolveChannel({ stored, param } = {}) {
  const kept = isChannel(stored) ? stored : DEFAULT_CHANNEL;
  // A param that is PRESENT but unreadable ('BETA ', 'yes', '') is still a
  // param: it gets stripped so nothing lingers in the address bar to be
  // shared, and it changes nothing. Trimmed and lowercased first, because a
  // link that survives a chat client's capitalisation is worth more than a
  // strict-matching one.
  const present = param !== null && param !== undefined;
  const asked = present ? String(param).trim().toLowerCase() : '';
  const valid = isChannel(asked);
  return {
    channel: valid ? asked : kept,
    write: valid && asked !== stored ? asked : null,
    strip: present,
  };
}
