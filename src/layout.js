import { DateTime } from 'luxon';

export function computeViewWindow(now, daysShown, timezone) {
  const local = now.setZone(timezone);
  const start = local.startOf('day');
  const end = start.plus({ days: daysShown });
  return { start, end };
}

export function computeHourWindow(now, hoursShown, hoursBeforeNow) {
  const center = now.hour + now.minute / 60;
  let hourStart = center - hoursBeforeNow;
  let hourEnd = hourStart + hoursShown;
  if (hourStart < 0) { hourEnd += -hourStart; hourStart = 0; }
  if (hourEnd > 24)  { hourStart -= (hourEnd - 24); hourEnd = 24; }
  hourStart = Math.max(0, Math.floor(hourStart));
  hourEnd = Math.min(24, Math.ceil(hourEnd));
  return { hourStart, hourEnd };
}

export function layoutView(events, { start, daysShown, hourStart, hourEnd, timezone, now }) {
  const today = now.setZone(timezone).startOf('day');
  const days = [];
  for (let i = 0; i < daysShown; i++) {
    const day = start.plus({ days: i });
    days.push({
      date: day,
      label: day.toFormat('ccc d'),
      isoDate: day.toISODate(),
      isToday: day.hasSame(today, 'day'),
      allDayEvents: [],
      timedEvents: [],
    });
  }

  const totalHours = hourEnd - hourStart;

  for (const ev of events) {
    for (const day of days) {
      const dayStart = day.date;
      const dayEnd = day.date.plus({ days: 1 });
      if (ev.end <= dayStart || ev.start >= dayEnd) continue;

      if (ev.allDay) {
        day.allDayEvents.push({ ...ev });
        continue;
      }

      const clampedStart = ev.start < dayStart ? dayStart : ev.start;
      const clampedEnd = ev.end > dayEnd ? dayEnd : ev.end;

      const startHour = clampedStart.hour + clampedStart.minute / 60;
      const rawEndHour = clampedEnd.hour + clampedEnd.minute / 60;
      const endHour = rawEndHour === 0 && clampedEnd.day !== clampedStart.day ? 24 : rawEndHour;

      if (endHour <= hourStart || startHour >= hourEnd) continue;

      const visibleStart = Math.max(startHour, hourStart);
      const visibleEnd = Math.min(endHour, hourEnd);

      day.timedEvents.push({
        ...ev,
        clampedStart,
        clampedEnd,
        topPct: ((visibleStart - hourStart) / totalHours) * 100,
        heightPct: ((visibleEnd - visibleStart) / totalHours) * 100,
        timeLabel: formatTimeRange(clampedStart, clampedEnd),
      });
    }
  }

  for (const day of days) {
    assignLanes(day.timedEvents);
  }

  const hourRows = [];
  for (let h = hourStart; h < hourEnd; h++) {
    const display = h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`;
    hourRows.push({ hour: h, label: display });
  }

  const nowLocal = now.setZone(timezone);
  const nowHour = nowLocal.hour + nowLocal.minute / 60;
  let currentTimePct = null;
  if (nowHour >= hourStart && nowHour <= hourEnd) {
    currentTimePct = ((nowHour - hourStart) / totalHours) * 100;
  }

  return {
    days,
    hourRows,
    hourStart,
    hourEnd,
    currentTimePct,
    nowLabel: nowLocal.toFormat('h:mm a'),
  };
}

function formatTimeRange(start, end) {
  const sameAmPm = (start.hour < 12) === (end.hour < 12);
  if (sameAmPm) {
    return `${start.toFormat('h:mm')}-${end.toFormat('h:mma').toLowerCase()}`;
  }
  return `${start.toFormat('h:mma').toLowerCase()}-${end.toFormat('h:mma').toLowerCase()}`;
}

// Assigns { lane, laneCount } to each event so concurrent events render side-by-side.
// Events must all belong to the same day. Modifies in place.
function assignLanes(events) {
  events.sort((a, b) => {
    const diff = a.clampedStart.toMillis() - b.clampedStart.toMillis();
    return diff !== 0 ? diff : (b.clampedEnd.toMillis() - b.clampedStart.toMillis()) - (a.clampedEnd.toMillis() - a.clampedStart.toMillis());
  });

  // Partition into overlap clusters
  const clusters = [];
  let current = [];
  let clusterEnd = null;
  for (const ev of events) {
    if (clusterEnd && ev.clampedStart >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = null;
    }
    current.push(ev);
    clusterEnd = clusterEnd && clusterEnd > ev.clampedEnd ? clusterEnd : ev.clampedEnd;
  }
  if (current.length) clusters.push(current);

  for (const cluster of clusters) {
    const laneEnds = [];
    for (const ev of cluster) {
      let lane = laneEnds.findIndex(endTs => endTs <= ev.clampedStart.toMillis());
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = ev.clampedEnd.toMillis();
      ev.lane = lane;
    }
    const laneCount = laneEnds.length;
    for (const ev of cluster) ev.laneCount = laneCount;
  }
}
