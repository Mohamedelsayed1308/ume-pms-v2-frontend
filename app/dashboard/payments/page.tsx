'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_type: string;
  payment_method: string;
  reference: string;
  notes: string;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    supplier: { name: string };
    vessel: { name: string };
  };
}

const empty = {
  invoice_id: '', amount: '', currency: 'USD',
  payment_type: 'installment', payment_method: 'bank_transfer',
  payment_date: '', reference: '', notes: '',
};

const typeLabel: Record<string, string> = { advance: 'مقدم', installment: 'قسط', full: 'سداد كامل' };
const methodLabel: Record<string, string> = { bank_transfer: 'تحويل بنكي', cheque: 'شيك', cash: 'نقدي' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [payRes, invRes, supRes] = await Promise.all([
      api.get('/api/payments'),
      api.get('/api/invoices'),
      api.get('/api/suppliers'),
    ]);
    setPayments(payRes.data);
    setAllInvoices(invRes.data.filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled'));
    setSuppliers(supRes.data);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm(empty);
    setSelectedInvoice(null);
    setSelectedSupplierId('');
    setSupplierInvoices([]);
    setAttachments([]);
    setError('');
    setShowModal(true);
  }

  function onSupplierChange(supplierId: string) {
    setSelectedSupplierId(supplierId);
    setSelectedInvoice(null);
    setForm({ ...empty, invoice_id: '' });
    const filtered = allInvoices.filter((i) => i.supplier?.id === supplierId);
    setSupplierInvoices(filtered);
  }

  async function onInvoiceChange(id: string) {
    const inv = supplierInvoices.find((i) => i.id === id);
    setSelectedInvoice(inv || null);
    const remaining = inv ? +inv.total_amount - +inv.paid_amount : 0;
    setForm({ ...form, invoice_id: id, amount: remaining > 0 ? String(remaining) : '', currency: inv?.currency || 'USD' });
    if (id) {
      const res = await api.get(`/api/attachments/invoice/${id}`);
      setAttachments(res.data);
    } else {
      setAttachments([]);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0] || !form.invoice_id) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);
    await api.post(`/api/attachments/invoice/${form.invoice_id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const res = await api.get(`/api/attachments/invoice/${form.invoice_id}`);
    setAttachments(res.data);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDeleteAttachment(id: string) {
    if (!confirm('حذف المرفق؟')) return;
    await api.delete(`/api/attachments/${id}`);
    const res = await api.get(`/api/attachments/invoice/${form.invoice_id}`);
    setAttachments(res.data);
  }

  function getFileIcon(mimetype: string) {
    if (mimetype?.includes('pdf')) return '📄';
    if (mimetype?.includes('image')) return '🖼️';
    if (mimetype?.includes('excel') || mimetype?.includes('spreadsheet')) return '📊';
    if (mimetype?.includes('word')) return '📝';
    return '📎';
  }

  async function handleSave() {
    if (!form.invoice_id) { setError('الفاتورة مطلوبة'); return; }
    if (!form.amount || +form.amount <= 0) { setError('المبلغ مطلوب'); return; }
    if (!form.payment_date) { setError('تاريخ الدفع مطلوب'); return; }
    setLoading(true);
    try {
      await api.post('/api/payments', { ...form, amount: parseFloat(form.amount), reference: form.reference || null, notes: form.notes || null });
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذه الدفعة؟')) return;
    await api.delete(`/api/payments/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">المدفوعات</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + تسجيل دفعة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3">الفاتورة</th>
              <th className="px-4 py-3">المورد</th>
              <th className="px-4 py-3">السفينة</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">نوع الدفع</th>
              <th className="px-4 py-3">طريقة الدفع</th>
              <th className="px-4 py-3">المرجع</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">حالة الفاتورة</th>
              <th className="px-4 py-3">حذف</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700">{p.invoice?.invoice_number}</td>
                <td className="px-4 py-3">{p.invoice?.supplier?.name || '—'}</td>
                <td className="px-4 py-3">{p.invoice?.vessel?.name || '—'}</td>
                <td className="px-4 py-3 font-medium">{Number(p.amount).toLocaleString()} {p.currency}</td>
                <td className="px-4 py-3">{typeLabel[p.payment_type]}</td>
                <td className="px-4 py-3">{methodLabel[p.payment_method]}</td>
                <td className="px-4 py-3 text-gray-500">{p.reference || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.payment_date?.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${statusColor[p.invoice?.status]}`}>
                    {statusLabel[p.invoice?.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:underline text-xs">حذف</button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">لا توجد مدفوعات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-lg mb-4">تسجيل دفعة</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <select value={selectedSupplierId} onChange={(e) => onSupplierChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {selectedSupplierId && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">الفاتورة *</label>
                  <select value={form.invoice_id} onChange={(e) => onInvoiceChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={supplierInvoices.length === 0}>
                    <option value="">
                      {supplierInvoices.length === 0 ? '— لا توجد فواتير مستحقة —' : '— اختر الفاتورة —'}
                    </option>
                    {supplierInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedInvoice && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">المركب:</span>
                    <span className="font-medium">{selectedInvoice.vessel?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">إجمالي الفاتورة:</span>
                    <span className="font-medium">{Number(selectedInvoice.total_amount).toLocaleString()} {selectedInvoice.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">المدفوع:</span>
                    <span className="text-green-600">{Number(selectedInvoice.paid_amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">المتبقي:</span>
                    <span className="text-red-600 font-bold">{(+selectedInvoice.total_amount - +selectedInvoice.paid_amount).toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">المبلغ *</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">العملة</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="EGP">EGP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">نوع الدفع</label>
                  <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="advance">مقدم</option>
                    <option value="installment">قسط</option>
                    <option value="full">سداد كامل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">طريقة الدفع</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="cheque">شيك</option>
                    <option value="cash">نقدي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">تاريخ الدفع *</label>
                <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">رقم المرجع / التحويل</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Attachments */}
              {form.invoice_id && (
                <div className="border-t pt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">📎 المرفقات</label>
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center mb-2">
                    <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" id="pay-file-upload"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
                    <label htmlFor="pay-file-upload" className="cursor-pointer text-sm text-blue-600 hover:underline">
                      {uploading ? 'جاري الرفع...' : '+ رفع ملف (PDF, صورة, Excel)'}
                    </label>
                  </div>
                  {attachments.length > 0 && (
                    <div className="space-y-1">
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                          <a href={att.url || `https://ume-pms-v2-backend-production.up.railway.app/uploads/${att.filename}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                            <span>{getFileIcon(att.mimetype)}</span>
                            <span>{att.original_name}</span>
                            <span className="text-gray-400 text-xs">({(att.size / 1024).toFixed(0)} KB)</span>
                          </a>
                          <button onClick={() => handleDeleteAttachment(att.id)} className="text-red-400 hover:text-red-600 text-xs">حذف</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attachments.length === 0 && <p className="text-xs text-gray-400 text-center">لا توجد مرفقات</p>}
                </div>
              )}
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
