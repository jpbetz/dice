# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Copper Lantern: a 30.8u oak table with brass joinery and peripheral objects.

See docs/TABLE-COMPOSITIONS.md. Top z=0, underside=-1.1, playable r=13.75.
Budget 8,000 triangles, three linear vertex-color materials, no physics.
"""
import math
import os
import sys
import struct
import zlib
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F

F.reset()
os.makedirs(F.OUT_DIR,exist_ok=True)
# Deterministic painted grain: large wavering fibres and occasional soft pores.
# Small detail lives in a texture, never thousands of sub-pixel mesh cuts.
N=1024
raw=bytearray()
for py in range(N):
    raw.append(0)
    y=py/N*30.8-15.4
    for px in range(N):
        x=px/N*30.8-15.4
        warp=x+.045*math.sin(y*.8+x*.4)+.022*math.sin(y*1.7)
        grain=(.5+.5*math.sin(warp*93+math.sin(warp*17)))**10
        broad=.5+.5*math.sin(warp*12+.6*math.sin(y*.26))
        pore=max(0,math.sin(warp*217+y*.4))**28
        c=round(255*(.91-.105*grain-.035*broad-.025*pore))
        raw.extend((c,c,c))
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
texpath=os.path.join(F.OUT_DIR,'copper-wood-grain.png')
with open(texpath,'wb') as handle:
    handle.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',N,N,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(raw),9))+chunk(b'IEND',b''))
grain_image=bpy.data.images.load(texpath)
grain_image.pack() # The editable .blend must travel with its grain image.
GROUPS = {'wood': [], 'metal': [], 'glass': []}
def linear(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
def paint(ob, rgb, group='wood'):
    F.recalc_normals(ob)
    def ink(poly, v):
        shade = .94 + .045 * math.sin(v.x * 1.3 + v.y * .36) + .018 * math.sin(v.y * 4.1)
        if poly.normal.z < .3: shade *= .71
        return tuple(linear(max(.01, min(1, c * shade))) for c in rgb)
    F.paint_corners(ob, 'tableColor', ink)
    GROUPS[group].append(ob)
    return ob

def solid(name, pts, low, high, rgb, group='wood', bevel=0):
    n=len(pts); verts=[(x,y,z) for z in (low,high) for x,y in pts]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    ob=F.obj_from_pydata(name,verts,faces)
    if bevel:
        md=ob.modifiers.new('worn edges','BEVEL');md.width=bevel;md.segments=2
        md.affect='EDGES';F.bake(ob)
    return paint(ob,rgb,group)

def disc(name,x,y,r,low,high,rgb,group='wood',n=32,bevel=0):
    return solid(name,[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n)) for i in range(n)],low,high,rgb,group,bevel)

def ring(name,x,y,outer,inner,low,high,rgb,group='metal',n=64):
    verts=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z)
           for z,r in [(low,outer),(low,inner),(high,outer),(high,inner)] for i in range(n)]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),
                  (2*n+i,2*n+j,3*n+j,3*n+i),(j,i,n+i,n+j)]
    return paint(F.obj_from_pydata(name,verts,faces),rgb,group)

def clip(poly,x,greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ia=a[0]>=x if greater else a[0]<=x
        ib=b[0]>=x if greater else b[0]<=x
        if ia: out.append(a)
        if ia != ib:
            t=(x-a[0])/(b[0]-a[0]);out.append((x,a[1]+t*(b[1]-a[1])))
    return out

# A full dark substrate makes the shallow plank seams contact shadows, not gaps.
disc('oak-edge',0,0,15.4,-1.1,-.17,(.24,.15,.09),n=96,bevel=.18)
circle=[(15.23*math.cos(i*math.tau/128),15.23*math.sin(i*math.tau/128)) for i in range(128)]
for i in range(15):
    lo=-15.23+i*(30.46/15)+.024; hi=lo+30.46/15-.048
    poly=clip(clip(circle,lo,True),hi,False)
    v=.012*math.sin(i*2.3)
    solid(f'oak-plank-{i:02}',poly,-.24,0,(.39+v,.274+v,.17+v),bevel=.025)
ring('brass-outer-binding',0,0,15.29,15.20,-.30,-.15,(.49,.37,.18),n=96)
ring('brass-inlaid-circle',0,0,14.32,14.25,-.025,.012,(.52,.41,.22),n=96)
# Radial join plates and studs have enough width to read from the table camera.
for i in range(8):
    a=i*math.tau/8+.12
    pts=[]
    for r,t in [(14.55,-.022),(15.1,-.022),(15.1,.022),(14.55,.022)]:
        pts.append((r*math.cos(a+t),r*math.sin(a+t)))
    solid(f'join-plate-{i}',pts,-.018,.022,(.45,.34,.17),'metal')
    for r in [14.65,15.0]:disc(f'rivet-{i}-{r}',r*math.cos(a),r*math.sin(a),.075,.015,.055,(.29,.23,.13),'metal',n=8)

# Lantern and cup sit on the perimeter, beyond the live circular wall.
x,y=-9.7,11.5
disc('lantern-foot',x,y,.63,0,.15,(.30,.25,.16),'metal',n=8,bevel=.04)
disc('lantern-base',x,y,.48,.15,.32,(.39,.29,.13),'metal',n=8)
disc('amber-glass',x,y,.35,.32,1.39,(.51,.33,.12),'glass',n=6)
for i in range(6):
    a=i*math.tau/6;disc('lantern-rib',x+.39*math.cos(a),y+.39*math.sin(a),.047,.25,1.48,(.32,.25,.14),'metal',n=6)
disc('lantern-cap',x,y,.55,1.38,1.53,(.37,.28,.14),'metal',n=6)
# Low tapered roof, a distinct lantern silhouette rather than a glowing cylinder.
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.58,radius2=.17,depth=.38,location=(x,y,1.72))
paint(bpy.context.object,(.34,.24,.10),'metal')
disc('lantern-finial',x,y,.105,1.87,2.06,(.44,.33,.16),'metal',n=8)
x,y=12.3,-8.4
ring('pewter-cup',x,y,.50,.41,.03,.99,(.42,.43,.39),'metal',n=24)
disc('cup-base',x,y,.42,.025,.08,(.25,.25,.22),'metal',n=24)
disc('dark-drink',x,y,.409,.73,.75,(.105,.073,.043),n=24)
ring('cup-rim',x,y,.535,.406,.94,1.01,(.57,.55,.46),'metal',n=24)
bpy.ops.mesh.primitive_torus_add(major_radius=.31,minor_radius=.075,major_segments=16,minor_segments=6,location=(x+.49,y,.55),rotation=(math.pi/2,0,0))
paint(bpy.context.object,(.42,.43,.39),'metal')

# A slumped purse, offset from both cup and lamp; a crease/gathered neck.
x,y=-12.0,-8.9
bpy.ops.mesh.primitive_uv_sphere_add(segments=18,ring_count=10,radius=1,location=(x,y,.38))
ob=bpy.context.object;ob.name='leather-purse';ob.scale=(.87,.60,.43)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
paint(ob,(.24,.13,.07))
disc('purse-neck',x+.20,y,.24,.56,.77,(.29,.17,.085),n=12)
ring('purse-cord',x+.20,y,.25,.21,.67,.74,(.52,.40,.23),group='wood',n=12)
for dx,dy in [(.94,.17),(1.18,-.16),(1.3,.24)]:
    disc('spilled-coin',x+dx,y+dy,.17,.005,.05,(.46,.32,.13),'metal',n=12)

# Merge by material family: closed components remain closed, three draws total.
out=[]
for group,objects in GROUPS.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    ob=bpy.context.object;ob.name='copper-table-'+group
    # Primitive operators may leave unused UVMap layers. The material's first
    # UV set must be the authored planar grain, not zero-filled plank corners.
    for layer in list(ob.data.uv_layers): ob.data.uv_layers.remove(layer)
    mat=F.vertex_color_material(group,'tableColor',roughness=.92 if group=='wood' else .72,specular_level=.18)
    if group=='wood':
        uv=ob.data.uv_layers.new(name='grainUV')
        for loop in ob.data.loops:
            v=ob.matrix_world@ob.data.vertices[loop.vertex_index].co
            uv.data[loop.index].uv=((v.x+15.4)/30.8,(v.y+15.4)/30.8)
        nt=mat.node_tree
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=grain_image
        mix=nt.nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        color=next(n for n in nt.nodes if n.type=='VERTEX_COLOR')
        nt.links.new(color.outputs['Color'],mix.inputs[6]);nt.links.new(tex.outputs['Color'],mix.inputs[7])
        nt.links.new(mix.outputs[2],nt.nodes['Principled BSDF'].inputs['Base Color'])
    if group=='metal':mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.42
    if group=='glass':
        bsdf=mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Emission Color'].default_value=(.22,.09,.02,1)
        bsdf.inputs['Emission Strength'].default_value=1
    F.single_material(ob,mat);out.append(ob)

verts=[ob.matrix_world@v.co for ob in out for v in ob.data.vertices]
assert -1.101 <= min(v.z for v in verts) <= -1.09
assert max(v.z for v in verts) < 2.10
assert 30.3 < max(v.x for v in verts)-min(v.x for v in verts) < 31.0
assert max(abs(v.y) for v in verts) < 15.5
# Every above-table vertex belongs outside the unchanged playable circle.
assert all(math.hypot(v.x,v.y) > 13.75 for v in verts if v.z > .06)
F.finish('copper-lantern-table',out,budget=8000,smooth_deg=14,vertex_colors=True,ground=False,texcoords=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(F.OUT_DIR,'copper-lantern-table.blend'))
