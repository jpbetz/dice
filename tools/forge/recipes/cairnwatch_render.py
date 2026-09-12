# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Render Cairnwatch by reimporting its exported GLB, never the source scene."""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tools/forge/out/cairnwatch'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'cairnwatch.glb'))
model=[o for o in bpy.context.scene.objects if o.type=='MESH']
sc=bpy.context.scene
sc.render.engine='CYCLES'; sc.cycles.samples=24
sc.cycles.use_denoising=True
sc.render.resolution_x=900; sc.render.resolution_y=900; sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG'
sc.view_settings.view_transform='AgX'
sc.world.use_nodes=True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.21,.26,1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.42

def area(name,loc,power,color,size,target=(0,2,5)):
    bpy.ops.object.light_add(type='AREA',location=loc)
    ob=bpy.context.object; ob.name=name; ob.data.energy=power; ob.data.color=color; ob.data.shape='DISK'; ob.data.size=size
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('Warm sky break',(-8,-10,19),1800,(1,.86,.69),9)
area('Cold marine fill',(9,-3,10),850,(.54,.71,1),10)
area('Crown rim',(0,9,16),1600,(.65,.80,1),7)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.022))
floor=bpy.context.object; floor.name='Preview floor only'
mat=bpy.data.materials.new('Wet slate floor'); mat.diffuse_color=(.052,.066,.067,1); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.052,.066,.067,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.94
floor.data.materials.append(mat)
bpy.ops.object.camera_add()
cam=bpy.context.object; sc.camera=cam

def render(name,loc,target,scale):
    cam.location=loc; cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'; cam.data.ortho_scale=scale
    sc.render.filepath=str(OUT/name)
    bpy.ops.render.render(write_still=True)

render('cairnwatch-hero.png',(19,-27,19),(0,1.25,5.8),16.1)
render('cairnwatch-front.png',(0,-30,12),(0,1,5.6),15.5)
render('cairnwatch-crown.png',(-13,-15,19),(-.1,2.2,9.9),9.7)
normal=bpy.data.materials.new('Normal diagnostic'); normal.use_nodes=True
nt=normal.node_tree; nt.nodes.clear()
geo=nt.nodes.new('ShaderNodeNewGeometry'); scale=nt.nodes.new('ShaderNodeVectorMath'); scale.operation='MULTIPLY_ADD'
scale.inputs[1].default_value=(.5,.5,.5); scale.inputs[2].default_value=(.5,.5,.5)
emit=nt.nodes.new('ShaderNodeEmission'); out=nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geo.outputs['Normal'],scale.inputs[0]); nt.links.new(scale.outputs['Vector'],emit.inputs['Color']); nt.links.new(emit.outputs[0],out.inputs['Surface'])
for ob in model:
    ob.data.materials.clear(); ob.data.materials.append(normal)
render('cairnwatch-normal.png',(19,-27,19),(0,1.25,5.8),16.1)
