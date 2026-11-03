import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GubalPrintDoc, PRINT_CSS } from '@/app/dashboard/reports/GubalProfitReport';

/*
 * ترتيب ورقة جوبال (طلب المالك ٣ نوفمبر ٢٠٢٦ «تقليل الفراغات»): نسخة يناير–أكتوبر كانت
 * أربع ورقات نصفها أبيض لأنّ كلّ مجموعةٍ لا تُشطر. ويُقاس الطول نفسه بطباعة المستند PDF؛
 * وهنا تُحرس البنية التي يقوم عليها.
 */
const line = (label: string, value: number) => ({ label, value });
const spare = Array.from({ length: 23 }, (_, i) => line(`Supplier ${i + 1}`, 1000 * (23 - i)));
const groups = [
  { id: 'crew', total: 1000000, lines: [line('CREW SALARIES', 1000000)] },
  { id: 'spare', total: spare.reduce((s, l) => s + l.value, 0), lines: spare },
  { id: 'depreciation', total: 85000, lines: [line('Depreciation', 85000)] },
];
const costTotal = groups.reduce((s, g) => s + g.total, 0);
const agg = {
  key: '2026-01..2026-10', label: 'x', incomeLines: [line('HIRE', 2000000)], incomeTotal: 2000000,
  groups, costTotal, net: 2000000 - costTotal,
};

function doc(trend: { label: string; value: number }[] = []) {
  const { container } = render(
    <GubalPrintDoc agg={agg} groups={groups} margin={10} periodLabel="يناير 2026 — أكتوبر 2026" trend={trend} en={false} />,
  );
  return container.querySelector('#gubal-doc') as HTMLElement;
}

describe('ورقة جوبال المطبوعة', () => {
  it('رأس كلّ مجموعة في thead فيتكرّر إن انشطرت', () => {
    const d = doc();
    const tables = d.querySelectorAll('.dcols table.dt');
    expect(tables).toHaveLength(3);
    tables.forEach((t) => expect(t.querySelector('thead tr.gh2')).not.toBeNull());
  });

  it('المجموعة الطويلة تُشطر والقصيرة لا', () => {
    const [crew, sp, dep] = Array.from(doc().querySelectorAll('.dcols table.dt'));
    expect(crew.classList.contains('short')).toBe(true);
    expect(sp.classList.contains('short')).toBe(false);
    expect(dep.classList.contains('short')).toBe(true);
    expect(PRINT_CSS).toMatch(/\.dt\.short\s*\{\s*break-inside:\s*avoid/);
    expect(PRINT_CSS).not.toMatch(/\.dt\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('التفصيل في عمودين والإجمالي خارجهما', () => {
    const d = doc();
    expect(PRINT_CSS).toMatch(/\.dcols\s*\{\s*column-count:\s*2/);
    expect(d.querySelector('.dcols tr.tot')).toBeNull();
    expect(d.querySelector('.detail > table.gtot tr.tot')).not.toBeNull();
  });

  it('الحلقة تحت الإيراد، ولونُ كلّ مجموعةٍ في جدول المجموعات', () => {
    const d = doc();
    const [rev, grp] = Array.from(d.querySelectorAll('.cols > div'));
    expect(rev.querySelector('.donut svg')).not.toBeNull();
    expect(grp.querySelectorAll('tbody tr .sw')).toHaveLength(3);
    expect(d.querySelector('table.lg')).toBeNull();
  });

  it('الصافي الشهري لا يظهر لشهرٍ واحد', () => {
    expect(doc().querySelector('.cbox')).toBeNull();
    expect(doc([{ label: 'يناير', value: 1 }, { label: 'فبراير', value: 2 }]).querySelector('.cbox svg')).not.toBeNull();
  });
});
