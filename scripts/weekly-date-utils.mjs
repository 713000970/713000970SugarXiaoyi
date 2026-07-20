export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function currentBeijingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}

/** ISO week using calendar date components; callers pass the Beijing calendar date. */
export function getIsoWeekInfo(date) {
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

export function formatYmd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfIsoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function weekContextForDate(weekDate, publishDate) {
  const weekStartDate = startOfIsoWeek(weekDate);
  const weekEndDate = addDays(weekStartDate, 6);
  const { year, week } = getIsoWeekInfo(weekStartDate);
  const weekCode = `${year}-W${pad2(week)}`;
  return {
    date: publishDate,
    targetDate: weekStartDate,
    publishDate,
    year,
    week,
    weekCode,
    weekStartDate,
    weekEndDate,
    weekStartCode: formatYmd(weekStartDate),
    weekEndCode: formatYmd(weekEndDate),
    dateCode: formatYmd(publishDate),
  };
}

export function currentBeijingWeekContext(now = new Date()) {
  const date = currentBeijingDate(now);
  return weekContextForDate(date, date);
}

export function previousBeijingWeekContext(now = new Date()) {
  const publishDate = currentBeijingDate(now);
  const currentWeekStart = startOfIsoWeek(publishDate);
  const previousWeekStart = addDays(currentWeekStart, -7);
  return weekContextForDate(previousWeekStart, publishDate);
}

export function weeklyTargetContext(now = new Date()) {
  const mode = String(process.env.WEEKLY_TARGET || 'previous').trim().toLowerCase();
  if (mode === 'current' || mode === 'this') return currentBeijingWeekContext(now);
  return previousBeijingWeekContext(now);
}
