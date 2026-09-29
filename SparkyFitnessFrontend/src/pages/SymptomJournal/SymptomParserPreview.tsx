import { useTranslation } from 'react-i18next';
import {
  symptomParseFields,
  type SymptomParsePreview,
  type SymptomParseEvidence,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import type { JournalDraftFields } from '@/hooks/SymptomJournal/useSymptomParserDraft';

interface Props {
  preview: SymptomParsePreview;
  fields: JournalDraftFields;
  manualFields: Set<keyof JournalDraftFields>;
  onChooseSymptom: (name: string) => void;
}
export default function SymptomParserPreview({
  preview,
  fields,
  manualFields,
  onChooseSymptom,
}: Props) {
  const { t } = useTranslation('healthpilot');
  function evidence(spans: SymptomParseEvidence[]) {
    return spans.map((span, index) => (
      <div
        key={`${span.start}:${span.end}:${index}`}
        className="flex items-start gap-2"
      >
        <blockquote className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">
          <mark>{preview.raw_text.slice(span.start, span.end)}</mark>
        </blockquote>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => {
            const input = document.getElementById('journal-raw');
            if (input instanceof HTMLTextAreaElement) {
              input.focus();
              input.setSelectionRange(span.start, span.end);
            }
          }}
        >
          {t('parser.locate')}
        </Button>
      </div>
    ));
  }
  return (
    <section
      aria-label={t('parser.preview')}
      className="space-y-4 rounded-lg border bg-muted/30 p-4"
    >
      <div>
        <h3 className="font-semibold">{t('parser.preview')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('parser.reviewHint')}
        </p>
      </div>
      {preview.warnings.length > 0 && (
        <ul aria-label={t('parser.warnings')} className="space-y-2">
          {preview.warnings.map((warning) => (
            <li key={warning.code} className="rounded border p-3 text-sm">
              <p>{t(`parser.warning.${warning.code}`)}</p>
              {evidence(warning.evidence)}
            </li>
          ))}
        </ul>
      )}
      {preview.multiple_symptoms && (
        <ul
          className="flex flex-wrap gap-2"
          aria-label={t('parser.candidates')}
        >
          {preview.candidates.map((candidate, index) => (
            <li key={index}>
              <Button
                type="button"
                variant="outline"
                onClick={() => onChooseSymptom(candidate.name)}
              >
                {t('parser.choose', { name: candidate.name })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {symptomParseFields.map((field) => {
          const suggestion = preview.suggestions[field];
          const manual = manualFields.has(field);
          const status = manual
            ? 'user'
            : (suggestion?.status ?? 'unrecognized');
          const current = fields[field];
          return (
            <article
              key={field}
              className="min-w-0 space-y-2 rounded border bg-background p-3"
              aria-label={t(field)}
            >
              <h4 className="font-medium">{t(field)}</h4>
              <span className="text-xs text-muted-foreground">
                {t(`parser.states.${status}`)}
              </span>
              <p className="whitespace-pre-wrap break-words text-sm">
                {current
                  ? field === 'status'
                    ? t(`statuses.${current}`)
                    : current
                  : t('unknown')}
              </p>
              {!manual && suggestion && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t(`parser.reason.${suggestion.reason}`)}
                  </p>
                  {evidence(suggestion.evidence)}
                </>
              )}
            </article>
          );
        })}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary>{t('parser.context')}</summary>
        <p>
          {t('parser.versions', {
            parser: preview.parser_version,
            dictionary: preview.dictionary_version,
          })}
        </p>
        <p>{t('parser.reference', { time: preview.reference_time })}</p>
        <p>
          {t('parser.zone', {
            timezone: preview.timezone ?? t('parser.unconfirmedZone'),
          })}
        </p>
        <p>{t(`parser.zoneSource.${preview.timezone_source}`)}</p>
      </details>
    </section>
  );
}
