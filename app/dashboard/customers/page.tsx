'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Customer {
  id: string; name: string; address: string; vat_no: string;
  country: string; contact_person: string; email: string; phone: string;
}

const empty = { name: '', address: '', vat_no: '', country: '', contact_person: '', email: '', phone: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await api.get('/api/customers');
    setCustomers(res.data);
  }
  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm(empty); setError(''); setShowModal(true); }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, address: c.address || '', vat_no: c.vat_no || '', country: c.country || '', contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '' });
    setError(''); setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم العميل مطلوب'); return; }
    setLoading(true);
    try {
      if (editing) await api.put(`/api/customers/${editing.id}`, form);
      else await api.post('/api/customers', form);
      setShowModal(false); load();
    } catch { setError('حدث خطأ'); } finally { setLoading(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف "${name}"؟`)) return;
    await api.delete(`/api/customers/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">العملاء</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">+ إضافة عميل</button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">اسم العميل</th>
              <th className="px-4 py-3">الدولة</th>
              <th className="px-4 py-3">البريد الإلكتروني</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">VAT NO</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.country || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.email || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.vat_no || '—'}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                  <button onClick={() => handleDelete(c.id, c.name)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا يوجد عملاء</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل عميل' : 'إضافة عميل'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">اسم العميل *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">العنوان</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">الدولة</label>
                  <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">VAT NO</label>
                  <input value={form.vat_no} onChange={(e) => setForm({ ...form, vat_no: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">البريد الإلكتروني</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">الهاتف</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">جهة الاتصال</label>
                <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
