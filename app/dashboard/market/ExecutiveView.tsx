'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, Icon, Button, Spinner, EmptyState, cx } from '@/components/ui';

const METRICS = [
  { key: 'trips', label: 'الرحلات', icon: '🚢' },
  { key: 'trucks', label: 'الشاحنات', icon: '🚛' },
  { key: 'cars', label: 'السيارات', icon: '🚗' },
  { key: 'passengers', label: 'الركاب', icon: '🧍' },
] as const;
type MetricKey = typeof METRICS[number]['key'];

const AGENCY_COLORS: Record<string, string> = { BADAWY: '#1e3a8a', ETIHAD: '#059669', PAN_MARINE: '#d97706', TRIMOV: '#7c3aed', AL_QAHERA: '#db2777' };
const PALETTE = ['#64748b', '#0891b2', '#65a30d', '#c026d3', '#ea580c'];
const colorOf = (k: string, i = 0) => AGENCY_COLORS[k] || PALETTE[i % PALETTE.length];

const UP = '#10b981', DOWN = '#ef4444', TOTAL = '#1e3a8a';
const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('en-US');
const f1 = (n: any) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const signed = (n: any) => `${Number(n) >= 0 ? '+' : '−'}${fmt(Math.abs(Number(n) || 0))}`;

const QUAD_LABEL: Record<string, { ar: string; tone: string }> = {
  leader: { ar: 'قائد', tone: 'bg-emerald-50 text-emerald-700' },
  riser: { ar: 'صاعد', tone: 'bg-blue-50 text-blue-700' },
  laggard: { ar: 'متراجع', tone: 'bg-amber-50 text-amber-700' },
  marginal: { ar: 'هامشي', tone: 'bg-gray-100 text-gray-600' },
};

export default function ExecutiveView({ from, to, selAgencies, ship }: { from: string; to: string; selAgencies: string[]; ship: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<MetricKey>('trips');
  // الشرح الذكي: مخزّن لكل مؤشر على حدة
  const [narr, setNarr] = useState<Record<string, any>>({});
  const [narrBusy, setNarrBusy] = useState(false);
  const [narrErr, setNarrErr] = useState('');

  useEffect(() => {
    setLoading(true); setError(''); setNarr({}); setNarrErr('');
    const p = new URLSearchParams({ from, to });
    if (selAgencies.length) p.set('agencies', selAgencies.join(','));
    if (ship) p.set('ship', ship);
    api.get(`/api/market/executive?${p.toString()}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.status === 403 || e?.response?.status === 401 ? 'no-access' : 'error'))
      .finally(() => setLoading(false));
  }, [from, to, ship, selAgencies.join(',')]);

  async function explain() {
    setNarrBusy(true); setNarrErr('');
    try {
      const r = await api.post('/api/market/executive/narrate', { from, to, metric, agencies: selAgencies.length ? selAgencies : undefined, ship: ship || undefined });
      setNarr((p) => ({ ...p, [metric]: r.data.narration }));
    } catch (e: any) { setNarrErr(e?.response?.data?.message || 'تعذّر إنشاء الشرح'); }
    finally { setNarrBusy(false); }
  }

  function print() {
    const root = document.getElementById('exec-print-root');
    if (!root) return;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>العرض التنفيذي — تحليل السوق الملاحي</title>
      <style>
        @page{size:A4 portrait;margin:12mm}
        *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
        body{font-family:'Segoe UI',Tahoma,'Cairo',Arial,sans-serif;color:#1f2937;direction:rtl;margin:0;line-height:1.6}
        .no-print{display:none!important}
        h1{font-size:19px;margin:0 0 2px;color:#1e3a8a}
        h3{font-size:14px;margin:0 0 6px;color:#1e3a8a}
        .sub{color:#6b7280;font-size:11px;margin-bottom:10px}
        .card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;page-break-inside:avoid}
        svg{width:100%;height:auto}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #e5e7eb;padding:4px 6px;text-align:right}th{background:#f8fafc}
        .foot{margin-top:10px;border-top:1px solid #e5e7eb;padding-top:6px;font-size:10px;color:#6b7280}
      </style></head><body>
      <h1>العرض التنفيذي — تحليل السوق الملاحي (ضبا / سفاجا)</h1>
      <div class="sub">${data?.period?.current?.label || ''} مقابل ${data?.period?.reference?.label || ''} · المؤشر: ${METRICS.find((m) => m.key === metric)?.label}</div>
      ${root.innerHTML}
      <div class="foot">جميع الأرقام محسوبة من بيانات النظام. مقام الحصة السوقية دائماً إجمالي السوق. مؤشرات الربحية والعملاء والسعة غير متاحة.</div>
      </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error === 'no-access') return <Card className="p-10"><EmptyState icon="shield" title="لا تملك صلاحية الوصول" description="اطلب شاشة «تحليل السوق الملاحي»." /></Card>;
  if (error) return <Card className="p-10 text-center"><p className="text-red-500 text-sm">تعذّر تحميل العرض التنفيذي</p></Card>;
  if (!data?.hasData) return <Card className="p-10"><EmptyState icon="chart" title="لا توجد بيانات للفترة المختارة" description="اختر فترة أخرى أو استورد البيانات أولاً." /></Card>;

  const m = data.metrics[metric];
  const mLabel = METRICS.find((x) => x.key === metric)!.label;
  const g = data.marketGrowth[metric];
  const n = narr[metric];
  const shownKeys = selAgencies.length ? data.agencies.filter((a: any) => selAgencies.includes(a.key) || a.key === data.focus).map((a: any) => a.key) : data.agencies.map((a: any) => a.key);

  return (
    <div className="space-y-4">
      {/* شريط التحكم */}
      <Card className="p-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {METRICS.map((x) => (
              <button key={x.key} onClick={() => setMetric(x.key)} className={cx('px-3 py-1.5 text-sm', metric === x.key ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>{x.icon} {x.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={explain} disabled={narrBusy}>{narrBusy ? 'جارٍ الشرح…' : (n ? 'إعادة الشرح الذكي' : '✨ اشرح بالذكاء الاصطناعي')}</Button>
            <Button variant="outline" size="sm" onClick={print}><Icon name="file" size={14} /> طباعة العرض</Button>
          </div>
        </div>
        {narrErr && <p className="text-red-500 text-xs mt-2">{narrErr}</p>}
        {!data.hasReference && <p className="text-amber-600 text-xs mt-2">لا تتوفّر بيانات الفترة المرجعية (نفس الأشهر من العام السابق) — الشلال والمصفوفة سيعرضان النشاط الحالي فقط.</p>}
      </Card>

      <div id="exec-print-root">
        {/* العنوان + الأرقام الكبيرة */}
        <Card className="p-5 card">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-navy-900 text-lg">صورة السوق — {mLabel}</h3>
              <p className="text-xs text-gray-500">{data.period.current.label} مقابل {data.period.reference.label}</p>
            </div>
            <div className="flex items-baseline gap-4">
              <div className="text-center"><p className="text-2xl font-extrabold tabular-nums" style={{ color: TOTAL }}>{fmt(data.market.current[metric])}</p><p className="text-[11px] text-gray-500">الفترة الحالية</p></div>
              <div className="text-center"><p className="text-lg font-bold tabular-nums text-gray-400">{fmt(data.market.previous[metric])}</p><p className="text-[11px] text-gray-400">المرجعية</p></div>
              <div className="text-center">
                <p className={cx('text-xl font-extrabold tabular-nums', (g.abs || 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>{g.pct == null ? g.label : `${g.pct >= 0 ? '▲' : '▼'} ${f1(Math.abs(g.pct))}%`}</p>
                <p className="text-[11px] text-gray-500">{signed(g.abs)} {mLabel}</p>
              </div>
            </div>
          </div>
          {n?.headline && <p className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-800 font-medium">{n.headline}</p>}
        </Card>

        {/* 1) شلال مصادر النمو */}
        <Card className="p-5 card">
          <h3 className="font-bold text-gray-800 mb-1">من أين جاء التغيّر؟ — شلال مصادر النمو ({mLabel})</h3>
          <p className="text-[11px] text-gray-400 mb-2">من إجمالي الفترة المرجعية، بإضافة أو خصم مساهمة كل وكيل، وصولاً لإجمالي الفترة الحالية.</p>
          <Waterfall w={m.waterfall} />
          <Caption text={n?.waterfall_caption} />
        </Card>

        {/* 2) مصفوفة النمو والحصة */}
        <Card className="p-5 card">
          <h3 className="font-bold text-gray-800 mb-1">من ينمو ومن يكسب حصة؟ — مصفوفة النمو والحصة ({mLabel})</h3>
          <p className="text-[11px] text-gray-400 mb-2">المحور الأفقي: الحصة السوقية · الرأسي: نسبة النمو · حجم الدائرة: حجم النشاط. الخط الأفقي = نمو السوق: من فوقه يكسب حصة، ومن تحته يفقدها.</p>
          <Quadrant q={m.quadrant} shownKeys={shownKeys} />
          <QuadrantTable q={m.quadrant} shownKeys={shownKeys} />
          <Caption text={n?.quadrant_caption} />
        </Card>

        {/* 3) تطوّر الحصص */}
        <Card className="p-5 card">
          <h3 className="font-bold text-gray-800 mb-1">كيف تحرّكت الحصص؟ — تطوّر الحصص شهرياً ({mLabel})</h3>
          <p className="text-[11px] text-gray-400 mb-2">كل شهر يساوي 100% من السوق؛ سماكة الشريحة = حصة الوكيل في ذلك الشهر.</p>
          <ShareArea evo={m.shareEvolution} agencies={data.agencies} />
          <Caption text={n?.share_caption} />
        </Card>

        {/* نقاط النقاش */}
        {n?.talking_points?.length > 0 && (
          <Card className="p-5 card">
            <h3 className="font-bold text-gray-800 mb-2">نقاط للنقاش</h3>
            <ul className="list-disc pe-5 text-sm text-gray-700 space-y-1">{n.talking_points.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
          </Card>
        )}

        <Card className="p-3 card">
          <p className="text-[11px] text-gray-400">الربحية · العملاء · استغلال السعة: البيانات غير متاحة ولم تُقدَّر.</p>
        </Card>
      </div>
    </div>
  );
}

function Caption({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
      <span className="text-indigo-500 text-sm">✨</span>
      <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}

/* ══ 1) شلال مصادر النمو ══ */
function Waterfall({ w }: { w: any }) {
  const W = 780, H = 340, PL = 56, PR = 16, PT = 26, PB = 74;
  const iw = W - PL - PR, ih = H - PT - PB;

  const bars = useMemo(() => {
    const out: any[] = [];
    out.push({ label: w.startLabel, short: 'المرجعية', base: 0, top: w.start, type: 'total', value: w.start });
    let run = w.start;
    for (const s of w.steps) {
      const base = s.delta >= 0 ? run : run + s.delta;
      const top = s.delta >= 0 ? run + s.delta : run;
      run += s.delta;
      out.push({ label: s.name, short: s.name, base, top, type: s.delta >= 0 ? 'up' : 'down', value: s.delta, isFocus: s.isFocus });
    }
    out.push({ label: w.endLabel, short: 'الحالية', base: 0, top: w.end, type: 'total', value: w.end });
    return out;
  }, [w]);

  const maxV = Math.max(...bars.map((b) => b.top), 1);
  const minV = Math.min(0, ...bars.map((b) => b.base));
  const y = (v: number) => PT + ih - ((v - minV) / (maxV - minV || 1)) * ih;
  const slot = iw / bars.length;
  const bw = Math.min(64, slot * 0.6);
  const cx0 = (i: number) => PL + slot * i + slot / 2;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }}>
        {[0, 0.5, 1].map((t) => <line key={t} x1={PL} x2={W - PR} y1={PT + ih - t * ih} y2={PT + ih - t * ih} stroke="#eef2f7" />)}
        <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
        {bars.map((b, i) => {
          const top = y(b.top), bot = y(b.base);
          const h = Math.max(2, bot - top);
          const fill = b.type === 'total' ? TOTAL : b.type === 'up' ? UP : DOWN;
          const next = bars[i + 1];
          return (
            <g key={i}>
              {next && <line x1={cx0(i) + bw / 2} x2={cx0(i + 1) - bw / 2} y1={b.type === 'total' && i === 0 ? y(b.top) : y(b.type === 'up' ? b.top : b.base)} y2={b.type === 'total' && i === 0 ? y(b.top) : y(b.type === 'up' ? b.top : b.base)} stroke="#cbd5e1" strokeDasharray="3 3" />}
              <rect x={cx0(i) - bw / 2} y={top} width={bw} height={h} rx={2} fill={fill} opacity={b.isFocus ? 1 : 0.88} />
              {b.isFocus && <rect x={cx0(i) - bw / 2} y={top} width={bw} height={h} rx={2} fill="none" stroke="#111827" strokeWidth={1.5} />}
              <text x={cx0(i)} y={top - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={b.type === 'total' ? TOTAL : b.type === 'up' ? '#047857' : '#b91c1c'}>
                {b.type === 'total' ? fmt(b.value) : signed(b.value)}
              </text>
              <text x={cx0(i)} y={H - PB + 16} textAnchor="middle" fontSize="10" fill="#475569" transform={`rotate(-32 ${cx0(i)} ${H - PB + 16})`}>{b.short}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: TOTAL }} /> إجمالي السوق</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: UP }} /> أضاف للسوق</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: DOWN }} /> خصم من السوق</span>
        {w.balanced && <span className="text-emerald-600">✓ مجموع المساهمات يطابق صافي التغيّر ({signed(w.netChange)})</span>}
      </div>
    </div>
  );
}

/* ══ 2) مصفوفة النمو والحصة ══ */
function Quadrant({ q, shownKeys }: { q: any; shownKeys: string[] }) {
  const W = 760, H = 400, PL = 60, PR = 24, PT = 20, PB = 46;
  const iw = W - PL - PR, ih = H - PT - PB;
  const all = q.agencies.filter((a: any) => shownKeys.includes(a.key));
  const plotted = all.filter((a: any) => a.growthPct != null);
  const newOnes = all.filter((a: any) => a.growthPct == null);

  const maxShare = Math.max(...all.map((a: any) => a.sharePct), 10) * 1.2;
  const gs = [...plotted.map((a: any) => a.growthPct as number), q.marketGrowthPct ?? 0, 0];
  const gMax = Math.max(...gs) + 12, gMin = Math.min(...gs) - 12;
  const x = (v: number) => PL + (v / maxShare) * iw;
  const y = (v: number) => PT + ih - ((v - gMin) / (gMax - gMin || 1)) * ih;
  const maxVal = Math.max(...all.map((a: any) => a.value), 1);
  const r = (v: number) => 8 + Math.sqrt(v / maxVal) * 20;

  const xLine = x(q.avgSharePct), yLine = y(q.marketGrowthPct ?? 0);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }}>
        {/* خلفيات الأرباع */}
        <rect x={xLine} y={PT} width={Math.max(0, W - PR - xLine)} height={Math.max(0, yLine - PT)} fill="#ecfdf5" />
        <rect x={PL} y={PT} width={Math.max(0, xLine - PL)} height={Math.max(0, yLine - PT)} fill="#eff6ff" />
        <rect x={xLine} y={yLine} width={Math.max(0, W - PR - xLine)} height={Math.max(0, PT + ih - yLine)} fill="#fffbeb" />
        <rect x={PL} y={yLine} width={Math.max(0, xLine - PL)} height={Math.max(0, PT + ih - yLine)} fill="#f8fafc" />

        <text x={W - PR - 6} y={PT + 14} textAnchor="end" fontSize="10" fill="#047857">قائد — حصة كبيرة ونمو أسرع</text>
        <text x={PL + 6} y={PT + 14} fontSize="10" fill="#1d4ed8">صاعد — حصة صغيرة ونمو أسرع</text>
        <text x={W - PR - 6} y={PT + ih - 6} textAnchor="end" fontSize="10" fill="#b45309">متراجع — حصة كبيرة ونمو أبطأ</text>
        <text x={PL + 6} y={PT + ih - 6} fontSize="10" fill="#94a3b8">هامشي</text>

        {/* محاور */}
        <line x1={PL} x2={W - PR} y1={yLine} y2={yLine} stroke="#94a3b8" strokeDasharray="5 4" />
        <line x1={xLine} x2={xLine} y1={PT} y2={PT + ih} stroke="#94a3b8" strokeDasharray="5 4" />
        <text x={W - PR} y={yLine - 5} textAnchor="end" fontSize="10" fill="#475569">نمو السوق {q.marketGrowthPct == null ? '—' : `${f1(q.marketGrowthPct)}%`}</text>
        <line x1={PL} x2={PL} y1={PT} y2={PT + ih} stroke="#cbd5e1" />
        <line x1={PL} x2={W - PR} y1={PT + ih} y2={PT + ih} stroke="#cbd5e1" />
        <text x={PL - 8} y={y(0)} textAnchor="end" fontSize="9" fill="#94a3b8">0%</text>
        <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="10.5" fill="#64748b">الحصة السوقية %</text>

        {/* فقاعات */}
        {plotted.map((a: any, i: number) => {
          const px = x(a.sharePct), py = y(a.growthPct), rad = r(a.value);
          return (
            <g key={a.key}>
              <circle cx={px} cy={py} r={rad} fill={colorOf(a.key, i)} opacity={0.72} stroke={a.isFocus ? '#111827' : 'white'} strokeWidth={a.isFocus ? 2.5 : 1.5} />
              <text x={px} y={py + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="white">{f1(a.sharePct)}%</text>
              <text x={px} y={py - rad - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#334155">{a.name}</text>
            </g>
          );
        })}
      </svg>
      {newOnes.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-1">خارج الرسم (بلا أساس للمقارنة — نشاط جديد): {newOnes.map((a: any) => `${a.name} (${f1(a.sharePct)}%)`).join('، ')}</p>
      )}
    </div>
  );
}

function QuadrantTable({ q, shownKeys }: { q: any; shownKeys: string[] }) {
  const rows = q.agencies.filter((a: any) => shownKeys.includes(a.key)).sort((a: any, b: any) => b.sharePct - a.sharePct);
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs min-w-[480px]">
        <thead><tr className="text-gray-500 border-b"><th scope="col" className="text-right py-1.5">الوكيل</th><th scope="col" className="text-center">الموضع</th><th scope="col" className="text-center">الحصة</th><th scope="col" className="text-center">النمو</th><th scope="col" className="text-center">تغيّر الحصة</th></tr></thead>
        <tbody>
          {rows.map((a: any, i: number) => (
            <tr key={a.key} className={cx('border-b border-gray-50', a.isFocus && 'bg-navy-50/40')}>
              <td className="py-1.5 font-medium text-gray-700"><span className="inline-block w-2 h-2 rounded-full me-1.5" style={{ background: colorOf(a.key, i) }} />{a.name}{a.isFocus && ' ★'}</td>
              <td className="text-center"><span className={cx('px-2 py-0.5 rounded-full text-[10px] font-semibold', QUAD_LABEL[a.quadrant]?.tone)}>{QUAD_LABEL[a.quadrant]?.ar}</span></td>
              <td className="text-center tabular-nums">{f1(a.sharePct)}%</td>
              <td className={cx('text-center font-semibold', a.growthPct == null ? 'text-gray-400' : a.growthPct >= 0 ? 'text-emerald-600' : 'text-red-500')}>{a.growthPct == null ? a.growthLabel : `${a.growthPct >= 0 ? '+' : ''}${f1(a.growthPct)}%`}</td>
              <td className={cx('text-center font-semibold', a.shareChangePoints >= 0 ? 'text-emerald-600' : 'text-red-500')}>{a.shareChangePoints >= 0 ? '+' : ''}{f1(a.shareChangePoints)} نقطة</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══ 3) تطوّر الحصص (مساحات متراكمة 100%) ══ */
function ShareArea({ evo, agencies }: { evo: any[]; agencies: any[] }) {
  const W = 780, H = 320, PL = 44, PR = 90, PT = 14, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const n = evo.length;
  if (!n) return <p className="text-sm text-gray-400 py-6 text-center">لا توجد أشهر لعرضها</p>;
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (pct: number) => PT + ih - (pct / 100) * ih;

  // ترتيب ثابت + تراكم من الأسفل
  const keys = agencies.map((a: any) => a.key);
  const cum: number[][] = evo.map(() => []);
  evo.forEach((month, mi) => {
    let acc = 0;
    keys.forEach((k) => { acc += month.byAgency[k]?.sharePct || 0; cum[mi].push(acc); });
  });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }}>
        {[0, 25, 50, 75, 100].map((t) => <g key={t}>
          <line x1={PL} x2={PL + iw} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
          <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{t}%</text>
        </g>)}
        {keys.map((k, ki) => {
          const upper = evo.map((_, mi) => `${x(mi)},${y(cum[mi][ki])}`);
          const lower = evo.map((_, mi) => `${x(mi)},${y(ki === 0 ? 0 : cum[mi][ki - 1])}`).reverse();
          const last = cum[n - 1][ki], prevLast = ki === 0 ? 0 : cum[n - 1][ki - 1];
          const mid = (last + prevLast) / 2;
          const slice = last - prevLast;
          return (
            <g key={k}>
              <polygon points={[...upper, ...lower].join(' ')} fill={colorOf(k, ki)} opacity={0.85} />
              {slice > 6 && <text x={PL + iw + 8} y={y(mid) + 3} fontSize="10" fill="#334155">{agencies[ki].name} {f1(slice)}%</text>}
            </g>
          );
        })}
        {evo.map((mo, i) => <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="9.5" fill="#64748b">{mo.label}</text>)}
      </svg>
      <div className="flex gap-3 flex-wrap text-[11px] text-gray-500 mt-1">
        {keys.map((k, i) => <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: colorOf(k, i) }} />{agencies[i].name}</span>)}
      </div>
    </div>
  );
}
