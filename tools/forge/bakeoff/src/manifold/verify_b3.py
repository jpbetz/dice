# Copyright 2026 The Dice Table Authors.
# Does the warped bar actually follow the helix the spec asked for?
# Samples the channel at several angles along the sweep: floor solid, trough
# open above it, both walls present, and nothing where the next turn is not.
import math
import sys

from _meshprobe import cyl, main

HELIX_R, PITCH, TURNS, TOP_Z, THICK, WALL_H, FLOOR_W = 1.55, 2.6, 2.25, 7.6, 0.12, 0.35, 1.2


def z_at(turn_fraction):
    """Floor underside height at a given fraction of the total sweep."""
    return TOP_Z - turn_fraction * TURNS * PITCH


def checks_for(_mesh):
    out = []
    for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
        deg = frac * TURNS * 360
        z0 = z_at(frac)
        tag = f"t={frac:.2f} ({deg:.0f}deg)"
        eps = 0.01 if frac in (0.0, 1.0) else 0.0  # stay inside the end cuts
        d = deg + (2 if frac == 0.0 else -2 if frac == 1.0 else 0)
        zz = z_at(frac + (0.002 if frac == 0 else -0.002 if frac == 1 else 0))
        out += [
            (f"{tag} floor slab solid", cyl(d, HELIX_R, zz + THICK / 2), True),
            (f"{tag} trough open above floor", cyl(d, HELIX_R, zz + THICK + 0.1), False),
            (f"{tag} inner wall solid", cyl(d, HELIX_R - FLOOR_W / 2 + THICK / 2, zz + WALL_H - 0.05), True),
            (f"{tag} outer wall solid", cyl(d, HELIX_R + FLOOR_W / 2 - THICK / 2, zz + WALL_H - 0.05), True),
            (f"{tag} nothing outside the channel", cyl(d, HELIX_R + FLOOR_W / 2 + 0.15, zz + 0.05), False),
            (f"{tag} nothing below the floor", cyl(d, HELIX_R, zz - 0.15), False),
        ]
    # Column present full height, and the tongue joins chute to column.
    out += [
        ("column solid at h 0.2", cyl(0, 0.2, 0.2), True),
        ("column solid at h 7.9", cyl(0, 0.2, 7.9), True),
        ("column gone above h 8.0", cyl(0, 0.2, 8.1), False),
        ("tongue bridges column to chute", cyl(2, 0.85, TOP_Z + THICK / 2), True),
    ]
    # Clean end cuts: material just inside the start cut, air just before it.
    out += [
        ("start cap: material just after it", cyl(1.0, HELIX_R, TOP_Z + THICK / 2), True),
        ("start cap: air just before it", cyl(-3.0, HELIX_R, TOP_Z + THICK / 2), False),
        ("end cap: material just before it", cyl(TURNS * 360 - 1.0, HELIX_R, z_at(1) + THICK / 2), True),
        ("end cap: air just after it", cyl(TURNS * 360 + 3.0, HELIX_R, z_at(1) + THICK / 2), False),
    ]
    return out


main(checks_for)
