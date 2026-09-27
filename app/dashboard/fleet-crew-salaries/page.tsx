'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, TableSkeleton,
  Table, THead, TBody, TR, TH, TD, useToast,
} from '@/components/ui';
import { CREW_SALARIES_HREF, CYCLE_TONE, currencyCards, fmtAmount, serverError, type CyclesList as CyclesData, type FileRow, type VersionTotals } from '@/lib/crewSalaries';
import { useCrewT } from '@/lib/crewSalariesI18n';
import ImportPanel from './ImportPanel';
import CycleView from './CycleView';
import { useReason } from './ReasonDialog';

/*
 * مرتّبات أطقم السفن — دوراتٌ لكلّ مركبٍ وشهر.
 * الرابط `?cycle=<id>` يفتح الدورة بأقسامها الستّة، وبدونه القائمة والاستيراد.
 */
function Content() {
  const params = useSearchParams();
  const router = useRouter();
  const cycle = params.get('cycle');
  const open = useCallback((id: string | null) => router.push(id ? `${CREW_SALARIES_HREF}?cycle=${id}` : CREW_SALARIES_HREF), [router]);
  if (cycle) return <CycleView key={cycle} id={cycle} onBack={() => open(null)} />;
  return <CyclesList onOpen={open} />;
}

function CyclesList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const { t, tk } = useCrewT();
  const [data, setData] = useState<CyclesData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'forbidden'>('loading');
  // الجلب يكتب الحالة في ردّه فقط — و«جاري التحميل» تُكتب عند إعادة المحاولة لا داخل الأثر
  const fetchList = useCallback(() => api.get('/api/crew-salaries/cycles')
    .then((r) => { setData(r.data); setState('ok'); })
    .catch((e: { response?: { status?: number } }) => setState(e?.response?.status === 403 ? 'forbidden' : 'error')), []);
  useEffect(() => { fetchList(); }, [fetchList]);
  const load = () => { setState('loading'); fetchList(); };

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {state === 'forbidden' ? (
        <Card><ErrorState title={t('noAccess')} description={t('noAccess.hint')} /></Card>
      ) : (
        <>
          <Card>
            <CardHeader title={t('import')} subtitle={t('import.subtitle')} />
            <ImportPanel onDone={(id) => { load(); if (id) onOpen(id); }} />
          </Card>
          {state === 'loading' && <Card className="p-4"><TableSkeleton rows={4} cols={5} /></Card>}
          {state === 'error' && <Card><ErrorState title={t('loadError')} onRetry={load} /></Card>}
          {state === 'ok' && data && (
            <>
              {data.unassigned_files?.length > 0 && <Unassigned files={data.unassigned_files} onDone={(id) => { load(); onOpen(id); }} />}
              <Card>
                <CardHeader title={t('cycles')} subtitle={t('cycles.subtitle')} />
                {data.cycles.length === 0 ? (
                  <EmptyState icon="users" title={t('cycles.empty')} description={t('cycles.emptyHint')} />
                ) : (
                  <Table minWidth={720}>
                    <THead><TR><TH>{t('vessel')}</TH><TH>{t('month')}</TH><TH>{t('status')}</TH><TH>{t('cycles.latest')}</TH><TH>{t('cycles.balance')}</TH><TH /></TR></THead>
                    <TBody>
                      {data.cycles.map((c) => (
                        <TR key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer">
                          <TD className="font-medium">{c.vessel}</TD>
                          <TD><span dir="ltr">{c.month}</span></TD>
                          <TD><Badge tone={CYCLE_TONE[c.status] || 'neutral'} dot>{tk('cst', c.status)}</Badge></TD>
                          <TD>{c.latest_version ? <span className="text-sm">#{c.latest_version.version_no} · {tk('vst', c.latest_version.status)}{c.latest_version.partial && <Badge tone="warning" className="ms-1">{t('partial')}</Badge>}</span> : <span className="text-gray-400">—</span>}</TD>
                          <TD>
                            <div className="flex flex-wrap gap-2">
                              {currencyCards(c.latest_version?.totals).map(({ currency, t: v }) => (
                                <span key={currency} dir="ltr" className="tabular-nums text-sm">{fmtAmount((v as VersionTotals).balance)} <span className="text-gray-500 text-xs">{currency}</span></span>
                              ))}
                              {!c.latest_version && <span className="text-gray-400">—</span>}
                            </div>
                          </TD>
                          <TD className="text-end"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>{t('open')}</Button></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** ملفّاتٌ لم يُستنتج مركبها أو شهرها — تُعيَّن يدويّاً بسبب. */
function Unassigned({ files, onDone }: { files: FileRow[]; onDone: (id: string) => void }) {
  const { t, lang } = useCrewT();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [form, setForm] = useState<Record<string, { vessel: string; month: string }>>({});
  const assign = async (f: FileRow) => {
    const v = form[f.id] || { vessel: f.meta?.inference?.vessel || '', month: f.meta?.inference?.month || '' };
    const reason = await ask({ title: t('assign.title', { name: f.name }), hint: `${t('vessel')} ${v.vessel || '—'} · ${t('month')} ${v.month || '—'}` });
    if (!reason) return;
    try {
      const r = await api.post(`/api/crew-salaries/files/${f.id}/assign`, { ...v, reason });
      toast.success(t('assign.done'));
      onDone(r.data.cycle_id);
    } catch (e) { (await serverError(e, undefined, lang)).forEach((m) => toast.error(m)); }
  };
  return (
    <Card>
      {dialog}
      <CardHeader title={t('unassigned')} subtitle={t('unassigned.subtitle')} />
      <div className="divide-y">
        {files.map((f) => {
          const v = form[f.id] || { vessel: f.meta?.inference?.vessel || '', month: f.meta?.inference?.month || '' };
          return (
            <div key={f.id} className="p-4 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[min(14rem,100%)]">
                <p className="font-medium break-all" dir="ltr">{f.name}</p>
                {(f.meta?.inference?.conflicts?.length ?? 0) > 0 && <p className="text-xs text-red-700">{f.meta.inference?.conflicts?.join(' · ')}</p>}
              </div>
              <Field label={t('vessel')}><Input id={`assign-vessel-${f.id}`} value={v.vessel} onChange={(e) => setForm({ ...form, [f.id]: { ...v, vessel: e.target.value } })} /></Field>
              <Field label={t('month.hint')}><Input id={`assign-month-${f.id}`} dir="ltr" value={v.month} onChange={(e) => setForm({ ...form, [f.id]: { ...v, month: e.target.value } })} /></Field>
              <Button onClick={() => assign(f)} disabled={!v.vessel || !/^\d{4}-\d{2}$/.test(v.month)}>{t('assign')}</Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function FleetCrewSalariesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">…</div>}>
      <Content />
    </Suspense>
  );
}
