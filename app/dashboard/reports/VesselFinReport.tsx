'use client';
import { useMemo, useState } from 'react';
import { costSegments, costBreakdown, BUCKETS, CODE_OF_BUCKET, ASSIGNABLE_CODES, LOCKED_COST_KEYS, type ExecData, type CostDetailGroup, type CostDetailItem } from './VesselExecReport';
import { useI18n } from '@/lib/i18n';
import SaveAsMenu from '@/components/SaveAsMenu';
import { DEFAULT_PROFILE, type ReportProfile } from '@/lib/reports/reportProfile';

/**
 * ── تقرير صافي الربح — النسخة المالية ──
 *
 * التقرير الأصلي يعرض عشر كتلٍ متجاورة: الإيرادات، المنقولات، المصروفات، البنكر،
 * السيولة، المشتريات… كلٌّ صحيحة وحدها، ولا خيط يربطها. فيرى القارئ 3.48 مليون في
 * الأعلى و1.75 في الأعلى أيضاً، ولا يجد بينهما طريقاً.
 *
 * وهذه النسخة تبدأ بالطريق: قائمة دخلٍ متدرّجة تنزل من الإيراد إلى الصافي درجةً
 * درجة، كل درجة سطرٌ ونسبتها من الإيراد واسم القسم الذي يفصّلها. ثم الأقسام
 * بالترتيب نفسه، ثم `Analysis` والرسوم في الختام.
 *
 * ── ولا «ملحق» في التقرير ──
 * أمر المالك في ٢٥ أغسطس ٢٠٢٦: الكلمة تُوحي بأنّ ما تحتها هامشٌ يُتخطّى، وهي
 * كشوفُ التفصيل التي يُراجَع بها كلّ رقمٍ في قائمة الدخل. فصار عمود الإحالة
 * يُسمّي القسم لا يرقّمه.
 *
 * ── والأصل يبقى ──
 * لا يُلمس `#vp-doc`. هذه نافذةٌ منفصلة بزرٍّ خاصّ، فيُقارَن الشكلان على الورق
 * قبل أن يُستغنى عن أحدهما.
 *
 * ── نسختان: عربيّة وإنجليزيّة ──
 * بأمر المالك ٩ سبتمبر ٢٠٢٦: نسخةٌ إنجليزيّة بالمصطلحات المحاسبيّة المتداولة
 * (Revenue · Gross Profit · Net Profit · Cost of Bunkers Consumed · Crew Wages).
 * تتبع زرّ اللغة في رأس الصفحة، ولها زرٌّ في رأس النافذة يقلبها في مكانها.
 * والبنود المقروءة من دفتر المركب بمفاتيحها تُترجَم بقاموسٍ هنا، لأنّ الشاشة
 * تُسمّيها بالعربيّة وإعدادها لا يُلمس. والأرقام واحدة في الحالتين.
 */

export interface RevRow { key: string; cKey: string; label: string }

export interface FinData {
  E: any; I: any;
  revE: number; revI: number; revenue: number;
  manualRev?: { key: string; label: string; amount: number }[];
  expE: number; expI: number;
  opening: number; supplies: number; closing: number; bunkerCost: number;
  salaries: number; net: number;
  O: number; P: number; liqBassam: number; liqIttihad: number;
  count: number;
}

export interface PurchaseItem {
  id: string; number: string; supplier: string; item: string;
  lines: { item_name?: string; amount?: number }[] | null;
  date: string; amount: number; currency: string;
  nMonths: number; seq: number | string; installment: number;
  missing?: boolean; usedDefault?: boolean;
}

interface Props {
  cfg: { vessel: string; agentExport: string; agentImport: string };
  month: string;
  monthTo?: string;
  monthLabel: string;
  data: FinData;
  purchases: { byItem: { name: string; value: number }[]; items: PurchaseItem[]; total: number } | null;
  exec: ExecData;
  allocVoy: { ref: string; revenue: number; net: number }[];
  labelOf: Record<string, string>;
  revRows: readonly RevRow[];
  /** رموز هيكل التكاليف المحفوظة لبنود الوكلاء: `{ broker: 'A' }` */
  costCodes?: Record<string, string>;
  /** التصنيف الافتراضيّ في الكود — ليُعرض بجوار كلّ بندٍ رمزُه لو لم يُحفظ له شيء */
  defaultBuckets?: Record<string, string>;
  /** للأدمن وحده: حفظ رمز بند (`null` = رجوعٌ إلى الافتراضيّ) */
  onSetCostCode?: (key: string, code: string | null) => Promise<void>;
  /** تعذّرت قراءة الرموز المحفوظة: التقرير معروضٌ بالتصنيف الافتراضيّ */
  costCodesWarn?: boolean;
  /** ما تُخفيه النافذة وما تُسمّيه لمركبٍ بلا دفتر بوسيدون (مونتي) — انظر `reportProfile.ts` */
  profile?: ReportProfile;
  onClose: () => void;
}

/*
 * مسمّيات يعتمدها المالك في هذا التقرير وحده.
 *
 * لا تُغيَّر في إعداد الشاشة لأن التقرير الأصلي يقرأ منه، والمطلوب إبقاؤه كما هو
 * بديلاً حتى يُحسم الشكلان.
 */
const LABEL_OVERRIDE: Record<string, string> = {
  egyPort: 'EGP Port Dues',
  ksaPort: 'KSA Port Dues',
};

/** بنود مصاريف الوكلاء بمفاتيحها في الدفتر → المصطلح الإنجليزيّ */
const EXP_EN: Record<string, string> = {
  otherExpsE: 'Other Expenses', dischargeOrderTax: 'Discharge Order Tax', disShiOrder60: 'Discharge / Shipping Order 60%',
  frtDep: 'Freight Deposit 6.5% + 500', vehicle12: 'Vehicles 12%', pks12: 'PKS 12%', broker: 'Broker Commission',
  egyPort: 'EGY Port Authority Dues', egyPortI: 'EGY Port Authority Dues', ksaPort: 'KSA Port Authority Dues', ksaPortE: 'KSA Port Authority Dues',
  comm10: 'Commission 10%', commVehicle: 'Commission — Vehicles', comm20: 'Commission 20%', comm15: 'Commission 15%',
  fw: 'Fresh Water', specialDisc: 'Special Discount', elbassam: 'El-Bassam Port Charges', telcome: 'Telecom',
  otherExpsI: 'Other Expenses', othersI: 'Other Expenses', others: 'Other Expenses',
  shipOrder60: 'Shipping Order Commission 60%', freeZone2: 'Free Zone 2%', toursVeh12: 'Tours — Vehicles 12%',
  toursPks12: 'Tours — PKS 12%', cargo: 'Cargo', corona: 'Corona Test',
  // مونتي — مفاتيح حقول حزمتها
  cost_port_jed: 'Jeddah Port, Shipping & Discharge Charges', cost_comm_jed: 'Jeddah Agency Commission', cost_water: 'Fresh Water',
  cost_agent_adj: 'Jeddah Agent SOA vs Profit File', cost_gifts: 'Passenger Gifts', cost_catering: 'Voyage Catering',
  cost_port_suk: 'Suakin Port Entry & Exit', cost_comm_suk30: 'Suakin Agency Commission 30%', cost_comm_suk: 'Suakin Agency Commission (cargo & passengers)',
};
const REV_EN: Record<string, string> = { truck: 'Truck Freight', veh: 'Vehicle Freight', pass: 'Passenger Fares', cargo: 'Cargo Freight (trucks · trailers · cars)' };
const AGENT_EN: Record<string, string> = {
  'وكيل بدوي': 'Badawi Agency', 'وكيل البسّام': 'El-Bassam Agency', 'وكيل الاتحاد': 'Etihad Agency',
  'ذهاب جدّة ← سواكن': 'Outbound Jeddah → Suakin', 'عودة سواكن ← جدّة': 'Return Suakin → Jeddah',
};
const SEG_EN: Record<string, string> = {
  fuel: 'Bunkers Consumed', agent: 'Agency Commissions', port: 'Port & Handling', fixed: 'Fixed Operating Costs',
  purchases: 'Purchases & Services Expenses', other: 'Other',
};
/*
 * أسماء بنود المشتريات كما تأتي من القاعدة: فواتير النظام إنجليزيّةٌ غالباً، وقيود
 * QuickBooks بأسماء الخريطة العربيّة. فتُترجَم الثانية هنا، وما لم يُعرف يبقى كما هو.
 */
const ITEM_EN: Record<string, string> = {
  'صيانة وقطع غيار': 'Maintenance & Spare Parts', 'تموينات': 'Vessel Supplies', 'تموين طاقم': 'Crew Provisions',
  'إدارة فنّيّة': 'Technical Management Fees', 'زيوت': 'Lubricants', 'سمسرة صفاجا': 'Brokerage — Safaga',
  'اتّصالات': 'Communications', 'تصنيف': 'Classification', 'لوجستيّات': 'Logistics', 'برمجيّات وملاحة': 'Software & Navigation',
  'طاقم — طبّيّ': 'Crew — Medical', 'طاقم — سفر': 'Crew — Travel', 'انتقالات وإقامة': 'Transport & Accommodation',
  'تعويضات وغرامات': 'Compensation & Fines', 'مرتّبات': 'Crew Wages', 'أخرى': 'Other', 'بدون بند': 'Uncategorised',
  'إهلاك دراي دوك': 'Dry Dock Depreciation', 'متعدد البنود': 'Multiple items', 'إهلاك المركب': 'Vessel Depreciation',
};
const itemEn = (name: string) => {
  if (ITEM_EN[name]) return ITEM_EN[name];
  const t = name.replace(/^تأمين\s+/, 'Insurance — ').replace(/^إهلاك دراي دوك/, 'Dry Dock Depreciation').replace(/\s+إضافيّ\b/, ' Additional Premium');
  return t;
};
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '—');

/** مفتاح السطر الذي يجمع باقي سطر الوكلاء وفرق دفتر المركب حين لا يوجد بندٌ يحمله */
export const AGENCY_OTHER = 'agencyOther';

/**
 * البند الذي يحمل فرق دفتر المركب في جدول الوكيلين (أمر المالك ٩ نوفمبر ٢٠٢٦):
 * «Other EXPS» الذي له مبلغ عند الوارد ثمّ عند الصادر، وإلّا أكبر بنود الوارد ثمّ الصادر.
 * بندٌ قائمٌ له مبلغ دائماً — لا سطرٌ جديد يظهر بالفرق وحده.
 */
export function ledgerGapTarget(E: Record<string, number>, I: Record<string, number>): { side: 'E' | 'I'; key: string } {
  const has = (o: Record<string, number>, k: string) => Math.abs(o[k] || 0) >= 0.005;
  // «Other EXPS» له أكثر من مفتاح: `othersI` في الشيت الموحّد مقابل `otherExpsI` في الإعداد، و`others` عند بيلاجوس
  for (const k of ['otherExpsI', 'othersI', 'others']) if (has(I, k)) return { side: 'I', key: k };
  for (const k of ['otherExpsE', 'othersE', 'others']) if (has(E, k)) return { side: 'E', key: k };
  const top = (o: Record<string, number>) => Object.keys(o).filter((k) => has(o, k)).sort((x, y) => Math.abs(o[y]) - Math.abs(o[x]))[0];
  const ti = top(I);
  if (ti) return { side: 'I', key: ti };
  const te = top(E);
  return te ? { side: 'E', key: te } : { side: 'I', key: 'otherExpsI' };
}

/**
 * فرق دفتر المركب لا يظهر سطراً مستقلّاً في تفصيل الهيكل: يُضاف إلى البند نفسه الذي
 * حمله في جدول الوكيلين إن كان في مجموعته، وإلّا ضُمّ إلى باقي سطر الوكلاء في سطرٍ
 * واحد «مصاريف وكالة أخرى». مجموع المجموعة لا يتغيّر في الحالين.
 */
export function mergeLedgerGap(groups: CostDetailGroup[], targetKey?: string): CostDetailGroup[] {
  return groups.map((g) => {
    const gap = g.items.find((i) => i.kind === 'gap');
    if (!gap) return g;
    const target = targetKey ? g.items.find((i) => i.key === targetKey && !i.kind) : undefined;
    let items: CostDetailItem[];
    if (target) {
      items = g.items.filter((i) => i !== gap).map((i) => (i === target ? { ...i, value: i.value + gap.value } : i));
    } else {
      const rest = g.items.filter((i) => i.kind !== 'gap' && i.kind !== 'residual');
      const value = g.items.filter((i) => i.kind === 'gap' || i.kind === 'residual').reduce((s, i) => s + i.value, 0);
      items = Math.abs(value) >= 0.005 ? [...rest, { key: AGENCY_OTHER, label: AGENCY_OTHER, value, kind: 'residual' as const }] : rest;
    }
    return { ...g, items: items.sort((x, y) => y.value - x.value) };
  });
}

const CSS = `
@media print {
  @page { size: A4 portrait; margin: 11mm 10mm; }
  body * { visibility: hidden !important; }
  #vf-doc, #vf-doc * { visibility: visible !important; }
  #vf-doc { position: absolute; left:0; top:0; width:100%; }
  /*
   * لا فاصل صفحةٍ قسري.
   *
   * كان كل قسمٍ يبدأ ورقةً جديدة مهما قصُر، فخرج التقرير سبع ورقاتٍ كلٌّ منها
   * ممتلئةٌ إلى ثُلثها. والمستند المالي يُقرأ متّصلاً: تُمنع الجداول من الانشطار
   * ويُمنع العنوان أن ينفصل عمّا تحته، ثم يقع الفاصل حيث تنتهي الورقة فعلاً.
   */
  #vf-doc .vf-sec { break-inside: auto; }
  /*
   * الخلفيات تُطبع.
   *
   * المتصفّح يُسقط ألوان الخلفية افتراضياً عند التوليد إلى PDF. فتخرج ترويسات
   * الجداول الكحلية وسطر الصافي الأخضر وصفوف المجاميع بيضاء، ويصير المستند على
   * الورق شيئاً آخر غير الذي يُرى على الشاشة. وهذه القاعدة تُلزمه بطباعتها.
   */
  #vf-doc, #vf-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #vf-doc tr, #vf-doc .note { break-inside: avoid; page-break-inside: avoid; }
  #vf-doc h2, #vf-doc h3 { break-after: avoid; page-break-after: avoid; }
}
#vf-doc { color:#0f172a; font-size:9pt; line-height:1.45; background:#fff; }
/*
 * القسم يحتوي هوامش أبنائه.
 *
 * بلا ذلك يعبر الهامش السفليّ لآخر جدولٍ حدَّ القسم على الشاشة، ويسقط في نسخة
 * «حفظ باسم → PDF» التي تُثبّت ارتفاع كلّ عنصر، فتنزاح مواضع قطع الصفحات ٦ بكسل
 * عند كلّ قسم. والمسافة المرئيّة واحدةٌ في الحالتين.
 */
#vf-doc .vf-sec { display:flow-root; }
#vf-doc .dh { display:flex; align-items:center; justify-content:space-between;
  border-bottom:2.5pt solid #0f2c5c; padding-bottom:8px; margin-bottom:12px; }
#vf-doc .brand { font-size:17pt; font-weight:800; color:#0f2c5c; letter-spacing:.3pt; }
#vf-doc .brand span { color:#c8102e; }
#vf-doc .brand small { display:block; font-size:7.5pt; font-weight:600; color:#64748b; letter-spacing:1.5pt; }
#vf-doc .meta { text-align:left; font-size:8.5pt; color:#475569; line-height:1.7; }
#vf-doc .meta b { color:#0f172a; }
#vf-doc h2 { font-size:12.5pt; font-weight:800; color:#fff; background:#0f2c5c;
  padding:6px 12px; border-radius:4px; margin:0 0 10px; }
#vf-doc h3 { font-size:10pt; font-weight:700; color:#0f2c5c; background:#eef2ff;
  padding:4px 9px; border-right:3pt solid #0f2c5c; margin:14px 0 5px; }
#vf-doc table { width:100%; border-collapse:collapse; font-size:8.6pt; margin-bottom:6px; }
#vf-doc th { background:#0f2c5c; color:#fff; font-weight:700; padding:5px 8px; text-align:right; white-space:nowrap; }
#vf-doc td { padding:4px 8px; text-align:right; white-space:nowrap; border-bottom:.5pt solid #e5e9f0; }
#vf-doc tbody tr:nth-child(even) td { background:#f8fafc; }
#vf-doc tr.tot td { background:#dbe4ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #94a3b8; }

/* قائمة الدخل المتدرّجة */
#vf-doc .pl { width:100%; border-collapse:collapse; font-size:10pt; }
#vf-doc .pl td { padding:7px 12px; border-bottom:.5pt solid #e8edf5; white-space:nowrap; }
#vf-doc .pl td.lbl { text-align:right; width:46%; }
#vf-doc .pl td.amt { text-align:left; font-weight:700; font-variant-numeric:tabular-nums; width:22%; }
#vf-doc .pl td.shr { text-align:left; color:#64748b; width:14%; font-size:9pt; }
#vf-doc .pl td.ref { text-align:left; color:#7c8db5; width:18%; font-size:8pt; }
#vf-doc .pl tr.sub td { background:#f1f5f9; font-weight:800; border-top:1pt solid #94a3b8; }
#vf-doc .pl tr.fin td { background:#065f46; color:#fff; font-weight:800; font-size:11.5pt; border:none; }
#vf-doc .pl tr.neg td.amt { color:#b91c1c; }
#vf-doc .pl tr.gap td { background:#fef3c7; color:#92400e; font-weight:700; }

#vf-doc .note { font-size:8pt; color:#64748b; background:#f8fafc;
  border-right:2.5pt solid #cbd5e1; padding:6px 9px; margin:8px 0; line-height:1.6; }
#vf-doc .warn { border-right-color:#f59e0b; background:#fffbeb; color:#92400e; }
#vf-doc .cols { display:flex; gap:16px; align-items:flex-start; }
#vf-doc .cols > div { flex:1; }
#vf-doc .dn { display:flex; align-items:center; gap:16px; }
#vf-doc .dn svg { width:160px; height:160px; flex-shrink:0; }
#vf-doc .sw { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:6px; }
#vf-doc .bar { height:11px; border-radius:2px; display:block; }
#vf-doc td.code { font-weight:800; color:#0f2c5c; width:1%; text-align:center !important; }
#vf-doc table tr.sub td { background:#eef2ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #c7d2fe; }
#vf-doc table tr.gap td { background:#fef3c7; color:#92400e; }
#vf-doc .cs-detail td.item { padding-inline-start:18px; }
#vf-doc .foot { margin-top:14px; border-top:.75pt solid #cbd5e1; padding-top:6px;
  font-size:7.5pt; color:#94a3b8; display:flex; justify-content:space-between; }
#vf-doc table, #vf-doc .cols, #vf-doc .dn { page-break-inside:avoid; break-inside:avoid; }
/*
 * الجداول التي يطول صفّها بطول الشهر تُكسَر ويتكرّر عنوانها.
 *
 * منعُ الكسر يدفع الجدول كلّه إلى الورقة التالية فتُترك نصف صفحةٍ بيضاء —
 * وجدول الفواتير وربحية الرحلات يفعلانها كلّما زادت رحلات الشهر أو فواتيره.
 * والصفّ يبقى غير قابلٍ للكسر فلا ينشطر رقمٌ عن سطره.
 */
#vf-doc table.long { page-break-inside:auto; break-inside:auto; }
#vf-doc table.long thead { display:table-header-group; }
#vf-doc table.long tr { page-break-inside:avoid; break-inside:avoid; }

/* الاتّجاه الإنجليزيّ: ما كان يميناً يصير يساراً، والأرقام إلى اليمين */
#vf-doc.en th, #vf-doc.en td { text-align:left; }
#vf-doc.en td:not(:first-child), #vf-doc.en th:not(:first-child) { text-align:right; }
#vf-doc.en .pl td.lbl { text-align:left; }
#vf-doc.en .pl td.amt, #vf-doc.en .pl td.shr, #vf-doc.en .pl td.ref { text-align:right; }
#vf-doc.en h3 { border-right:0; border-left:3pt solid #0f2c5c; }
#vf-doc.en .note { border-right:0; border-left:2.5pt solid #cbd5e1; }
#vf-doc.en .warn { border-left-color:#f59e0b; }
#vf-doc.en .meta { text-align:right; }
#vf-doc.en .sw { margin-left:0; margin-right:6px; }
`;

export default function VesselFinReport({
  cfg, month, monthTo, monthLabel, data, purchases, exec, allocVoy, labelOf, revRows, onClose,
  costCodes = {}, defaultBuckets = {}, onSetCostCode, costCodesWarn = false, profile = DEFAULT_PROFILE,
}: Props) {
  const [showVoy, setShowVoy] = useState(true);
  const [showCodes, setShowCodes] = useState(false);
  const [codeBusy, setCodeBusy] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState('');
  const { locale } = useI18n();
  const [en, setEn] = useState(locale === 'en');
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const expLabel = (k: string) => (en ? (EXP_EN[k] || LABEL_OVERRIDE[k] || labelOf[k] || k) : (LABEL_OVERRIDE[k] || labelOf[k] || k));
  const agentName = (a: string) => (en ? (AGENT_EN[a] || a) : a);
  const itemName = (n: string) => (en ? itemEn(n) : n);
  const enMonth = (k: string) => { const [y, m] = k.split('-'); return m ? `${MONTH_EN[+m - 1]} ${y}` : k; };
  const isRange = !!monthTo && monthTo !== month;
  const period = en ? (isRange ? `${enMonth(month)} — ${enMonth(monthTo!)}` : enMonth(month)) : monthLabel;
  const periodKey = isRange ? `${month} → ${monthTo}` : month;

  const R = data.revenue || 1;
  const purchTotal = purchases?.total || 0;

  /*
   * فرق الدفتر — مدمجٌ في مصروفات الوكلاء بأمر المالك ٩ نوفمبر ٢٠٢٦.
   *
   * `BALANCE` في دفتر المركب لا يساوي مكوّناته دائماً. كان الفرق سطراً مستقلّاً
   * في قائمة الدخل ومعه حاشية، فأثار أسئلة القارئ. فصار جزءاً من سطر مصروفات
   * الوكلاء، والصافي باقٍ من `BALANCE` كما هو، فيُغلق السلّم عليه.
   */
  const bookGap = data.net - (data.revenue - (data.expE + data.expI) - data.bunkerCost - data.salaries);
  const agentExp = data.expE + data.expI - bookGap;
  // ويحمله بندٌ في جدول أحد الوكيلين، فيُطابق مجموعا الجدولين سطرَ قائمة الدخل
  const gapAt = ledgerGapTarget(data.E.exp as Record<string, number>, data.I.exp as Record<string, number>);
  const withGap = (side: 'E' | 'I', exp: Record<string, number>) =>
    side === gapAt.side && Math.abs(bookGap) >= 0.005 ? { ...exp, [gapAt.key]: (exp[gapAt.key] || 0) - bookGap } : exp;
  const expEShown = withGap('E', data.E.exp as Record<string, number>);
  const expIShown = withGap('I', data.I.exp as Record<string, number>);
  const totE = data.expE - (gapAt.side === 'E' ? bookGap : 0);
  const totI = data.expI - (gapAt.side === 'I' ? bookGap : 0);
  const gross = data.revenue - agentExp;

  const segs = useMemo(() => costSegments(exec), [exec]);
  const segTotal = segs.reduce((s, x) => s + x.value, 0) || 1;

  /*
   * تفصيل الهيكل برموزه — بأمر المالك ٢٩ سبتمبر ٢٠٢٦: كلّ بند مصروفٍ فعليّ في
   * الفترة تحت رمز مجموعته، ومجموع كلّ رمزٍ = سطره في الحلقة.
   * وفرق الدفتر يُضاف إلى البند الذي حمله في جدول الوكيلين.
   */
  const groups = useMemo(() => mergeLedgerGap(costBreakdown(exec, { purchasesByItem: purchases?.byItem }), gapAt.key), [exec, purchases, gapAt.key]);
  const groupsTotal = groups.reduce((s, g) => s + g.value, 0) || 1;
  const segName = (id: string) => {
    const o = profile.bucketNames?.[id];
    if (o) return en ? o.en : o.ar;
    const b = BUCKETS.find((x) => x.id === id);
    return en ? (SEG_EN[id] || b?.en || id) : (b?.ar || id);
  };
  // سطر C: «مشتريات العبّارة» عند بوسيدون، واسم الملفّ حين لا فواتير (مونتي)
  const purLine = profile.invoices
    ? T('مشتريات العبّارة / مصاريف أخرى (قسط الشهر)', 'Purchases & Services Expenses (monthly charge)')
    : T(profile.purchases.ar, profile.purchases.en);
  const purShort = profile.invoices ? T('مشتريات العبّارة', 'Purchases & services') : segName('purchases');
  const pre = profile.preLine, preV = pre?.value || 0;
  const detailLabel = (key: string, label: string, kind?: string) => {
    if (key === 'fuel') return profile.bunkerStock
      ? T('البنكر المستهلك (أول المدة + التموينات − آخر المدة)', 'Bunkers consumed (opening + supplied − closing)')
      : T('الوقود المستهلك (الرحلات بالمتوسّط المرجَّح + التموضع)', 'Fuel consumed (voyages at weighted average + positioning)');
    if (key === 'salaries') return T('مرتبات الطاقم', 'Crew wages');
    if (key.startsWith('item:')) return itemName(label);
    if (key === 'purchases') return kind === 'residual'
      ? T('مشتريات لم تُنسب إلى بند', 'Purchases not assigned to an item')
      : T('مشتريات العبّارة / مصاريف أخرى', 'Purchases & services');
    if (key === AGENCY_OTHER) return T('مصاريف وكالة أخرى', 'Other agency expenses');
    if (kind === 'residual') return T('باقي سطر الوكلاء — بنودٌ دون حدّ العرض', 'Rest of the agency line — items below the display threshold');
    return expLabel(key);
  };

  /** بنود سطر الوكلاء التي يُختار رمزها، برمزها المحفوظ أو الافتراضيّ */
  const agencyItems = exec.costLines.filter((l) => !LOCKED_COST_KEYS.includes(l.key));
  const defaultCode = (key: string) => {
    const b = defaultBuckets[key] || 'other';
    return CODE_OF_BUCKET[b === 'agent' || b === 'port' ? b : 'other'];
  };
  const saveCode = async (key: string, code: string) => {
    if (!onSetCostCode) return;
    setCodeBusy(key); setCodeErr('');
    try {
      await onSetCostCode(key, code || null);
    } catch {
      setCodeErr(T('تعذّر حفظ الرمز — أعد المحاولة.', 'Could not save the code — try again.'));
    } finally {
      setCodeBusy(null);
    }
  };

  /*
   * الفواتير مجمَّعة تحت بنودها بترتيب جدول البنود نفسه.
   *
   * فيُتحقَّق كل رقمٍ من الورق: مجموع سطور البند = سطره في الجدول. والفاتورة
   * متعددة البنود تدخل تحت كل بندٍ بحصّته منها لا بكامل قسطها.
   */
  const grouped = useMemo(() => {
    if (!purchases) return [];
    return purchases.byItem.map((b) => {
      const rows: { inv: PurchaseItem; share: number }[] = [];
      for (const i of purchases.items) {
        if (i.lines && i.lines.length) {
          const tot = i.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) || 1;
          const mine = i.lines
            .filter((l) => (l.item_name || 'بدون بند') === b.name)
            .reduce((s, l) => s + (Number(l.amount) || 0), 0);
          if (mine) rows.push({ inv: i, share: i.installment * (mine / tot) });
        } else if (i.item === b.name) {
          rows.push({ inv: i, share: i.installment });
        }
      }
      return { name: b.name, value: b.value, rows };
    });
  }, [purchases]);

  const maxNet = Math.max(...allocVoy.map((v) => Math.abs(v.net)), 1);

  const head = (
    <div className="dh">
      <div className="brand">UME <span>Holding</span><small>MARITIME · PMS</small></div>
      <div className="meta">
        <div>{T('المركب', 'Vessel')}: <b>{cfg.vessel}</b></div>
        <div>{T('الفترة', 'Period')}: <b>{period}</b></div>
        <div>{T('عدد الرحلات', 'Voyages')}: <b>{data.count}</b> · {T('العملة', 'Currency')}: <b>USD</b></div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{CSS}</style>

      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <span className="font-bold text-gray-800">{T('التقرير المالي (نسخة ٢)', 'Financial Report (v2)')} — {cfg.vessel} · {period}</span>
        {costCodesWarn && (
          <span role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {T('تعذّرت قراءة رموز البنود — الهيكل معروضٌ بالتصنيف الافتراضيّ.', 'Could not load item codes — the structure uses the default classification.')}
          </span>
        )}
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={showVoy} onChange={(e) => setShowVoy(e.target.checked)} />
          {T('ربحية كل رحلة', 'Per-voyage profitability')}
        </label>
        <div className="mr-auto flex gap-2">
          {onSetCostCode && (
            <button type="button" onClick={() => setShowCodes((v) => !v)} aria-expanded={showCodes}
              className="border text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
              🏷️ {T('رموز البنود', 'Item codes')}
            </button>
          )}
          <button onClick={() => setEn((v) => !v)} className="border text-sm px-3 py-2 rounded-lg hover:bg-gray-50" title={T('النسخة الإنجليزيّة', 'Arabic version')}>
            {en ? 'عربي' : 'EN'}
          </button>
          <SaveAsMenu en={en} target={() => document.getElementById('vf-doc')}
            title={`${T('التقرير المالي', 'Financial Report')} — ${cfg.vessel}`}
            fileName={`UME_${cfg.vessel}_${T('التقرير-المالي', 'Financial-Report')}_${isRange ? `${month}_${monthTo}` : month}`} />
          <button onClick={() => window.print()} className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black">{T('🖨️ طباعة / PDF', '🖨️ Print / PDF')}</button>
          <button onClick={onClose} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">{T('إغلاق', 'Close')}</button>
        </div>
      </div>

      {showCodes && onSetCostCode && (
        <div className="bg-white border-b px-4 py-3 print:hidden" dir={en ? 'ltr' : 'rtl'}>
          <p className="text-sm text-gray-600 mb-2">
            {T('اختر رمز كلّ بندٍ من بنود «مصروفات الوكلاء». يُحفظ للأسطول كلّه ويظهر في كلّ التقارير.',
              'Choose the code of each agency-expense item. It is saved for the whole fleet and shows in every report.')}
          </p>
          <p className="text-xs text-gray-500 mb-3">
            {T('B البنكر وC المشتريات وE المرتّبات سطورٌ ثابتة من قائمة الدخل، فلا تُختار هنا.',
              'B bunkers, C purchases and E crew wages are fixed income-statement lines, so they are not chosen here.')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {agencyItems.map((l) => (
              <label key={l.key} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5 text-sm">
                <span className="truncate" title={l.key}>{expLabel(l.key)}</span>
                <select value={costCodes[l.key] || ''} disabled={codeBusy === l.key}
                  onChange={(e) => saveCode(l.key, e.target.value)}
                  aria-label={expLabel(l.key)}
                  className="border rounded px-1 py-0.5 text-sm">
                  <option value="">{T('افتراضي', 'Default')} ({defaultCode(l.key)})</option>
                  {ASSIGNABLE_CODES.map((c) => (
                    <option key={c} value={c}>{c} · {segName(BUCKETS.find((b) => b.code === c)!.id)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {codeErr && <p role="alert" className="text-sm text-red-700 mt-2">{codeErr}</p>}
        </div>
      )}

      <div className="max-w-4xl mx-auto my-5 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        <div id="vf-doc" dir={en ? 'ltr' : 'rtl'} className={`p-6 print:p-0${en ? ' en' : ''}`}>
          {head}

          <h2>{T('قائمة الدخل', 'Income Statement')}</h2>
          <table className="pl">
            <tbody>
              <tr>
                <td className="lbl">{T('إجمالي الإيراد', 'Total Revenue')}</td>
                <td className="amt">{fmt(data.revenue)}</td>
                <td className="shr">100.0%</td>
                <td className="ref">{T('الإيرادات', 'Revenue analysis')}</td>
              </tr>
              <tr className="neg">
                <td className="lbl">{T('− مصروفات الوكلاء (صادر + وارد)', '− Agency & Port Expenses (Charge + Discharge)')}</td>
                <td className="amt">({fmt(agentExp)})</td>
                <td className="shr">{pct(agentExp, R)}</td>
                <td className="ref">{T('مصروفات الوكالات', 'Agency expenses')}</td>
              </tr>
              <tr className="sub">
                <td className="lbl">{T('= مجمل الربح', '= Gross Profit')}</td>
                <td className="amt">{fmt(gross)}</td>
                <td className="shr">{pct(gross, R)}</td>
                <td className="ref"></td>
              </tr>
              <tr className="neg">
                <td className="lbl">{T('− البنكر المستهلك', '− Cost of Bunkers Consumed')}</td>
                <td className="amt">({fmt(data.bunkerCost)})</td>
                <td className="shr">{pct(data.bunkerCost, R)}</td>
                <td className="ref">{T('البنكر والمرتبات', 'Bunkers & crew wages')}</td>
              </tr>
              <tr className="neg">
                <td className="lbl">{T('− مرتبات الشهر', '− Crew Wages')}</td>
                <td className="amt">({fmt(data.salaries)})</td>
                <td className="shr">{pct(data.salaries, R)}</td>
                <td className="ref">{T('البنكر والمرتبات', 'Bunkers & crew wages')}</td>
              </tr>
              <tr className="sub">
                <td className="lbl">{profile.invoices ? T('= صافي الربح قبل المشتريات', '= Operating Profit before Purchases') : T(`= صافي الربح قبل ${segName('purchases')}`, `= Operating Profit before ${segName('purchases')}`)}</td>
                <td className="amt">{fmt(data.net)}</td>
                <td className="shr">{pct(data.net, R)}</td>
                <td className="ref"></td>
              </tr>
              <tr className="neg">
                <td className="lbl">− {purLine}</td>
                <td className="amt">({fmt(purchTotal - preV)})</td>
                <td className="shr">{pct(purchTotal - preV, R)}</td>
                <td className="ref">{purShort}</td>
              </tr>
              {pre && (
                <tr className="neg">
                  <td className="lbl">− {T(pre.ar, pre.en)}</td>
                  <td className="amt">({fmt(preV)})</td>
                  <td className="shr">{pct(preV, R)}</td>
                  <td className="ref">{T('لا توزَّع على الرحلات', 'Not allocated to voyages')}</td>
                </tr>
              )}
              <tr className="fin">
                <td className="lbl">{T('= صافي الربح النهائي', '= Net Profit')}</td>
                <td className="amt">{fmt(data.net - purchTotal)}</td>
                <td className="shr">{pct(data.net - purchTotal, R)}</td>
                <td className="ref"></td>
              </tr>
            </tbody>
          </table>

          <div className="note">
            {en ? (
              <>All percentages are of total revenue. Average per voyage: revenue <b>{fmt(data.revenue / (data.count || 1))}</b> · net profit <b>{fmt((data.net - purchTotal) / (data.count || 1))}</b> over {data.count} voyage{data.count === 1 ? '' : 's'}.</>
            ) : (
              <>كل نسبةٍ محسوبةٌ من إجمالي الإيراد. ومتوسط الرحلة الواحدة: إيراد <b>{fmt(data.revenue / (data.count || 1))}</b> · صافي نهائي <b>{fmt((data.net - purchTotal) / (data.count || 1))}</b> على {data.count} رحلة.</>
            )}
          </div>

          {/* ── ص٢ · تحليل الإيرادات ── */}
          <div className="vf-sec">
            <h2>{T('Analysis · الإيرادات', 'Revenue Analysis')}</h2>
            <table>
              <thead><tr>
                <th scope="col">{T('البند', 'Item')}</th>
                <th scope="col">{T('صادر — عدد', 'Outbound — units')}</th><th scope="col">{T('صادر — مبلغ', 'Outbound — amount')}</th>
                <th scope="col">{T('وارد — عدد', 'Inbound — units')}</th><th scope="col">{T('وارد — مبلغ', 'Inbound — amount')}</th>
                <th scope="col">{T('الإجمالي', 'Total')}</th><th scope="col">{T('٪ من الإيراد', '% of revenue')}</th>
              </tr></thead>
              <tbody>
                {revRows.map((r) => {
                  const eC = (data.E as any)[r.cKey], eA = (data.E as any)[r.key];
                  const iC = (data.I as any)[r.cKey], iA = (data.I as any)[r.key];
                  return (
                    <tr key={r.key}>
                      <td>{en ? (REV_EN[r.key] || r.label) : r.label}</td>
                      <td>{eC || '—'}</td><td>{fmt(eA)}</td>
                      <td>{iC || '—'}</td><td>{fmt(iA)}</td>
                      <td>{fmt(eA + iA)}</td><td>{pct(eA + iA, R)}</td>
                    </tr>
                  );
                })}
                {profile.shippingOrder && (
                  <tr>
                    <td>{T('إذن الشحن', 'Shipping Order Fees')}</td><td>—</td><td>{fmt(data.E.discharge)}</td>
                    <td>—</td><td>{fmt(data.I.discharge)}</td>
                    <td>{fmt(data.E.discharge + data.I.discharge)}</td>
                    <td>{pct(data.E.discharge + data.I.discharge, R)}</td>
                  </tr>
                )}
                {(data.manualRev || []).filter((r) => r.amount > 0).map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td><td>—</td><td>—</td><td>—</td><td>—</td>
                    <td>{fmt(r.amount)}</td><td>{pct(r.amount, R)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>{T('إجمالي الإيراد', 'Total Revenue')}</td><td></td><td>{fmt(data.revE)}</td>
                  <td></td><td>{fmt(data.revI)}</td><td>{fmt(data.revenue)}</td><td>100.0%</td>
                </tr>
              </tbody>
            </table>

          </div>

          {/* ── ص٣ · مصروفات الوكالات · والبنكر ── */}
          <div className="vf-sec">
            <h2>{T('مصروفات الوكالات', 'Agency & Port Expenses')}</h2>
            <div className="cols">
              <div>
                <h3>{T('الصادر', 'Outbound')} — {agentName(cfg.agentExport)}</h3>
                <table>
                  <thead><tr><th scope="col">{T('المصروف', 'Expense')}</th><th scope="col">{T('المبلغ', 'Amount')}</th><th scope="col">%</th></tr></thead>
                  <tbody>
                    {Object.entries(expEShown).filter(([, v]) => Math.abs(v) >= 0.005).map(([k, v]) => (
                      <tr key={k}><td>{expLabel(k)}</td><td>{fmt(v)}</td><td>{pct(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>{T('الإجمالي', 'Total')}</td><td>{fmt(totE)}</td><td>{pct(totE, R)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3>{T('الوارد', 'Inbound')} — {agentName(cfg.agentImport)}</h3>
                <table>
                  <thead><tr><th scope="col">{T('المصروف', 'Expense')}</th><th scope="col">{T('المبلغ', 'Amount')}</th><th scope="col">%</th></tr></thead>
                  <tbody>
                    {Object.entries(expIShown).filter(([, v]) => Math.abs(v) >= 0.005).map(([k, v]) => (
                      <tr key={k}><td>{expLabel(k)}</td><td>{fmt(v)}</td><td>{pct(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>{T('الإجمالي', 'Total')}</td><td>{fmt(totI)}</td><td>{pct(totI, R)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h2 style={{ marginTop: 18 }}>{T('البنكر والمرتبات', 'Bunkers & Crew Wages')}</h2>
            <h3>{T('البنكر', 'Bunkers')}</h3>
            {profile.bunkerStock ? (<>
            <table>
              <thead><tr>
                <th scope="col">{T('رصيد أول المدة', 'Opening stock')}</th><th scope="col">{T('+ تموينات الشهر', '+ Supplied during the month')}</th>
                <th scope="col">{T('− رصيد آخر المدة', '− Closing stock')}</th><th scope="col">{T('= المستهلك', '= Consumed')}</th>
              </tr></thead>
              <tbody><tr>
                <td>{fmt(data.opening)}</td><td>{fmt(data.supplies)}</td>
                <td>{fmt(data.closing)}</td><td><b>{fmt(data.bunkerCost)}</b></td>
              </tr></tbody>
            </table>
            <div className="note">
              {en
                ? <>The month is charged with bunkers <b>consumed</b>, not purchased. Closing stock is carried forward as the next month&apos;s opening stock.</>
                : <>المُحمَّل على الشهر هو <b>المستهلك</b> لا المُشترى. ورصيد آخر المدة يُرحَّل رصيداً افتتاحياً للشهر التالي.</>}
            </div>
            </>) : (<>
              <table>
                <tbody>
                  {(profile.bunkerRows || []).map((r) => <tr key={r.ar}><td>{T(r.ar, r.en)}</td><td>{fmt(r.value)}</td></tr>)}
                  <tr className="tot"><td>{T('= المستهلك', '= Consumed')}</td><td>{fmt(data.bunkerCost)}</td></tr>
                </tbody>
              </table>
              {profile.bunkerNote && <div className="note">{T(profile.bunkerNote.ar, profile.bunkerNote.en)}</div>}
            </>)}

            <h3>{T('مرتبات الشهر', 'Crew Wages')}</h3>
            <table><tbody><tr><td>{T('مرتبات الطاقم المحمّلة', 'Crew wages charged to the month')}</td><td>{fmt(data.salaries)}</td></tr></tbody></table>

          </div>

          {/* ── ص٤ · مشتريات العبّارة ── */}
          <div className="vf-sec">
            <h2>{profile.invoices ? T('مشتريات العبّارة / مصاريف أخرى', 'Purchases & Services Expenses') : segName('purchases')}</h2>
            <h3>{T('الإجمالي حسب البند', 'Total by item')}</h3>
            <table>
              <thead><tr><th scope="col">{T('البند', 'Item')}</th><th scope="col">{T('قسط الشهر (USD)', 'Monthly charge (USD)')}</th><th scope="col">{T('٪ من المشتريات', '% of purchases')}</th></tr></thead>
              <tbody>
                {(purchases?.byItem || []).map((b) => (
                  <tr key={b.name}><td>{itemName(b.name)}</td><td>{fmt(b.value)}</td><td>{pct(b.value, purchTotal || 1)}</td></tr>
                ))}
                <tr className="tot"><td>{T('الإجمالي', 'Total')}</td><td>{fmt(purchTotal)}</td><td>100.0%</td></tr>
              </tbody>
            </table>

            {profile.invoices && (<>
            <h3>{T('الفواتير مجمَّعة تحت بنودها — بالترتيب نفسه', 'Invoices grouped under their items — same order')}</h3>
            <div className="note">
              {en
                ? <>Each group total equals its line in the table above, so every figure can be verified on paper. A multi-item invoice appears under each item with its share of the charge, not the full instalment.</>
                : <>مجموع كل مجموعةٍ يساوي سطرها في الجدول أعلاه، فيُتحقَّق الرقم من الورق. والفاتورة متعددة البنود تظهر تحت كل بندٍ بحصّته منها لا بكامل قسطها.</>}
            </div>
            {grouped.length ? grouped.map((g) => (
              <table className="long" key={g.name}>
                <thead><tr>
                  <th scope="col" colSpan={4}>{itemName(g.name)}</th>
                  <th scope="col" style={{ textAlign: en ? 'right' : 'left' }}>{fmt(g.value)}</th>
                </tr></thead>
                <tbody>
                  <tr style={{ fontSize: '7.8pt', color: '#64748b' }}>
                    <td>{T('رقم الفاتورة', 'Invoice no.')}</td><td>{T('التاريخ', 'Date')}</td><td>{T('المورد', 'Supplier')}</td>
                    <td>{T('المبلغ الأصلي · الإهلاك', 'Original amount · amortisation')}</td><td>{T('حصّة البند (USD)', 'Item share (USD)')}</td>
                  </tr>
                  {g.rows.map(({ inv, share }) => (
                    <tr key={inv.id + g.name}>
                      <td data-x="text">{inv.number}{inv.amount < 0 ? T(' (إشعار دائن)', ' (credit note)') : ''}</td>
                      <td>{inv.date || '—'}</td>
                      <td>{inv.supplier}</td>
                      <td>{fmt(inv.amount)} {inv.currency} · {inv.nMonths > 1 ? `${inv.seq}/${inv.nMonths}` : T('كامل', 'in full')}</td>
                      <td>{inv.missing ? T('سعر ناقص', 'rate missing') : fmt(share)}{inv.usedDefault ? ' *' : ''}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td colSpan={4}>{T('مجموع', 'Total')} {itemName(g.name)}</td>
                    <td>{fmt(g.rows.reduce((s, x) => s + x.share, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )) : <p style={{ fontSize: '8.5pt', color: '#64748b' }}>{T('لا توجد فواتير على المركب في هذا الشهر.', 'No invoices charged to the vessel this month.')}</p>}
            </>)}
          </div>

          {/*
            * ── ص٥ · Analysis ──
            *
            * وإليه نُقلت **المنقولات ومتوسطاتها** و**السيولة عند الوكلاء** بأمر
            * المالك في ٢٥ أغسطس ٢٠٢٦: كلتاهما قراءةٌ لا بندُ دخل، فموضعهما مع
            * التحليل لا بين كشوف المصروفات. والمنقولات **قبل** هيكل التكاليف.
            */}
          <div className="vf-sec">
            <h2>Analysis</h2>

            <h3>{T('المنقولات ومتوسطاتها', 'Cargo & passengers carried, with averages')}</h3>
            <table>
              <thead><tr>
                <th scope="col">{T('البند', 'Item')}</th>
                <th scope="col">{T('صادر', 'Outbound')}</th><th scope="col">{T('وارد', 'Inbound')}</th><th scope="col">{T('الإجمالي', 'Total')}</th>
                <th scope="col">{T('متوسط صادر / رحلة', 'Avg outbound / voyage')}</th><th scope="col">{T('متوسط وارد / رحلة', 'Avg inbound / voyage')}</th>
              </tr></thead>
              <tbody>
                {([
                  { label: profile.truckLabel ? T(profile.truckLabel.ar, profile.truckLabel.en) : T('شاحنات', 'Trucks'), e: data.E.truckC, i: data.I.truckC },
                  { label: T('سيارات', 'Vehicles'), e: data.E.vehC, i: data.I.vehC },
                  { label: T('ركاب', 'Passengers'), e: data.E.passC, i: data.I.passC },
                  // الطبالي حيث يحملها المصدر (مونتي من تقرير مغادرة جدّة · عمّان من تحليل وكيلها)
                  ...((data.E.palletC || data.I.palletC)
                    ? [{ label: T('طبالي', 'Pallets'), e: data.E.palletC || 0, i: data.I.palletC || 0 }] : []),
                ] as const).map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.e.toLocaleString('en-US')}</td>
                    <td>{r.i.toLocaleString('en-US')}</td>
                    <td>{(r.e + r.i).toLocaleString('en-US')}</td>
                    <td>{fmt(r.e / (data.count || 1))}</td>
                    <td>{fmt(r.i / (data.count || 1))}</td>
                  </tr>
                ))}
                {/*
                  * لا سطر إجمالي هنا — بأمر المالك.
                  * وجمعُ شاحنةٍ إلى راكبٍ إلى سيارة لا يُنتج كمّيةً ذات معنى أصلاً.
                  */}
              </tbody>
            </table>

            {profile.liquidity && (<>
            <h3>{T('السيولة عند الوكلاء', 'Cash held by agents')}</h3>
            <table>
              <thead><tr>
                <th scope="col">{agentName(cfg.agentExport)} (P−O)</th>
                <th scope="col">{agentName(cfg.agentImport)} (O)</th>
                <th scope="col">{T('إجمالي التحصيل (P)', 'Total collections (P)')}</th>
              </tr></thead>
              <tbody><tr>
                <td>{fmt(data.liqIttihad)}</td><td>{fmt(data.liqBassam)}</td><td>{fmt(data.P)}</td>
              </tr></tbody>
            </table>
            <div className="note">
              {T('السيولة رصيدٌ عند الوكيل لا مصروف — لا تدخل قائمة الدخل أعلاه.', 'Cash held by agents is a balance, not an expense — it does not enter the income statement above.')}
            </div>
            </>)}

            {showVoy && allocVoy.length > 0 && (
              <>
                <h3>{profile.invoices
                  ? T('ربحية كل رحلة — بعد توزيع البنكر والمرتبات والمشتريات', 'Per-voyage profitability — after allocating bunkers, wages and purchases')
                  : T(`ربحية كل رحلة — بعد توزيع الوقود والمرتبات و${segName('purchases')}`, `Per-voyage profitability — after allocating fuel, wages and ${segName('purchases').toLowerCase()}`)}</h3>
                <table className="long">
                  <thead><tr>
                    <th scope="col">{T('الرحلة', 'Voyage')}</th><th scope="col">{T('الإيراد', 'Revenue')}</th>
                    <th scope="col">{T('الصافي بعد التوزيع', 'Net after allocation')}</th><th scope="col">{T('هامش', 'Margin')}</th>
                    <th scope="col" style={{ width: '38%' }}>{T('الصافي', 'Net')}</th>
                  </tr></thead>
                  <tbody>
                    {allocVoy.map((v) => (
                      <tr key={v.ref}>
                        <td>{v.ref}</td>
                        <td>{fmt(v.revenue)}</td>
                        <td>{fmt(v.net)}</td>
                        <td style={{ color: '#64748b' }}>{pct(v.net, v.revenue || 1)}</td>
                        <td>
                          <span className="bar" style={{
                            width: `${(Math.abs(v.net) / maxNet) * 100}%`,
                            background: v.net >= 0 ? '#0f2c5c' : '#b91c1c',
                          }} />
                        </td>
                      </tr>
                    ))}
                    {pre && (
                      <tr>
                        <td>{T(pre.ar, pre.en)}</td>
                        <td>—</td>
                        <td>{fmt(-preV)}</td>
                        <td colSpan={2} style={{ color: '#64748b' }}>{T('لا توزَّع على الرحلات', 'Not allocated to voyages')}</td>
                      </tr>
                    )}
                    <tr className="tot">
                      <td>{T('الإجمالي', 'Total')}</td>
                      <td>{fmt(allocVoy.reduce((s, v) => s + v.revenue, 0))}</td>
                      <td>{fmt(allocVoy.reduce((s, v) => s + v.net, 0) - preV)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">
                  {profile.bunkerStock
                    ? T('البنكر والمرتبات والمشتريات مصاريف شهرٍ لا رحلة، فتُوزَّع على الرحلات بنسبة إيراد كل رحلة. ومجموع الصافي هنا = صافي الربح النهائي في الصفحة الأولى.',
                      'Bunkers, wages and purchases are monthly costs, not voyage costs; they are allocated to voyages pro rata to each voyage\'s revenue. The net total here equals the net profit on page one.')
                    : T(`وقود كلّ رحلة عليها، ووقود التموضع بنسبة وقودها. والمرتبات و${segName('purchases')} مصاريف شهرٍ تُوزَّع بنسبة إيراد كل رحلة. ومجموع الصافي هنا = صافي الربح النهائي في الصفحة الأولى.`,
                      `Each voyage carries its own fuel, and positioning fuel pro rata to it. Wages and ${segName('purchases').toLowerCase()} are monthly costs allocated pro rata to revenue. The net total here equals the net profit on page one.`)}
                </div>
              </>
            )}

            {/*
              * هيكل التكاليف وتفصيله في ختام التقرير — بأمر المالك ٥ نوفمبر ٢٠٢٦:
              * بعد ربحية الرحلات لا قبلها، فيكون آخر ما يُقرأ على الورق.
              */}
            <h3>{T('هيكل التكاليف', 'Cost Structure')}</h3>
            <div className="dn">
              <svg viewBox="0 0 42 42" role="img" aria-label={T('توزيع التكاليف', 'Cost distribution')}>
                {(() => {
                  let off = 25;
                  return segs.map((s) => {
                    // القوس للموجب فقط؛ والسالب يظهر رقماً ونسبةً في الجدول تحته
                    const share = (Math.max(0, s.value) / segTotal) * 100;
                    const el = (
                      <circle key={s.id} cx="21" cy="21" r="15.915" fill="transparent"
                        stroke={s.color} strokeWidth="7"
                        strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={off} />
                    );
                    off -= share;
                    return el;
                  });
                })()}
              </svg>
              <table style={{ marginBottom: 0 }}>
                <tbody>
                  {segs.map((s) => (
                    <tr key={s.id}>
                      <td className="code">{s.code}</td>
                      <td><span className="sw" style={{ background: s.color }} />{en ? (SEG_EN[s.id] || s.en || s.ar) : s.ar}</td>
                      <td>{fmt(s.value)}</td>
                      <td style={{ color: s.value < 0 ? '#b91c1c' : '#64748b' }}>{((s.value / segTotal) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="tot"><td></td><td>{T('إجمالي المصروفات', 'Total Operating Costs')}</td><td>{fmt(segTotal)}</td><td>100%</td></tr>
                </tbody>
              </table>
            </div>

            <h3>{T('تفصيل هيكل التكاليف — البنود الفعليّة برموزها', 'Cost structure detail — actual items by code')}</h3>
            <table className="long cs-detail">
              <thead><tr>
                <th scope="col">{T('الرمز', 'Code')}</th><th scope="col">{T('البند', 'Item')}</th>
                <th scope="col">{T('المبلغ', 'Amount')}</th><th scope="col">%</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => [
                  <tr key={g.code} className="sub">
                    <td className="code">{g.code}</td><td>{segName(g.id)}</td>
                    <td>{fmt(g.value)}</td><td>{pct(g.value, groupsTotal)}</td>
                  </tr>,
                  ...g.items.map((it) => (
                    <tr key={`${g.code}:${it.key}`} className={it.kind === 'gap' ? 'gap' : undefined}>
                      <td className="code">{g.code}</td>
                      <td className="item">{detailLabel(it.key, it.label, it.kind)}</td>
                      <td>{fmt(it.value)}</td>
                      <td style={{ color: '#64748b' }}>{pct(it.value, g.value || 1)}</td>
                    </tr>
                  )),
                ])}
                <tr className="tot"><td></td><td>{T('إجمالي المصروفات', 'Total Operating Costs')}</td><td>{fmt(groupsTotal)}</td><td>100%</td></tr>
              </tbody>
            </table>
            <div className="note">
              {T('سطر المجموعة نسبته من إجمالي المصروفات، وسطر البند نسبته من مجموعته. ومجموع بنود كلّ رمزٍ = سطره في الحلقة أعلاه.',
                'A group line shows its share of total costs; an item line shows its share of its group. The items under each code add up to that code\'s line above.')}
            </div>
          </div>

          <div className="foot">
            <span>UME Holding · Maritime PMS — {cfg.vessel} · {period}{en ? ' · Management accounts, unaudited · USD' : ''}</span>
            <span>{periodKey}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
