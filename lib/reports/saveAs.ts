/**
 * ── «حفظ باسم» لنوافذ التقارير: PDF · Excel · PowerPoint ──
 *
 * المصدر هو المستند المعروض نفسه لا البيانات الخام. فما يخرج في الملفّ هو ما يراه
 * القارئ على الشاشة: باللغة المختارة، وبالأقسام الظاهرة وحدها (فإن أُخفيت ربحية
 * الرحلات لم تدخل الملفّ)، وبالأرقام المقرَّبة نفسها. ولا يُعاد حساب رقمٍ هنا.
 *
 * - PDF: صورةٌ للمستند كما يرسمه المتصفّح (فتسلم الحروف العربيّة ووصلها)، تُقطَّع
 *   صفحاتٍ عند حدود الصفوف والعناوين لا في منتصف سطر.
 * - Excel: ورقةٌ لكلّ قسم، والأرقام أرقامٌ لا نصوص (فتُجمَع وتُفرَز)، والنِّسب نسب.
 * - PowerPoint: شريحة عنوان، ثمّ جداول كلّ قسمٍ جداولَ أصليّةً قابلةً للتحرير.
 *
 * والمكتبات الثلاث تُحمَّل عند الضغط لا مع الصفحة.
 */
import type { WorkBook } from 'xlsx';

export type CellKind = 'text' | 'num' | 'pct';
export interface XCell { text: string; value: string | number; kind: CellKind; decimals: number; colSpan: number }
export type RowKind = 'head' | 'body' | 'tot' | 'sub' | 'fin' | 'gap' | 'neg';
export interface XRow { kind: RowKind; cells: XCell[] }
export type Block =
  | { type: 'h3'; text: string }
  | { type: 'table'; rows: XRow[] }
  | { type: 'note'; text: string };
export interface Section { title: string; blocks: Block[] }
export interface ReportModel { title: string; meta: string[]; rtl: boolean; sections: Section[] }

const squash = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * نصّ الخليّة → قيمة.
 *
 * `(1,234.56)` سالبٌ بالعرف المحاسبيّ، و`12.5%` نسبةٌ تُخزَّن 0.125. وما فيه حرفٌ
 * أو شرطةٌ أو صفرٌ بادئ (رقم فاتورةٍ مثل 00123) يبقى نصّاً كما هو.
 */
export function parseCell(raw: string): Pick<XCell, 'value' | 'kind' | 'decimals'> {
  const text = squash(raw);
  const m = /^(\()?([-−])?([\d,]*\.?\d+)(%)?(\))?$/.exec(text);
  if (!m || !!m[1] !== !!m[5]) return { value: text, kind: 'text', decimals: 0 };
  const digits = m[3];
  if (/^0\d/.test(digits.replace(/,/g, ''))) return { value: text, kind: 'text', decimals: 0 };
  if (digits.includes(',') && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(digits)) return { value: text, kind: 'text', decimals: 0 };
  let n = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { value: text, kind: 'text', decimals: 0 };
  // القوس سالبٌ والشرطة سالبة، واجتماعهما — `(-500.00)` خصمٌ سالب — موجب
  if (!!m[1] !== !!m[2]) n = -n;
  const decimals = (digits.split('.')[1] || '').length;
  return m[4] ? { value: n / 100, kind: 'pct', decimals } : { value: n, kind: 'num', decimals };
}

function rowKind(tr: HTMLTableRowElement): RowKind {
  if (tr.parentElement?.tagName === 'THEAD') return 'head';
  for (const k of ['fin', 'tot', 'sub', 'gap', 'neg'] as const) if (tr.classList.contains(k)) return k;
  const cells = Array.from(tr.cells);
  if (cells.length && cells.every((c) => c.tagName === 'TH')) return 'head';
  return 'body';
}

/**
 * يُسقط العمود الذي لا نصّ فيه خارج صفوف الرأس — عمود الشريط المرسوم في ربحية
 * الرحلات مثلاً: على الشاشة رسمٌ، وفي الملفّ عمودٌ فارغ بعنوان.
 */
export function pruneEmptyColumns(rows: XRow[]): XRow[] {
  const at = (r: XRow) => { let c = 0; return r.cells.map((cell) => { const from = c; c += cell.colSpan; return { cell, from, to: c - 1 }; }); };
  const n = Math.max(0, ...rows.map((r) => r.cells.reduce((s, c) => s + c.colSpan, 0)));
  const empty = Array.from({ length: n }, (_, j) => rows.some((r) => r.kind !== 'head') && rows.every((r) => {
    if (r.kind === 'head') return true;
    const hit = at(r).find((x) => x.from <= j && j <= x.to);
    return !hit || (hit.from === hit.to && hit.cell.text === '') || (hit.from !== hit.to && hit.cell.text === '');
  }));
  if (!empty.some(Boolean)) return rows;
  return rows.map((r) => ({
    kind: r.kind,
    cells: at(r).map(({ cell, from, to }) => {
      let span = 0;
      for (let j = from; j <= to; j++) if (!empty[j]) span++;
      return span ? { ...cell, colSpan: span } : null;
    }).filter((c): c is XCell => !!c),
  })).filter((r) => r.cells.length);
}

/**
 * الخليّة تستطيع أن تُملي قيمتها بـ `data-x`.
 *
 * `data-x="text"` يُبقيها نصّاً (رقم فاتورةٍ من أرقامٍ فقط)، و`data-x="-1234.5"`
 * يعطيها قيمتها بإشارتها حين يعرض النصّ القيمة المطلقة والإشارة في عنوان السطر.
 */
function readCell(c: HTMLTableCellElement): Pick<XCell, 'value' | 'kind' | 'decimals'> {
  const text = squash(c.textContent);
  const x = c.dataset.x;
  if (x === 'text') return { value: text, kind: 'text', decimals: 0 };
  const parsed = parseCell(text);
  if (x != null && x !== '' && Number.isFinite(Number(x))) {
    return { value: Number(x), kind: 'num', decimals: parsed.kind === 'num' ? parsed.decimals : 2 };
  }
  return parsed;
}

function readTable(t: HTMLTableElement): XRow[] {
  return pruneEmptyColumns(Array.from(t.rows).map((tr) => ({
    kind: rowKind(tr),
    cells: Array.from(tr.cells).map((c) => ({ text: squash(c.textContent), ...readCell(c), colSpan: Math.max(1, c.colSpan || 1) })),
  })).filter((r) => r.cells.length));
}

/**
 * يقرأ المستند المعروض أقساماً: كلّ `h2` يفتح قسماً، وتحته عناوينه الفرعيّة
 * وجداوله وحواشيه بترتيب ظهورها. والرسوم (svg) لا تُقرأ — أرقامها في الجدول المجاور.
 * ورأس المستند (`.dh`) يصير سطور التعريف: المركب والفترة وعدد الرحلات.
 */
export function extractReport(root: HTMLElement, title: string): ReportModel {
  const rtl = (root.getAttribute('dir') || root.closest('[dir]')?.getAttribute('dir')) === 'rtl';
  const meta: string[] = [];
  const sections: Section[] = [];
  let cur: Section | null = null;
  const push = (b: Block) => {
    if (!cur) { cur = { title, blocks: [] }; sections.push(cur); }
    cur.blocks.push(b);
  };
  const visit = (el: Element) => {
    const tag = el.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'svg' || tag === 'SVG') return;
    if (el.classList.contains('dh')) {
      const m = el.querySelector('.meta');
      if (m) for (const d of Array.from(m.children)) { const s = squash(d.textContent); if (s) meta.push(s); }
      return;
    }
    if (el.classList.contains('foot')) return;
    if (tag === 'H1' || tag === 'H2') { cur = { title: squash(el.textContent), blocks: [] }; sections.push(cur); return; }
    if (tag === 'H3') { push({ type: 'h3', text: squash(el.textContent) }); return; }
    if (tag === 'TABLE') { const rows = readTable(el as HTMLTableElement); if (rows.length) push({ type: 'table', rows }); return; }
    if (el.classList.contains('note')) { const s = squash(el.textContent); if (s) push({ type: 'note', text: s }); return; }
    if (tag === 'P' && !el.querySelector('table')) { const s = squash(el.textContent); if (s) push({ type: 'note', text: s }); return; }
    for (const c of Array.from(el.children)) visit(c);
  };
  for (const c of Array.from(root.children)) visit(c);
  return { title, meta, rtl, sections: sections.filter((s) => s.blocks.length) };
}

/** اسم ملفٍّ صالحٌ على ويندوز وماك: بلا \ / : * ? " < > | */
export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').replace(/[-_]{2,}/g, '_').slice(0, 120);
}

function sheetName(title: string, used: Set<string>) {
  const base = (title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) { const suf = ` (${i++})`; name = base.slice(0, 31 - suf.length) + suf; }
  used.add(name.toLowerCase());
  return name;
}

const numFmt = (c: XCell) => (c.kind === 'pct'
  ? (c.decimals ? '0.' + '0'.repeat(c.decimals) + '%' : '0%')
  : (c.decimals ? '#,##0.' + '0'.repeat(c.decimals) + ';(#,##0.' + '0'.repeat(c.decimals) + ')' : '#,##0;(#,##0)'));

/**
 * المصنَّف: ورقةٌ لكلّ قسم، في رأسها عنوان التقرير وسطور تعريفه ثمّ عنوان القسم.
 * والخلايا المدموجة في الجدول تُدمَج في الورقة، واتّجاه المصنَّف يتبع لغة التقرير.
 */
export function buildWorkbook(XLSX: typeof import('xlsx'), model: ReportModel): WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sec of model.sections) {
    const aoa: (string | number | null)[][] = [[model.title], ...model.meta.map((m) => [m]), [], [sec.title], []];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    const fmts: { r: number; c: number; z: string }[] = [];
    const widths: number[] = [];
    for (const b of sec.blocks) {
      if (b.type === 'h3' || b.type === 'note') { aoa.push([b.text]); if (b.type === 'h3') continue; aoa.push([]); continue; }
      for (const row of b.rows) {
        const r = aoa.length;
        const line: (string | number | null)[] = [];
        for (const c of row.cells) {
          const col = line.length;
          line.push(c.kind === 'text' ? c.text : (c.value as number));
          if (c.kind !== 'text') fmts.push({ r, c: col, z: numFmt(c) });
          widths[col] = Math.max(widths[col] || 8, Math.min(60, c.text.length + 2));
          for (let k = 1; k < c.colSpan; k++) line.push(null);
          if (c.colSpan > 1) merges.push({ s: { r, c: col }, e: { r, c: col + c.colSpan - 1 } });
        }
        aoa.push(line);
      }
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const f of fmts) { const cell = ws[XLSX.utils.encode_cell({ r: f.r, c: f.c })]; if (cell) cell.z = f.z; }
    ws['!merges'] = merges;
    ws['!cols'] = widths.map((w) => ({ wch: w || 10 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(sec.title, used));
  }
  wb.Workbook = { Views: [{ RTL: model.rtl }] };
  return wb;
}

/* ── PowerPoint ── */

const NAVY = '0F2C5C';
const ROW_H = 0.3;            // ارتفاع صفّ الجدول بالبوصة
const TOP = 1.05, BOTTOM = 6.95, LEFT = 0.5, WIDTH = 12.33;

export interface SlidePart { h3?: string; table: XRow[]; notes: string[]; y: number }
export interface SlidePlan { title: string; parts: SlidePart[]; long: boolean }

/** صفوف الرأس المتصدّرة تتكرّر في كلّ شريحةٍ من الجدول المقسوم */
const headCount = (rows: XRow[]) => { let i = 0; while (i < rows.length && rows[i].kind === 'head') i++; return i; };

const partHeight = (p: { h3?: string; table: XRow[] }) => (p.h3 ? 0.4 : 0) + p.table.length * ROW_H + 0.2;

/**
 * توزيع الجداول على الشرائح.
 *
 * الجداول القصيرة في القسم الواحد تتراصّ في شريحةٍ ما اتّسعت، والطويل (فواتير
 * بندٍ كبير، ربحية شهرٍ كثير الرحلات) يُقسَم هنا على شرائح بعنوان قسمها ويتكرّر
 * صفّ رأسه — لا بالتقسيم الآليّ في المكتبة، فذاك يتجاوز حافّة الشريحة ويُخرج
 * شرائح التتمّة بلا عنوان. والحواشي تذهب إلى ملاحظات المتحدّث في شريحة جدولها.
 */
export function planSlides(model: ReportModel): SlidePlan[] {
  const plans: SlidePlan[] = [];
  for (const sec of model.sections) {
    let slide: SlidePlan | null = null;
    let y = TOP;
    let h3: string | undefined;
    let last: SlidePart | null = null;
    for (const b of sec.blocks) {
      if (b.type === 'h3') { h3 = b.text; continue; }
      if (b.type === 'note') {
        if (last) last.notes.push(b.text);
        else { slide = { title: sec.title, parts: [], long: false }; plans.push(slide); last = { table: [], notes: [b.text], y: TOP }; slide.parts.push(last); y = BOTTOM; }
        continue;
      }
      const part: SlidePart = { h3, table: b.rows, notes: [], y: TOP };
      h3 = undefined;
      const h = partHeight(part);
      if (h > BOTTOM - TOP) {
        const heads = part.table.slice(0, headCount(part.table));
        const body = part.table.slice(heads.length);
        const room = (first: boolean) => Math.max(1, Math.floor((BOTTOM - TOP - 0.2 - (first && part.h3 ? 0.4 : 0)) / ROW_H) - heads.length);
        for (let i = 0, k = 0; i < body.length; k++) {
          const take = room(k === 0);
          const chunk: SlidePart = { h3: k === 0 ? part.h3 : undefined, table: [...heads, ...body.slice(i, i + take)], notes: [], y: TOP };
          i += take;
          slide = { title: k === 0 ? sec.title : `${sec.title} ${model.rtl ? '(تابع)' : '(cont.)'}`, parts: [chunk], long: true };
          plans.push(slide);
          last = chunk;
        }
        y = BOTTOM;
        continue;
      }
      if (!slide || slide.long || y + h > BOTTOM) { slide = { title: sec.title, parts: [], long: false }; plans.push(slide); y = TOP; }
      part.y = y;
      slide.parts.push(part);
      y += h;
      last = part;
    }
  }
  return plans;
}

/** عرض الأعمدة بحسب أطول نصٍّ فيها، مع حدٍّ أدنى يمنع العمود الرقميّ من الانضغاط */
function colWidths(rows: XRow[], total: number) {
  const n = Math.max(...rows.map((r) => r.cells.reduce((s, c) => s + c.colSpan, 0)), 1);
  const w = Array.from({ length: n }, () => 6);
  for (const r of rows) {
    let col = 0;
    for (const c of r.cells) { if (c.colSpan === 1) w[col] = Math.max(w[col], Math.min(48, c.text.length)); col += c.colSpan; }
  }
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => (x / sum) * total);
}

/**
 * اتّجاه الفقرة بحسب نصّها لا بحسب لغة التقرير.
 *
 * فقرةٌ من اليمين إلى اليسار تقلب ما حولها من رموز: `INV-1000` تصير `1000INV-`،
 * و`12.5%` تصير `%12.5`، و`-3,500.00` تصير `3,500.00-`. فلا يُعطى الاتّجاه العربيّ
 * إلّا لنصٍّ فيه حرفٌ عربيّ، ويبقى الرقم والرمز اللاتينيّ على اتّجاههما.
 */
export const hasArabic = (s: string) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s);

const FILL: Partial<Record<RowKind, string>> = { head: NAVY, tot: 'DBE4FF', sub: 'F1F5F9', fin: '065F46', gap: 'FEF3C7' };
const COLOR: Partial<Record<RowKind, string>> = { head: 'FFFFFF', tot: NAVY, fin: 'FFFFFF', gap: '92400E' };

function pptRows(rows: XRow[], rtl: boolean) {
  return rows.map((r, i) => {
    const cells = r.cells.map((c, j) => {
      const neg = c.kind !== 'text' && (r.kind === 'neg' || (typeof c.value === 'number' && c.value < 0));
      const fill = FILL[r.kind] || (i % 2 === 0 ? 'F8FAFC' : 'FFFFFF');
      const align: 'left' | 'right' = rtl ? 'right' : (j === 0 ? 'left' : 'right');
      return {
        text: c.text,
        options: {
          colspan: c.colSpan > 1 ? c.colSpan : undefined,
          bold: r.kind !== 'body' && r.kind !== 'neg',
          color: COLOR[r.kind] || (neg && r.kind !== 'fin' ? 'B91C1C' : '0F172A'),
          fill: { color: fill },
          align,
          rtlMode: hasArabic(c.text),
          lang: hasArabic(c.text) ? 'ar-EG' : 'en-US',
        },
      };
    });
    // الجدول العربيّ يبدأ من اليمين: يُعكَس ترتيب الخلايا في الصفّ
    return rtl ? cells.reverse() : cells;
  });
}

export async function buildPptx(model: ReportModel) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.rtlMode = model.rtl;
  pptx.title = model.title;
  pptx.company = 'UME Holding';
  const align: 'left' | 'right' = model.rtl ? 'right' : 'left';
  const txt = (s: string) => ({ fontFace: 'Arial', align, rtlMode: hasArabic(s), lang: hasArabic(s) ? 'ar-EG' : 'en-US' });

  const cover = pptx.addSlide();
  cover.background = { color: NAVY };
  cover.addText('UME Holding', { ...txt('UME Holding'), x: LEFT, y: 1.6, w: WIDTH, h: 0.8, fontSize: 36, bold: true, color: 'FFFFFF' });
  cover.addText(model.title, { ...txt(model.title), x: LEFT, y: 2.6, w: WIDTH, h: 0.8, fontSize: 26, color: 'FFFFFF' });
  cover.addText(model.meta.join('\n'), { ...txt(model.meta.join('\n')), x: LEFT, y: 3.7, w: WIDTH, h: 1.6, fontSize: 16, color: 'C7D2FE', valign: 'top' });

  for (const plan of planSlides(model)) {
    const slide = pptx.addSlide();
    slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.85, fill: { color: NAVY }, line: { color: NAVY } });
    slide.addText(plan.title, { ...txt(plan.title), x: LEFT, y: 0.12, w: WIDTH, h: 0.6, fontSize: 22, bold: true, color: 'FFFFFF' });
    slide.addText(model.meta.join('   ·   '), { ...txt(model.meta.join('   ·   ')), x: LEFT, y: 7.05, w: WIDTH, h: 0.3, fontSize: 9, color: '94A3B8' });
    const notes: string[] = [];
    for (const p of plan.parts) {
      let y = p.y;
      if (p.h3) { slide.addText(p.h3, { ...txt(p.h3), x: LEFT, y, w: WIDTH, h: 0.35, fontSize: 13, bold: true, color: NAVY }); y += 0.4; }
      notes.push(...p.notes);
      if (!p.table.length) {
        slide.addText(p.notes.join('\n\n'), { ...txt(p.notes.join('\n\n')), x: LEFT, y, w: WIDTH, h: BOTTOM - y, fontSize: 12, color: '334155', valign: 'top' });
        continue;
      }
      const cw = colWidths(p.table, WIDTH);
      slide.addTable(pptRows(p.table, model.rtl), {
        x: LEFT, y, w: WIDTH, colW: model.rtl ? [...cw].reverse() : cw, rowH: ROW_H,
        fontFace: 'Arial', fontSize: 10, valign: 'middle',
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        margin: 0.05,
      });
    }
    if (notes.length) slide.addNotes(notes.join('\n\n'));
  }
  return pptx;
}

/* ── PDF ── */

/**
 * مواضع القطع بين الصفحات.
 *
 * يُقطع عند أعلى أقرب صفٍّ أو عنوانٍ أو حاشيةٍ قبل نهاية الصفحة، فلا ينشطر سطر.
 * وإن لم يوجد حدٌّ في آخر ثُلثَي الصفحة (صورةٌ أو كتلةٌ أطول من ورقة) يُقطع عند
 * نهايتها كما هي. والمدخلات بوحدةٍ واحدة (بكسلات الصورة).
 */
export function pageCuts(total: number, pageH: number, breaks: number[]): number[] {
  const bs = Array.from(new Set(breaks.map((b) => Math.round(b)))).filter((b) => b > 0 && b < total).sort((a, b) => a - b);
  const cuts: number[] = [];
  let start = 0;
  while (total - start > pageH) {
    const limit = start + pageH;
    let best = -1;
    for (const b of bs) { if (b > start + pageH / 3 && b <= limit) best = b; if (b > limit) break; }
    start = best > 0 ? best : limit;
    cuts.push(start);
  }
  return cuts;
}

/**
 * الحدود المسموح بالقطع عندها — والعنوان لا يُترك وحيداً أسفل الصفحة عن جدوله،
 * والكتلة المتجاورة (الحلقة وجدولها، عمودا الصادر والوارد) لا يُقطع داخلها.
 */
export function breakPoints(root: HTMLElement): number[] {
  const top0 = root.getBoundingClientRect().top;
  const pos = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top - top0, bottom: r.bottom - top0 }; };
  const heads = Array.from(root.querySelectorAll('h1, h2, h3')).map(pos);
  const out: number[] = [];
  for (const el of Array.from(root.querySelectorAll('tr, h1, h2, h3, table, .note, .foot, .dn, .cols, p'))) {
    const group = el.parentElement?.closest('.dn, .cols');
    if (group && root.contains(group)) continue;
    const t = pos(el).top;
    if (heads.some((h) => t > h.top + 0.5 && t <= h.bottom + 40)) continue;
    out.push(t);
  }
  return out;
}

/**
 * عرض المستند ساعة التصوير.
 *
 * يُثبَّت عرضٌ واحد مهما كانت النافذة، وإلّا خرج الـPDF من شاشة هاتفٍ أو نافذةٍ
 * ضيّقة بجداولَ منضغطةٍ تلتفّ سطورها. ثمّ يعود المستند إلى عرضه.
 */
const PDF_W = 860;

/** تحميل صورةٍ وفكّها — بلا انتظار إطار رسمٍ، فلا يتوقّف الحفظ في تبويبٍ مخفيّ */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { img.decode().then(() => resolve(img), () => resolve(img)); };
    img.onerror = () => reject(new Error('pdf: image failed to load'));
    img.decoding = 'async';
    img.src = src;
  });
}

/**
 * المستند يُنسَخ مرّةً واحدة صورةً متّجهة (SVG)، ثمّ تُرسَم كلّ صفحةٍ منها في لوحةٍ
 * بحجم الصفحة وحدها.
 *
 * تصوير المستند كلّه لوحةً نقطيّةً واحدة يصطدم بسقف اللوحة: `html-to-image` تُصغّر
 * ما زاد على 16384 بكسل فيضبُب النصّ في التقرير الطويل، وسفاري الآيفون يُرجع لوحةً
 * بيضاء إن تجاوزت مساحتها نحو 16.7 مليون بكسل. وتصوير كلّ صفحةٍ بنسخٍ مستقلّ يعيد
 * حساب أنماط المستند كلّه لكلّ صفحة فيطول دقيقةً في تقرير شهورٍ كثيرة الفواتير.
 * والصورة المتّجهة تُرسَم بالدقّة المطلوبة عند رسم كلّ صفحة، فلا لوحة كبيرة أصلاً.
 *
 * ومواضع القطع تُقاس على الشاشة، فيلزم أن تطابقها النسخة بالبكسل. والنسخة تكتب
 * لكلّ عنصرٍ ارتفاعه ثابتاً، فالهامش السفليّ لآخر جدولٍ في قسمٍ — وهو على الشاشة
 * يعبر حدّ القسم إلى ما بعده — يسقط في النسخة: ٦ بكسل عند نهاية كلّ قسم، تتراكم
 * حتّى يقصّ القطعُ في الصفحات الأخيرة نصفَ صفّ. فالأقسام في المستند المصدَّر تُعطى
 * `display: flow-root` لتحتوي هوامش أبنائها في الحالتين (انظر `.vf-sec`).
 */
export async function buildPdf(root: HTMLElement) {
  const [{ toSvg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const M = 10, W = 210 - 2 * M, H = 297 - 2 * M - 5;
  const mmPerPx = W / PDF_W;
  const RATIO = 2;
  const prev = root.style.cssText;
  root.style.width = `${PDF_W}px`;
  root.style.minWidth = `${PDF_W}px`;
  root.style.maxWidth = 'none';
  let cssH: number, cuts: number[], svg: string;
  try {
    cssH = root.scrollHeight;
    cuts = [0, ...pageCuts(cssH, H / mmPerPx, breakPoints(root)), cssH];
    svg = await toSvg(root, { width: PDF_W, height: cssH, backgroundColor: '#ffffff', fontEmbedCSS: await getFontEmbedCSS(root) });
  } finally {
    root.style.cssText = prev;
  }
  const img = await loadImage(svg);
  const n = cuts.length - 1;
  for (let i = 0; i < n; i++) {
    const h = cuts[i + 1] - cuts[i];
    const page = document.createElement('canvas');
    page.width = PDF_W * RATIO;
    page.height = Math.ceil(h * RATIO);
    const ctx = page.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(img, 0, cuts[i], PDF_W, h, 0, 0, page.width, h * RATIO);
    if (i) pdf.addPage();
    pdf.addImage(page.toDataURL('image/jpeg', 0.9), 'JPEG', M, M, W, h * mmPerPx);
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`${i + 1} / ${n}`, 105, 297 - 6, { align: 'center' });
  }
  return pdf;
}

/* ── التنزيل ── */

export type SaveFormat = 'pdf' | 'xlsx' | 'pptx';

export async function saveReport(fmt: SaveFormat, root: HTMLElement, title: string, fileBase: string) {
  const name = safeFileName(fileBase);
  if (fmt === 'pdf') { (await buildPdf(root)).save(`${name}.pdf`); return; }
  const model = extractReport(root, title);
  if (fmt === 'xlsx') {
    const XLSX = await import('xlsx');
    XLSX.writeFile(buildWorkbook(XLSX, model), `${name}.xlsx`, { compression: true });
    return;
  }
  await (await buildPptx(model)).writeFile({ fileName: `${name}.pptx`, compression: true });
}
