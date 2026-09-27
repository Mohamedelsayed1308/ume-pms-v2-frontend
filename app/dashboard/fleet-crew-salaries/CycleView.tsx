'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Badge, Button, Callout, Card, ErrorState, PageHeader, Tabs, TableSkeleton, cx, useToast } from '@/components/ui';
import { CYCLE_TONE, STAGES, currencyCards, fmtAmount, serverError, stageIndex, type CurrencyTotals, type CycleViewData } from '@/lib/crewSalaries';
import { useCrewT } from '@/lib/crewSalariesI18n';
import { useReason } from './ReasonDialog';
import { FilesSection, ExtractedSection } from './sectionsData';
import { CalcSection, BankSection, ApprovalSection, ExportSection } from './sectionsReview';

export type Act = (label: string, fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

const TABS = ['files', 'data', 'calc', 'bank', 'approve', 'export'] as const;

/*
 * دورة مركبٍ وشهر. كلّ إجراءٍ يمرّ بـ `act`: يُرسل، ثمّ يُعيد تحميل الدورة من الخادم،
 * ولا يُعلن نجاحاً إلّا بعد ردٍّ ناجح — والخطأ يُعرض بنصّ الخادم كما هو.
 */
export default function CycleView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, tk, lang } = useCrewT();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [v, setV] = useState<CycleViewData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'forbidden' | 'missing'>('loading');
  const [tab, setTab] = useState<string>('files');
  const [busy, setBusy] = useState(false);

  // الجلب يكتب الحالة بعد الردّ وحده؛ و«جاري التحميل» عند التحديث اليدويّ فقط
  const fetchView = useCallback(() => api.get(`/api/crew-salaries/cycles/${id}`)
    .then((r) => { setV(r.data); setState('ok'); })
    .catch((e: { response?: { status?: number } }) => {
      const s = e?.response?.status;
      setState(s === 403 ? 'forbidden' : s === 404 || s === 400 ? 'missing' : 'error');
    }), [id]);
  useEffect(() => { fetchView(); }, [fetchView]);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState('loading');
    await fetchView();
  }, [fetchView]);

  const act: Act = useCallback(async (_label, fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load(true);
      return true;
    } catch (e) {
      (await serverError(e, undefined, lang)).slice(0, 6).forEach((m) => toast.error(m));
      await load(true);
      return false;
    } finally { setBusy(false); }
  }, [load, toast, lang]);

  const stage = useMemo(() => (v ? stageIndex(v) : 0), [v]);

  if (state === 'loading') return <Card className="p-4"><TableSkeleton rows={6} cols={6} /></Card>;
  if (state === 'forbidden') return <Card><ErrorState title={t('noAccess')} /></Card>;
  if (state === 'missing') return <Card><ErrorState title={t('cycle.missing')} onRetry={onBack} /></Card>;
  if (state === 'error' || !v) return <Card><ErrorState title={t('loadError')} onRetry={() => load()} /></Card>;

  const open = v.unresolved.filter((u) => !u.resolution).length;
  const counts = (key: keyof CurrencyTotals) => currencyCards(v.totals).reduce((n, { t: x }) => n + (Number(x[key]) || 0), 0);
  return (
    <div className={cx('space-y-4', busy && 'cursor-progress')} aria-busy={busy || undefined}>
      {dialog}
      <PageHeader
        title={t('cycle.title', { vessel: v.cycle.vessel, month: v.cycle.month })}
        subtitle={t('cycle.subtitle')}
        meta={(
          <>
            <Badge tone={CYCLE_TONE[v.cycle.status] || 'neutral'} dot>{tk('cst', v.cycle.status)}</Badge>
            {v.complete ? <Badge tone="success">{t('cycle.complete')}</Badge> : open > 0 && <Badge tone="warning">{t('cycle.openIssues', { n: open })}</Badge>}
            {v.changed_since_approval && <Badge tone="warning">{t('cycle.changed')}</Badge>}
          </>
        )}
        actions={<><Button variant="ghost" icon={lang === 'ar' ? 'chevronRight' : 'chevronLeft'} onClick={onBack}>{t('back')}</Button><Button variant="outline" icon="refresh" onClick={() => load()}>{t('refresh')}</Button></>}
      />

      <ol className="flex flex-wrap gap-1.5" aria-label={t('stages')}>
        {STAGES.map((s, i) => (
          <li key={s} aria-current={i === stage ? 'step' : undefined} className={cx('rounded-lg px-3 py-1 text-xs font-medium ring-1 ring-inset',
            i < stage ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : i === stage ? 'bg-brand-600 text-white ring-brand-600' : 'bg-gray-50 text-gray-500 ring-gray-200')}>
            {i + 1}. {t(`stage.${s}` as 'stage.import')}
          </li>
        ))}
      </ol>

      {v.blocking?.length > 0 && <Callout tone="danger" title={t('cycle.blocking')}>{v.blocking.map((m, i) => <p key={i}>{m}</p>)}</Callout>}
      {v.warnings?.length > 0 && <Callout tone="warning" title={t('cycle.warnings')}>{v.warnings.map((m, i) => <p key={i}>{m}</p>)}</Callout>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {currencyCards(v.totals).map(({ currency, t: x }) => (
          <Card key={currency} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('card.net')}</p>
              <Badge tone="brand">{currency}</Badge>
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{fmtAmount(x.balance)} <span className="text-sm text-gray-500">{currency}</span></p>
            <p className="mt-1 text-xs text-gray-500">{t('card.line', { count: x.count, ready: x.ready, pending: x.pending, approved: x.approved })}</p>
          </Card>
        ))}
        <Card className="p-4 text-sm space-y-1">
          <p>{t('counts.match', { m: counts('matched'), d: counts('different') })}</p>
          <p>{t('counts.bank', { a: counts('missing_account'), z: counts('missing_docs') })}</p>
          <p>{t('counts.ready', { r: counts('ready'), p: counts('pending') })}</p>
        </Card>
      </div>

      <Tabs tabs={TABS.map((k) => ({ key: k, label: t(`tab.${k}` as 'tab.files'), count: k === 'data' && open ? open : undefined }))} value={tab} onChange={setTab} />
      <div role="tabpanel">
        {tab === 'files' && <FilesSection v={v} act={act} ask={ask} reload={() => load(true)} />}
        {tab === 'data' && <ExtractedSection v={v} act={act} ask={ask} />}
        {tab === 'calc' && <CalcSection v={v} act={act} ask={ask} />}
        {tab === 'bank' && <BankSection v={v} act={act} ask={ask} />}
        {tab === 'approve' && <ApprovalSection v={v} act={act} ask={ask} />}
        {tab === 'export' && <ExportSection v={v} act={act} />}
      </div>
    </div>
  );
}
