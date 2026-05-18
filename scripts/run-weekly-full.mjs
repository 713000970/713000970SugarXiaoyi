/**
 * 本地一键：骨架 → RSS 摘录 → AI 填稿（有 API Key 时）→ build。与 CI 步骤顺序一致。
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const node = process.execPath;

function run(script) {
  const r = spawnSync(node, [path.join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(['create-weekly-report.mjs', 'append-weekly-digest.mjs'].includes(script)
        ? { SKIP_BUILD: '1' }
        : {}),
    },
  });
  if (r.status !== 0) {
    throw new Error(`${script} exited ${r.status === null ? 'null' : r.status}`);
  }
}

run('create-weekly-report.mjs');
run('append-weekly-digest.mjs');
run('fill-weekly-content.mjs');

const buildScript = path.join(ROOT, 'build.mjs');
const r = spawnSync(node, [buildScript], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) {
  throw new Error(`build.mjs exited ${r.status === null ? 'null' : r.status}`);
}
