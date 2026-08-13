// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0
//
// hollowbole's named angle set, pasted into preview/look.html's page context
// (never edited INTO look.html — the kit belongs to the main session):
//
//   await __views(__hbViews('final-moonrise'))
//
// The camera numbers live here rather than in a transcript because the
// judgement is a COMPARISON: round 2 has to be shot from the same places as
// round 1 or "the roots read better now" is an opinion about two different
// pictures. hollowbole_probe.py re-derives these same cameras in Python to
// put a depth and a luminance on the frames this file shoots.

window.__hbViews = (prefix) => {
  const P = (n) => `${prefix}-${n}.png`;
  return [
    { name: P('1-front34'), az: 35, el: 18 },
    { name: P('2-front'), az: 0, el: 10 },
    { name: P('3-left34'), az: -35, el: 18 },
    { name: P('4-side'), az: 90, el: 12 },
    { name: P('5-back'), az: 180, el: 14 },
    // THE JUDGING FRAME. A player at the table sees the tower from about
    // eye 1.7 across a 12-deep room: a low, nearly level view in which the
    // model is a SILHOUETTE first and a surface second.
    { name: P('6-restingeye'), az: 8, el: 6 },
    { name: P('7-crown-top'), az: 20, el: 55 },
    { name: P('8-crown-close'), az: 25, el: 22, tx: 0, ty: 10.4, tz: -2.55, dist: 11 },
    { name: P('9-wound'), az: 0, el: 4, tx: 0, ty: 4.0, tz: -1.2, dist: 8.5 },
    { name: P('10-mouth'), az: 0, el: -2, tx: 0, ty: 3.0, tz: -2.0, dist: 9.5 },
    // THE ROOT FRAME. Low and near, so the ground line is most of the
    // picture: this is where "gripped" has to beat "met".
    { name: P('11-roots'), az: 18, el: 3.5, tx: 0.2, ty: 0.9, tz: 0.0, dist: 9.0 },
    { name: P('12-door'), az: 52, el: 8, tx: 1.9, ty: 1.0, tz: -1.4, dist: 5.0 },
    { name: P('13-flank'), az: 70, el: 10, tx: 0, ty: 3.6, tz: -2.55, dist: 13 },
    { name: P('14-tongue'), az: 10, el: 16, tx: 0, ty: 0.9, tz: 1.6, dist: 8.0 },
    { name: P('15-normal'), az: 35, el: 18, mode: 'normal' },
    { name: P('16-normal-mouth'), az: 0, el: -2, tx: 0, ty: 3.0, tz: -2.0, dist: 9.5, mode: 'normal' },
    // Silhouette-only reads, added in round 2: the ground line with no
    // shading to argue about, and the resting eye at ground level.
    { name: P('17-normal-roots'), az: 18, el: 3.5, tx: 0.2, ty: 0.9, tz: 0.0, dist: 9.0, mode: 'normal' },
    { name: P('18-groundline'), az: 8, el: 1.5, tx: 0, ty: 1.5, tz: 0.0, dist: 16.0 },
    // THE PROBE FRAME. Pulled back until the arch, the sill, both jambs and
    // the cavity are in ONE picture — 10-mouth is a close-up and shows no
    // lip at all, which is how the first probe ended up comparing the
    // interior against itself. hollowbole_probe.py re-derives this camera.
    { name: P('19-probe'), az: 0, el: 2, tx: 0, ty: 3.6, tz: -0.6, dist: 13.5 },
  ];
};
