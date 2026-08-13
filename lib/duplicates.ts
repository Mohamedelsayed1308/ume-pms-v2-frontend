/*
 * كشف تكرار الموردين.
 *
 * المطابقة التامّة بعد حذف لواحق الشركات لا تكفي: اسمٌ واحد يُكتب بلغتين أو
 * بإملاءين يُنتج توقيعين مختلفين فيمرّ التكرار.
 *
 *   SERMACO INTERNACIONAL C. 2005 S.L.          →  2005 internacional sermaco
 *   SERMACO INTERNATIONAL CORPORATION 2005 S.L  →  2005 international sermaco
 *
 * الفرق حرف واحد، والاسمان لشركة واحدة. فالمقارنة هنا **تحتمل الاختلاف
 * الإملائي** وتُرتّب النتائج بقوّة التشابه — والحكم يبقى للقارئ لا للخوارزمية.
 */

/** لواحق الشكل القانوني — لا تميّز شركة عن أخرى فتُحذف قبل المقارنة. */
const CORP = new Set([
  'ltd', 'limited', 'co', 'company', 'corp', 'corporation', 'inc', 'incorporated',
  'sa', 'sl', 'sae', 'fze', 'fzco', 'llc', 'gmbh', 'ab', 'as', 'a/s', 'dmcc',
  'plc', 'bv', 'nv', 'pte', 'srl', 'est', 'group', 'holding', 'holdings',
  'sas', 'spa', 'oy', 'aps', 'kft', 'sarl', 'trading',
]);

export const normalizeName = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');

/** الكلمات المميِّزة — بلا اللواحق ولا الحروف المفردة. */
export function significantTokens(name: string): string[] {
  return [...new Set(
    (name || '').toLowerCase()
      .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !CORP.has(t)),
  )].sort();
}

/** مسافة ليفنشتاين — عدد التعديلات اللازمة لتحويل كلمة إلى أخرى. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * كلمتان متطابقتان عملياً؟
 *
 * التسامح يتناسب مع الطول: حرفٌ واحد في كلمة من خمسة أحرف فرقٌ جوهري، وفي كلمة
 * من ثلاثة عشر حرفاً خطأ إملائي. والكلمات القصيرة لا تُسامَح إطلاقاً — «gas»
 * و«gap» شركتان مختلفتان.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 5) return false;
  const allowed = len >= 10 ? 2 : 1;
  return editDistance(a, b) <= allowed;
}

/** اللواحق القانونية في الاسم — تُعرَض ولا تُقارَن. */
export function legalForms(name: string): string[] {
  return [...new Set(
    (name || '').toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, ' ').split(/\s+/).filter((t) => CORP.has(t)),
  )].sort();
}

/**
 * وزن الكلمة بندرتها.
 *
 * «marine» و«service» تتكرّران في نصف الموردين فلا تميّزان أحداً، بينما «sermaco»
 * تظهر مرّتين فتكاد تكون توقيعاً. فبلا وزن يتساوى تطابق عامّ مع تطابق مميِّز،
 * وتُغرق المرشَّحات الزائفة الحقيقيةَ.
 */
export function buildTokenWeights(names: string[]): (token: string) => number {
  const df = new Map<string, number>();
  for (const n of names) for (const t of significantTokens(n)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = Math.max(names.length, 1);
  return (token: string) => {
    let freq = df.get(token);
    if (freq === undefined) {
      // كلمة لم ترد حرفياً — تأخذ وزن أقرب كلمة إملائياً، وإلا عُدّت نادرة.
      freq = 1;
      for (const [k, v] of df) if (tokensMatch(token, k)) freq = Math.max(freq, v);
    }
    return Math.log(N / freq) + 0.1;
  };
}

/** نسبة التشابه بين اسمين — 0 إلى 1، موزونة بندرة الكلمات. */
export function nameSimilarity(
  nameA: string, nameB: string, weight: (t: string) => number = () => 1,
): number {
  const A = significantTokens(nameA);
  const B = significantTokens(nameB);
  if (!A.length || !B.length) return 0;

  const usedB = new Set<number>();
  let matched = 0;
  for (const ta of A) {
    for (let i = 0; i < B.length; i++) {
      if (usedB.has(i)) continue;
      if (tokensMatch(ta, B[i])) { usedB.add(i); matched += Math.min(weight(ta), weight(B[i])); break; }
    }
  }
  const sumA = A.reduce((s, t) => s + weight(t), 0);
  const sumB = B.reduce((s, t) => s + weight(t), 0);
  return (2 * matched) / (sumA + sumB);
}

export interface DupCandidate<T> {
  items: T[];
  score: number;
  /**
   * الأسماء متطابقة في جوهرها ولا تفترق إلا في الشكل القانوني.
   *
   * `UME Shipping AB` و`UME Shipping DMCC` كيانان مختلفان في ولايتين — والحذف
   * الذي يكشف التكرار يُخفي هذا الفرق. فيُعلَّم صراحةً بدل أن يُقدَّم تكراراً.
   */
  legalFormOnly?: boolean;
}

/**
 * التجميع بمكوّنات متصلة: إن شابه (أ) (ب) وشابه (ب) (ج) اجتمعت الثلاثة.
 * تفريقها يجعل القارئ يراجع الشيء نفسه مرّتين.
 *
 * العتبة منخفضة عمداً — هذه أداة **كشف** يراجعها إنسان، وفوات تكرار حقيقي أسوأ
 * من عرض مرشَّح يُستبعَد بنظرة. ولذلك تُعرَض النسبة ويُرتَّب الأقوى أولاً.
 */
export function findDuplicateGroups<T extends { id: string; name: string }>(
  list: T[],
  threshold = 0.6,
): { exact: T[][]; similar: DupCandidate<T>[] } {
  // ── المتطابق تماماً بعد التطبيع ──
  const exactMap = new Map<string, T[]>();
  for (const s of list) {
    const k = normalizeName(s.name);
    if (k) exactMap.set(k, [...(exactMap.get(k) ?? []), s]);
  }
  const exact = [...exactMap.values()].filter((g) => g.length > 1);

  // ── المتشابه — مقارنة ثنائية، و78 مورّداً تعني 3003 مقارنة: لا شيء ──
  const weight = buildTokenWeights(list.map((s) => s.name));
  const parent = new Map<string, string>(list.map((s) => [s.id, s.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (normalizeName(a.name) === normalizeName(b.name)) continue; // يُعالَج كمتطابق
      if (nameSimilarity(a.name, b.name, weight) < threshold) continue;
      const ra = find(a.id); const rb = find(b.id);
      if (ra !== rb) parent.set(ra, rb);
    }
  }

  const groups = new Map<string, T[]>();
  for (const s of list) {
    const r = find(s.id);
    groups.set(r, [...(groups.get(r) ?? []), s]);
  }

  const similar: DupCandidate<T>[] = [];
  for (const [, items] of groups) {
    if (items.length < 2) continue;
    let best = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        best = Math.max(best, nameSimilarity(items[i].name, items[j].name, weight));
      }
    }
    // جوهر الاسم واحد واللواحق مختلفة ⇒ الأرجح كيانان لا تكرار.
    const cores = new Set(items.map((s) => significantTokens(s.name).join(' ')));
    const forms = new Set(items.map((s) => legalForms(s.name).join(' ')));
    similar.push({ items, score: best, legalFormOnly: cores.size === 1 && forms.size > 1 });
  }
  similar.sort((x, y) => y.score - x.score);

  return { exact, similar };
}
