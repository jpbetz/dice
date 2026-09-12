<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# The Tower Foundry

The three production Blender towers, approved by Joe on 12 September 2026
to replace the entire old catalogue. They reimagine wood, stone and forge
towers from scratch. No existing tower mesh or tower recipe geometry was
used. The shared forge export and measurement utilities remain the pipeline.

- **Wickroot:** an ancient cedar sanctuary, torn crown and twisting roots.
- **Cairnwatch:** a coastal abbey watchtower, broken stone and a tended beacon.
- **Cinderbell:** a monumental bell foundry, flared bronze and soot-black iron.

The game's tower registry is exactly **None, Wickroot, Cairnwatch and
Cinderbell**. Both fae venues use Wickroot. Heartwood, Bastion, Black Anvil,
Nullstone and Hollow Bole have been retired as towers; similarly named dice
sets remain. Every new tower has its own sound palette and model-declared
portals, and uses the normal shared-room settings path.

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
opens the real app with the selected model. The ordinary game's Tower picker
also offers these models on its existing beta channel.

The `.blend` files retain named parts and vertex paint. Recipes live at
`tools/forge/recipes/{wickroot,cairnwatch,cinderbell}.py`. Each writes to its
own output directory; for example:

```sh
FORGE_OUT="$PWD/tools/forge/out/wickroot" tools/forge/bake.sh \
  tools/forge/recipes/wickroot.py --tower --expect-colors --max-tris 22000
```

Production GLBs are served from `models/towers/`. This directory retains the
gallery, editable `.blend` files and review evidence; its large authoring
artifacts are excluded from Cloud Build uploads. After rebaking, update the
authoring copies here and promote the production GLB with its digest/cache
record as described in `tools/forge/README.md`. A gallery-only copy does not
update the file served to players.

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
review. The accepted triangle ceiling is 22k for these models: 18,468 for
Wickroot, 17,722 for Cairnwatch and 21,576 for Cinderbell. Their silhouette and
material work justify that measured departure from the earlier 15k guidance.
