'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Spinner, EmptyState, Button, cx } from '@/components/ui';

// ألوان ثابتة للعامين
const CUR = '#4f46e5';   // السنة الحالية (2026)
const PREV = '#94a3b8';  // السنة المرجعية (2025)
const AGENCY_COLORS: Record<string, string> = { BADAWY: '#1e3a8a', ETIHAD: '#059669', PAN_MARINE: '#d97706', TRIMOV: '#7c3aed', AL_QAHERA: '#db2777' };
const colorOf = (k: string, i = 0) => AGENCY_COLORS[k] || ['#64748b', '#0891b2', '#65a30d', '#c026d3', '#ea580c'][i % 5];

const METRICS = [
  { key: 'trips', label: 'الرحلات', icon: '🚢' },
  { key: 'trucks', label: 'الشاحنات', icon: '🚛' },
  { key: 'cars', label: 'السيارات', icon: '🚗' },
  { key: 'passengers', label: 'الركاب', icon: '🧍' },
] as const;
type MetricKey = typeof METRICS[number]['key'];

const VIEWS = [
  { key: 'volume', label: 'الحجم' },
  { key: 'growth', label: 'نسبة النمو' },
  { key: 'share', label: 'الحصة السوقية' },
  { key: 'shareChange', label: 'تغيّر الحصة (نقاط)' },
  { key: 'productivity', label: 'الإنتاجية/رحلة' },
] as const;
type ViewKey = typeof VIEWS[number]['key'];

const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('en-US');
const f1 = (n: any) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pts = (v: any) => (v == null ? '—' : `${Number(v) >= 0 ? '+' : ''}${f1(v)} نقطة`);

// شارة النمو من كائن Growth الخادمي
function growthText(g: any): { text: string; up: boolean | null } {
  if (!g) return { text: '—', up: null };
  if (g.status === 'new_activity') return { text: 'نشاط جديد', up: true };
  if (g.status === 'no_movement') return { text: 'لا حركة', up: null };
  if (g.status === 'contraction_full') return { text: '−100%', up: false };
  const up = (g.pct || 0) >= 0;
  return { text: `${up ? '▲' : '▼'} ${f1(Math.abs(g.pct))}%`, up };
}

export default function YearComparison({ from, to, selAgencies, ship, shownAgencyKeys }: { from: string; to: string; selAgencies: string[]; ship: string; shownAgencyKeys: string[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<MetricKey>('trips');
  const [view, setView] = useState<ViewKey>('growth');

  useEffect(() => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ from, to });
    if (selAgencies.length) p.set('agencies', selAgencies.join(','));
    if (ship) p.set('ship', ship);
    api.get(`/api/market/comparison?${p.toString()}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.status === 403 || e?.response?.status === 401 ? 'no-access' : 'error'))
      .finally(() => setLoading(false));
  }, [from, to, ship, selAgencies.join(',')]);

  const focus = data?.focus || 'BADAWY';
  const shownAgencies = useMemo(() => (data?.byAgency || []).filter((a: any) => !shownAgencyKeys.length || shownAgencyKeys.includes(a.key)), [data, shownAgencyKeys]);
  const focusRow = (data?.byAgency || []).find((a: any) => a.key === focus);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error === 'no-access') return <Card className="p-10"><EmptyState icon="shield" title="لا تملك صلاحية الوصول" description="اطلب شاشة «تحليل السوق الملاحي»." /></Card>;
  if (error) return <Card className="p-10 text-center"><p className="text-red-500 text-sm">تعذّر تحميل المقارنة</p></Card>;
  if (!data?.hasData) {
    return (
      <Card className="p-10">
        <EmptyState icon="chart" title="لا تتوفّر بيانات كافية للمقارنة السنوية"
          description={`نحتاج بيانات الفترة الحالية (${from}→${to}) ونفس الأشهر من العام السابق. تأكد من استيراد بيانات 2025 و2026.`} />
      </Card>
    );
  }

  const curLabel = `${data.period.current.months[0]?.label || ''} → ${data.period.current.months.at(-1)?.label || ''}`;
  const refLabel = `${data.period.reference.months[0]?.label || ''} → ${data.period.reference.months.at(-1)?.label || ''}`;

  return (
    <div className="space-y-5">
      {/* شريط الفترتين + مفاتيح */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: CUR }} /> الحالية: <b>{curLabel}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: PREV }} /> المرجعية: <b>{refLabel}</b></span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {METRICS.map((m) => (
                <button key={m.key} onClick={() => setMetric(m.key)} className={cx('px-2.5 py-1.5 text-xs', metric === m.key ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>{m.icon} {m.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500">وضع العرض:</span>
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} className={cx('text-xs px-3 py-1 rounded-full border', view === v.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>{v.label}</button>
          ))}
        </div>
      </Card>

      {/* 4 بطاقات مقارنة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const g = data.marketGrowth[m.key];
          const gt = growthText(g);
          const fShareCur = focusRow ? (focusRow.shares.current[m.key] || 0) * 100 : 0;
          const fSharePrev = focusRow ? (focusRow.shares.previous[m.key] || 0) * 100 : 0;
          const sc = focusRow ? focusRow.shareChange[m.key] : null;
          const max = Math.max(g.current, g.previous, 1);
          return (
            <Card key={m.key} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{m.icon} {m.label} — السوق</span>
                <span className={cx('text-[11px] font-bold px-2 py-0.5 rounded-full', gt.up === null ? 'bg-gray-100 text-gray-500' : gt.up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>{gt.text}</span>
              </div>
              <p className="text-2xl font-extrabold text-gray-800 tabular-nums mt-2">{fmt(g.current)}</p>
              <p className="text-xs text-gray-400">مقابل {fmt(g.previous)} · الفرق {g.abs >= 0 ? '+' : ''}{fmt(g.abs)}</p>
              {/* mini grouped bars */}
              <div className="flex items-end gap-2 h-12 mt-2">
                <div className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t" style={{ height: `${(g.previous / max) * 100}%`, background: PREV, minHeight: 2 }} />
                  <span className="text-[9px] text-gray-400 mt-0.5">2025</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t" style={{ height: `${(g.current / max) * 100}%`, background: CUR, minHeight: 2 }} />
                  <span className="text-[9px] text-gray-500 mt-0.5">2026</span>
                </div>
              </div>
              {/* focus share both years */}
              <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
                <span>حصة بدوي: <b className="text-navy-800">{f1(fShareCur)}%</b> <span className="text-gray-400">(كان {f1(fSharePrev)}%)</span></span>
                <span className={cx('font-semibold', (sc || 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>{pts(sc)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* أداء بدوي مقابل السوق */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-3">نمو بدوي مقابل نمو السوق</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {METRICS.map((m) => {
            const fp = data.focusPerformance.growthVsMarket[m.key];
            const out = fp.outperformsMarket;
            return (
              <div key={m.key} className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500">{m.icon} {m.label}</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold" style={{ color: CUR }}>{fp.focusPct == null ? '—' : `${f1(fp.focusPct)}%`}</span>
                  <span className="text-[11px] text-gray-400">بدوي</span>
                </div>
                <p className="text-[11px] text-gray-500">السوق: {fp.marketPct == null ? '—' : `${f1(fp.marketPct)}%`}</p>
                {out !== null && (
                  <span className={cx('inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full', out ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {out ? 'أسرع من السوق' : 'أبطأ من السوق'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* الخط الشهري للعامين */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-1">الاتجاه الشهري — {METRICS.find((m) => m.key === metric)?.label} (2026 مقابل 2025)</h3>
        <MonthlyOverlay overlay={data.monthlyOverlay} metric={metric} />
      </Card>

      {/* جدول الوكلاء حسب وضع العرض */}
      <Card className="p-5 overflow-x-auto">
        <h3 className="font-bold text-gray-800 mb-3">الوكلاء — {VIEWS.find((v) => v.key === view)?.label} · {METRICS.find((m) => m.key === metric)?.label}</h3>
        <AgencyCompareTable agencies={shownAgencies} focus={focus} metric={metric} view={view} />
      </Card>

      {/* تغيّر الحصة + مساهمة الوكلاء في النمو */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-gray-800 mb-3">تغيّر الحصة السوقية (نقاط مئوية) — {METRICS.find((m) => m.key === metric)?.label}</h3>
          <ShareChangeBars agencies={shownAgencies} focus={focus} metric={metric} />
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-gray-800 mb-3">مساهمة كل وكيل في نمو السوق — {METRICS.find((m) => m.key === metric)?.label}</h3>
          <ContributionBars agencies={shownAgencies} focus={focus} metric={metric} />
        </Card>
      </div>

      {/* ترتيب الوكلاء في العامين */}
      <Card className="p-5 overflow-x-auto">
        <h3 className="font-bold text-gray-800 mb-3">ترتيب الوكلاء في العامين — {METRICS.find((m) => m.key === metric)?.label}</h3>
        <RankingCompare ranking={data.ranking} metric={metric} focus={focus} />
      </Card>

      {/* مساهمة السفن + تكوين السوق */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 overflow-x-auto">
          <h3 className="font-bold text-gray-800 mb-3">مساهمة السفن في نمو/تراجع وكالتها (بالرحلات)</h3>
          <ShipContribution ships={data.shipContribution} />
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-gray-800 mb-3">اختلاف تكوين السوق بين العامين</h3>
          <Composition c={data.composition} />
        </Card>
      </div>

      {/* الإنتاجية + الاتجاه للعامين */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-gray-800 mb-3">الإنتاجية لكل رحلة — السوق (2026 مقابل 2025)</h3>
          <ProductivityCompare p={data.productivity.market} />
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-gray-800 mb-3">المغادرة مقابل الوصول (شاحنات) — العامين</h3>
          <DirectionCompare d={data.direction} />
        </Card>
      </div>

      {/* غير متاح */}
      <Card className="p-4">
        <div className="flex items-center gap-2 flex-wrap text-sm text-gray-400">
          {['الربحية', 'العملاء', 'استغلال السعة'].map((x) => <span key={x} className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">{x}: البيانات غير متاحة</span>)}
        </div>
      </Card>
    </div>
  );
}

/* ── الخط الشهري ── */
function MonthlyOverlay({ overlay, metric }: { overlay: any[]; metric: MetricKey }) {
  const W = 640, H = 220, PL = 44, PR = 12, PT = 14, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const n = overlay.length;
  const vals = overlay.flatMap((o) => [o.current[metric], o.previous[metric]]);
  const max = Math.max(1, ...vals);
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const path = (key: 'current' | 'previous') => overlay.map((o, i) => `${i ? 'L' : 'M'}${x(i)},${y(o[key][metric])}`).join(' ');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 420 }}>
        {[0, 0.5, 1].map((t) => <line key={t} x1={PL} x2={W - PR} y1={PT + ih - t * ih} y2={PT + ih - t * ih} stroke="#eef2f7" />)}
        <path d={path('previous')} fill="none" stroke={PREV} strokeWidth={2} strokeDasharray="5 4" />
        <path d={path('current')} fill="none" stroke={CUR} strokeWidth={2.5} />
        {overlay.map((o, i) => <g key={i}>
          <circle cx={x(i)} cy={y(o.previous[metric])} r={2.5} fill={PREV} />
          <circle cx={x(i)} cy={y(o.current[metric])} r={3} fill={CUR} />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize="9">{o.label}</text>
        </g>)}
      </svg>
      <div className="flex gap-4 text-xs text-gray-500 mt-1">
        <span className="flex items-center gap-1"><span className="w-4 h-0.5" style={{ background: CUR }} /> 2026</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0" style={{ borderTop: `2px dashed ${PREV}` }} /> 2025</span>
      </div>
    </div>
  );
}

/* ── جدول الوكلاء حسب وضع العرض ── */
function AgencyCompareTable({ agencies, focus, metric, view }: { agencies: any[]; focus: string; metric: MetricKey; view: ViewKey }) {
  const rows = [...agencies].sort((a, b) => b.current[metric] - a.current[metric]);
  return (
    <table className="w-full text-sm min-w-[520px]">
      <thead><tr className="text-gray-500 text-xs border-b">
        <th scope="col" className="text-right py-2">الوكيل</th>
        {view === 'volume' && <><th scope="col" className="text-center">2026</th><th scope="col" className="text-center">2025</th><th scope="col" className="text-center">الفرق</th></>}
        {view === 'growth' && <><th scope="col" className="text-center">2026</th><th scope="col" className="text-center">2025</th><th scope="col" className="text-center">النمو</th></>}
        {view === 'share' && <><th scope="col" className="text-center">حصة 2026</th><th scope="col" className="text-center">حصة 2025</th><th scope="col" className="text-center">التغيّر</th></>}
        {view === 'shareChange' && <><th scope="col" className="text-center">تغيّر الحصة (نقاط)</th></>}
        {view === 'productivity' && <><th scope="col" className="text-center">شاحنات/رحلة 2026</th><th scope="col" className="text-center">2025</th></>}
      </tr></thead>
      <tbody>
        {rows.map((a, i) => {
          const g = a.growth[metric], gt = growthText(g);
          const isF = a.key === focus;
          return (
            <tr key={a.key} className={cx('border-b border-gray-50', isF && 'bg-navy-50/40')}>
              <td className="py-2 font-medium text-gray-700"><span className="inline-block w-2 h-2 rounded-full me-1.5" style={{ background: colorOf(a.key, i) }} />{a.name}{isF && ' ★'}</td>
              {view === 'volume' && <><td className="text-center tabular-nums">{fmt(a.current[metric])}</td><td className="text-center tabular-nums text-gray-400">{fmt(a.previous[metric])}</td><td className={cx('text-center tabular-nums font-semibold', a.current[metric] - a.previous[metric] >= 0 ? 'text-emerald-600' : 'text-red-500')}>{a.current[metric] - a.previous[metric] >= 0 ? '+' : ''}{fmt(a.current[metric] - a.previous[metric])}</td></>}
              {view === 'growth' && <><td className="text-center tabular-nums">{fmt(a.current[metric])}</td><td className="text-center tabular-nums text-gray-400">{fmt(a.previous[metric])}</td><td className={cx('text-center font-semibold', gt.up === null ? 'text-gray-400' : gt.up ? 'text-emerald-600' : 'text-red-500')}>{gt.text}</td></>}
              {view === 'share' && <><td className="text-center tabular-nums">{f1((a.shares.current[metric] || 0) * 100)}%</td><td className="text-center tabular-nums text-gray-400">{f1((a.shares.previous[metric] || 0) * 100)}%</td><td className={cx('text-center font-semibold', a.shareChange[metric] >= 0 ? 'text-emerald-600' : 'text-red-500')}>{pts(a.shareChange[metric])}</td></>}
              {view === 'shareChange' && <td className={cx('text-center font-semibold', a.shareChange[metric] >= 0 ? 'text-emerald-600' : 'text-red-500')}>{pts(a.shareChange[metric])}</td>}
              {view === 'productivity' && <><td className="text-center tabular-nums">{f1(a.productivity.current.trucksPerTrip)}</td><td className="text-center tabular-nums text-gray-400">{f1(a.productivity.previous.trucksPerTrip)}</td></>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── تغيّر الحصة بالنقاط ── */
function ShareChangeBars({ agencies, focus, metric }: { agencies: any[]; focus: string; metric: MetricKey }) {
  const rows = [...agencies].sort((a, b) => (b.shareChange[metric] || 0) - (a.shareChange[metric] || 0));
  const max = Math.max(1, ...rows.map((a) => Math.abs(a.shareChange[metric] || 0)));
  return (
    <div className="space-y-2">
      {rows.map((a, i) => {
        const v = a.shareChange[metric] || 0; const w = (Math.abs(v) / max) * 50;
        return (
          <div key={a.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-gray-600">{a.name}{a.key === focus && ' ★'}</span>
            <div className="flex-1 flex items-center h-5">
              <div className="w-1/2 flex justify-end"><div className="h-4 rounded-s" style={{ width: `${v < 0 ? w : 0}%`, background: '#ef4444' }} /></div>
              <div className="w-px h-5 bg-gray-300" />
              <div className="w-1/2"><div className="h-4 rounded-e" style={{ width: `${v > 0 ? w : 0}%`, background: '#10b981' }} /></div>
            </div>
            <span className={cx('w-16 text-left tabular-nums font-semibold', v >= 0 ? 'text-emerald-600' : 'text-red-500')}>{pts(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── مساهمة الوكلاء في نمو السوق ── */
function ContributionBars({ agencies, focus, metric }: { agencies: any[]; focus: string; metric: MetricKey }) {
  const rows = [...agencies].map((a) => ({ ...a, c: a.contribution[metric] })).sort((a, b) => (b.c?.abs || 0) - (a.c?.abs || 0));
  const max = Math.max(1, ...rows.map((a) => Math.abs(a.c?.abs || 0)));
  return (
    <div className="space-y-2">
      {rows.map((a, i) => {
        const abs = a.c?.abs || 0; const pctOf = a.c?.pctOfMarketGrowth;
        return (
          <div key={a.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-gray-600">{a.name}{a.key === focus && ' ★'}</span>
            <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden"><div className="h-4 rounded" style={{ width: `${(Math.abs(abs) / max) * 100}%`, background: abs >= 0 ? colorOf(a.key, i) : '#ef4444' }} /></div>
            <span className="w-28 text-left tabular-nums text-gray-500">{abs >= 0 ? '+' : ''}{fmt(abs)}{pctOf != null && <span className="text-gray-400"> ({f1(pctOf)}%)</span>}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── ترتيب الوكلاء في العامين ── */
function RankingCompare({ ranking, metric, focus }: { ranking: any; metric: MetricKey; focus: string }) {
  const cur = ranking.current[metric] || [], prev = ranking.previous[metric] || [];
  const prevRank: Record<string, number> = {}; prev.forEach((r: any, i: number) => (prevRank[r.key] = i + 1));
  return (
    <table className="w-full text-sm min-w-[420px]">
      <thead><tr className="text-gray-500 text-xs border-b"><th scope="col" className="text-right py-2">#</th><th scope="col" className="text-right">الوكيل</th><th scope="col" className="text-center">2026</th><th scope="col" className="text-center">حصة</th><th scope="col" className="text-center">ترتيب 2025</th><th scope="col" className="text-center">التغيّر</th></tr></thead>
      <tbody>
        {cur.map((r: any, i: number) => {
          const pr = prevRank[r.key]; const delta = pr ? pr - (i + 1) : null;
          return (
            <tr key={r.key} className={cx('border-b border-gray-50', r.key === focus && 'bg-navy-50/40')}>
              <td className="py-2 font-bold text-gray-400">{i + 1}</td>
              <td className="font-medium text-gray-700">{r.name}{r.key === focus && ' ★'}</td>
              <td className="text-center tabular-nums">{fmt(r.value)}</td>
              <td className="text-center tabular-nums text-gray-500">{f1((r.share || 0) * 100)}%</td>
              <td className="text-center text-gray-400">{pr || '—'}</td>
              <td className={cx('text-center font-semibold', delta == null ? 'text-gray-300' : delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400')}>{delta == null ? 'جديد' : delta === 0 ? '=' : delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── مساهمة السفن ── */
function ShipContribution({ ships }: { ships: any[] }) {
  const rows = [...ships].sort((a, b) => b.delta - a.delta);
  const max = Math.max(1, ...rows.map((s) => Math.abs(s.delta)));
  return (
    <div className="space-y-1.5 min-w-[380px]">
      {rows.map((s) => (
        <div key={s.ship} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-gray-600" style={{ color: colorOf(s.agency) }}>{s.name}</span>
          <div className="flex-1 flex items-center h-5">
            <div className="w-1/2 flex justify-end"><div className="h-3.5 rounded-s" style={{ width: `${s.delta < 0 ? (Math.abs(s.delta) / max) * 100 : 0}%`, background: '#ef4444' }} /></div>
            <div className="w-px h-5 bg-gray-300" />
            <div className="w-1/2"><div className="h-3.5 rounded-e" style={{ width: `${s.delta > 0 ? (s.delta / max) * 100 : 0}%`, background: '#10b981' }} /></div>
          </div>
          <span className={cx('w-16 text-left tabular-nums font-semibold', s.delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>{s.delta >= 0 ? '+' : ''}{fmt(s.delta)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── تكوين السوق ── */
function Composition({ c }: { c: any }) {
  const Group = ({ title, items, tone }: { title: string; items: any[]; tone: string }) => (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{title} <span className="text-gray-400">({items.length})</span></p>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((s: any) => <span key={s.ship} className={cx('text-[11px] px-2 py-0.5 rounded-full', tone)}>{s.name}</span>) : <span className="text-[11px] text-gray-400">لا يوجد</span>}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Group title="مستمرة في العامين" items={c.both} tone="bg-gray-100 text-gray-600" />
      <Group title="دخلت السوق في 2026" items={c.entered} tone="bg-emerald-50 text-emerald-700" />
      <Group title="خرجت من السوق" items={c.exited} tone="bg-red-50 text-red-600" />
      {c.zeroInOne?.length > 0 && <Group title="صفر حركة في إحدى الفترتين" items={c.zeroInOne} tone="bg-amber-50 text-amber-700" />}
    </div>
  );
}

/* ── الإنتاجية للعامين ── */
function ProductivityCompare({ p }: { p: any }) {
  const items = [
    { label: 'شاحنات/رحلة', cur: p.current.trucksPerTrip, prev: p.previous.trucksPerTrip },
    { label: 'سيارات/رحلة', cur: p.current.carsPerTrip, prev: p.previous.carsPerTrip },
    { label: 'ركاب/رحلة', cur: p.current.passengersPerTrip, prev: p.previous.passengersPerTrip },
  ];
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const max = Math.max(it.cur, it.prev, 0.01);
        return (
          <div key={it.label}>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{it.label}</span><span><b style={{ color: CUR }}>{f1(it.cur)}</b> <span className="text-gray-400">/ {f1(it.prev)}</span></span></div>
            <div className="space-y-1">
              <div className="h-2.5 rounded" style={{ width: `${(it.prev / max) * 100}%`, background: PREV }} />
              <div className="h-2.5 rounded" style={{ width: `${(it.cur / max) * 100}%`, background: CUR }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── المغادرة/الوصول للعامين ── */
function DirectionCompare({ d }: { d: any }) {
  const Row = ({ label, dep, arr, color }: { label: string; dep: number; arr: number; color: string }) => {
    const tot = dep + arr || 1; const depP = (dep / tot) * 100;
    return (
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{label}</span><span>مغادرة {fmt(dep)} · وصول {fmt(arr)}</span></div>
        <div className="flex h-4 rounded overflow-hidden">
          <div style={{ width: `${depP}%`, background: color }} />
          <div style={{ width: `${100 - depP}%`, background: `${color}66` }} />
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <Row label="2026 (شاحنات)" dep={d.current.departureTrucks} arr={d.current.arrivalTrucks} color={CUR} />
      <Row label="2025 (شاحنات)" dep={d.previous.departureTrucks} arr={d.previous.arrivalTrucks} color={PREV} />
      <p className="text-[11px] text-gray-400">الشريط الغامق = المغادرة · الفاتح = الوصول</p>
    </div>
  );
}
