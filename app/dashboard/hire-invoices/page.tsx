'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';

interface HireInvoice {
  id: string; invoice_number: string; invoice_date: string; status: string;
  currency: string; total_amount: number; paid_amount: number;
  place_of_business: string; cp_date: string; hire_from: string; hire_to: string;
  notes: string;
  customer: { id: string; name: string; address: string; vat_no: string };
  vessel: { id: string; name: string; imo_number: string };
  shipping_company: { id: string; name: string; address: string; bank_name: string; acc_name: string; iban_eur: string; iban_usd: string; swift_code: string };
  items: { id: string; days: number; description: string; daily_hire: number; amount: number; sort_order: number }[];
  payments: { id: string; payment_date: string; amount: number; currency: string; reference: string }[];
}

const emptyForm = {
  invoice_number: '', invoice_date: '', customer_id: '', vessel_id: '', shipping_company_id: '',
  place_of_business: '', cp_date: '', hire_from: '', hire_to: '',
  hire_from_date: '', hire_from_time: '00:00',
  hire_to_date: '', hire_to_time: '23:59',
  currency: 'EUR', total_amount: '0', status: 'unpaid', notes: '',
};
const emptyItem = { days: '', description: '', daily_hire: '', amount: '' };

const statusLabel: Record<string, string> = { unpaid: 'غير مسددة', partial: 'مسددة جزئياً', paid: 'مسددة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700' };

function fmt(n: number) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function HireInvoicesPage() {
  const [invoices, setInvoices] = useState<HireInvoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HireInvoice | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewInv, setViewInv] = useState<HireInvoice | null>(null);
  const [previewInv, setPreviewInv] = useState<HireInvoice | null>(null);
  const [payForm, setPayForm] = useState({ payment_date: '', amount: '', currency: 'EUR', reference: '', notes: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  async function load() {
    const [invRes, custRes, vesRes, compRes] = await Promise.all([
      api.get('/api/hire-invoices'),
      api.get('/api/customers'),
      api.get('/api/vessels'),
      api.get('/api/shipping-companies'),
    ]);
    setInvoices(invRes.data);
    setCustomers(custRes.data);
    setVessels(vesRes.data);
    setCompanies(compRes.data);
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setItems([{ ...emptyItem }]);
    setError('');
    setShowModal(true);
  }

  function openEdit(inv: HireInvoice) {
    setEditing(inv);
    setForm({
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date?.slice(0, 10) || '',
      customer_id: inv.customer?.id || '',
      vessel_id: inv.vessel?.id || '',
      shipping_company_id: inv.shipping_company?.id || '',
      place_of_business: inv.place_of_business || '',
      cp_date: inv.cp_date?.slice(0, 10) || '',
      hire_from: inv.hire_from ? inv.hire_from.slice(0, 16) : '',
      hire_to: inv.hire_to ? inv.hire_to.slice(0, 16) : '',
      hire_from_date: inv.hire_from ? inv.hire_from.slice(0, 10) : '',
      hire_from_time: inv.hire_from ? inv.hire_from.slice(11, 16) || '00:00' : '00:00',
      hire_to_date: inv.hire_to ? inv.hire_to.slice(0, 10) : '',
      hire_to_time: inv.hire_to ? inv.hire_to.slice(11, 16) || '23:59' : '23:59',
      currency: inv.currency || 'EUR',
      total_amount: String(inv.total_amount),
      status: inv.status,
      notes: inv.notes || '',
    });
    setItems(inv.items?.length ? inv.items.map(it => ({
      days: String(it.days || ''), description: it.description, daily_hire: String(it.daily_hire || ''), amount: String(it.amount)
    })) : [{ ...emptyItem }]);
    setError('');
    setShowModal(true);
  }

  function onVesselChange(vesselId: string) {
    const vessel = vessels.find((v) => v.id === vesselId);
    const autoCompany = vessel?.shipping_company_id
      ? companies.find((c) => c.id === vessel.shipping_company_id)
      : null;
    setForm((prev) => ({
      ...prev,
      vessel_id: vesselId,
      shipping_company_id: autoCompany ? autoCompany.id : prev.shipping_company_id,
    }));
  }

  function calcTotal() {
    return items.reduce((s, it) => {
      const amt = parseFloat(it.amount) || 0;
      return s + amt;
    }, 0);
  }

  function updateItem(idx: number, field: string, val: string) {
    const updated = items.map((it, i) => {
      if (i !== idx) return it;
      const newIt = { ...it, [field]: val };
      if ((field === 'days' || field === 'daily_hire') && newIt.days && newIt.daily_hire) {
        newIt.amount = String(parseFloat(newIt.days) * parseFloat(newIt.daily_hire));
      }
      return newIt;
    });
    setItems(updated);
    setForm((prev) => ({ ...prev, total_amount: String(updated.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)) }));
  }

  async function handleSave() {
    if (!form.invoice_number.trim()) { setError('رقم الفاتورة مطلوب'); return; }
    if (!form.customer_id) { setError('العميل مطلوب'); return; }
    if (!form.vessel_id) { setError('السفينة مطلوبة'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        hire_from: form.hire_from_date ? `${form.hire_from_date}T${form.hire_from_time || '00:00'}` : null,
        hire_to: form.hire_to_date ? `${form.hire_to_date}T${form.hire_to_time || '23:59'}` : null,
        total_amount: calcTotal(),
        items: items.filter(it => it.description).map((it, i) => ({
          days: it.days ? parseInt(it.days) : null,
          description: it.description,
          daily_hire: it.daily_hire ? parseFloat(it.daily_hire) : null,
          amount: parseFloat(it.amount) || 0,
          sort_order: i,
        })),
      };
      if (editing) await api.put(`/api/hire-invoices/${editing.id}`, payload);
      else await api.post('/api/hire-invoices', payload);
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string, num: string) {
    if (!confirm(`حذف الفاتورة "${num}"؟`)) return;
    await api.delete(`/api/hire-invoices/${id}`);
    load();
  }

  async function handleAddPayment() {
    if (!payForm.payment_date || !payForm.amount) return;
    setPayLoading(true);
    try {
      const updated = await api.post(`/api/hire-invoices/${viewInv!.id}/payments`, payForm);
      setViewInv(updated.data);
      setPayForm({ payment_date: '', amount: '', currency: 'EUR', reference: '', notes: '' });
      load();
    } finally { setPayLoading(false); }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!confirm('حذف هذا الدفع؟')) return;
    const updated = await api.delete(`/api/hire-invoices/${viewInv!.id}/payments/${paymentId}`);
    const refreshed = await api.get(`/api/hire-invoices/${viewInv!.id}`);
    setViewInv(refreshed.data);
    load();
  }

  async function exportPDF(inv: HireInvoice) {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210; const M = 15;

    // Header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.shipping_company?.name || '', M, 20);
    doc.text(inv.shipping_company?.address || '', M, 26);

    // Invoice box top right
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice', W - M, 18, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: 22,
      margin: { left: W - 70, right: M },
      theme: 'grid',
      head: [['Date', 'Invoice #']],
      body: [[inv.invoice_date?.slice(0, 10) || '', inv.invoice_number]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    });

    // Bill To box
    const billToY = 45;
    doc.setDrawColor(180, 180, 180);
    doc.rect(M, billToY, 95, 35);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To', M + 2, billToY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const custLines = [
      `Messrs: ${inv.customer?.name || ''}`,
      ...(inv.customer?.address || '').split('\n'),
      inv.customer?.vat_no ? `VAT NO  ${inv.customer.vat_no}` : 'VAT NO',
    ];
    custLines.forEach((line, i) => doc.text(line, M + 2, billToY + 11 + i * 5));

    // Header table
    const hireFrom = inv.hire_from ? new Date(inv.hire_from).toLocaleDateString('en-GB').replace(/\//g, '-') + '\nUTC 00:00' : '';
    const hireTo = inv.hire_to ? new Date(inv.hire_to).toLocaleDateString('en-GB').replace(/\//g, '-') + '\nUTC 23:59' : '';

    autoTable(doc, {
      startY: 85,
      margin: { left: M, right: M },
      theme: 'grid',
      head: [['Place of Business', 'CP Date', 'Hire From', 'Hire To', 'Vessel']],
      body: [[
        inv.place_of_business || '',
        inv.cp_date?.slice(0, 10) || '',
        hireFrom,
        hireTo,
        `${inv.vessel?.name || ''}\nIMO:${inv.vessel?.imo_number || ''}`,
      ]],
      styles: { fontSize: 9, halign: 'center', cellPadding: 3 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      columnStyles: { 4: { halign: 'center' } },
    });

    // Items table
    const itemRows = (inv.items || []).map(it => [
      it.days ? String(it.days) : '',
      it.description,
      it.daily_hire ? fmt(+it.daily_hire) : '',
      fmt(+it.amount),
    ]);
    itemRows.push(['', 'We appreciate your prompt payment.', '', '']);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY,
      margin: { left: M, right: M },
      theme: 'grid',
      head: [['Days', 'Description', 'Daily Hire', 'Amount']],
      body: itemRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      columnStyles: { 0: { halign: 'center', cellWidth: 15 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 } },
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total ${inv.currency} ${fmt(+inv.total_amount)}`, W - M, finalY + 8, { align: 'right' });

    // Bank details
    const bankY = finalY + 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Our Bank Details', M, bankY);
    doc.text(`Bank Name: ${inv.shipping_company?.bank_name || ''}`, M, bankY + 5);
    doc.text(`Acc. Name: ${inv.shipping_company?.acc_name || ''}`, M, bankY + 10);
    doc.text(`IBAN: ${inv.shipping_company?.iban_eur || ''}  EURO`, M, bankY + 15);
    doc.text(`Swift Code : ${inv.shipping_company?.swift_code || ''}`, M, bankY + 20);

    doc.save(`${inv.invoice_number}.pdf`);
  }

  const displayed = filterStatus ? invoices.filter(i => i.status === filterStatus) : invoices;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">فواتير الإيجار</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">+ فاتورة إيجار جديدة</button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {['', 'unpaid', 'partial', 'paid'].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
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
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">السفينة</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">المسدد</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-blue-700">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-gray-500">{inv.invoice_date?.slice(0, 10)}</td>
                <td className="px-4 py-3">{inv.customer?.name}</td>
                <td className="px-4 py-3">{inv.vessel?.name}</td>
                <td className="px-4 py-3 font-medium">{fmt(+inv.total_amount)} {inv.currency}</td>
                <td className="px-4 py-3 text-green-700">{fmt(+inv.paid_amount)} {inv.currency}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[inv.status] || inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => setPreviewInv(inv)} className="text-green-600 hover:underline text-xs font-medium border border-green-400 rounded px-1">PDF</button>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editing ? 'تعديل فاتورة إيجار' : 'فاتورة إيجار جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">رقم الفاتورة *</label>
                  <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                    placeholder="ZA-26-07-02"
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">تاريخ الفاتورة *</label>
                  <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">العميل *</label>
                  <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر العميل —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">السفينة *</label>
                  <select value={form.vessel_id} onChange={(e) => onVesselChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر السفينة —</option>
                    {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">شركة الشحن (Owner) *</label>
                  <select value={form.shipping_company_id} onChange={(e) => setForm({ ...form, shipping_company_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر شركة الشحن —</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Charter party details */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Place of Business</label>
                  <select value={form.place_of_business} onChange={(e) => setForm({ ...form, place_of_business: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر —</option>
                    <option value="Spain">Spain</option>
                    <option value="Cyprus">Cyprus</option>
                    <option value="Morocco">Morocco</option>
                    <option value="Egypt">Egypt</option>
                    <option value="UAE">UAE</option>
                    <option value="Greece">Greece</option>
                    <option value="Malta">Malta</option>
                    <option value="Panama">Panama</option>
                    <option value="Liberia">Liberia</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">CP Date</label>
                  <input type="date" value={form.cp_date} onChange={(e) => setForm({ ...form, cp_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Hire From</label>
                  <div className="flex gap-2">
                    <input type="date" value={form.hire_from_date}
                      onChange={(e) => setForm({ ...form, hire_from_date: e.target.value })}
                      className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="time" value={form.hire_from_time}
                      onChange={(e) => setForm({ ...form, hire_from_time: e.target.value })}
                      className="w-24 border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="00:00" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">UTC — افتراضي: 00:00</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Hire To</label>
                  <div className="flex gap-2">
                    <input type="date" value={form.hire_to_date}
                      onChange={(e) => setForm({ ...form, hire_to_date: e.target.value })}
                      className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="time" value={form.hire_to_time}
                      onChange={(e) => setForm({ ...form, hire_to_time: e.target.value })}
                      className="w-24 border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="23:59" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">UTC — افتراضي: 23:59</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">العملة</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Line items */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">بنود الفاتورة</label>
                  <button type="button" onClick={() => setItems([...items, { ...emptyItem }])}
                    className="text-xs text-blue-600 hover:underline">+ إضافة بند</button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 px-1">
                    <span className="col-span-1">أيام</span>
                    <span className="col-span-6">الوصف</span>
                    <span className="col-span-2">Daily Hire</span>
                    <span className="col-span-2">المبلغ</span>
                    <span className="col-span-1"></span>
                  </div>
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1">
                      <input value={it.days} onChange={(e) => updateItem(idx, 'days', e.target.value)}
                        placeholder="15" type="number"
                        className="col-span-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder="MV-Wasa Express Hire for 15 Days..."
                        className="col-span-6 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <input value={it.daily_hire} onChange={(e) => updateItem(idx, 'daily_hire', e.target.value)}
                        placeholder="21,000" type="number"
                        className="col-span-2 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <input value={it.amount} onChange={(e) => {
                        const updated = items.map((it2, i) => i === idx ? { ...it2, amount: e.target.value } : it2);
                        setItems(updated);
                        setForm((prev) => ({ ...prev, total_amount: String(updated.reduce((s, it2) => s + (parseFloat(it2.amount) || 0), 0)) }));
                      }}
                        placeholder="0.00" type="number"
                        className="col-span-2 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-3 font-bold text-gray-700">
                  الإجمالي: {fmt(calcTotal())} {form.currency}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm px-6 pb-2">{error}</p>}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-2">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
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
              <h3 className="font-bold text-gray-800">معاينة الفاتورة — {previewInv.invoice_number}</h3>
              <div className="flex gap-2">
                <button onClick={() => { exportPDF(previewInv); setPreviewInv(null); }}
                  className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700">
                  ⬇ تنزيل PDF
                </button>
                <button onClick={() => setPreviewInv(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>
            <div className="p-8 font-mono text-sm" dir="ltr">
              {/* Company header */}
              <div className="mb-6">
                <p className="font-bold text-base">{previewInv.shipping_company?.name}</p>
                <p className="text-gray-600 whitespace-pre-line">{previewInv.shipping_company?.address}</p>
              </div>

              {/* Invoice title + date/number box */}
              <div className="flex justify-between items-start mb-6">
                <div className="border p-3 w-64">
                  <p className="font-bold text-xs text-gray-500 mb-1">Bill To</p>
                  <p className="font-bold">Messrs: {previewInv.customer?.name}</p>
                  <p className="text-gray-600 text-xs whitespace-pre-line">{previewInv.customer?.address}</p>
                  <p className="text-gray-600 text-xs mt-1">VAT NO  {previewInv.customer?.vat_no || ''}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-center mb-2">Invoice</p>
                  <table className="border border-collapse text-xs">
                    <thead><tr><th className="border px-3 py-1">Date</th><th className="border px-3 py-1">Invoice #</th></tr></thead>
                    <tbody><tr><td className="border px-3 py-1">{previewInv.invoice_date?.slice(0,10)}</td><td className="border px-3 py-1">{previewInv.invoice_number}</td></tr></tbody>
                  </table>
                </div>
              </div>

              {/* Charter party header table */}
              <table className="w-full border border-collapse text-xs mb-0">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1">Place of Business</th>
                    <th className="border px-2 py-1">CP Date</th>
                    <th className="border px-2 py-1">Hire From</th>
                    <th className="border px-2 py-1">Hire To</th>
                    <th className="border px-2 py-1">Vessel</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-center">
                    <td className="border px-2 py-2">{previewInv.place_of_business || '—'}</td>
                    <td className="border px-2 py-2">{previewInv.cp_date?.slice(0,10) || '—'}</td>
                    <td className="border px-2 py-2">
                      {previewInv.hire_from ? new Date(previewInv.hire_from).toLocaleDateString('en-GB').replace(/\//g,'-') : '—'}<br/>
                      <span className="text-gray-500">UTC 00:00</span>
                    </td>
                    <td className="border px-2 py-2">
                      {previewInv.hire_to ? new Date(previewInv.hire_to).toLocaleDateString('en-GB').replace(/\//g,'-') : '—'}<br/>
                      <span className="text-gray-500">UTC 23:59</span>
                    </td>
                    <td className="border px-2 py-2 font-bold">
                      {previewInv.vessel?.name}<br/>
                      <span className="font-normal text-gray-500">IMO:{previewInv.vessel?.imo_number}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Items table */}
              <table className="w-full border border-collapse text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 w-12">Days</th>
                    <th className="border px-2 py-1 text-left">Description</th>
                    <th className="border px-2 py-1 w-24 text-right">Daily Hire</th>
                    <th className="border px-2 py-1 w-28 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewInv.items?.map((it, i) => (
                    <tr key={i}>
                      <td className="border px-2 py-3 text-center">{it.days || ''}</td>
                      <td className="border px-2 py-3">{it.description}</td>
                      <td className="border px-2 py-3 text-right">{it.daily_hire ? fmt(+it.daily_hire) : ''}</td>
                      <td className="border px-2 py-3 text-right">{fmt(+it.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="border px-2 py-3 text-gray-500 italic">We appreciate your prompt payment.</td>
                    <td className="border px-2 py-3 text-right font-bold" colSpan={2}>
                      Total {previewInv.currency} {fmt(+previewInv.total_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Bank details */}
              <div className="mt-6 text-xs text-gray-700 space-y-0.5">
                <p className="font-bold">Our Bank Details</p>
                <p>Bank Name: {previewInv.shipping_company?.bank_name}</p>
                <p>Acc. Name: {previewInv.shipping_company?.acc_name}</p>
                <p>IBAN: {previewInv.shipping_company?.iban_eur}  EURO</p>
                <p>Swift Code : {previewInv.shipping_company?.swift_code}</p>
              </div>
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
                <p className="text-sm text-gray-500">{viewInv.invoice_number} — {viewInv.customer?.name}</p>
              </div>
              <button onClick={() => setViewInv(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">الإجمالي</p>
                  <p className="font-bold">{fmt(+viewInv.total_amount)} {viewInv.currency}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">المسدد</p>
                  <p className="font-bold text-green-700">{fmt(+viewInv.paid_amount)} {viewInv.currency}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">المتبقي</p>
                  <p className="font-bold text-red-700">{fmt(+viewInv.total_amount - +viewInv.paid_amount)} {viewInv.currency}</p>
                </div>
              </div>

              {/* Payments list */}
              {viewInv.payments?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">سجل المدفوعات</h4>
                  <div className="space-y-2">
                    {viewInv.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{fmt(+p.amount)} {p.currency}</span>
                          <span className="text-gray-500 mr-2">{p.payment_date?.slice(0, 10)}</span>
                          {p.reference && <span className="text-gray-400 text-xs">({p.reference})</span>}
                        </div>
                        <button onClick={() => handleDeletePayment(p.id)} className="text-red-400 hover:text-red-600 text-xs">حذف</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add payment */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">إضافة دفعة</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">تاريخ الدفع</label>
                    <input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المبلغ</label>
                    <input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">العملة</label>
                    <select value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المرجع</label>
                    <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <button onClick={handleAddPayment} disabled={payLoading || !payForm.amount || !payForm.payment_date}
                  className="w-full mt-3 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
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
