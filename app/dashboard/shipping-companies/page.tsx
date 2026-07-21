'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface ShippingCompany {
  id: string; name: string; address: string;
  bank_name: string; acc_name: string; iban_eur: string; iban_usd: string; swift_code: string;
}

const empty = { name: '', address: '', bank_name: '', acc_name: '', iban_eur: '', iban_usd: '', swift_code: '' };

export default function ShippingCompaniesPage() {
  const [companies, setCompanies] = useState<ShippingCompany[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ShippingCompany | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() { const res = await api.get('/api/shipping-companies'); setCompanies(res.data); }
  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm(empty); setError(''); setShowModal(true); }
  function openEdit(c: ShippingCompany) {
    setEditing(c);
    setForm({ name: c.name, address: c.address || '', bank_name: c.bank_name || '', acc_name: c.acc_name || '', iban_eur: c.iban_eur || '', iban_usd: c.iban_usd || '', swift_code: c.swift_code || '' });
    setError(''); setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم الشركة مطلوب'); return; }
    setLoading(true);
    try {
      if (editing) await api.put(`/api/shipping-companies/${editing.id}`, form);
      else await api.post('/api/shipping-companies', form);
      setShowModal(false); load();
    } catch { setError('حدث خطأ'); } finally { setLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">شركات الشحن</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">+ إضافة شركة</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {companies.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">{c.name}</h3>
                {c.address && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{c.address}</p>}
              </div>
              <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline text-sm">تعديل</button>
            </div>
            {(c.bank_name || c.iban_eur) && (
              <div className="mt-4 pt-4 border-t text-sm text-gray-600 space-y-1">
                {c.bank_name && <p><span className="font-medium">Bank:</span> {c.bank_name}</p>}
                {c.acc_name && <p><span className="font-medium">Acc. Name:</span> {c.acc_name}</p>}
                {c.iban_eur && <p><span className="font-medium">IBAN EUR:</span> <span className="font-mono">{c.iban_eur}</span></p>}
                {c.iban_usd && <p><span className="font-medium">IBAN USD:</span> <span className="font-mono">{c.iban_usd}</span></p>}
                {c.swift_code && <p><span className="font-medium">Swift:</span> {c.swift_code}</p>}
              </div>
            )}
          </div>
        ))}
        {companies.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد شركات شحن</p>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل شركة شحن' : 'إضافة شركة شحن'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">اسم الشركة *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: ZARICON SHIPPING COMPANY LIMITED"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">العنوان</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2}
                  placeholder="Karaiskaki 13 Lemesos 3032 Cyprus"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide pt-1">بيانات البنك</p>
              <div>
                <label className="block text-sm text-gray-600 mb-1">اسم البنك</label>
                <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  placeholder="Bank of Cyprus"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Acc. Name</label>
                <input value={form.acc_name} onChange={(e) => setForm({ ...form, acc_name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">IBAN (EUR)</label>
                <input value={form.iban_eur} onChange={(e) => setForm({ ...form, iban_eur: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">IBAN (USD) — اختياري</label>
                <input value={form.iban_usd} onChange={(e) => setForm({ ...form, iban_usd: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Swift Code</label>
                <input value={form.swift_code} onChange={(e) => setForm({ ...form, swift_code: e.target.value })}
                  placeholder="BCYPCY2N"
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
