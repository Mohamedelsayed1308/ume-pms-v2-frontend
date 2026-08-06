'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import VesselProfitReport, { PELAGOS, ALCUDIA } from './VesselProfitReport';
import GubalProfitReport from './GubalProfitReport';
import ExchangeRatesCard from './ExchangeRatesCard';
import FleetDashboard from './FleetDashboard';

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };

type ReportType = 'fleet-dashboard' | 'supplier-statement' | 'unpaid-supplier' | 'unpaid-vessel' | 'vessel-suppliers' | 'due-alerts' | 'user-activity' | 'dept-delays' | 'vessel-profit' | 'alcudia-profit' | 'gubal-profit' | 'exchange-rates';

interface UserReport {
  user_id: string;
  user_name: string;
  total: number;
  by_vessel: { vessel: string; count: number }[];
}

interface StatementSec { supplierId: string; supplierName: string; transactions: any[]; summary: { total_debit: number; total_credit: number; balance: number }; }
interface UnpaidSec { supplierId: string; supplierName: string; invoices: any[]; }

function exportToExcel(rows: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// كل مورد في شيت منفصل داخل نفس الملف
function exportMultiToExcel(sheets: { name: string; rows: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  const used: Record<string, number> = {};
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    let safe = (s.name || 'مورد').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'مورد';
    if (used[safe] != null) { used[safe]++; safe = `${safe} ${used[safe]}`; } else { used[safe] = 0; }
    XLSX.utils.book_append_sheet(wb, ws, safe);
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

const num = (n: any) => Number(n || 0).toLocaleString();

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('fleet-dashboard');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedVessel, setSelectedVessel] = useState('');
  const [daysAhead, setDaysAhead] = useState('30');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, any[]>>({});

  useEffect(() => {
    Promise.all([api.get('/api/suppliers'), api.get('/api/vessels')]).then(([s, v]) => {
      setSuppliers(s.data);
      setVessels(v.data);
    });
  }, []);

  async function loadAttachments(invoices: any[]) {
    const map: Record<string, any[]> = {};
    await Promise.all(invoices.map(async (inv: any) => {
      try {
        const res = await api.get(`/api/attachments/invoice/${inv.id}`);
        map[inv.id] = res.data || [];
      } catch { map[inv.id] = []; }
    }));
    setAttachments(map);
  }

  const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name || '—';

  async function runReport() {
    setLoading(true);
    setData(null);
    setAttachments({});
    try {
      // ── تقارير متعددة الموردين ──
      if (reportType === 'supplier-statement' || reportType === 'unpaid-supplier') {
        if (selectedSuppliers.length === 0) { alert('اختر موردًا واحدًا على الأقل'); return; }

        if (reportType === 'supplier-statement') {
          const results = await Promise.all(selectedSuppliers.map((id) =>
            api.get(`/api/invoices/statement/supplier/${id}`).then((r) => ({ id, d: r.data }))));
          const sections: StatementSec[] = results.map(({ id, d }) => ({
            supplierId: id,
            supplierName: d?.supplier?.name || nameOf(id),
            transactions: d?.transactions || [],
            summary: d?.summary || { total_debit: 0, total_credit: 0, balance: 0 },
          }));
          setData({ multi: 'statement', sections });
        } else {
          const results = await Promise.all(selectedSuppliers.map((id) =>
            api.get(`/api/invoices/unpaid/by-supplier/${id}`).then((r) => ({ id, d: r.data }))));
          const sections: UnpaidSec[] = results.map(({ id, d }) => ({
            supplierId: id,
            supplierName: nameOf(id),
            invoices: Array.isArray(d) ? d : [],
          }));
          setData({ multi: 'unpaid', sections });
          loadAttachments(sections.flatMap((s) => s.invoices));
        }
        return;
      }

      // ── باقي التقارير (كما هي) ──
      let res;
      if (reportType === 'unpaid-vessel' && selectedVessel) {
        res = await api.get(`/api/invoices/unpaid/by-vessel/${selectedVessel}`);
      } else if (reportType === 'vessel-suppliers' && selectedVessel) {
        res = await api.get(`/api/vessels/${selectedVessel}/suppliers`);
      } else if (reportType === 'due-alerts') {
        res = await api.get(`/api/invoices/alerts/due?days=${daysAhead}`);
      } else if (reportType === 'user-activity') {
        res = await api.get('/api/invoices/report/by-user');
      } else if (reportType === 'dept-delays') {
        res = await api.get('/api/invoices/report/department-delays');
      }
      if (res) {
        setData(res.data);
        if (['unpaid-vessel', 'due-alerts', 'dept-delays'].includes(reportType) && Array.isArray(res.data)) {
          loadAttachments(res.data);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const reportGroups = [
    {
      title: 'لوحة الأسطول', dot: 'bg-indigo-500',
      sel: 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200', idle: 'border-gray-200 bg-white hover:border-indigo-300',
      items: [
        { id: 'fleet-dashboard', label: '🚢 لوحة الأسطول التنفيذية', desc: 'مؤشرات ومقارنات وأعداد المنقولات لكل الأسطول + مساعد ذكي' },
      ],
    },
    {
      title: 'المستحقات والتنبيهات', dot: 'bg-red-500',
      sel: 'border-red-500 bg-red-50 ring-1 ring-red-200', idle: 'border-gray-200 bg-white hover:border-red-300',
      items: [
        { id: 'due-alerts', label: '⚠️ تنبيهات الاستحقاق', desc: 'فواتير مستحقة خلال فترة محددة' },
        { id: 'unpaid-supplier', label: '🔴 مستحقات مورد', desc: 'الفواتير غير المدفوعة أو الجزئية لمورد' },
        { id: 'unpaid-vessel', label: '🚢 مستحقات مركب', desc: 'الفواتير غير المدفوعة على مركب معين' },
        { id: 'dept-delays', label: '🔔 تأخرات الأقسام', desc: 'فواتير تجاوزت 3 أيام بدون إجراء' },
      ],
    },
    {
      title: 'كشوف الحسابات', dot: 'bg-blue-500',
      sel: 'border-blue-500 bg-blue-50 ring-1 ring-blue-200', idle: 'border-gray-200 bg-white hover:border-blue-300',
      items: [
        { id: 'supplier-statement', label: '📒 كشف حساب مورد', desc: 'مدين / دائن / رصيد متراكم' },
        { id: 'vessel-suppliers', label: '📊 موردو المركب', desc: 'حجم تعامل كل مورد على المركب' },
        { id: 'user-activity', label: '👤 نشاط المستخدمين', desc: 'عدد الفواتير لكل مستخدم حسب السفينة' },
      ],
    },
    {
      title: 'أرباح المراكب', dot: 'bg-emerald-500',
      sel: 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200', idle: 'border-gray-200 bg-white hover:border-emerald-300',
      items: [
        { id: 'vessel-profit', label: '🚢💰 ربح Pelagos', desc: 'إيرادات ومصروفات وسيولة بيلاجوس شهرياً' },
        { id: 'alcudia-profit', label: '🚢💰 ربح Alcudia', desc: 'إيرادات ومصروفات ومشتريات الكوديا شهرياً' },
      { id: 'gubal-profit', label: '🚢💰 ربح Gubal', desc: 'قائمة دخل شهرية / من فترة لفترة لمركب جوبال' },
      ],
    },
    {
      title: 'أدوات وإعدادات', dot: 'bg-purple-500',
      sel: 'border-purple-500 bg-purple-50 ring-1 ring-purple-200', idle: 'border-gray-200 bg-white hover:border-purple-300',
      items: [
        { id: 'exchange-rates', label: '💱 أسعار الصرف', desc: 'أسعار العملات مقابل الدولار لكل شهر' },
      ],
    },
  ];

  const needsSupplier = ['supplier-statement', 'unpaid-supplier'].includes(reportType);
  const needsVessel = ['unpaid-vessel', 'vessel-suppliers'].includes(reportType);
  const needsDays = reportType === 'due-alerts';
  const noFilter = reportType === 'user-activity' || reportType === 'dept-delays';

  const filteredSuppliers = suppliers.filter((s) =>
    (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()));
  const toggleSupplier = (id: string) =>
    setSelectedSuppliers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  function AttachmentCell({ invoiceId }: { invoiceId: string }) {
    const files = attachments[invoiceId];
    if (!files) return <span className="text-gray-300 text-xs">...</span>;
    if (files.length === 0) return <span className="text-gray-300 text-xs">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {files.map((f: any) => (
          <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
            className="text-blue-600 hover:underline text-xs flex items-center gap-1 truncate max-w-[140px]" title={f.file_name}>
            📎 {f.file_name}
          </a>
        ))}
      </div>
    );
  }

  // ── صفوف Excel ──
  const statementRows = (transactions: any[]) => transactions.map((t: any) => ({
    'التاريخ': t.date?.slice(0, 10),
    'البيان': t.description,
    'السفينة': t.vessel || '—',
    'مدين': t.debit || 0,
    'دائن': t.credit || 0,
    'الرصيد': t.running_balance,
  }));
  const unpaidRows = (invoices: any[], supplierName: string) => invoices.map((inv: any) => ({
    'المورد': supplierName,
    'رقم الفاتورة': inv.invoice_number,
    'السفينة': inv.vessel?.name || '—',
    'المبلغ': inv.total_amount,
    'العملة': inv.currency,
    'المدفوع': inv.paid_amount,
    'المتبقي': +inv.total_amount - +inv.paid_amount,
    'الاستحقاق': inv.due_date?.slice(0, 10) || '—',
    'الحالة': statusLabel[inv.status],
    'المرفقات': (attachments[inv.id] || []).map((f: any) => f.file_url).join(' | '),
  }));

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">التقارير</h2>

      <div className="space-y-5 mb-6">
        {reportGroups.map((g) => (
          <div key={g.title}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
              <span className="text-sm font-medium text-gray-500">{g.title}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {g.items.map((r) => (
                <button key={r.id} onClick={() => { setReportType(r.id as ReportType); setData(null); }}
                  className={`p-3 rounded-xl border text-right transition-all ${reportType === r.id ? g.sel : g.idle}`}>
                  <div className="font-medium text-sm">{r.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Vessel profit — self-contained reports */}
      {reportType === 'fleet-dashboard' && <FleetDashboard />}
      {reportType === 'vessel-profit' && <VesselProfitReport config={PELAGOS} />}
      {reportType === 'alcudia-profit' && <VesselProfitReport config={ALCUDIA} />}
      {reportType === 'gubal-profit' && <GubalProfitReport />}
      {reportType === 'exchange-rates' && <ExchangeRatesCard />}

      {/* Filters */}
      {reportType !== 'fleet-dashboard' && reportType !== 'vessel-profit' && reportType !== 'alcudia-profit' && reportType !== 'gubal-profit' && reportType !== 'exchange-rates' && (
      <div className="bg-white rounded-xl shadow p-4 mb-6 flex items-end gap-4 flex-wrap">
        {needsSupplier && (
          <div className="flex-1 min-w-[280px]">
            <label className="block text-sm text-gray-600 mb-1">
              الموردون (اختيار متعدد) — <span className="text-blue-600 font-medium">{selectedSuppliers.length}</span> مختار
            </label>
            <input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="بحث عن مورد..."
              className="w-full border rounded-lg px-3 py-1.5 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="border rounded-lg max-h-44 overflow-y-auto p-2">
              <div className="flex gap-3 mb-1 pb-1 border-b text-xs">
                <button type="button" onClick={() => setSelectedSuppliers(filteredSuppliers.map((s) => s.id))}
                  className="text-blue-600 hover:underline">تحديد الكل</button>
                <button type="button" onClick={() => setSelectedSuppliers([])}
                  className="text-gray-500 hover:underline">إلغاء الكل</button>
              </div>
              {filteredSuppliers.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-1 px-1 hover:bg-gray-50 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedSuppliers.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                  <span>{s.name}</span>
                </label>
              ))}
              {filteredSuppliers.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">لا يوجد مورد بهذا الاسم</p>}
            </div>
          </div>
        )}
        {needsVessel && (
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">المركب</label>
            <select value={selectedVessel} onChange={(e) => setSelectedVessel(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— اختر المركب —</option>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        {needsDays && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">خلال (يوم)</label>
            <select value={daysAhead} onChange={(e) => setDaysAhead(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="7">7 أيام</option>
              <option value="15">15 يوم</option>
              <option value="30">30 يوم</option>
              <option value="60">60 يوم</option>
              <option value="90">90 يوم</option>
              <option value="0">متأخرة فقط</option>
            </select>
          </div>
        )}
        {noFilter && <p className="text-sm text-gray-400 flex-1">لا يحتاج فلتر — اضغط عرض التقرير</p>}
        <button onClick={runReport} disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'جاري...' : 'عرض التقرير'}
        </button>
      </div>
      )}

      {/* ══ نتائج متعددة الموردين — كشف حساب ══ */}
      {data?.multi === 'statement' && (
        <div className="space-y-5">
          {(() => {
            const secs = data.sections as StatementSec[];
            const gD = secs.reduce((s, x) => s + Number(x.summary.total_debit), 0);
            const gC = secs.reduce((s, x) => s + Number(x.summary.total_credit), 0);
            return (
              <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-bold text-gray-700">📒 كشف حساب — {secs.length} مورد</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex gap-5 text-sm">
                    <span className="text-red-600">إجمالي مدين: <strong>{num(gD)}</strong></span>
                    <span className="text-green-600">إجمالي دائن: <strong>{num(gC)}</strong></span>
                    <span className={gD - gC > 0 ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>الرصيد الكلي: {num(gD - gC)}</span>
                  </div>
                  <button onClick={() => exportMultiToExcel(secs.map((sec) => ({ name: sec.supplierName, rows: statementRows(sec.transactions) })), 'كشف-حساب-موردين')}
                    className="bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-800 flex items-center gap-2">📥 تصدير الكل</button>
                </div>
              </div>
            );
          })()}

          {(data.sections as StatementSec[]).map((sec) => (
            <div key={sec.supplierId} className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <h4 className="font-bold text-gray-800">📒 {sec.supplierName}</h4>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex gap-5 text-sm">
                    <span className="text-red-600">مدين: <strong>{num(sec.summary.total_debit)}</strong></span>
                    <span className="text-green-600">دائن: <strong>{num(sec.summary.total_credit)}</strong></span>
                    <span className={sec.summary.balance > 0 ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>الرصيد: {num(sec.summary.balance)}</span>
                  </div>
                  <button onClick={() => exportToExcel(statementRows(sec.transactions), `كشف-حساب-${sec.supplierName}`)}
                    className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700">📥 Excel</button>
                </div>
              </div>
              {sec.transactions.length === 0 ? (
                <p className="text-center py-4 text-gray-400 text-sm">لا توجد حركات لهذا المورد</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th className="px-4 py-2">التاريخ</th>
                      <th className="px-4 py-2">البيان</th>
                      <th className="px-4 py-2">السفينة</th>
                      <th className="px-4 py-2">مدين</th>
                      <th className="px-4 py-2">دائن</th>
                      <th className="px-4 py-2">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.transactions.map((t: any, i: number) => (
                      <tr key={i} className={`border-t ${t.type === 'debit' ? 'bg-red-50/30' : 'bg-green-50/30'}`}>
                        <td className="px-4 py-2 text-gray-500">{t.date?.slice(0, 10)}</td>
                        <td className="px-4 py-2">{t.description}</td>
                        <td className="px-4 py-2 text-gray-500">{t.vessel || '—'}</td>
                        <td className="px-4 py-2 text-red-600 font-medium">{t.debit > 0 ? num(t.debit) : '—'}</td>
                        <td className="px-4 py-2 text-green-600 font-medium">{t.credit > 0 ? num(t.credit) : '—'}</td>
                        <td className={`px-4 py-2 font-bold ${t.running_balance > 0 ? 'text-red-700' : 'text-green-700'}`}>{num(t.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ نتائج متعددة الموردين — مستحقات ══ */}
      {data?.multi === 'unpaid' && (
        <div className="space-y-5">
          {(() => {
            const secs = data.sections as UnpaidSec[];
            const all = secs.flatMap((s) => s.invoices);
            const total = all.reduce((s, i: any) => s + +i.total_amount, 0);
            const remaining = all.reduce((s, i: any) => s + (+i.total_amount - +i.paid_amount), 0);
            return (
              <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-gray-700">🔴 مستحقات — {secs.length} مورد · {all.length} فاتورة</h3>
                  <div className="flex gap-6 text-sm mt-1">
                    <span className="text-gray-600">إجمالي: <strong>{num(total)}</strong></span>
                    <span className="text-red-600">المتبقي: <strong>{num(remaining)}</strong></span>
                  </div>
                </div>
                <button onClick={() => exportMultiToExcel(secs.map((sec) => ({ name: sec.supplierName, rows: unpaidRows(sec.invoices, sec.supplierName) })), 'مستحقات-موردين')}
                  className="bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-800 flex items-center gap-2">📥 تصدير الكل</button>
              </div>
            );
          })()}

          {(data.sections as UnpaidSec[]).map((sec) => {
            const total = sec.invoices.reduce((s, i: any) => s + +i.total_amount, 0);
            const remaining = sec.invoices.reduce((s, i: any) => s + (+i.total_amount - +i.paid_amount), 0);
            return (
              <div key={sec.supplierId} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-gray-800">🔴 {sec.supplierName} — {sec.invoices.length} فاتورة</h4>
                    <div className="flex gap-6 text-sm mt-1">
                      <span className="text-gray-600">إجمالي: <strong>{num(total)}</strong></span>
                      <span className="text-red-600">المتبقي: <strong>{num(remaining)}</strong></span>
                    </div>
                  </div>
                  <button onClick={() => exportToExcel(unpaidRows(sec.invoices, sec.supplierName), `مستحقات-${sec.supplierName}`)}
                    className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700">📥 Excel</button>
                </div>
                {sec.invoices.length === 0 ? (
                  <p className="text-center py-4 text-gray-400 text-sm">لا توجد فواتير مستحقة لهذا المورد</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-right">
                      <tr>
                        <th className="px-4 py-2">رقم الفاتورة</th>
                        <th className="px-4 py-2">السفينة</th>
                        <th className="px-4 py-2">المبلغ</th>
                        <th className="px-4 py-2">المدفوع</th>
                        <th className="px-4 py-2">المتبقي</th>
                        <th className="px-4 py-2">الاستحقاق</th>
                        <th className="px-4 py-2">الحالة</th>
                        <th className="px-4 py-2">المرفقات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.invoices.map((inv: any) => (
                        <tr key={inv.id} className="border-t">
                          <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                          <td className="px-4 py-2">{inv.vessel?.name || '—'}</td>
                          <td className="px-4 py-2">{num(inv.total_amount)} {inv.currency}</td>
                          <td className="px-4 py-2 text-green-600">{num(inv.paid_amount)}</td>
                          <td className="px-4 py-2 text-red-600 font-bold">{num(+inv.total_amount - +inv.paid_amount)}</td>
                          <td className="px-4 py-2 text-gray-500">{inv.due_date?.slice(0, 10) || '—'}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-1 rounded-full text-xs ${statusColor[inv.status]}`}>{statusLabel[inv.status]}</span></td>
                          <td className="px-4 py-2"><AttachmentCell invoiceId={inv.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ باقي التقارير (مورد/مركب واحد) ══ */}
      {data && !data.multi && (
        <div className="bg-white rounded-xl shadow p-4">

          {/* Due Alerts */}
          {reportType === 'due-alerts' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-700">⚠️ فواتير مستحقة — {data.length} فاتورة</h3>
                <button onClick={() => exportToExcel(data.map((inv: any) => ({
                  'رقم الفاتورة': inv.invoice_number,
                  'المورد': inv.supplier?.name,
                  'السفينة': inv.vessel?.name || '—',
                  'المبلغ': inv.total_amount,
                  'العملة': inv.currency,
                  'المتبقي': +inv.total_amount - +inv.paid_amount,
                  'تاريخ الاستحقاق': inv.due_date?.slice(0, 10),
                  'الحالة': inv.is_overdue ? `متأخرة ${Math.abs(inv.days_until_due)} يوم` : `${inv.days_until_due} يوم`,
                })), 'تنبيهات-الاستحقاق')}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                  📥 Excel
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">رقم الفاتورة</th>
                    <th className="px-4 py-2">المورد</th>
                    <th className="px-4 py-2">السفينة</th>
                    <th className="px-4 py-2">المبلغ</th>
                    <th className="px-4 py-2">المتبقي</th>
                    <th className="px-4 py-2">تاريخ الاستحقاق</th>
                    <th className="px-4 py-2">الحالة</th>
                    <th className="px-4 py-2">المرفقات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv: any) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                      <td className="px-4 py-2">{inv.supplier?.name}</td>
                      <td className="px-4 py-2">{inv.vessel?.name || '—'}</td>
                      <td className="px-4 py-2">{num(inv.total_amount)} {inv.currency}</td>
                      <td className="px-4 py-2 text-red-600 font-medium">{num(+inv.total_amount - +inv.paid_amount)}</td>
                      <td className="px-4 py-2">{inv.due_date?.slice(0, 10)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${inv.is_overdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {inv.is_overdue ? `متأخرة ${Math.abs(inv.days_until_due)} يوم` : `${inv.days_until_due} يوم`}
                        </span>
                      </td>
                      <td className="px-4 py-2"><AttachmentCell invoiceId={inv.id} /></td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-gray-400">لا توجد فواتير مستحقة</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Unpaid by Vessel */}
          {reportType === 'unpaid-vessel' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-700 mb-1">🔴 الفواتير غير المسددة — {data.length} فاتورة</h3>
                  <div className="flex gap-6 text-sm">
                    <span className="text-gray-600">إجمالي: <strong>{num(data.reduce((s: number, i: any) => s + +i.total_amount, 0))}</strong></span>
                    <span className="text-red-600">المتبقي: <strong>{num(data.reduce((s: number, i: any) => s + (+i.total_amount - +i.paid_amount), 0))}</strong></span>
                  </div>
                </div>
                <button onClick={() => exportToExcel(data.map((inv: any) => ({
                  'رقم الفاتورة': inv.invoice_number,
                  'المورد': inv.supplier?.name || '—',
                  'السفينة': inv.vessel?.name || '—',
                  'المبلغ': inv.total_amount,
                  'العملة': inv.currency,
                  'المدفوع': inv.paid_amount,
                  'المتبقي': +inv.total_amount - +inv.paid_amount,
                  'الاستحقاق': inv.due_date?.slice(0, 10) || '—',
                  'الحالة': statusLabel[inv.status],
                  'المرفقات': (attachments[inv.id] || []).map((f: any) => f.file_url).join(' | '),
                })), 'مستحقات-مركب')}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                  📥 Excel
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">رقم الفاتورة</th>
                    <th className="px-4 py-2">المورد</th>
                    <th className="px-4 py-2">المبلغ</th>
                    <th className="px-4 py-2">المدفوع</th>
                    <th className="px-4 py-2">المتبقي</th>
                    <th className="px-4 py-2">الاستحقاق</th>
                    <th className="px-4 py-2">الحالة</th>
                    <th className="px-4 py-2">المرفقات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv: any) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                      <td className="px-4 py-2">{inv.supplier?.name}</td>
                      <td className="px-4 py-2">{num(inv.total_amount)} {inv.currency}</td>
                      <td className="px-4 py-2 text-green-600">{num(inv.paid_amount)}</td>
                      <td className="px-4 py-2 text-red-600 font-bold">{num(+inv.total_amount - +inv.paid_amount)}</td>
                      <td className="px-4 py-2 text-gray-500">{inv.due_date?.slice(0, 10) || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${statusColor[inv.status]}`}>{statusLabel[inv.status]}</span>
                      </td>
                      <td className="px-4 py-2"><AttachmentCell invoiceId={inv.id} /></td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-gray-400">لا توجد فواتير مستحقة</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Vessel Suppliers */}
          {reportType === 'vessel-suppliers' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-700">📊 موردو المركب — {data.length} مورد</h3>
                <button onClick={() => exportToExcel(data.map((row: any) => ({
                  'المورد': row.supplier_name,
                  'عدد الفواتير': row.total_invoices,
                  'إجمالي الفواتير': row.total_amount,
                  'المدفوع': row.paid_amount,
                  'المتبقي': +row.total_amount - +row.paid_amount,
                })), 'موردو-المركب')}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                  📥 Excel
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">المورد</th>
                    <th className="px-4 py-2">عدد الفواتير</th>
                    <th className="px-4 py-2">إجمالي الفواتير</th>
                    <th className="px-4 py-2">المدفوع</th>
                    <th className="px-4 py-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 font-medium">{row.supplier_name}</td>
                      <td className="px-4 py-2 text-center">{row.total_invoices}</td>
                      <td className="px-4 py-2">{num(row.total_amount)}</td>
                      <td className="px-4 py-2 text-green-600">{num(row.paid_amount)}</td>
                      <td className="px-4 py-2 text-red-600 font-bold">{num(+row.total_amount - +row.paid_amount)}</td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Department Delays */}
          {reportType === 'dept-delays' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-700">🔔 تأخرات الأقسام — {data.length} فاتورة متأخرة</h3>
                  <p className="text-xs text-gray-400 mt-1">الفواتير التي تجاوزت 3 أيام في نفس الحالة</p>
                </div>
                {data.length > 0 && (
                  <button onClick={() => exportToExcel(data.map((inv: any) => ({
                    'رقم الفاتورة': inv.invoice_number,
                    'المورد': inv.supplier || '—',
                    'السفينة': inv.vessel || '—',
                    'المبلغ': inv.total_amount,
                    'العملة': inv.currency,
                    'الحالة': inv.approval_status,
                    'تاريخ الحالة': inv.approval_status_date?.slice(0, 10),
                    'أيام التأخر': inv.days_delayed,
                    'القسم المسؤول': inv.department,
                    'المرفقات': (attachments[inv.id] || []).map((f: any) => f.file_url).join(' | '),
                  })), 'تأخرات-الأقسام')}
                    className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                    📥 Excel
                  </button>
                )}
              </div>
              {data.length === 0 ? (
                <p className="text-center py-10 text-green-600 font-medium">✅ لا توجد تأخرات — كل الأقسام تعمل في الوقت المحدد</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th className="px-4 py-2">رقم الفاتورة</th>
                      <th className="px-4 py-2">المورد</th>
                      <th className="px-4 py-2">السفينة</th>
                      <th className="px-4 py-2">المبلغ</th>
                      <th className="px-4 py-2">الحالة</th>
                      <th className="px-4 py-2">تاريخ الحالة</th>
                      <th className="px-4 py-2 text-center">أيام التأخر</th>
                      <th className="px-4 py-2">القسم المسؤول</th>
                      <th className="px-4 py-2">المرفقات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((inv: any) => (
                      <tr key={inv.id} className="border-t hover:bg-red-50/30">
                        <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                        <td className="px-4 py-2">{inv.supplier || '—'}</td>
                        <td className="px-4 py-2">{inv.vessel || '—'}</td>
                        <td className="px-4 py-2">{num(inv.total_amount)} {inv.currency}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            inv.approval_status === 'waiting_po' ? 'bg-orange-100 text-orange-700' :
                            inv.approval_status === 'delivery_missing' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {inv.approval_status === 'waiting_po' ? 'Waiting PO' :
                             inv.approval_status === 'delivery_missing' ? 'Delivery Missing' : 'Send to Pay'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{inv.approval_status_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            inv.days_delayed > 7 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {inv.days_delayed} يوم
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium text-gray-700">{inv.department}</span>
                        </td>
                        <td className="px-4 py-2"><AttachmentCell invoiceId={inv.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* User Activity */}
          {reportType === 'user-activity' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-700">👤 نشاط المستخدمين — {data.length} مستخدم</h3>
                <button onClick={() => {
                  const rows: any[] = [];
                  (data as UserReport[]).forEach(u => {
                    u.by_vessel.forEach(v => rows.push({ 'المستخدم': u.user_name, 'المركب': v.vessel, 'عدد الفواتير': v.count }));
                  });
                  exportToExcel(rows, 'نشاط-المستخدمين');
                }}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                  📥 Excel
                </button>
              </div>
              {(() => {
                const users = data as UserReport[];
                const total = users.reduce((s, u) => s + u.total, 0);
                return (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-right">
                      <tr>
                        <th className="px-4 py-2">المستخدم</th>
                        <th className="px-4 py-2 text-center">عدد الفواتير</th>
                        <th className="px-4 py-2">نسبة المشاركة</th>
                        <th className="px-4 py-2">السفن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.sort((a, b) => b.total - a.total).map((u) => (
                        <>
                          <tr key={u.user_id} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                                  {u.user_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{u.user_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center font-bold text-lg">{u.total}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${total ? (u.total / total) * 100 : 0}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 w-8">{total ? Math.round((u.total / total) * 100) : 0}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <button onClick={() => setExpanded(expanded === u.user_id ? null : u.user_id)}
                                className="text-blue-600 text-xs hover:underline">
                                {expanded === u.user_id ? '▲ إخفاء' : '▼ عرض السفن'}
                              </button>
                            </td>
                          </tr>
                          {expanded === u.user_id && (
                            <tr key={`${u.user_id}-d`} className="bg-blue-50 border-t">
                              <td colSpan={4} className="px-6 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {u.by_vessel.sort((a, b) => b.count - a.count).map((v) => (
                                    <div key={v.vessel} className="bg-white border border-blue-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                      <span className="text-blue-500 text-sm">⚓</span>
                                      <span className="text-sm text-gray-700">{v.vessel}</span>
                                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{v.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد بيانات بعد</td></tr>
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
