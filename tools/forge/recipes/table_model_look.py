# Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
"""Reimport GLBs for palette, silhouette, top-surface and normal review."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'tools/forge/out'
slug=sys.argv[sys.argv.index('--')+1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/(slug+'.glb')))
meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=True
sc.render.resolution_x=1000;sc.render.resolution_y=850;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.world.use_nodes=True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.21,.19,1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
sc.view_settings.view_transform='AgX'
for loc,power,color,size in [((-15,-10,24),5000,(1,.88,.72),12),((16,12,18),3200,(.74,.82,1),16)]:
    bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object
    ob.data.energy=power;ob.data.color=color;ob.data.shape='DISK';ob.data.size=size
    ob.rotation_euler=(Vector((0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.51))
mat=bpy.data.materials.new('room floor');mat.diffuse_color=(.028,.026,.023,1);bpy.context.object.data.materials.append(mat)
bpy.ops.object.camera_add();cam=bpy.context.object;sc.camera=cam;cam.data.type='ORTHO'
def render(suffix,loc,target,scale):
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale;sc.render.filepath=str(OUT/(slug+'-'+suffix+'.png'));bpy.ops.render.render(write_still=True)
render('hero',(23,-32,35),(0,0,0),39)
render('top',(0,-.01,45),(0,0,0),38)
render('detail',(-18,5,16),(-10.4,10.8,.3),9)
mat=bpy.data.materials.new('Normals');mat.use_nodes=True
nt=mat.node_tree;nt.nodes.clear();geo=nt.nodes.new('ShaderNodeNewGeometry')
vm=nt.nodes.new('ShaderNodeVectorMath');vm.operation='MULTIPLY_ADD';vm.inputs[1].default_value=(.5,.5,.5);vm.inputs[2].default_value=(.5,.5,.5)
em=nt.nodes.new('ShaderNodeEmission');out=nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geo.outputs['Normal'],vm.inputs[0]);nt.links.new(vm.outputs['Vector'],em.inputs[0]);nt.links.new(em.outputs[0],out.inputs['Surface'])
for ob in meshes:ob.data.materials.clear();ob.data.materials.append(mat)
render('normal',(23,-32,35),(0,0,0),39)
