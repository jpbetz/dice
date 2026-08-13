"""B3 helix-ramp — a U-channel swept along a helix, as a screw-invariant field.

There is no sweep operator here to reach for, so the sweep is written out.  A
helical solid is invariant under the screw motion (turn by phi, drop by
PITCH*phi/2pi), which means every point can be un-wound onto ONE 2D
cross-section: `dr` from the helix radius, `dz` from the helix height at that
angle.  Then the whole chute is a 2D profile SDF, evaluated once per candidate
turn (atan2 is multivalued, so a handful of unwrappings are tried and the
nearest wins) and `max`-ed against two arc-length half-spaces for the planar
end cuts.

The upside: the profile is data, so the ramp's shape and the number of turns
are independent knobs and the walls stay exactly 0.12 thick everywhere.
The cost: ~20 lines of trigonometry that a lofting tool would give for free.
"""

import os
import sys

import numpy as np
from sdf import Z, capped_cylinder, sdf3, union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit

COLUMN_R, COLUMN_H = 0.50, 8.00
HELIX_R = 1.55  # to the CENTRE of the channel floor
PITCH = 2.60  # descent per full turn
TURNS = 2.25
TOP_Z = 7.55  # chute starts just under the column top

FLOOR_W = 1.20  # clear width between the walls
WALL_H = 0.35
THICK = 0.12

PHI_MAX = TURNS * 2 * np.pi
DROP = PITCH / (2 * np.pi)
TURN_CANDIDATES = range(0, int(np.ceil(TURNS)) + 1)

_HALF = FLOOR_W / 2 + THICK  # 0.72, outer half-width of the channel
_FLANGE_IN = COLUMN_R - HELIX_R  # -1.05, where the floor meets the column


def channel_profile(dr, dz):
    """U-channel cross-section, plus a flange that reaches in to the column.

    Coordinates are radial offset from the helix and height above the floor
    top, so this is just a 2D drawing — the sweep never sees it.
    """
    outer = kit.box2((dr, dz), _HALF, (WALL_H + THICK) / 2, cy=(WALL_H - THICK) / 2)
    mouth = kit.box2((dr, dz), FLOOR_W / 2, 1.0, cy=1.0)  # opens the top
    flange = kit.box2(
        (dr, dz),
        (-_FLANGE_IN - FLOOR_W / 2) / 2,
        THICK / 2,
        cx=(_FLANGE_IN - FLOOR_W / 2) / 2,
        cy=-THICK / 2,
    )
    return np.minimum(np.maximum(outer, -mouth), flange)


@sdf3
def helical_chute():
    def f(p):
        r = np.hypot(p[:, 0], p[:, 1])
        phi = np.arctan2(p[:, 1], p[:, 0])
        dr = r - HELIX_R
        best = np.full(len(p), 1e9)
        for n in TURN_CANDIDATES:
            unwound = phi + 2 * np.pi * n
            held = np.clip(unwound, 0.0, PHI_MAX)
            d = channel_profile(dr, p[:, 2] - (TOP_Z - DROP * held))
            # planar end cuts: half-spaces measured as arc length past each end
            past = np.maximum(-HELIX_R * unwound, HELIX_R * (unwound - PHI_MAX))
            best = np.minimum(best, np.maximum(d, past))
        return best.reshape((-1, 1))

    return f


ramp = union(capped_cylinder(-Z * 0.001, Z * COLUMN_H, COLUMN_R), helical_chute())


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B3_helix.glb")
    r = HELIX_R + _HALF + 0.06
    kit.report(
        "B3",
        kit.bake(
            ramp,
            os.path.abspath(out),
            bounds=((-r, -r, -0.037), (r, r, COLUMN_H + 0.061)),
            step=0.040,  # 0.12 walls need >=3 cells; finer only means a harsher decimation ratio
            budget=22000,
            normals="hybrid",
            angle=25.0,
        ),
    )
