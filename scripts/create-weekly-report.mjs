/**
 * 从模板生成当周周报骨架、更新「周报索引」、运行 npm run build。
 * 与 PowerShell 版 create_weekly_report.ps1 行为对齐，供 CI（Ubuntu）与本机共用。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** ISO 周（周一为周首日），与 PowerShell Get-Date 本地日历 + FirstFourDayWeek 对齐 */
function getIsoWeekInfo(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const dom = date.getDate();
  const tmp = new Date(y, m, dom);
  const day = (tmp.getDay() + 6) % 7;
  tmp.setDate(tmp.getDate() - day + 3);
  const isoYear = tmp.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - jan4Day);
  const diffDays = Math.floor((tmp - week1Monday) / 86400000);
  const week = 1 + Math.floor(diffDays / 7);
  return { year: isoYear, week };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

const centerPath = path.join(ROOT, '周报中心.md');
const templatePath = path.join(ROOT, 'templates', '周报模板.md');
const weeklyDir = path.join(ROOT, 'weekly');

if (!fs.existsSync(centerPath)) throw new Error(`Missing file: ${centerPath}`);
if (!fs.existsSync(templatePath)) throw new Error(`Missing file: ${templatePath}`);
if (!fs.existsSync(weeklyDir)) fs.mkdirSync(weeklyDir, { recursive: true });

const today = new Date();
const { year, week } = getIsoWeekInfo(today);
const weekCode = `${year}-W${pad2(week)}`;
const dateCode = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

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

  fs.writeFileSync(newLines.join('\n') + (centerRaw.endsWith('\n') ? '\n' : ''), centerPath, 'utf8');
  console.log(`Updated index: ${weeklyLinkLine}`);
}

const buildScript = path.join(ROOT, 'build.mjs');
const r = spawnSync(process.execPath, [buildScript], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) {
  throw new Error(`build failed with exit code ${r.status === null ? 'null' : r.status}`);
}
