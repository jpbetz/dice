# Deploying the Dice Table

How this app gets onto the public web, why each choice was made, and what it
costs. Researched and fact-checked against official pricing/docs pages on
2026-08-04; re-verify prices if acting on this much later.

**The decision: Google Cloud Run, us-central1, one instance, deployed from
source. Expected hosting bill: $0.00/month (inside the always-free tier).
Total cost of the whole setup: the domain, ~$11/year.**

## Why Cloud Run

The app is unusually serverless-friendly: `server.js` reads `$PORT`, writes
nothing to disk, and all state is in-memory rooms that are *designed* to be
disposable (a room dies when the last player leaves; `js/net.js` silently
re-joins after a server restart). The only hard constraints are:

1. **One instance.** Rooms live in one process's memory, so every player must
   hit the same instance → `--max-instances 1`.
2. **Long-lived SSE.** Streams stay open for a whole game session, so the
   platform must support streaming responses and bill in a way that survives
   that.

On Cloud Run with request-based billing (the default), an instance with an
open SSE stream counts as actively serving a request, so it bills at active
rates for the whole session — and that is exactly what the free tier absorbs:

- Free per month (per billing account): 180,000 vCPU-seconds, 360,000
  GiB-seconds, 2M requests, 1 GiB North America egress.
- Our profile (~40 h/month of open streams at 1 vCPU / 512 MiB): 144,000
  vCPU-s (80% of the allowance), 72,000 GiB-s (20%). **$0.00.**
- Beyond the free tier the marginal cost is ~$0.09 per session-hour. Even a
  hammered-24/7 worst case is capped by `--max-instances 1` at ~$60/month,
  and the $5 budget alert (`make setup`) trips long before that.

Build/registry are also free at this scale: Cloud Build gives 2,500 free
build-minutes/month (a deploy uses ~2–4), Artifact Registry gives 0.5
GiB-month free (the cleanup policy keeps only 2 images).

### The flag set, justified

`make deploy` runs `gcloud run deploy` with exactly these; don't tune them
without re-reading this:

| Flag | Why |
| --- | --- |
| `--cpu 1` | **Do not lower.** Any fractional CPU forces `concurrency=1` (platform rule), and one concurrent request cannot hold a second player's SSE stream on a single pinned instance. 1 vCPU is the floor for this app, not a luxury. |
| `--memory 512Mi` | 20% of the free GiB-s allowance at our usage; plenty for Node + 6 streams + static serving. |
| `--concurrency 80` | Default; 6 players + asset fetches fit trivially (limit is 1,000). |
| `--timeout 3600` | Platform maximum. Every SSE stream is force-closed at 60 min with a 504; the browser's `EventSource` auto-reconnects (the server already sends `retry: 2000`) and the instance is **not** terminated, so the room survives — a 4-hour session is just 4 silent reconnects per player. |
| `--min-instances 0` | Scale to zero between sessions; rooms are disposable by design. |
| `--max-instances 1` | All rooms in one process. Also the cost ceiling against abuse. |
| `--cpu-boost` | Faster cold start (~1 s for a small Node app); only the first player of the night feels it at all. |
| `--allow-unauthenticated` | It's a public table for friends. Server-side caps (rooms/players/body sizes) already bound abuse; billing is bounded by max-instances. |
| Request-based billing (default) | Cheaper than instance-based at this usage and skips the paid idle tail. Background timers (heartbeat, reaps) stall only when *zero* streams are open — harmless here, since with no players there is nothing to time. |

Deploy from source (no Dockerfile): the Node buildpack runs `npm start` →
`node server.js`, honors `engines.node`, and installs nothing (zero deps).
`.gcloudignore` keeps tests/docs/tools out of the upload.

## One-time setup (your side)

Your settings (project id, billing account, domain) live in
`deploy/config.mk` — **gitignored**, so they stay local. `make init` creates
it by asking four questions; every other target tells you exactly that if
the file is missing. **Whenever you're unsure where you left off, run
`make status`** — it checks real state top to bottom and prints the exact
next command.

```sh
gcloud auth login    # once, in a browser
make init            # asks: billing account, project id, region, domain
make setup           # creates project, links billing, enables APIs, $5 budget alert
make deploy          # builds + deploys; prints the *.run.app URL
make cleanup-policy  # once, after that first deploy
```

That's it — the app is public at the printed `https://dice-….run.app` URL and
you can share `?room=yourparty` links immediately, domain or no domain.

## The domain

**Recommendation: `thedicetable.com` — confirmed available (RDAP-checked
2026-08-04), matches the app's name, ~$11/year.** Also available if you
prefer the flavor: `dicefelt.com`, `feltdice.com`, `rollfelt.com`,
`diceceremony.com`, `rollsouls.com`, `souldeal.app`, `dicetable.dev`.
Taken: `dicetable.com`, `souldeal.com`, `dicetable.app`, `dice.party`.
(RDAP "available" can't rule out registry premium pricing — the registrar
search page gives the final word.)

Registrar: **Porkbun** ($11.08/yr for .com, first year = renewal, free WHOIS
privacy, plain DNS, zero footguns) or **Cloudflare Registrar** (~$10.46/yr
at-cost, but locks the domain to Cloudflare nameservers — fine *only if* the
Cloud Run records stay grey-cloud/DNS-only). Avoid Namecheap teaser pricing
(renews at $15–18). Avoid `.gg` ($52/yr), `.io` ($50/yr), `.game` ($300/yr),
and the `.fun`/`.live` $2.57 teasers (renew at $26–31/yr). **Prepay several
years before Nov 1, 2026** — .com wholesale rises ~7%/yr through 2030.

Wiring (once, ~20 minutes end to end). After buying, set `DOMAIN` in
`deploy/config.mk` (or accept the default `make init` wrote), then:

```sh
make verify-domain   # opens Search Console → add the TXT record it shows
                     # at your registrar, complete the check there
make domain          # creates the mapping; prints A + AAAA records to add
make status          # re-run until it says: live — walks you through the rest
```

Add the printed records at the registrar (DNS-only — never proxy them:
Google's cert issuance fails behind Cloudflare's orange cloud, whose Host
override is Enterprise-only anyway). The managed cert lands in ~15 min
(worst case 24 h); `make domain-status` shows certificate detail.

Domain mapping is free but officially still **pre-GA** ("latency issues" per
Google's own docs — fine for a friends' table; supported in us-central1). If
it ever misbehaves, the fallbacks are: use the `run.app` URL directly ($0),
or a global external ALB (~$18/mo — rejected on cost). **Never** put Firebase
Hosting rewrites in front of this app: Hosting hard-caps requests at 60 s,
which kills every SSE stream.

## Operating it

- **Deploy between game sessions, not mid-game.** `max-instances 1` is soft
  during a rollout: old and new revisions briefly coexist and a room can
  split across them. Mid-game it degrades to the known restart blip (clients
  silently re-join), but why spend the blip.
- `make logs` for the server log; `make url` for the address.
- The $5/month budget alert (from `make setup`) emails at $2.50 / $4.50 /
  forecasted-$5. Expected steady state is $0.00 + the domain renewal.
- Before the first real game night, leave a test room open >60 minutes to
  watch one hourly reconnect happen cleanly (it should be invisible).
- Free-tier accounting is per *billing account*: other Cloud Run/Functions
  workloads on the same account share the same free pool.

## Rejected alternatives (researched 2026-08-04)

| Option | Verdict |
| --- | --- |
| Fly.io | Best runner-up (~$0.20–1/mo): per-second machine billing, no request timeout, autostop when the last player leaves. Loses only because Cloud Run is $0. The escape hatch if Cloud Run's SSE timeout or pre-GA domain mapping ever grates. |
| Azure Container Apps | Genuinely $0 (free grant ~4× our usage) but default ingress cuts every SSE stream at 240 s; the 1-h fix needs paid ingress. |
| Cloudflare Workers/Containers | Containers run `server.js` fine but require the $5/mo Workers Paid plan; Workers/DO would mean rewriting the server. |
| AWS App Runner | Closed to new customers (2026); also had a hard 120 s timeout and no scale-to-zero. Lambda streaming: each SSE client gets its own sandbox — in-memory rooms impossible. |
| Render / Railway | Free tiers spin down or hard-stop mid-session; paid tiers are $5–7/mo flat. |
| GCP e2-micro free VM | $0 compute but ~$3.65/mo for the IPv4 + you own TLS/patching. More toil, more cost than Cloud Run's $0. |
| Oracle always-free ARM | Documented idle-reclamation policy squarely matches this app's quiet weekdays. Don't host game night on it. |
