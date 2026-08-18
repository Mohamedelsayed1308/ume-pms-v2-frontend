'use client';
import { useMemo, useState } from 'react';
import { costSegments, type ExecData } from './VesselExecReport';

/**
 * ── تقرير صافي الربح — النسخة المالية ──
 *
 * التقرير الأصلي يعرض عشر كتلٍ متجاورة: الإيرادات، المنقولات، المصروفات، البنكر،
 * السيولة، المشتريات… كلٌّ صحيحة وحدها، ولا خيط يربطها. فيرى القارئ 3.48 مليون في
 * الأعلى و1.75 في الأعلى أيضاً، ولا يجد بينهما طريقاً.
 *
 * وهذه النسخة تبدأ بالطريق: قائمة دخلٍ متدرّجة تنزل من الإيراد إلى الصافي درجةً
 * درجة، كل درجة سطرٌ ونسبتها من الإيراد ورقم الملحق الذي يفصّلها. ثم الملاحق
 * بالترتيب نفسه، ثم التحليل والرسوم في الختام.
 *
 * ── والأصل يبقى ──
 * لا يُلمس `#vp-doc`. هذه نافذةٌ منفصلة بزرٍّ خاصّ، فيُقارَن الشكلان على الورق
 * قبل أن يُستغنى عن أحدهما.
 */

export interface RevRow { key: string; cKey: string; label: string }

export interface FinData {
  E: any; I: any;
  revE: number; revI: number; revenue: number;
  expE: number; expI: number;
  opening: number; supplies: number; closing: number; bunkerCost: number;
  salaries: number; net: number;
  O: number; P: number; liqBassam: number; liqIttihad: number;
  count: number;
}

export interface PurchaseItem {
  id: string; number: string; supplier: string; item: string;
  lines: { item_name?: string; amount?: number }[] | null;
  date: string; amount: number; currency: string;
  nMonths: number; seq: number; installment: number;
  missing?: boolean; usedDefault?: boolean;
}

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

/*
 * مسمّيات يعتمدها المالك في هذا التقرير وحده.
 *
 * لا تُغيَّر في إعداد الشاشة لأن التقرير الأصلي يقرأ منه، والمطلوب إبقاؤه كما هو
 * بديلاً حتى يُحسم الشكلان.
 */
const LABEL_OVERRIDE: Record<string, string> = {
  egyPort: 'EGP Port Dues',
  ksaPort: 'KSA Port Dues',
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '—');

const CSS = `
@media print {
  @page { size: A4 portrait; margin: 11mm 10mm; }
  body * { visibility: hidden !important; }
  #vf-doc, #vf-doc * { visibility: visible !important; }
  #vf-doc { position: absolute; left:0; top:0; width:100%; }
  .vf-break { break-before: page; page-break-before: always; }
}
#vf-doc { color:#0f172a; font-size:9pt; line-height:1.45; background:#fff; }
#vf-doc .dh { display:flex; align-items:center; justify-content:space-between;
  border-bottom:2.5pt solid #0f2c5c; padding-bottom:8px; margin-bottom:12px; }
#vf-doc .brand { font-size:17pt; font-weight:800; color:#0f2c5c; letter-spacing:.3pt; }
#vf-doc .brand span { color:#c8102e; }
#vf-doc .brand small { display:block; font-size:7.5pt; font-weight:600; color:#64748b; letter-spacing:1.5pt; }
#vf-doc .meta { text-align:left; font-size:8.5pt; color:#475569; line-height:1.7; }
#vf-doc .meta b { color:#0f172a; }
#vf-doc h2 { font-size:12.5pt; font-weight:800; color:#fff; background:#0f2c5c;
  padding:6px 12px; border-radius:4px; margin:0 0 10px; }
#vf-doc h3 { font-size:10pt; font-weight:700; color:#0f2c5c; background:#eef2ff;
  padding:4px 9px; border-right:3pt solid #0f2c5c; margin:14px 0 5px; }
#vf-doc table { width:100%; border-collapse:collapse; font-size:8.6pt; margin-bottom:6px; }
#vf-doc th { background:#0f2c5c; color:#fff; font-weight:700; padding:5px 8px; text-align:right; white-space:nowrap; }
#vf-doc td { padding:4px 8px; text-align:right; white-space:nowrap; border-bottom:.5pt solid #e5e9f0; }
#vf-doc tbody tr:nth-child(even) td { background:#f8fafc; }
#vf-doc tr.tot td { background:#dbe4ff; color:#0f2c5c; font-weight:800; border-top:1pt solid #94a3b8; }

/* قائمة الدخل المتدرّجة */
#vf-doc .pl { width:100%; border-collapse:collapse; font-size:10pt; }
#vf-doc .pl td { padding:7px 12px; border-bottom:.5pt solid #e8edf5; white-space:nowrap; }
#vf-doc .pl td.lbl { text-align:right; width:46%; }
#vf-doc .pl td.amt { text-align:left; font-weight:700; font-variant-numeric:tabular-nums; width:22%; }
#vf-doc .pl td.shr { text-align:left; color:#64748b; width:14%; font-size:9pt; }
#vf-doc .pl td.ref { text-align:left; color:#7c8db5; width:18%; font-size:8pt; }
#vf-doc .pl tr.sub td { background:#f1f5f9; font-weight:800; border-top:1pt solid #94a3b8; }
#vf-doc .pl tr.fin td { background:#065f46; color:#fff; font-weight:800; font-size:11.5pt; border:none; }
#vf-doc .pl tr.neg td.amt { color:#b91c1c; }
#vf-doc .pl tr.gap td { background:#fef3c7; color:#92400e; font-weight:700; }

#vf-doc .note { font-size:8pt; color:#64748b; background:#f8fafc;
  border-right:2.5pt solid #cbd5e1; padding:6px 9px; margin:8px 0; line-height:1.6; }
#vf-doc .warn { border-right-color:#f59e0b; background:#fffbeb; color:#92400e; }
#vf-doc .cols { display:flex; gap:16px; align-items:flex-start; }
#vf-doc .cols > div { flex:1; }
#vf-doc .dn { display:flex; align-items:center; gap:16px; }
#vf-doc .dn svg { width:160px; height:160px; flex-shrink:0; }
#vf-doc .sw { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:6px; }
#vf-doc .bar { height:11px; border-radius:2px; display:block; }
#vf-doc .foot { margin-top:14px; border-top:.75pt solid #cbd5e1; padding-top:6px;
  font-size:7.5pt; color:#94a3b8; display:flex; justify-content:space-between; }
#vf-doc table, #vf-doc .cols, #vf-doc .dn { page-break-inside:avoid; break-inside:avoid; }
`;

export default function VesselFinReport({
  cfg, month, monthLabel, data, purchases, exec, allocVoy, labelOf, revRows, onClose,
}: Props) {
  const [showVoy, setShowVoy] = useState(true);

  const R = data.revenue || 1;
  const agentExp = data.expE + data.expI;
  const gross = data.revenue - agentExp;
  const beforePurch = gross - data.bunkerCost - data.salaries;
  const purchTotal = purchases?.total || 0;

  /*
   * فرق الدفتر.
   *
   * السلّم يصحّ إن كان `BALANCE` في دفتر المركب مساوياً لمكوّناته. وهو ليس كذلك
   * دائماً — رحلاتٌ معلومة يخالف فيها العمودُ مكوّناته. فيُحسب الفرق ويُعرض سطراً
   * صريحاً بدل أن يُوزَّع صامتاً على بندٍ فيبدو السلّم متّسقاً وهو ليس كذلك.
   */
  const bookGap = data.net - beforePurch;
  const hasGap = Math.abs(bookGap) > 0.5;

  const segs = useMemo(() => costSegments(exec), [exec]);
  const segTotal = segs.reduce((s, x) => s + x.value, 0) || 1;

  /*
   * الفواتير مجمَّعة تحت بنودها بترتيب جدول البنود نفسه.
   *
   * فيُتحقَّق كل رقمٍ من الورق: مجموع سطور البند = سطره في الجدول. والفاتورة
   * متعددة البنود تدخل تحت كل بندٍ بحصّته منها لا بكامل قسطها.
   */
  const grouped = useMemo(() => {
    if (!purchases) return [];
    return purchases.byItem.map((b) => {
      const rows: { inv: PurchaseItem; share: number }[] = [];
      for (const i of purchases.items) {
        if (i.lines && i.lines.length) {
          const tot = i.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) || 1;
          const mine = i.lines
            .filter((l) => (l.item_name || 'بدون بند') === b.name)
            .reduce((s, l) => s + (Number(l.amount) || 0), 0);
          if (mine) rows.push({ inv: i, share: i.installment * (mine / tot) });
        } else if (i.item === b.name) {
          rows.push({ inv: i, share: i.installment });
        }
      }
      return { name: b.name, value: b.value, rows };
    });
  }, [purchases]);

  const maxNet = Math.max(...allocVoy.map((v) => Math.abs(v.net)), 1);

  const Head = ({ page }: { page: string }) => (
    <div className="dh">
      <div className="brand">UME <span>Holding</span><small>MARITIME · PMS</small></div>
      <div className="meta">
        <div>المركب: <b>{cfg.vessel}</b></div>
        <div>الفترة: <b>{monthLabel}</b></div>
        <div>عدد الرحلات: <b>{data.count}</b> · العملة: <b>USD</b> · {page}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{CSS}</style>

      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <span className="font-bold text-gray-800">التقرير المالي (نسخة ٢) — {cfg.vessel} · {monthLabel}</span>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={showVoy} onChange={(e) => setShowVoy(e.target.checked)} />
          ربحية كل رحلة
        </label>
        <div className="mr-auto flex gap-2">
          <button onClick={() => window.print()} className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black">🖨️ طباعة / PDF</button>
          <button onClick={onClose} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">إغلاق</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-5 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        <div id="vf-doc" dir="rtl" className="p-6 print:p-0">

          {/* ── ص١ · قائمة الدخل المتدرّجة ── */}
          <Head page="١/٦" />
          <h2>قائمة الدخل — من الإيراد إلى صافي الربح</h2>
          <table className="pl">
            <tbody>
              <tr>
                <td className="lbl">إجمالي الإيراد</td>
                <td className="amt">{fmt(data.revenue)}</td>
                <td className="shr">100.0%</td>
                <td className="ref">ملحق ١</td>
              </tr>
              <tr className="neg">
                <td className="lbl">− مصروفات الوكلاء (صادر + وارد)</td>
                <td className="amt">({fmt(agentExp)})</td>
                <td className="shr">{pct(agentExp, R)}</td>
                <td className="ref">ملحق ٣</td>
              </tr>
              <tr className="sub">
                <td className="lbl">= مجمل الربح</td>
                <td className="amt">{fmt(gross)}</td>
                <td className="shr">{pct(gross, R)}</td>
                <td className="ref"></td>
              </tr>
              <tr className="neg">
                <td className="lbl">− البنكر المستهلك</td>
                <td className="amt">({fmt(data.bunkerCost)})</td>
                <td className="shr">{pct(data.bunkerCost, R)}</td>
                <td className="ref">ملحق ٤</td>
              </tr>
              <tr className="neg">
                <td className="lbl">− مرتبات الشهر</td>
                <td className="amt">({fmt(data.salaries)})</td>
                <td className="shr">{pct(data.salaries, R)}</td>
                <td className="ref">ملحق ٤</td>
              </tr>
              {hasGap && (
                <tr className="gap">
                  <td className="lbl">{bookGap > 0 ? '+' : '−'} فروق دفتر المركب (عمود BALANCE)</td>
                  <td className="amt">{fmt(Math.abs(bookGap))}</td>
                  <td className="shr">{pct(Math.abs(bookGap), R)}</td>
                  <td className="ref">انظر الحاشية</td>
                </tr>
              )}
              <tr className="sub">
                <td className="lbl">= صافي الربح قبل المشتريات</td>
                <td className="amt">{fmt(data.net)}</td>
                <td className="shr">{pct(data.net, R)}</td>
                <td className="ref"></td>
              </tr>
              <tr className="neg">
                <td className="lbl">− مشتريات المركب (قسط الشهر)</td>
                <td className="amt">({fmt(purchTotal)})</td>
                <td className="shr">{pct(purchTotal, R)}</td>
                <td className="ref">ملحق ٥</td>
              </tr>
              <tr className="fin">
                <td className="lbl">= صافي الربح النهائي</td>
                <td className="amt">{fmt(data.net - purchTotal)}</td>
                <td className="shr">{pct(data.net - purchTotal, R)}</td>
                <td className="ref"></td>
              </tr>
            </tbody>
          </table>

          <div className="note">
            كل نسبةٍ محسوبةٌ من إجمالي الإيراد. ومتوسط الرحلة الواحدة:
            إيراد <b>{fmt(data.revenue / (data.count || 1))}</b> ·
            صافي نهائي <b>{fmt((data.net - purchTotal) / (data.count || 1))}</b>
            على {data.count} رحلة.
          </div>

          {hasGap && (
            <div className="note warn">
              <b>فروق دفتر المركب:</b> مجموع عمود <code>BALANCE</code> في الدفتر لا يساوي
              مكوّناته (الإيراد ناقص المصاريف والبنكر) بفارق <b>{fmt(Math.abs(bookGap))}</b>.
              الصافي أعلاه مأخوذٌ من <code>BALANCE</code> لأنه المعتمد، والفرق معروضٌ سطراً
              مستقلاً ولم يُوزَّع على بندٍ حتى لا يبدو السلّم متّسقاً وهو ليس كذلك.
              وعلاجه في دفتر المركب لا في التقرير.
            </div>
          )}

          {/* ── ص٢ · ملحق ١ و٢ ── */}
          <div className="vf-break">
            <Head page="٢/٦" />
            <h2>ملحق ١ · الإيرادات</h2>
            <table>
              <thead><tr>
                <th scope="col">البند</th>
                <th scope="col">صادر — عدد</th><th scope="col">صادر — مبلغ</th>
                <th scope="col">وارد — عدد</th><th scope="col">وارد — مبلغ</th>
                <th scope="col">الإجمالي</th><th scope="col">٪ من الإيراد</th>
              </tr></thead>
              <tbody>
                {revRows.map((r) => {
                  const eC = (data.E as any)[r.cKey], eA = (data.E as any)[r.key];
                  const iC = (data.I as any)[r.cKey], iA = (data.I as any)[r.key];
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{eC || '—'}</td><td>{fmt(eA)}</td>
                      <td>{iC || '—'}</td><td>{fmt(iA)}</td>
                      <td>{fmt(eA + iA)}</td><td>{pct(eA + iA, R)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td>إذن الشحن</td><td>—</td><td>{fmt(data.E.discharge)}</td>
                  <td>—</td><td>{fmt(data.I.discharge)}</td>
                  <td>{fmt(data.E.discharge + data.I.discharge)}</td>
                  <td>{pct(data.E.discharge + data.I.discharge, R)}</td>
                </tr>
                <tr className="tot">
                  <td>إجمالي الإيراد</td><td></td><td>{fmt(data.revE)}</td>
                  <td></td><td>{fmt(data.revI)}</td><td>{fmt(data.revenue)}</td><td>100.0%</td>
                </tr>
              </tbody>
            </table>

            <h2 style={{ marginTop: 18 }}>ملحق ٢ · المنقولات ومتوسطاتها</h2>
            <table>
              <thead><tr>
                <th scope="col">البند</th>
                <th scope="col">صادر</th><th scope="col">وارد</th><th scope="col">الإجمالي</th>
                <th scope="col">متوسط صادر / رحلة</th><th scope="col">متوسط وارد / رحلة</th>
              </tr></thead>
              <tbody>
                {([
                  { label: 'شاحنات', e: data.E.truckC, i: data.I.truckC },
                  { label: 'سيارات', e: data.E.vehC, i: data.I.vehC },
                  { label: 'ركاب', e: data.E.passC, i: data.I.passC },
                ] as const).map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.e.toLocaleString()}</td>
                    <td>{r.i.toLocaleString()}</td>
                    <td>{(r.e + r.i).toLocaleString()}</td>
                    <td>{fmt(r.e / (data.count || 1))}</td>
                    <td>{fmt(r.i / (data.count || 1))}</td>
                  </tr>
                ))}
                {/*
                  * لا سطر إجمالي هنا — بأمر المالك.
                  * وجمعُ شاحنةٍ إلى راكبٍ إلى سيارة لا يُنتج كمّيةً ذات معنى أصلاً.
                  */}
              </tbody>
            </table>
          </div>

          {/* ── ص٣ · ملحق ٣ و٤ ── */}
          <div className="vf-break">
            <Head page="٣/٦" />
            <h2>ملحق ٣ · مصروفات الوكلاء</h2>
            <div className="cols">
              <div>
                <h3>الصادر — {cfg.agentExport}</h3>
                <table>
                  <thead><tr><th scope="col">المصروف</th><th scope="col">المبلغ</th><th scope="col">٪</th></tr></thead>
                  <tbody>
                    {Object.entries(data.E.exp as Record<string, number>).map(([k, v]) => (
                      <tr key={k}><td>{LABEL_OVERRIDE[k] || labelOf[k] || k}</td><td>{fmt(v)}</td><td>{pct(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>الإجمالي</td><td>{fmt(data.expE)}</td><td>{pct(data.expE, R)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3>الوارد — {cfg.agentImport}</h3>
                <table>
                  <thead><tr><th scope="col">المصروف</th><th scope="col">المبلغ</th><th scope="col">٪</th></tr></thead>
                  <tbody>
                    {Object.entries(data.I.exp as Record<string, number>).map(([k, v]) => (
                      <tr key={k}><td>{LABEL_OVERRIDE[k] || labelOf[k] || k}</td><td>{fmt(v)}</td><td>{pct(v, R)}</td></tr>
                    ))}
                    <tr className="tot"><td>الإجمالي</td><td>{fmt(data.expI)}</td><td>{pct(data.expI, R)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h2 style={{ marginTop: 18 }}>ملحق ٤ · البنكر والمرتبات والسيولة</h2>
            <h3>البنكر</h3>
            <table>
              <thead><tr>
                <th scope="col">رصيد أول المدة</th><th scope="col">+ تموينات الشهر</th>
                <th scope="col">− رصيد آخر المدة</th><th scope="col">= المستهلك</th>
              </tr></thead>
              <tbody><tr>
                <td>{fmt(data.opening)}</td><td>{fmt(data.supplies)}</td>
                <td>{fmt(data.closing)}</td><td><b>{fmt(data.bunkerCost)}</b></td>
              </tr></tbody>
            </table>
            <div className="note">
              المُحمَّل على الشهر هو <b>المستهلك</b> لا المُشترى. ورصيد آخر المدة يُرحَّل
              رصيداً افتتاحياً للشهر التالي.
            </div>

            <h3>مرتبات الشهر</h3>
            <table><tbody><tr><td>مرتبات الطاقم المحمّلة</td><td>{fmt(data.salaries)}</td></tr></tbody></table>

            <h3>السيولة عند الوكلاء</h3>
            <table>
              <thead><tr>
                <th scope="col">{cfg.agentExport} (P−O)</th>
                <th scope="col">{cfg.agentImport} (O)</th>
                <th scope="col">إجمالي التحصيل (P)</th>
              </tr></thead>
              <tbody><tr>
                <td>{fmt(data.liqIttihad)}</td><td>{fmt(data.liqBassam)}</td><td>{fmt(data.P)}</td>
              </tr></tbody>
            </table>
            <div className="note">
              السيولة رصيدٌ عند الوكيل لا مصروف — لا تدخل قائمة الدخل أعلاه.
            </div>
          </div>

          {/* ── ص٤ · ملحق ٥ · المشتريات ── */}
          <div className="vf-break">
            <Head page="٤/٦" />
            <h2>ملحق ٥ · المشتريات</h2>
            <h3>الإجمالي حسب البند</h3>
            <table>
              <thead><tr><th scope="col">البند</th><th scope="col">قسط الشهر (USD)</th><th scope="col">٪ من المشتريات</th></tr></thead>
              <tbody>
                {(purchases?.byItem || []).map((b) => (
                  <tr key={b.name}><td>{b.name}</td><td>{fmt(b.value)}</td><td>{pct(b.value, purchTotal || 1)}</td></tr>
                ))}
                <tr className="tot"><td>الإجمالي</td><td>{fmt(purchTotal)}</td><td>100.0%</td></tr>
              </tbody>
            </table>

            <h3>الفواتير مجمَّعة تحت بنودها — بالترتيب نفسه</h3>
            <div className="note">
              مجموع كل مجموعةٍ يساوي سطرها في الجدول أعلاه، فيُتحقَّق الرقم من الورق.
              والفاتورة متعددة البنود تظهر تحت كل بندٍ بحصّته منها لا بكامل قسطها.
            </div>
            {grouped.length ? grouped.map((g) => (
              <table key={g.name}>
                <thead><tr>
                  <th scope="col" colSpan={4}>{g.name}</th>
                  <th scope="col" style={{ textAlign: 'left' }}>{fmt(g.value)}</th>
                </tr></thead>
                <tbody>
                  <tr style={{ fontSize: '7.8pt', color: '#64748b' }}>
                    <td>رقم الفاتورة</td><td>التاريخ</td><td>المورد</td>
                    <td>المبلغ الأصلي · الإهلاك</td><td>حصّة البند (USD)</td>
                  </tr>
                  {g.rows.map(({ inv, share }) => (
                    <tr key={inv.id + g.name}>
                      <td>{inv.number}{inv.amount < 0 ? ' (إشعار دائن)' : ''}</td>
                      <td>{inv.date || '—'}</td>
                      <td>{inv.supplier}</td>
                      <td>{fmt(inv.amount)} {inv.currency} · {inv.nMonths > 1 ? `${inv.seq}/${inv.nMonths}` : 'كامل'}</td>
                      <td>{inv.missing ? 'سعر ناقص' : fmt(share)}{inv.usedDefault ? ' *' : ''}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td colSpan={4}>مجموع {g.name}</td>
                    <td>{fmt(g.rows.reduce((s, x) => s + x.share, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )) : <p style={{ fontSize: '8.5pt', color: '#64748b' }}>لا توجد فواتير على المركب في هذا الشهر.</p>}
          </div>

          {/* ── ص٥ · التحليل ── */}
          <div className="vf-break">
            <Head page="٥/٦" />
            <h2>التحليل</h2>

            <h3>هيكل التكاليف</h3>
            <div className="dn">
              <svg viewBox="0 0 42 42" role="img" aria-label="توزيع التكاليف">
                {(() => {
                  let off = 25;
                  return segs.map((s) => {
                    const share = (Math.max(0, s.value) / segTotal) * 100;
                    const el = (
                      <circle key={s.id} cx="21" cy="21" r="15.915" fill="transparent"
                        stroke={s.color} strokeWidth="7"
                        strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={off} />
                    );
                    off -= share;
                    return el;
                  });
                })()}
              </svg>
              <table style={{ marginBottom: 0 }}>
                <tbody>
                  {segs.map((s) => (
                    <tr key={s.id}>
                      <td><span className="sw" style={{ background: s.color }} />{s.ar}</td>
                      <td>{fmt(s.value)}</td>
                      <td style={{ color: '#64748b' }}>{((Math.max(0, s.value) / segTotal) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="tot"><td>إجمالي المصروفات</td><td>{fmt(segTotal)}</td><td>100%</td></tr>
                </tbody>
              </table>
            </div>

            {showVoy && allocVoy.length > 0 && (
              <>
                <h3>ربحية كل رحلة — بعد توزيع البنكر والمرتبات والمشتريات</h3>
                <table>
                  <thead><tr>
                    <th scope="col">الرحلة</th><th scope="col">الإيراد</th>
                    <th scope="col">الصافي بعد التوزيع</th><th scope="col">هامش</th>
                    <th scope="col" style={{ width: '38%' }}>الصافي</th>
                  </tr></thead>
                  <tbody>
                    {allocVoy.map((v) => (
                      <tr key={v.ref}>
                        <td>{v.ref}</td>
                        <td>{fmt(v.revenue)}</td>
                        <td>{fmt(v.net)}</td>
                        <td style={{ color: '#64748b' }}>{pct(v.net, v.revenue || 1)}</td>
                        <td>
                          <span className="bar" style={{
                            width: `${(Math.abs(v.net) / maxNet) * 100}%`,
                            background: v.net >= 0 ? '#0f2c5c' : '#b91c1c',
                          }} />
                        </td>
                      </tr>
                    ))}
                    <tr className="tot">
                      <td>الإجمالي</td>
                      <td>{fmt(allocVoy.reduce((s, v) => s + v.revenue, 0))}</td>
                      <td>{fmt(allocVoy.reduce((s, v) => s + v.net, 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">
                  البنكر والمرتبات والمشتريات مصاريف شهرٍ لا رحلة، فتُوزَّع على الرحلات
                  بنسبة إيراد كل رحلة. ومجموع الصافي هنا = صافي الربح النهائي في الصفحة الأولى.
                </div>
              </>
            )}
          </div>

          <div className="foot">
            <span>UME Holding · Maritime PMS — {cfg.vessel} · {monthLabel}</span>
            <span>{month}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
