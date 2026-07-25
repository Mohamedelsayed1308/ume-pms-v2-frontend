'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comment { id: string; author: string; body: string; created_at: string; }
interface Task {
  id: string; title: string; reason: string; notes: string;
  team: string; owner: string; recommended_employee: string;
  priority: string; status: string;
  due_date: string; recurrence: string;
  comments: Comment[];
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OWNERS   = ['M.Elsayed', 'Bassel', 'Tarek', 'Shimaa', 'Other'];
const TEAMS    = ['UME', 'Badawi', 'Ittihad', 'Operations', 'Finance'];
const PRIORITY = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['pending', 'in_progress', 'done', 'cancelled'];
const RECURRENCE = ['none', 'daily', 'weekly', 'monthly'];

const PRIORITY_STYLE: Record<string, string> = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};
const STATUS_STYLE: Record<string, string> = {
  pending:     'bg-purple-100 text-purple-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done:        'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-gray-100 text-gray-500',
};
const OWNER_COLOR: Record<string, string> = {
  'M.Elsayed': 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Bassel':    'bg-yellow-100 text-yellow-700 border-yellow-300',
  'Tarek':     'bg-green-100 text-green-700 border-green-300',
  'Shimaa':    'bg-pink-100 text-pink-700 border-pink-300',
  'Other':     'bg-gray-100 text-gray-600 border-gray-300',
};

const emptyForm = () => ({
  title: '', reason: '', notes: '',
  team: 'UME', owner: 'M.Elsayed', recommended_employee: '',
  priority: 'medium', status: 'pending',
  due_date: '', recurrence: 'none',
});

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [filter, setFilter]         = useState<string>('all');
  const [search, setSearch]         = useState('');
  const [editId, setEditId]         = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get('/api/tasks');
    setTasks(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── inline status/owner update ──────────────────────────────────────────────
  async function patchTask(id: string, patch: Partial<Task>) {
    await api.put(`/api/tasks/${id}`, patch);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  }

  // ── save new / edit task ────────────────────────────────────────────────────
  async function saveTask() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/api/tasks/${editId}`, form);
      } else {
        await api.post('/api/tasks', form);
      }
      await load();
      setShowForm(false);
      setForm(emptyForm());
      setEditId(null);
    } catch (err: any) {
      alert('خطأ: ' + (err?.response?.data?.message || err?.message || 'فشل الحفظ'));
    } finally { setSaving(false); }
  }

  function openEdit(t: Task) {
    setForm({
      title: t.title, reason: t.reason || '', notes: t.notes || '',
      team: t.team, owner: t.owner, recommended_employee: t.recommended_employee || '',
      priority: t.priority, status: t.status,
      due_date: t.due_date || '', recurrence: t.recurrence,
    });
    setEditId(t.id);
    setShowForm(true);
  }

  async function deleteTask(id: string) {
    if (!confirm('حذف المهمة؟')) return;
    await api.delete(`/api/tasks/${id}`);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // ── comments ────────────────────────────────────────────────────────────────
  async function postComment(taskId: string) {
    const body = (commentText[taskId] || '').trim();
    if (!body) return;
    await api.post(`/api/tasks/${taskId}/comments`, { body });
    setCommentText((prev) => ({ ...prev, [taskId]: '' }));
    await load();
  }

  async function deleteComment(taskId: string, commentId: string) {
    await api.delete(`/api/tasks/comments/${commentId}`);
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) } : t
    ));
  }

  // ── filter + search ─────────────────────────────────────────────────────────
  const visible = tasks.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.owner || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: tasks.length,
    pending:     tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done:        tasks.filter((t) => t.status === 'done').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">مهام الفريق</h1>
          <p className="text-sm text-gray-500 mt-0.5">تنسيق وتوزيع المهام بين أعضاء الفريق</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition"
        >
          <span className="text-lg leading-none">+</span> مهمة جديدة
        </button>
      </div>

      {/* ── Filter tabs + search ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {([
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'معلقة' },
          { key: 'in_progress', label: 'جارية' },
          { key: 'done', label: 'منتهية' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              filter === key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filter === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {counts[key === 'all' ? 'all' : key]}
            </span>
          </button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالعنوان أو المسؤول..."
          className="mr-auto border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
        />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-right px-4 py-3 w-8">#</th>
              <th className="text-right px-4 py-3">المهمة</th>
              <th className="text-right px-4 py-3 w-32">الموظف المقترح</th>
              <th className="text-right px-4 py-3 w-24">الأولوية</th>
              <th className="text-right px-4 py-3 w-28">الحالة</th>
              <th className="text-right px-4 py-3 w-32">المسؤول</th>
              <th className="text-right px-4 py-3 w-24">الموعد</th>
              <th className="text-right px-4 py-3 w-20">تكرار</th>
              <th className="text-right px-4 py-3 w-20">تعليقات</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.length === 0 && (
              <tr><td colSpan={10} className="text-center py-16 text-gray-400">لا توجد مهام</td></tr>
            )}
            {visible.map((t, idx) => (
              <>
                <tr
                  key={t.id}
                  className={`hover:bg-indigo-50/30 transition cursor-pointer ${t.status === 'done' ? 'opacity-60' : ''}`}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className={`font-medium text-gray-800 ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>{t.title}</p>
                    {t.reason && <p className="text-xs text-gray-400 mt-0.5">{t.reason}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{t.recommended_employee || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLE[t.priority] || ''}`}>
                      {t.priority === 'urgent' ? 'عاجل' : t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.status}
                      onChange={(e) => patchTask(t.id, { status: e.target.value })}
                      className={`text-xs px-2 py-1 rounded-full border font-medium appearance-none cursor-pointer ${STATUS_STYLE[t.status] || ''}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s === 'pending' ? 'معلقة' : s === 'in_progress' ? 'جارية' : s === 'done' ? 'منتهية' : 'ملغاة'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.owner || ''}
                      onChange={(e) => patchTask(t.id, { owner: e.target.value })}
                      className={`text-xs px-2 py-1 rounded-full border font-semibold appearance-none cursor-pointer ${OWNER_COLOR[t.owner] || 'bg-gray-100 text-gray-600 border-gray-300'}`}
                    >
                      {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(t.due_date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {t.recurrence === 'none' ? '—' : t.recurrence === 'daily' ? 'يومي' : t.recurrence === 'weekly' ? 'أسبوعي' : 'شهري'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                      {t.comments?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteTask(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>

                {/* ── Expanded comments row ── */}
                {expandedId === t.id && (
                  <tr key={`${t.id}-expand`} className="bg-indigo-50/20">
                    <td colSpan={10} className="px-6 pb-4 pt-2">
                      {t.notes && (
                        <p className="text-xs text-gray-500 mb-3 bg-white rounded-lg p-2 border border-gray-100">
                          📝 {t.notes}
                        </p>
                      )}
                      <p className="text-xs font-semibold text-gray-500 mb-2">التعليقات ({t.comments?.length || 0})</p>
                      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                        {(t.comments || []).length === 0 && (
                          <p className="text-xs text-gray-400">لا توجد تعليقات بعد</p>
                        )}
                        {(t.comments || []).map((c) => (
                          <div key={c.id} className="flex gap-2 items-start">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold flex-shrink-0">
                              {c.author[0]}
                            </div>
                            <div className="flex-1 bg-white rounded-lg p-2 border border-gray-100">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                                <span className="text-xs text-gray-400">{fmtTime(c.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-700">{c.body}</p>
                            </div>
                            <button
                              onClick={() => deleteComment(t.id, c.id)}
                              className="text-gray-300 hover:text-red-400 mt-1"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      {/* Add comment */}
                      <div className="flex gap-2">
                        <input
                          value={commentText[t.id] || ''}
                          onChange={(e) => setCommentText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && postComment(t.id)}
                          placeholder="اكتب تعليقاً..."
                          className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <button
                          onClick={() => postComment(t.id)}
                          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 transition"
                        >إرسال</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: New / Edit Task ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-800 text-lg">{editId ? '✏️ تعديل المهمة' : '+ مهمة جديدة'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">عنوان المهمة *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="اكتب عنوان المهمة هنا..."
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Team + Owner */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الفريق</label>
                  <select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {TEAMS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">المسؤول</label>
                  <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {OWNERS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الأولوية *</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                    <option value="urgent">عاجل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الحالة</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="pending">معلقة</option>
                    <option value="in_progress">جارية</option>
                    <option value="done">منتهية</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
              </div>

              {/* Due Date + Recurrence */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">تاريخ الاستحقاق</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">تكرار</label>
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="none">لا يتكرر</option>
                    <option value="daily">يومي</option>
                    <option value="weekly">أسبوعي</option>
                    <option value="monthly">شهري</option>
                  </select>
                </div>
              </div>

              {/* Recommended Employee */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">الموظف المقترح</label>
                <input
                  value={form.recommended_employee}
                  onChange={(e) => setForm({ ...form, recommended_employee: e.target.value })}
                  placeholder="اسم الموظف المقترح لتنفيذ المهمة..."
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">السبب / المبرر</label>
                <input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="لماذا هذه المهمة مهمة؟"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">ملاحظات إضافية</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="أي تفاصيل أو ملاحظات إضافية..."
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={saveTask}
                disabled={saving || !form.title.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition"
              >
                {saving ? '...' : editId ? '💾 حفظ التعديلات' : '💾 حفظ المهمة'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="px-5 py-2.5 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition"
              >إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
