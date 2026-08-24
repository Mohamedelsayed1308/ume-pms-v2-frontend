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

/** ما دون نصف سنتٍ صفرٌ في العرض — والأقواسُ حول صفرٍ تُقلق بلا سبب. */
const near0 = (n: number) => Math.abs(n) < 0.005;

type PVessel = ProposedResult['vessels'][number];

export default function ProposedMethod({ result, proposed, alwaysOpen }: {
  result: ModelResult;
  proposed: ProposedResult;
  /** في الشاشة المنفصلة لا طيّ: المقارنة هي غرضها كلّه */
  alwaysOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = alwaysOpen || expanded;
  const ps = proposed.vessels;

  /*
   * جسر التسوية — من المعتمدة إلى المقترحة، بنداً بنداً.
   *
   * الفرق بين الطريقتين يختزل رياضيّاً إلى بندين لا ثالث لهما. بفكّ
   * السلسلتين لشريكين:
   *
   *   المقترحة − المعتمدة =
   *       (حصّة العمولة − عمولة المركب)        ← المقترحة لا تذكر العمولة
   *     + كسر التدوير                          ← المعتمدة تُنزل للدولار الصحيح
   *     + (مجموع الصافي + البنكر − نقد ضبا − تحصيل صفاجا) ÷ ٢
   *
   * والحدّ الثالث **صفرٌ ما دام الدفتر متّسقاً**، لأنّ ضابط الخزينة يقول
   * `نقد ضبا + صفاجا = BALANCE + البنكر` لكلّ رحلة. فإن ظهر رقمٌ فيه فليس
   * خلافاً بين الطريقتين بل خللٌ في الدفتر — وهو نفسه ما يرصده `treasuryGap`
   * في حارس النزاهة، لكن على مستوى الفترة لا الرحلة.
   *
   * ولهذا يُعرض الحدّ الثالث صراحةً ولا يُطوى في «الباقي»: صفرُه شهادةٌ،
   * وظهورُه إنذار.
   */
  const rows = ps.map((v) => {
    const av = result.vessels.find((x) => x.key === v.key);
    const approved = av?.dueToAccount ?? 0;
    const feeGap = result.feeShare - (av?.fee ?? 0);
    const rounding = av?.remainingAtDuba ?? 0;
    const residual = v.total - (approved + feeGap + rounding);
    return { v, approved, feeGap, rounding, residual, gap: v.total - approved };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const sumApproved = sum((r) => r.approved);
  const sumGap = sum((r) => r.gap);
  const ledgerBroken = rows.some((r) => Math.abs(r.residual) > 0.02);
  const diverges = proposed.available && Math.abs(sumGap) > 0.02;

  return (
    <div className={alwaysOpen ? 'mt-2' : 'mt-4 pt-3 border-t'}>
      <button type="button" onClick={() => setExpanded(!expanded)} disabled={alwaysOpen}
        className={`text-xs font-semibold flex items-center gap-1.5 ${
          alwaysOpen ? 'text-gray-700 cursor-default' : 'text-gray-600 hover:text-gray-900'}`}>
        {!alwaysOpen && <span className="text-gray-400">{open ? '▾' : '▸'}</span>}
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
                    <PRow label="− نقد صفاجا" ps={ps} pick={(v) => -v.safaga} signed />
                    {/* ما حُصّل من Over Pax في صفاجا داخلٌ في السطر أعلاه — يُفرد ليُرى */}
                    {ps.some((v) => v.safagaOverPax !== 0) && (
                      <PRow label="منه · Over Pax محصَّلٌ في صفاجا" ps={ps}
                        pick={(v) => v.safagaOverPax} signed />
                    )}
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

              {/* ── جسر التسوية: من المعتمدة إلى المقترحة، بنداً بنداً ── */}
              <p className="text-xs font-semibold text-gray-600 mt-5 mb-1.5">من أين جاء الفرق</p>
              <div className="overflow-x-auto">
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
                    <tr className="border-t bg-emerald-50/60">
                      <td className="py-2 pe-3 font-sans font-semibold text-emerald-800 whitespace-nowrap">
                        المعتمدة
                      </td>
                      {rows.map((r) => (
                        <td key={r.v.key} className="py-2 text-left font-bold text-emerald-800">
                          {fmt(r.approved)}
                        </td>
                      ))}
                      <td className="py-2 text-left font-bold text-emerald-800">{fmt(sumApproved)}</td>
                    </tr>
                    <BridgeRow label="± فرق العمولة · حصّتها − عمولة المركب"
                      rows={rows} pick={(r) => r.feeGap} total={sum((r) => r.feeGap)} />
                    <BridgeRow label="+ كسر التدوير · ما أبقته المعتمدة في ضبا"
                      rows={rows} pick={(r) => r.rounding} total={sum((r) => r.rounding)} />
                    <BridgeRow label="± فرق الخزينة · يجب أن يكون صفراً"
                      rows={rows} pick={(r) => r.residual} total={sum((r) => r.residual)}
                      alarm={ledgerBroken} />
                    <tr className="border-t-2 border-slate-500 bg-slate-50">
                      <td className="py-2 pe-3 font-sans font-semibold text-slate-800 whitespace-nowrap">
                        = المقترحة
                      </td>
                      {rows.map((r) => (
                        <td key={r.v.key} className="py-2 text-left font-bold text-slate-800">
                          {fmt(r.v.total)}
                        </td>
                      ))}
                      <td className="py-2 text-left font-bold text-slate-800">{fmt(proposed.grandTotal)}</td>
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td className="py-2 pe-3 font-sans text-gray-600 whitespace-nowrap">الفرق جملةً</td>
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

              <div className="text-[11px] text-gray-500 mt-3 max-w-3xl leading-relaxed space-y-1.5">
                <p>
                  <b>فرق العمولة</b> هو البند الحقيقيّ. المعتمدة تخصم عمولة التوكيل
                  مناصفةً ثمّ تردّ لكلّ مركبٍ عمولته، والمقترحة لا تذكرها — فمن عمولته
                  أعلى من المتوسّط يكسب في المعتمدة ويخسره في المقترحة، والعكس.
                  <b> ولا يتغيّر المجموع:</b> ما يخسره أحدهما يكسبه الآخر.
                </p>
                <p>
                  <b>وكسر التدوير</b> ليس فرقاً في المعادلة. المعتمدة تُنزل التوزيع إلى
                  الدولار الصحيح وتُبقي الكسر رصيداً في ضبا كما يفعل المستند الورقيّ،
                  والمقترحة تُبقي الكسور. فالمال واحدٌ ومكانه يختلف.
                </p>
                <p className={ledgerBroken ? 'text-rose-700' : ''}>
                  <b>وفرق الخزينة يجب أن يكون صفراً.</b> فالمعتمدة تبدأ من نقد ضبا
                  والمقترحة من صافي الإيراد، وهما طريقان إلى الرقم نفسه ما دام الدفتر
                  متّسقاً:{' '}
                  <span className="font-mono">نقد ضبا + صفاجا = الصافي + البنكر</span>.
                  {ledgerBroken
                    ? ' وقد ظهر فيه رقمٌ — فالخلل في الدفتر لا في الطريقتين، وراجع حارس النزاهة أعلاه.'
                    : ' وصفرُه هنا شهادةٌ بأنّ الطريقتين لا تفترقان إلا في العمولة والتدوير.'}
                </p>
              </div>
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

/** صفٌّ في جسر التسوية — بندٌ ينقل من المعتمدة إلى المقترحة. */
function BridgeRow({ label, rows, pick, total, alarm }: {
  label: string;
  rows: { v: { key: string } }[];
  pick: (r: any) => number;
  total: number;
  alarm?: boolean;
}) {
  const tone = (x: number) =>
    Math.abs(x) <= 0.02 ? 'text-gray-400' : alarm ? 'text-rose-700' : 'text-gray-700';
  return (
    <tr className="border-t border-gray-100">
      <td className={`py-2 pe-3 font-sans whitespace-nowrap text-xs ${
        alarm ? 'text-rose-700 font-semibold' : 'text-gray-500'}`}>
        {label}
      </td>
      {rows.map((r) => {
        const x = pick(r);
        return (
          <td key={r.v.key} className={`py-2 text-left ${tone(x)}`}>
            {near0(x) ? fmt(0) : (x > 0 ? '+' : '') + paren(x)}
          </td>
        );
      })}
      <td className={`py-2 text-left ${tone(total)}`}>
        {near0(total) ? fmt(0) : (total > 0 ? '+' : '') + paren(total)}
      </td>
    </tr>
  );
}
