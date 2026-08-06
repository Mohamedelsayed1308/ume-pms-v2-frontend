'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import FleetAssistant from './FleetAssistant';

interface MonthRow {
  vessel: string; month: string; voyages: number; net: number; avgNet: number;
  revenue: number; expenses: number; liquidity: number;
  trucks: number; vehicles: number; passengers: number;
}
interface FleetData { vessels: string[]; months: string[]; monthly: MonthRow[]; voyages: any[]; generatedAt: string; }

const MONTH_AR = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y.slice(2)}`; };
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

const VESSEL_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

type MetricKey = 'voyages' | 'trucks' | 'vehicles' | 'passengers' | 'net' | 'revenue' | 'expenses' | 'liquidity';
const METRICS: { key: MetricKey; label: string; money: boolean; goodUp: boolean }[] = [
  { key: 'voyages', label: 'الرحلات', money: false, goodUp: true },
  { key: 'trucks', label: 'الشاحنات', money: false, goodUp: true },
  { key: 'vehicles', label: 'السيارات', money: false, goodUp: true },
  { key: 'passengers', label: 'الركاب', money: false, goodUp: true },
  { key: 'net', label: 'صافي الربح', money: true, goodUp: true },
  { key: 'revenue', label: 'الإيراد', money: true, goodUp: true },
  { key: 'expenses', label: 'المصروفات', money: true, goodUp: false },
  { key: 'liquidity', label: 'السيولة', money: true, goodUp: true },
];

function sum(rows: MonthRow[], k: MetricKey) { return rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); }

export default function FleetDashboard() {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selVessels, setSelVessels] = useState<string[]>([]);
  const [metric, setMetric] = useState<MetricKey>('net');
  const [sortKey, setSortKey] = useState<MetricKey>('net');

  async function load(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/fleet/dashboard${refresh ? '?refresh=1' : ''}`);
      const d: FleetData = res.data;
      setData(d);
      if (d.months.length) { setFrom((f) => f || d.months[0]); setTo((t) => t || d.months[d.months.length - 1]); }
      if (d.vessels.length) setSelVessels((s) => s.length ? s : d.vessels);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'تعذّر تحميل بيانات الأسطول');
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(false); }, []);

  const months = data?.months || [];
  // نطبّع لو المستخدم اختار «من» بعد «إلى»
  const lo = from && to ? (from <= to ? from : to) : (from || to);
  const hi = from && to ? (from <= to ? to : from) : (to || from);
  const inRange = (m: string) => (!lo || m >= lo) && (!hi || m <= hi);
  const monthsInRange = useMemo(() => months.filter(inRange), [months, lo, hi]);

  // صفوف الفترة والمراكب المختارة
  const rows = useMemo(
    () => (data?.monthly || []).filter((r) => inRange(r.month) && selVessels.includes(r.vessel)),
    [data, lo, hi, selVessels],
  );
  // الفترة السابقة (نفس عدد الشهور قبل بداية المدى تمامًا) للمقارنة — تُلغى لو مفيش تاريخ كافٍ
  const prevRows = useMemo(() => {
    if (!data || !lo) return [];
    const i = months.indexOf(lo);
    const len = monthsInRange.length;
    if (i < 0 || len === 0 || i - len < 0) return []; // نافذة سابقة غير مكتملة → بلا مقارنة مضلِّلة
    const set = new Set(months.slice(i - len, i));
    return data.monthly.filter((r) => set.has(r.month) && selVessels.includes(r.vessel));
  }, [data, lo, selVessels, monthsInRange]);

  // تجميع لكل مركب على الفترة
  const perVessel = useMemo(() => {
    const map: Record<string, MonthRow> = {};
    for (const r of rows) {
      const a = map[r.vessel] || (map[r.vessel] = { vessel: r.vessel, month: '', voyages: 0, net: 0, avgNet: 0, revenue: 0, expenses: 0, liquidity: 0, trucks: 0, vehicles: 0, passengers: 0 });
      a.voyages += r.voyages; a.net += r.net; a.revenue += r.revenue; a.expenses += r.expenses;
      a.liquidity += r.liquidity; a.trucks += r.trucks; a.vehicles += r.vehicles; a.passengers += r.passengers;
    }
    const arr = Object.values(map);
    arr.forEach((a) => { a.avgNet = a.voyages ? a.net / a.voyages : 0; });
    return arr;
  }, [rows]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of METRICS) t[m.key] = sum(rows, m.key);
    t.avgNet = t.voyages ? t.net / t.voyages : 0;
    return t;
  }, [rows]);
  const prevTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of METRICS) t[m.key] = sum(prevRows, m.key);
    return t;
  }, [prevRows]);

  const toggleVessel = (v: string) =>
    setSelVessels((s) => s.includes(v) ? (s.length > 1 ? s.filter((x) => x !== v) : s) : [...s, v]);

  if (loading) return <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">جاري تحميل بيانات الأسطول…</div>;
  if (error) return (
    <div className="bg-white rounded-xl shadow p-6 text-center">
      <p className="text-red-500 mb-3">{error}</p>
      <button onClick={() => load(true)} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">إعادة المحاولة</button>
    </div>
  );
  if (!data) return null;

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const maxMetric = Math.max(1, ...perVessel.map((v) => Math.abs(Number(v[metric]) || 0)));
  const rankedByMetric = [...perVessel].sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0));
  const rankedTable = [...perVessel].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));

  // سلاسل الاتجاه الشهري لكل مركب — نفس تعيين اللون في كل مكان (حسب ترتيب data.vessels)
  const series = selVessels.map((v) => ({
    name: v, color: VESSEL_COLORS[Math.max(0, data.vessels.indexOf(v)) % VESSEL_COLORS.length],
    values: monthsInRange.map((m) => {
      const row = data.monthly.find((r) => r.vessel === v && r.month === m);
      return row ? (Number(row[metric]) || 0) : 0;
    }),
  }));

  return (
    <div className="space-y-4">
      {/* رأس اللوحة + فلاتر */}
      <div className="bg-gradient-to-l from-indigo-600 to-blue-600 text-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">🚢 لوحة الأسطول التنفيذية</h2>
            <p className="text-xs opacity-80 mt-1">قراءة حيّة من شيت جوجل — آخر تحديث: {new Date(data.generatedAt).toLocaleString('ar-EG')}</p>
          </div>
          <button onClick={() => load(true)} disabled={refreshing} className="bg-white/15 hover:bg-white/25 text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {refreshing ? 'جاري التحديث…' : '🔄 تحديث البيانات'}
          </button>
        </div>
        <div className="flex items-end gap-3 flex-wrap mt-4">
          <div>
            <label className="block text-xs opacity-80 mb-1">من</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="text-gray-800 rounded-lg px-2 py-1.5 text-sm">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs opacity-80 mb-1">إلى</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="text-gray-800 rounded-lg px-2 py-1.5 text-sm">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs opacity-80 mb-1">المراكب</label>
            <div className="flex flex-wrap gap-1.5">
              {data.vessels.map((v, i) => {
                const on = selVessels.includes(v);
                return (
                  <button key={v} onClick={() => toggleVessel(v)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${on ? 'bg-white text-indigo-700 border-white font-medium' : 'bg-transparent text-white/80 border-white/40'}`}>
                    <span className="inline-block w-2 h-2 rounded-full ml-1 align-middle" style={{ background: VESSEL_COLORS[i % VESSEL_COLORS.length] }} />
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* مؤشرات رئيسية */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const cur = totals[m.key] || 0;
          const prev = prevTotals[m.key] || 0;
          const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
          const up = cur >= prev;
          const good = pct == null ? null : (up === m.goodUp);
          return (
            <div key={m.key} className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">{m.label}{m.money ? ' ($)' : ''}</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmt(cur)}</p>
              {pct != null && (
                <p className={`text-xs mt-1 ${good ? 'text-emerald-600' : 'text-red-500'}`}>
                  {up ? '▲' : '▼'} {fmt1(Math.abs(pct))}% عن الفترة السابقة
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* اختيار المؤشر للرسوم */}
      <div className="bg-white rounded-xl shadow p-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">المؤشر:</span>
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${metric === m.key ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* مقارنة المراكب + الحصص */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-gray-700 mb-3">مقارنة المراكب — {activeMetric.label}</h3>
          <div className="space-y-2.5">
            {rankedByMetric.map((v) => {
              const val = Number(v[metric]) || 0;
              // الحصة تُعرض فقط للمؤشرات التراكمية الموجبة (الصافي/السيولة ممكن تبقى سالبة أو مختلطة الإشارة فالنسبة تبقى بلا معنى)
              const showShare = totals[metric] > 0 && metric !== 'net' && metric !== 'liquidity';
              const share = showShare ? (val / totals[metric]) * 100 : 0;
              const i = data.vessels.indexOf(v.vessel);
              return (
                <div key={v.vessel}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{v.vessel}</span>
                    <span className="text-gray-500">{fmt(val)}{activeMetric.money ? ' $' : ''}{showShare ? ` · ${fmt1(share)}%` : ''}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(Math.abs(val) / maxMetric) * 100}%`, background: val < 0 ? '#dc2626' : VESSEL_COLORS[i % VESSEL_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
            {rankedByMetric.length === 0 && <p className="text-gray-400 text-sm text-center py-6">لا توجد بيانات في الفترة</p>}
          </div>
        </div>

        {/* الاتجاه الشهري */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-gray-700 mb-3">الاتجاه الشهري — {activeMetric.label}</h3>
          <LineChart months={monthsInRange} series={series} money={activeMetric.money} />
        </div>
      </div>

      {/* جدول الأداء التفصيلي */}
      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="font-bold text-gray-700 mb-3">جدول الأداء التفصيلي (اضغط العنوان للفرز)</h3>
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-gray-500 text-xs border-b">
            <tr>
              <th className="text-right py-2 px-2">المركب</th>
              {METRICS.map((m) => (
                <th key={m.key} onClick={() => setSortKey(m.key)} className={`text-left py-2 px-2 cursor-pointer hover:text-indigo-600 ${sortKey === m.key ? 'text-indigo-600 font-bold' : ''}`}>
                  {m.label}{sortKey === m.key ? ' ▾' : ''}
                </th>
              ))}
              <th className="text-left py-2 px-2">متوسط الصافي/رحلة</th>
            </tr>
          </thead>
          <tbody>
            {rankedTable.map((v) => {
              const i = data.vessels.indexOf(v.vessel);
              return (
                <tr key={v.vessel} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">
                    <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: VESSEL_COLORS[i % VESSEL_COLORS.length] }} />
                    {v.vessel}
                  </td>
                  {METRICS.map((m) => (
                    <td key={m.key} className={`text-left py-2 px-2 ${m.key === 'net' ? (v.net >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-gray-700'}`}>{fmt(Number(v[m.key]) || 0)}</td>
                  ))}
                  <td className="text-left py-2 px-2 text-indigo-700 font-medium">{fmt(v.avgNet)}</td>
                </tr>
              );
            })}
            {rankedTable.length > 0 && (
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-2 px-2">الإجمالي</td>
                {METRICS.map((m) => <td key={m.key} className="text-left py-2 px-2">{fmt(totals[m.key] || 0)}</td>)}
                <td className="text-left py-2 px-2 text-indigo-800">{fmt(totals.avgNet || 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FleetAssistant filters={{ from, to, vessels: selVessels }} />
    </div>
  );
}

function LineChart({ months, series, money }: { months: string[]; series: { name: string; color: string; values: number[] }[]; money: boolean }) {
  const W = 560, H = 240, PL = 48, PR = 12, PT = 14, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const n = months.length;
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - ((v - min) / (max - min || 1)) * ih;
  const ticks = 4;
  if (!n) return <p className="text-gray-400 text-sm text-center py-10">لا توجد بيانات في الفترة</p>;
  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 360 }}>
          {Array.from({ length: ticks + 1 }).map((_, t) => {
            const val = min + ((max - min) * t) / ticks;
            const yy = y(val);
            return (
              <g key={t}>
                <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="#f1f5f9" />
                <text x={PL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{money ? fmt(val) : fmt1(val)}</text>
              </g>
            );
          })}
          {months.map((m, i) => (
            <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{monthLabel(m)}</text>
          ))}
          {series.map((s) => (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color} />)}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {series.map((s) => (
          <span key={s.name} className="text-xs text-gray-600 flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-full" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
