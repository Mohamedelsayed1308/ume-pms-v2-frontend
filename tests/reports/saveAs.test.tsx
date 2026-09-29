import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import SaveAsMenu from '@/components/SaveAsMenu';
import * as XLSX from 'xlsx';
import VesselFinReport, { type FinData } from '@/app/dashboard/reports/VesselFinReport';
import type { ExecData } from '@/app/dashboard/reports/VesselExecReport';
import { parseCell, extractReport, buildWorkbook, planSlides, pageCuts, safeFileName, buildPptx, pruneEmptyColumns, hasArabic, breakPoints, type XRow } from '@/lib/reports/saveAs';

const saveReport = vi.hoisted(() => vi.fn());
vi.mock('@/lib/reports/saveAs', async (orig) => ({ ...(await orig<typeof import('@/lib/reports/saveAs')>()), saveReport }));

/*
 * «حفظ باسم» يقرأ المستند المعروض. فالاختبار يرسم نافذة التقرير المالي الحقيقيّة
 * ببياناتٍ صغيرةٍ معلومة، ثمّ يتحقّق أنّ ما يخرج في Excel وPowerPoint هو ما على
 * الشاشة: الأقسام نفسها، والأرقام أرقامٌ لا نصوص، والسالب سالب.
 */

const side = (o: Partial<Record<string, number>>, exp: Record<string, number>) => ({
  truck: 0, truckC: 0, veh: 0, vehC: 0, pass: 0, passC: 0, discharge: 0, ...o, exp,
});

const data: FinData = {
  E: side({ truck: 60000, truckC: 30, pass: 5000, passC: 100, discharge: 1000, vehC: 0 }, { broker: 1500, egyPort: 2500 }),
  I: side({ truck: 30000, truckC: 15, pass: 4000, passC: 80, discharge: 0, vehC: 0 }, { ksaPort: 3000 }),
  revE: 66000, revI: 34000, revenue: 100000,
  expE: 4000, expI: 3000,
  opening: 10000, supplies: 20000, closing: 12000, bunkerCost: 18000,
  salaries: 25000, net: 50000,
  O: 1000, P: 5000, liqBassam: 1000, liqIttihad: 4000,
  count: 4,
};
const exec: ExecData = {
  perVoyage: [], revenue: 100000, opExpenses: 50000, opNet: 50000, purchasesTotal: 8000,
  bunkerCost: 18000, salaries: 25000, agentExp: 7000, bookGap: 0, count: 4,
  costLines: [], defaultBuckets: {},
};
const purchases = {
  byItem: [{ name: 'تموينات', value: 8000 }],
  items: [{ id: 'p1', number: '4501', supplier: 'Supplier A', item: 'تموينات', lines: null, date: '2026-08-03', amount: 8000, currency: 'USD', nMonths: 1, seq: 1, installment: 8000 }],
  total: 8000,
};
const allocVoy = [{ ref: 'AL-1', revenue: 60000, net: 30000 }, { ref: 'AL-2', revenue: 40000, net: -2000 }];
const revRows = [{ key: 'truck', cKey: 'truckC', label: 'شاحنات' }, { key: 'pass', cKey: 'passC', label: 'ركاب' }] as const;

function mount(lang: 'ar' | 'en' = 'ar', over: Partial<FinData> = {}) {
  const u = render(
    <VesselFinReport cfg={{ vessel: 'Alcudia', agentExport: 'وكيل البسّام', agentImport: 'وكيل الاتحاد' }}
      month="2026-08" monthLabel="أغسطس 2026" data={{ ...data, ...over }} purchases={purchases} exec={exec}
      allocVoy={allocVoy} labelOf={{ broker: 'عمولة سمسار' }} revRows={revRows} onClose={() => {}} />,
  );
  if (lang === 'en') fireEvent.click(u.getByText('EN'));
  return document.getElementById('vf-doc')!;
}

describe('parseCell', () => {
  it('reads accounting numbers, negatives in brackets, and percentages', () => {
    expect(parseCell('1,234.56')).toEqual({ value: 1234.56, kind: 'num', decimals: 2 });
    expect(parseCell('(7,000.00)')).toEqual({ value: -7000, kind: 'num', decimals: 2 });
    expect(parseCell('−12.50')).toEqual({ value: -12.5, kind: 'num', decimals: 2 });
    expect(parseCell('12.5%')).toEqual({ value: 0.125, kind: 'pct', decimals: 1 });
    expect(parseCell('100%')).toEqual({ value: 1, kind: 'pct', decimals: 0 });
  });
  it('reads a negative inside brackets as positive: (-500.00) is a negative cost shown as a deduction', () => {
    expect(parseCell('(-500.00)')).toEqual({ value: 500, kind: 'num', decimals: 2 });
    expect(parseCell('(−2.5%)')).toEqual({ value: 0.025, kind: 'pct', decimals: 1 });
  });
  it('keeps identifiers and dashes as text', () => {
    for (const s of ['00123', '—', 'AL-1', '2026-08-03', '2026/77', '(12', '1,23,4', '8,000.00 USD · كامل', '8,000.00 *']) {
      expect(parseCell(s).kind).toBe('text');
    }
  });
});

describe('extractReport on the real financial window', () => {
  it('splits the Arabic document into its sections with meta lines', () => {
    const m = extractReport(mount(), 'التقرير المالي — Alcudia');
    expect(m.rtl).toBe(true);
    expect(m.meta[0]).toContain('Alcudia');
    expect(m.sections.map((s) => s.title)).toEqual([
      'قائمة الدخل', 'Analysis · الإيرادات', 'مصروفات الوكالات', 'البنكر والمرتبات',
      'مشتريات العبّارة / مصاريف أخرى', 'Analysis',
    ]);
    const pl = m.sections[0].blocks[0];
    expect(pl.type).toBe('table');
    if (pl.type !== 'table') return;
    // سطر المصروف بين قوسين يخرج سالباً، وسطر الصافي النهائيّ يحمل نوعه
    expect(pl.rows[1].cells[1]).toMatchObject({ value: -7000, kind: 'num' });
    const fin = pl.rows.find((r) => r.kind === 'fin')!;
    expect(fin.cells[1].value).toBe(42000);
  });

  it('follows the screen: the English toggle and the hidden per-voyage table', () => {
    const root = mount('en');
    let m = extractReport(root, 'Financial Report');
    expect(m.rtl).toBe(false);
    expect(m.sections[0].title).toBe('Income Statement');
    const hasVoy = (mm: typeof m) => mm.sections.some((s) => s.blocks.some((b) => b.type === 'table' && b.rows.some((r) => r.cells[0]?.text === 'AL-2')));
    expect(hasVoy(m)).toBe(true);
    // عمود الشريط المرسوم لا يدخل الملفّ
    const voy = m.sections.flatMap((s) => s.blocks).find((b) => b.type === 'table' && b.rows.some((r) => r.cells[0]?.text === 'AL-2'));
    expect(voy && voy.type === 'table' && voy.rows[0].cells.map((c) => c.text)).toEqual(['Voyage', 'Revenue', 'Net after allocation', 'Margin']);
    fireEvent.click(document.querySelector('input[type=checkbox]')!);
    m = extractReport(root, 'Financial Report');
    expect(hasVoy(m)).toBe(false);
  });
});

describe('ledger variance line', () => {
  it('exports the variance with its sign, though the screen shows it absolute with the sign in the label', () => {
    // الصافي من BALANCE أقلّ من مكوّناته بألف: الفرق سالب
    const m = extractReport(mount('ar', { net: 49000 }), 'r');
    const pl = m.sections[0].blocks[0];
    if (pl.type !== 'table') throw new Error('no statement');
    const gap = pl.rows.find((r) => r.kind === 'gap')!;
    expect(gap.cells[0].text.startsWith('−')).toBe(true);
    expect(gap.cells[1]).toMatchObject({ text: '1,000.00', value: -1000, kind: 'num' });
  });
});

describe('breakPoints', () => {
  it('never cuts inside the donut block or the two-column block, only above them', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>A</h2><table><tr><td>1</td></tr></table>'
      + '<div class="cols"><div><h3>x</h3><table><tr><td>2</td></tr><tr><td>3</td></tr></table></div></div>'
      + '<div class="dn"><svg></svg><table><tr><td>4</td></tr></table></div>';
    document.body.appendChild(root);
    const tops = new Map<Element, number>();
    let y = 0;
    for (const el of Array.from(root.querySelectorAll('*'))) tops.set(el, (y += 50));
    const rect = (t: number) => ({ top: t, bottom: t + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: t, toJSON() {} });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return rect(this === root ? 0 : tops.get(this) ?? 0) as DOMRect; });
    const bp = breakPoints(root);
    const inside = Array.from(root.querySelectorAll('.cols *, .dn *')).map((e) => tops.get(e));
    expect(bp).toContain(tops.get(root.querySelector('.cols')!));
    expect(bp).toContain(tops.get(root.querySelector('.dn')!));
    expect(bp.some((b) => inside.includes(b))).toBe(false);
    vi.restoreAllMocks();
    root.remove();
  });
});

describe('SaveAsMenu', () => {
  const doc = () => { const d = document.createElement('div'); d.id = 'doc'; document.body.appendChild(d); return d; };

  it('moves between options with the arrow keys and saves the chosen format', async () => {
    const d = doc();
    saveReport.mockResolvedValueOnce(undefined);
    render(<SaveAsMenu en target={() => d} title="T" fileName="F" />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.click(items[1]);
    await waitFor(() => expect(saveReport).toHaveBeenCalledWith('xlsx', d, 'T', 'F'));
    d.remove();
  });

  it('blocks the page while saving, and shows a dismissable error when saving fails', async () => {
    const d = doc();
    let fail!: (e: Error) => void;
    saveReport.mockImplementationOnce(() => new Promise((_, rej) => { fail = rej; }));
    const u = render(<SaveAsMenu en target={() => d} title="T" fileName="F" />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    await waitFor(() => expect(u.container.querySelector('.cursor-wait')).not.toBeNull());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fail(new Error('boom'));
    const alert = await screen.findByRole('alert');
    expect(u.container.querySelector('.cursor-wait')).toBeNull();
    fireEvent.click(alert);
    expect(screen.queryByRole('alert')).toBeNull();
    vi.restoreAllMocks();
    d.remove();
  });

  it('closes when focus leaves the menu', () => {
    const d = doc();
    const other = document.createElement('button'); document.body.appendChild(other);
    render(<SaveAsMenu en={false} target={() => d} title="T" fileName="F" />);
    fireEvent.click(screen.getByRole('button', { name: /حفظ باسم/ }));
    expect(screen.queryByRole('menu')).not.toBeNull();
    fireEvent.focusIn(other);
    expect(screen.queryByRole('menu')).toBeNull();
    other.remove(); d.remove();
  });
});

describe('buildWorkbook', () => {
  it('writes one sheet per section with real numbers, formats, merges and RTL', () => {
    const m = extractReport(mount(), 'التقرير المالي — Alcudia');
    const wb = buildWorkbook(XLSX, m);
    expect(wb.SheetNames).toHaveLength(m.sections.length);
    expect(wb.SheetNames.every((n) => n.length <= 31 && !/[[\]:*?/\\]/.test(n))).toBe(true);
    expect(new Set(wb.SheetNames.map((n) => n.toLowerCase())).size).toBe(wb.SheetNames.length);
    expect(wb.Workbook?.Views?.[0]?.RTL).toBe(true);

    const ws = wb.Sheets[wb.SheetNames[0]];
    const cells = Object.entries(ws).filter(([k]) => !k.startsWith('!')).map(([, c]) => c as XLSX.CellObject);
    const agency = cells.find((c) => c.v === -7000)!;
    expect(agency.t).toBe('n');
    expect(agency.z).toBe('#,##0.00;(#,##0.00)');
    const share = cells.find((c) => c.t === 'n' && c.z === '0.0%' && Math.abs((c.v as number) - 0.07) < 1e-9);
    expect(share).toBeTruthy();

    // رقم الفاتورة من أرقامٍ فقط يبقى نصّاً (لا 4,501 تدخل الجمع)، وعنوان مجموعة البند المدموج يُدمَج
    const buy = wb.Sheets[wb.SheetNames[4]];
    const buyCells = Object.values(buy).filter((c) => c && typeof c === 'object' && 'v' in (c as object)) as XLSX.CellObject[];
    expect(buyCells.some((c) => c.v === '4501' && c.t === 's')).toBe(true);
    expect(buyCells.some((c) => c.v === 4501)).toBe(false);
    expect((buy['!merges'] || []).some((r) => r.e.c - r.s.c === 3)).toBe(true);

    // والمصنَّف يُكتب ويُقرأ ثانيةً دون خسارة
    const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(back.SheetNames).toEqual(wb.SheetNames);
  });
});

describe('planSlides', () => {
  const cell = (t: string) => ({ text: t, value: t, kind: 'text' as const, decimals: 0, colSpan: 1 });
  const row = (t: string, kind: XRow['kind'] = 'body'): XRow => ({ kind, cells: [cell(t)] });

  it('stacks short tables, splits a long one across titled slides with its header repeated, and keeps notes', () => {
    const short = { type: 'table' as const, rows: [row('a'), row('b')] };
    const long = { type: 'table' as const, rows: [row('H', 'head'), ...Array.from({ length: 40 }, (_, i) => row(String(i)))] };
    const plans = planSlides({ title: 't', meta: [], rtl: true, sections: [
      { title: 'S', blocks: [{ type: 'h3', text: 'one' }, short, { type: 'note', text: 'n1' }, short, { type: 'h3', text: 'big' }, long, { type: 'note', text: 'n2' }, short] },
    ] });
    expect(plans.map((p) => [p.parts.length, p.long])).toEqual([[2, false], [1, true], [1, true], [1, true], [1, false]]);
    expect(plans[0].parts[0]).toMatchObject({ h3: 'one', notes: ['n1'] });
    expect(plans[0].parts[1].y).toBeGreaterThan(plans[0].parts[0].y);
    const chunks = plans.slice(1, 4);
    // كلّ صفٍّ يظهر مرّةً واحدة، والرأس في كلّ شريحة، والعنوان يُعلِم بالتتمّة
    expect(chunks.flatMap((p) => p.parts[0].table.filter((r) => r.kind === 'body').map((r) => r.cells[0].text)))
      .toEqual(Array.from({ length: 40 }, (_, i) => String(i)));
    expect(chunks.every((p) => p.parts[0].table[0].cells[0].text === 'H')).toBe(true);
    expect(chunks.map((p) => p.title)).toEqual(['S', 'S (تابع)', 'S (تابع)']);
    expect(chunks[0].parts[0].h3).toBe('big');
    expect(chunks[2].parts[0].notes).toEqual(['n2']);
    // ولا شريحةٌ تتجاوز الحافّة: عنوانٌ فرعيّ + صفوف × 0.3 داخل 5.9 بوصة
    for (const p of chunks) expect((p.parts[0].h3 ? 0.4 : 0) + p.parts[0].table.length * 0.3 + 0.2).toBeLessThanOrEqual(5.9);
  });

  it('drops a column that is empty outside the header (the drawn bar), shrinking spans over it', () => {
    const c = (t: string, colSpan = 1) => ({ ...cell(t), colSpan });
    const rows: XRow[] = [
      { kind: 'head', cells: [c('Voyage'), c('Net'), c('Bar')] },
      { kind: 'body', cells: [c('AL-1'), c('10'), c('')] },
      { kind: 'tot', cells: [c('Total'), c('10'), c('')] },
      { kind: 'tot', cells: [c('Total'), c('', 2)] },
    ];
    const out = pruneEmptyColumns(rows);
    expect(out[0].cells.map((x) => x.text)).toEqual(['Voyage', 'Net']);
    expect(out[3].cells.map((x) => [x.text, x.colSpan])).toEqual([['Total', 1], ['', 1]]);
    // عمودٌ فيه نصٌّ في صفٍّ واحدٍ يبقى، والفارغ وحده يسقط
    expect(pruneEmptyColumns([rows[0], { kind: 'body', cells: [c('a'), c(''), c('x')] }])[0].cells.map((x) => x.text)).toEqual(['Voyage', 'Bar']);
  });

  it('gives right-to-left direction only to text that has Arabic letters', () => {
    expect(hasArabic('إجمالي الإيراد')).toBe(true);
    expect(hasArabic('8,000.00 USD · كامل')).toBe(true);
    for (const s of ['INV-1000', '12.5%', '-3,500.00', 'EGP Port Dues', 'AL-2026/77']) expect(hasArabic(s)).toBe(false);
  });

  it('builds a presentation from the real window without throwing', async () => {
    const m = extractReport(mount(), 'التقرير المالي — Alcudia');
    const pptx = await buildPptx(m);
    const buf = await pptx.write({ outputType: 'uint8array' }) as Uint8Array;
    expect(buf.byteLength).toBeGreaterThan(10000);
    expect(String.fromCharCode(buf[0], buf[1])).toBe('PK');
  });
});

describe('pageCuts', () => {
  it('cuts at the last row boundary before the page end, never mid-row', () => {
    expect(pageCuts(250, 100, [30, 60, 90, 120, 150, 180, 210, 240])).toEqual([90, 180]);
  });
  it('falls back to the page end when a block is taller than the page', () => {
    expect(pageCuts(300, 100, [10, 250])).toEqual([100, 200]);
  });
  it('needs no cut for a one-page document', () => {
    expect(pageCuts(80, 100, [20, 40])).toEqual([]);
  });
});

it('safeFileName strips characters Windows refuses', () => {
  expect(safeFileName('UME_Alcudia_التقرير-المالي_2026-08 / x:y?')).toBe('UME_Alcudia_التقرير-المالي_2026-08_x-y-');
});
