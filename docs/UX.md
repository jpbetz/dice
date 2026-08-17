# UX Design: Notation, Roll Moments, Visibility, Dice Sets

*(Latest addendum: §7.23 — three independent section switches, the well at
the head of the column, and a second source list in the collapsed one, all
2026-08-08. Where a later section touches an earlier one it wins; superseded
spots carry pointers. **Start at §7's WHAT IS TRUE TODAY table**: §7 runs in
commit order, so the section that describes a surface is usually not the one
that last changed it.)*

Authoritative UX spec for the next evolution. This is a spec, not a survey:
where alternatives existed, the decision is recorded here and the alternative
is listed under *Rejected*. Companion to `ROADMAP.md`; a reference into it
is always written **roadmap §N** — a bare §N means a section of *this*
document. Everything here is implementable against the current
codebase; new endpoints and SSE events are enumerated in §6.

Design stance, in one line: **standard on the surface, modern in the feel.**
Standard = Roll20-dialect notation, a visibility ladder built out of the
moves every VTT already has (open · held · secret · whisper — see §3.2's
terminology note for where the *words* diverge between tools), a
conventional saved-pools panel.
Modern = one dressed-up roll moment, diegetic mat text in the 3D felt,
physics-true hidden dice, and zero permission bureaucracy — the privacy is
real (server-side redaction) and the roles are absent.

**Naming (the terminology decision).** The dice you assemble to roll are a
**pool**; the named preset you keep is a **saved pool**. Those are the only
words a player ever reads — "tray" and "group" are retired from every
label, tooltip and hint. They survive *only* as identifiers:
`dice.groups.v1`, `.group-row`/`.group-formula`, `id="tray"`. Renaming
those would break stored state for no user-visible gain, so this spec
still spells the code that way and only that way. (The collect shelf's internal "tray" — §7.7's slot geometry — is
a different thing again and keeps its name.)

---

> **§1–§6 ARE THE ORIGINAL SPEC, AND PARTS OF THEM ARE HISTORY.** They were
> written before anything shipped and were never revised in place; §7 has
> been overwriting them, section by section, ever since. Most of what they
> define still binds — the grammar (§1.1), the parser API (§1.2), the
> round-trip invariant (§1.5), the server's re-parse (§1.6), the whole
> visibility spec (§3), dice sets (§4) and the visual language (§5) are all
> live and are cited from §7. But six things here describe a build that does
> not exist, and each has been checked against the source:
>
> - **§1.3's placement** — the box is not below the pool chip row inside a
>   Compose panel. It is one of three independent sections below the well,
>   switched by the `2d6` cell (§7.23). The paragraph's *model* — one spec
>   object, two projections — is still binding; only the geography is dead.
> - **§1.4's click-to-copy formula** — `.group-formula` has a stylesheet
>   entry and **no producer in `js/`**; there is no "notation copied" toast
>   anywhere in the app.
> - **§2.1 / §2.3's experience records and their editor** — never built. The
>   three moments ship as notation flags instead (§7.6, `check` / `cinematic`
>   + `# Title | Subtitle`), the room-wide `experiences` key ships empty, and
>   `/api/table` refuses it outright rather than carry a key nothing writes.
> - **§2.4 phase 0's user-held dwell and Roll button** — the intent card has
>   no button and holds the stage for a fixed `CEREMONY_DECLARE_S = 1.35`
>   seconds. Phases 1–8 and the reduced-motion guardrails still bind.
> - **§2.5's one hero slot** — **retired 2026-08-08 by §7.24** and struck in
>   place. It was a ruling with nothing to rule on: all three profiles had
>   declared `meaningFor: () => null` since the meanings migration, so the
>   branch never painted, and the channel is now deleted outright. §7.24 is
>   the live rule for what a result surface shows.
> - **§6's four slices** — a build order, executed. Read it as a record of
>   what was sequenced, never as work remaining; ROADMAP.md sequences work.
>
> Nothing here is deleted, because this repo keeps its post-mortems and the
> reasoning in these sections is still the reasoning. **For what is true of a
> surface today, start at §7's WHAT IS TRUE TODAY table** — it names the one
> authoritative section per surface and the readings that mislead.

## 1. Notation layer

### 1.1 Grammar (the adopted dialect)

One shared, dependency-free module — **`js/notation.js`** — with the same
Node+browser contract as `js/rollspec.js`, because the server re-parses
every pasted command (§1.6). It expresses *exactly* what `rollspec.js`
supports today; nothing more.

```
command   := [mode SP] expr [SP flag]* [SP dc] [SP comment]
mode      := "/roll" | "/r" | "/gmroll" | "/gmr" | "/selfroll"
                                            ; "/sr" is REFUSED as ambiguous
                                            ;   (§3.2 terminology note)
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
           | keep | reroll | "!"            ; pool-wide trailing form (see below)
           | "check" | "cinematic" | "cine" ; moment kind (§7.6)
           | visibility                     ; one per command (§7.8)
visibility:= "held" | "secret" | whisper
           | "blind"                        ; OFFERS ONLY: alias → secret, the
                                            ;   dice tower; a self-roll refuses
                                            ;   it with a teaching error (§3.2)
whisper   := "w:" name ("," name)*          ; name quoted only when it needs it
                                            ;   (names never contain '#' — the
                                            ;   server bans it at join/rename)
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
  input/output for anything else.
- **`dc N` (alias `vs N`)** is an admitted local extension that sets the
  experience Target (§2.4). It is *not* spelled `>=N` — that spelling is
  reserved for roadmap §8 per-die success counting (`cs>=N`, future).
- **`# text`** (Foundry's flavor precedent) sets the roll label, and — when
  an experience is active — the mat text. Comment is stripped of control
  chars, max 64 chars.

**Mixed-pool scoping rule (the divergence fix).** `rollspec.js` applies
`keep`, `reroll` and `explode` across the whole pool, but every other
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
  pool"). The pool-wide semantics this engine actually has are spelled
  as **trailing flags**: `1d20+2d6 ro<=2 dl1 !` — visibly nonstandard,
  therefore honest.
- Long-term (post-launch): add term scoping to `rollspec.js` and retire the
  trailing form. Not in this cycle.

**Order of operations is documented next to the grammar**, verbatim from
`rollspec.js`: adv → reroll → keep/drop → explode → total, with the note
that RPG Dice Roller explodes *before* keep/drop, so `4d6!dl1` can differ
from that reference.

**Canonical form** (one renderer, replacing `main.js formula()` and every
other ad-hoc speller): no interior spaces in
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
that: a saved pool whose canonical string cannot say "secret" saves a
public roll, and storage, history and exports all silently downgrade privacy.
On the wire it still travels as a field beside `mods` (§3.0), because it
does not alter values. The `/gmroll`-family prefixes are accepted for paste
compatibility and normalize into the slot — `/gmroll`, `/gmr` and
`/selfroll` all to `secret` (§3.2's terminology note: Roll20's `/gmroll`
means the roller sees the result and the table learns nothing), while
`/sr` refuses to bind at all; canonical output never emits a prefix.

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
below the pool chip row and above the Roll/Empty button row.
`id="notation-box"`, `placeholder="2d6+3, 4d6dl1, 1d20 adv dc15 …"`,
`font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums`.
It lives inside the Compose panel, so it is present whenever that panel is
expanded and gone with it when collapsed (§7.4).

**One canonical string, two editors.** Die buttons and pool chips rewrite
the box; typing in the box rewrites the pool and the `±` popover state.
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
free text always allowed): `/gmroll`, plus mod tokens
`kh kl dh dl ro ! adv dis held secret w: dc #`, one line of help each,
arrow keys + Tab to accept. Every token is always listed — there is no
seat, no role, and therefore nothing to condition the list on; the
`/gmroll` family is described as what it is, paste sugar for `secret`
(§7.8; `/sr` is refused as ambiguous, never listed).

**History:** ↑/↓ recalls the last 10 executed commands, per-room, stored in
localStorage key `rollHistory:<room>`. This is the same store the banner's
`⟳` Reroll-last (roadmap §3) reads — one store, two consumers.

### 1.4 Notation chips on saved-pool rows

- `.group-formula` (11px muted, exists today) shows the **full canonical
  notation** including mods: `2d20kh1+3 adv`. Monospace, tabular-nums,
  ellipsis-truncated with `title` carrying the whole string. This requires
  saved pools to store the spec, not just dice — done in the same slice (§6,
  slice 1) so the chip never lies about what the button rolls.
- Clicking `.group-formula` copies the notation to the clipboard (toast:
  "notation copied") and focuses the command box with it — chip text is
  guaranteed pasteable because chip text *is* canonical form.
- **Unnamed pools label themselves by notation** — the row's name slot
  renders the canonical string (replaces today's `formula(tray)` fallback,
  same renderer). This once also fed the mini-bar pills; those are retired
  with mini mode (§7.4).

### 1.5 Round-tripping (popover ↔ notation ↔ URL)

The invariant: **spec object is truth; notation is its stable projection.**

- `±` popover edits mutate `{dice, mods, label, target}` → box re-renders
  via `renderNotation`. Box edits parse → popover controls re-render.
  Guaranteed lossless because grammar and `validateMods` cover the same
  space (enforced by a round-trip unit test: `parse(render(spec)) ≡ spec`
  for generated specs).
- **Storage carries canonical strings.** A saved pool's moment and its
  visibility need no side-channel: both are canonical-notation flags
  (`check`, `held`, `w:Kira` — §7.6, §7.8), so they ride the stored string
  for free, in `dice.groups.v1` and in the YAML export alike. A pool's
  dice-set id is the one thing outside the string (a `set` field in
  storage, a quoted `@` suffix in YAML); the once-planned `@exp=` / `@vis=`
  tokens are retired.
- **Unnamed pools** (§1.4) are stored and exported with an empty name,
  labelled by their notation — no shape needs a name to be legal.

  *(Superseded 2026-08-04: this section specified a **URL codec** — the
  rack encoded as `#g=<base64url>` in the address bar, v1→v4, with a
  one-way compatibility contract for old links. All of it is retired with
  the codec itself; see GOALS §7. The one durable lesson survives above:
  because visibility and moment live IN the canonical string, no transport
  can silently lose a pool's privacy.)*

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
// Attachment (on a saved pool, or on an offer)
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

Plain is the default for every existing and new pool; nothing changes
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

- **Saved-pool row:** the `±` popover gains a final section, "Moment", with a
  segmented control `Plain · Check · Cinematic · +` and — when non-Plain —
  three text fields (Title, Subtitle, Mat text; all optional, sensible
  fallbacks: title ← pool name, mat text ← title) and an optional Target
  number + label. `+` opens the experience editor (a form over the record
  fields — no freeform layout editing).
- **Offered rolls:** the offer composer includes the same "Moment" section;
  the attachment rides the offer payload. An offered Check is the full
  BG3 card: the offer *is* the intent card, waiting on the table for
  whoever clicks Roll.
- **Command box:** `# text` fills the mat text/title for one-off rolls;
  `dc15` attaches a Check with that target (a `dc` with no experience
  implies Check — a target with no staging would be mute).
- Serialization: attachment fields ride the saved-pool record, localStorage,
  and the YAML export (§1.5) — all three carry the canonical string.

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

**Beat 8 is a RARE accent, and under a per-die system that has to be enforced**
(ROADMAP U18, 2026-08-08). `soul-deal.critFor` fires when *any* die lands a
crit cell, so `3d10` washed the viewport and shook the camera on **48.8%** of
rolls — the median outcome wearing the budget of an exception. The chart is
right and untouched; what was wrong is that a per-die system has no roll-level
verdict for a whole-viewport claim to come from. The profile now answers two
questions instead of one: `critFor` (did something crit — **the word always
lands**, exactly as U8's reduced-motion rule already established) and
`critCeremony` (does the table stop). Soul Deal stops only for a strict
majority of the crit-*capable* dice; a d20 system always stops, because
`some()` over one verdict is not an aggregation. The card keeps its gold dress
under both. Rates and the full argument live in ROADMAP U18.

**Placement — one anchor, and the ceremony wins.** Phase 0's intent card is
center-stage while the table is still empty; from Commit onward every
piece of card chrome lives at the **top anchor** — the strip during the
tumble, the verdict card (the strip, unfolded) from phase 5 — and the
throw targets the center/lower felt, so the card rarely shares space with
the pool at all.

*Amended (the layer-scale pass).* The original rule said the opposite of
what shipped: a die's value chip rendered **above** the card so chips were
"never occluded, whatever the pool size". That inverted the hierarchy — a
stray die in the top band punched a number through the verdict. The rule
now, from the one documented ladder in `css/style.css`
(`--z-table-labels: 11` < `--z-ceremony: 14`): **ceremony and verdict sit
above every ambient table label.** A chip that a scattered die parks under
the card is simply hidden for the length of the moment; the card's own
translucent blur ground keeps the die itself readable, and the total,
breakdown and verdict are on the card anyway. Value chips are also **off
by default** now (`dice.chips.v1`, §7.9's quiet-by-default principle), so
in the default table there is nothing there to occlude.

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

~~Target verdict and `meaningFor()` **will** disagree; they are never
reconciled and never merged. The card has one large readout:~~

- ~~Target set → verdict owns it (`SUCCESS` / `FAILED`, large); the chart
  word demotes to a small labeled line: `Chart · Advantage`. Disagreement
  is labeled, not hidden — a Soul Deal table reads it as "you cleared it,
  at a cost."~~
- ~~No target → the chart word owns it, exactly as today.~~
- ~~`readouts` lets an experience drop either one (a combat experience with
  `['verdict']` turns the chart off — that option is much of what makes
  experiences feel real).~~
- ~~Face extremes (`isMax`/`isMin`, already computed) are a third,
  independent channel: a gold ring / red crack on that chip only. The
  three signals never repaint one another.~~

**Retired by §7.24.** The conflict this arbitrates cannot arise: `meaningFor`
is deleted — all three profiles had defined it as `() => null` since the
meanings migration, so the demoted-chart-line branch was unreachable code
describing a feature that no longer existed, and the chart word reaches the
screen through `outcomesFor` and always did. The fear behind the ruling is
answered by geography rather than by silencing anything: **the hero holds the
READING and the margin line holds the STAKE, and they never contend for one
slot**, so a target no longer needs to suppress a chart word. `readouts` never
shipped either (see the §1–§6 banner: the experience record and its editor
were never built).

*The one clause that survives in substance:* face extremes ARE an independent
channel and stay universal — `isMax` / `isMin` dress the die token itself
(`.crit-max` / `.crit-min`, colour and weight in the log, breakdown and peek),
never the ring or the crack described above, and they repaint nothing else.

### 2.6 Multiplayer and the collapsed table

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

~~**Mini mode degrades to brisk-or-less, no card:** intent card and mat text
are skipped; the pool pill pulses gold during the tumble; the result strip
appends the verdict word.~~ **Retired by §7.4** (and by the chrome rebuild
in §7.9): mini mode no longer exists as a mode, so there is nothing to
degrade. Collapsing the panels hides chrome and *only* chrome — the intent
card, mat decal, staged verdict and cinematic slow-mo all render
identically, responsively scaled. That is the immersion invariant: the
smaller the window, the more of it is table.

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
- **A player name can never contain `#`.** In notation `#` starts the
  comment and the comment split runs before the flag scan, so a roster name
  carrying one could never survive its own canonical spelling — `w:a#b`
  re-parses as a whisper to `a` with the comment `b`, a silent misdelivery.
  The server strips `#` from names at **join and rename alike**
  (`cleanName`, beside the control/bidi sanitizer), the rename input and
  take-a-seat modal refuse it with a message, and so `w:` addressing is
  total over every name that can exist. This closed the last audited
  notation-totality violation (GOALS.md).

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
control reads `Open · Face down · Only me · Whisper to…` (the terminology
note below is why those words and no others); Whisper opens a name picker
over the current roster (recipient chips: player dot + name), and a
whisper with nobody named disables both verbs rather than rolling wide.
With `Only me` selected the Offer button's tooltip names what an offered
only-me roll is: *Dice tower — they roll, only you see the result*.
*(Built 2026-08-14, §7.43 — on the RIM's `#offer-draft`, because the
popover's own Roll/Offer buttons retired with `popVis` and the line follows
the verb rather than the surface it was written against.)*

**Not sticky, and therefore un-badged.** The picker starts from the
notation it was opened on, every time — there is no remembered per-player
default. That is deliberate for now: a sticky non-open default is the
number-one accident vector, and carrying one would require the eye-slash
badge on the Roll button and every saved-pool row to be safe. Neither ships.
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
- **`w:` has nobody to whisper to.** The popover disables Only me and
  Whisper to… offline (the sub line says so: *only-me & whisper rolls need
  a table — you are playing solo*), and a `w:Name` typed into the command
  box parses and then **rolls open** — solo has no roster to reject a name
  against and no second client to withhold anything from.

So the ladder never becomes dead code offline, but solo is *degraded
gracefully*, not fully mirrored: the rungs whose whole meaning is "someone
else" are the rungs that flatten. A room that later gains players gets the
real ladder back with no change to the saved notation.

**Terminology note: the words are traps, the rungs are not.** A 2026 survey
of VTT conventions confirmed the *ladder* is conventional — open is
Foundry's Public Roll, secret is Foundry's Self Roll, whisper generalizes
the Private-GM-Roll/`/gmroll` family, the offerer-only offer is Foundry's
Blind GM Roll and Fantasy Grounds' dice tower, and held is closest to
dddice's Hidden Roll with Peek/Unhide. The *vocabulary* is where tools
contradict each other outright:

- **"secret" is not portable.** Here it means *roller-only*. In Roll20 and
  PF2e it means the opposite axis — the roller does **not** see it.
- **"/sr" is the worst offender.** Foundry's `/selfroll` short form means
  roller-only; Roll20's 2026 "Secret Roll" `/sr` means the roller cannot
  see the result. Same two letters, inverted meaning.
- **"blind" universally means the roller cannot see their own result** —
  which is our *offered* secret roll (§3.3), never a self-roll.
- **"GM" and "private" name a seat we do not have** (goal 10).

Two consequences bind the implementation. First, **wire words stay
`held` / `secret` / `w:` / `blind`** — the notation is a paste-compatible
dialect and must not churn. Second, **UI labels never render "Secret",
"Blind", "GM" or "Private" as a mode name**, because each one reads as its
own opposite to somebody at the table; the labels are *Open* · *Face down*
· *Only me* ("no one else sees that you rolled") · *Whisper to…* (~~"others
see you rolled, not what"~~ **amended 2026-08-14, §7.43: "the table sees the
dice and the stakes — only they see the result"** — the old four words
described the deliberate stakes-are-public leak the paragraph BELOW this one
calls our largest difference from Roll20 and Foundry, and they read as its
opposite), and an offer's restricted mode is *Dice tower*
("they roll — only you see the result"). Both consequences are applied:
the picker and sublabels read exactly those words, `/gmroll`, `/gmr` and
`/selfroll` all normalize to `secret`, `/sr` refuses with a teaching
error, and `blind` is an offer-only alias for `secret` (§7.8).

And one thing genuinely ours: **our whisper leaves bystanders a shrouded
roll.** Roll20 and Foundry whispers show non-recipients *nothing at all*.
Here, existence is public on every rung but `secret` — that is the point of
§3.1's obsidian dice, and it is the single largest behavioural difference a
player arriving from another tool will meet.

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
  normalizes to `secret` (§7.8, §3.2's terminology note).
- **Per-skill / per-pool visibility default grids.** A saved pool already
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
pool override > **player set** > player color > die-type default. Five
rungs, **one axis**: every rung resolves to a *set id* before anything
touches the renderer or the wire. A bare color — roadmap §4's player/die
colors, or a saved pool's swatch — derives an **anonymous set**:
`extends: 'ivory-court'`, `body` = the color, `id` = the color literal
(`'#7a1f14'`). So roll events always carry per-die set ids (§4.2), the
`(type, setId)` cache needs no color code path, and roadmap §4's pool
color swatch and §4.2's pool set are the **same rung and the same
control**, not two competing knobs — picking a swatch stores an anonymous
set id.

### 4.2 Per-player identity, synced

The set is **player identity**: everyone sees the roller's dice in the
roller's set — on a shared table it identifies whose dice landed better
than color alone. New endpoint `POST /api/style {set}` → SSE
`player-styled {playerId, set}`; included in `publicPlayers()` and `hello`.
Roll events carry **resolved per-die set ids** (subsuming roadmap §4's
per-die colors — colors fold into anonymous sets per §4.1, so the set id
is the *only* per-die style field on the wire) or replay diverges. Pool override: a swatch+set control on the
saved-pool row (a "Fireball" pool pins Ember Pact); stored with the pool and
carried by the YAML export (§1.5) so a pool keeps its look wherever it lands. **No per-roll set
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
every ad-hoc speller (`formula()` and the codec's own) replaced by the one
renderer; saved pools store specs; `/api/roll`+`/api/offer` accept
`notation`; pool-row chips + copy-on-click. *Value: paste any Roll20-ish
string and it rolls; every chip tells the truth about mods.*

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
scaling) + fanfare; parity in the collapsed view (§7.4); attachment on roll/offer
events. *Value: the BG3 moment, shared across the table.*

**Slice 4 — Sets.** Dice sets tier 0–1 riding roadmap §4's cache re-key
(+ `sound`, `extends`); `POST /api/style` + `player-styled`; picker riding
roadmap §6 thumbnails; per-die set ids on roll events + a `set` field on
the stored pool (and the YAML's `@` suffix).
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

> **NEXT FREE SECTION NUMBER: §7.48.**
> *(§7.39–§7.46 were all claimed on 2026-08-14/15 by eight parallel
> passes. FOUR of the eight first wrote themselves as §7.39, and two
> more independently claimed §7.45. Every one of them read this line
> before writing — they were reading eight different copies of it.)*
> Claim it here in the same commit that writes the section, before you write
> it. This document ASSIGNS these numbers, so this line is the only place a
> branch that has been out for a week can see what is taken (ROADMAP C4).
> Two collisions are on record and both were caught at merge, not before:
> **§7.24 was written twice in the same week** by two branches, and on
> 2026-08-14 **§7.39 was written THREE times in one afternoon** — the
> seat-picker pass, the restore pass and the token-layer pass, running in
> parallel, each appending to the end of a file whose numbering none of them
> could see the others reading. They landed as §7.39, §7.40 and §7.41.
> Renumbering at merge is cheap; two sections silently claiming one number is
> what §7.22 and §7.23 were built on top of.

### WHAT IS TRUE TODAY (2026-08-08)

The subsections below run in **commit order**, not surface order, and they
supersede one another in place. That structure has already shipped two wrong
builds, both post-mortemed here: §7.22's contextual roll bar (built on the
half of §7.14 that §7.9 had superseded) and §7.23's first section-bar plan
(built on a `.seg` rule the panel had already overridden). Both agents read
a section that described the surface and never found the one that changed
it. This table is the index: per surface, the section that is authoritative
today and the reading that will mislead you. **Read the row before the
section, and update the row in the same commit that changes the surface** —
a stale row is worse than no table.

| Surface | Authoritative today | Do not build from |
|---|---|---|
| Workbench well + rim | §7.14.1 — one object, two zones; the plate IS `#tray-actions::after`; the cue owns a reserved band · §7.16's ONE-WAY RIM (`± Modify · Offer ▾ · ✕ Clear`) | §7.14's well/rail bullets — the ± left the well and Save is retired · §7.9's 2026-08-01 ghost-text demotion |
| Section bar (`Dice · 2d6 · Pools`) | §7.23, as amended 2026-08-08 — three independent switches, all-off legal, two state objects; the DRESS of record is the comment over `#left-panel :is(.section-seg, #rail-mode)` in `css/style.css` | §7.9's "ONE input view at a time" and the two-value `dice.inputmode.v1` |
| Die palette (`#die-buttons`) | §7.23 — it is a section now, switched by the `Dice` cell · §7.16's 2i-D for the steel tile body · §7.10's identity strip for the one build-dice idiom shared with the creation card | §7.1 entire: the felt die shelf was never built and its "the buttons become the fallback" demotion never took effect. GOALS moved physical pool-building to the delight tier |
| Notation box (`#cmd`) | §1.1 grammar · §1.2 parser API · §1.6 server parse · §7.23 for where it sits and what switches it on | §1.3's placement paragraph (see the §1 banner). **No section yet records ROADMAP U1/U2**, shipped 2026-08-08 in `07099a7`: staging carries intent, and a box that stops parsing disarms the plate |
| Saved-pools rack + shelves | §7.9's THE SHEET PASS — identity edits by id, creation-as-editing, the ✎ row — and its DEALT RACK amendment · §7.18 for what the ✎ gate covers · **§7.44** — the rack figure is a BUTTON that opens the ledger sheet, and a shelf's target may be the system's or one you typed for tonight | §7.17's region head, amended below: `SAVED POOLS` no longer stands over your own rack · POOL-ANALYSIS §9's "where the rack figure lives" — taken in §7.44; it stays in the head |
| Collapsed launcher (the rail) | **§7.45** — on a COARSE pointer a counted dice row drops its die art, which is the 86px budget's only honest answer and the `.rd-counted` markup hook that pays for it · §7.22 — 112px, a row is a word, the standing verb, 2i-G · §7.23's "The collapsed column" — the source switch, the dice list, the plate at rail scale | §7.9's collapsed paragraph: it predates the second source list and describes a column that holds only pools (its 56px history is already struck there) |
| Intent card · dock strip (the declaration) | §2.4's staging timeline, phases 1–8 · §7.6 for the moment flags and `# Title \| Subtitle` · **§7.24** — the target renders under every system and the profile only NAMES it (`targetWord`); the flat `+5` is arithmetic and does not; `#intent-notation` stays a whole verbatim canonical, `dc15` included | §2.4 phase 0's user-held dwell and Roll button (shipped: a fixed `CEREMONY_DECLARE_S = 1.35` s, no button) · §2.1 / §2.3's experience records — the moment ships as notation flags · any reading in which the badge's label is a fixed string |
| Result banner | §7.11b — the folded card, the hover read, the beacon · **§7.28** — neither the card nor the dice are on a clock; the next roll retires both · §7.21 — the named primary verb, the retired watermark · **§7.24** — `VS DC 15` renders under every system, the adjudication only where a sum does, and the hero slot names the rung (`Face down` / `Whispered`) where the mute gold `?` used to sit · **§7.43** — the outcome rows show EVERY die that was thrown, struck ones included | §7.24 s *Not closed* list, which is stale in all three bullets — read the struck-through block, not the paragraphs it replaced · §7.9's Done-at-rest and its ~6 s clock (the shipped clock is 3 s) · §7.7.2's ⟳ / Collect / ✕ trio · §2.5 (retired 2026-08-08) |
| Verdict card | §7.16's THE FLOW TO COLLECTED — a folded card whose clock shelves the roll · §7.21 — `❯❯ Skip` repaints to `✕ Clear` when the beat lands · **§7.24** — the stake goes into `#verdict-margin`, written ONCE above and outside every branch; the hero holds the reading and the two never share a slot · **§7.43** — the hero rows show every die thrown, so a `4d6dl1` dropped die is in the rows AND in its `DL1` attribution card | §7.7.2's verdict half (struck there) · §2.4 phase 0's user-held dwell and Roll button (shipped: a 1.35 s timer, no button) · §2.5's one hero slot — retired, struck there. **The card has no subtitle element under any system** (§7.24's deferral); do not read the eight-surface table as though it does |
| Peek | **§7.45** — no log entry, no card: it returns before it renders, so the entry-less "live body-click, no named verb" state is unreachable by construction rather than by luck · §7.7.1 for what a peek is · §7.11b's "folded card, shelf edition" · §7.21 — its primary is always `✕ Clear`, housekeeping being anyone's · **§7.24** — the stake, and the held word in the total slot (the `?` survives only for `!entry`, and under a totals lens) · §7.27 — it anchors to a log ROW, not a felt point · **§7.42** — it names its RANK, and it retires on a new roll, on a ceremony and with the log · **§7.43** — its rows show every die thrown, at `.pk-outcomes` scale | §7.15's one-✕ rule — retired, struck below · §7.9's "the peek carries a prominent ✕ at its base" amendment · §2.5 (retired) · any reading in which the card outlives the roll that replaced it |
| Roll log | **§7.45** — the row's ONE labelled group per pool (label, evidence, answer — §7.12's fix, finally applied here) and the `rerolled` chip that names the rerollER when attribution flipped · **§7.42** — the record: the ≣'s spine, the flyout's rank panels and their anchor, `Find a roll…`, the scroll on `#log-list`, and what `Clear history` actually reaches · §7.27 for the row-as-door · §7.9 for the rail-foot flyout and key `l` · §7.12 for the compact grouped line (the per-die ROWS belong to the other three surfaces) · §7.15's "The log says so" for `reroll` / `rerolled` · **§7.24** — `vs 15` with no `✓`/`✗` where nothing sums, and no dangling `+5` feeding an empty total column | §2.5 (retired) · §7.9's "the count rides only the hover title (still the accessible name)" — the parenthesis was false and is why the count reached nobody (§7.42) · any reading in which `Clear history` is local-only |
| Shelf | **RETIRED as a place.** §7.27 — a put-away roll lives in the log and its ROW is the door · **§7.42** — what it looks like at rest, open and closed · §7.7 for the collect/clear state machine, which is wire and survives verbatim | §7.7's slots, geometry and marker read · §7.7.1's compaction · ROADMAP U20/C13's "decide how much read the shelf owes" — answered by §7.42 |
| ± popover | **§7.43** — the visibility sub-lines, and the whisper rung's amended words (§3.2's old quotation is struck there) · §7.10 — a pure editor, and where an edit lands by source · §7.14.2 — Done, click-away, the ring · §7.9's SHEET PASS identity strip · **§7.24** — only **Modifier** folds under a per-die lens; Target, d20 pairing, keep/drop and reroll/exploding are authorable under every system, and the rim reads `± Modify` in both | §7.10's "reroll and explode stay… behind the sysnote's *Show anyway*" — superseded 2026-08-06, no note and no disclosure; the accurate record is the comment over the popover's sections in `index.html` · any account of the fold in which Target or keep/drop hides under a per-die system: that was `usesMods`, deleted 2026-08-08 · ROADMAP U11's `± Moment` — its rule survived, its word did not (§7.24) |
| Identity chip · roster · nameplate | **§7.43** — a MINTED `?room=` key is not a chosen name (`isMintedKey`, so an unnamed table wears no plate and no tab title), the roster's 76px pill floor and its two differently-worded folds, and the invite link's four doors · §7.17 — the rail pill is the one per-player surface, left-click toggles the rack, right-click / long-press opens the menu, and the quiet nameplate · §7.9's ORDER IS THE CONTRACT · §7.22 for the collapsed dress | §7.9's "Identity is on the table" paragraph, where left-click opened the menu |
| Settings | No single section. **§7.43** for the Table destination's `Copy invite link` row and the pool-broadcast disclosure over *At this table* · §7.9 for the *Just you* scope (chips off by default, the dice-set select) · §7.13 for *Your data* · §7.17 for the table name; the room-wide keys are `SETTING_SPECS` in `server.js` | §2.1 / §2.3's experience record and its editor — never built, and `/api/table` refuses the key |
| **Any control's ON / OFF / UNAVAILABLE dress** (not a surface — the rule that governs all of them) | **§7.41** — the token layer. THE KIND OF CHOICE PICKS THE DRESS: switch / pick / dial, three degrees of not-active, and the override rule that makes a disagreement one greppable line. The values of record are the `:root` block in `css/style.css` | Copying the nearest neighbour's numbers, which is what produced nine `[aria-pressed="true"]` dresses across four hue families (audit C3) · any reading in which `#left-panel` scoping is what makes a dress right — 2i-C and U6 both had to un-scope a law twice for the same reason |

### 7.1 Physical pool building (supersedes the button grid as the primary path)

**Principle: physical analogy over UI.** The die-type buttons and pool chips
of §1.4 become the *fallback* (kept for a collapsed Compose panel and for
accessibility). The primary build path is physical:

- **The shelf.** One specimen of each die type rests along the front-left
  edge of the felt — real meshes from the live renderer, idle, at rest.
  Hovering one lifts it 0.3 units with a soft glow (150 ms).
- **Click or drag to add.** Clicking a shelf die spawns a copy that hops
  (one small physics arc, ~350 ms) into the **pool area** — a shallow
  recessed rectangle decaled into the felt beside the shelf. Dragging does
  the same under the pointer via table-plane raycast; releasing outside it
  cancels (the die tumbles off the table edge and fades).
- **That area IS the draft pool.** Dice sitting in it are the pool being
  built. Clicking one plucks it out. The panel's notation box (§1.3) and the
  felt are two views of one draft — typing `4d6dl1` re-lays it with four
  physical d6s; adding a fifth by hand updates the string to `5d6dl1`.
- **Rolling the pool throws those dice.** The physical objects in it are the
  ones hurled — build and roll are one continuous physical act.
  (Saved-pool rolls still spawn fresh dice as today.)
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

*Followed through (§7.9):* compact view is no longer a view either. It is
the emergent state of collapsing all the panels, and the controls that
used to vanish with it now live on a rail that never hides.

**Roll-declaration surfaces and the two verbs.** Every surface below must
support the full roll intent (spec + dc + moment + visibility + label) and
both verbs — Roll and Offer to table. Visibility is part of "full intent":
a surface that can only roll in the open is an incomplete surface, and on
the notation surfaces it comes for free (§7.8).

| Surface | Roll | Offer | Full intent editing |
|---|---|---|---|
| Panel command box | Enter | Shift+Enter | notation string |
| Quick palette | Enter | Shift+Enter | notation string |
| Ad-hoc pool (the Pools draft) | Roll button | via ± popover | ± button beside Roll |
| Saved-pool row | Roll button | via ± popover | ± button, and ✎ for name + notation |
| ~~Saved pool (compact pill)~~ | — | — | retired with the mini bar (§7.9); the Saved pools panel expands from its edge tab instead |
| Reroll-last (⟳) | click | — (re-rolls as rolled) | inherits original intent |
| Collapsed pool rail (launcher) | tap to select, gold bar rolls | — | — (see the carve-out) |
| Collapsed dice list (launcher) | tap to count up, gold bar rolls | — | — (bare specs only; see the carve-out) |

Offer is disabled (with tooltip) in solo mode on every surface. A surface
gaining a new capability must fill its whole column.

**The launcher carve-out** *(2026-08-07, §7.22; extended to the dice list
2026-08-08, §7.23; carried into GOALS' Uniform-roll-surfaces invariant
2026-08-08, because GOALS wins ties and the exemption has to live in the
document that does)*: the full-column law binds **authoring** surfaces — the
ones where a roll's intent is composed. A LAUNCHER fires intents that were
already authored elsewhere (a single pick rides its pool's stored intent
verbatim; a multi-pick composes what the grammar can union and says what it
set aside; the dice list fires a bare `NdX` with every axis at its default,
which is why it can fire at all), and the authoring surface is one keystroke
away — `n` opens the workbench, `/` the palette. This regularizes an
already-shipped state rather than creating a new exemption: the collapsed
rail has never offered or edited intent.

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

> **SUPERSEDED IN PART, 2026-08-09 (C25, §7.27).** The *state machine* below
> is unchanged and is still the spec: on-felt → collected(seq) → cleared, five
> deep, oldest evicted, server-owned. **The PLACE is gone.** There are no
> slots, no clusters, no under-glow rings and no markers; a collected roll's
> dice leave the felt and its record is its row in the roll log. Read this
> section for the lifecycle and §7.27 for where a collected roll now lives.

Joe's direction (2026-07-30), synthesized: the main felt belongs to ONE roll
at a time; history lives on a shelf.

- **Shelf**: 5 recessed slots along the bottom felt edge, rendered in the 3D
  scene (identical in compact view). A collected roll's dice sit in its slot
  as a tight cluster; ~~a compact marker floats above it: roller color dot +
  total + meaning word (active-profile lens).~~ *(Amended 2026-08-08: the
  marker floating above it draws **nothing** — no dot, no total, no lens
  word. §7.9's P1 pass took quiet-by-default one rung past this line and the
  read never came back; see the amendment there for what ships and for
  ROADMAP U20, which owns the redesign.)*
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
- **The corner ✕ has TWO scopes** (ROADMAP C7 ②, 2026-08-08). One press
  clears **your** rolls — the ordinary act, instant, and what almost every
  press means. When other people's rolls are still on the table it then
  **arms in place** for the wider sweep, using the same two-tap grammar the
  rack's delete uses, and disarms after 4 s. Skipped when your rolls were all
  the rolls: pressing twice to clear a table you are alone at is a toll, not
  a safeguard. Before this the single press swept every player's shelf, on an
  unmodified `c`, with no confirmation anywhere in the app and no word about
  who did it. **The server gates nothing** — goal 10 means there is no
  permission to check, so the arming is a courtesy to the presser, not an
  access control; and every sweep now names its author and its scope to the
  table (`Bob cleared their rolls` / `Bob cleared the table`).
- **Housekeeping is universal**: a COLLECTED roll may be cleared by anyone
  (slot ✕ or its marker); an uncollected roll's dice remain roller-only to
  clear. Corner ✕ sweeps everything, unchanged.
- **…and universal once the ROLLER LEAVES** (ROADMAP U19, 2026-08-08). The
  roller-only rule above had no exception for the roller being gone, so an
  uncollected roll from a departed player was immovable: for a HELD roll,
  unrevealable too (authority is an ephemeral `playerId` with no successor),
  which meant it sat on the felt for the rest of the session. Clearing sends
  dice away and **never discloses a value**, so extending housekeeping here
  costs no privacy. The same applies to an **offer** whose creator has left:
  a public invitation nobody can withdraw is just litter.
  What did NOT change: reveal gains no fallback. A held roll whose authority
  is gone stays secret forever — the right failure direction. Succeeding to
  authority by seat NAME is refused outright, because duplicate names all
  join and anyone could sit down as you and flip your held rolls.
- **Resync**: hello/join carries per-roll state (uncleared rolls: on-felt |
  collected+order). Clients reconstruct the felt (settled replay of the
  newest on-felt roll, no tumble) and the shelf identically — closing the
  audit's empty-felt-on-reload gap.

### 7.7.1 Shelf refinements (play-test feedback, 2026-07-30)

> **The felt half of this section is retired (C25, §7.27):** no slot decals,
> no under-glow rings, no markers, no whisk. "Nothing is drawn where nothing
> sits" now describes the whole felt. The peek CARD survives intact — same
> content, same folded-card grammar — anchored to a log row instead of a slot.

- **No casino markings.** The permanent slot tray decals are removed from the
  felt composite; empty shelf space is plain felt. An OCCUPIED position gets
  only a soft under-glow ring beneath its cluster (subtle warm gold radial,
  arcane-circle feel, theme-aware) that appears with the whisk and sinks
  with the roll. Nothing is drawn where nothing sits.
- **Default felt is obsidian** (server + solo fallback; amended 2026-07 —
  was walnut). Emerald and walnut remain in the picker.
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
*(The verdict-card half is superseded 2026-08-04 — §7.16: the ceremony
card is a folded card that FLOWS TO COLLECTED; its body clears, its
clock collects, and the per-card ⟳/✕/Done buttons are gone.)*

Amendment to §7.7.1 peek cards (Joe, play-test): the peek must NOT scale/zoom
in — it appears in place (instant, or ≤100ms opacity fade only). Motion
restraint: cards are chrome, not ceremony.

Amendment (Joe 2026-08-04, panel parity — 'the collected panels are a
mess; make them more like the reveal panels'): the peek wears the
BANNER's dress — same small-caps centered identity line (the roller's
name in their color; the redundant color dot retired), banner-family
width (300–460px, wide enough to seat an outcome row whole), a larger
gold total — and rides 24px clear of its cluster. And on BOTH panels
(banner, peek — verdict card too) the fold's reveal-tier verbs now rest
DIM (0.45) instead of invisible: the reserved fold read as a dead void
at rest. Quiet → loud on approach, never invisible → visible (the P6
standing-furniture grammar, applied to the fold).

### 7.8 Visibility notation (`held` · `secret` · `w:`)

Visibility is part of a roll's intent, so it has a canonical spelling.
Without one, a saved pool, an exported rack or a history recall silently
downgrades privacy — a pool meant to be secret rolls in the open on the
next machine that opens it. That is a notation-totality violation
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
- **`blind`** — accepted on an **offer**'s notation only, as an alias
  canonicalizing to `secret` (offerer-only: the dice-tower roll, §3.3).
  On a self-roll it is refused with the teaching error *a blind roll needs
  someone else to hold the result — offer this roll instead*. This is the
  grammar's one context-aware corner: `parseNotation(str, {offer: true})`;
  `/api/offer` and the client's offer verb parse with it. Canonical output
  never emits `blind`, so the fixed point is `… secret`.
- **Mutually exclusive.** Two visibility flags in one command is a parse
  error — `held and secret are mutually exclusive`, hinted
  `a roll has one visibility: held, secret or w:Name` — including a prefix
  that disagrees with a flag, where the hint names the prefix instead
  (`the /gmroll prefix already sets secret`). A prefix that *agrees* is
  accepted (`/selfroll 1d20 secret`). The same flag written twice is a
  typo, not an exclusion: `held specified twice`.

**Prefixes normalize into the slot** and never survive into canonical
output: `/gmroll`, `/gmr`, `/selfroll` → `secret` (§3.2's terminology
note — Roll20's `/gmroll` guarantees the roller sees the result and the
table learns nothing, which is `secret` on both axes; the pre-amendment
`held` binding inverted both). **`/sr` never binds**: Foundry's self roll
and Roll20's 2026 Secret Roll are opposites under the same two letters, so
it parses invalid with *"/sr is ambiguous — Foundry self roll vs Roll20
secret roll (opposites)"* and the hint *use 'secret' (only you see it) or
offer a dice-tower roll*.

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
  pool whispering `w:Kira` includes whoever rolls it, plus Kira.

**Examples.**

```
1d20+5 held dc15 # Perception
1d20 secret
2d6+1d20 adv w:Kira dc12 # A quiet word
1d20 check w:"Ann Smith",Bob dc15 # The lie leaves your lips | CHARISMA CHECK
4d6dl1 w:"Bob \"Two-Axe\" Vance"

/gmroll 1d20+3        →  1d20+3 secret
/selfroll 4d6dl1      →  4d6dl1 secret
/sr 1d20              →  parse error (ambiguous across tools — teaching hint)
1d20 blind            →  parse error on a roll; on an OFFER → 1d20 secret
1d20 held secret      →  parse error (one visibility per roll)
```

**It rides everything for free.** Every carrier stores canonical strings, so
a saved pool's visibility travels through localStorage, history and the YAML
export with no side-channel token — see §1.5, where the once-planned `@vis=`
token is retired for this reason. On
an offer, the same string expresses the offerer's choice, which is what
makes the GM-screen roll a one-liner (§3.3).

### 7.9 Quiet chrome (the shipped redesign, 2026-07-30)

Two principles, binding, and where they touch earlier sections they win:

- **P1 — quiet by default, detail on intent.** Ambient state is
  glanceable-minimal; detail arrives on hover, focus or expand.
- **P2 — one layer scale.** A single documented z ladder, with ceremony
  above ambient table labels so a roll moment is never occluded.

**The ladder** lives as `:root` custom properties in `css/style.css` and
every fixed overlay reads one of them, never a bare number:
`--z-panel 10` < `--z-table-labels 11`
(value chips, shelf markers) < `--z-banner 12` < `--z-ceremony 14` <
`--z-offers 16` < `--z-flyout 18` (the pinned roll-log flyout — above the
offers/banner it is consulted over, below everything that must peel first;
2026-07 amendment: `--z-right-stack 9` retired with the log panel) <
`--z-crit 20` < `--z-popover 26` < `--z-peek 30` <
`--z-modal 40` < `--z-palette 58` < `--z-cheatsheet 62`. §2.4's amended
Placement note records the bug this killed.

**Value chips are off by default** (`dice.chips.v1`, "Show numbers on
dice" in the settings *Just you* section). The readability invariant
(GOALS) is carried by the banner, the verdict card, the log and the
breakdown, which is where a number is legible anyway; chips become the
opt-in for people who want them floating over the felt.

**Dice set is a *Just you* setting** (`dice.diceset.v1`, Tier 6 §9): a
COMPACT SELECT under Sound/chips — one pill button wearing the current
choice (the dot is a die face: body color + a "6" in the digit color)
that opens a body-level floating menu: Standard first, then each house's
sets under a small-caps house header, keyboard-driven, one open menu
app-wide. The same control is the pool popover's set-override picker
(the identity strip) — one picker language everywhere a set is chosen
(Joe 2026-08-03: consistency). Your choice rides
every roll and claim you make and everyone sees it; it applies FROM THE
NEXT ROLL (dice already on the felt keep the skin they landed with — a
roll is a record). Not room state: two players wear two sets. Shroud
outranks identity everywhere (a hidden roll is obsidian, sheds no
particles, and reveals INTO the roller's set).

~~**Resting shelf markers are a dot.** One roller-colored dot on a large
round target — no always-on gold total, no tiny ✕, and a held roll shows
the same dot rather than shouting `?`.~~ **Amended 2026-08-08 to match the
build: the resting marker draws NOTHING.** P1 was taken one rung further than
this paragraph records — the settled cluster is its own presence, so a dot
floating over the pile read as chrome about chrome. `.shelf-marker` ships
`background:none; border:none` over a 76px invisible hit disc (56px in
`body.mini`), and `.sm-dot` is styled in `css/style.css` with **no producer in
`js/`** — a rule waiting for a decision, not a shipped element. The
consequence is real and known: a shelved roll carries no read at rest at all —
not who rolled it, not what it meant, not which held roll is still waiting on
its reveal — and `title` is the whole information channel, which touch never
gets. **ROADMAP U20 owns that redesign** (produce the dot, add a shroud glyph
for hidden entries) and it is a DESIGN FIRST item; until it lands, this
paragraph describes an intention and the CSS describes the surface. Hover or
tap still explodes the marker into the peek card (§7.7.1) with the full total
and breakdown. ~~the peek carries a prominent ✕ at its base that clears the
roll for everyone. *(Amended by §7.15's one-✕ rule: the peek's base ✕ now
exists only when a TAP opened the card; a hover-opened peek defers the clear
to the marker's sweep dress — one affordance at a time.)*~~ **Retired by
§7.11b and §7.21**: the peek's clear is the named `✕ Clear` at the head of its
fold, in every modality, and nothing branches on the opening gesture.

**The clear gesture is one gesture.** ~~The roller's ✕ on the post-roll
banner, the ✕ on the verdict card and the peek's base ✕ share a class, a
look and the label *Clear this roll for everyone*.~~ **Restated by §7.21**:
all three surfaces lead their fold with one named primary built by
`appendCardActions` — `✕ Clear` for the roller, `✕ Dismiss` for a spectator,
`❯❯ Skip` while a ceremony beat still plays — each carrying that same
sentence as its `aria-label`. The rule is unchanged; the affordance is a
worded button rather than a bare glyph. A spectator's local dismiss stays
visually distinct — different semantics, different affordance.

**The rail never hides — and it rides the panel now.** *(2026-08-04, Joe:
zero overlays on the tabletop.)* The rail split in two inside the side
panel: `#rail` at the TOP is presence alone — identity chip · roster ·
status pill — and `#rail-foot` at the panel's FOOT carries the utility
verbs — ⚙ settings · ≣ roll log · ❯ quick roll · the contextual ✕ Clear
table (which left the felt corner). Collapsed, both become centered icon
stacks; nothing is ever stranded (the old compact-mode bug stays fixed).

**ORDER IS THE CONTRACT** *(amended 2026-08-04, Joe: "the player should
have their name to the left of other players — that way their name
location is stable", and "settings should be far left… think about
positions of all UI elements carefully")*. Both bars are ordered so that
nothing permanent ever moves:

- **Top rail — YOU first.** Your chip anchors the column's top-left corner
  and never shifts; the roster grows rightward from it, and the transient
  status pill comes LAST so that when it appears it wraps to its own line
  *below* you. (It used to LEAD the rail, which pushed your own name down
  the moment anything had to be announced — exactly the drift this
  ordering kills.)
- **Foot — configure → consult → act, then the corner.** ⚙ · ≣ · ❯ form a
  fixed LEFT cluster; the contextual ✕ Clear table sits alone in the right
  corner (`margin-left: auto`) — the same corner ✕ Clear owns on the
  workbench rim directly above it, so the panel has ONE rule for where a
  clearing verb lives. ❯ is deliberately *not* right-aligned: pinned to
  that edge it would be the thing the ✕ shoved around every time dice
  landed or left.
Their drops still overlay (menus may — the identity menu falls from the
top, the log flyout rises from the foot); the panel's own content never
does. *(Historical: the rail was a top-right felt overlay; the ⤡
collapse-all button deleted 2026-07 — key `m` remains; 🔊 retired
2026-08-03.)*

**THE SIDE PANEL (2026-08-04)** *(supersedes the overlay panel + labelled
edge tab)*: the ONE Pools region is a dedicated layout COLUMN — opaque
neutral graphite (the dice themes carry the color; gold survives only on
roll verbs, and the draft well wears the one warm bronze surface),
separated from the felt by a single vertical divider that IS the collapse
control (`#edge-toggle`, chevron at top). The canvas is sized BESIDE it
(refitView: `--table-left` = live panel width; camera, renderer and every
felt-anchored overlay re-derive on toggle), so expanding never covers a
landed roll — the felt resizes instead. There is no "Pools" title row.
Collapsed = a POOL RAIL (112px — *superseded 2026-08-07, §7.22; it was a
56px icon rail with vertical names and a tap that rolled*): **you, named**,
at the top; the shelf-grouped pool list and its standing Roll bar below;
the utility row pinned at the foot — all sharing one left edge, nothing
centered. Zero edit/save/notation chrome, as before. A tap SELECTS and the
standing gold bar rolls the selection. `? Help` is the one utility the
collapsed foot gives up, for measured room (§7.22). The collapsed-tab hover
flyout is retired. State stays in `dice.panels.v1`; the selection is
deliberately NOT stored anywhere.

**ONE region since the panel merge (2026-07-31)** *(was three, then two:
the roll log moved to the rail flyout — `l` — and then New pool and Saved
pools merged)*. The DRAFT is its first row — structurally a saved-pool row that does
not exist yet — with the saved list directly beneath, so Save lands the new
row in view. Keys `n` (documented) and `b`/`g` (silent aliases) toggle it;
`m` keeps its collapse-all muscle memory. The draft shows ONE input view at
a time — Dice (palette + cluster) or Notation (the command box), a per-user
toggle (`dice.inputmode.v1`); both edit the same draft, the cluster stays
alive in Notation view (typed dice materialize), and loading a pool into
the box flips the view for that visit without rewriting the preference.

**Result surfaces serve the result (2026-07-31).** At rest the banner and
verdict card are content plus at most ONE standing verb: **Done** — the
roller's Done collects (dice to the shelf, result kept; Enter's twin), a
spectator's dismisses locally in quieter dress. Everything else (⟳, the
clear-for-everyone ✕) is the revealed tier: it arrives with the pointer or
keyboard focus and stands on coarse pointers; the transient verdict card
reveals even its Done. The peek rerolls through a bare ROLL ❯❯❯ cue (the
real dice sit right below the card), its ± opens the SAME anchored popover
as every ± (the peek pins while it lives; rolling a tweak REPLACES the
shelved roll), and its Save mints 'keep this roll as a pool'.

**The Rack across the table (2b-④⑤, 2026-07-31).** Racks PUBLISH: every
player's saved pools ride the roster (name + notation + category — a
display copy; localStorage stays each owner's truth). The Pools panel
grows an owner-switcher row of quiet chips (You first) whenever the table
has teammates; a teammate's rack stands behind a standing
`ALICE'S POOLS · READ-ONLY` banner-chip that is also the way back. Foreign
tiles are STAGE-ONLY — no ±, no manage, no ordinals; staging snapshots
name+notation at stage time, so a later edit repaints tiles but never a
staged chip. Digits always act on YOUR rack; entering ✎ falls home first.
And results answer PER POOL: the breakdown, the outcome tally and the log
line group under small-caps source labels (`WISDOM d8 7 + d8 2 · SWORDS
d6 4`), chips carry `Pool — Word` titles, extras (advantage partners,
rerolls, explosion children) chase their provenance back to a base die,
and a pool whose dice all landed null cells answers `quiet` — its answer
IS the silence. Attribution rides `spec.sources`/the notation string
(single carrier, like visibility); redaction drops it with the spec.

**The quiet-table pass (2026-08-01, Joe's cleanup).** Four bindings:
(1) Tile ± is retired — tweaking belongs to the ROLL moment (stage the
pool; the draft's ± is right there); right-click on a tile remains the
quiet per-pool popover path (Update / variants). (2) The draft breathes:
the cluster stands taller and its gold promise now RESTS on it whenever
dice are staged (a quiet chevron whisper, loud on hover), while Save ·
Clear demote to ghost text that surfaces on the zone's hover/focus (and
stands on coarse pointers) — draft management is not part of the roll.
*(The ghost-text demotion is superseded by §7.14: the rail STANDS — P6's
tier rule lists draft management under "stands"; the quietness is the
rail's contextual appearance, only while a draft exists.)*
(3) The tidy-away clock **— RETIRED 2026-08-10, see §7.28.** *(As written: a
finished OPEN roll of YOURS auto-collects to the shelf ~6s after it settles (hovering the banner holds the clock — you
are reading; Enter keeps it now, Esc sweeps; hidden rolls stand until
their reveal — the tension is the point; spectators never collect for the
roller.)* The clock that remains on this surface retires the CARD, not the
roll. ONE RESULT CARD (Joe: 'why are the options any different at
all?'): the banner and the shelf peek offer the identical action set via
one builder (appendCardActions) — at rest pure result; approach reveals
the bare ROLL ❯❯❯ strip and ✕, standing on coarse pointers; Reveal alone
stands, only while a hidden roll awaits its authority; Done is RETIRED
(auto-collect owns the idle path) and the card ± with it — the tweak
popover is right-click on the cluster, its marker, or the card, the same
pointer bonus as tiles. Deliberate asymmetries: the peek's reroll REPLACES
its shelved cluster while the banner's lets the old roll shelve itself on
arrival, and the banner ✕ role-splits (roller clears for everyone, a
spectator dismisses their own card) where the peek's ✕ is §7.7
housekeeping for anyone. ~~The collected cluster itself stays the ONE big
felt-side clear target — click sweeps it, hover dresses the whole circle
with the ✕ promise (never a second smaller target for the same verb).
*(That "never a second target" clause was violated in the shipped build —
the zero-delay peek carried its ✕ on the same pointer beat that dressed
the sweep; §7.15's one-✕ rule closes it: the peek builds a ✕ only when a
tap opened it.)*~~ **Retired by §7.11b, and the clause restated by §7.21.**
The felt-side sweep dress is gone: clicking a marker OPENS its peek, and the
peek's own named `✕ Clear` is the clear target — one affordance, no gesture
branch, so §7.15's whole one-✕ machinery went with it. The clause survives
in §7.21's sharpened form — *never a smaller UNNAMED target for one verb* —
because the card body is still a shortcut to the named button, not a rival
to it.
(4) The
default rack is the Soul Deal starting set: nine attributes in their
Physical/Mental/Social triads (Strength/Toughness/Agility ·
Wit/Wisdom/Intelligence · Charm/Will/Empathy), six weapon skills and
three motivations — attribute+skill+motivation is **'1 4 7 Enter'** from a
fresh seat. (It read '1 2 3 Enter' until 2026-08-08, which the dealt rack
directly below had made false: nine attributes filled all nine digits. U24
shares the digits out across the shelves — 3/3/3 here — so the claim is a
fact again rather than an aspiration.) (Fixed underneath: migrateGroup dropped pool categories on
every boot, on every path into the rack.)

*(**THE DEALT RACK, 2026-08-08.** The seed shipped as eleven identical
1d6 pools — correct, and completely flat. It is now **dealt**
(`js/seed.js`): each shelf is PRICED — Attributes 100, Skills 100,
Motivations 30 dice value, the first two being Joe's own framing of the
creation budget in POOL-ANALYSIS §1 — and the dice are drawn at random
*inside* that price, so a fresh browser opens on a character (Strength
1d20 beside Wit 1d4) rather than on a blank form. The nine attribute
names are fixed, being the sheet's spine; the six weapons are drawn from
ten and the three motivations from twelve, so two seats rarely open the
same armoury or the same drives. Three properties hold the design
honest. **The price is exact, not approximate** — the dealer draws a
rank only when what it leaves behind is still spendable and still opens
every pool that has nothing, so the shelf lands on its number by
construction rather than by retrying; `tests/seed.test.mjs` re-prices
4000 deals through `budgetOf`, the ✎ ledger's own function. **The price
is the data's, not a rule** — POOL-ANALYSIS §5 keeps the budget target
out of storage and nothing here changes that; the app still enforces no
budget and the ✎ editor is still the only advancement path. **The deal
happens once**, at the moment storage is empty; a reload re-reads the
stored rack, and a re-roll there would rewrite a sheet someone had
already played. `soul-seed` pins all three in a browser.)*

**THE SHEET PASS (2026-08-01, panel-designed).** The rack is the
CHARACTER SHEET, so a pool's IDENTITY — name, shelf, die rank — edits like
one: instantly, by id, where you already are. Two surfaces carry all five
editing CUJs. (1) The pool popover (right-click a tile; in ✎ the whole
tile opens it; 500ms hold on touch) grows an IDENTITY STRIP above a
hairline — the visible commit-model line: above it identity writes
through editPoolById on every tap (renaming is the save-morph input
grammar; the shelf is owner-chip dress chips, tap to move, tap the
pressed chip to demote to plain Pools, ＋ mints a shelf; the DICE SET
row (§9 override, 2026-08-03) is the settings picker's own compact
select with a 'Your set — <name>' default: an override makes the pool
roll AS ITSELF — its dice wear that set for everyone, DIE BY DIE (a
mixed draft rolls each pool's skin side by side; loose dice wear the
roller's), 'Standard' pins the classics under any house set, and the
tile strip previews the override — on your rack and on a teammate's
view of it alike, where unmarked pools resolve to the OWNER's default
set (published with the rack, 2026-08-04) so a rack looks identical
on every screen; die rank is a
ladder of six real die faces, tap to advance — count preserved, ivory
ring never gold, fail-closed to pure NdX notations so a dc12 can never be
dropped); below the hairline the unchanged roll-tweak draft. Complex
pools swap the ladder for their canonical echo plus two quiet doors:
'Edit notation…' (the card, slimmed to notation-only) and 'Open in
draft'. (2) Creation is an EDITING verb (amended same day, Joe): at rest the
panel is pure play — populated shelves only, zero edit chrome. Inside ✎
every shelf (the trio always, plus any session shelf) ends in a GHOST
'+' tile; tapping it opens a creation card in place that COMPOSES like
the palette — the six faces ADD a die per tap (d6 pre-staged), the
growing pool previews as grouped units, tapping a unit removes one, and
the NEWBORN CONTRACT holds: nothing exists until Enter/✓; the shelf you
tapped IS the category, never typed. '＋ New shelf…' below the last shelf
mints a session shelf that materializes when its first pool lands and
evaporates on Done otherwise. (3-amended) THE GATE ITSELF GREW (Joe: the
tiny header ✎ was the real complaint): the toggle is now a full-width
quiet '✎ Edit pools' row at the rack's FOOT — P6 verbatim, management
stands BELOW — which morphs into the ivory 'EDITING POOLS · Done' bar
when on; the header ✎ is retired, and so is Copy link (sharing a rack is
Settings → Your data → Export — §7.13). The save morph
keeps its shelf chips. Manage mode remains the destructive gate: grown
24px ✕ overlays, whole-tile-opens-editor, per-tile ✎ retired. CUJ
arithmetic: advance Wisdom = right-click + face tap; rename = right-click
+ name tap + type (both at REST); add a skill = Edit pools + ghost tap +
type + Enter. The chrome word is 'pools', never 'rack' (terminology-
pinned).

**The tier rule (P6, the binding sharpening).** Treatments bind CONTROL
TIERS, not screens: content stands (dice, names, totals); roll-adjacent
controls reveal on approach (±, per-die ✕, log ⟳, the ROLL cue, 1-9
ordinals); management stands below or behind a gate (Save · Clear, the ✎
toolbar). A treatment adopted for a tier anywhere applies to that tier
everywhere. The gold fill belongs to the roll verb alone. **Compact view is emergent**: `body.mini` is derived from "every panel
is collapsed" and only rescales the table and its labels — it is not a
mode, and nothing can be reached in one state that cannot be reached in the
other. *(Amended 2026-07: the Players panel is retired — the roster is rail
furniture, not a workspace. Everyone else at the table rests as quiet name
pills beside the identity chip, folding into a `+N` pill past a handful;
you are the identity chip itself, which is the whole "which one is me"
signal.)*

**Identity is on the table, solo and online.** The chip (color dot + name)
opens Change name · Leave & switch seat · Copy invite link. Solo is a
first-class case: rename writes `dice.name.v1` with no server, and leaving
drops the seat, forgets the name and re-prompts.

**A refresh is the same player** *(2026-08-04)*. Reloading keeps your seat:
same name, same color, and nobody else's roster so much as blinks — no
ghost pill of you beside you while the abandoned seat times out. **Leave &
switch seat** is the one gesture that gives a seat up. The memory is per
TAB, so a second tab on the same screen is still a second player at the
table. (Mechanics: ROADMAP §0f.)

**Saved pools edit in place.** The row set is Roll · ± · ✎ · ✕. The pencil
turns the row into a name + notation editor whose Update writes back to the
same record **by id**; the ± popover gains *Update this pool* beside the
additive *Save as variant*. Writing by id is the fix for two bugs at once:
renaming used to fork a duplicate, and an unnamed pool could not be updated
at all. *(The two-verb row is superseded by §7.10's one commit verb.)*

### 7.10 The Trigger Pass (shipped 2026-08-03)

From Joe's play notes; ROADMAP 2d. **One way to roll:** the ± popover is a
pure EDITOR — its Roll and Offer to table are retired; every roll fires
from a ROLL ❯❯❯ trigger (the draft cluster, a card's reroll strip) and
offers fire from the draft row's *Offer to table* (hidden solo; targeted
offers will grow their audience picker there). Where a popover edit lands
depends on its source:

- **tray** — a live editor of the draft: every edit re-lands in the command
  box as the canonical (the box is the draft's one carrier; parse-to-parse
  compare keeps a hand-typed spelling until an actual edit, and the
  resync loop short-circuits on canonical equality so part-label input
  closures survive). No commit chrome at all — the draft's own
  Save · Offer · Clear row stands beside it. An audience-less whisper is
  unsendable and stays popover-local.
- **group** — a working draft that commits with **one verb**: *Save*
  (editPoolById, the by-id write; replaces the confusing *Update this
  pool* + second *Save* pair). *Duplicate…* is the additive twin (the old
  variant morph, same inline-name flow).
- **shelf** — inspect/tweak; *Open in draft* carries the tweak to the one
  composing surface (the popover-roll that REPLACED the shelved roll is
  retired; the peek's bare ⟳ strip still replaces). *Save as pool…* keeps
  the roll.

**Count editing composes (the identity strip).** Any PURE dice pool —
nothing but ladder dice in its canonical — renders its dice as removable
grouped units (the last die refuses: a pool is never empty) over the six
rank faces as adders (40-cap guarded); a swap is remove + add. One idiom
for building dice everywhere (creation card, draft palette, strip). Taps
commit through stripCommit, so a mid-typed dc below the hairline survives.
Complex pools keep the fail-closed echo + the two doors.

**Per-die tables fold the sum world.** Under a per-die system (Soul Deal)
the popover hides Modifier / d20 pairing / Target (DC) / keep-drop —
reroll and explode stay, they read per die — behind the sysnote's *Show
anyway* disclosure (per-open, never persisted; supersedes step 2's "mark
as such"). Stored values keep riding the canonical either way.

**Cards are chrome; they don't jiggle.** The result banner holds a width
floor and ceiling (titles wrap inside), the offers layer owns one fixed
column width (titles ellipsize), ×N strip counts are tabular. The draft's
source-chip names were already capped at 90px.

### 7.11 Targeted offers (shipped 2026-08-03)

ROADMAP 4b — "Bo, roll this save": an offer claimable only by a named
player, the first multi-player CUJ on the Trigger Pass's single offer
surface.

- **Wire**: `to` (a player name) rides `/api/offer` beside either shape.
  The server resolves it against the CURRENT roster at offer creation,
  exactly like a whisper audience — case-insensitive, duplicate names all
  join, unknown names refuse the offer outright (400 `unknown_target`;
  fail closed, never a card nobody can take). The pinned ids are the
  claim gate: 403 `not_offer_target` for anyone else, server-enforced —
  the same authority rule as reveal. A rename or rejoin never widens or
  moves the gate (whisper's identity rule). The offer stays on the table
  for its named player; Withdraw remains the offerer's out.
- **Card**: public in full — the head reads "Alice offers a roll **for
  Bob**"; the stakes (dice, dc, visibility, moment) show to everyone.
  Only a pinned claimant wears the ROLL ❯❯❯ claim strip; bystanders get
  a quiet *waiting on Bob* line in the strip's reserved slot (the card
  holds its size). Composes with offer visibility unchanged (a targeted
  dice-tower offer = only Bob may claim, only the offerer reads).
- **Picker**: a ▾ split button beside the draft row's *Offer to table* —
  the plain verb keeps its one-click table-wide muscle memory; the ▾
  opens a one-name menu (identity-menu dress) rebuilt from the live
  roster on every open, and hides until a teammate exists. Esc and
  click-away close it; a roster change closes it (never target a ghost).
  Shift+Enter stays table-wide.

*(Amended same day — whisper-offer auto-targeting, Joe: "a whisper roll
is already assigned to someone, so the offer should always be to that
person.")* An offered **whisper** derives its `to` FROM its audience,
server-side: `w:Bo` offered is claimable by Bo alone, and table-wide
whisper offers cease to exist by construction. Multi-name whispers are
claimable by any audience member; the ▾ may still narrow WITHIN the
audience, while a target outside it refuses (400 `target_not_in_audience`
— a teaching error, never a silent override) and a whisper whose only
audience is the offerer refuses at offer time (400
`whisper_needs_audience`). The ▾ hides while the draft carries whisper
visibility — there is nothing to choose. `secret` (dice tower — open
claiming is its point) and `held` offers are untouched. This supersedes
the bystander-claims-blind reading of an offered whisper: that property
lives on only in the dice tower.

### 7.11b The folded card, the hover read, and the feed (shipped
2026-08-03)

Joe's cleanup pass, unifying the reveal and collect grammars around ONE
idea: the likeliest act after reading a result is removing it, so the
removal target should be huge.

**The folded card.** The result banner's BODY is the one big clear
target (the collected cluster already taught this — its sweep; here the
dice are scattered, so the PANEL is the target). Hovering the body arms
an unmistakable removal dress — red wash, red hairline, a quiet ✕
watermark rising behind the content — and a click clears for everyone.
The role split survives: a spectator's body wears the muted slate
variant (their click dismisses locally; red would lie — the dice stay).
Below a hairline FOLD sit the verbs that do anything else — REROLL ❯❯❯,
Reveal — which never light up under the removal hover. The banner's own
✕ retired (§7.9's "never a second smaller target for one verb").

**The hover read.** The removal highlight doubles as a read: hovering
the card outlines that roll's dice on the felt — inverted-hull WebGL
shells (a back-face copy 7% larger, riding each die as a child), one
color per source pool from a six-hue cycle that avoids gold (the roll
verb's) and red (removal's); unsourced dice wear quiet ivory. A hidden
roll's sources are withheld with its spec, so its outlines are all
ivory and leak nothing.

**…AND THE CARD SAYS WHICH HUE IS WHICH POOL** *(amended 2026-08-09;
Joe: the hover "doesn't have any UX that maps the outline highlight
color of the dice with the pools the color relates to")*. Each pool
label on the result card leads with its own hue as a small filled dot,
so the read is a legend rather than a puzzle: WISDOM • teal, and the
two teal dice on the felt are Wisdom's. Three rules make it safe to add
color to a surface that already uses color for meaning:

- **A key, not a recolor.** The dot carries the hue; the label keeps
  `--muted` small-caps. Tier colors (success/fail/crit) keep their
  monopoly on meaning-bearing color — six arbitrary hues on the *words*
  would read as six more verdicts.
- **The loose group gets a dot too** — ivory, the same ivory its dice
  wear. Skipping it would leave the one row the hover colors differently
  as the one row the key never explains. In the ledger it takes a label
  cell of its own, holding nothing else, so the spine stays a spine.
- **Only on the surface whose hover paints the felt.** The banner shows
  the key; the peek and the verdict card do not. A key to a highlight
  that never paints is decoration. Under a sum lens the pool labels live
  in the breakdown line instead of the ledger, and the key follows them
  there.

One assignment, in `sourceColorMap`, keyed by source name and walked in
die order — the felt and the card look the same color up rather than
each computing their own. Hidden rolls yield an empty map: every die
outlines ivory and the card paints no key, unchanged.

Still open, recorded rather than fixed: **touch has no hover**, so the
key stands but the highlight it explains never paints on a phone; and
hovering ONE pool's row could isolate that pool's dice, which is the
obvious next read and is not built.

**The beacon, take two — size and air.** *(The first take's converging
funnels looked right over an empty well but fought the rail once
Save · Offer · Clear stood — Joe, same day. Retired.)* The well earns
its presence by SIZE and AIR instead: real margins above and below,
a 64px-tall well, and dice that land **larger inside it (34px) than in
any pool row (28px)** — the draft is the star. Heat stays: stepped
classes (heat-1…4, two dice per step) brighten the well's gold
under-glow and gather the standing ROLL whisper from 0.3 toward 0.55.
Light, depth and scale — never geometry jitter (§7.10). An empty well
stays quiet; the banner's own retire runs at 7 s with a hover-hold (it was
auto-collect at 3 s until §7.28).

**Ghost dice, the loud cue, and the one-home mute** *(same day)*: the
empty well shows GHOST DICE — three faint desaturated die-art sockets
(d20 · d6 · d8) over a whisper of caption that speaks the active view's
language ('tap a die — it lands here' / 'dice you type land here');
approach warms them; real dice replace them (placeholder semantics). On
a full pool, hovering the roll button BRIGHTENS the cue well past its
resting translucency while the dice lower to 35% under it — the promise
reads over any content, except while a ✕ remover is the target (dice
stay readable; that click removes). The rail's 🔊 retired — sound's one
home is Settings ('s' stays the shortcut).

**Standing furniture, the whole word, and quiet ✕s** *(same day, Joe's
pre-release notes)*: the rail (Save · Offer · ✕ Clear) is STANDING
FURNITURE — always rendered, verbs grayed until a draft exists, so the
workbench's geometry never moves (supersedes §7.14's contextual rail;
Offer keeps its solo-hide — a solo table can never use it and it never
toggles after join). The ROLL/REROLL cue word ALWAYS renders — cue-tight
retired: hiding the word on a crowded strip hid the promise exactly
where the roll was biggest, and the dim-under-hover keeps it legible
over any pool. The draft's ✕ removers reveal by PROXIMITY — only the ✕
whose die or pool chip the pointer is over shows (hit-tested; the art is
pointer-events:none), never the whole cluster's worth at once; touch
keeps them all standing.

**The folded card, shelf edition** *(same day: 'make the collect panel
roughly the same as the roll reveal panel')*: the peek's BODY is the one
big clear target — the same red removal dress and ✕ watermark as the
banner's, always red here because clearing a collected roll is anyone's
housekeeping (§7.7) — with REROLL/Reveal in the fold below. The
✕-over-the-dice sweep dress is fully retired, and with it the whole
gesture-tracked one-✕ machinery (`peekVia`/`sweepUnavailable`, §7.15's
modality rule): the marker is now a quiet dot that only OPENS the card
(hover peeks, click pins) in every modality, and the card clears. One
removal grammar on both result surfaces.

### 7.12 The organized per-die read (shipped 2026-08-03)

ROADMAP 2e — Joe: the reveal surfaces got muddled under Soul Deal. The
diagnosis: **duplication at equal weight**. The tally line ('WISDOM
Success · 2× Fail') and the breakdown line ('WISDOM d8 7 + d8 2') both
repeated every source label, at similar size, and learning WHICH die said
WHAT meant cross-referencing the two — while dnd's 52px total had no
per-die counterpart, so the card had no hero at all.

**The fix is one structure — outcome ROWS.** Each pool is a row: its
label leading, then one CHIP per die: `[d8 7 → Success]` — the die+face
in small mono (the evidence), the outcome word in the display face,
tier-colored (the answer). A quiet die keeps its evidence chip, dimmed;
an all-quiet pool says *quiet*. Where the rows stand, the separate
breakdown line FOLDS — it carried nothing the rows don't.

Surfaces: the result banner (hero slot), the ceremony verdict card (the
rows are the verdict; the ring's center goes empty under per-die — the
old dice-count there read as a total, the exact confusion), and the shelf
peek (smaller dress, same structure). The LOG keeps its compact grouped
words — a list line is the right density there. Sum systems (dnd, none)
are untouched: total hero + breakdown pair as before.

The text layer keeps the read (the audit rule): every chip carries real
text ('d8 7 Success'), every row leads with its pool — copy/paste and
screen readers get the per-pool, per-die story line by line.

### 7.13 Your data — portable YAML (shipped 2026-08-03)

Tier 4 §5: pools + just-you settings as human-editable text, in
Settings → *Your data*. One textarea, two directions — *Fill with my
data* exports; pasting or editing re-parses LIVE and the status line
previews exactly what *Apply* would do ('✓ 1 new · 1 update · 2 unchanged
· numbers on — Apply takes them'). Apply is explicit, matches by NAME
(first match; duplicate names pair off in order), writes through
`editPoolById`, appends the rest, and **deletes nothing**. Refusals name
their line ('✗ line 3: notation "nope": …') and disable Apply.

The format (`js/portable.js`, zero-dep): two top-level maps — `pools:`
with shelves as keys (the shelf named `Pools` is the plain one) and pools
as `- 'Name': 'notation'` lines; `settings:` with `sound` / `numbers`
booleans. Every scalar is single-quoted on export because notation
carries `#` (YAML's comment marker) and names may carry `: ` (the key
split); hand-written bare lines still parse. The parser is a strict
subset that fails closed: tabs, unknown keys, bad indent, bad notation,
over-cap counts and unterminated quotes are all line-numbered errors, never
guesses. Notations normalize to their canonical on import — the string
remains the one carrier.

*(Since 2026-08-04 this is the ONLY way a rack travels between browsers.
The address-bar codec that used to carry it is retired — GOALS §7 — because
a shared link replaced the receiver's rack sight-unseen. Everything here
previews first and merges by name, deleting nothing: that difference is
the whole reason the codec lost.)*

### 7.14 The workbench draft zone (shipped 2026-08-03)

From Joe's play notes: the draft's controls were incoherently placed (the
± beside the box, Save/Offer/Clear below it) and the zone sat "pressed up
against" the palette — "a really tight little box." §7.9 declares ONE
draft, two editors — the command box and the dice cluster — but only the
box *looked* like an editor. This pass dresses the cluster's line as the
second well, and derives every placement from one law:

- **The well** (`#tray-actions`, dressed in the same `--well` token as
  `.cmd-in`): the pool plus the ONE tool that shapes it — ± — revealed on
  the well's approach (roll-adjacent tier; a disabled ± never surfaces).
  While the ± popover is open the well lights via the `.open` row class —
  the wire `openPopover` always toggled but the draft never styled.
  *(Amended 2026-08-04 — see **THE TRAY** below: the ± left the well for
  the rim, the well became a two-zone object, and the `.open` light became
  a ring rather than a repaint.)*
- **The rail** (`#draft-actions`, below the well): the three verbs that
  dispose of the draft — Save · Offer to table (+ ▾, joined as one split
  verb) · ✕ Clear *(Save retired 2026-08-04 — §7.16: pool editing owns
  creation; the rim reads ± Modify · Offer ▾ · ✕ Clear)* — **standing**,
  inset to the well's 7px interior grid
  (1px border + 6px padding), ✕ Clear right-aligned into the ±'s vertical
  gutter. Appearing only while a draft exists is the contextual signal;
  while it exists, management stands. **This supersedes the 2026-08-01
  "Save · Clear demote to hover-revealed ghost text"** (§7.9's quiet-table
  pass, binding 2): the tier rule — P6, the later, binding sharpening —
  lists draft management under "stands," and the code's own comment had
  asserted it all along. The rail keeps a fixed min-height, so the save
  morph swaps in without a jump (§7.10: cards are chrome, they don't
  jiggle). **Esc peels the morph, it never eats the draft** (amended
  2026-08-03, adversarial pass): the name input's own handler always did
  this, but pressing a shelf chip moves focus off the input and Esc then
  fell through the global chain to `clearDraft()` — the composed pool
  vanished mid-naming. The morph is a layer, so it joins the peel chain
  just above the draft.
- **The zone breathes**: the sticky zone owns 16px of its own opaque
  padding above the well — the region-vs-item signal against the
  palette's internal 6px grid in Dice view, and the same 16px below the
  box in Notation view (the box's old 10px bottom margin retired, so the
  rhythm no longer differs across views). Scrolled palette rows slide
  under the zone's padding, so the air survives scroll.
- **An unparseable typed draft still shows the rail** — a half-typed `2d`
  is exactly when ✕ Clear matters; Save and Offer stay disabled through
  the parse gate. (Before, the row hid while ✕ Clear stayed enabled — a
  mouse had no path to it.)
- **`.hidden` on rail buttons is real now**: this codebase has no bare
  `.hidden` rule, so the solo-hidden *Offer to table* had been a
  live-looking dead verb; `.draft-actions .btn.hidden` closes it.
- **`--draft-h` is observed, never hand-written**: a `ResizeObserver` on
  the zone (via `borderBoxSize`) keeps the shelf headers' sticky pin
  fresh through every height change — the save morph, the rail arriving,
  wrapping source chips — with `renderTray`'s synchronous write kept for
  first paint.
- Retired with the pass: the `.pool-mods` / `.group-mods` rule families
  (the draft ± was their only remaining element; the shipped 25×38
  bordered chip was their cascade accident). *(2026-08-04: `#tray-mods`
  left the well's gutter too — it pushed the centered cue sideways. It
  spent one build as a full-width bronze drawer-pull below the well and
  then joined the rim — see below.)*

#### 7.14.1 THE TRAY, re-cut (2026-08-04, Joe live-directed)

A review pass over the side panel. Findings and the law each one settled:

- **The tray is ONE object with TWO zones.** *(Joe: "make the tray a two
  part entity with the top a normal recessed area, but the roll button
  below that a more physical button, not just text in the tray with an
  invisible separation from the dice"; then "no margin below and to the
  sides, and a single, clean horizontal line splitting it from the rest of
  the tray".)* The upper zone is a **recessed pocket** holding your dice —
  dark at its top lip, a thin highlight on its floor, because light falls
  from above. The lower zone is the **button**: a raised bronze plate
  drawn as `#tray-actions::after`, running the tray's full width to its own
  bottom corners, with exactly ONE hairline between the two. Drawing it on
  the WELL rather than on the roll button is what makes "flush" structural
  — the plate's edges *are* the tray's edges. Press sinks the face and
  drops the lettering 1px; the pocket above lights with it, because the
  whole tray is one target (Joe, 2026-08-03: "it should highlight the
  whole tray").
  - **The plate must not eat its own clicks.** Generated content paints
    above the button it dresses, so `pointer-events: none` on the ::after
    is load-bearing, not tidiness (Joe: "the roll button should be part of
    the tray click target. It's not for me right now"). The well carries
    **zero padding** so the button reaches both far edges; the dice get
    their air from the button's own padding instead. Pinned in e2e by
    `elementFromPoint` at the plate's centre, both far edges, and up in
    the pocket.
- **The cue owns a reserved band; the dice never enter it.** Before this,
  a centered 26px cue and the staged tokens shared one box, so a pool chip
  sat *on* the word — `❯❯[SNEAK][ATTACK]OLL ❯❯`. The band is
  `--cue-band` along the tray's floor and the deck above it holds the
  tokens. Only now is "ONE cue geometry in the well, every state"
  literally true. Card strips keep the overlay form (there the cue fills
  empty space beside small dice) — **and only there do the dice dim under
  the cue**; in the tray they stay solid, which is the point of the split.
- **The chevrons gave way to ENGRAVING.** *(Joe: "consider upgrading the
  chevrons with something nicer to match the bronze. Scrollwork?")* Six
  chevrons at 26px were compensating for the absence of a button; there is
  a real raised plate now, so the trail was doing a job the object already
  does. The balanced cue is a hairline rule fading into a **lozenge** on
  each side of the word — the same rotated square the ceremony's ornate
  corners are cut from, so the app has ONE ornament, not two. The rules
  inherit the cue's `currentColor`, so they light and dim with the word
  with no second state to keep in sync. Card strips keep their chevrons.
- **A gap belongs to the layout, never to the string.** `CUE_WORDS` had a
  trailing ` ` (spacing against the old chevrons), so the centered cue
  was centering FIVE glyphs while the eye read four — ~13px of invisible
  tail shoved ROLL visibly left. Joe called it by eye; two of my
  measurements "proved" it centered because both assumed four. **When a
  measurement contradicts the eye on something this simple, the
  measurement's model is the thing to doubt.**
- **The rim replaces the bronze bar.** *(Joe: "I'm not convinced the
  bronze tweak (+/-) under roll was a good choice. We have
  save/offer/clear/tweak buttons that activate for a non-empty tray. Maybe
  rethink that?")* A full-width bronze bar under the real button read as a
  second, weaker roll button. Every tool that acts on the tray's contents
  arms on the *same* condition, so they are ONE row: `±` shapes the draft,
  Save · Offer · ✕ Clear dispose of it. Steel tool plates (bevel hairline,
  seated shadow); ± keeps a bronze tint because it belongs to the roll
  world — **gold stays reserved for the roll act itself**. Standing
  furniture is untouched: the rim never leaves, its tools gray on an empty
  tray, the geometry never moves. *Offer to table* shortened to *Offer*
  (the ▾ beside it carries "or pick one").
- **A staged pool is a PLATE.** *(Joe: "make the tile backgrounds less
  transparent or non-transparent".)* Near-opaque steel, bevel on top,
  shadow beneath — a token sitting *in* the tray instead of ghosting over
  it, which is also what gives a borrowed pool's skin a surface to sit on.
  Its dice ride their own row (`.sc-dice`): `buildDieStrip` returns a
  *fragment*, so in the plate's column flex its `×N` counts had been
  stacking under the die and plates came out different heights.
- **Feedback lights the WELL, never the inset button** — the stage-pulse
  joined the hover rule here (Joe: "a weird highlight glitch when first
  adding a saved pool — the highlight lines have a weird margin"): a
  border drawn on the button traced a rectangle floating inside the tray.
- **Cut the day it shipped:** a one-line "Tap a die above, or a saved pool
  below" invitation in the empty deck. It answered a real question Joe
  raised (what orients a newcomer here?) but he judged it "aesthetically
  distracting… I'll find another way to hint that later." The empty deck
  stays empty; **orientation is an open question, not this element.**

#### 7.14.2 The ± popover has more than one door (2026-08-04)

*(Joe: "that panel can only be closed with the ✕, there is no apply and no
support for clicking outside the panel to close it. Also the tray is
mis-colored when the panel is open.")*

- **Done, not Apply.** The Trigger Pass made this a pure editor whose
  edits are already live in the thing they edit — there is nothing pending
  to apply, and an *Apply* button would lie about that. `#pop-done` is the
  **dismissal**, standing on every source, so `pop-actions-2nd` no longer
  hides wholesale for the tray.
- **Click-away closes it.** Leaving *is* committing, which is the only
  reason this was ever missing. Excluded from the away-handler: the
  popover, its floating `.set-menu` (a body-level child, not a DOM
  descendant), the `#tray-mods` anchor (without it a ± click would close
  on `pointerdown` and re-open on `click`, so the toggle could never
  close), and `#peek-card` for a shelf-bound popover.
- **The tray's lit state is a RING, not a repaint.** `.open` had replaced
  the well's whole gradient with a flat translucent wash — the
  mis-coloring Joe saw. It now adds a gold ring over the pocket's own
  dress.
- **D2, a third time.** With the actions row standing on every source, the
  per-source verbs needed a REAL hide: no bare `.hidden` rule exists in
  this codebase, so `#pop-variant.hidden` was inert and the tray's ±
  offered a live-looking *Save as pool…* beside Done. *(Joe: "the 'save as
  pool' on the tweak on the roll tray is confusing. Only offer 'done' in
  that context.")* `#mods-popover .pop-actions .btn.hidden` closes it —
  and the e2e now asserts these **computed**, never by class.

### 7.15 Reroll speaks its name (shipped 2026-08-03)

Stage B of Joe's play notes: one clear affordance per collected roll, the
reroll verb named everywhere it fires, and history that tells rolls and
rerolls apart — server-substantiated.

~~**The one-✕ rule (Joe's decision: keep the big red one).** A collected
roll has exactly ONE reachable clear affordance, **chosen by the gesture
that opened the card**:~~ **Retired by §7.11b** (same day, and completed by
§7.21): the ✕-over-the-dice sweep dress is gone, and with it the whole
gesture-tracked machinery below. The marker only OPENS the card now — hover
peeks, click pins, in every modality — and the card clears, leading its fold
with the named `✕ Clear` §7.21 gave all three result surfaces. One removal
grammar on banner and peek alike; nothing branches on how the card was
opened. `peekVia` and `sweepUnavailable` are gone from `js/main.js`, which
records the retirement at the declaration of `peekRollId`, and
`hasClear: !!peekEl.querySelector('.pk-clear')` survives in the debug hook as
a regression pin that must read false. **Nothing below this line describes
the build.**

- ~~Peek opened by hover (or a pin) → the marker's sweep dress — the whole
  76px circle with the 30px salmon ✕ promise — is the clear target; the
  card builds **no ✕ row at all** (not a hidden node: a vestigial node
  invites "fixing").~~
- ~~Peek opened by tap → there is no hover to dress the circle, so the
  card's base ✕ **is** the big red one. This is why `.pk-clear` could not
  simply be deleted: the sweep is `display:none` on coarse pointers *and*
  the marker's click handler branches on the recorded pointer type (a tap
  toggles the peek instead of clearing), so on touch — hybrid laptops
  included, where the coarse media query can be false — the card ✕ is the
  only clear path. The coarse `display:none` on the sweep is load-bearing
  as the rule's complement.~~
- ~~**Exactly one, never zero** (amended 2026-08-03, adversarial pass): the
  gesture alone cannot decide, because not every open on a touch device
  is a tap. A long-press fires `contextmenu` → `openShelfPopover` →
  `openPeek` with the default `'hover'`, and on a coarse pointer that
  card had *no sweep and no ✕* — a collected roll nobody could tidy. So
  the card also keeps its ✕ wherever the sweep cannot be dressed, read
  live from the same media query that hides it (`sweepUnavailable`). The
  complement is now enforced in code, not merely relied upon in prose.~~

~~Mechanism: `peekVia` ('hover' | 'tap') rides `openPeek`; only the
marker's touch branch passes 'tap', and a mouse `pointerenter` over an
already-tap-opened card never steals its ✕ mid-interaction (the gesture
is taken only on an actual open). The banner ✕ stays unconditional — an
uncollected roll has no marker to sweep — and the verdict ✕ is untouched
*(later retired with the card's Done — §7.16's flow to collected; the
card BODY is its clear affordance now)*. Keyboard users clear as before
(Esc's sweep, the log/corner paths): no regression, no new path this pass.~~

*Kept struck rather than deleted because the reasoning is still worth having:
the rule was right about the hazard — two targets for one verb — and wrong
about the fix, which turned out to be one target that does not depend on the
pointer at all. The rest of §7.15 (the cue vocabulary, `rerollOfId`, the log's
qualifiers) is unaffected and still binds.*

**The reroll cue vocabulary.** `buildRollCue` draws from a CLOSED set —
`ROLL` for fresh pools (the draft cluster, an offer's claim strip),
`REROLL` for replays (the one result-card strip that serves both the
banner and the peek) — built as nodes, never innerHTML: a varying word
behind innerHTML is how user text eventually gets there. Titles follow
("Reroll these dice", the log/verdict ⟳ "Reroll this", aria
"Reroll — <label>"). **Register rule:** "reroll" the *action* is always
the bare verb with the dice as object; "reroll" the *mechanic* (`ro<=N`,
"Reroll low") is always qualified. Never unify them.

**History provenance (`rerollOfId`).** Every reroll trigger sends one
shared payload (`rerollOpts`) that stamps the parent's rollId as a CLAIM;
the server is the only party that can substantiate one, and it does so
**at birth, never at projection**:

> A reroll records its parent only when the parent exists for the whole
> table — enforced in `handleRoll` via `entryExistsForAll` (the
> whole-room form of `entryExistsFor`, roller exemption removed). A
> reroll of a *secret* roll is recorded as a plain roll — no marker, not
> even for its own roller: the payload is broadcast, and a broadcast has
> no single asker.

Malformed claims 400 (`bad_reroll_of`); unsubstantiated ones are dropped
while the dice still roll (a status split would rebuild the existence
oracle the reveal path's 404 already refuses to be). The field is read in
`handleRoll` only — offers/claims are fresh rolls and their parser never
sees the key. It rides the ROLL, not `roll.spec` (spec is what
reroll-last replays; an inherited id would claim the same ancestor
forever): provenance points **one hop up**, never a chain root. The
redacted projection keeps it unconditionally — by the birth gate it only
ever names a whole-room-visible parent, so "she rerolled that check, face
down" is a public stake (goal 11), never a value. Solo substantiates the
same claim against the local log.

**The log says so.** At most one quiet small-caps qualifier per row —
`reroll` (bordered chip + an inset-shadow lane: zero layout cost, history
never reflows) or `rerolled` on the superseded parent, derived one-pass
from what this client holds (leak-free by construction). Content, so it
stands (the tier rule binds controls); muted, never gold — gold belongs
to the roll verb alone. The tooltip resolves the parent only through the
client-side hidden gate: non-secret ≠ readable, so a held/whispered
parent never surrenders its total to a tooltip, and an aged-out parent
keeps the generic "Reroll of an earlier roll". The banner and verdict
card stay unmarked (§7.10 fixed geometry; their *action* already says
REROLL — the record is the log's job).

### 7.16 The audit fix pass, the flow to collected, and the one-way rim
(2026-08-04)

The Soul Deal audit's 33 findings (ROADMAP §2i) shipped as six passes,
and Joe's same-day play notes added two more contracts on top. The laws,
as built:

**THE LEDGER (2i-A).** A sourced per-die read shares ONE label column:
`renderOutcomeRows` renders a grid (`oc-ledger`) — right-aligned label
spine, left-aligned dice cells, the block centered as a unit — and each
row's chips live in their own `.oc-cell`, so a wrapped chip wraps inside
its pool's cell (the hanging indent is structural; an answer can never
float unattributed). The evidence/word gap lives in LAYOUT (`.oc-chip`
gap) while the string keeps its real space for copy — the nbsp lesson's
sibling. Quiet grammar, exactly once: a quiet die beside worded ones
carries a DOM dash (`d6 3 —` — copy reads the silence); an all-quiet
pool says `quiet` once (styled as absence, never outcome weight) and its
chips stay bare — dash + word would mark one silence twice. One-die
rolls read at hero scale (`oc-solo` — the common Soul Deal roll finally
has dnd's 52px counterpart). Tier rides the chip border at reduced
strength (the felt chips' lesson; the word stays the loud channel). The
banner and peek headers demote to quiet identity captions — the rows are
the data — and the peek's identity WRAPS instead of truncating (the
hover is worth taking, 2i-E). The empty verdict ring FOLDS under a
per-die read; a hidden roll keeps it as the face-down stage.

**Ceremony cards (2i-B).** The intent card declares its POOLS —
`spec.sources` rides `canonicalNotation`, so the stake reads
`2d8[Wisdom]+1d10[Sword]`, never bare dice math. The verdict card's
chips keep the lowercase mono evidence identity (the hero dress's
uppercase stops at the rows), and its action row rests DIM — the
invisible→visible grammar is fully retired.

**Action grammar (2i-C).** ONE DRESS PER VERB sized by surface · THREE
VISIBILITY STATES with three CODES (disabled drains hue via grayscale;
resting-dim is 0.45; absent is a real display:none) · HUE = ACT globally
— gold rolls (the log's per-row ⟳ keeps gold as the written-down density
exemption: reroll IS a roll act), red destroys (✕ Clear table included —
it hovered GOLD before), steel tools (the hover law unscoped past the
panel edge; confirm borders went ivory as their comment always claimed).
Reveal wears ONE dress: confirm weight — bold ivory, "decisive, not
royal" — `.reveal-verb` full, `.sm-reveal` small. The fold's verbs come
from ONE builder (`appendCardActions`) on banner, peek AND the ceremony
card. The draft's ✕ removers anchor INSIDE their chip's corner, never
the gutter between neighbours.
*(Amended 2026-08-07, §7.21: a fourth law — **HIERARCHY IS AREA, NOT
VOLUME**, the primary act takes the free width and a primary may never win
by being redder — and the rest-dim rule now reads "0.45 covers SECONDARY
verbs; the primary act of a surface stands at full opacity.")*

**Material (2i-D, Scheme C).** Keep graphite/bronze; the steel got a
BODY — gradient, top bevel, seat shadow on palette tiles, pool tiles and
the rim. The column's muted tier re-tokened COOL (`--muted: #99a1a9`
inside `#left-panel`); the tray re-warms its own token — the bronze well
is the one warm surface on purpose.

**The spent draft (2i-E).** A rolled draft SURVIVES (Enter-again is the
deliberate repeat — never auto-cleared) but visibly COOLS until its next
edit: heat drains, dice rest dimmer, the cue falls to its whisper, the
title says "again — this draft already rolled". Any edit re-warms it.
This separates "roll it again" from the silent Wisdom-×4 accretion, and
disambiguates the tray's ROLL from the banner's REROLL standing lit
together. `no-newcomer-path` stays open by design — Joe owns the
orientation direction (§7.14.1).

**Labs (2i-F).** `chrome-lab.html` is lab.html's 2D counterpart — the
REAL app in an iframe, posed through `__diceDebug`: real CSS, real
hovers, zero forked markup, cannot rot. `tools/contact-sheet.mjs`
stitches captioned thumbnail grids per out/ directory. docs/mockups are
marked ROTTED in a README and per-file banners — design history, never
build authority; the static-mockup shape is disqualified in writing.

**THE FLOW TO COLLECTED (Joe: "cinematics have too many stages").** The
ceremony verdict card is a FOLDED CARD — body = the role-split clear
target wearing the banner's exact removal grammar (red for the roller's
clear-for-everyone, slate for a spectator's local dismiss; a click while
the moment still plays SKIPS first — completing the beat and clearing
the roll are never one gesture), fold = the built REROLL ❯❯❯ / Reveal —
and when its clock (`CEREMONY_DISMISS_MS`, hover holds it) runs out the
roll goes STRAIGHT to the shelf. The banner stage between card and shelf
is gone; `#verdict-done`, `#verdict-x` and `.ghost-btn` retired. A
HIDDEN card never flows — it stands until its reveal re-arms the clock
(the tidy-away tension rule, inherited). Applies to check and cinematic
alike: they share the one card family.

**THE ONE-WAY RIM (Joe: "one way to do most things").** The rim is
**± Modify · Offer ▾ · ✕ Clear**. Save and its inline morph retired:
keeping a draft is pool editing's job — the ✎ ghost tiles mint
(shelf-at-birth), the popover's *Duplicate…* copies, the peek's *Save as
pool…* keeps a rolled result; saved-pool writes stay exclusively by-id.
The modifier tool wears its word at rim scale — "Modify", never "Tweak"
(unsurprising over cute), bronze dress unchanged (it belongs to the roll
world; gold stays the roll act's). The tray popover's standing title
reads *Draft* — the vocabulary word.

### 7.17 The panel anatomy — the quiet nameplate and the region head
(2026-08-04)

Joe: the panel's four regions — the table & its people · the dice · the
roll tray · the pools — "feel under defined… make this organization a
bit more explicit, unobtrusively. It's okay to use text. You make the
call." Designed by a four-entrant judged panel (typographic · structural
· identity-first · minimal, three adversarial lenses each); the shipped
synthesis grafts the survivors of all four:

**THE QUIET NAMEPLATE.** The table is NAMEABLE: a room-wide `tableName`
setting rides the settings channel beside felt/system (SETTING_SPECS,
normalized like every user string, ≤28, `''` = unnamed), edited from
Settings → *Everyone at the table* → "Table name" (management stands
behind its gate — P6). The rail renders it at the RIGHT edge of row one
— the mirror of YOU top-left, so the row reads "these people, at this
table" — falling back to the `?room=` key when someone chose one (a
non-default key IS a chosen name, and surfacing it teaches the URL as
the save-file grammar — goal 7), and to NOTHING otherwise: **an unnamed
table wears no placeholder** (every judge killed the standing
`TABLE`/`SOLO` fallback as the same species as the deleted 'Pools'
title). The plate is CONTENT, not chrome: display face, as-typed case
(labels are uppercase; identity is not), ambient muted, non-interactive
(the invite link keeps its one home in the identity menu), ellipsized at
~118px with the room key in its tooltip, hidden collapsed. The name also
rides `document.title` ("Friday Crew — Dice Table") — the cheapest
identity surface in the app. The ORDER contract holds: the you-chip
keeps its corner; past four players the plate wraps below exactly like
the status pill always has.

**THE REGION HEAD.** ~~`SAVED POOLS` stands over the rack — the one region
a newcomer genuinely misreads, because its steel tiles wear the dice
palette's exact grammar two regions up.~~ **Retired 2026-08-08 by §7.23's
section bar** (Joe, same day: *"instead of SAVED POOLS let's just say POOLS.
Or drop the group name? …we don't name the DICE UI region"*). The head was
stood up to kill one confusion, and the bar kills it better: the pressed
`Pools` cell stands directly above the region and names it, in the same
breath as the two cells beside it. A second name for one region is exactly
the redundant standing chrome §7.9 kills, and no other section carries one.
`#pools-head:not(.foreign) { display: none }` is the whole change.

**What survives is the job the bar cannot do.** On a teammate's rack the same
element swaps to their identity and surfaces the read-only tag, so ownership
can never scroll away — so the head now renders in the **foreign state only**.
Same 10px ambient tier as the category heads; the RANK difference is
structural, not typographic: a hairline runs from the word to the panel edge
(region rank), category heads carry none (shelf rank). ~~Head at entry +
'✎ Edit pools' at exit bracket the region.~~ Only '✎ Edit pools' brackets your
own rack now; the section bar is the other end. ~~Not sticky~~ — it is sticky,
because the state it survives into is the one where ownership must not scroll
away (`#pools-head.foreign` pins at `--draft-h` and the category heads yield
theirs). ~~Browsing a teammate HIDES it — the standing `ALICE'S POOLS ·
read-only` banner is that state's region head: one head per state, never
two.~~ Inverted the same day by the teammate-pill consolidation later in this
section: the separate banner was retired and this head became that state's
head — browsing a teammate is now the only thing that SHOWS it.
*This deliberately supersedes §7.9's "There is no 'Pools' title row" FOR
THE REGION under Joe's explicit 2026-08-04 ask — the COLUMN still has no
title, and what died in §7.9 (a name floating over the whole panel)
stays dead.* *(And it is now largely back: with the head foreign-only, your
own rack again carries no standing word of its own. That is the intended end
state, not drift — the bar names it.)*

**A LIVE DEFECT the deletion left behind** *(recorded 2026-08-08; do not fix
it here — it needs a code change, and its assertion needs one too)*. The
dice-value ledger (§7.18, §2l ③) has two figures: a per-shelf `.psh-fig` on
each category head, and a whole-rack `.ph-fig` that rides the region head's
slack. `renderGroups` builds the rack figure only when `!foreign && poolsEdit`
— and `#pools-head:not(.foreign)` is `display:none`, so **the state that
builds it is exactly the state that hides it. The whole-rack `dice value`
caption has never rendered since the head went foreign-only**, and the word
`dice value` lived only there — so the shelf figures are now bare integers
with no standing unit, carrying `DICE_VALUE_LEGEND` on `title` alone, which
touch never gets. The `✎`
gate's own contract in §7.18 says the figures are *"built in manage mode only,
not built-and-hidden"*, for a stated reason: a CSS-hidden figure still
concatenates into `textContent`. That is precisely what happened here, and it
is why **the `rack-dice-value` scenario still passes** — it reads the
`textContent` of a `display:none` node, which reads fine. §2l's build-not-hide
lesson, inverted by a CSS rule written three sections later. The fix is a code
change plus an assertion that pins computed display (§7.21's lesson: *a
visibility contract is about what the eye gets*); ROADMAP U4's entry names the
assertion, and neither is in this doc pass. This paragraph is the pointer.

***FIXED 2026-08-08 (ROADMAP C9).*** The head now has a **fourth** reason to
stand: `.ledgered`, set whenever the figure is built, joins `.foreign` and
`.profiled` in the `:not()` chain. §11's `.profiled` had already made the
head appear for anyone holding more than one profile — which quietly narrowed
the bug rather than fixing it, and left it aimed squarely at the player
building their FIRST character, i.e. exactly when the number matters. The
scenario is re-pointed at computed display, per the lesson above.*

**THE REFUSALS (as load-bearing as the additions).** The dice region
gets nothing: the pressed *Dice* segment already names it and eight
tiles reading d4–d100 self-label (a DICE caption would kill no
confusion). The tray gets nothing: the one warm bronze surface in a cool
column is the strongest structural signal in the panel, and §7.14.1's
cut hint stands. The judged panel's rule survives as doctrine: **every
standing word must name the confusion it kills.**

**THE TEAMMATE PILL, functional (2026-08-04 same day, the completeness
critic's follow-up).** Every teammate used to render TWICE — an inert
`.roster-name` span in the rail, and a clickable `.owner-chip` inside
`buildPoolsSwitcher` above the shelves — same person, two visual
grammars, only one carried the browse verb. Consolidated: the RAIL PILL
is the one per-player surface. Click Alice → browse Alice's pools;
press her pill again → back home (press-again-to-close, matching
`#edge-toggle`, `#log-flyout`). The pill wears the shared
`aria-pressed` steel dress the panel's `.seg` controls already use
(HUE = ACT — no gold, gold stays the roll act's), disables in manage
mode (P2: browsing is a USE verb, cannot silently discard an editor —
mirrors the retired owner-chip's gate). `buildPoolsSwitcher` and
`.pools-owner-banner` retired; the head+rail bracket the identity —
head names the state, pill toggles it.

**THE HEAD, one dress, two states.** The same `#pools-head` element
that reads `SAVED POOLS` on your rack reads `ALICE'S POOLS · READ-ONLY`
in foreign state (`.foreign` class swaps the word and shows the
`.ph-tag`). And it JOINS THE STICKY STACK in foreign state — the
completeness critic caught scrolled foreign racks looking pixel-
identical to yours, because the retired banner wasn't sticky. Fixed by
the same swap: category shelf heads yield sticky in foreign
(`#groups-list.foreign .pool-sec-head { position: static }`), so
ownership > category naming when browsing a teammate. One sticky pin
per state, mid-scroll ownership never vanishes.

`ROSTER_MAX` raised 4 → 6 (pills are functional now; real table sizes
are ≤6 for Soul Deal / D&D). Overflow past 6 folds into `+N` as
before, inert — a rare edge case, documented in ROADMAP §2k.

**THE IDENTITY CHIP JOINS THE GRAMMAR (Joe 2026-08-04 same day).** The
rail became a "whose pools" segmented control when the teammate pill
grew the browse verb — the identity chip joins it: **left-click is the
toggle** (falls home from a foreign rack; no-op when already home, and
the chip is `aria-pressed` to say so), **right-click / long-press
opens the identity menu** (rename · leave & switch · invite —
following the tile popover's right-click-for-context pattern already
established for the rack). At any moment exactly ONE chip in the rail
is pressed: yours (default) or the teammate you're browsing.

The chip's own dress: `aria-pressed="true"` at home is the default
`.btn.ghost` look; `aria-pressed="false"` dims it a touch — subtle,
because the chip is the corner anchor and never moves; only its state
signal changes. This deliberately supersedes the pre-2026-08-04
left-click-opens-menu wiring — the menu still exists at the same
coordinates, only its entry gesture changed. Solo users access
rename/leave/invite via right-click (mouse) or long-press (touch);
the chip's tooltip teaches the new gesture explicitly.

### 7.18 Manage-and-measure — what the ✎ gate now covers (2026-08-06)

§7.9 framed `✎` narrowly, as **the destructive gate**: the place row
delete, rename and reorder live, kept behind a toggle so the resting
rack is quiet and nothing dangerous is one mis-tap away. Two later
passes widened what stands behind it, and this section is the record so
the gate does not keep widening by accident.

**§2l made it manage-AND-MEASURE.** The dice-value ledger — the summed
`DIE_MAX` of the dice a shelf is guaranteed to put on the felt — renders
only while the toggle is on (Joe's own constraint: *"I don't need to see
this all the time… maybe only when editing the saved pools?"*). The
figures are **built in manage mode only, not built-and-hidden**: nine
existing assertions read `.pool-sec-head`'s textContent across four
scenarios, and `display:none` still concatenates, so a CSS-hidden figure
would break all nine while a not-built one breaks the two that read it
with manage mode on. That is a behavioural contract, not an
implementation detail.

**§G3 made it manage-and-measure-SOMEONE-ELSE'S.** The prepared-table
pass (PROFILES.md §4) lets an organizer load a profile from a table file
into their own rack, so the editor, the ± popover, the spectrum bars and
the ledger all read it **unmodified** — the alternative, parameterizing
every management surface off `poolsOwner`, was rejected as a wide blast
radius to save one click. The consequence for this gate: while a profile
is loaded, `✎` is editing a *character*, not a *rack*, and the surface
must say so. It does, in three places at once:

- **the banner** (§7.19) is sticky above the pools head for exactly as
  long as the swap is live, wearing the toolbar's editing dress;
- **the category heads yield their sticky pin** to it —
  `#groups-list.profile-editing` makes the same call `#pools-head.foreign`
  already makes, for the same reason: ownership is the one thing that
  must not scroll away;
- **publishing goes silent** — `publishPools()` no-ops while a profile is
  loaded, because publishing means *here is my rack* and pushing Rill's
  pools under Alice's name would lie to every teammate's owner switcher.

**The gate's boundary, restated.** `✎` covers: destructive row edits ·
the point-budget read · profile authoring. It does **not** cover
anything a player does at rest, and the ledger's own rule still holds —
a foreign rack browsed through the owner switcher never shows a figure,
because manage mode forces `poolsOwner = null`.

### 7.19 The prepared table — the file, the profiles, the seat
(2026-08-06, shipped)

Tier G. Design authority is [PROFILES.md](PROFILES.md); this section
specifies the surfaces. The governing sentence is **the file is the
truth, the room is a convenience, the link is an address** — every
component below is one of those three and behaves accordingly.

**THE FILE DOOR** (§G1) finishes *Your data*. `Download` writes a fresh
`portableSnapshot()` — not the textarea's scratch text, which may hold a
half-edited import — as `<slug>-YYYY-MM-DD.dice.yaml`, slug from the
table name, else the `?room=` key, else `dice-table`. `Open file…`
triggers a hidden `<input type="file">`, reads it with `File.text()`, and
**only fills the textarea and re-previews**. There is deliberately no
second import path: preview-then-apply is the safety contract, and a
file must not be a way around it. Oversize (>512 KB) refuses by name and
size *and disarms Apply*, so a refusal never leaves a stale plan armed.

**THE TABLE FILE** (§G2) adds `table:` and `players:` to the portable
format, both present-or-absent. A player block nests `pools:` rather
than putting shelves at the name's depth, because a shelf may legally be
named `set` or `pools`; nesting puts the reserved keys where a shelf can
never appear and makes the inner block the same grammar as the
top-level one. Profile names take the `#` ban (a profile name becomes a
display name, and display names are whisper addresses); `tableName` does
not (table names are never whisper-addressed) — the asymmetry the server
already had. Unknown top-level *sections* skip and warn so the format can
grow; a line that is not section-shaped still refuses, and a known
section's contents stay strict.

**THE PROFILE LIST AND THE BANNER** (§G3) are the authoring surface, and
their whole design is guardrails — see §7.18 for what the gate now means
and PROFILES.md §4 for why authoring is a rack swap rather than a second
editor. The one rule worth repeating here: **the operator's own rack is
stashed, and the stash write is read back and verified before `groups`
moves.** If storage cannot be trusted, the swap refuses rather than
proceeding — losing your own pools to a click is the failure this design
exists to prevent, and it is the `#g=` codec's failure wearing a
friendlier hat.

**THE SEAT** (§G5) is CUJ2: one link in Discord, six people, each landing
at the right table under their own name with their own pools. A prepared
seat is *offered*, never imposed — choosing one takes the name and then
shows the same `✓ 8 new · …` preview every other import shows, applied
only on an explicit click. `&as=Name` pre-selects a seat and nothing
more: it never auto-joins and never auto-applies, and an `as=` naming no
profile is ignored silently so a stale link cannot break a join. One
link for everyone stays the primary form — `inviteUrl()` is unchanged.

### 7.20 The lobby, the empty seat, and the way to a table
(2026-08-07, design — ROADMAP §3b)

Roadmap authority is [ROADMAP.md](ROADMAP.md) §3b, which holds the CUJs
and the three rulings; this section specifies the surfaces. The
governing sentence: **the rail's first row already asks "who is here" —
so when the answer is "nobody yet", that row carries the fix.**

**WHY `solo` IS DELETED RATHER THAN REWORDED.** `setPill('solo','solo')`
(main.js:11301) fails four ways, each disqualifying alone.

1. *Wrong object.* `#status-pill` is a `<span>` — unclickable,
   unfocusable, not in the tab order. It can only ever be a readout, and
   getting to a table is now a common action, which GOALS' keyboard-paths
   line covers.
2. *Wrong channel.* The pill is a SHARED TRANSIENT. `showSettingsNote`
   borrows it on a 3 s timer (main.js:8940) and releases it under an
   explicit *"a status change may have taken the pill"* guard;
   `reconnecting…` and the refusal message are its other writers. All of
   them resolve. `solo` never does — and since nothing restores it, one
   settings note silently destroys the indicator for the rest of the
   session. Latent today (a solo table receives no settings events), and
   live the moment the same trick is tried at a table with a teammate in
   it.
3. *Wrong proposition.* "solo" diagnoses the PLAYER. The player's
   questions are about the ROOM: how do I get someone in here, and how do
   I get to my friends' table.
4. *It flattens two opposite states into one word.* This is the real
   defect. "There is no table" and "there is a table and nobody else has
   arrived yet" have different exits, and today both read `solo`.

**THE THREE PRESENCE STATES.** The rail's first row has exactly three,
and `renderPlayers()` becomes the renderer of all three — today it runs
only in `initNet()`'s online branch (main.js:11289), so the lobby branch
must call it too:

- **L — the lobby.** No `?room=`. You are not at a table.
- **A — the empty table.** A room with nobody else in it. CUJ2's waiting
  room, and the most important moment in the whole flow.
- **T — the table.** Roster pills, exactly as they ship today. **No new
  chrome at all**: every affordance below exists only while the roster is
  empty, and each is retired by its own success.

**FIRST, THE RULE THIS MUST SURVIVE.** *Empty renders nothing* is this
app's established law and it has been enforced with deletions: the
draft well's one-line `Tap a die above…` was killed the day it shipped
(Joe 2026-08-04, "aesthetically distracting", css:439-442) and
`#groups-empty` went the same way. Any lobby design that answers
emptiness with a **sentence** is already dead on that precedent. But the
exceptions the tree kept are exact about *what* survives: the dashed
`＋` ghost tiles, which the source defends as **"an affordance, not
prose"**. That is the seam this design goes through — everything below
is a button that performs the exit, never a line of text describing the
situation.

**THE EMPTY SEAT (state A).** The roster's grammar is one [dot][name]
pill per person, and `#rail-roster` is `:empty { display: none }`
(css:1729) — with no children the row between your chip and the
nameplate is ~165 px of nothing, in a `flex-wrap: wrap` row. The empty
state fills it with a pill at exactly `.roster-name`'s geometry
(999 px, `padding: 4px 10px`, 12 px) wearing the app's existing **ghost
dress** instead of the solid one — `border: 1px dashed var(--hair);
background: none; color: var(--muted)`, promoting to `var(--ivory)` on
hover, the same recipe as `.ghost-add` and `.pt-toggle`. A dashed pill
where a solid person-pill goes reads as **a chair nobody is sitting in**,
in the row that already means "these people, at this table". It spends no
word on being alone, it is the same visual language as `＋ New shelf…`,
and it is replaced by the very person it asks for. Its label is the verb
— `Invite`.

Tapping it copies the invite link, reusing `idm-invite`'s path and its
**exact feedback grammar** (js:10581): in-place label swap to `Copied!`,
900 ms, restore — with the `window.prompt(…)` fallback when the
clipboard refuses, so the link is never unreachable. On a device with
`navigator.share` it opens the share sheet instead, because a phone
hand-off is literally CUJ2's *"somehow get all the players to join"*. It
**never borrows the status pill** — that channel is transient-only,
which is the whole finding above.

**PREPARED SEATS TURN THIS INTO THE WHOLE OF CUJ2.** A table set up
through Tier G knows its seats: `roomSetup.profiles` is live client-side
(main.js:11142) and `players` is the live roster, so the UNCLAIMED seats
are a client-side difference of the two — no endpoint, no wire key, no
new state. Render one outlined pill per unclaimed seat wearing that
seat's name — `Bo`, `Ada`, `Kit` — and tapping one copies THAT seat's
link, which is `&as=Name` and already ships (main.js:10969). The
organizer who prepared six seats sees six empty chairs and taps each for
six personalized links; **as players arrive, the outlines fill in one by
one** and the row becomes a live read of who is still missing.

**The chairs therefore stand while the SEATS are empty, not while the ROW
is** — they retire one at a time, at the grain of a seat rather than the
row, which is the same retired-by-its-own-success property the `Invite`
pill has. *(Shipped 2026-08-07 with a row-level `!others.length` gate by
mistake, which made the paragraph above impossible: the first arrival
took every remaining chair off the wall. Caught by driving a three-seat
prepared table in a browser and corrected the same day — the sentence was
right and the gate was wrong.)* Chairs take whatever room the real people
leave (`ROSTER_MAX` 6, then `+N`), so one grammar governs the row whether
the pills are people or vacancies.

The generic `Invite` pill keeps the row-level rule, because an unprepared
table has nothing to enumerate and a permanent Invite would be exactly
the standing chrome §7.9 kills. §7.19's "one link for everyone stays the
primary form" is unchanged: `Invite` is what an unprepared table shows,
and the per-seat pills are the shortcut §7.19 already describes, finally
given a surface.

**THE LOBBY ROW (state L)** carries the two exits in the same slot:

- `+ New table` — name it, land in it (§3b L1).
- `Tables ▾` — the recents menu (§3b L3), most recent first, each row
  with a forget. **Absent entirely when there are no recents**, so a
  first-ever visitor sees exactly one affordance and no dead control.

**The lobby is the switchboard; tables do not link to each other.** From
a table you leave to the lobby and choose from there — one path, not a
web of cross-links. §3b L4's sub-tables are the single deliberate
exception (a child carries a parent pointer), and being the only
exception is what keeps it legible.

*Recorded as considered and not done:* a dedicated `Back to <name>` pill
for the most recent table. It is a third standing pill to save one tap
inside a menu whose top row is already that table.

**WHAT THE LOBBY DOES NOT GET.** No splash, no landing page, no modal,
no name prompt. CUJ1 (*"I just need to do a dice roll NOW"*) is answered
by **removing** the join prompt, not by adding a welcome — the felt and
the pools panel paint live and the first tap rolls. Solo rolls already
carry `playerName: null` and every render path guards it, so the lobby
needs no name at all; the identity chip reads `You` until you set one.
And nothing goes on the felt: zero tabletop overlays (§7.9) is not
relaxed for the lobby.

**TELLING L FROM A — AND THE PHANTOM NAME THAT BREAKS IT.** The
nameplate is meant to be the tell: state A always shows something at the
row's right edge (a hand-edited `?room=key` means someone CHOSE a key,
so the documented `?room=` fallback fires), while the lobby shows
nothing. **Today that is false.** `renderTableName()` reads
`roomSettings.tableName` (main.js:8502), which the solo branch restores
from `LS_ROOMSETTINGS` (main.js:11302) — so a lobby inherits the table
name of whatever table this browser last configured, renders it on the
plate, and **puts it in the tab title** (main.js:8506). The tooltip
compounds it: `'this table, solo'` (main.js:8504), asserting a table
while there is none. A lobby must therefore **clear the table identity,
not merely decline to draw it** — `tableName` is room state and has no
business surviving into a roomless session. Same defect, same fix, in
`portableFilename()` (main.js:9127): the `ROOM !== 'table'` half already
yields nothing in the lobby, but the `roomSettings.tableName` half will
happily name your download after a table you are not at.

**WHAT THE LOBBY MUST SUPPRESS — the governing rule.** The audit found
**no crash and no unguarded `net.` dereference**: every one of ~40 sites
is properly gated. The lobby's problem is **not safety, it is honesty** —
a page that still looks and talks like a table. One rule settles every
case: **a surface that speaks about YOU keeps working; a surface that
speaks about THE TABLE must be absent — never disabled, never silently
downgraded to local.** Applied:

- **The "Everyone at the table" settings section** (index.html:837) is
  the worst offender: all four controls have working local branches, so
  in the lobby felt, system, zoom and table name **silently become
  personal** with no UI change, under a heading that is a lie and
  tooltips that state falsehoods ("everyone at the table sees this",
  main.js:8635). The fix is not new controls — felt, system and zoom are
  yours either way — so in the lobby the section is **relabelled *This
  table*** and Table name, which has no roomless meaning, is absent.
  *(Amended 2026-08-07 during the build. The first ruling was to drop the
  heading entirely and let the controls fall under "Just you"; built, that
  left them in a heading-less block reading as a continuation of the
  section ABOVE — "Your data" — which is worse than the lie it replaced.
  "This table" is truthful with no table joined: goal 9 calls the
  serverless experience "a fully working solo table". Moving the nodes
  between sections was the alternative, and is not worth the DOM churn.)*
  The dice-set row's sub and the picker's own tooltip drop their audience
  clause in the lobby for the same reason the felt and system ones do.
- **`Apply to table`** (index.html:812) is a standing, enabled button
  whose only possible lobby outcome is the refusal at main.js:9467. It
  is the one room-scoped intruder in an otherwise roomless *Your data*
  section, and it goes.
- **`inviteUrl()`** (main.js:10379) interpolates `ROOM` unconditionally,
  so in a lobby it **fabricates a working link to the shared room named
  `table`** — the single most misleading affordance in the app, and
  precisely the defect L0 exists to kill.
- **Reveal.** `canReveal()` returns true when offline (main.js:2385, "the
  only player is the authority"), so every held roll in the lobby offers
  a Reveal that reveals to nobody. Correct for solo-at-a-table; theatre
  in a lobby.
- **The whisper picker leaks a table into a roomless page.** A saved pool
  spelled `w:Ann` or `held` seats `pop.vis.mode` from its own notation,
  so the solo note at main.js:7818 is skipped and the sub line prints
  *"others see you rolled, not what"* — and `renderPopAudience()` prints
  **"no one else is at the table yet"** (main.js:7752) while silently
  emptying the pool's audience (`pop.vis.names = []`, main.js:7761).
  **This is a live bug today, not a lobby regression** — it needs fixing
  either way, and the lobby makes it unmissable.
- **Voice.** `offerNeedsTable()` says *"offers need a table — you are
  playing solo"* (main.js:5764). In the lobby you are not solo as a
  fallback; you chose no table. The refusal names the exit instead.

**STORAGE IS ROOM-SHAPED AND THE LOBBY IS NOT.** `LS_TABLE` is
`dice.table.v1:${ROOM}` (main.js:10132), so a lobby that keeps
`ROOM = 'table'` would read and write the prepared-table record of the
real shared room named `table`. `LS_LOG` (`dice.log.v1`, main.js:64) is
not room-scoped at all, so a lobby log and a solo-fallback-in-a-room log
share one drawer. Both want a decision at build time; neither is
load-bearing for the shape above, and both are recorded here so the
build does not discover them late.

**THE IDENTITY MENU** gains a lobby shape. `idm-room` already reads
`solo — no table joined` (main.js:10421) and becomes `not at a table —
your rolls stay on this device`: P1's "detail on intent" is where the
privacy read belongs, rather than standing on screen. **Its condition is
wrong, though** — it branches on `info.online`, not on *has a room*, so
a lobby with a healthy server reachable would print `room: table`. The
whole menu keys off the same mistake: `identityInfo()` returns
`room: ROOM` unconditionally (main.js:10384). `identityInfo()` gaining a
real "no room" value is the prerequisite for every line here.

`idm-invite` and `idm-leave` are **hidden** in the lobby, not greyed —
there is no link to copy and no seat to leave. `idm-leave` is a
collision to fix regardless: it reads `Leave & switch seat`
(index.html:300) but switches SEATS, so it becomes `Change seat…`,
freeing `Leave table` to be §3b L3's real verb (states A and T,
navigating to `/`).

**`Leave table` MUST NOT REUSE `leaveTable()`.** That function
(main.js:10536) drops the seat *and* `localStorage.removeItem(LS_NAME)`
(main.js:10548), then re-enters `initNet()` (main.js:10558) — so wiring
the new verb to it would **silently delete the player's display name**
and, in a lobby, loop straight back into the "Take a seat" modal with
nowhere to go. Leaving a table for the lobby drops the SEAT and keeps
the NAME; those are different things and the existing function conflates
them.

**THE PILL, RESTORED.** With `solo` gone, `#status-pill` is what its own
ordering comment always claimed: transient only — settings notes,
`reconnecting…`, refusals. Nothing permanent squats in the slot that
exists so an announcement can wrap below your name without moving it.

**THE BOOT PROMPT IS THE LAST THING IN THE WAY.** `initNet()` awaits
`promptName(peekTable(ROOM))` whenever `LS_NAME` is empty
(main.js:11259) — and `promptName` has **no cancel and no skip path**
(main.js:11195), so the promise resolves only when a seat is taken. That
modal is titled *Take a seat* and hints *"Pick a display name for the
table"* (index.html:889). A first-time visitor therefore meets a table
they did not ask for, before any dice. The lobby does not reach this
code at all: it neither prompts nor calls `peekTable`, which would
otherwise fire `GET /api/table?room=table` about a room the player is
not in.

**SEAMS** (each verified against the tree): `renderPlayers()` runs only
in `initNet()`'s online branch (main.js:11289) and must run in both ·
`#rail-roster` is `:empty { display: none }` (css:1729), so the row
returns to nothing the moment the affordance retires · **there is no
global `.hidden` utility** (css:2478) — every new hideable node needs its
own rule or `class="hidden"` styles nothing · a new `Tables ▾` menu owes
two touchpoints beyond itself: a rung in the single Esc chain
(main.js:10036) and an entry in `modalOpen` (main.js:10061) · it should
be built on `openSetMenuFor`'s machinery (main.js:8697 — the only one of
the app's three menus with keyboard nav, viewport clamping and
flip-above), which means **extracting `placeAnchored` — the same
extraction ROADMAP §2l slice ⑤ already owes**, so the two should land
together rather than fork · `ROOM` is a module-scope `const`
(main.js:10123) with no representable "no room" value, and every
transition here NAVIGATES rather than swapping in place (§3b L3) ·
`setPill(null)` only adds `hidden` without clearing the class, and the
`title` set on a refusal (main.js:10865) is never cleared — hygiene to
fix while the pill is being simplified · `.solo` never had a CSS rule at
all (css:1810-1835 defines only base, `.offline`, `.refused`), which is
its own small evidence that the state was never designed.

### 7.21 The named verb — a card's main act says its name (2026-08-07)

*Joe: "I still don't feel like the 'reveal' panel is quite right. Reroll is
a nice ability. I'd like to keep that. The 'x' on the main body is probably
too non-intuitive. I think we need that to remain the main action but find a
better UX."*

**Shipped.** Every result surface — the banner (§7.11b), the shelf peek
(§7.7.1) and the ceremony verdict card (§7.16) — now leads its fold with a
**named primary act**: a standing, worded control that takes the free width
of the row.

- **The words.** `✕ Clear` (the roller — for everyone, server-validated) ·
  `✕ Dismiss` (a spectator — locally; the dice stay) · `❯❯ Skip` (the
  ceremony card while its beat still plays). Each carries the §7.9 contract
  sentence as its `aria-label`; the glyph is `aria-hidden`, so the WORD is
  the accessible name. The peek's primary is always `✕ Clear` — tidying a
  collected roll is anyone's housekeeping (§7.7), the one deliberate
  asymmetry in the family.

- **HIERARCHY IS AREA, NOT VOLUME** — the fourth law of 2i-C. The primary is
  `flex: 1` and never rests dim; the secondaries are `flex: none` and keep
  their 0.45. **A primary may never win by being redder than its
  neighbours.** This amends 2i-C's rest-dim rule to read: *0.45 covers
  SECONDARY verbs; the primary act of a surface stands at full opacity.*

- **HUE = ACT survives intact.** Red destroys, so `Clear` is red and a
  spectator's `Dismiss` is slate — red on a local dismiss would lie about
  what the press does. Skipping is a *tool*, so `Skip` is steel. The
  verdict card's primary is the one in the app that changes under you: it
  repaints from Skip to Clear the moment the beat lands, because
  **completing a moment and clearing a roll are never one gesture** (§7.16)
  and the word should say which one you are about to do.

- **The body is a shortcut now, not the control.** `#banner-main`,
  `.pk-main` and `#verdict-main` still clear on click — the biggest target
  on screen, and the hand already knows it — but they carry no `role`, no
  `tabindex`, no `title`, and no keydown twin (the named bar is a real
  `<button>` that owns Enter and Space natively). **The ✕ watermark and the
  body's removal wash are retired on all three surfaces.** Hovering the body
  now lights the named bar — *the linked press* — so the shortcut teaches
  the word instead of hiding behind it.

**Why the old dress was a defect, stated plainly.** It was an affordance
that existed only under a cursor. §7.9's own P6 grammar — *quiet → loud on
approach, never invisible → visible* — had already been applied to the
fold's verbs and to the verdict card's action row; the body-as-button was
the last surface still breaking it, and it broke it on the one act the card
most wanted you to find. On touch there is no hover at all, so the panel's
primary act was simply unannounced. `(pointer: coarse)` now also raises
every verb in the row to a 44px target.

**Superseded in part:** §7.11b (the folded card's hover read is unaffected —
hovering the banner still outlines that roll's dice per source pool; only
the removal dress moved) · §7.7.2 (the roller's ✕ returns to the card, once,
named and full-width) · §7.16's 2i-C rest-dim, as amended above.

**Amended in §7.9:** "never a second smaller target for one verb" becomes
**"never a smaller UNNAMED target for one verb"** — the named control is the
target of record; the body click is a shortcut to it, not a rival.

**A shipped bug fell out of the audit.** `el.hidden = true` sets a property;
the paint is a separate question. The UA sheet's `[hidden] { display: none }`
is user-agent origin, so any author-origin `display` beats it regardless of
specificity — and `.banner-foot` and `.pool-roll` both declare
`display: flex`. Since the L8 mount-once rewrite (which replaced *build the
verb when it applies* with *mount both and toggle `.hidden`*), every face-up
card shipped a live Reveal the server answers with 403, and every held card
a REROLL of a spec nobody at the table can read. The suite stayed green
because it asserted the PROPERTY. Fixed with a global
`[hidden] { display: none !important }`; pinned by `fold-visibility`, which
reads computed display. **The lesson is the assertion, not the rule:** a
visibility contract is about what the eye gets, so pin computed display.

**Scenarios:** `named-verb` (roller vs spectator, no hover anywhere) ·
`fold-visibility` (the computed-display regression pin) · `linked-press`
(the retired watermark + body hover lights the bar; needs the harness's real
`hover()`, since a synthetic mouseover never moves the browser's hover
state) · `named-verb-touch` (44px, opacity 1, zero pointer events) ·
`named-verb-keys` (the body holds no tab stop; the table's Enter-collects
yields to the focused button) · `verdict-skip-verb` (Skip mid-beat, Clear
after).

### 7.22 The collapsed pool rail — pick three, roll once (2026-08-07)

*Joe: "The minimize view of the panel is really bad right now. I'm tempted
to just drop it. If we keep it, we should do a full UX pass on it. I think
if it remains, it should be able to do only the most core operations, but
do them quickly and cleanly. The problems right now are: It drops the saved
pool shelf titles, it shows saved pool names vertically, it don't allow for
the common case of picking multiple pools (an attribute, skill and
motivation is a common pool combo in Your Soul Deal). The ability to select
a few pools and roll feels key. I think it should clear the tray after each
roll if we don't show the tray (which we don't seem to have enough space
for)."*

**Kept, not dropped — and every defect on the list was downstream of one
number.** Names ran vertically because a word does not fit in 56px. Shelf
titles vanished because a heading does not fit. Multi-pick was impossible
because a tray has nowhere to live. So the rail is **112px**, and the width
buys all five back at once. (A "drop it" design was built and judged; it
lost because it made every collapsed roll an expand → refit → roll →
collapse → refit cycle — two camera reframes per roll, on the very table
stillness §7.4 says collapsing exists to protect — and left touch with no
roll surface at all, since the digit shortcuts are keyboard-only.)

**A ROW IS A WORD, NOT A BOX.** *(Corrected 2026-08-07 after actually
looking at it — the first build gave every row a border and a fill, and
nine of those stacked in a 112px column read as a keypad: no rhythm, every
row the same weight, and the name squeezed by the chrome that was supposed
to present it.)* At rest a row is its name, 12.5px, horizontal, ellipsized,
with the full text on `title` and `aria-label`. The border stays in the box
model as `transparent` so selecting cannot shift the text by a pixel —
**reserve the space, hide the ink**, the same lesson the ✓ gutter taught
before it was deleted.

**Selection is the only box in the column**, which is what lets ONE signal
carry it. The first build needed four — ring, fill, inset glow and a ✓ —
because they were all competing against a background of boxes. Steel, not
gold: picking is a tool act; gold belongs to the verb.

**Shelf heads are the column's only standing chrome**, and therefore its
rhythm: 10px bold tracked uppercase, shown for every REAL shelf **including
when it is the only one** — a rack of nine attributes is exactly the case
Joe was complaining about, and a rule that counted sections would have shown
him nothing. Only the synthetic `Pools` catch-all is suppressed.

**Rows are 38px, not 44.** Tappable, but this is a dense list: at 44 with a
small word inside, the names read as scattered down the column rather than
as a group you scan. The gold verb keeps 44 — the verb is as big as what it
acts on.

**One verb, full width, STANDING.** *(Corrected 2026-08-07 — Joe: "I
absolutely despise the fact that the roll button only appears after pools
are selected. I'd strongly prefer it exist but be grayed out.")* The bar is
**standing furniture** (§7.9), grayed by the 2i-C disabled code until a pick
arms it, so the column's geometry never moves. The first build made it
contextual, citing §7.14 — **which §7.9 explicitly superseded** when the
workbench rail settled this exact question the same way ("always rendered,
verbs grayed until a draft exists, so the workbench's geometry never
moves"). Building on the superseded half was the error; the ruling was
already made and already shipped one surface over.

It spans the column so it aligns with the rows it acts on, and shows the
pick count and every picked pool's name in its `aria-label`. There is **no ✕
beside it**: a clear-selection button spent 29px of an 86px bar on the
rarest act in the surface and shrank the verb to a button, and dropping a
pick has two ways home already — tap the row again, or Esc. Over the 40-die
cap the bar drains to the same disabled code.

**The list hugs its content** (`flex: 0 1 auto`) instead of claiming the
column. At flex-grow the list held every spare pixel and the roll bar sat
marooned at the far bottom behind ~160px of void; hugging puts the list and
its verb together as one block. It still shrinks and scrolls on a short
viewport, which is the common case with a real rack.

**2i-G — A SELECTION IS NOT A DRAFT.** Ordered by the RACK, never by tap
order (so a digit sequence means the same roll whether the panel is open or
closed — `1 4 7` on the dealt rack, per U24) · never persisted · **spent by its roll** · dropped when the panel
expands. This is what makes Joe's "clear it after each roll" compatible with
**2i-E, which is unchanged**: a draft is a composition you keep editing and
which survives to be repeated; a rail selection is a pick you already fired.
Esc drops the picks at the same rung the staged draft peels at, so a mis-tap
never costs a roll.

**What a compose can and cannot carry.** A SINGLE pick launches the pool
exactly as authored — dc, moment, visibility, keep/drop, reroll, explode and
set override all ride, byte-identical to a rack roll. TWO OR MORE compose:
dice, per-die source labels, and each pool's flat modifier as a labelled
part (`+2[Wisdom]`, so the attributed-math invariant survives). **Set aside,
out loud, in the rail's own note line:** keep/drop, reroll, explode and adv
(the grammar glues these to one dice type and has no union for a sum) · a dc
or moment declared by more than one pick. **Visibility fails CLOSED**
(goal 11): one declared mode rides, two different ones become `secret`.

*Why the glue is stripped unconditionally rather than attempted:* a sum of
DIFFERENT die types rejects glued mods outright, but a sum of the SAME type
does not — `4d6dl1 + 2d6` parses happily as `6d6dl1`, widening the drop
across dice that never had it and silently changing the distribution. A
"try it and catch the error" design would have shipped that. Pinned by
`rail-compose-rules`.

**The note lives in the rail.** `showSettingsNote` cannot serve here: outside
the settings modal it falls through to the status pill, and the collapsed
rail folds that pill to a 10px colorless dot — so every set-aside whisper
would be invisible in exactly the state that sends it.

**§7.4's capability matrix gains a row, with a carve-out:** *Collapsed pool
rail (launcher) — Roll ✓ (authored intents; multi-pick composes) · Offer ✗ ·
full-intent editing ✗.* The full-column law binds **authoring** surfaces; a
launcher fires intents that were already authored elsewhere, and the
authoring surface is one keystroke away (`n`).

**Also fixed here:** the rail repaints ABOVE `renderGroups`' foreign-rack
early return, so visiting a teammate's rack no longer leaves the collapsed
rail showing whatever it last painted · a hidden draft never fires silently
(Enter with the panel collapsed and nothing picked surfaces the workbench
and pulses its roll button instead of broadcasting something you cannot
see) · digits do the panel's own verb — stage when open, select when
collapsed.

**Open (Joe's call, after a Thursday):** a single-pool roll is now two taps
(select, then Roll) where it was one. The candidate if that grates is
long-press-a-row-to-roll-now, deliberately not shipped first because two
verbs on one 44px row is how quiet chrome gets loud.

**Scenarios:** `rail-multi-pick` (the attribute + skill + motivation roll,
three digits and Enter, spent-by-its-roll, Esc, expand-drops) ·
`rail-compose-rules` (authored-verbatim single pick, the same-type glue
trap, fail-closed visibility) · `side-panel` (the rail's shape and the
select-then-roll flow).

**The head and the foot — ONE LEFT EDGE.** *(Joe 2026-08-07: the user dot
is "complete garbage UI… I'd rather remove it than keep an unexplained dot
that is centered horizontally", and the utility buttons are "awkwardly
horizontally centered and top aligned in their region".)* Both were stacked
into centered columns by one rule written for the 56px rail, where nothing
could sit beside anything else. At 112px that centering aligned to nothing.

- **You, named — and you do not move.** The identity chip shows your dot
  *and your name*, left-aligned, wearing the same borderless row dress as
  the pools. It keeps both its jobs (left-click swaps rack, right-click
  opens the seat menu). A bare colored dot centered over a column was a
  control that named neither itself nor its state.
  The collapsed rail carried a **34px top inset** written to clear "the
  chevron's reach" back when it was 56px wide — but the chevron lives in
  the 14px divider strip on the RIGHT edge and the chip's box stops exactly
  where that strip begins, so there was never anything to clear. What it
  actually produced was a band of unexplained blank space and a **25px jump
  in your own name every time the panel toggled**. Both states now use the
  same 10px inset and the same 31px chip, so the name holds its line —
  measured at 0px of movement, and pinned in `side-panel`.
- **The foot is a row, pinned to the bottom**, inset to the same left edge
  as everything above it, in the shipped §7.9 order: configure → consult →
  act on the left (⚙ ≣ ❯), the contextual ✕ alone in the right corner, and
  fixed widths so the left cluster never shifts when the ✕ arrives.
- **`? Help` is the one control the collapsed foot gives up**, and the
  reason is measured, not asserted: the foot's content box is **86px**, and
  ⚙ ≣ ❯ plus the ✕ came to **98px** at the boxed padding — already spilling
  under the divider strip. Help would have made it 119px. Bare glyphs at
  tighter padding bring the four to ~81px. Help is reference material and
  its panel is one keystroke away; Settings, Log and Quick roll stay,
  because `control-rail`'s never-hides promise names them and there is a
  standing regression pin for Settings-in-compact.
- **`tools/steps/foot-fit.mjs`** measures that budget, and `control-rail`
  now asserts the row fits its column — the 12px overflow was invisible to
  a screenshot *and* to every other assertion in the suite.

**Left open, deliberately:** the roster and the table nameplate stay hidden
when collapsed. Both are real information (*who else is here*, *which
table*), and at 112px both are affordable as one more row each — but adding
them is Joe's call, not a drive-by, since the complaint being answered here
was too much unexplained chrome rather than too little.

**Looking at it is not optional, and the numbers do not substitute.** Every
correction in this section — the keypad rows, the marooned verb, the void,
the ✕ eating a third of the bar, the names adrift in tall rows — was
invisible to `getBoundingClientRect` and to all three passing scenarios.
The first build measured clean and looked bad. `tools/steps/rail-look.mjs`
renders the rail against a real twelve-pool Soul Deal sheet through the
same headless Chrome the suite uses (`Page.captureScreenshot` needs no
displayed pane) and writes crops to `tools/out/`. **Run it, and look, before
calling a visual change done.**

### 7.23 Three switches, and the collapsed column grows a second list (2026-08-08)

*Joe: "In the expanded view we always show Saved Pools. We also have a toggle
to show dice or notation… instead of a toggle between dice/notation, there is
a UI element where dice/pools/notation can be individually enabled disabled.
It should be a single multi-toggle-button bar… But for consistency, let's move
all of the UI sections below the Roll tray. In collapsed view, there is a
toggle between dice/pools."*

**SUPERSEDED:** §7.9 (2026-07-30), *"The draft shows ONE input view at a
time… a per-user toggle (`dice.inputmode.v1`)"*, for the expanded panel.
**What dies:** the exclusivity and the two-value key. **What survives, said
out loud:** (a) **P1** — the migration is pixel-identical in both directions,
so every existing user's panel shows exactly what it showed the day before;
louder is now a choice, never a default; (b) **§1.3 is carried forward
untouched** — both editors remain projections of one spec object,
`parse(render(spec)) ≡ spec` still binds, and simultaneity introduces no
reconcile step. That is the whole reason exclusivity was never required: it
bought density, and density is a preference.
*(The citation of record is §7.9's clause, not §1.5 — §1.5 is round-tripping,
and §7.14's "two editors" is a loose paraphrase of it.)*

**THE WELL LEADS THE COLUMN.** Less of a change than it reads as: `.draft-zone`
was already `position: sticky; top: 0` inside the scrolling body, so the
palette already slid *under* it after ~130px of scroll. The reorder makes the
resting order match the scrolled one. It also fixes a latent bug —
`.pool-sec-head` pins at `--draft-h`, which only matched where the zone
actually sat after ~175px of scroll; below that the heads pinned into the gap
above it. Now exact at every offset, and pinned in `draft-bench`.

**Two defects only LOOKING caught**, both invisible to every existing
assertion and to three passing scenarios:
- The palette's 4-column die grid ran straight into the rack's 3-column die
  grid with **14px** between them, against the shelves' own **12px** — the
  region head had stopped out-ranking the shelves it contains, which is
  exactly the confusion §7.17 shipped `SAVED POOLS` to kill. Sections now
  carry **20px** of trailing air, owned by their own boxes so a hidden section
  takes its gap with it and no rule has to know which sections are on.
- The body's `padding-top: 4px` became a **leak band** above the sticky well,
  with die art visibly sliding through the slot between the identity rail and
  the well. The zone takes those 4px into its own padding. Pinned as
  "no padding above a sticky child".

**THE SECTION BAR** sits below the well and above what it reveals, so the bar
and the stack read in the same order and the map never lies. `role="group"`
with independent `aria-pressed` — checkbox semantics, zero to three pressed,
never a radiogroup. Order **Dice · Notation · Pools**: Pools last is forced
(it is the only unbounded-height section and it owns the sticky shelf-head
machinery, which needs the rack to be the scroller's tail), and Notation
between the two die-art grids is a physical separator.

**All-off is legal**, with no last-section-standing rule — a chooser whose
availability depends on its own state argues with you. The workbench above is
a complete §7.4 surface by itself: cluster, rim, ± popover, both verbs, and
`/` and `1`–`9` still work.

**TWO OBJECTS, NOT ONE.** `sectionsStored` is the persisted truth and only an
explicit cell click mutates it; `sectionsTransient` carries `loadIntoBox`'s
surfacing of the box for one visit. A single merged object would have
laundered that loan into storage the next time any *other* cell was clicked,
and the panel would boot with a box the user never chose — which is the audit
finding the old single variable produced, reintroduced by state shape. The
shape prevents it now, not care at each call site. Pinned in `section-bar`.

#### The collapsed column: two source lists, one verb

**A LAUNCHER, not a second workbench.** Pools are a SET you pick from; dice
are a MULTISET you count up. Both are picks under **2i-G** — ordered by their
list, never persisted, spent by their roll. The MODE is a preference and
persists (`dice.railmode.v1`); the PICKS never do.

**QUIET CHROME, both views — THE INK MARKS THE CONTROL, THE WEIGHT MARKS THE
STATE.** *(Joe 2026-08-08, twice: first "too bright/prominent… it's almost
always all selected elements, making it the eye catching part of the screen
until some action is taken", then — after a pass that simply deleted the
dress — "now it's just floating text with no visual language".)* Both notes
are right and they are not in tension. The fault was never that the bar HAD a
dress; it was that the ink sat on the wrong thing. A segmented control lights
what is ON, and here nearly everything is on nearly always, so the loudest
object in the panel was the one you touch least — and stripping it bare then
took the affordance out with the noise.

**Shipped, and this is the paragraph of record** *(rewritten 2026-08-08 from
the comment over `#left-panel :is(.section-seg, #rail-mode)` in
`css/style.css`, which was the only account of the third iteration; the first
draft of this section described the second one, and the `#rail-mode` comment
and the source-switch comment in `index.html` repeated it)*. Both bars keep
**one quiet track** around the whole strip — `1px` of
`rgba(255,255,255,.055)` over `rgba(0,0,0,.16)`, `8px` radius, `2px` of
padding. One object, unmistakably a
control, rather than three lit ones. Inside it nothing is filled loudly: a
pressed cell wears **the faintest recess the panel can hold**,
`rgba(255,255,255,.05)` with no inset ring — against the `0.13`-plus-ring the
first build gave it — and the real signal is **weight**: pressed reads
`--ivory` at `0.78`, unpressed `--muted` at `0.42` (2i-C's rest-dim). Hover
lifts either to `1`. No gold anywhere on the bar: HUE = ACT, and this is a
tool. Nothing here competes with the well.
*This is also how the one genuine Joe-vs-doctrine collision of the design
pass settled.* His sketch asked for a recess showing the active option; §7.22
had spent a whole pass removing standing boxes from the 112px column, because
**selection is the only box there** and that is what lets one signal carry it.
A recess at a tenth the volume satisfies both — it is the "recessed area shows
which is active" he asked for, quiet enough that the selection box downstairs
is still the only box that reads as one. It took his second look to get
there: the first build shipped the loud recess and it was the brightest thing
on screen, and the pass that answered him by deleting the track went past
quiet into unmarked.
*(A record note, because it is the point of §7's index table: this paragraph,
the `#rail-mode` CSS comment and the source-switch comment in `index.html`
all went on describing the middle iteration — "no track, no lit cell, weight
alone, 0.72/0.45" — while the build shipped a track, a recess and 0.42/0.78,
recorded nowhere but the CSS block's own comment. Three stale records against
one accurate one, on the newest surface in the file, in a repo whose
CLAUDE.md names this document the authority. All three now agree, and the
section bar's own `index.html` comment — which described the markup and said
nothing about the dress — now carries it too. The CSS comment stays the dress
of record, because the numbers live beside it.)*

**2i-C's disabled code is unchanged and still the third state.** Only the
collapsed switch has a cell that can go unavailable — `Pools` on an empty
rack — and it is grayscale-drained to `0.25`, below rest-dim: unavailable,
not merely secondary. The expanded bar never disables a cell; all-off is
legal, so every section is always reachable.
*(Two cascade notes, both paid for: `.seg`'s track sits ~3100 lines below
these rules, so an unscoped `.section-seg` loses the tie on source order; and
the pressed dress inside the panel is IVORY via `#left-panel .seg`, not the
gold of the bare `.seg` — a plan built on "doctrine says steel, the build
ships gold" was working from a rule the panel had already overridden.)*

**The third cell shows `2d6`, set in the command box's own mono**
*(Joe: "Notation is rarely used by me… I feel like it needs a demotion of some
kind", then "the word notation feels too formal")*. It is demoted twice, and
neither time by dimming — unpressed is already dim, and a dim cell between two
lit ones was exactly the thing he noticed. First **by area** (§7.21's fourth
law, HIERARCHY IS AREA NOT VOLUME): it stops claiming a third of a bar whose
other two cells are on nearly always. Then **by kind**: the label is a literal
sample of `#cmd-input`'s typeface, so the face does the explaining and no word
has to — and the cell reads as different in species from its neighbours, which
is honest, because it is a text field between two tap-surfaces.
*Rejected, with reasons:* `Type` (vague) · `Formula` (swaps one technical
register for another) · `Shorthand` (wider than `Pools`, fights the demotion)
· `Code` (this app already has room keys and invite links; "code" invites the
worse misread) · a `VTT` badge (Roll20 is a VTT and so is this app, so the
cell would be naming the whole screen) · the `❯` glyph (already the quick-roll
palette in the foot — one glyph for two verbs is what ONE DRESS PER VERB
exists to prevent).

**The decision table.** Pools when you have any and have not chosen; dice when
you have none, with the Pools cell **disabled rather than absent** (2i-C's
grayscale code, drained below rest-dim: unavailable, not merely secondary). A live dice pick
outranks storage, so a pool arriving mid-composition — an import, an SSE push
— can never yank the column out from under three taps of work. When the rack
empties the key is **deleted**: forgetting is what "the default logic applies
again" means, and anything else has an empty rack remembering a choice made
about a rack that is gone.

**Digits stay bound to POOLS in both modes** — the one place the design
refused its own symmetry. `1 4 7 Enter` is the attribute+skill+motivation roll
this surface exists for (U24; the digits are dealt ACROSS the shelves, so the
sequence follows the rack's shape rather than a flat count), and the mode
*persists*, so rebinding the digits to
loose dice would fire the wrong roll from muscle memory forever after one
flip. A digit pressed in dice mode surfaces the pool list **for that visit
without rewriting the preference** — `loadIntoBox`'s precedent, and the reason
2i-G's parenthetical stays true in every state. Loose dice get no digit
shortcut; §7.22 gave up `? Help` on a tighter budget than this.

**Both picks survive the switch.** An earlier draft dropped the outgoing one
so that Enter and Esc could stay single-minded — but that is a 39px control a
thumb's width above the first row silently eating three taps of picked work,
with no undo. Enter, Esc and the verb act on the VISIBLE list's pick instead,
the same rule the digits follow. Nothing is ever destroyed by navigation.

**One column, one list.** The dice list is the pool list's twin: same 86px
row, same steel selection box, same left edge. **The count is the label** —
`d6` becomes `1d6`, `2d6`, `3d6`: the notation itself, one glyph cheaper than
a `×3` badge and the same string the roll will send. The **first** tap writes
`1d6` and does not stay at `d6` *(Joe: "when I click once it highlights, then
the next click the text jumps to 2dX, it's weird that it skips 1dX")* —
suppressing the leading 1 is the typographer's instinct and the wrong one
here, because the label's job is to COUNT, and a counter whose first increment
is invisible reads as starting at two. The right-hand slot that holds a digit
ordinal in the pool list holds a **remove-one ✕** here, a sibling of the row
and never a button inside one, standing on coarse pointers because a counted
row you cannot decrement by touch is a trap.

*A 2-column tile grid was drawn first and refused on measurement:* at 86px the
tracks come out ~40px, `10d10x` needs 39px of label alone, and
`repeat(2, 1fr)` would resize a tile's NEIGHBOUR on the tenth tap. One column
gives the notation room and costs nothing — **the column was never wide enough
to be a grid**, which is the lesson §7.22 already learned at 56px.

**The cap is refused at the increment**, with a `#rail-note` whisper: a die
grows the pick by one or two, so the marginal tap is exactly what to refuse.
The pool list keeps its drained bar, because a pool can leap the cap in one
un-splittable tap.

**The roll is BARE by construction** — plain NdX, every axis at its default.
That is what lets a launcher fire it without becoming an authoring surface
(§7.4): a bare spec's whole intent is visible on its face, and `3d6` from the
rail is byte-identical to `3d6` from the box. The first hidden part — a
modifier, a dc, a visibility — is where authoring begins, and the rail
refuses; `n` and `/` are one keystroke away. **§7.4's launcher carve-out gains
a row:** *Collapsed dice list — Roll ✓ (bare specs only) · Offer ✗ ·
intent editing ✗.*

#### The verb is the tray's own plate, small

*Joe 2026-08-08: "a gray roll button at the bottom in compacted mode is very
different than a bronze/gold themed tray at the top in the expanded mode…
you see that?" — then: "it should try REALLY HARD to look like a small version
of the tray on the expanded view, **but without actually being a tray**."*

He was right, and the reorder had just sharpened it: the same act sat at
opposite ends of the two views wearing two different dresses. So the collapsed
column now reads the way the expanded one does — **YOU, then the DESTINATION,
then the chooser, then the sources** — and the verb heads the column instead
of sitting in its foot.

**Two passes got the dress wrong the same way**, by building the whole well up
here: a recessed bronze pocket with a ROLL plate seated in its floor. A pocket
exists to hold dice; a pocket that never holds any is a *broken* tray, not a
small one. What carries across is **the plate** — the struck bronze surface
the verb lives on. What stays behind is the container.

So the collapsed verb is `#tray-actions::after` at rail scale, value for
value: the same three-stop gradient, the same lip line, the same inset
highlight, the same unpowered variant when nothing is picked, the same hover
and the same sinking press. Its lettering is **built by `buildRollCue` itself**
in the engraved form — the same word, the same lozenge-tipped rules — so the
font and the decoration cannot drift from the tray's; only the scale changes,
because 24px tracked at 0.3em does not fit an 86px column.

*Recorded because it cost a round:* the hover values were **eyeballed** on the
first attempt and came out dimmer than the tray's. "Match it" is a thing you
copy, not a thing you approximate.

**Scenarios:** `section-bar` (migration both directions, all eight states,
the all-off floor, the laundering pin) · `rail-mode` (the decision table, the
switch, tapping rows, **the button actually rolling**, d100's pair, the ✕,
digits-stay-with-pools, the empty rack, collapsed-only visibility) ·
`draft-bench` (the region gap, the leak band, the sticky pin that did not
exist before).

**The hook and the button had diverged.** `rail-mode`'s first draft drove the
`railRoll()` debug hook, which branched on mode correctly — while `#rail-roll`
was still bound straight to `rollRailSelection()`. A dice pick armed the bar
and pressing it did nothing, and the suite was green. **Drive the control, not
the hook**, wherever the control is the thing being claimed.

**Looking, again, was not optional.** `tools/steps/panel-look.mjs` (new — the
expanded panel had never had a shot taken of it) captures the section states,
a short window and a scrolled frame; `rail-look.mjs` gained both collapsed
modes, the counted row, the `10d10x` worst case, the empty rack and a real
`:hover` frame. The scrolled frame was a *duplicate of the resting shot* until
the viewport was shortened — a tall window has nothing to scroll, so the frame
that existed to prove the sticky behaviour proved nothing at all.

**And a third tool, for the same reason one level up (2026-08-08).** Both of
those frame a FINE pointer at a tall desktop viewport — which is precisely the
configuration the touch pass (ROADMAP U28–U30) does not change. Every rule it
moved is behind `(pointer: coarse)` or a height branch, so a tool that never
emulates touch is *structurally incapable* of showing the work: not a gap in
coverage, an inability. `tools/steps/touch-look.mjs` captures the coarse dress
at tablet portrait plus a short-laptop frame for the height branch. It earned
itself on the first run — `.tile-del` had grown 24 → 36, measured correctly,
passed every assertion, and put its box on top of the `×2` badge of every
counted pool. **A control can pass 34×34 and still be wrong**, and no number
in this repo would have said so.

### 7.24 The stake and the read — what a result surface shows (2026-08-08)

**This is the authoritative section for what any surface prints about a
declared target, a flat bonus, and the mechanics that decide which dice
count.** It retires §2.5. The build spec that produced it — the gate table,
the surface-by-surface renders, every disagreement ruled, the strongest
objection and its answer — stays in **ROADMAP U17**, which is the record of
what was decided and why. This section is what is true.

**THE RULE.**

> A **stake** renders on every surface under every system. Its
> **adjudication** — the comparison of a result against it — renders only
> where the system produces a single number to compare (`usesTotal`). The two
> never share a slot.

A **stake** is a condition of the moment the player declared: the target, the
title, the subtitle, and the mechanics that decide *which dice land and which
count*. It is a fact about the roll and asks the app to compute nothing.

**Arithmetic** is a term in a sum: the flat modifier, named bonus parts, the
total, the margin, the ring's ratio, `Success`/`Failure`, `✓`/`✗`. It renders
where its sum renders and nowhere else.

The dividing question at every site is **"did the player TYPE this, or did we
COMPUTE it?"** — with one refinement: *a typed value that has no meaning
except as an operand of an absent operation is arithmetic, not a stake.* A
target stands on its own — *we are throwing at 15*. A `+5` does not.

**The app's own record already said a target is a stake.** This was not argued
from taste; three places in the repo had already decided it and nobody had
joined them up:

- `index.html:764` — *"The improviser's hot pair rides near the top (CUJ2): **a
  target and a moment are the stakes**."* The markup calls it a stake.
- §2.1 above — *"There is **no `target.hidden`**: stakes are public on every
  visibility rung (§3.0)… the drama comes from the held result, not a secret
  number."*
- GOALS' superseded decisions — the DM seat's fourth power, *hidden Targets*,
  **was rejected outright, "because stakes are public on every visibility
  rung."**

The held branch on the verdict card has always shipped the exact shape:
`vs DC 15` over *Face down*, commented *"Public stakes, hidden result."*
Nobody ever filed that as a bug. A per-die read is the same case — *unavailable
because this system does not judge* rather than *unavailable because not yet*.
The code already knew how to render a stake without a verdict; it had not
noticed it had a second reason to.

**And the decisive one for the default table:** under §2.3 a bare `dc15`
*implies a Check* — "a target with no staging would be mute." So `2d6 dc15`
on a Soul Deal table staged a full Ordeal — card, title, dwell, dock, verdict
— whose sole trigger was a number the app then refused to name on any surface
the roller could see. Staging a ceremony because of a fact and then suppressing
the fact is worse than either extreme.

**Eight surfaces, not four — and the two that were never gated are the ones
that prove it.** The 2026-08-08 audit (finding B1) counted four disagreeing
surfaces; the design pass found **eight**, rendering **six** different subsets
of one stake. The offer card and the ceremony's screen-reader announce had no
gate at all, which produced the two readings that settle the question: an
**offered** Check declared both stakes under a per-die system while **rolling**
it showed neither, and a blind player heard `target 15` from the same beat at
which the sighted player's card read `d20 8 quiet`. The 2026-07-31 gate sweep
touched five sites and missed three; that is the whole shape of the bug.
*(The audit's four-surface count is history. Read this row set instead.)*

Fixture `1d20+5 check dc15 # The Duel`, system `soul-deal`, the d20 lands 8:

| surface | title | subtitle | target | flat `+5` | selection mods | adjudication |
|---|---|---|---|---|---|---|
| offer card | ✅ | ✅ | ✅ `vs 15` | ⚠️ **still prints** — see *not closed* | ✅ | — |
| intent card | ✅ | ✅ | ✅ gold ring, **ivory** numeral, `targetWord` label | ❌ | ✅ chips | — |
| dock strip | ✅ | ✅ | ✅ pill *(cinematic paint only)* | ❌ | — | — |
| SR announce | ✅ | — | ✅ `target 15` | ❌ | — | ❌ |
| verdict card | ✅ | ⚠️ *no element — deferred* | ✅ `vs DC 15` | ❌ | ✅ mod-cards | only under `usesTotal` |
| result banner | ✅ | — | ✅ `VS DC 15` | ❌ | ⚠️ rows omit discarded dice | only under `usesTotal` |
| roll log | ✅ | — | ✅ `vs 15` | ❌ | ✅ struck / ✴ | only under `usesTotal` |
| peek | ✅ | — | ✅ `vs DC 15` | ❌ | ⚠️ rows omit discarded dice | only under `usesTotal` |

The pre-roll surfaces (dock pill, offer `vs`) keep their gold numerals; that
is a §7.9 / 2i-C hue question, deliberately out of scope. **On a result
surface gold and red mean *adjudicated*,** so an unadjudicated stake takes the
muted register with an ivory numeral: `.stake-num`, one dress, four surfaces
(verdict margin, banner verdict, peek verdict, log row), so a target reads the
same wherever it lands. The intent card's `.tnum` was already ivory inside its
gold ornament — the card that declares the stake and the card that answers it
now spell the number the same colour.

**BRANCH ORDER WAS A SECOND, INDEPENDENT GATE.** Two mechanisms were
suppressing the verdict card's stake and only one of them was a flag. The
obvious one fused `Number.isInteger(entry.dc)` to `usesTotal`. The other was
that `renderOutcomeRows` wins the if/else first, so the `else if (hasDc)`
branch below it was **unreachable under a per-die lens no matter what the flag
evaluated to** — flipping the flag alone would have changed nothing visible.
The fix is not a gate flip: **the stake is written once, above and outside
every branch, including the hidden early-return.** Stake and reading are
different slots; the rows that own the hero can no longer suppress the caption
over them. *The lesson generalizes: when a value is conditional AND lives
inside a chain, the chain is a gate too, and grepping for the flag will not
find it.*

**`usesMods` was an invariant break, not an inconsistency — and it is
deleted.** One boolean folded five things together: the flat modifier, d20
pairing, keep/drop, reroll and explode. Only the first is arithmetic. The
other four decide **which dice land and which count** — and `soul-deal`'s own
`outcomesFor` filters on `p.counts && !p.child`, while its `forecastFor`
refuses to pre-read keep/drop *precisely because* of it. The profile was
suppressing attribution it treats as load-bearing everywhere else, against
GOALS' **Attributed math** invariant, on the system that cares most which dice
counted. Arithmetic now keys off `usesTotal`; **selection is universal.**
`usesMods` is deleted rather than corrected, because all three profiles set it
equal to `usesTotal` — it never distinguished anything, and deleting it makes
the conflation unspellable.

**`usesTotal` narrows to one sentence, and `targetWord` names.** `usesTotal`
gates the sum and everything derived from it — the big number, the margin
delta, the ring's ratio, and the Success/Failure adjudication of a target.
**It does not gate the target.** The profile's only say over a stake is what
to *call* it: `targetWord` is `Target` under `soul-deal` and `none`,
`Difficulty Class` under `dnd`, and it feeds exactly one site,
`#intent-target-label`. Without it, ungating the badge would have printed
**DIFFICULTY CLASS** — a D&D mechanic's proper noun in gold caps under a 96px
ring — on Joe's own game at the most deliberate beat this app has. Nobody had
caught it, because the ring had never rendered on that system to be read.
The terse post-roll strings (`vs DC 15`, `vs 15`) are unchanged: they are
readbacks of the `dc` token, not names of a concept.

**The mute gold `?` leaves the total slot.** `#result-total` is 52px in
`--gold-bright` = `#ffd766`, which is literally the ROLL cue's own colour at
full alpha. Under a per-die system it was `display:none` for every open roll
and sprang to life for exactly one purpose: to announce an absence — a
spectator's whole banner for a held roll was a name, a label and a mute gold
`?`, with nothing on it saying why. **The slot belongs to the sum now** — it
renders where a sum exists and is gone otherwise — and the hero slot names the
rung instead: `Face down` / `Whispered` (`heldWord`), in the quiet italic the
verdict card already owned for it. Three result surfaces converge on one
vocabulary. A **totals** lens still answers `?`, because there a number
genuinely exists and is being withheld; the peek also keeps its `?` for
`!entry` (a collected roll carrying no data), where the `?` is not a lens
question.

*The write moved inside the gate as well.* The old line put `entry.total` into
the node on every paint under every system and only `display:none` withheld
it — the sum a per-die lens refuses to compute was sitting in the DOM the whole
time, one devtools inspection or one CSS regression from leaking. **A
visibility contract that is enforced only by CSS is not a contract** (§7.21
learned the same lesson from the other direction, with `[hidden]`).

**The popover follows the same split.** Only the **Modifier** section folds
under a per-die lens — a flat bonus is a term in a sum and has nowhere to
land without one, which is exactly where Joe's 2026-08-06 "fold it entirely —
no note" ruling sits. **Target, d20 pairing, keep/drop and reroll/exploding
all came back.** Target is not optional: it round-tripped invisibly —
`popStateFromParse` loaded it, `popCanonical` emitted it, `#pop-echo` printed
it, and the editor showed no row — which is ROADMAP U11's own named remaining
hole ("re-add via ± is impossible for `dc`") and a worse split than the one
this closes. **The rim reads `± Modify` under both systems**, which *applies*
U11's rule rather than overturning it: `± Moment` was right when the popover
held two of seven sections; it holds six of seven now, and naming one of six
is the same defect U11 fixed. No `#pop-sysnote` returns — it would fire per
keystroke and it would be false, since `dc15` under a per-die system stages
the Check and arms the `dnd` re-read.

**No per-die comparator exists, and none is built here.** There is no
`target.cmp`, no `scope:'each'`, nothing in `outcomesFor` that consults
`entry.dc`. §2.1 reserves `scope:'each'` for roadmap §8's success counting
under a *different* notation (`cs>=N`) and a *different* verdict rendering
(success pips, not a ring). Stated here in one line so it is not
re-litigated: **declining to conclude is obedience, not evasion.** `total >= dc`
is a house rule, true under D&D-style play and undefined under Soul Deal, and
GOALS goal 6 makes that the players' business. Silence on the *verdict* is
obedience; silence on the *stake* is amnesia.

**The residual cost, stated plainly.** A Soul Deal player who wants a target
*judged* still cannot have one, and now sees it rendered without a judgement —
which makes the absence more visible than it was. That is the correct trade:
inventing a per-die comparator to paper over it would be the app deciding how
a target works in someone else's game. Making the gap visible is how it gets
designed rather than forgotten.

#### Deferred, with the cost named

**1. The structural inversion — a profile that SUPPLIES renderers.** The
alternative design had the profile answer `readFor(entry) → {headline,
verdict, ring}` instead of surfaces querying booleans. **Refused**, and the
subtraction taken without the rewrite: two members out (`usesMods`,
`meaningFor`), one small one in (`targetWord`). It changes nothing a player
sees against this section; it is ~70 lines across the file's most-repainted
functions; and its own shape presumes the sum world's furniture, so the first
genuinely different profile would force a redesign anyway. **Cost of
deferring:** hero arbitration stays in `js/main.js` rather than in the
profile, so the day a **hybrid** system ships — chart words *and* totals — the
one-hero-slot question §2.5 was invented for reopens. Recorded here so that is
a known door and not a rediscovery. Do not restructure the interface without
that system in hand: `readFor` designed against three profiles that all agree
is a guess.

**2. `#verdict-subtitle`.** The verdict card has **no subtitle element** —
under any system, for any notation. That is a **missing element, uniform
across all three profiles**: not a gate, not part of the stake/arithmetic
conflation, and not something a lens can be blamed for. Adding it means new
markup, new CSS, and a third small line between the eyebrow and the answer on
a card whose whole virtue is *the name, the answer, the exits*. **Cost:** the
table above keeps one honest asymmetry (verdict card, subtitle), held open as
a rider under ROADMAP U16 rather than left to be re-audited.

#### ~~Not closed~~ — ALL THREE CLOSED (re-verified against source, 2026-08-15)

*This block listed three disagreements between the rule above and the tree.
**None of them is still true**, and two had already been fixed when it was
written — an authority section that overstates itself is worse than none, and
this one understated itself for a week instead. Struck through rather than
deleted, because the third was closed by a build and the record of what it
cost belongs here. ROADMAP's U17-residuals entry carries the same three and is
stale in the same way; it is not this document's to edit.*

- ~~**The offer card still prints the flat `+5`.**~~ **Fixed in `68fdc7a`
  (2026-08-08)**, the very commit that wrote this section — its own message
  lists the fix under "three gaps the docs pass found in the build". Today
  `modsSummary(mods, opts)` takes `values`, and `renderOffers` passes
  `{ values: activeSystem().usesTotal }` (main.js). The paragraph was written
  from the audit and never re-read against the diff beside it.
- ~~**A held roll's log row still answers `?` in the total column.**~~ **Fixed
  in the same commit**, and *pinned*: the `held-roll` scenario asserts both
  halves — no `?` under a per-die lens, and a `?` that survives a switch to
  `dnd`, where a number really is being withheld. The row reads
  `!usesTotal ? '' : hidden ? '?' : entry.total`.
- ~~**A `4d6dl1`'s dropped die is invisible on the banner and the peek.**~~
  **Closed 2026-08-15** (ROADMAP §1). This one WAS live, and it was the last
  live half of GOALS' *Attributed math* — see **§7.42**, which is the
  authority for what a struck die looks like on a per-die surface. The gate
  was one line in the SOUL DEAL PROFILE, not in the renderer, which is why
  grepping the render sites found nothing: `renderOutcomeRows` prints exactly
  what `outcomesFor` returns, so `if (!p.counts || p.child …) return` hid the
  die on the banner, the verdict hero and the peek at once. *(The same shape
  as this section's own BRANCH ORDER lesson: the thing suppressing a value was
  not the thing a reader would grep for.)*

**What this leaves.** Step 6 — the LOOK — was taken in `68fdc7a` for U17's own
surfaces. §7.42's dress has NOT been seen rendered, and is named as owed
there rather than assumed here.

**Scenarios:** `per-die-read` (**smoke**) carries the whole contract — the
stake renders and the `✓`/`✗` does not, the verdict card's margin is exactly
`vs DC 15` with a `.stake-num` inside it, the lens re-reads in place when the
room switches to `dnd`, `#result-total` is both `display:none` **and** empty
under a held per-die roll while a totals lens keeps its `?`, and only the
Modifier section folds in the popover · `rim-word` (**smoke**) pins `± Modify`
under both systems and makes the TOOLTIP the thing that varies — no promise of
Modifiers where Modifier is the one folded section, and `Tweak` stays banned ·
`shared-roll` pins the flat modifier's attribution as *absent where nothing
sums, present and named under a totals lens, identical across tabs in both* ·
`meanings` unit asserts the fields are **gone**, not merely false
(`'usesMods' in sd === false`), and that `targetWord` is `Target` / `Difficulty
Class`. Every visibility assertion reads computed `display` / `offsetParent`,
never a class (§7.21's lesson).

**Looking caught a defect the suite could not**, again, in the commit that
shipped step 1: U13's "Save as pool…" was deriving its class by
string-stripping `revealClass` and came out with **no dress at all** — a
bright white browser-default button between a red Clear and a gold REROLL,
straight through HUE = ACT. Every assertion was green while it shipped; one
screenshot was not. (Fixed in the same commit: it wears the Reveal's quiet
steel.)
### 7.25 The profile library — the pick, the switch, the copy (2026-08-08)

*(Renumbered from §7.24 on the merge, 2026-08-08: the touch/stake pass landed
its own §7.24 above while this branch was out. Same collision the CUJ numbers
have — see [CUJS.md](CUJS.md) — and the same fix: the section that shipped
first keeps the number.)*

Design authority is [PROFILES.md §11](PROFILES.md#11-the-library--many-profiles-one-in-your-hands-2026-08-08),
which holds the model and the ten decisions; this section specifies the
surfaces. The governing sentence: **the store owns the pools, and the
profile in your hands IS the rack** — so switching is a pointer move, and
every surface below is a way of moving that pointer or of naming where it
points.

**A LIBRARY OF ONE SHOWS NOTHING NEW ANYWHERE.** This is how the pass
obeys *empty renders nothing* (§7.20) without arguing with it: a player
who never makes a second profile sees exactly the app they saw before.
`#profile-pick` is `hidden` until the library holds two, the mismatch
banner exists only while a mismatch does, and `At this table` is absent
until the table has something to offer. Every one of them is retired by
its own success, the property the invite chair established.

**① THE JOIN CHOOSER** (`#seat-mine` in `#name-modal`, above the prepared
seats). Your profiles **for this table's system**, most recently taken in
hand first, the last one wearing `.preselected` — the same dress `&as=`
already uses. `⚄ Random` is the last row, in `.seat-btn` with a dashed
border, and it is preselected when you have no profile for this system.

The block is **absent** when there is nothing to choose between and
nothing to deal. The existing `Join` button confirms: no second verb, no
wizard, no new phase.

**Picking one of yours shows no preview, and that is not a relaxation of
the preview rule.** PROFILES §9.2 (*preview-then-apply on every rack a
player receives*) exists because the `#g=` codec replaced a visitor's rack
sight unseen. Taking your own profile in hand receives nothing: both racks
are in the store, in one write, and the outgoing one keeps every pool it
had. A **prepared seat** is still somebody else's rack and still previews —
and since §11 what it applies is a **profile of your own** rather than a
merge into your rack, so the player who already had an 18-pool character
no longer ends up holding one 36-pool rack that is two characters wearing
each other's clothes.

**② THE PICKER** is `openRailMenu` — the app's one anchored-menu machinery
(viewport clamp, flip-above, arrow walk, focus-out close, already a rung in
the Esc chain and a term in `modalOpen`). Rows are `.idm-item`, the dress
every menu in the app wears; `.pm-head` is the only new recipe.

**Two anchors, and the second is not redundancy.** `#profile-pick` lives
in `#pools-head`, and §7.23 lets the player switch the Pools section off —
`#builder-panel.sec-off-pools` hides the whole region, which would strand a
head-only anchor and make R4's switch unreachable for anyone who collapsed
it. `#idm-profile` in the identity menu is the other, and it is **not**
hidden in the lobby: §7.20's suppression rule is that a surface speaking
about YOU keeps working while one speaking about THE TABLE must be absent,
and your profiles are yours with or without a table.

**Off-system profiles render disabled, not absent** — R5 without amnesia.
"Where did my fighter go" is answered by a greyed row carrying its system,
not by silence.

`#pools-head` gains a **third reason to exist** beside its existing two
(`.foreign` for a teammate's rack, and nothing at all otherwise): the
`.profiled` state, where it stands sticky over the shelves and names the
profile in hand. The system word appears **only when it differs** from the
table's — a label the player needs exactly when it is surprising, and
silence the rest of the time. `#profile-pick` deliberately does **not**
wear `.ph-tag`: that class is the read-only tag's own, and a second element
borrowing it made the head's selector ambiguous (caught by
`panel-anatomy`).

**③ THE LIBRARY LIST** (Settings → *Your profiles*) is where
manage-frequency work lives, for two reasons found by building the
alternative: a menu that closes on focus-out is the wrong container for a
rename field, and a 32-row list with a scroller is a panel wearing a
menu's clothes. Rows are `.pp-row` — the shipped grammar — with the name
doubling as the rename affordance, the system as a `.pp-tag`, `Use`
(disabled off-system), `Copy`, and a `✕` that is **two-step in place**: the
label becomes `Delete ⟨name⟩?` for three seconds and the second click
commits. That is Copy's own morph grammar used as a confirm, and it keeps
the promise that nothing modal locks the table.

Below it, **`At this table`** — the prepared seats and the teammates'
published racks, each one `Copy` away from being yours, absent when the
table offers neither. This is the surface R7 asks for, and it works
because the wire now carries *which* profile a published rack is and not
only whose.

**THE MISMATCH BANNER** is Tier G's `#profile-banner`, re-purposed. It used
to say *you are holding someone else's pools*, which a library makes
impossible. It now says the one thing that can still be true and
surprising — the profile in your hands was built for a different rulebook
than this table reads. **Nothing is broken when it shows**: a pool is
notation and a system is a render-time lens (goal 6), so the rack rolls
identically either way. Hence three exits, none of them a swap:
`Switch…` (opens the picker), `Read as ⟨system⟩` (re-binds *this profile*
to the table — for the player whose D&D fighter really is what they want
here), and `Keep` (says nothing more this session). Changing the *table's*
system is deliberately **not** a fourth exit: that is a room-wide act
(goal 10) and it belongs on the settings panel where every player can see
it, not buried in one player's rack chrome.

### 7.26 How a die leaves the table (2026-08-09)

*Joe: "The way dice disappear is not my favorite. Consider alternatives.
The speed is good but the effect is not my favorite."*

**The speed did not change.** `CLEAR_SINK_S` is still 0.3 s. Only the motion
inside that window did.

**What was wrong with the old one.** `sink` dropped each die 2.4 world units
straight DOWN and stopped shrinking at 0.65× — so a departing die left by
passing THROUGH the felt, and was disposed of by occlusion. It is the one
moment in the app where a die violates the surface it is standing on: goal 1
is real dice on a real surface, and the tumble, the settle and the whisk all
honour it. Worse, it reads as the failure it resembles — an object falling
out of the world. Frame-by-frame the mat plane slices the die in half on its
way down.

**`lift` ships.** It borrows the grammar the COLLECT whisk already
established (§7.7: a carry arc, one motion at a time). **The table has one
pair of hands — collecting carries a roll up and over to the shelf, clearing
carries it up and away.** Same pluck, two destinations. The die rises 1.15
units on an ease-out (`1-(1-p)³`) while shrinking on a slower curve
(`1-p^1.5`) all the way to zero. Two things fall out of that for free: the
shadow separates from the die as it rises, which is exactly what being picked
up looks like; and because the scale really reaches zero, nothing has to
occlude the die and no material has to fade — geometry and materials are
shared per die type (js/dice.js), so a fade would mean cloning a material per
departing die.

| style | motion | reads as |
| --- | --- | --- |
| **`lift`** *(ships)* | rise 1.15, shrink to 0 | picked up off the table |
| `fold` | no travel, shrink to 0 | taken off the board — quieter, the runner-up |
| `sink` | drop 2.4, shrink to 0.65 | pre-2026-08-09; falls through the felt |

All three stay in `CLEAR_STYLES` and switch with
`__diceDebug.setClearStyle(name)` — a taste call should be judgeable side by
side, and the retired one is also what makes the scenario honest: `dice-depart`
asserts `dy >= 0` across the window and then flips to `sink` to prove that
assertion can fail. `tools/steps/depart-and-key.mjs` walks the window under a
held clock and shoots a still per frame, so the comparison is reproducible
rather than remembered.

**The scale floor.** A mesh scaled through zero flips its winding and renders
inside-out for a frame; `stepSinking` clamps at 0.0001.

**Unchanged:** bodies still leave the physics world immediately (a departing
die must not deflect a later fast-forward); rolls cleared mid-playback still
defer to `pendingClears`; the shelf marker still rides its own `mesh: null`
sink record so its chip fade stays dt-driven.


### 7.27 Where a collected roll lives (2026-08-09)

*Joe: "Collected dice take up too much space… consider dropping the collection
phase altogether… The space is a problem. It wouldn't be so bad if not for
mobile." Then: "dig into C25 hard. Either find space or drop the feature
entirely."* The measurement is in [ROADMAP.md](ROADMAP.md) C25; the short of
it is that the shelf stopped fitting the mat three zoom tightenings ago and
the **second** collected roll already fused with the first. Joe's call on the
two open questions: the felt keeps **nothing**, and Stage 1 lands on the
existing roll log before the bottom strip is designed.

**The felt holds the live roll and nothing else.** Collecting a roll takes its
dice away with the same departure a clear plays (§7.26's lift). Collect and
clear are now one motion and differ only in bookkeeping: a collected roll
keeps its verbs, a cleared one does not.

**The record is the roll log.** It always was — `renderPeek` has always
rebuilt its whole card from `log.find(...)`, and the server's `collected` is a
sequence number on a log entry, never a position. What changed is which
surface admits it.

**A collected roll's ROW is its door.** The contract inverts from the marker's:

| | the marker (retired) | the row |
| --- | --- | --- |
| at rest | draws nothing — the cluster was its own presence | says which roll it is |
| where | projected above its slot on the felt | in the roll log |
| reachable | `role=button`, a tab stop, an `aria-label` written per render | the same three, on the row |
| opens | the peek card | the peek card, unchanged |
| tweak | right-click, or a long press (U12's iOS twin) | the same two, delegated on the list |

The row wears `.collected` — a hairline gold rule down its leading edge,
warming on hover and focus. Quiet, because the row's own text is the thing
being read; visible, because unlike the cluster it stands for nothing else.

**The card stands BESIDE its row**, never over it: the row is what the pointer
rests on, and a card covering its own anchor fires `pointerleave` the instant
it opens. Right of the flyout where there is room, left otherwise, clamped on
screen either way. Closing the log closes the card — its anchor just left.

**Opening a card opens the log.** In the UI that is already true (the only way
to reach `openPeek` is to be on a row), but the keyboard path, the tweak
popover and `__diceDebug.peek()` can all arrive with the panel shut, and a
card with no anchor renders nowhere.

**What this deleted:** `canonicalDiePose`, `clusterPoses`, `spawnShelvedDie`,
`placeCluster`, `reflowShelf`, the whisk, the marker pills, the under-glow
rings, six of the eight `framingPoints`, and `revealShelvedRoll` — a collected
roll has no dice left to turn over, so revealing it is purely a surface act.
Also gone: the invariant that no shelved die may stand on the active felt,
which is what `clusterPoses` existed to guarantee.

**Still open, and named rather than quietly skipped.** With the log closed, a
collected roll has no ambient presence at all — the ≣ rail button carries an
unread count in its title and nothing else. That is Stage 2's job, and Joe's
sketch for it stands: *"previous N rolls as panels across the bottom… show the
roll log briefly and then collapse it into a UI element that expands it… UI
that goes beyond basic buttons and has some elements that visually fit
together."* U23's token layer is the vocabulary; C13 and U20 are about this
same surface and should be folded in rather than solved twice.


### 7.28 Nothing about a finished roll is on a clock (2026-08-10)

*Joe, after §7.27 took the shelf off the felt: "It seems weird to make the
dice disappear after just a few seconds. I think we should leave them on the
table until another roll is started."*

**He was right, and the fix is a deletion.** The tidy-away clock collected
your finished roll after 3 s, and its own rationale was *"tidies itself to the
shelf"* — it had a DESTINATION. §7.27 deleted the destination, and what was
left was a countdown that erased your result and left an empty table. The
hover-hold bolted onto it was already the tell that three seconds was short
for reading.

**The felt-clearing job it was hired for belongs to someone else and always
did.** The SERVER collects everything on the felt as part of the next roll's
arrival beat — `collectEntries(room, room.log)`, every roll, whoever threw it,
before the incoming dice land, with `soloAutoCollect` mirroring it offline.
"The felt belongs to ONE roll" is enforced there, authoritatively, with no
race between clients. The client clock never added to that guarantee; it only
decided how long you got to look.

**One gesture was doing two jobs — and then the second job was rebuilt as its
own clock, wrongly.** Tidying the DICE and retiring the CARD were the same
timer. The dice came off it first ("leave them on the table until another roll
is started"), and the card was left on 7 s of its own, hover-held, on the
reasoning that it is chrome. **It is not chrome.** Joe, one day later: *"It
disappears and there is no obvious way to get it back besides open the log. I
expect a core CUJ will be to do a roll and then spend minutes analyzing the
result to incorporate it into actual gameplay."* The card is the READ — the
per-die breakdown, the sources, the meanings, the pool key — and the dice on
the felt do not carry any of it.

So there is no clock, and **there is no right value for one**: nothing between
7 s and "minutes" is a duration, it is a longer ambush. The hover-hold was the
tell twice over — a timer that has to detect reading and stop is a timer that
should not exist. What retires the card is what retires the dice: the next
roll arrives, or you dismiss it. A hidden roll's card is unaffected and always
was — it carries Reveal, and an uncollected roll has no `.collected` log row,
so it is the only door.

**What the clock was protecting is real, and is a layout problem.** On a phone
the card is a serious share of the screen, and "dismiss it to see the felt" is
a worse deal there than on a desktop. That belongs with **C25 Stage 2**'s
bottom strip. A countdown was never a fix for it: it took the read away from
everyone, on every device, to buy back space on one.

**What got simpler.** The collect clock carried a retry ladder — `lastRollActionable`,
a `rollStates` re-check, a 60-try bound — because a collect had to wait for a
roll to be settled and still actionable, and a clock that fired mid-tumble
used to strand the roll forever. The card is already on screen. There is
nothing to wait for and no ladder.

**Escape hatches unchanged:** the corner ✕, Esc, and the card body still clear
on demand — the card always had a manual exit, which is most of why the timer
was redundant. `setAutoCollectMs` and its replacement `setBannerRetireMs` are
both gone; `__diceDebug.dismissBanner()` is what tools and scenarios use to
put the card away, because "hide it now" is what they always actually wanted.

### 7.29 How long a throw takes to watch (2026-08-10)

Joe, describing what he sees: *"The dice often don't land with a full face
flush against the table surface immediately (due to collisions between
dice…) and there is a very slow, very shaky process by which the dice then
slide and wiggle-move until they are stable. It can take quite some time and
it's super awkward to watch."* He offered a trade — glitching dice, slow
wiggle, or dice repelled by invisible boxes slightly larger than themselves —
and picked the third.

**The trade was not available and did not need to be.** The colliders are
exact convex hulls built from each die's own render mesh (`buildShape`,
js/dice.js) — not boxes, not spheres, no inflation. Nothing overlaps and
nothing repels. Growing them would have made contact *more* visible, not less,
because the wiggle was never a shape problem.

**Most of the tail was not dice moving.** `playRoll` fast-forwards the whole
throw offline and plays the keyframes back, and the played length is decided
by one number: the frame the LAST die stopped. A die judged **cocked** was
refused a freeze, so it stayed dynamic — and then just sat there while the
clock ran to `SETTLE_CAP` = 9 s. Across 36 measured throws, **15 of the 17
dice that reached the cap were motionless when it fired.** 20d6 capped every
time. What you watched after the first second was, largely, a still table.

**The cocked bar reads like a fairness rule and is not one.** Face correction
rotates each die's target face to exactly world-up whatever the physics did,
so `cockedDot` never touched a VALUE. All it decided was whether a die may
rest against its neighbour the way dice actually do. At 0.82 (~35°) it refused
constantly; at **0.6** (~53°) it never fires in normal play and survives only
as a valve for a rest no die could hold. That also gives back
`lastLanding.timedOut` — the ceremony's "declined to resolve" signal — which
had been firing on 13 of 16 big rolls.

**The felt is still frictionless, and that is a finding.** The contact numbers
are generic bouncy-dice values with cannon's 0.01 default damping left in —
i.e. none. A proper felt tuning (grip 0.6, bounce 0.15, damping 0.1/0.14) was
measured a *large* win: Soul Deal −43%, 20d6 −1.63s, and 20–38% less shake.
**It is not shipped, because it piles.** On this mat sliding apart is HOW dice
separate — `spawnDie` spreads a throw by `min(TABLE_W - 4.4, count × 2.6)`,
and at `medium` that clamp bites hard (TABLE_W 8.6, so six dice start 0.84
apart when the spacing wants 2.6). Dice were relying on bounce and skid to fan
out. Take that away and they stop where they land, on each other: at `close`,
6d6 went from 17% of dice piled to 33%, and from 3 throws in 10 that piled
nothing to 1. `dice-land-flat` caught it — 3 failures in 13 runs against 0 in
8 on the parent commit — which is the C24 floor doing exactly its job.
Halving the damping did not halve the piling. It is **ROADMAP C30c**, and it
wants a wider spawn first.

**The tail cut is the backstop.** A die force-frozen at the cap is credited
with its last MOVING frame, not the cap, and the keyframes are truncated
there — so the pose playback ends on and the pose correction reads are the
same object, for a timed-out die as for a frozen one. It never lengthens a
throw, and it only ever reclaims time from a die that had stopped.

What shipped, measured **paired** — the same 16 seeds through every candidate,
via `__diceDebug.throwSeeded`, because the first unpaired sweep concluded the
materials "barely move the tail" and that was variance talking:

| pool | before | after | caps before → after |
|---|---|---|---|
| 1d20 | 1.37s | 1.37s | 0 → 0 |
| Soul Deal (2d8+1d4+1d6) | 2.57s | 2.26s | 3/16 → 1/16 |
| 4d6 | 2.06s | 2.04s | 0 → 0 |
| 8d6 | 2.42s | 2.40s | 0 → 0 |
| 20d6 | 7.26s | **6.25s** | 13/16 → **4/16** |

The honest summary of that table: **the felt's own worst case is fixed and its
typical case barely moved.** What C30c would buy is the typical case.

**Duration is not the complaint, though; "shaky" is — and the shipped subset
does not fix that part.** `settleProfile().shake` is the share of frames in
the 0.6s before a die stops where it REVERSES direction; dithering reverses
constantly, rolling to a halt does not. (Anchored to each die's own settle
frame. Anchored to the roll it is confounded by duration — the first version
reported a throw that got 43% *shorter* as 143% worse, because "the last
second" of a 1.5s throw is the tumble.)

| pool | 1d20 | Soul Deal | 4d6 | 8d6 | 20d6 |
|---|---|---|---|---|---|
| shake, shipped subset | 0% | −2% | 0% | +4% | +3% |
| shake, with C30c felt | **−29%** | **−20%** | **−27%** | **−38%** | **−29%** |

**The reversing is caused by the missing damping, and only the damping fixes
it.** So what shipped shortens the worst throws and leaves the dithering
alone. Say that plainly rather than let the duration table imply otherwise:
the visible wiggle is still there, it is C30c, and C30c is blocked on the
spawn spread, which is blocked on the mat.

**What is still open.** 20d6 can still reach the cap with dice genuinely
tumbling; that is real physics and a smaller `SETTLE_CAP` would truncate real
motion, so it is left alone. Pinned by `settle-tail`, which has to test the
two halves separately: the rest rule made the tail cut go quiet on ordinary
throws, so the cut is priced under the old 0.82 bar where it still bites.

*Superseded in part by §7.30 (2026-08-11): the "only the damping fixes the
dithering" conclusion did not survive the next measurement pass — the
dithering is now ENDED by a better rest test rather than damped away, and the
caps column below went to zero outright.*

### 7.30 The throw, resolved (2026-08-11)

Four defaults flipped together, each measured alone and audited as a set;
this is the section to read for what a player gets today.

**1. A die is done when it stops going anywhere.** The freeze test is now
displacement-based (`SETTLEGATE 'displacement'`, Lengyel's three-point test):
three tracked points per die, and if none travels more than 2% of a die-width
over the stillness window, the die freezes. The old velocity bar could be
held open forever by a die dithering in place — it leaned on cannon's sleep
to zero velocities under it. Measured at the flip, same 16-seed families:

| pool | duration | caps |
|---|---|---|
| Soul Deal | 2.26s → **−35%** | — |
| 4d6 | −8% | — |
| 8d6 | −4% *(tidy-up spends most of this pool's −28%)* | — |
| 20d6 | 6.58s → **−40%** | 6/16 → **0** |
| all pools | | **7 → 0 capped throws** |

The 9-second dead table is gone: not one die in 80 paired throws ran out the
clock. Worst end-of-film motion at a freeze: 0.0200 die-widths, against the
old bar's 0.0279.

**2. Cannon's sleep is off, and every roll replays.** Sleep was the entire
replay drift (C31): master re-simulated 4 of 8 long 20d6 seeds as a visibly
different throw on a churned tab. With `allowSleep false` the same families
replay byte-for-byte, 16/16 and 8/8, pool-isolated, 900 throws of churn.
Two players now watch the *same film*, always — sleep-off is affordable only
because the displacement test replaced the retirement job sleep was secretly
doing (alone it costs soul +31% and caps 7→11; paired, both numbers invert).

**3. Tidy-up is on** (`NUDGE.pileScale 1.05`, Joe's call): a die that stops
above its rest ceiling — perched on a neighbour — is refused and hurled
again, sharing the cocked die's budget of 3. Cost accepted with eyes open:
~3 visible tidy hops on a 20d6 throw, and most of 8d6's duration win spent.
Buys `close` 6d6 back inside the pile gate (flat throws 8/40 versus the old
6/40). The honest ledger for the one pool past mat capacity is ROADMAP C33:
20d6 at `medium` ends with +6 piled dice per 160 — against 26 cap-outs and
~4 s of dead time removed on the same seeds.

**4. The projector runs Joe's curve** (`TEMPO flight 0.8 → settle 25`,
ramp 2.0 s, anchored at the last instant any die still travels faster than
8 u/s — a pure function of the baked film, so every client changes gear at
the same frame). Re-dialed 2026-08-12 by a second live A/B round: the first
shipped gear (settle 2.2, ramp 0.4 s) was superseded by a far higher settle
speed made watchable by a much longer glide — the settling tail is
effectively skipped, and the two-second ramp is what hides the cut. Uniform
speeds were A/B'd and refused twice; the shipped shape is the hurl a touch
*slower* than raw and the wait collapsed once the throw is down. Impact
clicks are gated in film time (`CLICKGATE 'film'`) so the sound survives any
speed — measured: zero loud clicks lost across six display/tempo configs.

**5. No die is born inside a wall** (added 2026-08-14, ROADMAP C28 ①). A throw
lines its pool up along one edge, and the clamp that keeps the outer dice off
the walls was taken off `TABLE_W` on all four sides — including the two that
spread along **z**, where the mat is 6.7 rather than 11. A hand-written
`offset * 0.5` had been standing in for the ratio since a much larger mat.
Measured over 144 paired throws: **16 of them started a die through a wall
plane**, worst 0.29 units in, and the solver shoved it out on frame zero. Each
die is now clamped into the room its own hull leaves. The general-looking fix —
re-deriving the whole line off `TABLE_D` — was measured and **refused**: it is
equally legal and it piles, because `close` then has 0.8 units of legal spread
and six dice start on top of each other (20 → 17 flat throws in 24, against 21
for the clamp). Nothing else moves: the jitter is drawn before the clamp, so
every spawn that was already legal is bit-identical and the two hand-picked
flat seeds `pile-refusal` pins still land flat.

**What did NOT ship, and why it never will in this form:** restitution
deadening (fixes shake, but glides on 8d6, piles, and — pre-sleepoff — broke
replay), gated damping (zero shake benefit, drifts alone), raised sleep
thresholds (stops dice mid-motion, drifts), the floor magnet (the naive form
of an engine restitution threshold; failed every gate including its own),
uniform tempo (taste), and a wider spawn spread as a cure for the frame-zero
contact storm — that storm was already capped in `5a5a8ce`, and measured today
`firstFrame` is 1.5–10.2 contacts with every spread formula inside the others'
noise. The full pricing history is ROADMAP C30a–e; the engine-swap reserve
position is C32.

### 7.31 The tower, and what a poured roll looks like (2026-08-12; second tower 2026-08-13; third 2026-08-14)

A **Tower** picker joins Felt in the settings modal's "Everyone at the table"
section: *None* (default), *Heartwood*, *Bastion* and *Black Anvil*. Room-wide,
like felt and zoom, and for a stronger reason than either — the tower changes
the FILM, so a table where one player has it and another does not is two
different rolls.

The sub-line is `dice tumble down through it instead of being thrown`, and
the option tooltips say what each is rather than selling it (house tone,
§5): *None — dice are thrown onto the felt by hand* · *Heartwood — a wooden
tower at the back of the table; dice pour through it* · *Bastion — a stone
turret; dice rumble through it* · *Black Anvil — a cooling forge chimney; dice
fall through it ringing*.

**A picker, not a switch.** The stored value is a tower id. That bet paid
twice: Bastion (2026-08-13) and Black Anvil (2026-08-14) each cost a skin file
and a registry row, and the picker grew a chip each time with no change to the
picker. A checkbox would have to be renamed the day it stopped being a yes/no,
and renaming a setting people have already set is a cost paid later for a
saving taken now. The one thing that does NOT scale for free is the row's
LAYOUT, so `tower-roll` now measures it: at four chips every chip is still
laid out with real width and the group still does not scroll sideways.

**Towers are a FAMILY, and the family resemblance is the point.** Each is
named for a die in a theme house (Heartwood ← Wildwood, Bastion ← Classics,
Black Anvil ← Emberforge) and each is built to the same house visual rules —
two-tone materials, seeded canvas bakes with Sobel normals, beveled arrises, a
baked ambient-occlusion pass, and no new lights. What differs is the
archetype: Heartwood is a craftsman's hobby tower in walnut and cherry;
Bastion is a weathered granite turret with sandstone dressings, a crenellated
crown and a gate you can see into; Black Anvil is a foundry stack, a
soot-blackened block with a barred furnace grate glowing over the casting
channel, a dark fire-brick chimney strapped in oxidised bronze, and a flared
crucible lip. All three frame the same doorway and deliver dice to the same
tray.

**The one glow in the house (2026-08-14).** Black Anvil's grate and its shaft
vent are the first and only lit-looking thing on any tower, and they are not
lit: they are an emissive texture on ordinary material, baked from the same
seeded canvas pass as every other surface, with no light added and no bloom.
It is deliberately dim — banked coals with most of the bed dead, not a
furnace running. The rule it establishes for the next model is narrow on
purpose: a glow must be a BAKE, it must live inside a recess, and it must not
be the brightest thing on the table.

**…and it became the FAMILY TRAIT (dressing pass, 2026-08-11).** Every tower
now carries a warm focal light: Heartwood a cresset hanging off its right
corner post, Bastion an iron sconce beside the arrow loop, Black Anvil the
grate it always had. Same rule as above — the fire is a bake — plus one
engine-owned PointLight at the coals per tower, because an emissive map
shines and cannot illuminate, and a fire that throws no warmth on the post
beside it reads as a sticker. A lit lamp is the difference between furniture
somebody uses and furniture in a catalogue.

**Every tower is DRESSED (2026-08-11).** Two to five props each, one bold and
the rest quiet, and every one of them says something: Heartwood has ivy up
its shaded corner, moss where water sits, a hoist beam with a slack rope, one
pale replacement board and two sprung eaves boards; Bastion flies a gonfalon
a third of the way across its battlement, hangs two shields with DIFFERENT
devices, has lost one merlon and gained one fresh mortar patch, and sheds
water out of its crenel gaps; Black Anvil smokes from the crown, keeps a
hammer and a pair of tongs on a rail beside the fire, a heap of coal at one
foot, rust running down from every band and one band somebody has replaced.
The pattern is deliberate and it is the house rule for the next model:
**one repair and one failure, never centred, never mirrored** — a repair says
somebody maintains this, a failure says somebody has not got to that, and the
two together are what put a date on a building. The geometry, the budgets and
the traps live in [docs/TOWER.md](TOWER.md) under DRESSING.

**Bastion's arrow loop is a recess again (2026-08-11).** It had been a
picture frame since the day it shipped — a dark slot sunk 0.012 behind a
granite panel that covered it, so the loop read as a sandstone surround with
plain wall inside. The facade is cut around it now and the slot is the
backmost surface in the hole.

**What a poured roll is.** Dice appear above the tower's mouth, one every
0.12–0.2 s — a pour, one motion of a hand, not a queue. Each vanishes into
the hood, knocks around inside for 0.5–1.6 s where you can hear it and not
see it, and comes back out of the doorway already rolling, at a shallow
angle that skips it across the felt. Everything after that is the table you
already know: the same settle, the same face correction, the same chips,
card and log line.

**Measured** (`tools/steps/tower-pour.mjs`, headless, the shipped socket):

| pool | film | bakes | dice delivered |
|---|---|---|---|
| 1d20 | 2.4–4.6 s | 1 | 1/1 |
| attribute + skill + motivation | 3.5 s | 1 | 3/3 |
| 8d6 (ten seeds) | 3.7–5.1 s | 1 | 8/8, every seed |
| 20d6 | 6.7–7.1 s | 1 | 20/20 |
| 40d6 | 25 s | 5 | 40/40 |

Forty dice through one chute takes twenty-five seconds and that is honest
rather than fixable: it is forty entries staggered, forty transits, and
forty exits that may not overlap. The projector's curve compresses the tail
of it like any other roll.

**What the deeper mat costs the frame.** Socketing spends 4.5 units of mat
depth, so the framing ladder has more to fit and sits further back. Measured
over 36 settled 8d6 throws (a 1500×950 desktop with the rail open, six seeds
per cell, tower on and off at each zoom):

| zoom | die span, no tower | with the tower | dice framed |
|---|---|---|---|
| wide | 144 px | 134 px (−7%) | 8/8 every throw, both |
| medium | 185 px | 167 px (−10%) | 8/8 every throw, both |
| close | 237 px | 196 px (−17%) | 8/8 every throw, both |

Nothing is dropped — the ladder never fell off its top rung in any of the 36
— and the cost is dice a tenth smaller at the default. A pour also spreads
further forward than a throw, so a die can end up kissing the frame's edge
where a thrown one would not; the die is still framed, and this is the
honest price of the room the tower asks for.

**The camera moves during a pour, and it is the only roll that does.** Act
one eases to a low frontal eye on the tower as the film starts; act two
hands the frame back to the framing ladder the instant the FIRST die exits,
so the camera is already looking down at the felt when the spread lands
rather than chasing it. Both are refused under `prefers-reduced-motion`,
under which the ladder alone decides the eye exactly as it does for a throw.
This amends camera ruling ① and the amendment's edges are written next to
the ruling itself (`CAM_EASE_S`), not only here.

**Each tower has its own knock (2026-08-13).** A registry row may carry a
`clunkVoice`, and the knocks you hear while a die is out of sight are voiced
by the tower rather than by the dice: Heartwood a dry wooden `clack` with
almost no tail, Bastion a lower `thud` that rings on in the shaft, Black Anvil
a metallic ring with the longest tail of the three. Every model with a skin
must bring one and no two may be the same — two towers that sound alike are
one tower twice. It is the
one thing besides the model's shape that a skin gets to change — the knock
TIMES are baked from the seed and are the same for every tower, so this can
never make two players watch different rolls. An ordinary landing still
sounds like the dice, not like the tower.

**What did NOT ship.** **`tower` in the portable YAML** `table:` block, which
carries name/felt/system/zoom — a prepared table cannot yet arrive with its
tower already up. This is now the only outstanding item on the feature, and
with three chips in the picker it is the one a prepared table most obviously
wants.

### 7.32 What a throw sounds like (2026-08-12)

Full spec in [AUDIO.md](AUDIO.md); this is the surface a player meets.

**The room is felt over wood, and it is quiet.** The default impact voice is
`felt` — a soft lowpassed knock at 700 Hz. It used to be `click`, a bandpass
at 2500 Hz, which sits above the wood/metal perceptual boundary and is
therefore the casino sound; it was what nearly every roll on this table made.
`click` is still in the registry for genuine die-on-die and for bright sets.
A contact below strength 3.5 is voiced *duller and longer*, not merely
quieter, so a soft hit differs in hardness rather than in volume.

**A throw now has a middle.** While a die is on the felt and turning it
carries a continuous low grind whose rate comes from the film — face-clacks
below about 20 Hz, a pitched grind above, one parameter, no crossfade. It
follows the tempo curve, so the sound never detaches from the picture. All
the rolling voices together are capped at a level well under a single
landing: **a twenty-die pile can never out-shout its own landing.**

**Each die dies down instead of stopping.** Landing fires a short geometric
run of taps — about five, over 145 ms, each quieter and duller than the last
— and then the die is silent. The taps are scheduled from the roll's seed, so
everyone at the table hears the same rhythm.

**Dice come from where they are.** A contact pans toward the side of the mat
it happened on, capped at 0.6 — a table a metre away subtends about ±25°, and
a die hard-panned beside your ear is a cartoon — and the far edge of the mat
is a few dB quieter than the near one. A baffle knock inside a tower is a
sound and not a place: it comes from the tower mouth, and it is coloured by
that tower's shaft.

**The switch is one switch.** Sound off silences everything — impacts, the
grind, the taps, the shaft, the room bed — because every source in the graph
passes through one gain. Nothing is inferred from the motion settings: a
player who asked their OS to stop moving things did not ask for silence.

**Nothing about the sound tells you whether you did well.** No stings, no
jingles, no rising pitch on a streak. The number carries the outcome.

**The room tone is off by default** and lives behind its own switch in
Settings → Just you, beside Sound. It is device-local mood, not table state,
so it does not ride the portable file and no teammate inherits it.

### 7.33 The air over the felt (2026-08-15; Heartwood-only + Joe's dials same day)

**Dust drifts in Heartwood's lamplight.** The mote layer is a tower family
trait (`TOWERS[id].motes`), not a room fixture: an old wooden tower sheds,
so with Heartwood socketed and the mood on, two hundred very faint warm
specks (Joe's live-dialed peak 0.07) fall slowly through the room-wide
spread of the lamp's cone. The bare felt, Bastion's stone and the Black
Anvil's forge-hot chimney keep clean air. Each speck breathes on its own
slow twinkle and fades out before it lands; nothing pops in or out. The
field is deterministic (one fixed seed), so every client at a table watches
the identical air, and it freezes with the rest of the world under a held
clock. The dust rises and settles through the tower socket — swap the tower
and the air swaps with it. Turning the mood off stills the room completely.
Layer switch and dials: `__diceDebug.motesTune({on, count, size, ...})`.

### 7.34 The venue — the table travels (2026-08-15)

**One choice stages everything.** Settings → Everyone at the table now
leads with **Venue**: The Table (the grounded room), Moonrise Glade, or
Foxfire Hollow. Picking a fantasy venue swaps the whole staging at once —
ground, horizon, mist, moonlight, the vacated faerie moot, wisps — and the
felt, tower and dice-set pickers leave the panel while it is active
(GOALS goal 13: a venue must never be assembled into incoherence one
dropdown at a time). The tower comes down in the same breath, in the same
settings write. Picking The Table brings the room — and its pickers —
back exactly. Room-wide like the tower; late joiners land in the venue
the table chose. Rolls are unchanged in every way that counts: same
physics, same films, same values on every client — the venue is scenery
with doctrine (GOALS goals 14–15), not a rules change.

**W2 (2026-08-13) upgraded the glade room's fidelity in place.** What a
player sees from the resting eye: a moonbeam column landing where dice
resolve, a pale mist band the treeline and the tower silhouette against,
mossed ground with detail concentrated in the lit clearing, the vacated
moot on the left flank with its gap facing the table, and a mirror pool
holding the moon's broken glint on the right. Placement law: glade props
stand only where no die can rest and no tower stands — beyond the back
wall at every zoom, outside the tower envelope — asserted by `venue-set`
off `venueInfo().stage`, so scenery can never crowd a result.

**W4 (2026-08-13): the venue deals the dice.** While a fantasy venue is
active every roll is MADE with the venue's set — Moonmoot Witchlight
(THEMES.md §10), staged at roll creation so the roll record carries it
and every client, replay and late joiner agree for free. Your own set is
never rewritten: it resumes with the room, and dice already on the felt
keep the skin they landed with (a roll is a record). Prospective
surfaces — palette tiles, tray, pool strips — preview the staged dice
while the venue stands. The set takes no chip in any picker
(`venueOnly`): offering it à la carte is the incoherence goal 13 exists
to prevent. Proof: `venue-dice`.

**W2b–W2c (2026-08-13): from set pieces to one scene.** Joe's two
verdicts ("good set pieces… the scene lacks integration"; "an item set
on a table, not a stump that grew out of the ground") drove the
composition law (docs/VENUE-COMPOSITION.md, rules 1–13, normative per
GOALS 14) and its application: the stump grows its ground (round 6 —
root fingers, moss creep, the delivery ramp clad as a root tongue; the
machine may not show), the pool sits IN frame with palette-
owned water value, a scenery tier ties the flow (fallen branch, bank
stones, a foreground corner wing), and the ground answers every base
with soil. A venue palette flip re-dresses the standing tower in place
(`towerReskin` — visual-only; the film never moves), and venue towers
nearly silence the grounded room's env so baked palette colors read as
baked. Proofs: `venue-set` (placement law + scenery tier + cross-flip
re-dress, all off the stage contract).

**The earth berm is gone (2026-08-14), and what it was hiding is fixed
properly.** Round 6 put a bank of earth over the delivery ramp; Joe, on
round 8: "has a good slope down on one side but has a shelf on the other.
It looks kinda silly… don't rely entirely on the mound for dice control",
and then "just delete it now." He was right three times, and the third
time is why it is deleted rather than tuned. The mound was doing four jobs
— the visible floor under the dice, a ceiling keeping exiting dice clear, a
LID over a hole beneath the ramp, and a bank of earth — and no shape can be
all four and also look like anything. The shelf was job two: where the
clearance cone ran under the mound the surface simply BECAME the cone, dead
flat, meeting the mound again in a crease. The hole is what actually held it
there, and the wood closes it now with a 0.04-wide window whose sill must
land above the ramp crest (1.046) and below the throat floor (1.0875) — a
clamp, not a lift, because the threshold's rag wanders ±0.05, wider than the
window. The stump still grows its ground; it no longer grows a machine part.

### 7.35 The venue tower — Hollow Bole (2026-08-12, W3)

**A venue tower has no chip.** `hollowbole` is a fourth row in the tower
registry and the first one a player cannot pick: it carries `venueOnly`,
`renderTowerPicker` skips it, and it goes up because the Moonrise Glade or
the Foxfire Hollow went up. That is goal 13 applied one level down — a
fantasy venue *replaces* the à-la-carte pickers, so offering its own tower
beside Bastion would be re-opening the à-la-carte menu the venue exists to
close. It is a capability rule nowhere: `setTower('hollowbole')` works, the
server accepts the id, and the pour is the same pour. Only the CHIP is
withheld.

**What it is.** A rotted hollow trunk, one model under two skies: the moot
of foxfire caps around the broken crown, three shelf brackets climbing the
shaded flank, and — the one warm thing in either venue — a tiny lit door
0.24 × 0.40 in the root buttress beside the exit, with a real ember light
in front of it so the warm falls on the apron a die comes down. Nothing in
the skin is a colour: every hue is read from the venue's palette at build
time, and the emissive tiers are authored as `target ÷ the hue's own linear
luminance`, so the two skies come out at the same VALUE and differ only in
colour. Nothing on it blooms, by construction — an always-on bloom source
would disable the post-stack bypass for the whole app.

**The shape shipped 2026-08-13, and it is the app's first BAKED model.**
The owner's reference — a broken stump: stocky ~2:1, one ragged torn wound
opening into black, five uneven splinter spires (tallest never centered),
six buttress roots gripping the ground, pale barkless fibre with the life
painted on — is now a forge-baked GLB (`tools/forge/recipes/hollowbole.py`
→ `models/towers/hollowbole_{moonrise,foxfire}.glb`), two palette variants
from one deterministic bake with a SHARED geometry digest (one solid, two
paints; palette is a bake input because COLOR_0 is baked data). It rides
the TOWER_CORE v2 portal contract (docs/TOWER.md): the model declares its
mouth (rim 9.40, clearR 2.20) and its doorway (near-classic sill), and the
engine derives the core around them. The interior is its own sealed dark
throat — a liner deep inside the trunk, so the vanish stays invisible from
every shipped eye without a lid over the crown. (For two days there WAS
something over the crown: a black curtain built to satisfy an occlusion
band that rode above the mouth. Joe saw it in a frame — "I don't think we
need the black cylinder visibly sticking out the top of the stump" — and it
turned out the band was wrong, not the model. The band came down to a
despawning die's top, the curtain went under the skyline, and the vanish is
still 99/99 at all six eyes. docs/TOWER.md carries the arithmetic.) The
swappable-function seam did exactly what it promised:
the moot, the shelf brackets, the lit door and both palettes survived the
shell swap unchanged, placed through a surface descriptor now synthesized
by raycasting the loaded mesh (`js/towerglbshell.js`) — and the θ
convention the old shell inverted is fixed, so the moot gap finally faces
front-left as authored. Four review-gated bake rounds; the battery:
fit CLEAN, occlusion 99/99 shaft+cowl at all six eyes, probe 6/6, pour
29/29, tower tag 8/8.

### 7.36 The glade is inhabited (2026-08-13, W5)

The venue's third register, after the room and its weather: **the things
that live there.** A glade that never moves is a diorama in a case; what
W5 adds is a FIELD of fireflies that says the place is alive, and a small
WISP PROCESSION — one bright lead and three followers — that says
somebody lives here. They keep a route: in from the mist behind the moot,
along the ground's own moss trail, past the tower's root flare at their
nearest approach, across to the pool's bank and home through the back
band. It is the eye's own circuit, walked.

And the vacated moot gains **visitors**. The ring stays what it always
was — an interrupted moot, one gap, one fallen cap still lit — but now a
pulse travels round it seat by seat, the way a word goes round a circle,
the fallen one answering out of turn; and when the procession is standing
in the ring, the whole thing lifts. The faeries were never modelled. They
are the wisps, and the moot is in session when they are there.

**The glade minds the table**, and that is the part that matters at a
game. Throw, and the life steps back: the fireflies dim, the ring settles,
the air empties, because for those two seconds the dice are the only
event in the frame. Let them come to rest, and it all comes back out —
slower than it left — and drifts toward the clearing to look at what you
rolled, without ever crossing over the felt. On a critical the ring runs
one fast lap and the wisps bloom once, and then it is night again.

Nothing here can ever sit between you and a result: no living thing
crosses the dice box, at any instant, by construction rather than by
care. That is [VENUE-COMPOSITION.md](VENUE-COMPOSITION.md) rule 14, and
`venue-life` holds it over every member rather than over a sample.

### 7.37 The settings panel — four destinations, not one scroll (2026-08-14)

*Joe: "Let's fix the setting panel. It's ballooned into chaos. Please rethink
the UX from first principles and define a new organizational structure better
aligned with all features and then implement."*

**THE DEFECT, MEASURED.** 45 controls in a 320px column that scrolled
**1004px inside a 647px window** — 357px of overflow before anyone had done
anything. Five headings, one of which ("Felt") was a section heading
pretending to be a peer of "Just you" while actually being one control inside
the table's staging.

**And the count was not the problem.** THREE KINDS OF WORK shared one scroll:

1. **flipping a switch** — Sound, Room tone, numbers on dice. Seconds, this
   device, set once and forgotten.
2. **staging the table** — venue, felt, tower, system, name, zoom. A decision,
   and everyone at the table sees it.
3. **managing belongings** — a 32-row profile library and a text tool with
   seven buttons. Minutes, a workspace.

The most common job, (1), required scrolling past a YAML editor to reach a
toggle. That is what "ballooned into chaos" is made of, and no amount of
re-labelling one column fixes it.

**THE FIRST CUT IS BLAST RADIUS**, because "does this change the game for
everyone?" is the question that must never be ambiguous — it is the same
concern UX-AUDIT E4 raises about the change note that says only "Alice changed
the table" for a system flip that reinterprets every result. **The second cut
is kind of work.** Together they give four destinations and, more importantly,
one unambiguous answer to *where does a new control go*:

| destination | who it changes | what lives there |
| --- | --- | --- |
| **Table** | everyone here | table name, rolling system, mat zoom |
| **Staging** | everyone here | venue → (felt, tower) |
| **You** | this device | sound, room tone, numbers on dice, dice set |
| **Your stuff** | your belongings | the profile library, `At this table`, export/import/file |

**THE RULE, for the next ten features:** a control goes where its blast radius
says; if it needs more than a row, it goes in Your stuff.

**The bar's ORDER is the blast-radius reading.** The two room-wide cells come
first and together, the two personal ones after — so the split into four does
not cost the structure its first principle. It is a `.seg` (the app's own
segmented control, §7.23's grammar) with `role="radiogroup"` and
**aria-checked**, not aria-pressed: these cells are exclusive, and U22 settled
that spelling. The stylesheet was taught **both** spellings in the same commit,
because naming only aria-pressed is exactly the defect `tower-roll` records
against the zoom picker — a chosen radio cell painted identically to the
others, for as long as one existed.

**Why staging is its own destination and not a section inside Table.** It was
a section, and Table then stood 710px tall and overflowed a 459px window by
251px — the defect this pass exists to remove, surviving one level down. Split,
the four destinations measure **347 / 451 / 331 / 291** and *nothing scrolls*.

**One frame.** The dialog is sized to the tallest destination and does not
resize as you move between them; a panel that shrinks under the cursor walks
its own close button 160px up the screen for the crime of pressing "You". It
yields to `max-height` on a short window, where scrolling one destination is
the lesser evil.

**The note is panel-level**, outside the switched regions. `showSettingsNote`
is the refusal channel for zoom, tower, system, venue and felt, and a refusal
that lands on a destination you are not looking at is UX-AUDIT D2 again — a
notice channel silent by construction.

**Venue leads; felt and tower are its detail.** GOALS goal 13 already said a
fantasy venue REPLACES those choices, and `updateVenueChrome` already hid
them — but it hid them *silently*, which reads as a bug to anyone who does not
know the rule. They now sit under Venue as its subordinates, and when a venue
takes them a line says so by name (*"Moonrise Glade stages this — felt, tower
and dice are its own."*). Dice set is the same story one destination over.

**Two things this deleted.** `openSettingsAtLibrary()` — which opened the panel
and then *clicked a disclosure button* to reach its own destination, the
clearest available sign that the library was in the wrong place (C16 had
already unhooked its last caller, because the picker row promising a new
character was delivering a text editor). With the library as a destination,
`openSettings('stuff')` **is** the deep link. And the library row's own
clipping: at 291px of row the name, system tag, pool count, `in hand`, `Copy`
and `✕` needed 316, so Copy was cut in half and ✕ was off the edge — a
destructive action rendered as a sliver. It wraps now.

**Proofs.** `settings-destinations` (tags `settings`, `chrome`, **`look`** —
every claim is geometry, grouping and ARIA state, so it pays for no dice, and
the T4 runner enforces that) asserts the inventory (every known control in
exactly one destination, and nothing in two), the bar's order, exclusivity,
the *painted* chosen cell, zero overflow per destination, one frame across all
four, and that arriving at Your stuff puts the library in front of you with
the text tool still folded. `tools/steps/settings-shots.mjs` prints the
measurement beside the frames, because a restructure that fixes a measurement
should be able to show the measurement moving.

**Two traps this pass hit, both worth the next person's time**: the `.seg`'s
150ms fade means `getComputedStyle` right after a switch returns the
*interpolated* colour — read at t≈0 the chosen cell is still transparent and
the old one still lit, which fooled a screenshot AND an assertion into
reporting a state bug that was a photograph of a transition. And `modal-pop`
overshoots (a 1.4 control point), so a frame measured while the panel opens is
340×461 against a resting 320×442. Both are fixed by asking the thing itself —
wait for the paint to settle, wait for `getAnimations()` to finish — never by
sleeping on a guess.

### 7.38 The stability channel — what a production player is offered (2026-08-14)

Joe: *"I consider the dice towers and the stages to be in closed Beta. I don't
know how to properly hide this from others. Maybe we just require
`?stability=beta` in the URL? I'm okay with something simple."* This is that,
and the simple part survived contact.

**A browser is on one of two channels.** `?stability=beta` puts it on the beta
channel; `?stability=stable` puts it back. Nothing else in the app can change
one — there is no switch in the panel, because a switch would be an
advertisement for the thing being hidden.

**THE ONE LAW: the channel gates the OFFER, never the CAPABILITY.** A stable
client that walks into a beta player's room sockets that room's tower, raises
its venue, and bakes the same film — it simply cannot pick one. This is not
courtesy, it is goal 15. The pour is a pure function of (portal spec, engine
constants, seed), so a client that refused the room's tower would put
*different dice* on screen from the seat beside it. `applyRoomSettings`
already carries this reasoning for unknown tower ids ("keeping the table is
the right call, and it is not free"); a channel is the same situation with a
different cause and gets the same answer.

The shape was already in the registry: `venueOnly` is *"a CATALOGUE rule about
how this tower is chosen… a picker rule, not a capability."* The channel is a
second catalogue rule on the same axis, and `panelRowShown` is the one
predicate both the venue and the channel ask, so neither can un-hide the
other's rows.

**Where it bites:** the venue and tower rows leave the Staging destination
(`BETA_ROWS`), and `ownSettingsForChannel` drops `tower`/`venue` from YOUR OWN
saved solo settings on restore — filtered on the LOAD path and nowhere else,
so room state cannot pass through it even by mistake. A browser that leaves
the beta stops socketing a tower whose picker it can no longer reach; nothing
is erased, and redeeming the link again restores the lot.

**Beta is offered everything, always (2026-08-14).** Goal 13's full-set
replacement — a fantasy venue takes the felt/dice rows it stages, with the
`venue-staged` note saying what took them — is PRODUCTION chrome only (the
goal carries the scoping note). On beta no row is ever taken, venue up or
down, and the note stays hidden because it explains an absence and nothing is
absent; that is also what keeps Staging inside §7.37's measurement in its new
fullest configuration (every row and a raised venue — measured in
`stability-gate`, 0px over). As first shipped the replacement ran on every
channel and `panelRowShown`'s fantasy check answered for ALL rows — including
`venue-picker` itself, despite `updateVenueChrome`'s comment declaring the
venue never hides its own picker — so a beta tester in Moonrise Glade got an
EMPTY Staging destination: beta tag up, channel intact, no way back out short
of the console, reported (reasonably) as "my beta opt-in got cleared."

**Felt stays in Staging, and that was a measurement.** Felt is room-wide, so
blast radius alone (§7.37) argues it belongs in Table once no venue is on
offer to own it. Moved there it stood **483px against a 459px panel** — 24px
over, §7.37's entire defect re-grown one channel across. Left where it is,
Staging under the stable channel is a destination holding the felt, which is
what staging a table has always meant, and nothing scrolls on either channel
(measured: `settings-shots.mjs <prefix> both`).

**The mark is a tag on a heading, not a line of its own.** A beta tester who
does not know they are one files unfinished work as broken, so the Staging
heading wears `CLOSED BETA`. As its own `.hint` paragraph it cost 21px and put
Staging 21px over the same 459px panel — the second design this pass had to
abandon to keep §7.37 true. The panel is at its cap; anything added to it now
has to take something out.

**The param is a key, not a setting** — redeemed once, written to
localStorage, and stripped from the URL (GOALS §7's amendment has the why: the
share flow hands out `location.href`). It also survives the schema purge,
because it is an entitlement rather than app state and its loss would be
silent.

**The enrolment is held twice (2026-08-14, same day).** The single
localStorage key was lost in the field on the feature's first day — every
neighbouring key intact, the tester silently demoted, exactly the failure the
purge-exemption note predicted. So redemption now lays the key AND a
same-name, same-origin cookie, and every boot heals whichever lane is missing
from the other (`js/stability.js`, the mirror-lane header). The mirror
carries only `beta` — keyless is production, and any stable resolution
clears the cookie so a revoked beta cannot be resurrected by a stale one.
The server still never reads it. A boot that resolves beta but can persist
to *neither* lane says so once (`announce` + a field report) instead of
letting the next boot do the explaining, and
`__diceDebug.stability()` now reports `{stored, mirror, held}` live so "why
is this browser stable" is one console call.

**Testing.** Every harness tab is a beta tab; the stable population is reached
by `clean: ['dice.stability.v1']` (a browser that has never heard of the beta
— `clean` expires the mirror cookie along with the key) or
`query: '&stability=stable'`. `stability-gate` is the scenario, and its
expensive leg — two tabs, one room, one pour, both films compared — is the
point rather than the overhead: the obvious wrong implementation passes every
visibility assertion in the file and breaks the table only when two people are
watching. `stability-persist` is the boot AFTER redemption — the one the
beta-by-default suite structurally never ran — plus the field loss replayed
(store deleted, mirror heals) and the resurrection check (revoke, then lose
the store: still production).

### 7.39 The door on the phone it is designed for (2026-08-14)

CUJ7 step 1 is *"the link arrives in Discord and is opened on a phone"*, and
until this pass **no `@media` rule in the stylesheet touched `#name-panel` at
all**. This is C11 and C12 together, because they are one surface.

**The panel overflowed upward, which is the half with no scrollbar.**
`#name-panel` was `width: 320px` with no `max-height` and no `overflow`,
centred in a flex overlay. A centred child taller than its container overflows
in *both* directions, so the top — the name field and Join, which the
2026-08-09 reorder deliberately put first — went off the top of the screen with
no gesture that brings it back. `#settings-panel` carries the identical fix
with the identical comment; the picker was simply never revisited after it grew
to hold 12 prepared seats plus an **uncapped** profile list (to the 32 library
cap): ~1300px of rows against a 480px landscape phone. Same fix, same reason:
`max-height: calc(100vh - 32px)` + `overflow-y: auto`. `100vh` rather than
`100dvh` on purpose — the viewport meta carries `interactive-widget=
resizes-content`, so the software keyboard shrinks the *layout* viewport and
`vh` already tracks it.

**And the keyboard was not the player's to open.** `promptName` focused the
input unconditionally, *before the peek resolved* — so the keyboard halved the
viewport in the same frame the seats arrived into it. Focus is now conditional
on `(pointer: fine)`: a mouse pays nothing for it, a finger pays half a screen.
The overflow fix makes the collision survivable; this makes it not happen.

**`.seat-btn` was ~31px against U28's 34/44 floor**, and U28's own near-miss
list never named the family. Bumped to **44** — the platform number, not the
34px minimum — because this is the one screen in the app that exists *for* a
phone and its height budget is now free. `padding-block` plus a `min-height`
floor rather than `min-height` alone: `align-items: baseline` puts the
name/count baseline group at cross-*start* of a stretched flex line, so a row
grown by min-height alone hangs its text at the top. And it is `.seat-btn`, not
`.btn` — U28b measured a blanket coarse `.btn` bump at ~30 surfaces.

**The door had no way out.** `#name-modal` was the only overlay in the app that
was not a rung on the Esc ladder and had no ✕ and no cancel — settings, three
menus, the popover, the peek and the log flyout all peel. So a link opened in
Discord put a blocking prompt between a stranger and a table they were not
allowed to *look at* before committing a name to it.

**What dismissing resolves to, which is the whole decision: you are LOOKING,
not sitting.** The prompt resolves with `null` — a sentinel no display name can
be, where `''` is ambiguous with `takeFreeSeat`'s own refusal — and `initNet`'s
single caller reads it as *do not join*: nothing written to localStorage, no
`/api/join`, and the room never told anyone came to the door. The three
alternatives were worse. A blank-name join has the server clean it into
something and seats a stranger nobody invited. A promise left pending hangs
`netReady`, which the module awaits. Re-opening on the next act makes "look at
the table" a thing you get one glance at. **The way back is the presence row's
`Take a seat`** — §7.20 put "what you can do about your presence" in that one
slot, and this is a fourth thing you can do about it. In the *preview* phase Esc
means what `Not now` already means, so one rung has two honest readings.

*Known seam:* the identity chip still reads `…` ("a name is coming") for a
first-timer who dismissed, and none is. Left alone deliberately —
`updateIdentityChip` is called during module evaluation, so reading the
`seatDeclined` binding from it is a TDZ fault, and moving the declaration is a
bigger edit than the wart.

**"Stay as ⟨name⟩" forfeited more than the roadmap said.** It called
`takeFreeSeat` directly, and only `promptName`'s own `submit` copies
`seatProfilePicked` into `seatPending` — so it dropped not just the link's
offered character but **any row the player had just tapped**, silently, one
line under a hint saying the link offers a character. The name and the
character were never the same decision. Both doors hand the pick over now, and
the row grew a sub-label saying which character rides along, because an offer
made sticky without saying so would be worse than the forfeit.

**`&as=` had stopped pre-selecting anything.** §G5 documents it as *"a
highlight and a focus, so Enter takes it"*; the highlight lived in the
`#seat-list` loop retired on 2026-08-09, and `renderSeatMine` marks a foreign
row only when `seatProfilePicked` names it. So a per-seat link landed on a
picker pre-selecting the player's own last-used profile — or Random. The link's
seat is the default pick again (once per prompt, and never over a tap the
player already made), which is also the mechanism that makes the paragraph
above work.

**What made six green CUJ7 scenarios meaningless**, and it is not what the
roadmap recorded. `join-door` *does* click real `.seat-btn` elements — but
through `el.click()`, which fires on a node no finger could reach, at a
headless desktop viewport where `(pointer: coarse)` does not even match. A
verb cannot see that the top of the panel is off the top of the screen and
neither can a synthetic click. `__diceDebug.seatPickerBox` publishes the
numbers a phone cares about — client-space centres, `clippedTop`/`clippedBottom`,
`scrolls`, per-row `hit` via `elementFromPoint` — so a scenario can aim a real
`Input.dispatchMouseEvent` at a row and fail when it is unreachable.

*Also found and fixed:* `__diceDebug.chooseDealtProfile()` still **minted** a
profile on the tap, months after the ⚄ Random row stopped doing so. No scenario
called it, which is the only reason it never lied out loud — a hook that does
what the control it stands in for was fixed *not* to do is this project's
dominant failure mode with a test harness attached.
### 7.40 Restore — reading the file back (2026-08-14)

Full record in [PROFILES.md §12](PROFILES.md); this is what the surface is.

**One verb, separately named: `Replace my library…`,** in `#import-profiles`
under the file's profile rows. It is deliberately not a sharper `Apply` and
not a bolder `Add all`. Apply merges the file's top-level `pools:` and deletes
nothing, which is what makes it safe to press on a rack you care about; Add
runs every name through `uniqueName`, so a restored `Nessa` arrives as
`Nessa 2` next to the profile the browser dealt itself at boot. Restore is the
other operation — *put the file where my library is* — it is destructive, and
so it wears its own word.

**The two-step is the app's existing in-place arm** (the library row's Delete,
the corner ✕): first press arms, second press commits, nothing modal locks the
table. Three things distinguish this arm from those two:

- **It names what dies.** `Deleting 'Nessa', 'Bram', 'Tola' and 2 more — this
  browser is the only place they exist.` A count is a number nobody can check
  against their own memory; three names, then a count, is the same fact they
  can. The commit label follows C19 — a button states the next act
  (`Replace with 6 from this file`), it does not ask one.
- **`Download first` stands inside the armed state, and first in the reading
  order** (`order:-1` puts the sentence above both controls when the row
  wraps). The thing being replaced may be the only copy there has ever been,
  and the moment the player is thinking about that is the moment they armed
  the verb — not four rows up, before they knew they needed it. Pressing it
  re-times the arm: saving a copy inside the window is work, not a change of
  mind.
- **8 s, not 3 or 4.** Those arm over one named thing already in view; this
  one asks you to read a list and possibly wait on a save dialog.

Dressed like every other arm in the tree: quiet at rest, `#corner-clear.armed`'s
red at the moment of aim. The rows rebuild on every keystroke and the verb
**disarms with them** — an armed Replace is a promise about a specific list of
names on both sides, and the box is live.

**Two smaller reads landed with it.** The preview status line now carries
`⚠ n sections this version can't read, skipped ·` as a **prefix** on an
otherwise-clean `✓` — `parsePortable` has produced those warnings since
forward tolerance shipped and nothing read them, so a file from a newer
version lost whole sections silently. It is `.caution`, not `.warn`, because
`.warn` is what `portableVerdict().ok` reads and the parse genuinely
succeeded. And **an empty file refuses at the file door** (`✗ x.yaml is empty
— nothing to restore`) where it used to blank the box and the status line and
report success; an empty *box* still says nothing, because that is the pane's
resting state and clearing a textarea must not paint a ✗ at somebody about to
paste.

**And one standing notice**, on `#storage-banner` — the same element and the
same Download exit the jam state uses, because "a state your data is in, with
the one way out" is already this app's grammar for it, and a second banner
would be a second thing to keep in sync competing for the same corner. Its
second reason: `**Not all of it loaded** — 2 profiles ('Ada', 'Bo') did not
load from this browser. Nothing has been overwritten; Download saves what
did.` The jam wins when both hold. What makes the sentence true is the boot
write being **withheld** while it stands, and what takes it down is the first
successful write — which is the write that overwrites, and the moment it stops
being true.
### 7.41 The token layer — the kind of choice picks the dress (2026-08-14)

*ROADMAP U23. Everything below lives in `css/style.css`'s `:root`, in one
commented block, and none of it needs a build step.*

**Why this exists is a mechanism, not a taste.** Three pieces of doctrine
were being carried by copied NUMBERS instead of names, and every one of them
has already shipped a defect: the disabled code (audit C4 — thirteen recipes,
six with no grayscale, two colliding with the reveal tier's own resting
0.45), the pressed dress (audit C3 — `[aria-pressed="true"]` resolving to
**nine dresses across four hue families**, chosen by DOM ancestry) and the
rest-dim tier (audit C2 — 0.42 in the build against 0.45 in the doc, both
failing WCAG 1.4.3). U6, U9 and U10 fixed those instances. What they could
not fix is the reason a new control kept re-creating them: there was nothing
to look up, so the only available move was to copy the nearest neighbour.

#### THE THREE DEGREES OF "NOT CURRENTLY ACTIVE"

One ladder. The ordering is a fact of the numbers rather than a convention,
so a fourth state cannot be invented by accident.

| Token | Value | It means | Pick it over its neighbour when |
|---|---|---|---|
| `--dim-rest` | `0.78` | **Available** — simply not the thing you are doing. | The control is fine to press right now. Never use it to say "you can't". Where this dim is the ONLY ink a WORD has it carries 1.4.3's 4.5:1 floor; 0.78 on `--muted` measures 4.67:1, which is why the tier is not free to drift down. |
| `--dim-off` | `0.45` | **Out of play** — present, often still pressable, but not applicable to this roll, system or state. | A discarded die, a reveal tier you cannot use, a stepper the active system ignores. The CONTENT is not needed, so it may sit below the text floor — which is exactly why it must never dress a control that is someone's only route back to a state. That was C2. |
| `--drain` + `--drain-fx` | `0.3` + `grayscale(1)` | **Unavailable.** | The DOM says `disabled`. Hue is the signal being spent, so the third code can never be read as the second. Below every rest-dim above. |

`--drain`/`--drain-fx` are the two numbers of THE DISABLED RECIPE, which
still lives in exactly one rule; what the tokens add is that the *rung* has a
name, so the next honest exception is written `opacity: var(--drain)` rather
than as a fresh 0.35.

#### WHAT A SELECTED CONTROL WEARS

**THE KIND OF CHOICE PICKS THE DRESS. DOM ANCESTRY DOES NOT.** That sentence
is the whole fix. `[aria-pressed="true"]` used to resolve by where a control
happened to live, which is how the same kind of choice wore gold in a
body-level popover and ivory three inches away inside the panel. There are
exactly three kinds, and a new control is one of them before it is anything
else.

| Kind | What it is | Dress | Shipped members |
|---|---|---|---|
| **SWITCH** | A cell in a bar that turns a REGION of the app on, or picks which of two lists a column shows. Nearly always on, and never the thing you came for. | `--sw-fill` + `--on-ink`, and **no ring**. The missing ring is not an omission — it is the difference between a bar you flick past and a pick you made. The state is really carried by WEIGHT (`--dim-rest` → 1). An exclusive switch adds a rule under the active cell; that mark, not a hue, is what says "only one" (U10). | `#section-bar`, `#rail-mode` |
| **PICK** | One item, or a few, chosen from a list of peers, where the choosing IS the work. **This is the default: if you cannot tell which kind you have, you have a pick.** | `--on-fill` + `--on-ink` + `--on-ring`. A tool act, so ivory or steel and **never gold** — §7.16 2i-C rations gold to the roll verb. | `.seg button`, `.rp-item`, `.roster-name`, `.pid-cat`, `.pid-rank` |
| **DIAL** | A setting that changes what the whole table looks like or means and STAYS changed after you leave. | `--dial-fill` + `--dial-ink` + `--dial-ring`. Gold — **and this is the one family where gold is not the roll verb.** It is an exception that predates HUE = ACT and has never been re-litigated; it is written down so the next setting joins it instead of inventing a tenth dress. | `.felt-swatch`, `.set-swatch`, `.set-select`, `.system-chip`, `.sw` |

**The ring is a COLOUR, not a recipe.** An element with a resting border
spends it on `border-color`; one without spends it on `box-shadow: inset 0 0
0 1px`. That is why a ring which REPLACES a hairline needs more alpha than
one which appears out of nothing, and it is the only *structural* reason a
surface may override `--on-ring`.

#### THE OVERRIDE RULE — how nine dresses became one expression

The nine dresses were **not** converged onto one set of numbers, because
converging them is a visible change and the pass that found them could not
look at it. Instead: **if your value is not the token's value, do not write a
fresh number into the dress — override the TOKEN on your own element, on one
line, with the reason.** Every `[aria-pressed]` rule in the file now spells
the same three declarations, and

```
grep -n -- '--on-fill:\|--on-ring:\|--on-ink:\|--dial-fill:\|--dial-ring:' css/style.css
```

is the list of every place the app still disagrees with itself. There are
**thirteen such lines across seven surfaces**, each carrying the one-line
diff that converges it. The two that matter:

- **`.roster-name`** — the block above it says it wears "the shared
  aria-pressed steel dress the panel's seg controls already use". It does
  not, and never has: it is warm ivory inside a column that was re-dressed
  cool, at a third pair of numbers. The right long-term home for `.rp-item`'s
  three cool overrides is `#left-panel` itself, one level up, beside the
  `--panel` / `--panel-border` / `--hair` / `--muted` re-declarations that
  2i-D's temperature schism already put there. Moving them finishes the
  schism and makes that comment true — and it is the one change that also
  re-dresses the roster pill.
- **`.mchip`** — a ±2 chip and a whisper-audience chip are PICKs (you are
  authoring a roll, not changing the table), and they wear gold. **This is
  the only place left where kind and dress disagree.** The mechanical
  explanation: U6 enumerated `.seg` when it un-gilded the popover ("Every
  `.seg` in the app was enumerated first") and `.mchip` is not a `.seg`, so
  it sat three inches from the controls U6 corrected and kept the roll hue.
  The flip is: delete the two override lines and swap `--dial-*` for
  `--on-*`.

#### DIE ART: FOUR RUNGS, BY ROLE

The roadmap sketched three; the sheet had **six `.die-art` sizes across eight
rules** — seven die glyphs if you count `.log-die`'s 15px — and four of them
are genuinely different jobs. A die's size says what you may do with it, so
the ladder is named for the role and not the surface.

`--die-draft: 34px` the dice you are about to throw · `--die-tile: 28px` a
die you can PICK UP (the palette tile, a pool strip — and `.die-art`'s own
default) · `--die-card: 24px` a die inside a card you are editing ·
`--die-row: 18px` a die quoted inside a dense list row.

`.pid-rank`'s 26px and `.src-chip`'s 22px fit no rung and stayed literal:
they are tuned to the box that holds them (a 38px rank button, a source
chip's cap height) rather than to a role, and rounding them would move two
surfaces by 2px for tidiness.

#### `--label-sm`, and why the TRACKING is not one number

Fourteen rules had spelled `font-size: 10px` independently. The **size** is
one token now. The **tracking** deliberately is not: `--label-sm-track`
(0.18em) is a HEAD standing over a region, while an inline TAG inside a row
runs tighter (0.10–0.14em) so it fits beside its content. Take the token for
a head; spell a tag's tracking locally and it will read as the choice it is.

#### SURFACE AND LIFT — the vocabulary C25 Stage 2 needs

`--surface-card` (a card standing over the FELT — the peek card's body) ·
`--surface-sunk` (a track recessed INTO a surface) · `--lift-card` (chrome
resting on chrome) · `--lift-deep` (chrome standing over the felt) ·
`--lift-float` (a menu that flew out of something). **These three lifts are
the only elevations this app has; a fourth shadow is a new altitude and needs
an argument.**

The EDGES already had names and are deliberately not re-spelled: `--hair` is
the line inside one object *and* the seam between two siblings in a stack,
`--panel-border` is the outer rim of a floating object, `--well` is a recess
deep enough to hold an input. For "which panel in the stack am I looking at",
take the PICK tokens; for the ones behind it, `--dim-rest`; for a panel's
head, `--label-sm` + `--label-sm-track`.

**The trap that governs all of this, and it has no symptom at the call
site:** never define a token as `var(--x)` where `--x` is re-declared in a
subtree. `--panel`, `--panel-border`, `--hair` and `--muted` all are, on
`#left-panel`. A custom property is substituted where it is DEFINED, so
`--edge-rim: var(--panel-border)` in `:root` would freeze the tavern-gold
value and quietly stop tracking the column's graphite override — the alias
would look right in the token block and be wrong on half the app.
`--on-ink: var(--ivory)` is safe only because `--ivory` is declared exactly
once.

#### The one pixel this pass moved on purpose

`.pm-row:disabled` spelled its own `opacity: 0.45; cursor: default` and no
grayscale, while its own comment claimed to be spelling "the
grayscale-unavailable dress": at (0,2,0) it beat THE DISABLED RECIPE's
(0,1,1), so an unavailable profile row landed on **exactly the reveal tier's
resting number with its hue intact** — the collision audit C4 exists to end,
re-committed after U6 had cleared the other twelve. The rule is retired and
the recipe carries it. An off-system row in the profile picker goes 0.45 →
0.30 and loses its colour.

#### What was proved, and what was not

Proved mechanically rather than by eye: 1046 distinct selectors and **none
changed specificity**; **no rule added, exactly one removed** (the line
above); and every surviving rule resolves to **byte-identical declarations**
after full `var()` substitution, resolving local and ancestor token overrides
the way the cascade does. Not proved: that any of it LOOKS right. Nobody
looked. The computed-value assertions the suite already carries
(`.reveal-tier` at 0.45, `.tray-roll .die-art` ≥ 34px, `#rail-roll:disabled`
not drained) all read *resolved* values, so they are unaffected by
construction — which is also why a green suite here would prove nothing about
the dress, and the two scenarios this section owes assert the token layer
itself rather than any one surface.
### 7.42 The record — a put-away roll's presence at rest (2026-08-14)

*C25 Stage 2, with C13 and U20's shelf half folded in. Supersedes §7.27's
closing "Still open" paragraph, which named exactly this hole.*

Stage 1 took the felt shelf away and made **the log ROW the door** to a
put-away roll's card. It said out loud what it left worse: *with the flyout
closed, a put-away roll has no ambient presence at all* — the ≣ carried an
unread count in its `title` and nothing else. Three defects were the same
defect. C13: rank is the most useful fact for "find what happened earlier" and
nothing rendered it; a held roll's "waiting on you" reached an `aria-label`
and no sighted player; the roller-tinted glow that was claimed as the
attribution substitute blended 45% toward gold at alpha 0.10, so two players
differed by ~10/255. C14: the ≣'s unread count lived only in a `title`, which
touch never renders and which a static `aria-label` **overrides** in the
accname algorithm — so it reached `__diceDebug` and the suite, and no user.

**THE RECORD IS ONE OBJECT AT TWO SCALES.**

| | closed (the ≣'s **spine**) | open (the flyout's **panels**) |
| --- | --- | --- |
| what | one 3px rank per put-away roll, oldest→newest | one ~50px panel per roll, same order |
| colour | the roller's own, undiluted, on rail-dark | the same colour as the panel's top edge |
| unread | lit; read ranks dim to `--dim-rest` and stay | full opacity vs. 0.62 |
| held | dimmed | `?`, drained readout |
| waiting on you | gold, slow pulse | gold top edge + glow + `!` |
| arriving | `rank-land` — drops into its slot | the same keyframe |
| reachable | the button, one target (no nested button) | each panel is a button and a tab stop |
| what it does | opens the log | **anchors**: scrolls its row in, lights it, opens its card |

The spine is absolutely positioned **inside** the button so the rail's width
budget is untouched — the collapsed foot is measured to the pixel (css:2259)
and anything that added width would push the contextual ✕ under the divider.
Ranks flex to share whatever the button has: ~4px expanded, ~3px collapsed.

**Why not a strip across the bottom of the felt**, which is the shape Joe's
sketch reached for. C25 measured that space and it is not there: five panels
across a 390px phone is 78px each, which is C24's *"a tower reads as a
smudge"* applied to UI, and §7.9's redesign left the felt with **zero standing
chrome** deliberately. The rail exists at every width and already is where
information lives (P3). **The sketch's other half is built literally**: the
panels collapse into the element that expands the log.

**It is an index, not an inbox.** Joe's 2026-07 ruling — no count bubble,
"history is reference material" — stands, and `#log-badge` still does not
exist. What that ruling's rationale got wrong is its last clause: the count
"survives only in the hover title (still the accessible name)" was false, and
that is why the signal reached nobody. `renderRecord` writes the ≣'s
accessible name every render (`Roll log, 5 rolls put away, 2 new since you
looked, 1 waiting to be revealed`); the title keeps the count as a
convenience, never as the channel. A rank that has been read **dims and
stays** — the opposite of a number that exists to be driven to zero.

**The panel's one read** is the total where a system computes one, `?` where
the roll is hidden, `!` where it is waiting on you, and otherwise the roll's
own **label** — a per-die system (§7.24) has no sum, and insisting on a
numeral printed an em dash on every roll of the default profile.

#### The card, and the two U20 items that were real

- **A peek now names its RANK** (`.pk-rank`, in the header). Since §7.28 the
  banner stands until the next roll, so a banner for roll A and a card for
  roll B could both wear a red `✕ Clear` with nothing saying which roll either
  acted on. The banner is always the live roll and has no rank; a card is
  always a put-away roll and always has one.
- **The card lets go of things it should never have outlived.** It closed on
  nothing a player expects and sat at `--z-peek` above all of them. Now: a new
  roll's log entry retires it (`addLogEntry` — the roll's own card survives, so
  a reroll landing under its parent is not a stale card); a ceremony raising
  `#ceremony-layer` retires it (a `MutationObserver` on that one class, because
  the card must let go the moment the layer *appears* and every path that
  raises it converges there); closing the log already did.

#### Finding a roll (C14)

`Find a roll…` sits under the panels and matches roller, label, notation, and
— only where the roll is readable, goal 11 — its total. Rows are **hidden,
never removed**: `markSuperseded`, the cap prune and the card's anchor all
resolve rows out of `#log-list` by id. `N of M` stands beside the box; Esc
inside the box clears the filter and stops there, rather than closing the
flyout out from under someone who was only abandoning a search.

The **scroll moved off the panel and onto `#log-list`**, so the head, the
panels, the find box and the dropped-note foot all stay in view. Before this
you had to scroll 100 rows to reach *"N earlier rolls rolled off the end"* —
the one line a player who has lost history needs first.

**What `Clear history` actually does, verified 2026-08-14 and now said.** Two
scopes ride one button and the label named neither: `requestClearRoll` on each
put-away roll is **permanent, server-side and table-wide**, and reaches rolls
that are not yours; `log = []` is **local only** — online the server owns the
log and the next `hello` hands every row back. The button keeps its verb and
grows a second line, `· clears N for everyone`, which is empty (and the label
reads exactly `Clear history`) when the press touches only your list. The
announcement carries both halves.

**The late joiner is told what he cannot be told.** `logDroppedTotal` is 0 for
someone handed the last 100 rolls, and the client cannot learn the true number
— the server caps at the same 100 and does not report what it dropped
(`server.js:1748`). At cap the note says *"Showing the most recent 100 rolls —
this table may go back further"* rather than a confident wrong number.

**Debug surface:** `__diceDebug.record` (ranks, `spine`/`panels` element
counts, `spoken` = the ≣'s computed accessible name, `clearLabel`),
`anchorRecord(rollId)`, `logFind`, `setLogFind(q)`. `spoken` is the one to
assert on: it is the read that used to exist only in a hook.

### 7.43 The die a pool discarded, on a per-die surface (2026-08-15)

**This is the authoritative section for what a struck die and an explosion
child look like inside the outcome rows.** It closes the last live half of
GOALS' *Attributed math* — "discarded dice stay visible (struck)" — and it is
§7.24's third residual, the one that was still true. ROADMAP files it under
§1.

**THE DEFECT.** Under a per-die lens a `4d6dl1` showed **three chips where
four dice were thrown**. The dropped die was on the felt, in the log (struck),
and on the verdict card (as a `DL1 · dropped d6 2` attribution card) — and
nowhere on the banner, the verdict *hero* or the peek. U17 step 3's commit
message claimed it had returned to all three; its own step-5 pass corrected
that to the verdict card only.

**THE GATE WAS IN THE PROFILE, NOT THE RENDERER**, which is why five render
sites could be grepped and none found: `renderOutcomeRows` prints exactly what
`entryOutcomes(entry)` → `sys.outcomesFor(entry)` returns, so one line —
`if (!p.counts || p.child || …) return` — hid the die on every per-die surface
at once. The data had been there all along: `js/rollspec.js` writes
`reason: 'drop'` beside `counts: false`. *This is §7.24's own BRANCH ORDER
lesson in a second key: when a value is conditional AND lives behind an
accessor, the accessor is a gate too, and grepping the surfaces will not find
it.*

#### The rule

> **One row per die the player threw.** A die that landed and does not count
> renders as its own chip, struck, with the MECHANIC that set it aside in the
> answer slot. An explosion child renders as more of the die it came from, on
> that die's evidence, and never as a reading of its own.

#### A dress, not a fourth grammar

`renderOutcomeRows` already carried three chip reads — worded, quiet, and an
explicit dash beside worded dice. A struck die is a fourth read and it is a
**dress on `.oc-chip`**, deliberately: the chip is one die's evidence either
way, and exactly one bit changed — whether that die is in play. A dress is the
right weight for one bit, and the dress is one this app already owns for
exactly it (`.value-chip.discarded` on the felt, `.log-discarded` in the log
row): **strike the face, take `--dim-off`.** A player who has read the log has
already learned the row.

`--dim-off` is not a choice so much as a lookup — the token layer's own
definition names *"a discarded die"* as its exemplar (§7.41). It is taken at
its value rather than lifted toward the text floor, because the **strike and
the word carry the read while the opacity carries only the rank**; it sits
below `.oc-quiet`'s 0.55 on purpose, since a die the pool discarded ranks
under a die that counted and had nothing to say. No `grayscale()`, unlike the
felt chip: a struck chip has no tier hue to drain, because its word is never
computed at all.

#### It cannot be read as `oc-quiet` — and the answer slot is what decides it

The two reads both end in "no outcome word", which is the whole risk. They
differ in **three channels**, and the load-bearing one is the answer slot:

| | evidence | answer slot | tier |
|---|---|---|---|
| worded | `d6 5` | **`Success`** — display serif, 15px, tier-coloured | tier border |
| quiet, beside worded dice | `d6 3` | **`—`** — the silence, in real text | none |
| quiet, whole pool | `d6 3` | *(bare)* + one `quiet` for the pool | none |
| **struck** | ~~`d6 1`~~ struck | **`dropped`** — small tracked tag, `--muted` | none, `--dim-off` |

Quiet's slot says *this die counted and the chart has no word for its face*.
Struck's says *this die is not in play, and here is what set it aside*. The
words are **`dropped` · `rerolled` · `not kept`** — the app's own vocabulary
(the log's `rerolled`, the verdict card's `dropped`), not the rulebook's: the
profile answers with the mechanic (`'drop' | 'adv' | 'reroll'`) and the
surface spells it, so no interpretation system holds player-facing English for
a mechanic no system owns. Copy and a screen reader get `d6 1 dropped`, which
is the whole fact — the same reason the quiet dash is real text and not a
`::after`.

**Its word is never computed, not computed and hidden.** A dropped d6 showing
5 is not a Success; printing one would be the app inventing a result out of a
die the system discarded. §7.24 learned the narrower half of this from the
total — *a value written into the DOM and withheld only by CSS is not
withheld* — and this is the same rule applied one step earlier, at the point
where the value would be made.

#### ✴ children are the other question, and get the other answer

An explosion child is **not struck** — it counted — but it is **not its own
entry** either: it is more of the die it came from. Giving it a chart word
would turn `1d6!` into a two-die pool, which is not a render decision at all:

- it would contradict `forecastFor`, which forecasts `spec.dice` and records
  that explosion changes nothing — the property that lets a forecast and a
  result be read against each other row for row;
- it would move U18's crit denominator;
- and Soul Deal has **no rule** for it. An explosion adds a value to a die in
  a system whose values never sum.

So a child's **face rides its base die's evidence** — `d6 6 ✴3`, chased back
through a chain (`d6! 6 → 6 → 3` reads `d6 6 ✴6 ✴3`) — inside the `.oc-die`
span, which is the nowrap unit, so a face never separates from the die it
belongs to. Every die that touched the felt is accounted for, and the pool
still has exactly as many readings as it has dice.

*(`p.child` is explosion offspring **only**. A reroll REPLACEMENT is a full
counting die with its own reading; only the die it replaced is struck. So
`1d6 ro<=2` reads struck `d6 1` `rerolled` · `d6 5 Success` — two chips, one
reading.)*

#### Two things that would have broken quietly

- **`critCeremony`'s denominator.** U18 counts crit-CAPABLE dice, and that was
  true *by omission* while struck dice were absent from `outcomesFor`. With
  them present, `4d10kh1` would field four eligible dice for one reading and a
  genuine crit could never clear a strict majority. It filters `!o.struck`
  explicitly now, with the assertion that catches it if the filter is lost.
- **`oc-solo` counted chips.** `1d20 adv` is two physical d20s with one
  struck, so the most common Soul Deal advantage roll would have dropped from
  a 26px verdict word to a 15px one — silently, as a side effect of showing
  the die it discards. It counts **readings** now, and the struck chip stays
  at ordinary row scale beside the hero word.

`renderTally` filters struck dice for the same reason: the tally is what the
roll *said*, and a pool whose only wordless dice were discarded is not a quiet
pool — the guard the rows' own `quiet` word needed too.

#### Not built, and named

**No struck die on the felt's own value chip changed.**
`.value-chip.discarded` already dressed it; this section only makes the ROWS
agree with what the felt and the log were already saying.

**The LOOK is owed.** Nobody has seen `dropped` at `--dim-off` beside a worded
chip at row scale, on the banner or in the peek's 13px rows. The dress is
reasoned from three shipped precedents and one token definition, which is
enough to build and not enough to call done — this repo's standing rule. The
specific question: at the peek's scale, is the small tracked tag legible
enough to be attribution rather than decoration, and does the struck chip
recede *without* the row reading as damaged?

**Scenarios:** `struck-die` — see the list at the end of §7.44.

### 7.44 The ledger sheet — your budget, for tonight (2026-08-15)

**This is the authoritative section for the dice-value ledger's sheet and the
typed session target.** It is [ROADMAP §2l](ROADMAP.md) ⑤; the reasoning, the
generated figures and the record of what was killed are in
[POOL-ANALYSIS.md](POOL-ANALYSIS.md). Serves **CUJ6**. §7.18
(manage-and-measure) still governs the gate: everything here exists only under
`✎ Edit pools`, on your own rack.

**What C8 shipped and what it left.** C8 put the **system's** budget on the
shelf head — `SYSTEMS['soul-deal'].budget`, so a shelf reads `54/100` — and
deliberately left *"I am building to 80 tonight"* to this slice. That is the
whole of ⑤: a **typed, per-shelf, session-only** target.

#### The rule

> The **system** prices a shelf. **You** may price it differently for tonight.
> The shelf head reads whichever is in force, through one accessor, so the
> ledger and the shelf heads cannot disagree.

`shelfBudget` splits: `systemShelfBudget(label)` answers what the rulebook
prices a shelf at, `shelfBudget(label)` layers your number over it. The split
is not tidiness — the sheet needs both at once, the system's number as the
field's **placeholder** and the effective one as the **figure** — and a single
accessor would have been read by peeking into the Map behind it.

**A typed target may price a shelf the system does not, and that does not
overturn C8.** C8 left Motivations budgetless because *"the system does not
define 30 as a ceiling, so printing `X/30` would invent a rule and then mark
you in red for breaking it."* That is about the **app** inventing a rule. A
number the player typed for their own shelf invents nothing; it is the player
declaring the budget, which is the whole of what ⑤ is for.

**Session-only, no exceptions** (POOL-ANALYSIS §8.3): a module-level `Map`, no
`localStorage`, no portable-YAML field, no wire key, no `dice.*.v1`. A point
budget is a field the dice never read, so nothing about a roll changes when it
is lost — which is what makes losing it the right *default* rather than a gap,
and it is what keeps goal 12 ("not a character sheet") closed.

#### Where the rack figure lives — POOL-ANALYSIS §9's open decision, taken

§9 left this open between the head (entry bracket) and the `✎` toolbar foot
(exit bracket), because `#pools-head` is **deliberately non-sticky** — *"a
second pinned band would steal tray-adjacent pixels"* — so a rack total there
scrolls away during exactly the task it exists for. §9 also ruled out the
obvious fix: *"**Not** resolved by a third sticky rung; that refusal is
explicit and recent"*, and ROADMAP's Refuted list says the same of the section
bar.

**Answered without moving it and without pinning anything: the figure stays in
the head, and the figure IS the door.** A surface that flew out of a control
does not scroll with the rack, so the reading you opened stays put while you
scroll shelves under it. The scroll problem is answered by the sheet's
**altitude**, not by a second location or a third band — and no new control
was added, which is §5's one-gate rule. The `✎` foot gets nothing.

*The honest residual:* the sheet does not reposition, so scrolling far enough
leaves it floating over a head that has left. That is the shipped grammar for
every anchored surface in this app (`.set-menu`), and matching it beats
inventing a second dismissal rule for one sheet. On touch, a scroll is a
`pointerdown` and therefore closes it — same as the set menu, same caveat.

#### The sheet

Nameless, as the ± popover is — POOL-ANALYSIS §7 killed **`Assay`** and
**`Rack`** as player-visible words, and the chrome word is *pools*. Its
accessible name is the standing word the door already spends: `dice value`.
Its total row says **`All shelves`** for the same reason (`shelf` is the noun
this region already says out loud, in `＋ New shelf…` directly below).

- one row per shelf: **name · `spent/target` · a target field**
- a rule, then **`All shelves`** and the rack total. **The rack takes no
  target**: the system prices SHELVES, so a whole-rack budget would be a
  number with nothing to compare it against — C8's own reason for refusing to
  invent one for Motivations.
- the one legend sentence, paid once: *dice value — the sum of every die's
  highest face; modifiers, drops and explosions are not counted.*

**An empty field is a statement, not a blank.** Its placeholder is the
*system's* number, so an empty field reads as "the rulebook's budget is in
force". Clearing the field — or `0`, or anything unparseable — gives the shelf
back to the system, one gesture whatever the player typed to express it. The
placeholder takes `--dim-rest`, which carries the text floor, because it is a
number meant to be *read* and not merely seen.

**One right-flush figure column**, rows as `display: contents`, the same
ledger idea the shelf heads and the rack head already share. The rule and the
legend stay out of the row set: a stray item inside a contents-row grid shears
the columns, which is exactly why POOL-ANALYSIS §7 refuted widening
`.oc-ledger` — so the rule is a full-span cell of its own and the legend is a
sibling of the grid. Steel and ivory only; the one hue is the shelf head's own
reading-weight red for **over budget**.

`.ledger-sheet` rides `--z-set-menu` rather than minting a rung: it is the
same KIND of object that rung was cut for — a surface that flew out of a
control inside a panel, which must clear the popover and modal its anchor's
panel sits under. A second name for one altitude is how a z ladder stops being
a ladder.

#### `placeAnchored` is extracted, not ported

ROADMAP names this mechanically and it is worth restating: the placement
(below the anchor, clamped to the viewport, flipped above when the room runs
out) came **out of** `openSetMenuFor` into `placeAnchored(el, anchor)`, which
both callers now use. The 12px viewport margin and the 6px gap are **one
decision** about how far a flown-out surface sits from the thing it flew out
of; two copies are two decisions the moment either is tuned, and that is how
this codebase gets constants that stop tracking what they stood for.

#### The door

`.ph-fig` becomes a `<button>` and keeps reading as the figure it always was —
the control resets to nothing and earns its pressability on hover, focus and
`aria-expanded` alone. A rack total that suddenly wore a button's chrome would
be a **new object** in the head, which is the thing "no new control" was
protecting. The head is rebuilt on every render, so an open sheet's anchor is
replaced under it on every keystroke; the anchor is **re-pointed**, not closed
— closing the sheet on its own keystroke would make the field unusable. When
the gate closes (Done, or a walk to a teammate's rack) the sheet goes with it:
left standing it would be a floating editor for a budget with no ledger under
it.

#### Not built, and named

- **⑥, the sum read, is not here.** `forecastFor` still returns `null` for
  `dnd` and `none`; the sheet carries the ledger only. The forecast bars stay
  in `#pop-preview`, where §9b's icon strip is reserving room above them.
- **The LOOK is owed** — nobody has seen the sheet rendered.

**Scenarios owed by §7.43 and §7.44** (the hooks are shipped; the scenarios
belong to another owner's file):

- **`struck-die`** (`meanings`, `chrome`) — roll `4d6dl1` under `soul-deal`
  and assert `__diceDebug.outcomeRows('banner')` shows **four chips with
  exactly one struck**, that the struck one carries `why === 'dropped'` and a
  computed `text-decoration-line` of `line-through`, and that its `word` is
  `null`. **This is the assertion that fails on the pre-2026-08-15 tree.**
  Then the same for `'peek'`; `1d20 adv` keeping `solo === true` with two
  chips; `1d6 ro<=2` reading `rerolled` on the die it replaced; `1d6!`
  rendering **one** chip whose `children` is non-empty; and a switch to `dnd`
  leaving no rows at all.
- **`rack-dice-value`** (existing, `groups` + `chrome`) — extend: in manage
  mode `__diceDebug.openLedgerSheet()` succeeds and `ledgerSheet.rows` carries
  a row per shelf with `placeholder === '100'` for Attributes and `'—'` for
  Motivations; `setShelfTarget('Attributes', 80)` moves BOTH the sheet figure
  and the `.pool-sec-head .psh-fig` to `/80`; `0` restores `/100`; a target
  that is exceeded sets `over` on both; `setPoolsEditMode(false)` leaves
  `ledgerSheet === null`; and a reload leaves the target gone (session-only —
  the assertion that would catch a stray `localStorage` write).
### 7.45 The seams a first table night runs into (2026-08-14)

*U25 (audit E4) + U26 (audit F3) + U28b's two touch findings. Fourteen small
things, judged one at a time. Two of them were **already closed** by later
work, and are recorded here so the next reader stops re-opening them.*

#### The two that were already true

**The spectator's banner hover-hold is not broken — the clock it fought is
gone.** F3's first bullet (and through it [CUJS.md](CUJS.md)'s CUJ11 first
item) says `armAutoCollect` bails on `!mine`, so the roller's 3 s clock yanks
the card a spectator is reading. That was accurate on 2026-08-08. **§7.28
deleted the clock outright on 2026-08-10** — there is no `armAutoCollect`, no
`setBannerRetireMs`, and no timed exit of any kind: what retires the card is
the next roll or your own dismissal, for the roller and the spectator alike,
and a spectator reads at whatever pace they like. CUJ11's first item is
**shipped, by a deletion, four days before the journey was named.** The
journey's requirement is unchanged and still owes a composed scenario.

**A shelved roll whose log row is gone renders no peek at all.** F3's third
bullet describes a card with a live body-click and no named verb. §7.27 made
the log ROW the card's anchor and `renderPeek` refuses when the row is
missing; rows leave only through the cap prune, which takes the entry with
them. The `if (entry)` fold is therefore never skipped. What this pass added
is the *structure* rather than the coincidence: an entry-less peek now
returns before it renders anything, because the branches that drew that card
(a `?` and no verbs) are still standing below it, and a future anchor that is
not the row would make them reachable again.

#### The log row said every pool's name twice

§7.12's diagnosis was **duplication at equal weight** — a tally run and a
breakdown run that each led every group with its source label, so learning
WHICH die said WHAT meant cross-referencing two lists of the same words. It
was fixed on the banner, the verdict card and the peek by folding the two
runs into one labelled row per pool. The log was left out on the correct
grounds that its density is a **list line, not a ledger** — and then went on
printing `WISDOM d8 7 + d8 2 · ZEAL d6 3 · WISDOM Success · ZEAL Fail`.

A list line can carry the structure without becoming a ledger: **label once,
then the evidence, then the answer, per pool** —
`WISDOM d8 7 + d8 2 → Success · ZEAL d6 3 → Fail`. Both runs group on
`partSource`, so a group can never hold one and not the other. The separate
`.log-meaning` span still stands where there is **nothing to merge**: an
unsourced roll, whose single run never repeated anything, and which keeps
`renderTally`'s whole-roll *"a quiet roll"* voice.

#### A reroll says who, when who changed

**Spectator reroll stays.** `server.js` has no same-roller check on
`rerollOfId`, deliberately and with the reasoning at the call site: rerolling
someone else's visible roll is a legitimate table action, and goal 10 has no
role to appeal to. What was missing is that **nothing said so afterwards.**
The child's chip has always named its parent in a `title`; the parent's chip
named nobody, so *"Bob's row says rerolled"* could not say Alice did it, and
the record eviction a reroll causes had no voice on either row.

The **attribution flip** is the half that goes in the ink, because it is the
half that is not recoverable from anything else on screen: the row is Bob's,
the replacement is Alice's, and every surface will now show Alice's numbers
under a roll Bob made. Rerolling your **own** roll keeps the bare word — this
is a qualifier, not a badge, and §7.15's *at most ONE per row* still binds.
Both producers (`buildLogEntryEl`, `markSuperseded`) build the chip through
one function, because the incremental append and the full rebuild have a
byte-identical contract; `supersededIds` became a Map parentId → child, and
the FIRST child wins on both paths.

#### The whisper line said the opposite of what ships

*"others see you rolled, not what"* — four words for the reverse of the
doctrine. On every rung but `secret`, existence is public **and so are the
stakes**: the dice land shrouded but real, so their TYPES and COUNT are
public, and §7.24 renders the target, the moment and the subtitle to everyone
under every system. Only the VALUES are withheld. "not what" is exactly the
sentence a player would use to justify hiding a stake inside a whisper, and
§3.2 calls this our largest behavioural difference from Roll20 and Foundry,
where a non-recipient sees nothing at all. It now reads **"the table sees the
dice and the stakes — only they see the result"**, and §3.2's quotation of
the old string is amended in place.

**And the offer-context tooltip §3.2 specified is built.** An offered
*Only me* roll is not an only-me roll: the claimant rolls it and only the
OFFERER reads the result — the GM-screen roll without a GM. §3.2 pinned the
words to the popover's own Offer button, which retired with `popVis`; the
verb lives on the rim now, so `#offer-draft` reads **"Dice tower — they roll,
only you see the result"** whenever the draft carries `secret`, and the plain
title otherwise. The line follows the verb rather than dying with the surface
it was written against.

#### The terminology sweep's one contradiction

`＋ New shelf…` had `title="Add a category of pools"`. `category` is the
stored field and stays one — renaming it breaks every saved rack, the same
rule that keeps `dice.groups.v1` and `id="tray"` — and this was the only
place it reached a player. The **durable half is the suite**: the banned-word
regex omits `category` and sweeps none of the result surfaces. The string
this pass fixed is one instance; the sweep is what stops the next one, and
its exact shape is specified in the ROADMAP hand-off.

#### publishPools: the broadcast is right, the words were the lie

`publishPools` sends **your whole library** — every profile's name, system
and pools — to the room on every edit, and has since C17. Two sentences in
the app said the opposite: the invite tooltip's *"Pools travel via Settings →
Your data → Export"* and Help's *"Pools travel by export and import"*.

**The broadcast stays**, and this is the argument, because goal 7 is the one
that looks like it forbids it. Goal 7 says the server holds no persistent
state and that **capture is a thing the player DOES**. The broadcast is not
capture: it is a room-scoped display copy that evaporates with the room —
`localStorage` stays the truth, nothing anyone copies changes yours, and no
copy becomes anyone's *saved* pool without their own explicit Copy or Apply.
The file is still the only way a pool LEAVES a table, which is what "travel"
was reaching for. Killing the broadcast would take CUJ6, CUJ7 and the
teammate-pill browse with it — an organizer's six prepared characters are
offered "with no push and no YAML pane" precisely because of this wire.

Goal 11's *principle* is what was actually violated: privacy is a choice, not
a privilege, and a choice you were never told about is not one. Goal 10 says
everyone can already browse everyone — the hidden part was the only part out
of step. So: **both sentences are made true, and the sending half gets a
standing disclosure** in Settings → Your profiles, immediately above *At this
table*, which is the receiving half. One glance shows the symmetry. It stands
at a table only; announcing a broadcast to a solo player is a lie in the
other direction.

#### The link, the plate, the note, the fold

- **The invite link gets a primary gesture.** Its only pointer door was
  right-click / long-press on the identity chip — invisible, taught by a
  `title` touch never renders, on a chip whose LEFT-click is a visible no-op
  when you are already on your own rack — plus an Invite chair that retires
  the moment the second person arrives, which is exactly when a third is
  being fetched. **That retirement is right** (§7.20: a pill retired by its
  own success) and the rail is not where this belongs. Two standing doors
  join it: a **Settings → Table row beside the table's name**, because naming
  a table and handing out its link are the same errand and this is the one
  surface a first-time player is told to open; and **key `i`**, the first
  shortcut in the app that acts on the TABLE rather than on the panel, which
  was E4's finding word for word. All four doors go through `shareInvite`, so
  the `Copied!` grammar and the clipboard-refused fallback cannot drift. The
  lobby has no link, so the row hides and the key refuses out loud rather
  than fabricating one.
- **A minted key is not a chosen name.** The nameplate's rule is its own
  markup comment — *tableName, else the `?room=` key when someone CHOSE one,
  else NOTHING* — and it had no test for "chose", so `+ New table` minted
  `<slug>-<16 random>` and an unnamed table wore `drive egw19x` on the plate
  and in the tab title: a placeholder, and precisely the standing generic
  word the removed `Pools` title taught us to kill. `isMintedKey` lives in
  `js/tables.js` because the shape it recognises is the shape `mintRoomKey`
  writes. It is deliberately strict: a hand-typed `?room=our-tuesday-game` is
  a chosen name and keeps its plate. The security cost is nil either way —
  the address bar carries the key regardless; this was always presentation.
- **The change note names the setting.** *"Alice changed the table"* was the
  note for a **system flip**, which re-reads every result on screen under a
  different lens. Every other event on this channel names its subject ("Bo
  left"). The verb is diffed against what we hold **before** the apply
  overwrites it, so the note describes the delta and not the envelope (the
  server broadcasts the full merged object every time); two or more at once
  fall back to the plural, because a rename plus a felt change is one press
  of Apply, not two sentences.
- **The roster's two folds no longer both read `+N`.** Past `ROSTER_MAX` the
  row can carry the people fold and the free-seats fold at once, identically
  dressed, reading `+2` `+3` — two counts of two different things with only a
  hover title to tell them apart. The seats fold takes the word (`+3 free`),
  because `+3` beside a roster reads as three more PEOPLE.
- **And a pill can no longer shrink past its own text.** `.roster-name`
  carries `overflow: hidden` for its ellipsis, and for a flex item that sets
  the automatic minimum size to **zero** — `min-width: auto` resolves to 0
  instead of min-content — so pills shrank past their own padding to bare 8px
  dots while still four short of the fold that was supposed to answer
  crowding. A 76px floor (dot + gap + padding + ~4 characters) means a pill
  either says a name or is ellipsised to something recognisable; `#rail` is
  already `flex-wrap: wrap`, so the row absorbs the rest by WRAPPING, which
  is the growth mode it was built with (T9).

#### Two touch findings (U28b)

- **The rim wraps before it overflows.** `.draft-actions` is a no-wrap flex
  row whose four coarse tools come to ~240px of the expanded panel's 260 —
  fine on a tablet, overflowing below a ~320px viewport with nothing saying
  so. `flex-wrap` on coarse only: a second 36px row is a visible, complete
  answer, and on a fine pointer the row has never overflowed.
- **A counted dice row spends its art on its remover.** The measurement,
  twice refused in cascade and correctly: 8 + 18 art + 6 gap + 42 (`10d10x`
  at 12.5px) + 34 (the coarse remover's lane) + 8 = **116px in an 86px row.**
  It does not fit and never would; both refusals named the same two candidate
  answers, *drop the art on a counted row* or *move the count out of the
  name*. **THE COUNT IS THE LABEL** is §7.23's ruling with Joe's name and the
  wire payload on it, so the art is what goes — and only on **coarse**, which
  is what makes it affordable. On a fine pointer the ✕ is `opacity: 0` until
  you hover: nothing overlaps at rest, and while you hover you are aiming at
  the ✕ rather than reading the label. On coarse it stands permanently over
  the tail of every counted label; without the art the text runs x=8→50, the
  lane starts at 52 and its glyph inks 64–74, so every reachable label fits
  on the increment side of the boundary. The cost is that the first tap
  trades a die picture for a count and a remover — the row changing state,
  not losing its identity: it is lit, and it now reads as notation (`3d6`),
  which is what the art stood in for while the row said only `d6`.

**Deliberately not done.** The near-miss size families (`.btn.ghost` 31px,
`.corner-btn` 28, `.btn.tiny` 19, `#section-bar` cells 26) stay put: a
blanket coarse `.btn` bump touches ~30 surfaces and bumping the section bar
spends U30's rack budget directly. Raising any of them is a per-family change
with its own measurement, never a sweep. **A room that dies still says
nothing** — that bullet belongs with the table-resync work in flight and
would have been written twice.

**Debug surface:** `__diceDebug.logRow(rollId)` (the row as a projection —
`labels`, `tallySrcs`, `answers`, `rerolled`, `rerolledTitle`),
`tablePlate` (`name` / `hidden` / `title` / `minted`), `presenceRow.folds`
and `.pillWidths`, `poolsSharedNote`, `settingsChangeVerb(next)`, `visSubs`,
`offerTitle`.

### 7.46 Sub-tables — splitting the party, and coming back (2026-08-14)

**This is the authoritative section for the split verb, the scoped directory
and the way back.** It is [ROADMAP §3b](ROADMAP.md) `L4` and it serves
**[CUJ5](CUJS.md)** — *"we need to split into two groups for a bit, then come
back"* — which had zero code and zero scenarios before this pass. §13 of the
ROADMAP ("breakout rooms") is the same feature under an older name and was
folded into `L4` on 2026-08-07.

#### The shape

> A breakout is **a table**. It has its own key, its own felt, its own log and
> its own seats. Two pieces of wiring make it a breakout rather than an
> unrelated room: the parent **lists** it, and it **carries a way back**.

Three surfaces, and the split between them is the doctrine:

| Surface | Where | Why there |
|---|---|---|
| `Split table…` | identity menu (`#idm-split`) | AUTHORING. Rare, deliberate, one click behind the chip — where `Copy invite link` and `Leave table` already live. Zero standing chrome. |
| `↩ Main table` | presence row (`railGhost`) | NAVIGATION, in a breakout. The thing a split group does repeatedly. |
| `Breakouts ▾` | presence row (`railGhost` + `openRailMenu`) | The DIRECTORY, at the parent. Same component as the lobby's `Tables ▾`. |

**A directory is standing chrome, and this one earns the row anyway.** The
row's rule is quiet (§7.9 killed the permanent Invite pill for exactly this).
Two things pay for it: it exists **only while this table is actually part of a
split** — a table that never splits carries not one new pixel — and it is
**roster news**. When three of five players walk into a breakout this row loses
three pills, and the ghost that appears is the honest answer to the question
the emptying roster just raised. The chip could not do that job: it is the
right home for a verb and the wrong home for a live read.

**Not a summon** (goal 12). A door appears on the screens of people already
seated at this table. Nobody is called, nothing is sent, and walking through is
a choice made locally. The `table-split` event carries a one-line note in the
same grammar `table-setup` uses (*"Bo opened a breakout"*) and only to
bystanders at the parent — not to the breakout, where being told what table you
are in is not news.

#### The two open questions ROADMAP L4 left, decided

**① A child inherits the parent's felt and system — and the zoom, tower and
venue with them.** *Decided: yes, as a COPY.*

The system is not cosmetic: it decides what a roll MEANS (goal 6), so a
breakout that comes up on the default reads a d20 under a different rulebook
from the campaign it just walked out of — a silent wrong answer, not a colour
mismatch. The staging is not cosmetic either: goals 13–15 make a venue an
atomic set, and stepping from a dreamscape onto green felt mid-session is the
costume failure goal 14 names. Both argue the same way, so the inheritance is
"what this table is PLAYING", spelled `felt · system · zoom · tower · venue`.

It is a **copy, not a link**: the parent changing its felt an hour later must
not reach in and repaint a breakout that deliberately changed its own. A live
link would make the child a satellite of the parent, which is a role wearing a
settings patch (goal 10). Divergence after the split is allowed and expected —
anyone in the breakout may change any of it, because everyone always can.

Two things are deliberately **not** inherited. `tableName` — a breakout names
itself, and the server refuses an inherited one outright (`bad_setting`);
two tables called "Vault Heist" in one recents list is the failure. And the
prepared setup (§G4) — it is one organizer's push with its own `rev`, and
copying it would also buy every breakout `SETUP_TTL_MS` of linger, turning a
split into a twelve-hour `MAX_ROOMS` reservation. `experiences` is absent for a
duller reason: the client keeps no copy of it (the editor has not shipped), so
there is nothing to carry — when it does, it joins the list.

**② An orphaned child is a table whose way back still works.** *Decided, and
this SHARPENS the roadmap's "just a table" rather than agreeing with it.*

The roadmap's answer implies the child stops being a child when the parent's
linger expires — which would need the server to notice one room's death, mutate
another, and broadcast the change: a cross-room lifecycle coupling, invented to
solve a problem that does not exist. **The pointer is a room KEY, not a
handle.** Following it walks into a room with that key, freshly created if need
be, exactly as any invite link does (`getRoom`). So the back-link never
dangles, the child stays a child, and there is nothing for a reaper to clean.

What *does* end with the parent is its **directory**. `lingerRoom` clears
`children` alongside `log` and `offers`, because tonight's breakouts are
session, not preparation — every one of them is an unprepared room that died
when its own last player left, so a room that came back eleven hours later
listing them would be offering doors onto empty rooms and calling them the
game. That is the roster's rule, not the log's: presence is asserted, never
inferred, and a server that has forgotten the table cannot assert where its
people went. The mitigation is already shipped and client-side — a breakout you
personally walked into is in your own recents (§7.20).

`parent` is **kept** through a linger, and that is the one that looks like
session but is not: being a breakout of the vault heist is what this table IS,
the same kind of fact as its name, which linger also keeps.

#### One level

A table that already has a parent may not register children (403
`already_a_subtable`, and `Split table…` is absent rather than disabled). The
verb is *split, then come back*, and the way back is **the** main table,
singular. A chain of parents is a navigation structure and building one is what
goal 12 refuses; it also keeps the directory's meaning exact — "the breakouts
of this table", never "somewhere in a tree below it".

#### Why the directory is safe to send whole

The projection discipline says `projectEntryFor` is the only path a roll entry
leaves by, and that redaction is absent data, never hidden data. `parent` and
`children` ride `roomSnapshot` present-or-absent (so a table that never split
sends today's payload byte for byte) and are sent **unprojected**, on the same
two-part test `setup` passes:

1. **Nothing here is roll-shaped.** A room key, a display name, a millisecond.
   No values, no dice, no notation, no `playerId`, nothing per-viewer — so
   there is nothing any viewer is not entitled to, and nothing to redact.
2. **Publishing a key IS granting entry**, and here that is the ruling rather
   than a leak. Joe: *"sub-tables are public to the top-level table."* To read
   the directory you must already hold the parent's key and be seated at it,
   which is a strictly larger permission than walking into one of its
   breakouts. What stays refused is a GLOBAL list of live rooms — the other
   §3b ruling — and nothing here builds one.

#### The wire

One route, two ends, because a split has two ends and each is authorized where
it happens (`lookup` on a live seat, and nothing else — goal 10):

```
POST /api/split {room, playerId, child, childName}              — at the PARENT
POST /api/split {room, playerId, parent, parentName, settings}  — at the CHILD
```

`table-split` broadcasts BOTH halves every time, so no client has to work out
which end moved. The child's declaration is **first writer wins** and is
refused once the table has a log or a setup: a stranger may not hang a parent —
or a felt — on a game already in progress.

**This endpoint creates no room.** The child is minted by the splitter's
ordinary `/api/join`, through the ordinary door, under the ordinary `MAX_ROOMS`
cap and the ordinary §0j creation throttle. `tests/subtables.test.mjs` pins
that with a `/health` room count either side of a split, because the whole
rate-budget argument rests on it.

#### Seams, recorded so they are not rediscovered as bugs

- **A solo splitter loses their own directory.** An unprepared room is deleted
  the moment its last player leaves, so one person alone at a table who splits
  and walks out kills the parent; returning through `↩ Main table` lands in a
  fresh room with an empty `Breakouts ▾`. This is ② working as decided, and the
  journey it costs is narrow — a *split* implies at least one person stays, and
  when everyone reconvenes nobody needs the list. The general heal exists and
  is client-side: the breakout is in your recents. The fix if it ever matters
  is the shape §G6 already uses — the client that IS in the breakout re-registers
  it on arrival at the parent — deliberately NOT built here, because a heal
  nobody needs is a second writer to reason about.
- **The row's order puts the breakout ghost ahead of the unclaimed chairs**,
  because the chairs branch returns. Both are "people who are not on this
  roster", so it reads, but it was not chosen — it is where a surgical insert
  could go without re-cutting `renderPresenceExits`'s shipped branches.
- **`Tables ▾` is lobby-only**, so a player at a table cannot reach their
  recents without leaving. Unchanged by this pass and unrelated to it, but it
  is the reason the seam above is felt at all.

---

### §7.47 — A table that came back empty (2026-08-16)

*U25's sixth bullet, dropped there because "the resync work owns that
surface", then not done by the resync work either. The roadmap's phrasing was
"a room that dies says nothing to the group whose link it was". Designed
before it was built, because the load-bearing question is not what to say —
it is **what a client is entitled to know**.*

#### ① What a client can actually know, and it is exactly three local facts

Nothing arrives to announce a death. By construction there is nobody in the
room to be told: `lingerRoom` runs when the last player leaves, and the
comment on it already says "Nothing is broadcast: there is nobody left to
hear it." So the notice can only ever be assembled at the moment somebody
comes **back**, out of what that browser itself remembers:

1. `recentTables()` — this browser has sat at this room key before, under a
   name it kept.
2. `storedTable()` (`dice.table.v1:<room>`) — this browser AUTHORED this
   room's setup, at rev N.
3. The join snapshot — the room it just landed in has **no log, no setup and
   at most one player**. This is already computed and already named:
   `freshRoom`, in `initNet`.

**`freshRoom` alone is not enough**, and the near-miss is the whole reason
this was worth designing first: an ordinary F5 into a *live* unprepared room
with no rolls yet is also fresh — no log, one player, no setup — so
`freshRoom && remembered` would announce a death on every reload. Each half
of the predicate therefore has to name something this browser **knows it
left here and can now see is gone**:

- you authored a setup for this room and the room has none — and `freshRoom`
  already rules out every case where the room survived carrying it, so this
  clause is exact rather than probable;
- or you knew this table by a NAME and the room reports none. Unnamed tables
  are stored as `''`, so they simply do not qualify: with nothing to lose
  there is no evidence, and the app says nothing rather than guessing.

That conjunction means one thing only: *the room this link names is not the
room I left.* Nothing else a client sees produces it.

#### ② Who may be told: only the people who were there

A stranger following a dead link has none of the three facts, so the app says
**nothing** to them — which is correct rather than a limitation. They did not
lose a table; they opened an empty one, which is what the screen shows. The
notice is legible exactly to the population it is about, and there is no
channel by which one player's arrival could tell another anything. That is
what keeps it clear of goal 12: it is not a message, it has no sender and no
addressee, it is not delivered, and it leaves no history.

#### ③ What it must never claim — the four causes are indistinguishable

The observable is identical for: the 12 h `SETUP_TTL_MS` expiry; a
`--min-instances 0` scale-to-zero between sessions; a deploy; and the
two-minute round trip where an **unprepared** room is deleted the instant its
last player leaves. A client cannot tell them apart and must not guess. So
the notice never says *expired*, *timed out*, *the server restarted*, and
never names a duration. It reports the state it can see and stops.

#### ④ The shape: a receipt for a restore that already happens

The app is **already healing this case, silently**, on the same predicate:

- the table's **name** is restored from `recentTables()` (`initNet`, the
  `wanted` line), guarded to a demonstrably new room precisely so it cannot
  fight a live table;
- the **setup** is re-pushed from `dice.table.v1:<room>` by
  `maybeRepushTable()`, §G6's "the organizer's browser is the durable copy".

So the missing thing was never an announcement of a loss — it is that **an
act the app performs on your behalf goes unreported**. Framing it as a
receipt is what makes it safe under §7.20's rule ("emptiness is answered by
a button that PERFORMS the exit, never by a line of text describing the
situation"): the exits are already in the presence row, and this reports a
completed act rather than narrating a predicament.

Two sentences, and the second is written only when the server has said the
push applied — a promise about an in-flight push would be the one thing on
this surface that could be false:

- always, on arrival: **`this table came back empty`**
- and, once a re-push lands: **`this table came back empty — your prepared
  seats are back`**

#### ⑤ The channel is the notice pill, and why

`setPill(text, 'notice')` already carries exactly this register — a sentence,
steel not gold because HUE = ACT and this is housekeeping rather than a
refusal, clipped rather than stretching the header, self-clearing. Its
shipped precedent is C7's "Bob cleared the table". `announce()` rides along,
because U5's lesson is that a visual-only state read reaches nobody who
cannot see it.

**The one hazard, named rather than fixed:** the pill is a SHARED transient
slot. A stream status change (`handleStatus`) or another player's
housekeeping can overwrite this notice within seconds. That is judged
acceptable and arguably correct — a live refusal outranks a historical note
— but it means the notice is a courtesy on arrival, not a guarantee, and
nothing may be built on top of it that assumes it was read.

#### ⑥ What was considered and refused

- **A log entry.** The log is the record of ROLLS. A room-lifecycle line in
  it would be the first entry that is not one, and it would then have to be
  exported, filtered and searched with the rolls.
- **Anything with a sender.** "The table expired at 3 a.m." is chat wearing a
  timestamp, and it is also one of the four causes it cannot distinguish.
- **A modal or a confirm.** Nothing is being asked of the player, and the
  refuted list already rules that emptiness is answered by an act.
- **Telling anyone else.** There is nobody else — `players.length <= 1` is
  part of the predicate.

### §7.49 — Taking the log with you, and a setup that says which build wrote it (2026-08-17)

*ROADMAP #4 (§5's roll-log export) and #3 (C22's `room.setup` stamp), in one
pass because they are the same sentence read twice: **what leaves this browser
has to say what it is**. One is a file that must not pretend to be an import;
the other is a payload that must say which build authored it.*

#### ① The log was goal 7's last uncapturable surface

Goal 7: "anything worth keeping is captured client-side… capture is a thing
the player *does*." By 2026-08-17 every surface had a door except the record of
what actually happened — pools and settings through the portable file, the
crash report, the table setup through §G4. Four hours of rolls existed as DOM
and nothing else. §7.47 had already assumed this door existed when it refused
to put a lifecycle line in the log ("it would then have to be exported,
filtered and searched with the rolls").

Shipped: a **plain-text transcript**, `Copy` and `Download`, in a new foot of
the log flyout (`index.html` `.lf-foot`, `js/main.js` `logExportSnapshot`).

#### ② Why plain text, and why NOT the CSV the roadmap asked for

§5 said "copy/download text + CSV". CSV is refused, for now, on two grounds:

- **CSV's reader is a spreadsheet, and what you do in a spreadsheet is §5's
  OTHER half** — per-player distribution, average-vs-expected — which is
  blocked on §2l's sum read and will choose its own columns when it lands.
  Shipping columns first means shipping the shape that has to change.
- **The bar this file has to clear is a human who has never seen this app.**
  Raw CSV in a text editor does not clear it; a transcript does.

The line builder (`logExportLine`) is one function, so a CSV row is a small
change *against a settled column list* — which is the right order, not a
deferral of work.

**And it is `.txt`, deliberately inert.** `js/portable.js` owns the ONLY rack
transport (GOALS §7 — the `#g=` codec died for replacing a rack sight-unseen).
A `.dice.yaml` full of rolls would be handed straight back to the import box by
the first person who tried it, and refused there with no explanation. So the
extension carries no promise and the header says where the real transport is:
*"not an import file. Pools and settings travel separately, through Settings →
Your data."*

#### ③ What it says, in the order the row says it

```
Roll log — Thursday's Game
2026-08-17 · as seen by Bram · 4 rolls, oldest first
A roll that was face down or whispered is listed without its values.
Plain text, for reading and keeping — not an import file. Pools and settings travel separately, through Settings → Your data.

11:51  Bram  Sword  d20 12  → Partial Success
11:51  Bram  4d6dl1 dc14  (d6 1) + d6 4 + d6 1 + d6 6  → Partial Success · Fail · Success & Bonus  vs DC 14
11:51  Wren  Body  d6 1 + d6 2 + d6 5  → Fail · Success
11:51  Wren  Stealth  d20  face down
```

*(Real output, captured 2026-08-17. Reproduce with a step file that opens two
tabs, rolls, and prints `__diceDebug.logExport.text` under
`node tools/drive.mjs <step>`; `tests/e2e` tag `log-export` asserts the same
string.)*

Four decisions inside those lines:

- **Oldest first**, where the screen is newest first. A list is a feed you scan
  from the top; a file is read start to end. The header says which way it runs,
  so the reversal is never a surprise.
- **The row's own marks, and no new ones.** `(d6 1)` is a die the mechanics
  discarded (the screen dims it), `✴` is an explosion child (the screen's own
  glyph), `→` is the tally, `vs DC N ✓` is the stake and its adjudication under
  U17's split. Crit is colour on screen and has **no word**, so it acquires
  none here: inventing a `!` would make the file disagree with the table it is
  a record of.
- **User text is collapsed to one line** (`logExportText1Line`). The line break
  is the only structure this format has, so a name or label carrying one would
  forge a row.
- **The truncation note rides in the header**, from the same counter the panel
  foot uses. The log caps at 100 (U14); a file that silently ended there would
  read as the whole evening, which is this repo's dominant failure mode.

#### ④ Other people's rolls: everything the log shows, and not one thing more

The transcript is built from the same entries and the same gates the rows are
(`entryHidden`, `activeSystem().usesTotal`), so a face-down or whispered roll
exports as `face down` with its die **types** and no values — goal 11's
public/private split, unchanged. This is already the rule `logEntryMatches`
follows for the find box, and for the same reason: **a capture that answered
what the card refuses would make export the leak.**

Other players' *visible* rolls do export, with their names. They are the
table's record; a transcript of the evening holding only your own rolls would
not be a transcript of anything. The header names **whose view it is** ("as
seen by Bram", from `identityInfo()`), so two players' files legitimately
differing over a secret is legible rather than mysterious.

**The whole log, never the filtered view.** The find box has no selection
affordance and its own count reads "3 of 14" — it is plainly hiding, not
choosing. Copy must not be the one place in the app where a search field
decides what leaves.

#### ⑤ Copy and Download are TWO affordances, and symmetry is not the reason

They have different destinations and different failure modes. Copy goes to a
paste (Discord, notes) and can be **refused** by the browser's clipboard
permission. Download goes to disk and cannot be confirmed at all — the browser
owns that dialog. One control would mean the wrong behaviour for whichever half
of the players wanted the other. The portable pane already draws exactly this
pair with exactly these words, so a player who learned it there needs no
teaching.

- **The morph is the receipt** (`Copied!` / `Saved!`), the pattern both portable
  doors use. The flyout has no status line and does not grow one: the only
  thing that belongs under the record is the record.
- **A refused clipboard falls through to the file** and says `Saved instead` —
  capture is a thing the player *does*, so a verb that did nothing must not
  look done.
- **An empty log dims both verbs.** C15's lesson: a capture that writes nothing
  and says "Saved!" is a failed capture that read as a success. The panel
  already says `No rolls yet.`
- **A foot, not the head.** `#log-list` owns the scroll (see the §7.42 note in
  `css/style.css`), so a foot is always in view — an export verb must not be
  something you scroll 100 rows past. The head keeps the destructive verb;
  putting a fourth control there would have crowded `Clear history`'s scope
  line at 300px. Verified at 390×844 with the rail collapsed: two buttons split
  the width, the list still scrolls above them.
- One writer to disk: `portableDownload(text, name, type)` took defaults rather
  than gaining a twin. A second copy of the Blob/anchor/**late-revoke** dance is
  a second place to get the revoke timing wrong, and that failure looks like
  "the download sometimes does not happen".

#### ⑥ The other half: a prepared table now says which build wrote it

C22 shipped the stamp on the store, the file and the crash report and left
`room.setup` open. The reason it could not be closed on the server is
**provenance**: a stamp the server writes names the server's build, and the
question a reader has is *which build authored this data*.

So the client stamps and the server carries (`js/main.js`
`portablePushToTable` → `js/net.js pushTable` → `server.js handleTable` →
`js/main.js adoptRoomSetup`). Two writers, one of which mints:

- **Authoring** (`portablePushToTable`) stamps with this build's `SCHEMA_STAMP`,
  on the wire and in `dice.table.v1:<room>` together.
- **Replay** (§G6's `maybeRepushTable`) forwards the stored record's own stamp
  untouched, and absent stays absent. Re-stamping bytes it only stored would
  be the same lie as letting the server do it — and every record in the field
  today has no stamp, so a Tuesday-prepared table must still heal a restarted
  room on Thursday.

**Why this needed a refusal at all**, given C22's own header excludes the live
wire protocol: `net.pushTable` destructures exactly `{rev, table, profiles,
ver}`, so a record written by a build that put a fifth field in it would be
replayed by an older one with that field silently gone, **at the same rev, over
the top of what the room holds**. That is not one player losing their own data
quietly — it is the whole table's prepared setup degraded by an act nobody
clicked.

**The refusal a player can act on.** A setup from a newer major is not adopted
at all: `adoptRoomSetup` keeps only its `rev` (a counter *about* the blob, so
`maybeRepushTable` does not then start pushing an older setup over a newer one
it just refused) and speaks C22's sentence on the three surfaces the library
refusal already uses — pill, `announce`, settings note — plus the field log.

*Found by looking, 2026-08-17:* the `'table-setup'` case then wrote
**"Bram prepared the table"** straight over that sentence. `showSettingsNote`
shares the pill *and* announces, so it did not merely hide the refusal — it
spoke past it, with a reassuring lie, in the one slot carrying the only
explanation of why no seats had appeared. The note is now suppressed while a
refusal stands.

#### ⑦ What was considered and refused

- **A `Copy my rolls only` verb.** Speculative; and the honest version of it is
  the filter question in ④, which has a decision.
- **Stamping `room.setup` on the server.** Cheaper by two files and worthless:
  see ⑥. It is what "a stamp only the server writes is a stamp nobody can
  trust" means.
- **Having the server JUDGE the stamp.** A rolling deploy would reject the
  setups its own older instances wrote. The reader that stands to lose data is
  the client, so the refusal lives there.
- **A `.dice.yaml` roll log.** ②. One transport, one extension, one promise.
### §7.50 — The tower rides the portable file (2026-08-17)

*ROADMAP's 9d follow-up. `TABLE_KEYS` was `{name, felt, system, zoom}`, so the
one piece of furniture that changes the FILM was the one piece a prepared table
could not carry. Shipped `tower` ALONE; how a **venue** rides the file is
GOALS' explicit punt (2026-08-15) and is untouched here.*

#### ① The key, and the one asymmetry in the section

```yaml
table:
  name: 'Foxfire night'
  felt: 'obsidian'
  system: 'soul-deal'
  zoom: 'close'
  tower: 'blackanvil'     # ← new; present-or-absent; reads last
```

Four of the five keys are **closed enums, mirrored by hand from server.js**, and
an unknown value refuses at its line — "a felt that silently fell back would be
a table nobody prepared". `tower` is **shape-checked and not enumerated**, and
that is the section's one deliberate asymmetry:

| | felt · system · zoom | tower |
|---|---|---|
| catalogue | closed; unmoved since it was mirrored | **declared to grow** — one model → five in a fortnight |
| homes for the list | client, server, `portable.js` | would be a **fourth**, and unguardable |
| unknown value | refuses at its line | parses; dropped at the apply site, named in the receipt |

Two reasons, and the second is the load-bearing one:

1. **The mirror would rot on the key that changes most often.** No drift guard
   is reachable from Node: `server.js` does not export its tower list and
   `js/main.js` cannot be imported outside a browser (`tests/profiles.test.mjs`'
   mirror guard works only because `meanings.js` is import-free data). A rotted
   mirror's failure mode is "every file the new build writes, the old build
   refuses".
2. **A catalogue addition is not a schema change.** C22's stamp is the door for
   "this file holds something you cannot read"; making a sixth tower model
   refuse a whole document — forty pools, thirty-two profiles — is a
   compatibility break the version contract deliberately declines to make.

So the format judges **shape** (`/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/` — wider
than today's ids on purpose, because dice-set ids in this same file already
carry dots) and the **catalogue** is judged where the real registry lives.

#### ② The three failure modes, and what each one does

**A tower this build does not have** (a newer build's model, a typo, a mod).
The parse carries the id verbatim — so `Open → Download` on an older build keeps
the DM's tower instead of quietly stripping it. `portablePushToTable` checks it
against `TOWERS`, drops what it cannot socket, and names it in the receipt:

> ✓ table prepared — 4 seats offered at this room · left behind: the tower
> 'brassworks', which this build can't raise

**It is never sent**, and that is measured rather than reasoned.
`validateSettingsPatch` refuses the ENTIRE push for one bad value and
`net.pushTable` answers `null` for that, so an id sent hopefully would cost the
felt, the name and every prepared seat — under the receipt "couldn't reach the
table", over a table that answered perfectly. A file whose only table key was
an unraisable tower refuses outright rather than reporting `✓ settings sent to
the room` for an empty patch.

Reproduce (start `node server.js` with `PORT=` any free port that is **not
8123**, `POST /api/join`, then `POST /api/table`):

```
push {table:{tableName:'Forge night', felt:'obsidian', tower:'blackanvil'}, rev:1}
  → 200 {applied:true}; a JOINER's settings.tower is 'blackanvil'
    and setup.table is {tableName, felt, tower} — the tower is UP for them
push {table:{tableName:'Would be lost', felt:'plum', tower:'brassworks'},
      profiles:[{name:'Wren', …}], rev:2}
  → 400 {"error":"invalid value for tower: brassworks"} — and the felt is still
    'obsidian', the name still 'Forge night', seats still 0. One bad id costs
    the whole push, which is why the apply site drops it instead.
push {table:{tower:'none'}, rev:3}   → 200; the room's tower is 'none' again
```

**`tower: 'none'`.** Kept by the parse, unlike `name: ''`. An empty name is the
*absence* of a name; `'none'` is a tower id with a registry row of its own and
the only way a prepared table can LOWER a tower somebody raised. The
**emitter's** silence about it is a separate call, at `portableSnapshot`: a
reader already in the field refuses an unknown key inside `table:` ("unknown
table key … — expected name, felt, system, zoom"), so writing `tower: 'none'`
unconditionally would make **every file this build exports unreadable by every
older build** — a hard version break bought for a default value on a
closed-beta feature. Only a table that actually raised a tower writes the key.

That also keeps the stamp honest: `major` is owed "the moment stored data can
hold something an older reader would silently drop" (js/schema.js), and an older
reader does not drop this silently — it refuses at the line. The loud door is
already in the field, so a tower model still costs one registry row.

**No `tower` key at all.** Silence, exactly as before this key existed: the
room keeps the tower it has. Every line of the push is `if (t.key)` — the
`table:` section is a **patch** over the room's furniture, never a total
statement of it — which is what an absent felt has always meant. Absence is not
a synonym for `'none'`.

#### ③ The channel does not gate it, and that is the one law

`tower` is a beta setting (`BETA_SETTINGS`), and the apply site deliberately
does **not** filter by channel: the channel decides what the settings panel
OFFERS, never what works (§7.38, js/stability.js). A stable browser applying a
beta table's prepared file raises that table's tower for the whole room,
itself included — refusing would bake a different film from every other seat
(GOALS goal 15).

#### ④ A venue-only tower is allowed, and `venue` is why that is a seam

Hollow Bole is `venueOnly`, which is *"a picker rule, not a capability"* —
`setTower` accepts it and `renderTowerPicker` skips its chip. The file is not a
picker, so it is not special-cased. **There is no venue↔tower hosting relation
in either direction**: a fantasy venue *stages* a tower by sending an id
(`selectVenue`'s patch), and leaving a venue sends `{venue:'table'}` with no
tower, so `{venue:'table', tower:'hollowbole'}` — a fae trunk in a grounded room
— is already two clicks away with no file involved, and `faeTowerPalette()`
falls back to `'moonrise'` for it rather than failing. So the file cannot reach
a state the UI cannot. What it CAN now do is prepare half a fae venue, which is
an argument for shipping `venue` next, not for gating the tower.

#### ⑤ What was considered and refused

- **Mirroring the tower enum** — see ①. Rejected on drift, not on effort.
- **Falling closed to `'none'`** (the dice-set rule). A set falls closed to *no
  override* and the pool survives; there is no "no tower" that is not itself a
  tower id, so falling closed would ASSERT a towerless table where the file
  asserted a tower. Dropping the key is the honest degradation, because it is
  the same thing the absent key already means.
- **A `warnings` entry for the dropped id.** `warnings` is spoken for: the
  preview renders it as *"N sections this version can't read, skipped"*
  (`skippedPrefix`) and `portableVerdict().warnings` is asserted as exactly that
  loss. A tower is not a skipped section, and the report belongs where the
  consequence is — at the push, where a table is being prepared.
