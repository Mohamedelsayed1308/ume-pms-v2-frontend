/*
 * دليل مركز التحليلات — بيانات التقارير وحدها، بلا واجهة.
 *
 * كلّ تقريرٍ يحمل مع اسمه ووصفه: **السؤال الذي يجيب عنه** (`question`)،
 * و**نوع نتيجته** (`resultType`)، و**الفلاتر التي يطلبها** (`needs`)، وكلماتٍ
 * للبحث بالعربيّة والإنجليزيّة (`keywords`). والنصوص منقولةٌ حرفيّاً من تسليم
 * التصميم v1.2 (`QN` في النموذج)، عدا دليلة فهي أُضيفت بعده.
 *
 * `REPORT_REQUIRES` هو شرط الظهور: الشاشة التي يجب أن يملكها المستخدم.
 */
export interface Bi { ar: string; en: string }
export type CatKey = 'fleet' | 'suppliers' | 'cash' | 'ops' | 'tools';
export type ReportId =
  | 'fleet-dashboard' | 'vessel-profit' | 'alcudia-profit' | 'poseidon-profit' | 'daleela-line' | 'gubal-profit'
  | 'supplier-statement' | 'unpaid-supplier' | 'vessel-suppliers'
  | 'due-alerts' | 'unpaid-vessel'
  | 'dept-delays' | 'user-activity'
  | 'exchange-rates';

export interface ReportMeta {
  id: ReportId; cat: CatKey; icon: string;
  title: Bi; desc: Bi; question: Bi; resultType: Bi; needs: Bi; keywords: string;
}

const B = (ar: string, en: string): Bi => ({ ar, en });

export const CATEGORIES: { key: CatKey; icon: string; label: Bi; soft: string; ink: string }[] = [
  { key: 'fleet', icon: 'ship', label: B('الأسطول والأداء', 'Fleet & Performance'), soft: '#e6edf1', ink: '#00283a' },
  { key: 'suppliers', icon: 'factory', label: B('الموردون والمستحقات', 'Suppliers & Payables'), soft: '#eef4ff', ink: '#234ed6' },
  { key: 'cash', icon: 'card', label: B('النقدية والاستحقاق', 'Cash & Aging'), soft: '#fef3f2', ink: '#b42318' },
  { key: 'ops', icon: 'users', label: B('العمليات والفريق', 'Operations & Team'), soft: '#fffaeb', ink: '#b54708' },
  { key: 'tools', icon: 'globe', label: B('أدوات', 'Tools'), soft: '#ecf5f0', ink: '#2b6b4e' },
];

const R_OWN = B('فلاتر داخل التقرير', 'Built-in filters');
const R_SUP = B('يتطلب اختيار مورد', 'Needs supplier');
const R_VES = B('يتطلب اختيار مركب', 'Needs vessel');
const R_NONE = B('بدون فلاتر', 'No filters');
const PNL = B('قائمة دخل شهرية', 'Monthly P&L');
const LIST = B('قائمة فواتير + المتبقي', 'Invoice list + remaining');

export const REPORTS: ReportMeta[] = [
  { id: 'fleet-dashboard', cat: 'fleet', icon: 'chart', title: B('لوحة الأسطول التنفيذية', 'Fleet Executive Dashboard'), desc: B('مؤشرات ومقارنات وأعداد المنقولات لكل الأسطول + مساعد ذكي', 'Fleet-wide KPIs, comparisons, movement counts + AI assistant'), question: B('كيف يؤدي الأسطول ككل في الفترة المختارة؟', 'How is the whole fleet performing in the chosen period?'), resultType: B('مؤشرات ورسوم + مساعد', 'KPIs & charts + assistant'), needs: R_OWN, keywords: 'kpi مؤشرات رحلات شاحنات ركاب fleet voyages trucks' },
  { id: 'vessel-profit', cat: 'fleet', icon: 'coins', title: B('ربحية Pelagos', 'Pelagos Profitability'), desc: B('إيرادات ومصروفات وسيولة بيلاجوس شهرياً', 'Monthly revenue, expenses & liquidity — Pelagos'), question: B('هل تربح Pelagos كل شهر، وأين تذهب السيولة؟', 'Is Pelagos profitable each month, and where does cash go?'), resultType: PNL, needs: R_OWN, keywords: 'pelagos بيلاجوس ربح profit سيولة liquidity' },
  { id: 'alcudia-profit', cat: 'fleet', icon: 'coins', title: B('ربحية Alcudia', 'Alcudia Profitability'), desc: B('إيرادات ومصروفات ومشتريات الكوديا شهرياً', 'Monthly revenue, expenses & purchases — Alcudia'), question: B('هل تربح Alcudia كل شهر بعد المشتريات؟', 'Is Alcudia profitable each month after purchases?'), resultType: PNL, needs: R_OWN, keywords: 'alcudia الكوديا ربح profit مشتريات purchases' },
  { id: 'poseidon-profit', cat: 'fleet', icon: 'coins', title: B('ربحية Poseidon', 'Poseidon Profitability'), desc: B('إيرادات ومصروفات بوسيدون شهرياً — تشغيلي، بلا توزيع الأرباح', 'Monthly revenue & expenses — Poseidon (operational, excludes profit distribution)'), question: B('ما النتيجة التشغيلية لـ Poseidon كل شهر؟', 'What is Poseidon’s monthly operating result?'), resultType: PNL, needs: R_OWN, keywords: 'poseidon بوسيدون ربح profit' },
  { id: 'daleela-line', cat: 'fleet', icon: 'coins', title: B('ربحية دليلة — جدّة/سواكن', 'Daleela Profitability — Jeddah/Suakin'), desc: B('قالب خطّ جدّة/سواكن: قائمة الدخل والأعداد والاتّجاهان والمقارنة وسعر الجنيه', 'Jeddah/Suakin template: P&L, volumes, directions, peers & SDG rate'), question: B('هل تربح دليلة على خطّ جدّة/سواكن بعد الإيجار، وكم شاحنةً تتعادل بها الرحلة؟', 'Is Daleela profitable on the Jeddah/Suakin line after hire, and at how many trucks does a voyage break even?'), resultType: PNL, needs: R_OWN, keywords: 'daleela دليلة جدة سواكن jeddah suakin sudan السودان ربح profit تعادل break-even ايجار hire' },
  { id: 'gubal-profit', cat: 'fleet', icon: 'coins', title: B('ربحية Gubal', 'Gubal Profitability'), desc: B('قائمة دخل شهرية / من فترة لفترة لمركب جوبال', 'Monthly / period income statement — Gubal'), question: B('ما قائمة دخل Gubal لفترة محددة؟', 'What is Gubal’s income statement for a period?'), resultType: PNL, needs: R_OWN, keywords: 'gubal جوبال قائمة دخل income statement' },

  { id: 'supplier-statement', cat: 'suppliers', icon: 'receipt', title: B('كشف حساب مورد', 'Supplier Statement'), desc: B('مدين / دائن / رصيد متراكم لكل عملة', 'Debit / credit / running balance per currency'), question: B('ما رصيدنا مع مورد بكل عملة، وكيف تكوّن؟', 'What is our balance with a supplier per currency, and how did it build up?'), resultType: B('دفتر حركات لكل عملة', 'Ledger per currency'), needs: R_SUP, keywords: 'رصيد مورد حساب مدين دائن دفتر ledger balance statement account' },
  { id: 'unpaid-supplier', cat: 'suppliers', icon: 'factory', title: B('مستحقات مورد', 'Supplier Outstanding'), desc: B('الفواتير غير المدفوعة أو الجزئية لمورد', 'Unpaid / partial invoices per supplier'), question: B('ما فواتير المورد التي لم تُسدَّد بالكامل؟', 'Which of a supplier’s invoices are not fully paid?'), resultType: LIST, needs: R_SUP, keywords: 'مستحقات غير مدفوعة جزئي outstanding unpaid payable' },
  { id: 'vessel-suppliers', cat: 'suppliers', icon: 'clipboard', title: B('موردو المركب', 'Vessel Suppliers'), desc: B('حجم تعامل كل مورد على المركب', 'Spend per supplier on a vessel'), question: B('مع أي موردين نتعامل أكثر على مركب معيّن؟', 'Which suppliers do we spend most with on a vessel?'), resultType: B('إجماليات لكل مورد وعملة', 'Totals per supplier & currency'), needs: R_VES, keywords: 'موردين مركب إنفاق spend vendors' },

  { id: 'due-alerts', cat: 'cash', icon: 'bell', title: B('تنبيهات الاستحقاق', 'Due Alerts'), desc: B('فواتير مستحقة خلال فترة محددة', 'Invoices due within a period'), question: B('ما الفواتير التي تستحق السداد قريباً؟', 'Which invoices fall due soon?'), resultType: B('فواتير حسب موعد الاستحقاق', 'Invoices by due date'), needs: B('يتطلب مدة الاستحقاق', 'Needs due window'), keywords: 'استحقاق متأخرة due overdue alerts' },
  { id: 'unpaid-vessel', cat: 'cash', icon: 'ship', title: B('مستحقات مركب', 'Outstanding by Vessel'), desc: B('الفواتير غير المدفوعة على مركب معين', 'Unpaid invoices for a vessel'), question: B('ما المستحقات المفتوحة على مركب معيّن؟', 'What is still unpaid for a vessel?'), resultType: LIST, needs: R_VES, keywords: 'مستحقات مركب unpaid vessel' },

  { id: 'dept-delays', cat: 'ops', icon: 'bell', title: B('تأخرات الأقسام', 'Department Delays'), desc: B('فواتير تجاوزت 3 أيام بدون إجراء', 'Invoices stuck >3 days without action'), question: B('أين تتوقف الفواتير أكثر من 3 أيام؟', 'Where are invoices stuck for more than 3 days?'), resultType: B('فواتير متوقفة', 'Stuck invoices'), needs: R_NONE, keywords: 'تأخير اعتماد أقسام delays approval stuck' },
  { id: 'user-activity', cat: 'ops', icon: 'users', title: B('نشاط المستخدمين', 'User Activity'), desc: B('عدد الفواتير لكل مستخدم حسب السفينة', 'Invoice count per user by vessel'), question: B('من يسجّل الفواتير، وعلى أي سفينة؟', 'Who records invoices, and for which vessel?'), resultType: B('عدد لكل مستخدم وسفينة', 'Counts per user & vessel'), needs: R_NONE, keywords: 'مستخدمين نشاط فواتير users activity' },

  { id: 'exchange-rates', cat: 'tools', icon: 'globe', title: B('أسعار الصرف', 'Exchange Rates'), desc: B('أسعار العملات مقابل الدولار لكل شهر', 'Monthly currency rates vs USD'), question: B('كم كان سعر العملة مقابل الدولار في شهر معيّن؟', 'What was a currency’s rate vs USD in a given month?'), resultType: B('جدول أسعار شهري', 'Monthly rate table'), needs: R_OWN, keywords: 'صرف عملات دولار يورو fx rates currency' },
];

// كل تقرير → الشاشة المطلوبة للوصول (تصفية حسب الصلاحية داخل مركز التحليلات)
export const REPORT_REQUIRES: Record<ReportId, string> = {
  'fleet-dashboard': '/dashboard/vessels', 'vessel-profit': '/dashboard/vessels',
  'alcudia-profit': '/dashboard/vessels', 'gubal-profit': '/dashboard/vessels',
  'poseidon-profit': '/dashboard/vessels', 'daleela-line': '/dashboard/vessels',
  'vessel-suppliers': '/dashboard/vessels',
  'supplier-statement': '/dashboard/suppliers', 'unpaid-supplier': '/dashboard/suppliers',
  'due-alerts': '/dashboard/invoices', 'unpaid-vessel': '/dashboard/invoices',
  'dept-delays': '/dashboard/invoices', 'user-activity': '/dashboard/invoices',
  'exchange-rates': '/dashboard/reports',
};

export const REPORT_MAP = Object.fromEntries(REPORTS.map((r) => [r.id, r])) as Record<ReportId, ReportMeta>;
export const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CatKey, (typeof CATEGORIES)[number]>;
export const isReportId = (x: unknown): x is ReportId => typeof x === 'string' && x in REPORT_MAP;

/** نصّ البحث لتقرير: الاسم والوصف والكلمات والفئة، باللغتين — كما في التسليم §3. */
export function searchText(r: ReportMeta): string {
  const c = CAT_MAP[r.cat];
  return [r.title.ar, r.title.en, r.desc.ar, r.desc.en, r.keywords, c.label.ar, c.label.en].join(' ');
}
