<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Invitations from the current table

Chrome inspection at 390 × 844 with touch emulation (the requested iPhone 12
Pro viewport), plus 1440 × 900 desktop. These are isolated development accounts.

The sender has four players at an unnamed table and owns a different saved
home. Friends stays visible near the top of People. Invite selects the current
table; naming, public preview and Save and continue return to the selected
friend. Sending never silently chooses the other saved home.

The recipient has not opened People. Its existing navigation button receives
a count from the real background inbox check. Opening it shows the invitation;
Accept and join enters the named table. Their complete private library and dice
set survive that join and a later return from Tables. A real saved-pool roll
then produces matching values for both browsers, with the painted dice in view.

- [Friends](friends-phone.png)
- [Save preview](save-table-phone.png)
- [Send](send-phone.png)
- [Notification on the table](notification-phone.png)
- [Received invitation](receive-phone.png) · [Desktop](receive-desktop.png)
- [Rolling after returning](joined-roll-phone.png)

Reproduce with `node tools/drive.mjs tools/steps/invitation-journey-look.mjs`.
The same actual-input journey is in `tests/people-ui.test.mjs`. Separate held
HTTP-response cases verify that delayed acceptance cannot navigate after
closing/reopening People or browsing Friends. A refused connection retains the
invitation and retries its original operation. Monitor unit tests cover older
inbox pages, expiry, hidden tabs, account changes and pre-acceptance responses.

Validation at `828e8a0`: `npm test` completed successfully, including all 75 browser smoke
scenarios and all 11 People cases, plus the unit/fuzz and account/library/home
suites. `git diff --check` passes. No production service or physical-device
observations are implied by these local browser checks.

Review follow-up: holding the first Homes-module response exposed a cancelled
invitation reopening Tables. The save request now checks the same invitation,
People visit and account after that load. Two actual-input 390 × 844 cases
prove that closing the invitation or browsing At table keeps the selected
People task and private unfinished turn intact. The original save/send/badge/
direct-join/return journey passes alongside them (**3/3** targeted checks).
[Closed invitation](cancel-save-phone.png) · [At table after cancellation](cancel-save-task-phone.png).
Reproduce the focused views with
`node tools/drive.mjs tools/steps/invitation-save-cancel-look.mjs`.


The existing Help capture now expects the owner's explicit **Accept and join**
and **Accept for later** wording. It waits for the dialog's entrance animation
before selecting a topic, then uses the same hit-tested pointer actions. The
five desktop/390-pixel views pass and were inspected; the [current phone
explanation](help-phone.png) is retained separately from the runtime fix.
