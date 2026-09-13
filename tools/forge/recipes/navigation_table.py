# Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
"""A ten-sided shipwright's chart table; all raised props outside r13.75."""
import math
import os
import subprocess
import sys
import bpy
sys.path.insert(0,os.path.dirname(__file__))
from table_parts import TableParts, F
k=TableParts();os.makedirs(F.OUT_DIR,exist_ok=True)
texture=os.path.join(F.OUT_DIR,'navigation-chart.png')
subprocess.run([os.environ.get('FORGE_VENV_PY',os.path.expanduser('~/opt/dice-forge/venv/bin/python')),
    os.path.join(os.path.dirname(__file__),'table_art.py'),'navigation',texture],check=True)
k.disc('shipwright-frame',0,0,15.8,-1.15,-.14,(.19,.235,.24),n=10,bevel=.12,angle=math.pi/10)
k.disc('teak-frame-top',0,0,15.66,-.21,-.025,(.25,.245,.19),n=10,bevel=.06,angle=math.pi/10)
k.disc('chart-on-board',0,0,14.38,-.08,0,(.91,.91,.89),'surface',n=96)
k.ring('chart-binding',0,0,14.47,14.36,-.04,.014,(.48,.41,.26),n=96)
for i in range(10):
    a=i*math.tau/10
    k.radial_block('frame-joint',a,14.70,.54,.38,-.016,.02,(.40,.36,.23))
    for u in [-.16,.16]:
        x=14.70*math.cos(a)-u*math.sin(a);y=14.70*math.sin(a)+u*math.cos(a)
        k.disc('bronze-pin',x,y,.07,.02,.05,(.51,.45,.28),'metal',n=8)
# A low compass binnacle on the northeast edge, not a second central focal point.
x,y=-10.1,10.4
k.disc('compass-base',x,y,.50,-.025,.24,(.28,.30,.24),n=12,bevel=.05)
k.disc('compass-face',x,y,.44,.24,.27,(.66,.62,.43),n=32)
k.ring('compass-bezel',x,y,.54,.44,.20,.39,(.53,.46,.29),n=32)
k.solid('compass-needle',[(x-.11,y-.06),(x,y+.34),(x+.11,y-.06),(x,y-.26)],.28,.32,(.22,.30,.32),'metal')
# Dividers and a transverse ruler lie along the outside frame.
a=.28
k.radial_block('wooden-chart-rule',a,14.75,3.0,.28,.03,.19,(.43,.36,.22),'frame')
for i in range(9):
    theta=a+(i-4)*.019
    k.radial_block('rule-tick',theta,14.75,.03,.19,.19,.205,(.22,.235,.20),'metal')
a=3.35
k.radial_block('divider-leg-one',a,14.70,2.1,.10,.03,.17,(.51,.45,.31))
k.radial_block('divider-leg-two',a+.08,14.70,2.1,.10,.03,.17,(.51,.45,.31))
# Rope lashings identify the shipwright's edge without cluttering the chart.
for theta in [1.2,3.7,5.0]:
    for dt in [-.018,0,.018]:k.radial_block('rope-lashing',theta+dt,14.65,.12,.45,-.10,.035,(.42,.40,.29),'frame')
def supported(x,y):
    edge=math.remainder(math.atan2(y,x),math.tau/10)
    return math.hypot(x,y)<=15.66*math.cos(math.pi/10)/math.cos(edge)+.01
k.finish('navigation-table',texture,budget=8000,support=supported)
