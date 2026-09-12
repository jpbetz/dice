// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';

// A selected id can already equal the cold lab's default while its GLB is
// still loading. Readiness, selection, and an open bench are separate facts.
export async function openTowerLab(table, id) {
  const arg = JSON.stringify(id);
  const status = await table.dbg(`towerModelStatus(${arg})`);
  assert.ok(status?.url, `${id} must name a registered tower model`);
  await table.dbg(`towerLabSkin(${arg})`); // starts the model load
  await table.waitFor(`window.__diceDebug.towerModelStatus(${arg})?.ready === true`,
    { timeout: 30000, desc: `${id} lab model ready` });
  assert.equal(await table.dbg(`towerLabSkin(${arg})`), id, 'selected lab model');
  assert.equal(await table.dbg('towerCore(true)'), true, `${id} lab opened`);
  return id;
}
