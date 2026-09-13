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

// Module workers resolve every import by URL; no document import map is needed.
import { bakeCaptured } from './film-wire.js';
self.onmessage = ({ data }) => {
  const { id, input } = data;
  try {
    const start = performance.now();
    const result = bakeCaptured(input);
    const transfer = [result.poses.buffer, ...result.film.roughTrack.map((a) => a.buffer)];
    self.postMessage({ id, result, bakeMs: performance.now() - start }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
