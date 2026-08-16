'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Modal, Callout, TableSkeleton, EmptyState, Badge, cx } from '@/components/ui';

/*
 * كشف حساب — من أي شاشة تعرض رمز حساب.
 *
 * القوائم المالية تعرض رقماً واحداً لكل حساب، والسؤال الذي يتبعه دائماً: «مِمَّ
 * تكوّن هذا الرقم؟». فيصير كل سطر مدخلاً إلى حركاته.
 *
 * وهو يقرأ نقطة دفتر الأستاذ مرشَّحةً بالحساب — لا يجلب القيود واحداً واحداً
 * ثم يُرشّح في المتصفّح، فذاك نداءٌ لكل قيد وينمو مع الدفتر بلا حدّ.
 */

const money = (n: number | null | undefined) =>
  (n == null ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const side = (n: number) => (Number(n) === 0 ? '' : money(n));

export interface AccountRef { code: string; name: string }

export function AccountStatement({ account, entityId, from, to, onClose, onOpenEntry }: {
  account: AccountRef | null;
  entityId: string;
  /** بلا تاريخ بداية يُقرأ الدفتر منذ نشأته، فلا رصيد افتتاحي — وهو الصحيح. */
  from?: string | null;
  to: string;
  onClose: () => void;
  onOpenEntry?: (entryId: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!account || !entityId) { setData(null); setErr(''); return; }
    let alive = true;
    setData(null); setErr('');
    api.get('/api/accounting/reports/general-ledger', {
      params: { legal_entity_id: entityId, period_start: from || undefined, period_end: to, account_code: account.code },
    })
      .then((r) => { if (alive) setData(r.data); })
      .catch((e: any) => { if (alive) setErr(e?.response?.data?.message || 'تعذّر فتح كشف الحساب.'); });
    return () => { alive = false; };
  }, [account, entityId, from, to]);

  const acc = data?.report?.accounts?.[0];

  return (
    <Modal open={!!account} onClose={onClose} size="xl"
      title={account ? `${account.code} — ${account.name}` : ''}>
      {err ? <Callout tone="danger">{err}</Callout>
        : !data ? <TableSkeleton rows={6} cols={5} />
        : !acc ? <EmptyState title="لا حركة" description="لم يمرّ على هذا الحساب قيد مُرحَّل في هذه الفترة." />
        : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="neutral">{from ? `${from} → ${to}` : `حتى ${to}`}</Badge>
              <span className="text-gray-500">
                افتتاحي <span className="tabular-nums font-medium text-gray-800">{money(acc.opening)}</span>
              </span>
              <span className="text-gray-500">
                ختامي <span className="tabular-nums font-medium text-gray-800">{money(acc.closing)}</span>
              </span>
            </div>

            <div className="overflow-x-auto border border-[var(--hairline)] rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right">التاريخ</th>
                    <th scope="col" className="px-3 py-2 text-right">القيد</th>
                    <th scope="col" className="px-3 py-2 text-right">البيان</th>
                    <th scope="col" className="px-3 py-2 text-right">الطرف المقابل</th>
                    <th scope="col" className="px-3 py-2 text-left">مدين</th>
                    <th scope="col" className="px-3 py-2 text-left">دائن</th>
                    <th scope="col" className="px-3 py-2 text-left">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {/* الرصيد الافتتاحي صفٌّ لا حاشية: القارئ يتتبّع عموداً واحداً من أعلى. */}
                  <tr className="bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-500" colSpan={6}>الرصيد الافتتاحي</td>
                    <td className="px-3 py-1.5 text-left tabular-nums font-medium">{money(acc.opening)}</td>
                  </tr>
                  {acc.rows.map((r: any, i: number) => (
                    <tr key={i}
                      onClick={() => r.entry_id && onOpenEntry?.(r.entry_id)}
                      className={cx(r.entry_id && onOpenEntry && 'cursor-pointer hover:bg-brand-50/50')}
                      title={onOpenEntry ? 'اضغط لفتح القيد كاملاً' : undefined}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.num}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600" dir="auto">{r.memo || '—'}</td>
                      <td className="px-3 py-1.5 text-xs text-brand-700" dir="auto">{r.split || '—'}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums">{side(r.amount > 0 ? r.amount : 0)}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums">{side(r.amount < 0 ? -r.amount : 0)}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums font-medium">{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-2" colSpan={6}>الرصيد الختامي</td>
                    <td className="px-3 py-2 text-left tabular-nums">{money(acc.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs text-gray-500">
              حركة الفترة <span className="tabular-nums font-medium">{money(acc.period_amount)}</span>
              {' — '}موجبٌ مدين وسالبٌ دائن.
            </p>
          </div>
        )}
    </Modal>
  );
}

export default AccountStatement;
