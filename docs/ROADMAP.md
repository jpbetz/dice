# Roadmap

Implementation order reflects dependencies and effort. Items marked *(in
progress)* are being built now.

## 1. Corner controls *(in progress)*

Two persistent icon buttons pinned bottom-right in **both** modes: a
mini/expand toggle (`⤡` in full view, `⤢` in mini) and `✕` clear table.
Mute and Log stay top-right; the mini bar keeps only group pills.

## 2. Change player name *(in progress)*

Click your own name in the players panel to edit inline; Enter commits.
Updates localStorage and `POST /api/rename` → `player-renamed` broadcast.
Past log entries keep their historical name. Solo mode edits the stored name.

## 3. Roll mechanics core *(in progress)*

One coherent engine + UX for everything that transforms a dice pool. Clicking
a group roll stays a plain roll; a `±` button per group opens a compact
popover:

- **Modifier** — quick chips (−3…+3) plus a stepper for bigger values.
  Total shows as `17 = 14 + 3`; the Soul Deal meaning reads the modified
  total (column from the counting dice).
- **Advantage / disadvantage** — each d20 in the pool is rolled twice,
  keep highest/lowest; the discarded die lands on the table too, shown
  struck-through on its chip and in the log.
- **Keep / drop** — kh/kl/dh/dl with a count, applied across the group's
  dice ("4d6 drop lowest"). Discarded dice render like advantage discards.
- **Reroll low** — "reroll ≤ N" once per die (Great Weapon Fighting);
  the replacement die is physically thrown, the original struck through.
- **Exploding dice** — a die landing on its max face throws a bonus die of
  the same type (chain cap 3), marked ✴ on its chip.
- **Face-down rolls** — the roles-free blind roll: dice land normally but
  chips/banner/log show `?` to everyone; the roller clicks Reveal to flip it
  for the table. (Values technically land face-up on the 3D dice — the
  hidden layer is the readable UI, which is fine for friendly tables.)
- **Offered rolls** — "Offer to table" broadcasts a prepared roll card
  (label, dice, mods) to the room; any player can execute it once, and the
  roll attributes to whoever clicked. No DM roles.
- **Reroll last** — `⟳` on the banner and log entries repeats that roll's
  full spec.
- **Probability preview** — the popover shows the spec's min / avg / max
  before rolling (Monte Carlo, client-side).

Server: `/api/roll` accepts a `mods` spec, composes the physical dice list
(advantage pairs, reroll replacements, explosion children), marks per-die
metadata (discarded / exploded / rerolled-from), and returns the
authoritative total. All value generation stays server-side.

## 4. Dice color customization

Precedence: individual die > group > player > die-type default. Players
inherit their assigned color and customize from the players panel; group
rows get a swatch. dice.js material cache re-keyed to `(type, color)`; roll
events carry resolved per-die colors so all clients match.

## 5. Settings panel: local + global scopes; background

Gear icon → modal with "Just you" (mute, mini preference, own dice color)
and "Everyone at the table" (felt/background theme) sections. Globals ride a
`settings` SSE event, included in `hello`. Any player may change them. Solo
mode persists globals locally.

## 6. Graphical build-a-tray

Die-type buttons and tray chips become images of the actual dice: render
each mesh once to transparent offscreen thumbnails at startup (regenerate on
color changes). Stretch: slow-spinning live die on hover.

## 7. Per-player roll mats

Global setting splitting the table into per-player labeled areas; throws
target the roller's mat. Mat color/style is per-player but visible to all
(rides #5's settings sync). Corner `✕` clears your mat; long-press clears
all. Depends on #5.

## 8. Success counting + special dice

Dice-pool success counting ("7d10, count ≥ 8" → banner shows successes,
Soul Deal chart skipped), Fate/Fudge dice (+/blank/−), coin flips, and a
d100 convenience reading d10x + d10 together as 1–100. Needs dice.js custom
face sets.

## 9. Initiative helper

One shared "roll initiative" action; everyone's roll collects into a sorted
order list visible to the room until cleared.

## 10. Roll statistics (local)

Per-player distribution and average-vs-expected from locally retained
history (local-only, preserving statelessness).

## 11. Log export

Copy/download the session log as text/CSV.

## 12. Save-variant + formula codec extension

Groups carry modifiers/options ("Attack=1d20+3", advantage flag) in the
formula and the `#g=` URL codec; "save as variant" in the popover.
Follow-up to #3.
