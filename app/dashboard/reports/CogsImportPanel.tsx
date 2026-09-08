'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * مصاريف المركب من دفتر الشركة (QuickBooks COGS) — الاستيراد والسطور اليدويّة
 *
 * ── الشكل ──
 * الملفّ تصدير QuickBooks كما هو: `Sheet1`، صفّ العناوين الأوّل، وشجرة
 * الحسابات في الأعمدة B–G، والحركة في I (النوع) K (التاريخ) M (الرقم)
 * O (المورّد) Q (المذكّرة) U (مبلغ الدفتر) V (الدولار) W (الإهلاك).
 * يُقرأ هنا ويُرسل صفوفاً مسمّاةً، والخادم يصنّف ويخطّط، **ولا يُكتب شيءٌ قبل
 * أن تُعرض الخطّة** ويضغط الأدمن الترحيل.
 *
 * ── ولماذا التصنيف في الخادم ──
 * الخريطة قرار المالك، وموضعها واحدٌ يُختبر. والشاشة تعرض ما قرّره الخادم
 * ولا تعيد حسابه.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CogsEntry {
  id: string; vessel: string; source: 'quickbooks' | 'policy' | 'manual'; batch_code: string;
  account_code: string; account_path: string; doc_type: string; entry_date: string; doc_number: string;
  supplier: string; memo: string; amount_usd: string; amount_book: string | null; book_currency: string;
  category: string; item_label: string; depreciation_months: number | null; charged: boolean;
  exclude_reason: string; note: string; created_at: string;
}

interface CogsRow {
  account_path: string; doc_type: string; entry_date: string; doc_number: string; supplier: string;
  memo: string; amount_book: number | null; amount_usd: number; depreciation_text: string | null;
}

interface Plan {
  vessel: string; batch_code: string;
  counts: { total: number; new: number; existing: number; errors: number; unmapped: number };
  totals_new_usd: number;
  by_category: { category: string; item_label: string; charged: boolean; count: number; usd: number }[];
  rows: (CogsRow & { account_code: string; category: string; item_label: string; depreciation_months: number | null; charged: boolean; exclude_reason: string; unmapped: boolean; status: 'new' | 'existing' | 'error'; error?: string })[];
  vanished: { id: string; entry_date: string; doc_number: string; supplier: string; amount_usd: string; account_code: string }[];
}

const fmt = (n: unknown) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const IN = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** تاريخ إكسيل (رقمٌ تسلسليّ أو نصّ) → YYYY-MM-DD */
function toIsoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

/** يقرأ تصدير QuickBooks إلى صفوفٍ مسمّاة — بنفس منطق التحقّق الذي جرى على الملفّ الأوّل. */
export function parseQuickBooksSheet(wb: XLSX.WorkBook): { rows: CogsRow[]; warnings: string[] } {
  const ws = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames.find((n) => n !== 'QuickBooks Desktop Export Tips') || wb.SheetNames[0]];
  if (!ws) return { rows: [], warnings: ['لا ورقة بيانات في الملفّ'] };
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const head = (grid[0] || []).map((c) => String(c ?? '').trim());
  const warnings: string[] = [];
  const iType = head.indexOf('Type'), iDate = head.indexOf('Date'), iNum = head.indexOf('Num'), iName = head.indexOf('Name'),
    iMemo = head.indexOf('Memo'), iAmt = head.indexOf('Amount'), iUsd = head.indexOf('USD'), iDep = head.indexOf('Depreciation');
  if (iType < 0 || iDate < 0 || iAmt < 0) return { rows: [], warnings: ['صفّ العناوين ليس تصدير QuickBooks المعروف (Type · Date · Amount)'] };
  if (iUsd < 0) warnings.push('لا عمود USD — يُستخدم عمود Amount كما هو');
  if (iDep < 0) warnings.push('لا عمود Depreciation — كلّ القيود بلا إهلاك');
  const acct: (string | null)[] = [null, null, null, null, null, null];
  const rows: CogsRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const type = String(row[iType] ?? '').trim();
    if (!type) {
      // صفّ شجرة الحسابات: أوّل نصٍّ في الأعمدة B..G يحدّد مستواه
      for (let lvl = 1; lvl <= 6; lvl++) {
        const v = row[lvl];
        if (typeof v === 'string' && v.trim()) {
          if (v.trim().startsWith('Total')) break;
          acct[lvl - 1] = v.trim();
          for (let k = lvl; k < 6; k++) acct[k] = null;
          break;
        }
      }
      continue;
    }
    const path = acct.filter(Boolean).join(' / ');
    const amtBook = Number(row[iAmt]);
    const usdRaw = iUsd >= 0 ? Number(row[iUsd]) : NaN;
    rows.push({
      account_path: path, doc_type: type, entry_date: toIsoDate(row[iDate]),
      doc_number: String(row[iNum] ?? '').trim(), supplier: String(row[iName] ?? '').trim(), memo: String(row[iMemo] ?? '').trim(),
      amount_book: Number.isFinite(amtBook) ? amtBook : null,
      amount_usd: Number.isFinite(usdRaw) ? usdRaw : (Number.isFinite(amtBook) ? amtBook : NaN),
      depreciation_text: iDep >= 0 && row[iDep] != null && String(row[iDep]).trim() ? String(row[iDep]).trim() : null,
    });
  }
  return { rows, warnings };
}

const CATEGORY_OPTIONS = [
  ['insurance', 'تأمين'], ['drydock', 'إهلاك دراي دوك'], ['maintenance', 'صيانة وقطع غيار'], ['supplies', 'تموينات'],
  ['management', 'إدارة فنّيّة'], ['classification', 'تصنيف'], ['communications', 'اتّصالات'], ['software', 'برمجيّات وملاحة'],
  ['provision', 'تموين طاقم'], ['lubricants', 'زيوت'], ['salary', 'مرتّبات'], ['other', 'أخرى'],
] as const;

export default function CogsImportPanel({ vessel, onChanged }: { vessel: string; onChanged?: () => void }) {
  const [entries, setEntries] = useState<CogsEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<CogsRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [done, setDone] = useState('');
  const isAdmin = typeof window !== 'undefined' && getUser()?.role === 'admin';

  const load = useCallback(() => api.get(`/api/vessel-cogs/by-vessel/${encodeURIComponent(vessel)}`)
    .then((r) => setEntries((r.data as CogsEntry[]) || []))
    .catch(() => setEntries([])), [vessel]);
  useEffect(() => { load(); }, [load]);

  const batchCode = useMemo(() => `COGS-${new Date().toISOString().slice(0, 10)}`, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(''); setPlan(null); setDone('');
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const parsed = parseQuickBooksSheet(wb);
      setRows(parsed.rows); setWarnings(parsed.warnings); setFileName(f.name);
      if (!parsed.rows.length) { setErr('لم يُقرأ صفٌّ واحد من الملفّ'); return; }
      setBusy(true);
      const r = await api.post('/api/vessel-cogs/import/plan', { vessel, rows: parsed.rows, batch_code: batchCode });
      setPlan(r.data as Plan);
    } catch (ex) {
      setErr((ex as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (ex as Error)?.message || 'تعذّرت قراءة الملفّ');
    } finally { setBusy(false); e.target.value = ''; }
  }

  async function commit() {
    if (!plan || !rows.length) return;
    setBusy(true); setErr('');
    try {
      const r = await api.post('/api/vessel-cogs/import/commit', { vessel, rows, batch_code: batchCode });
      setDone(`رُحّل ${r.data.written} قيداً جديداً (${fmt(r.data.totals_written_usd)} USD) · تُخطّي ${r.data.skipped_existing} موجوداً`);
      setPlan(null); setRows([]); await load(); onChanged?.();
    } catch (ex) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || 'فشل الترحيل');
    } finally { setBusy(false); }
  }

  async function addEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget; const d = new FormData(f);
    setBusy(true); setErr('');
    try {
      await api.post('/api/vessel-cogs/entry', {
        vessel, source: d.get('source'), entry_date: d.get('entry_date'), item_label: d.get('item_label'), category: d.get('category'),
        amount_usd: d.get('amount_usd'), depreciation_months: d.get('depreciation_months') || null, doc_number: d.get('doc_number'), note: d.get('note'),
      });
      f.reset(); await load(); onChanged?.();
    } catch (ex) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذّرت الإضافة');
    } finally { setBusy(false); }
  }

  async function reapply() {
    if (!confirm('إعادة تطبيق خريطة التصنيف الحاليّة على كلّ ما استُورد من QuickBooks لهذا المركب؟')) return;
    setBusy(true); setErr('');
    try {
      const r = await api.post('/api/vessel-cogs/reapply-rules', { vessel });
      setDone(`أُعيد التصنيف: ${r.data.changed} قيداً تغيّر من ${r.data.scanned}`);
      await load(); onChanged?.();
    } catch (ex) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذّرت إعادة التصنيف');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('حذف هذا السطر من مصاريف المركب؟')) return;
    setBusy(true);
    try { await api.delete(`/api/vessel-cogs/${id}`); await load(); onChanged?.(); }
    catch { setErr('تعذّر الحذف'); }
    finally { setBusy(false); }
  }

  const summary = useMemo(() => {
    const m = new Map<string, { label: string; charged: boolean; count: number; usd: number; months: Set<string> }>();
    for (const x of entries) {
      const k = `${x.category}|${x.charged}`;
      const c = m.get(k) || { label: x.item_label, charged: x.charged, count: 0, usd: 0, months: new Set<string>() };
      c.count += 1; c.usd += Number(x.amount_usd); c.months.add(x.entry_date.slice(0, 7)); m.set(k, c);
    }
    return [...m.values()].sort((a, b) => Number(b.charged) - Number(a.charged) || b.usd - a.usd);
  }, [entries]);
  const manualRows = useMemo(() => entries.filter((x) => x.source !== 'quickbooks'), [entries]);
  const months = useMemo(() => [...new Set(entries.map((x) => x.entry_date.slice(0, 7)))].sort(), [entries]);

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-gray-700">🏢 مصاريف المركب من دفتر الشركة (QuickBooks)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {entries.length ? `${entries.length} قيداً · ${months[0]} → ${months[months.length - 1]}` : 'لا قيود بعد'} · تُقسَّط في الكارت بشهور إهلاكها، والتأمين من الوثيقة لا من الأقساط
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {entries.some((x) => x.source === 'quickbooks') && (
              <button type="button" onClick={reapply} disabled={busy} className="rounded-lg border border-navy-900 px-3 py-2 text-sm text-navy-900 hover:bg-navy-50 disabled:opacity-50" title="بعد تغيير قواعد التصنيف">
                ♻️ أعد التصنيف
              </button>
            )}
            <label className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white ${busy ? 'bg-gray-400' : 'bg-navy-900 hover:bg-navy-800'}`}>
              {busy ? 'جارٍ…' : '📥 استيراد ملفّ COGS'}
              <input type="file" accept=".xlsm,.xlsx,.xls" className="hidden" onChange={onFile} disabled={busy} />
            </label>
          </div>
        )}
      </div>

      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {done && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✅ {done}</p>}
      {warnings.map((w) => <p key={w} className="text-xs text-amber-700">⚠️ {w}</p>)}

      {plan && (
        <div className="rounded-lg border border-navy-900/15 bg-slate-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-800">
            خطّة الترحيل — {fileName}: {plan.counts.total} صفّاً · <span className="text-emerald-700">{plan.counts.new} جديد ({fmt(plan.totals_new_usd)} USD)</span> · {plan.counts.existing} موجودٌ يُتخطّى
            {plan.counts.errors > 0 && <span className="text-red-700"> · {plan.counts.errors} خطأ</span>}
            {plan.counts.unmapped > 0 && <span className="text-amber-700"> · {plan.counts.unmapped} خارج الخريطة</span>}
          </p>
          {plan.by_category.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500"><th className="text-start py-1">البند</th><th className="text-start">يُحمَّل؟</th><th className="text-end">عدد</th><th className="text-end">USD</th></tr></thead>
              <tbody>{plan.by_category.map((c) => (
                <tr key={`${c.category}|${c.charged}`} className={`border-t ${c.charged ? '' : 'text-gray-400'}`}>
                  <td className="py-1">{c.item_label}</td><td>{c.charged ? 'نعم' : 'لا — مستبعَد'}</td><td className="text-end">{c.count}</td><td className="text-end font-mono">{fmt(c.usd)}</td>
                </tr>))}</tbody>
            </table>
          )}
          {plan.vanished.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {plan.vanished.length} قيداً في القاعدة وليس في هذا الملفّ (صُحّح في QuickBooks؟) — لا يُحذف تلقائيّاً: راجعه في القائمة أدناه.
              <span className="block mt-1 font-mono">{plan.vanished.slice(0, 8).map((v) => `${v.entry_date} ${v.doc_number} ${fmt(v.amount_usd)}`).join(' · ')}{plan.vanished.length > 8 ? ' …' : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={commit} disabled={busy || plan.counts.new === 0 || plan.counts.errors > 0}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              ترحيل {plan.counts.new} قيداً
            </button>
            <button type="button" onClick={() => setShowRows((s) => !s)} className="text-sm text-navy-900 underline">{showRows ? 'إخفاء الصفوف' : 'عرض الصفوف'}</button>
            <button type="button" onClick={() => { setPlan(null); setRows([]); }} className="text-sm text-gray-500">إلغاء</button>
          </div>
          {showRows && (
            <div className="max-h-80 overflow-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0"><tr><th className="p-1 text-start">الحالة</th><th className="p-1 text-start">التاريخ</th><th className="p-1 text-start">الحساب</th><th className="p-1 text-start">البند</th><th className="p-1 text-start">المورّد</th><th className="p-1 text-end">USD</th><th className="p-1 text-end">إهلاك</th></tr></thead>
                <tbody>{plan.rows.map((r, i) => (
                  <tr key={i} className={`border-t ${r.status === 'error' ? 'bg-red-50' : r.status === 'existing' ? 'text-gray-400' : r.unmapped ? 'bg-amber-50' : ''}`}>
                    <td className="p-1">{r.status === 'new' ? 'جديد' : r.status === 'existing' ? 'موجود' : `خطأ: ${r.error}`}</td>
                    <td className="p-1 font-mono">{r.entry_date}</td><td className="p-1">{r.account_code}</td>
                    <td className="p-1">{r.item_label}{!r.charged && ' (مستبعَد)'}</td><td className="p-1">{r.supplier}</td>
                    <td className="p-1 text-end font-mono">{fmt(r.amount_usd)}</td><td className="p-1 text-end">{r.depreciation_months ?? '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {summary.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500"><th className="text-start py-1">البند</th><th className="text-start">يُحمَّل؟</th><th className="text-end">عدد</th><th className="text-end">USD</th></tr></thead>
          <tbody>{summary.map((c) => (
            <tr key={`${c.label}|${c.charged}`} className={`border-t ${c.charged ? '' : 'text-gray-400'}`}>
              <td className="py-1">{c.label}</td><td>{c.charged ? 'نعم' : 'لا'}</td><td className="text-end">{c.count}</td><td className="text-end font-mono">{fmt(c.usd)}</td>
            </tr>))}</tbody>
        </table>
      )}

      {isAdmin && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">سطرٌ يدويّ — وثيقة تأمينٍ أو إهلاكٌ سنويّ</summary>
          <p className="text-xs text-gray-500 mt-1 mb-2">المبلغ الكلّيّ وشهور التقسيط، والكارت يقسّمه بالتساوي من شهر التاريخ. التأمين: القسط السنويّ من الوثيقة على 12.</p>
          <form onSubmit={addEntry} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select name="source" className={IN} defaultValue="policy"><option value="policy">وثيقة</option><option value="manual">يدويّ</option></select>
            <input name="entry_date" type="date" required className={IN} title="أوّل شهر" />
            <input name="item_label" required placeholder="البند — مثل: تأمين H&M 2025/26" className={IN} />
            <select name="category" className={IN} defaultValue="insurance">{CATEGORY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input name="amount_usd" required inputMode="decimal" placeholder="المبلغ الكلّيّ USD" className={IN} />
            <input name="depreciation_months" inputMode="numeric" placeholder="شهور التقسيط (12)" className={IN} />
            <input name="doc_number" placeholder="رقم الوثيقة / المستند" className={IN} />
            <button type="submit" disabled={busy} className="rounded-lg bg-navy-900 px-4 py-2 text-sm text-white hover:bg-navy-800 disabled:opacity-50">أضف</button>
          </form>
        </details>
      )}

      {manualRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">السطور اليدويّة والوثائق</p>
          <table className="w-full text-xs">
            <thead className="bg-gray-50"><tr><th className="p-1 text-start">من</th><th className="p-1 text-start">البند</th><th className="p-1 text-start">المستند</th><th className="p-1 text-end">USD</th><th className="p-1 text-end">شهور</th><th className="p-1 text-end">شهريّاً</th>{isAdmin && <th />}</tr></thead>
            <tbody>{manualRows.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-1 font-mono">{x.entry_date.slice(0, 7)}</td><td className="p-1">{x.item_label}</td><td className="p-1">{x.doc_number || '—'}</td>
                <td className="p-1 text-end font-mono">{fmt(x.amount_usd)}</td><td className="p-1 text-end">{x.depreciation_months ?? 1}</td>
                <td className="p-1 text-end font-mono">{fmt(Number(x.amount_usd) / (x.depreciation_months || 1))}</td>
                {isAdmin && <td className="p-1 text-end"><button type="button" onClick={() => remove(x.id)} className="text-red-600 hover:underline">حذف</button></td>}
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
