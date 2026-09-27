import { describe, expect, it } from 'vitest';
import {
  DAILY_LINES, addDays, cairoNow, dailyLine, firstNameOf, greetingText, periodOf, pickWorkLine, workLineText,
  type WorkInput,
} from '@/lib/greeting';

// لحظةٌ بتوقيت القاهرة: مصر صيفاً UTC+3 (أبريل–أكتوبر) وشتاءً UTC+2
const at = (iso: string) => new Date(iso);

describe('حدود الساعة بتوقيت القاهرة', () => {
  it.each([
    [4, 59, 'evening'], [5, 0, 'morning'], [11, 59, 'morning'],
    [12, 0, 'day'], [16, 59, 'day'], [17, 0, 'evening'], [23, 59, 'evening'], [0, 0, 'evening'],
  ])('%i:%i ⇒ %s', (h, m, want) => {
    expect(periodOf(h)).toBe(want);
    expect(m).toBeGreaterThanOrEqual(0);
  });

  it('المنطقة الزمنيّة لا فرقٌ ثابت: 05:00 القاهرة صيفاً 02:00Z وشتاءً 03:00Z', () => {
    expect(cairoNow(at('2026-07-15T02:00:00Z')).hour).toBe(5);    // صيفيّ UTC+3
    expect(cairoNow(at('2026-01-15T03:00:00Z')).hour).toBe(5);    // شتويّ UTC+2
    expect(cairoNow(at('2026-01-15T02:59:00Z')).hour).toBe(4);
    expect(periodOf(cairoNow(at('2026-07-15T09:00:00Z')).hour)).toBe('day');      // 12:00 القاهرة
    expect(periodOf(cairoNow(at('2026-07-15T14:00:00Z')).hour)).toBe('evening');  // 17:00 القاهرة
  });

  it('تاريخ القاهرة يتغيّر عند منتصف ليلها لا منتصف ليل UTC', () => {
    expect(cairoNow(at('2026-09-27T20:59:00Z')).dateKey).toBe('2026-09-27');   // 23:59 القاهرة
    expect(cairoNow(at('2026-09-27T21:00:00Z')).dateKey).toBe('2026-09-28');   // 00:00 القاهرة
  });
});

describe('التحيّة والاسم', () => {
  it('الاسم الأوّل من full_name', () => {
    expect(firstNameOf({ full_name: 'Mohamed Elsayed' })).toBe('Mohamed');
    expect(firstNameOf({ full_name: '  محمد   السيد ' })).toBe('محمد');
    expect(greetingText('morning', 'محمد')).toBe('صباح الخير يا محمد');
    expect(greetingText('day', 'محمد')).toBe('يومك سعيد يا محمد');
    expect(greetingText('evening', 'محمد')).toBe('مساء الخير يا محمد');
  });
  it('بلا اسمٍ صالح: التحيّة وحدها بلا «يا» — والبريد لا يُستعمل اسماً', () => {
    for (const u of [null, {}, { full_name: '' }, { full_name: '   ' }, { full_name: 'mohamed@ume.com' }, { full_name: '123' }, { full_name: 42 }]) {
      expect(firstNameOf(u as { full_name?: unknown })).toBeNull();
    }
    expect(greetingText('morning', null)).toBe('صباح الخير');
    expect(greetingText('evening', null)).not.toContain('يا');
  });
  it('الإنجليزيّة بلا عربيّة', () => {
    expect(greetingText('morning', 'Mohamed', 'en')).toBe('Good morning, Mohamed');
    expect(greetingText('day', null, 'en')).toBe('Have a good day');
  });
});

describe('الجملة اليوميّة', () => {
  it('خمس عشرة جملةً مختلفة', () => {
    expect(DAILY_LINES.length).toBe(15);
    expect(new Set(DAILY_LINES).size).toBe(15);
  });
  it('ثابتةٌ طوال يوم القاهرة، وتتغيّر في اليوم التالي، وتدور على الخمس عشرة كلّها', () => {
    const a1 = dailyLine(cairoNow(at('2026-09-27T03:00:00Z')).dateKey);
    const a2 = dailyLine(cairoNow(at('2026-09-27T20:59:00Z')).dateKey);
    const b = dailyLine(cairoNow(at('2026-09-27T21:00:00Z')).dateKey);
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    const seen = new Set(Array.from({ length: 15 }, (_, i) => dailyLine(addDays('2026-09-27', i))));
    expect(seen.size).toBe(15);
  });
});

describe('السطر الثاني: الأولويّة والنطاق والفشل', () => {
  const base: WorkInput = {
    user: { id: 'u1', full_name: 'Bassel Hany' }, todayKey: '2026-09-27',
    tasks: [], invoices: [], tasksState: 'ok', invoicesState: 'ok',
  };
  const task = (owner: string, due: string, status = 'pending') => ({ owner, due_date: due, status });
  const inv = (due: string, status = 'unpaid') => ({ due_date: due, status });

  it('١) المهامّ المتأخّرة المسندة للمستخدم أوّلاً — ورابطها بفلتر المتأخّرة ومسؤولها', () => {
    const l = pickWorkLine({ ...base, tasks: [task('Bassel', '2026-09-20'), task('Bassel', '2026-09-26')], invoices: [inv('2026-09-01')] });
    expect(l).toEqual({ kind: 'tasks_overdue', count: 2, href: '/dashboard/tasks?preset=overdue&owner=Bassel' });
  });
  it('مهامّ غيره لا تُنسب له — ولا تخمين لـ «M.Elsayed» من «Mohamed»', () => {
    expect(pickWorkLine({ ...base, tasks: [task('Tarek', '2026-09-01')] })).toBeNull();
    const mo = { ...base, user: { id: 'u2', full_name: 'Mohamed' }, tasks: [task('M.Elsayed', '2026-09-01')] };
    expect(pickWorkLine(mo)).toBeNull();
  });
  it('الربط الصريح: حساب المالك يرى مهامّ «M.Elsayed»، وغيره لا', () => {
    const tasks = [task('M.Elsayed', '2026-09-01')];
    const owner = { ...base, user: { id: '8712bd6f-1880-4fd7-9a7d-8e9976e88eb1', full_name: 'Mohamed' }, tasks };
    expect(pickWorkLine(owner)).toEqual({ kind: 'tasks_overdue', count: 1, href: '/dashboard/tasks?preset=overdue&owner=M.Elsayed' });
    expect(pickWorkLine({ ...owner, user: { id: 'someone-else', full_name: 'Mohamed' } })).toBeNull();
  });
  it('المكتملة والملغاة لا تُعدّ، ولا مهمّة اليوم (ليست متأخّرة)', () => {
    const l = pickWorkLine({ ...base, tasks: [task('Bassel', '2026-09-01', 'done'), task('Bassel', '2026-09-01', 'cancelled'), task('Bassel', '2026-09-27')] });
    expect(l).toBeNull();
  });
  it('٢) ثمّ الفواتير المتأخّرة في نطاقه — والمسدّدة والملغاة مستبعدة', () => {
    const l = pickWorkLine({ ...base, invoices: [inv('2026-09-26'), inv('2026-09-01', 'partial'), inv('2026-09-01', 'paid'), inv('2026-09-01', 'cancelled'), inv('2026-09-30')] });
    expect(l).toEqual({ kind: 'invoices_overdue', count: 2, href: '/dashboard/invoices?preset=overdue' });
  });
  it('٣) ثمّ المستحقّة خلال سبعة أيّام (اليوم حتى اليوم السابع)', () => {
    const l = pickWorkLine({ ...base, invoices: [inv('2026-09-27'), inv('2026-10-04'), inv('2026-10-05'), inv('2026-10-01', 'paid')] });
    expect(l).toEqual({ kind: 'invoices_due_soon', count: 2, href: '/dashboard/invoices?preset=duesoon' });
  });
  it('فشل الجلب أو غياب الصلاحية ليس «لا شيء»: يُتخطّى المصدر ولا تُدّعى معلومة', () => {
    const failedTasks = { ...base, tasksState: 'failed' as const, tasks: [task('Bassel', '2026-09-01')], invoices: [inv('2026-09-30')] };
    expect(pickWorkLine(failedTasks)?.kind).toBe('invoices_due_soon');
    expect(pickWorkLine({ ...base, tasksState: 'failed', invoicesState: 'failed' })).toBeNull();
    expect(pickWorkLine({ ...base, invoicesState: 'forbidden', invoices: [inv('2026-09-01')] })).toBeNull();
  });
});

describe('صياغة المفرد والمثنّى والجمع', () => {
  const t = (count: number) => workLineText({ kind: 'tasks_overdue', count, href: '' });
  const o = (count: number) => workLineText({ kind: 'invoices_overdue', count, href: '' });
  const d = (count: number) => workLineText({ kind: 'invoices_due_soon', count, href: '' });
  it('المهامّ', () => {
    expect(t(1)).toBe('لديك مهمّة متأخّرة واحدة تحتاج المتابعة.');
    expect(t(2)).toBe('لديك مهمّتان متأخّرتان تحتاجان المتابعة.');
    expect(t(3)).toBe('لديك ٣ مهامّ متأخّرة تحتاج المتابعة.');
    expect(t(11)).toBe('لديك ١١ مهمّةً متأخّرة تحتاج المتابعة.');
    expect(t(103)).toBe('لديك ١٠٣ مهامّ متأخّرة تحتاج المتابعة.');
  });
  it('الفواتير', () => {
    expect(o(1)).toBe('في نطاق متابعتك فاتورة متأخّرة واحدة عن موعد السداد.');
    expect(o(2)).toBe('في نطاق متابعتك فاتورتان متأخّرتان عن موعد السداد.');
    expect(d(3)).toBe('في نطاق متابعتك ٣ فواتير تستحقّ خلال الأيام السبعة القادمة.');
    expect(d(2)).toBe('في نطاق متابعتك فاتورتان تستحقّان خلال الأيام السبعة القادمة.');
    expect(d(25)).toBe('في نطاق متابعتك ٢٥ فاتورةً تستحقّ خلال الأيام السبعة القادمة.');
  });
});
