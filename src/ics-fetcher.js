import ical from 'node-ical';
import { DateTime } from 'luxon';
import { toIANA } from './windows-tz.js';

export async function fetchCalendar({ name, urlEnv, style }, { windowStart, windowEnd, timezone }) {
  const url = process.env[urlEnv];
  if (!url) {
    console.error(`[fetch] ${name}: env var ${urlEnv} is not set — skipping`);
    return [];
  }

  console.log(`[fetch] ${name}: GET ${url.slice(0, 60)}...`);
  const data = await ical.async.fromURL(url);
  const events = [];

  const winStartJS = windowStart.toJSDate();
  const winEndJS = windowEnd.toJSDate();

  for (const key of Object.keys(data)) {
    const item = data[key];
    if (item.type !== 'VEVENT') continue;

    const tzid = item.start?.tz;

    if (item.rrule) {
      const occurrences = item.rrule.between(winStartJS, winEndJS, true);
      for (const occ of occurrences) {
        const durationMs = item.end.getTime() - item.start.getTime();
        const occKey = occ.toISOString().substring(0, 10);
        const override = item.recurrences?.[occKey];
        if (override) {
          // Overrides carry their own start/end Dates that node-ical converted
          // correctly (as for any direct event). No correction needed.
          events.push(normalize(override, name, style, timezone, override.start?.tz));
        } else if (!isExcluded(item, occ)) {
          // rrule.between returns occurrences in the *system* timezone, encoded as
          // pseudo-UTC (wall-clock digits placed into UTC fields). Reinterpret the
          // UTC digits as wall-clock in the system zone to recover the true instant.
          const correctedStart = systemWallClockToUTC(occ);
          const correctedEnd = new Date(correctedStart.getTime() + durationMs);
          events.push(normalize({
            ...item,
            start: correctedStart,
            end: correctedEnd,
          }, name, style, timezone, tzid));
        }
      }
    } else {
      if (item.end < winStartJS || item.start > winEndJS) continue;
      events.push(normalize(item, name, style, timezone, tzid));
    }
  }

  console.log(`[fetch] ${name}: ${events.length} events`);
  return events;
}

function systemWallClockToUTC(jsDate) {
  const wall = DateTime.fromJSDate(jsDate, { zone: 'utc' });
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const asSystem = DateTime.fromObject({
    year: wall.year, month: wall.month, day: wall.day,
    hour: wall.hour, minute: wall.minute, second: wall.second,
  }, { zone: systemZone });
  if (!asSystem.isValid) return jsDate;
  return asSystem.toJSDate();
}

function isExcluded(item, occ) {
  if (!item.exdate) return false;
  const occKey = occ.toISOString().substring(0, 10);
  return Object.keys(item.exdate).some((k) => k.startsWith(occKey));
}

function dateTimeFromICS(jsDate, tzid, displayTz) {
  return DateTime.fromJSDate(jsDate).setZone(displayTz);
}

function normalize(raw, calendarName, style, displayTz, tzid) {
  const start = dateTimeFromICS(raw.start, tzid, displayTz);
  const end = dateTimeFromICS(raw.end, tzid, displayTz);
  const durationMs = raw.end.getTime() - raw.start.getTime();
  const allDay = raw.datetype === 'date' || durationMs >= 24 * 3600 * 1000;

  return {
    uid: raw.uid,
    calendar: calendarName,
    style,
    title: (raw.summary || '(no title)').toString().trim(),
    location: (raw.location || '').toString().trim(),
    start,
    end,
    allDay,
    status: raw.status,
  };
}
