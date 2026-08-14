# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Diff a bake's geometry digests against the committed baseline.

    python digestdiff.py <run digest.json> <baseline digests.json>

A recipe is supposed to re-bake byte-identically — that is what the Blender
version pin and forge.canonicalize are FOR, and the bake-off battery exists
partly to prove it still holds. So a moved digest is one of exactly two
things, and they are told apart by whether a human moved the baseline in the
same commit:

  * a change somebody meant. Update tools/forge/digests.json alongside the
    recipe edit; the diff is then green and the commit carries the receipt.
  * the pin quietly stopped holding (a Blender upgrade, a nondeterministic
    boolean, an unsorted dict). That is the case this file exists for.

`set` is the SOLID and `order` includes emission order, materials and colour
attributes, so a colour-only edit moves `order` and leaves `set` alone — which
is how the two palette variants of one model prove they are the same geometry
without anybody taking it on trust.

A slug with no baseline row is REPORTED, not refused. The B1-B7 battery are
living worked examples rather than shipped assets, and a gate that demands a
baseline for every experiment is a gate people delete.
"""
import json
import sys


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def main():
    run_path, base_path = sys.argv[1], sys.argv[2]
    run = load(run_path)
    if not run:
        print(f"[digest] no {run_path} — nothing to diff (pre-digest recipe?)")
        return
    base = load(base_path) or {}
    bad, new = [], []
    for slug in sorted(run):
        got = run[slug]
        want = base.get(slug)
        if want is None:
            new.append(slug)
            print(f"[digest] {slug}: set={got['set']} order={got['order']} "
                  f"tris={got.get('tris')}  (no baseline row)")
            continue
        deltas = [f"{k}: {want.get(k)} -> {got.get(k)}"
                  for k in ("set", "order", "tris") if want.get(k) != got.get(k)]
        if deltas:
            bad.append(f"{slug}  " + ";  ".join(deltas))
        else:
            print(f"[digest] {slug}: matches baseline "
                  f"(set={got['set']} tris={got.get('tris')})")
    if new:
        print(f"[digest] {len(new)} slug(s) have no baseline row — add them to "
              f"{base_path} if this asset ships")
    if bad:
        print("\nDIGEST DRIFT:", file=sys.stderr)
        for line in bad:
            print("  - " + line, file=sys.stderr)
        print(f"  the bake is not what {base_path} recorded. If you meant it, "
              f"update the baseline in the SAME commit as the recipe edit; if "
              f"you did not, the Blender pin or a boolean's determinism is "
              f"what moved.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
