'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Donut, TrendBars, PRINT_CSS as GUBAL_PRINT_CSS } from './GubalProfitReport';

/*
 * ── كارت ربح Wasa Express ──
 *
 * على نمط كارت جوبال بأمر المالك ١١ نوفمبر ٢٠٢٦، لكنّ الأرقام لا تُقرأ من إكسيل في المتصفّح.
 * تُبنى في `F:/Dev/My Project/wasa-card/build.py` وتُرفع حزمةً واحدة (`wasa_months.json`):
 *   - الإيراد من فواتير الإيجار في المنظومة، موزَّعاً على أيّام الإيجار، بسعر البنك الأوروبيّ يوم الفاتورة.
 *   - العمولة ٢٫٥٪ من دفتر العمولات في المنظومة، على أيّام الإيجار.
 *   - المصروفات والمشتريات من كويك بوكس زاريكون، والإهلاك ٣٧٬٥٣٧٫٥٤ يورو شهرياً، والتأمين من الوثائق.
 *   - بنود الحوض الجافّ مخزونٌ خارج التكاليف لحين بدء الأعمال (قرار المالك).
 *
 * والحزمة تُفحص هنا قبل الحفظ: كلّ إجماليٍّ يساوي بنوده، فلا يُحفظ ملفٌّ يناقض نفسه.
 */
export const WASA_KEY = 'Wasa';
export const WASA_FORMAT = 'wasa-pl-v1';
const VESSEL = 'Wasa Express';

export const WASA_GROUPS: { id: string; ar: string; en: string; color: string }[] = [
  { id: 'crew', ar: 'الطاقم والإعاشة', en: 'Crew Costs & Victualling', color: '#5b9e77' },
  { id: 'spare', ar: 'قطع الغيار والتوريدات', en: 'Spare Parts & Supplies', color: '#9cc3ac' },
  { id: 'depreciation', ar: 'الإهلاك', en: 'Depreciation', color: '#b07a2f' },
  { id: 'insurance', ar: 'التأمين والتصنيف', en: 'Insurance & Class', color: '#3f5f8a' },
  { id: 'commission', ar: 'عمولة الإيجار ٢٫٥٪', en: 'Hire Commission 2.5%', color: '#8f6f2f' },
  { id: 'management', ar: 'أتعاب الإدارة', en: 'Management Fees', color: '#6f8f2f' },
  { id: 'bunker', ar: 'الوقود والزيوت', en: 'Bunkers & Lubricants', color: '#1e3a5f' },
  { id: 'offhire', ar: 'تكلفة التوقّف', en: 'Off-hire Cost', color: '#e2564a' },
  { id: 'other', ar: 'مصاريف أخرى', en: 'Other Expenses', color: '#8a94a6' },
];
const GROUP_IDS = new Set(WASA_GROUPS.map((g) => g.id));
const grpMeta = (id: string) => WASA_GROUPS.find((g) => g.id === id)!;

/* أسماء البنود في الحزمة بالعربيّة — وبالإنجليزيّة تُعرض بمصطلحها المحاسبيّ */
const LABEL_EN: Record<string, string> = {
  'إيجار المركب': 'Charter Hire Revenue',
  'تعويض الإعفاء من الإرشاد': 'Pilotage Exemption Compensation',
  'خصم التوقّف والضمان': 'Off-hire & Guarantee Deduction',
  'إهلاك المركب': 'Vessel Depreciation',
  'وقود فترة التوقّف': 'Off-hire Fuel (MGO)',
  'رسوم ميناء فترة التوقّف': 'Off-hire Port Dues',
};
const lbl = (l: string, en: boolean) => (en ? LABEL_EN[l] || l : l);

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (k: string, en = false) => { const [y, m] = k.split('-'); return `${(en ? MONTH_EN : MONTH_AR)[+m - 1]} ${y}`; };
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* الرقم معزولٌ باتّجاه اليسار: السالب في سطرٍ عربيّ يُعرض «145,016.57-» بغيره */
const N = ({ v }: { v: number }) => <span dir="ltr">{fmt(v)}</span>;
const fmtAbbr = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${Math.round(a)}`;
};

export interface Line { label: string; value: number }
export interface WasaMonth {
  key: string;
  incomeLines: Line[]; incomeTotal: number;
  groups: { id: string; total: number; lines: Line[] }[];
  costTotal: number; net: number;
  stockAdded: number; stockLines: Line[];
}
export interface WasaNote { ar: string; en: string }
export interface WasaMeta { format: string; built: string; notes: WasaNote[]; drydockStock: { total: number; lines: Line[] }; file?: string; savedAt?: string }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (ls: Line[]) => ls.reduce((s, l) => s + l.value, 0);
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
const asLines = (v: unknown): Line[] | null =>
  Array.isArray(v) && v.every((l) => l && typeof l.label === 'string' && isNum(l.value)) ? (v as Line[]) : null;

/**
 * يفحص الحزمة قبل عرضها أو حفظها. الأخطاء بالعربيّة لأنّها تُعرض كما هي.
 * التفاوت المقبول سنتات التقريب فقط: كلّ بندٍ مقرَّبٌ لسنتين في المصدر.
 */
export function validateWasaPackage(raw: any): { ok: boolean; errors: string[]; months: WasaMonth[]; meta: WasaMeta | null } {
  const errors: string[] = [];
  const fail = (e: string) => ({ ok: false, errors: [e], months: [], meta: null });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('الملفّ ليس حزمة واسا');
  if (raw.format !== WASA_FORMAT) return fail(`صيغة الحزمة «${String(raw.format)}» غير معروفة — المطلوب ${WASA_FORMAT}`);
  if (raw.vessel !== VESSEL) return fail(`الحزمة لمركب «${String(raw.vessel)}» لا لـ ${VESSEL}`);
  if (raw.currency !== 'USD') return fail('عملة الحزمة ليست الدولار');
  if (!Array.isArray(raw.months) || !raw.months.length) return fail('الحزمة بلا شهور');

  const months: WasaMonth[] = [];
  const seen = new Set<string>();
  raw.months.forEach((m: any, i: number) => {
    const k = typeof m?.key === 'string' ? m.key : `#${i + 1}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) { errors.push(`شهرٌ بمفتاحٍ غير صالح: ${k}`); return; }
    if (seen.has(k)) { errors.push(`الشهر ${k} مكرَّر`); return; }
    seen.add(k);
    const inc = asLines(m.incomeLines), stock = asLines(m.stockLines);
    if (!inc || !stock || !isNum(m.incomeTotal) || !isNum(m.costTotal) || !isNum(m.net) || !isNum(m.stockAdded) || !Array.isArray(m.groups)) {
      errors.push(`الشهر ${k}: حقولٌ ناقصة أو غير رقميّة`); return;
    }
    if (!near(sum(inc), m.incomeTotal)) errors.push(`الشهر ${k}: بنود الإيراد ${fmt(sum(inc))} لا تساوي إجماليّه ${fmt(m.incomeTotal)}`);
    const groups: WasaMonth['groups'] = [];
    for (const g of m.groups) {
      const ls = asLines(g?.lines);
      if (!g || !GROUP_IDS.has(g.id) || !ls || !isNum(g.total)) { errors.push(`الشهر ${k}: مجموعة «${String(g?.id)}» غير معروفة أو ناقصة`); continue; }
      if (!near(sum(ls), g.total)) errors.push(`الشهر ${k}: بنود «${grpMeta(g.id).ar}» لا تساوي إجماليّها`);
      groups.push({ id: g.id, total: g.total, lines: ls });
    }
    const gsum = groups.reduce((s, g) => s + g.total, 0);
    if (!near(gsum, m.costTotal, 0.1)) errors.push(`الشهر ${k}: المجموعات ${fmt(gsum)} لا تساوي إجماليّ التكاليف ${fmt(m.costTotal)}`);
    if (!near(m.incomeTotal - m.costTotal, m.net, 0.1)) errors.push(`الشهر ${k}: الصافي لا يساوي الإيراد ناقص التكاليف`);
    if (!near(sum(stock), m.stockAdded)) errors.push(`الشهر ${k}: بنود مخزون الحوض لا تساوي إضافته`);
    months.push({ key: k, incomeLines: inc, incomeTotal: m.incomeTotal, groups, costTotal: m.costTotal, net: m.net, stockAdded: m.stockAdded, stockLines: stock });
  });
  months.sort((a, b) => a.key.localeCompare(b.key));

  const ds = raw.drydockStock;
  const dsLines = asLines(ds?.lines);
  if (!ds || !isNum(ds.total) || !dsLines) errors.push('رصيد مخزون الحوض ناقص');
  else if (!near(ds.total, months.reduce((s, m) => s + m.stockAdded, 0), 0.1)) errors.push('رصيد مخزون الحوض لا يساوي إضافات الشهور');

  const notes: WasaNote[] = Array.isArray(raw.notes) ? raw.notes.filter((n: any) => n && typeof n.ar === 'string' && typeof n.en === 'string') : [];
  const meta: WasaMeta = { format: WASA_FORMAT, built: typeof raw.built === 'string' ? raw.built : '', notes, drydockStock: { total: ds?.total ?? 0, lines: dsLines || [] } };
  return { ok: errors.length === 0, errors, months, meta };
}

const mergeLines = (all: Line[][]) => {
  const map = new Map<string, number>();
  for (const arr of all) for (const l of arr) map.set(l.label, (map.get(l.label) || 0) + l.value);
  return [...map].map(([label, value]) => ({ label, value })).filter((l) => Math.abs(l.value) > 0.005);
};

/** جمع شهورٍ في فترةٍ واحدة. */
export function aggregateWasa(months: WasaMonth[]): WasaMonth | null {
  if (!months.length) return null;
  return {
    key: months.length === 1 ? months[0].key : `${months[0].key}..${months[months.length - 1].key}`,
    incomeLines: mergeLines(months.map((m) => m.incomeLines)),
    incomeTotal: months.reduce((s, m) => s + m.incomeTotal, 0),
    groups: WASA_GROUPS.map((grp) => ({
      id: grp.id,
      total: months.reduce((s, m) => s + (m.groups.find((x) => x.id === grp.id)?.total || 0), 0),
      lines: mergeLines(months.map((m) => m.groups.find((x) => x.id === grp.id)?.lines || [])),
    })),
    costTotal: months.reduce((s, m) => s + m.costTotal, 0),
    net: months.reduce((s, m) => s + m.net, 0),
    stockAdded: months.reduce((s, m) => s + m.stockAdded, 0),
    stockLines: mergeLines(months.map((m) => m.stockLines)),
  };
}

/** رصيد مخزون الحوض في آخر الفترة — كلّ ما أُضيف حتّى شهرها الأخير، لا ما أُضيف فيها وحدها. */
export function stockAsOf(months: WasaMonth[], endKey: string): { total: number; lines: Line[] } {
  const upTo = months.filter((m) => m.key <= endKey);
  const lines = mergeLines(upTo.map((m) => m.stockLines)).sort((a, b) => b.value - a.value);
  return { total: upTo.reduce((s, m) => s + m.stockAdded, 0), lines };
}

export default function WasaProfitReport() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const gName = (id: string) => (en ? grpMeta(id).en : grpMeta(id).ar);
  const mLabel = (k: string) => monthLabel(k, en);

  const [months, setMonths] = useState<WasaMonth[]>([]);
  const [meta, setMeta] = useState<WasaMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  function show(ms: WasaMonth[], mt: WasaMeta) {
    setMonths(ms); setMeta(mt);
    setFrom(ms[0].key); setTo(ms[ms.length - 1].key);
  }

  useEffect(() => {
    api.get(`/api/vessel-profit/${WASA_KEY}`).then((res) => {
      const pkg = res.data?.manual?.package;
      if (!pkg) return;
      const c = validateWasaPackage(pkg);
      if (c.ok && c.meta) show(c.months, { ...c.meta, file: res.data.manual.file, savedAt: res.data.manual.savedAt });
      else setErrors(['الحزمة المحفوظة لا تطابق نفسها — ارفع الحزمة من جديد', ...c.errors]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const [pending, setPending] = useState<any>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setErrors([]); setSavedMsg('');
    let raw: any;
    try { raw = JSON.parse(await file.text()); } catch { setErrors(['الملفّ ليس JSON صالحاً']); return; }
    const c = validateWasaPackage(raw);
    if (!c.ok || !c.meta) { setErrors(c.errors); return; }
    show(c.months, { ...c.meta, file: file.name });
    setPending(raw); setDirty(true);
  }

  async function save() {
    if (!pending || !meta) return;
    setSaving(true); setSavedMsg('');
    const savedAt = new Date().toISOString();
    try {
      await api.put(`/api/vessel-profit/${WASA_KEY}`, { voyages: months, manual: { package: pending, file: meta.file, savedAt } });
      setMeta({ ...meta, savedAt }); setDirty(false); setPending(null);
      setSavedMsg(T('تم الحفظ ✅', 'Saved ✅')); setTimeout(() => setSavedMsg(''), 2500);
    } catch { setSavedMsg(T('فشل الحفظ', 'Save failed')); } finally { setSaving(false); }
  }

  const selected = useMemo(() => {
    if (!months.length) return [];
    if (mode === 'single') return months.filter((m) => m.key === from);
    const lo = from <= to ? from : to, hi = from <= to ? to : from;
    return months.filter((m) => m.key >= lo && m.key <= hi);
  }, [months, mode, from, to]);

  const agg = useMemo(() => aggregateWasa(selected), [selected]);
  const endKey = selected.length ? selected[selected.length - 1].key : '';
  const stock = useMemo(() => stockAsOf(months, endKey), [months, endKey]);
  const periodLabel = selected.length > 1 ? `${mLabel(selected[0].key)} — ${mLabel(endKey)}` : (selected[0] ? mLabel(selected[0].key) : '');
  const margin = agg && agg.incomeTotal ? (agg.net / agg.incomeTotal) * 100 : 0;
  const sortedGroups = useMemo(() => (agg ? agg.groups.filter((g) => Math.abs(g.total) > 0.005).sort((a, b) => b.total - a.total) : []), [agg]);
  const trend = selected.length > 1 ? selected.map((m) => ({ label: mLabel(m.key).split(' ')[0], value: m.net })) : [];

  return (
    <div className="space-y-4">
      <style>{WASA_PRINT_CSS}</style>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-sm text-gray-600 mb-1">{T('حزمة واسا (JSON)', 'Wasa package (JSON)')}</label>
          <input type="file" accept=".json,application/json" onChange={onFile}
            className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700" />
          {meta && (
            <p className="text-xs text-gray-400 mt-1">
              📄 {meta.file || 'wasa_months.json'} — {months.length} {T('شهر', 'months')}
              {' · '}{dirty ? <span className="text-amber-600 font-medium">{T('غير محفوظ', 'Not saved')}</span> : T('محفوظ في السيرفر', 'Saved on server')}
            </p>
          )}
        </div>
        {months.length > 0 && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{T('النطاق', 'Period')}</label>
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button onClick={() => setMode('single')} className={`px-3 py-2 ${mode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{T('شهر', 'Month')}</button>
                <button onClick={() => setMode('range')} className={`px-3 py-2 ${mode === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{T('من / إلى', 'From / To')}</button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{mode === 'single' ? T('الشهر', 'Month') : T('من', 'From')}</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {months.map((m) => <option key={m.key} value={m.key}>{mLabel(m.key)}</option>)}
              </select>
            </div>
            {mode === 'range' && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">{T('إلى', 'To')}</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {months.map((m) => <option key={m.key} value={m.key}>{mLabel(m.key)}</option>)}
                </select>
              </div>
            )}
            {agg && (
              <div className="mr-auto flex items-center gap-2">
                {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
                {dirty && <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '...' : T('💾 حفظ', '💾 Save')}</button>}
                <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">{T('🖨️ طباعة / PDF', '🖨️ Print / PDF')}</button>
              </div>
            )}
          </>
        )}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 print:hidden">
          <p className="font-bold mb-1">{T('الحزمة مرفوضة', 'Package rejected')}</p>
          <ul className="list-disc ps-5 space-y-0.5">{errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {!loading && !months.length && !errors.length && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400 print:hidden">
          {T('ارفع حزمة واسا (wasa_months.json) — يُعرض صافي الربح والإيراد والتكاليف بالمجموعات ومخزون الحوض، شهرياً أو من فترة لفترة.',
            'Upload the Wasa package (wasa_months.json) — the card shows net profit, revenue, costs by group and dry-dock stock, monthly or for a period.')}
        </div>
      )}

      {agg && (
        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-emerald-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">{T('صافي الربح', 'Net Profit')}</p><p className="text-xl xl:text-2xl font-bold mt-1"><N v={agg.net} /></p><p className="text-xs opacity-80 mt-1">{selected.length} {T('شهر', selected.length === 1 ? 'month' : 'months')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('إجمالي الإيراد', 'Total Revenue')}</p><p className="text-xl font-bold text-gray-800 mt-1">{fmt(agg.incomeTotal)}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('إجمالي التكاليف', 'Total Operating Costs')}</p><p className="text-xl font-bold text-red-600 mt-1">{fmt(agg.costTotal)}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('هامش صافي الربح', 'Net Profit Margin')}</p><p className="text-xl font-bold text-emerald-700 mt-1">{margin.toFixed(1)}%</p></div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 col-span-2 lg:col-span-1" data-testid="stock-kpi"><p className="text-xs text-amber-800">{T('مخزون الحوض الجافّ', 'Dry-dock Stock')}</p><p className="text-xl font-bold text-amber-900 mt-1">{fmt(stock.total)}</p><p className="text-xs text-amber-700 mt-1">{T('خارج التكاليف', 'Not in costs')}</p></div>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">{T('الإيرادات', 'Revenue')}</h3>
              <table className="w-full text-sm"><tbody>
                {agg.incomeLines.slice().sort((a, b) => b.value - a.value).map((l, i) => (
                  <tr key={`${l.label}-${i}`} className="border-t"><td className="py-1">{lbl(l.label, en)}</td><td className={`py-1 text-end font-medium ${l.value < 0 ? 'text-red-600' : ''}`}><N v={l.value} /></td></tr>
                ))}
                <tr className="border-t bg-gray-50 font-bold"><td className="py-1">{T('إجمالي الإيراد', 'Total Revenue')}</td><td className="py-1 text-end">{fmt(agg.incomeTotal)}</td></tr>
              </tbody></table>
            </div>

          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-700 mb-3">{T('التكاليف بالتفصيل', 'Cost Breakdown')}</h3>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-start py-1">{T('المجموعة', 'Cost Group')}</th><th scope="col" className="text-end py-1">{T('المبلغ', 'Amount (USD)')}</th><th scope="col" className="text-end py-1 w-16">%</th></tr></thead>
              <tbody>
                {sortedGroups.map((g) => (
                  <Fragment key={g.id}>
                    <tr className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}>
                      <td className="py-1.5 font-medium">{expanded[g.id] ? '▾' : '▸'} {gName(g.id)}</td>
                      <td className="py-1.5 text-end font-medium text-red-600"><N v={g.total} /></td>
                      <td className="py-1.5 text-end text-gray-400">{agg.costTotal ? Math.round((g.total / agg.costTotal) * 100) : 0}%</td>
                    </tr>
                    {expanded[g.id] && g.lines.slice().sort((a, b) => b.value - a.value).map((l, i) => (
                      <tr key={`${l.label}-${i}`} className="bg-gray-50/50 text-gray-600"><td className="py-1 ps-6 text-xs">{lbl(l.label, en)}</td><td className="py-1 text-end text-xs"><N v={l.value} /></td><td /></tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="border-t bg-gray-50 font-bold"><td className="py-1.5">{T('إجمالي التكاليف', 'Total Operating Costs')}</td><td className="py-1.5 text-end text-red-700">{fmt(agg.costTotal)}</td><td /></tr>
              </tbody>
            </table>
          </div>

          <StockBox stock={stock} added={agg.stockAdded} endLabel={mLabel(endKey)} en={en} />

          {trend.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">{T('الصافي الشهري', 'Monthly Net Result')}</h3>
              <TrendBars data={trend} />
            </div>
          )}

          {meta && meta.notes.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4 text-sm">
              <h3 className="font-bold text-gray-700 mb-2">{T('ملاحظات على الأرقام', 'Notes on the figures')}</h3>
              <ul className="list-disc ps-5 space-y-1 text-gray-600">{meta.notes.map((n, i) => <li key={i}>{en ? n.en : n.ar}</li>)}</ul>
              {meta.built && <p className="text-xs text-gray-400 mt-2">{T('بُنيت الحزمة', 'Package built')}: {meta.built.replace('T', ' ')}</p>}
            </div>
          )}

          {/* هيكل التكاليف آخر الكارت بطلب المالك ١١ نوفمبر ٢٠٢٦ */}
          <div className="bg-white rounded-xl shadow p-4" data-testid="cost-structure">
            <h3 className="font-bold text-gray-700 mb-3">{T('هيكل التكاليف', 'Cost Structure')}</h3>
            <div className="flex flex-wrap items-center gap-6">
              <Donut segs={sortedGroups.filter((g) => g.total > 0).map((g) => ({ value: g.total, color: grpMeta(g.id).color }))} total={agg.costTotal} />
              <table className="flex-1 min-w-[280px] max-w-xl text-sm"><tbody>
                {sortedGroups.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="py-1"><span className="w-3 h-3 rounded-full inline-block align-middle me-2" style={{ background: grpMeta(g.id).color }} />{gName(g.id)}</td>
                    <td className="py-1 text-end font-medium"><N v={g.total} /></td>
                    <td className="py-1 text-end text-gray-400 w-12">{agg.costTotal ? Math.round((g.total / agg.costTotal) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr className="border-t bg-gray-50 font-bold"><td className="py-1">{T('إجمالي التكاليف', 'Total Operating Costs')}</td><td className="py-1 text-end">{fmt(agg.costTotal)}</td><td className="py-1 text-end w-12">100%</td></tr>
              </tbody></table>
            </div>
          </div>
        </div>
      )}

      {agg && meta && (
        <WasaPrintDoc agg={agg} groups={sortedGroups} margin={margin} periodLabel={periodLabel} en={en}
          trend={trend} stock={stock} endLabel={mLabel(endKey)} notes={meta.notes} />
      )}
    </div>
  );
}

/** مخزون الحوض: رصيده في آخر الفترة بمورّديه، وما أُضيف منه خلالها. */
function StockBox({ stock, added, endLabel, en }: { stock: { total: number; lines: Line[] }; added: number; endLabel: string; en: boolean }) {
  const T = (ar: string, eng: string) => (en ? eng : ar);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="stock-box">
      <h3 className="font-bold text-amber-900 mb-1">{T('مخزون تجهيز الحوض الجافّ', 'Dry-dock Preparation Stock')}</h3>
      <p className="text-xs text-amber-800 mb-3">
        {T('الأعمال لم تبدأ بعد، فالبنود مخزونٌ خارج التكاليف. وحين تبدأ تُهلَك على ٣٠ شهراً.',
          'Works have not started, so these items are held as stock outside costs. Once works start they are depreciated over 30 months.')}
      </p>
      {stock.lines.length ? (
        <table className="w-full text-sm"><tbody>
          {stock.lines.map((l) => <tr key={l.label} className="border-t border-amber-200"><td className="py-1">{l.label}</td><td className="py-1 text-end font-medium">{fmt(l.value)}</td></tr>)}
          <tr className="border-t border-amber-300 font-bold"><td className="py-1">{T('الرصيد في آخر', 'Balance at end of')} {endLabel}</td><td className="py-1 text-end">{fmt(stock.total)}</td></tr>
          <tr className="text-amber-800 text-xs"><td className="py-1">{T('منه ما أُضيف في الفترة', 'Of which added in the period')}</td><td className="py-1 text-end">{fmt(added)}</td></tr>
        </tbody></table>
      ) : <p className="text-sm text-amber-800">{T('لا مخزون حتّى آخر', 'No stock up to the end of')} {endLabel}</p>}
    </div>
  );
}

/*
 * ── مستند الطباعة ──
 * بترتيب ورقة جوبال (٣ نوفمبر ٢٠٢٦) وأنماطها نفسها، تحت مُعرّفه الخاصّ، ويزيد عليها
 * مربّع مخزون الحوض والملاحظات — فالورقة التي تُرسَل تحمل ما يقيّد أرقامها.
 * وهيكل التكاليف (الحلقة) في آخر الورقة بطلب المالك ١١ نوفمبر ٢٠٢٦، والمخزون تحت الإيراد.
 */
const SHORT_GROUP = 6;
export function WasaPrintDoc({ agg, groups, margin, periodLabel, trend, en, stock, endLabel, notes }: {
  agg: WasaMonth; groups: WasaMonth['groups']; margin: number; periodLabel: string;
  trend: { label: string; value: number }[]; en: boolean;
  stock: { total: number; lines: Line[] }; endLabel: string; notes: WasaNote[];
}) {
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const gName = (id: string) => (en ? grpMeta(id).en : grpMeta(id).ar);
  const pct = (v: number) => `${agg.costTotal ? Math.round((v / agg.costTotal) * 100) : 0}%`;
  const positive = groups.filter((g) => g.total > 0);
  return (
    <div id="wasa-doc" dir={en ? 'ltr' : 'rtl'} className={`hidden print:block${en ? ' en' : ''}`}>
      <div className="gh">
        <div className="brand">UME <span>Holding</span></div>
        <div className="meta">{T('المركب', 'Vessel')}: {VESSEL} · {T('الفترة', 'Period')}: {periodLabel} · {T('العملة', 'Currency')}: USD</div>
      </div>
      <div className="gt">{T(`تقرير أرباح المركب — ${VESSEL}`, `Vessel Profit & Loss Statement — ${VESSEL}`)}</div>
      <div className="gk">
        <div className="kpi main"><span className="l">{T('صافي الربح', 'Net Profit')}</span><span className="v"><N v={agg.net} /></span></div>
        <div className="kpi"><span className="l">{T('إجمالي الإيراد', 'Total Revenue')}</span><span className="v">{fmt(agg.incomeTotal)}</span></div>
        <div className="kpi"><span className="l">{T('إجمالي التكاليف', 'Total Operating Costs')}</span><span className="v">{fmt(agg.costTotal)}</span></div>
        <div className="kpi"><span className="l">{T('هامش الربح', 'Net Profit Margin')}</span><span className="v">{margin.toFixed(1)}%</span></div>
      </div>
      <div className="cols">
        <div>
          <h3>{T('الإيرادات', 'Revenue')}</h3>
          <table><tbody>
            {agg.incomeLines.slice().sort((a, b) => b.value - a.value).map((l, i) => (<tr key={`${l.label}-${i}`}><td>{lbl(l.label, en)}</td><td><N v={l.value} /></td></tr>))}
            <tr className="tot"><td>{T('إجمالي الإيراد', 'Total Revenue')}</td><td>{fmt(agg.incomeTotal)}</td></tr>
          </tbody></table>
          <div className="stock">
            <h3>{T('مخزون الحوض الجافّ — خارج التكاليف', 'Dry-dock Stock — not in costs')}</h3>
            <table><tbody>
              {stock.lines.map((l) => <tr key={l.label}><td>{l.label}</td><td>{fmt(l.value)}</td></tr>)}
              <tr className="tot"><td>{T('الرصيد في آخر', 'Balance at end of')} {endLabel}</td><td>{fmt(stock.total)}</td></tr>
            </tbody></table>
          </div>
        </div>
        <div>
          <h3>{T('التكاليف بالمجموعات', 'Operating Costs by Group')}</h3>
          <table><tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.total > 0 && <span className="sw" style={{ background: grpMeta(g.id).color }} />}{gName(g.id)}</td>
                <td><N v={g.total} /></td>
                <td className="pc">{pct(g.total)}</td>
              </tr>
            ))}
            <tr className="tot"><td>{T('إجمالي التكاليف', 'Total Operating Costs')}</td><td>{fmt(agg.costTotal)}</td><td className="pc">100%</td></tr>
          </tbody></table>
        </div>
      </div>

      {trend.length > 0 && (
        <div className="cbox">
          <h3>{T('الصافي الشهري', 'Monthly Net Result')}</h3>
          <TrendBars data={trend} h={190} />
        </div>
      )}

      <div className="detail">
        <h3>{T('التكاليف بالتفصيل', 'Cost Breakdown by Line Item')}</h3>
        <div className="dcols">
          {groups.filter((g) => g.lines.length > 0).map((g) => (
            <table key={g.id} className={`dt${g.lines.length <= SHORT_GROUP ? ' short' : ''}`}>
              <colgroup><col /><col className="c-amt" /><col className="c-pc" /></colgroup>
              <thead><tr className="gh2"><td>{gName(g.id)}</td><td><N v={g.total} /></td><td className="pc">{pct(g.total)}</td></tr></thead>
              <tbody>
                {g.lines.slice().sort((a, b) => b.value - a.value).map((l, i) => (
                  <tr key={`${l.label}-${i}`} className="ln"><td>{lbl(l.label, en)}</td><td><N v={l.value} /></td><td /></tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        <table className="dt gtot"><colgroup><col /><col className="c-amt" /><col className="c-pc" /></colgroup><tbody>
          <tr className="tot"><td>{T('إجمالي التكاليف', 'Total Operating Costs')}</td><td>{fmt(agg.costTotal)}</td><td className="pc">100%</td></tr>
        </tbody></table>
      </div>

      {positive.length > 0 && (
        <div className="struct">
          <h3>{T('هيكل التكاليف', 'Cost Structure')}</h3>
          <div className="sbody">
            <Donut segs={positive.map((g) => ({ value: g.total, color: grpMeta(g.id).color }))} total={agg.costTotal} />
            <table><tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.total > 0 && <span className="sw" style={{ background: grpMeta(g.id).color }} />}{gName(g.id)}</td>
                  <td><N v={g.total} /></td>
                  <td className="pc">{pct(g.total)}</td>
                </tr>
              ))}
              <tr className="tot"><td>{T('إجمالي التكاليف', 'Total Operating Costs')}</td><td>{fmt(agg.costTotal)}</td><td className="pc">100%</td></tr>
            </tbody></table>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="notes">
          <h3>{T('ملاحظات على الأرقام', 'Notes on the figures')}</h3>
          <ul>{notes.map((n, i) => <li key={i}>{en ? n.en : n.ar}</li>)}</ul>
        </div>
      )}

      <div className="foot">{T(`UME Holding — نظام PMS · ${VESSEL} · ${periodLabel} · جميع القيم بالدولار`, `UME Holding — PMS · ${VESSEL} · ${periodLabel} · Management accounts, unaudited · All amounts in USD`)}</div>
    </div>
  );
}

export const WASA_PRINT_CSS = GUBAL_PRINT_CSS.split('#gubal-doc').join('#wasa-doc').replace(/\}\s*$/, `
  #wasa-doc .stock { margin-top:8px; break-inside: avoid; page-break-inside: avoid; }
  #wasa-doc .stock h3 { background:#fef3c7; color:#78350f; border-right-color:#d97706; }
  #wasa-doc.en .stock h3 { border-left-color:#d97706; }
  #wasa-doc .stock tr.tot td { background:#fde68a; color:#78350f; }
  #wasa-doc .struct { margin-top:8px; break-inside: avoid; page-break-inside: avoid; }
  #wasa-doc .struct .sbody { display:flex; align-items:center; gap:18px; }
  #wasa-doc .struct svg { width:150px; height:150px; flex-shrink:0; }
  #wasa-doc .struct table { flex:1; max-width:115mm; }
  #wasa-doc .notes { margin-top:8px; break-inside: avoid; page-break-inside: avoid; }
  #wasa-doc .notes ul { margin:2px 0 0; padding:0 16px; font-size:7.5pt; color:#475569; }
  #wasa-doc .notes li { margin:1px 0; }
}`);
