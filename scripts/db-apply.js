'use strict';
/**
 * Cross-platform database setup runner.
 *
 * SETUP.md applies the migrations, the seeds and the application role with
 * psql and a bash heredoc. Neither is available in Windows PowerShell, and a
 * deployment to a managed PostgreSQL instance should not depend on a local
 * psql installation at all. This runner does the same work through the `pg`
 * driver the server already depends on, so the only prerequisite is Node.
 *
 *   node scripts/db-apply.js migrate     apply db/migrations/*.sql in order
 *   node scripts/db-apply.js seed        apply db/seed/*.sql in order
 *   node scripts/db-apply.js role        create app_role and set its grants
 *   node scripts/db-apply.js verify      run db/verify.sql and print it
 *   node scripts/db-apply.js all         migrate, seed, role, verify
 *
 * Reads DATABASE_URL from the environment, and APP_ROLE_PASSWORD for `role`.
 * Add --dry-run to list what would be applied without connecting.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let pg;
for (const candidate of [path.join(ROOT, 'server', 'node_modules', 'pg'), 'pg']) {
  try { pg = require(candidate); break; } catch { /* try the next one */ }
}
if (!pg) {
  console.error('Cannot find the pg driver. Run "npm install" inside the server folder first.');
  process.exit(1);
}

const DRY = process.argv.includes('--dry-run');
const command = (process.argv[2] || 'all').replace(/^-+/, '');

const files = (dir) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));

function roleStatements() {
  const password = process.env.APP_ROLE_PASSWORD;
  if (!password) {
    throw new Error('APP_ROLE_PASSWORD is not set. Choose a long random password for app_role.');
  }
  if (/'/.test(password)) {
    throw new Error('APP_ROLE_PASSWORD must not contain a single quote.');
  }
  // The role may already exist on a second run, so creation is conditional
  // and the password is set separately. The REVOKE is what test case TS-05
  // depends on: the application role may write audit rows but never alter
  // or remove one, so immutability holds whichever code path writes.
  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role LOGIN;
  END IF;
END
$$;
ALTER ROLE app_role WITH LOGIN PASSWORD '${password}';
GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
REVOKE UPDATE, DELETE ON audit_log FROM app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
`;
}

const PLAN = {
  migrate: () => files(path.join('db', 'migrations')).map((f) => ({ label: f, file: f })),
  seed: () => files(path.join('db', 'seed')).map((f) => ({ label: f, file: f })),
  role: () => [{ label: 'application role and grants', sql: DRY ? '' : roleStatements() }],
  verify: () => [{ label: 'db/verify.sql', file: path.join('db', 'verify.sql'), print: true }],
};
PLAN.all = () => [...PLAN.migrate(), ...PLAN.seed(), ...PLAN.role(), ...PLAN.verify()];

async function main() {
  const steps = (PLAN[command] || null);
  if (!steps) {
    console.error(`Unknown command "${command}". Use migrate, seed, role, verify or all.`);
    process.exit(1);
  }
  const plan = steps();

  if (DRY) {
    console.log(`Would apply ${plan.length} step(s) for "${command}":`);
    for (const s of plan) {
      const size = s.file ? fs.statSync(path.join(ROOT, s.file)).size : 0;
      console.log(`  ${s.label}${size ? `  (${size} bytes)` : ''}`);
    }
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  // A single connection, not the pool: these are one-off administrative
  // statements and the pooled endpoint is not required for them.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const who = await client.query('SELECT current_database() AS db, current_user AS usr, version() AS v');
  console.log(`connected to ${who.rows[0].db} as ${who.rows[0].usr}`);
  console.log(who.rows[0].v.split(',')[0]);

  for (const step of plan) {
    const sql = step.file ? fs.readFileSync(path.join(ROOT, step.file), 'utf8') : step.sql;
    process.stdout.write(`applying ${step.label} ... `);
    try {
      if (step.print) {
        // verify.sql is written for psql and carries \echo labels, which the
        // driver cannot execute. Run the SQL between the labels and print
        // each result under its own heading, so the output still reads as
        // the labelled evidence blocks Chapter Five refers to.
        console.log();
        let pending = '';
        const flush = async () => {
          if (!pending.trim()) { pending = ''; return; }
          const r = await client.query(pending);
          for (const one of [].concat(r)) {
            if (one.rows && one.rows.length) console.table(one.rows);
          }
          pending = '';
        };
        for (const line of sql.split(/\r?\n/)) {
          if (/^\s*\\echo\b/.test(line)) {
            await flush();
            const m = line.match(/^\s*\\echo\s+'?(.*?)'?\s*$/);
            console.log(m ? m[1] : '');
          } else if (/^\s*\\/.test(line)) {
            continue;                 // any other psql meta-command
          } else {
            pending += line + '\n';
          }
        }
        await flush();
        console.log('verification complete');
        continue;
      }
      await client.query(sql);
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error(`  ${e.message}`);
      if (e.position) console.error(`  at character ${e.position}`);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log('\ndone.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
