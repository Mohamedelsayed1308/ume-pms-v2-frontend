'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { expenseAccountOptions, accountOptionLabel } from '@/lib/accounting';
import { Button, Badge, Field, Select, Input, Modal, Skeleton, useToast, IconButton } from '@/components/ui';

/*
 * زرّ «إلى الدفتر» ونافذة مراجعته.
 *
 * مكوّن مستقل عن شاشة الفواتير (1800 سطر) — يُستدعى بفاتورة ويعيد نفسه، فلا
 * تتضخّم الشاشة بمنطق محاسبي لا يخصّها.
 *
 * ⚠️ النافذة **تعرض الأسطر قبل الإنشاء**. تجربة يوليو أثبتت مرّتين أن رؤية
 * الأرقام تمسك ما لا تمسكه الثقة: مرّة في سبب الأثر الرجعي، ومرّة في اتجاه
 * سعر الصرف.
 */

const money = (n: any, c?: string) =>
  `${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`;

interface Props {
  invoice: any;
  onDone?: () => void;
  /** يظهر مصغَّراً في صفّ الجدول، وكزرّ كامل في نافذة التفاصيل. */
  compact?: boolean;
}

export default function PostToLedger({ invoice, onDone, compact }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [entity, setEntity] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [existing, setExisting] = useState<any>(null);
  const [preset, setPreset] = useState<any>(null);
  const [canPost, setCanPost] = useState(false);

  const [form, setForm] = useState({
    debit_account_id: '', category: 'GOODS',
    service_period_end: '', backdated_reason: '', save_default: false,
  });

  async function prepare() {
    setOpen(true); setLoading(true); setErr('');
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setCanPost(u?.role === 'admin' || (u?.allowed_screens || []).includes('/dashboard/accounting/posting'));

      const { data: ents } = await api.get('/api/accounting/entities');
      const e = ents?.[0];
      setEntity(e);
      if (!e) { setErr('لا كيان محاسبي معرَّف'); return; }

      const [accRes, entRes, defRes] = await Promise.allSettled([
        api.get(`/api/accounting/accounts?legal_entity_id=${e.id}`),
        api.get('/api/accounting/entries'),
        api.get(`/api/accounting/bridge/supplier-defaults?legal_entity_id=${e.id}`),
      ]);

      if (accRes.status === 'fulfilled') {
        // المصروفات كلها، ومن الأصول اثنان فقط يصحّ أن تُحمَّل عليهما فاتورة
        // مورّد: المقدَّم (خدمة متعددة الفترات) والرسملة (أصل يُضاف للمركب).
        // البنوك والذمم لا يُرحَّل إليها مصروف فاتورة أصلاً — فوجودها في القائمة
        // خطر اختيار لا مرونة.
        setAccounts(expenseAccountOptions(accRes.value.data || []));
      }
      if (entRes.status === 'fulfilled') {
        const hit = (entRes.value.data || []).find((x: any) =>
          x.source_type === 'invoice' && x.source_id === invoice.id && x.status !== 'void');
        setExisting(hit ?? null);
      }
      let d: any = null;
      if (defRes.status === 'fulfilled') {
        d = (defRes.value.data || []).find((x: any) => x.supplier_id === invoice.supplier_id) ?? null;
        setPreset(d);
      }

      const backdated = (invoice.invoice_date || '') < new Date().toISOString().slice(0, 10);
      setForm({
        debit_account_id: d?.debit_account_id || '',
        category: d?.accrual_category || 'GOODS',
        service_period_end: '',
        backdated_reason: backdated
          ? `إثبات فاتورة ${invoice.invoice_number} المؤرَّخة ${String(invoice.invoice_date).slice(0, 10)} — الدفتر بدأ التشغيل الفعلي في أغسطس 2026.`
          : '',
        save_default: !d,
      });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر التحضير');
    } finally { setLoading(false); }
  }

  async function submit(alsoPost: boolean) {
    if (!entity) return;
    if (!form.debit_account_id) { setErr('اختر حساب المصروف'); return; }
    setBusy(true); setErr('');
    try {
      if (form.save_default) {
        await api.put('/api/accounting/bridge/supplier-defaults', {
          legal_entity_id: entity.id, supplier_id: invoice.supplier_id,
          debit_account_id: form.debit_account_id, accrual_category: form.category,
        }).catch(() => { /* الافتراضي راحة لا شرط — فشله لا يمنع القيد */ });
      }
      const { data } = await api.post(`/api/accounting/bridge/supplier-invoice/${invoice.id}`, {
        legal_entity_id: entity.id,
        debit_account_id: form.debit_account_id,
        category: form.category,
        service_period_end: form.service_period_end || undefined,
        backdated_reason: form.backdated_reason || undefined,
      });

      if (alsoPost) {
        const { data: posted } = await api.post(`/api/accounting/entries/${data.entry.id}/post`);
        toast.success(`رُحِّل ${posted.entry_no}`);
      } else {
        toast.success('أُنشئت مسوّدة القيد — راجعها في شاشة المحاسبة');
      }
      setOpen(false); onDone?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر الإنشاء');
    } finally { setBusy(false); }
  }

  const acct = accounts.find((a) => a.id === form.debit_account_id);
  const backdated = (invoice.invoice_date || '') < new Date().toISOString().slice(0, 10);

  return (
    <>
      {/*
        * في صفّ الجدول يقف هذا الزرّ بين ستّة أفعال أخرى صارت أيقونات، فبقاؤه
        * نصّاً بإيموجي يكسر الصفّ ويُشغل ضعف ما يستحقّ. والتلميح يحمل الاسم
        * كاملاً، فلا يضيع المعنى.
        */}
      {compact
        ? <IconButton icon="clipboard" label="ترحيل إلى دفتر الأستاذ" size="sm"
            className="text-indigo-600 hover:bg-indigo-50" onClick={prepare} />
        : <Button size="sm" variant="outline" icon="file" onClick={prepare}>إلى الدفتر</Button>}

      <Modal open={open} onClose={() => !busy && setOpen(false)}
        title={`قيد استحقاق — ${invoice.invoice_number}`} size="lg">
        {loading ? <Skeleton className="h-56" /> : (
          <div className="space-y-4">
            {existing ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                لهذه الفاتورة قيد بالفعل: <b>{existing.entry_no || 'مسوّدة'}</b> ({existing.status}).
                الفاتورة لا تُستحقّ مرتين.
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-gray-50 p-3 text-sm grid grid-cols-2 gap-2">
                  <div><span className="text-gray-500">المورّد:</span> {invoice.supplier?.name || '—'}</div>
                  <div><span className="text-gray-500">المركب:</span> {invoice.vessel?.name || '—'}</div>
                  <div><span className="text-gray-500">التاريخ:</span> {String(invoice.invoice_date).slice(0, 10)}</div>
                  <div><span className="text-gray-500">المبلغ:</span> {money(invoice.total_amount, invoice.currency)}</div>
                </div>

                {preset && (
                  <div className="text-xs text-gray-500">
                    افتراضي هذا المورّد: <b>{preset.account_code} {preset.account_name}</b> ·{' '}
                    {preset.accrual_category === 'GOODS' ? 'سلع' : 'خدمة بفترة'}
                  </div>
                )}

                <Field label="حساب المصروف">
                  <Select value={form.debit_account_id} onChange={(e: any) => setForm({ ...form, debit_account_id: e.target.value })}>
                    <option value="">— اختر —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}{a.account_group === 'VESSEL_OPEX' ? '  [تشغيل مركب]'
                          : a.account_group === 'ADMIN' ? '  [إدارية]'
                          : a.account_group === 'FINANCE' ? '  [تمويلية]' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="التصنيف">
                  <Select value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })}>
                    <option value="GOODS">سلع — تحتاج واقعة استلام</option>
                    <option value="PERIOD_SERVICE">خدمة بفترة — تُستحقّ بانقضائها</option>
                  </Select>
                </Field>

                {form.category === 'PERIOD_SERVICE' && (
                  <Field label="نهاية فترة الخدمة">
                    <Input type="date" value={form.service_period_end}
                      onChange={(e: any) => setForm({ ...form, service_period_end: e.target.value })} />
                  </Field>
                )}

                {backdated && (
                  <Field label="سبب الأثر الرجعي (مطلوب)">
                    <Input value={form.backdated_reason}
                      onChange={(e: any) => setForm({ ...form, backdated_reason: e.target.value })} />
                  </Field>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.save_default}
                    onChange={(e) => setForm({ ...form, save_default: e.target.checked })} />
                  احفظه افتراضياً لهذا المورّد
                </label>

                {/* المراجعة: الأسطر كما ستُنشأ، بالعملة وبما يقابلها */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">القيد كما سيُنشأ</div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2">{acct ? `${acct.code} — ${acct.name}` : <span className="text-gray-400">اختر الحساب</span>}</td>
                        <td className="px-3 py-2 text-left tabular-nums">{money(invoice.total_amount, invoice.currency)}</td>
                        <td className="px-3 py-2 text-left w-16"><Badge tone="info">مدين</Badge></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2">2010 — دائنون</td>
                        <td className="px-3 py-2 text-left tabular-nums">{money(invoice.total_amount, invoice.currency)}</td>
                        <td className="px-3 py-2 text-left"><Badge tone="neutral">دائن</Badge></td>
                      </tr>
                    </tbody>
                  </table>
                  {invoice.currency !== 'EUR' && (
                    <div className="border-t bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      عملة أجنبية — يُستخدم سعر الصرف المعتمَد لتاريخ الفاتورة، ويُرفض القيد إن لم يوجد.
                    </div>
                  )}
                </div>
              </>
            )}

            {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>إغلاق</Button>
              {!existing && (
                <>
                  <Button variant="outline" onClick={() => submit(false)} disabled={busy}>إنشاء مسوّدة</Button>
                  {canPost && (
                    <Button variant="primary" onClick={() => submit(true)} loading={busy}>أنشئ ورحّل</Button>
                  )}
                </>
              )}
            </div>
            {canPost && !existing && (
              <p className="text-xs text-gray-400">
                «أنشئ ورحّل» فعل نهائي — بعده لا تعديل ولا حذف، والتصحيح بقيد عكس.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
