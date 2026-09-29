import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createSymptomJournalSchema,
  updateSymptomJournalSchema,
  localTimeCandidates,
  utcToLocalDateTimeInput,
  type SymptomJournalEntry,
  type CreateSymptomJournal,
  type UpdateSymptomJournal,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSymptomParserDraft } from '@/hooks/SymptomJournal/useSymptomParserDraft';
import SymptomParserPreview from './SymptomParserPreview';
import UnsavedJournalGuard from './UnsavedJournalGuard';

interface Props {
  entry?: SymptomJournalEntry;
  timezone: string;
  pending: boolean;
  error: string;
  onSave: (body: CreateSymptomJournal | UpdateSymptomJournal) => Promise<void>;
  onCancel: () => void;
}
export default function SymptomJournalForm({
  entry,
  timezone,
  pending,
  error,
  onSave,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation('healthpilot');
  const {
    fields,
    update,
    parse,
    preview,
    parsing,
    parseError,
    dirty,
    manualFields,
  } = useSymptomParserDraft(timezone, entry);
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fieldStatus = (key: keyof typeof fields) =>
    !entry && manualFields.has(key) ? (
      <span className="ml-2 text-xs text-muted-foreground">
        {t('parser.states.user')}
      </span>
    ) : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || pending || parsing) return;
    setValidation('');
    const instant = (local: string, original?: string | null) => {
      if (original && utcToLocalDateTimeInput(original, timezone) === local)
        return original;
      const candidates = localTimeCandidates(local, timezone);
      if (candidates.length !== 1) throw new Error('invalidTime');
      return candidates[0]!;
    };
    if (!fields.started_at) {
      setValidation(t('parser.startRequired'));
      return;
    }
    try {
      const data = {
        symptom_name: fields.symptom_name,
        body_location: fields.body_location || null,
        severity: fields.severity === '' ? null : Number(fields.severity),
        started_at: instant(fields.started_at, entry?.started_at),
        ended_at:
          fields.status === 'resolved' && fields.ended_at
            ? instant(fields.ended_at, entry?.ended_at)
            : null,
        status: fields.status,
        triggers: fields.triggers || null,
        relieving_factors: fields.relieving_factors || null,
        notes: fields.notes || null,
      };
      const parsed = entry
        ? updateSymptomJournalSchema.safeParse({
            ...data,
            version: entry.version,
          })
        : createSymptomJournalSchema.safeParse({
            ...data,
            raw_text: fields.raw_text,
          });
      if (!parsed.success) {
        setValidation(t('invalid'));
        return;
      }
      saveLock.current = true;
      setSaving(true);
      try {
        await onSave(parsed.data);
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    } catch {
      setValidation(t('invalidTime'));
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4"
      aria-label={entry ? t('editEntry') : t('newEntry')}
    >
      <h2 className="text-xl font-semibold">
        {entry ? t('editEntry') : t('newEntry')}
      </h2>
      <UnsavedJournalGuard dirty={dirty && !saving && !pending} />
      <fieldset disabled={pending || saving} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="journal-raw">{t('raw_text')} *</Label>
          <Textarea
            id="journal-raw"
            required
            maxLength={10000}
            rows={4}
            value={fields.raw_text}
            readOnly={!!entry}
            onChange={(e) => update('raw_text', e.target.value)}
            aria-describedby="journal-original-hint"
          />
          <p
            id="journal-original-hint"
            className="text-sm text-muted-foreground"
          >
            {t('originalHint')}
          </p>
        </div>
        {!entry && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('parser.manualHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={parsing || !fields.raw_text.trim()}
              onClick={() =>
                void parse(i18n.language.startsWith('zh') ? 'zh' : 'en')
              }
            >
              {t(parsing ? 'parser.parsing' : 'parser.parse')}
            </Button>
            {parsing && <p role="status">{t('parser.parsing')}</p>}
            {parseError && (
              <p role="alert" className="text-destructive">
                {t('parser.failed')}
              </p>
            )}
            {preview && (
              <SymptomParserPreview
                preview={preview}
                fields={fields}
                manualFields={manualFields}
                onChooseSymptom={(name) => update('symptom_name', name)}
              />
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            ['symptom_name', 'body_location', 'severity', 'started_at'] as const
          ).map((key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`journal-${key}`}>
                {t(key)}
                {fieldStatus(key)}
                {key === 'symptom_name' || key === 'started_at' ? ' *' : ''}
              </Label>
              <Input
                id={`journal-${key}`}
                type={
                  key === 'severity'
                    ? 'number'
                    : key === 'started_at'
                      ? 'datetime-local'
                      : 'text'
                }
                required={key === 'symptom_name' || key === 'started_at'}
                min={key === 'severity' ? 0 : undefined}
                max={key === 'severity' ? 10 : undefined}
                maxLength={
                  key === 'symptom_name'
                    ? 200
                    : key === 'body_location'
                      ? 120
                      : undefined
                }
                value={fields[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="journal-status">
              {t('status')}
              {fieldStatus('status')}
            </Label>
            <select
              id="journal-status"
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={fields.status}
              onChange={(e) => update('status', e.target.value)}
            >
              {(['ongoing', 'resolved', 'unknown'] as const).map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </div>
          {fields.status === 'resolved' && (
            <div className="space-y-2">
              <Label htmlFor="journal-ended_at">
                {t('ended_at')} *{fieldStatus('ended_at')}
              </Label>
              <Input
                id="journal-ended_at"
                type="datetime-local"
                required
                value={fields.ended_at}
                onChange={(e) => update('ended_at', e.target.value)}
              />
            </div>
          )}
        </div>
        {(['triggers', 'relieving_factors', 'notes'] as const).map((key) => (
          <div className="space-y-2" key={key}>
            <Label htmlFor={`journal-${key}`}>
              {t(key)}
              {fieldStatus(key)}
            </Label>
            <Textarea
              id={`journal-${key}`}
              maxLength={key === 'notes' ? 5000 : 2000}
              value={fields[key]}
              onChange={(e) => update(key, e.target.value)}
            />
          </div>
        ))}
      </fieldset>
      {(validation || error) && (
        <p role="alert" className="text-destructive">
          {validation || error}
        </p>
      )}
      {confirmCancel && (
        <div
          role="alertdialog"
          aria-label={t('parser.leaveTitle')}
          className="space-y-3 rounded border p-4"
        >
          <p>{t('parser.leaveHint')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmCancel(false)}
          >
            {t('parser.stay')}
          </Button>{' '}
          <Button type="button" onClick={onCancel}>
            {t('parser.discard')}
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || saving || parsing}>
          {t(
            pending || saving ? 'saving' : entry ? 'save' : 'parser.reviewSave'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || saving}
          onClick={() => (dirty ? setConfirmCancel(true) : onCancel())}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
