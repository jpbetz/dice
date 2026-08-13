// B7 boolean-storm — robustness + performance
// One 3-unit cube, minus 120 spheres, minus a rotated 3-cube that opens the
// sponge up. The sphere list is generated from harness/spheres.json by
// gen_spheres.py and is still in the harness's glTF (Y-up) frame; the axis
// change happens here, once, through gltf_to_scad().

include <dice_common.scad>
include <B7_spheres.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 6;
$fs = 0.05;
// Radii run 0.154 .. 0.448, so the chord cap binds throughout: 20 fragments on
// the smallest sphere, 56 on the largest -- every sphere gets the same 0.05
// facet size rather than the same facet COUNT, which is what keeps the sponge's
// surface uniform.

CUBE_EDGE = 3.0;
CUBE_CTR  = [0, 1.5, 0];     // glTF frame

CUT_EDGE  = 3.0;
CUT_CTR   = [1.8, 2.7, 0];   // glTF frame
CUT_YAW   = 25;              // degrees about glTF +Y == OpenSCAD +Z

difference() {
    translate(gltf_to_scad(CUBE_CTR)) cube(CUBE_EDGE, center = true);

    for (s = SPHERES)
        translate(gltf_to_scad([s[0], s[1], s[2]])) sphere(r = s[3]);

    translate(gltf_to_scad(CUT_CTR))
        rotate([0, 0, CUT_YAW])
            cube(CUT_EDGE, center = true);
}
