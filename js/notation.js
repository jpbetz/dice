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
//             | /gmroll /gmr /selfroll   (normalize to the 'secret' trailing
//               flag — Roll20's /gmroll guarantees the roller sees the result
//               and the table learns nothing, and Foundry's /selfroll means
//               roller-only; 'secret' matches both axes for both families.
//               UX.md §3.2's terminology note is the authority)
//             | /sr              (REFUSED as ambiguous: Foundry's self roll
//               and Roll20's 2026 secret roll are opposites under the same
//               two letters, so it must never bind silently)
//               (accepted input only — canonical emits the flag, never a
//               prefix; a prefix plus an AGREEING flag is fine, a prefix
//               plus a different visibility flag is the exclusion error)
//   expr     := term (("+"|"-") term)*
//   term     := integer ["[" label "]"] | [count] dieType ["[" label "]"] gluedMod*
//               (a dice-term label is its SOURCE POOL — 2d8[Wisdom]; rides
//               spec.sources aligned to spec.dice, Pools Rack step 2b)
//   dieType  := d4 d6 d8 d10 d10x d12 d20 | d100 | d%   (d100/d% → d10x+d10)
//   gluedMod := keep | reroll | "!"        (single-die-type pools only)
//   keep     := (kh|kl|dh|dl|k|d) int      (bare k→kh, bare d→dl)
//   reroll   := (ro|r) ("<="|"<") int      (Roll20 "<" is inclusive → same N;
//                                           always once-per-die here)
//   flag     := adv | dis | keep | reroll | "!"   (group-wide trailing form)
//             | throws                     (MECHANICS M2: "tN" = a TURN)
//             | kind                       (docs/UX.md §7.6 moment flags)
//             | vis                        (GOALS.md goal 11 visibility)
//   kind     := "check" | "cinematic" | "cine"    (alias cine → cinematic)
//   vis      := "held" | "secret" | "w:" names    (mutually exclusive — two
//               visibility flags in one command is invalid; one visibility
//               slot in the canonical order, where 'held' has always sat)
//             | "blind"           (accepted on an OFFER's notation only, as an
//               alias canonicalizing to 'secret' — offerer-only, the
//               dice-tower roll. On a self-roll it is refused with a teaching
//               error: there is nobody else to hold the result. Callers pass
//               {offer: true} to parseNotation for offer context.)
//   names    := name ("," name)*           (whisper audience; NO whitespace
//               around the commas. A name containing spaces, commas or
//               quotes — or leading/trailing whitespace — must be quoted:
//               w:"Ann Smith",Bob. Inside quotes '\"' is a literal quote;
//               any other backslash is literal. Name case is preserved as
//               typed (roster matching downstream is case-insensitive);
//               duplicate names (case-insensitive) collapse with a warning.
//               A name cannot contain '#' — the comment split runs first)
//   push     := "push" (">=" int | "=" int ("," int)*)
//               (MECHANICS M4: PUSH-YOUR-LUCK. Declares which FACES score —
//               "push>=5" or "push=1,5". Throw, keep whichever scoring dice
//               you like, throw the rest; a throw with nothing scoring in it
//               busts. The predicate is DECLARED, never looked up in a table
//               of games — "5s and 6s score" is a fact about dice a player
//               types, exactly like "drop the lowest", and that is what keeps
//               GOALS goal 6's line where it is. Refused alongside adv/keep/
//               reroll/! and alongside tN — see js/rollspec.js validateMods.)
//   throws   := "t" int                    (2..5 — throw up to N times, keeping
//               whichever dice you choose between throws. Yahtzee and King of
//               Tokyo are both t3. Refused alongside adv/keep/reroll/! — see
//               js/rollspec.js validateMods for why, and note the TRANSCRIPT
//               of what was kept on which throw is an OUTCOME, not part of the
//               declaration, so it rides the log entry beside `values` and
//               notation totality is unaffected)
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
//   [adv|dis] [trailing keep] [trailing reroll] [!] [tN] [push] [check|cinematic]
//   [held|secret|w:names] [dcN] [# comment [| subtitle]]
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
// Mirrors js/rollspec.js MAX_THROWS, which is the authority — this file is
// dependency-free by design (it runs in Node and the browser with no imports),
// so it keeps its own copy exactly as MAX_DICE mirrors MAX_PHYSICAL_DICE.
// Both are refused by validateMods on the server regardless, so a drift here
// costs a worse error message, never a bad roll.
const MAX_THROWS = 5;

// Moment-kind flag words (UX.md §7.6): input aliases → normalized kind.
const KIND_WORDS = { check: 'check', cinematic: 'cinematic', cine: 'cinematic' };
// Full keyword flags whose prefixes read as incomplete input at end-of-string
// ("1d20 che", "1d20 hel", "1d20 secre", "1d20 w"), mirroring couldExtend's
// role for the older tokens. 'w:' is the whisper flag's opening — a bare 'w'
// at end-of-input is a prefix of it (a complete w: token never reaches the
// keyword check; it is handled before the lowercase dispatch).
const FLAG_KEYWORDS = ['check', 'cinematic', 'held', 'secret', 'w:'];
// An offer's notation also accepts 'blind' (the dice-tower alias for secret),
// so its prefixes read as mid-typing there. On a self-roll the complete word
// is itself refused, so a prefix of it has no valid extension and stays
// invalid — the three-state rule holds in both contexts.
const OFFER_FLAG_KEYWORDS = [...FLAG_KEYWORDS, 'blind'];

// Strip control characters plus zero-width and bidi-control characters
// (U+200B–200F, U+202A–202E, U+2066–2069, U+FEFF): invisible in rendered
// labels/comments, and the bidi overrides can visually spoof what other
// players see. Mirrored by rollspec.validateMods, which rejects them.
const stripCtl = (t) => t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');

// Cut user text (labels, comments, subtitles) to at most `max` UTF-16 units:
// trim \u2192 slice \u2192 surrogate guard \u2192 trim, so a cut landing on a space cannot
// leave trailing whitespace and a cut landing INSIDE a surrogate pair cannot
// strand its high half. A lone surrogate is not merely ugly \u2014 it renders as
// U+FFFD everywhere the text is shown, and it is a live hazard in every
// encoder downstream (encodeURIComponent throws URIError on one: an emoji at
// the cap boundary once took the whole app's boot down with it). server.js
// cutText and js/main.js's cut helpers are the mirrors of this function; the
// four layers must cut identically. Callers pass already-stripCtl'd text.
export function cutText(text, max) {
  let cut = text.trim().slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // unpaired high surrogate
  return cut.trim();
}

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
    /^(p|pu|pus|push|push>|push>=|push=)(\d{1,2}(,\d{1,2})*,?)?$/.test(frag) || // partial push
    /^[+-]$/.test(frag) ||
    /^\d{1,3}\[[^\]]{0,40}$/.test(frag)             // open label bracket
  );
}

// Split the trailing-flag region on whitespace — except that a w: audience
// token may carry quoted names with spaces and commas inside, so its quoted
// spans (with \" escapes) ride inside the single token. An unterminated quote
// consumes the rest of the string, which is what lets end-of-input decide
// incomplete. Junk glued after a closing quote stays in the token so
// parseWhisperFlag can name the error instead of a bogus unknown-flag split.
function tailTokens(tail) {
  const out = [];
  const ws = (ch) => /\s/.test(ch);
  let i = 0;
  while (i < tail.length) {
    while (i < tail.length && ws(tail[i])) i++;
    if (i >= tail.length) break;
    const start = i;
    if (/^w:/i.test(tail.slice(i, i + 2))) {
      i += 2;
      for (;;) {
        if (tail[i] === '"') {
          i++;
          while (i < tail.length) {
            if (tail[i] === '\\' && tail[i + 1] === '"') i += 2;
            else if (tail[i] === '"') { i++; break; }
            else i++;
          }
        }
        while (i < tail.length && !ws(tail[i]) && tail[i] !== ',') i++;
        if (tail[i] === ',') { i++; continue; }
        break;
      }
    } else {
      while (i < tail.length && !ws(tail[i])) i++;
    }
    out.push(tail.slice(start, i));
  }
  return out;
}

// Parse one 'w:' audience token (raw text, case preserved). Names are bare
// (no spaces, commas or quotes) or quoted ("Ann Smith"); inside quotes '\"'
// is a literal quote and any other backslash is literal. Case-insensitive
// duplicates collapse with a warning (roster matching downstream is
// case-insensitive too). `last` — this token ends the input — is what
// separates incomplete from invalid for the partial forms.
// Returns { names } or a failure object from invalid()/incomplete().
function parseWhisperFlag(raw, last, warnings) {
  const names = [];
  let i = 2; // past 'w:'
  if (i >= raw.length) {
    if (last) return incomplete('w: needs a name');
    return invalid('w: needs a name', 'no space after w: — w:Ann or w:"Ann Smith",Bob');
  }
  for (;;) {
    let name;
    let quoted = false;
    if (raw[i] === '"') {
      quoted = true;
      i++;
      let out = '';
      let closed = false;
      while (i < raw.length) {
        if (raw[i] === '\\' && raw[i + 1] === '"') { out += '"'; i += 2; }
        else if (raw[i] === '"') { i++; closed = true; break; }
        else { out += raw[i]; i++; }
      }
      // an open quote swallowed the rest of the input: a true prefix
      if (!closed) return incomplete('unfinished quoted name');
      if (i < raw.length && raw[i] !== ',') {
        return invalid('expected a comma after the quoted name', 'like w:"Ann Smith",Bob');
      }
      name = out;
    } else {
      const j = i;
      while (i < raw.length && raw[i] !== ',') i++;
      name = raw.slice(j, i);
      // a mid-name quote cannot re-render as a bare name; require the quoted
      // form so the canonical is always re-parseable
      if (name.includes('"')) {
        return invalid('a name with quotes must be fully quoted', 'like w:"Ann \\"Ace\\" Smith"');
      }
    }
    name = stripCtl(name);
    if (!name) {
      if (quoted) return invalid('empty name in w:', 'like w:Ann or w:"Ann Smith",Bob');
      if (i >= raw.length) {
        // 'w:Ann,' — extendable only when nothing follows in the input
        if (last) return incomplete(names.length ? 'expected another name after the comma' : 'w: needs a name');
        return invalid('expected a name after the comma', 'no spaces inside the list — w:Ann,Bob');
      }
      return invalid('empty name in w:', 'like w:Ann or w:"Ann Smith",Bob');
    }
    const lower = name.toLowerCase();
    if (names.some((n) => n.toLowerCase() === lower)) {
      warnings.push(`duplicate w: name "${name}" dropped`);
    } else {
      names.push(name);
    }
    if (raw[i] === ',') { i++; continue; }
    break;
  }
  return { names };
}

export function parseNotation(input, opts = {}) {
  // Offer context (opts.offer): the one place the grammar is context-aware —
  // 'blind' is a dice-tower alias for 'secret' on an offer's notation and a
  // teaching error on a self-roll. Everything else parses identically.
  const offer = !!(opts && opts.offer === true);
  if (typeof input !== 'string') return invalid('not a string');
  if (input.length > MAX_INPUT) return invalid('command too long', `max ${MAX_INPUT} characters`);
  let s = input.trim();
  if (!s) return incomplete('empty command');

  const warnings = [];
  // Visibility (GOALS.md goal 11): a prefix-implied mode and a trailing-flag
  // mode are tracked separately so "prefix + agreeing flag" reads as
  // agreement while "flag twice" stays a typo and two DIFFERENT visibility
  // spellings are the exclusion error.
  let visPrefix = null;     // 'secret' — every accepted visibility prefix
  let visPrefixWord = null; // the prefix as typed, for error hints
  let visFlag = null;   // {mode, names} from a trailing held/secret/w: flag

  // ---- mode prefix ---------------------------------------------------------
  if (s.startsWith('/')) {
    const m = /^\/([a-z]+)(?:\s+|$)/i.exec(s);
    if (!m) return invalid('bad command prefix', 'try /roll 1d20');
    const mode = m[1].toLowerCase();
    if (['gmroll', 'gmr', 'selfroll'].includes(mode)) {
      visPrefix = 'secret';
      visPrefixWord = '/' + mode;
    } else if (mode === 'sr') {
      // Never bind /sr: Foundry's /sr is a self roll (roller-only), Roll20's
      // 2026 /sr Secret Roll is the exact opposite (the roller cannot see).
      return invalid(
        '/sr is ambiguous — Foundry self roll vs Roll20 secret roll (opposites)',
        "use 'secret' (only you see it) or offer a dice-tower roll"
      );
    } else if (!['roll', 'r'].includes(mode)) {
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
    // normalize unescape → strip → cutText (trim → slice → surrogate guard →
    // trim), so the truncating cut can never leave whitespace (or a control
    // char shield it) that a re-parse of the canonical form would strip again,
    // and can never strand half of a surrogate pair — the canonical must be a
    // fixed point, and a lone surrogate is not even URL-encodable. Slicing
    // runs on the unescaped text, so a cap cut can never split a '\|' pair.
    const clean = (t, cap) => cutText(stripCtl(t.replace(/\\\|/g, '|')), cap);
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
        const term = { kind: 'dice', count, type: typeRaw === '%' ? 'd100' : 'd' + typeRaw, label: null, keep: null, reroll: null, explode: false, glued: false };
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
            // the dice term's SOURCE label (2d8[Wisdom]) — same normalization
            // as bonus labels, so the canonical survives every round trip
            // (storage, the YAML export, the wire)
            if (term.label) return invalid('label specified twice on one term');
            const rawLabel = stripCtl(gm[1]).trim();
            const label = cutText(rawLabel, MAX_LABEL);
            if (label !== rawLabel) warnings.push(`label truncated to ${MAX_LABEL} characters`);
            term.label = label || null;
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
          // same normalization as comments: strip → cutText (trim → slice →
          // surrogate guard → trim), so an over-long label is cut without
          // stranding half of a pair — a lone surrogate here would ride the
          // canonical into every encoder downstream (see cutText).
          const rawLabel = stripCtl(m[2]).trim();
          label = cutText(rawLabel, MAX_LABEL);
          if (label !== rawLabel) warnings.push(`label truncated to ${MAX_LABEL} characters`);
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
  let flagThrows = null;
  let flagPush = null;
  let expKind = null;
  let dc = null;

  // One visibility slot: a duplicate of the SAME flag is a typo; two
  // different visibility spellings (flag or prefix) are mutually exclusive.
  const visWord = (mode) => (mode === 'whisper' ? 'w:' : mode);
  const visClash = (mode) => {
    if (visFlag) {
      if (visFlag.mode === mode) return invalid(`${visWord(mode)} specified twice`);
      return invalid(
        `${visWord(visFlag.mode)} and ${visWord(mode)} are mutually exclusive`,
        'a roll has one visibility: held, secret or w:Name'
      );
    }
    if (visPrefix && visPrefix !== mode) {
      return invalid(
        `${visWord(visPrefix)} and ${visWord(mode)} are mutually exclusive`,
        `the ${visPrefixWord} prefix already sets ${visPrefix}`
      );
    }
    return null;
  };

  const tail = src.slice(exprEnd).trim();
  const tokens = tail ? tailTokens(tail) : [];
  for (let ti = 0; ti < tokens.length; ti++) {
    const raw = tokens[ti];
    const last = ti === tokens.length - 1;
    // The w: flag keeps its raw case — audience names are preserved as typed.
    if (/^w:/i.test(raw)) {
      const clash = visClash('whisper');
      if (clash) return clash;
      const w = parseWhisperFlag(raw, last, warnings);
      if (w.ok === false) return w;
      visFlag = { mode: 'whisper', names: w.names };
      continue;
    }
    const tok = raw.toLowerCase();
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
    } else if ((m = /^push(>=|=)(\d{1,2}(?:,\d{1,2})*)$/.exec(tok))) {
      if (flagPush) return invalid('push specified twice');
      const nums = m[2].split(',').map((x) => parseInt(x, 10));
      if (m[1] === '>=') {
        if (nums.length !== 1) {
          return invalid('push>= takes one number', 'use push=1,5 for a set of faces');
        }
        flagPush = { min: nums[0] };
      } else {
        // Sorted and deduped HERE, so the canonical form is a fixed point
        // rather than an echo of the order they were typed in. rollspec's
        // validateMods refuses an unsorted list, and this is what guarantees
        // the two never disagree about the same input.
        const set = [...new Set(nums)].sort((a2, b2) => a2 - b2);
        flagPush = { faces: set };
      }
    } else if ((m = /^t(\d{1,2})$/.exec(tok))) {
      // tN — a TURN (MECHANICS M2). No collision with the keep family: those
      // are kh/kl/dh/dl/k/d, and bare 't' is not among them.
      if (flagThrows) return invalid('throws specified twice');
      const n = parseInt(m[1], 10);
      if (n < 2) return invalid('a turn needs at least 2 throws', 'one throw is just a roll');
      if (n > MAX_THROWS) return invalid(`throws must be 2-${MAX_THROWS}`);
      flagThrows = n;
    } else if (Object.hasOwn(KIND_WORDS, tok)) {
      if (expKind) return invalid('check/cinematic specified twice');
      expKind = KIND_WORDS[tok];
    } else if (tok === 'held') {
      // 'held' = face down for everyone until revealed. No prefix implies it:
      // every cross-tool prefix that hides a roll hides it from the TABLE,
      // never from the roller (UX.md §3.2's terminology note).
      const clash = visClash('held');
      if (clash) return clash;
      visFlag = { mode: 'held', names: [] };
    } else if (tok === 'secret') {
      // 'secret' = the roll exists only for the roller; what the /gmroll,
      // /gmr and /selfroll prefixes all normalize to.
      const clash = visClash('secret');
      if (clash) return clash;
      visFlag = { mode: 'secret', names: [] };
    } else if (tok === 'blind') {
      // 'blind' universally means the roller cannot see their own result.
      // On an OFFER that is exactly the dice-tower roll — offerer-only —
      // so it is accepted there as an alias canonicalizing to 'secret'
      // (canonical never emits 'blind'). A self-roll cannot be blind:
      // there is nobody else to hold the result.
      if (!offer) {
        return invalid('a blind roll needs someone else to hold the result — offer this roll instead');
      }
      const clash = visClash('secret');
      if (clash) return clash;
      visFlag = { mode: 'secret', names: [] };
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
    } else if (last && (couldExtend(tok) || (offer ? OFFER_FLAG_KEYWORDS : FLAG_KEYWORDS).some((w) => w.startsWith(tok)))) {
      return incomplete('unfinished flag');
    } else {
      return invalid(`unknown flag "${tokens[ti].slice(0, 12)}"`, 'flags: adv, dis, kh/kl/dh/dl N, ro<=N, !, check, cinematic, held, secret, w:Name, dc N');
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
  const sources = [];
  for (const t of diceTerms) for (let i = 0; i < t.count; i++) {
    dice.push(t.type);
    sources.push(t.label || null);
  }
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

  // A HELD PUSH IS A CONTRADICTION, and refusing it here is kinder than
  // letting it roll. `held` is face down for EVERYONE INCLUDING THE ROLLER
  // (UX §3.2), and push-your-luck is nothing but a series of choices about
  // faces you can see. Secret and whisper are fine — the roller sees their own
  // dice in both — so only this one rung is refused.
  const visMode = (visFlag && visFlag.mode) || visPrefix || null;
  if (flagPush && visMode === 'held') {
    return invalid(
      'a push turn cannot be held',
      'held hides the faces from you too, and push is a choice about faces'
    );
  }
  if (flagPush && flagThrows) {
    return invalid(
      'a push turn cannot also set a throw count',
      'push ends when it busts or you bank; tN ends after N throws'
    );
  }
  if (flagPush && (flagAdv || keep || reroll || explode)) {
    return invalid(
      'a push turn cannot also keep, drop, reroll or explode',
      'those choose dice within ONE throw; push sets dice aside between throws'
    );
  }
  if (flagPush) {
    // The same unreachability refusal rollspec makes, said in the grammar's
    // voice: a predicate no die in this pool can satisfy is a turn that busts
    // on its first throw, every time.
    const reach = (t) => {
      const max = DIE_MAX[t] || 0;
      if (flagPush.min !== undefined) return max >= flagPush.min;
      return flagPush.faces.some((f) => (t === 'd10x'
        ? (f % 10 === 0 && f <= 90) : (f >= 1 && f <= max)));
    };
    if (!dice.some(reach)) {
      const what = flagPush.min !== undefined
        ? `${flagPush.min} or more` : flagPush.faces.join(', ');
      return invalid(`no die in this pool can show ${what}`,
        'a push that can never score busts on its first throw');
    }
  }
  if (flagThrows && (flagAdv || keep || reroll || explode)) {
    return invalid(
      'a turn cannot also keep, drop, reroll or explode',
      'those choose dice within ONE throw; tN re-throws the dice you do not keep'
    );
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
  if (flagThrows) mods.throws = flagThrows;
  if (flagPush) mods.push = flagPush;
  const spec = { dice, mods: Object.keys(mods).length ? mods : null };
  // Source labels ride present-or-absent: an unlabeled pool has NO sources
  // key, so every pre-Rack payload and canonical stays byte-identical.
  if (sources.some(Boolean)) spec.sources = sources;
  // Visibility rides the spec, present-or-absent: an open roll has NO
  // visibility key (wire-shape stability), a non-open roll carries
  // {mode, names} with names always an array ([] outside whisper).
  // faceDown stays exactly the legacy spelling of 'held'.
  const visibility = visFlag || (visPrefix ? { mode: visPrefix, names: [] } : null);
  if (visibility) spec.visibility = visibility;
  const faceDown = visibility !== null && visibility.mode === 'held';

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
// Canonical renderer — the single source for group chips, storage, the YAML
// export, history and the wire.
// parseNotation(canonicalNotation(x)) is a byte-identical fixed point.
// ---------------------------------------------------------------------------

export function canonicalNotation(spec, extras = {}) {
  const { dc = null, comment = null, exp = null, faceDown = false } = extras;
  // Visibility (GOALS.md goal 11): an explicit extras.visibility wins (null
  // there means open), else the spec's own visibility, else the legacy
  // faceDown alias (= held). Spec-before-faceDown matters: old callers that
  // re-canonicalize a parse result as (res.spec, {faceDown: res.faceDown})
  // must not downgrade a secret/whisper spec to open.
  const visibility = extras.visibility !== undefined
    ? extras.visibility
    : (spec.visibility || (faceDown ? { mode: 'held' } : null));
  const m = spec.mods || {};
  const counts = new Map();
  for (const t of spec.dice) counts.set(t, (counts.get(t) || 0) + 1);

  // Dice group by (type, source label): '2d8[Wisdom]+1d8[Bob/Wisdom]' must
  // not merge, while same-source same-type dice always do. Group insertion
  // order breaks ties within a type so the canonical is a fixed point.
  const groups = new Map();
  spec.dice.forEach((t, i) => {
    const label = spec.sources ? (spec.sources[i] || null) : null;
    const k = `${t}\u0000${label || ''}`;
    if (!groups.has(k)) groups.set(k, { type: t, label, n: 0, order: groups.size });
    groups.get(k).n += 1;
  });
  const groupList = [...groups.values()].sort((a, b) =>
    DIE_ORDER.indexOf(a.type) - DIE_ORDER.indexOf(b.type) || a.order - b.order);

  const singleType = counts.size === 1;
  const sameLabel = groupList.every((g) => g.label === groupList[0].label);
  const isD100 = counts.size === 2 && counts.get('d10x') === 1 && counts.get('d10') === 1
    && sameLabel; // a split-source pair is two dice, not a d100

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
  // glue may sit inline only on a pool that renders as ONE term: a single
  // type split across sources becomes several terms, and pool-wide glue on
  // each would re-parse as duplication.
  const glueInline = singleType && groupList.length === 1 && !collapsible;

  const lbl = (g) => (g.label ? `[${g.label}]` : '');
  const diceStrs = isD100
    ? [`d100${lbl(groupList[0])}`]
    : groupList.map((g) => g.n + g.type + lbl(g) + (glueInline ? glue.join('') : ''));

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
  if (m.throws) flags.push(`t${m.throws}`);
  if (m.push) {
    flags.push(m.push.min !== undefined
      ? `push>=${m.push.min}`
      : `push=${[...m.push.faces].sort((a, b) => a - b).join(',')}`);
  }
  if (exp && exp.kind) flags.push(exp.kind);
  if (visibility && visibility.mode) {
    if (visibility.mode === 'whisper') {
      // Quote ONLY names that need it — spaces, commas, quotes, or leading/
      // trailing whitespace (all matched by /[\s,"]/ on the name itself);
      // '"' inside a quoted name escapes as '\"'. Names the parser can
      // produce always re-parse (a quoted name can never end in a lone
      // backslash — the parse would have read it as an escape and refused).
      const fmt = (n) => (/[\s,"]/.test(n) ? '"' + n.replace(/"/g, '\\"') + '"' : n);
      flags.push('w:' + (visibility.names || []).map(fmt).join(','));
    } else {
      flags.push(visibility.mode); // 'held' | 'secret'
    }
  }
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
      // THE PROCEDURE FLAGS, and their absence here was a check that could
      // not fail. This function's only caller is the test suite — including
      // the fuzzer's property that a spec does not drift through its own
      // canonical form — so from the day `throws` shipped until 2026-08-28,
      // two specs differing ONLY in their procedure were "equal", and the
      // fuzzer would not have noticed a canonical form that dropped tN or
      // push entirely. Found by the M6 design pass reading this file, not by
      // anything going red. Anything added to `mods` belongs on this list.
      throws: m.throws || null,
      push: m.push ? { min: m.push.min ?? null, faces: m.push.faces || null } : null,
    });
  };
  return norm(a) === norm(b);
}
