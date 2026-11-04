# Automated MARPOL Compliance Inspection System for Vessels and Port Reception Facilities in Nigeria

**Omotope Tekena Dean** (2025/B/MIT/1242)
Professional Master of Information Technology, Department of Information Technology,
School of Computing, Miva Open University, Abuja, Nigeria. 2026.
Supervisor: Dr. Samuel Omaji.

This repository holds the artefact submitted for that project: a public service
portal and an offline-first field application that encode the NIMASA Vessel MARPOL
Compliance Inspection Report and the Controlled Waste Collection Note as data,
evaluate them on the device, and reconcile a waste consignment across the four
points at which its quantity is recorded.

## Live system

| Part | Address |
|---|---|
| Public portal | https://marpol-compliance-system.pages.dev |
| Field application | https://marpol-field.pages.dev |
| Application server | https://marpol-compliance-system.onrender.com/health |

The application server runs on a plan that suspends an idle instance, so the first
request after a quiet period takes about a minute.

## What is here

| Path | Contents |
|---|---|
| `portal/` | Public portal (React, Vite) |
| `client/` | Field application (React, Vite, offline-first Progressive Web App) |
| `server/` | API server (Node.js, Express, PostgreSQL) |
| `shared/` | The rule module imported unchanged by both the device and the server |
| `db/` | Migrations, seed data and the verification script |
| `tests/`, `scripts/` | The automated suites and the setup runner |
| `docs/evidence/` | Screenshots and specimen documents reproduced in the report |

`SETUP.md` installs it locally, `DEPLOYMENT.md` deploys it, and `TESTING.md`
reproduces every result reported in Chapter Five of the project report.

## Provenance

The work is my own, carried out for the degree named above. The commit history,
its dates and the `increment-1` tag record how it was built. Any later copy that
removes the attribution in the interface, in the generated documents or in this
file is still traceable to this repository through that history.

## Licence

Copyright © 2026 Omotope Tekena Dean. All rights reserved.

The repository is public so that examiners, and anyone assessing the work, can
read it, run it and verify what the report claims. That permission does not
extend to reuse. The code may not be copied, modified, redistributed or submitted
as anyone else's academic work without written permission from the author.
