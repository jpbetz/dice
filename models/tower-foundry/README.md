<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# The Tower Foundry

Three original Blender tower studies, developed in the isolated
`codex/tower-foundry` branch and `/home/jpbetz/projects/dice-tower-foundry`
worktree. The brief is to reimagine wood, stone and forge towers from scratch.
No existing tower mesh or tower recipe geometry is used. The shared forge
export and measurement utilities remain the pipeline.

- **Wickroot:** an ancient cedar sanctuary, torn crown and twisting roots.
- **Cairnwatch:** a coastal abbey watchtower, broken stone and a tended beacon.
- **Cinderbell:** a monumental bell foundry, flared bronze and soot-black iron.

These are art studies, with temporary solo table previews. They do not change
the game's catalogue, room protocol, voices, physics, existing assets or the
owner's live table. Full multiplayer product integration is outside this pass.

The completed [visual review and verification record](REVIEW.md) includes
the final measurements, design decisions, evidence and remaining art limits.

## View and edit

From this worktree, run the existing server on a free port other than 8123:

```sh
PORT=8341 node server.js
```

Open `http://localhost:8341/models/tower-foundry/index.html`. The gallery has
synchronized orbit controls, material/clay/normal/wire views, front/crown/back
presets, editable `.blend` downloads, and GLB downloads. **Roll at the table**
opens the real app in a temporary solo session with that study loaded through
the existing debug registry hook. Refreshing that tab ends the preview.

The `.blend` files retain named parts and vertex paint. Recipes live at
`tools/forge/recipes/{wickroot,cairnwatch,cinderbell}.py`. Each writes to its
own output directory; for example:

```sh
FORGE_OUT="$PWD/tools/forge/out/wickroot" tools/forge/bake.sh \
  tools/forge/recipes/wickroot.py --tower --expect-colors --max-tris 22000
```

The gallery copies are deliberate review artifacts. After rebaking, copy the
new `.blend` and `.glb` from that model's output directory into its directory
here. No production promotion command is run for a study.

## Reproduce the review

```sh
node tools/drive.mjs tools/steps/foundry-gallery.mjs
node tools/drive.mjs tools/steps/foundry-review.mjs all full
npm test
```

The drivers use private, ephemeral servers and browser processes. Gallery
shots, six-view in-app sheets, pour screenshots, and model-specific proof
JSON land in `tools/out/`. The model recipes also include original Blender
render companions for inspecting the reimported GLBs.

The inherited assumption being challenged: a tower must be a decorated tube
or box. A technically valid mouth is only the start. Silhouette, material,
wear, and a sense of someone having built or tended the object are the art
review. The old triangle guidance may be exceeded for these studies when
the silhouette and material work justify it; the actual counts are reported
in the gallery and the final review record.
