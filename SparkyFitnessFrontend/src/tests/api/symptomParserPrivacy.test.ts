import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { parseJournalDraft } from '@/api/SymptomJournal/symptomJournalService';
import { apiCall } from '@/api/api';
import { toast } from '@/hooks/use-toast';
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'DEBUG',
}));
const marker = 'SYNTHETIC_HP1B_PRIVATE';
const input = { raw_text: `  ${marker}\n头痛 🧪 é  `, locale: 'zh' as const };
const result = {
  raw_text: input.raw_text,
  suggestions: {},
  candidates: [],
  multiple_symptoms: false,
  warnings: [{ code: 'unrecognized_symptom', evidence: [] }],
  parser_version: '1.0.0',
  dictionary_version: '1.0.0',
  reference_time: '2026-09-28T04:00:00Z',
  timezone: null,
  timezone_source: 'unconfirmed',
};
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});
it('sends only raw text and validated language to the same-origin preview endpoint', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(result),
  } as unknown as Response);
  const response = await parseJournalDraft(input);
  expect(response.raw_text).toBe(input.raw_text);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/v2/symptom-journal/parse',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
      credentials: 'include',
      cache: 'no-store',
    })
  );
});
it('sanitizes malformed preview and raw-text mismatches before global Query/Mutation handlers', async () => {
  const errors: unknown[] = [];
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => errors.push(error) }),
    mutationCache: new MutationCache({
      onError: (error) => errors.push(error),
    }),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const malformed of [
    { ...result, raw_text: 'different' },
    { ...result, suggestions: { severity: { value: marker } } },
  ]) {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(malformed),
    } as unknown as Response);
    await expect(
      client.fetchQuery({
        queryKey: ['synthetic', errors.length],
        queryFn: () => parseJournalDraft(input),
      })
    ).rejects.toThrow('Invalid parser response.');
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: () => parseJournalDraft(input) })
        .execute(undefined)
    ).rejects.toThrow('Invalid parser response.');
  }
  expect(errors).toHaveLength(4);
  for (const error of errors) expect(String(error)).not.toContain(marker);
  client.clear();
});
it('never logs payloads, responses, errors or malformed paths at DEBUG', async () => {
  const spies = [
    jest.spyOn(console, 'debug'),
    jest.spyOn(console, 'info'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'error'),
    jest.spyOn(console, 'log'),
  ].map((spy) => spy.mockImplementation(() => {}));
  try {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(result),
    } as unknown as Response);
    await parseJournalDraft(input);
    jest.mocked(global.fetch).mockRejectedValue(new Error(marker));
    await expect(
      apiCall(`/v2/symptom-journalTYPO/${marker}?raw_text=${marker}`, {
        method: 'POST',
        body: input,
      })
    ).rejects.toThrow('Journal request failed.');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(toast).mock.calls)).not.toContain(marker);
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
});
it('does not show an error toast when an obsolete preview request is aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  jest.mocked(global.fetch).mockRejectedValue(new Error(marker));
  await expect(parseJournalDraft(input, controller.signal)).rejects.toThrow(
    'Journal request canceled.'
  );
  expect(toast).not.toHaveBeenCalled();
});
