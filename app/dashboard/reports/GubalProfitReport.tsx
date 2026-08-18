'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';

/*
 * ── خريطة الأعمدة تُقرأ من الملفّ لا تُثبَّت فيه ──
 *
 * الأرقام أدناه احتياطٌ لا مرجع. الملفّ يحمل رؤوس مجموعاته في صفٍّ خاص —
 * `Crew Cost` و`SPARE PARTS` و`TOTAL COST` — وكل مجموعة تمتدّ من رأسها إلى ما
 * قبل الرأس التالي. فتُشتقّ الحدود منها في كل رفع.
 *
 * ولهذا سببٌ وقع فعلاً: نسخة 2026 حذفت مجموعة «المنهالي» (ستّة أعمدة) وأضافت
 * ثلاثة موردين إلى «خدمات أخرى»، فانزاح ما بعدهما ثلاثة. والأرقام المثبَّتة
 * جعلت `TOTAL COST` يُقرأ من عمودٍ فارغ — **صفراً** — بينما الإيراد يُقرأ صحيحاً.
 * تقريرٌ بتكاليف صفر يبدو كشهرٍ ممتاز، ولا شيء فيه يشي بالخطأ.
 */
const INCOME_SPAN: [number, number] = [2, 13];
const COL = { incomeTotal: 14, costTotal: 197, net: 199 };
const COST_GROUPS: { id: string; ar: string; en: string; a: number; b: number; color: string }[] = [
  { id: 'bunker', ar: 'الوقود والزيوت', en: 'Bunker & lubricant', a: 16, b: 17, color: '#1e3a5f' },
  { id: 'crew', ar: 'تكاليف الطاقم', en: 'Crew cost', a: 19, b: 23, color: '#5b9e77' },
  { id: 'spare', ar: 'قطع الغيار', en: 'Spare parts', a: 107, b: 193, color: '#9cc3ac' },
  { id: 'insurance', ar: 'التأمين والتصنيف', en: 'Insurance & class', a: 24, b: 29, color: '#3f5f8a' },
  { id: 'ksa', ar: 'وكيل السعودية', en: 'KSA agent', a: 30, b: 43, color: '#c98b6b' },
  { id: 'egypt', ar: 'وكيل مصر', en: 'Egypt agent', a: 47, b: 60, color: '#7a6ff0' },
  { id: 'sudan', ar: 'وكيل السودان', en: 'Sudan agent', a: 44, b: 46, color: '#d4537e' },
  { id: 'otherRel', ar: 'خدمات أخرى متعلقة', en: 'Other related services', a: 70, b: 106, color: '#63992a' },
  { id: 'depreciation', ar: 'الإهلاك', en: 'Depreciation', a: 18, b: 18, color: '#b07a2f' },
  { id: 'menhali', ar: 'المنهالي (KSA)', en: 'EL-MENHALI', a: 64, b: 69, color: '#2f8f8f' },
  { id: 'malta', ar: 'وسطاء مالطا', en: 'Malta shipbrokers', a: 62, b: 62, color: '#8f6f2f' },
  { id: 'umeab', ar: 'UME Shipping AB', en: 'UME Shipping AB', a: 63, b: 63, color: '#6f8f2f' },
  { id: 'masterSafe', ar: 'عهدة الكابتن', en: 'Master safe', a: 61, b: 61, color: '#996699' },
  { id: 'others', ar: 'أخرى (إدارة/حوض جاف/دبي)', en: 'Others (mgmt/dry dock/office)', a: 194, b: 196, color: '#8a94a6' },
];

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (k: string) => { const [y, m] = k.split('-'); return `${MONTH_AR[+m - 1]} ${y}`; };
const num = (v: any) => (typeof v === 'number' ? v : 0);
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtAbbr = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${Math.round(a)}`;
};

interface Line { label: string; value: number }
interface GubalMonth {
  key: string; label: string;
  incomeLines: Line[]; incomeTotal: number;
  groups: { id: string; total: number; lines: Line[] }[];
  costTotal: number; net: number;
}

/** رأس المجموعة كما يكتبه الملفّ → مُعرّفها عندنا. الأخصّ أولاً. */
const GROUP_HEADS: [RegExp, string][] = [
  [/other\s*related/i, 'otherRel'],
  [/spare\s*parts/i, 'spare'],
  [/bunker/i, 'bunker'],
  [/depreciat/i, 'depreciation'],
  [/crew/i, 'crew'],
  [/insurance/i, 'insurance'],
  [/ksa\s*agent/i, 'ksa'],
  [/sudan\s*agent/i, 'sudan'],
  [/egypt\s*agent/i, 'egypt'],
  [/master\s*safe/i, 'masterSafe'],
  [/malta/i, 'malta'],
  [/ume\s*shipping/i, 'umeab'],
  [/menhali/i, 'menhali'],
  [/^others?$|^others\b/i, 'others'],
];

export interface SheetMap {
  income: [number, number];
  incomeTotal: number; costTotal: number; net: number;
  ranges: Record<string, [number, number]>;
  found: string[]; missing: string[]; derived: boolean;
}

/**
 * يشتقّ حدود المجموعات من صفّ الرؤوس في الملفّ.
 *
 * كل رأسٍ يبدأ مجموعةً تنتهي قبل الرأس التالي — فإدراج عمودٍ أو حذفه لا يُزحزح
 * شيئاً. وإن خلا الملفّ من الرؤوس رجعنا إلى الأرقام المثبَّتة، ونقول ذلك.
 */
export function deriveMap(g: any[][]): SheetMap {
  const fallback: SheetMap = {
    income: INCOME_SPAN, incomeTotal: COL.incomeTotal, costTotal: COL.costTotal, net: COL.net,
    ranges: Object.fromEntries(COST_GROUPS.map((x) => [x.id, [x.a, x.b] as [number, number]])),
    found: [], missing: [], derived: false,
  };
  // صفّ الرؤوس هو الذي يحمل TOTAL COST — يُبحث عنه لا يُفترض موضعه
  const headRow = g.findIndex((r) => (r || []).some((v) => /total\s*cost/i.test(String(v ?? ''))));
  if (headRow < 0) return fallback;
  const row = g[headRow] || [];

  const marks: { c: number; text: string }[] = [];
  row.forEach((v, c) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (t) marks.push({ c, text: t });
  });
  if (!marks.length) return fallback;

  let incomeTotal = -1, costTotal = -1, net = -1;
  const starts: { id: string; c: number }[] = [];
  for (const mk of marks) {
    if (/total\s*income/i.test(mk.text)) { incomeTotal = mk.c; continue; }
    if (/total\s*cost/i.test(mk.text)) { costTotal = mk.c; continue; }
    if (/^g\s*\.?\s*t\s*o?\s*t/i.test(mk.text.replace(/\s+/g, ' '))) { net = mk.c; continue; }
    const hit = GROUP_HEADS.find(([re]) => re.test(mk.text));
    if (hit) starts.push({ id: hit[1], c: mk.c });
  }
  if (costTotal < 0 || !starts.length) return fallback;

  // نهاية كل مجموعة = ما قبل بداية التالية (أو ما قبل TOTAL COST للأخيرة)
  const bounds = [...starts].sort((a, b) => a.c - b.c);
  const ranges: Record<string, [number, number]> = {};
  bounds.forEach((b, i) => {
    const nextC = i + 1 < bounds.length ? bounds[i + 1].c : costTotal;
    ranges[b.id] = [b.c, Math.max(b.c, nextC - 1)];
  });

  const found = bounds.map((b) => b.id);
  const missing = COST_GROUPS.map((x) => x.id).filter((id) => !ranges[id]);
  return {
    income: [INCOME_SPAN[0], (incomeTotal > 0 ? incomeTotal : COL.incomeTotal) - 1],
    incomeTotal: incomeTotal > 0 ? incomeTotal : COL.incomeTotal,
    costTotal,
    net: net > 0 ? net : costTotal + 2,
    ranges, found, missing, derived: true,
  };
}

function parseWorkbook(wb: XLSX.WorkBook): GubalMonth[] {
  const ws = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
  const g: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const map = deriveMap(g);
  const hdr = g[2] || []; // row index 2 = line-item headers
  const labelOf = (c: number) => String(hdr[c] ?? `عمود ${c}`).replace(/\s+/g, ' ').trim();
  const out: GubalMonth[] = [];
  for (const row of g) {
    if (!row) continue;
    const lbl = String(row[0] ?? '').trim();
    const m = lbl.match(/FM\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
    if (!m) continue;
    const mm = String(+m[2]).padStart(2, '0');
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    const key = `${yy}-${mm}`;
    const incomeLines: Line[] = [];
    for (let c = map.income[0]; c <= map.income[1]; c++) {
      const v = num(row[c]); if (Math.abs(v) > 0.005) incomeLines.push({ label: labelOf(c), value: v });
    }
    const incomeTotal = num(row[map.incomeTotal]);
    const groups = COST_GROUPS.map((grp) => {
      const lines: Line[] = [];
      let total = 0;
      /*
       * مجموعةٌ غابت عن رؤوس الملفّ = غير موجودة فيه، لا «تُقرأ بأرقامها القديمة».
       *
       * «المنهالي» حُذفت من نسخة 2026 وصارت أعمدتها ضمن «خدمات أخرى». والسقوط
       * إلى الأرقام المثبَّتة كان يجمعها **مرّتين** — مرّةً في مكانها القديم
       * ومرّةً ضمن المجموعة التي ابتلعتها.
       */
      const fb: [number, number] = map.derived ? [1, 0] : [grp.a, grp.b];
      const [ga, gb] = map.ranges[grp.id] || fb;
      for (let c = ga; c <= gb; c++) {
        const v = num(row[c]); total += v;
        if (Math.abs(v) > 0.005) lines.push({ label: labelOf(c), value: v });
      }
      return { id: grp.id, total, lines };
    });
    const costTotal = num(row[map.costTotal]);
    const net = num(row[map.net]);
    if (incomeTotal === 0 && costTotal === 0) continue; // skip empty months
    out.push({ key, label: lbl.replace(/\s+/g, ' '), incomeLines, incomeTotal, groups, costTotal, net });
  }
  // دمج أي صفوف بنفس الشهر (منعاً للتكرار المضاعف)
  const byKey = new Map<string, GubalMonth[]>();
  for (const mth of out) { const a = byKey.get(mth.key) || []; a.push(mth); byKey.set(mth.key, a); }
  const deduped: GubalMonth[] = [];
  for (const [key, arr] of byKey) {
    if (arr.length === 1) { deduped.push(arr[0]); continue; }
    const merged = aggregate(arr)!;
    deduped.push({ ...merged, key, label: arr[0].label });
  }
  return deduped.sort((a, b) => a.key.localeCompare(b.key));
}

// aggregate a set of months into one combined period
function aggregate(months: GubalMonth[]): GubalMonth | null {
  if (!months.length) return null;
  if (months.length === 1) return months[0];
  const mergeLines = (all: Line[][]) => {
    const map: Record<string, number> = {};
    for (const arr of all) for (const l of arr) map[l.label] = (map[l.label] || 0) + l.value;
    return Object.entries(map).map(([label, value]) => ({ label, value })).filter((l) => Math.abs(l.value) > 0.005);
  };
  return {
    key: `${months[0].key}..${months[months.length - 1].key}`,
    label: `${monthLabel(months[0].key)} — ${monthLabel(months[months.length - 1].key)}`,
    incomeLines: mergeLines(months.map((m) => m.incomeLines)),
    incomeTotal: months.reduce((s, m) => s + m.incomeTotal, 0),
    groups: COST_GROUPS.map((grp) => ({
      id: grp.id,
      total: months.reduce((s, m) => s + (m.groups.find((x) => x.id === grp.id)?.total || 0), 0),
      lines: mergeLines(months.map((m) => m.groups.find((x) => x.id === grp.id)?.lines || [])),
    })),
    costTotal: months.reduce((s, m) => s + m.costTotal, 0),
    net: months.reduce((s, m) => s + m.net, 0),
  };
}

const grpMeta = (id: string) => COST_GROUPS.find((g) => g.id === id)!;

export default function GubalProfitReport() {
  const [fileName, setFileName] = useState('');
  const [months, setMonths] = useState<GubalMonth[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    api.get('/api/vessel-profit/Gubal').then((res) => {
      const arr = res.data?.voyages;
      if (Array.isArray(arr) && arr.length) {
        setMonths(arr as GubalMonth[]);
        setFrom(arr[0].key); setTo(arr[arr.length - 1].key);
        setFileName('محفوظ في السيرفر');
      }
    }).catch(() => {});
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setError('');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parsed = parseWorkbook(wb);
      if (!parsed.length) { setError('لم يتم العثور على شهور في الملف.'); return; }
      setMonths(parsed); setFileName(file.name);
      setFrom(parsed[0].key); setTo(parsed[parsed.length - 1].key);
    } catch (err: any) { setError('تعذّرت قراءة الملف: ' + (err?.message || '')); }
  }

  async function save() {
    if (!months.length) return;
    setSaving(true); setSavedMsg('');
    try {
      await api.put('/api/vessel-profit/Gubal', { voyages: months });
      setSavedMsg('تم الحفظ ✅'); setTimeout(() => setSavedMsg(''), 2500);
    } catch { setSavedMsg('فشل الحفظ'); } finally { setSaving(false); }
  }

  const selected = useMemo(() => {
    if (!months.length) return [];
    if (mode === 'single') return months.filter((m) => m.key === from);
    const lo = from <= to ? from : to, hi = from <= to ? to : from;
    return months.filter((m) => m.key >= lo && m.key <= hi);
  }, [months, mode, from, to]);

  const agg = useMemo(() => aggregate(selected), [selected]);
  const margin = agg && agg.incomeTotal ? (agg.net / agg.incomeTotal) * 100 : 0;
  // كل المجموعات غير الصفرية (بما فيها السالبة كتسويات) → صفوف التفصيل تطابق الإجمالي دائماً
  const sortedGroups = useMemo(() => (agg ? [...agg.groups].filter((g) => Math.abs(g.total) > 0.005).sort((a, b) => b.total - a.total) : []), [agg]);

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-sm text-gray-600 mb-1">ملف Gubal (Excel)</label>
          <input type="file" accept=".xlsx,.xls" onChange={onFile}
            className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700" />
          {fileName && <p className="text-xs text-gray-400 mt-1">📄 {fileName} — {months.length} شهر</p>}
        </div>
        {months.length > 0 && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">النطاق</label>
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button onClick={() => setMode('single')} className={`px-3 py-2 ${mode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>شهر</button>
                <button onClick={() => setMode('range')} className={`px-3 py-2 ${mode === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>من / إلى</button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{mode === 'single' ? 'الشهر' : 'من'}</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {months.map((m) => <option key={m.key} value={m.key}>{monthLabel(m.key)}</option>)}
              </select>
            </div>
            {mode === 'range' && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">إلى</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {months.map((m) => <option key={m.key} value={m.key}>{monthLabel(m.key)}</option>)}
                </select>
              </div>
            )}
            {agg && (
              <div className="mr-auto flex items-center gap-2">
                {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
                <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '...' : '💾 حفظ'}</button>
                <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">🖨️ طباعة / PDF</button>
              </div>
            )}
          </>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!months.length && !error && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400 print:hidden">
          ارفع ملف Gubal (قائمة الدخل الشهرية) — التقرير هيطلع صافي الربح والإيرادات والتكاليف بالمجموعات، شهرياً أو من فترة لفترة.
        </div>
      )}

      {agg && (
        <div className="space-y-4 print:hidden">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">صافي الربح</p><p className="text-2xl font-bold mt-1">{fmt(agg.net)}</p><p className="text-xs opacity-80 mt-1">{selected.length} شهر</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">إجمالي الإيراد</p><p className="text-xl font-bold text-gray-800 mt-1">{fmt(agg.incomeTotal)}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">إجمالي التكاليف</p><p className="text-xl font-bold text-red-600 mt-1">{fmt(agg.costTotal)}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">هامش صافي الربح</p><p className="text-xl font-bold text-emerald-700 mt-1">{margin.toFixed(1)}%</p></div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Income */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">الإيرادات</h3>
              <table className="w-full text-sm">
                <tbody>
                  {agg.incomeLines.slice().sort((a, b) => b.value - a.value).map((l, i) => (
                    <tr key={`${l.label}-${i}`} className="border-t"><td className="py-1">{l.label}</td><td className="py-1 text-left font-medium">{fmt(l.value)}</td></tr>
                  ))}
                  <tr className="border-t bg-gray-50 font-bold"><td className="py-1">إجمالي الإيراد</td><td className="py-1 text-left">{fmt(agg.incomeTotal)}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Cost structure donut */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">هيكل التكاليف</h3>
              <div className="flex items-center gap-4">
                <Donut segs={sortedGroups.filter((g) => g.total > 0).map((g) => ({ value: g.total, color: grpMeta(g.id).color }))} total={agg.costTotal} />
                <div className="flex-1 space-y-1 text-sm max-h-64 overflow-auto">
                  {sortedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ background: grpMeta(g.id).color }} />
                      <span className="flex-1 truncate">{grpMeta(g.id).ar}</span>
                      <span className="font-medium">{fmtAbbr(g.total)}</span>
                      <span className="text-gray-400 w-9 text-left">{agg.costTotal ? Math.round((g.total / agg.costTotal) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cost by group — expandable */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-700 mb-3">التكاليف بالتفصيل</h3>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-right py-1">المجموعة</th><th scope="col" className="text-left py-1">المبلغ</th><th scope="col" className="text-left py-1 w-16">%</th></tr></thead>
              <tbody>
                {sortedGroups.map((g) => (
                  <Fragment key={g.id}>
                    <tr className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}>
                      <td className="py-1.5 font-medium">{expanded[g.id] ? '▾' : '▸'} {grpMeta(g.id).ar} <span className="text-gray-400 text-xs">{grpMeta(g.id).en}</span></td>
                      <td className="py-1.5 text-left font-medium text-red-600">{fmt(g.total)}</td>
                      <td className="py-1.5 text-left text-gray-400">{agg.costTotal ? Math.round((g.total / agg.costTotal) * 100) : 0}%</td>
                    </tr>
                    {expanded[g.id] && g.lines.slice().sort((a, b) => b.value - a.value).map((l, i) => (
                      <tr key={`${l.label}-${i}`} className="bg-gray-50/50 text-gray-600"><td className="py-1 pr-6 text-xs">{l.label}</td><td className="py-1 text-left text-xs">{fmt(l.value)}</td><td /></tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="border-t bg-gray-50 font-bold"><td className="py-1.5">إجمالي التكاليف</td><td className="py-1.5 text-left text-red-700">{fmt(agg.costTotal)}</td><td /></tr>
              </tbody>
            </table>
          </div>

          {/* Monthly net trend (only in range with >1 month) */}
          {selected.length > 1 && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">الصافي الشهري</h3>
              <TrendBars data={selected.map((m) => ({ label: monthLabel(m.key).split(' ')[0], value: m.net }))} />
            </div>
          )}
        </div>
      )}

      {/* print doc */}
      {agg && (
        <div id="gubal-doc" dir="rtl" className="hidden print:block">
          <div className="gh">
            <div className="brand">UME <span>Holding</span></div>
            <div className="meta">المركب: Gubal Trader<br />الفترة: {agg.label}<br />العملة: USD</div>
          </div>
          <div className="gt">تقرير أرباح المركب — Gubal Trader</div>
          <div className="gk">
            <div className="kpi main"><span className="l">صافي الربح</span><span className="v">{fmt(agg.net)}</span></div>
            <div className="kpi"><span className="l">إجمالي الإيراد</span><span className="v">{fmt(agg.incomeTotal)}</span></div>
            <div className="kpi"><span className="l">إجمالي التكاليف</span><span className="v">{fmt(agg.costTotal)}</span></div>
            <div className="kpi"><span className="l">هامش الربح</span><span className="v">{margin.toFixed(1)}%</span></div>
          </div>
          <div className="cols">
            <div>
              <h3>الإيرادات</h3>
              <table><tbody>
                {agg.incomeLines.slice().sort((a, b) => b.value - a.value).map((l, i) => (<tr key={`${l.label}-${i}`}><td>{l.label}</td><td>{fmt(l.value)}</td></tr>))}
                <tr className="tot"><td>إجمالي الإيراد</td><td>{fmt(agg.incomeTotal)}</td></tr>
              </tbody></table>
            </div>
            <div>
              <h3>التكاليف بالمجموعات</h3>
              <table><tbody>
                {sortedGroups.map((g) => (<tr key={g.id}><td>{grpMeta(g.id).ar}</td><td>{fmt(g.total)}</td></tr>))}
                <tr className="tot"><td>إجمالي التكاليف</td><td>{fmt(agg.costTotal)}</td></tr>
              </tbody></table>
            </div>
          </div>
          {/*
            الرسوم في مستند الطباعة أيضاً.
            المحتوى المعروض كلّه `print:hidden` ومستندُ الطباعة نسخةٌ مستقلّة —
            فما لا يُكرَّر هنا لا يصل الورق. وهي `SVG` فتُطبع متّجهةً حادّة عند
            أي تكبير، ولا تحتاج تحويلاً إلى صورة.
          */}
          <div className="charts">
            <div className="cbox">
              <h3>هيكل التكاليف</h3>
              <div className="donut">
                <Donut
                  segs={sortedGroups.filter((g) => g.total > 0).map((g) => ({ value: g.total, color: grpMeta(g.id).color }))}
                  total={agg.costTotal}
                />
                <table className="lg"><tbody>
                  {sortedGroups.filter((g) => g.total > 0).map((g) => (
                    <tr key={g.id}>
                      <td><span className="sw" style={{ background: grpMeta(g.id).color }} />{grpMeta(g.id).ar}</td>
                      <td>{fmtAbbr(g.total)}</td>
                      <td className="pc">{agg.costTotal ? Math.round((g.total / agg.costTotal) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>

            {selected.length > 1 && (
              <div className="cbox">
                <h3>الصافي الشهري</h3>
                <TrendBars data={selected.map((m) => ({ label: monthLabel(m.key).split(' ')[0], value: m.net }))} />
              </div>
            )}
          </div>

          <div className="foot">UME Holding — نظام PMS · Gubal Trader · {agg.label} · جميع القيم بالدولار</div>
        </div>
      )}
    </div>
  );
}

function Donut({ segs, total }: { segs: { value: number; color: string }[]; total: number }) {
  const size = 180, sw = 32, r = (size - sw) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90 ${c} ${c})`}>
        {segs.map((s, i) => {
          const share = total ? s.value / total : 0, len = share * circ;
          const el = <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} />;
          acc += len; return el;
        })}
      </g>
    </svg>
  );
}

function TrendBars({ data }: { data: { label: string; value: number }[] }) {
  const W = 900, H = 280, m = { l: 55, r: 10, t: 26, b: 30 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const maxV = Math.max(0, ...data.map((d) => d.value));
  const minV = Math.min(0, ...data.map((d) => d.value));
  const range = (maxV - minV) || 1;
  const zeroY = m.t + (maxV / range) * ph; // موضع خط الصفر
  const gap = pw / data.length, bw = gap * 0.55;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={m.l} y1={zeroY} x2={W - m.r} y2={zeroY} stroke="#cbd5e1" />
      {data.map((d, i) => {
        const valY = m.t + ((maxV - d.value) / range) * ph;
        const x = m.l + gap * i + (gap - bw) / 2;
        const top = Math.min(zeroY, valY), h = Math.abs(zeroY - valY);
        const pos = d.value >= 0;
        return (<g key={i}>
          <rect x={x} y={top} width={bw} height={h} fill={pos ? '#5b9e77' : '#e2564a'} rx="2" />
          <text x={x + bw / 2} y={pos ? valY - 5 : valY + 14} textAnchor="middle" fontSize="12" fill="#435061" fontWeight="600">{fmtAbbr(d.value)}</text>
          <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="#6b7480">{d.label}</text>
        </g>);
      })}
    </svg>
  );
}

const PRINT_CSS = `@media print {
  @page { size: A4 portrait; margin: 12mm; }
  body * { visibility: hidden !important; }
  #gubal-doc, #gubal-doc * { visibility: visible !important; }
  #gubal-doc { position: absolute; left: 0; top: 0; width: 100%; color:#0f172a; font-family:'Segoe UI',Tahoma,Arial,sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #gubal-doc .gh { display:flex; justify-content:space-between; align-items:center; border-bottom:2.5pt solid #1d4ed8; padding-bottom:6px; margin-bottom:10px; }
  #gubal-doc .gh .brand { font-size:14pt; font-weight:800; } #gubal-doc .gh .brand span { color:#1d4ed8; }
  #gubal-doc .gh .meta { text-align:left; font-size:9pt; color:#475569; line-height:1.5; }
  #gubal-doc .gt { text-align:center; font-size:13pt; font-weight:800; color:#fff; background:#0f2c5c; padding:7px; border-radius:4px; margin-bottom:12px; }
  #gubal-doc .gk { display:flex; gap:8px; margin-bottom:14px; }
  #gubal-doc .kpi { flex:1; border:1pt solid #e2e8f0; background:#f8fafc; border-radius:6px; padding:8px; text-align:center; }
  #gubal-doc .kpi .l { font-size:8pt; color:#64748b; display:block; margin-bottom:3px; font-weight:600; }
  #gubal-doc .kpi .v { font-size:13pt; font-weight:800; color:#0f172a; }
  #gubal-doc .kpi.main { background:#047857; border-color:#065f46; } #gubal-doc .kpi.main .l { color:#d1fae5; } #gubal-doc .kpi.main .v { color:#fff; }
  #gubal-doc h3 { font-size:10pt; font-weight:700; color:#0f2c5c; background:#eef2ff; margin:10px 0 5px; padding:5px 10px; border-radius:3px; border-right:4pt solid #1d4ed8; }
  #gubal-doc .cols { display:flex; gap:16px; align-items:flex-start; } #gubal-doc .cols > div { flex:1; }
  #gubal-doc table { width:100%; border-collapse:collapse; font-size:9pt; }
  #gubal-doc td { padding:4px 8px; border-bottom:.5pt solid #e5e9f0; }
  #gubal-doc td:last-child { text-align:left; white-space:nowrap; }
  #gubal-doc tr.tot td { background:#dbe4ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #94a3b8; }
  #gubal-doc .charts { margin-top:14px; }
  /* الرسم لا يُشطر بين صفحتين — نصفُ مخطّطٍ على ورقةٍ لا يُقرأ */
  #gubal-doc .cbox { break-inside: avoid; page-break-inside: avoid; margin-bottom:12px; }
  #gubal-doc .donut { display:flex; align-items:center; gap:14px; }
  #gubal-doc .donut svg { width:150px; height:150px; flex-shrink:0; }
  #gubal-doc .lg { flex:1; font-size:8.5pt; }
  #gubal-doc .lg td { padding:2px 6px; border-bottom:.5pt solid #eef2f7; }
  #gubal-doc .lg td:last-child { width:38px; }
  #gubal-doc .lg .pc { color:#64748b; text-align:left; }
  #gubal-doc .sw { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:6px; vertical-align:middle; }
  #gubal-doc .cbox svg { max-width:100%; }
  #gubal-doc .foot { margin-top:14px; border-top:.75pt solid #cbd5e1; padding-top:6px; font-size:7.5pt; color:#94a3b8; text-align:center; }
}`;
