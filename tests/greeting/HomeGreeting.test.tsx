import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { dailyLine } from '@/lib/greeting';

/*
 * المكوّن: يكتب التحيّة بعد التركيب فقط (لا اختلاف بين الخادم والمتصفّح)،
 * ويتحدّث عند تغيّر الفترة بلا إعادة تحميل، ويُفضّل معلومة العمل على الجملة اليوميّة.
 */
let user: { id: string; full_name: string } | null = { id: 'u1', full_name: 'Bassel Hany' };
let notif = { tasks: [] as unknown[], invoices: [] as unknown[], tasksState: 'ok', invoicesState: 'ok' };
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'ar' }) }));
vi.mock('@/lib/notifications', () => ({ useNotifications: () => notif }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import HomeGreeting from '@/components/dashboard/HomeGreeting';
import { renderToString } from 'react-dom/server';

const setUser = (u: typeof user) => { if (u) localStorage.setItem('user', JSON.stringify(u)); else localStorage.removeItem('user'); };
beforeEach(() => {
  vi.useFakeTimers();
  user = { id: 'u1', full_name: 'Bassel Hany' };
  setUser(user);
  notif = { tasks: [], invoices: [], tasksState: 'ok', invoicesState: 'ok' };
});
afterEach(() => { vi.useRealTimers(); });

describe('HomeGreeting', () => {
  it('الخادم لا يكتب نصّاً يتغيّر بالوقت أو المستخدم', () => {
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'));
    const html = renderToString(<HomeGreeting />);
    expect(html).not.toContain('صباح');
    expect(html).not.toContain('Bassel');
  });

  it('التحيّة بالاسم الأوّل، وتتبدّل عند 12:00 القاهرة بلا إعادة تحميل', () => {
    vi.setSystemTime(new Date('2026-09-27T08:59:00Z'));      // 11:59 القاهرة
    render(<HomeGreeting />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('صباح الخير يا Bassel');
    act(() => { vi.setSystemTime(new Date('2026-09-27T09:00:10Z')); vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('يومك سعيد يا Bassel');
  });

  it('تتحدّث عند العودة إلى التبويب', () => {
    vi.setSystemTime(new Date('2026-09-27T13:59:00Z'));      // 16:59 القاهرة
    render(<HomeGreeting />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('يومك سعيد يا Bassel');
    act(() => { vi.setSystemTime(new Date('2026-09-27T14:05:00Z')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('مساء الخير يا Bassel');
  });

  it('بلا اسمٍ صالح: تحيّةٌ بلا «يا»', () => {
    setUser({ id: 'u1', full_name: 'bassel@ume.com' });
    vi.setSystemTime(new Date('2026-09-27T16:00:00Z'));      // 19:00 القاهرة
    render(<HomeGreeting />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('مساء الخير');
  });

  it('معلومة العمل رابطٌ إلى الشاشة بفلترها', () => {
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'));
    notif = { ...notif, tasks: [{ owner: 'Bassel', due_date: '2026-09-20', status: 'pending' }] };
    render(<HomeGreeting />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('/dashboard/tasks?preset=overdue&owner=Bassel');
    expect(a.textContent).toBe('لديك مهمّة متأخّرة واحدة تحتاج المتابعة.');
  });

  it('فشل التحميل: الجملة اليوميّة لا ادّعاء إنجاز', () => {
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'));
    notif = { ...notif, tasksState: 'failed', invoicesState: 'failed' };
    render(<HomeGreeting />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('daily-line').textContent).toBe(dailyLine('2026-09-27'));
  });

  it('أثناء التحميل: لا جملة ولا معلومة بعد (لا وميض)', () => {
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'));
    notif = { ...notif, tasksState: 'loading' };
    render(<HomeGreeting />);
    expect(screen.queryByTestId('daily-line')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
