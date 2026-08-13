'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { PERMISSION_SCREENS } from '@/lib/screens';

interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  allowed_screens: string[] | null;
}

const allHrefs = PERMISSION_SCREENS.map((s) => s.href);

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [savingId, setSavingId] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [notAdmin, setNotAdmin] = useState(false);

  // نموذج إضافة مستخدم
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'user' });
  const [adding, setAdding] = useState(false);
  /*
   * الرسالة كانت مربوطة بفراغ القائمة لا بحالة الجلب، فتقول «جاري التحميل»
   * أبداً متى كانت القائمة فارغة حقاً. الحالة هنا تفصل الانتظار عن النتيجة.
   */
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (u?.role !== 'admin') { setNotAdmin(true); return; }
    load();
  }, []);

  async function load() {
    try {
      const res = await api.get('/api/auth/users');
      const list: AppUser[] = res.data || [];
      setUsers(list);
      const p: Record<string, Set<string>> = {};
      for (const u of list) {
        // null = غير مقيّد (كل الشاشات) → نبدأ بالكل محدد
        p[u.id] = new Set(Array.isArray(u.allowed_screens) ? u.allowed_screens : allHrefs);
      }
      setPerms(p);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'تعذّر تحميل المستخدمين');
    } finally {
      setListLoading(false);
    }
  }

  const toggle = (uid: string, href: string) =>
    setPerms((prev) => {
      const s = new Set(prev[uid]);
      s.has(href) ? s.delete(href) : s.add(href);
      return { ...prev, [uid]: s };
    });

  const setAll = (uid: string, on: boolean) =>
    setPerms((prev) => ({ ...prev, [uid]: new Set(on ? allHrefs : []) }));

  async function savePerms(uid: string) {
    setSavingId(uid); setMsg('');
    try {
      await api.put(`/api/auth/users/${uid}/permissions`, { allowed_screens: [...(perms[uid] || [])] });
      setMsg('تم حفظ الصلاحيات ✅');
      setTimeout(() => setMsg(''), 2500);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'فشل الحفظ');
    } finally { setSavingId(''); }
  }

  async function toggleActive(u: AppUser) {
    try {
      await api.put(`/api/auth/users/${u.id}/active`, { is_active: !u.is_active });
      load();
    } catch (e: any) { setError(e?.response?.data?.message || 'فشل التعديل'); }
  }

  async function addUser() {
    if (!newUser.full_name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      setError('الاسم والإيميل وكلمة المرور مطلوبين'); return;
    }
    setAdding(true); setError('');
    try {
      await api.post('/api/auth/users', newUser);
      setNewUser({ full_name: '', email: '', password: '', role: 'user' });
      setShowAdd(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'فشل إضافة المستخدم');
    } finally { setAdding(false); }
  }

  if (notAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow p-8 text-center">
        <p className="text-5xl mb-3">🔒</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">صلاحيات غير كافية</h1>
        <p className="text-gray-500 text-sm mb-4">شاشة الصلاحيات متاحة لمستخدمي الأدمن فقط.</p>
        <button onClick={() => router.push('/dashboard')} className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700">الرجوع للرئيسية</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الصلاحيات وإدارة المستخدمين</h1>
          <p className="text-sm text-gray-500 mt-1">حدّد لكل مستخدم الشاشات المسموح له بدخولها. الأدمن يدخل كل الشاشات تلقائياً.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-emerald-600 font-medium">{msg}</span>}
          <button onClick={() => setShowAdd((v) => !v)} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            {showAdd ? 'إغلاق' : '➕ إضافة مستخدم'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {showAdd && (
        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <h3 className="font-bold text-gray-700 mb-3">مستخدم جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input placeholder="الاسم الكامل" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="الإيميل" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" dir="ltr" />
            <input placeholder="كلمة المرور" type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" dir="ltr" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="user">مستخدم</option>
              <option value="admin">أدمن</option>
            </select>
          </div>
          <button onClick={addUser} disabled={adding} className="mt-3 bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {adding ? 'جاري الإضافة...' : 'حفظ المستخدم'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {users.map((u) => {
          const isAdmin = u.role === 'admin';
          const sel = perms[u.id] || new Set<string>();
          return (
            <div key={u.id} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {(u.full_name || u.email).charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{u.full_name}</p>
                    <p className="text-xs text-gray-500" dir="ltr">{u.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isAdmin ? 'أدمن' : 'مستخدم'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {u.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </div>
                <button onClick={() => toggleActive(u)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  {u.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                </button>
              </div>

              {isAdmin ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2">👑 الأدمن يدخل كل الشاشات — لا حاجة لتحديد صلاحيات.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-gray-500">الشاشات المسموحة ({sel.size}/{allHrefs.length}):</span>
                    <button onClick={() => setAll(u.id, true)} className="text-xs text-blue-600 hover:underline">تحديد الكل</button>
                    <button onClick={() => setAll(u.id, false)} className="text-xs text-gray-500 hover:underline">إلغاء الكل</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {PERMISSION_SCREENS.map((s) => (
                      <label key={s.href} className={`flex items-center gap-2 text-sm border rounded-lg px-3 py-2 cursor-pointer transition-colors ${sel.has(s.href) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}>
                        <input type="checkbox" checked={sel.has(s.href)} onChange={() => toggle(u.id, s.href)} />
                        <span>{s.icon} {s.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <button onClick={() => savePerms(u.id)} disabled={savingId === u.id}
                      className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {savingId === u.id ? 'جاري الحفظ...' : '💾 حفظ صلاحيات ' + u.full_name}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {listLoading && users.length === 0 && <p className="text-gray-400 text-sm">جاري التحميل...</p>}
        {!listLoading && !error && users.length === 0 && <p className="text-gray-400 text-sm">لا يوجد مستخدمون.</p>}
      </div>
    </div>
  );
}
