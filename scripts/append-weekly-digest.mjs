/**
 * 按 config/weekly-rss.json 拉取 RSS 标题与链接，写入当周 weekly/*.md 的「附录：自动摘录」（AUTO_DIGEST 标记之间），并执行 build。
 * 供 GitHub Actions 与本机 `npm run weekly:digest` 使用。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { applyDigestSection } from './weekly-digest-utils.mjs';
import { currentBeijingWeekContext, pad2 } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function stripCDATA(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function parseRssItems(xml, max) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < max) {
    const block = m[1];
    let title = extractTag(block, 'title');
    const link = extractTag(block, 'link').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1').trim();
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || '';
    title = stripCDATA(title);
    if (title && link && link.startsWith('http')) {
      items.push({ title, link, pubDate: stripCDATA(pubDate) });
    }
  }
  return items;
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeHtmlDate(raw) {
  const text = String(raw || '');
  const compactMoe = text.match(/\/(20\d{2})(\d{2})\/t\1\2(\d{2})_/);
  if (compactMoe) return `${compactMoe[1]}-${compactMoe[2]}-${compactMoe[3]}`;
  const paperM = text.match(/\/(20\d{2})-(\d{2})\/(\d{2})\//);
  if (paperM) return `${paperM[1]}-${paperM[2]}-${paperM[3]}`;
  const compact = text.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const m = text.match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
}

function ymdParts(date) {
  return {
    yyyy: String(date.getFullYear()),
    yy: String(date.getFullYear()).slice(-2),
    mm: pad2(date.getMonth() + 1),
    m: String(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    d: String(date.getDate()),
  };
}

function formatTemplateUrl(template, date) {
  const parts = ymdParts(date);
  return String(template || '').replace(/\{(yyyy|yy|mm|m|dd|d)\}/g, (_, key) => parts[key] || '');
}

function parseHtmlItems(html, pageUrl, max) {
  const cleaned = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const items = [];
  const re = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(cleaned)) && items.length < max) {
    const href = decodeHtmlEntities(m[2]).trim();
    if (!href || /^javascript:|^mailto:|^#/.test(href)) continue;
    let link;
    try {
      link = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    const title = stripCDATA(decodeHtmlEntities(m[3])).replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) continue;
    if (/^(上一版|下一版|返回首页|广告刊例|上一期|下一期|首页|确定|登录|English)$/i.test(title)) continue;
    if (/^(政策解读|通知公告|政策文件|信息公开|要闻信息|业务动态|地方工作|结果公示|新闻中心|新品发布|产品与服务|服务与支持|关于我们)$/.test(title)) continue;
    if (/^第\d{2}版\s*[:：]/.test(title)) continue;
    const context = cleaned.slice(Math.max(0, m.index - 140), Math.min(cleaned.length, re.lastIndex + 220));
    const pubDate = normalizeHtmlDate(link) || normalizeHtmlDate(context);
    if (!pubDate) continue;
    items.push({ title, link, pubDate });
  }
  return items;
}

async function fetchText(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; K12WeeklyDigest/1.0; +https://github.com/)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
    const contentType = res.headers.get('content-type') || '';
    const charset =
      (contentType.match(/charset=([\w-]+)/i)?.[1] || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8')
        .toLowerCase()
        .replace(/^gb2312$/, 'gbk');
    try {
      return new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  } finally {
    clearTimeout(t);
  }
}

function loadConfig() {
  const p = path.join(ROOT, 'config', 'weekly-rss.json');
  if (!fs.existsSync(p)) {
    return {
      feeds: [],
      maxItemsPerFeed: 8,
      maxItemsTotal: 18,
      titleKeywords: [],
      maxAgeDays: 120,
      parseRssMax: 120,
    };
  }
  const raw = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(raw);
  return {
    feeds: expandFeedList(j),
    htmlPages: expandHtmlPageList(j),
    maxItemsPerFeed: Number(j.maxItemsPerFeed) || 8,
    maxItemsTotal: Number(j.maxItemsTotal) || 18,
    titleKeywords: Array.isArray(j.titleKeywords) ? j.titleKeywords : [],
    maxAgeDays: Number.isFinite(Number(j.maxAgeDays)) ? Number(j.maxAgeDays) : 21,
    parseRssMax: Number(j.parseRssMax) || 120,
  };
}

function expandHtmlPageList(j) {
  if (!Array.isArray(j.htmlPages)) return [];
  const pages = [];
  const seen = new Set();
  const addPage = (name, url) => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    pages.push({ name: name || cleanUrl, url: cleanUrl });
  };

  for (const p of j.htmlPages) {
    if (p?.enabled === false) continue;
    const template = String(p?.urlTemplate || p?.template || '').trim();
    if (template) {
      const days = Math.max(1, Number(p.days || p.lookbackDays || 7));
      const today = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        addPage(`${p.name || p.title || '滚动页面'}-${formatDateShort(d)}`, formatTemplateUrl(template, d));
      }
      continue;
    }
    addPage(p.name || p.title || p.url, p.url);
  }
  return pages;
}

function buildRssHubUrl(base, routePath) {
  if (!base || !routePath) return '';
  const pathPart = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${base}${pathPart}`;
}

function buildWechatRoute(f) {
  const pathValue = String(f.path || f.route || '').trim();
  if (pathValue) return pathValue;

  const biz = String(f.biz || '').trim();
  const hid = String(f.hid || '').trim();
  const cid = String(f.cid || '').trim();
  if (!biz || !hid) return '';
  return `/wechat/mp/homepage/${biz}/${hid}${cid ? `/${cid}` : ''}`;
}

function appendFeed(target, f, base = '') {
  if (f?.enabled === false) return true;
  const url = String(f?.url || '').trim() || buildRssHubUrl(base, buildWechatRoute(f));
  if (!url) return false;
  target.push({
    name: f.name || f.title || url,
    url,
  });
  return true;
}

/** 直连 feeds + 可选 rssHubBase 一键拼接 rsshubRoutes / wechatFeeds */
function expandFeedList(j) {
  const feeds = [];
  const base = String(j.rssHubBase || '').trim().replace(/\/$/, '');

  if (Array.isArray(j.feeds)) {
    for (const f of j.feeds) appendFeed(feeds, f);
  }

  const routes = Array.isArray(j.rsshubRoutes) ? j.rsshubRoutes : [];

  if (base) {
    for (const r of routes) {
      const routePath = (r.path || r.route || '').trim();
      if (!routePath) continue;
      feeds.push({
        name: r.name || routePath,
        url: buildRssHubUrl(base, routePath),
      });
    }
  } else if (routes.length) {
    console.warn(
      '[digest] rssHubBase 为空：已跳过教育部/政府网 RSSHub 源。不会弄可先保持为空；有地址后只填 rssHubBase 一行即可。',
    );
  }

  const wechatFeeds = Array.isArray(j.wechatFeeds) ? j.wechatFeeds : [];
  let skippedWechatFeeds = 0;
  for (const f of wechatFeeds) {
    if (!appendFeed(feeds, f, base)) skippedWechatFeeds++;
  }
  if (skippedWechatFeeds) {
    console.warn(
      `[digest] ${skippedWechatFeeds} wechatFeeds skipped: add url, or set rssHubBase with biz + hid.`,
    );
  }

  return feeds;
}

function itemTimestamp(pubDate) {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? t : 0;
}

function ageDays(ts) {
  if (!ts) return Infinity;
  return (Date.now() - ts) / 86400000;
}

function isFutureTimestamp(ts) {
  if (!ts) return false;
  return ts > Date.now() + 86400000;
}

function matchesKeyword(title, keywords) {
  if (!keywords.length) return true;
  return keywords.some((k) => k && title.includes(k));
}

function isRelevantDigestTitle(title) {
  const text = String(title || '');
  if (/^(政策解读|通知公告|政策文件|信息公开|要闻信息|业务动态|地方工作|结果公示|新闻中心|新品发布)$/.test(text)) return false;
  const strong =
    /中小学|义务教育|基础教育|普通高中|高中|小学|初中|校外培训|双减|教辅|教材|教材教辅|教辅材料评议|评议推荐|评议公告|遴选推荐|遴选结果|推荐目录|公告目录|一科一辅|进校园|凡进必审|送评|征订|同步练习|考试辅导|暑假作业|学习辅助|招生|高考|中考|智慧教育|数字教育|国家智慧教育平台|青少年|未成年人|课后服务|课堂|课程|暑期|校园餐|校服|教师培养|国门学校|出版|图书|书博|BIBF|数字教材|AI教育|题库|学习机|学练机|智能教辅|教育出版|出版传媒|出版集团|出版社|人教社|人民教育出版社|新华文轩|北师大出版|东方激光|新华书店|发行集团|政策解读|一图读懂|答记者问|问答|图解/.test(
      text,
    );
  if (!strong) return false;

  const higherOnly = /高校|大学|研究生|职业教育|高职|成人教育|就业|党委书记|校长/.test(text);
  const explicitK12 = /中小学|义务教育|基础教育|普通高中|高中|小学|初中|校外培训|双减|教辅|教材|高考|中考|国门学校|国家智慧教育平台|青少年|未成年人|课后服务|校园餐|校服|学生读本|统编教材/.test(
    text,
  );
  return !higherOnly || explicitK12;
}

function formatDateShort(pubDate) {
  const ts = itemTimestamp(pubDate);
  if (!ts) return '日期不详';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sanitizeTitle(t) {
  return String(t)
    .replace(/\*\*/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*20\d{2}-\d{2}-\d{2}\s*东方激光教育文化有限公司\s*$/g, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim()
    .slice(0, 220);
}

const { weekCode } = currentBeijingWeekContext();
const weeklyPath = path.join(ROOT, 'weekly', `${weekCode}-周报.md`);

if (!fs.existsSync(weeklyPath)) {
  throw new Error(`Missing weekly file: ${weeklyPath}（请先运行 create-weekly-report）`);
}

const cfg = loadConfig();
const pool = [];
const seen = new Set();

for (const f of cfg.feeds) {
  const url = f?.url?.trim();
  const name = f?.name || url;
  if (!url || !/^https?:\/\//i.test(url)) continue;
  try {
    const xml = await fetchText(url, 25000);
    const rawItems = parseRssItems(xml, cfg.parseRssMax);
    let items = rawItems;
    if (cfg.titleKeywords.length) items = rawItems.filter((it) => matchesKeyword(it.title, cfg.titleKeywords));
    items = items.filter((it) => isRelevantDigestTitle(it.title));
    let addedForFeed = 0;
    for (const it of items) {
      if (addedForFeed >= cfg.maxItemsPerFeed) break;
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      const ts = itemTimestamp(it.pubDate);
      if (cfg.maxAgeDays > 0) {
        if (!ts) continue;
        if (isFutureTimestamp(ts)) continue;
        if (ageDays(ts) > cfg.maxAgeDays) continue;
        const y = new Date(ts).getFullYear();
        if (y < new Date().getFullYear() - 1) continue;
      }
      pool.push({ name, title: it.title, link: it.link, pubDate: it.pubDate, ts });
      addedForFeed++;
    }
  } catch (e) {
    console.warn(`[digest] skip feed ${name}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

for (const p of cfg.htmlPages) {
  const url = p?.url?.trim();
  const name = p?.name || url;
  if (!url || !/^https?:\/\//i.test(url)) continue;
  try {
    const html = await fetchText(url, 25000);
    const rawItems = parseHtmlItems(html, url, cfg.parseRssMax);
    let items = rawItems;
    if (cfg.titleKeywords.length) items = rawItems.filter((it) => matchesKeyword(it.title, cfg.titleKeywords));
    items = items.filter((it) => isRelevantDigestTitle(it.title));
    let addedForPage = 0;
    for (const it of items) {
      if (addedForPage >= cfg.maxItemsPerFeed) break;
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      const ts = itemTimestamp(it.pubDate);
      if (cfg.maxAgeDays > 0) {
        if (!ts) continue;
        if (isFutureTimestamp(ts)) continue;
        if (ageDays(ts) > cfg.maxAgeDays) continue;
        const y = new Date(ts).getFullYear();
        if (y < new Date().getFullYear() - 1) continue;
      }
      pool.push({ name, title: it.title, link: it.link, pubDate: it.pubDate, ts });
      addedForPage++;
    }
  } catch (e) {
    console.warn(`[digest] skip html page ${name}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

pool.sort((a, b) => (b.ts || 0) - (a.ts || 0));
const collected = [];
for (const it of pool) {
  if (collected.length >= cfg.maxItemsTotal) break;
  const title = sanitizeTitle(it.title);
  if (!title) continue;
  const d = formatDateShort(it.pubDate);
  collected.push(`**${title}** · ${d} · [原文](${it.link})（${it.name}）`);
}

let md = fs.readFileSync(weeklyPath, 'utf8');
md = applyDigestSection(md, collected);
fs.writeFileSync(weeklyPath, md, 'utf8');
console.log(
  collected.length
    ? `Updated digest in ${weeklyPath} (${collected.length} bullets)`
    : `No RSS items — removed digest appendix from ${weeklyPath}`,
);

const skipBuild =
  process.env.SKIP_BUILD === '1' ||
  process.env.SKIP_BUILD === 'true' ||
  process.env.SKIP_BUILD === 'yes';
if (skipBuild) {
  console.log('SKIP_BUILD set; skipping build (run fill + build in a later step).');
} else {
  const buildScript = path.join(ROOT, 'build.mjs');
  const r = spawnSync(process.execPath, [buildScript], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`build failed with exit code ${r.status === null ? 'null' : r.status}`);
  }
}
