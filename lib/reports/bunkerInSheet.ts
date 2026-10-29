/*
 * فواتير البنكر التي لها نسخةٌ في عمود البنكر بدفتر الرحلات — بقرار المالك ٢٩ أكتوبر ٢٠٢٦.
 *
 * ── لماذا ──
 * الكارت يحمّل البنكر من مصدرين: عمود الشيت، وفواتير بند «Bunker» في النظام. وفواتير
 * GAC وHansaScan تُسجَّل في الاثنين معاً منذ يونيو ٢٠٢٦، فتُحمَّل مرّتين (713 ألفاً
 * حتّى أكتوبر). والفاتورة لا تُلغى: هي سجلّ السداد ومستحقّ المورّد، وخمسٌ منها مدفوعة.
 * فالكارت وحده يتركها، ويبقى ما في الشيت.
 *
 * ── كيف ──
 * النسخة تُعرف بالمبلغ إلى القرش — الأرقام تتطابق تماماً أو لا تتطابق أصلاً. وبعض
 * النسخ مسجَّلةٌ في الشيت صافيةً من عمولةٍ مردودة فلا تطابق؛ هذه تُربط يدويّاً برقم
 * الرحلة في `pinned`. وكلّ سطرٍ في الشيت يقابل فاتورةً واحدةً فقط.
 */
export interface SheetBunkerLine { ref: string; month: string; date?: string; amount: number }
export interface BunkerDoc { id: string; number: string; date: string; usd: number }
export interface BunkerCopy { ref: string; month: string; amount: number }

const CENT = 0.005;

export function matchBunkerInSheet(
  docs: BunkerDoc[],
  lines: SheetBunkerLine[],
  pinned: Record<string, string> = {},
): Map<string, BunkerCopy> {
  const out = new Map<string, BunkerCopy>();
  const used = new Set<number>();
  const pool = lines
    .map((l, i) => ({ ...l, i }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => (a.date || a.month).localeCompare(b.date || b.month));
  const take = (doc: BunkerDoc, k: number) => {
    const l = pool[k]; used.add(l.i);
    out.set(doc.id, { ref: l.ref, month: l.month, amount: l.amount });
  };
  // المربوط يدويّاً أوّلاً، كي لا يأخذ التطابقُ الآليّ سطرَه
  for (const doc of docs) {
    const ref = pinned[doc.number];
    if (!ref) continue;
    const k = pool.findIndex((l) => !used.has(l.i) && String(l.ref) === String(ref));
    if (k >= 0) take(doc, k);
  }
  for (const doc of [...docs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (out.has(doc.id) || pinned[doc.number] || !(doc.usd > 0)) continue;
    const k = pool.findIndex((l) => !used.has(l.i) && Math.abs(l.amount - doc.usd) < CENT);
    if (k >= 0) take(doc, k);
  }
  return out;
}
