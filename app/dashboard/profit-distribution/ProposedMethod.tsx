'use client';
import { useState } from 'react';
import type { ModelResult, ProposedResult } from '@/lib/profitModel';

/*
 * الطريقة المقترحة — معروضةً بجوار المعتمدة.
 *
 * لا تحلّ محلّ شيء ولا تُحفظ: تُحسب من مدخلات المعتمدة نفسها لحظةَ العرض.
 * والغرض أن يُرى الفرق بين الطريقتين **رقماً لا وصفاً** — فمن يقرّر بينهما
 * يقرّر على أرقام.
 *
 * وتُطوى افتراضيّاً: المعتمدة هي ما يُوزَّع، وهذه للمقارنة وحدها.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** الأقواس للسالب — كما يكتبها المستند، وكما تكتبه بقيّة الشاشة. */
const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

type PVessel = ProposedResult['vessels'][number];

export default function ProposedMethod({ result, proposed }: {
  result: ModelResult;
  proposed: ProposedResult;
}) {
  const [open, setOpen] = useState(false);
  const ps = proposed.vessels;

  // الفرق يُقاس على «المستحقّ لحساب المركب» — آخر رقمٍ في الطريقتين
  const rows = ps.map((v) => {
    const approved = result.vessels.find((x) => x.key === v.key);
    const due = approved?.dueToAccount ?? 0;
    return { v, approved: due, gap: v.total - due };
  });
  const sumApproved = rows.reduce((a, r) => a + r.approved, 0);
  const sumGap = rows.reduce((a, r) => a + r.gap, 0);
  const diverges = proposed.available && Math.abs(sumGap) > 0.02;

  return (
    <div className="mt-4 pt-3 border-t">
      <button type="button" onClick={() => setOpen(!open)}
        className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        الطريقة المقترحة — للمقارنة
        {!proposed.available && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-normal">
            غير متاحة
          </span>
        )}
        {diverges && (
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal">
            تفترق عن المعتمدة
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3">
          {!proposed.available ? (
            <p className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded px-2 py-2">
              {proposed.reason}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 180 + ps.length * 150 }}>
                  <thead>
                    <tr className="text-gray-500 text-xs">
                      <th className="text-right font-medium pb-2" />
                      {ps.map((v) => (
                        <th key={v.key} className="text-left font-semibold pb-2 text-gray-700">{v.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <PRow label="صافي الإيراد" ps={ps} pick={(v) => v.netRevenue} />
                    <PRow label="− الإيجار" ps={ps} pick={(v) => -v.rent} signed />
                    <PRow label="= الصافي بعد الخصم" ps={ps} pick={(v) => v.afterRent} bold />
                    <tr className="border-t border-gray-200">
                      <td className="py-2 pe-3 font-sans text-gray-600 whitespace-nowrap">
                        توزيع النسب ({fmt(proposed.totalAfterRent)} ÷ {proposed.partners})
                      </td>
                      {ps.map((v) => (
                        <td key={v.key} className="py-2 text-left text-gray-800">{fmt(proposed.pooled)}</td>
                      ))}
                    </tr>
                    <PRow label="− تحصيل صفاجا" ps={ps} pick={(v) => -v.safaga} signed />
                    {ps.some((v) => v.overPaxShare !== 0) && (
                      <PRow label="+ حصّة Over Pax" ps={ps} pick={(v) => v.overPaxShare} signed />
                    )}
                    <PRow label="= الرصيد طرف البسّام" ps={ps} pick={(v) => v.balanceAtBassam} bold />
                    <PRow label="+ الإيجار" ps={ps} pick={(v) => v.rent} signed />
                    <PRow label="+ البنكر" ps={ps} pick={(v) => v.fuel} signed />
                    <tr className="border-t-2 border-slate-500 bg-slate-50">
                      <td className="py-2.5 pe-3 font-sans font-bold text-slate-800 whitespace-nowrap">
                        المستحقّ — الطريقة المقترحة
                      </td>
                      {ps.map((v) => (
                        <td key={v.key} className="py-2.5 text-left font-bold text-slate-800 text-base">
                          {fmt(v.total)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ── المقارنة: آخر رقمٍ في الطريقتين ── */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 180 + (ps.length + 1) * 150 }}>
                  <thead>
                    <tr className="text-gray-500 text-xs">
                      <th className="text-right font-medium pb-2" />
                      {rows.map((r) => (
                        <th key={r.v.key} className="text-left font-semibold pb-2 text-gray-700">{r.v.name}</th>
                      ))}
                      <th className="text-left font-semibold pb-2 text-gray-700">المجموع</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-t">
                      <td className="py-2 pe-3 font-sans text-emerald-800 whitespace-nowrap">المعتمدة</td>
                      {rows.map((r) => (
                        <td key={r.v.key} className="py-2 text-left text-emerald-800">{fmt(r.approved)}</td>
                      ))}
                      <td className="py-2 text-left text-emerald-800">{fmt(sumApproved)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="py-2 pe-3 font-sans text-slate-700 whitespace-nowrap">المقترحة</td>
                      {rows.map((r) => (
                        <td key={r.v.key} className="py-2 text-left text-slate-700">{fmt(r.v.total)}</td>
                      ))}
                      <td className="py-2 text-left text-slate-700">{fmt(proposed.grandTotal)}</td>
                    </tr>
                    <tr className="border-t-2 border-gray-300">
                      <td className="py-2 pe-3 font-sans font-semibold text-gray-700 whitespace-nowrap">الفرق</td>
                      {rows.map((r) => (
                        <td key={r.v.key}
                          className={`py-2 text-left font-bold ${
                            Math.abs(r.gap) <= 0.02 ? 'text-gray-400'
                              : r.gap > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                          {r.gap > 0 ? '+' : ''}{paren(r.gap)}
                        </td>
                      ))}
                      <td className="py-2 text-left font-bold text-gray-600">
                        {sumGap > 0 ? '+' : ''}{paren(sumGap)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-gray-500 mt-3 max-w-3xl leading-relaxed">
                <b>أين يفترق الطريقان.</b> المعتمدة تبدأ من <b>نقد ضبا</b> الفعليّ،
                والمقترحة من <b>صافي الإيراد</b> المشتقّ من الدفتر.
                <br />
                والمعتمدة تخصم <b>عمولة التوكيل</b> مناصفةً ثمّ تردّ لكلّ مركبٍ عمولته،
                والمقترحة لا تذكرها — فمن عمولته أعلى من المتوسّط يكسب في المعتمدة
                ويخسره في المقترحة.
                <br />
                والمعتمدة <b>تُنزل التوزيع إلى الدولار الصحيح</b> وتُبقي الكسر رصيداً في
                ضبا، والمقترحة تُبقي الكسور.
                <br />
                <span className="text-gray-400">
                  وفرقُ المجموع ليس مالاً ضائعاً ما دام قريباً من الصفر — هو انتقالٌ
                  بين الشريكين لا غير.
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PRow({ label, ps, pick, signed, bold }: {
  label: string;
  ps: PVessel[];
  pick: (v: PVessel) => number;
  signed?: boolean;
  bold?: boolean;
}) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`py-2 pe-3 font-sans whitespace-nowrap ${
        bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
        {label}
      </td>
      {ps.map((v) => {
        const x = pick(v);
        return (
          <td key={v.key}
            className={`py-2 text-left ${
              bold ? 'font-bold text-gray-800'
                : signed && x < 0 ? 'text-rose-700' : 'text-gray-700'}`}>
            {signed ? paren(x) : fmt(x)}
          </td>
        );
      })}
    </tr>
  );
}
