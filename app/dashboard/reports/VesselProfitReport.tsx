'use client';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

// ── column indices in "Mv-Pelagoss Express" sheet ──
const C = {
  type: 0, ref: 1, date: 3, collection: 4,
  truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12,
  O: 14, P: 15,
  comm10: 17, comm15: 18, comm20: 19, fw: 20, others: 21, elbassam: 22, bunker: 23,
  shipOrder60: 24, freeZone2: 25, toursVeh12: 26, toursPks12: 27, cargo: 28, ksaPort: 29, egyPort: 30,
  balance: 32,
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

interface Side {
  truckC: number; truck: number; vehC: number; veh: number; passC: number; pass: number; houryaC: number; discharge: number;
  exp: Record<string, number>;
}
interface Voyage { ref: any; month: string | null; E: Side; I: Side; bunker: number; net: number; O: number; P: number; }

const emptySide = (): Side => ({ truckC: 0, truck: 0, vehC: 0, veh: 0, passC: 0, pass: 0, houryaC: 0, discharge: 0, exp: {} });

function parseWorkbook(wb: XLSX.WorkBook): Voyage[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  // resolve merged DATE cells within their exact ranges
  for (const m of (ws['!merges'] || [])) {
    if (m.s.c === C.date && m.e.c === C.date) {
      const top = grid[m.s.r]?.[C.date];
      for (let r = m.s.r; r <= m.e.r; r++) if (grid[r]) grid[r][C.date] = top;
    }
  }
  const voy: Record<string, Voyage> = {};
  let cur: any = null;
  const expExport = [['shipOrder60', C.shipOrder60], ['freeZone2', C.freeZone2], ['toursVeh12', C.toursVeh12], ['toursPks12', C.toursPks12], ['cargo', C.cargo], ['egyPort', C.egyPort]] as const;
  const expImport = [['comm10', C.comm10], ['comm15', C.comm15], ['comm20', C.comm20], ['fw', C.fw], ['others', C.others], ['elbassam', C.elbassam], ['ksaPort', C.ksaPort]] as const;

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
    const set = t === 'Exp.' ? expExport : expImport;
    for (const [k, i] of set) side.exp[k] = (side.exp[k] || 0) + num(row[i]);
  }
  // fallback month from import date if export missing
  return Object.values(voy).filter((v) => v.month != null);
}

const REV_ROWS = [
  { key: 'truck', cKey: 'truckC', label: 'نولون شاحنات', unit: 'شاحنة' },
  { key: 'veh', cKey: 'vehC', label: 'نولون سيارات', unit: 'سيارة' },
  { key: 'pass', cKey: 'passC', label: 'ركاب', unit: 'راكب' },
] as const;
const EXP_LABEL: Record<string, string> = {
  shipOrder60: 'عمولة إذن الشحن 60%', freeZone2: 'Free Zone 2%', toursVeh12: 'Tours سيارات 12%',
  toursPks12: 'Tours حرية 12%', cargo: 'Cargo', egyPort: 'ميناء مصر',
  comm10: 'عمولة 10%', comm15: 'عمولة 15%', comm20: 'عمولة 20%', fw: 'F.W', others: 'Others',
  elbassam: 'البسّام', ksaPort: 'ميناء السعودية',
};

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

export default function VesselProfitReport() {
  const [fileName, setFileName] = useState('');
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [openingBunker, setOpeningBunker] = useState(''); // رصيد أول المدة (يدوي)
  const [closingBunker, setClosingBunker] = useState(''); // مخزون آخر المدة (يدوي)
  const [salaries, setSalaries] = useState('');           // مرتبات الشهر (يدوي)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsed = parseWorkbook(wb);
      if (parsed.length === 0) { setError('لم يتم العثور على بيانات رحلات في الملف.'); return; }
      setVoyages(parsed);
      setFileName(file.name);
      const months = [...new Set(parsed.map((v) => v.month!))].sort();
      setMonth(months[0]);
    } catch (err: any) {
      setError('تعذّرت قراءة الملف: ' + (err?.message || ''));
    }
  }

  const months = useMemo(() => [...new Set(voyages.map((v) => v.month!))].sort(), [voyages]);
  const sel = useMemo(() => voyages.filter((v) => v.month === month), [voyages, month]);

  const data = useMemo(() => {
    if (!sel.length) return null;
    const E = aggSide(sel, 'E'), I = aggSide(sel, 'I');
    const revE = sideRevenue(E), revI = sideRevenue(I);
    const expE = Object.values(E.exp).reduce((a, b) => a + b, 0);
    const expI = Object.values(I.exp).reduce((a, b) => a + b, 0);
    const supplies = sel.reduce((s, v) => s + v.bunker, 0); // تموينات الشهر (Excel col X)
    const netBalance = sel.reduce((s, v) => s + v.net, 0);  // Balance column (subtracts supplies)
    const O = sel.reduce((s, v) => s + v.O, 0);             // البسّام collections
    const P = sel.reduce((s, v) => s + v.P, 0);             // total collections
    const revenue = revE + revI;
    // البنكر المستهلك = رصيد أول المدة + تموينات − مخزون آخر المدة
    const opening = parseFloat(openingBunker) || 0;
    const closing = parseFloat(closingBunker) || 0;
    const bunkerCost = opening + supplies - closing;
    const salariesN = parseFloat(salaries) || 0;           // مرتبات الشهر (يدوي)
    // الصافي كان يطرح التموينات فقط؛ نصحّحه ليطرح البنكر المستهلك، ثم نطرح المرتبات
    const net = netBalance - opening + closing - salariesN;
    return {
      E, I, revE, revI, expE, expI, supplies, opening, closing, bunkerCost, salaries: salariesN,
      net, O, P, revenue, count: sel.length,
      expenses: revenue - net,                             // revenue - expenses = net
      liqBassam: O,
      liqIttihad: P - O,
    };
  }, [sel, openingBunker, closingBunker, salaries]);

  const PRINT_CSS = `@media print {
    @page { size: A4 landscape; margin: 9mm; }
    body * { visibility: hidden !important; }
    #pelagos-doc, #pelagos-doc * { visibility: visible !important; }
    #pelagos-doc { position: absolute; left: 0; top: 0; width: 100%; color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #pelagos-doc .dh { display:flex; align-items:center; justify-content:space-between;
      border-bottom: 2.5pt solid #1d4ed8; padding-bottom: 6px; margin-bottom: 10px; }
    #pelagos-doc .dh .brand { font-size: 13pt; font-weight: 800; color:#0f172a; }
    #pelagos-doc .dh .brand span { color:#1d4ed8; }
    #pelagos-doc .dh .meta { text-align:left; font-size: 9pt; color:#475569; line-height:1.5; }
    #pelagos-doc .dt { text-align:center; font-size: 15pt; font-weight: 800; color:#1d4ed8; margin: 2px 0 10px; }
    #pelagos-doc .kpis { display:flex; gap:8px; margin-bottom:12px; }
    #pelagos-doc .kpi { flex:1; border:1pt solid #cbd5e1; border-radius:6px; padding:7px 6px; text-align:center; }
    #pelagos-doc .kpi .l { font-size:8pt; color:#64748b; display:block; margin-bottom:2px; }
    #pelagos-doc .kpi .v { font-size:13pt; font-weight:800; }
    #pelagos-doc .kpi.main { background:#059669; color:#fff; border-color:#047857; }
    #pelagos-doc .kpi.main .l { color:#d1fae5; }
    #pelagos-doc h3 { font-size:10.5pt; color:#1d4ed8; margin: 12px 0 5px; padding-right:7px; border-right:3.5pt solid #1d4ed8; }
    #pelagos-doc table { width:100%; border-collapse:collapse; font-size:8.8pt; margin-bottom:4px; }
    #pelagos-doc th, #pelagos-doc td { border:0.6pt solid #cbd5e1; padding:3.5px 7px; text-align:right; white-space:nowrap; }
    #pelagos-doc th { background:#eef2ff; color:#1e3a8a; font-weight:700; }
    #pelagos-doc td.n { font-variant-numeric: tabular-nums; }
    #pelagos-doc tr.tot td { background:#f1f5f9; font-weight:800; }
    #pelagos-doc .cols { display:flex; gap:14px; align-items:flex-start; }
    #pelagos-doc .cols > div { flex:1; }
    #pelagos-doc .foot { margin-top:10px; border-top:0.6pt solid #cbd5e1; padding-top:5px; font-size:7.5pt; color:#94a3b8; text-align:center; }
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
      { البند: 'سيولة الاتحاد (P−O)', القيمة: data.liqIttihad },
      { البند: 'سيولة البسّام (O)', القيمة: data.liqBassam },
      { البند: 'إجمالي التحصيل (P)', القيمة: data.P },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ملخص');
    XLSX.writeFile(wb, `ربح-Pelagos-${month}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* Upload + month */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">ملف بيلاجوس (Excel)</label>
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
          <div className="mr-auto flex gap-2">
            <button onClick={exportExcel} className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">📥 تصدير Excel</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">🖨️ طباعة / PDF</button>
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!voyages.length && !error && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          ارفع ملف بيلاجوس عشان يظهر التقرير — صافي الربح والإيرادات والمصروفات والسيولة مقسومة صادر/وارد.
        </div>
      )}

      {data && (
        <>
          <style>{PRINT_CSS}</style>
          <div className="space-y-4 print:hidden">
          {/* KPI header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-600 text-white rounded-xl p-4">
              <p className="text-xs opacity-80">صافي ربح {monthLabel(month)}</p>
              <p className="text-2xl font-bold mt-1">{fmt(data.net)}</p>
              <p className="text-xs opacity-80 mt-1">{sel.length} رحلة</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">إجمالي الإيراد</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmt(data.revenue)}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">إجمالي المصروفات</p>
              <p className="text-xl font-bold text-red-600 mt-1">{fmt(data.expenses)}</p>
              <p className="text-[11px] text-gray-400 mt-1">بنكر منها: {fmt(data.bunkerCost)}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">السيولة عند الوكلاء</p>
              <p className="text-sm font-semibold text-indigo-700 mt-1">الاتحاد: {fmt(data.liqIttihad)}</p>
              <p className="text-sm font-semibold text-purple-700">البسّام: {fmt(data.liqBassam)}</p>
            </div>
          </div>

          {/* صادر / وارد panels */}
          <div className="grid md:grid-cols-2 gap-4">
            {([
              { key: 'E', label: 'صادر — وكيل الاتحاد', rev: data.revE, exp: data.expE, side: data.E, color: 'indigo' },
              { key: 'I', label: 'وارد — وكيل البسّام', rev: data.revI, exp: data.expI, side: data.I, color: 'purple' },
            ] as const).map((panel) => (
              <div key={panel.key} className="bg-white rounded-xl shadow p-4">
                <h3 className={`font-bold text-${panel.color}-700 mb-3`}>{panel.label}</h3>

                <table className="w-full text-sm mb-3">
                  <thead className="text-gray-500 text-xs">
                    <tr><th className="text-right py-1">الإيراد</th><th className="text-right py-1">العدد</th><th className="text-right py-1">المبلغ</th><th className="text-right py-1">متوسط/وحدة</th></tr>
                  </thead>
                  <tbody>
                    {REV_ROWS.map((r) => {
                      const cnt = (panel.side as any)[r.cKey] as number;
                      const amt = (panel.side as any)[r.key] as number;
                      return (
                        <tr key={r.key} className="border-t">
                          <td className="py-1">{r.label}</td>
                          <td className="py-1 text-gray-500">{cnt || '—'}</td>
                          <td className="py-1 font-medium">{fmt(amt)}</td>
                          <td className="py-1 text-blue-600">{cnt ? fmt(amt / cnt) : '—'}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t"><td className="py-1">إذن الشحن</td><td /><td className="py-1 font-medium">{fmt(panel.side.discharge)}</td><td /></tr>
                    <tr className="border-t bg-gray-50 font-bold"><td className="py-1">إجمالي الإيراد</td><td /><td className="py-1">{fmt(panel.rev)}</td><td /></tr>
                  </tbody>
                </table>

                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs"><tr><th className="text-right py-1">المصروف</th><th className="text-right py-1">المبلغ</th></tr></thead>
                  <tbody>
                    {Object.entries(panel.side.exp).map(([k, v]) => (
                      <tr key={k} className="border-t"><td className="py-1">{EXP_LABEL[k] || k}</td><td className="py-1 text-red-600">{fmt(v)}</td></tr>
                    ))}
                    <tr className="border-t bg-gray-50 font-bold"><td className="py-1">إجمالي المصروفات</td><td className="py-1 text-red-700">{fmt(panel.exp)}</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Statistics */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-700 mb-3">📊 الإحصائيات</h3>
            <div className="inline-block bg-emerald-50 rounded-lg px-4 py-2 mb-3">
              <span className="text-xs text-emerald-700">متوسط ربح الرحلة</span>
              <span className="font-bold text-emerald-800 text-lg mr-2">{fmt(data.net / data.count)}</span>
            </div>
            <table className="w-full text-sm max-w-md">
              <thead className="text-gray-500 text-xs">
                <tr><th className="text-right py-1">متوسط لكل رحلة</th><th className="text-right py-1">صادر</th><th className="text-right py-1">وارد</th></tr>
              </thead>
              <tbody>
                <tr className="border-t"><td className="py-1">شاحنات</td><td className="py-1 font-medium">{fmt(data.E.truckC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.truckC / data.count)}</td></tr>
                <tr className="border-t"><td className="py-1">سيارات</td><td className="py-1 font-medium">{fmt(data.E.vehC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.vehC / data.count)}</td></tr>
                <tr className="border-t"><td className="py-1">ركاب</td><td className="py-1 font-medium">{fmt(data.E.passC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.passC / data.count)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Bunker — inventory (opening + supplies − closing) */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-700 mb-3">⛽ البنكر (مخزون)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">رصيد أول المدة (يدوي)</label>
                <input value={openingBunker} onChange={(e) => setOpeningBunker(e.target.value)} inputMode="decimal" placeholder="0"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">+ تموينات الشهر (من الإكسيل)</p>
                <p className="border rounded-lg px-3 py-2 bg-gray-50 font-medium">{fmt(data.supplies)}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">− مخزون آخر المدة (يدوي)</label>
                <input value={closingBunker} onChange={(e) => setClosingBunker(e.target.value)} inputMode="decimal" placeholder="0"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">= البنكر المستهلك</p>
                <p className="border rounded-lg px-3 py-2 bg-red-50 font-bold text-red-700">{fmt(data.bunkerCost)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              البنكر المستهلك مطروح ضمن الصافي. لو سِبت الخانتين فاضيين (٠)، البنكر = تموينات الشهر فقط.
            </p>
          </div>

          {/* Salaries — manual monthly expense */}
          <div className="bg-white rounded-xl shadow p-4 flex items-end justify-between flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">مرتبات الشهر (يدوي)</label>
              <input value={salaries} onChange={(e) => setSalaries(e.target.value)} inputMode="decimal" placeholder="0"
                className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">المبلغ المطروح من الصافي</p>
              <p className="font-bold text-red-600 text-lg">{fmt(data.salaries)}</p>
            </div>
          </div>

          {/* Liquidity */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-700 mb-3">السيولة عند كل وكيل</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-indigo-50 rounded-lg p-3">
                <p className="text-indigo-600 text-xs">وكيل الاتحاد (P − O)</p>
                <p className="text-lg font-bold text-indigo-800">{fmt(data.liqIttihad)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-purple-600 text-xs">وكيل البسّام (O)</p>
                <p className="text-lg font-bold text-purple-800">{fmt(data.liqBassam)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">إجمالي التحصيل (P)</p>
                <p className="text-lg font-bold text-gray-800">{fmt(data.P)}</p>
              </div>
            </div>
          </div>
          </div>

          {/* ── Professional print-only document ── */}
          <div id="pelagos-doc" dir="rtl" className="hidden print:block">
            <div className="dh">
              <div className="brand">UME <span>Holding</span></div>
              <div className="meta">
                المركب: Pelagos<br />
                الفترة: {monthLabel(month)}<br />
                عدد الرحلات: {sel.length}
              </div>
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
              <thead><tr>
                <th>البند</th><th>صادر — عدد</th><th>صادر — مبلغ</th><th>وارد — عدد</th><th>وارد — مبلغ</th><th>الإجمالي</th>
              </tr></thead>
              <tbody>
                {REV_ROWS.map((r) => {
                  const eC = (data.E as any)[r.cKey], eA = (data.E as any)[r.key], iC = (data.I as any)[r.cKey], iA = (data.I as any)[r.key];
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="n">{eC || '—'}</td><td className="n">{fmt(eA)}</td>
                      <td className="n">{iC || '—'}</td><td className="n">{fmt(iA)}</td>
                      <td className="n">{fmt(eA + iA)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td>إذن الشحن</td><td className="n">—</td><td className="n">{fmt(data.E.discharge)}</td>
                  <td className="n">—</td><td className="n">{fmt(data.I.discharge)}</td><td className="n">{fmt(data.E.discharge + data.I.discharge)}</td>
                </tr>
                <tr className="tot">
                  <td>إجمالي الإيراد</td><td></td><td className="n">{fmt(data.revE)}</td>
                  <td></td><td className="n">{fmt(data.revI)}</td><td className="n">{fmt(data.revenue)}</td>
                </tr>
              </tbody>
            </table>

            <div className="cols">
              <div>
                <h3>مصروفات الصادر (الاتحاد)</h3>
                <table>
                  <thead><tr><th>المصروف</th><th>المبلغ</th></tr></thead>
                  <tbody>
                    {Object.entries(data.E.exp).map(([k, v]) => (<tr key={k}><td>{EXP_LABEL[k] || k}</td><td className="n">{fmt(v)}</td></tr>))}
                    <tr className="tot"><td>إجمالي المصروفات</td><td className="n">{fmt(data.expE)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3>مصروفات الوارد (البسّام)</h3>
                <table>
                  <thead><tr><th>المصروف</th><th>المبلغ</th></tr></thead>
                  <tbody>
                    {Object.entries(data.I.exp).map(([k, v]) => (<tr key={k}><td>{EXP_LABEL[k] || k}</td><td className="n">{fmt(v)}</td></tr>))}
                    <tr className="tot"><td>إجمالي المصروفات</td><td className="n">{fmt(data.expI)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cols">
              <div>
                <h3>البنكر (مخزون)</h3>
                <table>
                  <thead><tr><th>رصيد أول المدة</th><th>+ تموينات الشهر</th><th>− مخزون آخر المدة</th><th>= المستهلك</th></tr></thead>
                  <tbody><tr>
                    <td className="n">{fmt(data.opening)}</td><td className="n">{fmt(data.supplies)}</td><td className="n">{fmt(data.closing)}</td><td className="n">{fmt(data.bunkerCost)}</td>
                  </tr></tbody>
                </table>
                <h3>مصروفات أخرى</h3>
                <table><tbody><tr><td>مرتبات الشهر</td><td className="n">{fmt(data.salaries)}</td></tr></tbody></table>
              </div>
              <div>
                <h3>السيولة عند الوكلاء</h3>
                <table>
                  <thead><tr><th>وكيل الاتحاد (P−O)</th><th>وكيل البسّام (O)</th><th>إجمالي التحصيل (P)</th></tr></thead>
                  <tbody><tr>
                    <td className="n">{fmt(data.liqIttihad)}</td><td className="n">{fmt(data.liqBassam)}</td><td className="n">{fmt(data.P)}</td>
                  </tr></tbody>
                </table>
                <h3>متوسط الأعداد لكل رحلة</h3>
                <table>
                  <thead><tr><th>البند</th><th>صادر</th><th>وارد</th></tr></thead>
                  <tbody>
                    <tr><td>شاحنات</td><td className="n">{fmt(data.E.truckC / data.count)}</td><td className="n">{fmt(data.I.truckC / data.count)}</td></tr>
                    <tr><td>سيارات</td><td className="n">{fmt(data.E.vehC / data.count)}</td><td className="n">{fmt(data.I.vehC / data.count)}</td></tr>
                    <tr><td>ركاب</td><td className="n">{fmt(data.E.passC / data.count)}</td><td className="n">{fmt(data.I.passC / data.count)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="foot">UME Holding — نظام PMS · تقرير Pelagos · {monthLabel(month)}</div>
          </div>
        </>
      )}
    </div>
  );
}
