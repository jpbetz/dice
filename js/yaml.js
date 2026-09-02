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

// js/yaml.js — the reader and the line-patching writer for dice.yaml
// (docs/DEVMODE.md §3, §6). Node-pure: no DOM, no three, no cannon, no npm.
//
// A SUBSET, refused loudly outside it (every refusal names its line): block
// maps, block lists, one-line flow maps and lists (one level of nesting
// inside a flow), plain / 'single' / "double" scalars, `#` comments, blank
// lines, indentation in multiples of two spaces. Numbers → Number; `null`,
// `~`, empty → null; everything else → string. Booleans (`true false yes no
// on off`) are REFUSED: a two-state value is an enum with named states.
// Anchors, tags, documents, block scalars, tabs, duplicate keys, mixed
// list/map levels, a `.` in an unquoted key and a number too large to hold
// (`1e400`) are refused too.
//
// KEY ORDER is the file's, with one JS caveat: a map whose keys are all
// integer-like (`12:`) enumerates those first, in numeric order, however the
// file wrote them — plain objects do that. dice.yaml names nothing that way.
//
// THE POINT IS THE PATCH. parseYaml records a span for every scalar (line,
// column, raw text) and an insertion point for every map, so patchYaml can
// rewrite ONE value on ONE line and leave every other byte alone — comments,
// blank lines, key order, quoting style. A leaf the file does not name is
// inserted under its nearest existing ancestor, intermediate maps created as
// needed. `git diff dice.yaml` is the review.
//
// Spans are keyed by pathKey(path) = path.join('/'):
//   scalar: { line, col, end, raw, kind: 'string'|'number'|'null', flow }
//           line is 1-based; [col, end) is the raw text on that line; a bare
//           `key:` is a null with raw '' and col right after the colon.
//   map:    { line, indent, childIndent, lastLine, flow, kind: 'map', keyLine, keyEnd }
//           indent is the column of the key that OWNS the map (−2 for the
//           root, so `indent + 2` is where a two-space file puts children);
//           childIndent is the measured column of its children, which is
//           what the writer uses because 4-space files are accepted.
//           A new child goes after lastLine (its last child's last line,
//           trailing comments indented with the children included). A flow
//           map also carries open/close columns and its entries, and a new
//           child goes before the closing `}` on `line`.
//   list:   the same shape with kind 'list' (recorded, never patched).

const NUM_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const BOOL_RE = /^(true|false|yes|no|on|off)$/i;
const SPECIAL_FIRST = '-?:,[]{}#&*!|>\'"%@`';

export class YamlError extends Error {
  constructor(message, line = 0) {
    super(message);
    this.name = 'YamlError';
    this.line = Number.isInteger(line) && line > 0 ? line : 0;
  }
}

export function toPath(p) { return Array.isArray(p) ? p : String(p).split('.'); }
export function pathKey(path) { return toPath(path).join('/'); }

const dotted = (path) => path.join('.');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

// A quote opens a scalar only where a value or key may begin: at line start,
// right after `[`, `{` or `,`, or after a space run that follows `:`, `,`,
// `[`, `{` or `-` (so `k: 'x'`, `- 'x'`, `['a']`, `{'k': 1}` open one).
// Anywhere else — `it's`, `rock-'n roll`, `x:'y` — the quote is text. The
// writer (needsQuote) applies THIS SAME RULE to decide when a string with a
// quote in it must be double-quoted, so what it writes the reader reads back.
function isQuoteStart(raw, i) {
  if (i === 0) return true;
  const p = raw[i - 1];
  if ('[{,'.includes(p)) return true;
  if (p !== ' ') return false;
  let j = i - 1;
  while (j >= 0 && raw[j] === ' ') j--;
  return j < 0 || ':,[{-'.includes(raw[j]);
}

// { value, end } — end is the index after the closing quote.
function readQuoted(raw, i, no) {
  const q = raw[i];
  let out = '';
  let j = i + 1;
  for (;;) {
    if (j >= raw.length) throw new YamlError('unterminated quoted scalar', no);
    const c = raw[j];
    if (q === "'") {
      if (c === "'") {
        if (raw[j + 1] === "'") { out += "'"; j += 2; continue; }
        return { value: out, end: j + 1 };
      }
      out += c; j++;
      continue;
    }
    if (c === '\\') {
      const e = raw[j + 1];
      if (e === '"') out += '"';
      else if (e === '\\') out += '\\';
      else if (e === 'n') out += '\n';
      else if (e === 't') out += '\t';
      else if (e === 'r') out += '\r';
      else throw new YamlError(`unknown escape \\${e ?? ''} in a double-quoted scalar`, no);
      j += 2;
      continue;
    }
    if (c === '"') return { value: out, end: j + 1 };
    out += c; j++;
  }
}

// Where the comment starts (raw.length when there is none). `#` starts one at
// line start or after a space; inside quotes it is text.
function commentCut(raw, no) {
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '#' && (i === 0 || raw[i - 1] === ' ')) return i;
    if ((c === "'" || c === '"') && isQuoteStart(raw, i)) { i = readQuoted(raw, i, no).end; continue; }
    i++;
  }
  return raw.length;
}

function scanLines(text) {
  return text.split('\n').map((row, idx) => {
    const no = idx + 1;
    const raw = row.endsWith('\r') ? row.slice(0, -1) : row;
    if (raw.includes('\t')) throw new YamlError('tabs are not allowed; indent with spaces', no);
    let indent = 0;
    while (indent < raw.length && raw[indent] === ' ') indent++;
    const cut = commentCut(raw, no);
    let end = cut;
    while (end > indent && raw[end - 1] === ' ') end--;
    const blank = end <= indent;
    const commentOnly = blank && cut < raw.length;
    if (!blank && indent === 0) {
      if (/^(---|\.\.\.)( |$)/.test(raw)) throw new YamlError('multi-document markers (---, ...) are not supported', no);
      if (raw[0] === '%') throw new YamlError('directives (%) are not supported', no);
    }
    return { no, raw, indent, end, blank, commentOnly };
  });
}

const isListItem = (L) => L.raw[L.indent] === '-' && (L.indent + 1 >= L.end || L.raw[L.indent + 1] === ' ');

function nextContent(st, i) {
  while (i < st.lines.length && st.lines[i].blank) i++;
  return i;
}

// `measure` is false for the map a `- key: v` list item opens: its keys sit
// two columns past the dash whatever the file's step is, so that offset must
// not be mistaken for the step a 4-space file nests by.
function checkStep(st, ownerIndent, indent, no, measure = true) {
  const d = indent - ownerIndent;
  if (d <= 0 || d % 2) throw new YamlError('indent must step by a multiple of two spaces', no);
  if (measure && ownerIndent >= 0 && (!st.step || d < st.step)) st.step = d;
}

// ---------------------------------------------------------------------------
// Scalars and keys
// ---------------------------------------------------------------------------

function refuseIndicator(t, no) {
  const c = t[0];
  if (c === '&' || c === '*') throw new YamlError('anchors and aliases (&, *) are not supported', no);
  if (c === '!') throw new YamlError('tags (!) are not supported', no);
  if (c === '|' || c === '>') throw new YamlError('block scalars (|, >) are not supported; write the value on one line', no);
  if (c === '%' || c === '@' || c === '`' || c === '?') throw new YamlError(`"${c}" is a reserved indicator; quote the value`, no);
}

function classifyPlain(text, no) {
  if (text === '' || text === 'null' || text === '~') return { value: null, kind: 'null' };
  refuseIndicator(text, no);
  if (NUM_RE.test(text)) {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new YamlError('number is out of range', no);
    return { value, kind: 'number' };
  }
  if (BOOL_RE.test(text)) throw new YamlError('booleans are not allowed; use an enum with named states', no);
  if (text.includes(': ')) throw new YamlError('a plain scalar may not contain ": "; quote it', no);
  return { value: text, kind: 'string' };
}

// A plain key may not be empty (a quoted "" may); no key may be __proto__.
function checkKey(key, no, quoted = false) {
  if (!key && !quoted) throw new YamlError('a key may not be empty', no);
  if (key === '__proto__') throw new YamlError('"__proto__" is not a legal key', no);
}

// One scalar starting at col, plain or quoted. `delims` (flow only) are the
// characters that end a plain scalar; in block context it runs to `lim`.
function readScalarAt(st, L, col, lim, path, delims) {
  const { raw, no } = L;
  const c = raw[col];
  let value, end, kind;
  if (c === '"' || c === "'") {
    ({ value, end } = readQuoted(raw, col, no));
    kind = 'string';
  } else {
    end = lim;
    if (delims) for (let j = col; j < lim; j++) if (delims.includes(raw[j])) { end = j; break; }
    while (end > col && raw[end - 1] === ' ') end--;
    ({ value, kind } = classifyPlain(raw.slice(col, end), no));
  }
  st.spans.set(pathKey(path), { line: no, col, end, raw: raw.slice(col, end), kind, flow: !!delims });
  return { value, end };
}

// The key of a block map line at `col` → { key, colonEnd, valueCol }.
function readKey(L, col) {
  const { raw, end, no } = L;
  let key, k;
  if (raw[col] === '"' || raw[col] === "'") {
    const q = readQuoted(raw, col, no);
    key = q.value;
    k = q.end;
    while (k < end && raw[k] === ' ') k++;
    if (raw[k] !== ':' || (k + 1 < end && raw[k + 1] !== ' ')) throw new YamlError('expected ":" after the quoted key', no);
    checkKey(key, no, true);
  } else {
    if (raw[col] === '{' || raw[col] === '[') throw new YamlError('expected `key: value` (a flow collection needs a key here)', no);
    refuseIndicator(raw.slice(col, end), no);
    k = col;
    for (;;) {
      k = raw.indexOf(':', k);
      if (k < 0 || k >= end) throw new YamlError('expected `key: value` (no colon found)', no);
      if (k + 1 >= end || raw[k + 1] === ' ') break;
      k++;
    }
    key = raw.slice(col, k).trimEnd();
    checkKey(key, no);
    if (key.includes('.')) throw new YamlError(`unquoted key ${JSON.stringify(key)} contains a "."; quote it`, no);
  }
  const colonEnd = k + 1;
  let valueCol = colonEnd;
  while (valueCol < end && raw[valueCol] === ' ') valueCol++;
  return { key, colonEnd, valueCol };
}

// Does the text at `col` look like `key: …`? (a list item may open a map)
function isKeyLine(L, col) {
  const { raw, end } = L;
  const c = raw[col];
  if (c === '{' || c === '[') return false;
  if (c === '"' || c === "'") {
    try {
      let k = readQuoted(raw, col, L.no).end;
      while (k < end && raw[k] === ' ') k++;
      return raw[k] === ':' && (k + 1 >= end || raw[k + 1] === ' ');
    } catch { return false; }
  }
  for (let k = raw.indexOf(':', col); k >= 0 && k < end; k = raw.indexOf(':', k + 1)) {
    if (k + 1 >= end || raw[k + 1] === ' ') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Flow collections — one line, one level of nesting inside
// ---------------------------------------------------------------------------

function parseFlow(st, L, col, path, depth, ownerIndent) {
  const { raw, end: lim, no } = L;
  const isMap = raw[col] === '{';
  const close = isMap ? '}' : ']';
  const what = isMap ? 'map' : 'list';
  if (depth > 1) throw new YamlError('flow collections nest only one level deep', no);
  const value = isMap ? {} : [];
  const span = {
    line: no, indent: ownerIndent, childIndent: null, lastLine: no, flow: true, kind: what,
    keyLine: no, keyEnd: col, open: col, close: -1, depth, entries: [],
  };
  st.spans.set(pathKey(path), span);
  const skip = (j) => { while (j < lim && raw[j] === ' ') j++; return j; };
  const unterminated = () => new YamlError(`flow ${what} does not close on its line (multi-line flow is not supported)`, no);
  const finish = (k) => {
    span.close = k;
    span.col = col;
    span.end = k + 1;
    span.raw = raw.slice(col, k + 1);
    return { value, end: k + 1 };
  };
  let j = skip(col + 1);
  if (j >= lim) throw unterminated();
  if (raw[j] === close) return finish(j);
  for (;;) {
    if (j >= lim) throw unterminated();
    const keyCol = j;
    let key, itemPath;
    if (isMap) {
      if (raw[j] === '"' || raw[j] === "'") {
        const q = readQuoted(raw, j, no);
        key = q.value;
        checkKey(key, no, true);
        j = skip(q.end);
      } else {
        let k = j;
        while (k < lim && !(raw[k] === ':' && (k + 1 >= lim || ' ,'.includes(raw[k + 1]) || raw[k + 1] === close))) k++;
        key = raw.slice(j, k).trimEnd();
        // no colon, nothing before it, or a stray `,` / bracket swept into it
        if (k >= lim || !key || /[,[\]{}]/.test(key)) throw new YamlError('expected "key: value" inside the flow map', no);
        checkKey(key, no);
        refuseIndicator(key, no);
        if (key.includes('.')) throw new YamlError(`unquoted key ${JSON.stringify(key)} contains a "."; quote it`, no);
        j = k;
      }
      if (raw[j] !== ':') throw new YamlError('expected "key: value" inside the flow map', no);
      j = skip(j + 1);
      if (Object.hasOwn(value, key)) throw new YamlError(`duplicate key ${JSON.stringify(key)}`, no);
      itemPath = [...path, key];
    } else {
      itemPath = [...path, String(value.length)];
    }
    if (j >= lim) throw unterminated();
    const c = raw[j];
    let v, vend;
    if (c === ',' || c === close) {
      st.spans.set(pathKey(itemPath), { line: no, col: j, end: j, raw: '', kind: 'null', flow: true });
      v = null; vend = j;
    } else if (c === '{' || c === '[') {
      ({ value: v, end: vend } = parseFlow(st, L, j, itemPath, depth + 1, ownerIndent));
    } else {
      ({ value: v, end: vend } = readScalarAt(st, L, j, lim, itemPath, `,${close}`));
    }
    if (isMap) value[key] = v; else value.push(v);
    span.entries.push({ key, keyCol, end: vend });
    j = skip(vend);
    if (j >= lim) throw unterminated();
    if (raw[j] === ',') {
      j = skip(j + 1);
      if (j < lim && raw[j] === close) return finish(j);
      continue;
    }
    if (raw[j] === close) return finish(j);
    throw new YamlError(`expected "," or "${close}" in the flow ${what}`, no);
  }
}

// ---------------------------------------------------------------------------
// Block structure
// ---------------------------------------------------------------------------

// The value after a key (or after `- `): a nested block, a flow, a scalar or
// nothing. → { value, next, lastIdx }
function parseValue(st, i, path, col, ownerIndent, L) {
  const { lines } = st;
  if (col >= L.end) {
    const j = nextContent(st, i + 1);
    if (j < lines.length && lines[j].indent > ownerIndent) return parseNode(st, j, path, ownerIndent, L.no, col);
    st.spans.set(pathKey(path), { line: L.no, col, end: col, raw: '', kind: 'null', flow: false });
    return { value: null, next: i + 1, lastIdx: i };
  }
  const c = L.raw[col];
  const r = (c === '{' || c === '[')
    ? parseFlow(st, L, col, path, 0, ownerIndent)
    : readScalarAt(st, L, col, L.end, path, null);
  let e = r.end;
  while (e < L.end && L.raw[e] === ' ') e++;
  if (e !== L.end) throw new YamlError('trailing text after the value', L.no);
  return { value: r.value, next: i + 1, lastIdx: i };
}

function parseNode(st, i, path, ownerIndent, keyLine, keyEnd) {
  return isListItem(st.lines[i])
    ? parseList(st, i, path, ownerIndent, keyLine, keyEnd)
    : parseMap(st, i, path, ownerIndent, keyLine, keyEnd);
}

// Trailing comment lines indented with the children belong to the block.
function closeBlock(st, span, indent, lastIdx, stop) {
  const { lines } = st;
  for (let j = lastIdx + 1; j < stop; j++) if (lines[j].commentOnly && lines[j].indent >= indent) lastIdx = j;
  span.lastLine = lines[lastIdx].no;
  return lastIdx;
}

function parseMap(st, i, path, ownerIndent, keyLine, keyEnd, measure = true) {
  const { lines } = st;
  const n = lines.length;
  const indent = lines[i].indent;
  checkStep(st, ownerIndent, indent, lines[i].no, measure);
  const obj = {};
  const span = { line: lines[i].no, indent: ownerIndent, childIndent: indent, lastLine: lines[i].no, flow: false, kind: 'map', keyLine, keyEnd };
  st.spans.set(pathKey(path), span);
  let lastIdx = i;
  while (i < n) {
    const L = lines[i];
    if (L.blank) { i++; continue; }
    if (L.indent < indent) break;
    if (L.indent > indent) throw new YamlError(`unexpected indent (expected ${indent} spaces)`, L.no);
    if (isListItem(L)) throw new YamlError('a list item among map keys (a level is a map or a list, not both)', L.no);
    const k = readKey(L, indent);
    if (Object.hasOwn(obj, k.key)) throw new YamlError(`duplicate key ${JSON.stringify(k.key)}`, L.no);
    const r = parseValue(st, i, [...path, k.key], k.valueCol, indent, L);
    obj[k.key] = r.value;
    lastIdx = r.lastIdx;
    i = r.next;
  }
  lastIdx = closeBlock(st, span, indent, lastIdx, i);
  return { value: obj, next: i, lastIdx };
}

function parseList(st, i, path, ownerIndent, keyLine, keyEnd) {
  const { lines } = st;
  const n = lines.length;
  const indent = lines[i].indent;
  checkStep(st, ownerIndent, indent, lines[i].no);
  const arr = [];
  const span = { line: lines[i].no, indent: ownerIndent, childIndent: indent, lastLine: lines[i].no, flow: false, kind: 'list', keyLine, keyEnd };
  st.spans.set(pathKey(path), span);
  let lastIdx = i;
  while (i < n) {
    const L = lines[i];
    if (L.blank) { i++; continue; }
    if (L.indent < indent) break;
    if (L.indent > indent) throw new YamlError(`unexpected indent (expected ${indent} spaces)`, L.no);
    if (!isListItem(L)) throw new YamlError('a map key among list items (a level is a map or a list, not both)', L.no);
    let col = indent + 1;
    while (col < L.end && L.raw[col] === ' ') col++;
    const itemPath = [...path, String(arr.length)];
    let r;
    if (col < L.end && isListItem({ raw: L.raw, indent: col, end: L.end })) throw new YamlError('nested lists are not supported', L.no);
    if (col < L.end && isKeyLine(L, col)) {
      // `- key: v` opens a map whose first key sits on the item line; the
      // rest of its keys follow at that same column. That column is not the
      // file's indent step, so this map does not measure it.
      lines[i] = { ...L, indent: col };
      try { r = parseMap(st, i, itemPath, indent, L.no, 0, false); } finally { lines[i] = L; }
    } else {
      r = parseValue(st, i, itemPath, col, indent, L);
    }
    arr.push(r.value);
    lastIdx = r.lastIdx;
    i = r.next;
  }
  lastIdx = closeBlock(st, span, indent, lastIdx, i);
  return { value: arr, next: i, lastIdx };
}

// → { tree, spans }; the root map's span is keyed '' and carries `step`, the
// smallest indent step the file uses (2 when it nests nothing).
export function parseYaml(text) {
  if (typeof text !== 'string') throw new YamlError('expected a string of YAML');
  const st = { lines: scanLines(text), spans: new Map(), step: 0 };
  const i = nextContent(st, 0);
  if (i >= st.lines.length) {
    let last = 0;
    for (const L of st.lines) if (L.commentOnly) last = L.no;
    st.spans.set('', { line: 0, indent: -2, childIndent: 0, lastLine: last, flow: false, kind: 'map', keyLine: 0, keyEnd: 0, step: 2 });
    return { tree: {}, spans: st.spans };
  }
  const first = st.lines[i];
  if (first.indent !== 0) throw new YamlError('the top level must start at column 0', first.no);
  if (isListItem(first)) throw new YamlError('the document must be a map at the top level, not a list', first.no);
  const { value } = parseMap(st, i, [], -2, 0, 0);
  st.spans.get('').step = st.step || 2;
  return { tree: value, spans: st.spans };
}

// ---------------------------------------------------------------------------
// Writing scalars
// ---------------------------------------------------------------------------

function needsQuote(s) {
  if (s === '') return true;
  if (s !== s.trim()) return true;
  if (SPECIAL_FIRST.includes(s[0])) return true;
  if (s.includes(': ') || s.includes(' #') || s.endsWith(':')) return true;
  if (/[,[\]{}\n\r\t]/.test(s)) return true;
  if (NUM_RE.test(s) || BOOL_RE.test(s) || s === 'null' || s === '~') return true;
  // a quote where the reader would open a quoted scalar (`x - 'y`) must be
  // quoted whole; a quote it reads as text (`it's`, `rock-'n roll`) need not
  for (let i = 0; i < s.length; i++) if ((s[i] === "'" || s[i] === '"') && isQuoteStart(s, i)) return true;
  return false;
}

function dq(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}

function formatKey(k) {
  const s = String(k);
  return needsQuote(s) || s.includes('.') ? dq(s) : s;
}

function formatFlowMap(o) {
  const keys = Object.keys(o);
  return keys.length ? `{ ${keys.map((k) => `${formatKey(k)}: ${formatScalar(o[k])}`).join(', ')} }` : '{}';
}

// One scalar as the file writes it: numbers via String (−0 → 0, non-finite
// throws), null → null, strings double-quoted only when needed, booleans
// refused. An empty map or list writes as {} / [], a list of scalars as a
// flow list, so a patch can name one.
export function formatScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new YamlError(`cannot write a non-finite number (${v})`);
    return Object.is(v, -0) ? '0' : String(v);
  }
  if (typeof v === 'string') return needsQuote(v) ? dq(v) : v;
  if (typeof v === 'boolean') throw new YamlError('booleans are not allowed; use an enum with named states');
  if (Array.isArray(v)) return v.length ? `[${v.map(formatScalar).join(', ')}]` : '[]';
  if (isPlainObject(v)) return formatFlowMap(v);
  throw new YamlError(`cannot write a ${typeof v} as YAML`);
}

// ---------------------------------------------------------------------------
// Emit — block style, one key per line, two-space nesting
// ---------------------------------------------------------------------------

// `step` is the nesting width: 2 for emitYaml, the file's own for a patch.
function emitInto(out, value, indent, step) {
  const pad = ' '.repeat(indent);
  if (isPlainObject(value) && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) {
      const head = `${pad}${formatKey(k)}:`;
      if (isPlainObject(v) && Object.keys(v).length) { out.push(head); emitInto(out, v, indent + step, step); }
      else if (Array.isArray(v) && v.length) { out.push(head); emitInto(out, v, indent + step, step); }
      else out.push(`${head} ${formatScalar(v)}`);
    }
    return;
  }
  if (Array.isArray(value) && value.length) {
    for (const item of value) {
      if (Array.isArray(item)) throw new YamlError('nested lists are not supported');
      if (isPlainObject(item) && Object.keys(item).length) {
        const sub = [];
        emitInto(sub, item, indent + 2, step);
        sub[0] = `${pad}- ${sub[0].slice(indent + 2)}`;
        out.push(...sub);
      } else {
        out.push(`${pad}- ${formatScalar(item)}`);
      }
    }
    return;
  }
  out.push(pad + formatScalar(value));
}

function emitLines(value, indent, step) {
  const out = [];
  emitInto(out, value, indent, step);
  return out;
}

export function emitYaml(value, indent = 0) {
  return `${emitLines(value, indent, 2).join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Patch — rewrite only the lines a change touches
// ---------------------------------------------------------------------------

// Rows keep their own line ending so a CRLF file stays a CRLF file.
function splitRows(text) {
  const crlf = text.includes('\r\n');
  const rows = text.split('\n').map((t) => (t.endsWith('\r') ? { t: t.slice(0, -1), cr: true } : { t, cr: false }));
  return { rows, crlf };
}
const joinRows = ({ rows }) => rows.map((r) => r.t + (r.cr ? '\r' : '')).join('\n');

function flattenInto(out, path, v) {
  if (isPlainObject(v) && Object.keys(v).length) for (const [k, s] of Object.entries(v)) flattenInto(out, [...path, k], s);
  else out.push([path, v]);
}

function nest(rest, value) {
  let v = value;
  for (let i = rest.length - 1; i >= 0; i--) v = { [rest[i]]: v };
  return v;
}

const getAt = (tree, path) => path.reduce((n, k) => n[k], tree);

function setRaw(doc, span, rep) {
  const row = doc.rows[span.line - 1];
  const s = span.raw === '' && span.col > 0 && row.t[span.col - 1] !== ' ' ? ` ${rep}` : rep;
  row.t = row.t.slice(0, span.col) + s + row.t.slice(span.end);
}

function spliceRows(doc, at, texts) {
  doc.rows.splice(at, 0, ...texts.map((t) => ({ t, cr: doc.crlf })));
}

// `bareOk`: a later change in the same batch inserts under the parent, so
// when this removal empties it the key may stay bare (`key:`) for that insert
// to fill, rather than becoming `key: {}` and turning the block map flow.
function removeNode(doc, tree, spans, path, span, bareOk) {
  const parentPath = path.slice(0, -1);
  const pspan = spans.get(pathKey(parentPath));
  const parent = getAt(tree, parentPath);
  const sole = Object.keys(parent).length === 1;
  if (pspan.flow) {
    const row = doc.rows[pspan.line - 1];
    const es = pspan.entries;
    const idx = es.findIndex((e) => e.key === path.at(-1));
    if (sole) row.t = `${row.t.slice(0, pspan.open)}{}${row.t.slice(pspan.close + 1)}`;
    else if (idx < es.length - 1) row.t = row.t.slice(0, es[idx].keyCol) + row.t.slice(es[idx + 1].keyCol);
    else row.t = row.t.slice(0, es[idx - 1].end) + row.t.slice(es[idx].end);
    return;
  }
  const block = !span.flow && (span.kind === 'map' || span.kind === 'list');
  const from = block ? span.keyLine : span.line;
  const to = block ? span.lastLine : span.line;
  doc.rows.splice(from - 1, to - from + 1);
  // the parent's last child left: `key:` alone would read as null, so say {}
  if (sole && parentPath.length && !bareOk) {
    const row = doc.rows[pspan.keyLine - 1];
    row.t = `${row.t.slice(0, pspan.keyEnd)} {}${row.t.slice(pspan.keyEnd)}`;
  }
}

// `step` is the ORIGINAL file's indent step: an intermediate text may have
// lost its only nested block to an earlier removal in the same batch.
function applyOne(text, path, value, step, bareOk) {
  const { tree, spans } = parseYaml(text);
  const doc = splitRows(text);
  let node = tree;
  let depth = 0;
  while (depth < path.length && isPlainObject(node) && Object.hasOwn(node, path[depth])) { node = node[path[depth]]; depth++; }
  const here = path.slice(0, depth);

  if (depth === path.length) {
    const span = spans.get(pathKey(path));
    if (value === undefined) { removeNode(doc, tree, spans, path, span, bareOk); return joinRows(doc); }
    if (!span.flow && span.kind === 'map') throw new YamlError(`${dotted(path)} is a map; patch its leaves`);
    if (!span.flow && span.kind === 'list') throw new YamlError(`${dotted(path)} is a block list; lists are not patchable`);
    setRaw(doc, span, formatScalar(value));
    return joinRows(doc);
  }

  const rest = path.slice(depth);
  const span = spans.get(pathKey(here));
  if (!isPlainObject(node)) {
    // a bare `key:` is an empty block map waiting for children
    const bare = node === null && span && span.raw === '' && !span.flow;
    if (!bare) throw new YamlError(`${dotted(path)} passes through a ${Array.isArray(node) ? 'list' : 'scalar'} at ${dotted(here)}`);
    if (value === undefined) return text;
    const keyIndent = doc.rows[span.line - 1].t.search(/\S/);
    spliceRows(doc, span.line, emitLines(nest(rest, value), keyIndent + step, step));
    return joinRows(doc);
  }
  if (value === undefined) return text;
  const sub = nest(rest, value);
  if (span.flow) {
    if (rest.length - 1 > 1 - span.depth) throw new YamlError(`cannot create ${rest.length - 1} levels inside the flow map at ${dotted(here)} (one is the limit)`);
    const entry = `${formatKey(rest[0])}: ${formatScalar(sub[rest[0]])}`;
    const row = doc.rows[span.line - 1];
    if (!span.entries.length) row.t = `${row.t.slice(0, span.open)}{ ${entry} }${row.t.slice(span.close + 1)}`;
    else { const at = span.entries.at(-1).end; row.t = `${row.t.slice(0, at)}, ${entry}${row.t.slice(at)}`; }
    return joinRows(doc);
  }
  spliceRows(doc, span.lastLine, emitLines(sub, span.childIndent, step));
  return joinRows(doc);
}

// changes: { [dottedPath]: value } or Map<path, value>. A scalar replaces the
// raw text on its own line; a missing leaf is inserted under its nearest
// existing ancestor (intermediate maps created); `undefined` removes the
// leaf's line; an object value patches each of its leaves. Every line no
// change touches is byte-identical. Changes apply in order (a later change
// to the same path wins). Throws YamlError when `text` does not parse, a
// change passes through a scalar or a list, a path names `__proto__`, or the
// result would not parse — the output is re-read before it is returned, so a
// corrupt file is never handed back.
export function patchYaml(text, changes) {
  const step = parseYaml(text).spans.get('').step;
  const list = [];
  const entries = changes instanceof Map ? [...changes.entries()] : Object.entries(changes ?? {});
  for (const [p, v] of entries) {
    const path = toPath(p);
    if (!path.length || (path.length === 1 && path[0] === '')) throw new YamlError('a change needs a path');
    flattenInto(list, path, v);
  }
  for (const [path] of list) if (path.includes('__proto__')) throw new YamlError('"__proto__" is not a legal key');
  const under = (p, parent) => p.length >= parent.length && parent.every((k, i) => p[i] === k);
  let out = text;
  for (let i = 0; i < list.length; i++) {
    const [path, v] = list[i];
    const parent = path.slice(0, -1);
    const bareOk = v === undefined && parent.length > 0
      && list.slice(i + 1).some(([p2, v2]) => v2 !== undefined && under(p2, parent));
    out = applyOne(out, path, v, step, bareOk);
  }
  parseYaml(out);
  return out;
}
