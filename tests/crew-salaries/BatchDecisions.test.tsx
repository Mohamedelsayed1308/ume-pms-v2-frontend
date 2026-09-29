import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/*
 * حالاتٌ خرجت ثمّ تغيّرت: «خرج» ليس «صُرف». المالك وحده يقرّر (استبدال · تسوية · إبقاء) بسببٍ موثَّق،
 * والتسوية بمبلغٍ صريح. وكلّ دفعةٍ تُنزَّل كما خرجت، وما خرج فيها ظاهرٌ صفّاً صفّاً.
 */
const post = vi.fn();
const get = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: vi.fn() } }));
import { ExportSection } from '@/app/dashboard/fleet-crew-salaries/sectionsReview';
import { ToastProvider } from '@/components/ui';
import type { BatchDecision, CycleViewData } from '@/lib/crewSalaries';
import { view } from './fixture';

const act = vi.fn(async (_l: string, fn: () => Promise<unknown>) => { await fn(); return true; });
const ask = vi.fn<(a: { label?: string }) => Promise<string | null>>(async () => 'البنك أكّد أنّ الملفّ لم يُرفع');
const wrap = (v: CycleViewData) => render(<ToastProvider><ExportSection v={v} act={act} ask={ask} /></ToastProvider>);

const pending: BatchDecision = {
  state: 'pending', entry_key: '9101:EUR', entry_hash: 'a'.repeat(64), crew_id: '9101', name: 'Alpha Test', currency: 'EUR', version_id: 'v2', version_no: 2,
  balance: '1750.00', row_id: 'row-1', prior: [{ batch_no: 'CS-TV-202608-V1-EUR', amount: '1650.00', currency: 'EUR', row_kind: 'full', version_no: 1 }],
  amount_changed: true, bank_changed: false, resolution: null,
};
const owner = { approver_configured: true, can_approve: true, can_edit_fx: false };

beforeEach(() => { post.mockReset(); get.mockReset(); act.mockClear(); ask.mockClear(); post.mockResolvedValue({ data: {} }); });

describe('قرار المالك في دفعةٍ خرجت', () => {
  it('غير المعتمد يرى الحالة المعلّقة ولا يقرّر', () => {
    wrap(view({ batch_decisions: [pending] }));
    expect(screen.getByText('حالاتٌ خرجت ثمّ تغيّرت')).toBeTruthy();
    expect(screen.getByText('تنتظر قرار المالك')).toBeTruthy();
    expect(screen.getByText('القرار للمعتمد المعيَّن وحده.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'القرار' })).toBeNull();
    expect(screen.getByText('المبلغ')).toBeTruthy(); // ما تغيّر: المبلغ لا الحساب
  });

  it('استبدال: يُرسل بسببه ولا مبلغ معه', async () => {
    wrap(view({ permissions: owner, batch_decisions: [pending] }));
    const save = screen.getByRole('button', { name: 'تسجيل القرار' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'القرار' }), { target: { value: 'replace' } });
    fireEvent.click(save);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(ask.mock.calls[0][0]).toMatchObject({ label: 'ما يثبت أنّ الدفعة السابقة لم تُنفَّذ' });
    expect(post).toHaveBeenCalledWith('/api/crew-salaries/cycles/c1/decisions', { kind: 'batch_resolution', row_id: 'row-1', entry_key: '9101:EUR', expected_hash: 'a'.repeat(64), expected_version_id: 'v2', action: 'replace', amount: undefined, reason: 'البنك أكّد أنّ الملفّ لم يُرفع' });
  });

  it('تسوية: لا تُسجَّل بلا مبلغٍ موجب، وتُرسل بالمبلغ الصريح', async () => {
    wrap(view({ permissions: owner, batch_decisions: [pending] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'القرار' }), { target: { value: 'settle' } });
    const save = screen.getByRole('button', { name: 'تسجيل القرار' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'مبلغ التسوية' }), { target: { value: '100' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toMatchObject({ action: 'settle', amount: '100' });
  });

  it('قرارٌ من صفحةٍ قديمة: رسالة الخادم (409) تظهر، ولا «سُجِّل»', async () => {
    const actReal = vi.fn(async (_l: string, fn: () => Promise<unknown>) => { try { await fn(); return true; } catch { return false; } });
    post.mockRejectedValueOnce({ response: { status: 409, data: { message: 'تغيّرت الحالة منذ فتحتَ القرار' } } });
    render(<ToastProvider><ExportSection v={view({ permissions: owner, batch_decisions: [pending] })} act={actReal} ask={ask} /></ToastProvider>);
    fireEvent.change(screen.getByRole('combobox', { name: 'القرار' }), { target: { value: 'keep' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل القرار' }));
    await waitFor(() => expect(actReal).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toMatchObject({ expected_hash: 'a'.repeat(64), expected_version_id: 'v2' });
    expect(await actReal.mock.results[0].value).toBe(false);
  });

  it('إلغاء نافذة السبب لا يُرسل شيئاً', async () => {
    ask.mockResolvedValueOnce(null);
    wrap(view({ permissions: owner, batch_decisions: [pending] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'القرار' }), { target: { value: 'keep' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل القرار' }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });

  it('المقرَّر يظهر بقراره ومن اتّخذه وسببه', () => {
    wrap(view({ batch_decisions: [{ ...pending, state: 'kept', resolution: { action: 'keep', amount: null, reason: 'نُفِّذ بإيصال البنك', decided_by_name: 'Owner' } }] }));
    expect(screen.getByText('قُرِّر الإبقاء — لا يخرج شيء')).toBeTruthy();
    expect(screen.getByText(/Owner: نُفِّذ بإيصال البنك/)).toBeTruthy();
    expect(screen.getByText('المبلغ')).toBeTruthy(); // ما تغيّر يبقى ظاهراً بعد القرار
  });
});

describe('الدفعات كما خرجت', () => {
  const exported = view({
    versions: [{ id: 'v2', version_no: 2, status: 'approved', totals: {}, currencies: ['EUR'], decided_by_name: 'O' }],
    exports: [
      { id: 'x2', kind: 'approved_payments', batch_no: 'CS-TV-202608-V2-EUR', currency: 'EUR', row_count: 1, is_redownload: false, exported_by_name: 'Clerk', exported_at: '2026-09-28T10:00:00Z' },
      { id: 'x3', kind: 'approved_payments', batch_no: 'CS-TV-202608-V2-EUR', currency: 'EUR', row_count: 1, is_redownload: true, exported_by_name: 'Clerk', exported_at: '2026-09-28T11:00:00Z' },
    ],
    export_rows: [
      { id: 'r2', export_id: 'x2', batch_no: 'CS-TV-202608-V2-EUR', version_no: 2, entry_key: '9101:EUR', crew_id: '9101', currency: 'EUR', amount: '1750.00', balance: '1750.00', row_kind: 'full', status: 'active', resolution_id: 'd1', replaced_by: null, created_at: '' },
      { id: 'r1', export_id: 'x1', batch_no: 'CS-TV-202608-V1-EUR', version_no: 1, entry_key: '9101:EUR', crew_id: '9101', currency: 'EUR', amount: '1650.00', balance: '1650.00', row_kind: 'full', status: 'replaced', resolution_id: null, replaced_by: 'r2', created_at: '' },
    ],
  });

  it('زرّ تنزيلٍ للدفعة الأصليّة وحدها — لا لسجلّ إعادة التنزيل', () => {
    wrap(exported);
    expect(screen.getAllByRole('button', { name: /تنزيل الدفعة كما خرجت/ })).toHaveLength(1);
  });

  it('تنزيل الدفعة يطلب ملفّها المحفوظ', async () => {
    get.mockResolvedValue({ data: new Blob(['x']), headers: {} });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    wrap(exported);
    fireEvent.click(screen.getByRole('button', { name: /تنزيل الدفعة كما خرجت/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/crew-salaries/exports/x2/file', { responseType: 'blob' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
  });

  it('ما خرج فعلاً صفّاً صفّاً: الساري والمُستبدَل', () => {
    wrap(exported);
    expect(screen.getByText('ما خرج فعلاً في كلّ دفعة')).toBeTruthy();
    expect(screen.getByText('ساري')).toBeTruthy();
    expect(screen.getByText('مُستبدَل')).toBeTruthy();
  });
});
