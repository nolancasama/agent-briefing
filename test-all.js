/* Run root Node tests in isolation; browser tests have their own command. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const tests = fs.readdirSync(__dirname).filter(name => /^test-.*\.js$/.test(name) && name !== 'test-all.js' && !/^test-e2e/.test(name)).sort();
for (const name of tests) {
  console.log('\n' + name);
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll ' + tests.length + ' Node test files passed.');
