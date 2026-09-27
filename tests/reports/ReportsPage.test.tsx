import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StrictMode } from 'react';
import { STATEMENTS, SUPPLIERS } from './fixtures';

/*
 * الصفحة كاملةً: الرابط المباشر يفتح التقرير ويُطبّق المورّدين، والرجوع يُعيد
 * الدليل ويمسح الرابط. والتقارير الأخرى مُستبدَلةٌ بعناصر وهميّة — منطقها لا يُختبر هنا.
 */
const get = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('@/lib/auth', () => ({ getUser: () => ({ id: 'u-1', role: 'admin' }) }));
vi.mock('@/lib/profile', () => ({ canHref: () => true }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'ar', t: (_k: string, f: string) => f }) }));
vi.mock('@/app/dashboard/reports/VesselProfitReport', () => ({ default: () => <div>vessel</div>, PELAGOS: {}, ALCUDIA: {}, POSEIDON: {} }));
vi.mock('@/app/dashboard/reports/LineProfitReport', () => ({ default: () => <div>line</div>, DALEELA_JS: {} }));
vi.mock('@/app/dashboard/reports/GubalProfitReport', () => ({ default: () => <div>gubal</div> }));
vi.mock('@/app/dashboard/reports/ExchangeRatesCard', () => ({ default: () => <div>fx</div> }));
vi.mock('@/app/dashboard/reports/FleetDashboard', () => ({ default: () => <div>fleet</div> }));

import ReportsPage from '@/app/dashboard/reports/page';

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/api/suppliers') return Promise.resolve({ data: SUPPLIERS });
    if (url === '/api/vessels') return Promise.resolve({ data: [] });
    const id = url.split('/').pop()!;
    return Promise.resolve({ data: STATEMENTS[id] });
  });
});

describe('الرابط المباشر', () => {
  it('?report=supplier-statement&suppliers=s1,s1,zz يفتح التقرير ويطلب s1 وحده', async () => {
    window.history.replaceState(null, '', '/dashboard/reports?report=supplier-statement&suppliers=s1,s1,zz&ccy=USD');
    render(<StrictMode><ReportsPage /></StrictMode>);
    await screen.findByRole('heading', { level: 1, name: 'كشف حساب مورد' });
    await screen.findByRole('heading', { name: 'Red Sea Marine' });
    const stmt = get.mock.calls.map((c) => c[0]).filter((u: string) => u.includes('/statement/'));
    expect(stmt).toEqual(['/api/invoices/statement/supplier/s1']);
    // الرابط يُعاد كتابته من المعاملات المسموحة وحدها
    expect(window.location.search).toBe('?report=supplier-statement&suppliers=s1&ccy=USD');
  });
  it('الرجوع يُعيد الدليل ويمسح الرابط', async () => {
    window.history.replaceState(null, '', '/dashboard/reports?report=due-alerts');
    render(<StrictMode><ReportsPage /></StrictMode>);
    await screen.findByRole('heading', { level: 1, name: 'تنبيهات الاستحقاق' });
    fireEvent.click(screen.getByRole('button', { name: 'رجوع لمركز التحليلات' }));
    await screen.findByRole('heading', { level: 1, name: 'مركز التحليلات' });
    expect(window.location.search).toBe('');
  });
  it('تقريرٌ مجهولٌ في الرابط يُتجاهَل', async () => {
    window.history.replaceState(null, '', '/dashboard/reports?report=../../etc');
    render(<StrictMode><ReportsPage /></StrictMode>);
    await screen.findByRole('heading', { level: 1, name: 'مركز التحليلات' });
  });
});
