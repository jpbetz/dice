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

before=$(ls "$FORGE_OUT"/*.glb 2>/dev/null || true)
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$RECIPE"
after=$(ls "$FORGE_OUT"/*.glb 2>/dev/null || true)

# gate every GLB the recipe just (re)wrote — newest first
new=$(ls -t "$FORGE_OUT"/*.glb 2>/dev/null | head -3)
[ -n "$new" ] || { echo "recipe produced no GLB in $FORGE_OUT" >&2; exit 3; }
newest=$(echo "$new" | head -1)
echo "--- gate: $newest"
"$VENVPY" "$HERE/check.py" "$newest" "$@"
