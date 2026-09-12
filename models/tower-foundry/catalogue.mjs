// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

export const STUDIES = [
  {
    id: 'wickroot', label: 'Wickroot', number: '01', material: 'Cedar · resin · old copper',
    note: 'A wayside sanctuary grown into an ancient tree. Torn wood, twisting roots, and a small light left burning.',
    accent: '#cda46b',
  },
  {
    id: 'cairnwatch', label: 'Cairnwatch', number: '02', material: 'Limestone · bronze · salt',
    note: 'The last watchtower of a coastal abbey. A broken crown above carved stone, with a beacon still tended.',
    accent: '#aabeb4',
  },
  {
    id: 'cinderbell', label: 'Cinderbell', number: '03', material: 'Cast iron · bronze · embers',
    note: 'A bell foundry built to outlast its makers. Flared bronze shoulders, dark iron ribs, and heat held deep within.',
    accent: '#d59a69',
  },
];

export const modelUrl = (id) => `/models/towers/${id}.glb`;
