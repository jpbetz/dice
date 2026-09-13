<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Redesign: human observation and physical-device sheet

Copy this sheet for each session. It supplies the practical recording form for
[R1's success walk](PEOPLE-DICE-TABLES.md#10-validation-and-the-success-walk) and
[R2/R3's named moments](EXPERIENCE-REDESIGN.md#what-each-investment-must-prove).
CUJ references use the existing [journey definitions](CUJS.md#the-journeys).
This blank form records no completed observation and sets no new time, frame-rate
or battery acceptance budget.

## Prepare the session

- Record the reviewed build and exact reachable origin. The durable portion
  requires an enabled, reviewed staging service; use the
  [enablement checklist](ACCOUNT-ENABLEMENT-CHECKLIST.md), not an assumption
  that an available guest table has accounts. If unavailable, mark that portion
  **Not run** and complete guest play separately. Never use port 8123.
- Use disposable participant accounts/libraries and aliases A/B/C/D. A is a
  newcomer, B the invited player, C a returning Soul Deal guest; add D for the
  four-player read. Record each person's actual prior familiarity. Prepare C's
  existing fixture library and an export for exact before/after comparison;
  do not clear someone's real library to create a fresh visitor.
- Run the uncoached session first. Give one goal below at a time, without naming
  controls, demonstrating a route or showing the implementation screenshots.
  If help becomes necessary, record the question, assistance and where it began;
  subsequent completion is **Assisted**, not uncoached success. Record behavior
  and the participant's words separately from the observer's interpretation.
- Keep recovery/contact keys outside this sheet and captures. Arrange a separate
  clean browser/profile for A's return and a reviewed operator-controlled restart
  of the disposable service. All fixture clients must leave before that restart;
  do not restart an occupied non-fixture service. See the
  [staging return proof](ACCOUNT-OPERATIONS.md#staging-and-first-enablement).

## R1 task prompts — give goals, not routes

The observer checks the consequence in the last column after the attempt. UI
routes and automated setup belong in the later technical pass.

| Task | Prompt | Observer check / existing CUJs |
| --- | --- | --- |
| 1 | “Make your name appear as the name you want the group to use.” | Name changes without changing seat or character library. CUJ1–2. |
| 2 | “Choose dice you like. Try them privately first, then use them for your next roll.” | Practice produces no shared result; the chosen art appears on the next roll. CUJ8–9. |
| 3 | “Roll two six-sided dice with a bonus of three. Keep this roll so you can use it again.” | `2d6+3`, faces, attributed modifier and total are understood; useful roll is saved deliberately. CUJ1, CUJ8, CUJ13. |
| 4 | “Give this table a name you will recognize, and get B into the same table.” | Same name/address, matching values and roller attribution; capture first shared-roll time. CUJ2–3, CUJ11–12. |
| 5 | To C: “Join them using your existing Soul Deal library and make a roll. Keep playing as a guest.” | Existing profile IDs, content and stored systems remain; the joined table uses its shared interpretation. No account requirement. CUJ3, CUJ7–8, CUJ13. |
| 6 | To A: “Keep your dice and saved rolls so you can recover them elsewhere. Keep this table for the group's return.” To B: “Make it possible for A to invite you inside the app after you leave.” | A keeps the kit/home; A and B establish recoverable fixture identities and a friendship before leaving. B need not enable library sync; C remains a guest. Identity, sync, home capture and contact consent stay separate. CUJ2, CUJ4, CUJ13. |
| 7 | After every client leaves and the operator restarts: “From this clean browser, recover your kit and return to that table.” | Same saved name/address/setup and private kit, without an old client repushing them. Saved home does not promise old roll history. CUJ3–4, CUJ13. |
| 8 | While B has no open app: “Invite B back from inside the app.” Then to B, after recovering the fixture account with an unfinished private turn prepared at another table: “Respond to the invitation while keeping this turn. Enter the invited table when you are ready.” | Inbox survives absence; acceptance preserves current seat, URL and turn; a separate Join changes tables. CUJ2–4, CUJ10. |
| 9 | “Return together, including C as a guest, and each make another roll.” | A/B/C agree on visible values and attribution; C's entire kept library still matches its original export. CUJ8–9, CUJ11, CUJ13. |

Time to first shared roll runs from A's first usable table appearing to B first
being able to read A's same attributed result. Record both timestamps, navigation
or connection waits, and any assistance. Task time runs from the prompt to the
participant saying they are done; record whether the consequence was actually
achieved. Do not convert these observations into a pass/fail speed threshold.

## R2/R3 technical pass — actual laptop and phone

After observation, the facilitator may arrange fixtures and demonstrate controls.
Record actual device dimensions/DPR; do not resize a desktop to 390px and enter
it as a phone. Keep all compared viewers foregrounded except the deliberate
background test. Predeclare repetitions and mode order below; retain every trial.

| Moment | Arrange and record |
| --- | --- |
| Four-player ordinary play — CUJ8–11 | Four independent viewers; use ordinary `2d6+3`, `4d6`, `4d20` and `1d20` rolls. Inspect Copper, Navigation and Stone: entry, tumble, reveal, rest, a second arrival and the next Roll. Ask who rolled and which latest results are comparable; record unreadable names, arithmetic, clipped dice and occlusion. |
| Phone tasks and keyboard — CUJ1–3, CUJ8–9, CUJ13 | First roll; name editor with the real software keyboard; gallery/practice; setup preview; incoming roll while a task is open; four-player result after closing the sheet. Include portrait/landscape and short-window history. Photograph the actual keyboard and scene boundaries. |
| Shared and private turns — CUJ8, CUJ10–11 | Keep/rethrow/bank an unfinished turn; queue another player's roll; use held and secret fixture rolls. Compare ordinary and Instant viewers. Record early disclosures, wrong ownership or lost choices; legitimate Reveal must still work. Instant may finish first but must show the same authored result. |
| Cold/warm starts and optional use — CUJ1, CUJ9 | Declare exactly what “cold” means: fresh fixture profile, HTTP cache state and whether the browser process restarted. Record navigation-to-usable-table, first Roll, and first gallery/practice/table-model use. Repeat warm. Separate encoded/decoded/transfer bytes from elapsed readiness; a small download is not a faster shader compile. |
| Ordinary versus stress — CUJ8–9 | Keep four-player ordinary samples separate from `40d20` stress; inspect `40d4` at close zoom for the edge/entry case. Record scene, zoom, dice set, existing settled dice and the actual server seed/roll ID. Reuse the seeded reference workload only in a separate technical fixture; do not alter a shared result to force a seed. |
| Full / Battery saver / Instant — CUJ8–11 | Pair Full and Battery on the same cast/scene/pose when measuring render work, including Copper with animated Black Anvil dice; separately compare Instant on/off. Inspect readable artwork/results, active work, settled idle, real background/foreground, and the first input/SSE/reveal after rest. Record pending model loads and whether a worker or inline fallback ran. |
| Voice chat and sustained use — CUJ8–11 | Repeat the declared ordinary/stress cases alongside the participants' actual voice-chat setup. Record app/device used for chat, audio interruptions, elapsed session time, thermal/power conditions and profiler overhead. Battery percentage alone over a short session does not establish battery-life improvement. |

Use the device's available browser/system trace profiler and screen recording.
Record the profiler/version and mark unsupported metrics **Unmeasured**. Identify
Roll input, first visible feedback, film preparation, first painted dice and
complete result separately. Report the longest main-thread task and actual
presented-frame pacing; a `requestAnimationFrame` callback count is not proof of
displayed frames. Keep profiling and ordinary observation trials distinct.

Existing read-only inspection points are `window.__diceDebug.renderAudit()`,
`window.__diceDebug.filmWorker`, `currentRoll.seed` and `currentRoll.rollId`
(the latter two also under `window.__diceDebug`). `renderAudit().frame` is the
renderer-pass counter: record its before/after difference and elapsed interval,
plus `calls`, `passes` and `scheduled.pending`; do not label it displayed FPS.
Do not run a polling animation loop during an idle test. A foreground profiler
or scripted visibility override does not prove a real background phone slept.

## Existing automation and evidence — reference, not human/device results

Commands run from the reviewed checkout. The `tools/drive.mjs` commands own an
ephemeral desktop Chrome stage and may emulate phone dimensions or throttle a
main target. They do **not** execute on the physical phone. For before/after
claims keep the same script, build inputs, backend and workload, and preserve
the reports; record differences instead of comparing unrelated roll poses.

| Existing command | What it supplies |
| --- | --- |
| `npm run test:r1` | The complete fixture return loop and real held-module library boundary. [Inspected walk and limits](redesign/2026-09-13-r1-success-walk.md). |
| `node tools/drive.mjs tools/steps/r1-success-walk.mjs` | Reproducible desktop/emulated-phone task captures. The same step accepts `menu`, `preview`, or `hydration` for focused captures. |
| `node tools/drive.mjs tools/steps/table-camera-look.mjs device-reference` | Actual-input camera moments: `4d20`, `40d20`, close `40d4`, 1/4 players. [Camera proof](TABLE-CAMERA.md). |
| `node tools/drive.mjs tools/steps/roll-arrivals-look.mjs` | Upright latest/previous reads during a burst. [Arrival contract](PLAYER-RESULTS.md#rolls-arriving-together). |
| `node tools/drive.mjs tools/steps/film-worker.mjs device-reference` | `4d6` seed 42, `40d20` seeds 90090/32676; input-return, prepared-film time, main long tasks, callback intervals and fingerprints. Its scheduled DOM probe is not a physical-input latency measurement. [Worker measurements](redesign/2026-09-13-film-worker.md#measured-result). |
| `node tools/drive.mjs tools/steps/idle-render.mjs device-reference` | Renderer counters at settled rest, next roll, all baked designs and simulated hidden state. [Idle evidence](redesign/2026-09-13-idle-render.md). |
| `node tools/drive.mjs tools/steps/battery-presentation.mjs` | Paired same-pose Copper/Black Anvil `40d20`, seed 90090: calls, passes, idle work and film equality. [Presentation limits](redesign/2026-09-13-battery-presentation.md). |
| `node tools/drive.mjs tools/steps/instant-results.mjs` | Two independent visible viewers, `4d20`/`40d20`, receipt/preparation/completion and exact films. [Instant evidence](redesign/2026-09-13-instant-results.md). |
| `node tools/measure-delivery.mjs` | Six entry assets, identity/Brotli/gzip first and repeat GETs on an owned server. An explicit reviewed HTTPS origin argument instead makes read-only deployment GETs. [Delivery scope](DEPLOY.md#static-delivery-2026-09-13). |

Current retained evidence is scripted browser/emulation evidence; some earlier
render/solver samples used a verified RTX 4090, while the composed R1 captures
use SwiftShader. Neither supplies a physical-phone or uncoached-user result.

## Blank result template

```text
SESSION: date/time ___  observer ___  participant aliases/familiarity ___
BUILD: SHA ___  origin/service mode ___  fixture/restart reference ___
DEVICE: make/model ___  CPU/GPU (observed or unknown) ___  OS/browser/version ___
DISPLAY: viewport ___  DPR ___  refresh rate ___  orientation/keyboard ___
CONDITIONS: network ___  cache/cold definition ___  plugged/battery ___
           power mode/brightness/thermal state ___  chat app + host device ___
METHOD: uncoached / assisted / instrumented ___  trace/recording tools ___
        repetition count/mode order declared before trials ___

R1 TASK ___  CUJ ___  prompt/start time ___  participant-finish time ___
Status: Complete / Assisted / Not complete / Not run ___
Observed consequence ___  hesitation/wrong turn ___  participant words ___
Help requested/provided and time ___  observer interpretation ___
First shared roll: A usable-table timestamp ___  B attributed-read timestamp ___
                  elapsed ___  waits/assistance ___  values/attribution agree ___
Returning Soul guest: original export reference ___  full content comparison ___
Private recovery/home/restart/inbox/Accept-versus-Join consequence ___

DEVICE TRIAL ___  moment/CUJ ___  repetition/order ___  cold/warm ___
Scene/zoom/dice set ___  players/settled dice ___  notation/seed/roll ID ___
Full/Battery ___  Instant ___  worker/inline/unavailable ___  chat on/off ___
Navigation-to-usable ___  input-to-visible-feedback ___  film-preparation ___
First painted dice ___  complete-result time ___  longest main-thread task ___
Presented-frame pacing/source ___  encoded/decoded/transfer bytes ___
Renderer counter before/after ___  interval ___  calls/passes/pending ___
Visible/hidden and actual background method ___  next interaction/wake result ___
Names/results/counting readable ___  entry/rest clipping or occlusion ___
Held/secret/rethrow/bank/shared agreement ___  retained film/trace if measured ___
Audio/thermal/session-duration observations ___  unsupported measurements ___
Screenshot/video/trace references + timestamp ___  deviations/confounders ___

SESSION FINDINGS: observed issues ___  reproduced locally ___  severity/reason ___
Missing/Not-run rows ___  evidence limits ___  proposed next check/owner ___
```
