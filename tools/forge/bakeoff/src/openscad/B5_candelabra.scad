// B5 candelabra — recursion / grammar power
// base -> trunk -> 3 arms -> 2 arms each -> 6 sconces, radii x0.75 per
// generation. One recursive module, one arc function; the shape of the whole
// thing lives in six constants.

include <dice_common.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 8;
$fs = 0.035;
// Chord-driven, so a thick limb gets more fragments than a thin one and the
// facet SIZE stays constant up the tree: r=0.22 -> 39 fragments, r=0.093 -> 16.

// --- dimensions -------------------------------------------------------------
BASE_R    = 0.70;
BASE_H    = 0.20;
TRUNK_R   = 0.22;
TRUNK_LEN = 1.20;
TAPER     = 0.75;   // radius multiplier per generation

N_ARM_1   = 3;      // trunk splits into 3
N_ARM_2   = 2;      // each arm splits into 2

// Arms are circular arcs specified by their tilt from vertical at each end:
// they leave the fork at a wide spread and stand back up as they run out.
G1_TILT   = [42, 10];  G1_LEN = 0.76;   // spread 42 deg, in the 35-45 band
G2_TILT   = [44,  8];  G2_LEN = 0.97;
AZ_SPLIT  = 54;     // half-angle of the second fork, chosen so the six pans
                    // land ~60 deg apart on a ~0.65 circle and do not touch

N_SEG     = 8;      // struts per arc
JOINT     = 1.18;   // fork balls are this much fatter than the limb, which is
                    // what turns a hard V into a blended junction

PAN_R     = 0.28;   // drip-pan radius
PAN_H     = 0.09;
CUP_R     = 0.15;   // must be >= the dish cutter's bottom radius, see sconce()
CUP_H     = 0.26;
TRUNK_Z0  = 0.24;   // high enough that the trunk's own end-sphere (r 0.22)
                    // stays above z=0 instead of poking out under the base

// ===========================================================================
// arc geometry: tilt varies linearly with arc length, i.e. a circular arc,
// integrated in closed form. `s` is distance along the arc.
// ===========================================================================
function arc_pt(p0, azim, t0, t1, len, s) =
    let (k  = (t1 - t0) / len,                        // deg of tilt per unit
         dh = abs(k) < 1e-9 ? s * sin(t0)
                            : (cos(t0) - cos(t0 + k * s)) * 180 / (PI * k),
         dz = abs(k) < 1e-9 ? s * cos(t0)
                            : (sin(t0 + k * s) - sin(t0)) * 180 / (PI * k))
    p0 + [dh * cos(azim), dh * sin(azim), dz];

function arc_polyline(p0, azim, t0, t1, len, n) =
    [for (i = [0 : n]) arc_pt(p0, azim, t0, t1, len, len * i / n)];

// ===========================================================================
// the grammar
// ===========================================================================
module limb(p0, azim, tilt, len, rad, gen) {
    tip = arc_pt(p0, azim, tilt[0], tilt[1], len, len);
    r1  = rad * TAPER;

    strut_chain(arc_polyline(p0, azim, tilt[0], tilt[1], len, N_SEG), rad, r1);

    if (gen < 2) {
        // a ball at the fork, fatter than either limb, so the union reads as a
        // blend instead of a seam
        translate(tip) sphere(r1 * JOINT);

        if (gen == 0)
            for (i = [0 : N_ARM_1 - 1])
                limb(tip, i * 360 / N_ARM_1, G1_TILT, G1_LEN, r1, 1);
        else
            for (i = [0 : N_ARM_2 - 1])
                limb(tip, azim + (i * 2 - 1) * AZ_SPLIT, G2_TILT, G2_LEN, r1, 2);
    } else {
        translate(tip - [0, 0, 0.04]) sconce();
    }
}

// Drip-pan plus candle cup, level however the arm arrives.
// ORDER MATTERS: hollow the pan and hollow the cup SEPARATELY, then union.
// Differencing the dish out of (pan + cup) instead cuts straight through the
// cup, because the dish cutter is a solid cone wider than the cup -- the model
// still looks right in a render and still exports, but the cup is sliced into
// a floating ring and the genus jumps. Caught by the genus/Euler readout, not
// by eye.
module sconce() {
    union() {
        difference() {
            cylinder(r1 = PAN_R * 0.55, r2 = PAN_R, h = PAN_H);
            translate([0, 0, 0.045])
                cylinder(r1 = CUP_R - 0.01, r2 = PAN_R - 0.03, h = PAN_H);
        }
        difference() {
            cylinder(r = CUP_R, h = CUP_H);
            translate([0, 0, 0.06]) cylinder(r = CUP_R - 0.04, h = CUP_H);
        }
    }
}

module base() {
    rotate_extrude()
        polygon([[0, 0], [BASE_R, 0], [BASE_R, 0.05], [BASE_R - 0.09, 0.11],
                 [0.30, 0.13], [0.26, BASE_H], [0, BASE_H]]);
}

union() {
    base();
    limb([0, 0, TRUNK_Z0], 0, [0, 0], TRUNK_LEN, TRUNK_R, 0);
}

echo(str("gen-2 tip radius / height check: ",
         arc_pt(arc_pt([0, 0, TRUNK_Z0], 0, 0, 0, TRUNK_LEN, TRUNK_LEN),
                0, G1_TILT[0], G1_TILT[1], G1_LEN, G1_LEN)));
