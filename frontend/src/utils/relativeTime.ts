/**
 * Short Indonesian "time ago" label for dashboard timestamps ("baru saja", "5 menit lalu").
 * Hand-written rather than `Intl.RelativeTimeFormat` so the wording does not depend on the
 * runtime's ICU data. Anything older than a month falls back to a calendar date.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  // A timestamp slightly in the future (clock skew between server and browser) reads as "now".
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE_MS) return 'baru saja';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} menit lalu`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} jam lalu`;
  if (elapsed < MONTH_MS) return `${Math.floor(elapsed / DAY_MS)} hari lalu`;

  return new Date(then).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
