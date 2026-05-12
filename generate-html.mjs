/**
 * 与根目录 generate-html.mjs 同步；ROOT 为上一级目录（项目根）
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

const SECTION_BODY_MAX = 4000;

/**
 * 按二级标题 ## 拆成板块（不含单独的 # 一级标题行），用于首页分块展示。
 */
function parseWeeklySections(markdownText, maxBodyChars) {
  const limit = maxBodyChars ?? SECTION_BODY_MAX;
  const lines = markdownText.split(/\r?\n/);
  const sections = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (/^##\s/.test(trimmed) && !/^###\s/.test(trimmed)) {
      const heading = trimmed.replace(/^##\s+/, '').replace(/\*\*/g, '').trim();
      i++;
      const bodyLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^##\s/.test(t) && !/^###\s/.test(t)) break;
        bodyLines.push(lines[i]);
        i++;
      }
      let bodyMd = bodyLines.join('\n').trim();
      if (bodyMd.length > limit) {
        bodyMd =
          bodyMd.slice(0, limit) +
          '\n\n> …… 以上为节选，完整内容请点击下方「查看完整周报」。';
      }
      sections.push({
        heading,
        bodyHtml: convertMarkdownToHtml(bodyMd),
      });
      continue;
    }
    i++;
  }
  return sections;
}

function writeCenterDashboard(weeklyItems, outputPath) {
  const payload = weeklyItems.map((w) => ({
    title: w.title,
    href: w.href,
    summary: w.summary,
    tags: w.tags,
    sections: w.sections || [],
  }));
  const payloadJson = JSON.stringify(payload);
  const payloadHtmlSafe = payloadJson.replace(/</g, '\\u003c');

  const cardsHtml = weeklyItems
    .map((item) => {
      const labels = [];
      if (item.tags.includes('policy')) labels.push('<span class="tag">政策</span>');
      if (item.tags.includes('expo')) labels.push('<span class="tag">展会</span>');
      if (item.tags.includes('platform')) labels.push('<span class="tag">平台</span>');
      if (item.tags.includes('k12')) labels.push('<span class="tag">K12</span>');
      return `<article class="card" data-tags="${item.tags}" data-week="${item.title}">
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
    :root {
      --bg0: #faf6f1;
      --bg1: #f3ebe4;
      --paper: #fffdf9;
      --ink: #3d3429;
      --muted: #7a6e63;
      --accent: #b8734a;
      --accent2: #c9986b;
      --leaf: #6d8f6a;
      --line: rgba(61, 52, 41, 0.1);
      --shadow: 0 12px 40px rgba(61, 46, 34, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background: linear-gradient(165deg, var(--bg0) 0%, var(--bg1) 55%, #ebe3d9 100%);
    }
    .container { max-width: 1040px; margin: 0 auto; padding: 28px 18px 40px; }
    .hero {
      background: linear-gradient(125deg, #f0e4d8 0%, #e6d0bc 42%, #d9b896 100%);
      color: #3d2a1f;
      border-radius: 22px;
      padding: 26px 26px 24px;
      box-shadow: var(--shadow);
      border: 1px solid rgba(255,255,255,0.55);
    }
    .hero h1 { margin: 0 0 10px; font-size: 1.65rem; font-weight: 650; letter-spacing: 0.02em; }
    .hero p { margin: 0; color: #5c4a3d; line-height: 1.65; font-size: 0.98rem; }
    .section-label {
      margin: 28px 0 10px;
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .week-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .week-pill {
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 0.92rem;
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
      box-shadow: 0 2px 8px rgba(61,46,34,0.04);
    }
    .week-pill:hover { background: #fff; box-shadow: 0 4px 14px rgba(61,46,34,0.08); }
    .week-pill.active {
      background: linear-gradient(135deg, #c9885c, #b8734a);
      color: #fffdf9;
      border-color: transparent;
      box-shadow: 0 6px 18px rgba(184, 115, 74, 0.35);
    }
    .board-wrap {
      margin-top: 18px;
      background: var(--paper);
      border-radius: 20px;
      padding: 22px 22px 8px;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .board-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 1px dashed var(--line);
    }
    .board-lead { margin: 0; flex: 1; min-width: 200px; color: #52473d; line-height: 1.75; font-size: 0.96rem; }
    .link-full {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      border-radius: 12px;
      background: rgba(109, 143, 106, 0.14);
      color: var(--leaf);
      font-weight: 600;
      text-decoration: none;
      border: 1px solid rgba(109, 143, 106, 0.35);
      white-space: nowrap;
    }
    .link-full:hover { background: rgba(109, 143, 106, 0.22); }
    .board-panels { display: flex; flex-direction: column; gap: 14px; }
    .panel {
      border-radius: 14px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #fffefb 0%, #fff9f3 100%);
      overflow: hidden;
    }
    .panel-title {
      margin: 0;
      padding: 12px 16px;
      font-size: 0.95rem;
      font-weight: 650;
      color: #4a3728;
      background: rgba(232, 200, 168, 0.35);
      border-bottom: 1px solid var(--line);
    }
    .panel-body {
      padding: 12px 16px 16px;
      font-size: 0.9rem;
      color: #52473d;
      max-height: 320px;
      overflow-y: auto;
      line-height: 1.65;
    }
    .panel-body :first-child { margin-top: 0; }
    .panel-body ul, .panel-body ol { margin: 0.4em 0; padding-left: 1.25em; }
    .panel-body li { margin: 0.25em 0; }
    .panel-body a { color: var(--accent); }
    .panel-body blockquote {
      margin: 8px 0;
      padding: 8px 12px;
      border-left: 3px solid var(--accent2);
      background: rgba(232, 200, 168, 0.2);
      color: #5c4a3d;
    }
    .muted { color: var(--muted); font-size: 0.92rem; }
    .toolbar { margin: 8px 0 6px; display: flex; gap: 8px; flex-wrap: wrap; }
    .chip {
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      border-radius: 999px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 0.88rem;
      transition: background 0.2s;
    }
    .chip.active {
      background: rgba(184, 115, 74, 0.18);
      border-color: rgba(184, 115, 74, 0.45);
      color: #6b3d24;
      font-weight: 600;
    }
    .archive-head { margin-top: 32px; margin-bottom: 12px; font-size: 1.05rem; color: #4a3728; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 14px; }
    .card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 4px 16px rgba(61,46,34,0.05);
    }
    .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .card h3 { margin: 0; font-size: 1.02rem; color: #3d2a1f; }
    .card p { color: #5c4a3d; line-height: 1.7; min-height: 40px; font-size: 0.9rem; margin: 10px 0 0; }
    .card a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.88rem; }
    .card a:hover { text-decoration: underline; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .tag {
      background: rgba(109, 143, 106, 0.12);
      color: #3d5a3a;
      border: 1px solid rgba(109, 143, 106, 0.28);
      border-radius: 999px;
      font-size: 11px;
      padding: 3px 10px;
    }
    .footer { margin-top: 28px; color: var(--muted); font-size: 0.86rem; text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
  <main class="container">
    <section class="hero">
      <h1>教辅行业与K12动态周报中心</h1>
      <p>每周一 10:00 自动更新。选择下方<strong>周期</strong>可切换各周；当前周期按<strong>板块</strong>速览正文节选。底部可按标签筛选历史卡片。</p>
    </section>

    <p class="section-label">当前展示 · 按周期</p>
    <div class="week-strip" id="weekStrip" role="tablist" aria-label="选择周报周期"></div>

    <div class="board-wrap">
      <div class="board-meta" id="boardMeta"></div>
      <div class="board-panels" id="boardPanels"></div>
    </div>

    <p class="section-label">历史周期 · 按标签筛选</p>
    <section class="toolbar" aria-label="内容标签">
      <button type="button" class="chip active" data-filter="all">全部</button>
      <button type="button" class="chip" data-filter="policy">政策</button>
      <button type="button" class="chip" data-filter="expo">展会</button>
      <button type="button" class="chip" data-filter="platform">平台</button>
      <button type="button" class="chip" data-filter="k12">K12</button>
    </section>
    <h2 class="archive-head">各周期入口</h2>
    <section class="grid" id="weeklyGrid">
${cardsHtml}
    </section>

    <p class="footer">完整排版与外链请以各周「查看详情」页为准；本页板块为节选便于快速浏览。</p>
  </main>

  <script type="application/json" id="weekly-data">${payloadHtmlSafe}</script>
  <script>
    const WEEKLY_DATA = JSON.parse(document.getElementById('weekly-data').textContent);
    (function () {
      const strip = document.getElementById('weekStrip');
      const meta = document.getElementById('boardMeta');
      const panels = document.getElementById('boardPanels');
      let active = 0;

      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderWeekStrip() {
        if (!WEEKLY_DATA.length) {
          strip.innerHTML = '<span class="muted">暂无周报数据</span>';
          return;
        }
        strip.innerHTML = WEEKLY_DATA.map(function (w, i) {
          return (
            '<button type="button" class="week-pill' + (i === 0 ? ' active' : '') + '" data-i="' +
            i +
            '" role="tab" aria-selected="' +
            (i === 0) +
            '">' +
            esc(w.title) +
            '</button>'
          );
        }).join('');
        strip.querySelectorAll('.week-pill').forEach(function (btn) {
          btn.addEventListener('click', function () {
            active = +btn.getAttribute('data-i');
            strip.querySelectorAll('.week-pill').forEach(function (b, j) {
              b.classList.toggle('active', j === active);
              b.setAttribute('aria-selected', j === active);
            });
            renderBoard();
          });
        });
      }

      function renderBoard() {
        var w = WEEKLY_DATA[active];
        if (!w) {
          meta.innerHTML = '';
          panels.innerHTML = '<p class="muted">无数据</p>';
          return;
        }
        meta.innerHTML =
          '<p class="board-lead">' +
          w.summary +
          '</p><a class="link-full" href="' +
          esc(w.href) +
          '">查看完整周报 →</a>';
        if (!w.sections || !w.sections.length) {
          panels.innerHTML = '<p class="muted">本周期 Markdown 中暂无「##」分节，请直接打开完整周报。</p>';
          return;
        }
        panels.innerHTML = w.sections
          .map(function (s) {
            return (
              '<section class="panel"><h3 class="panel-title">' +
              esc(s.heading) +
              '</h3><div class="panel-body">' +
              s.bodyHtml +
              '</div></section>'
            );
          })
          .join('');
      }

      renderWeekStrip();
      renderBoard();

      var chips = Array.from(document.querySelectorAll('.toolbar .chip'));
      var cards = Array.from(document.querySelectorAll('.card'));
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          chips.forEach(function (c) {
            c.classList.remove('active');
          });
          chip.classList.add('active');
          var filter = chip.getAttribute('data-filter');
          cards.forEach(function (card) {
            var tags = card.getAttribute('data-tags') || '';
            card.style.display = filter === 'all' || tags.includes(filter) ? '' : 'none';
          });
        });
      });
    })();
  </script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, 'utf8');
}

/** 周报 md：读取 weekly/；若无则读取根目录 YYYY-Www-周报.md（兼容 GitHub 网页上传散落根目录） */
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
      sections: parseWeeklySections(md),
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
