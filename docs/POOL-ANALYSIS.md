# Pool analysis — the die spectrum and the dice-value ledger

**Status: DESIGN, four decisions taken; ①–⑤ shipped, ⑥'s ENGINE shipped
2026-08-16 and its rendering is the open half.** This is the detail behind
[ROADMAP §2l](ROADMAP.md); that entry is the summary and the ship order, this
is the reasoning, the data and the record of what was killed. Decisions Joe has
taken are marked **[JOE]** and collected in §8; what is still open is §9.

**Every number in this document is generated, not asserted:**

```bash
node tools/pool-analysis-data.mjs        # the per-die half (§3, §4, §6.5)
node tests/sumread.test.mjs --bench      # the sum half's timings (§6.3)
```

It derives each figure from `js/meanings.js`, `js/notation.js` and
`js/rollspec.js` directly and exits non-zero if the chart's invariants break.
This is not ceremony — the design pass that produced this doc ran on numbers,
and **three of its claims did not survive checking**, two of them fabricated
outright by the agents that produced them (§7). A figure you cannot regenerate
is a figure you should not trust; §13 does the same for the non-numeric
claims, listing the command that re-checks each one.

**And it keeps happening, which is the argument for the rule rather than
against it.** ⑥'s build (2026-08-16) found **four more** claims in §6.3 that did
not survive a measurement — three timings and one detection test that this same
document disproves one paragraph earlier — plus **three stale rows in §13**,
the table whose whole job is not going stale. All seven are struck in place
below, never deleted.

## 1. The ask

Joe, 2026-08-05, naming the CUJ it serves — setting up a *Your Soul Deal*
player, where the attribute and skill shelves want dice summing to 100:

> I want to support analysis of dice pools. I want to be able to see what the
> distribution of possible outcomes is across the possible range. For "Your
> soul dice" I want to be able to see it contextualized by outcomes instead of
> by value, so "2x success", not some numerical sum.
>
> I also want some way to see the total sum of the value of the dice in an
> entire shelf, so for attributes, if there are 2d20, I want to be able to know
> that the sum is 40, for 1d20 and 1d4 it would be 24. I don't need to see this
> all the time.
>
> Please think about how to unobtrusively show these sort of stats, maybe only
> when editing the saved pools? Maybe with click overs? Visual clarity and
> interest matters in the UX.

Two reads, then. **(1)** the outcome distribution, read by *outcome* not by
value. **(2)** the summed die **maximums** of a shelf — a character-creation
point budget, not a roll total.

## 2. The ruling that decided the design **[JOE]**

The design panel (§7) built three cross-die devices. Joe removed all of them in
two sentences:

> We never fold together results in this system. Each die has a result. We
> track those results.

and, asked directly whether that also forbids *counting* across the dice in a
pool — e.g. "chance of at least one Success: 29%", which merges no words but
does aggregate over dice — **per-die only, no aggregation.**

**What died:** the Poisson-binomial count ladder, the per-word "at least one"
line, the chart-order cumulative read, the combination list Joe himself
floated, and the entire "what does *2× success* fold together" question — moot
the moment counting across dice was refused.

**The consequence, recorded plainly:** the forecast will never print
"2× Success", Joe's own opening phrase, because that sentence counts across
dice. It prints, per die, the chance that *this* die says Success. The math for
the aggregate reads is preserved in §6 and in `tools/pool-analysis-data.mjs`,
so revisiting the ruling costs a decision, not a re-derivation.

### 2.1 Why this costs nothing — the factorization

The ruling looks like a restriction and is not, because **the joint
distribution factorizes**. The dice are independent and each reads its own
chart column, so for any combination of outcomes:

```
P(combination) = Π P(die i shows its word)
```

A per-die spectrum is therefore **not a summary of the distribution and not an
approximation of it — it is the distribution**, written in the only compact
form it has. Nothing is hidden; any combination is recoverable by multiplying.
Joe gave up a lossy summary and kept the lossless thing.

### 2.2 And the alternative was unreadable anyway

Joe's own suggestion was to "show what combinations of results from the
individual die contribute". Enumerated exactly:

| Pool | Distinct combinations | Most likely one | Needed for half the mass |
|---|---|---|---|
| `3d6` | 35 | 5.6% | 9 |
| `1d20+1d8` | 63 | 7.5% | 11 |

There is no shape in that to read. The most likely single outcome of three d6
happens one time in eighteen, and it is `Fail + quiet + quiet`. A list whose
top entry is that rare and that dull is a table, not a visualization — and it
grows combinatorially, so it never becomes viable for a real multi-pool draft.

## 3. Ask 1 — the spectrum bar

**One bar per die.** That die's whole probability mass, laid out left to right
in the chart's **own row order**, one tier-colored segment per word, quiet
included. Ordering is not folding: the columns are already written worst→best,
so the bar reads as a ladder from Critical Fail to Critical Success and the eye
gets a pool's character at a glance. Hover or focus names a segment and its
percentage.

`p_word(type) = |{v ∈ 1..F : CHART[F].rows[v-1] === word}| / F` — a single fold
over one column. Exact by construction.

### 3.1 The six spectra, generated

| Rank | Spectrum (chart order, worst → best) |
|---|---|
| `d4` | Blemish 25 · *quiet 25* · Minimal Success 25 · Minor Success 25 |
| `d6` | Fail 17 · *quiet 33* · Partial 17 · Success 17 · S&Bonus 17 |
| `d8` | Fail 13 · Mishap 13 · *quiet 25* · Partial 13 · Success 13 · S&Bonus 13 · Advantage 13 |
| `d10` | Crit Fail 10 · Fail 10 · *quiet 30* · Minimal 10 · Success 10 · S&Bonus 10 · Advantage 10 · Crit Success 10 |
| `d12` | Crit Fail 8.3 · Fail 8.3 · Blemish 8.3 · *quiet 25* · Partial 8.3 · Success 8.3 · S&Bonus 8.3 · Advantage 8.3 · S&Perm 8.3 · Crit Success 8.3 |
| `d20` | Crit Fail 5 · Fail 5 · Mishap 5 · *quiet 30* · Minimal 5 · Minor 5 · Partial 5 · Success 10 · S&Bonus 10 · Advantage 10 · S&Perm 5 · Crit Success 5 |
| `d10x` | no chart column — **100% quiet**, and the only die whose floor is 0 |

### 3.2 What the spectra reveal — the case for the whole feature

Rank is not a magnitude knob, it is a **different outcome space**:

- A `d4` **can never** produce a Success, a Success & Bonus, an Advantage, or
  either Critical. Its column runs Blemish → Minor Success and stops.
- A `d10` is the first rank that can Critically Fail *or* Critically Succeed,
  at 10% each — twice a `d20`'s 5%.
- Five `d4` and one `d20` cost the same 20 points and are not the same purchase
  in any respect. That is invisible to a player adding up maximums by hand, and
  it is exactly what a 100-point build is spending its budget on.

### 3.3 Deduplication, not aggregation

Identical ranks share **one** bar (`d6 ×3`, not three identical rows) — every
one of those dice has exactly that distribution, so drawing it three times says
nothing new and is not a cross-die claim. Mixed pools get one bar per rank
**under its own source label**.

That lands ROADMAP §2b's requirement for free: a draft of Strength + Sword +
Peer Respect forecasts as three labelled rows and *resolves* as three labelled
rows — same spine, same order. The panel's flat rung list would have forecast
one undifferentiated line against a three-row result, which the completeness
critic flagged and no design had fixed.

### 3.4 The quiet grammar

Quiet is a real segment in every bar — a designed answer, not missing data
(UX.md §7.9: "the answer IS the silence"). A wholly silent die (`d10x`) renders
the single italic `quiet` rather than a 100%-wide dim bar, which would read as
a rendering failure; dash *and* word would mark one silence twice (§7.16).

**Quiet is a flat band across every rank** — 25% · 33% · 25% · 30% · 25% · 30%
for d4…d20. Advancing a pool does **not** make it quieter, and the seeded
nine-`1d6` rack is the *quietest* configuration a player starts with. Two of
the three designs built self-critiques on the opposite belief (§7).

### 3.5 The text layer

Each bar's text content is the full `word percent` list in chart order, so
copy/paste and a screen reader get the spectrum as a sentence. Segments are
`aria-hidden` geometry. This is the shipped audit rule, not a new one.

## 4. Ask 2 — the dice-value ledger

**[JOE] Count PHYSICAL dice.** `budgetOf(dice, mods)` sums `DIE_MAX` over the
dice **guaranteed to hit the felt**: the base list post-`d100` expansion, plus
**advantage partners**, capped at `MAX_PHYSICAL_DICE`.

Reroll replacements and explosion children are excluded because `composeRoll`
pushes them only *after* seeing a rolled value — counting them would make the
budget non-deterministic. Advantage partners are pushed **before any value is
rolled** (`js/rollspec.js`), so they are always countable. Verified:

| Notation | Canonical | Dice value |
|---|---|---|
| `2d20` | — | **40** |
| `1d20+1d4` | `1d4+1d20` | **24** |
| `d100` | — | 100 |
| `9d6` (the seeded Attributes shelf until 2026-08-08) | — | 54 |
| `4d6dl1` | — | 24 |
| `1d6!` | — | 6 |
| `2d20kh1` | `1d20 adv` | **40** |
| `2d20 kh1` | — | **40** |
| `40d10x` | — | 3600 |

The first two rows are Joe's stated cases, exactly.

### 4.1 Why physical dice — the spelling bug this closes

`2d20kh1` canonicalizes to `1d20 adv` at parse time, **and the canonical is
what gets stored**. Under a naive `spec.dice` count it would value 20 while
`2d20 kh1` valued 40 — two spellings of a statistically identical roll, two
budgets, and the player would never see the original spelling again to discover
he had paid 20. Counting physical dice makes both read **40**. The
inconsistency is removed rather than documented.

**The cap must be replicated exactly** or the figure becomes a second,
contradicting authority on what the table rolls: `21d20 adv` pairs only 19 (→
40 dice, 800) and `40d20 adv` pairs **zero**.

### 4.2 The word is `dice value`, never "ceiling"

"Ceiling" is false in *both* directions: `4d6dl1` values 24 and can never
exceed 18; `3d6+5` values 18 and reaches 23; `1d6!` values 6 and reaches 24.
UX.md §7.17's test is that a standing word must name the confusion it kills —
"ceiling" named it backwards. The correct word plus **one legend sentence**
("dice value — the sum of every die's highest face; modifiers, drops and
explosions are not counted") deletes the lie *and* the compensating chrome a
design had bought it off with (a trailing `*` and a footnote, both cut).

### 4.3 Edge cases, each with a stated answer

- **`d10x` = 90.** The only die with no chart column: 90 to the budget, 100%
  quiet to the forecast. Say so out loud so the disagreement reads as design.
  Size the figure for six digits — `40d10x` is legal at 3600.
- **Empty shelves read 0**, from three sources (`ensureTrio`, session shelves,
  a shelf emptied by deletion).
- **There are no unparseable pools in your own rack** — `migrateGroup` returns
  null, the loader filters, `editPoolById` refuses. The figure is total over the
  grammar.
- **No multiplication exists in the grammar** and dice are never subtracted, so
  the figure is always positive and monotone in pool size.

## 5. Where it lives

**[JOE] The instruments come on with `✎ Edit pools`** — one gate, no new
control, matching "only when editing the saved pools" exactly. Manage mode
becomes **manage-and-measure**; UX.md §7.18 must say so explicitly rather than
letting the gate widen by accident, since §7.9 framed `✎` narrowly as the
destructive gate.

**[JOE] The budget target is session-only** — module-level, dies with the tab.
No localStorage, no portable YAML, no `dice.*.v1` key. A point budget is a
field the dice never read, so this closes the goal 12 ("not a character sheet")
exposure and leaves PROFILES.md **[JOE-2]** unmade. The number `100` appears
nowhere in code.

> **AMENDED 2026-08-08 (ROADMAP C8, Joe's call).** The last sentence was read
> as *the budget may never be shown*, and under that reading CUJ6's own
> done-when — *"priced against the system's creation budget"* — was served by
> the player remembering 100 from this document while spending it. The
> figures did exist, in `js/seed.js`, imported **only by tests**.
>
> What the ruling was protecting is intact and is the part that matters: **no
> Soul Deal rule scattered across render sites.** So the number lives in
> exactly one place per system — `SYSTEMS['soul-deal'].budget` in
> `js/meanings.js`, beside the chart, which is where every other fact of that
> rulebook already lives and what makes it pluggable rather than hardcoded
> (goal 6). Shelf heads read it through one accessor; a system that names no
> budget prints a bare total, which is what D&D does. Still no storage, no
> wire key, no portable field — the session-only half is untouched.
>
> The **typed** session target this paragraph describes (§2l ⑤'s ledger
> sheet) remains unbuilt and is still the right home for *"I am building to
> 80 tonight"*. This amendment is about the system's own default, not about
> that.
>
> **BUILT 2026-08-15 (§2l ⑤).** The typed target is a per-SHELF, session-only
> number layered over the system's through one accessor — `shelfBudget` reads
> yours if you typed one and `systemShelfBudget`'s otherwise, so the shelf
> head and the sheet cannot disagree about which is in force. Still no
> storage, no wire key, no portable field: a module-level `Map`. Design and
> the reasoning: **UX.md §7.44**.
>
> One consequence worth stating, because it looks like a contradiction and is
> not: **a typed target may price a shelf the system does not.** C8 left
> Motivations budgetless so the APP would not invent a ceiling and then mark
> you red for breaking it. A number the player typed invents nothing — it is
> the player declaring their own budget, which is what ⑤ exists for.

`.pool-sec-head` becomes a flex row with `.psh-word` and `.psh-fig`, **built in
manage mode only**. `#pools-head` keeps its hairline — `.ph-rule` is the
region-rank mark and promoting it to a data track would regrade a decision
UX.md §7.17 shipped days earlier; the track and figure append *after* it, in
the slack `.ph-rule { flex:1 }` already eats. Shelf figures land on the same x
as the region figure — **one right-flush ledger column**, its one standing word
paid once at the top. Steel and ivory only; no gold in the management column
(HUE = ACT).

**Both render paths build `.pool-sec-head`** (own and foreign). The foreign
path must gain the same wrapper with no figure, or foreign shelf heads silently
lose their dress — exactly the class of change that ships half-done.

## 6. The math

### 6.1 The per-die path is nearly free

The ruling reduced it to one pass over one chart column — at most 20 lookups
per **distinct rank**, and identical ranks share a bar, so a 40-die pool costs
what a 1-die pool costs. Measured: `spectrum(d20)` **1.3 µs**,
`poolBars(40d20)` **3.6 µs**.

> **These two figures do not reproduce, and the doc's own rule says to say so
> (re-run 2026-08-15).** `node tools/pool-analysis-data.mjs` now reports
> `poolBars(40d20)` **9.9 µs** and `spectrum(d20)` **13.3 µs** — and that
> ordering is impossible, since `poolBars` calls `spectrum`. Both timings are
> microbenchmark noise on an unwarmed JIT, which means they were never
> measurements in the sense the rest of this document uses the word. **The
> CLAIM they support survives untouched and is the one that matters** — the
> per-die path is one fold over one column, identical ranks share a bar, and
> there is no DP, convolution or combinatorics in it at all. That is a
> property of the algorithm, not of a stopwatch. Treat both numbers as "µs,
> not ms", nothing finer.
>
> **Still unwarmed as of 2026-08-16** — `tools/pool-analysis-data.mjs` times
> 500 cold calls and prints whatever falls out; a re-run this morning gave 7.6
> and 3.1 µs, the right ordering by luck rather than by method. ⑥'s bench
> (`node tests/sumread.test.mjs --bench`) is what a timing in this document
> should look like: warm up, take the fastest of several batches, and print the
> method beside the number.

No DP, no convolution, no combinatorics anywhere
in the per-die path. `pmf()` and `js/odds.js` exist **only for the sum
profiles**. This is the cheapest correct thing the panel considered, and it
arrived by constraint rather than by optimization.

### 6.2 Which mechanics break the per-die read — one, not four

All three designs refused on `adv || keep || reroll || explode`. Measured
against `composeRoll`, three of those four refusals were wrong:

| Mechanic | Verdict | Detail |
|---|---|---|
| **explode** | changes **nothing** | children carry `child`, `outcomesFor` filters them, base dice keep `counts`. 200k-MC: `6d6` and `6d6!` agree within noise |
| **reroll-once** | exact | `p'(v) = [v>N]/F + (N/F)(1/F)` |
| **advantage** | exact | `p_adv(k) = (2k−1)/400`, `p_dis(k) = (2(21−k)−1)/400`; matched to 8e-4 over 400k samples |
| **keep/drop** | **the only real break**, and severe | naive `4d6dl1` says Fail 0.500 where the truth is **0.151** — a 3.3× error |

So refuse on `mods.keep` alone, in the shipped `pure`-gate voice. **Caveat:**
the 40-dice budget makes advantage a *mixture* — above 20 d20s some dice keep
the plain pmf.

### 6.3 The sum profiles (dnd, none) — unaffected by the ruling, **BUILT 2026-08-16**

A total genuinely *is* a fact of play there, so it gets the whole
distribution. `sumForecast(dice, mods)` in `js/odds.js` returns the exact pmf
of `composeRoll`'s total — values, probabilities, cdf, min/max/mean/sd/mode,
modifier folded in — or the same object carrying a typed `refusal`. Nothing is
sampled. `SYSTEMS.dnd` and `SYSTEMS.none` supply it through `forecastFor`, with
the math injected as `tools.sumForecast` exactly as `countingPmfs` is, so
`js/meanings.js` stays dependency-free.

Three engines, in `composeRoll`'s own order of operations. **Convolution** for
sums of independent dice: a dense accumulator against a sparse multiplicand, so
d10x's ten-wide support over a ninety-wide lattice costs ten multiplies per
point and not ninety. An **order-statistic DP** for keep/drop, over FACES
rather than dice, with two collapses that carry it: the kept count after
placing *j* dice is `min(k, j)` — a function of the state, not a second
dimension — and the moment the keep budget fills, the kept sum is frozen, so
the entire tail of the face order absorbs in one add. A **closed-form explosion
chain**, folded into the one face that can trigger it, which is how explosion
gets in without a state dimension of its own.

Ties needed no thought and that is the point: `composeRoll`'s sort is stable,
so WHICH die it keeps among equals is an artifact, but the multiset of kept
VALUES is not, and a sum only sees the multiset.

**Timings, warmed** — `node tests/sumread.test.mjs --bench`, node v24 on the
dev box. Method is printed with them: 40 warm-up calls, then the fastest of 5
batches of 10. §6.1's cautionary tale is why the method is printed at all.

| Pool | Exact curve |
|---|---|
| `1d20+5` | **0.002 ms** |
| `4d6dl1` | **0.005 ms** |
| `40d6` | 0.14 ms |
| `40d20` | 0.99 ms |
| `40d20 kh20` | 1.15 ms |
| `20d10x+20d20` (widest lattice) | 2.97 ms |
| **`40d20 dl1` / `dh1`** — the worst legal case | **5.5 ms** |

Median over all **302** legal single-type 40-dice specs: **0.245 ms**.

**Three of this section's claims did not survive the build**, and the pattern
is the one §7 already names — plausible figures, never regenerated:

- **"~45 ms for keep-20-of-40d20, ~110 ms worst legal case."** Measured
  **1.15 ms** and **5.5 ms** — 40× and 20× pessimistic. The conclusion the
  numbers were supporting (exact beats the 4000-sample fallback) survives and
  strengthens: measured **19×** cheaper at `40d20 kh20`, **4.5×** at the worst
  case. The *worst legal case* is also not the one this section assumed. It is
  not keep-half; it is **keep-almost-everything** (`dl1`, `dh1`), because the
  keep budget never fills and the collapse never fires.
- **"~0.25 ms for exact convolution at 40d20."** Measured **0.99 ms** warmed.
- **"Detect mixed-type keep/drop with `new Set(spec.dice).size === 1`."**
  **Insufficient, and this document contains its own counter-example one
  paragraph earlier.** §6.2's caveat — *above 20 d20s some dice keep the plain
  pmf* — means `21d20 adv kh3` is **one type and two distributions**: the
  40-die cap pairs only 19 of the dice, so nineteen roll max-of-two and two
  roll a plain d20. The type test waves it through and the iid DP would be
  confidently wrong. The shipped guard compares the counting **pmfs**, which
  subsumes the type test and the reroll and advantage cases with it.

**And one "genuine gap" is not one.** *Combined adv+explode* was listed here as
a second gap beside mixed-type keep/drop. It is not a category at all. The
loser of an advantage pair is `counts: false` **before** `composeRoll`'s
explosion loop looks at the queue, so the exploding population is exactly the
winners and their resolved pmf is already `advPairPmf`. What actually bites is
the 40-slot budget the pairs spend first — and that is the ordinary VOID /
FREE / BINDING classification `js/odds.js` has had since ①:

| Spec | Tier | Answer |
|---|---|---|
| `1d20 adv !` | FREE | exact — pinned against exhaustive enumeration |
| `1d20+1d4 adv !` | FREE | exact — same |
| `20d20 adv !` | VOID | exact, explosion ignored; the pairs took all 40 slots |
| `19d20 adv !` | BINDING | refused (`explode-cap`) — 2 slots, 19 candidates |

The parenthetical this section offered as evidence — "`20d20 adv !` yields zero
children" — describes the VOID row, which is the exactly-computable one.

**The three refusals**, typed, and each detected before a number is computed:

| Code | When | Why it cannot be exact |
|---|---|---|
| `mixed-keep` | keep/drop over dice that do not all roll ONE distribution | the DP's sequential-multinomial decomposition needs an exchangeable population; with two populations "how many dice are left" stops being a sufficient statistic |
| `reroll-cap` | previewOf's reroll BINDING tier | which die loses the last cap slot depends on every earlier die, so the dice stop being independent |
| `explode-cap` | previewOf's explode BINDING tier | the same, for children |

**A sum refusal is `kind:'sum'` with a `refusal` field — never
`kind:'refusal'`,** and the distinction is load-bearing rather than tidy.
`js/main.js` prints a `kind:'refusal'` **instead of** the min/avg/max line; but
`previewOf` is still exact for the AVERAGE of a pool whose CURVE cannot be
drawn (`8d8+2d20 kh4` is exactly such a pool — `eTopK` is tie-proof across
mixed types where the distribution DP is not). Borrowing that kind would delete
a true read to print a sentence about a different one. The refusal costs the
player the curve and not the average.

**Guard on allocation, not accuracy** — the ruling stands, and nothing here
allocates more than a `(41 × k·maxFace)` scratch pair.

If sampling ever ships it must be **seeded from `res.canonical`** and labeled
"sampled — 4,000 rolls", never a bare `≈`: the interpretation profile is a
*room* setting, and two seats reading different odds for one pool would be the
only number in the app that diverges per browser. **It did not ship and should
not**: the exact path is 4.5–19× cheaper than the fallback it was proposed to
protect, and where it cannot answer it says so.

### 6.3a What the rendering pass is handed

The engine landed alone, on purpose: `js/main.js` was being written by another
pass in the same hours. **Nothing renders yet**, and that is not a half-ship —
`kind:'sum'` is a kind today's `renderPopEcho` and `renderCmdState` do not
match, so both fall through to the shipped `fmtPreview` line and the app is
byte-identical until someone renders it.

```js
sumForecast(dice, mods) -> {
  kind: 'sum',
  exact: true,
  refusal: null,
  modifier,                 // already folded into every value below
  min, max, mean, sd,       // mean/min/max agree with previewOf, pinned
  mode: {value, p},
  values: [ …ascending totals with p > 0… ],   // gaps are real: 1d6! has no 6
  probs:  [ …P(total = values[i])… ],
  cdf:    [ …P(total ≤ values[i])… ],
}
// or, refused:
{ kind: 'sum', exact: false, refusal: {code, reason}, values: [], min: null, … }

sumAtLeast(fc, n) / sumAtMost(fc, n)   // → 0..1, or null on a refusal
SUM_REFUSALS                           // {code: reason} — the three sentences
```

The wiring is **one word at each of two call sites** — `js/main.js` imports
`sumForecast` beside `countingPmfs` and passes `{countingPmfs, sumForecast}` to
`forecastFor`. Until it does, `forecastFor` returns `null` for the sum
profiles, deliberately and silently: the popover's preview slot is on the other
side of that call, and a profile that threw on the narrow tool bag would take
the popover down with it.

Three things the renderer must not re-derive. **`sumAtLeast` is the only place
this app should do cdf arithmetic** — it returns `null` on a refusal precisely
so a caller cannot print `0%` where the honest answer is "we do not know".
**A refusal still owes the min/avg/max line** (§6.3) — print `fmtPreview`
beside the refusal sentence, never instead of it. And **`values` is sparse**:
a bar per array slot draws `1d6!`'s three unreachable totals as zero-height
bars unless the renderer bins by value.

### 6.4 Two free invariants, both worth pinning

- Every bar's segments sum to exactly 1.
- `p(Success) === p(Success & Bonus)` at **every rank** — d4 0/0, d6 1/6, d8
  1/8, d10 1/10, d12 1/12, d20 2/20. A spectrum that ever draws those two
  segments at different widths has a bug. *(Scope corrected during the ②
  build, 2026-08-06: this holds for PLAIN spectra — equal face counts ×
  uniform pmf. Advantage legitimately skews it, 52/400 vs 60/400, and a
  reroll threshold at or above a Success face would too; the shipped unit
  test pins the invariant on plain ranks only.)*

### 6.5 The aggregate reads, preserved but not shipped

Poisson-binomial, `dp[k] = dp[k]·(1−pᵢ) + dp[k−1]·pᵢ`, exact for mixed-rank
pools, ≤1600 ops. Generated, for the record:

| Pool | success-or-better ladder |
|---|---|
| `3d6` | 0× 13% · 1× 38% · 2× 38% · 3× 13% |
| `1d20+1d8` | 0× 23% · 1× 50% · 2× 27% |
| `1d20+1d8+3d6` | 0× 2.8% · 1× 15% · 2× 31% · 3× 32% · 4× 17% · 5× 3.4% |

Written down so that if the ruling is revisited the math is not re-derived —
and so nobody re-ships the fabricated vector (§7).

## 7. Provenance, and the claims that did not survive

Run as a three-entrant judged design panel — *The Reckoning Pass* (minimalist),
*THE ASSAY* (dedicated analysis mode), *The Ghost Roll* (forecast-as-result) —
scored by three adversarial lenses (doctrine · player · implementer) plus a
completeness critic. The Ghost Roll won 2–1. Then Joe's ruling (§2) cut deeper
than any lens, and the per-die half of the design is his, not the panel's.

**Refuted by the adversarial pass, recorded so they stay dead:**

- Promoting `.ph-rule` from hairline to data track — regrades §7.17's
  region-rank mark to save appending one span.
- The word **ceiling** and its compensating `*` + footnote (§4.2).
- A **gold** DC band on the value axis — gold means TOTAL in the sum world;
  ivory instead.
- A `quiet` chip standing beside worded chips — §7.16's exactly-once silence
  rule.
- Tier words carrying their **ceremony glow** into a 312px management popover.
- Widening `.oc-ledger` to three columns — its `display: contents` rows shear
  on a stray item. Fork the **grid**, keep the **chips**.
- The **`k>4 || n>12` keep/drop accuracy threshold** — exact is ~3× cheaper
  than the fallback it was protecting.
- **`40d20!` as a 4.6M-op worst case** — it cannot occur; `40d20!` *is*
  `40d20`, the guard breaks before the first child.
- The **"50× cheaper than Monte Carlo"** claim — ~2×. The case for exactness is
  correctness, not speed.
- **"Assay" / "Rack" as player-visible words** — the chrome word is *pools*,
  and §7.16's rule is "unsurprising over cute". The surface stays nameless, as
  the ± popover is.

**Three unverified claims, caught before they shipped** — the reason
`tools/pool-analysis-data.mjs` and §13 exist:

- THE ASSAY printed a `3d6` success-or-better ladder of 35.2 / 42.2 / 18.7 /
  3.9. That implies p ≈ 0.29; the real p is exactly 3/6, giving
  12.5 / 37.5 / 37.5 / 12.5. A player judge was about to graft it verbatim.
- The survey claimed the d20 column has **eight** null faces and that a d20
  pool is "majority-quiet". It has **six** (faces 4–9) = 30%, nowhere near a
  majority — and quiet is a flat band across every rank (§3.4). Two designs
  built self-critiques on the bad number.
- The verification pass claimed **four smoke scenarios** break on
  `.pool-sec-head`, naming `portable` — which does not assert on it at all.
  The real answer is **two assertions in one scenario** (§10), and the
  difference matters: it is the gap between "this feature destabilizes the
  test gate" and "the design already contains its own blast radius".

## 8. Decisions taken **[JOE, 2026-08-05]**

1. **No aggregation. Per-die only.** Every number on screen describes exactly
   one die. Accepted consequence: the forecast never prints "2× Success".
2. **Dice value counts physical dice** — base + advantage partners, capped at
   40; reroll and explosion excluded as value-conditional.
3. **The budget target is session-only** — no storage of any kind.
4. **The instruments come on with `✎ Edit pools`** — manage-and-measure.

## 9. Still open

*Two of these were taken by the ⑤ build, 2026-08-15, and one more by ⑥'s
engine, 2026-08-16; all three are struck below rather than deleted — the
reasoning that made them open is what made the answers defensible. Everything
not struck is still genuinely open.*

*⑥'s state: **the math is built and proved, and nothing renders it.**
`forecastFor` returns a `kind:'sum'` distribution for `dnd` and `none` (§6.3,
§6.3a) the moment `js/main.js` passes `sumForecast` in its tools bag, which it
does not yet. Four of the questions below are questions about that rendering —
which popover doors forecast, what a pool-scope forecast forecasts, the offer
card, and UX §2.1's odds line — and none of them was answered by building the
engine. They got sharper: there is now an exact number to decide about.*

- **Does the parser stop collapsing `2d20kh1` → `1d20 adv`?** The physical-dice
  count closes the *budget* bug either way; what remains is whether notation
  should silently rewrite itself. Touching it means touching canonical form, a
  tested byte-stable fixed point — well outside this feature's blast radius.
- **Portable-YAML forward compatibility.** Any new key is a *hard* version
  break today: the parser aborts the whole document on an unrecognized
  top-level line, so a file written by a newer client is unreadable by an older
  one, entirely — against PROFILES.md Step 2's hand-the-file-around premise.
  Skip-and-warn tolerance, or does every field stay a break? (§9b queues the
  first new per-pool scalar.)
- **Which popover doors forecast.** `openShelfPopover` binds to a **landed**
  roll, so right-clicking a peek would pin a forecast beside the evidence of
  what the roll actually did. All four doors, or group + draft only?
- **What a pool-scope forecast forecasts.** `stageGroup` **drops** mods and dc
  ("set aside — re-add via ±"), so a saved `4d6dl1` stages as plain `4d6` —
  while the collapsed rail's `rollRailPool` rebuilds and rolls it *with* mods.
  One saved pool, two real distributions. Honest option: forecast the base dice
  and show the set-aside mods as the whisper the stage path already shows.
- **The offer card.** It carries dice, mods, dc, visibility and experience, and
  a claimant is deciding whether to accept — with stakes UX.md declares public
  on every rung. Odds line, or a written refusal?
- ~~**Mixed adv+explode / mixed-type keep/drop** (sum profiles only): simulate
  the 40-slot budget over pmfs, or refuse with the `pure`-gate grammar?~~
  **TAKEN 2026-08-16 by ⑥'s engine: REFUSE, and the question was one question
  and a mistake.** Mixed-type keep/drop refuses as `mixed-keep` — broadened to
  any pool whose counting dice do not share one distribution, because the type
  test this document proposed misses `21d20 adv kh3` (§6.3). *Mixed
  adv+explode* is not a case: it is exact below the 40-slot cap and refuses as
  `explode-cap` above it, which is the classification `js/odds.js` already had.
  Simulation was refused on its own terms — the exact path is **4.5–19×
  cheaper** than the 4000-sample fallback that was proposed to protect it.
- ~~**Where the rack figure lives.**~~ **TAKEN 2026-08-15: it stays in the
  head, and the figure IS the door.** The scroll problem is real and neither
  location fixed it — a foot figure scrolls away just as a head figure does,
  and the third sticky rung was refused. What answers it is **altitude**: the
  figure becomes the button that opens the ledger sheet, and a surface that
  flew out of a control does not scroll with the rack, so the reading you
  opened stays put while you scroll shelves under it. No second location, no
  new control (§5's one-gate rule), nothing pinned. Residual named in UX.md
  §7.44: the sheet does not re-anchor, so scrolling far enough leaves it over
  a head that has left — the shipped `.set-menu` grammar, matched rather than
  re-invented.
- ~~**The e2e tag.**~~ **TAKEN 2026-08-15: no new tag.** `groups` + `meanings`
  + `chrome` carried both ⑤ and §1's struck-die work without strain, and the
  pre-reserved `capture` should be spent by the pass that actually needs it
  (TESTING.md names it for step-5). A tag minted for one feature is a tag
  nobody selects. *(Open again the moment ⑥ ships a math surface with its own
  failure modes — that is a different argument, not this one re-run.)*

## 10. Verification the build must carry

**Existing scenarios this BREAKS — exactly two assertions, in one scenario.**
Appending a figure makes `.pool-sec-head`'s textContent `'Attributes54'`: flex
`gap` is CSS, textContent concatenates raw. There are **nine** assertions on
`.pool-sec-head` text across four scenarios, and the design's own
manage-mode-only rule protects seven of them by construction:

| Scenario | Line | State when read | Verdict |
|---|---|---|---|
| `sheet-pass` (smoke) | 2104 | manage ON (`setPoolsEditMode(true)` @2101) | **BREAKS** |
| `sheet-pass` (smoke) | 2118 | manage ON (still) | **BREAKS** |
| `sheet-pass` (smoke) | 2096 | rest — "rest shows populated shelves only" | safe |
| `sheet-pass` (smoke) | 2150 | rest (`setPoolsEditMode(false)` @2148) | safe |
| `sheet-pass` (smoke) | 2160 | rest (`setPoolsEditMode(false)` @2158) | safe |
| `shared-pools` (smoke) | 2383, 2422 | foreign rack — no figure there | safe |
| `terminology` (smoke) | 2714 | rest | safe |
| `soul-seed` (`groups`) | 2067 | rest | safe |

Re-point the two breakers at `.psh-word`. **This is a design property, not
luck**: the figure is *built in manage mode only*, so every rest-state and
foreign-rack assertion is untouched. **Build it CSS-hidden instead and all nine
break** — `display:none` still concatenates into `textContent`. That is the
whole reason §5 says *not built*, rather than hidden.

Regenerate the table rather than trusting it — line numbers move:

```bash
grep -n "pool-sec-head" tests/e2e/scenarios.mjs
```

*(Corrected 2026-08-05: an earlier draft claimed "four smoke scenarios" and
named `portable`, which does not assert on `.pool-sec-head` at all. Verified
against the tree; same class of error as the two fabricated numbers in §7.)*

**New scenarios.** `pool-forecast` (tags `groups`, `meanings`) — the exact d6
spectrum, three identical d6s rendering **one** bar not three, a mixed pool
rendering one bar per rank under its source label, the `2d20 kh1` refusal, a
bare `d10x` rendering the single italic `quiet`, and a two-table step where B
flips the room system while A's popover is open. `rack-dice-value` (tags
`groups`, `chrome`) — absent at rest → `setPoolsEditMode(true)` → shelf and
rack values → edit a d6 to a d20 → both moved → `Done` → absent → foreign rack
→ absent, plus **`1d20 adv` and `2d20 kh1` both reading 40**.

**Units** in `tests/odds.test.mjs`, **hand-appended to `package.json`'s literal
`&&` chain** — there is no glob, so a suite nobody adds there passes forever.
Cover: the budget cases including both adv spellings; all six spectrum vectors;
the two invariants (§6.4); the five cap regressions (`40d20! === 40d20`,
`40d20 adv` pairs 0, `21d20 adv` pairs 19, `40d6 ro<=3` rerolls 0, `2d6 kh5`
keeps 1); and MC cross-validation against `composeRoll`.

**⑥'s units are `tests/sumread.test.mjs`** (106 checks, 2.4 s, appended to the
same literal chain), and they answer to four standards *because the convolution
agreeing with itself is not evidence*:

1. **Exhaustive enumeration of `composeRoll`** — 47 specs, every rng draw
   branched over its real faces with probability carried down, compared
   distribution-to-distribution at 1e-12. The mechanics authority's own answer.
   Exploding pools stay enumerable because only a max face branches further:
   `4d6dl1` is 1,296 leaves and `1d20 adv !` is 3,364.
2. **Published closed forms nobody in this repo derived** — the 2d6 and 3d6
   triangles, the 4d6-drop-lowest table over 1296, `P(max of 2d20 = k) =
   (2k−1)/400`, d100 uniform on 1..100, and `1d6!`'s three unreachable totals.
3. **`previewOf`'s min/avg/max on every exact case**, including the 40-dice
   pools no oracle reaches. It gets there by an order-statistic *identity* and
   a Poisson-binomial; this gets there by a face DP. They share the per-die
   pmfs and nothing else, so agreement is two derivations meeting.
4. **Seeded Monte Carlo** with a 5σ *per-bucket* band, not just a mean — a
   shifted or mis-shaped curve fails that even when the mean survives.

Plus the relation that keeps the two reads honest, fuzzed over 400 random
legal specs: **every spec this engine calls exact is one `previewOf` also calls
exact**, never the other way round. If it ever inverts, one surface is printing
a curve the other will not average.

**Hooks.** `get rackDiceValue` → `{total, shelves:[…]}` — **named to avoid
`shelfValue`, already a live concept** (a die's face on the collect shelf) —
plus `forecast(notation)`, `get forecastSheet`, `openForecastSheet(scope,key)`,
`setForecastTarget(n)`.

*(Corrected by the ⑤ build, 2026-08-15.* The last three names were pencilled
in when ⑤ was imagined as ONE sheet carrying both reads. It carries the
**ledger** only — the forecast bars stayed in `#pop-preview`, where §9b's icon
strip is reserving room above them — so the shipped hooks are
`openLedgerSheet()` / `closeLedgerSheet()` / `get ledgerSheet` /
`setShelfTarget(label, n)`. A hook named for a surface it does not open sends
the next reader looking for a spectrum inside a ledger. `ledgerSheet` reads
the **rendered** sheet rather than the session Map, because the property worth
pinning is that the sheet and the shelf heads agree, and a hook reading the
Map could not tell you they had stopped.

*§1's struck-die work adds one more:* `outcomeRows(surface)`, `surface` being
`'banner' | 'verdict' | 'peek'` to match the shipped `cardActs`. It too reads
the **rendered** chips — the bug it exists to catch lived between the profile
and the paint, so a hook reading `outcomesFor` would have been green
throughout.)

**Copy constraint.** The `terminology` smoke sweep covers `#left-panel` and
`#mods-popover` and fails on `/\btrays?\b|\bgroups?\b|\bcompose\b/i` across
text, `title`, `placeholder` and `aria-label`. A "source-grouped forecast"
label or a "composed pool" tooltip fails `npm test`.

## 11. Reconciliation

- **Tier 4 §5 "Local roll statistics"** is a **dependent**, not a sibling —
  there is no other source of an expected value in the tree, so this supplies
  §5's *expected* term and §5 is the *observed* half. **Unblocked 2026-08-16:**
  `sumForecast(dice, mods).mean` is that term, and `.sd` came with it, so
  "you are 1.4σ under expectation on this pool" is arithmetic §5 can now do
  rather than a number it has to invent. §5's own unnamed blocker is untouched:
  online the client persists no log at all (`if (!netOnline) save(LS_LOG, log)`),
  so there is no durable substrate for a per-player distribution.
- **UX.md §2.1's promised odds line is NOT delivered here** — §2.1 puts it on
  the *intent card*, public and mid-ceremony. This builds the math that line
  will need and leaves its slot open, or it gets marked shipped and quietly
  never appears.
- **§2b (multi-pool rolls)** is solved by the ruling, not despite it (§3.3).
- **§9b (pool icons)** already claims the popover identity strip for its
  picker. Keeping the forecast in `#pop-preview`, below the strip's hairline,
  is what leaves that room — a reason, not an accident.
- **PROFILES.md** is fully decoupled: the one persistence question is closed
  session-only. Note the gap that leaves — gating on `poolsEdit` forces
  `poolsOwner = null`, so the budget read is **your own rack only** and does
  not serve PROFILES CUJ1, the organizer arranging *someone else's* character.
  *(Closed 2026-08-06 without touching §2l: [PROFILES.md](PROFILES.md) §4
  makes authoring a **rack swap** — the organizer loads a profile into their
  own rack, so the ledger, the bars and manage mode read it unmodified. The
  alternative, parameterizing every management surface off `poolsOwner`, is
  recorded there as rejected.)*

## 12. Goals served

**4** — goal 4 names *summing values* explicitly as toil the system owes the
player; this is that sentence applied to character creation. **5** — organized
over realistic. **6** — the read is produced by the profile registry; no Soul
Deal rule and no `100` appears outside `js/meanings.js`, and the dice-value
figure is `DIE_MAX` arithmetic, identical under `soul-deal`, `dnd` and `none`.
**7** — render-time client analysis: no endpoint, no wire key, no room setting,
no URL state, no new `dice.*.v1` key, no `portable.js` change, no build step.
**12** — was the one exposure, closed by the session-only ruling (§5).

⑥ adds nothing to that list and subtracts nothing from it: `sumForecast` is a
pure function of `(dice, mods)` with no rng, no clock and no storage, supplied
**by the profile** (goal 6) rather than queried by a renderer — so two seats
reading one pool read the same curve, and a system that does not sum is not
asked to.

## 13. Claims verified against the tree

Every load-bearing factual claim above, with the command that re-checks it.
Verified 2026-08-05 at `1457c50`. Line numbers move; the commands do not.

**Re-run 2026-08-16 for ⑥'s engine. Three rows below had gone stale — the
table's own point, made against itself.** Struck inline rather than deleted:

| Row | Was | Is |
|---|---|---|
| `#pop-preview` is unasserted | **0** | **22** hits across the forecast scenarios ①–④ shipped. The reason it was safe to rewrite is gone: **the rendering pass now breaks tests if it rewrites that node**, which is the good outcome and needs to be planned for rather than discovered |
| `MAX_PHYSICAL_DICE` / `EXPLODE_CHAIN_CAP` are module-private | not exported | **both are `export const`** (`js/rollspec.js:33–34`) — slice ① needed them, and `js/odds.js` has imported them ever since. `tools/pool-analysis-data.mjs:78` still mirrors the constant under a `TODO: import once js/rollspec.js exports it` that has been satisfied for ten days |
| `test:unit` hand-lists **8** files | 8 | **18** with `sumread` |

| Claim | Check | Result |
|---|---|---|
| ~~No e2e asserts `#pop-preview`~~ — **REVERSED, see above** | `grep -c pop-preview tests/e2e/scenarios.mjs` | **22** |
| `renderCmdState` is shared by the command box *and* the quick palette | `grep -n renderCmdState js/main.js` | called at **5578** and **8998** |
| `rerenderInterpretation` never repaints the popover | `grep -n -A20 'function rerenderInterpretation' js/main.js` | log · shelf markers · verdict · banner **only** |
| The `terminology` sweep bans the words a forecast might reach for | `grep -n 'banned = ' tests/e2e/scenarios.mjs` | `/\btrays?\b\|\bgroups?\b\|\bcompose\b/i` over `#left-panel`, `#mods-popover`, … |
| `test:unit` is a literal `&&` chain with no glob | `grep -n 'test:unit' package.json` | **18** files, hand-listed — the property holds, the count did not |
| ~~`MAX_PHYSICAL_DICE` / `EXPLODE_CHAIN_CAP` are module-private~~ | `grep -n 'MAX_PHYSICAL_DICE\|EXPLODE_CHAIN_CAP' js/rollspec.js` | **`export const`** (:33, :34) since ① |
| Advantage makes ONE type into TWO distributions past the cap | `node -e "…countingPmfs(Array(21).fill('d20'), {adv:'adv'})"` | 19 pairs + 2 plain — the `mixed-keep` counter-example (§6.3) |
| Every spec ⑥ calls exact, `previewOf` also calls exact | `node tests/sumread.test.mjs` | fuzzed over **400** random legal specs |
| `DIE_MAX` already exists three times — do not mint a fourth | `grep -rn 'DIE_MAX = ' js/` | exported `rollspec.js:30`; private `meanings.js:50`, `notation.js:89` |
| `shelfValue` is already a live concept (a die's face on the collect shelf) | `grep -c shelfValue js/main.js` | **7** uses — hence `rackDiceValue` for the debug hook |
| `stageGroup` drops mods/dc, so a staged pool ≠ the saved spec | `grep -n 'set aside' js/main.js` | `:6142` — "set aside — re-add via ±" |
| Advantage partners are deterministic; reroll replacements are not | read `js/rollspec.js` `composeRoll` | partners pushed **before** `values` is computed (~:100–110); rerolls **after**, gated on a rolled value (~:127–140) |
| `.ph-rule` is the region-rank hairline that the figure appends after | `grep -n ph-rule css/style.css` | `:969  #pools-head .ph-rule { flex: 1; … }` |
| Online, the client persists no log — §5's second blocker | `grep -n LS_LOG js/main.js` | 3 writes, each guarded `if (!netOnline)` |
| `migrateGroup` fails closed, so your own rack has no unparseable pools | `grep -n -A6 'function migrateGroup' js/main.js` | `return null` on a non-object |
