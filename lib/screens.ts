export type GroupKey = 'overview' | 'procurement' | 'fleet' | 'revenue' | 'finance' | 'operations' | 'admin';

export interface Screen {
  href: string;
  label: string;        // العربية (متوافق رجعياً)
  icon: string;         // إيموجي (متوافق رجعياً)
  iconName?: string;    // اسم أيقونة SVG الاحترافية (Icon component)
  group?: GroupKey;     // مجموعة التنقّل
  adminOnly?: boolean;  // للأدمن فقط
  always?: boolean;     // متاح دائماً لكل مستخدم
}

// ترتيب مجموعات التنقّل + مفاتيح الترجمة
export const GROUPS: { key: GroupKey; i18nKey: string }[] = [
  { key: 'overview', i18nKey: 'group.overview' },
  { key: 'procurement', i18nKey: 'group.procurement' },
  { key: 'fleet', i18nKey: 'group.fleet' },
  { key: 'revenue', i18nKey: 'group.revenue' },
  { key: 'finance', i18nKey: 'group.finance' },
  { key: 'operations', i18nKey: 'group.operations' },
  { key: 'admin', i18nKey: 'group.admin' },
];

// كل شاشات النظام — مصدر واحد للسايدبار ولشاشة الصلاحيات
export const SCREENS: Screen[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠', iconName: 'home', group: 'overview', always: true },
  { href: '/dashboard/reports', label: 'التقارير', icon: '📊', iconName: 'chart', group: 'overview' },
  { href: '/dashboard/ask-ume', label: 'اسأل UME', icon: '🤖', iconName: 'sparkle', group: 'overview', always: true },

  { href: '/dashboard/suppliers', label: 'الموردين', icon: '🏭', iconName: 'factory', group: 'procurement' },
  { href: '/dashboard/purchase-orders', label: 'أوامر الشراء', icon: '📋', iconName: 'clipboard', group: 'procurement' },
  { href: '/dashboard/invoices', label: 'الفواتير', icon: '🧾', iconName: 'receipt', group: 'procurement' },
  { href: '/dashboard/items', label: 'بنود الفواتير', icon: '🏷️', iconName: 'tag', group: 'procurement' },
  { href: '/dashboard/payments', label: 'المدفوعات', icon: '💳', iconName: 'card', group: 'procurement' },

  { href: '/dashboard/vessels', label: 'السفن', icon: '🚢', iconName: 'ship', group: 'fleet' },
  { href: '/dashboard/market', label: 'تحليل السوق الملاحي', icon: '📈', iconName: 'chart', group: 'fleet' },

  { href: '/dashboard/customers', label: 'العملاء', icon: '🤝', iconName: 'users', group: 'revenue' },
  { href: '/dashboard/hire-invoices', label: 'فواتير الإيجار', icon: '🚢💰', iconName: 'file', group: 'revenue' },
  { href: '/dashboard/shipping-companies', label: 'شركات الشحن', icon: '🏢', iconName: 'building', group: 'revenue' },
  { href: '/dashboard/management-invoices', label: 'فواتير الإدارة', icon: '📄', iconName: 'file', group: 'revenue' },

  { href: '/dashboard/profit-distribution', label: 'توزيع الأرباح', icon: '💰', iconName: 'coins', group: 'finance' },

  { href: '/dashboard/tasks', label: 'مهام الفريق', icon: '✅', iconName: 'check', group: 'operations' },

  { href: '/dashboard/users', label: 'الصلاحيات', icon: '🔐', iconName: 'shield', group: 'admin', adminOnly: true },
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
