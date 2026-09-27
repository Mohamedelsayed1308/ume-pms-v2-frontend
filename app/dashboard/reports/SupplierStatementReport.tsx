'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { norm } from '@/lib/reports/text';
import { useLatestRequest } from '@/lib/useLatestRequest';
import { prefKey, readSets, writeSets, upsertSet, MAX_SET_NAME, type FilterSet } from '@/lib/reports/prefs';
import {
  CCYS, cleanSups, cleanCcy, buildLink, normalizeLedger, ledgersOf, matchTx, orderRows, sumDC,
  exportSets as buildExportSets, currencySummary, emptyStateOf, metaRows, buildStatementWorkbook, tableRows,
  type Applied, type Section, type Tx,
} from '@/lib/reports/statement';
import { STX, kindLabel, exportLabels } from '@/lib/reports/statementText';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  كشف حساب المورّد — v1.2 (تسليم التصميم §4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── العقد مع الخادم ──
 * طلبٌ لكلّ مورّد: `GET /api/invoices/statement/supplier/:id`. والخادم يحمي
 * الشاشة (`ScreenGuard`)، والواجهة تتحقّق من الصلاحية **قبل** أيّ طلب — فمن لا
 * يملكها لا يُرسَل له طلبٌ واحد.
 *
 * ── ولا حسابٌ للأرصدة هنا ──
 * كلّ رصيدٍ يُعرض كما أعاده الخادم (`lib/reports/statement.ts`). البحث والترتيب
 * والصفحات تُرشّح العرض وحده.
 */

const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const kindSty = (k: Tx['kind']) => (k === 'invoice' ? 'bg-[#fef3f2] text-[#b42318]' : k === 'payment' ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#eef4ff] text-[#1d3eb0]');
const ctl = 'h-[34px] max-md:h-11';
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]';

export interface SupplierLite { id: string; name: string }

export default function SupplierStatementReport({
  locale, userId, allowed, suppliers, suppliersLoading, suppliersError, initial, onApplied,
}: {
  locale: 'ar' | 'en';
  userId: string | null;
  /** صلاحية الشاشة — تُفحص قبل أيّ طلب. */
  allowed: boolean;
  suppliers: SupplierLite[];
  suppliersLoading: boolean;
  suppliersError: string;
  /** معاملات الرابط عند الفتح — تُنظَّف وتُعاد صلاحيتها هنا. */
  initial?: { sups: string[]; ccy: string } | null;
  onApplied?: (ap: Applied | null) => void;
}) {
  const en = locale === 'en';
  const T = en ? STX.en : STX.ar;
  const req = useLatestRequest();

  // ── الصلاحية على مستوى المورّد: من القائمة التي أعادها الخادم لهذا المستخدم ──
  const supIds = useMemo(() => new Set(suppliers.map((s) => s.id)), [suppliers]);
  const supOk = useCallback((id: string) => supIds.has(id), [supIds]);
  const supName = useCallback((id: string) => suppliers.find((s) => s.id === id)?.name || id, [suppliers]);

  const [draft, setDraftState] = useState<Applied>({ sups: [], ccy: 'all' });
  const [applied, setApplied] = useState<Applied | null>(null);
  const [results, setResults] = useState<Section[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [runError, setRunError] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [supQ, setSupQ] = useState('');
  const [txq, setTxq] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [pages, setPages] = useState<Record<string, number>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  const setsKey = prefKey('filtersets:supplier-statement', userId);
  // يُقرأ عند الإنشاء — المكوّن لا يُعرض إلّا في المتصفّح بعد اختيار التقرير
  const [sets, setSets] = useState<FilterSet[]>(() => readSets(setsKey));
  const [savingSet, setSavingSet] = useState(false);
  const [setName, setSetName] = useState('');
  const [setErr, setSetErr] = useState('');
  const txqRef = useRef<HTMLInputElement>(null);
  const setNameRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const showToast = (title: string, sub = '') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ title, sub });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /** تغيير الاختيارات أثناء التحميل يُلغي الطلب الجاري ويقول ذلك. */
  const setDraft = (patch: Partial<Applied>) => {
    if (loading) { req.cancel(); setLoading(false); setCancelled(true); } else setCancelled(false);
    setRunError(false);
    setDraftState((d) => ({ ...d, ...patch }));
  };

  const run = useCallback(async (d: Applied) => {
    if (!allowed) return;                                   // لا طلب بلا صلاحية
    const snap: Applied = { sups: cleanSups(d.sups, supOk), ccy: cleanCcy(d.ccy) };
    if (!snap.sups.length) { setRunError(true); setCancelled(false); return; }
    const { id, signal } = req.start();
    setLoading(true); setError(false); setRunError(false); setCancelled(false);
    try {
      const res = await Promise.all(snap.sups.map((sid) =>
        api.get(`/api/invoices/statement/supplier/${sid}`, { signal }).then((r) => ({ sid, d: r.data }))));
      if (!req.isLatest(id)) return;                        // ردٌّ قديم يُتجاهَل
      const sections: Section[] = res.map(({ sid, d: data }) => ({
        supplierId: sid,
        supplierName: data?.supplier?.name || supName(sid),
        currencies: (Array.isArray(data?.currencies) ? data.currencies : []).map(normalizeLedger),
      }));
      setResults(sections); setApplied(snap); setLoadedAt(new Date());
      setPages({}); setOpenRow(null);
      if (window.matchMedia('(max-width: 759px)').matches) setFiltersOpen(false);
      onApplied?.(snap);
    } catch {
      if (!req.isLatest(id)) return;
      setError(true);                                        // النتائج السابقة تبقى
    } finally {
      if (req.isLatest(id)) setLoading(false);
    }
  }, [allowed, supOk, supName, req, onApplied]);

  // ── معاملات الرابط: تُطبَّق مرّةً بعد وصول قائمة المورّدين ──
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || !initial || suppliersLoading) return;
    initDone.current = true;
    if (!allowed) return;
    const sups = cleanSups(initial.sups, supOk);
    const dropped = new Set(initial.sups).size - sups.length;
    // مزامنةٌ مع مصدرٍ خارجيّ (معاملات الرابط بعد وصول قائمة المورّدين) — مرّةً واحدة
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dropped > 0) showToast(T.linkDropped(dropped), T.linkDroppedSub);
    if (!sups.length) return;
    const d = { sups, ccy: cleanCcy(initial.ccy) };
    setDraftState(d);
    run(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, suppliersLoading, allowed, supOk]);

  const reset = () => {
    req.cancel();
    setDraftState({ sups: [], ccy: 'all' }); setSupQ(''); setRunError(false); setLoading(false); setCancelled(false);
  };

  // ── مجموعات الفلاتر ──
  const saveSet = (e?: FormEvent) => {
    e?.preventDefault();
    const name = setName.trim().slice(0, MAX_SET_NAME);
    if (!name) { setSetErr(T.setNameReq); return; }
    const next = upsertSet(sets, { name, sups: cleanSups(draft.sups, supOk), ccy: draft.ccy });
    writeSets(setsKey, next); setSets(next);
    setSavingSet(false); setSetName(''); setSetErr('');
    showToast(`${T.setSaved}: ${name}`, T.setSavedSub);
  };
  const applySet = (fs: FilterSet) => {
    const sups = cleanSups(fs.sups, supOk);
    const dropped = new Set(fs.sups).size - sups.length;
    setDraft({ sups, ccy: cleanCcy(fs.ccy) });
    if (dropped) showToast(T.setDropped(dropped), T.setDroppedSub); else showToast(`${T.setRestored}: ${fs.name}`, T.setRestoredSub);
  };
  const deleteSet = (name: string) => { const next = sets.filter((x) => x.name !== name); writeSets(setsKey, next); setSets(next); };

  // ── الاشتقاقات ──
  const dirty = !!applied && (applied.ccy !== draft.ccy || applied.sups.join() !== draft.sups.join());
  const PS = pageSize ?? (narrow ? 10 : 25);
  const q = txq.trim();
  const ap = applied;
  const expSets = useMemo(() => (results && ap ? buildExportSets(results, ap.ccy, q, order) : []), [results, ap, q, order]);
  const summary = useMemo(() => (results && ap ? currencySummary(results, ap.ccy) : []), [results, ap]);
  const totalAll = expSets.reduce((a, x) => a + x.L.transactions.length, 0);
  const exportCount = expSets.reduce((a, x) => a + x.rows.length, 0);
  const netCount = expSets.filter((x) => x.L.balanceBasis === 'net').length;
  const extracted = loadedAt ? loadedAt.toLocaleString(en ? 'en-GB' : 'ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const supList = suppliers.filter((s) => !supQ.trim() || norm(s.name).includes(norm(supQ.trim())));
  const jumpLinks = results && ap ? results.flatMap((sec) => ledgersOf(sec, ap.ccy).map((L) => ({ name: sec.supplierName, ccy: L.currency, anchor: `lg-${sec.supplierId}-${L.currency}` }))) : [];
  const noCcyAny = !!results && !!ap && ap.ccy !== 'all' && results.every((sec) => !ledgersOf(sec, ap.ccy).length);
  const labels = exportLabels(T);
  const meta = (s: typeof expSets) => metaRows(s, { ccy: ap?.ccy || 'all', q, order, extracted, reportTitle: T.reportTitle }, labels);

  const exportAll = () => {
    const wb = buildStatementWorkbook(expSets, meta(expSets), labels);
    XLSX.writeFile(wb, `${en ? 'supplier-statement' : 'كشف-حساب-موردين'}.xlsx`);
  };
  const exportOne = (s: (typeof expSets)[number]) => {
    const wb = buildStatementWorkbook([s], meta([s]), labels);
    XLSX.writeFile(wb, `${en ? 'supplier-statement' : 'كشف-حساب'}-${s.sec.supplierName}-${s.L.currency}.xlsx`);
  };
  const copyLink = () => {
    const url = buildLink(window.location.origin + '/dashboard/reports', ap);
    const done = () => showToast(T.linkCopied, T.linkNote);
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => showToast(url));
    else showToast(url);
  };
  const jumpTo = (anchor: string) => {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  if (!allowed) {
    return <div role="alert" className="rounded-[14px] border border-[#fecdca] bg-[#fef3f2] p-5 text-[13px] text-[#912018]">{T.noAccess}</div>;
  }

  const draftSummary = (draft.sups.length ? `${draft.sups.length} ${T.selected}` : '') + (draft.ccy !== 'all' ? ` · ${draft.ccy}` : '') + (dirty ? ` · ${T.notApplied}` : '');

  return (
    <div className="flex flex-col gap-4 text-[13.5px] text-[#101828]">
      {/* ══ الفلاتر ══ */}
      <section aria-label={T.filters} className="rounded-[14px] border border-[#e4e7ec] bg-white print:hidden">
        <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-start ${focusRing} rounded-[14px]`}>
          <span className="font-extrabold text-[15px]">{T.filters}</span>
          <span className="flex items-center gap-2 text-[12px] text-[#475467]">
            <span>{draftSummary}</span>
            <Icon name={filtersOpen ? 'chevronUp' : 'chevronDown'} size={18} />
          </span>
        </button>

        {filtersOpen && (
          <div className="border-t border-[#e4e7ec] p-4 flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              {/* المورّدون */}
              <div className="flex flex-col gap-2 min-w-0">
                <label htmlFor="sup-q" className="text-[12.5px] font-bold text-[#344054]">{T.suppliers} — <span className="text-[#234ed6]">{draft.sups.length}</span> {T.selected}</label>
                <input id="sup-q" type="search" value={supQ} onChange={(e) => setSupQ(e.target.value)} placeholder={T.supSearch}
                  className={`w-full rounded-[10px] border border-[#d0d5dd] px-3 ${ctl} text-[13px] ${focusRing}`} />
                {draft.sups.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label={T.selected}>
                    {draft.sups.map((id) => (
                      <li key={id} className="inline-flex items-center gap-1 rounded-full bg-[#eef4ff] text-[#1d3eb0] ps-2.5 pe-1 py-0.5 text-[12px]">
                        <span dir="ltr">{supName(id)}</span>
                        <button type="button" onClick={() => setDraft({ sups: draft.sups.filter((x) => x !== id) })} aria-label={(en ? 'Remove ' : 'إزالة ') + supName(id)}
                          className={`w-6 h-6 max-md:w-9 max-md:h-9 rounded-full flex items-center justify-center hover:bg-[#dbe6ff] ${focusRing}`}><Icon name="x" size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-[10px] border border-[#e4e7ec] max-h-48 overflow-y-auto">
                  <div className="sticky top-0 bg-white flex gap-3 px-3 py-1.5 border-b border-[#e4e7ec] text-[12px]">
                    <button type="button" onClick={() => setDraft({ sups: [...new Set([...draft.sups, ...supList.map((s) => s.id)])] })} className="text-[#234ed6] hover:underline">{T.selectShown}</button>
                    <button type="button" onClick={() => setDraft({ sups: [] })} className="text-[#475467] hover:underline">{T.clearAll}</button>
                  </div>
                  {supList.map((s) => {
                    const on = draft.sups.includes(s.id);
                    return (
                      <label key={s.id} className={`flex items-center gap-2 px-3 py-1.5 max-md:py-3 cursor-pointer hover:bg-[#f9fafb] ${on ? 'bg-[#f5f8ff]' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => setDraft({ sups: on ? draft.sups.filter((y) => y !== s.id) : [...draft.sups, s.id] })} />
                        <span dir="ltr" className="text-[13px]">{s.name}</span>
                      </label>
                    );
                  })}
                  {suppliersLoading && !suppliers.length && <p className="text-[12px] text-[#667085] p-3 text-center">{T.supLoading}</p>}
                  {!suppliersLoading && suppliersError && <p role="alert" className="text-[12px] text-[#912018] p-3 text-center">{suppliersError}</p>}
                  {!suppliersLoading && !suppliersError && !supList.length && <p className="text-[12px] text-[#667085] p-3 text-center">{T.noSup}</p>}
                </div>
              </div>

              {/* العملة والمجموعات */}
              <div className="flex flex-col gap-4 min-w-0">
                <div className="flex flex-col gap-2">
                  <span id="ccy-lbl" className="text-[12.5px] font-bold text-[#344054]">{T.currency}</span>
                  <div role="group" aria-labelledby="ccy-lbl" className="flex flex-wrap gap-1 rounded-[10px] bg-[#f2f4f7] p-1 self-start">
                    {['all', ...CCYS].map((c) => {
                      const on = draft.ccy === c;
                      return (
                        <button key={c} type="button" aria-pressed={on} onClick={() => setDraft({ ccy: c })}
                          className={`rounded-[8px] px-3 h-[30px] max-md:h-11 text-[12.5px] font-semibold ${on ? 'bg-white text-[#101828] shadow-[0_1px_2px_rgba(16,24,40,.1)]' : 'text-[#475467]'} ${focusRing}`}>
                          <span dir="ltr">{c === 'all' ? T.all : c}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11.5px] text-[#667085]">{T.dateNote}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[12.5px] font-bold text-[#344054]">{T.savedSets}</span>
                  <p className="text-[11.5px] text-[#667085]">{T.savedSetsNote}</p>
                  {sets.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {sets.map((fs) => {
                        const summary = `${fs.sups.length} ${en ? 'supplier(s)' : 'مورد'} · ${fs.ccy === 'all' ? T.all : fs.ccy}`;
                        return (
                          <li key={fs.name} className="flex items-center gap-2">
                            <button type="button" onClick={() => applySet(fs)} aria-label={`${T.restore}${fs.name} (${summary})`}
                              className={`flex-1 text-start rounded-[9px] border border-[#e4e7ec] px-3 py-1.5 max-md:py-3 hover:bg-[#f9fafb] ${focusRing}`}>
                              <span className="font-semibold text-[12.5px]">{fs.name}</span> <span className="text-[11.5px] text-[#667085]">{summary}</span>
                            </button>
                            <button type="button" onClick={() => deleteSet(fs.name)} aria-label={T.del + fs.name}
                              className={`w-8 h-8 max-md:w-11 max-md:h-11 rounded-[9px] flex items-center justify-center text-[#912018] hover:bg-[#fef3f2] ${focusRing}`}><Icon name="trash" size={15} /></button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {savingSet ? (
                    <form onSubmit={saveSet} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-[12px] text-[#344054]">{T.setNameLabel}
                        <input ref={setNameRef} value={setName} maxLength={MAX_SET_NAME} onChange={(e) => { setSetName(e.target.value.slice(0, MAX_SET_NAME)); setSetErr(''); }}
                          placeholder={T.setNamePh} aria-invalid={!!setErr} aria-describedby={setErr ? 'set-err' : undefined}
                          className={`rounded-[9px] border border-[#d0d5dd] px-3 ${ctl} text-[13px] ${focusRing}`} />
                      </label>
                      <button type="submit" className={`rounded-[9px] bg-[#00283a] text-white px-3 ${ctl} text-[12.5px] font-bold hover:bg-[#003a52] ${focusRing}`}>{T.save}</button>
                      <button type="button" onClick={() => { setSavingSet(false); setSetName(''); setSetErr(''); }} className={`rounded-[9px] border border-[#d0d5dd] px-3 ${ctl} text-[12.5px] ${focusRing}`}>{T.cancel}</button>
                      {setErr && <p id="set-err" role="alert" className="w-full text-[12px] text-[#912018]">{setErr}</p>}
                    </form>
                  ) : (
                    <button type="button" disabled={!draft.sups.length} onClick={() => { setSavingSet(true); setSetErr(''); setTimeout(() => setNameRef.current?.focus(), 0); }}
                      className={`self-start rounded-[9px] border border-[#d0d5dd] px-3 ${ctl} text-[12.5px] font-semibold text-[#344054] hover:bg-[#f9fafb] disabled:opacity-45 ${focusRing}`}>{T.saveSet}</button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => run(draft)} disabled={loading}
                className={`rounded-[10px] bg-[#00283a] text-white px-5 h-[38px] max-md:h-11 text-[13.5px] font-bold hover:bg-[#003a52] disabled:opacity-60 ${focusRing}`}>{loading ? T.running : T.run}</button>
              <button type="button" onClick={reset} className={`rounded-[10px] border border-[#d0d5dd] bg-white px-4 h-[38px] max-md:h-11 text-[13px] font-semibold text-[#344054] hover:bg-[#f9fafb] ${focusRing}`}>{T.reset}</button>
              {runError && <p role="alert" className="text-[12.5px] text-[#912018]">{T.needSup}</p>}
            </div>
          </div>
        )}
      </section>

      {/* ══ تنبيهات الحالة ══ */}
      {cancelled && <div role="status" className="rounded-[10px] border border-[#c7d7fe] bg-[#f5f8ff] px-4 py-2.5 text-[13px] print:hidden">{T.cancelled}</div>}
      {dirty && !loading && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#fedf89] bg-[#fffaeb] px-4 py-2.5 text-[13px] text-[#93370d] print:hidden">
          <span>{T.dirty}</span>
          <button type="button" onClick={() => run(draft)} className={`rounded-[9px] bg-[#00283a] text-white px-3 ${ctl} text-[12.5px] font-bold ${focusRing}`}>{T.run}</button>
        </div>
      )}
      {!!results && error && !loading && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#fecdca] bg-[#fef3f2] px-4 py-2.5 text-[13px] text-[#912018]">
          <span>{T.stale}</span>
          <button type="button" onClick={() => run(draft)} className={`rounded-[9px] border border-[#fecdca] bg-white px-3 ${ctl} text-[12.5px] font-semibold ${focusRing}`}>{T.retry}</button>
        </div>
      )}

      {/* ══ الحالات قبل النتائج ══ */}
      {!results && !loading && !error && (
        <div className="rounded-[14px] border border-dashed border-[#d0d5dd] bg-white p-8 text-center">
          <p className="font-bold">{T.initialTitle}</p>
          <p className="mt-1 text-[13px] text-[#475467]">{T.initialBody}</p>
        </div>
      )}
      {!results && loading && (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">{T.running}</span>
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-[14px] bg-white border border-[#e4e7ec] animate-pulse" />)}
        </div>
      )}
      {!results && error && !loading && (
        <div role="alert" className="rounded-[14px] border border-[#fecdca] bg-[#fef3f2] p-6 text-center text-[#912018]">
          <p className="font-bold">{T.errTitle}</p>
          <p className="mt-1 text-[13px]">{T.errBody}</p>
          <button type="button" onClick={() => run(draft)} className={`mt-3 rounded-[9px] border border-[#fecdca] bg-white px-4 ${ctl} text-[13px] font-semibold ${focusRing}`}>{T.retry}</button>
        </div>
      )}

      {/* ══ النتائج ══ */}
      {results && ap && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-55' : ''}`} aria-busy={loading}>
          {/* ما طُبّق */}
          <div className="rounded-[14px] border border-[#e4e7ec] bg-white p-4 flex flex-col gap-2">
            <p className="text-[12px] text-[#667085]">{T.appliedTitle}</p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
              <div className="flex gap-1.5"><dt className="text-[#667085]">{T.suppliers} ({ap.sups.length}):</dt><dd dir="ltr" className="font-semibold">{ap.sups.map(supName).join('، ')}</dd></div>
              <div className="flex gap-1.5"><dt className="text-[#667085]">{T.currency}:</dt><dd dir="ltr" className="font-semibold">{ap.ccy === 'all' ? T.all : ap.ccy}</dd></div>
              {q && <div className="flex gap-1.5"><dt className="text-[#667085]">{T.search}:</dt><dd dir="auto" className="font-semibold">{q}</dd></div>}
            </dl>
            {extracted && <p className="text-[11.5px] text-[#667085]">{T.extractedAt}{extracted}</p>}
          </div>

          {noCcyAny && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#fedf89] bg-[#fffaeb] px-4 py-2.5 text-[13px] text-[#93370d]">
              <span>{T.noCcyAny(ap.ccy)}</span>
              <button type="button" onClick={() => { const d = { ...draft, ccy: 'all' }; setDraftState(d); run(d); }} className={`rounded-[9px] border border-[#fedf89] bg-white px-3 ${ctl} text-[12.5px] font-semibold ${focusRing}`}>{T.showAllCcy}</button>
            </div>
          )}

          {/* الملخّص حسب العملة */}
          {summary.length > 0 && (
            <section aria-labelledby="sum-h" className="rounded-[14px] border border-[#e4e7ec] bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 id="sum-h" className="text-[15px] font-extrabold">{T.sumTitle}</h2>
                <span className="text-[12px] text-[#667085]">{T.supCount(results.length)}</span>
              </div>
              <p className="text-[12px] text-[#475467] mb-2">{T.sumNote}</p>
              {summary.some((s) => s.missing) && <p className="text-[12px] text-[#93370d] bg-[#fffcf5] border border-[#fedf89] rounded-[9px] px-3 py-2 mb-2">{T.openingNANote}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead><tr className="text-[#475467] border-b border-[#e4e7ec]">
                    <th scope="col" className="py-2 px-2 text-start">{T.currency}</th>
                    <th scope="col" className="py-2 px-2 text-end">{T.opening}</th>
                    <th scope="col" className="py-2 px-2 text-end">{T.invoices}</th>
                    <th scope="col" className="py-2 px-2 text-end">{T.payments}</th>
                    <th scope="col" className="py-2 px-2 text-end">{T.credits}</th>
                    <th scope="col" className="py-2 px-2 text-end">{T.closing}</th>
                  </tr></thead>
                  <tbody>{summary.map((s) => (
                    <tr key={s.ccy} className="border-b last:border-0 border-[#f2f4f7] align-top">
                      <td className="py-2 px-2"><span dir="ltr" className="font-bold">{s.ccy}</span> <span className="text-[11.5px] text-[#667085]">{T.ledgers(s.ledgers)}</span></td>
                      <td className="py-2 px-2 text-end tabular-nums" dir="ltr">{fmt(s.opening)}{s.missing > 0 && <div className="text-[11px] text-[#93370d]" dir="auto">{T.knownOnly(s.missing)}</div>}</td>
                      <td className="py-2 px-2 text-end tabular-nums text-[#b42318]" dir="ltr">{fmt(s.invoices)}</td>
                      <td className="py-2 px-2 text-end tabular-nums text-[#027a48]" dir="ltr">{fmt(s.payments)}</td>
                      <td className="py-2 px-2 text-end tabular-nums text-[#1d3eb0]" dir="ltr">{fmt(s.credits)}</td>
                      <td className={`py-2 px-2 text-end tabular-nums font-bold ${s.closing != null && s.closing > 0 ? 'text-[#912018]' : 'text-[#05603a]'}`} dir="ltr">
                        {fmt(s.closing)}{s.missing > 0 && <div className="text-[11px] font-normal text-[#93370d]" dir="auto">{T.excludes(s.missing)}<span dir="ltr">{fmt(s.missingNet)}</span></div>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          {/* التصدير والطباعة والرابط */}
          <section aria-labelledby="exp-h" className="rounded-[14px] border border-[#e4e7ec] bg-white p-4 flex flex-col gap-2 print:hidden">
            <h2 id="exp-h" className="text-[15px] font-extrabold">{T.exportTitle}</h2>
            <p className="text-[12px] text-[#475467]">{T.exportScope(exportCount, order === 'desc' ? T.orderDesc : T.orderAsc, !!q)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportAll} disabled={!expSets.length} className={`inline-flex items-center gap-2 rounded-[9px] bg-[#3d8a67] text-white px-4 ${ctl} text-[12.5px] font-bold hover:bg-[#347a5b] disabled:opacity-45 ${focusRing}`}><Icon name="download" size={16} />{T.exportXlsx}</button>
              <button type="button" onClick={() => setPrintOpen(true)} className={`rounded-[9px] border border-[#d0d5dd] bg-white px-4 ${ctl} text-[12.5px] font-semibold hover:bg-[#f9fafb] ${focusRing}`}>{T.print}</button>
              <button type="button" onClick={copyLink} className={`rounded-[9px] border border-[#d0d5dd] bg-white px-4 ${ctl} text-[12.5px] font-semibold hover:bg-[#f9fafb] ${focusRing}`}>{T.copyLink}</button>
            </div>
            <p className="text-[11.5px] text-[#667085]">{T.linkNote}</p>
          </section>

          {/* شريط الجدول: بحث · ترتيب · حجم الصفحة */}
          <section className="rounded-[14px] border border-[#e4e7ec] bg-white p-4 flex flex-col gap-2 print:hidden">
            {jumpLinks.length > 1 && results.length > 1 && (
              <nav aria-label={T.jumpTitle} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="text-[#667085]">{T.jumpTitle}:</span>
                {jumpLinks.map((j) => (
                  <a key={j.anchor} href={`#${j.anchor}`} onClick={(e) => { e.preventDefault(); jumpTo(j.anchor); }}
                    className={`rounded-full border border-[#d0d5dd] px-2.5 py-1 max-md:py-2.5 hover:bg-[#f9fafb] ${focusRing}`}><span dir="ltr">{j.name} · {j.ccy}</span></a>
                ))}
              </nav>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <label htmlFor="txq" className="sr-only">{T.txSearch}</label>
                <input id="txq" ref={txqRef} type="search" value={txq} onChange={(e) => { setTxq(e.target.value); setPages({}); setOpenRow(null); }} placeholder={T.txSearch}
                  aria-describedby="txq-live" className={`w-full rounded-[10px] border border-[#d0d5dd] ps-3 pe-16 ${ctl} text-[13px] ${focusRing}`} />
                {txq && (
                  <button type="button" onClick={() => { setTxq(''); setPages({}); setOpenRow(null); txqRef.current?.focus(); }} aria-label={T.clearTxq}
                    className={`absolute top-1/2 -translate-y-1/2 end-1.5 rounded-[7px] px-2 h-7 text-[12px] text-[#475467] hover:bg-[#f2f4f7] ${focusRing}`}>{T.clear}</button>
                )}
              </div>
              <div role="group" aria-label={T.order} className="flex rounded-[10px] border border-[#d0d5dd] overflow-hidden">
                {(['asc', 'desc'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={order === k} onClick={() => { setOrder(k); setPages({}); }}
                    className={`px-3 ${ctl} text-[12.5px] font-semibold ${order === k ? 'bg-[#00283a] text-white' : 'bg-white text-[#344054]'} ${focusRing}`}>{k === 'asc' ? T.orderAsc : T.orderDesc}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-[#344054]">{T.pageSize}
                <select value={String(PS)} onChange={(e) => { setPageSize(+e.target.value); setPages({}); }} className={`rounded-[9px] border border-[#d0d5dd] px-2 ${ctl} ${focusRing}`}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <p id="txq-live" aria-live="polite" className="text-[12px] text-[#475467] min-h-[18px]">{q ? T.txMatch(exportCount, totalAll) : T.balNote}</p>
          </section>

          {/* الدفاتر */}
          {results.map((sec) => {
            const empty = emptyStateOf(sec, ap.ccy);
            const lgs = ledgersOf(sec, ap.ccy);
            return (
              <section key={sec.supplierId} aria-label={sec.supplierName} className="rounded-[14px] border border-[#e4e7ec] bg-white p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-extrabold" dir="ltr">{sec.supplierName}</h2>
                  <span className="text-[12px] text-[#667085]">{empty === 'noTx' ? T.noTx : `${T.ledgers(lgs.length)} · ${lgs.map((x) => x.currency).join(' / ')}`}</span>
                </div>
                {empty === 'noTx' && <p className="rounded-[10px] bg-[#f9fafb] p-4 text-center text-[13px] text-[#667085]">{T.noTx}</p>}
                {empty === 'otherCcy' && (
                  <div className="rounded-[10px] bg-[#f9fafb] p-4 text-center text-[13px] text-[#475467]">
                    <p>{T.noCcyTx} (<span dir="ltr">{sec.currencies.map((x) => x.currency).join(' / ')}</span>)</p>
                    <button type="button" onClick={() => { const d = { ...draft, ccy: 'all' }; setDraftState(d); run(d); }} className={`mt-2 rounded-[9px] border border-[#d0d5dd] bg-white px-3 ${ctl} text-[12.5px] font-semibold ${focusRing}`}>{T.showAllCcy}</button>
                  </div>
                )}
                {lgs.map((L) => {
                  const key = `${sec.supplierId}|${L.currency}`;
                  const anchor = `lg-${sec.supplierId}-${L.currency}`;
                  const matched = L.transactions.filter((t) => matchTx(t, q));
                  const ordered = orderRows(matched, order);
                  const nPages = Math.max(1, Math.ceil(ordered.length / PS));
                  const p = Math.min(pages[key] || 0, nPages - 1);
                  const slice = ordered.slice(p * PS, p * PS + PS);
                  const isNet = L.balanceBasis === 'net';
                  const setPage = (np: number) => setPages((s) => ({ ...s, [key]: np }));
                  const tp = sumDC(slice), tm = sumDC(matched), tf = sumDC(L.transactions);
                  const setOne = expSets.find((x) => x.sec.supplierId === sec.supplierId && x.L.currency === L.currency);
                  return (
                    <div key={L.currency} id={anchor} tabIndex={-1} className={`rounded-[12px] border border-[#e4e7ec] overflow-hidden ${focusRing}`}>
                      <div className="bg-[#f9fafb] px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span dir="ltr" className="rounded-full bg-[#00283a] text-white px-2.5 py-0.5 text-[12px] font-bold">{L.currency}</span>
                        <span className="text-[12px] font-bold text-[#344054]">{T.fullLedger}:</span>
                        <span className="text-[12px]">{T.opening}: <b dir="ltr" className={L.openingBalance == null ? 'text-[#b54708]' : ''}>{L.openingBalance == null ? T.openingNA : fmt(L.openingBalance)}</b></span>
                        <span className="text-[12px] text-[#b42318]">{T.invoices}: <b dir="ltr">{fmt(L.invoicesTotal)}</b></span>
                        <span className="text-[12px] text-[#027a48]">{T.payments}: <b dir="ltr">{fmt(L.paymentsTotal)}</b></span>
                        <span className="text-[12px] text-[#1d3eb0]">{T.credits}: <b dir="ltr">{fmt(L.creditsTotal)}</b></span>
                        {isNet
                          ? <span className="text-[12px] text-[#93370d]">{T.netClosing}: <b dir="ltr">{fmt(L.netMovement)}</b></span>
                          : <span className={`text-[12px] font-bold ${(L.closingBalance ?? 0) > 0 ? 'text-[#912018]' : 'text-[#05603a]'}`}>{T.closing}: <span dir="ltr">{fmt(L.closingBalance)} {L.currency}</span></span>}
                        {setOne && (
                          <button type="button" onClick={() => exportOne(setOne)} className={`ms-auto rounded-[8px] bg-[#3d8a67] text-white px-3 h-8 max-md:h-11 text-[12px] font-bold hover:bg-[#347a5b] print:hidden ${focusRing}`}>{T.exportLedger}</button>
                        )}
                      </div>
                      {isNet && <p className="px-3 py-2 text-[12px] text-[#93370d] bg-[#fffcf5] border-t border-[#fedf89]">{T.netBanner}</p>}
                      {!matched.length ? (
                        <p className="p-4 text-center text-[13px] text-[#667085]">{T.noMatch}</p>
                      ) : (
                        <>
                          <div className="overflow-x-auto max-h-[70vh]">
                            <table className="w-full min-w-[760px] text-[13px]">
                              <caption className="sr-only">{sec.supplierName} · {L.currency}</caption>
                              <thead className="sticky top-0 bg-white z-[1]"><tr className="text-[#475467] border-b border-[#e4e7ec]">
                                <th scope="col" className="w-9"><span className="sr-only">{T.details}</span></th>
                                <th scope="col" className="py-2 px-2 text-start">{T.colDate}</th>
                                <th scope="col" className="py-2 px-2 text-start">{T.colType}</th>
                                <th scope="col" className="py-2 px-2 text-start">{T.colDesc}</th>
                                <th scope="col" className="py-2 px-2 text-start">{T.colVessel}</th>
                                <th scope="col" className="py-2 px-2 text-end">{T.colDebit}</th>
                                <th scope="col" className="py-2 px-2 text-end">{T.colCredit}</th>
                                <th scope="col" className="py-2 px-2 text-end">{isNet ? T.netHead : T.colBalance}</th>
                              </tr></thead>
                              <tbody>
                                {slice.map((t) => {
                                  const rk = `${key}|${t.idx}`;
                                  const open = openRow === rk;
                                  return (
                                    <Fragment key={rk}>
                                      <tr className={`border-b border-[#f2f4f7] ${open ? 'bg-[#f5f8ff]' : ''}`}>
                                        <td className="px-1">
                                          <button type="button" onClick={() => setOpenRow(open ? null : rk)} aria-expanded={open} aria-label={`${T.details}: ${t.description}`}
                                            className={`w-8 h-8 max-md:w-11 max-md:h-11 rounded-[7px] flex items-center justify-center hover:bg-[#f2f4f7] ${focusRing}`}>
                                            <Icon name={open ? 'chevronDown' : (en ? 'chevronRight' : 'chevronLeft')} size={16} />
                                          </button>
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap tabular-nums" dir="ltr">{t.date}</td>
                                        <td className="py-2 px-2"><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${kindSty(t.kind)}`}>{kindLabel(T, t.kind)}</span></td>
                                        <td className="py-2 px-2" dir="auto">{t.description}</td>
                                        <td className="py-2 px-2 text-[#475467]" dir="ltr">{t.vessel || '—'}</td>
                                        <td className="py-2 px-2 text-end tabular-nums text-[#b42318]" dir="ltr">{t.debit ? fmt(t.debit) : '—'}</td>
                                        <td className="py-2 px-2 text-end tabular-nums text-[#027a48]" dir="ltr">{t.credit ? fmt(t.credit) : '—'}</td>
                                        <td className={`py-2 px-2 text-end tabular-nums font-bold ${t.balance > 0 ? 'text-[#912018]' : 'text-[#05603a]'}`} dir="ltr">{fmt(t.balance)}</td>
                                      </tr>
                                      {open && (
                                        <tr className="bg-[#f5f8ff] border-b border-[#f2f4f7]">
                                          <td />
                                          <td colSpan={7} className="py-2 px-2">
                                            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-[12.5px]">
                                              {[
                                                [T.colType, `${kindLabel(T, t.kind)} (${t.type})`, 'auto'],
                                                [T.colRef, t.ref || '—', 'ltr'],
                                                [T.colDate, t.date, 'ltr'],
                                                [T.colVessel, t.vessel || '—', 'ltr'],
                                                [T.amount, `${fmt(t.debit || t.credit)} ${t.currency}`, 'ltr'],
                                                [T.balAfter, `${fmt(t.balance)} ${t.currency}`, 'ltr'],
                                              ].map(([k, v, d]) => (
                                                <div key={k} className="flex gap-1.5"><dt className="text-[#667085]">{k}:</dt><dd dir={d as 'ltr' | 'auto'} className="font-semibold">{v}</dd></div>
                                              ))}
                                            </dl>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                              <tfoot className="text-[12px]">
                                {[
                                  { k: T.totPage(slice.length), t: tp, cls: 'text-[#344054]' },
                                  ...(q ? [{ k: T.totMatch(matched.length), t: tm, cls: 'text-[#1d3eb0]' }] : []),
                                  { k: T.totFull(L.transactions.length), t: tf, cls: 'text-[#00283a] font-bold' },
                                ].map((r) => (
                                  <tr key={r.k} className={`border-t border-[#e4e7ec] ${r.cls}`}>
                                    <th scope="row" colSpan={5} className="py-1.5 px-2 text-start font-semibold">{r.k}</th>
                                    <td className="py-1.5 px-2 text-end tabular-nums" dir="ltr">{fmt(r.t.debit)}</td>
                                    <td className="py-1.5 px-2 text-end tabular-nums" dir="ltr">{fmt(r.t.credit)}</td>
                                    <td />
                                  </tr>
                                ))}
                              </tfoot>
                            </table>
                          </div>
                          {nPages > 1 && (
                            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#e4e7ec] print:hidden">
                              <button type="button" disabled={p === 0} onClick={() => setPage(Math.max(0, p - 1))} className={`rounded-[8px] border border-[#d0d5dd] px-3 ${ctl} text-[12.5px] disabled:opacity-45 ${focusRing}`}>{T.prev}</button>
                              <span className="text-[12px] text-[#475467]" aria-live="polite">{T.page(p + 1, nPages)}</span>
                              <button type="button" disabled={p >= nPages - 1} onClick={() => setPage(Math.min(nPages - 1, p + 1))} className={`rounded-[8px] border border-[#d0d5dd] px-3 ${ctl} text-[12.5px] disabled:opacity-45 ${focusRing}`}>{T.next}</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* ══ الطباعة ══ */}
      {results && ap && (
        <PrintLayer
          open={printOpen} onClose={() => setPrintOpen(false)} en={en} T={T}
          meta={[
            [T.suppliers, ap.sups.map(supName).join('، '), 'ltr'],
            [T.currency, ap.ccy === 'all' ? summary.map((s) => s.ccy).join(' / ') : ap.ccy, 'ltr'],
            [T.search, q || '—', 'auto'],
            [T.extracted, extracted, 'auto'],
            [T.orderLbl, order === 'desc' ? T.orderDesc : T.orderAsc, 'auto'],
            [T.completeness, netCount ? T.incomplete(netCount) : T.complete, 'auto'],
          ]}
          ledgers={expSets.map((x) => ({
            key: `${x.sec.supplierId}|${x.L.currency}`, name: x.sec.supplierName, ccy: x.L.currency,
            balHead: x.L.balanceBasis === 'net' ? T.netHead : T.colBalance,
            stats: `${T.opening}: ${x.L.openingBalance == null ? T.openingNA : fmt(x.L.openingBalance)} · ${T.invoices}: ${fmt(x.L.invoicesTotal)} · ${T.payments}: ${fmt(x.L.paymentsTotal)} · ${T.credits}: ${fmt(x.L.creditsTotal)} · ${x.L.balanceBasis === 'net' ? `${T.netClosing}: ${fmt(x.L.netMovement)}` : `${T.closing}: ${fmt(x.L.closingBalance)}`} ${x.L.currency} · ${T.basisCol}: ${x.L.balanceBasis === 'net' ? T.basisNet : T.basisFull}`,
            rows: tableRows(x, labels),
          }))}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 inset-x-4 md:inset-x-auto md:end-6 md:max-w-sm z-50 rounded-[12px] bg-[#101828] text-white px-4 py-3 shadow-lg print:hidden">
          <div className="flex items-start gap-3">
            <div className="flex-1"><p className="font-bold text-[13px]">{toast.title}</p>{toast.sub && <p className="mt-0.5 text-[12px] text-[#cbd5e1]">{toast.sub}</p>}</div>
            <button type="button" onClick={() => setToast(null)} aria-label={T.close} className={`w-7 h-7 rounded-[7px] flex items-center justify-center hover:bg-white/10 ${focusRing}`}><Icon name="x" size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * ── طبقة الطباعة ──
 * ورقةٌ مطبوعةٌ دائمة الوجود ما دامت هناك نتائج (مخفيّةٌ على الشاشة)، فتعمل
 * الطباعة من زرّ الصفحة ومن Ctrl+P معاً. ونافذة المعاينة تُظهر الورقة نفسها
 * وتحبس التركيز، وEsc يُغلقها ويُعيد التركيز لمن فتحها، والتطبيق خلفها `inert`.
 *
 * وفي الطباعة: رؤوس الجداول تتكرّر، والسطر لا ينقسم — **ولا `break-inside`
 * على الدفتر كلّه**، فذلك كان يُنتج صفحاتٍ فارغة مع الدفاتر الطويلة.
 */
function PrintLayer({ open, onClose, en, T, meta, ledgers }: {
  open: boolean; onClose: () => void; en: boolean; T: typeof STX.ar | typeof STX.en;
  meta: [string, string, string][];
  ledgers: { key: string; name: string; ccy: string; balHead: string; stats: string; rows: (string | number)[][] }[];
}) {
  const dlgRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const others = Array.from(document.body.children).filter((el) => !(el as HTMLElement).dataset.printLayer) as HTMLElement[];
    others.forEach((el) => { el.inert = true; });
    setTimeout(() => (dlgRef.current?.querySelector('button') as HTMLElement | null)?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !dlgRef.current) return;
      const f = Array.from(dlgRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!f.length) return;
      const a = document.activeElement, first = f[0], last = f[f.length - 1];
      if (!dlgRef.current.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      others.forEach((el) => { el.inert = false; });
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [open, onClose]);

  // البوّابة تحتاج `document` — والطبقة لا تُعرض إلّا بعد نتائج في المتصفّح
  if (typeof document === 'undefined') return null;
  const head = [T.colDate, T.colRef, T.colType, T.colDesc, T.colVessel, T.colDebit, T.colCredit];
  const sheet = (
    <div data-print-sheet className="bg-white text-[#101828] p-6 max-w-[1100px] mx-auto" dir={en ? 'ltr' : 'rtl'}>
      <div className="flex items-center justify-between gap-4 border-b border-[#e4e7ec] pb-3">
        <h2 className="text-[20px] font-extrabold text-[#00283a]">{T.reportTitle}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ume-logo.svg" alt="UME" className="h-7 w-auto" />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mt-3">
        {meta.map(([k, v, d]) => <div key={k} className="flex gap-1.5"><dt className="text-[#667085]">{k}:</dt><dd dir={d as 'ltr' | 'auto'} className="font-semibold">{v}</dd></div>)}
      </dl>
      {ledgers.map((lg) => (
        <div key={lg.key} data-print-ledger className="mt-4">
          <h3 className="text-[14px] font-extrabold" dir="ltr">{lg.name} · {lg.ccy}</h3>
          <p className="text-[11.5px] text-[#475467]">{lg.stats}</p>
          <table className="w-full text-[11.5px] border-collapse mt-1">
            <thead><tr className="border-b border-[#d0d5dd]">{[...head, lg.balHead].map((h) => <th key={h} scope="col" className="py-1 px-1.5 text-start">{h}</th>)}</tr></thead>
            <tbody>
              {lg.rows.map((r, i) => (
                <tr key={i} className="border-b border-[#f2f4f7]">
                  <td className="py-1 px-1.5" dir="ltr">{r[2]}</td>
                  <td className="py-1 px-1.5" dir="ltr">{r[4] || '—'}</td>
                  <td className="py-1 px-1.5">{r[3]}</td>
                  <td className="py-1 px-1.5" dir="auto">{r[5]}</td>
                  <td className="py-1 px-1.5" dir="ltr">{r[6] || '—'}</td>
                  <td className="py-1 px-1.5 text-end" dir="ltr">{r[7] ? fmt(Number(r[7])) : '—'}</td>
                  <td className="py-1 px-1.5 text-end" dir="ltr">{r[8] ? fmt(Number(r[8])) : '—'}</td>
                  <td className="py-1 px-1.5 text-end font-semibold" dir="ltr">{fmt(Number(r[9]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="mt-4 text-[11px] text-[#667085]">{T.printFoot}</p>
    </div>
  );
  return createPortal(
    <>
      <style>{`
        @media print {
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          body:has(> [data-print-root]) > *:not([data-print-root]) { display: none !important; }
          [data-print-root] { display: block !important; position: static !important; }
          [data-print-sheet], [data-print-ledger] { display: block !important; box-shadow: none !important; max-width: none !important; }
          [data-print-sheet] { padding: 0 !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          h2, h3 { break-after: avoid; }
        }
      `}</style>
      <div data-print-root data-print-layer="1" className="hidden print:block">{sheet}</div>
      {open && (
        <div data-print-layer="1" className="fixed inset-0 z-[60] bg-[rgba(16,24,40,.55)] flex items-start justify-center overflow-auto p-4 print:hidden">
          <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={T.print} className="bg-white rounded-[14px] shadow-xl w-full max-w-[1100px]">
            <div className="sticky top-0 bg-white flex items-center justify-end gap-2 p-3 border-b border-[#e4e7ec] rounded-t-[14px]">
              <button type="button" onClick={() => window.print()} className="rounded-[9px] bg-[#00283a] text-white px-4 h-9 text-[13px] font-bold hover:bg-[#003a52] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">{T.printNow}</button>
              <button type="button" onClick={onClose} className="rounded-[9px] border border-[#d0d5dd] px-4 h-9 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">{T.close}</button>
            </div>
            {sheet}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
