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

// THE SITTING — every outstanding visual and audio judgement in this project
// on ONE page (ROADMAP THE ORDER #1b, "the re-asks the sitting created").
//
// WHY IT EXISTS. The queue was five LOOKs and five voices deep not because
// any one of them is hard, but because each was a paragraph in a different
// file, each needed a different tool re-run to see, and each needed the
// reader to remember why it was open. Five separate askings is why nothing
// was answered. This makes it one page, ordered by WHAT EACH VERDICT FREES
// rather than by tier number, with the question stated in one sentence and
// the consequence of either answer written down beside it.
//
// THE QUEUE IS EMPTY AS OF 2026-08-18. Eleven questions were answered that
// day across two sittings and everything they opened has been built and
// deployed. `ITEMS` is empty on purpose; `CLOSED_LAST_SITTING` holds the
// record of what was decided. Refill `ITEMS` when there is something real to
// ask.
//
// Two rules the page has earned, worth keeping when it is refilled:
//
//  1. Refill to a full page and ask once. One-at-a-time asking produced one
//     verdict in a fortnight; the page produced eleven in two sittings.
//  2. Never leave an answered question on it. Re-asking something already
//     answered is how a queue stops being trusted.
//
// WRITE IT PLAINLY. Joe asked for this directly on 2026-08-18, about this
// page: state the question, then the consequences. No build-up, no capitals
// for emphasis, no bold for drama. Say what failed and what is unknown —
// flatly.
//
//   node tools/drive.mjs tools/steps/<step>.mjs   # render the frames first
//   node tools/verdict-sheet.mjs                  # then build the page
//
// SINGLE FILE, ON PURPOSE. Frames are downscaled and embedded as JPEG data
// URIs, so `shots/verdicts.html` opens from the filesystem with no server and
// survives being copied to a phone. The PAGE is gitignored and the GENERATOR
// is committed, which is the deliberate half of that trade: a committed page
// carrying embedded frames is a page that goes stale silently the first time
// anybody touches the venue, and this project's most expensive failure mode
// is a green check over a stale thing.
//
// A MISSING FRAME IS RENDERED AS A MISSING FRAME. An absent PNG becomes a
// loud red cell naming the command that would produce it — never a quietly
// shorter grid, which reads exactly like a complete one. Same reason a pair
// whose two files are BYTE-IDENTICAL is labelled as such: an A/B where A and
// B are the same picture is the strongest possible finding and the easiest
// one to mistake for a passing look.

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Browser } from '../tests/e2e/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'shots');
const OUT_DIR = join(ROOT, 'tools', 'out');
const PAGE = join(SHOTS, 'verdicts.html');

// Frames are shown at ~760 px in a 1600 px window; 1100 px of source keeps
// them crisp on a retina laptop and still fits the whole sitting under ~6 MB.
const MAX_W = 1100;
const QUALITY = 0.82;

// THE APP'S LEFT CHROME, CROPPED OFF THE SCENE FRAMES — and only off those.
// glade-look, life-look and verdict-shots all photograph the whole page at
// 1500 CSS px, where `#left-panel` is 316 px wide (measured 2026-08-16
// against the running app, not guessed): 21.1% of every frame is a panel that
// is IDENTICAL in both halves of every pair, and it is the 21% nearest the
// eye. Cropping it doubles the effective size of the thing being judged.
//
// It is a per-FILE rule rather than a per-group one because it is a fact
// about how the frame was taken. The record frames (`rec-*`) and the framing
// frames (`v-crop-*`) are deliberately NOT in it: for C25 the chrome IS the
// subject, and for C27 "does it still read as a table" is a question about
// the whole window.
//
// `flare-*-resting` is in it (same rig, same 1500 px, same panel) and
// `flare-*-foot` is NOT: those are already clipped to the stump by the step,
// so taking another 21% off their left would slice the thing being judged.
//
// THE FRACTION IS NOT ONE NUMBER, because the panel is not a fraction — it is
// a FIXED 316 px column, measured at both rigs against the running app (1500
// px on 2026-08-16, and 780 px on 2026-08-18 when the C30 frames arrived). So
// the same panel is 21% of a scene frame and **41% of a grip frame**, and
// carrying 21% across to the smaller rig would have left a strip of dead
// chrome in the pair whose whole question is where six dice ended up. The rule
// stores the rig width and divides.
const PANEL_CSS = 316;
const RIG = [
  [/^(glade-|life-|v-stump-)/, 1500],
  [/^flare-.*-resting\.png$/, 1500],
  [/^grip-/, 780],           // the harness's default window; these have no .png suffix
];
const cropFor = (file) => {
  const hit = RIG.find(([re]) => re.test(file));
  return hit ? PANEL_CSS / hit[1] : 0;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// The data: measured numbers from the steps that took the frames
// ---------------------------------------------------------------------------

let DATA = {};
try { DATA = JSON.parse(readFileSync(join(SHOTS, 'verdict-data.json'), 'utf8')); } catch { /* absent */ }
const cropRow = (view, pool) => (DATA.crop || []).find((r) => r.view === view && r.pool === pool);
const benchRow = (id) => (DATA.bench || []).find((r) => r.id === id);

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch { return 'unknown'; }
}

// THE FRESHNESS CLAIM IS EARNED, NOT PRINTED — added 2026-08-17 after this
// page shipped one that was asserted. The stamp read "every frame rendered
// fresh from this tree" as a hardcoded string, and the day it mattered it was
// false: the 48 frames had been rendered at 660d48d and `js/main.js` had moved
// 259 lines by cd4233b. A page whose whole purpose is to stop a stale look is
// the last place a decorative claim belongs.
//
// The check: no frame may be OLDER than the newest source file that can change
// what a frame shows. Those files are the app the frames photograph plus the
// steps that frame them — a step's own crop or viewport change restages a
// picture as surely as an edit to the venue does.
//
// THE BAR IS A COMMIT DATE, NOT AN MTIME, and the first draft of this guard
// got that wrong in a way worth keeping written down. Source mtimes look like
// the obvious signal and they lie in both directions: `git checkout 9f1e592 --
// js/fae-lab.js && … && git checkout HEAD -- js/fae-lab.js` — the exact dance
// item 1's BEFORE frames require — restores byte-identical content with a NEW
// mtime, which reddens all 48 frames for nothing; and a frame COPIED in from
// another worktree arrives with today's mtime and passes. So the bar is the
// last COMMIT that touched code able to restage the picture, plus any
// UNCOMMITTED edit to those same files (a working-tree change is real and has
// no commit to date it).
//
// It still cannot catch a frame carried in from a different tree — nothing
// short of the steps writing their own provenance can. What it does catch is
// the case that actually shipped: the code moved, the frames did not.
// THE BAR IS PER ROW, not one bar for the whole page — and that is the
// difference between a guard and a guard nobody keeps. `tools/steps/` holds
// forty steps that have nothing to do with this page; one new probe step
// committed by somebody else would have marked all 48 frames stale, and a
// warning that fires on unrelated work is a warning that gets switched off.
// So each row's bar is the newest of (the app the frames photograph) and
// (only the steps its OWN regen command names).
//
// `models` JOINED THIS LIST 2026-08-18, and it is not housekeeping. Item 1 is
// a LOOK at a baked GLB: for a tower round the model IS the code the frame
// shows, and without it a re-bake could land while the frames stayed put and
// the page would still print "every frame is newer than every source that
// could restage it". The BEFORE leg's `git checkout 48bd128 -- models/towers/`
// dance is safe under this for the same reason the fae-lab one is — the file
// is restored, so it is clean again and has no uncommitted mtime to trip on.
const APP_PATHS = ['js', 'vendor', 'models', 'index.html', 'lab.html'];

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT }).toString(); } catch { return ''; }
};

const lastCommitTouching = (paths) => {
  const out = git(['log', '-1', '--format=%ct%x09%h', '--', ...paths]).trim();
  if (!out) return { ms: 0, file: '(no commit)' };
  const [ct, sha] = out.split('\t');
  return { ms: Number(ct) * 1000, file: `commit ${sha}` };
};

const newestUncommitted = (paths) => {
  let newest = { ms: 0, file: '(none)' };
  for (const line of git(['status', '--porcelain', '--', ...paths]).split('\n')) {
    const rel = line.slice(3).trim();
    if (!rel || !existsSync(join(ROOT, rel))) continue;
    const ms = statSync(join(ROOT, rel)).mtimeMs;
    if (ms > newest.ms) newest = { ms, file: `${rel} (uncommitted)` };
  }
  return newest;
};

const barFor = (paths) => {
  if (!paths.length) return { ms: 0, file: '(none)' };
  const c = lastCommitTouching(paths);
  const d = newestUncommitted(paths);
  return d.ms > c.ms ? d : c;
};

const appWatermark = () => barFor(APP_PATHS);
// The regen command IS the provenance record: it names the step that took the
// frame. Nothing else has to be kept in sync.
const stepsWatermark = (regen) => barFor(
  [...new Set([...String(regen || '').matchAll(/tools\/steps\/[\w.-]+\.mjs/g)].map((m) => m[0]))]);

// file → the source file that outdates it. Filled in the tail, before any HTML
// is built, because the stamp line in the header is evaluated before the items.
const STALE = new Map();

// WHAT THE LAST SITTING CLOSED — rendered at the top of the page, above the
// queue, because "here is what your hour bought" is half of what this page is
// for. Eight items went in on 2026-08-18, all eight came back, and everything
// they opened has since been built and deployed (`/health` reports the same
// sha this page stamps). A queue that visibly shrinks is a queue worth sitting
// again; a queue that is always eight deep teaches the opposite.
const CLOSED_LAST_SITTING = {
  when: '2026-08-18',
  headline: 'Eleven items answered on 2026-08-18, in two sittings. Everything they opened has been '
    + 'built and deployed. Nothing below is being re-asked.',
  groups: [
    { label: 'Answered in the second sitting', tone: 'good', rows: [
      ['The Hollow Bole’s base', 'Approved. The shape is settled. The pale band at the foot is still '
        + 'there and is not settled — the next step on it is the paint bisect, a diagnostic bake, not '
        + 'another guess.'],
      ['C30, the piling', '“Pilling is OK. If you throw a lot of dice, it’s your fault if they pile '
        + 'up. Let’s not try to prevent it.” The tuning ships. Gate d stops being a blocker and '
        + 'becomes a reported number.'],
      ['The two fae ground impacts', 'Approved. The audio queue is now closed except for one unheard '
        + 'row (IMPACT_VOICES.chime, three grounded-table sets).'],
    ] },
    { label: 'Approved — closed, and not re-asked here', tone: 'good', rows: [
      ['W7 ② the staging of the glade', '“Focus is the dice. This looks perfectly fine.”'],
      ['W5 the living layer', 'the fireflies, the wisps and the moot procession; the governor’s curves are final'],
      ['W4 the Moonmoot Witchlight set art', 'staged by both fae venues at roll creation'],
      ['C25 Stage 2’s location', 'the build’s arithmetic refusal stands — the record lives in the log’s head'],
    ] },
    { label: 'Decided — and the build has shipped since', tone: 'good', rows: [
      ['C27 the cropped felt', '“turn preferDice on” — shipped; the camera now frames the dice'],
      ['9c the standard dice edge', '“round .090” — the soft candidate, not the ceiling; shipped'],
    ] },
    { label: 'Heard — the audio queue is closed', tone: 'good', rows: [
      ['Eight of ten voices approved', '“All other audio sounds good” — three room beds and all five '
        + 'tower clunks, frozen in tests/voices.test.mjs as APPROVED_2026_08_18 with equality '
        + 'assertions, the first sign-off this palette has ever had'],
      ['One design killed', 'the ringing die in the two fae venues — deleted, not re-tuned a third '
        + 'time. Re-listened and approved the same day.'],
      ['One row still unheard', 'IMPACT_VOICES.chime survives for three grounded-table sets (seaglass, '
        + 'sealed resin, focuscrystal) carrying a re-voice commissioned by the caller that was just '
        + 'deleted. Small, not a blocker, and deliberately NOT padded onto this page'],
    ] },
    { label: 'Was not yet, now answered', tone: 'good', rows: [
      ['The round-6 grounded stump', '“It’s still a set piece in my eyes… nothing to make it feel '
        + 'rooted.” Round 7 found the cause was not on the model at all (its contact shadow had been '
        + 'UNDER the glade floor since the venue shipped) and round 10 re-baked the flare. That re-bake was approved in the second sitting'],
    ] },
  ],
};

// ---------------------------------------------------------------------------
// THE ITEMS, in the order of what each verdict FREES
// ---------------------------------------------------------------------------

const REGEN_FLARE = 'node tools/drive.mjs tools/steps/flare-look.mjs';
const REGEN_FLARE_BEFORE = 'git checkout 48bd128 -- models/towers/ && '
  + 'node tools/drive.mjs tools/steps/flare-look.mjs tag=before && git checkout HEAD -- models/towers/';
const REGEN_GRIP = 'node tools/drive.mjs tools/steps/grip-look.mjs 1000';

const ITEMS = [
  // Empty on purpose. The three questions this page carried on 2026-08-18 were
  // all answered that day (see CLOSED_LAST_SITTING above), and an answered
  // question left on the page is how a queue stops being trusted. Refill it
  // when there is something real to ask, and refill it to a full page rather
  // than one item at a time: eleven answers in two sittings came after a
  // fortnight of one-at-a-time asking had produced one.
  //
  // An item is: { n, id, kind, title, where, unblocks, question, stakes,
  // notes, groups } — or { listen: true } for a listening pass. Git history
  // has three worked examples; `git log -p tools/verdict-sheet.mjs` finds them.
  //
  // Write them plainly. State the question, then the consequences. No
  // build-up, no capitals for emphasis, no bolding for drama.
];

// THE LISTENING SCRIPT IS NOT AUTHORED HERE — it is docs/AUDIO.md §9.1's C
// route, and this is a transcription of it. It used to be eleven rows over
// three sections; ten of those voices were heard on 2026-08-18 and eight were
// approved and frozen, so what is left is the C rows and the reference they
// are judged against. The ORDER is still the load-bearing part: exactly one
// thing changes between consecutive rows, which is what makes this two clicks
// instead of an errand.
//
// The reference row is NOT padding and is not a question. A landing has no
// absolute right answer — "is this a normal sound" is a comparison — so the
// grounded table is played first to give the ear the thing the other two rows
// are supposed to resemble.
const VOICE_SECTIONS = [
  {
    id: 'C',
    title: 'The same die, three floors — in this order, without stopping',
    blurb: 'One pool, rolled three times, changing only the room between rolls. Tap a die row eight '
      + 'times and hit Roll; a pour is what the complaint was about, not a single strike. Judge the '
      + 'LANDING and the settle tail right after it — five taps inside about 145 ms is where a floor '
      + 'either sounds soft or sounds broken.',
    after: 'The question is only whether rows 2 and 3 now sound like ordinary dice landing on '
      + 'something. If they do, this closes. If they still ring, say so — but the lever is no longer '
      + 'the die’s voice (it has none now), it is the two venues’ ground trims, and setting them to 1 '
      + 'makes a fae landing byte-identical to row 1.',
    rows: [
      { id: 'C0', voice: 'The Table — the reference', dial: 'ground ×1 / ×1 / ×1',
        clicks: 'Staging → <b>The Table</b> → <i>(a die row ×8)</i> → <b>Roll</b>',
        listen: 'the ordinary knock, 468 Hz, nothing above the wood/metal line. This is the sound '
          + 'the other two rows are being asked to resemble — play it first so the ear has it.' },
      { id: 'C2', voice: 'Moonrise Glade — the ground you rejected', dial: 'ground ×0.72 / ×0.85 / ×0.90',
        clicks: '<b>Moonrise Glade</b> → <i>(a die row ×8)</i> → <b>Roll</b>',
        flag: 'this is the one you called horrible',
        listen: 'the same body as row 1, about a third of an octave darker and slightly shorter: '
          + '346 Hz, 2% above the boundary, no ring. What should be GONE is the long cold sine that '
          + 'used to arrive with every die and stack forty deep in a pour.' },
      { id: 'C3', voice: 'Foxfire Hollow — the same again, deader', dial: 'ground ×0.66 / ×0.78 / ×0.85',
        clicks: '<b>Foxfire Hollow</b> → <i>(a die row ×8)</i> → <b>Roll</b>',
        listen: 'the same change in the wetter room — 320 Hz. If C2 and C3 are indistinguishable to '
          + 'you, say so: the two rows should then collapse into one.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Frame loading: resolve, hash, downscale in a headless Chrome
// ---------------------------------------------------------------------------

function resolve(file) {
  for (const dir of [SHOTS, OUT_DIR]) {
    const p = join(dir, file);
    if (existsSync(p)) return p;
  }
  return null;
}

async function loadFrames(files) {
  const found = new Map();
  for (const f of files) {
    const p = resolve(f);
    if (p) found.set(f, { path: p, sha: createHash('sha1').update(readFileSync(p)).digest('hex'),
      bytes: statSync(p).size, mtime: statSync(p).mtimeMs });
  }
  if (!found.size) return found;

  // A TWO-ROUTE SERVER on an ephemeral port, and it exists to dodge a real
  // constraint rather than for tidiness: a file:// page cannot read a file://
  // image back off a canvas (tainted origin, and this Chrome is not launched
  // with --allow-file-access-from-files), and pushing a 3 MB PNG through a
  // Runtime.evaluate expression is a 4 MB string per frame. So the HOST PAGE
  // is served too, not just the images — an about:blank document has an opaque
  // origin, and an image it pulls over http is cross-origin, which taints the
  // canvas the moment toDataURL is called. Same origin, no taint.
  // Ephemeral port, bound to loopback — it can never be 8123.
  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><meta charset="utf-8"><title>downscale</title><body></body>');
      return;
    }
    const hit = found.get(decodeURIComponent(url.replace(/^\/img\//, '')));
    if (!hit) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(readFileSync(hit.path));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await new Browser().launch();
  try {
    const page = await browser.newPage();
    await page.navigate(`http://127.0.0.1:${port}/`);
    const deadline = Date.now() + 15000;
    for (;;) {
      const ok = await page.eval('document.readyState === "complete" && location.port').catch(() => null);
      if (ok) break;
      if (Date.now() > deadline) throw new Error('downscaler page never loaded');
      await new Promise((r) => setTimeout(r, 100));
    }
    let n = 0;
    for (const [file, rec] of found) {
      const uri = await page.eval(`(async () => {
        const img = new Image();
        img.src = ${JSON.stringify(`/img/${encodeURIComponent(file)}`)};
        await img.decode();
        const sx = Math.round(img.naturalWidth * ${cropFor(file)});
        const sw = img.naturalWidth - sx;
        const w = Math.min(${MAX_W}, sw);
        const h = Math.round(img.naturalHeight * w / sw);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, w, h);
        return JSON.stringify({ uri: c.toDataURL('image/jpeg', ${QUALITY}),
          w: img.naturalWidth, h: img.naturalHeight, cropped: sx > 0 });
      })()`);
      const got = JSON.parse(uri);
      rec.uri = got.uri;
      rec.w = got.w;
      rec.h = got.h;
      rec.cropped = got.cropped;
      n++;
      if (n % 8 === 0) console.log(`  … ${n}/${found.size} frames embedded`);
    }
    await page.close();
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  return found;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function frameCell(f, frames, item) {
  const rec = frames.get(f.file);
  const bench = f.bench ? benchRow(f.bench) : null;
  const extra = bench ? `<div class="meta">${esc(`${bench.verts} verts · bounding r ${bench.r}`)}</div>` : '';
  if (!rec || !rec.uri) {
    return `<figure class="cell missing">
      <div class="miss">FRAME MISSING<br><span>${esc(f.file)}</span></div>
      <figcaption>${esc(f.cap)}</figcaption>
    </figure>`;
  }
  return `<figure class="cell">
    <a href="${rec.uri}" target="_blank" rel="noopener"><img src="${rec.uri}" alt="${esc(f.cap)}"></a>
    <figcaption>${esc(f.cap)}${extra}
      <div class="meta">${esc(basename(rec.path))} · ${rec.w}×${rec.h}${rec.cropped ? ' · left chrome cropped' : ''} · ${(rec.bytes / 1024).toFixed(0)} KB</div>
    </figcaption>
  </figure>`;
}

function groupHtml(g, frames, item) {
  const cells = g.frames.map((f) => frameCell(f, frames, item)).join('\n');
  const present = g.frames.map((f) => frames.get(f.file)).filter(Boolean);
  const gone = g.frames.filter((f) => !frames.has(f.file));

  let flag = '';
  // AN A/B WHOSE TWO SIDES ARE THE SAME PICTURE is the finding, not a pass.
  if (g.pair && present.length === 2 && present[0].sha === present[1].sha) {
    flag = '<p class="flag same">These two frames are BYTE-IDENTICAL. Whatever this row is '
      + 'comparing did not change the picture at all — that is the finding, not a rendering fault. '
      + '(On a before/after or a palette pair it would be the opposite kind of finding, which is '
      + 'why this says what it measured rather than what it means.)</p>';
  }
  if (gone.length) {
    flag += `<p class="flag gone">${gone.length} frame${gone.length > 1 ? 's are' : ' is'} missing. `
      + `Regenerate with <code>${esc(g.regen || '')}</code></p>`;
  }
  // A frame older than the code it photographs is judged on the wrong picture,
  // and it looks exactly like a good one. Same red as a missing frame, because
  // it costs the same: a verdict that has to be asked again.
  const stale = g.frames.filter((f) => STALE.has(f.file));
  if (stale.length) {
    flag += `<p class="flag gone">${stale.length} frame${stale.length > 1 ? 's PREDATE' : ' PREDATES'} `
      + `the code ${stale.length > 1 ? 'they show' : 'it shows'} — `
      + `<code>${esc(STALE.get(stale[0].file))}</code> is newer. `
      + `Re-render with <code>${esc(g.regen || '')}</code> before judging this row.</p>`;
  }
  // C27's rows carry their own measured numbers.
  if (g.span) {
    const [view, pool] = g.span.split('-');
    const r = cropRow(view, pool);
    if (r) {
      // `measured`, NOT `num` — `.num` is the item's gold number circle
      // (flex 46px, display:grid, place-items:center) and putting that class
      // on a paragraph squeezed this line into a 46px centred column. Caught
      // by opening the page, which is the only way it could have been.
      flag += `<p class="flag measured">Measured this run: die span <b>${r.offSpan} px</b> (${esc(r.offMode)}) `
        + `→ <b>${r.onSpan} px</b> (${esc(r.onMode)}) · on screen ${esc(r.offOn)} → ${esc(r.onOn)}</p>`;
    }
  }
  return `<div class="group">
    <h4>${esc(g.label)}</h4>
    ${flag}
    <div class="grid cols-${g.cols}${g.fit ? ` fit-${g.fit}` : ''}">${cells}</div>
  </div>`;
}

function listenHtml() {
  const sections = VOICE_SECTIONS.map((s) => {
    const rows = s.rows.map((v) => `
      <li class="voice">
        <label class="tick"><input type="checkbox" data-heard="${esc(v.id)}"><span></span></label>
        <div class="vbody">
          <h4><span class="vn">${esc(v.id)}</span> ${esc(v.voice)}
            <span class="vwhere">${esc(v.dial)}</span>
            ${v.flag ? `<span class="vflag">${esc(v.flag)}</span>` : ''}</h4>
          <p class="clicks"><b>Two clicks:</b> ${v.clicks}</p>
          <p class="reasoned"><b>Listen for:</b> ${v.listen}</p>
          <input class="vnote" data-note="${esc(v.id)}"
            placeholder="right / wrong, and which way — heavier, longer, duller, less shaft…">
        </div>
      </li>`).join('\n');
    return `<div class="vsec">
      <h4 class="vsec-h">${esc(s.title)}</h4>
      <p class="vsec-b">${esc(s.blurb)}</p>
      <ul class="voices">${rows}</ul>
      <p class="vsec-a">${esc(s.after)}</p>
    </div>`;
  }).join('\n');
  return `
    <div class="setup">
      <h4>The preamble, once — two things, and the first one is not optional</h4>
      <ol>
        <li><b>Open the table on <code>?stability=beta</code></b> — the deployed one,
          <code>https://dice-5wi5rwk2oa-uc.a.run.app/?stability=beta</code>, which is running this
          exact tree, or your own preview at <code>http://localhost:8123/?stability=beta</code>.
          Venue is a closed-beta row and the picker is simply ABSENT without the param. It is
          stripped from the address bar and the enrolment persists in that browser.</li>
        <li><code>⚙</code> → <b>Staging</b>, and leave the panel open — it is where the three rooms
          are, and it covers nothing that makes a sound. <b>Leave Room tone OFF.</b> The beds are
          already approved and frozen; with them up you would be judging a landing through a room
          bed, and the cleanest read of a knock is a silent room.</li>
      </ol>
      <p><b>A roll is two clicks:</b> a row in the left column, then <b>Roll</b>. Tap the row eight
        times first — <b>this complaint was about a pour, not a strike</b>, and the defect it names
        only exists at forty dice, so one die is the wrong test. <code>/</code> → <code>8d6</code> →
        Enter is faster and is the only keyboard in this script.</p>
    </div>
    ${sections}
    <div class="disc">
      <b>Why this is three rows and not eleven.</b> The listening page you sat on 2026-08-18 ran
      eleven rows over three sections. Ten voices were heard, <b>eight are approved</b> and frozen in
      <code>tests/voices.test.mjs</code> with equality assertions, and one design was killed — this
      is what remains of that list. The C rows are three in AUDIO.md and were only ever ONE rendered
      sound (the Witchlight set is venue-only and the venue’s ground rides every contact), which is
      also why “the chime is fine but the ground is not” was never a distinction the app could make.
    </div>`;
}

// WHAT YOUR LAST HOUR BOUGHT, rendered above the queue. It is deliberately NOT
// a collapsed footnote: the page's own argument for sitting again is that the
// queue shrank from eight to three, and an argument nobody can see is not an
// argument. Every row here is CLOSED — there is no verdict control on any of
// them, because a control invites an answer and this section is a receipt.
function closedHtml() {
  const groups = CLOSED_LAST_SITTING.groups.map((g) => `
    <div class="cgroup ${esc(g.tone)}">
      <h4>${esc(g.label)}</h4>
      <ul>${g.rows.map(([what, why]) =>
    `<li><b>${esc(what)}</b>${why ? ` — ${esc(why)}` : ''}</li>`).join('')}</ul>
    </div>`).join('\n');
  return `
  <section class="closed">
    <h3>Closed by the sitting of ${esc(CLOSED_LAST_SITTING.when)} — nothing below is being re-asked</h3>
    <p class="chead">${esc(CLOSED_LAST_SITTING.headline)}</p>
    <div class="cgrid">${groups}</div>
  </section>`;
}

function itemHtml(item, frames) {
  const stakeRows = Object.entries(item.stakes).map(([k, v]) =>
    `<li><b>${k === 'approve' ? 'Approve' : (k === 'decline' ? 'Decline' : 'Overrule')} →</b> ${esc(v)}</li>`).join('');
  const notes = (item.notes || []).map((nt) =>
    `<p class="note ${esc(nt.kind)}">${esc(nt.text)}</p>`).join('\n');
  const body = item.listen
    ? listenHtml()
    : (item.groups || []).map((g) => groupHtml(g, frames, item)).join('\n');
  return `
  <section class="item" id="item-${esc(item.id)}">
    <header>
      <div class="num">${item.n}</div>
      <div class="head">
        <div class="kind ${esc(item.kind.toLowerCase())}">${esc(item.kind)}</div>
        <h2>${esc(item.title)}</h2>
        <p class="where">${esc(item.where)}</p>
      </div>
    </header>
    <p class="unblocks"><b>Why here:</b> ${esc(item.unblocks)}</p>
    <p class="question">${esc(item.question)}</p>
    <ul class="stakes">${stakeRows}</ul>
    ${notes}
    ${body}
    <div class="verdict" data-item="${esc(item.id)}">
      <span class="vlabel">Verdict</span>
      ${(item.choices || ['approve', 'overrule', 'not yet']).map((c) =>
    `<label><input type="radio" name="v-${esc(item.id)}" value="${esc(c)}"> ${esc(c)}</label>`).join('')}
      <input class="vtext" data-note="${esc(item.id)}" placeholder="in your words — what changes, or why it stands">
    </div>
  </section>`;
}

function pageHtml(frames, stats) {
  const nav = ITEMS.map((i) =>
    `<a href="#item-${esc(i.id)}"><b>${i.n}</b> ${esc(i.title.split(' — ')[0])}</a>`).join('');
  return `<!DOCTYPE html>
<!-- generated by tools/verdict-sheet.mjs — regenerate, never edit -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The sitting</title>
<style>
  :root { --bg:#0e1013; --card:#161a1f; --line:rgba(255,255,255,0.10); --ink:#e9e3d4;
    --dim:#98a0a8; --gold:#cdbe8a; --red:#e2705a; --green:#8fce9b; }
  * { box-sizing: border-box; }
  body { margin:0; padding:0 0 120px; background:var(--bg); color:var(--ink);
    font: 15px/1.6 system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 1680px; margin: 0 auto; padding: 0 26px; }
  header.top { padding: 34px 0 18px; border-bottom: 1px solid var(--line); }
  h1 { font: 700 27px/1.25 Georgia, serif; margin: 0 0 8px; color: var(--gold); }
  .sub { color: var(--dim); max-width: 74ch; margin: 0 0 14px; }
  .stampline { font: 12px ui-monospace, monospace; color: var(--dim); }
  nav { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 6px; }
  nav a { display:block; padding:6px 11px; border:1px solid var(--line); border-radius:999px;
    color:var(--ink); text-decoration:none; font-size:13px; background:rgba(255,255,255,0.03); }
  nav a:hover { border-color: var(--gold); color: var(--gold); }
  nav a b { color: var(--gold); margin-right:5px; }
  section.item { margin: 44px 0 0; padding: 24px 24px 18px; background: var(--card);
    border: 1px solid var(--line); border-radius: 14px; scroll-margin-top: 14px; }
  section.item > header { display:flex; gap:16px; align-items:flex-start; }
  .num { flex:0 0 46px; height:46px; border-radius:50%; display:grid; place-items:center;
    background:var(--gold); color:#14110b; font:700 21px Georgia, serif; }
  .head h2 { font: 700 21px/1.3 Georgia, serif; margin: 3px 0 2px; }
  .kind { display:inline-block; font:600 10px/1 system-ui; letter-spacing:.14em;
    padding:4px 7px; border-radius:4px; background:rgba(205,190,138,0.16); color:var(--gold); }
  .kind.listen { background:rgba(143,206,155,0.16); color:var(--green); }
  .where { color:var(--dim); font-size:12.5px; margin:2px 0 0; font-family: ui-monospace, monospace; }
  .unblocks { color:var(--dim); margin:14px 0 0; max-width:100ch; }
  .unblocks b { color:var(--ink); }
  .question { font: 600 19px/1.5 Georgia, serif; color:#fff; margin:14px 0 12px;
    padding:12px 16px; border-left:3px solid var(--gold); background:rgba(205,190,138,0.06);
    border-radius:0 8px 8px 0; max-width:104ch; }
  ul.stakes { margin:0 0 6px; padding-left:20px; color:var(--dim); max-width:104ch; }
  ul.stakes b { color:var(--ink); }
  .note { color:var(--dim); max-width:104ch; font-size:14px; margin:10px 0 0; }
  .note.reservation, .note.finding { border-left:3px solid var(--red); padding:10px 14px;
    background:rgba(226,112,90,0.07); border-radius:0 8px 8px 0; color:#e7cfc6; }
  .group { margin-top:22px; }
  .group h4 { font:600 13px/1.4 system-ui; letter-spacing:.05em; text-transform:uppercase;
    color:var(--gold); margin:0 0 9px; }
  .grid { display:grid; gap:14px; }
  .cols-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .cols-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  @media (max-width: 900px) { .cols-2, .cols-3 { grid-template-columns: 1fr; } }
  figure.cell { margin:0; background:#000; border:1px solid var(--line); border-radius:9px;
    overflow:hidden; }
  figure.cell img { width:100%; height:auto; display:block; }
  /* A PORTRAIT PHONE BESIDE A LANDSCAPE DESKTOP is the C25 pair, and at
     width:100% the phone renders two and a half times taller than the thing it
     is being compared with — the same object at two different apparent sizes,
     which is the one thing a side-by-side must not do. fit-h equalises on
     HEIGHT instead. fit-n leaves a small magnified crop at its own size rather
     than upscaling a 5× crop another 2.7×. */
  .fit-h figure.cell img { height:600px; width:auto; max-width:100%; margin:0 auto; }
  .fit-n figure.cell img { width:auto; max-width:100%; margin:0 auto; }
  .fit-h figure.cell, .fit-n figure.cell { display:flex; flex-direction:column;
    justify-content:flex-start; }
  figcaption { padding:8px 11px 10px; font-size:13px; background:rgba(255,255,255,0.03); }
  .meta { font:11px ui-monospace, monospace; color:var(--dim); margin-top:3px; word-break:break-all; }
  figure.missing { background:rgba(226,112,90,0.10); border-color:var(--red); }
  .miss { aspect-ratio:16/10; display:grid; place-items:center; text-align:center;
    color:var(--red); font:700 15px system-ui; letter-spacing:.08em; }
  .miss span { font:12px ui-monospace, monospace; letter-spacing:0; }
  .flag { font-size:13.5px; margin:0 0 9px; padding:9px 13px; border-radius:8px; }
  .flag.same { background:rgba(226,112,90,0.12); color:#f0c6bb; border:1px solid rgba(226,112,90,0.4); }
  .flag.gone { background:rgba(226,112,90,0.12); color:#f0c6bb; }
  .flag.measured { background:rgba(255,255,255,0.05); color:var(--dim);
    font-family:ui-monospace, monospace; }
  .flag.measured b { color:var(--ink); }
  code { font:12.5px ui-monospace, monospace; background:rgba(255,255,255,0.07);
    padding:1px 5px; border-radius:4px; }
  .verdict { margin-top:20px; padding:12px 14px; border:1px dashed var(--line); border-radius:10px;
    display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  .vlabel { font:600 11px system-ui; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); }
  .verdict label { font-size:14px; color:var(--dim); display:flex; gap:5px; align-items:center; }
  .vtext, .vnote { flex:1 1 320px; min-width:220px; background:rgba(0,0,0,0.35); color:var(--ink);
    border:1px solid var(--line); border-radius:7px; padding:7px 10px; font:14px system-ui; }
  ul.voices { list-style:none; padding:0; margin:10px 0 0; }
  li.voice { display:flex; gap:14px; padding:12px 0; border-top:1px solid var(--line); }
  li.voice h4 { margin:0 0 6px; font:700 16px Georgia, serif; }
  .vn { display:inline-block; min-width:30px; font:700 12px ui-monospace, monospace;
    color:#14110b; background:var(--gold); border-radius:4px; padding:2px 6px;
    margin-right:8px; vertical-align:2px; }
  .vwhere { font:11px ui-monospace, monospace; color:var(--dim); margin-left:10px;
    letter-spacing:.04em; }
  .vflag { font:600 10px system-ui; letter-spacing:.1em; text-transform:uppercase;
    color:var(--red); border:1px solid rgba(226,112,90,0.5); border-radius:4px;
    padding:2px 6px; margin-left:10px; vertical-align:2px; }
  .vsec { margin-top:20px; }
  .vsec-h { font:700 15px Georgia, serif; color:var(--gold); margin:0 0 4px; }
  .vsec-b { color:var(--dim); font-size:14px; margin:0; }
  .vsec-a { color:var(--dim); font-size:13.5px; font-style:italic; margin:8px 0 0;
    padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; }
  .clicks { margin:0 0 6px; font-size:14px; }
  .clicks b, .reasoned b { color:var(--ink); }
  .reasoned { margin:0 0 6px; font-size:13.5px; color:var(--dim); }
  .setup p { color:var(--dim); font-size:14px; margin:9px 0 0; }
  .vbody { flex:1; }
  .tick { flex:0 0 26px; }
  .tick input { width:20px; height:20px; accent-color:var(--gold); }
  .setup { background:rgba(255,255,255,0.04); border-radius:10px; padding:12px 18px; margin-top:16px; }
  .setup h4 { color:var(--gold); margin:2px 0 6px; font:600 13px system-ui;
    letter-spacing:.05em; text-transform:uppercase; }
  .setup ol { margin:0; padding-left:20px; color:var(--dim); font-size:14px; }
  .setup b { color:var(--ink); }
  .slot { margin-top:18px; padding:12px 16px; border:1px dashed var(--gold); border-radius:10px; }
  .slot h4 { color:var(--gold); margin:0 0 6px; font:600 13px system-ui;
    letter-spacing:.05em; text-transform:uppercase; }
  .slot p { color:var(--dim); font-size:14px; margin:0 0 9px; }
  .disc { margin-top:16px; font-size:13.5px; color:var(--dim); padding:10px 14px;
    background:rgba(255,255,255,0.04); border-radius:8px; }
  .disc b { color:var(--ink); }
  .bar { position:fixed; left:0; right:0; bottom:0; z-index:9; padding:11px 26px;
    background:rgba(14,16,19,0.94); border-top:1px solid var(--line);
    display:flex; gap:14px; align-items:center; backdrop-filter: blur(8px); }
  .bar button { font:600 14px system-ui; padding:9px 18px; border-radius:9px; cursor:pointer;
    border:1px solid var(--gold); background:var(--gold); color:#14110b; }
  .bar .ghost { background:none; color:var(--gold); }
  .bar span { color:var(--dim); font-size:13px; }
  /* The receipt. Quieter than an item on purpose — no card, no gold number,
     no verdict row — because it is the one block on this page that is not
     asking for anything. */
  section.closed { margin:26px 0 0; padding:18px 20px 14px; border:1px solid var(--line);
    border-radius:14px; background:rgba(143,206,155,0.045); }
  section.closed h3 { font:700 17px/1.3 Georgia, serif; margin:0 0 6px; color:var(--green); }
  .chead { color:var(--dim); margin:0 0 14px; max-width:104ch; font-size:14px; }
  .cgrid { display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); }
  @media (max-width: 900px) { .cgrid { grid-template-columns:1fr; } }
  .cgroup { padding:11px 14px; border-radius:10px; background:rgba(255,255,255,0.03);
    border-left:3px solid rgba(143,206,155,0.55); }
  .cgroup.open { border-left-color:var(--gold); background:rgba(205,190,138,0.06); }
  .cgroup h4 { font:600 11.5px/1.4 system-ui; letter-spacing:.07em; text-transform:uppercase;
    color:var(--green); margin:0 0 7px; }
  .cgroup.open h4 { color:var(--gold); }
  .cgroup ul { margin:0; padding-left:18px; color:var(--dim); font-size:13.5px; }
  .cgroup li { margin:0 0 5px; }
  .cgroup b { color:var(--ink); }
  textarea#dump { position:fixed; left:-9999px; }
</style></head>
<body>
<div class="wrap">
<header class="top">
  <h1>The sitting</h1>
  <p class="sub">${ITEMS.length
    ? `${ITEMS.length} question${ITEMS.length > 1 ? 's' : ''} waiting on you. Each one states the `
      + 'question, shows the frames, and says what happens for each answer. Your answer goes in the '
      + 'last row of the item. The button at the bottom copies all the answers out as text.'
    : 'Nothing is waiting on you. Everything asked so far has been answered, built and deployed. '
      + 'The record below is what those answers decided.'}</p>
  <p class="stampline">generated ${esc(stats.when)} · tree ${esc(stats.sha)} ·
    ${stats.embedded} frames embedded${stats.missing ? ` · <b style="color:#e2705a">${stats.missing} MISSING</b>` : ''} ·
    ${stats.stale
    ? `<b style="color:#e2705a">${stats.stale} of ${stats.embedded} PREDATE the code they show</b> `
      + `— newest source is ${esc(stats.watermark)}; re-render before judging those rows`
    : `every frame is newer than every source that could restage it (newest: ${esc(stats.watermark)})`}</p>
  <nav>${nav}</nav>
</header>
${closedHtml()}
${ITEMS.map((i) => itemHtml(i, frames)).join('\n')}
</div>
<div class="bar">
  <button id="copy">Copy all verdicts</button>
  <button class="ghost" id="clear">Clear</button>
  <span id="status">Answers live in this tab only — copy them out before you close it.</span>
</div>
<textarea id="dump"></textarea>
<script>
(() => {
  const KEY = 'dice.verdicts.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  let state = load();

  const inputs = () => [...document.querySelectorAll('input')];
  for (const el of inputs()) {
    const k = el.type === 'radio' ? el.name + '=' + el.value
      : (el.dataset.note ? 'n:' + el.dataset.note : (el.dataset.heard ? 'h:' + el.dataset.heard : null));
    if (!k) continue;
    if (el.type === 'radio') { if (state[el.name] === el.value) el.checked = true; }
    else if (el.type === 'checkbox') { el.checked = !!state[k]; }
    else if (state[k] != null) el.value = state[k];
    el.addEventListener('change', () => {
      if (el.type === 'radio') state[el.name] = el.value;
      else if (el.type === 'checkbox') state[k] = el.checked;
      else state[k] = el.value;
      save(state);
    });
    el.addEventListener('input', () => {
      if (el.type === 'text' || el.tagName === 'INPUT' && !el.type.match(/radio|checkbox/)) {
        state[k] = el.value; save(state);
      }
    });
  }

  document.getElementById('copy').addEventListener('click', async () => {
    const lines = ['VERDICTS — ' + new Date().toISOString(), ''];
    for (const sec of document.querySelectorAll('section.item')) {
      const id = sec.id.replace('item-', '');
      const title = sec.querySelector('h2').textContent.trim();
      const picked = sec.querySelector('input[type=radio]:checked');
      const note = sec.querySelector('.vtext');
      lines.push(sec.querySelector('.num').textContent + '. ' + title);
      lines.push('   verdict: ' + (picked ? picked.value : '—')
        + (note && note.value ? '  — ' + note.value : ''));
      for (const v of sec.querySelectorAll('li.voice')) {
        const num = v.querySelector('.vn'); const h = v.querySelector('h4');
        const n = v.querySelector('.vnote');
        const heard = v.querySelector('input[type=checkbox]');
        if (!h) continue;
        const name = h.childNodes[1] ? h.childNodes[1].textContent.trim() : h.textContent.trim();
        lines.push('     ' + (num ? num.textContent + ' ' : '· ') + name
          + (heard ? (heard.checked ? ' [heard]' : ' [not heard]') : '')
          + (n && n.value ? ' — ' + n.value : ''));
      }
      lines.push('');
    }
    const text = lines.join('\\n');
    const ta = document.getElementById('dump');
    ta.value = text;
    try { await navigator.clipboard.writeText(text); }
    catch { ta.style.position = 'static'; ta.style.left = '0'; ta.select(); }
    document.getElementById('status').textContent = 'Copied ' + text.split('\\n').length + ' lines.';
  });

  document.getElementById('clear').addEventListener('click', () => {
    state = {}; save(state);
    for (const el of inputs()) {
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = false; else el.value = '';
    }
    document.getElementById('status').textContent = 'Cleared.';
  });
})();
</script>
</body></html>
`;
}

// ---------------------------------------------------------------------------

const wanted = [];
for (const item of ITEMS) for (const g of item.groups || []) for (const f of g.frames) wanted.push(f.file);
const uniq = [...new Set(wanted)];

console.log(`resolving ${uniq.length} frames from shots/ and tools/out/ …`);
const frames = await loadFrames(uniq);
const missing = uniq.filter((f) => !frames.has(f));
const APP = appWatermark();
for (const item of ITEMS) {
  for (const g of item.groups || []) {
    const step = stepsWatermark(g.regen);
    const bar = step.ms > APP.ms ? step : APP;
    for (const f of g.frames) {
      const rec = frames.get(f.file);
      if (rec && rec.mtime < bar.ms) STALE.set(f.file, bar.file);
    }
  }
}
const stale = [...STALE.keys()];
mkdirSync(SHOTS, { recursive: true });
const html = pageHtml(frames, {
  when: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
  sha: gitSha(),
  embedded: frames.size,
  missing: missing.length,
  stale: stale.length,
  watermark: `${APP.file} ${new Date(APP.ms).toISOString().replace('T', ' ').slice(0, 19)}Z`,
});
writeFileSync(PAGE, html);
console.log(`\n${PAGE}`);
console.log(`  ${frames.size} embedded · ${missing.length} missing · ${stale.length} stale · `
  + `${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`);
if (missing.length) {
  console.log('\nMISSING (the page renders each as a loud red cell, not a gap):');
  for (const m of missing) console.log(`  ${m}`);
  process.exitCode = 1;
}
if (stale.length) {
  console.log('\nSTALE — each photographs code that has since moved:');
  for (const s of stale) console.log(`  ${s}  (older than ${STALE.get(s)})`);
  console.log('  Re-render the steps that produce them; the page marks each row in red until you do.');
  process.exitCode = 1;
} else {
  console.log(`  freshness: every frame is newer than ${APP.file}`
    + ` (${new Date(APP.ms).toISOString().slice(0, 19)}Z) and than its own step — earned, not printed`);
}
