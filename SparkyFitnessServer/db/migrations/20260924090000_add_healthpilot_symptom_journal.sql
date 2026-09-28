-- HealthPilot's private journal is deliberately separate from medication symptoms.
CREATE TABLE public.healthpilot_symptom_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL CHECK (length(btrim(raw_text, E' \t\n\r')) BETWEEN 1 AND 10000),
  symptom_name TEXT NOT NULL CHECK (length(btrim(symptom_name)) BETWEEN 1 AND 200),
  body_location TEXT CHECK (length(body_location) <= 120),
  severity SMALLINT CHECK (severity BETWEEN 0 AND 10),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('ongoing', 'resolved', 'unknown')),
  triggers TEXT CHECK (length(triggers) <= 2000),
  relieving_factors TEXT CHECK (length(relieving_factors) <= 2000),
  notes TEXT CHECK (length(notes) <= 5000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT symptom_journal_timing CHECK (
    (status = 'resolved' AND ended_at IS NOT NULL AND ended_at >= started_at)
    OR (status IN ('ongoing', 'unknown') AND ended_at IS NULL)
  )
);
CREATE INDEX healthpilot_symptom_journal_owner_time_idx
  ON public.healthpilot_symptom_journal (user_id, started_at DESC, id DESC);
-- Fail closed even before the startup policy pass runs.
ALTER TABLE public.healthpilot_symptom_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healthpilot_symptom_journal FORCE ROW LEVEL SECURITY;
