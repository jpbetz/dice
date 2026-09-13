<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Dice collection portraits

These WebP images are offline renders of the application's actual d12, d6,
and d20 meshes and materials, using `js/diceart.js`. The personal gallery
loads visible images on demand instead of constructing catalogue meshes.
The Standard portrait intentionally includes its three die-type colors.

Regenerate after changing a catalogue recipe or dice geometry:

```sh
node tools/drive.mjs tools/steps/dice-gallery-bake.mjs
```

The tool uses its own ephemeral server/browser. It writes one 560 × 280
portrait per set, including the venue-only sets a table can suggest. The
gallery still filters offerings by the active stability channel and catalogue.
