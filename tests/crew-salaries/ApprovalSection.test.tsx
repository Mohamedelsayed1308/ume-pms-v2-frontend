import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import { ApprovalSection, ExportSection } from '@/app/dashboard/fleet-crew-salaries/sections';
import { ToastProvider } from '@/components/ui';
import type { CycleViewData } from '@/lib/crewSalaries';
const V = (x: object) => x as unknown as CycleViewData;

const base = {
  cycle: { id: 'c1', vessel: 'V', month: '2026-08', status: 'submitted' },
  entries: [], blocking: [], versions: [{ id: 'v1', version_no: 1, status: 'submitted', totals: { EUR: { balance: '10.00', payable: 0, count: 1 } } }],
  fx: { labels: [], per_usd: {} }, totals: { EUR: {} }, exports: [], audit: [],
};
const act = vi.fn(async () => true);
const ask = vi.fn(async () => 'سبب');
const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('قسم الاعتماد', () => {
  it('بلا معتمدٍ معيَّن: تنبيهٌ صريح، وزرّ الاعتماد معطّل', () => {
    wrap(<ApprovalSection v={V({ ...base, permissions: { approver_configured: false, can_approve: false } })} act={act} ask={ask} />);
    expect(screen.getByText(/الاعتماد مرفوضٌ حتّى تأكيد الحساب/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('غير المعتمد (ولو أدمن) لا يعتمد', () => {
    wrap(<ApprovalSection v={V({ ...base, permissions: { approver_configured: true, can_approve: false } })} act={act} ask={ask} />);
    expect(screen.getByText('الاعتماد لصاحب الصلاحية المعيَّن وحده.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('المعتمد المعيَّن: الزرّ متاح', () => {
    wrap(<ApprovalSection v={V({ ...base, permissions: { approver_configured: true, can_approve: true } })} act={act} ask={ask} />);
    expect((screen.getByRole('button', { name: 'اعتماد' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('قسم التصدير', () => {
  it('بلا إصدارٍ معتمد لا كشف صرف، ويُذكر أنّ التصدير ليس سداداً', () => {
    wrap(<ExportSection v={V({ ...base, approved_version: null })} act={act} />);
    expect(screen.getByText(/كشف الصرف غير متاح/)).toBeTruthy();
    expect(screen.getByText(/التصدير لا يعني السداد/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'EUR' })).toBeNull();
  });
  it('بإصدارٍ معتمد: زرٌّ لكلّ عملة', () => {
    wrap(<ExportSection v={V({ ...base, approved_version: { version_no: 2 }, totals: { EUR: {}, USD: {} } })} act={act} />);
    expect(screen.getByRole('button', { name: 'EUR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'USD' })).toBeTruthy();
  });
});
