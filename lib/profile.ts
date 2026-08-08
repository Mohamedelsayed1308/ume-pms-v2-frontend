// تخصيص تجربة الواجهة حسب صلاحيات المستخدم الحالية — بدون نظام صلاحيات جديد.
// يعتمد كلياً على role + allowed_screens + canAccess الموجودة. للعرض/الترتيب فقط، لا للأمان.
import { SCREENS, canAccess } from './screens';

// هل يصل المستخدم لشاشة معيّنة؟ (شاشة غير معرّفة = متاحة، مثل /dashboard/notifications)
export function canHref(user: any, href: string): boolean {
  const s = SCREENS.find((x) => x.href === href);
  return s ? canAccess(user, s) : true;
}

export type Profile = 'admin' | 'management' | 'finance' | 'operations' | 'limited';

export const PROFILE_LABEL: Record<Profile, { ar: string; en: string }> = {
  admin: { ar: 'وصول كامل', en: 'Full access' },
  management: { ar: 'توجّه إداري', en: 'Management view' },
  finance: { ar: 'توجّه مالي', en: 'Finance view' },
  operations: { ar: 'توجّه تشغيلي', en: 'Operations view' },
  limited: { ar: 'وصول محدود', en: 'Limited access' },
};

// اشتقاق ملف التجربة (فرونت فقط) من الصلاحيات الفعلية — ليست دوراً أمنياً.
export function deriveProfile(user: any): Profile {
  if (user?.role === 'admin') return 'admin';
  const allowed = Array.isArray(user?.allowed_screens) ? (user.allowed_screens as string[]) : null;
  if (!allowed) return 'admin'; // null = بلا قيود (توافق رجعي) = تجربة كاملة
  const has = (h: string) => allowed.includes(h);
  const finance = ['/dashboard/invoices', '/dashboard/payments', '/dashboard/suppliers', '/dashboard/purchase-orders'].filter(has).length;
  const ops = ['/dashboard/tasks', '/dashboard/vessels'].filter(has).length;
  const hasReports = has('/dashboard/reports');
  if (finance >= 3) return 'finance';
  if (hasReports && finance <= 1) return 'management';
  if (ops >= 1 && finance <= 1) return 'operations';
  if (allowed.length <= 2) return 'limited';
  return 'finance';
}

// ترتيب مؤشّرات KPI حسب الملف (المسموح فقط يُعرض؛ هذا ترتيب أهمية للعرض)
export function kpiOrder(profile: Profile): string[] {
  switch (profile) {
    case 'finance': return ['payables', 'overdue', 'payments', 'receivables'];
    case 'management': return ['overdue', 'payables', 'receivables', 'payments'];
    case 'operations': return ['overdue', 'payables', 'payments', 'receivables'];
    default: return ['payables', 'receivables', 'overdue', 'payments'];
  }
}
