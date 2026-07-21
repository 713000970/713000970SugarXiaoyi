export const WEEKLY_SECTIONS = [
  {
    number: '一',
    title: 'K12教育政策全国盘点',
    legacyTitles: ['K12教育政策'],
  },
  {
    number: '二',
    title: 'K12教辅政策全国盘点',
    legacyTitles: ['K12教辅政策'],
  },
  {
    number: '三',
    title: '出版社/教辅公司出版及数智化最新动态',
    legacyTitles: ['出版数智化'],
  },
  {
    number: '四',
    title: '出版社/教辅公司与各地教育部门深度合作',
    legacyTitles: ['局社合作'],
  },
  {
    number: '五',
    title: '出版社/教辅公司与科技公司深度合作',
    legacyTitles: ['科技合作'],
  },
  {
    number: '六',
    title: '新闻评论/专家专栏评教辅行业',
    legacyTitles: ['评教辅行业'],
  },
  {
    number: '七',
    title: '教育教辅政策解读文章',
    legacyTitles: ['政策解读'],
  },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sectionHeading(section) {
  return `${section.number}、${section.title}`;
}

export function sectionTitle(section) {
  return sectionHeading(section);
}

export function sectionNames() {
  return WEEKLY_SECTIONS.map(sectionHeading);
}

export function sectionNamePattern() {
  const names = WEEKLY_SECTIONS.flatMap((s) => [sectionHeading(s), ...s.legacyTitles.map((t) => `${s.number}、${t}`)]);
  return names.map(escapeRegExp).join('|');
}

export function businessHeadingPatternSource() {
  return `## (?:${sectionNamePattern()})`;
}

export function normalizeSectionTitle(title) {
  const value = String(title || '').trim();
  for (const section of WEEKLY_SECTIONS) {
    if (value === sectionHeading(section)) return sectionHeading(section);
    for (const legacy of section.legacyTitles) {
      if (value === `${section.number}、${legacy}`) return sectionHeading(section);
    }
  }
  return value;
}

export function normalizeWeeklySectionHeadings(md) {
  let out = String(md || '');
  for (const section of WEEKLY_SECTIONS) {
    for (const legacy of section.legacyTitles) {
      const re = new RegExp(`^## ${section.number}、${escapeRegExp(legacy)}\\s*$`, 'gm');
      out = out.replace(re, `## ${sectionHeading(section)}`);
    }
  }
  return out;
}
