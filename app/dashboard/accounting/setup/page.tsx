'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Badge, Input, Select, Field, Skeleton, EmptyState, Modal, useToast, cx } from '@/components/ui';

/*
 * إعداد المحاسبة — شجرة الحسابات.
 *
 * الشجرة لا الزينة: الحساب **التجميعي** يجمع أبناءه ولا يُرحَّل إليه، والفرعي
 * يُرحَّل إليه ولا يُعلَّق تحته شيء. الخلط بينهما يجعل رصيد الأب خليطاً من حركته
 * وحركة أبنائه فلا يُقرأ ولا يُجمَع — ولذلك يمنعه الخادم لا الشاشة وحدها.
 */

const TYPES = [
  { v: 'expense', label: 'مصروف', normal: 'debit' },
  { v: 'revenue', label: 'إيراد', normal: 'credit' },
  { v: 'asset', label: 'أصل', normal: 'debit' },
  { v: 'liability', label: 'التزام', normal: 'credit' },
  { v: 'equity', label: 'حقوق ملكية', normal: 'credit' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.v, t.label]));
const GROUPS = ['VESSEL_OPEX', 'ADMIN', 'FINANCE', 'REVENUE', 'BANK', 'CASH', 'RECEIVABLES',
  'PAYABLES', 'ACCRUALS', 'TAX', 'PREPAYMENTS', 'FIXED_ASSETS', 'RELATED_PARTY',
  'DEFERRED_INCOME', 'EQUITY', 'DRY_DOCK', 'ASSETS'];

interface Acct {
  id: string; code: string; name: string; name_ar: string | null;
  account_type: string; account_group: string | null; system_role: string | null;
  normal_balance: string; parent_id: string | null; level: number;
  is_postable: boolean; is_active: boolean; currency_restriction: string | null;
}

export default function AccountingSetupPage() {
  const toast = useToast();
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', account_type: 'expense', account_group: 'VESSEL_OPEX',
    parent_id: '', is_postable: true, is_monetary: false, currency_restriction: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/accounting/entities');
        setEntities(data || []);
        if (data?.length) setEntityId(data[0].id);
      } catch { setLoading(false); }
    })();
  }, []);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/accounting/accounts?legal_entity_id=${id}`);
      setAccounts(data || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (entityId) load(entityId); }, [entityId]);

  // شجرة مرتَّبة بالرمز — الأب ثم أبناؤه مباشرةً تحته.
  const tree = useMemo(() => {
    const byParent = new Map<string | null, Acct[]>();
    for (const a of accounts) {
      const k = a.parent_id ?? null;
      byParent.set(k, [...(byParent.get(k) ?? []), a]);
    }
    for (const [, v] of byParent) v.sort((x, y) => x.code.localeCompare(y.code));
    const out: { acct: Acct; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const a of byParent.get(parent) ?? []) { out.push({ acct: a, depth }); walk(a.id, depth + 1); }
    };
    walk(null, 0);
    return out;
  }, [accounts]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tree.filter(({ acct: a }) => {
      if (typeFilter && a.account_type !== typeFilter) return false;
      if (!s) return true;
      return [a.code, a.name, a.name_ar, a.system_role].some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [tree, q, typeFilter]);

  // الآباء المتاحون: التجميعية من نفس التصنيف وحدها.
  const parents = useMemo(
    () => accounts.filter((a) => !a.is_postable && a.account_type === form.account_type),
    [accounts, form.account_type]);

  function openAdd() {
    setErr('');
    setForm({
      code: '', name: '', name_ar: '', account_type: 'expense', account_group: 'VESSEL_OPEX',
      parent_id: '', is_postable: true, is_monetary: false, currency_restriction: '',
    });
    setShowAdd(true);
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) { setErr('الرمز والاسم مطلوبان'); return; }
    setSaving(true); setErr('');
    try {
      const normal = TYPES.find((t) => t.v === form.account_type)?.normal ?? 'debit';
      await api.post('/api/accounting/accounts', {
        legal_entity_id: entityId,
        code: form.code.trim(), name: form.name.trim(), name_ar: form.name_ar.trim() || null,
        account_type: form.account_type, account_group: form.account_group || null,
        normal_balance: normal,
        parent_id: form.parent_id || null,
        is_postable: form.is_postable, is_monetary: form.is_monetary,
        is_related_party: false, requires_subledger: false,
        currency_restriction: form.currency_restriction || null,
      });
      toast.success(`أُنشئ الحساب ${form.code}`);
      setShowAdd(false); await load(entityId);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر الإنشاء');
    } finally { setSaving(false); }
  }

  if (loading && !accounts.length) return <div className="p-6 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  if (!entities.length) return <div className="p-6"><EmptyState title="لا كيان محاسبي" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إعداد المحاسبة</h1>
          <p className="text-sm text-gray-500">شجرة الحسابات — {accounts.length} حساباً</p>
        </div>
        <div className="flex items-center gap-2">
          {entities.length > 1 && (
            <Select value={entityId} onChange={(e: any) => setEntityId(e.target.value)}>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
          <Button variant="primary" icon="plus" onClick={openAdd}>حساب جديد</Button>
        </div>
      </header>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
        الحساب <b>التجميعي</b> يجمع أبناءه ولا يُرحَّل إليه، و<b>الفرعي</b> يُرحَّل إليه ولا يُعلَّق تحته شيء.
        رصيد أبٍ عليه حركة يصير خليطاً من حركته وحركة أبنائه فلا يُقرأ.
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input placeholder="بحث برمز أو اسم أو دور…" value={q} onChange={(e: any) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={typeFilter} onChange={(e: any) => setTypeFilter(e.target.value)}>
            <option value="">كل التصنيفات</option>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 text-right">الحساب</th>
                <th className="px-4 py-2 text-right">التصنيف</th>
                <th className="px-4 py-2 text-right">المجموعة</th>
                <th className="px-4 py-2 text-center">النوع</th>
                <th className="px-4 py-2 text-right">الدور</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(({ acct: a, depth }) => (
                <tr key={a.id} className={cx('hover:bg-blue-50/40', !a.is_postable && 'bg-gray-50/60')}>
                  <td className="px-4 py-2">
                    <span style={{ paddingInlineStart: `${depth * 1.25}rem` }} className="inline-block">
                      <span className="font-mono text-xs text-gray-500">{a.code}</span>{' '}
                      <span className={cx(!a.is_postable && 'font-semibold')}>{a.name}</span>
                      {a.name_ar && <span className="text-gray-400 text-xs"> · {a.name_ar}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{TYPE_LABEL[a.account_type] ?? a.account_type}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{a.account_group || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    {a.is_postable
                      ? <Badge tone="success">فرعي</Badge>
                      : <Badge tone="neutral">تجميعي</Badge>}
                    {a.currency_restriction && <Badge tone="info" className="mr-1">{a.currency_restriction}</Badge>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-400">{a.system_role || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <EmptyState title="لا حسابات" description="لا نتائج بهذه المرشّحات." />}
        </div>
      </Card>

      <Modal open={showAdd} onClose={() => !saving && setShowAdd(false)} title="حساب جديد" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="الرمز *"><Input value={form.code} onChange={(e: any) => setForm({ ...form, code: e.target.value })} dir="ltr" placeholder="5140" /></Field>
          <Field label="التصنيف">
            <Select value={form.account_type}
              onChange={(e: any) => setForm({ ...form, account_type: e.target.value, parent_id: '' })}>
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="الاسم (إنجليزي) *"><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} dir="ltr" /></Field>
          <Field label="الاسم (عربي)"><Input value={form.name_ar} onChange={(e: any) => setForm({ ...form, name_ar: e.target.value })} /></Field>

          <Field label="المجموعة">
            <Select value={form.account_group} onChange={(e: any) => setForm({ ...form, account_group: e.target.value })}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
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
              أزل العلامة لتجعله <b>تجميعياً</b>: لا يُرحَّل إليه، ويصلح أباً لحسابات تحته.
              {!form.is_postable && ' — سيظهر في قائمة الآباء لحسابات هذا التصنيف.'}
            </p>
          </div>

          {form.account_type === 'asset' && (
            <Field label="قيد العملة (اختياري)">
              <Input value={form.currency_restriction} dir="ltr" placeholder="USD"
                onChange={(e: any) => setForm({ ...form, currency_restriction: e.target.value.toUpperCase() })} />
            </Field>
          )}
        </div>

        {!parents.length && form.account_type && (
          <p className="mt-3 text-xs text-gray-500">
            لا حساب تجميعي لتصنيف «{TYPE_LABEL[form.account_type]}» بعد — أنشئ واحداً أولاً إن أردت شجرة.
          </p>
        )}
        {err && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={save} loading={saving}>إنشاء</Button>
        </div>
      </Modal>
    </div>
  );
}
