import { describe, it, expect } from 'vitest';
import { type PayRow, autoAllocate, splitCredits, usedByNote, summarize, validate, batchPayload, availableOf } from '@/lib/payments/creditAllocation';

/*
 * حالة المالك ٦ أكتوبر ٢٠٢٦ — UNIMARS LAS PALMAS: إشعارٌ دائن 401.67- يورو وأربع فواتير
 * Gubal Trader مجموعها 4,394.40، فالتحويل الصافي 3,992.73.
 */
const row = (id: string, total: number, o: Partial<PayRow> = {}): PayRow => ({
  id, invoice_number: id, total_amount: total, paid_amount: 0, currency: 'EUR', checked: false, amount: '', credit: '', ...o,
});
const owner = () => [
  row('ALG/26-00448', -401.67),
  row('ALG/26-01292', 3526.07),
  row('ALG/26-01293', 400),
  row('ALG/26-01294', 268.33),
  row('ALG/26-01295', 200),
];
const checkAll = (rows: PayRow[]) => autoAllocate(rows.map((r) => ({ ...r, checked: true })));
const SHARED = { payment_date: '2026-10-06', payment_type: 'installment', payment_method: 'bank_transfer', reference: 'TRF-1', notes: '' };

describe('تطبيق الإشعار الدائن في نافذة الدفع', () => {
  it('حالة المالك: الإشعار على أكبر فاتورة، والتحويل 3,992.73 بالضبط', () => {
    const rows = checkAll(owner());
    const big = rows.find((r) => r.id === 'ALG/26-01292')!;
    expect(big).toMatchObject({ credit: '401.67', amount: '3124.4' });
    expect(rows.filter((r) => r.id !== 'ALG/26-01292' && r.total_amount > 0).every((r) => r.credit === '' && +r.amount === r.total_amount)).toBe(true);
    expect(summarize(rows)).toEqual({ transfer: { EUR: 3992.73 }, applied: { EUR: 401.67 }, invoices: 4 });
    expect(validate(rows)).toBeNull();
    expect(usedByNote(rows)).toEqual({ 'ALG/26-00448': 401.67 });
  });

  it('جسم الدفعة: الإشعار لا يُرسل سطراً نقديّاً، ويُرسل تطبيقاً واحداً', () => {
    const body = batchPayload('sup-1', checkAll(owner()), SHARED);
    expect(body.lines.map((l) => l.invoice_id)).not.toContain('ALG/26-00448');
    expect(body.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(3992.73, 2);
    expect(body.credits).toEqual([{ credit_note_id: 'ALG/26-00448', invoice_id: 'ALG/26-01292', amount: 401.67 }]);
    expect(body).toMatchObject({ supplier_id: 'sup-1', payment_date: '2026-10-06', reference: 'TRF-1', notes: null });
  });

  it('بلا اختيار الإشعار: لا خصم، والتحويل مجموع الفواتير', () => {
    const rows = autoAllocate(owner().map((r) => ({ ...r, checked: r.total_amount > 0 })));
    expect(summarize(rows)).toEqual({ transfer: { EUR: 4394.4 }, applied: {}, invoices: 4 });
    expect(batchPayload('s', rows, SHARED).credits).toEqual([]);
  });

  it('إشعارٌ أكبر من أكبر فاتورة يتوزّع على التالية — ولا يتجاوز متبقّي أيٍّ منها', () => {
    const rows = checkAll([row('CN', -500), row('A', 300), row('B', 250)]);
    expect(rows.find((r) => r.id === 'A')).toMatchObject({ credit: '300', amount: '0' });
    expect(rows.find((r) => r.id === 'B')).toMatchObject({ credit: '200', amount: '50' });
    expect(summarize(rows).transfer).toEqual({ EUR: 50 });
    expect(validate(rows)).toBeNull();
  });

  it('رصيد الإشعار يُحتسب بعد ما استُعمل منه سابقاً، والعملة لا تُخلط', () => {
    const cn = row('CN', -400, { paid_amount: -150 });
    expect(availableOf(cn)).toBe(250);
    const rows = checkAll([cn, row('E', 1000), row('U', 1000, { currency: 'USD' })]);
    expect(rows.find((r) => r.id === 'E')!.credit).toBe('250');
    expect(rows.find((r) => r.id === 'U')!.credit).toBe('');
    expect(summarize(rows).transfer).toEqual({ EUR: 750, USD: 1000 });
  });

  it('التعديل اليدويّ: إشعارٌ أكثر من رصيده يُرفض قبل الإرسال، ويُقسَّم على إشعارين بالترتيب', () => {
    const rows = checkAll([row('CN1', -100), row('CN2', -50), row('A', 1000)]);
    expect(rows.find((r) => r.id === 'A')!.credit).toBe('150');
    expect(splitCredits(rows)).toEqual([
      { credit_note_id: 'CN1', invoice_id: 'A', amount: 100 },
      { credit_note_id: 'CN2', invoice_id: 'A', amount: 50 },
    ]);
    const over = rows.map((r) => (r.id === 'A' ? { ...r, credit: '200', amount: '800' } : r));
    expect(validate(over)).toMatch(/أكبر من رصيد الإشعارات المختارة \(150\)/);
  });

  it('يُرفض قبل الإرسال: إشعارٌ وحده، مجموعٌ يتجاوز المتبقّي، فاتورةٌ بلا نقديّ ولا إشعار', () => {
    expect(validate(checkAll([row('CN', -100)]))).toMatch(/اختر فاتورةً واحدة على الأقلّ/);
    const base = checkAll(owner());
    expect(validate(base.map((r) => (r.id === 'ALG/26-01293' ? { ...r, amount: '401' } : r)))).toMatch(/ALG\/26-01293.*أكبر من المتبقّي \(400\)/);
    expect(validate(base.map((r) => (r.id === 'ALG/26-01293' ? { ...r, amount: '0' } : r)))).toMatch(/لا مبلغ نقديّ ولا إشعار/);
    expect(validate(base.map((r) => (r.id === 'ALG/26-01293' ? { ...r, amount: '-5' } : r)))).toMatch(/المبلغ غير صحيح/);
  });
});
