import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildLink, buildStatementWorkbook, cleanSups, currencySummary, emptyStateOf, exportSets, ledgerConsistent, sheetName,
  ledgersOf, metaRows, normalizeLedger, parseLink, tableRows, type Section,
} from '@/lib/reports/statement';
import { csvCell, toCsv, xlsxCell } from '@/lib/reports/safeCell';
import { STX, exportLabels } from '@/lib/reports/statementText';
import { STATEMENTS } from './fixtures';

const T = exportLabels(STX.ar);
const sec = (id: string): Section => ({
  supplierId: id, supplierName: STATEMENTS[id].supplier.name,
  currencies: STATEMENTS[id].currencies.map(normalizeLedger),
});
const allowed = (id: string) => ['s1', 's2', 's3', 's4'].includes(id);

describe('١ · المورّد المكرّر في الرابط', () => {
  it('s1,s1,unknown يساوي s1 في الطلب والأقسام والإجماليّات وعدد صفوف التصدير', () => {
    const l = parseLink('?report=supplier-statement&suppliers=s1,s1,unknown');
    const dup = cleanSups(l.sups, allowed), one = cleanSups(['s1'], allowed);
    expect(dup).toEqual(['s1']);
    expect(dup).toEqual(one);
    const a = exportSets(dup.map(sec), 'all', '', 'asc'), b = exportSets(one.map(sec), 'all', '', 'asc');
    expect(a.length).toBe(b.length);
    expect(a.reduce((n, x) => n + x.rows.length, 0)).toBe(b.reduce((n, x) => n + x.rows.length, 0));
    expect(currencySummary(dup.map(sec), 'all')).toEqual(currencySummary(one.map(sec), 'all'));
  });
});

describe('٢ · الرابط من معاملاتٍ مسموحة فقط', () => {
  it('لا يحمل إلّا report وsuppliers وccy', () => {
    const url = buildLink('https://x.test/dashboard/reports', { sups: ['s1', 's2'], ccy: 'USD' });
    const u = new URL(url);
    expect([...u.searchParams.keys()].sort()).toEqual(['ccy', 'report', 'suppliers']);
    expect(u.searchParams.get('suppliers')).toBe('s1,s2');
    expect(buildLink('/r', { sups: ['s1'], ccy: 'all' })).toBe('/r?report=supplier-statement&suppliers=s1');
  });
  it('العملة المجهولة في الرابط تصير «الكل»', () => {
    expect(parseLink('?report=supplier-statement&ccy=XYZ').ccy).toBe('all');
    expect(parseLink('?report=supplier-statement&ccy=usd').ccy).toBe('USD');
  });
});

describe('٣ · الافتتاحيّ المفقود موسومٌ في كلّ مكان', () => {
  const s = sec('s3');
  it('الدفتر يصير «صافي حركات» ولا ختاميّ له', () => {
    expect(s.currencies[0].balanceBasis).toBe('net');
    expect(s.currencies[0].openingBalance).toBeNull();
    expect(s.currencies[0].closingBalance).toBeNull();
    expect(s.currencies[0].netMovement).toBe(3000);
  });
  it('الملخّص لا يجمع ختاميّه، ويذكر صافيه منفصلاً', () => {
    const sum = currencySummary([sec('s1'), s], 'all');
    const egp = sum.find((x) => x.ccy === 'EGP')!;
    expect(egp.closing).toBeNull();
    expect(egp.missing).toBe(1);
    expect(egp.missingNet).toBe(3000);
    expect(sum.find((x) => x.ccy === 'USD')!.missing).toBe(0);
  });
  it('التصدير: عمود أساس الرصيد وسطر حالة الأرصدة', () => {
    const sets = exportSets([s], 'all', '', 'asc');
    expect(tableRows(sets[0], T)[0][10]).toBe(STX.ar.basisNet);
    const meta = metaRows(sets, { ccy: 'all', q: '', order: 'asc', extracted: 'x', reportTitle: 'r' }, T);
    expect(meta.find((r) => r[0] === STX.ar.completeness)![1]).toBe(STX.ar.incomplete(1));
  });
  it('الخادم الحقيقيّ يُعيد افتتاحيّاً صفراً — فالدفتر «رصيد كامل»', () => {
    expect(sec('s1').currencies[0].balanceBasis).toBe('full');
  });
});

describe('٦ · البحث وعكس الترتيب لا يغيّران أيّ رصيد', () => {
  it('كلّ رصيدٍ مُصدَّر يساوي رصيد سطره في المصدر', () => {
    const src = STATEMENTS.s1.currencies[0].transactions!;
    const byRef = new Map(src.map((t) => [t.reference, t.balance]));
    for (const q of ['', 'INV', 'سداد', 'Poseidon']) {
      for (const order of ['asc', 'desc'] as const) {
        for (const set of exportSets([sec('s1')], 'USD', q, order)) {
          for (const r of tableRows(set, T)) expect(r[9]).toBe(byRef.get(String(r[4])));
        }
      }
    }
    const desc = exportSets([sec('s1')], 'USD', '', 'desc')[0].rows;
    expect(desc[0].date > desc[desc.length - 1].date).toBe(true);
  });
});

describe('٧ · العملات منفصلة', () => {
  it('صفٌّ لكلّ عملة بلا إجماليٍّ مشترك، وورقةٌ لكلّ مورّدٍ وعملة', () => {
    const secs = [sec('s1'), sec('s2'), sec('s3')];
    const sum = currencySummary(secs, 'all');
    expect(sum.map((x) => x.ccy)).toEqual(['USD', 'EUR', 'EGP']);
    expect(sum.some((x) => x.ccy === 'ALL')).toBe(false);
    const sets = exportSets(secs, 'all', '', 'asc');
    const wb = buildStatementWorkbook(sets, [], T);
    expect(wb.SheetNames.length).toBe(4);   // s1·USD · s1·EUR · s2·USD · s3·EGP
    expect(new Set(sets.map((x) => `${x.sec.supplierId}|${x.L.currency}`)).size).toBe(4);
  });
});

describe('٨ · عدد صفوف التصدير = كلّ المطابق من كلّ الصفحات', () => {
  it('بلا بحث يساوي السجلّ الكامل، ومع البحث يساوي المطابق', () => {
    const all = exportSets([sec('s1')], 'all', '', 'asc');
    expect(all.reduce((n, x) => n + x.rows.length, 0)).toBe(6);
    const q = exportSets([sec('s1')], 'all', 'سداد', 'asc');
    expect(q.reduce((n, x) => n + x.rows.length, 0)).toBe(2);
    const wb = buildStatementWorkbook(q, [['a', 'b']], T);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true });
    // سطر بيانات · سطر فارغ · الرأس · صفّان
    expect(aoa.length).toBe(1 + 1 + 1 + 2);
  });
});

describe('٩ · المورّد خارج الصلاحية يُستبعَد', () => {
  it('من الطلب والقائمة', () => {
    const scope = (id: string) => ['s1', 's2'].includes(id);
    expect(cleanSups(['s1', 's3', 's2', 'zz'], scope)).toEqual(['s1', 's2']);
  });
});

describe('١٠ · حقن الصيغ', () => {
  it('النصوص الخطرة تصير نصّاً، والأرقام السالبة تبقى أرقاماً', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-150.5)).toBe('-150.5');
    expect(toCsv([['عادي', -150.5]])).toBe('﻿عادي,-150.5');
    expect(xlsxCell('=1+1')).toEqual({ t: 's', v: '=1+1' });
    expect(xlsxCell(-150.5)).toEqual({ t: 'n', v: -150.5 });
  });
  it('خليّة البيان الخطِر في Excel نصٌّ بلا صيغة', () => {
    const sets = exportSets([sec('s1')], 'EUR', '', 'asc');
    const ws = buildStatementWorkbook(sets, [], T).Sheets[buildStatementWorkbook(sets, [], T).SheetNames[0]];
    const cells = Object.entries(ws).filter(([k]) => !k.startsWith('!')).map(([, c]) => c as XLSX.CellObject);
    const bad = cells.find((c) => String(c.v).startsWith('=HYPERLINK'))!;
    expect(bad.t).toBe('s');
    expect(bad.f).toBeUndefined();
  });
});

describe('التسويات لا تُسمّى سداداً', () => {
  it('نوعا التسوية يبقيان كما أعادهما الخادم، ويُصدَّران بوسمهما', () => {
    const L = sec('s2').currencies[0];
    expect(L.transactions.map((t) => t.kind)).toEqual(['invoice', 'legacy_settlement', 'unevidenced_settlement']);
    const rows = tableRows(exportSets([sec('s2')], 'all', '', 'asc')[0], T);
    expect(rows.map((r) => r[3])).toEqual([STX.ar.kInvoice, STX.ar.kLegacy, STX.ar.kUnevidenced]);
    expect(rows.some((r) => r[3] === STX.ar.kPayment)).toBe(false);
    // والإجماليّ كما يجمعه الخادم (التسويتان ضمن paymentsTotal)، والختاميّ متّسق
    expect(L.paymentsTotal).toBe(600);
    expect(ledgerConsistent(L)).toBe(true);
  });
});

describe('أسماء أوراق Excel', () => {
  it('العملة لا تضيع من اسمٍ طويل، والتكرار بلا حساسيّة حروف، ولا فاصلة عليا في الطرفين', () => {
    const used: Record<string, number> = {};
    const long = 'Mediterranean Shipping Company Holdings';
    const a = sheetName(long, 'USD', used), b = sheetName(long, 'EUR', used);
    expect(a.endsWith('-USD')).toBe(true);
    expect(b.endsWith('-EUR')).toBe(true);
    expect(a.length).toBeLessThanOrEqual(31);
    const c = sheetName('ACME', 'USD', used), d = sheetName('Acme', 'USD', used);
    expect(c.toLowerCase()).not.toBe(d.toLowerCase());
    expect(d.endsWith('-USD')).toBe(true);
    expect(sheetName("'Quoted'", 'EGP', used)).toBe('Quoted-EGP');
  });
});

describe('١٢ · حالات الفراغ الثلاث', () => {
  it('بلا حركات · بعملاتٍ أخرى فقط · أو له دفاتر', () => {
    expect(emptyStateOf(sec('s4'), 'all')).toBe('noTx');
    expect(emptyStateOf(sec('s2'), 'EUR')).toBe('otherCcy');
    expect(emptyStateOf(sec('s1'), 'EUR')).toBeNull();
    expect(ledgersOf(sec('s1'), 'EUR').map((l) => l.currency)).toEqual(['EUR']);
  });
});

describe('١٣ · اتّساق الأرصدة', () => {
  it('الختاميّ = الافتتاحيّ + الفواتير − السداد − الإشعارات، وآخر سطرٍ يساويه', () => {
    for (const id of ['s1', 's2', 's3']) for (const L of sec(id).currencies) expect(ledgerConsistent(L)).toBe(true);
    const L = sec('s1').currencies[0];
    expect(L.closingBalance).toBe(1000 - 400 + 2500.5 - 100 - 1500);
  });
  it('الرصيد الذي أعاده الخادم يُعرض كما هو ولا يُعاد حسابه', () => {
    const raw = { currency: 'USD', openingBalance: 0, closingBalance: 999, invoicesTotal: 10, paymentsTotal: 0, creditsTotal: 0, transactions: [{ date: '2026-01-01', type: 'debit', kind: 'invoice', debit: 10, credit: 0, balance: 777 }] };
    const L = normalizeLedger(raw);
    expect(L.closingBalance).toBe(999);
    expect(L.transactions[0].balance).toBe(777);
  });
});
