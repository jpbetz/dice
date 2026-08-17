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
// on ONE page (ROADMAP THE ORDER #1, "Joe's LOOK and LISTEN queue").
//
// WHY IT EXISTS. The queue was five LOOKs and five voices deep not because
// any one of them is hard, but because each was a paragraph in a different
// file, each needed a different tool re-run to see, and each needed the
// reader to remember why it was open. Five separate askings is why nothing
// was answered. This makes it one page, ordered by WHAT EACH VERDICT FREES
// rather than by tier number, with the question stated in one sentence and
// the consequence of either answer written down beside it.
//
//   node tools/drive.mjs tools/steps/verdict-shots.mjs        # the new frames
//   node tools/drive.mjs --steps tools/steps/glade-look.mjs,\
//     tools/steps/life-look.mjs,tools/steps/record-look.mjs    # the existing ones
//   node tools/verdict-sheet.mjs                              # this page
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
const SCENE_CROP_LEFT = 316 / 1500;
const cropFor = (file) => (/^(glade-|life-|v-stump-)/.test(file) ? SCENE_CROP_LEFT : 0);

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

// ---------------------------------------------------------------------------
// THE ITEMS, in the order of what each verdict FREES
// ---------------------------------------------------------------------------

const REGEN_VERDICT = 'node tools/drive.mjs tools/steps/verdict-shots.mjs';
const REGEN_GLADE = 'node tools/drive.mjs tools/steps/glade-look.mjs';
const REGEN_BEFORE = 'git checkout 9f1e592 -- js/fae-lab.js && '
  + 'node tools/drive.mjs tools/steps/glade-look.mjs tag=before && git checkout HEAD -- js/fae-lab.js';
const REGEN_LIFE = 'node tools/drive.mjs tools/steps/life-look.mjs';
const REGEN_RECORD = 'node tools/drive.mjs tools/steps/record-look.mjs';

const ITEMS = [
  {
    n: 1,
    id: 'w7',
    kind: 'LOOK',
    title: 'W7 ② — the staging of the glade',
    where: 'ROADMAP Tier W · shipped 2026-08-13 (583b569, c67977f, 2698cc5), frame-verified 2026-08-15',
    unblocks: 'It is the ROOM. Three of the four looks below are photographed inside it, and W5’s '
      + 're-ask is explicitly staged on top of this one — so every other fae verdict is provisional '
      + 'until this one lands.',
    question: 'Is the re-staged glade — moot ring forward and much larger on screen, pond back and '
      + 'grown, one foreground wing bottom-left — the room you asked for, or was the arrangement you '
      + 'rejected the better frame?',
    stakes: {
      approve: 'W7 ② closes. With W6 landed on 2026-08-16, Tier W is then built end to end and '
        + 'waiting only on the rest of this page — and T15 (the three classic skins re-baked '
        + 'through the forge, explicitly queued behind this queue) can start.',
      overrule: 'The staging is re-cut, and items 2, 3 and 4 below have to be re-asked afterwards, '
        + 'because all three are photographed in this room.',
    },
    notes: [
      { kind: 'reservation', text: 'A reservation from the agent that took these frames, included so '
        + 'you can confirm or overrule it rather than have it filed as a fact: the AFTER is dimmer '
        + 'overall, most of the new mass reads as dark silhouette, and its only strongly-lit cluster '
        + 'is bottom-left and clipped by the frame edge. That is either "in a scene" or a value '
        + 'problem, and the geometry gates cannot tell which.' },
      { kind: 'plain', text: 'BEFORE is not a memory — it was re-rendered from js/fae-lab.js at '
        + '9f1e592 (the commit immediately before the staging landed) against today’s tree, '
        + 'then the file was restored.' },
    ],
    groups: [
      { label: 'Moonrise Glade · the resting eye', regen: REGEN_BEFORE, cols: 2, pair: true,
        frames: [
          { file: 'glade-before-moonrise-resting.png', cap: 'BEFORE — the formal triptych (9f1e592)' },
          { file: 'glade-moonrise-resting.png', cap: 'AFTER — shipped today' },
        ] },
      { label: 'Foxfire Hollow · the resting eye', regen: REGEN_GLADE, cols: 2, pair: true,
        frames: [
          { file: 'glade-before-foxfire-resting.png', cap: 'BEFORE (9f1e592)' },
          { file: 'glade-foxfire-resting.png', cap: 'AFTER — shipped today' },
        ] },
      { label: 'And with the venue’s own dice on the felt — the frame a player actually gets',
        regen: REGEN_GLADE, cols: 2, pair: true,
        frames: [
          { file: 'glade-before-moonrise-dice.png', cap: 'BEFORE · moonrise, dice settled' },
          { file: 'glade-moonrise-dice.png', cap: 'AFTER · moonrise, dice settled' },
        ] },
    ],
  },

  {
    n: 2,
    id: 'w5',
    kind: 'LOOK',
    title: 'W5 — the living layer',
    where: 'ROADMAP Tier W · "W5’s LOOK read — OPEN, and it was never actually asked"',
    unblocks: 'The last unjudged fae MECHANISM. Nothing else in the tier waits on it, but Tier W '
      + 'cannot be called done while it is open — and with W6 landed, this and the three items '
      + 'around it are the whole of what is left.',
    question: 'Do the fireflies, the wisps and the moot procession read as a living layer — and do '
      + 'its two gestures land: does the glade step BACK while the dice are flying, and lean IN once '
      + 'they are down?',
    stakes: {
      approve: 'W5 closes; the governor’s curves are final.',
      overrule: 'The population and the two mood curves are re-tuned — a contained change inside '
        + 'js/fae-lab.js that touches no other item on this page.',
    },
    notes: [
      { kind: 'plain', text: 'This was never asked. Your W7 verdict answered a question about the '
        + 'composition and the model, and nothing in it was about the fireflies or the procession — '
        + 'recorded as an un-asked question rather than banked as an approval nobody gave.' },
      { kind: 'plain', text: 'A static room is fair to photograph once; a moving one is not. Each '
        + 'palette gets two frames of the SAME eye twenty seconds apart, so a population that only '
        + 'reads in one lucky frame is visible as such.' },
      { kind: 'plain', text: 'The two gestures are driven by mood.life and mood.lean, and the step '
        + 'prints both beside every frame it takes — so if a frame looks wrong the question "did the '
        + 'governor fire, or did it fire and not show?" is already answered in the run log. Nothing '
        + 'in the two flying/settled frames below is a lucky moment: they are the peak of each curve.' },
    ],
    groups: [
      { label: 'Moonrise · the same eye, 20 s apart — did one lucky frame carry it?',
        regen: REGEN_LIFE, cols: 2, pair: true,
        frames: [
          { file: 'life-moonrise-phase-a.png', cap: 'phase A' },
          { file: 'life-moonrise-phase-b.png', cap: 'phase B — 20 s later' },
        ] },
      { label: 'Moonrise · the two gestures', regen: REGEN_LIFE, cols: 2, pair: true,
        frames: [
          { file: 'life-moonrise-flying.png', cap: 'DICE FLYING — the layer should have withdrawn' },
          { file: 'life-moonrise-settled.png', cap: 'DICE DOWN — and it leans toward the clearing' },
        ] },
      { label: 'Moonrise · the moot in session (found by stepping to the session peak, not guessed)',
        regen: REGEN_LIFE, cols: 2, pair: true,
        frames: [
          { file: 'life-moonrise-session.png', cap: 'moonrise — the procession standing in the ring' },
          { file: 'life-foxfire-session.png', cap: 'foxfire — the same moment, the other sky' },
        ] },
      { label: 'Foxfire · the value floor a tertiary field dies in', regen: REGEN_LIFE, cols: 2, pair: true,
        frames: [
          { file: 'life-foxfire-phase-a.png', cap: 'phase A' },
          { file: 'life-foxfire-settled.png', cap: 'dice down — the lean' },
        ] },
    ],
  },

  {
    n: 3,
    id: 'stump',
    kind: 'LOOK',
    title: 'The round-6 grounded stump — berm, fingers, creep',
    where: 'ROADMAP Tier W · W2c step 2, "the stump grows its ground" (d088bf9 + promotion)',
    unblocks: 'Your own either/or from W2c. Approving it confirms the fork that was taken '
      + '(ground-integration, not fog-blend) and lets the tower rounds move on to the ledger item. '
      + 'It also closes the round that fixed the palette flip.',
    question: 'Does the stump now GROW out of the ground — an earthen berm where the wooden gangplank '
      + 'was, root-flare fingers diving into the soil, moss creep low on the trunk — or does it still '
      + 'read as an item set on a table?',
    stakes: {
      approve: 'W2c’s step 2 is finished and hollowbole’s next round is the ledger item (the '
        + 'pale machined face at the shell’s x-clamp plane, which reads as a sawn plank in side '
        + 'views).',
      overrule: 'The base re-opens as a hollowbole round 9 — a /new-tower-shaped job with its own bake, '
        + 'gates and review.',
    },
    notes: [
      { kind: 'plain', text: 'Your words this is answering, from W2c: "It looks like an item set on a '
        + 'table, not a stump that grew out of the ground… the ramp out of the stump is not part of '
        + 'the immersion and instead plays against it."' },
      { kind: 'plain', text: 'Both palettes are shown because the palette flip is the bug this round '
        + 'shipped a fix for — the moonrise model stood in the foxfire world for two rounds, invisible '
        + 'while everything was pale wood and loud the moment the berm carried baked soil.' },
    ],
    groups: [
      { label: 'From the doorway side — the berm crest where the wooden tongue used to be',
        regen: REGEN_VERDICT, cols: 2, pair: true,
        frames: [
          { file: 'v-stump-moonrise-berm.png', cap: 'moonrise' },
          { file: 'v-stump-foxfire-berm.png', cap: 'foxfire' },
        ] },
      { label: 'From the other flank — the skirt, the root fingers and the ground seam',
        regen: REGEN_VERDICT, cols: 2, pair: true,
        frames: [
          { file: 'v-stump-moonrise-flank.png', cap: 'moonrise' },
          { file: 'v-stump-foxfire-flank.png', cap: 'foxfire' },
        ] },
    ],
  },

  {
    n: 4,
    id: 'w4',
    kind: 'LOOK',
    title: 'W4 — the Moonmoot Witchlight set art',
    where: 'ROADMAP Tier W · "W4. The dice set — DONE 2026-08-13 (pending Joe’s LOOK verdict)"',
    unblocks: 'The last unjudged fae OBJECT. Goal 14 asks the venue to be judged as a WHOLE for '
      + 'internal consistency, and that cannot be done over an unapproved set — the dice are the '
      + 'brightest thing in either sky by construction.',
    question: 'Is the Witchlight set finished art — deep-carved numerals carrying all the light, over '
      + 'a body that stays a quiet step above the venue’s floor?',
    stakes: {
      approve: 'W4 closes. The set is staged by both fae venues at roll creation and nothing else '
        + 'waits on it.',
      overrule: 'The recipe changes in js/themes.js — and it is judged twice, because the digit colour '
        + 'was deliberately placed BETWEEN moonrise’s teal rim and foxfire’s mint rim so one '
        + 'bake serves both skies.',
    },
    notes: [
      { kind: 'plain', text: '"Rune glow" was delivered as CARVING plus LIGHT rather than a runic '
        + 'alphabet — a recorded refusal: real runes for 1..20 would trade the one invariant a set may '
        + 'never touch, which is that the numbers stay readable.' },
      { kind: 'plain', text: 'The set ships with no particles and no parented light on purpose: the '
        + 'venue lights its own dice (two followers, halos, the fog lattice), so the bench frames and '
        + 'the in-venue frames are both needed — neither one alone is the set.' },
    ],
    groups: [
      { label: 'The bench, under the felt lamp and in the dark', regen: REGEN_VERDICT, cols: 2, pair: true,
        frames: [
          { file: 'v-set-table-row.png', cap: 'env: table — the whole row' },
          { file: 'v-set-dark-row.png', cap: 'env: dark — where the carving is supposed to bloom' },
        ] },
      { label: 'Hero, and the neighbour the value structure was reasoned against',
        regen: REGEN_VERDICT, cols: 2, pair: true,
        frames: [
          { file: 'v-set-dark-d20.png', cap: 'Witchlight d20, dark' },
          { file: 'v-set-dark-blackanvil-d20.png',
            cap: 'Black Anvil d20, dark — the structure this inverts to cold' },
        ] },
      { label: 'And where it actually lives: settled in the venue that stages it',
        regen: REGEN_GLADE, cols: 2, pair: true,
        frames: [
          { file: 'glade-moonrise-dice.png', cap: 'Moonrise Glade' },
          { file: 'glade-foxfire-dice.png', cap: 'Foxfire Hollow' },
        ] },
    ],
  },

  {
    n: 5,
    id: 'listen',
    kind: 'LISTEN',
    title: 'The ten voices — every sound in this app is unheard',
    where: 'docs/AUDIO.md §9, "The listening script — ten voices, one sitting" · W6 landed 2026-08-16',
    unblocks: 'W6 shipped the room beds and the ground trims, so the audio palette is now COMPLETE '
      + 'and completely unjudged. This is the only section of the sitting that is not looking at '
      + 'pictures, and it is twenty clicks: three rooms, five towers, and the venue’s dice and floor.',
    question: 'Are these ten voices right — and if not, which numbers move?',
    stakes: {
      approve: 'The dials freeze, and the audio palette stops being a set of numbers reasoned from '
        + 'a table and becomes something a person has heard.',
      overrule: 'You name the direction (heavier / longer / duller / less shaft, or one venue’s '
        + '`ground.centre`) and the row changes — a cosmetic edit that provably cannot move a film, '
        + 'so it costs one commit and no simulations.',
    },
    notes: [
      { kind: 'plain', text: 'The order below is copied from AUDIO.md §9 and is load-bearing: the '
        + 'rows are arranged so that exactly ONE thing changes between consecutive rows. Taken in '
        + 'order it is one sitting; taken out of order it is ten errands.' },
    ],
    listen: true,
  },

  {
    n: 6,
    id: 'c25',
    kind: 'LOOK',
    title: 'C25 Stage 2 — where the record of previous rolls lives',
    where: 'ROADMAP Tier C · C25, SHIPPED 2026-08-15 · UX §7.42',
    unblocks: 'A shipped surface whose LOCATION was refused with arithmetic rather than with taste. '
      + 'It is the only item on this page where the build said no to something you asked for.',
    question: 'You asked for the previous N rolls as panels across the bottom of the felt; the build '
      + 'put them in the roll log’s head instead, with a three-pixel spine on the ≣ button when '
      + 'the log is closed — do you overrule that?',
    stakes: {
      approve: 'C25 closes as built.',
      overrule: 'The record moves to the felt, and the arithmetic that refused it becomes a design '
        + 'problem to solve rather than a reason not to: five panels across a 390 px phone is 78 px '
        + 'each, which is C24’s "a tower reads as a smudge" applied to UI.',
    },
    notes: [
      { kind: 'plain', text: 'The pair the entry itself names as the one that lets you overrule it in '
        + 'one look is the phone and the five-deep desktop, both with the log open.' },
      { kind: 'plain', text: 'Two rollers, two colours, on purpose: the under-glow ring this replaced '
        + 'was unreadable precisely because two rollers differed by about 10 of 255 (C13).' },
    ],
    groups: [
      { label: 'THE PAIR — a 390 px phone and the five-deep desktop, log open',
        regen: REGEN_RECORD, cols: 2, pair: true, fit: 'h',
        frames: [
          { file: 'rec-phone-open.png', cap: '390 px phone, panels collapsed — the width the felt '
            + 'strip could not have survived' },
          { file: 'rec-five-open.png', cap: 'desktop, five put-away rolls — the record at its cap' },
        ] },
      { label: 'The head of the log, magnified — the object itself',
        regen: REGEN_RECORD, cols: 2, pair: true,
        frames: [
          { file: 'rec-five-head.png', cap: 'five rolls in the log’s head (3× crop)' },
          { file: 'rec-held-card.png', cap: 'a held roll awaiting its reveal, opened from its rank' },
        ] },
      { label: 'And with the log CLOSED — the three-pixel spine is the only presence a put-away roll has',
        regen: REGEN_RECORD, cols: 2, pair: true, fit: 'n',
        frames: [
          { file: 'rec-empty-spine.png', cap: 'EMPTY — the spine must not draw a socket for rolls '
            + 'that are not there (5× crop)' },
          { file: 'rec-five-spine.png', cap: 'FIVE — the same button, loaded (5× crop)' },
        ] },
    ],
  },

  {
    n: 7,
    id: 'c27',
    kind: 'CALL',
    choices: ['turn preferDice on', 'leave it off', 'not yet'],
    title: 'C27 — does a cropped felt still read as a table?',
    where: 'ROADMAP Tier C · C27, "INSTRUMENT SHIPPED, THE CALL IS JOE’S"',
    unblocks: 'A shipped instrument that is inert by default. Your answer either turns it into a '
      + 'default or closes the entry as measured-and-declined; either way C24/C27 stop being open.',
    question: 'With `preferDice` on, the camera frames the DICE instead of the mat and the felt gets '
      + 'cropped — does the table still read as a table?',
    stakes: {
      approve: '`setFraming({preferDice:true})` becomes the shipped default and the '
        + '`framing-instrument-is-inert` pin is replaced by one that asserts the new behaviour.',
      decline: 'C27 closes as "measured, declined", and the phone’s real lever is named as the '
        + 'RAIL (a 390 px phone gives the felt 278 px) rather than the camera.',
    },
    notes: [
      { kind: 'finding', text: 'FINDING, and it does not match the entry. Re-measured on today’s '
        + 'tree, the option changes the frame in only TWO of these six cases, and only one of them '
        + 'meaningfully. ROADMAP C27’s table (2026-08-15) claims a desktop 6d6 win of 200→236 and '
        + 'a desktop 40d6 LOSS of 200→184; neither reproduces — both frames now come back '
        + 'byte-identical. The 390 px rows still agree with the entry exactly (the option correctly '
        + 'declines to act). Spawn geometry moved on 2026-08-15, which is the likeliest cause, and it '
        + 'means the "it is a loss at 40d6" argument against turning this on may no longer hold.' },
    ],
    groups: [
      { label: '3d6 — the canonical Soul Deal roll', regen: REGEN_VERDICT, cols: 2, pair: true,
        span: 'desktop-3d6',
        frames: [
          { file: 'v-crop-desktop-3d6-off.png', cap: 'desktop 1600 · OFF (shipped)' },
          { file: 'v-crop-desktop-3d6-on.png', cap: 'desktop 1600 · preferDice ON' },
        ] },
      { label: '3d6 on a 390 px phone', regen: REGEN_VERDICT, cols: 2, pair: true, span: 'phone-3d6',
        frames: [
          { file: 'v-crop-phone-3d6-off.png', cap: 'phone 390 · OFF' },
          { file: 'v-crop-phone-3d6-on.png', cap: 'phone 390 · preferDice ON' },
        ] },
      { label: '6d6', regen: REGEN_VERDICT, cols: 2, pair: true, span: 'desktop-6d6',
        frames: [
          { file: 'v-crop-desktop-6d6-off.png', cap: 'desktop 1600 · OFF' },
          { file: 'v-crop-desktop-6d6-on.png', cap: 'desktop 1600 · preferDice ON' },
        ] },
      { label: '40d6 — the heap the option was supposed to lose on',
        regen: REGEN_VERDICT, cols: 2, pair: true, span: 'desktop-40d6',
        frames: [
          { file: 'v-crop-desktop-40d6-off.png', cap: 'desktop 1600 · OFF' },
          { file: 'v-crop-desktop-40d6-on.png', cap: 'desktop 1600 · preferDice ON' },
        ] },
      { label: '40d6 on a phone', regen: REGEN_VERDICT, cols: 2, pair: true, span: 'phone-40d6',
        frames: [
          { file: 'v-crop-phone-40d6-off.png', cap: 'phone 390 · OFF' },
          { file: 'v-crop-phone-40d6-on.png', cap: 'phone 390 · preferDice ON' },
        ] },
    ],
  },

  {
    n: 8,
    id: '9c',
    kind: 'CALL',
    choices: ['keep std (the sharp cut)', 'round .090', 'round .130', 'not yet'],
    title: '9c — which edge do the standard dice wear',
    where: 'ROADMAP Tier 3 · 9c, "Waiting on Joe" — the oldest open item in the project',
    unblocks: 'True fillets shipped; `std` is still the sharp cut because only you can pick. This is '
      + 'the last thing standing between Tier 3’s dice art and a decision.',
    question: 'Do the standard dice keep today’s sharp cut (bevel .055, profile cut), or move to '
      + 'round .090, or to round .130?',
    stakes: {
      approve: 'The chosen recipe becomes `std` and every die in the app that is not a house set '
        + 'changes shape. 9c’s "waiting on Joe" clears.',
      decline: 'The item closes as a DECISION to keep the cut, rather than staying open as a wait.',
    },
    notes: [
      { kind: 'plain', text: 'All three are framed at the same hero distance by the lab, so the edge '
        + 'treatment is the only thing that differs. The constraint that bounds the answer: the digit '
        + 'plane stays dead flat (legibility), so face bulge is subtle or shading-only.' },
      { kind: 'plain', text: 'All fillet tiers are RENDER ONLY — the physics hull, the face values and '
        + 'the read logic stay canonical whichever you pick.' },
    ],
    groups: [
      { label: 'd20 — where a chamfer is widest and most visible', regen: REGEN_VERDICT, cols: 3,
        frames: [
          { file: 'v-9c-std-d20.png', cap: 'std — the sharp cut (shipped)', bench: 'std' },
          { file: 'v-9c-lab.round090-d20.png', cap: 'round .090 — the soft candidate', bench: 'lab.round090' },
          { file: 'v-9c-lab.round130-d20.png', cap: 'round .130 — the recipe ceiling', bench: 'lab.round130' },
        ] },
      { label: 'd6 — the die most rolls are made of', regen: REGEN_VERDICT, cols: 3,
        frames: [
          { file: 'v-9c-std-d6.png', cap: 'std' },
          { file: 'v-9c-lab.round090-d6.png', cap: 'round .090' },
          { file: 'v-9c-lab.round130-d6.png', cap: 'round .130' },
        ] },
      { label: 'The whole row of each, so the smaller dice are in the read too',
        regen: REGEN_VERDICT, cols: 3,
        frames: [
          { file: 'v-9c-std-row.png', cap: 'std' },
          { file: 'v-9c-lab.round090-row.png', cap: 'round .090' },
          { file: 'v-9c-lab.round130-row.png', cap: 'round .130' },
        ] },
    ],
  },
];

// THE LISTENING SCRIPT IS NOT AUTHORED HERE — it is docs/AUDIO.md §9, and this
// is a transcription of it. The ORDER is the load-bearing part: the rows are
// arranged so that exactly ONE thing changes between consecutive rows, which
// is what turns ten errands into one sitting. Re-ordering them to suit a page
// layout would quietly throw that away, so the three sections and their
// sequence are preserved exactly (W6, 2026-08-16).
const VOICE_SECTIONS = [
  {
    id: 'A',
    title: 'A. The three rooms — no dice, just the room',
    blurb: 'A minute each with nothing on the felt. What is being judged is whether the room is a '
      + 'PLACE, and whether it is quiet enough to disappear.',
    after: 'Then go back — The Table → Moonrise Glade once more. The A/B is where "is this the '
      + 'same building?" actually gets answered.',
    rows: [
      { id: 'A1', voice: 'The Table', dial: 'hearth, walls',
        clicks: 'Staging → <b>The Table</b>',
        listen: 'the reference. Brown low end, sparse bright fire ticks (~4/s).' },
      { id: 'A2', voice: 'Moonrise Glade', dial: 'clearing',
        clicks: '<b>Moonrise Glade</b> → <i>(nothing; wait 3 s)</i>',
        listen: 'the low end steps back and the top goes soft — no walls, leaf hiss at the '
          + 'treeline. Ticks become rare low drips (~0.7/s). The change takes 3 s '
          + '(<code>BED_VOICE_S</code>): that transition is a voice too.' },
      { id: 'A3', voice: 'Foxfire Hollow', dial: 'damp hollow',
        clicks: '<b>Foxfire Hollow</b> → <i>(wait 3 s)</i>',
        listen: 'closer, wetter and more enclosed than A2, dripping twice as often and lower.' },
    ],
  },
  {
    id: 'B',
    title: 'B. The five tower voices — under The Table, on equal ground',
    blurb: 'Put the grounded venue back first (The Table) so every tower is judged on felt with '
      + 'all ground trims at 1. Room tone may stay on; off is a cleaner read of the knocks.',
    after: 'B5 moves two things at once (tower AND venue) and there is no way around it: Hollow '
      + 'Bole cannot stand in the grounded room. Judge it against B2, which is the nearest body, '
      + 'and remember there is moss under it now.',
    rows: [
      { id: 'B1', voice: 'Heartwood', dial: 'clack 0.35/20',
        clicks: '<b>Heartwood</b> → <b>Roll</b>',
        listen: 'dry wood on wood, short and narrow, over the shortest comb in the set.' },
      { id: 'B2', voice: 'Bastion', dial: 'thud 0.7/40',
        clicks: '<b>Bastion</b> → <b>Roll</b>',
        listen: 'heavier and lower, and it rings on in the chute after the knock.' },
      { id: 'B3', voice: 'Black Anvil', dial: 'chime 0.85/70',
        clicks: '<b>Black Anvil</b> → <b>Roll</b>', flag: 'most likely to want moving',
        listen: 'a chime body weighted right down, meant to read as cast iron rather than crystal. '
          + 'If it reads as glass, the weight goes up.' },
      { id: 'B4', voice: 'Nullstone', dial: 'hush 0.75/25',
        clicks: '<b>Nullstone</b> → <b>Roll</b>',
        listen: 'a subtracted click through the deadest comb here — a bore through solid rock '
          + 'returns almost nothing.' },
      { id: 'B5', voice: 'Hollow Bole', dial: 'thud 0.5/35',
        clicks: '<b>Moonrise Glade</b> → <b>Roll</b>', flag: 'second most likely to want moving',
        listen: 'a dead drum: hollower than B2 over the longest comb, the note an empty trunk '
          + 'gives back. It has <b>no tower chip</b> — venue-only, so the VENUE is the click. '
          + 'Do not go looking for it in the tower picker.' },
    ],
  },
  {
    id: 'C',
    title: 'C. The venue’s dice and its ground — you are already there',
    blurb: 'Stay in Moonrise Glade from B5. Every roll is now Witchlight on moss.',
    after: 'The single control that answers most of section C is '
      + '`VENUE_AUDIO[venue].ground.centre` in js/main.js. It moves the impacts, the whole settle '
      + 'tail, the rolling surface band and the tilt curve TOGETHER, by design — so if you want one '
      + 'number to react to, that is the one.',
    rows: [
      { id: 'C1', voice: 'Witchlight', dial: 'chime 0.22/65',
        clicks: '<i>(a row)</i> → <b>Roll</b>',
        listen: '"a long faint cold ring — glass struck in another room". Check it is not '
          + 'competing with the tower knocks it arrives after.' },
      { id: 'C2', voice: 'Moonrise ground', dial: '×0.72 / ×0.85 / ×0.90',
        clicks: '<i>(a row ×8)</i> → <b>Roll</b>',
        listen: 'the same die landing in moss: dull, short, absorbed. Judge the SETTLE TAIL '
          + 'hardest — five taps in ~145 ms is where a floor either sounds soft or sounds broken — '
          + 'then the grind as the pile rolls out.' },
      { id: 'C3', voice: 'Foxfire ground', dial: '×0.66 / ×0.78 / ×0.85',
        clicks: '<b>Foxfire Hollow</b> → <b>Roll</b>',
        listen: 'the same again, deader. <b>If C2 and C3 are indistinguishable the two rows should '
          + 'collapse into one.</b>' },
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
      bytes: statSync(p).size });
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
      <h4>The preamble, once — three things, and the first one is not optional</h4>
      <ol>
        <li><b>Open the table on <code>?stability=beta</code></b> —
          <code>http://localhost:8123/?stability=beta</code>. Venue and tower are closed-beta rows
          and the pickers are simply ABSENT without it. The param is stripped from the address bar
          and the enrolment persists in this browser.</li>
        <li><code>⚙</code> → <b>You</b> → <b>Room tone</b> ON. The bed is off by default and W6 did
          not change that — section A is inaudible without it.</li>
        <li><code>⚙</code> → <b>Staging</b>, and leave the panel open. It covers nothing that makes
          a sound.</li>
      </ol>
      <p><b>A roll is two clicks:</b> a row in the left column, then <b>Roll</b>. Tap the row N times
        first for N dice — those taps are not counted below. For a big pour (the tower voices want
        one) <code>/</code> → <code>8d6</code> → Enter is faster, and is the only keyboard in this
        script.</p>
    </div>
    ${sections}
    <div class="disc">
      <b>Two corrections to what this page was first told, both worth stating plainly.</b>
      The brief said four tower clunk voices; there are <b>five</b> — <code>nullstone</code>
      (hush 0.75/25) was missed by the roadmap. And with W6’s room beds and ground trims landed,
      the count is not five voices but <b>ten, and every voice in the app is unheard</b>. Nine were
      reasoned from tables and never played to a person; the tenth (the grounded bed) has been
      playable since V1 and nobody has sat with it. That is the argument for doing them in one
      pass rather than one at a time.
    </div>`;
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
<title>The sitting — every open LOOK and LISTEN</title>
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
  textarea#dump { position:fixed; left:-9999px; }
</style></head>
<body>
<div class="wrap">
<header class="top">
  <h1>The sitting — every open LOOK and LISTEN in one page</h1>
  <p class="sub">Seven LOOKs and one listening pass, ordered by what each verdict FREES rather than
    by tier number. Each states the question in one sentence, shows the frames side by side, and says
    what happens either way. The last row of every item records your answer; the button at the bottom
    copies all of them out as text. <b>Item 5 is the only one that needs the live table</b> — the
    other seven are answerable from this page alone.</p>
  <p class="stampline">generated ${esc(stats.when)} · tree ${esc(stats.sha)} ·
    ${stats.embedded} frames embedded${stats.missing ? ` · <b style="color:#e2705a">${stats.missing} MISSING</b>` : ''} ·
    every frame rendered fresh from this tree</p>
  <nav>${nav}</nav>
</header>
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
mkdirSync(SHOTS, { recursive: true });
const html = pageHtml(frames, {
  when: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
  sha: gitSha(),
  embedded: frames.size,
  missing: missing.length,
});
writeFileSync(PAGE, html);
console.log(`\n${PAGE}`);
console.log(`  ${frames.size} embedded · ${missing.length} missing · `
  + `${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`);
if (missing.length) {
  console.log('\nMISSING (the page renders each as a loud red cell, not a gap):');
  for (const m of missing) console.log(`  ${m}`);
  process.exitCode = 1;
}
