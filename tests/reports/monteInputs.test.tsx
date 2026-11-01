import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';

const post = vi.fn();
vi.mock('@/lib/api', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));

import MonteTeamInputs from '@/app/dashboard/reports/MonteTeamInputs';
import { inputStatuses, describeInput, type MonteInput } from '@/lib/reports/monteInputs';
import type { MontePackage } from '@/lib/reports/montePackage';

const by = { id: 'u1', name: 'أحمد' };
const I = (id: string, kind: MonteInput['kind'], data: Record<string, unknown>, at: string): MonteInput => ({ id, kind, data, by, at });
const INPUTS = [
  I('s1', 'salary', { month: '2026-10', usd: 90000, eur: null, note: 'CFM' }, '2026-11-01T08:00:00Z'),
  I('s2', 'salary', { month: '2026-10', usd: 91000, eur: null, note: 'CFM مصحَّح' }, '2026-11-01T09:00:00Z'),
  I('c1', 'ship_cost', { month: '2026-10', label: 'زيوت', amount: 1000, currency: 'USD', note: 'فاتورة 1' }, '2026-11-01T08:10:00Z'),
  I('c2', 'ship_cost', { month: '2026-10', label: 'خطأ', amount: 5, currency: 'USD', note: 'x' }, '2026-11-01T08:20:00Z'),
  I('v1', 'void', { target: 'c2', reason: 'أُدخل خطأً' }, '2026-11-01T08:30:00Z'),
  I('f1', 'fuel_invoice', { date: '2026-10-28', amount: 5, currency: 'SAR', invoice: 'T-2' }, '2026-11-01T08:40:00Z'),
];
const PKG = {
  monthly: [{ month: '2026-09', fixed_items: [] }, { month: '2026-10', fixed_items: [{ key: 'x', label: 'تجهيز وصيانة — سمارت فليت', usd: -1 }] }],
  inputs_applied: ['s1', 'c1', 'c2', 'v1', 'f1'],
  inputs_rejected: [{ id: 'f1', reason: 'تموينٌ بتاريخٍ ليس في الكارت' }],
} as unknown as MontePackage;

beforeEach(() => post.mockReset());

describe('حالة مدخلات الفريق', () => {
  it('أُدرج · ينتظر · حلّ محلّه أحدث · مُلغى · لم يُطبَّق', () => {
    const s = inputStatuses(INPUTS, PKG);
    expect(s.get('s1')).toEqual({ state: 'superseded' });
    expect(s.get('s2')).toEqual({ state: 'waiting' });
    expect(s.get('c1')).toEqual({ state: 'applied' });
    expect(s.get('c2')).toEqual({ state: 'voided', reason: 'أُدخل خطأً', by: 'أحمد' });
    expect(s.get('f1')).toEqual({ state: 'rejected', reason: 'تموينٌ بتاريخٍ ليس في الكارت' });
    expect(s.has('v1')).toBe(false);
  });

  it('بلا حزمةٍ تحملها كلّها ينتظر', () => {
    expect(inputStatuses(INPUTS.slice(2, 3), null).get('c1')).toEqual({ state: 'waiting' });
  });

  it('الوصف سطرٌ مقروء', () => {
    expect(describeInput(INPUTS[2])).toBe('2026-10 · زيوت · 1,000 USD');
    expect(describeInput(I('a', 'agent_return', { voyage: '07', tickets: 290, no_head: 9, cars: null }, ''))).toBe('رحلة 07 عودة · تذاكر 290 · بلا رأس 9');
  });
});

describe('شاشة مدخلات الفريق', () => {
  it('تُرسل المُدخَل بأرقامٍ لا نصوص، وتعرض رسائل الرفض من الخادم', async () => {
    const changed = vi.fn();
    render(<MonteTeamInputs inputs={INPUTS} pkg={PKG} en={false} onChanged={changed} />);
    expect(screen.getByText(/5 مُدخَلاً · 1 ينتظر التحديث التالي/)).toBeTruthy();
    fireEvent.click(screen.getByText('＋ مُدخَلٌ جديد'));
    fireEvent.change(screen.getByLabelText('البند'), { target: { value: 'زيوت' } });
    fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '1,250.5' } });
    fireEvent.change(screen.getByLabelText('العملة'), { target: { value: 'SAR' } });
    fireEvent.change(screen.getByLabelText('المستند / الملاحظة'), { target: { value: 'فاتورة 7' } });
    post.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByText('حفظ المُدخَل'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/api/vessel-profit-inputs/monte', {
      kind: 'ship_cost', data: { month: '2026-10', label: 'زيوت', amount: 1250.5, currency: 'SAR', note: 'فاتورة 7' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'المرتّبات' }));
    post.mockRejectedValueOnce({ response: { data: { message: 'المُدخَل مرفوض', errors: ['المستند أو الملاحظة مطلوب'] } } });
    fireEvent.change(screen.getByLabelText('بالدولار'), { target: { value: '95000' } });
    fireEvent.click(screen.getByText('حفظ المُدخَل'));
    await screen.findByText(/المستند أو الملاحظة مطلوب/);
    expect(post.mock.calls[1][1]).toEqual({ kind: 'salary', data: { month: '2026-10', usd: 95000, eur: null, note: '' } });
  });

  it('الإلغاء بسبب، والمُلغى لا يُلغى ثانيةً', async () => {
    const changed = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('مكرَّر');
    render(<MonteTeamInputs inputs={INPUTS} pkg={PKG} en={false} onChanged={changed} />);
    // خمسة سطور (بلا سجلّ الإلغاء) والمُلغى منها بلا زرّ
    expect(screen.getAllByText('إلغاء')).toHaveLength(4);
    post.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getAllByText('إلغاء')[0]);
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatch(/\/api\/vessel-profit-inputs\/monte\/.+\/void$/);
    expect(post.mock.calls[0][1]).toEqual({ reason: 'مكرَّر' });
  });
});
