"""B2 turret — hollow crenellated tower, all of it CSG on the field.

Everything here is `|` and `-` on primitives; the only "array" is the
library's `circular_array`, which folds the query point into one angular
sector instead of instancing 8 copies, so the merlon cost is O(1).

Build frame is Z-up (see sdfkit); the doorway is authored pointing +X and
swung to build -Y, which becomes world +Z — the front.
"""

import os
import sys

import numpy as np
from sdf import Z, box, capped_cone, capped_cylinder, circular_array, union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit

TOTAL_H = 10.0
OUTER_R = 1.60
WALL = 0.35
INNER_R = OUTER_R - WALL  # 1.25
FLARE_R = 2.10
FLARE_H = 1.20
FLOOR_Z = 0.40

MERLON = (WALL, 0.55, 0.70)  # radial, tangential, vertical
MERLON_N = 8
WALL_TOP = TOTAL_H - MERLON[2]  # merlons finish at exactly TOTAL_H

SLITS = [(np.radians(25), 3.1), (np.radians(148), 5.3), (np.radians(268), 7.2)]
SLIT_W, SLIT_H, SLIT_D = 0.15, 0.90, 0.12

DOOR_W, DOOR_H = 1.10, 2.20
DOOR_DIR = -np.pi / 2  # +X -> -Y, i.e. world +Z

# --- shell: shaft + flared base, hollowed, with a floor slab left in ---------
shaft = capped_cylinder(-Z * 0.001, Z * WALL_TOP, OUTER_R)
flare = capped_cone((0, 0, 0), (0, 0, FLARE_H), FLARE_R, OUTER_R)
void = capped_cylinder(Z * FLOOR_Z, Z * (TOTAL_H + 1), INNER_R)
tower = (shaft | flare) - void

# --- crenellations ----------------------------------------------------------
merlon = box(MERLON, center=(0, 0, WALL_TOP + MERLON[2] / 2))
tower = tower | circular_array(merlon, MERLON_N, offset=OUTER_R - WALL / 2)

# --- arrow slits: blind recesses, 0.12 into a 0.35 wall ---------------------
for angle, z in SLITS:
    recess = box(
        (2 * SLIT_D, SLIT_W, SLIT_H),
        center=(OUTER_R, 0, z),  # spans [R-D, R+D]: 0.12 deep into a 0.35 wall
    )
    tower = tower - recess.rotate(angle, Z)

# --- arched doorway: a real tunnel through the wall -------------------------
jamb_x0, jamb_x1 = INNER_R - 0.15, FLARE_R + 0.25  # clears the flare at z=0
arch_z = DOOR_H - DOOR_W / 2
doorway = box(
    (jamb_x1 - jamb_x0, DOOR_W, arch_z), center=((jamb_x0 + jamb_x1) / 2, 0, arch_z / 2)
) | capped_cylinder((jamb_x0, 0, arch_z), (jamb_x1, 0, arch_z), DOOR_W / 2)
tower = tower - doorway.rotate(DOOR_DIR, Z)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B2_turret.glb")
    r = FLARE_R + 0.05
    kit.report(
        "B2",
        kit.bake(
            tower,
            os.path.abspath(out),
            bounds=((-r, -r, -0.041), (r, r, TOTAL_H + 0.049)),
            step=0.03,
            budget=15000,
            normals="hybrid",
            angle=25.0,
        ),
    )
