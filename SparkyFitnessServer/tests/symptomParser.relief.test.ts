import { describe, expect, it } from 'vitest';
import { parseSymptomText } from '../services/symptomParser/parser.js';

const context = {
  reference_time: '2026-09-29T02:00:00.000Z',
  timezone: 'Asia/Shanghai',
  timezone_source: 'user_preference' as const,
};
const parse = (raw_text: string) =>
  parseSymptomText({ raw_text, locale: 'zh' }, context);

describe('synthetic Chinese relief expressions', () => {
  it.each([
    ['头痛，热敷后好多了', '热敷'],
    ['热敷以后好转了一些', '热敷'],
    ['休息后舒服多了', '休息'],
    ['喝水后症状减轻', '喝水'],
    ['头痛，热敷后缓解', '热敷'],
    ['头痛，休息后舒服些', '休息'],
    ['头痛，走动后好一点', '走动'],
    ['头痛，热敷后有所缓解', '热敷'],
    ['🧪 头痛；\n  热敷以后好转了一些。', '热敷'],
    ['妈妈热敷后好多了；🧪 我头痛，休息后舒服多了。', '休息'],
  ])(
    'extracts the described relief without asserting resolution: %s',
    (raw, factor) => {
      const result = parse(raw);
      const start = raw.indexOf(factor);
      expect(result.raw_text).toBe(raw);
      expect(result.suggestions.relieving_factors).toEqual({
        value: factor,
        status: 'explicit',
        reason: 'described_relief',
        evidence: [{ start, end: start + factor.length }],
      });
      expect(result.suggestions.triggers?.value).toBeUndefined();
      expect(result.suggestions.status?.value).toBeUndefined();
      expect(result.suggestions.ended_at?.value).toBeUndefined();
      if (!raw.includes('头痛')) {
        expect(result.candidates).toEqual([]);
        expect(result.suggestions.symptom_name?.value).toBeUndefined();
      }
    }
  );

  it.each([
    '热敷后没有好转',
    '热敷后反而更痛',
    '准备尝试热敷',
    '如果热敷后好转就好了',
    '妈妈热敷后好多了',
    '热敷以后没有好转',
    '打算休息后舒服些',
    '准备热敷以后好转一些',
    '以后休息后舒服多了',
    '热敷后好多了吗',
  ])(
    'does not turn excluded or unconfirmed relief into a fact: %s',
    (clause) => {
      for (const raw of [clause, `🧪 头痛，${clause}`]) {
        const result = parse(raw);
        expect(result.suggestions.relieving_factors?.value).toBeUndefined();
        expect(result.suggestions.triggers?.value).toBeUndefined();
      }
    }
  );

  it.each(['头痛，运动后好多了', '头痛，进食后症状减轻', '头痛，久坐后舒服些'])(
    'does not turn improvement into a trigger: %s',
    (raw) => {
      expect(parse(raw).suggestions.triggers?.value).toBeUndefined();
    }
  );

  it('keeps distinct positive relief factors for confirmation', () => {
    const raw = '🧪 头痛，热敷后好多了；休息后舒服多了';
    const result = parse(raw);
    expect(result.suggestions.relieving_factors?.value).toBeUndefined();
    expect(result.suggestions.relieving_factors?.status).toBe(
      'needs_confirmation'
    );
    expect(
      result.suggestions.relieving_factors?.evidence.map(({ start, end }) =>
        raw.slice(start, end)
      )
    ).toEqual(['热敷', '休息']);
  });
});
