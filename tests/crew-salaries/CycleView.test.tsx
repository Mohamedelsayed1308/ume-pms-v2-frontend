import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/*
 * شاشة الدورة ببياناتٍ اصطناعيّة (لا بحّارة حقيقيّون): الأقسام الستّة، والإجماليّات
 * لكلّ عملة، وأنّ القرار لا يُرسل بلا سبب، وأنّ فشل الخادم لا يُعلَن نجاحاً.
 */
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: vi.fn() } }));
import CycleView from '@/app/dashboard/fleet-crew-salaries/CycleView';
import { ToastProvider } from '@/components/ui';

const item = (over: object) => ({ key: 'basic', kind: 'basic', direction: 'earning', amount: '1131.33', currency: 'EUR', original_amount: '1131.33', original_currency: 'EUR', fx_rate: null, source: 'calc', review: 'auto', counted: true, formula: 'الأساسيّ 1697.00 ÷ 30 × 20', ...over });
const entry = (over: object) => ({
  key: '9102:EUR', crew_id: '9102', name: 'Bravo Test', rank: 'M/M', nationality: 'X', currency: 'EUR', section: 'final',
  result: { currency: 'EUR', days: 20, day_rule: 'partial', service: { start: '2026-08-01', end: '2026-08-20' },
    items: [item({}), item({ key: 'sign_off_day', kind: 'sign_off_day', amount: '79.20', formula: '(الأساسيّ + الإضافيّ الثابت) ÷ 30' })],
    earnings: '1210.53', deductions: '0.00', balance: '1210.53', complete: false,
    issues: [{ code: 'item_pending_review', blocking: true, message: 'بندٌ ينتظر المراجعة: lashing', itemKey: 'email:t2:r1:lashing' }] },
  differences: [{ kind: 'sign_off_day', calculated: '79.20', reported: '93.33', diff: '-14.13' }],
  differences_acknowledged: false, diff_hash: 'a'.repeat(64), payable: false, blockers: ['فروقٌ عن CFM لم تُراجَع', 'لا حساب صرف'],
  provenance: [{ file: 'cfm.xlsx', sheet: 'Summary EUR', row: 17 }], date_checks: [], payout_match: null, bank_match: null,
  bank_candidates: [], accounts: [],
  extras: [{ key: 'email:t2:r1:lashing', kind: 'lashing', amount: '358', currency: 'EUR', reason: 'Bonus', source: 'email', review: 'pending' }],
  ...over,
});
const view = {
  cycle: { id: 'c1', vessel: 'Test Vessel', month: '2026-08', status: 'draft', current_version: 0, approved_version_id: null },
  permissions: { approver_configured: false, can_approve: false },
  blocking: [], warnings: [],
  fx: { month: '2026-08', per_usd: {}, labels: [] },
  files: [
    { id: 'f1', parent_id: null, position: null, name: 'salary.msg', kind: 'email', class: 'email', status: 'extracted', flags: [], meta: { subject: 'Salary of Aug. 2026', from: 'crew@x', sent_at: '2026-08-24T16:16:13Z', inference: { vessel: 'Test Vessel', month: '2026-08', evidence: ['الشهر من الموضوع'], conflicts: [] } }, size: 10 },
    { id: 'f2', parent_id: 'f1', position: 1, name: 'receipt.jpeg', kind: 'attachment', class: 'image', status: 'needs_manual', flags: ['image_manual_entry'], meta: {}, size: 5 },
  ],
  entries: [entry({}), entry({ key: '9201:USD', crew_id: '9201', name: 'Delta Test', currency: 'USD', differences: [], differences_acknowledged: true, extras: [], blockers: ['لا حساب صرف'],
    result: { currency: 'USD', days: 30, day_rule: 'full_month', service: { start: '2026-08-01', end: '2026-08-31' }, items: [item({ currency: 'USD', original_currency: 'USD', amount: '1000.00' })], earnings: '1000.00', deductions: '0.00', balance: '1000.00', complete: true, issues: [] } })],
  unmatched: { payout: [], bank_blocks: [], email_rows: [], notes: [{ text: 'Kindly deposit 47.73€ (Lashing Bonus) in bank account of Master', amount: '47.73', currency: 'EUR', paragraph: 9 }] },
  authorizations: [],
  totals: {
    EUR: { count: 1, matched: 0, different: 1, ready: 0, pending: 1, missing_account: 1, missing_docs: 0, earnings: '1210.53', deductions: '0.00', balance: '1210.53' },
    USD: { count: 1, matched: 1, different: 0, ready: 0, pending: 1, missing_account: 1, missing_docs: 0, earnings: '1000.00', deductions: '0.00', balance: '1000.00' },
  },
  approved_version: null, changed_since_approval: false, versions: [], exports: [], audit: [],
};

const renderView = () => render(<ToastProvider><CycleView id="c1" onBack={() => {}} /></ToastProvider>);

beforeEach(() => { get.mockReset(); post.mockReset(); get.mockResolvedValue({ data: view }); });

describe('شاشة الدورة', () => {
  it('الإجماليّات بطاقةٌ لكلّ عملة — ولا مجموع يخلط اليورو بالدولار', async () => {
    renderView();
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
    expect(screen.getByText('1,210.53')).toBeTruthy();
    expect(screen.getByText('1,000.00')).toBeTruthy();
    expect(screen.queryByText('2,210.53')).toBeNull();
  });

  it('الأقسام الستّة تُفتح كلّها', async () => {
    renderView();
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['الملفّات والمراحل', 'البيانات والتسويات', 'الحساب والمطابقة والفروق', 'الحسابات والتفويضات', 'المراجعة والاعتماد', 'التصدير والسجلّ']);
    expect(screen.getByText('صورة — إدخالٌ يدويّ')).toBeTruthy();
    fireEvent.click(tabs[1]);
    expect(screen.getByText(/لا تُنفَّذ تلقائيّاً/)).toBeTruthy();
    fireEvent.click(tabs[2]);
    expect(screen.getByText('-14.13')).toBeTruthy();
    fireEvent.click(tabs[3]);
    expect(screen.getAllByText('لا حساب').length).toBe(2);
    fireEvent.click(tabs[4]);
    expect(screen.getByText(/الاعتماد مرفوضٌ حتّى تأكيد الحساب/)).toBeTruthy();
    fireEvent.click(tabs[5]);
    expect(screen.getByText(/كشف الصرف غير متاح/)).toBeTruthy();
  });

  it('إقرار الفرق يطلب سبباً، ولا يُرسل عند الإلغاء', async () => {
    renderView();
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
    fireEvent.click(screen.getAllByRole('tab')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'إقرار بسبب' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'تأكيد' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('إقرار الفرق بسببٍ يرسل البصمة ثمّ يعيد التحميل', async () => {
    post.mockResolvedValue({ data: {} });
    renderView();
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
    fireEvent.click(screen.getAllByRole('tab')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'إقرار بسبب' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'القاعدة بلا بدل الإجازة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/crew-salaries/cycles/c1/decisions',
      { kind: 'difference_ack', target_key: '9102:EUR', hash: 'a'.repeat(64), reason: 'القاعدة بلا بدل الإجازة' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('رفض الخادم يُعرض بنصّه — لا رسالة نجاح', async () => {
    post.mockRejectedValue({ response: { status: 403, data: { message: 'الاعتماد لصاحب الصلاحية المعيَّن وحده' } } });
    renderView();
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
    fireEvent.click(screen.getAllByRole('tab')[1]);
    fireEvent.click(screen.getByText('9102'));
    fireEvent.click(screen.getByRole('button', { name: 'قبول' }));
    expect(await screen.findByText('الاعتماد لصاحب الصلاحية المعيَّن وحده')).toBeTruthy();
    expect(screen.queryByText('قُبل البند')).toBeNull();
  });

  it('فشل التحميل: رسالةٌ وإعادة محاولة', async () => {
    get.mockRejectedValueOnce({ response: { status: 500 } });
    renderView();
    const retry = await screen.findByRole('button', { name: 'إعادة المحاولة' });
    fireEvent.click(retry);
    await screen.findByText('مرتّبات Test Vessel — 2026-08');
  });
});
