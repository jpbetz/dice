#!/usr/bin/env bash
# Copyright 2026 The Dice Table Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# IS THE SUITE GREEN WITH THE CANDIDATE FLIPPED ON? Everything this pass built
# ships INERT, so `npm test` proves the inert path and says nothing whatsoever
# about the thing we are proposing to turn on. This flips each candidate's
# DEFAULT in js/main.js, runs the suite against it, and puts the file back —
# the same check C30d ran by hand when it left TEMPO.k at 2 for one run.
#
# Restores from a backup on every exit path, including a failed run, because a
# script that can leave a physics default flipped in the working tree is worse
# than no script.
#
#   bash tools/armed-suite.sh [flat-repeats]

set -u
cd "$(dirname "$0")/.."
REPEATS="${1:-10}"
# A FIXED, PRINTED BACKUP PATH, because the trap is not enough. A SIGKILL runs
# no trap, and the first run of this script was killed by an outer timeout with
# pass D's defaults still in the file — a physics flip left armed in the working
# tree, which is the worst thing this script could possibly do. The path is
# predictable and announced so the wreckage is one `cp` away, and
# `bash tools/armed-suite.sh --restore` does it for you.
BACKUP=".git/armed-suite-main.js.bak"
if [ "$REPEATS" = "--restore" ]; then
  [ -f "$BACKUP" ] || { echo "no backup at $BACKUP"; exit 1; }
  cp -f "$BACKUP" js/main.js && echo "restored js/main.js from $BACKUP"; exit 0
fi
cp -f js/main.js "$BACKUP"
echo "backup: $BACKUP  (restore with: bash tools/armed-suite.sh --restore)"
restore() { cp -f "$BACKUP" js/main.js; echo "--- js/main.js restored from $BACKUP ---"; }
trap restore EXIT INT TERM

arm() { # arm <python-replacements-heredoc-on-stdin>
  python3 - "$@" <<'PY'
import sys, re
p = 'js/main.js'
s = open(p).read()
for pair in sys.argv[1:]:
    old, new = pair.split('||')
    if old not in s:
        print(f'ARM FAILED, pattern absent: {old}')
        sys.exit(2)
    s = s.replace(old, new, 1)
open(p, 'w').write(s)
print('armed')
PY
}

run_suite() {
  echo "=== $1 ==="
  node --check js/main.js || return 1
  npm test 2>&1 | tail -3
}

# ---- pass A: the settle candidate -----------------------------------------
cp -f "$BACKUP" js/main.js
arm "const SETTLEGATE = { mode: 'velocity', eps: 0.02 };||const SETTLEGATE = { mode: 'displacement', eps: 0.02 };" \
    "const BODYFLAGS = { allowSleep: null };||const BODYFLAGS = { allowSleep: false };" \
    "  pileScale: 0, pileSpread: 12,||  pileScale: 1.05, pileSpread: 12," || exit 1
run_suite "A. displacement eps 0.02 + sleepoff + nudgepile"
echo "--- dice-land-flat x$REPEATS, candidate armed ---"
PASS=0
for i in $(seq 1 "$REPEATS"); do
  if node tests/e2e/run.mjs --only dice-land-flat 2>&1 | grep -qE '^  ok +dice-land-flat'; then
    PASS=$((PASS + 1)); echo "  run $i ok"
  else
    echo "  run $i FAIL"
  fi
done
echo "dice-land-flat armed: $PASS/$REPEATS"

# ---- pass B: the tempo curve + the film click gate -------------------------
cp -f "$BACKUP" js/main.js
arm "const TEMPO = { k: 1, flight: 1, settle: 1, rampS: 0.4, anchorSpeed: 6 };||const TEMPO = { k: 1, flight: 1, settle: 2.2, rampS: 0.4, anchorSpeed: 8 };" \
    "const CLICKGATE = { mode: 'wall' };||const CLICKGATE = { mode: 'film' };" || exit 1
run_suite "B. tempo curve flight 1 -> settle 2.2 (anchor 8) + film click gate"

# ---- pass C: the uniform k=2, as C30d ran it -------------------------------
cp -f "$BACKUP" js/main.js
arm "const TEMPO = { k: 1, flight: 1, settle: 1, rampS: 0.4, anchorSpeed: 6 };||const TEMPO = { k: 2, flight: 1, settle: 1, rampS: 0.4, anchorSpeed: 6 };" || exit 1
run_suite "C. uniform k=2"

# ---- pass D: everything at once --------------------------------------------
cp -f "$BACKUP" js/main.js
arm "const SETTLEGATE = { mode: 'velocity', eps: 0.02 };||const SETTLEGATE = { mode: 'displacement', eps: 0.02 };" \
    "const BODYFLAGS = { allowSleep: null };||const BODYFLAGS = { allowSleep: false };" \
    "  pileScale: 0, pileSpread: 12,||  pileScale: 1.05, pileSpread: 12," \
    "const TEMPO = { k: 1, flight: 1, settle: 1, rampS: 0.4, anchorSpeed: 6 };||const TEMPO = { k: 1, flight: 1, settle: 2.2, rampS: 0.4, anchorSpeed: 8 };" \
    "const CLICKGATE = { mode: 'wall' };||const CLICKGATE = { mode: 'film' };" || exit 1
run_suite "D. the whole staged flip set"
