import { DateTime } from 'luxon';
import { fetchCalendar } from '../src/ics-fetcher.js';

const tz = 'Asia/Kolkata';
const windowStart = DateTime.fromISO('2026-04-20', { zone: tz });
const windowEnd = windowStart.plus({ days: 3 });

const cals = [
  { name: 'Netsoft', urlEnv: 'CAL_URL_NETSOFT', style: 'filled' },
  { name: 'SevenSeas', urlEnv: 'CAL_URL_SEVENSEAS', style: 'filled' },
];

for (const cal of cals) {
  console.log(`\n=== ${cal.name} (3-day view) ===`);
  const events = await fetchCalendar(cal, { windowStart, windowEnd, timezone: tz });
  events.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  for (const ev of events) {
    console.log([
      ev.start.toFormat('ccc dd HH:mm'),
      '-',
      ev.end.toFormat('HH:mm'),
      ev.allDay ? '[all-day]' : '',
      `"${ev.title}"`,
    ].filter(Boolean).join(' '));
  }
}
