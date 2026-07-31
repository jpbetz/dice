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

// The shared headless stage: one ephemeral server + one headless Chrome,
// with Table tabs on demand — the exact machinery the e2e suite trusts
// (tests/e2e/harness.mjs), packaged for ad-hoc driving via tools/drive.mjs.
// NEVER touches port 8123 (the user's live table): the server always binds
// an ephemeral port.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from '../tests/e2e/cdp.mjs';
import { freePort, startServer, Ctx } from '../tests/e2e/harness.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const OUT_DIR = join(ROOT, 'tools', 'out'); // gitignored

export async function startStage({ room = `drive-${Math.random().toString(36).slice(2, 8)}` } = {}) {
  const port = await freePort();
  const server = await startServer(port);
  const browser = await new Browser().launch();
  const ctx = new Ctx(browser, port, room);
  mkdirSync(OUT_DIR, { recursive: true });

  return {
    port,
    room,
    ctx,
    // A joined Table (the harness class: eval/dbg/roll/settle/waitFor/…).
    // Distinct origins seat distinct players: 'localhost', '127.0.0.1',
    // '127.0.0.2', … all hit the same ephemeral server.
    tab: (origin = 'localhost', name = 'Driver') => ctx.newTable({ origin, name }),
    // PNG of a table's page into tools/out/ (or an absolute path).
    shot: (table, name) => table.page.screenshot(name.startsWith('/') ? name : join(OUT_DIR, name)),
    out: (name) => join(OUT_DIR, name),
    serverLog: () => server.output(),
    async close() {
      await ctx.closeAll().catch(() => {});
      await browser.close();
      if (server.exitCode === null) server.kill('SIGTERM');
    },
  };
}
