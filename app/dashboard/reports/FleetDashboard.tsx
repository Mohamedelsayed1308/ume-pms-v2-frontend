'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import FleetAssistant from './FleetAssistant';
import FleetInstrument from './FleetInstrument';

interface MonthRow {
  vessel: string; month: string; voyages: number; net: number; avgNet: number;
  revenue: number; expenses: number; liquidity: number;
  trucks: number; vehicles: number; passengers: number;
}
interface ColumnMap { field: string; label: string; header: string | null; column: string | null }
interface TabReport {
  name: string; role: string; found: boolean;
  headerRow: number | null; rows: number; columns: ColumnMap[]; missing: string[];
}
interface LastImport { at: string | null; ageHours: number | null; stale: boolean; status: string | null }
interface FleetSource {
  sheetId: string; sheetUrl: string; tabs: TabReport[];
  cacheMinutes: number; fetchedAt: string; stale: boolean; staleReason: string | null;
  lastImport?: LastImport;
}
interface FleetData {
  vessels: string[]; months: string[]; monthly: MonthRow[]; voyages: any[];
  generatedAt: string; source?: FleetSource;
}

const MONTH_AR = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y.slice(2)}`; };
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
// صيغة مختصرة للأرقام الكبيرة (2.3M / 45.6K) مع الحفاظ على العلامة
function fmtC(n: number): string {
  const v = Number(n) || 0; const a = Math.abs(v); const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${s}${(a / 1e3).toFixed(0)}K`;
  return fmt(v);
}

const VESSEL_COLORS = ['#4f46e5', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

// أنواع المخططات المتاحة للاتجاه الشهري (تسهيل العرض للإدارة)
type ChartType = 'line' | 'bars' | 'area' | 'donut';
const CHART_TYPES: { key: ChartType; label: string; icon: string }[] = [
  { key: 'line', label: 'خطّي', icon: '📈' },
  { key: 'bars', label: 'أعمدة', icon: '📊' },
  { key: 'area', label: 'مساحة', icon: '🗻' },
  { key: 'donut', label: 'حلقي', icon: '🍩' },
];

type MetricKey = 'voyages' | 'trucks' | 'vehicles' | 'passengers' | 'net' | 'revenue' | 'expenses' | 'liquidity';
const METRICS: { key: MetricKey; label: string; money: boolean; goodUp: boolean; icon: string; color: string; grad: [string, string] }[] = [
  { key: 'voyages', label: 'الرحلات', money: false, goodUp: true, icon: '🧭', color: '#4f46e5', grad: ['#6366f1', '#4f46e5'] },
  { key: 'trucks', label: 'الشاحنات', money: false, goodUp: true, icon: '🚚', color: '#2563eb', grad: ['#3b82f6', '#2563eb'] },
  { key: 'vehicles', label: 'السيارات', money: false, goodUp: true, icon: '🚗', color: '#d97706', grad: ['#f59e0b', '#d97706'] },
  { key: 'passengers', label: 'الركاب', money: false, goodUp: true, icon: '👥', color: '#7c3aed', grad: ['#8b5cf6', '#7c3aed'] },
  { key: 'net', label: 'صافي الربح', money: true, goodUp: true, icon: '💰', color: '#059669', grad: ['#10b981', '#059669'] },
  { key: 'revenue', label: 'الإيراد', money: true, goodUp: true, icon: '📈', color: '#0891b2', grad: ['#06b6d4', '#0891b2'] },
  { key: 'expenses', label: 'المصروفات', money: true, goodUp: false, icon: '💸', color: '#e11d48', grad: ['#f43f5e', '#e11d48'] },
  { key: 'liquidity', label: 'السيولة', money: true, goodUp: true, icon: '💧', color: '#0284c7', grad: ['#38bdf8', '#0284c7'] },
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
  const [chartType, setChartType] = useState<ChartType>('line');
  const [showSource, setShowSource] = useState(false);
  // عدد الأعمدة التي لم يجد لها المُفسِّر عنواناً — صفرها يعني أن كل رقم مصدره معروف
  const srcMissing = (data?.source?.tabs || []).reduce((n, t) => n + t.missing.length, 0);

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
  const lo = from && to ? (from <= to ? from : to) : (from || to);
  const hi = from && to ? (from <= to ? to : from) : (to || from);
  const inRange = (m: string) => (!lo || m >= lo) && (!hi || m <= hi);
  const monthsInRange = useMemo(() => months.filter(inRange), [months, lo, hi]);

  const rows = useMemo(
    () => (data?.monthly || []).filter((r) => inRange(r.month) && selVessels.includes(r.vessel)),
    [data, lo, hi, selVessels],
  );
  const prevRows = useMemo(() => {
    if (!data || !lo) return [];
    const i = months.indexOf(lo);
    const len = monthsInRange.length;
    if (i < 0 || len === 0 || i - len < 0) return [];
    const set = new Set(months.slice(i - len, i));
    return data.monthly.filter((r) => set.has(r.month) && selVessels.includes(r.vessel));
  }, [data, lo, selVessels, monthsInRange]);

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

  // إجمالي الأسطول لكل شهر (لكل مؤشر) — يغذّي الـ sparkline في بطاقات المؤشرات
  const fleetMonthly = useMemo(() => monthsInRange.map((m) => {
    const mr = rows.filter((r) => r.month === m);
    const o: Record<string, number> = { month: m as any };
    for (const mt of METRICS) o[mt.key] = sum(mr, mt.key);
    return o;
  }), [rows, monthsInRange]);

  /*
   * عرضان متعايشان.
   *
   * «الغاطس» عرضٌ جديد يبدأ بأطروحةٍ ثم يقارن المراكب بمقاييس غاطس. والكلاسيكي
   * يبقى كما هو حتى يستقرّ الشكل — كما فُعل مع تقارير الربحية.
   */
  const [design, setDesign] = useState<'classic' | 'draft'>('draft');

  const toggleVessel = (v: string) =>
    setSelVessels((s) => s.includes(v) ? (s.length > 1 ? s.filter((x) => x !== v) : s) : [...s, v]);

  if (loading) return <Skeleton />;
  if (error) return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
      <div className="text-4xl mb-3">📡</div>
      <p className="text-red-500 mb-4 font-medium">{error}</p>
      <button onClick={() => load(true)} className="bg-indigo-600 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-700 shadow-sm">إعادة المحاولة</button>
    </div>
  );
  if (!data) return null;

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const maxMetric = Math.max(1, ...perVessel.map((v) => Math.abs(Number(v[metric]) || 0)));
  const rankedByMetric = [...perVessel].sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0));
  const rankedTable = [...perVessel].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  const topVessel = rankedTable[0]?.vessel;

  const series = selVessels.map((v) => ({
    name: v, color: VESSEL_COLORS[Math.max(0, data.vessels.indexOf(v)) % VESSEL_COLORS.length],
    values: monthsInRange.map((m) => {
      const row = data.monthly.find((r) => r.vessel === v && r.month === m);
      return row ? (Number(row[metric]) || 0) : 0;
    }),
  }));

  const RANK_BADGE = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── رأس اللوحة (Hero) ── */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg text-white p-5"
        style={{ background: '#00283A' }}>
        <div className="relative flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">لوحة الأسطول التنفيذية</h2>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="inline-flex items-center gap-1.5 bg-[#3D8A67]/30 text-[#A7CFB9] px-2 py-0.5 rounded-full">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6EB08B] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#6EB08B]" /></span>
                مباشر من جوجل شيت
              </span>
              <span className="opacity-75">آخر تحديث: {new Date(data.generatedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {/*
                مرجعية القراءة تُفتح من الرأس لا من قائمةٍ مدفونة: سؤال «من أين
                جاء هذا الرقم؟» يُطرح أمام الرقم نفسه.
              */}
              <button type="button" onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded-full transition-colors">
                📄 مرجعية القراءة
              </button>
              {srcMissing > 0 && (
                <span className="inline-flex items-center gap-1 bg-amber-400/25 text-amber-50 px-2 py-0.5 rounded-full font-semibold">
                  ⚠ {srcMissing} عمود غير مُطابَق
                </span>
              )}
              {data.source?.stale && (
                <span className="inline-flex items-center gap-1 bg-rose-500/30 text-rose-50 px-2 py-0.5 rounded-full font-semibold">
                  ⚠ نسخة قديمة
                </span>
              )}
              {/*
                صمت الأنبوب أخطر من فشله: الفشل يُرسل بريداً، والتوقّف لا يُرسل
                شيئاً — والأرقام تبقى معروضة كأنها اليوم.
              */}
              {data.source?.lastImport?.stale && (
                <span className="inline-flex items-center gap-1 bg-rose-500/30 text-rose-50 px-2 py-0.5 rounded-full font-semibold">
                  ⚠ السحب متوقّف
                </span>
              )}
            </div>
          </div>
          <button onClick={() => load(true)} disabled={refreshing}
            className="bg-white/15 hover:bg-white/25 backdrop-blur text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm">
            <span className={refreshing ? 'inline-block animate-spin' : ''}>🔄</span>{refreshing ? 'جاري التحديث…' : 'تحديث'}
          </button>
        </div>

        <div className="relative flex items-end gap-3 flex-wrap mt-5">
          <div>
            <label className="block text-[11px] opacity-75 mb-1">من شهر</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="text-gray-800 rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] opacity-75 mb-1">إلى شهر</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="text-gray-800 rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] opacity-75">المراكب ({selVessels.length}/{data.vessels.length})</label>
              <button onClick={() => setSelVessels(data.vessels)} className="text-[11px] underline opacity-80 hover:opacity-100">تحديد الكل</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.vessels.map((v, i) => {
                const on = selVessels.includes(v);
                const c = VESSEL_COLORS[i % VESSEL_COLORS.length];
                return (
                  <button key={v} onClick={() => toggleVessel(v)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${on ? 'bg-white text-gray-800 border-white font-semibold shadow-sm' : 'bg-transparent text-white/70 border-white/30 hover:border-white/60'}`}>
                    <span className="inline-block w-2 h-2 rounded-full ml-1 align-middle" style={{ background: on ? c : 'currentColor' }} />
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>


      {/* ── مرجعية القراءة ── */}
      {showSource && data.source && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-bold text-slate-800">📄 مرجعية القراءة — من أين تأتي أرقام هذه اللوحة</h3>
            <button onClick={() => setShowSource(false)} className="text-slate-400 hover:text-slate-700 text-sm">إغلاق ✕</button>
          </div>

          <div className="p-5 space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500 mb-1">المصدر</div>
                <a href={data.source.sheetUrl} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-semibold break-all">
                  جوجل شيت — افتح الملف ↗
                </a>
                <div className="text-[11px] text-slate-400 mt-1 font-mono break-all">{data.source.sheetId}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500 mb-1">التحديث</div>
                <div className="text-slate-700">
                  يُجلب الملف حيّاً · ذاكرة مؤقّتة {data.source.cacheMinutes} دقائق
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  آخر جلب ناجح: {new Date(data.source.fetchedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            {/* نبض السحب اليومي */}
            {data.source.lastImport && (
              <div className={`rounded-xl border p-3 ${data.source.lastImport.stale
                ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                {data.source.lastImport.at ? (
                  <>
                    <div className="font-bold">
                      {data.source.lastImport.stale ? '⚠ السحب اليومي متوقّف' : '✓ السحب اليومي يعمل'}
                      <span className="font-normal"> — آخر سحبٍ منذ {data.source.lastImport.ageHours} ساعة</span>
                    </div>
                    <div className="text-[12px] mt-1">
                      {new Date(data.source.lastImport.at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                      {data.source.lastImport.status && <> · الحالة: {data.source.lastImport.status}</>}
                      {data.source.lastImport.stale
                        ? ' · المفترض ثلاث مرّات يومياً. راجع المشغّلات في محرّر السكربت.'
                        : ' · ثلاث مرّات يومياً'}
                    </div>
                  </>
                ) : (
                  <div className="font-bold">
                    ⚠ لا سجلَّ سحبٍ في الشيت — الدفاتر لا تُحدَّث تلقائياً
                  </div>
                )}
              </div>
            )}

            {data.source.stale && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
                <div className="font-bold">⚠ هذه أرقام قديمة، لا حيّة.</div>
                <div className="mt-1 text-[13px]">
                  تعذّرت آخر قراءة فعُرضت آخر نسخة ناجحة. السبب: {data.source.staleReason}
                </div>
              </div>
            )}

            {srcMissing > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <div className="font-bold">⚠ أعمدة لم يُطابَق عنوانها — قيمتها تُقرأ صفراً.</div>
                <div className="mt-1 text-[13px]">
                  التفسير يطابق العناوين العربية لا أرقام الأعمدة، فتغيير عنوانٍ في
                  الشيت يُسقط عموده بلا خطأ. صحّح العنوان في الشيت ثم اضغط «تحديث».
                </div>
              </div>
            )}

            {data.source.tabs.map((t) => (
              <div key={t.name} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-slate-800">{t.name}</span>
                  <span className="text-[12px] text-slate-500">{t.role}</span>
                  <span className="ms-auto text-[11px] text-slate-500">
                    {t.found
                      ? <>صف العناوين {t.headerRow ?? '—'} · {fmt(t.rows)} صفاً مقروءاً</>
                      : <span className="text-rose-600 font-bold">التبويب غير موجود</span>}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-slate-500 bg-white">
                      <tr className="text-start">
                        <th className="px-3 py-1.5 font-medium text-start">المؤشّر على الشاشة</th>
                        <th className="px-3 py-1.5 font-medium text-start">العنوان في الشيت</th>
                        <th className="px-3 py-1.5 font-medium text-start">العمود</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.columns.map((c) => (
                        <tr key={c.field} className={c.column ? '' : 'bg-amber-50'}>
                          <td className="px-3 py-1.5 text-slate-700">{c.label}</td>
                          <td className="px-3 py-1.5 text-slate-600">
                            {c.header || <span className="text-amber-700 font-semibold">لم يُوجَد</span>}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{c.column || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600 leading-relaxed space-y-1.5">
              <p>
                المؤشّرات تُجمَع من صفوف <span className="font-mono">LookerMonthly</span> ضمن الفترة والمراكب المختارة.
                و«متوسّط الصافي للرحلة» يُحسَب هنا قسمةً — الصافي على عدد الرحلات — ولا يُقرأ من الشيت.
              </p>
              <p className="text-amber-800">
                <span className="font-bold">انتبه:</span> بطاقة «المصروفات» لا تشمل العمولات — العمولات عمودٌ مستقلّ
                في <span className="font-mono">LookerData</span> ولا يظهر على هذه اللوحة. فالمعادلة القائمة هي
                <span className="font-mono mx-1 whitespace-nowrap">الإيراد − المصروفات − العمولات = الصافي</span>،
                ولذلك لا يساوي «الإيراد ناقص المصروفات» صافيَ الربح.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* مبدّل العرض — الكلاسيكي يبقى حتى يستقرّ الشكل */}
      <div className="flex items-center gap-1.5 justify-end">
        {([['draft', 'الغاطس'], ['classic', 'الكلاسيكي']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setDesign(k)} aria-pressed={design === k}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
              design === k ? 'bg-[#00283A] text-white border-[#00283A]' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {design === 'draft' ? (
        <FleetInstrument
          perVessel={perVessel} totals={totals} prevTotals={prevTotals}
          fleetMonthly={fleetMonthly} monthsInRange={monthsInRange} monthLabel={monthLabel}
          metric={metric} setMetric={(k) => setMetric(k as any)} metrics={METRICS}
          periodLabel={`${monthLabel(monthsInRange[0] || from)} — ${monthLabel(monthsInRange[monthsInRange.length - 1] || to)}`}
        />
      ) : (<>
      {/* ── بطاقات المؤشرات ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const cur = totals[m.key] || 0;
          const prev = prevTotals[m.key] || 0;
          const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
          const up = cur >= prev;
          const good = pct == null ? null : (up === m.goodUp);
          const spark = fleetMonthly.map((x) => Number(x[m.key]) || 0);
          const active = metric === m.key;
          return (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`text-right bg-white rounded-2xl border p-4 transition-all hover:shadow-md ${active ? 'ring-2 shadow-md' : 'border-gray-100 shadow-sm'}`}
              style={active ? { borderColor: m.color, boxShadow: `0 0 0 2px ${m.color}33` } : {}}>
              <div className="flex items-center justify-between">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${m.color}15` }}>{m.icon}</span>
                {pct != null && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${good ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {up ? '▲' : '▼'} {fmt1(Math.abs(pct))}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">{m.label}{m.money ? ' ($)' : ''}</p>
              <p className="text-2xl font-extrabold text-gray-800 mt-0.5 tabular-nums" title={fmt(cur)}>{m.money ? fmtC(cur) : fmt(cur)}</p>
              <div className="mt-2 h-7"><Sparkline values={spark} color={m.color} /></div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── مقارنة المراكب ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">ترتيب المراكب</h3>
            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: `${activeMetric.color}15`, color: activeMetric.color }}>{activeMetric.icon} {activeMetric.label}</span>
          </div>
          <div className="space-y-3">
            {rankedByMetric.map((v, rank) => {
              const val = Number(v[metric]) || 0;
              const showShare = totals[metric] > 0 && metric !== 'net' && metric !== 'liquidity';
              const share = showShare ? (val / totals[metric]) * 100 : 0;
              const i = data.vessels.indexOf(v.vessel);
              const c = VESSEL_COLORS[i % VESSEL_COLORS.length];
              return (
                <div key={v.vessel}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                      <span className="w-5 text-center">{RANK_BADGE[rank] || `${rank + 1}.`}</span>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />
                      {v.vessel}
                    </span>
                    <span className="text-gray-500 tabular-nums">{fmt(val)}{activeMetric.money ? ' $' : ''}{showShare ? ` · ${fmt1(share)}%` : ''}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(Math.abs(val) / maxMetric) * 100}%`, background: val < 0 ? 'linear-gradient(90deg,#f87171,#dc2626)' : `linear-gradient(90deg,${c},${c}bb)` }} />
                  </div>
                </div>
              );
            })}
            {rankedByMetric.length === 0 && <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات في الفترة</p>}
          </div>
        </div>

        {/* ── الاتجاه الشهري ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">الاتجاه الشهري</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* مبدّل نوع المخطط */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                {CHART_TYPES.map((c) => (
                  <button key={c.key} onClick={() => setChartType(c.key)} title={c.label}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${chartType === c.key ? 'bg-white shadow-sm text-indigo-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>
                    <span>{c.icon}</span><span className="hidden sm:inline">{c.label}</span>
                  </button>
                ))}
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: `${activeMetric.color}15`, color: activeMetric.color }}>{activeMetric.icon} {activeMetric.label}</span>
            </div>
          </div>
          <TrendChart months={monthsInRange} series={series} money={activeMetric.money} type={chartType} />
        </div>
      </div>

      {/* ── اختيار المؤشر ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex items-center gap-1.5 flex-wrap">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            className={`text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 ${metric === m.key ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            style={metric === m.key ? { background: m.color } : {}}>
            <span>{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      </>)}

      {/* ── جدول الأداء ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 overflow-x-auto">
        <h3 className="font-bold text-gray-800 mb-3">جدول الأداء التفصيلي <span className="text-xs font-normal text-gray-400">(اضغط العنوان للفرز)</span></h3>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-gray-500 text-xs border-b-2 border-gray-100">
              <th scope="col" className="text-right py-2.5 px-2 sticky right-0 bg-white">المركب</th>
              {METRICS.map((m) => (
                <th scope="col" key={m.key} onClick={() => setSortKey(m.key)} className={`text-left py-2.5 px-2 cursor-pointer select-none hover:text-indigo-600 ${sortKey === m.key ? 'text-indigo-600 font-bold' : ''}`}>
                  {m.label}{sortKey === m.key ? ' ▾' : ''}
                </th>
              ))}
              <th scope="col" className="text-left py-2.5 px-2">متوسط الصافي/رحلة</th>
            </tr>
          </thead>
          <tbody>
            {rankedTable.map((v) => {
              const i = data.vessels.indexOf(v.vessel);
              const isTop = v.vessel === topVessel;
              return (
                <tr key={v.vessel} className={`border-b border-gray-50 hover:bg-indigo-50/40 transition-colors ${isTop ? 'bg-emerald-50/40' : ''}`}>
                  <td className="py-2.5 px-2 font-semibold sticky right-0 bg-inherit">
                    <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: VESSEL_COLORS[i % VESSEL_COLORS.length] }} />
                    {v.vessel}{isTop && <span className="text-[10px] text-emerald-600 mr-1">★</span>}
                  </td>
                  {METRICS.map((m) => (
                    <td key={m.key} className={`text-left py-2.5 px-2 tabular-nums ${m.key === 'net' ? (v.net >= 0 ? 'text-emerald-700 font-medium' : 'text-red-600 font-medium') : 'text-gray-700'}`}>{fmt(Number(v[m.key]) || 0)}</td>
                  ))}
                  <td className="text-left py-2.5 px-2 text-indigo-700 font-semibold tabular-nums">{fmt(v.avgNet)}</td>
                </tr>
              );
            })}
            {rankedTable.length > 0 && (
              <tr className="border-t-2 border-gray-200 font-extrabold bg-gray-50/60">
                <td className="py-2.5 px-2 sticky right-0 bg-gray-50">الإجمالي</td>
                {METRICS.map((m) => <td key={m.key} className="text-left py-2.5 px-2 tabular-nums">{fmt(totals[m.key] || 0)}</td>)}
                <td className="text-left py-2.5 px-2 text-indigo-800 tabular-nums">{fmt(totals.avgNet || 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FleetAssistant filters={{ from, to, vessels: selVessels }} />
    </div>
  );
}

// ── Sparkline صغير للبطاقات ──
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const W = 100, H = 28, P = 2;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const n = values.length;
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i / (n - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${H} ${pts} ${x(n - 1)},${H}`;
  const gid = `sg-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {n > 1 && <polygon points={area} fill={`url(#${gid})`} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── رسم الاتجاه متعدد المراكب (خطّي / أعمدة / مساحة) ──
function TrendChart({ months, series, money, type }: { months: string[]; series: { name: string; color: string; values: number[] }[]; money: boolean; type: ChartType }) {
  const W = 560, H = 250, PL = 46, PR = 14, PT = 12, PB = 30;
  const iw = W - PL - PR, ih = H - PT - PB;
  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const n = months.length;
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - ((v - min) / (max - min || 1)) * ih;
  const baseY = y(0); // خط الصفر (يدعم القيم السالبة)
  const ticks = 4;
  if (!n) return <p className="text-gray-400 text-sm text-center py-12">لا توجد بيانات في الفترة</p>;
  if (type === 'donut') return <DonutView series={series} money={money} />;

  // هندسة الأعمدة المجمّعة
  const spacing = n > 1 ? iw / (n - 1) : iw;
  const groupW = Math.min(spacing * 0.62, 46);
  const barW = groupW / Math.max(1, series.length);

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 340 }}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`tc-area-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={series.length === 1 ? '0.28' : '0.20'} />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* شبكة + محور القيم */}
          {Array.from({ length: ticks + 1 }).map((_, t) => {
            const val = min + ((max - min) * t) / ticks;
            const yy = y(val);
            return (
              <g key={t}>
                <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="#f1f5f9" />
                <text x={PL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{money ? fmtC(val) : fmt1(val)}</text>
              </g>
            );
          })}
          {/* خط الصفر أوضح لو فيه قيم سالبة */}
          {min < 0 && <line x1={PL} y1={baseY} x2={W - PR} y2={baseY} stroke="#cbd5e1" strokeDasharray="3 3" />}
          {months.map((m, i) => (
            <text key={m} x={x(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#94a3b8">{monthLabel(m)}</text>
          ))}

          {/* أعمدة مجمّعة */}
          {type === 'bars' && series.map((s, si) => (
            <g key={s.name}>
              {s.values.map((v, i) => {
                const bx = x(i) - groupW / 2 + si * barW;
                const yv = y(v);
                const top = Math.min(yv, baseY), h = Math.max(1.5, Math.abs(yv - baseY));
                return <rect key={i} x={bx} y={top} width={barW * 0.82} height={h} rx="1.5" fill={s.color} opacity="0.92" />;
              })}
            </g>
          ))}

          {/* مساحة (تعبئة تحت كل خط) */}
          {type === 'area' && series.map((s, si) => (
            <polygon key={s.name}
              points={`${x(0)},${baseY} ${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(n - 1)},${baseY}`}
              fill={`url(#tc-area-${si})`} />
          ))}

          {/* خطوط + نقاط (للخطّي والمساحة) */}
          {(type === 'line' || type === 'area') && series.map((s) => (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#fff" stroke={s.color} strokeWidth="1.5" />)}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
        {series.map((s) => (
          <span key={s.name} className="text-xs text-gray-600 flex items-center gap-1.5">
            <span className="inline-block w-3 h-1.5 rounded-full" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── مخطط حلقي: حصة كل مركب من إجمالي المؤشر خلال الفترة ──
function DonutView({ series, money }: { series: { name: string; color: string; values: number[] }[]; money: boolean }) {
  const items = series.map((s) => ({ name: s.name, color: s.color, total: s.values.reduce((a, b) => a + (Number(b) || 0), 0) }));
  const hasNeg = items.some((i) => i.total < 0);
  const mag = items.map((i) => Math.abs(i.total));
  const sumMag = mag.reduce((a, b) => a + b, 0);
  if (!sumMag) return <p className="text-gray-400 text-sm text-center py-12">لا توجد بيانات في الفترة</p>;

  const cx = 110, cy = 110, R = 92, r = 54;
  const P = (rad: number, ang: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
  const nonZero = items.filter((_, i) => mag[i] > 0);
  let a = -Math.PI / 2;
  const slices = items.map((it, i) => {
    const frac = mag[i] / sumMag;
    const a0 = a, a1 = a + frac * Math.PI * 2;
    a = a1;
    return { ...it, i, frac, a0, a1, pct: Math.round(frac * 100) };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox="0 0 220 220" className="shrink-0" style={{ width: 200, height: 200 }}>
        {nonZero.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={R} fill={nonZero[0].color} />
            <circle cx={cx} cy={cy} r={r} fill="#fff" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">100%</text>
          </>
        ) : slices.map((s) => {
          if (s.frac <= 0) return null;
          const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
          const [ox0, oy0] = P(R, s.a0), [ox1, oy1] = P(R, s.a1), [ix1, iy1] = P(r, s.a1), [ix0, iy0] = P(r, s.a0);
          const d = `M${ox0},${oy0} A${R},${R} 0 ${large} 1 ${ox1},${oy1} L${ix1},${iy1} A${r},${r} 0 ${large} 0 ${ix0},${iy0} Z`;
          const mid = (s.a0 + s.a1) / 2, [lx, ly] = P((R + r) / 2, mid);
          return (
            <g key={s.name}>
              <path d={d} fill={s.color} />
              {s.pct >= 6 && <text x={lx} y={ly + 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{s.pct}%</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex-1 w-full space-y-1.5">
        {slices.slice().sort((x, y2) => y2.frac - x.frac).map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-gray-700 font-medium flex-1 truncate">{s.name}</span>
            <span className="text-gray-500 tabular-nums">{money ? fmtC(s.total) : fmt(s.total)}</span>
            <span className="text-gray-800 font-bold tabular-nums w-10 text-left">{s.pct}%</span>
          </div>
        ))}
        {hasNeg && <p className="text-[11px] text-amber-600 mt-1">النسب محسوبة حسب القيمة المطلقة (المؤشر يحتمل قيماً سالبة).</p>}
      </div>
    </div>
  );
}

// ── حالة التحميل (skeleton) ──
function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse" dir="rtl">
      <div className="h-32 rounded-2xl bg-gradient-to-l from-indigo-200 to-blue-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-gray-100" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-2xl bg-gray-100" />
        <div className="h-72 rounded-2xl bg-gray-100" />
      </div>
      <div className="h-64 rounded-2xl bg-gray-100" />
    </div>
  );
}
