/**
 * 从模板生成当周周报骨架、更新「周报索引」、运行 npm run build。
 * 与 PowerShell 版 create_weekly_report.ps1 行为对齐，供 CI（Ubuntu）与本机共用。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { currentBeijingWeekContext } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const centerPath = path.join(ROOT, '周报中心.md');
const templatePath = path.join(ROOT, 'templates', '周报模板.md');
const weeklyDir = path.join(ROOT, 'weekly');

if (!fs.existsSync(centerPath)) throw new Error(`Missing file: ${centerPath}`);
if (!fs.existsSync(templatePath)) throw new Error(`Missing file: ${templatePath}`);
if (!fs.existsSync(weeklyDir)) fs.mkdirSync(weeklyDir, { recursive: true });

const { weekCode, dateCode } = currentBeijingWeekContext();

const weeklyFileName = `${weekCode}-周报.md`;
const weeklyFilePath = path.join(ROOT, 'weekly', weeklyFileName);
const weeklyRelativePath = `weekly/${weeklyFileName}`;
const weeklyTitle = `# ${weekCode} 教辅行业与K12动态周报`;
const weeklyLinkLine = `- [${weekCode} 周报](${weeklyRelativePath})`;

if (!fs.existsSync(weeklyFilePath)) {
  let template = fs.readFileSync(templatePath, 'utf8');
  template = template.replaceAll('YYYY-WW', weekCode).replaceAll('YYYY-MM-DD', dateCode);
  template = template.replace(/^# .*$/m, weeklyTitle);
  fs.writeFileSync(weeklyFilePath, template, 'utf8');
  console.log(`Created weekly report: ${weeklyFilePath}`);
} else {
  console.log(`Weekly report already exists: ${weeklyFilePath}`);
}

const centerRaw = fs.readFileSync(centerPath, 'utf8');
const centerLines = centerRaw.split(/\r?\n/);
if (centerLines.includes(weeklyLinkLine)) {
  console.log(`Index already contains: ${weeklyLinkLine}`);
} else {
  const indexHeader = '## 周报索引（最新在前）';
  const headerIndex = centerLines.findIndex((l) => l === indexHeader);
  if (headerIndex < 0) throw new Error(`Index header not found: ${indexHeader}`);

  let insertIndex = headerIndex + 1;
  if (
    insertIndex < centerLines.length &&
    (centerLines[insertIndex] ?? '').trim() === ''
  ) {
    insertIndex += 1;
  }

  const newLines = [];
  for (let i = 0; i < centerLines.length; i++) {
    if (i === insertIndex) newLines.push(weeklyLinkLine);
    newLines.push(centerLines[i]);
  }
  if (insertIndex >= centerLines.length) newLines.push(weeklyLinkLine);

  fs.writeFileSync(centerPath, newLines.join('\n') + (centerRaw.endsWith('\n') ? '\n' : ''), 'utf8');
  console.log(`Updated index: ${weeklyLinkLine}`);
}

const skipBuild =
  process.env.SKIP_BUILD === '1' ||
  process.env.SKIP_BUILD === 'true' ||
  process.env.SKIP_BUILD === 'yes';
if (skipBuild) {
  console.log('SKIP_BUILD set; skipping build (next step should run append-weekly-digest + build).');
} else {
  const buildScript = path.join(ROOT, 'build.mjs');
  const r = spawnSync(process.execPath, [buildScript], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`build failed with exit code ${r.status === null ? 'null' : r.status}`);
  }
}
