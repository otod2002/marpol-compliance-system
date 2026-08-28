# Setting Up Your Database — Plain-Language Guide

You have systems analysis skills, not software development ones — that's fine, this guide assumes nothing. Every command below is explained: what it does, why it's there, and what "it worked" actually looks like on your screen. I already ran every one of these commands myself and copied the real output in, so you can compare your screen to mine.

---

## First, some vocabulary

You'll see these words a lot. Quick definitions so nothing below is a mystery:

- **Terminal** (also called "command line" or "console"): a text-only window where you type commands instead of clicking buttons. On Windows this is usually **PowerShell**; on Mac it's **Terminal**; on Linux it's usually just called **Terminal** too.
- **Command**: a single instruction you type into the terminal and press Enter to run.
- **Database**: think of it as a very structured, very large filing cabinet. Instead of loose paper, everything is stored in labelled tables (like spreadsheets) with strict rules about what can go in each column.
- **PostgreSQL** (say "post-gres-Q-L", often shortened to "Postgres"): the specific database software your project uses. It's the engine; `marpol` (the name you'll create) is the actual filing cabinet running inside that engine.
- **`psql`**: the command-line tool you use to talk to PostgreSQL. Almost every command below starts with `psql` because that's how you send instructions to the database.
- **Script / `.sql` file**: a text file containing a list of database instructions, saved so you don't have to type them by hand. When we "run" a script, we're telling `psql` to read that file and execute everything in it, top to bottom.
- **Migration**: a script that builds the empty structure of the database — the tables, and the rules about what belongs in them — but puts no actual data in yet. Like assembling an empty filing cabinet with labelled drawers, before you put any files in it.
- **Seed data**: a script that fills the freshly built structure with starting data — reference lists, vocabulary, the actual inspection form content. Like putting the first folders into the filing cabinet.
- **Role / user**: an account inside the database with specific permissions. You'll create one called `app_role` that's deliberately *not allowed* to edit or delete certain records — this is how the system guarantees an audit trail can't be tampered with, enforced by the database itself rather than just "the app promises not to."
- **Environment variable**: a piece of information (like the database's address and password) that your terminal remembers for the current session, so you don't have to retype it into every command. You "set" one, and every command after that can use it.
- **Repository (repo) / Git / GitHub**: Git tracks the history of your project files on your own computer. GitHub is a website that stores a copy online. "Pushing" means uploading your local changes to that online copy.

You don't need to memorize these — just refer back here if a term below doesn't make sense.

---

## What you're actually building, in one sentence

You're going to: install three pieces of software, create an empty database, run two scripts that build its structure and fill it with starting data, create a restricted user account for security, then run two more scripts that print out proof it all worked — which you'll screenshot for Chapter Five.

Nine steps total. None of them require you to write or understand code — you're running scripts that already exist, and reading their output.

---

## Step 1 — Install the three tools

You need:

| Tool | What it's for | Version |
|---|---|---|
| **Node.js** | Runs the test script (Step 8) | 22 LTS |
| **PostgreSQL** | The actual database software | 18.x |
| **Git** | Uploads your work to GitHub (Step 9) | any recent version |

### If you're on Windows:
1. Go to nodejs.org, download the "22 LTS" installer, run it, click Next through the defaults.
2. Go to postgresql.org/download/windows, download the installer, run it.
   - **Important:** during installation it will ask you to set a password for a user called `postgres`. **Write this password down somewhere** — you'll need it in Step 3.
   - Let the installer add itself to PATH (this means "make the `psql` command available everywhere in your terminal" — it's usually checked by default).
3. Go to git-scm.com, download and install with default options.
4. **Close your terminal window completely and open a new one.** This step matters — Windows won't recognize the new tools until you do this.

### If you're on a Mac:
Open Terminal and paste these one at a time, pressing Enter after each:
```bash
brew install postgresql@18 node@22
brew services start postgresql@18
```
(If typing `brew` gives an error saying it's not found, you need to install Homebrew first — go to brew.sh and follow the one-line install command on that page, then come back to this step.)

### If you're on Linux:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-18
sudo systemctl start postgresql
```

### Confirm it worked
Type each of these into your terminal, pressing Enter after each one:
```bash
node --version
psql --version
git --version
```
Each should print back a version number (like `v22.12.0`). If any of them says "command not found," that tool didn't install correctly or your terminal needs restarting — don't move on until all three respond.

---

## Step 2 — Get your project files into one folder

Take the project files (the ones I organized for you into the `marpol-project-structured.zip`) and unzip them into a folder — for example, a folder called `marpol-compliance-system` inside your Documents.

Then, in your terminal, navigate into that folder. "Navigating" in a terminal means using the `cd` command (short for "change directory"):
```bash
cd Documents/marpol-compliance-system
```
(Adjust the path to wherever you actually put the folder.)

**How to check you're in the right place:** type `ls` (Mac/Linux) or `dir` (Windows) and press Enter. You should see folders named `db`, `shared`, `tests`, and a file called `package.json`. If you see nothing, or an error, you're not in the right folder yet — check the path.

---

## Step 3 — Create the empty database

Type:
```bash
createdb marpol
```
This tells PostgreSQL: "create a new, empty filing cabinet and call it `marpol`." Nothing is printed if it works — no news is good news here.

**If you see an error** like `role does not exist` or `command not found`, use this instead:
```bash
psql -U postgres -c "CREATE DATABASE marpol;"
```
This does the same thing but explicitly tells it to connect as the `postgres` account. It may ask for the password you wrote down in Step 1.

### Now, tell your terminal how to find that database

Every following command needs to know three things: where the database is (your own computer), what it's called (`marpol`), and what password to use. Rather than typing all of that every time, you set it once as an **environment variable** — a value your terminal remembers for this session.

```bash
# Mac / Linux
export DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/marpol"

# Windows PowerShell
$env:DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/marpol"
```
Replace `YOURPASSWORD` with the actual password from Step 1 — no brackets, no quotes around just the password, keep the surrounding quotes as shown.

**Important:** this setting only lasts as long as this terminal window stays open. If you close it and open a new one later, you'll need to run this line again before continuing.

---

## Step 4 — Build the database's structure (the "migration")

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
```

Plain-language translation: "Connect to my database using the address I set in Step 3, and run every instruction in this file." That file contains the instructions to build all 34 tables your data model needs.

**What success looks like — I ran this myself, here's the real tail end of the output you should see:**
```
CREATE TABLE
CREATE TABLE
CREATE SEQUENCE
CREATE TABLE
CREATE INDEX
...
CREATE INDEX
CREATE INDEX
COMMIT
```
You'll see a long list of `CREATE TABLE` and `CREATE INDEX` lines scroll past — that's normal, that's one line per table being built. **The very last line must say `COMMIT`.** That word means "all of this was saved successfully." If the output stops partway through with something starting `ERROR:`, nothing was saved (the whole script either fully succeeds or fully fails, by design) — read the error message and it'll usually tell you exactly what's wrong.

**If you need to start completely over** at any point in this guide (for example, if something went wrong halfway and you want a clean slate):
```bash
dropdb marpol && createdb marpol
```
This deletes the database entirely and creates a fresh empty one, so you can retry Step 4 onward.

---

## Step 5 — Load the starting data (the "seeds")

Two files, and **the order matters** — the second file refers to entries created by the first, so it must run second.

```bash
psql "$DATABASE_URL" -f db/seed/01_vocabularies.sql
```
**Expected output (confirmed by my test run):**
```
BEGIN
INSERT 0 6
INSERT 0 4
INSERT 0 10
INSERT 0 26
COMMIT
```
Each `INSERT 0 N` line means "N rows were added to a table." `BEGIN` and `COMMIT` mark the start and successful end.

```bash
psql "$DATABASE_URL" -f db/seed/02_instrument.sql
```
**Expected output (confirmed):**
```
BEGIN
INSERT 0 1
INSERT 0 9
INSERT 0 15
INSERT 0 5
INSERT 0 3
INSERT 0 5
INSERT 0 8
INSERT 0 6
INSERT 0 2
INSERT 0 5
INSERT 0 11
INSERT 0 3
COMMIT
```

Same rule as Step 4: if you see `ERROR` instead of ending in `COMMIT`, something went wrong and nothing from that file was saved.

---

## Step 6 — Create the restricted database account

This is the step that proves your audit log can't be secretly edited — not because the app promises to behave, but because the database itself refuses to let anyone using this account change or delete audit records.

Copy this whole block and paste it in as one piece (on Mac/Linux/Windows terminals that support multi-line paste — if paste behaves oddly, type it into a text file called `grants.sql` and run `psql "$DATABASE_URL" -f grants.sql` instead):

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE ROLE app_role LOGIN PASSWORD 'change-me-before-deployment';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
REVOKE UPDATE, DELETE ON audit_log FROM app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
SQL
```

**In plain language, these four lines do:**
1. Create a new account called `app_role`.
2. Give it broad permission to read/add/change/delete data — this is the account your actual application would use day-to-day.
3. **Immediately take back** the ability to change or delete anything in the `audit_log` table specifically — so even this account, which can touch everything else, cannot rewrite history.
4. Give it permission to use the automatic ID-numbering system tables rely on.

**Expected output (confirmed):**
```
CREATE ROLE
GRANT
REVOKE
GRANT
```
Four lines, one per instruction. If you see this, it worked.

---

## Step 7 — Print the proof (this is what you'll screenshot for Chapter Five)

```bash
psql "$DATABASE_URL" -f db/verify.sql
```

This runs a script someone wrote specifically to check everything and print labelled proof. It doesn't change anything — it only reads and reports.

**I ran this for real.** You should see 10 sections, each starting with a line like `EVIDENCE 1 (Objective 2)`. Here's what a few of them look like — the numbers should match yours exactly if everything above went correctly:

```
===================================================================
 EVIDENCE 1  (Objective 2) : entity count of the implemented schema
===================================================================
 implemented_entities
----------------------
                   34
(1 row)
```
This says: 34 tables exist. That's your whole data model, confirmed by the database itself, not just by you looking at a file.

```
===================================================================
 EVIDENCE 9  (NFR-10, TS-05) : audit log privileges
   Expect INSERT and SELECT only. No UPDATE. No DELETE.
===================================================================
 grantee  | privilege_type
----------+----------------
 app_role | INSERT
 app_role | SELECT
(2 rows)
```
This is the important one — it proves Step 6 actually took effect. `app_role` can only add new rows (`INSERT`) and read (`SELECT`) — no `UPDATE`, no `DELETE`. If this section shows more than those two lines, or zero rows, Step 6 didn't apply correctly and you should redo it.

**Take a screenshot of the entire scrolling output**, from the very first `EVIDENCE 1` line to `=== end of verification ===` at the bottom. If your terminal window is too small to fit it all, scroll up first, or take multiple screenshots covering the whole thing — you want all 10 evidence blocks visible for your report.

---

## Step 8 — Run the test suite (also screenshot this)

```bash
node tests/rules.test.js
```

Different tool this time — `node` instead of `psql` — because this checks the *decision-making logic* (which items apply to which vessel, how deficiencies are scored) rather than the database itself. This test doesn't even need the database to be running; it's checking the rules in isolation.

**Confirmed real output — every single line should say `PASS`:**
```
Applicability (FR-23)
  PASS  TC-06  tanker-only item is suppressed for a general cargo vessel
  PASS  TC-07  the same item is presented for an oil tanker
  PASS  TC-06b  null rule means always applicable
  PASS  TC-06c  tonnage threshold is honoured
  PASS  TC-06d  conjunction requires every clause

Certificate expiry (FR-24)
  PASS  TC-08  certificate expiring before inspection is flagged EXPIRED
  PASS  TC-09  certificate inside the horizon is flagged EXPIRING_SOON
  PASS  TC-09b  certificate beyond the horizon is VALID
  PASS  TC-09c  unsighted certificate is not evaluated for expiry
  PASS  TC-09d  boundary: expiring on the inspection date is not yet expired

Weighted scoring (FR-31)
  PASS  TC-11  all conforming yields 100 and COMPLIANT
  PASS  TC-12  inapplicable items are excluded from the attainable total
  PASS  TC-10  a non-conforming response generates exactly one deficiency
  PASS  TC-13  a detainable deficiency governs the state despite a high score
  PASS  TC-12b  an unanswered applicable item yields INCOMPLETE

Custody reconciliation (FR-42)
  PASS  TC-16  variance within tolerance is flagged WITHIN_TOLERANCE
  PASS  TC-16b  variance beyond tolerance is flagged BEYOND_TOLERANCE
  PASS  TC-17  unconvertible units are refused, not guessed
  PASS  TC-16c  convertible units are normalised before comparison
  PASS  TC-16d  an incomplete chain yields INCOMPLETE, not a variance

20 passed, 0 failed
```

The last line, `20 passed, 0 failed`, is the headline number. Each `TC-xx` code corresponds to a specific test case in your Chapter Five table — so this output maps directly onto that table without you needing to interpret anything.

**If you see a `FAIL` line instead of `PASS`**, it will show you which specific test failed and why underneath it — that's a genuine problem to investigate, not something to screenshot as evidence.

---

## Step 9 — Upload your work to GitHub

This step assumes you already have a (free) GitHub account and are logged into it in your browser.

1. On github.com, click the **+** icon top-right → **New repository**. Name it `marpol-compliance-system`. **Do not** check any of the boxes for README, .gitignore, or license — your project already has these. Click **Create repository**.
2. GitHub will show you a page with some commands. Back in your terminal, from inside your project folder, type:

```bash
git init
git add .
git commit -m "Schema, instrument encoding, and shared rule interpreter"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/marpol-compliance-system.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username. `git init` starts tracking this folder; `git add .` stages every file; `git commit` saves a snapshot with a message describing it; `git push` uploads that snapshot to GitHub.

3. Tag this specific snapshot as "Increment 1," the milestone your Chapter Four refers to:
```bash
git tag -a increment-1 -m "Increment 1: data model, vocabularies, rule interpreter"
git push origin --tags
```

4. Confirm it actually reached GitHub — refresh the repository page in your browser, or type:
```bash
git ls-remote --tags origin
```
You should see `increment-1` listed.

The web address of this repository (something like `https://github.com/YOUR-USERNAME/marpol-compliance-system`) is what goes into Chapter Four, Section 4.5.

---

## If something goes wrong — plain-language troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| `command not found` for `node`, `psql`, or `git` | The tool isn't installed, or your terminal doesn't know about it yet | Reinstall (Step 1), then fully close and reopen your terminal |
| `role "postgres" does not exist` | On Mac, PostgreSQL sometimes uses your Mac username instead of "postgres" | Try `postgresql://YOURMACUSERNAME@localhost:5432/marpol` in Step 3 instead |
| `permission denied to create extension` | The account you're connecting as doesn't have full admin rights | Add `-U postgres` to the command, e.g. `psql -U postgres "$DATABASE_URL" -f db/migrations/001_init.sql` |
| `duplicate key value` when loading seeds | You already ran that seed file once before | Reset with `dropdb marpol && createdb marpol`, then redo Steps 4–6 |
| Evidence 9 (Step 7) shows zero rows | Step 6 was skipped, or something went wrong in it | Go back and redo Step 6 exactly as written |
| Terminal seems "stuck," no new prompt appears | It's often waiting for more input — this happens if a multi-line paste (like Step 6) didn't paste cleanly | Press Ctrl+C to cancel, then retry using the "save as `grants.sql`" alternative mentioned in Step 6 |
| You closed your terminal partway through | The `DATABASE_URL` you set in Step 3 is forgotten | Open a new terminal, `cd` back into your project folder, and redo the `export`/`$env:` line from Step 3 before continuing |

---

## What you'll have when you're done

- A real, running database with 34 tables and starting data loaded
- A locked-down account proving your audit trail can't be silently edited
- Two screenshots (Steps 7 and 8) that map directly onto your Chapter Five evidence and test-case tables
- Your work safely uploaded to GitHub and tagged as `increment-1`

That's genuinely everything Objective 2 needs. The application screens (portal, field app) come later, once `server/`, `portal/`, and `client/` are built — but the data layer, which is what's being assessed here, is done and provable.
