'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Badge, Input, Select, Skeleton, EmptyState, cx } from '@/components/ui';
import NewAccountModal from '../NewAccountModal';

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

interface Acct {
  id: string; code: string; name: string; name_ar: string | null;
  account_type: string; account_group: string | null; system_role: string | null;
  normal_balance: string; parent_id: string | null; level: number;
  is_postable: boolean; is_active: boolean; currency_restriction: string | null;
}

export default function AccountingSetupPage() {
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [showAdd, setShowAdd] = useState(false);

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
          <Button variant="primary" icon="plus" onClick={() => setShowAdd(true)}>حساب جديد</Button>
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

      <NewAccountModal open={showAdd} onClose={() => setShowAdd(false)} entityId={entityId}
        onCreated={() => load(entityId)} />

    </div>
  );
}
