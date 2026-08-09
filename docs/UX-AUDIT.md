<!-- Generated 2026-08-08 by a multi-agent audit; every claim was verified
     against source or a captured frame before it was written down. Findings
     are referenced by their letter-number ids (A1, C3, …) from ROADMAP.md's
     Tier U, which carries the work items this document argues for. -->

# The converged UX — an audit

*2026-08-08, as of commit `1b7a8f2`.*

*Method: six surfaces mapped as built (workbench · rack · launcher · roll
lifecycle · keyboard/focus/touch/size · the shared table), then **five audit
stances** — newcomer, GM at a live table, accessibility, doctrine, and
consistency — read the shipped experience against the source and sixteen
captured frames. Every finding was then attacked by a separate verifier
instructed to kill anything it could not confirm itself; only survivors are
recorded here. A sixth stance (touch/tablet) failed on its first
run, was re-run on its own afterwards, and is recorded whole in §H rather
than merged into the themes — it found one defect (T4) that no other stance
did.*

*This is a design audit of the shipped experience, not a bug hunt — but
several findings are defects, and one is a shipped flow that stopped working
for returning players.*

The app is now one coherent shape: a workbench (sticky bronze well over steel tools, three independent section switches, a rack of saved pools) that authors intent, a 112px launcher that fires it, and a table lifecycle (ceremony → banner/verdict → shelf → log) that spends it — all speaking one notation, one visibility ladder, and one hue law. The week of convergence genuinely landed the hard part: the primary verb is a single constructed object in both views, geometry no longer moves, sections migrate losslessly, and privacy is architectural rather than cosmetic. What the week did *not* do is finish the seams: the draft silently drops the intent the notation exists to carry, the default system (Your Soul Deal) keeps falling through render gates written for sum systems, and the design record — the file every agent is told to treat as authority — is stale on the newest surface it describes.

---

## What is working, and why

Ordered by how load-bearing each is. Items marked ★ are genuinely unusual for a project of this size.

**1. ★ Privacy is enforced by construction, not by discipline.** `projectEntryFor` (server.js:1440) sits on all six egress paths and its redacted branch is a *whitelist construction* naming 14 fields — `values`, `perDie`, `total` and `spec` are absent by shape, so a future field is private by default. `secret` returns `null`, not a blanked record. `entryExistsFor` gates every `rollId`-bearing housekeeping event, and `entryExistsForAll` is deliberately stricter for broadcast-derived fields (the reroll parent id). The physical layer agrees: shrouded dice get an identity face-correction (js/main.js:1211, 1958), so dice nobody can read genuinely have nothing written on them. A whisper naming an absent player refuses the whole roll (`400 unknown_audience`, server.js:1379) rather than narrowing the audience — failure in the recoverable direction. And the dice tower works with no roles because `revealAuthority` is separated from `playerId`: the claimer's own HTTP 200 is projected, so the client that made the request never receives the numbers (server.js:2170-2192). Most multiplayer hobby projects redact in the client; this one cannot leak without someone writing the leak on purpose.

**2. One predicate, one writer, one builder — the choke points that keep ~36k lines honest.** `entryHidden()` (js/main.js:2390, three lines keyed on *values absent*, 18 call sites) is why chips, banner, verdict, log, marker, peek and shelf all handle open/held/secret/whisper with zero per-surface branching. `editPoolById` (js/main.js:6237) is the sole by-id pool mutator — inline editor, popover strip, popover Save, debug hook and import updates all funnel it, which is why a rename cannot fork a duplicate and storage and YAML cannot disagree about shape. `CARD_VERBS` + `appendCardActions` is the same move on the action side: five viewer/mode combinations produce five correct action rows from one table, and the word, `title` and `aria-label` come from the same entry that picks the dress. These three choke points are the app's real architecture.

**3. The roll verb is one DOM object, so the two views cannot drift.** `buildRollCue()` (js/main.js:6451) has seven call sites — the well's button, the empty ghost, the rail plate, two reroll cues, the offer card — and the rail plate's three gradient states are byte-copied from `#tray-actions::after` with the lesson recorded at the site (css:2017: "'match it' is a thing you copy, not a thing you approximate"). Compare `panel-draft.png` with `rail-roll-hover.png`: same word, same tracking, same lozenge rules. Shared construction, not shared intent.

**4. ★ "Flush" and "one click target" are true by CSS structure.** The ROLL plate is `#tray-actions::after` — the plate's edges *are* the tray's edges — with `padding:0` on the well so every pixel is the button, `pointer-events:none` so generated content can't eat its own clicks (the comment names the bug it prevents), and the honesty override (`:has(.die-x:hover)` unpowers the plate, because over a ✕ the click removes). The e2e pins it with `document.elementFromPoint` at four positions (scenarios.mjs:3251) — an assertion about what the pointer hits, not what a class says. Nothing about the appearance can drift from the behavior.

**5. Failure directions are chosen by state shape, not by call-site care.** Sections hide by *off*-classes (`sec-off-*`, css:488), so a JS failure degrades to a fully visible panel; `#cmd` is hidden, never removed, so `paintCmd`'s projection stays live off screen. `sectionsStored` / `sectionsTransient` as two objects makes it *unrepresentable* for a one-visit surfacing to launder into storage. The migration from `dice.inputmode.v1` is a receipt (read once, never rewritten, pixel-identical both directions, asserted in e2e with fresh profiles). `applyImportPlan` contains no delete path at all. `rollRailSelection` fails closed to `secret` on a visibility conflict and strips glue mods *unconditionally* with the reasoning at the site (`4d6dl1 + 2d6` would silently become `6d6dl1`). These are all the same discipline: pick the safe branch structurally.

**6. Geometry is observed, never asserted.** `--draft-h` is written by a ResizeObserver on `#draft-zone`'s `borderBoxSize` (js/main.js:5180), so the sticky shelf-head pin cannot go stale on a save morph or a wrapping chip. Standing furniture uses the real `disabled` property, so keyboard users skip dead stops the eye still sees. `[hidden] { display:none !important }` (css:92) carries a 13-line post-mortem, and the lesson generalized into a suite rule — "pin computed display, never class names" (UX.md:2746) — which is the one doctrine in this audit that changed how tests assert rather than how a surface looks.

**7. The server owns the shared state machine.** `collectEntries` runs before the push with a stated ordering contract (evictions → collections → the roll, server.js:1640); shelf slots are ranks off a monotonic `collectSeq`, not addresses, so reload reconstructs identically; a losing `/api/table` rev is a silent `200 {applied:false}` because the loser of a two-organizer race did nothing wrong. Presence is *asserted* — a `pagehide` beacon naming its `streamId` (so a reload and a close, which fire the identical event, are distinguishable) plus an application-layer heartbeat that ignores what the socket claims. The ghost-seat bug is genuinely closed, in layers.

**8. "The count is the label."** The rail dice list's `d6 → 1d6 → 3d6` is a counter, a notation and the exact wire payload in one token, with the leading `1` deliberately kept ("a counter whose first increment is invisible reads as starting at two", js/main.js:7367). Zero extra chrome, self-teaching. The best single idea on the newest surface.

**9. ★ Input-model care that most shipped apps lack.** `e.repeat` rejected at the top of the global handler (kills held-`r` roll floods and the held-`/` palette bug in one line); `isComposing` bails in both notation editors (IME Enter never rolls); the Esc chain is *one ordered ladder* of fourteen `else if` rungs that mirrors the `--z-*` scale read backwards, so "Esc peels exactly one layer" is structural; accessible names are computed from the parse (`"Roll 3 pools: Wisdom, Swordplay, Zeal"` on the rail plate; `"name, canonical — shelf"` on every rail row), so a screen-reader user gets *more* from those controls than a sighted one. The two menus built as menus (`openSetMenuFor`, `openRailMenu`) are complete: arrows, Home/End, clamping, flip-above, and — the step hand-rolled menus always skip — focus restoration on close.

**10. The record keeps its own failures, where it was maintained.** Supersession threaded at the point of use (§2.6's strikethrough, §7.7.2's inline retirement, the `#g=` post-mortem living inside the goal it killed), first-person post-mortems ("Building on the superseded half was the error"), and rejected alternatives named at decision sites throughout the CSS. This is what makes the places it was *not* done (below) legible as omissions rather than the norm.

---

## What is weak

Grouped by theme, most severe first within each. Every claim carries its evidence.

### A. The draft drops intent, silently — the sharpest cluster in the audit

**A1 (major). The same pool sends two different rolls depending on whether the panel is open.** `rollRailPool` (js/main.js:7547) round-trips the pool through the grammar and fires with everything — dc, moment, visibility, keep/drop, reroll, explode, set. `stageGroup` (js/main.js:6503) — the expanded rack's tap, the digit keys, the primary path — pushes only dice, source label and set. Its `dropped` note is built from `mods` and `dc` alone; **`res.exp` (moment + subtitle), `res.comment` and the parsed visibility are never read** — not dropped-with-a-note, never consulted. So `Sneak Attack = 3d6+2 dc12 cinematic held` fires face-down and cinematic from the 112px rail and lands as a bare open `3d6` in the workbench. This is the exact failure §7.8 names as a GOALS-level notation-totality violation ("a pool meant to be secret rolls in the open on the next machine that opens it", UX.md:1262), failing **open** on a goal-11 surface — while `rollRailSelection` fails *closed* to `secret` on the same data a few dozen lines away. Also silent: the partial stage at the 40-die cap (a chip labelled "Strength" holding half of Strength). **Fix:** write `res.exp`, `res.comment` and `visOfParse(res)` into `boxExtras` — the fields exist and `syncBoxFromTray` already preserves them. Anything that genuinely can't ride must join `dropped`.

**A2 (major). An invalid box plus staged dice rolls the tray, open, with the plate armed and gold.** `usable = cmdResult.ok || tray.length > 0` (js/main.js:5504) arms the plate on staged dice alone; `paintCmd` only syncs when `res.ok`; `rollDraft` falls through to `requestRoll([...tray], formula(tray))` (5563) carrying **no visibility, no dc, no exp, no mods**. Type `2d8 secret`, break it with one character, press the plate: it rolls `2d8` in the open. `offerDraft` has the identical fallthrough (5602). The box's own Enter is correctly gated (6049) — the hazard is the plate click and the global Enter. §1.3's "one spec object, two projections" has no answer for the moment the projections disagree; the safe answer is to do nothing, loudly. **Fix:** when the box is non-empty and the parse fails, disable the plate or route the press to the existing `cmd-shake` + `#cmd-slot` error path.

**A3 (major). `± Modify` cannot modify anything in the shipped default system.** `soul-deal` has `usesMods:false`, and `pop-perdie` folds Modifier, d20 pairing, Target, keep/drop and reroll/explode (js/main.js:7896; `audit-popover.png` shows what's left: Visibility, Moment, Pool stats). The rim's loudest tool says "Modify" with `title="Modifiers, target, moment"` — two of those three are absent by default. It also invalidates the remedy A1's note points at ("re-add via ±" is impossible for `dc`). And js/meanings.js:152-154 still documents `usesMods:false` as "the popover NOTES that modifiers do not change outcomes", while index.html:678 records Joe's superseding ruling ("entirely — no note"). **Fix:** derive the rim button's word and title from `activeSystem()`, and amend the meanings.js interface contract.

**A4 (major). The notation box forecasts a sum total the default system will never show.** `renderCmdState` calls `fmtPreview` with no system gate (js/main.js:5883); under soul-deal, no total ever lands anywhere. The correct branch already exists — the popover's preview at 8446 calls `activeSystem().forecastFor` with a comment claiming coverage of "every ± door alike" — and the app's own Help (index.html:504-523) states the per-die rule the box contradicts on the same screen. **Fix:** wire the popover's branch into `renderCmdState` (also fixes the quick palette).

**A5 (moderate). The well projects only the dice.** `renderTray` builds chips and the cue and nothing else, so `2d8 check dc15 w:Ann # The Duel` is pixel-identical to bare `2d8` — and with Notation off (the default), the only ways to see the dc, moment, comment or whisper are ± (which hides the dc, per A3) or turning the box on. Saved pools got notation carriage precisely so a stored roll couldn't lie about itself; the live draft — the object you are about to spend — has no carrier for intent. This needs a design pass, not a patch (see next steps).

**A6 (moderate). A draft is buildable, editable, spendable, repeatable — and keepable only by spending.** §7.16 retired the rim's Save on the grounds that the peek's "Save as pool…" covers it. Verified coverage: wait out the 3s auto-collect → find an invisible 150-200px circle → right-click (no long-press; iOS Safari never fires `contextmenu`) → find a button in the popover — and the door is additionally gated on `canReroll` (js/main.js:1313, 1611). Meanwhile the creation card accepts only a name and a d4-d20 multiset, and a pure pool's popover early-returns before `Edit notation…` (js/main.js:8178 — the ghost verb exists in the unreachable branch; `beginEditGroup` has exactly one call site, inside it). **Fixes:** add `Save as pool…` to the banner's existing `appendCardActions` fold (wiring, not a new surface); keep `Edit notation…` standing on the pure branch (one `appendChild`).

### B. The default system is a second-class citizen of its own app

**B1 (major). A Check silently drops its stakes on the surface built to declare them.** `1d20+5 check dc15 # The Duel` renders on the verdict card as one chip and a word — no DC, no `+5`, no subtitle — because `hasDc` is gated on `usesTotal` and mod cards on `usesMods` (lifecycle `09-check-verdict.png`). Four surfaces render four different subsets of the same stake: the intent card shows the subtitle but buries the dc in 9px mono; the dock strip (cinematic only) shows the dc because `renderDockStrip` has *no* gate; the verdict card shows none of it; the log shows `+5` but not the dc. The player typed a target and a bonus; the app took both, rolled with both, and showed neither at the moment of the verdict. The gates conflate "this system sums" with "this system has stakes" — they are different facts.

**B2 (major). Crit fanfare is a near-coinflip, and reduced-motion never reaches it.** `soul-deal.critFor` fires when *any* die lands a crit cell; those cells exist on d10/d12/d20, so a 3d10 pool crits on **48.8%** of rolls — each one a full-viewport radial wash plus `container.classList.add('shake')` on `#scene-container` for 1700ms. UX.md:962 explicitly orders "always drop shake/flash/sweep" under `prefers-reduced-motion`; the shipped block scopes to `#ceremony-layer *` and misses both (js/main.js:3452 shakes an element outside the layer; `matchMedia` appears once in all of js/, for `navigator.share`). §2.4 budgets crit as a rare accent; on a d10-heavy Soul Deal pool it is the median outcome, and "excitement outranks physicality" inverts into noise.

**B3 (moderate). The only 52px gold number a Soul Deal table sees is `?`.** `#result-total` is dead for every open roll (`usesTotal` false) and springs to life, in the roll verb's own hue, only to announce an absence — and the banner never says *why* (`Joe · A word in your ear` + `?`, nothing else; the verdict card and log both name the state, the banner is mute). The screen-reader sentence compounds it: `renderRollResults` says `'held'` for a *whisper* (js/main.js:2941) — the one channel a blind player has uses the wrong rung's word.

**B4 (moderate). Dead surface from the meanings migration.** All three profiles define `meaningFor: () => null`, so the non-ledger `#result-meaning` branch, `.pk-meaning`, the verdict's `else if (meaning)` and §2.5's entire hero-slot ruling are unreachable — and §2.5 is still written as live spec.

### C. Legibility, hue law, and the visibility codes

**C1 (major). The app's primary verb is least legible on the surface that owns it.** Measured from the frames: the well's ROLL cue is **1.42:1** empty, **~1.9-2.0:1 armed with a draft staged**; the rail plate — same builder, same word — is **6.2:1 armed** and **2.33:1 disabled**. The workbench's live, armed primary act is dimmer than the launcher's dead one. Cause: the heat ladder caps cue opacity at 0.65 over an already-dim base, while the rail cue ships `rgba(255,215,102,.62)` at opacity 1. §7.21's amendment says "the primary act stands at full opacity"; four CSS lines say otherwise. Either the ladder or the rule is wrong — settle it once. **Fix:** floor the well cue at the rail's value and let heat ride the pocket bloom alone (heat was specified as light-only anyway).

**C2 (major). Live and disabled controls tie at ~2.2:1.** Unpressed section-bar cells measure **2.23:1** (opacity 0.42, which also undershoots 2i-C's own documented 0.45); the genuinely disabled rim tools measure **2.27:1**. 2i-C's three visibility codes collapse to one percept — "off but pressable" and "unavailable" land on the same number — and at 11.5-12px the live cells are a flat WCAG 1.4.3 failure. In the all-off floor state (`panel-all-off.png`) the only route back to the sections is three ghosts at 2.23:1 over ~69% empty column. **Fix:** raise unpressed cells to ≥4.5:1 (~0.72 on `--muted`), push disabled to grayscale(1)/~0.30, and reconcile 0.42 vs 0.45 in whichever direction is intended.

**C3 (major). HUE = ACT breaks three ways in one popover, plus a nine-dress pressed state.** (a) `#pop-save` is the app's *only* `.btn.primary` — the gold roll gradient on a pure save, violating the comment four lines above the rule it breaks ("the gold gradient belongs to the roll verb alone", css:289); the correct `.btn.confirm` dress ships on the adjacent button. (b) Every `.seg` inside `#mods-popover` lights **gold** because the ivory override is scoped `#left-panel .seg` and the popover is body-level — so "Face down", "Cinematic", "kh" wear the roll hue three inches from a panel where the identical control wears ivory precisely so it wouldn't (`audit-popover.png` shows three pressed dresses in one 300px card). (c) App-wide, `[aria-pressed="true"]` resolves to nine distinct dresses across four hue families, selected by DOM ancestry rather than by kind of choice. **Fix:** `#pop-save` → `btn confirm` (one attribute); invert the seg default to ivory with an explicit gold opt-in; tokenize the on-state.

**C4 (moderate). Disabled has thirteen recipes; two collide with resting-dim at 0.45.** Six of thirteen `:disabled` rules carry no grayscale; `#rail-roll`'s bespoke bronze is a fourth visibility code that works well but exists only as an unwritten exception (Joe's own instruction — so *name* it in 2i-C). One base rule plus named exceptions replaces twelve locals.

**C5 (moderate). One dress, two grammars — and the exclusive one destroys work.** `#section-bar` (checkbox, 0-3 lit) and `#rail-mode` (radio, exactly one lit) are styled by the same selector and are indistinguishable. Compounding it: `setRailMode('pools')` executes `railDice = []` (js/main.js:7196, immediately after a comment that says "BOTH PICKS SURVIVE… except this one"), and the digit path repeats the wipe (10954) — three counted taps gone, no undo, from a control that *looks* like the harmless bar upstairs. §7.23 states "Nothing is ever destroyed by navigation" as law; the code destroys twice, and the asymmetry is forced by `railMode()` giving a live dice pick priority *above* an explicit choice. **Fix:** reorder the mode resolution so an explicit choice outranks the pick, then drop both wipes; give the exclusive bar a visibly different affordance (thumb or underline). Note the previously proposed fix (set `railModeVisit` instead of clearing) does not work — the resolution order is the mechanism.

**C6 (moderate). The rail dice rows break the "same 86px box" promise.** A cascade tie (`.rd-item { flex:1 }` at css:1829 loses to `.rp-item { flex:none }` at css:1896, equal specificity, later wins) shrink-wraps the selection box to the label: measured 74.0 / 51.7 / 72.7 CSS px across the frames — the box grows under your finger with every digit. The `.rd-x` remover is anchored to the full-width cell, not the shrunk button, so it floats ~19px right of the row at `3d6` and lands on the label at `10d10x`. This is the third `.rp-*`/`.seg` tie in three commits to silently win against the rail block; the *pattern* is the finding. **Fix:** `.rd-cell .rp-item { flex:1 }`, anchor the ✕ to the button, and add a hover frame to `rail-look.mjs` — `.rd-x` currently appears in zero captured frames.

### D. Accessibility — the largest verified gap

**D1 (major). Ceremony rolls are completely silent to a screen reader.** `#banner-live` is the app's only working live region and it lives inside `#result-banner`, which a ceremony never paints — `stepPlayback` returns into `ceremonyEnterSettle` before `showResults` (js/main.js:2216-2222), and the sole write to the region is on the banner path. The nominal fallback (`aria-live` on `#ceremony-layer`) sits on a hidden container and would announce whole cards, buttons included. Net: every Check and every Cinematic — the rolls carrying a DC, a moment and a subtitle — lands unannounced. **Fix:** a permanently-mounted body-level `sr-live` node, written from the settle stage as well as from `renderRollResults`.

**D2 (major). The two notice channels are silent by construction.** `railNote()` sets `textContent` and clears `hidden` in the same task — the region is out of the a11y tree at mutation time, so the 40-die cap refusal (which exists *because* the collapsed pill is invisible) never announces. `#status-pill` has no `aria-live`/`role="status"` at all, so every table event — "Alice changed the table", refusals, "Bo left" — is a 3-second unannounced string; collapsed, it is a colourless 10px dot (`color:transparent`), and `showSettingsNote` passes no class so it's graphite-on-graphite. index.html:105 documents the exact irony: `#rail-note` was built because "a note sent there would be invisible in exactly the state that sends it" — and the table's notices were never routed to it. **Fix:** one `notify(msg, {scope})` that picks the visible channel from panel state; keep live regions mounted-and-empty, never `hidden`; `role="status"` on the pill.

**D3 (major). Six modal-ish surfaces, zero focus containment, and one dishonest `aria-modal`.** `#help-overlay` is the app's only `role="dialog" aria-modal="true"` and has no trap — Tab walks into content AT has been told doesn't exist (focus real, speech silent). The other five overlays are anonymous `<div>`s; nothing sets `inert`; `#mods-popover` sits after `</aside>` in the DOM, ~26 tab stops from the button that opens it. `#name-modal` — the blocking front door, no cancel, no Esc rung — is the least accessible surface a new player meets. **Fix:** roles + focus-in/focus-back on all six, `inert` the background; until a trap exists, *drop* `aria-modal` from help — an honest un-annotated dialog beats a lying annotated one.

**D4 (moderate, several).** `.cmd-in:focus { outline:none }` with nothing put back — the primary text input and the palette have no focus indicator, the cleanest 2.4.7 failure in the app (the correct swap-for-border pattern ships three times in the same file); no `aria-invalid`/`aria-describedby` on the box's errors. Icon-only foot buttons and `.die-x` are named by `title`, which the accname algorithm never reaches for a button with glyph content — while `.rd-x` and `#edge-toggle` do it right in the same file. `.rd-x` is `tabIndex=-1` beside the comment "a counted row you cannot decrement by touch is a trap" — the identical keyboard trap left standing (Esc clears the whole pick). Popover segments are mutually-exclusive but announce as independent unlabelled toggles — on Visibility, the one control whose mistake cannot be undone; `#zoom-picker` sets both `aria-checked` and the invalid `aria-pressed` on `role="radio"`. Shelf markers are invisible, unlabelled, tabindex-less `<div>`s — the table's history is a flat 2.1.1 failure, and once a roll is shelved the peek is the *only* door to Reveal. No `<main>`, no `<h1>`, no skip link; the workbench is announced as "complementary". Every rail re-render drops focus to `<body>` (picking three pools by keyboard costs three Tab-walks from the top; the expanded rack, via `renderTray`, does not — twins behaving oppositely). No `scroll-padding` under the 203px sticky zone, so Shift+Tab lands focus rings under it (one line: `scroll-padding-top: calc(var(--draft-h) + 34px)`).

**D5 (moderate, touch).** The 44px coarse floor reached only the card-action row (css:4415); the ± popover — reached on touch by the app's hardest gesture, a 500ms hold — is built from 23px seg cells, 23×24 steppers and 30×17 switches. `#offer-pick`'s ID rule beats the coarse bump, leaving ~20px. `.shelf-marker` and `#peek-card` have `contextmenu` only — iOS Safari never fires it on long-press, so a shelved roll's ±, "Open in draft" and "Save as pool…" are unreachable on an iPhone; the long-press helper already exists 5,700 lines up, on pool tiles.

### E. The table: multiplayer seams

**E1 (major). CUJ7 is unreachable for anyone who has used the app before.** *(Filed as "CUJ2" — the PROFILES numbering, which [CUJS.md](CUJS.md) renumbered to CUJ7 on 2026-08-08 because ROADMAP `L1` claimed CUJ2 for a different journey.)* `initNet` prompts for a seat only when `dice.name.v1` is empty, and that key is origin-global. A returning player opening a `&as=Bo` invite never sees the seat picker, never gets Bo's pools; the parameter does nothing. §7.19's "one link in Discord, six people, each landing at the right seat" holds only for six people who have never opened the app — and the `prepared-seat` e2e passes because the harness seeds no name. The only recovery is `Change seat…`, which says nothing about prepared seats.

**E2 (major). Reveal authority and offer ownership are pinned to an ephemeral `playerId` with no fallback.** Lose your stream past the 5s grace, rejoin with a fresh id, and your own held rolls become unrevealable *by anyone*, forever. An offerer who leaves strands an un-withdrawable gold card; a claimed dice-tower offer from a departed offerer whispers to a dead id — a roll nobody can ever see. Rolls got a universal-housekeeping escape once collected (§7.7); offers and reveals did not, for no stated reason.

**E3 (moderate). The collapsed rail deletes multiplayer.** Roster, chairs, Invite, nameplate and offer verb are all expanded-only; the sole browse-mode signal left is `opacity:.68` on the chip with no roster to compare against. §7.4's launcher carve-out covers *offering*; it does not cover *presence*. Meanwhile `poolsOwner` survives collapse (nothing in `applyPanels` clears it), so you can collapse out of Bob's rack, see no signal, and expand straight back into it — and with the Pools *section* off, clicking a teammate pill flips `aria-pressed` and changes nothing on screen (`setPoolsOwner` never surfaces the section; the transient door `loadIntoBox` proves exists was not used). Related: the collapsed rail lists *your* `groups` unconditionally — during a G3 profile swap that is Alice's pools, unlabelled, rolling under your name, and `sec-off-pools` can hide the G3 banner with both its exits.

**E4 (moderate, several).** Copying the invite link has no primary gesture — at a table with one other person the Invite chair is gone and the link lives behind right-click/long-press on a chip whose left-click is a visible no-op; the manual is a `title` touch never renders; no keyboard shortcut touches the table at all. Roster pills shrink to unreadable stubs before `+N` folds (`row-eight.png`: bare dots plus *two* overflow pills). `publishPools` broadcasts your entire rack on every edit with no disclosure, while the one tooltip about pool sharing asserts the opposite ("Pools travel via Settings → Your data → Export"). The change note never names the setting — "Alice changed the table" for a system flip that reinterprets every result. An unnamed table renders its minted key (`drive egw19x`) as the nameplate and tab title, against its own markup comment ("else NOTHING") and against a superseded goal-7 rationale; the marginal *security* cost is nil (the URL bar already shows it) but the presentation is wrong by its own rule. A room that dies (12h linger, `--min-instances 0`) says nothing to the group whose link it was.

**E5 (moderate). `c` sweeps the felt for everyone, unconfirmed, and stays live under two menus.** The `modalOpen` guard's own comment names the hazard and covers one of three menus; `isIdentityMenuOpen()` and `isOfferMenuOpen()` already exist and are absent from it. The log flyout is deliberately un-modal — correct for `r` — but its header button is labelled `Clear`, so `c` pressed while looking at a button that says Clear sweeps the felt instead of the history. Same button means local-and-recoverable online, permanent solo.

### F. Lifecycle reads

**F1 (moderate). The shelf carries no information at rest.** Five collected rolls render as dice plus an invisible glow: `.shelf-marker { background:none; border:none }`, `title` as the entire information channel (never on touch), `.sm-dot` styled in CSS with no producer. You cannot tell who rolled what, what it meant, or which held roll awaits its reveal — and the shelf is *designed* as where a held roll spends its life (js/main.js:1346). With `PEEK_HOVER_MS = 0` and 150-200px targets, dragging along the table's bottom edge fires five 300-460px cards in sequence. The collect-on-anyone's-roll rule is deliberate and documented — do not change it; give the marker the read its role requires (the roller dot is already styled and unproduced; add a shroud glyph for hidden entries).

**F2 (moderate). The peek has the wrong lifetime and the band fights.** The peek closes on nothing a player expects — not a new roll, not a ceremony, not the log — and at z 30 outranks all of them; the repo's own capture run shows it standing through an entire Check. In `19-shelf.png` two cards wear a red `✕ Clear` for two different rolls with nothing marking which is live. In `body.mini` the banner's top edge cuts into shelf slot 2. Also: a dressed roll reads at `top:3vh` for 7s, a plain roll at `bottom:26px` for 3s, and a reloaded Check comes back as a plain roll (`replaySettledRoll` passes `exp:null`) — same roll, three presentations by arrival path.

**F3 (minor, several).** The spectator's banner hover-hold silently does nothing (`armAutoCollect` bails on `!mine`, so the roller's 3s clock yanks the card a spectator is reading). The log row duplicates every source label across two lines — the diagnosis §7.12 wrote and fixed on the other three surfaces, unfixed here, against its own "compact list line" ruling. `LOG_CAP` drops history silently (`dropped` is computed at js/main.js:9082 and discarded). A shelved roll whose log row is gone renders a peek with a live body-click and *no named verb* — the pre-§7.21 defect surviving in an edge state. Spectator reroll is deliberate and defensible, but nothing signals the attribution flip or the shelf eviction it causes. The whisper sub-line "others see you rolled, not what" describes a deliberate, thrice-documented stakes-are-public leak in four words that read as the opposite; the offer-context tooltip UX.md:656 specifies for Only-me was never built.

### G. The record disagrees with the build

This theme has already cost the project shipped mistakes twice (both documented in UX.md post-mortems); this audit found four more of the same shape.

**G1 (major). §7.23 describes a section bar that does not exist — in the commit that shipped it.** The doc, both index.html comments and a second CSS comment all say "no track, no lit cell, weight alone, 0.72/0.45"; the shipped CSS has a track, a lit recess, and 0.42/0.78, with the third iteration recorded *only* in the comment at css:405 ("THE INK MARKS THE CONTROL, THE WEIGHT MARKS THE STATE"). Four stale records to one accurate one, on the newest surface, in a repo whose CLAUDE.md names UX.md the authority. Also dead: `rail-seg` (matches nothing), "104px" in css:1780.

**G2 (major). UX.md §1-6 are largely dead letter with no markers, and §7's 23 subsections sit in commit order with no map.** Verified dead-letter: §1.3's notation-box placement, §1.4's click-to-copy formula (no JS producer), §2.1/2.3's experience records (server refuses the key), §2.4's user-held intent dwell and Roll button (shipped: a 1.35s timer, no button), §2.5's meaning hero (unreachable). Answering "what is true about the rack today" means reconciling §7.9, §7.10, §7.16, §7.17, §7.18, §7.22 and §7.23 by hand — demonstrably how four stale-doctrine findings in this audit survived. **Fix (cheap, high leverage):** a ~30-line "WHAT IS TRUE TODAY" table at the head of §7, one row per surface naming the one authoritative section; move or banner §1-6.

**G3 (moderate).** §7.15's one-✕ machinery is fully retired in code and still cited as live doctrine from two places in §7.9. §7.17 still says `SAVED POOLS` stands over the rack (deleted; only the CSS comment records it) — and the deletion took the dice-value ledger's caption with it: the whole-rack `.ph-fig` never renders (`#pools-head:not(.foreign){display:none}`), the shelf figures are four bare integers with no unit, **and the `rack-dice-value` scenario still passes because `textContent` of a `display:none` node reads fine** — the exact inverse of the build-not-hide lesson §2l recorded. §7.7/§7.9 still spec a shelf-marker dot that ships invisible. GOALS' Uniform-roll-surfaces invariant has no launcher carve-out while GOALS is the document that wins ties — the shipped rail is formally out of compliance with the file every agent reads first.

**G4 (moderate). `1 2 3 Enter` — the roll the design says this surface exists for — cannot be typed on the rack the app deals.** `dealStartingRack` seeds 9 attributes, then skills at ordinal 10 and motivations at 16; ordinals render only for `ord ≤ 9`, and there is no reorder affordance. UX.md asserts the claim in the paragraph *directly above* the dealt-rack amendment that broke it (1536-1539 vs 1542-1563), and the code comment at js/main.js:10948 advertises a sequence that now means Strength + Wit + Intelligence. Either interleave ordinals across shelves or amend both records.

**G5 (minor). The look tools don't look at what ships.** Both fixture a hand-authored 12-pool sheet the app never deals (the real rack is 18 pools and scrolls below ~975px with `scrollbar-width:none`); no frame shows a populated roster, a live `#rail-note`, a hovered `.rd-x`, a spent draft, or an invalid box; the presence row is the one geometry that moves (wraps at 3-4 players) and no capture shows it. §7.22's own closing rule is "Run it, and look, before calling a visual change done."

Two things stated because they are results: the **terminology sweep** found only one real contradiction (one button labelled "shelf" with a tooltip saying "category"; "section" and the code-internal "shelf" are not player-facing collisions — but the e2e's banned-word regex omits "category" and sweeps none of the result surfaces, which is the durable half). And the **transport** (portable.js) survived every stance intact — union-only, preview-enforced, verified stash — with one real hole: for a system whose durable copy is a file, *restore from that file* is the one operation it does not offer (no replace-rack, no bulk delete, refusal-wholesale at the 40 cap), and the rack has no door to its own transport (four levels deep, with the verbs spelled `Fill with my data` / `Download` / `Apply import` beside `Apply to table`).

---

## The structural risks

These are bets, not bugs. Each will get more expensive to reverse.

**1. System capability flags as scattered per-surface render gates.** `usesTotal`/`usesMods` are consulted independently at every render site — verdict card, banner, log, dock strip, popover, preview — and every one of themes A and B's system findings is the same failure: a gate written for sum systems, applied or missed one call site at a time (the dock strip shows the dc because its author forgot the gate; the box shows a sum forecast because its author never added one). The default system is the one that exercises the `false` branches, so Joe's own game is where the drift lands. The durable fix is not more gates but an inversion: the system profile should *supply* the renderers (it already does for `forecastFor` and `outcomesFor`) rather than surfaces querying booleans. Until then, every new result surface will re-litigate what a per-die system shows, and lose somewhere.

**2. Identity anchored to browser storage shape.** Three separate top-severity findings are one bet: `dice.name.v1` origin-global (kills CUJ7 for returning players), `playerId` minted per-join with `sessionStorage` resume only (orphans reveals and offers), `dice.roomsettings.v1`/`dice.log.v1` global-not-room-scoped (the lobby wears the last table's interpretation system). GOALS §7 explicitly defers persistent identity to "a later pass" — fine — but the current keys are load-bearing for *authority* (revealAuthority) and *routing* (the seat door), not just convenience, and each new feature that pins to them deepens the hole. The later pass should be scheduled before the next feature that needs a stable "who".

**3. The size question: main.js is large; UX.md is failing.** js/main.js at 12.6k lines is *merely large*. The audit is the evidence: six stances traced every path through it and the choke-point architecture (one writer, one predicate, one builder, one Esc ladder, one keydown handler) held — findings were located to single lines quickly, and no finding was caused by the file's size. The real observed costs are cascade ties (three `.rp-*` collisions in three commits, from one 4.5k-line stylesheet with no token layer) and focus-loss on innerHTML-rebuild renderers — both fixable without a split. **docs/UX.md at 3.1k lines is a different story**: its append-only §7-in-commit-order structure has now produced two shipped-on-superseded-doctrine incidents (self-documented) and four more stale-authority findings in this audit. The document, not the code, is the thing whose structure is actively generating defects. Restructure the doc first; split main.js only when a change actually gets harder because of it, which has not yet been demonstrated.

---

## What I would do next, in order

### Cheap and clearly right

1. **Carry intent through `stageGroup`** — write `exp`, `comment` and parsed visibility into `boxExtras`; name anything undroppable in the note. Closes the fail-open privacy hole and the expanded/collapsed behavioural fork in one change. *(small)*
2. **Refuse the invalid-box roll** — non-empty box + failed parse disables the plate (or shakes); stop silently substituting the stale tray. *(small)*
3. **The WHAT-IS-TRUE-TODAY table + four amendments** — head-of-§7 authority table; rewrite §7.23's bar paragraph from the css:405 comment; banner §7.15; amend §7.17 and the shelf-marker spec; add the launcher carve-out sentence to GOALS. Cuts off the defect class that has now bitten six times. *(small-medium)*
4. **Live-region triage** — body-level sr-live written from ceremony settle; `role="status"` on the pill; never-`hidden` regions; route refusals/notes through one `notify()` that knows the panel state. Fixes D1 + D2 together. *(small)*
5. **Hue-law one-liners** — `#pop-save` → `btn confirm`; invert the `.seg` pressed default to ivory with gold opt-in; floor the well cue at the rail's 0.62 gold; raise unpressed section cells to ~0.72. *(small)*
6. **Gate the box preview on `forecastFor`** — wire the popover's existing branch into `renderCmdState`; fixes the palette too. *(small)*
7. **Rail dice cascade + ✕** — `.rd-cell .rp-item { flex:1 }`, anchor `.rd-x` to the button, drop its `tabIndex=-1`, add the hover frame to rail-look.mjs. *(small)*
8. **Reduced-motion the crit** — add `.shake`/`#crit-text`/`#crit-overlay` to the block *and* gate the class in `playCritEffect` on `matchMedia`. *(small)*
9. **Long-press on `.shelf-marker` and `#peek-card`** — the helper exists on pool tiles; closes the iOS hole and the GOALS uniformity gap. *(small)*
10. **Guard scope + labels** — add the two menus to `modalOpen` (predicates exist); rename the flyout's `Clear` to `Clear history`; surface the `dropped` count the log already computes. *(small)*
11. **`Save as pool…` in the banner fold** + keep `Edit notation…` on the pure-pool branch. Both are wiring into existing builders. *(small)*
12. **Re-fixture the look tools with the dealt rack** and add the missing frames (populated roster, live rail-note, spent draft, short collapsed viewport). *(small)*

### Needs a design pass first

13. **Draft intent in the well** (A5) — the composing surface needs a carrier for dc/moment/visibility chips; interacts with the cue band and heat, so design before code. *(medium)*
14. **Crit frequency under soul-deal** (B2's other half) — 49% is a chart/threshold question, not a rendering one; decide what "crit" means for a d10 pool. *(design, then small)*
15. **The verdict card's stakes** (B1) — decide what a per-die system's Check *shows* (dc as a stake even without a summed verdict?), then apply it to all four surfaces at once. *(medium)*
16. **Returning-player seat flow** (E1) — an `&as=` link should reach the picker despite a stored name; decide the interaction between origin-global identity and per-table seats. *(medium)*
17. **playerId succession** (E2) — reveal/offer authority needs either seat-based fallback or the universal-housekeeping escape rolls already have. *(medium)*
18. **Shelf read-at-rest** (F1) — produce the styled-but-orphaned `.sm-dot`, add a shroud glyph; decide how much read the shelf owes before touching peek lifetime. *(small-medium)*
19. **Collapsed-view presence** (E3) — what minimum social state does the launcher owe? At least: a browse-mode signal, and clearing `poolsOwner` on collapse. *(medium)*
20. **Ordinals vs the dealt rack** (G4) — interleave, or re-scope the promise; either way fix both doc sites and the code comment. *(small, but it's a design decision)*
21. **Modal semantics + focus pass** (D3/D4) — roles, traps, `inert`, focus restoration on the rebuild renderers, `scroll-padding-top`. Mechanical but broad; batch it. *(medium)*
22. **Token layer for the doctrine** — `--dim-rest`/`--dim-off`/`--drain`, `--on-fill`/`--on-ink`/`--on-ring`, three die-art sizes, one `--label-sm` recipe. This is what makes C2-C6 stay fixed. *(medium)*

## What NOT to do

- **Do not make the section bar sticky.** The 31px-permanent argument (index.html:225) is sound; the crowding fix is letting `#draft-zone` collapse toward the rim when the draft is empty — the ResizeObserver makes the shrink structurally free, and it returns 114px in exactly the state with nothing to show.
- **Do not add a confirmation dialog to `c` / Clear table.** Goal 10 makes sweeping the felt everyone's right, and the table should stay fast. The verified defects are guard scope and a colliding label; fix those. A confirm would tax every legitimate sweep to protect against a typo the guard already almost catches.
- **Do not badge visibility on every result surface.** The un-badged ruling (UX.md:659) is reasoned and correct — the mode is never sticky, and composing-time announcement ships. The gap is retrospection only; one muted token in the log row (derived from `entry.visibility`, reusing `offerVisText`) answers it without reopening the ruling.
- **Do not change the server's collect-on-arrival rule for held rolls.** It is deliberate, documented at the call site, and the shelf is the *designed* home of a held roll. The defect is that the shelf can't show it — fix the marker, not the state machine.
- **Do not give the rail Offer or full intent editing.** The §7.4 launcher carve-out is right: a launcher fires intents authored elsewhere. The fix is putting the carve-out sentence in GOALS, not bringing the rail into compliance with an invariant that should be amended.
- **Do not unify the two bars by making the rail multi-select, and do not suppress the leading `1` in the dice counter.** Exclusivity is correct for a mode switch and the counter's grammar is correct as shipped; the fixes are a distinct dress for the exclusive bar and an end to the state-destruction, not grammar changes.
- **Do not make import destructive.** Union-only, preview-then-merge is the load-bearing lesson of the `#g=` post-mortem and it held up under every stance. The missing operation is an *explicit, separately-named* "replace my rack from this file", not a sharper Apply.
- **Do not split js/main.js as a reflex, and do not reach for a framework.** Zero-dependency single-file is upholding its end — the audit traversed it six ways and the architecture held. The document that needs restructuring is UX.md. Split the code only when a specific change is demonstrably harder because of the file, and record that demonstration when it happens.

---

## H. Touch and tablet

*This stance errored on its first run (a structured-output failure, not an
empty result) and was re-run on its own afterwards; its findings were not
available to the synthesis above, so it is recorded whole rather than merged
into themes A-G. Conversion used throughout: 1 CSS px ≈ 0.265 mm, so the
44px guideline ≈ 11.6 mm and a 9 mm finger pad ≈ 34 CSS px.*

*It found the one defect no other stance did — **T4**, a touch path that is
dead code — and one structural result worth pulling to the front:* **seven
of the eight `(pointer: coarse)` blocks in the stylesheet fix *visibility*
and only one fixes *size*.** *That is the shape of the whole theme: touch was
given things to see, not things it can hit. The two clearest cases are `.die-x`
and `.rd-x`, both made to STAND on coarse pointers by rules written to make
them reachable — while staying 20px and 18px.*

### What is working (touch)

**The roll verb is the one thing sized for a thumb at both scales, and it got
there by *removing* padding rather than adding a rule.** `#tray-actions
{ padding: 0 }` (css:751) exists so "every pixel of the tray — pocket AND
plate — is the same click target"; `.tray-line2 .tray-roll { min-height:
113px }` (css:702) makes the expanded roll a 274×113 slab, and the collapsed
twin `#rail-roll { min-height: 44px }` (css:1970) is full-width in an 86px
column. Hit-first-time at both sizes, no aim required.

**The card action row is the only surface with a real coarse *size* rule, and
the mount structure makes it land everywhere.** css:4415-4419 raises
`.card-act` and the `.pk-strip`s from 34px to 44px; because
`appendCardActions`/`mountCardActions` (js/main.js:3040, 3086) always build
the Reveal into a `.banner-foot` and the reroll into a `.pk-strip`, banner,
peek and verdict all inherit it — and `.sm-reveal`'s `body.mini` rule
(css:3240) touches only font and padding, so it cannot undercut the
min-height. Pinned by `named-verb-touch`.

**Shelved rolls carry an invisible 76px hit disc over a layer that refuses
pointer events.** `#shelf-layer { pointer-events: none }` with
`.shelf-marker { width: 76px; height: 76px; pointer-events: auto }`
(css:3183-3194) — 2.4× the visible dot, and the felt behind it never steals
the press. Still 56px in `body.mini`, which is the state a collapsed-panel
tablet always lives in.

**Both die grids clear the guideline on geometry alone, with no touch rule.**
`.tile-stage { min-height: 64px }` in a 3-column grid gives ~87×64 tiles;
`#die-buttons` at `repeat(4, 1fr)` with `padding: 8px 2px` gives ~64×63. The
two surfaces a player touches most are the two that never needed a special
case.

**The pool-tile long-press is a correct implementation, not a stub.**
js/main.js:7053-7095: a 500ms timer, 10px move-cancel via `pointermove`,
`pointerup`/`pointercancel` teardown, an `lpFired` flag suppressing the
synthetic click, and the native Android `contextmenu` handler clearing the
timer so the door cannot double-toggle. Pinned by `sheet-touch`. **This is
the reference implementation the other three touch doors should have used.**

**Pinch-zoom is left intact**, which is what makes every undersized target
below *recoverable* rather than impossible: index.html:20 is
`width=device-width, initial-scale=1` with no `user-scalable=no` and no
`maximum-scale`.

### What is weak (touch)

**T1 (major). The only pointer path to collapse/expand is a 14px strip.**
`#edge-toggle { width: 14px }` (css:236) — 3.7mm against a 9mm pad — and
js/main.js:10613 calls it "the one pointer target for collapse/expand (the
title row died with the overlay; keys n/m keep their muscle memory)". The
chevron inside is an 11px glyph pinned at `top: 14px`, so there is no visual
centre to aim at over a 768px strip. A miss right lands on the felt
(harmless); a miss left stages a pool or picks a rail row. **Fix:** keep the
14px *ink*, widen the *target* — a coarse-only `width: 32px; margin-right:
-18px`, or a `::before` extending 18px into the felt side, which has no
competing handler.

**T2 (major). Every control in the collapsed column except the roll plate is
under half the guideline.** In an 86px content box: `#rail-mode` cells
**39×23** (css:1797) — §7.23 itself calls this "a 39px control a thumb's
width above the first row"; collapsed foot glyphs ⚙ ≣ ❯ ✕ **≈19×27** at
`gap: 2px` (css:1760-1766), where the CSS comment sizes them so "the four
come to ~80px" — a *width* budget that never considered touch;
`.rp-item { min-height: 38px }`, 6px short and the only one of the three
that is defensible. This is the state a tablet lives in, and it is the least
touch-ready surface in the app. **Fix:** the foot has 6px of slack (80 of
86) — spend it (`padding: 10px 2px` → ~35px tall, inside budget); bump
`#rail-mode` to `padding: 11px 2px` (39×35), which has vertical room.

**T3 (major). The ± popover — where every roll axis lives — has no coarse
branch at all.** Measured, all exact: `.stepper button` **23×24** (css:3839)
· `.sw` switch **30×17** (css:3843-3845) · `.seg button` ≈23 tall · `.mchip`
≈23 · `.pid-cat` ≈21 · `.pop-close` ≈17×21 · `.pid-rank` 38×38. The `.sw` at
17px is 4.5mm — the worst control in the app, and it is also the sound toggle
in Settings. `audit-popover.png` shows four Visibility cells sharing 268px at
23px tall. **Fix:** one coarse block; the popover is 312px wide with
`overflow-y: auto` and can afford the height.

**T4 (major, DEFECT). The identity chip's long-press opens the menu and the
release-click immediately closes it — the touch path is dead code.**
js/main.js:11683-11695 arms a 500ms timer calling `openIdentityMenu()`, but
the `click` listener at js/main.js:11664 reads `if (isIdentityMenuOpen())
closeIdentityMenu();` and fires on the same release. Unlike the pool tile
there is no `lpFired` suppressor. On touch: hold → menu flashes → gone. This
is the **only** path to *Change name…*, *Change seat…* and *Leave table*
(index.html:370-378) — `Copy invite link` has a second home as a
`.rail-ghost`, the other three do not. The long-press also lacks the 10px
move-cancel. **Fix:** copy the pool-tile pattern verbatim.

**T5 (major). Two `contextmenu`-only doors have no long-press, and iOS Safari
never fires `contextmenu` on long-press.** The four registrations:
js/main.js:1306 (shelf marker → `openShelfPopover`) **no long-press** ·
js/main.js:1611 (`peekEl.oncontextmenu`) **no long-press** · js/main.js:5677
(the well → `#tray-mods`, fine, it has a visible equivalent on the rim) ·
js/main.js:7090 (pool tile, has one). So a shelved roll's *tweaked* reroll is
unreachable on iOS. A plain reroll survives via the peek's 44px strip, so the
loss is bounded — but silent. **Fix:** factor a shared
`attachLongPress(el, fn)` and attach it to the marker and the peek; both
already `preventDefault()` in `contextmenu`, so Android is unchanged.

**T6 (moderate). Seven of eight `(pointer: coarse)` blocks fix visibility;
one fixes size.** Full list: css:543 `.die-x{opacity:1}` · css:893
`.draft-actions .btn{padding}` · css:1380 `.ghost-add` · css:1852 `.rd-x
{opacity:.75}` · css:2397 `.rail-menu-forget` · css:3387 `.log-again` ·
css:3410 `.reveal-tier` · css:4415 the 44px card-act block. The two worst
outcomes are both removers made to *stand* on touch while staying tiny:
`.die-x` **20×20** (css:527) overlaying 34px die art with no gap between
neighbours, and `.rd-x` **18×18** (css:1831) absolutely positioned **on top
of the row that increments**, occupying x∈[64,82] of an 86px row — a finger
centred anywhere left of that adds a die instead of removing one. §7.23
argues it must stand "because a counted row you cannot decrement by touch is
a trap"; it made it visible, not tappable.

**T7 (moderate). The rim's coarse bump reaches 32px, misses `#tray-mods`
entirely, and is out-specified on `#offer-pick`.** css:893 yields ≈32px, 12px
short. `#tray-mods` carries **no `class="btn"`** (index.html:196), so the
coarse selector never matches it — it survives only because
`.draft-actions { align-items: stretch }` pulls it to row height, which is
accidental. And `#offer-pick { padding: 4px 6px }` (css:891) is specificity
**(1,0,0)** against the coarse rule's **(0,2,0)**; media queries add no
specificity, so the id wins regardless of order and the targeted-offer
chooser stays **≈21px wide**. This is the one place in the file where an
id-scoped rule beats a coarse bump.

**T8 (moderate). A 24px destructive ✕ sits 2px from the tile corner and 6px
from the neighbouring tile.** `.tile-del` 24×24 at `top/right: 2px`
(css:1234-1245) inside a `.pool-grid` with `gap: 6px`; in manage mode the
tile body opens the editor and its corner deletes the pool, with no confirm
(js/main.js:7107-7112 filters and saves immediately). The CSS comment says it
was "grown to 24px (grow the target, never multiply it)" — right instinct,
stopped short. **Fix:** 40×40 flush to the corner on coarse, plus an undo or
a two-tap arm.

**T9 (moderate). Every pill in the presence row is ~24px tall, including the
app's three exits.** `.roster-name { padding: 4px 10px; font-size: 12px }`
(css:2181-2196), and `.rail-ghost` copies it to the pixel (css:2236-2250) —
covering browse-a-teammate, `Invite`, `+ New table` and `Tables ▾`, which is
exactly what a first-time tablet user meets. `#rail` is `flex-wrap: wrap`, so
the row absorbs growth by wrapping rather than overflowing.

**T10 (moderate). No short-viewport branch, and the sticky workbench takes
30% of a landscape tablet's panel.** Measured `.draft-zone` = **203px**
(167px with the rim hidden). At **1024×768 landscape**: 654px of panel body,
minus 203 sticky → 451px of scroll; section bar (46) + palette (152) + `#cmd`
(~50) = 248, leaving **≈203px for the rack** — about two tile rows. Usable,
but the whole rack is behind a scroll on the device with the most screen. At
768×1024 portrait it is comfortable (707px). The `@media (max-width: 640px)`
branch is **one rule** that computes to no change at 640px and only bites
below 372px — neither tablet orientation ever enters it, and **nothing
anywhere keys off height**. **Fix:** a `max-height` branch that trims the
well rather than the rack; `--draft-h` is recomputed from `offsetHeight`, so
the sticky shelf-head offset follows automatically.

**T11 (moderate). Every text input is under 16px, and the panel foot is
pinned behind the software keyboard.** `.cmd-in` 12.5px (css:3499), `.tin`
12px, `.pid-name-input` 13px, `.new-shelf-input` 12px, `.portable-text` 11px,
`.btn-row input` 13px. iOS Safari auto-zooms the layout on focus for any
input below 16px — so tapping the notation box, renaming a pool or naming a
shelf all jolt the whole table. Separately, `#left-panel { position: fixed;
top: 0; bottom: 0 }` (css:150-153) with no `dvh` unit and no
`interactive-widget=resizes-content` means `#rail-foot` sits under the
keyboard whenever any of those is focused.

**T12 (minor). The keyboard-parity audit comes back mostly clean.** Reachable
on touch: `1`-`9`, `Enter`, `/`, `l`, `c`, `r`, `s`, and `m`/`n` (only via
T1's 14px strip). Esc's peel chain has a touch twin at **every** rung —
backdrop tap, pointerdown-away, `.pop-close`, re-tap the marker, re-tap the
row, `✕ Clear`. Correctly moot: `?` (its content is keyboard shortcuts) and
the `.pool-ord`/`.rp-ord` hints (they advertise a keyboard affordance). **The
one real gap is `.tile-add`** (css:1224-1232) — the `+` whisper that is the
only thing saying a rack tile *stages into the well* rather than rolling. It
is `opacity: 0` at rest, hover-only, no coarse branch, so on touch nothing
distinguishes a rack tile (stages) from a `.pool-roll` strip (rolls
immediately). This is the cheapest coarse addition and the only one that
teaches rather than enlarges.
