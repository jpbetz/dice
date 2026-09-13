<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Composed release verification — 2026-09-13

The immutable `d6f1529` release preflight completed **355/366** scenarios.
Its two preceding protocol-browser suites passed. The full script's `&&` chain
stopped before its account/UI tail. The [retained output](preflight-d6f1529.txt)
records the actual failures; it is not an all-green release result.

The same snapshot passed the complete unit/fuzz lane on a fresh rerun. The
first unit attempt had one identity test fail with `TypeError: fetch failed`;
its independent 20/20 rerun and the subsequent full unit/fuzz rerun passed.
No runtime change or established cause is attributed to that transient.

| Preflight failure | Finding / disposition |
| --- | --- |
| `table-controls-phone` | Retired permanent phone Dice entry; current expanded controls are now exercised. A real breakpoint/hidden-opener focus defect was also fixed (`5f86d68`). |
| `round-table-footprints` | The unchanged 45-cast support assertions completed in 96.9s; the old 90s outer timeout was too short. The allowance is 180s (`e6ca9bf`), with no physical threshold change. |
| `battery-ambient-wake` | Fixed-window FPS assumption replaced by actual-input wake and continued motion, preserving strict Battery stillness. [Evidence](../2026-09-13-battery-wake.md). |
| `contacts-reach-the-felt` | A pending worker reservation was mistaken for a finished silent film. Completed contacts and pending/silent counterexamples now have separate proof. [Evidence](../2026-09-13-contacts/README.md). |
| `draft-bench` | Inherited multiple-profile state exposed both a fixture assumption and the missing list state for its ownership heading. Actual Duplicate/Delete and scrolling now prove both layouts (`9119d82`). |
| `pool-set-override` | An independent saved Build preference hid the assumed Quick entry. The scenario now chooses its workspace explicitly and uses the current gallery entry (`800adf9`); appearance assertions are unchanged. |
| `peek-retires` | The remote-arrival test actually rolled as the local editor owner, whose accepted Roll now deliberately returns to the table. The corrected actual-input proof preserves a typed edit through a remote arrival, then checks Done and targeted Clear (`18fc171`); both focused cases pass. |
| `place-film-is-one-film` | Cached scene dimensions were read before background viewers applied resize. The actual-layout handshake retains different viewports and adds whole-film equality. [Evidence](../2026-09-13-place-film/README.md). |
| `felt-gloss` | Identical pre-redesign and redesign measurement exceeds the unchanged gate. [Paired baseline](../2026-09-13-gloss/README.md). |
| `venue-life`, `venue-frame` | Existing beta scenery population/framing failures reproduce before the redesign. Gates remain unchanged. [Paired baseline](../2026-09-13-legacy-venue-characterization.md). |

The 12-cast pointer camera matrix passed in 175.4s in this preflight. Its next
outer allowance is 360s because the former 180s limit nearly clipped a completed
proof under concurrent browser load; this changes no product performance budget.

Separate composed checks at `65bc428` passed all 16 account/home/People app
cases (5/4/7). At `48c2d1e`, the home-connection and independent social-browser
cases and both R1 joined-return cases reported success. The unified shell tool
reported **143** after both that command's complete passing TAP and this
preflight's completed failing summary. No original signal source was established.
An isolated instrumented npm/harness audit returned normal exits 0/1 for pass/fail
and numeric 143 for a self-signaled control; cleanup only targeted owned positive
Chrome/server child PIDs. Accordingly, assertion results and command exits are
recorded separately. The final candidate runner records each child's exit code
and signal, and exercises the script tail even if an earlier gate fails.

The historical editor's [pinned draft](peek-pinned.png) and [targeted
Clear](peek-cleared.png) were inspected. Clear removes that historical roll's
physical/table record while the log still records its result; Bram's current
result remains. `tools/steps/peek-retirement-look.mjs` reproduces these moments.

The final candidate's local delivery probe also passes all six assets' first
and repeated identity/Brotli/gzip requests, with identical decoded bytes.
[Recorded totals](delivery-8a577e5.json): **3,980,032** identity bytes,
**1,112,013** Brotli bytes and **1,150,248** gzip bytes. This is the existing
six-entry-asset subset on an owned ephemeral production-mode server, not the
whole application graph, deployed traffic, page-load time or a battery result.

Final candidate verification is pending. Physical-phone, midrange-device and
uncoached player results remain unobserved; use the
[validation sheet](../../REDESIGN-VALIDATION-SHEET.md) for those sessions.
Cloud provisioning, HTTPS/IAM/restore checks and production traffic are separate
unperformed actions in the [enablement handoff](../../ACCOUNT-ENABLEMENT-CHECKLIST.md).
