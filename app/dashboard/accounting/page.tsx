'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import AccountStatement from './AccountStatement';
import { getUser } from '@/lib/auth';
import { Card, Button, Badge, Input, Select, Skeleton, EmptyState, Modal, useToast, cx } from '@/components/ui';
import PostableInvoices from './PostableInvoices';

/*
 * الشاشة المحاسبية.
 *
 * ميزان المراجعة أولاً لأنه يجيب السؤال الأول الذي يخطر لمحاسب: أين تقف
 * الأرصدة؟ والقيود خلفه لمن يريد أن يعرف لماذا وقفت هناك.
 *
 * الترحيل فعل نهائي — فزرّه لا يُشبه بقية الأزرار، ويسأل قبل أن ينفّذ.
 */

const money = (n: any) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = (d: any) => (d ? String(d).slice(0, 10) : '—');

interface Account { id: string; code: string; name: string; name_ar?: string | null; account_type: string; account_group?: string | null; }
interface TbRow { id: string; code: string; name: string; account_type: string; normal_balance: string; debit_eur: string; credit_eur: string; }
interface Entry {
  id: string; entry_no: string | null; status: string; accounting_date: string;
  description: string; reference: string | null; accounting_event_type: string;
  total_debit_eur: string; total_credit_eur: string; is_backdated: boolean;
  source_type: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسوّدة', posted: 'مُرحَّل', reversed: 'معكوس', void: 'ملغى',
};
const STATUS_TONE: Record<string, string> = {
  draft: 'warning', posted: 'success', reversed: 'info', void: 'neutral',
};
const EVENT_LABEL: Record<string, string> = {
  opening_balance: 'رصيد افتتاحي', invoice_accrual: 'استحقاق فاتورة',
  payment_settlement: 'تسوية سداد', adjustment: 'تسوية', reversal: 'عكس',
  depreciation: 'إهلاك', fx_revaluation: 'إعادة تقييم صرف', manual: 'يدوي',
};

export default function AccountingPage() {
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [tb, setTb] = useState<any>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tb' | 'entries' | 'postable'>('tb');
  const [postableCount, setPostableCount] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [detail, setDetail] = useState<any>(null);
  const [ledgerFor, setLedgerFor] = useState<TbRow | null>(null);
  const [posting, setPosting] = useState<Entry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: string[]; failed: { ref: string; msg: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const screens: string[] = user?.allowed_screens ?? [];
  const isAdmin = user?.role === 'admin';
  const can = (s: string) => isAdmin || screens.includes(s);
  const canPost = can('/dashboard/accounting/posting');

  useEffect(() => { setUser(getUser()); }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/accounting/entities');
        setEntities(data || []);
        if (data?.length) setEntityId(data[0].id);
      } catch { setLoading(false); }
    })();
  }, []);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);

    // اللحاق قبل القراءة: أي شهر مكتمل بلا قيد إهلاك يظهر مسوّدةً الآن.
    // آمنٌ للتكرار — يُنشئ ما ينقص فقط، ولا يُرحّل شيئاً. وفشله لا يمنع العرض:
    // شاشة لا تفتح لأن مهمّة خلفية تعثّرت أسوأ من مسوّدة متأخّرة.
    await api.post('/api/accounting/bridge/depreciation/catch-up', { legal_entity_id: id })
      .catch(() => { /* يُتجاوَز بصمت — الدفتر يُعرض على كل حال */ });

    const r = await Promise.allSettled([
      api.get(`/api/accounting/trial-balance?legal_entity_id=${id}`),
      api.get('/api/accounting/entries'),
      api.get(`/api/accounting/accounts?legal_entity_id=${id}`),
    ]);
    if (r[0].status === 'fulfilled') setTb(r[0].value.data);
    if (r[1].status === 'fulfilled') setEntries(r[1].value.data || []);
    if (r[2].status === 'fulfilled') setAccounts(r[2].value.data || []);
    setLoading(false);
  }
  useEffect(() => { if (entityId) load(entityId); }, [entityId]);

  // عدّاد التبويب — يُظهر أن هناك عملاً ينتظر بلا فتحه.
  useEffect(() => {
    if (!entityId) return;
    api.get(`/api/accounting/bridge/postable-invoices?legal_entity_id=${entityId}`)
      .then(({ data }) => setPostableCount((data || []).filter((r: any) => r.eligible).length))
      .catch(() => setPostableCount(null));
  }, [entityId, entries.length]);

  const rows: TbRow[] = tb?.accounts ?? [];
  const drafts = useMemo(() => entries.filter((e) => e.status === 'draft'), [entries]);

  const filteredEntries = useMemo(() => {
    const s = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (!s) return true;
      return [e.entry_no, e.reference, e.description].some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [entries, q, statusFilter]);

  // الأرصدة بالتصنيف — يقرؤها من يريد الصورة قبل التفصيل.
  const byType = useMemo(() => {
    const g: Record<string, number> = {};
    for (const a of rows) {
      const net = Number(a.debit_eur) - Number(a.credit_eur);
      g[a.account_type] = (g[a.account_type] ?? 0) + net;
    }
    return g;
  }, [rows]);

  // المسوّدات المعروضة وحدها قابلة للتحديد — تحديد ما لا تراه يفتح باب ترحيل
  // ما لم يُراجَع.
  const selectableIds = useMemo(
    () => filteredEntries.filter((e) => e.status === 'draft').map((e) => e.id),
    [filteredEntries]);
  const selectedEntries = useMemo(
    () => entries.filter((e) => selected.has(e.id) && e.status === 'draft'),
    [entries, selected]);
  const selectedTotal = useMemo(
    () => selectedEntries.reduce((a, e) => a + Number(e.total_debit_eur), 0),
    [selectedEntries]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => n.delete(id));
      else selectableIds.forEach((id) => n.add(id));
      return n;
    });
  }

  /**
   * الترحيل الجماعي — واحداً تلو الآخر لا دفعةً واحدة.
   *
   * كل قيد يمرّ بمحرّك الترحيل كاملاً بضوابطه، وفشل أحدها لا يُسقط الباقي ولا
   * يتركك تجهل أيّها نجح. النتيجة تُعرَض مفصّلة بالرقم والسبب.
   */
  async function doBulkPost() {
    setBusy(true);
    const ok: string[] = []; const failed: { ref: string; msg: string }[] = [];
    for (const e of selectedEntries) {
      try {
        const { data } = await api.post(`/api/accounting/entries/${e.id}/post`);
        ok.push(data.entry_no);
      } catch (err: any) {
        failed.push({ ref: e.reference || e.description.slice(0, 30), msg: err?.response?.data?.message || 'تعذّر الترحيل' });
      }
    }
    setBulkResult({ ok, failed });
    setSelected(new Set());
    setBusy(false);
    await load(entityId);
  }

  async function openEntry(id: string) {
    try { const { data } = await api.get(`/api/accounting/entries/${id}`); setDetail(data); }
    catch { toast.error('تعذّر فتح القيد'); }
  }

  async function doPost(e: Entry) {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/accounting/entries/${e.id}/post`);
      toast.success(`رُحِّل ${data.entry_no}`);
      setPosting(null); await load(entityId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذّر الترحيل');
    } finally { setBusy(false); }
  }

  const typeLabel: Record<string, string> = {
    asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات',
  };

  if (loading && !tb) {
    return <div className="p-6 space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }

  if (!entities.length) {
    return <div className="p-6"><EmptyState title="لا كيان محاسبي" description="لم يُعرَّف كيان قانوني بعد." /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المحاسبة</h1>
          <p className="text-sm text-gray-500">دفتر الأستاذ وميزان المراجعة</p>
        </div>
        <div className="flex items-center gap-2">
          {entities.length > 1 && (
            <Select value={entityId} onChange={(e: any) => setEntityId(e.target.value)}>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
          <Button variant="secondary" onClick={() => load(entityId)}>تحديث</Button>
        </div>
      </header>

      {/* الإفصاح مُلزِم على أي عرض يُشتقّ من هذا الدفتر — لا يُخفى في حاشية. */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        حسابات إدارية — الأرصدة الافتتاحية غير مُدقَّقة
        <span className="mx-2 opacity-50">·</span>
        <span className="font-mono text-xs">MANAGEMENT ACCOUNTS — OPENING BALANCES UNAUDITED</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['revenue', 'expense', 'asset', 'liability'] as const).map((t) => (
          <Card key={t} className="p-4">
            <div className="text-xs text-gray-500">{typeLabel[t]}</div>
            <div className="text-xl font-bold tabular-nums">
              {money(Math.abs(byType[t] ?? 0))} <span className="text-xs font-normal text-gray-400">EUR</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex gap-1">
            {([['tb', 'ميزان المراجعة'], ['entries', `القيود (${entries.length})`], ['postable', `فواتير مؤهَّلة${postableCount != null ? ` (${postableCount})` : ''}`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k as any)}
                className={cx('rounded-md px-3 py-1.5 text-sm font-medium transition',
                  tab === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {selectedEntries.length > 0 && canPost && (
              <>
                <span className="text-sm text-gray-600">
                  {selectedEntries.length} محدَّدة · <b className="tabular-nums">{money(selectedTotal)}</b> EUR
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
                <Button size="sm" variant="primary" onClick={() => setBulkOpen(true)}>ترحيل المحدَّد</Button>
              </>
            )}
            {drafts.length > 0 && selectedEntries.length === 0 && (
              <Badge tone="warning">{drafts.length} مسوّدة تنتظر الترحيل</Badge>
            )}
          </div>
        </div>

        {tab === 'postable' ? (
          <PostableInvoices entityId={entityId} onDone={() => load(entityId)} />
        ) : tab === 'tb' ? (
          <div>
            {!rows.length ? <EmptyState title="لا حركة بعد" description="لم يُرحَّل قيد على هذا الكيان." /> : (
              <>
              {/*
                * ميزان المراجعة على الجوال: خمسة أعمدة رقمية في شاشة ضيّقة تعني
                * سحباً أفقياً لقراءة رصيد حسابٍ واحد. والبطاقة تضع الاسم ومداره
                * ورصيده في نظرة — وهي القراءة التي يُطلب الميزان لأجلها.
                */}
              <div className="lg:hidden divide-y divide-gray-100">
                {rows.map((a) => {
                  const net = Number(a.debit_eur) - Number(a.credit_eur);
                  return (
                    <button key={a.id} type="button" onClick={() => setLedgerFor(a)}
                      className="w-full text-start p-3 hover:bg-blue-50/40 transition-colors">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-gray-500">{a.code}</span>{' '}
                          <span className="font-medium text-gray-800">{a.name}</span>
                        </span>
                        <span className={cx('tabular-nums font-medium shrink-0', net < 0 && 'text-blue-700')}>
                          {money(Math.abs(net))} {net < 0 ? 'دائن' : 'مدين'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                        <span>{typeLabel[a.account_type] ?? a.account_type}</span>
                        <span className="tabular-nums">مدين {money(a.debit_eur)} · دائن {money(a.credit_eur)}</span>
                      </div>
                    </button>
                  );
                })}
                <div className="p-3 bg-gray-50 font-semibold flex items-center justify-between text-sm">
                  <span>
                    الإجمالي
                    {tb?.is_balanced
                      ? <Badge tone="success" className="mr-2">متوازن</Badge>
                      : <Badge tone="danger" className="mr-2">غير متوازن</Badge>}
                  </span>
                  <span className="tabular-nums text-xs">مدين {money(tb?.total_debit_eur)} · دائن {money(tb?.total_credit_eur)}</span>
                </div>
              </div>

              <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-right">الحساب</th>
                    <th scope="col" className="px-4 py-2 text-right">التصنيف</th>
                    <th scope="col" className="px-4 py-2 text-left">مدين</th>
                    <th scope="col" className="px-4 py-2 text-left">دائن</th>
                    <th scope="col" className="px-4 py-2 text-left">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((a) => {
                    const net = Number(a.debit_eur) - Number(a.credit_eur);
                    return (
                      <tr key={a.id} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => setLedgerFor(a)}>
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs text-gray-500">{a.code}</span>{' '}
                          <span className="font-medium">{a.name}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{typeLabel[a.account_type] ?? a.account_type}</td>
                        <td className="px-4 py-2 text-left tabular-nums">{money(a.debit_eur)}</td>
                        <td className="px-4 py-2 text-left tabular-nums">{money(a.credit_eur)}</td>
                        <td className={cx('px-4 py-2 text-left tabular-nums font-medium', net < 0 && 'text-blue-700')}>
                          {money(Math.abs(net))} {net < 0 ? 'دائن' : 'مدين'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>
                      الإجمالي
                      {tb?.is_balanced
                        ? <Badge tone="success" className="mr-2">متوازن</Badge>
                        : <Badge tone="danger" className="mr-2">غير متوازن</Badge>}
                    </td>
                    <td className="px-4 py-2 text-left tabular-nums">{money(tb?.total_debit_eur)}</td>
                    <td className="px-4 py-2 text-left tabular-nums">{money(tb?.total_credit_eur)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-2 border-b px-4 py-3">
              <Input placeholder="بحث برقم القيد أو المرجع أو الوصف…" value={q}
                onChange={(e: any) => setQ(e.target.value)} className="max-w-xs" />
              <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)}>
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            {/*
              * ثمانية أعمدة في شاشة جوال تعني سحباً أفقياً بين رقم القيد وزرّ
              * ترحيله. والترحيل فعلٌ لا يُراجَع نصفه ثم يُضغط — فلكلّ قيد بطاقة
              * تجمع بيانه ومبلغه وحالته وفعله.
              */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredEntries.map((e) => (
                <div key={e.id} className={cx('p-3 space-y-2', selected.has(e.id) && 'bg-blue-50')}>
                  <div className="flex items-start gap-2">
                    {canPost && e.status === 'draft' && (
                      <input type="checkbox" className="mt-1 shrink-0"
                        aria-label={`تحديد القيد ${e.entry_no || 'مسوّدة'}`}
                        checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-brand-700">
                        {e.entry_no || <span className="text-gray-400">مسوّدة</span>}
                        {e.is_backdated && <span className="mr-1 text-amber-600" title="بأثر رجعي">⏱</span>}
                      </p>
                      <p className="text-sm text-gray-800 break-words leading-snug">{e.description}</p>
                      {e.reference && <p className="text-xs text-gray-400">{e.reference}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[e.status] as any}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="tabular-nums font-medium text-gray-800">EUR {money(e.total_debit_eur)}</span>
                    <span>{EVENT_LABEL[e.accounting_event_type] ?? e.accounting_event_type} · {dateOnly(e.accounting_date)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEntry(e.id)}>تفاصيل</Button>
                    {e.status === 'draft' && canPost && (
                      <Button size="sm" variant="primary" className="flex-1" onClick={() => setPosting(e)}>ترحيل</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    {canPost && (
                      <th scope="col" className="px-3 py-2 w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          disabled={!selectableIds.length}
                          aria-label="تحديد كل المسوّدات المعروضة"
                          title="تحديد كل المسوّدات المعروضة" />
                      </th>
                    )}
                    <th scope="col" className="px-4 py-2 text-right">القيد</th>
                    <th scope="col" className="px-4 py-2 text-right">التاريخ</th>
                    <th scope="col" className="px-4 py-2 text-right">البيان</th>
                    <th scope="col" className="px-4 py-2 text-right">الحدث</th>
                    <th scope="col" className="px-4 py-2 text-left">EUR</th>
                    <th scope="col" className="px-4 py-2 text-center">الحالة</th>
                    <th scope="col" className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEntries.map((e) => (
                    <tr key={e.id} className={cx('hover:bg-blue-50/40', selected.has(e.id) && 'bg-blue-50')}>
                      {canPost && (
                        <td className="px-3 py-2">
                          {e.status === 'draft'
                            ? <input type="checkbox" aria-label={`تحديد القيد ${e.entry_no || 'مسوّدة'}`}
                                checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} />
                            : null}
                        </td>
                      )}
                      <td className="px-4 py-2 font-mono text-xs">
                        {e.entry_no || <span className="text-gray-400">—</span>}
                        {e.is_backdated && <span className="mr-1 text-amber-600" title="بأثر رجعي">⏱</span>}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{dateOnly(e.accounting_date)}</td>
                      <td className="px-4 py-2">
                        <div className="max-w-md truncate" title={e.description}>{e.description}</div>
                        {e.reference && <div className="text-xs text-gray-400">{e.reference}</div>}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{EVENT_LABEL[e.accounting_event_type] ?? e.accounting_event_type}</td>
                      <td className="px-4 py-2 text-left tabular-nums">{money(e.total_debit_eur)}</td>
                      <td className="px-4 py-2 text-center">
                        <Badge tone={STATUS_TONE[e.status] as any}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-left whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => openEntry(e.id)}>تفاصيل</Button>
                        {e.status === 'draft' && canPost && (
                          <Button size="sm" variant="primary" className="mr-1" onClick={() => setPosting(e)}>ترحيل</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredEntries.length && <EmptyState title="لا قيود" description="لا نتائج بهذه المرشّحات." />}
            </div>
          </div>
        )}
      </Card>

      {/* تفاصيل القيد */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.entry_no || 'مسوّدة'} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">التاريخ المحاسبي:</span> {dateOnly(detail.accounting_date)}</div>
              <div><span className="text-gray-500">تاريخ المستند:</span> {dateOnly(detail.source_document_date)}</div>
              <div className="col-span-2"><span className="text-gray-500">البيان:</span> {detail.description}</div>
              {detail.is_backdated && (
                <div className="col-span-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                  <b>بأثر رجعي —</b> {detail.backdated_reason}
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-right">الحساب</th>
                  <th scope="col" className="px-3 py-2 text-left">مدين</th>
                  <th scope="col" className="px-3 py-2 text-left">دائن</th>
                  <th scope="col" className="px-3 py-2 text-center">العملة</th>
                  <th scope="col" className="px-3 py-2 text-left">EUR</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(detail.lines || []).map((l: any) => {
                  const a = accounts.find((x) => x.id === l.account_id);
                  const isDr = Number(l.debit) > 0;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-500">{a?.code}</span> {a?.name}
                        {l.description && <div className="text-xs text-gray-400">{l.description}</div>}
                      </td>
                      <td className="px-3 py-2 text-left tabular-nums">{isDr ? money(l.debit) : '—'}</td>
                      <td className="px-3 py-2 text-left tabular-nums">{!isDr ? money(l.credit) : '—'}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {l.transaction_currency}
                        {l.transaction_currency !== 'EUR' && (
                          <div className="text-gray-400">@ {Number(l.fx_rate).toFixed(4)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-left tabular-nums">{money(isDr ? l.debit_eur : l.credit_eur)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">الإجمالي</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-left tabular-nums">{money(detail.total_debit_eur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>

      {/*
        * كشف الحساب من المكوّن المشترك.
        *
        * النسخة السابقة كانت تجلب كل قيد مُرحَّل على حدة ثم تُرشّح في المتصفّح —
        * نداءٌ لكل قيد ينمو مع الدفتر بلا حدّ. صارت نداءً واحداً مرشَّحاً في
        * الاستعلام، وهي النقطة نفسها التي يقرأها دفتر الأستاذ.
        */}
      {/*
        * سقف الكشف بعيدٌ عمداً لا «اليوم»: ميزان المراجعة الذي ضُغط صفُّه بلا
        * سقف تاريخ، فقصُّ كشفه عند اليوم — وبتوقيت UTC — كان يُسقط القيود
        * المؤرَّخة مستقبلاً وقيودَ الفجر المحلي، فيظهر فرقٌ يبدو فسادَ بيانات.
        */}
      <AccountStatement
        account={ledgerFor ? { code: ledgerFor.code, name: ledgerFor.name } : null}
        entityId={entityId} from={null} to="9999-12-31"
        onClose={() => setLedgerFor(null)} onOpenEntry={openEntry} />

      {/* الترحيل الجماعي */}
      <Modal open={bulkOpen} onClose={() => !busy && setBulkOpen(false)} title="ترحيل جماعي" size="lg">
        <div className="space-y-4">
          <p className="text-sm">
            سيُرحَّل <b>{selectedEntries.length}</b> قيداً بإجمالي مدين{' '}
            <b className="tabular-nums">{money(selectedTotal)} EUR</b>.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {selectedEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-1.5 font-mono text-xs">{e.reference || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{dateOnly(e.accounting_date)}</td>
                    <td className="px-3 py-1.5"><div className="max-w-sm truncate text-xs" title={e.description}>{e.description}</div></td>
                    <td className="px-3 py-1.5 text-left tabular-nums">{money(e.total_debit_eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            بعد الترحيل <b>لا تعديل ولا حذف</b> على أيٍّ منها. والتصحيح بقيد عكس جديد يبقى أثره في الدفتر.
            <div className="mt-1 text-xs">
              يُرحَّل كلٌّ على حدة — فإن تعثّر واحد لا يسقط الباقي، وستُعرَض النتيجة مفصّلة.
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkOpen(false)} disabled={busy}>إلغاء</Button>
            <Button variant="primary" loading={busy}
              onClick={async () => { await doBulkPost(); setBulkOpen(false); }}>
              ترحيل {selectedEntries.length} قيداً نهائياً
            </Button>
          </div>
        </div>
      </Modal>

      {/* نتيجة الترحيل الجماعي — تُعرَض ولا تُبتلع في إشعار عابر */}
      <Modal open={!!bulkResult} onClose={() => setBulkResult(null)} title="نتيجة الترحيل">
        {bulkResult && (
          <div className="space-y-3">
            {bulkResult.ok.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-sm font-medium text-emerald-900">رُحِّل {bulkResult.ok.length} قيداً</div>
                <div className="mt-1 font-mono text-xs text-emerald-800">{bulkResult.ok.join(' · ')}</div>
              </div>
            )}
            {bulkResult.failed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-sm font-medium text-red-900">تعذّر {bulkResult.failed.length}</div>
                <ul className="mt-1 space-y-1 text-xs text-red-800">
                  {bulkResult.failed.map((f, i) => <li key={i}><b>{f.ref}</b> — {f.msg}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setBulkResult(null)}>إغلاق</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* تأكيد الترحيل — لا يُشبه زرّاً عادياً لأنه ليس فعلاً عادياً */}
      <Modal open={!!posting} onClose={() => !busy && setPosting(null)} title="ترحيل قيد">
        {posting && (
          <div className="space-y-4">
            <p className="text-sm">
              سيُرحَّل <b>{posting.description}</b> بمبلغ <b>{money(posting.total_debit_eur)} EUR</b>.
            </p>
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              بعد الترحيل <b>لا تعديل ولا حذف</b>. التصحيح يكون بقيد عكس جديد يبقى أثره في الدفتر.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPosting(null)} disabled={busy}>إلغاء</Button>
              <Button variant="primary" onClick={() => doPost(posting)} disabled={busy}>
                {busy ? 'جارٍ الترحيل…' : 'ترحيل نهائي'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** حركة حساب واحد — تُبنى من القيود المحمَّلة، فلا نداء إضافي لكل نقرة. */