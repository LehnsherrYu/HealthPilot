import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseSymptomText } from '../services/symptomParser/parser.js';
import { symptomParsePreviewSchema } from '@workspace/shared';

interface AcceptanceCase {
  id: string;
  locale: 'en' | 'zh';
  text: string;
  timezone?: string | null;
  reference_time?: string;
  values: Record<string, string | number>;
  absent?: string[];
  warnings?: string[];
  candidates?: number;
}
const corpus = JSON.parse(
  readFileSync(
    new URL('./fixtures/symptom-parser-corpus.json', import.meta.url),
    'utf8'
  )
) as { reference_time: string; timezone: string; cases: AcceptanceCase[] };

describe('frozen synthetic bilingual acceptance corpus', () => {
  it.each(corpus.cases.map((item) => [item.id, item] as const))(
    '%s',
    (_id, item) => {
      const timezone =
        item.timezone === undefined ? corpus.timezone : item.timezone;
      const referenceTime = item.reference_time ?? corpus.reference_time;
      const preview = parseSymptomText(
        { raw_text: item.text, locale: item.locale },
        {
          reference_time: referenceTime,
          timezone,
          timezone_source: timezone ? 'user_preference' : 'unconfirmed',
        }
      );
      expect(symptomParsePreviewSchema.safeParse(preview).success).toBe(true);
      expect(preview.raw_text).toBe(item.text);
      expect(preview.reference_time).toBe(referenceTime);
      expect(preview.timezone).toBe(timezone);
      const suggestions: Record<string, { value?: string | number }> =
        preview.suggestions;
      for (const [field, value] of Object.entries(item.values))
        expect(suggestions[field]?.value, field).toBe(value);
      for (const field of item.absent ?? [])
        expect(suggestions[field]?.value, field).toBeUndefined();
      for (const code of item.warnings ?? [])
        expect(preview.warnings.map((warning) => warning.code)).toContain(code);
      if (item.candidates !== undefined)
        expect(preview.candidates).toHaveLength(item.candidates);
      for (const suggestion of Object.values(preview.suggestions)) {
        for (const span of suggestion.evidence) {
          expect(span.start).toBeGreaterThanOrEqual(0);
          expect(span.end).toBeGreaterThan(span.start);
          expect(span.end).toBeLessThanOrEqual(item.text.length);
          expect(item.text.slice(span.start, span.end).length).toBe(
            span.end - span.start
          );
        }
      }
    }
  );
  it('has no network side effects and leaves its input unchanged', () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network forbidden'));
    try {
      const input = Object.freeze({
        raw_text: 'Synthetic headache 4/10',
        locale: 'en' as const,
      });
      const context = Object.freeze({
        reference_time: corpus.reference_time,
        timezone: corpus.timezone,
        timezone_source: 'user_preference' as const,
      });
      expect(parseSymptomText(input, context)).toEqual(
        parseSymptomText(input, context)
      );
      expect(network).not.toHaveBeenCalled();
      expect(input.raw_text).toBe('Synthetic headache 4/10');
    } finally {
      network.mockRestore();
    }
  });
  it('bounds candidate and warning output for long adversarial text', () => {
    const input = {
      raw_text: 'headache nausea shoulder pain '.repeat(300),
      locale: 'en' as const,
    };
    const result = parseSymptomText(input, {
      reference_time: corpus.reference_time,
      timezone: corpus.timezone,
      timezone_source: 'user_preference',
    });
    expect(result.candidates.length).toBeLessThanOrEqual(12);
    expect(result.warnings.length).toBeLessThanOrEqual(24);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'multiple_symptoms'
    );
    expect(result.suggestions.symptom_name?.value).toBeUndefined();
  });
});

describe('additional conservative boundary regressions', () => {
  const context = {
    reference_time: corpus.reference_time,
    timezone: corpus.timezone,
    timezone_source: 'user_preference' as const,
  };
  it.each(['Headache -1/10', 'Headache 3-4/10', '头痛 −2/10'])(
    '%s never becomes a valid numeric suggestion',
    (raw_text) => {
      const result = parseSymptomText({ raw_text, locale: 'en' }, context);
      expect(result.suggestions.severity?.value).toBeUndefined();
      expect(result.warnings.map((item) => item.code)).toContain(
        'invalid_severity'
      );
    }
  );
  it.each(['头痛和皮肤发痒', 'Headache and itchy skin', '头痛、皮肤发痒'])(
    '%s does not discard an unknown coordinated symptom',
    (raw_text) => {
      const result = parseSymptomText({ raw_text, locale: 'en' }, context);
      expect(
        Object.values(result.suggestions).every(
          (item) => item.value === undefined
        )
      ).toBe(true);
      expect(result.warnings.map((item) => item.code)).toContain(
        'unsupported_expression'
      );
    }
  );
});

it.each([
  'Headache, I stopped working.',
  '头痛，工作已经结束。',
  'Headache, my shift ended today at 10 am.',
])('%s does not borrow the end of another activity', (raw_text) => {
  const result = parseSymptomText(
    { raw_text, locale: 'en' },
    {
      reference_time: corpus.reference_time,
      timezone: corpus.timezone,
      timezone_source: 'user_preference',
    }
  );
  expect(result.suggestions.status?.value).toBeUndefined();
  expect(result.suggestions.ended_at?.value).toBeUndefined();
});
