<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# People, personal dice, and persistent tables

**R1 · implemented and verified locally, 2026-09-13; released, 2026-09-14.**
Actual-player and physical-device observations remain open. This is
the detailed plan for item (1) of the approved
[experience redesign](EXPERIENCE-REDESIGN.md). The owner authorized autonomous
execution of all three priorities with agents. The design and slice identifiers
below remain the plan of record; the [execution ledger](REDESIGN-PROGRESS.md)
tracks remaining release work.

Implemented: direct name editing; the three destinations and full-width phone
table; visual gallery, favorites, private practice and explicit selection;
named setup with actual artwork Preview/Apply; Quick dice and additive starter
kits; and the [focused saved-roll library](UX.md#focused-library-workspace-2026-09-13)
with search, preview-before-use and named management actions. Saved profiles
stay private until individually shared at a table. The fresh join door selects
Quick dice; explicitly choosing Random adds a profile and preserves all kept
profiles, including a library whose display name is missing.

Optional recoverable identity and private-library workflows include explicit
first comparison, offline retry, retained competing versions, account/session
boundaries and independent-browser recovery. Tables implements named homes,
public-setup capture, retained comparison, exact retries and deliberate return
after restart. People implements Friends, an offline invitation inbox and
opt-in online/home-location presence. **Accept for later** preserves the active table and turn; **Accept and join**
explicitly enters the invited table after confirmed acceptance. See the [library
protocol](PRIVATE-LIBRARY-PROTOCOL.md), [home workflow](SAVED-HOME-PROTOCOL.md),
[social workflow](SOCIAL-SERVICE-PROTOCOL.md), and
[workspace map](WORKSPACES.md).

[Local release verification](redesign/2026-09-13-release/README.md) is recorded,
including all 20 account/return cases. The original [staging account release](redesign/2026-09-13-staging.md)
on `11dd1ef` passes 19/19 runtime permission checks and isolated PITR
reads confirm the prepared library head, both homes and pending invitation.
The [complete source HTTPS return](redesign/2026-09-14-cloud-return/README.md)
passes on `00006-p2z`; the [isolated restored continuation](redesign/2026-09-14-cloud-return/restore/README.md)
also passes. The original `11dd1ef` production proof passes 14/14 runtime
checks, nine canonical browser checkpoints and 36 HTTPS delivery requests. The
subsequent [frontend release](redesign/2026-09-14-dice-loading-release/README.md)
now serves `90b8bb9` at 100%, maxima 1; its guest/art checks pass 5/5 in each
environment, with unchanged account sources and configuration. Actual newcomer and physical-device observations
and the separately characterized legacy visual-gate debt remain open. Local fixture accounts,
process restart and phone emulation do not establish those observations or
production durability. [Operating plan](ACCOUNT-OPERATIONS.md).

## 1. The experience to build

A new visitor rolls immediately with familiar dice. They can see where to
change their name, choose their personal dice, and keep useful rolls. When
Sam invites them to **The Copper Lantern**, that name appears in the
invitation, table header, browser tab, and Tables destination. They can
play as a guest, then choose recoverable identity to keep their kit and
return to that same group from another device.

**Inherited assumption to replace:** everyday tasks can be discovered by
learning the settings categories and secondary gestures. Give those tasks
visible homes. Also replace the assumption that a browser-local room link
constitutes a persistent group home.

## 2. Destinations and interaction contracts

The active playing table remains the center of the app. These destinations
open workspaces around it; returning to the active table takes one action
and preserves the draft, live seat, and any unfinished turn. Merely browsing
Tables must not invoke today's leave-to-lobby behavior.

| Destination | Contains | Primary actions |
| --- | --- | --- |
| **Tables** | Active table; saved-home cards; browser-local recents | Return, Table setup, capture/save a home, Manage retained versions, explicit Join now or New table |
| **My dice & rolls** | Quick dice and builder; collection/practice; entry to the focused saved-roll library and account/sync status | Roll, compose, preview/practice/use dice, preview/use saved rolls, share chosen profiles, add a starter kit, import/export |
| **People** | Current roster and visible results; shared-roll browsing and guest invite link; optional Friends, Invitations and Presence | Invite a guest or friend, accept/decline an invitation, explicitly join a home, remove/block contacts, choose online or home-location sharing |

A normal click, tap or keyboard activation on your name opens its editor.
The personal menu also reaches saved-roll management, account/recovery and
Preferences. My dice & rolls supplies the return to your own saved rolls.
Display names remain separate from character/profile names; editing one does
not rename the other or change seat ownership.

The named table label opens **Table setup** for its name, interpretation,
appearance and prepared material. The desktop gear opens personal
**Preferences**. **Dice** is beside the desktop roll controls. On a phone the
bottom navigation is **Tables · Rolls · People · More**; Rolls opens My dice
& rolls, while More reaches Preferences, history, notation, Help and clear
controls. The bottom tray shows saved rolls when available, otherwise Quick
dice, with the staged draft's Roll and Build a roll actions.

Opened tasks may expand to the space their content needs. Their direct **×**
returns to play with the same seat, draft and unfinished turn. Roll returns
from its originating task when accepted, preserving any task opened after the
request. An opened phone task can cover the local scene; the server continues
play. Focus returns to the invoking control. Text conveys selection and
connection state alongside color. [Current layout and proof](WORKSPACES.md).

**Owner correction, 2026-09-13:** organize the whole interface rather than
giving each new feature a prominent block. The first My dice card consumed
valuable rolling space. Replace it with a compact Dice control beside the
personal name, turn the existing table label into the Table setup entry, and
reuse one workspace frame for setup, preferences, or saved-roll management.
The footer gear opens device preferences; the personal menu reaches library
management. On desktop, setup leaves the scene interactive; on a phone it is
a sheet. New controls must earn their space against the rolling workflow.
Measure the start of the composer before and after, with four players and a
compact phone sidebar; discoverability alone does not justify permanent bulk.

**Owner clarification, same day:** the space concern applies to the root UI
that is always, or almost always, visible. A player's chosen focus can expand
and take up space. Size opened views for the work: generous dice comparisons,
appearance previews, and library organization may warrant most or all of the
screen; a few preference switches can stay compact. The current drawer width
and shared frame are implementation choices, not ceilings for future views.
Review the resting table for permanent clutter and the opened task for
readability, useful preview size, and ease of completion. Return to play stays
clear and preserves the player's place.

**Later owner correction, same day:** remove the saved-pools subtitle and
move Dice from beside the player name to the roll controls. Use plain,
functional labels; avoid cute subtitles, taglines and reassurance lines under
routine controls. This supersedes the name-row Dice placement described above.

Initial relocation map, read from `index.html` and the handlers at the
baseline revision. These move existing capabilities; they do not require
rewriting their domain logic. Validate the map in R1-A's layouts.

| Current control | New home | Scope to make visible |
| --- | --- | --- |
| Identity menu: Change name | Normal name/avatar editor | Your display name; retain the current server-normalized rename path |
| Identity menu: Change seat / Leave table | People → your current seat / active table menu | Joining/leaving the live session is distinct from browsing a workspace |
| Table name | Table header and Table setup | Shared label; never a room key or profile name |
| Copy invite link | People → Invite, also at table header | Named guest destination; keep keyboard shortcut and existing share path |
| Rolling system | Table setup → How results are read | Shared interpretation; visible beside the composer |
| Mat zoom | Table setup → Rolling area | Currently changes shared physics geometry; do not mislabel it as a personal camera preference |
| Venue, Mat, Tower | Table setup → Appearance | Shared scene, with individual visible selections and beta offering labels where applicable |
| Sound, Room tone | Preferences → Audio | Per-device switches, still independent |
| Show numbers on dice | Preferences → Readability | Per-viewer choice; retain readable numerical results |
| Dice set / venue dice notice | My dice & rolls → Dice | Personal default, saved-roll exceptions, and optional venue suggestion |
| Profile rows: switch, rename, delete, duplicate/copy; New | My dice & rolls → Saved rolls and profiles | Personal library; character names remain separate from your name |
| Random profile | Starter-kit preview → Deal another | Explicit choice of system and generated contents; no silent first-run deal |
| At this table profiles and shared-pools notice | People → current participants/prepared profiles; sharing status also beside your library | Copy/adopt into your own library; identify which material is shared |
| Export/import opener; text, Fill, Copy, Apply, Download, Open file | My dice & rolls → Import/export | One existing portable document/preview model; file import remains explicit |
| Apply to table from the portable document | Import preview → Table setup action | Shared settings/prepared seats, distinct from adding personal profiles |
| Profiles in this file: Add / Add all | Import preview | Merge into the personal library; preserve identities and name deduplication |
| Replace my library / Download first | Import preview → separate Restore action | Preserve the existing deliberately destructive, confirmed restore and backup path; never fold it into ordinary Apply import or sync |
| Settings refusal/status note | The panel/sheet that initiated the action | Keep validation, network refusal, and changed-base messages visible and announced |

The current roll controls, ±/visibility editor, history/export, help, and
developer-mode door also need a placement check in the prototype. Their
capabilities are retained; R1 is not a replacement dice procedure system.

## 3. First visit, starter kits, and existing libraries

The new default is **Numbers only** with a small **Quick dice** workspace:
`1d4`, `1d6`, `1d8`, `1d10`, `1d12`, `1d20`, `2d6`, and `d100`, alongside
the existing expression composer and modifiers. These are product-provided
shortcuts, not eighteen randomly generated character pools. “Save roll” is
an explicit act. A first roll requires no account or starter-kit decision.

Offer **Choose a starter kit** inside My dice & rolls. Preview its name,
interpretation, and saved rolls before adding it as a new profile. Include
Soul Deal using the existing priced dealing logic when it is explicitly
chosen. Kit selection never replaces an existing profile or silently
changes an occupied table's interpretation. Joining an established table
uses its shared interpretation; show that context beside the roll composer.
Keep today's system/profile mismatch choice meaningful and visible.

Only genuinely empty storage gets the new first-run experience. Existing
profiles, saved pools, selected systems, and imported YAML retain their
meaning. Do not guess that a Soul Deal library is disposable because it
resembles a generated rack. “Start another kit” adds; it does not reset.

## 4. Personal dice that visibly take effect

The gallery uses large, labelled previews of actual catalogue sets, with
All / Favorites, search by name and collection, a current-selection indicator,
and a focused detail view. Desktop browsing and preview stay side by side;
the phone detail returns to the same position in the catalogue.
Load preview images as needed and allow at most one active 3D practice
viewport; opening the gallery must not instantiate the catalogue's meshes.

**Practice throw** is explicitly local to the gallery, absent from shared
history, offers, and turn state. It exercises the selected art without
changing the current dice choice or a roll in progress. **Use these dice**
sets the personal default for future rolls; an already-authored roll keeps
its recorded appearance. Do not recolor old shared results retrospectively.

Working precedence for a new roll:

1. An explicitly selected per-die or saved-roll appearance.
2. The player's chosen default dice.
3. Standard dice when neither is specified or an asset is unavailable.

A venue may **suggest** a matching set with a visible “Use matching dice”
action. It no longer silently overrides a personal or saved-roll selection.
Show “Uses Ivory” on an overridden saved roll, with “Use my default” to
remove the override. Resolve appearance before authoring the roll payload
so every viewer, replay, and late joiner agrees. Preserve the existing
hidden-dice redaction path.

## 5. A recognizable table, now and later

Give newly created tables memorable generated labels and direct name
editing. The label is display text; the random room key remains the
address. Duplicate labels are valid and never merge rooms. Use one label
resolver for the header, tab (`The Copper Lantern · Dice Table`), recents,
invitation, and return card. Server-chosen names prevent two clients from
inventing different names for the same new room. Legacy unnamed rooms get
one consistent fallback; the current title plumbing is reused.

Table setup previews appearance in the scene for the editor and says
**Preview — only you** until Apply. Cancel restores the current shared
settings. Incoming shared edits do not silently become the preview's base:
retain the candidate and disclose a changed base before applying. Apply
writes through the shared settings path; previews cannot change physics
inputs while a roll or open turn depends on them. Keep candidate appearance
separate from committed film inputs. For tower/rolling-area choices that
cannot be previewed safely in a live scene, use an isolated preview during
the turn and apply at the safe roll boundary. The first prototype must
prove that the dice remain visible beside the panel and after sheet collapse.

Before durability ships, Tables honestly says **Recent in this browser**.
Saving a link locally must not claim that its setup survives a server restart.
After durability ships, **Save table home** deliberately captures a name,
cover selection from shipped art, shared setup, and prepared profiles into
a durable record. A home reopens the same address and loads the saved setup
when its live session is absent. An already-running session is not reset by
someone returning or loading an older saved home.

Homes can show last-visited time and permitted live occupancy. Their first
activity summary contains no roll values, hidden-roll existence, private
drafts, or full session transcript. Durable roll history is outside R1.

## 6. Identity, storage, and live play

The approved direction needs a durable service. Do not implement accounts
as another localStorage token and call them recoverable. Equally, do not
put remote storage on the critical path for ordinary rolling.

| Record | Authority and lifetime | Boundary |
| --- | --- | --- |
| Local guest identity and library | This browser, available without a service | Retain local play, explicit file export/import, and current guest continuity |
| Recoverable person + login session | Durable person; revocable authenticated sessions | Private account/library access; display name never authenticates |
| Personal library | Local working copy; optional durable revision after opt-in | Profiles, saved rolls, dice choice, and favorites; no automatic publication of private account data |
| Table home | Durable stable ID/address, label, cover, saved setup and revision | Saved-home membership governs reading/writing durable home data; it confers no special dice or reveal powers |
| Live room | In-memory players, rolls, offers, open turns, transient settings | One live session in one process; existing authorship, projection, and replay contract |
| Friendship, invitation | Durable relationship and invitation state | Explicit recipient, acceptance, cancellation/expiry, and removal |
| Presence | Short-lived service/session signal | Shared only with intended friends or table participants; expires rather than claiming a crashed tab is online |

Initial architecture: a small optional identity/storage API alongside the
existing room API, with its own client module and storage adapter. Keep
notation and roll composition, SSE projection, and ephemeral live-room state
in the current path. Prefer the existing deployment unless investigation
shows it cannot meet the recovery and durability contract. Select the
authentication provider and durable store in slice R1-D0, using current
primary documentation and a restart/recovery prototype. No choice is
implied here, and no npm dependency is introduced by planning.

**Guest → recovered person:** joining or rolling never requires sign-in.
Offer “Keep my dice across devices” when saving or in the personal editor.
On first connection, preview the local and remote libraries and let the
player keep local, keep remote, or merge copies without discarding either
original. After explicit sync opt-in, later edits can sync automatically;
show Saved / Saving / Offline / Needs attention accurately.

Use versioned writes with a base revision. An offline edit or a second
device with an old revision cannot silently overwrite the current library.
Retain both versions and offer a previewed reconciliation; start with that
simple model rather than a collaborative document engine. Imports remain
preview-and-merge. Sign-out stops remote writes and separates private
account caches from the guest workspace; it must not delete a person's
only unsynced copy. Recovery must work from a clean browser, including
expired credentials and a revoked session.

Account identity, table seats, and character profiles stay separate. An
authenticated person can be linked to a new seat only through server-verified
identity. Matching a name or discovering a home grants no authority over an
old held/secret roll. Preserving or extending private-roll ownership across
devices needs an explicit projection/authority design before it changes.
The initial durable slice can retain today's live-session continuity rules.

The former automatic library publication is replaced by explicit per-table
profile selection with a visible sharing disclosure. Downloading a private
account library never grants publication consent at the current table.
Selected profile names, systems and pools are published as table-facing copies,
using the existing public field allowlist. Account identifiers, recovery
data, friends, and library versions are never shared-pool fields. Preserve
copy/adopt of the selected shared profiles and prepared profiles.

**Durability failure:** existing live rooms and local libraries keep working
when the optional service is down. Save failures remain pending/visible;
returning to an unavailable home shows an honest retry state instead of an
empty replacement home. Server restart restores homes, not unfinished turns
or historical secret rolls. No promise of roll-session recovery is made.

## 7. Friends and invitations

People exposes the current roster and guest link invitation without an
account. Where the optional service is available, Friends uses deliberately
shared contact codes and friend requests; Invitations contains received and
sent requests and home invitations. There is no global people directory.
Presence is off until chosen, with separate online-status and saved-home
location controls. Recovery alone enables neither presence nor library sync.

“Sam invited you to The Copper Lantern” contains an account-provided inviter name,
destination, and Accept / Decline. Account names are not verified real-world
identities. Acceptance adds the saved home where
appropriate; **Join now** is deliberate so an incoming invitation cannot
pull someone out of an active turn. Already-connected friends receive it
inside the app. Newcomers can still follow a guest room link. A friend need
not be online at send time; the inbox survives reload and restart.

Invitation states: pending → accepted, declined, cancelled, or expired.
Accept is idempotent and authorized for its intended recipient. An inbox
event contains only allowed invitation/presence data, never a room snapshot
or roll values. Unavailable or expired presence reads Unknown; home signals describe only
members who opted into sharing, not the room’s total occupancy. Removing/blocking a social connection stops future social
contact and presence sharing; it does not eject a live player or undo a
room key already shared. Expiring an invitation likewise cannot revoke a
guest link already learned. Do not imply stronger admission control.

Saved-home members can save setup revisions; any live participant can still
roll, offer, and change live table settings on equal terms. A guest's live
edit is labelled as applying to the session; saving it to the durable home
is a separate explicit action for a member. Membership is a data boundary,
not a GM role. Revisions prevent competing saves from silently overwriting
one another. No durable friend or home roster goes into public room payloads.

## 8. Releases and implementation slices

The original sequence below keeps the approved slice identifiers. R1-A through
R1-E have implementations and focused proofs; R1-F's scripted success walk
and current Help are complete. Local release verification and the advancing
[staging checkpoint](redesign/2026-09-13-staging.md) are recorded. The complete
source HTTPS return and isolated restored continuation pass. Production runtime
checks on the original `11dd1ef` pass 14/14, with nine canonical production
browser checkpoints. Current `90b8bb9` retains that account code/configuration
at 100%, maxima 1; the frontend follow-up passes 5/5 guest/art checks in each
environment. Actual observation remains separate from those scripted proofs and local restart tests.

| Slice | Deliverable | Completion evidence |
| --- | --- | --- |
| **R1-A — prototype the structure** | Desktop and 390 × 844 phone layouts for the active table, three destinations, personal editor, gallery/practice, and Table setup. Include a fresh guest and a returning Soul Deal player. Validate §2's control relocation map. | Walk name → dice → roll → invite → return; inspect open-panel and keyboard-open moments, a four-person result, and phone sheet collapse. Record resolved layout decisions before building the shell. |
| **R1-B1 — navigation and identity** | Implement shared workspace state and normal name editing; keep active table reachable. Move own-pools navigation to My dice & rolls. | Rename appears for both players without reseating; switch destinations during an open turn and retain its choices; pointer, touch and keyboard work. |
| **R1-B2 — personal dice** | Gallery, lazy previews, favorites, practice, explicit selection and override treatment. | Selected set reaches a real shared roll and late joiner, including a fantasy venue; practice emits no shared roll; existing results retain their art. |
| **R1-B3 — named table and setup** | Memorable shared labels, consistent title/header/recents/invite, visible setup and preview/apply/cancel. | Two clients agree on the name; rename does not change the key; opening/closing setup leaves an incoming roll and unfinished turn intact. |
| **R1-C — familiar first rolls** | Quick dice, Numbers only for new tables, explicit starter-kit preview/add, existing-library preservation. | Fresh guest reads `2d6+3` as an attributed total; returning Soul Deal data is intact; joining an existing Soul Deal room uses its context; kit addition never replaces a library. |
| **R1-D0 — prove the service choices** | Provider/store/deployment decision, API and record schemas, session and data boundaries, version conflicts, recovery, outage and migration plan. | Prototype clean-browser account recovery and a saved home after a process restart without a previous client repushing it. Record costs and dependency choices from current documentation. |
| **R1-D1 — recoverable kit** | Optional identity, durable personal library, explicit initial reconciliation, per-table profile publication, sync status, offline conflict and sign-out handling. | Two independent browsers exchange an opted-in library; conflicting offline edits preserve both versions; downloaded profiles stay private until shared; guests and static solo still roll during service failure. |
| **R1-D2 — persistent home** | Deliberate home creation, saved setup/cover, durable membership, return cards, safe session rehydration. | Name/address/setup survive restart and an empty browser; a returning member never resets an occupied table; unauthorized home writes fail. |
| **R1-E — social return loop** | Friends, permitted presence, durable invitation inbox, Accept/Decline and explicit Join now. | Sam invites an offline friend, who returns, accepts, and joins the correct home; duplicate accept, expiry, removal, service failure, and recipient isolation behave as stated. |
| **R1-F — composed play and closeout** | Newcomer/returning-player sessions on desktop and phone; actual user observation; updated UX/help/CUJ proofs and shipped record. | The full success walk below, including guest participation alongside recovered users. Record remaining device limits rather than reporting emulation as a phone test. |

## 9. Code map and changes to existing decisions

Re-read these symbols at implementation time; the baseline is `1915bd7`.
Avoid broad refactoring of main.js as a prerequisite. Extract destination
state and gallery behavior behind narrow adapters when their slice needs
them, rather than adding another large settings block.

| Seam | Existing implementation | Planned change / guidance superseded |
| --- | --- | --- |
| Identity and settings | `index.html`: `identity-chip`, `identity-menu`, `settings-nav`; `js/main.js`: `applyRename`, identity click handlers, `openSettingsModal`; `css/style.css` | Reuse rename validation/network echo. Supersede UX §7.17's secondary-only identity editor and the four settings categories. |
| Personal dice | `js/main.js`: `setDiceSet`, `wireSet`, `rollSetOf`, `draftDieSets`; `js/dice.js`, `js/themes.js`: `SETS`, `installCatalogue` | Gallery over existing catalogue; resolve explicit personal/per-roll art before the wire. Supersede GOALS 13 / venue precedence at roll creation, not shared replay or redaction. |
| First-run kit | `js/meanings.js`: `DEFAULT_SYSTEM`; `js/seed.js`: `dealRack`; `js/main.js`: profile-store boot and `bootSystem`; server room defaults | Separate product Quick dice from persistent profiles. Change genuinely new defaults on both client and server; preserve restored/shared interpretation and existing schema migrations. |
| Table label / setup | `js/main.js`: `tableLabel`, `renderTableName`, settings and recents paths; `server.js`: `SETTING_SPECS`, `/api/settings`, `/api/table` | Extend the existing title path and canonical name, distinguish candidate preview, session state, and durable saved home. |
| Data and continuity | `js/profiles.js`, `js/portable.js`, `js/net.js`; `server.js`: `rooms`, join/resume, room linger, `projectEntryFor` | Preserve YAML and live projection. Add optional durability outside the hot roll path. IDENTITY's browser-only ceiling and PROFILES §5–6's “do not add persistence/sign-in” recommendation are historical under the approved direction. |
| Mobile / performance | `index.html`, `css/style.css`, `js/main.js`; existing e2e and `tools/drive.mjs` | Coordinate the bottom tray with R2 and lazy gallery assets with R3; do not retain the current phone rail simply because a golden expects it. |

GOALPOST 3–4's owner-approved amendment is a prerequisite recorded with this
plan, not a later agent's permission to disregard the eight. Account data
access is permitted; privileged gameplay roles and outcome engineering are
not. Do not reinstate a beta capability restriction as part of identity work.
Published pools remain table-facing copies; a synchronized library must not
become a new route for unselected profiles or private account metadata.

## 10. Validation and the success walk

**Scripted composed proof, 2026-09-13:** the [retained success walk](redesign/2026-09-13-r1-success-walk.md) connects visible guest play, private recovery, a cold saved home, and offline invitation acceptance with separate Join. It includes a returning Soul Deal guest. Actual player observation and physical-device validation remain outstanding.

Use existing CUJ1 (instant roll), CUJ2/3 (invite/join), CUJ4 (leave/return),
CUJ6/7 (profiles), CUJ8 (compose/read), CUJ9/11 (legibility/following), CUJ10
(privacy), CUJ12 (table conventions), and CUJ13 (capture) as named in
[CUJS.md](CUJS.md). These are references, not new journey numbers. Recovery
and durable invitations now extend those scenarios through the account, home
and People browser suites. The original audit is not implementation evidence.

The composed walk: a fresh guest changes their name, chooses and practices
a set, rolls `2d6+3`, saves a useful roll, names a table, and shares its guest
link. A second person joins; both read the same values and attribution.
The first opts into recovery, keeps the local library, and saves the home.
After both leave and the room process restarts, a clean browser recovers the
kit and home. They invite the second person through People; that person
accepts and deliberately rejoins the same named table. Repeat with one
person remaining a guest and with a returning Soul Deal library.

For each implementation slice, run `npm test` and relevant existing tags
with `node tests/e2e/run.mjs --only <tags>`. Starting areas are identity,
seat, profiles, settings, visibility, and the CUJ tags; inspect the scenario
registry for their exact coverage. Existing pins worth reconciling include
`identity-chip`, `seat-resume`, `front-door-is-a-table`,
`the-link-in-the-bar-is-the-invite`, `joining-another-table-keeps-your-pools`,
`profile-library`, `profile-library-reload`, and the venue/set and shared-roll
scenarios. Replace assertions for deliberately retired gestures; preserve
the underlying storage, ownership, and shared-value assertions.

Use `window.__diceDebug` to set up scenes and inspect domain state, then
exercise the real visible control for the new interaction. Include raw-wire
recipient-isolation checks for the new service and existing hidden-roll
projection. Test two identities, two devices for one recovered person,
restart without a repushing client, offline concurrent edits, and recovery
failure. A green screenshot of a success page is not a durability test.

Inspect 1440 × 900 desktop and genuinely fresh 390 × 844 touch layouts:
first roll, name editor with keyboard open, gallery, practice, previewed
table setup, incoming roll, and four-player result after sheet collapse.
Measure visible dice/results and usable scene space, not only panel width.
Physical phone and midrange laptop observations remain required before
making claims about their usability or performance. During user observation,
record completion, hesitation, explanation needed, and time to first shared
roll; do not infer discoverability from click count or scripted completion.

## 11. What is still a design task

**Next:** record actual-device and newcomer observations. Current `90b8bb9` is
released with 5/5 staging and production frontend checks. The original `11dd1ef`
account, permission and delivery proofs remain separate. The production service
and released revision both have maximum 1.
The composed success walk and current Help have passed their local proofs.
The destination, practice, setup,
saved-home and People workflows have implementations and inspected browser
captures, including 390px phone emulation.
The recovery/store decisions and conflict-preservation policy are in the
service/protocol documents linked above. Production provisioning and deployment
remain separate from local implementation and its restart proofs.
The initial design intentionally keeps roll history ephemeral and has no
friends directory search, chat, game rules, campaign state, uploaded cover
art, payments, cross-process live rooms, or ongoing-turn recovery. Additional
scope needs an explicit place in the plan.
