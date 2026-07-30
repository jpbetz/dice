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

// Dice notation parser + canonical renderer (docs/UX.md §1.1/§1.2, §7.2).
//
// Roll20 dialect, expressing exactly what js/rollspec.js supports. Shared by
// the server (which re-parses every pasted command — the client's parse is
// preview only) and the browser. Dependency-free; runs in Node and browsers.
//
// Grammar:
//   command  := [mode SP] expr (SP flag)* [SP dc] [SP comment]
//   mode     := /roll /r          (no effect)
//             | /gmroll /gmr /selfroll /sr   (accepted input; normalizes to the
//               'held' trailing flag — canonical emits 'held', never a prefix.
//               /selfroll still maps to held; real secret semantics are
//               roadmap step 4)
//   expr     := term (("+"|"-") term)*
//   term     := integer ["[" label "]"] | [count] dieType gluedMod*
//   dieType  := d4 d6 d8 d10 d10x d12 d20 | d100 | d%   (d100/d% → d10x+d10)
//   gluedMod := keep | reroll | "!"        (single-die-type pools only)
//   keep     := (kh|kl|dh|dl|k|d) int      (bare k→kh, bare d→dl)
//   reroll   := (ro|r) ("<="|"<") int      (Roll20 "<" is inclusive → same N;
//                                           always once-per-die here)
//   flag     := adv | dis | keep | reroll | "!"   (group-wide trailing form)
//             | kind | "held"              (docs/UX.md §7.6 moment flags)
//   kind     := "check" | "cinematic" | "cine"    (alias cine → cinematic)
//   dc       := ("dc"|"vs") int            (1..999; the experience Target)
//   comment  := "#" title ["|" subtitle]   (title ≤64 chars, roll label / mat
//               text; the FIRST unescaped "|" splits off the moment subtitle,
//               ≤40 chars; "\|" is a literal pipe and round-trips. A subtitle
//               without a check/cinematic flag is invalid — it has nowhere to
//               render. dc does NOT imply check at parse level: "1d20 dc15"
//               parses with exp:null; the client's dc→check dressing is a UI
//               convenience, not grammar)
//
// Canonical flag order:
//   [adv|dis] [trailing keep] [trailing reroll] [!] [check|cinematic] [held]
//   [dcN] [# comment [| subtitle]]
//
// The term 2d20kh1 collapses to 1d20 + advantage (2d20kl1 → disadvantage)
// BEFORE the mixed-pool check — but only when no trailing adv/dis flag was
// given: "2d20kh1 adv" keeps the literal two-die pool + keep, so a spec of two
// d20s keeping one survives its own canonical form (canonicalNotation renders
// that spec with the keep as a trailing flag, "2d20 kh1", for the same
// reason). In mixed pools any glued mod is a parse error (rollspec applies
// keep/reroll/explode across the whole pool); the honest spelling there is
// the trailing-flag form.

export const DIE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
const DIE_MAX = { d4: 4, d6: 6, d8: 8, d10: 10, d10x: 90, d12: 12, d20: 20 };
const KEEP_WORDS = { kh: 'kh', k: 'kh', kl: 'kl', dh: 'dh', dl: 'dl', d: 'dl' };

const MAX_INPUT = 500;
const MAX_DICE = 40;
const MAX_COUNT = 40;
const MAX_MOD = 99;
const MAX_LABEL = 20;
const MAX_COMMENT = 64;
const MAX_SUBTITLE = 40;
const MAX_PARTS = 12;

// Moment-kind flag words (UX.md §7.6): input aliases → normalized kind.
const KIND_WORDS = { check: 'check', cinematic: 'cinematic', cine: 'cinematic' };
// Full keyword flags whose prefixes read as incomplete input at end-of-string
// ("1d20 che", "1d20 hel"), mirroring couldExtend's role for the older tokens.
const FLAG_KEYWORDS = ['check', 'cinematic', 'held'];

// Strip control characters plus zero-width and bidi-control characters
// (U+200B–200F, U+202A–202E, U+2066–2069, U+FEFF): invisible in rendered
// labels/comments, and the bidi overrides can visually spoof what other
// players see. Mirrored by rollspec.validateMods, which rejects them.
const stripCtl = (t) => t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');

function invalid(error, hint = null) {
  return { ok: false, state: 'invalid', error, hint };
}
function incomplete(error) {
  return { ok: false, state: 'incomplete', error, hint: null };
}

// Could this end-of-input fragment extend into a valid token? Used to decide
// incomplete-vs-invalid when we run out of matches at the end of the string.
function couldExtend(frag) {
  return (
    /^\d{1,3}$/.test(frag) ||                       // count or integer term
    /^\d{0,3}d(1|2|10)?$/.test(frag) ||             // partial die type (d1→d10/d12, d2→d20, d10→d100/d10x)
    /^\d{0,3}d(%|100|10x|4|6|8|10|12|20)(k|kh|kl|dh|dl|d|r|ro|ro<|ro<=|r<|r<=)?$/.test(frag) ||
    /^(k|kh|kl|dh|dl|d|r|ro)(<|<=)?$/.test(frag) || // partial trailing flag
    /^(kh|kl|dh|dl|k|d)$/.test(frag) ||
    /^(a|ad|adv?|d|di|dis?)$/.test(frag) ||
    /^(d|dc|v|vs)$/.test(frag) ||
    /^[+-]$/.test(frag) ||
    /^\d{1,3}\[[^\]]{0,40}$/.test(frag)             // open label bracket
  );
}

export function parseNotation(input) {
  if (typeof input !== 'string') return invalid('not a string');
  if (input.length > MAX_INPUT) return invalid('command too long', `max ${MAX_INPUT} characters`);
  let s = input.trim();
  if (!s) return incomplete('empty command');

  const warnings = [];
  let faceDown = false;

  // ---- mode prefix ---------------------------------------------------------
  if (s.startsWith('/')) {
    const m = /^\/([a-z]+)(?:\s+|$)/i.exec(s);
    if (!m) return invalid('bad command prefix', 'try /roll 1d20');
    const mode = m[1].toLowerCase();
    if (['gmroll', 'gmr', 'selfroll', 'sr'].includes(mode)) faceDown = true;
    else if (!['roll', 'r'].includes(mode)) {
      if (m[0].length === s.length && ('gmroll'.startsWith(mode) || 'selfroll'.startsWith(mode) || 'roll'.startsWith(mode))) {
        return incomplete('partial command prefix');
      }
      return invalid(`unknown command /${mode}`, 'try /roll, /gmroll or /selfroll');
    }
    s = s.slice(m[0].length).trim();
    if (!s) return incomplete('expected dice after the command');
  }

  // ---- comment (and the "| subtitle" moment split, UX.md §7.6) -------------
  let comment = null;
  let subtitle = null;
  const hash = s.indexOf('#');
  if (hash >= 0) {
    const rawComment = s.slice(hash + 1);
    // The FIRST unescaped '|' splits '# Title | Subtitle'. '\|' is a literal
    // pipe (unescaped here, re-escaped by canonicalNotation, so it
    // round-trips); a '|' later in the subtitle needs no escape — only the
    // first split matters — but canonical re-escapes it anyway for one rule.
    let pipe = -1;
    for (let i = 0; i < rawComment.length; i++) {
      if (rawComment[i] === '|' && (i === 0 || rawComment[i - 1] !== '\\')) {
        pipe = i;
        break;
      }
    }
    // normalize unescape → strip → trim → slice → trim, so the truncating cut
    // can never leave whitespace (or a control char shield it) that a re-parse
    // of the canonical form would strip again — the canonical must be a fixed
    // point. Slicing runs on the unescaped text, so a cap cut can never split
    // a '\|' escape pair.
    const clean = (t, cap) => stripCtl(t.replace(/\\\|/g, '|')).trim().slice(0, cap).trim();
    if (pipe >= 0) {
      comment = clean(rawComment.slice(0, pipe), MAX_COMMENT) || null;
      subtitle = clean(rawComment.slice(pipe + 1), MAX_SUBTITLE) || null;
      if (!subtitle) return incomplete('a subtitle needs text after the |');
    } else {
      comment = clean(rawComment, MAX_COMMENT) || null;
    }
    s = s.slice(0, hash).trim();
    if (!s) return incomplete('a comment needs a roll in front of it');
  }

  // ---- expr: signed terms --------------------------------------------------
  // terms: {kind:'dice', count, type, keep, reroll, explode}
  //      | {kind:'int', value, label}
  const terms = [];
  let pos = 0;
  const src = s;
  const rest = () => src.slice(pos);
  let exprEnd = 0;

  let expectTerm = true;
  let sign = 1;
  for (;;) {
    // skip spaces only around +/- operators, not inside terms
    while (pos < src.length && src[pos] === ' ') pos++;
    if (expectTerm) {
      const r = rest();
      if (!r) return incomplete('expected a die or number');
      // optional sign on the very first term ("+3[Guidance]" pastes)
      if (terms.length === 0 && (r[0] === '+' || r[0] === '-')) {
        sign = r[0] === '-' ? -1 : 1;
        pos++;
        continue;
      }
      // dice term
      let m = /^(\d{1,3})?d(%|100|10x|12|20|10|4|6|8)/i.exec(r);
      if (m) {
        if (sign < 0) return invalid('dice cannot be subtracted', 'only flat bonuses can be negative');
        const count = m[1] === undefined ? 1 : parseInt(m[1], 10);
        if (count < 1 || count > MAX_COUNT) return invalid(`dice count must be 1-${MAX_COUNT}`);
        let typeRaw = m[2].toLowerCase();
        pos += m[0].length;
        const term = { kind: 'dice', count, type: typeRaw === '%' ? 'd100' : 'd' + typeRaw, keep: null, reroll: null, explode: false, glued: false };
        // glued mods
        for (;;) {
          const g = rest();
          let gm;
          if ((gm = /^(kh|kl|dh|dl|k|d)(\d{1,3})/i.exec(g))) {
            if (term.keep) return invalid('keep/drop specified twice on one term');
            term.keep = { mode: KEEP_WORDS[gm[1].toLowerCase()], n: parseInt(gm[2], 10) };
            term.glued = true;
            pos += gm[0].length;
          } else if ((gm = /^(ro|r)(<=|<)(\d{1,3})/i.exec(g))) {
            if (term.reroll) return invalid('reroll specified twice on one term');
            if (gm[1].toLowerCase() === 'r') warnings.push('r rerolls once per die here (not recursive)');
            if (gm[2] === '<') warnings.push('‹ is inclusive — normalized to ro<=N');
            term.reroll = { below: parseInt(gm[3], 10), once: true };
            term.glued = true;
            pos += gm[0].length;
          } else if (g.startsWith('!')) {
            if (term.explode) return invalid('! specified twice on one term');
            term.explode = true;
            term.glued = true;
            pos += 1;
          } else if ((gm = /^\[([^\]]*)\]/.exec(g))) {
            warnings.push('labels apply to bonuses, not dice — dropped');
            pos += gm[0].length;
          } else {
            break;
          }
        }
        terms.push(term);
        expectTerm = false;
        exprEnd = pos;
        continue;
      }
      // integer term (with optional label)
      m = /^(\d{1,3})(?:\[([^\]]*)\])?/.exec(r);
      if (m) {
        let label = null;
        if (m[2] !== undefined) {
          // same normalization order as comments: strip → trim → slice → trim
          label = stripCtl(m[2]).trim();
          if (label.length > MAX_LABEL) {
            label = label.slice(0, MAX_LABEL).trim();
            warnings.push(`label truncated to ${MAX_LABEL} characters`);
          }
        }
        terms.push({ kind: 'int', value: sign * parseInt(m[1], 10), label: label || null });
        pos += m[0].length;
        // an unclosed label bracket right after the number
        if (src[pos] === '[') {
          if (!src.slice(pos).includes(']')) return incomplete('unfinished label');
          return invalid('bad label', 'labels look like +2[Proficiency]');
        }
        expectTerm = false;
        exprEnd = pos;
        continue;
      }
      // nothing matched where a term must be
      const frag = r;
      if (couldExtend(frag)) return incomplete('unfinished roll');
      return invalid(`cannot read "${frag.slice(0, 12)}" as dice or a bonus`, 'try something like 2d6+3 or 4d6dl1');
    }
    // after a term: operator or end-of-expr
    while (pos < src.length && src[pos] === ' ') pos++;
    if (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
      sign = src[pos] === '+' ? 1 : -1;
      pos++;
      while (pos < src.length && src[pos] === ' ') pos++;
      expectTerm = true;
      continue;
    }
    break;
  }

  // ---- trailing flags + dc -------------------------------------------------
  let flagAdv = null;
  let flagKeep = null;
  let flagReroll = null;
  let flagExplode = false;
  let expKind = null;
  let flagHeld = false;
  let dc = null;

  const tail = src.slice(exprEnd).trim();
  const tokens = tail ? tail.split(/\s+/) : [];
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti].toLowerCase();
    const last = ti === tokens.length - 1;
    let m;
    if (tok === 'adv' || tok === 'advantage') {
      if (flagAdv) return invalid('advantage/disadvantage specified twice');
      flagAdv = 'adv';
    } else if (tok === 'dis' || tok === 'disadvantage') {
      if (flagAdv) return invalid('advantage/disadvantage specified twice');
      flagAdv = 'dis';
    } else if ((m = /^(kh|kl|dh|dl|k|d)(\d{1,3})$/.exec(tok))) {
      if (flagKeep) return invalid('keep/drop specified twice');
      flagKeep = { mode: KEEP_WORDS[m[1]], n: parseInt(m[2], 10) };
    } else if ((m = /^(ro|r)(<=|<)(\d{1,3})$/.exec(tok))) {
      if (flagReroll) return invalid('reroll specified twice');
      if (m[1] === 'r') warnings.push('r rerolls once per die here (not recursive)');
      if (m[2] === '<') warnings.push('‹ is inclusive — normalized to ro<=N');
      flagReroll = { below: parseInt(m[3], 10), once: true };
    } else if (tok === '!') {
      if (flagExplode) return invalid('! specified twice');
      flagExplode = true;
    } else if (Object.hasOwn(KIND_WORDS, tok)) {
      if (expKind) return invalid('check/cinematic specified twice');
      expKind = KIND_WORDS[tok];
    } else if (tok === 'held') {
      // 'held' = face down; peer of the /gmroll-family prefixes, and the only
      // spelling the canonical form emits. Prefix + flag together is fine
      // (they agree); the flag twice is a typo worth flagging.
      if (flagHeld) return invalid('held specified twice');
      flagHeld = true;
      faceDown = true;
    } else if ((m = /^(dc|vs)(\d{1,4})?$/.exec(tok))) {
      let n = m[2];
      if (n === undefined) {
        // allow "dc 15" split form
        const next = tokens[ti + 1];
        if (next !== undefined && /^\d{1,4}$/.test(next)) {
          n = next;
          ti++;
        } else if (last || next === undefined) {
          return incomplete('dc needs a number');
        } else {
          return invalid('dc needs a number', 'try dc15');
        }
      }
      const v = parseInt(n, 10);
      if (v < 1 || v > 999) return invalid('dc must be 1-999');
      if (dc !== null) return invalid('dc specified twice');
      dc = v;
    } else if (last && (couldExtend(tok) || FLAG_KEYWORDS.some((w) => w.startsWith(tok)))) {
      return incomplete('unfinished flag');
    } else {
      return invalid(`unknown flag "${tokens[ti].slice(0, 12)}"`, 'flags: adv, dis, kh/kl/dh/dl N, ro<=N, !, check, cinematic, held, dc N');
    }
  }

  // ---- moment (exp) --------------------------------------------------------
  // A subtitle only exists on a dressed-up roll: without a kind flag it has
  // nowhere to render, so it is an error, not silently dropped intent.
  // NO dc→check implication here — that dressing is a client UI convenience.
  if (subtitle && !expKind) {
    return invalid('a subtitle needs check or cinematic', 'add a check or cinematic flag before the #');
  }
  const exp = expKind ? (subtitle ? { kind: expKind, subtitle } : { kind: expKind }) : null;

  // ---- collapse 2d20kh1 / 2d20kl1 to advantage -----------------------------
  // Only when no trailing adv/dis flag was given: with an explicit flag the
  // literal two-die pool + keep survives (canonicalNotation renders that spec
  // as "2d20 adv kh1"), so a valid rollspec spec is never silently weakened
  // to — or rejected as — a different roll by its own canonical form.
  if (!flagAdv) {
    for (const t of terms) {
      if (t.kind === 'dice' && t.type === 'd20' && t.count === 2 && t.keep &&
          t.keep.n === 1 && (t.keep.mode === 'kh' || t.keep.mode === 'kl') &&
          !t.reroll && !t.explode) {
        const want = t.keep.mode === 'kh' ? 'adv' : 'dis';
        flagAdv = want;
        t.count = 1;
        t.keep = null;
        t.glued = false;
        warnings.push(`2d20${want === 'adv' ? 'kh1' : 'kl1'} read as ${want}`);
      }
    }
  }

  // ---- expand d100 / d% ----------------------------------------------------
  const expanded = [];
  for (const t of terms) {
    if (t.kind === 'dice' && t.type === 'd100') {
      if (t.glued) {
        return invalid('mods cannot attach to d100', 'd100 rolls a d10x and a d10 together');
      }
      expanded.push({ ...t, type: 'd10x' }, { ...t, type: 'd10' });
    } else {
      expanded.push(t);
    }
  }

  // ---- assemble the pool ---------------------------------------------------
  const diceTerms = expanded.filter((t) => t.kind === 'dice');
  if (!diceTerms.length) {
    // "2", "5+5", "1d2": still a prefix of a command with dice in it
    if (
      /(^|[+\-\s])\d{0,3}d(1|2|10)?$/.test(src) ||
      /^[+-]?\d{1,3}(\[[^\]]*\])?([+-]\d{1,3}(\[[^\]]*\])?)*[+-]?$/.test(src)
    ) {
      return incomplete('add a die, e.g. 1d20');
    }
    return invalid('no dice in this roll', 'add a die, e.g. 1d20');
  }

  const distinctTypes = [...new Set(diceTerms.map((t) => t.type))];
  const gluedTerms = diceTerms.filter((t) => t.glued);
  if (distinctTypes.length > 1 && gluedTerms.length) {
    return invalid(
      'keep/drop, reroll and ! bind to one dice type — this engine applies them across the whole pool',
      'use a trailing flag instead: "1d20+2d6 dl1" applies to all dice'
    );
  }

  let keep = flagKeep;
  let reroll = flagReroll;
  let explode = flagExplode;
  for (const t of gluedTerms) {
    if (t.keep) {
      if (keep) return invalid('keep/drop specified twice');
      keep = t.keep;
    }
    if (t.reroll) {
      if (reroll) return invalid('reroll specified twice');
      reroll = t.reroll;
    }
    if (t.explode) {
      if (explode) return invalid('! specified twice');
      explode = true;
    }
  }

  const dice = [];
  for (const t of diceTerms) for (let i = 0; i < t.count; i++) dice.push(t.type);
  if (dice.length > MAX_DICE) return invalid(`too many dice (max ${MAX_DICE})`);

  // ---- integers -> modifier + attributed parts -----------------------------
  const intTerms = expanded.filter((t) => t.kind === 'int');
  let modifier = 0;
  for (const t of intTerms) modifier += t.value;
  if (Math.abs(modifier) > MAX_MOD) return invalid(`modifier out of range (±${MAX_MOD})`);
  const labeled = intTerms.filter((t) => t.label);
  let parts = null;
  if (labeled.length) {
    if (labeled.length > MAX_PARTS) return invalid(`too many labeled bonuses (max ${MAX_PARTS})`);
    parts = labeled.map((t) => ({ label: t.label, value: t.value }));
    const anon = modifier - labeled.reduce((s, t) => s + t.value, 0);
    if (anon !== 0) parts.push({ label: '', value: anon });
    // Mirror rollspec.validateMods: every part — labeled terms (read as
    // \d{1,3}, so up to 999) AND the derived anonymous remainder — must fit
    // in ±MAX_MOD, or an ok parse here would be a spec the shared validator
    // rejects (and the remainder could even render outside our own grammar).
    for (const p of parts) {
      if (Math.abs(p.value) > MAX_MOD) return invalid(`modifier out of range (±${MAX_MOD})`);
    }
  }

  // ---- semantic validation (mirrors rollspec.validateMods) -----------------
  if (flagAdv && !dice.includes('d20')) {
    return invalid('advantage needs a d20 in the roll');
  }
  if (keep) {
    if (keep.n < 1) return invalid('keep/drop count must be at least 1');
    if (keep.n >= dice.length) {
      return invalid(`keep/drop ${keep.n} needs more dice — this pool has ${dice.length}`);
    }
  }
  if (reroll && (reroll.below < 1 || reroll.below > 9)) {
    return invalid('reroll threshold must be 1-9');
  }
  if (explode && dice.every((t) => t === 'd10x')) {
    warnings.push('percentile dice never explode');
  }

  const mods = {};
  if (modifier) mods.modifier = modifier;
  if (parts) {
    mods.parts = parts;
    if (mods.modifier === undefined) mods.modifier = 0;
  }
  if (flagAdv) mods.adv = flagAdv;
  if (keep) mods.keep = keep;
  if (reroll) mods.reroll = reroll;
  if (explode) mods.explode = true;
  const spec = { dice, mods: Object.keys(mods).length ? mods : null };

  const canonical = canonicalNotation(spec, { dc, comment, exp, faceDown });
  // Escaping literal pipes and normalizing '|' spacing can grow the string a
  // little; a canonical form the parser itself would refuse cannot be a fixed
  // point, so the (pathological) inputs that overflow it are refused instead.
  if (canonical.length > MAX_INPUT) return invalid('command too long', `max ${MAX_INPUT} characters`);

  return {
    ok: true,
    spec,
    dc,
    comment,
    exp,
    faceDown,
    canonical,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Canonical renderer — the single source for group chips, codec v2, history.
// parseNotation(canonicalNotation(x)) is a byte-identical fixed point.
// ---------------------------------------------------------------------------

export function canonicalNotation(spec, extras = {}) {
  const { dc = null, comment = null, exp = null, faceDown = false } = extras;
  const m = spec.mods || {};
  const counts = new Map();
  for (const t of spec.dice) counts.set(t, (counts.get(t) || 0) + 1);

  const singleType = counts.size === 1;
  const isD100 = counts.size === 2 && counts.get('d10x') === 1 && counts.get('d10') === 1;

  const glue = [];
  if (m.keep) glue.push(m.keep.mode + m.keep.n);
  if (m.reroll) glue.push('ro<=' + m.reroll.below);
  if (m.explode) glue.push('!');

  // A glued "2d20kh1"/"2d20kl1" term is exactly what parseNotation collapses
  // to advantage, so a spec of two d20s keeping/dropping one would not survive
  // its own canonical form. Render its keep as a trailing flag instead
  // ("2d20 kh1"), which never triggers the collapse.
  const collapsible = singleType && counts.get('d20') === 2 && m.keep &&
    m.keep.n === 1 && (m.keep.mode === 'kh' || m.keep.mode === 'kl') &&
    !m.reroll && !m.explode;
  const glueInline = singleType && !collapsible;

  const diceStrs = isD100
    ? ['d100']
    : DIE_ORDER.filter((t) => counts.has(t)).map(
        (t) => counts.get(t) + t + (glueInline ? glue.join('') : '')
      );

  const intStrs = [];
  if (m.parts) {
    for (const p of m.parts) {
      if (p.label) intStrs.push((p.value >= 0 ? '+' : '-') + Math.abs(p.value) + '[' + p.label + ']');
      else if (p.value) intStrs.push((p.value >= 0 ? '+' : '-') + Math.abs(p.value));
    }
  } else if (m.modifier) {
    intStrs.push((m.modifier >= 0 ? '+' : '-') + Math.abs(m.modifier));
  }

  let out = diceStrs.join('+') + intStrs.join('');

  const flags = [];
  if (m.adv) flags.push(m.adv);
  // glue rides as trailing flags whenever it is not glued to a single term
  // (mixed pools, the d100 pool, and the collapse-avoiding 2d20-keep-1 case)
  if (!glueInline && glue.length) flags.push(...glue);
  if (exp && exp.kind) flags.push(exp.kind);
  if (faceDown) flags.push('held');
  if (flags.length) out += ' ' + flags.join(' ');
  if (dc) out += ' dc' + dc;

  // '# Title | Subtitle' — literal pipes are escaped as '\|' (every one, in
  // both halves, so re-parsing splits only at the emitted separator), and the
  // separator spacing is normalized to ' | '. A subtitle can exist without a
  // title ('# | Subtitle'); the empty-title spelling re-parses to itself.
  const escPipes = (t) => t.replace(/\|/g, '\\|');
  const sub = exp && exp.subtitle ? escPipes(exp.subtitle) : null;
  if (comment && sub) out += ' # ' + escPipes(comment) + ' | ' + sub;
  else if (comment) out += ' # ' + escPipes(comment);
  else if (sub) out += ' # | ' + sub;
  return out;
}

export function specEquals(a, b) {
  const dice = (x) => [...x.dice].sort().join(',');
  if (dice(a) !== dice(b)) return false;
  const norm = (x) => {
    const m = x.mods || {};
    return JSON.stringify({
      modifier: m.modifier || 0,
      parts: m.parts || null,
      adv: m.adv || null,
      keep: m.keep || null,
      reroll: m.reroll ? { below: m.reroll.below } : null,
      explode: !!m.explode,
    });
  };
  return norm(a) === norm(b);
}
