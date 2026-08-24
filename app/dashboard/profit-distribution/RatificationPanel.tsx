'use client';
import { useState } from 'react';
import api from '@/lib/api';
import { calculateDistribution, toModelInput, type ModelResult } from '@/lib/profitModel';

/*
 * المصادقة — تجميد الرقم الذي يُحوَّل إلى البنك.
 *
 * ── لماذا ──
 * التوزيع يصدر وفي مصاريفه مبالغ تقديريّة: رسوم ميناء مصر تُكتب ١١٬٥٠٠ في كلّ
 * رحلة حتّى تصل الفاتورة. فالمُحوَّل صدر على تقدير، ثمّ يتغيّر الشيت — والحوالة
 * قد نُفّذت.
 *
 * فالمصادقة تُجمّد الرقم وتُقفل الفترة، والسحب بعدها يُقارَن بالمُجمَّد لا يدهسه،
 * والفرق يُقيَّد في دفتر الفروق ويُسوّى في المصادقة التالية.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type Period = Record<string, any> & { id: string; period_name: string };

export default function RatificationPanel({ period, result, onChanged }: {
  period: Period;
  result: ModelResult;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);

  const ratified = !!period.ratified_at;
  const snap = period.ratified_snapshot as any;
  const latest = period.latest_snapshot as any;

  /*
   * المقارنة تجري **في الشاشة** من اللقطتين — عرضاً فقط.
   * والقيد في الدفتر يكتبه الباك بحسابه هو، فلا يُقيَّد رقمٌ حسبه المتصفّح.
   */
  const frozen = snap?.computedTransfer as { badawi: number; ittihad: number } | undefined;
  const paid = snap?.transferPaid as { badawi: number; ittihad: number } | undefined;
  const carried = snap?.carriedIn as { badawi: number; ittihad: number } | undefined;
  const fresh = latest?.result?.partnerTransfer as { badawi: number; ittihad: number } | undefined;

  async function act(path: string, body?: any) {
    setBusy(path);
    setError('');
    try {
      await api.post(`/api/profit-periods/${period.id}/${path}`, body || {});
      setAsking(false);
      setReason('');
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'تعذّر التنفيذ');
    } finally {
      setBusy('');
    }
  }

  /** يُسجّل السحب الحاليّ للمقارنة — والباك يعيد الحساب ويقيّد الفرق. */
  async function recordLatest() {
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(period)) {
      if (k === 'id' || k.startsWith('ratified') || k.startsWith('latest')) continue;
      fields[k] = period[k];
    }
    await act('record-latest', { fields, fetchedAt: period.voyage_detail?.fetchedAt || null });
  }

  return (
    <div className={`rounded-xl border p-4 mb-4 ${
      ratified ? 'bg-indigo-50/60 border-indigo-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-bold text-sm text-gray-800">
            المصادقة — الرقم المُحوَّل إلى البنك
          </h4>
          {ratified ? (
            <p className="text-xs text-indigo-800 mt-1">
              ✓ مُصادَقٌ عليها في <b>{when(period.ratified_at)}</b>
              {period.ratified_by ? <> · بواسطة <b>{period.ratified_by}</b></> : null}
              {' '}— والفترة مُقفلة.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              بعد الضغط يُجمَّد الرقم وتُقفل الفترة. ولا تُعدَّل بعدها إلا بفكّ
              مصادقةٍ بسببٍ مكتوب.
            </p>
          )}
        </div>

        {!ratified ? (
          <button type="button" onClick={() => act('ratify')}
            disabled={!!busy || result.missing.length > 0}
            title={result.missing.length > 0 ? 'مدخلاتٌ ناقصة — لا يُجمَّد رقمٌ غير مكتمل' : ''}
            className="bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy === 'ratify' ? '…' : '✓ المصادقة تمّت'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={recordLatest} disabled={!!busy}
              className="text-sm border border-indigo-300 text-indigo-800 px-3 py-2 rounded-lg hover:bg-indigo-100 disabled:opacity-40">
              {busy === 'record-latest' ? '…' : '↻ قارن بالمسحوب الآن'}
            </button>
            <button type="button" onClick={() => setAsking(!asking)} disabled={!!busy}
              className="text-sm border border-rose-300 text-rose-700 px-3 py-2 rounded-lg hover:bg-rose-50 disabled:opacity-40">
              فكّ المصادقة
            </button>
          </div>
        )}
      </div>

      {asking && (
        <div className="mt-3 border-t pt-3">
          <label className="block text-xs text-gray-600 mb-1">
            سبب فكّ المصادقة — إلزاميّ، ويُسجَّل في الدفتر
          </label>
          <div className="flex gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="مثلاً: بنكر أمل كان صفراً بالخطأ" />
            <button type="button" onClick={() => act('unratify', { reason })}
              disabled={!reason.trim() || !!busy}
              className="bg-rose-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-rose-800 disabled:opacity-40">
              تأكيد
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded px-2 py-1.5 mt-3">
          {error}
        </p>
      )}

      {/* ── المُجمَّد · والمسحوب · والفرق ── */}
      {ratified && frozen && paid && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 520 }}>
            <thead>
              <tr className="text-gray-500 text-xs">
                <th className="text-right font-medium pb-2" />
                <th className="text-left font-semibold pb-2 text-gray-700">UME · بدوي</th>
                <th className="text-left font-semibold pb-2 text-gray-700">الاتحاد</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <Row label="المُجمَّد · المحسوب يوم المصادقة" a={frozen.badawi} b={frozen.ittihad} />
              {carried && (carried.badawi !== 0 || carried.ittihad !== 0) && (
                <Row label="± رصيدٌ محمولٌ من فتراتٍ سابقة" a={carried.badawi} b={carried.ittihad} signed />
              )}
              <tr className="border-t-2 border-indigo-600 bg-indigo-50">
                <td className="py-2.5 pe-3 font-sans font-bold text-indigo-900 whitespace-nowrap">
                  = المُحوَّل فعلاً إلى البنك
                </td>
                <td className="py-2.5 text-left font-bold text-indigo-900">{fmt(paid.badawi)}</td>
                <td className="py-2.5 text-left font-bold text-indigo-900">{fmt(paid.ittihad)}</td>
              </tr>

              {fresh ? (
                <>
                  <tr>
                    <td colSpan={3} className="pt-4 pb-1 font-sans text-xs font-semibold text-gray-600">
                      وآخر سحبٍ من الشيت — {when(period.latest_fetched_at)}
                    </td>
                  </tr>
                  <Row label="المحسوب الآن" a={fresh.badawi} b={fresh.ittihad} />
                  <tr className="border-t-2 border-gray-300">
                    <td className="py-2 pe-3 font-sans font-semibold text-gray-700 whitespace-nowrap">
                      الفرق · يدخل الرصيد التراكميّ
                    </td>
                    {[fresh.badawi - frozen.badawi, fresh.ittihad - frozen.ittihad].map((d, i) => (
                      <td key={i} className={`py-2 text-left font-bold ${
                        Math.abs(d) <= 0.02 ? 'text-gray-400' : d > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                        {d > 0 ? '+' : ''}{paren(d)}
                      </td>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={3} className="pt-4 text-xs text-gray-400 font-sans">
                    لم يُسجَّل سحبٌ بعد المصادقة — اضغط «قارن بالمسحوب الآن» بعد الجلب.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, a, b, signed }: { label: string; a: number; b: number; signed?: boolean }) {
  const cell = (x: number) => (signed ? (x > 0 ? '+' : '') + paren(x) : fmt(x));
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pe-3 font-sans text-gray-600 whitespace-nowrap">{label}</td>
      <td className={`py-2 text-left ${signed && a < 0 ? 'text-rose-700' : 'text-gray-800'}`}>{cell(a)}</td>
      <td className={`py-2 text-left ${signed && b < 0 ? 'text-rose-700' : 'text-gray-800'}`}>{cell(b)}</td>
    </tr>
  );
}
