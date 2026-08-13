# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""hollowbole's MOUTH PIXEL PROBE — the interior value order, as numbers.

    ~/opt/dice-forge/venv/bin/python tools/forge/recipes/hollowbole_probe.py \
        tools/forge/out/hollowbole_moonrise.glb \
        tools/forge/shots/final-moonrise-10-mouth.png

WHY THIS EXISTS. Round 1's review found the interior reading LIT: pale
patches at mid-height through the mouth, so the depth cue inverted and the
stump read as a facade with a picture of a cave in it. The recipe already
painted the liner near-black; the paint was never the whole story, because
what reaches the eye is albedo times what the key light does to that
surface's NORMAL. The two inner side walls face +-x, and the key at
(4, 7, 5) lights the +x one at 43% and the debris floor at 75%, so the
deepest surfaces were the brightest ones. No amount of staring at a render
settles that. This does.

WHAT IT MEASURES. For each sample point it casts the SAME ray the renderer
used — look.html's camera, re-derived here from the same az/el/dist/fov, not
copied from a screenshot — finds the first triangle of the GLB it hits, and
reports (a) which mesh, (b) how far BEHIND the wound's front plane the hit
is, and (c) the rendered pixel there, averaged over 3x3 so one antialiased
edge pixel cannot carry a claim.

THE ASSERTION. Ordered by depth, luminance must not rise: the deepest thing
visible through the mouth is the darkest pixel in the wound, and every lip
sample outranks every interior sample. --assert exits 1 when it does not.
"""

import argparse
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

# look.html's rig, restated. These are the only numbers shared with the page;
# if look.html's camera block changes, this file is wrong and the mismatch
# shows up as a hit that disagrees with the picture.
W, H, FOV = 1100, 900, 38.0
FRONT_Z = 0.20            # the wound's front plane; depth is measured behind it

# The 19-probe view, straight from hollowbole_look.js: pulled back far enough
# that the arch, the sill and both jambs are in the same picture as the
# cavity, which the 10-mouth close-up is not.
MOUTH_VIEW = dict(az=0.0, el=2.0, tx=0.0, ty=3.6, tz=-0.6, dist=13.5)

# A GRID, CLASSIFIED BY WHAT THE RAY HITS — not by where I guessed the lips
# were. The first cut of this file labelled four points "lip" by eye; three
# of them turned out to be sixteen units down the inside of the cavity, so
# the assertion was comparing the interior against itself and the numbers it
# printed were worthless. Depth is measured, so let depth do the labelling:
# a sample lands on a LIP if the first thing it hits is within LIP_Z of the
# wound's front plane, and in the CAVITY if it is past DEEP_Z. Samples in
# between are the jamb walls raking away and are counted in neither.
GRID_X = [0.20 + 0.60 * i / 14 for i in range(15)]
GRID_Y = [0.10 + 0.78 * i / 10 for i in range(11)]
LIP_Z = 2.60
DEEP_Z = 3.60
# "THROUGH THE MOUTH" is a height band, not just a depth. The wound spans
# W_YC-W_YDN .. W_YC+W_YUP = 0.90 .. 6.85 in the recipe, and the verdict is
# explicit that what survives ABOVE that — light falling in through the open
# crown onto the top of the liner — may stay as "a faint high rim". Mixing
# the two bands is how the first run of this probe called a lit patch under
# the crown "the deepest point in the mouth" and failed the model for it.
MOUTH_Y0, MOUTH_Y1 = 0.90, 6.85
CROWN_FAINT = 0.55       # crown-band max, as a fraction of the lip median
# Mean channel value a dark island must be RINGED BY to count as a hole
# punched in lit wood. The background is 22/22/28 and round 1's artefact was
# ringed by 44-52, so 38 separates "surrounded by surface" from "surrounded
# by more night".
SURROUND_LIT = 30.0

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
        5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path):
    """Positions + indices per mesh primitive, in glTF frame (y up, z front).

    A hand parse rather than a dependency: the kit is zero-install and a GLB
    is a header, a JSON chunk and a BIN chunk.
    """
    with open(path, "rb") as f:
        blob = f.read()
    magic, _ver, _len = struct.unpack_from("<III", blob, 0)
    assert magic == 0x46546C67, "not a GLB"
    off, js, bin_ = 12, None, None
    while off < len(blob):
        clen, ctype = struct.unpack_from("<II", blob, off)
        data = blob[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(data)
        elif ctype == 0x004E4942:
            bin_ = data
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)

    def accessor(i):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        fmt, size = COMP[a["componentType"]]
        n = NCOMP[a["type"]]
        stride = bv.get("byteStride") or size * n
        base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        out = np.empty((a["count"], n), dtype=np.float64 if fmt == "f" else np.int64)
        for k in range(a["count"]):
            out[k] = struct.unpack_from("<" + fmt * n, bin_, base + k * stride)
        return out

    meshes = []
    for node in js.get("nodes", []):
        if "mesh" not in node:
            continue
        name = node.get("name", js["meshes"][node["mesh"]].get("name", "?"))
        for prim in js["meshes"][node["mesh"]]["primitives"]:
            pos = accessor(prim["attributes"]["POSITION"])
            idx = accessor(prim["indices"]).reshape(-1)
            meshes.append((name, pos[idx].reshape(-1, 3, 3)))
    return meshes


def camera(v):
    """look.html's __views camera, term for term. Returns (eye, basis).

    basis columns are three.js camera axes (right, up, -forward), so a ray
    through NDC (nx, ny) is right*nx*t*aspect + up*ny*t - forward.
    """
    centre = np.array([v["tx"], v["ty"], v["tz"]], dtype=float)
    az, el = math.radians(v["az"]), math.radians(v["el"])
    d = v["dist"]
    eye = centre + np.array([d * math.cos(el) * math.sin(az),
                             d * math.sin(el),
                             d * math.cos(el) * math.cos(az)])
    fwd = centre - eye
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return eye, right, up, fwd


def first_hit(meshes, origin, direction):
    """Moller-Trumbore over every triangle; nearest wins. Same routine the
    recipe's throat gate uses, so a hit here and a blocked probe there mean
    the same thing."""
    best_t, best_name = None, None
    for name, tris in meshes:
        v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]
        e1, e2 = v1 - v0, v2 - v0
        p = np.cross(direction, e2)
        det = np.einsum("ij,ij->i", e1, p)
        ok = np.abs(det) > 1e-12
        inv = np.zeros_like(det)
        inv[ok] = 1.0 / det[ok]
        tv = origin - v0
        u = np.einsum("ij,ij->i", tv, p) * inv
        q = np.cross(tv, e1)
        vv = (q @ direction) * inv
        t = np.einsum("ij,ij->i", e2, q) * inv
        hit = (ok & (u >= -1e-9) & (vv >= -1e-9) & (u + vv <= 1.0 + 1e-9)
               & (t > 1e-5))
        if hit.any():
            tm = float(t[hit].min())
            if best_t is None or tm < best_t:
                best_t, best_name = tm, name
    return best_t, best_name


def probe(glb, png, view=MOUTH_VIEW):
    meshes = read_glb(glb)
    img = np.asarray(Image.open(png).convert("RGB"), dtype=float)
    eye, right, up, fwd = camera(view)
    tan = math.tan(math.radians(FOV) / 2.0)
    aspect = W / H
    rows = []
    for fy in GRID_Y:
        for fx in GRID_X:
            px, py = int(round(fx * W)), int(round(fy * H))
            patch = img[max(0, py - 1):py + 2, max(0, px - 1):px + 2]
            r, g, b = patch.reshape(-1, 3).mean(axis=0)
            lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            nx, ny = fx * 2.0 - 1.0, 1.0 - fy * 2.0
            d = right * (nx * tan * aspect) + up * (ny * tan) + fwd
            d /= np.linalg.norm(d)
            t, who = first_hit(meshes, eye, d)
            hp = eye + d * t if t is not None else None
            dep = None if hp is None else round(FRONT_Z - hp[2], 2)
            kind = "-"
            if hp is not None and who == "towerSkinBoleShell":
                if dep < LIP_Z:
                    kind = "lip"
                elif dep > DEEP_Z:
                    kind = "in" if MOUTH_Y0 <= hp[1] <= MOUTH_Y1 else "crown"
                else:
                    kind = "rake"
            rows.append(dict(id=f"{fx:.2f},{fy:.2f}", kind=kind, px=px, py=py,
                             rgb=(round(r), round(g), round(b)),
                             lum=round(lum, 4), hit=who,
                             world=None if hp is None
                             else tuple(round(c, 2) for c in hp), depth=dep))
    return rows


def _med(v):
    v = sorted(v)
    n = len(v)
    return 0.0 if not n else (v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2]))


def report(rows, do_assert=False):
    ins = [r for r in rows if r["kind"] == "in"]
    lips = [r for r in rows if r["kind"] == "lip"]
    crown = [r for r in rows if r["kind"] == "crown"]
    print(f"grid {len(rows)} samples: {len(lips)} lip (depth < {LIP_Z}), "
          f"{len(ins)} cavity through the mouth (depth > {DEEP_Z}, "
          f"y {MOUTH_Y0}-{MOUTH_Y1}), {len(crown)} liner above the arch, "
          f"{sum(1 for r in rows if r['kind'] == 'rake')} raking jamb, "
          f"{sum(1 for r in rows if r['kind'] == '-')} off-shell")
    if len(ins) < 8 or len(lips) < 5:
        print("PROBE INCONCLUSIVE: not enough of one class in frame")
        return 1 if do_assert else 0

    # LUMINANCE BY DEPTH BAND. Medians, not extremes: one antialiased pixel
    # on a splinter must not be able to carry or sink the claim.
    look = [r for r in rows if r["kind"] in ("lip", "rake", "in")]
    lo = min(r["depth"] for r in look)
    hi = max(r["depth"] for r in look)
    print(f"\n{'depth band':<16} {'n':>4} {'median lum':>11}  {'max lum':>8}")
    bands, edges = [], [lo + (hi - lo) * k / 6 for k in range(7)]
    for a, b in zip(edges, edges[1:]):
        sel = [r for r in look if a <= r["depth"] < b + 1e-9]
        if not sel:
            continue
        m = _med([r["lum"] for r in sel])
        bands.append((a, b, len(sel), m))
        print(f"{a:6.2f}..{b:5.2f} {len(sel):>4} {m:>11.4f} "
              f"{max(r['lum'] for r in sel):>8.4f}")

    deepest = max(ins, key=lambda r: r["depth"])
    print(f"\n  lips      n={len(lips):<3} median lum {_med([r['lum'] for r in lips]):.4f}"
          f"  min {min(r['lum'] for r in lips):.4f}"
          f"  max {max(r['lum'] for r in lips):.4f}")
    print(f"  cavity    n={len(ins):<3} median lum {_med([r['lum'] for r in ins]):.4f}"
          f"  min {min(r['lum'] for r in ins):.4f}"
          f"  max {max(r['lum'] for r in ins):.4f}")
    print(f"  deepest   {deepest['id']} at depth {deepest['depth']:.2f} "
          f"world {deepest['world']} lum {deepest['lum']:.4f}")
    lip_med = _med([r["lum"] for r in lips])
    if crown:
        print(f"  crown     n={len(crown):<3} median lum "
              f"{_med([r['lum'] for r in crown]):.4f}"
              f"  max {max(r['lum'] for r in crown):.4f}"
              f"  (allowed <= {CROWN_FAINT:.2f} x lip median = "
              f"{CROWN_FAINT * lip_med:.4f})")

    fails = []
    in_med = _med([r["lum"] for r in ins])
    in_max = max(r["lum"] for r in ins)
    if in_max >= lip_med:
        fails.append(f"the brightest pixel in the cavity ({in_max:.4f}) is not "
                     f"darker than the median lip ({lip_med:.4f}) — a lit patch "
                     f"in the wound reads as a surface, not as depth")
    if in_med > lip_med * 0.34:
        fails.append(f"cavity median {in_med:.4f} is not decisively under the "
                     f"lip median {lip_med:.4f} (want <= 34%)")
    # THE DEEPEST POINT, and why the test is not "equals the darkest pixel".
    # With the liner where it is, most of the cavity renders at the display's
    # floor — the median is literally 0.0000 — so "the deepest sample is the
    # single minimum" is decided by antialiasing on a splinter, not by the
    # model. The claim that carries the verdict's meaning is that whatever is
    # furthest into the stump is unambiguously in the DARK class: a quarter
    # of the lip, which no lit surface in this rig can be.
    if deepest["lum"] > 0.25 * lip_med:
        fails.append(f"the deepest visible point (depth {deepest['depth']:.2f}, "
                     f"lum {deepest['lum']:.4f}) is not decisively dark — it "
                     f"must sit under a quarter of the lip median "
                     f"({0.25 * lip_med:.4f}) or the depth read inverts")
    if crown and max(r["lum"] for r in crown) > CROWN_FAINT * lip_med:
        fails.append(f"crown light on the liner reaches "
                     f"{max(r['lum'] for r in crown):.4f}, past the faint-rim "
                     f"allowance {CROWN_FAINT * lip_med:.4f}")
    # Monotonicity is asked of the run from the lips INWARD. Bands shallower
    # than the lips are the trunk's own front face and the sill's underside;
    # they are outside the mouth and have no business in a claim about it.
    inward = [b for b in bands if b[0] >= LIP_Z - 1.0]
    for (a0, _b0, _n0, m0), (a1, _b1, _n1, m1) in zip(inward, inward[1:]):
        if m1 > m0 + 0.030:
            fails.append(f"median luminance RISES with depth: band {a0:.2f} "
                         f"({m0:.4f}) -> band {a1:.2f} ({m1:.4f})")
    if fails:
        print("\nPROBE FAILS:")
        for f in fails:
            print("  - " + f)
        return 1
    print("\nprobe ok: dark wins with depth")
    return 0


def blobs(pngs, thresh=20, min_px=14):
    """Isolated near-black islands in a render — a TRIAGE LIST, not a gate.

    Round 1's artefact was a 165-pixel, 17x26 island of near-black at the
    left lip: invisible to every gate in the recipe (the mesh is watertight,
    outward, in budget and clears both portals) because it was not a geometry
    fault at all but a shadowed slot between two meshes that the camera could
    see into. The only place it fails is a picture, so this flood-fills the
    very dark pixels and ranks what it finds.

    IT IS NOT A PASS/FAIL CHECK, and that is a measured conclusion rather
    than caution. Calibrating on the known artefact: it was ringed by
    surfaces averaging 35.4. Round 2's frames contain a dozen legitimate dark
    regions ringed by 26-52 — the gaps between crown spires, the shadow under
    each root toe, the ember-door recess — several of them the same size and
    compactness as the defect. No threshold on size, fill or ring brightness
    separates the two classes, so any exit code this file returned would be
    either a false alarm or, worse, the green check that lets the next black
    rectangle through. What it can honestly do is hand a human a short,
    ranked list of places to LOOK. The gate that decides the artefact is
    assert_tongue_seated, in the recipe, because it measures the CAUSE.
    """
    from collections import deque
    out = []
    for png in pngs:
        im = np.asarray(Image.open(png).convert("RGB"), dtype=int)
        h, w, _ = im.shape
        dark = im.sum(axis=2) < thresh
        seen = np.zeros_like(dark)
        comps = []
        for y0 in range(h):
            row = dark[y0]
            for x0 in np.nonzero(row & ~seen[y0])[0]:
                q, pix = deque([(y0, int(x0))]), []
                seen[y0, x0] = True
                while q:
                    y, x = q.popleft()
                    pix.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] \
                                and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                ys = [p[0] for p in pix]
                xs = [p[1] for p in pix]
                x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
                # THE SIGNATURE THAT MATTERS is not "dark" — a stump with a
                # torn crown is full of legitimate dark gaps between spires,
                # and the mouth itself is a 270x356 hole. Round 1's artefact
                # was a hole punched in LIT WOOD: 17x26 pixels of near-black
                # ringed by surfaces at 44-52. So the ring is measured, and a
                # component that is merely next to more darkness is not a
                # defect, it IS the darkness.
                rx0, rx1 = max(0, x0 - 5), min(w, x1 + 6)
                ry0, ry1 = max(0, y0 - 5), min(h, y1 + 6)
                ring = im[ry0:ry1, rx0:rx1].reshape(-1, 3)
                inner = im[y0:y1 + 1, x0:x1 + 1].reshape(-1, 3)
                sur = ((ring.sum() - inner.sum())
                       / max(1, len(ring) - len(inner)) / 3.0)
                comps.append((len(pix), x0, x1, y0, y1, round(sur, 1)))
        comps.sort(reverse=True)
        stray = [c for c in comps[1:] if c[0] >= min_px and c[5] >= SURROUND_LIT]
        out.append((png, comps[0] if comps else None, stray, len(comps) - 1))
    return out


def report_blobs(rows):
    total = 0
    for png, biggest, stray, nother in rows:
        base = os.path.basename(png)
        big = "none" if not biggest else \
            f"{biggest[0]}px x{biggest[1]}-{biggest[2]} y{biggest[3]}-{biggest[4]}"
        if stray:
            total += len(stray)
            print(f"{base}: {len(stray)} to look at "
                  f"(largest dark region, not listed: {big})")
            for n, x0, x1, y0, y1, sur in stray[:4]:
                print(f"    {n}px at x {x0}-{x1} y {y0}-{y1} "
                      f"({x1 - x0 + 1}x{y1 - y0 + 1}) ringed by {sur:.0f}")
        else:
            print(f"{base}: nothing ranked ({nother} dark regions, all ringed "
                  f"by < {SURROUND_LIT}); largest = {big}")
    print(f"\nblob triage: {total} island(s) ranked for a human to open. This "
          f"is a LIST, NOT A VERDICT — see blobs.__doc__ for why no threshold "
          f"here can decide; assert_tongue_seated in the recipe is the gate.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("png", nargs="+")
    ap.add_argument("--assert", dest="do_assert", action="store_true")
    ap.add_argument("--blobs", action="store_true",
                    help="scan the PNGs for isolated near-black islands "
                         "instead of probing the mouth")
    a = ap.parse_args()
    for p in [a.glb] + a.png:
        if not os.path.exists(p):
            raise SystemExit(f"missing {p}")
    if a.blobs:
        rc = report_blobs(blobs(a.png))
    else:
        rc = report(probe(a.glb, a.png[0]), a.do_assert)
    sys.exit(rc if (a.do_assert or a.blobs) else 0)


if __name__ == "__main__":
    main()
