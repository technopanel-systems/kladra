# Kladra

The CRM and operations tool for Technopanel — a Riyadh company selling aluminium composite
panel (ACP) cladding, fourteen people. Reps log what happened with customers and ask for
quotations and dispatches; the coordinator issues them in SMAC and types the numbers back;
the manager sees targets, pace and what is stuck. Everybody adds one line to a day the
system has already assembled, and the whole team reads that day on one screen. SMAC stays
the financial record.

What it is for, and what the founder decided, is in [SPEC.md](SPEC.md). How it looks is
[DESIGN.md](DESIGN.md). How it is built is [WORKFLOW.md](WORKFLOW.md) and [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Docker Desktop and Node 24.

```bash
cp .env.example .env          # set POSTGRES_PASSWORD and AUTH_SECRET (npx auth secret)
docker compose up -d db       # PostgreSQL 17 on 127.0.0.1:5433
npm install
npm run db:migrate            # applies drizzle/ and lists the tables as proof
npm run seed:demo             # seven users, lookups, 28 companies, quotations, dispatches, reports
npm run dev                   # http://localhost:3100
```

`/` redirects to `/en`; `/ar` is the same product right-to-left. Dark is the default
theme. `npm run db:clear` empties every table; `npm run seed:demo` fills it again.

Both of those empty the `sessions` table with everything else, so **anyone signed in at
the time is signed out** and the next click lands on the login screen. That is correct —
a session names a row in the database, and the row is gone — but it looks exactly like a
session expiring on its own, so it is worth knowing before chasing it. Sessions otherwise
last thirty days.

## Seed logins

Password for every demo account: the `SEED_PASSWORD` in `.env` (default `kladra2026`).

| Person | Role | Email |
|---|---|---|
| Jerom | admin | jerom@technopanel.com.sa |
| Abdulrahman Al-Zahrani | manager | abdulrahman@technopanel.com.sa |
| Rawan | coordinator | rawan@technopanel.com.sa |
| Faisal Al-Harbi | rep | faisal@technopanel.com.sa |
| Saad Al-Qahtani | rep | saad@technopanel.com.sa |
| Turki Al-Shammari | rep | turki@technopanel.com.sa |
| Marketing | marketing | marketing@technopanel.com.sa |

## On a phone

Kladra installs. Open the tunnel address in Chrome (Android) or Safari (iOS) and choose
**Add to Home screen**: it opens full screen with its own icon, and the sidebar becomes a
bottom bar with dialogs as bottom sheets.

**It does not work offline, on purpose.** A rep with no signal gets a splash saying so, in
both languages, and nothing else is kept on the phone — no companies, no follow-up dates,
no quotations. A stale follow-up date a rep acts on is worse than no date at all, so the
service worker (`public/sw.js`) caches exactly two files: that splash and the mark on it.
Every screen is fetched from the network, every time.

The icons are committed under `public/icons`. `npm run icons` redraws them from
`scripts/icons.ts` — run it only if the mark changes, and commit what it writes; a deploy
never runs it.

## Tests and checks

```bash
npm run typecheck && npm run lint && npm run build
npm run check:messages        # every key in both locales, every key used, no gendered Arabic
npm run test                  # Playwright: boots dev:test on 3101, reseeds kladra_test, runs tests/ in en and ar
npm run check:build-env       # builds with no .env, the way the Docker image does
```

`check:build-env` is the one to run before a deploy. The container gets its database and
its secret from compose when it STARTS, so its build has neither — and `next build`
imports every route to read its config. Anything that opens a connection or reads a secret
while a module is being imported builds here and dies there. That is not hypothetical:
the pool used to be created at import, and the very first `docker build` of this repo
failed on it.

The acceptance scripts the tests walk are in WORKFLOW.md §3, one per role.

### Changing a word

Every sentence the app says lives in `messages/en/<area>.json` and
`messages/ar/<area>.json` — one file per area, same keys in both. Edit the value,
never the key, and edit both languages: a key that exists in one and not the other
fails the build, and so does an Arabic sentence written to a man or to a woman.

Two things are handled for you and must not be done by hand. A `{name}` or `{label}`
in a sentence is already isolated from the words around it, so the full stop lands on
the right side of an English name inside Arabic (`src/i18n/isolate.ts`). And a count
uses ICU plurals — Arabic has six forms and all six are written out; leave that
shape alone.

After any change: `npm run check:messages`, then `npm run test`.

**Tests have their own database and their own port.** `npm run test` serves the
app on **3101** against **`kladra_test`**, created on first run beside the
development database on the same server. The suite deletes every row and seeds
fresh ones each time it starts, so it must never be able to reach the database
`npm run dev` is showing — leave 3100 running and keep working while a run goes
by. `npm run dev:test` starts that server by hand. Before deleting anything the
suite asks `/api/health` which database it is actually on and stops if the
answer is not `kladra_test`. Set `TEST_DATABASE_URL` only if the test database
lives on another server; otherwise the name is derived by appending `_test`.

> **Next 16 differs from 13–15** — `params` is a Promise and `middleware.ts` is
> `proxy.ts`. Version-correct docs ship at `node_modules/next/dist/docs/`; read
> those rather than memory. (`next dev`'s wish to append notes to CLAUDE.md is
> disabled via `agentRules: false` — that file is hand-written.)

## Deployment

One Windows PC, Docker, Cloudflare Tunnel; `cloudflared` runs on the host, not in compose.
**Both containers are loopback-bound** (`127.0.0.1:3100`, `127.0.0.1:5433`) — only the
tunnel is public, and Cloudflare Access (free ≤50 users; session duration one month)
fronts the tunnel. **Access protects the tunnel and NOT a re-published port** — that is
why loopback binding matters. FACET runs on the same PC on 3000 / 5432 under the compose
project `facet-crm`; Kladra is the project `kladra` and never shares a port, volume or
container name with it.

```bash
cp .env.example .env                 # POSTGRES_PASSWORD, AUTH_SECRET, PUBLIC_URL
docker compose up --build -d         # builds the image, starts db + app
curl http://localhost:3100/api/health
# {"ok":true,"app":"up","db":"up","checkedAt":"..."}   (503 when the db is down)
```

`run-app.cmd` (double-click) does the same and waits for health. `restart: always` plus
"start Docker Desktop on boot" brings the machine back unattended after a power cut.

The image has been built and started from this repo, not only assumed to work: it serves
the login screen, the manifest, the icons and the service worker, and with no database
reachable `/api/health` answers 503 rather than the container dying — the app opens its
connection when something asks a question, not when a module is imported.

Before real users, on the host machine:

- [ ] BIOS: power on after AC loss · Windows Update: no auto-restart · Docker Desktop on boot · `.wslconfig` memory cap · UPS
- [ ] `cloudflared` ingress for `kladra.<your-domain>` (placeholder) points at `http://localhost:3100` — the app does not answer on the LAN address
- [ ] **`PUBLIC_URL` set** to the https tunnel hostname — it is what makes the session cookie `Secure`, and forgetting it is **silent** (login works, the token crosses the tunnel unprotected)
- [ ] Cloudflare Access with a test code to a `technopanel.com.sa` address first (confirm it is not filed as spam)
- [ ] Backups configured (below), then **pull the plug and confirm it comes back unattended**

The Docker build downloads fonts from Google Fonts, so the **build** needs internet access.
The running container does not. RAID is not a backup.

## Backups

```bash
npm run backup          # one consistent dump into BACKUP_DIR
npm run backup:verify   # restore the newest dump twice and prove it matches
npm run restore -- <dump-file> --to <database> [--force]
```

The office NAS sweeps files, but PostgreSQL's data directory is written while it is copied
— a torn copy may not restore. `npm run backup` writes one **consistent** dump into a folder
the NAS already sweeps (`BACKUP_DIR` in `.env`); `backup:verify` restores it twice (a scratch
database beside the live one, and a throwaway container on an empty volume) and compares
every table's exact row count, failing on a mismatch or on a comparison that read nothing.
`pg_dump` runs **inside** the `db` container so the client always matches the server.

**A dump holds every row and every password hash — it is exactly as sensitive as the
database.** The folder needs the database's access control; nothing prints or shell-passes
`POSTGRES_PASSWORD`.

Host-side steps that cannot be scripted from here: choose the NAS-swept folder; add a Task
Scheduler entry (02:00 nightly, "Run whether user is logged on or not", start-in the repo
root, log to `logs\backup.log`); and **prove the restore on a second machine** (copy a dump,
`docker compose up -d db`, `npm run restore`, compare row counts and an Arabic company name).
