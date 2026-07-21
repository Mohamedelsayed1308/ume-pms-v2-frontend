'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';

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

interface InvoiceRow {
  id: string;
  invoice_number: string;
  vessel: { name: string } | null;
  total_amount: number;
  paid_amount: number;
  currency: string;
  checked: boolean;
  amount: string;
}

const typeLabel: Record<string, string> = { advance: 'مقدم', installment: 'قسط', full: 'سداد كامل' };
const methodLabel: Record<string, string> = { bank_transfer: 'تحويل بنكي', cheque: 'شيك', cash: 'نقدي' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };

const emptyShared = {
  payment_date: '',
  payment_type: 'installment',
  payment_method: 'bank_transfer',
  reference: '',
  notes: '',
  currency: 'USD',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [shared, setShared] = useState(emptyShared);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  function openModal() {
    setSelectedSupplierId('');
    setInvoiceRows([]);
    setShared(emptyShared);
    setError('');
    setShowModal(true);
  }

  function onSupplierChange(supplierId: string) {
    setSelectedSupplierId(supplierId);
    setError('');
    const filtered = allInvoices.filter((i) => i.supplier?.id === supplierId);
    setInvoiceRows(filtered.map((inv) => {
      const remaining = +inv.total_amount - +inv.paid_amount;
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        vessel: inv.vessel,
        total_amount: +inv.total_amount,
        paid_amount: +inv.paid_amount,
        currency: inv.currency,
        checked: false,
        amount: remaining > 0 ? String(remaining) : '0',
      };
    }));
  }

  function toggleRow(id: string) {
    setInvoiceRows((rows) => rows.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  }

  function setRowAmount(id: string, val: string) {
    setInvoiceRows((rows) => rows.map((r) => r.id === id ? { ...r, amount: val } : r));
  }

  function selectAll() {
    setInvoiceRows((rows) => rows.map((r) => ({ ...r, checked: true })));
  }

  const checkedRows = invoiceRows.filter((r) => r.checked);
  const totalSelected = checkedRows.reduce((s, r) => s + (+r.amount || 0), 0);

  async function handleSaveAll() {
    if (checkedRows.length === 0) { setError('اختر فاتورة واحدة على الأقل'); return; }
    const invalid = checkedRows.find((r) => !r.amount || +r.amount <= 0);
    if (invalid) { setError(`المبلغ غير صحيح للفاتورة ${invalid.invoice_number}`); return; }
    if (!shared.payment_date) { setError('تاريخ الدفع مطلوب'); return; }
    setSaving(true);
    setError('');
    try {
      await Promise.all(checkedRows.map((r) =>
        api.post('/api/payments', {
          invoice_id: r.id,
          amount: parseFloat(r.amount),
          currency: shared.currency,
          payment_date: shared.payment_date,
          payment_type: shared.payment_type,
          payment_method: shared.payment_method,
          reference: shared.reference || null,
          notes: shared.notes || null,
        })
      ));
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
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
        <button onClick={openModal} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
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

      {/* Multi-Invoice Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-lg">تسجيل دفعة</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Supplier */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">المورد *</label>
                <select value={selectedSupplierId} onChange={(e) => onSupplierChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Invoice Table */}
              {selectedSupplierId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-600 font-medium">الفواتير غير المسددة</label>
                    {invoiceRows.length > 0 && (
                      <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">تحديد الكل</button>
                    )}
                  </div>

                  {invoiceRows.length === 0 ? (
                    <p className="text-center py-6 text-gray-400 border rounded-lg">لا توجد فواتير مستحقة لهذا المورد</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-right">
                          <tr>
                            <th className="px-3 py-2 w-8"></th>
                            <th className="px-3 py-2">رقم الفاتورة</th>
                            <th className="px-3 py-2">السفينة</th>
                            <th className="px-3 py-2">إجمالي</th>
                            <th className="px-3 py-2">المدفوع</th>
                            <th className="px-3 py-2 text-red-600">المتبقي</th>
                            <th className="px-3 py-2">المبلغ المراد دفعه</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceRows.map((row) => {
                            const remaining = row.total_amount - row.paid_amount;
                            return (
                              <tr key={row.id} className={`border-t ${row.checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2 text-center">
                                  <input type="checkbox" checked={row.checked} onChange={() => toggleRow(row.id)}
                                    className="w-4 h-4 cursor-pointer" />
                                </td>
                                <td className="px-3 py-2 font-mono text-blue-700">{row.invoice_number}</td>
                                <td className="px-3 py-2 text-gray-600">{row.vessel?.name || '—'}</td>
                                <td className="px-3 py-2">{row.total_amount.toLocaleString()} {row.currency}</td>
                                <td className="px-3 py-2 text-green-600">{row.paid_amount.toLocaleString()}</td>
                                <td className="px-3 py-2 text-red-600 font-bold">{remaining.toLocaleString()}</td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={row.amount}
                                    onChange={(e) => setRowAmount(row.id, e.target.value)}
                                    disabled={!row.checked}
                                    className="w-32 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {checkedRows.length > 0 && (
                          <tfoot className="bg-gray-100 font-bold text-sm border-t">
                            <tr>
                              <td colSpan={6} className="px-3 py-2 text-right">
                                إجمالي الدفع ({checkedRows.length} فاتورة):
                              </td>
                              <td className="px-3 py-2 text-blue-700">{totalSelected.toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Shared Fields */}
              {selectedSupplierId && invoiceRows.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">بيانات الدفعة (مشتركة لكل الفواتير المختارة)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">تاريخ الدفع *</label>
                      <input type="date" value={shared.payment_date} onChange={(e) => setShared({ ...shared, payment_date: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">العملة</label>
                      <select value={shared.currency} onChange={(e) => setShared({ ...shared, currency: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">نوع الدفع</label>
                      <select value={shared.payment_type} onChange={(e) => setShared({ ...shared, payment_type: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="advance">مقدم</option>
                        <option value="installment">قسط</option>
                        <option value="full">سداد كامل</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">طريقة الدفع</label>
                      <select value={shared.payment_method} onChange={(e) => setShared({ ...shared, payment_method: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="bank_transfer">تحويل بنكي</option>
                        <option value="cheque">شيك</option>
                        <option value="cash">نقدي</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">رقم المرجع / التحويل</label>
                      <input value={shared.reference} onChange={(e) => setShared({ ...shared, reference: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
                      <input value={shared.notes} onChange={(e) => setShared({ ...shared, notes: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-4">
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveAll} disabled={saving || checkedRows.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                  {saving ? 'جاري الحفظ...' : `حفظ ${checkedRows.length > 0 ? `(${checkedRows.length} فاتورة — إجمالي ${totalSelected.toLocaleString()})` : ''}`}
                </button>
                <button onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
