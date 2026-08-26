'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_AR[+mm - 1]} ${y}`; };
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ── عملة الحساب ────────────────────────────────────────────────────────────
// حساب وكيل البسّام حساب أحادي العملة مقوَّم بالدولار الأمريكي (USD) — بقرار الإدارة.
// كل المبالغ هنا (الرصيد الافتتاحي · السيولة · الإضافات اليدوية · البنكر · التحويلات)
// بالدولار، ولذلك لا يحمل Transfer حقل عملة ولا يجري أي تحويل عملات في هذا الكارت.
// مصدر «السيولة» هو عمود السيولة في شيت المركب، وهو بالدولار أيضاً — فالمعادلة متجانسة:
//   closing = opening + liq + additions − transfersOut − bunker      (كلها USD)
// لو تقرّر مستقبلاً إمساك الحساب بأكثر من عملة، فذلك يتطلب إضافة حقل عملة لكل حركة
// وترحيل البيانات القائمة — ولا يجوز الاكتفاء بتغيير التسميات.
export const ACCOUNT_CURRENCY = 'USD';

/** رحلةٌ وسَمَها الدفتر — رقمها وتاريخها يكفيان للعثور عليها في الدفتر. */
interface FlaggedVoyage { ref: string | number; date?: string }

interface Transfer { month: string; date: string; amount: string; note: string }
interface Account { opening0: string; add: Record<string, string>; bunker: Record<string, string>; transfers: Transfer[] }

const MONTHS_EN: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
// تحليل تحويلات ملصوقة من إكسيل (كل سطر: تاريخ + مبلغ + بيان)
function parsePastedTransfers(text: string): Transfer[] {
  const out: Transfer[] = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (!line) continue;
    const dm = line.match(/(\d{1,2})[-/ ]([A-Za-z]{3,}|\d{1,2})[-/ ](\d{2,4})/);
    let month = '', date = '';
    if (dm) {
      const d = dm[1].padStart(2, '0');
      let mo = /^\d+$/.test(dm[2]) ? dm[2].padStart(2, '0') : (MONTHS_EN[dm[2].slice(0, 3).toLowerCase()] || '');
      let y = dm[3]; if (y.length === 2) y = '20' + y;
      if (mo) { month = `${y}-${mo}`; date = `${y}-${mo}-${d}`; }
    }
    // المبلغ = الأرقام ذات العلامة العشرية أولاً، ثم فاصلة الآلاف، ثم الأكبر (لتجنّب أرقام المذكرات/الفواتير الصحيحة الضخمة)
    // نشيل التاريخ من السطر الأول عشان أرقامه (خصوصاً سنة 4 خانات) ماتتحسبش كمبلغ
    const amountSrc = dm ? line.replace(dm[0], ' ') : line;
    const tokens = amountSrc.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    const val = (t: string) => parseFloat(t.replace(/,/g, ''));
    const dec = tokens.filter((t) => /\.\d/.test(t)).map(val).filter((n) => n > 0);
    const com = tokens.filter((t) => t.includes(',')).map(val).filter((n) => n > 0);
    const all = tokens.map(val).filter((n) => n > 0);
    const big = all.filter((n) => n >= 1000);
    const amount = dec.length ? Math.max(...dec) : com.length ? Math.max(...com) : big.length ? Math.max(...big) : (all.length ? Math.max(...all) : 0);
    const noteM = line.match(/[؀-ۿ][؀-ۿ\s()\-.،0-9A-Za-z]*/);
    const note = noteM ? noteM[0].trim() : '';
    if (amount > 0) out.push({ month, date, amount: String(amount), note });
  }
  return out;
}

/**
 * الخطوات الثلاث — تُعرض تحت أيّ لافتة شكوى.
 *
 * والثالثة هي الزرّ نفسه: فبعد الحفظ يبقى الكارت على قراءته الأولى، وإعادة
 * الفتح تُصلحه لكنّ أحداً لا يعرف ذلك. فالزرّ يجعل الأثر فوريّاً ومرئيّاً.
 *
 * ومعرَّفٌ خارج الكارت عمداً: مكوّنٌ يُنشأ أثناء التصيير يُعاد تركيبه في كلّ
 * رسمة، فيومض ويفقد أيّ حالةٍ فيه.
 */
function Steps({ onReload, reloading }: { onReload: () => void; reloading: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-amber-900">١· اقفل الكارت ← ٢· «🔄 جلب وحفظ» في شريط الشاشة ← ٣·</span>
      <button type="button" onClick={onReload} disabled={reloading}
        className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-50">
        {reloading ? 'جارٍ…' : '🔄 اقرأ الرحلات هنا'}
      </button>
      <span className="text-amber-700">أو أدخل القيم يدوياً في «إضافات يدوية» تحت.</span>
    </div>
  );
}

interface BassamAccountCardProps {
  vesselKey?: string;   // مفتاح رحلات المركب في /api/vessel-profit (مصدر السيولة الشهرية)
  storageKey?: string;  // مفتاح تخزين بيانات الحساب اليدوية (مستقل لكل مركب)
  vesselLabel?: string; // اسم المركب للعرض في رسالة عدم وجود بيانات
}

export default function BassamAccountCard({ vesselKey = 'Alcudia', storageKey = 'BassamAccount', vesselLabel = 'الكوديا' }: BassamAccountCardProps = {}) {
  const [liqByMonth, setLiqByMonth] = useState<Record<string, number>>({});
  /*
   * الشهور التي فيها رحلةٌ وسَمَها الدفتر بـ«راجعها».
   *
   * هذا الكارت هو الذي ظهر فيه النقص أوّلاً: سيولة يناير ٢٠٢٦ لبيلاجوس
   * ١٬٠٧٠٬٩٠٦.٠٨ والصواب ١٬٢٣٨٬٤٥٩.٥٠ — والفارق رحلةٌ واحدةٌ سيولتها صفر.
   * فالرصيد التراكميّ يُبنى على شهرٍ ناقصٍ ويحمله إلى ما بعده.
   */
  const [flaggedMonths, setFlaggedMonths] = useState<Record<string, FlaggedVoyage[]>>({});
  // تشخيص مصدر السيولة: عدد الرحلات المحفوظة وكم منها فيه قيمة سيولة
  const [voyMeta, setVoyMeta] = useState<{ count: number; withLiq: number } | null>(null);
  const [acc, setAcc] = useState<Account>({ opening0: '', add: {}, bunker: {}, transfers: [] });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reloading, setReloading] = useState(false);
  /*
   * `loaded` يخصّ نداء الرحلات وحده. وبيانات الحساب المحفوظة تأتي من نداء ثانٍ
   * مستقلّ، فكانت «لا توجد تحويلات» تُعرض قبل أن يردّ — نفيٌ قبل أن يُسأل.
   */
  const [accLoaded, setAccLoaded] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showTransfers, setShowTransfers] = useState(true);
  const [pasteAddText, setPasteAddText] = useState('');
  const [showPasteAdd, setShowPasteAdd] = useState(false);
  const [pasteBunkText, setPasteBunkText] = useState('');
  const [showPasteBunk, setShowPasteBunk] = useState(false);

  /**
   * قراءة رحلات المركب — السيولة الشهريّة مجموع عمود `bassamLiq`.
   *
   * ── ولماذا دالّةٌ لا أثرٌ فقط ──
   * كان النداء داخل `useEffect` بلا مخرجٍ منه، فيقرأ مرّةً عند فتح الكارت ولا
   * يُعاد أبداً. ومن يفتح الكارت فيشكو، ثمّ يُغلقه ويقرأ الشيت ويحفظ، **يعود
   * فيجد الشكوى نفسها** — لأنّ الكارت يُعاد تركيبه فعلاً، لكن لا شيء في الشاشة
   * يقول له ذلك، فيظنّ الحفظ لم يُفلح. والزرّ يُنهي الظنّ.
   */
  const loadVoyages = useCallback(() => api.get(`/api/vessel-profit/${vesselKey}`)
    .then((res) => {
      const voyages = res.data?.voyages;
      if (Array.isArray(voyages)) {
        const m: Record<string, number> = {};
        const flags: Record<string, FlaggedVoyage[]> = {};
        let withLiq = 0;
        for (const v of voyages) {
          if (!v.month) continue;
          const liq = Number(v.bassamLiq) || 0;
          if (liq !== 0) withLiq++;
          m[v.month] = (m[v.month] || 0) + liq;
          if (v.broken) (flags[v.month] = flags[v.month] || []).push({ ref: v.ref, date: v.date });
        }
        setLiqByMonth(m);
        setFlaggedMonths(flags);
        // تشخيص: نفرّق بين «مفيش رحلات محفوظة» و«رحلات محفوظة بلا عمود سيولة»
        setVoyMeta({ count: voyages.length, withLiq });
      } else {
        setVoyMeta({ count: 0, withLiq: 0 });
      }
    })
    .catch(() => setVoyMeta(null))
    .finally(() => { setLoaded(true); setReloading(false); }), [vesselKey]);

  /*
   * المؤشّر يُضبط عند الضغط لا داخل `loadVoyages`.
   *
   * فالدالّة تُنادى أيضاً من أثرٍ عند فتح الكارت، وضبطُ حالةٍ **متزامناً** داخل
   * أثرٍ يُطلق رسمةً متتالية. فبقي جسمها بلا setState متزامن، ودخل المؤشّر هنا.
   */
  const reload = useCallback(() => { setReloading(true); loadVoyages(); }, [loadVoyages]);

  useEffect(() => {
    loadVoyages();
    // بيانات حساب البسّام المحفوظة (مفتاح مستقل لكل مركب)
    api.get(`/api/vessel-profit/${storageKey}`).then((res) => {
      const man = res.data?.manual;
      if (man && typeof man === 'object') setAcc({ opening0: man.opening0 || '', add: man.add || {}, bunker: man.bunker || {}, transfers: Array.isArray(man.transfers) ? man.transfers : [] });
    }).catch(() => {}).finally(() => setAccLoaded(true));
  }, [vesselKey, storageKey, loadVoyages]);

  // الشهور = اتحاد كل المصادر (سيولة + إضافات + بنكر + تحويلات) عشان أي قيمة مُدخلة تظهر وتأثّر في الرصيد ولا تتبلع بصمت
  const months = useMemo(() => {
    const s = new Set<string>(Object.keys(liqByMonth));
    for (const m of Object.keys(acc.add)) if (m) s.add(m);
    for (const m of Object.keys(acc.bunker)) if (m) s.add(m);
    for (const t of acc.transfers) if (t.month) s.add(t.month);
    return [...s].sort();
  }, [liqByMonth, acc]);

  useEffect(() => {
    if (months.length) { setFrom((f) => f || months[0]); setTo((t) => t || months[months.length - 1]); }
  }, [months]);

  const rows = useMemo(() => {
    let prevClosing = 0;
    return months.map((m, i) => {
      const opening = i === 0 ? (parseFloat(acc.opening0) || 0) : prevClosing;
      const liq = liqByMonth[m] || 0;
      const additions = parseFloat(acc.add[m] || '') || 0;
      const bunker = parseFloat(acc.bunker[m] || '') || 0;
      const transfersOut = acc.transfers.filter((t) => t.month === m).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const closing = opening + liq + additions - transfersOut - bunker;
      prevClosing = closing;
      return { m, opening, liq, additions, bunker, transfersOut, closing };
    });
  }, [months, liqByMonth, acc]);

  // تحويلات من غير شهر محدّد (أو شهر غير موجود) — تُخصم من الرصيد كي يبقى متسقاً
  const orphanTransfers = useMemo(() => acc.transfers.filter((t) => !months.includes(t.month)).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0), [acc.transfers, months]);
  // الكشف المعروض حسب الفترة المختارة (الحساب الكامل بيتعمل لكل الشهور عشان الترحيل يفضل صح)
  const displayedRows = useMemo(() => {
    if (!from || !to) return rows;
    const lo = from <= to ? from : to, hi = from <= to ? to : from;
    return rows.filter((r) => r.m >= lo && r.m <= hi);
  }, [rows, from, to]);

  const currentBalance = (rows.length ? rows[rows.length - 1].closing : (parseFloat(acc.opening0) || 0)) - orphanTransfers;
  const totalTransfers = acc.transfers.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  // إجماليات الفترة المعروضة
  const totals = useMemo(() => displayedRows.reduce((a, r) => ({
    liq: a.liq + r.liq, additions: a.additions + r.additions, bunker: a.bunker + r.bunker, transfersOut: a.transfersOut + r.transfersOut,
  }), { liq: 0, additions: 0, bunker: 0, transfersOut: 0 }), [displayedRows]);

  const setAdd = (m: string, v: string) => setAcc((a) => ({ ...a, add: { ...a.add, [m]: v } }));
  const setBunk = (m: string, v: string) => setAcc((a) => ({ ...a, bunker: { ...a.bunker, [m]: v } }));
  const addTransfer = () => setAcc((a) => ({ ...a, transfers: [...a.transfers, { month: months[months.length - 1] || '', date: '', amount: '', note: '' }] }));
  const setTransfer = (idx: number, patch: Partial<Transfer>) => setAcc((a) => ({ ...a, transfers: a.transfers.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  const removeTransfer = (idx: number) => setAcc((a) => ({ ...a, transfers: a.transfers.filter((_, i) => i !== idx) }));
  function importPasted() {
    const parsed = parsePastedTransfers(pasteText);
    if (!parsed.length) { alert('لم يتم العثور على تحويلات — تأكد إن كل سطر فيه تاريخ ومبلغ.'); return; }
    setAcc((a) => ({ ...a, transfers: [...a.transfers, ...parsed] }));
    setPasteText(''); setShowPaste(false);
  }
  // لصق إضافات يدوية — تجميع حسب الشهر وإضافتها للقيمة الحالية
  function importPastedAdditions() {
    const parsed = parsePastedTransfers(pasteAddText);
    if (!parsed.length) { alert('لم يتم العثور على إضافات — تأكد إن كل سطر فيه تاريخ ومبلغ.'); return; }
    const byMonth: Record<string, number> = {};
    for (const p of parsed) { if (p.month) byMonth[p.month] = (byMonth[p.month] || 0) + (parseFloat(p.amount) || 0); }
    const skipped = parsed.filter((p) => !p.month).length;
    setAcc((a) => {
      const add = { ...a.add };
      for (const [m, v] of Object.entries(byMonth)) add[m] = String((parseFloat(add[m] || '') || 0) + v);
      return { ...a, add };
    });
    setPasteAddText(''); setShowPasteAdd(false);
    if (skipped) alert(`تم التجاهل: ${skipped} سطر بدون تاريخ صالح.`);
  }
  // لصق بنكر — تجميع حسب الشهر وإضافته للقيمة الحالية (يُطرح من الحساب)
  function importPastedBunker() {
    const parsed = parsePastedTransfers(pasteBunkText);
    if (!parsed.length) { alert('لم يتم العثور على بيانات بنكر — تأكد إن كل سطر فيه تاريخ ومبلغ.'); return; }
    const byMonth: Record<string, number> = {};
    for (const p of parsed) { if (p.month) byMonth[p.month] = (byMonth[p.month] || 0) + (parseFloat(p.amount) || 0); }
    const skipped = parsed.filter((p) => !p.month).length;
    setAcc((a) => {
      const bunker = { ...a.bunker };
      for (const [m, v] of Object.entries(byMonth)) bunker[m] = String((parseFloat(bunker[m] || '') || 0) + v);
      return { ...a, bunker };
    });
    setPasteBunkText(''); setShowPasteBunk(false);
    if (skipped) alert(`تم التجاهل: ${skipped} سطر بدون تاريخ صالح.`);
  }

  async function save() {
    setSaving(true); setSavedMsg('');
    try {
      await api.put(`/api/vessel-profit/${storageKey}`, { manual: acc });
      setSavedMsg('تم الحفظ ✅'); setTimeout(() => setSavedMsg(''), 2500);
    } catch { setSavedMsg('فشل الحفظ'); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-sm text-gray-600 mb-1">رصيد افتتاحي (أول شهر) — USD</label>
          <input inputMode="decimal" value={acc.opening0} onChange={(e) => setAcc((a) => ({ ...a, opening0: e.target.value }))}
            placeholder="0" className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="mr-auto flex items-center gap-3">
          {savedMsg && <span className="text-sm text-emerald-600 font-medium">{savedMsg}</span>}
          <div className="text-right">
            <p className="text-xs text-gray-500">الرصيد الحالي عند البسّام (USD)</p>
            <p className="text-2xl font-bold text-indigo-700">{fmt(currentBalance)} <span className="text-sm font-semibold text-indigo-400">USD</span></p>
          </div>
          {/*
            * إعادة قراءة الرحلات متاحةٌ دائماً لا عند الشكوى فقط: الأرقام قد
            * تتغيّر والكارت مفتوح، ولا سبيل لتحديثها إلا بإغلاقه.
            *
            * و«حفظ» هنا يخصّ بيانات الحساب اليدويّة (الافتتاحيّ والإضافات
            * والبنكر والتحويلات) — لا الرحلات. فهما زرّان لا يتنافسان.
            */}
          <button type="button" onClick={reload} disabled={reloading}
            title="يُعيد قراءة رحلات المركب المحفوظة — السيولة الشهرية تتحدّث فوراً"
            className="border text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {reloading ? 'جارٍ…' : '🔄 الرحلات'}
          </button>
          <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : '💾 حفظ'}
          </button>
        </div>
      </div>

      {/*
        * تشخيص مصدر السيولة — لا تُعرض أصفار بصمت.
        *
        * ── ونصيحةٌ ماتت فاستُبدلت ──
        * كانت اللافتة تقول «الصق بيانات الشيت» — وهو طريقٌ لم يعد يُسلك: الرحلات
        * تُقرأ من شيت جوجل بزرّ «إعادة القراءة». فبقيت النصيحة تُرشد إلى بابٍ
        * مغلق، والمستخدم يبحث عن حقل لصقٍ لا وجود له.
        *
        * وكانت خطوتين — «إعادة القراءة» تملأ الشاشة و«حفظ» يُثبّت — فمن اكتفى
        * بالأولى رأى الرحلات أمامه وظنّها محفوظة. فدُمجتا في «جلب وحفظ»
        * بقرار المالك في ٢٦ أغسطس ٢٠٢٦، وزالت المصيدة من أصلها.
        */}
      {loaded && voyMeta && voyMeta.count === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <b>مفيش رحلات محفوظة لمركب {vesselLabel}.</b> السيولة الشهرية بتتحسب من رحلات المركب المحفوظة.
          <Steps onReload={reload} reloading={reloading} />
        </div>
      )}
      {loaded && voyMeta && voyMeta.count > 0 && voyMeta.withLiq === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <b>السيولة مش ظاهرة:</b> فيه {voyMeta.count} رحلة محفوظة لمركب {vesselLabel}، لكن مفيش ولا واحدة فيها قيمة سيولة.
          <span className="block mt-1 text-xs">
            غالباً الرحلات دي اتحفظت قبل ما المحلّل يشتقّ عمود السيولة — فلازم تتقرا وتتحفظ من جديد.
          </span>
          <Steps onReload={reload} reloading={reloading} />
        </div>
      )}

      {Object.keys(flaggedMonths).length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 text-red-800 text-sm rounded-lg px-4 py-3">
          <b>⚠️ الدفتر وسَمَ رحلاتٍ بـ«راجعها»</b> — وسيولة شهورها قد تكون ناقصة، والرصيد التراكميّ يحملها إلى ما بعدها.
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {Object.keys(flaggedMonths).sort().map((m) => (
              <li key={m}>
                <b>{monthLabel(m)}</b>{' — '}
                {flaggedMonths[m].map((v) => `#${v.ref}${v.date ? ' · ' + v.date : ''}`).join(' · ')}
                {(liqByMonth[m] || 0) === 0 && <b> · سيولة الشهر صفر</b>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">صحّح الصفّ في دفتر المركب ثمّ «🔄 جلب وحفظ» — أو أدخل الفارق يدويّاً في «إضافات يدوية».</p>
        </div>
      )}

      {/* الكشف الشهري */}
      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-gray-700">📒 كشف حساب وكيل البسّام (شهري) — <span className="text-indigo-700">{ACCOUNT_CURRENCY}</span></h3>
              <p className="text-[11px] text-gray-400 mt-0.5">جميع المبالغ في هذا الكشف مقوَّمة بالدولار الأمريكي — حساب أحادي العملة بلا أي تحويل.</p>
            </div>
            <button onClick={() => setShowPasteAdd((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50">📋 لصق إضافات</button>
            <button onClick={() => setShowPasteBunk((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50">⛽ لصق بنكر</button>
          </div>
          {months.length > 0 && (
            <div className="flex items-end gap-2 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">من</label>
                <select value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">إلى</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
        {showPasteAdd && (
          <div className="mb-3 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">الصق الإضافات من الإكسيل (كل سطر فيه تاريخ ومبلغ) — هتتجمّع على الشهر المناسب وتنضاف لقيمته الحالية:</p>
            <textarea value={pasteAddText} onChange={(e) => setPasteAddText(e.target.value)} rows={5}
              placeholder={'13-Jan-26\tبيان\t\t50,000.00'}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" dir="ltr" />
            <div className="flex gap-2 mt-2">
              <button onClick={importPastedAdditions} className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700">تحليل وإضافة</button>
              <button onClick={() => { setShowPasteAdd(false); setPasteAddText(''); }} className="text-sm px-4 py-1.5 rounded-lg border hover:bg-gray-100">إلغاء</button>
            </div>
          </div>
        )}
        {showPasteBunk && (
          <div className="mb-3 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">الصق بيانات البنكر من الإكسيل (كل سطر فيه تاريخ ومبلغ) — هتتجمّع على الشهر المناسب وتُطرح من الحساب:</p>
            <textarea value={pasteBunkText} onChange={(e) => setPasteBunkText(e.target.value)} rows={5}
              placeholder={'13-Jan-26\tبيان\t\t50,000.00'}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" dir="ltr" />
            <div className="flex gap-2 mt-2">
              <button onClick={importPastedBunker} className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700">تحليل وطرح</button>
              <button onClick={() => { setShowPasteBunk(false); setPasteBunkText(''); }} className="text-sm px-4 py-1.5 rounded-lg border hover:bg-gray-100">إلغاء</button>
            </div>
          </div>
        )}
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th scope="col" className="text-right py-2 px-2">الشهر</th>
              <th scope="col" className="text-right py-2 px-2">رصيد أول المدة (USD)</th>
              <th scope="col" className="text-right py-2 px-2">+ سيولة البسّام (USD)</th>
              <th scope="col" className="text-right py-2 px-2">+ إضافات يدوية (USD)</th>
              <th scope="col" className="text-right py-2 px-2">− بنكر (USD)</th>
              <th scope="col" className="text-right py-2 px-2">− تحويلات لك (USD)</th>
              <th scope="col" className="text-right py-2 px-2">= رصيد آخر المدة (USD)</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r) => (
              <tr key={r.m} className="border-t">
                <td className="py-1.5 px-2 font-medium">{monthLabel(r.m)}</td>
                <td className="py-1.5 px-2 text-gray-500">{fmt(r.opening)}</td>
                <td className="py-1.5 px-2 text-emerald-700">
                  {fmt(r.liq)}
                  {/*
                    * العلامة في السطر نفسه لا في لافتةٍ فوق الجدول.
                    * فمن يقرأ رقم شهرٍ بعينه يجب أن يرى الشكّ في موضع الرقم،
                    * لا أن يربط بين تحذيرٍ عامٍّ وسطرٍ لم يُسمَّ.
                    */}
                  {flaggedMonths[r.m] && (
                    <span title={`الدفتر وسَمَ: ${flaggedMonths[r.m].map((v) => `#${v.ref}${v.date ? ' · ' + v.date : ''}`).join(' · ')} — الرقم قد يكون ناقصاً`}
                      className="ms-1 cursor-help text-red-600">⚠️</span>
                  )}
                </td>
                <td className="py-1.5 px-2">
                  <input inputMode="decimal" value={acc.add[r.m] || ''} onChange={(e) => setAdd(r.m, e.target.value)}
                    placeholder="0" className="w-28 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </td>
                <td className="py-1.5 px-2">
                  <input inputMode="decimal" value={acc.bunker[r.m] || ''} onChange={(e) => setBunk(r.m, e.target.value)}
                    placeholder="0" className="w-28 border rounded-lg px-2 py-1 text-sm text-red-600 focus:outline-none focus:ring-1 focus:ring-red-400" />
                </td>
                <td className="py-1.5 px-2 text-red-600">{r.transfersOut ? fmt(r.transfersOut) : '—'}</td>
                <td className="py-1.5 px-2 font-bold text-indigo-800">{fmt(r.closing)}</td>
              </tr>
            ))}
            {!loaded && <tr><td colSpan={7} className="text-center py-6 text-gray-400">جارٍ التحميل…</td></tr>}
            {loaded && displayedRows.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gray-400">لا توجد شهور في الفترة</td></tr>}
          </tbody>
          {displayedRows.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 font-bold">
              <tr>
                <td className="py-2 px-2 text-gray-700">الإجمالي</td>
                <td className="py-2 px-2 text-gray-400">—</td>
                <td className="py-2 px-2 text-emerald-700">{fmt(totals.liq)}</td>
                <td className="py-2 px-2 text-gray-700">{fmt(totals.additions)}</td>
                <td className="py-2 px-2 text-red-600">{fmt(totals.bunker)}</td>
                <td className="py-2 px-2 text-red-600">{fmt(totals.transfersOut)}</td>
                <td className="py-2 px-2 text-gray-400">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* التحويلات */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowTransfers((v) => !v)} className="font-bold text-gray-700 flex items-center gap-2 hover:text-blue-700">
            <span className="text-gray-400">{showTransfers ? '▾' : '▸'}</span>
            💸 التحويلات المستلمة من البسّام <span className="text-xs text-gray-400 font-normal">(الإجمالي: {fmt(totalTransfers)} USD)</span>
          </button>
          {showTransfers && (
            <div className="flex gap-2">
              <button onClick={() => setShowPaste((v) => !v)} className="text-sm px-4 py-1.5 rounded-lg border hover:bg-gray-50">📋 لصق تحويلات</button>
              <button onClick={addTransfer} className="bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-700">➕ إضافة تحويل</button>
            </div>
          )}
        </div>
        {showTransfers && <>{showPaste && (
          <div className="mb-3 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">الصق الجدول من الإكسيل (كل سطر فيه التاريخ والمبلغ والبيان) — النظام هيقرأ التاريخ والمبلغ والشهر تلقائياً:</p>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              placeholder={'13-Jan-26\t20\tدفعة من حساب العبارة (ISBA)\t\t1,000,000.00'}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" dir="ltr" />
            <div className="flex gap-2 mt-2">
              <button onClick={importPasted} className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700">تحليل وإضافة</button>
              <button onClick={() => { setShowPaste(false); setPasteText(''); }} className="text-sm px-4 py-1.5 rounded-lg border hover:bg-gray-100">إلغاء</button>
            </div>
          </div>
        )}
        {orphanTransfers > 0 && <p className="text-xs text-red-500 mb-2">⚠️ في تحويلات من غير شهر محدّد ({fmt(orphanTransfers)}) — اتخصمت من الرصيد، بس حدّد شهرها عشان تظهر في الكشف الشهري صح.</p>}
        {!accLoaded ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل…</p>
        ) : acc.transfers.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد تحويلات — اضغط «إضافة تحويل».</p>
        ) : (
          <div className="space-y-2">
            {acc.transfers.map((t, idx) => (
              <div key={idx} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center border rounded-lg p-2">
                <select value={t.month} onChange={(e) => setTransfer(idx, { month: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">— الشهر —</option>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
                <input type="date" value={t.date} onChange={(e) => setTransfer(idx, { date: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
                <input inputMode="decimal" placeholder="المبلغ" value={t.amount} onChange={(e) => setTransfer(idx, { amount: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex items-center gap-2">
                  <input placeholder="ملاحظة" value={t.note} onChange={(e) => setTransfer(idx, { note: e.target.value })} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                  <button onClick={() => removeTransfer(idx)} className="text-red-400 hover:text-red-600 px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        </>}
      </div>
    </div>
  );
}
