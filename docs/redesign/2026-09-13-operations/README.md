<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Completed-runtime operations rehearsal

Base `b6b890a`, isolated worktree, 2026-09-13. No application runtime changed.
The proposed external sequence is in
[ACCOUNT-ENABLEMENT-CHECKLIST.md](../../ACCOUNT-ENABLEMENT-CHECKLIST.md).

## Local commands and results

`node tests/account-config.test.mjs`: **3/3 pass**, 260 ms in this sample.
The tests exercise sanitized shared config/CLI validation and actual paused
guest play, cold-home refusal and resumed original home data. Duration is a
test observation, not a product performance claim.

`node tools/account-local-drill.mjs`: **exit 0**. This disposable process/HTTP
proof uses private temporary snapshots and fixture identities, clean cookie
jars, and ephemeral loopback ports. It prints:

```json
{
  "ok": true,
  "checks": [
    "preflight_has_no_storage_or_network_side_effects",
    "stopped_private_backup_copies_both_snapshots",
    "pause_protects_cold_mappings_and_keeps_explicit_guest_play",
    "restore_also_rolls_back_later_session_revocation",
    "clean_cookie_recovery_restores_library_membership_pending_invitation_and_addresses",
    "restore_does_not_include_later_library_edits_or_blocks",
    "restore_leaves_original_store_unchanged"
  ],
  "cloudActions": 0,
  "retainedPrivateFiles": 0
}
```

The negative security discriminator is intentional: the older snapshot revives
a session revoked later and lacks a later block. It demonstrates why public
restore needs security reconciliation; this tool does not implement a global
recovery or invalidation mechanism. The restored fixture is removed.

`node --check tools/account-local-drill.mjs` and `git diff --check` pass.
No browser/render benchmarks or full suite were duplicated during the parent
release run.

## Read-only deployment evidence

Fresh GET-only public health/account-status checks and whitelisted `gcloud`
configuration fields match the checklist: old public revision, no account
configuration, Firestore API disabled, revision maximum 1 but service maximum
20. Runtime identity permissions have not been certified. No secret, full
operator configuration, account address or project ID was recorded.

The local source upload manifest contains **10 service files** and all required
account/library/home/People browser modules. It contains **zero** paths from
`deploy/`, `tests/`, `tools/`, `docs/`, `.agents/`, or `AGENTS.md` after the
ignore-list correction. `gcloud meta list-files-for-upload` does not upload.

Installed CLI help confirms proposed database creation/PITR/deletion-protection,
daily backup/retention, service and revision maxima, service-account attachment,
environment update and no-traffic flags. Current primary documentation links
are retained beside the proposed commands. Those checks do not prove IAM,
resource availability, cost approval, real Firestore transactions, backup
restoration, HTTPS cookies or production deployment.
