# These mockups are ROTTED — do not build from them

**Status (2026-08-04, the Soul Deal audit, finding `mockups-rotted`):**
every file in this directory has drifted from the shipped app — within a
week of being written. They are kept only as design-history artifacts of
the decisions recorded in [../UX.md](../UX.md).

- **Never** treat markup, class names, copy, or layout here as
  load-bearing. The shipped app (`index.html`, `css/style.css`,
  `js/main.js`) is the only authority on what exists.
- For reviewing real chrome in real states, use **`/chrome-lab.html`**
  (the pose driver — it embeds the live app and poses it through
  `__diceDebug`, so it cannot rot) and the drive suites under
  `tools/steps/` with `tools/contact-sheet.mjs` for reviewable stills.
- The static-mockup *shape* is disqualified for future design work for
  exactly this reason: a copy of the UI starts lying the day it is born.

If UX.md references a mockup (e.g. `panel.html`'s ± popover), it is
citing the *decision record*, not the file's current pixels.
