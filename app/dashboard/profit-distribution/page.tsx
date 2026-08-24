'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { TableSkeleton } from '@/components/ui';
import {
  calculateDistribution, toModelInput, daysBetween,
  VESSEL_KEYS, VESSEL_NAMES, DEFAULT_DAILY_RATE,
  type ModelResult, type VesselKey,
} from '@/lib/profitModel';
import { integrityIssues, type VoyageRow, type VoyageDetail } from '@/lib/voyageDetail';
import DistributionReport from './DistributionReport';
import RatificationPanel from './RatificationPanel';

/*
 * شاشة توزيع الأرباح — مبنيّة على معادلة المستند المعتمد.
 *
 * المستند لا يبدأ من الإيراد بل من النقد المتاح في ضبا. فالشاشة تُفرّق صراحةً
 * بين ما يعرفه دفتر الرحلات وما لا يعرفه:
 *
 *   من الشيت   عدد الرحلات · أساس العمولة `trE` · الوقود `bnk` · الإيراد · السيولة
 *   من الخزينة نقد ضبا · صافي التحصيل في صفاجا
 *
 * وكلّ حقلٍ يحمل مصدره على وجهه، فلا يُخلط رقمٌ محسوبٌ برقمٍ مُدخَل.
 */

/**
 * التوزيع شراكةُ خطّ ضبا/سفاجا وحده.
 *
 * دليلة تُبحر على جدّة/سواكن منذ يناير ٢٠٢٦ — ولهذا تظهر صفراً في مستندات
 * التوزيع رغم نشاطها. وأرقام رحلاتها تبدأ من ١ في كلّ خطّ، فمدىً بالرقم بلا
 * قيد الخطّ يخلط سلسلتين ويقلب القسمة من شريكين إلى ثلاثة.
 */
const DISTRIBUTION_LINE = 'ضبا/سفاجا';


interface Period {
  id: string;
  period_name: string;
  date_from: string;
  date_to: string;

  poseidon_revenue: number; amal_revenue: number; daleela_revenue: number;
  poseidon_voyages: number; amal_voyages: number; daleela_voyages: number;
  poseidon_over_pax: number; amal_over_pax: number; daleela_over_pax: number;
  /** Over Pax المحصَّل في صفاجا — لا يدخل وعاء ضبا */
  poseidon_over_pax_safaga: number; amal_over_pax_safaga: number;
  daleela_over_pax_safaga: number;
  /** `Fuel Supply` — يُضاف للتحويل البنكيّ لسداد المورّد · غير بنكر الدفتر */
  poseidon_fuel_supply: number; amal_fuel_supply: number; daleela_fuel_supply: number;
  // ── المصادقة ──
  ratified_at: string | null; ratified_by: string | null;
  ratified_snapshot: any; latest_snapshot: any; latest_fetched_at: string | null;

  // ── مدخلات معادلة المستند ──
  poseidon_sd_base: number; poseidon_sd_adjust: number;
  poseidon_fuel: number; poseidon_fuel_adjust: number;
  poseidon_cash_duba: number; poseidon_net_collected: number;
  poseidon_liquidity: number; poseidon_daily_rate: number;

  amal_sd_base: number; amal_sd_adjust: number;
  amal_fuel: number; amal_fuel_adjust: number;
  amal_cash_duba: number; amal_net_collected: number;
  amal_liquidity: number; amal_daily_rate: number;

  daleela_sd_base: number; daleela_sd_adjust: number;
  daleela_fuel: number; daleela_fuel_adjust: number;
  daleela_cash_duba: number; daleela_net_collected: number;
  daleela_liquidity: number; daleela_daily_rate: number;

  poseidon_off_hire: number; amal_off_hire: number; daleela_off_hire: number;

  adjust_reason: string;
  commission_rate: number; per_voyage_fee: number;
  /** لقطة تفصيل الرحلات لحظة الجلب — دليلٌ على ما حُسب، لا رابطٌ حيّ */
  voyage_detail: VoyageDetail | null;

  // ── حقول المعادلة السابقة — محفوظة لا محسوبة ──
  bunker_badawi: number; bunker_ittihad: number;
  poseidon_rent: number; amal_rent: number; daleela_rent: number;
  commission_amount: number;
  cash_safaga_badawi: number; cash_safaga_ittihad: number;
  transfers_badawi: number; transfers_ittihad: number;
  ratio_badawi: number; ratio_ittihad: number;
  balance_prev_badawi: number; balance_prev_ittihad: number;

  status: string; notes: string;
}

type Form = Omit<Period, 'id'>;

const emptyForm = (): Form => ({
  period_name: '', date_from: '', date_to: '',
  poseidon_revenue: 0, amal_revenue: 0, daleela_revenue: 0,
  poseidon_voyages: 0, amal_voyages: 0, daleela_voyages: 0,
  poseidon_over_pax: 0, amal_over_pax: 0, daleela_over_pax: 0,
  poseidon_over_pax_safaga: 0, amal_over_pax_safaga: 0, daleela_over_pax_safaga: 0,
  poseidon_fuel_supply: 0, amal_fuel_supply: 0, daleela_fuel_supply: 0,
  ratified_at: null, ratified_by: null,
  ratified_snapshot: null, latest_snapshot: null, latest_fetched_at: null,

  poseidon_sd_base: 0, poseidon_sd_adjust: 0,
  poseidon_fuel: 0, poseidon_fuel_adjust: 0,
  poseidon_cash_duba: 0, poseidon_net_collected: 0,
  poseidon_liquidity: 0, poseidon_daily_rate: DEFAULT_DAILY_RATE.poseidon,

  amal_sd_base: 0, amal_sd_adjust: 0,
  amal_fuel: 0, amal_fuel_adjust: 0,
  amal_cash_duba: 0, amal_net_collected: 0,
  amal_liquidity: 0, amal_daily_rate: DEFAULT_DAILY_RATE.amal,

  daleela_sd_base: 0, daleela_sd_adjust: 0,
  daleela_fuel: 0, daleela_fuel_adjust: 0,
  daleela_cash_duba: 0, daleela_net_collected: 0,
  daleela_liquidity: 0, daleela_daily_rate: DEFAULT_DAILY_RATE.daleela,

  poseidon_off_hire: 0, amal_off_hire: 0, daleela_off_hire: 0,

  adjust_reason: '',
  commission_rate: 6.5, per_voyage_fee: 500,
  voyage_detail: null,

  bunker_badawi: 0, bunker_ittihad: 0,
  poseidon_rent: 0, amal_rent: 0, daleela_rent: 0,
  commission_amount: 0,
  cash_safaga_badawi: 0, cash_safaga_ittihad: 0,
  transfers_badawi: 0, transfers_ittihad: 0,
  ratio_badawi: 50, ratio_ittihad: 50,
  balance_prev_badawi: 0, balance_prev_ittihad: 0,

  status: 'draft', notes: '',
});

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** الأقواس للسالب — كما يكتبها المستند. */
const paren = (n: number) => (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** المثنّى في العربيّة يحمل العدد في صيغته، فذكرُ الرقم معه تكرار. */
const partnersLabel = (n: number) =>
  n === 0 ? 'لا شركاء' : n === 1 ? 'شريكٌ واحد' : n === 2 ? 'شريكان' : `${n} شركاء`;

export default function ProfitDistributionPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [sheetInfo, setSheetInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Period | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  /** مراكبُ ملأ الجلبُ لها Over Pax — يقع في خانة ضبا، فيُراجَع */
  const [opFromSheet, setOpFromSheet] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  /*
   * مدى رقم الرحلة لكلّ مركب.
   *
   * رحلات المراكب لا تتزامن — بوسيدون ٦٩→٧٢ وأمل ٥٢→٥٦ يقعان في الفترة نفسها
   * بأرقامٍ مختلفة، ومدىً تقويميّ واحد يلتقط من كلٍّ ما لا يخصّ الفترة. والمستند
   * نفسه يعمل بأرقام الرحلات — فهي الانتقاء الصحيح، والتاريخ بديلٌ عند غيابها.
   */
  const [voyRange, setVoyRange] = useState<Record<string, { from: string; to: string }>>({
    poseidon: { from: '', to: '' }, amal: { from: '', to: '' }, daleela: { from: '', to: '' },
  });
  const setRange = (k: string, part: 'from' | 'to', v: string) =>
    setVoyRange((r) => ({ ...r, [k]: { ...r[k], [part]: v.replace(/[^\d]/g, '') } }));

  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get('/api/profit-periods');
      setPeriods(Array.isArray(res.data) ? res.data : []);
      setListError('');
    } catch {
      setListError('تعذّر تحميل فترات التوزيع — حدّث الصفحة أو أعد المحاولة.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setVoyRange({ poseidon: { from: '', to: '' }, amal: { from: '', to: '' }, daleela: { from: '', to: '' } });
    setSheetInfo(null);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Period) {
    setEditing(p);
    const { id, ...rest } = p;
    // فترةٌ حُفظت قبل هذه الحقول تأتي بـ null — تُملأ بالافتراضيّ لا بصفرٍ يُعطّل الإيجار
    const f = { ...emptyForm(), ...rest } as Form;
    for (const k of VESSEL_KEYS) {
      const rateKey = `${k}_daily_rate` as keyof Form;
      if (!num(f[rateKey])) (f as any)[rateKey] = DEFAULT_DAILY_RATE[k];
    }
    if (!num(f.commission_rate)) f.commission_rate = 6.5;
    if (!num(f.per_voyage_fee)) f.per_voyage_fee = 500;
    setForm(f);
    setSheetInfo(null);
    setError('');
    setShowModal(true);
  }

  const set = <K extends keyof Form>(key: K, val: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setNum = (key: keyof Form, val: number) =>
    setForm((prev) => ({ ...prev, [key]: val } as Form));

  /*
   * الجلب من الشيت الموحّد.
   *
   * يملأ ما يعرفه دفتر الرحلات فقط. نقد ضبا وتحصيل صفاجا **لا يُمسّان**:
   * أرصدة خزينةٍ فعليّة، وتصفيرها من الشيت يمحو مُدخلاً بشرياً بلا تنبيه.
   */
  async function fetchSheet() {
    if (!form.date_from || !form.date_to) { setError('أدخل الفترة الزمنية أولاً'); return; }
    setFetchingSheet(true);
    setError('');
    try {
      const ranges: Record<string, { from: number; to: number }> = {};
      for (const k of VESSEL_KEYS) {
        const r = voyRange[k];
        if (r?.from && r?.to) ranges[k] = { from: Number(r.from), to: Number(r.to) };
      }
      const res = await api.post('/api/profit-periods/fetch-sheet', {
        date_from: form.date_from, date_to: form.date_to,
        line: DISTRIBUTION_LINE,
        ...(Object.keys(ranges).length ? { ranges } : {}),
      });
      const d = res.data;
      const filled: string[] = [];
      setForm((prev) => {
        const next = { ...prev };
        for (const k of VESSEL_KEYS) {
          const v = d[k];
          if (!v) continue;
          (next as any)[`${k}_revenue`] = v.revenue ?? 0;
          (next as any)[`${k}_voyages`] = v.voyages ?? 0;
          (next as any)[`${k}_sd_base`] = v.sdBase ?? 0;
          /*
           * البنكر **لا يُجلَب** — بقرار المالك، وبعد حادثة.
           *
           * كان الجلب يكتبه دائماً حتّى بصفر، فمحا بنكر أمل ٣١٥٬٨٤١.٣٥ في
           * فترة ١–١٥ أغسطس ٢٠٢٦، فاختفت حصّة الوقود وزاد التوزيع ١٥٧٬٩٢٠.٦٧
           * لكلّ شريك. ولم يُكتشف إلا بحارس الخزينة.
           *
           * ويُعرض المسحوب للمقارنة في `sheetInfo` ولا يُكتب.
           */
          (next as any)[`${k}_liquidity`] = v.liquidity ?? 0;
          // الخزينة — يحسبها دفتر المركب منذ أغسطس ٢٠٢٦
          (next as any)[`${k}_cash_duba`] = v.cashDuba ?? 0;
          (next as any)[`${k}_net_collected`] = v.cashSafaga ?? 0;
          /*
           * Over Pax وتسوية الإيقاف يدويّان — فلا يُصفّرهما الجلب.
           *
           * عمودهما في الدفتر فارغٌ اليوم، فالجلب يُرجع صفراً. ولو كُتب الصفر
           * فوق ما أدخله المستخدم لمُحي عمله عند أوّل «جلب من الشيت» — بلا
           * رسالة، ولا يُلاحَظ إلا في التوزيع.
           *
           * فالقاعدة: الدفتر يملأ حين يحمل قيمة، ويسكت حين لا يحمل.
           */
          /*
           * والدفتر لا يفرّق بين ضبا وصفاجا — عمودٌ واحد فيه.
           *
           * فما يملؤه الجلب يقع في خانة **ضبا** بالضرورة. وإن كان بعضه محصَّلاً
           * في صفاجا فالرقم خطأ، ولا يظهر خطؤه إلا في التوزيع. ولهذا يُعلَن
           * صراحةً بدل أن يمرّ صامتاً — وهو الخطأ الذي بولغ به في نصيب بوسيدون
           * ٤٬٩٥٥ دولاراً في فترة ١–١٥ أغسطس ٢٠٢٦.
           */
          if (Number(v.overPax)) {
            (next as any)[`${k}_over_pax`] = v.overPax;
            filled.push(VESSEL_NAMES[k]);
          }
          if (Number(v.offHire)) (next as any)[`${k}_off_hire`] = v.offHire;
        }
        // العمولة الإجمالية القديمة — تُحدَّث لأنّها معروضة، ولا تدخل الحساب
        next.commission_amount =
          (d.poseidon?.commission ?? 0) + (d.amal?.commission ?? 0) + (d.daleela?.commission ?? 0);
        // لقطةُ التفصيل تُحفظ مع الفترة — الدفتر يتغيّر، والمحفوظ هو الدليل
        const detail: VoyageDetail = { fetchedAt: d.source?.fetchedAt };
        for (const k of VESSEL_KEYS) {
          const r = d[k]?.voyageRows;
          if (Array.isArray(r) && r.length) detail[k] = r;
        }
        next.voyage_detail = Object.keys(detail).length > 1 ? detail : null;
        return next;
      });
      setSheetInfo(d.source ? { ...d, source: d.source } : d);
      setOpFromSheet(filled);
    } catch (e: any) {
      setError('فشل الجلب من الشيت: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setFetchingSheet(false);
    }
  }

  async function handleSave() {
    if (!form.period_name || !form.date_from || !form.date_to) {
      setError('اسم الفترة والتواريخ مطلوبة');
      return;
    }
    if (hasAdjust && !form.adjust_reason.trim()) {
      setError('تعديلٌ يدويّ بلا سبب — اكتب سبب التعديل قبل الحفظ');
      return;
    }
    setLoading(true);
    try {
      if (editing) await api.put(`/api/profit-periods/${editing.id}`, form);
      else await api.post('/api/profit-periods', form);
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف "${name}"؟`)) return;
    await api.delete(`/api/profit-periods/${id}`);
    if (selected?.id === id) setSelected(null);
    load();
  }

  const calc = useMemo(() => calculateDistribution(toModelInput(form as any)), [form]);
  const detail = useMemo(
    () => (selected ? calculateDistribution(toModelInput(selected as any)) : null),
    [selected],
  );
  const hasAdjust = VESSEL_KEYS.some(
    (k) => num((form as any)[`${k}_sd_adjust`]) !== 0 || num((form as any)[`${k}_fuel_adjust`]) !== 0,
  );
  const days = daysBetween(form.date_from, form.date_to);

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">توزيع الأرباح</h1>
          <p className="text-xs text-gray-500 mt-1">
            على معادلة المستند المعتمد — الأساس هو النقد المتاح في ضبا، لا الإيراد
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/profit-distribution/balance"
            className="text-sm text-indigo-700 hover:text-indigo-900 border border-indigo-300 rounded-lg px-3 py-2">
            الرصيد التراكميّ ←
          </Link>
          <Link href="/dashboard/profit-distribution/compare"
            className="text-sm text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-2">
            مقارنة الطرق ←
          </Link>
          <button onClick={openAdd} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
            + فترة جديدة
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th scope="col" className="px-4 py-3">الفترة</th>
              <th scope="col" className="px-4 py-3">من</th>
              <th scope="col" className="px-4 py-3">إلى</th>
              <th scope="col" className="px-4 py-3 text-left">نقد ضبا</th>
              <th scope="col" className="px-4 py-3 text-left">توزيع أمل</th>
              <th scope="col" className="px-4 py-3 text-left">توزيع بوسيدون</th>
              <th scope="col" className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const c = calculateDistribution(toModelInput(p as any));
              const amal = c.vessels.find((v) => v.key === 'amal');
              const pos = c.vessels.find((v) => v.key === 'poseidon');
              const blocked = c.missing.length > 0;
              return (
                <tr key={p.id} className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                  <td className="px-4 py-3 font-medium">
                    {p.period_name}
                    {blocked && (
                      <span className="ms-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        مدخلات ناقصة
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.date_from}</td>
                  <td className="px-4 py-3 text-gray-500">{p.date_to}</td>
                  <td className="px-4 py-3 text-left font-mono">{fmt(c.totalCashDuba)}</td>
                  {blocked ? (
                    <td className="px-4 py-3 text-left text-amber-700 text-xs" colSpan={2}>
                      لا يُحتسب — {c.missing[0]}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-emerald-700">
                        {fmt(amal?.dividendPayable ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-emerald-700">
                        {fmt(pos?.dividendPayable ?? 0)}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} disabled={!!(p as any).ratified_at}
                      title={(p as any).ratified_at ? 'مُصادَقٌ عليها ومُقفلة — فُكَّ المصادقة أوّلاً' : ''}
                      className="text-blue-600 hover:underline text-xs disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">
                      تعديل
                    </button>
                    <button onClick={() => handleDelete(p.id, p.period_name)} className="text-red-500 hover:underline text-xs">حذف</button>
                  </td>
                </tr>
              );
            })}
            {listLoading && periods.length === 0 && (
              <tr><td colSpan={7} className="py-3"><TableSkeleton rows={4} cols={7} /></td></tr>
            )}
            {!listLoading && listError && (
              <tr><td colSpan={7} className="text-center py-8 text-red-600 text-sm">{listError}</td></tr>
            )}
            {!listLoading && !listError && periods.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد فترات بعد</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && detail && (
        <div>
          <div className="flex justify-end mb-2">
            <button onClick={() => setPrinting(true)} disabled={detail.missing.length > 0}
              title={detail.missing.length > 0 ? 'مدخلاتٌ ناقصة — لا يُطبع كشفٌ غير مكتمل' : ''}
              className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed">
              🖨️ كشف للإدارة
            </button>
          </div>
          <RatificationPanel period={selected as any} result={detail}
            onChanged={async () => {
              await load();
              const fresh = await api.get(`/api/profit-periods/${selected.id}`);
              setSelected(fresh.data);
            }} />
          <DistributionCard title={`${selected.period_name} — كشف التوزيع`} result={detail}
            detail={selected.voyage_detail} />
        </div>
      )}

      {printing && selected && detail && (
        <DistributionReport
          periodName={selected.period_name}
          dateFrom={selected.date_from}
          dateTo={selected.date_to}
          result={detail}
          detail={selected.voyage_detail}
          onClose={() => setPrinting(false)}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl my-4">
            <h3 className="font-bold text-lg mb-4 text-emerald-700">{editing ? 'تعديل فترة' : 'فترة جديدة'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم الفترة *</label>
                <input value={form.period_name} onChange={(e) => set('period_name', e.target.value)}
                  placeholder="١٨ – ٣١ يوليو ٢٠٢٦"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">من *</label>
                <input type="date" value={form.date_from} onChange={(e) => set('date_from', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  إلى * {days > 0 && <span className="text-emerald-600 font-semibold">· {days} يوم</span>}
                </label>
                <input type="date" value={form.date_to} onChange={(e) => set('date_to', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            {/* ── الجلب من الشيت ── */}
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-800">
                    جلب من الشيت الموحّد — خطّ {DISTRIBUTION_LINE}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    الرحلات · أساس العمولة · الوقود · الإيراد · السيولة — يُحدَّث ثلاث مرّات يومياً
                  </p>
                </div>
                <button onClick={fetchSheet} disabled={fetchingSheet}
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                  {fetchingSheet ? 'جاري الجلب...' : 'جلب من الشيت'}
                </button>
              </div>

              <div className="mt-2 border-t border-emerald-200 pt-2">
                <p className="text-[11px] font-semibold text-emerald-800 mb-1.5">
                  حدّد بأرقام الرحلات لكلّ مركب — كما يفعل المستند. واتركها فارغة ليُنتقى بالتاريخ.
                </p>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {VESSEL_KEYS.map((k) => (
                    <div key={k} className="flex items-center gap-1">
                      <span className="text-[11px] text-emerald-900 w-14 shrink-0">{VESSEL_NAMES[k]}</span>
                      <input inputMode="numeric" value={voyRange[k].from} onChange={(e) => setRange(k, 'from', e.target.value)}
                        placeholder="من" className="w-full border border-emerald-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                      <span className="text-emerald-500 text-[11px]">→</span>
                      <input inputMode="numeric" value={voyRange[k].to} onChange={(e) => setRange(k, 'to', e.target.value)}
                        placeholder="إلى" className="w-full border border-emerald-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    </div>
                  ))}
                </div>
              </div>

              {sheetInfo && (
                <div className="text-[11px] text-emerald-800 mt-2 border-t border-emerald-200 pt-1.5 space-y-0.5">
                  {VESSEL_KEYS.map((k) => {
                    const v = sheetInfo[k];
                    if (!v || (!v.voyages && !v.expected)) return null;
                    const gap = v.missing && v.missing.length > 0;
                    return (
                      <p key={k} className={gap ? 'text-red-700 font-semibold' : ''}>
                        {gap ? '⚠' : '✓'} {VESSEL_NAMES[k]} — {v.voyages} رحلة
                        {v.by === 'ref' && v.refs?.length ? <> · REF {v.refs[0]}–{v.refs[v.refs.length - 1]}</> : null}
                        {v.firstDate && <> · {v.firstDate} → {v.lastDate}</>}
                        {gap && <> · <span className="text-red-700">غير موجودة: {v.missing.join('، ')}</span></>}
                      </p>
                    );
                  })}
                  {sheetInfo.source?.offLine > 0 && (
                    <p className="text-emerald-700 pt-0.5">
                      استُبعدت {sheetInfo.source.offLine} رحلة على خطوطٍ أخرى — التوزيع
                      شراكةُ {DISTRIBUTION_LINE} وحده
                    </p>
                  )}
                  {(() => {
                    // رحلاتٌ لها نشاطٌ ولم تُملأ أعمدة خزينتها في الدفتر —
                    // يُبلَّغ بها هنا لا في الجدول وحده، فالجدول قد لا يُقرأ
                    const short = VESSEL_KEYS
                      .map((k) => ({ k, n: num(sheetInfo[k]?.treasuryMissing) }))
                      .filter((x) => x.n > 0);
                    return short.length ? (
                      <p className="text-red-700 font-semibold pt-0.5">
                        ⚠ خزينةٌ ناقصة في الدفتر —{' '}
                        {short.map((x) => `${VESSEL_NAMES[x.k]}: ${x.n} رحلة`).join(' · ')}
                      </p>
                    ) : (
                      <p className="text-emerald-700 pt-0.5">
                        ✓ الخزينة وصلت كاملةً — نقد ضبا وتحصيل صفاجا من دفتر المركب
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── مدخلات المراكب ── */}
            <Section title="من دفتر الرحلات — يُجلب من الشيت ويقبل التصحيح">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-right py-1 font-medium">المركب</th>
                      <th className="text-right py-1 font-medium">رحلات</th>
                      <th className="text-right py-1 font-medium">الإيراد (عرض)</th>
                      <th className="text-right py-1 font-medium">أساس ٦.٥٪ — شاحنات الذهاب</th>
                      <th className="text-right py-1 font-medium">الوقود</th>
                      <th className="text-right py-1 font-medium">سعر يوميّ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VESSEL_KEYS.map((k) => (
                      <tr key={k} className="border-t">
                        <td className="py-1.5 pe-2 font-medium text-gray-700 whitespace-nowrap">{VESSEL_NAMES[k]}</td>
                        <td className="py-1.5 pe-2">
                          <input type="number" min={0}
                            value={num((form as any)[`${k}_voyages`])}
                            onChange={(e) => setNum(`${k}_voyages` as keyof Form, Math.max(0, Number(e.target.value) || 0))}
                            className="w-16 border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        </td>
                        <td className="py-1.5 pe-2">
                          <MoneyInput value={num((form as any)[`${k}_revenue`])}
                            onChange={(v) => setNum(`${k}_revenue` as keyof Form, v)} muted />
                        </td>
                        <td className="py-1.5 pe-2">
                          <MoneyInput value={num((form as any)[`${k}_sd_base`])}
                            onChange={(v) => setNum(`${k}_sd_base` as keyof Form, v)} />
                        </td>
                        <td className="py-1.5 pe-2">
                          <MoneyInput value={num((form as any)[`${k}_fuel`])}
                            onChange={(v) => setNum(`${k}_fuel` as keyof Form, v)} />
                        </td>
                        <td className="py-1.5 pe-2">
                          <MoneyInput value={num((form as any)[`${k}_daily_rate`])}
                            onChange={(v) => setNum(`${k}_daily_rate` as keyof Form, v)} width="w-24" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {opFromSheet.length > 0 && (
              <p className="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded px-3 py-2 mb-3">
                <b>الجلب ملأ Over Pax لـ {opFromSheet.join(' و')} — في خانة «ضبا».</b>{' '}
                والدفتر عمودٌ واحد لا يفرّق بين المكانين. فراجع المستند: إن كان بعضه
                محصَّلاً في صفاجا فانقله إلى خانته، وإلا بولغ في نصيب أحد الشريكين.
              </p>
            )}

            {/* ── الخزينة ── */}
            <Section title="الخزينة — النقد من الدفتر · وما عداه يدويّ">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-right py-1 font-medium">المركب</th>
                      <th className="text-right py-1 font-medium">نقد ضبا</th>
                      <th className="text-right py-1 font-medium">تحصيل صفاجا</th>
                      <th className="text-right py-1 font-medium">Over Pax · ضبا</th>
                      <th className="text-right py-1 font-medium">Over Pax · صفاجا</th>
                      <th className="text-right py-1 font-medium">البنكر</th>
                      <th className="text-right py-1 font-medium">Fuel Supply</th>
                      <th className="text-right py-1 font-medium">تسوية الإيقاف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VESSEL_KEYS.map((k) => {
                      const duba = num((form as any)[`${k}_cash_duba`]);
                      const sfg = num((form as any)[`${k}_net_collected`]);
                      const op = num((form as any)[`${k}_over_pax`]);
                      const ops = num((form as any)[`${k}_over_pax_safaga`]);
                      const bnk = num((form as any)[`${k}_fuel`]);
                      const fs = num((form as any)[`${k}_fuel_supply`]);
                      const oh = num((form as any)[`${k}_off_hire`]);
                      const active = num((form as any)[`${k}_voyages`]) > 0;
                      const empty = active && !duba && !sfg;
                      return (
                        <tr key={k} className="border-t">
                          <td className="py-1.5 pe-2 font-medium text-gray-700 whitespace-nowrap">
                            {VESSEL_NAMES[k]}
                            {empty && (
                              <span className="ms-1.5 text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded">
                                لم تصل
                              </span>
                            )}
                          </td>
                          <ReadCell value={duba} />
                          <ReadCell value={sfg} />
                          {/*
                            * Over Pax وتسوية الإيقاف يُدخَلان يداً — بالاتّفاق.
                            *
                            * عمودهما في الدفتر موجودٌ وفارغ، فلو بقي الحقل مقفلاً
                            * لما وُجد سبيلٌ لإدخالهما أصلاً. والجلب يملؤهما من
                            * الدفتر حين يجد فيه قيمة، ولا يمحو ما كُتب هنا حين
                            * يجده فارغاً.
                            */}
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={op}
                              onChange={(v) => setNum(`${k}_over_pax` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={ops}
                              onChange={(v) => setNum(`${k}_over_pax_safaga` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={bnk}
                              onChange={(v) => setNum(`${k}_fuel` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={fs}
                              onChange={(v) => setNum(`${k}_fuel_supply` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={oh}
                              onChange={(v) => setNum(`${k}_off_hire` as keyof Form, v)} muted />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-500 mt-2 max-w-2xl">
                <b>نقد ضبا وتحصيل صفاجا</b> يحسبهما دفتر المركب ويجلبهما الشيت — فلا
                يُكتبان هنا. تصحيحهما يكون في الدفتر، ثمّ إعادة الجلب.
                <br />
                <b>و Over Pax وتسوية الإيقاف يُدخَلان هنا يداً.</b> والجلب لا يمحوهما:
                يملؤهما من الدفتر إن وجد فيه قيمة، ويترك ما كتبتَه إن وجده فارغاً.
                <br />
                و Over Pax يُكتب <b>كما نشأ على المركب</b> لا كما آل إلى الشريك — والقسمة
                ٦٦.٦٧٪ لبدوي و ٣٣.٣٣٪ للاتحاد يُجريها النظام.
                <br />
                <b>وافصل ضبا عن صفاجا.</b> المستند يكتبهما مفصولين
                (<span className="font-mono">Dub</span> و<span className="font-mono">Saf</span>)،
                ولكلٍّ مسارٌ مختلف: <b>ضبا</b> يدخل الوعاء المشترك، و<b>صفاجا</b> يبقى عند
                حائزه ويُحوَّل نصيب الشريك الآخر ضمن تسوية صفاجا. وإدخال المبلغ كاملاً في
                خانةٍ واحدة يُبالغ في نصيب أحدهما.
                <br />
                <b>والبنكر و Fuel Supply بندان مختلفان — كلاهما يدويّ ولا يُجلَبان.</b>{' '}
                <b>البنكر</b> يُخصم مناصفةً في التوزيع، و<b>Fuel Supply</b> يُضاف إلى
                التحويل البنكيّ لسداد المورّد. وقد يكونان مختلفين في الفترة نفسها:
                في ١–١٥ أغسطس بنكر أمل ٣١٥٬٨٤١.٣٥ و Fuel Supply صفر.
                <br />
                <span className="text-amber-700">
                  «لم تصل» تعني رحلاتٍ في الفترة لم تُملأ أعمدة خزينتها في الدفتر بعد.
                </span>
              </p>
            </Section>

            {/* ── التعديلات اليدوية ── */}
            <Section title="تعديلاتٌ يدويّة — تُسجَّل ولا تُخفى">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[440px]">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-right py-1 font-medium">المركب</th>
                      <th className="text-right py-1 font-medium">تعديل الأساس</th>
                      <th className="text-right py-1 font-medium">تعديل الوقود</th>
                      <th className="text-right py-1 font-medium">الأثر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VESSEL_KEYS.map((k) => {
                      const sd = num((form as any)[`${k}_sd_base`]) + num((form as any)[`${k}_sd_adjust`]);
                      const fu = num((form as any)[`${k}_fuel`]) + num((form as any)[`${k}_fuel_adjust`]);
                      const touched = num((form as any)[`${k}_sd_adjust`]) || num((form as any)[`${k}_fuel_adjust`]);
                      return (
                        <tr key={k} className="border-t">
                          <td className="py-1.5 pe-2 font-medium text-gray-700 whitespace-nowrap">{VESSEL_NAMES[k]}</td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={num((form as any)[`${k}_sd_adjust`])}
                              onChange={(v) => setNum(`${k}_sd_adjust` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2">
                            <MoneyInput value={num((form as any)[`${k}_fuel_adjust`])}
                              onChange={(v) => setNum(`${k}_fuel_adjust` as keyof Form, v)} />
                          </td>
                          <td className="py-1.5 pe-2 font-mono text-[11px]">
                            {touched
                              ? <span className="text-amber-700">أساس {fmt(sd)} · وقود {fmt(fu)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">
                  سبب التعديل {hasAdjust && <span className="text-red-500">*</span>}
                </label>
                <textarea rows={2} value={form.adjust_reason || ''}
                  onChange={(e) => set('adjust_reason', e.target.value)}
                  placeholder="مثال: أُضيف تحصيل صفاجا إلى أساس أمل، واستُقطع بنكرٌ مؤجَّل ١٧٩٬٥٥٦.١١ — كما في مستند ٢٠ يونيو"
                  className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 ${
                    hasAdjust && !form.adjust_reason.trim()
                      ? 'border-red-300 focus:ring-red-400'
                      : 'focus:ring-emerald-400'
                  }`} />
              </div>
            </Section>

            {/* ── معاملات العمولة ── */}
            <Section title="معاملات العمولة">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">النسبة %</label>
                  <input type="number" step="0.1" value={form.commission_rate}
                    onChange={(e) => setNum('commission_rate', Number(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">رسم الرحلة $</label>
                  <input type="number" step="1" value={form.per_voyage_fee}
                    onChange={(e) => setNum('per_voyage_fee', Number(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              </div>
            </Section>

            {/* ── المعاينة ── */}
            <DistributionCard title="معاينة التوزيع" result={calc} compact
              detail={form.voyage_detail} />

            {/* ── حقول المعادلة السابقة ── */}
            <div className="mt-4">
              <button type="button" onClick={() => setShowLegacy((s) => !s)}
                className="text-xs text-gray-500 hover:text-gray-700 underline">
                {showLegacy ? 'إخفاء' : 'إظهار'} حقول المعادلة السابقة
              </button>
              {showLegacy && (
                <div className="mt-2 border rounded-lg p-3 bg-gray-50">
                  <p className="text-[11px] text-gray-500 mb-3">
                    هذه الحقول لا تدخل معادلة المستند. تبقى قابلةً للتحرير لأنّ فتراتٍ
                    سابقة حُفظت بها، ومحوُها يُخفي ما حُسب حينها بدل أن يُظهره.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {([
                      ['كاش سفاجا — بدوي', 'cash_safaga_badawi'],
                      ['كاش سفاجا — الاتحاد', 'cash_safaga_ittihad'],
                      ['تحويلات — بدوي', 'transfers_badawi'],
                      ['تحويلات — الاتحاد', 'transfers_ittihad'],
                      ['رصيد سابق — بدوي', 'balance_prev_badawi'],
                      ['رصيد سابق — الاتحاد', 'balance_prev_ittihad'],
                      ['العمولة الإجمالية', 'commission_amount'],
                      ['بنكر — بدوي', 'bunker_badawi'],
                      ['بنكر — الاتحاد', 'bunker_ittihad'],
                    ] as const).map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
                        <MoneyInput value={num((form as any)[key])}
                          onChange={(v) => setNum(key as keyof Form, v)} width="w-full" muted />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading}
                className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * كارت التوزيع — على شكل المستند نفسه.
 *
 * رُتِّب صفّاً صفّاً كما في الورقة ليُقارَن بها بالعين مباشرةً: معدّل الربح
 * ثمّ الخصومات الثلاثة ثمّ تسوية صفاجا ثمّ التوزيع. والسطر الأخير — المتبقّي
 * في ضبا — تحقّقٌ ذاتيّ: إن لم يقارب الصفر فثمّة خلل.
 * ══════════════════════════════════════════════════════════════════════════ */
function DistributionCard({ title, result, compact, detail }: {
  title: string; result: ModelResult; compact?: boolean; detail?: VoyageDetail | null;
}) {
  const vs = result.vessels;
  const blocked = result.missing.length > 0;
  const pad = compact ? 'p-4' : 'p-6';
  const [openVessel, setOpenVessel] = useState<string | null>(null);

  return (
    <div className={`bg-white rounded-xl shadow ${pad} mb-6 border ${blocked ? 'border-amber-300' : 'border-transparent'}`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        {/*
         * شارةٌ تُسمّي الطريقة صراحةً. فالسلسلة أدناه هي المعتمدة، وتحتها طيّةٌ
         * فيها المقترحة — ومن لا يعرف ذلك سلفاً يظنّ الظاهرة «هي الحساب» بلا
         * اسم. والاسمان متقابلان الآن، فمن يعرض الشاشة لا يحتاج أن يشرحها.
         */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-bold text-emerald-700">{title}</h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">
            الطريقة المعتمدة
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {result.days} يوم · {partnersLabel(result.partners)}
        </p>
      </div>

      {result.missing.map((m, i) => (
        <p key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5 mb-1.5">
          {m}
        </p>
      ))}
      {result.warnings.map((w, i) => (
        <p key={i} className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded px-2 py-1.5 mb-1.5">
          {w}
        </p>
      ))}

      {vs.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">لا مركب نشط في هذه الفترة</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm" style={{ minWidth: 120 + vs.length * 150 }}>
            <thead>
              <tr className="text-gray-500 text-xs">
                <th className="text-right font-medium pb-2" />
                {vs.map((v) => (
                  <th key={v.key} className="text-left font-semibold pb-2 text-gray-700">
                    {v.name}
                    <span className="block font-normal text-gray-400">{v.voyages} رحلة</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              <ChainRow label="الإيراد (للعرض)" vs={vs} pick={(v) => v.revenue} muted />
              <ChainRow label="نقد ضبا" vs={vs} pick={(v) => v.cashDuba} />
              <SharedRow label={`الأساس المشترك (${fmt(result.totalCashDuba)} ÷ ${result.partners})`}
                value={result.baseShare} cols={vs.length} tone="neutral" />
              {result.totalOverPax !== 0 && (
                <ChainRow label="+ حصّة Over Pax" vs={vs} pick={(v) => v.overPaxShare} signed />
              )}
              <tr className="border-t-2 border-gray-300">
                <td className="py-2 pe-3 font-sans text-gray-700 font-semibold whitespace-nowrap">معدّل الربح</td>
                {vs.map((v) => (
                  <td key={v.key} className="py-2 text-left font-bold text-gray-800">{fmt(v.adjustedProfit)}</td>
                ))}
              </tr>
              <SharedRow label={`− حصّة الإيجار (${fmt(result.totalRent)} ÷ ${result.partners})`}
                value={-result.rentShare} cols={vs.length} />
              <SharedRow label={`− حصّة الوقود (${fmt(result.totalFuel)} ÷ ${result.partners})`}
                value={-result.fuelShare} cols={vs.length} />
              <SharedRow label={`− حصّة العمولة (${fmt(result.totalFee)} ÷ ${result.partners})`}
                value={-result.feeShare} cols={vs.length} />
              <ChainRow label="± تسوية صفاجا" vs={vs} pick={(v) => v.safagaAdjust} signed />
              {/*
                * المستند يطوي البندين في سطرٍ واحد، فيبقى السطر واحداً — ويُفرد
                * المكوّن تحته حين يوجد، لأنّ من يراجع يحتاج أن يرى من أين جاء.
                */}
              {result.totalOverPaxSafaga !== 0 && (
                <ChainRow label={`منه · Over Pax صفاجا (${fmt(result.totalOverPaxSafaga)})`}
                  vs={vs} pick={(v) => v.safagaOverPaxShare} signed muted />
              )}
              <tr className="border-t-2 border-emerald-600 bg-emerald-50">
                <td className="py-2.5 pe-3 font-sans font-bold text-emerald-800 whitespace-nowrap">التوزيع المقترح</td>
                {vs.map((v) => (
                  <td key={v.key} className="py-2.5 text-left font-bold text-emerald-800 text-base">
                    {blocked ? '—' : fmt(v.dividendPayable)}
                  </td>
                ))}
              </tr>
              <ChainRow label="المخصوم من ضبا" vs={vs} pick={(v) => v.deductedFromDuba} muted />
              <ChainRow label="المتبقّي في ضبا" vs={vs} pick={(v) => v.remainingAtDuba} muted />
              <ChainRow label="المستحقّ لحساب المركب" vs={vs} pick={(v) => v.dueToAccount} muted />
              {result.totalFuelSupply !== 0 && (
                <ChainRow label="+ Fuel Supply · لسداد المورّد" vs={vs}
                  pick={(v) => v.fuelSupply} signed muted />
              )}
              {/*
                * سطر التحويل — وهو ما يُصادَق عليه ويُحوَّل إلى البنك.
                *
                * ينفرد عن «المستحقّ» بأمرين يقطع بهما المستند: يُردّ **حصّة**
                * العمولة لا عمولة المركب، ولا يُردّ البنكر بل `Fuel Supply`.
                */}
              <tr className="border-t-2 border-indigo-600 bg-indigo-50">
                <td className="py-2.5 pe-3 font-sans font-bold text-indigo-900 whitespace-nowrap">
                  التحويل إلى الحساب البنكيّ
                </td>
                {vs.map((v) => (
                  <td key={v.key} className="py-2.5 text-left font-bold text-indigo-900 text-base">
                    {blocked ? '—' : fmt(v.transferToAccount)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* حارسا النزاهة — قبل الأرقام لا بعدها */}
      {detail && <IntegrityBanner detail={detail} />}

      {/* أثر الشراكة — من يدعم من، وبكم */}
      {vs.length > 1 && !blocked && <PartnershipEffect result={result} />}

      {/* تفصيل الرحلات — طيّةٌ لكلّ مركب */}
      {vs.length > 0 && detail && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs font-semibold text-gray-500 mb-2">تفصيل الرحلات</p>
          <div className="flex gap-2 flex-wrap">
            {vs.map((v) => {
              const rowsOf = detail[v.key as VesselKey];
              if (!rowsOf?.length) return null;
              const on = openVessel === v.key;
              return (
                <button key={v.key} type="button"
                  onClick={() => setOpenVessel(on ? null : v.key)}
                  className={`text-xs rounded-lg px-3 py-1.5 border transition ${
                    on ? 'bg-emerald-600 text-white border-emerald-600'
                       : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {on ? '▾' : '▸'} {v.name} — {rowsOf.length} رحلة
                </button>
              );
            })}
          </div>
          {openVessel && detail[openVessel as VesselKey]?.length ? (
            <VoyageTable rows={detail[openVessel as VesselKey]!} />
          ) : null}
        </div>
      )}

      {!compact && vs.length > 0 && (
        <div className="mt-4 pt-3 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Stat label="مجموع نقد ضبا" value={fmt(result.totalCashDuba)} />
          <Stat label="مجموع الإيراد" value={fmt(result.totalRevenue)} muted />
          <Stat label="متوسّط التحصيل" value={fmt(result.avgNetCollected)} muted />
          <Stat label="مجموع المستحقّ"
            value={fmt(vs.reduce((a, v) => a + v.dueToAccount, 0))} />
        </div>
      )}
    </div>
  );
}

/**
 * حارسا النزاهة — رحلاتٌ لا يتّسق فيها الدفتر مع نفسه.
 *
 * يُنبّه ولا يمنع، عن قصد: رحلة بوسيدون ٧٨ رصيدها يبدو **سليماً** والخطأ في
 * خليّتَي الميناء (٩٩٬٠٠٠ و٢٥٣٬٠٠٠ بينما جارتها ٤٬٥٠٠ و١١٬٥٠٠). فالمنع كان
 * سيوقف توزيعاً صحيحاً بسبب خطأٍ في تقريرٍ جانبيّ.
 *
 * لكنّ تنبيهاً يُتجاهَل تنبيهٌ ضائع — فيحمل **رقم الرحلة ومقدار الفرق**، لا
 * جملةً عامّة يمرّ عليها النظر.
 */
function IntegrityBanner({ detail }: { detail: VoyageDetail }) {
  const { balance, treasury } = integrityIssues(detail);
  if (!balance.length && !treasury.length) return null;

  const line = (x: { name: string; ref: number | null; gap: number }) =>
    `${VESSEL_NAMES[x.name as VesselKey] ?? x.name} ${x.ref ?? '—'} · ${paren(x.gap)}`;

  return (
    <div className="mt-4 space-y-2">
      {balance.length > 0 && (
        <div className="text-xs bg-red-50 border border-red-300 text-red-800 rounded-lg px-3 py-2">
          <b>⚠ رصيدٌ لا يساوي بنوده — {balance.length} رحلة</b>
          <div className="font-mono mt-1">{balance.map(line).join('   ·   ')}</div>
          <p className="mt-1 text-red-700">
            عمود <code>BALANCE</code> في الدفتر يخالف الإيراد ناقص العمولة والمصاريف.
            وعليه يقوم نقد ضبا وتحصيل صفاجا — فراجع الدفتر قبل اعتماد التوزيع.
          </p>
        </div>
      )}
      {treasury.length > 0 && (
        <div className="text-xs bg-red-50 border border-red-300 text-red-800 rounded-lg px-3 py-2">
          <b>⚠ خزينةٌ لا تُطابق الرصيد — {treasury.length} رحلة</b>
          <div className="font-mono mt-1">{treasury.map(line).join('   ·   ')}</div>
          <p className="mt-1 text-red-700">
            المنتظر أنّ <b>نقد ضبا + تحصيل صفاجا = BALANCE + البنكر</b>. واختلافه
            يعني صيغةً دِيست بقيمةٍ مكتوبة في الدفتر.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * أثر الشراكة — ماذا كان يجني كلّ مركبٍ لو عمل وحده؟
 *
 * المجموع صفريّ: ما تكسبه سفينةٌ تخسره الأخرى بالضبط. فالجدول لا يقول
 * «الشراكة رابحة» — يقول **من يدعم من، وبكم**. وذلك سؤالُ الإدارة لا سؤال
 * المحاسبة، ولهذا تسبقه جملةٌ تشرحه لا أرقامٌ وحدها.
 */
function PartnershipEffect({ result }: { result: ModelResult }) {
  const vs = result.vessels;
  const gainers = vs.filter((v) => v.partnershipGain > 0.005);
  const losers = vs.filter((v) => v.partnershipGain < -0.005);
  const moved = gainers.reduce((a, v) => a + v.partnershipGain, 0);

  return (
    <div className="mt-4 pt-3 border-t">
      <p className="text-xs font-semibold text-gray-500 mb-2">
        أثر الشراكة — لو عمل كلّ مركبٍ وحده
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 120 + vs.length * 150 }}>
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-right font-medium pb-2" />
              {vs.map((v) => (
                <th key={v.key} className="text-left font-semibold pb-2 text-gray-700">{v.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr className="border-t border-gray-100">
              <td className="py-1.5 pe-3 font-sans text-gray-600 whitespace-nowrap">
                منفرداً
                <span className="text-gray-400"> · نقده وتحصيله − إيجاره ووقوده وعمولته</span>
              </td>
              {vs.map((v) => (
                <td key={v.key} className="py-1.5 text-left text-gray-700">{fmt(v.standalone)}</td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-1.5 pe-3 font-sans text-gray-600 whitespace-nowrap">
                شراكةً
                <span className="text-gray-400"> · التوزيع مع تحصيله</span>
              </td>
              {vs.map((v) => (
                <td key={v.key} className="py-1.5 text-left text-gray-700">{fmt(v.partnered)}</td>
              ))}
            </tr>
            <tr className="border-t-2 border-gray-300">
              <td className="py-2 pe-3 font-sans font-bold text-gray-800 whitespace-nowrap">
                أثر الشراكة
              </td>
              {vs.map((v) => (
                <td key={v.key} className={`py-2 text-left font-bold ${
                  v.partnershipGain >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {v.partnershipGain >= 0 ? '+' : '−'}{fmt(Math.abs(v.partnershipGain))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-600 mt-2 bg-gray-50 border-s-2 border-gray-300 ps-2 py-1.5">
        {gainers.length > 0 && losers.length > 0 ? (
          <>
            في هذه الفترة نقلت الشراكة <b>{fmt(moved)}</b> من{' '}
            <b>{losers.map((v) => v.name).join(' و')}</b> إلى{' '}
            <b>{gainers.map((v) => v.name).join(' و')}</b>.{' '}
          </>
        ) : (
          <>في هذه الفترة تعادلت المراكب فلم تنقل الشراكة شيئاً بينها. </>
        )}
        والشراكة <b>تنقل ولا تخلق</b> — فمجموع الأرقام أعلاه صفر. وسببُ النقل أنّ
        الأعباء تُقسم بالتساوي: من كان وقوده أو إيجاره أعلى من المتوسّط تحمّلت
        الشراكة عنه فرقَه، ومن كان أقلّ حمل عن غيره.
      </p>
    </div>
  );
}

/**
 * جدول رحلات المركب — على ترتيب المستند الورقيّ مع زيادة.
 *
 * المستند يعرض الإيراد وحده. والدفتر يحمل معه **الصافي والخزينة** لكلّ رحلة،
 * فيُعرضان — وهما ما يُجيب «ربح كلّ رحلة» لا إيرادها.
 *
 * والشاحنات مجموعةٌ لا مفرَّقة: المستند يقسمها `Trucks` و`Dianna` و`Mafis`،
 * والدفتر يحمل عمود `TRUCK` واحداً. القسمة يدويّة عند من يُعدّ المستند.
 */
function VoyageTable({ rows }: { rows: VoyageRow[] }) {
  const sum = (f: (r: VoyageRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const cnt = (f: (r: VoyageRow) => number) => Math.round(sum(f));

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs min-w-[860px]">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="text-right font-medium py-1.5 whitespace-nowrap">الرحلة</th>
            <th className="text-right font-medium py-1.5 whitespace-nowrap">التاريخ</th>
            <th className="text-center font-medium py-1.5" colSpan={2}>شاحنات</th>
            <th className="text-center font-medium py-1.5" colSpan={2}>مركبات</th>
            <th className="text-center font-medium py-1.5" colSpan={2}>ركّاب</th>
            <th className="text-left font-medium py-1.5">الإيراد</th>
            <th className="text-left font-medium py-1.5">العمولة</th>
            <th className="text-left font-medium py-1.5">المصاريف</th>
            <th className="text-left font-medium py-1.5">الصافي</th>
            <th className="text-left font-medium py-1.5">نقد ضبا</th>
            <th className="text-left font-medium py-1.5">صفاجا</th>
          </tr>
          <tr className="text-gray-400 text-[10px] border-b">
            <th /><th />
            <th className="text-center font-normal pb-1">ذهاب / إياب</th>
            <th className="text-left font-normal pb-1">قيمة</th>
            <th className="text-center font-normal pb-1">ذهاب / إياب</th>
            <th className="text-left font-normal pb-1">قيمة</th>
            <th className="text-center font-normal pb-1">ذهاب / إياب</th>
            <th className="text-left font-normal pb-1">قيمة</th>
            <th colSpan={6} />
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, i) => (
            <tr key={`${r.ref ?? 'x'}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-1.5 font-sans font-medium text-gray-700 whitespace-nowrap">
                {r.ref ?? '—'}
                {r.overPax > 0 && (
                  <span className="ms-1 text-[9px] bg-amber-100 text-amber-800 px-1 rounded">
                    Over Pax
                  </span>
                )}
              </td>
              <td className="py-1.5 pe-2 text-gray-400 whitespace-nowrap text-[10px]">
                {r.dateExp || '—'}{r.dateImp && r.dateImp !== r.dateExp ? ` ← ${r.dateImp}` : ''}
              </td>
              <td className="py-1.5 text-center text-gray-500">{r.nTruckE} / {r.nTruckI}</td>
              <td className="py-1.5 pe-3 text-left">{fmt(r.truck)}</td>
              <td className="py-1.5 text-center text-gray-500">{r.nVehE} / {r.nVehI}</td>
              <td className="py-1.5 pe-3 text-left">{fmt(r.veh)}</td>
              <td className="py-1.5 text-center text-gray-500">{r.nPaxE} / {r.nPaxI}</td>
              <td className="py-1.5 pe-3 text-left">{fmt(r.pax)}</td>
              <td className="py-1.5 pe-3 text-left font-semibold text-gray-800">{fmt(r.income)}</td>
              <td className="py-1.5 pe-3 text-left text-gray-500">{fmt(r.comm)}</td>
              <td className="py-1.5 pe-3 text-left text-gray-500">{fmt(r.man)}</td>
              <td className={`py-1.5 pe-3 text-left font-semibold ${
                r.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{paren(r.net)}</td>
              <td className="py-1.5 pe-3 text-left">{fmt(r.cashDuba)}</td>
              <td className="py-1.5 text-left">{fmt(r.cashSafaga)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 font-semibold">
            <td className="py-2 font-sans text-gray-700" colSpan={2}>الإجمالي — {rows.length} رحلة</td>
            <td className="py-2 text-center text-gray-500">
              {cnt((r) => r.nTruckE)} / {cnt((r) => r.nTruckI)}
            </td>
            <td className="py-2 pe-3 text-left">{fmt(sum((r) => r.truck))}</td>
            <td className="py-2 text-center text-gray-500">
              {cnt((r) => r.nVehE)} / {cnt((r) => r.nVehI)}
            </td>
            <td className="py-2 pe-3 text-left">{fmt(sum((r) => r.veh))}</td>
            <td className="py-2 text-center text-gray-500">
              {cnt((r) => r.nPaxE)} / {cnt((r) => r.nPaxI)}
            </td>
            <td className="py-2 pe-3 text-left">{fmt(sum((r) => r.pax))}</td>
            <td className="py-2 pe-3 text-left text-gray-800">{fmt(sum((r) => r.income))}</td>
            <td className="py-2 pe-3 text-left text-gray-500">{fmt(sum((r) => r.comm))}</td>
            <td className="py-2 pe-3 text-left text-gray-500">{fmt(sum((r) => r.man))}</td>
            <td className={`py-2 pe-3 text-left ${
              sum((r) => r.net) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {paren(sum((r) => r.net))}
            </td>
            <td className="py-2 pe-3 text-left">{fmt(sum((r) => r.cashDuba))}</td>
            <td className="py-2 text-left">{fmt(sum((r) => r.cashSafaga))}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 mt-1.5">
        الشاحنات مجموعةٌ — المستند الورقيّ يقسمها Trucks و Dianna و Mafis، والدفتر
        يحمل عموداً واحداً. والفرق عن المستند هو ميناء البسّام.
      </p>
    </div>
  );
}

function ChainRow({ label, vs, pick, muted, signed }: {
  label: string;
  vs: ModelResult['vessels'];
  pick: (v: ModelResult['vessels'][number]) => number;
  muted?: boolean;
  signed?: boolean;
}) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`py-1.5 pe-3 font-sans whitespace-nowrap ${muted ? 'text-gray-400' : 'text-gray-600'}`}>
        {label}
      </td>
      {vs.map((v) => {
        const n = pick(v);
        const cls = signed ? (n >= 0 ? 'text-emerald-700' : 'text-red-600') : muted ? 'text-gray-400' : 'text-gray-800';
        return <td key={v.key} className={`py-1.5 text-left ${cls}`}>{signed ? paren(n) : fmt(n)}</td>;
      })}
    </tr>
  );
}

/** بندٌ يتساوى فيه الشركاء — يُعرض مرّةً ممتدّاً على الأعمدة كلّها. */
function SharedRow({ label, value, cols, tone = 'deduction' }: {
  label: string; value: number; cols: number; tone?: 'deduction' | 'neutral';
}) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1.5 pe-3 font-sans text-gray-600 whitespace-nowrap">{label}</td>
      <td className={`py-1.5 text-left ${tone === 'neutral' ? 'text-gray-700' : 'text-red-600'}`} colSpan={cols}>
        {paren(value)}
      </td>
    </tr>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-gray-500">{label}</p>
      <p className={`font-bold font-mono mt-0.5 ${muted ? 'text-gray-500' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

/**
 * خليّةُ عرضٍ لرقمٍ يأتي من الشيت.
 *
 * لا حقلَ إدخالٍ هنا عمداً: الرقم يحسبه دفتر المركب، وحقلٌ قابل للكتابة يدعو
 * إلى تصحيحٍ في الشاشة يضيع عند أوّل إعادة جلب — ويبقى الدفتر على خطئه.
 */
function ReadCell({ value, dim }: { value: number; dim?: boolean }) {
  return (
    <td className={`py-1.5 pe-2 font-mono ${dim ? 'text-gray-300' : 'text-gray-800'}`}>
      {value ? fmt(value) : '—'}
    </td>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b pb-1">{title}</p>
      {children}
    </div>
  );
}

/**
 * حقلٌ نقديّ يحتفظ بنصّه أثناء الكتابة.
 *
 * تنسيقُ القيمة على كلّ ضغطة مفتاح يمنع كتابة الكسور — «١٢٣.» يصير «١٢٣.٠٠»
 * قبل أن تُكتب المنزلة. فيُحتفظ بالنصّ الخام ما دام الحقل مركَّزاً، ويُنسَّق
 * عند الخروج منه.
 */
function MoneyInput({ value, onChange, width = 'w-32', muted }: {
  value: number; onChange: (v: number) => void; width?: string; muted?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const shown = text !== null ? text : fmt(value);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={shown}
      onFocus={() => setText(value === 0 ? '' : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = parseFloat(raw.replace(/,/g, ''));
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setText(null)}
      className={`${width} border rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 ${
        muted ? 'text-gray-500 bg-gray-50' : ''
      }`}
    />
  );
}
