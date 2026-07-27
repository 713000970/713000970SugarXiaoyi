import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { weeklyTargetContext } from './weekly-date-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function beijingNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
}

const target = weeklyTargetContext();
const markdownPath = path.join(ROOT, 'weekly', `${target.weekCode}-周报.md`);
const htmlPath = path.join(ROOT, 'weekly-html', `${target.weekCode}-周报.html`);
const statusPath = path.join(ROOT, 'weekly-status.json');

if (!fs.existsSync(markdownPath)) {
  throw new Error(`Missing weekly markdown: ${markdownPath}`);
}

const status = {
  weekCode: target.weekCode,
  weekStart: target.weekStartCode,
  weekEnd: target.weekEndCode,
  publishDate: target.dateCode,
  publishedAtBeijing: beijingNowParts(),
  source: process.env.WEEKLY_PUBLISH_SOURCE || 'local',
  markdown: `weekly/${target.weekCode}-周报.md`,
  html: fs.existsSync(htmlPath) ? `weekly-html/${target.weekCode}-周报.html` : null,
};

const force = ['1', 'true', 'yes'].includes(String(process.env.FORCE_WEEKLY_STATUS || '').toLowerCase());
if (!force && fs.existsSync(statusPath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (previous?.weekCode === status.weekCode && previous?.html) {
      console.log(`[status] weekly-status.json already records ${status.weekCode}; keeping existing timestamp.`);
      process.exit(0);
    }
  } catch {
    /* rewrite invalid status file */
  }
}

fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log(`[status] Wrote weekly-status.json for ${target.weekCode}`);
