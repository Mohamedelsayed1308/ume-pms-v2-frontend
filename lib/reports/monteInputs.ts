/*
 * مدخلات فريق مونتي — بقرار المالك (٣١ أكتوبر و١ نوفمبر ٢٠٢٦): كلّ الفريق يُدخل، والمُدخَل
 * يدخل الأرقام في التحديث الآليّ التالي بلا اعتماد.
 *
 * الخادم يحفظ كلّ مُدخَلٍ سجلّاً لا يُمحى في `manual.inputs` (مسار `api/vessel-profit-inputs/monte`
 * يضيف ولا يستبدل)، وسكربت مونتي يسحبها ويطبّقها، والحزمة تعود وفيها `inputs_applied`
 * و`inputs_rejected`. هنا حالة كلّ مُدخَل من ذلك كلّه.
 */
export type InputKind = 'ship_cost' | 'salary' | 'agent_return' | 'eur_rate' | 'egp_rate' | 'fuel_invoice';

export interface MonteInput {
  id: string;
  kind: InputKind | 'void';
  data: Record<string, unknown>;
  by: { id: string | null; name: string };
  at: string;
}

export type InputStatus =
  | { state: 'applied' }
  | { state: 'waiting' }
  | { state: 'rejected'; reason: string }
  | { state: 'voided'; reason: string; by: string }
  | { state: 'superseded' };

export const KIND_LABEL: Record<InputKind, [string, string]> = {
  ship_cost: ['مصاريف السفينة', 'Ship costs'],
  salary: ['المرتّبات', 'Salaries'],
  agent_return: ['أرقام وكيل سواكن', 'Suakin agent figures'],
  eur_rate: ['سعر اليورو', 'EUR rate'],
  egp_rate: ['سعر الجنيه المصريّ', 'EGP rate'],
  fuel_invoice: ['فاتورة بنكر', 'Bunker invoice'],
};

/** المفتاح الذي يغلب فيه الأحدث — مصاريف السفينة سطورٌ تُجمع، وأرقام الوكيل تُدمج حقلاً بحقل. */
const keyOf = (i: MonteInput): string | null => {
  const d = i.data;
  switch (i.kind) {
    case 'salary': case 'eur_rate': return `${i.kind}:${d.month}`;
    case 'egp_rate': return 'egp_rate';
    case 'fuel_invoice': return `fuel:${d.date}`;
    default: return null;
  }
};

export function inputStatuses(inputs: MonteInput[], pkg?: { inputs_applied?: string[]; inputs_rejected?: { id: string; reason: string }[] } | null) {
  const applied = new Set(pkg?.inputs_applied || []);
  const rejected = new Map((pkg?.inputs_rejected || []).map((r) => [r.id, r.reason]));
  const voids = new Map(inputs.filter((i) => i.kind === 'void').map((v) => [String(v.data.target), v]));
  const live = inputs.filter((i) => i.kind !== 'void' && !voids.has(i.id));
  const latest = new Map<string, string>();
  for (const i of [...live].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = keyOf(i);
    if (k) latest.set(k, i.id);
  }
  const out = new Map<string, InputStatus>();
  for (const i of inputs) {
    if (i.kind === 'void') continue;
    const v = voids.get(i.id);
    const k = keyOf(i);
    if (v) out.set(i.id, { state: 'voided', reason: String(v.data.reason || ''), by: v.by.name });
    else if (rejected.has(i.id)) out.set(i.id, { state: 'rejected', reason: rejected.get(i.id)! });
    else if (k && latest.get(k) !== i.id) out.set(i.id, { state: 'superseded' });
    else out.set(i.id, applied.has(i.id) ? { state: 'applied' } : { state: 'waiting' });
  }
  return out;
}

const n = (x: unknown, d = 2) => (typeof x === 'number' ? x.toLocaleString('en-US', { maximumFractionDigits: d }) : '');

/** سطرٌ يصف المُدخَل للجدول — بالعربيّة وحدها كالبيانات نفسها. */
export function describeInput(i: MonteInput): string {
  const d = i.data;
  switch (i.kind) {
    case 'ship_cost': return `${d.month} · ${d.label} · ${n(d.amount)} ${d.currency}`;
    case 'salary': return `${d.month} · ${[d.usd != null ? `${n(d.usd)} USD` : '', d.eur != null ? `${n(d.eur)} EUR` : ''].filter(Boolean).join(' + ')}`;
    case 'agent_return': {
      const L: Record<string, string> = { tickets: 'تذاكر', no_head: 'بلا رأس', cars: 'سيّارات', tript: 'تريبتك', mafi: 'مافي', tidder: 'تيدر', luggage: 'أمتعة', pax: 'على المركب', reefers: 'برّادات برأس' };
      return `رحلة ${d.voyage} عودة · ` + Object.entries(L).filter(([k]) => d[k] != null).map(([k, l]) => `${l} ${d[k]}`).join(' · ');
    }
    case 'eur_rate': return `${d.month} · ${n(d.rate, 4)} دولار لليورو`;
    case 'egp_rate': return `${d.date} · ${n(d.rate)} جنيه للدولار`;
    case 'fuel_invoice': return `${d.date} · فاتورة ${d.invoice} · ${n(d.amount)} ${d.currency}${d.tons != null ? ` · ${n(d.tons, 3)} طنّ` : ''}`;
    default: return '';
  }
}
