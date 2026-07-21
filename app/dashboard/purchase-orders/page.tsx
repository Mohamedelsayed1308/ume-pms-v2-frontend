'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import * as XLSX from 'xlsx';

interface PO {
  id: string;
  po_number: string;
  description: string;
  order_date: string;
  supplier: { id: string; name: string };
  vessel: { id: string; name: string };
}

const empty = { po_number: '', supplier_id: '', vessel_id: '', description: '', order_date: '' };

const VESSEL_PREFIX: Record<string, string> = {
  'Alcudia Express': '06',
  'Bridge': '07',
  'Gubal Trader': '04',
  'Monte Express': '08',
  'Poseidon Express': '01',
  'Wasa Express': '05',
};

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [posRes, supRes, vesRes] = await Promise.all([
      api.get('/api/purchase-orders'),
      api.get('/api/suppliers'),
      api.get('/api/vessels'),
    ]);
    setPos(posRes.data);
    setSuppliers(supRes.data);
    setVessels(vesRes.data);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setError('');
    setShowModal(true);
  }

  function openEdit(po: PO) {
    setEditing(po);
    setForm({
      po_number: po.po_number,
      supplier_id: po.supplier?.id || '',
      vessel_id: po.vessel?.id || '',
      description: po.description || '',
      order_date: po.order_date?.slice(0, 10) || '',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.po_number.trim()) { setError('رقم أمر الشراء مطلوب'); return; }
    if (!form.supplier_id) { setError('المورد مطلوب'); return; }
    if (!form.vessel_id) { setError('السفينة مطلوبة'); return; }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/api/purchase-orders/${editing.id}`, form);
      } else {
        await api.post('/api/purchase-orders', form);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  function exportToExcel() {
    const rows = pos.map((po) => ({
      'رقم الأمر': po.po_number,
      'المورد': po.supplier?.name || '—',
      'السفينة': po.vessel?.name || '—',
      'التاريخ': po.order_date?.slice(0, 10) || '—',
      'الوصف': po.description || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أوامر الشراء');
    XLSX.writeFile(wb, 'purchase-orders.xlsx');
  }

  async function handleDelete(id: string, po_number: string) {
    if (!confirm(`هل تريد حذف أمر الشراء "${po_number}"؟`)) return;
    try {
      await api.delete(`/api/purchase-orders/${id}`);
      load();
    } catch {
      alert('لا يمكن الحذف — توجد فواتير مرتبطة بهذا الأمر');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">أوامر الشراء</h2>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
            ⬇ تصدير Excel
          </button>
          <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + إضافة أمر شراء
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">رقم الأمر</th>
              <th className="px-4 py-3">المورد</th>
              <th className="px-4 py-3">السفينة</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <tr key={po.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-blue-700">{po.po_number}</td>
                <td className="px-4 py-3">{po.supplier?.name || '—'}</td>
                <td className="px-4 py-3">{po.vessel?.name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{po.order_date?.slice(0, 10) || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{po.description || '—'}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(po)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                  <button onClick={() => handleDelete(po.id, po.po_number)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد أوامر شراء</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل أمر شراء' : 'إضافة أمر شراء'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">السفينة *</label>
                <select value={form.vessel_id} onChange={(e) => {
                  const vesselId = e.target.value;
                  const vessel = vessels.find((v) => v.id === vesselId);
                  const prefix = vessel ? (VESSEL_PREFIX[vessel.name] || '') : '';
                  const currentNum = form.po_number;
                  // Only auto-prefix if field is empty or has old prefix
                  const newPoNumber = prefix && (!currentNum || Object.values(VESSEL_PREFIX).some(p => currentNum.startsWith(p)))
                    ? prefix + '-'
                    : currentNum;
                  setForm({ ...form, vessel_id: vesselId, po_number: newPoNumber });
                }}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر السفينة —</option>
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {VESSEL_PREFIX[v.name] ? `(${VESSEL_PREFIX[v.name]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">رقم أمر الشراء *</label>
                <div className="relative">
                  <input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                    placeholder={form.vessel_id ? `${VESSEL_PREFIX[vessels.find(v=>v.id===form.vessel_id)?.name||''] || 'XX'}-024/2026e-O002` : 'اختر السفينة أولاً للحصول على البادئة'}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  {form.vessel_id && VESSEL_PREFIX[vessels.find(v=>v.id===form.vessel_id)?.name||''] && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      البادئة: {VESSEL_PREFIX[vessels.find(v=>v.id===form.vessel_id)?.name||'']}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">تاريخ الأمر</label>
                <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">الوصف</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
