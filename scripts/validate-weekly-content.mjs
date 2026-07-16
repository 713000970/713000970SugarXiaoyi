/**
 * Fail CI if the current weekly report is still the template skeleton.
 * This prevents GitHub Actions from publishing an empty "framework" page.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { currentBeijingWeekContext } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function currentWeeklyPath() {
  const { weekCode } = currentBeijingWeekContext();
  return path.join(ROOT, 'weekly', `${weekCode}-周报.md`);
}

function extractSectionsOneToTen(md) {
  const m = md.match(/## 一、[\s\S]*?(?=## 十一、|$)/);
  return m ? m[0].trim() : '';
}

function extractSummary(md) {
  const m = md.match(/## 一、[\s\S]*?(?=## 二、|$)/);
  return m ? m[0] : '';
}

function parseYmd(ymd) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfIsoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function isoWeekStartFromFilePath(filePath) {
  const m = path.basename(filePath).match(/^(20\d{2})-W(\d{2})-/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - jan4Day);
  return addDays(week1Monday, (week - 1) * 7);
}

function ymdFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractSection(md, start, end) {
  const startRe = new RegExp(`^## ${start}、`, 'm');
  const startMatch = startRe.exec(md);
  if (!startMatch) return '';
  const rest = md.slice(startMatch.index);
  const endRe = new RegExp(`\\n## ${end}、`);
  const endMatch = endRe.exec(rest);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

function extractNewsFreshnessBlock(md) {
  const sections = [
    extractSection(md, '一', '二'),
    extractSection(md, '二', '三'),
    extractSection(md, '三', '四'),
    extractSection(md, '四', '五'),
    extractSection(md, '七', '八'),
    extractSection(md, '八', '九'),
  ];
  return sections.join('\n\n');
}

function oldDateMentionsInNewsSections(md, weekStart) {
  const block = extractNewsFreshnessBlock(md);
  if (!block) return [];

  const allowedOldContext = /(不作为本周新闻|不作为本周.*动态|会务日历背景)/;
  const hits = [];

  const patterns = [
    /\b(20\d{2}-\d{2}-\d{2})\b/g,
    /\/(20\d{2})(\d{2})(\d{2})\//g,
    /\/(20\d{2})(\d{2})\/t\1\2(\d{2})_/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(block))) {
      const ymd = m.length === 2 ? m[1] : `${m[1]}-${m[2]}-${m[3]}`;
      const d = parseYmd(ymd);
      if (!d || d >= weekStart) continue;
      const context = block.slice(Math.max(0, m.index - 80), Math.min(block.length, m.index + 120));
      if (allowedOldContext.test(context)) continue;
      hits.push(`${ymd}: ${context.replace(/\s+/g, ' ').trim()}`);
    }
  }

  return [...new Set(hits)];
}

function isSkeleton(md) {
  const block = extractSectionsOneToTen(md);
  if (!block) return true;
  if (
    /每条摘要末尾附来源平台/.test(block) ||
    /https:\/\/\.\.\./.test(block) ||
    /标题或文件号/.test(block) ||
    /B站@××/.test(block)
  ) {
    return true;
  }

  const bullets = [...block.matchAll(/^\s*-\s*(.*)$/gm)].map((x) => x[1].trim());
  const placeholder = [
    /^$/,
    /^事件：?\s*$/,
    /^来源平台：.*$/,
    /^来源：\s*$/,
    /^来源：（媒体\/机构 \+ 日期）.*$/,
    /^要点：\s*$/,
    /^影响判断：\s*$/,
    /^高优先级：\s*$/,
    /^中优先级：\s*$/,
    /^低优先级：\s*$/,
    /^风险：\s*$/,
    /^机会：\s*$/,
    /^政策：\s*$/,
    /^公司\/机构：\s*$/,
    /^会务名称：\s*$/,
    /^（可选）.*$/,
    /^发布单位：\s*$/,
    /^发布时间：\s*$/,
    /^原文链接：\[标题或文件号\]\(https:\/\/\.\.\.\)\s*$/,
    /^核心条款：\s*$/,
    /^执行影响：\s*$/,
    /^国家层面要点：\s*$/,
    /^省级重点变化.*$/,
    /^对我方.*$/,
    /^出版侧.*$/,
    /^数智化侧.*$/,
    /^合作方.*$/,
    /^合作方向：\s*$/,
    /^可跟进点：\s*$/,
    /^教材教辅.*$/,
    /^重点省份.*$/,
    /^教育部门.*$/,
    /^出版社\/教辅公司：\s*$/,
    /^合作内容与期限：\s*$/,
    /^时间：\s*$/,
    /^地点：\s*$/,
    /^主办\/承办：\s*$/,
    /^与我方相关性：\s*$/,
    /^建议动作：\s*$/,
  ];
  const substantive = bullets.filter((t) => !placeholder.some((re) => re.test(t)));
  const realLinks = (block.match(/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/g) || []).length;
  return substantive.length < 8 || realLinks < 3 || block.length < 5000;
}

function validate(md, filePath) {
  const headings = [...md.matchAll(/^##\s+[一二三四五六七八九十]、/gm)].length;
  const summary = extractSummary(md);
  const summaryBullets = [...summary.matchAll(/^\s*-\s+\S/gm)].length;
  const summaryLinks = (summary.match(/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/g) || []).length;
  const { date: currentDate } = currentBeijingWeekContext();
  const weekStart = isoWeekStartFromFilePath(filePath) || startOfIsoWeek(currentDate);
  const oldNewsDates = oldDateMentionsInNewsSections(md, weekStart);

  const errors = [];
  if (isSkeleton(md)) errors.push('sections 1-10 still look like the template skeleton');
  if (headings < 10) errors.push(`expected 10 numbered sections, found ${headings}`);
  if (summaryBullets < 3) errors.push(`expected at least 3 summary bullets, found ${summaryBullets}`);
  if (summaryLinks < 3) errors.push(`expected at least 3 summary links, found ${summaryLinks}`);
  if (oldNewsDates.length) {
    errors.push(
      `news sections contain sources dated before this report week (${ymdFromDate(weekStart)}): ${oldNewsDates
        .slice(0, 5)
        .join(' | ')}`,
    );
  }

  if (errors.length) {
    console.error(`[validate] ${filePath} is not publishable:`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`[validate] ${filePath} looks publishable.`);
}

const target = process.argv[2]
  ? path.resolve(ROOT, process.argv[2])
  : currentWeeklyPath();

if (!fs.existsSync(target)) {
  console.error(`[validate] Missing weekly file: ${target}`);
  process.exit(1);
}

validate(fs.readFileSync(target, 'utf8'), target);
