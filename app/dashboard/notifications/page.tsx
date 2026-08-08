'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Icon, cx, Spinner, EmptyState, Button } from '@/components/ui';
import {
  useNotifications, describeNotif, NOTIF_ICON, SEVERITY_STYLE, SEVERITY_LABEL, CATEGORY_LABEL,
  type Category, type Severity,
} from '@/lib/notifications';

export default function NotificationsPage() {
  const { locale } = useI18n();
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = (ar: string, en: string) => (locale === 'en' ? en : ar);
  const router = useRouter();
  const { active, loading, error, dismiss, markRead, markAllRead, refresh, unreadCount } = useNotifications();

  const [cat, setCat] = useState<Category | 'all'>('all');
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const [search, setSearch] = useState('');
  // يعتمد على الجلب المشترك الواحد من المزوّد؛ التحديث اليدوي متاح عبر زر "تحديث" (توفيراً للطلبات)

  const counts = useMemo(() => {
    const c: any = { total: active.length, critical: 0, warning: 0, info: 0, financial: 0, tasks: 0, fleet: 0 };
    active.forEach((n) => { c[n.severity]++; c[n.category]++; });
    return c;
  }, [active]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter((n) => {
      if (cat !== 'all' && n.category !== cat) return false;
      if (sev !== 'all' && n.severity !== sev) return false;
      if (q) {
        const { title, detail } = describeNotif(n, loc);
        if (!(`${title} ${detail}`.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [active, cat, sev, search, loc]);

  const catTabs = ([
    { key: 'all', label: t('الكل', 'All'), n: counts.total },
    { key: 'financial', label: t(CATEGORY_LABEL.financial.ar, CATEGORY_LABEL.financial.en), n: counts.financial },
    { key: 'tasks', label: t(CATEGORY_LABEL.tasks.ar, CATEGORY_LABEL.tasks.en), n: counts.tasks },
    { key: 'fleet', label: t(CATEGORY_LABEL.fleet.ar, CATEGORY_LABEL.fleet.en), n: counts.fleet },
  ] as { key: Category | 'all'; label: string; n: number }[]).filter((tb) => tb.key === 'all' || tb.n > 0); // إخفاء الفئات الفارغة
  const sevTabs: { key: Severity | 'all'; label: string; n?: number }[] = [
    { key: 'all', label: t('كل الدرجات', 'All severities') },
    { key: 'critical', label: t(SEVERITY_LABEL.critical.ar, SEVERITY_LABEL.critical.en), n: counts.critical },
    { key: 'warning', label: t(SEVERITY_LABEL.warning.ar, SEVERITY_LABEL.warning.en), n: counts.warning },
    { key: 'info', label: t(SEVERITY_LABEL.info.ar, SEVERITY_LABEL.info.en), n: counts.info },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('مركز الانتباه', 'Attention Center')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('تنبيهات قابلة للتنفيذ مشتقّة من بيانات النظام الحالية', 'Actionable alerts derived from current system data')}</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <Button variant="outline" size="sm" onClick={markAllRead}><Icon name="check" size={15} /> {t('تعليم الكل كمقروء', 'Mark all read')}</Button>}
          <Button variant="outline" size="sm" onClick={refresh}><Icon name="chart" size={15} /> {t('تحديث', 'Refresh')}</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: t('الإجمالي', 'Total'), value: counts.total, tone: 'text-gray-700' },
          { label: t('حرجة', 'Critical'), value: counts.critical, tone: 'text-red-600' },
          { label: t('تحذيرات', 'Warnings'), value: counts.warning, tone: 'text-amber-600' },
          { label: t('معلومات', 'Info'), value: counts.info, tone: 'text-blue-600' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className={cx('text-2xl font-bold', c.tone)}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {catTabs.map((c) => (
          <button key={c.key} onClick={() => setCat(c.key)}
            className={cx('px-3 py-1.5 rounded-full text-sm font-medium border transition', cat === c.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
            {c.label} <span className="opacity-70">({c.n})</span>
          </button>
        ))}
        <div className="relative ms-auto">
          <span className="absolute top-1/2 -translate-y-1/2 start-2.5 text-gray-400 pointer-events-none"><Icon name="search" size={15} /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث…', 'Search…')}
            className="border border-gray-200 rounded-lg ps-8 pe-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap text-sm">
        {sevTabs.map((s) => (
          <button key={s.key} onClick={() => setSev(s.key)}
            className={cx('px-2.5 py-1 rounded-lg border transition', sev === s.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')}>
            {s.label}{typeof s.n === 'number' ? ` (${s.n})` : ''}
          </button>
        ))}
        <span className="text-[11px] text-gray-400 ms-auto">{t('حالة القراءة/الإخفاء محلية على هذا المتصفح فقط', 'Read/dismiss is local to this browser only')}</span>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-100 p-10 text-center">
          <p className="text-red-500 text-sm mb-3">{t('تعذّر تحميل بيانات التنبيهات', 'Could not load attention data')}</p>
          <Button variant="outline" size="sm" onClick={refresh}>{t('إعادة المحاولة', 'Retry')}</Button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon="check" title={active.length === 0 ? t('لا توجد تنبيهات قابلة للتنفيذ', 'No current attention items') : t('لا نتائج للفلاتر الحالية', 'No items match the current filters')} />
      ) : (
        <div className="space-y-2">
          {list.map((n) => {
            const { title, detail } = describeNotif(n, loc);
            return (
              <div key={n.id} className="group bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-start gap-3 hover:shadow transition">
                <span className={cx('shrink-0 mt-0.5 w-9 h-9 rounded-lg border flex items-center justify-center', SEVERITY_STYLE[n.severity])}>
                  <Icon name={NOTIF_ICON[n.type] || 'bell'} size={18} />
                </span>
                <button onClick={() => { markRead(n.id); router.push(n.route); }} className="min-w-0 flex-1 text-start">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cx('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', SEVERITY_STYLE[n.severity])}>{t(SEVERITY_LABEL[n.severity].ar, SEVERITY_LABEL[n.severity].en)}</span>
                    <span className="text-[10px] text-gray-400">{t(CATEGORY_LABEL[n.category].ar, CATEGORY_LABEL[n.category].en)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-1 leading-snug">{title}</p>
                  {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { markRead(n.id); router.push(n.route); }} title={t('انتقال', 'Open')} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                    <Icon name={locale === 'en' ? 'chevronLeft' : 'chevronRight'} size={16} />
                  </button>
                  <button onClick={() => dismiss(n.id)} title={t('إخفاء', 'Dismiss')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
