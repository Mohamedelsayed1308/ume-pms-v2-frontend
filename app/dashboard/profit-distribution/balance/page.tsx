'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';

/*
 * الرصيد التراكميّ — شاشةٌ مستقلّة.
 *
 * ── لماذا يوجد رصيدٌ أصلاً ──
 * التوزيع يصدر وفي مصاريفه **مبالغ تقديريّة**: رسوم ميناء مصر تُكتب ١١٬٥٠٠ في
 * كلّ رحلة حتّى تصل الفاتورة. فالمُحوَّل إلى البنك صدر على تقدير، ثمّ يتغيّر
 * الشيت حين يصير التقدير فعلاً — والحوالة قد نُفّذت.
 *
 * فالفرق لا يُعاد فتح التوزيع من أجله، بل يُقيَّد ويُحمَل إلى المصادقة التالية.
 *
 * ── ولماذا دفترٌ لا رقم ──
 * الرصيد يُسأل عنه بعد سنة: «من أين جاء هذا؟». فكلّ فرقٍ قيدٌ بتاريخه وفترته
 * وسببه، وتسويته قيدٌ مقابل. والرصيد مجموع القيود — يُشتقّ ولا يُخزَّن، فلا
 * يفترق عن دفتره أبداً.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type Entry = {
  id: string; period_id: string; period_name: string;
  occurred_at: string; partner: string; amount: number;
  kind: string; note: string; created_by: string;
};

type PartnerPair = { badawi: number; ittihad: number };

type Transfer = {
  id: string; period_name: string; date_from: string; date_to: string;
  at: string; by: string | null;
  computed: PartnerPair | null; carriedIn: PartnerPair | null;
  paid: PartnerPair | null; runningPaid: PartnerPair;
};

type Statement = {
  balances: Record<string, number>;
  transfers: { list: Transfer[]; totalPaid: PartnerPair };
  partnerNames: Record<string, string>;
  hasOpening: boolean;
  /** يُعدَّل ما لم تُصادَق فترةٌ بُنيت عليه */
  openingEditable: boolean;
  opening: Record<string, number>;
  entries: Entry[];
};

const PARTNERS = ['badawi', 'ittihad'] as const;

export default function BalancePage() {
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/profit-periods/settlements/statement');
      setData(res.data);
      setError('');
    } catch {
      setError('تعذّر تحميل دفتر الفروق — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الرصيد التراكميّ</h1>
          <p className="text-xs text-gray-500 mt-1">
            فروقُ ما بعد المصادقة — تتراكم للشريكين وتُسوّى في المصادقة التالية
          </p>
        </div>
        <Link href="/dashboard/profit-distribution"
          className="text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-lg px-3 py-2">
          ← كشف التوزيع
        </Link>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <p className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">{error}</p>
      ) : data ? (
        <>
          {/*
            * ── البطاقتان: ما حُوِّل، وما بقي معلّقاً ──
            *
            * المجموع المُحوَّل هو **حركة المال**، والرصيد المعلّق تصحيحاتٌ لم
            * تُسوَّ بعد. وكان المعروض الرصيد وحده — فإذا سُوّي صار صفراً وبدت
            * الشاشة خاليةً من المعنى، وهي أبعد ما تكون عنه.
            */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {PARTNERS.map((p) => {
              const v = data.balances?.[p] ?? 0;
              const settled = Math.abs(v) <= 0.02;
              const total = data.transfers?.totalPaid?.[p] ?? 0;
              return (
                <div key={p} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="text-sm text-gray-600 mb-1">{data.partnerNames?.[p] || p}</div>
                  <div className="font-mono text-2xl font-bold text-indigo-900">{fmt(total)}</div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    مجموع ما حُوِّل إلى حسابه — من {data.transfers?.list?.length ?? 0} مصادقة
                  </div>
                  <div className={`mt-3 pt-3 border-t text-sm font-mono font-semibold ${
                    settled ? 'text-gray-400' : v > 0 ? 'text-blue-800' : 'text-rose-800'}`}>
                    {settled ? fmt(0) : (v > 0 ? '+' : '') + paren(v)}
                    <span className="block text-[11px] font-sans font-normal text-gray-500 mt-0.5">
                      {settled
                        ? 'ولا فرقَ معلّقاً — كلّ تصحيحٍ سُوّي.'
                        : v > 0
                          ? 'فرقٌ لصالحه — يُزاد على تحويله في المصادقة التالية.'
                          : 'فرقٌ عليه — يُخصم من تحويله في المصادقة التالية.'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── التحويلات المُصادَق عليها — حركةُ المال ── */}
          {(data.transfers?.list?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl shadow overflow-x-auto mb-6">
              <p className="text-xs font-semibold text-gray-600 px-4 pt-4 pb-2">
                التحويلات المُصادَق عليها
              </p>
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th scope="col" className="px-4 py-3">الفترة</th>
                    <th scope="col" className="px-4 py-3">صُودق في</th>
                    <th scope="col" className="px-4 py-3 text-left">المحسوب</th>
                    <th scope="col" className="px-4 py-3 text-left">± المحمول</th>
                    <th scope="col" className="px-4 py-3 text-left">المُحوَّل</th>
                    <th scope="col" className="px-4 py-3 text-left">التراكميّ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transfers.list.map((t) => (
                    <tr key={t.id} className="border-t align-top">
                      <td className="px-4 py-3">
                        {t.period_name}
                        <span className="block text-[11px] text-gray-400">
                          {t.date_from} → {t.date_to}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {when(t.at)}
                        {t.by ? <span className="block text-gray-400">{t.by}</span> : null}
                      </td>
                      <Pair v={t.computed} />
                      <Pair v={t.carriedIn} signed />
                      <Pair v={t.paid} bold />
                      <Pair v={t.runningPaid} muted />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-500 px-4 py-3 border-t">
                كلّ خليّةٍ سطران: <b>UME · بدوي</b> فوق، و<b>الاتحاد</b> تحته.
                و«المحمول» رصيدٌ من فتراتٍ سابقة دخل في هذه المصادقة —
                فـ «المُحوَّل» هو ما خرج إلى البنك فعلاً.
              </p>
            </div>
          )}

          {/* ── الرصيد الافتتاحيّ — يُعدَّل ما لم يُستهلك ── */}
          {data.openingEditable && (
            <OpeningForm names={data.partnerNames} current={data.opening}
              existing={data.hasOpening} onSaved={load} />
          )}
          {!data.openingEditable && data.hasOpening && (
            <p className="text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 py-2 mb-6">
              الرصيد الافتتاحيّ <b>مُجمَّد</b> — صُودق على فترةٍ بُنيت عليه.
              وتصحيحه بعد اليوم يكون بقيدٍ مقابل لا بكتابةٍ فوقه.
            </p>
          )}

          {/* ── الدفتر ── */}
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-gray-50 text-gray-600 text-right">
                <tr>
                  <th scope="col" className="px-4 py-3">التاريخ</th>
                  <th scope="col" className="px-4 py-3">الفترة</th>
                  <th scope="col" className="px-4 py-3">الشريك</th>
                  <th scope="col" className="px-4 py-3">النوع</th>
                  <th scope="col" className="px-4 py-3 text-left">المبلغ</th>
                  <th scope="col" className="px-4 py-3">البيان</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      لا قيودَ بعد — يبدأ الدفتر بأوّل فرقٍ يُرصد على فترةٍ مُصادَقة.
                    </td>
                  </tr>
                ) : data.entries.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{when(e.occurred_at)}</td>
                    <td className="px-4 py-3">{e.period_name}</td>
                    <td className="px-4 py-3 text-xs">{data.partnerNames?.[e.partner] || e.partner}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        e.kind === 'delta' ? 'bg-amber-100 text-amber-800'
                          : e.kind === 'opening' ? 'bg-slate-200 text-slate-800'
                          : 'bg-emerald-100 text-emerald-800'}`}>
                        {e.kind === 'delta' ? 'فرقٌ معلّق'
                          : e.kind === 'opening' ? 'افتتاحيّ' : 'تسوية'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-left font-mono font-semibold ${
                      e.amount > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                      {e.amount > 0 ? '+' : ''}{paren(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {e.note}
                      {e.created_by ? <span className="text-gray-400"> · {e.created_by}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-gray-500 mt-4 max-w-3xl leading-relaxed space-y-1.5">
            <p>
              <b>فرقٌ معلّق</b> — رُصد بعد المصادقة ولم يُسوَّ بعد. وهو يُستبدل مع كلّ
              سحبٍ جديد لا يُضاف إليه، فلا يتضاعف الفرق نفسه.
            </p>
            <p>
              <b>تسوية</b> — قيدٌ مقابل أُدخل في مصادقةٍ تالية فأقفل ما قبله. ولا يُحذف
              قيدٌ أبداً: فكّ المصادقة يُقيَّد عكساً لا محواً، فيبقى الأثر مقروءاً.
            </p>
            <p className="text-gray-400">
              وموجبٌ يعني لصالح الشريك — يُزاد على تحويله القادم. وسالبٌ يُخصم منه.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * الرصيد الافتتاحيّ — ما تراكم قبل أن يوجد النظام.
 *
 * ── لماذا يُكتب في الشاشة لا في القاعدة ──
 * الإشارة تُحدّد ربع مليون. فيُكتب الرقم هنا، ويُقرأ معناه **بالكلمات** تحته
 * قبل الحفظ: «يُخصم من تحويله» أو «يُزاد عليه». ورقمٌ يُلصق في محرّر SQL لا
 * يراجعه أحد ولا يعرف أحدٌ من كتبه.
 *
 * ويُقيَّد مرّةً واحدة — الباك يرفض الثاني، والخانة تختفي بعد الأوّل.
 */
function OpeningForm({ names, current, existing, onSaved }: {
  names: Record<string, string>;
  current: Record<string, number>;
  existing: boolean;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    badawi: current?.badawi ? String(current.badawi) : '',
    ittihad: current?.ittihad ? String(current.ittihad) : '',
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const num = (s: string) => {
    const x = Number(String(s).replace(/[^\d.-]/g, ''));
    return Number.isFinite(x) ? x : 0;
  };
  const any = PARTNERS.some((p) => Math.abs(num(vals[p])) > 0.02);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/profit-periods/settlements/opening', {
        entries: PARTNERS.map((p) => ({ partner: p, amount: num(vals[p]), note })),
      });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-300 p-5 mb-6">
      <h3 className="font-bold text-sm text-gray-800">
        {existing ? 'تعديل الرصيد الافتتاحيّ' : 'الرصيد الافتتاحيّ'}
      </h3>
      <p className="text-xs text-gray-500 mt-1 mb-4 max-w-2xl">
        ما تراكم <b>قبل</b> أوّل مصادقة. ويُعدَّل ما دامت <b>لم تُصادَق فترةٌ بعد</b> —
        فهو حتّى ذلك الحين مسوّدةٌ لم يُبنَ عليها تحويل. وأوّلُ مصادقةٍ تُجمّده،
        فيصير التصحيح بقيدٍ مقابل.
        {existing && (
          <><br /><b>والكتابة تستبدل القيد القائم ولا تُضاف إليه.</b></>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PARTNERS.map((p) => {
          const v = num(vals[p]);
          const on = Math.abs(v) > 0.02;
          return (
            <div key={p}>
              <label className="block text-xs text-gray-600 mb-1">{names?.[p] || p}</label>
              <input value={vals[p]} onChange={(e) => setVals({ ...vals, [p]: e.target.value })}
                inputMode="decimal" placeholder="0.00"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left" dir="ltr" />
              <p className={`text-[11px] mt-1.5 ${
                !on ? 'text-gray-400' : v < 0 ? 'text-rose-700' : 'text-blue-700'}`}>
                {!on ? 'لا رصيدَ افتتاحيّ.'
                  : v < 0
                    ? `عليه ${fmt(Math.abs(v))} — يُخصم من تحويله في المصادقة القادمة.`
                    : `لصالحه ${fmt(v)} — يُزاد على تحويله في المصادقة القادمة.`}
              </p>
            </div>
          );
        })}
      </div>

      <label className="block text-xs text-gray-600 mt-4 mb-1">البيان — يُسجَّل في الدفتر</label>
      <input value={note} onChange={(e) => setNote(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="مثلاً: الرصيد قبل مصادقة ١–١٥ أغسطس ٢٠٢٦" />

      {error && (
        <p className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded px-2 py-1.5 mt-3">
          {error}
        </p>
      )}

      <div className="flex justify-end mt-4">
        <button type="button" onClick={save} disabled={!any || busy}
          className="bg-slate-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? '…' : existing ? 'استبدل القيد الافتتاحيّ' : 'قيّد الرصيد الافتتاحيّ'}
        </button>
      </div>
    </div>
  );
}

/** خليّةٌ بسطرين: بدوي فوق والاتحاد تحته — فالجدول يبقى قارئاً بلا عمودين لكلّ بند. */
function Pair({ v, signed, bold, muted }: {
  v: { badawi: number; ittihad: number } | null;
  signed?: boolean; bold?: boolean; muted?: boolean;
}) {
  if (!v) return <td className="px-4 py-3 text-left text-gray-300">—</td>;
  const cell = (x: number) => {
    if (signed && Math.abs(x) <= 0.02) return fmt(0);
    return signed ? (x > 0 ? '+' : '') + paren(x) : fmt(x);
  };
  const tone = (x: number) =>
    muted ? 'text-gray-500'
      : bold ? 'text-indigo-900 font-bold'
      : signed ? (Math.abs(x) <= 0.02 ? 'text-gray-300' : x > 0 ? 'text-blue-700' : 'text-rose-700')
      : 'text-gray-700';
  return (
    <td className="px-4 py-3 text-left font-mono whitespace-nowrap">
      <span className={`block ${tone(v.badawi)}`}>{cell(v.badawi)}</span>
      <span className={`block ${tone(v.ittihad)}`}>{cell(v.ittihad)}</span>
    </td>
  );
}
