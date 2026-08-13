#!/bin/bash
# Bake every item twice: wall clock of the full node invocation, plus a
# sha256 of each STL so determinism is measured rather than assumed.
set -u
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$SRC/../../out/jscad"
cd "$SRC" || exit 1

for pass in 1 2; do
  for f in B1_die B2_turret B3_helix B4_gnarl B5_candelabra B6_plaque B7_storm; do
    s=$(date +%s.%N)
    node "$f.mjs" > /dev/null
    e=$(date +%s.%N)
    hash=$(cat "$OUT/$f"*.stl | sha256sum | cut -c1-16)
    printf 'pass%s %-14s wall=%6.2fs sha=%s\n' "$pass" "$f" "$(echo "$e - $s" | bc)" "$hash"
  done
done
