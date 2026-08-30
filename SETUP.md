# Setup Guide

Step-by-step instructions to run the project locally, verify it, and publish it to GitHub.

> **What you can run today:** the database schema, the seeded instrument, and the rule interpreter test suite. The `portal/`, `client/`, and `server/` directories are not yet built, so there are no application screens to capture yet. This guide gets the foundation running and produces the database and test evidence.

---

## 1. Prerequisites

Install these three. Versions matter — the project pins them in the report.

| Tool | Version | Where |
|---|---|---|
| Node.js | **22 LTS** (22.12 or later) | https://nodejs.org |
| PostgreSQL | **18.x** | https://www.postgresql.org/download/ |
| Git | any recent | https://git-scm.com |

Verify each:

```bash
node --version      # expect v22.x
psql --version      # expect 18.x
git --version
```

**Windows note.** Use the PostgreSQL installer, and during setup let it add `psql` to your PATH. If `psql` is not recognised afterwards, add `C:\Program Files\PostgreSQL\18\bin` to PATH manually and reopen the terminal.

**macOS note.** `brew install postgresql@18 node@22` works, then `brew services start postgresql@18`.

---

## 2. Get the code

If you have the folder already, skip to step 3.

```bash
cd ~/projects            # or wherever you keep work
# place the marpol-compliance-system folder here
cd marpol-compliance-system
```

---

## 3. Create the database

```bash
createdb marpol
```

If `createdb` is not found or you get a role error, use the superuser explicitly:

```bash
psql -U postgres -c "CREATE DATABASE marpol;"
```

Set a connection string for convenience. Replace the password with your own.

```bash
# macOS / Linux
export DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/marpol"

# Windows PowerShell
$env:DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/marpol"
```

---

## 4. Create the schema

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
psql "$DATABASE_URL" -f db/migrations/002_sync_columns.sql
```

Expected: a series of `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX` lines ending in `COMMIT`.

If you need to start over at any point:

```bash
dropdb marpol && createdb marpol
```

---

## 5. Load the seed data

```bash
psql "$DATABASE_URL" -f db/seed/01_vocabularies.sql
psql "$DATABASE_URL" -f db/seed/02_instrument.sql
```

This loads the roles, languages, deficiency and action vocabularies, and the encoded inspection instrument.

---

## 6. Create the application role

This is the step that makes audit immutability a property of the database rather than a promise of the code. Test case **TS-05** depends on it.

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE ROLE app_role LOGIN PASSWORD 'change-me-before-deployment';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
REVOKE UPDATE, DELETE ON audit_log FROM app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
SQL
```

On Windows PowerShell, put those five lines in a file `grants.sql` and run `psql "$env:DATABASE_URL" -f grants.sql`.

---

## 7. Run the verification script  ← screenshot this

```bash
psql "$DATABASE_URL" -f db/verify.sql
```

This prints ten labelled evidence blocks: entity count, entities by subsystem, instrument items by Annex, the seven response types, the applicability rules, the differing item counts by vessel type, the controlled vocabularies, the custody constraint, the audit privileges, and the foreign key count.

**Screenshot the whole output.** Each block is labelled with the objective or requirement it evidences, so it can be captioned directly in Chapter Five.

---

## 8. Run the test suite  ← screenshot this

```bash
node tests/rules.test.js
```

Expected final line: `20 passed, 0 failed`.

**Screenshot this too.** Each test is labelled with its Chapter Five case ID (TC-06, TC-07, TC-08, TC-10, TC-11, TC-12, TC-13, TC-16, TC-17), so the output maps directly onto Table 5.4.

---

## 9. Start the API server  ← screenshot this

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` to the same value you used above, and set
`JWT_SECRET` to a long random string (`openssl rand -hex 32` will generate one).

Run the server-side test suite first:

```bash
node tests/server.smoke.js      # expect: 10 passed, 0 failed
```

Then start it:

```bash
npm start                       # listens on :4000
```

Check it responds, in a second terminal:

```bash
curl http://localhost:4000/health
```

Lodge a request through the public intake, exactly as an agent would:

```bash
curl -X POST http://localhost:4000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"vessel_imo":"9123456","vessel_name":"MV Example","flag_state":"Panama","vessel_type":"OIL_TANKER","port":"Apapa","has_waste_to_land":true}'
```

Then track it by the returned reference:

```bash
curl http://localhost:4000/api/requests/REQ-2026-XXXXXX
```

**Screenshot both.** They evidence FR-04 and FR-08, and the tracking response
shows the deliberately narrow disclosure that TS-07 tests.

---

## 10. Publish to GitHub

Create an empty repository on GitHub first — no README, no licence, no `.gitignore`, since the project already has them.

```bash
git init
git add .
git commit -m "Schema, instrument encoding, rule interpreter, and API"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/marpol-compliance-system.git
git push -u origin main
```

Tag the increment, as Chapter Four specifies:

```bash
git tag -a increment-1 -m "Increment 1: data model, vocabularies, rule interpreter, API"
git push origin --tags
```

The repository URL goes into Chapter Four, Section 4.5.

---

## Troubleshooting

**`psql: FATAL: role "postgres" does not exist`** — on macOS Homebrew the superuser is your own username. Use `postgresql://$(whoami)@localhost:5432/marpol`.

**`permission denied to create extension "pgcrypto"`** — run the migration as a superuser: `psql -U postgres "$DATABASE_URL" -f db/migrations/001_init.sql`.

**`type "citext" does not exist`** — not used; the schema uses `TEXT` with a lower-case unique index instead.

**Seed fails with duplicate key** — the seed has already been loaded. Recreate the database (step 4) before reloading.

**Evidence 9 returns no rows** — step 6 was skipped, or the role was created under a different name.

---

## What comes next

To produce application screenshots you need three things built, in this order:

1. ~~**`server/`** — Express API, authentication, role middleware, endpoints~~ **done**
2. **`portal/`** — the public service portal: request lodgement, tracking, reference content
3. **`client/`** — the field PWA: instrument renderer, service worker, IndexedDB, sync manager

Only after (3) can you capture the offline demonstration that test cases TO-01 to TO-11 describe, which is the evidence Objective 6 turns on.
