# Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
"""Closed solids and deterministic palette export for portalless table models."""
import math
import os
import sys
import bpy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import forge as F

def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4

class TableParts:
    def __init__(self):
        F.reset()
        self.groups={'surface':[], 'frame':[], 'metal':[]}

    def paint(self, ob, rgb, group):
        F.recalc_normals(ob)
        def ink(poly, v):
            shade=.97+.025*math.sin(v.x*2+v.y*.65)
            if poly.normal.z<.3: shade*=.70
            return tuple(linear(max(.005,min(1,c*shade))) for c in rgb)
        F.paint_corners(ob,'tableColor',ink)
        self.groups[group].append(ob)
        return ob

    def solid(self,name,points,low,high,rgb,group='frame',bevel=0):
        n=len(points)
        verts=[(x,y,z) for z in [low,high] for x,y in points]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        ob=F.obj_from_pydata(name,verts,faces)
        if bevel:
            md=ob.modifiers.new('worn arris','BEVEL');md.width=bevel;md.segments=2
            md.affect='EDGES';F.bake(ob)
        return self.paint(ob,rgb,group)

    def disc(self,name,x,y,r,low,high,rgb,group='frame',n=48,bevel=0,angle=0):
        return self.solid(name,[(x+r*math.cos(angle+i*math.tau/n),y+r*math.sin(angle+i*math.tau/n)) for i in range(n)],low,high,rgb,group,bevel)

    def ring(self,name,x,y,outer,inner,low,high,rgb,group='metal',n=64):
        verts=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z)
            for z,r in [(low,outer),(low,inner),(high,outer),(high,inner)] for i in range(n)]
        faces=[]
        for i in range(n):
            j=(i+1)%n
            faces += [(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),
                (2*n+i,2*n+j,3*n+j,3*n+i),(j,i,n+i,n+j)]
        return self.paint(F.obj_from_pydata(name,verts,faces),rgb,group)

    def radial_block(self,name,angle,radius,length,width,low,high,rgb,group='metal'):
        # Long axis follows the tangent; thickness follows the radius.
        c,s=math.cos(angle),math.sin(angle)
        points=[((radius+v)*c-u*s,(radius+v)*s+u*c)
            for u,v in [(-length/2,-width/2),(length/2,-width/2),(length/2,width/2),(-length/2,width/2)]]
        return self.solid(name,points,low,high,rgb,group)

    def finish(self,slug,texture,budget=10000,support=None):
        if support:
            for objects in self.groups.values():
                for ob in objects:
                    verts=[ob.matrix_world@v.co for v in ob.data.vertices]
                    bad=[tuple(v) for v in verts if v.z>=-.01 and not support(v.x,v.y)]
                    assert not bad, f'{ob.name}: unsupported tabletop vertices {bad[:3]}'
        image=bpy.data.images.load(texture);image.pack()
        out=[]
        for group,objects in self.groups.items():
            if not objects:continue
            bpy.ops.object.select_all(action='DESELECT')
            for ob in objects:ob.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            ob=bpy.context.object;ob.name=slug+'-'+group
            for uv in list(ob.data.uv_layers):ob.data.uv_layers.remove(uv)
            mat=F.vertex_color_material(group,'tableColor',roughness=.92 if group!='metal' else .68,specular_level=.18)
            if group=='metal':mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.3
            if group=='surface':
                uv=ob.data.uv_layers.new(name='tableArt')
                for loop in ob.data.loops:
                    v=ob.matrix_world@ob.data.vertices[loop.vertex_index].co
                    uv.data[loop.index].uv=((v.x+16)/32,(v.y+16)/32)
                nt=mat.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image
                mix=nt.nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
                color=next(n for n in nt.nodes if n.type=='VERTEX_COLOR')
                nt.links.new(color.outputs['Color'],mix.inputs[6]);nt.links.new(tex.outputs['Color'],mix.inputs[7])
                nt.links.new(mix.outputs[2],nt.nodes['Principled BSDF'].inputs['Base Color'])
            F.single_material(ob,mat);out.append(ob)
        verts=[ob.matrix_world@v.co for ob in out for v in ob.data.vertices]
        assert min(v.z for v in verts)>=-1.51
        assert all(math.hypot(v.x,v.y)>13.75 for v in verts if v.z>.06), 'decorative object intrudes into dice'
        if support:
            assert all(support(v.x,v.y) for v in verts if v.z>=-.01), 'detail extends beyond its supporting tabletop'
        F.finish(slug,out,budget=budget,smooth_deg=16,vertex_colors=True,ground=False,texcoords=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(F.OUT_DIR,slug+'.blend'))
