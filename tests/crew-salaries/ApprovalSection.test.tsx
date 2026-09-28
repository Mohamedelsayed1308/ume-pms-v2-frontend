import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import { ApprovalSection, ExportSection } from '@/app/dashboard/fleet-crew-salaries/sectionsReview';
import { ToastProvider } from '@/components/ui';
import { view } from './fixture';

const act = vi.fn(async () => true);
const ask = vi.fn(async () => 'سببٌ كافٍ');
const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);
const withVersion = { versions: [{ id: 'v1', version_no: 1, status: 'submitted', totals: { EUR: { balance: '10.00', payable: 0, count: 1, payable_balance: '0.00' } }, entries: 1, excluded: 1, currencies: ['EUR'] }] };

describe('قسم الاعتماد', () => {
  it('بلا معتمدٍ معيَّن: تنبيهٌ صريح، وزرّ الاعتماد معطّل', () => {
    wrap(<ApprovalSection v={view(withVersion)} act={act} ask={ask} />);
    expect(screen.getByText(/الاعتماد مرفوضٌ حتّى تأكيد الحساب/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('غير المعتمد (ولو أدمن) لا يعتمد', () => {
    wrap(<ApprovalSection v={view({ ...withVersion, permissions: { approver_configured: true, can_approve: false, can_edit_fx: false } })} act={act} ask={ask} />);
    expect(screen.getByText('الاعتماد لصاحب الصلاحية المعيَّن وحده.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('المعتمد المعيَّن: الزرّ متاح', () => {
    wrap(<ApprovalSection v={view({ ...withVersion, permissions: { approver_configured: true, can_approve: true, can_edit_fx: false } })} act={act} ask={ask} />);
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('التقديم الجزئيّ: الجاهزة مختارة، وغير الجاهزة ظاهرةٌ بأسبابها من رموزها', () => {
    wrap(<ApprovalSection v={view()} act={act} ask={ask} />);
    expect(screen.getByRole('button', { name: 'تقديم 1 للاعتماد' })).toBeTruthy();
    expect(screen.getByText(/غير جاهزة \(1\)/)).toBeTruthy();
    expect(screen.getByText(/بندٌ ينتظر المراجعة: لاشينج · فروقٌ أو تعارضاتٌ لم تُراجَع · لا حساب صرف/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('button', { name: 'تقديم 0 للاعتماد' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('سعر الشركة: بلا صلاحية التقارير لا حقل إدخال', () => {
    const fxView = view({ entries: [{ ...view().entries[1], result: { ...view().entries[1].result, items: [{ ...view().entries[1].result.items[0], original_currency: 'EUR', currency: 'USD' }] } }] });
    const { unmount } = wrap(<ApprovalSection v={fxView} act={act} ask={ask} />);
    expect(screen.queryByLabelText('1 EUR =')).toBeNull();
    expect(screen.getByText(/لمن يملك صلاحية شاشة التقارير/)).toBeTruthy();
    unmount();
    wrap(<ApprovalSection v={{ ...fxView, permissions: { ...fxView.permissions, can_edit_fx: true } }} act={act} ask={ask} />);
    expect(screen.getByLabelText('1 EUR =')).toBeTruthy();
  });
});

describe('قسم التصدير', () => {
  it('بلا إصدارٍ معتمد لا كشف صرف، ويُذكر أنّ التصدير ليس سداداً', () => {
    wrap(<ExportSection v={view()} act={act} ask={ask} />);
    expect(screen.getByText(/كشف الصرف غير متاح/)).toBeTruthy();
    expect(screen.getByText(/التصدير لا يعني السداد/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'EUR' })).toBeNull();
  });
  it('عملات كلّ إصدارٍ من الإصدار نفسه — والقديم معلَّمٌ تاريخيّاً', () => {
    wrap(<ExportSection v={view({ versions: [
      { id: 'v2', version_no: 2, status: 'approved', totals: {}, currencies: ['USD'], decided_by_name: 'O' },
      { id: 'v1', version_no: 1, status: 'superseded', totals: {}, currencies: ['EUR'], decided_by_name: 'O' },
    ] })} act={act} ask={ask} />);
    expect(screen.getAllByRole('button', { name: 'USD' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'EUR' })).toHaveLength(1);
    expect(screen.getByText(/تاريخيّ/)).toBeTruthy();
  });
});
