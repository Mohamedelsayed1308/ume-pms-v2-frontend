'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { LineVesselConfig } from './LineProfitReport';
import {
  validateMontePackage, packageTotals, itemTotals, HIDDEN_VOYAGES,
  type MontePackage, type MonteCheck,
} from '@/lib/reports/montePackage';

/*
 * كارت مونتي — خطّ جدّة/سواكن، من حزمة رحلاتها لا من الشيت (انظر `lib/reports/montePackage.ts`).
 *
 * الحزمة تُحفظ في `vessel_profit_data.manual.package` للمفتاح `MonteJS`، والحفظ يستبدل
 * `manual` كاملاً — فيُرفع ما سواها كما قُرئ، ولا حفظ قبل أن يُقرأ.
 * والرفع للأدمن وحده: الحزمة تولّدها جلسة مونتي، والملفّ لا يُعدَّل يدويّاً.
 * ومنذ ٣٠ أكتوبر ٢٠٢٦ تدفعها الجلسة آليّاً (`push_pms.py` ← `api/vessel-profit-ingest/monte`)،
 * والزرّ باقٍ بديلاً — وللرجوع المقصود إلى حزمةٍ أقدم، فالدفع الآليّ يرفض الأقدم.
 */

const fmt = (n: number | null | undefined, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const apiMessage = (e: unknown): string | undefined =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

const REV_ROWS: [keyof MontePackage['voyages'][number], string, string][] = [
  ['rev_pax_out', 'ركّاب — ذهاب', 'Passengers — out'], ['rev_pax_ret', 'ركّاب — عودة', 'Passengers — return'],
  ['rev_cargo_out', 'بضائع — ذهاب', 'Cargo — out'], ['rev_cargo_ret', 'بضائع — عودة', 'Cargo — return'],
  ['rev_do', 'أذون التسليم (تقديريّة)', 'Delivery orders (est.)'], ['rev_other', 'إيراد آخر', 'Other revenue'],
];
const COST_ROWS: [keyof MontePackage['voyages'][number], string, string][] = [
  ['cost_fuel', 'الوقود — متوسّط مرجَّح', 'Fuel — weighted average'], ['cost_water', 'مياه', 'Water'],
  ['cost_port_jed', 'ميناء جدّة ومصاريفها', 'Jeddah port & charges'], ['cost_comm_jed', 'عمولات وكيل جدّة', 'Jeddah agent commissions'],
  ['cost_port_suk', 'ميناء سواكن', 'Suakin port'], ['cost_comm_suk30', 'عمولة وكيل سواكن 30%', 'Suakin agent 30%'],
  ['cost_comm_suk', 'عمولات سواكن الأخرى', 'Other Suakin commissions'], ['cost_agent_adj', 'تسوية جدّة على كشف الوكيل', 'Jeddah settlement vs agent SOA'],
  ['cost_gifts', 'هدايا الركّاب', 'Passenger gifts'], ['cost_catering', 'الكاترينج (صفرٌ حتّى الفواتير)', 'Catering (zero until invoiced)'],
];

export default function MonteLineCard({ config: cfg }: { config: LineVesselConfig }) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const name = en ? cfg.nameEn : cfg.nameAr;
  const isAdmin = typeof window !== 'undefined' && getUser()?.role === 'admin';

  const [manual, setManual] = useState<Record<string, unknown>>({});
  const [manualLoaded, setManualLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [pending, setPending] = useState<{ check: MonteCheck; raw: unknown; file: string } | null>(null);
  const [open, setOpen] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/api/vessel-profit/${cfg.key}`);
      setManual((r.data?.manual as Record<string, unknown>) || {});
      setUpdatedAt(r.data?.updated_at || '');
      setManualLoaded(true);
    } catch (e) {
      setError(apiMessage(e) || T('تعذّر تحميل حزمة مونتي', 'Could not load the Monte package'));
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- تحميلٌ عند تغيّر المركب، كبقيّة الكروت
  useEffect(() => { load(); }, [cfg.key]);

  // المحفوظ يُتحقَّق منه عند العرض أيضاً — حزمةٌ قديمة أو مكسورة لا تُعرض أرقامها
  const check = useMemo(() => (manual.package ? validateMontePackage(manual.package) : null), [manual.package]);
  const pkg = check?.pkg || null;
  const tot = useMemo(() => (pkg ? packageTotals(pkg) : null), [pkg]);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const raw = JSON.parse(await f.text());
      setPending({ check: validateMontePackage(raw), raw, file: f.name });
    } catch {
      setPending({ check: { ok: false, errors: [T('الملفّ ليس JSON صالحاً', 'Not valid JSON')], warnings: [], pkg: null, hidden: [] }, raw: null, file: f.name });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const savePending = async () => {
    if (!pending?.check.ok) return;
    if (!manualLoaded) { setError(T('لم تُقرأ القيم المحفوظة بعد — أعد التحميل قبل الحفظ', 'Saved values not loaded — reload before saving')); return; }
    setSaving(true);
    try {
      // تُحفظ الحزمة كما وصلت — والحجب والتحقّق عند العرض
      const next = { ...manual, package: pending.raw, packageFile: pending.file, packageSavedAt: new Date().toISOString(), packageSource: 'upload' };
      const r = await api.put(`/api/vessel-profit/${cfg.key}`, { manual: next });
      setManual(next); setUpdatedAt(r.data?.updated_at || ''); setPending(null);
      setSavedMsg(T('✓ حُفظت الحزمة', '✓ Package saved'));
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (e) {
      setError(apiMessage(e) || T('تعذّر الحفظ', 'Save failed'));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">{T('جارٍ تحميل حزمة مونتي…', 'Loading the Monte package…')}</div>;

  const cap = pkg?.vessel;
  // فوق السعة يُعلَّم أحمر: إمّا السعة في الحزمة أقلّ من الحقيقة، وإمّا العدّ يخلط أنواعاً
  const occ = (n: number | null, c: number | undefined) => (n == null || !c ? '' : <span className={n > c ? 'text-red-600 font-semibold' : ''}>{pct(n / c)}</span>);
  // الشاحنة والمقطورة كلتاهما وحدة مقطورة على السطح — والحزمة لا تذكر غير ذلك
  const units = (l: { trucks: number | null; trailers: number | null }) => (l.trucks == null && l.trailers == null ? null : (l.trucks || 0) + (l.trailers || 0));
  const overCars = (pkg?.legs || []).filter((l) => l.cars != null && cap?.cap_cars && l.cars > cap.cap_cars);

  return (
    <div className="space-y-4" dir={en ? 'ltr' : 'rtl'}>
      {/* ── الرأس ── */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <p className="text-lg font-bold text-gray-800">{T(`ربحيّة ${name} — خطّ جدّة/سواكن`, `${name} profitability — Jeddah/Suakin line`)}</p>
          <p className="text-xs text-gray-500">
            {T('مركبٌ مملوك', 'Owned vessel')}{' · '}{T('من حزمة رحلات مونتي', 'From the Monte voyage package')}
            {pkg ? ` · ${T('وُلِّدت', 'generated')} ${pkg.generated_at.replace('T', ' ').slice(0, 16)}` : ''}
            {updatedAt ? ` · ${T('حُفظت', 'saved')} ${new Date(updatedAt).toLocaleString(en ? 'en-GB' : 'ar-EG')}` : ''}
            {/* الدفع الآليّ من جلسة مونتي يكتب monte-session (انظر monte-ingest في الباك)، والزرّ upload */}
            {pkg && manual.packageSource === 'monte-session' ? ` · ${T('وصلت آليّاً من جلسة مونتي', 'pushed from the Monte session')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 ms-auto">
          {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700">{T('📥 رفع monte_pms.json', '📥 Upload monte_pms.json')}</button>
            </>
          )}
          <button onClick={load} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">{T('🔄 تحديث', '🔄 Refresh')}</button>
          <button onClick={() => window.print()} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">{T('🖨️ طباعة', '🖨️ Print')}</button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* ── معاينة الرفع ── */}
      {pending && (
        <div className={`rounded-xl border p-4 text-sm space-y-2 print:hidden ${pending.check.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className="font-semibold">{pending.file} — {pending.check.ok ? T('الحزمة متّسقة', 'Package is consistent') : T('الحزمة مرفوضة', 'Package rejected')}</p>
          {pending.check.ok && (() => {
            const t = packageTotals(pending.check.pkg!);
            return <p className="tabular-nums">{t.n} {T('رحلة', 'voyages')} · {T('صافي الرحلات', 'voyage net')} {fmt(t.net, 2)} · {T('بعد الثابتة', 'after fixed')} {fmt(t.netAfterFixed, 2)} · {T('من أوّل الكارت', 'since card start')} {fmt(t.sinceStart, 2)}</p>;
          })()}
          {pending.check.errors.map((e, i) => <p key={i} className="text-red-700">⛔ {e}</p>)}
          {pending.check.warnings.map((w, i) => <p key={i} className="text-amber-700">⚠️ {w}</p>)}
          {pending.check.hidden.length > 0 && <p className="text-gray-600">{T(`محجوبة بقرار المالك: رحلة ${pending.check.hidden.join('، ')}`, `Hidden by owner decision: voyage ${pending.check.hidden.join(', ')}`)}</p>}
          <div className="flex gap-2">
            {pending.check.ok && <button disabled={saving} onClick={savePending} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50">{saving ? T('جارٍ الحفظ…', 'Saving…') : T('حفظ الحزمة', 'Save package')}</button>}
            <button onClick={() => setPending(null)} className="bg-white border px-4 py-1.5 rounded-lg">{T('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      )}

      {!manual.package && !error && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
          {T('لم تُرفع حزمة مونتي بعد. يرفعها الأدمن من زرّ «رفع monte_pms.json».', 'No Monte package yet. An admin uploads it with “Upload monte_pms.json”.')}
        </div>
      )}
      {check && !check.ok && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm space-y-1">
          <p className="font-semibold">⛔ {T('الحزمة المحفوظة لا تطابق نفسها — أرقامها لا تُعرض', 'The saved package is inconsistent — figures hidden')}</p>
          {check.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {pkg && tot && (
        <>
          {/* ── تنبيهات ── */}
          {check!.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-sm space-y-0.5">
              {check!.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
            </div>
          )}

          {/* ── المؤشّرات ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={`${tot.netAfterFixed >= 0 ? 'bg-emerald-600' : 'bg-red-600'} text-white rounded-xl p-4`}>
              <p className="text-xs opacity-80">{T('الصافي بعد التكاليف الثابتة', 'Net after fixed costs')}</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">{fmt(tot.netAfterFixed)}</p>
              <p className="text-xs opacity-80 mt-1">{T('أشهر الخطّ', 'Line months')} · {T('هامش', 'margin')} {tot.rev ? pct(tot.netAfterFixed / tot.rev) : '—'}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('صافي الرحلات', 'Voyage net')}</p><p className="text-xl font-bold tabular-nums">{fmt(tot.net)}</p><p className="text-xs text-gray-400">{tot.n} {T('رحلة · قبل الثابتة', 'voyages · before fixed')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('الإيراد', 'Revenue')}</p><p className="text-xl font-bold tabular-nums">{fmt(tot.rev)}</p><p className="text-xs text-gray-400">{T('الإيجار خارج التكاليف', 'Hire excluded from costs')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-gray-500">{T('الصافي للرحلة', 'Net / voyage')}</p><p className="text-xl font-bold tabular-nums">{fmt(tot.perVoyage.net)}</p><p className="text-xs text-gray-400">{T('قبل الثابتة', 'Before fixed')}</p></div>
            <div className={`rounded-xl shadow p-4 ${tot.sinceStart >= 0 ? 'bg-white' : 'bg-red-50'}`}><p className="text-xs text-gray-500">{T(`من أوّل ${pkg.monthly[0]?.month || ''}`, `Since ${pkg.monthly[0]?.month || ''}`)}</p><p className="text-xl font-bold tabular-nums">{fmt(tot.sinceStart, 2)}</p><p className="text-xs text-gray-400">{T('شاملاً أشهر ما قبل الخطّ', 'Incl. pre-line months')}</p></div>
          </div>

          {/* ── قائمة الدخل ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-800 mb-2">{T('قائمة الدخل — رحلات الخطّ', 'Income statement — line voyages')}</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('الإيراد', 'Revenue')}</td></tr>
                  {REV_ROWS.map(([k, ar, e]) => {
                    const v = pkg.voyages.reduce((s, x) => s + (x[k] as number), 0);
                    return v ? <tr key={k}><td className="py-1 px-3 ps-6">{T(ar, e)}</td><td className="py-1 px-3 text-left tabular-nums">{fmt(v)}</td><td className="py-1 px-3 text-left text-xs text-gray-400">{pct(v / tot.rev)}</td></tr> : null;
                  })}
                  <tr className="font-bold border-t"><td className="py-1.5 px-3">{T('إجمالي الإيراد', 'Total revenue')}</td><td className="py-1.5 px-3 text-left tabular-nums">{fmt(tot.rev)}</td><td /></tr>
                  <tr className="bg-gray-50 font-semibold"><td className="py-1.5 px-3" colSpan={3}>{T('تكاليف الرحلات', 'Voyage costs')}</td></tr>
                  {COST_ROWS.map(([k, ar, e]) => {
                    const v = pkg.voyages.reduce((s, x) => s + (x[k] as number), 0);
                    return <tr key={k}><td className="py-1 px-3 ps-6">{T(ar, e)}</td><td className={`py-1 px-3 text-left tabular-nums ${v < 0 ? 'text-emerald-700' : 'text-red-700'}`}>{!v ? '—' : v > 0 ? `(${fmt(v)})` : `+${fmt(-v)}`}</td><td className="py-1 px-3 text-left text-xs text-gray-400">{v ? pct(v / tot.rev) : ''}</td></tr>;
                  })}
                  <tr className="font-bold border-t"><td className="py-1.5 px-3">{T('إجمالي التكاليف', 'Total costs')}</td><td className="py-1.5 px-3 text-left tabular-nums text-red-700">({fmt(tot.cost)})</td><td /></tr>
                  <tr className="font-bold"><td className="py-1.5 px-3">{T('صافي الرحلات', 'Voyage net')}</td><td className="py-1.5 px-3 text-left tabular-nums">{fmt(tot.net)}</td><td className="py-1.5 px-3 text-left text-xs text-gray-400">{pct(tot.net / tot.rev)}</td></tr>
                  <tr><td className="py-1 px-3 ps-6">{T('التكاليف الثابتة لأشهر الخطّ', 'Fixed costs, line months')}</td><td className="py-1 px-3 text-left tabular-nums text-red-700">({fmt(-tot.fixedOnLine)})</td><td /></tr>
                  <tr className="font-bold border-t"><td className="py-1.5 px-3">{T('الصافي بعد الثابتة', 'Net after fixed')}</td><td className="py-1.5 px-3 text-left tabular-nums">{fmt(tot.netAfterFixed)}</td><td /></tr>
                  <tr className="text-gray-400"><td className="py-1 px-3 ps-6">{T('للعلم: الإيجار اليوميّ في ملفّات الربح — خارج الحساب', 'For info: daily hire in the profit files — excluded')}</td><td className="py-1 px-3 text-left tabular-nums">{fmt(pkg.voyages.reduce((s, v) => s + (v.hire_in_file || 0), 0))}</td><td /></tr>
                </tbody>
              </table>
            </div>

            {/* ── المقارنة ── */}
            <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-2">{T('المقارنة على الخطّ — للرحلة', 'Line comparison — per voyage')}</h3>
              {(() => {
                const cols = [
                  { vessel: name, ownership: pkg.vessel.ownership, voyages: tot.n, rev_per_voyage: tot.perVoyage.rev, comm_per_voyage: tot.perVoyage.comm, opex_per_voyage: tot.perVoyage.opex, net_per_voyage: tot.perVoyage.net, pax_ret_per_voyage: tot.perVoyage.paxRet, cap_pax: cap?.cap_pax ?? null, cap_trailers: cap?.cap_trailer_units ?? null, self: true },
                  ...pkg.line_compare.map((c) => ({ ...c, self: false })),
                ];
                const nets = cols.map((c) => c.net_per_voyage).filter((x): x is number => x != null);
                const best = nets.length >= 2 ? Math.max(...nets) : null; // «الأفضل» لا يُعلَّم إلّا مع رقمين
                const rows: [string, (c: typeof cols[number]) => number | null, number?][] = [
                  [T('الرحلات', 'Voyages'), (c) => c.voyages],
                  [T('الإيراد', 'Revenue'), (c) => c.rev_per_voyage],
                  [T('العمولات', 'Commissions'), (c) => c.comm_per_voyage],
                  [T('مصاريف التشغيل', 'Operating costs'), (c) => c.opex_per_voyage],
                  [T('الصافي', 'Net'), (c) => c.net_per_voyage],
                  [T('ركّاب العودة', 'Return passengers'), (c) => c.pax_ret_per_voyage, 1],
                  [T('سعة الركّاب', 'Passenger capacity'), (c) => c.cap_pax],
                  [T('سعة المقطورات', 'Trailer capacity'), (c) => c.cap_trailers],
                ];
                return (
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500 text-xs"><th className="text-start py-1 px-2" />{cols.map((c) => <th key={c.vessel} className={`py-1 px-2 text-left ${c.self ? 'text-gray-900' : ''}`}>{c.vessel}<div className="font-normal text-gray-400">{c.ownership}</div></th>)}</tr></thead>
                    <tbody>
                      {rows.map(([l, f, d]) => (
                        <tr key={l} className="border-t">
                          <td className="py-1 px-2">{l}</td>
                          {cols.map((c) => { const v = f(c); return <td key={c.vessel} className={`py-1 px-2 text-left tabular-nums ${l === T('الصافي', 'Net') && v != null && v === best ? 'font-bold text-emerald-700' : ''}`}>{fmt(v, d)}</td>; })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              <p className="text-xs text-gray-400 mt-2">{T('صافي الرحلة قبل التكاليف الثابتة في المراكب الثلاثة. عمّان بلا أرقامٍ ماليّة في الحزمة بعد.', 'Voyage net before fixed costs for all three. Amman has no financials in the package yet.')}</p>
            </div>
          </div>

          {/* ── الرحلات ── */}
          <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-800 mb-2">{T('الرحلات', 'Voyages')} <span className="text-xs text-gray-400 font-normal">{T('اضغط الرحلة لقائمة دخلها', 'Click a voyage for its income statement')}</span></h3>
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  {[T('الرحلة', 'Voyage'), T('الخروج', 'Departure'), T('أيّام', 'Days'), T('ركّاب ذهاب', 'Pax out'), T('ركّاب عودة', 'Pax ret.'), T('الإيراد', 'Revenue'), T('التكاليف', 'Costs'), T('الصافي', 'Net'), T('الهامش', 'Margin'), T('وقود ط', 'Fuel t'), T('سعر الطنّ', '$/t'), T('كشف الوكيل', 'Agent SOA')].map((h) => <th key={h} className="py-1.5 px-2 text-start">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tot.voyages.map(({ v, rev, cost, net }) => {
                  const isOpen = open === v.voyage;
                  const items = (side: string, kind: string) => v.items.filter((i) => i.side === side && i.kind === kind);
                  return (
                    <Fragment key={v.voyage}>
                      <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(isOpen ? '' : v.voyage)}>
                        <td className="py-1.5 px-2 font-semibold">{isOpen ? '▾' : '▸'} {v.voyage}</td>
                        <td className="py-1.5 px-2">{v.dep}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(v.days, 1)}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(v.pax_out)}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(v.pax_ret)}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(rev)}</td>
                        <td className="py-1.5 px-2 tabular-nums text-red-700">({fmt(cost)})</td>
                        <td className={`py-1.5 px-2 tabular-nums font-semibold ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(net, 2)}</td>
                        <td className="py-1.5 px-2 tabular-nums text-gray-500">{rev ? pct(net / rev) : '—'}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(v.fuel_t)}</td>
                        <td className="py-1.5 px-2 tabular-nums">{fmt(v.fuel_price, 2)}</td>
                        <td className="py-1.5 px-2 text-xs">{v.agent_status}{v.delivery_order_est ? <span className="text-amber-600"> · {T('أذون تقديريّة', 'DO est.')}</span> : null}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td colSpan={12} className="p-3">
                            <div className="grid md:grid-cols-2 gap-4 whitespace-normal">
                              {(['jeddah', 'suakin'] as const).map((side) => (
                                <table key={side} className="w-full text-xs self-start">
                                  <tbody>
                                    <tr className="font-semibold"><td className="py-1" colSpan={2}>{side === 'jeddah' ? T('جانب جدّة', 'Jeddah side') : T('جانب سواكن', 'Suakin side')}</td></tr>
                                    {[...items(side, 'rev'), ...items(side, 'cost')].map((i, k) => (
                                      <tr key={k} className={i.excluded ? 'text-gray-400 line-through' : ''} title={i.excluded ? T('خارج الحساب — قرار المالك', 'Excluded — owner decision') : undefined}>
                                        <td className="py-0.5 pe-2">{i.label}{i.excluded ? ` (${T('للعلم', 'info')})` : ''}</td>
                                        <td className={`py-0.5 text-left tabular-nums ${i.usd < 0 ? 'text-red-700' : ''}`}>{fmt(i.usd, 2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {T('صافي البنود', 'Items net')} <b className="tabular-nums">{fmt(itemTotals(v).net, 2)}</b> · {T('وقود ملفّ الربح', 'Fuel in profit file')} {fmt(v.fuel_in_file, 2)} {T('مقابل المرجَّح', 'vs weighted')} {fmt(v.cost_fuel, 2)} · {v.file}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="font-bold border-t-2">
                  <td className="py-1.5 px-2" colSpan={3}>{T('المجموع', 'Total')}</td>
                  <td className="py-1.5 px-2 tabular-nums">{fmt(pkg.voyages.reduce((s, v) => s + v.pax_out, 0))}</td>
                  <td className="py-1.5 px-2 tabular-nums">{fmt(pkg.voyages.reduce((s, v) => s + v.pax_ret, 0))}</td>
                  <td className="py-1.5 px-2 tabular-nums">{fmt(tot.rev)}</td>
                  <td className="py-1.5 px-2 tabular-nums text-red-700">({fmt(tot.cost)})</td>
                  <td className="py-1.5 px-2 tabular-nums">{fmt(tot.net, 2)}</td>
                  <td className="py-1.5 px-2 tabular-nums text-gray-500">{pct(tot.net / tot.rev)}</td>
                  <td className="py-1.5 px-2 tabular-nums">{fmt(pkg.voyages.reduce((s, v) => s + v.fuel_t, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            {check!.hidden.length > 0 && <p className="text-xs text-gray-400 mt-2">{T(`رحلة ${check!.hidden.join('، ')} محجوبة بقرار المالك.`, `Voyage ${check!.hidden.join(', ')} hidden by owner decision.`)}</p>}
            {!check!.hidden.length && <p className="text-xs text-gray-400 mt-2">{T(`رحلة ${HIDDEN_VOYAGES.join('، ')} لا تُعرض بقرار المالك.`, `Voyage ${HIDDEN_VOYAGES.join(', ')} is not shown by owner decision.`)}</p>}
          </div>

          {/* ── شهراً بشهر ── */}
          <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-800 mb-2">{T('شهراً بشهر', 'Month by month')} <span className="text-xs text-gray-400 font-normal">{T('من أوّل الكارت — التكاليف بالسالب', 'From card start — costs negative')}</span></h3>
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  {[T('الشهر', 'Month'), T('الحالة', 'Status'), T('رحلات', 'Trips'), T('الإيراد', 'Revenue'), T('تكاليف الرحلات', 'Voyage costs'), T('صافي الرحلات', 'Voyage net'), T('وقود الانتقال', 'Positioning fuel'), T('التأمين', 'Insurance'), T('مرتّبات $', 'Salaries $'), T('مرتّبات €→$', 'Salaries €→$'), T('مصاريف الطاقم', 'Crew misc.'), T('نقديّة القبطان', 'Cash to master'), T('الثابتة', 'Fixed'), T('الصافي', 'Net'), T('التراكميّ', 'Cumulative')].map((h) => <th key={h} className="py-1.5 px-2 text-start">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pkg.monthly.map((m, i) => (
                  <tr key={m.month} className="border-b">
                    <td className="py-1.5 px-2 font-semibold">{m.month}</td>
                    <td className="py-1.5 px-2 text-xs">{m.line}{m.salaries_pending ? <span className="text-amber-600"> · {T('المرتّبات معلَّقة', 'salaries pending')}</span> : null}</td>
                    <td className="py-1.5 px-2 tabular-nums">{m.trips || ''}</td>
                    {[m.rev, m.vcost, m.vnet, m.pos, m.ins, m.sal_usd, m.sal_eur, m.crew_misc, m.ctm, m.fixed].map((x, k) => (
                      <td key={k} className={`py-1.5 px-2 tabular-nums ${x != null && x < 0 ? 'text-red-700' : ''}`}>{x ? fmt(x) : '—'}</td>
                    ))}
                    <td className={`py-1.5 px-2 tabular-nums font-semibold ${m.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(m.net, 2)}</td>
                    <td className={`py-1.5 px-2 tabular-nums ${tot.cumulative[i].cum >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(tot.cumulative[i].cum, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">{T('قبل الخطّ مرتّباتٌ وتأمينٌ بلا إيراد، ووقود الانتقال ليماسول→جدّة في سبتمبر.', 'Before the line: salaries and insurance with no revenue; Limassol→Jeddah positioning fuel in September.')}</p>
          </div>

          {/* ── الإشغال ── */}
          <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-800 mb-2">{T('الإشغال', 'Occupancy')} <span className="text-xs text-gray-400 font-normal">{T(`السعة: ${fmt(cap?.cap_pax)} راكب · ${fmt(cap?.cap_trailer_units)} مقطورة · ${fmt(cap?.cap_cars)} سيارة`, `Capacity: ${fmt(cap?.cap_pax)} pax · ${fmt(cap?.cap_trailer_units)} trailers · ${fmt(cap?.cap_cars)} cars`)}</span></h3>
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  {[T('الرِّجل', 'Leg'), T('المسار', 'Route'), T('التاريخ', 'Date'), T('ركّاب يدفعون', 'Paying pax'), T('كلّ الركّاب', 'All pax'), T('إشغال الركّاب', 'Pax load'), T('شاحنات', 'Trucks'), T('مقطورات', 'Trailers'), T('إشغال السطح (شاحنات + مقطورات)', 'Deck load (trucks + trailers)'), T('سيارات', 'Cars'), T('إشغال السيارات', 'Car load'), T('معدّات', 'Equipment')].map((h) => <th key={h} className="py-1.5 px-2 text-start">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pkg.legs.map((l) => (
                  <tr key={l.leg} className="border-b" title={l.source}>
                    <td className="py-1.5 px-2 font-semibold">{l.leg}</td>
                    <td className="py-1.5 px-2">{l.route}</td>
                    <td className="py-1.5 px-2">{l.date}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.pax_paying)}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.pax_total)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-gray-500">{occ(l.pax_total, cap?.cap_pax)}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.trucks)}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.trailers)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-gray-500">{occ(units(l), cap?.cap_trailer_units)}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.cars)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-gray-500">{occ(l.cars, cap?.cap_cars)}</td>
                    <td className="py-1.5 px-2 tabular-nums">{fmt(l.equipment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">{T('مرّر المؤشّر على الرِّجل لمصدر أرقامها. «—» تعني أنّ المصدر لا يذكرها.', 'Hover a leg for its source. “—” means the source does not state it.')}</p>
            {overCars.length > 0 && (
              <p className="text-xs text-red-600 mt-1">⚠️ {T(`السيارات فوق سعة الحزمة (${fmt(cap?.cap_cars)}) في ${overCars.length} رِجل، أعلاها ${fmt(Math.max(...overCars.map((l) => l.cars || 0)))} — السعة أو العدّ يحتاج مراجعة.`, `Cars exceed the package capacity (${fmt(cap?.cap_cars)}) on ${overCars.length} leg(s), max ${fmt(Math.max(...overCars.map((l) => l.cars || 0)))} — capacity or count needs review.`)}</p>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* ── مخزون الوقود ── */}
            <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-2">{T('مخزون الوقود — المتوسّط المرجَّح', 'Fuel stock — weighted average')}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 text-xs border-b">{[T('الحدث', 'Event'), T('التاريخ', 'Date'), T('قبله ط', 'Before t'), T('الكمّيّة ط', 'Qty t'), T('السعر', 'Price'), T('المرجَّح', 'WAC')].map((h) => <th key={h} className="py-1 px-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {pkg.fuel_stock.map((f, i) => (
                    <tr key={i} className="border-b align-top">
                      <td className="py-1 px-2 min-w-[14rem]">{f.event}<div className="text-xs text-gray-400">{f.note}</div></td>
                      <td className="py-1 px-2 whitespace-nowrap">{f.date}</td>
                      <td className="py-1 px-2 tabular-nums">{fmt(f.before_t, 1)}</td>
                      <td className="py-1 px-2 tabular-nums">{fmt(f.qty_t, 3)}</td>
                      <td className="py-1 px-2 tabular-nums">{fmt(f.price, 2)}</td>
                      <td className="py-1 px-2 tabular-nums font-semibold">{fmt(f.wac, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── كشف وكيل جدّة ── */}
            <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
              <h3 className="font-bold text-gray-800 mb-2">{T('كشف وكيل جدّة', 'Jeddah agent statement')}</h3>
              <table className="w-full text-sm whitespace-nowrap">
                <thead><tr className="text-gray-500 text-xs border-b">{[T('الرحلة', 'Voyage'), T('ذهاب', 'Out'), T('عودة', 'Return'), T('نقديّة القبطان', 'Cash to master'), T('تقديريّ', 'Estimated'), T('ربح جانب جدّة', 'Jeddah-side profit'), T('أذون خارج الكشف', 'DOs outside SOA')].map((h) => <th key={h} className="py-1 px-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {pkg.agent_voyages.map((a) => (
                    <tr key={a.voyage} className="border-b">
                      <td className="py-1 px-2 font-semibold">{a.voyage}</td>
                      {[a.soa_out, a.soa_ret, a.cash_to_master, a.estimated, a.profit_jeddah_side, a.do_outside].map((x, k) => <td key={k} className="py-1 px-2 tabular-nums">{x ? fmt(x) : '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-sm mt-3">
                <tbody>
                  {pkg.agent_summary.map((s, i) => (
                    <tr key={i} className={i === pkg.agent_summary.length - 1 ? 'font-bold border-t' : ''}>
                      <td className="py-1 px-2">{s.item}</td><td className="py-1 px-2 text-left tabular-nums">{fmt(s.usd, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── القواعد والمعلَّقات ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-800 mb-2">{T('قواعد المالك', 'Owner rules')}</h3>
              <ul className="list-disc ps-5 text-sm space-y-1 text-gray-700">{pkg.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-bold text-gray-800 mb-2">{T('ما ينتظر', 'Pending')}</h3>
              <ul className="list-disc ps-5 text-sm space-y-1 text-amber-800">{pkg.pending.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

