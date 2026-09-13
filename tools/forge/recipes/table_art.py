# Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
"""Paint deterministic original table illustrations using forge's Pillow.

Called by the Blender recipes through the existing forge validation venv.
No downloaded artwork or fonts; geometry supplies the bevels and landmarks.
"""
import math
import random
import sys
from PIL import Image, ImageDraw

kind,path=sys.argv[1:]
N=1024
rng=random.Random(731 if kind=='navigation' else 933)
im=Image.new('RGB',(N,N));px=im.load()
for y in range(N):
    for x in range(N):
        if kind=='navigation':
            grain=rng.randrange(-3,4)+2*math.sin(x*.21+y*.07)
            fade=3*math.sin(x*.007)*math.sin(y*.009)
            px[x,y]=tuple(round(c+grain+fade) for c in (157,178,174))
        else:
            noise=rng.randrange(-6,7)+5*math.sin(x*.017+y*.007)+3*math.sin(y*.061-x*.041)
            px[x,y]=tuple(round(c+noise) for c in (143,147,134))
d=ImageDraw.Draw(im)
def point(x,y):return (round((x+16)*N/32),round((16-y)*N/32))
def line(points,fill,width=1):d.line([point(*p) for p in points],fill=fill,width=width,joint='curve')
if kind=='navigation':
    # Survey grid and overlapping coast washes remain deliberately faint.
    for n in range(-12,13,4):
        line([(n,-15),(n,15)],(143,165,164));line([(-15,n),(15,n)],(143,165,164))
    islands=[(-6,4,4.0,2.9,17),(6,-4,3.0,5.0,9),(-5,-8,2.2,1.6,20),(7,7,2.2,1.9,31)]
    for cx,cy,rx,ry,seed in islands:
        coast=[]
        for i in range(72):
            a=i*math.tau/72;r=1+.13*math.sin(a*5+seed)+.07*math.sin(a*11+seed*.4)
            coast.append((cx+rx*r*math.cos(a),cy+ry*r*math.sin(a)))
        wash=[(cx+(x-cx)*1.08,cy+(y-cy)*1.08) for x,y in coast]
        d.polygon([point(*p) for p in wash],fill=(151,172,166))
        d.polygon([point(*p) for p in coast],fill=(188,185,153))
        line(coast+[coast[0]],(118,139,130),2)
        for i in range(7):
            x=cx+(rng.random()-.5)*rx; y=cy+(rng.random()-.5)*ry
            line([(x-.24,y-.12),(x,y+.3),(x+.25,y-.1)],(156,159,134),2)
    # A rhumb-line compass, map folds and a few hand-drawn wave marks.
    cx,cy=-7,-2
    for i in range(16):
        a=i*math.tau/16
        line([(cx,cy),(cx+22*math.cos(a),cy+22*math.sin(a))],(149,167,160))
    for i in range(8):
        a=i*math.tau/8;length=1.55 if i%2==0 else .9
        pts=[(cx,cy),(cx+.20*math.cos(a-math.pi/2),cy+.20*math.sin(a-math.pi/2)),(cx+length*math.cos(a),cy+length*math.sin(a))]
        d.polygon([point(*p) for p in pts],fill=(117,139,133))
    box=[point(cx-1.1,cy+1.1),point(cx+1.1,cy-1.1)];d.ellipse(box,outline=(122,143,133),width=2)
    for x,y in [(1,8),(2,9),(-10,-4),(2,-10),(10,1),(-2,0)]:
        line([(x-.4,y),(x-.2,y+.10),(x,y),(x+.2,y+.10),(x+.4,y)],(123,150,151),2)
    line([(-.08,-16),(-.08,16)],(146,167,162),2)
    line([(0,-16),(0,16)],(174,189,180),2)
else:
    # Hairline fissures, mineral flecks and moss restricted to the perimeter.
    for i in range(20):
        a=rng.random()*math.tau;r=rng.uniform(8,15)
        pts=[(r*math.cos(a),r*math.sin(a))]
        for step in range(rng.randrange(3,8)):
            x,y=pts[-1];pts.append((x+rng.uniform(-.4,.4),y+rng.uniform(-.5,.5)))
        line(pts,(111,119,110),1)
    for i in range(2000):
        x=rng.randrange(N);y=rng.randrange(N)
        r=math.hypot((x/N*32-16),(y/N*32-16))
        if 13.7<r<15.2 and rng.random()<.4:
            d.ellipse((x,y,x+3,y+2),fill=(110,125,85))
        else:d.point((x,y),fill=(160,163,148))
im.save(path,compress_level=9)
