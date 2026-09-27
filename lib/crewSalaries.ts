/*
 * مرتّبات أطقم السفن — منطق العرض الخالص (بلا React ولا شبكة).
 *
 * الأرقام تصل من الخادم نصوصاً عشريّة (منزلتان) ولا تُحوَّل هنا إلى حسابٍ جديد:
 * الواجهة تعرض ما حسبه الخادم، ولا تجمع عملتين أبداً.
 */

export const CREW_SALARIES_HREF = '/dashboard/fleet-crew-salaries';

export const KIND_LABEL: Record<string, string> = {
  basic: 'الأساسيّ', fixed_ot: 'الإضافيّ الثابت', leave: 'بدل الإجازة', sign_off_day: 'يوم النزول',
  sign_on_settlement: 'تسوية يوم الصعود', lashing: 'لاشينج', captain_bonus: 'مكافأة القبطان', bonus: 'مكافأة',
  salary_difference: 'فرق مرتّب', luggage: 'أمتعة', other_earning: 'استحقاقٌ آخر', cash_advance: 'سلفة',
  other_deduction: 'خصمٌ آخر', balance: 'الصافي',
};
export const kindLabel = (k: string) => KIND_LABEL[k] || k;

export const MANUAL_KINDS = ['sign_on_settlement', 'lashing', 'captain_bonus', 'bonus', 'salary_difference', 'luggage', 'other_earning', 'cash_advance', 'other_deduction'] as const;

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const CYCLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'مسوّدة', tone: 'neutral' },
  submitted: { label: 'مقدَّمة للاعتماد', tone: 'info' },
  approved: { label: 'معتمدة', tone: 'success' },
  exported: { label: 'صُدِّرت (لم تُسدَّد)', tone: 'brand' },
};
export const VERSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: 'بانتظار الاعتماد', tone: 'info' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  superseded: { label: 'حلّ محلّه أحدث', tone: 'neutral' },
};
export const FILE_STATUS: Record<string, { label: string; tone: Tone }> = {
  extracted: { label: 'مُستخرَج', tone: 'success' },
  needs_manual: { label: 'إدخالٌ يدويّ', tone: 'warning' },
  stored: { label: 'محفوظ', tone: 'neutral' },
  ignored: { label: 'متجاهَل', tone: 'neutral' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  superseded: { label: 'حلّت محلّه نسخةٌ مصحَّحة', tone: 'neutral' },
};
export const FLAG_LABEL: Record<string, string> = {
  pdf_text_layer: 'PDF بطبقةٍ نصّيّة (لم يُستخرج نصّه)',
  pdf_scanned: 'PDF ممسوح — إدخالٌ يدويّ',
  image_manual_entry: 'صورة — إدخالٌ يدويّ',
  inline_signature: 'صورة توقيعٍ مضمّنة',
  macro_rejected: 'ماكرو — مرفوض',
  unsupported: 'نوعٌ غير مدعوم',
  unrecognized_sheet: 'بنيةٌ غير معروفة — يدويّ',
  unreadable: 'تعذّرت قراءته',
  inference_conflict: 'تعارضٌ في استنتاج المركب أو الشهر',
  active_javascript: 'محتوى نشط: JavaScript',
  active_auto_action: 'محتوى نشط: إجراءٌ تلقائيّ',
  active_embedded_file: 'محتوى نشط: ملفٌّ مضمَّن',
  active_launch: 'محتوى نشط: تشغيل برنامج',
};
export const flagLabel = (f: string) => FLAG_LABEL[f] || f;

export const REVIEW_LABEL: Record<string, { label: string; tone: Tone }> = {
  auto: { label: 'محسوب', tone: 'neutral' },
  pending: { label: 'ينتظر المراجعة', tone: 'warning' },
  accepted: { label: 'مقبول', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
};

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

/** «1 EUR = 1.150000 USD» — والاتجاه صريح. */
export const fxLabel = (cur: string, usdPerUnit: string) => `1 ${cur} = ${usdPerUnit} USD`;

/** يحوّل «لكلّ دولار» المخزَّن إلى «١ عملة = X دولار» للعرض. */
export function usdPerUnit(perUsd: string | number | null | undefined): string | null {
  const n = Number(perUsd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (1 / n).toFixed(6);
}

/** مراحل الدورة — لا «سُدِّد» أبداً: التصدير ليس سداداً. */
export const STAGES = [
  { key: 'import', label: 'استيراد' },
  { key: 'extract', label: 'استخراج' },
  { key: 'review', label: 'مراجعة' },
  { key: 'submit', label: 'تقديم' },
  { key: 'approve', label: 'اعتماد' },
  { key: 'export', label: 'تصدير' },
] as const;

export function stageIndex(view: {
  files?: unknown[]; entries?: { payable?: boolean; result?: { complete?: boolean }; differences_acknowledged?: boolean }[];
  versions?: { status: string }[]; approved_version?: unknown; exports?: { kind: string }[];
}): number {
  if (!view.files?.length) return 0;
  if (view.exports?.some((e) => e.kind === 'approved_payments')) return 6;
  if (view.approved_version) return 5;
  if (view.versions?.some((v) => v.status === 'submitted')) return 4;
  const e = view.entries || [];
  if (e.length && e.every((x) => x.result?.complete && x.differences_acknowledged)) return 3;
  if (e.length) return 2;
  return 1;
}

export interface FileMeta {
  subject?: string; from?: string; sent_at?: string | null; cfm_currency?: string; rows?: number; sheet_kind?: string;
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
export async function serverError(err: unknown, fallback = 'تعذّر تنفيذ الطلب'): Promise<string[]> {
  const res = (err as HttpError | null)?.response;
  if (!res) return ['تعذّر الاتّصال بالخادم — تحقّق من الشبكة ثمّ أعد المحاولة'];
  let data: unknown = res.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { data = JSON.parse(await blobText(data)); } catch { data = null; }
  }
  const m = (data as ServerMessage | null)?.message;
  if (res.status === 403 && !m) return ['لا تملك صلاحية هذا الإجراء'];
  const lines: string[] = [];
  if (typeof m === 'string') lines.push(m);
  else if (Array.isArray(m)) lines.push(...m.map(String));
  else if (m && typeof m === 'object') {
    const o = m as ServerMessage;
    if (typeof o.message === 'string') lines.push(o.message);
    for (const k of ['blockers', 'conflicts'] as const) { const a = o[k]; if (Array.isArray(a)) lines.push(...a.map(String)); }
    if (Array.isArray(o.entries)) {
      for (const e of o.entries as { crew_id?: string; currency?: string; blockers?: string[] }[]) {
        lines.push(`${e.crew_id} (${e.currency}): ${(e.blockers || []).join(' · ') || 'غير مكتمل'}`);
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
  return Object.entries(totals || {}).sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, t }));
}

/* ═════════════ أنواع ردّ الخادم ═════════════ */
export interface Provenance { file?: string; sheet: string; row: number; column?: string }
export interface CalcItem {
  key: string; kind: string; direction: 'earning' | 'deduction'; amount: string | null; currency: string;
  original_amount: string; original_currency: string; fx_rate: string | null;
  monthly_rate?: string; days?: number; formula?: string; reason?: string; source: string; review: string; counted: boolean;
}
export interface Issue { code: string; blocking: boolean; message: string; itemKey?: string }
export interface Difference { kind: string; calculated: string | null; reported: string | null; diff: string | null }
export interface Match { status: string; crew_id: string | null; score: number; candidates: { crew_id: string; score: number }[] }
export interface BankAccount {
  id: string; crew_id: string; beneficiary: string; beneficiary_is_seafarer: boolean | null; bank: string; branch: string;
  country: string; iban: string; account_number: string; swift: string; bank_code: string; source: string; status: string;
}
export interface Authorization { id: string; crew_id: string; beneficiary: string; relation: string; valid_from: string | null; valid_to: string | null; status: string }
export interface Extra { key: string; kind: string; amount: string; currency: string; reason?: string; source?: string; review: string }
export interface Entry {
  key: string; crew_id: string; name: string; rank: string; nationality: string; currency: string; section: string;
  result: {
    currency: string; days: number | null; day_rule: string | null; service: { start: string | null; end: string | null };
    items: CalcItem[]; earnings: string; deductions: string; balance: string; complete: boolean; issues: Issue[];
  };
  differences: Difference[]; differences_acknowledged: boolean; diff_hash: string | null; payable: boolean; blockers: string[];
  provenance: Provenance[]; date_checks: { field: string; cfm: string | null; other: string; source: string; provenance: Provenance }[];
  payout_match: Match | null; bank_match: Match | null; bank_candidates: unknown[]; accounts: BankAccount[]; extras: Extra[];
}
export interface CurrencyTotals {
  count: number; matched: number; different: number; ready: number; pending: number; missing_account: number; missing_docs: number;
  earnings: string; deductions: string; balance: string;
}
export interface VersionTotals { count: number; payable: number; balance: string; payable_balance: string }
export interface VersionRow {
  id: string; version_no: number; status: string; totals: Record<string, VersionTotals>; content_hash?: string;
  submitted_by_name?: string; submitted_at?: string; submit_reason?: string; decided_by_name?: string; decided_at?: string | null; decision_reason?: string;
}
export interface ExportRow { id: string; kind: string; batch_no: string; currency: string | null; row_count: number; is_redownload: boolean; exported_by_name: string; exported_at: string }
export interface AuditRow { id: string; action: string; user_name: string; user_email: string; reason: string; occurred_at: string }
export interface UnmatchedRow { row: { name: string; rank: string; beneficiary?: string; provenance?: Provenance }; match: Match }
export interface EmailNote { text: string; amount: string | null; currency: string | null; paragraph: number }
export interface CycleViewData {
  cycle: { id: string; vessel: string; month: string; status: string; current_version?: number; approved_version_id?: string | null };
  permissions: { approver_configured: boolean; can_approve: boolean };
  blocking: string[]; warnings: string[];
  fx: { month?: string; per_usd: Record<string, string>; labels: string[] };
  files: FileRow[]; entries: Entry[];
  unmatched: { payout: UnmatchedRow[]; bank_blocks: UnmatchedRow[]; email_rows: unknown[]; notes: EmailNote[] };
  authorizations: Authorization[];
  totals: Record<string, CurrencyTotals>;
  approved_version: { id: string; version_no: number; decided_at?: string | null; decided_by_name?: string } | null;
  changed_since_approval: boolean;
  versions: VersionRow[]; exports: ExportRow[]; audit: AuditRow[];
}
export interface CycleListItem {
  id: string; vessel: string; month: string; status: string;
  latest_version: { id: string; version_no: number; status: string; totals: Record<string, VersionTotals> } | null;
}
export interface CyclesList { cycles: CycleListItem[]; unassigned_files: (FileRow & { uploaded_at: string })[] }
