/**
 * 附录「自动摘录」：仅有真实 RSS 链接时保留整章，否则从 Markdown 移除。
 */

export function extractDigestBody(md) {
  const m = md.match(/<!-- AUTO_DIGEST_START -->([\s\S]*?)<!-- AUTO_DIGEST_END -->/);
  return m ? m[1] : '';
}

/** AUTO_DIGEST 区域内是否含至少一条 http(s) 原文链接 */
export function digestHasRealLinks(md) {
  const body = extractDigestBody(md);
  if (!body.trim()) return false;
  return /\[([^\]]+)\]\(https?:\/\/[^)]+\)/i.test(body);
}

export function removeDigestSection(md) {
  if (/## 附录：自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/.test(md)) {
    return md.replace(/\n*## 附录：自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->\s*/m, '\n').trimEnd() + '\n';
  }
  if (/## 十一、自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/.test(md)) {
    return md.replace(/\n*## 十一、自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->\s*/m, '\n').trimEnd() + '\n';
  }
  if (/## 附录：自动摘录/.test(md)) {
    return md.replace(/\n*## 附录：自动摘录[\s\S]*$/m, '\n').trimEnd() + '\n';
  }
  if (/## 十一、自动摘录/.test(md)) {
    return md.replace(/\n*## 十一、自动摘录[\s\S]*$/m, '\n').trimEnd() + '\n';
  }
  return md;
}

export function stripEmptyDigestSection(md) {
  if (!/## (?:附录：|十一、)自动摘录/.test(md)) return md;
  if (digestHasRealLinks(md)) return md;
  return removeDigestSection(md);
}

export function buildDigestMarkdown(lines) {
  if (!lines.length) return '';
  const body = lines.map((l) => `- ${l}`).join('\n');
  return [
    '## 附录：自动摘录（政策与要闻，CI 每周更新）',
    '> 以下为 `config/weekly-rss.json` 拉取的 **标题 + 日期 + 原文链接** 列表（不转载正文）；解读请归入上方七个业务板块。微信公众号 / 服务号 / 小红书等需自行提供可访问的 RSS（如 RSSHub、wechat2rss 等生成地址）并填入配置。',
    '',
    '<!-- AUTO_DIGEST_START -->',
    body,
    '<!-- AUTO_DIGEST_END -->',
    '',
  ].join('\n');
}

export function applyDigestSection(md, lines) {
  const block = buildDigestMarkdown(lines);
  if (!block) return removeDigestSection(md);
  if (/## 附录：自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/.test(md)) {
    return md.replace(/## 附录：自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/m, block.trim());
  }
  if (/## 十一、自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/.test(md)) {
    return md.replace(/## 十一、自动摘录[\s\S]*?<!-- AUTO_DIGEST_END -->/m, block.trim());
  }
  return `${md.trimEnd()}\n\n${block}\n`;
}
