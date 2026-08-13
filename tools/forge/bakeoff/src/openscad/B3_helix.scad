// B3 helix-ramp — sweeps/lofts
// Central column + an open U-channel chute swept along a helix.
//
// OpenSCAD HAS NO SWEEP. Two routes exist; this file takes the second.
//
//  (a) linear_extrude(twist=): a twisted extrusion of an off-axis profile IS a
//      helical sweep -- but the profile it sweeps lies in the HORIZONTAL plane
//      and is only sheared into place, so a shape's "vertical" size comes out
//      as tangential_extent * pitch / (2*PI*r). That factor depends on r, so a
//      constant-thickness U-channel is impossible: with the floor slab tuned to
//      0.12 thick at mid-radius it measures 0.196 at the inner edge and 0.087
//      at the outer one, and the two side walls end up different heights.
//      Verified by hand before discarding it. Fine for a plain ramp, wrong here.
//
//  (b) hull() between consecutive stations of the profile -- the idiomatic
//      OpenSCAD substitute for a sweep. hull() is CONVEX, so the U must first
//      be split into convex pieces (floor + two walls) and each piece swept on
//      its own, or the hull fills the channel in. That trap is the whole trick.

include <dice_common.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 4;
$fs = 0.06;
// Only the column is a curved primitive here; the chute's smoothness is set by
// N_PER_TURN below, which is the sweep's own resolution knob, not $fa/$fs.

// --- dimensions -------------------------------------------------------------
COL_R      = 0.50;
COL_H      = 8.00;

HELIX_R    = 1.55;   // to the CENTRE of the channel floor
PITCH      = 2.60;   // rise per turn
TURNS      = 2.25;
FLOOR_W    = 1.20;
WALL_H     = 0.35;   // above the floor's running surface
THICK      = 0.12;

Z_TOP      = 7.60;   // running surface at the top of the chute
DROP       = PITCH * TURNS;          // 5.85
A_END      = 360 * TURNS;            // 810 deg

N_PER_TURN = 64;                     // sweep stations per turn
N_STEP     = ceil(N_PER_TURN * TURNS);
SLICE_T    = 0.02;                   // station plate thickness: consecutive
                                     // hulls overlap by this, so the union is
                                     // never a coplanar-face special case.

// Profile rectangles in the local (u = radial offset, w = height above the
// running surface) frame. The walls deliberately start at w = -THICK so they
// OVERLAP the floor slab instead of merely touching it.
FLOOR    = [-FLOOR_W / 2,          -THICK, FLOOR_W, THICK];
WALL_IN  = [-FLOOR_W / 2,          -THICK, THICK,   THICK + WALL_H];
WALL_OUT = [ FLOOR_W / 2 - THICK,  -THICK, THICK,   THICK + WALL_H];

function station_a(i) = A_END * i / N_STEP;
function station_z(i) = Z_TOP - DROP * i / N_STEP;

// One profile rectangle, as a thin plate standing in the vertical plane that
// contains the helix radius at angle `a`.
module station(rect, a, z) {
    rotate([0, 0, a])
        translate([HELIX_R + rect[0], -SLICE_T / 2, z + rect[1]])
            cube([rect[2], SLICE_T, rect[3]]);
}

// Sweep one convex rectangle the whole way down.
module sweep_rect(rect) {
    for (i = [0 : N_STEP - 1])
        hull() {
            station(rect, station_a(i),     station_z(i));
            station(rect, station_a(i + 1), station_z(i + 1));
        }
}

// Planar end cut. A true half-space would also slice the chute where it passes
// the same plane on its OTHER turns, so the cutter is bounded in z to the one
// turn we mean. `back` chooses which side of the plane is removed.
module end_cut(a, z, back) {
    big = 8;
    rotate([0, 0, a])
        translate([-0.2, back ? -big : 0, z - 0.62])
            cube([big, big, 1.24]);
}

module chute() {
    difference() {
        union() {
            sweep_rect(FLOOR);
            sweep_rect(WALL_IN);
            sweep_rect(WALL_OUT);
        }
        end_cut(0,     Z_TOP,        true);
        end_cut(A_END, Z_TOP - DROP, false);
    }
}

union() {
    cylinder(r = COL_R, h = COL_H);
    chute();
}
