# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Cairnwatch — a salt-worn octagonal abbey watchtower, built greenfield.

The inherited assumption rejected here is that a tower needs a square castle
body and a row of identical battlements. This is a surviving coastal fragment:
broad Romanesque exit, tightly bonded ashlar, stepped diagonal buttresses, and
a broken wall rising toward one tiny bronze beacon. The stone does the work;
bronze gives the eye two deliberate accents. No prior tower geometry is used.

Design envelope: x +/-3.25, z -5.25..0.25, crown <=12.5; entry clearR 2.03,
rim 9.1; exit 4.35 by 3.7 at sill 1.0. Planned with towerplan before geometry.
Measured revision 3: 18166 triangles, x +/-3.141, top 12.49; the 15k guidance
is set aside for individually fractured stone faces and the full-depth broken
crown (main LOOK requested the extra geometry). Built bounds, approach, exit
and light-blocking are measured from finished vertices; blend accompanies GLB.
The final front has one extra ashlar course and a raised recessed inner bed:
current square-table camera rays required 10.962u at the front, whereas the
old bake reference falsely accepted the lower course. Portals and rear ruin
remain unchanged; all six current eyes now hide both 99-sample bands.
"""
import math
import os
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forge as F
import towerkit as K
import towergates as TG

PORTAL_IN = {"x": 0.0, "rimY": 9.1, "z": -2.5, "clearR": 2.03}
PORTAL_OUT = {"x": 0.0, "sillY": 1.0, "w": 4.35, "clearH": 3.7}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
AZ = -2.5
BUDGET = 21000  # Prototype art exception: weather and full-depth ruin stones.
RNG = random.Random(93672)
F.reset()
stone_mat = F.vertex_color_material("Salt worn limestone", "Col", roughness=.94, specular_level=.18)
bronze_mat = F.vertex_color_material("Verdigris bronze", "Col", roughness=.69, specular_level=.32)
bronze_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .48
dark_mat = F.vertex_color_material("Deep stone", "Col", roughness=.98, specular_level=.02)
glow_mat = F.vertex_color_material("Beacon amber", "Col", roughness=.8, emission=(.7,.27,.045))


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055)/1.055)**2.4


def paint(ob, srgb, mat=stone_mat, grit=.016):
    F.recalc_normals(ob)
    salt = RNG.random()*70
    def color(poly, p):
        n = math.sin(p.x*9.2+p.y*6.1+p.z*8.7+salt)*grit
        # Weather is vertical: ledges darken and undersides keep damp salts.
        shade = -.028 if poly.normal.z < -.25 else 0
        saltpatch=max(0,math.sin(p.x*3.7+p.y*2.8+salt)*math.cos(p.z*4.1+salt)-.38)*.15 if p.z<3.1 else 0
        return tuple(linear(max(.015,min(.8,c+n+shade+saltpatch))) for c in srgb)
    F.paint_corners(ob, "Col", color)
    F.single_material(ob, mat)
    return ob


def mesh(name, verts, faces):
    ob = F.obj_from_pydata(name, [F.spec_to_blender(*p) for p in verts], faces)
    F.recalc_normals(ob)
    return ob


def prism(name, outline, zback, zfront):
    # outline is a planar x/y loop; the volume is extruded toward the viewer.
    n = len(outline)
    vs = [(x,y,z) for z in (zback,zfront) for x,y in outline]
    fs = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, vs, fs)


def bevel(ob, width=.035):
    md=ob.modifiers.new('Edges worn by salt','BEVEL')
    md.width=width; md.segments=1
    F.bake(ob)
    return ob


def weather(ob, amount=.06):
    """Coarse chipped stone faces, built into geometry before export."""
    bm=bmesh.new(); bm.from_mesh(ob.data)
    faces=[f for f in bm.faces if f.calc_area()>.13 and abs(f.normal.z)<.60]
    for f in faces:
        if RNG.random()<.68:
            normal=f.normal.copy()
            result=bmesh.ops.poke(bm,faces=[f],offset=0,use_relative_offset=False)
            for vert in result['verts']:
                vert.co-=normal*(amount*RNG.uniform(.6,1.25))
    for vert in bm.verts:
        # Salt rounds corners asymmetrically; small vertical offsets disturb
        # the perfect CAD edges while retaining the bonded courses.
        vert.co.z += RNG.uniform(-.025,.025)
    bm.to_mesh(ob.data); bm.free(); F.recalc_normals(ob)
    return ob


def join(name, obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    bpy.ops.object.join()
    ob=obs[0]; ob.name=name
    return ob


def oct_point(angle, radius, y):
    return (radius*math.sin(angle), y, AZ+radius*math.cos(angle))


# The square table's actual wide eye needs a 10.96 front silhouette. Keep
# the rear ruin intact; one short front course covers the vanish sightline.
# The lighter stone crown remains above the recessed structural bed.
RUIN_HEIGHTS=[(11.10,11.25,11.10),(11.10,10.95,10.72),
              (10.62,11.17,10.76),(10.77,10.52,10.21),
              (10.47,11.13,10.43),(11.14,11.83,11.23),
              (11.83,12.02,11.83),(11.83,11.27,11.10)]


angles=[math.radians(-22.5)+i*math.pi/4 for i in range(8)]


def ring(name, rout, rin, bottom, tops):
    vs=[]
    for r in (rout,rin):
        vs += [oct_point(a,r,bottom) for a in angles]
        vs += [oct_point(a,r,tops[i]) for i,a in enumerate(angles)]
    fs=[]
    for i in range(8):
        j=(i+1)%8
        fs.extend([(i,j,8+j,8+i),(16+j,16+i,24+i,24+j),
                   (8+i,8+j,24+j,24+i),(j,i,16+i,16+j)])
    return mesh(name,vs,fs)


# The segmental arch clears the full rectangular portal before it curves.
spring=4.08; arch_rx=2.39; arch_ry=1.5
outline=[(-arch_rx,-.6),(arch_rx,-.6),(arch_rx,spring)]
outline += [(arch_rx*math.cos(i*math.pi/20), spring+arch_ry*math.sin(i*math.pi/20)) for i in range(1,21)]
door=prism('construction_door',outline,-3.8,1.0)


def carve(ob):
    lo,hi=F.world_bounds([ob])
    if lo.z < 5.64 and -lo.y > -3.8 and lo.x < 2.40 and hi.x > -2.40:
        F.boolean(ob,door,keep_cutter=True)
        if ob.data.vertices:
            afterlo,afterhi=F.world_bounds([ob])
            grew=any(afterlo[i]<lo[i]-.001 or afterhi[i]>hi[i]+.001 for i in range(3))
            if grew:
                # A sub-millimetre facing sliver at an arch tangent can flip
                # the exact CSG answer into the operand. A subtraction may
                # never grow its measured box. Omit that entire ruined facing
                # stone; the separate structural bed remains intact.
                assert ob.name.startswith('Ashlar'), f'Carve expanded {ob.name}'
                print('[cairnwatch] omitting arch-tangent facing that expanded:',ob.name)
                ob.data.clear_geometry()
    return ob


core=ring('towerSkinCairnCore',2.865,2.255,.02,[10.95,10.95,10.52,9.98,9.98,9.98,9.98,10.52])
carve(core)
def core_color(poly,p):
    rr=math.hypot(p.x,-p.y-AZ)
    val=.075 if rr < 2.40 and p.z<8.5 else .23
    return tuple(linear(v) for v in (val*.91,val,val*1.015))
F.paint_corners(core,'Col',core_color); F.single_material(core,dark_mat)

stones=[]
for side in range(8):
    a0=angles[side]; a1=angles[(side+1)%8]
    if a1<a0: a1+=2*math.pi
    for row in range(18):
        yl=.06+row*.71; yh=yl+.671
        if yl>max(RUIN_HEIGHTS[side])-.10: continue
        # Alternating unequal joints give a bonded wall, with no procedural grid.
        cuts=([0,1/3,2/3,1] if row>=14 else ([0,.48,1] if row%2==0 else [0,.25,.73,1]))
        for j in range(len(cuts)-1):
            u0=cuts[j]+.007; u1=cuts[j+1]-.007
            tm=(u0+u1)/2
            top=RUIN_HEIGHTS[side][min(2,int(tm*3))]
            yt0=min(yh,top+RNG.uniform(-.05,.025))
            yt1=min(yh,top+RNG.uniform(-.025,.045))
            if min(yt0,yt1)<=yl+.11: continue
            # Stone corners lie on octagon faces; the recipe never makes a tube.
            va=Vector(oct_point(a0,2.956,0)); vb=Vector(oct_point(a1,2.956,0))
            ir=2.255 if row>=14 else 2.817
            ia=Vector(oct_point(a0,ir,0)); ib=Vector(oct_point(a1,ir,0))
            vs=[]
            for p,q in ((ia,ib),(va,vb)):
                l=p.lerp(q,u0); r=p.lerp(q,u1)
                vs += [(l.x,yl,l.z),(r.x,yl,r.z),(r.x,yt1,r.z),(l.x,yt0,l.z)]
            ob=mesh('Ashlar',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
            bevel(ob,.030+RNG.random()*.043)
            carve(ob)
            if not len(ob.data.polygons): F.delete(ob); continue
            weather(ob,.055)
            tone=RNG.uniform(-.070,.060)
            # Moss remains a restrained damp stain low on the shaded feet.
            c=(.445+tone,.452+tone,.445+tone)
            if row<4: c=(.430+tone,.416+tone,.377+tone)
            if row<3 and side in (3,4,5): c=(.335+tone,.365+tone,.318+tone)
            paint(ob,c); stones.append(ob)

# Four load-bearing stepped buttresses, aligned with the octagon corners.
for ai in (65,115,245,295):
    a=math.radians(ai); n=Vector((math.sin(a),0,math.cos(a))); t=Vector((math.cos(a),0,-math.sin(a)))
    for row in range(11):
        yl=.055+row*.68; yh=yl+.641
        r,w=(3.30,.40) if row<2 else (3.17,.345) if row<7 else (3.01,.28)
        rt=r-.17 if row in (1,6,10) else r
        vs=[]
        for y,rr in ((yl,r),(yh,rt)):
            for depth,sign in ((2.57-rr,-1),(2.57-rr,1),(0,1),(0,-1)):
                p=n*(rr+depth)+t*(sign*w)
                vs.append((p.x,y,AZ+p.z))
        ob=mesh('Buttress quoin',vs,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        bevel(ob,.045); carve(ob); weather(ob,.045)
        tone=RNG.uniform(-.04,.04)
        paint(ob,(.40+tone,.416+tone,.397+tone)); stones.append(ob)

F.delete(door)
# A deep radial arch: every voussoir is a closed cut stone with a legible keystone.
for i in range(13):
    a0=i*math.pi/13+.007; a1=(i+1)*math.pi/13-.007
    outer_y=arch_ry+.48+(.14 if i==6 else 0)
    pts=[(arch_rx*math.cos(a0),spring+arch_ry*math.sin(a0)),
         ((arch_rx+.47)*math.cos(a0),spring+outer_y*math.sin(a0)),
         ((arch_rx+.47)*math.cos(a1),spring+outer_y*math.sin(a1)),
         (arch_rx*math.cos(a1),spring+arch_ry*math.sin(a1))]
    ob=bevel(prism('Arch voussoir',pts,-.69,.24),.03)
    weather(ob,.055)
    paint(ob,(.473,.477,.450),grit=.020); stones.append(ob)
for sign in (-1,1):
    for row in range(6):
        yl=.06+row*.666
        ob=prism('Door quoin',[(sign*2.40,yl),(sign*2.89,yl),(sign*2.89,yl+.624),(sign*2.40,yl+.624)],-.83,.24)
        bevel(ob,.048); weather(ob,.05); paint(ob,(.454,.451,.420)); stones.append(ob)

# A low stone skin follows the actual two engine planes, without a platform.
v=TG.engine_volumes(SPEC)
ra,rb=TG.box_top_plane(v['apron']); la,lb=TG.box_top_plane(v['lip'])
cross=(ra-la)/(rb-lb)
end=la/lb+.035  # past the zero crossing, so rounding cannot uncover the last ray
zs=[-1.9,0,cross,end]
ys=[ra-rb*z if z<=cross else la-lb*z for z in zs]
vs=[]
for z,y in zip(zs,ys): vs += [(-2.19,y-.018,z),(2.19,y-.018,z),(-2.19,-.54,z),(2.19,-.54,z)]
fs=[(0,2,3,1),(12,13,15,14)]
for k in range(3):
    j=4*k; fs += [(j,j+1,j+5,j+4),(j+2,j+6,j+7,j+3),(j,j+4,j+6,j+2),(j+1,j+3,j+7,j+5)]
apron=mesh('towerSkinCairnThreshold',vs,fs)
paint(apron,(.26,.280,.272),grit=.009)
pavers=[]
for j in range(7):
    z0=-.45+j*.58; z1=min(z0+.55,end)
    if z1<=z0: continue
    splits=[-2.19,-.60,2.19] if j%2==0 else [-2.19,.82,2.19]
    for k in range(2):
        x0=splits[k]+.017; x1=splits[k+1]-.017
        def plane(z): return (ra-rb*z if z<=cross else la-lb*z)-.003
        # Split at the kink: a single face may not bridge above the two planes.
        cuts=sorted({z0,z1}|({cross} if z0<cross<z1 else set()))
        for za,zb in zip(cuts,cuts[1:]):
            if za==cross: za+=.002
            if zb==cross: zb-=.002
            vv=[(x,plane(z)-d,z) for d in (.045,0) for x,z in ((x0,za),(x1,za),(x1,zb),(x0,zb))]
            ob=mesh('Threshold paver',vv,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
            tone=RNG.uniform(-.025,.025)
            def paver_color(poly,p):
                worn=.06*max(0,1-abs(p.x)/1.75)
                return tuple(linear(c+tone+worn) for c in (.31,.328,.311))
            F.paint_corners(ob,'Col',paver_color); F.single_material(ob,stone_mat); pavers.append(ob)
apron=join('towerSkinCairnThreshold',[apron]+pavers)

# A copper drip course follows the octagon; weather has left only selected runs.
bronzes=[]
for side in (0,1,2,4,5,6,7):
    a0=angles[side]; a1=angles[(side+1)%8]
    vs=[]
    for y,r in ((7.53,2.958),(7.58,2.968),(7.73,2.968),(7.79,2.958)):
        p=Vector(oct_point(a0,r,y)); q=Vector(oct_point(a1,r,y))
        # Physical breaks between surviving metal runs; shared caps weld into
        # four-face edges after GLB vertex welding, despite closed source parts.
        vs.extend([tuple(p.lerp(q,.014)),tuple(p.lerp(q,.986))])
    fs=[(0,2,4,6),(1,7,5,3),(0,1,3,2),(2,3,5,4),(4,5,7,6),(6,7,1,0)]
    ob=mesh('Bronze drip course',vs,fs); paint(ob,(.24,.385,.325),bronze_mat); bronzes.append(ob)

# A narrow blind lancet reads as architecture while keeping the interior opaque.
for side in (0,1,7):
    a=(angles[side]+(angles[side]+math.pi/4))/2
    n=Vector((math.sin(a),0,math.cos(a))); t=Vector((math.cos(a),0,-math.sin(a)))
    def onface(u,y,depth):
        p=n*depth+t*u
        return (p.x,y,AZ+p.z)
    outline=[(-.22,8.28),(.22,8.28),(.22,9.04),(0,9.40),(-.22,9.04)]
    vts=[onface(u,y,d) for d in (2.731,2.743) for u,y in outline]
    ob=mesh('Blind lancet',vts,[(4,3,2,1,0),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)])
    paint(ob,(.075,.105,.116),dark_mat); stones.append(ob)

# The surviving left shoulder supports a small harbor beacon, outside the bore.
def cylinder(name, center, radius, depth, vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=F.spec_to_blender(*center))
    ob=bpy.context.object; ob.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return ob

bx,bz=-2.44,-2.52
pedestal=prism('Beacon footing',[(bx-.29,11.59),(bx+.29,11.59),(bx+.29,12.015),(bx-.29,12.015)],bz-.26,bz+.26)
bevel(pedestal,.045); paint(pedestal,(.46,.467,.439)); stones.append(pedestal)
for y,r,h in ((12.06,.36,.13),(12.44,.32,.10)):
    ob=cylinder('Beacon bronze cap',(bx,y,bz),r,h)
    paint(ob,(.20,.34,.297),bronze_mat); bronzes.append(ob)
beacon=cylinder('towerSkinCairnBeacon',(bx,12.24,bz),.205,.28)
paint(beacon,(.62,.37,.13),glow_mat,grit=0)
for i in range(6):
    a=i*math.pi/3
    ob=cylinder('Beacon cage',(bx+.25*math.cos(a),12.24,bz+.25*math.sin(a)),.033,.34,6)
    paint(ob,(.16,.28,.24),bronze_mat); bronzes.append(ob)

sound_stones=[]
spalled=[]
for ob in stones:
    F.canonicalize(ob); F.triangulate(ob)
    nm,vol=F.manifold_report(ob)
    if nm:
        # An arch-cut sliver is not a load-bearing ashlar. Remove the entire
        # broken facing stone, revealing the intact bed behind it, rather
        # than welding an arbitrary new shape over the defect.
        spalled.append(ob.name); F.delete(ob)
    else: sound_stones.append(ob)
assert len(spalled)<=8, f'Too many fractured cuts: {spalled}'
print('[cairnwatch] removed arch-cut facing slivers:',spalled)
ashlar=join('towerSkinCairnAshlar',sound_stones)
bronze=join('towerSkinCairnBronze',bronzes)
meshes=[core,ashlar,apron,bronze,beacon]
for ob in meshes: F.recalc_normals(ob)
pin,pout=F.tower_portals(PORTAL_IN,PORTAL_OUT)
all_objects=meshes+[pin,pout]
F.finish('cairnwatch',all_objects,budget=BUDGET,smooth_deg=14,vertex_colors=True,ground=False)
# Independent-built-vertex measurements, including all dress geometry.
K.run_battery(meshes,SPEC,tag='cairnwatch',x_lim=3.25,crown_max=12.5,
              clad={apron.name},occluder=[core,ashlar],front_top=None)
K.gate_front_carries_the_dark([core,ashlar],SPEC,'cairnwatch',None)
import foundry_scene
foundry_scene.prepare('Cairnwatch', height=6)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(F.OUT_DIR)/'cairnwatch.blend'))
print('[cairnwatch] editable blend saved; stop for contact-sheet LOOK before long app battery')
