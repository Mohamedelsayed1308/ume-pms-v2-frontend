'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Item { id: string; name: string; is_active: boolean }

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const res = await api.get('/api/items'); setItems(res.data || []); }
    catch (e: any) { setError(e?.response?.data?.message || 'تعذّر التحميل'); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try { await api.post('/api/items', { name: name.trim() }); setName(''); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'فشل الإضافة'); }
    finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try { await api.put(`/api/items/${id}`, { name: editName.trim() }); setEditingId(''); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'فشل التعديل'); }
  }

  async function toggleActive(it: Item) {
    try { await api.put(`/api/items/${it.id}`, { is_active: !it.is_active }); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'فشل التعديل'); }
  }

  async function remove(it: Item) {
    if (!confirm(`حذف البند "${it.name}"؟`)) return;
    try { await api.delete(`/api/items/${it.id}`); load(); }
    catch (e: any) { alert(e?.response?.data?.message || 'تعذّر حذف البند، حاول مرة أخرى.'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">بنود الفواتير</h2>
          <p className="text-sm text-gray-500 mt-1">الفئات اللي بتختار منها وقت تسجيل الفاتورة (Bunker · Vessel Supplies · Salaries · Provision ...).</p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="bg-white rounded-xl shadow p-4 mb-6 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm text-gray-600 mb-1">بند جديد</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="مثال: Bunker" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={add} disabled={busy} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? '...' : '➕ إضافة'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr><th className="px-4 py-3">البند</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">إجراءات</th></tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {editingId === it.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit(it.id)}
                      className="border rounded-lg px-2 py-1 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                  ) : it.name}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${it.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {it.is_active ? 'مفعّل' : 'موقوف'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-3 text-xs">
                  {editingId === it.id ? (
                    <>
                      <button onClick={() => saveEdit(it.id)} className="text-emerald-600 hover:underline">حفظ</button>
                      <button onClick={() => setEditingId('')} className="text-gray-500 hover:underline">إلغاء</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(it.id); setEditName(it.name); }} className="text-blue-600 hover:underline">تعديل</button>
                      <button onClick={() => toggleActive(it)} className="text-gray-600 hover:underline">{it.is_active ? 'إيقاف' : 'تفعيل'}</button>
                      <button onClick={() => remove(it)} className="text-red-500 hover:underline">حذف</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-gray-400">لا توجد بنود</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
