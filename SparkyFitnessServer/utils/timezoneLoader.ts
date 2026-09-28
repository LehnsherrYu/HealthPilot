import { getUserPreferences } from '../models/preferenceRepository.js';
import {
  isValidTimeZone,
  isDayString,
  compareDays,
  todayInZone,
} from '@workspace/shared';
/** A missing/invalid preference or read failure is not a confirmed UTC zone. */
export async function loadUserTimezoneContext(userId: string): Promise<{
  timezone: string | null;
  timezone_source: 'user_preference' | 'unconfirmed';
}> {
  try {
    const prefs: unknown = await getUserPreferences(userId);
    const tz =
      typeof prefs === 'object' && prefs !== null && 'timezone' in prefs
        ? prefs.timezone
        : null;
    if (typeof tz === 'string' && tz && isValidTimeZone(tz))
      return { timezone: tz, timezone_source: 'user_preference' };
  } catch {
    /* Deliberately omit preference and database error details. */
  }
  return { timezone: null, timezone_source: 'unconfirmed' };
}
async function loadUserTimezone(userId: unknown): Promise<string> {
  if (typeof userId !== 'string') return 'UTC';
  return (await loadUserTimezoneContext(userId)).timezone ?? 'UTC';
}

/**
 * Resolves the calendar day from which a plan template (re)generates diary
 * entries. `clientDate` is caller-supplied, so it is honored only when it is a
 * valid day string on or after the user's current day; anything earlier or
 * malformed falls back to the user's today. That floor keeps a template refresh
 * anchored to today, since it also bounds the delete of previously generated
 * entries.
 */
async function resolveTemplateStartDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  clientDate?: string | null
) {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  if (
    typeof clientDate === 'string' &&
    isDayString(clientDate) &&
    compareDays(clientDate, today) > 0
  ) {
    return clientDate;
  }
  return today;
}

export { loadUserTimezone, resolveTemplateStartDay };
export default {
  loadUserTimezone,
  resolveTemplateStartDay,
};
