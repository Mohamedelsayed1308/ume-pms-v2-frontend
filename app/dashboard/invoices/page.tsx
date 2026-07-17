'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';

interface Invoice {
  id: string;
  invoice_number: string;
  type: string;
  status: string;
  approval_status: string;
  comment: string;
  currency: string;
  total_amount: number;
  paid_amount: number;
  invoice_date: string;
  due_date: string;
  description: string;
  supplier: { id: string; name: string };
  vessel: { id: string; name: string };
  purchase_order: { id: string; po_number: string };
}

const empty = {
  invoice_number: '', supplier_id: '', vessel_id: '', po_id: '',
  type: 'preliminary', currency: 'USD', total_amount: '',
  invoice_date: '', due_date: '', description: '', notes: '',
  approval_status: '', comment: '',
};

const approvalLabel: Record<string, string> = { waiting_po: 'Waiting PO', send_to_pay: 'Send to Pay', hold: 'Hold' };
const approvalColor: Record<string, string> = { waiting_po: 'bg-orange-100 text-orange-700', send_to_pay: 'bg-blue-100 text-blue-700', hold: 'bg-red-100 text-red-700' };

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'مدفوعة جزئياً', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const typeLabel: Record<string, string> = { preliminary: 'أولية', final: 'نهائية' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [filteredPos, setFilteredPos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [attachModal, setAttachModal] = useState<Invoice | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [invRes, supRes, vesRes, poRes] = await Promise.all([
      api.get('/api/invoices'),
      api.get('/api/suppliers'),
      api.get('/api/vessels'),
      api.get('/api/purchase-orders'),
    ]);
    setInvoices(invRes.data);
    setSuppliers(supRes.data);
    setVessels(vesRes.data);
    setPos(poRes.data);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (form.supplier_id) {
      setFilteredPos(pos.filter((p) => p.supplier?.id === form.supplier_id));
    } else {
      setFilteredPos(pos);
    }
  }, [form.supplier_id, pos]);

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setError('');
    setShowModal(true);
  }

  function openEdit(inv: Invoice) {
    setEditing(inv);
    setForm({
      invoice_number: inv.invoice_number,
      supplier_id: inv.supplier?.id || '',
      vessel_id: inv.vessel?.id || '',
      po_id: inv.purchase_order?.id || '',
      type: inv.type,
      currency: inv.currency,
      total_amount: String(inv.total_amount),
      invoice_date: inv.invoice_date?.slice(0, 10) || '',
      due_date: inv.due_date?.slice(0, 10) || '',
      description: inv.description || '',
      notes: '',
      approval_status: inv.approval_status || '',
      comment: inv.comment || '',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.invoice_number.trim()) { setError('رقم الفاتورة مطلوب'); return; }
    if (!form.supplier_id) { setError('المورد مطلوب'); return; }
    if (!form.total_amount) { setError('المبلغ مطلوب'); return; }
    setLoading(true);
    try {
      const data = {
        ...form,
        total_amount: parseFloat(form.total_amount),
        vessel_id: form.vessel_id || null,
        po_id: form.po_id || null,
        invoice_date: form.invoice_date || null,
        due_date: form.due_date || null,
      };
      if (editing) {
        await api.put(`/api/invoices/${editing.id}`, data);
      } else {
        await api.post('/api/invoices', data);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, num: string) {
    if (!confirm(`هل تريد حذف الفاتورة "${num}"؟`)) return;
    try {
      await api.delete(`/api/invoices/${id}`);
      load();
    } catch {
      alert('لا يمكن الحذف — توجد مدفوعات مرتبطة بهذه الفاتورة');
    }
  }

  async function openAttachments(inv: Invoice) {
    setAttachModal(inv);
    const res = await api.get(`/api/attachments/invoice/${inv.id}`);
    setAttachments(res.data);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0] || !attachModal) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);
    await api.post(`/api/attachments/invoice/${attachModal.id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const res = await api.get(`/api/attachments/invoice/${attachModal.id}`);
    setAttachments(res.data);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleExtract(file: File) {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/invoices/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;
      setForm((prev) => ({
        ...prev,
        invoice_number: d.invoice_number || prev.invoice_number,
        total_amount: d.total_amount ? String(d.total_amount) : prev.total_amount,
        currency: d.currency || prev.currency,
        invoice_date: d.invoice_date || prev.invoice_date,
        due_date: d.due_date || prev.due_date,
        description: d.description || prev.description,
      }));
    } catch {
      alert('فشل استخراج البيانات — تأكد من وضوح الفاتورة');
    } finally {
      setExtracting(false);
    }
  }

  async function handleDeleteAttachment(id: string) {
    if (!confirm('حذف المرفق؟')) return;
    await api.delete(`/api/attachments/${id}`);
    const res = await api.get(`/api/attachments/invoice/${attachModal!.id}`);
    setAttachments(res.data);
  }

  function getFileIcon(mimetype: string) {
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('image')) return '🖼️';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('word')) return '📝';
    return '📎';
  }

  const displayed = filterStatus ? invoices.filter((i) => i.status === filterStatus) : invoices;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">الفواتير</h2>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + إضافة فاتورة
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['', 'unpaid', 'partial', 'paid', 'cancelled'].map((s) => (
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
              <th className="px-4 py-3">المورد</th>
              <th className="px-4 py-3">السفينة</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">المدفوع</th>
              <th className="px-4 py-3">المتبقي</th>
              <th className="px-4 py-3">الاستحقاق</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">حالة الموافقة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((inv) => {
              const remaining = +inv.total_amount - +inv.paid_amount;
              return (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.supplier?.name || '—'}</td>
                  <td className="px-4 py-3">{inv.vessel?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${inv.type === 'final' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {typeLabel[inv.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{Number(inv.total_amount).toLocaleString()} {inv.currency}</td>
                  <td className="px-4 py-3 text-green-600">{Number(inv.paid_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-red-600">{remaining.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{inv.due_date?.slice(0, 10) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${statusColor[inv.status]}`}>
                      {statusLabel[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={inv.approval_status || ''}
                      onChange={async (e) => {
                        await api.put(`/api/invoices/${inv.id}`, { approval_status: e.target.value || null });
                        load();
                      }}
                      className={`text-xs border rounded-full px-2 py-1 cursor-pointer focus:outline-none ${inv.approval_status ? approvalColor[inv.approval_status] : 'bg-gray-50 text-gray-500'}`}
                    >
                      <option value="">— بدون —</option>
                      <option value="waiting_po">Waiting PO</option>
                      <option value="send_to_pay">Send to Pay</option>
                      <option value="hold">Hold</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(inv)} className="text-blue-600 hover:underline text-xs">تعديل</button>
                    <button onClick={() => openAttachments(inv)} className="text-green-600 hover:underline text-xs">📎 مرفقات</button>
                    <button onClick={() => handleDelete(inv.id, inv.invoice_number)} className="text-red-500 hover:underline text-xs">حذف</button>
                  </td>
                </tr>
              );
            })}
            {displayed.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editing ? 'تعديل فاتورة' : 'إضافة فاتورة'}</h3>

            {/* AI Extract Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleExtract(file);
              }}
              onClick={() => extractRef.current?.click()}
              className={`mb-4 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
            >
              <input ref={extractRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => { if (e.target.files?.[0]) handleExtract(e.target.files[0]); }} />
              {extracting ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span className="text-sm font-medium">Claude يقرأ الفاتورة...</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl mb-1">🤖</div>
                  <p className="text-sm font-medium text-gray-700">اسحب صورة أو PDF الفاتورة هنا</p>
                  <p className="text-xs text-gray-400 mt-1">Claude سيستخرج البيانات تلقائياً • أو اضغط للاختيار</p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">رقم الفاتورة *</label>
                <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">نوع الفاتورة</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="preliminary">أولية</option>
                  <option value="final">نهائية</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value, po_id: '' })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">السفينة</label>
                <select value={form.vessel_id} onChange={(e) => setForm({ ...form, vessel_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر السفينة —</option>
                  {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">أمر الشراء</label>
                <select value={form.po_id} onChange={(e) => setForm({ ...form, po_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر أمر الشراء (اختياري) —</option>
                  {filteredPos.map((p) => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">المبلغ *</label>
                <input type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">العملة</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="USD">USD — دولار</option>
                  <option value="EUR">EUR — يورو</option>
                  <option value="EGP">EGP — جنيه</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">تاريخ الفاتورة</label>
                <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">تاريخ الاستحقاق</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">الوصف</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">حالة الموافقة</label>
                <select value={form.approval_status} onChange={(e) => setForm({ ...form, approval_status: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— بدون —</option>
                  <option value="waiting_po">Waiting PO</option>
                  <option value="send_to_pay">Send to Pay</option>
                  <option value="hold">Hold</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">تعليق</label>
                <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="أي ملاحظة..." />
              </div>
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
      {/* Attachments Modal */}
      {attachModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">مرفقات — {attachModal.invoice_number}</h3>
              <button onClick={() => setAttachModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center mb-4">
              <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" id="file-upload"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-3xl mb-2">📎</div>
                <p className="text-sm text-gray-600">
                  {uploading ? 'جاري الرفع...' : 'اضغط لرفع ملف'}
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF, صور, Excel, Word — حتى 10MB</p>
              </label>
            </div>

            {/* List */}
            {attachments.length === 0 ? (
              <p className="text-center text-gray-400 py-4">لا توجد مرفقات</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getFileIcon(att.mimetype)}</span>
                      <div>
                        <a href={`https://ume-pms-v2-backend-production.up.railway.app/uploads/${att.filename}`} target="_blank" rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline font-medium">
                          {att.original_name}
                        </a>
                        <p className="text-xs text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteAttachment(att.id)} className="text-red-400 hover:text-red-600 text-sm">حذف</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
