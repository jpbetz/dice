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

// Which columns carry a crit cell AT ALL (d10/d12/d20 today). A d4, d6 or d8
// cannot crit under any face, so it must not sit in the denominator when we
// ask whether a crit SPEAKS FOR the pool (U18) — otherwise the canonical
// attribute+skill+motivation roll, which typically fields exactly one
// crit-capable die, could never clear a majority. Derived from the chart, so
// editing a column moves this with it rather than leaving a stale list.
const CRIT_COLUMNS = new Set(
  Object.entries(CHART)
    .filter(([, c]) => c.rows.some((w) => w === 'Critical Success' || w === 'Critical Fail'))
    .map(([col]) => Number(col)),
);

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

// CSS hooks for the per-word fills (the spectrum's sequential-within-tier
// palette): tier = hue family, word = lightness step, so adjacent words
// of one tier stay distinguishable.
export const OUTCOME_SLUGS = {
  'Critical Fail': 'cf', 'Fail': 'fail', 'Mishap': 'mishap', 'Blemish': 'blemish',
  'Minimal Success': 'minimal', 'Minor Success': 'minor', 'Partial Success': 'partial',
  'Success': 'success', 'Success & Bonus': 'bonus', 'Advantage': 'adv',
  'Success & Perm Bonus': 'perm', 'Critical Success': 'crit',
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
// Profile interface v3 (U17, 2026-08-08): a profile declares its READ.
//   aggregate   'per-die' | 'sum' — how a roll's dice become outcomes
//   usesTotal   gates the SUM and everything derived from it — the big
//               number, the margin delta, the ring's ratio, and the
//               Success/Failure adjudication of a target. It does NOT gate
//               the target itself: a stake is a condition the player
//               declared, and it renders under every system (U17).
//   targetWord  what THIS system calls a declared target ('Target',
//               'Difficulty Class'). The profile NAMES the stake; it never
//               decides whether the stake renders — that is U17's rule and
//               the reason `usesMods` is gone (below).
//
//   (RETIRED — usesMods, U17 2026-08-08.) It did two unrelated jobs and all
//   three profiles set it equal to usesTotal, so it never distinguished
//   anything. Worse, it conflated ARITHMETIC (a flat bonus — a term in a sum,
//   which renders where the sum does) with SELECTION (advantage, keep/drop,
//   reroll, explode — which decide WHICH DICE LAND AND WHICH COUNT). The
//   second is a fact under every system: outcomesFor below MARKS the dice a
//   mechanic set aside rather than dropping them (§1 — it used to drop them,
//   which is the same suppression one layer down), and forecastFor REFUSES to
//   pre-read keep/drop for exactly that reason. So `usesMods:false` was
//   suppressing attribution this
//   same profile treats as load-bearing, against GOALS' Attributed math
//   invariant. Arithmetic now keys off usesTotal and selection is universal,
//   which makes the conflation unspellable rather than merely fixed.
//   outcomesFor(entry) -> [{dieIndex, type, value, word, tier, struck,
//               children}] for per-die systems (quiet dice carry word/tier
//               null), else null. ONE ROW PER DIE THE PLAYER THREW — see the
//               note over soul-deal's implementation for why struck dice are
//               rows and explosion children are not.
//   critFor(entry) -> 'success' | 'fail' | null. THE INFORMATION: did
//               something crit? The word always lands (U8).
//   budget      OPTIONAL {shelfLabel: points} — what a character costs to
//               build under this system, by shelf. Absent means the system
//               names no budget and the ledger prints bare totals. The one
//               place a creation price is written (C8).
//   critCeremony(entry) -> bool. OPTIONAL, default true. Does that crit
//               deserve the table-stopping wash — the full-viewport flash
//               plus the 1700ms camera shake — as opposed to just its word?
//               Split out in U18 because critFor answers a question about a
//               DIE while the ceremony makes a claim about the ROLL, and a
//               per-die profile has no roll-level verdict to make that claim
//               from. A profile that leaves it undefined always washes,
//               which is the right default for a one-die verdict.
//   forecastFor(spec, tools) -> the pre-roll read of a spec (ROADMAP §2l), or
//               null when the profile has none. tools injects the math —
//               countingPmfs and sumForecast from js/odds.js — so this module
//               stays dependency-free. A profile forecasts in the shape it
//               READS: a per-die profile returns {kind:'per-die', bars:[…]}
//               with segments in chart row order, or {kind:'refusal', reason};
//               a sum profile returns {kind:'sum', …} — the whole distribution
//               of the total, or the same object carrying a typed `refusal`
//               (§2l ⑥, docs/POOL-ANALYSIS.md §6.3).
//
//               A SUM REFUSAL IS NOT kind:'refusal', and the difference is
//               load-bearing. The renderer prints a kind:'refusal' INSTEAD of
//               the min/avg/max line; but previewOf is still exact for the
//               average of a pool whose CURVE cannot be drawn (`8d8+2d20 kh4`
//               is exactly one such), so borrowing that kind would delete a
//               true read to print a sentence about a different one. The
//               refusal rides inside the sum and the line survives it.
// THE SUM READ, shared by every profile that sums (ROADMAP §2l ⑥). One
// implementation, not two: `dnd` and `none` disagree about what a crit is and
// what to call a target, and agree completely about arithmetic — a second copy
// would only be a second place for them to drift.
//
// The tool is INJECTED, exactly as countingPmfs is, and its absence is silent
// on purpose: js/main.js passes `{countingPmfs}` at both call sites until the
// rendering pass widens it, and a profile that threw on the narrow bag would
// take the popover down. Null here reads to the renderer as "no forecast",
// which is what the sum profiles returned before this shipped.
function sumForecastFor(spec, tools) {
  if (!spec || !Array.isArray(spec.dice) || !spec.dice.length) return null;
  if (!tools || typeof tools.sumForecast !== 'function') return null;
  return tools.sumForecast(spec.dice, spec.mods || null);
}

export const SYSTEMS = {
  'soul-deal': {
    id: 'soul-deal',
    label: 'Your Soul Deal',
    aggregate: 'per-die',
    usesTotal: false,
    // The profile NAMES its stake; it never decides whether the stake renders
    // (U17). Without this a Soul Deal declaration printed DIFFICULTY CLASS —
    // a D&D mechanic's proper noun, in gold caps, under a 96px ring, at the
    // most deliberate beat this app has. 'Target' is the word the ± popover,
    // the screen-reader announce and UX §2.1's own record field already use.
    targetWord: 'Target',
    // WHAT A CHARACTER COSTS (C8, 2026-08-08). The budget is a fact of the
    // rulebook, exactly like the chart above — so it lives with the chart,
    // which is what makes it pluggable rather than hardcoded (goal 6:
    // "pluggable per system — not hardcoded").
    //
    // POOL-ANALYSIS §9 ruled that "the number 100 appears nowhere in code",
    // and that ruling was RIGHT about what it was protecting: no Soul Deal
    // rule scattered through render sites. It was read as "the budget may
    // never be shown", which made CUJ6's own done-when — *priced against the
    // system's creation budget* — served by the player remembering 100 from
    // a design document. The figures existed in js/seed.js and were imported
    // only by tests. Amended, not overturned: the number lives in exactly one
    // place per system, and that place is the system's profile.
    //
    // A system with no budget omits this and the ledger prints bare totals,
    // which is what D&D and 'none' do.
    // Motivations has NO budget on purpose (Joe 2026-08-09): the system does
    // not define 30 as a ceiling, so printing `X/30` would invent a rule and
    // then mark you in red for breaking it. A shelf the system prices gets a
    // target; a shelf it does not gets the bare sum of its dice.
    budget: { Attributes: 100, Skills: 100 },
    // EVERY DIE THE PLAYER THREW GETS A ROW (§1, GOALS' *Attributed math*:
    // "discarded dice stay visible (struck)"). The old gate was one line —
    // `if (!p.counts || p.child …) return` — and because renderOutcomeRows
    // prints exactly what this returns, that line hid the struck die on the
    // banner, the verdict hero and the peek AT ONCE. A `4d6dl1` showed three
    // dice where four were thrown, on the system that cares most which dice
    // counted. It is a render decision, not a missing field: js/rollspec.js
    // has written `reason` beside `counts:false` all along.
    //
    // A struck die carries `struck` = the MECHANIC that set it aside
    // ('drop' | 'adv' | 'reroll'), never a player-facing word: those belong
    // to the app's vocabulary, not to this rulebook, and a profile that
    // spelled them would be a second place they have to agree.
    //
    // ITS WORD IS NEVER COMPUTED — not computed and hidden. A dropped d6
    // showing 5 is not a Success; printing one would be the app inventing a
    // result out of a die the system discarded. (U17 learned the narrower
    // half of this from the total: a value written into the DOM and withheld
    // only by CSS is not withheld.) So `word`/`tier` stay null and every
    // reader that asks "what did this roll SAY" filters on `!o.struck` —
    // including critCeremony below, whose denominator would otherwise be
    // padded by dice that never spoke.
    //
    // AN EXPLOSION CHILD IS NOT A ROW, and that is a different answer to a
    // different question. It is not struck — it counted — but it is not its
    // own entry either: it is more of the die it came from, and giving it a
    // chart word of its own would turn `1d6!` into a two-die pool. That
    // would contradict forecastFor (which forecasts spec.dice and says
    // explosion changes nothing), move U18's crit denominator, and mint a
    // Soul Deal rule for a mechanic the rulebook has none for. So a child's
    // FACE rides its base die's row in `children`, where attributed math
    // wanted it — every die that touched the felt is accounted for, and the
    // pool still has exactly as many readings as it has dice.
    outcomesFor(entry) {
      if (!entry || !Array.isArray(entry.parts)) return null;
      const out = [];
      const seats = new Map(); // part index -> the row that die's evidence rides
      entry.parts.forEach((p, i) => {
        if (typeof p.value !== 'number') return;
        if (p.child) {
          // Chase `origin` back through a chain (d6! 6 → 6 → 3) to the base
          // die. The hop cap mirrors partSource's: a malformed origin ring
          // must cost a face, never the paint.
          let seat = p.origin;
          for (let hops = 0; hops < 8; hops++) {
            const up = seat != null ? entry.parts[seat] : null;
            if (!up || !up.child) break;
            seat = up.origin;
          }
          const row = seat != null ? seats.get(seat) : null;
          if (row) (row.children || (row.children = [])).push(p.value);
          return;
        }
        const struck = p.counts ? null : (p.reason || 'drop');
        const o = struck ? null : outcomeForDie(p.type, p.value);
        const row = { dieIndex: i, type: p.type, value: p.value,
          word: o ? o.word : null, tier: o ? o.tier : null,
          struck, children: null };
        out.push(row);
        seats.set(i, row);
      });
      return out.length ? out : null;
    },
    // Struck dice cannot crit: outcomesFor never computes their word, so
    // their tier is null and the `some()` below skips them without a filter.
    // Said out loud because the rows now CONTAIN them — a reader who checks
    // that a dropped natural 20 does not fire the fanfare should find the
    // answer here rather than re-deriving it from the shape of a row.
    critFor(entry) {
      const os = this.outcomesFor(entry) || [];
      if (os.some((o) => o.tier === 'crit-success')) return 'success';
      if (os.some((o) => o.tier === 'crit-fail')) return 'fail';
      return null;
    },
    // DOES THE CRIT SPEAK FOR THE POOL? (U18, audit B2.) critFor above is a
    // `some()` over N independent readings, and the full-viewport wash it fed
    // is a claim about the ROLL — the one place this profile aggregated,
    // under a law (POOL-ANALYSIS §2) that says a roll has no verdict to
    // aggregate INTO. The visible cost: a d10 crits on 2 of 10 faces, so 3d10
    // washed the screen and shook the camera on 48.8% of rolls. §2.4 budgets
    // crit as a rare accent; it was the median outcome.
    //
    // The chart is not the problem and is untouched: face 10 on a d10 IS a
    // Critical Success, 1 in 10, as its author wrote it. What changes is who
    // the ceremony belongs to. The WORD still lands on every crit (U8's rule,
    // and the per-die card prints it regardless) — the table only stops when
    // a STRICT MAJORITY of the crit-capable dice crit the same way.
    //
    // The denominator is crit-CAPABLE dice, not all counting dice: a d4/d6/d8
    // has no crit cell, so counting it would mean the canonical
    // attribute+skill+motivation roll (typically one d10 among three dice)
    // could never clear a majority and would lose the accent entirely.
    // With one eligible die the rule is "that die crit" — the author's own
    // rate, untouched — and each further eligible die asks for another
    // agreeing voice. A pool that splits (one crit-success, one crit-fail)
    // does not wash, which is right: that is not a verdict.
    //
    // MEASURED (2e6 rolls each, wash rate before -> after):
    //   1d10          20.0% -> 20.0%   the author's rate, unchanged
    //   d8+d6+d10     20.0% -> 20.0%   the canonical attribute+skill+motivation
    //   3d10          48.8% ->  5.3%   the audit's case: median -> accent
    //   d10+d12+d20   40.0% ->  3.2%
    //   4d20          34.4% ->  0.1%   strict majority of four is a big ask
    // The shapes Soul Deal actually plays cost nothing; only the crit-capable
    // STACK is rationed, which is exactly the pool that was drowning.
    //
    // THE THRESHOLD IS THE TUNABLE. Strict majority is a defensible default,
    // not a law of the system — it is one comparison, and it is Joe's to
    // retune against play.
    critCeremony(entry) {
      const kind = this.critFor(entry);
      if (!kind) return false;
      // `!o.struck` is load-bearing now that struck dice are rows (§1): a
      // die the pool discarded is not a voice that can dissent. Without it
      // `4d20kh1` would field four eligible dice for one reading and a real
      // crit could never clear the majority.
      const eligible = (this.outcomesFor(entry) || [])
        .filter((o) => !o.struck && CRIT_COLUMNS.has(DIE_MAX[o.type]));
      if (!eligible.length) return false;
      const tier = kind === 'success' ? 'crit-success' : 'crit-fail';
      const agreeing = eligible.filter((o) => o.tier === tier).length;
      return agreeing * 2 > eligible.length;
    },
    // THE NO-AGGREGATION LAW (docs/POOL-ANALYSIS.md §2, Joe 2026-08-05):
    // every number describes exactly one die — the joint distribution
    // factorizes, so the per-die spectrum IS the distribution, not a
    // summary. Identical (source, rank, transform) dice share one bar:
    // deduplication, not aggregation. Keep/drop decides which dice count
    // only after they land, so it has no per-die forecast (naive 4d6dl1
    // would print Fail 0.500 where the truth is 0.151) — refused in the
    // sysnote's voice. Explosion changes nothing here, and §1 kept it that
    // way: a child gets no reading of its own — its face rides its base
    // die's row — so the forecast's ONE BAR PER SPEC DIE still matches the
    // result's one row per spec die, which is the property that lets the two
    // surfaces be read against each other at all.
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
    targetWord: 'Difficulty Class',
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
    // NOT the per-die majority rule (U18). A d20 system has exactly one
    // verdict, so `some()` is not an aggregation here — it is the answer, and
    // a natural 20 under advantage is a crit precisely BECAUSE the other d20
    // disagreed. Stated rather than defaulted, so the contrast with
    // soul-deal's rule is on the record where both live.
    critCeremony() { return true; },
    // The natural-20 rule above is a fact about ONE DIE and does not touch the
    // curve, so this is the same arithmetic `none` gets. What differs between
    // the two profiles is `targetWord`, and the renderer owns that.
    forecastFor: sumForecastFor,
  },
  none: {
    id: 'none',
    label: 'Numbers only',
    aggregate: 'sum',
    usesTotal: true,
    targetWord: 'Target',
    outcomesFor: () => null,
    critFor: () => null,
    forecastFor: sumForecastFor,
  },
};

export const DEFAULT_SYSTEM = 'soul-deal';
