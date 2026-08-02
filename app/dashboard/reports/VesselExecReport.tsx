'use client';
import { useMemo, useState } from 'react';
import type { VesselConfig } from './VesselProfitReport';

export interface ExecLine { key: string; label: string; value: number }
export interface ExecVoyage { ref: string; revenue: number; expenses: number; net: number; supplies: number }
export interface ExecData {
  perVoyage: ExecVoyage[];
  revenue: number;
  opExpenses: number;   // إجمالي مصروفات التشغيل (الإيراد − الصافي التشغيلي)
  opNet: number;        // الصافي التشغيلي (عمود Balance)
  purchasesTotal: number;
  bunkerCost: number;   // إجمالي تكلفة البنكر المستهلك (أول + تموينات − آخر)
  salaries: number;     // إجمالي مرتبات الشهر
  count: number;
  costLines: ExecLine[];        // بنود مصروفات التشغيل + المشتريات
  defaultBuckets: Record<string, string>;
}

type Lang = 'ar' | 'en' | 'both';
type Alloc = 'mixed' | 'revenue' | 'equal';

const BUCKETS = [
  { id: 'fuel', ar: 'الوقود (بنكر)', en: 'Fuel (bunker)', color: '#1e3a5f' },
  { id: 'agent', ar: 'عمولات الوكلاء', en: 'Agent commissions', color: '#5b9e77' },
  { id: 'port', ar: 'ميناء ومناولة', en: 'Port & handling', color: '#9cc3ac' },
  { id: 'fixed', ar: 'تكاليف تشغيل ثابتة', en: 'Fixed operating', color: '#3f5f8a' },
  { id: 'purchases', ar: 'المشتريات', en: 'Purchases', color: '#c98b6b' },
  { id: 'other', ar: 'أخرى', en: 'Other', color: '#c0c7d0' },
];
const BUCKET_IDS = BUCKETS.map((b) => b.id);

const fmtFull = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtAbbr = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${Math.round(a)}`;
};
const pct = (n: number) => `${Math.round(n)}%`;

export default function VesselExecReport({
  cfg, month, monthLabel, exec, onClose,
}: { cfg: VesselConfig; month: string; monthLabel: string; exec: ExecData; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>('both');
  const [alloc, setAlloc] = useState<Alloc>('mixed');
  const [showMap, setShowMap] = useState(false);
  const [buckets, setBuckets] = useState<Record<string, string>>(() => {
    const b: Record<string, string> = {};
    for (const l of exec.costLines) b[l.key] = exec.defaultBuckets[l.key] || 'other';
    return b;
  });

  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : lang === 'en' ? en : `${ar} · ${en}`);

  const totalExpenses = exec.opExpenses + exec.purchasesTotal;
  const finalNet = exec.opNet - exec.purchasesTotal;
  const margin = exec.revenue ? (finalNet / exec.revenue) * 100 : 0;

  // توزيع البنكر والمرتبات والمشتريات على الرحلات → صافي أقرب للحقيقة (مجموعه = الصافي النهائي)
  const allocVoyages = useMemo(() => {
    const per = exec.perVoyage;
    const n = per.length || 1;
    const sumRev = per.reduce((s, v) => s + v.revenue, 0);
    const sumSup = per.reduce((s, v) => s + (v.supplies || 0), 0);
    const ovh = exec.salaries + exec.purchasesTotal; // مرتبات + مشتريات
    return per.map((v) => {
      let bW: number, oW: number;
      if (alloc === 'equal') { bW = 1 / n; oW = 1 / n; }
      else if (alloc === 'revenue') { bW = sumRev ? v.revenue / sumRev : 1 / n; oW = bW; }
      else { bW = sumSup ? (v.supplies || 0) / sumSup : 1 / n; oW = sumRev ? v.revenue / sumRev : 1 / n; }
      const net = (v.net + (v.supplies || 0)) - exec.bunkerCost * bW - ovh * oW;
      return { ...v, net, expenses: v.revenue - net };
    });
  }, [exec, alloc]);

  // تجميع التكاليف حسب المجموعة (مع بند تسوية داخل "أخرى" ليطابق إجمالي المصروفات)
  const cost = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const id of BUCKET_IDS) totals[id] = 0;
    let opItemized = 0;
    for (const l of exec.costLines) {
      const b = buckets[l.key] || 'other';
      totals[b] += l.value;
      if (l.key !== 'purchases') opItemized += l.value;
    }
    const reconcile = exec.opExpenses - opItemized; // فرق التسوية (صافي Balance مقابل البنود)
    totals.other += reconcile;
    const grand = BUCKET_IDS.reduce((s, id) => s + Math.max(0, totals[id]), 0) || 1;
    const segs = BUCKETS
      .map((b) => ({ ...b, value: totals[b.id], share: Math.max(0, totals[b.id]) / grand }))
      .filter((s) => s.value > 0.5)
      .sort((a, b) => b.value - a.value);
    return { segs, total: totalExpenses };
  }, [buckets, exec, totalExpenses]);

  const bestHalfNote = useMemo(() => {
    const v = allocVoyages;
    if (v.length < 4) return '';
    const mid = Math.ceil(v.length / 2);
    const avg = (arr: ExecVoyage[]) => arr.reduce((s, x) => s + x.net, 0) / (arr.length || 1);
    const h1 = avg(v.slice(0, mid)), h2 = avg(v.slice(mid));
    if (h2 > h1) return L(`النصف الثاني من الشهر تفوّق على الأول — بمتوسط ${fmtAbbr(h2)} مقابل ${fmtAbbr(h1)} للرحلة.`,
      `The second half of the month outperformed the first — averaging ${fmtAbbr(h2)} net vs ${fmtAbbr(h1)}.`);
    return L(`النصف الأول من الشهر تفوّق على الثاني — بمتوسط ${fmtAbbr(h1)} مقابل ${fmtAbbr(h2)} للرحلة.`,
      `The first half of the month outperformed the second — averaging ${fmtAbbr(h1)} net vs ${fmtAbbr(h2)}.`);
  }, [allocVoyages, lang]);

  const peak = allocVoyages.reduce((a, b) => (b.net > a.net ? b : a), allocVoyages[0]);
  const low = allocVoyages.reduce((a, b) => (b.net < a.net ? b : a), allocVoyages[0]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{PRINT_CSS}</style>

      {/* toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <span className="font-bold text-gray-800">التقرير الإداري — {cfg.vessel} · {monthLabel}</span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {(['ar', 'both', 'en'] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-1 rounded-md ${lang === l ? 'bg-white shadow text-blue-700 font-medium' : 'text-gray-500'}`}>
              {l === 'ar' ? 'عربي' : l === 'en' ? 'English' : 'ثنائي'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowMap((v) => !v)} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">🎛️ تعديل توزيع التكاليف</button>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 text-xs" title="أساس توزيع البنكر والمرتبات والمشتريات على الرحلات">
          <span className="text-gray-500 px-1">توزيع التكلفة:</span>
          {([['mixed', 'مختلط'], ['revenue', 'حسب الإيراد'], ['equal', 'بالتساوي']] as [Alloc, string][]).map(([a, l]) => (
            <button key={a} onClick={() => setAlloc(a)}
              className={`px-2 py-1 rounded-md ${alloc === a ? 'bg-white shadow text-blue-700 font-medium' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={() => window.print()} className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black">🖨️ طباعة / PDF</button>
          <button onClick={onClose} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">إغلاق</button>
        </div>
      </div>

      {/* cost-bucket editor */}
      {showMap && (
        <div className="bg-white border-b px-4 py-3 print:hidden">
          <p className="text-sm text-gray-600 mb-2">وزّع كل بند على مجموعته — الدائرة بتتحدّث فوراً:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {exec.costLines.filter((l) => l.key !== 'purchases').map((l) => (
              <div key={l.key} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5">
                <span className="flex-1 truncate">{l.label} <span className="text-gray-400">({fmtFull(l.value)})</span></span>
                <select value={buckets[l.key]} onChange={(e) => setBuckets((b) => ({ ...b, [l.key]: e.target.value }))}
                  className="border rounded-md px-2 py-1 text-xs">
                  {BUCKETS.filter((b) => b.id !== 'purchases').map((b) => <option key={b.id} value={b.id}>{b.ar}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── slides ── */}
      <div id="exec-doc" dir={dir} className="max-w-[1000px] mx-auto p-4 space-y-6 print:max-w-none print:p-0 print:space-y-0">

        {/* Slide 1 — Executive Summary */}
        <Slide>
          <SlideTitle title={L('الملخص التنفيذي', 'Executive Summary')}
            sub={L(`${exec.count} رحلة مكتملة · القيم بالدولار`, `${exec.count} completed voyages · figures in USD`)} />
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { v: String(exec.count), l: L('عدد الرحلات', 'Voyages completed'), green: false },
              { v: fmtAbbr(exec.revenue), l: L('إجمالي الإيراد', 'Total revenue'), green: false },
              { v: fmtAbbr(totalExpenses), l: L('إجمالي المصروفات', 'Total expenses'), green: false },
              { v: fmtAbbr(finalNet), l: L('صافي الربح', 'Net profit'), green: true },
              { v: fmtAbbr(finalNet / (exec.count || 1)), l: L('متوسط الربح/رحلة', 'Avg. profit / voyage'), green: true },
              { v: pct(margin), l: L('هامش صافي الربح', 'Net profit margin'), green: true },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-8 text-center">
                <p className={`text-4xl font-extrabold ${k.green ? 'text-emerald-500' : 'text-[#1e3a5f]'}`}>{k.v}</p>
                <p className="text-gray-500 text-sm mt-3">{k.l}</p>
              </div>
            ))}
          </div>
          <SlideNote text={bestHalfNote} />
        </Slide>

        {/* Slide 2 — Net Profit by Voyage */}
        <Slide>
          <SlideTitle title={L('صافي الربح لكل رحلة', 'Net Profit by Voyage')}
            sub={L('بالدولار — بعد توزيع البنكر والمرتبات والمشتريات على الرحلات', 'USD — after allocating bunker, salaries and purchases to voyages')} />
          <div className="flex gap-4 mt-4">
            <div className="flex-1">
              <BarChart data={allocVoyages.map((v) => ({ label: v.ref, value: v.net }))} color="#5b9e77" />
            </div>
            <div className="w-44 flex flex-col gap-3 justify-center">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-emerald-600 text-xs font-bold tracking-wider">PEAK</p>
                <p className="text-3xl font-extrabold text-[#1e3a5f]">{fmtAbbr(peak?.net || 0)}</p>
                <p className="text-gray-500 text-xs mt-1">{L(`رحلة ${peak?.ref} — الأعلى`, `Voyage ${peak?.ref} — highest`)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-red-500 text-xs font-bold tracking-wider">LOW</p>
                <p className="text-3xl font-extrabold text-[#1e3a5f]">{fmtAbbr(low?.net || 0)}</p>
                <p className="text-gray-500 text-xs mt-1">{L(`رحلة ${low?.ref} — الأقل`, `Voyage ${low?.ref} — lowest`)}</p>
              </div>
            </div>
          </div>
        </Slide>

        {/* Slide 3 — Revenue vs Expenses */}
        <Slide>
          <SlideTitle title={L('الإيراد مقابل المصروف', 'Revenue vs. Expenses')}
            sub={L('بالدولار لكل رحلة', 'USD per voyage')} />
          <div className="flex justify-center gap-6 text-sm mt-2 mb-1">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1e3a5f' }} />{L('الإيراد', 'Revenue')}</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#5b9e77' }} />{L('المصروف', 'Expenses')}</span>
          </div>
          <GroupedBarChart data={allocVoyages.map((v) => ({ label: v.ref, a: v.revenue, b: v.expenses }))} colorA="#1e3a5f" colorB="#5b9e77" />
        </Slide>

        {/* Slide 4 — Cost Structure */}
        <Slide>
          <SlideTitle title={L('هيكل التكاليف', 'Cost Structure')}
            sub={L(`توزيع إجمالي المصروفات (${fmtAbbr(cost.total)}) خلال ${monthLabel}`, `Share of total expenses (${fmtAbbr(cost.total)}) — ${monthLabel}`)} />
          <div className="flex items-center gap-8 mt-4">
            <Donut segs={cost.segs} />
            <div className="flex-1 space-y-2">
              {cost.segs.map((s) => (
                <div key={s.id} className="flex items-center bg-gray-50 rounded-lg px-4 py-3">
                  <span className="w-3.5 h-3.5 rounded-full inline-block ml-3 mr-0" style={{ background: s.color }} />
                  <span className="flex-1 text-gray-700">{L(s.ar, s.en)}</span>
                  <span className="font-bold text-[#1e3a5f] mx-3">{fmtAbbr(s.value)}</span>
                  <span className="text-gray-400 text-sm w-10 text-left">{pct(s.share * 100)}</span>
                </div>
              ))}
            </div>
          </div>
          <SlideNote text={L(
            'الوقود والعمولات معاً يستهلكان الجزء الأكبر من المصروفات — أهم عوامل تحسين الهامش.',
            'Fuel and agent commissions together absorb the largest share of spend — the biggest levers for margin.')} />
        </Slide>
      </div>
    </div>
  );
}

// ── layout helpers ──
function Slide({ children }: { children: React.ReactNode }) {
  return <div className="exec-slide bg-white rounded-2xl shadow-lg p-10 print:shadow-none print:rounded-none">{children}</div>;
}
function SlideTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-3xl font-extrabold text-[#1e3a5f]">{title}</h2>
      <p className="text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
function SlideNote({ text }: { text: string }) {
  if (!text) return null;
  return <p className="italic text-gray-500 text-sm mt-8 border-t pt-4">{text}</p>;
}

// ── charts (pure SVG) ──
function niceMax(v: number) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
const kLabel = (n: number) => `$${Math.round(n / 1000)}K`;

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const W = 900, H = 380, m = { l: 55, r: 15, t: 30, b: 35 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const bw = (pw / data.length) * 0.6;
  const gap = (pw / data.length);
  const ticks = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" fontFamily="inherit">
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = m.t + (ph / ticks) * i;
        const val = max - (max / ticks) * i;
        return (<g key={i}>
          <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#eef0f3" />
          <text x={m.l - 8} y={y + 4} textAnchor="end" fontSize="12" fill="#9aa3ad">{kLabel(val)}</text>
        </g>);
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * ph;
        const x = m.l + gap * i + (gap - bw) / 2;
        const y = m.t + ph - h;
        return (<g key={i}>
          <rect x={x} y={y} width={bw} height={h} fill={color} rx="2" />
          <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="12" fill="#43506180" fontWeight="600">{kLabel(d.value)}</text>
          <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize="12" fill="#6b7480">{d.label}</text>
        </g>);
      })}
    </svg>
  );
}

function GroupedBarChart({ data, colorA, colorB }: { data: { label: string; a: number; b: number }[]; colorA: string; colorB: string }) {
  const W = 960, H = 420, m = { l: 55, r: 15, t: 20, b: 35 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.a, d.b])));
  const gap = pw / data.length;
  const bw = (gap * 0.7) / 2;
  const ticks = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" fontFamily="inherit">
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = m.t + (ph / ticks) * i;
        const val = max - (max / ticks) * i;
        return (<g key={i}>
          <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#eef0f3" />
          <text x={m.l - 8} y={y + 4} textAnchor="end" fontSize="12" fill="#9aa3ad">{kLabel(val)}</text>
        </g>);
      })}
      {data.map((d, i) => {
        const cx = m.l + gap * i + gap / 2;
        const ha = (d.a / max) * ph, hb = (d.b / max) * ph;
        return (<g key={i}>
          <rect x={cx - bw - 1} y={m.t + ph - ha} width={bw} height={ha} fill={colorA} rx="2" />
          <rect x={cx + 1} y={m.t + ph - hb} width={bw} height={hb} fill={colorB} rx="2" />
          <text x={cx} y={H - 12} textAnchor="middle" fontSize="12" fill="#6b7480">{d.label}</text>
        </g>);
      })}
    </svg>
  );
}

function Donut({ segs }: { segs: { color: string; share: number }[] }) {
  const size = 260, sw = 42, r = (size - sw) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90 ${c} ${c})`}>
        {segs.map((s, i) => {
          const len = s.share * circ;
          const el = (<circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} />);
          acc += len;
          return el;
        })}
      </g>
    </svg>
  );
}

const PRINT_CSS = `@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body * { visibility: hidden !important; }
  #exec-doc, #exec-doc * { visibility: visible !important; }
  #exec-doc { position: absolute; left: 0; top: 0; width: 100%; }
  #exec-doc .exec-slide { page-break-after: always; break-after: page; min-height: 185mm; box-sizing: border-box; }
  #exec-doc .exec-slide:last-child { page-break-after: auto; }
}`;
