'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';

/*
 * كشف حساب البروكر.
 *
 * ── القاعدة ──
 * كلّ فاتورة إيجارٍ تُصدَر إلى `Africa Morocco Links S.A` عن `Wasa Express`
 * أو `Monte Express` يستحقّ عليها بروكران ١.٢٥٪ لكلٍّ من إجماليها.
 * والاستحقاق **عند الإصدار** لا عند التحصيل، **والإشعارات الدائنة لا تُنقصه**.
 *
 * ── والحساب جارٍ ──
 *   استحقاقٌ عن فاتورة  −  سدادٌ يُقيَّد يداً  =  الرصيد
 *
 * والرصيد الموجب يعني **مستحقّاً لم يُسدَّد**. والرصيد يأتي محسوباً من الخادم
 * لا من هنا: لو حسبته الشاشة لاختلف باختلاف ترتيبها.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

const day = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '—';

type Entry = {
  id: string; kind: string; amount: number; currency: string;
  base_amount: number; rate: number; occurred_at: string;
  reference: string; note: string; created_by: string; running: number;
  hire_invoice_id: string | null;
  invoice_number: string | null; invoice_date: string | null; vessel_name: string | null;
};

type Account = {
  broker: { id: string; name: string; active: boolean };
  entries: Entry[]; balance: number; totalDue: number; totalPaid: number;
};

export default function BrokersPage() {
  const [data, setData] = useState<{ accounts: Account[]; totalOutstanding: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/brokers/accounts');
      setData(res.data);
      setError('');
    } catch {
      setError('تعذّر تحميل كشوف البروكر — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const acc = data?.accounts?.[tab];

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">كشف حساب البروكر</h1>
          <p className="text-xs text-gray-500 mt-1">
            عمولةٌ تُستحقّ بإصدار فاتورة الإيجار — وتُتابَع حتّى السداد
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()}
            className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50">
            🖨️ طباعة
          </button>
          <Link href="/dashboard/hire-invoices"
            className="text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-lg px-3 py-2">
            ← فواتير الإيجار
          </Link>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <p className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">{error}</p>
      ) : !data || data.accounts.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">لا بروكرَ مسجَّلاً</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap print:hidden">
            {data.accounts.map((a, i) => {
              const on = i === tab;
              return (
                <button key={a.broker.id} type="button" onClick={() => setTab(i)}
                  className={`rounded-xl border px-5 py-3 text-right transition ${
                    on ? 'bg-orange-600 text-white border-orange-600'
                       : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                  <span className="block text-sm">{a.broker.name}</span>
                  <span className={`block font-mono text-xl font-bold ${on ? '' : 'text-orange-700'}`}>
                    {paren(a.balance)}
                  </span>
                  <span className={`block text-[11px] ${on ? 'text-orange-100' : 'text-gray-500'}`}>
                    {Math.abs(a.balance) <= 0.01
                      ? 'الحساب مسوّى'
                      : a.balance > 0 ? 'مستحقٌّ لم يُسدَّد' : 'سُدِّد زيادةً'}
                  </span>
                </button>
              );
            })}
          </div>

          {acc && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <Stat label="مجموع المستحقّ" value={fmt(acc.totalDue)} />
                <Stat label="مجموع المسدَّد" value={fmt(acc.totalPaid)} />
                <Stat label="الرصيد" value={paren(acc.balance)} strong />
              </div>

              <div className="print:hidden">
                <PayForm brokerId={acc.broker.id} name={acc.broker.name}
                  suggested={acc.balance} entries={acc.entries} onSaved={load} />
              </div>

              <div className="bg-white rounded-xl shadow overflow-x-auto">
                <p className="hidden print:block text-base font-bold px-4 pt-4">
                  كشف حساب — {acc.broker.name}
                </p>
                <table className="w-full text-sm min-w-[980px]">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th scope="col" className="px-3 py-3">التاريخ</th>
                      <th scope="col" className="px-3 py-3">الفاتورة</th>
                      <th scope="col" className="px-3 py-3">السفينة</th>
                      <th scope="col" className="px-3 py-3 text-left">أساس العمولة</th>
                      <th scope="col" className="px-3 py-3 text-left">النسبة</th>
                      <th scope="col" className="px-3 py-3 text-left">المستحقّ</th>
                      <th scope="col" className="px-3 py-3 text-left">المسدَّد</th>
                      <th scope="col" className="px-3 py-3 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acc.entries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                          لا حركةَ بعد — يبدأ الحساب بأوّل فاتورةٍ تُصدَر أو تُعدَّل.
                        </td>
                      </tr>
                    ) : acc.entries.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {day(e.occurred_at)}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {e.invoice_number || <span className="text-gray-400">—</span>}
                          {e.note && !e.invoice_number
                            ? <span className="block text-gray-400">{e.note}</span> : null}
                          {e.reference && e.kind === 'payment'
                            ? <span className="block text-gray-400">مرجع: {e.reference}</span> : null}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">{e.vessel_name || '—'}</td>
                        <td className="px-3 py-3 text-left font-mono text-gray-500">
                          {e.kind === 'due' ? fmt(e.base_amount) : ''}
                        </td>
                        <td className="px-3 py-3 text-left font-mono text-gray-500">
                          {e.kind === 'due' ? `${e.rate}%` : ''}
                        </td>
                        <td className="px-3 py-3 text-left font-mono text-emerald-700">
                          {e.amount > 0 ? fmt(e.amount) : ''}
                        </td>
                        <td className="px-3 py-3 text-left font-mono text-rose-700">
                          {e.amount < 0 ? fmt(Math.abs(e.amount)) : ''}
                        </td>
                        <td className="px-3 py-3 text-left font-mono font-semibold text-gray-800">
                          {paren(e.running)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-gray-500 mt-4 max-w-3xl leading-relaxed print:hidden">
                <b>المستحقّ</b> يُقيَّد بإصدار الفاتورة أو تعديلها، وهو نسبةٌ من
                <b> إجماليها</b> — والإشعارات الدائنة لا تُنقصه.
                <b> والمسدَّد</b> تكتبه أنت حين يخرج المال، وقد يكون على دفعات.
                والرصيد الموجب يعني مستحقّاً لم يُسدَّد.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${
      strong ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
      <div className="text-[11px] text-gray-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${strong ? 'text-orange-800' : 'text-gray-700'}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * قيدُ سدادٍ للبروكر.
 *
 * يُقترح عليه الرصيد كاملاً، ويُتاح نسبُه إلى فاتورةٍ بعينها — فتُقفل عمولتها
 * وتختفي شارتها من قائمة الفواتير. وتركُه عامّاً جائزٌ للدفعات المجمَّعة.
 */
function PayForm({ brokerId, name, suggested, entries, onSaved }: {
  brokerId: string; name: string; suggested: number; entries: Entry[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const num = (s: string) => {
    const x = Number(String(s).replace(/[^\d.-]/g, ''));
    return Number.isFinite(x) ? Math.abs(x) : 0;
  };
  const v = num(amount);
  const after = Math.round((suggested - v) * 100) / 100;

  /** الفواتير التي عليها استحقاقٌ — لينسب السداد إلى واحدةٍ منها. */
  const dues = entries.filter((e) => e.kind === 'due' && e.invoice_number);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/brokers/payments', {
        brokerId, amount: v, invoiceId: invoiceId || null, reference, note,
      });
      setAmount(''); setInvoiceId(''); setReference(''); setNote('');
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
          className="bg-orange-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-orange-700">
          + قيّد سداداً لـ {name}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-orange-200 p-5 mb-4">
      <h3 className="font-bold text-sm text-gray-800 mb-1">سدادٌ لـ {name}</h3>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        اكتب <b>ما خرج فعلاً</b>. وقد يكون أقلّ من المستحقّ — وما بقي يبقى في الرصيد.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            المبلغ · والمستحقّ الآن {paren(suggested)}
          </label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" dir="ltr"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left" />
          <p className={`text-[11px] mt-1.5 ${
            v <= 0.01 ? 'text-gray-400'
              : Math.abs(after) <= 0.01 ? 'text-gray-600'
              : after > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
            {v <= 0.01 ? 'اكتب المبلغ.'
              : Math.abs(after) <= 0.01 ? 'يُسوّى الحساب بالكامل.'
              : after > 0 ? `يبقى ${fmt(after)} مستحقّاً.`
              : `يزيد عن المستحقّ بـ ${fmt(Math.abs(after))}.`}
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            عن فاتورة — اختياريّ، فتُقفل شارتها
          </label>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">سدادٌ عامّ على الحساب</option>
            {dues.map((d) => (
              <option key={d.id} value={d.hire_invoice_id || ''}>
                {d.invoice_number} · {fmt(d.amount)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">المرجع — رقم الحوالة</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">البيان</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
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
        <button type="button" onClick={save} disabled={v <= 0.01 || busy}
          className="bg-orange-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? '…' : 'قيّد السداد'}
        </button>
      </div>
    </div>
  );
}
