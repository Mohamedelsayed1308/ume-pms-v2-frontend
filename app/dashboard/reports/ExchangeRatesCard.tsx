'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

// العملات المدعومة — القيمة = كم من العملة مقابل 1 دولار (1 USD = X)
const CURRENCIES = [
  { code: 'EGP', label: 'جنيه مصري' },
  { code: 'EUR', label: 'يورو' },
  { code: 'SAR', label: 'ريال سعودي' },
  { code: 'GBP', label: 'جنيه إسترليني' },
  { code: 'CHF', label: 'فرنك سويسري' },
  { code: 'AED', label: 'درهم إماراتي' },
];

// أسعار افتراضية تُستخدم لو شهر الفاتورة مش متسجّل (قابلة للتعديل عبر شهر 'default')
export const DEFAULT_RATES: Record<string, number> = { EGP: 50, EUR: 0.92, SAR: 3.75, GBP: 0.79, CHF: 0.88, AED: 3.675 };

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y}`; };
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function ExchangeRatesCard() {
  const [all, setAll] = useState<Record<string, Record<string, any>>>({});
  const [month, setMonth] = useState(nowMonth());
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [defRates, setDefRates] = useState<Record<string, string>>({});
  const [savingDef, setSavingDef] = useState(false);
  const [defMsg, setDefMsg] = useState('');

  useEffect(() => { api.get('/api/exchange-rates').then((r) => setAll(r.data || {})).catch(() => {}); }, []);

  useEffect(() => {
    const m = all[month] || {};
    const obj: Record<string, string> = {};
    CURRENCIES.forEach((c) => { obj[c.code] = m[c.code] != null ? String(m[c.code]) : ''; });
    setRates(obj);
  }, [month, all]);

  // الأسعار الافتراضية: من المحفوظ ('default') أو القيم المدمجة
  useEffect(() => {
    const d = all['default'] || {};
    const obj: Record<string, string> = {};
    CURRENCIES.forEach((c) => { obj[c.code] = d[c.code] != null ? String(d[c.code]) : String(DEFAULT_RATES[c.code] ?? ''); });
    setDefRates(obj);
  }, [all]);

  const savedMonths = useMemo(() => Object.keys(all).filter((k) => k !== 'default').sort().reverse(), [all]);

  async function saveDefaults() {
    setSavingDef(true); setDefMsg('');
    const payload: Record<string, number> = {};
    for (const c of CURRENCIES) { const v = parseFloat(defRates[c.code]); if (v > 0) payload[c.code] = v; }
    try {
      await api.put('/api/exchange-rates/default', { rates: payload });
      setAll((prev) => ({ ...prev, default: payload }));
      setDefMsg('تم الحفظ ✅'); setTimeout(() => setDefMsg(''), 2500);
    } catch { setDefMsg('فشل الحفظ'); }
    finally { setSavingDef(false); }
  }

  async function save() {
    setSaving(true); setMsg('');
    const payload: Record<string, number> = {};
    for (const c of CURRENCIES) { const v = parseFloat(rates[c.code]); if (v > 0) payload[c.code] = v; }
    try {
      await api.put(`/api/exchange-rates/${month}`, { rates: payload });
      setAll((prev) => ({ ...prev, [month]: payload }));
      setMsg('تم الحفظ ✅'); setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('فشل الحفظ'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* الأسعار الافتراضية */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="font-bold text-amber-800">⭐ الأسعار الافتراضية</h3>
          <div className="flex items-center gap-3">
            {defMsg && <span className="text-sm text-emerald-600 font-medium">{defMsg}</span>}
            <button onClick={saveDefaults} disabled={savingDef}
              className="bg-amber-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {savingDef ? '...' : '💾 حفظ الافتراضي'}
            </button>
          </div>
        </div>
        <p className="text-xs text-amber-700 mb-3">تُستخدم تلقائياً لأي فاتورة شهرها مش متسجّل — تقدر تعدّلها. (سعر الشهر المحدد بيغلب الافتراضي.)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {CURRENCIES.map((c) => (
            <div key={c.code} className="border border-amber-200 bg-white rounded-lg p-3">
              <label className="block text-xs text-gray-500 mb-1">{c.label} ({c.code})</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">1 USD =</span>
                <input inputMode="decimal" value={defRates[c.code] || ''} placeholder="0"
                  onChange={(e) => setDefRates((r) => ({ ...r, [c.code]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <span className="text-sm text-gray-500">{c.code}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">الشهر</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <p className="text-xs text-gray-400 mb-3">أدخل سعر كل عملة مقابل الدولار — القيمة = كم من العملة يساوي 1 دولار.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {CURRENCIES.map((c) => (
            <div key={c.code} className="border rounded-lg p-3">
              <label className="block text-xs text-gray-500 mb-1">{c.label} ({c.code})</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">1 USD =</span>
                <input inputMode="decimal" value={rates[c.code] || ''} placeholder="0"
                  onChange={(e) => setRates((r) => ({ ...r, [c.code]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-sm text-gray-500">{c.code}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} disabled={saving}
            className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : `💾 حفظ أسعار ${monthLabel(month)}`}
          </button>
          {msg && <span className="text-sm text-emerald-600 font-medium">{msg}</span>}
        </div>
      </div>

      {savedMonths.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
          <h3 className="font-bold text-gray-700 mb-3">الشهور المحفوظة</h3>
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-right py-1 px-2">الشهر</th>
                {CURRENCIES.map((c) => <th key={c.code} className="text-right py-1 px-2">{c.code}</th>)}
              </tr>
            </thead>
            <tbody>
              {savedMonths.map((m) => (
                <tr key={m} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setMonth(m)}>
                  <td className="py-1 px-2 font-medium">{monthLabel(m)}</td>
                  {CURRENCIES.map((c) => <td key={c.code} className="py-1 px-2">{all[m]?.[c.code] != null ? String(all[m][c.code]) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">اضغط على أي صف لتحميل شهره للتعديل.</p>
        </div>
      )}
    </div>
  );
}
