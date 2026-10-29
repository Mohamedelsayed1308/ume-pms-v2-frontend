/*
 * حزمة رحلات مونتي (خطّ جدّة/سواكن) — بقرار المالك ٢٩ أكتوبر ٢٠٢٦.
 *
 * ── لماذا حزمةٌ لا الشيت ──
 * مونتي لا دفتر لها في الشيت الموحّد. أرقامها تُبنى في مجلّد رحلاتها من ملفّات الربح
 * وكشف الوكيل وفواتير البنكر، وتُصدَّر ملفّاً واحداً ثابت الشكل `monte_pms.json`
 * (schema `monte-pms/1`). والكارت يقرؤه كما هو من `vessel_profit_data.manual.package`
 * بلا هجرة، ولا يعيد حساب ما حسمته قواعد المالك هناك (الوقود المرجَّح، تسوية جدّة،
 * الهدايا…). فدوره هنا العرض والتحقّق.
 *
 * ── التحقّق قبل الحفظ ──
 * الحزمة تُرفض إن خالفت نفسها: بنود الرحلة لا تساوي حقولها، أو صافي الشهر لا يساوي
 * رحلاته وتكاليفه الثابتة، أو بندٌ مستبعَد غير الإيجار. فرقمٌ خاطئ يُرى في الكارت
 * أخطر من رفعٍ مرفوض.
 *
 * ── رحلة 07 لا تُعرض (قرار المالك) ──
 * تُنزع من الرحلات والإشغال وكشف الوكيل قبل أيّ حساب. فإن كان صافيها داخلاً في
 * شهرها رفض التحقّق الحزمة، لأنّ الشهر لن يطابق رحلاته المعروضة.
 */
export const MONTE_SCHEMA = 'monte-pms/1';
export const HIDDEN_VOYAGES = ['07'];

export const REV_FIELDS = ['rev_pax_out', 'rev_pax_ret', 'rev_cargo_out', 'rev_cargo_ret', 'rev_do', 'rev_other'] as const;
export const COST_FIELDS = [
  'cost_fuel', 'cost_water', 'cost_port_jed', 'cost_comm_jed', 'cost_port_suk',
  'cost_comm_suk30', 'cost_comm_suk', 'cost_agent_adj', 'cost_gifts', 'cost_catering',
] as const;
export const COMM_FIELDS = ['cost_comm_jed', 'cost_comm_suk30', 'cost_comm_suk'] as const;
type RevField = typeof REV_FIELDS[number];
type CostField = typeof COST_FIELDS[number];

export interface MonteItem { kind: 'rev' | 'cost'; side: 'jeddah' | 'suakin'; label: string; usd: number; excluded: boolean }
export type MonteVoyage = Record<RevField | CostField, number> & {
  voyage: string; dep: string; arr: string; days: number; pax_out: number; pax_ret: number;
  fuel_price: number; fuel_in_file: number; fuel_t: number; hire_in_file: number;
  agent_status: string; file: string; delivery_order_est: boolean; items: MonteItem[];
};
export interface MonteLeg {
  leg: string; voyage: string; direction: string; route: string; date: string;
  pax_paying: number | null; pax_total: number | null; trucks: number | null; trailers: number | null;
  cars: number | null; equipment: number | null; source: string;
}
export interface MonteMonth {
  month: string; vnet: number; pos: number | null; ins: number | null; fixed: number; net: number;
  sal_usd: number | null; sal_eur: number | null; crew_misc: number | null; ctm: number | null;
  rev: number; vcost: number; trips: number; line: string; salaries_pending: boolean;
}
export interface MonteFuelEvent { event: string; date: string; before_t: number | null; qty_t: number | null; price: number | null; wac: number | null; note: string }
export interface MonteAgentVoyage {
  voyage: string; date: string; soa_out: number; soa_ret: number; cash_to_master: number;
  estimated: number; profit_jeddah_side: number; do_outside: number;
}
export interface MonteCompare {
  vessel: string; ownership: string; voyages: number | null; rev_per_voyage: number | null; comm_per_voyage: number | null;
  opex_per_voyage: number | null; net_per_voyage: number | null; pax_ret_per_voyage: number | null;
  cap_pax: number | null; cap_trailers: number | null;
}
export interface MontePackage {
  schema: string; generated_at: string;
  vessel: { name: string; name_ar: string; line: string; ownership: string; cap_pax: number; cap_trailer_units: number; cap_cars: number; card_start: string };
  rules: string[]; voyages: MonteVoyage[]; legs: MonteLeg[]; monthly: MonteMonth[]; fuel_stock: MonteFuelEvent[];
  agent_voyages: MonteAgentVoyage[]; agent_summary: { item: string; usd: number }[]; line_compare: MonteCompare[]; pending: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const n0 = (x: number | null | undefined) => (typeof x === 'number' && isFinite(x) ? x : 0);
const TOL = 0.05; // تقريب السنتات عبر عشرات البنود

/** إيراد الرحلة وتكاليفها وصافيها — من حقولها، والإيجار خارجها. */
export function voyageTotals(v: MonteVoyage) {
  const rev = r2(REV_FIELDS.reduce((s, k) => s + n0(v[k]), 0));
  const cost = r2(COST_FIELDS.reduce((s, k) => s + n0(v[k]), 0));
  const comm = r2(COMM_FIELDS.reduce((s, k) => s + n0(v[k]), 0));
  return { rev, cost, comm, opex: r2(cost - comm), net: r2(rev - cost) };
}

/** مجاميع البنود — المستبعَد (الإيجار) يُعرض للعلم ولا يدخل. */
export function itemTotals(v: MonteVoyage) {
  let rev = 0, cost = 0, excluded = 0;
  for (const i of v.items || []) {
    if (i.excluded) excluded += i.usd;
    else if (i.kind === 'rev') rev += i.usd;
    else cost -= i.usd;
  }
  return { rev: r2(rev), cost: r2(cost), net: r2(rev - cost), excluded: r2(excluded) };
}

/** نزع الرحلات المحجوبة من كلّ قسمٍ يُعرض فيه رقم الرحلة. */
export function visiblePackage(p: MontePackage): { pkg: MontePackage; hidden: string[] } {
  const hide = (x: { voyage: string }) => HIDDEN_VOYAGES.includes(String(x.voyage));
  const hidden = [...new Set((p.voyages || []).filter(hide).map((v) => String(v.voyage)))];
  if (!hidden.length && !(p.legs || []).some(hide) && !(p.agent_voyages || []).some(hide)) return { pkg: p, hidden };
  return {
    pkg: { ...p, voyages: p.voyages.filter((x) => !hide(x)), legs: (p.legs || []).filter((x) => !hide(x)), agent_voyages: (p.agent_voyages || []).filter((x) => !hide(x)) },
    hidden,
  };
}

const monthOf = (d: string) => String(d || '').slice(0, 7);

export interface MonteCheck { ok: boolean; errors: string[]; warnings: string[]; pkg: MontePackage | null; hidden: string[] }

/**
 * تحقّق الحزمة قبل حفظها وعند عرضها.
 * الأخطاء ترفض الحفظ، والتنبيهات تُعرض فوق الكارت ولا تمنعه.
 */
export function validateMontePackage(raw: unknown): MonteCheck {
  const errors: string[] = [], warnings: string[] = [];
  const fail = (e: string): MonteCheck => ({ ok: false, errors: [...errors, e], warnings, pkg: null, hidden: [] });
  if (!raw || typeof raw !== 'object') return fail('الملفّ ليس كائن JSON');
  const p0 = raw as MontePackage;
  if (p0.schema !== MONTE_SCHEMA) return fail(`الشكل «${String(p0.schema)}» غير مدعوم — المتوقَّع ${MONTE_SCHEMA}`);
  for (const k of ['voyages', 'legs', 'monthly', 'fuel_stock', 'agent_voyages', 'agent_summary', 'line_compare', 'rules', 'pending'] as const) {
    if (!Array.isArray(p0[k])) return fail(`القسم ${k} مفقود أو ليس قائمة`);
  }
  if (!p0.vessel || typeof p0.vessel !== 'object') return fail('القسم vessel مفقود');
  const { pkg: p, hidden } = visiblePackage(p0);
  if (!p.voyages.length) return fail('لا رحلات في الحزمة');

  const seen = new Set<string>();
  for (const v of p.voyages) {
    const id = String(v.voyage);
    if (seen.has(id)) errors.push(`الرحلة ${id} مكرّرة`);
    seen.add(id);
    for (const k of [...REV_FIELDS, ...COST_FIELDS]) {
      if (typeof v[k] !== 'number' || !isFinite(v[k])) errors.push(`الرحلة ${id}: الحقل ${k} ليس رقماً`);
    }
    if (!Array.isArray(v.items) || !v.items.length) { errors.push(`الرحلة ${id}: لا بنود`); continue; }
    const t = voyageTotals(v), it = itemTotals(v);
    if (Math.abs(t.rev - it.rev) > TOL) errors.push(`الرحلة ${id}: بنود الإيراد ${it.rev} لا تساوي حقوله ${t.rev}`);
    if (Math.abs(t.cost - it.cost) > TOL) errors.push(`الرحلة ${id}: بنود التكاليف ${it.cost} لا تساوي حقولها ${t.cost}`);
    const badEx = v.items.filter((i) => i.excluded && i.kind !== 'cost');
    if (badEx.length) errors.push(`الرحلة ${id}: بند إيرادٍ مستبعَد (${badEx[0].label}) — المستبعَد الإيجار وحده`);
    if (Math.abs(it.excluded + n0(v.hire_in_file)) > TOL) warnings.push(`الرحلة ${id}: المستبعَد ${-it.excluded} لا يساوي إيجار الملفّ ${v.hire_in_file}`);
    if (n0(v.cost_catering) !== 0) warnings.push(`الرحلة ${id}: كاترينج ${v.cost_catering} — القاعدة صفرٌ حتّى تصل الفواتير`);
  }

  for (const m of p.monthly) {
    const vs = p.voyages.filter((v) => monthOf(v.dep) === m.month);
    const vnet = r2(vs.reduce((s, v) => s + voyageTotals(v).net, 0));
    if (Math.abs(vnet - n0(m.vnet)) > TOL) errors.push(`شهر ${m.month}: صافي الرحلات ${m.vnet} ورحلاته المعروضة ${vnet}`);
    if (vs.length !== n0(m.trips)) errors.push(`شهر ${m.month}: ${m.trips} رحلة والمعروض ${vs.length}`);
    const fixed = r2(n0(m.ins) + n0(m.sal_usd) + n0(m.sal_eur) + n0(m.crew_misc) + n0(m.ctm));
    if (Math.abs(fixed - n0(m.fixed)) > TOL) errors.push(`شهر ${m.month}: الثابتة ${m.fixed} ومكوّناتها ${fixed}`);
    const net = r2(n0(m.vnet) + n0(m.pos) + n0(m.fixed));
    if (Math.abs(net - n0(m.net)) > TOL) errors.push(`شهر ${m.month}: الصافي ${m.net} ومكوّناته ${net}`);
    if (m.salaries_pending) warnings.push(`شهر ${m.month}: المرتّبات لم تُدخَل بعد — الصافي قبلها`);
  }
  const months = new Set(p.monthly.map((m) => m.month));
  for (const v of p.voyages) if (!months.has(monthOf(v.dep))) errors.push(`الرحلة ${v.voyage}: شهرها ${monthOf(v.dep)} ليس في الجدول الشهريّ`);

  return { ok: !errors.length, errors, warnings, pkg: errors.length ? null : p, hidden };
}

/** أرقام الكارت الجامعة. */
export function packageTotals(p: MontePackage) {
  const vs = p.voyages.map((v) => ({ v, ...voyageTotals(v) }));
  const sum = (f: (x: typeof vs[number]) => number) => r2(vs.reduce((s, x) => s + f(x), 0));
  const rev = sum((x) => x.rev), cost = sum((x) => x.cost), comm = sum((x) => x.comm), net = sum((x) => x.net);
  const lineMonths = p.monthly.filter((m) => n0(m.trips) > 0);
  const fixedOnLine = r2(lineMonths.reduce((s, m) => s + n0(m.fixed) + n0(m.pos), 0));
  const sinceStart = r2(p.monthly.reduce((s, m) => s + n0(m.net), 0));
  let run = 0;
  const cumulative = p.monthly.map((m) => { run = r2(run + n0(m.net)); return { month: m.month, net: m.net, cum: run }; });
  const n = vs.length || 1;
  return {
    voyages: vs, n: vs.length, rev, cost, comm, opex: r2(cost - comm), net,
    netAfterFixed: r2(net + fixedOnLine), fixedOnLine, sinceStart, cumulative,
    perVoyage: { rev: rev / n, comm: comm / n, opex: (cost - comm) / n, net: net / n, paxRet: vs.reduce((s, x) => s + n0(x.v.pax_ret), 0) / n },
  };
}
