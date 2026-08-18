'use client';
import { useMemo } from 'react';
import { costSegments, type ExecData } from './VesselExecReport';
import type { FinData, PurchaseItem, RevRow } from './VesselFinReport';

/**
 * ── Executive Vessel Performance & Profitability Report ──
 *
 * تقريرٌ لاتخاذ القرار لا لعرض الأرقام. الصفحة الأولى وحدها تُجيب في أقلّ من
 * دقيقة: أجيّدٌ الشهر؟ وكم الإيراد والصافي والهامش؟ ومِمَّ تتكوّن التكلفة؟ وما
 * الذي يستحقّ انتباه الإدارة؟ ثم ينزل التقرير من التحليل إلى التفاصيل إلى الملحق.
 *
 * ── قاعدة البيانات الوحيدة ──
 * كل رقمٍ هنا مشتقٌّ من `data` و`purchases` و`exec` — وهي عين ما تحسبه الشاشة.
 * لا مقارنةً بشهرٍ سابق ولا موازنة ولا هدفاً: ما لا يوجد في المصدر يُكتب
 * «غير متوفّر في مصدر البيانات الحالي» ولا يُقدَّر.
 *
 * ── والتقريران السابقان يبقيان ──
 * لا يُلمس `#vp-doc` ولا `#vf-doc`. هذا ثالثٌ بزرٍّ ثالث حتى يستقرّ الشكل.
 */

interface Props {
  cfg: { vessel: string; agentExport: string; agentImport: string };
  month: string;
  monthLabel: string;
  data: FinData;
  purchases: { byItem: { name: string; value: number }[]; items: PurchaseItem[]; total: number } | null;
  exec: ExecData;
  allocVoy: { ref: string; revenue: number; net: number }[];
  labelOf: Record<string, string>;
  revRows: readonly RevRow[];
  onClose: () => void;
}

const LABEL_OVERRIDE: Record<string, string> = { egyPort: 'EGP Port Dues', ksaPort: 'KSA Port Dues' };

const f2 = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
/** أرقام المؤشرات مختصرة — الكسور في التفاصيل لا في العناوين. */
const abbr = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
};
const p1 = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '—');

const NAVY = '#0f2c5c';
const CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm 9mm; }
  body * { visibility: hidden !important; }
  #vb-doc, #vb-doc * { visibility: visible !important; }
  #vb-doc { position:absolute; left:0; top:0; width:100%; }
  .vb-page { break-before: page; page-break-before: always; }
  /*
   * الخلفيات تُطبع.
   *
   * المتصفّح يُسقط ألوان الخلفية افتراضياً عند التوليد إلى PDF، فتخرج ترويسات
   * الأقسام وبطاقة الصافي وأشرطة التكلفة بيضاء — ويضيع الهرم البصري كلّه
   * ويصير التقرير جدرانَ نصّ. وهذه القاعدة تُلزمه بطباعتها.
   */
  #vb-doc, #vb-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #vb-doc tr, #vb-doc .att, #vb-doc .li { break-inside: avoid; page-break-inside: avoid; }
  #vb-doc h2, #vb-doc h3 { break-after: avoid; page-break-after: avoid; }
}
#vb-doc { color:#0f172a; font-size:8.8pt; line-height:1.45; background:#fff; }
#vb-doc .hd { display:flex; align-items:flex-end; justify-content:space-between;
  border-bottom:3pt solid ${NAVY}; padding-bottom:6px; margin-bottom:7px; }
#vb-doc .hd .ttl { font-size:16pt; font-weight:800; color:${NAVY}; line-height:1.15; }
#vb-doc .hd .ttl small { display:block; font-size:9pt; font-weight:600; color:#64748b; letter-spacing:.6pt; }
#vb-doc .hd .br { text-align:left; font-size:14pt; font-weight:800; color:${NAVY}; }
#vb-doc .hd .br span { color:#c8102e; }
#vb-doc .hd .br small { display:block; font-size:7pt; font-weight:600; color:#94a3b8; letter-spacing:1.4pt; }
#vb-doc .strip { background:#f1f5f9; border-right:3pt solid ${NAVY}; padding:4px 10px;
  font-size:8.5pt; color:#334155; margin-bottom:8px; display:flex; gap:18px; }
#vb-doc .strip b { color:${NAVY}; }
#vb-doc h2 { font-size:11pt; font-weight:800; color:#fff; background:${NAVY};
  padding:5px 11px; border-radius:3px; margin:0 0 6px; letter-spacing:.2pt; }
#vb-doc h2 span { font-weight:600; opacity:.72; font-size:8.5pt; }
#vb-doc h3 { font-size:9.3pt; font-weight:700; color:${NAVY}; background:#eef2ff;
  padding:3px 9px; border-right:3pt solid ${NAVY}; margin:12px 0 5px; }

#vb-doc .kpis { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:7px; }
#vb-doc .k { flex:1 1 22%; border:.75pt solid #e2e8f0; border-radius:5px; padding:7px 8px; background:#fff; }
#vb-doc .k .l { font-size:7.2pt; color:#64748b; font-weight:600; letter-spacing:.2pt; display:block; }
#vb-doc .k .v { font-size:14pt; font-weight:800; color:${NAVY}; line-height:1.25; }
#vb-doc .k .s { font-size:7pt; color:#94a3b8; }
#vb-doc .k.hero { background:${NAVY}; border-color:${NAVY}; flex:1 1 30%; }
#vb-doc .k.hero .l { color:#93c5fd; } #vb-doc .k.hero .v { color:#fff; font-size:19pt; }
#vb-doc .k.hero .s { color:#cbd5e1; }
#vb-doc .k.good .v { color:#047857; }

#vb-doc table { width:100%; border-collapse:collapse; font-size:8.3pt; margin-bottom:5px; }
#vb-doc th { background:${NAVY}; color:#fff; font-weight:700; padding:4px 7px; text-align:right; white-space:nowrap; }
#vb-doc td { padding:3.5px 7px; text-align:right; white-space:nowrap; border-bottom:.5pt solid #e8edf5; }
#vb-doc tbody tr:nth-child(even) td { background:#f8fafc; }
#vb-doc tr.tot td { background:#dbe4ff; color:${NAVY}; font-weight:800; border-top:1pt solid #94a3b8; }
#vb-doc td.neg { color:#b91c1c; font-weight:700; }
#vb-doc td.pos { color:#047857; font-weight:700; }

#vb-doc .box { border:.75pt solid #e2e8f0; border-radius:5px; padding:6px 9px; margin:6px 0; background:#fff; }
#vb-doc .box .bt { font-size:9pt; font-weight:800; color:${NAVY}; margin-bottom:5px; }
#vb-doc .li { display:flex; gap:7px; margin-bottom:3px; font-size:8.4pt; line-height:1.48; }
#vb-doc .li .d { flex-shrink:0; font-weight:800; }
#vb-doc .att { border-radius:4px; padding:5px 9px; margin-bottom:3px; font-size:8.4pt; line-height:1.5; }
#vb-doc .att.hi { background:#fef2f2; border-right:3pt solid #b91c1c; }
#vb-doc .att.mo { background:#fffbeb; border-right:3pt solid #f59e0b; }
#vb-doc .att.ok { background:#ecfdf5; border-right:3pt solid #047857; }
#vb-doc .att b { color:${NAVY}; }
#vb-doc .gap { background:#f8fafc; border-right:3pt solid #cbd5e1; padding:6px 9px;
  font-size:7.8pt; color:#64748b; line-height:1.55; }

#vb-doc .bar { height:10px; border-radius:2px; display:block; }
#vb-doc .cols { display:flex; gap:14px; align-items:flex-start; }
#vb-doc .cols > div { flex:1; }
#vb-doc .sw { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:5px; }
#vb-doc .foot { margin-top:10px; border-top:.75pt solid #cbd5e1; padding-top:5px;
  font-size:7pt; color:#94a3b8; display:flex; justify-content:space-between; }
#vb-doc table, #vb-doc .box, #vb-doc .cols, #vb-doc svg { page-break-inside:avoid; break-inside:avoid; }
/*
 * الجداول التي يطول صفّها بطول الشهر تُكسَر ويتكرّر عنوانها.
 *
 * منعُ الكسر يدفع الجدول كلّه إلى الورقة التالية فتُترك نصف صفحةٍ بيضاء —
 * والشهر ذو الثلاث عشرة رحلة يفعلها كل مرّة. والصفّ يبقى غير قابلٍ للكسر
 * فلا ينشطر رقمٌ عن سطره.
 */
#vb-doc table.long { page-break-inside:auto; break-inside:auto; }
#vb-doc table.long thead { display:table-header-group; }
#vb-doc table.long tr { page-break-inside:avoid; break-inside:avoid; }
`;

export default function VesselBoardReport({
  cfg, month, monthLabel, data, purchases, exec, allocVoy, labelOf, revRows, onClose,
}: Props) {
  const N = data.count || 1;
  const R = data.revenue || 1;
  const agentExp = data.expE + data.expI;
  const opEx = agentExp + data.bunkerCost + data.salaries;
  const purTotal = purchases?.total || 0;
  const totalCost = opEx + purTotal;
  const netBefore = data.net;
  const netFinal = data.net - purTotal;

  /*
   * فرق دفتر المركب.
   *
   * السلّم يُغلق إن كان `BALANCE` مساوياً لمكوّناته. وحين لا يكون، يُعرض الفرق
   * ملاحظةَ تحقّقٍ صريحة — لا يُصلَح بصمت ولا يُدسّ في بند.
   */
  const bookGap = netBefore - (data.revenue - opEx);
  const hasGap = Math.abs(bookGap) > 0.5;

  /*
   * هيكل التكاليف — مع البنود الدائنة.
   *
   * `costSegments` المشتركة تُسقط أي مجموعةٍ قيمتها سالبة. وإشعارٌ دائن كبير
   * (يناير 2026: ‏62,428.84 في Other EXPS) يجعل مجموعتها سالبة فتسقط — فيتضخّم
   * إجمالي التكلفة المعروض وكل نسبةٍ محسوبةٍ عليه، والقارئ لا يرى أن شيئاً سقط.
   *
   * فيُحسب الفرق بين ما تعرضه الدالّة وإجمالي التكلفة الحقيقي، ويُضاف سطراً
   * صريحاً. والنسب تُقاس على الإجمالي الحقيقي لا على مجموع ما ظهر.
   * ولا تُغيَّر الدالّة نفسها لأن التقرير الإداري القديم يقرأ منها.
   */
  const rawSegs = useMemo(() => costSegments(exec), [exec]);
  const segs = useMemo(() => {
    const shown = rawSegs.reduce((s, x) => s + x.value, 0);
    const recon = totalCost - shown;
    if (Math.abs(recon) < 0.5) return rawSegs;
    return [...rawSegs, { id: 'recon', ar: 'بنود دائنة وتسوية', en: 'Credits & reconciliation',
      color: '#94a3b8', value: recon, share: 0 }];
  }, [rawSegs, totalCost]);
  const segTotal = totalCost || 1;
  const reconLine = segs.find((x) => x.id === 'recon');
  const top3 = segs.filter((x) => x.id !== 'recon').slice(0, 3);
  const top3Sum = top3.reduce((s, x) => s + x.value, 0);

  // ── الإيراد بالقطاع ──
  const segRev = useMemo(() => {
    const out = revRows.map((r) => ({
      name: r.label,
      e: Number((data.E as any)[r.key]) || 0,
      i: Number((data.I as any)[r.key]) || 0,
    }));
    out.push({ name: 'إذن الشحن', e: data.E.discharge || 0, i: data.I.discharge || 0 });
    return out.map((x) => ({ ...x, total: x.e + x.i })).sort((a, b) => b.total - a.total);
  }, [data, revRows]);
  const revTop = segRev[0];

  // ── المشتريات: مورّدون وفواتير ──
  const pur = useMemo(() => {
    const items = purchases?.items || [];
    const bySupplier: Record<string, number> = {};
    for (const i of items) bySupplier[i.supplier] = (bySupplier[i.supplier] || 0) + i.installment;
    const suppliers = Object.entries(bySupplier)
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const biggest = items.reduce<PurchaseItem | null>(
      (a, b) => (!a || b.installment > a.installment ? b : a), null);
    return { count: items.length, suppliers, biggest };
  }, [purchases]);

  const losses = allocVoy.filter((v) => v.net < 0);
  const bestV = allocVoy.reduce((a, b) => (b.net > a.net ? b : a), allocVoy[0]);
  const worstV = allocVoy.reduce((a, b) => (b.net < a.net ? b : a), allocVoy[0]);

  const expPct = data.revE / R, impPct = data.revI / R;
  const supTop = pur.suppliers[0];

  // ── شلال الربح ──
  const WF = useMemo(() => {
    const H = 116, W = 470, pad = 26, bw = 62;
    const max = Math.max(data.revenue, 1);
    const y = (v: number) => H - (v / max) * (H - 8);
    const bars = [
      { l: 'Revenue', lo: 0, hi: data.revenue, c: NAVY, v: data.revenue },
      { l: 'Operating Exp.', lo: netBefore, hi: data.revenue, c: '#b91c1c', v: -opEx },
      { l: 'Net b/f Purch.', lo: 0, hi: netBefore, c: '#3f5f8a', v: netBefore },
      { l: 'Purchases', lo: netFinal, hi: netBefore, c: '#c98b6b', v: -purTotal },
      { l: 'Final Net', lo: 0, hi: netFinal, c: '#047857', v: netFinal },
    ];
    return { H, W, pad, bw, y, bars };
  }, [data.revenue, netBefore, netFinal, opEx, purTotal]);

  const Head = ({ p, sub }: { p: string; sub: string }) => (
    <>
      <div className="hd">
        <div className="ttl">{cfg.vessel}<small>{sub}</small></div>
        <div className="br">UME <span>Holding</span><small>MARITIME · PMS</small></div>
      </div>
      <div className="strip">
        <span><b>{monthLabel}</b></span>
        <span><b>{N}</b> Voyages</span>
        <span>Currency <b>USD</b></span>
        <span style={{ marginRight: 'auto' }}>{p}</span>
      </div>
    </>
  );

  const K = ({ l, v, s, cls }: { l: string; v: string; s?: string; cls?: string }) => (
    <div className={`k ${cls || ''}`}><span className="l">{l}</span>
      <div className="v">{v}</div>{s ? <span className="s">{s}</span> : null}</div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{CSS}</style>
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <span className="font-bold text-gray-800">Executive Performance Report — {cfg.vessel} · {monthLabel}</span>
        <div className="mr-auto flex gap-2">
          <button onClick={() => window.print()} className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black">🖨️ طباعة / PDF</button>
          <button onClick={onClose} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">إغلاق</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-5 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        <div id="vb-doc" dir="rtl" className="p-6 print:p-0">

          {/* ══ PAGE 1 · EXECUTIVE SUMMARY ══ */}
          <Head p="Page 1 · Executive Summary" sub="Monthly Vessel Performance" />

          {/*
            * ستّ بطاقات لا تسع.
            *
            * كانت تسعاً فصار المدير يمسح تسعة أرقام ليجد رقمه. والستّ تجيب أسئلته
            * كلّها: كم أُنتج؟ كم بقي؟ ما نسبته؟ كم كلّف؟ وكم للرحلة الواحدة؟
            * والباقي — صافي قبل المشتريات، المشتريات، إيراد الرحلة — يعيش في
            * الشلال وفي اقتصاديات الرحلة حيث يُقرأ في سياقه.
            */}
          {/*
            * ثماني بطاقات في صفّين — أعلى ما تُجيزه المواصفة، وأدنى ما يُجيب أسئلة المدير.
            * و«إيراد الرحلة» وحده خارجها لأنه يعيش في Voyage Economics مع بقيّة
            * اقتصاديات الرحلة حيث يُقرأ في سياقه لا معزولاً.
            */}
          <div className="kpis">
            <K cls="hero" l="FINAL NET PROFIT" v={abbr(netFinal)} s={`${f2(netFinal)} · ${p1(netFinal, R)} من الإيراد`} />
            <K l="REVENUE" v={abbr(data.revenue)} s={f2(data.revenue)} />
            <K cls="good" l="NET PROFIT MARGIN" v={p1(netFinal, R)} s="Final Net ÷ Revenue" />
            <K l="NET BEFORE PURCHASES" v={abbr(netBefore)} s={p1(netBefore, R) + ' من الإيراد'} />
          </div>
          <div className="kpis">
            <K l="PURCHASES" v={abbr(purTotal)} s={p1(purTotal, R) + ' من الإيراد'} />
            <K l="TOTAL COST" v={abbr(totalCost)} s="Operating + Purchases" />
            <K l="COST-TO-REVENUE" v={p1(totalCost, R)} s="Total Cost ÷ Revenue" />
            <K l="NET PROFIT / VOYAGE" v={abbr(netFinal / N)} s={`${f2(netFinal / N)} × ${N} voyages`} />
          </div>

          <h2>Executive Profit Bridge <span>· من الإيراد إلى صافي الربح النهائي</span></h2>
          <svg viewBox={`0 0 ${WF.W} ${WF.H + 34}`} style={{ width: '100%', height: 'auto' }}
            role="img" aria-label="Profit bridge">
            {WF.bars.map((b, idx) => {
              const x = WF.pad + idx * WF.bw + idx * 22;
              const yTop = WF.y(b.hi), yBot = WF.y(b.lo);
              return (
                <g key={b.l}>
                  <rect x={x} y={yTop} width={WF.bw} height={Math.max(1.5, yBot - yTop)} fill={b.c} rx="1.5" />
                  <text x={x + WF.bw / 2} y={yTop - 4} textAnchor="middle"
                    fontSize="8.5" fontWeight="700" fill={b.v < 0 ? '#b91c1c' : NAVY}>
                    {b.v < 0 ? '−' : ''}{abbr(Math.abs(b.v)).replace('−', '')}
                  </text>
                  <text x={x + WF.bw / 2} y={WF.H + 12} textAnchor="middle" fontSize="7.4" fill="#475569">{b.l}</text>
                  <text x={x + WF.bw / 2} y={WF.H + 22} textAnchor="middle" fontSize="6.8" fill="#94a3b8">
                    {p1(Math.abs(b.v), R)}
                  </text>
                </g>
              );
            })}
            <line x1="0" y1={WF.H} x2={WF.W} y2={WF.H} stroke="#cbd5e1" strokeWidth="0.7" />
          </svg>

          {/*
            * ثلاث ملاحظات لا ستّ.
            *
            * صفحة القرار تحتمل ما يُقرأ في ثوانٍ. والملاحظات التشغيلية — اتجاه
            * النشاط واقتصاديات الرحلة — انتقلت إلى صفحتيهما حيث تُقرأ مع أرقامها.
            */}
          <h2>Executive Financial Commentary</h2>
          <div className="box">
            <div className="li"><span className="d">·</span><span>
              هامش صافٍ <b>{p1(netFinal, R)}</b> — من كل دولار إيراد يبقى{' '}
              <b>{(netFinal / R).toFixed(2)}</b> دولار بعد التكاليف والمشتريات كلّها.
            </span></div>
            <div className="li"><span className="d">·</span><span>
              الإيراد يتركّز في <b>{revTop?.name}</b> بنسبة <b>{p1(revTop?.total || 0, R)}</b>،
              وأكبر ثلاثة عوامل تكلفة تلتهم <b>{p1(top3Sum, segTotal)}</b> من التكلفة —
              فالربحية رهنُ طرفين لا أكثر.
            </span></div>
            <div className="li"><span className="d">·</span><span>
              المشتريات وحدها خفضت الصافي من <b>{f2(netBefore)}</b> إلى <b>{f2(netFinal)}</b>،
              أي <b>{p1(purTotal, R)}</b> من الإيراد.
            </span></div>
            <div className="li"><span className="d">·</span><span>
              الرحلة الواحدة: إيراد <b>{f2(data.revenue / N)}</b> وتكلفة <b>{f2(totalCost / N)}</b>،
              فصافي <b>{f2(netFinal / N)}</b> — والصادر يحمل <b>{p1(data.revE, R)}</b> من الإيراد
              مقابل <b>{p1(data.revI, R)}</b> للوارد.
            </span></div>
          </div>

          <h2>Management Attention</h2>
          {/*
            * أكبر خطرٍ واحد.
            *
            * سؤال المدير «أين أكبر Risk؟» لا يُجاب بقائمة. فيُرشَّح أشدّها أثراً
            * بالمال: خسارةٌ محقّقة أوّلاً، ثم فرقُ دفترٍ يُشكّك في الرقم نفسه،
            * ثم تركّزٌ يجعل النتيجة رهن طرفٍ واحد.
            */}
          <div className="att hi" style={{ marginTop: 6 }}>
            <b>KEY RISK · </b>
            {losses.length > 0
              ? <>رحلةٌ خاسرة ({losses.map((v) => v.ref).join(' · ')}) بـ<b>{f2(Math.abs(losses.reduce((s, v) => s + v.net, 0)))}</b>{' '}
                بينما متوسط هامش بقيّة الرحلات يقارب <b>{p1(bestV?.net || 0, bestV?.revenue || 1)}</b> —
                خسارةٌ محقّقة داخل شهرٍ رابح، وسببها تشغيليٌّ لا محاسبي.</>
              : hasGap
                ? <>فرقٌ في دفتر المركب بـ<b>{f2(Math.abs(bookGap))}</b> يجعل الصافي المعتمد غير مطابقٍ لمكوّناته.</>
                : <>تركّز الإيراد في <b>{revTop?.name}</b> بنسبة <b>{p1(revTop?.total || 0, R)}</b> —
                  تراجعٌ في هذا القطاع وحده ينعكس مباشرةً على النتيجة.</>}
          </div>
          {hasGap && (
            <div className="att hi">🔴 <b>فرق في دفتر المركب:</b> عمود <code>BALANCE</code> لا يساوي مكوّناته
              بفارق <b>{f2(Math.abs(bookGap))}</b>. الصافي مأخوذٌ من الدفتر باعتباره المعتمد، والفرق معروضٌ
              ولم يُوزَّع. العلاج في المصدر لا في التقرير.</div>
          )}

          <div className="att mo">🟠 <b>تركّز التكلفة:</b> أكبر ثلاثة بنود
            ({top3.map((s) => s.ar).join(' · ')}) تمثّل <b>{p1(top3Sum, segTotal)}</b> من هيكل التكلفة —
            فأي برنامج لرفع الربحية يبدأ منها.</div>
          {revTop && revTop.total / R > 0.6 && (
            <div className="att mo">🟠 <b>تركّز الإيراد (Concentration Risk):</b> {revTop.name} وحده{' '}
              <b>{p1(revTop.total, R)}</b> من الإيراد. تراجعٌ في هذا القطاع ينعكس مباشرةً على النتيجة.</div>
          )}
          {supTop && purTotal > 0 && supTop.value / purTotal > 0.35 && (
            <div className="att mo">🟠 <b>تركّز الموردين:</b> {supTop.name} يمثّل{' '}
              <b>{p1(supTop.value, purTotal)}</b> من مشتريات الشهر.</div>
          )}
          <div className="att ok">🟢 <b>الربحية:</b> هامش صافٍ <b>{p1(netFinal, R)}</b> وتكلفة إلى إيراد{' '}
            <b>{p1(totalCost, R)}</b>{losses.length === 0 ? ' — وكل الرحلات رابحة.' : '.'}</div>


          <h2>Questions Management Should Ask</h2>
          <div className="box">
            <div className="li"><span className="d">1.</span><span>
              تكلفة البنكر <b>{f2(data.bunkerCost / N)}</b> للرحلة — أهي ضمن المعدّل المعتاد للخطّ؟
            </span></div>
            <div className="li"><span className="d">2.</span><span>
              {segs[0]?.ar} يمثّل <b>{p1(segs[0]?.value || 0, segTotal)}</b> من التكلفة — ما المُتاح لخفضه تعاقدياً؟
            </span></div>
            <div className="li"><span className="d">3.</span><span>
              {revTop?.name} يمثّل <b>{p1(revTop?.total || 0, R)}</b> من الإيراد — ما خطّة تنويع مصادر الدخل؟
            </span></div>
            {losses.length > 0 && (
              <div className="li"><span className="d">4.</span><span>
                ما سبب خسارة الرحلة <b>{losses[0].ref}</b> بينما بقيّة الرحلات بهامش يقارب{' '}
                <b>{p1(bestV?.net || 0, bestV?.revenue || 1)}</b>؟
              </span></div>
            )}
            <div className="li"><span className="d">{losses.length > 0 ? '5.' : '4.'}</span><span>
              الوارد يمثّل <b>{p1(data.revI, R)}</b> من الإيراد بينما ركّابه <b>{f0(data.I.passC)}</b> مقابل{' '}
              <b>{f0(data.E.passC)}</b> صادراً — أيمكن رفع الاستغلال في الاتجاه الأضعف؟
            </span></div>
            </div>

          {/* ══ PAGE 2 · REVENUE & OPERATIONS ══ */}
          <div className="vb-page">
            <Head p="Page 2 · Revenue & Operational Performance" sub="Revenue Analysis" />

            <h2>Revenue by Business Segment</h2>
            <table>
              <thead><tr>
                <th scope="col">Segment</th><th scope="col">Export</th><th scope="col">Import</th>
                <th scope="col">Revenue</th><th scope="col">% of Total</th><th scope="col" style={{ width: '26%' }}>Share</th>
              </tr></thead>
              <tbody>
                {segRev.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td><td>{f2(s.e)}</td><td>{f2(s.i)}</td>
                    <td><b>{f2(s.total)}</b></td><td>{p1(s.total, R)}</td>
                    <td><span className="bar" style={{ width: `${(s.total / R) * 100}%`, background: NAVY }} /></td>
                  </tr>
                ))}
                <tr className="tot"><td>Total Revenue</td><td>{f2(data.revE)}</td><td>{f2(data.revI)}</td>
                  <td>{f2(data.revenue)}</td><td>100.0%</td><td /></tr>
              </tbody>
            </table>

            <h3>Revenue Concentration</h3>
            <div className="att mo" style={{ marginTop: 0 }}>
              أعلى قطاع <b>{revTop?.name}</b> بـ<b>{p1(revTop?.total || 0, R)}</b>، وأعلى قطاعين معاً{' '}
              <b>{p1((segRev[0]?.total || 0) + (segRev[1]?.total || 0), R)}</b> من الإيراد.
              {(revTop?.total || 0) / R > 0.6
                ? ' وهذا تركّزٌ مرتفع يستوجب متابعة مخاطر الاعتماد على قطاع واحد.'
                : ' والتوزيع متوازنٌ نسبياً.'}
            </div>

            <h2>Export vs Import</h2>
            <div className="cols">
              <div>
                <table>
                  <thead><tr><th scope="col">Direction</th><th scope="col">Revenue</th><th scope="col">%</th></tr></thead>
                  <tbody>
                    <tr><td>Export — {cfg.agentExport}</td><td>{f2(data.revE)}</td><td>{p1(data.revE, R)}</td></tr>
                    <tr><td>Import — {cfg.agentImport}</td><td>{f2(data.revI)}</td><td>{p1(data.revI, R)}</td></tr>
                    <tr className="tot"><td>Total</td><td>{f2(data.revenue)}</td><td>100.0%</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead><tr><th scope="col">Volume</th><th scope="col">Export</th><th scope="col">Import</th><th scope="col">Export %</th></tr></thead>
                  <tbody>
                    <tr><td>Trucks</td><td>{f0(data.E.truckC)}</td><td>{f0(data.I.truckC)}</td><td>{p1(data.E.truckC, data.E.truckC + data.I.truckC || 1)}</td></tr>
                    <tr><td>Cars</td><td>{f0(data.E.vehC)}</td><td>{f0(data.I.vehC)}</td><td>{p1(data.E.vehC, data.E.vehC + data.I.vehC || 1)}</td></tr>
                    <tr><td>Passengers</td><td>{f0(data.E.passC)}</td><td>{f0(data.I.passC)}</td><td>{p1(data.E.passC, data.E.passC + data.I.passC || 1)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h2>Operational Performance</h2>
            <table>
              <thead><tr>
                <th scope="col">Indicator</th><th scope="col">Export</th><th scope="col">Import</th>
                <th scope="col">Total</th><th scope="col">Per Voyage</th>
              </tr></thead>
              <tbody>
                <tr><td>Number of Voyages</td><td colSpan={2} style={{ textAlign: 'center' }}>—</td><td><b>{N}</b></td><td>—</td></tr>
                <tr><td>Trucks</td><td>{f0(data.E.truckC)}</td><td>{f0(data.I.truckC)}</td>
                  <td>{f0(data.E.truckC + data.I.truckC)}</td><td>{((data.E.truckC + data.I.truckC) / N).toFixed(1)}</td></tr>
                <tr><td>Cars</td><td>{f0(data.E.vehC)}</td><td>{f0(data.I.vehC)}</td>
                  <td>{f0(data.E.vehC + data.I.vehC)}</td><td>{((data.E.vehC + data.I.vehC) / N).toFixed(1)}</td></tr>
                <tr><td>Passengers</td><td>{f0(data.E.passC)}</td><td>{f0(data.I.passC)}</td>
                  <td>{f0(data.E.passC + data.I.passC)}</td><td>{((data.E.passC + data.I.passC) / N).toFixed(1)}</td></tr>
              </tbody>
            </table>
            <div className="att mo" style={{ marginTop: 2 }}>
              <b>اتجاه النشاط:</b> الصادر <b>{p1(data.revE, R)}</b> والوارد <b>{p1(data.revI, R)}</b> من الإيراد —
              {expPct > impPct ? ' فالثقل على الصادر' : ' فالثقل على الوارد'}. والركّاب يميلون للوارد
              (<b>{f0(data.I.passC)}</b> مقابل <b>{f0(data.E.passC)}</b>) بينما الشاحنات تميل للصادر
              (<b>{f0(data.E.truckC)}</b> مقابل <b>{f0(data.I.truckC)}</b>) — فالاتجاهان يحملان بضاعتين مختلفتين
              لا حمولةً واحدة ذهاباً وإياباً.
            </div>
          </div>

          {/* ══ PAGE 3 · COST & PROFITABILITY ══ */}
          <div className="vb-page">
            <Head p="Page 3 · Cost & Profitability Analysis" sub="Cost Drivers" />

            <h2>Cost Drivers <span>· مرتَّبة من الأكبر</span></h2>
            <div className="cols">
              <div style={{ flex: 3 }}>
                <table>
                  <thead><tr>
                    <th scope="col">Cost Driver</th><th scope="col">Amount</th>
                    <th scope="col">% of Cost</th><th scope="col">% of Revenue</th>
                    <th scope="col" style={{ width: '26%' }}>Share</th>
                  </tr></thead>
                  <tbody>
                    {segs.map((s) => (
                      <tr key={s.id}>
                        <td><span className="sw" style={{ background: s.color }} />{s.ar}</td>
                        <td>{f2(s.value)}</td><td>{p1(s.value, segTotal)}</td><td>{p1(s.value, R)}</td>
                        <td><span className="bar" style={{ width: `${(s.value / segTotal) * 100}%`, background: s.color }} /></td>
                      </tr>
                    ))}
                    <tr className="tot"><td>Total Cost</td><td>{f2(segTotal)}</td><td>100.0%</td>
                      <td>{p1(segTotal, R)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ flex: 1, paddingTop: 18 }}>
                <svg viewBox="0 0 42 42" style={{ width: '100%' }} role="img" aria-label="Cost structure">
                  {(() => {
                    let off = 25;
                    const pos = segs.filter((x) => x.value > 0);
                    const posSum = pos.reduce((a, b) => a + b.value, 0) || 1;
                    return pos.map((s) => {
                      const sh = (s.value / posSum) * 100;
                      const el = <circle key={s.id} cx="21" cy="21" r="15.915" fill="transparent"
                        stroke={s.color} strokeWidth="7" strokeDasharray={`${sh} ${100 - sh}`} strokeDashoffset={off} />;
                      off -= sh; return el;
                    });
                  })()}
                </svg>
              </div>
            </div>

            {reconLine && (
              <div className="att hi" style={{ marginTop: 2 }}>
                <b>Financial Validation Note · </b>
                بنودٌ دائنة بـ<b>{f2(Math.abs(reconLine.value))}</b> ({p1(Math.abs(reconLine.value), totalCost)} من
                التكلفة) تدخل هيكل التكاليف بإشارةٍ سالبة — إشعاراتُ دائنٍ داخل مصروفات الوكلاء.
                أُظهرت سطراً مستقلاً ولم تُحذف، والنسب أعلاه محسوبةٌ على إجمالي التكلفة الحقيقي
                <b> {f2(totalCost)}</b>. والحلقة تعرض البنود الموجبة وحدها لأن القطاع السالب لا يُرسم.
              </div>
            )}
            <div className="att mo" style={{ marginTop: 2 }}>
              <b>Top 3 Cost Drivers:</b> {top3.map((s) => `${s.ar} ${p1(s.value, segTotal)}`).join(' · ')} —
              مجتمعةً <b>{p1(top3Sum, segTotal)}</b> من هيكل التكلفة و<b>{p1(top3Sum, R)}</b> من الإيراد.
              فأي برنامج لرفع الربحية يجب أن يبدأ بها قبل غيرها.
            </div>

            <h2>Voyage Economics <span>· اقتصاديات الرحلة الواحدة</span></h2>
            <table>
              <thead><tr><th scope="col">Indicator</th><th scope="col">Total</th><th scope="col">Per Voyage</th><th scope="col">% of Revenue</th></tr></thead>
              <tbody>
                <tr><td>Revenue</td><td>{f2(data.revenue)}</td><td>{f2(data.revenue / N)}</td><td>100.0%</td></tr>
                <tr><td>Agent Expenses</td><td>{f2(agentExp)}</td><td>{f2(agentExp / N)}</td><td>{p1(agentExp, R)}</td></tr>
                <tr><td>Bunker Consumed</td><td>{f2(data.bunkerCost)}</td><td>{f2(data.bunkerCost / N)}</td><td>{p1(data.bunkerCost, R)}</td></tr>
                <tr><td>Salaries</td><td>{f2(data.salaries)}</td><td>{f2(data.salaries / N)}</td><td>{p1(data.salaries, R)}</td></tr>
                <tr><td>Purchases</td><td>{f2(purTotal)}</td><td>{f2(purTotal / N)}</td><td>{p1(purTotal, R)}</td></tr>
                <tr className="tot"><td>Total Cost</td><td>{f2(totalCost)}</td><td>{f2(totalCost / N)}</td><td>{p1(totalCost, R)}</td></tr>
                <tr className="tot"><td>Final Net Profit</td><td>{f2(netFinal)}</td><td>{f2(netFinal / N)}</td><td>{p1(netFinal, R)}</td></tr>
              </tbody>
            </table>

            <h2>Voyage Profitability</h2>
            <table className="long">
              <thead><tr>
                <th scope="col">Voyage</th><th scope="col">Revenue</th><th scope="col">Net after allocation</th>
                <th scope="col">Margin</th><th scope="col" style={{ width: '32%' }}>Net</th>
              </tr></thead>
              <tbody>
                {allocVoy.map((v) => {
                  const mx = Math.max(...allocVoy.map((x) => Math.abs(x.net)), 1);
                  return (
                    <tr key={v.ref}>
                      <td>{v.ref}</td><td>{f2(v.revenue)}</td>
                      <td className={v.net < 0 ? 'neg' : ''}>{f2(v.net)}</td>
                      <td className={v.net < 0 ? 'neg' : ''}>{p1(v.net, v.revenue || 1)}</td>
                      <td><span className="bar" style={{
                        width: `${(Math.abs(v.net) / mx) * 100}%`,
                        background: v.net < 0 ? '#b91c1c' : NAVY,
                      }} /></td>
                    </tr>
                  );
                })}
                <tr className="tot"><td>Total</td><td>{f2(allocVoy.reduce((s, v) => s + v.revenue, 0))}</td>
                  <td>{f2(allocVoy.reduce((s, v) => s + v.net, 0))}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
            <div className="gap">
              البنكر والمرتبات والمشتريات مصاريف شهرٍ لا رحلة، فتُوزَّع بنسبة إيراد كل رحلة.
              الأعلى: رحلة <b>{bestV?.ref}</b> بـ{f2(bestV?.net || 0)} · الأدنى: رحلة{' '}
              <b>{worstV?.ref}</b> بـ{f2(worstV?.net || 0)}.
            </div>
          </div>

          {/* ══ PAGE 4 · PURCHASES & SUPPLIERS ══ */}
          <div className="vb-page">
            <Head p="Page 4 · Purchases & Supplier Analysis" sub="Purchases Summary" />

            <div className="kpis">
              <K l="TOTAL PURCHASES" v={abbr(purTotal)} s={f2(purTotal)} />
              <K l="INVOICES" v={String(pur.count)} s={`${purchases?.byItem.length || 0} categories`} />
              <K l="% OF REVENUE" v={p1(purTotal, R)} s="Purchases ÷ Revenue" />
              <K l="% OF TOTAL COST" v={p1(purTotal, totalCost)} s="Purchases ÷ Total Cost" />
            </div>
            <table>
              <tbody>
                <tr><td>Largest Purchase Category</td>
                  <td><b>{purchases?.byItem[0]?.name || '—'}</b></td>
                  <td>{f2(purchases?.byItem[0]?.value || 0)}</td>
                  <td>{p1(purchases?.byItem[0]?.value || 0, purTotal || 1)}</td></tr>
                <tr><td>Largest Purchase Invoice</td>
                  <td><b>{pur.biggest?.number || '—'}</b></td>
                  <td>{f2(pur.biggest?.installment || 0)}</td>
                  <td>{pur.biggest?.supplier || '—'}</td></tr>
              </tbody>
            </table>

            <h3>Top 5 Purchase Categories</h3>
            <table>
              <thead><tr><th scope="col">Category</th><th scope="col">Amount</th><th scope="col">% of Purchases</th>
                <th scope="col" style={{ width: '30%' }}>Share</th></tr></thead>
              <tbody>
                {(purchases?.byItem || []).slice(0, 5).map((b) => (
                  <tr key={b.name}><td>{b.name}</td><td>{f2(b.value)}</td><td>{p1(b.value, purTotal || 1)}</td>
                    <td><span className="bar" style={{ width: `${(b.value / (purTotal || 1)) * 100}%`, background: '#c98b6b' }} /></td></tr>
                ))}
              </tbody>
            </table>

            <h3>Top 5 Suppliers by Monthly Charge</h3>
            <table>
              <thead><tr><th scope="col">Supplier</th><th scope="col">Amount</th><th scope="col">% of Purchases</th>
                <th scope="col" style={{ width: '30%' }}>Share</th></tr></thead>
              <tbody>
                {pur.suppliers.slice(0, 5).map((s) => (
                  <tr key={s.name}><td>{s.name}</td><td>{f2(s.value)}</td><td>{p1(s.value, purTotal || 1)}</td>
                    <td><span className="bar" style={{ width: `${(s.value / (purTotal || 1)) * 100}%`, background: '#3f5f8a' }} /></td></tr>
                ))}
              </tbody>
            </table>
            <div className="gap">
              المورّد تصنيفٌ مستقلٌّ عن بند المصروف فلا يُجمع الجدولان — وإجماليهما واحد:{' '}
              <b>{f2(pur.suppliers.reduce((s, x) => s + x.value, 0))}</b>.
            </div>

            <h2>Management Opportunities</h2>
            <div className="box">
              <div className="bt">Cost Optimization</div>
              <div className="li"><span className="d">·</span><span>
                <b>{segs[0]?.ar}</b> بـ{p1(segs[0]?.value || 0, segTotal)} من التكلفة —
                نقطة البداية لأي برنامج خفض. تُدرس أسعار التعاقد ومعدّل الاستهلاك للرحلة
                ({f2(data.bunkerCost / N)} للرحلة).
              </span></div>
              <div className="li"><span className="d">·</span><span>
                <b>مصروفات الوكلاء</b> {f2(agentExp)} أي {p1(agentExp, R)} من الإيراد — تُراجَع نسب
                العمولات التعاقدية بندًا بندًا (ملحق التفاصيل).
              </span></div>
              <div className="bt" style={{ marginTop: 7 }}>Revenue Opportunities</div>
              <div className="li"><span className="d">·</span><span>
                {revTop?.name} يمثّل {p1(revTop?.total || 0, R)} من الإيراد — تنويع المزيج يقلّل حساسية
                النتيجة لقطاعٍ واحد.
              </span></div>
              <div className="li"><span className="d">·</span><span>
                فجوة الاتجاهين: الصادر {p1(data.revE, R)} والوارد {p1(data.revI, R)} — رفع الاستغلال في
                الاتجاه الأضعف يرفع الإيراد بلا رحلاتٍ إضافية.
              </span></div>
              {(supTop && purTotal > 0 && supTop.value / purTotal > 0.35) ? (
                <>
                  <div className="bt" style={{ marginTop: 7 }}>Control / Monitoring</div>
                  <div className="li"><span className="d">·</span><span>
                    {supTop.name} يمثّل {p1(supTop.value, purTotal)} من المشتريات — يُراجَع الاعتماد على
                    مورّدٍ واحد تسعيراً وبدائل.
                  </span></div>
                </>
              ) : null}
            </div>

          </div>

          {/* ══ PAGE 5 · APPENDIX ══ */}
          <div className="vb-page">
            <Head p="Page 5 · Detailed Financial Appendix" sub="Supporting Details" />

            <h2>Appendix A · Operating Expenses</h2>
            <div className="cols">
              <div>
                <h3>Export — {cfg.agentExport}</h3>
                <table>
                  <thead><tr><th scope="col">Item</th><th scope="col">Amount</th><th scope="col">%</th></tr></thead>
                  <tbody>
                    {Object.entries(data.E.exp as Record<string, number>).map(([k, v]) => (
                      <tr key={k}><td>{LABEL_OVERRIDE[k] || labelOf[k] || k}</td><td>{f2(v)}</td><td>{p1(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>Total</td><td>{f2(data.expE)}</td><td>{p1(data.expE, R)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3>Import — {cfg.agentImport}</h3>
                <table>
                  <thead><tr><th scope="col">Item</th><th scope="col">Amount</th><th scope="col">%</th></tr></thead>
                  <tbody>
                    {Object.entries(data.I.exp as Record<string, number>).map(([k, v]) => (
                      <tr key={k}><td>{LABEL_OVERRIDE[k] || labelOf[k] || k}</td><td>{f2(v)}</td><td>{p1(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>Total</td><td>{f2(data.expI)}</td><td>{p1(data.expI, R)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h3>Bunker &amp; Salaries</h3>
            <table>
              <thead><tr><th scope="col">Opening</th><th scope="col">+ Supplies</th><th scope="col">− Closing</th>
                <th scope="col">= Consumed</th><th scope="col">Salaries</th></tr></thead>
              <tbody><tr>
                <td>{f2(data.opening)}</td><td>{f2(data.supplies)}</td><td>{f2(data.closing)}</td>
                <td><b>{f2(data.bunkerCost)}</b></td><td>{f2(data.salaries)}</td>
              </tr></tbody>
            </table>

            <h3>Agents&apos; Liquidity <span style={{ fontWeight: 400 }}>— رصيدٌ لا مصروف، خارج قائمة الدخل</span></h3>
            <table>
              <thead><tr><th scope="col">{cfg.agentExport} (P−O)</th><th scope="col">{cfg.agentImport} (O)</th>
                <th scope="col">Total Collection (P)</th></tr></thead>
              <tbody><tr><td>{f2(data.liqIttihad)}</td><td>{f2(data.liqBassam)}</td><td>{f2(data.P)}</td></tr></tbody>
            </table>

            <h2>Appendix B · Purchase Details</h2>
            <table className="long">
              <thead><tr>
                <th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Supplier</th>
                <th scope="col">Category</th><th scope="col">Original</th>
                <th scope="col">Amort.</th><th scope="col">Monthly (USD)</th>
              </tr></thead>
              <tbody>
                {(purchases?.items || []).map((i) => (
                  <tr key={i.id}>
                    <td>{i.number}{i.amount < 0 ? ' (CN)' : ''}</td>
                    <td>{i.date || '—'}</td>
                    <td>{i.supplier}</td>
                    <td>{i.item}</td>
                    <td>{f2(i.amount)} {i.currency}</td>
                    <td>{i.nMonths > 1 ? `${i.seq}/${i.nMonths}` : 'Full'}</td>
                    <td>{i.missing ? 'FX missing' : f2(i.installment)}{i.usedDefault ? ' *' : ''}</td>
                  </tr>
                ))}
                <tr className="tot"><td colSpan={6}>Total Purchases</td><td>{f2(purTotal)}</td></tr>
              </tbody>
            </table>

            <h2>Financial Validation</h2>
            <table>
              <thead><tr><th scope="col">Check</th><th scope="col">Computed</th><th scope="col">Reported</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {[
                  ['Revenue = Export + Import', data.revE + data.revI, data.revenue],
                  ['Operating Exp. = Agents + Bunker + Salaries', agentExp + data.bunkerCost + data.salaries, data.revenue - netBefore],
                  ['Net before Purchases', data.revenue - opEx - (hasGap ? -bookGap : 0), netBefore],
                  ['Final Net = Net b/f − Purchases', netBefore - purTotal, netFinal],
                  ['Total Cost = Operating + Purchases', opEx + purTotal, totalCost],
                  ['Cost Structure = Total Cost', segTotal, totalCost],
                  ['Purchases by category = Total', (purchases?.byItem || []).reduce((s, b) => s + b.value, 0), purTotal],
                  ['Suppliers total = Purchases total', pur.suppliers.reduce((s, x) => s + x.value, 0), purTotal],
                ].map(([l, a, b]) => (
                  <tr key={l as string}>
                    <td style={{ textAlign: 'right' }}>{l as string}</td>
                    <td>{f2(a as number)}</td><td>{f2(b as number)}</td>
                    <td className={Math.abs((a as number) - (b as number)) <= 0.05 ? 'pos' : 'neg'}>
                      {Math.abs((a as number) - (b as number)) <= 0.05 ? 'MATCH' : `Δ ${f2((a as number) - (b as number))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="gap" style={{ marginTop: 8 }}>
              <b>Data availability:</b> المقارنة بالشهر السابق · الموازنة (Budget) · Actual vs Budget ·
              YTD · العام السابق · مقارنة المراكب والخطوط — <b>غير متوفّرة في مصدر البيانات الحالي</b>،
              ولم تُقدَّر. وهيكل التقرير يستوعبها متى توفّرت بلا إعادة تصميم.
            </div>

            <div className="foot">
              <span>UME Holding · Maritime PMS — {cfg.vessel} · {monthLabel} · Executive Performance Report</span>
              <span>{month}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
