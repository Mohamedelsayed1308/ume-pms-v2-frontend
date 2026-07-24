'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

// ── ثوابت ─────────────────────────────────────────────────────────────────
const GOOGLE_DRIVE_FILE_ID = ''; // سيُدخله المستخدم عند الحاجة

interface Period {
  id: string;
  period_name: string;
  date_from: string;
  date_to: string;
  poseidon_revenue: number; amal_revenue: number; daleela_revenue: number;
  poseidon_voyages: number; amal_voyages: number; daleela_voyages: number;
  poseidon_over_pax: number; amal_over_pax: number; daleela_over_pax: number;
  poseidon_rent: number; amal_rent: number; daleela_rent: number;
  cash_safaga_badawi: number; cash_safaga_ittihad: number;
  transfers_badawi: number; transfers_ittihad: number;
  ratio_badawi: number; ratio_ittihad: number;
  commission_rate: number; per_voyage_fee: number;
  balance_prev_badawi: number; balance_prev_ittihad: number;
  status: string; notes: string;
}

interface Calc {
  totalRevenue: number; totalVoyages: number; totalOverPax: number;
  totalRent: number; commission: number; netProfit: number;
  shareBadawi: number; shareIttihad: number;
  balanceBadawi: number; balanceIttihad: number;
}

const emptyForm = (): Omit<Period, 'id'> => ({
  period_name: '', date_from: '', date_to: '',
  poseidon_revenue: 0, amal_revenue: 0, daleela_revenue: 0,
  poseidon_voyages: 0, amal_voyages: 0, daleela_voyages: 0,
  poseidon_over_pax: 0, amal_over_pax: 0, daleela_over_pax: 0,
  poseidon_rent: 0, amal_rent: 0, daleela_rent: 0,
  cash_safaga_badawi: 0, cash_safaga_ittihad: 0,
  transfers_badawi: 0, transfers_ittihad: 0,
  ratio_badawi: 50, ratio_ittihad: 50,
  commission_rate: 6.5, per_voyage_fee: 500,
  balance_prev_badawi: 0, balance_prev_ittihad: 0,
  status: 'draft', notes: '',
});

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function calcLocal(f: Omit<Period, 'id'>): Calc {
  const n = (v: any) => Number(v) || 0;
  const totalRevenue = n(f.poseidon_revenue) + n(f.amal_revenue) + n(f.daleela_revenue);
  const totalVoyages = n(f.poseidon_voyages) + n(f.amal_voyages) + n(f.daleela_voyages);
  const totalOverPax = n(f.poseidon_over_pax) + n(f.amal_over_pax) + n(f.daleela_over_pax);
  const totalRent = n(f.poseidon_rent) + n(f.amal_rent) + n(f.daleela_rent);
  const commission = totalRevenue * (n(f.commission_rate) / 100) + totalVoyages * n(f.per_voyage_fee) + totalOverPax;
  const netProfit = totalRevenue - totalRent - commission;
  const shareBadawi = netProfit * (n(f.ratio_badawi) / 100);
  const shareIttihad = netProfit * (n(f.ratio_ittihad) / 100);
  const balanceBadawi = n(f.balance_prev_badawi) + shareBadawi - n(f.cash_safaga_badawi) - n(f.transfers_badawi);
  const balanceIttihad = n(f.balance_prev_ittihad) + shareIttihad - n(f.cash_safaga_ittihad) - n(f.transfers_ittihad);
  return { totalRevenue, totalVoyages, totalOverPax, totalRent, commission, netProfit, shareBadawi, shareIttihad, balanceBadawi, balanceIttihad };
}

export default function ProfitDistributionPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [driveId, setDriveId] = useState('');
  const [selected, setSelected] = useState<Period | null>(null);

  const load = useCallback(async () => {
    const res = await api.get('/api/profit-periods');
    setPeriods(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    const f = emptyForm();
    // رصيد متراكم من آخر فترة
    if (periods.length > 0) {
      const last = periods[0]; // مرتبة DESC
      const c = calcLocal(last as any);
      f.balance_prev_badawi = Math.round(c.balanceBadawi * 100) / 100;
      f.balance_prev_ittihad = Math.round(c.balanceIttihad * 100) / 100;
    }
    setForm(f);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Period) {
    setEditing(p);
    const { id, ...rest } = p;
    setForm(rest as any);
    setError('');
    setShowModal(true);
  }

  const set = (key: keyof Omit<Period, 'id'>, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setNum = (key: keyof Omit<Period, 'id'>, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val === '' ? 0 : parseFloat(val) || 0 }));

  async function fetchExcel() {
    if (!driveId) { alert('أدخل Google Drive File ID أولاً'); return; }
    if (!form.date_from || !form.date_to) { alert('أدخل الفترة الزمنية أولاً'); return; }
    setFetching(true);
    try {
      const res = await api.post('/api/profit-periods/fetch-excel', {
        file_id: driveId, date_from: form.date_from, date_to: form.date_to,
      });
      const d = res.data;
      setForm((prev) => ({
        ...prev,
        poseidon_revenue: d.poseidon?.revenue ?? prev.poseidon_revenue,
        poseidon_voyages: d.poseidon?.voyages ?? prev.poseidon_voyages,
        amal_revenue: d.amal?.revenue ?? prev.amal_revenue,
        amal_voyages: d.amal?.voyages ?? prev.amal_voyages,
        daleela_revenue: d.daleela?.revenue ?? prev.daleela_revenue,
        daleela_voyages: d.daleela?.voyages ?? prev.daleela_voyages,
      }));
    } catch (e: any) {
      alert('فشل جلب البيانات: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    if (!form.period_name || !form.date_from || !form.date_to) {
      setError('اسم الفترة والتواريخ مطلوبة');
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/api/profit-periods/${editing.id}`, form);
      } else {
        await api.post('/api/profit-periods', form);
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف "${name}"؟`)) return;
    await api.delete(`/api/profit-periods/${id}`);
    load();
  }

  const calc = calcLocal(form);

  // ── واجهة عرض التفاصيل ────────────────────────────────────────────────
  const detailCalc = selected ? calcLocal(selected as any) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">توزيع الأرباح الأسبوعي</h2>
        <button onClick={openAdd} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
          + فترة جديدة
        </button>
      </div>

      {/* قائمة الفترات */}
      <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">الفترة</th>
              <th className="px-4 py-3">من</th>
              <th className="px-4 py-3">إلى</th>
              <th className="px-4 py-3 text-left">إجمالي الإيراد</th>
              <th className="px-4 py-3 text-left">رصيد بدوي</th>
              <th className="px-4 py-3 text-left">رصيد الاتحاد</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const c = calcLocal(p as any);
              return (
                <tr key={p.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                  <td className="px-4 py-3 font-medium">{p.period_name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.date_from}</td>
                  <td className="px-4 py-3 text-gray-500">{p.date_to}</td>
                  <td className="px-4 py-3 text-left font-mono">{fmt(c.totalRevenue)}</td>
                  <td className={`px-4 py-3 text-left font-mono font-semibold ${c.balanceBadawi >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(c.balanceBadawi)}</td>
                  <td className={`px-4 py-3 text-left font-mono font-semibold ${c.balanceIttihad >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(c.balanceIttihad)}</td>
                  <td className="px-4 py-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                    <button onClick={() => handleDelete(p.id, p.period_name)} className="text-red-500 hover:underline text-xs">حذف</button>
                  </td>
                </tr>
              );
            })}
            {periods.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد فترات بعد</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* تفاصيل الفترة المختارة */}
      {selected && detailCalc && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h3 className="font-bold text-lg mb-4 text-emerald-700">{selected.period_name} — تفاصيل الحساب</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Poseidon', rev: selected.poseidon_revenue, voy: selected.poseidon_voyages },
              { label: 'Amal', rev: selected.amal_revenue, voy: selected.amal_voyages },
              { label: 'Daleela', rev: selected.daleela_revenue, voy: selected.daleela_voyages },
            ].map((v) => (
              <div key={v.label} className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">{v.label}</p>
                <p className="text-xl font-bold font-mono mt-1">${fmt(v.rev)}</p>
                <p className="text-sm text-gray-500">{v.voy} رحلة</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
            <DetailBox label="إجمالي الإيراد" value={`$${fmt(detailCalc.totalRevenue)}`} />
            <DetailBox label="إجمالي الإيجار" value={`$${fmt(detailCalc.totalRent)}`} color="red" />
            <DetailBox label="العمولة" value={`$${fmt(detailCalc.commission)}`} color="red" />
            <DetailBox label="صافي الربح" value={`$${fmt(detailCalc.netProfit)}`} color={detailCalc.netProfit >= 0 ? 'green' : 'red'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { name: 'بدوي', share: detailCalc.shareBadawi, cash: selected.cash_safaga_badawi, transfer: selected.transfers_badawi, prev: selected.balance_prev_badawi, balance: detailCalc.balanceBadawi },
              { name: 'الاتحاد', share: detailCalc.shareIttihad, cash: selected.cash_safaga_ittihad, transfer: selected.transfers_ittihad, prev: selected.balance_prev_ittihad, balance: detailCalc.balanceIttihad },
            ].map((co) => (
              <div key={co.name} className="border rounded-xl p-4">
                <p className="font-bold text-base mb-3">{co.name}</p>
                <div className="space-y-1 text-sm">
                  <Row label="رصيد سابق" val={`$${fmt(co.prev)}`} />
                  <Row label="حصة هذه الفترة" val={`$${fmt(co.share)}`} />
                  <Row label="كاش سفاجا" val={`-$${fmt(co.cash)}`} color="red" />
                  <Row label="تحويلات" val={`-$${fmt(co.transfer)}`} color="red" />
                  <div className="border-t pt-2 mt-2">
                    <Row label="الرصيد المتراكم" val={`$${fmt(co.balance)}`} bold color={co.balance >= 0 ? 'green' : 'red'} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl my-4">
            <h3 className="font-bold text-lg mb-4 text-emerald-700">{editing ? 'تعديل فترة' : 'فترة جديدة'}</h3>

            {/* بيانات أساسية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="md:col-span-1">
                <label className="block text-xs text-gray-500 mb-1">اسم الفترة *</label>
                <input value={form.period_name} onChange={(e) => set('period_name', e.target.value)}
                  placeholder="الأسبوع الأول - يوليو 2025"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">من *</label>
                <input type="date" value={form.date_from} onChange={(e) => set('date_from', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">إلى *</label>
                <input type="date" value={form.date_to} onChange={(e) => set('date_to', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            {/* جلب من Google Drive */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">جلب البيانات من Google Drive Excel</p>
              <div className="flex gap-2">
                <input value={driveId} onChange={(e) => setDriveId(e.target.value)}
                  placeholder="Google Drive File ID"
                  className="flex-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <button onClick={fetchExcel} disabled={fetching}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                  {fetching ? 'جاري الجلب...' : 'جلب تلقائي'}
                </button>
              </div>
            </div>

            {/* إيرادات العبارات */}
            <Section title="إيرادات العبارات">
              <VesselRow label="Poseidon"
                revenue={form.poseidon_revenue} onRev={(v) => setNum('poseidon_revenue', v)}
                voyages={form.poseidon_voyages} onVoy={(v) => setNum('poseidon_voyages', v)}
                overPax={form.poseidon_over_pax} onOver={(v) => setNum('poseidon_over_pax', v)} />
              <VesselRow label="Amal"
                revenue={form.amal_revenue} onRev={(v) => setNum('amal_revenue', v)}
                voyages={form.amal_voyages} onVoy={(v) => setNum('amal_voyages', v)}
                overPax={form.amal_over_pax} onOver={(v) => setNum('amal_over_pax', v)} />
              <VesselRow label="Daleela"
                revenue={form.daleela_revenue} onRev={(v) => setNum('daleela_revenue', v)}
                voyages={form.daleela_voyages} onVoy={(v) => setNum('daleela_voyages', v)}
                overPax={form.daleela_over_pax} onOver={(v) => setNum('daleela_over_pax', v)} />
            </Section>

            {/* إيجار العبارات */}
            <Section title="إيجار العبارات (يدوي)">
              <div className="grid grid-cols-3 gap-2">
                {(['poseidon', 'amal', 'daleela'] as const).map((v) => (
                  <div key={v}>
                    <label className="block text-xs text-gray-400 mb-1 capitalize">{v}</label>
                    <input type="number" value={form[`${v}_rent` as keyof typeof form] as number}
                      onChange={(e) => setNum(`${v}_rent` as any, e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  </div>
                ))}
              </div>
            </Section>

            {/* معاملات العمولة */}
            <Section title="معاملات العمولة">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">نسبة العمولة %</label>
                  <input type="number" step="0.1" value={form.commission_rate}
                    onChange={(e) => setNum('commission_rate', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رسوم الرحلة ($/voyage)</label>
                  <input type="number" value={form.per_voyage_fee}
                    onChange={(e) => setNum('per_voyage_fee', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* نسب التوزيع */}
            <Section title="نسب التوزيع">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">بدوي %</label>
                  <input type="number" step="0.1" value={form.ratio_badawi}
                    onChange={(e) => setNum('ratio_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">الاتحاد %</label>
                  <input type="number" step="0.1" value={form.ratio_ittihad}
                    onChange={(e) => setNum('ratio_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* الدفعات اليدوية */}
            <Section title="الدفعات المصروفة">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">كاش سفاجا — بدوي</label>
                  <input type="number" value={form.cash_safaga_badawi}
                    onChange={(e) => setNum('cash_safaga_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">كاش سفاجا — الاتحاد</label>
                  <input type="number" value={form.cash_safaga_ittihad}
                    onChange={(e) => setNum('cash_safaga_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تحويلات — بدوي</label>
                  <input type="number" value={form.transfers_badawi}
                    onChange={(e) => setNum('transfers_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تحويلات — الاتحاد</label>
                  <input type="number" value={form.transfers_ittihad}
                    onChange={(e) => setNum('transfers_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* رصيد سابق */}
            <Section title="رصيد مرحّل من الفترة السابقة">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رصيد بدوي السابق</label>
                  <input type="number" value={form.balance_prev_badawi}
                    onChange={(e) => setNum('balance_prev_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رصيد الاتحاد السابق</label>
                  <input type="number" value={form.balance_prev_ittihad}
                    onChange={(e) => setNum('balance_prev_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* معاينة الحساب */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-emerald-700 mb-2">معاينة الحساب</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <CalcItem label="إجمالي الإيراد" val={`$${fmt(calc.totalRevenue)}`} />
                <CalcItem label="صافي الربح" val={`$${fmt(calc.netProfit)}`} />
                <CalcItem label="حصة بدوي" val={`$${fmt(calc.shareBadawi)}`} color="blue" />
                <CalcItem label="حصة الاتحاد" val={`$${fmt(calc.shareIttihad)}`} color="blue" />
                <CalcItem label="رصيد بدوي" val={`$${fmt(calc.balanceBadawi)}`} color={calc.balanceBadawi >= 0 ? 'green' : 'red'} />
                <CalcItem label="رصيد الاتحاد" val={`$${fmt(calc.balanceIttihad)}`} color={calc.balanceIttihad >= 0 ? 'green' : 'red'} />
                <CalcItem label="العمولة" val={`$${fmt(calc.commission)}`} />
                <CalcItem label="الإيجار" val={`$${fmt(calc.totalRent)}`} />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── مكونات مساعدة ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b pb-1">{title}</p>
      {children}
    </div>
  );
}

function VesselRow({ label, revenue, onRev, voyages, onVoy, overPax, onOver }: {
  label: string; revenue: number; onRev: (v: string) => void;
  voyages: number; onVoy: (v: string) => void;
  overPax: number; onOver: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-2 items-center">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">إيراد $</label>
        <input type="number" value={revenue} onChange={(e) => onRev(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">رحلات</label>
        <input type="number" value={voyages} onChange={(e) => onVoy(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">Over Pax $</label>
        <input type="number" value={overPax} onChange={(e) => onOver(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
      </div>
    </div>
  );
}

function DetailBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-700' : 'text-gray-800';
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-bold font-mono text-sm mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function Row({ label, val, color, bold }: { label: string; val: string; color?: string; bold?: boolean }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-700' : 'text-gray-700';
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono ${bold ? 'font-bold' : ''} ${cls}`}>{val}</span>
    </div>
  );
}

function CalcItem({ label, val, color }: { label: string; val: string; color?: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : color === 'blue' ? 'text-blue-700' : 'text-gray-800';
  return (
    <div className="bg-white rounded p-2 border">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`font-bold font-mono ${cls}`}>{val}</p>
    </div>
  );
}
