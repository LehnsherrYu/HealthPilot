import {
  symptomParseRequestSchema,
  symptomParsePreviewSchema,
  type SymptomParseRequest,
  type SymptomParsePreview,
  type SymptomParseEvidence,
  type SymptomParseWarning,
  type SymptomParseField,
} from '@workspace/shared';
import {
  symptomDictionary,
  locationDictionary,
  contextPatterns,
  DICTIONARY_VERSION,
} from './dictionary.js';
import { timeClues, hasSymptomSubject, type ParserContext } from './time.js';

const PARSER_VERSION = '1.0.0';
type WarningCode = SymptomParseWarning['code'];
const spanOf = (match: RegExpMatchArray, offset = 0): SymptomParseEvidence => ({
  start: offset + (match.index ?? 0),
  end: offset + (match.index ?? 0) + match[0].length,
});

/** Pure, bounded language matching. No repository, filesystem, network, tools or history. */
export function parseSymptomText(
  input: SymptomParseRequest,
  context: ParserContext
): SymptomParsePreview {
  const { raw_text: raw } = symptomParseRequestSchema.parse(input);
  const preview: SymptomParsePreview = {
    raw_text: raw,
    suggestions: {},
    candidates: [],
    multiple_symptoms: false,
    warnings: [],
    parser_version: PARSER_VERSION,
    dictionary_version: DICTIONARY_VERSION,
    ...context,
  };
  const warn = (code: WarningCode, evidence: SymptomParseEvidence[] = []) => {
    const existing = preview.warnings.find((item) => item.code === code);
    if (existing)
      existing.evidence.push(
        ...evidence.slice(0, 16 - existing.evidence.length)
      );
    else if (preview.warnings.length < 24)
      preview.warnings.push({ code, evidence: evidence.slice(0, 16) });
  };
  const uncertain = (
    field: SymptomParseField,
    evidence: SymptomParseEvidence[] = []
  ) => {
    preview.suggestions[field] = {
      status: 'needs_confirmation',
      reason: 'ambiguous',
      evidence: evidence.slice(0, 16),
    };
  };
  if (!context.timezone) warn('timezone_unconfirmed');
  if (contextPatterns.unsupported.test(raw)) {
    warn('unsupported_expression');
    return symptomParsePreviewSchema.parse(preview);
  }

  // Mask excluded clauses with UTF-16 spaces so every remaining match retains its original offsets.
  const eligible = raw.split('');
  const candidates = new Map<
    string,
    SymptomParsePreview['candidates'][number]
  >();
  let other = false;
  let hypothetical = false;
  let negated = false;
  let start = 0;
  const separators = [
    ...raw.matchAll(/[,，。!?;；\n]|\.(?!\d)/g),
    { index: raw.length, 0: '' },
  ];
  for (const separator of separators) {
    const end = separator.index;
    const clause = raw.slice(start, end);
    const scope = { start, end };
    if (contextPatterns.other.test(clause)) other = true;
    else if (contextPatterns.self.test(clause)) other = false;
    if (contextPatterns.hypothetical.test(clause)) hypothetical = true;
    else if (contextPatterns.self.test(clause)) hypothetical = false;
    if (
      /但是|但|而且|\bbut\b|\bhowever\b|(?:^|\s)I (?:have|feel)\b|有点|出现/.test(
        clause
      )
    )
      negated = false;
    const denied: boolean = contextPatterns.negated.test(clause) || negated;
    const hits: Array<{
      key: string;
      name: string;
      evidence: SymptomParseEvidence;
    }> = [];
    for (const item of symptomDictionary) {
      const match = [...clause.matchAll(item.pattern)][0];
      if (!match) continue;
      const evidence = spanOf(match, start);
      if (
        hits.some(
          (hit) =>
            hit.evidence.start <= evidence.start &&
            hit.evidence.end >= evidence.end
        )
      )
        continue;
      hits.push({ key: item.key, name: match[0], evidence });
    }
    if (other || hypothetical || denied) {
      for (let index = start; index < end; index++) eligible[index] = ' ';
      if (hits.length) {
        if (other) warn('non_self_subject', [scope]);
        if (hypothetical) warn('hypothetical', [scope]);
        if (denied)
          warn(
            'negated_symptom',
            hits.map((hit) => hit.evidence)
          );
      }
    } else
      for (const hit of hits) {
        if (!candidates.has(hit.key) && candidates.size < 12)
          candidates.set(hit.key, { name: hit.name, evidence: hit.evidence });
      }
    negated = denied && !/[。.!?]/.test(separator[0]);
    start = end + separator[0].length;
  }
  const text = eligible.join('');
  preview.candidates = [...candidates.values()];
  preview.multiple_symptoms = preview.candidates.length > 1;
  if (preview.multiple_symptoms) {
    warn(
      'multiple_symptoms',
      preview.candidates.map((item) => item.evidence)
    );
    preview.suggestions.symptom_name = {
      status: 'needs_confirmation',
      reason: 'multiple_candidates',
      evidence: preview.candidates.map((item) => item.evidence),
    };
    return symptomParsePreviewSchema.parse(preview);
  }
  // A lone dictionary hit in a coordinated expression may omit an unknown symptom.
  // Decline automatic fields instead of silently selecting only the known part.
  if (
    preview.candidates.length === 1 &&
    /和|、|以及|而且|并且|还有|伴有|\b(?:and|also)\b/i.test(text)
  ) {
    warn('unsupported_expression');
    uncertain('symptom_name', [preview.candidates[0]!.evidence]);
    return symptomParsePreviewSchema.parse(preview);
  }
  if (preview.candidates[0])
    preview.suggestions.symptom_name = {
      value: preview.candidates[0].name,
      status: 'explicit',
      reason: 'dictionary_match',
      evidence: [preview.candidates[0].evidence],
    };
  else {
    warn('unrecognized_symptom');
    preview.suggestions.symptom_name = {
      status: 'unrecognized',
      reason: 'no_match',
      evidence: [],
    };
  }

  const clues = timeClues(text, context);
  for (const field of ['started_at', 'ended_at'] as const) {
    const matches = clues.filter((clue) => clue.field === field);
    if (!matches.length) continue;
    for (const clue of matches)
      if (clue.warning) warn(clue.warning, [clue.evidence]);
    const values = new Set(matches.map((clue) => clue.value));
    if (values.size === 1 && matches[0]?.value && preview.candidates.length) {
      preview.suggestions[field] = {
        value: matches[0].value,
        status: 'explicit',
        reason: field === 'started_at' ? 'explicit_start' : 'explicit_end',
        evidence: matches.map((clue) => clue.evidence),
      };
    } else {
      uncertain(
        field,
        matches.map((clue) => clue.evidence)
      );
      if (values.size > 1) warn('conflicting_values');
    }
  }
  for (const match of text.matchAll(
    /最近|有一阵子|昨晚|昨天|今天|\brecently\b|\bfor a while\b|\blast night\b|\byesterday\b|\btoday\b/gi
  )) {
    const evidence = spanOf(match);
    if (
      !clues.some(
        (clue) =>
          clue.evidence.start <= evidence.start &&
          clue.evidence.end >= evidence.end
      )
    ) {
      warn('ambiguous_time', [evidence]);
      if (!preview.suggestions.started_at) uncertain('started_at', [evidence]);
    }
  }
  for (const match of text.matchAll(
    /持续(?:了)?\s*[一二两三四五六七八九十\d]+(?:个)?小时|\b(?:lasted|for)\s+(?:one|two|three|\d+)\s+hours?\b/gi
  ))
    warn('duration_only', [spanOf(match)]);
  if (!preview.candidates.length)
    return symptomParsePreviewSchema.parse(preview);

  const locations: Array<{ value: string; evidence: SymptomParseEvidence }> =
    [];
  for (const pattern of locationDictionary)
    for (const match of text.matchAll(pattern)) {
      if (locations.length === 16) break;
      const evidence = spanOf(match);
      if (
        !locations.some(
          (location) => location.value.toLowerCase() === match[0].toLowerCase()
        )
      )
        locations.push({ value: match[0], evidence });
    }
  if (locations.length === 1)
    preview.suggestions.body_location = {
      value: locations[0]!.value,
      status: 'explicit',
      reason: 'dictionary_match',
      evidence: [locations[0]!.evidence],
    };
  else if (locations.length > 1) {
    uncertain(
      'body_location',
      locations.map((item) => item.evidence)
    );
    warn('conflicting_values');
  }

  const severities = [
    ...text.matchAll(
      /(?<![\d.])(?:\d{1,3}\s*[-–]\s*)?[-+−–]?\d{1,3}(?:\.\d{1,2})?\s*\/\s*10(?!\d)/g
    ),
  ].slice(0, 16);
  const levels = new Set(
    severities.map((match) => Number(match[0].split('/')[0]?.trim()))
  );
  const invalidSeverity = [...levels].some(
    (value) => !Number.isInteger(value) || value < 0 || value > 10
  );
  if (invalidSeverity) {
    warn(
      'invalid_severity',
      severities.map((match) => spanOf(match))
    );
    uncertain('severity');
  } else if (levels.size > 1) {
    warn('conflicting_values');
    uncertain(
      'severity',
      severities.map((match) => spanOf(match))
    );
  } else if (levels.size === 1)
    preview.suggestions.severity = {
      value: [...levels][0]!,
      status: 'explicit',
      reason: 'explicit_scale',
      evidence: severities.map((match) => spanOf(match)),
    };

  const ended = /已经结束|已结束|完全消失|\b(?:ended|resolved|stopped)\b/gi;
  const ongoing =
    /仍在持续|还在持续|持续中|\b(?:still ongoing|ongoing|still present)\b/gi;
  const endMatch = [...text.matchAll(ended)].find((match) =>
    hasSymptomSubject(text.slice(0, match.index))
  );
  const ongoingMatch = [...text.matchAll(ongoing)].find((match) =>
    hasSymptomSubject(text.slice(0, match.index))
  );
  if (endMatch && ongoingMatch) {
    warn('conflicting_values');
    uncertain('status', [spanOf(endMatch), spanOf(ongoingMatch)]);
    delete preview.suggestions.ended_at;
  } else if (endMatch || ongoingMatch)
    preview.suggestions.status = {
      value: endMatch ? 'resolved' : 'ongoing',
      status: 'explicit',
      reason: 'explicit_status',
      evidence: [spanOf((endMatch ?? ongoingMatch)!)],
    };
  if (preview.suggestions.ended_at?.value && !preview.suggestions.status) {
    preview.suggestions.status = {
      value: 'resolved',
      status: 'explicit',
      reason: 'explicit_status',
      evidence: preview.suggestions.ended_at.evidence,
    };
  }
  const startTime = preview.suggestions.started_at?.value;
  const endTime = preview.suggestions.ended_at?.value;
  if (startTime && endTime && Date.parse(endTime) < Date.parse(startTime)) {
    warn('conflicting_values');
    uncertain('ended_at', preview.suggestions.ended_at!.evidence);
  }

  const factors = [
    {
      field: 'triggers' as const,
      pattern:
        /(久坐|长时间坐着|运动|吃饭|进食)(?=后)|(?<=after )(prolonged sitting|sitting|exercise|eating)\b/gi,
      reason: 'described_trigger' as const,
    },
    {
      field: 'relieving_factors' as const,
      pattern:
        /(休息|走动|喝水|热敷)(?=后(?:有所)?(?:缓解|好一点|减轻))|(?<=improved after )(rest|walking|water)|(?<=better after )(rest|walking|water)/gi,
      reason: 'described_relief' as const,
    },
  ];
  for (const factor of factors) {
    const matches = [...text.matchAll(factor.pattern)].slice(0, 16);
    if (matches.length === 1)
      preview.suggestions[factor.field] = {
        value: matches[0]![0],
        status: 'explicit',
        reason: factor.reason,
        evidence: [spanOf(matches[0]!)],
      };
    else if (matches.length > 1) {
      uncertain(
        factor.field,
        matches.map((match) => spanOf(match))
      );
      warn('conflicting_values');
    }
  }
  return symptomParsePreviewSchema.parse(preview);
}
