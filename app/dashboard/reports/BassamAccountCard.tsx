'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y}`; };
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

interface Transfer { month: string; date: string; amount: string; note: string }
interface Account { opening0: string; add: Record<string, string>; transfers: Transfer[] }

export default function BassamAccountCard() {
  const [liqByMonth, setLiqByMonth] = useState<Record<string, number>>({});
  const [acc, setAcc] = useState<Account>({ opening0: '', add: {}, transfers: [] });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // سيولة البسّام لكل شهر من بيانات الكوديا المحفوظة (مجموع عمود O لكل شهر)
    api.get('/api/vessel-profit/Alcudia').then((res) => {
      const voyages = res.data?.voyages;
      if (Array.isArray(voyages)) {
        const m: Record<string, number> = {};
        for (const v of voyages) { if (v.month) m[v.month] = (m[v.month] || 0) + (Number(v.O) || 0); }
        setLiqByMonth(m);
      }
    }).catch(() => {}).finally(() => setLoaded(true));
    // بيانات حساب البسّام المحفوظة
    api.get('/api/vessel-profit/BassamAccount').then((res) => {
      const man = res.data?.manual;
      if (man && typeof man === 'object') setAcc({ opening0: man.opening0 || '', add: man.add || {}, transfers: Array.isArray(man.transfers) ? man.transfers : [] });
    }).catch(() => {});
  }, []);

  const months = useMemo(() => [...new Set(Object.keys(liqByMonth))].sort(), [liqByMonth]);

  const rows = useMemo(() => {
    let prevClosing = 0;
    return months.map((m, i) => {
      const opening = i === 0 ? (parseFloat(acc.opening0) || 0) : prevClosing;
      const liq = liqByMonth[m] || 0;
      const additions = parseFloat(acc.add[m] || '') || 0;
      const transfersOut = acc.transfers.filter((t) => t.month === m).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const closing = opening + liq + additions - transfersOut;
      prevClosing = closing;
      return { m, opening, liq, additions, transfersOut, closing };
    });
  }, [months, liqByMonth, acc]);

  const currentBalance = rows.length ? rows[rows.length - 1].closing : (parseFloat(acc.opening0) || 0);
  const totalTransfers = acc.transfers.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  const setAdd = (m: string, v: string) => setAcc((a) => ({ ...a, add: { ...a.add, [m]: v } }));
  const addTransfer = () => setAcc((a) => ({ ...a, transfers: [...a.transfers, { month: months[months.length - 1] || '', date: '', amount: '', note: '' }] }));
  const setTransfer = (idx: number, patch: Partial<Transfer>) => setAcc((a) => ({ ...a, transfers: a.transfers.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  const removeTransfer = (idx: number) => setAcc((a) => ({ ...a, transfers: a.transfers.filter((_, i) => i !== idx) }));

  async function save() {
    setSaving(true); setSavedMsg('');
    try {
      await api.put('/api/vessel-profit/BassamAccount', { manual: acc });
      setSavedMsg('تم الحفظ ✅'); setTimeout(() => setSavedMsg(''), 2500);
    } catch { setSavedMsg('فشل الحفظ'); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-sm text-gray-600 mb-1">رصيد افتتاحي (أول شهر)</label>
          <input inputMode="decimal" value={acc.opening0} onChange={(e) => setAcc((a) => ({ ...a, opening0: e.target.value }))}
            placeholder="0" className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="mr-auto flex items-center gap-3">
          {savedMsg && <span className="text-sm text-emerald-600 font-medium">{savedMsg}</span>}
          <div className="text-right">
            <p className="text-xs text-gray-500">الرصيد الحالي عند البسّام</p>
            <p className="text-2xl font-bold text-indigo-700">{fmt(currentBalance)}</p>
          </div>
          <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : '💾 حفظ'}
          </button>
        </div>
      </div>

      {loaded && months.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          مفيش بيانات سيولة — احفظ بيانات مركب الكوديا الأول (كارت ربح Alcudia) عشان السيولة الشهرية تظهر هنا، أو أضف القيم يدوياً كإضافات.
        </div>
      )}

      {/* الكشف الشهري */}
      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="font-bold text-gray-700 mb-3">📒 كشف حساب وكيل البسّام (شهري)</h3>
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th className="text-right py-2 px-2">الشهر</th>
              <th className="text-right py-2 px-2">رصيد أول المدة</th>
              <th className="text-right py-2 px-2">+ سيولة البسّام</th>
              <th className="text-right py-2 px-2">+ إضافات يدوية</th>
              <th className="text-right py-2 px-2">− تحويلات لك</th>
              <th className="text-right py-2 px-2">= رصيد آخر المدة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m} className="border-t">
                <td className="py-1.5 px-2 font-medium">{monthLabel(r.m)}</td>
                <td className="py-1.5 px-2 text-gray-500">{fmt(r.opening)}</td>
                <td className="py-1.5 px-2 text-emerald-700">{fmt(r.liq)}</td>
                <td className="py-1.5 px-2">
                  <input inputMode="decimal" value={acc.add[r.m] || ''} onChange={(e) => setAdd(r.m, e.target.value)}
                    placeholder="0" className="w-28 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </td>
                <td className="py-1.5 px-2 text-red-600">{r.transfersOut ? fmt(r.transfersOut) : '—'}</td>
                <td className="py-1.5 px-2 font-bold text-indigo-800">{fmt(r.closing)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">لا توجد شهور</td></tr>}
          </tbody>
        </table>
      </div>

      {/* التحويلات */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">💸 التحويلات المستلمة من البسّام <span className="text-xs text-gray-400 font-normal">(الإجمالي: {fmt(totalTransfers)})</span></h3>
          <button onClick={addTransfer} disabled={!months.length} className="bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">➕ إضافة تحويل</button>
        </div>
        {acc.transfers.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد تحويلات — اضغط «إضافة تحويل».</p>
        ) : (
          <div className="space-y-2">
            {acc.transfers.map((t, idx) => (
              <div key={idx} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center border rounded-lg p-2">
                <select value={t.month} onChange={(e) => setTransfer(idx, { month: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">— الشهر —</option>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
                <input type="date" value={t.date} onChange={(e) => setTransfer(idx, { date: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
                <input inputMode="decimal" placeholder="المبلغ" value={t.amount} onChange={(e) => setTransfer(idx, { amount: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex items-center gap-2">
                  <input placeholder="ملاحظة" value={t.note} onChange={(e) => setTransfer(idx, { note: e.target.value })} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                  <button onClick={() => removeTransfer(idx)} className="text-red-400 hover:text-red-600 px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
