'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';

interface Period {
  id: string;
  period_name: string;
  date_from: string;
  date_to: string;
  poseidon_revenue: number; amal_revenue: number; daleela_revenue: number;
  poseidon_voyages: number; amal_voyages: number; daleela_voyages: number;
  poseidon_over_pax: number; amal_over_pax: number; daleela_over_pax: number;
  bunker_badawi: number; bunker_ittihad: number;
  poseidon_rent: number; amal_rent: number; daleela_rent: number;
  commission_amount: number;
  cash_safaga_badawi: number; cash_safaga_ittihad: number;
  transfers_badawi: number; transfers_ittihad: number;
  ratio_badawi: number; ratio_ittihad: number;
  commission_rate: number; per_voyage_fee: number;
  balance_prev_badawi: number; balance_prev_ittihad: number;
  status: string; notes: string;
}

interface Calc {
  totalRevenue: number; totalRent: number; totalCommission: number;
  netForDistribution: number;
  distributionBadawi: number; distributionIttihad: number;
  overPaxBadawi: number; overPaxIttihad: number;
  activityBadawi: number; activityIttihad: number;
  balanceBadawi: number; balanceIttihad: number;
  days: number; poseidonRent: number; amalRent: number; daleelaRent: number;
}

const emptyForm = (): Omit<Period, 'id'> => ({
  period_name: '', date_from: '', date_to: '',
  poseidon_revenue: 0, amal_revenue: 0, daleela_revenue: 0,
  poseidon_voyages: 0, amal_voyages: 0, daleela_voyages: 0,
  poseidon_over_pax: 0, amal_over_pax: 0, daleela_over_pax: 0,
  bunker_badawi: 0, bunker_ittihad: 0,
  poseidon_rent: 0, amal_rent: 0, daleela_rent: 0,
  commission_amount: 0,
  cash_safaga_badawi: 0, cash_safaga_ittihad: 0,
  transfers_badawi: 0, transfers_ittihad: 0,
  ratio_badawi: 50, ratio_ittihad: 50,
  commission_rate: 6.5, per_voyage_fee: 0,
  balance_prev_badawi: 0, balance_prev_ittihad: 0,
  status: 'draft', notes: '',
});

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const r2 = (n: any): number => {
  const num = parseFloat(String(n ?? 0));
  return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
};

const DAILY_RATES = { poseidon: 14000, amal: 13000, daleela: 12000 };

function calcRent(f: Pick<Omit<Period,'id'>, 'date_from'|'date_to'|'daleela_revenue'>) {
  const days = f.date_from && f.date_to
    ? Math.max(0, Math.round((new Date(f.date_to).getTime() - new Date(f.date_from).getTime()) / 86400000) + 1)
    : 0;
  const poseidon = days * DAILY_RATES.poseidon;
  const amal     = days * DAILY_RATES.amal;
  const daleela  = Number(f.daleela_revenue) > 0 ? days * DAILY_RATES.daleela : 0;
  return { days, poseidon, amal, daleela, total: poseidon + amal + daleela };
}

function calcLocal(f: Omit<Period, 'id'>): Calc {
  const n = (v: any) => Number(v) || 0;
  const rent = calcRent(f);

  // الإيراد من الشيت يتضمن Over Pax — لا يُضاف مرة ثانية
  const totalRevenue = n(f.poseidon_revenue) + n(f.amal_revenue) + n(f.daleela_revenue);
  const totalRent    = rent.total;
  const totalCommission = n(f.commission_amount);

  // توزيع النسب = (إيراد - إيجار) × ratio%
  const netForDistribution = totalRevenue - totalRent;
  const distributionBadawi  = netForDistribution * (n(f.ratio_badawi)  / 100);
  const distributionIttihad = netForDistribution * (n(f.ratio_ittihad) / 100);

  // توزيع Over Pax: بدوي=66.67% Poseidon + 33.33% Daleela
  const overPaxBadawi  = n(f.poseidon_over_pax) * (2/3) + n(f.daleela_over_pax) * (1/3);
  const overPaxIttihad = n(f.poseidon_over_pax) * (1/3) + n(f.amal_over_pax) + n(f.daleela_over_pax) * (2/3);

  // نتيجة نشاط = توزيع - كاش + overPax + إيجار العبارة + بنكر
  const activityBadawi  = distributionBadawi  - n(f.cash_safaga_badawi)  + overPaxBadawi  + rent.poseidon + n(f.bunker_badawi);
  const activityIttihad = distributionIttihad - n(f.cash_safaga_ittihad) + overPaxIttihad + rent.amal + rent.daleela + n(f.bunker_ittihad);

  const balanceBadawi  = n(f.balance_prev_badawi)  + activityBadawi  - n(f.transfers_badawi);
  const balanceIttihad = n(f.balance_prev_ittihad) + activityIttihad - n(f.transfers_ittihad);

  return {
    totalRevenue, totalRent, totalCommission,
    netForDistribution,
    distributionBadawi, distributionIttihad,
    overPaxBadawi, overPaxIttihad,
    activityBadawi, activityIttihad,
    balanceBadawi, balanceIttihad,
    days: rent.days, poseidonRent: rent.poseidon, amalRent: rent.amal, daleelaRent: rent.daleela,
  };
}

export default function ProfitDistributionPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [driveId, setDriveId] = useState('1xBNKsoDdlh2q6uEoKNEf49Q3UdIR6cJz');
  const [selected, setSelected] = useState<Period | null>(null);
  const [voyageFrom, setVoyageFrom] = useState('');
  const [voyageTo, setVoyageTo] = useState('');
  const [fetchingVoyage, setFetchingVoyage] = useState(false);
  const [confirmedVoyFrom, setConfirmedVoyFrom] = useState<number | null>(null);
  const [confirmedVoyTo, setConfirmedVoyTo] = useState<number | null>(null);

  // التحميل حالة ثالثة — «لا توجد فترات» أثناء الجلب نفيٌ قاطع في غير موضعه.
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get('/api/profit-periods');
      setPeriods(Array.isArray(res.data) ? res.data : []);
      setListError('');
    } catch {
      setListError('تعذّر تحميل فترات التوزيع — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    const f = emptyForm();
    if (periods.length > 0) {
      const last = periods[0];
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
    setForm((prev) => ({ ...prev, [key]: val === '' ? 0 : parseFloat(val.replace(/,/g, '')) || 0 }));

  async function fetchVoyageDates() {
    if (!voyageFrom || !voyageTo) { alert('أدخل أرقام الرحلات'); return; }
    setFetchingVoyage(true);
    try {
      const res = await api.get('/api/profit-periods/voyage-dates', {
        params: { from: voyageFrom, to: voyageTo },
      });
      if (res.data.error) { alert(res.data.error); return; }
      setForm((prev) => ({ ...prev, date_from: res.data.date_from, date_to: res.data.date_to }));
      setConfirmedVoyFrom(res.data.voy_from ?? Number(voyageFrom));
      setConfirmedVoyTo(res.data.voy_to ?? Number(voyageTo));
    } catch (e: any) {
      alert('خطأ: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setFetchingVoyage(false);
    }
  }

  async function fetchExcel() {
    if (!form.date_from || !form.date_to) { alert('أدخل الفترة الزمنية أولاً'); return; }
    setFetching(true);
    try {
      const res = await api.post('/api/profit-periods/fetch-excel', {
        file_id: driveId, date_from: form.date_from, date_to: form.date_to,
        ...(confirmedVoyFrom != null && confirmedVoyTo != null
          ? { voy_from: confirmedVoyFrom, voy_to: confirmedVoyTo }
          : {}),
      });
      const d = res.data;
      setForm((prev) => ({
        ...prev,
        poseidon_revenue: d.poseidon?.revenue ?? prev.poseidon_revenue,
        poseidon_voyages: d.poseidon?.voyages ?? prev.poseidon_voyages,
        amal_revenue:     d.amal?.revenue     ?? prev.amal_revenue,
        amal_voyages:     d.amal?.voyages     ?? prev.amal_voyages,
        daleela_revenue:  d.daleela?.revenue  ?? prev.daleela_revenue,
        daleela_voyages:  d.daleela?.voyages  ?? prev.daleela_voyages,
        commission_amount:
          (d.poseidon?.commission ?? 0) + (d.amal?.commission ?? 0) + (d.daleela?.commission ?? 0),
        cash_safaga_badawi:  d.poseidon?.cash_safaga ?? prev.cash_safaga_badawi,
        cash_safaga_ittihad: (d.amal?.cash_safaga ?? 0) + (d.daleela?.cash_safaga ?? 0),
        bunker_badawi:   d.poseidon?.bunker ?? prev.bunker_badawi,
        bunker_ittihad:  (d.amal?.bunker ?? 0) + (d.daleela?.bunker ?? 0),
        per_voyage_fee: 0,
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
            {listLoading && periods.length === 0 && (
              <tr><td colSpan={7} className="py-3"><TableSkeleton rows={4} cols={7} /></td></tr>
            )}
            {!listLoading && listError && (
              <tr><td colSpan={7} className="text-center py-8 text-red-600 text-sm">{listError}</td></tr>
            )}
            {!listLoading && !listError && periods.length === 0 && (
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
              { label: 'Poseidon', rev: selected.poseidon_revenue, voy: selected.poseidon_voyages, op: selected.poseidon_over_pax },
              { label: 'Amal',     rev: selected.amal_revenue,     voy: selected.amal_voyages,     op: selected.amal_over_pax },
              { label: 'Daleela',  rev: selected.daleela_revenue,  voy: selected.daleela_voyages,  op: selected.daleela_over_pax },
            ].map((v) => (
              <div key={v.label} className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">{v.label}</p>
                <p className="text-xl font-bold font-mono mt-1">${fmt(v.rev)}</p>
                <p className="text-sm text-gray-500">{v.voy} رحلة</p>
                {v.op > 0 && <p className="text-xs text-amber-600 font-mono">Over Pax: ${fmt(v.op)}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
            <DetailBox label="إجمالي الإيراد" value={`$${fmt(detailCalc.totalRevenue)}`} />
            <DetailBox label="إجمالي الإيجار" value={`$${fmt(detailCalc.totalRent)}`} color="red" />
            <DetailBox label="العمولة (للعرض)" value={`$${fmt(detailCalc.totalCommission)}`} />
            <DetailBox label="أساس التوزيع" value={`$${fmt(detailCalc.netForDistribution)}`} color={detailCalc.netForDistribution >= 0 ? 'green' : 'red'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                name: 'بدوي (بوسيدون)',
                dist: detailCalc.distributionBadawi,
                rent: detailCalc.poseidonRent,
                overPax: detailCalc.overPaxBadawi,
                bunker: selected.bunker_badawi,
                cash: selected.cash_safaga_badawi,
                transfer: selected.transfers_badawi,
                prev: selected.balance_prev_badawi,
                activity: detailCalc.activityBadawi,
                balance: detailCalc.balanceBadawi,
              },
              {
                name: 'الاتحاد (امل + دليلة)',
                dist: detailCalc.distributionIttihad,
                rent: detailCalc.amalRent + detailCalc.daleelaRent,
                overPax: detailCalc.overPaxIttihad,
                bunker: selected.bunker_ittihad,
                cash: selected.cash_safaga_ittihad,
                transfer: selected.transfers_ittihad,
                prev: selected.balance_prev_ittihad,
                activity: detailCalc.activityIttihad,
                balance: detailCalc.balanceIttihad,
              },
            ].map((co) => (
              <div key={co.name} className="border rounded-xl p-4">
                <p className="font-bold text-base mb-3">{co.name}</p>
                <div className="space-y-1 text-sm">
                  <Row label="رصيد سابق" val={`$${fmt(co.prev)}`} />
                  <Row label="توزيع النسب" val={`$${fmt(co.dist)}`} />
                  <Row label="كاش سفاجا" val={`-$${fmt(co.cash)}`} color="red" />
                  <Row label="Over Pax" val={`+$${fmt(co.overPax)}`} color="amber" />
                  <Row label="إيجار العبارات" val={`+$${fmt(co.rent)}`} color="green" />
                  <Row label="بنكر" val={`+$${fmt(co.bunker)}`} color="green" />
                  <Row label="نتيجة النشاط" val={`$${fmt(co.activity)}`} bold />
                  <Row label="تحويلات" val={`-$${fmt(co.transfer)}`} color="red" />
                  <div className="border-t pt-2 mt-2">
                    <Row label="الرصيد المرحّل" val={`$${fmt(co.balance)}`} bold color={co.balance >= 0 ? 'green' : 'red'} />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
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

            {/* مساعد رقم الرحلة */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-amber-700 mb-2">تحديد التواريخ من رقم الرحلة — Poseidon (اختياري)</p>
              <div className="flex gap-2 items-end flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">من رحلة رقم</label>
                  <input type="number" value={voyageFrom} onChange={(e) => setVoyageFrom(e.target.value)}
                    placeholder="60" className="w-24 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">إلى رحلة رقم</label>
                  <input type="number" value={voyageTo} onChange={(e) => setVoyageTo(e.target.value)}
                    placeholder="64" className="w-24 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </div>
                <button onClick={fetchVoyageDates} disabled={fetchingVoyage}
                  className="bg-amber-500 text-white px-3 py-1.5 rounded text-xs hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap">
                  {fetchingVoyage ? 'جاري...' : 'تطبيق التواريخ تلقائياً'}
                </button>
                {form.date_from && form.date_to && (
                  <span className="text-xs text-amber-700 font-mono">{form.date_from} → {form.date_to}</span>
                )}
              </div>
            </div>

            {/* جلب من Google Drive */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">جلب البيانات من Google Drive Excel (إيراد + عمولة + كاش + بنكر)</p>
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
            <Section title="إيرادات العبارات (Over Pax يدوي — يُوزَّع 66.67%/33.33%)">
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

            {/* بنكر */}
            <Section title="بنكر (مجلوب تلقائياً من الشيت — يمكن التعديل)">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">بنكر بدوي (Poseidon — عمود Z)</label>
                  <input type="text" value={fmt(form.bunker_badawi)}
                    onChange={(e) => setNum('bunker_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">بنكر الاتحاد (Amal+Daleela — عمود W)</label>
                  <input type="text" value={fmt(form.bunker_ittihad)}
                    onChange={(e) => setNum('bunker_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono" />
                </div>
              </div>
            </Section>

            {/* إيجار العبارات — تلقائي */}
            {(() => {
              const r = calcRent(form);
              return (
                <Section title={`إيجار العبارات — تلقائي (${r.days} يوم)`}>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Poseidon', rate: DAILY_RATES.poseidon, val: r.poseidon },
                      { label: 'Amal',     rate: DAILY_RATES.amal,     val: r.amal },
                      { label: 'Daleela',  rate: DAILY_RATES.daleela,  val: r.daleela, note: Number(form.daleela_revenue) === 0 ? '(لا إيراد)' : '' },
                    ].map(({ label, rate, val, note }) => (
                      <div key={label} className="bg-gray-50 rounded p-2 text-center">
                        <p className="text-xs text-gray-400 font-semibold">{label}</p>
                        <p className="text-xs text-gray-400">${rate.toLocaleString()}/يوم</p>
                        <p className="font-mono font-bold text-sm text-gray-700">${fmt(val)}</p>
                        {note && <p className="text-xs text-orange-500">{note}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-left">الإجمالي: <span className="font-bold font-mono">${fmt(r.total)}</span></p>
                </Section>
              );
            })()}

            {/* العمولة */}
            <Section title="العمولة الإجمالية">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  العمولة $ — تُجلب تلقائياً من الشيت (للعرض فقط — لا تؤثر على التوزيع)
                </label>
                <input type="text" value={fmt(form.commission_amount)}
                  onChange={(e) => setNum('commission_amount', e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono" />
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
                  <input type="text" value={fmt(form.cash_safaga_badawi)}
                    onChange={(e) => setNum('cash_safaga_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">كاش سفاجا — الاتحاد</label>
                  <input type="text" value={fmt(form.cash_safaga_ittihad)}
                    onChange={(e) => setNum('cash_safaga_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تحويلات — بدوي</label>
                  <input type="text" value={fmt(form.transfers_badawi)}
                    onChange={(e) => setNum('transfers_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تحويلات — الاتحاد</label>
                  <input type="text" value={fmt(form.transfers_ittihad)}
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
                  <input type="text" value={fmt(form.balance_prev_badawi)}
                    onChange={(e) => setNum('balance_prev_badawi', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رصيد الاتحاد السابق</label>
                  <input type="text" value={fmt(form.balance_prev_ittihad)}
                    onChange={(e) => setNum('balance_prev_ittihad', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* معاينة الحساب الكاملة */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-emerald-700 mb-3">معاينة الحساب</p>

              {/* صف الإيراد والإيجار */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <CalcItem label="إجمالي الإيراد" val={`$${fmt(calc.totalRevenue)}`} />
                <CalcItem label="إجمالي الإيجار" val={`$${fmt(calc.totalRent)}`} color="red" />
                <CalcItem label="أساس التوزيع" val={`$${fmt(calc.netForDistribution)}`} />
              </div>

              {/* Over Pax — نسب التوزيع */}
              {(Number(form.poseidon_over_pax) > 0 || Number(form.amal_over_pax) > 0 || Number(form.daleela_over_pax) > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3 text-xs">
                  <p className="font-semibold text-amber-700 mb-1">توزيع Over Pax</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-amber-600 font-medium">بدوي</p>
                      {Number(form.poseidon_over_pax) > 0 && <p>Poseidon × 66.67% = <span className="font-mono">${fmt(Number(form.poseidon_over_pax) * 2/3)}</span></p>}
                      {Number(form.daleela_over_pax)  > 0 && <p>Daleela × 33.33% = <span className="font-mono">${fmt(Number(form.daleela_over_pax)  * 1/3)}</span></p>}
                      <p className="font-bold border-t mt-1 pt-1">= ${fmt(calc.overPaxBadawi)}</p>
                    </div>
                    <div>
                      <p className="text-amber-600 font-medium">الاتحاد</p>
                      {Number(form.poseidon_over_pax) > 0 && <p>Poseidon × 33.33% = <span className="font-mono">${fmt(Number(form.poseidon_over_pax) * 1/3)}</span></p>}
                      {Number(form.amal_over_pax)     > 0 && <p>Amal × 100% = <span className="font-mono">${fmt(Number(form.amal_over_pax))}</span></p>}
                      {Number(form.daleela_over_pax)  > 0 && <p>Daleela × 66.67% = <span className="font-mono">${fmt(Number(form.daleela_over_pax) * 2/3)}</span></p>}
                      <p className="font-bold border-t mt-1 pt-1">= ${fmt(calc.overPaxIttihad)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* الحساب التفصيلي لكل طرف */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  {
                    name: 'بدوي', color: 'text-blue-700',
                    rows: [
                      { label: `توزيع (${form.ratio_badawi}%)`, val: calc.distributionBadawi, sign: '' },
                      { label: 'كاش سفاجا', val: -Number(form.cash_safaga_badawi), sign: '-', color: 'text-red-500' },
                      { label: 'Over Pax', val: calc.overPaxBadawi, sign: '+', color: 'text-amber-600', hide: calc.overPaxBadawi === 0 },
                      { label: 'إيجار Poseidon', val: calc.poseidonRent, sign: '+', color: 'text-emerald-600' },
                      { label: 'بنكر', val: Number(form.bunker_badawi), sign: '+', color: 'text-emerald-600', hide: Number(form.bunker_badawi) === 0 },
                    ],
                    activity: calc.activityBadawi,
                    transfer: Number(form.transfers_badawi),
                    prev: Number(form.balance_prev_badawi),
                    balance: calc.balanceBadawi,
                  },
                  {
                    name: 'الاتحاد', color: 'text-purple-700',
                    rows: [
                      { label: `توزيع (${form.ratio_ittihad}%)`, val: calc.distributionIttihad, sign: '' },
                      { label: 'كاش سفاجا', val: -Number(form.cash_safaga_ittihad), sign: '-', color: 'text-red-500' },
                      { label: 'Over Pax', val: calc.overPaxIttihad, sign: '+', color: 'text-amber-600', hide: calc.overPaxIttihad === 0 },
                      { label: 'إيجار Amal+Daleela', val: calc.amalRent + calc.daleelaRent, sign: '+', color: 'text-emerald-600' },
                      { label: 'بنكر', val: Number(form.bunker_ittihad), sign: '+', color: 'text-emerald-600', hide: Number(form.bunker_ittihad) === 0 },
                    ],
                    activity: calc.activityIttihad,
                    transfer: Number(form.transfers_ittihad),
                    prev: Number(form.balance_prev_ittihad),
                    balance: calc.balanceIttihad,
                  },
                ].map((side) => (
                  <div key={side.name} className="bg-white rounded border p-2 space-y-0.5">
                    <p className={`font-bold text-sm mb-1 ${side.color}`}>{side.name}</p>
                    {side.rows.filter(r => !r.hide).map((r, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-500">{r.sign} {r.label}</span>
                        <span className={`font-mono ${r.color || 'text-gray-700'}`}>${fmt(Math.abs(r.val))}</span>
                      </div>
                    ))}
                    <div className="border-t pt-1 flex justify-between font-semibold">
                      <span>نتيجة النشاط</span>
                      <span className={`font-mono ${side.color}`}>${fmt(side.activity)}</span>
                    </div>
                    {side.transfer > 0 && (
                      <div className="flex justify-between text-red-500">
                        <span>- تحويلات</span>
                        <span className="font-mono">${fmt(side.transfer)}</span>
                      </div>
                    )}
                    {side.prev !== 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>+ رصيد سابق</span>
                        <span className="font-mono">${fmt(side.prev)}</span>
                      </div>
                    )}
                    <div className={`border-t pt-1 flex justify-between font-bold text-sm ${side.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      <span>الرصيد</span>
                      <span className="font-mono">${fmt(side.balance)}</span>
                    </div>
                  </div>
                ))}
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
        <input type="text" value={fmt(revenue)} onChange={(e) => onRev(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">رحلات</label>
        <input type="number" value={voyages} onChange={(e) => onVoy(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">Over Pax $ (يدوي)</label>
        <input type="text" value={fmt(overPax)} onChange={(e) => onOver(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
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
  const cls = color === 'red' ? 'text-red-600'
    : color === 'green' ? 'text-emerald-700'
    : color === 'amber' ? 'text-amber-600'
    : 'text-gray-700';
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono ${bold ? 'font-bold' : ''} ${cls}`}>{val}</span>
    </div>
  );
}

function CalcItem({ label, val, color }: { label: string; val: string; color?: string }) {
  const cls = color === 'red' ? 'text-red-600'
    : color === 'green' ? 'text-emerald-600'
    : color === 'blue' ? 'text-blue-700'
    : color === 'amber' ? 'text-amber-600'
    : 'text-gray-800';
  return (
    <div className="bg-white rounded p-2 border">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`font-bold font-mono ${cls}`}>{val}</p>
    </div>
  );
}
