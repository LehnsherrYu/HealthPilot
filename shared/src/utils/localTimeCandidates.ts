import {
  isDayString,
  isValidTimeZone,
  utcToLocalDateTimeInput,
} from "./timezone.ts";

/** Resolve an explicit minute in a named zone without choosing a side of DST.
 * Empty means invalid/nonexistent; two results mean the clock minute repeats.
 * Samples offsets on both sides of the local date, including half-hour changes.
 * Fixed work per call; only Intl and calendar helpers, no ambient clock or I/O.
 */
export function localTimeCandidates(local: string, timezone: string): string[] {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match || !isDayString(match[1]!) || !isValidTimeZone(timezone))
    return [];
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return [];
  const nominal = Date.parse(`${local}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600000;
    const wall = utcToLocalDateTimeInput(
      new Date(sample).toISOString(),
      timezone,
    );
    offsets.add(Date.parse(`${wall}:00Z`) - sample);
  }
  return [...offsets]
    .map((offset) => new Date(nominal - offset).toISOString())
    .filter((instant) => utcToLocalDateTimeInput(instant, timezone) === local)
    .sort();
}
