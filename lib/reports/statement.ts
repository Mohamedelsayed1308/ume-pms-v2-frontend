/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  كشف حساب المورّد — المنطق الخالص (بلا واجهة)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ما يُعيده الخادم فعلاً ──
 * `GET /api/invoices/statement/supplier/:id` يُعيد لكلّ عملةٍ دفتراً:
 * `openingBalance` و`invoicesTotal` و`paymentsTotal` و`creditsTotal` و
 * `closingBalance`، وحركاتٍ يحمل كلٌّ منها `balance` (الرصيد المتراكم) و
 * `reference`. والكشف يشمل **كلّ التاريخ** بلا فترة، فالرصيد الافتتاحيّ صفرٌ
 * معروف لا مجهول (`invoices.service.ts › CurrencyLedger`).
 *
 * ── قاعدة الأرصدة ──
 * ما يُعيده الخادم **يُعرض كما هو ولا يُعاد حسابه**: الختاميّ ورصيد كلّ سطر.
 * ولا يُنتقل إلى «صافي الحركات» إلّا إن غاب الافتتاحيّ من المصدر فعلاً — وهي
 * حالةٌ لا يُنتجها الخادم اليوم، لكنّها مبنيّةٌ هنا كي لا يُقرأ غيابٌ صفراً.
 *
 * ── والبحث والترتيب لا يمسّان رصيداً ──
 * يُرشّحان ويعكسان العرض فقط، وكلّ سطرٍ يحمل رصيده من السجلّ الكامل.
 */
import * as XLSX from 'xlsx';
import { CURRENCIES } from '@/lib/currencies';
import { norm } from './text';
import { xlsxCell } from './safeCell';

export const CCYS: string[] = CURRENCIES.map((c) => c.code);

export type TxKind = 'invoice' | 'payment' | 'credit_note';
export interface Tx {
  idx: number; date: string; kind: TxKind; type: 'debit' | 'credit';
  ref: string; description: string; vessel: string | null; currency: string;
  debit: number; credit: number; balance: number;
}
export interface Ledger {
  currency: string;
  openingBalance: number | null;
  invoicesTotal: number; paymentsTotal: number; creditsTotal: number;
  closingBalance: number | null;
  netMovement: number;
  balanceBasis: 'full' | 'net';
  transactions: Tx[];
}
export interface Section { supplierId: string; supplierName: string; currencies: Ledger[] }

/** شكل ردّ الخادم كما في `invoices.service.ts › getSupplierStatement` — كلّ حقلٍ اختياريّ احتياطاً. */
export interface RawTx {
  date?: string; kind?: string; type?: string; reference?: string | null; invoice_number?: string; invoiceNumber?: string;
  description?: string; vessel?: string | null; currency?: string; debit?: number | string; credit?: number | string; balance?: number;
}
export interface RawLedger {
  currency?: string; openingBalance?: number | null; closingBalance?: number | null;
  invoicesTotal?: number | string; paymentsTotal?: number | string; creditsTotal?: number | string;
  transactions?: RawTx[];
}
export interface Applied { sups: string[]; ccy: string }

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** دفترٌ من الخادم → الشكل الموحّد. لا يُعاد حساب رصيدٍ أعاده الخادم. */
export function normalizeLedger(raw: RawLedger | null | undefined): Ledger {
  const currency = String(raw?.currency || 'USD').toUpperCase();
  const hasOpening = typeof raw?.openingBalance === 'number' && Number.isFinite(raw.openingBalance);
  const openingBalance = hasOpening ? (raw!.openingBalance as number) : null;
  const txs: RawTx[] = Array.isArray(raw?.transactions) ? raw!.transactions! : [];
  // احتياطٌ فقط: إن غاب رصيد السطر من المصدر يُحسب تراكمياً — والخادم يُعيده اليوم
  let run = openingBalance ?? 0;
  const transactions: Tx[] = txs.map((t, idx) => {
    const debit = num(t.debit), credit = num(t.credit);
    run = r2(run + debit - credit);
    const kind: TxKind = t.kind === 'payment' || t.kind === 'credit_note' || t.kind === 'invoice'
      ? t.kind : (t.type === 'debit' ? 'invoice' : 'payment');
    return {
      idx,
      date: String(t.date || '').slice(0, 10),
      kind,
      type: t.type === 'credit' ? 'credit' : (t.type === 'debit' ? 'debit' : (debit ? 'debit' : 'credit')),
      ref: String(t.reference ?? t.invoice_number ?? t.invoiceNumber ?? ''),
      description: String(t.description ?? ''),
      vessel: t.vessel ?? null,
      currency: String(t.currency || currency).toUpperCase(),
      debit, credit,
      balance: typeof t.balance === 'number' ? t.balance : run,
    };
  });
  const invoicesTotal = num(raw?.invoicesTotal), paymentsTotal = num(raw?.paymentsTotal), creditsTotal = num(raw?.creditsTotal);
  const netMovement = r2(invoicesTotal - paymentsTotal - creditsTotal);
  const balanceBasis: 'full' | 'net' = hasOpening ? 'full' : 'net';
  const closingBalance = !hasOpening ? null
    : (typeof raw?.closingBalance === 'number' ? raw.closingBalance : r2((openingBalance as number) + netMovement));
  return { currency, openingBalance, invoicesTotal, paymentsTotal, creditsTotal, closingBalance, netMovement, balanceBasis, transactions };
}

/**
 * تنظيف قائمة المورّدين: بلا تكرار، وبلا مجهولٍ أو خارج الصلاحية.
 * يُطبَّق عند قراءة الرابط وعند تكوين الطلب وعند استعادة مجموعة — فـ `s1,s1,zz`
 * تساوي `s1` في كلّ موضع.
 */
export function cleanSups(list: readonly string[] | null | undefined, allowed: (id: string) => boolean): string[] {
  return [...new Set((list || []).map(String).filter(Boolean))].filter(allowed);
}

export const cleanCcy = (c: string | null | undefined) => (c && CCYS.includes(c.toUpperCase()) ? c.toUpperCase() : 'all');

/** معاملات الرابط — قائمةٌ مسموحةٌ فقط. */
export function parseLink(search: string): { report: string | null; sups: string[]; ccy: string } {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const sups = [...new Set((p.get('suppliers') || '').split(',').map((s) => s.trim()).filter(Boolean))];
  return { report: p.get('report'), sups, ccy: cleanCcy(p.get('ccy')) };
}

/**
 * الرابط يُبنى من معاملاتٍ مسموحة — لا من `location.href` — فلا يحمل بحث الجدول
 * ولا الترتيب ولا أيّ شيءٍ آخر في شريط العنوان.
 */
export function buildLink(base: string, ap: Applied | null): string {
  const parts = ['report=supplier-statement'];
  if (ap && ap.sups.length) parts.push('suppliers=' + ap.sups.map(encodeURIComponent).join(','));
  if (ap && ap.ccy !== 'all') parts.push('ccy=' + encodeURIComponent(ap.ccy));
  return `${base}?${parts.join('&')}`;
}

export const ledgersOf = (sec: Section, ccy: string) => sec.currencies.filter((L) => ccy === 'all' || L.currency === ccy);

export function matchTx(t: Tx, q: string): boolean {
  const nq = norm(q.trim());
  return !nq || norm([t.description, t.vessel, t.ref, t.date].join(' ')).includes(nq);
}

export const orderRows = <T,>(rows: T[], order: 'asc' | 'desc') => (order === 'desc' ? [...rows].reverse() : rows);

export function sumDC(rows: Tx[]) {
  return { debit: r2(rows.reduce((a, t) => a + t.debit, 0)), credit: r2(rows.reduce((a, t) => a + t.credit, 0)) };
}

/** ما يُصدَّر ويُطبع: كلّ المطابق من كلّ الصفحات، بترتيب الشاشة. */
export function exportSets(sections: Section[], ccy: string, q: string, order: 'asc' | 'desc') {
  return sections.flatMap((sec) => ledgersOf(sec, ccy).map((L) => ({
    sec, L, rows: orderRows(L.transactions.filter((t) => matchTx(t, q)), order),
  })));
}
export type ExportSet = ReturnType<typeof exportSets>[number];

/**
 * ملخّصٌ صفٌّ لكلّ عملة — ولا إجماليّ عابرٌ للعملات أبداً.
 * الافتتاحيّ مجموع المعروف وحده، والختاميّ من الدفاتر المكتملة وحدها، وصافي
 * حركات الناقصة يُذكر بجواره منفصلاً.
 */
export function currencySummary(sections: Section[], ccy: string) {
  const out: {
    ccy: string; ledgers: number; missing: number;
    opening: number | null; invoices: number; payments: number; credits: number;
    closing: number | null; missingNet: number;
  }[] = [];
  const seen = [...new Set(sections.flatMap((s) => ledgersOf(s, ccy).map((L) => L.currency)))];
  const order = [...CCYS.filter((c) => seen.includes(c)), ...seen.filter((c) => !CCYS.includes(c))];
  for (const c of order) {
    const ls = sections.flatMap((s) => ledgersOf(s, ccy).filter((L) => L.currency === c));
    if (!ls.length) continue;
    const full = ls.filter((L) => L.balanceBasis === 'full'), part = ls.filter((L) => L.balanceBasis === 'net');
    const sm = (arr: Ledger[], k: 'openingBalance' | 'invoicesTotal' | 'paymentsTotal' | 'creditsTotal' | 'closingBalance' | 'netMovement') =>
      r2(arr.reduce((a, L) => a + (L[k] ?? 0), 0));
    out.push({
      ccy: c, ledgers: ls.length, missing: part.length,
      opening: full.length ? sm(full, 'openingBalance') : null,
      invoices: sm(ls, 'invoicesTotal'), payments: sm(ls, 'paymentsTotal'), credits: sm(ls, 'creditsTotal'),
      closing: full.length ? sm(full, 'closingBalance') : null,
      missingNet: sm(part, 'netMovement'),
    });
  }
  return out;
}

/** حالات الفراغ الثلاث لمورّد: بلا حركاتٍ أصلاً · بعملاتٍ أخرى فقط · أو له دفاتر. */
export function emptyStateOf(sec: Section, ccy: string): 'noTx' | 'otherCcy' | null {
  if (!sec.currencies.length) return 'noTx';
  if (!ledgersOf(sec, ccy).length) return 'otherCcy';
  return null;
}

/** اتّساق الدفتر: الختاميّ = الافتتاحيّ + الفواتير − السداد − الإشعارات، وآخر سطرٍ يساويه. */
export function ledgerConsistent(L: Ledger): boolean {
  const last = L.transactions.length ? L.transactions[L.transactions.length - 1].balance : (L.openingBalance ?? 0);
  if (L.balanceBasis === 'net') return Math.abs(last - L.netMovement) < 0.01;
  const expected = r2((L.openingBalance ?? 0) + L.invoicesTotal - L.paymentsTotal - L.creditsTotal);
  return Math.abs((L.closingBalance ?? 0) - expected) < 0.01 && Math.abs(last - (L.closingBalance ?? 0)) < 0.01;
}

// ── التصدير ─────────────────────────────────────────────────────────────────
export interface ExportLabels {
  report: string; extracted: string; suppliers: string; currency: string; search: string; order: string;
  status: string; rowsN: string; complete: string; incomplete: (n: number) => string;
  all: string; orderAsc: string; orderDesc: string;
  head: string[];              // المورّد · العملة · التاريخ · النوع · المرجع · البيان · السفينة · مدين · دائن · الرصيد · أساس الرصيد
  kind: (k: TxKind) => string;
  basisFull: string; basisNet: string;
}

export function metaRows(sets: ExportSet[], ctx: { ccy: string; q: string; order: 'asc' | 'desc'; extracted: string; reportTitle: string }, T: ExportLabels): (string | number)[][] {
  const net = sets.filter((x) => x.L.balanceBasis === 'net').length;
  return [
    [T.report, ctx.reportTitle],
    [T.extracted, ctx.extracted],
    [T.suppliers, [...new Set(sets.map((x) => x.sec.supplierName))].join(' | ')],
    [T.currency, ctx.ccy === 'all' ? `${T.all} (${[...new Set(sets.map((x) => x.L.currency))].join(' / ')})` : ctx.ccy],
    [T.search, ctx.q.trim() || '—'],
    [T.order, ctx.order === 'desc' ? T.orderDesc : T.orderAsc],
    [T.status, net ? T.incomplete(net) : T.complete],
    [T.rowsN, sets.reduce((a, x) => a + x.rows.length, 0)],
  ];
}

export function tableRows(set: ExportSet, T: ExportLabels): (string | number)[][] {
  const basis = set.L.balanceBasis === 'net' ? T.basisNet : T.basisFull;
  return set.rows.map((t) => [
    set.sec.supplierName, t.currency, t.date, T.kind(t.kind), t.ref, t.description, t.vessel || '',
    t.debit || 0, t.credit || 0, t.balance, basis,
  ]);
}

/** ورقة XLSX من صفوفٍ — كلّ نصٍّ خليّةٌ نصّيّةٌ صريحة، فلا يصير صيغة. */
export function sheetFromRows(rows: (string | number)[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxC = 0;
  rows.forEach((r, ri) => {
    r.forEach((v, ci) => {
      ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = xlsxCell(v) as XLSX.CellObject;
      if (ci > maxC) maxC = ci;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: maxC } });
  return ws;
}

/**
 * ورقةٌ لكلّ مورّدٍ وعملة — كما في `exportMultiToExcel` القائم — وتبدأ كلٌّ
 * بسطور البيانات ثمّ سطرٍ فارغ ثمّ الجدول.
 */
export function buildStatementWorkbook(sets: ExportSet[], meta: (string | number)[][], T: ExportLabels): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used: Record<string, number> = {};
  const list = sets.length ? sets : [];
  for (const s of list) {
    const rows = [...meta, [], T.head, ...tableRows(s, T)];
    let name = `${s.sec.supplierName}-${s.L.currency}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Sheet';
    if (used[name] != null) { used[name]++; name = `${name} ${used[name]}`; } else { used[name] = 0; }
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), name);
  }
  if (!list.length) XLSX.utils.book_append_sheet(wb, sheetFromRows([...meta]), 'Report');
  return wb;
}
