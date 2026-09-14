<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Dice portraits

These 192 × 192 WebP images are rendered from the actual die meshes,
materials and face artwork by `js/diceart.js`. They cover the seven die
types in every built-in set, plus standard and shrouded dice. The d100
button reuses d10x. They are loaded only when a control using them becomes
visible; the catalogue is not downloaded at startup.

Regenerate after changing a recipe or renderer:

```sh
node tools/drive.mjs tools/steps/dice-art-bake.mjs
node tests/dice-art.test.mjs
```

This is an authoring tool, not an application build step. The tool writes
the images and `js/diceart-manifest.js`; the unit check detects stale
recipes or renderer source. Runtime recipe edits and missing images use
the live renderer, one requested portrait per frame. No new dependency is
required.
