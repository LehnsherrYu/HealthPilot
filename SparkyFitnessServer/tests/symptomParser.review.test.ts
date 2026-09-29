import { describe, expect, it } from 'vitest';
import { parseSymptomText } from '../services/symptomParser/parser.js';

const context = {
  reference_time: '2026-09-28T04:00:00.000Z',
  timezone: 'Asia/Shanghai',
  timezone_source: 'user_preference' as const,
};
const parse = (raw_text: string) =>
  parseSymptomText({ raw_text, locale: 'en' }, context);

describe('synthetic closeout review regressions', () => {
  it.each([
    "I don't have a headache.",
    'I don’t have a headache.',
    "I haven't had nausea.",
    "I didn't have shoulder pain.",
    "I can't have a headache tomorrow.",
    '我不头痛。',
    'My son has a headache.',
    'My daughter has nausea.',
    '女儿头痛。',
  ])('does not assert a negated or non-self symptom: %s', (raw) => {
    const result = parse(raw);
    expect(result.candidates).toEqual([]);
    expect(result.suggestions.symptom_name?.value).toBeUndefined();
  });

  it.each([
    'Headache improved after work ended.',
    'Headache improved after my shift ended today at 10 am.',
    '头痛在工作已经结束后缓解。',
    'Headache started after work ended today at 10 am.',
  ])('does not use another activity as symptom lifecycle: %s', (raw) => {
    const result = parse(raw);
    expect(result.suggestions.status?.value).toBeUndefined();
    expect(result.suggestions.ended_at?.value).toBeUndefined();
    expect(result.suggestions.started_at?.value).toBeUndefined();
  });

  it.each(['Headache improved after exercise.', '头痛，运动后缓解。'])(
    'does not relabel relief as a trigger: %s',
    (raw) => {
      expect(parse(raw).suggestions.triggers?.value).toBeUndefined();
    }
  );

  it.each([
    'Headache started yesterday at 3 pm or 4 pm.',
    'Headache started yesterday at 3 pm approximately.',
    'Headache started yesterday at 3 pm–4 pm.',
    '头痛从昨天下午3点左右开始。',
    'Headache started yesterday at 3 pm-4 pm.',
    'Headache started around yesterday at 3 pm.',
  ])('leaves qualified or alternative times for confirmation: %s', (raw) => {
    const result = parse(raw);
    expect(result.suggestions.started_at?.value).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'ambiguous_time'
    );
  });

  it('keeps an uncertain end time empty', () => {
    const result = parse('Headache ended today at 10 am approximately.');
    expect(result.suggestions.ended_at?.value).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'ambiguous_time'
    );
  });

  it.each([
    ['Headache at the right temple has ended.', 'resolved'],
    ['Headache is still ongoing.', 'ongoing'],
    ['肩颈不适已经结束。', 'resolved'],
  ])('preserves direct symptom lifecycle statements: %s', (raw, status) => {
    expect(parse(raw).suggestions.status?.value).toBe(status);
  });

  it('keeps UTF-16 evidence after an excluded clause and explicit self contrast', () => {
    const raw = '🧪 My daughter has a headache.\nI have nausea after eating.';
    const result = parse(raw);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      'nausea',
    ]);
    expect(result.suggestions.triggers?.value).toBe('eating');
    const evidence = result.suggestions.symptom_name!.evidence[0]!;
    expect(evidence.start).toBe(raw.indexOf('nausea'));
    expect(raw.slice(evidence.start, evidence.end)).toBe('nausea');
  });
});
