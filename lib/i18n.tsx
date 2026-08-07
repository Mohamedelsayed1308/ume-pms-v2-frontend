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
