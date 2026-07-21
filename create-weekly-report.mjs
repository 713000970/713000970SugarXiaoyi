/**
 * Backward-compatible entrypoint. The maintained implementation lives in scripts/.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(ROOT, 'scripts', 'create-weekly-report.mjs');
const result = spawnSync(process.execPath, [script], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
