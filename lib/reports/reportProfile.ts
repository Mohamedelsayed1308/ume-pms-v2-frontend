/*
 * ملفّ عرضٍ لنوافذ التقارير الثلاث (📊 الإداريّ · 🧮 الماليّ · 🏛️ التنفيذيّ).
 *
 * النوافذ بُنيت على دفتر بوسيدون وألكوديا: بنكرٌ برصيد أوّل وآخر المدة، وسيولةٌ
 * عند الوكلاء، ومشترياتٌ بفواتير ومورّدين. ومونتي (٣١ أكتوبر ٢٠٢٦، بقرار المالك
 * «نفس نوافذ بوسيدون») لا تملك أيّاً منها: وقودها بمتوسّطٍ مرجَّحٍ لكلّ رحلة،
 * وسطر C عندها تكاليف السفينة الثابتة لا فواتير مشتريات.
 *
 * فالملفّ يقول للنافذة ما تُخفيه وما تُسمّيه — ولا يغيّر رقماً. وما لا بيانات له
 * يُخفى، لا يُعرض صفراً يُقرأ كأنّه حقيقة. والافتراضيّ سلوك بوسيدون كما كان.
 */
export interface ReportProfile {
  /** اسم سطر C في قائمة الدخل وقسمه */
  purchases: { ar: string; en: string };
  /** أسماء مجموعات الهيكل حين تختلف عن الافتراضيّ (`fixed` · `purchases`…) */
  bucketNames?: Record<string, { ar: string; en: string }>;
  /** رصيد أوّل/آخر المدة — وإلّا عُرضت `bunkerRows` بدل جدول المخزون */
  bunkerStock: boolean;
  bunkerRows?: { ar: string; en: string; value: number }[];
  /** سيولة الوكلاء (P · O) */
  liquidity: boolean;
  /** سطر «إذن الشحن» في الإيراد */
  shippingOrder: boolean;
  /** جداول الفواتير والمورّدين تحت سطر C */
  invoices: boolean;
  /** أساس توزيع البنكر على الرحلات في التقرير الإداريّ */
  defaultAlloc?: 'mixed' | 'revenue' | 'equal';
  /** اسم عدّاد «الشاحنات» حين يضمّ غيرها (مونتي: شاحنات ومقطورات) */
  truckLabel?: { ar: string; en: string };
  /** ملاحظة تحت قسم البنكر */
  bunkerNote?: { ar: string; en: string };
}

export const DEFAULT_PROFILE: ReportProfile = {
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  bunkerStock: true,
  liquidity: true,
  shippingOrder: true,
  invoices: true,
};
