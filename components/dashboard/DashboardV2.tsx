'use client';
import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button, Icon, Modal, Input, Select, Field } from '@/components/ui';
import { vesselPhoto } from '@/lib/vesselPhoto';
import { useDashboardPreferences, type DisplayRole } from './Preferences';
import { compactMoney, money, months, periods, routes, percentage, selectDashboard, vessels, type Period, type Route, type LedgerItem } from './demo-data';
import HomeGreeting from './HomeGreeting';
import s from './dashboard.module.css';

const roleNames: Record<DisplayRole, string> = { executive: 'تنفيذي', finance: 'مالية', operations: 'عمليات' };
const createNames = { invoice: 'فاتورة', payment: 'دفعة', purchase: 'أمر شراء' };
const metricNames = { profit: 'صافي ربح الأسطول', revenue: 'إجمالي الإيرادات', expenses: 'المصروفات التشغيلية', trips: 'الرحلات المنفّذة' };
type Metric = keyof typeof metricNames;
type Draft = { id: string; label: string; amount: number; route: Route; month: number };

function Change({ current, previous }: { current: number; previous: number }) {
  const change = percentage(current, previous);
  return <span className={change !== null && change < 0 ? s.negative : s.positive} dir="ltr">{change === null ? '—' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%'}</span>;
}
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v, i) => `${i * 128 / Math.max(1, values.length - 1)},${36 - (v - min) / (max - min || 1) * 29}`).join(' ');
  return <svg className={s.sparkline} viewBox="0 0 128 42" role="img" aria-label={label}><polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} /></svg>;
}
function SectionTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className={s.sectionTitle}><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{children}</div>;
}

export default function DashboardV2() {
  const { role, setRole, collapsed, setCollapsed, showAsk, setShowAsk, createType, setCreateType } = useDashboardPreferences();
  const [period, setPeriod] = useState<Period>('quarter');
  const [route, setRoute] = useState<Route>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [agingSide, setAgingSide] = useState<'payable' | 'receivable'>('payable');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tweaks, setTweaks] = useState(false);
  const [details, setDetails] = useState<{ title: string; entries: LedgerItem[] } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notice, setNotice] = useState('');
  const [allActivity, setAllActivity] = useState(false);
  const [fleetDetail, setFleetDetail] = useState(false);
  const data = selectDashboard(period, route);
  const scope = periods[period] + ' · ' + routes[route];
  const setFilters = (p: Period, r: Route) => { setPeriod(p); setRoute(r); setSelected(null); setAnswer(''); setAllActivity(false); };
  const openInvoices = data.entries.filter(e => e.kind === 'invoice');
  const actions = [
    { id: 'overdue', title: 'فواتير متأخرة', icon: 'receipt', tone: 'danger', entries: openInvoices.filter(e => e.side === 'payable' && e.days > 0), unit: 'فاتورة تحتاج متابعة' },
    { id: 'due', title: 'مستحقة خلال ٧ أيام', icon: 'calendar', tone: 'warning', entries: openInvoices.filter(e => e.side === 'payable' && e.days <= 0 && e.days >= -7), unit: 'فاتورة قريبة الاستحقاق' },
    { id: 'approval', title: 'بانتظار الاعتماد', icon: 'clipboard', tone: 'info', entries: data.entries.filter(e => e.approval), unit: 'طلب ينتظر اعتمادك' },
    { id: 'tasks', title: 'مهام تحتاج متابعة', icon: 'check', tone: 'neutral', entries: data.entries.filter(e => e.task), unit: 'مهمة مفتوحة' },
  ];
  const reviewKey = (id: string) => period + ':' + route + ':' + id;
  const metrics: Metric[] = role === 'finance' ? ['revenue', 'expenses', 'profit', 'trips'] : role === 'operations' ? ['trips', 'profit', 'revenue', 'expenses'] : ['profit', 'revenue', 'expenses', 'trips'];
  const aging = openInvoices.filter(e => e.side === agingSide);
  const buckets = [
    { label: 'غير مستحق', color: '#3d8a67', entries: aging.filter(e => e.days <= 0) },
    { label: '١–٣٠ يوم', color: '#84a9ed', entries: aging.filter(e => e.days > 0 && e.days <= 30) },
    { label: '٣١–٦٠ يوم', color: '#f2bd58', entries: aging.filter(e => e.days > 30 && e.days <= 60) },
    { label: '٦١–٩٠ يوم', color: '#f09862', entries: aging.filter(e => e.days > 60 && e.days <= 90) },
    { label: '+٩٠ يوم', color: '#d76a6a', entries: aging.filter(e => e.days > 90) },
  ];
  const sum = (entries: LedgerItem[]) => entries.reduce((a, e) => a + e.amount, 0);
  const agingTotal = sum(aging);
  const answerQuestion = (q: string) => {
    setQuestion(q);
    const best = data.fleet[0];
    const intro = scope + ' — بيانات تجريبية: ';
    if (/أعلى|الأعلى|افضل|أفضل|ربحية/.test(q)) setAnswer(intro + best.name + ' يحقق أعلى صافي ربح بقيمة ' + money(best.profit) + '، بحصة ' + (best.profit / (data.totals.profit || 1) * 100).toFixed(1) + '% من الأسطول.');
    else if (/قارن|مقارنة/.test(q)) {
      const a = data.fleet.find(v => v.id === 'alcudia'), p = data.fleet.find(v => v.id === 'poseidon');
      setAnswer(intro + (a && p ? 'صافي الربح للرحلة: Alcudia ' + money(a.profit / (a.trips || 1)) + '، وPoseidon ' + money(p.profit / (p.trips || 1)) + '.' : 'المركبان خارج الخط المحدد. اختر «كل الخطوط» أو «ضبا ↔ سفاجا».'));
    } else if (/متأخر|استحقاق/.test(q)) setAnswer(intro + 'لدينا ' + actions[0].entries.length + ' فواتير متأخرة علينا بإجمالي ' + money(sum(actions[0].entries)) + '.');
    else if (/إيراد|ايراد/.test(q)) setAnswer(intro + 'إجمالي الإيرادات ' + money(data.totals.revenue) + '.');
    else if (/ربح|الربح/.test(q)) setAnswer(intro + 'صافي الربح ' + money(data.totals.profit) + ' عبر ' + data.totals.trips + ' رحلة.');
    else setAnswer('الإجابات المتاحة هنا محسوبة من البيانات التجريبية. الأسئلة الحرة بالذكاء الاصطناعي تحتاج ربط الخدمة؛ جرّب أحد الأسئلة الجاهزة.');
  };
  const submitDraft = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const amount = Number(fields.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0 || !createType) return;
    const v = vessels.find(v => v.id === fields.get('vessel'))!;
    const month = Number(String(fields.get('date')).slice(5, 7)) - 1;
    const name = String(fields.get('name')).trim();
    if (!name) return;
    setDrafts(d => [{ id: 'LOCAL-' + Date.now(), label: 'مسودة ' + createNames[createType] + ' · ' + name, amount, route: v.route, month }, ...d]);
    setCreateType(null); setNotice('تمت إضافة مسودة تجريبية لهذه الجلسة. لم تُرسل إلى النظام المالي.');
  };

  const finance = <section className={s.financeGrid} aria-label="الملخص المالي">
    <div className={s.card}><SectionTitle title="أعمار الاستحقاقات" sub={scope}><div className={s.segmented}>{([['payable', 'علينا'], ['receivable', 'لنا']] as const).map(([value, label]) => <button key={value} aria-pressed={agingSide === value} onClick={() => setAgingSide(value)}>{label}</button>)}</div></SectionTitle>
      <div className={s.agingValue}><strong dir="ltr">{money(agingTotal)}</strong><span>USD · {aging.length} فواتير مفتوحة</span></div>
      <div className={s.agingBar}>{buckets.map(b => <button key={b.label} style={{ background: b.color, flex: sum(b.entries) || .001 }} title={b.label + ': ' + money(sum(b.entries))} aria-label={b.label + ': ' + money(sum(b.entries))} onClick={() => setDetails({ title: b.label + ' · ' + (agingSide === 'payable' ? 'علينا' : 'لنا'), entries: b.entries })} />)}</div>
      <div className={s.buckets}>{buckets.map(b => <button key={b.label} onClick={() => setDetails({ title: b.label, entries: b.entries })}><span><i style={{ background: b.color }} />{b.label}</span><b dir="ltr">{compactMoney(sum(b.entries))}</b></button>)}</div>
    </div>
    <div className={s.card}><SectionTitle title="أكبر الموردين إنفاقاً" sub={scope} />{data.vendors.map(v => <button className={s.vendor} key={v.name} onClick={() => setDetails({ title: v.name, entries: data.entries.filter(e => e.supplier === v.name && e.side === 'payable') })}><span><b>{v.name}</b><em dir="ltr">{money(v.amount)}</em></span><div><i style={{ width: (v.amount / (data.vendors[0].amount || 1) * 100) + '%' }} /></div></button>)}</div>
    <div className={s.card}><SectionTitle title="النشاط الأخير" sub={scope}><button className={s.textButton} onClick={() => setAllActivity(!allActivity)}>{allActivity ? 'عرض أقل' : 'عرض الكل'}</button></SectionTitle>
      {drafts.filter(d => data.range.includes(d.month) && (route === 'all' || d.route === route)).map(d => <div className={s.activity} key={d.id}><span className={s.activityIcon}><Icon name="edit" size={16} /></span><div><b>{d.label}</b><small>مسودة محلية · غير مرحّلة</small></div><strong dir="ltr">{money(d.amount)}</strong></div>)}
      {data.entries.slice().reverse().slice(0, allActivity ? undefined : 3).map(e => <button className={s.activity} key={e.id} onClick={() => setDetails({ title: e.kind === 'payment' ? 'دفعة تجريبية' : 'فاتورة تجريبية', entries: [e] })}><span className={s.activityIcon}><Icon name={e.kind === 'payment' ? 'card' : 'receipt'} size={16} /></span><span><b>{e.supplier}</b><small>{e.id} · {months[e.month]} ٢٠٢٦</small></span><strong dir="ltr">{money(e.amount)}</strong></button>)}
    </div>
  </section>;

  return <div className={s.dashboard} dir="rtl">
    <div className={s.intro}><div><div className={s.eyebrow}>UME / OVERVIEW</div><HomeGreeting /><p>الأسطول والإدارة المالية · ٢٥ سبتمبر ٢٠٢٦</p></div><div className={s.introActions}><span className={s.demoBadge}>نسخة مراجعة · بيانات تجريبية</span><Button variant="outline" icon="filter" onClick={() => setTweaks(!tweaks)} aria-expanded={tweaks}>تخصيص العرض</Button></div></div>
    {tweaks && <div className={s.tweaks}><label>الدور <Select value={role} onChange={e => setRole(e.target.value as DisplayRole)}>{Object.entries(roleNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Select></label><label><input type="checkbox" checked={collapsed} onChange={e => { setCollapsed(e.target.checked); localStorage.setItem('sidebarCollapsed', e.target.checked ? '1' : '0'); }} /> طيّ الشريط الجانبي</label><label><input type="checkbox" checked={showAsk} onChange={e => setShowAsk(e.target.checked)} /> إظهار «اسأل UME»</label><small>الدور يخصّ العرض فقط، ولا يغيّر الصلاحيات.</small></div>}
    <div className={s.filters}><div className={s.filterLabel}><Icon name="calendar" size={17} /><span>الفترة</span></div><div className={s.segmented}>{(Object.keys(periods) as Period[]).map(p => <button key={p} aria-pressed={period === p} onClick={() => setFilters(p, route)}>{periods[p]}</button>)}</div><div className={s.divider} /><div className={s.segmented}>{(Object.keys(routes) as Route[]).map(r => <button key={r} aria-pressed={route === r} onClick={() => setFilters(period, r)}>{routes[r]}</button>)}</div><span className={s.filterNote}>تُطبّق على جميع الأقسام</span></div>
    <section><SectionTitle title="يحتاج قرارك اليوم" sub="مراجعة واحدة، وصورة أوضح للأولويات"><span className={s.count}>{actions.filter(a => !reviewed.includes(reviewKey(a.id))).length} للمراجعة</span></SectionTitle><div className={s.actionGrid}>{actions.map(a => {
      const done = reviewed.includes(reviewKey(a.id));
      return <article key={a.id} className={s.actionCard} data-tone={a.tone} data-reviewed={done}><div className={s.actionTop}><span className={s.actionIcon}><Icon name={a.icon} size={19} /></span><span>{a.title}</span>{done && <span className={s.reviewed}>تمت المراجعة</span>}</div><button className={s.actionValue} onClick={() => setDetails({ title: a.title, entries: a.entries })}><strong>{a.entries.length}</strong><span>{a.unit}</span></button><div className={s.actionBottom}><span dir="ltr">{a.id === 'tasks' ? '—' : money(sum(a.entries))}</span><button aria-pressed={done} onClick={() => setReviewed(old => done ? old.filter(k => k !== reviewKey(a.id)) : [...old, reviewKey(a.id)])}>{done ? 'تراجع' : 'تمّت المراجعة'} <span aria-hidden="true">✓</span></button></div></article>;
    })}</div></section>
    <section className={s.kpis} aria-label="المؤشرات الرئيسية">{metrics.map((key, i) => <article className={i === 0 ? s.featuredKpi : s.kpi} key={key}><div className={s.kpiLabel}>{metricNames[key]}<Icon name={key === 'trips' ? 'ship' : 'chart'} size={19} /></div><strong dir="ltr">{key === 'trips' ? data.totals[key] : compactMoney(data.totals[key])}</strong><div className={s.kpiFoot}><span><Change current={data.totals[key]} previous={data.previous[key]} /><small>{period === 'year' ? 'مقابل نفس الفترة ٢٠٢٥' : 'مقابل الفترة السابقة'}</small></span><Sparkline values={period === 'month' ? [data.previous[key], data.totals[key]] : data.trend.filter(m => data.range.includes(m.month)).map(m => m[key])} label={metricNames[key] + ' · ' + scope} /></div></article>)}</section>
    {role === 'finance' && finance}
    <section className={showAsk ? s.trendRow : s.trendOnly}>
      <div className={s.card}><SectionTitle title="الاتجاه الشهري" sub={'صافي الربح بالدولار · ٢٠٢٦ · ' + routes[route]}><span className={s.chartTotal} dir="ltr">{compactMoney(data.totals.profit)}</span></SectionTitle>
        <div className={s.chart} role="img" aria-label={'الاتجاه الشهري لصافي الربح. ' + data.trend.map(m => m.label + ': ' + money(m.profit)).join('، ')}><div className={s.gridLines}>{[1, .75, .5, .25].map(v => <span key={v} style={{ top: ((1 - v) * 100) + '%' }}><b dir="ltr">{compactMoney(Math.max(...data.trend.map(m => m.profit)) * v)}</b></span>)}</div><div className={s.bars}>{data.trend.map(m => <div className={s.month} key={m.month}><div className={s.bar} style={{ height: (m.profit / Math.max(...data.trend.map(m => m.profit)) * 100) + '%' }} title={m.label + ': ' + money(m.profit)}>{m.parts.filter(p => p.profit > 0).map(p => <span key={p.id} style={{ flex: p.profit }} data-active={data.range.includes(m.month)} data-highlight={selected === p.id} data-muted={!!selected && selected !== p.id} />)}</div><small data-active={data.range.includes(m.month)}>{m.label}</small></div>)}</div></div>
        <div className={s.legend}><span><i />الفترة المختارة</span><span><i className={s.legendMuted} />خارج الفترة</span>{selected && <button onClick={() => setSelected(null)}>إلغاء تمييز {vessels.find(v => v.id === selected)?.name} ×</button>}</div>
      </div>
      {showAsk && <aside className={s.ask}><div className={s.askHeader}><span className={s.askIcon}><Icon name="sparkle" size={25} /></span><span>اسأل <b>UME</b><small>إجابة أوضح. قرار أسرع.</small></span></div><p>ماذا تريد أن تعرف عن أداء الأسطول؟</p><div className={s.suggestions}>{['ما المركب الأعلى ربحية؟', 'كم إجمالي الفواتير المتأخرة؟', 'قارن Alcudia وPoseidon للرحلة'].map(q => <button key={q} onClick={() => answerQuestion(q)}>{q}<span>↖</span></button>)}</div>{answer && <div className={s.answer} role="status">{answer}</div>}<form className={s.askForm} onSubmit={e => { e.preventDefault(); if (question.trim()) answerQuestion(question.trim()); }}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="اكتب سؤالك عن الأسطول أو المال…" aria-label="سؤالك إلى UME" maxLength={500} /><button disabled={!question.trim()} aria-label="إرسال السؤال"><Icon name="chevronLeft" size={20} /></button></form><small className={s.askNote}>إجابات تجريبية · الذكاء الاصطناعي غير متصل</small></aside>}
    </section>
    <section className={s.card}><SectionTitle title="أداء المراكب · صافي الربح" sub="اختر مركباً لتمييز حصته في المخطط — مرتّبة من الأعلى"><button className={s.textButton} onClick={() => setFleetDetail(true)}>جدول الأداء التفصيلي ←</button></SectionTitle><div className={s.tableScroll}><table className={s.fleetTable}><thead><tr><th>#</th><th>المركب</th><th>صافي الربح</th><th>الحصة</th><th>صافي / رحلة</th><th>مقابل السابقة</th></tr></thead><tbody>{data.fleet.map((v, i) => { const photo = vesselPhoto(v.name); return <tr key={v.id} data-selected={selected === v.id} data-inactive={!v.trips}><td>{i + 1}</td><td><button className={s.vessel} aria-pressed={selected === v.id} onClick={() => setSelected(selected === v.id ? null : v.id)}>{photo ? <Image src={photo} width={68} height={46} alt={v.name} /> : <span className={s.noPhoto}><Icon name="ship" /></span>}<span><b dir="ltr">{v.name}</b><small>{routes[v.route]} · {v.trips ? v.trips + ' رحلة' : 'لا نشاط خلال الفترة'}</small></span></button></td><td><div className={s.profitBar}><span><i style={{ width: (v.profit / (data.fleet[0].profit || 1) * 100) + '%' }} /></span><b dir="ltr">{compactMoney(v.profit)}</b></div></td><td dir="ltr">{(v.profit / (data.totals.profit || 1) * 100).toFixed(1)}%</td><td dir="ltr">{v.trips ? money(v.profit / v.trips) : '—'}</td><td>{v.trips ? <Change current={v.profit} previous={v.previous} /> : <span className={s.noActivity}>لا نشاط</span>}</td></tr>; })}</tbody><tfoot><tr><td colSpan={2}>إجمالي الأسطول</td><td dir="ltr">{money(data.totals.profit)}</td><td dir="ltr">100%</td><td dir="ltr">{data.totals.trips ? money(data.totals.profit / data.totals.trips) : '—'}</td><td>{data.totals.trips} رحلة</td></tr></tfoot></table></div></section>
    {role === 'executive' && finance}
    {role === 'operations' && <div className={s.operationsNote}><Icon name="info" size={18} />عرض العمليات يركّز على الرحلات وأداء المراكب. لعرض الملخص المالي، اختر «تنفيذي» أو «مالية» من تخصيص العرض.</div>}
    <Link className={s.market} href="/dashboard/market" prefetch={false}><span className={s.marketIcon}><Icon name="globe" size={26} /></span><div><h2>الصورة الأوسع، خارج أسطولك</h2><p>تحليل السوق الملاحي · حصص الوكلاء واتجاهات الحركة</p></div><span>استكشف السوق <span aria-hidden="true">←</span></span></Link>
    <footer className={s.footer}><span>UME Dashboard v2</span><span>جميع القيم بالدولار الأمريكي · بيانات تجريبية للمراجعة</span><span>{roleNames[role]}</span></footer>
    {notice && <div className={s.notice} role="status">{notice}<button aria-label="إغلاق الإشعار" onClick={() => setNotice('')}>×</button></div>}
    <Modal open={!!details} onClose={() => setDetails(null)} title={details?.title || 'التفاصيل'}><p className={s.modalHint}>بيانات تجريبية · {scope} · المراجعة لا تعني السداد أو الاعتماد.</p>{details?.entries.length ? <div className={s.tableScroll}><table className={s.detailTable}><thead><tr><th>المرجع / الجهة</th><th>القيمة USD</th><th>الاستحقاق</th></tr></thead><tbody>{details.entries.map(e => <tr key={e.id}><td>{e.supplier}<small>{e.id}</small></td><td dir="ltr">{money(e.amount)}</td><td>{e.days > 0 ? 'متأخرة ' + e.days + ' يوماً' : e.days === 0 ? 'اليوم' : 'خلال ' + -e.days + ' أيام'}</td></tr>)}</tbody></table></div> : <p>لا توجد عناصر لهذه الفترة والخط.</p>}</Modal>
    <Modal open={fleetDetail} onClose={() => setFleetDetail(false)} title="الأداء التفصيلي للأسطول" size="lg"><p className={s.modalHint}>{scope} · بيانات تجريبية</p><div className={s.tableScroll}><table className={s.detailTable}><thead><tr><th>المركب</th><th>الإيرادات</th><th>المصروفات</th><th>صافي الربح</th><th>الرحلات</th></tr></thead><tbody>{data.fleet.map(v => <tr key={v.id}><td>{v.name}</td><td dir="ltr">{money(v.revenue)}</td><td dir="ltr">{money(v.expenses)}</td><td dir="ltr">{money(v.profit)}</td><td>{v.trips}</td></tr>)}</tbody></table></div></Modal>
    <Modal open={!!createType} onClose={() => setCreateType(null)} title={createType ? 'إنشاء ' + createNames[createType] + ' تجريبية' : 'إنشاء'}><form onSubmit={submitDraft} className={s.draftForm}><p className={s.modalHint}>مسودة لهذه الجلسة فقط؛ لا تؤثر على المؤشرات ولا تُرسل إلى النظام.</p><Field label="الجهة / الوصف" required><Input name="name" required maxLength={100} placeholder="اسم المورد أو وصف العملية" /></Field><div className={s.formRow}><Field label="المبلغ بالدولار" required><Input name="amount" type="number" required min=".01" max="999999999" step=".01" placeholder="0.00" /></Field><Field label="التاريخ" required><Input name="date" type="date" required defaultValue="2026-09-25" min="2026-01-01" max="2026-09-30" /></Field></div><Field label="المركب"><Select name="vessel">{vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><div className={s.formActions}><Button variant="outline" type="button" onClick={() => setCreateType(null)}>إلغاء</Button><Button type="submit">حفظ المسودة</Button></div></form></Modal>
  </div>;
}
