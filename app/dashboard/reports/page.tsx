'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import VesselProfitReport, { PELAGOS, ALCUDIA, POSEIDON } from './VesselProfitReport';
import LineProfitReport, { DALEELA_JS } from './LineProfitReport';
import GubalProfitReport from './GubalProfitReport';
import ExchangeRatesCard from './ExchangeRatesCard';
import FleetDashboard from './FleetDashboard';
import ReportsCatalog from './ReportsCatalog';
import ReportShell from './ReportShell';
import SupplierStatementReport from './SupplierStatementReport';
import { REPORT_REQUIRES, isReportId, type CatKey, type ReportId } from './catalog';
import { useI18n } from '@/lib/i18n';
import { fmtCcyMap, sumByCurrency } from '@/lib/format';
import { getUser } from '@/lib/auth';
import { canHref } from '@/lib/profile';
import { prefKey, readIds, writeIds, pushRecent } from '@/lib/reports/prefs';
import { parseLink, type Applied } from '@/lib/reports/statement';

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };

type ReportType = ReportId;

interface UserReport {
  user_id: string;
  user_name: string;
  total: number;
  by_vessel: { vessel: string; count: number }[];
}

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
  const { locale } = useI18n();
  const [user, setUser] = useState<any>(null);
  useEffect(() => { setUser(getUser()); }, []);
  const canReport = (id: string) => isReportId(id) && canHref(user, REPORT_REQUIRES[id] || '/dashboard/reports');
  const userId: string | null = user?.id ? String(user.id) : null;

  const [selected, setSelected] = useState<ReportType | ''>('');
  // حالة الدليل يملكها الأب — فتبقى عند الرجوع من تقرير (§3)
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<CatKey | 'all'>('all');
  const [favs, setFavs] = useState<ReportId[]>([]);
  const [recents, setRecents] = useState<ReportId[]>([]);
  const catScroll = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [linkInit, setLinkInit] = useState<{ sups: string[]; ccy: string } | null>(null);

  // المثبّتة والحديثة لكلّ مستخدمٍ حقيقيّ
  useEffect(() => {
    if (!user) return;
    // مزامنةٌ مع تخزين المتصفّح بعد معرفة المستخدم — لا يُعرف مفتاحه قبل ذلك
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavs(readIds(prefKey('favs', userId), isReportId) as ReportId[]);
    setRecents(readIds(prefKey('recents', userId), isReportId) as ReportId[]);
  }, [user, userId]);

  // رابطٌ مباشر: ?report=…&suppliers=…&ccy=… — يُعاد التحقّق منه قبل أيّ استعمال
  const linkRead = useRef(false);
  useEffect(() => {
    if (!user || linkRead.current) return;
    linkRead.current = true;
    const l = parseLink(window.location.search);
    if (!l.report || !isReportId(l.report)) return;
    // مزامنةٌ مع شريط العنوان مرّةً واحدة بعد معرفة المستخدم وصلاحيّاته
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(l.report);
    if (l.report === 'supplier-statement' && l.sups.length) setLinkInit({ sups: l.sups, ccy: l.ccy });
  }, [user]);

  const scroller = () => (rootRef.current?.closest('main') as HTMLElement | null) ?? null;
  const writeUrl = (qs: string) => { try { window.history.replaceState(null, '', `/dashboard/reports${qs ? `?${qs}` : ''}`); } catch { /* noop */ } };

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

  const reportType = selected; // توافق مع بقية المنطق

  /*
   * قوائم الاختيار لها حالتها الخاصّة.
   *
   * كان `Promise.all` بلا مُلتقِط: يُخفق النداء فتبقى القائمتان فارغتين بصمت،
   * فتُعرض «لا يوجد مورد بهذا الاسم» — وهي رسالة بحثٍ لم يُطابِق، لا رسالة
   * قائمةٍ لم تصل. فيبحث المستخدم عن مورد يعرف أنه موجود ويُقال له إنه ليس
   * كذلك.
   */
  const [pickersLoading, setPickersLoading] = useState(true);
  const [pickersError, setPickersError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/api/suppliers'), api.get('/api/vessels')])
      .then(([s, v]) => {
        setSuppliers(Array.isArray(s.data) ? s.data : []);
        setVessels(Array.isArray(v.data) ? v.data : []);
        setPickersError('');
      })
      .catch(() => setPickersError('تعذّر تحميل قوائم الموردين والسفن — حدّث الصفحة أو أعد المحاولة.'))
      .finally(() => setPickersLoading(false));
  }, []);

  function openReport(id: ReportType) {
    if (!canReport(id)) return;
    catScroll.current = scroller()?.scrollTop ?? 0;
    setSelected(id);
    setData(null);
    setAttachments({});
    setLinkInit(null);
    const next = pushRecent(recents, id) as ReportId[];
    setRecents(next); writeIds(prefKey('recents', userId), next);
    writeUrl(`report=${id}`);
    setTimeout(() => { const m = scroller(); if (m) m.scrollTop = 0; }, 0);
  }
  function backToHome() {
    setSelected('');
    setData(null);
    setLinkInit(null);
    writeUrl('');
    // الرجوع يُعيد البحث والفئة وموضع التمرير
    setTimeout(() => { const m = scroller(); if (m) m.scrollTop = catScroll.current; }, 0);
  }
  function togglePin(id: ReportId) {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      writeIds(prefKey('favs', userId), next);
      return next;
    });
  }
  function onStatementApplied(ap: Applied | null) {
    if (!ap) return;
    const parts = ['report=supplier-statement'];
    if (ap.sups.length) parts.push('suppliers=' + ap.sups.map(encodeURIComponent).join(','));
    if (ap.ccy !== 'all') parts.push('ccy=' + encodeURIComponent(ap.ccy));
    writeUrl(parts.join('&'));
  }

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
      // كشف حساب المورّد صار مكوّناً مستقلّاً (SupplierStatementReport) — يبقى هنا المستحقات
      if (reportType === 'unpaid-supplier') {
        if (selectedSuppliers.length === 0) { alert('اختر موردًا واحدًا على الأقل'); return; }
        const results = await Promise.all(selectedSuppliers.map((id) =>
          api.get(`/api/invoices/unpaid/by-supplier/${id}`).then((r) => ({ id, d: r.data }))));
        const sections: UnpaidSec[] = results.map(({ id, d }) => ({
          supplierId: id,
          supplierName: nameOf(id),
          invoices: Array.isArray(d) ? d : [],
        }));
        setData({ multi: 'unpaid', sections });
        loadAttachments(sections.flatMap((s) => s.invoices));
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

  const needsSupplier = reportType === 'unpaid-supplier';
  const needsVessel = ['unpaid-vessel', 'vessel-suppliers'].includes(reportType);
  const needsDays = reportType === 'due-alerts';
  const noFilter = reportType === 'user-activity' || reportType === 'dept-delays';
  const selfContained = ['fleet-dashboard', 'vessel-profit', 'alcudia-profit', 'poseidon-profit', 'daleela-line', 'gubal-profit', 'exchange-rates', 'supplier-statement'].includes(reportType);

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

  // المستخدم يُقرأ بعد التركيب — وقبله لا يُعرف ما يُسمح له، فلا يُعرض «لا تقارير لصلاحياتك» خطأً
  if (!user) {
    return (
      <div ref={rootRef} aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-[14px] border border-[#e4e7ec] bg-white animate-pulse" />)}
      </div>
    );
  }

  // ══════════════════════════ مركز التحليلات (الصفحة الرئيسية) ══════════════════════════
  if (!selected) {
    return (
      <div ref={rootRef}>
        <ReportsCatalog
          locale={locale === 'en' ? 'en' : 'ar'} can={canReport}
          q={search} onQ={setSearch} cat={cat} onCat={setCat}
          favs={favs} recents={recents} onOpen={openReport} onTogglePin={togglePin}
        />
      </div>
    );
  }

  // ══════════════════════════ عرض تقرير مفرد ══════════════════════════
  return (
    <div ref={rootRef}>
    <ReportShell id={selected} locale={locale === 'en' ? 'en' : 'ar'} allowed={canReport(selected)}
      pinned={favs.includes(selected)} onBack={backToHome} onTogglePin={() => togglePin(selected)}>
    <div>
      {reportType === 'supplier-statement' && (
        <SupplierStatementReport
          locale={locale === 'en' ? 'en' : 'ar'} userId={userId}
          allowed={canReport('supplier-statement')}
          suppliers={suppliers.map((s) => ({ id: String(s.id), name: String(s.name || '') }))}
          suppliersLoading={pickersLoading} suppliersError={pickersError}
          initial={linkInit} onApplied={onStatementApplied}
        />
      )}

      {/* التقارير المستقلة بذاتها */}
      {reportType === 'fleet-dashboard' && <FleetDashboard />}
      {reportType === 'vessel-profit' && <VesselProfitReport config={PELAGOS} />}
      {reportType === 'alcudia-profit' && <VesselProfitReport config={ALCUDIA} />}
      {reportType === 'poseidon-profit' && <VesselProfitReport config={POSEIDON} />}
      {reportType === 'daleela-line' && <LineProfitReport config={DALEELA_JS} />}
      {reportType === 'gubal-profit' && <GubalProfitReport />}
      {reportType === 'exchange-rates' && <ExchangeRatesCard />}

      {/* Filters */}
      {!selfContained && (
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
              {pickersLoading && suppliers.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">جارٍ تحميل الموردين…</p>}
              {!pickersLoading && pickersError && <p className="text-xs text-red-600 py-2 text-center">{pickersError}</p>}
              {!pickersLoading && !pickersError && filteredSuppliers.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">لا يوجد مورد بهذا الاسم</p>}
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

      {/* ══ نتائج متعددة الموردين — مستحقات ══ */}
      {data?.multi === 'unpaid' && (
        <div className="space-y-5">
          {(() => {
            const secs = data.sections as UnpaidSec[];
            const all = secs.flatMap((s) => s.invoices);
            const totalMap = sumByCurrency(all, (i: any) => +i.total_amount, (i: any) => i.currency);
            const remMap = sumByCurrency(all, (i: any) => (+i.total_amount - +i.paid_amount), (i: any) => i.currency);
            return (
              <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-gray-700">🔴 مستحقات — {secs.length} مورد · {all.length} فاتورة</h3>
                  <div className="flex gap-6 text-sm mt-1 flex-wrap">
                    <span className="text-gray-600">إجمالي: <strong>{fmtCcyMap(totalMap)}</strong></span>
                    <span className="text-red-600">المتبقي: <strong>{fmtCcyMap(remMap)}</strong></span>
                  </div>
                </div>
                <button onClick={() => exportMultiToExcel(secs.map((sec) => ({ name: sec.supplierName, rows: unpaidRows(sec.invoices, sec.supplierName) })), 'مستحقات-موردين')}
                  className="bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-800 flex items-center gap-2">📥 تصدير الكل</button>
              </div>
            );
          })()}

          {(data.sections as UnpaidSec[]).map((sec) => {
            const totalMap = sumByCurrency(sec.invoices, (i: any) => +i.total_amount, (i: any) => i.currency);
            const remMap = sumByCurrency(sec.invoices, (i: any) => (+i.total_amount - +i.paid_amount), (i: any) => i.currency);
            return (
              <div key={sec.supplierId} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-gray-800">🔴 {sec.supplierName} — {sec.invoices.length} فاتورة</h4>
                    <div className="flex gap-6 text-sm mt-1 flex-wrap">
                      <span className="text-gray-600">إجمالي: <strong>{fmtCcyMap(totalMap)}</strong></span>
                      <span className="text-red-600">المتبقي: <strong>{fmtCcyMap(remMap)}</strong></span>
                    </div>
                  </div>
                  <button onClick={() => exportToExcel(unpaidRows(sec.invoices, sec.supplierName), `مستحقات-${sec.supplierName}`)}
                    className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700">📥 Excel</button>
                </div>
                {sec.invoices.length === 0 ? (
                  <p className="text-center py-4 text-gray-400 text-sm">لا توجد فواتير مستحقة لهذا المورد</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-right">
                      <tr>
                        <th scope="col" className="px-4 py-2">رقم الفاتورة</th>
                        <th scope="col" className="px-4 py-2">السفينة</th>
                        <th scope="col" className="px-4 py-2">المبلغ</th>
                        <th scope="col" className="px-4 py-2">المدفوع</th>
                        <th scope="col" className="px-4 py-2">المتبقي</th>
                        <th scope="col" className="px-4 py-2">الاستحقاق</th>
                        <th scope="col" className="px-4 py-2">الحالة</th>
                        <th scope="col" className="px-4 py-2">المرفقات</th>
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
                  </div>
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th scope="col" className="px-4 py-2">رقم الفاتورة</th>
                    <th scope="col" className="px-4 py-2">المورد</th>
                    <th scope="col" className="px-4 py-2">السفينة</th>
                    <th scope="col" className="px-4 py-2">المبلغ</th>
                    <th scope="col" className="px-4 py-2">المتبقي</th>
                    <th scope="col" className="px-4 py-2">تاريخ الاستحقاق</th>
                    <th scope="col" className="px-4 py-2">الحالة</th>
                    <th scope="col" className="px-4 py-2">المرفقات</th>
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
              </div>
            </>
          )}

          {/* Unpaid by Vessel */}
          {reportType === 'unpaid-vessel' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-700 mb-1">🔴 الفواتير غير المسددة — {data.length} فاتورة</h3>
                  <div className="flex gap-6 text-sm flex-wrap">
                    <span className="text-gray-600">إجمالي: <strong>{fmtCcyMap(sumByCurrency(data, (i: any) => +i.total_amount, (i: any) => i.currency))}</strong></span>
                    <span className="text-red-600">المتبقي: <strong>{fmtCcyMap(sumByCurrency(data, (i: any) => (+i.total_amount - +i.paid_amount), (i: any) => i.currency))}</strong></span>
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th scope="col" className="px-4 py-2">رقم الفاتورة</th>
                    <th scope="col" className="px-4 py-2">المورد</th>
                    <th scope="col" className="px-4 py-2">المبلغ</th>
                    <th scope="col" className="px-4 py-2">المدفوع</th>
                    <th scope="col" className="px-4 py-2">المتبقي</th>
                    <th scope="col" className="px-4 py-2">الاستحقاق</th>
                    <th scope="col" className="px-4 py-2">الحالة</th>
                    <th scope="col" className="px-4 py-2">المرفقات</th>
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
              </div>
            </>
          )}

          {/* Vessel Suppliers */}
          {reportType === 'vessel-suppliers' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-700">📊 موردو المركب — {data.length} مورد</h3>
                <button onClick={() => exportToExcel(data.flatMap((row: any) => (row.totalsByCurrency || []).map((t: any) => ({
                  'المورد': row.supplier_name,
                  'العملة': t.currency,
                  'عدد الفواتير': t.invoiceCount,
                  'إجمالي الفواتير': t.invoiced,
                  'المدفوع': t.paid,
                  'المتبقي': t.outstanding,
                }))), 'موردو-المركب')}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-2">
                  📥 Excel
                </button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th scope="col" className="px-4 py-2">المورد</th>
                    <th scope="col" className="px-4 py-2">العملة</th>
                    <th scope="col" className="px-4 py-2">عدد الفواتير</th>
                    <th scope="col" className="px-4 py-2">إجمالي الفواتير</th>
                    <th scope="col" className="px-4 py-2">المدفوع</th>
                    <th scope="col" className="px-4 py-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row: any, i: number) => (row.totalsByCurrency || []).map((t: any, ci: number) => (
                    <tr key={i + '-' + ci} className="border-t">
                      <td className="px-4 py-2 font-medium">{ci === 0 ? row.supplier_name : ''}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{t.currency}</td>
                      <td className="px-4 py-2 text-center">{t.invoiceCount}</td>
                      <td className="px-4 py-2">{num(t.invoiced)}</td>
                      <td className="px-4 py-2 text-green-600">{num(t.paid)}</td>
                      <td className="px-4 py-2 text-red-600 font-bold">{num(t.outstanding)}</td>
                    </tr>
                  )))}
                  {data.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
              </div>
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
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th scope="col" className="px-4 py-2">رقم الفاتورة</th>
                      <th scope="col" className="px-4 py-2">المورد</th>
                      <th scope="col" className="px-4 py-2">السفينة</th>
                      <th scope="col" className="px-4 py-2">المبلغ</th>
                      <th scope="col" className="px-4 py-2">الحالة</th>
                      <th scope="col" className="px-4 py-2">تاريخ الحالة</th>
                      <th scope="col" className="px-4 py-2 text-center">أيام التأخر</th>
                      <th scope="col" className="px-4 py-2">القسم المسؤول</th>
                      <th scope="col" className="px-4 py-2">المرفقات</th>
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
                </div>
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
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-right">
                      <tr>
                        <th scope="col" className="px-4 py-2">المستخدم</th>
                        <th scope="col" className="px-4 py-2 text-center">عدد الفواتير</th>
                        <th scope="col" className="px-4 py-2">نسبة المشاركة</th>
                        <th scope="col" className="px-4 py-2">السفن</th>
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
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
    </ReportShell>
    </div>
  );
}
