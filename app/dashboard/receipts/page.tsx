'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Badge, Input, Select, Field, Skeleton, EmptyState, Modal, useToast, cx } from '@/components/ui';

/*
 * تأكيد استلام السلع والخدمات.
 *
 * قائمة عمل لا سجلّ: تعرض ما يعطّل الدفتر الآن وحده، وتفرغ حين ينتهي العمل —
 * والفراغ نفسه مؤشّر يُقرأ.
 *
 * ⚠️ هذه ليست شاشة اعتماد صرف. من يؤكّد الاستلام يشهد أن البضاعة وصلت، لا أن
 * الفاتورة تُدفع. الحالتان منفصلتان في النظام عمداً.
 */

const money = (n: any, c?: string) =>
  `${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`;
const dateOnly = (d: any) => (d ? String(d).slice(0, 10) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const TYPES = [
  { v: 'GOODS_RECEIVED', label: 'استلام سلع', hint: 'وصلت البضاعة فعلاً' },
  { v: 'SERVICE_CONFIRMED', label: 'تأكيد خدمة', hint: 'أُدّيت الخدمة أو انقضت فترتها' },
  { v: 'MANAGEMENT_RECEIPT_CONFIRMATION', label: 'إقرار إداري', hint: 'بديل عن دليل غائب — يلزمه مرجع' },
];

interface Inv {
  id: string; invoice_number: string; currency: string; total_amount: string;
  invoice_date: string; approval_status: string;
  supplier?: { name: string }; vessel?: { name: string };
  _receipts?: number;
}

export default function ReceiptsPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [summary, setSummary] = useState<{ awaiting: number; confirmed: number; in_ledger: number } | null>(null);
  const [entity, setEntity] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);

  const [target, setTarget] = useState<Inv | null>(null);
  const [form, setForm] = useState({ receipt_type: 'GOODS_RECEIVED', received_date: today(), reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  async function load() {
    setLoading(true);
    try {
      // نداءان لا نداء لكل فاتورة: العدّ والاستبعاد يتمّان في قاعدة البيانات.
      // الدفتر يخصّ كياناً واحداً ومراكبه. عرض الأسطول كلّه هنا يُظهر عملاً
      // ليس عملاً — فواتير مراكب شركات أخرى لا تدخل هذا الدفتر أصلاً.
      let eid = entity?.id;
      if (!eid) {
        const { data } = await api.get('/api/accounting/entities');
        if (data?.length) { setEntity({ id: data[0].id, name: data[0].name }); eid = data[0].id; }
      }
      const scope = eid ? `?legal_entity_id=${eid}` : '';
      const [pRes, sRes] = await Promise.allSettled([
        api.get(`/api/receipts/pending${scope}`),
        api.get(`/api/receipts/summary${scope}`),
      ]);
      if (pRes.status === 'fulfilled') {
        setInvoices((pRes.value.data || []).map((r: any) => ({
          ...r,
          supplier: r.supplier_name ? { name: r.supplier_name } : undefined,
          vessel: r.vessel_name ? { name: r.vessel_name } : undefined,
          _receipts: Number(r.receipt_count ?? 0),
        })));
      }
      if (sRes.status === 'fulfilled') setSummary(sRes.value.data || null);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return invoices
      .filter((i) => (onlyMissing ? (i._receipts ?? 0) === 0 : true))
      .filter((i) => !s || [i.invoice_number, i.supplier?.name, i.vessel?.name].some((v) => (v || '').toLowerCase().includes(s)))
      .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));
  }, [invoices, q, onlyMissing]);

  const missingCount = summary?.awaiting ?? invoices.filter((i) => (i._receipts ?? 0) === 0).length;

  function open(i: Inv) {
    setTarget(i);
    setFormErr('');
    setForm({ receipt_type: 'GOODS_RECEIVED', received_date: i.invoice_date?.slice(0, 10) || today(), reference: '', notes: '' });
  }

  async function save() {
    if (!target) return;
    if (form.receipt_type === 'MANAGEMENT_RECEIPT_CONFIRMATION' && !form.reference.trim()) {
      setFormErr('الإقرار الإداري يحتاج مرجعاً صريحاً — لا يُسجَّل بلا سند يُراجَع');
      return;
    }
    setSaving(true); setFormErr('');
    try {
      await api.post(`/api/invoices/${target.id}/receipts`, form);
      toast.success(`سُجّل استلام ${target.invoice_number}`);
      setTarget(null);
      await load();
    } catch (e: any) {
      setFormErr(e?.response?.data?.message || 'تعذّر التسجيل');
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">تأكيد الاستلام</h1>
          <p className="text-sm text-gray-500">
            فواتير لم تُؤكَّد استلاماً ولم تدخل الدفتر بعد
            {entity && <> — نطاق <b>{entity.name}</b> ومراكبها وحدها</>}
          </p>
        </div>
        <Button variant="secondary" onClick={load}>تحديث</Button>
      </header>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
        تأكيد الاستلام <b>ليس اعتماد صرف</b>. من يؤكّد هنا يشهد أن البضاعة وصلت أو الخدمة أُدّيت — لا أن الفاتورة تُدفع.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-gray-500">تنتظر تأكيداً</div>
          <div className="text-2xl font-bold">{missingCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">مؤكَّدة ولم تُرحَّل</div>
          <div className="text-2xl font-bold">{summary?.confirmed ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">دخلت الدفتر</div>
          <div className="text-2xl font-bold">{summary?.in_ledger ?? 0}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input placeholder="بحث برقم الفاتورة أو المورّد أو المركب…" value={q}
            onChange={(e: any) => setQ(e.target.value)} className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            بلا تأكيد فقط
          </label>
        </div>

        {loading ? <div className="p-4 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          : !shown.length ? (
            <EmptyState icon="check" title="لا شيء ينتظر"
              description={onlyMissing ? 'كل الفواتير المعلَّقة مؤكَّدة الاستلام.' : 'لا نتائج بهذا البحث.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-right">الفاتورة</th>
                    <th className="px-4 py-2 text-right">المورّد</th>
                    <th className="px-4 py-2 text-right">المركب</th>
                    <th className="px-4 py-2 text-right">التاريخ</th>
                    <th className="px-4 py-2 text-left">المبلغ</th>
                    <th className="px-4 py-2 text-center">الاستلام</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shown.map((i) => (
                    <tr key={i.id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-2 font-mono text-xs">{i.invoice_number}</td>
                      <td className="px-4 py-2"><div className="max-w-[16rem] truncate">{i.supplier?.name || '—'}</div></td>
                      <td className="px-4 py-2 text-gray-600">{i.vessel?.name || '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{dateOnly(i.invoice_date)}</td>
                      <td className="px-4 py-2 text-left tabular-nums whitespace-nowrap">{money(i.total_amount, i.currency)}</td>
                      <td className="px-4 py-2 text-center">
                        {(i._receipts ?? 0) > 0
                          ? <Badge tone="success">{i._receipts} واقعة</Badge>
                          : i.approval_status === 'delivery_missing'
                            ? <Badge tone="danger">تسليم مفقود</Badge>
                            : <Badge tone="warning">بلا تأكيد</Badge>}
                      </td>
                      <td className="px-4 py-2 text-left">
                        <Button size="sm" variant="primary" onClick={() => open(i)}>تأكيد استلام</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Modal open={!!target} onClose={() => !saving && setTarget(null)}
        title={target ? `تأكيد استلام ${target.invoice_number}` : ''}>
        {target && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div><span className="text-gray-500">المورّد:</span> {target.supplier?.name || '—'}</div>
              <div><span className="text-gray-500">المبلغ:</span> {money(target.total_amount, target.currency)}</div>
              {target.approval_status === 'delivery_missing' && (
                <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
                  النظام يصرّح بغياب التسليم على هذه الفاتورة. تأكيدها هنا يعني أنك تنقض ذلك التصريح صراحةً.
                </div>
              )}
            </div>

            <Field label="نوع الواقعة">
              <Select value={form.receipt_type} onChange={(e: any) => setForm({ ...form, receipt_type: e.target.value })}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </Select>
            </Field>
            <p className="-mt-2 text-xs text-gray-500">{TYPES.find((t) => t.v === form.receipt_type)?.hint}</p>

            <Field label="تاريخ الاستلام">
              <Input type="date" value={form.received_date} onChange={(e: any) => setForm({ ...form, received_date: e.target.value })} />
            </Field>

            <Field label={form.receipt_type === 'MANAGEMENT_RECEIPT_CONFIRMATION' ? 'المرجع (مطلوب)' : 'المرجع'}>
              <Input placeholder="رقم إذن الاستلام · إشعار التسليم · سند الإقرار"
                value={form.reference} onChange={(e: any) => setForm({ ...form, reference: e.target.value })} />
            </Field>

            <Field label="ملاحظات">
              <Input value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} />
            </Field>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              الواقعة <b>دليل</b> — بعد تسجيلها لا تُعدَّل ولا تُحذف. التصحيح يكون بتسجيل واقعة جديدة.
            </div>

            {formErr && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{formErr}</div>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>إلغاء</Button>
              <Button variant="primary" onClick={save} loading={saving}>تسجيل الواقعة</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
