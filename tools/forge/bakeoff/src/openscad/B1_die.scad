// B1 chamfered-die — hard-surface precision
// Cube edge 2.0, TRUE rounded fillet r 0.10, 21 spherical pip dents.
// Stands on z=0 (-> y=0 after the --zup conversion).

include <dice_common.scad>

// --- density: set ONCE, see dice_common.scad -------------------------------
$fa = 6;      // <= 60 fragments on a full circle
$fs = 0.045;  // ... and no chord longer than 0.045 table-units
// r=0.10 fillet -> 14 fragments (0.045u facets, under the 0.07u visible-
// feature floor); r=0.22 pip -> 31 fragments, so the dent rim is a 31-gon
// ~14 px across at the game camera. Both fall out of the SAME chord budget,
// which is the point: one knob, uniform surface density. 6770 tris.

// --- dimensions ------------------------------------------------------------
DIE        = 2.00;   // cube edge, fillet included
FILLET     = 0.10;   // rounded-edge radius
PIP_R      = 0.22;   // dent sphere radius
PIP_DEPTH  = 0.08;   // how far the sphere bites into the face
PIP_STEP   = 0.42;   // corner-pip offset from the face centre

// A sphere of radius PIP_R whose centre sits this far OUTSIDE the face leaves
// a dent exactly PIP_DEPTH deep, with a rim radius of
//   sqrt(PIP_R^2 - STANDOFF^2) = 0.170  -> comfortably inside the flat area
//   (the flat stops at DIE/2 - FILLET = 0.90, pips reach 0.42+0.17 = 0.59).
STANDOFF   = PIP_R - PIP_DEPTH;          // 0.14
PIP_C      = DIE / 2 + STANDOFF;         // 1.14

// --- pip patterns, in face-local (u,v) units of PIP_STEP -------------------
function pip_layout(n) =
      n == 1 ? [[0, 0]]
    : n == 2 ? [[-1, -1], [1, 1]]
    : n == 3 ? [[-1, -1], [0, 0], [1, 1]]
    : n == 4 ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : n == 5 ? [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]]
    :          [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]];

// Which face carries which number. Each rotation maps the local +Z face onto
// a world face; opposite faces sum to 7 (1-6, 2-5, 3-4) as a d6 requires.
FACES = [
    [1, [   0,   0, 0]],   // +Z
    [6, [ 180,   0, 0]],   // -Z
    [2, [   0,  90, 0]],   // +X
    [5, [   0, -90, 0]],   // -X
    [3, [ -90,   0, 0]],   // +Y
    [4, [  90,   0, 0]],   // -Y
];

module pip_cutters() {
    for (f = FACES)
        rotate(f[1])
            for (uv = pip_layout(f[0]))
                translate([uv[0] * PIP_STEP, uv[1] * PIP_STEP, PIP_C])
                    sphere(PIP_R);
}

module die() {
    difference() {
        rounded_box([DIE, DIE, DIE], FILLET);
        pip_cutters();
    }
}

translate([0, 0, DIE / 2]) die();
