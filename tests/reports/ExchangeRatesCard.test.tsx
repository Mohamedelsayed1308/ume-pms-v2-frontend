import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/*
 * بطاقة الأسعار: الحفظ يرسل الأسعار كما قُرئت (base) فلا يضيع تحديثٌ متزامن، ولا تُحذف عملةٌ
 * أدخلتها شاشةٌ أخرى لأنّها ليست في قائمة البطاقة. والرفض (409) يُعيد التحميل ولا يُعلَن نجاحاً.
 */
const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), post: vi.fn() } }));
import ExchangeRatesCard, { mergeRates } from '@/app/dashboard/reports/ExchangeRatesCard';

const CODES = ['EGP', 'EUR', 'SAR', 'GBP', 'CHF', 'AED'];
const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

beforeEach(() => { get.mockReset(); put.mockReset(); });

describe('mergeRates', () => {
  it('عملةٌ خارج قائمة البطاقة تبقى، والحقل الفارغ يحذف عملته', () => {
    expect(mergeRates({ EGP: 50, EUR: 0.854700854700855, NOK: 10.5 }, { EGP: '', EUR: '0.854700854700855' }, CODES))
      .toEqual({ EUR: 0.854700854700855, NOK: 10.5 });
  });
  it('القيمة غير المعدَّلة تعود كما قُرئت بلا فقد دقّة', () => {
    const v = 1 / 1.17;
    expect(mergeRates({ EUR: v }, { EUR: String(v) }, CODES).EUR).toBe(v);
  });
});

describe('بطاقة الأسعار', () => {
  it('الحفظ يرسل base كما قُرئت ويُبقي العملة الخارجيّة', async () => {
    get.mockResolvedValue({ data: { [month]: { EUR: 0.85, NOK: 10.5 } } });
    put.mockResolvedValue({ data: { rates: { EUR: 0.86, NOK: 10.5 } } });
    render(<ExchangeRatesCard />);
    const eur = await screen.findByDisplayValue('0.85');
    fireEvent.change(eur, { target: { value: '0.86' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ أسعار/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(`/api/exchange-rates/${month}`, { rates: { EUR: 0.86, NOK: 10.5 }, base: { EUR: 0.85, NOK: 10.5 } });
    expect(await screen.findByText('تم الحفظ ✅')).toBeTruthy();
  });

  it('409: رسالةٌ صريحة وإعادة تحميل — لا «تم الحفظ»', async () => {
    get.mockResolvedValueOnce({ data: { [month]: { EUR: 0.85 } } }).mockResolvedValueOnce({ data: { [month]: { EUR: 0.85, EGP: 48 } } });
    put.mockRejectedValue({ response: { status: 409 } });
    render(<ExchangeRatesCard />);
    await screen.findByDisplayValue('0.85');
    fireEvent.click(screen.getByRole('button', { name: /حفظ أسعار/ }));
    expect(await screen.findByText(/تغيّرت أسعار هذا الشهر منذ فتحتَها/)).toBeTruthy();
    expect(screen.queryByText('تم الحفظ ✅')).toBeNull();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue('48')).toBeTruthy();
  });
});
