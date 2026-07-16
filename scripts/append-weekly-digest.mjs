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
    return await res.text();
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
    maxItemsPerFeed: Number(j.maxItemsPerFeed) || 8,
    maxItemsTotal: Number(j.maxItemsTotal) || 18,
    titleKeywords: Array.isArray(j.titleKeywords) ? j.titleKeywords : [],
    maxAgeDays: Number.isFinite(Number(j.maxAgeDays)) ? Number(j.maxAgeDays) : 21,
    parseRssMax: Number(j.parseRssMax) || 120,
  };
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

function matchesKeyword(title, keywords) {
  if (!keywords.length) return true;
  return keywords.some((k) => k && title.includes(k));
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
    if (cfg.titleKeywords.length) {
      const filtered = rawItems.filter((it) => matchesKeyword(it.title, cfg.titleKeywords));
      if (filtered.length >= 2) items = filtered;
    }
    let addedForFeed = 0;
    for (const it of items) {
      if (addedForFeed >= cfg.maxItemsPerFeed) break;
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      const ts = itemTimestamp(it.pubDate);
      if (cfg.maxAgeDays > 0) {
        if (!ts) continue;
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
