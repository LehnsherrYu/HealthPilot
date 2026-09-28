import { z } from "zod";

export const symptomJournalStatusSchema = z.enum([
  "ongoing",
  "resolved",
  "unknown",
]);

export const symptomJournalFieldsSchema = z.object({
  symptom_name: z.string().trim().min(1).max(200),
  body_location: z.string().trim().max(120).nullable(),
  severity: z.number().int().min(0).max(10).nullable(),
  started_at: z.iso.datetime({ offset: true }),
  ended_at: z.iso.datetime({ offset: true }).nullable(),
  status: symptomJournalStatusSchema,
  triggers: z.string().max(2000).nullable(),
  relieving_factors: z.string().max(2000).nullable(),
  notes: z.string().max(5000).nullable(),
});

export const symptomJournalRawTextSchema = z
  .string()
  .max(10000)
  .refine((value) => value.trim().length > 0, {
    message: "Original text is required",
  });

export const healthpilotSymptomJournalSchema =
  symptomJournalFieldsSchema.extend({
    id: z.uuid(),
    user_id: z.uuid(),
    raw_text: symptomJournalRawTextSchema,
    version: z.number().int().positive(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  });

export type SymptomJournalEntry = z.infer<
  typeof healthpilotSymptomJournalSchema
>;
