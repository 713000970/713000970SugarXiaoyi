/**
 * 周报章节：政策/行业在前、运营在后，且标题序号为连续 一～十一。
 * 内容顺序：一～五 → 原八～十（会务/出版/跨行）→ 原六、七（运营/风险）→ 十一
 * 编号映射：八→六、九→七、十→八、六→九、七→十
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const weeklyDir = path.join(ROOT, 'weekly');

const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** @returns {number | null} 1–10 */
function canonicalIndex(title) {
  if (title.includes('核心摘要')) return 1;
  if (title.includes('教辅行业动态')) return 2;
  if (title.includes('K12教育信息')) return 3;
  if (title.includes('服务K12的平台')) return 4;
  if (title.includes('政府政策')) return 5;
  if (title.includes('会务计划')) return 6;
  if (title.includes('出版及数智化')) return 7;
  if (title.includes('跨行及')) return 8;
  if (title.includes('运营行动')) return 9;
  if (title.includes('风险与机会')) return 10;
  return null;
}

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
    const block = body.slice(cur.index, end).trimEnd();
    const idx = canonicalIndex(cur.title);
    if (idx) parts.set(idx, { title: cur.title, block });
  }
  return { header, parts, tail };
}

function renumberHeading(block, newNum, title) {
  const lines = block.split('\n');
  lines[0] = `## ${newNum}、${title}`;
  return lines.join('\n').trimEnd();
}

function reorderMarkdown(md) {
  const { header, parts, tail } = partsOrThrow(splitSections(md));
  const blocks = [];
  for (let i = 1; i <= 10; i++) {
    if (!parts.has(i)) continue;
    const { title, block } = parts.get(i);
    blocks.push(renumberHeading(block, NUMS[i - 1], title));
  }
  return `${header}${blocks.join('\n\n')}\n\n${tail.trimEnd()}\n`;
}

function partsOrThrow({ header, parts, tail }) {
  if (parts.size === 0) throw new Error('No sections parsed');
  return { header, parts, tail };
}

const files = fs.readdirSync(weeklyDir).filter((f) => f.endsWith('-周报.md'));
for (const f of files) {
  const p = path.join(weeklyDir, f);
  const out = reorderMarkdown(fs.readFileSync(p, 'utf8'));
  fs.writeFileSync(p, out, 'utf8');
  console.log(`Reordered & renumbered: ${p}`);
}
