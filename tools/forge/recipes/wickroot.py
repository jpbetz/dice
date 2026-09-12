# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Wickroot — a traveller's sanctuary grown inside an ancient lightning cedar.

The base grips the ground in unequal buttresses; a short, broad old stump
rises into three wind-torn crown shoulders. Angular bark channels, exposed
heartwood, a sheltered amber votive, and a small cluster of worn copper
pilgrim tokens tell its history. The large black crown and lower wound are
the dice portals. This is an entirely new mesh and recipe; only generic
forge export/measurement utilities are reused. No existing tower geometry
or tower recipe was read. Prototype family pairing: warm wood / amber dice.

Design inputs: <=22,000 study triangles, |x|<=3.25, crown<=10.5, entry clearR2,
rim7.7, exit4.2x3.375 over sill1. Towerplan binding front height8.564.
Measured final shape: 18,294 triangles, 563.7 KiB GLB, 16 mesh primitives;
app bounds (-3.182,-0.560,-5.190)..(3.208,9.866,3.798). Both portals
25/25 clear; cowl/shaft99/99 at all6 eyes; no below-sill leaks (0/2304);
ramp81/81 and lip162/162 clad. The closest vanish is y8.02 at wide.full.
The first doorway split at y5.84 exposed one close.mini cowl sample in the
exported-file gate; lowering its apex closed it. The final lower entry exposed
the low door/cowl overlap, so the door adopted the measured3.375 clear height
and rim settled at7.7. A sill0.75 experiment exposed a kit inconsistency:
the physical ramp's y-intercept1.047 contradicts throat rays based on sill0.75;
the final model retains sill1 and needs no checker exception. After its CSG
cut,120 shared-diagonal hazard faces are poked before triangulation to prevent
four-face edges. No weld/sliver or decimation repair is used.
The final visible threshold sliver was embedded under the heartwood by
compressing its below-sill vertex columns to the measured ramp plane.
Consecutive final bake digests: set eb06f22ec8c8f180, order846a2d7e33f61889.

Intentional guidance departures: main's first LOOK rejected flute-like bark
and the rectangular tongue. The study allows22k instead of the15k tower
budget for flowing nonperiodic bark, real knot shoulders, and heartwood grain;
main explicitly authorized18–22k for a more convincing prototype.
The .blend is retained so this is an editable Blender model, not only a GLB.
"""

import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forge as F
import towerkit as K
import towergates as TG

PORTAL_IN = {"x": 0.0, "rimY": 7.7, "z": -2.6, "clearR": 2.0}
PORTAL_OUT = {"x": 0.0, "sillY": 1.0, "w": 4.2, "clearH": 3.375}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
N = 160
LAYERS = 38

F.reset()
MAT_BARK = F.vertex_color_material("Wickroot warm cedar", "Col", roughness=0.93, specular_level=0.13)
MAT_COPPER = F.vertex_color_material("Wickroot aged copper", "Col", roughness=0.72, specular_level=0.35)
MAT_COPPER.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.62
MAT_AMBER = F.vertex_color_material("Wickroot sheltered amber", "Col", roughness=0.32,
                                   emission=(0.45, 0.13, 0.018))


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(rgb):
    return tuple(linear(clamp(c, 0, 1)) for c in rgb)


def gauss_angle(a, b, width):
    d = math.atan2(math.sin(a - b), math.cos(a - b))
    return math.exp(-(d / width) ** 2)


def crown(a):
    # Deliberately no regular battlement rhythm: a principal lightning spur,
    # a broad rear blade, and a short opposite tooth surrounding the split.
    return (8.70 + .85 * gauss_angle(a, -1.34, 0.42)
            + 1.23 * gauss_angle(a, 2.18, 0.45)
            + 0.78 * gauss_angle(a, 0.81, 0.34)
            + 0.085 * math.sin(8 * a + 0.4)
            - 0.20 * gauss_angle(a, -0.73, 0.11)
            - 0.18 * gauss_angle(a, 1.48, 0.12))


def groove(a, y):
    # Seven uneven spiral bark rivers, each its own pitch and lifetime.
    ridges=[(-2.80,.065,.21,1.0),(-1.83,.083,.25,.85),(-.91,.059,.29,1.1),
            (-.10,.091,.22,.72),(.83,.052,.26,1.0),(1.72,.077,.23,.81),
            (2.68,.061,.29,.94)]
    value=0.0
    for i,(angle,pitch,width,weight) in enumerate(ridges):
        center=angle+pitch*y+.06*(2*abs(2*((y/3.1+i*.23)%1)-1)-1)
        length=1.0
        if i==1:length=.35+.65/(1+math.exp((y-7.4)*2))
        if i==4:length=.35+.65/(1+math.exp((3.0-y)*2))
        distance=abs(math.atan2(math.sin(a-center),math.cos(a-center)))
        peak=max(0,1-distance/width)
        value+=weight*length*peak
        # A broad division forming a secondary root branch, not a full-height
        # repeated parallel groove. Its fork opens only below its own knot.
        if i in (0,3,5):
            bend=clamp((5.0-y)/5.0,0,1)*.39
            value+=.52*length*gauss_angle(a,center-bend,width*.65)*clamp((6.4-y)/3,0,1)
    return value


def surface(a, y):
    # Long undulating buttresses ARE the skin, not sticks attached to a pipe.
    twist = 0.073 * y + 0.07 * math.sin(y * 0.62)
    q = a - twist
    roots = sum(w * gauss_angle(q, ang, width) for ang, w, width in [
        (-1.22, 0.91, 0.30), (1.15, 0.79, 0.29), (2.47, 0.69, 0.24),
        (-2.31, 0.67, 0.27), (0.30, 0.42, 0.20)])
    base = 2.24 + 0.08 * (y / 12.0) + 0.42 * math.exp(-y / 1.8)
    broad = (0.11 * math.sin(3 * q + 0.2) + 0.045 * math.cos(5 * q - y * 0.13))
    r = base + broad + roots * math.exp(-y / 3.5)
    r += (.29+.10*math.exp(-y/2.0))*groove(a,y)
    r += 0.026 * math.sin(17 * a + .31*y) * math.sin(1.5*y+3*a)
    # Short faceted bark plates overlap in height. Their lower breaks are
    # actual discontinuities in the surface field; narrow transition bands
    # create broken shelves of bark instead of polished sine-wave tubes.
    for pa,py,pw,ph,pr in [(-1.8,3.3,.24,1.4,.14),(-.52,5.5,.20,1.1,.13),
                          (.22,6.6,.25,.95,.11),(.91,3.6,.22,1.7,.16),
                          (1.75,6.0,.23,1.0,.15),(2.49,4.2,.25,1.3,.14)]:
        d=abs(math.atan2(math.sin(a-pa-.065*y),math.cos(a-pa-.065*y)))
        angular=max(0,1-d/pw)
        vertical=clamp((y-(py-ph))/.11,0,1)*clamp((py+ph-y)/ph,0,1)
        r+=pr*angular*vertical
    # Two large native knot shoulders interrupt the trunk's uninterrupted
    # vertical flow. Their central dimples are cut into the radial field.
    for ka,ky,kw,yw,depth in [(-.75,6.9,.25,.68,.27),(1.20,4.8,.28,.65,.29)]:
        r += depth*gauss_angle(a,ka,kw)*math.exp(-((y-ky)/yw)**2)
        r -= .15*gauss_angle(a,ka,kw*.32)*math.exp(-((y-ky)/(yw*.31))**2)
    # The front wall must carry the whole shadow, so maintain thickness there.
    r = max(r, 2.25)
    cx = -0.21 * math.sin(y * 0.40)
    cz = -2.60 + 0.085 * math.sin(y * 0.44)
    x = cx + r * math.sin(a)
    z = cz + r * math.cos(a)
    # Soft bounded compression preserves a flowing contour at the socket.
    if abs(x)>2.65:
        x=math.copysign(2.65+.54*math.tanh((abs(x)-2.65)/.54),x)
    z = clamp(z, -5.19, 0.19)
    return x, y, z


def shell():
    verts, faces = [], []
    for j in range(LAYERS + 1):
        t = j / LAYERS
        for i in range(N):
            a = 2 * math.pi * i / N
            y = t * crown(a)
            verts.append(F.spec_to_blender(*surface(a, y)))
    inner_start = len(verts)
    IL = 12
    for j in range(IL + 1):
        t = j / IL
        for i in range(N):
            a = 2 * math.pi * i / N
            y = t * (crown(a) - 0.13)
            r = 2.055 + 0.012 * math.sin(a * 8 + y * 0.3)
            verts.append(F.spec_to_blender(r * math.sin(a), y, -2.6 + r * math.cos(a)))
    for j in range(LAYERS):
        for i in range(N):
            ni = (i + 1) % N
            faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
    for j in range(IL):
        for i in range(N):
            ni = (i + 1) % N
            faces.append((inner_start+j*N+i, inner_start+(j+1)*N+i,
                          inner_start+(j+1)*N+ni, inner_start+j*N+ni))
    for i in range(N):
        ni = (i + 1) % N
        faces.append((LAYERS*N+i, LAYERS*N+ni, inner_start+IL*N+ni, inner_start+IL*N+i))
        faces.append((i, inner_start+i, inner_start+ni, ni))
    ob = F.obj_from_pydata("towerSkinWickrootLivingTrunk", verts, faces)
    F.recalc_normals(ob)
    return ob


def extrusion(name, polygon, z0, z1):
    vs = [F.spec_to_blender(x, y, z) for z in (z0, z1) for x, y in polygon]
    n = len(polygon)
    fs = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    fs += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    ob = F.obj_from_pydata(name, vs, fs)
    F.recalc_normals(ob)
    return ob


def ellipsoid(name, pos, scale, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings,
                                       location=F.spec_to_blender(*pos))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Generic gates operate on geometry coordinates; bake object positions in.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def sweep(name, points, widths, sides=8):
    pts = [F.spec_to_blender(*p) for p in points]
    vs, fs = [], []
    for j, p in enumerate(pts):
        tangent = (pts[min(j+1,len(pts)-1)] - pts[max(0,j-1)]).normalized()
        side = tangent.cross(Vector((0.1, 0.3, 1))).normalized()
        other = tangent.cross(side).normalized()
        for i in range(sides):
            a = i * 2 * math.pi / sides
            vs.append(p + widths[j] * (side * math.cos(a) + other * math.sin(a)))
    fs.append(tuple(reversed(range(sides))))
    for j in range(len(pts)-1):
        for i in range(sides):
            ni = (i+1)%sides
            fs.append((j*sides+i, j*sides+ni, (j+1)*sides+ni, (j+1)*sides+i))
    fs.append(tuple((len(pts)-1)*sides+i for i in range(sides)))
    ob=F.obj_from_pydata(name,vs,fs)
    F.recalc_normals(ob)
    return ob


trunk = shell()
# A wound with an oblique split at the crown of the doorway. The throat's
# square reservation lives entirely inside this more generous irregular hole.
door = extrusion("wickrootDoorTool", [(-2.12,.98),(2.13,.98),(2.31,1.75),
    (2.28,2.72),(2.17,3.74),(2.17,4.39),(1.60,4.41),(.64,4.44),
    (-.20,4.44),(-1.18,4.42),(-2.17,4.39),(-2.17,3.80),(-2.35,2.71),
    (-2.32,1.72)], -3.20, 1.0)
F.boolean(trunk, door)
# The intact threshold follows the engine floor where it faces the player.
# Its former flat y.98 edge protruded through the falling ramp at z.19 and
# looked like a stray twig. Clamp the built below-sill vertices to that plane;
# the actual heartwood cladding sits .012 above it and covers this join.
ramp_a,ramp_b=TG.box_top_plane(TG.engine_volumes(SPEC)["apron"])
threshold_lowered=0
for vertex in trunk.data.vertices:
    x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
    if abs(x)<2.10 and z>0 and y<=.981:
        ceiling=ramp_a-ramp_b*z-.018
        if ceiling<.98 and y>0:
            # Scale the local column instead of flattening all its upper
            # vertices onto one plane: the latter collapsed two CSG slivers.
            vertex.co.z=y*ceiling/.98
            threshold_lowered+=1
print("[wickroot] threshold vertices embedded under heartwood",threshold_lowered)
# Exact CSG can leave two n-gons claiming the same triangulation diagonal.
# Poke only those hazard faces, before paint, so canonical triangulation
# cannot manufacture a four-face edge (forge's documented trap12).
import bmesh
bm=bmesh.new();bm.from_mesh(trunk.data);bm.verts.ensure_lookup_table()
for i,v in enumerate(bm.verts):v.index=i
real_edges={tuple(sorted(v.index for v in e.verts)) for e in bm.edges}
claims={}
for face in bm.faces:
    vs=list(face.verts);n=len(vs)
    if n<4:continue
    for i in range(n):
        for j in range(i+2,n):
            if i==0 and j==n-1:continue
            pair=tuple(sorted((vs[i].index,vs[j].index)))
            claims.setdefault(pair,[]).append(face)
hazards=set()
for pair,faces in claims.items():
    if pair in real_edges or len(faces)>1:hazards.update(faces)
if hazards:
    print("[wickroot] poking shared-diagonal CSG hazard faces",len(hazards))
    bmesh.ops.poke(bm,faces=list(hazards))
bm.to_mesh(trunk.data);bm.free();F.recalc_normals(trunk)


def bark_paint(poly, p):
    x, y, z = p.x, p.z, -p.y
    a = math.atan2(x, z+2.6)
    radial = math.hypot(x,z+2.6)
    g = groove(a,y)
    mottled = 0.025*math.sin(7*x+2.5*y) * math.sin(8*z-1.7*y)
    # Angular normal sees the inner wall independent of post-boolean topology.
    radial_normal = poly.normal.x*x - poly.normal.y*(z+2.6)
    inside = radial < 2.10 and radial_normal < 0.12
    if inside:
        lip = clamp((y-8.0)/3.0,0,1)
        return color((0.050+0.045*lip,0.031+0.025*lip,0.022+0.017*lip))
    if y > crown(a)-0.18:
        return color((0.44+0.045*g,0.36+0.037*g,0.25+0.028*g))
    # Warm smooth exposed fibres along the torn doorway, read at game distance.
    door_roof=4.62-0.075*abs(x)
    exposed = z > -1.78 and abs(x)<2.28 and 4.37<y<door_roof+.08
    if exposed:
        return color((0.37+0.045*g,0.29+0.035*g,0.18+0.02*g))
    v=.18 + .06*g + mottled + .012*math.sin(a*5+y*.8)
    fissure = 0.0
    for j in range(19):
        ca=-math.pi+j*.342+.07*math.sin(j*2.7)+(.045+.013*math.sin(j))*y
        stop=3.3+(j%6)*1.4
        life=clamp((stop-y)/.7,0,1)*clamp((y-.28*(j%5))/.6,0,1)
        fissure=max(fissure,gauss_angle(a,ca,.028+.012*(j%3))*life)
    v-=fissure*.065
    moss=max(0,math.sin(3*a+.8))*max(0,1-y/4.2)*(.05+.06*max(0,1-g))
    return color((v*1.08-moss*.14,v*.96+moss*.30,v*.78+moss*.13))


F.single_material(trunk,MAT_BARK)
F.paint_corners(trunk,"Col",bark_paint)
meshes=[trunk]

# The previous tall horn distracted from the stump. Removing it leaves the
# crown's own fractured shoulders as the entire upper silhouette.

# Root shoulders curve around the lower wound and disappear into the trunk.
# They are broad, asymmetrical buttresses: deliberately too stout to read as
# a collection of loose branches wrapped around an otherwise straight tube.
for name, points, widths in [
    ("LeftGrip",[(-2.82,.15,-.64),(-2.72,.66,-.94),(-2.53,1.65,-1.05),
                 (-2.47,2.77,-1.38),(-2.33,4.2,-1.7)], [.22,.47,.43,.36,.19]),
    ("RightGrip",[(2.85,.10,-.60),(2.79,.63,-.92),(2.55,1.8,-1.18),
                  (2.54,3.05,-1.55)], [.19,.43,.44,.20]),
    ("RearGrip",[(-1.96,.12,-4.72),(-2.26,.6,-4.30),(-2.30,1.65,-3.92),
                 (-2.15,3.12,-3.51)],[.19,.48,.39,.20])]:
    ob=sweep("towerSkinWickroot"+name,points,widths,10)
    F.single_material(ob,MAT_BARK)
    F.paint_corners(ob,"Col",bark_paint)
    meshes.append(ob)

# A votive sheltered in a hollow knot: the frame is a closed elliptical tube,
# not a texture decal. The warm centre is deliberately small beside the mass.
def oval_ring(name,cx,cy,cz,rx,ry,tube):
    points=[]
    vs,fs=[],[]
    seg=32; sides=8
    for i in range(seg):
        a=2*math.pi*i/seg
        for j in range(sides):
            b=2*math.pi*j/sides
            vs.append(F.spec_to_blender(cx+(rx+tube*math.cos(b))*math.cos(a),
                cy+(ry+tube*math.cos(b))*math.sin(a),cz+tube*math.sin(b)))
    for i in range(seg):
        for j in range(sides):
            fs.append((i*sides+j,((i+1)%seg)*sides+j,
                       ((i+1)%seg)*sides+(j+1)%sides,i*sides+(j+1)%sides))
    ob=F.obj_from_pydata(name,vs,fs);F.recalc_normals(ob);return ob

frame=oval_ring("towerSkinWickrootVotiveKnot",-0.87,7.05,-.235,.44,.70,.145)
F.single_material(frame,MAT_BARK)
F.paint_corners(frame,"Col",lambda p,v:color((.31,.19,.105)))
meshes.append(frame)
amber=ellipsoid("WickrootAmberHeart",(-.87,7.05,-.265),(.315,.535,.075),20,10)
F.single_material(amber,MAT_AMBER)
F.paint_corners(amber,"Col",lambda p,v:color((.62,.31,.068)))
meshes.append(amber)
for j in range(3):
    x=-1.065+j*.195
    ob=sweep("WickrootVotiveCopperRib"+str(j),[(x,6.60,-.15),(x,7.05,-.13),(x,7.49,-.17)],
              [.035,.028,.03],6)
    F.single_material(ob,MAT_COPPER)
    F.paint_corners(ob,"Col",lambda p,v:color((.35,.25,.14)))
    meshes.append(ob)

# Three pilgrim coins pinned into the bark with unequal drooping copper ties.
for i,(angle,y,r) in enumerate([(.48,6.98,.20),(.63,6.49,.15),(.44,6.23,.17)]):
    x,_,z=surface(angle,y)
    z+=.14
    tie=sweep("WickrootCopperTie"+str(i),[(x-.05,y+.6,z-.1),(x+.025,y+.3,z+.025),(x,y+.07,z)],
              [.024,.025,.028],6)
    coin=ellipsoid("WickrootPilgrimToken"+str(i),(x,y,z),(r,r*1.2,.045),12,6)
    for ob in [tie,coin]:
        F.single_material(ob,MAT_COPPER)
        F.paint_corners(ob,"Col",lambda p,v:color((.34+.05*math.sin(v.z*5),.27,.14)))
        meshes.append(ob)

# The exposed heartwood runs out of the wound over the existing engine floor.
# It is one smooth slab with a scalloped far edge; no rails or new colliders.
def tongue():
    v=TG.engine_volumes(SPEC)
    ramp=TG.box_top_plane(v["apron"])
    lip=TG.box_top_plane(v["lip"])
    zs=[-3.7,-2.5,-1.2,0,.6,1.455,2.2,2.9,3.58,3.78]
    xs=[-1+j/12 for j in range(25)]
    vs=[]
    for k,z in enumerate(zs):
        for j,u in enumerate(xs):
            width=2.12+.13*(.5+.5*math.sin(z*2.1+.4))
            x=u*width+.027*math.sin(z*1.5)*(1-u*u)
            actual_z=z
            if k==len(zs)-1:
                actual_z=3.77-.13*abs(u)**1.2+.035*math.cos(7*u+.7)
            y=max(ramp[0]-ramp[1]*actual_z,lip[0]-lip[1]*actual_z,0)+.012
            if k==len(zs)-1:
                y=-.02
            vs.append(F.spec_to_blender(x,y,actual_z))
    count=len(vs)
    vs += [Vector((p.x,p.y,-.56)) for p in vs]
    fs=[];n=len(xs);rows=len(zs)
    for k in range(rows-1):
        for j in range(n-1):
            a=k*n+j
            fs.append((a,a+1,a+n+1,a+n))
            fs.append((count+a,count+a+n,count+a+n+1,count+a+1))
    border=list(range(n))+[k*n+n-1 for k in range(1,rows)]+list(range((rows-1)*n+n-2,(rows-1)*n-1,-1))+[k*n for k in range(rows-2,0,-1)]
    for i,a in enumerate(border):
        b=border[(i+1)%len(border)];fs.append((a,b,count+b,count+a))
    ob=F.obj_from_pydata("towerSkinWickrootHeartwoodTongue",vs,fs);F.recalc_normals(ob)
    F.single_material(ob,MAT_BARK)
    def paint(poly,p):
        x,z=p.x,-p.y
        field=x+.10*math.sin(z*.68)+.045*math.sin(z*1.7+x)
        grain=.025*math.cos(13*field)+.012*math.cos(37*field+.7*z)
        crack=0
        for k in range(9):
            line=-2.05+k*.48+.12*math.sin(k*3.7)+.045*math.sin(z*.72+k)
            start=-2.6+(k%4)*1.1
            life=clamp((z-start)/.5,0,1)
            crack=max(crack,math.exp(-((x-line)/(.028+.008*(k%3)))**2)*life)
        # The outer run ages into the floor; its edge is light only in broken
        # fibres, never one pale rectangular border.
        worn=clamp((z-1.5)/2.2,0,1)
        edge=max(0,abs(x)-1.97)*max(0,math.sin(z*5.8+x*3))*.18
        v=.32+grain-.12*crack-.08*worn+edge
        return color((v*1.07,v*.87,v*.63))
    F.paint_corners(ob,"Col",paint)
    return ob

clad=tongue();meshes.append(clad)
portals=list(F.tower_portals(PORTAL_IN,PORTAL_OUT))

for ob in meshes:
    F.canonicalize(ob)
    F.triangulate(ob)
    F.smooth_by_angle(ob,16 if ob==trunk else 25)
    nm,vol=F.manifold_report(ob)
    if nm:
        import bmesh
        bm=bmesh.new();bm.from_mesh(ob.data)
        print("Nonmanifold detail",[(len(e.link_faces),[tuple(v.co) for v in e.verts]) for e in bm.edges if not e.is_manifold])
        bm.free()
        raise RuntimeError(f"{ob.name}: {nm} non-manifold edges")

F.assert_budget(meshes,22000)
F.assert_outward(meshes)
K.run_battery(meshes,SPEC,tag="wickroot",x_lim=3.25,crown_max=12.5,
              clad=[clad.name],occluder=[trunk])
K.gate_front_carries_the_dark([trunk],SPEC,"wickroot",None)
F.report_bounds(meshes,"wickroot measured")
F.export_glb("wickroot",meshes+portals,vertex_colors=True)
import foundry_scene
foundry_scene.prepare("Wickroot",height=4.6)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(F.OUT_DIR,"wickroot.blend"))
