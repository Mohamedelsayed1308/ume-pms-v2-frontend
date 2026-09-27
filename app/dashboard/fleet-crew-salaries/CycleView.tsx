'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Badge, Button, Callout, Card, ErrorState, PageHeader, Tabs, TableSkeleton, cx, useToast } from '@/components/ui';
import { CYCLE_STATUS, STAGES, currencyCards, fmtAmount, serverError, stageIndex, type CurrencyTotals, type CycleViewData } from '@/lib/crewSalaries';
import { useReason } from './ReasonDialog';
import { FilesSection, ExtractedSection, CalcSection, BankSection, ApprovalSection, ExportSection } from './sections';

export type Act = (label: string, fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

const TABS = [
  { key: 'files', label: 'الملفّات والمراحل' },
  { key: 'data', label: 'البيانات والتسويات' },
  { key: 'calc', label: 'الحساب والمطابقة والفروق' },
  { key: 'bank', label: 'الحسابات والتفويضات' },
  { key: 'approve', label: 'المراجعة والاعتماد' },
  { key: 'export', label: 'التصدير والسجلّ' },
] as const;

/*
 * دورة مركبٍ وشهر. كلّ إجراءٍ يمرّ بـ `act`: يُرسل، ثمّ يُعيد تحميل الدورة من الخادم،
 * ولا يُعلن نجاحاً إلّا بعد ردٍّ ناجح — والخطأ يُعرض بنصّ الخادم كما هو.
 */
export default function CycleView({ id, onBack }: { id: string; onBack: () => void }) {
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
      (await serverError(e)).slice(0, 6).forEach((m) => toast.error(m));
      await load(true);
      return false;
    } finally { setBusy(false); }
  }, [load, toast]);

  const stage = useMemo(() => (v ? stageIndex(v) : 0), [v]);

  if (state === 'loading') return <Card className="p-4"><TableSkeleton rows={6} cols={6} /></Card>;
  if (state === 'forbidden') return <Card><ErrorState title="لا تملك صلاحية هذه الشاشة" /></Card>;
  if (state === 'missing') return <Card><ErrorState title="الدورة غير موجودة" onRetry={onBack} /></Card>;
  if (state === 'error' || !v) return <Card><ErrorState description="تعذّر تحميل الدورة." onRetry={() => load()} /></Card>;

  const st = CYCLE_STATUS[v.cycle.status] || { label: v.cycle.status, tone: 'neutral' as const };
  const counts = (key: keyof CurrencyTotals) => currencyCards(v.totals).reduce((n, { t }) => n + (Number(t[key]) || 0), 0);
  return (
    <div className={cx('space-y-4', busy && 'cursor-progress')} aria-busy={busy || undefined}>
      {dialog}
      <PageHeader
        title={`مرتّبات ${v.cycle.vessel} — ${v.cycle.month}`}
        subtitle="كلّ رقمٍ من مصدره · الإجماليّات لكلّ عملةٍ على حدة · التصدير ليس سداداً"
        meta={<><Badge tone={st.tone} dot>{st.label}</Badge>{v.changed_since_approval && <Badge tone="warning">تغيّرت البيانات بعد الاعتماد — يلزم إصدارٌ جديد</Badge>}</>}
        actions={<><Button variant="ghost" icon="chevronRight" onClick={onBack}>الدورات</Button><Button variant="outline" icon="refresh" onClick={() => load()}>تحديث</Button></>}
      />

      <ol className="flex flex-wrap gap-1.5" aria-label="مراحل الدورة">
        {STAGES.map((s, i) => (
          <li key={s.key} className={cx('rounded-lg px-3 py-1 text-xs font-medium ring-1 ring-inset',
            i < stage ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : i === stage ? 'bg-brand-600 text-white ring-brand-600' : 'bg-gray-50 text-gray-500 ring-gray-200')}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {v.blocking?.length > 0 && <Callout tone="danger" title="موانع">{v.blocking.map((m: string, i: number) => <p key={i}>{m}</p>)}</Callout>}
      {v.warnings?.length > 0 && <Callout tone="warning" title="تنبيهات">{v.warnings.map((m: string, i: number) => <p key={i}>{m}</p>)}</Callout>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {currencyCards(v.totals).map(({ currency, t }) => (
          <Card key={currency} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">الصافي المحسوب</p>
              <Badge tone="brand">{currency}</Badge>
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{fmtAmount(t.balance)} <span className="text-sm text-gray-500">{currency}</span></p>
            <p className="mt-1 text-xs text-gray-500">{t.count} بحّاراً · جاهز {t.ready} · معلّق {t.pending}</p>
          </Card>
        ))}
        <Card className="p-4 text-sm space-y-1">
          <p>مطابق لـ CFM: <b className="tabular-nums">{counts('matched')}</b> · بفروق: <b className="tabular-nums">{counts('different')}</b></p>
          <p>بلا حساب معتمد: <b className="tabular-nums">{counts('missing_account')}</b> · تفويضٌ ناقص: <b className="tabular-nums">{counts('missing_docs')}</b></p>
          <p>جاهز للصرف: <b className="tabular-nums">{counts('ready')}</b> · معلّق: <b className="tabular-nums">{counts('pending')}</b></p>
        </Card>
      </div>

      <Tabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />
      <div>
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
