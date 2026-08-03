'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import InvoiceAssistant from './InvoiceAssistant';

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
    item_id: string; charge_type: string; depreciation_months: string;
  };
  error: string;
}

// كلمات دالة على وقود بحري → اختيار Bunker تلقائياً
const BUNKER_RX = /\b(bunker|lsmgo|mgo|ifo|hfo|lfo|vlsfo|mdo|gas\s?oil|gasoil|fuel|mobilgard|mobilgear|mobilux|mobil|lubricant|lube|grease|gear\s?oil|cylinder\s?oil)\b|وقود|بنكر|سولار|ديزل|زيت|شحم/i;

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
  depreciation_months?: number | null;
  item?: { id: string; name: string } | null;
  line_items?: { item_id: string; item_name: string; amount: number }[] | null;
  created_by_name: string;
  created_at?: string;
  supplier: { id: string; name: string };
  vessel: { id: string; name: string };
  purchase_order: { id: string; po_number: string };
}

type Line = { item_id: string; item_name: string; amount: string };
const empty = {
  invoice_number: '', supplier_id: '', vessel_id: '', po_id: '',
  type: 'preliminary', currency: 'USD', total_amount: '',
  invoice_date: '', due_date: '', description: '', notes: '',
  approval_status: '', approval_status_date: '', comment: '',
  charge_type: '', depreciation_months: '', item_id: '',
  line_items: [] as Line[],
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

function InvoicesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filterPoId = searchParams.get('po_id') || '';
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [filteredPos, setFilteredPos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState(empty);
  const [multiItem, setMultiItem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });
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
    const [invRes, supRes, vesRes, poRes, itemRes] = await Promise.all([
      api.get('/api/invoices'),
      api.get('/api/suppliers'),
      api.get('/api/vessels'),
      api.get('/api/purchase-orders'),
      api.get('/api/items'),
    ]);
    setInvoices(invRes.data);
    setSuppliers(supRes.data);
    setVessels(vesRes.data);
    setPos(poRes.data);
    setItems(itemRes.data);
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
    setMultiItem(false);
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
      charge_type: inv.depreciation_months && inv.depreciation_months > 1 ? 'depreciate' : 'month',
      depreciation_months: inv.depreciation_months && inv.depreciation_months > 1 ? String(inv.depreciation_months) : '',
      item_id: inv.item?.id || '',
      line_items: (inv.line_items || []).map((l) => ({ item_id: l.item_id, item_name: l.item_name, amount: String(l.amount) })),
    });
    setMultiItem((inv.line_items?.length || 0) > 0);
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.invoice_number.trim()) { setError('رقم الفاتورة مطلوب'); return; }
    if (!form.supplier_id) { setError('المورد مطلوب'); return; }
    if (!form.total_amount) { setError('المبلغ مطلوب'); return; }
    if (!form.charge_type) { setError('اختر نوع التحميل: تخص شهرها أم تُهلك على شهور'); return; }
    if (form.charge_type === 'depreciate') {
      const m = parseInt(form.depreciation_months);
      if (!m || m < 2) { setError('أدخل عدد شهور الإهلاك (شهرين أو أكثر)'); return; }
    }
    if (multiItem) {
      if (!form.line_items.length) { setError('أضف بند واحد على الأقل'); return; }
      if (form.line_items.some((l) => !l.item_id || !(parseFloat(l.amount) > 0))) { setError('كل بند لازم يكون له تصنيف ومبلغ أكبر من صفر'); return; }
      const sum = form.line_items.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      if (Math.abs(sum - parseFloat(form.total_amount)) > 0.01) { setError(`مجموع البنود (${sum.toLocaleString()}) لازم يساوي إجمالي الفاتورة (${Number(form.total_amount).toLocaleString()})`); return; }
    }
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

      const { charge_type, line_items, ...rest } = form;
      const data = {
        ...rest,
        total_amount: parseFloat(form.total_amount),
        vessel_id: form.vessel_id || null,
        po_id: resolvedPoId || null,
        invoice_date: form.invoice_date || null,
        due_date: form.due_date || null,
        depreciation_months: charge_type === 'depreciate' ? parseInt(form.depreciation_months) : null,
        item_id: multiItem ? null : (form.item_id || null),
        line_items: multiItem ? form.line_items.map((l) => ({ item_id: l.item_id, item_name: items.find((it) => it.id === l.item_id)?.name || l.item_name || '', amount: parseFloat(l.amount) })) : null,
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
        supplierId = (await resolveSupplier(d.supplier_name, suppliers)).id;
      }

      const vesselId = matchVessel(d.vessel_name || '');

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

      // البنود المستخرجة → ملء محرّر البنود المتعددة تلقائياً لو اتطابق بندين أو أكثر
      const rawLines = Array.isArray(d.line_items) ? d.line_items.filter((l: any) => l && l.name && Number(l.amount) > 0) : [];
      const mappedLines = rawLines.map((l: any) => ({ item_id: matchItem(l.name), item_name: l.name, amount: String(l.amount) }));
      const autoMulti = rawLines.length >= 2 && mappedLines.filter((m: any) => m.item_id).length >= 2;
      setMultiItem(autoMulti);

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
        line_items: autoMulti ? mappedLines : prev.line_items,
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
    item_id: '', charge_type: 'month', depreciation_months: '',
  });

  // البند الذي اسمه Bunker (لاكتشاف الوقود تلقائياً)
  const bunkerItemId = () => items.find((it) => (it.name || '').toLowerCase().includes('bunker'))?.id || '';
  const detectItem = (desc: string) => (desc && BUNKER_RX.test(desc) ? bunkerItemId() : '');

  // مطابقة مرنة لاسم المركب: تطابق تام (بعد التطبيع) ثم احتواء جزئي
  const matchVessel = (name: string, list = vessels) => {
    const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!n) return '';
    const exact = list.find((v) => (v.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === n);
    if (exact) return exact.id;
    const partial = list.find((v) => { const vn = (v.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return vn.length >= 3 && (vn.includes(n) || n.includes(vn)); });
    return partial?.id || '';
  };

  // توحيد اسم المورد للمطابقة (نفس منطق الباك-إند)
  const normName = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
  // إيجاد المورد بالتطبيع أو إنشاؤه — لو موجود بالفعل (تكرار) نعيد الجلب ونطابق بدل ما نفشل
  async function resolveSupplier(name: string, list: any[]): Promise<{ id: string; list: any[] }> {
    const n = normName(name);
    if (!n) return { id: '', list };
    const found = list.find((s) => normName(s.name) === n);
    if (found) return { id: found.id, list };
    try {
      const newSup = await api.post('/api/suppliers', { name: name.trim() });
      const fresh = (await api.get('/api/suppliers')).data;
      setSuppliers(fresh);
      return { id: newSup.data.id, list: fresh };
    } catch {
      const fresh = (await api.get('/api/suppliers')).data;
      setSuppliers(fresh);
      const again = fresh.find((s: any) => normName(s.name) === n);
      return { id: again?.id || '', list: fresh };
    }
  }

  // مطابقة اسم سطر مستخرَج ببند موجود (أطول اسم بند يظهر داخل اسم السطر)
  const matchItem = (lineName: string) => {
    const ln = normName(lineName);
    if (!ln) return '';
    let best = '', bestLen = 0;
    for (const it of items) {
      if (it.is_active === false) continue;
      const inm = normName(it.name);
      if (inm.length >= 3 && ln.includes(inm) && inm.length > bestLen) { best = it.id; bestLen = inm.length; }
    }
    return best;
  };

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
      const supplierName = d.supplier_name || '';
      if (supplierName) {
        const r = await resolveSupplier(supplierName, currentSuppliers);
        supplierId = r.id;
        currentSuppliers = r.list;
      }

      const vesselId = matchVessel(d.vessel_name || '');

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
            item_id: detectItem(d.description || ''),
            charge_type: 'month',
            depreciation_months: '',
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
      // تحقق الإهلاك (نفس قاعدة الفورم العادي) قبل الحفظ
      if (item.data.charge_type === 'depreciate') {
        const m = parseInt(item.data.depreciation_months);
        if (!m || m < 2) {
          setBulkItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'error', error: 'أدخل عدد شهور الإهلاك (شهرين أو أكثر) أو غيّر نوع التحميل لِـ «تخص شهرها»' } : it));
          continue;
        }
      }
      setBulkItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'saving' } : it));
      try {
        const { charge_type, depreciation_months, item_id, ...restData } = item.data;
        const payload = {
          ...restData,
          total_amount: parseFloat(item.data.total_amount) || 0,
          vessel_id: item.data.vessel_id || null,
          po_id: null,
          invoice_date: item.data.invoice_date || null,
          due_date: item.data.due_date || null,
          item_id: item_id || null,
          depreciation_months: charge_type === 'depreciate' ? parseInt(depreciation_months) : null,
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

  const SORT_GETTERS: Record<string, (i: Invoice) => number | string> = {
    invoice_number: (i) => (i.invoice_number || '').toLowerCase(),
    supplier: (i) => (i.supplier?.name || '').toLowerCase(),
    vessel: (i) => (i.vessel?.name || '').toLowerCase(),
    item: (i) => (i.line_items?.length ? 'متعدد' : (i.item?.name || '')).toLowerCase(),
    type: (i) => i.type || '',
    total_amount: (i) => +i.total_amount || 0,
    paid_amount: (i) => +i.paid_amount || 0,
    remaining: (i) => (+i.total_amount || 0) - (+i.paid_amount || 0),
    due_date: (i) => (i.due_date ? new Date(i.due_date).getTime() : 0),
    status: (i) => i.status || '',
    approval_status: (i) => i.approval_status || '',
    created_by_name: (i) => (i.created_by_name || '').toLowerCase(),
    created: (i) => (i.created_at ? new Date(i.created_at).getTime() : 0),
  };
  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const displayed = invoices
    .filter((i) => !filterStatus || i.status === filterStatus)
    .filter((i) => !filterPoId || i.purchase_order?.id === filterPoId);

  const sortGetter = SORT_GETTERS[sort.key];
  const sorted = sortGetter
    ? [...displayed].sort((a, b) => {
        const va = sortGetter(a), vb = sortGetter(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar');
        return sort.dir === 'asc' ? c : -c;
      })
    : displayed;

  const SortTh = ({ k, label }: { k: string; label: string }) => (
    <th className="px-4 py-3 cursor-pointer select-none hover:text-blue-600 whitespace-nowrap" onClick={() => toggleSort(k)}>
      {label}<span className="text-blue-500">{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  );

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
              <SortTh k="invoice_number" label="رقم الفاتورة" />
              <SortTh k="supplier" label="المورد" />
              <SortTh k="vessel" label="السفينة" />
              <SortTh k="item" label="البند" />
              <SortTh k="type" label="النوع" />
              <SortTh k="total_amount" label="المبلغ" />
              <SortTh k="paid_amount" label="المدفوع" />
              <SortTh k="remaining" label="المتبقي" />
              <SortTh k="due_date" label="الاستحقاق" />
              <SortTh k="status" label="الحالة" />
              <SortTh k="approval_status" label="حالة الموافقة" />
              <SortTh k="created_by_name" label="أضافها" />
              <th className="px-4 py-3">تعليق</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv) => {
              const remaining = +inv.total_amount - +inv.paid_amount;
              return (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.supplier?.name || '—'}</td>
                  <td className="px-4 py-3">{inv.vessel?.name || '—'}</td>
                  <td className="px-4 py-3">{inv.line_items?.length ? <span title={inv.line_items.map((l) => l.item_name).join('، ')} className="text-indigo-600">متعدد ({inv.line_items.length})</span> : (inv.item?.name || '—')}</td>
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
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>
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
                  <label className="text-sm text-gray-600">البند</label>
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={multiItem} onChange={(e) => setMultiItem(e.target.checked)} /> بنود متعددة
                  </label>
                </div>
                {!multiItem ? (
                  <select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— اختر البند —</option>
                    {items.filter((it) => it.is_active !== false || it.id === form.item_id).map((it) => <option key={it.id} value={it.id}>{it.name}{it.is_active === false ? ' (موقوف)' : ''}</option>)}
                  </select>
                ) : (
                  <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                    {form.line_items.map((l, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select value={l.item_id} onChange={(e) => setForm({ ...form, line_items: form.line_items.map((x, i) => i === idx ? { ...x, item_id: e.target.value } : x) })}
                          className="flex-1 border rounded-lg px-2 py-1.5 text-sm">
                          <option value="">— البند —</option>
                          {items.filter((it) => it.is_active !== false).map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                        <input inputMode="decimal" placeholder="المبلغ" value={l.amount}
                          onChange={(e) => setForm({ ...form, line_items: form.line_items.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x) })}
                          className="w-32 border rounded-lg px-2 py-1.5 text-sm" />
                        <button type="button" onClick={() => setForm({ ...form, line_items: form.line_items.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600 px-1">✕</button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => setForm({ ...form, line_items: [...form.line_items, { item_id: '', item_name: '', amount: '' }] })}
                        className="text-blue-600 text-xs hover:underline">➕ إضافة بند</button>
                      {(() => {
                        const sum = form.line_items.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
                        const tot = parseFloat(form.total_amount) || 0;
                        const ok = tot > 0 && Math.abs(sum - tot) < 0.01;
                        return <span className={`text-xs ${ok ? 'text-emerald-600' : 'text-red-500'}`}>مجموع البنود: {sum.toLocaleString()} / {tot.toLocaleString()} {ok ? '✓' : ''}</span>;
                      })()}
                    </div>
                  </div>
                )}
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
              <div>
                <label className="block text-sm text-gray-600 mb-1">نوع التحميل *</label>
                <select value={form.charge_type}
                  onChange={(e) => setForm({ ...form, charge_type: e.target.value, depreciation_months: e.target.value === 'depreciate' ? form.depreciation_months : '' })}
                  className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.charge_type ? 'border-red-300' : ''}`}>
                  <option value="">— اختر —</option>
                  <option value="month">تخص شهرها (تُحمّل كاملة)</option>
                  <option value="depreciate">تُهلك على شهور</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">عدد شهور الإهلاك {form.charge_type === 'depreciate' ? '*' : ''}</label>
                <input type="number" min="2" step="1"
                  placeholder={form.charge_type === 'depreciate' ? 'مثال: 36' : 'غير مطلوب'}
                  disabled={form.charge_type !== 'depreciate'}
                  value={form.depreciation_months} onChange={(e) => setForm({ ...form, depreciation_months: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400" />
                <p className="text-xs text-gray-400 mt-1">لقطع الغيار والأصول: يوزّع المبلغ على عدد الشهور بقيمة ثابتة</p>
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
                              <label className="text-xs text-gray-500">المركب</label>
                              <select value={item.data.vessel_id}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, vessel_id: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                <option value="">— اختر المركب —</option>
                                {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
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
                            <div>
                              <label className="text-xs text-gray-500">البند</label>
                              <select value={item.data.item_id}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, item_id: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                <option value="">— اختر البند —</option>
                                {items.filter((it) => it.is_active !== false || it.id === item.data.item_id).map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">حالة الموافقة</label>
                              <select value={item.data.approval_status}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, approval_status: e.target.value } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                <option value="">— بدون —</option>
                                <option value="booking_waiting_payment">Booking - Waiting Payment</option>
                                <option value="waiting_approval">Waiting Approval</option>
                                <option value="waiting_po">Waiting PO</option>
                                <option value="send_to_pay">Send to Pay</option>
                                <option value="hold">Hold</option>
                                <option value="delivery_missing">Delivery Missing</option>
                                <option value="paid">Paid (مدفوعة)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">نوع التحميل</label>
                              <select value={item.data.charge_type}
                                onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                  idx === i ? { ...it, data: { ...it.data, charge_type: e.target.value, depreciation_months: e.target.value === 'depreciate' ? it.data.depreciation_months : '' } } : it
                                ))}
                                className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                <option value="month">تخص شهرها</option>
                                <option value="depreciate">تُهلك على شهور</option>
                              </select>
                            </div>
                            {item.data.charge_type === 'depreciate' && (
                              <div>
                                <label className="text-xs text-gray-500">شهور الإهلاك</label>
                                <input type="number" min="2" step="1" value={item.data.depreciation_months}
                                  onChange={(e) => setBulkItems((prev) => prev.map((it, idx) =>
                                    idx === i ? { ...it, data: { ...it.data, depreciation_months: e.target.value } } : it
                                  ))}
                                  className="w-full border rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              </div>
                            )}
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

      {/* ── AI Financial Assistant ── */}
      <InvoiceAssistant onChanged={load} />
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">جاري التحميل...</div>}>
      <InvoicesContent />
    </Suspense>
  );
}
