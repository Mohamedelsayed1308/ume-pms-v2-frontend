'use client';
import { useMemo, useState } from 'react';
import api from '@/lib/api';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, Select, Table, TBody, TD, TH, THead, TR, cx, useToast } from '@/components/ui';
import {
  REVIEW_TONE, VERSION_TONE, currencyCards, entryBlockers, fmtAmount, serverError, usdPerUnit,
  type BankAccount, type BatchDecision, type Entry, type UnmatchedRow, type VersionRow, type VersionTotals,
} from '@/lib/crewSalaries';
import { useCrewT } from '@/lib/crewSalariesI18n';
import { Amount, base, download, fmtDate, type P } from './sectionsData';

function Blockers({ e }: { e: Entry }) {
  const { t, tk } = useCrewT();
  const b = entryBlockers(e);
  if (!b.length) return null;
  return <span className="text-xs text-gray-600">{b.map((x) => t(x.key as 'blk.diffs', { kind: x.vars?.kind ? tk('kind', x.vars.kind) : '' })).join(' · ')}</span>;
}

function ApprovalBadge({ e }: { e: Entry }) {
  const { t } = useCrewT();
  if (!e.approval) return null;
  return e.approval.changed
    ? <Badge tone="warning">{t('approval.changed', { n: e.approval.version_no })}</Badge>
    : <Badge tone="success">{t('approval.approved', { n: e.approval.version_no })}</Badge>;
}

/* ═════════════ ٣) الحساب والمطابقة والفروق ═════════════ */
export function CalcSection({ v, act, ask }: P) {
  const { t, tk } = useCrewT();
  const [onlyDiff, setOnlyDiff] = useState(true);
  const cycleId = v.cycle.id;
  const rows = v.entries.filter((e) => !onlyDiff || e.differences.length || e.source_conflicts.length || !e.result.complete);
  const ack = async (e: Entry) => {
    const hint = [...e.differences.map((d) => `${tk('kind', d.kind)}: ${d.diff == null ? t('diff.notComparable') : fmtAmount(d.diff)}`),
      ...e.source_conflicts.map((c) => t('conflict.row', { kind: tk('kind', c.kind), email: c.email, other: c.other, cur: c.currency, source: c.source }))].join(' · ');
    const reason = await ask({ title: t('diff.ackTitle', { id: e.crew_id }), hint, label: t('diff.ackReason') });
    if (!reason) return;
    await act('ack', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'difference_ack', target_key: e.key, hash: e.diff_hash, reason }), t('diff.ackSaved'));
  };
  const link = async (name: string, crewId: string) => {
    const reason = await ask({ title: t('match.confirmTitle', { name, id: crewId }), hint: t('match.confirmHint') });
    if (!reason) return;
    await act('link', () => api.post(`${base}/links`, { name, crew_id: crewId, reason, cycle_id: cycleId }), t('match.saved'));
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('calc.title')} subtitle={t('calc.subtitle')}
          action={<label className="flex items-center gap-2 text-sm"><input id="calc-only-diff" type="checkbox" checked={onlyDiff} onChange={(ev) => setOnlyDiff(ev.target.checked)} />{t('calc.onlyDiff')}</label>} />
        <div className="divide-y">
          {rows.length === 0 && <EmptyState icon="check" title={t('calc.none')} />}
          {rows.map((e) => (
            <div key={e.key} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <b className="tabular-nums">{e.crew_id}</b><span dir="auto">{e.name}</span><Badge>{e.currency}</Badge>
                {e.payment_currency_exception && <Badge tone="info">{t('paycur.exception', { cur: e.currency })}</Badge>}
                <ApprovalBadge e={e} />
                <span className="text-xs text-gray-500">{t('calc.days', { d: e.result.days ?? '—', rule: e.result.day_rule ? tk('rule', e.result.day_rule) : '—' })}</span>
                <span className="ms-auto">{t('calc.net')} <Amount v={e.result.balance} c={e.currency} /></span>
              </div>
              <Blockers e={e} />
              <Table density="compact" minWidth={760}>
                <THead><TR><TH>{t('kind')}</TH><TH>{t('calc.formula')}</TH><TH className="text-end">{t('amount')}</TH><TH>{t('calc.origRate')}</TH><TH>{t('review')}</TH><TH>{t('calc.counted')}</TH></TR></THead>
                <TBody>
                  {e.result.items.map((it) => (
                    <TR key={it.key}>
                      <TD>{tk('kind', it.kind)}</TD>
                      <TD className="text-xs" dir="auto">{it.formula || it.reason || ''}</TD>
                      <TD className="text-end">{it.amount == null ? <Badge tone="danger">{t('calc.blocked')}</Badge> : <Amount v={it.amount} c={it.currency} />}</TD>
                      <TD className="text-xs" dir="ltr">{it.original_currency !== it.currency ? `${fmtAmount(it.original_amount)} ${it.original_currency}${it.fx_rate ? ` × ${Number(it.fx_rate).toFixed(6)}` : ''}` : ''}</TD>
                      <TD><Badge tone={REVIEW_TONE[it.review] || 'neutral'}>{tk('rev', it.review)}</Badge></TD>
                      <TD>{it.counted ? t('yes') : <span className="text-gray-400">{t('no')}</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {(e.differences.length > 0 || e.source_conflicts.length > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="font-medium text-amber-900">{t('diff.title')}</p>
                    {e.differences_acknowledged ? <Badge tone="success">{t('diff.acked')}</Badge> : <Button size="sm" onClick={() => ack(e)}>{t('diff.ack')}</Button>}
                  </div>
                  {e.differences.length > 0 && (
                    <Table density="compact">
                      <THead><TR><TH>{t('kind')}</TH><TH className="text-end">{t('diff.calculated')}</TH><TH className="text-end">{t('diff.reported')}</TH><TH className="text-end">{t('diff.diff')}</TH></TR></THead>
                      <TBody>
                        {e.differences.map((d) => (
                          <TR key={d.kind}><TD>{tk('kind', d.kind)}</TD><TD className="text-end"><Amount v={d.calculated} c={e.contract_currency} /></TD><TD className="text-end"><Amount v={d.reported} /></TD><TD className="text-end">{d.diff == null ? t('diff.notComparable') : <b><Amount v={d.diff} /></b>}</TD></TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                  {e.source_conflicts.map((c, i) => (
                    <p key={i} className="text-sm mt-2">{t('conflict.row', { kind: tk('kind', c.kind), email: c.email, other: c.other, cur: c.currency, source: c.source })}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('match.title')} subtitle={t('match.subtitle')} />
        <MatchList title={t('match.payout')} rows={v.unmatched?.payout || []} nameOf={(r) => r.row.name} onLink={link} entries={v.entries} />
        <MatchList title={t('match.bank')} rows={v.unmatched?.bank_blocks || []} nameOf={(r) => r.row.beneficiary || r.row.name} onLink={link} entries={v.entries} />
        <MatchList title={t('match.lashing')} rows={v.unmatched?.lashing_pdf || []} nameOf={(r) => r.row.name} onLink={link} entries={v.entries} />
      </Card>
    </div>
  );
}

function MatchList({ title, rows, nameOf, onLink, entries }: { title: string; rows: UnmatchedRow[]; nameOf: (r: UnmatchedRow) => string; onLink: (n: string, id: string) => void; entries: Entry[] }) {
  const { t } = useCrewT();
  const [pick, setPick] = useState<Record<number, string>>({});
  if (!rows.length) return <p className="px-4 py-3 text-sm text-gray-500">{t('match.allLinked', { title })}</p>;
  const nameById = new Map(entries.map((e) => [e.crew_id, e.name]));
  return (
    <div className="px-4 py-3">
      <p className="font-medium mb-2">{t('match.unlinked', { title, n: rows.length })}</p>
      <Table density="compact" minWidth={640}>
        <THead><TR><TH>{t('row')}</TH><TH>{t('match.inFile')}</TH><TH>{t('rank')}</TH><TH>{t('match.suggested')}</TH><TH /></TR></THead>
        <TBody>
          {rows.map((r, i) => {
            const sel = pick[i] ?? r.match.candidates?.[0]?.crew_id ?? '';
            return (
              <TR key={i}>
                <TD className="tabular-nums">{r.row.provenance?.row ?? r.row.line ?? '—'}</TD>
                <TD dir="auto">{nameOf(r)}{r.row.eur ? <span className="text-xs text-gray-500"> · {r.row.eur} EUR</span> : null}</TD>
                <TD className="text-xs">{r.row.rank || r.row.label || ''}</TD>
                <TD>
                  <Select id={`match-${title}-${i}`} aria-label={t('match.suggested')} value={sel} onChange={(ev) => setPick({ ...pick, [i]: ev.target.value })}>
                    <option value="">{t('match.pick')}</option>
                    {r.match.candidates?.map((c) => <option key={c.crew_id} value={c.crew_id}>{c.crew_id} · {nameById.get(c.crew_id) || ''} ({Math.round(c.score * 100)}%)</option>)}
                    {entries.filter((e) => !r.match.candidates?.some((c) => c.crew_id === e.crew_id)).map((e) => <option key={e.key} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
                  </Select>
                </TD>
                <TD className="text-end"><Button size="sm" disabled={!sel} onClick={() => onLink(nameOf(r), sel)}>{t('match.confirm')}</Button></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

/* ═════════════ ٤) الحسابات والتفويضات ═════════════ */
const BANK_FIELDS = ['beneficiary', 'bank', 'branch', 'country', 'iban', 'account_number', 'swift'] as const;
const BANK_LABEL: Record<(typeof BANK_FIELDS)[number], string> = { beneficiary: 'bank.beneficiary', bank: 'bank.bank', branch: 'bank.branch', country: 'bank.country', iban: 'bank.iban', account_number: 'bank.account', swift: 'bank.swift' };

export function BankSection({ v, act, ask }: P) {
  const { t, tk } = useCrewT();
  const cycleId = v.cycle.id;
  const canApprove = v.permissions?.can_approve;
  const empty = { crew_id: '', beneficiary: '', bank: '', branch: '', country: '', iban: '', account_number: '', swift: '' };
  const [adding, setAdding] = useState<Record<string, string>>(empty);
  const [auth, setAuth] = useState<Record<string, string>>({ crew_id: '', beneficiary: '', relation: '', valid_from: '', valid_to: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const crews = useMemo(() => [...new Map(v.entries.map((e) => [e.crew_id, e])).values()], [v.entries]);
  const approvedAuths = (crew: string) => (v.authorizations || []).filter((z) => z.crew_id === crew && z.status === 'approved');

  const reviewAccount = async (acc: BankAccount, decision: 'approved' | 'rejected', isSeafarer?: boolean, authId?: string) => {
    const reason = await ask({ title: t('bank.reviewTitle', { action: decision === 'approved' ? t('approve') : t('reject'), id: acc.crew_id }), danger: decision === 'rejected',
      hint: `${acc.beneficiary} · ${acc.bank} · ${acc.iban || acc.account_number}` });
    if (!reason) return;
    await act('bank', () => api.post(`${base}/bank-accounts/${acc.id}/review`, { decision, beneficiary_is_seafarer: isSeafarer, authorization_id: authId, reason, cycle_id: cycleId }), decision === 'approved' ? t('bank.approved') : t('bank.rejectedT'));
  };
  const addAccount = async () => {
    const reason = await ask({ title: t('bank.addTitle', { id: adding.crew_id }), label: t('bank.addReason') });
    if (!reason) return;
    const ok = await act('addBank', () => api.post(`${base}/bank-accounts`, { ...adding, reason, cycle_id: cycleId }), t('bank.added'));
    if (ok) setAdding(empty);
  };
  const addAuth = async () => {
    if (!doc) return;
    const fd = new FormData();
    Object.entries(auth).forEach(([k, val]) => fd.append(k, val));
    fd.append('file', doc); fd.append('cycle_id', cycleId);
    const ok = await act('auth', () => api.post(`${base}/authorizations`, fd), t('auth.added'));
    if (ok) { setAuth({ crew_id: '', beneficiary: '', relation: '', valid_from: '', valid_to: '' }); setDoc(null); }
  };
  const reviewAuth = async (id: string, name: string, decision: string) => {
    const reason = await ask({ title: t('auth.reviewTitle', { action: decision === 'approved' ? t('approve') : decision === 'rejected' ? t('reject') : t('auth.revoke'), name }), danger: decision !== 'approved' });
    if (!reason) return;
    await act('authReview', () => api.post(`${base}/authorizations/${id}/review`, { decision, reason, cycle_id: cycleId }), t('auth.saved'));
  };

  return (
    <div className="space-y-4">
      {!canApprove && <Callout tone="info">{t('bank.approverOnly')} {v.permissions?.approver_configured ? '' : t('bank.approverMissing')}</Callout>}
      <Card>
        <CardHeader title={t('bank.title')} subtitle={t('bank.subtitle')}
          action={<Button size="sm" variant="outline" onClick={() => act('sync', () => api.post(`${base}/cycles/${cycleId}/bank-accounts/sync`), t('bank.synced'))}>{t('bank.sync')}</Button>} />
        <Table density="compact" minWidth={980}>
          <THead><TR><TH>{t('crewId')}</TH><TH>{t('crew')}</TH><TH>{t('status')}</TH><TH>{t('bank.beneficiary')}</TH><TH>{t('bank.bank')}</TH><TH>{t('bank.ibanOrAccount')}</TH><TH>{t('source')}</TH><TH /></TR></THead>
          <TBody>
            {crews.map((e) => {
              const accounts = e.accounts || [];
              if (!accounts.length) {
                return (
                  <TR key={e.crew_id}>
                    <TD className="tabular-nums">{e.crew_id}</TD><TD dir="auto">{e.name}</TD>
                    <TD><Badge tone="danger">{t('bank.none')}</Badge></TD>
                    <TD colSpan={5} className="text-xs text-gray-500">{e.bank_candidates?.length ? t('bank.candidates', { n: e.bank_candidates.length }) : t('bank.noData')}</TD>
                  </TR>
                );
              }
              return accounts.map((a, i) => (
                <TR key={a.id}>
                  <TD className="tabular-nums">{i === 0 ? e.crew_id : ''}</TD><TD dir="auto">{i === 0 ? e.name : ''}</TD>
                  <TD><Badge tone={a.status === 'approved' ? 'success' : a.status === 'imported' ? 'warning' : 'neutral'}>{tk('bank.status', a.status)}</Badge></TD>
                  <TD className="text-xs" dir="auto">{a.beneficiary}{a.beneficiary_is_seafarer === false && <Badge tone="info" className="ms-1">{t('bank.byAuth')}</Badge>}</TD>
                  <TD className="text-xs" dir="auto">{a.bank}{a.branch ? ` · ${a.branch}` : ''}</TD>
                  <TD dir="ltr" className="text-xs break-all">{a.iban || a.account_number}{a.swift ? ` · ${a.swift}` : ''}</TD>
                  <TD className="text-xs">{tk('bank.src', a.source)}</TD>
                  <TD className="text-end whitespace-nowrap">
                    {a.status === 'imported' && (
                      <>
                        <Button size="sm" variant="success" disabled={!canApprove} onClick={() => reviewAccount(a, 'approved', true)}>{t('bank.approveSelf')}</Button>{' '}
                        {approvedAuths(a.crew_id).map((z) => (
                          <Button key={z.id} size="sm" variant="outline" disabled={!canApprove} onClick={() => reviewAccount(a, 'approved', false, z.id)}>{t('bank.approveAuth', { name: z.beneficiary })}</Button>
                        ))}{' '}
                        <Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAccount(a, 'rejected')}>{t('reject')}</Button>
                      </>
                    )}
                  </TD>
                </TR>
              ));
            })}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('bank.add')} subtitle={t('bank.addHint')} />
          <div className="p-4 grid gap-2 sm:grid-cols-2">
            <Field label={t('crewId')} required><Select id="bank-add-crew" value={adding.crew_id} onChange={(ev) => setAdding({ ...adding, crew_id: ev.target.value })}>
              <option value="">{t('match.pick')}</option>{crews.map((e) => <option key={e.crew_id} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
            </Select></Field>
            {BANK_FIELDS.map((k) => (
              <Field key={k} label={t(BANK_LABEL[k] as 'bank.bank')}>
                <Input id={`bank-add-${k}`} dir={['iban', 'account_number', 'swift'].includes(k) ? 'ltr' : undefined} value={adding[k]} onChange={(ev) => setAdding({ ...adding, [k]: ev.target.value })} />
              </Field>
            ))}
            <div className="sm:col-span-2"><Button disabled={!adding.crew_id || !adding.beneficiary || !adding.bank || !(adding.iban || adding.account_number)} onClick={addAccount}>{t('bank.register')}</Button></div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />
          <div className="p-4 grid gap-2 sm:grid-cols-2">
            <Field label={t('crewId')} required><Select id="auth-crew" value={auth.crew_id} onChange={(ev) => setAuth({ ...auth, crew_id: ev.target.value })}>
              <option value="">{t('match.pick')}</option>{crews.map((e) => <option key={e.crew_id} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
            </Select></Field>
            <Field label={t('bank.beneficiary')} required><Input id="auth-beneficiary" value={auth.beneficiary} onChange={(ev) => setAuth({ ...auth, beneficiary: ev.target.value })} /></Field>
            <Field label={t('auth.relation')}><Input id="auth-relation" value={auth.relation} onChange={(ev) => setAuth({ ...auth, relation: ev.target.value })} /></Field>
            <Field label={t('auth.doc')} required><input id="auth-doc" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(ev) => setDoc(ev.target.files?.[0] || null)} className="block w-full text-sm" /></Field>
            <Field label={t('auth.from')}><Input id="auth-from" type="date" value={auth.valid_from} onChange={(ev) => setAuth({ ...auth, valid_from: ev.target.value })} /></Field>
            <Field label={t('auth.to')}><Input id="auth-to" type="date" value={auth.valid_to} onChange={(ev) => setAuth({ ...auth, valid_to: ev.target.value })} /></Field>
            <div className="sm:col-span-2"><Button disabled={!auth.crew_id || !auth.beneficiary || !doc} onClick={addAuth}>{t('auth.register')}</Button></div>
          </div>
          {(v.authorizations || []).length > 0 && (
            <Table density="compact">
              <THead><TR><TH>{t('crew')}</TH><TH>{t('bank.beneficiary')}</TH><TH>{t('auth.validity')}</TH><TH>{t('status')}</TH><TH /></TR></THead>
              <TBody>
                {v.authorizations.map((z) => (
                  <TR key={z.id}>
                    <TD className="tabular-nums">{z.crew_id}</TD><TD dir="auto">{z.beneficiary}{z.relation ? ` (${z.relation})` : ''}</TD>
                    <TD dir="ltr" className="text-xs">{z.valid_from || '…'} → {z.valid_to || '…'}</TD>
                    <TD><Badge tone={z.status === 'approved' ? 'success' : z.status === 'pending' ? 'warning' : 'neutral'}>{tk('auth.status', z.status)}</Badge></TD>
                    <TD className="text-end whitespace-nowrap">
                      {z.status === 'pending' && <><Button size="sm" variant="success" disabled={!canApprove} onClick={() => reviewAuth(z.id, z.beneficiary, 'approved')}>{t('approve')}</Button>{' '}<Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAuth(z.id, z.beneficiary, 'rejected')}>{t('reject')}</Button></>}
                      {z.status === 'approved' && <Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAuth(z.id, z.beneficiary, 'revoked')}>{t('auth.revoke')}</Button>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ═════════════ ٥) المراجعة والاعتماد ═════════════ */
export function ApprovalSection({ v, act, ask }: P) {
  const { t, tk, lang } = useCrewT();
  const cycleId = v.cycle.id;
  const perm = v.permissions || { approver_configured: false, can_approve: false, can_edit_fx: false };
  const [rate, setRate] = useState<Record<string, string>>({});
  const eligible = v.entries.filter((e) => e.eligible);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selected = chosen ?? new Set(eligible.map((e) => e.key));
  const notReady = v.entries.filter((e) => !e.eligible && !(e.approval && !e.approval.changed));
  const already = v.entries.filter((e) => e.approval && !e.approval.changed);
  const needFx = useMemo(() => {
    // كلّ عملةٍ غير الدولار في زوج تحويل — السعر يُخزَّن مقابل الدولار
    const s = new Set<string>();
    for (const e of v.entries) for (const it of e.result.items) {
      if (it.original_currency === it.currency) continue;
      for (const c of [it.original_currency, it.currency]) if (c !== 'USD') s.add(c);
    }
    return [...s].sort();
  }, [v.entries]);
  const latest = v.versions?.[0];

  const setFx = async (cur: string) => {
    const reason = await ask({ title: t('fx.confirm', { month: v.cycle.month, cur, rate: rate[cur] }), label: t('fx.reason'), hint: t('fx.hint') });
    if (!reason) return;
    await act('fx', () => api.put(`${base}/fx`, { month: v.cycle.month, currency: cur, usd_per_unit: rate[cur], reason }), t('fx.saved'));
  };
  const submit = async () => {
    const keys = eligible.filter((e) => selected.has(e.key)).map((e) => e.key);
    const reason = await ask({ title: t('ready.submitTitle', { n: keys.length }), label: t('ready.submitReason'), hint: t('ready.submitHint') });
    if (!reason) return;
    const ok = await act('submit', () => api.post(`${base}/cycles/${cycleId}/submit`, { reason, keys }), t('ready.submitted'));
    if (ok) setChosen(null);
  };
  const decide = async (ver: VersionRow, d: 'approve' | 'reject') => {
    const reason = await ask({ title: t(d === 'approve' ? 'versions.approveTitle' : 'versions.rejectTitle', { n: ver.version_no }), danger: d === 'reject', label: t(d === 'approve' ? 'versions.approveReason' : 'versions.rejectReason') });
    if (!reason) return;
    await act(d, () => api.post(`${base}/versions/${ver.id}/${d}`, { reason }), t(d === 'approve' ? 'versions.approved' : 'versions.rejected'));
  };
  const toggle = (k: string) => { const s = new Set(selected); if (s.has(k)) s.delete(k); else s.add(k); setChosen(s); };
  const count = eligible.filter((e) => selected.has(e.key)).length;

  return (
    <div className="space-y-4">
      <Callout tone={perm.can_approve ? 'success' : 'info'}>
        {!perm.approver_configured ? t('appr.none') : perm.can_approve ? t('appr.you') : t('appr.other')}
      </Callout>

      <Card>
        <CardHeader title={t('fx.title', { month: v.cycle.month })} subtitle={t('fx.subtitle')} />
        <div className="p-4 space-y-2">
          {(v.fx?.labels || []).map((l) => <p key={l} dir="ltr" className="text-sm tabular-nums">{l}</p>)}
          {needFx.length === 0 && <p className="text-sm text-gray-500">{t('fx.none')}</p>}
          {needFx.length > 0 && !perm.can_edit_fx && <Callout tone="info">{t('fx.noEdit')}</Callout>}
          {perm.can_edit_fx && needFx.map((cur) => (
            <div key={cur} className="flex flex-wrap items-end gap-2" dir="ltr">
              <label htmlFor={`fx-${cur}`} className="text-sm">1 {cur} =</label>
              <Input id={`fx-${cur}`} className="w-32" value={rate[cur] ?? usdPerUnit(v.fx?.per_usd?.[cur]) ?? ''} onChange={(ev) => setRate({ ...rate, [cur]: ev.target.value })} />
              <span className="text-sm">USD</span>
              <Button size="sm" disabled={!/^\d+(\.\d{1,6})?$/.test(rate[cur] || '')} onClick={() => setFx(cur)}>{t('fx.save')}</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('ready.title')} subtitle={t('ready.subtitle')}
          action={<Button onClick={submit} disabled={!count || v.blocking?.length > 0}>{t('ready.submit', { n: count })}</Button>} />
        <div className="p-4 space-y-3 text-sm">
          <fieldset>
            <legend className="font-medium mb-1">{t('ready.eligible', { n: eligible.length })}</legend>
            {eligible.length > 1 && <Button size="sm" variant="ghost" onClick={() => setChosen(null)}>{t('ready.selectAll')}</Button>}
            <ul className="space-y-1">
              {eligible.map((e) => (
                <li key={e.key} className="flex flex-wrap items-center gap-2">
                  <input id={`sub-${e.key}`} type="checkbox" checked={selected.has(e.key)} onChange={() => toggle(e.key)} />
                  <label htmlFor={`sub-${e.key}`} className="tabular-nums">{e.crew_id}</label> <span dir="auto">{e.name}</span> <Amount v={e.result.balance} c={e.currency} />
                  {e.approval?.changed && <Badge tone="warning">{t('ready.revision', { n: e.approval.version_no })}</Badge>}
                </li>
              ))}
            </ul>
          </fieldset>
          {notReady.length > 0 && (
            <details open>
              <summary className="font-medium cursor-pointer">{t('ready.notReady', { n: notReady.length })}</summary>
              <ul className="mt-1 space-y-1">{notReady.map((e) => <li key={e.key}><b className="tabular-nums">{e.crew_id}</b> <span dir="auto">{e.name}</span>: <Blockers e={e} /></li>)}</ul>
            </details>
          )}
          {already.length > 0 && (
            <details>
              <summary className="font-medium cursor-pointer">{t('ready.already', { n: already.length })}</summary>
              <ul className="mt-1 space-y-1">{already.map((e) => <li key={e.key}><b className="tabular-nums">{e.crew_id}</b> <span dir="auto">{e.name}</span> <ApprovalBadge e={e} /></li>)}</ul>
            </details>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('versions.title')} subtitle={t('versions.subtitle')} />
        {!v.versions?.length ? <EmptyState icon="file" title={t('versions.none')} /> : (
          <Table density="compact" minWidth={960}>
            <THead><TR><TH>#</TH><TH>{t('status')}</TH><TH>{t('versions.scope')}</TH><TH>{t('versions.totals')}</TH><TH>{t('versions.by')}</TH><TH>{t('versions.decision')}</TH><TH /></TR></THead>
            <TBody>
              {v.versions.map((ver) => (
                <TR key={ver.id}>
                  <TD className="tabular-nums">{ver.version_no}</TD>
                  <TD><Badge tone={VERSION_TONE[ver.status] || 'neutral'}>{tk('vst', ver.status)}</Badge>{ver.totals?._partial ? <Badge tone="warning" className="ms-1">{t('partial')}</Badge> : null}</TD>
                  <TD className="text-xs">{t('versions.scopeLine', { n: ver.entries ?? '—', x: ver.excluded ?? 0 })}</TD>
                  <TD className="text-xs">{currencyCards(ver.totals).map(({ currency, t: x }) => { const y = x as VersionTotals; return <div key={currency} dir="ltr">{fmtAmount(y.balance)} {currency} · {y.payable}/{y.count}</div>; })}</TD>
                  <TD className="text-xs">{ver.submitted_by_name} · {fmtDate(ver.submitted_at, lang)}<div className="text-gray-500" dir="auto">{ver.submit_reason}</div></TD>
                  <TD className="text-xs">{ver.decided_by_name ? <>{ver.decided_by_name} · {fmtDate(ver.decided_at, lang)}<div className="text-gray-500" dir="auto">{ver.decision_reason}</div></> : '—'}</TD>
                  <TD className="text-end whitespace-nowrap">
                    {ver.status === 'submitted' && ver.id === latest?.id && (
                      <><Button size="sm" variant="success" disabled={!perm.can_approve} onClick={() => decide(ver, 'approve')}>{t('approve')}</Button>{' '}
                        <Button size="sm" variant="outline" disabled={!perm.can_approve} onClick={() => decide(ver, 'reject')}>{t('reject')}</Button></>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ═════════════ ٦) التصدير وسجلّ الإصدارات ═════════════ */

/** حالاتٌ خرجت ثمّ تغيّرت — «خرج» ليس «صُرف»: المالك يقرّر لكلّ حالة، ولا خصم ولا إعادة آليّة. */
function BatchDecisions({ v, act, ask }: P) {
  const { t } = useCrewT();
  const rows = v.batch_decisions || [];
  const [choice, setChoice] = useState<Record<string, { action: string; amount: string }>>({});
  if (!rows.length) return null;
  const canDecide = v.permissions.can_approve;
  const record = async (d: BatchDecision) => {
    const c = choice[d.row_id] || { action: '', amount: '' };
    if (!c.action) return;
    const reason = await ask({
      title: t(`batch.act.${c.action}` as 'batch.act.keep'),
      label: t(`batch.reason.${c.action}` as 'batch.reason.keep'),
      hint: `${d.crew_id} · ${d.name} — ${d.prior.map((p) => `${p.batch_no}: ${fmtAmount(p.amount)} ${p.currency}`).join(' + ')}`,
    });
    if (!reason) return;
    await act('batch', () => api.post(`${base}/cycles/${v.cycle.id}/decisions`, {
      // الحالة كما عُرضت: الخادم يرفض القرار (409) إن تغيّرت منذ عرضها — إصدارٌ أحدث أو مبلغٌ أو حسابٌ أو عملة
      kind: 'batch_resolution', row_id: d.row_id, entry_key: d.entry_key, expected_hash: d.entry_hash, expected_version_id: d.version_id, action: c.action, amount: c.action === 'settle' ? c.amount : undefined, reason,
    }), t('batch.saved'));
  };
  return (
    <Card>
      <CardHeader title={t('batch.title')} subtitle={t('batch.subtitle')} />
      {!canDecide && <div className="px-4 pt-3"><Callout tone="neutral">{t('batch.ownerOnly')}</Callout></div>}
      <Table density="compact" minWidth={900}>
        <THead><TR>
          <TH>{t('batch.crew')}</TH><TH>{t('batch.prior')}</TH><TH className="text-end">{t('batch.now')}</TH><TH>{t('batch.change')}</TH><TH>{t('batch.state')}</TH>
          {canDecide && <TH>{t('batch.action')}</TH>}
        </TR></THead>
        <TBody>
          {rows.map((d) => {
            const c = choice[d.row_id] || { action: '', amount: '' };
            const set = (x: Partial<typeof c>) => setChoice((s) => ({ ...s, [d.row_id]: { ...c, ...x } }));
            return (
              <TR key={d.row_id}>
                <TD><div className="text-sm">{d.name}</div><div dir="ltr" className="text-xs text-gray-500">{d.crew_id} · {d.currency} · V{d.version_no}</div></TD>
                <TD className="text-xs">{d.prior.map((p) => <div key={p.batch_no + p.amount}><span dir="ltr">{p.batch_no}</span>: <Amount v={p.amount} /> {p.currency}</div>)}</TD>
                <TD className="text-end"><Amount v={d.balance} /> {d.currency}</TD>
                <TD className="text-xs">{[d.amount_changed && t('batch.change.amount'), d.bank_changed && t('batch.change.bank')].filter(Boolean).join(' · ') || '—'}</TD>
                <TD>
                  <Badge tone={d.state === 'pending' ? 'warning' : 'neutral'}>{t(`batch.state.${d.state}` as 'batch.state.pending')}</Badge>
                  {d.resolution && <div className="mt-1 text-xs text-gray-600">{d.resolution.decided_by_name}: {d.resolution.reason}{d.resolution.amount ? ` (${d.resolution.amount})` : ''}</div>}
                </TD>
                {canDecide && (
                  <TD>
                    <div className="flex flex-wrap items-end gap-2">
                      <Select aria-label={t('batch.action')} value={c.action} onChange={(e) => set({ action: e.target.value })} className="max-w-[18rem]">
                        <option value="">—</option>
                        {(['replace', 'settle', 'keep'] as const).map((a) => <option key={a} value={a}>{t(`batch.act.${a}`)}</option>)}
                      </Select>
                      {c.action === 'settle' && <Input aria-label={t('batch.amount')} inputMode="decimal" dir="ltr" className="w-28" placeholder={t('batch.amount')} value={c.amount} onChange={(e) => set({ amount: e.target.value })} />}
                      <Button size="sm" disabled={!c.action || (c.action === 'settle' && !(Number(c.amount) > 0))} onClick={() => record(d)}>{t('batch.save')}</Button>
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

export function ExportSection({ v, act, ask }: P) {
  const { t, lang } = useCrewT();
  const toast = useToast();
  const cycleId = v.cycle.id;
  const [busy, setBusy] = useState('');
  const payable = (v.versions || []).filter((x) => x.status === 'approved' || (x.status === 'superseded' && x.decided_by_name));
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await act('reload', async () => undefined); }
    catch (e) { (await serverError(e, t('export.failed'), lang)).forEach((m) => toast.error(m)); }
    finally { setBusy(''); }
  };
  const lines = v.export_rows || [];
  return (
    <div className="space-y-4">
      <BatchDecisions v={v} act={act} ask={ask} />
      <Card>
        <CardHeader title={t('export.title')} subtitle={t('export.subtitle')} />
        <div className="p-4 space-y-3">
          <Button variant="outline" icon="download" loading={busy === 'review'} onClick={() => run('review', () => download(`${base}/cycles/${cycleId}/export/review`, 'crew-salaries-review.xlsx'))}>{t('export.review')}</Button>
          {!payable.length ? <Callout tone="neutral">{t('export.noApproved')}</Callout> : payable.map((ver) => (
            <div key={ver.id} className={cx('flex flex-wrap items-center gap-2', ver.status === 'superseded' && 'opacity-80')}>
              <span className="text-sm">{t('export.version', { n: ver.version_no })}</span>
              {ver.status === 'superseded' && <Badge>{t('export.historical')}</Badge>}
              {(ver.currencies || []).map((c) => (
                <Button key={c} size="sm" variant={ver.status === 'approved' ? 'primary' : 'outline'} icon="download" loading={busy === `${ver.id}:${c}`} onClick={() => run(`${ver.id}:${c}`, async () => {
                  const r = await download(`${base}/cycles/${cycleId}/export/payments`, `crew-salaries-${c}.xlsx`, { currency: c, version_id: ver.id });
                  if (r.headers?.['x-historical'] === '1') toast.info(t('export.historicalToast'));
                  else if (r.headers?.['x-redownload'] === '1') toast.info(t('export.redownload'));
                  const pending = Number(r.headers?.['x-pending-decisions'] || 0);
                  if (pending > 0) toast.info(t('export.pendingToast', { n: pending }));
                })}>{c}</Button>
              ))}
            </div>
          ))}
          {v.changed_since_approval && <Callout tone="warning">{t('export.changed')}</Callout>}
          <p className="text-xs text-gray-500">{t('export.generic')}</p>
        </div>
        {v.exports?.length > 0 && (
          <Table density="compact" minWidth={820}>
            <THead><TR><TH>{t('time')}</TH><TH>{t('export.kind')}</TH><TH>{t('export.batch')}</TH><TH>{t('currency')}</TH><TH className="text-end">{t('export.rows')}</TH><TH>{t('export.by')}</TH><TH><span className="sr-only">{t('export.download')}</span></TH></TR></THead>
            <TBody>
              {v.exports.map((x) => (
                <TR key={x.id}>
                  <TD className="text-xs">{fmtDate(x.exported_at, lang)}</TD>
                  <TD className="text-xs">{x.kind === 'review' ? t('export.kind.review') : x.is_redownload ? t('export.kind.payAgain') : t('export.kind.pay')}</TD>
                  <TD dir="ltr" className="text-xs">{x.batch_no}</TD><TD>{x.currency || '—'}</TD>
                  <TD className="text-end tabular-nums">{x.row_count}</TD><TD className="text-xs">{x.exported_by_name}</TD>
                  <TD>
                    {x.kind === 'approved_payments' && !x.is_redownload && (
                      <Button size="sm" variant="ghost" icon="download" aria-label={`${t('export.download')} ${x.batch_no}`} loading={busy === `x:${x.id}`}
                        onClick={() => run(`x:${x.id}`, async () => { await download(`${base}/exports/${x.id}/file`, `${x.batch_no}.xlsx`); toast.info(t('export.redownload')); })} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {lines.length > 0 && (
        <Card>
          <CardHeader title={t('batch.lines')} subtitle={t('export.generic')} />
          <Table density="compact" minWidth={760}>
            <THead><TR><TH>{t('export.batch')}</TH><TH>{t('batch.crew')}</TH><TH>{t('currency')}</TH><TH className="text-end">{t('batch.balanceAtIssue')}</TH><TH className="text-end">{t('batch.out')}</TH><TH>{t('export.kind')}</TH><TH>{t('batch.state')}</TH></TR></THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.id} className={cx(l.status === 'replaced' && 'opacity-60')}>
                  <TD dir="ltr" className="text-xs">{l.batch_no}</TD><TD dir="ltr" className="text-xs">{l.crew_id}</TD><TD>{l.currency}</TD>
                  <TD className="text-end"><Amount v={l.balance} /></TD><TD className="text-end"><Amount v={l.amount} /></TD>
                  <TD className="text-xs">{t(`batch.kind.${l.row_kind}`)}</TD>
                  <TD><Badge tone={l.status === 'active' ? 'success' : 'neutral'}>{t(`batch.status.${l.status}`)}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
        <Table density="compact" minWidth={760}>
          <THead><TR><TH>{t('time')}</TH><TH>{t('user')}</TH><TH>{t('action')}</TH><TH>{t('reason')}</TH></TR></THead>
          <TBody>
            {(v.audit || []).map((a) => (
              <TR key={a.id}>
                <TD className="text-xs whitespace-nowrap">{fmtDate(a.occurred_at, lang)}</TD>
                <TD className="text-xs">{a.user_name || a.user_email}</TD>
                <TD className="text-xs" dir="ltr">{a.action}</TD>
                <TD className={cx('text-xs', !a.reason && 'text-gray-400')} dir="auto">{a.reason || '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

