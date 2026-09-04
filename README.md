# Kladra

The CRM and operations tool for Technopanel — a Riyadh company selling aluminium composite
panel (ACP) cladding, fourteen people. Reps log what happened with customers and ask for
quotations and dispatches; the coordinator issues them in SMAC and types the numbers back;
the manager sees targets, pace and what is stuck. SMAC stays the financial record.

What it is for, and what the founder decided, is in [SPEC.md](SPEC.md). How it looks is
[DESIGN.md](DESIGN.md). How it is built is [WORKFLOW.md](WORKFLOW.md) and [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Docker Desktop and Node 24.

```bash
cp .env.example .env          # set POSTGRES_PASSWORD and AUTH_SECRET (npx auth secret)
docker compose up -d db       # PostgreSQL 17 on 127.0.0.1:5433
npm install
npm run db:migrate            # applies drizzle/ and lists the tables as proof
npm run seed:demo             # six users, lookups, 25 companies, quotations, dispatches
npm run dev                   # http://localhost:3100
```

`/` redirects to `/en`; `/ar` is the same product right-to-left. Dark is the default
theme. `npm run db:clear` empties every table; `npm run seed:demo` fills it again.

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

## Tests and checks

```bash
npm run typecheck && npm run lint && npm run build
npm run check:messages        # every key in both messages/en.json and messages/ar.json
npm run test                  # Playwright: reseeds the DB, boots dev on 3100, runs tests/ in en and ar
```

The acceptance scripts the tests walk are in WORKFLOW.md §3, one per role.

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
