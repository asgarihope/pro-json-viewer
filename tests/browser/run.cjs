const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Native clipboard tests share the OS clipboard, so run suites sequentially.
for (const file of ['browser-tests.cjs', 'graph-browser-tests.cjs', 'selection-tests.cjs', 'animation-browser-tests.cjs', 'appearance-browser-tests.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
