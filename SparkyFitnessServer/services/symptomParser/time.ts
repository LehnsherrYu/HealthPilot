import {
  addDays,
  instantToDay,
  isDayString,
  localTimeCandidates,
  type SymptomParseEvidence,
  type SymptomParseWarning,
} from '@workspace/shared';
import { locationDictionary, symptomDictionary } from './dictionary.js';

// Lifecycle words must refer to this event, not a job, shift, or other activity.
export function hasSymptomSubject(prefix: string): boolean {
  const clause =
    prefix
      .split(/[，,。.!?；;\n]/)
      .at(-1)
      ?.trim() ?? '';
  if (
    !clause ||
    /^(?:it|the symptom|the pain)\s*(?:has|had|is|was)?$/i.test(clause)
  )
    return true;
  // A symptom somewhere earlier in a sentence does not own every later verb.
  // Only accept a direct symptom subject, with optional location/copula words.
  return symptomDictionary.some((item) =>
    [...clause.matchAll(item.pattern)].some((match) => {
      let suffix = clause.slice(match.index + match[0].length);
      for (const location of locationDictionary)
        suffix = suffix.replace(location, '');
      return /^(?:\s*(?:at|in|on|the|has|had|is|was)\b)*\s*$|^(?:从|于|在|已|已经|完全)?$/i.test(
        suffix
      );
    })
  );
}

export interface ParserContext {
  reference_time: string;
  timezone: string | null;
  timezone_source: 'user_preference' | 'unconfirmed';
}
interface TimeClue {
  field: 'started_at' | 'ended_at';
  value?: string;
  evidence: SymptomParseEvidence;
  warning?: SymptomParseWarning['code'];
}
const timePattern =
  /(?<date>\d{4}-\d{2}-\d{2}|昨天|今天|yesterday|today)\s*(?:at\s+)?(?<period>上午|早上|凌晨|下午|晚上)?\s*(?<hour>\d{1,2})(?:(?<separator>[:：])(?<minute>\d{2})|点(?:(?<zhminute>\d{1,2})分)?)?\s*(?<meridiem>am|pm)?/gi;

export function timeClues(text: string, context: ParserContext): TimeClue[] {
  const clues: TimeClue[] = [];
  for (const match of text.matchAll(timePattern)) {
    if (clues.length === 8) break;
    const groups = match.groups!;
    const end = match.index + match[0].length;
    const before =
      text
        .slice(0, match.index)
        .split(/[，,。.!?；;\n]/)
        .at(-1) ?? '';
    const after = text.slice(end, end + 12);
    const endVerb = /(?:ended|resolved|stopped|结束|消失)\s*$/i.exec(before);
    const startVerb = /(?:started|began|开始)\s*$/i.exec(before);
    const isEnd =
      (endVerb && hasSymptomSubject(before.slice(0, endVerb.index))) ||
      (/^\s*(?:结束|消失)/.test(after) && hasSymptomSubject(before));
    const isStart =
      (startVerb && hasSymptomSubject(before.slice(0, startVerb.index))) ||
      (/^\s*(?:开始|起)/.test(after) && hasSymptomSubject(before));
    const clue: TimeClue = {
      field: isEnd ? 'ended_at' : 'started_at',
      evidence: { start: match.index, end },
    };
    clues.push(clue);
    if (!context.timezone) {
      clue.warning = 'timezone_unconfirmed';
      continue;
    }
    if (!isEnd && !isStart) {
      clue.warning = 'ambiguous_time';
      continue;
    }
    const clause =
      before + match[0] + (text.slice(end).split(/[，,。.!?；;\n]/)[0] ?? '');
    if (
      /大约|大概|左右|前后|约莫|\b(?:about|around|approximately|roughly|or|maybe|possibly|between|before|after|until)\b|[–—~～]|(?:点|pm|am|\d:\d{2})\s*-\s*/i.test(
        clause
      )
    ) {
      clue.warning = 'ambiguous_time';
      continue;
    }
    let date = groups.date!.toLowerCase();
    if (date === '昨天' || date === 'yesterday')
      date = addDays(
        instantToDay(context.reference_time, context.timezone),
        -1
      );
    else if (date === '今天' || date === 'today')
      date = instantToDay(context.reference_time, context.timezone);
    let hour = Number(groups.hour);
    const minute = Number(groups.minute ?? groups.zhminute ?? 0);
    const period = groups.period ?? groups.meridiem?.toLowerCase();
    if (
      !isDayString(date) ||
      minute > 59 ||
      hour > 23 ||
      (!period && !groups.separator) ||
      (period && (hour < 1 || hour > 12))
    ) {
      clue.warning = 'ambiguous_time';
      continue;
    }
    if (period) {
      hour %= 12;
      if (['pm', '下午', '晚上'].includes(period)) hour += 12;
    }
    const local = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const candidates = localTimeCandidates(local, context.timezone);
    if (!candidates.length) clue.warning = 'nonexistent_local_time';
    else if (candidates.length > 1) clue.warning = 'ambiguous_local_time';
    else clue.value = candidates[0];
  }
  return clues;
}
