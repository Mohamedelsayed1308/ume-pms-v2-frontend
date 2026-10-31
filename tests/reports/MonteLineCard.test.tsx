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
    for (const n of ['162,550.41', '151,211.19', '132,172.85', '165,353.91', '230,643.81', '243,782.25', '945,509', '1,085,714', '-8,970.44', 'تجهيز وصيانة — سمارت فليت']) {
      expect(text).toContain(n);
    }
    expect(screen.queryByText(/^▸ 07$/)).toBeNull();
  });

  it.skipIf(!real)('أزرار التقارير الثلاثة تفتح نوافذ بوسيدون بأرقام مونتي، والفترة تُختار', async () => {
    get.mockResolvedValue({ data: { manual: { package: real }, updated_at: '2026-10-31T13:00:00Z' } });
    const { container } = render(<LineProfitReport config={MONTE_JS} />);
    await screen.findByText(/الصافي بعد التكاليف الثابتة/);
    // الافتراضيّ آخر شهرٍ فيه رحلات
    expect((screen.getByLabelText('من شهر') as HTMLSelectElement).value).toBe('2026-10');
    fireEvent.click(screen.getByText(/تقرير مالي \(نسخة ٢\)/));
    await waitFor(() => expect(container.textContent).toContain('945,508.93'));
    // المدى من أبريل: الصافي = التراكميّ في الكارت
    fireEvent.change(screen.getByLabelText('من شهر'), { target: { value: '2026-04' } });
    fireEvent.change(screen.getByLabelText('إلى شهر'), { target: { value: '2026-10' } });
    await waitFor(() => expect(container.textContent).toContain('-8,970.44'));
    fireEvent.click(screen.getByText(/تقرير تنفيذي \(نسخة ٣\)/));
    await waitFor(() => expect(container.textContent).toContain('MATCH'));
  });

  it.skipIf(!real)('رأس الكارت يقول للفريق متى تغيّرت الأرقام ولماذا', async () => {
    const pkg = { ...real, update_reason: 'وصل تقرير ميناء رحلة 08' };
    get.mockResolvedValue({ data: { manual: { package: pkg, packageSource: 'monte-session', packageSavedAt: '2026-10-31T15:40:00Z' }, updated_at: '2026-10-31T16:00:00Z' } });
    render(<LineProfitReport config={MONTE_JS} />);
    const line = await screen.findByTestId('monte-last-update');
    expect(line.textContent).toContain('آخر تحديث');
    expect(line.textContent).toContain('آليّاً من جلسة مونتي');
    expect(line.textContent).toContain('السبب: وصل تقرير ميناء رحلة 08');
    // وقت حفظ الحزمة لا وقت آخر تعديلٍ في الصفّ
    expect(line.textContent).toContain(new Date('2026-10-31T15:40:00Z').toLocaleString('ar-EG'));
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
