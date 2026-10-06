import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

/*
 * نافذة «تسجيل دفعة» كاملةً بحالة المالك: الإشعار الدائن يظهر رصيداً، يُختار فيُخصم من
 * التحويل، والحفظ نداءٌ واحدٌ ذرّيّ إلى `/api/payments/batch` — لا نداءٌ لكلّ فاتورة.
 */
const get = vi.fn(), post = vi.fn(), del = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), delete: (...a: unknown[]) => del(...a) } }));
vi.mock('@/lib/auth', () => ({ getUser: () => ({ id: 'u-1', role: 'admin' }) }));
vi.mock('@/lib/useInitialQuery', () => ({ useInitialQuery: () => undefined }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'ar', t: (k: string) => k }) }));

import PaymentsPage from '@/app/dashboard/payments/page';

const SUP = { id: 'sup-1', name: 'UNIMARS LAS PALMAS' };
const inv = (id: string, total: number, paid = 0) => ({
  id, invoice_number: id, total_amount: String(total), paid_amount: String(paid), currency: 'EUR', status: paid ? 'partial' : 'unpaid',
  supplier: SUP, vessel: { name: 'Gubal Trader' },
});
const INVOICES = [inv('ALG/26-00448', -401.67), inv('ALG/26-01292', 3526.07), inv('ALG/26-01293', 400), inv('ALG/26-01294', 268.33), inv('ALG/26-01295', 200)];
const ALLOC = {
  id: 'al-1', amount: '401.67', currency: 'EUR', allocation_date: '2026-10-06', reference: 'TRF-1', created_by: 'x',
  credit_note: { id: 'cn', invoice_number: 'ALG/26-00448', supplier: SUP }, invoice: { id: 'a', invoice_number: 'ALG/26-01292' },
};

beforeEach(() => {
  get.mockReset(); post.mockReset(); del.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/api/payments') return Promise.resolve({ data: [] });
    if (url === '/api/invoices') return Promise.resolve({ data: INVOICES });
    if (url === '/api/suppliers') return Promise.resolve({ data: [SUP] });
    if (url === '/api/payments/allocations') return Promise.resolve({ data: [ALLOC] });
    return Promise.resolve({ data: [] });
  });
  post.mockResolvedValue({ data: { transfer: { EUR: 3992.73 } } });
  del.mockResolvedValue({ data: { deleted: true } });
});

async function openForSupplier() {
  render(<PaymentsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /pay.add/ }));
  const dialog = screen.getByRole('heading', { name: 'تسجيل دفعة' }).closest('div.bg-white') as HTMLElement;
  await waitFor(() => expect(within(dialog).getByRole('option', { name: SUP.name })).toBeTruthy());
  fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: SUP.id } });
  await within(dialog).findByText('ALG/26-00448');
  return dialog;
}

describe('نافذة الدفع مع الإشعار الدائن', () => {
  it('الإشعار يظهر رصيداً لك، وتحديد الكلّ يخصمه من أكبر فاتورة فيصير التحويل 3,992.73', async () => {
    const dialog = await openForSupplier();
    expect(within(dialog).getByText('إشعار دائن')).toBeTruthy();
    expect(within(dialog).getByText(/اختره ليُخصم من التحويل/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText('تحديد الكل'));
    expect((within(dialog).getByLabelText('من الإشعار الدائن ALG/26-01292') as HTMLInputElement).value).toBe('401.67');
    expect((within(dialog).getByLabelText('المبلغ النقدي ALG/26-01292') as HTMLInputElement).value).toBe('3124.4');
    expect(within(dialog).getByText(/صافي التحويل/)).toBeTruthy();
    const save = within(dialog).getByRole('button', { name: /حفظ 4 فاتورة — تحويل/ });
    expect(save.textContent).toMatch(/3,992\.73/);
  });

  it('الحفظ نداءٌ واحدٌ إلى batch بالسطور النقديّة والتطبيق — والإشعار ليس سطراً نقديّاً', async () => {
    const dialog = await openForSupplier();
    fireEvent.click(within(dialog).getByText('تحديد الكل'));
    fireEvent.change(dialog.querySelector('input[type="date"]')!, { target: { value: '2026-10-06' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ 4 فاتورة/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/payments/batch');
    expect(body.supplier_id).toBe('sup-1');
    expect(body.lines).toHaveLength(4);
    expect(body.lines.map((l: any) => l.invoice_id)).not.toContain('ALG/26-00448');
    expect(body.credits).toEqual([{ credit_note_id: 'ALG/26-00448', invoice_id: 'ALG/26-01292', amount: 401.67 }]);
  });

  it('تعديل «من الإشعار» يعيد ضبط النقديّ، والتجاوز يُرفض قبل أيّ نداء', async () => {
    const dialog = await openForSupplier();
    fireEvent.click(within(dialog).getByText('تحديد الكل'));
    fireEvent.change(within(dialog).getByLabelText('من الإشعار الدائن ALG/26-01292'), { target: { value: '100' } });
    expect((within(dialog).getByLabelText('المبلغ النقدي ALG/26-01292') as HTMLInputElement).value).toBe('3426.07');
    fireEvent.change(within(dialog).getByLabelText('من الإشعار الدائن ALG/26-01293'), { target: { value: '400' } });
    fireEvent.change(dialog.querySelector('input[type="date"]')!, { target: { value: '2026-10-06' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ 4 فاتورة/ }));
    expect(await within(dialog).findByText(/أكبر من رصيد الإشعارات المختارة \(401\.67\)/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('قائمة التطبيقات تظهر، وإلغاء التطبيق يحذفه بعد التأكيد', async () => {
    render(<PaymentsPage />);
    expect(await screen.findByText(/الإشعارات الدائنة المطبَّقة على الفواتير/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء التطبيق' }));
    const confirm = screen.getByRole('heading', { name: 'إلغاء تطبيق الإشعار الدائن؟' }).parentElement as HTMLElement;
    fireEvent.click(within(confirm).getByRole('button', { name: 'إلغاء التطبيق' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/payments/allocations/al-1'));
  });
});
