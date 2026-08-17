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

// §2l ⑥, THE SUM READ — the frames the build could not take. The pass that
// shipped the curve verified every NUMBER in the running app and saw none of
// it drawn (the browser pane would not composite), and named three decisions
// that only an eye can make. This step takes those three questions and shoots
// the frame that answers each.
//
//   node tools/drive.mjs tools/steps/sumread-look.mjs
//
// Each spec is chosen because it is the WORST case for one question, not
// because it is typical:
//
//   4d6dl1 dc15    the payoff (GOALS goal 4's own example) with a target mark
//   1d20+5         FLAT — every total 5%, so the curve is a solid block and
//                  the peak is a tie the read has to name rather than pick
//   1d6!           SPARSE — no total of 6, so a renderer that assumed a dense
//                  range would draw a lie, and the gap has to READ as a gap
//   2d6 dc7        avg and target land on the same total: do two marks on one
//                  column read as two marks
//   8d8+2d20 kh4   a REFUSAL (mixed-keep) that still owes min/avg/max beside
//     dc30         it, and must not print 0% for "we don't know"
//   40d20dl1       47 binned cells — the gutter question, and the cell whose
//                  tail underflowed to a false 0% before this shipped
//
// The popover is cropped and magnified because `#pop-preview` is ~300 px of a
// 1600 px screenshot: the same reason record-look crops the ≣ spine. Both the
// whole frame and the crop are written — the crop answers the question, the
// frame proves the popover is where it claims to be.

async function crop(table, path, clip, scale = 3) {
  const { writeFileSync } = await import('node:fs');
  const { data } = await table.page.browser.send('Page.captureScreenshot',
    { format: 'png', clip: { ...clip, scale } }, table.page.sessionId);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

// THE PREVIEW IS BELOW THE FOLD OF ITS OWN PANEL. `#pop-preview` sits under
// Target (DC) in a popover that scrolls internally, so the first version of
// this step cropped a rectangle of empty felt and would have reported the read
// as unlookable. Scroll it into its panel's centre first, THEN measure.
const showPreview = (table) => table.eval(`(() => {
  const el = document.getElementById('pop-preview');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  return true;
})()`);

const popBox = (table) => table.eval(`(() => {
  const el = document.getElementById('pop-preview');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { x: Math.max(0, r.left - 14), y: Math.max(0, r.top - 14),
           width: r.width + 28, height: r.height + 28 };
})()`);

const SPECS = [
  { id: 'payoff', name: 'Payoff', notation: '4d6dl1 dc15' },
  { id: 'flat', name: 'Flat', notation: '1d20+5' },
  { id: 'sparse', name: 'Sparse', notation: '1d6!' },
  { id: 'coincide', name: 'Coincide', notation: '2d6 dc7' },
  { id: 'refusal', name: 'Refusal', notation: '8d8+2d20 kh4 dc30' },
  { id: 'widest', name: 'Widest', notation: '40d20dl1' },
];

export default async function sumreadLook(stage) {
  const a = await stage.tab('localhost', 'Looker');
  // A desktop window, stated: the default harness viewport is 780 wide, and a
  // curve judged in a column narrower than the app's own popover is a judgement
  // about the harness.
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg(`setSystem('dnd')`);
  await a.dbg(`setGroups([${SPECS.map((s) =>
    `{name: ${JSON.stringify(s.name)}, notation: ${JSON.stringify(s.notation)}, category: 'Attributes'}`)
    .join(', ')}])`);
  await a.dbg('setPoolsEditMode(true)');
  await a.settle();

  const groups = await a.dbg('groups');
  let bad = 0;

  for (const spec of SPECS) {
    const g = groups.find((x) => x.name === spec.name);
    if (!g) { console.log(`  MISSING pool ${spec.name} — setGroups did not take it`); bad++; continue; }
    const opened = await a.dbg(`openPopoverFor(${JSON.stringify(g.id)})`);
    if (opened !== true) { console.log(`  ${spec.id}: popover REFUSED to open`); bad++; continue; }
    await a.dbg('sim(20)');

    // The read as the app itself reports it, printed beside the frame so the
    // picture and the numbers can never drift apart in the record.
    const read = await a.dbg('sumRead');
    if (!read) {
      console.log(`  ${spec.id} (${spec.notation}): NO SUM READ PAINTED — this is the finding`);
      bad++;
    } else {
      console.log(`  ${spec.id} (${spec.notation}): line=${JSON.stringify(read.line)}`
        + ` cells=${read.cells} readout=${JSON.stringify(read.readout || '')}`
        + (read.target ? ` target=${JSON.stringify(read.target)}` : '')
        + (read.refusal ? ` refusal=${JSON.stringify(read.refusal)}` : ''));
      const text = JSON.stringify(read);
      if (/[^\d]0%/.test(text)) console.log(`  ${spec.id}: PRINTS 0% — check it is a TRUE zero`);
    }
    await showPreview(a);
    await a.dbg('sim(6)');
    console.log('  ' + await stage.shot(a, `sum-${spec.id}-frame.png`));
    const box = await popBox(a);
    if (box) console.log('  ' + await crop(a, stage.out(`sum-${spec.id}.png`), box));
    else { console.log(`  ${spec.id}: #pop-preview has no box — nothing to look at`); bad++; }
    await a.dbg('closePopover()').catch(() => {});
  }

  console.log(`\n  ${SPECS.length - bad}/${SPECS.length} specs drew a read`);
  console.log('  Judge: (1) do the columns need a gutter — sum-widest.png;'
    + ' (2) does a flat pool read as a block or as a bug — sum-flat.png;'
    + ' (3) do avg and target on one column read as two marks — sum-coincide.png.');
  if (bad) process.exitCode = 1;
}
