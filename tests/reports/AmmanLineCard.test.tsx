import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('@/lib/auth', () => ({ getUser: () => ({ role: 'admin' }) }));

import LineProfitReport, { AMMAN_JS } from '@/app/dashboard/reports/LineProfitReport';
import { validateMontePackage } from '@/lib/reports/montePackage';

/*
 * كارت عمّان (المرحلة ب، ٣ نوفمبر ٢٠٢٦) — كارت الحزمة نفسه بإعدادات مركبٍ مستأجر.
 * الحزمة الحقيقيّة من F:/Dev/amman-pipeline، وأرقامها طوبقت بإكسيل الكارت في المرحلة أ.
 */
const REAL = 'F:/Dev/amman-pipeline/out/amman_pms.json';
const real = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : null;

const ZERO = Object.fromEntries([
  'rev_pax_out', 'rev_pax_ret', 'rev_cargo_out', 'rev_cargo_ret', 'rev_do', 'rev_other',
  'cost_fuel', 'cost_water', 'cost_port_jed', 'cost_comm_jed', 'cost_port_suk',
  'cost_comm_suk30', 'cost_comm_suk', 'cost_agent_adj', 'cost_gifts', 'cost_catering',
].map((k) => [k, 0]));

/** رحلةٌ واحدة في يناير: إيراد 50,000 وتكاليف 20,000، وتكلفة السفينة 12,345 منها إيجار 11,000. */
const fixture = {
  schema: 'monte-pms/1', generated_at: '2026-11-03T12:00:00',
  vessel: { name: 'Amman', name_ar: 'عمّان', line: 'جدة/سواكن', ownership: 'مستأجرة', cap_pax: 880, cap_trailer_units: 25, cap_cars: null, card_start: '2026-01', hire_per_day: 11000 },
  rules: ['قاعدة'], pending: ['معلَّق'],
  voyages: [{
    ...ZERO, voyage: 'A-01', dep: '2026-01-02', arr: '2026-01-06', days: 4, pax_out: 300, pax_ret: 400,
    rev_pax_out: 30000, rev_do: 20000, cost_fuel: 15000, cost_comm_suk30: 5000,
    fuel_price: 800, fuel_in_file: 0, fuel_t: 18.75, hire_in_file: 0,
    agent_status: 'كتلة سواكن من ملفّ الوكيل', file: 'كشف حساب عمان.xlsx', delivery_order_est: false,
    items: [
      { kind: 'rev', side: 'jeddah', label: 'ركّاب ذهاب', usd: 30000, excluded: false },
      { kind: 'rev', side: 'suakin', label: 'أذون', usd: 20000, excluded: false },
      { kind: 'cost', side: 'jeddah', label: 'وقود', usd: -15000, excluded: false },
      { kind: 'cost', side: 'suakin', label: 'كنزي', usd: -5000, excluded: false },
    ],
  }],
  legs: [{ leg: 'A-01-عودة', voyage: 'A-01', direction: 'عودة', route: 'سواكن ← جدّة', date: '2026-01-04', pax_paying: 400, pax_total: 400, trucks: 5, trailers: null, cars: 6, equipment: null, pallets: 37, source: 'تحليل الوكيل' }],
  monthly: [{
    month: '2026-01', vnet: 30000, pos: null, ins: -500, sal_usd: null, sal_eur: null, crew_misc: null, ctm: -845,
    fixed_items: [{ key: 'hire', label: 'الإيجار — 11,000$ لليوم بالاستحقاق', usd: -11000 }],
    fixed: -12345, net: 17655, rev: 50000, vcost: -20000, trips: 1, line: 'الخطّ', salaries_pending: false,
  }],
  fuel_stock: [], agent_voyages: [], agent_summary: [], line_compare: [],
};

beforeEach(() => { get.mockReset(); put.mockReset(); });

describe('كارت عمّان', () => {
  it('الحزمة الصغيرة متّسقة', () => {
    expect(validateMontePackage(fixture).errors).toEqual([]);
  });

  it('يقرأ مفتاح AmmanJS وحده، والفراغ يسمّي ملفّ عمّان', async () => {
    get.mockResolvedValue({ data: { manual: {} } });
    render(<LineProfitReport config={AMMAN_JS} />);
    await screen.findByText(/لم تُرفع حزمة عمّان بعد/);
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/api/vessel-profit/AmmanJS']);
    expect(screen.getByRole('button', { name: '📥 رفع amman_pms.json' })).toBeTruthy();
  });

  it('نصوص المستأجرة: الإيجار في تكلفة السفينة، والطبالي، ولا مدخلات فريق ولا أعمدة فارغة', async () => {
    get.mockResolvedValue({ data: { manual: { package: fixture, packageSource: 'amman-pipeline', packageSavedAt: '2026-11-03T12:05:00Z' } } });
    const { container } = render(<LineProfitReport config={AMMAN_JS} />);
    await screen.findAllByText(/الصافي بعد تكلفة السفينة/);
    const text = container.textContent || '';
    for (const s of ['مركبٌ مستأجر', 'الإيجار 11,000$ لليوم', 'من حزمة رحلات عمّان', 'آليّاً من تحديث عمّان',
      'تكلفة السفينة (إيجار · تأمين · طاقم)', 'كنزي 30% من الأذون', 'أذون التسليم — ملفّ وكيل سواكن',
      'تأمين P&I', 'نقديّة القبطان (مرتّبات)', 'الإيجار — 11,000$ لليوم بالاستحقاق', 'طبالي', '17,655', 'كلّ أشهر الكارت']) {
      expect(text).toContain(s);
    }
    for (const s of ['مركبٌ مملوك', 'مونتي', 'مدخلات الفريق', 'مرتّبات $', 'وقود الانتقال', 'مصاريف الطاقم', 'الإيجار اليوميّ في ملفّات الربح', 'أذون التسليم (تقديريّة)']) {
      expect(text).not.toContain(s);
    }
    expect(screen.queryByTestId('monte-team-inputs')).toBeNull();
    // عمود الطبالي يحمل رقم الرِّجل
    const leg = screen.getByText('A-01-عودة').closest('tr')!;
    expect(leg.textContent).toContain('37');
  });

  it.skipIf(!real)('الحزمة الحقيقيّة: أرقام المرحلة أ كما طوبقت بالإكسيل، والتقرير التنفيذيّ يطابق', async () => {
    get.mockResolvedValue({ data: { manual: { package: real }, updated_at: '2026-11-03T12:00:00Z' } });
    const { container } = render(<LineProfitReport config={AMMAN_JS} />);
    await screen.findAllByText(/الصافي بعد تكلفة السفينة/);
    const text = container.textContent || '';
    // يناير–أكتوبر بعد تكلفة السفينة، وأكتوبر وحده
    for (const n of ['3,093,012.30', '947,913.37']) expect(text).toContain(n);
    expect((screen.getByLabelText('من شهر') as HTMLSelectElement).value).toBe('2026-10');
    fireEvent.change(screen.getByLabelText('من شهر'), { target: { value: '2026-01' } });
    fireEvent.change(screen.getByLabelText('إلى شهر'), { target: { value: '2026-10' } });
    fireEvent.click(screen.getByText(/تقرير تنفيذي \(نسخة ٣\)/));
    await waitFor(() => expect(container.textContent).toContain('MATCH'));
  });
});
