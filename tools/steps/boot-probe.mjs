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

// Boot-path probe: open N tabs in sequence (alternating origins), record
// whether each came up ONLINE or fell back to solo, how long boot took, and
// any join error the page saw. For chasing "tab came up SOLO" flakes.
//
//   node tools/drive.mjs tools/steps/boot-probe.mjs [count=6]

export default async function run(stage, [count = '6']) {
  const n = Number(count) || 6;
  for (let i = 0; i < n; i++) {
    const origin = i % 2 === 0 ? 'localhost' : `127.0.0.${(i % 3) + 1}`;
    const t0 = Date.now();
    // Raw page (not ctx.newTable): the probe must SEE solo fallbacks, and
    // the harness's newTable now retries/throws on them by design.
    const page = await stage.ctx.browser.newPage();
    await page.addInitScript(`try { localStorage.setItem('dice.name.v1', 'P${i}'); } catch {}`);
    await page.navigate(`http://${origin}:${stage.port}/?room=${stage.room}`);
    let ready = false;
    for (let w = 0; w < 120; w++) {
      if (await page.eval(`!!window.__diceDebug`)) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    const online = ready
      ? await page.eval(`window.__diceDebug.netReady.then((r) => r && r.online)`)
      : null;
    console.log(`tab${i} ${origin} ready=${ready} online=${online} boot=${Date.now() - t0}ms`
      + ` errors=${JSON.stringify(page.errors.slice(0, 1))}`);
    await page.close();
  }
  const joins = (stage.serverLog().match(/join /g) || []).length;
  console.log(`server saw ${joins}/${n} joins`);
  console.log('--- server log tail ---\n' + stage.serverLog().split('\n').slice(-8).join('\n'));
}
