'use client';
import { Fragment, useMemo, useState } from 'react';
import api from '@/lib/api';
import {
  Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, Select, Table, TBody, TD, TH, THead, TR, cx, useToast,
} from '@/components/ui';
import {
  FILE_STATUS, MANUAL_KINDS, REVIEW_LABEL, VERSION_STATUS, currencyCards, fileTree, filenameFrom, flagLabel, fmtAmount,
  kindLabel, saveBlob, serverError, usdPerUnit,
  type AuditRow, type Authorization, type BankAccount, type CalcItem, type CycleViewData, type Difference, type EmailNote,
  type Entry, type ExportRow, type Extra, type FileRow, type Issue, type Provenance, type UnmatchedRow, type VersionRow,
} from '@/lib/crewSalaries';
import ImportPanel from './ImportPanel';
import type { Act } from './CycleView';
import type { useReason } from './ReasonDialog';

type Ask = ReturnType<typeof useReason>['ask'];
interface P { v: CycleViewData; act: Act; ask: Ask }

const base = '/api/crew-salaries';
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }) : '—');
const Amount = ({ v, c }: { v: string | null | undefined; c?: string }) => (
  <span dir="ltr" className="tabular-nums whitespace-nowrap">{fmtAmount(v)}{c && <span className="text-xs text-gray-500 ms-1">{c}</span>}</span>
);

async function download(url: string, fallback: string, body?: unknown) {
  const r = body === undefined ? await api.get(url, { responseType: 'blob' }) : await api.post(url, body, { responseType: 'blob' });
  saveBlob(r.data, filenameFrom(r.headers?.['content-disposition'], fallback));
  return r;
}

/* ═════════════ ١) الملفّات والمراحل ═════════════ */
export function FilesSection({ v, reload }: P & { reload: () => void }) {
  const toast = useToast();
  const [replacing, setReplacing] = useState<{ id: string; name: string } | null>(null);
  const tree = useMemo(() => fileTree(v.files), [v.files]);
  const get = async (f: FileRow) => {
    try { await download(`${base}/files/${f.id}/content`, f.name); } catch (e) { (await serverError(e)).forEach((m) => toast.error(m)); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="استيراد ملفٍّ لهذه الدورة" subtitle="رسالةٌ أو تصدير CFM — وتصدير CFM الأحدث بالعملة نفسها يحلّ محلّ السابق" />
        <div className="p-4"><ImportPanel compact onDone={() => reload()} /></div>
      </Card>
      {tree.map(({ file, children }) => (
        <Card key={file.id}>
          <CardHeader
            title={<span dir="ltr">{file.name}</span>}
            subtitle={file.kind === 'email'
              ? `${file.meta?.subject || ''} · ${file.meta?.from || ''} · ${fmtDate(file.meta?.sent_at)}`
              : file.kind === 'cfm' ? `تصدير CFM · ${file.meta?.cfm_currency || ''} · ${file.meta?.rows ?? 0} صفّاً` : file.kind}
            action={(
              <div className="flex gap-2">
                <Badge tone={FILE_STATUS[file.status]?.tone || 'neutral'}>{FILE_STATUS[file.status]?.label || file.status}</Badge>
                <Button size="sm" variant="outline" icon="download" onClick={() => get(file)}>الأصل</Button>
                {file.status !== 'superseded' && <Button size="sm" variant="ghost" onClick={() => setReplacing(replacing?.id === file.id ? null : { id: file.id, name: file.name })}>نسخة مصحَّحة</Button>}
              </div>
            )}
          />
          {replacing?.id === file.id && <div className="px-4 pt-3"><ImportPanel compact replaces={replacing} onDone={() => { setReplacing(null); reload(); }} /></div>}
          {file.meta?.inference && (
            <div className="px-4 py-2 text-xs text-gray-600 border-b">
              {(file.meta.inference.evidence || []).join(' · ')}
              {(file.meta.inference.conflicts?.length ?? 0) > 0 && <span className="text-red-700"> · تعارض: {file.meta.inference.conflicts?.join(' · ')}</span>}
            </div>
          )}
          {children.length > 0 && (
            <Table density="compact" minWidth={640}>
              <THead><TR><TH>#</TH><TH>المرفق</TH><TH>الحالة</TH><TH>ملاحظات</TH><TH /></TR></THead>
              <TBody>
                {children.map((c: FileRow) => (
                  <TR key={c.id}>
                    <TD className="tabular-nums">{(c.position ?? 0) + 1}</TD>
                    <TD><span dir="ltr" className="break-all">{c.name}</span></TD>
                    <TD><Badge tone={FILE_STATUS[c.status]?.tone || 'neutral'}>{FILE_STATUS[c.status]?.label || c.status}</Badge></TD>
                    <TD className="text-xs text-gray-600">
                      {(c.flags || []).map(flagLabel).join(' · ')}
                      {c.meta?.sheet_kind && ` ${({ payout: 'كشف صرف', bank_blocks: 'كشف بنوك', crew_list: 'قائمة طاقم' } as Record<string, string>)[c.meta.sheet_kind] || ''} · ${c.meta.rows} صفّاً`}
                      {c.meta?.cfm_currency && ` تصدير CFM ${c.meta.cfm_currency} · ${c.meta.rows} صفّاً`}
                    </TD>
                    <TD className="text-end">{(c.size ?? 0) > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => get(c)}>تنزيل</Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ))}
      {tree.length === 0 && <Card><EmptyState icon="file" title="لا ملفّات" /></Card>}
    </div>
  );
}

/* ═════════════ ٢) البيانات المستخرجة والتسويات ═════════════ */
export function ExtractedSection({ v, act, ask }: P) {
  const [open, setOpen] = useState<string | null>(null);
  const cycleId = v.cycle.id;
  const pending = v.entries.flatMap((e: Entry) => e.extras.filter((x: Extra) => x.review === 'pending' && x.kind !== 'sign_on_settlement' && x.source !== 'manual'));
  const review = async (x: Extra, decision: 'accepted' | 'rejected') => {
    const reason = decision === 'rejected' ? await ask({ title: `رفض ${kindLabel(x.kind)}`, danger: true, confirm: 'رفض' }) : '';
    if (reason === null) return;
    await act('review', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_review', target_key: x.key, decision, reason }), decision === 'accepted' ? 'قُبل البند' : 'رُفض البند');
  };
  const acceptAll = async () => {
    const reason = await ask({ title: `قبول ${pending.length} بنداً معلّقاً`, label: 'ملاحظة المراجعة', hint: 'تسويات يوم الصعود والبنود اليدويّة لا تدخل القبول الجماعيّ — تُراجَع واحدةً واحدة.', optional: true });
    if (reason === null) return;
    await act('bulk', async () => {
      for (const x of pending) await api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'item_review', target_key: x.key, decision: 'accepted', reason });
    }, `قُبل ${pending.length} بنداً`);
  };
  return (
    <div className="space-y-4">
      {v.unmatched?.notes?.length > 0 && (
        <Callout tone="warning" title="ملاحظاتٌ بمبالغ في نصّ الرسالة — لا تُنفَّذ تلقائيّاً">
          {v.unmatched.notes.map((n: EmailNote, i: number) => (
            <p key={i} className="flex flex-wrap items-center gap-2"><span>{n.text}</span>{n.amount && <Badge tone="warning"><Amount v={n.amount} c={n.currency ?? undefined} /></Badge>}</p>
          ))}
          <p className="text-xs mt-1">تُضاف بنداً يدويّاً لبحّارٍ في الدورة بسببٍ ومصدر، أو تُترك.</p>
        </Callout>
      )}
      <Card>
        <CardHeader title="البحّارة والبنود المستخرجة" subtitle="التواريخ والأيّام من CFM، والبنود الإضافيّة من الرسالة وكشف الصرف — كلٌّ بمصدره"
          action={pending.length > 0 ? <Button size="sm" onClick={acceptAll}>قبول {pending.length} معلّقاً</Button> : null} />
        <Table density="compact" minWidth={900}>
          <THead><TR><TH>رقم</TH><TH>الاسم</TH><TH>الرتبة</TH><TH>العملة</TH><TH>القسم</TH><TH>الخدمة</TH><TH className="text-end tabular-nums">الأيّام</TH><TH>بنودٌ معلّقة</TH><TH>تعارض تواريخ</TH></TR></THead>
          <TBody>
            {v.entries.map((e: Entry) => {
              const pend = e.extras.filter((x: Extra) => x.review === 'pending').length;
              return (
                <Fragment key={e.key}>
                  <TR onClick={() => setOpen(open === e.key ? null : e.key)} className="cursor-pointer" selected={open === e.key}>
                    <TD className="tabular-nums">{e.crew_id}</TD>
                    <TD>{e.name}</TD>
                    <TD className="text-xs">{e.rank}</TD>
                    <TD>{e.currency}</TD>
                    <TD className="text-xs">{e.section === 'final' ? 'نهائيّ (نزول)' : e.section === 'supplementary' ? 'تكميليّ' : 'شهريّ'}</TD>
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
  const cycleId = v.cycle.id;
  const [field, setField] = useState('pay_end');
  const [value, setValue] = useState('');
  const [item, setItem] = useState({ kind: 'other_earning', amount: '', currency: e.currency });
  const override = async () => {
    const reason = await ask({ title: `تصحيح ${field} لـ ${e.crew_id}`, hint: `القيمة الجديدة: ${value}` });
    if (!reason) return;
    await act('override', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'field_override', target_key: `${e.key}|${field}`, value: field === 'signs_off' ? value === 'true' : value, reason }), 'حُفظ التصحيح');
  };
  const addItem = async () => {
    const reason = await ask({ title: `بندٌ يدويّ: ${kindLabel(item.kind)} ${item.amount} ${item.currency}`, label: 'السبب والمصدر (مستند، رسالة…)' });
    if (!reason) return;
    await act('manual', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'manual_item', target_key: e.key, item, reason }), 'أُضيف البند — ينتظر المراجعة');
  };
  return (
    <div className="space-y-3 text-sm">
      {e.date_checks?.map((c, i: number) => (
        <Callout key={i} tone="danger">{c.field === 'pay_start' ? 'بداية الخدمة' : 'نهاية الخدمة'}: CFM <b dir="ltr">{c.cfm || '—'}</b> ↔ {c.source} <b dir="ltr">{c.other}</b> (صفّ {c.provenance?.row})</Callout>
      ))}
      <Table density="compact" minWidth={700}>
        <THead><TR><TH>البند</TH><TH>المصدر</TH><TH className="text-end tabular-nums">المبلغ</TH><TH>السبب</TH><TH>المراجعة</TH><TH /></TR></THead>
        <TBody>
          {e.extras.length === 0 && <TR><TD colSpan={6} className="text-gray-400">لا بنود إضافيّة</TD></TR>}
          {e.extras.map((x: Extra) => (
            <TR key={x.key}>
              <TD>{kindLabel(x.kind)}</TD>
              <TD className="text-xs">{x.source}</TD>
              <TD className="text-end tabular-nums"><Amount v={x.amount} c={x.currency} /></TD>
              <TD className="text-xs max-w-[24rem]">{x.reason}</TD>
              <TD><Badge tone={REVIEW_LABEL[x.review]?.tone || 'neutral'}>{REVIEW_LABEL[x.review]?.label || x.review}</Badge></TD>
              <TD className="text-end whitespace-nowrap">
                <Button size="sm" variant="success" disabled={x.review === 'accepted'} onClick={() => review(x, 'accepted')}>قبول</Button>{' '}
                <Button size="sm" variant="outline" disabled={x.review === 'rejected'} onClick={() => review(x, 'rejected')}>رفض</Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <p className="font-medium">تصحيح حقلٍ مستخرَج</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="الحقل"><Select value={field} onChange={(ev) => setField(ev.target.value)}>
              <option value="pay_start">بداية الخدمة</option><option value="pay_end">نهاية الخدمة</option>
              <option value="basic">الأساسيّ الشهريّ</option><option value="fixed_ot">الإضافيّ الثابت الشهريّ</option>
              <option value="leave">بدل الإجازة الشهريّ</option><option value="signs_off">ينزل هذا الشهر (true/false)</option>
            </Select></Field>
            <Field label="القيمة"><Input dir="ltr" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={field.startsWith('pay') ? 'YYYY-MM-DD' : ''} /></Field>
            <Button size="sm" disabled={!value} onClick={override}>حفظ</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <p className="font-medium">بندٌ يدويّ (تسوية، فرق، أمتعة…)</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="النوع"><Select value={item.kind} onChange={(ev) => setItem({ ...item, kind: ev.target.value })}>
              {MANUAL_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
            </Select></Field>
            <Field label="المبلغ"><Input dir="ltr" value={item.amount} onChange={(ev) => setItem({ ...item, amount: ev.target.value })} /></Field>
            <Field label="العملة"><Input dir="ltr" className="w-20" value={item.currency} onChange={(ev) => setItem({ ...item, currency: ev.target.value.toUpperCase() })} /></Field>
            <Button size="sm" disabled={!/^\d+(\.\d+)?$/.test(item.amount)} onClick={addItem}>إضافة</Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500">المصدر: {e.provenance?.map((p: Provenance) => `${p.file || ''} / ${p.sheet} / صفّ ${p.row}`).join(' · ')}</p>
    </div>
  );
}

/* ═════════════ ٣) الحساب والمطابقة والفروق ═════════════ */
export function CalcSection({ v, act, ask }: P) {
  const [onlyDiff, setOnlyDiff] = useState(true);
  const cycleId = v.cycle.id;
  const rows = v.entries.filter((e: Entry) => !onlyDiff || e.differences.length || !e.result.complete);
  const ack = async (e: Entry) => {
    const reason = await ask({ title: `إقرار فروق ${e.crew_id} عن CFM`, hint: e.differences.map((d: Difference) => `${kindLabel(d.kind)}: ${fmtAmount(d.diff)}`).join(' · '), label: 'لماذا يُعتمد المحسوب رغم الفرق' });
    if (!reason) return;
    await act('ack', () => api.post(`${base}/cycles/${cycleId}/decisions`, { kind: 'difference_ack', target_key: e.key, hash: e.diff_hash, reason }), 'سُجّل الإقرار');
  };
  const link = async (name: string, crewId: string) => {
    const reason = await ask({ title: `ربط «${name}» بالبحّار ${crewId}`, hint: 'الربط يُحفظ ويُستعمل في الأشهر التالية.' });
    if (!reason) return;
    await act('link', () => api.post(`${base}/links`, { name, crew_id: crewId, reason, cycle_id: cycleId }), 'حُفظ الربط');
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="الحساب المستقلّ مقابل CFM" subtitle="البند = الشهريّ ÷ ٣٠ × الأيّام، مقرّباً بنداً بنداً · يوم النزول = (الأساسيّ + الإضافيّ الثابت) ÷ ٣٠"
          action={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDiff} onChange={(ev) => setOnlyDiff(ev.target.checked)} />الفروق وغير المكتمل فقط</label>} />
        <div className="divide-y">
          {rows.length === 0 && <EmptyState icon="check" title="لا فروق ولا نواقص" />}
          {rows.map((e: Entry) => (
            <div key={e.key} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <b className="tabular-nums">{e.crew_id}</b><span>{e.name}</span><Badge>{e.currency}</Badge>
                <span className="text-xs text-gray-500">الأيّام {e.result.days ?? '—'} ({e.result.day_rule === 'full_month' ? 'شهرٌ كامل = ٣٠' : 'جزئيّ'})</span>
                <span className="ms-auto">الصافي المحسوب <Amount v={e.result.balance} c={e.currency} /></span>
              </div>
              {e.result.issues.length > 0 && <Callout tone="warning">{e.result.issues.map((i: Issue, k: number) => <p key={k}>{i.message}</p>)}</Callout>}
              <Table density="compact" minWidth={760}>
                <THead><TR><TH>البند</TH><TH>المعادلة أو السبب</TH><TH className="text-end tabular-nums">المبلغ</TH><TH>الأصل والسعر</TH><TH>المراجعة</TH><TH>في الصافي</TH></TR></THead>
                <TBody>
                  {e.result.items.map((it: CalcItem) => (
                    <TR key={it.key}>
                      <TD>{kindLabel(it.kind)}</TD>
                      <TD className="text-xs">{it.formula || it.reason || ''}</TD>
                      <TD className="text-end tabular-nums">{it.amount == null ? <Badge tone="danger">موقوف</Badge> : <Amount v={it.amount} c={it.currency} />}</TD>
                      <TD className="text-xs" dir="ltr">{it.original_currency !== it.currency ? `${fmtAmount(it.original_amount)} ${it.original_currency}${it.fx_rate ? ` × ${Number(it.fx_rate).toFixed(6)}` : ''}` : ''}</TD>
                      <TD><Badge tone={REVIEW_LABEL[it.review]?.tone || 'neutral'}>{REVIEW_LABEL[it.review]?.label || it.review}</Badge></TD>
                      <TD>{it.counted ? 'نعم' : <span className="text-gray-400">لا</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {e.differences.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="font-medium text-amber-900">فروقٌ عن CFM</p>
                    {e.differences_acknowledged ? <Badge tone="success">أُقِرّت</Badge> : <Button size="sm" onClick={() => ack(e)}>إقرار بسبب</Button>}
                  </div>
                  <Table density="compact">
                    <THead><TR><TH>البند</TH><TH className="text-end tabular-nums">المحسوب</TH><TH className="text-end tabular-nums">CFM</TH><TH className="text-end tabular-nums">الفرق</TH></TR></THead>
                    <TBody>
                      {e.differences.map((d: Difference) => (
                        <TR key={d.kind}><TD>{kindLabel(d.kind)}</TD><TD className="text-end tabular-nums"><Amount v={d.calculated} /></TD><TD className="text-end tabular-nums"><Amount v={d.reported} /></TD><TD className="text-end tabular-nums"><b><Amount v={d.diff} /></b></TD></TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="مطابقة الأسماء بلا رقم بحّار" subtitle="اقتراحاتٌ بالاسم والرتبة — لا يُعتمد شيءٌ منها حتّى تؤكّده" />
        <MatchList title="كشف الصرف" rows={v.unmatched?.payout || []} nameOf={(r: UnmatchedRow) => r.row.name} extra={(r: UnmatchedRow) => r.row.rank} onLink={link} entries={v.entries} />
        <MatchList title="كشف البنوك" rows={v.unmatched?.bank_blocks || []} nameOf={(r: UnmatchedRow) => r.row.beneficiary || r.row.name} extra={(r: UnmatchedRow) => r.row.rank} onLink={link} entries={v.entries} />
      </Card>
    </div>
  );
}

function MatchList({ title, rows, nameOf, extra, onLink, entries }: { title: string; rows: UnmatchedRow[]; nameOf: (r: UnmatchedRow) => string; extra: (r: UnmatchedRow) => string; onLink: (n: string, id: string) => void; entries: Entry[] }) {
  const [pick, setPick] = useState<Record<number, string>>({});
  if (!rows.length) return <p className="px-4 py-3 text-sm text-gray-500">{title}: كلّ الصفوف مربوطة.</p>;
  const nameById = new Map(entries.map((e: Entry) => [e.crew_id, e.name]));
  return (
    <div className="px-4 py-3">
      <p className="font-medium mb-2">{title} — {rows.length} صفّاً بلا ربط</p>
      <Table density="compact" minWidth={640}>
        <THead><TR><TH>الصفّ</TH><TH>الاسم في الملفّ</TH><TH>الرتبة</TH><TH>المقترح</TH><TH /></TR></THead>
        <TBody>
          {rows.map((r: UnmatchedRow, i: number) => {
            const sel = pick[i] ?? r.match.candidates?.[0]?.crew_id ?? '';
            return (
              <TR key={i}>
                <TD className="tabular-nums">{r.row.provenance?.row}</TD>
                <TD>{nameOf(r)}</TD>
                <TD className="text-xs">{extra(r)}</TD>
                <TD>
                  <Select value={sel} onChange={(ev) => setPick({ ...pick, [i]: ev.target.value })}>
                    <option value="">— اختر —</option>
                    {r.match.candidates?.map((c: { crew_id: string; score: number }) => <option key={c.crew_id} value={c.crew_id}>{c.crew_id} · {nameById.get(c.crew_id) || ''} ({Math.round(c.score * 100)}%)</option>)}
                    {entries.filter((e: Entry) => !r.match.candidates?.some((c: { crew_id: string; score: number }) => c.crew_id === e.crew_id)).map((e: Entry) => <option key={e.key} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
                  </Select>
                </TD>
                <TD className="text-end"><Button size="sm" disabled={!sel} onClick={() => onLink(nameOf(r), sel)}>تأكيد الربط</Button></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

/* ═════════════ ٤) الحسابات والتفويضات ═════════════ */
export function BankSection({ v, act, ask }: P) {
  const cycleId = v.cycle.id;
  const canApprove = v.permissions?.can_approve;
  const [adding, setAdding] = useState<Record<string, string>>({ crew_id: '', beneficiary: '', bank: '', branch: '', country: '', iban: '', account_number: '', swift: '' });
  const [auth, setAuth] = useState<Record<string, string>>({ crew_id: '', beneficiary: '', relation: '', valid_from: '', valid_to: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const approvedAuths = (crew: string) => (v.authorizations || []).filter((z: Authorization) => z.crew_id === crew && z.status === 'approved');

  const reviewAccount = async (acc: BankAccount, decision: 'approved' | 'rejected', isSeafarer?: boolean, authId?: string) => {
    const reason = await ask({ title: `${decision === 'approved' ? 'اعتماد' : 'رفض'} حساب ${acc.crew_id}`, danger: decision === 'rejected',
      hint: `${acc.beneficiary} · ${acc.bank} · ${acc.iban || acc.account_number}${decision === 'approved' ? (isSeafarer ? ' · المستفيد هو البحّار' : ' · مستفيدٌ آخر بتفويض') : ''}` });
    if (!reason) return;
    await act('bank', () => api.post(`${base}/bank-accounts/${acc.id}/review`, { decision, beneficiary_is_seafarer: isSeafarer, authorization_id: authId, reason, cycle_id: cycleId }), decision === 'approved' ? 'اعتُمد الحساب' : 'رُفض الحساب');
  };
  const addAccount = async () => {
    const reason = await ask({ title: `حسابٌ يدويّ للبحّار ${adding.crew_id}`, label: 'مصدر بيانات الحساب' });
    if (!reason) return;
    const ok = await act('addBank', () => api.post(`${base}/bank-accounts`, { ...adding, reason, cycle_id: cycleId }), 'سُجّل الحساب — ينتظر الاعتماد');
    if (ok) setAdding({ crew_id: '', beneficiary: '', bank: '', branch: '', country: '', iban: '', account_number: '', swift: '' });
  };
  const addAuth = async () => {
    if (!doc) return;
    const fd = new FormData();
    Object.entries(auth).forEach(([k, val]) => fd.append(k, val));
    fd.append('file', doc); fd.append('cycle_id', cycleId);
    const ok = await act('auth', () => api.post(`${base}/authorizations`, fd), 'سُجّل التفويض — ينتظر الاعتماد');
    if (ok) { setAuth({ crew_id: '', beneficiary: '', relation: '', valid_from: '', valid_to: '' }); setDoc(null); }
  };
  const reviewAuth = async (z: Authorization, decision: string) => {
    const reason = await ask({ title: `${decision === 'approved' ? 'اعتماد' : decision === 'rejected' ? 'رفض' : 'إلغاء'} تفويض ${z.beneficiary}`, danger: decision !== 'approved' });
    if (!reason) return;
    await act('authReview', () => api.post(`${base}/authorizations/${z.id}/review`, { decision, reason, cycle_id: cycleId }), 'حُفظ القرار');
  };

  return (
    <div className="space-y-4">
      {!canApprove && <Callout tone="info">اعتماد الحسابات والتفويضات لصاحب صلاحية الاعتماد وحده{v.permissions?.approver_configured ? '' : ' — ولم يُعيَّن بعد، فكلّ اعتمادٍ مرفوضٌ حاليّاً'}.</Callout>}
      <Card>
        <CardHeader title="حسابات الصرف" subtitle="المستورَد من الملفّات لا يُعتمد تلقائيّاً · والمستفيد غير البحّار يلزمه تفويضٌ موثَّق"
          action={<Button size="sm" variant="outline" onClick={() => act('sync', () => api.post(`${base}/cycles/${cycleId}/bank-accounts/sync`), 'سُجّلت الحسابات المستوردة للمراجعة')}>تسجيل الحسابات المستخرجة</Button>} />
        <Table density="compact" minWidth={980}>
          <THead><TR><TH>رقم</TH><TH>البحّار</TH><TH>الحالة</TH><TH>المستفيد</TH><TH>البنك</TH><TH>IBAN / الحساب</TH><TH>المصدر</TH><TH /></TR></THead>
          <TBody>
            {v.entries.map((e: Entry) => {
              const accounts = e.accounts || [];
              if (!accounts.length) {
                return (
                  <TR key={e.key}>
                    <TD className="tabular-nums">{e.crew_id}</TD><TD>{e.name}</TD>
                    <TD><Badge tone="danger">لا حساب</Badge></TD>
                    <TD colSpan={5} className="text-xs text-gray-500">{e.bank_candidates?.length ? `${e.bank_candidates.length} مرشّحاً في الملفّات — «تسجيل الحسابات المستخرجة»` : 'لا بيانات بنكيّة في الملفّات — أضِفه يدويّاً'}</TD>
                  </TR>
                );
              }
              return accounts.map((a: BankAccount, i: number) => (
                <TR key={a.id}>
                  <TD className="tabular-nums">{i === 0 ? e.crew_id : ''}</TD><TD>{i === 0 ? e.name : ''}</TD>
                  <TD><Badge tone={a.status === 'approved' ? 'success' : a.status === 'imported' ? 'warning' : 'neutral'}>{({ approved: 'معتمد', imported: 'مستورَد — لم يُعتمد', rejected: 'مرفوض', retired: 'مُستبدَل' } as Record<string, string>)[a.status] || a.status}</Badge></TD>
                  <TD className="text-xs">{a.beneficiary}{a.beneficiary_is_seafarer === false && <Badge tone="info" className="ms-1">بتفويض</Badge>}</TD>
                  <TD className="text-xs">{a.bank}{a.branch ? ` · ${a.branch}` : ''}</TD>
                  <TD dir="ltr" className="text-xs break-all">{a.iban || a.account_number}{a.swift ? ` · ${a.swift}` : ''}</TD>
                  <TD className="text-xs">{({ cfm_sheet: 'CFM', payout_sheet: 'كشف الصرف', bank_sheet: 'كشف البنوك', manual: 'يدويّ' } as Record<string, string>)[a.source] || a.source}</TD>
                  <TD className="text-end whitespace-nowrap">
                    {a.status === 'imported' && (
                      <>
                        <Button size="sm" variant="success" disabled={!canApprove} onClick={() => reviewAccount(a, 'approved', true)}>اعتماد (البحّار)</Button>{' '}
                        {approvedAuths(a.crew_id).map((z: Authorization) => (
                          <Button key={z.id} size="sm" variant="outline" disabled={!canApprove} onClick={() => reviewAccount(a, 'approved', false, z.id)}>اعتماد بتفويض {z.beneficiary}</Button>
                        ))}{' '}
                        <Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAccount(a, 'rejected')}>رفض</Button>
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
          <CardHeader title="إضافة حسابٍ يدويّاً" subtitle="يُسجَّل مستورَداً ثمّ يُعتمد" />
          <div className="p-4 grid gap-2 sm:grid-cols-2">
            <Field label="رقم البحّار" required><Select value={adding.crew_id} onChange={(ev) => setAdding({ ...adding, crew_id: ev.target.value })}>
              <option value="">—</option>{v.entries.map((e: Entry) => <option key={e.key} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
            </Select></Field>
            {(['beneficiary', 'bank', 'branch', 'country', 'iban', 'account_number', 'swift'] as const).map((k) => (
              <Field key={k} label={({ beneficiary: 'المستفيد', bank: 'البنك', branch: 'الفرع', country: 'الدولة', iban: 'IBAN', account_number: 'رقم الحساب', swift: 'SWIFT' } as Record<string, string>)[k]}>
                <Input dir={['iban', 'account_number', 'swift'].includes(k) ? 'ltr' : undefined} value={adding[k]} onChange={(ev) => setAdding({ ...adding, [k]: ev.target.value })} />
              </Field>
            ))}
            <div className="sm:col-span-2"><Button disabled={!adding.crew_id || !adding.beneficiary || !adding.bank || !(adding.iban || adding.account_number)} onClick={addAccount}>تسجيل</Button></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="تفويضات المستفيد" subtitle="المستفيد غير البحّار لا يُصرف له بلا تفويضٍ معتمدٍ ساري" />
          <div className="p-4 grid gap-2 sm:grid-cols-2">
            <Field label="رقم البحّار" required><Select value={auth.crew_id} onChange={(ev) => setAuth({ ...auth, crew_id: ev.target.value })}>
              <option value="">—</option>{v.entries.map((e: Entry) => <option key={e.key} value={e.crew_id}>{e.crew_id} · {e.name}</option>)}
            </Select></Field>
            <Field label="المستفيد" required><Input value={auth.beneficiary} onChange={(ev) => setAuth({ ...auth, beneficiary: ev.target.value })} /></Field>
            <Field label="الصلة"><Input value={auth.relation} onChange={(ev) => setAuth({ ...auth, relation: ev.target.value })} /></Field>
            <Field label="المستند (PDF أو صورة)" required><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(ev) => setDoc(ev.target.files?.[0] || null)} className="block w-full text-sm" /></Field>
            <Field label="ساري من"><Input type="date" value={auth.valid_from} onChange={(ev) => setAuth({ ...auth, valid_from: ev.target.value })} /></Field>
            <Field label="ساري حتّى"><Input type="date" value={auth.valid_to} onChange={(ev) => setAuth({ ...auth, valid_to: ev.target.value })} /></Field>
            <div className="sm:col-span-2"><Button disabled={!auth.crew_id || !auth.beneficiary || !doc} onClick={addAuth}>تسجيل التفويض</Button></div>
          </div>
          {(v.authorizations || []).length > 0 && (
            <Table density="compact">
              <THead><TR><TH>البحّار</TH><TH>المستفيد</TH><TH>السريان</TH><TH>الحالة</TH><TH /></TR></THead>
              <TBody>
                {v.authorizations.map((z: Authorization) => (
                  <TR key={z.id}>
                    <TD className="tabular-nums">{z.crew_id}</TD><TD>{z.beneficiary}{z.relation ? ` (${z.relation})` : ''}</TD>
                    <TD dir="ltr" className="text-xs">{z.valid_from || '…'} → {z.valid_to || '…'}</TD>
                    <TD><Badge tone={z.status === 'approved' ? 'success' : z.status === 'pending' ? 'warning' : 'neutral'}>{({ approved: 'معتمد', pending: 'ينتظر', rejected: 'مرفوض', revoked: 'ملغى' } as Record<string, string>)[z.status]}</Badge></TD>
                    <TD className="text-end whitespace-nowrap">
                      {z.status === 'pending' && <><Button size="sm" variant="success" disabled={!canApprove} onClick={() => reviewAuth(z, 'approved')}>اعتماد</Button>{' '}<Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAuth(z, 'rejected')}>رفض</Button></>}
                      {z.status === 'approved' && <Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => reviewAuth(z, 'revoked')}>إلغاء</Button>}
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
  const cycleId = v.cycle.id;
  const perm = v.permissions || {};
  const [rate, setRate] = useState<Record<string, string>>({});
  const needFx = useMemo(() => {
    // كلّ عملةٍ غير الدولار في زوج تحويل — السعر يُخزَّن مقابل الدولار
    const s = new Set<string>();
    for (const e of v.entries) for (const it of e.result.items) {
      if (it.original_currency === it.currency) continue;
      for (const c of [it.original_currency, it.currency]) if (c !== 'USD') s.add(c);
    }
    return [...s].sort();
  }, [v.entries]);
  const notReady = v.entries.filter((e: Entry) => !e.result.complete || !e.differences_acknowledged);
  const latest = v.versions?.[0];

  const setFx = async (cur: string) => {
    const reason = await ask({ title: `سعر ${v.cycle.month}: 1 ${cur} = ${rate[cur]} USD`, label: 'مصدر السعر', hint: 'سعرٌ واحدٌ للشهر لكلّ المراكب. الإصدار المعتمد يحتفظ بلقطته فلا يتأثّر.' });
    if (!reason) return;
    await act('fx', () => api.put(`${base}/fx`, { month: v.cycle.month, currency: cur, usd_per_unit: rate[cur], reason }), 'حُفظ السعر');
  };
  const submit = async () => {
    const reason = await ask({ title: 'تقديم الدورة للاعتماد', label: 'ملاحظة التقديم', hint: 'تُجمَّد لقطةٌ كاملة (البنود والسعر والحسابات) بإصدارٍ جديد.' });
    if (!reason) return;
    await act('submit', () => api.post(`${base}/cycles/${cycleId}/submit`, { reason }), 'قُدّم الإصدار للاعتماد');
  };
  const decide = async (ver: VersionRow, d: 'approve' | 'reject') => {
    const reason = await ask({ title: `${d === 'approve' ? 'اعتماد' : 'رفض'} الإصدار ${ver.version_no}`, danger: d === 'reject', label: d === 'approve' ? 'ملاحظة الاعتماد' : 'سبب الرفض' });
    if (!reason) return;
    await act(d, () => api.post(`${base}/versions/${ver.id}/${d}`, { reason }), d === 'approve' ? 'اعتُمد الإصدار' : 'رُفض الإصدار');
  };

  return (
    <div className="space-y-4">
      <Callout tone={perm.can_approve ? 'success' : 'info'}>
        {!perm.approver_configured ? 'لم يُعيَّن صاحب صلاحية الاعتماد بعد — الاعتماد مرفوضٌ حتّى تأكيد الحساب. التقديم والمراجعة متاحان.'
          : perm.can_approve ? 'أنت صاحب صلاحية الاعتماد.' : 'الاعتماد لصاحب الصلاحية المعيَّن وحده.'}
      </Callout>

      <Card>
        <CardHeader title={`سعر الصرف — ${v.cycle.month}`} subtitle="يدويّ لكلّ شهر، موحَّد لكلّ المراكب، والاتجاه صريح · غيابه يوقف البنود المحوَّلة (لا ١ ولا تخمين)" />
        <div className="p-4 space-y-2">
          {(v.fx?.labels || []).map((l: string) => <p key={l} dir="ltr" className="text-sm tabular-nums">{l}</p>)}
          {needFx.length === 0 && <p className="text-sm text-gray-500">لا بنود تحتاج تحويلاً في هذه الدورة.</p>}
          {needFx.map((cur) => (
            <div key={cur} className="flex flex-wrap items-end gap-2">
              <span className="text-sm" dir="ltr">1 {cur} =</span>
              <Input dir="ltr" className="w-32" value={rate[cur] ?? usdPerUnit(v.fx?.per_usd?.[cur]) ?? ''} onChange={(ev) => setRate({ ...rate, [cur]: ev.target.value })} />
              <span className="text-sm">USD</span>
              <Button size="sm" disabled={!/^\d+(\.\d+)?$/.test(rate[cur] || '')} onClick={() => setFx(cur)}>حفظ السعر</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="الجاهزيّة للتقديم" subtitle="كلّ حالةٍ مكتملة الحساب ومُقَرّة الفروق — والحسابات البنكيّة لا تمنع التقديم لكنّها تمنع الصرف"
          action={<Button onClick={submit} disabled={notReady.length > 0 || v.blocking?.length > 0}>تقديم للاعتماد</Button>} />
        {notReady.length === 0 ? <p className="p-4 text-sm text-emerald-700">كلّ الحالات جاهزة للتقديم.</p> : (
          <ul className="p-4 space-y-1 text-sm">
            {notReady.map((e: Entry) => <li key={e.key}><b className="tabular-nums">{e.crew_id}</b> {e.name}: {e.blockers.filter((b: string) => !/حساب|تفويض|المستفيد/.test(b)).join(' · ')}</li>)}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="الإصدارات" subtitle="كلّ تغييرٍ جوهريّ بعد الاعتماد يلزمه إصدارٌ جديد، والسابق يبقى في السجلّ" />
        {!v.versions?.length ? <EmptyState icon="file" title="لم يُقدَّم إصدارٌ بعد" /> : (
          <Table density="compact" minWidth={900}>
            <THead><TR><TH>#</TH><TH>الحالة</TH><TH>الإجماليّات</TH><TH>قدّمه</TH><TH>القرار</TH><TH /></TR></THead>
            <TBody>
              {v.versions.map((ver: VersionRow) => (
                <TR key={ver.id}>
                  <TD className="tabular-nums">{ver.version_no}</TD>
                  <TD><Badge tone={VERSION_STATUS[ver.status]?.tone || 'neutral'}>{VERSION_STATUS[ver.status]?.label || ver.status}</Badge></TD>
                  <TD className="text-xs">{currencyCards(ver.totals).map(({ currency, t }) => <div key={currency} dir="ltr">{fmtAmount(t.balance)} {currency} · {t.payable}/{t.count}</div>)}</TD>
                  <TD className="text-xs">{ver.submitted_by_name} · {fmtDate(ver.submitted_at)}<div className="text-gray-500">{ver.submit_reason}</div></TD>
                  <TD className="text-xs">{ver.decided_by_name ? <>{ver.decided_by_name} · {fmtDate(ver.decided_at)}<div className="text-gray-500">{ver.decision_reason}</div></> : '—'}</TD>
                  <TD className="text-end whitespace-nowrap">
                    {ver.status === 'submitted' && ver.id === latest?.id && (
                      <><Button size="sm" variant="success" disabled={!perm.can_approve} onClick={() => decide(ver, 'approve')}>اعتماد</Button>{' '}
                        <Button size="sm" variant="outline" disabled={!perm.can_approve} onClick={() => decide(ver, 'reject')}>رفض</Button></>
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
export function ExportSection({ v, act }: { v: CycleViewData; act: Act }) {
  const toast = useToast();
  const cycleId = v.cycle.id;
  const [busy, setBusy] = useState('');
  const curs = currencyCards(v.totals).map((c) => c.currency);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await act('reload', async () => undefined); }
    catch (e) { (await serverError(e, 'تعذّر التصدير')).forEach((m) => toast.error(m)); }
    finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="التصدير" subtitle="كشف المراجعة من البيانات الحاليّة · كشف الصرف من الإصدار المعتمد وحده وللحالات المكتملة وحدها" />
        <div className="p-4 space-y-3">
          <Button variant="outline" icon="download" loading={busy === 'review'} onClick={() => run('review', () => download(`${base}/cycles/${cycleId}/export/review`, 'crew-salaries-review.xlsx'))}>كشف المراجعة</Button>
          {!v.approved_version ? <Callout tone="neutral">لا إصدار معتمد — كشف الصرف غير متاح.</Callout> : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">كشف صرف الإصدار {v.approved_version.version_no}:</span>
              {curs.map((c) => (
                <Button key={c} icon="download" loading={busy === c} onClick={() => run(c, async () => {
                  const r = await download(`${base}/cycles/${cycleId}/export/payments`, `crew-salaries-${c}.xlsx`, { currency: c });
                  if (r.headers?.['x-redownload'] === '1') toast.info('إعادة تنزيلٍ للدفعة نفسها — لا استحقاق جديد');
                })}>{c}</Button>
              ))}
            </div>
          )}
          {v.changed_since_approval && <Callout tone="warning">تغيّرت البيانات بعد الاعتماد — كشف الصرف يبقى من الإصدار المعتمد حتّى يُعتمد إصدارٌ جديد.</Callout>}
          <p className="text-xs text-gray-500">كشف Excel عامّ — ليس قالب بنكٍ بعينه. والتصدير لا يعني السداد.</p>
        </div>
        {v.exports?.length > 0 && (
          <Table density="compact" minWidth={760}>
            <THead><TR><TH>الوقت</TH><TH>النوع</TH><TH>الدفعة</TH><TH>العملة</TH><TH className="text-end tabular-nums">صفوف</TH><TH>بواسطة</TH></TR></THead>
            <TBody>
              {v.exports.map((x: ExportRow) => (
                <TR key={x.id}>
                  <TD className="text-xs">{fmtDate(x.exported_at)}</TD>
                  <TD className="text-xs">{x.kind === 'review' ? 'مراجعة' : x.is_redownload ? 'صرف (إعادة تنزيل)' : 'صرف'}</TD>
                  <TD dir="ltr" className="text-xs">{x.batch_no}</TD><TD>{x.currency || '—'}</TD>
                  <TD className="text-end tabular-nums">{x.row_count}</TD><TD className="text-xs">{x.exported_by_name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="سجلّ التدقيق" subtitle="من استورد وعدّل وراجع واعتمد وصدّر — متى ولماذا (لا يُعدَّل ولا يُحذف)" />
        <Table density="compact" minWidth={760}>
          <THead><TR><TH>الوقت</TH><TH>المستخدم</TH><TH>الإجراء</TH><TH>السبب</TH></TR></THead>
          <TBody>
            {(v.audit || []).map((a: AuditRow) => (
              <TR key={a.id}>
                <TD className="text-xs whitespace-nowrap">{fmtDate(a.occurred_at)}</TD>
                <TD className="text-xs">{a.user_name || a.user_email}</TD>
                <TD className="text-xs" dir="ltr">{a.action}</TD>
                <TD className={cx('text-xs', !a.reason && 'text-gray-400')}>{a.reason || '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
