'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Locale = 'ar' | 'en';
export type Dir = 'rtl' | 'ltr';

// قاموس مركزي — Phase 1 يغطّي القشرة (shell) والتنقّل والعناصر العامة.
// صفحات المحتوى تُهاجَر تدريجياً في مراحل لاحقة.
const DICT: Record<string, { ar: string; en: string }> = {
  'app.name': { ar: 'UME Holding', en: 'UME Holding' },
  'app.subtitle': { ar: 'نظام إدارة المشتريات والأسطول', en: 'Procurement & Fleet PMS' },

  'group.overview': { ar: 'نظرة عامة', en: 'Overview' },
  'group.procurement': { ar: 'المشتريات والمستحقات', en: 'Procurement & Payables' },
  'group.fleet': { ar: 'الأسطول', en: 'Fleet' },
  'group.revenue': { ar: 'الإيرادات والعملاء', en: 'Revenue & Customers' },
  'group.finance': { ar: 'المالية والرقابة', en: 'Finance & Control' },
  'group.operations': { ar: 'العمليات', en: 'Operations' },
  'group.admin': { ar: 'الإدارة', en: 'Administration' },

  'topbar.search': { ar: 'بحث…', en: 'Search…' },
  'topbar.searchHint': { ar: 'بحث عام (قريباً)', en: 'Global search (soon)' },
  'topbar.notifications': { ar: 'الإشعارات', en: 'Notifications' },
  'topbar.language': { ar: 'اللغة', en: 'Language' },
  'topbar.logout': { ar: 'تسجيل الخروج', en: 'Log out' },
  'topbar.collapse': { ar: 'طيّ القائمة', en: 'Collapse' },
  'topbar.expand': { ar: 'توسيع القائمة', en: 'Expand' },
  'topbar.menu': { ar: 'القائمة', en: 'Menu' },

  'common.loading': { ar: 'جاري التحميل…', en: 'Loading…' },
  'common.empty': { ar: 'لا توجد بيانات', en: 'No data' },
  'common.error': { ar: 'حدث خطأ', en: 'Something went wrong' },
  'common.retry': { ar: 'إعادة المحاولة', en: 'Retry' },
  'common.save': { ar: 'حفظ', en: 'Save' },
  'common.cancel': { ar: 'إلغاء', en: 'Cancel' },
  'common.soon': { ar: 'قريباً', en: 'Soon' },
  'common.viewAll': { ar: 'عرض الكل', en: 'View all' },
  'common.asOfNow': { ar: 'حتى الآن', en: 'As of now' },
  'common.vsPrev': { ar: 'عن الفترة السابقة', en: 'vs previous' },

  'dash.title': { ar: 'لوحة الإدارة', en: 'Management Dashboard' },
  'dash.subtitle': { ar: 'نظرة تنفيذية ومالية على الأداء', en: 'Executive & finance overview' },

  'period.today': { ar: 'اليوم', en: 'Today' },
  'period.week': { ar: 'هذا الأسبوع', en: 'This week' },
  'period.month': { ar: 'هذا الشهر', en: 'This month' },
  'period.quarter': { ar: 'هذا الربع', en: 'This quarter' },
  'period.year': { ar: 'هذه السنة', en: 'This year' },
  'period.custom': { ar: 'مخصص', en: 'Custom' },

  'kpi.payables': { ar: 'مستحقات دائنة (موردون)', en: 'Outstanding payables' },
  'kpi.receivables': { ar: 'مستحقات مدينة (إيجار)', en: 'Outstanding receivables' },
  'kpi.overdue': { ar: 'متأخرات السداد', en: 'Overdue payables' },
  'kpi.paymentsPeriod': { ar: 'مدفوعات الفترة', en: 'Payments this period' },
  'kpi.openInvoices': { ar: 'فواتير مفتوحة', en: 'Open invoices' },
  'kpi.mgmtOutstanding': { ar: 'رسوم إدارة مستحقة', en: 'Management fees due' },
  'kpi.fleetRevenue': { ar: 'إيراد الأسطول', en: 'Fleet revenue' },
  'kpi.fleetExpenses': { ar: 'مصروفات الأسطول', en: 'Fleet expenses' },
  'kpi.fleetNet': { ar: 'صافي الأسطول', en: 'Fleet net' },

  'sec.attention': { ar: 'يحتاج انتباه', en: 'Needs attention' },
  'sec.performance': { ar: 'الأداء المالي', en: 'Financial performance' },
  'sec.fleet': { ar: 'لمحة الأسطول', en: 'Fleet snapshot' },
  'sec.cash': { ar: 'النقد والمدفوعات', en: 'Cash & payments' },
  'sec.recent': { ar: 'أحدث النشاط', en: 'Recent activity' },
  'sec.quickActions': { ar: 'إجراءات سريعة', en: 'Quick actions' },
  'sec.topSuppliers': { ar: 'أكبر الموردين إنفاقاً', en: 'Top suppliers by spend' },
  'sec.statusDist': { ar: 'توزيع حالات الفواتير', en: 'Invoice status distribution' },
  'sec.revStreams': { ar: 'مصادر الإيراد', en: 'Revenue streams' },

  'att.overdueInv': { ar: 'فواتير متأخرة', en: 'Overdue invoices' },
  'att.dueSoon': { ar: 'تستحق قريباً', en: 'Due soon' },
  'att.approvalDelays': { ar: 'اعتمادات متأخرة', en: 'Approval delays' },
  'att.overdueTasks': { ar: 'مهام متأخرة', en: 'Overdue tasks' },
  'att.allClear': { ar: 'لا يوجد ما يحتاج انتباهاً الآن', en: 'Nothing needs attention right now' },

  'qa.addInvoice': { ar: 'إضافة فاتورة', en: 'Add invoice' },
  'qa.addPayment': { ar: 'تسجيل دفعة', en: 'Add payment' },
  'qa.addSupplier': { ar: 'إضافة مورد', en: 'Add supplier' },
  'qa.addPO': { ar: 'أمر شراء', en: 'Purchase order' },
  'qa.addTask': { ar: 'مهمة جديدة', en: 'New task' },
  'qa.reports': { ar: 'التقارير', en: 'Reports' },

  'st.unpaid': { ar: 'غير مدفوعة', en: 'Unpaid' },
  'st.partial': { ar: 'مدفوعة جزئياً', en: 'Partial' },
  'st.paid': { ar: 'مدفوعة', en: 'Paid' },
  'st.cancelled': { ar: 'ملغاة', en: 'Cancelled' },

  'lbl.revenueHire': { ar: 'إيجار (عملاء)', en: 'Hire (customers)' },
  'lbl.revenueFleet': { ar: 'الأسطول (تشغيلي)', en: 'Fleet (operational)' },
  'lbl.vessel': { ar: 'المركب', en: 'Vessel' },
  'lbl.revenue': { ar: 'الإيراد', en: 'Revenue' },
  'lbl.expenses': { ar: 'المصروفات', en: 'Expenses' },
  'lbl.net': { ar: 'الصافي', en: 'Net' },
  'lbl.count': { ar: 'العدد', en: 'Count' },
  'lbl.recentInvoices': { ar: 'أحدث الفواتير', en: 'Recent invoices' },
  'lbl.recentPayments': { ar: 'أحدث المدفوعات', en: 'Recent payments' },
  'lbl.recentTasks': { ar: 'أحدث المهام', en: 'Recent tasks' },
  'note.currency': { ar: 'المبالغ معروضة لكل عملة على حدة (لا يوجد تحويل).', en: 'Amounts shown per currency (no conversion).' },
  'note.asOf': { ar: 'أرصدة قائمة حتى اللحظة — لا تتأثر بالفترة.', en: 'Outstanding balances as of now — not period-filtered.' },
};

interface I18nCtx {
  locale: Locale;
  dir: Dir;
  t: (key: string, fallback?: string) => string;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ar');

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('locale')) as Locale | null;
    if (saved === 'ar' || saved === 'en') setLocaleState(saved);
  }, []);

  useEffect(() => {
    const dir: Dir = locale === 'ar' ? 'rtl' : 'ltr';
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem('locale', l);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => DICT[key]?.[locale] ?? fallback ?? key,
    [locale],
  );

  const value: I18nCtx = {
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    t,
    setLocale,
    toggle: () => setLocale(locale === 'ar' ? 'en' : 'ar'),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) {
    // fallback آمن لو استُخدم خارج المزوّد (أثناء الانتقال التدريجي)
    return {
      locale: 'ar' as Locale, dir: 'rtl' as Dir,
      t: (k: string, f?: string) => DICT[k]?.ar ?? f ?? k,
      setLocale: () => {}, toggle: () => {},
    } as I18nCtx;
  }
  return c;
}
