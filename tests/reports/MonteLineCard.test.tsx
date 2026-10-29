import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('@/lib/auth', () => ({ getUser: () => ({ role: 'admin' }) }));

import LineProfitReport, { MONTE_JS } from '@/app/dashboard/reports/LineProfitReport';

const REAL = 'F:/OneDrive/OneDrive - United Marine Egypt/Basel-Mohamed/مونتي جده-سواكن/_تقارير/_PMS/monte_pms.json';
const real = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : null;

beforeEach(() => { get.mockReset(); put.mockReset(); });

describe('كارت مونتي', () => {
  it('يقرأ مفتاح MonteJS وحده — لا يطلب الشيت', async () => {
    get.mockResolvedValue({ data: { manual: {} } });
    render(<LineProfitReport config={MONTE_JS} />);
    await screen.findByText(/لم تُرفع حزمة مونتي بعد/);
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/api/vessel-profit/MonteJS']);
  });

  it('يرفض عرض حزمةٍ محفوظة لا تطابق نفسها', async () => {
    get.mockResolvedValue({ data: { manual: { package: { schema: 'monte-pms/1', voyages: [] } } } });
    render(<LineProfitReport config={MONTE_JS} />);
    await screen.findByText(/الحزمة المحفوظة لا تطابق نفسها/);
  });

  it.skipIf(!real)('يعرض أرقام التحقّق من الحزمة الحقيقيّة', async () => {
    get.mockResolvedValue({ data: { manual: { package: real }, updated_at: '2026-10-29T20:00:00Z' } });
    const { container } = render(<LineProfitReport config={MONTE_JS} />);
    await screen.findByText(/الصافي بعد التكاليف الثابتة/);
    const text = container.textContent || '';
    for (const n of ['162,550.41', '151,211.19', '132,172.85', '165,353.91', '230,643.81', '243,782.25', '1,040,412', '1,085,714', '85,932.87']) {
      expect(text).toContain(n);
    }
    expect(screen.queryByText(/^▸ 07$/)).toBeNull();
  });

  it.skipIf(!real)('الرفع يحفظ الحزمة ويُبقي بقيّة المدخلات كما قُرئت', async () => {
    get.mockResolvedValue({ data: { manual: { settings: { note: 'keep' } } } });
    put.mockResolvedValue({ data: { updated_at: '2026-10-29T21:00:00Z' } });
    const { container } = render(<LineProfitReport config={MONTE_JS} />);
    await screen.findByText(/لم تُرفع حزمة مونتي بعد/);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([JSON.stringify(real)], 'monte_pms.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(real)) });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/الحزمة متّسقة/);
    fireEvent.click(screen.getByText('حفظ الحزمة'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/api/vessel-profit/MonteJS');
    expect(body.manual.settings).toEqual({ note: 'keep' });
    expect(body.manual.package.schema).toBe('monte-pms/1');
    expect(body.manual.packageFile).toBe('monte_pms.json');
    await screen.findByText(/الصافي بعد التكاليف الثابتة/);
  });
});
