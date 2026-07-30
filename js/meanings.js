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
// table. Each column is a die rank (Mug/Slave d4 ... Bóaire/Cattle Lord d20);
// the row is the roll result. For multi-die rolls the app sums the dice first,
// then reads the smallest column whose range can hold the pool's maximum
// possible total (3d4 → max 12 → D12 column; totals above 20 clamp into D20).
// Percentile dice (d10x) are not part of the chart, so pools containing one
// have no meaning.

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
const COLUMNS = [4, 6, 8, 10, 12, 20];

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

// meaningFor(['d4','d4','d4'], 9) -> {word, tier, column, rank} or null when
// the pool has no chart meaning (contains a d10x, or the total's cell is "-").
export function meaningFor(diceTypes, total) {
  if (!diceTypes.length || diceTypes.some((t) => t === 'd10x')) return null;
  const poolMax = diceTypes.reduce((s, t) => s + DIE_MAX[t], 0);
  const column = COLUMNS.find((c) => c >= poolMax) ?? 20;
  const { rank, rows } = CHART[column];
  const row = Math.min(Math.max(total, 1), column);
  const word = rows[row - 1];
  if (!word) return null;
  return { word, tier: TIERS[word], column: `d${column}`, rank };
}

// ---------------------------------------------------------------------------
// Interpretation system profiles (GOALS.md goal 6, ROADMAP §2). The room
// setting `system` (server SETTING_SPECS) picks which profile reads a roll's
// numbers. Interpretation is a render-time lens: entries and log lines store
// raw facts only (parts, per-die metadata, totals, dc); meaning words and
// crit fanfare are computed from the ACTIVE profile at paint time, so
// switching systems re-reads a log the table already has. DC verdicts are
// goal-4 arithmetic, not interpretation — they render under every profile,
// as does per-die max/min chip styling (a per-die fact).
//
// A profile provides:
//   id, label                 registry key + the settings-modal picker label
//   meaningFor(types, total)  -> {word, tier, column, rank} | null
//                             the chart line (null = no line in this system)
//   critFor(entry)            -> 'success' | 'fail' | null
//                             drives crit fanfare + banner/ceremony classes
//
// critFor sees a display entry; it reads entry.total and entry.parts:
// [{type, value, counts, child}]. Discarded dice (counts=false — advantage's
// struck die, drops, reroll originals) and explosion children never decide a
// crit.

const countingTypes = (entry) =>
  entry.parts.filter((p) => p.counts && !p.child).map((p) => p.type);

export const SYSTEMS = {
  'soul-deal': {
    id: 'soul-deal',
    label: 'Your Soul Deal',
    meaningFor,
    critFor(entry) {
      const m = meaningFor(countingTypes(entry), entry.total);
      if (!m) return null;
      return m.tier === 'crit-success' ? 'success'
        : m.tier === 'crit-fail' ? 'fail'
        : null;
    },
  },
  dnd: {
    id: 'dnd',
    label: 'D&D style',
    meaningFor: () => null,
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
    meaningFor: () => null,
    critFor: () => null,
  },
};

export const DEFAULT_SYSTEM = 'soul-deal';
