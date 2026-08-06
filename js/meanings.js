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

// Segment marks for the spectrum bars (§2l ④, Joe 2026-08-06): small
// letters on the bar itself, a hover legend spelling them out. Quiet is
// deliberately unmarked — the silence needs no initial. Every worded row
// must have a distinct mark (the unit suite pins totality).
export const OUTCOME_MARKS = {
  'Critical Fail': 'CF',
  'Fail': 'F',
  'Mishap': 'MH',
  'Blemish': 'B',
  'Minimal Success': 'Mn',
  'Minor Success': 'Mi',
  'Partial Success': 'P',
  'Success': 'S',
  'Success & Bonus': 'S+',
  'Advantage': 'A',
  'Success & Perm Bonus': 'SP',
  'Critical Success': 'CS',
};

// The one worst→best ladder every rank column embeds as a subsequence
// (pinned by unit test) — the collapsed forecast lays its mixture out in
// this order, so the average never contradicts any die's own order.
// null is the quiet band's seat.
export const OUTCOME_LADDER = ['Critical Fail', 'Fail', 'Mishap', 'Blemish', null,
  'Minimal Success', 'Minor Success', 'Partial Success', 'Success',
  'Success & Bonus', 'Advantage', 'Success & Perm Bonus', 'Critical Success'];

// Count-weighted mixture of the per-die spectra — the collapsed VIEW
// (Joe 2026-08-06, amending the display default only): one line answering
// 'a die from this pool, on average', with the per-die rows one tap away.
// Results still never fold and no printed number counts across dice.
function collapseBars(bars) {
  const total = bars.reduce((s, b) => s + b.count, 0);
  const acc = new Map();
  for (const b of bars) {
    for (const seg of b.segments) acc.set(seg.word, (acc.get(seg.word) || 0) + seg.p * b.count);
  }
  const segments = [];
  for (const word of OUTCOME_LADDER) {
    if (!acc.has(word)) continue;
    segments.push({ word, tier: word ? TIERS[word] : null, p: acc.get(word) / total });
  }
  return { mixed: true, count: total, allQuiet: bars.every((b) => b.allQuiet), segments };
}

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

// A die's whole probability mass in its column's own row order (ROADMAP
// §2l): one tier-colored segment per word run, the null run rendered as one
// quiet segment — quiet is a designed answer, not missing data. Rankless
// dice (d10x) are a single quiet segment. q maps value → probability
// (Map#get), injected by the caller so this module stays dependency-free.
function segmentsFor(type, q) {
  const column = CHART[DIE_MAX[type]];
  if (!column) return [{ word: null, tier: null, p: 1 }];
  const segs = [];
  column.rows.forEach((word, idx) => {
    const w = word || null;
    const p = q.get(idx + 1) || 0;
    const last = segs[segs.length - 1];
    if (last && last.word === w) last.p += p;
    else segs.push({ word: w, tier: w ? TIERS[w] : null, p });
  });
  return segs;
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
//   forecastFor(spec, tools) -> the pre-roll read of a spec (ROADMAP §2l),
//               or null when the profile has none (sum profiles until the
//               sum read ships). tools injects the math — countingPmfs from
//               js/odds.js — so this module stays dependency-free. Returns
//               {kind:'per-die', bars:[{source, type, rank, count, variant,
//               allQuiet, segments:[{word, tier, p}]}]} with segments in
//               chart row order, or {kind:'refusal', reason}.
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
    // THE NO-AGGREGATION LAW (docs/POOL-ANALYSIS.md §2, Joe 2026-08-05):
    // every number describes exactly one die — the joint distribution
    // factorizes, so the per-die spectrum IS the distribution, not a
    // summary. Identical (source, rank, transform) dice share one bar:
    // deduplication, not aggregation. Keep/drop decides which dice count
    // only after they land, so it has no per-die forecast (naive 4d6dl1
    // would print Fail 0.500 where the truth is 0.151) — refused in the
    // sysnote's voice. Explosion changes nothing here: children are
    // filtered from outcomesFor and base dice keep counting.
    forecastFor(spec, tools) {
      if (!spec || !Array.isArray(spec.dice) || !spec.dice.length) return null;
      const mods = spec.mods || null;
      if (mods && mods.keep) {
        return { kind: 'refusal', reason: 'keep/drop picks which dice count after they land — no per-die read before the roll' };
      }
      const built = tools.countingPmfs(spec.dice, mods);
      if (!built.exact) {
        return { kind: 'refusal', reason: 'more rerolls than the 40-die cap can hold — which dice reroll depends on the landing' };
      }
      const bars = new Map();
      spec.dice.forEach((t, i) => {
        const source = spec.sources ? (spec.sources[i] || null) : null;
        const { q, variant } = built.pmfs[i];
        // '#' is banned from source labels at every entry point, so this
        // key cannot collide however a label is spelled.
        const key = `${source ?? ''}#${t}#${variant ?? ''}`;
        const seen = bars.get(key);
        if (seen) { seen.count++; return; }
        const column = CHART[DIE_MAX[t]] || null;
        bars.set(key, {
          source, type: t, rank: column ? column.rank : null, count: 1, variant,
          allQuiet: !column, segments: segmentsFor(t, q),
        });
      });
      const list = [...bars.values()];
      return { kind: 'per-die', bars: list, collapsed: collapseBars(list) };
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
    forecastFor: () => null, // the sum read ships in §2l ⑥
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
    forecastFor: () => null, // the sum read ships in §2l ⑥
  },
};

export const DEFAULT_SYSTEM = 'soul-deal';
