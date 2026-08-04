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

## Contact sheets (2i-F)

```bash
node tools/contact-sheet.mjs            # stitch tools/out/ and each subdir
node tools/contact-sheet.mjs <dir> …    # only the named dirs
```

Writes a `contact.html` captioned-thumbnail grid into every directory
that holds PNGs (plus a top-level `tools/out/index.html`), so a drive
run is reviewable at a glance and two runs are comparable. Regenerate
freely — the sheets live inside the gitignored `out/` tree.

## The chrome lab

`/chrome-lab.html` (served by `node server.js`, any port) is the 2D
counterpart to `lab.html`: it embeds the REAL app in an iframe and poses
result-read states (staged draft, banners, peek, check/cinematic
verdicts, held rolls) through `__diceDebug` — real CSS, real hovers,
zero forked markup, so it cannot rot the way docs/mockups did.
