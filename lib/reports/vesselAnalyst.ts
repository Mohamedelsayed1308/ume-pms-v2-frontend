/*
 * سياق مساعد تحليل البنود — بطلب المالك ٣٠ أكتوبر ٢٠٢٦.
 *
 * الكارت يحسب، والمساعد يشرح. فكلّ رقمٍ يراه النموذج يُبنى هنا من رحلات الكارت نفسها
 * (بعد الشطب والاستبعاد) ومن أرقامه المحسوبة، ولا يُطلب منه أن يجمع أو يقسم شيئاً لم
 * يُعطَ. ولذلك تُحسب هنا الإحصاءات التي يحتاجها التحليل: المتوسّط والوسيط والشاذّ،
 * والسلسلة الشهريّة لكلّ الشهور (لا الفترة وحدها) ليُرى الاتّجاه.
 */

export interface AnSide {
  truckC: number; truck: number; vehC: number; veh: number; passC: number; pass: number; discharge: number;
  exp: Record<string, number>;
}
export interface AnVoyage { ref: unknown; month: string | null; date?: string; E: AnSide; I: AnSide; bunker: number; net: number; broken?: boolean }

export type AnSideKey = 'E' | 'I' | 'both';
export type AnItem =
  | { kind: 'revenue'; key: 'truck' | 'veh' | 'pass' | 'discharge'; side: AnSideKey; label: string }
  | { kind: 'expense'; key: string; side: AnSideKey; label: string }
  | { kind: 'bunker'; label: string }
  | { kind: 'salaries'; label: string }
  | { kind: 'purchases'; label: string }
  | { kind: 'manualRevenue'; key: string; label: string };

export const REV_LABELS: Record<string, string> = { truck: 'نولون شاحنات', veh: 'نولون سيارات', pass: 'ركاب', discharge: 'إذن الشحن' };
const COUNT_KEY = { truck: 'truckC', veh: 'vehC', pass: 'passC' } as const;
const UNIT_LABEL = { truck: 'شاحنة', veh: 'سيارة', pass: 'راكب' } as const;

export interface AnInput {
  vessel: string;
  agentExport: string; agentImport: string;
  voyages: AnVoyage[];                 // كلّ رحلات الكارت (للاتّجاه الشهريّ)
  from: string; to: string;            // الفترة المختارة
  labelOf: Record<string, string>;
  ledgerExcluded?: string[];
  totals: {
    revenue: number; expenses: number; net: number; count: number; revE: number; revI: number; expE: number; expI: number;
    // مجموع بنود الكارت (الوكيلان + البنكر + المرتّبات) وفرق BALANCE عنه — expenses مشتقّةٌ من BALANCE فلا تصلح مقاماً للنِّسب
    lineExpenses?: number; bookGap?: number;
  };
  bunker?: {
    opening: number; suppliesExcel: number; invoicesUSD: number; closing: number; cost: number;
    skipped: { number: string; usd: number; ref: string; month: string }[];
    cuts: { month: string; ref: string; amount: number; reason: string }[];
  };
  salariesByMonth?: { month: string; amount: number; source: string }[];
  purchases?: { total: number; byItem: { name: string; value: number }[]; items: { number: string; supplier: string; item: string; date: string; installment: number; nMonths: number }[] };
  manualRevenues?: { key: string; label: string; byMonth: { month: string; amount: number }[] }[];
  costLines?: { key: string; label: string; value: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (v: AnVoyage, a: string, b: string) => !!v.month && v.month >= a && v.month <= b;
const sideName = (s: AnSideKey, i: AnInput) => (s === 'E' ? `صادر — ${i.agentExport}` : s === 'I' ? `وارد — ${i.agentImport}` : 'الجهتان');

/** قيمة البند وعدد وحداته في رحلة. `null` = البند لا يُقرأ من الرحلات. */
function voyageValue(v: AnVoyage, it: AnItem): { value: number; units: number | null } | null {
  const sides = (s: AnSideKey) => (s === 'both' ? [v.E, v.I] : [v[s]]);
  if (it.kind === 'revenue') {
    const ss = sides(it.side);
    const value = ss.reduce((a, s) => a + (s[it.key] || 0), 0);
    const k = it.key;
    if (k === 'discharge') return { value, units: null };
    return { value, units: ss.reduce((a, s) => a + (s[COUNT_KEY[k]] || 0), 0) };
  }
  if (it.kind === 'expense') return { value: sides(it.side).reduce((a, s) => a + (s.exp[it.key] || 0), 0), units: null };
  if (it.kind === 'bunker') return { value: v.bunker, units: null };
  return null;
}
const voyageRevenue = (v: AnVoyage) => [v.E, v.I].reduce((a, s) => a + s.truck + s.veh + s.pass + s.discharge, 0);

function stats(rows: { ref: string; value: number }[]) {
  if (!rows.length) return null;
  const xs = rows.map((r) => r.value).sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
  const max = rows.reduce((m, r) => (r.value > m.value ? r : m), rows[0]);
  const min = rows.reduce((m, r) => (r.value < m.value ? r : m), rows[0]);
  const outliers = sd > 0 ? rows.filter((r) => Math.abs(r.value - mean) > 2 * sd).map((r) => ({ ref: r.ref, value: r2(r.value), sigmas: r2((r.value - mean) / sd) })) : [];
  return { n: rows.length, mean: r2(mean), median: r2(median), sd: r2(sd), max: { ref: max.ref, value: r2(max.value) }, min: { ref: min.ref, value: r2(min.value) }, zeros: rows.filter((r) => Math.abs(r.value) < 0.005).length, outliers };
}

const EXPENSES_NOTE = 'expenses = الإيراد − صافي الكارت المأخوذ من BALANCE (لا تشمل المشتريات). lineExpenses = مجموع بنود الكارت: مصاريف الوكيلين + البنكر بالمخزون + المرتّبات، وهي مقام نسبة البند من المصروفات. bookGap = صافي BALANCE ناقص الصافي محسوباً من البنود؛ إن لم يكن صفراً فالدفتر لا يطابق مكوّناته في بعض الرحلات، فاذكره ولا تنسب البند إلى expenses.';
const expenseBase = (i: AnInput) => i.totals.lineExpenses ?? i.totals.expenses;

const monthsOf = (vs: AnVoyage[]) => [...new Set(vs.map((v) => v.month).filter(Boolean) as string[])].sort();

/** سياق بندٍ واحد: الفترة، والرحلات، والشهور كلّها، والمصادر. */
export function itemContext(i: AnInput, it: AnItem) {
  const sel = i.voyages.filter((v) => inRange(v, i.from, i.to));
  const base = {
    vessel: i.vessel,
    period: { from: i.from, to: i.to, voyages: sel.length },
    card: {
      revenue: r2(i.totals.revenue), expenses: r2(i.totals.expenses), net: r2(i.totals.net),
      lineExpenses: i.totals.lineExpenses != null ? r2(i.totals.lineExpenses) : undefined,
      bookGap: i.totals.bookGap != null ? r2(i.totals.bookGap) : undefined,
    },
    item: { label: it.label, kind: it.kind, side: 'side' in it ? sideName(it.side, i) : undefined },
    notes: [EXPENSES_NOTE],
  };

  if (it.kind === 'salaries') {
    const rows = (i.salariesByMonth || []).map((x) => ({ ...x, amount: r2(x.amount) }));
    return { ...base, byMonth: rows, total: r2(rows.filter((x) => x.month >= i.from && x.month <= i.to).reduce((a, x) => a + x.amount, 0)), source: 'مرتّبات الشهر: يدويّة أو من إعداد المركب أو من قيود QuickBooks فئة salary' };
  }
  if (it.kind === 'purchases') {
    const p = i.purchases;
    return { ...base, total: r2(p?.total || 0), byItem: (p?.byItem || []).slice(0, 25).map((x) => ({ ...x, value: r2(x.value) })),
      documents: (p?.items || []).slice().sort((a, b) => b.installment - a.installment).slice(0, 40).map((x) => ({ ...x, installment: r2(x.installment) })),
      source: 'فواتير المركب في النظام + قيود QuickBooks المحمَّلة، مقسَّطةً بشهور إهلاكها ومحوَّلةً بسعر شهر الشراء' };
  }
  if (it.kind === 'manualRevenue') {
    const m = (i.manualRevenues || []).find((x) => x.key === it.key);
    return { ...base, byMonth: m?.byMonth || [], source: 'إيرادٌ يدويٌّ شهريّ خارج دفتر الرحلات (إشعار دائن من الوكيل)' };
  }

  const per = sel.map((v) => {
    const x = voyageValue(v, it)!;
    return { ref: String(v.ref), month: v.month!, date: v.date, value: r2(x.value), units: x.units, voyageRevenue: r2(voyageRevenue(v)), voyageNet: r2(v.net), broken: v.broken || undefined };
  }).sort((a, b) => a.month.localeCompare(b.month) || Number(a.ref) - Number(b.ref));
  const total = per.reduce((a, x) => a + x.value, 0);
  const units = per.some((x) => x.units != null) ? per.reduce((a, x) => a + (x.units || 0), 0) : null;

  const byMonth = monthsOf(i.voyages).map((m) => {
    const vs = i.voyages.filter((v) => v.month === m);
    const xs = vs.map((v) => voyageValue(v, it)!);
    const value = xs.reduce((a, x) => a + x.value, 0);
    const u = xs.some((x) => x.units != null) ? xs.reduce((a, x) => a + (x.units || 0), 0) : null;
    return { month: m, value: r2(value), voyages: vs.length, perVoyage: vs.length ? r2(value / vs.length) : 0, units: u, perUnit: u ? r2(value / u) : null, monthRevenue: r2(vs.reduce((a, v) => a + voyageRevenue(v), 0)), inPeriod: m >= i.from && m <= i.to };
  });

  const source = it.kind === 'revenue'
    ? `دفتر الرحلات في الشيت الموحّد — عمود ${it.label} (${sideName(it.side, i)})`
    : it.kind === 'expense'
      ? `دفتر الرحلات في الشيت الموحّد — بند مصاريف الوكيل «${it.label}» (${sideName(it.side, i)})${i.ledgerExcluded?.includes(it.key) ? '؛ مستبعَدٌ من الصافي وبديله من QuickBooks' : ''}`
      : 'تكلفة البنكر = أوّل المدّة + تموينات الشيت + فواتير بند Bunker في النظام − آخر المدّة';

  return {
    ...base,
    unit: it.kind === 'revenue' && it.key !== 'discharge' ? UNIT_LABEL[it.key] : undefined,
    periodTotals: {
      total: r2(total),
      shareOfRevenue: i.totals.revenue ? r2(total / i.totals.revenue * 100) : null,
      shareOfExpenses: it.kind !== 'revenue' && expenseBase(i) ? r2(total / expenseBase(i) * 100) : null,
      perVoyage: per.length ? r2(total / per.length) : null,
      units, perUnit: units ? r2(total / units) : null,
    },
    voyageStats: stats(per),
    byVoyage: per.slice(-150),
    byMonth,
    bunker: it.kind === 'bunker' && i.bunker ? {
      ...i.bunker, note: 'تموينات الشيت في byVoyage، والفواتير المتروكة لأنّ نسختها في الشيت في skipped، والسطور المشطوبة في cuts',
    } : undefined,
    source,
  };
}

/** سياق السؤال الحرّ: ملخّص الكارت في الفترة، والسلسلة الشهريّة، والرحلات. */
export function cardContext(i: AnInput) {
  const sel = i.voyages.filter((v) => inRange(v, i.from, i.to));
  const sideRows = (s: 'E' | 'I') => {
    const rev = (['truck', 'veh', 'pass', 'discharge'] as const).map((k) => {
      const value = sel.reduce((a, v) => a + v[s][k], 0);
      const units = k === 'discharge' ? null : sel.reduce((a, v) => a + v[s][COUNT_KEY[k]], 0);
      return { item: REV_LABELS[k], value: r2(value), units, perUnit: units ? r2(value / units) : null };
    });
    const keys = [...new Set(sel.flatMap((v) => Object.keys(v[s].exp)))];
    const exp = keys.map((k) => ({ key: k, item: i.labelOf[k] || k, value: r2(sel.reduce((a, v) => a + (v[s].exp[k] || 0), 0)) })).filter((x) => Math.abs(x.value) >= 0.005).sort((a, b) => b.value - a.value);
    return { revenue: rev, expenses: exp };
  };
  return {
    vessel: i.vessel,
    period: { from: i.from, to: i.to, voyages: sel.length },
    totals: Object.fromEntries(Object.entries(i.totals).map(([k, v]) => [k, r2(v)])),
    export: { agent: i.agentExport, ...sideRows('E') },
    import: { agent: i.agentImport, ...sideRows('I') },
    costLines: (i.costLines || []).map((c) => ({ ...c, value: r2(c.value) })),
    bunker: i.bunker,
    salariesByMonth: i.salariesByMonth,
    purchases: i.purchases ? { total: r2(i.purchases.total), byItem: i.purchases.byItem.slice(0, 15).map((x) => ({ ...x, value: r2(x.value) })) } : undefined,
    byMonth: monthsOf(i.voyages).map((m) => {
      const vs = i.voyages.filter((v) => v.month === m);
      return { month: m, voyages: vs.length, revenue: r2(vs.reduce((a, v) => a + voyageRevenue(v), 0)), ledgerNet: r2(vs.reduce((a, v) => a + v.net, 0)), sheetBunker: r2(vs.reduce((a, v) => a + v.bunker, 0)) };
    }),
    byVoyage: sel.map((v) => ({ ref: String(v.ref), month: v.month, revenue: r2(voyageRevenue(v)), ledgerNet: r2(v.net), sheetBunker: r2(v.bunker), trucks: v.E.truckC + v.I.truckC, broken: v.broken || undefined })).slice(-150),
    notes: [
      'ledgerNet صافي BALANCE في الدفتر قبل معالجات الكارت؛ صافي الكارت في totals.net.',
      EXPENSES_NOTE,
    ],
  };
}
