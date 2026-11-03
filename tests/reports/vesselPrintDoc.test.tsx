import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VesselPrintDoc, VP_PRINT_CSS, POSEIDON, ALCUDIA } from '@/app/dashboard/reports/VesselProfitReport';
import { costSegments, type ExecData } from '@/app/dashboard/reports/VesselExecReport';

/*
 * ورقة كارت المركب (طلب المالك ٣ نوفمبر ٢٠٢٦ «تقليل الفراغات»): شهرٌ لبوسيدون كان يُطبع خمس
 * ورقاتٍ لأنّ كلّ جدولٍ صفٌّ بعرض الورقة ولا يُشطر. والطول يُقاس بطباعة المستند PDF؛ وهنا تُحرس
 * البنية التي يقوم عليها، وأنّ شيئاً من محتوى الورقة القديمة لم يسقط.
 */
const side = (exp: Record<string, number>) => ({ truckC: 10, truck: 10000, vehC: 2, veh: 600, passC: 50, pass: 2000, houryaC: 0, discharge: 300, exp });
const data = {
  E: side({ portEgy: 1200, broker: 300 }), I: side({ fw: 100 }), revE: 12900, revI: 12900, expE: 1500, expI: 100,
  revenue: 26000, expenses: 16000, net: 10000, count: 2, manualRev: [{ key: 'cafeteria', label: 'مبيعات الكافتيريا', amount: 200 }],
  opening: 500, supplies: 3000, closing: 700, bunkerCost: 2800, salaries: 4000, liqIttihad: 900, liqBassam: 400, P: 1300,
};
const items = [
  { id: 1, number: 'INV-1', date: '2026-10-02', supplier: 'SKV', item: 'صيانة', amount: 1000, currency: 'USD', nMonths: 1, seq: 1, missing: false, usedDefault: false, installment: 1000 },
  { id: 2, number: 'CN-2', date: '2026-10-05', supplier: 'Bay Port', item: 'تموينات', amount: -200, currency: 'USD', nMonths: 1, seq: 1, missing: false, usedDefault: false, installment: -200 },
];
const purchases = { items, total: 800, byItem: [{ name: 'صيانة', value: 1000 }, { name: 'تموينات', value: -200 }] };
const exec = { perVoyage: [], revenue: 26000, opExpenses: 16000, opNet: 10000, purchasesTotal: 800, bunkerCost: 2800, salaries: 4000, agentExp: 1600, bookGap: 0, count: 2,
  costLines: [{ key: 'fuel', label: 'الوقود', value: 2800 }, { key: 'salaries', label: 'مرتبات', value: 4000 }, { key: 'purchases', label: 'المشتريات', value: 800 }],
  defaultBuckets: { fuel: 'fuel', salaries: 'fixed', purchases: 'purchases' } } as ExecData;
const segs = costSegments(exec);

function doc(cfg = POSEIDON, p: typeof purchases | null = purchases) {
  const { container } = render(<VesselPrintDoc cfg={cfg} periodLabel="أكتوبر 2026" count={2} data={data} purchases={p}
    costSegs={segs} costSegsTotal={segs.reduce((s, x) => s + x.value, 0)} labelOf={{ portEgy: 'Port Authorities fees — EGY' }} />);
  return container.querySelector('#vp-doc') as HTMLElement;
}
const heads = (d: HTMLElement) => Array.from(d.querySelectorAll('h3')).map((h) => h.textContent);

describe('ورقة كارت المركب المطبوعة', () => {
  it('كلّ أقسام الورقة القديمة باقية', () => {
    expect(heads(doc())).toEqual([
      'الإيرادات', 'أعداد المنقولات خلال الشهر ومتوسطها لكل رحلة',
      'مصروفات الصادر (وكيل بدوي)', 'مصروفات الوارد (وكيل البسّام)', 'البنكر (مخزون)', 'مصروفات أخرى', 'السيولة عند الوكلاء',
      'المشتريات (فواتير المركب) — بالدولار', 'الصافي بعد المشتريات', 'هيكل التكاليف', 'فواتير المشتريات',
    ]);
  });

  it('الصفوف شبكةٌ من عمودين وثلاثة، والفواتير وحدها بعرض الورقة', () => {
    const d = doc();
    expect(d.querySelectorAll(':scope > .g2')).toHaveLength(1);
    expect(d.querySelectorAll(':scope > .g3')).toHaveLength(2);
    expect(d.querySelector(':scope > .inv table thead')).not.toBeNull();
    expect(VP_PRINT_CSS).toMatch(/\.g3\s*\{\s*grid-template-columns:\s*1fr 1fr 1fr/);
  });

  it('لا قاعدة تمنع كلّ جدولٍ من الانشطار', () => {
    expect(VP_PRINT_CSS).not.toMatch(/#vp-doc table,\s*#vp-doc \.cols\s*\{\s*page-break-inside:\s*avoid/);
    expect(VP_PRINT_CSS).toMatch(/\.inv tr\s*\{\s*break-inside:avoid/);
  });

  it('الأرقام في أماكنها: البنكر والصافي النهائي والإشعار الدائن', () => {
    const t = doc().textContent || '';
    expect(t).toContain('= المستهلك2,800.00');
    expect(t).toContain('صافي نهائي بعد المشتريات9,200.00');
    expect(t).toContain('CN-2 (إشعار دائن)');
  });

  it('مركبٌ يُخفي السيولة وبلا مشتريات: الصفّ الأخير الحلقة وحدها ولا جدول فواتير', () => {
    const d = doc(ALCUDIA, null);
    expect(heads(d)).not.toContain('السيولة عند الوكلاء');
    expect(d.querySelector('.inv')).toBeNull();
    const last = d.querySelectorAll(':scope > .g3')[1];
    expect(Array.from(last.children).map((c) => c.className)).toEqual(['cstr']);
  });
});
