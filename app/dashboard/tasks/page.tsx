'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { useInitialQuery } from '@/lib/useInitialQuery';
import TaskAssistant from './TaskAssistant';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { Button, Modal, Drawer, Spinner, EmptyState, useToast, cx } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comment { id: string; author: string; body: string; created_at: string; }
interface Task {
  id: string; title: string; reason: string; notes: string;
  team: string; owner: string; recommended_employee: string;
  priority: string; status: string;
  due_date: string; recurrence: string; recurrence_next?: string;
  comments: Comment[];
  created_at: string; updated_at?: string;
}

// ─── Constants (match real backend values exactly) ──────────────────────────────
const OWNERS   = ['M.Elsayed', 'Bassel', 'Tarek', 'Shimaa', 'Other'];
const TEAMS    = ['UME', 'Badawi', 'Ittihad', 'Operations', 'Finance'];
const PRIORITY = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['pending', 'in_progress', 'done', 'cancelled'];
const RECURRENCE = ['none', 'daily', 'weekly', 'monthly'];

type Bi = { ar: string; en: string };
const PRIORITY_LABEL: Record<string, Bi> = {
  low: { ar: 'منخفضة', en: 'Low' }, medium: { ar: 'متوسطة', en: 'Medium' },
  high: { ar: 'عالية', en: 'High' }, urgent: { ar: 'عاجل', en: 'Urgent' },
};
const STATUS_LABEL: Record<string, Bi> = {
  pending: { ar: 'معلقة', en: 'To Do' }, in_progress: { ar: 'جارية', en: 'In Progress' },
  done: { ar: 'منتهية', en: 'Done' }, cancelled: { ar: 'ملغاة', en: 'Cancelled' },
};
const RECUR_LABEL: Record<string, Bi> = {
  none: { ar: 'لا يتكرر', en: 'None' }, daily: { ar: 'يومي', en: 'Daily' },
  weekly: { ar: 'أسبوعي', en: 'Weekly' }, monthly: { ar: 'شهري', en: 'Monthly' },
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
};
// glyph so priority isn't communicated by color alone
const PRIORITY_GLYPH: Record<string, string> = { low: '↓', medium: '•', high: '▲', urgent: '‼' };
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-purple-100 text-purple-700', in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-gray-100 text-gray-500',
};
const OWNER_COLOR: Record<string, string> = {
  'M.Elsayed': 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Bassel': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'Tarek': 'bg-green-100 text-green-700 border-green-300',
  'Shimaa': 'bg-pink-100 text-pink-700 border-pink-300',
  'Other': 'bg-gray-100 text-gray-600 border-gray-300',
};

const emptyForm = () => ({
  title: '', reason: '', notes: '',
  team: 'UME', owner: 'M.Elsayed', recommended_employee: '',
  priority: 'medium', status: 'pending',
  due_date: '', recurrence: 'none',
});

// ─── Date helpers (local-timezone safe) ─────────────────────────────────────────
function parseDate(s?: string): Date | null {
  if (!s) return null;
  const m = String(s).slice(0, 10).split('-').map(Number);
  if (m.length < 3 || m.some((x) => !isFinite(x))) return null;
  return new Date(m[0], m[1] - 1, m[2]); // local midnight
}
function startOfToday(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function dayDiff(due: Date, today: Date) { return Math.round((due.getTime() - today.getTime()) / 86400000); }
const isActive = (t: Task) => t.status !== 'done' && t.status !== 'cancelled';
function isOverdue(t: Task) { const d = parseDate(t.due_date); return !!d && isActive(t) && d < startOfToday(); }
function isDueToday(t: Task) { const d = parseDate(t.due_date); return !!d && isActive(t) && d.getTime() === startOfToday().getTime(); }
function isUpcoming(t: Task) { const d = parseDate(t.due_date); if (!d || !isActive(t)) return false; const diff = dayDiff(d, startOfToday()); return diff > 0 && diff <= 7; }

function fmtDate(d?: string, locale = 'en') {
  const dt = parseDate(d); if (!dt) return '—';
  return dt.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d?: string, locale = 'en') {
  if (!d) return '';
  return new Date(d).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type ViewKey = 'list' | 'kanban' | 'calendar';
type Preset = 'all' | 'due_today' | 'overdue' | 'week' | 'high' | 'completed' | 'recurring';

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const { locale } = useI18n();
  const L = (b: Bi) => (locale === 'en' ? b.en : b.ar);
  const toast = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('list');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState('');
  useInitialQuery(setSearch);
  const [preset, setPreset] = useState<Preset>('all');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [fRecur, setFRecur] = useState('');
  const [sortBy, setSortBy] = useState<'due' | 'priority' | 'created'>('created');

  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const load = useCallback(async () => {
    const res = await api.get('/api/tasks');
    setTasks(res.data);
    return res.data as Task[];
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // ── mutations (payloads unchanged) ──
  async function patchTask(id: string, patch: Partial<Task>) {
    const prev = tasks;
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t))); // optimistic
    try { await api.put(`/api/tasks/${id}`, patch); }
    catch (e: any) { setTasks(prev); toast.error(L({ ar: 'فشل التحديث', en: 'Update failed' })); }
  }

  async function saveTask() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      if (editId) { await api.put(`/api/tasks/${editId}`, form); toast.success(L({ ar: 'تم حفظ التعديلات', en: 'Changes saved' })); }
      else { await api.post('/api/tasks', form); toast.success(L({ ar: 'تمت إضافة المهمة', en: 'Task created' })); }
      await load();
      setShowForm(false); setForm(emptyForm()); setEditId(null);
    } catch (err: any) {
      toast.error((L({ ar: 'خطأ: ', en: 'Error: ' })) + (err?.response?.data?.message || err?.message || 'failed'));
    } finally { setSaving(false); }
  }

  function openEdit(t: Task) {
    setForm({
      title: t.title, reason: t.reason || '', notes: t.notes || '',
      team: t.team, owner: t.owner, recommended_employee: t.recommended_employee || '',
      priority: t.priority, status: t.status,
      due_date: t.due_date || '', recurrence: t.recurrence,
    });
    setEditId(t.id); setShowForm(true);
  }

  async function doDelete() {
    if (!confirmDel || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/api/tasks/${confirmDel.id}`);
      setTasks((p) => p.filter((t) => t.id !== confirmDel.id));
      if (drawerId === confirmDel.id) setDrawerId(null);
      toast.success(L({ ar: 'تم حذف المهمة', en: 'Task deleted' }));
    } catch { toast.error(L({ ar: 'فشل الحذف', en: 'Delete failed' })); }
    finally { setDeleting(false); setConfirmDel(null); }
  }

  async function postComment(taskId: string) {
    const body = (commentText[taskId] || '').trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    try {
      await api.post(`/api/tasks/${taskId}/comments`, { body });
      setCommentText((prev) => ({ ...prev, [taskId]: '' }));
      await load();
    } catch { toast.error(L({ ar: 'فشل إضافة التعليق', en: 'Comment failed' })); }
    finally { setPostingComment(false); }
  }
  async function deleteComment(taskId: string, commentId: string) {
    await api.delete(`/api/tasks/comments/${commentId}`);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) } : t)));
  }

  // ── derived ──
  const activeFilterCount = [fStatus, fPriority, fOwner, fRecur].filter(Boolean).length + (search ? 1 : 0) + (preset !== 'all' ? 1 : 0);

  function matchesPreset(t: Task): boolean {
    switch (preset) {
      case 'due_today': return isDueToday(t);
      case 'overdue': return isOverdue(t);
      case 'week': return isUpcoming(t) || isDueToday(t);
      case 'high': return isActive(t) && (t.priority === 'high' || t.priority === 'urgent');
      case 'completed': return t.status === 'done';
      case 'recurring': return !!t.recurrence && t.recurrence !== 'none';
      default: return true;
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = tasks.filter((t) => {
      if (!matchesPreset(t)) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fOwner && t.owner !== fOwner) return false;
      if (fRecur && t.recurrence !== fRecur) return false;
      if (q) {
        const hay = `${t.title} ${t.owner || ''} ${t.notes || ''} ${t.reason || ''} ${t.recommended_employee || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const prioRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return arr.sort((a, b) => {
      if (sortBy === 'due') {
        const da = parseDate(a.due_date)?.getTime() ?? Infinity; const db = parseDate(b.due_date)?.getTime() ?? Infinity; return da - db;
      }
      if (sortBy === 'priority') return (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, search, preset, fStatus, fPriority, fOwner, fRecur, sortBy]);

  const stats = useMemo(() => ({
    open: tasks.filter(isActive).length,
    dueToday: tasks.filter(isDueToday).length,
    overdue: tasks.filter(isOverdue).length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
    highOpen: tasks.filter((t) => isActive(t) && (t.priority === 'high' || t.priority === 'urgent')).length,
    recurring: tasks.filter((t) => t.recurrence && t.recurrence !== 'none').length,
  }), [tasks]);

  const workload = useMemo(() => {
    const map: Record<string, { open: number; overdue: number; high: number; done: number }> = {};
    for (const t of tasks) {
      const o = t.owner || '—';
      map[o] = map[o] || { open: 0, overdue: 0, high: 0, done: 0 };
      if (isActive(t)) map[o].open++;
      if (isOverdue(t)) map[o].overdue++;
      if (isActive(t) && (t.priority === 'high' || t.priority === 'urgent')) map[o].high++;
      if (t.status === 'done') map[o].done++;
    }
    return Object.entries(map).map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.open - a.open);
  }, [tasks]);

  const needsAttention = useMemo(() => tasks.filter((t) => isOverdue(t) || isDueToday(t)).sort((a, b) => {
    const da = parseDate(a.due_date)?.getTime() ?? 0; const db = parseDate(b.due_date)?.getTime() ?? 0; return da - db;
  }), [tasks]);

  const drawerTask = tasks.find((t) => t.id === drawerId) || null;

  function resetFilters() { setSearch(''); setPreset('all'); setFStatus(''); setFPriority(''); setFOwner(''); setFRecur(''); }

  // ── small pieces ──
  const PriorityBadge = ({ p }: { p: string }) => (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', PRIORITY_STYLE[p])}>
      <span aria-hidden>{PRIORITY_GLYPH[p]}</span>{L(PRIORITY_LABEL[p] || { ar: p, en: p })}
    </span>
  );
  const StatusBadge = ({ s }: { s: string }) => (
    <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLE[s])}>{L(STATUS_LABEL[s] || { ar: s, en: s })}</span>
  );
  const OwnerChip = ({ o }: { o: string }) => (
    <span className={cx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border', OWNER_COLOR[o] || 'bg-gray-100 text-gray-600 border-gray-300')}>
      <span className="w-4 h-4 rounded-full bg-white/60 flex items-center justify-center text-[10px]">{(o || '?')[0]}</span>{o || '—'}
    </span>
  );
  const DueCell = ({ t }: { t: Task }) => {
    if (!t.due_date) return <span className="text-gray-400 text-xs">—</span>;
    const over = isOverdue(t); const today = isDueToday(t);
    return <span className={cx('text-xs', over ? 'text-red-600 font-semibold' : today ? 'text-amber-600 font-semibold' : 'text-gray-500')}>
      {fmtDate(t.due_date, locale)}{over && ' ⚠'}{today && ' •'}
    </span>;
  };

  const PRESETS: { key: Preset; label: Bi }[] = [
    { key: 'all', label: { ar: 'الكل', en: 'All' } },
    { key: 'due_today', label: { ar: 'اليوم', en: 'Due Today' } },
    { key: 'overdue', label: { ar: 'متأخرة', en: 'Overdue' } },
    { key: 'week', label: { ar: 'هذا الأسبوع', en: 'This Week' } },
    { key: 'high', label: { ar: 'أولوية عالية', en: 'High Priority' } },
    { key: 'completed', label: { ar: 'منتهية', en: 'Completed' } },
    { key: 'recurring', label: { ar: 'متكررة', en: 'Recurring' } },
  ];

  const VIEWS: { key: ViewKey; label: Bi; icon: string }[] = [
    { key: 'list', label: { ar: 'قائمة', en: 'List' }, icon: 'clipboard' },
    { key: 'kanban', label: { ar: 'لوحة', en: 'Kanban' }, icon: 'chart' },
    { key: 'calendar', label: { ar: 'تقويم', en: 'Calendar' }, icon: 'file' },
  ];

  const summaryCards = [
    { label: { ar: 'مفتوحة', en: 'Open' }, value: stats.open, tone: 'text-indigo-600' },
    { label: { ar: 'اليوم', en: 'Due Today' }, value: stats.dueToday, tone: 'text-amber-600' },
    { label: { ar: 'متأخرة', en: 'Overdue' }, value: stats.overdue, tone: 'text-red-600' },
    { label: { ar: 'جارية', en: 'In Progress' }, value: stats.inProgress, tone: 'text-amber-700' },
    { label: { ar: 'منتهية', en: 'Completed' }, value: stats.done, tone: 'text-emerald-600' },
    { label: { ar: 'أولوية عالية', en: 'High Priority' }, value: stats.highOpen, tone: 'text-orange-600' },
    { label: { ar: 'متكررة', en: 'Recurring' }, value: stats.recurring, tone: 'text-purple-600' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{L({ ar: 'مهام الفريق', en: 'Team Tasks' })}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{L({ ar: 'مركز تحكّم عمليات المالية والفريق — تتبّع المستحق والمتأخر والمتكرر', en: 'Finance & team operations control — track due, overdue and recurring work' })}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setEditId(null); setShowForm(true); }}>
          <Icon name="plus" size={16} /> {L({ ar: 'مهمة جديدة', en: 'New Task' })}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
        {summaryCards.map((c) => (
          <div key={c.label.en} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className={cx('text-2xl font-bold', c.tone)}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{L(c.label)}</div>
          </div>
        ))}
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="bell" size={16} />
            <span className="text-sm font-semibold text-amber-800">{L({ ar: 'يحتاج انتباهك', en: 'Needs Attention' })} · {needsAttention.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {needsAttention.slice(0, 6).map((t) => {
              const over = isOverdue(t); const d = parseDate(t.due_date); const diff = d ? dayDiff(d, startOfToday()) : 0;
              return (
                <button key={t.id} onClick={() => setDrawerId(t.id)}
                  className={cx('flex items-center justify-between rounded-lg px-3 py-1.5 text-xs text-start', over ? 'bg-red-100 text-red-800 hover:bg-red-200' : 'bg-amber-100 text-amber-800 hover:bg-amber-200')}>
                  <span className="font-medium truncate">{t.title}</span>
                  <span className="font-bold shrink-0 ms-2">{over ? L({ ar: `متأخرة ${Math.abs(diff)} يوم`, en: `${Math.abs(diff)}d overdue` }) : L({ ar: 'اليوم', en: 'Today' })}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls: presets + search + view */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={cx('px-3 py-1.5 rounded-full text-sm font-medium border transition', preset === p.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
            {L(p.label)}
          </button>
        ))}
        <div className="relative ms-auto">
          <span className="absolute top-1/2 -translate-y-1/2 start-2.5 text-gray-400 pointer-events-none"><Icon name="search" size={15} /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={L({ ar: 'بحث…', en: 'Search…' })}
            className="border border-gray-200 rounded-lg ps-8 pe-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} title={L(v.label)}
              className={cx('px-3 py-1.5 text-sm flex items-center gap-1.5', view === v.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
              <Icon name={v.icon} size={15} /><span className="hidden sm:inline">{L(v.label)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap text-sm">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">{L({ ar: 'كل الحالات', en: 'All statuses' })}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{L(STATUS_LABEL[s])}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">{L({ ar: 'كل الأولويات', en: 'All priorities' })}</option>
          {PRIORITY.map((p) => <option key={p} value={p}>{L(PRIORITY_LABEL[p])}</option>)}
        </select>
        <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">{L({ ar: 'كل المسؤولين', en: 'All owners' })}</option>
          {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={fRecur} onChange={(e) => setFRecur(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">{L({ ar: 'كل التكرارات', en: 'All recurrence' })}</option>
          {RECURRENCE.map((r) => <option key={r} value={r}>{L(RECUR_LABEL[r])}</option>)}
        </select>
        {view === 'list' && (
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="created">{L({ ar: 'ترتيب: الأحدث', en: 'Sort: Newest' })}</option>
            <option value="due">{L({ ar: 'ترتيب: الاستحقاق', en: 'Sort: Due date' })}</option>
            <option value="priority">{L({ ar: 'ترتيب: الأولوية', en: 'Sort: Priority' })}</option>
          </select>
        )}
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="text-indigo-600 hover:underline flex items-center gap-1">
            <Icon name="x" size={14} /> {L({ ar: 'مسح', en: 'Reset' })} ({activeFilterCount})
          </button>
        )}
        <span className="text-gray-400 text-xs ms-auto">{visible.length} / {tasks.length}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {view === 'list' && <ListView tasks={visible} />}
          {view === 'kanban' && <KanbanView />}
          {view === 'calendar' && <CalendarView />}
        </>
      )}

      {/* Team workload */}
      {!loading && workload.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="users" size={16} />
            <h3 className="font-bold text-gray-800 text-sm">{L({ ar: 'حِمل عمل الفريق', en: 'Team Workload' })}</h3>
            <span className="text-[11px] text-gray-400">{L({ ar: '(رؤية تشغيلية — ليست تقييم أداء)', en: '(operational visibility — not a performance rating)' })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-start px-3 py-2">{L({ ar: 'المسؤول', en: 'Owner' })}</th>
                  <th className="text-start px-3 py-2">{L({ ar: 'مفتوحة', en: 'Open' })}</th>
                  <th className="text-start px-3 py-2">{L({ ar: 'متأخرة', en: 'Overdue' })}</th>
                  <th className="text-start px-3 py-2">{L({ ar: 'أولوية عالية', en: 'High' })}</th>
                  <th className="text-start px-3 py-2">{L({ ar: 'منتهية', en: 'Done' })}</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.owner} className="border-t border-gray-50">
                    <td className="px-3 py-2"><OwnerChip o={w.owner} /></td>
                    <td className="px-3 py-2 font-semibold">{w.open}</td>
                    <td className="px-3 py-2 text-red-600 font-semibold">{w.overdue || '—'}</td>
                    <td className="px-3 py-2 text-orange-600">{w.high || '—'}</td>
                    <td className="px-3 py-2 text-emerald-600">{w.done || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Task Drawer ── */}
      <Drawer open={!!drawerTask} onClose={() => setDrawerId(null)} title={drawerTask?.title || ''}>
        {drawerTask && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <PriorityBadge p={drawerTask.priority} />
              <StatusBadge s={drawerTask.status} />
              {drawerTask.recurrence !== 'none' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">↻ {L(RECUR_LABEL[drawerTask.recurrence])}</span>}
            </div>
            {drawerTask.reason && <p className="text-gray-600">{drawerTask.reason}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Meta label={L({ ar: 'المسؤول', en: 'Owner' })}><OwnerChip o={drawerTask.owner} /></Meta>
              <Meta label={L({ ar: 'الفريق', en: 'Team' })}>{drawerTask.team}</Meta>
              <Meta label={L({ ar: 'الموظف المقترح', en: 'Suggested' })}>{drawerTask.recommended_employee || '—'}</Meta>
              <Meta label={L({ ar: 'الاستحقاق', en: 'Due' })}><DueCell t={drawerTask} /></Meta>
              <Meta label={L({ ar: 'أُنشئت', en: 'Created' })}>{fmtDate(drawerTask.created_at, locale)}</Meta>
              <Meta label={L({ ar: 'آخر تحديث', en: 'Updated' })}>{fmtDate(drawerTask.updated_at, locale)}</Meta>
            </div>

            {drawerTask.notes && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">{L({ ar: 'الوصف / ملاحظات', en: 'Description' })}</div>
                <p className="bg-gray-50 rounded-lg p-3 text-gray-700 whitespace-pre-wrap">{drawerTask.notes}</p>
              </div>
            )}

            {/* Comments */}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-2">{L({ ar: 'التعليقات', en: 'Comments' })} ({drawerTask.comments?.length || 0})</div>
              <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                {(drawerTask.comments || []).length === 0 && <p className="text-xs text-gray-400">{L({ ar: 'لا توجد تعليقات بعد', en: 'No comments yet' })}</p>}
                {(drawerTask.comments || []).map((c) => (
                  <div key={c.id} className="flex gap-2 items-start">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold shrink-0">{c.author?.[0] || '?'}</div>
                    <div className="flex-1 bg-gray-50 rounded-lg p-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                        <span className="text-[11px] text-gray-400">{fmtTime(c.created_at, locale)}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                    </div>
                    <button onClick={() => deleteComment(drawerTask.id, c.id)} className="text-gray-300 hover:text-red-400 mt-1" aria-label="delete comment"><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={commentText[drawerTask.id] || ''}
                  onChange={(e) => setCommentText((p) => ({ ...p, [drawerTask.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && postComment(drawerTask.id)}
                  placeholder={L({ ar: 'اكتب تعليقاً…', en: 'Write a comment…' })}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <Button variant="secondary" onClick={() => postComment(drawerTask.id)} disabled={postingComment || !(commentText[drawerTask.id] || '').trim()}>
                  {L({ ar: 'إرسال', en: 'Send' })}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => { openEdit(drawerTask); }}>
                <Icon name="clipboard" size={15} /> {L({ ar: 'تعديل', en: 'Edit' })}
              </Button>
              <Button variant="danger" onClick={() => setConfirmDel(drawerTask)}>
                <Icon name="x" size={15} /> {L({ ar: 'حذف', en: 'Delete' })}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Create / Edit modal ── */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditId(null); }} title={editId ? L({ ar: 'تعديل المهمة', en: 'Edit Task' }) : L({ ar: 'مهمة جديدة', en: 'New Task' })}>
        <div className="space-y-4">
          <Section title={L({ ar: 'تفاصيل المهمة', en: 'Task Details' })}>
            <FieldRow label={L({ ar: 'العنوان *', en: 'Title *' })}>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={L({ ar: 'عنوان المهمة…', en: 'Task title…' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </FieldRow>
            <FieldRow label={L({ ar: 'السبب / المبرر', en: 'Reason' })}>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </FieldRow>
          </Section>

          <Section title={L({ ar: 'الإسناد', en: 'Assignment' })}>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label={L({ ar: 'الفريق', en: 'Team' })}>
                <select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {TEAMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </FieldRow>
              <FieldRow label={L({ ar: 'المسؤول', en: 'Owner' })}>
                <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {OWNERS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </FieldRow>
            </div>
            <FieldRow label={L({ ar: 'الموظف المقترح', en: 'Suggested employee' })}>
              <input value={form.recommended_employee} onChange={(e) => setForm({ ...form, recommended_employee: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </FieldRow>
          </Section>

          <Section title={L({ ar: 'الأولوية والحالة', en: 'Priority & Status' })}>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label={L({ ar: 'الأولوية *', en: 'Priority *' })}>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {PRIORITY.map((p) => <option key={p} value={p}>{L(PRIORITY_LABEL[p])}</option>)}
                </select>
              </FieldRow>
              <FieldRow label={L({ ar: 'الحالة', en: 'Status' })}>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {STATUSES.map((s) => <option key={s} value={s}>{L(STATUS_LABEL[s])}</option>)}
                </select>
              </FieldRow>
            </div>
          </Section>

          <Section title={L({ ar: 'التواريخ والتكرار', en: 'Dates & Recurrence' })}>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label={L({ ar: 'تاريخ الاستحقاق', en: 'Due date' })}>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </FieldRow>
              <FieldRow label={L({ ar: 'التكرار', en: 'Recurrence' })}>
                <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {RECURRENCE.map((r) => <option key={r} value={r}>{L(RECUR_LABEL[r])}</option>)}
                </select>
              </FieldRow>
            </div>
            {form.recurrence !== 'none' && (
              <p className="text-[11px] text-gray-400 mt-1">{L({ ar: 'ملاحظة: التكرار وصفي فقط — النظام لا يُنشئ النسخ التالية تلقائياً.', en: 'Note: recurrence is descriptive only — the system does not auto-create future occurrences.' })}</p>
            )}
          </Section>

          <Section title={L({ ar: 'الوصف', en: 'Description' })}>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              placeholder={L({ ar: 'تفاصيل أو ملاحظات إضافية…', en: 'Additional details or notes…' })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </Section>

          <div className="flex gap-3 pt-2">
            <Button onClick={saveTask} disabled={saving || !form.title.trim()} className="flex-1">
              {saving ? <Spinner size={16} /> : <Icon name="check" size={16} />} {editId ? L({ ar: 'حفظ التعديلات', en: 'Save changes' }) : L({ ar: 'حفظ المهمة', en: 'Create task' })}
            </Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditId(null); }}>{L({ ar: 'إلغاء', en: 'Cancel' })}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={L({ ar: 'حذف المهمة', en: 'Delete Task' })}>
        <p className="text-sm text-gray-600 mb-4">
          {L({ ar: 'سيتم حذف المهمة نهائياً:', en: 'This will permanently delete:' })} <span className="font-semibold text-gray-900">{confirmDel?.title}</span>
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={doDelete} disabled={deleting} className="flex-1">
            {deleting ? <Spinner size={16} /> : <Icon name="x" size={16} />} {L({ ar: 'تأكيد الحذف', en: 'Confirm delete' })}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDel(null)}>{L({ ar: 'إلغاء', en: 'Cancel' })}</Button>
        </div>
      </Modal>

      <TaskAssistant onChanged={load} />
    </div>
  );

  // ─── Views (closures over state) ───
  function ListView({ tasks: rows }: { tasks: Task[] }) {
    if (rows.length === 0) return <EmptyState title={L({ ar: 'لا توجد مهام', en: 'No tasks' })} />;
    return (
      <>
        {/* desktop table */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-start px-4 py-3">{L({ ar: 'المهمة', en: 'Task' })}</th>
                <th className="text-start px-4 py-3 w-32">{L({ ar: 'المسؤول', en: 'Owner' })}</th>
                <th className="text-start px-4 py-3 w-28">{L({ ar: 'الأولوية', en: 'Priority' })}</th>
                <th className="text-start px-4 py-3 w-32">{L({ ar: 'الحالة', en: 'Status' })}</th>
                <th className="text-start px-4 py-3 w-28">{L({ ar: 'الاستحقاق', en: 'Due' })}</th>
                <th className="text-start px-4 py-3 w-20">{L({ ar: 'تكرار', en: 'Repeat' })}</th>
                <th className="text-start px-4 py-3 w-16">{L({ ar: 'تعليق', en: 'Notes' })}</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((t) => (
                <tr key={t.id} className={cx('hover:bg-indigo-50/30 transition cursor-pointer', t.status === 'done' && 'opacity-60')} onClick={() => setDrawerId(t.id)}>
                  <td className="px-4 py-3">
                    <p className={cx('font-medium text-gray-800', t.status === 'done' && 'line-through text-gray-400')}>{t.title}</p>
                    {t.reason && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{t.reason}</p>}
                  </td>
                  <td className="px-4 py-3"><OwnerChip o={t.owner} /></td>
                  <td className="px-4 py-3"><PriorityBadge p={t.priority} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select value={t.status} onChange={(e) => patchTask(t.id, { status: e.target.value })}
                      className={cx('text-xs px-2 py-1 rounded-full border font-medium appearance-none cursor-pointer', STATUS_STYLE[t.status])}>
                      {STATUSES.map((s) => <option key={s} value={s}>{L(STATUS_LABEL[s])}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3"><DueCell t={t} /></td>
                  <td className="px-4 py-3 text-xs text-gray-400">{t.recurrence === 'none' ? '—' : L(RECUR_LABEL[t.recurrence])}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.comments?.length || 0}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" aria-label="edit"><Icon name="clipboard" size={15} /></button>
                      <button onClick={() => setConfirmDel(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="delete"><Icon name="x" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="md:hidden space-y-3">
          {rows.map((t) => (
            <div key={t.id} className={cx('bg-white rounded-xl border border-gray-100 shadow-sm p-3', t.status === 'done' && 'opacity-60')} onClick={() => setDrawerId(t.id)}>
              <div className="flex items-start justify-between gap-2">
                <p className={cx('font-medium text-gray-800', t.status === 'done' && 'line-through text-gray-400')}>{t.title}</p>
                <PriorityBadge p={t.priority} />
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <OwnerChip o={t.owner} />
                <StatusBadge s={t.status} />
                <DueCell t={t} />
                {t.recurrence !== 'none' && <span className="text-[11px] text-purple-600">↻ {L(RECUR_LABEL[t.recurrence])}</span>}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function KanbanView() {
    const cols = STATUSES;
    return (
      <div className="overflow-x-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-[640px] lg:min-w-0">
          {cols.map((s) => {
            const colTasks = visible.filter((t) => t.status === s);
            return (
              <div key={s} className="bg-gray-50 rounded-xl p-2">
                <div className="flex items-center justify-between px-2 py-1.5 mb-2">
                  <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[s])}>{L(STATUS_LABEL[s])}</span>
                  <span className="text-xs text-gray-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <div key={t.id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5 cursor-pointer hover:shadow" onClick={() => setDrawerId(t.id)}>
                      <p className="text-sm font-medium text-gray-800 mb-1.5">{t.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <PriorityBadge p={t.priority} />
                        <OwnerChip o={t.owner} />
                      </div>
                      <div className="flex items-center justify-between">
                        <DueCell t={t} />
                        <select value={t.status} onChange={(e) => patchTask(t.id, { status: e.target.value })} onClick={(e) => e.stopPropagation()}
                          className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 bg-white cursor-pointer" title={L({ ar: 'نقل', en: 'Move' })}>
                          {STATUSES.map((x) => <option key={x} value={x}>{L(STATUS_LABEL[x])}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && <p className="text-center text-xs text-gray-300 py-4">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function CalendarView() {
    const { y, m } = calMonth;
    const first = new Date(y, m, 1);
    const startWeekday = first.getDay(); // 0 Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const monthName = new Date(y, m, 1).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' });
    const weekdays = locale === 'ar' ? ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDay: Record<number, Task[]> = {};
    for (const t of visible) { const d = parseDate(t.due_date); if (d && d.getFullYear() === y && d.getMonth() === m) { (byDay[d.getDate()] = byDay[d.getDate()] || []).push(t); } }
    const todayD = startOfToday();
    const prev = () => setCalMonth(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
    const next = () => setCalMonth(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="prev"><Icon name="chevronRight" size={18} /></button>
          <h3 className="font-bold text-gray-800">{monthName}</h3>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="next"><Icon name="chevronLeft" size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
          {weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const dayTasks = byDay[d] || [];
            const isToday = todayD.getFullYear() === y && todayD.getMonth() === m && todayD.getDate() === d;
            return (
              <div key={i} className={cx('min-h-[74px] rounded-lg border p-1 text-start align-top', isToday ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100')}>
                <div className={cx('text-[11px] mb-1', isToday ? 'font-bold text-indigo-600' : 'text-gray-400')}>{d}</div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button key={t.id} onClick={() => setDrawerId(t.id)} title={t.title}
                      className={cx('block w-full truncate text-start text-[10px] px-1 py-0.5 rounded', isOverdue(t) ? 'bg-red-100 text-red-700' : STATUS_STYLE[t.status])}>
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && <span className="text-[10px] text-gray-400">+{dayTasks.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

// ─── tiny presentational helpers ───
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] text-gray-400 mb-0.5">{label}</div><div className="text-sm text-gray-700">{children}</div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="text-xs font-bold text-gray-400 uppercase tracking-wide">{title}</div>{children}</div>;
}
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>{children}</div>;
}
