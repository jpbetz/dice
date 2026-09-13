# Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
"""Radial weathered slabs, incised outer marks, and three peripheral cairns."""
import math
import os
import subprocess
import sys
sys.path.insert(0,os.path.dirname(__file__))
from table_parts import TableParts, F
k=TableParts();os.makedirs(F.OUT_DIR,exist_ok=True)
texture=os.path.join(F.OUT_DIR,'stone-table-grain.png')
subprocess.run([os.environ.get('FORGE_VENV_PY',os.path.expanduser('~/opt/dice-forge/venv/bin/python')),
    os.path.join(os.path.dirname(__file__),'table_art.py'),'stone',texture],check=True)
k.disc('dark-foundation',0,0,15.32,-1.4,-.21,(.25,.27,.245),n=60,bevel=.16)
k.disc('central-stone',0,0,8.05,-.28,0,(.88,.90,.88),'surface',n=64,bevel=.06)
for i in range(12):
    a=i*math.tau/12
    lo=a+.013;hi=a+math.tau/12-.013;outer=15.24+.10*math.sin(i*2.7)
    points=[(outer*math.cos(lo+(hi-lo)*j/5),outer*math.sin(lo+(hi-lo)*j/5)) for j in range(6)]
    points += [(8.14*math.cos(lo+(hi-lo)*j/5),8.14*math.sin(lo+(hi-lo)*j/5)) for j in reversed(range(6))]
    tint=.012*math.sin(i*1.7)
    k.solid('radial-slab-'+str(i),points,-.30,0,(.90+tint,.91+tint,.89+tint),'surface',bevel=.045)
    # Subdued incision strokes: angular hand-cut marks, flush with the top.
    t=a+math.tau/24
    k.radial_block('incision-stem',t,14.30,.045,.56,-.006,.006,(.36,.40,.355),'frame')
    for dt,r in [(-.009,14.48),(.009,14.11)]:
        k.radial_block('incision-arm',t+dt,r,.28,.045,-.006,.006,(.36,.40,.355),'frame')
    if i%3==0:k.radial_block('moss-joint',lo,14.75,.08,.82,-.02,.012,(.28,.34,.205),'frame')
# Unequal cairns on the outer ring: broad contact, offset tops, no floating parts.
for i,a in enumerate([.77,2.73,4.8]):
    x,y=14.52*math.cos(a),14.52*math.sin(a)
    k.disc('cairn-foot',x,y,.63,0,.30,(.35,.385,.35),n=7,bevel=.05,angle=a)
    k.disc('cairn-middle',x+.10,y-.04,.43,.27,.69,(.40,.43,.39),n=6,bevel=.06,angle=a+.2)
    if i!=1:k.disc('cairn-cap',x+.05,y,.28,.65,1.05+i*.12,(.46,.48,.42),n=5,bevel=.04,angle=a-.2)
k.finish('stone-circle-table',texture,budget=8000)
