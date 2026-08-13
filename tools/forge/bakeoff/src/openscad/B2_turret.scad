// B2 turret — architectural CSG + arrays
// Hollow round tower, flared plinth, 8 merlons, 3 non-piercing arrow slits,
// one arched doorway that tunnels through the wall.
// Front (the doorway) faces -Y in OpenSCAD == +Z after --zup.

include <dice_common.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 4;      // <= 90 fragments on a full circle
$fs = 0.06;   // ... and no chord longer than 0.06 table-units
// At r=1.6 the angular cap binds first: 90 segments, 0.112u chords. The arch
// circle (r 0.55) gets 57, the merlon arc 6. Same knob everywhere.

// --- dimensions -------------------------------------------------------------
R_OUT      = 1.60;   // shaft outer radius
WALL       = 0.35;   // wall thickness
R_IN       = R_OUT - WALL;
H_TOTAL    = 10.00;  // ground to merlon top
MERLON_H   = 0.70;
SHAFT_TOP  = H_TOTAL - MERLON_H;

R_PLINTH   = 2.10;   // base flare
PLINTH_H   = 1.20;   // flare is spent over the bottom 1.2
PLINTH_BAND = 0.18;  // straight molding band before the taper starts

N_MERLON   = 8;
MERLON_W   = 0.55;   // arc length at mid-wall
// mid-wall radius is where the 0.55 width is measured
MERLON_ANG = MERLON_W / ((R_IN + R_OUT) / 2) * 180 / PI;   // 22.2 deg

SLIT_W     = 0.15;
SLIT_H     = 0.90;
SLIT_D     = 0.12;   // recess depth -- 0.12 < 0.35 wall, so it cannot pierce
SLITS      = [[ 40, 3.10], [145, 5.40], [215, 4.25]];      // [angle, z]

DOOR_W     = 1.10;
DOOR_H     = 2.20;
DOOR_SPRING = DOOR_H - DOOR_W / 2;   // where the semicircular arch starts

// ---------------------------------------------------------------------------
// The whole shell is ONE revolved wall section. Points are (radius, height);
// revolving them gives the flare, the shaft and the uniform 0.35 wall for
// free, with no boolean at all.
// ---------------------------------------------------------------------------
WALL_SECTION = [
    [R_IN,     0],
    [R_PLINTH, 0],
    [R_PLINTH, PLINTH_BAND],   // molding band
    [R_OUT,    PLINTH_H],      // taper up to the shaft
    [R_OUT,    SHAFT_TOP],
    [R_IN,     SHAFT_TOP],
];

module shell() {
    rotate_extrude() polygon(WALL_SECTION);
}

// A merlon is just the wall rectangle revolved through a small angle, so it
// hugs the curve of the rim instead of being a flat cube stuck on it.
module merlon() {
    rotate([0, 0, -MERLON_ANG / 2])
        rotate_extrude(angle = MERLON_ANG)
            translate([R_IN, 0]) square([WALL, MERLON_H + EPS]);
}

// Same trick for the arrow slits: revolving the cutter means the recess floor
// follows the cylinder, so the depth is a true 0.12 everywhere across the slit
// (a flat cube cutter would be shallower at the edges).
module arrow_slit(angle, z) {
    slit_ang = SLIT_W / R_OUT * 180 / PI;
    rotate([0, 0, angle - slit_ang / 2])
        rotate_extrude(angle = slit_ang)
            translate([R_OUT - SLIT_D, z]) square([SLIT_D + 0.5, SLIT_H]);
}

// Arched opening, drawn once in 2D and pushed radially through the front wall.
module door_profile() {
    union() {
        translate([-DOOR_W / 2, 0]) square([DOOR_W, DOOR_SPRING]);
        translate([0, DOOR_SPRING]) circle(d = DOOR_W);
    }
}

// The cutter starts INSIDE the cavity (y = -1.0 is at radius 1.14 < R_IN) and
// runs out past the plinth, so it opens a tunnel through the near wall only --
// the far wall is untouched and the tunnel's return is visible from outside.
module doorway_cutter() {
    translate([0, -(R_IN - 0.25), 0])
        rotate([90, 0, 0])
            linear_extrude(height = R_PLINTH + 0.7) door_profile();
}

module turret() {
    difference() {
        union() {
            shell();
            translate([0, 0, SHAFT_TOP - EPS]) ring(N_MERLON) merlon();
        }
        for (s = SLITS) arrow_slit(s[0], s[1]);
        doorway_cutter();
    }
}

turret();
