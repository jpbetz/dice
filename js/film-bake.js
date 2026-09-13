/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Shared deterministic film bake. No rendering, DOM, network or authored values.
import * as THREE from '../vendor/three.module.js';
import * as CANNON from '../vendor/cannon-es.js';

export function bakeFilm(ctx) {
  const { world, dice, rng, pouring, roll, floorMat, wallMat, diceMat,
    FIXED_DT, SETTLE_STILL, SETTLE_CAP, SETTLEGATE, DAMPGATE, PHYS, NUDGE,
    DIE_DEFS, readValue, restCeiling, towerVolumes, towerPortalsOf, currentTower,
    pourPlan, mulberry32, POUR, T, TABLE_W, TABLE_D, pourBody } = ctx;
  const dieWidth = (type) => {
    const def = DIE_DEFS[type] || {};
    return def.size || (def.radius ? def.radius * 2 : 2);
  };
  const piledHigh = (d) => NUDGE.pileScale > 0
    && d.body.position.y > restCeiling(d.type) * NUDGE.pileScale;
  const _dispOff = new CANNON.Vec3();
  const _dispRot = new CANNON.Vec3();
  function dispInit(d) {
    if (!d.dispBox) d.dispBox = new Float64Array(18);
    d.dispMax = 0;
  }
  // Grow the three boxes with this frame's probe points and return the largest
  // extent, in world units. Read-only with respect to the physics world.
  function dispGrow(d) {
    const b = d.dispBox;
    const h = dieWidth(d.type) / 2;
    const p = d.body.position;
    const q = d.body.quaternion;
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      let x = p.x;
      let y = p.y;
      let z = p.z;
      if (i > 0) {
        // probe 1 on the body's local +X, probe 2 on its local +Y
        _dispOff.set(i === 1 ? h : 0, i === 2 ? h : 0, 0);
        q.vmult(_dispOff, _dispRot);
        x += _dispRot.x; y += _dispRot.y; z += _dispRot.z;
      }
      const o = i * 6;
      if (x < b[o]) b[o] = x;
      if (y < b[o + 1]) b[o + 1] = y;
      if (z < b[o + 2]) b[o + 2] = z;
      if (x > b[o + 3]) b[o + 3] = x;
      if (y > b[o + 4]) b[o + 4] = y;
      if (z > b[o + 5]) b[o + 5] = z;
      const e = Math.max(b[o + 3] - b[o], b[o + 4] - b[o + 1], b[o + 5] - b[o + 2]);
      if (e > worst) worst = e;
    }
    d.dispMax = worst;
    return worst;
  }
  // Restart every box from the CURRENT pose, so the window is anchored where the
  // die is now rather than losing a frame. Called when the die is judged moving,
  // and whenever a nudge hurls it back into the air.
  function dispRestart(d) {
    const b = d.dispBox;
    for (let i = 0; i < 3; i++) {
      b[i * 6] = b[i * 6 + 1] = b[i * 6 + 2] = Infinity;
      b[i * 6 + 3] = b[i * 6 + 4] = b[i * 6 + 5] = -Infinity;
    }
    return dispGrow(d); // re-seed at the current pose; extent 0
  }

  // --- deterministic fast-forward, recording keyframes + sound events -------
  // `let`, not `const`, for the pour alone: the exit guarantee (docs/TOWER.md)
  // may DISCARD a whole baked pour and run it again with a nudged sub-seed, and
  // every attempt starts from empty film. A thrown roll bakes exactly once and
  // never reassigns either.
  let sounds = []; // {time, strength, at, di}
  let bodyDie = new Map(dice.map((d, i) => [d.body, i]));
  let simTime = 0;
  // THE BUDGET IS TEMPORAL, NOT JUST TOTAL (2026-08-09). The 400-event cap
  // alone is spent by the SPAWN CLUSTER: 20 dice interpenetrate on frame zero
  // and dispatch 280 contacts in that ONE step, the full 400 within a few more
  // — so the drain (stepPlayback) had nothing left by the time a die touched
  // felt, and sound, particles, decals and the shock ring all silently
  // switched off on every pool above ~14 dice. Measured, not inferred:
  // `contacts-reach-the-felt` fails on HEAD with 0/3 throws recording anything
  // after 0.5 s, on 20d6 as well as 40d6.
  //
  // A per-step cap starves the storm and leaves the landings alone. It is
  // deliberately NOT a height gate: wall contacts legitimately reach y=22 and
  // any vertical filter would mis-file exactly the crack off the boards the
  // sound design most wants.
  //
  // Deterministic by construction: consumes no rng() draw, adds no body, and
  // perturbs no body ordering — cannon dispatches in a fixed order, so every
  // client keeps and drops exactly the same contacts.
  const CONTACTS_PER_STEP = 8;
  let stepContacts = 0;
  // THE ROUGH / SURFACE TRACK (docs/AUDIO.md §3.3, increment 6). One byte per
  // die per frame, and it is a DIFFERENT recording from `sounds` in every way
  // that matters:
  //
  //   · NO VELOCITY GATE. `sounds` is an event log and the `v > 2` bar is its
  //     "this contact happened, audibly" line. Rolling is the opposite
  //     question — a die grinding along the felt is a continuous stream of
  //     contacts every one of which is under the bar, which is exactly why
  //     the middle of a throw has been silent.
  //   · NO 400-EVENT AND NO PER-STEP CAP. It is a fixed-size array, not a
  //     queue: one byte per die per frame, ~21 KB on a 40-die pour, and it
  //     cannot starve anything because it takes from nothing.
  //   · low 2 bits = surface class (0 none / 1 felt / 2 wall / 3 die);
  //     high 6 bits = min(63, Σv·8) over the frame.
  //
  // `e.body.material` was being discarded here; the class is what lets a
  // rolling voice eventually know felt from boards. Note the CEILING also
  // carries wallMat, so class 2 means "not the floor and not another die".
  //
  // Deterministic by construction, like the recorder it sits inside: no rng
  // draw, no body added, no ordering perturbed.
  const roughAcc = dice.map(() => 0);
  const roughCls = dice.map(() => 0);
  // `let`, like `sounds`, and for the same reason: the pour may discard a
  // whole baked attempt and start again from empty film. Seeded with a
  // frame-0 byte where the keyframes are seeded, below.
  let rough = [];
  const classOf = (mat) => (mat === floorMat ? 1 : mat === wallMat ? 2 : mat === diceMat ? 3 : 0);
  const recordCollision = (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const cc = e.contact;
    const dyn = cc.bi.type === CANNON.Body.DYNAMIC ? cc.bi : cc.bj;
    const dIdx = bodyDie.get(dyn);
    if (dIdx !== undefined) {
      roughAcc[dIdx] += v;
      const cls = classOf((dyn === cc.bi ? cc.bj : cc.bi).material);
      if (cls > roughCls[dIdx]) roughCls[dIdx] = cls;
    }
    if (v > 2 && sounds.length < 400 && stepContacts++ < CONTACTS_PER_STEP) {
      // The contact point rides along (Level 3): playback fires the set's
      // particle burst exactly where the click sound says the die hit —
      // and WHICH die (§9 mixed pools: the burst wears that die's set;
      // die-die contacts credit bi, deterministically, on every client).
      const c = e.contact;
      const s = c.bi.type === CANNON.Body.DYNAMIC ? { b: c.bi, r: c.ri } : { b: c.bj, r: c.rj };
      sounds.push({
        time: simTime,
        strength: v,
        at: [s.b.position.x + s.r.x, s.b.position.y + s.r.y, s.b.position.z + s.r.z],
        di: bodyDie.get(s.b) ?? null,
      });
    }
  };
  // A poured die's body is not in the world yet, so it gets its listener when
  // it EXITS (pourAdmit). A thrown die has been in the world since spawnDie.
  if (!pouring) for (const d of dice) d.body.addEventListener('collide', recordCollision);

  const snapshot = (d) => ({
    pos: new THREE.Vector3().copy(d.body.position),
    quat: new THREE.Quaternion().copy(d.body.quaternion),
  });
  // The pose that goes on film. A poured die that is not yet a body is a
  // SCRIPTED pose (falling down the shaft, or parked at the despawn line while
  // it is behind the skin) — the same shape of record, so everything
  // downstream, face correction included, cannot tell the difference.
  const poseOf = (d) => (d.pourPose && !d.live
    ? { pos: d.pourPose.pos.clone(), quat: d.pourPose.quat.clone() }
    : snapshot(d));

  // ---- THE POUR MACHINE (docs/TOWER.md) ----------------------------------
  // Inert unless `pouring`; a thrown roll never enters any of it. Everything
  // below is a function of towerVolumes() and a stream derived from roll.seed
  // — no Date.now, no Math.random, no read of the model — so the same roll
  // bakes the same film on every client, and a skin swap cannot touch it.
  const tv = pouring ? towerVolumes(towerPortalsOf(currentTower)) : null;
  const POUR_E = new THREE.Euler();
  const POUR_Q = new THREE.Quaternion();
  const frameOf = (t) => Math.round(t / FIXED_DT);
  let plan = null;       // the drawn pour, per die
  let lastExit = 0;      // the ≥0.2 s exit stagger floor
  let clunkQueue = [];   // {t, di, strength}: baffle knocks waiting on the film
  let pourAttempt = 0;
  let pourStranded = 0;  // dice the last resort had to set down by hand

  // Draw the pour and reset every die to "waiting above the mouth". Attempt 0
  // rides the roll's own seed; a re-bake rides a nudged sub-seed of it, which
  // is still a pure function of (roll.seed, attempt).
  const pourDraw = () => {
    plan = pourPlan(dice, tv,
      mulberry32((roll.seed ^ (0x7f4a7c15 * (pourAttempt + 1))) >>> 0));
    lastExit = 0;
    clunkQueue = [];
    pourStranded = 0;
    dice.forEach((d, i) => {
      d.live = false;
      d.pourPhase = 'wait';
      d.rescues = 0;
      d.bornAt = 0;
      d.exitAt = 0;
      d.pourVy = 0;
      d.visSpans = [];   // frame ranges where the mesh may be SEEN
      d.pourPose = {
        pos: new THREE.Vector3(...plan[i].start),
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...plan[i].rot0)),
      };
    });
  };
  if (pouring) pourDraw();

  let keyframes = dice.map((d) => [poseOf(d)]);
  // Frame 0 is pushed here, before the loop, so the rough track gets its own
  // frame-0 byte in the same breath — the two arrays must be index-aligned or
  // every level read is off by a frame for the whole throw.
  rough = dice.map(() => [0]);

  // Perf pass §0a (Commit A — per-die settle): each die freezes into a STATIC
  // mass-0 body the moment it lands clean, so a group of 40 dice no longer
  // waits on the slowest tumbler and its keyframe array stops allocating.
  // The cached `frozenPose` is shared BY REFERENCE across every subsequent
  // push, preserving the invariant that `keyframes[i].length` is uniform and
  // `kf[kf.length - 1]` is the final pose — face correction runs unchanged.
  // Cocked dice stay dynamic (their `stillTime` triggers the same nudge
  // branch); SETTLE_CAP is retained as last-resort safety at the group level.
  // A closure, not a straight-line block, because the pour's exit guarantee
  // may run the bake again and every one of these carries state from the
  // attempt before it.
  const resetSettleState = () => dice.forEach((d) => {
    d.stillTime = 0; d.frozen = false; d.frozenPose = null;
    d.settleTime = null; d.settleTimeOld = null;
    d.settleTimedOut = false; d.lastMoveTime = 0;
    d.endStill = false; d.endCocked = false; d.endPiled = false;
    d.endY = null; d.endDot = null; d.endDisp = null;
    dispInit(d); dispRestart(d); // the terminator's boxes, anchored at spawn
  });
  resetSettleState();

  // `timedOut` distinguishes the two ways a die stops being simulated, which
  // the TRUE settle frame below depends on: a clean landing earned its freeze
  // by holding still for SETTLE_STILL, so the die actually stopped that long
  // AGO.
  //
  // A die force-frozen at SETTLE_CAP used to be credited with the cap itself,
  // on the reasoning that it "never went still at all". That reasoning was
  // measured on 2026-08-10 and it is false. Of the dice that reached the cap
  // across 36 throws, FIFTEEN OF SEVENTEEN were motionless when it fired —
  // they had gone still and been REFUSED, because they read as cocked and the
  // roll's three nudges were already spent. Crediting them with the cap
  // charged the viewer up to nine seconds of a table where nothing moved.
  // `lastMoveTime` is the fact underneath the decision: when this die last
  // did anything. For a cleanly frozen die it equals simTime - stillTime
  // exactly, so nothing about a normal landing changes.
  const freezeInPlace = (d, timedOut = false) => {
    d.settleTime = timedOut ? d.lastMoveTime : Math.max(0, simTime - d.stillTime);
    d.settleTimeOld = timedOut ? simTime : d.settleTime; // pre-2026-08-10, for settleProfile
    d.settleTimedOut = timedOut;
    // Read the die's condition BEFORE we zero it — settleProfile's diagnosis
    // of a capped roll depends on knowing whether it was moving or parked.
    // The SAME predicate the freeze test uses, recorded rather than
    // approximated. A nearby proxy (combined speed under 0.05) disagreed with
    // it at the boundary and made "a saving always comes from a parked die"
    // look false when it is true.
    d.endStill = d.body.velocity.lengthSquared() < 0.05
      && d.body.angularVelocity.lengthSquared() < 0.05;
    // The displacement twin, in DIE-WIDTHS: how far this die's centre or
    // either probe actually travelled over the window that earned the freeze.
    // Recorded in both modes, so the same number says "what the velocity gate
    // let through" on a shipped row and "what the box gate guaranteed" on a
    // displacement row — under `displacement` it is < SETTLEGATE.eps by
    // construction, and that is the property worth asserting.
    d.endDisp = d.dispMax / dieWidth(d.type);
    // How high it stopped, and how flat. Face correction rotates every die
    // exactly flat afterwards, so the landed pose is unreadable from outside
    // once the roll is over — these are the only record of what the freeze
    // decision actually saw, and calibrating a height bar needs both (a die
    // resting HIGH because it leans on a wall is a different animal from one
    // resting high because it is on another die, and the dot tells them
    // apart).
    d.endDot = readValue(d.type, d.body.quaternion).dot;
    d.endCocked = d.endDot < (d.type === 'd4' ? 0.9 : 0.82);
    d.endY = d.body.position.y;
    // The pile twin of endCocked, and the same kind of evidence: when the cap
    // fires, `parked` says a die was refused and `endCocked`/`endPiled` say by
    // WHICH bar. Reads the live bar, so it is silent while pileScale is off.
    d.endPiled = piledHigh(d);
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.body.mass = 0;
    d.body.type = CANNON.Body.STATIC;
    d.body.updateMassProperties();
    d.body.sleep(); // belt + suspenders; SAP-friendly
    d.frozen = true;
    d.frozenPose = snapshot(d); // reused every subsequent step; no alloc
  };

  // The die's body first exists HERE (§5) — a full unit inside the tower, in
  // occluded interior, already tumbling at exit speed, so emergence reads as
  // TRAVEL through the doorway rather than materialisation at the spout.
  const pourAdmit = (d, i, t) => {
    const ex = plan[i].exit;
    // NO MUTEX — THE PILE IS THE MECHANISM (probe runs 1–8). Every
    // wait-your-turn scheme deadlocked measurably, so an exit never waits: a
    // die whose lane is occupied spawns ABOVE the occupants, capped under the
    // lintel, and cascades off the pile. That is what a real tower's stream
    // does to its own tray, and starvation becomes impossible.
    let laneTop = 0;
    for (const o of dice) {
      if (o === d || !o.live) continue;
      const p = o.body.position;
      if (Math.abs(p.x - (tv.exit.p[0] + ex.x)) < 1.6
        && p.z > tv.z0 - 1.6 && p.z < tv.z0 + 1.6) {
        laneTop = Math.max(laneTop, p.y + 1.3);
      }
    }
    const b = d.body;
    // The lintel clamp is v.flight.capY — the same expression, derived once in
    // towerVolumes, so the envelope this bake actually spends is the envelope
    // towerPortalSpec publishes and a mask is sized against.
    b.position.set(tv.exit.p[0] + ex.x,
      Math.min(Math.max(ex.y, laneTop + 1.4), tv.flight.capY), tv.exit.p[2]);
    const cp = Math.cos(ex.pitch), sp = Math.sin(ex.pitch);
    b.velocity.set(Math.sin(ex.yaw) * cp * ex.speed, sp * ex.speed, Math.cos(ex.yaw) * cp * ex.speed);
    b.angularVelocity.set(...ex.av);
    b.quaternion.setFromEuler(...ex.rot);
    world.addBody(b);
    b.addEventListener('collide', recordCollision);
    d.live = true;
    d.pourPhase = 'live';
    d.bornAt = t;
    d.stillTime = 0;
    d.lastMoveTime = t;
    dispInit(d); dispRestart(d); // the terminator's boxes anchor at the EXIT
    d.visSpans.push([frameOf(t), frameOf(t)]);
  };

  // The scripted half of the film: entry fall, despawn, hidden transit, exit.
  // A falling die has NO BODY — that is the contract's guarantee that a model
  // cannot deflect an entry — so this is analytic, integrated at the film's
  // own 1/60 so what is baked and what is played can never drift.
  const pourAdvance = (t) => {
    const f = frameOf(t);
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i], pl = plan[i];
      if (d.pourPhase === 'wait') {
        if (t < pl.entryAt) continue;
        d.pourPhase = 'fall';
        d.visSpans.push([f, f]);
      }
      if (d.pourPhase === 'fall') {
        d.pourVy += T.throw.physics.gravity * FIXED_DT;
        d.pourPose.pos.y += d.pourVy * FIXED_DT;
        POUR_E.set(pl.av0[0] * FIXED_DT, pl.av0[1] * FIXED_DT, pl.av0[2] * FIXED_DT);
        d.pourPose.quat.multiply(POUR_Q.setFromEuler(POUR_E));
        d.visSpans[d.visSpans.length - 1][1] = f;
        if (d.pourPose.pos.y <= tv.despawnY) {
          // Gone, in the cowl's shadow. The hidden window opens; nothing about
          // this die is on film again until it comes back out.
          d.pourPhase = 'hidden';
          const exitAt = Math.max(t + pl.transit, lastExit + POUR.exitGap);
          lastExit = exitAt;
          d.exitAt = exitAt;
          for (const c of pl.clunks) {
            clunkQueue.push({ t: t + c.u * (exitAt - t), di: i, strength: c.strength });
          }
          clunkQueue.sort((a, b) => a.t - b.t);
        }
      }
      if (d.pourPhase === 'hidden' && t >= d.exitAt) pourAdmit(d, i, t);
    }
  };

  // THE EXIT GUARANTEE, layer 2 (docs/TOWER.md). A die that is LOST (out of
  // bounds, under the floor, NaN) or STALLED in the skin-occluded zone — slow
  // and old — stops being a body entirely and goes back into the hidden queue.
  // A teleporting rescue deadlocked when its target was occupied; a die that
  // does not exist cannot conflict with anything. With a skin on it reads as
  // time on a baffle.
  const pourWatchdog = (t) => {
    const f = frameOf(t);
    for (const d of dice) {
      if (!d.live || d.frozen || d.rescues >= 20) continue;
      const p = d.body.position;
      const lost = !isFinite(p.x + p.y + p.z) || p.y < -0.5
        || Math.abs(p.x) > TABLE_W / 2 + 2 || Math.abs(p.z) > TABLE_D / 2 + 6;
      const stalled = t - d.bornAt > 1.2 && p.z < tv.z0 + 1.1
        && d.body.velocity.length() < 0.8;
      if (!lost && !stalled) continue;
      world.removeBody(d.body);
      d.body.removeEventListener('collide', recordCollision);
      d.live = false;
      d.pourPhase = 'hidden';
      d.rescues++;
      d.exitAt = t + 0.5;
      lastExit = Math.max(lastExit, d.exitAt);
      // Park the film pose somewhere finite and inside the tower: a rescued
      // die may be at NaN, and a NaN keyframe poisons every read downstream.
      if (isFinite(p.x + p.y + p.z)) d.pourPose.quat.copy(d.body.quaternion);
      d.pourPose.pos.set(tv.shaft.c[0], tv.despawnY, tv.shaft.c[2]);
      d.visSpans[d.visSpans.length - 1][1] = f - 1; // it went back behind the skin
    }
  };

  // Synthetic baffle knocks, pushed into the SAME array real impacts use, so
  // the existing film-time click gate voices them with no new machinery.
  // `at: null` on purpose — a clunk is a sound, not a place: no particle
  // burst, no felt mark, no shock ring inside a tower nobody can see into.
  // `clunk` tags them so a per-skin sound palette can give them their own
  // voice and volume later without having to guess which events were real.
  const pourClunks = (t) => {
    while (clunkQueue.length && clunkQueue[0].t <= t) {
      const c = clunkQueue.shift();
      if (sounds.length < 400) {
        sounds.push({ time: t, strength: c.strength, at: null, di: c.di, clunk: 'baffle' });
      }
    }
  };

  let nudges = 0;
  // The pour's clock is longer than a throw's BY CONSTRUCTION — entries are
  // staggered, transits are hidden time, and exits are ≥0.2 s apart — so the
  // cap adds exactly those. A pour is then judged by the same "how long after
  // the dice stop" bar a throw is, rather than by a cap it would trip on the
  // ceremony of arriving.
  const capOf = () => (pouring
    ? SETTLE_CAP + plan[plan.length - 1].entryAt + POUR.transitMax
      + dice.length * POUR.exitGap
    : SETTLE_CAP);
  let settleCap = capOf();
  // The bake, as a closure, because the exit guarantee may run it again. Its
  // body is deliberately left at the indent it had as a bare loop: this
  // wrapper is the whole change, and re-indenting would bury it under three
  // hundred lines of whitespace in every review and every blame.
  const bakeLoop = () => {
  for (;;) {
    stepContacts = 0; // the per-step contact budget refills; see the recorder
    if (pouring) pourAdvance(simTime + FIXED_DT);
    // Speed-gated damping (DAMPGATE, LIVE since 2026-08-18): the ONE place
    // dice are advanced, so gating here gates the whole app. Frozen dice are
    // STATIC and their damping is meaningless; skip them.
    if (DAMPGATE.gate > 0) {
      for (const d of dice) {
        if (d.frozen) continue;
        const slow = d.body.velocity.lengthSquared() < DAMPGATE.gate;
        d.body.linearDamping = slow ? DAMPGATE.slowLinear : PHYS.linearDamping;
        d.body.angularDamping = slow ? DAMPGATE.slowAngular : PHYS.angularDamping;
      }
    }
    // SIM STEPS NEAR THE TOWER RUN AT 120 Hz (docs/TOWER.md §2): at exit speed
    // a die covers ~0.33 of a unit per 60 Hz step, and the thin first ramp let
    // dice pass straight through it and vanish underneath. Two explicit half
    // steps rather than cannon's accumulator form — the film stays exactly one
    // keyframe per 1/60, and a one-arg step leaves no hidden state behind for
    // the next roll to inherit.
    if (pouring) { world.step(FIXED_DT / 2); world.step(FIXED_DT / 2); }
    else world.step(FIXED_DT);
    simTime += FIXED_DT;
    if (pouring) pourWatchdog(simTime);

    // Per-die stillness accumulator + freeze test. Thresholds match the old
    // group predicate verbatim (do NOT tune here). Cocked dice never freeze —
    // they stay dynamic until the nudge branch below lands them clean or
    // SETTLE_CAP fires. A poured die that has not exited yet has no body at
    // all, so there is nothing here for it to be judged on.
    for (const d of dice) {
      if (d.frozen || (pouring && !d.live)) continue;
      // Grow the boxes FIRST and unconditionally: in `velocity` mode this is a
      // pure observation feeding `endDisp`, in `displacement` mode it is the
      // predicate itself. Either way it reads position and quaternion and
      // writes nothing the solver can see.
      const over = dispGrow(d) >= SETTLEGATE.eps * dieWidth(d.type);
      const stillNow = SETTLEGATE.mode === 'displacement'
        ? !over
        : (d.body.velocity.lengthSquared() < 0.05
          && d.body.angularVelocity.lengthSquared() < 0.05);
      // The last instant this die was doing anything. Freezing is a decision
      // we make ABOUT a die; moving is a fact about it, and the two came
      // apart — see the tail cut below.
      //
      // The window restarts on the SAME condition in both modes, so `endDisp`
      // always measures the window that earned the freeze rather than the
      // whole flight. In `velocity` mode the box may legitimately exceed `eps`
      // without restarting anything — a die creeping under 0.224 units/s for
      // 0.45 s covers 0.1 units — and that gap is precisely the finding.
      if (!stillNow) { d.lastMoveTime = simTime; dispRestart(d); }
      d.stillTime = stillNow ? d.stillTime + FIXED_DT : 0;
      if (d.stillTime >= SETTLE_STILL) {
        const r = readValue(d.type, d.body.quaternion);
        const cocked = r.dot < (d.type === 'd4' ? NUDGE.cockedDotD4 : NUDGE.cockedDot);
        // Refused for lying on another die, exactly as if it were cocked —
        // and it only reaches this line after holding STILL for SETTLE_STILL,
        // so the height is a rest, never a die caught mid-flight over the
        // heap. The nudge branch below picks up whatever this refuses,
        // because "still and not frozen" is precisely "refused".
        //
        // ONLY WHILE THERE IS A NUDGE LEFT TO SPEND. A refusal nobody can act
        // on is not a refusal, it is a stall: the roll spins to SETTLE_CAP
        // with a parked die and bills the viewer for the silence. Measured
        // before this guard existed — 8d6 went +55% because three seeds in
        // eight ran the full nine seconds after their third nudge. The cocked
        // bar deliberately does NOT get the same treatment: freezing a die
        // early turns it STATIC and changes what its neighbours bounce off,
        // so extending this would alter every shipped throw.
        const piled = nudges < NUDGE.budget && piledHigh(d);
        // THE INTERIOR CANNOT HOLD A DIE (docs/TOWER.md, exit guarantee layer
        // 2). A poured die that goes still inside the skin's shadow is REFUSED
        // the freeze, unconditionally — otherwise it retires at SETTLE_STILL
        // (0.45 s), which is BEFORE the watchdog's 1.2 s stalled bar, and the
        // rescue that exists for exactly this die never gets to run. Measured
        // the day the pour shipped: a 40d6 bake spent all five attempts with
        // one die frozen 0.11 units past the doorway, rescued eight times and
        // then quietly retired on the ninth.
        const buried = pouring && d.body.position.z < tv.z0 + POUR.hidZone;
        if (!cocked && !piled && !buried) freezeInPlace(d);
      }
    }

    // `poseOf` is `snapshot` for every die of a thrown roll; on a pour it is
    // the scripted pose while the die is not a body yet.
    const kfIdx = keyframes[0].length;
    dice.forEach((d, i) => {
      keyframes[i].push(d.frozen ? d.frozenPose : poseOf(d));
      // The rough byte, beside the keyframe push so the two arrays are the
      // same length by construction rather than by arithmetic.
      rough[i].push((Math.min(63, Math.round(roughAcc[i] * 8)) << 2) | roughCls[i]);
      roughAcc[i] = 0;
      roughCls[i] = 0;
      if (pouring && d.live) d.visSpans[d.visSpans.length - 1][1] = kfIdx;
    });
    if (pouring) pourClunks(simTime);

    // A poured die that has not exited is never frozen, so it holds the roll
    // open exactly as an airborne one does.
    const allSettled = dice.every((d) => d.frozen);
    if (!allSettled && simTime < settleCap) {
      // Nudge cocked dice that have accumulated enough stillTime to be judged
      // stuck. Frozen bodies are STATIC — filter them out (waking a static is
      // a no-op at best, a determinism hazard at worst).
      const cocked = dice.filter((d) => !d.frozen && d.stillTime >= SETTLE_STILL);
      if (cocked.length && nudges < NUDGE.budget) {
        nudges++;
        for (const d of cocked) {
          d.body.wakeUp();
          // Why the die was refused decides how hard it is thrown sideways —
          // the same predicate the freeze test just ran, on a body nothing has
          // moved since (no world.step between them), so the two cannot
          // disagree about a die.
          const spread = piledHigh(d) ? NUDGE.pileSpread : NUDGE.spread;
          d.body.velocity.set((rng() - 0.5) * spread, NUDGE.lift, (rng() - 0.5) * spread);
          const s = NUDGE.spin;
          d.body.angularVelocity.set((rng() - 0.5) * s, (rng() - 0.5) * s, (rng() - 0.5) * s);
          d.stillTime = 0;
          // A nudged die is airborne; its boxes describe a rest that no longer
          // exists. Restart them here as well as on the moving branch, so the
          // hurl cannot be laundered into a short window on the way back down.
          dispRestart(d);
        }
      }
      continue;
    }
    // The cap fired with a die still behind the skin — the pour ran out of
    // clock before it ran out of dice. Set it down on the felt just outside
    // the doorway: shipping a die nobody can see is the one thing the exit
    // guarantee forbids, and this attempt is about to be scored BAD and
    // re-baked anyway (layer 3).
    if (pouring) {
      for (let i = 0; i < dice.length; i++) {
        const d = dice[i];
        if (!d.live || d.body.position.z < tv.z0 + POUR.hidZone) pourStrand(d, i);
      }
    }
    // SETTLE_CAP fired with dice still dynamic → force-freeze so the block
    // below has a stable pose to correct. Same STATIC/mass=0 transition the
    // clean-landing branch uses; face correction rotates each to its
    // server-declared value regardless of the pre-freeze orientation.
    for (const d of dice) if (!d.frozen) freezeInPlace(d, true);
    break;
  }
  };

  // The landing record, read off whatever attempt is being scored. Extracted
  // from below so the pour can snapshot it PER ATTEMPT — the die objects carry
  // this state and a re-bake overwrites it.
  const makeLandings = (lastF) => dice.map((d, i) => ({
    i,
    frame: Math.min(lastF, Math.max(0, Math.round((d.settleTime ?? simTime) / FIXED_DT))),
    time: d.settleTime ?? simTime,
    timedOut: !!d.settleTimedOut,
    timeOld: d.settleTimeOld ?? d.settleTime ?? simTime,
    endStill: !!d.endStill,
    endCocked: !!d.endCocked,
    endY: d.endY ?? null,
    endDot: d.endDot ?? null,
    endPiled: !!d.endPiled,
    endDisp: d.endDisp ?? null,
  }));

  // Last resort, and it never runs on a bake that ships clean: the cap fired
  // with a die still inside the tower, so put it down on the felt in front of
  // the doorway. The FILM's last frame is overwritten too — the film is what
  // the player sees and what face correction reads, so moving only the body
  // would set the die down in physics and leave it in the wall on screen.
  function pourStrand(d, i) {
    const def = DIE_DEFS[d.type];
    const r = def.radius || def.size * 0.87;
    d.body.position.set(tv.exit.p[0] + plan[i].exit.x, r + 0.02, tv.z0 + 1.4);
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    pourStranded++;
    // THE TAIL CUT MUST NOT EAT THE RESCUE. `lastMoveTime` is what
    // freezeInPlace credits a timed-out die with, and it is what decides where
    // the film is truncated — leave it at the die's last real motion and the
    // cut throws away the very frame this function just fixed, putting the die
    // back inside the tower on screen while the body sits on the felt.
    // (Measured: one 8d6 pour in twelve shipped exactly that.)
    d.lastMoveTime = simTime;
    if (!d.live) {
      world.addBody(d.body);
      d.body.addEventListener('collide', recordCollision);
      d.live = true;
      d.visSpans.push([frameOf(simTime), frameOf(simTime)]);
    }
    const kf = keyframes[i];
    kf[kf.length - 1] = {
      pos: new THREE.Vector3().copy(d.body.position),
      quat: new THREE.Quaternion().copy(d.body.quaternion),
    };
  }

  // How many dice this bake would leave WHERE THE PLAYER CANNOT SEE THEM.
  // Read off the film's last frame, not off the bodies: the film is what ships.
  const pourBadCount = () => {
    let n = 0;
    for (let i = 0; i < dice.length; i++) {
      const kf = keyframes[i];
      const p = kf[kf.length - 1].pos;
      const finite = isFinite(p.x + p.y + p.z);
      if (!finite || p.z < tv.z0 + POUR.hidZone || p.y < -0.5 || p.y > 14
        || Math.abs(p.x) > TABLE_W / 2 + 1 || Math.abs(p.z) > TABLE_D / 2 + 1) n++;
    }
    return n;
  };

  // Wind the world back to before this attempt: every body out, a fresh body
  // per die (one that has been simulated and frozen is not a clean slate), and
  // empty film. Add order on the next attempt is unchanged, so the body list
  // cannot drift between clients across a differing number of attempts.
  const pourRewind = () => {
    for (const d of dice) {
      if (d.live) {
        d.body.removeEventListener('collide', recordCollision);
        world.removeBody(d.body);
      }
      d.live = false;
      d.frozen = false;
      d.body = pourBody(d.type);
    }
    bodyDie = new Map(dice.map((d, i) => [d.body, i]));
    sounds = [];
    // Every attempt starts from empty film, and the rough track is film.
    rough = dice.map(() => [0]);
    for (let i = 0; i < dice.length; i++) { roughAcc[i] = 0; roughCls[i] = 0; }
    simTime = 0;
    nudges = 0;
  };

  // THE BAKE IS THE LAST BACKSTOP (docs/TOWER.md, exit guarantee layer 3). The
  // lab has to cope live; the product bakes offline, before frame one, so a
  // pour that ends with any die hidden or out of bounds is simply DISCARDED
  // and rolled again on a nudged sub-seed. The one lab failure class — a
  // heavy-congestion seed leaving a die creeping behind the door — is solved
  // by construction here. Deterministic: the attempt count is a function of
  // the seed and the table, so every client discards the same bakes.
  let pourBest = null;
  if (!pouring) bakeLoop();
  else {
    for (;;) {
      bakeLoop();
      // A STRAND COUNTS AS A FAULT. It leaves no die hidden — that is its
      // whole job — so `bad` alone would score the attempt perfect and ship a
      // teleport. Scoring on bad + stranded means the re-bake is always
      // preferred to the last resort, and the last resort only ships when
      // every attempt needed one.
      const bad = pourBadCount();
      const fault = bad + pourStranded;
      const film = {
        bad, fault, stranded: pourStranded, attempt: pourAttempt,
        keyframes, sounds, rough, simTime, nudges,
        landings: makeLandings(keyframes[0].length - 1),
        spans: dice.map((d) => d.visSpans),
        rescues: dice.reduce((a, d) => a + d.rescues, 0),
      };
      if (!pourBest || fault < pourBest.fault) pourBest = film;
      pourRewind();
      if (fault === 0 || pourAttempt >= POUR.attempts - 1) break;
      pourAttempt++;
      pourDraw();
      resetSettleState();
      keyframes = dice.map((d) => [poseOf(d)]);
      rough = dice.map(() => [0]);
      settleCap = capOf();
    }
    keyframes = pourBest.keyframes;
    sounds = pourBest.sounds;
    rough = pourBest.rough;
    simTime = pourBest.simTime;
    nudges = pourBest.nudges;
    dice.forEach((d, i) => { d.visSpans = pourBest.spans[i]; });
    if (pourBest.fault > 0) {
      // Every re-bake spent and a die is still hidden. Ship the best one — a
      // roll must always resolve — and SAY SO: js/report.js is the only
      // channel the field has, and a silent degradation here is exactly the
      // green check that masks a broken thing.
      console.warn(`tower pour: ${pourBest.bad} unseen + ${pourBest.stranded} `
        + `set down by hand after ${POUR.attempts} bakes `
        + `(seed ${roll.seed >>> 0}, ${dice.length} dice)`);
    }
    // The chosen film's bodies are gone with the rewind. Hand each die a clean
    // one and put it in the world: the block below turns them STATIC at the
    // corrected final pose, which is all a body is for once a roll is baked.
    for (const d of dice) world.addBody(d.body);
  }
  if (!pouring) for (const d of dice) d.body.removeEventListener('collide', recordCollision);

  // --- the TRUE settle frame ----------------------------------------------
  // `stillTime` accrues for SETTLE_STILL (0.45 s = 28 frames, not 27 — see
  // SETTLE_STILL_FRAMES) BEFORE a die is judged landed, so the freeze test
  // concedes 28 frames after the die
  // actually stopped. Every beat keyed to "the settle" therefore fired on a
  // picture that had already been motionless for nearly half a second — the
  // 0.3 s stage flash at stageHitStop lands entirely inside that dead window.
  // Recover the real instant by subtracting the accumulator that earned the
  // freeze (done in freezeInPlace, where simTime is still current).
  //
  // The tie is not an edge case. A SETTLE_CAP roll force-freezes every
  // remaining die on ONE step with ONE identical simTime, and 20d6/40d6 hit
  // the cap on every measured throw — so "which die settled last" is an N-way
  // tie on exactly the pools where it matters most. Break it by lowest die
  // index (deterministic on every client) and carry `timedOut`, so a beat that
  // wants to hold on the deciding die can decline to fire on a pool that
  // merely ran out of clock rather than resolving.
  const lastFrame = keyframes[0].length - 1;
  const landings = pourBest ? pourBest.landings : makeLandings(lastFrame);
  // reduce, not sort: ties keep the FIRST (lowest index) by construction.
  const lastLanding = landings.reduce((a, b) => (b.frame > a.frame ? b : a), landings[0]);
  // Cut the dead tail. This USED to be justified by frozen dice pushing
  // `frozenPose` by reference, which made every frame past the cut identical
  // to kf[last] — true for a frozen die, and the reason the cut was safe.
  // A die that timed out is NOT frozen, so its frames past the cut are live
  // snapshots that may drift a little, and that justification no longer
  // covers it. So do not rely on it: TRUNCATE. Everything downstream — the
  // face correction, finalPos/finalQuat, the frozen bodies — reads
  // kf[kf.length - 1], so cutting the array here makes "the pose playback
  // ends on" and "the pose we correct from" the same object by construction,
  // for both kinds of die. At least one frame, so a zero-length playback can
  // never be produced.
  const motionFrames = Math.max(1, lastLanding.frame);
  // How many frames the SIMULATION ran, kept because truncating destroyed the
  // only way to see the cut from outside: with the dead frames deleted,
  // `keyframes.length - 1` and `duration/FIXED_DT` are equal by construction,
  // and settle-is-when-they-stop measured the cut as the gap between exactly
  // those two. It went green-to-red on a change that broke nothing, which is
  // the good failure — the observable it read had gone, so restore it rather
  // than relax what it asserts.
  const simFrames = keyframes[0].length - 1;
  for (const kf of keyframes) kf.length = motionFrames + 1;
  // The rough track is film and is cut with the film — same length, same
  // frame indices, one Uint8Array per die. Packed only now, so a discarded
  // pour attempt costs nothing.
  const roughTrack = rough.map((arr) => Uint8Array.from(arr.slice(0, motionFrames + 1)));
  for (const l of landings) l.frame = Math.min(l.frame, motionFrames);
  // The pour's visibility spans are frame indices into the same film, so the
  // cut applies to them too — and the LAST span is reopened to the final
  // frame, because whatever the tail cut removed, the die is on the felt for
  // every frame the player still sees.
  let pourFilm = null;
  if (pouring) {
    const spans = dice.map((d) => {
      const keep = d.visSpans
        .filter((s) => s[0] <= motionFrames)
        .map((s) => [s[0], Math.min(s[1], motionFrames)]);
      if (keep.length) keep[keep.length - 1][1] = motionFrames;
      else keep.push([0, motionFrames]); // never leave a die with no way to show
      return keep;
    });
    // Act two's cue (see towerCamTo): the FIRST frame any die is back in the
    // room. The camera leads the dice onto the felt rather than following them.
    let firstExit = motionFrames;
    for (const s of spans) if (s.length > 1) firstExit = Math.min(firstExit, s[1][0]);
    pourFilm = {
      tower: currentTower,
      spans,
      firstExitTime: firstExit * FIXED_DT,
      attempts: pourAttempt + 1,
      unseen: pourBest.bad,
      stranded: pourBest.stranded,
      rescues: pourBest.rescues,
      clunks: sounds.filter((s) => s.clunk).length,
    };
  }

  return { keyframes, sounds, roughTrack, simFrames, motionFrames, landings,
    lastLanding, nudges, pourFilm };
}
