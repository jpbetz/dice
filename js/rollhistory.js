/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { turnIsOpen } from './rollspec.js';

export const HISTORY_CAP = 100;
export const OPEN_TURN_CAP = 100;
export const TURN_CAP_MESSAGE = 'Cannot start another turn yet. Finish or clear a turn first; ordinary rolls still work.';
export const unfinished = entry => !!entry && !entry.cleared && turnIsOpen(entry);

// Active work is not history. Prune finished/explicitly cleared entries only,
// maintaining their original order and reporting exactly which rows left.
export function trimRollHistory(entries, cap = HISTORY_CAP) {
  let discard = Math.max(0, entries.filter(e => !unfinished(e)).length - cap);
  const kept = [], dropped = [];
  for (const entry of entries) {
    if (discard && !unfinished(entry)) { dropped.push(entry); discard--; }
    else kept.push(entry);
  }
  return { kept, dropped };
}

// Refuse new work at capacity; never close existing work to make room. The
// validated mods determine whether a request could create another turn;
// results are never sampled to decide whether the request is admitted.
export function canStartTurn(entries, mods) {
  if (!(mods?.throws > 1 || mods?.push)) return true;
  return entries.filter(unfinished).length < OPEN_TURN_CAP;
}
