/*
 * تطبيع النصّ العربيّ للبحث.
 *
 * يُزيل التشكيل والتطويل، ويوحّد الألف (أ إ آ ← ا) والتاء المربوطة (ة ← ه)
 * والألف المقصورة (ى ← ي). فكلمة «مستحقّات» تطابق «مستحقات»، و«الإدارة» تطابق
 * «الاداره».
 */
export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/** كلّ كلمةٍ في البحث يجب أن تُطابق — لا واحدةٌ منها فقط. */
export function matchesAllWords(query: string, haystack: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  const h = norm(haystack);
  return q.split(/\s+/).every((w) => h.includes(w));
}
