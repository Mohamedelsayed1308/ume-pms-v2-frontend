'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/auth';
import { SCREENS, GROUPS, canAccess } from '@/lib/screens';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ToastProvider, Icon, cx } from '@/components/ui';
import { NotificationsProvider } from '@/lib/notifications';
import NotificationBell from '@/components/NotificationBell';
import { CommandPaletteProvider, useCommandPalette } from '@/components/CommandPalette';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <NotificationsProvider>
          <CommandPaletteProvider>
            <Shell>{children}</Shell>
          </CommandPaletteProvider>
        </NotificationsProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, toggle } = useI18n();
  const palette = useCommandPalette();
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    setUser(getUser());
    setCollapsed(localStorage.getItem('sidebarCollapsed') === '1');
  }, [router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapse = () => setCollapsed((c) => { const n = !c; localStorage.setItem('sidebarCollapsed', n ? '1' : '0'); return n; });

  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  const active = SCREENS.find((s) => isActive(s.href));
  const initials = (user?.full_name || 'U').trim().slice(0, 2);

  const NavContent = ({ collapsed }: { collapsed: boolean }) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
      {GROUPS.map((g) => {
        const items = SCREENS.filter((s) => s.group === g.key && !s.hidden && canAccess(user, s));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            {!collapsed && <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t(g.i18nKey)}</p>}
            <div className="space-y-0.5">
              {items.map((item) => {
                const on = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    className={cx('flex items-center gap-3 rounded-xl text-sm transition-colors',
                      collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                      on ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
                    <Icon name={item.iconName || 'file'} size={19} strokeWidth={on ? 2 : 1.7} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const Brand = ({ collapsed }: { collapsed: boolean }) => (
    <div className={cx('flex items-center gap-2.5 px-4 h-16 border-b border-white/10 shrink-0', collapsed && 'justify-center px-0')}>
      <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-extrabold shrink-0">U</div>
      {!collapsed && <div><p className="font-bold text-white leading-tight">{t('app.name')}</p><p className="text-[11px] text-slate-400">PMS</p></div>}
    </div>
  );

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* ===== Desktop sidebar ===== */}
      <aside className={cx('hidden md:flex flex-col bg-navy-900 text-white transition-[width] duration-200 shrink-0', collapsed ? 'w-[72px]' : 'w-64')}
        style={{ background: 'linear-gradient(180deg,#0b1531,#070d1c)' }}>
        <Brand collapsed={collapsed} />
        <NavContent collapsed={collapsed} />
        <div className="p-2.5 border-t border-white/10">
          <button onClick={toggleCollapse} className="w-full flex items-center justify-center gap-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl py-2 text-xs">
            <Icon name={collapsed ? 'chevronLeft' : 'chevronRight'} size={18} />
            {!collapsed && <span>{t('topbar.collapse')}</span>}
          </button>
        </div>
      </aside>

      {/* ===== Mobile drawer ===== */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)}>
          <aside className="absolute inset-y-0 right-0 w-64 flex flex-col text-white" style={{ background: 'linear-gradient(180deg,#0b1531,#070d1c)', animation: 'ume-slide-in-rtl .2s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <Brand collapsed={false} />
            <NavContent collapsed={false} />
          </aside>
        </div>
      )}

      {/* ===== Main column ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center gap-3 px-4 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-gray-500 hover:text-gray-800 p-1.5 rounded-lg hover:bg-gray-100" aria-label={t('topbar.menu')}>
            <Icon name="menu" size={22} />
          </button>
          {/*
            * لافتةٌ للموضع لا عنوانٌ للمستند: كل شاشة تحمل `h1` خاصّاً بها، فوجود
            * `h1` ثانٍ في الشريط يجعل للصفحة عنوانين متنافسين في شجرة الوصول.
            */}
          <p className="font-bold text-gray-800 truncate">{active?.label || t('app.name')}</p>

          <div className="hidden lg:flex items-center gap-2 mr-4 flex-1 max-w-md">
            <button onClick={palette.open} title={t('topbar.searchHint')}
              className="w-full flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-400 hover:border-gray-300 hover:bg-gray-100 transition">
              <Icon name="search" size={16} />
              <span className="flex-1 text-start truncate">{t('topbar.search')}</span>
              <kbd className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5 mr-auto">
            <button onClick={palette.open} title={t('topbar.search')} aria-label={t('topbar.search')} className="lg:hidden text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg p-2">
              <Icon name="search" size={19} />
            </button>
            <button onClick={toggle} title={t('topbar.language')} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg px-2 py-1.5 text-xs font-medium">
              <Icon name="globe" size={18} />{locale === 'ar' ? 'EN' : 'ع'}
            </button>
            <Link href="/dashboard/ask-ume" title="Ask UME" aria-label="Ask UME"
              className={cx('flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                isActive('/dashboard/ask-ume') ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100')}>
              <Icon name="sparkle" size={18} /><span className="hidden sm:inline">Ask UME</span>
            </Link>
            <NotificationBell />
            <div className="flex items-center gap-2 pr-2 mr-1 border-r border-gray-100">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center uppercase">{initials}</div>
              <div className="hidden sm:block leading-tight">
                <p className="text-xs font-semibold text-gray-700 max-w-[120px] truncate">{user?.full_name || '—'}</p>
                <button onClick={logout} className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <Icon name="logout" size={12} />{t('topbar.logout')}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {/*
            * الحشو السفلي الزائد ليس فراغاً: أزرار المساعد الذكي `fixed bottom-6`
            * تطفو فوق المحتوى، فبدونه يبقى آخر صفٍّ في كل جدولٍ مغطّى أبداً — لا
            * يُقرأ ولا يُضغط مهما نزل المستخدم.
            *
            * وموضعه هنا لا على `main`: هناك يزاحمه `md:p-6`، وهما أداتان
            * متعارضتان يحسمهما ترتيب ملف الأنماط لا ترتيب السلسلة — فيغلب
            * المختصرُ داخلَ استعلام الوسائط. وعلى عنصرٍ لا حشو له لا تعارض أصلاً.
            */}
          <div className="ume-fade-in pb-20">{children}</div>
        </main>
      </div>
    </div>
  );
}
