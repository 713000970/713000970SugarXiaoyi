/**
 * Legacy helper kept for npm/manual compatibility.
 * The weekly structure uses six optional business sections; this script only checks order.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeWeeklySectionHeadings, sectionNames } from './weekly-sections.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const weeklyDir = path.join(ROOT, 'weekly');

const ORDERED = sectionNames().map((title) => `## ${title}`);

function checkMarkdown(md, filePath) {
  let last = -1;
  let found = 0;
  for (const heading of ORDERED) {
    const idx = md.indexOf(heading);
    if (idx < 0) continue;
    if (idx < last) throw new Error(`${filePath}: section order is invalid at ${heading}`);
    last = idx;
    found++;
  }
  if (!found) throw new Error(`${filePath}: no business sections found`);
}

const files = fs.readdirSync(weeklyDir).filter((f) => f.endsWith('-周报.md'));
for (const f of files) {
  const p = path.join(weeklyDir, f);
  const raw = fs.readFileSync(p, 'utf8');
  const md = normalizeWeeklySectionHeadings(raw);
  if (md !== raw) fs.writeFileSync(p, md, 'utf8');
  if (!md.includes(ORDERED[0])) continue;
  checkMarkdown(md, p);
  console.log(`Checked business section order: ${p}`);
}
