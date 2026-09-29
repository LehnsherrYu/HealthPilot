import { useEffect, useRef, useState } from 'react';
import {
  utcToLocalDateTimeInput,
  type SymptomJournalEntry,
  type SymptomParsePreview,
  type SymptomParseField,
} from '@workspace/shared';
import { parseJournalDraft } from '@/api/SymptomJournal/symptomJournalService';

export interface JournalDraftFields {
  raw_text: string;
  symptom_name: string;
  body_location: string;
  severity: string;
  started_at: string;
  ended_at: string;
  status: string;
  triggers: string;
  relieving_factors: string;
  notes: string;
}
const blank: JournalDraftFields = {
  raw_text: '',
  symptom_name: '',
  body_location: '',
  severity: '',
  started_at: '',
  ended_at: '',
  status: 'unknown',
  triggers: '',
  relieving_factors: '',
  notes: '',
};

// Component memory only: no query/mutation cache, retries, URLs, storage or offline queue.
export function useSymptomParserDraft(
  timezone: string,
  entry?: SymptomJournalEntry
) {
  const [fields, setFields] = useState<JournalDraftFields>(() =>
    entry
      ? {
          raw_text: entry.raw_text,
          symptom_name: entry.symptom_name,
          body_location: entry.body_location ?? '',
          severity: entry.severity?.toString() ?? '',
          started_at: utcToLocalDateTimeInput(entry.started_at, timezone),
          ended_at: entry.ended_at
            ? utcToLocalDateTimeInput(entry.ended_at, timezone)
            : '',
          status: entry.status,
          triggers: entry.triggers ?? '',
          relieving_factors: entry.relieving_factors ?? '',
          notes: entry.notes ?? '',
        }
      : { ...blank }
  );
  const fieldsRef = useRef(fields);
  const manual = useRef(new Set<keyof JournalDraftFields>());
  const revision = useRef(0);
  const sequence = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<SymptomParsePreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    alive.current = true;
    const requestSequence = sequence;
    return () => {
      alive.current = false;
      requestSequence.current++;
      controller.current?.abort();
    };
  }, []);
  function replace(next: JournalDraftFields) {
    fieldsRef.current = next;
    setFields(next);
  }
  function clearAutomatic(current: JournalDraftFields) {
    const next = { ...current };
    for (const field of Object.keys(blank) as Array<keyof JournalDraftFields>) {
      if (field !== 'raw_text' && !manual.current.has(field))
        next[field] = blank[field];
    }
    return next;
  }
  function update(key: keyof JournalDraftFields, value: string) {
    let next = { ...fieldsRef.current, [key]: value };
    if (key === 'raw_text') {
      revision.current++;
      sequence.current++;
      controller.current?.abort();
      busy.current = false;
      setParsing(false);
      setParseError(false);
      setPreview(null);
      next = clearAutomatic(next);
    } else {
      manual.current.add(key);
      if (key === 'status' && value !== 'resolved') {
        next.ended_at = '';
        manual.current.add('ended_at');
      }
    }
    setDirty(true);
    replace(next);
  }
  async function parse(locale: 'en' | 'zh') {
    if (entry || busy.current || !fieldsRef.current.raw_text.trim()) return;
    const requestRevision = revision.current;
    const requestSequence = ++sequence.current;
    const raw = fieldsRef.current.raw_text;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    busy.current = true;
    setParsing(true);
    setParseError(false);
    setPreview(null);
    replace(clearAutomatic(fieldsRef.current));
    try {
      const result = await parseJournalDraft(
        { raw_text: raw, locale },
        requestController.signal
      );
      if (
        !alive.current ||
        requestRevision !== revision.current ||
        requestSequence !== sequence.current
      )
        return;
      const next = clearAutomatic(fieldsRef.current);
      for (const [key, suggestion] of Object.entries(result.suggestions)) {
        const field = key as SymptomParseField;
        if (manual.current.has(field) || suggestion.value === undefined)
          continue;
        next[field] =
          field === 'started_at' || field === 'ended_at'
            ? utcToLocalDateTimeInput(String(suggestion.value), timezone)
            : String(suggestion.value);
      }
      // A manually chosen status controls whether an end time belongs in this event.
      if (next.status !== 'resolved') next.ended_at = '';
      replace(next);
      setPreview(result);
    } catch {
      if (
        alive.current &&
        requestRevision === revision.current &&
        requestSequence === sequence.current
      )
        setParseError(true);
    } finally {
      if (alive.current && requestSequence === sequence.current) {
        busy.current = false;
        setParsing(false);
      }
    }
  }
  return {
    fields,
    update,
    parse,
    preview,
    parsing,
    parseError,
    dirty,
    manualFields: manual.current,
  };
}
