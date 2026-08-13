'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useInitialQuery } from '@/lib/useInitialQuery';
import { useI18n } from '@/lib/i18n';
import { Card, Button, Badge, Input, Field, Select, Modal, Drawer, Skeleton, EmptyState, Icon, useToast, cx } from '@/components/ui';
import { fmtNum, fmtMoney, fmtMoneyC, ccyEntries, n0 } from '@/lib/format';

interface Vessel { id: string; name: string; imo_number: string; flag: string; vessel_type: string; is_active: boolean; shipping_company_id: string; owner_name: string; owner_address: string; shipping_company?: { id: string; name: string }; }
const empty = { name: '', imo_number: '', flag: '', vessel_type: '', is_active: true, shipping_company_id: '', owner_name: '', owner_address: '' };
const fmtDate = (d: any) => (d ? String(d).slice(0, 10) : '—');
const normName = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

interface VStat { count: number; open: Record<string, number>; invoiced: Record<string, number>; hire: Record<string, number>; last: string | null; pos: number; suppliers: Set<string>; recentInv: any[]; recentPay: any[]; op: { rev: number; exp: number; net: number; matched: boolean }; }
const emptyStat = (): VStat => ({ count: 0, open: {}, invoiced: {}, hire: {}, last: null, pos: 0, suppliers: new Set(), recentInv: [], recentPay: [], op: { rev: 0, exp: 0, net: 0, matched: false } });

export default function VesselsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [hire, setHire] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const [q, setQ] = useState('');
  useInitialQuery(setQ);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [vtype, setVtype] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'outstanding' | 'invoices'>('name');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [detail, setDetail] = useState<Vessel | null>(null);
  const [delTarget, setDelTarget] = useState<Vessel | null>(null);

  useEffect(() => { setUser(getUser()); }, []);
  async function load() {
    setLoading(true); setErr(false);
    const r = await Promise.allSettled([
      api.get('/api/vessels'), api.get('/api/shipping-companies'), api.get('/api/invoices'),
      api.get('/api/payments'), api.get('/api/purchase-orders'), api.get('/api/hire-invoices'), api.get('/api/fleet/dashboard'),
    ]);
    const val = (i: number) => (r[i].status === 'fulfilled' ? (r[i] as any).value.data : []);
    if (r[0].status !== 'fulfilled') { setErr(true); setLoading(false); return; }
    setVessels(val(0) || []); setCompanies(val(1) || []); setInvoices(val(2) || []);
    setPayments(val(3) || []); setPos(val(4) || []); setHire(val(5) || []); setFleet(r[6].status === 'fulfilled' ? (r[6] as any).value.data : null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // fleet operational totals per fleet-sheet vessel name (USD)
  const fleetByName = useMemo(() => {
    const m: Record<string, { rev: number; exp: number; net: number }> = {};
    for (const x of (fleet?.monthly || [])) { const k = normName(x.vessel); (m[k] ||= { rev: 0, exp: 0, net: 0 }); m[k].rev += n0(x.revenue); m[k].exp += n0(x.expenses); m[k].net += n0(x.net); }
    return m;
  }, [fleet]);
  const matchFleet = (name: string) => {
    const n = normName(name); if (!n) return null;
    for (const k of Object.keys(fleetByName)) { if (n === k || n.includes(k) || k.includes(n)) return { ...fleetByName[k], matched: true }; }
    return null;
  };

  const stats = useMemo(() => {
    const m: Record<string, VStat> = {};
    const get = (id: string) => (m[id] ||= emptyStat());
    for (const inv of invoices) {
      const vid = inv.vessel?.id || inv.vessel_id; if (!vid) continue;
      const e = get(vid); e.count++;
      const c = (inv.currency || 'USD').toUpperCase();
      e.invoiced[c] = (e.invoiced[c] || 0) + n0(inv.total_amount);
      if (['unpaid', 'partial'].includes(inv.status)) e.open[c] = (e.open[c] || 0) + (n0(inv.total_amount) - n0(inv.paid_amount));
      const dt = inv.invoice_date || inv.created_at;
      if (dt && (!e.last || new Date(dt) > new Date(e.last))) e.last = dt;
      if (inv.supplier?.name) e.suppliers.add(inv.supplier.name);
      e.recentInv.push(inv);
    }
    for (const p of payments) { const vid = p.invoice?.vessel?.id; if (!vid) continue; get(vid).recentPay.push(p); }
    for (const po of pos) { const vid = po.vessel?.id || po.vessel_id; if (!vid) continue; get(vid).pos++; }
    for (const h of hire) { const vid = h.vessel?.id || h.vessel_id; if (!vid) continue; const e = get(vid); const c = (h.currency || 'EUR').toUpperCase(); e.hire[c] = (e.hire[c] || 0) + n0(h.total_amount); }
    for (const v of vessels) { const e = get(v.id); const f = matchFleet(v.name); if (f) e.op = f; }
    return m;
  }, [invoices, payments, pos, hire, vessels, fleetByName]);

  const summary = useMemo(() => {
    const total = vessels.length;
    const active = vessels.filter((v) => v.is_active).length;
    const withOut = vessels.filter((v) => ccyEntries(stats[v.id]?.open || {}).length > 0).length;
    let fRev = 0, fNet = 0;
    for (const k of Object.keys(fleetByName)) { fRev += fleetByName[k].rev; fNet += fleetByName[k].net; }
    return { total, active, inactive: total - active, withOut, fRev, fNet, fleetHas: Object.keys(fleetByName).length > 0 };
  }, [vessels, stats, fleetByName]);

  const types = useMemo(() => [...new Set(vessels.map((v) => v.vessel_type).filter(Boolean))].sort(), [vessels]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = vessels.filter((v) => {
      if (status === 'active' && !v.is_active) return false;
      if (status === 'inactive' && v.is_active) return false;
      if (vtype && v.vessel_type !== vtype) return false;
      if (onlyOutstanding && ccyEntries(stats[v.id]?.open || {}).length === 0) return false;
      if (ql) { const hay = [v.name, v.imo_number, v.vessel_type, v.flag, v.owner_name, v.shipping_company?.name].map((x) => (x || '').toLowerCase()).join(' '); if (!hay.includes(ql)) return false; }
      return true;
    });
    const maxOpen = (v: Vessel) => Math.max(0, ...Object.values(stats[v.id]?.open || {}));
    out = [...out].sort((a, b) => sortBy === 'outstanding' ? maxOpen(b) - maxOpen(a) : sortBy === 'invoices' ? (stats[b.id]?.count || 0) - (stats[a.id]?.count || 0) : a.name.localeCompare(b.name, locale === 'ar' ? 'ar' : 'en'));
    return out;
  }, [vessels, stats, q, status, vtype, onlyOutstanding, sortBy, locale]);

  function openAdd() { setEditing(null); setForm(empty); setFormErr(''); setShowModal(true); }
  function openEdit(v: Vessel) { setEditing(v); setForm({ name: v.name, imo_number: v.imo_number || '', flag: v.flag || '', vessel_type: v.vessel_type || '', is_active: v.is_active, shipping_company_id: v.shipping_company_id || '', owner_name: v.owner_name || '', owner_address: v.owner_address || '' }); setFormErr(''); setShowModal(true); }
  async function handleSave() {
    if (!form.name.trim()) { setFormErr(t('ves.nameReq')); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/vessels/${editing.id}`, form); else await api.post('/api/vessels', form);
      setShowModal(false); toast.success(t('ves.saved')); load();
    } catch (e: any) { const msg = e?.response?.data?.message || t('common.error'); setFormErr(Array.isArray(msg) ? msg.join(', ') : String(msg)); }
    finally { setSaving(false); }
  }
  async function doDelete() {
    if (!delTarget) return;
    try { await api.delete(`/api/vessels/${delTarget.id}`); toast.success(t('ves.deleted')); setDelTarget(null); load(); }
    catch { toast.error(t('ves.deleteFail')); setDelTarget(null); }
  }
  const set = (k: keyof typeof empty) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const canWrite = (() => { const u = user; return u?.role === 'admin' || !Array.isArray(u?.allowed_screens) || u.allowed_screens.includes('/dashboard/vessels'); })();

  const OutCell = ({ open }: { open: Record<string, number> }) => {
    const e = ccyEntries(open);
    if (!e.length) return <span className="text-gray-300">—</span>;
    return <span className="tabular-nums text-red-600 font-medium">{e.map((x) => fmtMoneyC(x.value, x.ccy)).join(' · ')}</span>;
  };

  return (
    <div className="space-y-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-extrabold text-navy-900">{t('ves.title')}</h1><p className="text-sm text-gray-500 mt-0.5">{t('ves.subtitle')}</p></div>
        {canWrite && <Button icon="plus" onClick={openAdd}>{t('ves.add')}</Button>}
      </div>

      {!loading && !err && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon="ship" color="#2563eb" label={t('ves.total')} value={fmtNum(summary.total)} />
          <SummaryCard icon="shield" color="#059669" label={t('ves.active')} value={fmtNum(summary.active)} sub={`${t('ves.inactive')}: ${fmtNum(summary.inactive)}`} />
          <SummaryCard icon="receipt" color="#d97706" label={t('ves.withOutstanding')} value={fmtNum(summary.withOut)} />
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0891b215', color: '#0891b2' }}><Icon name="chart" size={16} /></span><p className="text-xs text-gray-500">{t('ves.fleetOperational')} <span className="text-gray-300">· USD</span></p></div>
            {summary.fleetHas ? <><p className="text-lg font-extrabold text-gray-800 tabular-nums leading-tight">{fmtMoneyC(summary.fRev, 'USD')}</p><p className="text-[11px] text-gray-400">{t('ves.opNet')}: {fmtMoneyC(summary.fNet, 'USD')}</p><p className="text-[10px] text-gray-400 mt-0.5">{t('ves.fleetCumulative')}</p></> : <p className="text-lg font-bold text-gray-300">—</p>}
          </Card>
        </div>
      )}

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none"><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ves.search')} className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <Select aria-label={t("sup.all")} value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-auto"><option value="all">{t('sup.all')}</option><option value="active">{t('ves.active')}</option><option value="inactive">{t('ves.inactive')}</option></Select>
        {types.length > 0 && <Select aria-label={t("ves.allTypes")} value={vtype} onChange={(e) => setVtype(e.target.value)} className="w-auto"><option value="">{t('ves.allTypes')}</option>{types.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}
        <Select aria-label={t("ves.sortName")} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-auto"><option value="name">{t('ves.sortName')}</option><option value="outstanding">{t('ves.sortOutstanding')}</option><option value="invoices">{t('ves.sortInvoices')}</option></Select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"><input type="checkbox" checked={onlyOutstanding} onChange={(e) => setOnlyOutstanding(e.target.checked)} />{t('ves.hasOutstanding')}</label>
        <span className="text-xs text-gray-400 ms-auto">{list.length}/{vessels.length}</span>
      </Card>

      {loading && <div className="grid gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      {err && !loading && <Card><EmptyState icon="x" title={t('common.error')} action={<Button onClick={load}>{t('common.retry')}</Button>} /></Card>}

      {!loading && !err && (list.length === 0 ? (
        <Card><EmptyState icon="ship" title={t('ves.noResults')} action={<Button variant="outline" onClick={() => { setQ(''); setStatus('all'); setVtype(''); setOnlyOutstanding(false); }}>{t('ves.reset')}</Button>} /></Card>
      ) : (
        <>
          <Card className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-gray-500 text-xs border-b border-gray-100"><tr>
                <th scope="col" className="text-start py-3 px-4">{t('ves.title')}</th><th scope="col" className="text-start py-3 px-4">{t('ves.type')}</th>
                <th scope="col" className="text-start py-3 px-4">{t('ves.company')}</th><th scope="col" className="text-start py-3 px-4">{t('ves.outstandingCosts')}</th>
                <th scope="col" className="text-start py-3 px-4">{t('ves.invoices')}</th><th scope="col" className="text-start py-3 px-4">{t('ves.pos')}</th>
                <th scope="col" className="text-start py-3 px-4">{t('ves.lastActivity')}</th><th scope="col" className="text-start py-3 px-4">{t('ves.status')}</th><th scope="col" className="text-start py-3 px-4">{t('ves.actions')}</th>
              </tr></thead>
              <tbody>
                {list.map((v) => { const st = stats[v.id] || emptyStat(); return (
                  <tr key={v.id} onClick={() => setDetail(v)} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/40 cursor-pointer">
                    <td className="py-2.5 px-4 font-medium text-gray-800" dir="auto">{v.name}{v.imo_number ? <span className="block text-[11px] text-gray-400 font-normal">IMO {v.imo_number}</span> : null}</td>
                    <td className="py-2.5 px-4 text-gray-500">{v.vessel_type || '—'}</td>
                    <td className="py-2.5 px-4 text-gray-500">{v.shipping_company?.name || v.owner_name || '—'}</td>
                    <td className="py-2.5 px-4"><OutCell open={st.open} /></td>
                    <td className="py-2.5 px-4 text-gray-600 tabular-nums">{st.count || 0}</td>
                    <td className="py-2.5 px-4 text-gray-600 tabular-nums">{st.pos || 0}</td>
                    <td className="py-2.5 px-4 text-gray-500 tabular-nums">{fmtDate(st.last)}</td>
                    <td className="py-2.5 px-4"><Badge tone={v.is_active ? 'success' : 'neutral'}>{v.is_active ? t('ves.active') : t('ves.inactive')}</Badge></td>
                    <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}><div className="flex gap-2 text-xs">
                      <button onClick={() => setDetail(v)} className="text-gray-500 hover:text-brand-600">{t('ves.viewDetails')}</button>
                      {canWrite && <button onClick={() => openEdit(v)} className="text-brand-600 hover:underline">{t('ves.edit')}</button>}
                      {canWrite && <button onClick={() => setDelTarget(v)} className="text-red-400 hover:text-red-600">{t('ves.delete')}</button>}
                    </div></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </Card>

          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((v) => { const st = stats[v.id] || emptyStat(); return (
              <Card key={v.id} className="p-4" onClick={() => setDetail(v)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-bold text-gray-800 break-words" dir="auto">{v.name}</p><p className="text-xs text-gray-500 truncate">{v.vessel_type || '—'}{v.flag ? ` · ${v.flag}` : ''}</p></div>
                  <Badge tone={v.is_active ? 'success' : 'neutral'}>{v.is_active ? t('ves.active') : t('ves.inactive')}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-gray-500">{t('ves.invoices')}: <span className="tabular-nums text-gray-700">{st.count || 0}</span></span>
                  <OutCell open={st.open} />
                </div>
              </Card>
            ); })}
          </div>
        </>
      ))}

      <p className="text-[11px] text-gray-400 text-center">{t('note.currency')}</p>

      {/* detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (() => {
          const st = stats[detail.id] || emptyStat();
          const ri = [...st.recentInv].sort((a, b) => +new Date(b.invoice_date || b.created_at) - +new Date(a.invoice_date || a.created_at)).slice(0, 5);
          const rp = [...st.recentPay].sort((a, b) => +new Date(b.payment_date) - +new Date(a.payment_date)).slice(0, 5);
          return (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('ves.identity')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="IMO" value={detail.imo_number || '—'} />
                  <MiniStat label={t('ves.flag')} value={detail.flag || '—'} />
                  <MiniStat label={t('ves.type')} value={detail.vessel_type || '—'} />
                  <MiniStat label={t('ves.status')} value={detail.is_active ? t('ves.active') : t('ves.inactive')} />
                  <MiniStat label={t('ves.company')} value={detail.shipping_company?.name || '—'} />
                  <MiniStat label={t('ves.owner')} value={detail.owner_name || '—'} />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('ves.financials')}</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <MiniStat label={t('ves.invoices')} value={fmtNum(st.count)} />
                  <MiniStat label={t('ves.pos')} value={fmtNum(st.pos)} />
                  <MiniStat label={t('ves.suppliers')} value={fmtNum(st.suppliers.size)} />
                  <MiniStat label={t('ves.lastActivity')} value={fmtDate(st.last)} />
                </div>
                <CcyBox label={t('ves.outstandingCosts')} map={st.open} tone="red" t={t} />
                <CcyBox label={t('ves.hireRevenue')} map={st.hire} tone="green" t={t} />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('ves.operational')}</h4>
                {st.op.matched ? (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[11px] text-gray-500">{t('ves.opRevenue')}</p><p className="text-sm font-bold text-gray-800 tabular-nums">{fmtMoneyC(st.op.rev, 'USD')}</p></div>
                      <div><p className="text-[11px] text-gray-500">{t('ves.opExpenses')}</p><p className="text-sm font-bold text-gray-800 tabular-nums">{fmtMoneyC(st.op.exp, 'USD')}</p></div>
                      <div><p className="text-[11px] text-gray-500">{t('ves.opNet')}</p><p className={cx('text-sm font-bold tabular-nums', st.op.net >= 0 ? 'text-emerald-700' : 'text-red-600')}>{fmtMoneyC(st.op.net, 'USD')}</p></div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">{t('ves.opSource')}</p>
                  </div>
                ) : <p className="text-xs text-gray-400">{t('ves.noOpData')}</p>}
              </div>
              <DrawerList title={t('ves.recentInvoices')} rows={ri.map((i) => ({ a: i.invoice_number, b: fmtMoneyC(i.total_amount, i.currency), c: fmtDate(i.invoice_date || i.created_at) }))} empty={t('ves.none')} />
              <DrawerList title={t('ves.recentPayments')} rows={rp.map((p) => ({ a: p.invoice?.invoice_number || '—', b: fmtMoneyC(p.amount, p.currency), c: fmtDate(p.payment_date) }))} empty={t('ves.none')} />
              {canWrite && <Button variant="outline" icon="clipboard" onClick={() => { setDetail(null); openEdit(detail); }} className="w-full">{t('ves.edit')}</Button>}
            </div>
          );
        })()}
      </Drawer>

      {/* add/edit modal (contract preserved) */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('ves.edit') : t('ves.add')}
        footer={<><Button variant="outline" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button><Button onClick={handleSave} loading={saving} disabled={!form.name.trim()}>{t('common.save')}</Button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Field label={`${t('ves.title')} *`}><Input value={form.name} onChange={set('name')} autoFocus /></Field></div>
          <Field label={t('ves.imo')}><Input value={form.imo_number} onChange={set('imo_number')} dir="ltr" /></Field>
          <Field label={t('ves.flag')}><Input value={form.flag} onChange={set('flag')} /></Field>
          <Field label={t('ves.type')}><Input value={form.vessel_type} onChange={set('vessel_type')} /></Field>
          <Field label={t('ves.company')}><Select value={form.shipping_company_id} onChange={set('shipping_company_id')}><option value="">— {t('sup.none')} —</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <div className="sm:col-span-2"><Field label={t('ves.owner')}><Input value={form.owner_name} onChange={set('owner_name')} placeholder="ISBA Shipping LTD" /></Field></div>
          <div className="sm:col-span-2"><Field label={t('ves.ownerAddress')}><textarea value={form.owner_address} onChange={set('owner_address')} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" /></Field></div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />{t('ves.active')}</label>
        </div>
        {formErr && <p className="text-red-500 text-sm mt-2">{formErr}</p>}
      </Modal>

      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} size="sm" title={t('ves.deleteConfirm')}
        footer={<><Button variant="outline" onClick={() => setDelTarget(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={doDelete}>{t('ves.delete')}</Button></>}>
        <p className="text-sm text-gray-600">{delTarget?.name}</p>
        <p className="text-xs text-gray-400 mt-1">{t('ves.deleteFail')}</p>
      </Modal>
    </div>
  );
}

function SummaryCard({ icon, color, label, value, sub }: { icon: string; color: string; label: string; value: string; sub?: string }) {
  return <Card className="p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}><Icon name={icon} size={16} /></span><p className="text-xs text-gray-500">{label}</p></div><p className="text-2xl font-extrabold text-gray-800 tabular-nums">{value}</p>{sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}</Card>;
}
function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-gray-100 p-2.5"><p className="text-[11px] text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800 truncate">{value}</p></div>;
}
function CcyBox({ label, map, tone, t }: { label: string; map: Record<string, number>; tone: 'red' | 'green'; t: (k: string) => string }) {
  const e = ccyEntries(map);
  return (
    <div className={cx('rounded-xl border p-3 mb-2', tone === 'red' ? 'border-red-100 bg-red-50/40' : 'border-emerald-100 bg-emerald-50/40')}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {e.length ? e.map((x) => <p key={x.ccy} className={cx('text-sm font-bold tabular-nums', tone === 'red' ? 'text-red-600' : 'text-emerald-700')}>{fmtMoney(x.value, x.ccy)}</p>) : <p className="text-sm text-gray-400">{t('ves.none')}</p>}
    </div>
  );
}
function DrawerList({ title, rows, empty }: { title: string; rows: { a: string; b: string; c: string }[]; empty: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{title}</h4>
      {rows.length ? <div className="space-y-1">{rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
          <span className="text-gray-700 truncate">{r.a}</span>
          <span className="flex items-center gap-2 shrink-0"><span className="tabular-nums text-gray-600">{r.b}</span><span className="text-[11px] text-gray-400 tabular-nums">{r.c}</span></span>
        </div>
      ))}</div> : <p className="text-xs text-gray-400">{empty}</p>}
    </div>
  );
}
