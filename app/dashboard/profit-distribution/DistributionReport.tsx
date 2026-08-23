'use client';
import {
  VESSEL_KEYS, VESSEL_NAMES,
  type ModelResult, type VesselKey,
} from '@/lib/profitModel';
import { integrityIssues, type VoyageDetail, type VoyageRow } from '@/lib/voyageDetail';

/**
 * ── كشف توزيع الأرباح — نسخة الإدارة ──
 *
 * ورقةٌ تُقرأ لا شاشةٌ تُطبع. الصفحة الأولى تُجيب السؤال الوحيد الذي يهمّ
 * مجلس الشركاء: كم لكلٍّ منّا، وكيف وصلنا إليه؟ وتفصيل الرحلات يليها لمن
 * يريد المراجعة، لا في وجه من يريد الرقم.
 *
 * ── لا رقم بلا مصدر ──
 * كل رقمٍ هنا من `result` و`detail` — عين ما تعرضه الشاشة وما حُفظ مع الفترة.
 * لا مقارنةً بفترةٍ سابقة ولا موازنة: ما ليس في المصدر لا يُقدَّر ولا يُكتب.
 *
 * ── دروس طباعةٍ مدفوعة الثمن، مطبَّقة هنا ──
 * • `print-color-adjust: exact` وإلا أسقط المتصفّح كل خلفيّة وخرجت الورقة بيضاء.
 * • لا فاصل صفحةٍ لكل قسم — واحدٌ قبل التفصيل فقط، وإلا خرجت ورقاتٌ ثلثها ممتلئ.
 * • الجداول الطويلة تنساب: `break-inside:auto` مع `thead` مكرّرة، والصفّ وحده
 *   `avoid` — وإلا أُزيح الجدول بكامله وتُرك بياضٌ فوقه.
 * • لا ترقيم صفحاتٍ يدويّ: يُخلف حين ينساب الجدول صفحةً زائدة.
 */

const NAVY = '#0f2c5c';

const f2 = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
/** الأقواس للسالب — كما تكتبها الورقة المحاسبيّة. */
const par = (n: number) => (n < 0 ? `(${f2(Math.abs(n))})` : f2(n));

const CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm 9mm; }
  body * { visibility: hidden !important; }
  #pd-doc, #pd-doc * { visibility: visible !important; }
  #pd-doc { position:absolute; left:0; top:0; width:100%; }
  #pd-doc, #pd-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .pd-break { break-before: page; page-break-before: always; }
  /* الجدول ينساب والصفّ لا ينشقّ — والترويسة تتكرّر فوق كل صفحة */
  #pd-doc table { break-inside: auto; page-break-inside: auto; }
  #pd-doc thead { display: table-header-group; }
  #pd-doc tr { break-inside: avoid; page-break-inside: avoid; }
  #pd-doc h2, #pd-doc h3 { break-after: avoid; page-break-after: avoid; }
  #pd-doc .kpis, #pd-doc .sign { break-inside: avoid; page-break-inside: avoid; }
}
#pd-doc { color:#0f172a; font-size:9pt; line-height:1.45; background:#fff; }

#pd-doc .hd { display:flex; align-items:flex-end; justify-content:space-between;
  border-bottom:2.5pt solid ${NAVY}; padding-bottom:7px; margin-bottom:9px; }
#pd-doc .hd .ttl { font-size:16pt; font-weight:800; color:${NAVY}; line-height:1.15; }
#pd-doc .hd .ttl small { display:block; font-size:8.5pt; font-weight:600; color:#64748b; letter-spacing:.5pt; }
#pd-doc .hd .br { text-align:left; font-size:14pt; font-weight:800; color:${NAVY}; }
#pd-doc .hd .br span { color:#c8102e; }
#pd-doc .hd .br small { display:block; font-size:7pt; font-weight:600; color:#94a3b8; letter-spacing:1.4pt; }

#pd-doc .strip { background:#f1f5f9; border-right:3pt solid ${NAVY}; padding:5px 10px;
  font-size:8.6pt; margin-bottom:9px; display:flex; gap:16px; flex-wrap:wrap; }
#pd-doc .strip b { color:${NAVY}; }

#pd-doc h2 { font-size:10.5pt; font-weight:800; color:#fff; background:${NAVY};
  padding:4px 10px; margin:11px 0 6px; border-radius:3px; }
#pd-doc h3 { font-size:9.3pt; font-weight:700; color:${NAVY}; background:#eef2ff;
  padding:3px 8px; margin:9px 0 4px; border-radius:2px; }

#pd-doc .kpis { display:flex; gap:7px; margin-bottom:9px; }
#pd-doc .k { flex:1; border:.75pt solid #e2e8f0; border-radius:5px; padding:8px 10px; background:#fff; }
#pd-doc .k .l { font-size:7.4pt; color:#64748b; font-weight:600; display:block; }
#pd-doc .k .v { font-size:17pt; font-weight:800; color:${NAVY}; line-height:1.25; }
#pd-doc .k .s { font-size:7pt; color:#94a3b8; }
#pd-doc .k.hero { background:${NAVY}; border-color:${NAVY}; }
#pd-doc .k.hero .l { color:#93c5fd; } #pd-doc .k.hero .v { color:#fff; } #pd-doc .k.hero .s { color:#cbd5e1; }

#pd-doc table { width:100%; border-collapse:collapse; font-size:8.4pt; margin-bottom:6px; }
#pd-doc th { background:${NAVY}; color:#fff; font-weight:700; padding:4px 7px; text-align:right; white-space:nowrap; }
#pd-doc th.n, #pd-doc td.n { text-align:left; font-variant-numeric:tabular-nums; white-space:nowrap; }
#pd-doc th.c, #pd-doc td.c { text-align:center; white-space:nowrap; }
#pd-doc td { padding:3.5px 7px; border-bottom:.5pt solid #e2e8f0; }
#pd-doc tbody tr:nth-child(even) td { background:#f8fafc; }
#pd-doc tr.sum td { background:#eef2ff !important; font-weight:800; border-top:1.25pt solid ${NAVY}; }
#pd-doc tr.big td { background:#ecfdf5 !important; font-weight:800; font-size:10pt;
  border-top:1.5pt solid #047857; border-bottom:1.5pt solid #047857; }
#pd-doc td.neg { color:#b91c1c; }
#pd-doc td.pos { color:#047857; }
#pd-doc td.dim { color:#94a3b8; }
#pd-doc .lbl { font-weight:600; }

/*
 * جدول الرحلات أضيق خطّاً — أربعة عشر عموداً.
 *
 * القياس لا التقدير: عرض A4 عند هامش ٩مم ≈ ٧٣٠px. وأربعة عشر عموداً عند
 * ٨.٤ نقطة تتجاوزه فتُقصّ الأعمدة الأخيرة — وهي «نقد ضبا» و«صفاجا»، أي
 * أهمّها. وعند ٧ نقاط بحشوٍ ضيّق تسع في نحو ٧٠٦px.
 */
#pd-doc .voy table { font-size:7.4pt; }
#pd-doc .voy th { padding:3px 5px; }
#pd-doc .voy td { padding:2.5px 5px; }
#pd-doc .qty { display:block; font-size:6.4pt; color:#94a3b8; font-weight:400; letter-spacing:.2pt; }
#pd-doc tr.sum .qty { color:#64748b; }

#pd-doc .note { font-size:7.6pt; color:#64748b; line-height:1.55; border-right:2pt solid #cbd5e1;
  padding:4px 9px; background:#f8fafc; margin-top:7px; }
#pd-doc .warn { border-right-color:#f59e0b; background:#fffbeb; color:#92400e; }

#pd-doc .sign { display:flex; gap:26px; margin-top:20px; }
#pd-doc .sign div { flex:1; border-top:.75pt solid #94a3b8; padding-top:4px;
  font-size:7.8pt; color:#64748b; text-align:center; }
`;

interface Props {
  periodName: string;
  dateFrom: string;
  dateTo: string;
  result: ModelResult;
  detail: VoyageDetail | null;
  onClose: () => void;
}

export default function DistributionReport({
  periodName, dateFrom, dateTo, result, detail, onClose,
}: Props) {
  const vs = result.vessels;
  const totalDue = vs.reduce((a, v) => a + v.dueToAccount, 0);
  const gainers = vs.filter((v) => v.partnershipGain > 0.005);
  const losers = vs.filter((v) => v.partnershipGain < -0.005);
  const moved = gainers.reduce((a, v) => a + v.partnershipGain, 0);
  const issues = integrityIssues(detail);
  const nameOf = (k: string) =>
    vs.find((v) => v.key === k)?.name ?? VESSEL_NAMES[k as VesselKey] ?? k;

  /** صفٌّ في سلسلة التوزيع — بندٌ واحد بقيمةٍ لكل شريك أو بقيمةٍ مشتركة. */
  const Chain = ({ label, note, get, shared, tone }: {
    label: string;
    note?: string;
    get?: (v: ModelResult['vessels'][number]) => number;
    shared?: number;
    tone?: 'neg' | 'pos' | 'dim';
  }) => (
    <tr>
      <td className="lbl">
        {label}
        {note ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {note}</span> : null}
      </td>
      {shared !== undefined ? (
        <td className={`n ${tone || ''}`} colSpan={vs.length}>{par(shared)}</td>
      ) : (
        vs.map((v) => (
          <td key={v.key} className={`n ${tone || ''}`}>{par(get!(v))}</td>
        ))
      )}
    </tr>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{CSS}</style>

      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <span className="font-bold text-gray-800">كشف توزيع الأرباح — {periodName}</span>
        <div className="me-auto flex gap-2">
          <button onClick={() => window.print()}
            className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black">
            🖨️ طباعة / PDF
          </button>
          <button onClick={onClose}
            className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">إغلاق</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-5 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        <div id="pd-doc" dir="rtl" className="p-6 print:p-0">

          <div className="hd">
            <div className="ttl">
              كشف توزيع الأرباح
              <small>PROFIT DISTRIBUTION STATEMENT · DUBA — SAFAGA LINE</small>
            </div>
            <div className="br">
              UME <span>HOLDING</span>
              <small>MANAGEMENT ACCOUNTS</small>
            </div>
          </div>

          <div className="strip">
            <span><b>الفترة</b> {periodName}</span>
            <span><b>من</b> {dateFrom} <b>إلى</b> {dateTo}</span>
            <span><b>الأيام</b> {result.days}</span>
            <span><b>الشركاء</b> {vs.map((v) => v.name).join(' · ')}</span>
          </div>

          {result.missing.length > 0 && (
            <div className="note warn">
              <b>مدخلاتٌ ناقصة — الكشف غير مكتمل:</b> {result.missing.join(' · ')}
            </div>
          )}

          {/*
            * تحفّظُ نزاهةٍ في وجه الورقة لا في ذيلها.
            *
            * رحلةٌ رصيدها لا يساوي بنوده تُبنى عليها أرقام هذا الكشف. والمجلس
            * يعتمد ما يقرأ، فيقرأ التحفّظ قبل الأرقام لا بعدها.
            */}
          {(issues.balance.length > 0 || issues.treasury.length > 0) && (
            <div className="note warn">
              <b>⚠ تحفّظ:</b> الدفتر لا يتّسق مع نفسه في{' '}
              <b>{issues.balance.length + issues.treasury.length} رحلة</b> من رحلات هذه الفترة.
              {issues.balance.length > 0 && (
                <>
                  <br />
                  <b>رصيدٌ يخالف بنوده:</b>{' '}
                  {issues.balance
                    .map((x) => `${nameOf(x.name)} ${x.ref ?? '—'} (${f2(x.gap)})`)
                    .join(' · ')}
                </>
              )}
              {issues.treasury.length > 0 && (
                <>
                  <br />
                  <b>خزينةٌ لا تطابق الرصيد:</b>{' '}
                  {issues.treasury
                    .map((x) => `${nameOf(x.name)} ${x.ref ?? '—'} (${f2(x.gap)})`)
                    .join(' · ')}
                </>
              )}
              <br />
              والأرقام أدناه محسوبةٌ على ما في الدفتر — تُراجَع قبل الاعتماد.
            </div>
          )}

          {/* ── ما يريده الشريك أوّلاً: كم له ── */}
          <div className="kpis">
            {vs.map((v) => (
              <div key={v.key} className="k hero">
                <span className="l">التوزيع المقترح — {v.name}</span>
                <div className="v">${f0(v.dividendPayable)}</div>
                <span className="s">{v.voyages} رحلة · المستحقّ لحسابه ${f2(v.dueToAccount)}</span>
              </div>
            ))}
          </div>

          <div className="kpis">
            <div className="k">
              <span className="l">مجموع النقد في ضبا</span>
              <div className="v">${f0(result.totalCashDuba)}</div>
              <span className="s">أساس التوزيع</span>
            </div>
            <div className="k">
              <span className="l">إجمالي الإيراد</span>
              <div className="v">${f0(result.totalRevenue)}</div>
              <span className="s">للعرض — لا يدخل الحساب</span>
            </div>
            {/*
              * المستحقّ يقلّ عن نقد ضبا بكسرٍ دون الدولار — لأنّ التوزيع يُنزَّل
              * إلى الدولار الصحيح. ورقمان متجاوران يفترقان بواحدٍ يبدوان خطأً،
              * فيُكتب الفرق صراحةً بدل أن يُترك للظنّ.
              */}
            <div className="k">
              <span className="l">مجموع المستحقّ للحسابات</span>
              <div className="v">${f0(totalDue)}</div>
              <span className="s">
                والمتبقّي في ضبا ${f2(result.totalCashDuba + result.totalOverPax - totalDue)}
                {' '}— كسر التدوير
              </span>
            </div>
          </div>

          <h2>سلسلة التوزيع</h2>
          <table>
            <thead>
              <tr>
                <th>البند</th>
                {vs.map((v) => (
                  <th key={v.key} className="n">{v.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Chain label="الإيراد" note="للعرض" get={(v) => v.revenue} tone="dim" />
              <Chain label="النقد المتاح في ضبا" get={(v) => v.cashDuba} />
              <Chain label="الأساس المشترك"
                note={`${f2(result.totalCashDuba)} ÷ ${result.partners}`}
                shared={result.baseShare} />
              {result.totalOverPax !== 0 && (
                <Chain label="+ حصّة Over Pax" note="٦٦.٦٧٪ لبدوي · ٣٣.٣٣٪ للاتحاد"
                  get={(v) => v.overPaxShare} tone="pos" />
              )}
              <tr className="sum">
                <td className="lbl">معدّل الربح</td>
                {vs.map((v) => <td key={v.key} className="n">{f2(v.adjustedProfit)}</td>)}
              </tr>
              <Chain label="− حصّة الإيجار"
                note={`${f2(result.totalRent)} ÷ ${result.partners}`}
                shared={-result.rentShare} tone="neg" />
              <Chain label="− حصّة الوقود"
                note={`${f2(result.totalFuel)} ÷ ${result.partners}`}
                shared={-result.fuelShare} tone="neg" />
              <Chain label="− حصّة العمولة"
                note={`${f2(result.totalFee)} ÷ ${result.partners}`}
                shared={-result.feeShare} tone="neg" />
              <Chain label="± تسوية صفاجا" note="متوسّط التحصيل − تحصيل المركب"
                get={(v) => v.safagaAdjust} />
              <tr className="big">
                <td className="lbl">التوزيع المقترح</td>
                {vs.map((v) => <td key={v.key} className="n">{f2(v.dividendPayable)}</td>)}
              </tr>
              <Chain label="المخصوم من ضبا" get={(v) => v.deductedFromDuba} tone="dim" />
              <Chain label="المتبقّي في ضبا" note="كسر التدوير" get={(v) => v.remainingAtDuba} tone="dim" />
              <tr className="sum">
                <td className="lbl">المستحقّ لحساب المركب</td>
                {vs.map((v) => <td key={v.key} className="n">{f2(v.dueToAccount)}</td>)}
              </tr>
            </tbody>
          </table>

          <h3>أسس الحساب</h3>
          <table>
            <thead>
              <tr>
                <th>المركب</th>
                <th className="c">رحلات</th>
                <th className="n">أساس العمولة</th>
                <th className="n">العمولة</th>
                <th className="n">الوقود</th>
                <th className="c">سعر يوميّ</th>
                <th className="n">الإيجار</th>
                <th className="n">تحصيل صفاجا</th>
              </tr>
            </thead>
            <tbody>
              {vs.map((v) => (
                <tr key={v.key}>
                  <td className="lbl">{v.name}</td>
                  <td className="c">{v.voyages}</td>
                  <td className="n">{f2(v.sdBase)}{v.sdAdjust !== 0 && <sup> ✱</sup>}</td>
                  <td className="n">{f2(v.fee)}</td>
                  <td className="n">{f2(v.fuel)}{v.fuelAdjust !== 0 && <sup> ✱</sup>}</td>
                  <td className="c">{f0(v.rent / (result.days || 1))}</td>
                  <td className="n">{f2(v.rent)}</td>
                  <td className="n">{f2(v.netCollected)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="note">
            <b>الأساس:</b> التوزيع يقوم على <b>النقد المتاح في ضبا</b> لا على الإيراد.
            يُجمع نقد الشركاء ويُقسم بالتساوي، ثمّ تُخصم حصصٌ مشتركة من الإيجار
            والوقود والعمولة، وتُسوّى فروق التحصيل في صفاجا. والعمولة تُحتسب على
            شاحنات رحلة الذهاب بالنسبة المتّفق عليها مضافاً إليها رسم كلّ رحلة.
            {' '}والتوزيع يُنزَّل إلى الدولار الصحيح ويبقى الكسر رصيداً في ضبا.
            {result.warnings.length > 0 && (
              <>
                <br /><b>ملاحظات:</b> {result.warnings.join(' · ')}
              </>
            )}
          </div>

          {/*
            * أثر الشراكة — في نهاية الفترة لا في أوّلها.
            *
            * سؤالٌ إداريّ لا محاسبيّ: ماذا كان يجني المركب لو عمل وحده؟ ويُوضع
            * بعد الكشف لأنّه تحليلٌ عليه، لا مدخلٌ إليه. والمجموع صفريّ دائماً:
            * الشراكة تنقل ولا تخلق — فالرقم يقول من يدعم من، وبكم.
            */}
          {vs.length > 1 && result.missing.length === 0 && (
            <>
              <h2>أثر الشراكة <span>— لو عمل كلّ مركبٍ وحده</span></h2>
              <table>
                <thead>
                  <tr>
                    <th>البند</th>
                    {vs.map((v) => <th key={v.key} className="n">{v.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="lbl">
                      منفرداً
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                        {' '}· نقده وتحصيله − إيجاره ووقوده وعمولته
                      </span>
                    </td>
                    {vs.map((v) => <td key={v.key} className="n">{f2(v.standalone)}</td>)}
                  </tr>
                  <tr>
                    <td className="lbl">
                      شراكةً
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                        {' '}· التوزيع مع تحصيله
                      </span>
                    </td>
                    {vs.map((v) => <td key={v.key} className="n">{f2(v.partnered)}</td>)}
                  </tr>
                  <tr className="sum">
                    <td className="lbl">أثر الشراكة</td>
                    {vs.map((v) => (
                      <td key={v.key} className={`n ${v.partnershipGain >= 0 ? 'pos' : 'neg'}`}>
                        {v.partnershipGain >= 0 ? '+' : '−'}{f2(Math.abs(v.partnershipGain))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div className="note">
                {gainers.length > 0 && losers.length > 0 ? (
                  <>
                    <b>في هذه الفترة</b> نقلت الشراكة <b>${f2(moved)}</b> من{' '}
                    <b>{losers.map((v) => v.name).join(' و')}</b> إلى{' '}
                    <b>{gainers.map((v) => v.name).join(' و')}</b>.{' '}
                  </>
                ) : (
                  <><b>في هذه الفترة</b> تعادلت المراكب فلم تنقل الشراكة شيئاً بينها. </>
                )}
                والشراكة <b>تنقل ولا تخلق</b> — فمجموع الأرقام أعلاه صفر. وسببُ النقل
                أنّ الأعباء تُقسم بالتساوي: من كان وقوده أو إيجاره أعلى من المتوسّط
                تحمّلت الشراكة عنه فرقَه، ومن كان أقلّ حمل عن غيره. والرقم يقول
                <b> من يدعم من وبكم</b>، لا أنّ الشراكة رابحةٌ أو خاسرة.
              </div>
            </>
          )}

          <div className="sign">
            <div>المُعِدّ</div>
            <div>المراجَعة المالية</div>
            <div>اعتماد الإدارة</div>
          </div>

          {/* ── تفصيل الرحلات — يبدأ صفحةً جديدة ── */}
          {detail && vs.some((v) => detail[v.key as VesselKey]?.length) && (
            <div className="pd-break">
              <div className="hd">
                <div className="ttl">
                  تفصيل الرحلات
                  <small>VOYAGE DETAIL · {periodName}</small>
                </div>
                <div className="br">
                  UME <span>HOLDING</span>
                  <small>MANAGEMENT ACCOUNTS</small>
                </div>
              </div>

              {vs.map((v) => {
                const rows = detail[v.key as VesselKey];
                if (!rows?.length) return null;
                return <VesselVoyages key={v.key} name={v.name} rows={rows} />;
              })}

              <div className="note">
                <b>الشاحنات مجموعة.</b> دفتر المركب يحمل عمود <code>TRUCK</code> واحداً،
                والمستند الورقيّ يقسمه <code>Trucks</code> و<code>Dianna</code> و<code>Mafis</code>
                {' '}— والقسمة تُجرى يدوياً عند إعداد المستند. والمجموع واحد، وفرقُه عن
                المستند هو رسوم ميناء البسّام.
                {detail.fetchedAt && (
                  <>
                    <br />
                    <b>لقطة الدفتر:</b> {String(detail.fetchedAt).slice(0, 16).replace('T', ' ')}
                    {' '}— الأرقام كما كانت لحظة الجلب، لا كما هي اليوم.
                  </>
                )}
              </div>
            </div>
          )}

          <div className="note" style={{ marginTop: 10 }}>
            MANAGEMENT ACCOUNTS — OPENING BALANCES UNAUDITED
          </div>

        </div>
      </div>
    </div>
  );
}

/** قيمةٌ وتحتها عددُ الذهاب والإياب — خليّةٌ واحدة بدل عمودين. */
function Qty({ value, g, rr }: { value: number; g: number; rr: number }) {
  return (
    <td className="n">
      {f2(value)}
      <span className="qty">{g} / {rr}</span>
    </td>
  );
}

/** جدول رحلات مركبٍ واحد، وصفٌّ إجماليّ في آخره. */
function VesselVoyages({ name, rows }: { name: string; rows: VoyageRow[] }) {
  const sum = (f: (r: VoyageRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const cnt = (f: (r: VoyageRow) => number) => Math.round(sum(f));

  return (
    <div className="voy">
      <h3>{name} — {rows.length} رحلة</h3>
      {/*
        * العدد تحت القيمة لا بجوارها.
        *
        * أربعة عشر عموداً تحتاج ٧٩٠px، وعرض A4 عند هامش ٩مم ≈ ٧٣٠ — فتُقصّ
        * الأعمدة الأخيرة، وهي «نقد ضبا» و«صفاجا» أي أهمّها. وضمُّ العدد إلى
        * خليّة قيمته يُسقط ثلاثة أعمدة ويُبقي المعلومة كاملةً.
        */}
      <table>
        <thead>
          <tr>
            <th>الرحلة</th>
            <th>التاريخ</th>
            <th className="n">شاحنات</th>
            <th className="n">مركبات</th>
            <th className="n">ركّاب</th>
            <th className="n">الإيراد</th>
            <th className="n">العمولة</th>
            <th className="n">المصاريف</th>
            <th className="n">الصافي</th>
            <th className="n">نقد ضبا</th>
            <th className="n">صفاجا</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.ref ?? 'x'}-${i}`}>
              <td className="lbl">
                {r.ref ?? '—'}
                {r.overPax > 0 ? <sup> OP</sup> : null}
              </td>
              <td className="dim" style={{ whiteSpace: 'nowrap' }}>
                {r.dateExp || '—'}
                {r.dateImp && r.dateImp !== r.dateExp ? ` ← ${r.dateImp}` : ''}
              </td>
              <Qty value={r.truck} g={r.nTruckE} rr={r.nTruckI} />
              <Qty value={r.veh} g={r.nVehE} rr={r.nVehI} />
              <Qty value={r.pax} g={r.nPaxE} rr={r.nPaxI} />
              <td className="n" style={{ fontWeight: 700 }}>{f2(r.income)}</td>
              <td className="n dim">{f2(r.comm)}</td>
              <td className="n dim">{f2(r.man)}</td>
              <td className={`n ${r.net < 0 ? 'neg' : 'pos'}`} style={{ fontWeight: 700 }}>{par(r.net)}</td>
              <td className="n">{f2(r.cashDuba)}</td>
              <td className="n">{f2(r.cashSafaga)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td className="lbl" colSpan={2}>الإجمالي</td>
            <Qty value={sum((r) => r.truck)} g={cnt((r) => r.nTruckE)} rr={cnt((r) => r.nTruckI)} />
            <Qty value={sum((r) => r.veh)} g={cnt((r) => r.nVehE)} rr={cnt((r) => r.nVehI)} />
            <Qty value={sum((r) => r.pax)} g={cnt((r) => r.nPaxE)} rr={cnt((r) => r.nPaxI)} />
            <td className="n">{f2(sum((r) => r.income))}</td>
            <td className="n">{f2(sum((r) => r.comm))}</td>
            <td className="n">{f2(sum((r) => r.man))}</td>
            <td className={`n ${sum((r) => r.net) < 0 ? 'neg' : 'pos'}`}>{par(sum((r) => r.net))}</td>
            <td className="n">{f2(sum((r) => r.cashDuba))}</td>
            <td className="n">{f2(sum((r) => r.cashSafaga))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
