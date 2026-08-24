'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';

/*
 * كشف حسابٍ جارٍ لكلّ شريك.
 *
 * ── ما الذي يقوله ──
 * كم استُحقّ له، وكم خرج إليه فعلاً، وكم بقي. لا أكثر ولا أقلّ.
 *
 * ── ولماذا تبدّل عن سابقه ──
 * كانت الشاشة تعرض **الفروق** وحدها، ومتى سُوّيت عادت صفراً — فتبدو خاليةً
 * من المعنى وهي أبعد ما تكون عنه. والمالك سأل: «أتابع الفلوس بتاعتي زادت
 * ولا نقصت»، وقرّر أنّ **التحويل يُدخَل يداً** لأنّ المستحقّ لا يُحوَّل كلّه.
 *
 * فصار حساباً جارياً:
 *   الافتتاحيّ  +  المستحقّ بالمصادقة  −  المُحوَّل فعلاً  ±  الفروق  =  الرصيد
 *
 * والرصيد الموجب يعني **مستحقّاً لم يُدفع بعد**.
 *
 * ── والحساب في الخادم لا هنا ──
 * الرصيد المتحرّك يأتي محسوباً. فلو حسبته الشاشة لاختلف باختلاف ترتيبها،
 * وصار لكلّ عرضٍ رصيد.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const PARTNERS = ['badawi', 'ittihad'] as const;
type Partner = (typeof PARTNERS)[number];

const KIND_LABEL: Record<string, string> = {
  opening: 'افتتاحيّ',
  due: 'استحقاق',
  payment: 'تحويل',
  delta: 'فرق',
  applied: 'تسوية',
};

const KIND_TONE: Record<string, string> = {
  opening: 'bg-slate-200 text-slate-800',
  due: 'bg-emerald-100 text-emerald-800',
  payment: 'bg-indigo-100 text-indigo-800',
  delta: 'bg-amber-100 text-amber-800',
  applied: 'bg-gray-100 text-gray-600',
};

type Entry = {
  id: string; period_id: string | null; period_name: string | null;
  occurred_at: string; partner: string; amount: number; running: number;
  kind: string; note: string; created_by: string;
};

type Account = {
  entries: Entry[]; balance: number;
  totalDue: number; totalPaid: number; opening: number;
};

type Statement = {
  partnerNames: Record<string, string>;
  accounts: Record<string, Account>;
  hasOpening: boolean;
  openingEditable: boolean;
  opening: Record<string, number>;
};

export default function BalancePage() {
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Partner>('badawi');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/profit-periods/settlements/statement');
      setData(res.data);
      setError('');
    } catch {
      setError('تعذّر تحميل كشف الحساب — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const acc = data?.accounts?.[tab];

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">كشف حساب الشركاء</h1>
          <p className="text-xs text-gray-500 mt-1">
            المستحقّ بالمصادقة · والمُحوَّل فعلاً · وما بقي
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
          {/* ── تبويبٌ لكلّ شريك — والرصيد في التبويب نفسه ── */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {PARTNERS.map((p) => {
              const a = data.accounts?.[p];
              const on = tab === p;
              const bal = a?.balance ?? 0;
              return (
                <button key={p} type="button" onClick={() => setTab(p)}
                  className={`rounded-xl border px-5 py-3 text-right transition ${
                    on ? 'bg-indigo-700 text-white border-indigo-700'
                       : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                  <span className="block text-sm">{data.partnerNames?.[p] || p}</span>
                  <span className={`block font-mono text-xl font-bold ${on ? '' : 'text-indigo-900'}`}>
                    {paren(bal)}
                  </span>
                  <span className={`block text-[11px] ${on ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {Math.abs(bal) <= 0.02
                      ? 'الحساب مسوّى'
                      : bal > 0 ? 'مستحقٌّ له لم يُحوَّل' : 'عليه'}
                  </span>
                </button>
              );
            })}
          </div>

          {acc && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
                <Stat label="الافتتاحيّ" value={paren(acc.opening)} muted />
                <Stat label="مجموع المستحقّ" value={fmt(acc.totalDue)} />
                <Stat label="مجموع المُحوَّل" value={fmt(acc.totalPaid)} />
                <Stat label="الرصيد" value={paren(acc.balance)} strong />
              </div>

              <PaymentForm partner={tab} name={data.partnerNames?.[tab] || tab}
                suggested={acc.balance} onSaved={load} />

              {/* ── الرصيد الافتتاحيّ — يُعدَّل ما لم يُستهلك ── */}
              {data.openingEditable && (
                <OpeningForm names={data.partnerNames} current={data.opening}
                  existing={data.hasOpening} onSaved={load} />
              )}

              <div className="bg-white rounded-xl shadow overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th scope="col" className="px-4 py-3">التاريخ</th>
                      <th scope="col" className="px-4 py-3">البيان</th>
                      <th scope="col" className="px-4 py-3">النوع</th>
                      <th scope="col" className="px-4 py-3 text-left">له</th>
                      <th scope="col" className="px-4 py-3 text-left">عليه</th>
                      <th scope="col" className="px-4 py-3 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acc.entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                          لا حركةَ بعد — يبدأ الحساب برصيدٍ افتتاحيٍّ أو بأوّل مصادقة.
                        </td>
                      </tr>
                    ) : acc.entries.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {when(e.occurred_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {e.note}
                          {e.created_by ? <span className="block text-gray-400">{e.created_by}</span> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            KIND_TONE[e.kind] || 'bg-gray-100 text-gray-600'}`}>
                            {KIND_LABEL[e.kind] || e.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-left font-mono text-emerald-700">
                          {e.amount > 0 ? fmt(e.amount) : ''}
                        </td>
                        <td className="px-4 py-3 text-left font-mono text-rose-700">
                          {e.amount < 0 ? fmt(Math.abs(e.amount)) : ''}
                        </td>
                        <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">
                          {paren(e.running)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-[11px] text-gray-500 mt-4 max-w-3xl leading-relaxed space-y-1.5">
                <p>
                  <b>استحقاق</b> تكتبه المصادقة — وهو التحويل المحسوب عن الفترة.
                  <b> وتحويل</b> تكتبه أنت حين يخرج المال فعلاً، وقد يكون أقلّ من المستحقّ.
                  وما بقي يبقى في الرصيد ويُحمَل معك.
                </p>
                <p>
                  <b>فرق</b> يُرصد بعد المصادقة حين يتغيّر الشيت — والبند التقديريّ فيه
                  رسوم ميناء مصر (١١٬٥٠٠ لكلّ رحلة حتّى تصل الفاتورة).
                </p>
                <p className="text-gray-400">
                  والرصيد الموجب يعني <b>مستحقّاً لم يُدفع</b>. والسالب يعني أنّ ما خرج
                  زاد عمّا استُحقّ — فيُخصم من استحقاقٍ قادم.
                </p>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, muted, strong }: {
  label: string; value: string; muted?: boolean; strong?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${
      strong ? 'bg-indigo-50 border-indigo-200'
        : muted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      <div className="text-[11px] text-gray-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${strong ? 'text-indigo-900' : 'text-gray-700'}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * قيدُ تحويلٍ فعليّ.
 *
 * يُقترح عليه **الرصيد كاملاً** لأنّه الغالب، ويبقى قابلاً للتغيير — لأنّ
 * المستحقّ لا يُحوَّل كلّه دائماً، وهو سببُ وجود هذه الخانة أصلاً.
 */
function PaymentForm({ partner, name, suggested, onSaved }: {
  partner: string; name: string; suggested: number; onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const num = (s: string) => {
    const x = Number(String(s).replace(/[^\d.-]/g, ''));
    return Number.isFinite(x) ? Math.abs(x) : 0;
  };
  const v = num(amount);
  const after = Math.round((suggested - v) * 100) / 100;

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/profit-periods/settlements/payment', { partner, amount: v, note });
      setAmount('');
      setNote('');
      setOpen(false);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button type="button"
          onClick={() => { setOpen(true); setAmount(suggested > 0 ? String(suggested) : ''); }}
          className="bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-800">
          + قيّد تحويلاً لـ {name}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-5 mb-4">
      <h3 className="font-bold text-sm text-gray-800 mb-1">قيدُ تحويلٍ لـ {name}</h3>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        اكتب <b>ما خرج فعلاً</b> إلى الحساب البنكيّ. وقد يكون أقلّ من المستحقّ —
        وما بقي يبقى في الرصيد ويُحمَل إلى المصادقة القادمة.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            المبلغ المُحوَّل · والمستحقّ الآن {paren(suggested)}
          </label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" dir="ltr"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left" />
          <p className={`text-[11px] mt-1.5 ${
            v <= 0.02 ? 'text-gray-400'
              : Math.abs(after) <= 0.02 ? 'text-gray-600'
              : after > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
            {v <= 0.02 ? 'اكتب المبلغ.'
              : Math.abs(after) <= 0.02 ? 'يُسوّى الحساب بالكامل — يصير الرصيد صفراً.'
              : after > 0 ? `يبقى ${fmt(after)} مستحقّاً في الرصيد.`
              : `يزيد عن المستحقّ بـ ${fmt(Math.abs(after))} — فيصير الرصيد عليه.`}
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">البيان — يُسجَّل في الكشف</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="مثلاً: حوالة بنكيّة ٢٤ أغسطس" />
        </div>
      </div>

      {error && (
        <p className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded px-2 py-1.5 mt-3">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={() => setOpen(false)}
          className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50">
          إلغاء
        </button>
        <button type="button" onClick={save} disabled={v <= 0.02 || busy}
          className="bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? '…' : 'قيّد التحويل'}
        </button>
      </div>
    </div>
  );
}

/**
 * الرصيد الافتتاحيّ — ما تراكم قبل أن يوجد النظام.
 *
 * يُكتب في الشاشة لا في القاعدة: الإشارة تُحدّد ربع مليون، فيُقرأ معناها
 * **بالكلمات** تحت كلّ خانة قبل الحفظ.
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
    <div className="bg-white rounded-xl border border-slate-300 p-5 mb-4">
      <h3 className="font-bold text-sm text-gray-800">
        {existing ? 'تعديل الرصيد الافتتاحيّ' : 'الرصيد الافتتاحيّ'}
      </h3>
      <p className="text-xs text-gray-500 mt-1 mb-4 max-w-2xl">
        ما تراكم <b>قبل</b> أوّل مصادقة. ويُعدَّل ما دامت <b>لم تُصادَق فترةٌ بعد</b>.
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
                inputMode="decimal" placeholder="0.00" dir="ltr"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left" />
              <p className={`text-[11px] mt-1.5 ${
                !on ? 'text-gray-400' : v < 0 ? 'text-rose-700' : 'text-blue-700'}`}>
                {!on ? 'لا رصيدَ افتتاحيّ.'
                  : v < 0
                    ? `عليه ${fmt(Math.abs(v))} — يُخصم من استحقاقه القادم.`
                    : `لصالحه ${fmt(v)} — يُزاد على استحقاقه القادم.`}
              </p>
            </div>
          );
        })}
      </div>

      <label className="block text-xs text-gray-600 mt-4 mb-1">البيان — يُسجَّل في الكشف</label>
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
