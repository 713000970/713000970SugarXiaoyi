/**
 * 将周报章节顺序调整为：一～五 → 八～十 → 六、七 → 十一（政策在前，运营在后）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const weeklyDir = path.join(ROOT, 'weekly');

const SECTION_ORDER = ['一', '二', '三', '四', '五', '八', '九', '十', '六', '七'];

function splitSections(md) {
  const headerMatch = md.match(/^[\s\S]*?(?=## 一、)/);
  const header = headerMatch ? headerMatch[0] : '';
  const bodyStart = header.length;
  const elevenIdx = md.indexOf('## 十一、');
  const body = md.slice(bodyStart, elevenIdx >= 0 ? elevenIdx : md.length);
  const tail = elevenIdx >= 0 ? md.slice(elevenIdx) : '';

  const parts = new Map();
  const re = /^## ([一二三四五六七八九十])、(.+)$/gm;
  const starts = [];
  let m;
  while ((m = re.exec(body))) {
    starts.push({ num: m[1], title: m[2], index: m.index, line: m[0] });
  }
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    parts.set(cur.num, body.slice(cur.index, end).trimEnd() + '\n');
  }
  return { header, parts, tail };
}

function reorderMarkdown(md) {
  const { header, parts, tail } = splitSections(md);
  const blocks = [];
  for (const num of SECTION_ORDER) {
    if (!parts.has(num)) continue;
    blocks.push(parts.get(num).trimEnd());
  }
  return `${header}${blocks.join('\n\n')}\n\n${tail.trimEnd()}\n`;
}

const files = fs.readdirSync(weeklyDir).filter((f) => f.endsWith('-周报.md'));
for (const f of files) {
  const p = path.join(weeklyDir, f);
  const out = reorderMarkdown(fs.readFileSync(p, 'utf8'));
  fs.writeFileSync(p, out, 'utf8');
  console.log(`Reordered: ${p}`);
}
