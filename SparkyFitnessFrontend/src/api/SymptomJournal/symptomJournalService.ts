import { apiCall } from '@/api/api';
import {
  healthpilotSymptomJournalSchema,
  symptomParseRequestSchema,
  symptomParsePreviewSchema,
  type SymptomParseRequest,
  symptomJournalPageSchema,
  type CreateSymptomJournal,
  type UpdateSymptomJournal,
  type SearchSymptomJournal,
} from '@workspace/shared';
const base = '/v2/symptom-journal';
async function entryCall(
  path: string,
  method: string,
  body: CreateSymptomJournal | UpdateSymptomJournal
) {
  const result = healthpilotSymptomJournalSchema.safeParse(
    await apiCall<unknown>(path, { method, body })
  );
  if (!result.success) throw new Error('Invalid journal response.');
  return result.data;
}
export async function searchJournal(filters: SearchSymptomJournal) {
  const result = symptomJournalPageSchema.safeParse(
    await apiCall<unknown>(`${base}/search`, { method: 'POST', body: filters })
  );
  if (!result.success) throw new Error('Invalid journal response.');
  return result.data;
}
export const createJournalEntry = (body: CreateSymptomJournal) =>
  entryCall(base, 'POST', body);
export const updateJournalEntry = (id: string, body: UpdateSymptomJournal) =>
  entryCall(`${base}/${id}`, 'PUT', body);
export async function deleteJournalEntry(
  id: string,
  version: number
): Promise<void> {
  await apiCall<unknown>(`${base}/${id}`, {
    method: 'DELETE',
    params: { version },
  });
}

export async function parseJournalDraft(
  input: SymptomParseRequest,
  signal?: AbortSignal
) {
  const request = symptomParseRequestSchema.safeParse(input);
  if (!request.success) throw new Error('Invalid parser request.');
  const result = symptomParsePreviewSchema.safeParse(
    await apiCall<unknown>(`${base}/parse`, {
      method: 'POST',
      body: request.data,
      signal,
      cache: 'no-store',
    })
  );
  if (!result.success || result.data.raw_text !== input.raw_text)
    throw new Error('Invalid parser response.');
  return result.data;
}
