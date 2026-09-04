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
  not supposed. **The same holds outside compose**: `next dev` and `next start`
  default to `0.0.0.0`, so `-H 127.0.0.1` is in every one of those scripts.
  A dev server is a signed-in copy of the CRM with real seed accounts on it.

- **Kladra's ports are 3100 and 5433; compose project name is `kladra`.**
  FACET holds 3000 and 5432 on the same machine and is never touched.

- **3101 is the test port and belongs to nothing else.** `npm run dev:test`
  serves it against the `kladra_test` database (`scripts/dev-test.ts`), which
  the suite clears and reseeds on every run. It is never in
  `docker-compose.yml`, never in the tunnel ingress, and never deployed; the
  port exists so `npm run dev` on 3100 can keep the developer's data while a
  test run is deleting everything on 3101.

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

- **The image builds with no `.env`, and `npm run check:build-env` is what
  proves it.** The container gets its database and its secret from compose at
  RUN time, so `next build` runs with neither — and `next build` imports every
  route module to read its config. Anything that opens a connection or reads a
  secret while a module is being EVALUATED therefore builds on a developer's
  machine and dies in the image. It shipped: the pool was created at import,
  `docker compose up --build -d` was in the README for five phases, and the
  first `docker build` anybody ran failed on "Failed to collect page data".
  Subqueries use drizzle's client-free `QueryBuilder`, `src/db` opens on first
  use, and the check builds the whole app with every `.env` name blanked.

- **`COPY --from=builder /app/public ./public` needs `public/` to exist.**
  `output: "standalone"` does not carry it, and the repo had no `public/` at
  all until the icons landed — so that line could not have succeeded either.
  Nothing in the app referenced a file there, which is why nobody noticed.
