<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Dice Table

A shared 3D dice table for tabletop games, with physical tumbles, readable
results and private rolls. Start as a guest, play solo, or optionally keep a
recoverable identity, private dice library and named table homes.

## Find your way around

- **Tables** — return to recent tables, preview Table setup, or save a named
  home for future games. The Copper Lantern, The Navigation Table and The Stone
  Circle give the shared playing surface distinct artwork.
- **My dice & rolls** — build a roll, browse and favorite visual dice, try a
  private practice throw, and manage saved rolls and characters. New play starts
  with Quick dice and **Numbers only**; preview a game's starter kit before
  adding it. **Saved rolls & starter kits → Import / export** previews portable
  YAML before applying it; **Download backup** keeps a library copy.
- **People** — see who is at the table and invite guests by link. Where accounts
  are enabled, add friends and receive invitations inside the app. **Accept for
  later** preserves the current turn; **Accept and join** explicitly enters the
  invited table. Online and table-location sharing start off.

On phones, **Rolls** opens My dice & rolls, with roll controls along the bottom
and **More** for Preferences, history and Help. The table keeps each player's latest public
result available. In Preferences, **Battery saver** reduces effects and
pauses animated surroundings at rest; **Instant results** skips the tumble on
this device. Hidden rolls still require Reveal.

## What is kept

Your library stays in this browser by default. Where the optional account
service is enabled, save a recovery key and review local and saved versions
before choosing private sync. Offline edits and competing versions remain
available for review and export. Profiles are shared only when you select
**Share at this table**, separately from each roll's visibility.

Saved homes retain their name and public prepared setup across server restarts.
Private libraries and private rolls are excluded. Live rooms, unfinished turns
and shared roll history are temporary, even at a saved home. Guest play needs
no account; static hosting provides local solo play without the service.

## Run locally

Use Node **22–24**. No npm install or build step is required; browser
libraries are vendored. From the repository root, choose a free port:

```sh
PORT=8080 node server.js
```

Open `http://localhost:8080/?room=yourparty`. Players using the same server and
room share the table. Accounts are off by default; the
[operating guide](docs/ACCOUNT-OPERATIONS.md) covers the optional local file
store and Firestore deployment. A Cloud Run filesystem is not durable storage.

For static solo hosting, serve the same directory:

```sh
python3 -m http.server 8081
```

Open `http://localhost:8081/`. Without the server API, rolls stay local.

## Development and verification

The app uses plain ES modules, three.js and cannon-es. The server authors shared
values and broadcasts rolls over Server-Sent Events; clients simulate and play
seeded films. Personal presentation controls do not change shared values.

`server.js` handles live rooms and optional account routes; `service/` contains
durable storage and account permissions. `js/main.js` wires the scene and UI;
`js/net.js` handles live connections; `js/portable.js` handles library YAML.

```sh
npm test                   # unit, fuzz and browser smoke/feature checks
npm run test:e2e:full       # complete browser release sweep
```

Browser tests need Chrome or Chromium and use their own temporary ports. Read
[AGENTS.md](AGENTS.md), [the goal post](docs/GOALPOST.md) and
[testing guidance](docs/TESTING.md) before contributing.

The [redesign plan](docs/EXPERIENCE-REDESIGN.md) and
[release checkpoint](docs/redesign/2026-09-13-staging.md) distinguish implemented
features, local tests, actual HTTPS staging/restore evidence and remaining
release work. The reviewed `11dd1ef` image is now released to production; its
[release record](docs/redesign/2026-09-14-production-release/README.md) separates
traffic readback, all nine canonical browser checkpoints and HTTPS delivery.
Physical-device and uncoached player validation remain separate. Deployment and
maintenance procedures are in [ACCOUNT-OPERATIONS.md](docs/ACCOUNT-OPERATIONS.md)
and [DEPLOY.md](docs/DEPLOY.md).

## License

[Apache License 2.0](LICENSE). Vendored libraries retain their
[own licenses](vendor/README.md).
