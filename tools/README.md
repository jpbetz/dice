# tools/ — the shared headless driver

One way to drive the app outside the e2e suite (debug sessions, repros,
screenshots), built on the same trusted machinery the tests use
(`tests/e2e/cdp.mjs` + `harness.mjs`). Always binds an **ephemeral port** —
it can never touch the live table on 8123.

```bash
node tools/drive.mjs tools/steps/<step>.mjs [args…]
```

A step file default-exports `async (stage, args) => { … }`:

- `stage.tab(origin, name)` → a harness `Table` (`eval`, `dbg`, `roll`,
  `settle`, `waitFor`, `logTop`, …). Distinct origins (`localhost`,
  `127.0.0.1`, `127.0.0.2`, …) seat distinct players in the same room.
- `stage.shot(table, 'name.png')` → PNG into `tools/out/` (gitignored).
- `stage.ctx` / `stage.port` / `stage.room` for anything lower-level.

Canned steps:

- `two-tab-roll.mjs ['<notation>']` — A rolls, both tabs settle, full state
  dump per tab (dice, log, busy, net, page errors).
- `screens.mjs [feltId] [prefix]` — the standing screenshot suite into
  `tools/out/` for visual review of new chrome.

Add new step files here (Apache header, like everything first-party) rather
than writing one-off inline scripts — repeatable work belongs in the repo.
