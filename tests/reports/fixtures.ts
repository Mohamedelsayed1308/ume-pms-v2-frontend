/*
 * بيانات اختبارٍ بشكل ردّ الخادم الحقيقيّ:
 * `GET /api/invoices/statement/supplier/:id` → `{ supplier, currencies: CurrencyLedger[] }`.
 * الأرصدة محسوبةٌ هنا كما يحسبها الخادم (تراكمياً داخل العملة، من افتتاحيٍّ صفر).
 */
import type { RawLedger } from '@/lib/reports/statement';

type RawTx = { date: string; kind: 'invoice' | 'payment' | 'credit_note' | 'legacy_settlement' | 'unevidenced_settlement'; ref: string; desc: string; vessel?: string | null; amount: number };

export function ledger(currency: string, rows: RawTx[], opening: number | null = 0) {
  let bal = opening ?? 0;
  const transactions = rows.map((r) => {
    const debit = r.kind === 'invoice' ? r.amount : 0;
    const credit = r.kind === 'invoice' ? 0 : r.amount;
    bal = Math.round((bal + debit - credit) * 100) / 100;
    return {
      date: r.date, kind: r.kind, type: debit ? 'debit' : 'credit', reference: r.ref,
      description: r.desc, vessel: r.vessel ?? null, currency, debit, credit, balance: bal,
    };
  });
  const sum = (k: 'debit' | 'credit', kind: string) => transactions.filter((t) => t.kind === kind).reduce((a, t) => a + t[k], 0);
  // كالخادم: التسويتان تُجمعان في paymentsTotal
  const paid = sum('credit', 'payment') + sum('credit', 'legacy_settlement') + sum('credit', 'unevidenced_settlement');
  const out: RawLedger = {
    currency,
    invoicesTotal: sum('debit', 'invoice'), paymentsTotal: paid, creditsTotal: sum('credit', 'credit_note'),
    transactions,
  };
  if (opening !== null) { out.openingBalance = opening; out.closingBalance = bal; }
  return out;
}

export const STATEMENTS: Record<string, { supplier: { id: string; name: string }; currencies: RawLedger[] }> = {
  s1: {
    supplier: { id: 's1', name: 'Red Sea Marine' },
    currencies: [
      ledger('USD', [
        { date: '2026-01-05', kind: 'invoice', ref: 'INV-1', desc: 'فاتورة رقم INV-1', vessel: 'Alcudia Express', amount: 1000 },
        { date: '2026-01-20', kind: 'payment', ref: 'PAY-1', desc: 'سداد — INV-1', amount: 400 },
        { date: '2026-02-03', kind: 'invoice', ref: 'INV-2', desc: 'فاتورة رقم INV-2', vessel: 'Poseidon Express', amount: 2500.5 },
        { date: '2026-02-10', kind: 'credit_note', ref: 'CN-1', desc: 'إشعار دائن رقم CN-1', vessel: 'Poseidon Express', amount: 100 },
        { date: '2026-03-01', kind: 'payment', ref: 'PAY-2', desc: 'سداد — INV-2', amount: 1500 },
      ]),
      ledger('EUR', [
        { date: '2026-01-07', kind: 'invoice', ref: 'INV-E1', desc: '=HYPERLINK("http://x")', vessel: 'Gubal Trader', amount: 300 },
      ]),
    ],
  },
  s2: { supplier: { id: 's2', name: 'Suez Bunkering' }, currencies: [ledger('USD', [
    { date: '2026-02-01', kind: 'invoice', ref: 'INV-9', desc: 'فاتورة رقم INV-9', amount: 750 },
    { date: '2026-02-02', kind: 'legacy_settlement', ref: 'INV-9', desc: 'تسوية تاريخية قبل النظام — INV-9', amount: 500 },
    { date: '2026-02-03', kind: 'unevidenced_settlement', ref: 'INV-9', desc: 'إغلاق بلا سند دفع داخل النظام — INV-9', amount: 100 },
  ])] },
  s3: { supplier: { id: 's3', name: 'Nile Catering' }, currencies: [ledger('EGP', [{ date: '2026-01-02', kind: 'invoice', ref: 'INV-7', desc: 'فاتورة رقم INV-7', amount: 5000 }, { date: '2026-01-09', kind: 'payment', ref: 'PAY-7', desc: 'سداد', amount: 2000 }], null)] },
  s4: { supplier: { id: 's4', name: 'Port Services' }, currencies: [] },
};

export const SUPPLIERS = [
  { id: 's1', name: 'Red Sea Marine' }, { id: 's2', name: 'Suez Bunkering' },
  { id: 's3', name: 'Nile Catering' }, { id: 's4', name: 'Port Services' },
];
