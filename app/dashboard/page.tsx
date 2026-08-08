'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { SCREENS, canAccess } from '@/lib/screens';
import { useI18n } from '@/lib/i18n';
import { Card, Badge, Icon, Skeleton, EmptyState, cx } from '@/components/ui';
import { fmtNum, fmtMoney, fmtMoneyC, sumByCurrency, ccyEntries, pctChange, n0 } from '@/lib/format';
import { getRange, prevRange, inRange, PERIOD_KEYS, type PeriodKey } from '@/lib/period';

const OPEN = ['unpaid', 'partial'];
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [d, setD] = useState<{ invoices: any[]; hire: any[]; mgmt: any[]; payments: any[]; tasks: any[]; due: any[]; delays: any[]; fleet: any } | null>(null);

  useEffect(() => { setUser(getUser()); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(false);
      const calls = [
        api.get('/api/invoices'), api.get('/api/hire-invoices'), api.get('/api/management-invoices'),
        api.get('/api/payments'), api.get('/api/tasks'), api.get('/api/invoices/alerts/due?days=30'),
        api.get('/api/invoices/report/department-delays'), api.get('/api/fleet/dashboard'),
      ];
      const r = await Promise.allSettled(calls);
      if (!alive) return;
      const val = (i: number, fb: any) => (r[i].status === 'fulfilled' ? (r[i] as any).value.data : fb);
      const anyOk = r.some((x) => x.status === 'fulfilled');
      if (!anyOk) { setErr(true); setLoading(false); return; }
      setD({
        invoices: val(0, []) || [], hire: val(1, []) || [], mgmt: val(2, []) || [],
        payments: val(3, []) || [], tasks: val(4, []) || [], due: val(5, []) || [],
        delays: val(6, []) || [], fleet: val(7, null),
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const range = useMemo(() => getRange(period, cFrom, cTo), [period, cFrom, cTo]);
  const prev = useMemo(() => prevRange(range), [range]);

  const m = useMemo(() => {
    if (!d) return null;
    const openInv = d.invoices.filter((i) => OPEN.includes(i.status));
    const payables = sumByCurrency(openInv, (i) => n0(i.total_amount) - n0(i.paid_amount), (i) => i.currency);
    const openHire = d.hire.filter((i) => OPEN.includes(i.status));
    const receivables = sumByCurrency(openHire, (i) => n0(i.total_amount) - n0(i.paid_amount), (i) => i.currency);
    const openMgmt = d.mgmt.filter((i) => OPEN.includes(i.status));
    const mgmtDue = sumByCurrency(openMgmt, (i) => n0(i.amount) - n0(i.paid_amount), (i) => i.currency);

    const overdue = d.due.filter((i) => i.is_overdue);
    const overdueAmt = sumByCurrency(overdue, (i) => n0(i.total_amount) - n0(i.paid_amount), (i) => i.currency);
    const dueSoon = d.due.filter((i) => !i.is_overdue);

    const payThis = d.payments.filter((p) => inRange(p.payment_date, range));
    const payPrev = d.payments.filter((p) => inRange(p.payment_date, prev));
    const paymentsByCcy = sumByCurrency(payThis, (p) => p.amount, (p) => p.currency);
    const payCountDelta = pctChange(payThis.length, payPrev.length);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueTasks = d.tasks.filter((tk) => tk.due_date && new Date(tk.due_date) < today && !['done', 'cancelled'].includes(tk.status));

    // status distribution (supplier invoices)
    const statusDist: Record<string, number> = { unpaid: 0, partial: 0, paid: 0, cancelled: 0 };
    for (const i of d.invoices) if (statusDist[i.status] != null) statusDist[i.status]++;

    // top suppliers by spend (per currency), ranked by largest single-currency total
    const supMap: Record<string, Record<string, number>> = {};
    for (const i of d.invoices) {
      const name = i.supplier?.name || '—';
      (supMap[name] ||= {});
      const c = (i.currency || 'USD').toUpperCase();
      supMap[name][c] = (supMap[name][c] || 0) + n0(i.total_amount);
    }
    const topSuppliers = Object.entries(supMap)
      .map(([name, ccy]) => ({ name, ccy, max: Math.max(...Object.values(ccy)) }))
      .sort((a, b) => b.max - a.max).slice(0, 5);

    // fleet operational (USD) within period months
    let fleetRev = 0, fleetExp = 0, fleetNet = 0, fleetHasData = false;
    if (d.fleet?.monthly?.length) {
      const fromYM = ym(range.from), toYM = ym(range.to);
      let rows = d.fleet.monthly.filter((x: any) => x.month >= fromYM && x.month <= toYM);
      if (!rows.length) rows = d.fleet.monthly; // fallback: all available months
      fleetHasData = rows.length > 0;
      for (const x of rows) { fleetRev += n0(x.revenue); fleetExp += n0(x.expenses); fleetNet += n0(x.net); }
    }

    const recentInv = [...d.invoices].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5);
    const recentPay = [...d.payments].sort((a, b) => +new Date(b.payment_date) - +new Date(a.payment_date)).slice(0, 5);

    return {
      payables, payablesCount: openInv.length, receivables, receivablesCount: openHire.length, mgmtDue,
      overdueAmt, overdueCount: overdue.length, dueSoonCount: dueSoon.length,
      paymentsByCcy, payCount: payThis.length, payCountDelta,
      overdueTasks, statusDist, topSuppliers, fleetRev, fleetExp, fleetNet, fleetHasData,
      recentInv, recentPay,
    };
  }, [d, range, prev]);

  const canDo = (href: string) => { const s = SCREENS.find((x) => x.href === href); return s ? canAccess(user, s) : false; };

  return (
    <div className="space-y-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header + period */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">{t('dash.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('dash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 shadow-sm flex-wrap">
          {PERIOD_KEYS.map((k) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={cx('text-xs px-3 py-1.5 rounded-lg transition-colors', period === k ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {t('period.' + k)}
            </button>
          ))}
          {period === 'custom' && (
            <span className="flex items-center gap-1">
              <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="text-xs border rounded-lg px-2 py-1" />
              <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="text-xs border rounded-lg px-2 py-1" />
            </span>
          )}
        </div>
      </div>

      {loading && <DashSkeleton />}

      {err && !loading && (
        <Card><EmptyState icon="x" title={t('common.error')} description={t('common.retry')} /></Card>
      )}

      {!loading && !err && m && (
        <>
          {/* ===== Layer 1: KPIs ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiMoney icon="card" color="#e11d48" label={t('kpi.payables')} map={m.payables} sub={`${m.payablesCount} ${t('kpi.openInvoices')}`} href="/dashboard/invoices" />
            <KpiMoney icon="coins" color="#059669" label={t('kpi.receivables')} map={m.receivables} sub={`${m.receivablesCount}`} href="/dashboard/hire-invoices" />
            <KpiMoney icon="receipt" color="#d97706" label={t('kpi.overdue')} map={m.overdueAmt} sub={`${m.overdueCount} ${t('att.overdueInv')}`} href="/dashboard/reports" tone={m.overdueCount ? 'danger' : undefined} />
            <KpiMoney icon="chart" color="#2563eb" label={t('kpi.paymentsPeriod')} map={m.paymentsByCcy} delta={m.payCountDelta} deltaGoodUp sub={`${m.payCount}`} href="/dashboard/payments" />
          </div>

          {/* ===== Layer 2: Needs attention ===== */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Icon name="bell" size={18} /></span>
              <h3 className="font-bold text-gray-800">{t('sec.attention')}</h3>
            </div>
            {(() => {
              const items = [
                { k: 'att.overdueInv', c: m.overdueCount, tone: 'danger' as const, href: '/dashboard/reports', icon: 'receipt' },
                { k: 'att.dueSoon', c: m.dueSoonCount, tone: 'warning' as const, href: '/dashboard/reports', icon: 'bell' },
                { k: 'att.approvalDelays', c: d!.delays.length, tone: 'warning' as const, href: '/dashboard/reports', icon: 'clipboard' },
                { k: 'att.overdueTasks', c: m.overdueTasks.length, tone: 'danger' as const, href: '/dashboard/tasks', icon: 'check' },
              ].filter((x) => x.c > 0);
              if (!items.length) return <p className="text-sm text-emerald-600 flex items-center gap-2"><Icon name="shield" size={16} />{t('att.allClear')}</p>;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {items.map((x) => (
                    <Link key={x.k} href={x.href} className={cx('flex items-center justify-between rounded-xl border p-3 hover:shadow-sm transition-all',
                      x.tone === 'danger' ? 'border-red-100 bg-red-50/50' : 'border-amber-100 bg-amber-50/50')}>
                      <span className="flex items-center gap-2 text-sm text-gray-700"><Icon name={x.icon} size={16} />{t(x.k)}</span>
                      <Badge tone={x.tone}>{fmtNum(x.c)}</Badge>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </Card>

          {/* ===== Revenue streams (separate, per confirmed definition) ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-1">
              <h3 className="font-bold text-gray-800 mb-3">{t('sec.revStreams')}</h3>
              <div className="space-y-3">
                <StreamRow label={t('lbl.revenueHire')} map={m.receivables} note="A/R" />
                <div className="border-t border-gray-100" />
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('lbl.revenueFleet')} <span className="text-gray-300">· USD</span></p>
                  {m.fleetHasData ? (
                    <div className="flex items-baseline gap-3 text-sm">
                      <span className="text-emerald-700 font-bold tabular-nums">{fmtMoney(m.fleetRev, 'USD')}</span>
                      <span className="text-gray-400 text-xs">{t('lbl.net')}: {fmtMoneyC(m.fleetNet, 'USD')}</span>
                    </div>
                  ) : <p className="text-xs text-gray-400">{t('common.empty')}</p>}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-3">{t('note.currency')}</p>
            </Card>

            {/* ===== Layer 3: status distribution ===== */}
            <Card className="p-4 lg:col-span-2">
              <h3 className="font-bold text-gray-800 mb-3">{t('sec.statusDist')}</h3>
              <StatusBars dist={m.statusDist} t={t} />
            </Card>
          </div>

          {/* ===== Layer 4: Fleet snapshot ===== */}
          {m.fleetHasData && d!.fleet?.monthly && (
            <Card className="p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">{t('sec.fleet')} <span className="text-xs font-normal text-gray-400">· USD</span></h3>
                <Link href="/dashboard/reports" className="text-xs text-brand-600 hover:underline">{t('common.viewAll')}</Link>
              </div>
              <FleetSnapshot monthly={d!.fleet.monthly} range={range} t={t} />
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ===== Layer 5: Top suppliers ===== */}
            <Card className="p-4">
              <h3 className="font-bold text-gray-800 mb-3">{t('sec.topSuppliers')}</h3>
              {m.topSuppliers.length ? (
                <div className="space-y-2.5">
                  {m.topSuppliers.map((s, i) => {
                    const max = m.topSuppliers[0].max || 1;
                    return (
                      <div key={s.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-700 font-medium truncate">{i + 1}. {s.name}</span>
                          <span className="text-gray-500 tabular-nums">{ccyEntries(s.ccy).map((e) => fmtMoneyC(e.value, e.ccy)).join(' · ')}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.max / max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title={t('common.empty')} />}
            </Card>

            {/* ===== Layer 6: Recent activity ===== */}
            <Card className="p-4">
              <h3 className="font-bold text-gray-800 mb-3">{t('sec.recent')}</h3>
              <div className="space-y-1.5 text-sm">
                {m.recentInv.slice(0, 4).map((i) => (
                  <Link key={i.id} href="/dashboard/invoices" className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-1">
                    <span className="flex items-center gap-2 text-gray-700 truncate"><Icon name="receipt" size={15} className="text-gray-400" />{i.invoice_number} · {i.supplier?.name || '—'}</span>
                    <span className="text-gray-500 tabular-nums shrink-0">{fmtMoneyC(i.total_amount, i.currency)}</span>
                  </Link>
                ))}
                {m.recentPay.slice(0, 3).map((p) => (
                  <Link key={p.id} href="/dashboard/payments" className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-1">
                    <span className="flex items-center gap-2 text-gray-700 truncate"><Icon name="card" size={15} className="text-emerald-500" />{p.invoice?.supplier?.name || t('lbl.recentPayments')}</span>
                    <span className="text-emerald-700 tabular-nums shrink-0">{fmtMoneyC(p.amount, p.currency)}</span>
                  </Link>
                ))}
                {!m.recentInv.length && !m.recentPay.length && <EmptyState title={t('common.empty')} />}
              </div>
            </Card>
          </div>

          {/* ===== Layer 7: Quick actions ===== */}
          <Card className="p-4">
            <h3 className="font-bold text-gray-800 mb-3">{t('sec.quickActions')}</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { href: '/dashboard/invoices', icon: 'receipt', k: 'qa.addInvoice' },
                { href: '/dashboard/payments', icon: 'card', k: 'qa.addPayment' },
                { href: '/dashboard/suppliers', icon: 'factory', k: 'qa.addSupplier' },
                { href: '/dashboard/purchase-orders', icon: 'clipboard', k: 'qa.addPO' },
                { href: '/dashboard/tasks', icon: 'check', k: 'qa.addTask' },
                { href: '/dashboard/reports', icon: 'chart', k: 'qa.reports' },
              ].filter((a) => canDo(a.href)).map((a) => (
                <Link key={a.k} href={a.href} className="flex items-center gap-2 text-sm border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-brand-50 hover:border-brand-300 text-gray-700 transition-colors">
                  <Icon name={a.icon} size={17} className="text-brand-600" />{t(a.k)}
                </Link>
              ))}
            </div>
          </Card>

          <p className="text-[11px] text-gray-400 text-center pb-2">{t('note.asOf')}</p>
        </>
      )}
    </div>
  );
}

/* ===== sub-components ===== */
function KpiMoney({ icon, color, label, map, sub, href, delta, deltaGoodUp, tone }:
  { icon: string; color: string; label: string; map: Record<string, number>; sub?: string; href?: string; delta?: number | null; deltaGoodUp?: boolean; tone?: 'danger' }) {
  const entries = ccyEntries(map);
  const body = (
    <Card className={cx('p-4 h-full transition-all hover:shadow-md', tone === 'danger' && entries.length > 0 && 'ring-1 ring-red-200')}>
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, color }}><Icon name={icon} size={18} /></span>
        {delta != null && (
          <span className={cx('text-[11px] font-semibold px-2 py-0.5 rounded-full', (delta >= 0) === !!deltaGoodUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-3">{label}</p>
      <div className="mt-1 space-y-0.5">
        {entries.length ? entries.map((e) => (
          <p key={e.ccy} className="text-lg font-extrabold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-xs font-medium text-gray-400">{e.ccy}</span></p>
        )) : <p className="text-lg font-extrabold text-gray-300">0</p>}
      </div>
      {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function StreamRow({ label, map, note }: { label: string; map: Record<string, number>; note?: string }) {
  const entries = ccyEntries(map);
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label} {note && <span className="text-gray-300">· {note}</span>}</p>
      {entries.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {entries.map((e) => <span key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums">{fmtMoney(e.value, e.ccy)}</span>)}
        </div>
      ) : <p className="text-xs text-gray-400">0</p>}
    </div>
  );
}

function StatusBars({ dist, t }: { dist: Record<string, number>; t: (k: string) => string }) {
  const rows = [
    { k: 'unpaid', c: '#e11d48' }, { k: 'partial', c: '#d97706' }, { k: 'paid', c: '#059669' }, { k: 'cancelled', c: '#94a3b8' },
  ];
  const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.k}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600">{t('st.' + r.k)}</span>
            <span className="text-gray-500 tabular-nums">{fmtNum(dist[r.k] || 0)} · {(((dist[r.k] || 0) / total) * 100).toFixed(0)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${((dist[r.k] || 0) / total) * 100}%`, background: r.c }} /></div>
        </div>
      ))}
    </div>
  );
}

function FleetSnapshot({ monthly, range, t }: { monthly: any[]; range: { from: Date; to: Date }; t: (k: string) => string }) {
  const fromYM = ym(range.from), toYM = ym(range.to);
  const per: Record<string, { revenue: number; expenses: number; net: number }> = {};
  let rows = monthly.filter((x) => x.month >= fromYM && x.month <= toYM);
  if (!rows.length) rows = monthly;
  for (const x of rows) {
    const a = (per[x.vessel] ||= { revenue: 0, expenses: 0, net: 0 });
    a.revenue += n0(x.revenue); a.expenses += n0(x.expenses); a.net += n0(x.net);
  }
  const list = Object.entries(per).map(([vessel, v]) => ({ vessel, ...v })).sort((a, b) => b.net - a.net);
  if (!list.length) return <EmptyState title={t('common.empty')} />;
  return (
    <table className="w-full text-sm whitespace-nowrap">
      <thead><tr className="text-gray-500 text-xs border-b border-gray-100">
        <th className="text-right py-2 px-2">{t('lbl.vessel')}</th>
        <th className="text-left py-2 px-2">{t('lbl.revenue')}</th>
        <th className="text-left py-2 px-2">{t('lbl.expenses')}</th>
        <th className="text-left py-2 px-2">{t('lbl.net')}</th>
      </tr></thead>
      <tbody>
        {list.map((v) => (
          <tr key={v.vessel} className="border-b border-gray-50 last:border-0">
            <td className="py-2 px-2 font-medium">{v.vessel}</td>
            <td className="py-2 px-2 text-left tabular-nums text-gray-700">{fmtMoneyC(v.revenue)}</td>
            <td className="py-2 px-2 text-left tabular-nums text-gray-700">{fmtMoneyC(v.expenses)}</td>
            <td className={cx('py-2 px-2 text-left tabular-nums font-semibold', v.net >= 0 ? 'text-emerald-700' : 'text-red-600')}>{fmtMoneyC(v.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl lg:col-span-2" /></div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
