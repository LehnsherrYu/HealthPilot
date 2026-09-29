import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import {
  symptomParsePreviewSchema,
  type SymptomParsePreview,
  type SymptomJournalEntry,
} from '@workspace/shared';
import SymptomJournalPage from '@/pages/SymptomJournal/SymptomJournalPage';
import * as api from '@/api/SymptomJournal/symptomJournalService';
import en from '@/locales/healthpilot/en.json';
import zh from '@/locales/healthpilot/zh.json';
jest.mock('@/api/SymptomJournal/symptomJournalService');
const mockIdentity: { user: { id: string; activeUserId: string } | null } = {
  user: { id: 'owner', activeUserId: 'owner' },
};
const mockSetLanguage = jest.fn();
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => mockIdentity }));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'Asia/Shanghai',
    setLanguage: mockSetLanguage,
  }),
}));
const raw = '  🧪 é\n右侧太阳穴头痛  强度4/10\n';
function preview(text = raw): SymptomParsePreview {
  const start = text.indexOf('头痛');
  return symptomParsePreviewSchema.parse({
    raw_text: text,
    suggestions: {
      symptom_name: {
        value: '头痛',
        status: 'explicit',
        reason: 'dictionary_match',
        evidence: [{ start, end: start + 2 }],
      },
      severity: {
        value: 4,
        status: 'explicit',
        reason: 'explicit_scale',
        evidence: [
          { start: text.indexOf('4/10'), end: text.indexOf('4/10') + 4 },
        ],
      },
    },
    candidates: [{ name: '头痛', evidence: { start, end: start + 2 } }],
    multiple_symptoms: false,
    warnings: [],
    parser_version: '1.0.0',
    dictionary_version: '1.0.0',
    reference_time: '2026-09-28T04:00:00.000Z',
    timezone: 'Asia/Shanghai',
    timezone_source: 'user_preference',
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(language = 'en') {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'healthpilot',
    resources: { en: { healthpilot: en }, 'zh-Hans': { healthpilot: zh } },
    interpolation: { escapeValue: false },
  });
  mockSetLanguage.mockImplementation((language: string) =>
    i18n.changeLanguage(language)
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const content = () => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <SymptomJournalPage />
      </QueryClientProvider>
    </I18nextProvider>
  );
  const result = render(content());
  fireEvent.click(
    screen.getByRole('button', {
      name: language === 'en' ? en.newEntry : zh.newEntry,
    })
  );
  return { ...result, i18n, client, refresh: () => result.rerender(content()) };
}
function field(key: string) {
  const element = document.getElementById(`journal-${key}`);
  if (!element) throw new Error(`Missing field ${key}`);
  return element;
}
const change = (key: string, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const parse = () =>
  fireEvent.click(screen.getByRole('button', { name: en.parser.parse }));
beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.user = { id: 'owner', activeUserId: 'owner' };
  jest
    .mocked(api.searchJournal)
    .mockResolvedValue({ entries: [], has_more: false });
  jest
    .mocked(api.parseJournalDraft)
    .mockImplementation(async ({ raw_text }) => preview(raw_text));
  jest
    .mocked(api.createJournalEntry)
    .mockResolvedValue({ id: 'synthetic' } as SymptomJournalEntry);
});
it('shows suggestions and locatable UTF-16 evidence without creating a record', async () => {
  await setup();
  change('raw', raw);
  parse();
  const panel = await screen.findByRole('region', { name: en.parser.preview });
  expect(field('symptom_name')).toHaveValue('头痛');
  expect(field('severity')).toHaveValue(4);
  expect(field('started_at')).toHaveValue('');
  expect(within(panel).getAllByText(en.parser.states.explicit)).toHaveLength(2);
  fireEvent.click(
    within(panel).getAllByRole('button', { name: en.parser.locate })[0]!
  );
  expect((field('raw') as HTMLTextAreaElement).selectionStart).toBe(
    raw.indexOf('头痛')
  );
  expect(api.createJournalEntry).not.toHaveBeenCalled();
  expect(api.updateJournalEntry).not.toHaveBeenCalled();
  expect(api.deleteJournalEntry).not.toHaveBeenCalled();
});
it('marks edits and cleared values as user-entered, preserving them on reparse', async () => {
  await setup();
  change('raw', raw);
  parse();
  await screen.findByRole('region', { name: en.parser.preview });
  change('symptom_name', 'Synthetic manual symptom');
  change('severity', '');
  parse();
  await screen.findByRole('region', { name: en.parser.preview });
  expect(field('symptom_name')).toHaveValue('Synthetic manual symptom');
  expect(field('severity')).toHaveValue(null);
  const article = screen.getByRole('article', { name: en.symptom_name });
  expect(within(article).getByText(en.parser.states.user)).toBeInTheDocument();
  expect(
    within(article).queryByText(en.parser.states.explicit)
  ).not.toBeInTheDocument();
});
it('raw changes immediately remove preview, evidence and automatic fields', async () => {
  await setup();
  change('raw', raw);
  parse();
  await screen.findByRole('region', { name: en.parser.preview });
  change('body_location', 'Synthetic manual site');
  change('raw', 'new synthetic words');
  expect(
    screen.queryByRole('region', { name: en.parser.preview })
  ).not.toBeInTheDocument();
  expect(field('symptom_name')).toHaveValue('');
  expect(field('severity')).toHaveValue(null);
  expect(field('body_location')).toHaveValue('Synthetic manual site');
  expect(api.createJournalEntry).not.toHaveBeenCalled();
});
it('ignores a late old response after a newer revision was parsed', async () => {
  const old = deferred<SymptomParsePreview>(),
    latest = deferred<SymptomParsePreview>();
  jest
    .mocked(api.parseJournalDraft)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  await setup();
  change('raw', raw);
  parse();
  change('raw', raw + ' new');
  parse();
  await act(async () => latest.resolve(preview(raw + ' new')));
  change('symptom_name', 'Manual after latest response');
  await act(async () => old.resolve(preview()));
  expect(field('raw')).toHaveValue(raw + ' new');
  expect(field('symptom_name')).toHaveValue('Manual after latest response');
});
it('does not overwrite fields edited before or during an in-flight parse', async () => {
  const response = deferred<SymptomParsePreview>();
  jest.mocked(api.parseJournalDraft).mockReturnValue(response.promise);
  await setup();
  change('raw', raw);
  change('symptom_name', 'Synthetic before');
  parse();
  change('severity', '7');
  await act(async () => response.resolve(preview()));
  expect(field('symptom_name')).toHaveValue('Synthetic before');
  expect(field('severity')).toHaveValue(7);
});
it('collapses repeated parse clicks and repeated save clicks', async () => {
  const parsing = deferred<SymptomParsePreview>(),
    saving = deferred<SymptomJournalEntry>();
  jest.mocked(api.parseJournalDraft).mockReturnValue(parsing.promise);
  jest.mocked(api.createJournalEntry).mockReturnValue(saving.promise);
  await setup();
  change('raw', raw);
  const button = screen.getByRole('button', { name: en.parser.parse });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(api.parseJournalDraft).toHaveBeenCalledTimes(1);
  await act(async () => parsing.resolve(preview()));
  change('started_at', '2026-09-28T10:00');
  const form = screen.getByRole('form', { name: en.newEntry });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(api.createJournalEntry).toHaveBeenCalledTimes(1));
  expect(api.createJournalEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      raw_text: raw,
      severity: 4,
      started_at: '2026-09-28T02:00:00.000Z',
      status: 'unknown',
    })
  );
  expect(
    jest.mocked(api.createJournalEntry).mock.calls[0]?.[0]
  ).not.toHaveProperty('parser_version');
  await act(async () =>
    saving.resolve({ id: 'synthetic' } as SymptomJournalEntry)
  );
});
it('requires an explicit start instead of quietly defaulting to now', async () => {
  await setup();
  change('raw', raw);
  change('symptom_name', 'Synthetic manual');
  fireEvent.submit(screen.getByRole('form', { name: en.newEntry }));
  expect(screen.getByText(en.parser.startRequired)).toBeInTheDocument();
  expect(api.createJournalEntry).not.toHaveBeenCalled();
});
it('keeps manual entry available after parser failure and preserves raw text exactly', async () => {
  jest
    .mocked(api.parseJournalDraft)
    .mockRejectedValue(new Error('Synthetic failure'));
  await setup();
  change('raw', raw);
  parse();
  await screen.findByText(en.parser.failed);
  expect(field('raw')).toHaveValue(raw);
  change('symptom_name', 'Unknown synthetic symptom');
  change('started_at', '2026-09-28T10:00');
  fireEvent.click(screen.getByRole('button', { name: en.parser.reviewSave }));
  await waitFor(() =>
    expect(api.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_text: raw,
        symptom_name: 'Unknown synthetic symptom',
        severity: null,
      })
    )
  );
});
it('warns about multiple symptoms and requires manual event selection', async () => {
  const result = preview();
  result.multiple_symptoms = true;
  result.suggestions = {};
  result.candidates.push({
    name: 'Synthetic nausea',
    evidence: { start: 0, end: 2 },
  });
  result.warnings = [{ code: 'multiple_symptoms', evidence: [] }];
  jest.mocked(api.parseJournalDraft).mockResolvedValue(result);
  await setup();
  change('raw', raw);
  parse();
  await screen.findByText(en.parser.warning.multiple_symptoms);
  expect(field('symptom_name')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Use Synthetic nausea' }));
  expect(field('symptom_name')).toHaveValue('Synthetic nausea');
  expect(field('severity')).toHaveValue(null);
  expect(api.createJournalEntry).not.toHaveBeenCalled();
});
it('shows no-match and ambiguity states without inventing fields', async () => {
  const result = preview();
  result.candidates = [];
  result.suggestions = {
    started_at: {
      status: 'needs_confirmation',
      reason: 'ambiguous',
      evidence: [],
    },
  };
  result.warnings = [
    { code: 'unrecognized_symptom', evidence: [] },
    { code: 'ambiguous_time', evidence: [] },
  ];
  jest.mocked(api.parseJournalDraft).mockResolvedValue(result);
  await setup();
  change('raw', raw);
  parse();
  await screen.findByText(en.parser.warning.unrecognized_symptom);
  expect(field('symptom_name')).toHaveValue('');
  expect(field('severity')).toHaveValue(null);
  expect(field('started_at')).toHaveValue('');
});
it('switches UI languages without altering original words, fields, or saving', async () => {
  await setup();
  change('raw', raw);
  parse();
  await screen.findByRole('region', { name: en.parser.preview });
  await act(async () =>
    fireEvent.change(screen.getByLabelText(en.language), {
      target: { value: 'zh-Hans' },
    })
  );
  expect(
    screen.getByRole('region', { name: zh.parser.preview })
  ).toBeInTheDocument();
  expect(field('raw')).toHaveValue(raw);
  expect(field('symptom_name')).toHaveValue('头痛');
  expect(api.createJournalEntry).not.toHaveBeenCalled();
});
it('discards only after explicit cancel confirmation and ignores the late response', async () => {
  const response = deferred<SymptomParsePreview>();
  jest.mocked(api.parseJournalDraft).mockReturnValue(response.promise);
  await setup();
  change('raw', raw);
  parse();
  fireEvent.click(screen.getByRole('button', { name: en.cancel }));
  expect(field('raw')).toHaveValue(raw);
  fireEvent.click(screen.getByRole('button', { name: en.parser.discard }));
  await act(async () => response.resolve(preview()));
  fireEvent.click(screen.getByRole('button', { name: en.newEntry }));
  expect(field('raw')).toHaveValue('');
  expect(
    screen.queryByRole('region', { name: en.parser.preview })
  ).not.toBeInTheDocument();
});
it.each(['logout', 'other-account', 'delegation'])(
  'clears draft and rejects delayed responses on %s',
  async (mode) => {
    const response = deferred<SymptomParsePreview>();
    jest.mocked(api.parseJournalDraft).mockReturnValue(response.promise);
    const view = await setup();
    change('raw', raw);
    parse();
    mockIdentity.user =
      mode === 'logout'
        ? null
        : mode === 'delegation'
          ? { id: 'owner', activeUserId: 'other' }
          : { id: 'other', activeUserId: 'other' };
    view.refresh();
    await act(async () => response.resolve(preview()));
    mockIdentity.user = { id: 'owner', activeUserId: 'owner' };
    view.refresh();
    fireEvent.click(screen.getByRole('button', { name: en.newEntry }));
    expect(field('raw')).toHaveValue('');
    expect(
      screen.queryByRole('region', { name: en.parser.preview })
    ).not.toBeInTheDocument();
    expect(api.createJournalEntry).not.toHaveBeenCalled();
  }
);
it('warns on refresh and releases its beforeunload handler after unmount', async () => {
  const view = await setup();
  change('raw', raw);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  view.unmount();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it('renders malicious words only as text and never persists the draft', async () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem');
  const malicious =
    '<script>window.hpInjected=true</script> **synthetic** [link](https://example.invalid) 🧪';
  const result = {
    ...preview(),
    raw_text: malicious,
    suggestions: {},
    candidates: [],
    warnings: [
      {
        code: 'unsupported_expression' as const,
        evidence: [{ start: 0, end: malicious.length }],
      },
    ],
  };
  jest.mocked(api.parseJournalDraft).mockResolvedValue(result);
  const view = await setup();
  change('raw', malicious);
  parse();
  await screen.findByRole('region', { name: en.parser.preview });
  expect(view.container.querySelector('script')).toBeNull();
  expect(
    view.container.querySelector('a[href="https://example.invalid"]')
  ).toBeNull();
  expect(storage).not.toHaveBeenCalled();
  expect(window.location.href).not.toContain('synthetic');
  storage.mockRestore();
});
