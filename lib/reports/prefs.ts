/*
 * تفضيلات التقارير لكلّ مستخدمٍ على هذا المتصفّح.
 *
 * المفاتيح تحمل هويّة المستخدم الحقيقيّة، فلا يرى مستخدمٌ مثبّتات غيره على جهازٍ
 * مشترك:
 *   ume_report_favs:<userId>
 *   ume_report_recents:<userId>
 *   ume_report_filtersets:supplier-statement:<userId>
 *
 * والتخزين للراحة لا للأمان: كلّ ما يُقرأ من هنا يُعاد التحقّق منه (التقرير
 * موجود؟ المورّد ضمن الصلاحية؟) قبل أن يُستعمل.
 */
export const MAX_RECENTS = 4;
export const MAX_SETS = 12;
export const MAX_SET_NAME = 40;

export interface FilterSet { name: string; sups: string[]; ccy: string }

export const prefKey = (kind: 'favs' | 'recents' | 'filtersets:supplier-statement', userId: string | null | undefined) =>
  `ume_report_${kind}:${userId || 'anon'}`;

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* تخزينٌ ممتلئ أو ممنوع — لا يُسقط الشاشة */ }
}

/** قائمة معرّفاتٍ مُصفّاةٌ بما هو موجودٌ فعلاً. */
export function readIds(key: string, valid: (id: string) => boolean): string[] {
  const v = read(key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && valid(x)) : [];
}
export const writeIds = (key: string, ids: string[]) => write(key, ids);

/** الأحدث أوّلاً، بلا تكرار، وبحدٍّ أقصى. */
export function pushRecent(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENTS);
}

export function readSets(key: string): FilterSet[] {
  const v = read(key);
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { name: string; sups: unknown[]; ccy?: unknown } =>
      !!x && typeof (x as { name?: unknown }).name === 'string' && Array.isArray((x as { sups?: unknown }).sups))
    .map((x) => ({ name: x.name.slice(0, MAX_SET_NAME), sups: x.sups.map(String), ccy: String(x.ccy || 'all') }));
}
export const writeSets = (key: string, sets: FilterSet[]) => write(key, sets);

/**
 * حفظ مجموعة: **الاختيارات وحدها** — لا نتائج أبداً. والاسم نفسه يستبدل القديم،
 * والحدّ اثنتا عشرة مجموعة.
 */
export function upsertSet(sets: FilterSet[], entry: FilterSet): FilterSet[] {
  const name = entry.name.trim().slice(0, MAX_SET_NAME);
  return [{ name, sups: [...entry.sups], ccy: entry.ccy }, ...sets.filter((x) => x.name !== name)].slice(0, MAX_SETS);
}
