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

// BOLE AUDIT — name every mesh in the hollowbole skin with its bbox, so an
// overrun in tower-fit's anonymous report can be pinned to a part.
//
//   node tools/drive.mjs tools/steps/bole-audit.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'BoleAudit');
  await a.settle();
  const rows = await a.eval(`(() => {
    const d = window.__diceDebug;
    d.setTower('hollowbole');
    return 'queued';
  })()`);
  await a.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'socketed', timeout: 20000 });
  const out = await a.dbg('towerModelAudit()');
  console.log(JSON.stringify(out, null, 1).slice(0, 4000));
}
