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
· *Only me* ("no one else sees that you rolled") · *Whisper to…* ("others
see you rolled, not what"), and an offer's restricted mode is *Dice tower*
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
| Saved-pools rack + shelves | §7.9's THE SHEET PASS — identity edits by id, creation-as-editing, the ✎ row — and its DEALT RACK amendment · §7.18 for what the ✎ gate covers | §7.17's region head, amended below: `SAVED POOLS` no longer stands over your own rack |
| Collapsed launcher (the rail) | §7.22 — 112px, a row is a word, the standing verb, 2i-G · §7.23's "The collapsed column" — the source switch, the dice list, the plate at rail scale | §7.9's collapsed paragraph: it predates the second source list and describes a column that holds only pools (its 56px history is already struck there) |
| Intent card · dock strip (the declaration) | §2.4's staging timeline, phases 1–8 · §7.6 for the moment flags and `# Title \| Subtitle` · **§7.24** — the target renders under every system and the profile only NAMES it (`targetWord`); the flat `+5` is arithmetic and does not; `#intent-notation` stays a whole verbatim canonical, `dc15` included | §2.4 phase 0's user-held dwell and Roll button (shipped: a fixed `CEREMONY_DECLARE_S = 1.35` s, no button) · §2.1 / §2.3's experience records — the moment ships as notation flags · any reading in which the badge's label is a fixed string |
| Result banner | §7.11b — the folded card, the hover read, the beacon, auto-collect at 3 s · §7.21 — the named primary verb, the retired watermark · **§7.24** — `VS DC 15` renders under every system, the adjudication only where a sum does, and the hero slot names the rung (`Face down` / `Whispered`) where the mute gold `?` used to sit | §7.9's Done-at-rest and its ~6 s clock (the shipped clock is 3 s) · §7.7.2's ⟳ / Collect / ✕ trio · §2.5 (retired 2026-08-08) |
| Verdict card | §7.16's THE FLOW TO COLLECTED — a folded card whose clock shelves the roll · §7.21 — `❯❯ Skip` repaints to `✕ Clear` when the beat lands · **§7.24** — the stake goes into `#verdict-margin`, written ONCE above and outside every branch; the hero holds the reading and the two never share a slot | §7.7.2's verdict half (struck there) · §2.4 phase 0's user-held dwell and Roll button (shipped: a 1.35 s timer, no button) · §2.5's one hero slot — retired, struck there. **The card has no subtitle element under any system** (§7.24's deferral); do not read the eight-surface table as though it does |
| Peek | §7.7.1 for what a peek is · §7.11b's "folded card, shelf edition" · §7.21 — its primary is always `✕ Clear`, housekeeping being anyone's · **§7.24** — the stake, and the held word in the total slot (the `?` survives only for `!entry`, and under a totals lens) | §7.15's one-✕ rule — retired, struck below · §7.9's "the peek carries a prominent ✕ at its base" amendment · §2.5 (retired) |
| Roll log | No single section. §7.9 for the rail-foot flyout and key `l` · §7.12 for the compact grouped line (the per-die ROWS belong to the other three surfaces) · §7.15's "The log says so" for `reroll` / `rerolled` · **§7.24** — `vs 15` with no `✓`/`✗` where nothing sums, and no dangling `+5` feeding an empty total column | §2.5 (retired) |
| Shelf | §7.7 — slots, collect, FIFO ranks, universal housekeeping, resync · §7.7.1 — no casino markings, left-to-right compaction | The marker's resting read in §7.7 and §7.9, amended below: it ships invisible. ROADMAP U20 owns the redesign |
| ± popover | §7.10 — a pure editor, and where an edit lands by source · §7.14.2 — Done, click-away, the ring · §7.9's SHEET PASS identity strip · **§7.24** — only **Modifier** folds under a per-die lens; Target, d20 pairing, keep/drop and reroll/exploding are authorable under every system, and the rim reads `± Modify` in both | §7.10's "reroll and explode stay… behind the sysnote's *Show anyway*" — superseded 2026-08-06, no note and no disclosure; the accurate record is the comment over the popover's sections in `index.html` · any account of the fold in which Target or keep/drop hides under a per-die system: that was `usesMods`, deleted 2026-08-08 · ROADMAP U11's `± Moment` — its rule survived, its word did not (§7.24) |
| Identity chip · roster · nameplate | §7.17 — the rail pill is the one per-player surface, left-click toggles the rack, right-click / long-press opens the menu, and the quiet nameplate · §7.9's ORDER IS THE CONTRACT · §7.22 for the collapsed dress | §7.9's "Identity is on the table" paragraph, where left-click opened the menu |
| Settings | No single section. §7.9 for the *Just you* scope (chips off by default, the dice-set select) · §7.13 for *Your data* · §7.17 for the table name; the room-wide keys are `SETTING_SPECS` in `server.js` | §2.1 / §2.3's experience record and its editor — never built, and `/api/table` refuses the key |

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
(3) The tidy-away clock: a finished OPEN roll of YOURS auto-collects to
the shelf ~6s after it settles (hovering the banner holds the clock — you
are reading; Enter keeps it now, Esc sweeps; hidden rolls stand until
their reveal — the tension is the point; spectators never collect for the
roller). ONE RESULT CARD (Joe: 'why are the options any different at
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

**The beacon, take two — size and air.** *(The first take's converging
funnels looked right over an empty well but fought the rail once
Save · Offer · Clear stood — Joe, same day. Retired.)* The well earns
its presence by SIZE and AIR instead: real margins above and below,
a 64px-tall well, and dice that land **larger inside it (34px) than in
any pool row (28px)** — the draft is the star. Heat stays: stepped
classes (heat-1…4, two dice per step) brighten the well's gold
under-glow and gather the standing ROLL whisper from 0.3 toward 0.55.
Light, depth and scale — never geometry jitter (§7.10). An empty well
stays quiet; auto-collect runs at 3 s with a hover-hold.

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

#### Not closed — verified against source, 2026-08-08

Two sites in the shipped build still disagree with the rule above. Both are
recorded because an authority section that overstates itself is worse than
none; ROADMAP U17 carries them as work.

- **The offer card still prints the flat `+5`.** `modsSummary` never gained
  its arithmetic option and `renderOffers` passes none, so an offer's summary
  reads `+5 · advantage` under every system while the intent card it becomes
  drops the `+5`. It is the one *declaration* surface still on the wrong side
  of the split.
- **A held roll's log row still answers `?` in the total column** under a
  per-die lens — the same mute gold glyph the banner and peek gave up, in the
  same claim of a withheld sum that will never exist. The log's *detail*
  already names the rung (`face down` / `whispered`), so the row says both.

One more asymmetry is real but is **not** a stake question, and belongs to
whoever next touches the outcome rows: `renderOutcomeRows` prints only the
dice `outcomesFor` returns (`p.counts && !p.child`), and the breakdown line
folds wherever those rows render — so under a per-die lens a `4d6dl1`'s
**dropped die is still invisible on the banner and the peek**. It returned to
the verdict card (as a `DL1 dropped` attribution card) and it has always been
in the log (struck). GOALS' *Attributed math* asks for struck dice on every
surface that shows the dice.

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
