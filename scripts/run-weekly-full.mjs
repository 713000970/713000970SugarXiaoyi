/**
 * 本地一键：生成骨架（不 build）→ 拉取 RSS 摘录 → build。与 CI 中两步顺序一致。
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
    env: { ...process.env, ...(script === 'create-weekly-report.mjs' ? { SKIP_BUILD: '1' } : {}) },
  });
  if (r.status !== 0) {
    throw new Error(`${script} exited ${r.status === null ? 'null' : r.status}`);
  }
}

run('create-weekly-report.mjs');
run('append-weekly-digest.mjs');
