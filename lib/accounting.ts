/*
 * قواعد اختيار حساب المصروف — في موضع واحد.
 *
 * كانت مكرّرة في ثلاثة ملفات، فأي تغيير يحتاج ثلاثة تعديلات ويُنسى أحدها.
 */

/**
 * حسابات **يقودها المحرّك** لا المستخدم.
 *
 * فروق الصرف تُقيَّد عند تسوية السداد بحسابٍ من فرق حقيقي — لا يختارها أحد
 * لفاتورة. والإهلاك يأتي من جدوله الشهري لا من فاتورة مورّد. ظهورها في قائمة
 * اختيار حساب المصروف ليس مرونة بل **فرصة اختيار خاطئ بلا فائدة مقابلة**.
 *
 * الاستبعاد بالدور لا بالرمز: الدور دلالة، والرمز إعداد قابل للتغيير.
 */
export const ENGINE_DRIVEN_ROLES = [
  'REALIZED_FX_GAIN', 'REALIZED_FX_LOSS',
  'UNREALIZED_FX_GAIN', 'UNREALIZED_FX_LOSS',
  'DEPRECIATION_EXPENSE',
];

/**
 * الأصول التي يصحّ أن تُحمَّل عليها فاتورة مورّد: المقدَّم لخدمة متعددة الفترات،
 * والتكلفة لما يُرسمَل على المركب. والبنوك والذمم لا يُرحَّل إليها مصروف فاتورة.
 */
export const CAPITALIZABLE_CODES = ['1200', '1510'];

export interface PickableAccount {
  id: string; code: string; name: string;
  account_type: string; account_group?: string | null;
  system_role?: string | null; is_postable: boolean; is_active?: boolean;
}

const GROUP_RANK: Record<string, number> = { VESSEL_OPEX: 0, ADMIN: 1, FINANCE: 2 };

/** الحسابات الصالحة لتحميل فاتورة مورّد عليها — مرتَّبة بمجموعتها. */
export function expenseAccountOptions<T extends PickableAccount>(accounts: T[]): T[] {
  return accounts
    .filter((a) =>
      a.is_postable && a.is_active !== false &&
      (a.account_type === 'expense' || CAPITALIZABLE_CODES.includes(a.code)) &&
      !(a.system_role && ENGINE_DRIVEN_ROLES.includes(a.system_role)))
    .sort((x, y) =>
      (GROUP_RANK[x.account_group ?? ''] ?? 3) - (GROUP_RANK[y.account_group ?? ''] ?? 3)
      || x.code.localeCompare(y.code));
}

/** نصّ الخيار — المجموعة مكتوبة فيه ليعرف القارئ أين يقع اختياره. */
export function accountOptionLabel(a: PickableAccount): string {
  const g = a.account_group === 'VESSEL_OPEX' ? '  [تشغيل مركب]'
    : a.account_group === 'ADMIN' ? '  [إدارية]'
    : a.account_group === 'FINANCE' ? '  [تمويلية]' : '';
  return `${a.code} — ${a.name}${g}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * توليد رمز الحساب
 *
 * الترقيم القائم ليس عشوائياً: التصنيف يحدّد الخانة الأولى، والمجموعة تفصل
 * المصروفات (تشغيل 5 · إدارية 6 · تمويلية 7)، والزيادة عشرة عشرة لتبقى فجوات
 * تستوعب حسابات بينية لاحقاً.
 *
 * فالمولِّد **يستخرج القاعدة من الدليل نفسه** لا من قائمة مكتوبة هنا: يأخذ أعلى
 * رمز في نطاقه ويزيد عشرة. فإن تغيّر الترقيم يوماً تبعه المولِّد بلا تعديل.
 *
 * وهو **اقتراح لا إلزام** — الحقل يبقى قابلاً للكتابة، ويتوقّف التوليد فور أن
 * يكتب المستخدم رمزاً بنفسه.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CodeContext {
  account_type: string;
  account_group?: string | null;
  parent_id?: string | null;
}

export interface CodeSource { id?: string; code: string; parent_id?: string | null }

/** نطاق الرموز لهذا التصنيف والمجموعة — [الأدنى، الأعلى]. */
export function codeBand(ctx: CodeContext): [number, number] {
  switch (ctx.account_type) {
    case 'asset': return [1000, 1999];
    case 'liability': return [2000, 2999];
    case 'equity': return [3000, 3999];
    case 'revenue': return [4000, 4999];
    case 'expense':
      if (ctx.account_group === 'ADMIN') return [6000, 6999];
      // التمويلية تتوقّف عند 7099: ما فوقها محجوز لفروق الصرف (71xx).
      if (ctx.account_group === 'FINANCE') return [7000, 7099];
      return [5000, 5999];
    default: return [5000, 5999];
  }
}

/**
 * الرمز المقترح.
 *
 * تحت أبٍ: يتبع إخوته لا نطاقه — الفرع يرث ترقيم أبيه. وبلا أب: أعلى ما في
 * نطاقه زائد عشرة. وفي الحالتين يتخطّى المشغول حتى يجد فراغاً، فلا يُقترَح رمز
 * يُرفض عند الحفظ.
 */
export function suggestAccountCode(accounts: CodeSource[], ctx: CodeContext): string {
  const taken = new Set(accounts.map((a) => a.code));
  const num = (c: string) => Number(String(c).replace(/\D/g, ''));

  let base: number;
  if (ctx.parent_id) {
    const parent = accounts.find((a) => a.id === ctx.parent_id);
    const siblings = accounts.filter((a) => a.parent_id === ctx.parent_id).map((a) => num(a.code));
    base = siblings.length ? Math.max(...siblings) : (parent ? num(parent.code) : 0);
  } else {
    const [lo, hi] = codeBand(ctx);
    const inBand = accounts.map((a) => num(a.code)).filter((n) => n >= lo && n <= hi);
    base = inBand.length ? Math.max(...inBand) : lo;
  }

  // عشرة عشرة أولاً لتبقى فجوات، ثم واحداً واحداً إن ازدحم النطاق.
  for (let n = base + 10; n <= base + 1000; n += 10) if (!taken.has(String(n))) return String(n);
  for (let n = base + 1; n <= base + 1000; n += 1) if (!taken.has(String(n))) return String(n);
  return '';
}
