/**
 * 与根目录 generate-html.mjs 相同逻辑；ROOT 为上一级目录（项目根）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function convertLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    let h = href;
    if (h.endsWith('.md')) {
      h = h.slice(0, -3) + '.html';
    }
    if (h.startsWith('weekly/')) {
      h = 'weekly-html/' + h.slice('weekly/'.length);
    }
    return `<a href="${h}">${label}</a>`;
  });
}

function convertInlineMarkdown(text) {
  let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = convertLinks(safe);
  return safe;
}

function convertMarkdownToHtml(markdownText) {
  const lines = markdownText.split(/\r?\n/);
  const output = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      output.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      output.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const trim = line.trim();

    if (!trim) {
      closeLists();
      continue;
    }

    if (trim === '---') {
      closeLists();
      output.push('<hr />');
      continue;
    }

    if (trim.startsWith('>')) {
      closeLists();
      const quote = convertInlineMarkdown(trim.slice(1).trim());
      output.push(`<blockquote>${quote}</blockquote>`);
      continue;
    }

    const hm = trim.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      closeLists();
      const level = hm[1].length;
      const content = convertInlineMarkdown(hm[2]);
      output.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    const olm = trim.match(/^\d+\.\s+(.+)$/);
    if (olm) {
      if (inUl) {
        output.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        output.push('<ol>');
        inOl = true;
      }
      output.push(`<li>${convertInlineMarkdown(olm[1])}</li>`);
      continue;
    }

    const ulm = trim.match(/^-\s+(.+)$/);
    if (ulm) {
      if (inOl) {
        output.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        output.push('<ul>');
        inUl = true;
      }
      output.push(`<li>${convertInlineMarkdown(ulm[1])}</li>`);
      continue;
    }

    closeLists();
    output.push(`<p>${convertInlineMarkdown(trim)}</p>`);
  }

  closeLists();
  return output.join('\n');
}

function writeHtmlPage(title, bodyHtml, outputPath) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; margin: 0; background: #f6f8fb; color: #1f2a37; }
    .container { max-width: 980px; margin: 24px auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
    h1, h2, h3, h4 { color: #0f172a; margin-top: 1.1em; }
    h1 { margin-top: 0; }
    p, li, blockquote { line-height: 1.75; }
    ul, ol { padding-left: 24px; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote { border-left: 4px solid #93c5fd; margin: 12px 0; padding: 8px 12px; background: #eff6ff; color: #1e3a8a; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; font-family: Consolas, monospace; }
    hr { border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  </style>
</head>
<body>
  <main class="container">
${bodyHtml}
  </main>
</body>
</html>`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
}

function getWeeklySummary(markdownText) {
  const lines = markdownText.split(/\r?\n/);
  for (const line of lines) {
    const trim = line.trim();
    if (!trim) continue;
    if (trim.startsWith('#')) continue;
    if (trim.startsWith('更新时间')) continue;
    if (trim.startsWith('##')) continue;
    if (trim.startsWith('-')) return trim.replace(/^-\s*/, '').trim();
    return trim;
  }
  return '本周暂无摘要，请点击查看详情。';
}

function getWeeklyTags(markdownText) {
  const content = markdownText.toLowerCase();
  const tagSet = new Set();
  if (content.includes('政策') || content.includes('教育部') || content.includes('双减')) tagSet.add('policy');
  if (content.includes('展会') || content.includes('论坛') || content.includes('订货会')) tagSet.add('expo');
  if (content.includes('平台') || content.includes('ai') || content.includes('题库')) tagSet.add('platform');
  if (
    content.includes('k12') ||
    content.includes('小学') ||
    content.includes('初中') ||
    content.includes('高中')
  ) {
    tagSet.add('k12');
  }
  if (tagSet.size === 0) tagSet.add('k12');
  return [...tagSet].join(' ');
}

function writeCenterDashboard(weeklyItems, outputPath) {
  const cardsHtml = weeklyItems
    .map((item) => {
      const labels = [];
      if (item.tags.includes('policy')) labels.push('<span class="tag">政策</span>');
      if (item.tags.includes('expo')) labels.push('<span class="tag">展会</span>');
      if (item.tags.includes('platform')) labels.push('<span class="tag">平台</span>');
      if (item.tags.includes('k12')) labels.push('<span class="tag">K12</span>');
      return `<article class="card" data-tags="${item.tags}">
  <div class="card-head">
    <h3>${item.title}</h3>
    <a href="${item.href}" target="_self">查看详情</a>
  </div>
  <p>${item.summary}</p>
  <div class="tags">${labels.join('')}</div>
</article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>教辅行业与K12动态周报中心</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; margin: 0; background: #f4f7fb; color: #0f172a; }
    .container { max-width: 1080px; margin: 24px auto; padding: 0 16px 24px; }
    .hero { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border-radius: 14px; padding: 20px; box-shadow: 0 10px 24px rgba(37,99,235,0.25); }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; opacity: 0.95; }
    .toolbar { margin: 16px 0; display: flex; gap: 8px; flex-wrap: wrap; }
    .chip { border: 1px solid #cbd5e1; background: #fff; color: #1e293b; border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
    .chip.active { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; box-shadow: 0 2px 10px rgba(15,23,42,0.04); }
    .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .card h3 { margin: 0; font-size: 18px; }
    .card p { color: #334155; line-height: 1.7; min-height: 44px; }
    .card a { color: #2563eb; text-decoration: none; font-size: 14px; }
    .card a:hover { text-decoration: underline; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: #eff6ff; color: #1e3a8a; border: 1px solid #bfdbfe; border-radius: 999px; font-size: 12px; padding: 3px 10px; }
    .footer { margin-top: 16px; color: #475569; font-size: 13px; }
  </style>
</head>
<body>
  <main class="container">
    <section class="hero">
      <h1>教辅行业与K12动态周报中心</h1>
      <p>每周一 10:00 自动更新，支持按政策、展会、平台、K12 分类浏览。</p>
    </section>

    <section class="toolbar">
      <button class="chip active" data-filter="all">全部</button>
      <button class="chip" data-filter="policy">政策</button>
      <button class="chip" data-filter="expo">展会</button>
      <button class="chip" data-filter="platform">平台</button>
      <button class="chip" data-filter="k12">K12</button>
    </section>

    <section class="grid" id="weeklyGrid">
${cardsHtml}
    </section>

    <p class="footer">入口固定在本页；每周详情保存在 weekly-html 目录。</p>
  </main>

  <script>
    const chips = Array.from(document.querySelectorAll('.chip'));
    const cards = Array.from(document.querySelectorAll('.card'));
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.getAttribute('data-filter');
        cards.forEach(card => {
          const tags = card.getAttribute('data-tags') || '';
          card.style.display = (filter === 'all' || tags.includes(filter)) ? '' : 'none';
        });
      });
    });
  </script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, 'utf8');
}

/** 周报 md：读取 weekly/；若无则读取根目录 YYYY-Www-周报.md */
function listWeeklyMarkdownPaths(rootDir) {
  const paths = [];
  const seen = new Set();
  const weeklyDir = path.join(rootDir, 'weekly');
  if (fs.existsSync(weeklyDir)) {
    for (const name of fs.readdirSync(weeklyDir)) {
      if (!name.endsWith('.md')) continue;
      const full = path.join(weeklyDir, name);
      try {
        if (fs.statSync(full).isFile()) {
          paths.push(full);
          seen.add(name);
        }
      } catch {
        /* skip */
      }
    }
  }
  try {
    for (const name of fs.readdirSync(rootDir)) {
      if (!name.endsWith('.md')) continue;
      if (name === '周报中心.md' || name === '周报模板.md') continue;
      if (!/^\d{4}-W\d{2}-周报\.md$/.test(name)) continue;
      if (seen.has(name)) continue;
      const full = path.join(rootDir, name);
      if (fs.statSync(full).isFile()) paths.push(full);
    }
  } catch {
    /* skip */
  }
  paths.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return paths;
}

function main() {
  const centerMdPath = path.join(ROOT, '周报中心.md');
  const weeklyMdDir = path.join(ROOT, 'weekly');
  const weeklyHtmlDir = path.join(ROOT, 'weekly-html');
  const centerHtmlPath = path.join(ROOT, '周报中心.html');

  if (!fs.existsSync(centerMdPath)) {
    throw new Error(`Missing file: ${centerMdPath}`);
  }
  if (!fs.existsSync(weeklyMdDir)) {
    fs.mkdirSync(weeklyMdDir, { recursive: true });
  }
  if (!fs.existsSync(weeklyHtmlDir)) {
    fs.mkdirSync(weeklyHtmlDir, { recursive: true });
  }

  const weeklyPaths = listWeeklyMarkdownPaths(ROOT);

  const weeklyItems = [];

  for (const full of weeklyPaths) {
    const name = path.basename(full);
    const md = fs.readFileSync(full, 'utf8');
    const body = convertMarkdownToHtml(md);
    const base = path.basename(name, '.md');
    const htmlName = `${base}.html`;
    const outPath = path.join(weeklyHtmlDir, htmlName);
    writeHtmlPage(base, body, outPath);
    console.log(`Generated: ${outPath}`);

    weeklyItems.push({
      title: base,
      summary: convertInlineMarkdown(getWeeklySummary(md)),
      tags: getWeeklyTags(md),
      href: `weekly-html/${htmlName}`,
    });
  }

  weeklyItems.sort((a, b) => (a.title < b.title ? 1 : a.title > b.title ? -1 : 0));
  writeCenterDashboard(weeklyItems, centerHtmlPath);
  console.log(`Generated: ${centerHtmlPath}`);

  const indexPath = path.join(ROOT, 'index.html');
  fs.copyFileSync(centerHtmlPath, indexPath);
  console.log(`Generated: ${indexPath}`);
}

main();
