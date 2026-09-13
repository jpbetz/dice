<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Battery to Full wake proof

The full-suite `battery-ambient-wake` failure used a fixed 500 ms timer and
required more than five rendered frames. That was an incidental FPS floor
for this software-rendered, concurrently running browser check, not a
stated product latency budget.

An unchanged runtime measurement reproduced the failure: the first nominal
500 ms sample after Full contained two frames (its timer actually returned
after 944 ms). Four nominal 500 ms samples contained 29 frames in 2.64 s,
with the scenery clock advancing 1.80 s and measured positions changing.
The scheduler stayed visible and pending. Battery produced zero frames.
A subsequent warm Full toggle under 4× CPU throttling produced eight frames
in its first nominal 500 ms sample and continued rendering. These samples
do not establish improved frame pacing or a device performance budget.

The corrected scenario selects Battery and Full through actual Preferences
controls. It keeps strict zero-frame and unchanged scenery checks in
settled Battery, then requires more than five rendered frames within a
five-second completion deadline, advancing scenery time and positions, and
continued frame progress without another input or simulation call. It
checks Battery again after Full. Application code is unchanged.

Validation: the corrected scenario passed; the actual-input look driver
passed and both pictures below were inspected. `battery-ambient-wake-measure.mjs`
reproduces the former fixed-window diagnostic; `battery-ambient-wake-look.mjs`
uses the visible controls. These are local emulated-browser observations.

[Battery picture](2026-09-13-battery-ambient.png) ·
[Full picture](2026-09-13-full-ambient.png)
