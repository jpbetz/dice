# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""A usable opening view for the editable foundry Blender scenes.

This changes saved UI state and metadata only, never model geometry or GLB.
The default factory viewport looks at the origin and crops a tall model;
opening an editable deliverable should show the actual object immediately.
"""
import bpy
from mathutils import Vector


def prepare(label, height=5.4):
    bpy.context.scene['title'] = label + ' — The Tower Foundry'
    bpy.context.scene['copyright'] = 'Copyright 2026 The Dice Table Authors'
    bpy.context.scene['license'] = 'Apache-2.0'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            space.region_3d.view_location = Vector((0, 1.5, height))
            space.region_3d.view_rotation = Vector((11, -18, 10)).to_track_quat('Z', 'Y')
            space.region_3d.view_distance = 22
            space.region_3d.view_perspective = 'PERSP'
            space.clip_end = 300
            space.shading.type = 'MATERIAL'
            space.overlay.show_floor = False
