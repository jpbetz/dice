#!/usr/bin/env bash
# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
#
# Bake a recipe to GLB and gate it.
#
#   tools/forge/bake.sh recipes/B1_die.py [check args passed to check.py...]
#
# The recipe decides its own output slug (forge.export_glb/finish). Output
# lands in tools/forge/out/ (override with FORGE_OUT). Blender is found via
# FORGE_BLENDER, else ~/opt/dice-forge/blender-*/blender. Run bootstrap.sh
# once per machine to install Blender 4.5 LTS + the check venv.
#
# --python-exit-code 1 is load-bearing: without it Blender exits 0 after an
# uncaught traceback and a broken bake looks clean.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RECIPE="${1:?usage: bake.sh <recipe.py> [check args]}"
shift || true

BLENDER="${FORGE_BLENDER:-$(ls -d "$HOME"/opt/dice-forge/blender-*/blender 2>/dev/null | sort -V | tail -1)}"
[ -x "$BLENDER" ] || { echo "no blender found; run tools/forge/bootstrap.sh" >&2; exit 2; }
VENVPY="${FORGE_VENV_PY:-$HOME/opt/dice-forge/venv/bin/python}"
[ -x "$VENVPY" ] || { echo "no check venv; run tools/forge/bootstrap.sh" >&2; exit 2; }

export FORGE_OUT="${FORGE_OUT:-$HERE/out}"
mkdir -p "$FORGE_OUT"

# The run's own start line. EVERY GLB written after it is gated — not just the
# newest one, which is what `ls -t | head -1` gave and what let hollowbole's
# SECOND palette ship through no automated gate at all. That variant's only
# content is COLOR_0, which is precisely the thing --expect-colors exists to
# catch, so the one file the flag was written for was the one file it never
# saw. A recipe that writes two assets now gates two.
STAMP="$(mktemp)"
trap 'rm -f "$STAMP"' EXIT
touch "$STAMP"
sleep 0.01   # coarse-mtime filesystems: never let the stamp tie a fresh GLB

"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$RECIPE"

mapfile -t FRESH < <(find "$FORGE_OUT" -maxdepth 1 -name '*.glb' -newer "$STAMP" | sort)
[ "${#FRESH[@]}" -gt 0 ] || { echo "recipe produced no GLB in $FORGE_OUT" >&2; exit 3; }
echo "--- gate: ${#FRESH[@]} fresh GLB(s)"
printf '      %s\n' "${FRESH[@]}"
"$VENVPY" "$HERE/check.py" "${FRESH[@]}" "$@"

# ...and the DIGEST DIFF. forge.export_glb writes FORGE_OUT/digest.json for the
# run; tools/forge/digests.json is the committed baseline. A recipe is supposed
# to re-bake byte-identically, so a moved digest is either a change somebody
# meant (update the baseline in the same commit as the recipe edit) or a
# Blender pin that stopped holding. A slug with no baseline row is reported,
# not refused: the battery recipes are living examples, not shipped assets, and
# a gate that demands a baseline for every experiment is a gate people delete.
"$VENVPY" "$HERE/digestdiff.py" "$FORGE_OUT/digest.json" "$HERE/digests.json"
