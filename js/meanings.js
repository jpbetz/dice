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

// Roll-meaning chart from "Your Soul Deal" (Walter Fender) — the main Dice
// table. Each column is a DIE rank (Mug/Slave d4 ... Bóaire/Cattle Lord d20)
// and each die reads its OWN face against its own column: values never sum
// (author-confirmed 2026-07-31). Percentile dice (d10x) have no column.

// null = the doc's "-" cells: no particular meaning.
const CHART = {
  4: {
    rank: 'Mug (Slave)',
    rows: ['Blemish', null, 'Minimal Success', 'Minor Success'],
  },
  6: {
    rank: 'Senchléithe (Hereditary Serf)',
    rows: ['Fail', null, null, 'Partial Success', 'Success', 'Success & Bonus'],
  },
  8: {
    rank: 'Bothach (Crofter)',
    rows: ['Fail', 'Mishap', null, null, 'Partial Success', 'Success', 'Success & Bonus', 'Advantage'],
  },
  10: {
    rank: 'Fuidir (Semi freeman)',
    rows: ['Critical Fail', 'Fail', null, null, null, 'Minimal Success', 'Success', 'Success & Bonus', 'Advantage', 'Critical Success'],
  },
  12: {
    rank: 'Ócaire (Little Lord)',
    rows: ['Critical Fail', 'Fail', 'Blemish', null, null, null, 'Partial Success', 'Success', 'Success & Bonus', 'Advantage', 'Success & Perm Bonus', 'Critical Success'],
  },
  20: {
    rank: 'Bóaire (Cattle Lord)',
    rows: ['Critical Fail', 'Fail', 'Mishap', null, null, null, null, null, null, 'Minimal Success', 'Minor Success', 'Partial Success', 'Success', 'Success', 'Success & Bonus', 'Success & Bonus', 'Advantage', 'Advantage', 'Success & Perm Bonus', 'Critical Success'],
  },
};

const DIE_MAX = { d4: 4, d6: 6, d8: 8, d10: 10, d10x: 90, d12: 12, d20: 20 };

// Tier drives styling: which words are celebrations vs. failures.
const TIERS = {
  'Critical Fail': 'crit-fail',
  'Fail': 'fail',
  'Mishap': 'fail',
  'Blemish': 'fail',
  'Minimal Success': 'success-soft',
  'Minor Success': 'success-soft',
  'Partial Success': 'success-soft',
  'Success': 'success',
  'Success & Bonus': 'success',
  'Advantage': 'success',
  'Success & Perm Bonus': 'success',
  'Critical Success': 'crit-success',
};

// THE SOUL DEAL READ (corrected 2026-07-31, from the system's author):
// dice values never sum. Each die is read INDIVIDUALLY — the chart's rank
// columns (Mug ... Boaire) are DIE ranks, so a d4's face reads the d4
// column and a d20's the d20 column. A 2d4 roll of [1, 4] is one Blemish
// and one Minor Success: N dice, N outcomes. A null cell is a QUIET die —
// it lands without a word. Percentile dice (d10x) have no rank column and
// stay quiet too.
export function outcomeForDie(type, value) {
  const column = DIE_MAX[type];
  if (!CHART[column]) return null; // d10x (and anything rankless)
  const word = CHART[column].rows[value - 1] || null;
  if (!word) return null;
  return { word, tier: TIERS[word], rank: CHART[column].rank, column: `d${column}` };
}

// ---------------------------------------------------------------------------
// Interpretation system profiles (GOALS.md goal 6, ROADMAP §2). The room
// setting `system` (server SETTING_SPECS) picks which profile reads a roll's
// numbers. Interpretation is a render-time lens: entries and log lines store
// raw facts only (parts, per-die metadata, totals, dc); meaning words and
// crit fanfare are computed from the ACTIVE profile at paint time, so
// switching systems re-reads a log the table already has. DC verdicts and
// the big total render only under profiles that declare usesTotal — under
// a per-die system a sum is not a fact of play. Per-die max/min chip
// styling stays universal (a per-die fact).
//
// Profile interface v2 (ROADMAP step 2): a profile declares its READ.
//   aggregate   'per-die' | 'sum' — how a roll's dice become outcomes
//   usesTotal   gates the big total, DC verdicts and margin lines
//   usesMods    gates modifier emphasis; false = the ± popover notes that
//               modifiers/targets do not change outcomes under this system
//               (they stay rollable — notation totality is app-wide)
//   outcomesFor(entry) -> [{dieIndex, type, value, word, tier}] for per-die
//               systems (quiet dice carry word/tier null), else null
//   meaningFor  the sum-world hero word (per-die systems return null)
//   critFor(entry) -> 'success' | 'fail' | null
export const SYSTEMS = {
  'soul-deal': {
    id: 'soul-deal',
    label: 'Your Soul Deal',
    aggregate: 'per-die',
    usesTotal: false,
    usesMods: false,
    meaningFor: () => null,
    outcomesFor(entry) {
      if (!entry || !Array.isArray(entry.parts)) return null;
      const out = [];
      entry.parts.forEach((p, i) => {
        if (!p.counts || p.child || typeof p.value !== 'number') return;
        const o = outcomeForDie(p.type, p.value);
        out.push({ dieIndex: i, type: p.type, value: p.value,
          word: o ? o.word : null, tier: o ? o.tier : null });
      });
      return out.length ? out : null;
    },
    critFor(entry) {
      const os = this.outcomesFor(entry) || [];
      if (os.some((o) => o.tier === 'crit-success')) return 'success';
      if (os.some((o) => o.tier === 'crit-fail')) return 'fail';
      return null;
    },
  },
  dnd: {
    id: 'dnd',
    label: 'D&D style',
    aggregate: 'sum',
    usesTotal: true,
    usesMods: true,
    meaningFor: () => null,
    outcomesFor: () => null,
    // Natural-20/1 rule, read off the d20s that actually count: with
    // advantage the discarded die never triggers (counts is false on it),
    // and a natural 20 outranks a natural 1 when one pool lands both.
    critFor(entry) {
      const d20s = entry.parts.filter((p) => p.type === 'd20' && p.counts && !p.child);
      if (d20s.some((p) => p.value === 20)) return 'success';
      if (d20s.some((p) => p.value === 1)) return 'fail';
      return null;
    },
  },
  none: {
    id: 'none',
    label: 'Numbers only',
    aggregate: 'sum',
    usesTotal: true,
    usesMods: true,
    meaningFor: () => null,
    outcomesFor: () => null,
    critFor: () => null,
  },
};

export const DEFAULT_SYSTEM = 'soul-deal';
