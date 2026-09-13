/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import {runSuccessWalk,runLibraryHydrationBoundary} from './fixtures/r1-success-walk.mjs';
test('R1 joined success walk uses visible controls from guest dice to recovered table invitation',async()=>{
  await runSuccessWalk({checkpoint:name=>console.log('  '+name)});
});

test('R1 optional account startup keeps play and guest captures before restoring the private namespace',async()=>{
  await runLibraryHydrationBoundary();
});
