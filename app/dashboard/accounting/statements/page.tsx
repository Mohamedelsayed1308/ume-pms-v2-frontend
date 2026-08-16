'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Badge, Input, Select, Skeleton, EmptyState, useToast, cx } from '@/components/ui';
import AccountStatement, { type AccountRef } from '../AccountStatement';

/*
 * القوائم المالية.
 *
 * قائمة الدخل للفترة، والمركز المالي لحظةَ نهايتها تراكمياً — الخلط بينهما يُنتج
 * ميزانيةً لشهر وهي لا معنى لها.
 *
 * ونتيجة الفترة تُعرَض **بجوار** حقوق الملكية لا مدموجة فيها: الإقفال قيد يُرحَّل
 * لا رقمٌ يُحسب في تقرير.
 */

const money = (n: any) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const lastOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };

export default function StatementsPage() {
  const toast = useToast();
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth());
  /*
   * الحساب المفتوح كشفُه.
   *
   * القائمة تعرض رقماً واحداً لكل حساب، والسؤال الذي يتبعه دائماً: «مِمَّ تكوّن
   * هذا الرقم؟» — فكل سطر مدخلٌ إلى حركاته.
   */
  const [openAccount, setOpenAccount] = useState<AccountRef | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/accounting/entities');
        setEntities(data || []);
        if (data?.length) setEntityId(data[0].id);
      } catch { /* الشاشة تعرض خطأها عند التوليد */ }
    })();
  }, []);

  async function run() {
    if (!entityId) return;
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/api/accounting/reports/statements', {
        params: { legal_entity_id: entityId, period_start: from, period_end: to },
      });
      setData(data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'تعذّر توليد القوائم');
      setData(null);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (entityId) run(); }, [entityId]);

  const inc = data?.income_statement;
  const bs = data?.balance_sheet;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">القوائم المالية</h1>
          <p className="text-sm text-gray-500">
            قائمة الدخل والمركز المالي
            {data?.entity && <> — <b>{data.entity.name}</b> · {data.entity.currency}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {entities.length > 1 && (
            <Select value={entityId} onChange={(e: any) => setEntityId(e.target.value)}>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
          <div>
            <div className="text-xs text-gray-500 mb-1">من</div>
            <Input type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">إلى</div>
            <Input type="date" value={to} onChange={(e: any) => setTo(e.target.value)} />
          </div>
          <Button variant="primary" onClick={run} loading={loading}>توليد</Button>
        </div>
      </header>

      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        حسابات إدارية — الأرصدة الافتتاحية غير مُدقَّقة
        <span className="mx-2 opacity-50">·</span>
        <span className="font-mono text-xs">MANAGEMENT ACCOUNTS — OPENING BALANCES UNAUDITED</span>
      </div>

      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && <Skeleton className="h-72" />}

      {!loading && data && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* ── قائمة الدخل ── */}
          <Card className="p-0 overflow-hidden">
            <div className="border-b px-4 py-3">
              <h2 className="font-bold">قائمة الدخل</h2>
              <p className="text-xs text-gray-500">{data.period.from} إلى {data.period.to}</p>
            </div>
            {!inc.sections.some((s: any) => s.lines.length) ? (
              <EmptyState title="لا حركة في هذه الفترة" description="لم يُرحَّل قيد دخل أو مصروف بين التاريخين." />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {inc.sections.filter((s: any) => s.lines.length).map((s: any) => (
                    <>
                      <tr key={s.key} className="bg-gray-50">
                        <td className="px-4 py-2 font-semibold" colSpan={2}>
                          {s.label}
                          {s.key === 'other' && <Badge tone="warning" className="mr-2">يحتاج تصنيفاً</Badge>}
                        </td>
                      </tr>
                      {s.lines.map((l: any) => (
                        <tr key={s.key + l.code} onClick={() => setOpenAccount({ code: l.code, name: l.name })}
                          title="اضغط لعرض حركات الحساب"
                          className="border-b last:border-0 cursor-pointer hover:bg-brand-50/50">
                          <td className="px-6 py-1.5">
                            <span className="font-mono text-xs text-gray-400">{l.code}</span> {l.name}
                          </td>
                          <td className={cx('px-4 py-1.5 text-left tabular-nums', l.amount < 0 && 'text-emerald-700')}>
                            {money(l.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr key={s.key + '-t'} className="border-b">
                        <td className="px-6 py-1.5 text-xs text-gray-500">مجموع {s.label}</td>
                        <td className="px-4 py-1.5 text-left tabular-nums font-medium">{money(s.total)}</td>
                      </tr>
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td className="px-4 py-2 font-semibold">إجمالي الإيرادات</td>
                    <td className="px-4 py-2 text-left tabular-nums font-semibold">{money(inc.total_revenue)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">إجمالي المصروفات</td>
                    <td className="px-4 py-2 text-left tabular-nums font-semibold">{money(inc.total_expense)}</td>
                  </tr>
                  <tr className={cx('border-t-2', inc.net_result >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
                    <td className="px-4 py-3 font-bold">{inc.net_result >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</td>
                    <td className="px-4 py-3 text-left tabular-nums font-bold text-lg">{money(Math.abs(inc.net_result))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          {/* ── المركز المالي ── */}
          <Card className="p-0 overflow-hidden">
            <div className="border-b px-4 py-3">
              <h2 className="font-bold">المركز المالي</h2>
              <p className="text-xs text-gray-500">تراكمي حتى {data.period.to}</p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {([bs.assets, bs.liabilities, bs.equity] as any[]).map((sec, i) => (
                  <>
                    <tr key={'h' + i} className="bg-gray-50">
                      <td className="px-4 py-2 font-semibold" colSpan={2}>{sec.label}</td>
                    </tr>
                    {sec.lines.map((l: any) => (
                      <tr key={i + l.code} onClick={() => setOpenAccount({ code: l.code, name: l.name })}
                        title="اضغط لعرض حركات الحساب"
                        className="border-b last:border-0 cursor-pointer hover:bg-brand-50/50">
                        <td className="px-6 py-1.5">
                          <span className="font-mono text-xs text-gray-400">{l.code}</span> {l.name}
                        </td>
                        <td className="px-4 py-1.5 text-left tabular-nums">{money(l.amount)}</td>
                      </tr>
                    ))}
                    <tr key={'t' + i} className="border-b">
                      <td className="px-6 py-1.5 text-xs text-gray-500">مجموع {sec.label}</td>
                      <td className="px-4 py-1.5 text-left tabular-nums font-medium">{money(sec.total)}</td>
                    </tr>
                  </>
                ))}
                {/* النتيجة بجوار حقوق الملكية لا داخلها — الإقفال قيد لا حسبة */}
                <tr className="border-b bg-sky-50/60">
                  <td className="px-6 py-2">
                    نتيجة لم تُقفَل بعد
                    <div className="text-xs text-gray-500">تُدمج في حقوق الملكية بقيد إقفال يُرحَّل، لا بحساب في تقرير</div>
                  </td>
                  <td className="px-4 py-2 text-left tabular-nums">{money(bs.net_result_unclosed)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="px-4 py-2 font-semibold">إجمالي الأصول</td>
                  <td className="px-4 py-2 text-left tabular-nums font-semibold">{money(bs.assets.total)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-semibold">الالتزامات + حقوق الملكية</td>
                  <td className="px-4 py-2 text-left tabular-nums font-semibold">{money(bs.total_liabilities_and_equity)}</td>
                </tr>
                <tr className={cx('border-t-2', bs.is_balanced ? 'bg-emerald-50' : 'bg-amber-50')}>
                  <td className="px-4 py-3 font-bold">
                    {bs.is_balanced ? 'متوازن' : 'فرق غير مفسَّر'}
                    {!bs.is_balanced && (
                      <div className="text-xs font-normal text-amber-800">
                        يُعرَض كما هو ولا يُوازَن صورياً — راجع الأرصدة الافتتاحية والقيود غير المُرحَّلة
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-left tabular-nums font-bold">{money(bs.difference)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      {!loading && !data && !err && (
        <EmptyState title="اختر فترة" description="حدّد التاريخين ثم اضغط توليد." />
      )}

      {/*
        * الكشف يُقرأ منذ نشأة الدفتر لا من بداية الفترة.
        *
        * حسابات المركز المالي أرصدةٌ تراكمية، وقصرُ كشفها على الفترة يُظهر رقماً
        * لا يساوي ما في القائمة. والفترة تخصّ قائمة الدخل وحدها.
        */}
      <AccountStatement account={openAccount} entityId={entityId} from={null} to={to}
        onClose={() => setOpenAccount(null)} />
    </div>
  );
}
