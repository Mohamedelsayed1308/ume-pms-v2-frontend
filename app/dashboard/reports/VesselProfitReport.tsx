'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import VesselExecReport, { ExecData, costSegments } from './VesselExecReport';
import VesselFinReport from './VesselFinReport';
import VesselBoardReport from './VesselBoardReport';
import BassamAccountCard from './BassamAccountCard';
import { DEFAULT_RATES } from './ExchangeRatesCard';

// التوزيع الافتراضي لبنود المصروفات على مجموعات هيكل التكاليف (مفتاح البند → المجموعة)
const COST_BUCKET_DEFAULTS: Record<string, string> = {
  fuel: 'fuel', salaries: 'fixed', telcome: 'fixed', purchases: 'purchases',
  // صادر (Alcudia)
  otherExpsE: 'other', dischargeOrderTax: 'port', disShiOrder60: 'agent', frtDep: 'agent',
  vehicle12: 'agent', pks12: 'agent', broker: 'agent', egyPort: 'port',
  // وارد (Alcudia)
  comm10: 'agent', commVehicle: 'agent', comm20: 'agent', fw: 'port', specialDisc: 'other',
  elbassam: 'agent', otherExpsI: 'other', ksaPort: 'port',
  // Pelagos-specific
  comm15: 'agent', shipOrder60: 'agent', freeZone2: 'other', toursVeh12: 'agent',
  toursPks12: 'agent', cargo: 'port', others: 'other',
};

// توزيع البنكر والمرتبات والمشتريات على الرحلات — مجموع الصافي = الصافي النهائي دائماً
export type AllocMethod = 'mixed' | 'revenue' | 'equal';
export interface AllocVoyage {
  ref: string; revenue: number; supplies: number; before: number;
  allocBunker: number; allocSalaries: number; allocPurchases: number; net: number;
}
export function allocateVoyageNets(
  per: { ref: string; revenue: number; net: number; supplies: number }[],
  totals: { bunkerCost: number; salaries: number; purchasesTotal: number },
  method: AllocMethod = 'mixed',
): AllocVoyage[] {
  const n = per.length || 1;
  const sumRev = per.reduce((s, v) => s + v.revenue, 0);
  const sumSup = per.reduce((s, v) => s + (v.supplies || 0), 0);
  return per.map((v) => {
    let bW: number, oW: number;
    if (method === 'equal') { bW = 1 / n; oW = 1 / n; }
    else if (method === 'revenue') { bW = sumRev ? v.revenue / sumRev : 1 / n; oW = bW; }
    else { bW = sumSup ? (v.supplies || 0) / sumSup : 1 / n; oW = sumRev ? v.revenue / sumRev : 1 / n; }
    const allocBunker = totals.bunkerCost * bW;
    const allocSalaries = totals.salaries * oW;
    const allocPurchases = totals.purchasesTotal * oW;
    const before = v.net + (v.supplies || 0);
    const net = before - allocBunker - allocSalaries - allocPurchases;
    return { ref: v.ref, revenue: v.revenue, supplies: v.supplies || 0, before, allocBunker, allocSalaries, allocPurchases, net };
  });
}

// ── per-vessel configuration ──
export interface ExpItem { key: string; label: string; col: number }
export interface VesselConfig {
  vessel: string;      // save key + display
  sheetKey: string;    // UPPERCASE token to locate the data sheet
  agentExport: string; // e.g. وكيل الاتحاد
  agentImport: string; // e.g. وكيل البسّام
  linkInvoices?: boolean;  // اربط فواتير المشتريات واطرحها من صافي التشغيل
  dbVesselName?: string;   // اسم السفينة في قاعدة البيانات (لجلب فواتيرها)
  salariesByMonth?: Record<string, number>; // مرتبات افتراضية لكل شهر ('YYYY-MM' → USD)
  bassamAccount?: boolean; // زر حساب وكيل البسّام داخل الكارت
  bassamStorageKey?: string; // مفتاح تخزين حساب البسّام المستقل (افتراضي BassamAccount)
  hideAgentLiquidity?: boolean; // إخفاء عرض السيولة عند الوكلاء
  col: {
    type: number; ref: number; date: number; collection: number;
    truckC: number; truck: number; vehC: number; veh: number;
    passC: number; pass: number; houryaC: number; discharge: number;
    O: number; P: number; bunker: number; balance: number; bassamLiq?: number;
  };
  exportExp: ExpItem[];
  importExp: ExpItem[];
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * بوسيدون — كارتٌ تشغيليٌّ بقرار المالك في ٢٦ أغسطس ٢٠٢٦
 *
 * ── ولماذا «تشغيليٌّ» وحدها ──
 * بوسيدون ليس كألكوديا: هو مركب شراكةٍ على خطّ ضبا/سفاجا، وربحه يمرّ أصلاً في
 * شاشة توزيع الأرباح — نقد ضبا وتحصيل صفاجا والـ Over Pax وحصص الشريكين.
 *
 * وهذا الكارت **لا يمسّ شيئاً من ذلك**. سؤالُه واحد: «كم ربح المركب هذا الشهر؟»
 * فعرضُ رقمٍ واحدٍ في شاشتين يجعل من يقرأ إحداهما يظنّ الأخرى خطأً.
 *
 * ── والبنود مطابقةٌ لألكوديا ──
 * لا نسخاً بالظنّ: قُورن رأسا الدفترين في الشيت الموحّد عموداً بعمود
 * (`تقرير POSEIDON` و`تقرير ALCUDIA`) فتطابقا حرفاً بحرف.
 *
 * ── وسبعةُ بنودٍ صفرٌ في رحلاته الـ١٨٤ كلّها ──
 * `Dis/Shi Order 60%` و`Frt Dep` و`Broker` و`Special Disc` وأخواتها. وتبقى
 * معروضةً بصفرها: حذفُها يُخفي بنداً إن بدأ الدفتر يملؤه غداً.
 *
 * ── ولا كارت حساب بسّام ──
 * بأمر المالك. فـ `bassamAccount` غائبٌ عمداً لا سهواً.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const POSEIDON: VesselConfig = {
  vessel: 'Poseidon', sheetKey: 'POSEIDON', agentExport: 'وكيل بدوي', agentImport: 'وكيل البسّام',
  /*
   * خريطة الأعمدة منسوخةٌ من ألكوديا.
   *
   * وهي تخصّ **الرفع اليدويّ من إكسيل وحده** — وهو طريقٌ بديلٌ لم يعد يُسلك،
   * فالشيت الموحّد هو المصدر. ولم تُجرَّب على ملفّ بوسيدون: فإن رُفع يوماً ملفٌّ
   * يدويّاً وخرجت أرقامٌ غريبة، فهنا يُبدأ البحث.
   */
  col: { type: 0, ref: 1, date: 3, collection: 4, truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12, O: 14, P: 15, bunker: 25, balance: 35, bassamLiq: 36 },
  exportExp: [
    { key: 'otherExpsE', label: 'Other EXPS', col: 24 },
    { key: 'dischargeOrderTax', label: 'Discharge Order Tax', col: 26 },
    { key: 'disShiOrder60', label: 'Dis/Shi Order 60%', col: 27 },
    { key: 'frtDep', label: 'Frt Dep 6.5%+500', col: 28 },
    { key: 'vehicle12', label: 'Vehicle 12%', col: 29 },
    { key: 'pks12', label: 'PKS 12%', col: 30 },
    { key: 'broker', label: 'Broker Commission', col: 31 },
    { key: 'egyPort', label: 'ميناء مصر', col: 33 },
    /*
     * ── وهنا يفترق عن ألكوديا ──
     * `ميناء السعودية` مقروءٌ من رِجل الوارد وحدها هناك، وهو صحيحٌ لها: `pk_E`
     * صفرٌ في رحلات ألكوديا وبيلاجوس كلّها (٤١٣ رحلة).
     *
     * وبوسيدون يسجّل منه على رِجل الصادر **١١٦٬٦٤٣.٧٠ في ١٦ رحلة** — فنسخُ
     * الخريطة حرفيّاً كان يُسقطها صامتةً، ويُظهر مصروفاتٍ أقلّ وربحاً أعلى.
     */
    { key: 'ksaPortE', label: 'ميناء السعودية', col: 32 },
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
    // وبالمثل في الاتّجاه الآخر: صفرٌ اليوم، فلا يسقط غداً.
    { key: 'egyPortI', label: 'ميناء مصر', col: 33 },
  ],
};

export const PELAGOS: VesselConfig = {
  vessel: 'Pelagos', sheetKey: 'PELAGOS', agentExport: 'وكيل الاتحاد', agentImport: 'وكيل البسّام',
  bassamAccount: true, bassamStorageKey: 'BassamAccountPelagos',
  // الأرقام أصفار الأساس (A=0): O=14, P=15, bunker=X, balance=AG, bassamLiq=AN
  col: { type: 0, ref: 1, date: 3, collection: 4, truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12, O: 14, P: 15, bunker: 23, balance: 32, bassamLiq: 39 },
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
  vessel: 'Alcudia', sheetKey: 'ALCUDIA', agentExport: 'وكيل بدوي', agentImport: 'وكيل البسّام',
  linkInvoices: true, dbVesselName: 'Alcudia Express', bassamAccount: true, hideAgentLiquidity: true,
  salariesByMonth: {
    '2026-01': 110871.89, '2026-02': 99685.48, '2026-03': 107177.70,
    '2026-04': 142512.74, '2026-05': 104033.26, '2026-06': 104334.94,
  },
  col: { type: 0, ref: 1, date: 3, collection: 4, truckC: 5, truck: 6, vehC: 7, veh: 8, passC: 9, pass: 10, houryaC: 11, discharge: 12, O: 14, P: 15, bunker: 25, balance: 35, bassamLiq: 36 },
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
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// فرق الشهور: b − a (بالشهور)
const monthDiff = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
};

interface Side {
  truckC: number; truck: number; vehC: number; veh: number; passC: number; pass: number; houryaC: number; discharge: number;
  exp: Record<string, number>;
}
interface Voyage { ref: any; month: string | null; monthAlt: string | null; date?: string; E: Side; I: Side; bunker: number; net: number; O: number; P: number; bassamLiq: number; }
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
    if (!voy[key]) voy[key] = { ref: cur, month: null, monthAlt: null, E: emptySide(), I: emptySide(), bunker: 0, net: 0, O: 0, P: 0, bassamLiq: 0 };
    const V = voy[key];
    const side = t === 'Exp.' ? V.E : V.I;
    // الشهر من صف المغادرة (Exp.)، ولو تاريخه فاضي نرجع لتاريخ صف الوصول (Imp.) بدل حذف الرحلة بالكامل
    if (typeof row[C.date] === 'number') {
      if (t === 'Exp.') { if (V.month == null) V.month = serialToMonth(row[C.date]); }
      else if (V.monthAlt == null) V.monthAlt = serialToMonth(row[C.date]);
    }
    side.truckC += num(row[C.truckC]); side.truck += num(row[C.truck]);
    side.vehC += num(row[C.vehC]); side.veh += num(row[C.veh]);
    side.passC += num(row[C.passC]); side.pass += num(row[C.pass]);
    side.houryaC += num(row[C.houryaC]); side.discharge += num(row[C.discharge]);
    V.bunker += num(row[C.bunker]);
    V.net += num(row[C.balance]);
    V.O += num(row[C.O]); V.P += num(row[C.P]);
    if (C.bassamLiq != null) V.bassamLiq += num(row[C.bassamLiq]);
    const set = t === 'Exp.' ? cfg.exportExp : cfg.importExp;
    for (const e of set) side.exp[e.key] = (side.exp[e.key] || 0) + num(row[e.col]);
  }
  return Object.values(voy)
    .map((v) => (v.month == null && v.monthAlt != null ? { ...v, month: v.monthAlt } : v))
    .filter((v) => v.month != null);
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

/** يقرأ رمز الحالة والسبب من خطأ axios بلا `any` — لا يمسّ حالةً، فمكانه هنا. */
function apiError(e: unknown) {
  const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
  return { status: err?.response?.status, why: err?.response?.data?.message || err?.message || 'سبب غير معروف' };
}

export default function VesselProfitReport({ config }: { config: VesselConfig }) {
  const cfg = config;
  /*
   * مسمّيات المصروفات.
   *
   * المفاتيح تأتي من مصدرين: إعداد الشاشة (للرفع اليدوي) وخريطة الشيت الموحّد.
   * وقد اختلف اسمٌ واحد بينهما — `othersI` في الشيت مقابل `otherExpsI` في
   * الإعداد — فظهر بندٌ بمئة وأربعة وسبعين ألفاً باسمه البرمجي في تقرير
   * يُعرض على الإدارة. فيُجسر الاختلاف هنا صراحةً بدل تغيير شكل البيانات
   * المحفوظة.
   */
  const labelOf = useMemo(() => {
    const m: Record<string, string> = {};
    [...cfg.exportExp, ...cfg.importExp].forEach((e) => { m[e.key] = e.label; });
    // فحصتُ بقيّة مفاتيح المركبين فوجدتها متطابقة — هذا وحده الشاذّ
    if (!m.othersI && m.otherExpsI) m.othersI = m.otherExpsI;
    return m;
  }, [cfg]);

  const [fileName, setFileName] = useState('');
  /*
   * مصدر الرحلات المعروض الآن.
   *
   * الشيت الموحّد هو الافتراضي — يُغذّى بسحبٍ يومي فلا يتأخّر. والرفع اليدوي
   * يبقى خطّة بديلة، لكن **المعروض يجب أن يُعلن عن نفسه**: أرقامٌ من ملفٍّ
   * رُفع قبل شهر تبدو كأرقام اليوم إن لم يقل أحدٌ إنها ليست كذلك.
   */
  const [source, setSource] = useState<'sheet' | 'upload' | 'none'>('none');
  const [syncedAt, setSyncedAt] = useState('');
  const [sheetBusy, setSheetBusy] = useState(false);
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [manual, setManual] = useState<Record<string, { opening: string; closing: string; salaries: string }>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  /*
   * هل قُرئت القيم اليدويّة من السيرفر بنجاح؟
   *
   * الحفظ `PUT` **يستبدل** `manual` كاملاً. وحين يفشل نداءُ القراءة تصير `{}`
   * في الذاكرة — فحفظٌ بعده يكتب الفراغ فوق الحقيقيّ. وقد وقع ذلك فعلاً في
   * ١٨ أغسطس ٢٠٢٦ ومُحيت بيانات ألكوديا اليدويّة.
   *
   * فلا يُكتب شيءٌ ما لم يُعرف أنّ ما بين يدينا هو المحفوظ لا فراغُ فشلٍ.
   */
  const [manualLoaded, setManualLoaded] = useState(false);
  /* حفظٌ مُنع لأنّ العدد نقص — ينتظر إذناً صريحاً */
  const [pendingSave, setPendingSave] = useState<{ list: Voyage[]; savedCount: number } | null>(null);
  const [showExec, setShowExec] = useState(false);
  // النسخة المالية — نافذة مستقلّة بجوار الأصل، فيُقارَن الشكلان قبل الاستغناء عن أحدهما
  const [showFin, setShowFin] = useState(false);
  // التقرير التنفيذي — ثالثٌ بجوار الاثنين حتى يستقرّ الشكل النهائي
  const [showBoard, setShowBoard] = useState(false);
  const [showBassam, setShowBassam] = useState(false);

  // فواتير المشتريات + أسعار الصرف (لو المركب مربوط بالفواتير)
  const [invoices, setInvoices] = useState<any[]>([]);
  /*
   * جلب فواتير المركب يُبتلَع خطؤه عمداً كي يعمل التقرير بلا مشتريات. لكن ذلك
   * جعل الفشل يُقرأ «لا توجد فواتير على المركب» — نفيٌ عن المركب، وصوابه أن
   * الجلب لم يتمّ. فصارت للتحميل حالته ولا يُقال النفي قبل أن يُحسم.
   */
  const [invLoading, setInvLoading] = useState(true);
  const [rates, setRates] = useState<Record<string, Record<string, number>>>({});

  const cur = manual[month] || { opening: '', closing: '', salaries: '' };
  const setCur = (patch: Partial<{ opening: string; closing: string; salaries: string }>) =>
    setManual((m) => ({ ...m, [month]: { ...(m[month] || { opening: '', closing: '', salaries: '' }), ...patch } }));

  // المرتبات الفعّالة لشهر: اليدوي إن وُجد، وإلا القيمة الافتراضية من إعدادات المركب
  const salaryOf = (m: string) => {
    const v = manual[m]?.salaries;
    if (v !== undefined && v !== '') return v;
    const def = cfg.salariesByMonth?.[m];
    return def != null ? String(def) : '';
  };

  // الشهر السابق ('YYYY-MM')
  const prevMonthOf = (m: string) => {
    const [y, mm] = m.split('-').map(Number); const t = y * 12 + (mm - 1) - 1;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  // الرصيد الافتتاحي الفعّال: اليدوي إن وُجد، وإلا مخزون آخر المدة للشهر السابق (ترحيل)
  const openingOf = (m: string) => {
    const v = manual[m]?.opening;
    if (v !== undefined && v !== '') return v;
    const pc = manual[prevMonthOf(m)]?.closing;
    return pc !== undefined && pc !== '' ? pc : '';
  };
  // سعر صرف عملة لشهر (سعر الشهر ثم الافتراضي)
  const rateFor = (curr: string, pm: string) => {
    if (curr === 'USD') return 1;
    const mr = Number(rates[pm]?.[curr]); if (mr > 0) return mr;
    return Number(rates['default']?.[curr]) || DEFAULT_RATES[curr] || 0;
  };
  const isBunkerName = (n: string) => (n || '').toLowerCase().includes('bunker');
  const isBunkerInv = (inv: any) => isBunkerName(inv.item?.name);
  // الجزء الخاص بالبنكر من الفاتورة (بعملتها الأصلية): بند مفرد بنكر = الكل ؛ متعدد = مجموع أسطر البنكر
  const bunkerPortion = (inv: any) => {
    if (Array.isArray(inv.line_items) && inv.line_items.length) {
      return inv.line_items.filter((l: any) => isBunkerName(l.item_name)).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    }
    return isBunkerInv(inv) ? Number(inv.total_amount) : 0;
  };

  const applyVoyages = useCallback((list: Voyage[]) => {
    setVoyages(list);
    const ms = [...new Set(list.map((v) => v.month!))].sort();
    setMonth((m) => (m && ms.includes(m) ? m : ms[ms.length - 1] || ''));
  }, []);

  /** الكتابة إلى السيرفر — نقطةٌ واحدة، فالحرّاس قبلها لا داخلها. */
  const persist = useCallback(async (list: Voyage[]) => {
    setSaving(true);
    try {
      await api.put(`/api/vessel-profit/${cfg.vessel}`, { voyages: list, manual });
      setSavedMsg(`تم الجلب والحفظ ✅ — ${list.length} رحلة`);
      setTimeout(() => setSavedMsg(''), 4000);
      return true;
    } catch (e: unknown) {
      const { status, why } = apiError(e);
      const detail = status === 413
        ? `الحمولة أكبر من حدّ الخادم (${Math.round(JSON.stringify({ voyages: list, manual }).length / 1024)} ك.ب)`
        : why;
      setError(`فشل الحفظ — ${status ? status + ' · ' : ''}${detail}`);
      return false;
    } finally { setSaving(false); }
  }, [cfg.vessel, manual]);

  /**
   * جلبٌ ثمّ حفظ — فعلٌ واحدٌ مقصود.
   *
   * ── لماذا صارا واحداً ──
   * كان الزرّ يقرأ الشيت إلى الذاكرة ولا يكتب، والكتابةُ زرٌّ آخر. فمن قرأ
   * ورأى الرحلات أمامه ظنّها محفوظة — وكارت البسّام يقرأ **المحفوظ** لا
   * المعروض، فيبقى يشكو ولا يُفهم لماذا.
   *
   * ── ولماذا لا يُحفظ الجلب التلقائيّ ──
   * الشاشة تقرأ الشيت عند كلّ فتح. فلو حفظت معه لصار مجرّدُ تصفّح التقرير
   * كتابةً على الإنتاج، يفعلها كلُّ من يفتحه بلا قصد.
   *
   * ── والحرّاس ثلاثة ──
   * صفرُ رحلاتٍ يُرمى قبل أن يصل هنا · والقيم اليدويّة يجب أن تكون مقروءةً
   * لا مفترضة · والعدد الناقص يُوقف الكتابة ويسأل.
   */
  const fetchAndSave = useCallback(async () => {
    setSheetBusy(true); setError(''); setSavedMsg(''); setPendingSave(null);
    try {
      const res = await api.get(`/api/vessel-profit/${cfg.vessel}/from-sheet`);
      const list = (res.data?.voyages || []) as Voyage[];
      if (!list.length) throw new Error('لا رحلات لهذا المركب في الشيت');

      applyVoyages(list);
      setSource('sheet');
      setSyncedAt(res.data?.fetchedAt || '');
      setFileName('');

      // حارس ١ — لا يُكتب فوق قيمٍ يدويّةٍ لم تُقرأ
      if (!manualLoaded) {
        setError('الجلب تمّ ولم يُحفظ: القيم اليدويّة لم تُقرأ من السيرفر، والحفظ كان سيمحوها. حدّث الصفحة ثم أعد المحاولة.');
        return;
      }

      // حارس ٢ — العدد الناقص يُوقف الكتابة ويسأل
      const saved = await api.get(`/api/vessel-profit/${cfg.vessel}`).catch(() => null);
      const savedCount = Array.isArray(saved?.data?.voyages) ? saved!.data.voyages.length : 0;
      if (savedCount > list.length) { setPendingSave({ list, savedCount }); return; }

      await persist(list);
    } catch (e: unknown) {
      setError(apiError(e).why || 'تعذّرت القراءة من الشيت');
    } finally { setSheetBusy(false); }
  }, [cfg.vessel, applyVoyages, manualLoaded, persist]);

  /*
   * الشيت أولاً، والمحفوظ عند تعذّره.
   *
   * القيم اليدوية (الافتتاحي والختامي والمرتبات) تُجلب من المحفوظ **دائماً**
   * مهما كان مصدر الرحلات: مصدرها الشاشة لا دفتر المركب، وربطُها بمصدر
   * الرحلات كان يُضيّعها كلّما بُدّل المصدر.
   */
  const loadFromSheet = useCallback(async (silent = false) => {
    if (!silent) setSheetBusy(true);
    try {
      const res = await api.get(`/api/vessel-profit/${cfg.vessel}/from-sheet`);
      const list = (res.data?.voyages || []) as Voyage[];
      if (!list.length) throw new Error('لا رحلات لهذا المركب في الشيت');
      applyVoyages(list);
      setSource('sheet');
      setSyncedAt(res.data?.fetchedAt || '');
      setFileName('');
      setError('');
      return true;
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.message || e?.message || 'تعذّرت القراءة من الشيت');
      return false;
    } finally {
      setSheetBusy(false);
    }
  }, [cfg.vessel, applyVoyages]);

  // reset + الشيت أولاً، فإن تعذّر فالمحفوظ
  useEffect(() => {
    let alive = true;
    setVoyages([]); setMonth(''); setFileName(''); setError(''); setSource('none'); setSyncedAt(''); setManualLoaded(false); setPendingSave(null);
    (async () => {
      try {
        const saved = await api.get(`/api/vessel-profit/${cfg.vessel}`);
        if (alive) { setManual(saved.data?.manual || {}); setManualLoaded(true); }
      } catch { if (alive) { setManual({}); setManualLoaded(false); } }

      const ok = await loadFromSheet(true);
      if (!alive || ok) return;

      try {
        const d = (await api.get(`/api/vessel-profit/${cfg.vessel}`)).data;
        if (!alive) return;
        if (d && Array.isArray(d.voyages) && d.voyages.length) {
          applyVoyages(d.voyages as Voyage[]);
          setSource('upload');
          setSyncedAt(d.updated_at || '');
          setFileName('محفوظ في السيرفر');
        }
      } catch { /* لا مصدر — الشاشة تعرض حالتها الفارغة */ }
    })();
    return () => { alive = false; };
  }, [cfg.vessel, loadFromSheet, applyVoyages]);

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
      finally { setInvLoading(false); }
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
      applyVoyages(parsed);
      setFileName(file.name);
      setSource('upload');
      setSyncedAt('');
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
    } catch (e: any) {
      /*
       * السبب يُعرض لا يُبتلع.
       *
       * «فشل الحفظ» وحدها أخفت 413 — الحمولة تجاوزت حدّ الخادم — فبدا العطل
       * عابراً وهو دائم ويزداد مع كل رحلة تُضاف.
       */
      const st = e?.response?.status;
      const why = st === 413 ? `الحمولة أكبر من حدّ الخادم (${Math.round(JSON.stringify({ voyages, manual }).length / 1024)} ك.ب)`
        : e?.response?.data?.message || e?.message || 'سبب غير معروف';
      setSavedMsg(`فشل الحفظ — ${st ? st + ' · ' : ''}${why}`);
    }
    finally { setSaving(false); }
  }

  const months = useMemo(() => [...new Set(voyages.map((v) => v.month!))].sort(), [voyages]);

  /*
   * أحدث رحلةٍ في المصدر — لا أحدث رحلةٍ في الشهر المعروض.
   *
   * السؤال الذي تُجيبه: «هل وصلت رحلات هذا الأسبوع؟». والشهر المختار لا يُجيبه،
   * لأن من يتصفّح يناير لا يرى أن أغسطس توقّف عن الوصول.
   *
   * والترتيب بالتاريخ لا بالرقم: الأرقام تعود إلى ١ كل سنة.
   */
  const latest = useMemo(() => {
    let best: Voyage | null = null;
    for (const v of voyages) {
      const d = v.date || v.month || '';
      if (!d) continue;
      const bd = best ? (best.date || best.month || '') : '';
      if (!best || d > bd) best = v;
    }
    return best;
  }, [voyages]);
  const sel = useMemo(() => voyages.filter((v) => v.month === month), [voyages, month]);

  // فواتير البنكر للشهر (بند = Bunker) — بالدولار، تُحمّل كاملة في شهرها (بدون إهلاك)
  const bunkerInvoiceUSD = useMemo(() => {
    if (!cfg.linkInvoices || !month) return 0;
    let sum = 0;
    for (const inv of invoices) {
      const pm = (inv.invoice_date || '').slice(0, 7);
      if (pm !== month) continue;
      const bp = bunkerPortion(inv);
      if (bp <= 0) continue;
      const rate = rateFor(inv.currency || 'USD', pm);
      if (rate > 0) sum += bp / rate;
    }
    return sum;
  }, [cfg.linkInvoices, invoices, rates, month]);

  const data = useMemo(() => {
    if (!sel.length) return null;
    const E = aggSide(sel, 'E'), I = aggSide(sel, 'I');
    const revE = sideRevenue(E), revI = sideRevenue(I);
    const expE = Object.values(E.exp).reduce((a, b) => a + b, 0);
    const expI = Object.values(I.exp).reduce((a, b) => a + b, 0);
    const suppliesExcel = sel.reduce((s, v) => s + v.bunker, 0);
    const supplies = suppliesExcel + bunkerInvoiceUSD; // تموينات الشهر = إكسيل + فواتير البنكر
    const netBalance = sel.reduce((s, v) => s + v.net, 0);
    const O = sel.reduce((s, v) => s + v.O, 0);
    const P = sel.reduce((s, v) => s + v.P, 0);
    const revenue = revE + revI;
    const opening = parseFloat(openingOf(month)) || 0;
    const closing = parseFloat(manual[month]?.closing ?? '') || 0;
    const bunkerCost = opening + supplies - closing;
    const salariesN = parseFloat(salaryOf(month)) || 0;
    const net = netBalance - opening + closing - salariesN - bunkerInvoiceUSD;
    return {
      E, I, revE, revI, expE, expI, suppliesExcel, bunkerInvoiceUSD, supplies, opening, closing, bunkerCost, salaries: salariesN,
      net, O, P, revenue, count: sel.length, expenses: revenue - net,
      liqBassam: O, liqIttihad: P - O,
    };
  }, [sel, manual, month, bunkerInvoiceUSD]);

  // بند المشتريات (فواتير المركب) — قسط ثابت بالدولار محوّل بسعر صرف شهر الشراء
  const purchases = useMemo(() => {
    if (!cfg.linkInvoices || !month) return null;
    const items = invoices
      .map((inv) => {
        const pm = (inv.invoice_date || '').slice(0, 7);
        if (!pm) return null;
        // استبعاد جزء البنكر (بيتحمّل على بند البنكر) — الباقي مشتريات
        const purchAmount = Number(inv.total_amount) - bunkerPortion(inv);
        // يُستبعد فقط ما لا يتبقّى منه شيء (فاتورة بنكر بالكامل).
        // المبلغ السالب = إشعار دائن ويجب أن يظل ليخصم من المشتريات.
        if (Math.abs(purchAmount) <= 0.005) return null;
        const nMonths = inv.depreciation_months && inv.depreciation_months > 1 ? inv.depreciation_months : 1;
        const diff = monthDiff(pm, month);
        if (diff < 0 || diff >= nMonths) return null; // خارج فترة الإهلاك للشهر المختار
        const curr = inv.currency || 'USD';
        const monthRate = curr === 'USD' ? 1 : Number(rates[pm]?.[curr]);
        const defRate = curr === 'USD' ? 1 : (Number(rates['default']?.[curr]) || DEFAULT_RATES[curr] || 0);
        const rate = monthRate > 0 ? monthRate : defRate;
        const usedDefault = !(monthRate > 0) && rate > 0; // اتحسبت بسعر افتراضي
        const missing = !(rate > 0);
        const usdTotal = missing ? 0 : purchAmount / rate;
        const installment = usdTotal / nMonths;
        const allLines = Array.isArray(inv.line_items) && inv.line_items.length ? inv.line_items.filter((l: any) => !isBunkerName(l.item_name)) : null;
        const lines = allLines && allLines.length ? allLines : null;
        return {
          id: inv.id, number: inv.invoice_number, supplier: inv.supplier?.name || '—',
          item: lines ? 'متعدد البنود' : (inv.item?.name || 'بدون بند'), lines, date: (inv.invoice_date || '').slice(0, 10),
          amount: purchAmount, currency: curr, nMonths, purchaseMonth: pm,
          rate, missing, usedDefault, usdTotal, installment, seq: diff + 1,
        };
      })
      .filter(Boolean) as any[];
    const total = items.reduce((s, i) => s + i.installment, 0);
    const missingList = items.filter((i) => i.missing);
    const defaultList = items.filter((i) => i.usedDefault);
    // تجميع المشتريات حسب البند (لتقارير التكاليف) — الفاتورة متعددة البنود تتوزّع على بنودها
    const byItemMap: Record<string, number> = {};
    for (const i of items) {
      if (i.lines) {
        const totLn = i.lines.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0) || 1;
        for (const l of i.lines) byItemMap[l.item_name || 'بدون بند'] = (byItemMap[l.item_name || 'بدون بند'] || 0) + i.installment * ((Number(l.amount) || 0) / totLn);
      } else {
        byItemMap[i.item] = (byItemMap[i.item] || 0) + i.installment;
      }
    }
    const byItem = Object.entries(byItemMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { items, total, missingList, defaultList, byItem };
  }, [cfg.linkInvoices, invoices, rates, month]);

  // بيانات التقرير الإداري (شرائح العرض)
  const execData = useMemo<ExecData | null>(() => {
    if (!data) return null;
    const perVoyage = [...sel]
      .sort((a, b) => Number(a.ref) - Number(b.ref))
      .map((v) => {
        const rev = sideRevenue(v.E) + sideRevenue(v.I);
        return { ref: String(v.ref), revenue: rev, net: v.net, expenses: rev - v.net, supplies: v.bunker };
      });
    const costLines: { key: string; label: string; value: number }[] = [];
    costLines.push({ key: 'fuel', label: 'الوقود (بنكر)', value: data.bunkerCost });
    const expKeys = new Set([...Object.keys(data.E.exp), ...Object.keys(data.I.exp)]);
    for (const k of expKeys) {
      const v = (data.E.exp[k] || 0) + (data.I.exp[k] || 0);
      if (Math.abs(v) < 0.5) continue;
      costLines.push({ key: k, label: labelOf[k] || k, value: v });
    }
    if (data.salaries > 0) costLines.push({ key: 'salaries', label: 'مرتبات', value: data.salaries });
    const purchasesTotal = purchases?.total || 0;
    if (purchasesTotal > 0) costLines.push({ key: 'purchases', label: 'المشتريات', value: purchasesTotal });
    return {
      perVoyage,
      revenue: data.revenue,
      opExpenses: data.expenses,
      opNet: data.net,
      purchasesTotal,
      bunkerCost: data.bunkerCost,
      salaries: data.salaries,
      count: data.count,
      costLines,
      defaultBuckets: COST_BUCKET_DEFAULTS,
    };
  }, [data, sel, purchases, labelOf]);

  // صافي كل رحلة بعد توزيع البنكر والمرتبات والمشتريات على كل الرحلات (حسب الإيراد)
  const allocVoy = useMemo(() => {
    if (!execData) return [];
    return allocateVoyageNets(
      execData.perVoyage,
      { bunkerCost: execData.bunkerCost, salaries: execData.salaries, purchasesTotal: execData.purchasesTotal },
      'revenue',
    );
  }, [execData]);
  const allocFinalNet = useMemo(() => allocVoy.reduce((s, v) => s + v.net, 0), [allocVoy]);
  const allocPurchasesTotal = execData?.purchasesTotal ?? 0;

  /*
   * قطاعات هيكل التكاليف — التعريف نفسه الذي يستعمله التقرير الإداري.
   *
   * يُحسب هنا مرّةً ويُعرض على الشاشة وفي الورق معاً، فلا يفترق رسمٌ عن رسم.
   */
  const costSegs = useMemo(() => (execData ? costSegments(execData) : []), [execData]);
  const costSegsTotal = useMemo(
    () => costSegs.reduce((s, x) => s + Math.max(0, x.value), 0),
    [costSegs]);

  const PRINT_CSS = `@media print {
    @page { size: A4 landscape; margin: 11mm 10mm; }
    body * { visibility: hidden !important; }
    #vp-doc, #vp-doc * { visibility: visible !important; }
    #vp-doc { position: absolute; left: 0; top: 0; width: 100%; color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 9pt; line-height: 1.35;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #vp-doc .dh { display:flex; align-items:center; justify-content:space-between; border-bottom: 2.5pt solid #0f2c5c; padding-bottom: 8px; margin-bottom: 10px; }
    #vp-doc .dh .brand { font-size: 17pt; font-weight: 800; color:#0f2c5c; letter-spacing:.3pt; }
    #vp-doc .dh .brand span { color:#c8102e; }
    #vp-doc .dh .brand small { display:block; font-size:7.5pt; font-weight:600; color:#64748b; letter-spacing:1.5pt; margin-top:1px; }
    #vp-doc .dh .meta { text-align:left; font-size: 8.5pt; color:#475569; line-height:1.7; }
    #vp-doc .dh .meta b { color:#0f172a; font-weight:700; }
    #vp-doc .dt { text-align:center; font-size: 13pt; font-weight: 800; color:#fff; background:#0f2c5c;
      padding:7px 0; margin: 0 0 12px; border-radius:4px; letter-spacing:.5pt; }
    #vp-doc .kpis { display:flex; gap:9px; margin-bottom:14px; }
    #vp-doc .kpi { flex:1; border:1pt solid #e2e8f0; border-radius:6px; padding:8px 6px; text-align:center; background:#f8fafc; }
    #vp-doc .kpi .l { font-size:7.5pt; color:#64748b; display:block; margin-bottom:3px; font-weight:600; }
    #vp-doc .kpi .v { font-size:13.5pt; font-weight:800; color:#0f172a; }
    #vp-doc .kpi.main { background:#047857; border-color:#065f46; }
    #vp-doc .kpi.main .l { color:#d1fae5; } #vp-doc .kpi.main .v { color:#fff; }
    #vp-doc .kpi.danger .v { color:#b91c1c; }
    #vp-doc h3 { font-size:10pt; font-weight:700; color:#0f2c5c; background:#eef2ff;
      margin: 13px 0 6px; padding:5px 10px; border-radius:3px; border-right:4pt solid #1d4ed8; }
    #vp-doc table { width:100%; border-collapse:collapse; font-size:8.6pt; margin-bottom:6px; }
    #vp-doc th { background:#0f2c5c; color:#fff; font-weight:700; padding:5px 8px; text-align:right; white-space:nowrap; }
    #vp-doc td { padding:4px 8px; text-align:right; white-space:nowrap; border-bottom:.5pt solid #e5e9f0; }
    #vp-doc tbody tr:nth-child(even) td { background:#f8fafc; }
    #vp-doc tr.tot td { background:#dbe4ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #94a3b8; border-bottom:none; }
    #vp-doc .cols { display:flex; gap:16px; align-items:flex-start; } #vp-doc .cols > div { flex:1; }
    #vp-doc .cstr { margin-top:12px; break-inside: avoid; page-break-inside: avoid; }
    #vp-doc .cstr .dn { display:flex; align-items:center; gap:14px; }
    #vp-doc .cstr .dn svg { width:150px; height:150px; flex-shrink:0; }
    #vp-doc .cstr .lg { flex:1; width:100%; border-collapse:collapse; font-size:8.5pt; }
    #vp-doc .cstr .lg td { padding:2px 6px; border-bottom:.5pt solid #eef2f7; }
    #vp-doc .cstr .lg td:nth-child(2) { text-align:left; white-space:nowrap; }
    #vp-doc .cstr .lg .pc { width:38px; text-align:left; color:#64748b; }
    #vp-doc .cstr .lg tr.tot td { background:#dbe4ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #94a3b8; }
    #vp-doc .cstr .sw { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:6px; vertical-align:middle; }
    #vp-doc .foot { margin-top:12px; border-top:.75pt solid #cbd5e1; padding-top:6px; font-size:7.5pt; color:#94a3b8;
      display:flex; justify-content:space-between; }
    #vp-doc table, #vp-doc .cols { page-break-inside: avoid; }
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

  // اسم مستند احترافي وقت الطباعة (يظهر في ترويسة المتصفح بدل "Create Next App")
  function printReport() {
    const prev = document.title;
    document.title = `تقرير صافي ربح ${cfg.vessel} — ${monthLabel(month)}`;
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 1500);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
        {/*
          المصدر شريطٌ عريض لا شارةٌ صغيرة.
          الأرقام نفسها لا تُفرّق بين شيتٍ حيّ وملفٍّ رُفع قبل شهر، ومن يقرأ
          التقرير يقرأ الأرقام لا الحواشي — فالإعلان يجب أن يسبقها لا أن يُجاورها.
        */}
        <div className="w-full">
          {source === 'sheet' && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-2.5">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div className="min-w-0">
                {/*
                  عدد الشهر أوّلاً لا عدد المحمَّل.
                  «144 رحلة» عددُ ما حُمِّل من الشيت، والمعروض أمام القارئ شهرٌ
                  واحد — فتصدير الرقم الكبير يوحي بأن الجداول تحته تخصّه.
                */}
                <p className="font-bold text-emerald-900 leading-tight">
                  {month ? <>{sel.length} رحلة في {monthLabel(month)}</> : <>{voyages.length} رحلة</>}
                  <span className="font-normal text-emerald-700"> — من الشيت الموحّد</span>
                </p>
                {latest && (
                  <p className="text-[12px] font-semibold text-emerald-800 mt-0.5">
                    أحدث رحلة في الشيت: <span className="font-mono">#{String(latest.ref)}</span>
                    {latest.date && <> · {latest.date}</>}
                  </p>
                )}
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  {voyages.length} رحلة محمّلة{months.length ? <> · {monthLabel(months[0])} → {monthLabel(months[months.length - 1])}</> : null}
                  {syncedAt && <>{' · '}قُرئت {new Date(syncedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</>}
                  {' · '}تُحدَّث ثلاث مرّات يومياً
                </p>
              </div>
              <button type="button" onClick={fetchAndSave} disabled={sheetBusy || saving}
                title="يقرأ الشيت ويحفظ النتيجة في السيرفر — فما تراه هو ما تقرؤه بقيّة الشاشات"
                className="ms-auto shrink-0 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {sheetBusy || saving ? 'جارٍ…' : '🔄 جلب وحفظ'}
              </button>
            </div>
          )}

          {source === 'upload' && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2.5">
              <span className="text-2xl leading-none shrink-0">⚠️</span>
              <div className="min-w-0">
                <p className="font-bold text-amber-900 leading-tight">
                  {month ? <>{sel.length} رحلة في {monthLabel(month)}</> : <>{voyages.length} رحلة</>}
                  <span className="font-normal text-amber-800"> — من ملفٍّ مرفوع يدوياً</span>
                </p>
                {latest && (
                  <p className="text-[12px] font-semibold text-amber-900 mt-0.5">
                    أحدث رحلة في الملفّ: <span className="font-mono">#{String(latest.ref)}</span>
                    {latest.date && <> · {latest.date}</>}
                  </p>
                )}
                <p className="text-[11px] text-amber-800 mt-0.5 truncate">
                  {voyages.length} رحلة محمّلة · 📄 {fileName || 'ملف مرفوع'} — قد لا يكون محدَّثاً.
                  المصدر المعتمد هو الشيت الموحّد.
                </p>
              </div>
              <button type="button" onClick={fetchAndSave} disabled={sheetBusy || saving}
                className="ms-auto shrink-0 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {sheetBusy || saving ? 'جارٍ…' : '🔄 جلب وحفظ من الشيت'}
              </button>
            </div>
          )}

          {source === 'none' && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-2.5">
              <span className="text-xl leading-none shrink-0">⏳</span>
              <p className="font-semibold text-gray-600">لا مصدر بيانات بعد</p>
              <button type="button" onClick={fetchAndSave} disabled={sheetBusy || saving}
                className="ms-auto shrink-0 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {sheetBusy || saving ? 'جارٍ…' : '🔄 جلب وحفظ من الشيت'}
              </button>
            </div>
          )}

          {/*
            * الحفظ مُنع — والسؤال قبل الكتابة لا بعدها.
            *
            * `PUT` يستبدل الرحلات كلَّها، فقراءةٌ جزئيّةٌ من الشيت تمحو ما لا
            * تحمله. والشاشة تعرض الجديد، **والمحفوظ لم يُمسّ** — فالتراجع
            * إغلاقُ الصفحة لا أكثر.
            */}
          {pendingSave && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3">
              <p className="font-bold text-red-900">⛔ الحفظ مُنع — عدد الرحلات نقص</p>
              <p className="text-sm text-red-800 mt-1">
                الشيت أعطى <b className="font-mono">{pendingSave.list.length}</b> رحلة،
                والمحفوظ <b className="font-mono">{pendingSave.savedCount}</b> —
                فالحفظ الآن يفقد <b className="font-mono">{pendingSave.savedCount - pendingSave.list.length}</b>.
              </p>
              <p className="text-xs text-red-700 mt-1">
                الشاشة تعرض ما جاء من الشيت الآن، <b>والمحفوظ في السيرفر لم يتغيّر</b>.
                راجع الشيت قبل أن تقرّر — قد تكون قراءةً ناقصة.
              </p>
              <div className="flex gap-2 mt-2">
                <button type="button" disabled={saving}
                  onClick={() => { const pend = pendingSave; setPendingSave(null); persist(pend.list); }}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'جارٍ…' : 'احفظ رغم ذلك'}
                </button>
                <button type="button" onClick={() => setPendingSave(null)}
                  className="text-xs border border-red-300 bg-white text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-100">
                  ألغِ
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">رفع يدوي (خطّة بديلة)</label>
          <input type="file" accept=".xlsx,.xls" onChange={onFile}
            className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 file:text-gray-700 file:cursor-pointer hover:file:bg-gray-300" />
        </div>
        {cfg.bassamAccount && (
          <button onClick={() => setShowBassam(true)} className="bg-purple-100 text-purple-800 border border-purple-300 text-sm px-3 py-2 rounded-lg hover:bg-purple-200">📒 حساب البسّام</button>
        )}
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
            <button onClick={() => setShowExec(true)} className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">📊 تقرير إداري</button>
            <button onClick={() => setShowFin(true)} className="bg-slate-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-900">🧮 تقرير مالي (نسخة ٢)</button>
            <button onClick={() => setShowBoard(true)} className="bg-teal-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-800">🏛️ تقرير تنفيذي (نسخة ٣)</button>
            <button onClick={printReport} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">🖨️ طباعة / PDF</button>
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
              {!cfg.hideAgentLiquidity && <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">السيولة عند الوكلاء</p><p className="text-sm font-semibold text-indigo-700 mt-1">{cfg.agentExport}: {fmt(data.liqIttihad)}</p><p className="text-sm font-semibold text-purple-700">{cfg.agentImport}: {fmt(data.liqBassam)}</p></div>}
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">🚚 أعداد المنقولات خلال الشهر</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  { label: 'شاحنات', icon: '🚛', e: data.E.truckC, i: data.I.truckC, box: 'bg-blue-50 border-blue-200', num: 'text-blue-700' },
                  { label: 'سيارات', icon: '🚗', e: data.E.vehC, i: data.I.vehC, box: 'bg-emerald-50 border-emerald-200', num: 'text-emerald-700' },
                  { label: 'ركاب', icon: '👥', e: data.E.passC, i: data.I.passC, box: 'bg-amber-50 border-amber-200', num: 'text-amber-700' },
                ] as const).map((c) => (
                  <div key={c.label} className={`rounded-lg border p-3 ${c.box}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{c.icon} {c.label}</span>
                      <span className={`text-2xl font-bold ${c.num}`}>{(c.e + c.i).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>صادر: <strong className="text-gray-700">{c.e.toLocaleString()}</strong></span>
                      <span>وارد: <strong className="text-gray-700">{c.i.toLocaleString()}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {([
                { key: 'E', label: `صادر — ${cfg.agentExport}`, rev: data.revE, exp: data.expE, side: data.E, color: 'indigo' },
                { key: 'I', label: `وارد — ${cfg.agentImport}`, rev: data.revI, exp: data.expI, side: data.I, color: 'purple' },
              ] as const).map((panel) => (
                <div key={panel.key} className="bg-white rounded-xl shadow p-4">
                  <h3 className={`font-bold text-${panel.color}-700 mb-3`}>{panel.label}</h3>
                  <table className="w-full text-sm mb-3">
                    <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-right py-1">الإيراد</th><th scope="col" className="text-right py-1">العدد</th><th scope="col" className="text-right py-1">المبلغ</th><th scope="col" className="text-right py-1">متوسط/وحدة</th></tr></thead>
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
                    <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-right py-1">المصروف</th><th scope="col" className="text-right py-1">المبلغ</th></tr></thead>
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
                <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-right py-1">متوسط لكل رحلة</th><th scope="col" className="text-right py-1">صادر</th><th scope="col" className="text-right py-1">وارد</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="py-1">شاحنات</td><td className="py-1 font-medium">{fmt(data.E.truckC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.truckC / data.count)}</td></tr>
                  <tr className="border-t"><td className="py-1">سيارات</td><td className="py-1 font-medium">{fmt(data.E.vehC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.vehC / data.count)}</td></tr>
                  <tr className="border-t"><td className="py-1">ركاب</td><td className="py-1 font-medium">{fmt(data.E.passC / data.count)}</td><td className="py-1 font-medium">{fmt(data.I.passC / data.count)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">⛽ البنكر (مخزون)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end text-sm">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رصيد أول المدة {manual[month]?.opening === undefined || manual[month]?.opening === '' ? (openingOf(month) ? '(مُرحّل)' : '(يدوي)') : '(يدوي)'}</label>
                  <div className="flex gap-1">
                    <input value={openingOf(month)} onChange={(e) => setCur({ opening: e.target.value })} inputMode="decimal" placeholder="0" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {(() => { const pc = manual[prevMonthOf(month)]?.closing; return pc !== undefined && pc !== '' ? (
                      <button type="button" title="ترحيل مخزون آخر الشهر السابق" onClick={() => setCur({ opening: pc })}
                        className="px-2 rounded-lg border text-gray-500 hover:bg-gray-100 shrink-0">↩</button>
                    ) : null; })()}
                  </div>
                </div>
                <div><p className="text-xs text-gray-500 mb-1">+ تموينات (إكسيل)</p><p className="border rounded-lg px-3 py-2 bg-gray-50 font-medium">{fmt(data.suppliesExcel)}</p></div>
                <div><p className="text-xs text-gray-500 mb-1">+ فواتير البنكر</p><p className="border rounded-lg px-3 py-2 bg-amber-50 font-medium text-amber-700">{fmt(data.bunkerInvoiceUSD)}</p></div>
                <div><label className="block text-xs text-gray-500 mb-1">− مخزون آخر المدة (يدوي)</label><input value={cur.closing} onChange={(e) => setCur({ closing: e.target.value })} inputMode="decimal" placeholder="0" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><p className="text-xs text-gray-500 mb-1">= البنكر المستهلك</p><p className="border rounded-lg px-3 py-2 bg-red-50 font-bold text-red-700">{fmt(data.bunkerCost)}</p></div>
              </div>
              {data.bunkerInvoiceUSD > 0 && <p className="text-xs text-amber-600 mt-2">⛽ فواتير بند «Bunker» ({fmt(data.bunkerInvoiceUSD)}) اتحمّلت هنا مش في المشتريات. مخزون آخر المدة بيترحّل رصيد افتتاحي للشهر الجاي.</p>}
            </div>

            <div className="bg-white rounded-xl shadow p-4 flex items-end justify-between flex-wrap gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">مرتبات الشهر {cfg.salariesByMonth?.[month] != null && (manual[month]?.salaries === undefined || manual[month]?.salaries === '') ? '(محمّلة تلقائياً)' : '(يدوي)'}</label><input value={salaryOf(month)} onChange={(e) => setCur({ salaries: e.target.value })} inputMode="decimal" placeholder="0" className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="text-right"><p className="text-xs text-gray-500">المبلغ المطروح من الصافي</p><p className="font-bold text-red-600 text-lg">{fmt(data.salaries)}</p></div>
            </div>

            {purchases && (
              <div className="bg-white rounded-xl shadow p-4">
                <h3 className="font-bold text-gray-700 mb-3">🧾 المشتريات (فواتير المركب) — بالدولار</h3>
                {purchases.missingList.length > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-3">
                    ⚠️ فواتير مفيش لها سعر صرف (ولا افتراضي) — مش محتسبة:
                    {purchases.missingList.map((i) => ` ${i.number} (${i.currency} — ${monthLabel(i.purchaseMonth)})`).join('،')}
                  </div>
                )}
                {purchases.defaultList.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
                    ⭐ فواتير اتحسبت بـ<strong> سعر الصرف الافتراضي</strong> (شهرها مش متسجّل) — أدخل سعر الشهر في كارت أسعار الصرف للدقة:
                    {purchases.defaultList.map((i) => ` ${i.number} (${i.currency} — ${monthLabel(i.purchaseMonth)})`).join('،')}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="bg-emerald-50 rounded-lg p-3"><p className="text-emerald-600 text-xs">صافي قبل المشتريات</p><p className="text-lg font-bold text-emerald-800">{fmt(data.net)}</p></div>
                  <div className="bg-red-50 rounded-lg p-3"><p className="text-red-600 text-xs">إجمالي المشتريات (قسط الشهر)</p><p className="text-lg font-bold text-red-700">{fmt(purchases.total)}</p></div>
                  <div className="bg-blue-600 text-white rounded-lg p-3"><p className="text-xs opacity-80">صافي نهائي بعد المشتريات</p><p className="text-lg font-bold">{fmt(data.net - purchases.total)}</p></div>
                </div>
                {purchases.byItem.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">المشتريات حسب البند:</p>
                    <div className="flex flex-wrap gap-2">
                      {purchases.byItem.map((b) => (
                        <span key={b.name} className="bg-indigo-50 text-indigo-800 text-xs rounded-lg px-3 py-1.5">{b.name}: <strong>{fmt(b.value)}</strong></span>
                      ))}
                    </div>
                  </div>
                )}
                {purchases.items.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs"><tr><th scope="col" className="text-right py-1">رقم الفاتورة</th><th scope="col" className="text-right py-1">التاريخ</th><th scope="col" className="text-right py-1">المورد</th><th scope="col" className="text-right py-1">البند</th><th scope="col" className="text-right py-1">المبلغ الأصلي</th><th scope="col" className="text-right py-1">شهور الإهلاك</th><th scope="col" className="text-right py-1">القسط الشهري (USD)</th></tr></thead>
                    <tbody>
                      {purchases.items.map((i) => (
                        <tr key={i.id} className={`border-t ${i.amount < 0 ? 'bg-indigo-50/50' : ''}`}>
                          <td className="py-1">
                            {i.number}
                            {i.amount < 0 && <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-[10px] font-semibold ms-1">إشعار دائن</span>}
                          </td>
                          <td className="py-1 text-gray-500">{i.date || '—'}</td>
                          <td className="py-1">{i.supplier}</td>
                          <td className="py-1">{i.item}</td>
                          <td className="py-1">{fmt(i.amount)} {i.currency}</td>
                          <td className="py-1 text-gray-500">{i.nMonths > 1 ? `${i.seq}/${i.nMonths}` : 'كامل'}</td>
                          <td className={`py-1 font-medium ${i.installment < 0 ? 'text-emerald-600' : 'text-red-600'}`}>{i.missing ? '⚠️ سعر ناقص' : <>{fmt(i.installment)}{i.usedDefault && <span title="بسعر صرف افتراضي" className="text-amber-600"> ⭐</span>}</>}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 font-bold"><td className="py-1" colSpan={6}>إجمالي المشتريات</td><td className="py-1 text-red-700">{fmt(purchases.total)}</td></tr>
                    </tbody>
                  </table>
                ) : invLoading ? <p className="text-gray-400 text-sm">جارٍ تحميل فواتير المركب…</p>
                  : <p className="text-gray-400 text-sm">لا توجد فواتير على المركب في {monthLabel(month)}.</p>}
              </div>
            )}

            {!cfg.hideAgentLiquidity && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-700 mb-3">السيولة عند كل وكيل</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-indigo-50 rounded-lg p-3"><p className="text-indigo-600 text-xs">{cfg.agentExport} (P − O)</p><p className="text-lg font-bold text-indigo-800">{fmt(data.liqIttihad)}</p></div>
                <div className="bg-purple-50 rounded-lg p-3"><p className="text-purple-600 text-xs">{cfg.agentImport} (O)</p><p className="text-lg font-bold text-purple-800">{fmt(data.liqBassam)}</p></div>
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-gray-500 text-xs">إجمالي التحصيل (P)</p><p className="text-lg font-bold text-gray-800">{fmt(data.P)}</p></div>
              </div>
            </div>
            )}

            {allocVoy.length > 0 && (
              <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
                <h3 className="font-bold text-gray-700 mb-1">صافي الربح لكل رحلة بعد توزيع التكاليف</h3>
                <p className="text-xs text-gray-400 mb-3">توزيع البنكر والمرتبات والمشتريات على كل الرحلات حسب إيراد كل رحلة — مجموع الصافي = الصافي النهائي {fmt(allocFinalNet)}</p>
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="text-gray-500 text-xs">
                    <tr>
                      <th scope="col" className="text-right py-1 px-2">الرحلة</th>
                      <th scope="col" className="text-right py-1 px-2">الإيراد</th>
                      <th scope="col" className="text-right py-1 px-2">صافي قبل التوزيع</th>
                      <th scope="col" className="text-right py-1 px-2">− بنكر</th>
                      <th scope="col" className="text-right py-1 px-2">− مرتبات</th>
                      {allocPurchasesTotal > 0 && <th scope="col" className="text-right py-1 px-2">− مشتريات</th>}
                      <th scope="col" className="text-right py-1 px-2">الصافي بعد التوزيع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocVoy.map((v) => (
                      <tr key={v.ref} className="border-t">
                        <td className="py-1 px-2 font-medium">{v.ref}</td>
                        <td className="py-1 px-2">{fmt(v.revenue)}</td>
                        <td className="py-1 px-2 text-gray-500">{fmt(v.before)}</td>
                        <td className="py-1 px-2 text-red-600">{fmt(v.allocBunker)}</td>
                        <td className="py-1 px-2 text-red-600">{fmt(v.allocSalaries)}</td>
                        {allocPurchasesTotal > 0 && <td className="py-1 px-2 text-red-600">{fmt(v.allocPurchases)}</td>}
                        <td className={`py-1 px-2 font-bold ${v.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(v.net)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-gray-50 font-bold">
                      <td className="py-1 px-2">الإجمالي</td>
                      <td className="py-1 px-2">{fmt(data.revenue)}</td>
                      <td className="py-1 px-2">{fmt(allocVoy.reduce((s, v) => s + v.before, 0))}</td>
                      <td className="py-1 px-2 text-red-700">{fmt(data.bunkerCost)}</td>
                      <td className="py-1 px-2 text-red-700">{fmt(data.salaries)}</td>
                      {allocPurchasesTotal > 0 && <td className="py-1 px-2 text-red-700">{fmt(allocPurchasesTotal)}</td>}
                      <td className="py-1 px-2 text-emerald-800">{fmt(allocFinalNet)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {costSegs.length > 0 && (
              <div className="bg-white rounded-xl shadow p-4">
                <h3 className="font-bold text-gray-700 mb-1">هيكل التكاليف</h3>
                <p className="text-xs text-gray-400 mb-3">
                  توزيع إجمالي المصروفات ({fmt(costSegsTotal)}) — شاملاً البنكر والمرتبات والمشتريات
                </p>
                <div className="flex items-center gap-5 flex-wrap">
                  <CostDonut segs={costSegs} />
                  <div className="flex-1 min-w-[15rem] space-y-1 text-sm">
                    {costSegs.map((sg) => (
                      <div key={sg.id} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: sg.color }} />
                        <span className="flex-1 truncate">{sg.ar}</span>
                        <span className="font-medium">{fmt(sg.value)}</span>
                        <span className="text-gray-400 w-10 text-left">{Math.round(sg.share * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── print-only document (hidden while the executive report is open) ── */}
          <div id="vp-doc" dir="rtl" className={showExec ? 'hidden' : 'hidden print:block'}>
            <div className="dh">
              <div className="brand">UME <span>Holding</span><small>MARITIME · PMS</small></div>
              <div className="meta">
                المركب: <b>{cfg.vessel}</b><br />
                الفترة: <b>{monthLabel(month)}</b><br />
                عدد الرحلات: <b>{sel.length}</b> · العملة: <b>USD</b>
              </div>
            </div>
            <div className="dt">تقرير صافي ربح المركب</div>
            <div className="kpis">
              {purchases ? (
                <>
                  <div className="kpi main"><span className="l">صافي نهائي بعد المشتريات</span><span className="v">{fmt(data.net - purchases.total)}</span></div>
                  <div className="kpi"><span className="l">صافي قبل المشتريات</span><span className="v">{fmt(data.net)}</span></div>
                  <div className="kpi danger"><span className="l">بند المشتريات</span><span className="v">{fmt(purchases.total)}</span></div>
                  <div className="kpi"><span className="l">إجمالي الإيراد</span><span className="v">{fmt(data.revenue)}</span></div>
                  <div className="kpi danger"><span className="l">إجمالي المصروفات</span><span className="v">{fmt(data.expenses)}</span></div>
                </>
              ) : (
                <>
                  <div className="kpi main"><span className="l">صافي ربح الشهر</span><span className="v">{fmt(data.net)}</span></div>
                  <div className="kpi"><span className="l">إجمالي الإيراد</span><span className="v">{fmt(data.revenue)}</span></div>
                  <div className="kpi danger"><span className="l">إجمالي المصروفات</span><span className="v">{fmt(data.expenses)}</span></div>
                  <div className="kpi"><span className="l">متوسط ربح الرحلة</span><span className="v">{fmt(data.net / data.count)}</span></div>
                </>
              )}
            </div>
            <h3>الإيرادات</h3>
            <table>
              <thead><tr><th scope="col">البند</th><th scope="col">صادر — عدد</th><th scope="col">صادر — مبلغ</th><th scope="col">وارد — عدد</th><th scope="col">وارد — مبلغ</th><th scope="col">الإجمالي</th></tr></thead>
              <tbody>
                {REV_ROWS.map((r) => {
                  const eC = (data.E as any)[r.cKey], eA = (data.E as any)[r.key], iC = (data.I as any)[r.cKey], iA = (data.I as any)[r.key];
                  return (<tr key={r.key}><td>{r.label}</td><td>{eC || '—'}</td><td>{fmt(eA)}</td><td>{iC || '—'}</td><td>{fmt(iA)}</td><td>{fmt(eA + iA)}</td></tr>);
                })}
                <tr><td>إذن الشحن</td><td>—</td><td>{fmt(data.E.discharge)}</td><td>—</td><td>{fmt(data.I.discharge)}</td><td>{fmt(data.E.discharge + data.I.discharge)}</td></tr>
                <tr className="tot"><td>إجمالي الإيراد</td><td></td><td>{fmt(data.revE)}</td><td></td><td>{fmt(data.revI)}</td><td>{fmt(data.revenue)}</td></tr>
              </tbody>
            </table>
            <h3>أعداد المنقولات خلال الشهر ومتوسطها لكل رحلة</h3>
            <table>
              <thead><tr>
                <th scope="col">البند</th>
                <th scope="col">صادر — إجمالي</th><th scope="col">وارد — إجمالي</th><th scope="col">الإجمالي</th>
                <th scope="col">متوسط صادر / رحلة</th><th scope="col">متوسط وارد / رحلة</th>
              </tr></thead>
              <tbody>
                {([
                  { label: 'شاحنات', e: data.E.truckC, i: data.I.truckC },
                  { label: 'سيارات', e: data.E.vehC, i: data.I.vehC },
                  { label: 'ركاب', e: data.E.passC, i: data.I.passC },
                ] as const).map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.e.toLocaleString()}</td>
                    <td>{r.i.toLocaleString()}</td>
                    <td>{(r.e + r.i).toLocaleString()}</td>
                    <td>{fmt(r.e / data.count)}</td>
                    <td>{fmt(r.i / data.count)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>الإجمالي</td>
                  <td>{(data.E.truckC + data.E.vehC + data.E.passC).toLocaleString()}</td>
                  <td>{(data.I.truckC + data.I.vehC + data.I.passC).toLocaleString()}</td>
                  <td>{(data.E.truckC + data.E.vehC + data.E.passC + data.I.truckC + data.I.vehC + data.I.passC).toLocaleString()}</td>
                  <td>{fmt((data.E.truckC + data.E.vehC + data.E.passC) / data.count)}</td>
                  <td>{fmt((data.I.truckC + data.I.vehC + data.I.passC) / data.count)}</td>
                </tr>
              </tbody>
            </table>
            <div className="cols">
              <div><h3>مصروفات الصادر ({cfg.agentExport})</h3><table><thead><tr><th scope="col">المصروف</th><th scope="col">المبلغ</th></tr></thead><tbody>{Object.entries(data.E.exp).map(([k, v]) => (<tr key={k}><td>{labelOf[k] || k}</td><td>{fmt(v)}</td></tr>))}<tr className="tot"><td>إجمالي المصروفات</td><td>{fmt(data.expE)}</td></tr></tbody></table></div>
              <div><h3>مصروفات الوارد ({cfg.agentImport})</h3><table><thead><tr><th scope="col">المصروف</th><th scope="col">المبلغ</th></tr></thead><tbody>{Object.entries(data.I.exp).map(([k, v]) => (<tr key={k}><td>{labelOf[k] || k}</td><td>{fmt(v)}</td></tr>))}<tr className="tot"><td>إجمالي المصروفات</td><td>{fmt(data.expI)}</td></tr></tbody></table></div>
            </div>
            <div className="cols">
              <div>
                <h3>البنكر (مخزون)</h3>
                <table><thead><tr><th scope="col">رصيد أول المدة</th><th scope="col">+ تموينات الشهر</th><th scope="col">− مخزون آخر المدة</th><th scope="col">= المستهلك</th></tr></thead><tbody><tr><td>{fmt(data.opening)}</td><td>{fmt(data.supplies)}</td><td>{fmt(data.closing)}</td><td>{fmt(data.bunkerCost)}</td></tr></tbody></table>
                <h3>مصروفات أخرى</h3><table><tbody><tr><td>مرتبات الشهر</td><td>{fmt(data.salaries)}</td></tr></tbody></table>
              </div>
              <div>
                {!cfg.hideAgentLiquidity && <>
                  <h3>السيولة عند الوكلاء</h3>
                  <table><thead><tr><th scope="col">{cfg.agentExport} (P−O)</th><th scope="col">{cfg.agentImport} (O)</th><th scope="col">إجمالي التحصيل (P)</th></tr></thead><tbody><tr><td>{fmt(data.liqIttihad)}</td><td>{fmt(data.liqBassam)}</td><td>{fmt(data.P)}</td></tr></tbody></table>
                </>}
              </div>
            </div>
            {purchases && (
              <>
                <h3>المشتريات (فواتير المركب) — بالدولار</h3>
                {purchases.byItem.length > 0 && (
                  <table>
                    <thead><tr><th scope="col">البند</th><th scope="col">إجمالي القسط (USD)</th></tr></thead>
                    <tbody>
                      {purchases.byItem.map((b) => (<tr key={b.name}><td>{b.name}</td><td>{fmt(b.value)}</td></tr>))}
                      <tr className="tot"><td>الإجمالي</td><td>{fmt(purchases.total)}</td></tr>
                    </tbody>
                  </table>
                )}
                <table>
                  <thead><tr><th scope="col">رقم الفاتورة</th><th scope="col">التاريخ</th><th scope="col">المورد</th><th scope="col">البند</th><th scope="col">المبلغ الأصلي</th><th scope="col">شهور الإهلاك</th><th scope="col">القسط الشهري (USD)</th></tr></thead>
                  <tbody>
                    {purchases.items.length ? purchases.items.map((i) => (
                      <tr key={i.id}><td>{i.number}{i.amount < 0 ? ' (إشعار دائن)' : ''}</td><td>{i.date || '—'}</td><td>{i.supplier}</td><td>{i.item}</td><td>{fmt(i.amount)} {i.currency}</td><td>{i.nMonths > 1 ? `${i.seq}/${i.nMonths}` : 'كامل'}</td><td>{i.missing ? 'سعر ناقص' : `${fmt(i.installment)}${i.usedDefault ? ' *' : ''}`}</td></tr>
                    )) : (<tr><td colSpan={7}>لا توجد فواتير على المركب في هذا الشهر</td></tr>)}
                    <tr className="tot"><td colSpan={6}>إجمالي المشتريات</td><td>{fmt(purchases.total)}</td></tr>
                  </tbody>
                </table>
                <table>
                  <thead><tr><th scope="col">صافي قبل المشتريات</th><th scope="col">إجمالي المشتريات</th><th scope="col">صافي نهائي بعد المشتريات</th></tr></thead>
                  <tbody><tr className="tot"><td>{fmt(data.net)}</td><td>{fmt(purchases.total)}</td><td>{fmt(data.net - purchases.total)}</td></tr></tbody>
                </table>
              </>
            )}
            {/*
              الحلقة في الورق أيضاً — والمحتوى المعروض كلّه `print:hidden`، فما
              لا يُكرَّر هنا لا يصل الورقة. ووسيلة الإيضاح جدولٌ لا ألوانٌ وحدها:
              التقرير يُطبع أحياناً بالأبيض والأسود فتتشابه الألوان.
            */}
            {costSegs.length > 0 && (
              <div className="cstr">
                <h3>هيكل التكاليف</h3>
                <div className="dn">
                  <CostDonut segs={costSegs} size={150} />
                  <table className="lg"><tbody>
                    {costSegs.map((sg) => (
                      <tr key={sg.id}>
                        <td><span className="sw" style={{ background: sg.color }} />{sg.ar}</td>
                        <td>{fmt(sg.value)}</td>
                        <td className="pc">{Math.round(sg.share * 100)}%</td>
                      </tr>
                    ))}
                    <tr className="tot"><td>الإجمالي</td><td>{fmt(costSegsTotal)}</td><td className="pc">100%</td></tr>
                  </tbody></table>
                </div>
              </div>
            )}

            <div className="foot">
              <span>UME Holding — نظام PMS · تقرير {cfg.vessel} · {monthLabel(month)}</span>
              <span>مستند داخلي — سري · جميع القيم بالدولار الأمريكي</span>
            </div>
          </div>
        </>
      )}

      {showExec && execData && (
        <VesselExecReport cfg={cfg} month={month} monthLabel={monthLabel(month)} exec={execData} onClose={() => setShowExec(false)} />
      )}

      {showFin && data && execData && (
        <VesselFinReport
          cfg={{ vessel: cfg.vessel, agentExport: cfg.agentExport, agentImport: cfg.agentImport }}
          month={month} monthLabel={monthLabel(month)}
          data={data as any} purchases={purchases} exec={execData}
          allocVoy={allocVoy} labelOf={labelOf} revRows={REV_ROWS}
          onClose={() => setShowFin(false)}
        />
      )}

      {showBoard && data && execData && (
        <VesselBoardReport
          cfg={{ vessel: cfg.vessel, agentExport: cfg.agentExport, agentImport: cfg.agentImport }}
          month={month} monthLabel={monthLabel(month)}
          data={data as any} purchases={purchases} exec={execData}
          allocVoy={allocVoy} labelOf={labelOf} revRows={REV_ROWS}
          onClose={() => setShowBoard(false)}
        />
      )}

      {showBassam && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-auto">
          <div className="max-w-6xl mx-auto my-6 bg-gray-50 rounded-xl shadow-xl">
            <div className="flex items-center justify-between bg-white rounded-t-xl border-b px-4 py-3 sticky top-0 z-10">
              <h3 className="font-bold text-gray-800">📒 حساب وكيل البسّام — {cfg.vessel}</h3>
              <button onClick={() => setShowBassam(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-4"><BassamAccountCard vesselKey={cfg.vessel} storageKey={cfg.bassamStorageKey || 'BassamAccount'} vesselLabel={cfg.vessel} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * حلقة هيكل التكاليف.
 *
 * تُرسم `SVG` فتُطبع متّجهةً حادّة عند أي تكبير بلا تحويلٍ إلى صورة، وتخدم
 * الشاشة والورق بالمكوّن نفسه.
 */
function CostDonut({ segs, size = 180 }: { segs: { color: string; share: number }[]; size?: number }) {
  const sw = size * 0.18, r = (size - sw) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90 ${c} ${c})`}>
        {segs.map((sg, i) => {
          const len = sg.share * circ;
          const el = (<circle key={i} cx={c} cy={c} r={r} fill="none" stroke={sg.color} strokeWidth={sw}
            strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} />);
          acc += len; return el;
        })}
      </g>
    </svg>
  );
}
