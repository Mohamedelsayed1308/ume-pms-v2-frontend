/*
 * حمايةٌ من حقن الصيغ في ملفّات التصدير.
 *
 * نصٌّ يبدأ بـ `=` أو `+` أو `-` أو `@` أو Tab أو CR قد يُفسَّر في Excel صيغةً
 * تُنفَّذ عند الفتح — مثل `=HYPERLINK(...)`. والنصوص هنا تأتي من المصدر أو
 * المستخدم (بيان الفاتورة، اسم المورّد، المرجع)، فلا يُوثَق بها.
 *
 * - في CSV: يُسبَق النصّ الخطِر بعلامة `'`.
 * - في XLSX: تُكتب الخليّة نصّاً صريحاً (`t: 's'`)، فلا تصير صيغةً أبداً.
 * - والأرقام تبقى أرقاماً — `-150.5` رقمٌ لا نصّ.
 */
const DANGER = /^[=+\-@\t\r]/;

export function isDangerousText(v: unknown): boolean {
  return typeof v === 'string' && DANGER.test(v);
}

/** قيمة خليّة CSV آمنة ومقتبسة عند الحاجة. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (isDangerousText(v)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** خليّة XLSX: الرقم رقم، وكلّ ما سواه نصٌّ صريح لا يُفسَّر. */
export function xlsxCell(v: unknown): { t: 'n' | 's'; v: number | string } {
  if (typeof v === 'number' && Number.isFinite(v)) return { t: 'n', v };
  return { t: 's', v: String(v ?? '') };
}
