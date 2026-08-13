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
