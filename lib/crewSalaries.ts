/*
 * مرتّبات أطقم السفن — منطق العرض الخالص (بلا React ولا شبكة).
 *
 * الأرقام تصل من الخادم نصوصاً عشريّة (منزلتان) ولا تُحوَّل هنا إلى حسابٍ جديد:
 * الواجهة تعرض ما حسبه الخادم، ولا تجمع عملتين أبداً. والنصوص في `crewSalariesI18n`.
 */

export const CREW_SALARIES_HREF = '/dashboard/fleet-crew-salaries';

export const MANUAL_KINDS = ['sign_on_settlement', 'lashing', 'captain_bonus', 'bonus', 'salary_difference', 'luggage', 'other_earning', 'cash_advance', 'other_deduction'] as const;

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const CYCLE_TONE: Record<string, Tone> = { draft: 'neutral', submitted: 'info', approved: 'success', exported: 'brand' };
export const VERSION_TONE: Record<string, Tone> = { submitted: 'info', approved: 'success', rejected: 'danger', superseded: 'neutral' };
export const FILE_TONE: Record<string, Tone> = { extracted: 'success', needs_manual: 'warning', stored: 'neutral', ignored: 'neutral', rejected: 'danger', superseded: 'neutral' };
export const REVIEW_TONE: Record<string, Tone> = { auto: 'neutral', pending: 'warning', accepted: 'success', rejected: 'danger' };

/** علاماتٌ تُخرج البند من القبول الجماعيّ — يُراجَع وحده. */
export const NO_BULK_FLAGS = ['currency_inferred', 'possible_duplicate', 'unknown_column', 'unreadable_amount', 'manually_identified'];

/** المبلغ بمنزلتين وفاصل آلاف — من نصّه كما جاء، بلا تقريبٍ جديد. */
export function fmtAmount(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  const s = String(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${int}.${(f + '00').slice(0, 2)}`;
}

/** يحوّل «لكلّ دولار» المخزَّن إلى «١ عملة = X دولار» بستّ منازل (دقّة الإدخال). */
export function usdPerUnit(perUsd: string | number | null | undefined): string | null {
  const n = Number(perUsd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (1 / n).toFixed(6);
}

/** مراحل الدورة — لا «سُدِّد» أبداً: التصدير ليس سداداً. */
export const STAGES = ['import', 'extract', 'review', 'submit', 'approve', 'export'] as const;

export function stageIndex(view: {
  files?: unknown[]; entries?: { eligible?: boolean; approval?: { changed: boolean } | null; result?: { complete?: boolean }; differences_acknowledged?: boolean }[];
  versions?: { status: string }[]; approved_version?: unknown; exports?: { kind: string }[];
}): number {
  if (!view.files?.length) return 0;
  if (view.exports?.some((e) => e.kind === 'approved_payments')) return 6;
  if (view.approved_version) return 5;
  if (view.versions?.some((v) => v.status === 'submitted')) return 4;
  const e = view.entries || [];
  if (e.length && e.some((x) => x.eligible || (x.result?.complete && x.differences_acknowledged))) return 3;
  if (e.length) return 2;
  return 1;
}

export interface FileMeta {
  subject?: string; from?: string; sent_at?: string | null; cfm_currency?: string; rows?: number; sheet_kind?: string;
  pdf_kind?: string; rate?: string | null;
  inference?: { vessel: string | null; month: string | null; evidence?: string[]; conflicts?: string[] };
}
export interface FileRow {
  id: string; parent_id: string | null; position: number | null; name: string; kind: string; status: string; flags: string[];
  meta: FileMeta; class?: string; size?: number; sha256?: string; uploaded_at?: string; supersedes_id?: string | null;
}

/** الملفّات شجرةً: كلّ رسالةٍ ومرفقاتها بترتيبها فيها. */
export function fileTree<T extends FileRow>(files: T[]): { file: T; children: T[] }[] {
  const tops = files.filter((f) => !f.parent_id);
  return tops.map((file) => ({
    file,
    children: files.filter((c) => c.parent_id === file.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));
}

/** نصّ Blob — `FileReader` احتياطاً حيث لا `Blob.text` (بعض بيئات الاختبار). */
function blobText(b: Blob): Promise<string> {
  if (typeof b.text === 'function') return b.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

interface ServerMessage { message?: unknown; blockers?: unknown; conflicts?: unknown; entries?: unknown; detail?: unknown }
type HttpError = { response?: { status?: number; data?: unknown } };

/**
 * رسالة خطأ الخادم — نصّاً أو كائناً بقوائم (موانع، حالات، تعارضات).
 * والجسم قد يصل Blob (طلبات التنزيل) فيُقرأ نصّاً أوّلاً.
 */
export async function serverError(err: unknown, fallback = 'تعذّر تنفيذ الطلب', lang: 'ar' | 'en' = 'ar'): Promise<string[]> {
  const res = (err as HttpError | null)?.response;
  if (!res) return [lang === 'en' ? 'Could not reach the server — check the connection and try again' : 'تعذّر الاتّصال بالخادم — تحقّق من الشبكة ثمّ أعد المحاولة'];
  let data: unknown = res.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { data = JSON.parse(await blobText(data)); } catch { data = null; }
  }
  const m = (data as ServerMessage | null)?.message;
  if (res.status === 403 && !m) return [lang === 'en' ? 'You are not allowed to do this' : 'لا تملك صلاحية هذا الإجراء'];
  const lines: string[] = [];
  if (typeof m === 'string') lines.push(m);
  else if (Array.isArray(m)) lines.push(...m.map(String));
  else if (m && typeof m === 'object') {
    const o = m as ServerMessage;
    if (typeof o.message === 'string') lines.push(o.message);
    for (const k of ['blockers', 'conflicts'] as const) { const a = o[k]; if (Array.isArray(a)) lines.push(...a.map(String)); }
    if (Array.isArray(o.entries)) {
      for (const e of o.entries as { crew_id?: string; currency?: string; blockers?: string[] }[]) {
        lines.push(`${e.crew_id} (${e.currency}): ${(e.blockers || []).join(' · ') || '—'}`);
      }
    }
    if (typeof o.detail === 'string' && o.detail) lines.push(o.detail);
  }
  return lines.length ? lines : [fallback];
}

export function filenameFrom(disposition: string | undefined, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* يُكمل */ } }
  const plain = /filename="?([^";]+)"?/i.exec(disposition || '');
  return plain ? plain[1] : fallback;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** إجماليّات العملات مرتّبةً — كلّ عملةٍ بطاقةٌ مستقلّة، ولا مجموع عبرها. */
export function currencyCards<T>(totals: Record<string, T> | undefined | null): { currency: string; t: T }[] {
  return Object.entries(totals || {}).filter(([k]) => !k.startsWith('_')).sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, t }));
}

/**
 * موانع الحالة من رموزها — لا من نصوص الخادم — كي تُعرض باللغتين.
 * يعيد مفاتيح القاموس ومتغيّراتها.
 */
export function entryBlockers(e: Entry): { key: string; vars?: Record<string, string> }[] {
  const out: { key: string; vars?: Record<string, string> }[] = [];
  const kindOf = (k?: string) => e.result.items.find((i) => i.key === k)?.kind || '';
  for (const i of e.result.issues) {
    if (!i.blocking) continue;
    out.push({ key: `blk.${i.code}`, vars: { kind: kindOf(i.itemKey) } });
  }
  if (!e.differences_acknowledged) out.push({ key: 'blk.diffs' });
  if (!e.bank) out.push({ key: e.accounts?.some((a) => a.status === 'imported') ? 'blk.accountPending' : 'blk.noAccount' });
  else if (e.bank.beneficiary_is_seafarer === false && !e.bank.authorization) out.push({ key: 'blk.authMissing' });
  else if (e.bank.beneficiary_is_seafarer == null) out.push({ key: 'blk.beneficiaryUnknown' });
  return out;
}

/** البنود المعلّقة التي يجوز قبولها جماعيّاً. */
export function bulkAcceptable(entries: Entry[]): Extra[] {
  return entries.flatMap((e) => e.extras.filter((x) => x.review === 'pending'
    && x.kind !== 'sign_on_settlement' && x.kind !== 'unclassified'
    && x.source !== 'manual' && x.source !== 'email-note'
    && !(x.flags || []).some((f) => NO_BULK_FLAGS.includes(f))));
}

/* ═════════════ أنواع ردّ الخادم ═════════════ */
export interface Provenance { file?: string; sheet: string; row: number; column?: string }
export interface CalcItem {
  key: string; kind: string; direction: 'earning' | 'deduction'; amount: string | null; currency: string;
  original_amount: string; original_currency: string; fx_rate: string | null; contract_amount?: string | null;
  monthly_rate?: string; days?: number; formula?: string; reason?: string; source: string; review: string; counted: boolean;
  flags?: string[]; duplicate_of?: string | null;
}
export interface Issue { code: string; blocking: boolean; message: string; itemKey?: string }
export interface Difference { kind: string; calculated: string | null; reported: string | null; diff: string | null }
export interface SourceConflict { kind: string; email: string | null; other: string; currency: string; source: string; provenance: Provenance }
export interface Match { status: string; crew_id: string | null; score: number; candidates: { crew_id: string; score: number }[] }
export interface BankAccount {
  id: string; crew_id: string; beneficiary: string; beneficiary_is_seafarer: boolean | null; bank: string; branch: string;
  country: string; iban: string; account_number: string; swift: string; bank_code: string; source: string; status: string;
}
export interface SnapshotBank {
  id: string; beneficiary: string; beneficiary_is_seafarer: boolean | null; bank: string; iban: string; account_number: string;
  authorization: { id: string; beneficiary: string } | null;
}
export interface Authorization { id: string; crew_id: string; beneficiary: string; relation: string; valid_from: string | null; valid_to: string | null; status: string }
export interface Extra { key: string; kind: string; amount: string; currency: string; reason?: string; source?: string; review: string; flags?: string[]; duplicate_of?: string | null }
export interface Entry {
  key: string; crew_id: string; name: string; rank: string; nationality: string;
  currency: string; contract_currency: string; payment_currency_exception: boolean; section: string;
  result: {
    currency: string; contract_currency?: string; days: number | null; day_rule: string | null; service: { start: string | null; end: string | null };
    items: CalcItem[]; earnings: string; deductions: string; balance: string; complete: boolean; issues: Issue[];
  };
  differences: Difference[]; source_conflicts: SourceConflict[]; differences_acknowledged: boolean; diff_hash: string | null;
  payable: boolean; eligible: boolean; blockers: string[];
  approval: { version_id: string; version_no: number; changed: boolean } | null;
  bank: SnapshotBank | null;
  provenance: Provenance[]; date_checks: { field: string; cfm: string | null; other: string; source: string; provenance: Provenance }[];
  payout_match: Match | null; bank_match: Match | null; bank_candidates: unknown[]; accounts: BankAccount[]; extras: Extra[];
}
export interface CurrencyTotals {
  count: number; matched: number; different: number; ready: number; pending: number; eligible: number; approved: number;
  missing_account: number; missing_docs: number; earnings: string; deductions: string; balance: string;
}
export interface VersionTotals { count: number; payable: number; balance: string; payable_balance: string }
export interface VersionRow {
  id: string; version_no: number; status: string; totals: Record<string, VersionTotals | boolean>; content_hash?: string;
  entries?: number; excluded?: number; currencies?: string[];
  submitted_by_name?: string; submitted_at?: string; submit_reason?: string; decided_by_name?: string; decided_at?: string | null; decision_reason?: string;
}
export interface ExportRow { id: string; kind: string; batch_no: string; currency: string | null; row_count: number; is_redownload: boolean; exported_by_name: string; exported_at: string; version_id?: string | null }
export interface AuditRow { id: string; action: string; user_name: string; user_email: string; reason: string; occurred_at: string }
export interface UnmatchedRow { row: { name: string; rank?: string; beneficiary?: string; label?: string; eur?: string; provenance?: Provenance; line?: number }; match: Match }
export interface Unresolved {
  key: string; kind: string; detail: string; name?: string;
  amounts?: { column: string; amount: string; currency: string | null }[];
  candidates?: { crew_id: string; score: number }[];
  source: { file?: string; table?: number; row?: number; paragraph?: number };
  resolution: { action: string; reason: string } | null;
}
export interface CycleViewData {
  cycle: { id: string; vessel: string; month: string; status: string; current_version?: number; approved_version_id?: string | null };
  permissions: { approver_configured: boolean; can_approve: boolean; can_edit_fx: boolean };
  blocking: string[]; warnings: string[];
  fx: { month?: string; per_usd: Record<string, string>; labels: string[] };
  files: FileRow[]; entries: Entry[];
  unresolved: Unresolved[];
  unmatched: { payout: UnmatchedRow[]; bank_blocks: UnmatchedRow[]; lashing_pdf: UnmatchedRow[] };
  authorizations: Authorization[];
  totals: Record<string, CurrencyTotals>;
  complete: boolean;
  approved_version: { id: string; version_no: number; decided_at?: string | null; decided_by_name?: string } | null;
  changed_since_approval: boolean;
  versions: VersionRow[]; exports: ExportRow[]; audit: AuditRow[];
}
export interface CycleListItem {
  id: string; vessel: string; month: string; status: string;
  latest_version: { id: string; version_no: number; status: string; totals: Record<string, VersionTotals | boolean>; partial?: boolean } | null;
}
export interface CyclesList { cycles: CycleListItem[]; unassigned_files: (FileRow & { uploaded_at: string })[] }
