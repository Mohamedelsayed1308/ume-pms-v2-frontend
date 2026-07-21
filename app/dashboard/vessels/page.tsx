'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Vessel {
  id: string; name: string; imo_number: string; flag: string;
  vessel_type: string; is_active: boolean; shipping_company_id: string;
  owner_name: string; owner_address: string;
  shipping_company?: { id: string; name: string };
}

const empty = { name: '', imo_number: '', flag: '', vessel_type: '', is_active: true, shipping_company_id: '', owner_name: '', owner_address: '' };

export default function VesselsPage() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [vesRes, compRes] = await Promise.all([api.get('/api/vessels'), api.get('/api/shipping-companies')]);
    setVessels(vesRes.data);
    setCompanies(compRes.data);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setError('');
    setShowModal(true);
  }

  function openEdit(v: Vessel) {
    setEditing(v);
    setForm({ name: v.name, imo_number: v.imo_number || '', flag: v.flag || '', vessel_type: v.vessel_type || '', is_active: v.is_active, shipping_company_id: v.shipping_company_id || '', owner_name: v.owner_name || '', owner_address: v.owner_address || '' });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم السفينة مطلوب'); return; }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/api/vessels/${editing.id}`, form);
      } else {
        await api.post('/api/vessels', form);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'حدث خطأ';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`هل تريد حذف "${name}"؟`)) return;
    try {
      await api.delete(`/api/vessels/${id}`);
      load();
    } catch {
      alert('لا يمكن الحذف — توجد بيانات مرتبطة بهذه السفينة');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">السفن</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + إضافة سفينة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">اسم السفينة</th>
              <th className="px-4 py-3">IMO</th>
              <th className="px-4 py-3">العلم</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {vessels.map((v) => (
              <tr key={v.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{v.name}</td>
                <td className="px-4 py-3 text-gray-500">{v.imo_number || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{v.flag || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{v.vessel_type || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{v.shipping_company?.name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {v.is_active ? 'نشطة' : 'غير نشطة'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(v)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                  <button onClick={() => handleDelete(v.id, v.name)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {vessels.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد سفن</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[95vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل سفينة' : 'إضافة سفينة'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">اسم السفينة *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">رقم IMO</label>
                <input value={form.imo_number} onChange={(e) => setForm({ ...form, imo_number: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">العلم</label>
                <input value={form.flag} onChange={(e) => setForm({ ...form, flag: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">النوع</label>
                <input value={form.vessel_type} onChange={(e) => setForm({ ...form, vessel_type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">شركة الشحن (Owner)</label>
                <select value={form.shipping_company_id} onChange={(e) => setForm({ ...form, shipping_company_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— بدون —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 border-t pt-3 mt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">بيانات المالك (Bill To)</p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">اسم المالك</label>
                <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  placeholder="ISBA Shipping LTD"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">عنوان المالك</label>
                <textarea value={form.owner_address} onChange={(e) => setForm({ ...form, owner_address: e.target.value })}
                  placeholder={"13 Karaiskaki Street\n3032 Limassol\nCyprus"} rows={3}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} id="active" />
                <label htmlFor="active" className="text-sm text-gray-600">نشطة</label>
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
