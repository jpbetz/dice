# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Reimport Wickroot's GLB and render a geometry-review contact sheet.

This friendly studio is a shape proxy. Final palette judgement belongs in
the running application's light rig, which the main session owns.
"""
import os
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/"tools/forge/out/wickroot"
SHOTS=OUT/"shots"
SHOTS.mkdir(parents=True,exist_ok=True)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/"wickroot.glb"))
meshes=[ob for ob in bpy.data.objects if ob.type=="MESH"]
sc=bpy.context.scene
sc.render.engine="CYCLES"
sc.cycles.samples=24
sc.cycles.use_denoising=True
sc.render.resolution_x=600
sc.render.resolution_y=720
sc.render.resolution_percentage=100
sc.render.image_settings.file_format="PNG"
sc.world.color=(.14,.14,.14)
sc.view_settings.view_transform="AgX"
sc.view_settings.look="AgX - Medium High Contrast"

def p(x,y,z):return Vector((x,-z,y))
def point(ob,target):ob.rotation_euler=(p(*target)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,power,size,rgb):
    data=bpy.data.lights.new(name,"AREA");data.energy=power;data.shape="DISK";data.size=size;data.color=rgb
    ob=bpy.data.objects.new(name,data);sc.collection.objects.link(ob);ob.location=p(*pos);point(ob,(0,5,-2));return ob
area("key",(-7,17,8),1800,8,(1.0,.82,.62))
area("fill",(9,12,5),1000,10,(.58,.71,1.0))
area("edge",(-3,14,-9),1600,7,(.87,1.0,.91))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.06))
floor=bpy.context.object;floor.name="Review floor"
mat=bpy.data.materials.new("Review muted green floor");mat.diffuse_color=(.025,.041,.031,1);mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.025,.041,.031,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.94
floor.data.materials.append(mat)
data=bpy.data.cameras.new("Review camera");cam=bpy.data.objects.new("Review camera",data);sc.collection.objects.link(cam);sc.camera=cam
data.type="ORTHO"
views=[("hero",(17,14,24),(0,4.7,-1.6),13.6),
       ("front",(0,11,27),(0,4.7,-1.4),13.1),
       ("crown",(-12,20,17),(0,7.4,-2.6),9.1),
       ("resting",(0,13.3,14.25),(0,4.7,-1.5),19.0)]
for name,pos,target,scale in views:
    cam.location=p(*pos);point(cam,target);data.ortho_scale=scale
    sc.render.filepath=str(SHOTS/(name+".png"));bpy.ops.render.render(write_still=True)
normal=bpy.data.materials.new("Review surface normals");normal.use_nodes=True
nt=normal.node_tree;nt.nodes.clear();out=nt.nodes.new("ShaderNodeOutputMaterial");em=nt.nodes.new("ShaderNodeEmission");geom=nt.nodes.new("ShaderNodeNewGeometry")
vm=nt.nodes.new("ShaderNodeVectorMath");vm.operation="SCALE";vm.inputs[3].default_value=.5
add=nt.nodes.new("ShaderNodeVectorMath");add.operation="ADD";add.inputs[1].default_value=(.5,.5,.5)
nt.links.new(geom.outputs['Normal'],vm.inputs[0]);nt.links.new(vm.outputs[0],add.inputs[0]);nt.links.new(add.outputs[0],em.inputs[0]);nt.links.new(em.outputs[0],out.inputs[0])
for ob in meshes:ob.data.materials.clear();ob.data.materials.append(normal)
cam.location=p(17,14,24);point(cam,(0,4.7,-1.6));data.ortho_scale=13.6
sc.render.filepath=str(SHOTS/"normal.png");bpy.ops.render.render(write_still=True)
print("Wickroot GLB review frames:",SHOTS)
