'use client';
import { useMemo } from 'react';

/**
 * ── لوحة الأسطول — عرض «الغاطس» ──
 *
 * اللوحة الأصلية تعرض ثماني بطاقاتٍ بثمانية ألوان مشبعة و`emoji` أيقونات وتدرّجاً
 * بنفسجياً في الرأس. تعمل، لكنّ ثمانية أرقامٍ بوزنٍ واحد لا تُنتج هرماً: المدير
 * يمسحها كلّها ولا يعرف من أين يبدأ.
 *
 * وهذا العرض يبدأ بأطروحة — رقمٌ واحد كبير — ثم يُجيب السؤال التالي مباشرةً:
 * أيّ مركبٍ يحمل الأسطول وأيّه يجرّه؟
 *
 * ── التوقيع: مقياس الغاطس ──
 * لكل مركبٍ بدنٌ يرتفع فيه خطّ الماء بمقدار نصيبه من المؤشّر، وعلامةُ حمولةٍ
 * برتقالية — لون الإشارة في هوية الشركة — عند **متوسّط الأسطول**. فيُرى في لمحةٍ من يطفو فوق المتوسّط ومن يغطس
 * تحته — وهي مقارنةٌ لا مجرّد مقدار. وكل سفينةٍ في العالم تحمل هذه العلامة
 * مرسومةً على بدنها، فليست زخرفاً مستورداً.
 *
 * ── ما حُذف وله سبب ──
 * الـ`emoji` تختلف رسماً بين ويندوز وآيفون فتُضعف الهوية (وقاعدة المهارة صريحة:
 * لا emoji أيقونات). والتدرّج البنفسجي هو الافتراضي الذي يجعل اللوحة تشبه أي
 * داشبورد. والألوان كلّها من هوية الشركة: كحلي الشعار وأخضره، والبرتقالي يُصرَف في
 * موضعٍ واحد هو خطّ الحمولة.
 */

export interface VesselRow {
  vessel: string; voyages: number; net: number; avgNet: number;
  revenue: number; expenses: number; liquidity: number;
  trucks: number; vehicles: number; passengers: number;
  [k: string]: any;
}

export interface Metric { key: string; label: string; money: boolean; goodUp: boolean }

interface Props {
  perVessel: VesselRow[];
  totals: Record<string, number>;
  prevTotals: Record<string, number>;
  fleetMonthly: Record<string, any>[];
  monthsInRange: string[];
  monthLabel: (m: string) => string;
  metric: string;
  setMetric: (k: string) => void;
  metrics: Metric[];
  periodLabel: string;
}

/*
 * رموز الهوية — مستخرَجة من umeshipping.com والشعار، لا مخترَعة.
 *
 * `navy` و`green` هما لونا الشعار حرفياً (تعبئة الـSVG: rgb(0,40,58) وrgb(61,138,103)).
 * و`orange` لون الإشارة في الموقع — يُصرَف في موضعٍ واحد: خطّ الحمولة. و`brick`
 * لون التراجع، مأخوذٌ من لوحة الموقع أيضاً لا من أحمرٍ عامّ.
 */
const TOKENS = {
  navy: '#00283A',
  green: '#3D8A67',
  mint: '#6EB08B',
  orange: '#F08B1D',
  brick: '#C6613E',
  mist: '#D4DDE6',
  slate: '#80919B',
  deck: '#F5F8FA',
};

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
function abbr(n: number): string {
  const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${Math.round(a)}`;
}

/**
 * مقياس الغاطس لمركبٍ واحد.
 *
 * `share` نسبة قيمة المركب إلى أعلى قيمة في الأسطول — فارتفاع الماء نسبيٌّ لا
 * مطلق. و`avgShare` موضع خطّ الحمولة، أي متوسّط الأسطول على المقياس نفسه.
 */
function DraftGauge({ name, value, share, avgShare, money, isTop }: {
  name: string; value: number; share: number; avgShare: number; money: boolean; isTop: boolean;
}) {
  const H = 92;
  const water = Math.max(2, Math.min(H, share * H));
  const load = Math.max(1, Math.min(H - 1, avgShare * H));
  const above = share >= avgShare;
  return (
    <div className="flex flex-col items-center gap-2 min-w-[74px]">
      <svg viewBox="0 0 60 104" className="w-[60px] h-[104px]" role="img"
        aria-label={`${name}: ${money ? '$' : ''}${fmt(value)} — ${above ? 'فوق متوسّط الأسطول' : 'تحت متوسّط الأسطول'}`}>
        {/* بدن السفينة: مقطعٌ عرضي مبسّط */}
        <defs>
          <clipPath id={`hull-${name.replace(/\W/g, '')}`}>
            <path d="M8 4 h44 v72 q0 20 -22 24 q-22 -4 -22 -24 z" />
          </clipPath>
        </defs>
        <path d="M8 4 h44 v72 q0 20 -22 24 q-22 -4 -22 -24 z"
          fill="#fff" stroke={TOKENS.navy} strokeWidth="1.6" />
        {/* الماء */}
        <g clipPath={`url(#hull-${name.replace(/\W/g, '')})`}>
          <rect x="0" y={104 - water} width="60" height={water}
            fill={above ? TOKENS.navy : TOKENS.mint} opacity={above ? 0.92 : 0.75} />
        </g>
        {/* خطّ الحمولة — متوسّط الأسطول */}
        <line x1="2" y1={104 - load} x2="58" y2={104 - load}
          stroke={TOKENS.orange} strokeWidth="2" />
        <circle cx="30" cy={104 - load} r="4.5" fill="none" stroke={TOKENS.orange} strokeWidth="2" />
        <line x1="25.5" y1={104 - load} x2="34.5" y2={104 - load} stroke={TOKENS.orange} strokeWidth="2" />
        {isTop && <rect x="8" y="4" width="44" height="96" fill="none" stroke={TOKENS.orange} strokeWidth="0" />}
      </svg>
      <div className="text-center leading-tight">
        <div className="text-[10.5px] tracking-wide" style={{ fontFamily: 'var(--font-brand)', fontWeight: 800, letterSpacing: '-0.02em', color: TOKENS.navy }}>
          {name}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: above ? TOKENS.navy : TOKENS.slate, fontWeight: above ? 700 : 400 }}>
          {money ? abbr(value) : fmt(value)}
        </div>
      </div>
    </div>
  );
}

export default function FleetInstrument({
  perVessel, totals, prevTotals, fleetMonthly, monthsInRange, monthLabel,
  metric, setMetric, metrics, periodLabel,
}: Props) {
  const active = metrics.find((m) => m.key === metric) || metrics[0];
  const cur = Number(totals[metric]) || 0;
  const prev = Number(prevTotals[metric]) || 0;
  const delta = prev ? ((cur - prev) / Math.abs(prev)) * 100 : 0;
  const good = active.goodUp ? delta >= 0 : delta <= 0;

  const ranked = useMemo(
    () => [...perVessel].sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0)),
    [perVessel, metric]);
  const max = Math.max(1, ...ranked.map((v) => Math.abs(Number(v[metric]) || 0)));
  const avg = ranked.length ? ranked.reduce((s, v) => s + (Number(v[metric]) || 0), 0) / ranked.length : 0;

  /*
   * الاتجاه: خطٌّ واحد لإجمالي الأسطول.
   *
   * قاعدة الرسوم صريحة: أكثر من ستّ سلاسل ضجيجٌ بصري، ولا تُميَّز السلاسل باللون
   * وحده. واللوحة الأصلية ترسم ثمانية مراكب بثمانية ألوان — تجاوزٌ للحدّ وتمييزٌ
   * باللون. فيُرسم الإجمالي خطّاً واحداً، والمقارنة بين المراكب مكانها المقاييس
   * أعلاه حيث لكلٍّ اسمه مكتوباً لا لونه.
   */
  const trend = useMemo(() => fleetMonthly.map((r) => Number(r[metric]) || 0), [fleetMonthly, metric]);
  const tMax = Math.max(1, ...trend.map(Math.abs));
  const W = 720, TH = 132, pad = 8;
  const pts = trend.map((v, i) => {
    const x = pad + (i * (W - pad * 2)) / Math.max(1, trend.length - 1);
    const y = TH - (Math.abs(v) / tMax) * (TH - 16) - 8;
    return [x, y] as [number, number];
  });
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = pts.length ? `${path} L${pts[pts.length - 1][0].toFixed(1)},${TH} L${pts[0][0].toFixed(1)},${TH} Z` : '';

  const secondary = metrics.filter((m) => ['voyages', 'trucks', 'vehicles', 'passengers'].includes(m.key));

  return (
    <div style={{ fontFamily: 'var(--font-plex)', color: TOKENS.navy }}>
      {/* ── شريط الاسم ── */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap px-4 py-2.5 rounded-t-lg"
        style={{ background: TOKENS.navy, color: '#fff' }}>
        {/* العربي بـPlex واللاتيني بخطّ الهوية — Inter Tight لا يحمل حروفاً عربية */}
        <div className="text-[15px] flex items-baseline gap-2">
          <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '19px' }}>UME</span>
          <span style={{ fontFamily: 'var(--font-plex)', fontWeight: 500, letterSpacing: '0.08em', fontSize: '12px', color: TOKENS.mint }}>
            الأسطول
          </span>
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: TOKENS.mint }}>{periodLabel}</div>
      </div>

      <div className="border border-t-0 rounded-b-lg px-4 pb-4" style={{ borderColor: TOKENS.mist, background: TOKENS.deck }}>

        {/* ── الأطروحة: رقمٌ واحد ── */}
        <div className="pt-5 pb-4 flex items-end gap-4 flex-wrap">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase" style={{ color: TOKENS.slate }}>
              {active.label}{active.money ? ' · USD' : ''}
            </div>
            <div className="tabular-nums leading-none mt-1"
              style={{ fontFamily: 'var(--font-brand)', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '44px', color: TOKENS.navy }}>
              {active.money ? abbr(cur) : fmt(cur)}
            </div>
          </div>
          {prev !== 0 && (
            <div className="text-[12px] tabular-nums pb-1.5" style={{ color: good ? TOKENS.green : TOKENS.brick }}>
              {delta >= 0 ? '▲' : '▼'} {fmt1(Math.abs(delta))}%
              <span className="text-[10px] ms-1" style={{ color: TOKENS.slate }}>عن الفترة السابقة</span>
            </div>
          )}
          {/* اختيار المؤشّر — نصٌّ لا أيقونات */}
          <div className="ms-auto flex flex-wrap gap-1 pb-1">
            {metrics.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                aria-pressed={m.key === metric}
                className="text-[11px] px-2.5 py-1 rounded-sm border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2"
                style={{
                  borderColor: m.key === metric ? TOKENS.navy : '#CBD5DC',
                  background: m.key === metric ? TOKENS.navy : 'transparent',
                  color: m.key === metric ? '#fff' : TOKENS.slate,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── التوقيع: مقاييس الغاطس ── */}
        <div className="border-t pt-4" style={{ borderColor: TOKENS.mist }}>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[12px] tracking-[0.16em]" style={{ fontFamily: 'var(--font-plex)', fontWeight: 700, letterSpacing: '0.06em' }}>
              مقياس الغاطس
            </h3>
            <span className="text-[10.5px]" style={{ color: TOKENS.slate }}>
              <span style={{ color: TOKENS.orange }}>━━</span> خطّ الحمولة = متوسّط الأسطول ({active.money ? abbr(avg) : fmt(avg)})
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-4 justify-start">
            {ranked.map((v, i) => (
              <DraftGauge key={v.vessel} name={v.vessel} value={Number(v[metric]) || 0}
                share={Math.abs(Number(v[metric]) || 0) / max}
                avgShare={Math.abs(avg) / max} money={active.money} isTop={i === 0} />
            ))}
          </div>
        </div>

        {/* ── شريط التشغيل ── */}
        <div className="border-t mt-4 pt-3 flex flex-wrap gap-x-8 gap-y-2" style={{ borderColor: TOKENS.mist }}>
          {secondary.map((m) => (
            <div key={m.key}>
              <span className="text-[10px] tracking-[0.14em] uppercase" style={{ color: TOKENS.slate }}>{m.label}</span>
              <div className="text-[17px] tabular-nums leading-tight">{fmt(Number(totals[m.key]) || 0)}</div>
            </div>
          ))}
        </div>

        {/* ── الاتجاه ── */}
        {trend.length > 1 && (
          <div className="border-t mt-4 pt-3" style={{ borderColor: TOKENS.mist }}>
            <h3 className="text-[12px] tracking-[0.16em] mb-2" style={{ fontFamily: 'var(--font-plex)', fontWeight: 700, letterSpacing: '0.06em' }}>
              الاتجاه الشهري — إجمالي الأسطول
            </h3>
            <svg viewBox={`0 0 ${W} ${TH + 18}`} className="w-full" role="img"
              aria-label={`اتجاه ${active.label} عبر ${trend.length} أشهر`}>
              <path d={area} fill={TOKENS.mint} opacity="0.28" />
              <path d={path} fill="none" stroke={TOKENS.navy} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={TOKENS.navy} />)}
              {monthsInRange.map((m, i) => (
                i % Math.ceil(monthsInRange.length / 8) === 0 || i === monthsInRange.length - 1 ? (
                  <text key={m} x={pts[i]?.[0] || 0} y={TH + 13} textAnchor="middle"
                    fontSize="9" fill={TOKENS.slate}>{monthLabel(m)}</text>
                ) : null
              ))}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
