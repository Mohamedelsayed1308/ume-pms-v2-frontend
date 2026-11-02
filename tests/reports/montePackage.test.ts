import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateMontePackage, packageTotals, voyageTotals, itemTotals, fixedItemColumns, HIDDEN_VOYAGES, type MontePackage, type MonteVoyage } from '@/lib/reports/montePackage';

// حزمةٌ صغيرة مصنوعة — شكل monte-pms/1 بأقلّ بنود
const voyage = (id: string, dep: string, over: Partial<MonteVoyage> = {}): MonteVoyage => ({
  voyage: id, dep, arr: dep, days: 4, pax_out: 300, pax_ret: 140,
  rev_pax_out: 1000, rev_pax_ret: 500, rev_cargo_out: 2000, rev_cargo_ret: 0, rev_do: 0, rev_other: 0,
  cost_fuel: 900, cost_water: 0, cost_port_jed: 300, cost_comm_jed: 200, cost_port_suk: 0,
  cost_comm_suk30: 0, cost_comm_suk: 0, cost_agent_adj: 0, cost_gifts: 100, cost_catering: 0,
  fuel_price: 1600, fuel_in_file: 0, fuel_t: 0, hire_in_file: 16000, agent_status: '', file: '', delivery_order_est: true,
  items: [
    { kind: 'rev', side: 'jeddah', label: 'ركاب', usd: 1500, excluded: false },
    { kind: 'rev', side: 'jeddah', label: 'بضاعة', usd: 2000, excluded: false },
    { kind: 'cost', side: 'jeddah', label: 'إيجار', usd: -16000, excluded: true },
    { kind: 'cost', side: 'jeddah', label: 'وقود', usd: -900, excluded: false },
    { kind: 'cost', side: 'jeddah', label: 'ميناء', usd: -300, excluded: false },
    { kind: 'cost', side: 'jeddah', label: 'عمولة', usd: -200, excluded: false },
    { kind: 'cost', side: 'jeddah', label: 'هدايا', usd: -100, excluded: false },
  ],
  ...over,
});
const pkg = (over: Partial<MontePackage> = {}): MontePackage => ({
  schema: 'monte-pms/1', generated_at: '2026-10-29T00:00:00',
  vessel: { name: 'Monte Express', name_ar: 'مونتي', line: 'جدة/سواكن', ownership: 'مملوكة', cap_pax: 500, cap_trailer_units: 80, cap_cars: 110, card_start: '2026-09' },
  rules: [], legs: [], fuel_stock: [], agent_voyages: [], agent_summary: [], line_compare: [], pending: [],
  voyages: [voyage('01', '2026-10-06 14:30'), voyage('02', '2026-10-09 10:00')],
  monthly: [
    { month: '2026-09', vnet: 0, pos: -100, ins: -50, fixed: -150, net: -250, sal_usd: -100, sal_eur: null, crew_misc: null, ctm: null, rev: 0, vcost: 0, trips: 0, line: 'قبل الخطّ', salaries_pending: false },
    { month: '2026-10', vnet: 4000, pos: null, ins: -50, fixed: -80, net: 3920, sal_usd: null, sal_eur: null, crew_misc: -10, ctm: -20, rev: 7000, vcost: -3000, trips: 2, line: 'الخطّ', salaries_pending: true },
  ],
  ...over,
});

describe('validateMontePackage', () => {
  it('يقبل حزمةً متّسقة ويحسب الصافي بلا الإيجار', () => {
    const c = validateMontePackage(pkg());
    expect(c.errors).toEqual([]);
    expect(c.ok).toBe(true);
    expect(voyageTotals(c.pkg!.voyages[0])).toMatchObject({ rev: 3500, cost: 1500, comm: 200, net: 2000 });
    expect(itemTotals(c.pkg!.voyages[0])).toMatchObject({ net: 2000, excluded: -16000 });
    expect(c.warnings.some((w) => w.includes('المرتّبات'))).toBe(true);
  });

  it('يرفض شكلاً آخر', () => {
    expect(validateMontePackage({ ...pkg(), schema: 'monte-pms/2' }).ok).toBe(false);
    expect(validateMontePackage(null).ok).toBe(false);
  });

  it('يرفض رحلةً لا تساوي بنودها حقولها', () => {
    const c = validateMontePackage(pkg({ voyages: [voyage('01', '2026-10-06', { cost_fuel: 901 }), voyage('02', '2026-10-09')] }));
    expect(c.ok).toBe(false);
    expect(c.errors.join()).toContain('الرحلة 01');
  });

  it('يرفض بند إيرادٍ مستبعَداً — المستبعَد الإيجار وحده', () => {
    const v = voyage('01', '2026-10-06');
    v.items = [...v.items, { kind: 'rev', side: 'suakin', label: 'x', usd: 5, excluded: true }];
    expect(validateMontePackage(pkg({ voyages: [v, voyage('02', '2026-10-09')] })).ok).toBe(false);
  });

  it('رحلة 07 لم تعد محجوبة (رُفع الحجب ٢ نوفمبر): تُعرض، وشهرها يجب أن يحسبها', () => {
    expect(HIDDEN_VOYAGES).toEqual([]);
    const with07 = pkg({ voyages: [voyage('01', '2026-10-06'), voyage('02', '2026-10-09'), voyage('07', '2026-10-27')] });
    const c = validateMontePackage(with07);
    expect(c.hidden).toEqual([]);
    expect(c.ok).toBe(false); // الشهر لا يحسبها فلا يطابق رحلاته المعروضة

    const counted = pkg({ voyages: with07.voyages });
    counted.monthly[1] = { ...counted.monthly[1], vnet: 6000, net: 5920, trips: 3 };
    const k = validateMontePackage(counted);
    expect(k.ok).toBe(true);
    expect(k.pkg!.voyages.map((v) => v.voyage)).toEqual(['01', '02', '07']);
  });

  it('يرفض شهراً لا يساوي صافيه مكوّناته', () => {
    const p = pkg();
    p.monthly[0] = { ...p.monthly[0], net: -240 };
    expect(validateMontePackage(p).errors.join()).toContain('2026-09');
  });

  it('بنود السفينة في fixed_items تدخل في الثابتة، وأعمدتها بترتيب أوّل ظهورها', () => {
    const p = pkg();
    p.monthly[1] = { ...p.monthly[1], fixed_items: [{ key: 'prov', label: 'مؤن', usd: -30 }, { key: 'outfit', label: 'تجهيز', usd: -70 }], fixed: -180, net: 3820 };
    p.monthly[0] = { ...p.monthly[0], fixed_items: [{ key: 'outfit', label: 'تجهيز', usd: -5 }], fixed: -155, net: -255 };
    const c = validateMontePackage(p);
    expect(c.errors).toEqual([]);
    expect(fixedItemColumns(c.pkg!)).toEqual([{ key: 'outfit', label: 'تجهيز' }, { key: 'prov', label: 'مؤن' }]);
    expect(packageTotals(c.pkg!)).toMatchObject({ netAfterFixed: 3820, sinceStart: 3565 });

    // بندٌ لم يدخل في مجموع الثابتة، أو مكرّر، أو بلا اسم ← رفض
    const missed = pkg();
    missed.monthly[1] = { ...missed.monthly[1], fixed_items: [{ key: 'prov', label: 'مؤن', usd: -30 }] };
    expect(validateMontePackage(missed).errors.join()).toContain('الثابتة');
    const dup = pkg();
    dup.monthly[1] = { ...dup.monthly[1], fixed_items: [{ key: 'a', label: 'أ', usd: -10 }, { key: 'a', label: 'أ', usd: -10 }], fixed: -100, net: 3900 };
    expect(validateMontePackage(dup).errors.join()).toContain('مكرّر');
    const noLabel = pkg();
    noLabel.monthly[1] = { ...noLabel.monthly[1], fixed_items: [{ key: 'a', label: '', usd: -10 }], fixed: -90, net: 3910 };
    expect(validateMontePackage(noLabel).errors.join()).toContain('بلا مفتاحٍ أو اسم');
  });

  it('مجاميع الكارت: بعد الثابتة لأشهر الخطّ ومن أوّل الكارت', () => {
    const t = packageTotals(validateMontePackage(pkg()).pkg!);
    expect(t).toMatchObject({ n: 2, net: 4000, netAfterFixed: 3920, sinceStart: 3670 });
    expect(t.cumulative.map((x) => x.cum)).toEqual([-250, 3670]);
  });
});

// الحزمة الحقيقيّة من مجلّد مونتي — تُفحص حين تكون على الجهاز، ولا تدخل الريبو
const REAL = 'F:/OneDrive/OneDrive - United Marine Egypt/Basel-Mohamed/مونتي جده-سواكن/_تقارير/_PMS/monte_pms.json';
describe.skipIf(!existsSync(REAL))('حزمة مونتي الحقيقيّة (٣١ أكتوبر ٢٠٢٦ — بفواتير سمارت فليت)', () => {
  it('تطابق أرقام التحقّق في طلب المالك', () => {
    const c = validateMontePackage(JSON.parse(readFileSync(REAL, 'utf8')));
    expect(c.errors).toEqual([]);
    const t = packageTotals(c.pkg!);
    expect(Object.fromEntries(t.voyages.map((x) => [x.v.voyage, x.net]))).toEqual({
      '01': 162550.41, '02': 151211.19, '03': 132172.85, '04': 165353.91, '05': 230643.81, '06': 243782.25,
    });
    expect(t.voyages.map((x) => itemTotals(x.v).net)).toEqual(t.voyages.map((x) => x.net));
    expect(t.net).toBe(1085714.42);
    expect(t.netAfterFixed).toBe(945508.93);
    expect(t.sinceStart).toBe(-8970.44);
    const oct = c.pkg!.monthly.find((m) => m.month === '2026-10')!;
    expect(oct.fixed).toBe(-140205.49);
    expect(oct.fixed_items!.map((i) => i.label)).toEqual(['مؤن وطعام ومياه — سمارت فليت', 'تجهيز وصيانة — سمارت فليت']);
    expect(c.pkg!.voyages.some((v) => v.voyage === '07')).toBe(false);
  });
});
