import { z } from "zod";
import { isValidTimeZone } from "../../utils/timezone.ts";
import { symptomJournalRawTextSchema } from "../database/HealthpilotSymptomJournal.zod.ts";

export const symptomParseFields = [
  "symptom_name",
  "body_location",
  "severity",
  "started_at",
  "ended_at",
  "status",
  "triggers",
  "relieving_factors",
] as const;

export const symptomParseRequestSchema = z
  .object({
    raw_text: symptomJournalRawTextSchema,
    locale: z.enum(["en", "zh"]),
  })
  .strict();

// JavaScript UTF-16 code units; never code points, bytes or grapheme indexes.
const evidenceSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .strict()
  .refine((span) => span.end >= span.start, "Invalid evidence range");

const reasonSchema = z.enum([
  "dictionary_match",
  "explicit_scale",
  "explicit_start",
  "explicit_end",
  "explicit_status",
  "described_trigger",
  "described_relief",
  "no_match",
  "ambiguous",
  "multiple_candidates",
]);
function suggestion<T extends z.ZodType>(value: T) {
  return z
    .object({
      value: value.optional(),
      status: z.enum(["explicit", "needs_confirmation", "unrecognized"]),
      reason: reasonSchema,
      evidence: z.array(evidenceSchema).max(16),
    })
    .strict()
    .superRefine((item, ctx) => {
      if (
        item.status === "explicit" &&
        (item.value === undefined || !item.evidence.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "Explicit suggestions require value and evidence",
        });
      if (item.status !== "explicit" && item.value !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "Unconfirmed suggestions cannot supply a value",
        });
    });
}
const warningsSchema = z
  .object({
    code: z.enum([
      "unrecognized_symptom",
      "negated_symptom",
      "non_self_subject",
      "hypothetical",
      "multiple_symptoms",
      "ambiguous_time",
      "duration_only",
      "timezone_unconfirmed",
      "nonexistent_local_time",
      "ambiguous_local_time",
      "invalid_severity",
      "conflicting_values",
      "unsupported_expression",
      "candidate_limit",
    ]),
    evidence: z.array(evidenceSchema).max(16),
  })
  .strict();

export const symptomParsePreviewSchema = z
  .object({
    raw_text: symptomJournalRawTextSchema,
    suggestions: z
      .object({
        symptom_name: suggestion(z.string().min(1).max(200)).optional(),
        body_location: suggestion(z.string().min(1).max(120)).optional(),
        severity: suggestion(z.number().int().min(0).max(10)).optional(),
        started_at: suggestion(z.iso.datetime({ offset: true })).optional(),
        ended_at: suggestion(z.iso.datetime({ offset: true })).optional(),
        status: suggestion(z.enum(["ongoing", "resolved"])).optional(),
        triggers: suggestion(z.string().min(1).max(2000)).optional(),
        relieving_factors: suggestion(z.string().min(1).max(2000)).optional(),
      })
      .strict(),
    candidates: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            evidence: evidenceSchema,
          })
          .strict(),
      )
      .max(12),
    multiple_symptoms: z.boolean(),
    warnings: z.array(warningsSchema).max(24),
    parser_version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
    dictionary_version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
    reference_time: z.iso.datetime({ offset: true }),
    timezone: z.string().max(100).refine(isValidTimeZone).nullable(),
    timezone_source: z.enum(["user_preference", "unconfirmed"]),
  })
  .strict()
  .superRefine((preview, ctx) => {
    const evidence = [
      ...Object.values(preview.suggestions).flatMap((item) => item.evidence),
      ...preview.candidates.map((item) => item.evidence),
      ...preview.warnings.flatMap((item) => item.evidence),
    ];
    if (evidence.some((span) => span.end > preview.raw_text.length))
      ctx.addIssue({
        code: "custom",
        message: "Evidence outside original text",
      });
    if (
      (preview.timezone_source === "unconfirmed") !==
      (preview.timezone === null)
    )
      ctx.addIssue({ code: "custom", message: "Invalid timezone provenance" });
    if (preview.multiple_symptoms !== preview.candidates.length > 1)
      ctx.addIssue({ code: "custom", message: "Invalid candidate count" });
    if (
      preview.multiple_symptoms &&
      Object.values(preview.suggestions).some(
        (item) => item.value !== undefined,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Multiple symptoms require manual event selection",
      });
  });

export type SymptomParseRequest = z.infer<typeof symptomParseRequestSchema>;
export type SymptomParsePreview = z.infer<typeof symptomParsePreviewSchema>;
export type SymptomParseField = (typeof symptomParseFields)[number];
export type SymptomParseEvidence = z.infer<typeof evidenceSchema>;
export type SymptomParseWarning = z.infer<typeof warningsSchema>;
