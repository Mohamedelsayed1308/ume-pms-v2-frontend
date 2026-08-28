export type GroupKey = 'overview' | 'procurement' | 'revenue' | 'fleet' | 'sivamar_qb' | 'admin';

export interface Screen {
  href: string;
  label: string;        // العربية (متوافق رجعياً)
  icon: string;         // إيموجي (متوافق رجعياً)
  iconName?: string;    // اسم أيقونة SVG الاحترافية (Icon component)
  group?: GroupKey;     // مجموعة التنقّل
  adminOnly?: boolean;  // للأدمن فقط
  always?: boolean;     // متاح دائماً لكل مستخدم
  /**
   * مسجَّلة للصلاحيات لكن **لا تظهر في التنقّل**.
   *
   * تفصل بين أمرين كانا ملتصقين: "الشاشة موجودة ويمكن منحها" و"الشاشة لها صفحة
   * تُفتح". شاشات المحاسبة في P1.1A لها حماية خادمية ونقاط نهاية عاملة، ولا صفحات
   * بعد — فتسجيلها بلا هذا العلم كان سيضع في القائمة روابط تؤدي إلى 404.
   */
  hidden?: boolean;
}

/*
 * ترتيب مجموعات التنقّل.
 *
 * ست مجموعات لا ثمان: كانت «المالية والرقابة» تحمل شاشةً واحدة و«العمليات»
 * شاشةً واحدة — وعنوانُ مجموعةٍ فوق سطرٍ واحد ضجيجٌ خالص، يُطيل القائمة ولا
 * يُنظّمها. فوُزّعت شاشتاهما على مجموعتين قائمتين تنتميان إليهما فعلاً.
 *
 * والترتيب يتبع دورة المال: ما ندفعه، ثم ما نقبضه، ثم الأصل الذي يُنتجهما،
 * ثم الدفتر الذي يُسجّلهما، ثم ما يُدار به النظام.
 */
export const GROUPS: { key: GroupKey; i18nKey: string }[] = [
  { key: 'overview', i18nKey: 'group.overview' },
  { key: 'procurement', i18nKey: 'group.procurement' },
  { key: 'revenue', i18nKey: 'group.revenue' },
  { key: 'fleet', i18nKey: 'group.fleet' },
  { key: 'sivamar_qb', i18nKey: 'group.sivamar_qb' },
  { key: 'admin', i18nKey: 'group.admin' },
];

// كل شاشات النظام — مصدر واحد للسايدبار ولشاشة الصلاحيات
export const SCREENS: Screen[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠', iconName: 'home', group: 'overview', always: true },
  { href: '/dashboard/reports', label: 'التقارير', icon: '📊', iconName: 'chart', group: 'overview' },
  { href: '/dashboard/management', label: 'لوحة الإدارة', icon: '📋', iconName: 'clipboard', group: 'overview', always: true },
  { href: '/dashboard/ask-ume', label: 'اسأل UME', icon: '🤖', iconName: 'sparkle', group: 'overview', always: true },
  { href: '/dashboard/email-rewrite', label: 'إعادة صياغة الإيميلات', icon: '✉️', iconName: 'file', group: 'overview', always: true },

  /*
   * دورة الشراء بترتيبها الواقعي: مورّد ← أمر شراء ← استلام ← فاتورة ← بنودها ← سداد.
   *
   * الترتيب هنا معلومة لا تنسيق: من يفتح القائمة يقرأ المسار الذي يسلكه المستند
   * فعلاً. و«تأكيد الاستلام» كان في مجموعة المحاسبة — وهو حلقةٌ في هذه السلسلة
   * لا في الدفتر، فعاد إلى موضعه.
   */
  { href: '/dashboard/suppliers', label: 'الموردين', icon: '🏭', iconName: 'factory', group: 'procurement' },
  { href: '/dashboard/purchase-orders', label: 'أوامر الشراء', icon: '📋', iconName: 'clipboard', group: 'procurement' },
  { href: '/dashboard/receipts', label: 'تأكيد الاستلام', icon: '📦', iconName: 'check', group: 'procurement' },
  { href: '/dashboard/invoices', label: 'الفواتير', icon: '🧾', iconName: 'receipt', group: 'procurement' },
  { href: '/dashboard/items', label: 'بنود الفواتير', icon: '🏷️', iconName: 'tag', group: 'procurement' },
  { href: '/dashboard/payments', label: 'المدفوعات', icon: '💳', iconName: 'card', group: 'procurement' },

  // ودورة القبض بترتيبها: عميل ← شركة الشحن ← ما يُفوتر عليه
  { href: '/dashboard/customers', label: 'العملاء', icon: '🤝', iconName: 'users', group: 'revenue' },
  { href: '/dashboard/shipping-companies', label: 'شركات الشحن', icon: '🏢', iconName: 'building', group: 'revenue' },
  { href: '/dashboard/hire-invoices', label: 'فواتير الإيجار', icon: '🚢💰', iconName: 'file', group: 'revenue' },
  { href: '/dashboard/management-invoices', label: 'فواتير الإدارة', icon: '📄', iconName: 'file', group: 'revenue' },

  /*
   * الأسطول: الأصل وما يُقاس به.
   * و«توزيع الأرباح» يقسم أرباح رحلات المراكب بين الشريكين — فمكانه هنا لا في
   * مجموعةٍ ماليةٍ لا تحمل غيره.
   */
  { href: '/dashboard/vessels', label: 'السفن', icon: '🚢', iconName: 'ship', group: 'fleet' },
  { href: '/dashboard/profit-distribution', label: 'توزيع الأرباح', icon: '💰', iconName: 'coins', group: 'fleet' },
  { href: '/dashboard/market', label: 'تحليل السوق الملاحي', icon: '📈', iconName: 'chart', group: 'fleet' },

  // ── المحاسبة · P1.1A ──
  // لا تُمنح لأحد تلقائياً: لا `always` ولا تعديل على allowed_screens لأي مستخدم.
  // الفصل بين الواجبات هنا: مُعِدّ القيد (journals) ≠ مُرحِّله (posting).
  //
  // والثلاث المخفيّة صلاحيات بلا صفحات بعد: `journals` و `posting` تحكمان أزراراً
  // داخل الشاشات القائمة، و`periods` عبر الـAPI حتى تُبنى. فتبقى `hidden` —
  // الرابط الذي يؤدي إلى 404 أسوأ من غياب الرابط.
  { href: '/dashboard/accounting', label: 'دفتر الأستاذ', icon: '📒', iconName: 'file', group: 'sivamar_qb' },
  { href: '/dashboard/accounting/statements', label: 'القوائم المالية', icon: '📑', iconName: 'chart', group: 'sivamar_qb' },
  { href: '/dashboard/accounting/reports', label: 'تقارير الدفتر', icon: '📊', iconName: 'chart', group: 'sivamar_qb' },
  { href: '/dashboard/accounting/journals', label: 'إعداد القيود', icon: '📝', iconName: 'file', group: 'sivamar_qb', hidden: true },
  { href: '/dashboard/accounting/posting', label: 'ترحيل القيود', icon: '📮', iconName: 'check', group: 'sivamar_qb', hidden: true },
  { href: '/dashboard/accounting/periods', label: 'الفترات المحاسبية', icon: '🗓️', iconName: 'file', group: 'sivamar_qb', hidden: true },

  /*
   * الإدارة والإعدادات — آخر القائمة.
   * ما يُفتح مرّةً كل شهر لا يزاحم ما يُفتح كل يوم. و«إعداد المحاسبة» شاشة ضبطٍ
   * كانت تجلس بين شاشات العمل اليومي في الدفتر.
   */
  { href: '/dashboard/tasks', label: 'مهام الفريق', icon: '✅', iconName: 'check', group: 'admin' },
  { href: '/dashboard/accounting/setup', label: 'إعداد المحاسبة', icon: '⚙️', iconName: 'file', group: 'admin' },
  { href: '/dashboard/users', label: 'الصلاحيات', icon: '🔐', iconName: 'shield', group: 'admin', adminOnly: true },
  { href: '/dashboard/audit', label: 'تدقيق السلامة المالية', icon: '🛡️', iconName: 'shield', group: 'admin', adminOnly: true },
];

// الشاشات التي يمكن منحها/منعها في شاشة الصلاحيات (استبعاد الرئيسية والأدمن-فقط)
export const PERMISSION_SCREENS = SCREENS.filter((s) => !s.always && !s.adminOnly);

// هل يرى المستخدم هذه الشاشة؟
export function canAccess(user: any, screen: Screen): boolean {
  const isAdmin = user?.role === 'admin';
  if (screen.adminOnly) return isAdmin;
  if (isAdmin) return true;
  if (screen.always) return true;
  const allowed = user?.allowed_screens;
  if (!Array.isArray(allowed)) return true; // لا قيود محددة = مسموح (توافق رجعي)
  return allowed.includes(screen.href);
}
