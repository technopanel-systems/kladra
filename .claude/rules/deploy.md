---
paths:
  - "docker-compose.yml"
  - "Dockerfile"
  - ".env.example"
  - "run-app.cmd"
  - "scripts/run-app.ps1"
---

# Deployment surface rules

**For:** the files that decide what the office PC exposes. **Prevents:** the
LAN bypass and the silent insecure cookie.

- **Every published port is loopback-bound** — `"127.0.0.1:3100:3100"` for
  the app, `"127.0.0.1:5433:5432"` for Postgres, hook-enforced (H9). A bare
  `"PORT:PORT"` binds `0.0.0.0` and answers on the office Wi-Fi, and
  Cloudflare Access protects the tunnel, NOT the port — measured in FACET,
  not supposed.

- **Kladra's ports are 3100 and 5433; compose project name is `kladra`.**
  FACET holds 3000 and 5432 on the same machine and is never touched.

- **`PUBLIC_URL` decides whether the session cookie is `Secure`, and
  forgetting it is silent**: with `AUTH_URL` resolving http the login works,
  screens render, and the token crosses the tunnel without the flag.
  `.env.example` carries the line; the README's pre-pilot checklist carries
  the check.

- **A database dump is exactly as sensitive as the database** — every row
  and every password hash. `BACKUP_DIR` needs the database's access control;
  no script prints `POSTGRES_PASSWORD` or takes it on a command line.
  `pg_dump` runs inside the `db` container so the client always matches the
  server.

- The tunnel ingress must name `http://localhost:3100` — the loopback
  binding breaks an ingress that names the machine's IP.
