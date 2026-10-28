# Reproducing the results reported in Chapter Five

Every figure in Chapter Five comes from one of the commands below. Nothing
here depends on a deployment: the suites run against a local PostgreSQL
instance and the production build of the two clients.

## Prerequisites

- Node.js 22.12 or later
- PostgreSQL 16 or later, local or hosted
- A database prepared with `node scripts/db-apply.js all`, which applies the
  three migrations, both seed files, the restricted `app_role` and the
  verification script (see DEPLOYMENT.md for the environment variables)

Set these in the shell before running anything:

```bash
export DATABASE_URL="postgresql://app_role:<password>@<host>/<database>?sslmode=require"
export JWT_SECRET="<32 random bytes>"
```

In Windows PowerShell use `$env:DATABASE_URL = "…"` instead.

## The suites, and what each one evidences

| Command | Cases | Reported as |
|---|---|---|
| `node tests/rules.test.js` | 20 | Table 5.3, Figure 5.1 — the shared rule interpreter |
| `node server/tests/server.smoke.js` | 10 | Table 5.4 — authorisation and refusal |
| `node tests/e2e.test.js` | 31 | Table 5.5, Figure 5.2 — the case lifecycle and the database-enforced invariants |
| `node scripts/run-offline-suite.js` | 10 | Table 5.7, Figure 5.5 — offline capture and synchronisation |
| `node scripts/db-apply.js verify` | — | Figure 5.8 — schema, vocabularies and audit privileges |

Seventy-one automated cases in total.

### Unit suite

```bash
node tests/rules.test.js          # expect: 20 passed, 0 failed
```

Requires no database. This is the practical reason the rule interpreter was
isolated into a module of pure functions: any examiner can re-verify the
logic on which every compliance determination rests with only Node installed.

### Authorisation and refusal

```bash
node server/tests/server.smoke.js # expect: 10 passed, 0 failed
```

Issues adversarial requests directly against the assembled server: no token,
a forged token, a valid token in the wrong role, and a custody stage
attested by the wrong party.

### End-to-end and database security

The server must be running, and the suite signs in as an administrator that
must exist first.

```bash
node server/scripts/bootstrap-admin.js "E2E Admin" admin@test.gov.ng SuperSecretPass123
node server/src/index.js &        # listens on :4000
node tests/e2e.test.js            # expect: 31 passed, 0 failed
```

Several cases shell out to `psql` to assert what the application role may
not do — chiefly TS-05, that `app_role` can neither update nor delete an
audit row. If `psql` is not on the PATH those cases cannot run; install the
PostgreSQL client tools, or read their assertions in the source.

### Offline capture and synchronisation

```bash
node scripts/run-offline-suite.js # expect: 10 passed, 0 failed
```

Drives the production build of the field application in Chromium through
Playwright, disables the network at the browser level, completes an entire
inspection, and records every request the page attempts while offline rather
than only those that succeed. Synchronisation is then observed on
restoration. This is the evidence for FR-26 and for the offline claims in
Section 5.2.

### Performance

The performance figures in Table 5.8 were measured over a database seeded
with 1,003 inspections, with the server, the database and the browser on one
host, and the portal load measured under Chromium's throttled mobile
profile. Timings are reported against the thresholds fixed in Table 3.3
rather than as absolute figures for a production environment, because they
depend on the machine they are run on.

## What is not automated

User acceptance sessions and the System Usability Scale require respondents
and are recorded in Chapter Five as outstanding. The protocol and the
questionnaire are in Appendix D of the report.

## Evidence held in this repository

- `docs/evidence/screenshots/` — every screen reproduced in the report, at
  capture resolution, named by figure number
- `docs/evidence/specimens/` — the inspection reports and the controlled
  waste collection note generated during the evaluation
