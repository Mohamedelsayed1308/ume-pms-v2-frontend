'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Card, Icon, Spinner, EmptyState, Button, cx } from '@/components/ui';
import MarketReport from './MarketReport';
import YearComparison from './YearComparison';

// ── ثوابت ──
const METRICS = [
  { key: 'trips', label: 'الرحلات', icon: '🚢', color: '#4f46e5' },
  { key: 'trucks', label: 'الشاحنات', icon: '🚛', color: '#0891b2' },
  { key: 'cars', label: 'السيارات', icon: '🚗', color: '#059669' },
  { key: 'passengers', label: 'الركاب', icon: '🧍', color: '#d97706' },
] as const;
type MetricKey = typeof METRICS[number]['key'];

const AGENCY_COLORS: Record<string, string> = {
  BADAWY: '#1e3a8a', ETIHAD: '#059669', PAN_MARINE: '#d97706', TRIMOV: '#7c3aed',
};
const colorOf = (k: string, i = 0) => AGENCY_COLORS[k] || ['#64748b', '#db2777', '#0891b2', '#65a30d'][i % 4];

const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = (n: any) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pctS = (v: any) => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
const changeS = (v: any) => (v == null ? null : `${v >= 0 ? '▲' : '▼'} ${Math.abs(Number(v) * 100).toFixed(1)}%`);

const nowY = 2026;
const ymOptions = () => {
  const out: { v: string; label: string }[] = [];
  const M = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  for (const y of [2025, 2026]) for (let m = 1; m <= 12; m++) out.push({ v: `${y}-${String(m).padStart(2, '0')}`, label: `${M[m - 1]} ${y}` });
  return out;
};

export default function MarketPage() {
  const [from, setFrom] = useState('2026-01');
  const [to, setTo] = useState('2026-07');
  const [selAgencies, setSelAgencies] = useState<string[]>([]);
  const [ship, setShip] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'analysis' | 'comparison'>('analysis');

  const load = () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ from, to });
    if (selAgencies.length) params.set('agencies', selAgencies.join(','));
    if (ship) params.set('ship', ship);
    api.get(`/api/market/analysis?${params.toString()}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.status === 403 || e?.response?.status === 401 ? 'no-access' : 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, ship]);

  const reset = () => { setFrom('2026-01'); setTo('2026-07'); setSelAgencies([]); setShip(''); };

  const agencies = data?.agencies || [];
  const ships = data?.ships || [];
  const focus = data?.focus || 'BADAWY';
  // فلترة عرض الوكلاء (المقام يظل كامل السوق دائماً)
  const shownAgencyKeys = useMemo(() => {
    const all = (data?.byAgency || []).map((a: any) => a.key);
    if (!selAgencies.length) return all;
    return all.filter((k: string) => selAgencies.includes(k) || k === focus);
  }, [data, selAgencies, focus]);

  const shownAgencies = (data?.byAgency || []).filter((a: any) => shownAgencyKeys.includes(a.key));

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">تحليل السوق الملاحي — ضبا / سفاجا</h1>
          <p className="text-sm text-gray-500 mt-0.5">حصص الوكلاء والحركة الشهرية · التركيز: وكالة بدوي · المقام دائماً إجمالي السوق</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MarketReport from={from} to={to} agencies={selAgencies} ship={ship} defaultComparison={mode === 'comparison'} />
          {getUser()?.role === 'admin' && (
            <Link href="/dashboard/market/import"><Button variant="outline" size="sm"><Icon name="factory" size={15} /> استيراد وإدارة الوكالات</Button></Link>
          )}
        </div>
      </div>

      {/* مفتاح الوضع */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
        {([['analysis', '📊 التحليل'], ['comparison', '📈 المقارنة السنوية']] as const).map(([v, lbl]) => (
          <button key={v} onClick={() => setMode(v)} className={cx('px-4 py-2 text-sm font-medium', mode === v ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>{lbl}</button>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">من شهر</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              {ymOptions().map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">إلى شهر</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              {ymOptions().map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">السفينة (اختياري)</label>
            <select value={ship} onChange={(e) => setShip(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[140px]">
              <option value="">كل السفن</option>
              {ships.map((s: any) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={reset}><Icon name="x" size={14} /> إعادة ضبط</Button>
        </div>
        {/* multi-agency compare */}
        {agencies.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1.5">مقارنة الوكلاء (بدوي مُثبّت — الباقي للمقارنة):</p>
            <div className="flex flex-wrap gap-1.5">
              {agencies.map((a: any) => {
                const on = selAgencies.includes(a.key) || (!selAgencies.length);
                const isFocus = a.key === focus;
                return (
                  <button key={a.key} disabled={isFocus}
                    onClick={() => setSelAgencies((prev) => prev.includes(a.key) ? prev.filter((x) => x !== a.key) : [...prev, a.key])}
                    className={cx('text-xs px-3 py-1.5 rounded-full border transition flex items-center gap-1.5',
                      isFocus ? 'bg-navy-900 text-white border-navy-900 cursor-default' :
                      on && selAgencies.includes(a.key) ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}
                    style={selAgencies.includes(a.key) && !isFocus ? { background: colorOf(a.key) } : {}}>
                    <span className="w-2 h-2 rounded-full" style={{ background: colorOf(a.key) }} />{a.name}{isFocus ? ' (التركيز)' : ''}
                  </button>
                );
              })}
              {selAgencies.length > 0 && <button onClick={() => setSelAgencies([])} className="text-xs text-gray-400 hover:underline px-1">عرض الكل</button>}
            </div>
          </div>
        )}
      </Card>

      {/* ── وضع المقارنة السنوية ── */}
      {mode === 'comparison' && (
        <YearComparison from={from} to={to} selAgencies={selAgencies} ship={ship} shownAgencyKeys={shownAgencyKeys} />
      )}

      {loading && mode === 'analysis' && <div className="flex justify-center py-20"><Spinner /></div>}

      {mode === 'analysis' && !loading && error === 'no-access' && (
        <Card className="p-10"><EmptyState icon="shield" title="لا تملك صلاحية الوصول لتحليل السوق" description="اطلب من المسؤول منحك شاشة «تحليل السوق الملاحي»." /></Card>
      )}
      {mode === 'analysis' && !loading && error === 'error' && (
        <Card className="p-10 text-center"><p className="text-red-500 text-sm mb-3">تعذّر تحميل بيانات السوق</p><Button variant="outline" size="sm" onClick={load}>إعادة المحاولة</Button></Card>
      )}
      {mode === 'analysis' && !loading && !error && data && data.recordCount === 0 && (
        <Card className="p-10"><EmptyState icon="chart" title="لا توجد بيانات سوق للفترة المختارة" description="لم يتم استيراد بيانات لهذه الفترة بعد (يتم الاستيراد من شاشة الرفع)." /></Card>
      )}

      {mode === 'analysis' && !loading && !error && data && data.recordCount > 0 && (
        <>
          {/* notices */}
          <div className="flex flex-wrap gap-2 text-xs">
            {data.excludedMonths?.length > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">أشهر مستبعدة (بلا حركة سوق): {data.excludedMonths.join('، ')}</span>}
            {!data.hasComparison && <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">لا تتوفّر فترة سابقة مكافئة للمقارنة</span>}
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">{data.period.months.length} شهر فعلي · {data.recordCount} سجل</span>
          </div>

          {/* 4 KPI cards (focus = Badawy) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {METRICS.map((m) => {
              const k = data.kpis[m.key];
              const ch = changeS(k.changePct);
              return (
                <Card key={m.key} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${m.color}15` }}>{m.icon}</span>
                    {ch && <span className={cx('text-[11px] font-semibold px-2 py-0.5 rounded-full', k.changePct >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>{ch}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">{m.label} — بدوي</p>
                  <p className="text-2xl font-extrabold text-gray-800 tabular-nums leading-tight mt-0.5">{fmt(k.value)}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                    <span>الحصة: <b className="text-gray-700">{pctS(k.share)}</b></span>
                    <span>الترتيب: <b className="text-gray-700">{k.rank ? `${k.rank}/${k.agencies}` : '—'}</b></span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Agency comparison bars + ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-bold text-gray-800 mb-3">مقارنة الوكلاء</h3>
              <AgencyBars agencies={shownAgencies} focus={focus} />
            </Card>
            <Card className="p-5 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-3">ترتيب الوكلاء</h3>
              <RankTable byAgency={shownAgencies} focus={focus} />
            </Card>
          </div>

          {/* Monthly share timeline */}
          <Card className="p-5">
            <h3 className="font-bold text-gray-800 mb-3">الاتجاه الشهري للحصص</h3>
            <ShareTimeline timeline={data.timeline} agencyKeys={shownAgencyKeys} agencies={agencies} />
          </Card>

          {/* Productivity + Direction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-3">الإنتاجية لكل رحلة</h3>
              <ProductivityTable byAgency={shownAgencies} focus={focus} market={data.productivity?.market} />
            </Card>
            <Card className="p-5">
              <h3 className="font-bold text-gray-800 mb-3">اتزان المغادرة / الوصول</h3>
              <DirectionBalance market={data.direction.market} focus={data.direction.focus} />
            </Card>
          </div>

          {/* Best/Worst month + Contributing ships */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-bold text-gray-800 mb-3">أفضل / أسوأ شهر لبدوي (بالرحلات)</h3>
              <div className="grid grid-cols-2 gap-3">
                <MonthBox title="أفضل شهر" m={data.bestMonth} tone="emerald" />
                <MonthBox title="أسوأ شهر" m={data.worstMonth} tone="red" />
              </div>
            </Card>
            <Card className="p-5 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-3">السفن المساهمة في نمو/تراجع بدوي</h3>
              <ContributingShips ships={data.contributingShips} hasPrev={data.hasComparison} />
            </Card>
          </div>

          {/* Unavailable */}
          <Card className="p-4">
            <div className="flex items-center gap-2 flex-wrap text-sm text-gray-400">
              <Icon name="shield" size={16} />
              {['الربحية', 'العملاء', 'استغلال السعة'].map((x) => (
                <span key={x} className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">{x}: البيانات غير متاحة</span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ══ sub-components ══ */
function AgencyBars({ agencies, focus }: { agencies: any[]; focus: string }) {
  const [metric, setMetric] = useState<MetricKey>('trips');
  const rows = [...agencies].sort((a, b) => b.values[metric] - a.values[metric]);
  const max = Math.max(1, ...rows.map((a) => a.values[metric]));
  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            className={cx('text-xs px-2.5 py-1 rounded-lg', metric === m.key ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{m.label}</button>
        ))}
      </div>
      <div className="space-y-2.5">
        {rows.map((a) => (
          <div key={a.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={cx('font-medium', a.key === focus ? 'text-navy-900' : 'text-gray-600')}>{a.name}{a.key === focus ? ' ★' : ''}</span>
              <span className="text-gray-500 tabular-nums">{fmt(a.values[metric])} · {pctS(a.shares[metric])}</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(a.values[metric] / max) * 100}%`, background: colorOf(a.key) }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-gray-400 text-sm text-center py-6">لا بيانات</p>}
      </div>
    </div>
  );
}

function RankTable({ byAgency, focus }: { byAgency: any[]; focus: string }) {
  const rows = [...byAgency].sort((a, b) => b.values.trips - a.values.trips);
  return (
    <table className="w-full text-sm whitespace-nowrap">
      <thead><tr className="text-gray-500 text-xs border-b-2 border-gray-100">
        <th className="text-right py-2 px-2">الوكيل</th>
        {METRICS.map((m) => <th key={m.key} className="text-left py-2 px-2">{m.label}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.key} className={cx('border-b border-gray-50', a.key === focus && 'bg-blue-50/40')}>
            <td className="py-2 px-2 font-semibold">
              <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: colorOf(a.key) }} />{a.name}
            </td>
            {METRICS.map((m) => (
              <td key={m.key} className="text-left py-2 px-2 tabular-nums text-gray-700">{fmt(a.values[m.key])}<span className="text-gray-400 text-[11px]"> · {pctS(a.shares[m.key])}</span></td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">لا بيانات</td></tr>}
      </tbody>
    </table>
  );
}

function ShareTimeline({ timeline, agencyKeys, agencies }: { timeline: any[]; agencyKeys: string[]; agencies: any[] }) {
  const [metric, setMetric] = useState<MetricKey>('trips');
  const W = 620, H = 240, PL = 40, PR = 14, PT = 12, PB = 28, iw = W - PL - PR, ih = H - PT - PB;
  const n = timeline.length;
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - v * ih; // v = share 0..1
  const nameOf = (k: string) => agencies.find((a: any) => a.key === k)?.name || k;
  if (!n) return <p className="text-gray-400 text-sm text-center py-10">لا بيانات</p>;
  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)} className={cx('text-xs px-2.5 py-1 rounded-lg', metric === m.key ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600')}>{m.label}</button>
        ))}
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 360 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} stroke="#f1f5f9" />
              <text x={PL - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{(t * 100).toFixed(0)}%</text>
            </g>
          ))}
          {timeline.map((tm, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{tm.label.split(' ')[0]}</text>)}
          {agencyKeys.map((k) => {
            const pts = timeline.map((tm, i) => `${x(i)},${y(tm.byAgencyShare?.[k]?.[metric]?.share || 0)}`).join(' ');
            return (
              <g key={k}>
                <polyline fill="none" stroke={colorOf(k)} strokeWidth="2.5" strokeLinejoin="round" points={pts} />
                {timeline.map((tm, i) => <circle key={i} cx={x(i)} cy={y(tm.byAgencyShare?.[k]?.[metric]?.share || 0)} r="2.5" fill="#fff" stroke={colorOf(k)} strokeWidth="1.5" />)}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {agencyKeys.map((k) => <span key={k} className="text-xs text-gray-600 flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full inline-block" style={{ background: colorOf(k) }} />{nameOf(k)}</span>)}
      </div>
    </div>
  );
}

function ProductivityTable({ byAgency, focus, market }: { byAgency: any[]; focus: string; market: any }) {
  return (
    <table className="w-full text-sm whitespace-nowrap">
      <thead><tr className="text-gray-500 text-xs border-b-2 border-gray-100">
        <th className="text-right py-2 px-2">الوكيل</th>
        <th className="text-left py-2 px-2">شاحنات/رحلة</th>
        <th className="text-left py-2 px-2">سيارات/رحلة</th>
        <th className="text-left py-2 px-2">ركاب/رحلة</th>
      </tr></thead>
      <tbody>
        {[...byAgency].sort((a, b) => b.productivity.trucksPerTrip - a.productivity.trucksPerTrip).map((a) => (
          <tr key={a.key} className={cx('border-b border-gray-50', a.key === focus && 'bg-blue-50/40')}>
            <td className="py-2 px-2 font-semibold"><span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: colorOf(a.key) }} />{a.name}</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(a.productivity.trucksPerTrip)}</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(a.productivity.carsPerTrip)}</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(a.productivity.passengersPerTrip)}</td>
          </tr>
        ))}
        {market && (
          <tr className="border-t-2 border-gray-200 font-bold bg-gray-50/60">
            <td className="py-2 px-2">متوسط السوق</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(market.trucksPerTrip)}</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(market.carsPerTrip)}</td>
            <td className="text-left py-2 px-2 tabular-nums">{fmt1(market.passengersPerTrip)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function DirectionBalance({ market, focus }: { market: any; focus: any }) {
  const Row = ({ label, dep, arr }: { label: string; dep: number; arr: number }) => {
    const tot = dep + arr || 1; const depP = (dep / tot) * 100;
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{label}</span><span className="text-gray-500 tabular-nums">مغادرة {fmt(dep)} · وصول {fmt(arr)}</span></div>
        <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
          <div style={{ width: `${depP}%`, background: '#4f46e5' }} title="مغادرة" />
          <div style={{ width: `${100 - depP}%`, background: '#059669' }} title="وصول" />
        </div>
      </div>
    );
  };
  return (
    <div>
      <div className="flex gap-3 text-[11px] text-gray-500 mb-3">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#4f46e5' }} />مغادرة</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#059669' }} />وصول</span>
      </div>
      <p className="text-xs font-semibold text-gray-500 mb-1">بدوي (التركيز)</p>
      <Row label="الشاحنات" dep={focus.departureTrucks} arr={focus.arrivalTrucks} />
      <Row label="السيارات" dep={focus.departureCars} arr={focus.arrivalCars} />
      <Row label="الركاب" dep={focus.departurePassengers} arr={focus.arrivalPassengers} />
      <p className="text-xs font-semibold text-gray-500 mb-1 mt-3">السوق بالكامل</p>
      <Row label="الشاحنات" dep={market.departureTrucks} arr={market.arrivalTrucks} />
    </div>
  );
}

function MonthBox({ title, m, tone }: { title: string; m: any; tone: 'emerald' | 'red' }) {
  if (!m) return <div className="rounded-xl border border-gray-100 p-3 text-gray-400 text-sm">—</div>;
  return (
    <div className={cx('rounded-xl border p-3', tone === 'emerald' ? 'border-emerald-100 bg-emerald-50/40' : 'border-red-100 bg-red-50/40')}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="font-bold text-gray-800">{m.label}</p>
      <p className="text-sm tabular-nums text-gray-600 mt-1">{fmt(m.trips)} رحلة · حصة {pctS(m.tripsShare)}</p>
    </div>
  );
}

function ContributingShips({ ships, hasPrev }: { ships: any[]; hasPrev: boolean }) {
  if (!ships?.length) return <p className="text-gray-400 text-sm text-center py-6">لا بيانات</p>;
  if (!hasPrev) return (
    <div className="text-xs text-gray-500 mb-2">لا تتوفّر فترة سابقة — تُعرض أحجام الرحلات الحالية فقط:
      <table className="w-full text-sm mt-2"><tbody>
        {ships.slice(0, 6).map((s) => <tr key={s.ship} className="border-b border-gray-50"><td className="py-1.5">{s.name}</td><td className="text-left tabular-nums">{fmt(s.now)}</td></tr>)}
      </tbody></table>
    </div>
  );
  return (
    <table className="w-full text-sm whitespace-nowrap">
      <thead><tr className="text-gray-500 text-xs border-b-2 border-gray-100"><th className="text-right py-2">السفينة</th><th className="text-left py-2">حالي</th><th className="text-left py-2">سابق</th><th className="text-left py-2">التغيّر</th></tr></thead>
      <tbody>
        {ships.map((s) => (
          <tr key={s.ship} className="border-b border-gray-50">
            <td className="py-1.5 font-medium">{s.name}</td>
            <td className="text-left tabular-nums">{fmt(s.now)}</td>
            <td className="text-left tabular-nums text-gray-500">{fmt(s.prev)}</td>
            <td className={cx('text-left tabular-nums font-semibold', s.delta >= 0 ? 'text-emerald-700' : 'text-red-600')}>{s.delta >= 0 ? '+' : ''}{fmt(s.delta)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
