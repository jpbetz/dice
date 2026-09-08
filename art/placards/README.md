<!--
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
-->

# Celtic placard artwork

These two **unmodified third-party SVGs** are by **AnonMoos**, released into
the **public domain worldwide** by the author. Their original titles and
metadata are retained. They are design sources; the application uses local
Canvas paths adapted in `js/placard-knots.js`, with no remote asset requests.

| Source | Revision retained | SHA-256 |
| --- | --- | --- |
| [Celtic-knot-twoloops-bigends.svg](https://commons.wikimedia.org/wiki/File:Celtic-knot-twoloops-bigends.svg) | 25 November 2011, 18:53 UTC | `d7aabb15cbf73f21366dfa675c4931c63acd2fa2d34c9bf2dd921ca5e4ad41d8` |
| [Celtic-knot-insquare.svg](https://commons.wikimedia.org/wiki/File:Celtic-knot-insquare.svg) | 3 March 2010, 10:48 UTC | `c369d97dcdd1c14b6cdd4a257f1ec50cc09ed12c6da45f0779fbc7e6f88841e8` |

Source and licensing pages checked 2026-09-08. The SVGs are modern decorative
Celtic knotwork, not a reproduction of a particular Scottish artifact.
Scottish historical context was reviewed in National Museums Scotland's
[Dunadd Hillfort collection article](https://www.nms.ac.uk/discover-catalogue/dunadd-hillfort-the-seat-of-early-medieval-scottish-power),
which includes an interlace plaque. No museum imagery is redistributed.

The Canvas adaptation retains the author's loop paths, crossing sequence,
and explicit bridge patches. Changes: teal theme/custom coloring; transparent
clearances instead of opaque outlines; wider crossing gaps; a stronger square
ribbon; omitted tiny outline-repair strokes on the square's two sides;
layout as two returning braids flanking a square knot above/below the name.
There is no automatic intersection detection. Paths are cached at first use.

The braid's ribbon is 24.57 source units wide, with a 54-unit knockout:
4.19 atlas pixels of clear space on each side of an overpass at the chosen
228-pixel motif width. The square uses a 28-unit ribbon and 62-unit knockout.
Gaps are erased on a scratch canvas before compositing onto the theme's
surface tint, so their appearance follows the actual ground rather than a
fixed background color.
