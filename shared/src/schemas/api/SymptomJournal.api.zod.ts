import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";
import {
  healthpilotSymptomJournalSchema,
  symptomJournalFieldsSchema,
  symptomJournalRawTextSchema,
  symptomJournalStatusSchema,
} from "../database/HealthpilotSymptomJournal.zod.ts";

type EventTiming = z.infer<typeof symptomJournalFieldsSchema>;
function validEventTiming(value: EventTiming): boolean {
  return value.status === "resolved"
    ? value.ended_at !== null &&
        Date.parse(value.ended_at) >= Date.parse(value.started_at)
    : value.ended_at === null;
}
const timingError = { message: "Invalid event timing", path: ["ended_at"] };

export const createSymptomJournalSchema = symptomJournalFieldsSchema
  .extend({
    raw_text: symptomJournalRawTextSchema,
  })
  .strict()
  .refine(validEventTiming, timingError);

export const updateSymptomJournalSchema = symptomJournalFieldsSchema
  .extend({
    version: z.number().int().positive(),
  })
  .strict()
  .refine(validEventTiming, timingError);

const day = z.string().refine(isDayString, "Expected YYYY-MM-DD");
export const searchSymptomJournalSchema = z
  .object({
    symptom_name: z.string().trim().max(200).optional(),
    body_location: z.string().trim().max(120).optional(),
    status: symptomJournalStatusSchema.optional(),
    from: day.optional(),
    to: day.optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Invalid date range",
    path: ["to"],
  });

export const symptomJournalPageSchema = z.object({
  entries: z.array(healthpilotSymptomJournalSchema),
  has_more: z.boolean(),
});
export type CreateSymptomJournal = z.infer<typeof createSymptomJournalSchema>;
export type UpdateSymptomJournal = z.infer<typeof updateSymptomJournalSchema>;
export type SearchSymptomJournal = z.infer<typeof searchSymptomJournalSchema>;
export type SymptomJournalPage = z.infer<typeof symptomJournalPageSchema>;
