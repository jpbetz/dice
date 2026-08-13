#!/usr/bin/env bash
# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
#
# One-time per machine: install the pinned Blender LTS + the check venv.
# Everything lands under ~/opt/dice-forge (no sudo, no system packages).
#
# The pin is deliberate: bpy scripts are version-churny (the 4.1 auto-smooth
# change bit real tutorials). Upgrading the pin is a decision that re-runs the
# battery recipes, not a drift. Current pin: 4.5.12 LTS (supported to 2027;
# 5.2 LTS is the documented upgrade path — see README).
set -euo pipefail

PIN="4.5.12"
ROOT="$HOME/opt/dice-forge"
mkdir -p "$ROOT"

if ! ls -d "$ROOT/blender-$PIN-linux-x64" >/dev/null 2>&1; then
  echo "downloading Blender $PIN (~350 MB)..."
  curl -fL --retry 3 -o "$ROOT/blender.tar.xz" \
    "https://download.blender.org/release/Blender${PIN%.*}/blender-$PIN-linux-x64.tar.xz"
  tar -xf "$ROOT/blender.tar.xz" -C "$ROOT"
  rm -f "$ROOT/blender.tar.xz"
fi
"$ROOT/blender-$PIN-linux-x64/blender" --version | head -1

if [ ! -x "$ROOT/venv/bin/python" ]; then
  command -v uv >/dev/null || { echo "need uv (https://astral.sh/uv) — no sudo required" >&2; exit 2; }
  uv venv "$ROOT/venv" --python 3.13
fi
uv pip install --python "$ROOT/venv/bin/python" -q numpy trimesh scikit-image
"$ROOT/venv/bin/python" -c "import trimesh; print('check venv ok, trimesh', trimesh.__version__)"
echo "bootstrap complete"
