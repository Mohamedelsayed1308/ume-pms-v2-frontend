import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/*
 * شاشة الدورة ببياناتٍ اصطناعيّة: الأقسام الستّة، والإجماليّات لكلّ عملة، والقرار لا يُرسل
 * بلا سبب، وفشل الخادم لا يُعلَن نجاحاً، والإنجليزيّة كاملة.
 */
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: vi.fn() } }));
import CycleView from '@/app/dashboard/fleet-crew-salaries/CycleView';
import { ToastProvider } from '@/components/ui';
import { I18nProvider } from '@/lib/i18n';
import { view } from './fixture';

const renderView = () => render(<ToastProvider><CycleView id="c1" onBack={() => {}} /></ToastProvider>);
const title = 'مرتّبات Test Vessel — 2026-08';

beforeEach(() => { get.mockReset(); post.mockReset(); get.mockResolvedValue({ data: view() }); });

describe('شاشة الدورة', () => {
  it('الإجماليّات بطاقةٌ لكلّ عملة — ولا مجموع يخلط اليورو بالدولار', async () => {
    renderView();
    await screen.findByText(title);
    expect(screen.getByText('1,210.53')).toBeTruthy();
    expect(screen.getByText('1,000.00')).toBeTruthy();
    expect(screen.queryByText('2,210.53')).toBeNull();
    expect(screen.getByText('1 قضيّة مصدرٍ معلّقة')).toBeTruthy();
  });

  it('الأقسام الستّة تُفتح كلّها', async () => {
    renderView();
    await screen.findByText(title);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['الملفّات والمراحل', 'البيانات والتسويات1', 'الحساب والمطابقة والفروق', 'الحسابات والتفويضات', 'المراجعة والاعتماد', 'التصدير والسجلّ']);
    expect(screen.getByText(/صورة — إدخالٌ يدويّ/)).toBeTruthy();
    fireEvent.click(tabs[1]);
    expect(screen.getByText('قضايا المصدر')).toBeTruthy();
    fireEvent.click(tabs[2]);
    expect(screen.getByText('-14.13')).toBeTruthy();
    fireEvent.click(tabs[3]);
    expect(screen.getAllByText('لا حساب').length).toBe(2);
    fireEvent.click(tabs[4]);
    expect(screen.getByText(/الاعتماد مرفوضٌ حتّى تأكيد الحساب/)).toBeTruthy();
    fireEvent.click(tabs[5]);
    expect(screen.getByText(/كشف الصرف غير متاح/)).toBeTruthy();
  });

  it('القبول الجماعيّ لا يشمل المستنتَج ولا المكرّر المحتمل', async () => {
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(screen.getByRole('button', { name: 'قبول 1 معلّقاً' })).toBeTruthy();
  });

  it('مستحقٌّ تكميليّ من الملاحظة: لا يُرسل بلا رقم بحّارٍ مؤكَّد', async () => {
    post.mockResolvedValue({ data: {} });
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    const add = screen.getByRole('button', { name: 'إضافة' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('الاسم'), { target: { value: 'Master, Test' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/رقم البحّار/), { target: { value: '990001' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'سجلّ الطاقم + كشف التوزيع' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/crew-salaries/cycles/c1/decisions', expect.objectContaining({
      kind: 'supplementary', target_key: 'email:note:p9', supplementary: { crew_id: '990001', name: 'Master, Test', currency: 'EUR', amount: '47.73', kind: 'lashing' },
    })));
  });

  it('إقرار الفرق يطلب سبباً، ولا يُرسل عند الإلغاء', async () => {
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'إقرار بسبب' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByRole('button', { name: 'تأكيد' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('التقديم يرسل الحالات المختارة وحدها', async () => {
    post.mockResolvedValue({ data: {} });
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[4]);
    fireEvent.click(screen.getByRole('button', { name: 'تقديم 1 للاعتماد' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'الجاهز أوّلاً' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/crew-salaries/cycles/c1/submit', { reason: 'الجاهز أوّلاً', keys: ['9201:USD'] }));
  });

  it('رفض الخادم يُعرض بنصّه — لا رسالة نجاح', async () => {
    post.mockRejectedValue({ response: { status: 403, data: { message: 'الاعتماد لصاحب الصلاحية المعيَّن وحده' } } });
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    fireEvent.click(screen.getByText('9102'));
    fireEvent.click(screen.getAllByRole('button', { name: 'قبول' })[0]);
    expect(await screen.findByText('الاعتماد لصاحب الصلاحية المعيَّن وحده')).toBeTruthy();
    expect(screen.queryByText('قُبل البند')).toBeNull();
  });

  it('صفّ البحّار يُفتح من لوحة المفاتيح (Enter)', async () => {
    renderView();
    await screen.findByText(title);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    const row = screen.getByText('9102').closest('tr')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('button', { name: 'قبول' }).length).toBeGreaterThan(0);
  });

  it('فشل التحميل: رسالةٌ وإعادة محاولة', async () => {
    get.mockRejectedValueOnce({ response: { status: 500 } });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'إعادة المحاولة' }));
    await screen.findByText(title);
  });

  it('بالإنجليزيّة: العناوين والتبويبات والموانع بلا عربيّة ثابتة', async () => {
    localStorage.setItem('locale', 'en');
    render(<I18nProvider><ToastProvider><CycleView id="c1" onBack={() => {}} /></ToastProvider></I18nProvider>);
    await screen.findByText('Test Vessel salaries — 2026-08');
    expect(document.documentElement.dir).toBe('ltr');
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs[0]).toBe('Files and stages');
    fireEvent.click(screen.getAllByRole('tab')[4]);
    expect(screen.getByText(/Item awaiting review: Lashing · Differences or conflicts not reviewed · No payment account/)).toBeTruthy();
    await rtlAct(async () => { fireEvent.click(screen.getAllByRole('tab')[5]); });
    expect(screen.getByText(/Exporting does not mean paying/)).toBeTruthy();
  });

  it('بالإنجليزيّة: زرّ إعادة المحاولة مترجَم أيضاً', async () => {
    localStorage.setItem('locale', 'en');
    get.mockRejectedValueOnce({ response: { status: 500 } });
    render(<I18nProvider><ToastProvider><CycleView id="c1" onBack={() => {}} /></ToastProvider></I18nProvider>);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('Could not load the data')).toBeTruthy();
  });
});
