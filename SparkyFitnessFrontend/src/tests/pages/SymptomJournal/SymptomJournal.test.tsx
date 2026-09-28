import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import SymptomJournalPage from '@/pages/SymptomJournal/SymptomJournalPage';
import * as api from '@/api/SymptomJournal/symptomJournalService';
import en from '@/locales/healthpilot/en.json';
import zh from '@/locales/healthpilot/zh.json';
import type { SymptomJournalEntry } from '@workspace/shared';
jest.mock('@/api/SymptomJournal/symptomJournalService');
const mockSetLanguage = jest.fn();
const mockUser = { id: 'owner', activeUserId: 'owner' };
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'Asia/Shanghai',
    setLanguage: mockSetLanguage,
  }),
}));
const entry: SymptomJournalEntry = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  raw_text: '  synthetic original\n',
  symptom_name: 'Synthetic headache',
  body_location: 'head',
  severity: 0,
  started_at: '2026-09-24T01:30:00Z',
  ended_at: null,
  status: 'ongoing',
  triggers: null,
  relieving_factors: null,
  notes: null,
  version: 1,
  created_at: '2026-09-24T01:30:00Z',
  updated_at: '2026-09-24T01:30:00Z',
};
async function setup(language = 'en') {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'healthpilot',
    resources: { en: { healthpilot: en }, 'zh-Hans': { healthpilot: zh } },
    interpolation: { escapeValue: false },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <SymptomJournalPage />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockUser.activeUserId = 'owner';
  window.scrollTo = jest.fn();
  jest
    .mocked(api.searchJournal)
    .mockResolvedValue({ entries: [entry], has_more: false });
  jest.mocked(api.createJournalEntry).mockResolvedValue(entry);
  jest
    .mocked(api.updateJournalEntry)
    .mockResolvedValue({ ...entry, version: 2 });
  jest.mocked(api.deleteJournalEntry).mockResolvedValue(undefined);
});
it('does not fetch or display records when switched to another profile', async () => {
  mockUser.activeUserId = 'family';
  await setup();
  expect(screen.getByText(en.ownerOnly)).toBeInTheDocument();
  expect(api.searchJournal).not.toHaveBeenCalled();
});
it('creates with exact original text, timezone conversion and unknown severity', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: en.newEntry }));
  const form = screen.getByRole('form', { name: en.newEntry });
  fireEvent.change(within(form).getByLabelText(/Your original words/), {
    target: { value: entry.raw_text },
  });
  fireEvent.change(within(form).getByLabelText(/Symptom name/), {
    target: { value: 'Synthetic headache' },
  });
  fireEvent.change(within(form).getByLabelText(/Started at/), {
    target: { value: '2026-09-24T09:30' },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(api.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_text: entry.raw_text,
        started_at: '2026-09-24T01:30:00.000Z',
        severity: null,
      })
    )
  );
  expect(await screen.findByText(en.saved)).toBeInTheDocument();
});
it('keeps the form and original text after save failure', async () => {
  jest
    .mocked(api.createJournalEntry)
    .mockRejectedValue(new Error('Journal request failed.'));
  await setup();
  fireEvent.click(screen.getByRole('button', { name: en.newEntry }));
  const form = screen.getByRole('form', { name: en.newEntry });
  fireEvent.change(within(form).getByLabelText(/Your original words/), {
    target: { value: entry.raw_text },
  });
  fireEvent.change(within(form).getByLabelText(/Symptom name/), {
    target: { value: 'Synthetic headache' },
  });
  fireEvent.change(within(form).getByLabelText(/Started at/), {
    target: { value: '2026-09-24T09:30' },
  });
  fireEvent.submit(form);
  expect(await screen.findByText(en.saveError)).toBeInTheDocument();
  expect(within(form).getByLabelText(/Your original words/)).toHaveValue(
    entry.raw_text
  );
});
it('edits structured data while preserving raw text and version, validating end times', async () => {
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: en.edit }));
  const form = screen.getByRole('form', { name: en.editEntry });
  expect(within(form).getByLabelText(/Your original words/)).toHaveAttribute(
    'readonly'
  );
  fireEvent.change(within(form).getByLabelText(en.status), {
    target: { value: 'resolved' },
  });
  fireEvent.change(within(form).getByLabelText(/Ended at/), {
    target: { value: '2026-09-24T08:30' },
  });
  fireEvent.submit(form);
  expect(screen.getByText(en.invalid)).toBeInTheDocument();
  expect(api.updateJournalEntry).not.toHaveBeenCalled();
  fireEvent.change(within(form).getByLabelText(/Ended at/), {
    target: { value: '2026-09-24T10:30' },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(api.updateJournalEntry).toHaveBeenCalledWith(
      entry.id,
      expect.objectContaining({
        version: 1,
        status: 'resolved',
        ended_at: '2026-09-24T02:30:00.000Z',
      })
    )
  );
  expect(
    jest.mocked(api.updateJournalEntry).mock.calls[0]?.[1]
  ).not.toHaveProperty('raw_text');
});
it('requires explicit confirmation to delete', async () => {
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: en.delete }));
  expect(api.deleteJournalEntry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: en.cancel }));
  expect(api.deleteJournalEntry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: en.delete }));
  fireEvent.click(screen.getByRole('button', { name: en.confirmDelete }));
  await waitFor(() =>
    expect(api.deleteJournalEntry).toHaveBeenCalledWith(entry.id, 1)
  );
  expect(await screen.findByText(en.deleted)).toBeInTheDocument();
});
it('applies filters only on submit, clears them and renders Chinese empty state', async () => {
  jest
    .mocked(api.searchJournal)
    .mockResolvedValue({ entries: [], has_more: false });
  await setup('zh-Hans');
  expect(await screen.findByText(zh.empty)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(zh.symptom_name), {
    target: { value: '合成筛选' },
  });
  expect(api.searchJournal).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: zh.filter }));
  await waitFor(() =>
    expect(api.searchJournal).toHaveBeenLastCalledWith(
      expect.objectContaining({ symptom_name: '合成筛选', offset: 0 })
    )
  );
  fireEvent.click(screen.getByRole('button', { name: zh.reset }));
  expect(screen.getByLabelText(zh.symptom_name)).toHaveValue('');
});
it('shows a retry action on list errors', async () => {
  jest
    .mocked(api.searchJournal)
    .mockRejectedValueOnce(new Error('Journal request failed.'));
  await setup();
  expect(await screen.findByText(en.loadError)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: en.retry }));
  expect(await screen.findByText(entry.symptom_name)).toBeInTheDocument();
});
it('keeps both translation resources in sync', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
});

it('uses the supported Chinese locale through preferences when switching languages', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText(en.language), {
    target: { value: 'zh-Hans' },
  });
  expect(mockSetLanguage).toHaveBeenCalledWith('zh-Hans');
});

it('refreshes stale versions after a delete conflict so reopening can succeed', async () => {
  jest.mocked(api.deleteJournalEntry).mockRejectedValueOnce(
    Object.assign(new Error('Journal request failed.'), {
      code: 'VERSION_CONFLICT',
    })
  );
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: en.delete }));
  jest.mocked(api.searchJournal).mockResolvedValue({
    entries: [{ ...entry, version: 2 }],
    has_more: false,
  });
  fireEvent.click(screen.getByRole('button', { name: en.confirmDelete }));
  expect(await screen.findByText(en.conflict)).toBeInTheDocument();
  await waitFor(() => expect(api.searchJournal).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: en.cancel }));
  fireEvent.click(screen.getByRole('button', { name: en.delete }));
  fireEvent.click(screen.getByRole('button', { name: en.confirmDelete }));
  await waitFor(() =>
    expect(api.deleteJournalEntry).toHaveBeenLastCalledWith(entry.id, 2)
  );
});
