/**
 * 用 LLM 根据 RSS 摘录，将当周 markdown 写成清晰简报。
 * 需环境变量 ANTHROPIC_API_KEY 或 OPENAI_API_KEY；无密钥时跳过（exit 0）。
 * 保留「附录：自动摘录」节不变。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { currentBeijingWeekContext, pad2 } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUSINESS_HEADING_PATTERN =
  '## (?:一、K12教育政策|二、K12教辅政策|三、出版数智化|四、局社合作|五、科技合作|六、评教辅行业)';

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
    '以下会展只代表近60天会务安排，**仅当本周有新公开稿时才可写入正文**。',
    '**新闻时效硬规则**：若会展只有历史官宣/预备会链接（发布时间不在本周采编窗口），正文不要写这条，也不要写“不作为本周新闻”等占位说明。',
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
  lines.push('若 RSS 未摘录到上述会展，或只有旧链接，不要写入正文。', '');
  return lines.join('\n');
}

function formatSearchHintsForPrompt(hints) {
  if (!hints?.topics?.length) return '';
  const lines = [
    '## 采编方向（六个可用分类，没信息的分类不要输出）',
    '',
    '各「板块」写入对应周报章节，**不得新增或改名章节；没有可核验信息的板块直接省略**：',
    '- **一 K12教育政策**：教育部、省市教育局、考试招生、双减、课后服务、校外培训治理等 K12 政策动态。',
    '- **二 K12教辅政策**：教材教辅目录、评议选用、进校合规、出版监管、广告/收费/AI 配套合规。',
    '- **三 出版数智化**：出版社/教辅公司新品线、数字教材、AI 教辅、题库、资源平台、业务升级。',
    '- **四 局社合作**：教育局/学校/事业单位与出版社/教辅公司的合作、共建、公益服务、区域试点。',
    '- **五 科技合作**：出版社/教辅公司与 AI/题库/平台/硬件/数据服务商合作。',
    '- **六 评教辅行业**：只收新闻评论、行业媒体评论、专家/专栏文章中对教育教辅行业的公开观点；没有评论原文就省略。',
    '',
  ];
  for (const t of hints.topics) {
    const ch = (t.weeklyChapters || t.weeklySections || []).join('、');
    lines.push(`### ${t.label}（参考写入：${ch || '按六板块归类'}）`);
    lines.push(`- 搜索关键词：${(t.keywords || []).join('、')}`);
    lines.push(`- 重点关注：${(t.focus || []).join('、')}`);
    lines.push('');
  }
  const sp = hints.sourcePlatforms || {};
  lines.push('## 信息来源渠道（仅用于检索与核验，不输出“来源平台”字段）');
  lines.push(`- **优先关注**：${(sp.priority || []).join('、')}`);
  lines.push(`- **同时关注**：${(sp.officialAndIndustry || []).join('、')}`);
  if (Array.isArray(sp.wechatAccounts) && sp.wechatAccounts.length) {
    lines.push('- **公众号/服务号采集补充**：');
    for (const account of sp.wechatAccounts) {
      const name = account.name || account.title || '';
      if (!name) continue;
      const type = account.type ? `（${account.type}）` : '';
      const focus = Array.isArray(account.focus) && account.focus.length ? `：${account.focus.join('、')}` : '';
      lines.push(`  - ${name}${type}${focus}`);
    }
    lines.push(
      '- 公众号/服务号内容只能作为公开可核验信源；必须有原文链接，且发布时间/更新时间符合本周采编窗口。',
    );
  }
  if (sp.note) lines.push(`- ${sp.note}`);
  lines.push('');
  lines.push('正文每条只用一个顶层 bullet，格式固定：');
  lines.push('- `- **标题**：一句话说明这条信息为什么重要。[原文](url)`');
  lines.push('- **新闻时效**：正文只收本周采编窗口内发布/更新的新闻或持续有效的官方入口；旧官宣、旧预备会、旧活动报道不要写入，也不要写解释性占位。');
  lines.push('- **禁止编造**社媒帖子、账号名或无法核实的链接；无可靠链接时直接不写。');
  lines.push('');
  return lines.join('\n');
}

function extractDigestBullets(md) {
  const m = md.match(/<!-- AUTO_DIGEST_START -->([\s\S]*?)<!-- AUTO_DIGEST_END -->/);
  if (!m) return '';
  return m[1].trim();
}

function extractBusinessSections(md) {
  const re = new RegExp(`${BUSINESS_HEADING_PATTERN}[\\s\\S]*?(?=## 附录：自动摘录|## 十一、自动摘录|$)`);
  const m = md.match(re);
  return m ? m[0].trim() : '';
}

function extractHeader(md) {
  const re = new RegExp(`^[\\s\\S]*?(?=${BUSINESS_HEADING_PATTERN})`);
  const m = md.match(re);
  return m ? m[0].trimEnd() + '\n\n' : '';
}

function extractDigestAppendixOnward(md) {
  const appendixIdx = md.indexOf('## 附录：自动摘录');
  if (appendixIdx >= 0) return md.slice(appendixIdx).trimEnd() + '\n';
  const legacyIdx = md.indexOf('## 十一、自动摘录');
  return legacyIdx >= 0 ? md.slice(legacyIdx).trimEnd() + '\n' : '';
}

function isSkeletonSections(body) {
  const block = extractBusinessSections(body);
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
  const sample = extractBusinessSections(md);
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
  return `你是一位教辅行业与 K12 教育政策分析师。请撰写 **${weekCode}** 周报的 Markdown 正文（只写有真实信息的业务板块，不要写附录）。

## 输出要求
1. 语言：简体中文。
2. 只输出业务板块，不要输出一级标题、「更新时间」行或附录。
3. **可用章节与顺序固定**：一、K12教育政策 → 二、K12教辅政策 → 三、出版数智化 → 四、局社合作 → 五、科技合作 → 六、评教辅行业。没有可核验信息的章节直接省略，不能写空章节。
4. 每条资讯只允许一个顶层 bullet，格式固定：\`- **标题**：一句话说明这条信息为什么重要。[原文](url)\`。
5. 事实须结合「本周 RSS 摘录」与采编关键词组织内容；不得编造文件号、日期、机构、社媒账号。
6. **本周新闻硬规则**：各板块只允许采用本周采编窗口内发布/更新的消息，或持续有效的官方入口。早于本周的旧官宣、旧预备会、旧活动报道不得写入。
7. **第六板块硬规则**：「六、评教辅行业」只能引用新闻评论、行业媒体评论、专家评论、专栏文章或署名评论文章；不得把官方入口、普通政策、会务预告或平台页面改写成我方行业判断。
8. **没有就不写**：不得输出“本周公开稿未见”“未检索到”“建议继续跟进”“不作为本周新闻”等占位、解释或建议。
9. 正文禁止出现二级 bullet，禁止输出“来源平台、来源、要点、影响判断、可跟进点、发布单位、发布时间、合作方、合作内容、风险、机会、下周动作”等字段。

${searchHintsBlock || ''}${eventsBlock || ''}## 本周信息
- 周次：${weekCode}
- 更新日期：${dateCode}（周一）

## 本周 RSS 摘录（标题+链接，请据此检索要点，勿虚构链接）
${digest || '（暂无 RSS 条目：不得用旧官宣硬凑本周新闻；没有可靠信息的板块直接省略。）'}

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
  console.log('[fill] Six business sections already have content; skip (set FORCE_WEEKLY_FILL=1 to overwrite).');
  process.exit(0);
}

const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
if (!hasKey) {
  const msg =
    '[fill] No ANTHROPIC_API_KEY or OPENAI_API_KEY — cannot write concise business sections. ' +
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
  const s = extractBusinessSections(prev);
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
const tail = extractDigestAppendixOnward(md);
const out = tail ? `${header}${generated}\n${tail}` : `${header}${generated}`;
fs.writeFileSync(weeklyPath, out, 'utf8');
console.log(`[fill] Wrote concise business sections to ${weeklyPath}`);
