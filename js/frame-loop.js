/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// One pending frame per visible viewport. Waking from idle consumes no stale
// wall time; actual animation supplies the reason for another frame.
export function createFrameLoop({draw, active, visible, request, cancel}) {
  let pending = null, last = null, dirty = false, drawing = false;
  const stats = {frames:0, wakes:0};
  function schedule() {
    if (pending !== null || drawing || !visible()) return;
    pending = request(frame);
  }
  function frame(now) {
    pending = null;
    if (!visible()) { last = null; return; }
    const dt = last === null ? 0 : Math.min(Math.max(0,(now-last)/1000),.1);
    last = now; dirty = false; drawing = true;
    try { draw(dt); stats.frames++; }
    finally { drawing = false; }
    if (dirty || active()) schedule();
    else last = null;
  }
  return {
    invalidate() { dirty = true; stats.wakes++; schedule(); },
    visibilityChanged() {
      if (pending !== null) cancel(pending);
      pending = null; last = null;
      if (visible()) { dirty = true; schedule(); }
    },
    get state() { return {...stats,pending:pending!==null,dirty,visible:visible()}; },
  };
}
