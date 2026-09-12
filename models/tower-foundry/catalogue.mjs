// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

export const STUDIES = [
  {
    id: 'wickroot', label: 'Wickroot', number: '01', material: 'Cedar · resin · old copper',
    note: 'A wayside sanctuary grown into an ancient tree. Torn wood, twisting roots, and a small light left burning.',
    accent: '#cda46b',
    ember: { at: [2.3, 6.2, 0.55], color: '#ffc27a', intensity: 1.6, dist: 3.5 },
    clunkVoice: { body: 'clack', weight: 0.46, sustain: 27 },
  },
  {
    id: 'cairnwatch', label: 'Cairnwatch', number: '02', material: 'Limestone · bronze · salt',
    note: 'The last watchtower of a coastal abbey. A broken crown above carved stone, with a beacon still tended.',
    accent: '#aabeb4',
    ember: { at: [-2.45, 10.4, -2.2], color: '#ffbd70', intensity: 1.7, dist: 3.5 },
    clunkVoice: { body: 'clack', weight: 0.67, sustain: 36 },
  },
  {
    id: 'cinderbell', label: 'Cinderbell', number: '03', material: 'Cast iron · bronze · embers',
    note: 'A bell foundry built to outlast its makers. Flared bronze shoulders, dark iron ribs, and heat held deep within.',
    accent: '#d59a69',
    ember: { at: [0, 4.7, 0.3], color: '#ff9e49', intensity: 1.6, dist: 3.3 },
    clunkVoice: { body: 'clack', weight: 0.83, sustain: 48 },
  },
];

export const modelUrl = (id) => `/models/tower-foundry/${id}/${id}.glb`;
export const previewOptions = (study) => ({
  label: study.label, title: `${study.label} — foundry study`,
  ember: study.ember, clunkVoice: study.clunkVoice, lantern: { rake: 0.25 },
  dress: false, motes: false,
});
