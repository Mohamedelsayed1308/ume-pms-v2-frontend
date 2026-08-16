'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Select, Input, Field, Icon, Callout, TableSkeleton, EmptyState, cx } from '@/components/ui';

/*
 * تقارير الأطراف ودفتر الأستاذ.
 *
 * الشكل يتبع تقارير QuickBooks التي يقارن بها الفريق: ترويسة مركزية باسم
 * الشركة ثم اسم التقرير ثم أساس التاريخ، وأعمدة بالترتيب نفسه. والمقارنة بين
 * نظامين تفشل حين يختلف ترتيب الأعمدة قبل أن تختلف الأرقام.
 */

type ReportKey = 'vendor_summary' | 'vendor_detail' | 'customer_summary' | 'customer_detail' | 'general_ledger';

const REPORTS: { key: ReportKey; label: string; en: string; endpoint: string; party: boolean }[] = [
  { key: 'vendor_summary', label: 'أرصدة الموردين — ملخّص', en: 'Vendor Balance Summary', endpoint: 'vendor-balance', party: true },
  { key: 'vendor_detail', label: 'أرصدة الموردين — تفصيل', en: 'Vendor Balance Detail', endpoint: 'vendor-balance', party: true },
  { key: 'customer_summary', label: 'أرصدة العملاء — ملخّص', en: 'Customer Balance Summary', endpoint: 'customer-balance', party: true },
  { key: 'customer_detail', label: 'أرصدة العملاء — تفصيل', en: 'Customer Balance Detail', endpoint: 'customer-balance', party: true },
  { key: 'general_ledger', label: 'دفتر الأستاذ العام', en: 'General Ledger', endpoint: 'general-ledger', party: false },
];

const today = () => new Date().toISOString().slice(0, 10);

/*
 * الصفر يُكتب صفراً لا فراغاً.
 *
 * الخانة الفارغة تُقرأ «لا بيانات»، والصفر يقول «حُسب فكان صفراً» — وهما
 * مختلفان في تقرير مالي.
 */
const money = (n: number | null | undefined) =>
  (n == null ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** الخانة تُترك خالية إن كان المبلغ صفراً — كما في QuickBooks حيث المدين والدائن لا يجتمعان. */
const side = (n: number) => (Number(n) === 0 ? '' : money(n));

export default function AccountingReportsPage() {
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [report, setReport] = useState<ReportKey>('vendor_summary');
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState('2026-01-01');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const def = REPORTS.find((r) => r.key === report)!;

  useEffect(() => {
    api.get('/api/accounting/entities')
      .then((r) => { setEntities(r.data || []); if (r.data?.[0]) setEntityId(r.data[0].id); })
      .catch(() => setError('تعذّر تحميل الكيانات.'));
  }, []);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true); setError('');
    try {
      const q = def.party
        ? { legal_entity_id: entityId, as_of: asOf }
        : { legal_entity_id: entityId, period_start: from, period_end: asOf };
      const r = await api.get(`/api/accounting/reports/${def.endpoint}`, { params: q });
      setData(r.data);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.data?.message || 'تعذّر إخراج التقرير.');
    } finally { setLoading(false); }
  }, [entityId, asOf, from, def]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold text-gray-900">تقارير الدفتر</h1>
        <p className="text-sm text-gray-500 mt-1">أرصدة الأطراف ودفتر الأستاذ — بشكل QuickBooks المعتاد</p>
      </div>

      <Card className="p-3 flex flex-wrap items-end gap-3 no-print">
        <Field label="الكيان" className="min-w-[10rem]">
          <Select value={entityId} onChange={(e: any) => setEntityId(e.target.value)}>
            {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="التقرير" className="min-w-[15rem]">
          <Select value={report} onChange={(e: any) => setReport(e.target.value as ReportKey)}>
            {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </Field>
        {!def.party && (
          <Field label="من تاريخ"><Input type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} className="w-auto" /></Field>
        )}
        <Field label={def.party ? 'حتى تاريخ' : 'إلى تاريخ'}>
          <Input type="date" value={asOf} onChange={(e: any) => setAsOf(e.target.value)} className="w-auto" />
        </Field>
        <Button variant="outline" icon="refresh" onClick={load} disabled={loading}>تحديث</Button>
        <Button variant="ghost" icon="download" onClick={() => window.print()}>طباعة / PDF</Button>
      </Card>

      {error && <Callout tone="danger" title="تعذّر إخراج التقرير">{error}</Callout>}

      <Card className="p-0 overflow-hidden">
        {/* ═══ ترويسة على نمط التقرير الأصلي ═══ */}
        <div className="text-center py-4 border-b border-[var(--hairline)]">
          <p className="font-bold text-brand-900 tracking-tight">{data?.entity?.name || '—'}</p>
          <p className="text-lg font-bold text-gray-900">{def.en}</p>
          <p className="text-xs text-brand-700 mt-0.5">
            {def.party ? `As of ${asOf}` : `${from} → ${asOf}`}
          </p>
          <p className="text-[10px] text-amber-700 mt-1 font-mono">MANAGEMENT ACCOUNTS — OPENING BALANCES UNAUDITED</p>
        </div>

        {loading ? <div className="p-4"><TableSkeleton rows={10} cols={6} /></div>
          : !data ? <EmptyState title="لا تقرير بعد" description="اختر الكيان والتاريخ ثم حدّث." />
          : report === 'general_ledger' ? <GeneralLedger data={data} />
          : report.endsWith('summary') ? <PartySummary data={data} />
          : <PartyDetail data={data} />}
      </Card>
    </div>
  );
}

// ═════════════════════════ ملخّص أرصدة الأطراف ═════════════════════════

function PartySummary({ data }: { data: any }) {
  const rows = data?.summary?.rows || [];
  if (!rows.length) return <EmptyState title="لا أرصدة" description="لا طرف له رصيد قائم في هذا التاريخ." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="px-4 py-2 text-right">الطرف</th>
            <th scope="col" className="px-4 py-2 text-left w-40">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.party_id ?? `u-${i}`} className={cx(r.unattributed && 'bg-amber-50/60')}>
              <td className="px-4 py-2 font-medium" dir="auto">
                {r.party_name}
                {r.unattributed && <span className="ms-2 text-[11px] text-amber-700 font-normal">لا مستند تفصيلي</span>}
              </td>
              <td className={cx('px-4 py-2 text-left tabular-nums', Number(r.balance) < 0 && 'money-neg')}>{money(r.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-4 py-2">TOTAL</td>
            <td className="px-4 py-2 text-left tabular-nums">{money(data.summary.total)}</td>
          </tr>
        </tfoot>
      </table>
      <Attribution detail={data.detail} />
    </div>
  );
}

// ═════════════════════════ تفصيل أرصدة الأطراف ═════════════════════════

function PartyDetail({ data }: { data: any }) {
  const groups = data?.detail?.groups || [];
  if (!groups.length) return <EmptyState title="لا حركة" description="لا حركة على هذا الحساب حتى التاريخ." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-right">Type</th>
            <th scope="col" className="px-3 py-2 text-right">Date</th>
            <th scope="col" className="px-3 py-2 text-right">Num</th>
            <th scope="col" className="px-3 py-2 text-right">Account</th>
            <th scope="col" className="px-3 py-2 text-left">Debit</th>
            <th scope="col" className="px-3 py-2 text-left">Credit</th>
            <th scope="col" className="px-3 py-2 text-left">Amount</th>
            <th scope="col" className="px-3 py-2 text-left">Balance</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g: any, gi: number) => (
            <FragmentGroup key={g.party_id ?? `u-${gi}`} g={g} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2" colSpan={6}>TOTAL</td>
            <td className="px-3 py-2 text-left tabular-nums">{money(data.detail.grand_total)}</td>
            <td className="px-3 py-2 text-left tabular-nums">{money(data.detail.grand_total)}</td>
          </tr>
        </tfoot>
      </table>
      <Attribution detail={data.detail} />
    </div>
  );
}

function FragmentGroup({ g }: { g: any }) {
  return (
    <>
      <tr className={cx('bg-gray-50', g.unattributed && 'bg-amber-50')}>
        <td className="px-3 py-1.5 font-bold" colSpan={8} dir="auto">
          {g.party_name}
          {g.unattributed && <span className="ms-2 text-[11px] text-amber-700 font-normal">مرحَّل جملةً من ميزان المراجعة — لا تفصيل بالطرف</span>}
        </td>
      </tr>
      {g.rows.map((r: any, i: number) => (
        <tr key={i}>
          <td className="px-3 py-1.5">{r.type}</td>
          <td className="px-3 py-1.5 whitespace-nowrap">{r.date}</td>
          <td className="px-3 py-1.5 font-mono text-xs">{r.num}</td>
          <td className="px-3 py-1.5 text-gray-600 text-xs" dir="auto">{r.account}</td>
          <td className="px-3 py-1.5 text-left tabular-nums">{side(r.debit)}</td>
          <td className="px-3 py-1.5 text-left tabular-nums">{side(r.credit)}</td>
          <td className={cx('px-3 py-1.5 text-left tabular-nums', r.amount < 0 && 'money-neg')}>{money(r.amount)}</td>
          <td className={cx('px-3 py-1.5 text-left tabular-nums font-medium', r.balance < 0 && 'money-neg')}>{money(r.balance)}</td>
        </tr>
      ))}
      <tr className="bg-gray-50/70 font-medium border-t border-[var(--hairline)]">
        <td className="px-3 py-1.5" colSpan={4} dir="auto">Total {g.party_name}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(g.total_debit)}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(g.total_credit)}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(g.total_amount)}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(g.balance)}</td>
      </tr>
    </>
  );
}

/**
 * تفكيك المنسوب وغير المنسوب.
 *
 * إخفاء نسبة التغطية يجعل التقرير يبدو كاملاً وهو ناقص — والقارئ يبني عليه
 * قراراً لا يحتمله. فتُعرض النسبة صراحةً تحت كل تقرير أطراف.
 */
function Attribution({ detail }: { detail: any }) {
  if (!detail) return null;
  const grand = Number(detail.grand_total) || 0;
  const pct = grand === 0 ? 100 : Math.round((Number(detail.attributed_total) / grand) * 1000) / 10;
  if (!detail.unattributed_total) return null;

  return (
    <div className="p-3 border-t border-[var(--hairline)] bg-amber-50/40 text-xs text-gray-700 space-y-1">
      <p className="font-semibold text-amber-900">تغطية النسبة إلى الأطراف: {pct}%</p>
      <p>
        منسوب <span className="tabular-nums font-medium">{money(detail.attributed_total)}</span>
        {' · '}غير منسوب <span className="tabular-nums font-medium">{money(detail.unattributed_total)}</span>
      </p>
      <p className="text-gray-500">
        غير المنسوب رُحِّل جملةً من ميزان المراجعة الافتتاحي بلا كشفٍ تفصيلي، فلا يُنسب إلى طرفٍ بعينه.
        ينحسر وحده كلّما رُحِّلت حركاتٌ جديدة أو وصل كشفٌ تفصيلي.
      </p>
    </div>
  );
}

// ═════════════════════════ دفتر الأستاذ العام ═════════════════════════

function GeneralLedger({ data }: { data: any }) {
  const accounts = data?.report?.accounts || [];
  if (!accounts.length) return <EmptyState title="لا حركة" description="لا حساب بحركة أو رصيد في هذه الفترة." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-right">Type</th>
            <th scope="col" className="px-3 py-2 text-right">Date</th>
            <th scope="col" className="px-3 py-2 text-right">Num</th>
            <th scope="col" className="px-3 py-2 text-right">Name</th>
            <th scope="col" className="px-3 py-2 text-right">Memo</th>
            <th scope="col" className="px-3 py-2 text-right">Split</th>
            <th scope="col" className="px-3 py-2 text-left">Amount</th>
            <th scope="col" className="px-3 py-2 text-left">Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a: any) => (
            <GlAccountRows key={a.account_id} a={a} />
          ))}
        </tbody>
      </table>
      <div className="p-3 border-t border-[var(--hairline)] text-xs text-gray-500">
        مجموع حركة الفترة (مدين − دائن){' '}
        <span className="tabular-nums font-semibold text-gray-800">{money(data.report.total_period_amount)}</span>
        {' — '}الصفر هنا دليلُ توازنٍ لا غيابَ بيانات.
      </div>
    </div>
  );
}

function GlAccountRows({ a }: { a: any }) {
  return (
    <>
      {/* رأس الحساب يحمل رصيده الافتتاحي — كما في التقرير الأصلي. */}
      <tr className="bg-gray-50">
        <td className="px-3 py-1.5 font-bold" colSpan={7} dir="auto">
          <span className="font-mono text-xs text-gray-500">{a.code}</span> · {a.name}
        </td>
        <td className="px-3 py-1.5 text-left tabular-nums font-bold">{money(a.opening)}</td>
      </tr>
      {a.rows.map((r: any, i: number) => (
        <tr key={i}>
          <td className="px-3 py-1.5">{r.type}</td>
          <td className="px-3 py-1.5 whitespace-nowrap">{r.date}</td>
          <td className="px-3 py-1.5 font-mono text-xs">{r.num}</td>
          <td className="px-3 py-1.5 text-xs" dir="auto">{r.name}</td>
          <td className="px-3 py-1.5 text-xs text-gray-600 max-w-[16rem] truncate" title={r.memo} dir="auto">{r.memo}</td>
          <td className="px-3 py-1.5 text-xs text-gray-500" dir="auto">{r.split}</td>
          <td className={cx('px-3 py-1.5 text-left tabular-nums', r.amount < 0 && 'money-neg')}>{money(r.amount)}</td>
          <td className="px-3 py-1.5 text-left tabular-nums font-medium">{money(r.balance)}</td>
        </tr>
      ))}
      <tr className="bg-gray-50/70 font-medium border-t border-[var(--hairline)]">
        <td className="px-3 py-1.5" colSpan={6} dir="auto">Total {a.code} · {a.name}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(a.period_amount)}</td>
        <td className="px-3 py-1.5 text-left tabular-nums">{money(a.closing)}</td>
      </tr>
    </>
  );
}
