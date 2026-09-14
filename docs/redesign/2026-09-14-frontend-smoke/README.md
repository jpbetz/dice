<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Frontend release smoke

The reusable [HTTPS smoke](../../../tools/frontend-https-smoke.mjs) checks a
reviewed frontend source with two fresh guest browsers. The
[local fixture](../../../tests/frontend-https-smoke.test.mjs) passed 3/3 tests
against source `90b8bb9e3865d0278adaa489fb73017994c75dc4`, including all five
browser checkpoints. [Local aggregate](local-proof.json) records the exact
source, tool digest and observations. This record makes no cloud-release,
performance, account-recovery or process-replacement claim.

The driver requires an explicit HTTPS origin and full expected `/health` SHA.
Its default mode, also named `--check`, only validates local arguments and makes
zero requests. `--run` starts one new attempt; an existing journal is refused.
Use a new private directory for each staged or production attempt:

```sh
node tools/frontend-https-smoke.mjs \
  --origin https://reviewed-host.example \
  --sha 90b8bb9e3865d0278adaa489fb73017994c75dc4 \
  --journal /tmp/private-frontend-attempt/proof.json --check
```

After reviewing the exact target, replace `--check` with `--run`. Remote
noncanonical ports and port 8123 are refused. Explicit `--local` allows only
loopback and is used by the fixture test. To reproduce the local check against
a separate immutable checkout:

```sh
DICE_FRONTEND_APP_ROOT=/absolute/path/to/reviewed-checkout \
  node --test tests/frontend-https-smoke.test.mjs
```

The exclusive attempt journal uses atomic updates, retains bounded failure
causes, and records owned-browser cleanup. It is private (0600 in a 0700
directory), contains the generated guest room, and is never a public artifact.
A successful final journal identifies `ok: true`, `sourceSha`, and `origin`;
the release operator separately binds its digest, tool digest, revision and
immutable image. The driver prints only check names and a bounded summary.

The browser flow uses actual hit-tested pointer and keyboard input, with
natural playback. It checks quick 2d6 before any portrait request; eight
visible palette controls sharing seven Standard WebPs; stable button geometry
while those requests are held; actual selection of Sea-glass with seven more
WebPs; and zero live portrait contexts/renders. All four changed dice/art
modules must load successfully. Both guests then receive identical complete
4d20 animation data and values, show the same attributed result, and keep
actual projected settled mesh vertices inside the scene with no control over
the dice centers. Account status/session GETs must remain healthy and anonymous;
no account mutation request or cookie is permitted. The local proxy also
refuses account writes and verifies that no account data file was created.

All five final 390×844 captures were inspected. The moving quick dice are
visible, labels retain their place while portraits load, the Sea-glass palette
is clear, and both shared results read **56 = 18 + 14 + 20 + 4**. These are
emulated phone views of generated fixtures, not physical-device observations.

- [Quick 2d6 during playback](quick-2d6-moving.png)
- [Builder while portrait responses are held](builder-portraits-pending.png)
- [Sea-glass builder](builder-seaglass.png)
- [Alice’s shared 4d20](shared-4d20-alice.png)
- [Bob’s same shared result](shared-4d20-bob.png)
