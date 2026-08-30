'use strict';
/**
 * Entry point. Not present in the uploaded bundle — app.js exports
 * buildApp() but nothing called it to actually listen. This is that missing
 * piece: standard Express bootstrapping, no project-specific logic.
 */
const { buildApp } = require('./app');

const PORT = process.env.PORT || 4000;
const app = buildApp();

app.listen(PORT, () => {
  console.log(`marpol-compliance-server listening on :${PORT}`);
});
