'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  كارت ربحيّة خطّ جدّة/سواكن — قالبٌ واحدٌ لمراكب الخطّ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── لماذا لا يُعاد استعمال كارت ضبا/سفاجا ──
 * ذلك الكارت مبنيٌّ على وكيلَي صادرٍ ووارد، وتحصيلٍ وسيولةٍ عند البسّام، وبنود
 * مصروفٍ بأعمدةٍ مرقَّمة. وخطّ جدّة/سواكن اقتصادٌ آخر: لا تحصيل ولا سيولة،
 * وثلاثةٌ وعشرون بنداً خاصّاً به. فالقالب هنا يقرأ البنود **بأسمائها** من
 * `/api/vessel-profit/:key/line-sheet`، ويعرضها بمسمّياتها أدناه.
 *
 * ── مستأجرةٌ أم مملوكة ──
 * بقرار المالك ٢٦ سبتمبر ٢٠٢٦: دليلة وعمّان مستأجرتان، ومونتي مملوكة. فتكلفة
 * السفينة نوعان: **إيجارٌ** للمستأجرة، و**طاقمٌ وصيانةٌ وتأمينٌ وإدارةٌ وإهلاك**
 * للمملوكة. والقالب يعرض لكلٍّ ما يخصّه، ويُوحّد المقارنة في «الصافي لكلّ رحلة
 * بعد تكلفة السفينة».
 *
 * ── الإيجار في مكانٍ واحد ──
 * عمّان تكتب إيجارها في دفترها (عمود `hire`)، ودليلة لا تكتبه — فيُدخَل يدويّاً
 * هنا. و`hireInLedger` يقرّر المصدر لكلّ مركب، وإلّا خُصم الإيجار مرّتين أو لم
 * يُخصم أبداً. وفي الحالين يُخرَج الإيجار من «مصاريف الرحلات» ويُعرض تحت
 * «تكلفة السفينة»، فتتطابق بنية الكارت بين المركبين.
 *
 * ── وسعر الجنيه السودانيّ داخل الكارت وحده ──
 * بقرار المالك: سعرٌ واحدٌ يُدخَل يدويّاً، ولا جدول عامّ في النظام.
 */

export interface LineVesselConfig {
  key: string;                       // مفتاح الخادم والحفظ — `DaleelaJS`
  nameAr: string; nameEn: string;
  ownership: 'chartered' | 'owned';
  hireInLedger: boolean;             // عمّان: نعم · دليلة: لا (يُدخَل يدويّاً)
  peers: { key: string; nameAr: string; nameEn: string; hireInLedger: boolean; ownership: 'chartered' | 'owned' }[];
}

export const DALEELA_JS: LineVesselConfig = {
  key: 'DaleelaJS', nameAr: 'دليلة', nameEn: 'Daleela', ownership: 'chartered', hireInLedger: false,
  peers: [{ key: 'AmmanJS', nameAr: 'عمّان', nameEn: 'Amman', hireInLedger: true, ownership: 'chartered' }],
};

// ── مسمّيات البنود — مفاتيحها أسماء الحمولة في الشيت الموحّد ──
const REV_LABEL: Record<string, [string, string]> = {
  tr: ['نولون الشاحنات', 'Truck freight'], vh: ['نولون السيارات', 'Vehicle freight'],
  px: ['إيراد الركاب', 'Passenger revenue'], dord: ['أوامر التسليم', 'Delivery orders'],
  furn: ['عفش الركاب', 'Passenger luggage'], minT: ['رسوم وزارة النقل', 'Ministry of Transport fees'],
  hzr: ['إيراد الحظيرة', 'Yard revenue'], othInc: ['إيراد آخر', 'Other income'], dis: ['أمر التفريغ', 'Discharge order'],
};
const COMM_LABEL: Record<string, [string, string]> = {
  cTR: ['عمولة الشاحنات', 'Truck commission'], cPA: ['عمولة الركاب', 'Passenger commission'],
  cDord: ['عمولة أوامر التسليم', 'Delivery-order commission'], cAfsh: ['عمولة العفش', 'Luggage commission'],
  aa: ['ضريبة تفريغ', 'Discharge tax'], ab: ['عمولة تفريغ 60%', 'Discharge comm. 60%'], ac: ['عمولة شحن', 'Shipping comm.'],
  ad: ['مركبات 12%', 'Vehicles 12%'], ae: ['ركاب PKS', 'PKS'], r: ['استيراد 10%', 'Import 10%'],
  s: ['مركبات 15%', 'Vehicles 15%'], t: ['ركاب 20%', 'Passengers 20%'], fz: ['منطقة حرة 2%', 'Free zone 2%'],
};
const EXP_LABEL: Record<string, [string, string]> = {
  bnk: ['البنكر — مشتريات الدفتر', 'Bunker — ledger purchases'], portA: ['رسوم هيئة الموانئ', 'Port authority fees'],
  oth: ['مصاريف أخرى', 'Other expenses'], exFurn: ['مصروف عفش الركاب', 'Luggage expense'],
  cater: ['مرتّبات الإعاشة', 'Catering salaries'], agency: ['أتعاب الوكالة', 'Agency fees'],
  wht: ['ضريبة الاستقطاع', 'Withholding tax'], opex: ['مصاريف تشغيل', 'Operating expenses'],
  adv: ['إعلانات', 'Advertising'], vesEx: ['مصاريف المركب', 'Vessel expenses'], quar: ['الحجر الصحّي', 'Quarantine'],
  fw: ['مياه عذبة', 'Fresh water'], tips: ['إكراميات', 'Tips'], exHzr: ['مصروف الحظيرة', 'Yard expense'],
  spray: ['رشّ وتعقيم', 'Spraying'], retPas: ['ركاب مرتجعون', 'Returned passengers'], tel: ['اتّصالات', 'Telecom'],
  hire: ['الإيجار — من الدفتر', 'Hire — from ledger'], sd: ['خصم خاص', 'Special discount'], eb: ['ميناء البسّام', 'Bassam port'],
  brk: ['عمولة بروكر', 'Broker commission'], pk: ['ميناء السعودية', 'KSA port'], pg: ['ميناء مصر', 'EGY port'], crn: ['كرين', 'Crane'],
};
// تكاليف السفينة اليدويّة — للمملوكة كلّها، وللمستأجرة الإيجار وحده
const OWNED_COSTS: { k: keyof MonthManual; ar: string; en: string }[] = [
  { k: 'crew', ar: 'مرتّبات الطاقم', en: 'Crew salaries' },
  { k: 'maint', ar: 'الصيانة وقطع الغيار', en: 'Maintenance & spares' },
  { k: 'insur', ar: 'التأمين', en: 'Insurance' },
  { k: 'admin', ar: 'مصاريف إداريّة', en: 'Administrative' },
  { k: 'depr', ar: 'الإهلاك', en: 'Depreciation' },
  { k: 'other', ar: 'تكاليف أخرى للسفينة', en: 'Other vessel costs' },
];

interface LineSide { trucks: number; vehicles: number; pax: number; rev: Record<string, number> }
interface LineVoyage {
  ref: any; month: string; date: string; E: LineSide; I: LineSide;
  comm: Record<string, number>; exp: Record<string, number>;
  income: number; commTotal: number; expTotal: number; net: number; gap: number; broken: boolean;
}
interface MonthManual {
  hire?: string; bunkerOpen?: string; bunkerClose?: string;
  crew?: string; maint?: string; insur?: string; admin?: string; depr?: string; other?: string;
}
interface LineManual {
  settings?: { hireDaily?: string; capTrucks?: string; capVeh?: string; capPax?: string };
  months?: Record<string, MonthManual>;
  sdg?: { date: string; rate: string }[];
}

const num = (s?: string) => { const v = parseFloat(String(s ?? '').replace(/,/g, '')); return isFinite(v) ? v : 0; };
const has = (s?: string) => String(s ?? '').trim() !== '' && isFinite(parseFloat(String(s).replace(/,/g, '')));
const fmt = (n: number, d = 0) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const sumO = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** كلّ الشهور التقويميّة بين شهرين — الإيجار يُستحقّ في شهرٍ بلا رحلات أيضاً. */
function monthsBetween(a: string, b: string): string[] {
  if (!a || !b || a > b) return a ? [a] : [];
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const daysIn = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** تجميع رحلاتٍ — البنود بمجاميعها ورِجليها. */
function aggregate(vs: LineVoyage[]) {
  const revE: Record<string, number> = {}, revI: Record<string, number> = {}, comm: Record<string, number> = {}, exp: Record<string, number> = {};
  let income = 0, commTotal = 0, expTotal = 0, net = 0, gapMax = 0;
  const cnt = { tE: 0, tI: 0, vE: 0, vI: 0, pE: 0, pI: 0 };
  for (const v of vs) {
    for (const [k, x] of Object.entries(v.E.rev)) revE[k] = (revE[k] || 0) + x;
    for (const [k, x] of Object.entries(v.I.rev)) revI[k] = (revI[k] || 0) + x;
    for (const [k, x] of Object.entries(v.comm)) comm[k] = (comm[k] || 0) + x;
    for (const [k, x] of Object.entries(v.exp)) exp[k] = (exp[k] || 0) + x;
    income += v.income; commTotal += v.commTotal; expTotal += v.expTotal; net += v.net;
    gapMax = Math.max(gapMax, v.gap || 0);
    cnt.tE += v.E.trucks; cnt.tI += v.I.trucks; cnt.vE += v.E.vehicles; cnt.vI += v.I.vehicles; cnt.pE += v.E.pax; cnt.pI += v.I.pax;
  }
  const ledgerHire = exp.hire || 0;
  // مساهمة الرحلات قبل تكلفة السفينة — الإيجار يُخرَج أينما كُتب
  const contrib = income - commTotal - (expTotal - ledgerHire);
  return { n: vs.length, revE, revI, comm, exp, income, commTotal, expTotal, net, ledgerHire, contrib, gapMax, cnt };
}

/** تكلفة السفينة لشهر: الإيجار (من الدفتر أو يدويّاً) وتكاليف المملوكة وتسوية مخزون البنكر. */
function vesselCostOf(
  m: string, man: LineManual, ownership: 'chartered' | 'owned', hireInLedger: boolean, ledgerHireOfMonth: number,
) {
  const mm = man.months?.[m] || {};
  let hire: number | null = 0;
  if (ownership === 'chartered') {
    if (hireInLedger) hire = ledgerHireOfMonth;
    else if (has(mm.hire)) hire = num(mm.hire);
    else if (has(man.settings?.hireDaily)) hire = num(man.settings?.hireDaily) * daysIn(m);
    else hire = null; // غير مُدخل — يُقال لا يُفترض صفراً
  }
  const owned = ownership === 'owned' ? OWNED_COSTS.reduce((s, c) => s + num(mm[c.k]), 0) : 0;
  // البنكر = مشتريات الدفتر + أوّل المدّة − آخر المدّة
  const stockAdj = (has(mm.bunkerOpen) && has(mm.bunkerClose)) ? num(mm.bunkerOpen) - num(mm.bunkerClose) : 0;
  return { hire, owned, stockAdj, stockSet: has(mm.bunkerOpen) && has(mm.bunkerClose) };
}

/** انحدارٌ خطّيٌّ بسيط: المساهمة = أ + ب × الشاحنات. */
function regress(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx || !syy) return null;
  const b = sxy / sxx, a = my - b * mx;
  return { a, b, r2: (sxy * sxy) / (sxx * syy) };
}

/** مقاييس المقارنة لمركبٍ في فترة. */
function peerMetrics(vs: LineVoyage[], man: LineManual, ownership: 'chartered' | 'owned', hireInLedger: boolean, months: string[]) {
  const a = aggregate(vs);
  let vessel = 0, hireMissing = false;
  for (const m of months) {
    const lh = vs.filter((v) => v.month === m).reduce((s, v) => s + (v.exp.hire || 0), 0);
    const c = vesselCostOf(m, man, ownership, hireInLedger, lh);
    if (c.hire == null) hireMissing = true;
    vessel += (c.hire || 0) + c.owned + c.stockAdj;
  }
  const n = a.n || 1;
  const trucks = a.cnt.tE + a.cnt.tI;
  return {
    n: a.n,
    trucksE: a.cnt.tE / n, trucksI: a.cnt.tI / n, pax: (a.cnt.pE + a.cnt.pI) / n,
    incomePV: a.income / n, contribPV: a.contrib / n, bunkerPV: (a.exp.bnk || 0) / n, portPV: (a.exp.portA || 0) / n,
    revPerTruck: trucks ? ((a.revE.tr || 0) + (a.revI.tr || 0)) / trucks : 0,
    margin: a.income ? a.contrib / a.income : 0,
    vesselPV: hireMissing ? null : vessel / n,
    netPV: hireMissing ? null : (a.contrib - vessel) / n,
  };
}

export default function LineProfitReport({ config }: { config: LineVesselConfig }) {
  const cfg = config;
  const { locale } = useI18n();
  const en = locale === 'en';
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const L = (m: Record<string, [string, string]>, k: string) => (m[k] ? (en ? m[k][1] : m[k][0]) : k);
  const name = en ? cfg.nameEn : cfg.nameAr;

  const [voyages, setVoyages] = useState<LineVoyage[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manual, setManual] = useState<LineManual>({});
  /*
   * لا حفظ قبل أن تُقرأ القيم المحفوظة.
   * الحفظ يستبدل `manual` كاملاً، وفشلُ القراءة يترك `{}` في الذاكرة — فحفظٌ بعده
   * يمحو الحقيقيّ. وقع ذلك لألكوديا في ١٨ أغسطس ٢٠٢٦.
   */
  const [manualLoaded, setManualLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [peers, setPeers] = useState<Record<string, { voyages: LineVoyage[]; manual: LineManual }>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editMonth, setEditMonth] = useState('');
  const [showInputs, setShowInputs] = useState(false);
  const [sdgDate, setSdgDate] = useState('');
  const [sdgRate, setSdgRate] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [sheet, saved] = await Promise.all([
        api.get(`/api/vessel-profit/${cfg.key}/line-sheet`),
        api.get(`/api/vessel-profit/${cfg.key}`),
      ]);
      const vs: LineVoyage[] = sheet.data?.voyages || [];
      setVoyages(vs);
      setFetchedAt(sheet.data?.fetchedAt || '');
      setManual((saved.data?.manual as LineManual) || {});
      setManualLoaded(true);
      const ms = [...new Set(vs.map((v) => v.month))].sort();
      if (ms.length) {
        const last = ms[ms.length - 1];
        const firstOfYear = ms.find((m) => m.slice(0, 4) === last.slice(0, 4)) || ms[0];
        setFrom((f) => f || firstOfYear); setTo((t) => t || last); setEditMonth((e) => e || last);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || T('تعذّر تحميل رحلات الخطّ', 'Could not load line voyages'));
    } finally { setLoading(false); }
    // المركبات الشقيقة — فشلُ إحداها لا يُسقط الكارت
    const out: Record<string, { voyages: LineVoyage[]; manual: LineManual }> = {};
    await Promise.all(cfg.peers.map(async (p) => {
      try {
        const [s, m] = await Promise.all([
          api.get(`/api/vessel-profit/${p.key}/line-sheet`),
          api.get(`/api/vessel-profit/${p.key}`).catch(() => ({ data: null })),
        ]);
        out[p.key] = { voyages: s.data?.voyages || [], manual: (m.data?.manual as LineManual) || {} };
      } catch { /* يظهر المركب بلا بيانات */ }
    }));
    setPeers(out);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cfg.key]);

  const save = async (next: LineManual) => {
    if (!manualLoaded) { setError(T('لم تُقرأ القيم المحفوظة بعد — أعد التحميل قبل الحفظ', 'Saved values not loaded — reload before saving')); return; }
    setSaving(true); setSavedMsg('');
    try {
      await api.put(`/api/vessel-profit/${cfg.key}`, { manual: next });
      setManual(next); setSavedMsg(T('✓ حُفظ', '✓ Saved'));
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.message || T('تعذّر الحفظ', 'Save failed'));
    } finally { setSaving(false); }
  };
  const setMonthField = (m: string, k: keyof MonthManual, v: string) =>
    setManual((p) => ({ ...p, months: { ...(p.months || {}), [m]: { ...(p.months?.[m] || {}), [k]: v } } }));
  const setSetting = (k: keyof NonNullable<LineManual['settings']>, v: string) =>
    setManual((p) => ({ ...p, settings: { ...(p.settings || {}), [k]: v } }));

  // ── الفترة ──
  const dataMonths = useMemo(() => [...new Set(voyages.map((v) => v.month))].sort(), [voyages]);
  const calMonths = useMemo(() => monthsBetween(from, to), [from, to]);
  const inRange = useMemo(() => voyages.filter((v) => v.month >= from && v.month <= to), [voyages, from, to]);
  const agg = useMemo(() => aggregate(inRange), [inRange]);

  // ── تكلفة السفينة شهراً بشهر ──
  const monthly = useMemo(() => calMonths.map((m) => {
    const vs = inRange.filter((v) => v.month === m);
    const a = aggregate(vs);
    const c = vesselCostOf(m, manual, cfg.ownership, cfg.hireInLedger, a.ledgerHire);
    const vessel = (c.hire || 0) + c.owned;
    return { m, a, ...c, vessel, net: a.contrib - c.stockAdj - vessel };
  }), [calMonths, inRange, manual, cfg.ownership, cfg.hireInLedger]);

  const hireMissing = cfg.ownership === 'chartered' && monthly.filter((x) => x.hire == null).map((x) => x.m);
  const tot = useMemo(() => monthly.reduce((s, x) => ({
    hire: s.hire + (x.hire || 0), owned: s.owned + x.owned, stockAdj: s.stockAdj + x.stockAdj, net: s.net + x.net,
  }), { hire: 0, owned: 0, stockAdj: 0, net: 0 }), [monthly]);
  const vesselTotal = tot.hire + tot.owned;
  const bunkerCost = (agg.exp.bnk || 0) + tot.stockAdj;
  const netProfit = agg.contrib - tot.stockAdj - vesselTotal;

  // ── ربط الربح بالأعداد ──
  const unit = useMemo(() => {
    const trucks = agg.cnt.tE + agg.cnt.tI, veh = agg.cnt.vE + agg.cnt.vI, pax = agg.cnt.pE + agg.cnt.pI;
    const xs = inRange.map((v) => v.E.trucks + v.I.trucks);
    const ys = inRange.map((v) => v.income - v.commTotal - (v.expTotal - (v.exp.hire || 0)));
    const reg = regress(xs, ys);
    const perVoyVessel = agg.n ? (vesselTotal + tot.stockAdj) / agg.n : 0;
    const beBefore = reg && reg.b > 0 ? -reg.a / reg.b : null;
    const beAfter = reg && reg.b > 0 ? (perVoyVessel - reg.a) / reg.b : null;
    return { trucks, veh, pax, xs, ys, reg, beBefore, beAfter, perVoyVessel };
  }, [inRange, agg, vesselTotal, tot.stockAdj]);

  const lastVoyage = useMemo(() => [...voyages].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0], [voyages]);
  const staleDays = lastVoyage?.date ? Math.floor((Date.now() - Date.parse(lastVoyage.date)) / 86400000) : null;

  // ── الجنيه السودانيّ ──
  const sdg = useMemo(() => [...(manual.sdg || [])].filter((r) => r.date && has(r.rate)).sort((a, b) => a.date.localeCompare(b.date)), [manual.sdg]);

  // ── الرسم: المساهمة مقابل الشاحنات ──
  const Scatter = () => {
    const W = 560, H = 260, P = 40;
    if (!unit.xs.length) return null;
    const xmax = Math.max(...unit.xs, unit.beAfter || 0, 1) * 1.08;
    const ymin = Math.min(...unit.ys, 0), ymax = Math.max(...unit.ys, 1);
    const sx = (x: number) => P + (x / xmax) * (W - 2 * P);
    const sy = (y: number) => H - P - ((y - ymin) / (ymax - ymin || 1)) * (H - 2 * P);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={T('المساهمة مقابل الشاحنات', 'Contribution vs trucks')}>
        <line x1={P} x2={W - P} y1={sy(0)} y2={sy(0)} stroke="#9ca3af" strokeDasharray="4 3" />
        {unit.perVoyVessel > 0 && (
          <g>
            <line x1={P} x2={W - P} y1={sy(unit.perVoyVessel)} y2={sy(unit.perVoyVessel)} stroke="#d97706" strokeDasharray="6 3" />
            <text x={W - P} y={sy(unit.perVoyVessel) - 4} fontSize="10" textAnchor="end" fill="#b45309">{T('تكلفة السفينة للرحلة', 'Vessel cost / voyage')}</text>
          </g>
        )}
        {unit.xs.map((x, i) => (
          <circle key={i} cx={sx(x)} cy={sy(unit.ys[i])} r="4" fill={unit.ys[i] >= unit.perVoyVessel ? '#059669' : '#dc2626'} fillOpacity="0.7" />
        ))}
        {unit.reg && (
          <line x1={sx(0)} y1={sy(unit.reg.a)} x2={sx(xmax)} y2={sy(unit.reg.a + unit.reg.b * xmax)} stroke="#1e3a5f" strokeWidth="2" />
        )}
        <text x={W / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="#6b7280">{T('عدد الشاحنات في الرحلة', 'Trucks per voyage')}</text>
        <text x={P} y={sy(ymax) - 6} fontSize="10" fill="#6b7280">{fmt(ymax)}</text>
        <text x={P} y={sy(ymin) + 12} fontSize="10" fill="#6b7280">{fmt(ymin)}</text>
        <text x={sx(xmax) - 4} y={H - P + 14} fontSize="10" textAnchor="end" fill="#6b7280">{fmt(xmax)}</text>
      </svg>
    );
  };

  const SdgChart = () => {
    if (sdg.length < 2) return null;
    const W = 520, H = 140, P = 30;
    const rs = sdg.map((r) => num(r.rate));
    const lo = Math.min(...rs), hi = Math.max(...rs);
    const t0 = Date.parse(sdg[0].date), t1 = Date.parse(sdg[sdg.length - 1].date) || t0 + 1;
    const sx = (d: string) => P + ((Date.parse(d) - t0) / ((t1 - t0) || 1)) * (W - 2 * P);
    const sy = (v: number) => H - P - ((v - lo) / ((hi - lo) || 1)) * (H - 2 * P);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={T('سعر الجنيه السوداني', 'SDG rate')}>
        <polyline fill="none" stroke="#b45309" strokeWidth="2" points={sdg.map((r) => `${sx(r.date)},${sy(num(r.rate))}`).join(' ')} />
        {sdg.map((r, i) => <circle key={i} cx={sx(r.date)} cy={sy(num(r.rate))} r="3" fill="#b45309" />)}
        <text x={P} y={sy(hi) - 4} fontSize="10" fill="#6b7280">{fmt(hi)}</text>
        <text x={P} y={sy(lo) + 12} fontSize="10" fill="#6b7280">{fmt(lo)}</text>
      </svg>
    );
  };

  const revKeys = Object.keys(REV_LABEL).filter((k) => (agg.revE[k] || 0) + (agg.revI[k] || 0) !== 0);
  const commKeys = Object.keys(COMM_LABEL).filter((k) => agg.comm[k]).sort((a, b) => agg.comm[b] - agg.comm[a]);
  const expKeys = Object.keys(EXP_LABEL).filter((k) => k !== 'hire' && agg.exp[k]).sort((a, b) => agg.exp[b] - agg.exp[a]);
  const Row = ({ label, v, bold, neg, sub }: { label: string; v: number | null; bold?: boolean; neg?: boolean; sub?: string }) => (
    <tr className={bold ? 'font-bold border-t' : ''}>
      <td className={`py-1.5 px-3 ${sub ? 'pr-8 text-gray-600' : ''}`}>{label}{sub && <span className="text-xs text-gray-400"> {sub}</span>}</td>
      <td className={`py-1.5 px-3 text-left tabular-nums ${v != null && v < 0 ? 'text-red-600' : ''}`}>{v == null ? '—' : `${neg && v ? '(' : ''}${fmt(Math.abs(v))}${neg && v ? ')' : ''}`}</td>
      <td className="py-1.5 px-3 text-left tabular-nums text-gray-400 text-xs">{v != null && agg.income ? pct(v / agg.income) : ''}</td>
    </tr>
  );

  if (loading) return <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">{T('جارٍ تحميل رحلات الخطّ…', 'Loading line voyages…')}</div>;

  return (
    <div className="space-y-4" dir={en ? 'ltr' : 'rtl'}>
      {/* ── الرأس والفترة ── */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <p className="text-lg font-bold text-gray-800">{T(`ربحيّة ${name} — خطّ جدّة/سواكن`, `${name} profitability — Jeddah/Suakin line`)}</p>
          <p className="text-xs text-gray-500">
            {cfg.ownership === 'chartered' ? T('مركبٌ مستأجر', 'Chartered-in vessel') : T('مركبٌ مملوك', 'Owned vessel')}
            {' · '}{T('من الشيت الموحّد', 'From the unified sheet')}{fetchedAt ? ` · ${new Date(fetchedAt).toLocaleString(en ? 'en-GB' : 'ar-EG')}` : ''}
          </p>
        </div>
        {dataMonths.length > 0 && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{T('من', 'From')}</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2">{dataMonths.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{T('إلى', 'To')}</label>
              <select value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2">{dataMonths.filter((m) => m >= from).map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 ms-auto">
          {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
          <button onClick={() => setShowInputs((s) => !s)} className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700">{T('✏️ المدخلات اليدويّة', '✏️ Manual inputs')}</button>
          <button onClick={load} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">{T('🔄 تحديث', '🔄 Refresh')}</button>
          <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">{T('🖨️ طباعة', '🖨️ Print')}</button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!voyages.length && !error && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
          {T('لا رحلات لهذا المركب على خطّ جدّة/سواكن في الشيت الموحّد بعد — يلزم تسجيل دفتره في السحب.', 'No voyages on the Jeddah/Suakin line yet — its ledger must be registered in the import.')}
        </div>
      )}

      {voyages.length > 0 && (
        <>
          {/* ── تنبيهات ── */}
          <div className="space-y-2">
            {staleDays != null && staleDays > 14 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-sm">
                ⚠️ {T(`آخر رحلةٍ في الدفتر بتاريخ ${lastVoyage?.date} — قبل ${staleDays} يوماً. الدفتر لم يُحدَّث على درايف.`, `Latest voyage in the ledger is ${lastVoyage?.date} — ${staleDays} days ago. The ledger has not been updated on Drive.`)}
              </div>
            )}
            {hireMissing && hireMissing.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-sm">
                ⚠️ {T(`الإيجار غير مُدخل لـ ${hireMissing.length} شهر (${hireMissing.join('، ')}) — الصافي أدناه قبل خصمه في هذه الشهور. أدخله من «المدخلات اليدويّة».`,
                  `Hire not entered for ${hireMissing.length} month(s) (${hireMissing.join(', ')}) — net below excludes it. Enter it under Manual inputs.`)}
              </div>
            )}
            {agg.gapMax > 1 && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                ⛔ {T(`بنود بعض الرحلات لا تساوي إجماليّاتها (أكبر فرق ${fmt(agg.gapMax, 2)}) — التفصيل ناقص من السحب.`, `Some voyages' items don't add up to their totals (max gap ${fmt(agg.gapMax, 2)}) — details missing from import.`)}
              </div>
            )}
          </div>

          {/* ── المؤشّرات ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={`${netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} text-white rounded-xl p-4`}>
              <p className="text-xs opacity-80">{hireMissing && hireMissing.length ? T('الصافي (قبل إيجارٍ ناقص)', 'Net (hire incomplete)') : T('صافي الربح', 'Net profit')}</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">{fmt(netProfit)}</p>
              <p className="text-xs opacity-80 mt-1">{T('هامش', 'Margin')} {agg.income ? pct(netProfit / agg.income) : '—'}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('الإيراد', 'Revenue')}</p><p className="text-xl font-bold tabular-nums">{fmt(agg.income)}</p><p className="text-xs text-gray-400">{agg.n} {T('رحلة', 'voyages')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('مساهمة الرحلات', 'Voyage contribution')}</p><p className="text-xl font-bold tabular-nums">{fmt(agg.contrib)}</p><p className="text-xs text-gray-400">{T('قبل تكلفة السفينة', 'Before vessel cost')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{cfg.ownership === 'chartered' ? T('الإيجار', 'Hire') : T('تكلفة السفينة', 'Vessel cost')}</p><p className="text-xl font-bold tabular-nums">{fmt(vesselTotal)}</p><p className="text-xs text-gray-400">{agg.n ? `${fmt(vesselTotal / agg.n)} ${T('للرحلة', '/ voyage')}` : ''}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('الصافي للرحلة', 'Net / voyage')}</p><p className="text-xl font-bold tabular-nums">{agg.n ? fmt(netProfit / agg.n) : '—'}</p><p className="text-xs text-gray-400">{T('بعد تكلفة السفينة', 'After vessel cost')}</p></div>
          </div>

          {/* ── قائمة الدخل ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-800 mb-2">{T('قائمة الدخل', 'Income statement')} <span className="text-xs text-gray-400 font-normal">{from} → {to}</span></h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('الإيراد', 'Revenue')}</td></tr>
                  {revKeys.map((k) => <Row key={k} label={L(REV_LABEL, k)} v={(agg.revE[k] || 0) + (agg.revI[k] || 0)} sub=" " />)}
                  <Row label={T('إجمالي الإيراد', 'Total revenue')} v={agg.income} bold />
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('العمولات', 'Commissions')}</td></tr>
                  {commKeys.map((k) => <Row key={k} label={L(COMM_LABEL, k)} v={agg.comm[k]} neg sub=" " />)}
                  <Row label={T('إجمالي العمولات', 'Total commissions')} v={agg.commTotal} neg bold />
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('مصاريف الرحلات', 'Voyage expenses')}</td></tr>
                  {expKeys.map((k) => <Row key={k} label={L(EXP_LABEL, k)} v={agg.exp[k]} neg sub=" " />)}
                  <Row label={T('إجمالي مصاريف الرحلات', 'Total voyage expenses')} v={agg.expTotal - agg.ledgerHire} neg bold />
                  <Row label={T('مساهمة الرحلات', 'Voyage contribution')} v={agg.contrib} bold />
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('تكلفة السفينة', 'Vessel cost')}</td></tr>
                  <Row label={T('تسوية مخزون البنكر (أوّل − آخر المدّة)', 'Bunker stock adjustment (open − close)')} v={tot.stockAdj} neg sub=" " />
                  {cfg.ownership === 'chartered'
                    ? <Row label={cfg.hireInLedger ? T('الإيجار — من الدفتر', 'Hire — from ledger') : T('الإيجار — يدويّ', 'Hire — manual')} v={tot.hire} neg sub=" " />
                    : OWNED_COSTS.map((c) => <Row key={c.k} label={en ? c.en : c.ar} v={monthly.reduce((s, x) => s + num(manual.months?.[x.m]?.[c.k]), 0)} neg sub=" " />)}
                  <Row label={T('صافي الربح', 'Net profit')} v={netProfit} bold />
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">{T('تكلفة البنكر الفعليّة', 'Actual bunker cost')}: {fmt(bunkerCost)} {T('= مشتريات الدفتر + أوّل المدّة − آخر المدّة', '= ledger purchases + opening − closing')}</p>
            </div>

            {/* ── ربط الربح بالأعداد ── */}
            <div className="bg-white rounded-xl shadow p-4 space-y-3">
              <h3 className="font-bold text-gray-800">{T('الربح والأعداد', 'Profit and volumes')}</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { l: T('شاحنات', 'Trucks'), n: unit.trucks, per: agg.n ? unit.trucks / agg.n : 0, rev: (agg.revE.tr || 0) + (agg.revI.tr || 0) },
                  { l: T('سيارات', 'Vehicles'), n: unit.veh, per: agg.n ? unit.veh / agg.n : 0, rev: (agg.revE.vh || 0) + (agg.revI.vh || 0) },
                  { l: T('ركّاب', 'Passengers'), n: unit.pax, per: agg.n ? unit.pax / agg.n : 0, rev: (agg.revE.px || 0) + (agg.revI.px || 0) },
                ].map((u) => (
                  <div key={u.l} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500">{u.l}</p>
                    <p className="font-bold tabular-nums">{fmt(u.n)}</p>
                    <p className="text-xs text-gray-500">{fmt(u.per, 1)} {T('للرحلة', '/ voy')}</p>
                    <p className="text-xs text-gray-500">{u.n ? fmt(u.rev / u.n) : '—'} {T('إيراد الوحدة', 'rev / unit')}</p>
                  </div>
                ))}
              </div>
              <Scatter />
              <div className="text-sm space-y-1">
                {unit.reg ? (
                  <>
                    <p>{T('كلّ شاحنةٍ إضافيّة تضيف للمساهمة نحو', 'Each extra truck adds about')} <b className="tabular-nums">{fmt(unit.reg.b)}</b> {T('دولار', 'USD')}.</p>
                    <p>{T('نقطة التعادل قبل تكلفة السفينة', 'Break-even before vessel cost')}: <b className="tabular-nums">{unit.beBefore != null ? fmt(Math.max(0, unit.beBefore)) : '—'}</b> {T('شاحنة للرحلة', 'trucks / voyage')}</p>
                    <p>{T('نقطة التعادل بعد تكلفة السفينة', 'Break-even after vessel cost')}: <b className="tabular-nums">{unit.beAfter != null && unit.perVoyVessel > 0 ? fmt(Math.max(0, unit.beAfter)) : '—'}</b> {T('شاحنة للرحلة', 'trucks / voyage')}</p>
                    <p className="text-xs text-gray-400">{T(`دقّة العلاقة ${pct(unit.reg.r2)} — الباقي يفسّره الركّاب وأسعار الرحلة. النقاط الحمراء رحلاتٌ لم تغطِّ تكلفة السفينة.`, `Fit ${pct(unit.reg.r2)} — the rest is passengers and pricing. Red points did not cover vessel cost.`)}</p>
                  </>
                ) : <p className="text-xs text-gray-400">{T('الرحلات أقلّ من أن تُحسب منها علاقة.', 'Too few voyages to fit a relationship.')}</p>}
              </div>
            </div>
          </div>

          {/* ── الاتّجاهان ── */}
          <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-800 mb-2">{T('الاتّجاهان', 'The two directions')}</h3>
            {(() => {
              const n = agg.n || 1;
              const cap = { t: num(manual.settings?.capTrucks), v: num(manual.settings?.capVeh), p: num(manual.settings?.capPax) };
              const revOf = (r: Record<string, number>) => sumO(r);
              const rows: { l: string; e: number; i: number; d?: number; cap?: number }[] = [
                { l: T('الشاحنات للرحلة', 'Trucks / voyage'), e: agg.cnt.tE / n, i: agg.cnt.tI / n, d: 1, cap: cap.t },
                { l: T('السيارات للرحلة', 'Vehicles / voyage'), e: agg.cnt.vE / n, i: agg.cnt.vI / n, d: 1, cap: cap.v },
                { l: T('الركّاب للرحلة', 'Passengers / voyage'), e: agg.cnt.pE / n, i: agg.cnt.pI / n, d: 0, cap: cap.p },
                { l: T('إيراد الشاحنة', 'Revenue / truck'), e: agg.cnt.tE ? (agg.revE.tr || 0) / agg.cnt.tE : 0, i: agg.cnt.tI ? (agg.revI.tr || 0) / agg.cnt.tI : 0 },
                { l: T('إيراد الراكب', 'Revenue / passenger'), e: agg.cnt.pE ? (agg.revE.px || 0) / agg.cnt.pE : 0, i: agg.cnt.pI ? (agg.revI.px || 0) / agg.cnt.pI : 0 },
                { l: T('الإيراد للرحلة', 'Revenue / voyage'), e: revOf(agg.revE) / n, i: revOf(agg.revI) / n },
              ];
              const totE = revOf(agg.revE), totI = revOf(agg.revI);
              return (
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b">
                    <th className="py-1.5 px-3 text-start">{T('المؤشّر', 'Metric')}</th>
                    <th className="py-1.5 px-3 text-left">{T('جدّة ← سواكن', 'Jeddah → Suakin')}</th>
                    <th className="py-1.5 px-3 text-left">{T('سواكن ← جدّة', 'Suakin → Jeddah')}</th>
                    <th className="py-1.5 px-3 text-left">{T('الإياب ÷ الذهاب', 'Return ÷ outbound')}</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.l} className="border-b last:border-0">
                        <td className="py-1.5 px-3">{r.l}</td>
                        <td className="py-1.5 px-3 text-left tabular-nums">{fmt(r.e, r.d ?? 0)}{r.cap ? <span className="text-xs text-gray-400"> · {pct(r.e / r.cap)}</span> : null}</td>
                        <td className="py-1.5 px-3 text-left tabular-nums">{fmt(r.i, r.d ?? 0)}{r.cap ? <span className="text-xs text-gray-400"> · {pct(r.i / r.cap)}</span> : null}</td>
                        <td className="py-1.5 px-3 text-left tabular-nums">{r.e ? pct(r.i / r.e) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold"><td className="py-1.5 px-3">{T('نصيب الاتّجاه من الإيراد', 'Share of revenue')}</td>
                      <td className="py-1.5 px-3 text-left">{agg.income ? pct(totE / agg.income) : '—'}</td>
                      <td className="py-1.5 px-3 text-left">{agg.income ? pct(totI / agg.income) : '—'}</td><td /></tr>
                  </tbody>
                </table>
              );
            })()}
            <p className="text-xs text-gray-400 mt-2">{T('نسبة الإشغال تظهر بجوار الأعداد حين تُدخَل طاقة المركب في «المدخلات اليدويّة».', 'Occupancy shows next to counts once capacity is entered under Manual inputs.')}</p>
          </div>

          {/* ── الشهور ── */}
          <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-800 mb-2">{T('شهراً بشهر', 'Month by month')}</h3>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr className="text-gray-500 border-b"><th className="py-1.5 px-2 text-start">{T('البند', 'Line')}</th>{monthly.map((x) => <th key={x.m} className="py-1.5 px-2 text-left">{x.m}</th>)}<th className="py-1.5 px-2 text-left">{T('الإجمالي', 'Total')}</th></tr></thead>
              <tbody>
                {([
                  [T('الرحلات', 'Voyages'), (x: any) => x.a.n, agg.n],
                  [T('الشاحنات', 'Trucks'), (x: any) => x.a.cnt.tE + x.a.cnt.tI, unit.trucks],
                  [T('الركّاب', 'Passengers'), (x: any) => x.a.cnt.pE + x.a.cnt.pI, unit.pax],
                  [T('الإيراد', 'Revenue'), (x: any) => x.a.income, agg.income],
                  [T('العمولات', 'Commissions'), (x: any) => -x.a.commTotal, -agg.commTotal],
                  [T('مصاريف الرحلات', 'Voyage expenses'), (x: any) => -(x.a.expTotal - x.a.ledgerHire), -(agg.expTotal - agg.ledgerHire)],
                  [T('مساهمة الرحلات', 'Contribution'), (x: any) => x.a.contrib, agg.contrib],
                  [T('تسوية المخزون', 'Stock adj.'), (x: any) => -x.stockAdj, -tot.stockAdj],
                  [cfg.ownership === 'chartered' ? T('الإيجار', 'Hire') : T('تكلفة السفينة', 'Vessel cost'), (x: any) => (cfg.ownership === 'chartered' && x.hire == null ? null : -x.vessel), -vesselTotal],
                  [T('صافي الربح', 'Net profit'), (x: any) => x.net, netProfit],
                ] as [string, (x: any) => number | null, number][]).map(([l, f, t], i) => (
                  <tr key={l} className={`border-b last:border-0 ${i === 6 || i === 9 ? 'font-bold' : ''}`}>
                    <td className="py-1.5 px-2">{l}</td>
                    {monthly.map((x) => { const v = f(x); return <td key={x.m} className={`py-1.5 px-2 text-left tabular-nums ${v != null && v < 0 ? 'text-red-600' : ''}`}>{v == null ? <span className="text-amber-600">{T('ناقص', 'missing')}</span> : fmt(v)}</td>; })}
                    <td className={`py-1.5 px-2 text-left tabular-nums ${t < 0 ? 'text-red-600' : ''}`}>{fmt(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── المقارنة بمراكب الخطّ ── */}
          {cfg.peers.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-1">{T('المقارنة بمراكب الخطّ', 'Compared with line peers')} <span className="text-xs text-gray-400 font-normal">{from} → {to}</span></h3>
              <p className="text-xs text-gray-400 mb-2">{T('المساهمة قبل تكلفة السفينة تُقارَن دائماً. والصافي بعدها يظهر حين يكتمل الإيجار أو تكاليف السفينة لكلّ مركب.', 'Contribution before vessel cost is always comparable. Net after it shows once hire or vessel costs are complete for each vessel.')}</p>
              {(() => {
                const self = peerMetrics(inRange, manual, cfg.ownership, cfg.hireInLedger, calMonths);
                const cols = [{ k: cfg.key, n: name, m: self }, ...cfg.peers.map((p) => {
                  const d = peers[p.key];
                  const vs = (d?.voyages || []).filter((v) => v.month >= from && v.month <= to);
                  return { k: p.key, n: en ? p.nameEn : p.nameAr, m: d ? peerMetrics(vs, d.manual, p.ownership, p.hireInLedger, calMonths) : null };
                })];
                const lines: [string, (m: ReturnType<typeof peerMetrics>) => string][] = [
                  [T('الرحلات', 'Voyages'), (m) => fmt(m.n)],
                  [T('شاحنات الرحلة: ذهاب / إياب', 'Trucks / voyage: out / back'), (m) => `${fmt(m.trucksE, 1)} / ${fmt(m.trucksI, 1)}`],
                  [T('ركّاب الرحلة', 'Passengers / voyage'), (m) => fmt(m.pax)],
                  [T('إيراد الشاحنة', 'Revenue / truck'), (m) => fmt(m.revPerTruck)],
                  [T('الإيراد للرحلة', 'Revenue / voyage'), (m) => fmt(m.incomePV)],
                  [T('البنكر للرحلة', 'Bunker / voyage'), (m) => fmt(m.bunkerPV)],
                  [T('رسوم الموانئ للرحلة', 'Port fees / voyage'), (m) => fmt(m.portPV)],
                  [T('المساهمة للرحلة', 'Contribution / voyage'), (m) => fmt(m.contribPV)],
                  [T('هامش المساهمة', 'Contribution margin'), (m) => pct(m.margin)],
                  [T('تكلفة السفينة للرحلة', 'Vessel cost / voyage'), (m) => (m.vesselPV == null ? T('ناقص', 'missing') : fmt(m.vesselPV))],
                  [T('الصافي للرحلة', 'Net / voyage'), (m) => (m.netPV == null ? T('ناقص', 'missing') : fmt(m.netPV))],
                ];
                return (
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500 border-b"><th className="py-1.5 px-3 text-start">{T('المؤشّر', 'Metric')}</th>{cols.map((c) => <th key={c.k} className="py-1.5 px-3 text-left">{c.n}</th>)}</tr></thead>
                    <tbody>{lines.map(([l, f], i) => (
                      <tr key={l} className={`border-b last:border-0 ${i >= 7 ? 'font-semibold' : ''}`}>
                        <td className="py-1.5 px-3">{l}</td>
                        {cols.map((c) => <td key={c.k} className="py-1.5 px-3 text-left tabular-nums">{c.m ? f(c.m) : '—'}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                );
              })()}
            </div>
          )}

          {/* ── الجنيه السودانيّ ── */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-800 mb-2">{T('سعر الجنيه السودانيّ', 'Sudanese pound rate')} <span className="text-xs text-gray-400 font-normal">{T('جنيه لكلّ دولار', 'SDG per USD')}</span></h3>
            {sdg.length ? (
              <div className="grid md:grid-cols-3 gap-4 items-center">
                <div className="space-y-1 text-sm">
                  <p>{T('آخر سعر', 'Latest')}: <b className="tabular-nums">{fmt(num(sdg[sdg.length - 1].rate))}</b> <span className="text-xs text-gray-400">{sdg[sdg.length - 1].date}</span></p>
                  {sdg.length > 1 && (() => {
                    const first = num(sdg[0].rate), last = num(sdg[sdg.length - 1].rate);
                    return <p>{T('فقد الجنيه منذ', 'SDG lost since')} {sdg[0].date}: <b className={last > first ? 'text-red-600' : 'text-emerald-600'}>{pct(1 - first / last)}</b> {T('من قيمته', 'of its value')}</p>;
                  })()}
                </div>
                <div className="md:col-span-2"><SdgChart /></div>
              </div>
            ) : <p className="text-sm text-gray-400">{T('لا أسعار بعد — أضفها من «المدخلات اليدويّة».', 'No rates yet — add them under Manual inputs.')}</p>}
          </div>

          {/* ── المدخلات اليدويّة ── */}
          {showInputs && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">{T('المدخلات اليدويّة', 'Manual inputs')}</h3>
                <button onClick={() => save(manual)} disabled={saving || !manualLoaded} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '…' : T('💾 حفظ', '💾 Save')}</button>
              </div>

              <div className="grid md:grid-cols-4 gap-3">
                {cfg.ownership === 'chartered' && !cfg.hireInLedger && (
                  <label className="text-sm">{T('الإيجار اليوميّ (دولار)', 'Daily hire (USD)')}
                    <input value={manual.settings?.hireDaily || ''} onChange={(e) => setSetting('hireDaily', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal" />
                    <span className="text-xs text-gray-500">{T('يُضرب في أيّام الشهر ما لم يُدخَل مبلغ الشهر', 'Times days in month unless a monthly amount is entered')}</span>
                  </label>
                )}
                {([['capTrucks', T('طاقة الشاحنات', 'Truck capacity')], ['capVeh', T('طاقة السيارات', 'Vehicle capacity')], ['capPax', T('طاقة الركّاب', 'Passenger capacity')]] as const).map(([k, l]) => (
                  <label key={k} className="text-sm">{l}
                    <input value={manual.settings?.[k] || ''} onChange={(e) => setSetting(k, e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal" />
                  </label>
                ))}
              </div>

              <div className="border-t border-amber-200 pt-3">
                <div className="flex items-end gap-3 mb-2">
                  <label className="text-sm">{T('الشهر', 'Month')}
                    <select value={editMonth} onChange={(e) => setEditMonth(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2 bg-white">
                      {monthsBetween(dataMonths[0] || '', dataMonths[dataMonths.length - 1] || '').map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                </div>
                {editMonth && (
                  <div className="grid md:grid-cols-4 gap-3">
                    {cfg.ownership === 'chartered' && !cfg.hireInLedger && (
                      <label className="text-sm">{T('إيجار الشهر (دولار)', 'Month hire (USD)')}
                        <input value={manual.months?.[editMonth]?.hire || ''} onChange={(e) => setMonthField(editMonth, 'hire', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal"
                          placeholder={has(manual.settings?.hireDaily) ? fmt(num(manual.settings?.hireDaily) * daysIn(editMonth)) : ''} />
                      </label>
                    )}
                    <label className="text-sm">{T('مخزون البنكر أوّل الشهر (دولار)', 'Bunker stock — opening (USD)')}
                      <input value={manual.months?.[editMonth]?.bunkerOpen || ''} onChange={(e) => setMonthField(editMonth, 'bunkerOpen', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal" />
                    </label>
                    <label className="text-sm">{T('مخزون البنكر آخر الشهر (دولار)', 'Bunker stock — closing (USD)')}
                      <input value={manual.months?.[editMonth]?.bunkerClose || ''} onChange={(e) => setMonthField(editMonth, 'bunkerClose', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal" />
                    </label>
                    {cfg.ownership === 'owned' && OWNED_COSTS.map((c) => (
                      <label key={c.k} className="text-sm">{en ? c.en : c.ar}
                        <input value={manual.months?.[editMonth]?.[c.k] || ''} onChange={(e) => setMonthField(editMonth, c.k, e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white" inputMode="decimal" />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-amber-200 pt-3">
                <p className="text-sm font-semibold mb-2">{T('سعر الجنيه السودانيّ — جنيه لكلّ دولار', 'Sudanese pound — SDG per USD')}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <input type="date" value={sdgDate} onChange={(e) => setSdgDate(e.target.value)} className="border rounded-lg px-3 py-2 bg-white" />
                  <input value={sdgRate} onChange={(e) => setSdgRate(e.target.value)} placeholder={T('السعر', 'Rate')} className="border rounded-lg px-3 py-2 bg-white w-32" inputMode="decimal" />
                  <button
                    onClick={() => {
                      if (!sdgDate || !has(sdgRate)) return;
                      setManual((p) => ({ ...p, sdg: [...(p.sdg || []).filter((r) => r.date !== sdgDate), { date: sdgDate, rate: sdgRate }] }));
                      setSdgDate(''); setSdgRate('');
                    }}
                    className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700">{T('➕ إضافة', '➕ Add')}</button>
                </div>
                {sdg.length > 0 && (
                  <table className="text-sm mt-2">
                    <tbody>{[...sdg].reverse().map((r) => (
                      <tr key={r.date}>
                        <td className="py-1 px-3 tabular-nums">{r.date}</td>
                        <td className="py-1 px-3 tabular-nums">{fmt(num(r.rate))}</td>
                        <td className="py-1 px-3"><button onClick={() => setManual((p) => ({ ...p, sdg: (p.sdg || []).filter((x) => x.date !== r.date) }))} className="text-red-500 text-xs">{T('حذف', 'Delete')}</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
              <p className="text-xs text-gray-500">{T('التعديلات لا تُحفظ إلّا بزرّ «حفظ».', 'Changes are kept only after Save.')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

