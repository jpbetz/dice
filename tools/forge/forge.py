# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""forge: the kit a bake recipe imports. Runs INSIDE Blender's Python.

Everything a model recipe needs that is not modelling: scene reset,
bmesh -> object, modifier baking, booleans, smoothing, materials, placement,
GLB export with refusal gates, and determinism helpers. Proven by the
2026-08-12 mesh-tool bake-off (tools/forge/README.md); the pointed comments
below are that bake-off's scar tissue — keep them.

Coordinate note that governs every script here
----------------------------------------------
Blender is Z-up; glTF is Y-up. The exporter's default +Y-up conversion is
    Blender (x, y, z)  ->  glTF (x, z, -y)
verified empirically (an asymmetric 1x2x3 box at the origin exported to
bounds (0,0,-2)..(1,3,0)). So, when the battery spec says a thing:

    spec  Y (up)      -> author it on Blender  Z
    spec  Z (front)   -> author it on Blender -Y
    spec  X           -> author it on Blender  X

`spec_to_blender()` does that conversion for spec-space coordinates such as
B7's sphere list. Rotations map with the same sign: a rotation about spec +Y
is a rotation about Blender +Z (the mapping is a proper rotation).

Run scripts as:
    blender -b --factory-startup --python-exit-code 1 --python B1_die.py
`--python-exit-code 1` is not optional: without it Blender exits 0 even after
an uncaught traceback, so a broken bake looks like a clean one.
"""

import json
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector

# Recipes name their output with a slug; the bake lands in OUT_DIR.
# bake.sh points FORGE_OUT somewhere explicit; the default is tools/forge/out.
OUT_DIR = os.environ.get(
    "FORGE_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recipes", "data")

_T0 = time.time()


# --------------------------------------------------------------------------
# scene
# --------------------------------------------------------------------------

def reset():
    """Factory-startup still ships a cube, a camera and a light. Bin them."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                  bpy.data.textures, bpy.data.collections):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def obj_from_bmesh(name, bm, free=True):
    """Turn a bmesh into a linked scene object."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    if free:
        bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def obj_from_pydata(name, verts, faces):
    """Turn plain vertex/face lists into a linked scene object."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def delete(*objs):
    for ob in objs:
        if ob and ob.name in bpy.data.objects:
            bpy.data.objects.remove(ob, do_unlink=True)


# --------------------------------------------------------------------------
# modifiers
# --------------------------------------------------------------------------

def bake(obj):
    """Apply every modifier, without needing operator context.

    `bpy.ops.object.modifier_apply` wants a selection and an active object,
    which is fragile in a headless script. Evaluating through the depsgraph
    does the same job and always works.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    new_mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    obj.modifiers.clear()
    old = obj.data
    obj.data = new_mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def boolean(target, cutter, op="DIFFERENCE", solver="EXACT",
            material_mode="INDEX", bake_now=True, keep_cutter=False):
    """CSG one object against another. Returns `target`."""
    md = target.modifiers.new(name=f"bool_{op.lower()}", type="BOOLEAN")
    md.operation = op
    md.object = cutter
    md.solver = solver
    md.material_mode = material_mode
    if bake_now:
        bake(target)
        if not keep_cutter:
            delete(cutter)
    return target


def boolean_each(target, operands, op="UNION", solver="EXACT"):
    """CSG operands into `target` one modifier at a time.

    Slower than `boolean_collection` but it can be bisected: run it with a
    manifold check after each step and the operand that breaks the solid names
    itself. That is how B5's fork degeneracy was found.
    """
    for ob in operands:
        boolean(target, ob, op=op, solver=solver)
    return target


def boolean_collection(target, cutters, op="DIFFERENCE", solver="EXACT",
                       material_mode="INDEX", name="cutters"):
    """CSG a whole pile of cutters in ONE modifier evaluation.

    Much faster than N sequential booleans and the only sane way to run
    B7's 120-sphere subtraction.

    Used for DIFFERENCE (B2's openings, B7's 120 spheres), where operands
    overlapping each other is harmless.

    A note on what this is NOT to blame for: B5's union first came out with
    400 non-manifold edges through this function, and unioning one at a time
    made no difference. The fault was in the model, not the modifier — two
    tube end-caps sharing an exact centre point at a fork. Bisecting with
    `boolean_each` found it; blaming the collection path would have been a
    tidy, wrong story.
    """
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    for ob in cutters:
        for c in ob.users_collection:
            c.objects.unlink(ob)
        coll.objects.link(ob)

    md = target.modifiers.new(name="bool_coll", type="BOOLEAN")
    md.operation = op
    md.operand_type = "COLLECTION"
    md.collection = coll
    md.solver = solver
    md.material_mode = material_mode
    bake(target)

    for ob in list(coll.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(coll)
    return target


# --------------------------------------------------------------------------
# shading
# --------------------------------------------------------------------------

def canonicalize(obj):
    """Rewrite the mesh in a fixed element order. Shape is untouched.

    WHY THIS EXISTS. Blender's EXACT boolean solver emits the same solid with
    a different vertex/face ORDER on every run — same positions, same triangle
    set, different indexing. (Measured: the order-sensitive digest changes run
    to run while the order-independent one never does; `-t 1` does not help,
    so it is container/address ordering, not thread scheduling.) Downstream
    that makes every GLB byte-different even though the model is identical.

    Sorting vertices by coordinate and faces by their remapped index tuple —
    each face cycle rotated to start at its lowest index, so winding survives
    — makes the whole pipeline reproducible. Call it after any boolean.
    """
    me = obj.data
    coords = [v.co.copy().freeze() for v in me.vertices]
    keys = [tuple(c) for c in coords]
    if len(set(keys)) != len(keys):
        print("[forge] WARNING canonicalize: coincident vertices, order may not be unique")
    order = sorted(range(len(keys)), key=lambda i: keys[i])
    remap = [0] * len(keys)
    for new_i, old_i in enumerate(order):
        remap[old_i] = new_i

    # Color attributes ride along (the first fae_arch bake proved the hard
    # way that dropping them makes finish(vertex_colors=True) export a
    # silently colourless GLB — README trap #4, previously inside this kit).
    attrs = []
    for ca in me.color_attributes:
        if ca.domain == "CORNER":
            per_poly = [[tuple(ca.data[li].color) for li in p.loop_indices]
                        for p in me.polygons]
        elif ca.domain == "POINT":
            per_poly = [tuple(tuple(ca.data[v].color) for v in range(len(me.vertices)))]
        else:
            print(f"[forge] WARNING canonicalize: dropping color attr "
                  f"{ca.name} on unsupported domain {ca.domain}")
            continue
        attrs.append((ca.name, ca.data_type, ca.domain, per_poly))

    faces = []
    for pi, p in enumerate(me.polygons):
        idx = [remap[i] for i in p.vertices]
        k = idx.index(min(idx))
        faces.append((tuple(idx[k:] + idx[:k]), p.material_index, pi, k))
    faces.sort(key=lambda t: (t[0], t[1]))

    mats = list(me.materials)
    new_me = bpy.data.meshes.new(me.name)
    new_me.from_pydata([keys[i] for i in order], [], [f for f, _, _, _ in faces])
    new_me.update()
    for m in mats:
        new_me.materials.append(m)
    for p, (_, mi, _, _) in zip(new_me.polygons, faces):
        p.material_index = mi

    for name, dtype, domain, per_poly in attrs:
        nca = new_me.color_attributes.new(name=name, type=dtype, domain=domain)
        if domain == "CORNER":
            # each new polygon's loops follow its (rotated) vertex order, so
            # the old loop colors rotate by the same k the face cycle did
            for p, (_, _, pi, k) in zip(new_me.polygons, faces):
                old = per_poly[pi]
                rot = old[k:] + old[:k]
                for li, col in zip(p.loop_indices, rot):
                    nca.data[li].color = col
        else:  # POINT
            flat = per_poly[0]
            for new_i, old_i in enumerate(order):
                nca.data[new_i].color = flat[old_i]

    obj.data = new_me
    if me.users == 0:
        bpy.data.meshes.remove(me)
    return obj


def triangulate(obj):
    """Triangulate up front, with a fixed method.

    Not cosmetic: left to itself the glTF exporter triangulates n-gons via
    `loop_triangles`, and the ORDER it emits them in is not stable between
    runs (identical vertices and identical triangle set, different index
    buffer). Doing it here with a named method makes the GLB byte-identical
    run to run.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(me)
    bm.free()
    return obj


def smooth_by_angle(obj, degrees=32.0):
    """Blender 4.x auto-smooth: every face smooth, edges over the angle sharp.

    (`mesh.use_auto_smooth` is gone since 4.1 and `set_sharp_from_angle` does
    not exist in 4.5 — the mechanism now is the `sharp_edge` flag, which is
    what this writes.)
    """
    me = obj.data
    thr = math.radians(degrees)
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > thr)
    bm.to_mesh(me)
    bm.free()
    return obj


def manifold_report(obj):
    """(non-manifold edge count, signed volume) — the two numbers worth watching."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    nm = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    vol = bm.calc_volume(signed=True)
    bm.free()
    return nm, vol


def clean_slivers(obj, dist=2e-5):
    """Weld coincident vertices and dissolve zero-area faces. A repair pass.

    Blender's exact boolean can leave a few welded-but-doubled vertices and
    hair-thin flaps where two surfaces meet almost tangentially. They are not
    wrong geometry so much as redundant geometry, but they read as
    non-manifold edges downstream. Recording that a model needed this is part
    of the result; silently running it on everything would not be.
    """
    before = manifold_report(obj)[0]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.dissolve_degenerate(bm, dist=dist, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    after = manifold_report(obj)[0]
    print(f"[forge] clean_slivers({obj.name}): non-manifold edges {before} -> {after}")
    return obj


def recalc_normals(obj):
    """Make every face wind outward. For hand-built meshes, not primitives."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def signed_volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    v = bm.calc_volume(signed=True)
    bm.free()
    return v


def assert_outward(objs):
    """Refuse to export an inside-out solid.

    This guard is here because it already happened: B4's stump was hand-built
    with the ring quads wound the wrong way, so the whole mesh had normals
    pointing inward. It was watertight, it had the right silhouette, it
    rendered fine in Blender (double-sided material) — and it would have been
    invisible in three.js, which culls back faces by default. Nothing in the
    metrics contract catches that, so the check has to live here.
    """
    for ob in objs:
        v = signed_volume(ob)
        if v < 0:
            raise RuntimeError(
                f"{ob.name}: signed volume {v:.4f} < 0 — mesh is inside out. "
                "Call recalc_normals() or fix the face winding.")
        if abs(v) < 1e-9:
            print(f"[forge] WARNING {ob.name}: volume ~0, is it a closed solid?")


def smooth_all(obj):
    """Fully smooth, no sharp edges — for the organic pieces."""
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    for e in me.edges:
        e.use_edge_sharp = False
    return obj


# --------------------------------------------------------------------------
# materials / colour
# --------------------------------------------------------------------------

def material(name, rgb, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def vertex_color_material(name, attr_name, roughness=None, specular_level=None,
                          emission=None):
    """A material whose base colour is the mesh colour attribute.

    The glTF exporter only writes COLOR_0 under `export_vertex_color='MATERIAL'`
    when some material actually reads the attribute, so this node wiring is
    load-bearing, not decoration.

    `roughness=None` keeps Blender's Principled default (0.5) — the historical
    behaviour, which every battery recipe bakes against. PASS A VALUE for
    anything whose albedo story matters: at 0.5 every surface reflects the
    environment through a tight 4% lobe, and at low albedos that sheen IS the
    value — the hollowbole build measured a "pale glowing" interior whose
    diffuse contribution was (3,3,1) out of (84,104,155). Matte forms (wood,
    stone, rot) want 0.85-0.96; the judgement made through the sheen is a
    judgement made through a haze.

    `specular_level` is the SAME FAULT ONE LEVEL DOWN, and the harder one:
    roughness spreads the 4% specular lobe but does not remove it (F0 stays
    0.04), so a cavity painted literally black still glows at ~0.07 sRGB
    under a 2.2 key — and no albedo change can reveal the cause; only the
    HUE of the residual can (it arrives in the key's colour, not the
    paint's). Principled's "Specular IOR Level" 0.5 = F0 0.04; pass ~0.1
    (F0 0.008) for deep interiors that must actually go dark. Exports as
    KHR_materials_specular, honoured by the app's r160 loader.

    `emission` is a LINEAR (r, g, b) written straight to Emission Color at
    Strength 1, which the exporter turns into glTF `emissiveFactor` — linear
    at both ends, so what you type is what `material.emissive` holds in the
    app. TWO THINGS ABOUT IT THAT ARE EASY TO FORGET AND EXPENSIVE TO LEARN:

      · EMISSIVE IS NOT MULTIPLIED BY COLOR_0. One material means one glow
        value over the whole mesh, so a glow that has to VARY is a separate
        MESH (a separate object gets a separate material), or it is a
        gradient built out of GEOMETRY — how much emitting surface a given
        eye can see. Without a texture there is no third option.
      · IT IS NOT A LIGHT. Nothing near an emissive face is illuminated by
        it, so a glow the shipped eyes cannot see DIRECTLY contributes
        exactly zero pixels (js/towerhollow.js learned this on a gill that
        faced the floor). Emitters go where they are looked at.

    The ceiling is the app's bloom threshold, js/post.js `uThresh` = 0.9 on
    linear luminance, and it is enforced here: a tower mesh over it would
    burn, and a permanently burning tower disables the post-stack bypass for
    the whole app (js/towerhollow.js's value-ladder paragraph).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    node = nt.nodes.new("ShaderNodeVertexColor")
    node.layer_name = attr_name
    nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if roughness is not None:
        bsdf.inputs["Roughness"].default_value = float(roughness)
    if specular_level is not None:
        bsdf.inputs["Specular IOR Level"].default_value = float(specular_level)
    if emission is not None:
        r, g, b = (float(c) for c in emission)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum >= 0.9:
            raise RuntimeError(
                f"{name}: emission luminance {lum:.3f} is at or over the app's "
                f"bloom threshold (0.9 linear) — this mesh would burn, and a "
                f"tower that burns disables the post-stack bypass for the "
                f"whole app")
        bsdf.inputs["Emission Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat


def paint_corners(obj, attr_name, fn):
    """Write a BYTE_COLOR attribute on the CORNER domain.

    `fn(polygon, vertex_co) -> (r, g, b)`. Corner (not point) domain so two
    faces meeting at one vertex can carry different colours — which is what
    a hard colour break like a pip rim or a cut stump top needs.
    """
    me = obj.data
    ca = me.color_attributes.new(name=attr_name, type="BYTE_COLOR", domain="CORNER")
    for poly in me.polygons:
        for li in poly.loop_indices:
            r, g, b = fn(poly, me.vertices[me.loops[li].vertex_index].co)
            ca.data[li].color = (r, g, b, 1.0)
    return ca


def single_material(obj, mat):
    """Collapse every material slot to one. Keeps the GLB to ONE primitive.

    glTF splits a mesh into one primitive per material, and the harness then
    sees each primitive as a separate open surface — a two-material die reads
    as "not watertight" even though the solid is closed. Colour therefore
    rides on COLOR_0 instead, and the mesh stays a single closed primitive.
    """
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0
    return obj


# --------------------------------------------------------------------------
# placement (spec space is Y-up; we author in Blender's Z-up)
# --------------------------------------------------------------------------

def spec_to_blender(x, y, z):
    """Spec/glTF (Y-up) coordinate -> Blender (Z-up) coordinate."""
    return Vector((x, -z, y))


def world_bounds(objs):
    lo = Vector((1e18,) * 3)
    hi = Vector((-1e18,) * 3)
    for ob in objs:
        for corner in ob.bound_box:
            p = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def sit_on_ground(objs, center_xy=True):
    """Centre in X/Y and drop so the lowest point rests on Blender z=0.

    That is the spec's "centred on origin, standing ON y=0" once exported.

    Bounds come from the MESHES only — an empty's bound_box is its display
    gizmo, and letting a portal marker vote on where the ground is would move
    the model to suit the annotation. Every object passed still gets the
    shift, so portals stay welded to the geometry they describe.
    """
    meshes = [o for o in objs if o.type == "MESH"]
    lo, hi = world_bounds(meshes or objs)
    mid = (lo + hi) * 0.5
    shift = Vector((-mid.x, -mid.y, -lo.z)) if center_xy else Vector((0, 0, -lo.z))
    for ob in objs:
        ob.matrix_world = Matrix.Translation(shift) @ ob.matrix_world
    bpy.context.view_layer.update()
    return shift


# --------------------------------------------------------------------------
# tower portals (the model's contract with the engine)
# --------------------------------------------------------------------------
#
# A tower model does not ship colliders, cameras or a film plane; it ships two
# PORTALS and the engine derives the rest. Each portal is one glTF node, and
# each datum has exactly ONE home:
#
#   node NAME        -> which portal it is  (`portalIn` / `portalOut`)
#   node TRANSLATION -> where it is         (so Blender's viewport and any
#                                            glTF viewer show it, for free)
#   node EXTRAS      -> its scalars         (Blender custom properties,
#                                            exported under export_extras)
#
# Nothing is written twice, so nothing can disagree with itself. The app reads
# object.position and object.userData off the loaded node; check.py --tower
# reads the same two places out of the GLB JSON and gates them.
#
# Arguments are APP-FRAME (y up, +z toward the player, z=0 the back-wall
# socket plane); spec_to_blender puts them on Blender's Z-up axes, and
# export_yup=True turns them back. Author in the frame you reason in.

PORTAL_IN = "portalIn"
PORTAL_OUT = "portalOut"


def _empty(name, app_pos, props, display_size):
    ob = bpy.data.objects.new(name, None)     # None object data == empty
    ob.empty_display_type = "PLAIN_AXES"
    ob.empty_display_size = float(display_size)
    ob.location = spec_to_blender(*app_pos)
    for k, v in props.items():
        ob[k] = float(v)
    bpy.context.collection.objects.link(ob)
    return ob


def model_marker(name, app_pos, props, display_size=0.25):
    """A scene-root empty carrying one PLACE the model wants to name.

    The portals are the contract; this is for everything else a model knows
    about itself that code outside would otherwise have to guess, measure or
    hard-code — where a light goes, where a door may be cut, which way a face
    points. Same discipline as tower_portals: the node NAME says what it is,
    the node TRANSLATION says where (visible in Blender and any glTF viewer),
    node EXTRAS carry the scalars, and nothing is written twice.

    The alternative is what the app does today for hollowbole's ember door:
    two constants in js/towerglbshell.js plus a runtime raycast to find the
    surface they land on, in a file that cannot see the recipe. A marker is
    the recipe answering the question once, at bake time, from the mesh.
    """
    return _empty(name, app_pos, props, display_size)


def tower_portals(in_spec, out_spec):
    """Create the `portalIn` / `portalOut` empties. Returns (in_ob, out_ob).

    Both specs are plain dicts of APP-FRAME numbers:

        in_spec  = {"x":.., "rimY":.., "z":.., "clearR":..}
            the entry aperture: a horizontal disc the engine drops dice
            through, centred (x, rimY, z), clear to radius clearR.
        out_spec = {"x":.., "sillY":.., "w":.., "clearH":..}
            the exit door: a rectangle in the SOCKET PLANE facing +z, its
            bottom edge (the sill) at sillY, w wide and clearH tall.

    THE DOORWAY HAS NO z, and that is a correction rather than an omission
    (2026-08-13, Joe's ruling). out_spec used to take an optional z "unless a
    model has a reason to inset the doorway"; no model ever did, and the knob
    could not have worked if one had, because the engine reads exactly TWO
    things off portalOut — x and sillY — and builds the doorway plane from
    the socket. A declared z therefore moved nothing in the app and one thing
    in the toolchain: check.py anchored its 25-ray exit probe to it, i.e. to
    a number the engine discards. Pinned to 0.0 here, refused by the gate
    there, and refused LOUDLY here too — a spec that still carries the key
    was written against a contract that no longer exists.

    Pass the empties to finish()/export_glb() alongside the meshes. The
    engine's own bounds live in towergates.ENGINE_MIRROR; this helper only
    refuses specs it cannot encode, so that "is this a legal tower?" has one
    answer, given by the gate, and not two that can drift apart.
    """
    def need(spec, keys, which):
        missing = [k for k in keys if k not in spec]
        if missing:
            raise RuntimeError(
                f"tower_portals: {which} spec missing {missing} "
                f"(got {sorted(spec)})")
        for k in keys:
            if not isinstance(spec[k], (int, float)) or isinstance(spec[k], bool):
                raise RuntimeError(
                    f"tower_portals: {which}['{k}'] must be a number, "
                    f"got {spec[k]!r}")

    need(in_spec, ("x", "rimY", "z", "clearR"), PORTAL_IN)
    need(out_spec, ("x", "sillY", "w", "clearH"), PORTAL_OUT)
    if "z" in out_spec:
        raise RuntimeError(
            "tower_portals: out_spec must not carry 'z' — the doorway lives "
            "in the socket plane and the engine reads only x and sillY off "
            "portalOut, so the knob moved nothing but check.py's exit probe. "
            "Delete the key (it is pinned to 0.0).")

    pin = _empty(PORTAL_IN,
                 (in_spec["x"], in_spec["rimY"], in_spec["z"]),
                 {"clearR": in_spec["clearR"]},
                 display_size=in_spec["clearR"])
    pout = _empty(PORTAL_OUT,
                  (out_spec["x"], out_spec["sillY"], 0.0),
                  {"w": out_spec["w"], "clearH": out_spec["clearH"]},
                  display_size=0.5 * max(out_spec["w"], out_spec["clearH"]))
    print(f"[forge] portals  in=(x {in_spec['x']:.3f}, y {in_spec['rimY']:.3f}, "
          f"z {in_spec['z']:.3f}) clearR {in_spec['clearR']:.3f}  |  "
          f"out=(x {out_spec['x']:.3f}, y {out_spec['sillY']:.3f}, z 0.000) "
          f"w {out_spec['w']:.3f} clearH {out_spec['clearH']:.3f}")
    return pin, pout


# --------------------------------------------------------------------------
# export
# --------------------------------------------------------------------------

def export_glb(slug, objs=None, vertex_colors=False):
    """Native GLB export. Returns the path."""
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{slug}.glb")
    if os.path.exists(path):
        os.remove(path)
    # `objs` may mix meshes with non-mesh nodes (portal empties). Everything
    # joins the selection so it lands in the GLB; the geometry gates only ever
    # look at the meshes.
    all_objs = objs if objs is not None else list(bpy.data.objects)
    assert_outward([o for o in all_objs if o.type == "MESH"])
    if objs is not None:
        bpy.ops.object.select_all(action="DESELECT")
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]

    # THE DIGEST GOES IN THE FILE (2026-08-13). It used to be PRINTED — which
    # made it a fact about a bake log, not about an asset — while the app-side
    # comments claimed the palette variants "share a geometry digest" and
    # neither shipped GLB contained one, so the claim was unfalsifiable
    # wherever it mattered. Computed BEFORE the scene props are set, so the
    # digest can never hash itself; written as scene extras rather than a
    # node, so no loader has a new object to step over.
    order, dset = geometry_digest(all_objs, slug)
    sc = bpy.context.scene
    sc["forgeDigestSet"] = dset
    sc["forgeDigestOrder"] = order
    sc["forgeSlug"] = slug

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=objs is not None,
        export_apply=True,          # bake any modifier still standing
        export_yup=True,            # Blender Z-up -> glTF Y-up
        export_normals=True,
        export_texcoords=False,
        export_materials="EXPORT",
        export_vertex_color="MATERIAL" if vertex_colors else "NONE",
        export_extras=True,         # object custom props -> node extras: the
                                    # ONLY carrier for portal scalars
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    if not os.path.exists(path):
        raise RuntimeError(f"export produced no file: {path}")
    tris = sum(len(o.data.loop_triangles) for o in all_objs
               if o.type == "MESH" and (o.data.calc_loop_triangles() or True))
    _record_digest(slug, order, dset, tris)
    print(f"[forge] {slug}.glb  {os.path.getsize(path) / 1024:.1f} kB  "
          f"~{tris} tris (blender count)  {time.time() - _T0:.1f}s in-script")
    return path


# Every slug this PROCESS exported, so a two-variant recipe writes one file
# covering both. A fresh process starts empty on purpose: digest.json
# describes THIS run and nothing older, which is what makes it diffable
# against a committed baseline without an accumulating history to prune.
_DIGESTS = {}


def _record_digest(slug, order, dset, tris):
    """Append the run's digest record to FORGE_OUT/digest.json."""
    _DIGESTS[slug] = {"set": dset, "order": order, "tris": int(tris)}
    with open(os.path.join(OUT_DIR, "digest.json"), "w") as f:
        json.dump(_DIGESTS, f, indent=1, sort_keys=True)
        f.write("\n")


def geometry_digest(objs, label=""):
    """Two hashes of the mesh as Blender holds it. -> (order, set), both hex16.

    `order` includes vertex/face ordering AND color attributes; `set` is
    order-independent (sorted rounded vertices, sorted faces keyed by vertex
    position). If `set` matches across runs but `order` does not, the
    geometry is the same shape and only the emission order moved. Colors are
    in `order` because a color-only edit must move the digest — the fae_arch
    dogfood made three color-only edits that the old geometry-only digest
    could not see.

    Non-mesh nodes (the portal empties) are SHIPPING DATA, not geometry: name,
    placement and custom props go into `order` so that moving a portal moves
    the hash, and stay out of `set` so that `set` keeps meaning exactly one
    thing — "is this the same solid?".
    """
    import hashlib

    ordered, vset, fset = hashlib.md5(), [], []
    for ob in sorted(objs, key=lambda o: o.name):
        if ob.type != "MESH":
            ordered.update(ob.name.encode())
            t = tuple(round(c, 6) + 0.0 for c in ob.matrix_world.translation)
            ordered.update(repr(t).encode())
            for k in sorted(k for k in ob.keys() if not k.startswith("_")):
                v = ob[k]
                v = round(float(v), 6) + 0.0 if isinstance(v, (int, float)) else v
                ordered.update(repr((k, v)).encode())
            continue
        me = ob.data
        # MATERIALS enter `order` (digest schema v2, 2026-08-13). The hollowbole
        # round-2 build changed Specular IOR Level — the render moved
        # substantially — and BOTH digests stayed identical, which broke the
        # digest's one promise ("tells you what changed"). Principled inputs
        # that reach the glTF: base color, metallic, roughness, specular level,
        # emission. `set` stays geometry-only, deliberately. This bump moves
        # every recorded order digest once; older records are pre-v2.
        for slot in ob.material_slots:
            m = slot.material
            if not m:
                continue
            ordered.update(m.name.encode())
            if m.use_nodes and "Principled BSDF" in m.node_tree.nodes:
                b = m.node_tree.nodes["Principled BSDF"]
                for inp in ("Base Color", "Metallic", "Roughness",
                            "Specular IOR Level", "Emission Color",
                            "Emission Strength"):
                    v = b.inputs[inp].default_value
                    try:
                        t = tuple(round(float(c), 6) + 0.0 for c in v)
                    except TypeError:
                        t = round(float(v), 6) + 0.0
                    ordered.update(repr((inp, t)).encode())
        for v in me.vertices:
            t = tuple(round(c, 6) + 0.0 for c in v.co)
            ordered.update(repr(t).encode())
            vset.append(t)
        for p in me.polygons:
            idx = tuple(p.vertices)
            ordered.update(repr(idx).encode())
            fset.append(tuple(sorted(tuple(round(c, 6) + 0.0 for c in me.vertices[i].co)
                                     for i in idx)))
        for ca in me.color_attributes:
            ordered.update(ca.name.encode())
            for item in ca.data:
                ordered.update(repr(tuple(round(c, 5) for c in item.color)).encode())
    unordered = hashlib.md5()
    for t in sorted(vset):
        unordered.update(repr(t).encode())
    for t in sorted(fset):
        unordered.update(repr(t).encode())
    order, dset = ordered.hexdigest()[:16], unordered.hexdigest()[:16]
    print(f"[forge] {label} digest order={order} set={dset}")
    return order, dset


def report_bounds(objs, label="bounds"):
    lo, hi = world_bounds(objs)
    print(f"[forge] {label} blender lo={tuple(round(v, 3) for v in lo)} "
          f"hi={tuple(round(v, 3) for v in hi)}  -> gltf "
          f"lo=({lo.x:.3f},{lo.z:.3f},{-hi.y:.3f}) hi=({hi.x:.3f},{hi.z:.3f},{-lo.y:.3f})")


def tri_count(objs):
    total = 0
    for ob in objs:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            total += len(ob.data.loop_triangles)
    return total


def assert_budget(objs, max_tris):
    """Refuse to export over the triangle budget.

    Budgets for this app (docs and bake-off report agree): a hero prop the
    camera can dwell on 3k-8k, a mid prop <= 2k, scatter <= 500. A budget is
    a design input, not a hope — pick it before modelling and gate on it.
    """
    n = tri_count(objs)
    if n > max_tris:
        raise RuntimeError(
            f"tri budget blown: {n} > {max_tris}. Lower segment counts / "
            "bevel segments / curve resolution rather than decimating after.")
    print(f"[forge] budget ok: {n}/{max_tris} tris")
    return n


def finish(slug, objs, *, budget=None, smooth_deg=None, vertex_colors=False,
           ground=True, repair=False):
    """The standard tail of a recipe, in the order the bake-off proved.

    canonicalize + triangulate (byte-stable output), optional smooth-by-angle,
    optional sliver repair (record WHY if you pass repair=True), ground the
    model, gate on budget and winding, export. Returns the GLB path.

    `objs` may include non-mesh nodes (tower portal empties); they skip every
    geometry step and simply ride the grounding shift and the export.
    """
    for ob in objs:
        if ob.type != "MESH":
            continue
        canonicalize(ob)
        triangulate(ob)
        if smooth_deg is not None:
            smooth_by_angle(ob, smooth_deg)
        if repair:
            clean_slivers(ob)
        nm, vol = manifold_report(ob)
        if nm:
            raise RuntimeError(
                f"{ob.name}: {nm} non-manifold edges. Bisect the booleans "
                "(boolean_each + manifold_report) rather than shipping it.")
    if ground:
        sit_on_ground(objs)
    if budget is not None:
        assert_budget(objs, budget)
    return export_glb(slug, objs, vertex_colors=vertex_colors)
