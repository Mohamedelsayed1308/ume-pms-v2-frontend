import { describe, expect, it } from 'vitest';
import { prefKey, pushRecent, readIds, readSets, upsertSet, writeIds, writeSets, MAX_SETS } from '@/lib/reports/prefs';
import { cleanSups } from '@/lib/reports/statement';
import { createLatestRequest } from '@/lib/useLatestRequest';
import { matchesAllWords, norm } from '@/lib/reports/text';
import { REPORTS, REPORT_REQUIRES, isReportId, searchText } from '@/app/dashboard/reports/catalog';

describe('٤ · الطلب الأحدث وحده يُحتسب', () => {
  it('طلبان متتاليان: الأوّل يُبطَل ويُلغى', () => {
    const r = createLatestRequest();
    const a = r.start(), b = r.start();
    expect(a.signal.aborted).toBe(true);
    expect(r.isLatest(a.id)).toBe(false);
    expect(r.isLatest(b.id)).toBe(true);
    expect(r.cancel()).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(r.isLatest(b.id)).toBe(false);
  });
});

describe('١١ · استعادة مجموعة محفوظة', () => {
  it('مفتاحٌ لكلّ مستخدم، ولا نتائج، وإعادة تحقّقٍ من الصلاحية', () => {
    const k42 = prefKey('filtersets:supplier-statement', 'u-42');
    expect(k42).toBe('ume_report_filtersets:supplier-statement:u-42');
    const sets = upsertSet([], { name: 'وقود — دولار', sups: ['s1', 's6'], ccy: 'USD' });
    writeSets(k42, sets);
    const stored = JSON.parse(localStorage.getItem(k42)!);
    expect(Object.keys(stored[0]).sort()).toEqual(['ccy', 'name', 'sups']);   // لا نتائج
    expect(readSets(prefKey('filtersets:supplier-statement', 'u-7'))).toEqual([]);   // مستخدمٌ آخر لا يراها
    const restored = readSets(k42)[0];
    const scope = (id: string) => id === 's1';
    const sups = cleanSups(restored.sups, scope);
    expect(sups).toEqual(['s1']);
    expect(new Set(restored.sups).size - sups.length).toBe(1);   // تنبيه «استُبعد 1»
  });
  it('الاسم نفسه يستبدل القديم، والحدّ اثنتا عشرة، والاسم أربعون حرفاً', () => {
    let s = upsertSet([], { name: 'a', sups: ['s1'], ccy: 'all' });
    s = upsertSet(s, { name: 'a', sups: ['s2'], ccy: 'EUR' });
    expect(s).toEqual([{ name: 'a', sups: ['s2'], ccy: 'EUR' }]);
    for (let i = 0; i < 20; i++) s = upsertSet(s, { name: `n${i}`, sups: [], ccy: 'all' });
    expect(s.length).toBe(MAX_SETS);
    expect(upsertSet([], { name: 'x'.repeat(60), sups: [], ccy: 'all' })[0].name.length).toBe(40);
  });
});

describe('١٤ · الدليل: البحث والصلاحية والمثبّتة لكلّ مستخدم', () => {
  const find = (q: string) => REPORTS.filter((r) => matchesAllWords(q, searchText(r))).map((r) => r.id);
  it('البحث بالعربيّة بعد التطبيع وبالإنجليزيّة، وكلّ كلمةٍ يجب أن تُطابق', () => {
    expect(norm('مستحقّاتٌ الإدارة')).toBe('مستحقات الاداره');
    expect(find('مستحقات مورد')).toContain('unpaid-supplier');
    expect(find('مستحقات')).toEqual(expect.arrayContaining(['unpaid-supplier', 'unpaid-vessel']));
    // «المستحقات» تطابق أيضاً فئة «الموردون والمستحقات» — البحث يشمل اسم الفئة (§3)
    expect(find('المستحقات')).toEqual(['supplier-statement', 'unpaid-supplier', 'vessel-suppliers']);
    expect(find('ledger')).toEqual(['supplier-statement']);
    expect(find('overdue')).toEqual(['due-alerts']);
    expect(find('supplier zzz')).toEqual([]);
  });
  it('الصلاحية: يظهر ما تسمح به الشاشات وحده', () => {
    const screens = ['/dashboard/suppliers'];
    const visible = REPORTS.filter((r) => screens.includes(REPORT_REQUIRES[r.id])).map((r) => r.id);
    expect(visible).toEqual(['supplier-statement', 'unpaid-supplier']);
  });
  it('المثبّتة والحديثة لكلّ مستخدم، والحديثة أربعٌ بلا تكرار', () => {
    writeIds(prefKey('favs', 'u-1'), ['supplier-statement', 'not-a-report']);
    expect(readIds(prefKey('favs', 'u-1'), isReportId)).toEqual(['supplier-statement']);
    expect(readIds(prefKey('favs', 'u-2'), isReportId)).toEqual([]);
    let r: string[] = [];
    for (const id of ['a', 'b', 'c', 'a', 'd', 'e']) r = pushRecent(r, id);
    expect(r).toEqual(['e', 'd', 'a', 'c']);
  });
  it('الدليل أربعة عشر تقريراً، ولكلٍّ سؤالٌ ونوع نتيجةٍ وفلاتر', () => {
    expect(REPORTS.length).toBe(14);
    for (const r of REPORTS) { expect(r.question.ar && r.question.en && r.resultType.ar && r.needs.ar).toBeTruthy(); expect(REPORT_REQUIRES[r.id]).toBeTruthy(); }
  });
});
