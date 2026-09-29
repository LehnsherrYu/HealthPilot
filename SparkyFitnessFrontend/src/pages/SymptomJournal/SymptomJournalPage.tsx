import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  searchSymptomJournalSchema,
  type SymptomJournalEntry,
  type CreateSymptomJournal,
  type UpdateSymptomJournal,
  type SearchSymptomJournal,
} from '@workspace/shared';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSymptomJournal } from '@/hooks/SymptomJournal/useSymptomJournal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import SymptomJournalForm from './SymptomJournalForm';

// Unmount all record state on logout, profile switching or timezone changes.
export default function SymptomJournalPage() {
  const { user } = useAuth();
  const { timezone } = usePreferences();
  const { t } = useTranslation('healthpilot');
  if (!user || user.activeUserId !== user.id)
    return <p className="p-6">{t('ownerOnly')}</p>;
  return <OwnedJournal key={`${user.id}:${timezone}`} timezone={timezone} />;
}
function OwnedJournal({ timezone }: { timezone: string }) {
  const { t, i18n } = useTranslation('healthpilot');
  const { setLanguage } = usePreferences();
  const defaults = {
    symptom_name: '',
    body_location: '',
    status: '',
    from: '',
    to: '',
  };
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState<SearchSymptomJournal>({
    limit: 20,
    offset: 0,
  });
  const [filterError, setFilterError] = useState('');
  const [editor, setEditor] = useState<SymptomJournalEntry | 'new' | null>(
    null
  );
  const [deleting, setDeleting] = useState<SymptomJournalEntry | null>(null);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const { list, save, remove } = useSymptomJournal(filters);
  const errorText = (error: unknown, fallback: string) =>
    error instanceof Error &&
    'code' in error &&
    error.code === 'VERSION_CONFLICT'
      ? t('conflict')
      : t(fallback);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const parsed = searchSymptomJournalSchema.safeParse(
      Object.fromEntries(
        Object.entries(draft).filter(([, value]) => value !== '')
      )
    );
    if (!parsed.success) {
      setFilterError(t('filterError'));
      return;
    }
    setFilterError('');
    setFilters(parsed.data);
  }
  async function saveEntry(body: CreateSymptomJournal | UpdateSymptomJournal) {
    setSaveError('');
    setNotice('');
    const input =
      editor && editor !== 'new' && 'version' in body
        ? { id: editor.id, body }
        : 'raw_text' in body
          ? { body }
          : null;
    if (!input) return;
    try {
      await save.mutateAsync(input);
      setEditor(null);
      setFilters((old) => ({ ...old, offset: 0 }));
      setNotice('saved');
    } catch (error) {
      setSaveError(errorText(error, 'saveError'));
    }
  }
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <select
            aria-label={t('language')}
            className="rounded-md border bg-background p-2 text-sm"
            value={i18n.language.startsWith('zh') ? 'zh-Hans' : 'en'}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="zh-Hans">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className="text-sm text-muted-foreground">{t('privacy')}</p>
        <p className="text-sm text-muted-foreground">
          {t('timezone', { timezone })}
        </p>
        {!editor && (
          <Button
            onClick={() => {
              setEditor('new');
              setSaveError('');
              setNotice('');
            }}
          >
            {t('newEntry')}
          </Button>
        )}
        {notice && <p role="status">{t(notice)}</p>}
      </header>
      {editor && (
        <Card>
          <CardContent className="pt-6">
            <SymptomJournalForm
              key={editor === 'new' ? 'new' : `${editor.id}:${editor.version}`}
              entry={editor === 'new' ? undefined : editor}
              timezone={timezone}
              pending={save.isPending}
              error={saveError}
              onSave={saveEntry}
              onCancel={() => {
                setEditor(null);
                setSaveError('');
                void list.refetch();
              }}
            />
          </CardContent>
        </Card>
      )}
      <section className="space-y-4" aria-label={t('history')}>
        <h2 className="text-xl font-semibold">{t('history')}</h2>
        <form
          onSubmit={applyFilters}
          className="space-y-3 rounded-lg border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(['symptom_name', 'body_location', 'from', 'to'] as const).map(
              (key) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`filter-${key}`}>{t(key)}</Label>
                  <Input
                    id={`filter-${key}`}
                    type={key === 'from' || key === 'to' ? 'date' : 'text'}
                    value={draft[key]}
                    maxLength={
                      key === 'symptom_name'
                        ? 200
                        : key === 'body_location'
                          ? 120
                          : undefined
                    }
                    onChange={(event) =>
                      setDraft((old) => ({ ...old, [key]: event.target.value }))
                    }
                  />
                </div>
              )
            )}
            <div className="space-y-2">
              <Label htmlFor="filter-status">{t('status')}</Label>
              <select
                id="filter-status"
                className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.status}
                onChange={(e) =>
                  setDraft((old) => ({ ...old, status: e.target.value }))
                }
              >
                <option value="">{t('all')}</option>
                {(['ongoing', 'resolved', 'unknown'] as const).map((status) => (
                  <option key={status} value={status}>
                    {t(`statuses.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filterError && <p role="alert">{filterError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{t('filter')}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(defaults);
                setFilters({ limit: 20, offset: 0 });
                setFilterError('');
              }}
            >
              {t('reset')}
            </Button>
          </div>
        </form>
        {list.isPending ? (
          <p role="status">{t('loading')}</p>
        ) : list.isError ? (
          <div role="alert">
            <p>{t('loadError')}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            {list.data?.entries.length === 0 && (
              <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                {t('empty')}
              </p>
            )}
            <ul className="space-y-3">
              {list.data?.entries.map((entry) => (
                <li key={entry.id}>
                  <Card>
                    <CardContent className="space-y-3 pt-5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="break-words font-semibold">
                          {entry.symptom_name}
                        </h3>
                        <span className="rounded-full bg-muted px-3 py-1 text-sm">
                          {t(`statuses.${entry.status}`)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(entry.started_at)}
                        {entry.ended_at
                          ? ` — ${formatTime(entry.ended_at)}`
                          : ''}
                      </p>
                      <p className="break-words text-sm">
                        {t('body_location')}:{' '}
                        {entry.body_location || t('unknown')} · {t('severity')}:{' '}
                        {entry.severity ?? t('unknown')}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={!!editor}
                          onClick={() => {
                            setEditor(entry);
                            setSaveError('');
                            setNotice('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!!editor || remove.isPending}
                          onClick={() => {
                            setDeleting(entry);
                            setDeleteError('');
                          }}
                        >
                          {t('delete')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={filters.offset === 0 || list.isFetching}
                onClick={() =>
                  setFilters((old) => ({
                    ...old,
                    offset: Math.max(0, old.offset - old.limit),
                  }))
                }
              >
                {t('previous')}
              </Button>
              <span className="text-sm">
                {t('page', {
                  page: Math.floor(filters.offset / filters.limit) + 1,
                })}
              </span>
              <Button
                variant="outline"
                disabled={
                  !list.data?.has_more ||
                  list.isFetching ||
                  filters.offset + filters.limit > 10000
                }
                onClick={() =>
                  setFilters((old) => ({
                    ...old,
                    offset: old.offset + old.limit,
                  }))
                }
              >
                {t('next')}
              </Button>
            </div>
          </>
        )}
      </section>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                remove.mutate(
                  { id: deleting.id, version: deleting.version },
                  {
                    onSuccess: () => {
                      setDeleting(null);
                      setFilters((old) => ({ ...old, offset: 0 }));
                      setNotice('deleted');
                    },
                    onError: (error) => {
                      setDeleteError(errorText(error, 'deleteError'));
                      void list.refetch();
                    },
                  }
                );
              }}
            >
              {t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
