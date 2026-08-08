'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Icon, cx } from '@/components/ui';
import { useNotifications, describeNotif, NOTIF_ICON, SEVERITY_STYLE } from '@/lib/notifications';

export default function NotificationBell() {
  const { locale } = useI18n();
  const router = useRouter();
  const { active, unreadCount, loading, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const top = active.slice(0, 8);
  const t = (ar: string, en: string) => (locale === 'en' ? en : ar);

  function goto(route: string, id: string) { markRead(id); setOpen(false); router.push(route); }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} title={t('التنبيهات', 'Attention')}
        className="relative text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg p-2" aria-label="notifications">
        <Icon name="bell" size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800 text-sm">{t('مركز الانتباه', 'Attention Center')}</span>
              {active.length > 0 && <span className="text-[11px] text-gray-400">{active.length}</span>}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-indigo-600 hover:underline">{t('تعليم الكل كمقروء', 'Mark all read')}</button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-gray-400 text-sm">{t('جاري التحميل…', 'Loading…')}</div>
            ) : top.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <Icon name="check" size={26} />
                <p className="mt-2">{t('لا توجد تنبيهات حالياً', 'No current attention items')}</p>
              </div>
            ) : (
              top.map((n) => {
                const { title, detail } = describeNotif(n, locale === 'en' ? 'en' : 'ar');
                return (
                  <button key={n.id} onClick={() => goto(n.route, n.id)}
                    className="w-full text-start flex items-start gap-2.5 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50">
                    <span className={cx('shrink-0 mt-0.5 w-7 h-7 rounded-lg border flex items-center justify-center', SEVERITY_STYLE[n.severity])}>
                      <Icon name={NOTIF_ICON[n.type] || 'bell'} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 leading-snug truncate">{title}</span>
                      {detail && <span className="block text-xs text-gray-500 truncate">{detail}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button onClick={() => { setOpen(false); router.push('/dashboard/notifications'); }}
            className="w-full py-2.5 text-sm text-indigo-600 hover:bg-indigo-50 font-medium border-t border-gray-100">
            {t('عرض الكل', 'View all')}
          </button>
        </div>
      )}
    </div>
  );
}
