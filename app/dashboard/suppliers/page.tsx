'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  is_active: boolean;
}

const empty = { name: '', contact_person: '', email: '', phone: '', address: '', country: '', is_active: true };

// توحيد الاسم للمقارنة: حروف/أرقام فقط (يتجاهل المسافات وعلامات الترقيم وحالة الأحرف)
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');

// لواحق الشركات المتجاهلة عند البحث عن التشابه
const CORP = new Set(['ltd', 'limited', 'co', 'company', 'corp', 'corporation', 'inc', 'sa', 'sl', 'sae', 'fze', 'llc', 'gmbh', 'ab', 'as', 'dmcc', 'plc', 'bv', 'nv', 'pte', 'srl', 'est', 'group']);
const looseSig = (name: string) =>
  [...new Set(
    (name || '').toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, ' ').split(/\s+/)
      .filter((t) => t && t.length > 1 && !CORP.has(t))
  )].sort().join(' ');

function findDuplicates(list: Supplier[]) {
  const exactMap: Record<string, Supplier[]> = {};
  for (const s of list) { const k = norm(s.name); if (!k) continue; (exactMap[k] ||= []).push(s); }
  const exactGroups = Object.values(exactMap).filter((g) => g.length > 1);

  const looseMap: Record<string, Supplier[]> = {};
  for (const s of list) { const k = looseSig(s.name); if (!k) continue; (looseMap[k] ||= []).push(s); }
  const similarGroups = Object.values(looseMap).filter((g) => g.length > 1 && new Set(g.map((s) => norm(s.name))).size > 1);

  return { exactGroups, similarGroups };
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDup, setShowDup] = useState(false);
  const [keepSel, setKeepSel] = useState<Record<string, string>>({});

  async function load() {
    const res = await api.get('/api/suppliers');
    setSuppliers(res.data);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setError('');
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || '', email: s.email || '', phone: s.phone || '', address: s.address || '', country: s.country || '', is_active: s.is_active });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم المورد مطلوب'); return; }
    if (dupExact) { setError(`مورد بنفس الاسم موجود بالفعل: "${dupExact.name}"`); return; }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/api/suppliers/${editing.id}`, form);
      } else {
        await api.post('/api/suppliers', form);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`هل تريد حذف "${name}"؟`)) return;
    try {
      await api.delete(`/api/suppliers/${id}`);
      load();
    } catch {
      alert('لا يمكن الحذف — توجد بيانات مرتبطة بهذا المورد');
    }
  }

  async function mergeGroup(g: Supplier[]) {
    const gid = g[0].id;
    const keepId = keepSel[gid] || g[0].id;
    const removeIds = g.filter((s) => s.id !== keepId).map((s) => s.id);
    if (!removeIds.length) return;
    const keepName = g.find((s) => s.id === keepId)?.name;
    if (!confirm(`دمج ${g.length} موردين في «${keepName}»؟\nكل فواتير وأوامر الباقي هتتحول للمورد ده، والباقي هيتحذف.`)) return;
    try {
      await api.post('/api/suppliers/merge', { keepId, removeIds });
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'فشل الدمج، حاول مرة أخرى.');
    }
  }

  const f = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  // كشف التكرار أثناء الكتابة
  const nameNorm = norm(form.name);
  const others = suppliers.filter((s) => s.id !== editing?.id);
  const dupExact = nameNorm.length > 0 ? others.find((s) => norm(s.name) === nameNorm) : undefined;
  const similar = nameNorm.length >= 4 && !dupExact
    ? others.filter((s) => { const n = norm(s.name); return n && (n.includes(nameNorm) || nameNorm.includes(n)); }).slice(0, 5)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">الموردين</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDup((v) => !v)}
            className={`px-4 py-2 rounded-lg border ${showDup ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-gray-300 hover:bg-gray-50'}`}>
            🔎 كشف المكررات
          </button>
          <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + إضافة مورد
          </button>
        </div>
      </div>

      {showDup && (() => {
        const { exactGroups, similarGroups } = findDuplicates(suppliers);
        const none = exactGroups.length === 0 && similarGroups.length === 0;
        const Group = ({ g, kind }: { g: Supplier[]; kind: 'exact' | 'similar' }) => {
          const gid = g[0].id;
          const keepId = keepSel[gid] || g[0].id;
          return (
            <div className={`rounded-lg border p-3 ${kind === 'exact' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              {g.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1 border-b last:border-0 border-black/5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`keep-${gid}`} checked={keepId === s.id} onChange={() => setKeepSel((k) => ({ ...k, [gid]: s.id }))} />
                    <span className="font-medium text-gray-800">{s.name}</span>
                    {keepId === s.id && <span className="text-emerald-600 text-[11px]">← الأصلي</span>}
                  </label>
                  <span className="flex gap-3">
                    <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                    <button onClick={() => handleDelete(s.id, s.name)} className="text-red-500 hover:underline text-xs">حذف</button>
                  </span>
                </div>
              ))}
              <div className="mt-2 text-left">
                <button onClick={() => mergeGroup(g)} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700">🔗 دمج المجموعة في المورد المختار</button>
              </div>
            </div>
          );
        };
        return (
          <div className="bg-white rounded-xl shadow p-4 mb-6">
            <h3 className="font-bold text-gray-700 mb-3">🔎 كشف الموردين المكررين</h3>
            {none && <p className="text-emerald-600 text-sm">لا يوجد تكرار 🎉</p>}
            {exactGroups.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-red-700 mb-2">تكرار مؤكد ({exactGroups.length} مجموعة) — نفس الاسم بفروق في الرموز أو المسافات:</p>
                <div className="space-y-2">{exactGroups.map((g, i) => <Group key={i} g={g} kind="exact" />)}</div>
              </div>
            )}
            {similarGroups.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">تشابه محتمل ({similarGroups.length} مجموعة) — راجعها يدوياً، قد تكون نفس المورد:</p>
                <div className="space-y-2">{similarGroups.map((g, i) => <Group key={i} g={g} kind="similar" />)}</div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">احذف المكرر أو عدّل الاسم لتوحيده. الحذف لا يعمل لو للمورد فواتير/أوامر مرتبطة — وحّد الاسم في الحالة دي.</p>
          </div>
        );
      })()}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">اسم المورد</th>
              <th className="px-4 py-3">المسؤول</th>
              <th className="px-4 py-3">البريد</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">الدولة</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-gray-500">{s.contact_person || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.email || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.country || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {s.is_active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                  <button onClick={() => handleDelete(s.id, s.name)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا يوجد موردين</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل مورد' : 'إضافة مورد'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">اسم المورد *</label>
                <input value={form.name} onChange={f('name')}
                  className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${dupExact ? 'border-red-400 focus:ring-red-500' : 'focus:ring-blue-500'}`} />
                {dupExact && (
                  <p className="text-red-600 text-xs mt-1">⚠️ هذا المورد موجود بالفعل: «{dupExact.name}» — لا يمكن التكرار</p>
                )}
                {!dupExact && similar.length > 0 && (
                  <div className="text-amber-600 text-xs mt-1">
                    <span>⚠️ في أسماء مشابهة — اتأكد إنه مش نفس المورد:</span>
                    <ul className="list-disc pr-5 mt-0.5">{similar.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">المسؤول</label>
                <input value={form.contact_person} onChange={f('contact_person')}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">البريد الإلكتروني</label>
                <input value={form.email} onChange={f('email')} type="email"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">الهاتف</label>
                <input value={form.phone} onChange={f('phone')}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">الدولة</label>
                <input value={form.country} onChange={f('country')}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">العنوان</label>
                <input value={form.address} onChange={f('address')}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} id="active" />
                <label htmlFor="active" className="text-sm text-gray-600">نشط</label>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading || !!dupExact}
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
