'use client';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';

const VESSEL_PREFIX: Record<string, string> = {
  '06': 'Alcudia Express',
  '07': 'Bridge',
  '04': 'Gubal Trader',
  '08': 'Monte Express',
  '01': 'Poseidon Express',
  '05': 'Wasa Express',
};

interface BulkItem {
  file: File;
  status: 'pending' | 'extracting' | 'ready' | 'saving' | 'saved' | 'error';
  data: {
    invoice_number: string; supplier_id: string; supplier_name: string;
    vessel_id: string; total_amount: string; currency: string;
    invoice_date: string; due_date: string; description: string;
    type: string; approval_status: string;
  };
  error: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  type: string;
  status: string;
  approval_status: string;
  approval_status_date: string;
  comment: string;
  currency: string;
  total_amount: number;
  paid_amount: number;
  invoice_date: string;
  due_date: string;
  description: string;
  created_by_name: string;
  supplier: { id: string; name: string };
  vessel: { id: string; name: string };
  purchase_order: { id: string; po_number: string };
}

const empty = {
  invoice_number: '', supplier_id: '', vessel_id: '', po_id: '',
  type: 'preliminary', currency: 'USD', total_amount: '',
  invoice_date: '', due_date: '', description: '', notes: '',
  approval_status: '', approval_status_date: '', comment: '',
};

const approvalLabel: Record<string, string> = {
  booking_waiting_payment: 'Booking - Waiting Payment',
  waiting_approval: 'Waiting Approval',
  waiting_po: 'Waiting PO',
  send_to_pay: 'Send to Pay',
  hold: 'Hold',
  delivery_missing: 'Delivery Missing',
  paid: 'Paid',
};
const approvalColor: Record<string, string> = {
  booking_waiting_payment: 'bg-sky-100 text-sky-700',
  waiting_approval: 'bg-yellow-100 text-yellow-700',
  waiting_po: 'bg-orange-100 text-orange-700',
  send_to_pay: 'bg-blue-100 text-blue-700',
  hold: 'bg-red-100 text-red-700',
  delivery_missing: 'bg-purple-100 text-purple-700',
  paid: 'bg-green-100 text-green-700',
};

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'مدفوعة جزئياً', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const typeLabel: Record<string, string> = { preliminary: 'أولية', final: 'نهائية' };

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filterPoId = searchParams.get('po_id') || '';
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [poManualMode, setPoManualMode] = useState(false);
  const [poManualNumber, setPoManualNumber] = useState('');
  const [poManualSaving, setPoManualSaving] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const supplierDropRef = useRef<HTMLDivElement>(null);

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
    function handleClickOutside(e: MouseEvent) {
      if (supplierDropRef.current && !supplierDropRef.current.contains(e.target as Node)) {
        setSupplierOpen(false);
        setSupplierSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setPoManualMode(false);
    setPoManualNumber('');
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
      approval_status_date: inv.approval_status_date?.slice(0, 10) || '',
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
      // إنشاء PO يدوي إن وُجد رقم مؤقت لم يُحفظ بعد
      let resolvedPoId = form.po_id;
      if (poManualNumber.trim() && !form.po_id) {
        const prefix = poManualNumber.split('-')[0]?.trim();
        const vesselName = prefix ? VESSEL_PREFIX[prefix] : null;
        let vesselId = form.vessel_id || null;
        if (vesselName) {
          const v = vessels.find((v: any) => v.name === vesselName);
          if (v) vesselId = v.id;
        }
        const newPo = await api.post('/api/purchase-orders', {
          po_number: poManualNumber.trim(),
          supplier_id: form.supplier_id || null,
          vessel_id: vesselId,
          description: form.description || '',
          order_date: form.invoice_date || null,
        });
        resolvedPoId = newPo.data.id;
        setPoManualNumber('');
      }

      const data = {
        ...form,
        total_amount: parseFloat(form.total_amount),
        vessel_id: form.vessel_id || null,
        po_id: resolvedPoId || null,
        invoice_date: form.invoice_date || null,
        due_date: form.due_date || null,
      };
      if (editing) {
        await api.put(`/api/invoices/${editing.id}`, data);
      } else {
        const res = await api.post('/api/invoices', data);
        const newInvoiceId = res.data.id;
        if (pendingFile && newInvoiceId) {
          const fd = new FormData();
          fd.append('file', pendingFile);
          await api.post(`/api/attachments/invoice/${newInvoiceId}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setPendingFile(null);
        }
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmManualPo() {
    if (!poManualNumber.trim()) return;
    const prefix = poManualNumber.split('-')[0]?.trim();
    const vesselName = prefix ? VESSEL_PREFIX[prefix] : null;
    let vesselId = form.vessel_id || '';
    if (vesselName) {
      const v = vessels.find((v: any) => v.name === vesselName);
      if (v) vesselId = v.id;
    }
    // حفظ مؤقت في state فقط — الإنشاء الفعلي عند حفظ الفاتورة
    setForm((prev) => ({ ...prev, vessel_id: vesselId || prev.vessel_id }));
    setPoManualMode(false);
  }

  async function handleDelete(id: string, num: string) {
    if (!confirm(`هل تريد حذف الفاتورة "${num}"؟`)) return;
    try {
      await api.delete(`/api/invoices/${id}`);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '';
      if (msg.toLowerCase().includes('payment') || msg.toLowerCase().includes('foreign') || msg.toLowerCase().includes('constraint')) {
        alert('لا يمكن الحذف — توجد مدفوعات مرتبطة بهذه الفاتورة');
      } else {
        alert('فشل الحذف: ' + (msg || 'خطأ غير معروف'));
      }
    }
  }

  async function openAttachments(inv: Invoice) {
    setAttachments([]);
    setAttachModal(inv);
    try {
      const res = await api.get(`/api/attachments/invoice/${inv.id}`);
      setAttachments(res.data);
    } catch {
      setAttachments([]);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0] || !attachModal) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      await api.post(`/api/attachments/invoice/${attachModal.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const res = await api.get(`/api/attachments/invoice/${attachModal.id}`);
      setAttachments(res.data);
    } catch (err: any) {
      alert('فشل رفع الملف: ' + (err?.response?.data?.message || err.message));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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

      let supplierId = '';
      if (d.supplier_name) {
        const existing = suppliers.find((s) =>
          s.name.toLowerCase().trim() === d.supplier_name.toLowerCase().trim()
        );
        if (existing) {
          supplierId = existing.id;
        } else {
          const newSup = await api.post('/api/suppliers', { name: d.supplier_name });
          supplierId = newSup.data.id;
          const supRes = await api.get('/api/suppliers');
          setSuppliers(supRes.data);
        }
      }

      let vesselId = '';
      if (d.vessel_name) {
        const existingVessel = vessels.find((v) =>
          v.name.toLowerCase().trim() === d.vessel_name.toLowerCase().trim()
        );
        if (existingVessel) vesselId = existingVessel.id;
      }

      let poId = '';
      let autoVesselId = vesselId;

      if (d.po_number) {
        // البحث عن PO موجود بنفس الرقم
        const existingPo = pos.find((p) =>
          p.po_number?.toLowerCase().trim() === d.po_number.toLowerCase().trim()
        );

        if (existingPo) {
          poId = existingPo.id;
          // استخدم مركب أمر الشراء الموجود إن لم يُحدَّد
          if (!autoVesselId && existingPo.vessel?.id) autoVesselId = existingPo.vessel.id;
        } else {
          // استخرج البادئة من رقم PO (أول رقمين قبل أول -)
          const prefix = d.po_number.split('-')[0]?.trim();
          const vesselName = prefix ? VESSEL_PREFIX[prefix] : null;
          let poVesselId = autoVesselId;
          if (vesselName) {
            const v = vessels.find((v: any) => v.name === vesselName);
            if (v) poVesselId = v.id;
          }

          // إنشاء أمر الشراء تلقائياً
          try {
            const newPo = await api.post('/api/purchase-orders', {
              po_number: d.po_number,
              supplier_id: supplierId || null,
              vessel_id: poVesselId || null,
              description: d.description || '',
              order_date: d.invoice_date || null,
            });
            poId = newPo.data.id;
            if (!autoVesselId && poVesselId) autoVesselId = poVesselId;
            // تحديث قائمة أوامر الشراء
            const poRes = await api.get('/api/purchase-orders');
            setPos(poRes.data);
          } catch {
            // في حال فشل الإنشاء، نتجاهل ونكمل
          }
        }
      }

      setForm((prev) => ({
        ...prev,
        invoice_number: d.invoice_number || prev.invoice_number,
        total_amount: d.total_amount ? String(d.total_amount) : prev.total_amount,
        currency: d.currency || prev.currency,
        invoice_date: d.invoice_date || prev.invoice_date,
        due_date: d.due_date || prev.due_date,
        description: d.description || prev.description,
        supplier_id: supplierId || prev.supplier_id,
        vessel_id: autoVesselId || prev.vessel_id,
        po_id: poId || prev.po_id,
      }));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'unknown error';
      alert('فشل استخراج البيانات: ' + msg);
    } finally {
      setExtracting(false);
    }
  }

  const emptyBulkData = () => ({
    invoice_number: '', supplier_id: '', supplier_name: '',
    vessel_id: '', total_amount: '', currency: 'USD',
    invoice_date: '', due_date: '', description: '',
    type: 'preliminary', approval_status: '',
  });

  async function processBulkFile(index: number, file: File, currentSuppliers: any[]) {
    setBulkItems((prev) => prev.map((it, i) => i === index ? { ...it, status: 'extracting' } : it));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/invoices/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;

      let supplierId = '';
      let supplierName = d.supplier_name || '';
      if (supplierName) {
        const existing = currentSuppliers.find(
          (s) => s.name.toLowerCase().trim() === supplierName.toLowerCase().trim()
        );
        if (existing) {
          supplierId = existing.id;
        } else {
          const newSup = await api.post('/api/suppliers', { name: supplierName });
          supplierId = newSup.data.id;
          const supRes = await api.get('/api/suppliers');
          setSuppliers(supRes.data);
          currentSuppliers = supRes.data;
        }
      }

      let vesselId = '';
      if (d.vessel_name) {
        const existing = vessels.find(
          (v) => v.name.toLowerCase().trim() === d.vessel_name.toLowerCase().trim()
        );
        if (existing) vesselId = existing.id;
      }

      setBulkItems((prev) => prev.map((it, i) =>
        i === index ? {
          ...it,
          status: 'ready',
          data: {
            invoice_number: d.invoice_number || '',
            supplier_id: supplierId,
            supplier_name: supplierName,
            vessel_id: vesselId,
            total_amount: d.total_amount ? String(d.total_amount) : '',
            currency: d.currency || 'USD',
            invoice_date: d.invoice_date || '',
            due_date: d.due_date || '',
            description: d.description || '',
            type: 'preliminary',
            approval_status: '',
          },
        } : it
      ));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'unknown';
      setBulkItems((prev) => prev.map((it, i) =>
        i === index ? { ...it, status: 'error', error: 'فشل: ' + msg } : it
      ));
    }
  }

  async function handleBulkFiles(files: File[]) {
    const newItems: BulkItem[] = files.map((file) => ({
      file, status: 'pending', data: emptyBulkData(), error: '',
    }));
    const startIndex = bulkItems.length;
    setBulkItems((prev) => [...prev, ...newItems]);
    const currentSuppliers = [...suppliers];
    await Promise.all(files.map((file, i) => processBulkFile(startIndex + i, file, currentSuppliers)));
  }

  async function handleBulkSaveAll() {
    const readyItems = bulkItems.filter((it) => it.status === 'ready');
    if (readyItems.length === 0) return;
    setSavingAll(true);
    for (let i = 0; i < bulkItems.length; i++) {
      const item = bulkItems[i];
      if (item.status !== 'ready') continue;
      setBulkItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'saving' } : it));
      try {
        const payload = {
          ...item.data,
          total_amount: parseFloat(item.data.total_amount) || 0,
          vessel_id: item.data.vessel_id || null,
          po_id: null,
          invoice_date: item.data.invoice_date || null,
          due_date: item.data.due_date || null,
        };
        const res = await api.post('/api/invoices', payload);
        const newInvoiceId = res.data.id;
        const fd = new FormData();
        fd.append('file', item.file);
        await api.post(`/api/attachments/invoice/${newInvoiceId}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBulkItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'saved' } : it));
      } catch (err: any) {
        setBulkItems((prev) => prev.map((it, idx) =>
          idx === i ? { ...it, status: 'error', error: err?.response?.data?.message || 'فشل الحفظ' } : it
        ));
      }
    }
    setSavingAll(false);
    load();
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

  const displayed = invoices
    .filter((i) => !filterStatus || i.status === filterStatus)
    .filter((i) => !filterPoId || i.purchase_order?.id === filterPoId);

  return (
    <div>
      {filterPoId && (
        <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
          <span>🔍 عرض فواتير أمر الشراء: <strong>{pos.find(p => p.id === filterPoId)?.po_number || filterPoId}</strong></span>
          <button onClick={() => router.push('/dashboard/invoices')} className="mr-auto text-blue-600 hover:underline text-xs">✕ إلغاء الفلتر</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">الفواتير</h2>
        <div className="flex gap-2">
          <button onClick={() => { setBulkItems([]); setShowBulkModal(true); }}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2">
            <span>⚡</span> رفع متعدد
          </button>
          <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + إضافة فاتورة
          </button>
        </div>
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
              <th className="px-4 py-3">أضافها</th>
              <th className="px-4 py-3">تعليق</th>
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
                    <div className="flex flex-col gap-1">
                      <select
                        value={inv.approval_status || ''}
                        onChange={async (e) => {
                          const newStatus = e.target.value || null;
                          const today = new Date().toISOString().slice(0, 10);
                          await api.put(`/api/invoices/${inv.id}`, {
                            approval_status: newStatus,
                            approval_status_date: newStatus ? today : null,
                          });
                          load();
                        }}
                        className={`text-xs border rounded-full px-2 py-1 cursor-pointer focus:outline-none ${inv.approval_status ? approvalColor[inv.approval_status] : 'bg-gray-50 text-gray-500'}`}
                      >
                        <option value="">— بدون —</option>
                        <option value="booking_waiting_payment">Booking - Waiting Payment</option>
                        <option value="waiting_approval">Waiting Approval</option>
                        <option value="waiting_po">Waiting PO</option>
                        <option value="send_to_pay">Send to Pay</option>
                        <option value="hold">Hold</option>
                        <option value="delivery_missing">Delivery Missing</option>
                        <option value="paid">Paid</option>
                      </select>
                      {inv.approval_status && (
                        <input
                          type="date"
                          value={inv.approval_status_date?.slice(0, 10) || ''}
                          onChange={async (e) => {
                            await api.put(`/api/invoices/${inv.id}`, { approval_status_date: e.target.value || null });
                            load();
                          }}
                          className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 w-32"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inv.created_by_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
                    <span title={inv.comment || ''} className="line-clamp-2">{inv.comment || '—'}</span>
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
                if (file) { setPendingFile(file); handleExtract(file); }
              }}
              onClick={() => extractRef.current?.click()}
              className={`mb-4 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
            >
              <input ref={extractRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => { if (e.target.files?.[0]) { setPendingFile(e.target.files[0]); handleExtract(e.target.files[0]); } }} />
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
                  {pendingFile ? (
                    <>
                      <p className="text-sm font-medium text-green-700">✓ {pendingFile.name}</p>
                      <p className="text-xs text-green-500 mt-1">سيتم حفظ الملف كمرفق عند الحفظ</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">اسحب صورة أو PDF الفاتورة هنا</p>
                      <p className="text-xs text-gray-400 mt-1">Claude سيستخرج البيانات تلقائياً • أو اضغط للاختيار</p>
                    </>
                  )}
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
              <div ref={supplierDropRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <input
                  type="text"
                  placeholder="— ابحث أو اختر المورد —"
                  value={supplierSearch || suppliers.find((s) => s.id === form.supplier_id)?.name || ''}
                  onFocus={() => { setSupplierOpen(true); setSupplierSearch(''); }}
                  onChange={(e) => { setSupplierSearch(e.target.value); setSupplierOpen(true); setForm({ ...form, supplier_id: '', po_id: '' }); }}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {supplierOpen && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {suppliers
                      .filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                      .map((s) => (
                        <div key={s.id}
                          onMouseDown={() => { setForm({ ...form, supplier_id: s.id, po_id: '' }); setSupplierSearch(''); setSupplierOpen(false); }}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-800"
                        >{s.name}</div>
                      ))}
                    {suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-400">لا توجد نتائج</div>
                    )}
                  </div>
                )}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-600">أمر الشراء</label>
                  <button type="button" onClick={() => { setPoManualMode(!poManualMode); setPoManualNumber(''); }}
                    className="text-xs text-blue-600 hover:underline">
                    {poManualMode ? '← اختر من القائمة' : '+ أدخل رقم يدوياً'}
                  </button>
                </div>
                {poManualMode ? (
                  <div className="flex gap-2">
                    <input
                      value={poManualNumber}
                      onChange={(e) => setPoManualNumber(e.target.value)}
                      placeholder="مثال: 05-024/2026e-O002"
                      className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                    <button type="button" onClick={handleConfirmManualPo} disabled={!poManualNumber.trim()}
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                      تأكيد
                    </button>
                  </div>
                ) : (
                  <select value={form.po_id} onChange={(e) => setForm({ ...form, po_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر أمر الشراء (اختياري) —</option>
                    {filteredPos.map((p) => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                  </select>
                )}
                {!poManualMode && form.po_id && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ {filteredPos.find(p => p.id === form.po_id)?.po_number || pos.find(p => p.id === form.po_id)?.po_number}
                  </p>
                )}
                {!poManualMode && !form.po_id && poManualNumber && (
                  <p className="text-xs text-orange-600 mt-1">
                    ⏳ {poManualNumber} — سيتم إنشاؤه عند الحفظ
                  </p>
                )}
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
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
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
                <select value={form.approval_status} onChange={(e) => setForm({ ...form, approval_status: e.target.value, approval_status_date: e.target.value ? (form.approval_status_date || new Date().toISOString().slice(0, 10)) : '' })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— بدون —</option>
                  <option value="booking_waiting_payment">Booking - Waiting Payment</option>
                  <option value="waiting_approval">Waiting Approval</option>
                  <option value="waiting_po">Waiting PO</option>
                  <option value="send_to_pay">Send to Pay</option>
                  <option value="hold">Hold</option>
                  <option value="delivery_missing">Delivery Missing</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              {form.approval_status && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">تاريخ الحالة</label>
                  <input type="date" value={form.approval_status_date}
                    onChange={(e) => setForm({ ...form, approval_status_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
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
              <button onClick={() => { setShowModal(false); setPendingFile(null); }}
                className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="font-bold text-lg">⚡ رفع فواتير متعددة</h3>
                <p className="text-sm text-gray-500 mt-1">اسحب عدة فواتير دفعةً واحدة — Claude سيستخرج بيانات كل واحدة تلقائياً</p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Drop Zone */}
            <div className="p-6 border-b">
              <div
                onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true); }}
                onDragLeave={() => setBulkDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setBulkDragOver(false);
                  const files = Array.from(e.dataTransfer.files).filter(
                    (f) => f.type.includes('pdf') || f.type.includes('image')
                  );
                  if (files.length) handleBulkFiles(files);
                }}
                onClick={() => bulkInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${bulkDragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}`}
              >
                <input ref={bulkInputRef} type="file" multiple className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) handleBulkFiles(files);
                    e.target.value = '';
                  }} />
                <div className="text-4xl mb-2">🤖</div>
                <p className="text-sm font-medium text-gray-700">اسحب ملفات PDF أو صور هنا</p>
                <p className="text-xs text-gray-400 mt-1">يمكن سحب عدة ملفات في نفس الوقت • أو اضغط للاختيار</p>
              </div>
            </div>

            {/* Items List */}
            {bulkItems.length > 0 && (
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {bulkItems.map((item, i) => (
                  <div key={i} className={`border rounded-xl p-4 ${
                    item.status === 'saved' ? 'border-green-200 bg-green-50' :
                    item.status === 'error' ? 'border-red-200 bg-red-50' :
                    item.status === 'extracting' || item.status === 'saving' ? 'border-blue-200 bg-blue-50' :
                    'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      {/* Status Icon */}
                      <div className="mt-1 text-lg flex-shrink-0">
                        {item.status === 'pending' && <span className="text-gray-400">⏳</span>}
                        {item.status === 'extracting' && (
                          <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        )}
                        {item.status === 'saving' && (
                          <svg className="animate-spin h-5 w-5 text-purple-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        )}
                        {item.status === 'ready' && <span className="text-blue-500">✏️</span>}
                        {item.status === 'saved' && <span className="text-green-600">✅</span>}
                        {item.status === 'error' && <span className="text-red-500">❌</span>}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-700 truncate">{item.file.name}</p>
                          <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                            {(item.file.size / 1024).toFixed(0)} KB
                          </span>
                        </div>

                        {item.status === 'extracting' && (
                          <p className="text-xs text-blue-600">Claude يقرأ الفاتورة...</p>
                        )}
                        {item.status === 'pending' && (
                          <p className="text-xs text-gray-400">في الانتظار...</p>
                        )}
                        {item.status === 'error' && (
                          <p className="text-xs text-red-600">{item.error}</p>
                        )}
                        {item.status === 'saved' && (
                          <p className="text-xs text-green-600">تم الحفظ بنجاح ✓</p>
                        )}

                        {(item.status === 'ready' || item.status === 'saving') && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <div>
                              <label className="text-xs text-gray-500">رقم الفاتورة</label>
                              <input
                                value={item.data.invoice_number}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, invoice_number: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">المورد</label>
                              <select
                                value={item.data.supplier_id}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, supplier_id: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                <option value="">— اختر —</option>
                                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">المبلغ</label>
                              <div className="flex gap-1 mt-0.5">
                                <input
                                  type="number"
                                  value={item.data.total_amount}
                                  onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                    idx === i ? { ...it, data: { ...it.data, total_amount: e.target.value } } : it
                                  ))}
                                  className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                                <select
                                  value={item.data.currency}
                                  onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                    idx === i ? { ...it, data: { ...it.data, currency: e.target.value } } : it
                                  ))}
                                  className="border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                >
                                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">تاريخ الفاتورة</label>
                              <input type="date" value={item.data.invoice_date}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, invoice_date: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">تاريخ الاستحقاق</label>
                              <input type="date" value={item.data.due_date}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, due_date: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">النوع</label>
                              <select value={item.data.type}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, type: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                <option value="preliminary">أولية</option>
                                <option value="final">نهائية</option>
                              </select>
                            </div>
                            <div className="col-span-3">
                              <label className="text-xs text-gray-500">الوصف</label>
                              <input value={item.data.description}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, description: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {item.status !== 'saving' && item.status !== 'saved' && (
                        <button onClick={() => setBulkItems((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0 mt-1">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="p-6 border-t flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {bulkItems.filter((i) => i.status === 'ready').length} جاهزة •{' '}
                {bulkItems.filter((i) => i.status === 'saved').length} تم حفظها •{' '}
                {bulkItems.filter((i) => i.status === 'extracting' || i.status === 'pending').length} قيد المعالجة
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  إغلاق
                </button>
                <button
                  onClick={handleBulkSaveAll}
                  disabled={savingAll || bulkItems.filter((i) => i.status === 'ready').length === 0}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingAll ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      جاري الحفظ...
                    </>
                  ) : `حفظ الكل (${bulkItems.filter((i) => i.status === 'ready').length})`}
                </button>
              </div>
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
            <div onClick={() => !uploading && fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center mb-4 cursor-pointer hover:border-blue-400 hover:bg-gray-50 transition-colors">
              <input ref={fileRef} type="file" onChange={handleUpload} className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
              <div className="text-3xl mb-2">📎</div>
              <p className="text-sm text-gray-600">
                {uploading ? 'جاري الرفع...' : 'اضغط لرفع ملف'}
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF, صور, Excel, Word — حتى 10MB</p>
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
                        <a href={att.url || `https://ume-pms-v2-backend-production.up.railway.app/uploads/${att.filename}`} target="_blank" rel="noreferrer"
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
