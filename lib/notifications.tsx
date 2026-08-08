'use client';
// مركز الانتباه — يشتق تنبيهات قابلة للتنفيذ من بيانات UME الموجودة فقط.
// لا جدول إشعارات في الباك، لا WebSocket، لا worker. جلب واحد مشترك بين الجرس ومركز الإشعارات.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { fmtMoney, fmtCcyMap, sumByCurrency, n0 } from '@/lib/format';

export type Severity = 'critical' | 'warning' | 'info';
export type Category = 'financial' | 'tasks' | 'fleet';

export interface Notif {
  id: string;                 // ثابت عبر التحميلات: `${type}:${recordId}`
  type: string;
  category: Category;
  severity: Severity;
  route: string;              // مسار تنقّل موجود
  sortDays: number;           // للترتيب: الأكثر تأخراً/إلحاحاً أولاً (أصغر = أهم)
  data: Record<string, any>;  // القيم الديناميكية لبناء العنوان حسب اللغة
}

// عتبات واجهة موثّقة (بدون تحويل عملات)
export const THRESHOLDS = {
  DUE_SOON_DAYS: 7,
  CRITICAL_OVERDUE_DAYS: 30,
  CRITICAL_OVERDUE_DAYS_IF_MATERIAL: 15,
  CRITICAL_MATERIAL_AMOUNT: 25000,
  MATERIAL_OUTSTANDING: 50000,   // لتجميع المورد/المركب لكل عملة
  LARGE_PAYMENT: 50000,          // بعملة الدفعة نفسها
};

const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const m = String(s).slice(0, 10).split('-').map(Number);
  if (m.length < 3 || m.some((x) => !isFinite(x))) return null;
  return new Date(m[0], m[1] - 1, m[2]); // منتصف الليل محلياً
}
function startOfToday(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function dayDiff(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / 86400000); }

// ── محرك الاشتقاق (نقي — يسهل التحقق منه) ──
export function computeNotifications(invoices: any[], tasks: any[], payments: any[]): Notif[] {
  const today = startOfToday();
  const out: Notif[] = [];

  // ── فواتير ──
  for (const i of invoices) {
    const active = i.status === 'unpaid' || i.status === 'partial';
    const outstanding = n0(i.total_amount) - n0(i.paid_amount);
    const ccy = (i.currency || 'USD').toUpperCase();
    const due = parseDate(i.due_date);
    const num = i.invoice_number || i.id;
    const supplier = i.supplier?.name || '';

    if (active && due) {
      const diff = dayDiff(due, today);
      if (diff < 0) {
        const overdueDays = Math.abs(diff);
        const critical = overdueDays >= THRESHOLDS.CRITICAL_OVERDUE_DAYS ||
          (overdueDays >= THRESHOLDS.CRITICAL_OVERDUE_DAYS_IF_MATERIAL && outstanding >= THRESHOLDS.CRITICAL_MATERIAL_AMOUNT);
        out.push({ id: `inv_overdue:${i.id}`, type: 'invoice_overdue', category: 'financial',
          severity: critical ? 'critical' : 'warning', route: `/dashboard/invoices?q=${encodeURIComponent(num)}`, sortDays: diff,
          data: { num, days: overdueDays, amount: outstanding, currency: ccy, supplier } });
      } else if (diff <= THRESHOLDS.DUE_SOON_DAYS) {
        out.push({ id: `inv_due_soon:${i.id}`, type: 'invoice_due_soon', category: 'financial',
          severity: 'warning', route: `/dashboard/invoices?q=${encodeURIComponent(num)}`, sortDays: diff,
          data: { num, days: diff, amount: outstanding, currency: ccy, supplier } });
      }
    }
    if (i.approval_status === 'waiting_approval') {
      out.push({ id: `inv_awaiting:${i.id}`, type: 'invoice_awaiting', category: 'financial',
        severity: 'info', route: `/dashboard/invoices?q=${encodeURIComponent(num)}`, sortDays: 100,
        data: { num, amount: outstanding, currency: ccy, supplier } });
    }
    // مدفوعة جزئياً وليست متأخرة/قريبة الاستحقاق (لتجنّب التكرار)
    if (i.status === 'partial' && (!due || dayDiff(due, today) > THRESHOLDS.DUE_SOON_DAYS)) {
      out.push({ id: `inv_partial:${i.id}`, type: 'invoice_partial', category: 'financial',
        severity: 'info', route: `/dashboard/invoices?q=${encodeURIComponent(num)}`, sortDays: 200,
        data: { num, amount: outstanding, currency: ccy, supplier } });
    }
  }

  // ── مهام ──
  for (const t of tasks) {
    const active = t.status !== 'done' && t.status !== 'cancelled';
    if (!active) continue;
    const due = parseDate(t.due_date);
    if (!due) continue;
    const diff = dayDiff(due, today);
    const urgent = t.priority === 'urgent';
    if (diff < 0) {
      out.push({ id: `task_overdue:${t.id}`, type: 'task_overdue', category: 'tasks',
        severity: urgent ? 'critical' : 'warning', route: `/dashboard/tasks?q=${encodeURIComponent(t.title || '')}`, sortDays: diff,
        data: { title: t.title, days: Math.abs(diff), urgent, owner: t.owner } });
    } else if (diff === 0) {
      out.push({ id: `task_due_today:${t.id}`, type: 'task_due_today', category: 'tasks',
        severity: urgent ? 'warning' : 'info', route: `/dashboard/tasks?q=${encodeURIComponent(t.title || '')}`, sortDays: 0,
        data: { title: t.title, urgent, owner: t.owner } });
    }
  }

  // ── مدفوعات فعلية فقط ──
  for (const p of payments) {
    const ccy = (p.currency || 'USD').toUpperCase();
    const invCcy = (p.invoice?.currency || '').toUpperCase();
    const num = p.invoice?.invoice_number || p.invoice_number || p.reference || p.id;
    if (invCcy && invCcy !== ccy) {
      out.push({ id: `pay_mismatch:${p.id}`, type: 'payment_mismatch', category: 'financial',
        severity: 'warning', route: `/dashboard/payments?q=${encodeURIComponent(num)}`, sortDays: 50,
        data: { num, currency: ccy, invCurrency: invCcy, amount: n0(p.amount) } });
    }
    if (Math.abs(n0(p.amount)) >= THRESHOLDS.LARGE_PAYMENT) {
      out.push({ id: `pay_large:${p.id}`, type: 'payment_large', category: 'financial',
        severity: 'info', route: `/dashboard/payments?q=${encodeURIComponent(num)}`, sortDays: 60,
        data: { num, currency: ccy, amount: n0(p.amount) } });
    }
  }

  // ── تجميع مستحقات المورد (لكل عملة) — من الفواتير غير المدفوعة فقط ──
  const unpaid = invoices.filter((i) => i.status === 'unpaid' || i.status === 'partial');
  const bySupplier: Record<string, any[]> = {};
  const byVessel: Record<string, any[]> = {};
  for (const i of unpaid) {
    const s = i.supplier?.name; if (s) (bySupplier[s] = bySupplier[s] || []).push(i);
    const v = i.vessel?.name; if (v) (byVessel[v] = byVessel[v] || []).push(i);
  }
  for (const [name, list] of Object.entries(bySupplier)) {
    const map = sumByCurrency(list, (i: any) => n0(i.total_amount) - n0(i.paid_amount), (i: any) => i.currency);
    const maxV = Math.max(0, ...Object.values(map));
    if (maxV >= THRESHOLDS.MATERIAL_OUTSTANDING) {
      out.push({ id: `sup_outstanding:${name}`, type: 'supplier_outstanding', category: 'financial',
        severity: 'warning', route: `/dashboard/suppliers?q=${encodeURIComponent(name)}`, sortDays: 300 - maxV / 1e6,
        data: { name, ccyText: fmtCcyMap(map), count: list.length } });
    }
  }
  for (const [name, list] of Object.entries(byVessel)) {
    const map = sumByCurrency(list, (i: any) => n0(i.total_amount) - n0(i.paid_amount), (i: any) => i.currency);
    const maxV = Math.max(0, ...Object.values(map));
    if (maxV >= THRESHOLDS.MATERIAL_OUTSTANDING) {
      out.push({ id: `ves_outstanding:${name}`, type: 'vessel_outstanding', category: 'fleet',
        severity: 'warning', route: `/dashboard/vessels?q=${encodeURIComponent(name)}`, sortDays: 400 - maxV / 1e6,
        data: { name, ccyText: fmtCcyMap(map), count: list.length } });
    }
  }

  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.sortDays - b.sortDays);
}

// ── نص العنوان/التفسير حسب اللغة ──
export function describeNotif(n: Notif, locale: 'ar' | 'en'): { title: string; detail: string } {
  const d = n.data; const ar = locale === 'ar';
  const money = (a: any, c: any) => fmtMoney(a, c);
  switch (n.type) {
    case 'invoice_overdue':
      return { title: ar ? `فاتورة ${d.num} متأخرة ${d.days} يوم` : `Invoice ${d.num} overdue by ${d.days} days`,
        detail: ar ? `مستحق: ${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` : `Outstanding: ${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` };
    case 'invoice_due_soon':
      return { title: ar ? `فاتورة ${d.num} تستحق ${d.days === 0 ? 'اليوم' : `خلال ${d.days} يوم`}` : `Invoice ${d.num} due ${d.days === 0 ? 'today' : `in ${d.days} days`}`,
        detail: ar ? `مستحق: ${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` : `Outstanding: ${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` };
    case 'invoice_awaiting':
      return { title: ar ? `فاتورة ${d.num} بانتظار الاعتماد` : `Invoice ${d.num} awaiting approval`,
        detail: ar ? `${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` : `${money(d.amount, d.currency)}${d.supplier ? ' — ' + d.supplier : ''}` };
    case 'invoice_partial':
      return { title: ar ? `فاتورة ${d.num} مدفوعة جزئياً` : `Invoice ${d.num} partially paid`,
        detail: ar ? `متبقٍ: ${money(d.amount, d.currency)}` : `Remaining: ${money(d.amount, d.currency)}` };
    case 'task_overdue':
      return { title: ar ? `مهمة «${d.title}» متأخرة ${d.days} يوم${d.urgent ? ' (عاجلة)' : ''}` : `Task "${d.title}" overdue by ${d.days} days${d.urgent ? ' (urgent)' : ''}`,
        detail: d.owner ? (ar ? `المسؤول: ${d.owner}` : `Owner: ${d.owner}`) : '' };
    case 'task_due_today':
      return { title: ar ? `مهمة «${d.title}» مستحقة اليوم${d.urgent ? ' (عاجلة)' : ''}` : `Task "${d.title}" due today${d.urgent ? ' (urgent)' : ''}`,
        detail: d.owner ? (ar ? `المسؤول: ${d.owner}` : `Owner: ${d.owner}`) : '' };
    case 'payment_mismatch':
      return { title: ar ? `دفعة بعملة (${d.currency}) تختلف عن الفاتورة (${d.invCurrency})` : `Payment currency (${d.currency}) differs from invoice (${d.invCurrency})`,
        detail: ar ? `فاتورة ${d.num} — ${money(d.amount, d.currency)}` : `Invoice ${d.num} — ${money(d.amount, d.currency)}` };
    case 'payment_large':
      return { title: ar ? `دفعة كبيرة ${money(d.amount, d.currency)}` : `Large payment ${money(d.amount, d.currency)}`,
        detail: ar ? `فاتورة ${d.num}` : `Invoice ${d.num}` };
    case 'supplier_outstanding':
      return { title: ar ? `مورد ${d.name} عليه مستحقات كبيرة` : `Supplier ${d.name} has material outstanding`,
        detail: `${d.ccyText}${d.count ? (ar ? ` · ${d.count} فاتورة` : ` · ${d.count} invoices`) : ''}` };
    case 'vessel_outstanding':
      return { title: ar ? `مركب ${d.name} عليه مستحقات موردين` : `Vessel ${d.name} has supplier outstanding`,
        detail: `${d.ccyText}${d.count ? (ar ? ` · ${d.count} فاتورة` : ` · ${d.count} invoices`) : ''}` };
    default:
      return { title: n.type, detail: '' };
  }
}

export const NOTIF_ICON: Record<string, string> = {
  invoice_overdue: 'receipt', invoice_due_soon: 'receipt', invoice_awaiting: 'receipt', invoice_partial: 'receipt',
  task_overdue: 'check', task_due_today: 'check',
  payment_mismatch: 'card', payment_large: 'card',
  supplier_outstanding: 'factory', vessel_outstanding: 'ship',
};

// ── حالة محلية (قراءة/إخفاء) — متصفّح فقط، غير مُزامنة ──
const DISMISS_KEY = 'ume_notif_dismissed';
const READ_KEY = 'ume_notif_read';
function readSet(key: string): Set<string> { try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } }
function writeSet(key: string, s: Set<string>) { try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* noop */ } }

interface Ctx {
  loading: boolean; error: boolean;
  all: Notif[];            // كل التنبيهات المشتقة (قبل الإخفاء)
  active: Notif[];         // غير المُخفاة
  unreadCount: number;     // غير المُخفاة وغير المقروءة (حالة محلية)
  isRead: (id: string) => boolean;
  isDismissed: (id: string) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  refresh: () => void;
}
const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(() => {
    setLoading(true); setError(false);
    Promise.all([
      api.get('/api/invoices').then((r) => r.data).catch(() => null),
      api.get('/api/tasks').then((r) => r.data).catch(() => null),
      api.get('/api/payments').then((r) => r.data).catch(() => null),
    ]).then(([inv, tsk, pay]) => {
      if (inv == null && tsk == null && pay == null) { setError(true); }
      setInvoices(Array.isArray(inv) ? inv : []);
      setTasks(Array.isArray(tsk) ? tsk : []);
      setPayments(Array.isArray(pay) ? pay : []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setDismissed(readSet(DISMISS_KEY)); setRead(readSet(READ_KEY)); fetchAll(); }, [fetchAll]);

  const all = useMemo(() => computeNotifications(invoices, tasks, payments), [invoices, tasks, payments]);
  const active = useMemo(() => all.filter((n) => !dismissed.has(n.id)), [all, dismissed]);
  const unreadCount = useMemo(() => active.filter((n) => !read.has(n.id)).length, [active, read]);

  const markRead = useCallback((id: string) => setRead((s) => { const n = new Set(s); n.add(id); writeSet(READ_KEY, n); return n; }), []);
  const markAllRead = useCallback(() => setRead(() => { const n = new Set(all.map((x) => x.id)); writeSet(READ_KEY, n); return n; }), [all]);
  const dismiss = useCallback((id: string) => setDismissed((s) => { const n = new Set(s); n.add(id); writeSet(DISMISS_KEY, n); return n; }), []);

  const value: Ctx = {
    loading, error, all, active, unreadCount,
    isRead: (id) => read.has(id), isDismissed: (id) => dismissed.has(id),
    markRead, markAllRead, dismiss, refresh: fetchAll,
  };
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}

export function useNotifications(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) return { loading: false, error: false, all: [], active: [], unreadCount: 0, isRead: () => false, isDismissed: () => false, markRead: () => {}, markAllRead: () => {}, dismiss: () => {}, refresh: () => {} };
  return c;
}

export const SEVERITY_LABEL: Record<Severity, { ar: string; en: string }> = {
  critical: { ar: 'حرج', en: 'Critical' }, warning: { ar: 'تحذير', en: 'Warning' }, info: { ar: 'معلومة', en: 'Info' },
};
export const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
};
export const CATEGORY_LABEL: Record<Category, { ar: string; en: string }> = {
  financial: { ar: 'مالية', en: 'Financial' }, tasks: { ar: 'المهام', en: 'Tasks' }, fleet: { ar: 'الأسطول', en: 'Fleet' },
};
