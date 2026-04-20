export function mergeEvents(eventArrays) {
  const flat = eventArrays.flat();
  const seen = new Map();

  for (const ev of flat) {
    if (ev.status === 'CANCELLED') continue;
    const key = `${ev.uid}|${ev.start.toISO()}`;
    if (!seen.has(key)) {
      seen.set(key, ev);
    }
  }

  return [...seen.values()].sort((a, b) => a.start.toMillis() - b.start.toMillis());
}
