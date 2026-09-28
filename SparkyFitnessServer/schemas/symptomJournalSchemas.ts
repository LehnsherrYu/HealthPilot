import { z } from 'zod';
export {
  createSymptomJournalSchema,
  updateSymptomJournalSchema,
  searchSymptomJournalSchema,
} from '@workspace/shared';
export const symptomJournalIdSchema = z.object({ id: z.uuid() }).strict();
export const symptomJournalVersionSchema = z
  .object({
    version: z.coerce.number().int().positive(),
  })
  .strict();
