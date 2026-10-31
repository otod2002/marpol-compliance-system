'use strict';
/**
 * Reset an application account's email address and/or password.
 *
 * The bootstrap script deliberately refuses to run a second time, so this is
 * the way to recover an administrator login whose password has been lost, or
 * to correct an address entered during setup. It writes to the `app_user`
 * table only: no database role, and no Neon credential, is touched.
 *
 * Every account it can reach is one an administrator could also change
 * through the application, which is the audited path and the one to prefer
 * once you can sign in.
 *
 * Usage, from the repository root:
 *
 *   node scripts/reset-login.js list
 *   node scripts/reset-login.js reset <current-email> <new-password> [new-email]
 *
 * Requires DATABASE_URL in the environment.
 */
const path = require('node:path');
const { query, pool } = require(path.join(__dirname, '..', 'server', 'src', 'db'));
const { hashPassword } = require(path.join(__dirname, '..', 'server', 'src', 'auth'));

async function list() {
  const { rows } = await query(
    `SELECT u.email, r.role_name, u.is_active, u.full_name
       FROM app_user u JOIN role r ON r.role_id = u.role_id
      ORDER BY r.role_name, u.email`);
  if (!rows.length) {
    console.log('No accounts exist. Run server/scripts/bootstrap-admin.js first.');
  } else {
    console.table(rows);
  }
}

async function reset(current, password, newEmail) {
  if (!current || !password) {
    console.error('Usage: node scripts/reset-login.js reset <current-email> <new-password> [new-email]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Refusing: the password must be at least 12 characters.');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const { rows } = await query(
    `UPDATE app_user
        SET email = COALESCE($1, email), password_hash = $2, is_active = TRUE
      WHERE lower(email) = lower($3)
      RETURNING email`,
    [newEmail || null, hash, current]);

  if (!rows.length) {
    console.log(`No account matches ${current}. Run "list" to see what exists.`);
    process.exit(1);
  }
  console.log(`updated: ${rows[0].email}`);
}

const [command, ...args] = process.argv.slice(2);
const run = command === 'list' ? list() : command === 'reset' ? reset(...args) : null;

if (!run) {
  console.error('Usage: node scripts/reset-login.js list');
  console.error('       node scripts/reset-login.js reset <current-email> <new-password> [new-email]');
  process.exit(1);
}
run.catch((e) => { console.error(e.message); process.exitCode = 1; })
   .finally(() => pool.end());
