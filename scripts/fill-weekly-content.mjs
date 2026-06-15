/**
 * 用 LLM 根据 RSS 摘录 + 范例周报，将当周 markdown 第一～十章写成「满篇干货」。
 * 需环境变量 ANTHROPIC_API_KEY 或 OPENAI_API_KEY；无密钥时跳过（exit 0）。
 * 保留「十一、自动摘录」节不变。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

function loadFillConfig() {
  const p = path.join(ROOT, 'config', 'weekly-fill.json');
  const defaults = {
    exampleWeeklyPath: 'weekly/2026-W24-周报.md',
    searchHintsPath: 'config/weekly-search-hints.json',
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

function formatSearchHintsForPrompt(hints) {
  if (!hints?.topics?.length) return '';
  const lines = [
    '## 采编方向（章节分类不变，据此丰富内容）',
    '',
    '各「板块」写入对应周报章节，**不得新增或改名章节**：',
    '- **二**：出版社/教辅公司与各地教育部门深度合作',
    '- **三、五**：K12教育政策全国盘点（三写事件与盘点，五写政策文件与教辅政策盘点）',
    '- **四**：服务 K12 的平台动态（信息化/题库/AI 平台，可与科技公司合作互证）',
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
  const bullets = [...block.matchAll(/^- (.+)$/gm)].map((x) => x[1].trim());
  if (!bullets.length) return true;
  const placeholder =
    /^(事件：?|来源：|要点：|影响判断：|高优先级：|中优先级：|低优先级：|风险：|机会：|政策：|公司\/机构：|会务名称：|（可选）|发布单位：|发布时间：|核心条款：|执行影响：|国家层面要点：|省级重点变化|对我方|出版侧|数智化侧|合作方|合作方向|可跟进点|教材教辅|重点省份|教育部门|出版社\/教辅公司：|合作内容与期限：)$/;
  const substantive = bullets.filter((t) => {
    if (!t || t.length <= 2) return false;
    if (placeholder.test(t)) return false;
    if (/\[原文\]\(https:\/\/\.\.\.\)/.test(t)) return false;
    if (/\[标题或文件号\]\(https:\/\/\.\.\.\)/.test(t)) return false;
    if (/^来源：（媒体\/机构 \+ 日期）/.test(t)) return false;
    return true;
  });
  return substantive.length < 2;
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

function buildPrompt({ weekCode, dateCode, digest, example, prevExcerpt, searchHintsBlock }) {
  return `你是一位教辅行业与 K12 教育政策分析师。请撰写 **${weekCode}** 周报的 Markdown 正文（第一至第十章，不要写第十一章）。

## 输出要求
1. 语言：简体中文。
2. 只输出从 \`## 一、本周核心摘要（3-5条）\` 到 \`## 十、风险与机会清单\` 的全部内容，不要输出一级标题和「更新时间」行。
3. **章节顺序与序号固定**（先政策/行业，后运营侧，连续编号一至十）：一（摘要）→ 二（行业）→ 三（K12）→ 四（平台）→ 五（政策）→ 六（会务）→ 七（出版数智化）→ 八（跨行合作）→ 九（运营行动建议）→ 十（风险与机会）。
4. 结构、层级、字段名必须与「范例周报」一致（事件/来源/要点/影响判断等子项保留）；**每条资讯增加「来源平台」字段**（见下方采编方向）。
5. 事实须结合下方「本周 RSS 摘录」与采编关键词方向组织内容；可综合公开信息做行业解读，但 **不得编造** 文件号、日期、机构、社媒账号或帖子；无可靠来源时写「本周公开稿未见」或「延续上周跟踪」。
6. 第一章写 **3–5 条** 有信息量的摘要，关键数字、日期、地名用 **加粗**；每条末尾附「 · 来源平台：×× · [原文](url)」（url 须可核实，勿虚构）。
7. 各章「来源」行须含 **来源平台** + Markdown 链接「[原文](url)」；政策条目 **原文链接** 字段同理。
8. 每周尽量覆盖 **多来源渠道**（官方媒体、行业媒体、社媒教育账号等），同一事件可并列多个来源平台；语气与篇幅参照范例，与上周区分，避免照抄。

${searchHintsBlock || ''}## 本周信息
- 周次：${weekCode}
- 更新日期：${dateCode}（周一）

## 本周 RSS 摘录（标题+链接，请据此检索要点，勿虚构链接）
${digest || '（暂无 RSS 条目：请基于近期 K12/教辅政策与招生季、学前宣传月、书博会筹备等公开背景撰写，并标注不确定性）'}

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
const today = new Date();
const { year, week } = getIsoWeekInfo(today);
const weekCode = `${year}-W${pad2(week)}`;
const dateCode = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
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
});
console.log(`[fill] Calling LLM for ${weekCode} (digest lines: ${digest.split('\n').filter(Boolean).length})...`);

const generated = normalizeLlmMarkdown(await generateBody(prompt, cfg));
const header = extractHeader(md);
const tail = extractSectionElevenOnward(md);
const out = tail ? `${header}${generated}\n${tail}` : `${header}${generated}`;
fs.writeFileSync(weeklyPath, out, 'utf8');
console.log(`[fill] Wrote sections 1–10 to ${weeklyPath}`);
