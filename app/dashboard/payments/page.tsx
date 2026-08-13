'use client';
import { useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { useInitialQuery } from '@/lib/useInitialQuery';
import { getUser } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, Button, Badge, Select as UISelect, Drawer, Icon, cx, TableSkeleton, Callout } from '@/components/ui';
import { fmtNum, fmtMoney, fmtMoneyC, ccyEntries, n0, sumByCurrency, fmtCcyMap } from '@/lib/format';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_type: string;
  payment_method: string;
  reference: string;
  notes: string;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    supplier: { name: string };
    vessel: { name: string };
  };
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  vessel: { name: string } | null;
  total_amount: number;
  paid_amount: number;
  checked: boolean;
  amount: string;
  currency: string;
}

const typeLabel: Record<string, string> = { advance: 'مقدم', installment: 'قسط', full: 'سداد كامل' };
const methodLabel: Record<string, string> = { bank_transfer: 'تحويل بنكي', cheque: 'شيك', cash: 'نقدي' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-gray-100 p-2.5"><p className="text-[11px] text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800 truncate">{value}</p></div>;
}

const emptyShared = {
  payment_date: '',
  payment_type: 'installment',
  payment_method: 'bank_transfer',
  reference: '',
  notes: '',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [shared, setShared] = useState(emptyShared);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invoiceAttachments, setInvoiceAttachments] = useState<Record<string, any[]>>({});
  const { t, locale } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [q, setQ] = useState('');
  useInitialQuery(setQ);
  const [preset, setPreset] = useState<'all' | 'today' | 'week' | 'month' | 'high'>('all');
  const [supF, setSupF] = useState('');
  const [ccyF, setCcyF] = useState('');
  const [methodF, setMethodF] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'high' | 'low'>('newest');
  const [detail, setDetail] = useState<Payment | null>(null);
  const [delTarget, setDelTarget] = useState<Payment | null>(null);
  useEffect(() => { setUser(getUser()); }, []);
  const HIGH_VALUE = 100000; // documented threshold (payment's own currency)

  /*
   * التحميل حالة ثالثة مستقلّة عن «فيه بيانات» و«مفيش بيانات».
   *
   * وكان فشل النداء يمرّ بلا مُلتقِط: `Promise.all` يُخفق كلّه لإخفاق واحد،
   * فتبقى القوائم فارغة ويقرأ المستخدم «لا توجد مدفوعات» — وهي في الحقيقة
   * «لم أستطع أن أعرف». والفرق بين النفي والجهل ليس تفصيلاً في شاشة مالية.
   */
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  async function load() {
    setListLoading(true);
    try {
      const [payRes, invRes, supRes] = await Promise.all([
        api.get('/api/payments'),
        api.get('/api/invoices'),
        api.get('/api/suppliers'),
      ]);
      setPayments(payRes.data);
      setAllInvoices(invRes.data.filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled'));
      setSuppliers(supRes.data);
      setListError('');
    } catch {
      setListError('تعذّر تحميل المدفوعات — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openModal() {
    setSelectedSupplierId('');
    setInvoiceRows([]);
    setShared(emptyShared);
    setError('');
    setShowModal(true);
  }

  async function onSupplierChange(supplierId: string) {
    setSelectedSupplierId(supplierId);
    setError('');
    setInvoiceAttachments({});
    const filtered = allInvoices.filter((i) => i.supplier?.id === supplierId);
    setInvoiceRows(filtered.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      vessel: inv.vessel,
      total_amount: +inv.total_amount,
      paid_amount: +inv.paid_amount,
      checked: false,
      amount: String(Math.max(0, +inv.total_amount - +inv.paid_amount)),
      currency: inv.currency || 'USD',
    })));
    // Load attachments for all invoices
    const attMap: Record<string, any[]> = {};
    await Promise.all(filtered.map(async (inv: any) => {
      try {
        const res = await api.get(`/api/attachments/invoice/${inv.id}`);
        attMap[inv.id] = res.data || [];
      } catch { attMap[inv.id] = []; }
    }));
    setInvoiceAttachments(attMap);
  }

  function toggleRow(id: string) {
    setInvoiceRows((rows) => rows.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  }

  function updateRow(id: string, field: 'amount' | 'currency', val: string) {
    setInvoiceRows((rows) => rows.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function selectAll() {
    setInvoiceRows((rows) => rows.map((r) => ({ ...r, checked: true })));
  }

  const checkedRows = invoiceRows.filter((r) => r.checked);
  // إجمالي المحدَّد مفصول بالعملة — لا يُجمع مبلغان بعملتين مختلفتين
  const checkedTotals = sumByCurrency(checkedRows, (r: any) => +r.amount || 0, (r: any) => r.currency);

  async function handleSaveAll() {
    if (checkedRows.length === 0) { setError('اختر فاتورة واحدة على الأقل'); return; }
    const invalid = checkedRows.find((r) => !r.amount || +r.amount <= 0);
    if (invalid) { setError(`المبلغ غير صحيح للفاتورة ${invalid.invoice_number}`); return; }
    if (!shared.payment_date) { setError('تاريخ الدفع مطلوب'); return; }
    setSaving(true);
    setError('');
    try {
      await Promise.all(checkedRows.map((r) =>
        api.post('/api/payments', {
          invoice_id: r.id,
          amount: parseFloat(r.amount),
          currency: r.currency,
          payment_date: shared.payment_date,
          payment_type: shared.payment_type,
          payment_method: shared.payment_method,
          reference: shared.reference || null,
          notes: shared.notes || null,
        })
      ));
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!delTarget) return;
    try { await api.delete(`/api/payments/${delTarget.id}`); } catch { /* surfaced via reload */ }
    setDelTarget(null);
    load();
  }

  // ===== derived (presentation only; Payments = ACTUAL transactions from the payments API) =====
  const canWrite = (() => { const u = user; return u?.role === 'admin' || !Array.isArray(u?.allowed_screens) || u.allowed_screens.includes('/dashboard/payments'); })();
  const _today = new Date(); _today.setHours(0, 0, 0, 0);
  const _week = new Date(_today); _week.setDate(_week.getDate() - _today.getDay());
  const _month = new Date(_today.getFullYear(), _today.getMonth(), 1);
  const invCcy = (p: Payment) => ((p.invoice as any)?.currency || '').toUpperCase();
  const isHigh = (p: Payment) => n0(p.amount) >= HIGH_VALUE;
  const isMismatch = (p: Payment) => { const ic = invCcy(p); return !!ic && ic !== (p.currency || '').toUpperCase(); };
  const inPreset = (p: Payment) => {
    if (preset === 'all') return true;
    if (preset === 'high') return isHigh(p);
    const d = p.payment_date ? new Date(p.payment_date) : null; if (!d) return false;
    if (preset === 'today') return d >= _today;
    if (preset === 'week') return d >= _week;
    if (preset === 'month') return d >= _month;
    return true;
  };
  const ql = q.trim().toLowerCase();
  const filtered = payments.filter((p) => {
    if (!inPreset(p)) return false;
    if (supF && p.invoice?.supplier?.name !== supF) return false;
    if (ccyF && (p.currency || 'USD').toUpperCase() !== ccyF) return false;
    if (methodF && p.payment_method !== methodF) return false;
    const d = (p.payment_date || '').slice(0, 10);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    if (ql) { const hay = [p.reference, p.invoice?.invoice_number, p.invoice?.supplier?.name, p.invoice?.vessel?.name, methodLabel[p.payment_method], p.notes].map((x) => (x || '').toLowerCase()).join(' '); if (!hay.includes(ql)) return false; }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'high') return n0(b.amount) - n0(a.amount);
    if (sortBy === 'low') return n0(a.amount) - n0(b.amount);
    const da = +new Date(a.payment_date || 0), db = +new Date(b.payment_date || 0);
    return sortBy === 'oldest' ? da - db : db - da;
  });
  const byC = (arr: Payment[]) => { const o: Record<string, number> = {}; for (const p of arr) { const k = (p.currency || 'USD').toUpperCase(); o[k] = (o[k] || 0) + n0(p.amount); } return o; };
  const summary = {
    count: payments.length,
    byCurrency: byC(payments),
    thisMonth: byC(payments.filter((p) => p.payment_date && new Date(p.payment_date) >= _month)),
    suppliers: new Set(payments.map((p) => p.invoice?.supplier?.name).filter(Boolean)).size,
    high: payments.filter(isHigh).length,
    methods: (['bank_transfer', 'cheque', 'cash'] as const).map((m) => ({ m, c: payments.filter((p) => p.payment_method === m).length })).filter((x) => x.c > 0),
  };
  const supplierNames = [...new Set(payments.map((p) => p.invoice?.supplier?.name).filter(Boolean))].sort() as string[];
  const currencies = [...new Set(payments.map((p) => (p.currency || 'USD').toUpperCase()))].sort();
  const activeFilters = [q, supF, ccyF, methodF, fromDate, toDate, preset !== 'all' ? preset : ''].filter(Boolean).length;
  const resetFilters = () => { setQ(''); setPreset('all'); setSupF(''); setCcyF(''); setMethodF(''); setFromDate(''); setToDate(''); };

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-extrabold text-navy-900">{t('pay.title')}</h1><p className="text-sm text-gray-500 mt-0.5">{t('pay.subtitle')}</p></div>
        {canWrite && <Button icon="plus" onClick={openModal}>{t('pay.add')}</Button>}
      </div>

      {/* Summary — ACTUAL payment transactions (not invoice statuses) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#2563eb15', color: '#2563eb' }}><Icon name="card" size={16} /></span><p className="text-xs text-gray-500">{t('pay.total')}</p></div>
          <p className="text-2xl font-extrabold text-gray-800 tabular-nums">{fmtNum(summary.count)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('pay.suppliersPaid')}: {summary.suppliers}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#05966915', color: '#059669' }}><Icon name="coins" size={16} /></span><p className="text-xs text-gray-500">{t('pay.amountByCurrency')}</p></div>
          {ccyEntries(summary.byCurrency).length ? ccyEntries(summary.byCurrency).map((e) => <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>) : <p className="text-lg font-bold text-gray-300">0</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0891b215', color: '#0891b2' }}><Icon name="chart" size={16} /></span><p className="text-xs text-gray-500">{t('pay.thisMonth')}</p></div>
          {ccyEntries(summary.thisMonth).length ? ccyEntries(summary.thisMonth).map((e) => <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>) : <p className="text-lg font-bold text-gray-300">0</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#d9770615', color: '#d97706' }}><Icon name="bell" size={16} /></span><p className="text-xs text-gray-500">{t('pay.byMethod')}</p></div>
          {summary.methods.map((x) => <p key={x.m} className="text-xs text-gray-700 leading-tight">{methodLabel[x.m]}: <b className="tabular-nums">{x.c}</b></p>)}
          {summary.high > 0 && <p className="text-[11px] text-amber-600 mt-0.5">{t('pay.highValue')}: {summary.high}</p>}
        </div>
      </div>

      {listError && <Callout tone="danger">{listError}</Callout>}

      {/* Presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['all', t('pay.presetAll')], ['today', t('pay.presetToday')], ['week', t('pay.presetWeek')], ['month', t('pay.presetMonth')], ['high', t('pay.highValue')]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setPreset(k as any)} className={cx('text-xs px-3 py-1.5 rounded-full border transition-colors', preset === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300')}>{lbl}</button>
        ))}
      </div>

      {/* Controls */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none"><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pay.search')} className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <UISelect value={supF} onChange={(e) => setSupF(e.target.value)} className="w-auto"><option value="">{t('po.allSuppliers')}</option>{supplierNames.map((s) => <option key={s} value={s}>{s}</option>)}</UISelect>
        <UISelect value={methodF} onChange={(e) => setMethodF(e.target.value)} className="w-auto"><option value="">{t('pay.allMethods')}</option>{(['bank_transfer', 'cheque', 'cash']).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</UISelect>
        <UISelect value={ccyF} onChange={(e) => setCcyF(e.target.value)} className="w-auto"><option value="">{t('inv.allCurrencies')}</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</UISelect>
        <UISelect value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-auto"><option value="newest">{t('po.sortNewest')}</option><option value="oldest">{t('po.sortOldest')}</option><option value="high">{t('sup.sortOutstanding')}</option><option value="low">↑</option></UISelect>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.fromDate')} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.toDate')} />
        {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}>{t('pay.reset')} ({activeFilters})</Button>}
        <span className="text-xs text-gray-400 ms-auto">{sorted.length}/{payments.length}</span>
      </Card>

      {/* Desktop table */}
      <Card className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-gray-500 text-xs border-b border-gray-100"><tr>
            <th scope="col" className="text-start py-3 px-3">{t('pay.date')}</th><th scope="col" className="text-start py-3 px-3">{t('pay.reference')}</th>
            <th scope="col" className="text-start py-3 px-3">{t('pay.invoice')}</th><th scope="col" className="text-start py-3 px-3">{t('pay.supplier')}</th>
            <th scope="col" className="text-start py-3 px-3">{t('pay.vessel')}</th><th scope="col" className="text-start py-3 px-3">{t('pay.amount')}</th>
            <th scope="col" className="text-start py-3 px-3">{t('pay.method')}</th><th scope="col" className="text-start py-3 px-3">{t('pay.invoiceStatus')}</th>
            <th scope="col" className="text-start py-3 px-3">{t('pay.actions')}</th>
          </tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} onClick={() => setDetail(p)} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/40 cursor-pointer">
                <td className="px-3 py-2.5 text-gray-500 tabular-nums">{p.payment_date?.slice(0, 10) || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 font-mono">{p.reference || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-brand-700">{p.invoice?.invoice_number || '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{p.invoice?.supplier?.name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">{p.invoice?.vessel?.name || '—'}</td>
                <td className="px-3 py-2.5 font-medium tabular-nums">{fmtMoney(p.amount)} <span className="text-[11px] text-gray-400">{p.currency}</span>{isHigh(p) && <span className="text-[10px] text-amber-600 ms-1">★</span>}{isMismatch(p) && <span className="text-[10px] text-orange-500 ms-1" title={t('pay.ccyMismatch')}>⚠</span>}</td>
                <td className="px-3 py-2.5 text-gray-600">{methodLabel[p.payment_method]}</td>
                <td className="px-3 py-2.5"><Badge tone={p.invoice?.status === 'paid' ? 'success' : p.invoice?.status === 'partial' ? 'warning' : p.invoice?.status === 'cancelled' ? 'neutral' : 'danger'}>{statusLabel[p.invoice?.status] || '—'}</Badge></td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><div className="flex gap-2 text-xs">
                  <button onClick={() => setDetail(p)} className="text-gray-500 hover:text-brand-600">{t('pay.details')}</button>
                  {canWrite && <button onClick={() => setDelTarget(p)} className="text-red-400 hover:text-red-600">{t('pay.delete')}</button>}
                </div></td>
              </tr>
            ))}
            {listLoading && payments.length === 0 && <tr><td colSpan={9} className="py-3"><TableSkeleton rows={8} cols={9} /></td></tr>}
            {!listLoading && sorted.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-gray-400">{t('pay.noResults')}</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {sorted.map((p) => (
          <Card key={p.id} className="p-4" onClick={() => setDetail(p)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-bold text-gray-800 tabular-nums">{fmtMoney(p.amount, p.currency)}{isHigh(p) && <span className="text-[10px] text-amber-600 ms-1">★</span>}</p><p className="text-xs text-gray-500 truncate">{p.invoice?.supplier?.name || '—'}</p></div>
              <Badge tone={p.invoice?.status === 'paid' ? 'success' : p.invoice?.status === 'partial' ? 'warning' : 'danger'}>{statusLabel[p.invoice?.status] || '—'}</Badge>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span className="font-mono text-brand-700">{p.invoice?.invoice_number || '—'}</span>
              <span>{methodLabel[p.payment_method]} · {p.payment_date?.slice(0, 10) || '—'}</span>
            </div>
            {isMismatch(p) && <p className="text-[11px] text-orange-500 mt-1">⚠ {t('pay.ccyMismatch')}</p>}
          </Card>
        ))}
        {listLoading && payments.length === 0 && <Card><TableSkeleton rows={5} cols={2} /></Card>}
        {!listLoading && sorted.length === 0 && <Card><p className="text-center py-8 text-gray-400 text-sm">{t('pay.noResults')}</p></Card>}
      </div>
      <p className="text-[11px] text-gray-400 text-center">{t('note.currency')}</p>

      {/* Payment detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? fmtMoney(detail.amount, detail.currency) : ''}>
        {detail && (() => {
          const p = detail;
          const inv = p.invoice;
          const invTotal = n0(inv?.total_amount), invPaid = n0(inv?.paid_amount), invOut = invTotal - invPaid;
          const others = payments.filter((x) => x.invoice?.id === inv?.id && x.id !== p.id);
          return (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('pay.txnDetails')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label={t('pay.amount')} value={fmtMoneyC(p.amount, p.currency)} />
                  <MiniStat label={t('pay.date')} value={p.payment_date?.slice(0, 10) || '—'} />
                  <MiniStat label={t('pay.method')} value={methodLabel[p.payment_method]} />
                  <MiniStat label={t('pay.type')} value={typeLabel[p.payment_type]} />
                  <MiniStat label={t('pay.reference')} value={p.reference || '—'} />
                  <MiniStat label={t('pay.recordedBy')} value={(p as any).created_at?.slice(0, 10) || '—'} />
                </div>
                {p.notes && <div className="mt-2 rounded-xl border border-gray-100 p-3"><p className="text-[11px] text-gray-400 mb-0.5">{t('pay.notes')}</p><p className="text-sm text-gray-700">{p.notes}</p></div>}
                {isMismatch(p) && <p className="text-xs text-orange-600 mt-2">⚠ {t('pay.ccyMismatch')} ({invCcy(p)} ≠ {p.currency})</p>}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('pay.financialContext')}</h4>
                <div className="rounded-xl border border-gray-100 p-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('pay.invoice')}</span><span className="font-mono text-brand-700">{inv?.invoice_number || '—'}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('pay.invoiceTotal')}</span><span className="tabular-nums">{fmtMoneyC(invTotal, (inv as any)?.currency)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('pay.invoicePaid')}</span><span className="tabular-nums text-emerald-700">{fmtMoneyC(invPaid, (inv as any)?.currency)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('pay.invoiceOutstanding')}</span><span className={cx('tabular-nums', invOut > 0.005 ? 'text-red-600' : 'text-gray-400')}>{fmtMoneyC(invOut, (inv as any)?.currency)}</span></div>
                  <div className="flex justify-between text-sm pt-1 border-t border-gray-50"><span className="text-gray-500">{t('pay.invoiceStatus')}</span><Badge tone={inv?.status === 'paid' ? 'success' : inv?.status === 'partial' ? 'warning' : 'danger'}>{statusLabel[inv?.status] || '—'}</Badge></div>
                </div>
              </div>
              {others.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('pay.otherTxns')} ({others.length})</h4>
                  <div className="space-y-1">{others.map((o) => <div key={o.id} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0"><span className="text-gray-500">{o.payment_date?.slice(0, 10)} · {methodLabel[o.payment_method]}</span><span className="tabular-nums text-emerald-700">{fmtMoneyC(o.amount, o.currency)}</span></div>)}</div>
                </div>
              )}
              <p className="text-[11px] text-gray-400">{t('pay.noEdit')}</p>
              {canWrite && <Button variant="danger" size="sm" icon="x" onClick={() => { setDetail(null); setDelTarget(p); }}>{t('pay.delete')}</Button>}
            </div>
          );
        })()}
      </Drawer>

      {/* Delete confirm (financial-sensitive) */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDelTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">{t('pay.deleteConfirm')}</h3>
            <div className="rounded-xl border border-gray-100 p-3 text-sm space-y-1 mb-3">
              <div className="flex justify-between"><span className="text-gray-500">{t('pay.amount')}</span><span className="font-bold tabular-nums">{fmtMoney(delTarget.amount, delTarget.currency)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('pay.supplier')}</span><span>{delTarget.invoice?.supplier?.name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('pay.invoice')}</span><span className="font-mono text-brand-700">{delTarget.invoice?.invoice_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('pay.reference')}</span><span>{delTarget.reference || '—'}</span></div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-3">{t('pay.deleteWarn')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelTarget(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={doDelete}>{t('pay.delete')}</Button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-lg">تسجيل دفعة</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

              {/* Supplier */}
              <div className="max-w-sm">
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <select value={selectedSupplierId} onChange={(e) => onSupplierChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Invoices Table */}
              {selectedSupplierId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      فواتير المورد غير المسددة
                      {invoiceRows.length > 0 && <span className="text-gray-400 mr-1">({invoiceRows.length})</span>}
                    </span>
                    {invoiceRows.length > 0 && (
                      <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">تحديد الكل</button>
                    )}
                  </div>

                  {invoiceRows.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border rounded-lg">لا توجد فواتير مستحقة لهذا المورد</div>
                  ) : (
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-right">
                          <tr>
                            <th scope="col" className="px-3 py-2 w-8">
                              <input type="checkbox"
                                checked={invoiceRows.length > 0 && invoiceRows.every(r => r.checked)}
                                onChange={(e) => setInvoiceRows(rows => rows.map(r => ({ ...r, checked: e.target.checked })))}
                                className="w-4 h-4 cursor-pointer" />
                            </th>
                            <th scope="col" className="px-3 py-2">رقم الفاتورة</th>
                            <th scope="col" className="px-3 py-2">السفينة</th>
                            <th scope="col" className="px-3 py-2">إجمالي الفاتورة</th>
                            <th scope="col" className="px-3 py-2">المدفوع</th>
                            <th scope="col" className="px-3 py-2 text-red-500">المتبقي</th>
                            <th scope="col" className="px-3 py-2 text-blue-600">المبلغ المراد دفعه</th>
                            <th scope="col" className="px-3 py-2 text-blue-600">العملة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceRows.map((row) => {
                            const remaining = row.total_amount - row.paid_amount;
                            const isPartial = row.checked && +row.amount > 0 && +row.amount < remaining;
                            return (
                              <tr key={row.id} className={`border-t transition-colors ${row.checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2 text-center">
                                  <input type="checkbox" checked={row.checked} onChange={() => toggleRow(row.id)}
                                    className="w-4 h-4 cursor-pointer" />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-blue-700 font-medium">{row.invoice_number}</span>
                                    {invoiceAttachments[row.id]?.length > 0 && (
                                      <div className="flex gap-1">
                                        {invoiceAttachments[row.id].map((att: any, i: number) => (
                                          <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer"
                                            title={att.file_name}
                                            className="text-gray-400 hover:text-blue-600 transition-colors">
                                            📎
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{row.vessel?.name || '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{row.total_amount.toLocaleString()}</td>
                                <td className="px-3 py-2 text-green-600">{row.paid_amount.toLocaleString()}</td>
                                <td className="px-3 py-2 font-bold text-red-600">{remaining.toLocaleString()}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={row.amount}
                                      onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                                      disabled={!row.checked}
                                      className="w-28 border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400 text-right"
                                    />
                                    {isPartial && (
                                      <span className="text-xs text-orange-500 whitespace-nowrap">جزئي</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={row.currency}
                                    onChange={(e) => updateRow(row.id, 'currency', e.target.value)}
                                    disabled={!row.checked}
                                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400">
                                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {checkedRows.length > 0 && (
                          <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                            <tr>
                              <td colSpan={6} className="px-3 py-2 text-sm font-bold text-blue-700 text-right">
                                إجمالي الدفع ({checkedRows.length} فاتورة):
                              </td>
                              <td colSpan={2} className="px-3 py-2 text-sm font-bold text-blue-700">
                                <div className="flex flex-col gap-0.5">
                                  {ccyEntries(checkedTotals).map(({ ccy, value }) => (
                                    <span key={ccy}>{fmtMoney(value, ccy)}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Shared Fields */}
              {selectedSupplierId && invoiceRows.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">بيانات مشتركة لجميع الفواتير المختارة</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">تاريخ الدفع *</label>
                      <input type="date" value={shared.payment_date}
                        onChange={(e) => setShared({ ...shared, payment_date: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">نوع الدفع</label>
                      <select value={shared.payment_type}
                        onChange={(e) => setShared({ ...shared, payment_type: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="advance">مقدم</option>
                        <option value="installment">قسط</option>
                        <option value="full">سداد كامل</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">طريقة الدفع</label>
                      <select value={shared.payment_method}
                        onChange={(e) => setShared({ ...shared, payment_method: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="bank_transfer">تحويل بنكي</option>
                        <option value="cheque">شيك</option>
                        <option value="cash">نقدي</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">رقم المرجع / التحويل</label>
                      <input value={shared.reference}
                        onChange={(e) => setShared({ ...shared, reference: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
                    <input value={shared.notes}
                      onChange={(e) => setShared({ ...shared, notes: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4">
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <div className="flex gap-3">
                <button onClick={handleSaveAll} disabled={saving || checkedRows.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm">
                  {saving
                    ? 'جاري الحفظ...'
                    : checkedRows.length > 0
                      ? `حفظ ${checkedRows.length} فاتورة — ${fmtCcyMap(checkedTotals)}`
                      : 'حفظ'}
                </button>
                <button onClick={() => setShowModal(false)}
                  className="px-8 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 text-sm">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
