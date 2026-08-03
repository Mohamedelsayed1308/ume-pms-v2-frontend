export interface Screen {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean; // يظهر للأدمن فقط ولا يخضع لقائمة الصلاحيات
  always?: boolean;     // متاح دائماً لكل مستخدم (لا يُقيَّد)
}

// كل شاشات النظام — مصدر واحد للسايدبار ولشاشة الصلاحيات
export const SCREENS: Screen[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠', always: true },
  { href: '/dashboard/vessels', label: 'السفن', icon: '🚢' },
  { href: '/dashboard/suppliers', label: 'الموردين', icon: '🏭' },
  { href: '/dashboard/purchase-orders', label: 'أوامر الشراء', icon: '📋' },
  { href: '/dashboard/invoices', label: 'الفواتير', icon: '🧾' },
  { href: '/dashboard/items', label: 'بنود الفواتير', icon: '🏷️' },
  { href: '/dashboard/payments', label: 'المدفوعات', icon: '💳' },
  { href: '/dashboard/reports', label: 'التقارير', icon: '📊' },
  { href: '/dashboard/customers', label: 'العملاء', icon: '🤝' },
  { href: '/dashboard/hire-invoices', label: 'فواتير الإيجار', icon: '🚢💰' },
  { href: '/dashboard/shipping-companies', label: 'شركات الشحن', icon: '🏢' },
  { href: '/dashboard/management-invoices', label: 'فواتير الإدارة', icon: '📄' },
  { href: '/dashboard/profit-distribution', label: 'توزيع الأرباح', icon: '💰' },
  { href: '/dashboard/tasks', label: 'مهام الفريق', icon: '✅' },
  { href: '/dashboard/users', label: 'الصلاحيات', icon: '🔐', adminOnly: true },
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
