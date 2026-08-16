'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Button, Badge, Input, Select, Field, Callout, TableSkeleton, EmptyState, useToast, cx } from '@/components/ui';

/*
 * أسعار الصرف المحاسبية.
 *
 * جدولان في النظام لا واحد: شاشة الأسعار الشهرية تخدم التقارير التشغيلية،
 * ومحرّك القيود يقرأ من `accounting_fx_rates` وحده. فسعرٌ يُعتمد هناك لا يراه
 * المحرّك — وهو ما وقع فعلاً: سعر يونيو كان على الشاشة الشهرية، وكان المحرّك
 * سيحوّل بسعر مايو صامتاً بفارق ٣٬٤٥٠ يورو.
 *
 * ولذلك تقترح هذه الشاشة السعر من الشهرية ولا تطلب كتابته: الرقم يُؤكَّد لا
 * يُكتب، فينتفي خطأ الطباعة ويبقى مصدرٌ واحد للحقيقة.
 */

const CURRENCIES = ['USD', 'SAR', 'AED', 'GBP', 'CHF', 'EGP'];

/*
 * الأسعار الشهرية مقوّمة بالدولار: `EUR: 0.87` تعني أن الدولار يساوي 0.87 يورو،
 * و`SAR: 3.75` أن الدولار يساوي 3.75 ريالاً. فسعر أي عملة مقابل اليورو هو
 * حاصل قسمة سعر اليورو على سعرها — والقسمة هنا تمنع حساباً يدوياً يُخطئ.
 */
function deriveToEur(monthly: Record<string, any> | undefined, from: string): number | null {
  if (!monthly) return null;
  const eurPerUsd = Number(monthly.EUR);
  if (!(eurPerUsd > 0)) return null;
  if (from === 'USD') return eurPerUsd;
  const xPerUsd = Number(monthly[from]);
  if (!(xPerUsd > 0)) return null;
  return eurPerUsd / xPerUsd;
}

const lastDayOf = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};

export default function AccountingFxRates({ entityId }: { entityId: string }) {
  const toast = useToast();
  const [rates, setRates] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [from, setFrom] = useState('USD');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [override, setOverride] = useState('');
  const [reference, setReference] = useState('');

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const r = await Promise.allSettled([
      api.get(`/api/accounting/fx-rates?legal_entity_id=${entityId}`),
      api.get('/api/exchange-rates'),
    ]);
    if (r[0].status === 'fulfilled') setRates(r[0].value.data || []);
    if (r[1].status === 'fulfilled') setMonthly(r[1].value.data || {});
    setLoading(false);
  }, [entityId]);
  useEffect(() => { load(); }, [load]);

  const suggested = useMemo(() => deriveToEur(monthly[month], from), [monthly, month, from]);
  const rateDate = lastDayOf(month);
  const effective = override.trim() ? Number(override) : suggested;

  const months = useMemo(
    () => Object.keys(monthly).filter((k) => k !== 'default').sort().reverse(),
    [monthly]);

  // سعرٌ معتمَد بنفس العملة والتاريخ يجعل الإضافة تكراراً لا تصحيحاً
  const clash = rates.find((x) => x.currency_from === from && String(x.rate_date).slice(0, 10) === rateDate);

  async function create() {
    if (!(Number(effective) > 0)) { toast.error('لا سعر لهذا الشهر — احفظه أولاً في شاشة الأسعار الشهرية'); return; }
    setBusy(true);
    try {
      await api.post('/api/accounting/fx-rates', {
        legal_entity_id: entityId,
        currency_from: from,
        currency_to: 'EUR',
        rate: Number(effective),
        rate_date: rateDate,
        source: 'OTHER_APPROVED',
        source_reference: reference.trim() || `شاشة الأسعار الشهرية — ${month}`,
      });
      toast.success('أُنشئ مسوّدةً — يبقى الاعتماد');
      setOverride(''); setReference('');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'تعذّر الإنشاء');
    } finally { setBusy(false); }
  }

  async function approve(id: string) {
    setBusy(true);
    try {
      await api.post(`/api/accounting/fx-rates/${id}/approve`);
      toast.success('اعتُمد — صار المحرّك يراه');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'تعذّر الاعتماد');
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--hairline)]">
        <h2 className="font-semibold text-[15px] text-gray-900">أسعار الصرف المحاسبية</h2>
        <p className="text-xs text-gray-500 mt-1">
          محرّك القيود يقرأ من هنا وحده — لا من شاشة الأسعار الشهرية. وهو يأخذ
          <b> آخر سعر معتمَد في تاريخ القيد أو قبله</b>، فغياب سعر الشهر يعني التحويل بسعر شهر أقدم بلا تحذير.
        </p>
      </div>

      {/* ── الإضافة ── */}
      <div className="p-4 border-b border-[var(--hairline)] bg-gray-50/60 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="العملة" className="min-w-[7rem]">
            <Select value={from} onChange={(e: any) => setFrom(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c} → EUR</option>)}
            </Select>
          </Field>
          <Field label="الشهر" className="min-w-[9rem]">
            <Select value={month} onChange={(e: any) => setMonth(e.target.value)}>
              {months.length ? months.map((m) => <option key={m} value={m}>{m}</option>)
                : <option value={month}>{month}</option>}
            </Select>
          </Field>
          <Field label="تاريخ السعر" hint="آخر يوم في الشهر">
            <Input value={rateDate} readOnly className="w-auto bg-gray-100" />
          </Field>
          <Field label="السعر المقترح" hint={suggested == null ? 'لا سعر محفوظ لهذا الشهر' : 'من الشاشة الشهرية'}>
            <Input value={suggested == null ? '—' : suggested.toFixed(8)} readOnly className="w-auto bg-gray-100 tabular-nums" />
          </Field>
          <Field label="تجاوز يدوي" hint="اتركه فارغاً لاعتماد المقترح">
            <Input value={override} onChange={(e: any) => setOverride(e.target.value)}
              placeholder="—" inputMode="decimal" className="w-28 tabular-nums" />
          </Field>
          <Field label="المرجع" className="flex-1 min-w-[12rem]">
            <Input value={reference} onChange={(e: any) => setReference(e.target.value)}
              placeholder={`شاشة الأسعار الشهرية — ${month}`} />
          </Field>
          <Button variant="primary" icon="plus" onClick={create} loading={busy}
            disabled={!(Number(effective) > 0)}>
            إنشاء
          </Button>
        </div>

        {clash && (
          <Callout tone="warning">
            يوجد سعر لـ{from} بتاريخ {rateDate} بالفعل — {clash.approved_at ? 'معتمَد' : 'مسوّدة'} بقيمة {Number(clash.rate).toFixed(8)}.
            الإضافة تُنشئ سعراً ثانياً بالتاريخ نفسه، والمحرّك يأخذ الأحدث إدخالاً.
          </Callout>
        )}
        {override.trim() !== '' && suggested != null && Number(override) !== suggested && (
          <Callout tone="danger" title="تجاوزتَ السعر المقترح">
            المقترح {suggested.toFixed(8)} وأنت تُدخل {override}. السعر اليدوي يحتاج مرجعاً موثَّقاً في خانة المرجع.
          </Callout>
        )}
      </div>

      {/* ── القائمة ── */}
      {loading ? <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
        : !rates.length ? <EmptyState title="لا أسعار بعد" description="أنشئ سعر الشهر ثم اعتمده." />
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-2 text-right">التاريخ</th>
                  <th scope="col" className="px-4 py-2 text-right">الزوج</th>
                  <th scope="col" className="px-4 py-2 text-left">السعر</th>
                  <th scope="col" className="px-4 py-2 text-right">المصدر</th>
                  <th scope="col" className="px-4 py-2 text-center">الحالة</th>
                  <th scope="col" className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((x) => (
                  <tr key={x.id}>
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">{String(x.rate_date).slice(0, 10)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{x.currency_from} → {x.currency_to}</td>
                    <td className="px-4 py-2 text-left tabular-nums">{Number(x.rate).toFixed(8)}</td>
                    <td className="px-4 py-2 text-xs text-gray-600" dir="auto">
                      {x.source}
                      {x.source_reference && <span className="text-gray-400"> · {x.source_reference}</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {x.approved_at
                        ? <Badge tone="success" dot>معتمَد</Badge>
                        : <Badge tone="warning" dot>مسوّدة</Badge>}
                    </td>
                    <td className="px-4 py-2 text-left">
                      {!x.approved_at && (
                        <Button size="sm" variant="primary" onClick={() => approve(x.id)} disabled={busy}>اعتماد</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  );
}
