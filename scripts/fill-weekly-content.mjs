/**
 * 用 LLM 根据 RSS 摘录 + 范例周报，将当周 markdown 第一～十章写成「满篇干货」。
 * 需环境变量 ANTHROPIC_API_KEY 或 OPENAI_API_KEY；无密钥时跳过（exit 0）。
 * 保留「十一、自动摘录」节不变。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { currentBeijingWeekContext } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadFillConfig() {
  const p = path.join(ROOT, 'config', 'weekly-fill.json');
  const defaults = {
    exampleWeeklyPath: 'weekly/2026-W24-周报.md',
    searchHintsPath: 'config/weekly-search-hints.json',
    eventsCalendarPath: 'config/weekly-events-calendar.json',
    anthropicModel: 'claude-sonnet-4-20250514',
    openaiModel: 'gpt-4o',
    maxTokens: 8192,
  };
  if (!fs.existsSync(p)) return defaults;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { ...defaults, ...j };
}

function loadSearchHints(cfg) {
  const rel = cfg.searchHintsPath || 'config/weekly-search-hints.json';
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function loadEventsCalendar(cfg) {
  const rel = cfg.eventsCalendarPath || 'config/weekly-events-calendar.json';
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function parseYmd(ymd) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 筛选：已结束 lookback 天内 + 未来 lookahead 天内的会展 */
function filterRelevantEvents(calendar, refDate) {
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  const lookback = Number(calendar?.lookbackDays) || 7;
  const lookahead = Number(calendar?.lookaheadDays) || 60;
  const ref = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const windowStart = new Date(ref);
  windowStart.setDate(windowStart.getDate() - lookback);
  const windowEnd = new Date(ref);
  windowEnd.setDate(windowEnd.getDate() + lookahead);

  return events.filter((ev) => {
    const start = parseYmd(ev.start);
    const end = parseYmd(ev.end || ev.start);
    if (!start || !end) return false;
    return end >= windowStart && start <= windowEnd;
  });
}

function formatEventsForPrompt(calendar, refDate) {
  if (!calendar) return '';
  const relevant = filterRelevantEvents(calendar, refDate);
  if (!relevant.length) return '';

  const lines = [
    '## 近60天行业会务清单（config/weekly-events-calendar.json，仅作日历背景）',
    '',
    '以下会展只代表近60天会务安排，**默认只写入第六章「会务计划」或第九/十章行动建议**。',
    '**新闻时效硬规则**：若会展只有历史官宣/预备会链接（发布时间不在本周采编窗口），不得写入第一章摘要、第二章行业动态、第四章平台动态、第七/八章企业动态；只有当本周 RSS/公开检索出现当周发布的新稿，才可作为本周新闻推进。',
    '',
  ];
  for (const ev of relevant) {
    const status =
      parseYmd(ev.end) < refDate
        ? '【本周前已结束·写闭展复盘】'
        : parseYmd(ev.start) <= refDate
          ? '【进行中或本周开幕】'
          : '【即将举办·写筹备】';
    lines.push(`- **${ev.name}** ${status}`);
    lines.push(`  - 时间：${ev.start}${ev.end && ev.end !== ev.start ? ` 至 ${ev.end}` : ''}`);
    if (ev.location) lines.push(`  - 地点：${ev.location}`);
    if (ev.organizer) lines.push(`  - 主办：${ev.organizer}`);
    if (ev.theme) lines.push(`  - 主题：${ev.theme}`);
    if (ev.url) lines.push(`  - 参考链接：${ev.url}`);
    if (ev.keywords?.length) lines.push(`  - 采编关键词：${ev.keywords.join('、')}`);
    if (ev.chapters?.length) lines.push(`  - 建议写入章节：第 ${ev.chapters.join('、')} 章`);
    lines.push('');
  }
  lines.push(
    '若 RSS 未摘录到上述会展，只能写入第六章会务日历；链接优先用日历 url，或检索官媒后附 [原文](url)。',
    '',
  );
  return lines.join('\n');
}

function formatSearchHintsForPrompt(hints) {
  if (!hints?.topics?.length) return '';
  const lines = [
    '## 采编方向（章节分类不变，据此丰富内容）',
    '',
    '各「板块」写入对应周报章节，**不得新增或改名章节**：',
    '- **二**：出版社/教辅公司与各地教育部门深度合作 + 当周书展/馆配行业动态（必须是本周发布的新消息）',
    '- **三、五**：K12教育政策全国盘点（三写事件与盘点，五写政策文件与教辅政策盘点）',
    '- **四**：服务 K12 的平台动态（信息化/题库/AI 平台，可与科技公司合作互证）',
    '- **六**：教辅行业会务计划（近60天，**至少2条**，含书展/BIBF/订货会等）',
    '- **七**：出版社/教辅公司出版及数智化',
    '- **八**：出版社/教辅公司与科技公司深度合作',
    '',
  ];
  for (const t of hints.topics) {
    const ch = (t.weeklyChapters || []).join('、');
    lines.push(`### ${t.label}（写入第 ${ch} 章）`);
    lines.push(`- 搜索关键词：${(t.keywords || []).join('、')}`);
    lines.push(`- 重点关注：${(t.focus || []).join('、')}`);
    lines.push('');
  }
  const sp = hints.sourcePlatforms || {};
  lines.push('## 信息来源渠道（每条资讯须标注来源平台）');
  lines.push(`- **优先关注**：${(sp.priority || []).join('、')}`);
  lines.push(`- **同时关注**：${(sp.officialAndIndustry || []).join('、')}`);
  if (sp.note) lines.push(`- ${sp.note}`);
  lines.push('');
  lines.push('「来源」行格式（与范例层级一致，在「来源」上一行或同一行写明平台）：');
  lines.push('- `来源平台：××（如 B站@账号 / 小红书@博主 / 微博话题#×× / 微信公众号「××」/ 中国教育报 / 教育部官网）`');
  lines.push('- `来源：机构或账号（YYYY-MM-DD）· [原文](url)`');
  lines.push('- 第一章摘要可在句末追加 `· 来源平台：××`，并保留 `· [原文](url)`');
  lines.push('- **新闻时效**：第一、二、四、七、八章只收本周采编窗口内发布/更新的新闻；旧政策、旧官宣、旧预备会只能放第五章政策背景或第六章会务日历。');
  lines.push('- **禁止编造**社媒帖子、账号名或无法核实的链接；仅官方/媒体可确认时写平台+链接，否则标注不确定性。');
  lines.push('');
  return lines.join('\n');
}

function extractDigestBullets(md) {
  const m = md.match(/<!-- AUTO_DIGEST_START -->([\s\S]*?)<!-- AUTO_DIGEST_END -->/);
  if (!m) return '';
  return m[1].trim();
}

function extractSectionsOneToTen(md) {
  const m = md.match(/## 一、[\s\S]*?(?=## 十一、|$)/);
  return m ? m[0].trim() : '';
}

function extractHeader(md) {
  const m = md.match(/^[\s\S]*?(?=## 一、)/);
  return m ? m[0].trimEnd() + '\n\n' : '';
}

function extractSectionElevenOnward(md) {
  const idx = md.indexOf('## 十一、自动摘录');
  return idx >= 0 ? md.slice(idx).trimEnd() + '\n' : '';
}

function isSkeletonSections(body) {
  const block = extractSectionsOneToTen(body);
  if (!block) return true;

  if (
    /每条摘要末尾附来源平台/.test(block) ||
    /https:\/\/\.\.\./.test(block) ||
    /标题或文件号/.test(block) ||
    /B站@××/.test(block)
  ) {
    return true;
  }

  const bullets = [...block.matchAll(/^- (.+)$/gm)].map((x) => x[1].trim());
  if (!bullets.length) return true;

  const placeholder = [
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

  const substantive = bullets.filter((t) => {
    if (!t || t.length <= 2) return false;
    if (placeholder.some((re) => re.test(t))) return false;
    if (/\[原文\]\(https:\/\/\.\.\.\)/.test(t)) return false;
    if (/\[标题或文件号\]\(https:\/\/\.\.\.\)/.test(t)) return false;
    if (/^来源：（媒体\/机构 \+ 日期）/.test(t)) return false;
    return true;
  });

  const realLinks = (block.match(/\]\(https?:\/\/(?!\.\.\.)[^)]+\)/g) || []).length;
  return substantive.length < 8 || realLinks < 3;
}

function readExampleBody(cfg) {
  const rel = cfg.exampleWeeklyPath || 'weekly/2026-W21-周报.md';
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return '';
  const md = fs.readFileSync(p, 'utf8');
  const sample = extractSectionsOneToTen(md);
  return sample.slice(0, 12000);
}

function findPreviousWeeklyPath(weekCode) {
  const m = weekCode.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  let w = Number(m[2]) - 1;
  if (w < 1) {
    y -= 1;
    w = 52;
  }
  const prev = `${y}-W${pad2(w)}`;
  const p = path.join(ROOT, 'weekly', `${prev}-周报.md`);
  return fs.existsSync(p) ? p : null;
}

function buildPrompt({ weekCode, dateCode, digest, example, prevExcerpt, searchHintsBlock, eventsBlock }) {
  return `你是一位教辅行业与 K12 教育政策分析师。请撰写 **${weekCode}** 周报的 Markdown 正文（第一至第十章，不要写第十一章）。

## 输出要求
1. 语言：简体中文。
2. 只输出从 \`## 一、本周核心摘要（3-5条）\` 到 \`## 十、风险与机会清单\` 的全部内容，不要输出一级标题和「更新时间」行。
3. **章节顺序与序号固定**（先政策/行业，后运营侧，连续编号一至十）：一（摘要）→ 二（行业）→ 三（K12）→ 四（平台）→ 五（政策）→ 六（会务）→ 七（出版数智化）→ 八（跨行合作）→ 九（运营行动建议）→ 十（风险与机会）。
4. 结构、层级、字段名必须与「范例周报」一致（事件/来源/要点/影响判断等子项保留）；**每条资讯增加「来源平台」字段**（见下方采编方向）。
5. 事实须结合「本周 RSS 摘录」与采编关键词组织内容；不得编造文件号、日期、机构、社媒账号。
5b. **本周新闻硬规则**：第一章摘要、第二章行业动态、第四章平台动态、第七章出版数智化、第八章合作动态，只允许采用本周采编窗口内发布/更新的消息。早于本周的旧政策、旧官宣、旧预备会、旧活动报道不得包装成“本周动态”。
5c. **会务清单只作日历背景**：BIBF/书博会等会展如果只有历史官宣链接，只能写入第六章会务计划或第九/十章行动建议；只有检索到本周发布的新稿，才可写入摘要、行业动态、平台动态或企业动态。
6. **第六章「教辅行业会务计划（近60天）」至少 2 条**；若下方会务清单非空，清单内每条会展均须有对应条目（已结束写复盘，未开幕写筹备/倒计时），并标明“会务日历，不作为本周新闻”。
7. 第一章写 **3–5 条** 摘要，关键数字、日期、地名用 **加粗**；每条末尾附「 · 来源平台：×× · [原文](url)」。若书展/会务没有本周新稿，第一章不得写书展/会务摘要。
8. 各章「来源」行须含 **来源平台** + Markdown 链接；每周覆盖多来源渠道，与上周区分，避免照抄。

${searchHintsBlock || ''}${eventsBlock || ''}## 本周信息
- 周次：${weekCode}
- 更新日期：${dateCode}（周一）

## 本周 RSS 摘录（标题+链接，请据此检索要点，勿虚构链接）
${digest || '（暂无 RSS 条目：不得用旧官宣硬凑本周新闻；请写本周阶段性变化、政策执行窗口、运营动作，并把旧资料放在第五/第六章背景中）'}

## 上周摘要节选（供延续跟踪，勿重复堆砌）
${prevExcerpt || '（无上周文件）'}

## 范例周报（仅学结构与文风，勿照抄事实）
${example || '（无范例文件）'}

请直接输出 Markdown，不要用代码块包裹。`;
}

async function callAnthropic(prompt, cfg) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || cfg.anthropicModel,
      max_tokens: cfg.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Anthropic API returned empty content');
  return text.trim();
}

async function callOpenAI(prompt, cfg) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || cfg.openaiModel,
      max_tokens: cfg.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI API returned empty content');
  return text.trim();
}

async function generateBody(prompt, cfg) {
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(prompt, cfg);
  if (process.env.OPENAI_API_KEY) return callOpenAI(prompt, cfg);
  return null;
}

function normalizeLlmMarkdown(text) {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '');
  }
  if (!t.startsWith('## 一、')) {
    const i = t.indexOf('## 一、');
    if (i >= 0) t = t.slice(i);
  }
  return t.trimEnd() + '\n';
}

const cfg = loadFillConfig();
const { date: today, weekCode, dateCode } = currentBeijingWeekContext();
const weeklyPath = path.join(ROOT, 'weekly', `${weekCode}-周报.md`);

if (!fs.existsSync(weeklyPath)) {
  throw new Error(`Missing ${weeklyPath} — run create-weekly-report first`);
}

let md = fs.readFileSync(weeklyPath, 'utf8');
const force = ['1', 'true', 'yes'].includes(String(process.env.FORCE_WEEKLY_FILL || '').toLowerCase());
const skeleton = isSkeletonSections(md);

console.log(
  `[fill] ${weekCode} | skeleton=${skeleton} | force=${force} | ` +
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? 'set' : 'missing'} | ` +
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? 'set' : 'missing'} | ` +
    `OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL ? 'set' : 'missing'} | ` +
    `OPENAI_MODEL=${process.env.OPENAI_MODEL || '(default)'}`,
);

if (!force && !skeleton) {
  console.log('[fill] Sections 1–10 already have content; skip (set FORCE_WEEKLY_FILL=1 to overwrite).');
  process.exit(0);
}

const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
if (!hasKey) {
  const msg =
    '[fill] No ANTHROPIC_API_KEY or OPENAI_API_KEY — cannot write sections 1–10. ' +
    'Add Secrets in GitHub → Settings → Secrets and variables → Actions ' +
    '(see config/weekly-fill.json: DeepSeek 可用 OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL).';
  if (process.env.CI === 'true') {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg + ' Local run: skipping (exit 0).');
  process.exit(0);
}

const digest = extractDigestBullets(md);
const example = readExampleBody(cfg);
const prevPath = findPreviousWeeklyPath(weekCode);
let prevExcerpt = '';
if (prevPath) {
  const prev = fs.readFileSync(prevPath, 'utf8');
  const s = extractSectionsOneToTen(prev);
  prevExcerpt = s.slice(0, 2500);
}

const prompt = buildPrompt({
  weekCode,
  dateCode,
  digest,
  example,
  prevExcerpt,
  searchHintsBlock: formatSearchHintsForPrompt(loadSearchHints(cfg)),
  eventsBlock: formatEventsForPrompt(loadEventsCalendar(cfg), today),
});
console.log(`[fill] Calling LLM for ${weekCode} (digest lines: ${digest.split('\n').filter(Boolean).length})...`);

const generated = normalizeLlmMarkdown(await generateBody(prompt, cfg));
const header = extractHeader(md);
const tail = extractSectionElevenOnward(md);
const out = tail ? `${header}${generated}\n${tail}` : `${header}${generated}`;
fs.writeFileSync(weeklyPath, out, 'utf8');
console.log(`[fill] Wrote sections 1–10 to ${weeklyPath}`);
