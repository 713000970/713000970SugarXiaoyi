/**
 * Legacy helper kept for npm/manual compatibility.
 * The weekly structure uses six optional business sections; this script only checks order.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const weeklyDir = path.join(ROOT, 'weekly');

const ORDERED = [
  '## 一、K12教育政策',
  '## 二、K12教辅政策',
  '## 三、出版数智化',
  '## 四、局社合作',
  '## 五、科技合作',
  '## 六、评教辅行业',
  '## 七、政策解读',
];

function checkMarkdown(md, filePath) {
  let last = -1;
  let found = 0;
  for (const heading of ORDERED) {
    const idx = md.indexOf(heading);
    if (idx < 0) continue;
    if (idx < last) throw new Error(`${filePath}: section order is invalid at ${heading}`);
    last = idx;
    found++;
  }
  if (!found) throw new Error(`${filePath}: no business sections found`);
}

const files = fs.readdirSync(weeklyDir).filter((f) => f.endsWith('-周报.md'));
for (const f of files) {
  const p = path.join(weeklyDir, f);
  const md = fs.readFileSync(p, 'utf8');
  if (!md.includes('## 一、K12教育政策')) continue;
  checkMarkdown(md, p);
  console.log(`Checked business section order: ${p}`);
}
