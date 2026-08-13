"""B4 gnarl — a cut stump. The item SDFs are actually built for.

Two things fall out of the representation for free here:

* Roots are just more tapered capsules thrown into a smooth union.  A blend
  radius `k` is one number and there is no seam to clean up afterwards,
  because there was never a seam — the fields simply added up.
* Bark is `field - fbm(p)`.  Displacing a surface is displacing a number.
  Stretching the noise lookup in z (`_BARK_ANISO`) turns blobs into vertical
  fibres, which is what bark looks like.

The saw-cut top is subtracted with a small `k` so the rim rounds instead of
creasing, and the noise is applied to the bark ONLY, so the cut face stays
smooth like a real cut.  Colour follows the same field: distance to the
cutting sphere drives a bark->heartwood ramp, so the two-tone boundary IS the
geometric boundary and cannot drift out of register.
"""

import os
import sys

import numpy as np
from sdf import Z, difference, sdf3, slab, sphere, union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit
from sdfkit import fbm, tapered_capsule

HEIGHT = 2.60
SPREAD = 3.00  # base diameter across the root flares
N_ROOTS = 5
SEED = 4

BARK_AMPS = [0.032, 0.028, 0.020]  # sums to the 0.08 spec amplitude
BARK_SCALE = 0.36  # coarsest octave; finest is 0.36/4 = 0.09 > 0.07 spec floor
_BARK_ANISO = np.array([1.0, 1.0, 0.42])  # stretch the lookup -> vertical grain
LUMP_AMP, LUMP_SCALE = 0.065, 1.15  # low-frequency gnarl: silhouette, not bark

CUT_R = 2.20  # a big sphere makes a shallow dish
CUT_C = (0.06, -0.05, HEIGHT + CUT_R * 0.977)
BARK_RGB = (86, 62, 45)
WOOD_RGB = (196, 158, 106)

rng = np.random.default_rng(SEED)

# --- trunk: two tapered sections, blended so there is no waist ---------------
trunk = union(
    tapered_capsule((0, 0, -0.35), (0, 0, 1.15), 0.92, 0.66),
    tapered_capsule((0, 0, 1.15), (0, 0, 2.95), 0.66, 0.55),
    k=0.30,
)

# --- roots: irregular but seeded, so reruns are identical --------------------
parts = [trunk]
for i in range(N_ROOTS):
    a = 2 * np.pi * i / N_ROOTS + rng.uniform(-0.28, 0.28)
    reach = SPREAD / 2 * rng.uniform(0.86, 1.04)
    top = 0.50 + rng.uniform(-0.12, 0.22)
    parts.append(
        tapered_capsule(
            (0, 0, top),
            (reach * np.cos(a), reach * np.sin(a), -0.06),  # tips run into the ground
            0.40 * rng.uniform(0.85, 1.15),
            0.15,
        )
    )
    # a secondary toe off the side of every other root
    if i % 2 == 0:
        b = a + rng.uniform(0.35, 0.7)
        parts.append(
            tapered_capsule(
                (0.35 * np.cos(a), 0.35 * np.sin(a), 0.42),
                (reach * 0.82 * np.cos(b), reach * 0.82 * np.sin(b), -0.05),
                0.24,
                0.11,
            )
        )

body = union(*parts, k=0.34)


# --- bark: subtract fractal noise from the distance itself -------------------
@sdf3
def barked(inner):
    def f(p):
        relief = fbm(p * _BARK_ANISO, BARK_SCALE, amps=BARK_AMPS, seed=SEED)
        gnarl = LUMP_AMP * fbm(p, LUMP_SCALE, octaves=1, seed=SEED + 91)
        return inner(p) - (relief + gnarl).reshape((-1, 1))

    return f


cut = sphere(CUT_R, CUT_C)
stump = difference(barked(body), cut, k=0.05) & slab(z0=0.0)


def bark_to_wood(verts):
    """Ramp bark -> heartwood over the 0.05 rounding of the cut."""
    t = np.clip(1.0 - cut(np.asarray(verts)).reshape(-1) / 0.05, 0, 1)[:, None]
    return (np.array(BARK_RGB) + t * (np.array(WOOD_RGB) - np.array(BARK_RGB))).astype(np.uint8)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B4_gnarl.glb")
    r = SPREAD / 2 + 0.22
    kit.report(
        "B4",
        kit.bake(
            stump,
            os.path.abspath(out),
            bounds=((-r, -r, -0.031), (r, r, HEIGHT + 0.29)),
            step=0.022,
            budget=30000,
            normals="field",  # organic: the gradient is the right normal everywhere
            sparse=False,  # noise breaks the Lipschitz bound the skip test assumes
            vertex_color=bark_to_wood,
        ),
    )
