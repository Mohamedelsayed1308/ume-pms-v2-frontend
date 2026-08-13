'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Field, Select, Badge, Skeleton, Button } from '@/components/ui';
import NewAccountModal from '@/app/dashboard/accounting/NewAccountModal';

/*
 * افتراضي المورّد المحاسبي — داخل نافذة تعديل المورّد.
 *
 * SKANDIAVERKEN إصلاح وصيانة دائماً، وMARE NOSTRUM مخازن دائماً. السؤال عنه في
 * كل فاتورة ليس تدقيقاً بل تكراراً، والتكرار هو منبع أخطاء التصنيف.
 *
 * ⚠️ وهو **اقتراح لا قرار**: الجسر يملأ به الحقل، ويبقى للمُعِدّ تغييره في القيد
 * نفسه. فمن يوقّع على التصنيف هو من رحّل، لا صفٌّ في جدول إعدادات.
 *
 * يُحفظ فور تغييره لأنه إعداد مستقل عن بيانات المورّد — وربطه بزرّ حفظ المورّد
 * كان سيجعل فشل أحدهما يُسقط الآخر.
 */

interface Props { supplierId: string | null }

export default function AccountingDefault({ supplierId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [entity, setEntity] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [value, setValue] = useState({ debit_account_id: '', accrual_category: 'GOODS' });
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(''); setMsg('');
      try {
        const { data: ents } = await api.get('/api/accounting/entities');
        const e = ents?.[0];
        if (!alive) return;
        setEntity(e);
        if (!e) { setLoading(false); return; }

        const [accRes, defRes] = await Promise.allSettled([
          api.get(`/api/accounting/accounts?legal_entity_id=${e.id}`),
          api.get(`/api/accounting/bridge/supplier-defaults?legal_entity_id=${e.id}`),
        ]);
        if (!alive) return;

        if (accRes.status === 'fulfilled') {
          const CAPITALIZABLE = ['1200', '1510'];
          const usable = (accRes.value.data || []).filter((a: any) =>
            a.is_postable && a.is_active !== false &&
            (a.account_type === 'expense' || CAPITALIZABLE.includes(a.code)));
          const rank = (g: string) => ({ VESSEL_OPEX: 0, ADMIN: 1, FINANCE: 2 } as any)[g] ?? 3;
          usable.sort((a: any, b: any) => rank(a.account_group) - rank(b.account_group) || a.code.localeCompare(b.code));
          setAccounts(usable);
        }
        if (defRes.status === 'fulfilled' && supplierId) {
          const d = (defRes.value.data || []).find((x: any) => x.supplier_id === supplierId);
          if (d) setValue({ debit_account_id: d.debit_account_id, accrual_category: d.accrual_category });
        }
      } catch {
        if (alive) setErr('تعذّر تحميل دليل الحسابات');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [supplierId]);

  async function persist(next: typeof value) {
    setValue(next);
    if (!supplierId || !entity || !next.debit_account_id) return;
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.put('/api/accounting/bridge/supplier-defaults', {
        legal_entity_id: entity.id, supplier_id: supplierId,
        debit_account_id: next.debit_account_id, accrual_category: next.accrual_category,
      });
      setMsg('حُفظ');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر الحفظ');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="sm:col-span-2"><Skeleton className="h-20" /></div>;
  if (!entity) return null;

  const label = (a: any) =>
    `${a.code} — ${a.name}` +
    (a.account_group === 'VESSEL_OPEX' ? '  [تشغيل مركب]'
      : a.account_group === 'ADMIN' ? '  [إدارية]'
      : a.account_group === 'FINANCE' ? '  [تمويلية]' : '');

  return (
    <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">الافتراضي المحاسبي</div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400">جارٍ الحفظ…</span>}
          {msg && <Badge tone="success">{msg}</Badge>}
        </div>
      </div>

      {!supplierId ? (
        <p className="text-xs text-gray-500">يُضبط بعد حفظ المورّد — يحتاج معرّفه.</p>
      ) : (
        <>
          <Field label="حساب المصروف الافتراضي">
            <div className="flex items-center gap-2">
              <Select value={value.debit_account_id} className="flex-1"
                onChange={(e: any) => persist({ ...value, debit_account_id: e.target.value })}>
                <option value="">— بلا افتراضي —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </Select>
              <Button size="sm" variant="outline" type="button" onClick={() => setNewOpen(true)}>+ حساب</Button>
            </div>
          </Field>
          <p className="-mt-2 text-xs text-gray-500">
            لا تجد الحساب؟ أنشئه هنا — يُضاف إلى <b>شجرة الحسابات</b> نفسها ويُختار فوراً.
          </p>

          <Field label="التصنيف الافتراضي">
            <Select value={value.accrual_category}
              onChange={(e: any) => persist({ ...value, accrual_category: e.target.value })}>
              <option value="GOODS">سلع — تحتاج واقعة استلام</option>
              <option value="PERIOD_SERVICE">خدمة بفترة — تُستحقّ بانقضائها</option>
            </Select>
          </Field>

          <p className="text-xs text-gray-500">
            يملأ الحقل عند إنشاء قيد لهذا المورّد — <b>ويبقى قابلاً للتغيير في القيد نفسه</b>.
          </p>
          {err && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}

          <NewAccountModal open={newOpen} onClose={() => setNewOpen(false)} entityId={entity.id}
            defaultType="expense"
            onCreated={(a) => {
              // يُدرَج في القائمة ويُختار ويُحفظ — فلا يُعاد البحث عنه بعد إنشائه.
              setAccounts((prev) => [...prev, a]);
              persist({ ...value, debit_account_id: a.id });
            }} />
        </>
      )}
    </div>
  );
}
