'use client';
import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { useI18n } from '@/lib/i18n';
import { Card, Button, Badge, Select as UISelect, Drawer, Icon, cx } from '@/components/ui';
import SupplierReports, { type SupplierReportKey } from './SupplierReports';
import PostToLedger from './PostToLedger';
import { fmtNum, fmtMoney, fmtMoneyC, ccyEntries, n0 } from '@/lib/format';
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
  payments?: { id: string }[];
  // R3A · بيانات تحكّم مالي — للقراءة فقط، لا تُرسَل من الواجهة إطلاقاً
  data_origin?: 'operational' | 'migrated';
  settlement_basis?: 'payment_record' | 'pre_system_settled' | 'credit_note' | 'none';
  import_batch?: { id: string; batch_code: string } | null;
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
  // R3B: القيمة المخزَّنة 'paid' لم تتغيّر (توافق رجعي)، لكنها تعني «معتمد للصرف»
  // لا «سُدِّد». عرضها كـ Paid كان يخلط الاعتماد الإداري بالسداد الفعلي.
  paid: 'معتمد للصرف',
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

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-100 p-2.5"><p className="text-[11px] text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800 truncate">{value}</p></div>;
}

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
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });
  const [attachModal, setAttachModal] = useState<Invoice | null>(null);
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const [payDate, setPayDate] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  // ── السداد السريع ────────────────────────────────────────────────────────
  // يستدعي POST /api/payments — نفس نقطة نهاية شاشة الدفعات بالضبط.
  // بذلك يرث كل حرّاس R3B (مبلغ موجب · تطابق العملة · منع التجاوز · معاملة
  // ذرّية مع قفل صف الفاتورة) ونفس أثر التقارير — بالبناء لا بتكرار المنطق.
  const emptySettle = { amount: '', payment_date: '', payment_type: 'installment',
                        payment_method: 'bank_transfer', reference: '', notes: '' };
  const [settleInv, setSettleInv] = useState<Invoice | null>(null);
  const [settleForm, setSettleForm] = useState(emptySettle);
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState('');
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
  const { t, locale } = useI18n();
  // workspace controls (Phase 3 modernization — presentation only)
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [preset, setPreset] = useState<'all' | 'unpaid' | 'paid' | 'overdue' | 'duesoon' | 'approval'>('all');
  const [supFilter, setSupFilter] = useState('');
  const [vesFilter, setVesFilter] = useState('');
  const [ccyFilter, setCcyFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detail, setDetail] = useState<Invoice | null>(null);
  // تقارير الموردين (تُفتح من الهيدر أو من تفاصيل فاتورة)
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsInit, setReportsInit] = useState<{ report?: SupplierReportKey; supplierId?: string; vesselId?: string }>({});
  function openReports(init?: { report?: SupplierReportKey; supplierId?: string; vesselId?: string }) {
    // بدون سياق: يختار التقرير المناسب حسب الفلاتر النشطة
    const fallback: typeof reportsInit = supFilter ? { report: 'statement', supplierId: supFilter }
      : vesFilter ? { report: 'vessel', vesselId: vesFilter }
      : { report: 'statement' };
    setReportsInit(init || fallback);
    setReportsOpen(true);
  }

  async function load() {
    // كل قائمة تُحمّل باستقلال — فشل نداء واحد (مثلاً 500 عابر) لا يُفرّغ باقي القوائم
    const endpoints: [string, (d: any) => void][] = [
      ['/api/invoices', setInvoices],
      ['/api/suppliers', setSuppliers],
      ['/api/vessels', setVessels],
      ['/api/purchase-orders', setPos],
      ['/api/items', setItems],
    ];
    const results = await Promise.allSettled(endpoints.map(([url]) => api.get(url)));
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value.data)) endpoints[i][1](r.value.data);
      else failed.push(endpoints[i][0]);
    });
    if (failed.length) {
      console.error('load() فشل تحميل:', failed);
      setError('تعذّر تحميل بعض القوائم: ' + failed.join('، ') + ' — حدّث الصفحة أو أعد المحاولة.');
    }
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

  function openPay(inv: Invoice) {
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayInv(inv);
  }
  async function confirmPay() {
    if (!payInv || !payDate) return;
    setPaySaving(true);
    try {
      await api.put(`/api/invoices/${payInv.id}`, { approval_status: 'paid', approval_status_date: payDate });
      setPayInv(null);
      load();
    } catch {
      alert('فشل تسجيل الاعتماد');
    } finally {
      setPaySaving(false);
    }
  }

  // المتبقّي من مصدر الحقيقة نفسه المستخدم في كل الشاشات: الإجمالي − المسدَّد المخزَّن
  const remainingOf = (i: Invoice) => Math.max(0, n0(i.total_amount) - n0(i.paid_amount));

  function openSettle(inv: Invoice) {
    setSettleError('');
    setSettleForm({ ...emptySettle,
      amount: String(remainingOf(inv)),                    // مقترح — قابل للتعديل
      payment_date: new Date().toISOString().slice(0, 10) });
    setSettleInv(inv);
  }

  async function confirmSettle() {
    if (!settleInv) return;
    const amt = parseFloat(settleForm.amount);
    // تحقّق واجهة لتحسين التجربة فقط — الضابط المالي الحقيقي خادمي ولا يُتجاوز
    if (!settleForm.payment_date) { setSettleError('تاريخ السداد مطلوب'); return; }
    if (!isFinite(amt) || amt <= 0) { setSettleError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (amt > remainingOf(settleInv) + 0.005) {
      setSettleError(`المبلغ يتجاوز المتبقّي (${fmtMoney(remainingOf(settleInv))} ${settleInv.currency})`); return;
    }
    setSettleSaving(true); setSettleError('');
    try {
      await api.post('/api/payments', {
        invoice_id: settleInv.id,
        amount: amt,
        currency: settleInv.currency,                      // من الفاتورة قطعياً — لا اختيار
        payment_date: settleForm.payment_date,
        payment_type: settleForm.payment_type,
        payment_method: settleForm.payment_method,
        reference: settleForm.reference || null,
        notes: settleForm.notes || null,
      });
      setSettleInv(null);
      load();
    } catch (err: any) {
      // رسالة الخادم تُعرض كما هي: هي التي تشرح سبب الرفض (عملة · تجاوز · مبلغ)
      setSettleError(err?.response?.data?.message || 'فشل تسجيل السداد');
    } finally {
      setSettleSaving(false);
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
        line_items: autoMulti ? mappedLines : [],
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

  // مطابقة اسم سطر مستخرَج ببند موجود — تطابق كلمات كاملة متتالية (أطول اسم بند)
  const wordsOf = (s: string) => (s || '').toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter(Boolean);
  const matchItem = (lineName: string) => {
    const lw = wordsOf(lineName);
    if (!lw.length) return '';
    let best = '', bestLen = 0;
    for (const it of items) {
      if (it.is_active === false) continue;
      const iw = wordsOf(it.name);
      if (!iw.length) continue;
      let found = false;
      for (let i = 0; i + iw.length <= lw.length; i++) { if (iw.every((w, j) => lw[i + j] === w)) { found = true; break; } }
      const len = iw.join('').length;
      if (found && len > bestLen) { best = it.id; bestLen = len; }
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

  // financial rules (match backend; outstanding uses STORED paid_amount, never sum of payments)
  const _today = new Date(); _today.setHours(0, 0, 0, 0);
  const _soon = new Date(_today); _soon.setDate(_soon.getDate() + 7);
  const isOpen = (i: Invoice) => ['unpaid', 'partial'].includes(i.status);
  const outOf = (i: Invoice) => n0(i.total_amount) - n0(i.paid_amount);
  const isOverdue = (i: Invoice) => !!i.due_date && new Date(i.due_date) < _today && i.status !== 'paid' && i.status !== 'cancelled';
  const isDueSoon = (i: Invoice) => !!i.due_date && new Date(i.due_date) >= _today && new Date(i.due_date) <= _soon && i.status !== 'paid' && i.status !== 'cancelled';
  const isAwaiting = (i: Invoice) => !!i.approval_status && i.approval_status !== 'paid';
  const byC = (arr: Invoice[], f: (i: Invoice) => number) => { const o: Record<string, number> = {}; for (const x of arr) { const k = (x.currency || 'USD').toUpperCase(); o[k] = (o[k] || 0) + f(x); } return o; };

  const ql = q.trim().toLowerCase();
  const filtered = invoices.filter((i) => {
    if (filterPoId && i.purchase_order?.id !== filterPoId) return false;
    if (preset === 'unpaid' && !isOpen(i)) return false;
    if (preset === 'paid' && i.status !== 'paid') return false;
    if (preset === 'overdue' && !isOverdue(i)) return false;
    if (preset === 'duesoon' && !isDueSoon(i)) return false;
    if (preset === 'approval' && !isAwaiting(i)) return false;
    if (supFilter && i.supplier?.id !== supFilter) return false;
    if (vesFilter && i.vessel?.id !== vesFilter) return false;
    if (ccyFilter && (i.currency || 'USD').toUpperCase() !== ccyFilter) return false;
    const d = (i.invoice_date || '').slice(0, 10);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    if (ql) { const hay = [i.invoice_number, i.supplier?.name, i.vessel?.name, i.purchase_order?.po_number, i.description].map((x) => (x || '').toLowerCase()).join(' '); if (!hay.includes(ql)) return false; }
    return true;
  });

  const sortGetter = SORT_GETTERS[sort.key];
  const sorted = sortGetter
    ? [...filtered].sort((a, b) => {
        const va = sortGetter(a), vb = sortGetter(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar');
        return sort.dir === 'asc' ? c : -c;
      })
    : filtered;

  // global AP summary (reconciles to source; outstanding = total − stored paid_amount, per currency)
  const openInv = invoices.filter(isOpen);
  const overdueInv = invoices.filter(isOverdue);
  const summary = {
    total: invoices.length,
    unpaid: invoices.filter((i) => i.status === 'unpaid').length,
    partial: invoices.filter((i) => i.status === 'partial').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
    outstanding: byC(openInv, outOf),
    overdueCount: overdueInv.length,
    overdueAmt: byC(overdueInv, outOf),
    dueSoonCount: invoices.filter(isDueSoon).length,
    awaitingCount: invoices.filter(isAwaiting).length,
  };
  const currencies = [...new Set(invoices.map((i) => (i.currency || 'USD').toUpperCase()))].sort();
  const activeFilterCount = [q, supFilter, vesFilter, ccyFilter, fromDate, toDate, preset !== 'all' ? preset : ''].filter(Boolean).length;
  const resetFilters = () => { setQ(''); setPreset('all'); setSupFilter(''); setVesFilter(''); setCcyFilter(''); setFromDate(''); setToDate(''); };
  // approval-paid with no real payment transaction (current backend behavior — shown truthfully)
  const isApprovalPaidNoTxn = (i: Invoice) => i.status === 'paid' && i.approval_status === 'paid';

  // ── R3A · تصنيف تاريخي ────────────────────────────────────────────────────
  // مصدر الحقيقة حقول التحكّم المالي القادمة من الخادم، لا أي استنتاج من التاريخ.
  // الشارة محايدة عمداً (لا خضراء): الأخضر لغة «سداد داخل PMS»، وهذه ليست كذلك.
  const isLegacySettled = (i: Invoice) => i.settlement_basis === 'pre_system_settled';
  const isLegacyCredit = (i: Invoice) => i.settlement_basis === 'credit_note';
  const LegacyBadge = ({ i }: { i: Invoice }) =>
    isLegacySettled(i) ? <Badge tone="info">مسوّاة قبل النظام</Badge>
    : isLegacyCredit(i) ? <Badge tone="neutral">إشعار دائن</Badge>
    : null;

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
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div><h1 className="text-2xl font-extrabold text-navy-900">{t('inv.title')}</h1><p className="text-sm text-gray-500 mt-0.5">{t('inv.subtitle')}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" icon="chart" onClick={() => openReports()}>تقارير الموردين</Button>
          <Button variant="secondary" icon="plus" onClick={() => { setBulkItems([]); setShowBulkModal(true); }}>{t('inv.bulk')}</Button>
          <Button icon="plus" onClick={openAdd}>{t('inv.add')}</Button>
        </div>
      </div>

      {/* ===== Financial summary (per currency) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#2563eb15', color: '#2563eb' }}><Icon name="receipt" size={16} /></span><p className="text-xs text-gray-500">{t('inv.total')}</p></div>
          <p className="text-2xl font-extrabold text-gray-800 tabular-nums">{fmtNum(summary.total)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('st.unpaid')}: {summary.unpaid} · {t('st.paid')}: {summary.paid}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#e11d4815', color: '#e11d48' }}><Icon name="coins" size={16} /></span><p className="text-xs text-gray-500">{t('inv.outstanding')}</p></div>
          {ccyEntries(summary.outstanding).length ? ccyEntries(summary.outstanding).map((e) => <p key={e.ccy} className="text-sm font-bold text-gray-800 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>) : <p className="text-lg font-bold text-gray-300">0</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#d9770615', color: '#d97706' }}><Icon name="bell" size={16} /></span><p className="text-xs text-gray-500">{t('inv.overdue')} ({summary.overdueCount})</p></div>
          {ccyEntries(summary.overdueAmt).length ? ccyEntries(summary.overdueAmt).map((e) => <p key={e.ccy} className="text-sm font-bold text-red-600 tabular-nums leading-tight">{fmtMoney(e.value)} <span className="text-[11px] text-gray-400">{e.ccy}</span></p>) : <p className="text-lg font-bold text-gray-300">0</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0891b215', color: '#0891b2' }}><Icon name="clipboard" size={16} /></span><p className="text-xs text-gray-500">{t('inv.attention')}</p></div>
          <p className="text-sm text-gray-700 leading-tight">{t('inv.dueSoon')}: <b className="tabular-nums">{summary.dueSoonCount}</b></p>
          <p className="text-sm text-gray-700 leading-tight">{t('inv.awaitingApproval')}: <b className="tabular-nums">{summary.awaitingCount}</b></p>
        </div>
      </div>

      {/* ===== Needs attention (real data only; missing-PO is NOT an alert) ===== */}
      {(summary.overdueCount > 0 || summary.dueSoonCount > 0 || summary.awaitingCount > 0) && (
        <Card className="p-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><Icon name="bell" size={15} className="text-amber-500" />{t('sec.attention')}:</span>
            {summary.overdueCount > 0 && <button onClick={() => setPreset('overdue')} className="text-xs rounded-full px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100">{t('att.overdueInv')} {summary.overdueCount}</button>}
            {summary.dueSoonCount > 0 && <button onClick={() => setPreset('duesoon')} className="text-xs rounded-full px-3 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100">{t('att.dueSoon')} {summary.dueSoonCount}</button>}
            {summary.awaitingCount > 0 && <button onClick={() => setPreset('approval')} className="text-xs rounded-full px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100">{t('inv.awaitingApproval')} {summary.awaitingCount}</button>}
          </div>
        </Card>
      )}

      {/* ===== Preset views ===== */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {([['all', t('sup.all')], ['unpaid', t('st.unpaid')], ['paid', t('st.paid')], ['overdue', t('inv.overdue')], ['duesoon', t('att.dueSoon')], ['approval', t('inv.awaitingApproval')]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setPreset(k as any)} className={cx('text-xs px-3 py-1.5 rounded-full border transition-colors', preset === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300')}>{lbl}</button>
        ))}
      </div>

      {/* ===== Controls ===== */}
      <Card className="p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none"><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.search')} className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <UISelect value={supFilter} onChange={(e) => setSupFilter(e.target.value)} className="w-auto"><option value="">{t('po.allSuppliers')}</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</UISelect>
        <UISelect value={vesFilter} onChange={(e) => setVesFilter(e.target.value)} className="w-auto"><option value="">{t('po.allVessels')}</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</UISelect>
        <UISelect value={ccyFilter} onChange={(e) => setCcyFilter(e.target.value)} className="w-auto"><option value="">{t('inv.allCurrencies')}</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</UISelect>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.fromDate')} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-xs" title={t('po.toDate')} />
        {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}>{t('sup.reset')} ({activeFilterCount})</Button>}
        <span className="text-xs text-gray-400 ms-auto">{sorted.length}/{invoices.length}</span>
      </Card>

      {/* ===== Desktop table ===== */}
      <Card className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-gray-500 text-xs border-b border-gray-100">
            <tr>
              <SortTh k="invoice_number" label={t('inv.number')} />
              <SortTh k="supplier" label={t('inv.supplier')} />
              <SortTh k="vessel" label={t('inv.vessel')} />
              <SortTh k="total_amount" label={t('inv.amount')} />
              <SortTh k="paid_amount" label={t('inv.paid')} />
              <SortTh k="remaining" label={t('inv.outstanding')} />
              <SortTh k="due_date" label={t('inv.due')} />
              <SortTh k="status" label={t('inv.payStatus')} />
              <SortTh k="approval_status" label={t('inv.approval')} />
              <th className="px-3 py-3 text-start">{t('inv.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv) => {
              const remaining = outOf(inv);
              return (
                <tr key={inv.id} onClick={() => setDetail(inv)} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/40 cursor-pointer">
                  <td className="px-3 py-2.5 font-mono font-medium text-brand-700">
                    {inv.invoice_number}{inv.line_items?.length ? <span className="text-[10px] text-indigo-500 ms-1">({inv.line_items.length})</span> : null}
                    {/* فاتورة بمبلغ سالب = إشعار دائن */}
                    {Number(inv.total_amount) < 0 && <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-[10px] font-semibold ms-1 font-sans">إشعار دائن</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{inv.supplier?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{inv.vessel?.name || '—'}</td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{fmtMoney(inv.total_amount)} <span className="text-[11px] text-gray-400">{inv.currency}</span></td>
                  <td className="px-3 py-2.5 text-emerald-600 tabular-nums">{fmtMoney(inv.paid_amount)}</td>
                  <td className={cx('px-3 py-2.5 tabular-nums', remaining > 0.005 ? 'text-red-600 font-medium' : 'text-gray-300')}>{remaining > 0.005 ? fmtMoney(remaining) : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 tabular-nums">{inv.due_date?.slice(0, 10) || '—'}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap items-center gap-1"><Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : inv.status === 'cancelled' ? 'neutral' : 'danger'}>{statusLabel[inv.status]}</Badge><LegacyBadge i={inv} /></div></td>
                  <td className="px-3 py-2.5">{inv.approval_status ? <Badge tone={'info'}>{approvalLabel[inv.approval_status]}</Badge> : <span className="text-gray-300 text-xs">—</span>}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setDetail(inv)} className="text-gray-500 hover:text-brand-600">{t('inv.details')}</button>
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={() => openSettle(inv)} className="text-emerald-600 hover:underline font-medium">💵 سداد</button>}
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={() => openPay(inv)} className="text-blue-600 hover:underline font-medium">{t('inv.pay')}</button>}
                      <button onClick={() => openEdit(inv)} className="text-brand-600 hover:underline">{t('inv.editShort')}</button>
                      <button onClick={() => openAttachments(inv)} className="text-gray-500 hover:text-gray-800">{t('inv.attachShort')}</button>
                      <PostToLedger invoice={inv} compact onDone={load} />
                      <button onClick={() => handleDelete(inv.id, inv.invoice_number)} className="text-red-400 hover:text-red-600">{t('inv.delShort')}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-gray-400">{t('inv.noResults')}</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* ===== Mobile cards ===== */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {sorted.map((inv) => {
          const remaining = outOf(inv);
          return (
            <Card key={inv.id} className="p-4" onClick={() => setDetail(inv)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-mono font-bold text-brand-700 truncate">{inv.invoice_number}</p><p className="text-xs text-gray-500 truncate">{inv.supplier?.name || '—'}{inv.vessel?.name ? ` · ${inv.vessel.name}` : ''}</p></div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : inv.status === 'cancelled' ? 'neutral' : 'danger'}>{statusLabel[inv.status]}</Badge>
                  <LegacyBadge i={inv} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-gray-700 tabular-nums font-medium">{fmtMoney(inv.total_amount, inv.currency)}</span>
                <span className={cx('tabular-nums', remaining > 0.005 ? 'text-red-600' : 'text-emerald-600')}>{remaining > 0.005 ? `${t('inv.outstanding')}: ${fmtMoneyC(remaining, inv.currency)}` : t('st.paid')}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
                <span>{t('inv.due')}: {inv.due_date?.slice(0, 10) || '—'}{isOverdue(inv) ? ` · ${t('att.overdueInv')}` : ''}</span>
                {inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={(e) => { e.stopPropagation(); openSettle(inv); }} className="text-emerald-600 font-medium">💵 سداد</button>}
                {inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={(e) => { e.stopPropagation(); openPay(inv); }} className="text-blue-600 font-medium">{t('inv.pay')}</button>}
              </div>
            </Card>
          );
        })}
        {sorted.length === 0 && <Card><p className="text-center py-8 text-gray-400 text-sm">{t('inv.noResults')}</p></Card>}
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-3">{t('note.currency')}</p>

      {/* ===== Invoice detail drawer (clear separation: approval / payment status / actual transactions) ===== */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.invoice_number} width="max-w-lg">
        {detail && (() => {
          const inv = detail;
          const remaining = outOf(inv);
          const payRows: any[] = (inv as any).payments || [];
          const approvalPaidNoTxn = inv.status === 'paid' && inv.approval_status === 'paid' && payRows.length === 0;
          return (
            <div className="space-y-5">
              {/* Overview */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('po.overview')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label={t('inv.supplier')} value={inv.supplier?.name || '—'} />
                  <MiniStat label={t('inv.vessel')} value={inv.vessel?.name || '—'} />
                  <MiniStat label="PO" value={inv.purchase_order?.po_number || t('inv.noPO')} />
                  <MiniStat label={t('inv.type')} value={typeLabel[inv.type] || inv.type} />
                  <MiniStat label={t('inv.date')} value={inv.invoice_date?.slice(0, 10) || '—'} />
                  <MiniStat label={t('inv.due')} value={inv.due_date?.slice(0, 10) || '—'} />
                </div>
                {inv.description && <div className="mt-2 rounded-xl border border-gray-100 p-3"><p className="text-[11px] text-gray-400 mb-0.5">{t('inv.description')}</p><p className="text-sm text-gray-700">{inv.description}</p></div>}
                {(inv.line_items?.length || 0) > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-100 p-3">
                    <p className="text-[11px] text-gray-400 mb-1">{t('po.items')} ({inv.line_items!.length})</p>
                    {inv.line_items!.map((l, idx) => <div key={idx} className="flex justify-between text-sm py-0.5"><span className="text-gray-700">{l.item_name}</span><span className="tabular-nums text-gray-600">{fmtMoney(l.amount, inv.currency)}</span></div>)}
                  </div>
                )}
              </div>

              {/* Financial (amounts distinct) */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('inv.financial')}</h4>
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-gray-100 p-3 text-center">
                  <div><p className="text-[11px] text-gray-400">{t('inv.amount')}</p><p className="text-sm font-bold text-gray-800 tabular-nums">{fmtMoneyC(inv.total_amount, inv.currency)}</p></div>
                  <div><p className="text-[11px] text-gray-400">{t('inv.paid')}</p><p className="text-sm font-bold text-emerald-700 tabular-nums">{fmtMoneyC(inv.paid_amount, inv.currency)}</p></div>
                  <div><p className="text-[11px] text-gray-400">{t('inv.outstanding')}</p><p className={cx('text-sm font-bold tabular-nums', remaining > 0.005 ? 'text-red-600' : 'text-gray-400')}>{fmtMoneyC(remaining, inv.currency)}</p></div>
                </div>
              </div>

              {/* R3A · أساس الإغلاق — يُعرض فقط للسجلات المصنَّفة تاريخياً.
                  يذكر صراحةً غياب سند الدفع داخل النظام حتى لا يُقرأ كأنه سداد. */}
              {(isLegacySettled(inv) || isLegacyCredit(inv)) && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon name="shield" size={14} />
                    <p className="text-xs font-bold text-sky-800">
                      {isLegacySettled(inv) ? 'تسوية تاريخية سابقة للنظام' : 'إشعار دائن'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <div><span className="text-gray-500">أساس الإغلاق: </span>
                      <span className="font-medium">{isLegacySettled(inv) ? 'تسوية سابقة للنظام' : 'إشعار دائن'}</span></div>
                    <div><span className="text-gray-500">مصدر البيانات: </span>
                      <span className="font-medium">{inv.data_origin === 'migrated' ? 'مُرحَّلة' : 'تشغيلية'}</span></div>
                    <div><span className="text-gray-500">دفعة الاستيراد: </span>
                      <span className="font-mono font-medium">{inv.import_batch?.batch_code || '—'}</span></div>
                    <div><span className="text-gray-500">سجلات السداد داخل PMS: </span>
                      <span className="font-bold text-sky-900">{inv.payments?.length ?? 0}</span></div>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    {isLegacySettled(inv)
                      ? 'سُوِّيت قبل تشغيل PMS بتأكيد الإدارة. لا يوجد داخل النظام سند دفع تشغيلي ولا تاريخ سداد — ولم يُنشأ أي سجل دفع.'
                      : 'إشعار دائن يخفّض الالتزام. لا يمثّل سداداً ولا يُحتسب ضمن مدفوعات PMS.'}
                  </p>
                </div>
              )}

              {/* Payment status vs Approval status (distinct) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-[11px] text-gray-400 mb-1">{t('inv.payStatus')}</p>
                  <Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : inv.status === 'cancelled' ? 'neutral' : 'danger'}>{statusLabel[inv.status]}</Badge>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-[11px] text-gray-400 mb-1">{t('inv.approval')}</p>
                  <select value={inv.approval_status || ''}
                    onChange={async (e) => { const ns = e.target.value || null; const today = new Date().toISOString().slice(0, 10); await api.put(`/api/invoices/${inv.id}`, { approval_status: ns, approval_status_date: ns ? today : null }); await load(); setDetail((d) => d ? { ...d, approval_status: ns || '', approval_status_date: ns ? today : '' } as any : d); }}
                    className={cx('text-xs border rounded-full px-2 py-1 cursor-pointer focus:outline-none', inv.approval_status ? approvalColor[inv.approval_status] : 'bg-gray-50 text-gray-500')}>
                    <option value="">— {t('sup.none')} —</option>
                    <option value="booking_waiting_payment">Booking - Waiting Payment</option>
                    <option value="waiting_approval">Waiting Approval</option>
                    <option value="waiting_po">Waiting PO</option>
                    <option value="send_to_pay">Send to Pay</option>
                    <option value="hold">Hold</option>
                    <option value="delivery_missing">Delivery Missing</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              {/* Actual payment transactions (real Payment rows only) */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">{t('inv.transactions')}</h4>
                {payRows.length ? (
                  <div className="space-y-1">{payRows.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-700">{p.payment_date?.slice(0, 10) || '—'} · {p.payment_method || ''}</span>
                      <span className="tabular-nums text-emerald-700">{fmtMoneyC(p.amount, p.currency || inv.currency)}</span>
                    </div>
                  ))}</div>
                ) : approvalPaidNoTxn ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs text-amber-800">{t('inv.paidNoTxn')}</div>
                ) : <p className="text-xs text-gray-400">{t('inv.noTxn')}</p>}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {inv.status !== 'paid' && inv.status !== 'cancelled' && <Button size="sm" variant="success" icon="coins" onClick={() => { setDetail(null); openSettle(inv); }}>💵 سداد</Button>}
                {inv.status !== 'paid' && inv.status !== 'cancelled' && <Button size="sm" variant="outline" icon="check" onClick={() => { setDetail(null); openPay(inv); }}>{t('inv.pay')}</Button>}
                <Button size="sm" variant="outline" icon="clipboard" onClick={() => { setDetail(null); openEdit(inv); }}>{t('inv.editShort')}</Button>
                <Button size="sm" variant="outline" icon="file" onClick={() => { setDetail(null); openAttachments(inv); }}>{t('inv.attachments')}</Button>
              </div>

              {/* تقارير سياقية لمورد/مركب هذه الفاتورة */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1.5">تقارير سريعة</p>
                <div className="flex flex-wrap gap-2">
                  {inv.supplier?.id && <>
                    <Button size="sm" variant="ghost" icon="receipt" onClick={() => { setDetail(null); openReports({ report: 'statement', supplierId: inv.supplier!.id }); }}>كشف حساب المورد</Button>
                    <Button size="sm" variant="ghost" icon="factory" onClick={() => { setDetail(null); openReports({ report: 'unpaid', supplierId: inv.supplier!.id }); }}>مستحقات المورد</Button>
                  </>}
                  {inv.vessel?.id && <Button size="sm" variant="ghost" icon="clipboard" onClick={() => { setDetail(null); openReports({ report: 'vessel', vesselId: inv.vessel!.id }); }}>موردو المركب</Button>}
                </div>
              </div>
            </div>
          );
        })()}
      </Drawer>

      <SupplierReports open={reportsOpen} onClose={() => setReportsOpen(false)} suppliers={suppliers} vessels={vessels} initial={reportsInit} />

      {/* ── السداد السريع ────────────────────────────────────────────────────
          نفس نقطة نهاية شاشة الدفعات (POST /api/payments) ⇒ نفس الحرّاس ونفس
          الأثر في كل التقارير. لا منطق مالي مكرَّر هنا. */}
      {settleInv && (() => {
        const rem = remainingOf(settleInv);
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1">تسجيل سداد</h3>
            <p className="text-sm text-gray-600 mb-3">
              فاتورة <span className="font-mono font-medium text-blue-700">{settleInv.invoice_number}</span>
              {settleInv.supplier?.name ? <> — {settleInv.supplier.name}</> : null}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="rounded-lg border border-gray-100 p-2">
                <p className="text-[10px] text-gray-400">الإجمالي</p>
                <p className="text-sm font-bold tabular-nums">{fmtMoney(settleInv.total_amount)}</p></div>
              <div className="rounded-lg border border-gray-100 p-2">
                <p className="text-[10px] text-gray-400">المسدَّد</p>
                <p className="text-sm font-bold tabular-nums text-emerald-700">{fmtMoney(settleInv.paid_amount)}</p></div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                <p className="text-[10px] text-amber-700">المتبقّي</p>
                <p className="text-sm font-extrabold tabular-nums text-amber-800">{fmtMoney(rem)}</p></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">المبلغ</label>
                <input type="number" step="0.01" value={settleForm.amount}
                  onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                {/* العملة من الفاتورة قطعياً — الخادم يرفض أي اختلاف ولا يجري تحويلاً */}
                <label className="block text-xs text-gray-500 mb-1">العملة (من الفاتورة)</label>
                <div className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 font-medium">{settleInv.currency}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">تاريخ السداد</label>
                <input type="date" value={settleForm.payment_date}
                  onChange={(e) => setSettleForm({ ...settleForm, payment_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نوع الدفع</label>
                <select value={settleForm.payment_type}
                  onChange={(e) => setSettleForm({ ...settleForm, payment_type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="advance">مقدم</option><option value="installment">قسط</option><option value="full">سداد كامل</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">طريقة الدفع</label>
                <select value={settleForm.payment_method}
                  onChange={(e) => setSettleForm({ ...settleForm, payment_method: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="bank_transfer">تحويل بنكي</option><option value="cheque">شيك</option><option value="cash">نقدي</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">رقم المرجع / التحويل</label>
                <input value={settleForm.reference}
                  onChange={(e) => setSettleForm({ ...settleForm, reference: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
              <input value={settleForm.notes}
                onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>

            <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
              يُنشئ سجل دفع فعلياً — تُشتقّ منه حالة الفاتورة والمبلغ المسدَّد، ويظهر في
              شاشة الدفعات وكشف حساب المورد والتقارير كأي سداد آخر.
              <strong className="text-gray-600"> سجّل رقم التحويل البنكي</strong> لتفادي تكرار السداد.
            </p>
            {settleError && <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{settleError}</p>}

            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setSettleInv(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50">إلغاء</button>
              <button onClick={confirmSettle} disabled={settleSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                {settleSaving ? 'جاري الحفظ...' : '💵 تأكيد السداد'}
              </button>
            </div>
          </div>
        </div>);
      })()}

      {payInv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-1">اعتماد الفاتورة للصرف</h3>
            <p className="text-sm text-gray-600 mb-3">
              فاتورة <span className="font-mono font-medium text-blue-700">{payInv.invoice_number}</span> — مبلغ{' '}
              <span className="font-medium">{Number(payInv.total_amount).toLocaleString()} {payInv.currency}</span>
            </p>
            {/* الوعد يجب أن يطابق الفعل: هذا الإجراء يضبط حالة الاعتماد فقط.
                كان معنوناً «تسجيل دفع الفاتورة» بينما لا يُنشئ أي سجل دفع. */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 mb-4">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                هذا الإجراء يغيّر <strong>حالة الاعتماد</strong> فقط ولا يُسجّل سداداً.
                لتسجيل سداد فعلي بمبلغ ومرجع بنكي، استخدم شاشة <strong>الدفعات</strong>.
              </p>
            </div>
            <label className="block text-sm text-gray-600 mb-1">تاريخ الاعتماد</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayInv(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50">إلغاء</button>
              <button onClick={confirmPay} disabled={!payDate || paySaving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                {paySaving ? 'جاري الحفظ...' : '✅ تأكيد الاعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}

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
