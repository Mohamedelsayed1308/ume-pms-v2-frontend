'use client';
import { useMemo, useState } from 'react';

/**
 * ── كشف حساب العميل — فواتير الإيجار ──
 *
 * الشاشة تعرض المستندات صفوفاً متجاورة، ولا تُجيب سؤال العميل الأول: **كم عليه
 * الآن؟** فالإجابة موزّعة على فواتير وإشعاراتٍ دائنة ومدينة ودفعاتٍ داخل الفواتير.
 * وهذا الكشف يجمعها في دفترٍ واحد برصيدٍ متحرّك.
 *
 * ── العملات لا تُجمع ──
 * الحساب فيه يورو ودولار. وجمعهما في رقمٍ واحد خطأ لا يُصحّحه سعر صرف مُفترَض،
 * فيُقسَّم الكشف بالعملة ويُعطى كلٌّ رصيده. ولا تحويل هنا إطلاقاً.
 *
 * ── الاصطلاح المحاسبي ──
 * مدين على العميل: الفاتورة والإشعار المدين. ودائن له: الإشعار الدائن والدفعة.
 * والرصيد = المدين − الدائن؛ موجبه مستحقٌّ علينا تحصيله.
 */

export interface StmtDoc {
  id: string;
  invoice_number: string;
  invoice_date: string;
  doc_type?: string;
  currency: string;
  total_amount: number;
  paid_amount: number;
  hire_from?: string;
  hire_to?: string;
  customer: { id: string; name: string; address?: string; vat_no?: string };
  vessel: { id: string; name: string };
  related_invoice?: { invoice_number: string } | null;
  payments?: { id: string; payment_date: string; amount: number; currency: string; reference: string }[];
}

interface Props {
  docs: StmtDoc[];
  customers: { id: string; name: string; address?: string; vat_no?: string }[];
  vessels: { id: string; name: string }[];
  onClose: () => void;
}

const f2 = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '—');

const CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm 10mm; }
  body * { visibility: hidden !important; }
  #stmt-doc, #stmt-doc * { visibility: visible !important; }
  #stmt-doc { position:absolute; left:0; top:0; width:100%; }
  /* المتصفّح يُسقط الخلفيات عند التوليد إلى PDF فتخرج الترويسات بيضاء */
  #stmt-doc, #stmt-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #stmt-doc tr { break-inside: avoid; page-break-inside: avoid; }
  #stmt-doc h3 { break-after: avoid; page-break-after: avoid; }
  #stmt-doc table { break-inside: auto; page-break-inside: auto; }
  #stmt-doc thead { display: table-header-group; }
}
#stmt-doc { color:#0f172a; font-size:9pt; line-height:1.45; background:#fff; }
#stmt-doc .hd { display:flex; align-items:flex-end; justify-content:space-between;
  border-bottom:2.5pt solid #19325a; padding-bottom:8px; margin-bottom:10px; }
#stmt-doc .brand { font-size:16pt; font-weight:800; color:#19325a; }
#stmt-doc .brand span { color:#c8102e; }
#stmt-doc .brand small { display:block; font-size:7pt; font-weight:600; color:#94a3b8; letter-spacing:1.4pt; }
#stmt-doc .ttl { font-size:14pt; font-weight:800; color:#19325a; }
#stmt-doc .ttl small { display:block; font-size:8.5pt; font-weight:600; color:#64748b; letter-spacing:.4pt; }
#stmt-doc .meta { background:#f1f5f9; border-right:3pt solid #19325a; padding:6px 10px;
  margin-bottom:12px; font-size:8.6pt; line-height:1.7; }
#stmt-doc .meta b { color:#19325a; }
#stmt-doc h3 { font-size:10pt; font-weight:800; color:#fff; background:#19325a;
  padding:4px 10px; border-radius:3px; margin:14px 0 6px; }
#stmt-doc table { width:100%; border-collapse:collapse; font-size:8.4pt; margin-bottom:4px; }
#stmt-doc th { background:#19325a; color:#fff; font-weight:700; padding:4px 7px; text-align:right; white-space:nowrap; }
#stmt-doc td { padding:3.5px 7px; text-align:right; white-space:nowrap; border-bottom:.5pt solid #e8edf5; }
#stmt-doc tbody tr:nth-child(even) td { background:#f8fafc; }
#stmt-doc tr.tot td { background:#dbe4ff; color:#19325a; font-weight:800; border-top:1pt solid #94a3b8; }
#stmt-doc tr.bal td { background:#19325a; color:#fff; font-weight:800; font-size:9.6pt; }
#stmt-doc td.dr { color:#b91c1c; } #stmt-doc td.cr { color:#047857; }
#stmt-doc .note { font-size:7.8pt; color:#64748b; background:#f8fafc;
  border-right:2.5pt solid #cbd5e1; padding:6px 9px; margin-top:10px; line-height:1.55; }
#stmt-doc .foot { margin-top:14px; border-top:.75pt solid #cbd5e1; padding-top:6px;
  font-size:7pt; color:#94a3b8; display:flex; justify-content:space-between; }
`;

interface Line {
  date: string; kind: string; ref: string; note: string;
  debit: number; credit: number;
}

export default function CustomerStatement({ docs, customers, vessels, onClose }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [vesselId, setVesselId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // العملاء الذين لهم مستندات فعلاً — لا كل العملاء
  const withDocs = useMemo(() => {
    const ids = new Set(docs.map((d) => d.customer?.id).filter(Boolean));
    return customers.filter((c) => ids.has(c.id));
  }, [docs, customers]);

  const cust = withDocs.find((c) => c.id === customerId);

  /*
   * بناء الدفتر.
   *
   * كل مستندٍ سطر، وكل دفعةٍ سطر. والدفعات تعيش داخل الفواتير لا مستقلّةً،
   * فتُستخرَج منها. والتصفية بالتاريخ تقع على تاريخ السطر نفسه — لا على تاريخ
   * الفاتورة الأمّ — وإلا سقطت دفعةٌ داخل الفترة لأن فاتورتها خارجها.
   */
  const byCurrency = useMemo(() => {
    if (!customerId) return {} as Record<string, Line[]>;
    const inRange = (d: string) => {
      const x = (d || '').slice(0, 10);
      if (from && x < from) return false;
      if (to && x > to) return false;
      return true;
    };
    const out: Record<string, Line[]> = {};
    const push = (cur: string, l: Line) => { (out[cur] = out[cur] || []).push(l); };

    for (const d of docs) {
      if (d.customer?.id !== customerId) continue;
      if (vesselId && d.vessel?.id !== vesselId) continue;
      const dt = d.doc_type || 'invoice';
      const cur = d.currency || 'EUR';
      const amt = Number(d.total_amount) || 0;

      if (inRange(d.invoice_date)) {
        const period = d.hire_from || d.hire_to ? `${dmy(d.hire_from)} → ${dmy(d.hire_to)}` : '';
        push(cur, {
          date: (d.invoice_date || '').slice(0, 10),
          kind: dt === 'credit_note' ? 'إشعار دائن' : dt === 'debit_note' ? 'إشعار مدين' : 'فاتورة إيجار',
          ref: d.invoice_number,
          note: [d.vessel?.name, period, d.related_invoice?.invoice_number ? `مقابل ${d.related_invoice.invoice_number}` : '']
            .filter(Boolean).join(' · '),
          debit: dt === 'credit_note' ? 0 : amt,
          credit: dt === 'credit_note' ? amt : 0,
        });
      }
      for (const p of d.payments || []) {
        if (!inRange(p.payment_date)) continue;
        push(p.currency || cur, {
          date: (p.payment_date || '').slice(0, 10),
          kind: 'دفعة',
          ref: p.reference || '—',
          note: `سداد على ${d.invoice_number}${d.vessel?.name ? ' · ' + d.vessel.name : ''}`,
          debit: 0,
          credit: Number(p.amount) || 0,
        });
      }
    }
    for (const cur of Object.keys(out)) {
      out[cur].sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
    }
    return out;
  }, [docs, customerId, vesselId, from, to]);

  const currencies = Object.keys(byCurrency).sort();
  const vesselName = vessels.find((v) => v.id === vesselId)?.name;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-auto print:bg-white print:static print:overflow-visible">
      <style>{CSS}</style>

      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-end gap-3 flex-wrap print:hidden">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">العميل</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[220px]">
            <option value="">— اختر العميل —</option>
            {withDocs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">المركب</label>
          <select value={vesselId} onChange={(e) => setVesselId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">كل المراكب</option>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="ms-auto flex gap-2">
          <button onClick={() => window.print()} disabled={!customerId}
            className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black disabled:opacity-40">🖨️ طباعة / PDF</button>
          <button onClick={onClose} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50">إغلاق</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-5 bg-white shadow-xl print:shadow-none print:my-0 print:max-w-none">
        {!customerId ? (
          <p className="p-10 text-center text-gray-500">اختر العميل ليُبنى كشف الحساب.</p>
        ) : (
          <div id="stmt-doc" dir="rtl" className="p-6 print:p-0">
            <div className="hd">
              <div className="ttl">كشف حساب<small>Statement of Account</small></div>
              <div className="brand">UME <span>Holding</span><small>MARITIME · PMS</small></div>
            </div>

            <div className="meta">
              <div>العميل: <b>{cust?.name}</b>{cust?.vat_no ? <> · VAT: <b>{cust.vat_no}</b></> : null}</div>
              {cust?.address ? <div>{cust.address}</div> : null}
              <div>
                المركب: <b>{vesselName || 'كل المراكب'}</b>
                {' · '}الفترة: <b>{from ? dmy(from) : 'من البداية'}</b> → <b>{to ? dmy(to) : 'حتى تاريخه'}</b>
              </div>
            </div>

            {currencies.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '9pt' }}>لا توجد حركات على هذا العميل ضمن النطاق المحدَّد.</p>
            )}

            {currencies.map((cur) => {
              const lines = byCurrency[cur];
              let run = 0;
              const dr = lines.reduce((s, l) => s + l.debit, 0);
              const cr = lines.reduce((s, l) => s + l.credit, 0);
              return (
                <div key={cur}>
                  <h3>الحركات بعملة {cur}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">التاريخ</th>
                        <th scope="col">النوع</th>
                        <th scope="col">المرجع</th>
                        <th scope="col" style={{ textAlign: 'right' }}>البيان</th>
                        <th scope="col">مدين</th>
                        <th scope="col">دائن</th>
                        <th scope="col">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        run += l.debit - l.credit;
                        return (
                          <tr key={l.ref + i}>
                            <td>{dmy(l.date)}</td>
                            <td>{l.kind}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.ref}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'normal' }}>{l.note}</td>
                            <td className="dr">{l.debit ? f2(l.debit) : '—'}</td>
                            <td className="cr">{l.credit ? f2(l.credit) : '—'}</td>
                            <td><b>{f2(run)}</b></td>
                          </tr>
                        );
                      })}
                      <tr className="tot">
                        <td colSpan={4}>الإجمالي</td>
                        <td>{f2(dr)}</td>
                        <td>{f2(cr)}</td>
                        <td>{f2(dr - cr)}</td>
                      </tr>
                      <tr className="bal">
                        <td colSpan={4}>الرصيد المستحقّ — Balance Due ({cur})</td>
                        <td colSpan={3}>{f2(dr - cr)} {cur}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}

            {currencies.length > 1 && (
              <div className="note">
                الحساب بعملتين، <b>ولم تُجمعا</b>: لكل عملةٍ رصيدها. وجمعهما يستلزم سعر صرفٍ
                لتاريخٍ محدَّد، وهو قرارٌ محاسبي لا يُفترَض في كشف حساب.
              </div>
            )}

            <div className="note">
              <b>الاصطلاح:</b> فاتورة الإيجار والإشعار المدين <b>مدين</b> على العميل ·
              الإشعار الدائن والدفعة <b>دائن</b> له · والرصيد الموجب مستحقٌّ لنا.
              والدفعات مأخوذة من سجلّ السداد المرتبط بكل فاتورة.
            </div>

            <div className="foot">
              <span>UME Holding · Maritime PMS — كشف حساب {cust?.name}</span>
              <span>{new Date().toISOString().slice(0, 10)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
