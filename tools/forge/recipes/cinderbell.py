# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""CINDERBELL — an ancient foundry instrument, entirely greenfield.

The inherited assumption rejected here is that a furnace needs pipes, gears,
or a box silhouette. This is one huge cast bell: a wide low skirt tapering
into layered shoulders, an open bronze crucible lip, four black iron straps,
and a basket arch cut directly into the lower casting. Heavy fasteners and
one thin amber casting seam are the only embellishment. The mass and the
wear must carry the story at table distance. No existing model/recipe was
read or used. Generic forge/tower measurement helpers are the only reuse.

Plan: 22000 prototype triangle ceiling; x within +/-3.25; socket z -5.25..0.25;
portal in (0,9.6,-2.6), clear radius 2.03; out (0,1), 4.4 x 3.8.
Towerplan requires the front to reach 10.171. The built rim reaches 10.30.
The editable .blend retains named, separate castings and vertex paint.

Guidance departure: deliberately expressive bronze and worn iron materials,
with differing metalness, instead of one matte material on every part.
The glow is confined to narrow physical seams, below bloom threshold.
This is an art prototype; table-pour and live-room proofs belong to review.
Second LOOK raises the prototype budget to 22k to spend on continuous cast
silhouettes, separate lifting lugs, and actual vertex density for local wear.
The first 13k version's rear cuts and smooth paint were visibly inadequate.
Measured second study: 21,576 triangles, forty editable component meshes,
seven exported meshes/primitives (material x envelope partition). Built bounds
[-3.182,-0.560,-5.240]..[3.182,10.300,3.760] in app axes. The entry is
25/25 clear, exit 25/25 clear, cowl and shaft 99/99 hidden from six eyes,
apron/lip cladding 81/81 and 162/162, below-sill leaks 0/2304.
"""
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forge as F
import towerkit as K
import towergates as TG

PORTAL_IN = {"x": 0.0, "rimY": 9.6, "z": -2.6, "clearR": 2.03}
PORTAL_OUT = {"x": 0.0, "sillY": 1.0, "w": 4.4, "clearH": 3.8}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
F.reset()
PARTS = []
CENTER = -2.6


def lin(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def metal(name, rough, metallic, emission=None):
    m = F.vertex_color_material(name, "FoundryWear", roughness=rough,
                                specular_level=.35, emission=emission)
    m.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = metallic
    return m


BRONZE = metal("Weathered bell bronze", .68, .68)
IRON = metal("Soot black cast iron", .86, .42)
DARK = metal("Furnace depth", .97, .0)
GOLD = metal("Worn fastener edges", .63, .75)
HOT = metal("Quiet amber casting seam", .8, .1, (.57, .105, .009))


def noise(x, y, z):
    return (.48 * math.sin(x * 2.3 + math.sin(z * 1.7) + y * .65)
            + .28 * math.sin(x * 6.1 - y * 2.9 + z * 3.2)
            + .24 * math.sin(x * 19.1 + y * 8.3 - z * 11.7))


def paint(ob, family="bronze"):
    mat = {"bronze": BRONZE, "iron": IRON, "dark": DARK,
           "gold": GOLD, "hot": HOT}[family]
    F.single_material(ob, mat)

    def color(poly, co):
        x, y, z = co.x, co.z, -co.y
        n = noise(x, y, z)
        speck = math.sin(x * 31. + y * 23. + z * 37.)
        if family == "bronze":
            rgb = [.51, .368, .192]
            gain = .87 + .23 * n + .105 * speck
            # Oxide pools just below band joints; dense rings provide actual
            # paint resolution. Edge wear stays warm and sharply separated.
            join=min(abs(y-h) for h in (1.72,3.45,7.38,8.04,9.62,10.04))
            oxide=max(0,1-join/.14)
            streak=max(0,math.sin(x*5.1+z*6.7+.6*math.sin(y*5)))
            patina=min(.93,oxide*(.62+.40*streak))
            rgb=[c*(1-patina)+p*patina for c,p in zip(rgb,[.025,.32,.225])]
            soot=max(0,1-min(abs(y-h) for h in (1.87,3.62,7.12,8.2))/.20)
            gain *= 1-.56*soot
            if y>9.74 and poly.normal.z>.38:
                rgb=[.61,.425,.215]
                gain=.89+.10*n+.055*speck
            # Substantial dark interior, measured geometrically rather than by name.
            radial = math.hypot(x, z - CENTER)
            if radial < 2.17 and y > 6.1:
                depth = max(0, min(1, (y - 6.1) / 4.2))
                rgb = [.045 + .16*depth, .038 + .115*depth, .028 + .055*depth]
                gain = .85 + .13 * n
            if abs(z+3.0)<.065 and poly.normal.y<-.65 and .78 < y < 5.78 and abs(x)<2.41:
                rgb,gain=[.032,.027,.02],1+.15*n
        elif family == "iron":
            rgb = [.145, .155, .155]
            gain = .85 + .22*n + .045*speck
            if poly.normal.z > .45:
                gain += .09
        elif family == "dark":
            rgb, gain = [.027,.023,.021], 1 + n * .2
        elif family == "gold":
            rgb, gain = [.46,.34,.185], .9 + .12*n + .035*speck
        else:
            rgb, gain = [.55,.21,.038], 1
        return tuple(lin(max(.012, min(.65, c*gain))) for c in rgb)

    F.paint_corners(ob, "FoundryWear", color)
    return ob


def mesh(name, verts, faces, family="bronze", add=True):
    ob = F.obj_from_pydata(name, [F.spec_to_blender(*p) for p in verts], faces)
    F.recalc_normals(ob)
    if add:
        paint(ob, family)
        PARTS.append(ob)
    return ob


def revolve(name, profile, family="bronze", segments=64, zs=.84, add=True):
    """A closed radial profile; every profile corner is intentional casting work."""
    verts = []
    for y, r in profile:
        for i in range(segments):
            a = 2*math.pi*(i+.5)/segments
            verts.append((r*math.sin(a), y, CENTER + r*zs*math.cos(a)))
    faces = []
    for j in range(len(profile)):
        j2 = (j+1) % len(profile)
        for i in range(segments):
            ni = (i+1) % segments
            faces.append((j*segments+i, j*segments+ni, j2*segments+ni, j2*segments+i))
    return mesh(name, verts, faces, family, add)


def extrusion(name, outline, back, front, family="iron", add=True):
    n = len(outline)
    verts = [(x,y,z) for z in (back,front) for x,y in outline]
    faces = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, verts, faces, family, add)


def arch_outline(half, top, spring, bottom, steps=24):
    return [(-half,bottom),(half,bottom)] + [
        (half-2*half*i/steps, top - (top-spring)*(1-2*i/steps)**2)
        for i in range(steps+1)]


def bevel(ob, amount=.05, segments=2):
    md = ob.modifiers.new("Casting edge radius", "BEVEL")
    md.width, md.segments = amount, segments
    md.affect = "EDGES"
    md.angle_limit = .45
    F.bake(ob)
    return ob


# Lower skirt, long concave bell body, two shoulders, and massive rolled lip.
# Above y=7.7 the bore uses an actual circular inner profile, separately built
# from the elliptical exterior so the approach column does not get squeezed.
OUTER = [(.14,3.02),(.28,3.14),(.58,3.14),(.72,2.99),
         (1.18,3.00),(1.34,3.14),(1.56,3.14),(1.72,3.00),
         (2.85,3.02),(3.03,3.15),(3.28,3.15),(3.45,3.13),
         (3.80,3.15),(4.20,3.06),(5.10,2.75),(6.05,2.46),(6.85,2.30),
         (7.38,2.25),(7.53,2.51),(7.74,2.54),(7.92,2.36),
         (8.04,2.24),(9.50,2.24),(9.62,2.40),(9.77,2.66),
         (9.95,2.66),(10.04,2.51),(10.13,2.68),(10.25,2.68),(10.30,2.56)]
# Additional rings have a paint job: retain sharp oxide and burn masks across
# the long cast surfaces, instead of letting interpolation blur entire panels.
expanded=[]
for (ya,ra),(yb,rb_) in zip(OUTER,OUTER[1:]):
    expanded.append((ya,ra))
    if yb-ya>.4:
        steps=math.ceil((yb-ya)/.31)
        expanded += [(ya+(yb-ya)*j/steps,ra+(rb_-ra)*j/steps) for j in range(1,steps)]
expanded.append(OUTER[-1])
OUTER=expanded
N = 48
verts=[]
for y,r in OUTER:
    for i in range(N):
        a=2*math.pi*(i+.5)/N
        # Low bands are ellipses; the neck gains depth for the circular bore.
        zscale = .84 if y<7.35 else (1.0 if 7.92<=y<=9.62 else .955)
        verts.append((r*math.sin(a),y,CENTER+r*zscale*math.cos(a)))
INNER=[(10.30,2.14),(10.12,2.12),(9.64,2.12),(8.15,2.12),(7.72,2.12),(6.35,1.98),(6.24,.05),(.14,.05)]
for y,r in INNER:
    for i in range(N):
        a=2*math.pi*(i+.5)/N
        verts.append((r*math.sin(a),y,CENTER+r*math.cos(a)))
faces=[]
nr=len(OUTER)+len(INNER)
for j in range(nr):
    for i in range(N):
        faces.append((j*N+i,j*N+(i+1)%N,((j+1)%nr)*N+(i+1)%N,((j+1)%nr)*N+i))
bell = mesh("towerSkinCinderBellCasting", verts, faces, add=False)
cut = extrusion("Temporary arch cut",arch_outline(2.39,5.75,4.76,.80),-3.0,.6,add=False)
F.boolean(bell,cut)
bevel(bell,.045,2)
paint(bell)
PARTS.append(bell)

# The arch has a broad, deep reveal. Its cheeks bury in the bell casting.
frame = extrusion("towerSkinCinderBasketArch",arch_outline(2.87,6.13,4.9,.26),-1.60,.18,add=False)
cut = extrusion("Temporary frame throat",arch_outline(2.40,5.76,4.77,.79),-1.8,.5,add=False)
F.boolean(frame,cut)
bevel(frame,.065,2)
paint(frame,"iron")
PARTS.append(frame)

# Four restrained structural straps follow the actual bell contour. Each is
# a closed solid, and the inner face embeds into the casting by 0.035 units.
for index, deg in enumerate((63, -63, 135, -135)):
    a = math.radians(deg)
    subset = [(y,r) for y,r in OUTER if .6 < y < 9.7]
    v=[]
    for y,r in subset:
        zs=.84 if y<7.35 else (1.0 if 7.92<=y<=9.62 else .955)
        for radial, delta in ((-.035,-.065),(.145,-.065),(.145,.065),(-.035,.065)):
            aa=a+delta
            v.append(((r+radial)*math.sin(aa),y,CENTER+(r+radial)*zs*math.cos(aa)))
    f=[(3,2,1,0),tuple((len(subset)-1)*4+i for i in range(4))]
    for j in range(len(subset)-1):
        for k in range(4):
            f.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
    ob=mesh(f"towerSkinCinderStrap{index}",v,f,add=False)
    bevel(ob,.027,1)
    paint(ob,"iron")
    PARTS.append(ob)

# A cast ferrule traces the lip, giving the opening a strong dark edge.
revolve("towerSkinCinderLipFerrule",[(9.96,2.631),(10.00,2.666),(10.065,2.666),(10.095,2.601)],"iron",zs=.955)


def seam(name, y, radius, halfangle, zs):
    seg=40
    v=[]
    for yy,rr in ((y-.032,radius-.025),(y-.032,radius+.027),(y+.032,radius+.027),(y+.032,radius-.025)):
        for i in range(seg+1):
            a=math.radians(-halfangle + 2*halfangle*i/seg)
            v.append((rr*math.sin(a),yy,CENTER+rr*zs*math.cos(a)))
    s=seg+1
    f=[]
    for j in range(4):
        for i in range(seg):
            f.append((j*s+i,j*s+i+1,((j+1)%4)*s+i+1,((j+1)%4)*s+i))
    f += [(3*s,2*s,s,0), (seg,s+seg,2*s+seg,3*s+seg)]
    return mesh(name,v,f,"hot")


seam("towerSkinCinderUpperHeatSeam",7.78,2.51,54,.955)


def fastener(name, x, y, z, radius=.22):
    # Cylinders lie on the front plane; their polygonal flats catch the light.
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=.13,
                                      location=F.spec_to_blender(x,y,z),rotation=(math.pi/2,0,0))
    ob=bpy.context.object
    ob.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bevel(ob,.035,2)
    paint(ob,"gold")
    PARTS.append(ob)


for i,(x,y) in enumerate(((-2.63,1.85),(2.63,1.85),(-2.60,4.45),(2.60,4.45),(-1.32,5.74),(1.32,5.74))):
    fastener(f"towerSkinCinderArchBolt{i}",x,y,.170,.21)

# Engineered iron bands are independent castings. Six bronze heads on each
# band make the load path legible, while the arch retains its original six.
lower=revolve("towerSkinCinderLowerBelt",[(3.07,3.146),(3.09,3.18),(3.28,3.18),(3.30,3.144)],zs=.825,add=False)
cut=extrusion("Temporary belt doorway",arch_outline(2.41,5.77,4.79,.78),-3.02,.6,add=False)
F.boolean(lower,cut)
paint(lower,"iron")
PARTS.append(lower)
revolve("towerSkinCinderShoulderBelt",[(7.55,2.513),(7.57,2.568),(7.70,2.568),(7.74,2.536)],"iron",zs=.955)


def radial_bolt(name, deg, y, radius, zs):
    a=math.radians(deg)
    normal=Vector((math.sin(a),-math.cos(a),0))
    x,z=radius*math.sin(a),CENTER+radius*zs*math.cos(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.185,depth=.18,
                                      location=F.spec_to_blender(x,y,z))
    ob=bpy.context.object
    ob.name=name
    ob.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bevel(ob,.027,2)
    paint(ob,"gold")
    PARTS.append(ob)


for band,y,r,zs,angles in (("Lower",3.19,3.205,.825,(65,-65,108,-108,145,-145)),
                          ("Upper",7.635,2.62,.955,(30,-30,90,-90,150,-150))):
    for i,deg in enumerate(angles):
        radial_bolt(f"towerSkinCinder{band}BeltBolt{i}",deg,y,r,zs)

# Heavy pierced lifting lugs, cast with a foot that embeds into the neck.
for side in (-1,1):
    outline=[(2.18,8.12),(2.74,8.11),(3.06,8.36),(3.10,8.74),
             (2.98,9.0),(2.65,9.07),(2.35,8.91),(2.18,8.62)]
    outline=[(side*x,y) for x,y in outline]
    lug=extrusion(f"towerSkinCinderLiftingLug{side}",outline,-2.84,-2.36,add=False)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.225,depth=1.0,
        location=F.spec_to_blender(side*2.72,8.63,-2.6),rotation=(math.pi/2,0,0))
    cutter=bpy.context.object
    F.boolean(lug,cutter)
    bevel(lug,.075,2)
    paint(lug,"iron")
    PARTS.append(lug)

# An off-axis maker's plate with one purposeful angular foundry rune.
plate=extrusion("towerSkinCinderMakersPlate",[(-1.02,6.33),(-.73,6.16),(-.15,6.28),(.02,6.85),(-.34,7.18),(-.89,7.03)],-.91,-.51,add=False)
bevel(plate,.065,2)
paint(plate,"gold")
PARTS.append(plate)
rune=[(-.72,6.37),(-.61,6.40),(-.48,6.73),(-.24,6.91),(-.30,7.00),
      (-.57,6.81),(-.70,6.99),(-.80,6.92),(-.62,6.66)]
extrusion("towerSkinCinderMakerRune",rune,-.525,-.492,"iron")
fastener("towerSkinCinderPlatePin",-.76,6.92,-.49,.078)

# One functional apron casting follows both engine surfaces exactly. A thin
# blackened bevel around it reads as an extension of the furnace's iron sole.
vol=TG.engine_volumes(SPEC)
ra,rb=TG.box_top_plane(vol["apron"])
la,lb=TG.box_top_plane(vol["lip"])
cross=(ra-la)/(rb-lb)
zvals=[-1.5,0,cross,2.55,3.60,3.76]
top=[max(ra-rb*z,la-lb*z)-.025 for z in zvals]
v=[]
for z,y in zip(zvals,top):
    w=2.38 if z<3.5 else (2.3 if z<3.7 else 2.13)
    v.extend([(-w,y,z),(w,y,z),(-w,-.56,z),(w,-.56,z)])
f=[(0,2,3,1),(len(v)-4,len(v)-3,len(v)-1,len(v)-2)]
for j in range(len(zvals)-1):
    a,b=j*4,(j+1)*4
    f += [(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)]
apron=mesh("towerSkinCinderApron",v,f,"iron")

# Parallel worn channels stay BELOW both collider planes. Their faint warm
# edges and deep centers read as hammered wear without obstructing a die.
for i,x in enumerate((-1.70,-1.18,-.64,.13,.81,1.52)):
    v=[]
    zs=[.06+(i%3)*.17,cross,2.84+(i%2)*.29]
    for z in zs:
        y=max(ra-rb*z,la-lb*z)-.016
        width=.024 if i%2 else .037
        # These are embedded wear strips in the apron casting, seated down
        # to its underside, so each carries its real cladding classification.
        v.extend([(x-width,y,z),(x+width,y,z),(x-width,-.555,z),(x+width,-.555,z)])
    f=[(0,2,3,1),(8,9,11,10)]
    for j in range(2):
        a,b=j*4,(j+1)*4
        f += [(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)]
    mesh(f"towerSkinCinderApronWear{i}",v,f,"dark")

pin,pout=F.tower_portals(PORTAL_IN,PORTAL_OUT)

# Assertions inspect finished vertices and ray intersections, never just the
# dimensional constants. They have already caught scope/plane errors in other
# authors' work; the new shapes receive the same questions independently.
alltris=K.tri_array(PARTS)
lo=alltris.reshape(-1,3).min(axis=0)
hi=alltris.reshape(-1,3).max(axis=0)
print("[cinderbell] built app bounds",lo.tolist(),hi.tolist())
assert max(abs(lo[0]),abs(hi[0])) <= 3.25
assert 10.29 <= hi[1] <= 10.31
K.gate_approach(PARTS,SPEC,"cinderbell")
K.gate_throat(PARTS,SPEC,"cinderbell")

# Save editable castings before flattening export draw calls. Material groups
# preserve closed components, and the apron never enlarges the body's bounds.
for ob in PARTS:
    F.smooth_by_angle(ob,27)
os.makedirs(F.OUT_DIR,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(F.OUT_DIR)/"cinderbell.blend"))
print("[cinderbell] editable",str(Path(F.OUT_DIR)/"cinderbell.blend"))
groups={}
for ob in PARTS:
    cls="Apron" if ob.name.startswith("towerSkinCinderApron") else "Body"
    # The audit leans an entire bounding box; combining the wide low skirt
    # belt with the tall narrow lip would create a fictitious wide crown.
    if ob.name=="towerSkinCinderLowerBelt":
        cls="BodyLowerBelt"
    mat=ob.data.materials[0]
    groups.setdefault((cls,mat.name),[]).append(ob)
export_meshes=[]
for index,((cls,matname),sources) in enumerate(sorted(groups.items())):
    bpy.ops.object.select_all(action="DESELECT")
    clones=[]
    for source in sources:
        copy=source.copy()
        copy.data=source.data.copy()
        bpy.context.collection.objects.link(copy)
        copy.select_set(True)
        clones.append(copy)
    bpy.context.view_layer.objects.active=clones[0]
    if len(clones)>1:
        bpy.ops.object.join()
    merged=clones[0]
    merged.name=f"towerSkinCinder{cls}Material{index}"
    merged.data.name=merged.name+"Mesh"
    export_meshes.append(merged)
print(f"[cinderbell] {len(PARTS)} editable meshes -> {len(export_meshes)} exported material/class groups")
path=F.finish("cinderbell",export_meshes+[pin,pout],budget=22000,smooth_deg=27,
              vertex_colors=True,ground=False)
