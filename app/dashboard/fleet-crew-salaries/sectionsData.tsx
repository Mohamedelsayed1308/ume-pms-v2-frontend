'use client';
import { Fragment, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, Select, Table, TBody, TD, TH, THead, TR, useToast } from '@/components/ui';
import {
  FILE_TONE, MANUAL_KINDS, REVIEW_TONE, bulkAcceptable, fileTree, filenameFrom, fmtAmount, saveBlob, serverError,
  type CycleViewData, type Entry, type Extra, type FileRow, type Unresolved,
} from '@/lib/crewSalaries';
import { useCrewT } from '@/lib/crewSalariesI18n';
import ImportPanel from './ImportPanel';
import type { Act } from './CycleView';
import type { useReason } from './ReasonDialog';

type Ask = ReturnType<typeof useReason>['ask'];
export interface P { v: CycleViewData; act: Act; ask: Ask }

export const base = '/api/crew-salaries';
export const fmtDate = (s: string | null | undefined, lang: 'ar' | 'en') => (s ? new Date(s).toLocaleString(lang === 'en' ? 'en-GB' : 'ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short', numberingSystem: 'latn' }) : '—');
export const Amount = ({ v, c }: { v: string | null | undefined; c?: string | null }) => (
  <span dir="ltr" className="tabular-nums whitespace-nowrap">{fmtAmount(v)}{c && <span className="text-xs text-gray-500 ms-1">{c}</span>}</span>
);
const CURRENCIES = ['USD', 'EUR', 'EGP', 'GBP'];

export async function download(url: string, fallback: string, body?: unknown) {
  const r = body === undefined ? await api.get(url, { responseType: 'blob' }) : await api.post(url, body, { responseType: 'blob' });
  saveBlob(r.data, filenameFrom(r.headers?.['content-disposition'], fallback));
  return r;
}

/* ═════════════ ١) الملفّات والمراحل ═════════════ */
export function FilesSection({ v, reload }: P & { reload: () => void }) {
  const { t, tk, lang } = useCrewT();
  const toast = useToast();
  const [replacing, setReplacing] = useState<{ id: string; name: string } | null>(null);
  const tree = useMemo(() => fileTree(v.files), [v.files]);
  const get = async (f: FileRow) => {
    try { await download(`${base}/files/${f.id}/content`, f.name); } catch (e) { (await serverError(e, undefined, lang)).forEach((m) => toast.error(m)); }
  };
  const note = (c: FileRow) => {
    const bits = (c.flags || []).map((f) => tk('ffl', f));
    if (c.meta?.sheet_kind) bits.push(`${tk('sheet', c.meta.sheet_kind)}${c.meta.rows ? ` · ${c.meta.rows}` : ''}`);
    if (c.meta?.cfm_currency) bits.push(t('files.cfm', { cur: c.meta.cfm_currency, n: c.meta.rows ?? 0 }));
    if (c.meta?.pdf_kind === 'lashing_distribution') bits.push(t('pdf.lashing', { n: c.meta.rows ?? 0, rate: c.meta.rate ?? '—' }));
    return bits.join(' · ');
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('files.importTitle')} subtitle={t('files.importHint')} />
        <div className="p-4"><ImportPanel compact onDone={() => reload()} /></div>
      </Card>
      {tree.map(({ file, children }) => (
        <Card key={file.id}>
          <CardHeader
            title={<span dir="ltr" className="break-all">{file.name}</span>}
            subtitle={file.kind === 'email'
              ? `${file.meta?.subject || ''} · ${file.meta?.from || ''} · ${fmtDate(file.meta?.sent_at, lang)}`
              : file.kind === 'cfm' ? t('files.cfm', { cur: file.meta?.cfm_currency, n: file.meta?.rows ?? 0 }) : file.kind}
            action={(
              <div className="flex flex-wrap gap-2 justify-end">
                <Badge tone={FILE_TONE[file.status] || 'neutral'}>{tk('fst', file.status)}</Badge>
                <Button size="sm" variant="outline" icon="download" onClick={() => get(file)}>{t('original')}</Button>
                {file.status !== 'superseded' && <Button size="sm" variant="ghost" onClick={() => setReplacing(replacing?.id === file.id ? null : { id: file.id, name: file.name })}>{t('files.corrected')}</Button>}
              </div>
            )}
          />
          {replacing?.id === file.id && <div className="px-4 pt-3"><ImportPanel compact replaces={replacing} onDone={() => { setReplacing(null); reload(); }} /></div>}
          {file.meta?.inference && (
            <div className="px-4 py-2 text-xs text-gray-600 border-b">
              {(file.meta.inference.evidence || []).join(' · ')}
              {(file.meta.inference.conflicts?.length ?? 0) > 0 && <span className="text-red-700"> · {t('import.conflict')}: {file.meta.inference.conflicts?.join(' · ')}</span>}
            </div>
          )}
          {children.length > 0 && (
            <Table density="compact" minWidth={640}>
              <THead><TR><TH>#</TH><TH>{t('files.attachment')}</TH><TH>{t('status')}</TH><TH>{t('files.notes')}</TH><TH /></TR></THead>
              <TBody>
                {children.map((c) => (
                  <TR key={c.id}>
                    <TD className="tabular-nums">{(c.position ?? 0) + 1}</TD>
                    <TD><span dir="ltr" className="break-all">{c.name}</span></TD>
                    <TD><Badge tone={FILE_TONE[c.status] || 'neutral'}>{tk('fst', c.status)}</Badge></TD>
                    <TD className="text-xs text-gray-600">{note(c)}</TD>
                    <TD className="text-end whitespace-nowrap">
                      {(c.size ?? 0) > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => get(c)}>{t('download')}</Button>}
                      {c.meta?.cfm_currency && c.status !== 'superseded' && <Button size="sm" variant="ghost" onClick={() => setReplacing({ id: c.id, name: c.name })}>{t('files.corrected')}</Button>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {replacing && children.some((c) => c.id === replacing.id) && <div className="p-4"><ImportPanel compact replaces={replacing} onDone={() => { setReplacing(null); reload(); }} /></div>}
        </Card>
      ))}
      {tree.length === 0 && <Card><EmptyState icon="file" title={t('files.empty')} /></Card>}
    </div>
  );
}

/* ═════════════ قضايا المصدر المعلّقة ═════════════ */
function IssuesPanel({ v, act, ask }: P) {
  const { t, tk } = useCrewT();
  const cycleId = v.cycle.id;
  const [pick, setPick] = useState<Record<string, string>>({});
  const [cur, setCur] = useState<Record<string, string>>({});
  const [supp, setSupp] = useState<Record<string, { crew_id: string; name: string; currency: string; amount: string; kind: string }>>({});
  const open = v.unresolved.filter((u) => !u.resolution);
  const settled = v.unresolved.filter((u) => u.resolution);

  const resolve = async (u: Unresolved, action: 'excluded' | 'resolved') => {
    const reason = await ask({ title: `${action === 'excluded' ? t('issue.exclude') : t('issue.markResolved')}: ${tk('issue', u.kind)}`, hint: u.detail, danger: action === 'excluded' });
    if (!reason) return;
    await act('resolve', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'resolve', target_key: u.key, action, reason }), t('issue.resolved'));
  };
  const link = async (u: Unresolved) => {
    const id = pick[u.key] ?? u.candidates?.[0]?.crew_id ?? '';
    if (!id || !u.name) return;
    const reason = await ask({ title: t('match.confirmTitle', { name: u.name, id }), hint: t('match.confirmHint') });
    if (!reason) return;
    await act('link', () => api.post(`${base}/links`, { name: u.name, crew_id: id, reason, cycle_id: cycleId }), t('match.saved'));
  };
  const setCurrency = async (u: Unresolved) => {
    const c = cur[u.key]; if (!c) return;
    const reason = await ask({ title: t('curConfirm.title', { cur: c }), label: t('curConfirm.reason') });
    if (!reason) return;
    await act('cur', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_currency', target_key: u.key.replace(/:currency$/, ''), currency: c, reason }), t('save'));
  };
  const createSupp = async (u: Unresolved) => {
    const f = supp[u.key] || { crew_id: '', name: '', currency: u.amounts?.[0]?.currency || 'EUR', amount: u.amounts?.[0]?.amount || '', kind: 'lashing' };
    const reason = await ask({ title: t('supp.title', { amount: f.amount, cur: f.currency, id: f.crew_id }), label: t('supp.reason'), hint: u.detail });
    if (!reason) return;
    await act('supp', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'supplementary', target_key: u.key, supplementary: f, reason }), t('manual.saved'));
  };

  return (
    <Card>
      <CardHeader title={t('issues.title')} subtitle={t('issues.subtitle')} />
      {open.length === 0 && <p className="px-4 py-3 text-sm text-emerald-700">{t('issues.none')}</p>}
      <div className="divide-y">
        {open.map((u) => {
          const f = supp[u.key] || { crew_id: '', name: '', currency: u.amounts?.[0]?.currency || 'EUR', amount: u.amounts?.[0]?.amount || '', kind: 'lashing' };
          return (
            <div key={u.key} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{tk('issue', u.kind)}</Badge>
                <span className="text-sm">{u.detail}</span>
                {(u.amounts || []).map((a, i) => <Badge key={i}><span dir="ltr">{a.column}: {a.amount} {a.currency || '?'}</span></Badge>)}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {u.kind === 'email_row_no_id' && (
                  <>
                    <Field label={t('crew')}>
                      <Select id={`issue-crew-${u.key}`} value={pick[u.key] ?? u.candidates?.[0]?.crew_id ?? ''} onChange={(e) => setPick({ ...pick, [u.key]: e.target.value })}>
                        <option value="">{t('match.pick')}</option>
                        {(u.candidates || []).map((c) => <option key={c.crew_id} value={c.crew_id}>{c.crew_id} · {v.entries.find((e) => e.crew_id === c.crew_id)?.name || ''} ({Math.round(c.score * 100)}%)</option>)}
                        {v.entries.filter((e) => !u.candidates?.some((c) => c.crew_id === e.crew_id)).map((e) => <option key={e.key} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
                      </Select>
                    </Field>
                    <Button size="sm" onClick={() => link(u)}>{t('issue.link')}</Button>
                  </>
                )}
                {u.kind === 'email_row_unknown_currency' && (
                  <>
                    <Field label={t('currency')}>
                      <Select id={`issue-cur-${u.key}`} value={cur[u.key] || ''} onChange={(e) => setCur({ ...cur, [u.key]: e.target.value })}>
                        <option value="">{t('match.pick')}</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <Button size="sm" disabled={!cur[u.key]} onClick={() => setCurrency(u)}>{t('issue.setCurrency')}</Button>
                  </>
                )}
                {u.kind === 'note' && (
                  <fieldset className="flex flex-wrap items-end gap-2 border rounded-lg p-2">
                    <legend className="px-1 text-xs text-gray-600">{t('issue.createSupp')}</legend>
                    <Field label={t('crewId')} hint={t('supp.crewHint')}><Input id={`supp-id-${u.key}`} dir="ltr" className="w-28" value={f.crew_id} onChange={(e) => setSupp({ ...supp, [u.key]: { ...f, crew_id: e.target.value.trim() } })} /></Field>
                    <Field label={t('name')}><Input id={`supp-name-${u.key}`} value={f.name} onChange={(e) => setSupp({ ...supp, [u.key]: { ...f, name: e.target.value } })} /></Field>
                    <Field label={t('kind')}><Select id={`supp-kind-${u.key}`} value={f.kind} onChange={(e) => setSupp({ ...supp, [u.key]: { ...f, kind: e.target.value } })}>{MANUAL_KINDS.map((k) => <option key={k} value={k}>{tk('kind', k)}</option>)}</Select></Field>
                    <Field label={t('amount')}><Input id={`supp-amt-${u.key}`} dir="ltr" className="w-24" value={f.amount} onChange={(e) => setSupp({ ...supp, [u.key]: { ...f, amount: e.target.value } })} /></Field>
                    <Field label={t('currency')}><Select id={`supp-cur-${u.key}`} value={f.currency} onChange={(e) => setSupp({ ...supp, [u.key]: { ...f, currency: e.target.value } })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                    <Button size="sm" disabled={!/^\d+$/.test(f.crew_id) || !f.name.trim() || !/^\d+(\.\d+)?$/.test(f.amount)} onClick={() => createSupp(u)}>{t('add')}</Button>
                  </fieldset>
                )}
                {(u.kind === 'parse_issue' || u.kind === 'file') && <Button size="sm" variant="outline" onClick={() => resolve(u, 'resolved')}>{t('issue.markResolved')}</Button>}
                <Button size="sm" variant="ghost" onClick={() => resolve(u, 'excluded')}>{t('issue.exclude')}</Button>
              </div>
            </div>
          );
        })}
      </div>
      {settled.length > 0 && (
        <details className="px-4 py-3 border-t text-sm">
          <summary className="cursor-pointer text-gray-600">{t('issue.resolved')} ({settled.length})</summary>
          <ul className="mt-2 space-y-1">
            {settled.map((u) => <li key={u.key}><Badge tone={u.resolution!.action === 'excluded' ? 'neutral' : 'success'}>{u.resolution!.action === 'excluded' ? t('issue.excluded') : t('issue.resolved')}</Badge> {tk('issue', u.kind)} — {u.resolution!.reason}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}

/* ═════════════ ٢) البيانات المستخرجة والتسويات ═════════════ */
export function ExtractedSection({ v, act, ask }: P) {
  const { t, tk } = useCrewT();
  const [open, setOpen] = useState<string | null>(null);
  const cycleId = v.cycle.id;
  const pending = bulkAcceptable(v.entries);
  const review = async (x: Extra, decision: 'accepted' | 'rejected') => {
    const reason = decision === 'rejected' ? await ask({ title: t('rejectTitle', { kind: tk('kind', x.kind) }), danger: true, confirm: t('reject') }) : '';
    if (reason === null) return;
    await act('review', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_review', target_key: x.key, decision, reason }), decision === 'accepted' ? t('data.accepted') : t('data.rejected'));
  };
  const acceptAll = async () => {
    const reason = await ask({ title: t('data.bulkTitle', { n: pending.length }), label: t('data.note'), hint: t('data.bulkHint'), optional: true });
    if (reason === null) return;
    await act('bulk', async () => {
      for (const x of pending) await api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_review', target_key: x.key, decision: 'accepted', reason });
    }, t('data.acceptedN', { n: pending.length }));
  };
  return (
    <div className="space-y-4">
      <IssuesPanel v={v} act={act} ask={ask} />
      <Card>
        <CardHeader title={t('data.title')} subtitle={t('data.subtitle')}
          action={pending.length > 0 ? <Button size="sm" onClick={acceptAll}>{t('data.bulk', { n: pending.length })}</Button> : null} />
        <Table density="compact" minWidth={900}>
          <THead><TR><TH>{t('crewId')}</TH><TH>{t('name')}</TH><TH>{t('rank')}</TH><TH>{t('currency')}</TH><TH>{t('section')}</TH><TH>{t('service')}</TH><TH className="text-end">{t('days')}</TH><TH>{t('pendingItems')}</TH><TH>{t('dateConflicts')}</TH></TR></THead>
          <TBody>
            {v.entries.map((e) => {
              const pend = e.extras.filter((x) => x.review === 'pending').length;
              return (
                <Fragment key={e.key}>
                  <TR onClick={() => setOpen(open === e.key ? null : e.key)} className="cursor-pointer" selected={open === e.key} aria-expanded={open === e.key}>
                    <TD className="tabular-nums">{e.crew_id}</TD>
                    <TD dir="auto">{e.name}</TD>
                    <TD className="text-xs">{e.rank}</TD>
                    <TD>{e.contract_currency}{e.payment_currency_exception && <Badge tone="info" className="ms-1">→ {e.currency}</Badge>}</TD>
                    <TD className="text-xs">{tk('section', e.section)}</TD>
                    <TD dir="ltr" className="text-xs whitespace-nowrap">{e.result.service.start || '—'} → {e.result.service.end || '—'}</TD>
                    <TD className="text-end tabular-nums">{e.result.days ?? '—'}</TD>
                    <TD>{pend ? <Badge tone="warning">{pend}</Badge> : <span className="text-gray-400">—</span>}</TD>
                    <TD>{e.date_checks?.length ? <Badge tone="danger">{e.date_checks.length}</Badge> : <span className="text-gray-400">—</span>}</TD>
                  </TR>
                  {open === e.key && (
                    <tr><td colSpan={9} className="bg-gray-50 p-3"><EntryDetail e={e} v={v} act={act} ask={ask} review={review} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function EntryDetail({ e, v, act, ask, review }: P & { e: Entry; review: (x: Extra, d: 'accepted' | 'rejected') => void }) {
  const { t, tk } = useCrewT();
  const cycleId = v.cycle.id;
  const [field, setField] = useState('pay_end');
  const [value, setValue] = useState('');
  const [item, setItem] = useState({ kind: 'other_earning', amount: '', currency: e.currency });
  const [payCur, setPayCur] = useState(e.currency);
  const [classify, setClassify] = useState<Record<string, string>>({});
  const override = async () => {
    const reason = await ask({ title: t('override.confirm', { field: tk('field', field), key: e.key }), hint: value });
    if (!reason) return;
    await act('override', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'field_override', target_key: `${e.key}|${field}`, value, reason }), t('override.saved'));
  };
  const addItem = async () => {
    const reason = await ask({ title: t('manual.confirm', { kind: tk('kind', item.kind), amount: item.amount, cur: item.currency }), label: t('manual.reason') });
    if (!reason) return;
    await act('manual', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'manual_item', target_key: e.key, item, reason }), t('manual.saved'));
  };
  const setPayment = async () => {
    const reason = await ask({ title: t('paycur.confirm', { cur: payCur }), label: t('paycur.reason') });
    if (!reason) return;
    await act('paycur', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'payment_currency', target_key: e.key, currency: payCur, reason }), t('save'));
  };
  const doClassify = async (x: Extra) => {
    const k = classify[x.key]; if (!k) return;
    const reason = await ask({ title: t('classify.confirm', { name: x.reason || x.key, kind: tk('kind', k) }) });
    if (!reason) return;
    await act('classify', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_classify', target_key: x.key, item_kind: k, reason }), t('save'));
  };
  const confirmCurrency = async (x: Extra) => {
    const reason = await ask({ title: t('curConfirm.title', { cur: x.currency }), label: t('curConfirm.reason') });
    if (!reason) return;
    await act('cur', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_currency', target_key: x.key, currency: x.currency, reason }), t('save'));
  };
  return (
    <div className="space-y-3 text-sm">
      {e.date_checks?.map((c, i) => (
        <Callout key={i} tone="danger">{t('dateCheck', { field: tk('field', c.field), cfm: c.cfm, source: c.source, other: c.other, row: c.provenance?.row })}</Callout>
      ))}
      <Table density="compact" minWidth={760}>
        <THead><TR><TH>{t('kind')}</TH><TH>{t('source')}</TH><TH className="text-end">{t('amount')}</TH><TH>{t('reason')}</TH><TH>{t('review')}</TH><TH /></TR></THead>
        <TBody>
          {e.extras.length === 0 && <TR><TD colSpan={6} className="text-gray-400">{t('noExtras')}</TD></TR>}
          {e.extras.map((x) => (
            <TR key={x.key}>
              <TD>{tk('kind', x.kind)}{(x.flags || []).map((f) => <Badge key={f} tone="warning" className="ms-1">{tk('flag', f)}</Badge>)}</TD>
              <TD className="text-xs">{x.source}</TD>
              <TD className="text-end"><Amount v={x.amount} c={x.currency} /></TD>
              <TD className="text-xs max-w-[24rem]" dir="auto">{x.reason}</TD>
              <TD><Badge tone={REVIEW_TONE[x.review] || 'neutral'}>{tk('rev', x.review)}</Badge></TD>
              <TD className="text-end whitespace-nowrap">
                {x.kind === 'unclassified' ? (
                  <span className="inline-flex gap-1 items-center">
                    <Select id={`classify-${x.key}`} aria-label={t('classify')} value={classify[x.key] || ''} onChange={(ev) => setClassify({ ...classify, [x.key]: ev.target.value })}>
                      <option value="">{t('match.pick')}</option>{MANUAL_KINDS.map((k) => <option key={k} value={k}>{tk('kind', k)}</option>)}
                    </Select>
                    <Button size="sm" disabled={!classify[x.key]} onClick={() => doClassify(x)}>{t('classify')}</Button>
                  </span>
                ) : (
                  <>
                    {(x.flags || []).includes('currency_inferred') && <Button size="sm" variant="outline" onClick={() => confirmCurrency(x)}>{t('curConfirm')}</Button>}{' '}
                    <Button size="sm" variant="success" disabled={x.review === 'accepted'} onClick={() => review(x, 'accepted')}>{t('accept')}</Button>{' '}
                  </>
                )}
                <Button size="sm" variant="outline" disabled={x.review === 'rejected'} onClick={() => review(x, 'rejected')}>{t('reject')}</Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <p className="font-medium">{t('override.title')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('override.field')}><Select id={`ov-field-${e.key}`} value={field} onChange={(ev) => setField(ev.target.value)}>
              {['pay_start', 'pay_end', 'basic', 'fixed_ot', 'leave', 'signs_off'].map((f) => <option key={f} value={f}>{tk('field', f)}</option>)}
            </Select></Field>
            <Field label={t('override.value')}><Input id={`ov-value-${e.key}`} dir="ltr" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={field.startsWith('pay') ? 'YYYY-MM-DD' : field === 'signs_off' ? 'true / false' : ''} /></Field>
            <Button size="sm" disabled={!value} onClick={override}>{t('save')}</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <p className="font-medium">{t('manual.title')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('kind')}><Select id={`mi-kind-${e.key}`} value={item.kind} onChange={(ev) => setItem({ ...item, kind: ev.target.value })}>
              {MANUAL_KINDS.map((k) => <option key={k} value={k}>{tk('kind', k)}</option>)}
            </Select></Field>
            <Field label={t('amount')}><Input id={`mi-amt-${e.key}`} dir="ltr" className="w-24" value={item.amount} onChange={(ev) => setItem({ ...item, amount: ev.target.value })} /></Field>
            <Field label={t('currency')}><Input id={`mi-cur-${e.key}`} dir="ltr" className="w-20" value={item.currency} onChange={(ev) => setItem({ ...item, currency: ev.target.value.toUpperCase() })} /></Field>
            <Button size="sm" disabled={!/^\d+(\.\d+)?$/.test(item.amount)} onClick={addItem}>{t('add')}</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <p className="font-medium">{t('paycur.title')}</p>
          <p className="text-xs text-gray-500">{t('paycur.hint', { cur: e.contract_currency })}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('currency')}><Select id={`pc-${e.key}`} value={payCur} onChange={(ev) => setPayCur(ev.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Button size="sm" disabled={payCur === e.currency} onClick={setPayment}>{t('save')}</Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500">{t('provenance', { text: e.provenance?.map((p) => `${p.file || ''} / ${p.sheet} / ${t('row')} ${p.row}`).join(' · ') })}</p>
    </div>
  );
}
