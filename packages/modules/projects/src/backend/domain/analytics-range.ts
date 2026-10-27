/**
 * The range and the ratios of Project analytics — pure domain
 * (`specs/163-projects-and-tasks/research.md` R-15; spec FR-037, FR-038).
 *
 * A range is two calendar days, both included, counted in UTC — the CRM
 * analytics' rule, and the one an index on a `timestamptz` column can answer
 * with a half-open interval: `[from 00:00, the day after to 00:00)`. The SQL
 * counts and sums; what a count means as a share, a rate or a number of days
 * is said here, once.
 */

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SECONDS_PER_DAY = 86_400;

function midnight(day: string): Date {
  const match = CALENDAR_DAY.exec(day);
  if (!match) throw new RangeError(`"${day}" is not a calendar date (YYYY-MM-DD).`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/**
 * The instants a range of days covers: `start` included, `end` excluded.
 * Throws `RangeError` for a range that ends before it starts — the query
 * schema refuses one first, so this is the domain's own guard.
 */
export function analyticsRange(range: { from: string; to: string }): { start: Date; end: Date } {
  const start = midnight(range.from);
  const last = midnight(range.to);
  if (last < start) throw new RangeError('The range ends before it starts.');
  return { start, end: new Date(last.getTime() + SECONDS_PER_DAY * 1000) };
}

/** Completed over closed (completed + lost); `null` when nothing closed. */
export function completionRate(completed: number, lost: number): number | null {
  const closed = completed + lost;
  return closed > 0 ? completed / closed : null;
}

/** A part of its whole; `0` of nothing. */
export function shareOf(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

/** An average in seconds as days; `null` stays `null` (an average over nothing). */
export function secondsToDays(seconds: number | null): number | null {
  return seconds === null ? null : seconds / SECONDS_PER_DAY;
}
