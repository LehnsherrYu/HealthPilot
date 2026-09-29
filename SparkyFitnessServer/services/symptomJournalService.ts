import {
  dayToUtcRange,
  type CreateSymptomJournal,
  type SymptomParseRequest,
  type UpdateSymptomJournal,
  type SearchSymptomJournal,
} from '@workspace/shared';
import repository from '../models/symptomJournalRepository.js';
import {
  loadUserTimezone,
  loadUserTimezoneContext,
} from '../utils/timezoneLoader.js';
import { parseSymptomText } from './symptomParser/parser.js';

export class SymptomJournalError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
  }
}
function assertOwner(owner: string, actor: string): void {
  if (!owner || !actor || owner !== actor)
    throw new SymptomJournalError(403, 'OWNER_ONLY');
}
async function search(
  owner: string,
  actor: string,
  filters: SearchSymptomJournal
) {
  assertOwner(owner, actor);
  const timezone = await loadUserTimezone(owner);
  return repository.search(
    owner,
    actor,
    filters,
    filters.from ? dayToUtcRange(filters.from, timezone).start : null,
    filters.to ? dayToUtcRange(filters.to, timezone).end : null
  );
}
async function create(
  owner: string,
  actor: string,
  data: CreateSymptomJournal
) {
  assertOwner(owner, actor);
  return repository.create(owner, actor, data);
}
async function get(owner: string, actor: string, id: string) {
  assertOwner(owner, actor);
  const entry = await repository.get(owner, actor, id);
  if (!entry) throw new SymptomJournalError(404, 'NOT_FOUND');
  return entry;
}
async function mutate(
  owner: string,
  actor: string,
  id: string,
  version: number,
  data?: UpdateSymptomJournal
) {
  assertOwner(owner, actor);
  const entry = await repository.mutate(owner, actor, id, version, data);
  if (entry === 'missing') throw new SymptomJournalError(404, 'NOT_FOUND');
  if (entry === 'conflict')
    throw new SymptomJournalError(409, 'VERSION_CONFLICT');
  return entry;
}
async function parse(owner: string, actor: string, input: SymptomParseRequest) {
  assertOwner(owner, actor);
  const reference_time = new Date().toISOString();
  const context = await loadUserTimezoneContext(owner);
  return parseSymptomText(input, { ...context, reference_time });
}
export default { search, create, get, mutate, parse };
