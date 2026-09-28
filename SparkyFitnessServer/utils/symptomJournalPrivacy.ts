import type { Request } from 'express';

export function isSymptomJournalRequest(
  req: Pick<Request, 'originalUrl'>
): boolean {
  return /^\/api\/v2\/symptom-journal(?:[/?]|$)/i.test(req.originalUrl);
}
export function safeRequestPath(
  req: Pick<Request, 'originalUrl' | 'path'>
): string {
  return isSymptomJournalRequest(req) ? '/api/v2/symptom-journal' : req.path;
}
