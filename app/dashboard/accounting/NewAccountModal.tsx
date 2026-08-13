'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Button, Input, Select, Field, Modal, useToast } from '@/components/ui';

/*
 * نموذج إنشاء حساب — مشترك بين شاشة الإعداد وأي مكان يحتاجه.
 *
 * إنشاء حساب قرارٌ في هيكل الدليل لا اختصار في نافذة. فحيثما أُنشئ يأخذ نموذجه
 * الكامل: الرمز والتصنيف والمجموعة والأب وكونه تجميعياً أم فرعياً. نموذجٌ واحد
 * وقواعد واحدة ومدخلان — لا نسختان تفترقان بمرور الوقت.
 *
 * والحساب المُنشأ هنا هو **نفسه** في شجرة الحسابات: الدليل واحد.
 */

export const ACCOUNT_TYPES = [
  { v: 'expense', label: 'مصروف', normal: 'debit' },
  { v: 'revenue', label: 'إيراد', normal: 'credit' },
  { v: 'asset', label: 'أصل', normal: 'debit' },
  { v: 'liability', label: 'التزام', normal: 'credit' },
  { v: 'equity', label: 'حقوق ملكية', normal: 'credit' },
];
export const ACCOUNT_GROUPS = ['VESSEL_OPEX', 'ADMIN', 'FINANCE', 'REVENUE', 'BANK', 'CASH',
  'RECEIVABLES', 'PAYABLES', 'ACCRUALS', 'TAX', 'PREPAYMENTS', 'FIXED_ASSETS',
  'RELATED_PARTY', 'DEFERRED_INCOME', 'EQUITY', 'DRY_DOCK', 'ASSETS'];

interface Props {
  open: boolean;
  onClose: () => void;
  entityId: string;
  /** التصنيف المقترح عند الفتح — المصروف حيث يُطلب حساب مصروف. */
  defaultType?: string;
  /** يُستدعى بالحساب بعد إنشائه، فيستطيع المستدعي اختياره فوراً. */
  onCreated?: (account: any) => void;
}

export default function NewAccountModal({ open, onClose, entityId, defaultType = 'expense', onCreated }: Props) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', account_type: defaultType,
    account_group: 'VESSEL_OPEX', parent_id: '', is_postable: true,
    is_monetary: false, currency_restriction: '',
  });

  useEffect(() => {
    if (!open || !entityId) return;
    setErr('');
    setForm((f) => ({ ...f, code: '', name: '', name_ar: '', account_type: defaultType, parent_id: '' }));
    api.get(`/api/accounting/accounts?legal_entity_id=${entityId}`)
      .then(({ data }) => setAccounts(data || []))
      .catch(() => setErr('تعذّر تحميل دليل الحسابات'));
  }, [open, entityId, defaultType]);

  // الآباء المتاحون: التجميعية من نفس التصنيف وحدها — وهو ما يفرضه الخادم أيضاً.
  const parents = useMemo(
    () => accounts.filter((a) => !a.is_postable && a.account_type === form.account_type),
    [accounts, form.account_type]);

  const taken = accounts.some((a) => a.code === form.code.trim());

  async function save() {
    if (!form.code.trim() || !form.name.trim()) { setErr('الرمز والاسم مطلوبان'); return; }
    setSaving(true); setErr('');
    try {
      const normal = ACCOUNT_TYPES.find((t) => t.v === form.account_type)?.normal ?? 'debit';
      const { data } = await api.post('/api/accounting/accounts', {
        legal_entity_id: entityId,
        code: form.code.trim(), name: form.name.trim(), name_ar: form.name_ar.trim() || null,
        account_type: form.account_type, account_group: form.account_group || null,
        normal_balance: normal, parent_id: form.parent_id || null,
        is_postable: form.is_postable, is_monetary: form.is_monetary,
        is_related_party: false, requires_subledger: false,
        currency_restriction: form.currency_restriction || null,
      });
      toast.success(`أُنشئ الحساب ${data.code} — وظهر في شجرة الحسابات`);
      onCreated?.(data);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر الإنشاء');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="حساب جديد" size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="الرمز *" error={taken ? 'الرمز مستخدم في هذا الكيان' : undefined}>
          <Input value={form.code} dir="ltr" placeholder="5140"
            onChange={(e: any) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="التصنيف">
          <Select value={form.account_type}
            onChange={(e: any) => setForm({ ...form, account_type: e.target.value, parent_id: '' })}>
            {ACCOUNT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="الاسم (إنجليزي) *">
          <Input value={form.name} dir="ltr" onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="الاسم (عربي)">
          <Input value={form.name_ar} onChange={(e: any) => setForm({ ...form, name_ar: e.target.value })} />
        </Field>
        <Field label="المجموعة">
          <Select value={form.account_group} onChange={(e: any) => setForm({ ...form, account_group: e.target.value })}>
            {ACCOUNT_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </Field>
        <Field label="الحساب الأب">
          <Select value={form.parent_id} onChange={(e: any) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">— بلا أب (مستوى أول) —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>

        <div className="sm:col-span-2 rounded-lg border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_postable}
              onChange={(e) => setForm({ ...form, is_postable: e.target.checked })} />
            <span><b>فرعي</b> — يُرحَّل إليه مباشرةً</span>
          </label>
          <p className="text-xs text-gray-500">
            أزل العلامة ليصير <b>تجميعياً</b>: لا يُرحَّل إليه ويصلح أباً لحسابات تحته.
            {!form.is_postable && ' — ولن يظهر في قوائم اختيار حساب المصروف.'}
          </p>
        </div>

        {form.account_type === 'asset' && (
          <Field label="قيد العملة (اختياري)">
            <Input value={form.currency_restriction} dir="ltr" placeholder="USD"
              onChange={(e: any) => setForm({ ...form, currency_restriction: e.target.value.toUpperCase() })} />
          </Field>
        )}
      </div>

      {!parents.length && (
        <p className="mt-3 text-xs text-gray-500">
          لا حساب تجميعي لهذا التصنيف بعد — أنشئ واحداً أولاً إن أردت شجرة.
        </p>
      )}
      {err && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>إلغاء</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={taken}>إنشاء</Button>
      </div>
    </Modal>
  );
}
