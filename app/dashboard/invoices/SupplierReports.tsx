'use client';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { Drawer, Button, Icon, Spinner, Select as UISelect, cx } from '@/components/ui';
import { fmtCcyMap, sumByCurrency } from '@/lib/format';

export type SupplierReportKey = 'statement' | 'unpaid' | 'vessel';

const REPORTS: { key: SupplierReportKey; title: string; desc: string; icon: string }[] = [
  { key: 'statement', title: 'كشف حساب مورد', desc: 'مدين / دائن / رصيد متراكم', icon: 'receipt' },
  { key: 'unpaid', title: 'مستحقات مورد', desc: 'الفواتير غير المدفوعة أو الجزئية', icon: 'factory' },
  { key: 'vessel', title: 'موردو المركب', desc: 'حجم تعامل كل مورد على المركب', icon: 'clipboard' },
];

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };
const num = (n: any) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toExcel(rows: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export default function SupplierReports({
  open, onClose, suppliers, vessels, initial,
}: {
  open: boolean; onClose: () => void;
  suppliers: any[]; vessels: any[];
  initial?: { report?: SupplierReportKey; supplierId?: string; vesselId?: string };
}) {
  const [report, setReport] = useState<SupplierReportKey>('statement');
  const [supplierId, setSupplierId] = useState('');
  const [vesselId, setVesselId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // يعيد الضبط على القيم السياقية في كل فتح
  useEffect(() => {
    if (!open) return;
    setReport(initial?.report || 'statement');
    setSupplierId(initial?.supplierId || '');
    setVesselId(initial?.vesselId || '');
    setData(null); setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.report, initial?.supplierId, initial?.vesselId]);

  const needsSupplier = report === 'statement' || report === 'unpaid';
  const targetId = needsSupplier ? supplierId : vesselId;

  useEffect(() => {
    if (!open || !targetId) { setData(null); return; }
    let cancelled = false;
    setLoading(true); setError('');
    const url = report === 'statement' ? `/api/invoices/statement/supplier/${supplierId}`
      : report === 'unpaid' ? `/api/invoices/unpaid/by-supplier/${supplierId}`
      : `/api/vessels/${vesselId}/suppliers`;
    api.get(url)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setError('تعذّر تحميل التقرير'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, report, targetId, supplierId, vesselId]);

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name || '';
  const vesselName = vessels.find((v) => v.id === vesselId)?.name || '';
  const activeTitle = REPORTS.find((r) => r.key === report)!.title;

  return (
    <Drawer open={open} onClose={onClose} title={`تقارير الموردين — ${activeTitle}`} width="max-w-4xl">
      {/* اختيار التقرير */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => { setReport(r.key); setData(null); }}
            className={cx('text-right rounded-xl border p-3 transition', report === r.key ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-200' : 'border-gray-200 bg-white hover:border-gray-300')}>
            <div className="flex items-center gap-2">
              <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center', report === r.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500')}><Icon name={r.icon as any} size={16} /></span>
              <span className="font-semibold text-sm text-gray-800">{r.title}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* الفلتر */}
      <div className="flex items-end gap-2 flex-wrap mb-4 pb-4 border-b border-gray-100">
        {needsSupplier ? (
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">المورد</label>
            <UISelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— اختر المورد —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </UISelect>
          </div>
        ) : (
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">المركب</label>
            <UISelect value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
              <option value="">— اختر المركب —</option>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </UISelect>
          </div>
        )}
      </div>

      {!targetId && <p className="text-center text-gray-400 text-sm py-10">اختر {needsSupplier ? 'مورداً' : 'مركباً'} لعرض التقرير</p>}
      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {error && <p className="text-center text-red-500 text-sm py-6">{error}</p>}

      {!loading && !error && data && targetId && (
        <>
          {report === 'statement' && <Statement d={data} name={supplierName || data?.supplier?.name} />}
          {report === 'unpaid' && <Unpaid invoices={Array.isArray(data) ? data : []} name={supplierName} />}
          {report === 'vessel' && <VesselSuppliers rows={Array.isArray(data) ? data : []} name={vesselName} />}
        </>
      )}
    </Drawer>
  );
}

/* ── كشف حساب مورد (رصيد متراكم لكل عملة على حدة — العملات لا تُجمع) ── */
function Statement({ d, name }: { d: any; name: string }) {
  const ledgers: any[] = d?.currencies || [];
  const creditNotes = ledgers.reduce((s, L) => s + L.transactions.filter((t: any) => t.kind === 'credit_note').length, 0);
  const totalTx = ledgers.reduce((s, L) => s + L.transactions.length, 0);

  const rowsOf = (L: any) => L.transactions.map((t: any) => ({
    'التاريخ': t.date?.slice(0, 10),
    'النوع': t.kind === 'credit_note' ? 'إشعار دائن' : t.kind === 'invoice' ? 'فاتورة' : 'سداد',
    'البيان': t.description, 'السفينة': t.vessel || '—',
    'العملة': t.currency, 'مدين': t.debit || 0, 'دائن': t.credit || 0, 'الرصيد': t.balance,
  }));

  if (!ledgers.length) return <p className="text-center text-gray-400 text-sm py-10">لا توجد حركات لهذا المورد</p>;

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h4 className="font-bold text-gray-700">كشف حساب — {name} <span className="text-xs font-normal text-gray-400">({totalTx} حركة · {ledgers.length} عملة)</span></h4>
      </div>

      {creditNotes > 0 && (
        <p className="text-[11px] text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5 mb-3">
          يحتوي الكشف على {creditNotes} إشعار دائن — تُقيَّد دائناً لأنها تخصم من رصيد المورد.
        </p>
      )}
      {ledgers.length > 1 && (
        <p className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5 mb-3">
          كل عملة دفتر مستقل — لا يوجد رصيد موحّد ولا تحويل بين العملات.
        </p>
      )}

      {ledgers.map((L: any) => (
        <div key={L.currency} className="mb-4 last:mb-0 border border-gray-100 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
            <span className="font-bold text-gray-800 text-sm">{L.currency}</span>
            <div className="flex gap-3 text-[11px] flex-wrap">
              <span className="text-gray-500">افتتاحي {num(L.openingBalance)}</span>
              <span className="text-red-600">فواتير {num(L.invoicesTotal)}</span>
              <span className="text-green-600">سدادات {num(L.paymentsTotal)}</span>
              {L.creditsTotal > 0 && <span className="text-indigo-600">إشعارات دائنة {num(L.creditsTotal)}</span>}
              <span className={cx('font-bold', L.closingBalance > 0.01 ? 'text-red-700' : 'text-green-700')}>الرصيد {num(L.closingBalance)} {L.currency}</span>
            </div>
            <Button size="sm" variant="success" icon="file" onClick={() => toExcel(rowsOf(L), `كشف-حساب-${name}-${L.currency}`)}>Excel</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[540px]">
              <thead className="bg-white text-gray-600 border-b"><tr>
                <th className="px-2 py-2 text-right">التاريخ</th><th className="px-2 py-2 text-right">البيان</th>
                <th className="px-2 py-2 text-right">السفينة</th>
                <th className="px-2 py-2 text-left">مدين</th><th className="px-2 py-2 text-left">دائن</th>
                <th className="px-2 py-2 text-left">الرصيد ({L.currency})</th>
              </tr></thead>
              <tbody>
                {L.transactions.map((t: any, i: number) => (
                  <tr key={i} className={cx('border-t border-gray-50', t.kind === 'credit_note' && 'bg-indigo-50/50')}>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{t.date?.slice(0, 10)}</td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {t.kind === 'credit_note' && <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-[10px] font-semibold ms-1.5">إشعار دائن</span>}
                      {t.description}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{t.vessel || '—'}</td>
                    <td className="px-2 py-1.5 text-left tabular-nums text-red-600">{t.debit ? num(t.debit) : ''}</td>
                    <td className="px-2 py-1.5 text-left tabular-nums text-green-600">{t.credit ? num(t.credit) : ''}</td>
                    <td className={cx('px-2 py-1.5 text-left tabular-nums font-bold', t.balance > 0.01 ? 'text-red-700' : 'text-green-700')}>{num(t.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

/* ── مستحقات مورد ── */
function Unpaid({ invoices, name }: { invoices: any[]; name: string }) {
  const totalMap = sumByCurrency(invoices, (i: any) => +i.total_amount, (i: any) => i.currency);
  const remMap = sumByCurrency(invoices, (i: any) => +i.total_amount - +i.paid_amount, (i: any) => i.currency);

  if (!invoices.length) return <p className="text-center text-gray-400 text-sm py-10">لا توجد فواتير مستحقة لهذا المورد</p>;

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h4 className="font-bold text-gray-700">مستحقات — {name} <span className="text-xs font-normal text-gray-400">({invoices.length} فاتورة)</span></h4>
          <p className="text-xs mt-0.5">
            <span className="text-gray-500">إجمالي: <strong>{fmtCcyMap(totalMap)}</strong></span>
            <span className="text-red-600 ms-3">المتبقي: <strong>{fmtCcyMap(remMap)}</strong></span>
          </p>
        </div>
        <Button size="sm" variant="success" icon="file" onClick={() => toExcel(invoices.map((inv) => ({
          'المورد': name, 'رقم الفاتورة': inv.invoice_number, 'السفينة': inv.vessel?.name || '—',
          'المبلغ': inv.total_amount, 'العملة': inv.currency, 'المدفوع': inv.paid_amount,
          'المتبقي': +inv.total_amount - +inv.paid_amount, 'الاستحقاق': inv.due_date?.slice(0, 10) || '—',
          'الحالة': statusLabel[inv.status] || inv.status,
        })), `مستحقات-${name}`)}>Excel</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="bg-gray-50 text-gray-600"><tr>
            <th className="px-2 py-2 text-right">رقم الفاتورة</th><th className="px-2 py-2 text-right">السفينة</th>
            <th className="px-2 py-2 text-left">المبلغ</th><th className="px-2 py-2 text-left">المدفوع</th>
            <th className="px-2 py-2 text-left">المتبقي</th><th className="px-2 py-2 text-center">الاستحقاق</th><th className="px-2 py-2 text-center">الحالة</th>
          </tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-gray-50">
                <td className="px-2 py-1.5 font-mono text-brand-700">{inv.invoice_number}</td>
                <td className="px-2 py-1.5 text-gray-600">{inv.vessel?.name || '—'}</td>
                <td className="px-2 py-1.5 text-left tabular-nums">{num(inv.total_amount)} {inv.currency}</td>
                <td className="px-2 py-1.5 text-left tabular-nums text-green-600">{num(inv.paid_amount)}</td>
                <td className="px-2 py-1.5 text-left tabular-nums font-bold text-red-600">{num(+inv.total_amount - +inv.paid_amount)}</td>
                <td className="px-2 py-1.5 text-center text-gray-500 whitespace-nowrap">{inv.due_date?.slice(0, 10) || '—'}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{statusLabel[inv.status] || inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── موردو المركب ── */
function VesselSuppliers({ rows, name }: { rows: any[]; name: string }) {
  if (!rows.length) return <p className="text-center text-gray-400 text-sm py-10">لا توجد بيانات لهذا المركب</p>;
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h4 className="font-bold text-gray-700">موردو {name} <span className="text-xs font-normal text-gray-400">({rows.length} مورد)</span></h4>
        <Button size="sm" variant="success" icon="file" onClick={() => toExcel(rows.map((r) => ({
          'المورد': r.supplier_name, 'عدد الفواتير': r.total_invoices, 'إجمالي الفواتير': r.total_amount,
          'المدفوع': r.paid_amount, 'المتبقي': +r.total_amount - +r.paid_amount,
        })), `موردو-${name}`)}>Excel</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead className="bg-gray-50 text-gray-600"><tr>
            <th className="px-2 py-2 text-right">المورد</th><th className="px-2 py-2 text-center">عدد الفواتير</th>
            <th className="px-2 py-2 text-left">إجمالي الفواتير</th><th className="px-2 py-2 text-left">المدفوع</th><th className="px-2 py-2 text-left">المتبقي</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="px-2 py-1.5 font-medium text-gray-700">{r.supplier_name}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{r.total_invoices}</td>
                <td className="px-2 py-1.5 text-left tabular-nums">{num(r.total_amount)}</td>
                <td className="px-2 py-1.5 text-left tabular-nums text-green-600">{num(r.paid_amount)}</td>
                <td className="px-2 py-1.5 text-left tabular-nums font-bold text-red-600">{num(+r.total_amount - +r.paid_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
