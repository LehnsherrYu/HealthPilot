import type { Request } from 'express';

export function isSymptomJournalRequest(
  req: Pick<Request, 'originalUrl'>
): boolean {
  let pathname = (req.originalUrl ?? '').split('?')[0] ?? '';
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* Keep malformed paths private too. */
  }
  // Include misspelled suffixes and encoded subpaths in privacy handling.
  return /^\/api\/v2\/symptom-journal/i.test(pathname);
}
export function safeRequestPath(
  req: Pick<Request, 'originalUrl' | 'path'>
): string {
  return isSymptomJournalRequest(req) ? '/api/v2/symptom-journal' : req.path;
}
