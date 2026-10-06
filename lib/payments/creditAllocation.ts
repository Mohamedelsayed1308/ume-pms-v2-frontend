/**
 * تطبيق الإشعارات الدائنة في نافذة «تسجيل دفعة» — منطقٌ خالص بلا واجهة.
 *
 * بأمر المالك ٦ أكتوبر ٢٠٢٦: المورّد يُصدر إشعاراً دائناً (فاتورةً سالبة)، فيُخصم من
 * مبلغ التحويل. فلكلّ فاتورةٍ مختارة رقمان: «من الإشعار» و«نقداً»، والتحويل = مجموع
 * النقديّ وحده. والخادم يعيد الفحص كلّه في معاملةٍ واحدة (`POST /api/payments/batch`)،
 * فهذا الملفّ للعرض والتوزيع الافتراضيّ والرسالة المبكّرة لا للحماية.
 *
 * التوزيع الافتراضيّ: الإشعارات على أكبر الفواتير المختارة متبقّياً أوّلاً، وبالعملة
 * نفسها حصراً — لا تحويل عملات. والمستخدم يعدّل «من الإشعار» لكلّ فاتورة بعدها.
 */

export interface PayRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  currency: string;
  checked: boolean;
  amount: string;   // النقديّ المحوَّل لهذه الفاتورة
  credit: string;   // ما يُطبَّق عليها من الإشعارات
}

export interface BatchCredit { credit_note_id: string; invoice_id: string; amount: number }

const TOL = 0.005;
export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (s: string) => { const v = parseFloat(s); return isFinite(v) ? v : 0; };
const ccyOf = (r: PayRow) => (r.currency || 'USD').trim().toUpperCase();

export const isCreditNote = (r: Pick<PayRow, 'total_amount'>) => r2(r.total_amount) < 0;
/** متبقّي الفاتورة الموجبة */
export const remainingOf = (r: PayRow) => r2(r.total_amount - r.paid_amount);
/** رصيد الإشعار غير المستعمل — موجب (إجماليّه سالب ومسدَّده سالبٌ يقترب منه) */
export const availableOf = (r: PayRow) => r2(Math.abs(r.total_amount) - Math.abs(r.paid_amount));

/** الإشعارات المختارة ورصيدها لكلّ عملة */
export function creditPool(rows: PayRow[]): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const r of rows) if (r.checked && isCreditNote(r)) pool[ccyOf(r)] = r2((pool[ccyOf(r)] || 0) + availableOf(r));
  return pool;
}

/**
 * يوزّع رصيد الإشعارات المختارة على الفواتير المختارة — الأكبر متبقّياً أوّلاً — ويضع
 * النقديّ = المتبقّي − المطبَّق. يُستدعى عند تغيّر الاختيار، فيُلغي التعديل اليدويّ السابق.
 */
export function autoAllocate(rows: PayRow[]): PayRow[] {
  const pool = creditPool(rows);
  const credit = new Map<string, number>();
  const invoices = rows.filter((r) => r.checked && !isCreditNote(r)).sort((a, b) => remainingOf(b) - remainingOf(a));
  for (const inv of invoices) {
    const k = ccyOf(inv);
    const take = r2(Math.min(pool[k] || 0, Math.max(0, remainingOf(inv))));
    if (take > 0) { credit.set(inv.id, take); pool[k] = r2(pool[k] - take); }
  }
  return rows.map((r) => {
    if (isCreditNote(r)) return { ...r, amount: '', credit: '' };
    const c = credit.get(r.id) || 0;
    return { ...r, credit: c ? String(c) : '', amount: String(r2(Math.max(0, remainingOf(r) - c))) };
  });
}

/** المستعمَل من كلّ إشعارٍ مختار: رصيد العملة يُستهلك بترتيب الإشعارات كما في القائمة */
export function splitCredits(rows: PayRow[]): BatchCredit[] {
  const notes = rows.filter((r) => r.checked && isCreditNote(r)).map((r) => ({ r, left: availableOf(r) }));
  const out: BatchCredit[] = [];
  for (const inv of rows.filter((r) => r.checked && !isCreditNote(r))) {
    let need = r2(num(inv.credit));
    for (const n of notes) {
      if (need <= TOL) break;
      if (ccyOf(n.r) !== ccyOf(inv) || n.left <= TOL) continue;
      const take = r2(Math.min(need, n.left));
      out.push({ credit_note_id: n.r.id, invoice_id: inv.id, amount: take });
      n.left = r2(n.left - take);
      need = r2(need - take);
    }
  }
  return out;
}

/** المستعمَل من كلّ إشعار — للعرض في سطره */
export function usedByNote(rows: PayRow[]): Record<string, number> {
  const used: Record<string, number> = {};
  for (const c of splitCredits(rows)) used[c.credit_note_id] = r2((used[c.credit_note_id] || 0) + c.amount);
  return used;
}

export interface BatchSummary { transfer: Record<string, number>; applied: Record<string, number>; invoices: number }

export function summarize(rows: PayRow[]): BatchSummary {
  const transfer: Record<string, number> = {}, applied: Record<string, number> = {};
  let invoices = 0;
  for (const r of rows) {
    if (!r.checked || isCreditNote(r)) continue;
    invoices++;
    const k = ccyOf(r);
    transfer[k] = r2((transfer[k] || 0) + Math.max(0, num(r.amount)));
    if (num(r.credit) > 0) applied[k] = r2((applied[k] || 0) + num(r.credit));
  }
  return { transfer, applied, invoices };
}

/** أوّل سببٍ يمنع الحفظ — بالعربيّة — أو null. نسخةٌ مبكّرة من فحص الخادم */
export function validate(rows: PayRow[]): string | null {
  const inv = rows.filter((r) => r.checked && !isCreditNote(r));
  if (!inv.length) return 'اختر فاتورةً واحدة على الأقلّ — الإشعار الدائن يُطبَّق على فاتورة ولا يُسدَّد وحده';
  for (const r of inv) {
    const cash = num(r.amount), cr = num(r.credit);
    if (cash < 0 || cr < 0) return `المبلغ غير صحيح للفاتورة ${r.invoice_number}`;
    if (cash + cr <= TOL) return `لا مبلغ نقديّ ولا إشعار على الفاتورة ${r.invoice_number}`;
    if (cash + cr > remainingOf(r) + TOL) return `${r.invoice_number}: النقديّ + الإشعار (${r2(cash + cr)}) أكبر من المتبقّي (${remainingOf(r)})`;
  }
  const pool = creditPool(rows), need: Record<string, number> = {};
  for (const r of inv) if (num(r.credit) > 0) need[ccyOf(r)] = r2((need[ccyOf(r)] || 0) + num(r.credit));
  for (const [k, v] of Object.entries(need)) {
    if (v > (pool[k] || 0) + TOL) return `المطبَّق من الإشعارات بعملة ${k} (${v}) أكبر من رصيد الإشعارات المختارة (${pool[k] || 0})`;
  }
  return null;
}

/** جسم `POST /api/payments/batch` */
export function batchPayload(supplierId: string, rows: PayRow[], shared: { payment_date: string; payment_type: string; payment_method: string; reference: string; notes: string }) {
  return {
    supplier_id: supplierId,
    payment_date: shared.payment_date,
    payment_type: shared.payment_type,
    payment_method: shared.payment_method,
    reference: shared.reference || null,
    notes: shared.notes || null,
    lines: rows.filter((r) => r.checked && !isCreditNote(r)).map((r) => ({ invoice_id: r.id, amount: r2(Math.max(0, num(r.amount))) })),
    credits: splitCredits(rows),
  };
}
