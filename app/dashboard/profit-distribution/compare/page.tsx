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
import RatificationPanel from '../RatificationPanel';

/*
 * شاشة الاعتماد والمصادقة.
 *
 * ── ما تفعله ──
 * تعرض **الطريقة المعتمدة** كاملةً — ومنها الرقم الذي يُحوَّل إلى البنك — ثمّ
 * تُتيح المصادقة عليه فيُجمَّد. وتحتها جسرٌ يُظهر لماذا تفترق عن سلسلة المستند.
 *
 * ── ولماذا منفصلةٌ عن كشف التوزيع ──
 * الكشف يعرض سلسلة المستند: التوزيع وحصص الأعباء وأثر الشراكة — وهو ما يُطبع
 * للإدارة. وهذه تعرض ما يُحوَّل. وخلطهما في صفحةٍ واحدة يجعل القارئ يظنّ
 * الرقمين شيئاً واحداً وهما ليسا كذلك.
 *
 * ولا تحسب هذه الشاشة شيئاً بنفسها: المحرّك واحدٌ في `@/lib/profitModel`.
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
          <h1 className="text-2xl font-bold text-gray-800">الاعتماد والمصادقة</h1>
          <p className="text-xs text-gray-500 mt-1">
            الطريقة المعتمدة — منها التحويل البنكيّ، وعليها تتمّ المصادقة
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
      <p className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-3 py-2 mb-4 max-w-3xl">
        <b>الرقم الذي يُحوَّل إلى البنك يخرج من هذه الشاشة</b> — وعليه تتمّ المصادقة،
        ومنه يُبنى الرصيد التراكميّ. وكشف التوزيع يعرض سلسلة المستند: التوزيع وحصص
        الأعباء وأثر الشراكة.
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

              <div className="mt-6 pt-5 border-t">
                <RatificationPanel period={selected as any} result={approved} proposed={proposed}
                  onChanged={async () => {
                    const fresh = await api.get(`/api/profit-periods/${selected.id}`);
                    setPeriods((ps) => ps.map((x) => (x.id === fresh.data.id ? fresh.data : x)));
                  }} />
              </div>

              {proposed.available && (
                <div className="mt-5 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <Stat label="مجموع التحويل · المعتمدة" value={fmt(proposed.grandTotal)} />
                  <Stat label="مجموع سلسلة المستند" muted
                    value={fmt(approved.vessels.reduce((a, v) => a + v.dueToAccount, 0))} />
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
