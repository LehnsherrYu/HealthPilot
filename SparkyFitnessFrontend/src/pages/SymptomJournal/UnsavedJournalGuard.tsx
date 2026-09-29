import { useEffect } from 'react';
import { useBlocker, useInRouterContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

function RouteGuard({ dirty }: { dirty: boolean }) {
  const { t } = useTranslation('healthpilot');
  const blocker = useBlocker(dirty);
  if (blocker.state !== 'blocked') return null;
  return (
    <div
      role="alertdialog"
      aria-label={t('parser.leaveTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6"
    >
      <div className="max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="font-semibold">{t('parser.leaveTitle')}</h2>
        <p>{t('parser.leaveHint')}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => blocker.reset()}
          >
            {t('parser.stay')}
          </Button>
          <Button type="button" onClick={() => blocker.proceed()}>
            {t('parser.discard')}
          </Button>
        </div>
      </div>
    </div>
  );
}
export default function UnsavedJournalGuard({ dirty }: { dirty: boolean }) {
  const inRouter = useInRouterContext();
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  return inRouter ? <RouteGuard dirty={dirty} /> : null;
}
