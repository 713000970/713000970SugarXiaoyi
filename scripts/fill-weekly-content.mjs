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
    exampleWeeklyPath: 'weekly/2026-W21-周报.md',
    anthropicModel: 'claude-sonnet-4-20250514',
    openaiModel: 'gpt-4o',
    maxTokens: 8192,
  };
  if (!fs.existsSync(p)) return defaults;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { ...defaults, ...j };
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
  const substantive = bullets.filter((t) => t.length > 12 && !/^事件：?$/.test(t) && t !== '-');
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

function buildPrompt({ weekCode, dateCode, digest, example, prevExcerpt }) {
  return `你是一位教辅行业与 K12 教育政策分析师。请撰写 **${weekCode}** 周报的 Markdown 正文（第一至第十章 + 运营六、七章，不要写第十一章）。

## 输出要求
1. 语言：简体中文。
2. 只输出从 \`## 一、本周核心摘要（3-5条）\` 到 \`## 七、风险与机会清单\` 的全部内容，不要输出一级标题和「更新时间」行。
3. **章节顺序固定**（先政策/行业，后运营侧）：一～五 → 八（会务）→ 九、十（出版）→ 六（运营行动建议）→ 七（风险与机会）；章节标题序号保持「六」「七」「八」等不变，仅调整出现顺序。
4. 结构、层级、字段名必须与「范例周报」一致（事件/来源/要点/影响判断等子项保留）。
5. 事实须基于下方「本周 RSS 摘录」；可结合常识做行业解读，但 **不得编造** 不存在的文件号、日期、机构名称；无可靠来源时写「本周公开稿未见」或「延续上周跟踪」。
6. 第一章写 **3–5 条** 有信息量的摘要，关键数字、日期、地名用 **加粗**；**每条摘要末尾**须附「 · [原文](url)」（url 须来自 RSS 摘录或权威官网，勿虚构）。
7. 「来源」行、政策条目的 **原文链接** 字段须使用 Markdown 链接「[原文](url)」或「[文件标题](url)」，确保各章每条新闻/政策均可点击跳转。
8. 语气与篇幅参照范例，每周内容须与 RSS 及上周摘要区分，避免照抄范例。

## 本周信息
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

const prompt = buildPrompt({ weekCode, dateCode, digest, example, prevExcerpt });
console.log(`[fill] Calling LLM for ${weekCode} (digest lines: ${digest.split('\n').filter(Boolean).length})...`);

const generated = normalizeLlmMarkdown(await generateBody(prompt, cfg));
const header = extractHeader(md);
const tail = extractSectionElevenOnward(md);
if (!tail.includes('## 十一、')) {
  throw new Error('Missing section 十一 in weekly file');
}

const out = `${header}${generated}\n${tail}`;
fs.writeFileSync(weeklyPath, out, 'utf8');
console.log(`[fill] Wrote sections 1–10 to ${weeklyPath}`);
