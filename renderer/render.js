import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { DateTime } from 'luxon';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { fetchCalendar } from '../src/ics-fetcher.js';
import { mergeEvents } from '../src/event-merger.js';
import { computeViewWindow, computeHourWindow, layoutView } from '../src/layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const config = yaml.load(fs.readFileSync(path.join(ROOT, 'config.yml'), 'utf8'));
  const calendarsDef = yaml.load(fs.readFileSync(path.join(ROOT, 'calendars.yml'), 'utf8'));

  const timezone = config.timezone;
  const now = DateTime.now().setZone(timezone);
  const { start: winStart, end: winEnd } = computeViewWindow(now, config.daysShown, timezone);
  const { hourStart, hourEnd } = computeHourWindow(now, config.hoursShown, config.hoursBeforeNow);

  console.log(`[render] tz=${timezone} view=${winStart.toISODate()}..${winEnd.toISODate()} hours=${hourStart}-${hourEnd}`);

  const eventArrays = [];
  for (const cal of calendarsDef.calendars) {
    try {
      const events = await fetchCalendar(cal, { windowStart: winStart, windowEnd: winEnd, timezone });
      eventArrays.push(events);
    } catch (err) {
      console.error(`[render] ${cal.name}: fetch failed:`, err.message);
    }
  }

  const merged = mergeEvents(eventArrays);
  console.log(`[render] merged ${merged.length} events`);

  const layout = layoutView(merged, {
    start: winStart,
    daysShown: config.daysShown,
    hourStart, hourEnd,
    timezone, now,
  });

  const totalTimed = layout.days.reduce((n, d) => n + d.timedEvents.length, 0);
  const totalAllDay = layout.days.reduce((n, d) => n + d.allDayEvents.length, 0);

  const data = {
    title: `${winStart.toFormat('ccc, LLL d')} — ${winStart.plus({ days: config.daysShown - 1 }).toFormat('ccc, LLL d')}`,
    generatedAt: now.toFormat('LLL d HH:mm'),
    nowLabel: layout.nowLabel,
    days: layout.days.map(d => ({
      label: d.label,
      isToday: d.isToday,
      allDayEvents: d.allDayEvents.map(serializeEvent),
      timedEvents: d.timedEvents.map(serializeEvent),
    })),
    hourRows: layout.hourRows,
    hourStart: layout.hourStart,
    hourEnd: layout.hourEnd,
    currentTimePct: layout.currentTimePct,
    showCurrentTimeLine: config.showCurrentTimeLine && layout.currentTimePct != null,
    totalTimed,
    totalAllDay,
  };

  const { width, height } = config.display;
  const templateUrl = pathToFileURL(path.join(ROOT, 'renderer', 'template.html')).href;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((injected) => {
    window.__DATA__ = injected;
  }, data);
  await page.goto(templateUrl, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const rawPath = path.join(ROOT, 'output', 'cal-raw.png');
  const finalPath = path.join(ROOT, 'output', 'cal.png');

  await page.screenshot({ path: rawPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  await browser.close();

  // e-ink is 16-level grayscale; palette-ize to keep the PNG small (typically <40 KB)
  await sharp(rawPath)
    .grayscale()
    .png({ compressionLevel: 9, palette: true, colours: 16 })
    .toFile(finalPath);

  fs.unlinkSync(rawPath);

  const bytes = fs.statSync(finalPath).size;
  console.log(`[render] wrote ${finalPath} (${bytes} bytes)`);
}

function serializeEvent(ev) {
  return {
    calendar: ev.calendar,
    style: ev.style,
    title: ev.title,
    timeLabel: ev.timeLabel,
    topPct: ev.topPct,
    heightPct: ev.heightPct,
    lane: ev.lane ?? 0,
    laneCount: ev.laneCount ?? 1,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
