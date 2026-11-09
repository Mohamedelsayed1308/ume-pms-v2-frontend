import { describe, it, expect } from 'vitest';
import { canonItemName, canonInvoiceItems } from '@/app/dashboard/reports/VesselProfitReport';

/*
 * زيوت بوسيدون ظهرت سطرين في التقرير الماليّ (طلب المالك ٩ نوفمبر ٢٠٢٦): «زيوت» من قيود
 * QuickBooks حتّى يوليو، و«Lubricants» من فواتير النظام بعدها. فيُوحَّد اسم بند الفاتورة.
 */
describe('توحيد اسم بند الزيوت', () => {
  it('أسماء الزيوت الإنجليزيّة تصير «زيوت» بلا حساسيّة للأحرف والمسافات', () => {
    for (const n of ['Lubricants', 'LUBRICANTS', ' lubricant ', 'Lube Oil', 'LUB OIL']) expect(canonItemName(n)).toBe('زيوت');
  });

  it('ما سواها يبقى كما هو', () => {
    expect(canonItemName('Bunker')).toBe('Bunker');
    expect(canonItemName('زيوت')).toBe('زيوت');
    expect(canonItemName('Spare Parts')).toBe('Spare Parts');
    expect(canonItemName(undefined)).toBeUndefined();
  });

  it('بند الفاتورة وبنود سطورها معاً، والمبالغ لا تُمسّ', () => {
    const inv = canonInvoiceItems({
      id: 1, total_amount: 48301.74, item: { name: 'Lubricants' },
      line_items: [{ item_name: 'Lubricants', amount: 40000 }, { item_name: 'Bunker MGO', amount: 8301.74 }],
    });
    expect(inv.item?.name).toBe('زيوت');
    expect(inv.line_items).toEqual([{ item_name: 'زيوت', amount: 40000 }, { item_name: 'Bunker MGO', amount: 8301.74 }]);
    expect(inv.total_amount).toBe(48301.74);
    expect(canonInvoiceItems({ item: null, line_items: null })).toEqual({ item: null, line_items: null });
  });
});
