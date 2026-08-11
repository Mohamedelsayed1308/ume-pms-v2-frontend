'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import VesselProfitReport, { PELAGOS, ALCUDIA } from './VesselProfitReport';
import GubalProfitReport from './GubalProfitReport';
import ExchangeRatesCard from './ExchangeRatesCard';
import FleetDashboard from './FleetDashboard';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { fmtCcyMap, sumByCurrency } from '@/lib/format';
import { getUser } from '@/lib/auth';
import { canHref } from '@/lib/profile';

// كل تقرير → الشاشة/البيانات المطلوبة للوصول (تصفية حسب الصلاحية داخل مركز التحليلات)
const REPORT_REQUIRES: Record<string, string> = {
  'fleet-dashboard': '/dashboard/vessels', 'vessel-profit': '/dashboard/vessels',
  'alcudia-profit': '/dashboard/vessels', 'gubal-profit': '/dashboard/vessels',
  'vessel-suppliers': '/dashboard/vessels',
  'supplier-statement': '/dashboard/suppliers', 'unpaid-supplier': '/dashboard/suppliers',
  'due-alerts': '/dashboard/invoices', 'unpaid-vessel': '/dashboard/invoices',
  'dept-delays': '/dashboard/invoices', 'user-activity': '/dashboard/invoices',
  'exchange-rates': '/dashboard/reports',
};

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };

type ReportType = 'fleet-dashboard' | 'supplier-statement' | 'unpaid-supplier' | 'unpaid-vessel' | 'vessel-suppliers' | 'due-alerts' | 'user-activity' | 'dept-delays' | 'vessel-profit' | 'alcudia-profit' | 'gubal-profit' | 'exchange-rates';

type CatKey = 'fleet' | 'suppliers' | 'cash' | 'ops' | 'tools';

interface Bi { ar: string; en: string }
interface ReportMeta { id: ReportType; cat: CatKey; icon: string; title: Bi; desc: Bi }

// ── فئات مركز التحليلات (كل فئة مدعومة بتقارير حقيقية فقط) ──
const CATEGORIES: { key: CatKey; icon: string; label: Bi; accent: string; ring: string; text: string; soft: string }[] = [
  { key: 'fleet', icon: 'ship', label: { ar: 'الأسطول والأداء', en: 'Fleet & Performance' }, accent: 'bg-indigo-500', ring: 'ring-indigo-200 border-indigo-300', text: 'text-indigo-600', soft: 'bg-indigo-50' },
  { key: 'suppliers', icon: 'factory', label: { ar: 'الموردون والمستحقات', en: 'Suppliers & Payables' }, accent: 'bg-blue-500', ring: 'ring-blue-200 border-blue-300', text: 'text-blue-600', soft: 'bg-blue-50' },
  { key: 'cash', icon: 'card', label: { ar: 'النقدية والاستحقاق', en: 'Cash & Aging' }, accent: 'bg-red-500', ring: 'ring-red-200 border-red-300', text: 'text-red-600', soft: 'bg-red-50' },
  { key: 'ops', icon: 'users', label: { ar: 'العمليات والفريق', en: 'Operations & Team' }, accent: 'bg-amber-500', ring: 'ring-amber-200 border-amber-300', text: 'text-amber-600', soft: 'bg-amber-50' },
  { key: 'tools', icon: 'globe', label: { ar: 'أدوات', en: 'Tools' }, accent: 'bg-purple-500', ring: 'ring-purple-200 border-purple-300', text: 'text-purple-600', soft: 'bg-purple-50' },
];

// ── دليل التقارير ──
const REPORTS: ReportMeta[] = [
  { id: 'fleet-dashboard', cat: 'fleet', icon: 'chart', title: { ar: 'لوحة الأسطول التنفيذية', en: 'Fleet Executive Dashboard' }, desc: { ar: 'مؤشرات ومقارنات وأعداد المنقولات لكل الأسطول + مساعد ذكي', en: 'Fleet-wide KPIs, comparisons, movement counts + AI assistant' } },
  { id: 'vessel-profit', cat: 'fleet', icon: 'coins', title: { ar: 'ربحية Pelagos', en: 'Pelagos Profitability' }, desc: { ar: 'إيرادات ومصروفات وسيولة بيلاجوس شهرياً', en: 'Monthly revenue, expenses & liquidity — Pelagos' } },
  { id: 'alcudia-profit', cat: 'fleet', icon: 'coins', title: { ar: 'ربحية Alcudia', en: 'Alcudia Profitability' }, desc: { ar: 'إيرادات ومصروفات ومشتريات الكوديا شهرياً', en: 'Monthly revenue, expenses & purchases — Alcudia' } },
  { id: 'gubal-profit', cat: 'fleet', icon: 'coins', title: { ar: 'ربحية Gubal', en: 'Gubal Profitability' }, desc: { ar: 'قائمة دخل شهرية / من فترة لفترة لمركب جوبال', en: 'Monthly / period income statement — Gubal' } },

  { id: 'supplier-statement', cat: 'suppliers', icon: 'receipt', title: { ar: 'كشف حساب مورد', en: 'Supplier Statement' }, desc: { ar: 'مدين / دائن / رصيد متراكم', en: 'Debit / credit / running balance' } },
  { id: 'unpaid-supplier', cat: 'suppliers', icon: 'factory', title: { ar: 'مستحقات مورد', en: 'Supplier Outstanding' }, desc: { ar: 'الفواتير غير المدفوعة أو الجزئية لمورد', en: 'Unpaid / partial invoices per supplier' } },
  { id: 'vessel-suppliers', cat: 'suppliers', icon: 'clipboard', title: { ar: 'موردو المركب', en: 'Vessel Suppliers' }, desc: { ar: 'حجم تعامل كل مورد على المركب', en: 'Spend per supplier on a vessel' } },

  { id: 'due-alerts', cat: 'cash', icon: 'bell', title: { ar: 'تنبيهات الاستحقاق', en: 'Due Alerts' }, desc: { ar: 'فواتير مستحقة خلال فترة محددة', en: 'Invoices due within a period' } },
  { id: 'unpaid-vessel', cat: 'cash', icon: 'ship', title: { ar: 'مستحقات مركب', en: 'Outstanding by Vessel' }, desc: { ar: 'الفواتير غير المدفوعة على مركب معين', en: 'Unpaid invoices for a vessel' } },

  { id: 'dept-delays', cat: 'ops', icon: 'bell', title: { ar: 'تأخرات الأقسام', en: 'Department Delays' }, desc: { ar: 'فواتير تجاوزت 3 أيام بدون إجراء', en: 'Invoices stuck >3 days without action' } },
  { id: 'user-activity', cat: 'ops', icon: 'users', title: { ar: 'نشاط المستخدمين', en: 'User Activity' }, desc: { ar: 'عدد الفواتير لكل مستخدم حسب السفينة', en: 'Invoice count per user by vessel' } },

  { id: 'exchange-rates', cat: 'tools', icon: 'globe', title: { ar: 'أسعار الصرف', en: 'Exchange Rates' }, desc: { ar: 'أسعار العملات مقابل الدولار لكل شهر', en: 'Monthly currency rates vs USD' } },
];

const REPORT_MAP: Record<string, ReportMeta> = Object.fromEntries(REPORTS.map((r) => [r.id, r]));
const CAT_MAP: Record<string, (typeof CATEGORIES)[number]> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const RECENTS_KEY = 'ume_report_recents';
function readRecents(): ReportType[] {
  try { const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => REPORT_MAP[x]) : []; } catch { return []; }
}
function pushRecent(id: ReportType) {
  try {
    const cur = readRecents().filter((x) => x !== id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...cur].slice(0, 4)));
  } catch { /* noop */ }
}

interface UserReport {
  user_id: string;
  user_name: string;
  total: number;
  by_vessel: { vessel: string; count: number }[];
}

interface StatementSec { supplierId: string; supplierName: string; currencies: any[]; }
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
  const { locale, t } = useI18n();
  const L = (b: Bi) => (locale === 'en' ? b.en : b.ar);
  const [user, setUser] = useState<any>(null);
  useEffect(() => { setUser(getUser()); }, []);
  const canReport = (id: string) => canHref(user, REPORT_REQUIRES[id] || '/dashboard/reports');

  const [selected, setSelected] = useState<ReportType | ''>('');
  const [search, setSearch] = useState('');
  const [recents, setRecents] = useState<ReportType[]>([]);

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

  useEffect(() => { setRecents(readRecents()); }, []);

  useEffect(() => {
    Promise.all([api.get('/api/suppliers'), api.get('/api/vessels')]).then(([s, v]) => {
      setSuppliers(s.data);
      setVessels(v.data);
    });
  }, []);

  function openReport(id: ReportType) {
    if (!canReport(id)) return;
    setSelected(id);
    setData(null);
    setAttachments({});
    pushRecent(id);
    setRecents(readRecents());
  }
  function backToHome() {
    setSelected('');
    setData(null);
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
      if (reportType === 'supplier-statement' || reportType === 'unpaid-supplier') {
        if (selectedSuppliers.length === 0) { alert('اختر موردًا واحدًا على الأقل'); return; }

        if (reportType === 'supplier-statement') {
          const results = await Promise.all(selectedSuppliers.map((id) =>
            api.get(`/api/invoices/statement/supplier/${id}`).then((r) => ({ id, d: r.data }))));
          const sections: StatementSec[] = results.map(({ id, d }) => ({
            supplierId: id,
            supplierName: d?.supplier?.name || nameOf(id),
            currencies: d?.currencies || [],
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

  const needsSupplier = ['supplier-statement', 'unpaid-supplier'].includes(reportType);
  const needsVessel = ['unpaid-vessel', 'vessel-suppliers'].includes(reportType);
  const needsDays = reportType === 'due-alerts';
  const noFilter = reportType === 'user-activity' || reportType === 'dept-delays';
  const selfContained = ['fleet-dashboard', 'vessel-profit', 'alcudia-profit', 'gubal-profit', 'exchange-rates'].includes(reportType);

  const filteredSuppliers = suppliers.filter((s) =>
    (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()));
  const toggleSupplier = (id: string) =>
    setSelectedSuppliers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // ── تصفية دليل التقارير حسب البحث ──
  const q = search.trim().toLowerCase();
  const catalog = useMemo(() => CATEGORIES.map((c) => ({
    cat: c,
    items: REPORTS.filter((r) => r.cat === c.key).filter((r) => canReport(r.id)).filter((r) =>
      !q || L(r.title).toLowerCase().includes(q) || L(r.desc).toLowerCase().includes(q) || L(c.label).toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0), [q, locale, user]);

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
    'العملة': t.currency,
    'الرصيد': t.balance,
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

  // ══════════════════════════ مركز التحليلات (الصفحة الرئيسية) ══════════════════════════
  if (!selected) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[var(--color-navy,#0f172a)] mb-1">{t('reports.center', locale === 'en' ? 'Analytics Center' : 'مركز التحليلات')}</h2>
          <p className="text-sm text-gray-500">{t('reports.centerSub', locale === 'en' ? 'Answer a business question — pick a report by category or search.' : 'أجب عن سؤال إداري بسرعة — اختر تقريرًا حسب الفئة أو ابحث.')}</p>
        </div>

        {/* بحث */}
        <div className="relative mb-6 max-w-xl">
          <span className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400 pointer-events-none">
            <Icon name="search" size={18} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'en' ? 'Search reports…' : 'ابحث في التقارير…'}
            className="w-full border border-gray-200 rounded-xl ps-10 pe-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* المستخدمة مؤخراً */}
        {!q && recents.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-500">{locale === 'en' ? 'Recently used' : 'المستخدمة مؤخراً'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {recents.map((id) => {
                const r = REPORT_MAP[id]; if (!r) return null;
                const c = CAT_MAP[r.cat];
                return (
                  <button key={id} onClick={() => openReport(id)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition-all text-start">
                    <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${c.soft} ${c.text}`}>
                      <Icon name={r.icon} size={18} />
                    </span>
                    <span className="text-sm font-medium text-gray-700 truncate">{L(r.title)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* الفئات */}
        <div className="space-y-7">
          {catalog.map(({ cat, items }) => (
            <div key={cat.key}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${cat.accent}`}>
                  <Icon name={cat.icon} size={18} />
                </span>
                <h3 className="text-base font-bold text-gray-800">{L(cat.label)}</h3>
                <span className="text-xs text-gray-400">({items.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((r) => (
                  <button key={r.id} onClick={() => openReport(r.id)}
                    className={`group text-start p-4 rounded-xl border border-gray-200 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all ${cat.ring.split(' ')[1]}`}>
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${cat.soft} ${cat.text}`}>
                        <Icon name={r.icon} size={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-gray-800 group-hover:text-gray-900">{L(r.title)}</div>
                        <div className="text-xs text-gray-500 mt-1 leading-relaxed">{L(r.desc)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {catalog.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Icon name="search" size={32} />
              <p className="mt-3 text-sm">{locale === 'en' ? 'No reports match your search.' : 'لا يوجد تقرير مطابق للبحث.'}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════ عرض تقرير مفرد ══════════════════════════
  const meta = REPORT_MAP[selected];
  const cat = meta ? CAT_MAP[meta.cat] : CATEGORIES[0];

  return (
    <div>
      {/* رأس موحّد + رجوع */}
      <div className="flex items-start gap-3 mb-6">
        <button onClick={backToHome}
          className="shrink-0 mt-0.5 w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-600"
          title={locale === 'en' ? 'Back to Analytics Center' : 'رجوع لمركز التحليلات'} aria-label="back">
          <Icon name={locale === 'en' ? 'chevronLeft' : 'chevronRight'} size={20} />
        </button>
        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${cat.soft} ${cat.text}`}>
          <Icon name={meta?.icon || 'chart'} size={22} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-800">{meta ? L(meta.title) : ''}</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${cat.soft} ${cat.text} font-medium`}>{L(cat.label)}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{meta ? L(meta.desc) : ''}</p>
        </div>
      </div>

      {/* التقارير المستقلة بذاتها */}
      {reportType === 'fleet-dashboard' && <FleetDashboard />}
      {reportType === 'vessel-profit' && <VesselProfitReport config={PELAGOS} />}
      {reportType === 'alcudia-profit' && <VesselProfitReport config={ALCUDIA} />}
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
            return (
              <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-gray-700">📒 كشف حساب — {secs.length} مورد</h3>
                  <p className="text-[11px] text-gray-500 mt-1">كل عملة دفتر مستقل — لا يوجد رصيد موحّد ولا تحويل بين العملات.</p>
                </div>
                <button onClick={() => exportMultiToExcel(secs.flatMap((sec) => (sec.currencies || []).map((L: any) => ({ name: `${sec.supplierName}-${L.currency}`, rows: statementRows(L.transactions) }))), 'كشف-حساب-موردين')}
                  className="bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-800 flex items-center gap-2">📥 تصدير الكل</button>
              </div>
            );
          })()}

          {(data.sections as StatementSec[]).map((sec) => (
            <div key={sec.supplierId} className="bg-white rounded-xl shadow p-4">
              <h4 className="font-bold text-gray-800 mb-3">📒 {sec.supplierName}</h4>
              {!(sec.currencies || []).length ? (
                <p className="text-center py-4 text-gray-400 text-sm">لا توجد حركات لهذا المورد</p>
              ) : (sec.currencies || []).map((L: any) => (
                <div key={L.currency} className="mb-5 last:mb-0 border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-gray-800">{L.currency}</span>
                    <div className="flex gap-4 text-xs flex-wrap">
                      <span className="text-gray-500">رصيد افتتاحي: <strong>{num(L.openingBalance)}</strong></span>
                      <span className="text-red-600">فواتير: <strong>{num(L.invoicesTotal)}</strong></span>
                      <span className="text-green-600">سدادات: <strong>{num(L.paymentsTotal)}</strong></span>
                      {L.creditsTotal > 0 && <span className="text-indigo-600">إشعارات دائنة: <strong>{num(L.creditsTotal)}</strong></span>}
                      <span className={L.closingBalance > 0 ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>الرصيد الختامي: {num(L.closingBalance)} {L.currency}</span>
                    </div>
                    <button onClick={() => exportToExcel(statementRows(L.transactions), `كشف-حساب-${sec.supplierName}-${L.currency}`)}
                      className="bg-green-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-green-700">📥 Excel</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white text-gray-600 text-right border-b">
                        <tr>
                          <th className="px-4 py-2">التاريخ</th>
                          <th className="px-4 py-2">البيان</th>
                          <th className="px-4 py-2">السفينة</th>
                          <th className="px-4 py-2">مدين</th>
                          <th className="px-4 py-2">دائن</th>
                          <th className="px-4 py-2">الرصيد ({L.currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {L.transactions.map((t: any, i: number) => (
                          <tr key={i} className={`border-t ${t.kind === 'credit_note' ? 'bg-indigo-50/40' : t.type === 'debit' ? 'bg-red-50/30' : 'bg-green-50/30'}`}>
                            <td className="px-4 py-2 text-gray-500">{t.date?.slice(0, 10)}</td>
                            <td className="px-4 py-2">{t.description}</td>
                            <td className="px-4 py-2 text-gray-500">{t.vessel || '—'}</td>
                            <td className="px-4 py-2 text-red-600 font-medium">{t.debit > 0 ? num(t.debit) : '—'}</td>
                            <td className="px-4 py-2 text-green-600 font-medium">{t.credit > 0 ? num(t.credit) : '—'}</td>
                            <td className={`px-4 py-2 font-bold ${t.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>{num(t.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
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
              </div>
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
              <div className="overflow-x-auto">
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
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
