import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { render } from '@testing-library/react';
import {
  validateWasaPackage, aggregateWasa, stockAsOf, WasaPrintDoc, WASA_PRINT_CSS, WASA_FORMAT,
} from '@/app/dashboard/reports/WasaProfitReport';

/*
 * كارت واسا (أمر المالك ١١ نوفمبر ٢٠٢٦): الحزمة تُبنى خارج المنظومة وتُرفع، فيُحرس هنا
 * أنّ ما يناقض نفسه لا يُقبل، وأنّ مخزون الحوض رصيدٌ في آخر الفترة خارج التكاليف.
 */
const REAL = 'F:/Dev/My Project/wasa-card/data/wasa_months.json';
const L = (label: string, value: number) => ({ label, value });

function month(key: string, rev: number, crew: number, stock = 0) {
  return {
    key, incomeLines: [L('إيجار المركب', rev)], incomeTotal: rev,
    groups: [{ id: 'crew', total: crew, lines: [L('Salaries', crew)] }, { id: 'depreciation', total: 100, lines: [L('إهلاك المركب', 100)] }],
    costTotal: crew + 100, net: rev - crew - 100,
    stockAdded: stock, stockLines: stock ? [L('Wartsila Poland', stock)] : [],
  };
}
function pkg(months = [month('2026-01', 1000, 400), month('2026-02', 1200, 500, 300), month('2026-03', 900, 450, 200)]) {
  const total = months.reduce((s, m) => s + m.stockAdded, 0);
  return { format: WASA_FORMAT, vessel: 'Wasa Express', currency: 'USD', built: '2026-11-11T12:00:00',
    notes: [{ ar: 'ملاحظة', en: 'Note' }], months, drydockStock: { total, lines: total ? [L('Wartsila Poland', total)] : [] } };
}

describe('حزمة واسا', () => {
  it('الحزمة السليمة تُقبل بشهورها مرتّبة', () => {
    const p = pkg(); p.months.reverse();
    const c = validateWasaPackage(p);
    expect(c.errors).toEqual([]);
    expect(c.months.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(c.meta?.notes).toHaveLength(1);
  });

  it('ترفض الصيغة الغريبة ومركباً آخر وعملةً أخرى', () => {
    expect(validateWasaPackage({ ...pkg(), format: 'x' }).ok).toBe(false);
    expect(validateWasaPackage({ ...pkg(), vessel: 'Gubal Trader' }).errors.join()).toContain('Gubal Trader');
    expect(validateWasaPackage({ ...pkg(), currency: 'EUR' }).ok).toBe(false);
    expect(validateWasaPackage([]).ok).toBe(false);
  });

  it('ترفض إجماليّاً لا يساوي بنوده، وصافياً لا يساوي الفرق، وشهراً مكرَّراً', () => {
    const a = pkg(); a.months[0].incomeTotal += 5;
    expect(validateWasaPackage(a).errors.join()).toContain('بنود الإيراد');
    const b = pkg(); b.months[1].net += 1;
    expect(validateWasaPackage(b).errors.join()).toContain('الصافي');
    const c = pkg(); c.months[2].costTotal += 1; c.months[2].net -= 1;
    expect(validateWasaPackage(c).errors.join()).toContain('المجموعات');
    const d = pkg([month('2026-01', 1, 0), month('2026-01', 1, 0)]);
    expect(validateWasaPackage(d).errors.join()).toContain('مكرَّر');
  });

  it('ترفض مجموعةً غير معروفة ورصيد مخزونٍ لا يساوي الإضافات', () => {
    const a = pkg(); (a.months[0].groups as any).push({ id: 'drydock', total: 0, lines: [] });
    expect(validateWasaPackage(a).errors.join()).toContain('drydock');
    const b = pkg(); b.drydockStock.total += 10;
    expect(validateWasaPackage(b).errors.join()).toContain('مخزون الحوض');
  });

  it('التجميع يجمع الشهور، والمخزون لا يدخل التكاليف', () => {
    const c = validateWasaPackage(pkg());
    const agg = aggregateWasa(c.months)!;
    expect(agg.incomeTotal).toBe(3100);
    expect(agg.costTotal).toBe(1650);
    expect(agg.net).toBe(1450);
    expect(agg.stockAdded).toBe(500);
    expect(agg.groups.find((g) => g.id === 'crew')!.lines).toEqual([L('Salaries', 1350)]);
  });

  it('رصيد المخزون في آخر الفترة يشمل ما أُضيف قبلها', () => {
    const { months } = validateWasaPackage(pkg());
    expect(stockAsOf(months, '2026-01').total).toBe(0);
    expect(stockAsOf(months, '2026-03')).toEqual({ total: 500, lines: [L('Wartsila Poland', 500)] });
    // شهر مارس وحده: أُضيف فيه 200 والرصيد 500
    expect(aggregateWasa(months.filter((m) => m.key === '2026-03'))!.stockAdded).toBe(200);
  });

  it('الحزمة الحقيقيّة إن وُجدت تُقبل وتطابق أرقام المرحلة الأولى', () => {
    if (!existsSync(REAL)) return;
    const c = validateWasaPackage(JSON.parse(readFileSync(REAL, 'utf8')));
    expect(c.errors).toEqual([]);
    const agg = aggregateWasa(c.months)!;
    expect(agg.incomeTotal).toBeCloseTo(6149594.71, 1);
    expect(agg.costTotal).toBeCloseTo(3550927.97, 1);
    expect(agg.net).toBeCloseTo(2598666.73, 1);
    expect(stockAsOf(c.months, '2026-10').total).toBeCloseTo(689637.79, 1);
  });
});

describe('ورقة واسا المطبوعة', () => {
  const { months, meta } = validateWasaPackage(pkg());
  const agg = aggregateWasa(months)!;
  const groups = agg.groups.filter((g) => g.total);
  const doc = (en = false) => render(
    <WasaPrintDoc agg={agg} groups={groups} margin={46.8} periodLabel="يناير 2026 — مارس 2026" en={en}
      trend={months.map((m) => ({ label: m.key, value: m.net }))} stock={stockAsOf(months, '2026-03')} endLabel="مارس 2026" notes={meta!.notes} />,
  ).container.querySelector('#wasa-doc') as HTMLElement;

  it('أنماط جوبال تحت مُعرّف واسا، والمخزون والملاحظات في الورقة', () => {
    expect(WASA_PRINT_CSS).not.toContain('#gubal-doc');
    expect(WASA_PRINT_CSS).toMatch(/#wasa-doc \.dcols\s*\{\s*column-count:\s*2/);
    expect(WASA_PRINT_CSS.trim().endsWith('}')).toBe(true);
    const d = doc();
    expect(d.querySelector('.stock tr.tot')?.textContent).toContain('500.00');
    expect(d.querySelector('.notes li')?.textContent).toBe('ملاحظة');
    expect(d.querySelector('.cbox svg')).not.toBeNull();
  });

  it('النسخة الإنجليزيّة بأسماء البنود المحاسبيّة', () => {
    const d = doc(true);
    expect(d.getAttribute('dir')).toBe('ltr');
    expect(d.textContent).toContain('Charter Hire Revenue');
    expect(d.textContent).toContain('Vessel Depreciation');
    expect(d.querySelector('.notes li')?.textContent).toBe('Note');
  });
});
