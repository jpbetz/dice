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

// One active film, one reusable worker. Cancellation retires the worker itself:
// a message cannot interrupt a synchronous solver loop running in that worker.
import { bakeCaptured } from './film-wire.js';
export class FilmClient {
  constructor({ createWorker = () => new Worker(new URL('./film-worker.js', import.meta.url), { type: 'module' }),
    fallback = bakeCaptured, timeoutMs = 15000 } = {}) {
    this.createWorker = createWorker; this.fallback = fallback; this.timeoutMs = timeoutMs;
    this.worker = null; this.pending = null; this.nextId = 0;
    this.stats = { completed: 0, canceled: 0, failures: 0, last: null };
  }
  run(input) {
    if (this.pending) throw new Error('A film is already baking');
    const id = ++this.nextId, start = performance.now();
    return new Promise((resolve) => {
      const pending = this.pending = { id, resolve, input, start, timer: null };
      const fail = (reason) => {
        if (this.pending !== pending) return;
        this.worker?.terminate(); this.worker = null;
        clearTimeout(pending.timer); this.pending = null; this.stats.failures++;
        const at = performance.now();
        try {
          const result = this.fallback(input);
          this.stats.last = { execution: 'inline-fallback', reason, bakeMs: performance.now() - at, totalMs: performance.now() - start };
          this.stats.completed++; resolve({ result, ...this.stats.last });
        } catch (error) { resolve({ error }); }
      };
      try {
        if (!this.worker) {
          const worker = this.worker = this.createWorker();
          this.worker.onmessage = ({ data }) => {
            if (this.worker !== worker) return;
            const p = this.pending;
            if (!p || data.id !== p.id) return;
            if (data.error) { p.fail(data.error); return; }
            clearTimeout(p.timer); this.pending = null;
            this.stats.last = { execution: 'worker', bakeMs: data.bakeMs, totalMs: performance.now() - p.start };
            this.stats.completed++; p.resolve({ result: data.result, ...this.stats.last });
          };
          this.worker.onerror = (e) => { e.preventDefault?.(); if (this.worker === worker) this.pending?.fail(e.message || 'Worker load failed'); };
          this.worker.onmessageerror = () => { if (this.worker === worker) this.pending?.fail('Worker message could not be decoded'); };
        }
        pending.fail = fail;
        pending.timer = setTimeout(() => fail('Worker timed out'), this.timeoutMs);
        this.worker.postMessage({ id, input });
      } catch (error) { fail(error.message || 'Worker unavailable'); }
    });
  }
  cancel() {
    if (!this.pending) return false;
    const p = this.pending; this.pending = null;
    clearTimeout(p.timer); this.worker?.terminate(); this.worker = null;
    this.stats.canceled++; p.resolve(null); return true;
  }
}
