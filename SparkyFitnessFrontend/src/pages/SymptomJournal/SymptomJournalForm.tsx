import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createSymptomJournalSchema,
  updateSymptomJournalSchema,
  localDateTimeToUtc,
  utcToLocalDateTimeInput,
  type SymptomJournalEntry,
  type CreateSymptomJournal,
  type UpdateSymptomJournal,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  entry?: SymptomJournalEntry;
  timezone: string;
  pending: boolean;
  error: string;
  onSave: (body: CreateSymptomJournal | UpdateSymptomJournal) => void;
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
  const { t } = useTranslation('healthpilot');
  const [fields, setFields] = useState(() => ({
    raw_text: entry?.raw_text ?? '',
    symptom_name: entry?.symptom_name ?? '',
    body_location: entry?.body_location ?? '',
    severity: entry?.severity?.toString() ?? '',
    started_at: utcToLocalDateTimeInput(
      entry?.started_at ?? new Date().toISOString(),
      timezone
    ),
    ended_at: entry?.ended_at
      ? utcToLocalDateTimeInput(entry.ended_at, timezone)
      : '',
    status: entry?.status ?? 'ongoing',
    triggers: entry?.triggers ?? '',
    relieving_factors: entry?.relieving_factors ?? '',
    notes: entry?.notes ?? '',
  }));
  const [validation, setValidation] = useState('');
  const update = (key: keyof typeof fields, value: string) =>
    setFields((old) => ({ ...old, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation('');
    const instant = (local: string, original?: string | null) => {
      if (original && utcToLocalDateTimeInput(original, timezone) === local)
        return original;
      const result = localDateTimeToUtc(local, timezone);
      if (
        Number.isNaN(result.getTime()) ||
        utcToLocalDateTimeInput(result.toISOString(), timezone) !== local
      )
        throw new Error('invalidTime');
      return result.toISOString();
    };
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
      onSave(parsed.data);
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
      <fieldset disabled={pending} className="space-y-4">
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
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            ['symptom_name', 'body_location', 'severity', 'started_at'] as const
          ).map((key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`journal-${key}`}>
                {t(key)}
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
            <Label htmlFor="journal-status">{t('status')}</Label>
            <select
              id="journal-status"
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={fields.status}
              onChange={(e) =>
                setFields((old) => ({
                  ...old,
                  status: e.target.value as typeof fields.status,
                  ended_at: e.target.value === 'resolved' ? old.ended_at : '',
                }))
              }
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
              <Label htmlFor="journal-ended_at">{t('ended_at')} *</Label>
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
            <Label htmlFor={`journal-${key}`}>{t(key)}</Label>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t(pending ? 'saving' : 'save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
