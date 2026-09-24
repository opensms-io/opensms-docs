// Runs every tests/*.test.mjs with Node's built-in test runner.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests').filter((f) => f.endsWith('.test.mjs')).map((f) => `tests/${f}`);
if (files.length === 0) {
  console.error('no tests found');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
