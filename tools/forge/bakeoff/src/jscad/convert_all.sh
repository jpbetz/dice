#!/bin/bash
# STL -> GLB for every item, via the battery's own converter.
# B1 and B4 ship as two coloured parts each: every part goes through the
# same converter (with the colour JSCAD assigned) and the parts are then
# stapled into one GLB by merge_glb.py. Everything else is a single mesh.
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
E="$SRC/../.."
OUT="$E/out/jscad"
PY=~/opt/dice-forge/venv/bin/python
CONV="$PY $E/harness/stl2glb.py"
cd "$OUT"

$CONV B1_die__body.stl _B1_body.glb --zup --angle 30 --color 214,206,186
$CONV B1_die__pips.stl _B1_pips.glb --zup --angle 30 --color 38,34,40
$PY "$SRC/merge_glb.py" B1_die.glb _B1_body.glb _B1_pips.glb

$CONV B2_turret.stl B2_turret.glb --zup --angle 30
$CONV B3_helix.stl B3_helix.glb --zup --angle 30

$CONV B4_gnarl__bark.stl _B4_bark.glb --zup --angle 30 --color 96,72,52
$CONV B4_gnarl__cut.stl _B4_cut.glb --zup --angle 30 --color 186,156,112
$PY "$SRC/merge_glb.py" B4_gnarl.glb _B4_bark.glb _B4_cut.glb

$CONV B5_candelabra.stl B5_candelabra.glb --zup --angle 30
$CONV B6_plaque.stl B6_plaque.glb --zup --angle 30
$CONV B7_storm.stl B7_storm.glb --zup --angle 30

rm -f _B1_body.glb _B1_pips.glb _B4_bark.glb _B4_cut.glb
$PY "$E/harness/inspect_glb.py" B1_die.glb B2_turret.glb B3_helix.glb \
  B4_gnarl.glb B5_candelabra.glb B6_plaque.glb B7_storm.glb
