# Deploying the Dice Table

> **Guidance, not law (2026-09-02).** Every rule, law, ruling, invariant, gate
> and budget in this file is a dated lesson somebody paid for, with its reason
> beside it. Read it before building near it; a design may set any of it aside
> by saying, in the commit, which rule it set aside and why. The eight things
> that may NOT be set aside are in [GOALPOST.md](GOALPOST.md) — where this file
> and that one disagree, this file is history.


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

### The front end hides departures (2026-08-06)

**A closed tab does not close the stream the container sees.** Cloud Run
terminates the client connection at its front end, so when a browser goes away
the container's request stays open and its writes keep succeeding into the
proxy. `'close'` never fires and no write ever throws — which were the app's
only two ways of noticing a player had left. Seats accumulated on the roster
until the platform force-closed the request at `--timeout 3600`, an hour later.

It is visible in the logs whenever it recurs: `/api/events` request latencies
of exactly **3601 s** are abandoned streams running to the ceiling, and

```sh
gcloud run services logs read dice --region us-central1 --limit 200
```

showing `players=N` climbing with no matching `left` lines is the same fact
from the other side.

The app no longer trusts the transport for this (`server.js`
`LIVENESS_TIMEOUT_MS`): a `pagehide` beacon says so on the way out, and the
heartbeat is a question the client answers with `POST /api/pong`, so a stream
that stops answering is dropped whatever the socket claims. **Anything added
here that infers presence from a socket will be wrong in production and right
on your laptop** — that asymmetry is what made this expensive to find.

Nothing about the flag set causes it; lowering `--timeout` would only shorten
the ghosts, at the price of more reconnects for everyone. Any proxying platform
behaves this way, so the escape hatches in the table below inherit the problem
and the fix alike.

Deploy from source (no Dockerfile): the Node buildpack runs `npm start` →
`node server.js`, honors `engines.node`, and installs nothing (zero deps).
`.gcloudignore` keeps tests/docs/tools out of the upload — and, since
2026-09-03, developer mode's own files: `js/devmode.js`, `js/devui.js`,
`css/dev.css` and `dev.html`, the pop-out page that mounts the panel in its
own window (docs/DEVMODE.md §8). `app.mode: production` already makes the door
refuse, but that is a value in a file; withholding the bytes is the answer
that does not depend on a setting. `js/main.js` imports the panel dynamically
and latches on the miss, so the deployed tab logs one warn if anyone presses
the backtick and is otherwise a tab; `/dev.html` is a 404 there, which is the
right answer for a page whose first import would 404 anyway.

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

### Which commit is live

```sh
make health          # or: curl -s https://<service>/health
```

```json
{"ok":true,"sha":"595d505183c7","node":"24.14.1","uptimeSec":118,
 "rooms":2,"maxRooms":500,"players":5,"streams":5,"rssMb":91}
```

`make deploy` bakes the commit in (`--update-env-vars GIT_SHA=…`), so `sha` is
the answer to "which build am I looking at" without triggering behavior and
inferring — which is how the frozen-mtime bug had to be diagnosed. Read it
against `make -s print-sha` locally. Three answers that are not a plain sha:

| `sha` | What happened |
| --- | --- |
| `…-dirty` | The tree that shipped was **not** HEAD. `gcloud run deploy --source .` uploads the working directory, so this build contains uncommitted edits and no commit describes it. |
| `unknown` | The deploy did not go through this Makefile (or `git` was unavailable when it did). The service is running *something*; nothing on the box knows what. |
| stale sha | The deploy did not take, or you are being served by an older revision. `gcloud run revisions list --service dice --region us-central1`. |

**The deploy never sets `DICE_DEV_WRITE`** (2026-09-02). Developer mode's Save
route (`POST /api/dev/write`, docs/DEVMODE.md §6) is mounted only when
`DICE_DEV_WRITE=1` is in the environment, which is a thing you type on a
laptop — `DICE_DEV_WRITE=1 node server.js` — and never a flag in `make
deploy`'s `--update-env-vars`. Unarmed, the two paths are not mounted at all
and answer the ordinary `/api/` 404; a deployed container also has nothing
writable to write to. If you ever find yourself adding it to the flag set,
that is the moment to stop: the route patches the checkout it is running in.

`/health` is public and unauthenticated like every other door here (goal 10),
and deliberately carries **counts only** — no room key, no player name, no roll,
no log line, no address. A room key is the table's only access control, so an
endpoint that listed rooms would be handing out doors; that is why §0j keeps
`/admin/rooms` as a separate, secret-gated idea and this stays cardinalities.

### Bounding room creation

The threat: `MAX_ROOMS` is 500, room creation is unauthenticated (goal 10), and
a script that mints 500 rooms locks a real game out with `server_full`.

**Shipped, in-server (free):** `server.js` `takeRoomCreateBudget` — at most
**10 new rooms per minute per client address**, and only once the server is
already **half full** (`ROOM_CREATE_GUARD`, `DICE_ROOM_GUARD` to override).
Below the guard nobody is ever refused; joining a room that already exists is
never throttled at all, so this cannot keep a player away from their friends'
table. It is scoped to `POST /api/join` and deliberately **not** to
`/api/events` — a 429 on the event stream is a self-inflicted stream storm,
because every refused client reconnects at once (ROADMAP §0d F3).

Verify it fired:

```sh
make logs | grep 'room throttled'      # ip="…" rooms=…
```

**Its honest limit:** the key is the leftmost `X-Forwarded-For` entry, and
Cloud Run *appends* to whatever the client sent — so an attacker who sets the
header rotates past the limit, or aims it at someone else's address to spend
their budget. That is why the rule only ever refuses room *creation*, and why
the infrastructure rule below is the real control if a real attack arrives.

#### Do not buy Cloud Armor for this yet

Cloud Armor attaches to a **backend service**, not to a Cloud Run service, so
"add a rate rule" is really "put a global external Application Load Balancer in
front, move the domain onto it, and close the `run.app` back door". Priced out
2026-08-14, against a hosting bill of $0.00:

| Piece | Cost |
| --- | --- |
| Global external ALB forwarding rule + data processing | ~$18–25/mo (the same ALB this doc already rejected on cost) |
| Cloud Armor policy + rules (Standard) | ~$5/mo per policy, ~$1/mo per rule, ~$0.75 per million requests |
| Re-wiring | The Cloud Run domain mapping is replaced by the ALB: new cert, new A/AAAA records, and `--ingress internal-and-cloud-load-balancing` or the `run.app` URL bypasses the whole thing |

So the recommendation is: **keep the in-server throttle, add an alert, and hold
the runbook below in reserve.** For a friends' table the cheap correct control
is *detect and respond*, not *prevent*: the attack is not persistent (an
unprepared room is deleted the moment it empties, and a joiner that never opens
a stream is reaped after `JOIN_GRACE_MS` = 60 s), so it costs the attacker
sustained traffic to hold the table down, and it costs us one log query and a
redeploy to shed them.

Free tripwire — a log-based alert on the refusal the server already prints:

```sh
gcloud logging metrics create dice_room_throttled --project "$PROJECT" \
  --description "room creation refused by the in-server throttle" \
  --log-filter='resource.type="cloud_run_revision" AND textPayload:"room throttled"'
# then attach a notification channel to it in the console (Monitoring → Alerting)
```

The other $0 option, if this ever moves off Cloud Run domain mappings: put
Cloudflare's free tier in front and use its rate-limiting rule. It does not
work *today* — the orange cloud breaks Google-managed cert issuance for a
domain mapping, and the Host override that would fix it is Enterprise-only (see
"The domain" above) — so it is only on the table alongside a hosting move.

#### The Cloud Armor runbook, if it is ever needed

Run it in **preview first** (`--preview`), watch the logs, and only then
enforce. Flag names in `gcloud compute security-policies rules create` have
moved between releases — check `--help` before pasting. `$PROJECT`/`$REGION`
match `deploy/config.mk`.

```sh
# 1. A serverless NEG, so a load balancer can reach the Cloud Run service.
gcloud compute network-endpoint-groups create dice-neg --project "$PROJECT" \
  --region "$REGION" --network-endpoint-type=serverless --cloud-run-service=dice

# 2. A backend service — the only thing a Cloud Armor policy can attach to.
gcloud compute backend-services create dice-backend --project "$PROJECT" \
  --global --load-balancing-scheme=EXTERNAL_MANAGED
gcloud compute backend-services add-backend dice-backend --project "$PROJECT" \
  --global --network-endpoint-group=dice-neg --network-endpoint-group-region="$REGION"

# 3. The load balancer in front of it (this is the ~$18/mo part).
gcloud compute url-maps create dice-lb --project "$PROJECT" --default-service dice-backend
gcloud compute ssl-certificates create dice-cert --project "$PROJECT" --global \
  --domains="$DOMAIN"
gcloud compute target-https-proxies create dice-https-proxy --project "$PROJECT" \
  --url-map=dice-lb --ssl-certificates=dice-cert
gcloud compute addresses create dice-ip --project "$PROJECT" --global
gcloud compute forwarding-rules create dice-fr --project "$PROJECT" --global \
  --target-https-proxy=dice-https-proxy --address=dice-ip --ports=443
#    …then repoint the domain's A/AAAA records at `gcloud compute addresses
#    describe dice-ip --global --format='value(address)'` and delete the old
#    Cloud Run domain mapping.

# 4. The rate rule — IN PREVIEW. `enforce-on-key IP` is the point of all this:
#    the LB's own view of the client address, which no header can forge.
gcloud compute security-policies create dice-armor --project "$PROJECT" \
  --description "room-creation rate limit"
gcloud compute security-policies rules create 1000 --project "$PROJECT" \
  --security-policy dice-armor \
  --expression "request.path.matches('/api/join')" \
  --action throttle --enforce-on-key IP \
  --rate-limit-threshold-count 10 --rate-limit-threshold-interval-sec 60 \
  --conform-action allow --exceed-action deny-429 \
  --preview
gcloud compute backend-services update dice-backend --project "$PROJECT" \
  --global --security-policy dice-armor

# 5. Close the back door, or the run.app URL bypasses the load balancer and
#    the rule protects nothing.
gcloud run services update dice --project "$PROJECT" --region "$REGION" \
  --ingress internal-and-cloud-load-balancing
```

Verify — the probe should turn from `200` to `429` partway through, and the
matching decision should appear in the LB log:

```sh
for i in $(seq 1 30); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'Content-Type: application/json' \
    -d "{\"room\":\"probe$i\",\"name\":\"probe\"}" "https://$DOMAIN/api/join"
done; echo

gcloud logging read --project "$PROJECT" --limit 20 \
  'resource.type="http_load_balancer" AND jsonPayload.enforcedSecurityPolicy.name="dice-armor"'
```

While `--preview` is on, the rule only *logs* (`previewSecurityPolicy` rather
than `enforcedSecurityPolicy`) and every probe still returns 200. Drop the
preview with
`gcloud compute security-policies rules update 1000 --security-policy dice-armor --no-preview`.

Roll back, innermost first — step 5 alone restores service if the LB is the
problem:

```sh
gcloud run services update dice --project "$PROJECT" --region "$REGION" --ingress all
gcloud compute backend-services update dice-backend --project "$PROJECT" \
  --global --security-policy ""
gcloud compute security-policies delete dice-armor --project "$PROJECT" --quiet
# and, to stop the ~$18/mo, tear the LB down in reverse creation order:
#   forwarding-rules → target-https-proxies → url-maps → ssl-certificates
#   → backend-services → network-endpoint-groups → addresses
# then re-run `make domain` and re-add the printed A/AAAA records.
```
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
