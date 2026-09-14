<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Actual staging account and table return

September 14 UTC, 2026. The final source run passes **4/4 preparation** and
**5/5 verification checkpoints**, with both commands exiting 0. Preparation
ran on `dice-accounts-stage-00005-tbg`; verification ran on
`dice-accounts-stage-00006-p2z`, using the same immutable image and app source
`11dd1ef`. The release owner independently read back the image/revisions and
reports the private journal as `verified`, with no failure. The
[sanitized aggregate](result.json) retains checkpoint names and command times:
57.534 seconds to prepare, 140.858 seconds to verify, including the real
90-second presence expiry.

The run uses the actual canonical staging HTTPS origin and independent fresh
Chrome profiles with fixture accounts. Return captures use **390 × 844 phone
emulation at DPR 1**. The shared-result moment has two browser viewers and one
HTTP fixture observer, explaining the app's “3 at table” count. It does not
establish physical-device performance or human usability.

Verification tool `bfa98bd` is a tooling-only descendant of `3ed9db1`; that
checkout does not change the deployed app version. Its navigation handshake
waits for the new document, exact destination and live join. Capture framing
checks visible content while real pointer/keyboard actions retain hit testing.
The earlier source and restore failures remain in the
[staging checkpoint](../2026-09-13-staging.md); this source pass does not relabel
them or complete the separate PITR browser continuation.

## What the script verifies

Preparation checks actual HTTPS cookie/session boundaries; immutable library
conflicts, exact retry and retained originals; same-address home conversion and
reserved home creation; and an offline fixture invitation with denied access
for another account. Verification recovers the accounts in clean profiles,
reads the kept versions and explicitly adopts the library, returns to both cold
home addresses without old roll history, and checks saved Copper/close setup.

Accept for later preserves the recipient's existing private turn, seat and
address. Separate Join reaches the home; both viewers agree on authored values
and complete keyframes. Library publication remains off. Presence requires
explicit consent, separately protects location, and expires after its actual
lease; session revocation removes its signal. These are scripted state/network
assertions. A screenshot alone cannot prove private-data exclusion, unchanged
hidden state, shared-film equality or expiry.

## Inspected captures

| Capture | Visible observation |
| --- | --- |
| [Library comparison](library-comparison.png) | Account version, explicit version choice and default-dice choice are readable. |
| [Library adopted](library-adopted.png) | Private sync is up to date; the notice keeps table sharing an explicit choice. |
| [Both homes](both-homes.png) | Converted and reserved home names, Manage and Join now controls are visible together. |
| [Accepted before Join](invitation-accepted-before-join.png) | The invitation is accepted, with a separate Join now action. |
| [Shared recovered result](shared-recovered-result.png) | The result reads 11 from 2 + 6 + 3; both dice fit the phone scene and saved-roll/navigation controls remain visible. |

All five captures were inspected for readability and visible secrets. They
contain fixture names and rolls; no recovery key, contact code or account cookie
is shown. No credential journal, private canonical origin, provider ID or raw
cloud log is included. The two home cards were captured while their monogram
covers were visible; the inbox capture shows the Copper artwork.

PITR content/continuation, production candidate and traffic, and physical-device
and uncoached human observations remain separate evidence. The
[local full-suite record](../2026-09-13-release/README.md) is unchanged.
