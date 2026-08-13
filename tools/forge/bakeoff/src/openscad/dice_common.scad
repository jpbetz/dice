// dice_common.scad — shared helpers for the mesh-tool bake-off (OpenSCAD entry)
//
// ============================================================================
// AXIS CONVENTION  (read this before editing any item)
// ============================================================================
// OpenSCAD is Z-up. The bake-off wants glTF Y-up, so every STL is converted
// with `stl2glb.py --zup`, which rotates -90 deg about X:
//
//        (x, y, z)_scad  ->  (x, z, -y)_gltf
//
// Consequences that bite you if you forget them:
//   * "standing on y=0"        =>  model must have min z == 0 in OpenSCAD.
//   * "front toward +Z (gltf)" =>  the front must face -Y in OpenSCAD.
//   * "rotate about Y (gltf)"  =>  rotate([0,0,a]) in OpenSCAD (same sign).
// Anything already given in glTF coords (e.g. B7's sphere list) is mapped with
// gltf_to_scad() below, never by hand.
//
// ============================================================================
// DENSITY POLICY  (the single biggest OpenSCAD footgun)
// ============================================================================
// Fragment count for a circle of radius r is
//        n = max(5, ceil(min(360/$fa, 2*PI*r/$fs)))       (when $fn == 0)
// i.e. $fa is an ANGULAR cap and $fs a CHORD-LENGTH cap, and the SMALLER wins.
//
// This file deliberately does NOT set $fa/$fs/$fn. Each item file sets them
// exactly ONCE, at the top, in a clearly-marked block. Rationale:
//   * $fa/$fs/$fn are dynamically scoped specials — setting them once at file
//     scope gives every primitive in the model the SAME chord budget, so the
//     tessellation is uniform instead of drifting per primitive.
//   * OpenSCAD variables are last-assignment-wins for the WHOLE scope, so a
//     stray `$fn = 12;` further down silently re-tessellates the entire file,
//     including code above it. Never sprinkle $fn on primitives.
// Where an item genuinely needs a different budget for one sub-part, it passes
// $fn as a *named constant* on that call and says why in a comment.

// ---------------------------------------------------------------------------
// small numeric helpers
// ---------------------------------------------------------------------------
EPS = 0.001;                       // sliver used to make cuts unambiguous

function gltf_to_scad(p) = [p[0], -p[2], p[1]];

function lerp(a, b, t) = a + (b - a) * t;
function smoothstep(t) = t * t * (3 - 2 * t);

// Point on a helix: radius r, `pitch` rise per full turn, angle a in degrees.
function helix_point(a, r, pitch, z0 = 0) =
    [r * cos(a), r * sin(a), z0 + pitch * a / 360];

// ---------------------------------------------------------------------------
// rounded_box — a TRUE fillet, cheaply
// ---------------------------------------------------------------------------
// minkowski(){ cube(); sphere(r); } is the textbook fillet, but for a *convex*
// body it is exactly equal to the convex hull of spheres at the body's
// vertices — and the hull is ~30x cheaper (measured; see B1 notes). Same
// geometry, so this is a real rounded fillet, not a chamfer.
module rounded_box(size, r, center = true) {
    off = [size[0] / 2 - r, size[1] / 2 - r, size[2] / 2 - r];
    translate(center ? [0, 0, 0] : size / 2)
        hull()
            for (sx = [-1, 1], sy = [-1, 1], sz = [-1, 1])
                translate([sx * off[0], sy * off[1], sz * off[2]]) sphere(r);
}

// ---------------------------------------------------------------------------
// sweeps by hull chain
// ---------------------------------------------------------------------------
// OpenSCAD has no sweep operator. The idiomatic substitute is to hull()
// consecutive stations of a moving profile. hull() is CONVEX, so a concave
// profile (a U-channel, say) must be decomposed into convex pieces first and
// each piece swept on its own — see B3.

// A tapered round strut between two points. Sphere ends mean that a chain or
// a fork of these unions with no open seam and a rounded blend at the joint.
module strut(p0, r0, p1, r1) {
    hull() {
        translate(p0) sphere(r0);
        translate(p1) sphere(r1);
    }
}

// Chain of struts through a polyline, radius interpolated end to end.
module strut_chain(pts, r0, r1) {
    n = len(pts) - 1;
    for (i = [0 : n - 1])
        strut(pts[i],     lerp(r0, r1, i / n),
              pts[i + 1], lerp(r0, r1, (i + 1) / n));
}

// ---------------------------------------------------------------------------
// half-space cutter: everything on the +normal side of a plane through `p`.
// Used for clean planar end cuts (B3) — `big` must exceed the model.
// ---------------------------------------------------------------------------
module halfspace(p, normal_euler, big = 40) {
    translate(p) rotate(normal_euler) translate([0, 0, 0])
        translate([-big / 2, -big / 2, 0]) cube([big, big, big]);
}

// ---------------------------------------------------------------------------
// radial array — n copies about Z, optionally phase-shifted.
// ---------------------------------------------------------------------------
module ring(n, phase = 0) {
    for (i = [0 : n - 1]) rotate([0, 0, phase + i * 360 / n]) children();
}
