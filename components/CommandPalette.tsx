'use client';
// البحث الشامل + لوحة الأوامر — تنقّل وإنتاجية. فرونت فقط، فلترة محلية، مراعية للصلاحيات.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { SCREENS, canAccess } from '@/lib/screens';
import { useI18n } from '@/lib/i18n';
import { Icon, cx } from '@/components/ui';
import { fmtMoney } from '@/lib/format';

interface Ctx { open: () => void; toggle: () => void; }
const PaletteCtx = createContext<Ctx | null>(null);
export function useCommandPalette(): Ctx { return useContext(PaletteCtx) || { open: () => {}, toggle: () => {} }; }

type Bi = { ar: string; en: string };
interface Result { key: string; group: string; groupLabel: Bi; icon: string; title: string; subtitle: string; route: string; rank: number; }

const GROUP_ORDER = ['command', 'suppliers', 'vessels', 'purchase-orders', 'invoices', 'payments', 'tasks', 'reports'];
const GROUP_LABEL: Record<string, Bi> = {
  command: { ar: 'أوامر وتنقّل', en: 'Commands' },
  suppliers: { ar: 'الموردون', en: 'Suppliers' },
  vessels: { ar: 'السفن', en: 'Vessels' },
  'purchase-orders': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
  invoices: { ar: 'الفواتير', en: 'Invoices' },
  payments: { ar: 'المدفوعات', en: 'Payments' },
  tasks: { ar: 'المهام', en: 'Tasks' },
  reports: { ar: 'التقارير', en: 'Reports' },
};

// دليل تقارير مصغّر للبحث (يفتح مركز التحليلات)
const REPORTS_CATALOG: { title: Bi; kw: string }[] = [
  { title: { ar: 'لوحة الأسطول التنفيذية', en: 'Fleet Executive Dashboard' }, kw: 'fleet أسطول dashboard' },
  { title: { ar: 'ربحية Pelagos', en: 'Pelagos Profitability' }, kw: 'pelagos ربح profit' },
  { title: { ar: 'ربحية Alcudia', en: 'Alcudia Profitability' }, kw: 'alcudia الكوديا ربح profit' },
  { title: { ar: 'ربحية Gubal', en: 'Gubal Profitability' }, kw: 'gubal جوبال ربح profit' },
  { title: { ar: 'كشف حساب مورد', en: 'Supplier Statement' }, kw: 'statement كشف مورد' },
  { title: { ar: 'مستحقات مورد', en: 'Supplier Outstanding' }, kw: 'outstanding مستحقات مورد' },
  { title: { ar: 'تنبيهات الاستحقاق', en: 'Due Alerts' }, kw: 'due alerts استحقاق' },
  { title: { ar: 'نشاط المستخدمين', en: 'User Activity' }, kw: 'user activity نشاط' },
  { title: { ar: 'أسعار الصرف', en: 'Exchange Rates' }, kw: 'exchange rates صرف عملات' },
];

// أسماء الشاشات بالإنجليزية (لتجنّب خلط العربي/الإنجليزي في الأوامر بوضع EN)
const EN_SCREEN: Record<string, string> = {
  '/dashboard': 'Dashboard', '/dashboard/suppliers': 'Suppliers', '/dashboard/purchase-orders': 'Purchase Orders',
  '/dashboard/invoices': 'Invoices', '/dashboard/items': 'Invoice Items', '/dashboard/payments': 'Payments',
  '/dashboard/vessels': 'Vessels', '/dashboard/customers': 'Customers', '/dashboard/hire-invoices': 'Hire Invoices',
  '/dashboard/shipping-companies': 'Shipping Companies', '/dashboard/management-invoices': 'Management Invoices',
  '/dashboard/profit-distribution': 'Profit Distribution', '/dashboard/tasks': 'Team Tasks',
  '/dashboard/users': 'Permissions', '/dashboard/reports': 'Reports', '/dashboard/notifications': 'Notifications',
};

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
function rankOf(hay: string, q: string): number {
  if (!q) return 3;
  if (hay === q) return 0;
  if (hay.startsWith(q)) return 1;
  if (hay.includes(q)) return 2;
  return -1;
}
// أفضل رتبة عبر عدة حقول
function bestRank(fields: any[], q: string): number {
  let best = -1;
  for (const f of fields) { const r = rankOf(norm(f), q); if (r >= 0 && (best < 0 || r < best)) best = r; }
  return best;
}

const RECENT_KEY = 'ume_search_recent';
function readRecent(): string[] { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, 6) : []; } catch { return []; } }
function pushRecent(q: string) { try { const cur = readRecent().filter((x) => x !== q); localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...cur].slice(0, 6))); } catch { /* noop */ } }

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const loc = locale === 'en' ? 'en' : 'ar';
  const L = (b: Bi) => b[loc];
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dq, setDq] = useState(''); // debounced
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<{ suppliers: any[]; vessels: any[]; pos: any[]; invoices: any[]; tasks: any[]; payments: any[] }>({ suppliers: [], vessels: [], pos: [], invoices: [], tasks: [], payments: [] });
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const user = typeof window !== 'undefined' ? getUser() : null;

  const can = useCallback((href: string) => { const s = SCREENS.find((x) => x.href === href); return s ? canAccess(user, s) : true; }, [user]);

  const open = useCallback(() => { setIsOpen(true); }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => { setIsOpen(false); setQuery(''); setDq(''); setActive(0); }, []);

  // Ctrl/Cmd + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggle(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // debounce query
  useEffect(() => { const id = setTimeout(() => setDq(query), 120); return () => clearTimeout(id); }, [query]);

  // lazy fetch on first open (accessible categories only)
  useEffect(() => {
    if (!isOpen) return;
    setRecent(readRecent());
    setTimeout(() => inputRef.current?.focus(), 30);
    if (loaded || loading) return;
    setLoading(true);
    const jobs: Promise<void>[] = [];
    const next: any = { suppliers: [], vessels: [], pos: [], invoices: [], tasks: [], payments: [] };
    const pull = (href: string, path: string, key: string) => { if (can(href)) jobs.push(api.get(path).then((r) => { next[key] = Array.isArray(r.data) ? r.data : []; }).catch(() => {})); };
    pull('/dashboard/suppliers', '/api/suppliers', 'suppliers');
    pull('/dashboard/vessels', '/api/vessels', 'vessels');
    pull('/dashboard/purchase-orders', '/api/purchase-orders', 'pos');
    pull('/dashboard/invoices', '/api/invoices', 'invoices');
    pull('/dashboard/tasks', '/api/tasks', 'tasks');
    pull('/dashboard/payments', '/api/payments', 'payments');
    Promise.all(jobs).then(() => { setData(next); setLoaded(true); }).finally(() => setLoading(false));
  }, [isOpen, loaded, loading, can]);

  function go(route: string) { pushRecent(query.trim() || ''); close(); router.push(route); }

  // ── build results ──
  const results = useMemo<Result[]>(() => {
    const q = norm(dq);
    const out: Result[] = [];
    const money = (a: any, c: any) => fmtMoney(a, c);

    // Commands: navigation + quick-create (permission-aware)
    const navItems: { label: Bi; route: string; icon: string; kw: string }[] = [];
    navItems.push({ label: { ar: 'الرئيسية', en: 'Dashboard' }, route: '/dashboard', icon: 'home', kw: 'home dashboard رئيسية' });
    for (const s of SCREENS) { if (s.href !== '/dashboard' && canAccess(user, s)) navItems.push({ label: { ar: `فتح ${s.label}`, en: `Open ${EN_SCREEN[s.href] || s.label}` }, route: s.href, icon: s.iconName || 'file', kw: `${s.label} ${EN_SCREEN[s.href] || ''} ${s.href}` }); }
    navItems.push({ label: { ar: 'مركز الانتباه', en: 'Notifications' }, route: '/dashboard/notifications', icon: 'bell', kw: 'notifications تنبيهات انتباه' });
    const creates: { label: Bi; href: string; route: string; kw: string }[] = [
      { label: { ar: 'إضافة مورد', en: 'Add Supplier' }, href: '/dashboard/suppliers', route: '/dashboard/suppliers', kw: 'add supplier مورد جديد' },
      { label: { ar: 'إضافة سفينة', en: 'Add Vessel' }, href: '/dashboard/vessels', route: '/dashboard/vessels', kw: 'add vessel سفينة جديد' },
      { label: { ar: 'إضافة أمر شراء', en: 'Add Purchase Order' }, href: '/dashboard/purchase-orders', route: '/dashboard/purchase-orders', kw: 'add po purchase order أمر شراء' },
      { label: { ar: 'إضافة فاتورة', en: 'Add Invoice' }, href: '/dashboard/invoices', route: '/dashboard/invoices', kw: 'add invoice فاتورة جديد' },
      { label: { ar: 'إضافة دفعة', en: 'Add Payment' }, href: '/dashboard/payments', route: '/dashboard/payments', kw: 'add payment دفعة جديد' },
      { label: { ar: 'إنشاء مهمة', en: 'Create Task' }, href: '/dashboard/tasks', route: '/dashboard/tasks', kw: 'create task مهمة جديد' },
    ];
    const pushCmd = (label: Bi, route: string, icon: string, kw: string) => {
      const r = bestRank([L(label), kw], q);
      if (q && r < 0) return;
      out.push({ key: `cmd:${route}:${L(label)}`, group: 'command', groupLabel: GROUP_LABEL.command, icon, title: L(label), subtitle: '', route, rank: q ? r : 3 });
    };
    navItems.forEach((n) => pushCmd(n.label, n.route, n.icon, n.kw));
    creates.forEach((c) => { if (can(c.href)) pushCmd(c.label, c.route, 'plus', c.kw); });

    // Records (only if query present, to avoid dumping all data)
    if (q) {
      // Suppliers
      for (const s of data.suppliers) {
        const r = bestRank([s.name, s.contact_person, s.email, s.phone, s.country], q); if (r < 0) continue;
        out.push({ key: `sup:${s.id}`, group: 'suppliers', groupLabel: GROUP_LABEL.suppliers, icon: 'factory', title: s.name || '—', subtitle: [s.country, s.contact_person].filter(Boolean).join(' · '), route: `/dashboard/suppliers?q=${encodeURIComponent(s.name || '')}`, rank: r });
      }
      // Vessels
      for (const v of data.vessels) {
        const r = bestRank([v.name, v.imo_number, v.vessel_type, v.shipping_company?.name], q); if (r < 0) continue;
        out.push({ key: `ves:${v.id}`, group: 'vessels', groupLabel: GROUP_LABEL.vessels, icon: 'ship', title: v.name || '—', subtitle: [v.vessel_type, v.imo_number].filter(Boolean).join(' · '), route: `/dashboard/vessels?q=${encodeURIComponent(v.name || '')}`, rank: r });
      }
      // Purchase Orders
      for (const p of data.pos) {
        const r = bestRank([p.po_number, p.supplier?.name, p.vessel?.name, p.description], q); if (r < 0) continue;
        out.push({ key: `po:${p.id}`, group: 'purchase-orders', groupLabel: GROUP_LABEL['purchase-orders'], icon: 'clipboard', title: p.po_number || '—', subtitle: [p.supplier?.name, p.vessel?.name].filter(Boolean).join(' · '), route: `/dashboard/purchase-orders?q=${encodeURIComponent(p.po_number || '')}`, rank: r });
      }
      // Invoices
      for (const i of data.invoices) {
        const r = bestRank([i.invoice_number, i.supplier?.name, i.vessel?.name, i.po_number], q); if (r < 0) continue;
        out.push({ key: `inv:${i.id}`, group: 'invoices', groupLabel: GROUP_LABEL.invoices, icon: 'receipt', title: i.invoice_number || '—', subtitle: [i.supplier?.name, money(i.total_amount, (i.currency || '').toUpperCase())].filter(Boolean).join(' · '), route: `/dashboard/invoices?q=${encodeURIComponent(i.invoice_number || '')}`, rank: r });
      }
      // Payments (actual transactions)
      for (const p of data.payments) {
        const num = p.invoice?.invoice_number || p.reference || '';
        const r = bestRank([p.reference, p.invoice?.invoice_number, p.payment_method], q); if (r < 0) continue;
        out.push({ key: `pay:${p.id}`, group: 'payments', groupLabel: GROUP_LABEL.payments, icon: 'card', title: p.reference || p.invoice?.invoice_number || '—', subtitle: [p.invoice?.invoice_number ? `#${p.invoice.invoice_number}` : '', money(p.amount, (p.currency || '').toUpperCase())].filter(Boolean).join(' · '), route: `/dashboard/payments?q=${encodeURIComponent(num)}`, rank: r });
      }
      // Tasks
      for (const t of data.tasks) {
        const r = bestRank([t.title, t.owner, t.team, t.notes], q); if (r < 0) continue;
        out.push({ key: `task:${t.id}`, group: 'tasks', groupLabel: GROUP_LABEL.tasks, icon: 'check', title: t.title || '—', subtitle: [t.owner, t.status].filter(Boolean).join(' · '), route: `/dashboard/tasks?q=${encodeURIComponent(t.title || '')}`, rank: r });
      }
      // Reports
      if (can('/dashboard/reports')) {
        for (const rp of REPORTS_CATALOG) {
          const r = bestRank([rp.title.ar, rp.title.en, rp.kw], q); if (r < 0) continue;
          out.push({ key: `rep:${rp.title.en}`, group: 'reports', groupLabel: GROUP_LABEL.reports, icon: 'chart', title: L(rp.title), subtitle: L({ ar: 'مركز التحليلات', en: 'Analytics Center' }), route: '/dashboard/reports', rank: r });
        }
      }
    }
    return out;
  }, [dq, data, user, loc]);

  // group + order (by best rank within group, then fixed priority) + per-group cap
  const grouped = useMemo(() => {
    const byG: Record<string, Result[]> = {};
    for (const r of results) (byG[r.group] = byG[r.group] || []).push(r);
    const groups = Object.entries(byG).map(([g, items]) => {
      items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
      return { group: g, items: items.slice(0, 8), best: Math.min(...items.map((x) => x.rank)) };
    });
    groups.sort((a, b) => a.best - b.best || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
    return groups;
  }, [results]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);
  useEffect(() => { setActive(0); }, [dq, isOpen]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = flat[active]; if (r) go(r.route); }
  }

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
  const hint = isMac ? '⌘K' : 'Ctrl K';

  return (
    <PaletteCtx.Provider value={{ open, toggle }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 sm:pt-24" onMouseDown={close} role="presentation">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] sm:max-h-[70vh] overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={L({ ar: 'البحث الشامل', en: 'Global search' })}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Icon name="search" size={18} />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
                placeholder={L({ ar: 'ابحث عن مورد، سفينة، فاتورة، مهمة… أو اكتب أمراً', en: 'Search suppliers, vessels, invoices, tasks… or type a command' })}
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              <kbd className="hidden sm:inline text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
            </div>

            <div ref={listRef} id="cmdk-list" role="listbox" className="overflow-y-auto p-2">
              {loading && flat.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">{L({ ar: 'جاري التحميل…', en: 'Loading…' })}</div>}

              {!dq && recent.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400">{L({ ar: 'عمليات بحث سابقة', en: 'Recent searches' })}</div>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {recent.map((rq) => (
                      <button key={rq} onClick={() => setQuery(rq)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1 text-gray-600">{rq}</button>
                    ))}
                    <button onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }} className="text-xs text-gray-400 hover:text-red-500 px-1">{L({ ar: 'مسح', en: 'Clear' })}</button>
                  </div>
                </div>
              )}

              {flat.length === 0 && !loading ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <Icon name="search" size={26} />
                  <p className="mt-2">{dq ? L({ ar: 'لا نتائج', en: 'No results found' }) : L({ ar: 'ابدأ الكتابة للبحث', en: 'Start typing to search' })}</p>
                  {dq && <p className="text-xs mt-1">{L({ ar: 'جرّب رقم فاتورة، مورد، سفينة، مهمة أو تقرير.', en: 'Try an invoice number, supplier, vessel, task or report.' })}</p>}
                </div>
              ) : (
                grouped.map((g) => {
                  let base = 0; for (const gg of grouped) { if (gg.group === g.group) break; base += gg.items.length; }
                  return (
                    <div key={g.group} className="mb-1">
                      <div className="px-2 py-1 text-[11px] font-semibold text-gray-400">{L(GROUP_LABEL[g.group])}</div>
                      {g.items.map((r, i) => {
                        const idx = base + i;
                        return (
                          <button key={r.key} data-idx={idx} role="option" aria-selected={active === idx}
                            onMouseEnter={() => setActive(idx)} onClick={() => go(r.route)}
                            className={cx('w-full text-start flex items-center gap-2.5 px-2.5 py-2 rounded-lg', active === idx ? 'bg-indigo-50' : 'hover:bg-gray-50')}>
                            <span className={cx('shrink-0 w-7 h-7 rounded-lg flex items-center justify-center', active === idx ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500')}>
                              <Icon name={r.icon} size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-800 truncate">{r.title}</span>
                              {r.subtitle && <span className="block text-xs text-gray-400 truncate">{r.subtitle}</span>}
                            </span>
                            {r.group === 'command' && <Icon name={locale === 'en' ? 'chevronLeft' : 'chevronRight'} size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
              <span>↑↓ {L({ ar: 'تنقّل', en: 'navigate' })}</span>
              <span>↵ {L({ ar: 'فتح', en: 'open' })}</span>
              <span>esc {L({ ar: 'إغلاق', en: 'close' })}</span>
              <span className="ms-auto">{hint}</span>
            </div>
          </div>
        </div>
      )}
    </PaletteCtx.Provider>
  );
}
