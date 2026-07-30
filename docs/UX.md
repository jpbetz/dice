# UX Design: Notation, Roll Moments, Visibility, Dice Sets

Authoritative UX spec for the next evolution. This is a spec, not a survey:
where alternatives existed, the decision is recorded here and the alternative
is listed under *Rejected*. Companion to `ROADMAP.md`; a reference into it
is always written **roadmap §N** — a bare §N means a section of *this*
document. Everything here is implementable against the current
codebase; new endpoints and SSE events are enumerated in §6.

Design stance, in one line: **standard on the surface, modern in the feel.**
Standard = Roll20-dialect notation, the industry's four visibility modes
(open · held · secret · whisper), a conventional saved-groups panel.
Modern = one dressed-up roll moment, diegetic mat text in the 3D felt,
physics-true hidden dice, and zero permission bureaucracy — the privacy is
real (server-side redaction) and the roles are absent.

---

## 1. Notation layer

### 1.1 Grammar (the adopted dialect)

One shared, dependency-free module — **`js/notation.js`** — with the same
Node+browser contract as `js/rollspec.js`, because the server re-parses
every pasted command (§1.6). It expresses *exactly* what `rollspec.js`
supports today; nothing more.

```
command   := [mode SP] expr [SP flag]* [SP dc] [SP comment]
mode      := "/roll" | "/r" | "/gmroll" | "/gmr" | "/selfroll" | "/sr"
expr      := term (("+" | "-") term)*
term      := integer | diceTerm
diceTerm  := [count] dieType termMods*
count     := 1..40                          ; default 1
dieType   := "d4"|"d6"|"d8"|"d10"|"d12"|"d20"|"d100"|"d%"|"d10x"
termMods  := keep | reroll | explode        ; glued: 4d6dl1, 3d6ro<=2!
keep      := ("kh"|"kl"|"dh"|"dl") integer  ; bare "k"→kh, bare "d"→dl
reroll    := ("ro"|"r") ("<="|"<") integer  ; ALWAYS once-per-die here
explode   := "!"                            ; max face only, chain cap 3
flag      := "adv" | "dis"                  ; requires a d20 in expr
           | keep | reroll | "!"            ; group-wide trailing form (see below)
           | "check" | "cinematic" | "cine" ; moment kind (§7.6)
           | visibility                     ; one per command (§7.8)
visibility:= "held" | "secret" | whisper
whisper   := "w:" name ("," name)*          ; name quoted only when it needs it
dc        := ("dc"|"vs") integer            ; LOCAL EXTENSION (target)
comment   := "#" title ["|" subtitle]       ; roll label / mat headline (§7.6)
```

Token decisions (each chosen against a real alternative):

- **`!` for exploding**, not Foundry's `x` or Avrae's `e` — Wikipedia,
  Roll20 and RPG Dice Roller agree on `!`.
- **`ro<=N`, never `r<=N`, on output.** Two Roll20 divergences are
  normalized — one loudly, one losslessly. Loud: Roll20's bare `r` means
  *recursive* while `rollspec.js` rerolls once per die, so the one-line
  note "rerolled once per die" shows the first time an `r` is accepted.
  Lossless: Roll20's `<` comparator is **inclusive** (`r<2` rerolls 1s
  *and* 2s), so `r<N`/`ro<N` normalize to `ro<=N` with the **same N**,
  never N−1 — a pasted Roll20 string must keep its meaning exactly.
- **Advantage:** the *term* `2d20kh1` collapses to `1d20` + `{adv:'adv'}`
  (`2d20kl1` → `dis`) wherever it appears — so `2d20kh1+5`, the most
  common real Roll20 paste, and even `2d20kh1+1d4` light up the
  paired-dice presentation (the collapse runs before the mixed-pool
  check, so this one glued `kh1` is legal in a mixed pool because it
  ceases to exist). Emit `1d20 … adv` as canonical
  (the `adv` keyword is the Avrae precedent and is the only spelling that
  works for multi-d20 pools, since `mods.adv` pairs *every* d20).
- **`d100` / `d%`** expand to the pool `[d10x, d10]`; a pool that is exactly
  one `d10x` + one `d10` renders back as `d100`. `Nd10x` stays a legal
  input/output for anything else (old `#g=` links keep working).
- **`dc N` (alias `vs N`)** is an admitted local extension that sets the
  experience Target (§2.4). It is *not* spelled `>=N` — that spelling is
  reserved for roadmap §8 per-die success counting (`cs>=N`, future).
- **`# text`** (Foundry's flavor precedent) sets the roll label, and — when
  an experience is active — the mat text. Comment is stripped of control
  chars, max 64 chars.

**Mixed-pool scoping rule (the divergence fix).** `rollspec.js` applies
`keep`, `reroll` and `explode` across the whole group, but every other
tool binds them to the attached term. This includes reroll: it *looks*
per-die, but `reroll.below` is pool-scoped, so a glued `3d6ro<=2` beside
a d20 would silently reroll low d20s too. Resolution, decisive and cheap
— one rule for all three mods:

- **Single-die-type pool:** term-glued mods are canonical — `4d6dl1`,
  `8d6!`, `1d20ro<=1+3` (the integer modifier is not a die type). Reads
  and computes identically to Roll20.
- **Mixed pool:** *any* term-glued mod — keep/drop, reroll, explode — is
  a **parse error** with a fix ("keep/drop binds to one dice type — try
  `4d6dl1` alone, or use a trailing ` dl1` to apply across the whole
  pool"). The group-wide semantics this engine actually has are spelled
  as **trailing flags**: `1d20+2d6 ro<=2 dl1 !` — visibly nonstandard,
  therefore honest.
- Long-term (post-launch): add term scoping to `rollspec.js` and retire the
  trailing form. Not in this cycle.

**Order of operations is documented next to the grammar**, verbatim from
`rollspec.js`: adv → reroll → keep/drop → explode → total, with the note
that RPG Dice Roller explodes *before* keep/drop, so `4d6!dl1` can differ
from that reference.

**Canonical form** (one renderer, replacing both `main.js formula()` and
the formula half of `urlgroups.js encodeGroups()`): no interior spaces in
`expr`, mods glued (single-type) or trailing (mixed), terms in fixed
die-size order (d4→d20, integer modifier last with explicit sign), flags
then `dc` then `# comment` separated by single spaces:

```
1d20ro<=1+3 adv dc15 # The lie leaves your lips
4d6dl1
3d6+1d20+5 ro<=2 ! dc15 # Firebolt
```

The first line is the flagship *Deception* command; the identical string
threads through both mockups (`panel.html`'s ± popover and
`roll-moment.html`'s intent card). The third shows the mixed-pool
trailing form — glueing any of those mods inside that pool is the parse
error defined above.

Visibility **is** in the notation string, as a trailing flag in its own
slot — `held`, `secret`, `w:Name` (§7.8). An earlier draft kept it out (no
market tool puts it there) and the notation-totality invariant reversed
that: a saved group whose canonical string cannot say "secret" saves a
public roll, and links, history and `#g=` all silently downgrade privacy.
On the wire it still travels as a field beside `mods` (§3.0), because it
does not alter values. The `/gmroll`-family prefixes are accepted for paste
compatibility and normalize into the slot (`/gmroll`→`held`,
`/selfroll`→`secret`); canonical output never emits a prefix.

### 1.2 Parser API

```js
parseNotation(str) →
  { ok: true, spec: { dice, mods },        // rollspec-shaped
    terms,                                  // per-term list for chip/card render
    label, target,                          // from #, dc (or null)
    visibility,                             // {mode, names[]} from the
                                            //   visibility flag or /prefix
                                            //   (or null = open) — §7.8
    canonical }                             // normalized string
| { ok: false, state: 'incomplete' | 'invalid',
    error: { code, index, len, message, fix? } }

renderNotation(spec, {label, target}) → canonical string
```

`state:'incomplete'` covers every prefix of a valid command (`2d`, `4d6k`,
`1d20 a`). Error copy is plain language, never a thrown `Error.message`:
`bad_keep_n` → "keep 5 of 4 dice — keep fewer than you roll", with
`fix:'4d6kh3'` rendered as a one-click **Use this**. Explicit non-goals get
messages, not crashes: `*`/`/`/`()` → "only + and − for now"; `cs>=8` →
"success counting isn't in yet"; `!>4` → "dice explode on their max face
only". Engine caps are **amber warnings that never block**: "capped at 40
dice", "explosions chain at most 3 deep".

### 1.3 The command box

**Placement:** in `#builder-panel`, a full-width monospace input directly
below the tray chip row and above the Roll/Empty button row.
`id="notation-box"`, `placeholder="2d6+3, 4d6dl1, 1d20 adv dc15 …"`,
`font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums`.
Hidden in mini mode.

**One canonical string, two editors.** Die buttons and tray chips rewrite
the box; typing in the box rewrites the tray and the `±` popover state.
There is no divergence to reconcile because the spec object is the single
source of truth and the box is a projection of it (see §1.5).

**Validation states — three, never two** (debounce 300 ms after last
keystroke, also on blur; messages live in a fixed-height 18px slot below
the box so nothing jumps):

| State | Border | Slot content |
|---|---|---|
| valid | `--panel-border` → subtle gold | `min 6 · avg 13.5 · max 21` (live `previewSpec(dice, mods, 2000)`) — the preview *is* the validator |
| incomplete | unchanged, never red | muted hint, e.g. "… needs a number of faces" |
| invalid | `--red`, caret glyph `^` under `error.index` | message + **Use this** chip when `fix` exists |

**Enter** rolls the parsed command (identical path to the Roll button).
**`/`** as first character opens a filtered token list (non-enforcing —
free text always allowed): `/gmroll`, `/sr`, plus mod tokens
`kh kl dh dl ro ! adv dis held secret w: dc #`, one line of help each,
arrow keys + Tab to accept. Every token is always listed — there is no
seat, no role, and therefore nothing to condition the list on; the
`/gmroll` family is described as what it is, paste sugar for `held`
(§7.8).

**History:** ↑/↓ recalls the last 10 executed commands, per-room, stored in
localStorage key `rollHistory:<room>`. This is the same store the banner's
`⟳` Reroll-last (roadmap §3) reads — one store, two consumers.

### 1.4 Notation chips on group rows and mini pills

- `.group-formula` (11px muted, exists today) shows the **full canonical
  notation** including mods: `2d20kh1+3 adv`. Monospace, tabular-nums,
  ellipsis-truncated with `title` carrying the whole string. This requires
  groups to store the spec, not just dice — done in the same slice (§6,
  slice 1) so the chip never lies about what the button rolls.
- Clicking `.group-formula` copies the notation to the clipboard (toast:
  "notation copied") and focuses the command box with it — chip text is
  guaranteed pasteable because chip text *is* canonical form.
- Mini-bar pills: `title = canonical notation`; when a group has no name,
  the pill label is the notation itself (replaces today's `formula(tray)`
  fallback, same renderer).

### 1.5 Round-tripping (popover ↔ notation ↔ URL)

The invariant: **spec object is truth; notation is its stable projection.**

- `±` popover edits mutate `{dice, mods, label, target}` → box re-renders
  via `renderNotation`. Box edits parse → popover controls re-render.
  Guaranteed lossless because grammar and `validateMods` cover the same
  space (enforced by a round-trip unit test: `parse(render(spec)) ≡ spec`
  for generated specs).
- **URL codec v2** (`urlgroups.js`): body becomes
  `name=canonicalNotation;…` — e.g. `Attack=1d20kh1+3 adv dc12 %23to hit`
  (names *and* comments `encodeURIComponent`-escaped since `;`/`=`/`#` are
  delimiters), then base64url as today. The v1 decoder regex is a strict
  subset of the grammar, so **every existing `#g=` link decodes unchanged**;
  the encoder always writes v2. The group's moment and its visibility need
  no side-channel: both are canonical-notation flags (`check`, `held`,
  `w:Kira` — §7.6, §7.8), so they ride the stored string for free and a
  shared link cannot lose a group's privacy. Only a future dice-set id
  still needs a trailing `@set=ember` token (parser-private, never shown in
  chips); the once-planned `@exp=` / `@vis=` tokens are retired.
- **Unnamed groups** (§1.4) encode with an empty name segment — `=4d6dl1`
  — and the v2 decoder accepts `eq === 0`, labelling the group by its
  notation. Compatibility is **one-way by design**: every v1 link decodes
  on a v2 client, but a v2 link using anything v1 cannot express — mods,
  flags, `dc`, comments, `@` tokens, or an empty name (v1 rejects the
  whole link on `eq < 1`, `js/urlgroups.js`) — fails *closed* on an old
  client: `decodeGroups` returns null, the app opens with defaults, and
  no half-imported list appears. Worth stating because it is silent — an
  old client shows no error, just no groups.

### 1.6 Server implications

`/api/roll` and `/api/offer` accept an optional `notation` string. When
present the server parses it with the shared `js/notation.js` and **derives
dice+mods itself, ignoring any client-expanded arrays** — the server is the
value authority, so the parser's limits (≤40 dice, dc ≤ 999, comment ≤ 64
chars, control chars stripped) are security limits. `parseRollSpec()` in
`server.js` grows one branch; wire error codes stay the existing terse
strings (`bad_keep_n` etc.), the client maps them to friendly copy.

---

## 2. Roll experiences

### 2.1 What an experience is

**One layout with named slots, driven by a small declarative record.** Not
a layout engine — user-authored experiences are data that cannot break the
page. Slots, top to bottom on the stage card:

```
eyebrow → title → subtitle → targetBadge → [3D stage] → chips →
modCards → verdict → flavor → actions        (+ matText, in the felt)
```

```js
// Experience record (localStorage `experiences`, plus 3 built-ins)
{ id: 'check',                 // 'plain' | 'check' | 'cinematic' | user ids
  name: 'Check',
  eyebrow: 'ORDEAL',           // small-caps line; free text
  titleFrom: 'attachment',     // title/subtitle come from the attachment
  target:   'optional',        // whether the attach form shows a Target field
  readouts: ['verdict','chart'], // which verdicts render; order = prominence
  showOdds: false,             // "72% to clear 15" on the intent card
  motion:   'ceremonial',      // 'ceremonial' | 'brisk' | 'instant'
  frame:    'ornate',          // 'ornate' | 'plain'
  matText:  'template' }       // attachment supplies the string
```

```js
// Attachment (on a group, or on an offer)
{ exp: 'check', title: 'Deception', subtitle: 'CHARISMA CHECK',
  matText: 'The lie leaves your lips…',
  target: { value: 15, cmp: '>=', scope: 'total',
            label: 'DIFFICULTY CLASS' } }
```

`target.cmp` defaults `'>='` but is a real field (roll-under systems
exist); `scope:'each'` is reserved for roadmap §8 success counting — same
field, different verdict rendering (success-pip row instead of ring), not
built now. There is **no `target.hidden`**: stakes are public on every
visibility rung (§3.0), so the target number and its odds line render the
same for everybody — the drama comes from the held *result*, not a secret
number. **Do not define more layouts**; a new "experience" is a new record —
new eyebrow, readout mix, motion tier, frame, mat template — over the same
slots. If a genuinely new slot arrangement is ever needed, that is a new
`layout` field with a second hand-built arrangement, added then, not now.

### 2.2 The three launch experiences

| | Plain | Check | Cinematic |
|---|---|---|---|
| behavior | exactly today | staged moment | Check + slow-mo + fanfare |
| intent card | none | yes | yes |
| target | — | optional | optional |
| readouts | chart (banner) | verdict + chart | verdict + chart |
| motion | instant | ceremonial | ceremonial+ |
| frame | — | ornate | ornate |
| mat text | — | yes | yes |

Plain is the default for every existing and new group; nothing changes
until a human dresses a roll up. **Ceremony selectivity is load-bearing**
(BG3 backgrounds most rolls), and it is selectivity of *dress, not
scheduling*: `playRoll` runs one playback at a time over the one shared
cannon world and overlapping rolls queue FIFO — that stays true for every
tier. A Plain roll plays and drains the queue exactly as today; a
Check/Cinematic roll holds the stage through its phases before the queue
advances. Concurrent playback would require per-roll physics worlds
(settled dice become static bodies mid-queue) and is explicitly out of
scope.

### 2.3 Attaching an experience

- **Group row:** the `±` popover gains a final section, "Moment", with a
  segmented control `Plain · Check · Cinematic · +` and — when non-Plain —
  three text fields (Title, Subtitle, Mat text; all optional, sensible
  fallbacks: title ← group name, mat text ← title) and an optional Target
  number + label. `+` opens the experience editor (a form over the record
  fields — no freeform layout editing).
- **Offered rolls:** the offer composer includes the same "Moment" section;
  the attachment rides the offer payload. An offered Check is the full
  BG3 card: the offer *is* the intent card, waiting on the table for
  whoever clicks Roll.
- **Command box:** `# text` fills the mat text/title for one-off rolls;
  `dc15` attaches a Check with that target (a `dc` with no experience
  implies Check — a target with no staging would be mute).
- Serialization: attachment fields ride the group record, localStorage, and
  the `#g=` codec (§1.5).

### 2.4 Staging timeline (Check, ceremonial)

All phases hang off the two existing hooks: keyframe playback
(`stepPlayback`) and `showResults(roll)`. Physics untouched.

| Phase | Time | What happens |
|---|---|---|
| **0 Intent** | user-controlled dwell | Card rises center-screen, 320 ms `cubic-bezier(0.22,1,0.36,1)`: eyebrow, title, subtitle, target ring (number only), modifier chips pre-visible desaturated at 55% opacity, **Roll** button. Mat text fades into the felt (§5.4) over 600 ms. No timer — tension is free when the user holds the clock. |
| **1 Commit** | 0–250 ms | Card docks to a top strip (250 ms). Felt vignette +15%. UI/ambient audio ducks ~6 dB (shelf on the existing `audioCtx` graph). Throw sound. |
| **2 Tumble** | ~1.2–2.5 s (existing) | No camera moves. Non-dice UI exposure dimmed. |
| **3 Hit-stop** | settle → +110 ms | Freeze on final keyframe, one radial flash. |
| **4 Chorus** | +110 ms → +110+n·stagger | Value chips pop in, counting dice first, discards last (struck-through, 45% opacity). Stagger 70 ms (n≤6), 40 ms above. Each chip flies a ghost numeral into the total slot; the odometer ticks as it lands. |
| **5 Rescue** | 120 ms apart | The docked strip unfolds into the **verdict card** — same top anchor, wider — and modifier cards slide up from its bottom edge (`+3`, `ADVANTAGE`, `REROLLED 1 → 14`, `EXPLODED ×2` — written from `perDie` reasons), each with a 1.0→1.08→1.0 punch and an odometer tick. The BG3 patch-5 beat. |
| **6 Verdict** | +150 ms | On the verdict card, the total lands with overshoot `cubic-bezier(0.34,1.56,0.64,1)`. Target ring fills to `total/target`, snaps success/failure color; overflow shown as a `+7` margin tick, never a silently maxed ring. |
| **7 Flavor** | +200 ms | Soul Deal word fades in per the readout rules (§2.5). |
| **8 Crit** | crit only | +250 ms hold, existing `.shake`, gold sweep. Trim `playCritEffect` overlay 1700 → ~1100 ms. |

**Placement — one anchor, no occlusion.** Phase 0's intent card is
center-stage while the table is still empty; from Commit onward every
piece of card chrome lives at the **top anchor** — the strip during the
tumble, the verdict card (the strip, unfolded) from phase 5 — and the
throw targets the center/lower felt, so the card never parks over the
pool or its value chips. Large pools scatter: if a die does settle in the
top band, the card's translucent blur ground keeps it visible and that
die's value chip renders **above** the card. Chips are never occluded,
whatever the pool size.

**Budget, enforced:** post-settle ≤ 700 ms for 1 die, ≤ 1.2 s for 4,
≤ 1.6 s worst case. **Any click or Esc during phases 1–7 jumps to final
state** through the existing fast-forward path, registered within 150 ms.

**Cinematic** = Check plus: playback rate eased to 0.35× over the last
~400 ms of keyframes (pure playback-clock scaling — keyframes are
pre-simulated, so slow-mo is free and desync-proof), a two-note fanfare on
verdict, gold frame sweep, and budget ceiling 2.2 s. **Brisk** = phases
3, 4, 6 only at half duration. **Instant** = today's behavior.

Guardrails shipped *before* the ceremony (BG3's complaint thread is the
cautionary tale): a global "Always skip roll ceremony" toggle in settings
(roadmap §5, "Just you" scope), and a `@media (prefers-reduced-motion:
reduce)` block in `style.css` — staged reveal kept (it is information),
converted to opacity fades, stagger 0, no shake/flash/overshoot/sweep.

### 2.5 Verdict vs Soul Deal — one hero slot

Target verdict and `meaningFor()` **will** disagree; they are never
reconciled and never merged. The card has one large readout:

- Target set → verdict owns it (`SUCCESS` / `FAILED`, large); the chart
  word demotes to a small labeled line: `Chart · Advantage`. Disagreement
  is labeled, not hidden — a Soul Deal table reads it as "you cleared it,
  at a cost."
- No target → the chart word owns it, exactly as today.
- `readouts` lets an experience drop either one (a combat experience with
  `['verdict']` turns the chart off — that option is much of what makes
  experiences feel real).
- Face extremes (`isMax`/`isMin`, already computed) are a third,
  independent channel: a gold ring / red crack on that chip only. The
  three signals never repaint one another.

### 2.6 Multiplayer and mini mode

**Values and staging are server-authoritative; pacing is client-local.**
The attachment (title, subtitle, mat text, target, experience id) rides the
`roll` / `offer` SSE payloads — the card *is* the shared moment, and it
survives redaction intact: a held or whispered roll keeps its whole
ceremony, only the result slot goes face-down (§3.1). Every client renders
the intent card and mat text; only the
roller (or offer-claimer) gets the Roll button; spectators see
`Kira is about to roll…` in the actions slot. `motion` tier, skip, sound
and reduced-motion are strictly local — one player's skip never truncates
another's playback. Dwell (phase 0) is bounded for spectators only by the
roller acting; an offer card persists as today until claimed or rescinded.

**Mini mode degrades to brisk-or-less, no card:** intent card and mat text
are skipped; the group pill pulses gold during the tumble; the result
strip (existing mini result) appends the verdict word:
`Deception · 17 vs 15 · SUCCESS`. Cinematic in mini renders as brisk.

---

## 3. Visibility, role-free

**A four-rung ladder, chosen per roll.** Privacy here is a property of a
*roll*, not of a person: there is no seat, no permission grid, and nothing
is ever disabled for anybody (goal 10). Every rung is available to every
player on every roll surface (goal 11).

This section is the **as-built** spec for roadmap step 4 — §3.0 is the wire
and server contract, §3.1 the presentation, §3.2 the modes as a player
meets them, §3.3 offers. The notation spelling lives in §7.8.

### 3.0 Prerequisite, made real: the wire and the projection

Face-down used to be honor-system — `broadcast(room,'roll',roll)` sent
values to everyone and the client printed `?`. That is over. The values a
client is not entitled to **never reach it**.

**Wire shape.** `visibility` sits *beside* `mods` — it does not alter
values, so it does not belong in `rollspec.js`. The server-side entry
carries the full record:

```js
entry.visibility = {
  mode: 'held' | 'secret' | 'whisper',
  audience: [playerId, …],    // whisper only
  revealAuthority: playerId   // the chooser (§3.3)
}
entry.revealed = true          // once revealed
```

**Absent means open**, and open is the default. An open roll never grows a
`visibility:'open'` key: the field is present-or-absent exactly like
`cleared` and `exp`, so a plain payload stays byte-identical to what it was
before visibility existed (a protected conformance — ROADMAP.md).

**The ladder, in wire terms:**

- **open** — everything, to everyone. No field on the wire.
- **held** — face-down for **everyone including the roller** until reveal.
  Public stakes (dice, roller, notation, `dc`), hidden result.
- **secret** — the roll exists **only for the roller**. Other players
  receive nothing at all: no SSE event, no `hello` entry, no log line. No
  reveal path exists (use held or whisper for revealable privacy).
- **whisper** — a named audience sees everything live; everyone else sees a
  **shrouded** roll: existence public, result hidden.

**`projectEntryFor(entry, viewerId)` — the critical invariant.** It runs on
**every** path an entry leaves the server:

1. the `roll` broadcast,
2. the roller's `POST /api/roll` response,
3. the claimer's `POST /api/claim` response,
4. the `reveal` broadcast,
5. the `hello` SSE payload,
6. the `/api/join` snapshot,
7. collected-shelf reconstruction and any log resync.

Missing one is a total leak, not a partial one — and `hello` fires on every
stream reopen, so a proxy blip is enough. `broadcast()` was the easy half
(it already loops player-by-player); paths 2, 3, 5 and 6 do not go through
it and each project on their own.

| Entry | Viewer | Projection |
|---|---|---|
| open, or `revealed` | anyone | **full** |
| secret | the roller | **full** |
| secret | anyone else | **omitted entirely** — the roll does not exist for them |
| held | anyone, **including the roller** | **redacted** |
| whisper | an audience member | **full** |
| whisper | anyone else | **redacted** |

**The redacted projection drops** `values`, per-die results, kept/struck
marks, explode-children values, `mods.parts` amounts, `total`, `meaning`,
and the `dc` verdict — and adds `redacted: true` plus
`visMode: 'held' | 'whisper'`.

**It keeps** `rollId`, roller id + name + `color`, dice types and counts,
`seed`, `t`, the roll's `label`, the `dc` target, the `exp`/ceremony
fields, the `faceDown`/`revealed`/`collected`/`cleared` flags, and
`revealAuthority`. Four of those are deliberate:

- **`seed` is safe.** Values are crypto-RNG'd *independently* of the seed;
  the seed drives poses only. Shipping it leaks nothing and buys every
  client the identical tumble (§3.1).
- **`dc` is public on purpose.** Public stakes, held result — "she rolls
  against DC 15 and nobody can see the die" is the dramatic pairing this
  whole ladder is built around. Hidden DCs are rejected (§3.4).
- **`revealAuthority` is a `playerId`, not a value.** Shrouded clients need
  it to know whose **Reveal** button this is — on an offered roll the
  authority sits *outside* the audience (§3.3), so it cannot be inferred
  from the roller. The `audience` list itself is never repeated in the
  redacted copy.
- **Addressing is public, only the result is private** — the same as
  watching someone lean over and whisper at a real table. *As built, this
  is carried by `label`, not by a separate notation field:* a roll entry
  has no `notation` key on the wire, and `label` is the notation's
  `# comment` when it has one, falling back to the canonical string the
  rolling surface composed. So `1d20 w:Kira` shows shrouded viewers
  `1d20 w:Kira`, while `1d20 w:Kira # Perception` shows them `Perception`
  and keeps the audience to itself. Both are acceptable; neither is a
  values leak. Whether the audience should be legible *unconditionally* is
  an open question — see ROADMAP step 4b.

**Audience resolution (whisper).** Names are matched **case-insensitively
against the current room roster at roll/offer creation**, then stored as
player ids — so a later rename never changes who may see the roll.

- An unmatched name **rejects the action**: error code `unknown_audience`,
  message naming the offender. Fail closed: a typo must never quietly
  broadcast the roll, and must never quietly narrow it either.
- **Duplicate player names: every match joins the audience.** With no auth
  there is nothing to disambiguate on; this is documented behavior rather
  than resolved behavior, and renaming is the fix.
- **The chooser is always implicitly in the audience** — a whisper can
  never lock out its own author.

**Accepted leak: exploding dice.** An exploding roll shows its extra dice
to shrouded viewers, so a spectator can count them and infer that max faces
came up. Accepted deliberately, on the physical analogy: at a real table
the extra dice are visible too. Suppressing them would break the
byte-identical seeded tumble that makes shrouding free.

**Not a wire path, still a surface:** the server's stdout roll log is a
disclosure surface too, and it is redacted the same way. An open roll logs
`values=… total=…`; a non-open roll logs its stakes and `vis=<mode>` and
never its numbers, so an operator tailing the log cannot out-read the
table. The rollId-bearing housekeeping lines (`collect`, `evict`) name only
ids. Anyone writing new logging should treat entries the same way the wire
does.

### 3.1 The shrouded die (the differentiator)

The tumble is seeded (`mulberry32(roll.seed)`); values only ever enter as a
final per-die correction quaternion. So a redacted client replays the
**byte-identical throw** with `correction = identity` and a numberless
*obsidian-blank* material (§4.4's internal twin of Obsidian Shroud) — true
privacy, zero desync. Poses may diverge slightly across clients, which
costs nothing: there is nothing written on those dice to read.

- `playRoll`'s `types.length !== values.length` guard admits
  `values == null`, and every hidden branch keys off **"values absent"**,
  never off a boolean — so chips, banner, breakdown, log, shelf marker,
  peek and meaning all fall out correctly for every rung with no extra
  branching.
- **Chrome renders a held card**, never a blank: roller name, dice,
  notation, `dc`. The result slot shows an explicit face-down state — a
  number never appears there, not even briefly.
- **Reveal is a staged beat**, not a repaint: materials cross-fade obsidian
  → the roller's set, each die's correction is computed from
  `faceNormalForValue` and slerped into place (~400 ms), chips fill in,
  then the verdict/meaning lands. It is dt-clock driven inside `sim()`, so
  it is skippable like everything else (*always interruptible*).
- **A reveal arriving mid-playback defers** until the shrouded roll
  settles — the same pattern as `pendingClears`/`pendingCollects`. This
  race was found and fixed once (commit `7f9cdf5`); it must not regress.
- **Held rolls keep their full ceremony.** A held roll carrying an `exp`
  runs declare → tumble → settle normally and its verdict card shows the
  held state plus a **Reveal** button for the authority. A dressed roll is
  never silently downgraded to Plain because it is private — public stakes
  with a held result is the moment the ceremony exists for.
- **Shelf parity:** a redacted roll collects like any other, keeps its
  obsidian cluster, and its marker shows the held state instead of a total.
  Settled values are never read back off a shrouded roll's frozen bodies —
  an identity-corrected die would yield a plausible *wrong* number and bake
  it into the marker and the peek card.
- **Peek** on a redacted roll shows the same held card (plus Reveal for the
  authority). A private roller-only inspector is not a thing: `held` hides
  from the roller too, and `secret` needs no inspector because that client
  has the values already.

### 3.2 The four modes

| Mode | Who sees the result | Who knows it happened | Revealable |
|---|---|---|---|
| **Open** | everyone | everyone | — (default) |
| **Held** | nobody yet — the roller included | everyone (stakes public) | yes |
| **Secret** | the roller alone | the roller alone | **no** |
| **Whisper to…** | the named audience + the chooser | everyone (shrouded) | yes |

Held is the tension mode: the table watches shrouded dice land against a
public DC and waits on you. Secret is the private mode: nothing about it
exists for anyone else — no log line, no shrouded dice, no "Nyx rolled
something". Whisper is the selective mode, and the one that builds a GM
screen when it rides an offer (§3.3).

**Choosing it.** Every roll surface can express every rung (the
uniform-surfaces invariant, §7.4), through two paths that are the same
truth: the notation flags `held` / `secret` / `w:Name` (§7.8), and a
visibility control in the `±` popover, which doubles as the offer composer
(its Roll and Offer buttons apply the same edited intent). The segmented
control reads `Open · Face down · Secret · Whisper`; Whisper opens a name
picker over the current roster (recipient chips: player dot + name), and a
whisper with nobody named disables both verbs rather than rolling wide.

**Not sticky, and therefore un-badged.** The picker starts from the
notation it was opened on, every time — there is no remembered per-player
default. That is deliberate for now: a sticky non-open default is the
number-one accident vector, and carrying one would require the eye-slash
badge on the Roll button and the mini pills to be safe. Neither ships.
What does the announcing today is the composed notation itself — the
popover echo always spells the mode out (`… secret`, `… w:Kira`) and the
preview line says it in words (`· face down`, `· whisper to Kira`). A
sticky default plus its badge are a matched pair; see ROADMAP step 4b.

Everyone always learns *that* a non-secret hidden roll happened: shrouded
dice land, and where an open roll's log line shows a total the hidden one
shows `face down` / `whispered` in its place. Secret is the one rung with
no trace, by definition — it is the only silent roll, and it can never be
un-silenced.

**Solo and static parity (goal 9).** With no server there is one player and
one client, and the ladder collapses to what one player can mean by it:

- **`held` keeps its full local flow** — shrouded playback, hidden result,
  and a local reveal. It still hides from you until you reveal it, which
  is the whole point of that rung.
- **`secret` and `open` are indistinguishable** to an audience of one, and
  solo treats them as such.
- **`w:` has nobody to whisper to.** The popover disables Secret and
  Whisper offline (the sub line says so: *secret & whisper need a table —
  you are playing solo*), and a `w:Name` typed into the command box parses
  and then **rolls open** — solo has no roster to reject a name against
  and no second client to withhold anything from.

So the ladder never becomes dead code offline, but solo is *degraded
gracefully*, not fully mirrored: the rungs whose whole meaning is "someone
else" are the rungs that flatten. A room that later gains players gets the
real ladder back with no change to the saved notation.

### 3.3 Offers, reveal authority, and the GM-screen roll

*(The claimable DM seat that occupied this section is **rescinded** — goal
10, and GOALS.md's superseded-decisions note. Its powers live here, in the
open, available to everyone.)*

**Reveal.** `POST /api/reveal {rollId}` is honored **only for
`entry.visibility.revealAuthority`**; anyone else gets `403
not_reveal_authority`, server-enforced rather than merely un-rendered.
Revealing an already-revealed roll is a 200 no-op.

- **The authority is the chooser**: the roller for a self-roll, the
  **offerer** for an offer that carried held / whisper / secret.
- **held and whisper are revealable; a self-rolled `secret` is not.** That
  roll never left the roller's client, so there is nothing anywhere to
  upgrade. A *secret offer* is a different animal — it means
  offerer-only, which is a whisper with an audience of one, and the
  offerer can reveal it (below).
- The reveal event carries the **full entry**, not just `{rollId}` — the
  shrouded clients never had the values, so the event is what delivers
  them, and every client upgrades in place (§3.1).
- **Reveal is total and one-way.** It promotes the entry to full for
  everyone; there is no reveal-to-one, and there is no retraction. An open
  roll's values already reached every client, so "make private" could only
  scrub UI while logs and memory keep them — honor-system cosmetics, which
  is precisely what §3.0 exists to eliminate. *Rejected: a 10-second "make
  private" window.* Roll it held or not at all.

**Offers carry visibility, chosen by the offerer.** The field rides the
offer exactly as it rides a roll, and is applied **verbatim** to the roll
the claimer produces. `revealAuthority` on that roll is the **offerer**
whenever the offer carried a visibility, and the roller otherwise.

**The claimer is not in the audience unless named. That asymmetry *is* the
GM screen** — the claimer rolls blind, the offerer holds the result:

- `secret` on an offer means **visible to the offerer only** (the offerer
  is the chooser). The claimer's own client receives a redacted roll.
  Internally this may be implemented as a whisper with audience
  `[offererId]`; the notation and the UI present it as the offerer's
  choice.
- The claimer's `POST /api/claim` **response** is projected like every
  other egress (§3.0 path 3). The leak that matters here is not the
  broadcast — it is the direct HTTP reply to the one person who must not
  see the number.

**The recipe, with no GM anywhere in the system:** offer
`1d20+5 secret dc15 # Perception`, someone claims it, their dice tumble
shrouded on *every* table including their own, only you see the number, and
you press **Reveal** when the story wants it.

**Where the seat's four powers went.** (1) Default whisper target →
`w:Name`, any name, no seat. (2) Blind offered rolls → offer visibility,
above. (3) Hidden Targets → **not shipped**: `dc` is public on every rung
(§3.0). (4) Housekeeping → already universal (§7.7: a collected roll can be
cleared by anyone).

### 3.4 Rejected

Recorded so they stop coming up:

- **The DM seat / `room.host`** — rescinded by goal 10. Nothing role-shaped
  returns: not a badge, not a claim endpoint, not a `hostToken`, not
  `host-changed`. Blind rolls do not need a host; an offerer already
  exists, and §3.3 uses them.
- **Hidden DCs.** Stakes are public on every rung. A hidden target would
  also silently mute the odds line and the verdict ring for everyone but
  one player — two special cases bought for one trick that `held` already
  performs better.
- **Role-addressed `/gmroll` semantics as the *model*.** Whisper-by-name
  covers it; the `/gmroll` family survives only as paste sugar that
  normalizes to `held` (§7.8).
- **Per-skill / per-group visibility default grids.** A saved group already
  carries its visibility inside its canonical notation (§1.5, §7.8) — the
  90% substitute, with no new state to sync.
- **Permission grids, kick, rename-others.** With no auth, kicking is
  theater.
- **Reveal to a subset**, and **un-revealing** (§3.3).
- **Secret with a reveal path.** Reveal needs a recipient who was told
  something existed; secret tells nobody. Wanting "secret, but revealable
  later" means wanting `held`.

---

## 4. Dice sets

### 4.1 Model

Rides roadmap §4's planned material-cache re-key, extended one field:
cache key is `(type, setId)` and a set resolves to concrete values at
registration.

```js
// js/dicesets.js — data only, dependency-free
{ id: 'ember', name: 'Ember Pact', extends: 'ivory-court',
  body: '#7a1f14', numeral: '#ffd766', edge: '#e2493b',
  material: { metalness: 0.05, roughness: 0.55 },   // tier 1
  effect: 'ember' | null,      // single flag, gated behind a perf check
  sound: { cutoff: 2200, decay: 0.9 } }              // landing-sound profile
```

`extends` is dddice's inheritance key: a user set is a one-line diff over a
parent, which is the difference between "10 sets" and "a set format".
`sound` shapes the existing synthesized impact (filter cutoff + decay) —
two numbers that make "brass" and "bone" *sound* different, cheap and
disproportionately convincing. `effect` is a named flag (`ember` = faint
emissive pulse on crit, `nebula` = slow hue drift), implemented later;
unknown flags no-op.

**Precedence (extends roadmap §4's chain by one rung):** individual die >
group override > **player set** > player color > die-type default. Five
rungs, **one axis**: every rung resolves to a *set id* before anything
touches the renderer or the wire. A bare color — roadmap §4's player/die
colors, or a group swatch — derives an **anonymous set**:
`extends: 'ivory-court'`, `body` = the color, `id` = the color literal
(`'#7a1f14'`). So roll events always carry per-die set ids (§4.2), the
`(type, setId)` cache needs no color code path, and roadmap §4's group
color swatch and §4.2's group set are the **same rung and the same
control**, not two competing knobs — picking a swatch stores an anonymous
set id.

### 4.2 Per-player identity, synced

The set is **player identity**: everyone sees the roller's dice in the
roller's set — on a shared table it identifies whose dice landed better
than color alone. New endpoint `POST /api/style {set}` → SSE
`player-styled {playerId, set}`; included in `publicPlayers()` and `hello`.
Roll events carry **resolved per-die set ids** (subsuming roadmap §4's
per-die colors — colors fold into anonymous sets per §4.1, so the set id
is the *only* per-die style field on the wire) or replay diverges. Group override: a swatch+set control on the
group row (a "Fireball" group pins Ember Pact); serialized as `@set=` in
the codec (§1.5) so bookmarked groups keep their look. **No per-roll set
choice** — an extra decision inside the tension beat kills the beat.

### 4.3 Picker

BG3's best detail: the picker lives **inside the roll moment**. A small
circular control bottom-left of the intent card (and in the players panel
next to your own row) opens "Choose your dice": a grid of **live d20
thumbnails** (free rider on roadmap §6's offscreen thumbnail rendering —
sequence roadmap §6 first), 5 per row, set name beneath in 11px muted
caps, current set gold-ringed, click = select + `POST /api/style`, Esc
closes. One grid, no tabs, no preview pane — the thumbnail is the preview.

**No authoring UI at launch** (resolving the open question the mockup
flags): `extends` is the *format's* inheritance key — the ten built-ins
use it, and it is what will make a user set a one-line diff when
authoring lands. When it does, it arrives as a single "New set…" tile
appended to this same grid (still one grid, no tabs, no preview pane).
Until then, hand-written records in localStorage `diceSets` are honored
at registration; unknown fields no-op.

### 4.4 Launch sets (10)

All chosen to sit on the **green felt** — `#1f3128`, `makeFeltTexture()`
in `js/main.js`, the surface every mockup must paint — without fighting
`--gold`. Standing rule: every `body` keeps a clear luminance gap from
the felt green so no set camouflages into the table (the original
dark-jade Serpent Jade failed exactly this test and was re-cut pale):

| Set | body | numeral | edge | material | effect |
|---|---|---|---|---|---|
| **Ivory Court** (default) | `#f3ead7` | `#2a2018` | `#d8c9a3` | plastic | — |
| **Gilded Oath** | `#d4af37` | `#1c150b` | `#ffd766` | metal (m .85 r .3) | — |
| **Ember Pact** | `#7a1f14` | `#ffd766` | `#e2493b` | plastic | ember |
| **Stormwell Blue** | `#1e3a5c` | `#cfe6ff` | `#4a7fb5` | plastic | — |
| **Voidwine** | `#3d1f4e` | `#e8c8ff` | `#7a4a9e` | plastic | — |
| **Serpent Jade** | `#7fb69a` | `#1f3a2d` | `#4a8a68` | stone (r .8) | — |
| **Clockwork Brass** | `#6e5323` | `#f3ead7` | `#a8853f` | metal (m .7 r .45) | — |
| **Gravebone** | `#cfc4ac` | `#4a1f14` | `#9c8f77` | stone (r .9) | — |
| **Nightglass Nebula** | `#171226` | `#ffd766` | `#4a3a7a` | plastic | nebula |
| **Obsidian Shroud** | `#0d0b09` | `#8a8178` | `#2a2420` | glassy (r .2) | — |

Obsidian Shroud is pickable and **fully numbered** (graphite numerals) —
a player who rolls face down by habit can *live* in it and still throw
dice the table can read. The hidden-roll material (§3.1) is its
**internal, numberless twin** `obsidian-blank`
(`extends: 'obsidian-shroud', numeral: null`), which never appears in the
picker. The hidden→reveal cross-fade stays part of the set system,
dddice-style — reveal fades the blank shroud into the roller's real set —
and it remains a real beat even for an Obsidian loyalist: numberless
black flips to numbered black, and the numerals arriving *is* the reveal.

---

## 5. Visual language

### 5.1 The rationing rule

**Ornamentation is rationed to one element for a few seconds.** The app
stays flat and modern everywhere; the roll-moment card is the only dressed
element, and only while it is on stage. This single rule is the difference
between "modern app with a dramatic moment" and "fantasy skin".

### 5.2 Typography

- Keep `--font-display: Georgia` and `--font-ui`. No new typeface.
- The BG3 signature is the **vertical hierarchy**, not the filigree:
  letterspaced small caps → one big centered numeral → small chips. Build
  it first, plain, and evaluate before any gold: eyebrow/subtitle style is
  `text-transform: uppercase; letter-spacing: .18em; font-size: 11px;
  color: var(--muted)`.
- The total/odometer: `--font-display` at ~64px,
  `font-variant-numeric: tabular-nums lining-nums` — **mandatory**, or
  Georgia's default figures reflow every odometer tick.

### 5.3 The ornate frame (card only)

- Four absolutely-positioned corner-ornament SVGs (inline, `currentColor`),
  a 1px gold hairline rule, and a soft inner gold `box-shadow`. **No
  `border-image`** (inconsistent repeat behavior, repaints on resize;
  outline/box-shadow composite off-thread).
- `backdrop-filter: blur(14px)` card ground instead of an opaque painted
  panel — the cheapest "modern" signal and the direct replacement for
  BG3's painted canvas.
- Gold stays a border/accent color: **< ~3% of card pixels**, never a fill.

### 5.4 Mat text — in the felt, not the DOM

The declaration ("The lie leaves your lips…") renders as a **canvas-texture
decal on the table plane under the dice**: letterspaced uppercase Georgia,
additive gold at ~20% opacity, 600 ms fade-in on intent, slow fade after
verdict. Dice land *on top of* the words. An HTML div with the same text is
a heading; this is diegetic and looks like nothing else on the web — the
one place to spend real effort, and the app's differentiator over BG3,
which has no table.

### 5.5 Motion principles

- Anticipation (small counter-move before commit), overshoot-and-settle on
  the total, `cubic-bezier(0.22,1,0.36,1)` for plants, hit-stop before
  celebration. `transform`/`opacity` only; no layout-affecting animation.
- Skip must register < 150 ms; every ceremony is escapable.
- `prefers-reduced-motion`: shorten and swap to fades — never strip the
  staged reveal (it carries information), always drop shake/flash/sweep.

### 5.6 Not copied from BG3

- **The portrait.** A painted portrait in a browser reads as skin. The
  card's identity anchor is the roller's color + initial monogram in a
  thin gold ring — same compositional role, no costume.
- Parchment/leather textures, embossed panels, beveled buttons, animated
  flames, custom cursors, shadows deeper than ~12px.
- The fixed ~3 s timer. Dwell is user-controlled; post-settle is budgeted.
- Ceremony on every roll. Plain rolls stay undressed and queue exactly as
  today (§2.2).
- Pre-adjusted targets. Raw target up top; bonuses fly in after the land —
  the patch-5 order is the whole trick.

---

## 6. Implementation phasing

Four shippable slices, each independently valuable, layered on the current
roadmap (roadmap §3 in progress; roadmap §4/§5/§6 sequenced inside the
slices). The
guardrails — reduced-motion CSS block + global skip toggle — land in
slice 1 because everything later leans on them.

**Slice 1 — Notation (rides roadmap §3, absorbs roadmap §12).**
`js/notation.js` (grammar, parser, canonical renderer, round-trip tests);
command box with three-state validation, `/` token list, history store;
`formula()` and `encodeGroups()` replaced by the one renderer; groups store
specs; codec v2; `/api/roll`+`/api/offer` accept `notation`; group-row
chips + copy-on-click. *Value: paste any Roll20-ish string and it rolls;
every chip and URL tells the truth about mods.*

**Slice 2 — Real visibility.** Per-recipient `projectEntryFor` on all
seven egress paths; `visibility` wire field (present-or-absent);
`held`/`secret`/`w:` notation; shrouded-die replay + staged flip reveal;
offer visibility with offerer reveal authority (the GM-screen roll); mode
picker (sticky, eye-slash badge) + whisper name chips.
*Value: face down becomes real privacy and the reveal becomes the
best-looking moment in the app — before any card exists.*

**Slice 3 — Roll moments.** Experience records + built-ins
(Plain/Check/Cinematic); attach UI in the `±` popover and offer composer;
intent card (plain frame first, ornate corners once the hierarchy is
proven); mat-text felt decal; hit-stop/chorus/rescue/verdict timeline;
target ring + one-hero-slot rule; Cinematic slow-mo (playback-clock
scaling) + fanfare; mini-mode degradation; attachment on roll/offer
events. *Value: the BG3 moment, shared across the table.*

**Slice 4 — Sets.** Dice sets tier 0–1 riding roadmap §4's cache re-key
(+ `sound`, `extends`); `POST /api/style` + `player-styled`; picker riding
roadmap §6 thumbnails; per-die set ids on roll events + `@set=` in codec.
*Value: identity dice for everyone — and the shrouded obsidian blank
becomes one variant of a system that already exists rather than a
one-off.* (This slice once ended with "…and the DM seat". It does not: the
seat is rescinded by goal 10 and its powers ship inside slice 2 as
per-roll choices — §3.3.)

### New wire surface (complete list)

| Kind | Name | Notes |
|---|---|---|
| field | `notation` on `/api/roll`, `/api/offer` | server re-parses, authoritative |
| field | `visibility` beside `mods`, on rolls **and offers** | `{mode:'held'\|'secret'\|'whisper', audience[], revealAuthority}`; **absent = open** so plain payloads stay byte-identical |
| field | `redacted:true` + `visMode` on redacted projections | replaces the dropped `values`/`total`/`meaning`/verdict |
| field | `exp` attachment on roll/offer payloads | title/subtitle/matText/target/expId |
| field | per-die `set` ids on roll events; `set` in `publicPlayers` | replay fidelity |
| endpoint | `POST /api/style` | `{set}` → `player-styled` |
| error | `unknown_audience` on roll/offer | a `w:` name that no one in the room answers to (§3.0) |
| error | `403 not_reveal_authority` on `/api/reveal` | anyone but `visibility.revealAuthority` |
| change | `/api/reveal` authority + payload | the chooser, not always the roller; the event carries the **full entry** |
| change | `broadcast` / `hello` / `join` / roll + claim responses / shelf resync | per-recipient `projectEntryFor` on all seven paths (§3.0) |

## 7. Addendum: physical-first input & attributed modifiers

Two principles arrived from Joe after §1–§6 were drafted. They are binding;
where they touch earlier sections, this addendum wins.

### 7.1 Physical tray building (supersedes the button grid as the primary path)

**Principle: physical analogy over UI.** The die-type buttons and tray chips
of §1.4 become the *fallback* (kept for mini mode and accessibility). The
primary build path is physical:

- **The shelf.** One specimen of each die type rests along the front-left
  edge of the felt — real meshes from the live renderer, idle, at rest.
  Hovering one lifts it 0.3 units with a soft glow (150 ms).
- **Click or drag to add.** Clicking a shelf die spawns a copy that hops
  (one small physics arc, ~350 ms) into the **tray** — a shallow recessed
  rectangle decaled into the felt beside the shelf. Dragging does the same
  under the pointer via table-plane raycast; releasing outside the tray
  cancels (the die tumbles off the table edge and fades).
- **The tray IS the draft group.** Dice sitting in it are the group being
  built. Clicking a tray die plucks it out. The panel's notation box (§1.3)
  and the tray are two views of one draft — typing `4d6dl1` re-lays the
  tray with four physical d6s; adding a fifth by hand updates the string to
  `5d6dl1`.
- **Rolling the tray throws those dice.** The physical objects in the tray
  are the ones hurled — build and roll are one continuous physical act.
  (Saved-group rolls still spawn fresh dice as today.)
- Mechanics that have no physical body (modifier, keep, dc, mat text) stay
  in the popover/notation — the split is: *dice are physical, intentions
  are text*.

Phasing: this is Slice 3 work (§6) — it shares the raycast/decal machinery
with mat text — and it **replaces** roadmap §6's offscreen-thumbnail
builder (thumbnails remain for the set picker only).

### 7.2 Attributed modifiers (named bonus sources)

**Principle: bonuses are attributed** (the BG3 Perception-check reference:
"+1 Wisdom · +2 Proficiency · Guidance"). A flat `+3` is legal but the
notation supports Roll20's inline-label syntax on integer terms:

```
1d20+2[Proficiency]+1[Guidance] adv dc15 # Persuasion
```

- Grammar: `term := integer label? | diceTerm` with `label := "[" text "]"`
  (≤20 chars, control chars stripped). Labels on dice terms are accepted on
  paste but dropped with a note (this engine attributes bonuses, not dice).
- `rollspec.js` gains optional `mods.parts: [{label, value}]` — display-only
  decomposition; `modifier` stays the summed authority and `parts` is
  rejected unless it sums to `modifier` (one validation rule, server-side).
- Presentation: each part is its own attribution card in the §2.4 fly-in
  beat (120 ms stagger, oldest first), exactly where Adv/RO cards already
  live. The popover's modifier stepper grows an optional "label…" field per
  added part; unlabeled parts merge into one "+N" card.
- Canonical form: labeled parts render in paste order after the dice terms,
  each `+N[label]`; the log's `= 14 + 3` breakdown becomes
  `= 14 +2 Proficiency +1 Guidance` (labels small-caps, values tabular).

### 7.3 Resolved: experiences are room-wide

Joe's call: user-created experience templates sync **room-wide**, not
localStorage-only (§2.3's open question). They travel on the same
room-settings channel as global settings (hello carries them; a
`settings`-family event updates them), so the settings plumbing precedes
the experiences slice in the build order. Targets are **always visible**:
the hidden-DC variant of Check is rejected outright (§3.4), not deferred —
a Check's stakes are public on every visibility rung, and the held result
is what carries the tension.

### 7.4 Revision: compact view is immersive; the capability matrix

Joe's correction (2026-07-30): compact view exists to HIDE CHROME for
immersion — it must never degrade the roll moment. §2.6's mini strip is
retired: ceremonies render identically in compact view (intent card, mat
decal, staged verdict, cinematic slow-mo), responsively scaled. Only panels
and controls hide.

**Roll-declaration surfaces and the two verbs.** Every surface below must
support the full roll intent (spec + dc + moment + visibility + label) and
both verbs — Roll and Offer to table. Visibility is part of "full intent":
a surface that can only roll in the open is an incomplete surface, and on
the notation surfaces it comes for free (§7.8).

| Surface | Roll | Offer | Full intent editing |
|---|---|---|---|
| Panel command box | Enter | Shift+Enter | notation string |
| Quick palette | Enter | Shift+Enter | notation string |
| Ad-hoc tray | Roll button | via ± popover | ± button beside Roll |
| Saved group (expanded) | Roll button | via ± popover | ± button |
| Saved group (compact pill) | tap | via ± popover | long-press / right-click |
| Reroll-last (⟳) | click | — (re-rolls as rolled) | inherits original intent |

Offer is disabled (with tooltip) in solo mode on every surface. A surface
gaining a new capability must fill its whole column.

### 7.5 Per-roll Done: dice leave with their moment

Clearing the whole table between rolls is awkward. New semantics:

- Every die on the table is tagged with its roll. The verdict card and the
  result banner gain a **Done** control for the ROLLER: it dismisses the
  card AND removes that roll's dice from the table for **everyone**
  (server-validated roller-only, like reveal; solo applies locally). Dice
  sink/fade out (~300 ms); chips go with them; the log is untouched.
- Spectators' dismissal stays local (card closes, dice remain until the
  roller is Done or the table is swept).
- Concurrency: removal touches only that roll's dice — concurrent rolls,
  including ones mid-tumble, are unaffected. A client still playing back
  the cleared roll defers removal until its own playback settles.
- The corner ✕ remains the full-table sweep.

### 7.6 Moment notation (closing the notation-totality gap)

Joe's direction: supplement the notation non-invasively, possibly via
structured metadata in the comment section. Adopted design (two halves):

- **The moment kind is a trailing flag keyword**, peer of `adv`/`dis`:
  `check` and `cinematic` (alias `cine`). The flag namespace is the
  established home for roll-shaping keywords, and a bare word reads well:
  `1d20ro<=1+3 adv check dc15 # The lie leaves your lips`.
- **The subtitle rides the comment with a pipe separator**:
  `# Title | Subtitle` — the first `|` splits mat title from subtitle;
  no pipe means title only. Fully backward compatible (no existing comment
  uses a pipe), readable, and round-trippable. Titles needing a literal
  pipe escape it as `\|` (rare; documented in the cheatsheet).
- Canonical order: flags then `dc` then comment, as today; `check` renders
  after `adv`/`dis`. parseNotation returns exp:{kind, subtitle} and
  canonicalNotation emits it; the popover Moment section round-trips.
- Rejected alternative: `@check` tokens inside the comment — it overloads
  the one free-text field with grammar and makes the title's boundaries
  ambiguous; the flag position already exists for exactly this.

### 7.7 The collect shelf (table organization — supersedes landing zones)

Joe's direction (2026-07-30), synthesized: the main felt belongs to ONE roll
at a time; history lives on a shelf.

- **Shelf**: 5 recessed slots along the bottom felt edge, rendered in the 3D
  scene (identical in compact view). A collected roll's dice sit in its slot
  as a tight cluster; a compact marker floats above it: roller color dot +
  total + meaning word (active-profile lens).
- **Collect**: replaces Done as the roller's primary on verdict card and
  banner (POST /api/collect-roll, roller-only, idempotent, broadcast
  'roll-collected'). Dice whisk to the slot (~400ms dt-driven slide; full
  chips retire into the marker).
- **Auto-collect**: when a new roll EXECUTES, the server marks every prior
  settled-uncollected roll collected (deterministic, no client races) —
  the felt is cleared for the incoming roll as part of its arrival beat.
- **Slots are FIFO**: the server assigns slot order by collection order;
  collecting past capacity marks the oldest collected roll cleared (existing
  sink/fade). The 40-dice whole-table wipe is retired.
- **Housekeeping is universal**: a COLLECTED roll may be cleared by anyone
  (slot ✕ or its marker); an uncollected roll's dice remain roller-only to
  clear. Corner ✕ sweeps everything, unchanged.
- **Resync**: hello/join carries per-roll state (uncleared rolls: on-felt |
  collected+order). Clients reconstruct the felt (settled replay of the
  newest on-felt roll, no tumble) and the shelf identically — closing the
  audit's empty-felt-on-reload gap.

### 7.7.1 Shelf refinements (play-test feedback, 2026-07-30)

- **No casino markings.** The permanent slot tray decals are removed from the
  felt composite; empty shelf space is plain felt. An OCCUPIED position gets
  only a soft under-glow ring beneath its cluster (subtle warm gold radial,
  arcane-circle feel, theme-aware) that appears with the whisk and sinks
  with the roll. Nothing is drawn where nothing sits.
- **Default felt is walnut** (server + solo fallback). Emerald remains in
  the picker.
- **Peek: collected rolls keep their information.** Hovering (desktop) or
  tapping (touch) a collected marker/cluster expands a full result card
  above the slot — the same content as the banner: roller, label, total,
  DC verdict, meaning word (active lens), full per-die breakdown with
  struck dice, ✴ children, and named bonuses. One peek open at a time;
  click-away/Esc/second-tap collapses; Esc layering slots it above the
  popover. A redacted roll's peek shows the held card instead — roller,
  label, dice, DC, face-down result slot — plus **Reveal** for the reveal
  authority alone (§3.1, §3.3).
- **Left-to-right compaction** (shipped with the slice's fix pass): slots
  are ranks — oldest to newest, no holes; deletions slide survivors left
  with the whisk animation. Drag-to-reorder between regions is deferred to
  the physical-interaction tier.

### 7.7.2 Post-roll controls (Joe, 2026-07-30)

Immediately after a roll, the ROLLER's controls are ⟳ (reroll) · Collect ·
✕ — the ✕ clears that roll's dice from everyone's table directly (the
existing roller-only clear-roll path) without occupying a shelf slot. Not
every roll deserves collecting. Spectator controls unchanged (local
dismiss). Applies to both the banner and the ceremony verdict card.

Amendment to §7.7.1 peek cards (Joe, play-test): the peek must NOT scale/zoom
in — it appears in place (instant, or ≤100ms opacity fade only). Motion
restraint: cards are chrome, not ceremony.

### 7.8 Visibility notation (`held` · `secret` · `w:`)

Visibility is part of a roll's intent, so it has a canonical spelling.
Without one, a saved group, a `#g=` link or a history recall silently
downgrades privacy — a group meant to be secret rolls in the open on the
next machine that opens the link. That is a notation-totality violation
(GOALS.md), and it is exactly the failure roadmap step 1 closed for
face-down. `held` / `secret` / `w:` close it for the whole ladder.

**Three flags, one slot.**

```
[adv|dis] [keep] [reroll] [!] [check|cinematic] [held|secret|w:…]
  [dcN] [# title [| subtitle]]
```

The visibility flag sits exactly where `held` already sat — after the
moment flag, before `dc`. `parseNotation` exposes it as
`spec.visibility = { mode, names[] }`, and `canonicalNotation` renders it
back **byte-stably**: the canonical form remains a fixed point,
`parse(render(x)) ≡ x`.

- **`held`** — face-down for everyone, the roller included; revealable.
- **`secret`** — the roll exists only for the roller; not revealable.
- **`w:Name`**, **`w:Name1,Name2`** — whisper to a named audience.
- **Mutually exclusive.** Two visibility flags in one command is a parse
  error ("one visibility per roll — `held`, `secret` or `w:…`, not two"),
  including a prefix that disagrees with a flag. A prefix that *agrees* is
  accepted (`/selfroll 1d20 secret`).

**Prefixes normalize into the slot** and never survive into canonical
output: `/gmroll`, `/gmr` → `held`; `/selfroll`, `/sr` → `secret`. The
`/selfroll` family finally means what its name always claimed — before the
visibility slice both families were synonyms for face-down.

**Typing states.** A partial visibility flag at end of input is
`incomplete`, never `invalid` (§1.3's three-state rule): `1d20 sec`,
`1d20 w:` and `1d20 w:"Ann Sm` are all mid-typing, so the box never
flashes red while a name is being written. The client may preview a
`w:` list against the roster it already has, but the roster check that
counts is the server's, on its own re-parse (§1.6, §3.0).

**Names and quoting.** `w:` takes a comma-separated list with no spaces
around the commas.

- A name is **quoted only when it must be**: it contains a space, a comma,
  a double quote, or leading/trailing whitespace. Everything else is bare.
  "Quote only when necessary" is what keeps the canonical form a fixed
  point — `w:"Bob"` re-renders as `w:Bob`, so it cannot oscillate.
- Inside a quoted name, `\"` is a literal double quote.
- **Case is preserved as typed**; matching is case-insensitive against the
  room roster (§3.0). `w:kira` reaches Kira and stays `w:kira`.
- A name nobody in the room answers to **rejects the roll**
  (`unknown_audience`, message naming it). It is never dropped, and the
  roll never degrades to open or to secret behind your back.
- The list is the text you wrote. The chooser is added to the audience at
  *resolution* (§3.0), not in the string — the same string rolled by
  someone else means a different audience, which is correct: a shared
  group whispering `w:Kira` includes whoever rolls it, plus Kira.

**Examples.**

```
1d20+5 held dc15 # Perception
1d20 secret
2d6+1d20 adv w:Kira dc12 # A quiet word
1d20 check w:"Ann Smith",Bob dc15 # The lie leaves your lips | CHARISMA CHECK
4d6dl1 w:"Bob \"Two-Axe\" Vance"

/gmroll 1d20+3        →  1d20+3 held
/selfroll 4d6dl1      →  4d6dl1 secret
1d20 held secret      →  parse error (one visibility per roll)
```

**It rides everything for free.** `#g=` stores canonical strings
(`js/urlgroups.js`), so a group's visibility travels in links, localStorage
and history with no side-channel token and no extra codec version — see
§1.5, where the once-planned `@vis=` token is retired for this reason. On
an offer, the same string expresses the offerer's choice, which is what
makes the GM-screen roll a one-liner (§3.3).
