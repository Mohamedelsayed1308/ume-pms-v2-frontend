import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('@/lib/auth', () => ({ getUser: () => ({ role: 'admin' }) }));

import LineProfitReport, { DALEELA_JS } from '@/app/dashboard/reports/LineProfitReport';
import { validateMontePackage } from '@/lib/reports/montePackage';

/*
 * كارت دليلة (المرحلة ٢، ٨ نوفمبر ٢٠٢٦) — كارت الحزمة نفسه لمركبٍ مملوكٍ يُبنى من كشف وكيل جدّة.
 * الحزمة الحقيقيّة من F:/Dev/daleela-pipeline، وأرقامها هي أرقام إكسيل المرحلة ١.
 */
const REAL = 'F:/Dev/daleela-pipeline/out/daleela_pms.json';
const real = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : null;

const ZERO = Object.fromEntries([
  'rev_pax_out', 'rev_pax_ret', 'rev_cargo_out', 'rev_cargo_ret', 'rev_do', 'rev_other',
  'cost_fuel', 'cost_water', 'cost_port_jed', 'cost_comm_jed', 'cost_port_suk',
  'cost_comm_suk30', 'cost_comm_suk', 'cost_agent_adj', 'cost_gifts', 'cost_catering',
].map((k) => [k, 0]));

/** رحلةٌ واحدة في أغسطس: إيراد 50,000 وتكاليف 20,000، ونقديّة قبطان 1,000 ووقود توقّف 4,000 وتكلفة ثابتة لم تُعطَ. */
const fixture = {
  schema: 'monte-pms/1', generated_at: '2026-11-08T12:00:00',
  vessel: { name: 'Daleela', name_ar: 'دليلة', line: 'جدة/سواكن', ownership: 'مملوكة', basis: 'agent_statement', cap_pax: 750, cap_trailer_units: 90, cap_cars: null, card_start: '2026-08', fixed_cost_monthly: null },
  rules: ['قاعدة'], pending: ['معلَّق'],
  voyages: [{
    ...ZERO, voyage: 'D-01', dep: '2026-08-02', arr: '2026-08-05', days: 3, pax_out: 300, pax_ret: 400,
    rev_pax_out: 30000, rev_do: 20000, cost_fuel: 12000, cost_comm_suk30: 6000, cost_catering: 2000,
    fuel_price: null, fuel_in_file: 30000, fuel_t: null, fuel_days: 3, hire_in_file: 0,
    agent_status: 'كتلة الشهر بوزن الأذون', file: 'كشف حساب دليلة.xlsx', delivery_order_est: false,
    items: [
      { kind: 'rev', side: 'jeddah', label: 'ركّاب ذهاب', usd: 30000, excluded: false },
      { kind: 'rev', side: 'jeddah', label: 'أذون', usd: 20000, excluded: false },
      { kind: 'cost', side: 'jeddah', label: 'وقود', usd: -12000, excluded: false },
      { kind: 'cost', side: 'suakin', label: 'كنزي', usd: -6000, excluded: false },
      { kind: 'cost', side: 'jeddah', label: 'اقفال رصيد الكاترينج', usd: -2000, excluded: false },
    ],
  }],
  legs: [{ leg: 'D-01-عودة', voyage: 'D-01', direction: 'عودة', route: 'سواكن ← جدّة', date: '2026-08-02', pax_paying: 400, pax_total: 400, trucks: 5, trailers: null, cars: 6, equipment: null, pallets: 0, source: 'تحليل الوكيل' }],
  monthly: [{
    month: '2026-08', vnet: 30000, pos: null, ins: 0, sal_usd: null, sal_eur: null, crew_misc: null, ctm: -1000,
    fixed_items: [
      { key: 'fixed', label: 'تكلفة السفينة الثابتة — لم تُعطَ بعد (رقمٌ ثابت يعطيه المالك)', usd: 0 },
      { key: 'idle_fuel_1', label: 'وقود التوقّف 2026-08-14 – 2026-09-01 (18 يوماً) — خارج صافي الرحلات', usd: -4000 },
    ],
    fixed: -5000, net: 25000, rev: 50000, vcost: -20000, trips: 1, line: 'الخطّ', salaries_pending: false,
  }],
  fuel_stock: [], agent_voyages: [], agent_summary: [], line_compare: [],
};

beforeEach(() => { get.mockReset(); put.mockReset(); });

describe('كارت دليلة', () => {
  it('الحزمة الصغيرة متّسقة، وإقفال الكاترينج يُنبَّه عليه بلغة كشف الوكيل', () => {
    const c = validateMontePackage(fixture);
    expect(c.errors).toEqual([]);
    expect(c.warnings.join()).toContain('محمَّلٌ على الرحلة');
  });

  it('يقرأ مفتاح DaleelaJS وحده بلا شيت الدفتر، والفراغ يسمّي ملفّ دليلة', async () => {
    get.mockResolvedValue({ data: { manual: {} } });
    render(<LineProfitReport config={DALEELA_JS} />);
    await screen.findByText(/لم تُرفع حزمة دليلة بعد/);
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/api/vessel-profit/DaleelaJS']);
    expect(screen.getByRole('button', { name: '📥 رفع daleela_pms.json' })).toBeTruthy();
  });

  it('نصوص المملوكة من كشف الوكيل: لا إيجار، والوقود على مدّة الرحلة، ووقود التوقّف بندٌ مستقلّ', async () => {
    get.mockResolvedValue({ data: { manual: { package: fixture, packageSource: 'daleela-pipeline', packageSavedAt: '2026-11-08T12:05:00Z' } } });
    const { container } = render(<LineProfitReport config={DALEELA_JS} />);
    await screen.findAllByText(/الصافي بعد التكاليف الثابتة/);
    const text = container.textContent || '';
    for (const s of ['مركبٌ مملوك', 'من حزمة رحلات دليلة', 'آليّاً من تحديث دليلة', 'مملوكة: لا إيجار',
      'أذون التسليم — كتلة الشهر بوزن الأذون', 'كنزي 30% من الأذون', 'إقفال الكاترينج — كشف الوكيل',
      'وقود التوقّف 2026-08-14 – 2026-09-01', 'تكلفة السفينة الثابتة — لم تُعطَ بعد', 'وقود أيّام التوقّف بندٌ مستقلّ', '25,000']) {
      expect(text).toContain(s);
    }
    for (const s of ['مركبٌ مستأجر', 'مونتي', 'مدخلات الفريق', 'وقود الانتقال', 'الإيجار خارج التكاليف', 'أذون التسليم (تقديريّة)', 'الإيجار 11,000$']) {
      expect(text).not.toContain(s);
    }
    expect(screen.queryByTestId('monte-team-inputs')).toBeNull();
  });

  it.skipIf(!real)('الحزمة الحقيقيّة: أرقام المرحلة ١، والتقرير التنفيذيّ يطابق', async () => {
    expect(validateMontePackage(real).errors).toEqual([]);
    get.mockResolvedValue({ data: { manual: { package: real }, updated_at: '2026-11-08T12:00:00Z' } });
    const { container } = render(<LineProfitReport config={DALEELA_JS} />);
    await screen.findAllByText(/الصافي بعد التكاليف الثابتة/);
    fireEvent.change(screen.getByLabelText('من شهر'), { target: { value: '2026-01' } });
    fireEvent.change(screen.getByLabelText('إلى شهر'), { target: { value: '2026-10' } });
    // يناير–أكتوبر بعد نقديّة القبطان ووقود التوقّف (64 رحلة؛ D-65 بلا عودة خارج الحزمة)
    await waitFor(() => expect(container.textContent).toContain('8,011,480'));
    fireEvent.click(screen.getByText(/تقرير تنفيذي \(نسخة ٣\)/));
    await waitFor(() => expect(container.textContent).toContain('MATCH'));
  });
});
