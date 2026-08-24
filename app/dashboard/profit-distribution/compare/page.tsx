'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';
import {
  calculateDistribution, calculateProposed, toModelInput,
  type ModelResult, type ProposedResult,
} from '@/lib/profitModel';
import ProposedMethod from '../ProposedMethod';

/*
 * شاشة مقارنة الطرق — منفصلةٌ عن كشف التوزيع عمداً.
 *
 * الكشف يعرض **ما يُوزَّع**، وهذه تعرض **ما لو وُزِّع بطريقةٍ أخرى**. وخلطهما
 * في صفحةٍ واحدة يجعل القارئ يظنّ الرقمين معتمدَين، فيُنقل إلى الإدارة ما لم
 * يُقرَّر بعد. فصُلا.
 *
 * ولا تحسب هذه الشاشة شيئاً بنفسها: المحرّك واحدٌ في `@/lib/profitModel`،
 * وهي تختار فترةً وتعرض.
 */

type Period = Record<string, unknown> & { id: string; period_name: string };

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function ComparePage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/profit-periods');
      const list: Period[] = Array.isArray(res.data) ? res.data : [];
      setPeriods(list);
      setSelectedId((cur) => cur || list[0]?.id || '');
      setError('');
    } catch {
      setError('تعذّر تحميل فترات التوزيع — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = periods.find((p) => p.id === selectedId) || null;

  const approved: ModelResult | null = useMemo(
    () => (selected ? calculateDistribution(toModelInput(selected)) : null),
    [selected],
  );
  const proposed: ProposedResult | null = useMemo(
    () => (selected ? calculateProposed(toModelInput(selected)) : null),
    [selected],
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">مقارنة طرق الحساب</h1>
          <p className="text-xs text-gray-500 mt-1">
            الطريقة المقترحة بجوار المعتمدة — وجسرٌ يُظهر من أين جاء الفرق
          </p>
        </div>
        <Link href="/dashboard/profit-distribution"
          className="text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-lg px-3 py-2">
          ← كشف التوزيع
        </Link>
      </div>

      {/*
        * تذكيرٌ دائم: المعروض هنا ليس قراراً.
        * وهو أهمّ ما في الشاشة — لأنّ الأرقام تبدو نهائيّةً وليست كذلك.
        */}
      <p className="text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2 mb-4 max-w-3xl">
        <b>ما يُوزَّع فعلاً هو الطريقة المعتمدة</b> — وهي في كشف التوزيع، وهي وحدها
        ما يُطبع للإدارة. وهذه الشاشة للمقارنة والقرار، لا للاعتماد.
      </p>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <p className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">لا فتراتٍ محفوظة بعد</p>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow p-4 mb-6">
            <label className="block text-xs text-gray-500 mb-1.5">الفترة</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full max-w-xl border rounded-lg px-3 py-2 text-sm">
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.period_name}</option>
              ))}
            </select>
          </div>

          {selected && approved && proposed && (
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h3 className="font-bold text-slate-800">{selected.period_name}</h3>
                <p className="text-xs text-gray-500">
                  {approved.days} يوم · {approved.partners === 1 ? 'شريكٌ واحد' : 'شريكان'}
                </p>
              </div>

              {approved.missing.length > 0 && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5 mt-2">
                  مدخلاتٌ ناقصة في هذه الفترة — الأرقام أدناه لا يُعتمد عليها.
                </p>
              )}

              <ProposedMethod result={approved} proposed={proposed} alwaysOpen />

              {proposed.available && (
                <div className="mt-5 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <Stat label="مجموع المعتمدة"
                    value={fmt(approved.vessels.reduce((a, v) => a + v.dueToAccount, 0))} />
                  <Stat label="مجموع المقترحة" value={fmt(proposed.grandTotal)} />
                  <Stat label="نقد ضبا" value={fmt(approved.totalCashDuba)} muted />
                  <Stat label="مجموع صافي الإيراد"
                    value={fmt(proposed.vessels.reduce((a, v) => a + v.netRevenue, 0))} muted />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${muted ? 'bg-gray-50' : 'bg-slate-50'}`}>
      <div className="text-[11px] text-gray-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${muted ? 'text-gray-600' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}
