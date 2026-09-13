# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Reimport the baked table for shape/material triage; app lighting follows."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tools/forge/out'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'copper-lantern-table.glb'))
meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=20
sc.cycles.use_denoising=True;sc.render.resolution_x=1000;sc.render.resolution_y=850
sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG'
sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.16,.13,1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
sc.view_settings.view_transform='AgX'
def area(name,loc,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object
    ob.name=name;ob.data.energy=power;ob.data.color=color;ob.data.shape='DISK';ob.data.size=size
    ob.rotation_euler=(Vector((0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Warm key',(-15,-10,24),3500,(1,.85,.67),12)
area('Broad fill',(16,12,18),2200,(.66,.77,1),16)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.12))
ob=bpy.context.object;mat=bpy.data.materials.new('dark room');mat.diffuse_color=(.028,.021,.017,1);ob.data.materials.append(mat)
bpy.ops.object.camera_add();cam=bpy.context.object;sc.camera=cam
def render(name,loc,target,scale):
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=scale;sc.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
render('copper-hero.png',(23,-32,35),(0,0,0),39)
render('copper-top.png',(0,-.01,45),(0,0,0),38)
render('copper-detail.png',(-18,5,16),(-9.7,11.5,.6),9)
mat=bpy.data.materials.new('Normals');mat.use_nodes=True
nt=mat.node_tree;nt.nodes.clear();geo=nt.nodes.new('ShaderNodeNewGeometry')
vm=nt.nodes.new('ShaderNodeVectorMath');vm.operation='MULTIPLY_ADD';vm.inputs[1].default_value=(.5,.5,.5);vm.inputs[2].default_value=(.5,.5,.5)
em=nt.nodes.new('ShaderNodeEmission');out=nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geo.outputs['Normal'],vm.inputs[0]);nt.links.new(vm.outputs['Vector'],em.inputs[0]);nt.links.new(em.outputs[0],out.inputs['Surface'])
for ob in meshes:ob.data.materials.clear();ob.data.materials.append(mat)
render('copper-normal.png',(23,-32,35),(0,0,0),39)
