"""sdfkit — shared helpers for the SDF/marching-cubes bake-off entries.

FRAME.  Models are authored in the `sdf` library's native Z-up frame — its
cylinders, cones, extrusions, twists and circular arrays are all built about
Z, so fighting that would only add noise.  `bake()` rotates -90 deg about X on
the way out, which is the only frame conversion in the whole kit:

    build +Z  ->  world +Y   (up)
    build -Y  ->  world +Z   (front)
    build +X  ->  world +X

`yup()` / `zup()` convert individual points between the two.

PIPELINE.  `bake()` is the one call a model script makes.  It runs the field
through the mesher, welds, re-frames, sits the result on y=0, optionally
decimates to a triangle budget, attaches normals (field-gradient or
crease-split), paints vertex colours and writes the GLB.
"""

import time

import numpy as np
import trimesh
from sdf import sdf3
from sdf.core import generate

# ---------------------------------------------------------------- frame ----

_ZUP_TO_YUP = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])


def zup(x, y, z):
    """A world-frame (Y-up) point, expressed in the build frame."""
    return (x, -z, y)


def yup(x, y, z):
    """A build-frame (Z-up) point, expressed in the world frame."""
    return (x, z, -y)


# --------------------------------------------------------------- meshing ---


def mesh_field(f, bounds, step, sparse=True):
    """Marching-cubes `f` over `bounds` at `step`, welded into a Trimesh."""
    pts = np.asarray(generate(f, step=step, bounds=bounds, sparse=sparse, verbose=False))
    m = trimesh.Trimesh(vertices=pts, faces=np.arange(len(pts)).reshape(-1, 3), process=True)
    m.merge_vertices()
    m.update_faces(m.nondegenerate_faces())
    m.update_faces(m.unique_faces())
    m.remove_unreferenced_vertices()
    if m.volume < 0:  # skimage winding is inward for our sign convention
        m.invert()
    return m


def grad(f, p, h=1e-4):
    """Central-difference gradient of the field at each point."""
    p = np.asarray(p, dtype=float)
    g = np.empty_like(p)
    for axis in range(3):
        d = np.zeros(3)
        d[axis] = h
        g[:, axis] = (f(p + d).reshape(-1) - f(p - d).reshape(-1)) / (2 * h)
    return g


def field_normals(f, verts, h=1e-4):
    """Normals straight from the field gradient.

    Marching cubes gives blocky area-weighted normals on low-curvature
    regions; the field knows the true surface direction at any point, so for
    organic models we just ask it.
    """
    g = grad(f, verts, h)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    return g / np.where(n < 1e-12, 1.0, n)


def snap_to_surface(f, verts, iters=2, clamp=None):
    """Newton-project vertices back onto the f=0 isosurface.

    Quadric decimation minimises a quadric, not the real surface, so it
    drifts: flat faces stop being flat (which shows up as shading streaks)
    and pip rims bulge.  The field is still sitting right there, so we just
    ask it where the surface actually is.  Biggest quality win in the kit,
    and it is only possible BECAUSE the model is a field.
    """
    p = np.asarray(verts, dtype=float).copy()
    for _ in range(iters):
        d = f(p).reshape(-1)
        g = grad(f, p)
        n2 = (g * g).sum(axis=1)
        step = g * (d / np.where(n2 < 1e-12, 1.0, n2))[:, None]
        if clamp is not None:
            mag = np.linalg.norm(step, axis=1, keepdims=True)
            step = step * np.minimum(1.0, clamp / np.maximum(mag, 1e-12))
        p -= step
    return p


# ------------------------------------------------------------- colouring ---


def _paint_components(smooth, base_face_rgb):
    """Colour each crease-split patch by the majority colour of its faces."""
    comps = smooth.metadata.get("original_components")
    order = np.hstack([np.asarray(c, dtype=np.int64).reshape(-1) for c in comps])
    face_rgb = base_face_rgb[order]
    colors = np.zeros((len(smooth.vertices), 4), dtype=np.uint8)
    i = 0
    for c in comps:
        n = len(np.asarray(c).reshape(-1))
        block = face_rgb[i : i + n]
        # majority vote so a stray face can't recolour a whole patch
        uniq, counts = np.unique(block, axis=0, return_counts=True)
        rgb = uniq[counts.argmax()]
        v = np.unique(smooth.faces[i : i + n])
        colors[v] = list(rgb) + [255]
        i += n
    smooth.visual = trimesh.visual.ColorVisuals(smooth, vertex_colors=colors)


# ------------------------------------------------------------------ bake ---


def _rung(m, field, target, aggression, clamp):
    """One decimation step, cleaned up and re-projected onto the surface."""
    d = m.simplify_quadric_decimation(face_count=target, aggression=aggression)
    d.merge_vertices()
    d.update_faces(d.nondegenerate_faces())
    d.update_faces(d.unique_faces())
    d.remove_unreferenced_vertices()
    d.vertices = snap_to_surface(field, d.vertices, clamp=clamp)
    return d


def bake(
    field,
    path,
    bounds,
    step,
    budget=None,
    normals="crease",
    angle=30.0,
    aggression=7,
    ladder=3.0,
    hybrid_tol=32.0,
    sparse=True,
    face_color=None,
    vertex_color=None,
    center_xz=False,
):
    """Mesh -> reframe -> decimate -> shade -> GLB.  Returns a stats dict.

    normals   "crease" = angle-split smooth shading (hard-surface),
              "hybrid" = crease split, but field normals wherever they agree,
              "field"  = field-gradient normals throughout (organic).
    budget    triangle ceiling; the decimation ladder runs only if exceeded.
    ladder    max reduction factor per decimation rung (see below).
    face_color(centroids_build) -> (F,3) uint8, evaluated in the BUILD frame
              before crease splitting, then flooded per smooth patch.
    vertex_color(verts_build) -> (V,3) uint8, per-vertex, no crease needed.
    center_xz off by default: models are authored on the build Z axis, so
              re-centring the bbox would only nudge them off it.
    """
    t0 = time.time()
    m = mesh_field(field, bounds, step, sparse=sparse)
    raw_tris = len(m.faces)

    decimated = False
    if budget is not None and raw_tris > budget:
        # Decimate in stages, re-projecting onto the isosurface between each.
        # One 40:1 quadric pass wrecks this geometry (flat faces pick up
        # shading streaks, pip rims turn into volcanoes); a 3:1 ladder with a
        # snap after every rung does not.  Cheap, because the field can be
        # re-queried at any time — a mesh tool has no equivalent.
        clamp = 2.5 * max(np.ravel(step))
        was_watertight, prev = m.is_watertight, m
        while len(m.faces) > budget:
            prev, target = m, max(budget, int(len(m.faces) / ladder))
            m = _rung(prev, field, target, aggression, clamp)
        # A 0.12-thick sheet can pinch into a non-manifold edge under quadric
        # collapse.  It is collapse ORDER, not the budget, so redo the last
        # rung less aggressively rather than spending triangles on it.
        for retry in (5, 3, 2, 1):
            if m.is_watertight or not was_watertight:
                break
            m = _rung(prev, field, budget, retry, clamp)
        decimated = True

    watertight = bool(m.is_watertight)

    # --- shading, still in the build frame so the field can be re-queried ---
    if normals == "field":
        out = m
    else:
        base_rgb = None if face_color is None else face_color(m.triangles.mean(axis=1))
        out = trimesh.graph.smooth_shade(m, angle=np.radians(angle))
        if base_rgb is not None:
            _paint_components(out, base_rgb)
    if vertex_color is not None:
        rgb = vertex_color(np.asarray(out.vertices))
        out.visual = trimesh.visual.ColorVisuals(
            out, vertex_colors=np.hstack([rgb, np.full((len(rgb), 1), 255, np.uint8)])
        )

    vn = None
    if normals in ("field", "hybrid"):
        nf = field_normals(field, out.vertices)
        if normals == "hybrid":
            # Decimation leaves slivers, and sliver-weighted mesh normals show
            # up as soft vertical seams down an otherwise perfect cylinder.
            # The field knows better — except across a crease, where the two
            # split copies of a vertex must keep their own sides.  So take the
            # field normal wherever it agrees with the mesh, else keep the mesh.
            nm = np.asarray(out.vertex_normals)
            agree = (nf * nm).sum(axis=1) > np.cos(np.radians(hybrid_tol))
            vn = np.where(agree[:, None], nf, nm)
        else:
            vn = nf

    # --- build frame -> world frame, then sit it on the ground -------------
    out.apply_transform(_ZUP_TO_YUP)
    lo, hi = out.bounds
    shift = [
        -(lo[0] + hi[0]) / 2 if center_xz else 0,
        -lo[1],
        -(lo[2] + hi[2]) / 2 if center_xz else 0,
    ]
    out.apply_translation(shift)
    if vn is not None:
        out.vertex_normals = vn @ _ZUP_TO_YUP[:3, :3].T

    out.export(path)
    return {
        "seconds": round(time.time() - t0, 2),
        "raw_tris": raw_tris,
        "tris": len(out.faces),
        "decimated": decimated,
        "watertight": watertight,
    }


def report(name, stats):
    print(
        f"{name}: {stats['tris']} tris (raw {stats['raw_tris']}"
        f"{', decimated' if stats['decimated'] else ''}), "
        f"watertight={stats['watertight']}, {stats['seconds']}s"
    )


# ----------------------------------------------------- extra primitives ----
# Written straight against the field because that is the whole escape hatch:
# a new primitive is one numpy expression, no mesh machinery involved.


@sdf3
def tapered_capsule(a, b, ra, rb):
    """Exact round cone (Quilez): a capsule whose radius goes `ra` -> `rb`.

    The workhorse for B5 — chaining these under a smooth union gives seamless
    tapering branches for free, with the tangent cone (not a stepped stack of
    cylinders) as the flank.
    """
    a, b = np.array(a, float), np.array(b, float)
    ba = b - a
    l2 = float(ba @ ba)
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def f(p):
        pa = p - a
        y = pa @ ba
        z = y - l2
        x2 = ((pa * l2 - np.outer(y, ba)) ** 2).sum(axis=1)
        y2, z2 = y * y * l2, z * z * l2
        k = np.sign(rr) * rr * rr * x2
        cap_b = np.sqrt(x2 + z2) * il2 - rb
        cap_a = np.sqrt(x2 + y2) * il2 - ra
        flank = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - ra
        d = np.where(
            np.sign(z) * a2 * z2 > k, cap_b, np.where(np.sign(y) * a2 * y2 < k, cap_a, flank)
        )
        return d.reshape((-1, 1))

    return f


def box2(p, half_w, half_h, cx=0.0, cy=0.0):
    """2D box SDF on a pair of coordinate arrays — the profile building block."""
    qx = np.abs(p[0] - cx) - half_w
    qy = np.abs(p[1] - cy) - half_h
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0)


# ----------------------------------------------------------------- noise ---


def _fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def _lattice(ix, iy, iz, seed):
    """Deterministic uint32 hash of an integer lattice point -> [-1, 1)."""
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1013904223) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) & 0xFFFFFFFF
    h = (h * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0xFFFFFFFF
    return h.astype(np.float64) / 2147483648.0 - 1.0


def value_noise(p, seed=0):
    """Quintic-interpolated value noise in [-1, 1]. Seeded => reproducible."""
    i = np.floor(p).astype(np.int64)
    t = _fade(p - i)
    ix, iy, iz = i[:, 0], i[:, 1], i[:, 2]
    tx, ty, tz = t[:, 0], t[:, 1], t[:, 2]
    c = {}
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c[dx, dy, dz] = _lattice(ix + dx, iy + dy, iz + dz, seed)
    lerp = lambda a, b, u: a + (b - a) * u
    x00 = lerp(c[0, 0, 0], c[1, 0, 0], tx)
    x10 = lerp(c[0, 1, 0], c[1, 1, 0], tx)
    x01 = lerp(c[0, 0, 1], c[1, 0, 1], tx)
    x11 = lerp(c[0, 1, 1], c[1, 1, 1], tx)
    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz)


# a fixed irrational rotation, applied between octaves so the axis-aligned
# lattice of value noise never lines up with itself
_OCT_ROT = np.array(
    [
        [0.80, 0.36, -0.48],
        [-0.60, 0.48, -0.64],
        [0.00, 0.80, 0.60],
    ]
)


def fbm(p, scale, octaves=3, amps=None, seed=1):
    """Fractal noise. `scale` is the wavelength of the coarsest octave."""
    amps = amps if amps is not None else [0.5 ** k for k in range(octaves)]
    q = np.asarray(p, float) / scale
    total = np.zeros(len(q))
    for k, a in enumerate(amps):
        total += a * value_noise(q, seed=seed + 17 * k)
        q = (q @ _OCT_ROT.T) * 2.0
    return total
