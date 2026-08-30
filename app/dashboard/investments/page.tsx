'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Icon, Spinner, cx } from '@/components/ui';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * كارت متابعة استثمار Stone Shipping
 *
 *   UME Holdings ──① تغذية ──▶ Bee Shipping ──② مساهمة ──▶ Stone
 *      (الأمّ)   ◀── ④ سداد ──   (التابعة)   ◀── ③ استرداد ──
 *                     + فائدة
 *
 * ── أدمن فقط ──
 * بأمر المالك. والخادم يفرضها في كلّ موجّه، والشاشة تُعلنها هنا كذلك — فمن
 * ليس أدمن لا يرى نموذجاً يملؤه ثمّ يُردّ.
 *
 * ── ولا رقمَ يُحسب هنا ──
 * الخادم يشتقّ كلّ إجماليٍّ وكلّ تنبيهٍ من الحركات. والشاشة تعرض وتُدخل، فلا
 * يفترق حسابان.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fmt = (v: unknown) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type TabKey = 'parent' | 'investment' | 'bank' | 'items' | 'vessels' | 'interest';

/*
 * عقد ما يردّه الخادم.
 *
 * ولا `any`: الشاشة تعرض أرقاماً ماليّةً، وحقلٌ يُساء اسمُه يصير صفراً صامتاً
 * لا خطأً يظهر. فالنوع هو ما يمنع ذلك عند الترجمة.
 */
interface Money { amount_usd: string }
interface RoundView {
  id: string; round_no: number; commitment: number; status: string;
  contributed: number; contributed_pct: number; over_commitment: number;
  repat_confirmed: number; repat_announced: number;
  net_confirmed: number; net_if_all: number;
  funded_by_parent: number; unfunded_gap: number; suspect_count: number;
  fund_calls: { as_of: string; fund_called_usd: number; pct: number }[];
}
interface ParentRow extends Money {
  id: string; occurred_at: string; direction: 'funding' | 'repayment';
  kind: 'principal' | 'interest'; round_id: string | null; reference: string; note: string;
}
interface InvRow extends Money {
  id: string; round_id: string; direction: 'contribution' | 'repatriation';
  call_date: string | null; paid_date: string | null; ships: string;
  source: 'stone_recap' | 'bee_gl' | 'both'; status: string | null;
  suspect_round_id: string | null; note: string;
}
interface BankRow {
  id: string; occurred_at: string; bank: string; reference: string;
  amount_usd: string | null; note: string;
}
interface VesselRow {
  id: string; round_id: string | null; name: string; vessel_type: string;
  built: number | null; hire: string; charter_period: string; delivery: string; pool_coefficient: string;
}
interface ItemRow {
  id: string; title: string; status: 'open' | 'sent' | 'closed';
  owner: string; closed_date: string | null;
}
interface TermRow {
  id: string; effective_from: string; rate_pct: string; day_count: string;
  is_agreed: boolean; note: string;
}
interface Slice {
  from: string; to: string; days: number; principal: number; rate_pct: number; interest: number;
}
interface Alert { level: 'red' | 'amber' | 'yellow'; text: string }
interface Card {
  as_of: string;
  summary: {
    borrowed_from_parent: number; repaid_to_parent: number; outstanding_to_parent: number;
    invested_in_stone: number; returned_confirmed: number; returned_announced: number;
    interest_accrued: number; interest_paid: number; interest_outstanding: number;
    interest_has_terms: boolean; interest_agreed: boolean;
  };
  interest_slices: Slice[];
  rounds: RoundView[];
  parent_ledger: ParentRow[];
  investment_ledger: InvRow[];
  bank_confirmations: BankRow[];
  vessels: VesselRow[];
  open_items: ItemRow[];
  interest_terms: TermRow[];
  alerts: Alert[];
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'parent', label: 'دفتر الأمّ' },
  { key: 'investment', label: 'الاستثمار' },
  { key: 'bank', label: 'التأكيدات البنكيّة' },
  { key: 'items', label: 'البنود المفتوحة' },
  { key: 'vessels', label: 'السفن' },
  { key: 'interest', label: 'الفائدة' },
];

const AR = {
  funding: 'تغذية', repayment: 'سداد',
  principal: 'أصل', interest: 'فائدة',
  contribution: 'مساهمة', repatriation: 'استرداد',
  stone_recap: 'سجلّ Stone', bee_gl: 'دفتر Bee', both: 'كلاهما',
  announced: 'مُعلَن', confirmed: 'مؤكَّد',
  open: 'مفتوح', sent: 'مُرسَل', closed: 'مُغلَق',
} as Record<string, string>;

const IN = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const TH = 'px-2 py-1.5 text-xs font-semibold text-gray-500';
const TD = 'px-2 py-1.5 text-sm';

export default function InvestmentsPage() {
  const [data, setData] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<TabKey>('parent');
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  /*
   * الدور يُقرأ من المتصفّح — ولا يوجد أثناء التصيير على الخادم.
   * فالقراءة في أثرٍ، لا في قيمةٍ ابتدائيّةٍ تكسر الإماهة.
   */
  // eslint-disable-next-line react-hooks/set-state-in-effect -- مقروءٌ من localStorage بعد الإماهة
  useEffect(() => { setIsAdmin(getUser()?.role === 'admin'); }, []);

  const load = useCallback(() => api.get('/api/investments/stone')
    .then((r) => { setData(r.data as Card); setErr(''); })
    .catch((e) => setErr((e as { response?: { status?: number } })?.response?.status === 403
      ? 'هذه الشاشة للأدمن وحده.'
      : 'تعذّر تحميل الكارت — حاول مرّة أخرى.'))
    .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  /**
   * إرسالُ نموذجٍ ثمّ إعادةُ القراءة.
   *
   * ولا تُحدَّث الشاشة محلّياً بما أرسلتُه: الخادم يشتقّ الإجماليّات والتنبيهات،
   * فعرضُ ما أرسلتُه قبل أن يردّ يُظهر رقماً لم يُحسب بعد.
   */
  async function post(url: string, body: Record<string, unknown>, form?: HTMLFormElement) {
    setBusy(true); setErr('');
    try {
      await api.post(`/api/investments/stone/${url}`, body);
      form?.reset();
      await load();
    } catch (e) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذّر الحفظ');
    } finally { setBusy(false); }
  }

  async function setItemStatus(id: string, status: string) {
    setBusy(true);
    try { await api.patch(`/api/investments/stone/open-item/${id}`, { status }); await load(); }
    catch { setErr('تعذّر تغيير الحالة'); }
    finally { setBusy(false); }
  }

  if (isAdmin === false) {
    return (
      <div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-amber-800">
        <p className="font-bold">هذه الشاشة للأدمن وحده.</p>
        <p className="mt-1 text-sm">تحمل قرضاً بين شركةٍ أمٍّ وتابعتها — والحدُّ فيها دورٌ لا صلاحيّةٌ تُمنح.</p>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  if (err && !data) return <div dir="rtl" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>;
  if (!data) return null;

  const s = data.summary;
  const KPI: { label: string; value: string; tone?: string; hint?: string }[] = [
    { label: 'اقتُرض من الأمّ', value: fmt(s.borrowed_from_parent) },
    { label: 'سُدّد للأمّ', value: fmt(s.repaid_to_parent) },
    { label: 'القائم للأمّ', value: fmt(s.outstanding_to_parent), tone: 'navy' },
    { label: 'استُثمر في Stone', value: fmt(s.invested_in_stone) },
    { label: 'عاد مؤكَّداً', value: fmt(s.returned_confirmed), tone: 'green', hint: `ومُعلَنٌ لم يُؤكَّد: ${fmt(s.returned_announced)}` },
    {
      label: 'فائدةٌ مستحقّة',
      value: s.interest_has_terms ? fmt(s.interest_outstanding) : '—',
      tone: 'amber',
      /*
       * «لا فائدةَ مُتّفقٌ عليها» لا «صفر».
       * فالصفر يُقرأ حساباً انتهى إلى لا شيء، وهذا يُقرأ غياباً — والفرق يجعل
       * الرقم إقراراً بدَينٍ لم يُوقَّع.
       */
      hint: !s.interest_has_terms ? 'لا فائدةَ مُتّفقٌ عليها' : (s.interest_agreed ? 'بشروطٍ موقَّعة' : 'تقديريٌّ — شروطٌ غير موقَّعة'),
    },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── الرأس ── */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon name="coins" size={22} /></span>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">استثمار Stone Shipping</h1>
          <p className="text-sm text-gray-500">
            UME Holdings تُقرض Bee Shipping لتستثمر في Stone — كلّ المبالغ بالدولار الأمريكي
          </p>
        </div>
        <span className="ms-auto text-xs text-gray-400">حتّى {data.as_of}</span>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}

      {/* ── الأرقام الستّة ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {KPI.map((k) => (
          <div key={k.label} className={cx('rounded-xl p-3 shadow-sm',
            k.tone === 'navy' ? 'bg-navy-900 text-white'
              : k.tone === 'green' ? 'bg-emerald-50 border border-emerald-200'
                : k.tone === 'amber' ? 'bg-amber-50 border border-amber-200' : 'border border-gray-100 bg-white')}>
            <p className={cx('text-[11px]', k.tone === 'navy' ? 'text-white/70' : 'text-gray-500')}>{k.label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums">{k.value}</p>
            {k.hint && <p className={cx('mt-0.5 text-[10px] leading-tight', k.tone === 'navy' ? 'text-white/60' : 'text-gray-500')}>{k.hint}</p>}
          </div>
        ))}
      </div>

      {/* ── التنبيهات · مشتقّةٌ من الأرقام لا مكتوبة ── */}
      {data.alerts?.length > 0 && (
        <div className="space-y-1.5">
          {data.alerts.map((a: Alert, i: number) => (
            <div key={i} className={cx('rounded-lg border px-3 py-2 text-sm',
              a.level === 'red' ? 'border-red-300 bg-red-50 text-red-800'
                : a.level === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-yellow-200 bg-yellow-50 text-yellow-800')}>
              {a.level === 'red' ? '🔴' : a.level === 'amber' ? '🟠' : '🟡'} {a.text}
            </div>
          ))}
        </div>
      )}

      {/* ── الجولات ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.rounds.map((r: RoundView) => (
          <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-bold text-gray-800">الجولة {r.round_no}</h3>
              <span className="font-mono text-sm text-gray-500">التزام {fmt(r.commitment)}</span>
            </div>
            <table className="w-full">
              <tbody>
                {[
                  ['استُثمر', fmt(r.contributed), `${r.contributed_pct}%`],
                  ['أقرضت الأمّ', fmt(r.funded_by_parent), ''],
                  ['فجوة التمويل', fmt(r.unfunded_gap), r.unfunded_gap > 0 ? '⚠' : ''],
                  ['عاد مؤكَّداً', fmt(r.repat_confirmed), ''],
                  ['عاد مُعلَناً', fmt(r.repat_announced), r.repat_announced > 0 ? '⚠' : ''],
                  ['الصافي (بالمؤكَّد)', fmt(r.net_confirmed), ''],
                ].map(([a, b, c]) => (
                  <tr key={a as string} className="border-t border-gray-50">
                    <td className="py-1 text-sm text-gray-600">{a}</td>
                    <td className="py-1 text-end font-mono text-sm tabular-nums">{b}</td>
                    <td className="w-10 py-1 text-end text-xs text-amber-600">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.over_commitment > 0 && (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                تجاوزُ الالتزام: <b className="font-mono">{fmt(r.over_commitment)}</b>
              </p>
            )}
            {r.fund_calls?.length > 0 && (
              <p className="mt-2 text-[11px] text-gray-500">
                الصندوق نادى: {r.fund_calls.map((c: RoundView['fund_calls'][number]) => `${(c.pct * 100).toFixed(1)}% (${c.as_of})`).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── التبويبات ── */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-100')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── دفتر الأمّ ── */}
      {tab === 'parent' && (
        <Section title="دفتر الأمّ — UME Holdings ↔ Bee Shipping"
          note="المبلغ موجبٌ دائماً، والاتّجاه يحمل الإشارة. والفائدة تُتابَع منفصلةً فلا تُنقص الأصل.">
          <form className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6" onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const d = new FormData(f);
            post('parent', {
              occurred_at: d.get('occurred_at'), direction: d.get('direction'), kind: d.get('kind'),
              amount_usd: d.get('amount_usd'), round_id: d.get('round_id') || null,
              reference: d.get('reference'), note: d.get('note'),
            }, f);
          }}>
            <input name="occurred_at" type="date" required className={IN} />
            <select name="direction" className={IN}><option value="funding">تغذية</option><option value="repayment">سداد</option></select>
            <select name="kind" className={IN}><option value="principal">أصل</option><option value="interest">فائدة</option></select>
            <input name="amount_usd" type="number" step="0.01" min="0.01" required placeholder="المبلغ" className={IN} />
            <select name="round_id" className={IN}>
              <option value="">بلا جولة</option>
              {data.rounds.map((r: RoundView) => <option key={r.id} value={r.id}>الجولة {r.round_no}</option>)}
            </select>
            <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? '…' : 'أضف'}
            </button>
            <input name="reference" placeholder="المرجع" className={cx(IN, 'md:col-span-2')} />
            <input name="note" placeholder="بيان" className={cx(IN, 'md:col-span-4')} />
          </form>
          <Table head={['التاريخ', 'الاتّجاه', 'النوع', 'المبلغ', 'المرجع', 'بيان']}>
            {data.parent_ledger.map((m: ParentRow) => (
              <tr key={m.id} className="border-t border-gray-50">
                <td className={TD}>{m.occurred_at}</td>
                <td className={TD}>{AR[m.direction]}</td>
                <td className={TD}>{AR[m.kind]}</td>
                <td className={cx(TD, 'text-end font-mono tabular-nums', m.direction === 'funding' ? 'text-red-700' : 'text-emerald-700')}>{fmt(m.amount_usd)}</td>
                <td className={cx(TD, 'text-xs text-gray-500')}>{m.reference}</td>
                <td className={cx(TD, 'text-xs text-gray-500')}>{m.note}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {/* ── دفتر الاستثمار ── */}
      {tab === 'investment' && (
        <Section title="دفتر الاستثمار — Bee Shipping ↔ Stone"
          note="تاريخ النداء من سجلّ Stone، وتاريخ الدفع من دفتر Bee. ودفتر Bee يفوز عند التعارض.">
          <form className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-7" onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget; const d = new FormData(f);
            post('investment', {
              round_id: d.get('round_id'), direction: d.get('direction'),
              call_date: d.get('call_date') || null, paid_date: d.get('paid_date') || null,
              amount_usd: d.get('amount_usd'), ships: d.get('ships'),
              source: d.get('source'), status: d.get('status'), note: d.get('note'),
            }, f);
          }}>
            <select name="round_id" required className={IN}>
              {data.rounds.map((r: RoundView) => <option key={r.id} value={r.id}>الجولة {r.round_no}</option>)}
            </select>
            <select name="direction" className={IN}><option value="contribution">مساهمة</option><option value="repatriation">استرداد</option></select>
            <input name="call_date" type="date" title="تاريخ النداء" className={IN} />
            <input name="paid_date" type="date" title="تاريخ الدفع" className={IN} />
            <input name="amount_usd" type="number" step="0.01" min="0.01" required placeholder="المبلغ" className={IN} />
            <select name="source" className={IN}>
              <option value="both">كلاهما</option><option value="stone_recap">سجلّ Stone</option><option value="bee_gl">دفتر Bee</option>
            </select>
            <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? '…' : 'أضف'}
            </button>
            <select name="status" className={IN} title="للاسترداد وحده">
              <option value="announced">مُعلَن</option><option value="confirmed">مؤكَّد</option>
            </select>
            <input name="ships" placeholder="السفن" className={cx(IN, 'md:col-span-2')} />
            <input name="note" placeholder="بيان" className={cx(IN, 'md:col-span-4')} />
          </form>
          <Table head={['الجولة', 'النوع', 'نداء', 'دفع', 'المبلغ', 'المصدر', 'الحالة', 'السفن', 'بيان']}>
            {data.investment_ledger.map((m: InvRow) => {
              const r = data.rounds.find((x) => x.id === m.round_id);
              const suspect = !!m.suspect_round_id;
              return (
                <tr key={m.id} className={cx('border-t border-gray-50', suspect && 'bg-amber-50/60')}>
                  <td className={TD}>{r ? r.round_no : '—'}</td>
                  <td className={TD}>{AR[m.direction]}</td>
                  <td className={cx(TD, 'text-xs')}>{m.call_date || '—'}</td>
                  <td className={cx(TD, 'text-xs')}>{m.paid_date || '—'}</td>
                  <td className={cx(TD, 'text-end font-mono tabular-nums')}>{fmt(m.amount_usd)}</td>
                  <td className={cx(TD, 'text-xs')}>{AR[m.source]}</td>
                  <td className={cx(TD, 'text-xs')}>{m.status ? AR[m.status] : '—'}</td>
                  <td className={cx(TD, 'text-xs text-gray-500')}>{m.ships}</td>
                  <td className={cx(TD, 'text-xs text-gray-500')}>
                    {suspect && <b className="text-amber-700">⚠ مشكوكٌ في جولته · </b>}{m.note}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Section>
      )}

      {/* ── التأكيدات البنكيّة ── */}
      {tab === 'bank' && (
        <Section title="تأكيدات التحويلات البنكيّة" note="سجلٌّ مستقلّ — فتأكيدٌ واحدٌ قد يغطّي أكثر من قيد.">
          <form className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5" onSubmit={(e) => {
            e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
            post('bank', {
              occurred_at: d.get('occurred_at'), bank: d.get('bank'),
              reference: d.get('reference'), amount_usd: d.get('amount_usd') || null, note: d.get('note'),
            }, f);
          }}>
            <input name="occurred_at" type="date" required className={IN} />
            <input name="bank" placeholder="البنك" className={IN} />
            <input name="reference" placeholder="المرجع" className={IN} />
            <input name="amount_usd" type="number" step="0.01" placeholder="المبلغ" className={IN} />
            <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">أضف</button>
            <input name="note" placeholder="بيان" className={cx(IN, 'md:col-span-5')} />
          </form>
          <Table head={['التاريخ', 'البنك', 'المرجع', 'المبلغ', 'بيان']}>
            {data.bank_confirmations.map((b: BankRow) => (
              <tr key={b.id} className="border-t border-gray-50">
                <td className={TD}>{b.occurred_at}</td>
                <td className={TD}>{b.bank}</td>
                <td className={cx(TD, 'text-xs')}>{b.reference}</td>
                <td className={cx(TD, 'text-end font-mono tabular-nums')}>{b.amount_usd ? fmt(b.amount_usd) : '—'}</td>
                <td className={cx(TD, 'text-xs text-gray-500')}>{b.note}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {/* ── البنود المفتوحة ── */}
      {tab === 'items' && (
        <Section title="البنود المفتوحة" note="حالةٌ ومسؤول — فقائمةٌ بلا حالةٍ تُقرأ ولا تتحرّك.">
          <form className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6" onSubmit={(e) => {
            e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
            post('open-item', { title: d.get('title'), owner: d.get('owner'), note: d.get('note') }, f);
          }}>
            <input name="title" required placeholder="البند" className={cx(IN, 'md:col-span-3')} />
            <input name="owner" placeholder="المسؤول" className={IN} />
            <input name="note" placeholder="ملاحظة" className={IN} />
            <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">أضف</button>
          </form>
          <ul className="space-y-1.5">
            {data.open_items.map((it: ItemRow) => (
              <li key={it.id} className={cx('flex items-start gap-2 rounded-lg border px-3 py-2',
                it.status === 'closed' ? 'border-emerald-200 bg-emerald-50/50'
                  : it.status === 'sent' ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white')}>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm', it.status === 'closed' ? 'text-gray-500 line-through' : 'text-gray-800')}>{it.title}</p>
                  {(it.owner || it.closed_date) && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {it.owner}{it.owner && it.closed_date ? ' · ' : ''}{it.closed_date ? `أُغلق ${it.closed_date}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {(['open', 'sent', 'closed'] as const).map((st) => (
                    <button key={st} type="button" disabled={busy || it.status === st}
                      onClick={() => setItemStatus(it.id, st)}
                      className={cx('rounded px-2 py-0.5 text-[11px]',
                        it.status === st ? 'bg-navy-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50')}>
                      {AR[st]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── السفن ── */}
      {tab === 'vessels' && (
        <Section title="السفن المضافة">
          <Table head={['الجولة', 'الاسم', 'النوع', 'البناء', 'الإيجار', 'المدّة', 'التسليم', 'المعامل']}>
            {data.vessels.map((v: VesselRow) => {
              const r = data.rounds.find((x) => x.id === v.round_id);
              return (
                <tr key={v.id} className="border-t border-gray-50">
                  <td className={TD}>{r ? r.round_no : '—'}</td>
                  <td className={cx(TD, 'font-medium')}>{v.name}</td>
                  <td className={TD}>{v.vessel_type}</td>
                  <td className={TD}>{v.built || '—'}</td>
                  <td className={TD}>{v.hire}</td>
                  <td className={cx(TD, 'text-xs')}>{v.charter_period}</td>
                  <td className={cx(TD, 'text-xs')}>{v.delivery}</td>
                  <td className={cx(TD, 'text-xs')}>{v.pool_coefficient}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
      )}

      {/* ── الفائدة ── */}
      {tab === 'interest' && (
        <Section title="شروط الفائدة والاستحقاق"
          note="المحرّك يحسب تقديراً يُعرض — ولا يُقيَّد في دفتر الأمّ إلا بيدك من تبويب «دفتر الأمّ» بنوع «فائدة».">
          {!s.interest_has_terms && (
            <p className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <b>لا فائدةَ مُتّفقٌ عليها.</b> لا شرطَ مُدخَلٌ بعد — والمستندات تصف التسهيل بأنّه بلا فائدة.
            </p>
          )}
          <form className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5" onSubmit={(e) => {
            e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
            post('interest-term', {
              effective_from: d.get('effective_from'), rate_pct: d.get('rate_pct'),
              day_count: d.get('day_count'), is_agreed: d.get('is_agreed') === 'on', note: d.get('note'),
            }, f);
          }}>
            <input name="effective_from" type="date" required className={IN} />
            <input name="rate_pct" type="number" step="0.0001" min="0" required placeholder="النسبة %" className={IN} />
            <select name="day_count" className={IN}><option>ACT/365</option><option>ACT/360</option></select>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input name="is_agreed" type="checkbox" /> مُتّفقٌ عليه
            </label>
            <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">أضف شرطاً</button>
            <input name="note" placeholder="ملاحظة" className={cx(IN, 'md:col-span-5')} />
          </form>

          {data.interest_terms.length > 0 && (
            <Table head={['من', 'النسبة', 'الأساس', 'مُتّفقٌ عليه؟', 'ملاحظة']}>
              {data.interest_terms.map((t: TermRow) => (
                <tr key={t.id} className="border-t border-gray-50">
                  <td className={TD}>{t.effective_from}</td>
                  <td className={cx(TD, 'font-mono')}>{Number(t.rate_pct)}%</td>
                  <td className={TD}>{t.day_count}</td>
                  <td className={TD}>{t.is_agreed ? 'نعم' : <b className="text-amber-700">لا — تقديريّ</b>}</td>
                  <td className={cx(TD, 'text-xs text-gray-500')}>{t.note}</td>
                </tr>
              ))}
            </Table>
          )}

          {data.interest_slices?.length > 0 && (
            <>
              <p className="mb-1 mt-4 text-sm font-semibold text-gray-700">الشرائح المحسوبة</p>
              <Table head={['من', 'إلى', 'أيّام', 'الأصل', 'النسبة', 'الفائدة']}>
                {data.interest_slices.map((x: Slice, i: number) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className={cx(TD, 'text-xs')}>{x.from}</td>
                    <td className={cx(TD, 'text-xs')}>{x.to}</td>
                    <td className={cx(TD, 'text-end')}>{x.days}</td>
                    <td className={cx(TD, 'text-end font-mono tabular-nums')}>{fmt(x.principal)}</td>
                    <td className={cx(TD, 'text-end')}>{x.rate_pct}%</td>
                    <td className={cx(TD, 'text-end font-mono tabular-nums')}>{fmt(x.interest)}</td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="font-bold text-gray-800">{title}</h3>
      {note && <p className="mb-3 mt-0.5 text-xs text-gray-500">{note}</p>}
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="bg-gray-50">
          <tr>{head.map((h) => <th key={h} className={cx(TH, 'text-start')}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
