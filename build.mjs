/**
 * 入口：优先运行根目录 generate-html.mjs，否则运行 scripts/generate-html.mjs
 * （避免只打开 scripts 文件夹时误以为根目录没有脚本）
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(root, 'generate-html.mjs'),
  path.join(root, '生成-html.mjs'),
  path.join(root, 'scripts', 'generate-html.mjs'),
];

for (const script of candidates) {
  if (fs.existsSync(script)) {
    const r = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: root, env: process.env });
    process.exit(r.status === null ? 1 : r.status);
  }
}

console.error(
  '找不到构建脚本。请在项目根目录任选其一：\n' +
    '  1) generate-html.mjs\n' +
    '  2) 生成-html.mjs（中文文件名也可）\n' +
    '  3) scripts/generate-html.mjs\n' +
    '并确保存在 build.mjs（npm run build 的入口）。'
);
process.exit(1);
