'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';

// ── per-vessel configuration ──
export interface ExpItem { key: string; label: string; col: number }
export interface VesselConfig {
  vessel: string;      // save key + display
  sheetKey: string;    // UPPERCASE token to locate the data sheet
  agentExport: string; // e.g. وكيل الاتحاد
  agentImport: string; // e.g. وكيل البسّام
  linkInvoices?: boolean;  // اربط فواتير المشتريات واطرحها من صافي التشغيل
  dbVesselName?: string;   // اسم السفينة في قاعدة البيانات (لجلب فواتيرها)
  col: {
    type: number; ref: number; date: number; collection: number;
    truckC: number; truck: number; vehC: number; veh: number;
    passC: number; pass: number; houryaC: number; discharge: number;
    O: number; P: number; bunker: number; balance: number;
  };
  exportExp: ExpItem[];
  importExp: ExpItem[];
}

export const PELAGOS: VesselConfig = {
  vessel: 'Pelagos', sheetKey: 'PELAGOS', agentExport: 'وكيل الاتحاد', agentImport: 'وكيل البسّام',
  col: { type: 0, ref: 1, date: 3, collection: 4, truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12, O: 14, P: 15, bunker: 23, balance: 32 },
  exportExp: [
    { key: 'shipOrder60', label: 'عمولة إذن الشحن 60%', col: 24 },
    { key: 'freeZone2', label: 'Free Zone 2%', col: 25 },
    { key: 'toursVeh12', label: 'Tours سيارات 12%', col: 26 },
    { key: 'toursPks12', label: 'Tours حرية 12%', col: 27 },
    { key: 'cargo', label: 'Cargo', col: 28 },
    { key: 'egyPort', label: 'ميناء مصر', col: 30 },
  ],
  importExp: [
    { key: 'comm10', label: 'عمولة 10%', col: 17 },
    { key: 'comm15', label: 'عمولة 15%', col: 18 },
    { key: 'comm20', label: 'عمولة 20%', col: 19 },
    { key: 'fw', label: 'F.W', col: 20 },
    { key: 'others', label: 'Others', col: 21 },
    { key: 'elbassam', label: 'البسّام', col: 22 },
    { key: 'ksaPort', label: 'ميناء السعودية', col: 29 },
  ],
};

export const ALCUDIA: VesselConfig = {
  vessel: 'Alcudia', sheetKey: 'ALCUDIA', agentExport: 'وكيل الاتحاد', agentImport: 'وكيل البسّام',
  linkInvoices: true, dbVesselName: 'Alcudia Express',
  col: { type: 0, ref: 1, date: 3, collection: 4, truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12, O: 14, P: 15, bunker: 25, balance: 35 },
  exportExp: [
    { key: 'otherExpsE', label: 'Other EXPS', col: 24 },
    { key: 'dischargeOrderTax', label: 'Discharge Order Tax', col: 26 },
    { key: 'disShiOrder60', label: 'Dis/Shi Order 60%', col: 27 },
    { key: 'frtDep', label: 'Frt Dep 6.5%+500', col: 28 },
    { key: 'vehicle12', label: 'Vehicle 12%', col: 29 },
    { key: 'pks12', label: 'PKS 12%', col: 30 },
    { key: 'broker', label: 'Broker Commission', col: 31 },
    { key: 'egyPort', label: 'ميناء مصر', col: 33 },
  ],
  importExp: [
    { key: 'comm10', label: 'عمولة 10%', col: 17 },
    { key: 'commVehicle', label: 'Commission Vehicle', col: 18 },
    { key: 'comm20', label: 'عمولة 20%', col: 19 },
    { key: 'fw', label: 'F.W', col: 20 },
    { key: 'specialDisc', label: 'Special Disc', col: 21 },
    { key: 'elbassam', label: 'البسّام', col: 22 },
    { key: 'telcome', label: 'Telcome', col: 23 },
    { key: 'otherExpsI', label: 'Other EXPS', col: 24 },
    { key: 'ksaPort', label: 'ميناء السعودية', col: 32 },
  ],
};

const num = (v: any) => (typeof v === 'number' ? v : 0);
const serialToMonth = (s: any): string | null => {
  if (typeof s !== 'number') return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y}`; };
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
// فرق الشهور: b − a (بالشهور)
const monthDiff = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
};

interface Side {
  truckC: number; truck: number; vehC: number; veh: number; passC: number; pass: number; houryaC: number; discharge: number;
  exp: Record<string, number>;
}
interface Voyage { ref: any; month: string | null; E: Side; I: Side; bunker: number; net: number; O: number; P: number; }
const emptySide = (): Side => ({ truckC: 0, truck: 0, vehC: 0, veh: 0, passC: 0, pass: 0, houryaC: 0, discharge: 0, exp: {} });

function parseWorkbook(wb: XLSX.WorkBook, cfg: VesselConfig): Voyage[] {
  const name = wb.SheetNames.find((n) => n.trim().toUpperCase() === cfg.sheetKey)
    || wb.SheetNames.find((n) => n.trim().toUpperCase().includes(cfg.sheetKey) && !n.toUpperCase().includes('TRUCK'))
    || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  for (const m of (ws['!merges'] || [])) {
    if (m.s.c === cfg.col.date && m.e.c === cfg.col.date) {
      const top = grid[m.s.r]?.[cfg.col.date];
      for (let r = m.s.r; r <= m.e.r; r++) if (grid[r]) grid[r][cfg.col.date] = top;
    }
  }
  const C = cfg.col;
  const voy: Record<string, Voyage> = {};
  let cur: any = null;
  for (const row of grid) {
    if (!row) continue;
    const t = String(row[C.type] ?? '').trim();
    if (t !== 'Exp.' && t !== 'Imp.') continue;
    if (row[C.ref] != null && String(row[C.ref]).trim() !== '') cur = row[C.ref];
    if (cur == null) continue;
    const key = String(cur);
    if (!voy[key]) voy[key] = { ref: cur, month: null, E: emptySide(), I: emptySide(), bunker: 0, net: 0, O: 0, P: 0 };
    const V = voy[key];
    const side = t === 'Exp.' ? V.E : V.I;
    if (t === 'Exp.' && V.month == null && typeof row[C.date] === 'number') V.month = serialToMonth(row[C.date]);
    side.truckC += num(row[C.truckC]); side.truck += num(row[C.truck]);
    side.vehC += num(row[C.vehC]); side.veh += num(row[C.veh]);
    side.passC += num(row[C.passC]); side.pass += num(row[C.pass]);
    side.houryaC += num(row[C.houryaC]); side.discharge += num(row[C.discharge]);
    V.bunker += num(row[C.bunker]);
    V.net += num(row[C.balance]);
    V.O += num(row[C.O]); V.P += num(row[C.P]);
    const set = t === 'Exp.' ? cfg.exportExp : cfg.importExp;
    for (const e of set) side.exp[e.key] = (side.exp[e.key] || 0) + num(row[e.col]);
  }
  return Object.values(voy).filter((v) => v.month != null);
}

const REV_ROWS = [
  { key: 'truck', cKey: 'truckC', label: 'نولون شاحنات' },
  { key: 'veh', cKey: 'vehC', label: 'نولون سيارات' },
  { key: 'pass', cKey: 'passC', label: 'ركاب' },
] as const;

function aggSide(voyages: Voyage[], key: 'E' | 'I'): Side {
  const s = emptySide();
  for (const v of voyages) {
    const sd = v[key];
    (['truckC', 'truck', 'vehC', 'veh', 'passC', 'pass', 'houryaC', 'discharge'] as const).forEach((k) => { s[k] += sd[k]; });
    for (const k in sd.exp) s.exp[k] = (s.exp[k] || 0) + sd.exp[k];
  }
  return s;
}
const sideRevenue = (s: Side) => s.truck + s.veh + s.pass + s.discharge;

export default function VesselProfitReport({ config }: { config: VesselConfig }) {
  const cfg = config;
  const labelOf = useMemo(() => {
    const m: Record<string, string> = {};
    [...cfg.exportExp, ...cfg.importExp].forEach((e) => { m[e.key] = e.label; });
    return m;
  }, [cfg]);

  const [fileName, setFileName] = useState('');
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [manual, setManual] = useState<Record<string, { opening: string; closing: string; salaries: string }>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // فواتير المشتريات + أسعار الصرف (لو المركب مربوط بالفواتير)
  const [invoices, setInvoices] = useState<any[]>([]);
  const [rates, setRates] = useState<Record<string, Record<string, number>>>({});

  const cur = manual[month] || { opening: '', closing: '', salaries: '' };
  const setCur = (patch: Partial<{ opening: string; closing: string; salaries: string }>) =>
    setManual((m) => ({ ...m, [month]: { ...(m[month] || { opening: '', closing: '', salaries: '' }), ...patch } }));

  // reset + load saved when the vessel changes
  useEffect(() => {
    setVoyages([]); setManual({}); setMonth(''); setFileName(''); setError('');
    api.get(`/api/vessel-profit/${cfg.vessel}`).then((res) => {
      const d = res.data;
      if (d && Array.isArray(d.voyages) && d.voyages.length) {
        setVoyages(d.voyages as Voyage[]);
        setManual(d.manual || {});
        const ms = [...new Set((d.voyages as Voyage[]).map((v) => v.month!))].sort();
        setMonth(ms[0]);
        setFileName('محفوظ في السيرفر');
      }
    }).catch(() => {});
  }, [cfg.vessel]);

  // جلب فواتير المركب + أسعار الصرف
  useEffect(() => {
    if (!cfg.linkInvoices || !cfg.dbVesselName) { setInvoices([]); setRates({}); return; }
    (async () => {
      try {
        const [vs, rt] = await Promise.all([api.get('/api/vessels'), api.get('/api/exchange-rates')]);
        setRates(rt.data || {});
        const v = (vs.data || []).find((x: any) => x.name === cfg.dbVesselName);
        if (v) { const inv = await api.get(`/api/invoices/by-vessel/${v.id}`); setInvoices(inv.data || []); }
        else setInvoices([]);
      } catch { /* تجاهل — المركب هيشتغل من غير فواتير */ }
    })();
  }, [cfg.linkInvoices, cfg.dbVesselName]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsed = parseWorkbook(wb, cfg);
      if (parsed.length === 0) { setError('لم يتم العثور على بيانات رحلات في الملف.'); return; }
      setVoyages(parsed);
      setFileName(file.name);
      const months = [...new Set(parsed.map((v) => v.month!))].sort();
      setMonth(months[0]);
    } catch (err: any) {
      setError('تعذّرت قراءة الملف: ' + (err?.message || ''));
    }
  }

  async function save() {
    if (!voyages.length) return;
    setSaving(true); setSavedMsg('');
    try {
      await api.put(`/api/vessel-profit/${cfg.vessel}`, { voyages, manual });
      setSavedMsg('تم الحفظ ✅');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch { setSavedMsg('فشل الحفظ'); }
    finally { setSaving(false); }
  }

  const months = useMemo(() => [...new Set(voyages.map((v) => v.month!))].sort(), [voyages]);
  const sel = useMemo(() => voyages.filter((v) => v.month === month), [voyages, month]);

  const data = useMemo(() => {
    if (!sel.length) return null;
    const E = aggSide(sel, 'E'), I = aggSide(sel, 'I');
    const revE = sideRevenue(E), revI = sideRevenue(I);
    const expE = Object.values(E.exp).reduce((a, b) => a + b, 0);
    const expI = Object.values(I.exp).reduce((a, b) => a + b, 0);
    const supplies = sel.reduce((s, v) => s + v.bunker, 0);
    const netBalance = sel.reduce((s, v) => s + v.net, 0);
    const O = sel.reduce((s, v) => s + v.O, 0);
    const P = sel.reduce((s, v) => s + v.P, 0);
    const revenue = revE + revI;
    const mm = manual[month] || { opening: '', closing: '', salaries: '' };
    const opening = parseFloat(mm.opening) || 0;
    const closing = parseFloat(mm.closing) || 0;
    const bunkerCost = opening + supplies - closing;
    const salariesN = parseFloat(mm.salaries) || 0;
    const net = netBalance - opening + closing - salariesN;
    return {
      E, I, revE, revI, expE, expI, supplies, opening, closing, bunkerCost, salaries: salariesN,
      net, O, P, revenue, count: sel.length, expenses: revenue - net,
      liqBassam: O, liqIttihad: P - O,
    };
  }, [sel, manual, month]);

  // بند المشتريات (فواتير المركب) — قسط ثابت بالدولار محوّل بسعر صرف شهر الشراء
  const purchases = useMemo(() => {
    if (!cfg.linkInvoices || !month) return null;
    const items = invoices
      .map((inv) => {
        const pm = (inv.invoice_date || '').slice(0, 7);
        if (!pm) return null;
        const nMonths = inv.depreciation_months && inv.depreciation_months > 1 ? inv.depreciation_months : 1;
        const diff = monthDiff(pm, month);
        if (diff < 0 || diff >= nMonths) return null; // خارج فترة الإهلاك للشهر المختار
        const curr = inv.currency || 'USD';
        const rate = curr === 'USD' ? 1 : Number(rates[pm]?.[curr]);
        const missing = !(rate > 0);
        const usdTotal = missing ? 0 : Number(inv.total_amount) / rate;
        const installment = usdTotal / nMonths;
        return {
          id: inv.id, number: inv.invoice_number, supplier: inv.supplier?.name || '—',
          amount: Number(inv.total_amount), currency: curr, nMonths, purchaseMonth: pm,
          rate, missing, usdTotal, installment, seq: diff + 1,
        };
      })
      .filter(Boolean) as any[];
    const total = items.reduce((s, i) => s + i.installment, 0);
    const missingList = items.filter((i) => i.missing);
    return { items, total, missingList };
  }, [cfg.linkInvoices, invoices, rates, month]);

  const PRINT_CSS = `@media print {
    @page { size: A4 landscape; margin: 9mm; }
    body * { visibility: hidden !important; }
    #vp-doc, #vp-doc * { visibility: visible !important; }
    #vp-doc { position: absolute; left: 0; top: 0; width: 100%; color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #vp-doc .dh { display:flex; align-items:center; justify-content:space-between; border-bottom: 2.5pt solid #1d4ed8; padding-bottom: 6px; margin-bottom: 10px; }
    #vp-doc .dh .brand { font-size: 13pt; font-weight: 800; } #vp-doc .dh .brand span { color:#1d4ed8; }
    #vp-doc .dh .meta { text-align:left; font-size: 9pt; color:#475569; line-height:1.5; }
    #vp-doc .dt { text-align:center; font-size: 15pt; font-weight: 800; color:#1d4ed8; margin: 2px 0 10px; }
    #vp-doc .kpis { display:flex; gap:8px; margin-bottom:12px; }
    #vp-doc .kpi { flex:1; border:1pt solid #cbd5e1; border-radius:6px; padding:7px 6px; text-align:center; }
    #vp-doc .kpi .l { font-size:8pt; color:#64748b; display:block; margin-bottom:2px; }
    #vp-doc .kpi .v { font-size:13pt; font-weight:800; }
    #vp-doc .kpi.main { background:#059669; color:#fff; border-color:#047857; } #vp-doc .kpi.main .l { color:#d1fae5; }
    #vp-doc h3 { font-size:10.5pt; color:#1d4ed8; margin: 12px 0 5px; padding-right:7px; border-right:3.5pt solid #1d4ed8; }
    #vp-doc table { width:100%; border-collapse:collapse; font-size:8.8pt; margin-bottom:4px; }
    #vp-doc th, #vp-doc td { border:.6pt solid #cbd5e1; padding:3.5px 7px; text-align:right; white-space:nowrap; }
    #vp-doc th { background:#eef2ff; color:#1e3a8a; font-weight:700; }
    #vp-doc tr.tot td { background:#f1f5f9; font-weight:800; }
    #vp-doc .cols { display:flex; gap:14px; align-items:flex-start; } #vp-doc .cols > div { flex:1; }
    #vp-doc .foot { margin-top:10px; border-top:.6pt solid #cbd5e1; padding-top:5px; font-size:7.5pt; color:#94a3b8; text-align:center; }
  }`;

  function exportExcel() {
    if (!data) return;
    const rows: any[] = [
      { البند: 'صافي ربح الشهر', القيمة: data.net },
      { البند: 'إجمالي الإيراد', القيمة: data.revenue },
      { البند: 'إجمالي المصروفات', القيمة: data.expenses },
      { البند: 'بنكر — رصيد أول المدة', القيمة: data.opening },
      { البند: 'بنكر — تموينات الشهر', القيمة: data.supplies },
      { البند: 'بنكر — مخزون آخر المدة', القيمة: data.closing },
      { البند: 'بنكر — المستهلك', القيمة: data.bunkerCost },
      { البند: 'مرتبات الشهر', القيمة: data.salaries },
      { البند: `سيولة ${cfg.agentExport} (P−O)`, القيمة: data.liqIttihad },
      { البند: `سيولة ${cfg.agentImport} (O)`, القيمة: data.liqBassam },
      { البند: 'إجمالي التحصيل (P)', القيمة: data.P },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ملخص');
    XLSX.writeFile(wb, `ربح-${cfg.vessel}-${month}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">ملف {cfg.vessel} (Excel)</label>
          <input type="file" accept=".xlsx,.xls" onChange={onFile}
            className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700" />
          {fileName && <p className="text-xs text-gray-400 mt-1">📄 {fileName} — {voyages.length} رحلة</p>}
        </div>
        {months.length > 0 && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">الشهر</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        )}
        {data && (
          <div className="mr-auto flex items-center gap-2">
            {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
            <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'جاري الحفظ...' : '💾 حفظ'}</button>
            <button onClick={exportExcel} className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">📥 تصدير Excel</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">🖨️ طباعة / PDF</button>
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!voyages.length && !error && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          ارفع ملف {cfg.vessel} عشان يظهر التقرير — صافي الربح والإيرادات والمصروفات والسيولة مقسومة صادر/وارد.
        </div>
      )}

      {data && (
        <>
          <style>{PRINT_CSS}</style>
          <div className="space-y-4 print:hidden">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-600 text-white rounded-xl p-4">
                <p className="text-xs opacity-80">صافي ربح {monthLabel(month)}</p>
                <p className="text-2xl font-bold mt-1">{fmt(data.net)}</p>
                <p className="text-xs opacity-80 mt-1">{sel.length} رحلة</p>
              </div>
              <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">إجمالي الإيراد</p><p className="text-xl font-bold text-gray-800 mt-1">{fmt(data.revenue)}</p></div>
              <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">إجمالي المصروفات</p><p className="text-xl font-bold text-red-600 mt-1">{fmt(data.expenses)}</p><p className="text-[11px] text-gray-400 mt-1">بنكر منها: {fmt(data.bunkerCost)}</p></div>
              <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">السيولة عند الوكلاء</p><p className="text-sm font-semibold text-indigo-700 mt-1">{cfg.agentExport}: {fmt(data.liqIttihad)}</p><p className="text-sm font-semibold text-purple-700">{cfg.agentImport}: {fmt(data.liqBassam)}</p></div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {([
                { key: 'E', label: `صادر — ${cfg.agentExport}`, rev: data.revE, exp: data.expE, side: data.E, color: 'indigo' },
                { key: 'I', label: `وارد — ${cfg.agentImport}`, rev: data.revI, exp: data.expI, side: data.I, color: 'purple' },
              ] as const).map((panel) => (
                <div key={panel.key} className="bg-white rounded-xl shadow p-4">
                  <h3 className={`font-bold text-${panel.color}-700 mb-3`}>{panel.label}</h3>
                  <table className="w-full text-sm mb-3">
                    <thead className="text-gray-500 text-xs"><tr><th className="text-right py-1">الإيراد</th><th className="text-right py-1">العدد</th><th className="text-right py-1">المبلغ</th><th className="text-right py-1">متوسط/وحدة</th></tr></thead>
                    <tbody>
                      {REV_ROWS.map((r) => {
                        const cnt = (panel.side as any)[r.cKey] as number;
                        const amt = (panel.side as any)[r.key] as number;
                        return (<tr key={r.key} className="border-t"><td className="py-1">{r.label}</td><td className="py-1 text-gray-500">{cnt || '—'}</td><td className="py-1 font-medium">{fmt(amt)}</td><td className="py-1 text-blue-600">{cnt ? fmt(amt / cnt) : '—'}</td></tr>);
                      })}
                      <tr className="border-t"><td className="py-1">إذن الشحن</td><td /><td className="py-1 font-medium">{fmt(panel.side.discharge)}</td><td /></tr>
                      <tr className="border-t bg-gray-50 font-bold"><td className="py-1">إجمالي الإيراد</td><td /><td className="py-1">{fmt(panel.rev)}</td><td /></tr>
                    </tbody>
                  </table>
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs"><tr><th className="text-right py-1">المصروف</th><th className="text-right py-1">المبلغ</th></tr></thead>
                    <tbody>
                      {Object.entries(panel.side.exp).map(([k, v]) => (<tr key={k} className="border-t"><td className="py-1">{labelOf[k] || k}</td><td className="py-1 text-red-600">{fmt(v)}</td></tr>))}
                      <tr className="border-t bg-gray-50 font-bold"><td className="py-1">إجمالي المصروفات</td><td className="py-1 text-red-700">{fmt(panel.exp)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">📊 الإحصائيات</h3>
              <div className="inline-block bg-emerald-50 rounded-lg px-4 py-2 mb-3"><span className="text-xs text-emerald-700">متوسط ربح الرحلة</span><span className="font-bold text-emerald-800 text-lg mr-2">{fmt(data.net / data.count)}</span></div>
              <table className="w-full text-sm max-w-md">
                <thead className="text-gray-500 text-xs"><tr><th className="text-right py-1">متوسط لكل رحلة</th><th className="text-right py-1">صادر</th><th className="text-right py-1">وارد</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="py-1">شاحنات</td><td className="py-1 font-medium">{fmt(data.E.truckC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.truckC / data.count)}</td></tr>
                  <tr className="border-t"><td className="py-1">سيارات</td><td className="py-1 font-medium">{fmt(data.E.vehC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.vehC / data.count)}</td></tr>
                  <tr className="border-t"><td className="py-1">ركاب</td><td className="py-1 font-medium">{fmt(data.E.passC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.passC / data.count)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">⛽ البنكر (مخزون)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end text-sm">
                <div><label className="block text-xs text-gray-500 mb-1">رصيد أول المدة (يدوي)</label><input value={cur.opening} onChange={(e) => setCur({ opening: e.target.value })} inputMode="decimal" placeholder="0" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><p className="text-xs text-gray-500 mb-1">+ تموينات الشهر (من الإكسيل)</p><p className="border rounded-lg px-3 py-2 bg-gray-50 font-medium">{fmt(data.supplies)}</p></div>
                <div><label className="block text-xs text-gray-500 mb-1">− مخزون آخر المدة (يدوي)</label><input value={cur.closing} onChange={(e) => setCur({ closing: e.target.value })} inputMode="decimal" placeholder="0" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><p className="text-xs text-gray-500 mb-1">= البنكر المستهلك</p><p className="border rounded-lg px-3 py-2 bg-red-50 font-bold text-red-700">{fmt(data.bunkerCost)}</p></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4 flex items-end justify-between flex-wrap gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">مرتبات الشهر (يدوي)</label><input value={cur.salaries} onChange={(e) => setCur({ salaries: e.target.value })} inputMode="decimal" placeholder="0" className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="text-right"><p className="text-xs text-gray-500">المبلغ المطروح من الصافي</p><p className="font-bold text-red-600 text-lg">{fmt(data.salaries)}</p></div>
            </div>

            {purchases && (
              <div className="bg-white rounded-xl shadow p-4">
                <h3 className="font-bold text-gray-700 mb-3">🧾 المشتريات (فواتير المركب) — بالدولار</h3>
                {purchases.missingList.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-3">
                    ⚠️ فواتير سعر صرفها ناقص لشهر الشراء — مش محتسبة لحد ما تدخل السعر في كارت أسعار الصرف:
                    {purchases.missingList.map((i) => ` ${i.number} (${i.currency} — ${monthLabel(i.purchaseMonth)})`).join('،')}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="bg-emerald-50 rounded-lg p-3"><p className="text-emerald-600 text-xs">صافي قبل المشتريات</p><p className="text-lg font-bold text-emerald-800">{fmt(data.net)}</p></div>
                  <div className="bg-red-50 rounded-lg p-3"><p className="text-red-600 text-xs">إجمالي المشتريات (قسط الشهر)</p><p className="text-lg font-bold text-red-700">{fmt(purchases.total)}</p></div>
                  <div className="bg-blue-600 text-white rounded-lg p-3"><p className="text-xs opacity-80">صافي نهائي بعد المشتريات</p><p className="text-lg font-bold">{fmt(data.net - purchases.total)}</p></div>
                </div>
                {purchases.items.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs"><tr><th className="text-right py-1">رقم الفاتورة</th><th className="text-right py-1">المورد</th><th className="text-right py-1">المبلغ الأصلي</th><th className="text-right py-1">شهور الإهلاك</th><th className="text-right py-1">القسط الشهري (USD)</th></tr></thead>
                    <tbody>
                      {purchases.items.map((i) => (
                        <tr key={i.id} className="border-t">
                          <td className="py-1">{i.number}</td>
                          <td className="py-1">{i.supplier}</td>
                          <td className="py-1">{fmt(i.amount)} {i.currency}</td>
                          <td className="py-1 text-gray-500">{i.nMonths > 1 ? `${i.seq}/${i.nMonths}` : 'كامل'}</td>
                          <td className="py-1 font-medium text-red-600">{i.missing ? '⚠️ سعر ناقص' : fmt(i.installment)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 font-bold"><td className="py-1" colSpan={4}>إجمالي المشتريات</td><td className="py-1 text-red-700">{fmt(purchases.total)}</td></tr>
                    </tbody>
                  </table>
                ) : <p className="text-gray-400 text-sm">لا توجد فواتير على المركب في {monthLabel(month)}.</p>}
              </div>
            )}

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">السيولة عند كل وكيل</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-indigo-50 rounded-lg p-3"><p className="text-indigo-600 text-xs">{cfg.agentExport} (P − O)</p><p className="text-lg font-bold text-indigo-800">{fmt(data.liqIttihad)}</p></div>
                <div className="bg-purple-50 rounded-lg p-3"><p className="text-purple-600 text-xs">{cfg.agentImport} (O)</p><p className="text-lg font-bold text-purple-800">{fmt(data.liqBassam)}</p></div>
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-gray-500 text-xs">إجمالي التحصيل (P)</p><p className="text-lg font-bold text-gray-800">{fmt(data.P)}</p></div>
              </div>
            </div>
          </div>

          {/* ── print-only document ── */}
          <div id="vp-doc" dir="rtl" className="hidden print:block">
            <div className="dh">
              <div className="brand">UME <span>Holding</span></div>
              <div className="meta">المركب: {cfg.vessel}<br />الفترة: {monthLabel(month)}<br />عدد الرحلات: {sel.length}</div>
            </div>
            <div className="dt">تقرير صافي ربح المركب</div>
            <div className="kpis">
              <div className="kpi main"><span className="l">صافي ربح الشهر</span><span className="v">{fmt(data.net)}</span></div>
              <div className="kpi"><span className="l">إجمالي الإيراد</span><span className="v">{fmt(data.revenue)}</span></div>
              <div className="kpi"><span className="l">إجمالي المصروفات</span><span className="v">{fmt(data.expenses)}</span></div>
              <div className="kpi"><span className="l">متوسط ربح الرحلة</span><span className="v">{fmt(data.net / data.count)}</span></div>
            </div>
            <h3>الإيرادات</h3>
            <table>
              <thead><tr><th>البند</th><th>صادر — عدد</th><th>صادر — مبلغ</th><th>وارد — عدد</th><th>وارد — مبلغ</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {REV_ROWS.map((r) => {
                  const eC = (data.E as any)[r.cKey], eA = (data.E as any)[r.key], iC = (data.I as any)[r.cKey], iA = (data.I as any)[r.key];
                  return (<tr key={r.key}><td>{r.label}</td><td>{eC || '—'}</td><td>{fmt(eA)}</td><td>{iC || '—'}</td><td>{fmt(iA)}</td><td>{fmt(eA + iA)}</td></tr>);
                })}
                <tr><td>إذن الشحن</td><td>—</td><td>{fmt(data.E.discharge)}</td><td>—</td><td>{fmt(data.I.discharge)}</td><td>{fmt(data.E.discharge + data.I.discharge)}</td></tr>
                <tr className="tot"><td>إجمالي الإيراد</td><td></td><td>{fmt(data.revE)}</td><td></td><td>{fmt(data.revI)}</td><td>{fmt(data.revenue)}</td></tr>
              </tbody>
            </table>
            <div className="cols">
              <div><h3>مصروفات الصادر ({cfg.agentExport})</h3><table><thead><tr><th>المصروف</th><th>المبلغ</th></tr></thead><tbody>{Object.entries(data.E.exp).map(([k, v]) => (<tr key={k}><td>{labelOf[k] || k}</td><td>{fmt(v)}</td></tr>))}<tr className="tot"><td>إجمالي المصروفات</td><td>{fmt(data.expE)}</td></tr></tbody></table></div>
              <div><h3>مصروفات الوارد ({cfg.agentImport})</h3><table><thead><tr><th>المصروف</th><th>المبلغ</th></tr></thead><tbody>{Object.entries(data.I.exp).map(([k, v]) => (<tr key={k}><td>{labelOf[k] || k}</td><td>{fmt(v)}</td></tr>))}<tr className="tot"><td>إجمالي المصروفات</td><td>{fmt(data.expI)}</td></tr></tbody></table></div>
            </div>
            <div className="cols">
              <div>
                <h3>البنكر (مخزون)</h3>
                <table><thead><tr><th>رصيد أول المدة</th><th>+ تموينات الشهر</th><th>− مخزون آخر المدة</th><th>= المستهلك</th></tr></thead><tbody><tr><td>{fmt(data.opening)}</td><td>{fmt(data.supplies)}</td><td>{fmt(data.closing)}</td><td>{fmt(data.bunkerCost)}</td></tr></tbody></table>
                <h3>مصروفات أخرى</h3><table><tbody><tr><td>مرتبات الشهر</td><td>{fmt(data.salaries)}</td></tr></tbody></table>
              </div>
              <div>
                <h3>السيولة عند الوكلاء</h3>
                <table><thead><tr><th>{cfg.agentExport} (P−O)</th><th>{cfg.agentImport} (O)</th><th>إجمالي التحصيل (P)</th></tr></thead><tbody><tr><td>{fmt(data.liqIttihad)}</td><td>{fmt(data.liqBassam)}</td><td>{fmt(data.P)}</td></tr></tbody></table>
                <h3>متوسط الأعداد لكل رحلة</h3>
                <table><thead><tr><th>البند</th><th>صادر</th><th>وارد</th></tr></thead><tbody>
                  <tr><td>شاحنات</td><td>{fmt(data.E.truckC / data.count)}</td><td>{fmt(data.I.truckC / data.count)}</td></tr>
                  <tr><td>سيارات</td><td>{fmt(data.E.vehC / data.count)}</td><td>{fmt(data.I.vehC / data.count)}</td></tr>
                  <tr><td>ركاب</td><td>{fmt(data.E.passC / data.count)}</td><td>{fmt(data.I.passC / data.count)}</td></tr>
                </tbody></table>
              </div>
            </div>
            {purchases && (
              <>
                <h3>المشتريات (فواتير المركب) — بالدولار</h3>
                <table>
                  <thead><tr><th>رقم الفاتورة</th><th>المورد</th><th>المبلغ الأصلي</th><th>شهور الإهلاك</th><th>القسط الشهري (USD)</th></tr></thead>
                  <tbody>
                    {purchases.items.length ? purchases.items.map((i) => (
                      <tr key={i.id}><td>{i.number}</td><td>{i.supplier}</td><td>{fmt(i.amount)} {i.currency}</td><td>{i.nMonths > 1 ? `${i.seq}/${i.nMonths}` : 'كامل'}</td><td>{i.missing ? 'سعر ناقص' : fmt(i.installment)}</td></tr>
                    )) : (<tr><td colSpan={5}>لا توجد فواتير على المركب في هذا الشهر</td></tr>)}
                    <tr className="tot"><td colSpan={4}>إجمالي المشتريات</td><td>{fmt(purchases.total)}</td></tr>
                  </tbody>
                </table>
                <table>
                  <thead><tr><th>صافي قبل المشتريات</th><th>إجمالي المشتريات</th><th>صافي نهائي بعد المشتريات</th></tr></thead>
                  <tbody><tr className="tot"><td>{fmt(data.net)}</td><td>{fmt(purchases.total)}</td><td>{fmt(data.net - purchases.total)}</td></tr></tbody>
                </table>
              </>
            )}
            <div className="foot">UME Holding — نظام PMS · تقرير {cfg.vessel} · {monthLabel(month)}</div>
          </div>
        </>
      )}
    </div>
  );
}
