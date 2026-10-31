import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { validateMontePackage, type MontePackage, type MonteVoyage } from '@/lib/reports/montePackage';
import { monteReportData, MONTE_REV_ROWS, MONTE_SIDES } from '@/lib/reports/monteReports';
import { allocateVoyageNets } from '@/app/dashboard/reports/VesselProfitReport';
import VesselFinReport from '@/app/dashboard/reports/VesselFinReport';
import VesselBoardReport from '@/app/dashboard/reports/VesselBoardReport';
import VesselExecReport from '@/app/dashboard/reports/VesselExecReport';

// حزمةٌ صغيرة: رحلتان في أكتوبر، وسبتمبر قبل الخطّ بوقود تموضعٍ ومرتّبات
const voyage = (id: string, dep: string): MonteVoyage => ({
  voyage: id, dep, arr: dep, days: 4, pax_out: 300, pax_ret: 140,
  rev_pax_out: 1000, rev_pax_ret: 500, rev_cargo_out: 2000, rev_cargo_ret: 300, rev_do: 200, rev_other: 0,
  cost_fuel: 900, cost_water: 10, cost_port_jed: 300, cost_comm_jed: 200, cost_port_suk: 150,
  cost_comm_suk30: 400, cost_comm_suk: 40, cost_agent_adj: 0, cost_gifts: 100, cost_catering: 0,
  fuel_price: 1600, fuel_in_file: 0, fuel_t: 0, hire_in_file: 0, agent_status: '', file: '', delivery_order_est: true,
  items: [
    { kind: 'rev', side: 'jeddah', label: 'إيراد', usd: 4000, excluded: false },
    { kind: 'cost', side: 'jeddah', label: 'تكاليف', usd: -2100, excluded: false },
  ],
});
const pkg: MontePackage = {
  schema: 'monte-pms/1', generated_at: '2026-10-31T00:00:00',
  vessel: { name: 'Monte Express', name_ar: 'مونتي', line: 'جدة/سواكن', ownership: 'مملوكة', cap_pax: 500, cap_trailer_units: 80, cap_cars: 167, card_start: '2026-09' },
  rules: [], fuel_stock: [], agent_voyages: [], agent_summary: [], line_compare: [], pending: [],
  legs: [
    { leg: '01-ذهاب', voyage: '01', direction: 'ذهاب', route: '', date: '', pax_paying: 300, pax_total: 310, trucks: 20, trailers: 10, cars: 50, equipment: null, source: '' },
    { leg: '01-عودة', voyage: '01', direction: 'عودة', route: '', date: '', pax_paying: 140, pax_total: 150, trucks: 5, trailers: null, cars: 8, equipment: null, source: '' },
  ],
  voyages: [voyage('01', '2026-10-06 14:30'), voyage('02', '2026-10-09 10:00')],
  monthly: [
    { month: '2026-09', vnet: 0, pos: -700, ins: -50, fixed: -150, net: -850, sal_usd: -100, sal_eur: null, crew_misc: null, ctm: null, rev: 0, vcost: 0, trips: 0, line: 'قبل الخطّ', salaries_pending: false },
    { month: '2026-10', vnet: 3800, pos: null, ins: -50, fixed: -380, net: 3420, sal_usd: -200, sal_eur: -30, crew_misc: -10, ctm: -20,
      fixed_items: [{ key: 'outfit', label: 'تجهيز وصيانة', usd: -70 }], rev: 8000, vcost: -4200, trips: 2, line: 'الخطّ', salaries_pending: false },
  ],
};

describe('محوِّل مونتي إلى نوافذ التقارير', () => {
  it('الحزمة الصغيرة متّسقة قبل كلّ شيء', () => {
    expect(validateMontePackage(pkg).errors).toEqual([]);
  });

  it('شهر أكتوبر: الصافي النهائي = صافي الشهر في الحزمة، والسطور في أماكنها', () => {
    const r = monteReportData(pkg, '2026-10');
    expect(r.packageNet).toBe(3420);
    expect(r.exec.opNet - r.exec.purchasesTotal).toBeCloseTo(3420, 2);
    expect(r.fin).toMatchObject({ revE: 6000, revI: 1600, revenue: 8000, count: 2, bunkerCost: 1800, salaries: 230 });
    expect(r.fin.manualRev?.find((x) => x.key === 'rev_do')?.amount).toBe(400);
    expect(r.fin.E.exp.cost_comm_jed).toBe(400);
    expect(r.fin.I.exp.cost_comm_suk30).toBe(800);
    // الحمولات من الإشغال: الشاحنات والمقطورات معاً، والسيّارات وحدها
    expect(r.fin.E).toMatchObject({ truckC: 30, vehC: 50, passC: 600 });
    expect(r.fin.I).toMatchObject({ truckC: 5, vehC: 8, passC: 280 });
    expect(r.purchases.byItem).toEqual([
      { name: 'تجهيز وصيانة', value: 70 }, { name: 'التأمين (من الوثائق)', value: 50 },
      { name: 'نقديّة القبطان', value: 20 }, { name: 'مصاريف البحّارة', value: 10 },
    ]);
    const alloc = allocateVoyageNets(r.exec.perVoyage, r.exec, 'mixed');
    expect(alloc.reduce((s, v) => s + v.net, 0)).toBeCloseTo(3420, 2);
  });

  it('المدى يجمع الأشهر: وقود التموضع في البنكر، والصافي = مجموع الأشهر', () => {
    const r = monteReportData(pkg, '2026-09', '2026-10');
    expect(r.months).toEqual(['2026-09', '2026-10']);
    expect(r.fin.bunkerCost).toBe(2500);
    expect(r.profile.bunkerRows?.map((x) => x.value)).toEqual([1800, 700]);
    expect(r.exec.opNet - r.exec.purchasesTotal).toBeCloseTo(2570, 2);
    expect(r.packageNet).toBe(2570);
  });

  it('شهرٌ بلا رحلات: لا إيراد، والتكاليف الثابتة وحدها', () => {
    const r = monteReportData(pkg, '2026-09');
    expect(r.exec.count).toBe(0);
    expect(r.exec.opNet - r.exec.purchasesTotal).toBeCloseTo(-850, 2);
  });
});

const REAL = 'F:/OneDrive/OneDrive - United Marine Egypt/Basel-Mohamed/مونتي جده-سواكن/_تقارير/_PMS/monte_pms.json';
const real = existsSync(REAL) ? validateMontePackage(JSON.parse(readFileSync(REAL, 'utf8'))).pkg : null;

describe.skipIf(!real)('تقارير مونتي من الحزمة الحقيقيّة (٣١ أكتوبر ٢٠٢٦)', () => {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it('أكتوبر والمدى من أبريل يطابقان صافي الحزمة', () => {
    const oct = monteReportData(real!, '2026-10');
    expect(oct.exec.count).toBe(6);
    expect(Math.round((oct.exec.opNet - oct.exec.purchasesTotal) * 100) / 100).toBe(945508.93);
    const all = monteReportData(real!, '2026-04', '2026-10');
    expect(Math.round((all.exec.opNet - all.exec.purchasesTotal) * 100) / 100).toBe(-8970.44);
    expect(all.packageNet).toBe(-8970.44);
  });

  it('الماليّ: يُخفي ما لا بيانات له، ويسمّي سطر C باسمه', () => {
    const r = monteReportData(real!, '2026-10');
    const alloc = allocateVoyageNets(r.exec.perVoyage, r.exec, 'mixed');
    const { container } = render(
      <VesselFinReport cfg={{ vessel: 'Monte Express', ...MONTE_SIDES }} month="2026-10" monthLabel="2026-10"
        data={r.fin} purchases={r.purchases} exec={r.exec} allocVoy={alloc} labelOf={r.labelOf}
        revRows={MONTE_REV_ROWS} defaultBuckets={r.exec.defaultBuckets} profile={r.profile} onClose={() => {}} />,
    );
    const t = container.textContent || '';
    expect(t).toContain(fmt(945508.93));
    expect(t).toContain('تكاليف السفينة الثابتة');
    expect(t).toContain('وقود الرحلات بالمتوسّط المرجَّح');
    expect(t).toContain('تجهيز وصيانة — سمارت فليت');
    for (const gone of ['السيولة عند الوكلاء', 'إذن الشحن', 'رصيد أول المدة', 'الفواتير مجمَّعة']) expect(t).not.toContain(gone);
  });

  it('التنفيذيّ: كلّ فحوص المطابقة MATCH، ولا جداول فواتيرٍ ولا سيولة', () => {
    const r = monteReportData(real!, '2026-10');
    const alloc = allocateVoyageNets(r.exec.perVoyage, r.exec, 'mixed');
    const { container } = render(
      <VesselBoardReport cfg={{ vessel: 'Monte Express', ...MONTE_SIDES }} month="2026-10" monthLabel="2026-10"
        data={r.fin} purchases={r.purchases} exec={r.exec} allocVoy={alloc} labelOf={r.labelOf}
        revRows={MONTE_REV_ROWS} profile={r.profile} onClose={() => {}} />,
    );
    const t = container.textContent || '';
    expect(t).toContain('MATCH');
    expect(t).not.toContain('Δ');
    expect(t).toContain(fmt(945508.93));
    for (const gone of ['Appendix B', 'Top 5 Suppliers', "Agents' Liquidity", 'إذن الشحن']) expect(t).not.toContain(gone);
  });

  it('الإداريّ: يفتح بتوزيع الوقود على رحلاته ويسمّي المجموعة', () => {
    const r = monteReportData(real!, '2026-10');
    const { container, getByText } = render(
      <VesselExecReport cfg={{ vessel: 'Monte Express' }} month="2026-10" monthLabel="2026-10" exec={r.exec} profile={r.profile} onClose={() => {}} />,
    );
    expect(container.textContent).toContain('تكاليف السفينة الثابتة');
    expect(getByText('مختلط').className).toContain('bg-white');
  });
});
