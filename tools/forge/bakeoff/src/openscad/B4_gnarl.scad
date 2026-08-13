// B4 gnarl — organic
// A gnarled stump: revolved profile + 5 root flares + 3-octave value noise,
// emitted as ONE polyhedron(). No booleans anywhere, so there is no hard CSG
// edge to give the silhouette away.
//
// Why a generated polyhedron and not surface() or a blob of hulls:
//   * surface() reads a heightmap, which can only make a terrain patch -- it
//     cannot close a solid of revolution.
//   * hull-chained spheres give smooth blends but no bark: hull() output is
//     convex per link, so high-frequency displacement is impossible.
// The noise below is written in OpenSCAD's own expression language (functions,
// let, list comprehensions), so the geometry really is assembled by the tool.
// It is a hash-based VALUE noise -- fully deterministic, no rands(), and the
// lattice wraps in theta so there is no seam at 0/360.

include <dice_common.scad>

// --- density: set ONCE ------------------------------------------------------
$fa = 6;
$fs = 0.05;
// (nothing in this file is a curved primitive; the mesh density is NT x NV.)

NT = 120;   // samples around -> 0.052u spacing at r=1.0
NV = 88;    // samples up the profile

// --- dimensions -------------------------------------------------------------
H         = 2.60;   // overall height
R_FOOT    = 1.02;   // trunk radius at the ground, before root flares
R_TOP     = 0.80;   // radius at the cut
SHOULDER  = 0.16;   // radius of the roll-over from bark to cut face
DISH      = 0.10;   // how far the cut face sags in the middle

N_ROOT    = 5;      // root flares (spec wants 4-6)
ROOT_AMP  = 0.48;   // 1.02 + 0.48 = 1.50 -> 3.0 base spread
ROOT_H    = 1.15;   // flares are spent by this height
ROOT_PHASE = 24;    // fixed -> deterministic

GNARL_AMP = 0.14;   // low-frequency lumps that break the surface of revolution
BARK_AMP  = 0.08;   // spec: bark relief amplitude ~0.08

SA = 0.80;          // profile parameter: side ends here
SB = 0.90;          // shoulder ends here, cut face runs SB..1

// ===========================================================================
// value noise, written in OpenSCAD
// ===========================================================================
function frac(x) = x - floor(x);

// Deterministic 2D hash. sin() is in DEGREES here, which is fine for a hash:
// all that matters is that it is a fixed, well-spread, reproducible function.
function hash2(i, j) = frac(sin(i * 269.5 + j * 183.3) * 43758.5453);

// One octave. `lt` is the lattice period around the circumference, so wrapping
// i modulo lt is what keeps the seam at theta = 0 invisible.
function vnoise(u, w, lt) =
    let (i0 = floor(u), j0 = floor(w),
         su = smoothstep(frac(u)), sw = smoothstep(frac(w)),
         ia = ((i0 % lt) + lt) % lt,
         ib = (((i0 + 1) % lt) + lt) % lt)
    2 * lerp(lerp(hash2(ia, j0),     hash2(ib, j0),     su),
             lerp(hash2(ia, j0 + 1), hash2(ib, j0 + 1), su), sw) - 1;

// Slow lumps: one cell is ~1.0u across, so this warps the silhouette.
function gnarl(th, s) = vnoise(th / 360 * 6, s * 3 + 11, 6);

// Bark: two octaves at 0.31u and 0.16u -- both above the 0.07u visible-feature
// floor, and both sampled >3x by the NT=120 grid. The first pass is a DOMAIN
// WARP: plain value noise on a square lattice gives visibly axis-aligned
// ridges, and pushing the sample point around with a slower noise breaks that
// up into something that reads as bark. The warp is itself periodic in theta
// (its lattice period divides evenly), so the seam at 0/360 still closes.
function bark(th, s) =
    let (wu = vnoise(th / 360 * 8, s * 4 + 3,  8),
         ws = vnoise(th / 360 * 8, s * 4 + 51, 8))
      0.65 * vnoise(th / 360 * 20 + 2.2 * wu, s * 9  + 31 + 1.4 * ws, 20)
    + 0.35 * vnoise(th / 360 * 40 + 4.4 * wu, s * 18 + 67 + 2.8 * ws, 40);

// ===========================================================================
// profile (radius, height) as a function of s in [0,1]
// ===========================================================================
function prof_r(s) =
      s <= SA ? R_TOP + (R_FOOT - R_TOP) * pow(1 - s / SA, 2.6)
    : s <= SB ? (R_TOP - SHOULDER) + SHOULDER * cos(90 * (s - SA) / (SB - SA))
    :           (R_TOP - SHOULDER) * (1 - (s - SB) / (1 - SB));

function prof_z(s) =
      s <= SA ? (H - SHOULDER) * (s / SA)
    : s <= SB ? (H - SHOULDER) + SHOULDER * sin(90 * (s - SA) / (SB - SA))
    :           H - DISH * pow(1 - prof_r(s) / (R_TOP - SHOULDER), 1.7);

// Outward normal of the profile curve, by central difference. [dz, -dr] is the
// outward side for this curve: up-and-out on the bark, up-and-in on the cut.
function prof_n(s) =
    let (h  = 0.002,
         a  = max(0, s - h), b = min(1, s + h),
         dr = prof_r(b) - prof_r(a),
         dz = prof_z(b) - prof_z(a),
         L  = max(1e-9, norm([dr, dz])))
    [dz / L, -dr / L];

// Root flares: a purely radial swell, cos^p lobes that die out with height.
function root_flare(th, z) =
    ROOT_AMP
    * pow(max(0, cos(N_ROOT * th + ROOT_PHASE)), 1.8)
    * pow(max(0, 1 - z / ROOT_H), 2.2);

// Noise fades to nothing at the apex (so the single apex vertex cannot pucker)
// and its VERTICAL part fades to nothing at the ground (so the base ring stays
// exactly on z = 0 and the stump really stands on the table).
function cap_fade(s)    = s <= SB ? 1 : 1 - smoothstep((s - SB) / (1 - SB));
function ground_fade(s) = smoothstep(min(1, s / 0.06));

function vert(i, j) =
    let (th = i * 360 / NT,
         s  = j / NV,
         pr = prof_r(s), pz = prof_z(s), n = prof_n(s),
         d  = cap_fade(s) * (GNARL_AMP * gnarl(th, s) + BARK_AMP * bark(th, s)),
         rr = pr + n[0] * d + root_flare(th, pz),
         zz = pz + n[1] * d * ground_fade(s))
    [rr * cos(th), rr * sin(th), zz];

// ===========================================================================
// mesh assembly
// ===========================================================================
// index 0            = centre of the flat bottom
// 1 + j*NT + i       = ring j (j = 0..NV-1), sample i
// 1 + NV*NT          = apex of the cut face
I_BOT = 0;
function gi(j, i) = 1 + j * NT + (i % NT);
I_TOP = 1 + NV * NT;

POINTS = concat(
    [[0, 0, 0]],
    [for (j = [0 : NV - 1], i = [0 : NT - 1]) vert(i, j)],
    [[0, 0, prof_z(1)]]
);

// OpenSCAD wants each face wound CLOCKWISE as seen from OUTSIDE -- the
// opposite of the usual right-hand-rule convention, and the single easiest
// way to get a polyhedron() silently inside-out. Verified against the
// exported volume, which is positive.
FACES = concat(
    // flat bottom, fanned from the centre
    [for (i = [0 : NT - 1]) [I_BOT, gi(0, i), gi(0, i + 1)]],
    // sides, two triangles per quad (the quads are non-planar once displaced,
    // so they are split here rather than left to the importer)
    [for (j = [0 : NV - 2], i = [0 : NT - 1])
        each [[gi(j, i), gi(j + 1, i), gi(j + 1, i + 1)],
              [gi(j, i), gi(j + 1, i + 1), gi(j, i + 1)]]],
    // cut face, fanned to the apex
    [for (i = [0 : NT - 1]) [gi(NV - 1, i + 1), gi(NV - 1, i), I_TOP]]
);

polyhedron(points = POINTS, faces = FACES, convexity = 8);
