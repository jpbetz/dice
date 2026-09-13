<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Current composition release checks

The three old checks failed on `883811d` plus camera `27f6ec7`: both place
scenarios expected a live `#result-banner`, which the upright result rows have
replaced, and the phone developer check expected an 800-pixel canvas in an
844-pixel screen. The actual canvas now reserves top identity/results and the
bottom roll tray. A zero-area banner and an obsolete full-height canvas do not
measure the player’s current read.

Their existing scenario names now use `tests/e2e/composition.mjs`. This is a
fixture change; no application behavior changes. It deliberately retires the
old banner-width/tent-dress collision record while retaining GOALPOST 1, 2, 7
and 8 through the current screen composition.

- `place-two-views` keeps opposite-seat orbit, own-card position and
  reader-facing inscription assertions. It compares complete films and exact
  physical **and archived** poses for both a standard and a seaglass roll.
  Advancing one viewer by 37 frames produces a deliberately different cosmetic
  resting phase; both remain within the declared recipe amplitude. Comparing
  decorated mesh positions alone conflated this local motion with shared
  physics. Both viewers’ actual upright names, values, ownership marks and
  result links are checked, and a pointer on the other player’s name opens the
  corresponding result. See [Front](two-views-front.png) and
  [Back](two-views-back.png).
- `place-ring-banner` now checks real rows through one to eight server
  players. Names and numeric results have nonzero bounds, upright transforms,
  sufficient font size, no text clipping, and nine hit-tested points per text
  region. The row’s ID/name/headline are compared with its actual kept result.
  On a 390×844 phone, the 186-pixel scroll region shows four rows at a time;
  actual wheel input reveals the other four. Off-scroll rectangles are not
  counted as painted rows. A temporary covering element is a negative control:
  the occlusion measurement detects it without changing the underlying text
  or geometry. The scene stays separate and every complete painted die fits.
  See [eight on desktop](result-rows-8-desktop.png),
  [four on phone](result-rows-4-phone-top.png), and the eight-player phone
  [top](result-rows-8-phone-top.png) / [bottom](result-rows-8-phone-bottom.png).
- `dev-phone-sheet` begins with a real phone roll, opens the developer door
  with Backquote, taps its glyph, types a search, presses the lamp-height
  stepper and folds the sheet. It measures the actual scene between results
  and tray, not full window height. The open sheet keeps over 220 pixels of
  unobscured scene above it and leaves the result readable; its 44-pixel rows
  and stepper move the real light by 0.5. The overlay intentionally covers
  the lower scene while open, and does not resize the player’s canvas. Folding
  restores the original unobscured view and preserves the edit. See
  [open](developer-phone-sheet-open.png) / [folded](developer-phone-sheet-folded.png).

The [recorded measurements](measurements.json) include the complete film
hashes, body/archive transforms, actual decorative offsets, row bounds, font
sizes and occlusion results. The screenshots were taken after the same
hit-tested pointer/keyboard flows, with fixture-only people and rolls.

Validation: `node tests/e2e/run.mjs --only composition` passed all three.
After adding the decorative-phase and covering-element controls, each scenario
passed again through `node tools/drive.mjs tools/steps/composition-look.mjs
<scenario-name>`, producing the inspected screenshots above. Unchanged unit
and application code did not require another unit run for this fixture slice.

This evidence addresses result attribution and layout, not a new visual rating
of every dice material. For example, the seaglass body has a strong reflective
highlight from one chair; its upright result remains available above the scene.
