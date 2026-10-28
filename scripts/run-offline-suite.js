'use strict';
/**
 * Orchestrates `npm run test:offline`:
 *
 *   1. builds client/ for production (vite build)
 *   2. serves that build as plain static files (vite preview), in the
 *      background, on the port tests/offline.test.js expects
 *   3. runs tests/offline.test.js against it
 *   4. shuts the preview server back down
 *   5. exits with the test run's own exit code
 *
 * The API SERVER is NOT started here — it must already be running in its
 * own window first, exactly the way tests/e2e.test.js already expects
 * (see OFFLINE_SETUP_NOTE.md / E2E_SETUP_NOTE.md). This script only owns
 * the client half, because that half is new.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const PORT = process.env.CLIENT_PORT || '5174';
const CLIENT_URL = `http://localhost:${PORT}`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`client preview never answered at ${url} within ${timeoutMs}ms`);
}

(async () => {
  console.log('Building client/ for production...');
  run('npm', ['run', 'build'], { cwd: CLIENT_DIR });

  console.log(`Starting the production build on ${CLIENT_URL} ...`);
  const preview = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
    cwd: CLIENT_DIR,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewOutput = '';
  preview.stdout.on('data', d => { previewOutput += d; });
  preview.stderr.on('data', d => { previewOutput += d; });

  let testExitCode = 1;
  try {
    await waitForServer(CLIENT_URL);
    console.log('Client is up. Running the offline and synchronisation suite...\n');

    testExitCode = await new Promise((resolve) => {
      const test = spawn('node', ['tests/offline.test.js'], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, CLIENT_URL },
      });
      test.on('exit', (code) => resolve(code === null ? 1 : code));
    });
  } catch (e) {
    console.error('Could not start the client preview server:');
    console.error(previewOutput || e.message);
    testExitCode = 1;
  } finally {
    preview.kill();
  }

  process.exit(testExitCode);
})();
