// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

// The wire accepts only live model identities. Older saved choices migrate
// at local-storage and portable-import boundaries, never through room state.
export const TOWER_IDS = Object.freeze(['none', 'wickroot', 'cairnwatch', 'cinderbell']);
const RETIRED_SAVED_TOWERS = Object.freeze({
  heartwood: 'wickroot', hollowbole: 'wickroot',
  bastion: 'cairnwatch', nullstone: 'cairnwatch', blackanvil: 'cinderbell',
});
export function migrateSavedTowerId(id) {
  return Object.hasOwn(RETIRED_SAVED_TOWERS, id) ? RETIRED_SAVED_TOWERS[id] : id;
}
