/**
 * Fail CI if the target weekly report is still the template skeleton.
 * This prevents GitHub Actions from publishing an empty "framework" page.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { currentBeijingWeekContext, weeklyTargetContext } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function currentWeeklyPath() {
  const { weekCode } = weeklyTargetContext();
  return path.join(ROOT, 'weekly', `${weekCode}-周报.md`);
}

const REQUIRED_SECTION_TITLES = [
  '一、K12教育政策',
  '二、K12教辅政策',
  '三、出版数智化',
  '四、局社合作',
  '五、科技合作',
  '六、评教辅行业',
  '七、政策解读',
];
const ALLOWED_SECTION_TITLES = new Set(REQUIRED_SECTION_TITLES);
const FORBIDDEN_PLACEHOLDER_RE =
  /本周公开稿未见|未检索到|未见新的|暂无|待核验|建议继续跟进|不作为本周新闻|不作为本周.*动态|采编口径说明|会务日历背景/;
const FORBIDDEN_FIELD_RE =
  /^\s*-\s*(来源平台|来源|要点|影响判断|可跟进点|发布单位|发布时间|原文链接|核心条款|执行影响|出版社\/教辅公司|教育局\/学校\/事业单位|科技公司\/平台方|合作内容与期限|合作方向|本周动态|机会|风险|下周动作|公司\/机构|出版侧|数智化侧)：/m;

function extractBusinessSections(md) {
  const m = md.match(
    /## (?:一、K12教育政策|二、K12教辅政策|三、出版数智化|四、局社合作|五、科技合作|六、评教辅行业|七、政策解读)[\s\S]*?(?=## 附录：自动摘录|## 十一、自动摘录|$)/,
  );
  return m ? m[0].trim() : '';
}

function extractFirstSection(md) {
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
  const endLabel = /^[一二三四五六七八九十]$/.test(end) ? `${end}、` : end;
  const endRe = new RegExp(`\\n## ${endLabel}`);
  const endMatch = endRe.exec(rest);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

function extractNewsFreshnessBlock(md) {
  const sections = [
    extractSection(md, '一', '二'),
    extractSection(md, '二', '三'),
    extractSection(md, '三', '四'),
    extractSection(md, '四', '五'),
    extractSection(md, '五', '六'),
    extractSection(md, '六', '七'),
    extractSection(md, '七', '附录：自动摘录'),
  ];
  return sections.join('\n\n');
}

function oldDateMentionsInNewsSections(md, weekStart) {
  const block = extractNewsFreshnessBlock(md);
  if (!block) return [];

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
      const context = block.slice(Math.max(0, m.index - 180), Math.min(block.length, m.index + 160));
      hits.push(`${ymd}: ${context.replace(/\s+/g, ' ').trim()}`);
    }
  }

  return [...new Set(hits)];
}

function freshnessFloorForWeek(weekStart, currentWeekStart) {
  const floor = new Date(weekStart);
  // 自动发布目标为上一完整周；当前/未来周手动生成时仍允许滚动 7 天窗口。
  if (weekStart >= currentWeekStart) floor.setDate(floor.getDate() - 7);
  return floor;
}

function isSkeleton(md) {
  const block = extractBusinessSections(md);
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
    /^政策：?\s*$/,
    /^合作事项：?\s*$/,
    /^行业判断：?\s*$/,
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
    /^出版社\/教辅公司：\s*$/,
    /^教育局\/学校\/事业单位：\s*$/,
    /^科技公司\/平台方：\s*$/,
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
    /^合作内容与期限：\s*$/,
    /^时间：\s*$/,
    /^地点：\s*$/,
    /^主办\/承办：\s*$/,
    /^与我方相关性：\s*$/,
    /^建议动作：\s*$/,
  ];
  const substantive = bullets.filter((t) => !placeholder.some((re) => re.test(t)));
  const realLinks = (block.match(/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/g) || []).length;
  return substantive.length < 3 || realLinks < 3;
}

function sectionTitles(business) {
  return [...business.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
}

function topLevelItems(business) {
  return [...business.matchAll(/^- .+$/gm)].map((m) => m[0]);
}

function extractPolicyInterpretationSection(md) {
  return extractSection(md, '七', '附录：自动摘录');
}

function validate(md, filePath) {
  const business = extractBusinessSections(md);
  const headings = sectionTitles(business);
  const invalidSections = headings.filter((title) => !ALLOWED_SECTION_TITLES.has(title));
  const nestedBullets = [...business.matchAll(/^\s{2,}-\s+\S/gm)].length;
  const items = topLevelItems(business);
  const linkCount = (business.match(/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/g) || []).length;
  const itemsWithoutLinks = items.filter((line) => !/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/.test(line));
  const malformedItems = items.filter((line) => !/^- \*\*[^*]+\*\*：.+\]\(https?:\/\/(?!\.\.\.)[^)]+\)\s*$/.test(line));
  const { date: currentDate } = currentBeijingWeekContext();
  const weekStart = isoWeekStartFromFilePath(filePath) || startOfIsoWeek(currentDate);
  const currentWeekStart = startOfIsoWeek(currentDate);
  const freshnessFloor = freshnessFloorForWeek(weekStart, currentWeekStart);
  const targetWeekStart = weeklyTargetContext().weekStartDate;
  const isTargetWeek = weekStart.getTime() === targetWeekStart.getTime();
  const oldNewsDates =
    weekStart >= currentWeekStart || isTargetWeek ? oldDateMentionsInNewsSections(md, freshnessFloor) : [];
  const policyInterpretation = extractPolicyInterpretationSection(md);
  const policyInterpretationItems = policyInterpretation ? topLevelItems(policyInterpretation) : [];
  const malformedPolicyInterpretationItems = policyInterpretationItems.filter(
    (line) => !/(政策解读|解读|问答|图解|一图读懂|专家解读|答记者问|读懂|说明|释疑)/.test(line),
  );

  const errors = [];
  if (isSkeleton(md)) errors.push('business sections still look like the template skeleton');
  if (!headings.length) errors.push('expected at least one business section with real items');
  if (invalidSections.length) errors.push(`invalid section titles: ${invalidSections.join(', ')}`);
  if (!items.length) errors.push('expected at least one concise news item');
  if (nestedBullets) errors.push(`nested bullet fields are not allowed, found ${nestedBullets}`);
  if (itemsWithoutLinks.length) errors.push(`items without source links: ${itemsWithoutLinks.slice(0, 3).join(' | ')}`);
  if (malformedItems.length) {
    errors.push(
      `items must use "- **标题**：一句说明。[原文](url)": ${malformedItems.slice(0, 3).join(' | ')}`,
    );
  }
  if (FORBIDDEN_FIELD_RE.test(business)) errors.push('field-style bullets are not allowed; use title + one-sentence intro + source link only');
  if (FORBIDDEN_PLACEHOLDER_RE.test(business)) errors.push('placeholder/no-news explanations are not allowed; omit that item or section');
  if (linkCount < items.length) errors.push(`expected one source link per item, found ${linkCount} links for ${items.length} items`);
  if (oldNewsDates.length) {
    errors.push(
      `news sections contain sources older than the rolling collection window (${ymdFromDate(freshnessFloor)}): ${oldNewsDates
        .slice(0, 5)
        .join(' | ')}`,
    );
  }
  if (malformedPolicyInterpretationItems.length) {
    errors.push(
      `policy interpretation items must be actual interpretation/Q&A/infographic/expert-explanation articles: ${malformedPolicyInterpretationItems
        .slice(0, 3)
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
