# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Independent GLB re-import, neutral studio contact views for Cinderbell."""
import math
import os
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out" / "cinderbell"
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT / "cinderbell.glb"))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 640
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.17,.21,.26,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .4

floor = bpy.data.materials.new("Neutral charcoal floor")
floor.diffuse_color = (.047,.052,.057,1)
floor.use_nodes = True
bsdf = floor.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (.047,.052,.057,1)
bsdf.inputs["Roughness"].default_value = .92
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.035))
bpy.context.object.data.materials.append(floor)


def light(name, location, energy, color, size):
    data = bpy.data.lights.new(name,"AREA")
    data.energy, data.color, data.shape, data.size = energy, color, "DISK", size
    ob = bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (Vector((0,2,5))-ob.location).to_track_quat('-Z','Y').to_euler()


light("Large softbox",(-8,-10,18),1900,(1,.87,.69),9)
light("Cool fill",(10,-2,11),1250,(.65,.78,1),8)
light("Bronze edge",(2,10,16),2300,(1,.74,.42),7)
data = bpy.data.cameras.new("Contact camera")
camera = bpy.data.objects.new("Contact camera",data)
scene.collection.objects.link(camera)
scene.camera = camera
data.type = "ORTHO"

views = [
    ("hero",(15,-24,17),(0,1.3,4.95),13.3),
    ("front",(0,-28,13),(0,1.1,5.1),12.8),
    ("side",(24,1,13),(0,1.3,5.1),12.8),
    ("rear",(-15,24,16),(0,2.6,5.1),12.8),
    ("mouth",(8,-11,21),(0,2.6,8.2),8.1),
    ("detail",(5,-15,10),(0,.6,4.1),8.0),
]
for name, pos, target, scale in views:
    camera.location = pos
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    data.ortho_scale = scale
    scene.render.filepath = str(SHOTS / (name + ".png"))
    bpy.ops.render.render(write_still=True)
    if os.environ.get("CINDERBELL_HERO_ONLY"):
        sys.exit(0)

# The normal view isolates actual surface quality from metal reflections.
normal = bpy.data.materials.new("World normal diagnosis")
normal.use_nodes = True
nt = normal.node_tree
nt.nodes.clear()
geometry = nt.nodes.new("ShaderNodeNewGeometry")
scale = nt.nodes.new("ShaderNodeVectorMath")
scale.operation = "SCALE"
scale.inputs[3].default_value = .5
add = nt.nodes.new("ShaderNodeVectorMath")
add.operation = "ADD"
add.inputs[1].default_value = (.5,.5,.5)
emit = nt.nodes.new("ShaderNodeEmission")
output = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(geometry.outputs["Normal"],scale.inputs[0])
nt.links.new(scale.outputs[0],add.inputs[0])
nt.links.new(add.outputs[0],emit.inputs[0])
nt.links.new(emit.outputs[0],output.inputs[0])
scene.view_layers[0].material_override = normal
camera.location = views[0][1]
camera.rotation_euler = (Vector(views[0][2])-camera.location).to_track_quat('-Z','Y').to_euler()
data.ortho_scale = views[0][3]
scene.render.filepath = str(SHOTS / "normal.png")
bpy.ops.render.render(write_still=True)
print("Cinderbell reimport contact views:",SHOTS)
