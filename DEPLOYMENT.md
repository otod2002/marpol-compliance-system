# Deployment

This file records how the system is deployed to a public address, and the
values an examiner needs in order to reach it. The architecture is three
separate services, all on free tiers:

| Part | Service | Why this one |
|---|---|---|
| PostgreSQL 18 | Neon | Free tier does not expire, so the demonstration still works months after submission |
| API server (Express) | Render | Free web service; sleeps after 15 minutes idle and wakes in under a minute |
| Public portal and field application | Cloudflare Pages | Two static sites, HTTPS by default, which the Progressive Web App requires in order to install |

HTTPS is not cosmetic here. A service worker only registers in a secure
context, so the field application cannot be installed to a tablet home
screen, and cannot cache its instrument pack for offline use, unless it is
served over HTTPS or from `localhost`.

---

## 1. Database

Create a project on neon.tech and copy the **pooled** connection string. Use
it without the `channel_binding` parameter: `node-postgres` does not
implement channel binding, and the parameter is only meaningful to `psql`.

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Apply the schema, the seed data, the application role and the verification
script. `scripts/db-apply.js` does all four through the `pg` driver, so no
local `psql` installation is required and the same command works on Windows,
macOS and Linux:

```powershell
# Windows PowerShell, from the repository root
$env:DATABASE_URL = "postgresql://…?sslmode=require"
$env:APP_ROLE_PASSWORD = "<a long random password>"
node scripts/db-apply.js all
```

```bash
# macOS or Linux
export DATABASE_URL="postgresql://…?sslmode=require"
export APP_ROLE_PASSWORD="<a long random password>"
node scripts/db-apply.js all
```

`all` runs `migrate`, `seed`, `role` and `verify` in that order; each is also
available on its own, and `--dry-run` lists what would be applied without
connecting. The verification step prints the ten labelled evidence blocks of
`db/verify.sql`; the first should report 36 implemented entities.

Create the first administrator, then create the remaining accounts through
the field application's administration screen:

```powershell
node server/scripts/bootstrap-admin.js "Administrator" admin@example.gov.ng "<password>"
```

The server connects as `app_role`, not as the database owner. That role may
insert audit rows but may not update or delete them, which is what makes
audit immutability a property of the database rather than a promise of the
code, and what test case TS-05 verifies. Use the `app_role` credentials in
the server's `DATABASE_URL`, not the owner's.

## 2. API server

New Web Service on Render, connected to this repository.

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build command | `npm install` |
| Start command | `node src/index.js` |
| Health check path | `/health` |

Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon string, with `app_role` as the user |
| `JWT_SECRET` | 32+ random bytes, for example from `openssl rand -hex 32` |
| `TOKEN_TTL` | `12h` |
| `DOCUMENT_TOKEN_TTL_DAYS` | `30` |
| `EVIDENCE_ROOT` | `/tmp/evidence` |
| `PUBLIC_PORTAL_URL` | the portal address from step 3 |
| `CORS_ORIGIN` | the portal and field addresses, comma separated |

`CORS_ORIGIN` and `PUBLIC_PORTAL_URL` cannot be filled in until step 3 has
produced the two addresses, so set them afterwards and redeploy.

A note on `EVIDENCE_ROOT`: photographic evidence attached during an
inspection is written to the server's filesystem, and a free Render instance
has no persistent disk, so attachments do not survive a restart. The
inspection record itself is in PostgreSQL and is unaffected. For a permanent
deployment this directory would be object storage.

## 3. Portal and field application

Two Cloudflare Pages projects from the same repository.

| | Portal | Field application |
|---|---|---|
| Root directory | `portal` | `client` |
| Build command | `npm install && npm run build` | `npm install && npm run build` |
| Output directory | `dist` | `dist` |

Build-time variables, which Vite compiles into the bundle:

| Project | Name | Value |
|---|---|---|
| Portal | `VITE_API_URL` | `https://<render-service>.onrender.com/api` |
| Portal | `VITE_FIELD_APP_URL` | `https://<field-site>.pages.dev` |
| Field | `VITE_API_URL` | `https://<render-service>.onrender.com/api` |
| Field | `VITE_PORTAL_URL` | `https://<portal-site>.pages.dev` |

These are read at build time, not at run time, so changing one means
rebuilding that site.

## 4. Checks after deployment

1. `https://<render-service>.onrender.com/health` returns `{"status":"ok"}`.
2. The portal loads and lists the six MARPOL Annexes, which are served from
   the database rather than from compiled constants.
3. A request lodged on the portal appears in the field application's triage
   screen, which proves the browser, the API and the database are connected.
4. In Chrome on the tablet, the field application offers **Install app**. If
   it does not, the service worker has not registered: confirm the address
   is HTTPS, then check Application → Service Workers in desktop DevTools.

## 5. Demonstration accounts

Create one account per operational role through the administration screen and
record them here before submission, so an examiner can sign in:

| Role | Email | Password |
|---|---|---|
| Compliance officer | | |
| Supervisor | | |
| Waste team leader | | |
| Facility receiver | | |
| Administrator | | |

These are demonstration accounts on synthetic data. Do not reuse any password
that protects anything else.
