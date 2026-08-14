'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useInitialQuery } from '@/lib/useInitialQuery';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import { getUser } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, Button, Badge, Input, Field, Select, Modal, Drawer, Skeleton, EmptyState, Icon, IconButton, useToast, cx } from '@/components/ui';
import { fmtNum, fmtMoney, fmtMoneyC, ccyEntries, n0 } from '@/lib/format';

interface PO { id: string; po_number: string; description: string; order_date: string; is_active?: boolean; supplier?: { id: string; name: string }; vessel?: { id: string; name: string }; }
const empty = { po_number: '', supplier_id: '', vessel_id: '', description: '', order_date: '' };
const VESSEL_PREFIX: Record<string, string> = { 'Alcudia Express': '06', 'Bridge': '07', 'Gubal Trader': '04', 'Monte Express': '08', 'Poseidon Express': '01', 'Wasa Express': '05' };
const fmtDate = (d: any) => (d ? String(d).slice(0, 10) : '—');

interface POStat { invCount: number; invoiced: Record<string, number>; invoices: any[]; }
const emptyStat = (): POStat => ({ invCount: 0, invoiced: {}, invoices: [] });

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const [q, setQ] = useState('');
  useInitialQuery(setQ);
  const [supFilter, setSupFilter] = useState('');
  const [vesFilter, setVesFilter] = useState('');
  const [invFilter, setInvFilter] = useState<'all' | 'invoiced' | 'none'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'value' | 'number'>('newest');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [detail, setDetail] = useState<PO | null>(null);
  const [delTarget, setDelTarget] = useState<PO | null>(null);

  useEffect(() => { setUser(getUser()); }, []);
  async function load() {
    setLoading(true); setErr(false);
    const r = await Promise.allSettled([api.get('/api/purchase-orders'), api.get('/api/suppliers'), api.get('/api/vessels'), api.get('/api/invoices')]);
    const val = (i: number) => (r[i].status === 'fulfilled' ? (r[i] as any).value.data : []);
    if (r[0].status !== 'fulfilled') { setErr(true); setLoading(false); return; }
    setPos(val(0) || []); setSuppliers(val(1) || []); setVessels(val(2) || []); setInvoices(val(3) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const m: Record<string, POStat> = {};
    for (const inv of invoices) {
      const pid = inv.purchase_order?.id || inv.po_id; if (!pid) continue;
      const e = (m[pid] ||= emptyStat());
      e.invCount++;
      const c = (inv.currency || 'USD').toUpperCase();
      e.invoiced[c] = (e.invoiced[c] || 0) + n0(inv.total_amount);
      e.invoices.push(inv);
    }
    return m;
  }, [invoices]);

  const summary = useMemo(() => {
    const total = pos.length;
    let withInv = 0; const val: Record<string, number> = {};
    for (const po of pos) { const st = stats[po.id]; if (st?.invCount) { withInv++; for (const [c, v] of Object.entries(st.invoiced)) val[c] = (val[c] || 0) + v; } }
    return { total, withInv, noInv: total - withInv, val };
  }, [pos, stats]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = pos.filter((po) => {
      if (supFilter && po.supplier?.id !== supFilter) return false;
      if (vesFilter && po.vessel?.id !== vesFilter) return false;
      const has = (stats[po.id]?.invCount || 0) > 0;
      if (invFilter === 'invoiced' && !has) return false;
      if (invFilter === 'none' && has) return false;
      const d = (po.order_date || '').slice(0, 10);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (ql) { const hay = [po.po_number, po.supplier?.name, po.vessel?.name, po.description].map((x) => (x || '').toLowerCase()).join(' '); if (!hay.includes(ql)) return false; }
      return true;
    });
    const maxVal = (po: PO) => Math.max(0, ...Object.values(stats[po.id]?.invoiced || {}));
    out = [...out].sort((a, b) => {
      if (sortBy === 'value') return maxVal(b) - maxVal(a);
      if (sortBy === 'number') return (a.po_number || '').localeCompare(b.po_number || '');
      const da = +new Date(a.order_date || 0), db = +new Date(b.order_date || 0);
      return sortBy === 'oldest' ? da - db : db - da;
    });
    return out;
  }, [pos, stats, q, supFilter, vesFilter, invFilter, from, to, sortBy]);

  const activeFilters = [supFilter, vesFilter, invFilter !== 'all' ? invFilter : '', from, to, q].filter(Boolean).length;

  function openAdd() { setEditing(null); setForm(empty); setFormErr(''); setShowModal(true); }
  function openEdit(po: PO) { setEditing(po); setForm({ po_number: po.po_number, supplier_id: po.supplier?.id || '', vessel_id: po.vessel?.id || '', description: po.description || '', order_date: po.order_date?.slice(0, 10) || '' }); setFormErr(''); setShowModal(true); }
  async function handleSave() {
    if (!form.po_number.trim()) { setFormErr(t('po.numberReq')); return; }
    if (!form.supplier_id) { setFormErr(t('po.supplierReq')); return; }
    if (!form.vessel_id) { setFormErr(t('po.vesselReq')); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/purchase-orders/${editing.id}`, form); else await api.post('/api/purchase-orders', form);
      setShowModal(false); toast.success(t('po.saved')); load();
    } catch (e: any) { setFormErr(e?.response?.data?.message || t('common.error')); }
    finally { setSaving(false); }
  }
  async function doDelete() {
    if (!delTarget) return;
    try { await api.delete(`/api/purchase-orders/${delTarget.id}`); toast.success(t('po.deleted')); setDelTarget(null); load(); }
    catch { toast.error(t('po.deleteFail')); setDelTarget(null); }
  }
  function onVesselChange(vesselId: string) {
    const vessel = vessels.find((v) => v.id === vesselId);
    const prefix = vessel ? (VESSEL_PREFIX[vessel.name] || '') : '';
    const cur = form.po_number;
    const newNum = prefix && (!cur || Object.values(VESSEL_PREFIX).some((p) => cur.startsWith(p))) ? prefix + '-' : cur;
    setForm({ ...form, vessel_id: vesselId, po_number: newNum });
  }
  function exportExcel() {
    const rows = list.map((po) => ({ [t('po.number')]: po.po_number, [t('po.supplier')]: po.supplier?.name || '—', [t('po.vessel')]: po.vessel?.name || '—', [t('po.date')]: fmtDate(po.order_date), [t('po.description')]: po.description || '—', [t('po.invoices')]: stats[po.id]?.invCount || 0 }));
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'PO');
    XLSX.writeFile(wb, 'purchase-orders.xlsx');
  }
  const canWrite = (() => { const u = user; return u?.role === 'admin' || !Array.isArray(u?.allowed_screens) || u.allowed_screens.includes('/dashboard/purchase-orders'); })();

  const ValCell = ({ inv }: { inv: Record<string, number> }) => {
    const e = ccyEntries(inv);
    if (!e.length) return <span className="text-gray-300">—</span>;
    return <span className="tabular-nums text-gray-700">{e.map((x) => fmtMoneyC(x.value, x.ccy)).join(' · ')}</span>;
  };

  return (
    <div className="space-y-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-extrabold text-navy-900">{t('po.title')}</h1><p className="text-sm text-gray-500 mt-0.5">{t('po.subtitle')}</p></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon="file" onClick={exportExcel}>{t('po.exportExcel')}</Button>
          {canWrite && <Button icon="plus" onClick={openAdd}>{t('po.add')}</Button>}
        </div>
      </div>

      {!loading && !err && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon="clipboard" color="#2563eb" label={t('po.total')} value={fmtNum(summary.total)} />
          <SummaryCard icon="receipt" color="#059669" label={t('po.withInvoice')} value={fmtNum(summary.withInv)} />
          <SummaryCard icon="x" color="#d97706" label={t('po.noInvoice')} value={fmtNum(summary.noInv)} />
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0891b215', color: '#0891b2' }}><Icon name="coins" size={16} /></span><p className="text-xs text-gray-500">{t('po.invoicedValue')}</p></div>
            {ccyEntries(summary.val).length ? ccyEntries(summary.val).map((e) => <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>) : <p className="text-lg font-bold text-gray-300">0</p>}
          </Card>
        </div>
      )}

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none"><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('po.search')} className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <Select aria-label={t("po.allSuppliers")} value={supFilter} onChange={(e) => setSupFilter(e.target.value)} className="w-auto"><option value="">{t('po.allSuppliers')}</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label={t("po.allVessels")} value={vesFilter} onChange={(e) => setVesFilter(e.target.value)} className="w-auto"><option value="">{t('po.allVessels')}</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        <Select aria-label={t("po.invoiced")} value={invFilter} onChange={(e) => setInvFilter(e.target.value as any)} className="w-auto"><option value="all">{t('sup.all')}</option><option value="invoiced">{t('po.invoiced')}</option><option value="none">{t('po.notInvoiced')}</option></Select>
        <Select aria-label={t("po.sortNewest")} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-auto"><option value="newest">{t('po.sortNewest')}</option><option value="oldest">{t('po.sortOldest')}</option><option value="value">{t('po.sortValue')}</option><option value="number">{t('po.sortNumber')}</option></Select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.fromDate')} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.toDate')} />
        {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setSupFilter(''); setVesFilter(''); setInvFilter('all'); setFrom(''); setTo(''); }}>{t('po.reset')} ({activeFilters})</Button>}
        <span className="text-xs text-gray-400 ms-auto">{list.length}/{pos.length}</span>
      </Card>

      {loading && <div className="grid gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      {err && !loading && <Card><EmptyState icon="x" title={t('common.error')} action={<Button onClick={load}>{t('common.retry')}</Button>} /></Card>}

      {!loading && !err && (list.length === 0 ? (
        <Card><EmptyState icon="clipboard" title={t('po.noResults')} action={<Button variant="outline" onClick={() => { setQ(''); setSupFilter(''); setVesFilter(''); setInvFilter('all'); setFrom(''); setTo(''); }}>{t('po.reset')}</Button>} /></Card>
      ) : (
        <>
          <Card className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-gray-500 text-xs border-b border-gray-100"><tr>
                <th scope="col" className="text-start py-3 px-3">{t('po.number')}</th><th scope="col" className="text-start py-3 px-3">{t('po.date')}</th>
                <th scope="col" className="text-start py-3 px-3">{t('po.supplier')}</th><th scope="col" className="text-start py-3 px-3">{t('po.vessel')}</th>
                <th scope="col" className="text-start py-3 px-3 hidden xl:table-cell">{t('po.invoices')}</th><th scope="col" className="text-start py-3 px-3">{t('po.invoicedValue')}</th>
                <th scope="col" className="text-start py-3 px-3">{t('po.invoiceStatus')}</th><th scope="col" className="text-start py-3 px-3">{t('po.actions')}</th>
              </tr></thead>
              <tbody>
                {list.map((po) => { const st = stats[po.id] || emptyStat(); const has = st.invCount > 0; return (
                  <tr key={po.id} onClick={() => setDetail(po)} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/40 cursor-pointer">
                    <td className="py-2.5 px-3 font-mono font-medium text-brand-700">{po.po_number}</td>
                    <td className="py-2.5 px-3 text-gray-500 tabular-nums">{fmtDate(po.order_date)}</td>
                    <td className="py-2.5 px-3 text-gray-700 whitespace-normal break-words max-w-[15rem]" dir="auto">{po.supplier?.name || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 whitespace-normal break-words max-w-[15rem]" dir="auto">{po.vessel?.name || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-600 tabular-nums hidden xl:table-cell">{st.invCount || 0}</td>
                    <td className="py-2.5 px-3"><ValCell inv={st.invoiced} /></td>
                    <td className="py-2.5 px-3"><Badge tone={has ? 'success' : 'neutral'}>{has ? t('po.invoiced') : t('po.notInvoiced')}</Badge></td>
                    {/*
                      * أربعة أفعال بنصوصها تشغل ١٨٨ بكسل في جدولٍ يفيض أصلاً عن
                      * حاويته. الأيقونة تختصر ولا تُنقص فعلاً: لكلٍّ `aria-label`
                      * وتلميحٌ باسمه العربي.
                      */}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}><div className="flex gap-0.5">
                      <IconButton icon="search" label={t('po.viewDetails')} size="sm" onClick={() => setDetail(po)} />
                      <IconButton icon="receipt" label={t('po.viewInvoices')} size="sm" className="text-emerald-600 hover:bg-emerald-50" onClick={() => router.push(`/dashboard/invoices?po_id=${po.id}`)} />
                      {canWrite && <IconButton icon="edit" label="تعديل" size="sm" onClick={() => openEdit(po)} />}
                      {canWrite && <IconButton icon="trash" label={t('po.delete')} size="sm" className="text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDelTarget(po)} />}
                    </div></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </Card>

          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((po) => { const st = stats[po.id] || emptyStat(); const has = st.invCount > 0; return (
              <Card key={po.id} className="p-4" onClick={() => setDetail(po)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-mono font-bold text-brand-700 truncate">{po.po_number}</p><p className="text-xs text-gray-500 truncate">{po.supplier?.name || '—'}{po.vessel?.name ? ` · ${po.vessel.name}` : ''}</p></div>
                  <Badge tone={has ? 'success' : 'neutral'}>{has ? t('po.invoiced') : t('po.notInvoiced')}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-gray-500 tabular-nums">{fmtDate(po.order_date)}</span>
                  <ValCell inv={st.invoiced} />
                </div>
              </Card>
            ); })}
          </div>
        </>
      ))}

      <p className="text-[11px] text-gray-400 text-center">{t('po.invoicedNote')}</p>

      {/* detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.po_number}>
        {detail && (() => {
          const st = stats[detail.id] || emptyStat();
          const ri = [...st.invoices].sort((a, b) => +new Date(b.invoice_date || b.created_at) - +new Date(a.invoice_date || a.created_at)).slice(0, 8);
          return (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('po.overview')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label={t('po.date')} value={fmtDate(detail.order_date)} />
                  <MiniStat label={t('po.invoices')} value={fmtNum(st.invCount)} />
                  <MiniStat label={t('po.supplier')} value={detail.supplier?.name || '—'} />
                  <MiniStat label={t('po.vessel')} value={detail.vessel?.name || '—'} />
                </div>
                {detail.description && <div className="mt-2 rounded-xl border border-gray-100 p-3"><p className="text-[11px] text-gray-400 mb-0.5">{t('po.description')}</p><p className="text-sm text-gray-700">{detail.description}</p></div>}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('po.financial')}</h4>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
                  <p className="text-xs text-gray-500 mb-1">{t('po.invoicedValue')}</p>
                  {ccyEntries(st.invoiced).length ? ccyEntries(st.invoiced).map((e) => <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums">{fmtMoney(e.value, e.ccy)}</p>) : <p className="text-sm text-gray-400">{t('po.none')}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{t('po.invoicedNote')}</p>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('po.relatedInvoices')}</h4>
                {ri.length ? <div className="space-y-1">{ri.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700 truncate">{i.invoice_number}</span>
                    <span className="flex items-center gap-2 shrink-0"><span className="tabular-nums text-gray-600">{fmtMoneyC(i.total_amount, i.currency)}</span><Badge tone={i.status === 'paid' ? 'success' : i.status === 'partial' ? 'warning' : 'neutral'}>{t('st.' + (i.status || 'unpaid'))}</Badge></span>
                  </div>
                ))}</div> : <p className="text-xs text-gray-400">{t('po.none')}</p>}
                <button onClick={() => { setDetail(null); router.push(`/dashboard/invoices?po_id=${detail.id}`); }} className="text-xs text-brand-600 hover:underline mt-2">{t('common.viewAll')} →</button>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('po.items')}</h4>
                <p className="text-xs text-gray-400">{t('po.noItems')}</p>
              </div>
              {canWrite && <Button variant="outline" icon="clipboard" onClick={() => { setDetail(null); openEdit(detail); }} className="w-full">تعديل</Button>}
            </div>
          );
        })()}
      </Drawer>

      {/* add/edit modal (contract preserved incl. vessel prefix) */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('po.edit') : t('po.add')}
        footer={<><Button variant="outline" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button><Button onClick={handleSave} loading={saving}>{t('common.save')}</Button></>}>
        <div className="space-y-3">
          <Field label={`${t('po.vessel')} *`}>
            <Select value={form.vessel_id} onChange={(e) => onVesselChange(e.target.value)}>
              <option value="">{t('po.selectVessel')}</option>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}{VESSEL_PREFIX[v.name] ? ` (${VESSEL_PREFIX[v.name]})` : ''}</option>)}
            </Select>
          </Field>
          <Field label={`${t('po.number')} *`}>
            <Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} className="font-mono" dir="ltr"
              placeholder={form.vessel_id ? `${VESSEL_PREFIX[vessels.find((v) => v.id === form.vessel_id)?.name || ''] || 'XX'}-024/2026` : ''} />
          </Field>
          <Field label={`${t('po.supplier')} *`}>
            <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">{t('po.selectSupplier')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label={t('po.orderDate')}><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></Field>
          <Field label={t('po.description')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        {formErr && <p className="text-red-500 text-sm mt-2">{formErr}</p>}
      </Modal>

      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} size="sm" title={t('po.deleteConfirm')}
        footer={<><Button variant="outline" onClick={() => setDelTarget(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={doDelete}>{t('po.delete')}</Button></>}>
        <p className="text-sm text-gray-600 font-mono">{delTarget?.po_number}</p>
        <p className="text-xs text-gray-500 mt-1">{delTarget?.supplier?.name}</p>
        <p className="text-xs text-gray-400 mt-1">{t('po.deleteFail')}</p>
      </Modal>
    </div>
  );
}

function SummaryCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return <Card className="p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}><Icon name={icon} size={16} /></span><p className="text-xs text-gray-500">{label}</p></div><p className="text-2xl font-extrabold text-gray-800 tabular-nums">{value}</p></Card>;
}
function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-gray-100 p-2.5"><p className="text-[11px] text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800 truncate">{value}</p></div>;
}
