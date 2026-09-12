<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Foundry review — authored 11 September, adopted 12 September 2026

Joe approved all three Blender models as the production tower catalogue and
asked to remove every old tower. The registry is now `none`, `wickroot`,
`cairnwatch`, and `cinderbell`; both fae venues use Wickroot. Every model
includes its recipe, editable scene, GLB, table integration and rendered
evidence. No existing tower geometry or tower recipe geometry was used.
Shared export, loader and physics utilities remain the integration surface.

![The three studies](previews/foundry-gallery-desktop.png)

| Study | Triangles | Editable mesh objects | In-app meshes | Entry rim | Exit width × height |
| --- | ---: | ---: | ---: | ---: | --- |
| Wickroot | 18,468 | 16 | 6 | 7.70 | 4.20 × 3.375 |
| Cairnwatch | 17,722 | 5 | 6 | 9.10 | 4.35 × 3.70 |
| Cinderbell | 21,576 | 40 | 7 | 9.60 | 4.40 × 3.80 |

Dimensions are app units. All three sills are 1.0. Full bounds, portal
derivations, geometry/color digests, complete GLB SHA-256 hashes, file sizes
and measured pour results are in [build-record.json](build-record.json).

## The visual decisions

**Wickroot** became a shorter sanctuary stump after the first tall forms
read as corrugated pipes. Unequal crown shoulders, irregular bark fields,
faceted root collars, a grain-painted heartwood tongue and hanging copper
tokens carry the final miniature. The doorway and rim were lowered together
and remeasured. The final threshold sliver was an actual mesh protrusion;
compressing its vertex columns below the ramp removed it without collapsing
the small triangles. The final hero, normal view and in-app sheet were
inspected after that correction. The bark remains deliberately stylized;
its broad exit tongue is still the most visibly functional part. The explicit
production camera check required a higher front crown shoulder; overall
height rose from 9.866 to 10.199 while both portals stayed unchanged. The
updated hero and in-app sheet were inspected, and all six actual cameras
now block 99/99 shaft and 99/99 cowl samples; all three pour pools pass.

**Cairnwatch** uses full-thickness broken masonry at the crown, stacked
buttresses, a stone arch and jointed threshold. A smooth sloping crown and
thin buttresses were rejected in the first review. Two defective decorative
arch-facing fragments were omitted as whole stones; the intact structural
core remains behind them. The final crown stones are supported and the
beacon has a proper footing. The wear is coarse and faceted, rather than
photorealistic surface erosion.

**Cinderbell** has a pinched neck, lower bell flare, double rolled lip,
pierced lifting eyes, large fasteners and a small maker's mark. The first
arch cut opened unintended rear holes; its depth was shortened and the
rear view checked. Bronze was brightened after inspection in the room,
with oxide concentrated at seams. The forty editable pieces are batched
into seven exported meshes. The low skirt belt stays separate because
combining it with the tall lip made the envelope audit infer a wide crown
that did not exist. Fine bronze wear is subtler under the room lighting
than under the gallery studio lights.

## Authoring verification on the final packaged files

- The main session independently rebaked all three recipes. Geometry and
  colors match the builders' repeat bakes; complete GLB bytes also reproduce.
- Every bake passes watertightness, winding, degenerate-face, vertex-color,
  budget, portal, approach, exit, lane cladding, occlusion and socket checks.
- All three loaded into the actual app with model-authored portals, zero
  unclassified fit overruns and no off-policy materials.
- Each final model delivered `1d20`, `1d8+1d6+1d10`, and `8d6`: nine pours,
  all delivered on the first bake attempt, no unseen or stranded dice.
  The completed values stayed visible; removing a tower restored the
  towerless body list. Each model adds exactly eight engine colliders.
- The gallery passed desktop and phone checks, all six asset downloads,
  hero/crown/normal views, and the actual button opening a new solo table
  with the chosen model. Final screenshots were opened and inspected.
- Each packaged `.blend` was reopened in Blender and checked for meshes,
  licensing metadata, and a framed material-preview starting view.
- `npm test` passed, including all 60 e2e smoke scenarios. The static-cache
  check also passed after excluding the study directory from deployment.

Evidence is retained in [previews/](previews/): the gallery, normal sheet,
individual hero/crown views, six-view app sheets, and mid-pour screenshots.

**Instrument correction during production integration:** the original room
review called the occlusion hook without a model ID, so that result could
describe the bench's default tower. It is not accepted as proof for these
models. The review now names each registered ID explicitly; model-specific
regression checks cover the permanent catalogue. The forge ray checks were
against each exported GLB but used obsolete camera coordinates. They now
read the app-emitted camera contract. Wickroot was rebaked and passed both
the corrected forge rays and the explicit-ID full room review; final
replacement evidence uses these corrected instruments.

## Scope and guidance departures

The 15k triangle guidance was increased for these models to preserve
broken masonry, organic surface shapes and cast-metal details. The measured
totals above remain under the owner-approved 22k ceiling. No GOALPOST
promise was set aside.

The September 11 review began as isolated studies; that scope was superseded
by the owner's September 12 replacement approval. Production registration,
three distinct sound palettes and normal shared-room distribution are part
of the replacement. The five old towers and their exclusive model/build
code are retired. Their names still used by dice sets remain valid.

Production GLBs ship from `models/towers/`. This authoring gallery and its
editable scenes remain excluded from Cloud Build uploads. The trial tooling
originally used a temporary solo registry hook; production uses the ordinary
registry and server allowlist. [TOWER.md](../../docs/TOWER.md) records the
current model contract, and [SHIPPED.md](../../docs/SHIPPED.md#the-foundry-replaces-the-tower-catalogue-2026-09-12)
records the replacement. Review tools use private ephemeral servers and
browser processes; the owner's live port 8123 is not a test surface.
