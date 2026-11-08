/*
 * مونتي في نوافذ تقارير بوسيدون — بقرار المالك ٣١ أكتوبر ٢٠٢٦.
 *
 * المحوِّل يقرأ حزمة مونتي (`monte-pms/1`) لشهرٍ أو مدى، ويُخرج ما تقرؤه النوافذ:
 * `ExecData` للإداريّ و`FinData` للماليّ والتنفيذيّ. ولا يحسب رقماً لم تحسمه الحزمة:
 *
 *  - الإيراد والمصروفات من حقول الرحلات التي خرجت في المدى (شهر `dep`).
 *  - الصادر = الذهاب جدّة ← سواكن، والوارد = العودة. وأذون التسليم بلا اتّجاه
 *    فتُعرض إيراداً مستقلّاً (`manualRev`) كما تُعرض الإيرادات اليدويّة عند بوسيدون.
 *  - مصروفات الوكلاء: جانب جدّة (E) وجانب سواكن (I) بمفاتيح حقول الحزمة.
 *  - البنكر = وقود الرحلات بالمتوسّط المرجَّح + وقود التموضع (`pos`) في أشهر المدى.
 *  - المرتّبات = مرتّبات CFM بعملتيها.
 *  - سطر C = بقيّة تكاليف السفينة الثابتة: التأمين · مصاريف البحّارة · نقديّة
 *    القبطان · وبنود `fixed_items` بأسمائها.
 *
 * فالصافي النهائي = مجموع صافي أشهر المدى في الحزمة بناءً، ويُفحص ذلك في الاختبار.
 *
 * وأشهر ما قبل التشغيل (قبل أوّل شهرٍ فيه رحلات في الحزمة) إن دخلت مدىً فيه رحلات
 * — بقرار المالك ٣١ أكتوبر — تُجمع كلّ تكاليفها (مرتّبات · تأمين · تموضع · ثابتة)
 * بنداً واحداً في سطر C باسمه، ولا تُوزَّع على الرحلات (`profile.preLine`).
 */
import type { ExecData } from '@/app/dashboard/reports/VesselExecReport';
import type { FinData, RevRow } from '@/app/dashboard/reports/VesselFinReport';
import type { ReportProfile } from './reportProfile';
import { voyageTotals, type MontePackage, fromStatement } from './montePackage';

const r2 = (n: number) => Math.round(n * 100) / 100;
const n0 = (x: number | null | undefined) => (typeof x === 'number' && isFinite(x) ? x : 0);
const monthOf = (d: string) => String(d || '').slice(0, 7);

/** جانب جدّة (الصادر) وجانب سواكن (الوارد) — المفتاح حقل الحزمة */
export const MONTE_EXP_E = ['cost_port_jed', 'cost_comm_jed', 'cost_water', 'cost_agent_adj', 'cost_gifts', 'cost_catering'] as const;
export const MONTE_EXP_I = ['cost_port_suk', 'cost_comm_suk30', 'cost_comm_suk'] as const;
export const MONTE_LABELS: Record<string, string> = {
  cost_port_jed: 'ميناء جدّة ومصاريف الشحن والتفريغ',
  cost_comm_jed: 'عمولة وكيل جدّة',
  cost_water: 'مياه',
  cost_agent_adj: 'فرق كشف وكيل جدّة عن ملفّ الربح',
  cost_gifts: 'هدايا الركّاب',
  cost_catering: 'كاترينج على الرحلة',
  cost_port_suk: 'دخول وخروج ميناء سواكن',
  cost_comm_suk30: 'عمولة وكيل سواكن 30%',
  cost_comm_suk: 'عمولة وكيل سواكن (بضاعة وركّاب)',
};
export const MONTE_BUCKETS: Record<string, string> = {
  fuel: 'fuel', salaries: 'fixed', purchases: 'purchases',
  cost_port_jed: 'port', cost_water: 'port', cost_port_suk: 'port',
  cost_comm_jed: 'agent', cost_comm_suk30: 'agent', cost_comm_suk: 'agent',
  cost_agent_adj: 'other', cost_gifts: 'other', cost_catering: 'other',
};
export const MONTE_REV_ROWS: readonly RevRow[] = [
  { key: 'cargo', cKey: 'cargoC', label: 'نولون البضاعة (شاحنات · مقطورات · سيارات)' },
  { key: 'pass', cKey: 'passC', label: 'نولون الركّاب' },
];
export const MONTE_SIDES = { agentExport: 'ذهاب جدّة ← سواكن', agentImport: 'عودة سواكن ← جدّة' };

export interface MonteReportData {
  months: string[];
  exec: ExecData;
  fin: FinData;
  purchases: { byItem: { name: string; value: number }[]; items: never[]; total: number };
  labelOf: Record<string, string>;
  profile: ReportProfile;
  /** صافي أشهر المدى كما في الحزمة — الصافي النهائي يساويه بناءً */
  packageNet: number;
}

export function monteReportData(p: MontePackage, from: string, to: string = from): MonteReportData {
  // عمّان (مستأجرة، ٣ نوفمبر ٢٠٢٦) بالشكل نفسه: سطر C عندها تكلفة السفينة بإيجارها، والأذون من ملفّ وكيل سواكن
  const chartered = p.vessel?.ownership === 'مستأجرة';
  // دليلة (مملوكة، ٨ نوفمبر ٢٠٢٦) من كشف الوكيل كعمّان: الأذون بوزنها في الكتلة الشهريّة، والوقود على مدّة الرحلة
  const ownedStmt = !chartered && fromStatement(p);
  const [a, b] = from <= to ? [from, to] : [to, from];
  const inRange = (m: string) => m >= a && m <= b;
  const months = p.monthly.map((m) => m.month).filter(inRange);
  const monthly = p.monthly.filter((m) => inRange(m.month));
  const voyages = p.voyages
    .filter((v) => inRange(monthOf(v.dep)))
    .sort((x, y) => String(x.dep).localeCompare(String(y.dep)));
  const sum = (f: (v: (typeof voyages)[number]) => number) => r2(voyages.reduce((s, v) => s + n0(f(v)), 0));
  /*
   * أشهر ما قبل التشغيل تُفصل حين يضمّ المدى رحلات؛ فإن لم يضمّها فلا توزيع
   * يُضلَّل، وتبقى البنود بأسمائها.
   */
  const firstLine = p.monthly.find((m) => (m.trips || 0) > 0)?.month || '';
  const preMonths = voyages.length && firstLine ? monthly.filter((m) => m.month < firstLine) : [];
  const opMonths = monthly.filter((m) => !preMonths.includes(m));
  const sumM = (f: (m: (typeof monthly)[number]) => number | null | undefined, ms = opMonths) =>
    r2(ms.reduce((s, m) => s + n0(f(m)), 0));
  const preCost = r2(-sumM((m) => m.net, preMonths));

  // ── الحمولات: الركّاب من ملفّ الربح، والمركبات من الإشغال (بعض الرِّجال بلا أرقام) ──
  const ids = new Set(voyages.map((v) => String(v.voyage)));
  const legs = (p.legs || []).filter((l) => ids.has(String(l.voyage)));
  const legSum = (dir: string, f: (l: (typeof legs)[number]) => number | null) =>
    legs.filter((l) => l.direction === dir).reduce((s, l) => s + n0(f(l)), 0);
  const side = (dir: 'ذهاب' | 'عودة', keys: readonly string[]) => {
    const out = dir === 'ذهاب';
    const exp: Record<string, number> = {};
    for (const k of keys) exp[k] = sum((v) => (v as unknown as Record<string, number>)[k]);
    const cargo = sum((v) => (out ? v.rev_cargo_out : v.rev_cargo_ret));
    const pass = sum((v) => (out ? v.rev_pax_out : v.rev_pax_ret));
    const truckC = legSum(dir, (l) => n0(l.trucks) + n0(l.trailers));
    const vehC = legSum(dir, (l) => l.cars);
    // الطبالي عدٌّ مستقلّ في «المنقولات»، ولا تدخل عدد نولون البضاعة (مركبات)
    const palletC = legSum(dir, (l) => l.pallets ?? null);
    return {
      exp, cargo, pass, discharge: 0,
      passC: sum((v) => (out ? v.pax_out : v.pax_ret)), truckC, vehC, palletC, cargoC: truckC + vehC,
    };
  };
  const E = side('ذهاب', MONTE_EXP_E), I = side('عودة', MONTE_EXP_I);
  const expE = r2(Object.values(E.exp).reduce((s, x) => s + x, 0));
  const expI = r2(Object.values(I.exp).reduce((s, x) => s + x, 0));
  const revE = r2(E.cargo + E.pass), revI = r2(I.cargo + I.pass);
  const manualRev = [
    { key: 'rev_do', label: chartered ? 'أذون التسليم (ملفّ وكيل سواكن)' : ownedStmt ? 'أذون التسليم (كتلة الشهر بوزن الأذون)' : 'أذون التسليم (تقديريّة)', amount: sum((v) => v.rev_do) },
    { key: 'rev_other', label: 'إيرادات أخرى', amount: sum((v) => v.rev_other) },
  ];
  const revenue = r2(revE + revI + manualRev.reduce((s, r) => s + r.amount, 0));

  // ── البنكر والمرتّبات وسطر C — التكاليف موجبةً كما تقرؤها النوافذ ──
  const voyageFuel = sum((v) => v.cost_fuel);
  const positioning = r2(-sumM((m) => m.pos));
  const bunkerCost = r2(voyageFuel + positioning);
  const byItemMap = new Map<string, number>();
  const add = (name: string, v: number) => { if (Math.abs(v) >= 0.005) byItemMap.set(name, r2((byItemMap.get(name) || 0) + v)); };
  add(chartered ? 'تأمين P&I' : 'التأمين (من الوثائق)', -sumM((m) => m.ins));
  add('مصاريف البحّارة', -sumM((m) => m.crew_misc));
  add(chartered ? 'نقديّة القبطان (مرتّبات الطاقم)' : 'نقديّة القبطان', -sumM((m) => m.ctm));
  for (const m of opMonths) for (const i of m.fixed_items || []) add(i.label, -n0(i.usd));
  const byItem = [...byItemMap].map(([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value);
  /*
   * الثابتة في الحزمة مجموعُ مكوّناتٍ غير مقرَّبة ثمّ قُرّبت، والمكوّنات قُرّب كلٌّ وحده —
   * فقد يفترقان بسنت (أكتوبر: 140,205.49 مقابل 140,205.50). والصافي يجب أن يطابق الكارت،
   * فيُحمَّل فرق التقريب (دون خمسة سنتات) على أكبر بند.
   */
  const salariesOf = -sumM((m) => n0(m.sal_usd) + n0(m.sal_eur));
  const cent = r2(-sumM((m) => m.fixed) - salariesOf - byItem.reduce((s, x) => s + x.value, 0));
  if (byItem.length && cent !== 0 && Math.abs(cent) < 0.05) byItem[0] = { ...byItem[0], value: r2(byItem[0].value + cent) };
  const preLabel = preMonths.length
    ? { ar: `تكاليف ما قبل التشغيل (${preMonths[0].month} → ${preMonths[preMonths.length - 1].month})`,
        en: `Pre-operating costs (${preMonths[0].month} → ${preMonths[preMonths.length - 1].month})` }
    : null;
  if (preLabel && preCost) byItem.push({ name: preLabel.ar, value: preCost });
  const purchasesTotal = r2(byItem.reduce((s, x) => s + x.value, 0));

  const salaries = r2(salariesOf);
  const net = r2(revenue - expE - expI - bunkerCost - salaries);
  const count = voyages.length;

  const labelOf: Record<string, string> = chartered || ownedStmt
    ? { ...MONTE_LABELS, cost_comm_suk30: 'كنزي 30% من الأذون', cost_catering: 'إقفال الكاترينج (كشف الوكيل)' }
    : { ...MONTE_LABELS };
  const cLabel = chartered
    ? { ar: 'تكلفة السفينة (إيجار · تأمين · طاقم)', en: 'Vessel cost (hire · insurance · crew)' }
    : ownedStmt
      ? { ar: 'تكاليف السفينة (نقديّة القبطان · التكلفة الثابتة · وقود التوقّف)', en: 'Vessel costs (cash to master · fixed cost · idle fuel)' }
      : { ar: 'تكاليف السفينة الثابتة (تأمين · بحّارة · قبطان · مصاريف السفينة)', en: 'Fixed Vessel Costs (insurance · crew · master · vessel costs)' };
  const costLines: ExecData['costLines'] = [{ key: 'fuel', label: 'الوقود (بنكر)', value: bunkerCost }];
  for (const k of [...MONTE_EXP_E, ...MONTE_EXP_I]) {
    const v = n0(E.exp[k]) + n0(I.exp[k]);
    if (Math.abs(v) >= 0.5) costLines.push({ key: k, label: labelOf[k], value: r2(v) });
  }
  if (salaries > 0) costLines.push({ key: 'salaries', label: 'مرتبات', value: salaries });
  if (purchasesTotal > 0) costLines.push({ key: 'purchases', label: chartered ? 'تكلفة السفينة' : 'تكاليف السفينة الثابتة', value: purchasesTotal });

  const exec: ExecData = {
    perVoyage: voyages.map((v) => {
      const t = voyageTotals(v);
      return { ref: String(v.voyage), revenue: t.rev, net: t.net, expenses: r2(t.rev - t.net), supplies: n0(v.cost_fuel) };
    }),
    revenue, opExpenses: r2(revenue - net), opNet: net, purchasesTotal, bunkerCost, salaries,
    agentExp: r2(expE + expI), bookGap: 0, count, costLines, defaultBuckets: { ...MONTE_BUCKETS },
  };
  const fin: FinData = {
    E, I, revE, revI, revenue, manualRev, expE, expI,
    opening: 0, supplies: voyageFuel, closing: 0, bunkerCost, salaries, net,
    O: 0, P: 0, liqBassam: 0, liqIttihad: 0, count,
  };
  const profile: ReportProfile = {
    purchases: cLabel,
    bucketNames: {
      purchases: chartered ? { ar: 'تكلفة السفينة', en: 'Vessel cost' } : { ar: 'تكاليف السفينة الثابتة', en: 'Fixed vessel costs' },
      fixed: { ar: 'مرتّبات الطاقم', en: 'Crew wages' },
    },
    bunkerStock: false,
    bunkerRows: [
      ownedStmt
        ? { ar: 'وقود الرحلات — فواتير الكشف على مدّة الرحلة', en: 'Voyage fuel — SOA invoices over voyage days', value: voyageFuel }
        : { ar: 'وقود الرحلات بالمتوسّط المرجَّح', en: 'Voyage fuel at weighted average cost', value: voyageFuel },
      { ar: 'وقود التموضع ليماسول ← جدّة', en: 'Positioning fuel Limassol → Jeddah', value: positioning },
    ].filter((r) => Math.abs(r.value) >= 0.005),
    bunkerNote: ownedStmt ? {
      ar: 'وقود كلّ رحلة = فواتير كشف الوكيل موزّعةً يوميّاً حتّى الدفعة التالية، والرحلة تأخذ أيّامها — قرار المالك ٨ نوفمبر. وقود أيّام التوقّف بندٌ مستقلّ في تكاليف السفينة.',
      en: 'Each voyage is charged the agent SOA fuel invoices spread daily to the next purchase, by its days (owner, 8 Nov). Idle-day fuel is a separate vessel-cost line.',
    } : chartered ? {
      ar: 'وقود كلّ رحلة = استهلاكها من تقارير القبطان × متوسّط المخزون المرجَّح، لا مشتريات كشف الوكيل.',
      en: 'Each voyage is charged its consumption (master reports) × the weighted-average stock cost, not the agent SOA purchases.',
    } : {
      ar: 'وقود كلّ رحلة بمتوسّطٍ مرجَّحٍ متحرّك للمخزون عند خروجها، والكمّيّة من ملفّ الربح — قرار المالك ٢٩ أكتوبر.',
      en: 'Each voyage is charged fuel at the moving weighted-average cost of stock on departure; quantities from the voyage profit file.',
    },
    truckLabel: { ar: 'شاحنات ومقطورات', en: 'Trucks & trailers' },
    liquidity: false,
    shippingOrder: false,
    invoices: false,
    defaultAlloc: 'mixed',
    ...(preLabel && preCost ? { preLine: { ...preLabel, value: preCost } } : {}),
  };
  return {
    months, exec, fin, labelOf, profile,
    purchases: { byItem, items: [], total: purchasesTotal },
    packageNet: sumM((m) => m.net, monthly),
  };
}
