'use client';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Card, Button, Icon, Spinner, EmptyState, cx } from '@/components/ui';

const SEV_MAP: Record<string, { ar: string; tone: string; dot: string }> = {
  critical: { ar: 'حرِج', tone: 'bg-red-50 text-red-700 border-red-200', dot: '#dc2626' },
  high: { ar: 'مرتفع', tone: 'bg-orange-50 text-orange-700 border-orange-200', dot: '#ea580c' },
  medium: { ar: 'متوسط', tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: '#d97706' },
  low: { ar: 'منخفض', tone: 'bg-gray-50 text-gray-600 border-gray-200', dot: '#6b7280' },
  // تسوية تاريخية موثَّقة — ليست خللاً. لون محايد عمداً: الأخضر لغة «سداد PMS».
  informational: { ar: 'معلوماتي', tone: 'bg-sky-50 text-sky-700 border-sky-200', dot: '#0284c7' },
};
const SEV_FALLBACK = { ar: '—', tone: 'bg-gray-50 text-gray-600 border-gray-200', dot: '#9ca3af' };

// الباك والفرونت يُنشران مستقلين؛ مستوى خطورة جديد يجب ألا يُسقِط الشاشة أبداً.
const SEV: Record<string, { ar: string; tone: string; dot: string }> = new Proxy(SEV_MAP, {
  get: (t, k: string) => t[k] ?? SEV_FALLBACK,
});
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'informational'];

const fmt = (n: any) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NEG_CLASS: Record<string, string> = { credit_note: 'إشعار دائن', refund: 'مرتجع', adjustment: 'تسوية', unclassified: 'غير مصنّف' };

// خريطة عملات → قائمة أسطر (لا تُجمع عملتان أبداً)
function CcyList({ map, empty = '—' }: { map?: Record<string, number>; empty?: string }) {
  const entries = Object.entries(map || {}).filter(([, v]) => Math.abs(Number(v)) > 0.005);
  if (!entries.length) return <span className="text-gray-300">{empty}</span>;
  return (
    <div className="space-y-0.5">
      {entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([c, v]) => (
        <div key={c} className="tabular-nums whitespace-nowrap"><span className="text-gray-400 text-[10px]">{c}</span> {fmt(v)}</div>
      ))}
    </div>
  );
}

export default function AuditPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const isAdmin = typeof window !== 'undefined' && getUser()?.role === 'admin';

  const load = () => {
    setLoading(true); setError('');
    api.get('/api/audit/financial-integrity')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.status === 403 ? 'forbidden' : e?.response?.status === 401 ? 'unauth' : 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data.rules || []).map((r: any) => ({
      'القاعدة': r.title, 'العدد': r.count, 'الخطورة': SEV[r.severity]?.ar,
      'التعرُّض': Object.entries(r.exposureByCurrency || {}).map(([c, v]) => `${c} ${fmt(v)}`).join(' | ') || '—',
      'الإجراء الموصى به': r.action,
    }))), 'القواعد');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data.findings || []).map((f: any) => ({
      'الخطورة': SEV[f.severity]?.ar, 'المشكلة': f.issue,
      'رقم الفاتورة': f.invoiceNumber || '—', 'معرّف الفاتورة': f.invoiceId || '—',
      'المورد': f.supplier || '—', 'المركب': f.vessel || '—', 'العملة': f.currency,
      'إجمالي الفاتورة': f.invoiceTotal, 'المسدَّد المخزَّن': f.storedPaidAmount,
      'مجموع السدادات الفعلية': f.actualPaymentsSum, 'المتبقي المحسوب': f.calculatedRemaining,
      'الحالة': f.status || '—', 'حالة الموافقة': f.approvalStatus || '—',
      'التعرُّض': f.exposure, 'الثقة': f.confidence || '—', 'المرجع': f.reference || '—',
    }))), 'الحالات');
    XLSX.writeFile(wb, `تدقيق-السلامة-المالية-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (!isAdmin) return <Card className="p-10"><EmptyState icon="shield" title="هذه الشاشة للأدمن فقط" description="تدقيق السلامة المالية متاح لمديري النظام." /></Card>;
  if (loading) return <div className="flex flex-col items-center py-24 gap-3"><Spinner /><p className="text-sm text-gray-500">جارٍ فحص الفواتير والسدادات…</p></div>;
  if (error === 'forbidden' || error === 'unauth') return <Card className="p-10"><EmptyState icon="shield" title="لا تملك صلاحية" description="نقاط التدقيق محميّة خادمياً للأدمن فقط." /></Card>;
  if (error) return <Card className="p-10 text-center"><p className="text-red-500 text-sm mb-3">تعذّر تشغيل التدقيق</p><Button variant="outline" size="sm" onClick={load}>إعادة المحاولة</Button></Card>;

  const s = data.summary;
  const findings = (data.findings || []).filter((f: any) =>
    (!sevFilter || f.severity === sevFilter) && (!ruleFilter || f.ruleKey === ruleFilter));

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">تدقيق السلامة المالية</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            قراءة فقط — لم يُعدَّل أي سجل · مجموع السدادات محسوب من سجلات الدفع الفعلية · العملات لا تُجمع
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><Icon name="chart" size={14} /> إعادة الفحص</Button>
          <Button variant="success" size="sm" onClick={exportExcel}><Icon name="file" size={14} /> تصدير Excel</Button>
        </div>
      </div>

      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-800 flex items-center gap-2">
        <Icon name="shield" size={15} /> وضع <b>{data.mode}</b> — هذا التدقيق ينفّذ استعلامات قراءة فقط ولا يكتب أي بيانات.
      </div>

      {/* ملخص تنفيذي */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'فواتير مفحوصة', v: s.invoicesScanned, c: 'text-gray-800' },
          { l: 'سدادات مفحوصة', v: s.paymentsScanned, c: 'text-gray-800' },
          { l: 'فواتير بها ملاحظات', v: s.invoicesWithDiscrepancies, c: 'text-red-600' },
          { l: 'سدادات بها ملاحظات', v: s.paymentsWithDiscrepancies, c: 'text-orange-600' },
        ].map((k) => (
          <Card key={k.l} className="p-4">
            <p className="text-xs text-gray-500">{k.l}</p>
            <p className={cx('text-2xl font-extrabold tabular-nums mt-1', k.c)}>{Number(k.v).toLocaleString('en-US')}</p>
          </Card>
        ))}
      </div>

      {/* التعرُّض المالي لكل عملة */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-1">التعرُّض المالي — لكل عملة على حدة</h3>
        <p className="text-[11px] text-gray-400 mb-3">صافٍ بلا ازدواج: عندما تُطلق فاتورة واحدة عدة قواعد لنفس المبلغ يُحتسب مرة واحدة.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(s.exposureByCurrency || {}).length === 0 && <p className="text-sm text-gray-400">لا يوجد تعرُّض مالي مرصود</p>}
          {Object.entries(s.exposureByCurrency || {}).sort((a: any, b: any) => b[1] - a[1]).map(([c, v]: any) => (
            <div key={c} className="rounded-xl border border-red-100 bg-red-50/40 p-3">
              <p className="text-xs font-bold text-gray-500">{c}</p>
              <p className="text-xl font-extrabold text-red-600 tabular-nums">{fmt(v)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* الخطورة */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {SEV_ORDER.map((k) => {
          const b = s.bySeverity?.[k] || { count: 0, exposureByCurrency: {} };
          return (
            <button key={k} onClick={() => setSevFilter(sevFilter === k ? '' : k)}
              className={cx('text-right rounded-xl border p-4 transition', SEV[k].tone, sevFilter === k && 'ring-2 ring-offset-1 ring-gray-400')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{SEV[k].ar}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEV[k].dot }} />
              </div>
              <p className="text-2xl font-extrabold tabular-nums mt-1">{b.count}</p>
              <div className="text-[11px] mt-1 opacity-80"><CcyList map={b.exposureByCurrency} /></div>
            </button>
          );
        })}
      </div>

      {/* جدول القواعد */}
      <Card className="p-5 overflow-x-auto">
        <h3 className="font-bold text-gray-800 mb-3">قواعد التدقيق ({data.rules?.length || 0} قاعدة أطلقت ملاحظات)</h3>
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-gray-500 text-xs border-b">
            <th className="text-right py-2">القاعدة</th><th className="text-center">العدد</th>
            <th className="text-right">التعرُّض لكل عملة</th><th className="text-center">الخطورة</th><th className="text-right">الإجراء الموصى به</th>
          </tr></thead>
          <tbody>
            {(data.rules || []).map((r: any) => (
              <tr key={r.key} className={cx('border-b border-gray-50 cursor-pointer hover:bg-gray-50', ruleFilter === r.key && 'bg-brand-50/50')}
                onClick={() => setRuleFilter(ruleFilter === r.key ? '' : r.key)}>
                <td className="py-2 text-gray-700">{r.title}</td>
                <td className="text-center font-bold tabular-nums">{r.count}</td>
                <td className="text-xs">
                  <CcyList map={r.exposureByCurrency} />
                  {Object.keys(r.exposureByCurrencyRaw || {}).length > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5">خام: {Object.entries(r.exposureByCurrencyRaw).map(([c, v]: any) => `${c} ${fmt(v)}`).join(' · ')}</div>
                  )}
                </td>
                <td className="text-center"><span className={cx('px-2 py-0.5 rounded-full text-[10px] font-semibold border', SEV[r.severity].tone)}>{SEV[r.severity].ar}</span></td>
                <td className="text-xs text-gray-500">{r.action}</td>
              </tr>
            ))}
            {!data.rules?.length && <tr><td colSpan={5} className="text-center py-8 text-emerald-600">✓ لم تُرصد أي مخالفة</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* أعلى 20 تعرُّضاً */}
      {data.topExposures?.length > 0 && (
        <Card className="p-5 overflow-x-auto">
          <h3 className="font-bold text-gray-800 mb-3">أعلى 20 تعرُّضاً مالياً</h3>
          <p className="text-[11px] text-gray-400 mb-2">صف واحد لكل فاتورة — التعرُّض غير مكرَّر، وكل القواعد التي أُطلقت معروضة.</p>
          <table className="w-full text-xs min-w-[1040px]">
            <thead><tr className="text-gray-500 border-b">
              <th className="text-right py-2">#</th><th className="text-right">الفاتورة</th><th className="text-right">المورد</th><th className="text-right">المركب</th>
              <th className="text-center">العملة</th><th className="text-left">الإجمالي</th><th className="text-left">المخزَّن</th><th className="text-left">الفعلي</th>
              <th className="text-left">الفرق</th><th className="text-left">المتبقي</th><th className="text-right">القواعد</th>
              <th className="text-left">التعرُّض الصافي</th><th className="text-center">الخطورة</th>
            </tr></thead>
            <tbody>
              {data.topExposures.map((f: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 align-top">
                  <td className="py-1.5 text-gray-400">{i + 1}</td>
                  <td className="font-mono text-brand-700" title={f.invoiceId || ''}>{f.invoiceNumber || '—'}</td>
                  <td className="text-gray-600">{f.supplier || '—'}</td>
                  <td className="text-gray-500">{f.vessel || '—'}</td>
                  <td className="text-center text-gray-500">{f.currency}</td>
                  <td className="text-left tabular-nums">{f.invoiceTotal == null ? '—' : fmt(f.invoiceTotal)}</td>
                  <td className="text-left tabular-nums text-red-600">{f.storedPaidAmount == null ? '—' : fmt(f.storedPaidAmount)}</td>
                  <td className="text-left tabular-nums text-emerald-700">{f.actualPaymentsSum == null ? '—' : fmt(f.actualPaymentsSum)}</td>
                  <td className="text-left tabular-nums font-semibold">{f.difference == null ? '—' : fmt(f.difference)}</td>
                  <td className="text-left tabular-nums">{f.calculatedRemaining == null ? '—' : fmt(f.calculatedRemaining)}</td>
                  <td className="text-gray-600">{(f.rulesTriggered || []).map((r: string, j: number) => <div key={j}>• {r}</div>)}</td>
                  <td className="text-left tabular-nums font-bold text-red-600">{fmt(f.netExposure)}</td>
                  <td className="text-center"><span className={cx('px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', SEV[f.severity].tone)}>{SEV[f.severity].ar}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* المبالغ السالبة */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-1">المبالغ السالبة — تصنيف بلا تعديل</h3>
        <p className="text-[11px] text-gray-400 mb-3">لم تُمنع ولم تُغيَّر. التصنيف مبدئي من رقم/وصف المستند ويحتاج تأكيداً بشرياً.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">فواتير سالبة: <b>{data.negativeAmounts?.invoices?.total ?? 0}</b></p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {Object.entries(data.negativeAmounts?.invoices?.byClass || {}).map(([k, v]: any) => (
                <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{NEG_CLASS[k] || k}: {v}</span>
              ))}
            </div>
            <div className="text-xs text-gray-500"><CcyList map={data.negativeAmounts?.invoices?.byCurrency} /></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">سدادات سالبة: <b>{data.negativeAmounts?.payments?.total ?? 0}</b></p>
            <div className="text-xs text-gray-500"><CcyList map={data.negativeAmounts?.payments?.byCurrency} /></div>
          </div>
        </div>
      </Card>

      {/* الحالات التفصيلية */}
      <Card className="p-5 overflow-x-auto">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-bold text-gray-800">الحالات التفصيلية ({findings.length})</h3>
          {(sevFilter || ruleFilter) && <Button variant="ghost" size="sm" onClick={() => { setSevFilter(''); setRuleFilter(''); }}>إلغاء الفلترة</Button>}
        </div>
        <table className="w-full text-xs min-w-[1000px]">
          <thead><tr className="text-gray-500 border-b">
            <th className="text-right py-2">الفاتورة</th><th className="text-right">المورد</th><th className="text-right">المركب</th>
            <th className="text-center">العملة</th><th className="text-left">الإجمالي</th><th className="text-left">المخزَّن</th>
            <th className="text-left">السدادات الفعلية</th><th className="text-left">المتبقي</th><th className="text-center">الحالة</th>
            <th className="text-right">المشكلة</th><th className="text-center">الخطورة</th>
          </tr></thead>
          <tbody>
            {findings.slice(0, 400).map((f: any, i: number) => {
              const drift = f.storedPaidAmount != null && f.actualPaymentsSum != null && Math.abs(f.storedPaidAmount - f.actualPaymentsSum) > 0.01;
              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 font-mono text-brand-700" title={f.invoiceId || ''}>{f.invoiceNumber || '—'}</td>
                  <td className="text-gray-600">{f.supplier || '—'}</td>
                  <td className="text-gray-500">{f.vessel || '—'}</td>
                  <td className="text-center text-gray-500">{f.currency}</td>
                  <td className="text-left tabular-nums">{f.invoiceTotal == null ? '—' : fmt(f.invoiceTotal)}</td>
                  <td className={cx('text-left tabular-nums', drift && 'text-red-600 font-semibold')}>{f.storedPaidAmount == null ? '—' : fmt(f.storedPaidAmount)}</td>
                  <td className={cx('text-left tabular-nums', drift && 'text-emerald-700 font-semibold')}>{f.actualPaymentsSum == null ? '—' : fmt(f.actualPaymentsSum)}</td>
                  <td className="text-left tabular-nums">{f.calculatedRemaining == null ? '—' : fmt(f.calculatedRemaining)}</td>
                  <td className="text-center text-gray-500">{f.status || '—'}{f.approvalStatus ? ` / ${f.approvalStatus}` : ''}</td>
                  <td className="text-gray-700">{f.issue}{f.confidence ? ` (${f.confidence})` : ''}</td>
                  <td className="text-center"><span className={cx('px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', SEV[f.severity].tone)}>{SEV[f.severity].ar}</span></td>
                </tr>
              );
            })}
            {!findings.length && <tr><td colSpan={11} className="text-center py-8 text-gray-400">لا توجد حالات مطابقة للفلتر</td></tr>}
          </tbody>
        </table>
        {findings.length > 400 && <p className="text-[11px] text-gray-400 mt-2">تُعرض أول 400 حالة — صدِّر Excel للقائمة الكاملة ({findings.length}).</p>}
      </Card>

      <Card className="p-4">
        <ul className="text-[11px] text-gray-500 space-y-1 list-disc pe-5">
          {(data.notes || []).map((x: string, i: number) => <li key={i}>{x}</li>)}
        </ul>
      </Card>
    </div>
  );
}
