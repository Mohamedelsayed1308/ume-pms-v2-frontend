'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Card, Icon, Button, Spinner, cx } from '@/components/ui';

const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('en-US');
const PRIO: Record<string, string> = { 'عاجلة': 'bg-red-100 text-red-700', 'متوسطة': 'bg-amber-100 text-amber-700', 'تطويرية': 'bg-blue-100 text-blue-700' };
const IMP: Record<string, string> = { 'مرتفع': 'text-emerald-700', 'متوسط': 'text-amber-700', 'منخفض': 'text-gray-500' };

export default function MarketReport({ from, to, agencies, ship }: { from: string; to: string; agencies: string[]; ship: string }) {
  const isAdmin = typeof window !== 'undefined' && getUser()?.role === 'admin';
  const [open, setOpen] = useState(false);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [level, setLevel] = useState<'executive' | 'detailed'>('detailed');
  const [scenarios, setScenarios] = useState(true);
  const [uplift, setUplift] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [report, setReport] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [saved, setSaved] = useState<any[]>([]);

  useEffect(() => { if (open && aiOn === null) api.get('/api/market/report/status').then((r) => setAiOn(r.data.enabled)).catch(() => setAiOn(false)); }, [open, aiOn]);
  const loadSaved = () => api.get('/api/market/reports').then((r) => setSaved(r.data)).catch(() => {});
  useEffect(() => { if (open) loadSaved(); }, [open]);

  async function generate() {
    setBusy(true); setErr(''); setReport(null);
    try {
      const r = await api.post('/api/market/report', { from, to, agencies: agencies.length ? agencies : undefined, ship: ship || undefined, level, includeScenarios: scenarios, truckUpliftPct: uplift / 100 });
      setReport(r.data.report); setMeta({ id: r.data.id, model: r.data.model, tokens: r.data.tokens, created_at: r.data.created_at, snapshot: r.data.snapshot }); loadSaved();
    } catch (e: any) { setErr(e?.response?.data?.message || 'تعذّر إنشاء التقرير'); } finally { setBusy(false); }
  }
  async function openSaved(id: string) {
    setBusy(true); setErr('');
    try { const r = await api.get(`/api/market/reports/${id}`); if (r.data.report_json?.failed) { setErr('هذا التقرير فشل التحقق ولم يُحفظ محتواه.'); setReport(null); } else { setReport(r.data.report_json); setMeta({ id: r.data.id, model: r.data.model, created_at: r.data.created_at, snapshot: r.data.numbers_snapshot }); } }
    catch { setErr('تعذّر فتح التقرير'); } finally { setBusy(false); }
  }
  async function delSaved(id: string) { if (!confirm('حذف هذا التقرير؟')) return; await api.delete(`/api/market/reports/${id}`); loadSaved(); if (meta?.id === id) { setReport(null); setMeta(null); } }
  function copy() { navigator.clipboard.writeText(reportToText(report)).then(() => {}); }
  function printReport() {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الإدارة — السوق الملاحي</title>
      <style>@page{margin:16mm}body{font-family:'Segoe UI',Tahoma,'Cairo',Arial,sans-serif;color:#1f2937;line-height:1.7;direction:rtl}
      h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;border-bottom:2px solid #1e3a8a;padding-bottom:4px;margin:18px 0 8px;color:#1e3a8a}
      .muted{color:#6b7280;font-size:12px}ul{margin:4px 0;padding-inline-start:20px}table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
      th,td{border:1px solid #e5e7eb;padding:5px 8px;text-align:right}th{background:#f8fafc}.rec{border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin:6px 0}
      .foot{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:11px;color:#6b7280}</style></head>
      <body>${reportToHTML(report, meta)}<div class="foot">التوصيات مبنية على البيانات المتاحة فقط. المؤشرات المالية/العملاء/السعة غير متاحة. مُنشأ من لقطة محفوظة — لا يتغيّر بتغيّر البيانات لاحقاً.</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Icon name="chart" size={15} /> إنشاء تقرير الإدارة</Button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-3 sm:pt-16 overflow-y-auto" onMouseDown={() => setOpen(false)} dir="rtl">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">تقرير الإدارة بالذكاء الاصطناعي</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon name="x" size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {aiOn === false && <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-amber-800 text-sm">خدمة التقرير الذكي غير مفعّلة.</div>}

              {/* options */}
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <div className="text-xs text-gray-500">الفترة: <b className="text-gray-700">{from} → {to}</b> · الوكلاء: <b className="text-gray-700">{agencies.length ? agencies.join('، ') : 'الكل'}</b>{ship && <> · السفينة: <b>{ship}</b></>}</div>
                <div className="w-full flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">نوع التقرير</label>
                    <select value={level} onChange={(e) => setLevel(e.target.value as any)} className="border rounded-lg px-3 py-1.5 text-sm">
                      <option value="executive">ملخص تنفيذي</option><option value="detailed">تقرير تفصيلي</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={scenarios} onChange={(e) => setScenarios(e.target.checked)} /> تضمين السيناريوهات الحسابية</label>
                  {scenarios && <div><label className="block text-xs text-gray-500 mb-1">رفع الشاحنات/رحلة %</label><input type="number" min={0} max={100} value={uplift} onChange={(e) => setUplift(+e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm w-20" /></div>}
                  <Button size="sm" onClick={generate} disabled={busy || aiOn === false}>{busy ? 'جارٍ الإنشاء…' : (report ? 'إعادة الإنشاء' : 'إنشاء التقرير')}</Button>
                  {report && <>
                    <Button variant="outline" size="sm" onClick={copy}><Icon name="clipboard" size={14} /> نسخ</Button>
                    <Button variant="outline" size="sm" onClick={printReport}><Icon name="file" size={14} /> طباعة / PDF</Button>
                  </>}
                </div>
              </div>

              {err && <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-red-600 text-sm">{err}</div>}
              {busy && <div className="flex justify-center py-10"><Spinner /></div>}

              {report && !busy && <div className="border-t border-gray-100 pt-4"><ReportView report={report} meta={meta} /></div>}

              {/* saved */}
              {saved.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">تقارير محفوظة سابقاً</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {saved.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <button onClick={() => openSaved(s.id)} className="text-indigo-600 hover:underline text-start flex-1 truncate">
                          {s.from_year}-{String(s.from_month).padStart(2, '0')} → {s.to_year}-{String(s.to_month).padStart(2, '0')} · {s.level === 'detailed' ? 'تفصيلي' : 'تنفيذي'} · {s.created_by} · {s.created_at?.slice(0, 16).replace('T', ' ')}
                        </button>
                        {isAdmin && <button onClick={() => delSaved(s.id)} className="text-red-400 hover:text-red-600 mr-2">حذف</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Sec({ title, children }: { title: string; children: any }) {
  return <div className="mb-4"><h4 className="font-bold text-navy-900 text-sm border-b-2 border-navy-900/20 pb-1 mb-2">{title}</h4>{children}</div>;
}
function List({ items }: { items?: any[] }) { return <ul className="list-disc pe-5 text-sm text-gray-700 space-y-0.5">{(items || []).map((x, i) => <li key={i}>{x}</li>)}</ul>; }

function ReportView({ report: r, meta }: { report: any; meta: any }) {
  const es = r.executive_summary || {}, mo = r.market_overview || {}, bt = r.badawy_monthly_trend || {}, mi = r.management_insights || {}, sm = r.supporting_metrics?.badawy || {};
  return (
    <div className="text-sm">
      <div className="mb-3"><h3 className="text-lg font-extrabold text-navy-900">{r.metadata?.title || 'تقرير الإدارة'}</h3><p className="text-xs text-gray-400">{r.metadata?.period_label} · النموذج: {meta?.model} {meta?.tokens ? `· ${meta.tokens} توكن` : ''}</p></div>

      <Sec title="أ. الملخص التنفيذي">
        <p className="text-gray-700 mb-1"><b>السوق:</b> {es.market_assessment}</p>
        <p className="text-gray-700 mb-2"><b>بدوي:</b> {es.badawy_assessment}</p>
        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-50 p-2"><b className="text-emerald-700">أهم القوة</b><List items={es.strengths} /></div>
          <div className="rounded-lg bg-red-50 p-2"><b className="text-red-700">أهم المخاطر</b><List items={es.risks} /></div>
          <div className="rounded-lg bg-blue-50 p-2"><b className="text-blue-700">أهم الإجراءات</b><List items={es.actions} /></div>
        </div>
      </Sec>

      <Sec title="ب. إجمالي السوق">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {[['رحلات', mo.totals?.trips], ['شاحنات', mo.totals?.trucks], ['سيارات', mo.totals?.cars], ['ركاب', mo.totals?.passengers]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg border border-gray-100 p-2 text-center"><div className="font-bold tabular-nums">{fmt(v)}</div><div className="text-xs text-gray-500">{l}</div></div>
          ))}
        </div>
        <p className="text-gray-700">الاتجاه: <b>{mo.trend}</b> · متوسط/رحلة: شاحنات {mo.avg_per_trip?.trucks} · سيارات {mo.avg_per_trip?.cars} · ركاب {mo.avg_per_trip?.passengers}</p>
        {mo.direction_note && <p className="text-gray-600 mt-1">{mo.direction_note}</p>}
        {mo.prev_comparison && <p className="text-gray-600 mt-1">{mo.prev_comparison}</p>}
      </Sec>

      <Sec title="ج. الوضع التنافسي للوكلاء">
        <div className="overflow-x-auto"><table className="w-full text-xs whitespace-nowrap">
          <thead><tr className="text-gray-500 border-b"><th className="text-right py-1 px-1">الوكيل</th><th className="text-left px-1">رحلات</th><th className="text-left px-1">حصة%</th><th className="text-left px-1">ترتيب</th><th className="text-right px-1">ملاحظة</th></tr></thead>
          <tbody>{(r.competitive_position || []).map((c: any, i: number) => (
            <tr key={i} className="border-b border-gray-50"><td className="py-1 px-1 font-medium">{c.agency}</td><td className="text-left px-1 tabular-nums">{fmt(c.trips)}</td><td className="text-left px-1">{c.trip_share_pct}%</td><td className="text-left px-1">{c.rank}</td><td className="px-1 text-gray-600">{c.note}</td></tr>
          ))}</tbody>
        </table></div>
      </Sec>

      <Sec title="د. اتجاه أداء بدوي شهرياً">
        <p className="text-gray-700">{bt.summary}</p>
        <div className="text-xs text-gray-600 mt-1 space-y-0.5">
          <p>أفضل شهر: <b>{bt.best_month}</b> · أسوأ شهر: <b>{bt.worst_month}</b></p>
          {bt.first_to_last_change && <p>{bt.first_to_last_change}</p>}
          {bt.contributing_ships_note && <p>{bt.contributing_ships_note}</p>}
          {bt.productivity_vs_market && <p>{bt.productivity_vs_market}</p>}
        </div>
      </Sec>

      <Sec title="هـ. القراءات الإدارية">
        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-gray-50 p-2"><b className="text-gray-700">حقائق مثبتة</b><List items={mi.proven_facts} /></div>
          <div className="rounded-lg bg-amber-50 p-2"><b className="text-amber-700">تفسيرات محتملة</b><List items={mi.possible_interpretations} /></div>
          <div className="rounded-lg bg-blue-50 p-2"><b className="text-blue-700">تحتاج بيانات</b><List items={mi.needs_more_data} /></div>
        </div>
      </Sec>

      <div className="grid sm:grid-cols-2 gap-3">
        <Sec title="و. الفرص"><List items={r.opportunities} /></Sec>
        <Sec title="المخاطر"><List items={r.risks} /></Sec>
      </div>

      <Sec title="ز. التوصيات">
        <div className="space-y-2">{(r.recommendations || []).map((rec: any, i: number) => (
          <div key={i} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <b className="text-gray-800">{rec.title}</b>
              <span className={cx('text-[10px] px-1.5 py-0.5 rounded-full', PRIO[rec.priority] || 'bg-gray-100 text-gray-600')}>{rec.priority}</span>
              <span className={cx('text-[10px]', IMP[rec.impact])}>أثر {rec.impact}</span>
              {rec.target_metric && <span className="text-[10px] text-gray-400">مؤشر: {rec.target_metric}</span>}
              {rec.target_entity && <span className="text-[10px] text-gray-400">· {rec.target_entity}</span>}
            </div>
            <p className="text-xs text-gray-700">{rec.action}</p>
            <p className="text-[11px] text-gray-500 mt-1">مبني على: {rec.based_on} · المدة: {rec.timeframe} · KPI: {rec.success_kpi}</p>
          </div>
        ))}</div>
      </Sec>

      {r.scenarios?.length > 0 && (
        <Sec title="ح. السيناريوهات الحسابية">
          <p className="text-[11px] text-amber-600 mb-1">تقديرات حسابية وليست توقعات مؤكدة.</p>
          <div className="space-y-1.5">{r.scenarios.map((s: any, i: number) => <div key={i} className="rounded-lg bg-gray-50 p-2 text-xs"><b>{s.title}:</b> {s.interpretation}</div>)}</div>
        </Sec>
      )}

      <Sec title="القيود والبيانات غير المتاحة"><List items={r.data_limitations} /></Sec>

      <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-2">أرقام بدوي المرجعية: رحلات {fmt(sm.trips)} ({sm.trips_share_pct}%) · شاحنات {fmt(sm.trucks)} ({sm.trucks_share_pct}%) · سيارات {fmt(sm.cars)} ({sm.cars_share_pct}%) · ركاب {fmt(sm.passengers)} ({sm.passengers_share_pct}%)</div>
    </div>
  );
}

function reportToText(r: any): string {
  const es = r.executive_summary || {};
  return `${r.metadata?.title || 'تقرير الإدارة'}\n\nالملخص التنفيذي:\nالسوق: ${es.market_assessment}\nبدوي: ${es.badawy_assessment}\n\nالقوة: ${(es.strengths || []).join(' | ')}\nالمخاطر: ${(es.risks || []).join(' | ')}\nالإجراءات: ${(es.actions || []).join(' | ')}\n\nالتوصيات:\n${(r.recommendations || []).map((x: any) => `- [${x.priority}] ${x.title}: ${x.action}`).join('\n')}`;
}
function reportToHTML(r: any, meta: any): string {
  const es = r.executive_summary || {}, mo = r.market_overview || {};
  const ul = (a?: any[]) => `<ul>${(a || []).map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const rows = (r.competitive_position || []).map((c: any) => `<tr><td>${c.agency}</td><td>${fmt(c.trips)}</td><td>${c.trip_share_pct}%</td><td>${c.rank}</td><td>${c.note || ''}</td></tr>`).join('');
  const recs = (r.recommendations || []).map((x: any) => `<div class="rec"><b>${x.title}</b> — ${x.priority} · أثر ${x.impact}<br>${x.action}<br><small>مبني على: ${x.based_on} · المدة: ${x.timeframe} · KPI: ${x.success_kpi}</small></div>`).join('');
  const scen = (r.scenarios || []).map((s: any) => `<li><b>${s.title}:</b> ${s.interpretation}</li>`).join('');
  return `<h1>${r.metadata?.title || 'تقرير الإدارة'}</h1><div class="muted">${r.metadata?.period_label || ''} · النموذج: ${meta?.model || ''} · ${new Date().toLocaleString('ar-EG')}</div>
    <h2>الملخص التنفيذي</h2><p><b>السوق:</b> ${es.market_assessment || ''}</p><p><b>بدوي:</b> ${es.badawy_assessment || ''}</p>
    <b>القوة</b>${ul(es.strengths)}<b>المخاطر</b>${ul(es.risks)}<b>الإجراءات</b>${ul(es.actions)}
    <h2>إجمالي السوق</h2><p>رحلات ${fmt(mo.totals?.trips)} · شاحنات ${fmt(mo.totals?.trucks)} · سيارات ${fmt(mo.totals?.cars)} · ركاب ${fmt(mo.totals?.passengers)} — الاتجاه: ${mo.trend || ''}</p><p>${mo.direction_note || ''}</p><p>${mo.prev_comparison || ''}</p>
    <h2>الوضع التنافسي</h2><table><tr><th>الوكيل</th><th>رحلات</th><th>حصة%</th><th>ترتيب</th><th>ملاحظة</th></tr>${rows}</table>
    <h2>اتجاه بدوي شهرياً</h2><p>${r.badawy_monthly_trend?.summary || ''}</p>
    <h2>الفرص</h2>${ul(r.opportunities)}<h2>المخاطر</h2>${ul(r.risks)}
    <h2>التوصيات</h2>${recs}
    ${scen ? `<h2>السيناريوهات الحسابية <small>(تقديرات وليست توقعات)</small></h2><ul>${scen}</ul>` : ''}
    <h2>القيود</h2>${ul(r.data_limitations)}`;
}
