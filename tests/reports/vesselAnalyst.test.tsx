/* eslint-disable @typescript-eslint/no-explicit-any -- السياق كائن JSON حرّ الشكل يُفحص هنا بقيمه */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { itemContext, cardContext, type AnInput, type AnVoyage } from '@/lib/reports/vesselAnalyst';

/*
 * دالّةٌ عاديّة تسجّل نداءاتها بدل vi.fn: مع vi.fn بعد mockReset أو mockClear يُبلَّغ
 * رفض الخادم خطأً غير ملتقَط وإن التقطته اللوحة (جُرّب ٣٠ أكتوبر ٢٠٢٦).
 */
const calls: any[][] = [];
let impl: (...a: unknown[]) => Promise<unknown> = async () => ({ data: {} });
vi.mock('@/lib/api', () => ({ default: { post: (...a: unknown[]) => { calls.push(a); return impl(...a); } } }));
import VesselAnalystPanel, { MiniMarkdown } from '@/app/dashboard/reports/VesselAnalystPanel';

const side = (truckC: number, truck: number, exp: Record<string, number> = {}) => ({ truckC, truck, vehC: 0, veh: 0, passC: 10, pass: 500, discharge: 0, exp });
const voy = (ref: number, month: string, truckC: number, truck: number, port: number, bunker = 0): AnVoyage =>
  ({ ref, month, E: side(truckC, truck, { portEgy: port }), I: side(0, 0, { fw: 100 }), bunker, net: truck - port });

const input = (over: Partial<AnInput> = {}): AnInput => ({
  vessel: 'Poseidon', agentExport: 'وكيل بدوي', agentImport: 'وكيل البسّام',
  voyages: [
    voy(90, '2026-09', 100, 110000, 25000),
    voy(91, '2026-10', 100, 112000, 28000),
    voy(92, '2026-10', 50, 55000, 28000),
    voy(93, '2026-10', 100, 111000, 90000, 40000),
  ],
  from: '2026-10', to: '2026-10', labelOf: { portEgy: 'Port Authorities fees — EGY', fw: 'F.W' },
  totals: { revenue: 279500, expenses: 160000, net: 119500, count: 3, revE: 279500, revI: 0, expE: 146000, expI: 300 },
  ...over,
});

describe('itemContext', () => {
  it('بند مصروفٍ في جهة: إجماليّ الفترة ورحلاتها والشهور كلّها', () => {
    const c = itemContext(input(), { kind: 'expense', key: 'portEgy', side: 'E', label: 'Port Authorities fees — EGY' }) as any;
    expect(c.periodTotals).toMatchObject({ total: 146000, perVoyage: 48666.67, units: null });
    expect(c.periodTotals.shareOfExpenses).toBe(91.25);
    expect(c.byVoyage.map((x: any) => [x.ref, x.value])).toEqual([['91', 28000], ['92', 28000], ['93', 90000]]);
    expect(c.byMonth).toEqual([
      expect.objectContaining({ month: '2026-09', value: 25000, voyages: 1, inPeriod: false }),
      expect.objectContaining({ month: '2026-10', value: 146000, voyages: 3, inPeriod: true }),
    ]);
    expect(c.voyageStats).toMatchObject({ n: 3, median: 28000, max: { ref: '93', value: 90000 } });
    expect(c.source).toContain('وكيل بدوي');
  });

  it('نسبة البند من مجموع بنود الكارت لا من المصروفات المشتقّة من BALANCE، مع فرق الدفتر', () => {
    const base = input();
    const c = itemContext(input({ totals: { ...base.totals, lineExpenses: 292000, bookGap: 132000 } }),
      { kind: 'expense', key: 'portEgy', side: 'E', label: 'Port Authorities fees — EGY' }) as any;
    expect(c.periodTotals.shareOfExpenses).toBe(50);
    expect(c.card).toMatchObject({ expenses: 160000, lineExpenses: 292000, bookGap: 132000 });
    expect(c.notes[0]).toContain('bookGap');
  });

  it('بند إيراد: الوحدات وسعر الوحدة', () => {
    const c = itemContext(input(), { kind: 'revenue', key: 'truck', side: 'both', label: 'نولون شاحنات' }) as any;
    expect(c.periodTotals).toMatchObject({ total: 278000, units: 250, perUnit: 1112 });
    expect(c.unit).toBe('شاحنة');
    expect(c.byMonth[1]).toMatchObject({ units: 250, perUnit: 1112 });
  });

  it('البنكر: تموينات الشيت للرحلات ومعادلة المخزون', () => {
    const bunker = { opening: 10000, suppliesExcel: 40000, invoicesUSD: 5000, closing: 15000, cost: 40000, skipped: [], cuts: [] };
    const c = itemContext(input({ bunker }), { kind: 'bunker', label: 'البنكر المستهلك' }) as any;
    expect(c.periodTotals.total).toBe(40000);
    expect(c.bunker).toMatchObject({ opening: 10000, closing: 15000, cost: 40000 });
  });

  it('المرتّبات: مجموع الفترة من شهورها', () => {
    const c = itemContext(input({ salariesByMonth: [{ month: '2026-09', amount: 70000, source: 'QuickBooks' }, { month: '2026-10', amount: 72000.004, source: 'يدويّ' }] }),
      { kind: 'salaries', label: 'المرتّبات' }) as any;
    expect(c.total).toBe(72000);
  });
});

describe('cardContext', () => {
  it('ملخّص الجهتين بالبنود والسلسلة الشهريّة', () => {
    const c = cardContext(input()) as any;
    expect(c.period.voyages).toBe(3);
    expect(c.export.revenue[0]).toMatchObject({ item: 'نولون شاحنات', value: 278000, units: 250 });
    expect(c.export.expenses[0]).toMatchObject({ item: 'Port Authorities fees — EGY', value: 146000 });
    expect(c.import.expenses[0]).toMatchObject({ item: 'F.W', value: 300 });
    expect(c.byMonth.map((m: any) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(c.byVoyage).toHaveLength(3);
  });
});

describe('VesselAnalystPanel', () => {
  beforeEach(() => { calls.length = 0; });

  it('زرّ البند يسأل عنه بسياقه، والسؤال التالي يبقى على البند حتّى يُزال', async () => {
    impl = async () => ({ data: { answer: '## الخلاصة\n- **مرتفع** في `93`', truncated: false } });
    const build = vi.fn((item) => ({ ctx: item ? item.label : 'card' }));
    const item = { kind: 'expense' as const, key: 'portEgy', side: 'E' as const, label: 'ميناء مصر — صادر' };
    const { rerender } = render(<VesselAnalystPanel vessel="Poseidon" period="أكتوبر 2026" buildContext={build} ask={null} />);
    rerender(<VesselAnalystPanel vessel="Poseidon" period="أكتوبر 2026" buildContext={build} ask={{ item, nonce: 1 }} />);
    await screen.findByText('الخلاصة');
    const [url, body] = calls[0];
    expect(url).toBe('/api/vessel-analyst/ask');
    expect(body).toMatchObject({ vessel: 'Poseidon', item: { key: 'portEgy', label: 'ميناء مصر — صادر', kind: 'expense', side: 'E' }, context: { ctx: 'ميناء مصر — صادر' } });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ولماذا 93؟' } });
    fireEvent.click(screen.getByText('اسأل'));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1][1]).toMatchObject({ question: 'ولماذا 93؟', context: { ctx: 'ميناء مصر — صادر' } });
    expect(calls[1][1].history).toHaveLength(2);

    fireEvent.click(screen.getByText('✕ الكارت كلّه'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ما أكبر مصروف؟' } });
    fireEvent.click(screen.getByText('اسأل'));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2][1]).toMatchObject({ item: null, context: { ctx: 'card' } });
  });

  it('يعرض رسالة الخطأ من الخادم', async () => {
    impl = async () => { throw { response: { data: { message: 'تجاوزت حدّ الأسئلة' } } }; };
    render(<VesselAnalystPanel vessel="Poseidon" period="أكتوبر 2026" buildContext={() => ({})} ask={null} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'سؤال' } });
    fireEvent.click(screen.getByText('اسأل'));
    await waitFor(() => expect(screen.getByText(/تجاوزت حدّ الأسئلة/)).toBeTruthy());
  });

  it('Markdown بلا HTML خام', () => {
    const { container } = render(<MiniMarkdown text={'| البند | المبلغ |\n|---|---|\n| F.W | 300 |\n<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('tr')).toHaveLength(2);
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
