// B6 plaque — text on a curved surface
// A wall plaque whose face is bowed on a vertical cylinder of radius 4, with a
// raised border and "DICE" engraved 0.05 into the bow.
//
// The whole model is built out of one primitive idea: a CYLINDRICAL SHELL
// about a vertical axis parked 4 units behind the face. Front face, back face,
// raised frame and engraving floor are all just different radius bands of that
// same shell, so everything follows the bow automatically and the engraving
// depth is a true 0.05 measured along the surface normal.
//
// The front faces -Y in OpenSCAD, which is +Z after --zup. Text drawn in the
// XY plane and stood up with rotate([90,0,0]) reads the right way round from
// there (an observer on -Y looking at +Y has +X on their right), so no mirror
// is needed -- worth checking rather than assuming.

include <dice_common.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 1.5;
$fs = 0.02;
// The bow is r=4, so the angular cap binds: 240 fragments on the full circle,
// 25 of them across the 2.6-wide plaque. Letter curves (r ~ 0.1) get their
// resolution from the same $fs and come out at ~31 segments per full circle.

// --- dimensions -------------------------------------------------------------
W        = 2.60;   // width (chord)
H        = 1.80;   // height
TH       = 0.25;   // thickness
CR       = 4.00;   // bow radius of the FRONT face
FRAME_W  = 0.18;   // border frame width
FRAME_R  = 0.06;   // how far the frame stands proud of the face
TEXT_D   = 0.05;   // engraving depth
TEXT_SZ  = 0.54;   // leaves ~0.25u clear inside the frame
FONT     = "DejaVu Sans:style=Bold";

CY = CR;           // bow centre, so the face passes through the origin

// Deepest point of the back face, used to centre the plaque in depth.
Y_BACK  = CY - sqrt(pow(CR - TH, 2) - pow(W / 2, 2));
Y_FRONT = -FRAME_R;

// A band of the bow shell between two radii. It runs OVER-HEIGHT on purpose:
// every trimming plane in this model must be owned by exactly one operand.
// Where two operands ended on the same plane (band top at z=1.8 and clip box
// top at z=1.8), Manifold emitted 53 zero-area triangles along that seam and
// the STL came out un-watertight -- with Status: NoError and a picture that
// looked perfect.
module bow_band(r_in, r_out) {
    translate([0, CY, -1])
        difference() {
            cylinder(r = r_out, h = H + 2);
            translate([0, 0, -EPS]) cylinder(r = r_in, h = H + 2 + 2 * EPS);
        }
}

// Clip to a rectangle in the face plane (x = width, z = height) AND to the
// front half of the bow. The y clamp is not optional: a cylindrical shell
// sliced by |x| <= 1.3 has TWO branches, the front arc near y = 0 and the back
// arc near y = 8, and clipping in x/z alone quietly keeps both. That is what a
// stray second component in the export means here.
module face_rect(w, h, z0 = 0) {
    intersection() {
        children();
        translate([-w / 2, -1, z0]) cube([w, 2, h]);
    }
}

// A 2D shape in the face plane, pushed straight through the plaque along -Y.
// Intersecting the result with a bow band is what "projects" it onto the bow.
module through_face() {
    translate([0, 1.0, 0]) rotate([90, 0, 0]) linear_extrude(height = 2.0)
        children();
}

// Only the INNER edge of this ring is real geometry; the outer edge is left
// oversized so that face_rect() alone owns the plaque's silhouette.
module border_ring_2d() {
    difference() {
        translate([-W / 2 - 0.1, -0.1]) square([W + 0.2, H + 0.2]);
        translate([-W / 2 + FRAME_W, FRAME_W]) square([W - 2 * FRAME_W, H - 2 * FRAME_W]);
    }
}

module plaque() {
    difference() {
        union() {
            // body: front face at CR, back face at CR - TH -> uniform 0.25 wall
            face_rect(W, H) bow_band(CR - TH, CR);
            // raised border: a band standing proud of the face, clipped to the
            // border ring. It starts EPS inside the face so the union overlaps
            // instead of merely touching (touching leaves zero-area slivers,
            // which the glTF converter then strips, un-sealing the mesh).
            intersection() {
                face_rect(W, H) bow_band(CR - EPS, CR + FRAME_R);
                through_face() border_ring_2d();
            }
        }
        // engraving: only the outermost TEXT_D of the face, inside the letters
        intersection() {
            bow_band(CR - TEXT_D, CR + EPS);
            translate([0, 0, H / 2]) through_face()
                text(text = "DICE", size = TEXT_SZ, font = FONT,
                     halign = "center", valign = "center");
        }
    }
}

// centre the depth on the origin; the model already stands on z = 0
translate([0, -(Y_FRONT + Y_BACK) / 2, 0]) plaque();
