import { describe, expect, it } from 'vitest';
import {
  symptomParseRequestSchema,
  symptomParsePreviewSchema,
  localTimeCandidates,
} from '@workspace/shared';
const raw = '  🧪\n中 é headache  ';
const preview = {
  raw_text: raw,
  suggestions: {},
  candidates: [],
  multiple_symptoms: false,
  warnings: [],
  parser_version: '1.0.0',
  dictionary_version: '1.0.0',
  reference_time: '2026-09-28T04:00:00.000Z',
  timezone: null,
  timezone_source: 'unconfirmed',
};
describe('independent draft contract', () => {
  it('accepts missing structured fields and preserves UTF-16 original text', () => {
    expect(
      symptomParseRequestSchema.parse({ raw_text: raw, locale: 'zh' }).raw_text
    ).toBe(raw);
    expect(symptomParsePreviewSchema.parse(preview).suggestions).toEqual({});
  });
  it.each([
    'owner_id',
    'user_id',
    'target_user_id',
    'id',
    'model',
    'model_url',
    'api_key',
    'provider',
    'timezone',
    'reference_time',
  ])('rejects client-controlled %s', (key) => {
    expect(
      symptomParseRequestSchema.safeParse({
        raw_text: raw,
        locale: 'en',
        [key]: 'SYNTHETIC_HP1B_PRIVATE',
      }).success
    ).toBe(false);
  });
  it.each([
    { locale: 'fr' },
    { raw_text: ' ' },
    { raw_text: 'x'.repeat(10001) },
    { raw_text: 42 },
    { locale: null },
  ])('rejects malformed request case %#', (change) => {
    expect(
      symptomParseRequestSchema.safeParse({
        raw_text: raw,
        locale: 'en',
        ...change,
      }).success
    ).toBe(false);
  });
  it('allows UTF-16 evidence around Chinese, newline, combining characters and emoji', () => {
    for (const fragment of ['🧪', '\n', '中', 'é', 'headache']) {
      const start = raw.indexOf(fragment);
      const result = symptomParsePreviewSchema.parse({
        ...preview,
        candidates: [
          { name: fragment, evidence: { start, end: start + fragment.length } },
        ],
      });
      const evidence = result.candidates[0]!.evidence;
      expect(raw.slice(evidence.start, evidence.end)).toBe(fragment);
    }
  });
  it.each([
    { start: -1, end: 1 },
    { start: 2, end: 1 },
    { start: 0, end: raw.length + 1 },
    { start: 0.5, end: 1 },
  ])('rejects invalid evidence case %#', (evidence) => {
    expect(
      symptomParsePreviewSchema.safeParse({
        ...preview,
        candidates: [{ name: 'Synthetic', evidence }],
      }).success
    ).toBe(false);
  });
  it.each([
    {
      suggestions: {
        severity: {
          value: 11,
          status: 'explicit',
          reason: 'explicit_scale',
          evidence: [{ start: 0, end: 1 }],
        },
      },
    },
    {
      suggestions: {
        severity: {
          value: 0,
          status: 'unrecognized',
          reason: 'no_match',
          evidence: [],
        },
      },
    },
    {
      suggestions: {
        severity: {
          status: 'explicit',
          reason: 'explicit_scale',
          evidence: [],
        },
      },
    },
    {
      suggestions: {
        symptom_name: {
          value: 'Synthetic',
          status: 'likely',
          reason: 'dictionary_match',
          evidence: [{ start: 0, end: 1 }],
        },
      },
    },
    { warnings: [{ code: 'invented', evidence: [] }] },
    { timezone: 'UTC' },
    { timezone: 'Invalid/Zone', timezone_source: 'user_preference' },
    { multiple_symptoms: true },
    { parser_version: 'unbounded' },
    {
      candidates: Array.from({ length: 13 }, () => ({
        name: 'Synthetic',
        evidence: { start: 0, end: 1 },
      })),
    },
  ])('rejects malformed preview case %#', (change) => {
    expect(
      symptomParsePreviewSchema.safeParse({ ...preview, ...change }).success
    ).toBe(false);
  });
});
describe('unambiguous local minute resolution', () => {
  it('does not normalize a DST gap', () =>
    expect(localTimeCandidates('2026-03-08T02:30', 'America/New_York')).toEqual(
      []
    ));
  it('retains both sides of a repeated minute', () =>
    expect(localTimeCandidates('2026-11-01T01:30', 'America/New_York')).toEqual(
      ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']
    ));
  it('handles a half-hour rollback', () =>
    expect(
      localTimeCandidates('2026-04-05T01:45', 'Australia/Lord_Howe')
    ).toHaveLength(2));
  it('rejects invalid calendar dates and unsupported zones', () => {
    expect(localTimeCandidates('2026-02-30T10:00', 'UTC')).toEqual([]);
    expect(localTimeCandidates('2026-09-28T24:00', 'UTC')).toEqual([]);
    expect(localTimeCandidates('2026-09-28T12:00', 'invalid')).toEqual([]);
  });
});
