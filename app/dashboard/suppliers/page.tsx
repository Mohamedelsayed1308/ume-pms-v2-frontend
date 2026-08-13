'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { findDuplicateGroups, type DupCandidate } from '@/lib/duplicates';
import { getUser } from '@/lib/auth';
import { useInitialQuery } from '@/lib/useInitialQuery';
import { useI18n } from '@/lib/i18n';
import { Card, Button, Badge, Input, Field, Select, Modal, Drawer, Skeleton, EmptyState, Icon, useToast, cx } from '@/components/ui';
import AccountingDefault from './AccountingDefault';
import { fmtNum, fmtMoney, fmtMoneyC, ccyEntries, n0 } from '@/lib/format';

interface Supplier { id: string; name: string; contact_person: string; email: string; phone: string; address: string; country: string; is_active: boolean; }
const empty = { name: '', contact_person: '', email: '', phone: '', address: '', country: '', is_active: true };

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
const fmtDate = (d: any) => (d ? String(d).slice(0, 10) : '—');
interface SupStat { count: number; open: Record<string, number>; invoiced: Record<string, number>; last: string | null; pos: number; recentInv: any[]; recentPay: any[]; }
const emptyStat = (): SupStat => ({ count: 0, open: {}, invoiced: {}, last: null, pos: 0, recentInv: [], recentPay: [] });

export default function SuppliersPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const [q, setQ] = useState('');
  useInitialQuery(setQ);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [country, setCountry] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'outstanding' | 'invoices'>('name');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [delTarget, setDelTarget] = useState<Supplier | null>(null);
  const [showDup, setShowDup] = useState(false);
  const [keepSel, setKeepSel] = useState<Record<string, string>>({});

  useEffect(() => { setUser(getUser()); }, []);
  async function load() {
    setLoading(true); setErr(false);
    const r = await Promise.allSettled([api.get('/api/suppliers'), api.get('/api/invoices'), api.get('/api/payments'), api.get('/api/purchase-orders')]);
    const val = (i: number) => (r[i].status === 'fulfilled' ? (r[i] as any).value.data : []);
    if (r[0].status !== 'fulfilled') { setErr(true); setLoading(false); return; }
    setSuppliers(val(0) || []); setInvoices(val(1) || []); setPayments(val(2) || []); setPos(val(3) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // per-supplier derived context (client-side; no backend changes)
  const stats = useMemo(() => {
    const m: Record<string, SupStat> = {};
    const get = (id: string) => (m[id] ||= emptyStat());
    for (const inv of invoices) {
      const sid = inv.supplier?.id || inv.supplier_id; if (!sid) continue;
      const e = get(sid); e.count++;
      const c = (inv.currency || 'USD').toUpperCase();
      e.invoiced[c] = (e.invoiced[c] || 0) + n0(inv.total_amount);
      if (['unpaid', 'partial'].includes(inv.status)) e.open[c] = (e.open[c] || 0) + (n0(inv.total_amount) - n0(inv.paid_amount));
      const dt = inv.invoice_date || inv.created_at;
      if (dt && (!e.last || new Date(dt) > new Date(e.last))) e.last = dt;
      e.recentInv.push(inv);
    }
    for (const p of payments) { const sid = p.invoice?.supplier?.id; if (!sid) continue; get(sid).recentPay.push(p); }
    for (const po of pos) { const sid = po.supplier?.id || po.supplier_id; if (!sid) continue; get(sid).pos++; }
    return m;
  }, [invoices, payments, pos]);

  const summary = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => s.is_active).length;
    const withOut = suppliers.filter((s) => ccyEntries(stats[s.id]?.open || {}).length > 0).length;
    const totalOut: Record<string, number> = {};
    for (const s of suppliers) for (const [c, v] of Object.entries(stats[s.id]?.open || {})) totalOut[c] = (totalOut[c] || 0) + v;
    return { total, active, inactive: total - active, withOut, totalOut };
  }, [suppliers, stats]);

  const countries = useMemo(() => [...new Set(suppliers.map((s) => s.country).filter(Boolean))].sort(), [suppliers]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = suppliers.filter((s) => {
      if (status === 'active' && !s.is_active) return false;
      if (status === 'inactive' && s.is_active) return false;
      if (country && s.country !== country) return false;
      if (onlyOutstanding && ccyEntries(stats[s.id]?.open || {}).length === 0) return false;
      if (ql) {
        const hay = [s.name, s.contact_person, s.email, s.phone, s.country].map((x) => (x || '').toLowerCase()).join(' ');
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    const maxOpen = (s: Supplier) => Math.max(0, ...Object.values(stats[s.id]?.open || {}));
    out = [...out].sort((a, b) => {
      if (sortBy === 'outstanding') return maxOpen(b) - maxOpen(a);
      if (sortBy === 'invoices') return (stats[b.id]?.count || 0) - (stats[a.id]?.count || 0);
      return a.name.localeCompare(b.name, locale === 'ar' ? 'ar' : 'en');
    });
    return out;
  }, [suppliers, stats, q, status, country, onlyOutstanding, sortBy, locale]);

  // dup detection during typing
  const nameNorm = norm(form.name);
  const others = suppliers.filter((s) => s.id !== editing?.id);
  const dupExact = nameNorm.length > 0 ? others.find((s) => norm(s.name) === nameNorm) : undefined;
  const similar = nameNorm.length >= 4 && !dupExact ? others.filter((s) => { const n = norm(s.name); return n && (n.includes(nameNorm) || nameNorm.includes(n)); }).slice(0, 5) : [];

  function openAdd() { setEditing(null); setForm(empty); setFormErr(''); setShowModal(true); }
  function openEdit(s: Supplier) { setEditing(s); setForm({ name: s.name, contact_person: s.contact_person || '', email: s.email || '', phone: s.phone || '', address: s.address || '', country: s.country || '', is_active: s.is_active }); setFormErr(''); setShowModal(true); }
  async function handleSave() {
    if (!form.name.trim()) { setFormErr(t('sup.nameReq')); return; }
    if (dupExact) { setFormErr(`${t('sup.dupExists')}: "${dupExact.name}"`); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/suppliers/${editing.id}`, form);
      else await api.post('/api/suppliers', form);
      setShowModal(false); toast.success(t('sup.saved')); load();
    } catch (e: any) { setFormErr(e?.response?.data?.message || t('common.error')); }
    finally { setSaving(false); }
  }
  async function doDelete() {
    if (!delTarget) return;
    try { await api.delete(`/api/suppliers/${delTarget.id}`); toast.success(t('sup.deleted')); setDelTarget(null); load(); }
    catch { toast.error(t('sup.deleteFail')); setDelTarget(null); }
  }
  async function mergeGroup(g: Supplier[]) {
    const gid = g[0].id; const keepId = keepSel[gid] || g[0].id;
    const removeIds = g.filter((s) => s.id !== keepId).map((s) => s.id);
    if (!removeIds.length) return;
    const keepName = g.find((s) => s.id === keepId)?.name;
    if (!confirm(`دمج ${g.length} موردين في «${keepName}»؟`)) return;
    try { await api.post('/api/suppliers/merge', { keepId, removeIds }); toast.success(t('sup.saved')); load(); }
    catch (e: any) { toast.error(e?.response?.data?.message || t('common.error')); }
  }
  const f = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const canWrite = (() => { const u = user; return u?.role === 'admin' || !Array.isArray(u?.allowed_screens) || u.allowed_screens.includes('/dashboard/suppliers'); })();
  const copy = (v: string) => { if (v) { navigator.clipboard?.writeText(v); toast.success(t('sup.copied')); } };

  const OutCell = ({ open }: { open: Record<string, number> }) => {
    const e = ccyEntries(open);
    if (!e.length) return <span className="text-gray-300">—</span>;
    return <span className="tabular-nums text-red-600 font-medium">{e.map((x) => fmtMoneyC(x.value, x.ccy)).join(' · ')}</span>;
  };

  return (
    <div className="space-y-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">{t('sup.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('sup.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon="search" onClick={() => setShowDup((v) => !v)}>{t('sup.detectDup')}</Button>
          {canWrite && <Button icon="plus" onClick={openAdd}>{t('sup.add')}</Button>}
        </div>
      </div>

      {/* summary */}
      {!loading && !err && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon="factory" color="#2563eb" label={t('sup.total')} value={fmtNum(summary.total)} />
          <SummaryCard icon="shield" color="#059669" label={t('sup.active')} value={fmtNum(summary.active)} sub={`${t('sup.inactive')}: ${fmtNum(summary.inactive)}`} />
          <SummaryCard icon="receipt" color="#d97706" label={t('sup.withOutstanding')} value={fmtNum(summary.withOut)} />
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#e11d4815', color: '#e11d48' }}><Icon name="coins" size={16} /></span><p className="text-xs text-gray-500">{t('sup.totalOutstanding')}</p></div>
            {ccyEntries(summary.totalOut).length ? ccyEntries(summary.totalOut).map((e) => (
              <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>
            )) : <p className="text-lg font-bold text-gray-300">0</p>}
          </Card>
        </div>
      )}

      {/* duplicate detection panel (functionality preserved) */}
      {showDup && !loading && (() => {
        const { exact: exactGroups, similar: similarCands } = findDuplicateGroups(suppliers);
        const Group = ({ g, kind, cand }: { g: Supplier[]; kind: 'exact' | 'similar'; cand?: DupCandidate<Supplier> }) => {
          const gid = g[0].id; const keepId = keepSel[gid] || g[0].id;
          return (
            <div className={cx('rounded-xl border p-3', kind === 'exact' ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50')}>
              {cand && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 font-medium text-amber-800">
                    تشابه {Math.round(cand.score * 100)}٪
                  </span>
                  {cand.legalFormOnly && (
                    <span className="text-gray-600">
                      الاسم واحد والشكل القانوني مختلف — <b>الأرجح كيانان لا تكرار</b>
                    </span>
                  )}
                </div>
              )}
              {g.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1 border-b last:border-0 border-black/5">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name={`keep-${gid}`} checked={keepId === s.id} onChange={() => setKeepSel((k) => ({ ...k, [gid]: s.id }))} />
                    <span className="font-medium text-gray-800">{s.name}</span>
                  </label>
                  <span className="flex gap-3 text-xs"><button onClick={() => openEdit(s)} className="text-brand-600 hover:underline">{t('common.save') && t('sup.edit')}</button><button onClick={() => setDelTarget(s)} className="text-red-500 hover:underline">{t('sup.delete')}</button></span>
                </div>
              ))}
              <div className="mt-2 text-end"><Button size="sm" variant="secondary" icon="clipboard" onClick={() => mergeGroup(g)}>دمج المجموعة</Button></div>
            </div>
          );
        };
        return (
          <Card className="p-4">
            <h3 className="font-bold text-gray-700 mb-3">{t('sup.detectDup')}</h3>
            {!exactGroups.length && !similarCands.length && <p className="text-emerald-600 text-sm">🎉</p>}
            {exactGroups.length > 0 && <div className="mb-3"><p className="text-sm font-medium text-red-700 mb-2">تكرار مؤكد ({exactGroups.length})</p><div className="space-y-2">{exactGroups.map((g, i) => <Group key={i} g={g} kind="exact" />)}</div></div>}
            {similarCands.length > 0 && <div><p className="text-sm font-medium text-amber-700 mb-2">تشابه محتمل ({similarCands.length}) — مرتَّب بقوّة التشابه</p><div className="space-y-2">{similarCands.map((c, i) => <Group key={i} g={c.items} kind="similar" cand={c} />)}</div></div>}
          </Card>
        );
      })()}

      {/* controls */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none"><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sup.search')} className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-auto"><option value="all">{t('sup.all')}</option><option value="active">{t('sup.active')}</option><option value="inactive">{t('sup.inactive')}</option></Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)} className="w-auto"><option value="">{t('sup.allCountries')}</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-auto"><option value="name">{t('sup.sortName')}</option><option value="outstanding">{t('sup.sortOutstanding')}</option><option value="invoices">{t('sup.sortInvoices')}</option></Select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"><input type="checkbox" checked={onlyOutstanding} onChange={(e) => setOnlyOutstanding(e.target.checked)} />{t('sup.hasOutstanding')}</label>
        <span className="text-xs text-gray-400 ms-auto">{list.length}/{suppliers.length}</span>
      </Card>

      {loading && <div className="grid gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      {err && !loading && <Card><EmptyState icon="x" title={t('common.error')} action={<Button onClick={load}>{t('common.retry')}</Button>} /></Card>}

      {!loading && !err && (
        list.length === 0 ? (
          <Card><EmptyState icon="factory" title={t('sup.noResults')} action={<Button variant="outline" onClick={() => { setQ(''); setStatus('all'); setCountry(''); setOnlyOutstanding(false); }}>{t('sup.reset')}</Button>} /></Card>
        ) : (
          <>
            {/* desktop table */}
            <Card className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="text-gray-500 text-xs border-b border-gray-100">
                  <tr>
                    <th className="text-start py-3 px-4">{t('sup.title')}</th>
                    <th className="text-start py-3 px-4">{t('sup.contact')}</th>
                    <th className="text-start py-3 px-4">{t('sup.country')}</th>
                    <th className="text-start py-3 px-4">{t('sup.outstanding')}</th>
                    <th className="text-start py-3 px-4">{t('sup.invoices')}</th>
                    <th className="text-start py-3 px-4">{t('sup.lastActivity')}</th>
                    <th className="text-start py-3 px-4">{t('sup.status')}</th>
                    <th className="text-start py-3 px-4">{t('sup.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const st = stats[s.id] || emptyStat();
                    return (
                      <tr key={s.id} onClick={() => setDetail(s)} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/40 cursor-pointer">
                        <td className="py-2.5 px-4 font-medium text-gray-800">{s.name}</td>
                        <td className="py-2.5 px-4 text-gray-500">{s.contact_person || '—'}</td>
                        <td className="py-2.5 px-4 text-gray-500">{s.country || '—'}</td>
                        <td className="py-2.5 px-4"><OutCell open={st.open} /></td>
                        <td className="py-2.5 px-4 text-gray-600 tabular-nums">{st.count || 0}</td>
                        <td className="py-2.5 px-4 text-gray-500 tabular-nums">{fmtDate(st.last)}</td>
                        <td className="py-2.5 px-4"><Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? t('sup.active') : t('sup.inactive')}</Badge></td>
                        <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2 text-xs">
                            <button onClick={() => setDetail(s)} className="text-gray-500 hover:text-brand-600">{t('sup.viewDetails')}</button>
                            {canWrite && <button onClick={() => openEdit(s)} className="text-brand-600 hover:underline">{t('sup.edit')}</button>}
                            {canWrite && <button onClick={() => setDelTarget(s)} className="text-red-400 hover:text-red-600">{t('sup.delete')}</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* mobile / tablet cards */}
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list.map((s) => {
                const st = stats[s.id] || emptyStat();
                return (
                  <Card key={s.id} className="p-4" onClick={() => setDetail(s)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 truncate">{s.name}</p>
                        <p className="text-xs text-gray-500 truncate">{s.contact_person || '—'}{s.country ? ` · ${s.country}` : ''}</p>
                      </div>
                      <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? t('sup.active') : t('sup.inactive')}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="text-gray-500">{t('sup.invoices')}: <span className="tabular-nums text-gray-700">{st.count || 0}</span></span>
                      <OutCell open={st.open} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )
      )}

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
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('sup.overview')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label={t('sup.invoices')} value={fmtNum(st.count)} />
                  <MiniStat label={t('sup.pos')} value={fmtNum(st.pos)} />
                  <MiniStat label={t('sup.lastActivity')} value={fmtDate(st.last)} />
                  <MiniStat label={t('sup.status')} value={detail.is_active ? t('sup.active') : t('sup.inactive')} />
                </div>
                <div className="mt-2 rounded-xl border border-red-100 bg-red-50/40 p-3">
                  <p className="text-xs text-gray-500 mb-1">{t('sup.totalOutstanding')}</p>
                  {ccyEntries(st.open).length ? ccyEntries(st.open).map((e) => <p key={e.ccy} className="text-sm font-bold text-red-600 tabular-nums">{fmtMoney(e.value, e.ccy)}</p>) : <p className="text-sm text-gray-400">{t('sup.none')}</p>}
                </div>
              </div>
              <DrawerList title={t('sup.recentInvoices')} rows={ri.map((i) => ({ a: i.invoice_number, b: fmtMoneyC(i.total_amount, i.currency), c: fmtDate(i.invoice_date || i.created_at) }))} t={t} />
              <DrawerList title={t('sup.recentPayments')} rows={rp.map((p) => ({ a: p.invoice?.invoice_number || '—', b: fmtMoneyC(p.amount, p.currency), c: fmtDate(p.payment_date) }))} t={t} />
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('sup.contactInfo')}</h4>
                <div className="space-y-1.5 text-sm">
                  <ContactRow icon="users" v={detail.contact_person} onCopy={copy} />
                  <ContactRow icon="file" v={detail.email} onCopy={copy} />
                  <ContactRow icon="card" v={detail.phone} onCopy={copy} />
                  <ContactRow icon="building" v={[detail.address, detail.country].filter(Boolean).join(' — ')} onCopy={copy} />
                </div>
              </div>
              {canWrite && <Button variant="outline" icon="clipboard" onClick={() => { setDetail(null); openEdit(detail); }} className="w-full">{t('sup.edit')}</Button>}
            </div>
          );
        })()}
      </Drawer>

      {/* add/edit modal (payload contract preserved) */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('sup.edit') : t('sup.add')}
        footer={<>
          <Button variant="outline" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} loading={saving} disabled={!!dupExact || !form.name.trim()}>{t('common.save')}</Button>
        </>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Field label={`${t('sup.title')} *`} error={dupExact ? `${t('sup.dupExists')}: ${dupExact.name}` : undefined}>
              <Input value={form.name} onChange={f('name')} className={dupExact ? 'border-red-400 focus:ring-red-500/40' : ''} autoFocus />
            </Field>
            {!dupExact && similar.length > 0 && (
              <div className="text-amber-600 text-xs mt-1"><span>⚠ {t('sup.similarNames')}:</span><ul className="list-disc ps-5 mt-0.5">{similar.map((s) => <li key={s.id}>{s.name}</li>)}</ul></div>
            )}
          </div>
          <Field label={t('sup.contact')}><Input value={form.contact_person} onChange={f('contact_person')} /></Field>
          <Field label={t('sup.email')}><Input value={form.email} onChange={f('email')} type="email" dir="ltr" /></Field>
          <Field label={t('sup.phone')}><Input value={form.phone} onChange={f('phone')} dir="ltr" /></Field>
          <Field label={t('sup.country')}><Input value={form.country} onChange={f('country')} /></Field>
          <div className="sm:col-span-2"><Field label={t('sup.address')}><Input value={form.address} onChange={f('address')} /></Field></div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />{t('sup.active')}</label>
          {showModal && <AccountingDefault supplierId={editing?.id ?? null} />}
        </div>
        {formErr && <p className="text-red-500 text-sm mt-2">{formErr}</p>}
      </Modal>

      {/* delete confirm */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} size="sm" title={t('sup.deleteConfirm')}
        footer={<><Button variant="outline" onClick={() => setDelTarget(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={doDelete}>{t('sup.delete')}</Button></>}>
        <p className="text-sm text-gray-600">{delTarget?.name}</p>
        <p className="text-xs text-gray-400 mt-1">{t('sup.deleteFail')}</p>
      </Modal>
    </div>
  );
}

function SummaryCard({ icon, color, label, value, sub }: { icon: string; color: string; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}><Icon name={icon} size={16} /></span><p className="text-xs text-gray-500">{label}</p></div>
      <p className="text-2xl font-extrabold text-gray-800 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-gray-100 p-2.5"><p className="text-[11px] text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800 tabular-nums">{value}</p></div>;
}
function DrawerList({ title, rows, t }: { title: string; rows: { a: string; b: string; c: string }[]; t: (k: string) => string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{title}</h4>
      {rows.length ? <div className="space-y-1">{rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
          <span className="text-gray-700 truncate">{r.a}</span>
          <span className="flex items-center gap-2 shrink-0"><span className="tabular-nums text-gray-600">{r.b}</span><span className="text-[11px] text-gray-400 tabular-nums">{r.c}</span></span>
        </div>
      ))}</div> : <p className="text-xs text-gray-400">{t('sup.none')}</p>}
    </div>
  );
}
function ContactRow({ icon, v, onCopy }: { icon: string; v: string; onCopy: (v: string) => void }) {
  if (!v) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-gray-700">
      <span className="flex items-center gap-2 min-w-0"><Icon name={icon} size={15} className="text-gray-400 shrink-0" /><span className="truncate" dir="auto">{v}</span></span>
      <button onClick={() => onCopy(v)} className="text-gray-300 hover:text-brand-600 shrink-0"><Icon name="clipboard" size={14} /></button>
    </div>
  );
}
