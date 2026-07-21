'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';

const UME = {
  name: 'UME Shipping DMCC',
  address: 'Unit 3308B , JBC1 Tower , Cluster G , JLT\nDubai, United Arab Emirates',
  vat: '100346055500003',
  bank_name: 'Abu Dhabi Islamic Bank',
  bank_branch: 'Emaar Square , Dubai , UAE',
  iban: 'AE130500000000019051122',
  swift: 'ABDIAEAD',
};

interface MgmtInvoice {
  id: string; invoice_number: string; invoice_date: string; status: string;
  currency: string; amount: number; paid_amount: number;
  description: string; notes: string;
  vessel: { id: string; name: string; imo_number: string; owner_name: string; owner_address: string };
  payments: { id: string; payment_date: string; amount: number; currency: string; reference: string }[];
}

const emptyForm = {
  invoice_number: '', invoice_date: '', vessel_id: '',
  description: '', currency: 'USD', amount: '', notes: '',
};

const statusLabel: Record<string, string> = { unpaid: 'غير مسددة', partial: 'مسددة جزئياً', paid: 'مسددة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700' };
function fmt(n: number) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ManagementInvoicesPage() {
  const [invoices, setInvoices] = useState<MgmtInvoice[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MgmtInvoice | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewInv, setViewInv] = useState<MgmtInvoice | null>(null);
  const [previewInv, setPreviewInv] = useState<MgmtInvoice | null>(null);
  const [payForm, setPayForm] = useState({ payment_date: '', amount: '', currency: 'USD', reference: '', notes: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  async function load() {
    const [invRes, vesRes] = await Promise.all([api.get('/api/management-invoices'), api.get('/api/vessels')]);
    setInvoices(invRes.data);
    setVessels(vesRes.data);
  }
  useEffect(() => { load(); }, []);

  function autoDescription(dateStr: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    return `Commercial / Operation Management fees ${month} ${year}`;
  }

  function openAdd() {
    setEditing(null); setForm(emptyForm); setError(''); setShowModal(true);
  }
  function openEdit(inv: MgmtInvoice) {
    setEditing(inv);
    setForm({ invoice_number: inv.invoice_number, invoice_date: inv.invoice_date?.slice(0,10) || '', vessel_id: inv.vessel?.id || '', description: inv.description, currency: inv.currency, amount: String(inv.amount), notes: inv.notes || '' });
    setError(''); setShowModal(true);
  }

  async function handleSave() {
    if (!form.invoice_number.trim()) { setError('رقم الفاتورة مطلوب'); return; }
    if (!form.vessel_id) { setError('المركب مطلوب'); return; }
    if (!form.amount) { setError('المبلغ مطلوب'); return; }
    setLoading(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editing) await api.put(`/api/management-invoices/${editing.id}`, payload);
      else await api.post('/api/management-invoices', payload);
      setShowModal(false); load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string, num: string) {
    if (!confirm(`حذف الفاتورة "${num}"؟`)) return;
    await api.delete(`/api/management-invoices/${id}`); load();
  }

  async function handleAddPayment() {
    if (!payForm.payment_date || !payForm.amount) return;
    setPayLoading(true);
    try {
      const updated = await api.post(`/api/management-invoices/${viewInv!.id}/payments`, payForm);
      setViewInv(updated.data);
      setPayForm({ payment_date: '', amount: '', currency: 'USD', reference: '', notes: '' });
      load();
    } finally { setPayLoading(false); }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!confirm('حذف هذا الدفع؟')) return;
    await api.delete(`/api/management-invoices/${viewInv!.id}/payments/${paymentId}`);
    const refreshed = await api.get(`/api/management-invoices/${viewInv!.id}`);
    setViewInv(refreshed.data); load();
  }

  async function exportPDF(inv: MgmtInvoice) {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210; const M = 18;
    const DARK: [number,number,number] = [30, 30, 30];
    const GRAY: [number,number,number] = [100, 100, 100];
    const LIGHT_BG: [number,number,number] = [248, 248, 248];
    const BORDER: [number,number,number] = [200, 200, 200];
    const NAVY: [number,number,number] = [19, 50, 90];
    const TEAL: [number,number,number] = [0, 139, 139];

    // Top bar
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, W, 2.5, 'F');

    // UME name (left, teal)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEAL);
    doc.text(UME.name, M, 16);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    UME.address.split('\n').forEach((line, i) => doc.text(line, M, 22 + i * 4.5));

    // "Tax Invoice" (right, teal)
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEAL);
    doc.text('Tax Invoice', W - M, 18, { align: 'right' });

    // Date / Invoice# table
    autoTable(doc, {
      startY: 22, margin: { left: W - 72, right: M },
      theme: 'grid',
      head: [['Date', 'Invoice #']],
      body: [[inv.invoice_date?.slice(0,10) || '', inv.invoice_number]],
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK },
      headStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: 'bold', lineColor: BORDER, lineWidth: 0.3 },
      bodyStyles: { lineColor: BORDER, lineWidth: 0.3 },
    });

    // VAT number
    const vatY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY);
    doc.text(`VAT #${UME.vat}`, W - M, vatY, { align: 'right' });

    // Divider
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(M, 43, W - M, 43);

    // Bill To box (left)
    const billY = 47;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, billY, 100, 38, 1.5, 1.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRAY);
    doc.text('BILL TO', M + 3, billY + 5.5);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(inv.vessel?.owner_name || '—', M + 3, billY + 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    const addrLines = (inv.vessel?.owner_address || '').split('\n');
    addrLines.forEach((line, i) => doc.text(line, M + 3, billY + 17 + i * 4.5));

    // Vessel box (right)
    const vesX = W - M - 70; const vesY = billY;
    doc.setDrawColor(...BORDER);
    doc.roundedRect(vesX, vesY, 70, 22, 1.5, 1.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRAY);
    doc.text('VESSEL NAME', vesX + 3, vesY + 5.5);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.text(`${inv.vessel?.name || ''} IMO ${inv.vessel?.imo_number || ''}`, vesX + 3, vesY + 12);

    // Items table
    autoTable(doc, {
      startY: billY + 44,
      margin: { left: M, right: M },
      theme: 'grid',
      head: [['Description', 'Amount']],
      body: [[inv.description, `${fmt(+inv.amount)}`]],
      styles: { fontSize: 9, cellPadding: 4, textColor: DARK, lineColor: BORDER, lineWidth: 0.3 },
      headStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: 'bold', lineColor: BORDER, lineWidth: 0.3 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    });

    // Total row
    const finalY = (doc as any).lastAutoTable.finalY + 2;
    doc.setFillColor(...TEAL);
    doc.rect(W - M - 80, finalY, 80, 10, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`Total   ${inv.currency === 'USD' ? '$' : inv.currency}${fmt(+inv.amount)}`, W - M - 4, finalY + 7, { align: 'right' });

    // Bank details box
    const bankY = finalY + 18;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(M, bankY - 2, W - M, bankY - 2);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text('Our Bank Full Style', M, bankY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    const bankLines = [
      `Bank Name : ${UME.bank_name}`,
      `Branch : ${UME.bank_branch}`,
      `IBAN: ${UME.iban} - ${inv.currency}`,
      `Swift : ${UME.swift}`,
      `Currency: ${inv.currency}`,
    ];
    bankLines.forEach((line, i) => doc.text(line, M, bankY + 10 + i * 5));

    // Bottom bar
    doc.setFillColor(...TEAL);
    doc.rect(0, 295, W, 2.5, 'F');

    doc.save(`${inv.invoice_number}.pdf`);
  }

  const displayed = filterStatus ? invoices.filter(i => i.status === filterStatus) : invoices;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">فواتير الإدارة</h2>
        <button onClick={openAdd} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700">+ فاتورة إدارة جديدة</button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {['', 'unpaid', 'partial', 'paid'].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${filterStatus === s ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}>
            {s === '' ? 'الكل' : statusLabel[s]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">رقم الفاتورة</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">المركب</th>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">المسدد</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-teal-700">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-gray-500">{inv.invoice_date?.slice(0,10)}</td>
                <td className="px-4 py-3 font-medium">{inv.vessel?.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{inv.description}</td>
                <td className="px-4 py-3 font-medium font-mono">{fmt(+inv.amount)} {inv.currency}</td>
                <td className="px-4 py-3 text-green-700 font-mono">{fmt(+inv.paid_amount)} {inv.currency}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[inv.status] || inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => setPreviewInv(inv)} className="text-teal-600 text-xs font-medium border border-teal-400 rounded px-1.5 py-0.5 hover:bg-teal-50">PDF</button>
                  <button onClick={() => setViewInv(inv)} className="text-purple-600 hover:underline text-xs">دفع</button>
                  <button onClick={() => openEdit(inv)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                  <button onClick={() => handleDelete(inv.id, inv.invoice_number)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {displayed.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editing ? 'تعديل فاتورة إدارة' : 'فاتورة إدارة جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">رقم الفاتورة *</label>
                  <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                    placeholder="CH-26-07-03"
                    className="w-full border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">تاريخ الفاتورة *</label>
                  <input type="date" value={form.invoice_date} onChange={(e) => {
                    const d = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      invoice_date: d,
                      description: (!prev.description || prev.description === autoDescription(prev.invoice_date))
                        ? autoDescription(d)
                        : prev.description,
                    }));
                  }}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">المركب *</label>
                  <select value={form.vessel_id} onChange={(e) => setForm({ ...form, vessel_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">— اختر المركب —</option>
                    {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">العملة</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">الوصف *</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Commercial / Operation Management fees July 2026"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">المبلغ *</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="15000"
                  className="w-full border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm px-6 pb-2">{error}</p>}
            <div className="border-t px-6 py-4 flex gap-2">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewInv && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">معاينة — {previewInv.invoice_number}</h3>
              <div className="flex gap-2">
                <button onClick={() => { exportPDF(previewInv); setPreviewInv(null); }}
                  className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-teal-700">
                  ⬇ تنزيل PDF
                </button>
                <button onClick={() => setPreviewInv(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>
            <div className="font-sans text-sm" dir="ltr">
              {/* Top bar */}
              <div className="h-1.5 bg-teal-600 rounded-t-none" />
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <p className="text-xl font-bold text-teal-600">{UME.name}</p>
                    <p className="text-gray-500 text-xs whitespace-pre-line mt-1">{UME.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-teal-600 mb-2">Tax Invoice</p>
                    <table className="border-collapse text-xs ml-auto">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-600">Date</th>
                          <th className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-600">Invoice #</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-200 px-3 py-1.5">{previewInv.invoice_date?.slice(0,10)}</td>
                          <td className="border border-gray-200 px-3 py-1.5 font-mono">{previewInv.invoice_number}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-gray-400 text-xs italic mt-2 text-right">VAT #{UME.vat}</p>
                  </div>
                </div>

                <hr className="border-gray-200 mb-5" />

                {/* Bill To + Vessel */}
                <div className="flex gap-4 mb-6">
                  <div className="border border-gray-200 rounded-lg p-4 flex-1 bg-gray-50">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Bill To</p>
                    <p className="font-semibold text-gray-900">{previewInv.vessel?.owner_name || '—'}</p>
                    <p className="text-gray-500 text-xs whitespace-pre-line mt-1">{previewInv.vessel?.owner_address || ''}</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4 w-56 bg-gray-50">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Vessel Name</p>
                    <p className="font-semibold text-gray-900">{previewInv.vessel?.name} IMO {previewInv.vessel?.imo_number}</p>
                  </div>
                </div>

                {/* Items */}
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-2.5 font-semibold text-gray-600 text-left">Description</th>
                      <th className="border border-gray-200 px-4 py-2.5 font-semibold text-gray-600 text-right w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-4 py-4 text-gray-700">{previewInv.description}</td>
                      <td className="border border-gray-200 px-4 py-4 text-right font-mono text-gray-800">{fmt(+previewInv.amount)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Total */}
                <div className="flex justify-end mt-3">
                  <div className="bg-teal-600 text-white px-6 py-3 rounded-lg">
                    <span className="text-sm font-bold tracking-wide">
                      Total&nbsp;&nbsp;{previewInv.currency === 'USD' ? '$' : previewInv.currency}{fmt(+previewInv.amount)}
                    </span>
                  </div>
                </div>

                {/* Bank details */}
                <div className="mt-8 pt-5 border-t border-gray-200">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Our Bank Full Style</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>Bank Name : <span className="text-gray-800 font-medium">{UME.bank_name}</span></p>
                    <p>Branch : <span className="text-gray-800">{UME.bank_branch}</span></p>
                    <p>IBAN: <span className="font-mono text-gray-800">{UME.iban}</span> - {previewInv.currency}</p>
                    <p>Swift : <span className="font-mono text-gray-800">{UME.swift}</span></p>
                    <p>Currency: <span className="text-gray-800 font-medium">{previewInv.currency}</span></p>
                  </div>
                </div>
              </div>
              <div className="h-1.5 bg-teal-600" />
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {viewInv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">المدفوعات</h3>
                <p className="text-sm text-gray-500">{viewInv.invoice_number} — {viewInv.vessel?.name}</p>
              </div>
              <button onClick={() => setViewInv(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">الإجمالي</p>
                  <p className="font-bold font-mono">{fmt(+viewInv.amount)} {viewInv.currency}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">المسدد</p>
                  <p className="font-bold text-green-700 font-mono">{fmt(+viewInv.paid_amount)} {viewInv.currency}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">المتبقي</p>
                  <p className="font-bold text-red-700 font-mono">{fmt(+viewInv.amount - +viewInv.paid_amount)} {viewInv.currency}</p>
                </div>
              </div>

              {viewInv.payments?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">سجل المدفوعات</h4>
                  <div className="space-y-2">
                    {viewInv.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium font-mono">{fmt(+p.amount)} {p.currency}</span>
                          <span className="text-gray-500 mr-2">{p.payment_date?.slice(0,10)}</span>
                          {p.reference && <span className="text-gray-400 text-xs">({p.reference})</span>}
                        </div>
                        <button onClick={() => handleDeletePayment(p.id)} className="text-red-400 hover:text-red-600 text-xs">حذف</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">إضافة دفعة</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">تاريخ الدفع</label>
                    <input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المبلغ</label>
                    <input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">العملة</label>
                    <select value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المرجع</label>
                    <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
                <button onClick={handleAddPayment} disabled={payLoading || !payForm.amount || !payForm.payment_date}
                  className="w-full mt-3 bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm">
                  {payLoading ? 'جاري الحفظ...' : 'تسجيل الدفعة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
