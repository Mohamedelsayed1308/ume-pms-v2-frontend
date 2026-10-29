import { describe, expect, it } from 'vitest';
import { matchBunkerInSheet } from '@/lib/reports/bunkerInSheet';

// أرقام بوسيدون الحقيقيّة (٢٩ أكتوبر ٢٠٢٦)
const lines = [
  { ref: '62', month: '2026-06', date: '2026-06-27', amount: 66323.29 },
  { ref: '67', month: '2026-07', date: '2026-07-11', amount: 51861.38 },
  { ref: '69', month: '2026-07', date: '2026-07-19', amount: 224744.78 },
  { ref: '79', month: '2026-08', date: '2026-08-19', amount: 60591.81 },
  { ref: '80', month: '2026-08', date: '2026-08-21', amount: 63561.9 },
  { ref: '82', month: '2026-08', date: '2026-08-26', amount: 81128.5 },
  { ref: '93', month: '2026-09', date: '2026-09-24', amount: 75305.53 },
  { ref: '95', month: '2026-10', date: '2026-10-01', amount: 88544.2 },
  { ref: '96', month: '2026-10', date: '2026-10-04', amount: 0 },
];
const doc = (id: string, number: string, date: string, usd: number) => ({ id, number, date, usd });

describe('matchBunkerInSheet', () => {
  it('يربط الفاتورة بنسختها في الشيت إلى القرش، ولو في شهرٍ آخر', () => {
    const m = matchBunkerInSheet([
      doc('a', '26-06-03', '2026-06-26', 224744.78),
      doc('b', 'F-26095', '2026-10-06', 88544.2),
    ], lines);
    expect(m.get('a')).toEqual({ ref: '69', month: '2026-07', amount: 224744.78 });
    expect(m.get('b')?.ref).toBe('95');
  });

  it('لا يربط فاتورةً لا نسخة لها — ولا بفارق سنتٍ واحد', () => {
    const m = matchBunkerInSheet([
      doc('a', '26-09-10', '2026-09-23', 83458.25),
      doc('b', 'X', '2026-08-01', 81128.51),
    ], lines);
    expect(m.size).toBe(0);
  });

  it('المربوط يدويّاً يأخذ رحلته وإن اختلف المبلغ (صافٍ من العمولة)', () => {
    const m = matchBunkerInSheet([
      doc('a', 'B-26083', '2026-07-15', 61178.63),
      doc('b', 'B-26091', '2026-08-12', 63995.63),
    ], lines, { 'B-26083': '79', 'B-26091': '80' });
    expect(m.get('a')).toEqual({ ref: '79', month: '2026-08', amount: 60591.81 });
    expect(m.get('b')?.ref).toBe('80');
  });

  it('المربوط برحلةٍ غير موجودة لا يُربط آليّاً بغيرها', () => {
    const m = matchBunkerInSheet([doc('a', 'B-1', '2026-08-01', 81128.5)], lines, { 'B-1': '999' });
    expect(m.size).toBe(0);
  });

  it('سطر الشيت الواحد يقابل فاتورةً واحدةً فقط', () => {
    const m = matchBunkerInSheet([
      doc('a', 'A', '2026-10-06', 88544.2),
      doc('b', 'B', '2026-10-07', 88544.2),
    ], lines);
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
  });

  it('فواتير بوسيدون: تُترك المكرّرة السبع هنا، وتبقى B-26022 التي لا نسخة لها', () => {
    const docs = [
      doc('1', '26-06-03', '2026-06-26', 224744.78), doc('2', 'B-26075', '2026-06-29', 66323.29),
      doc('3', 'B-26079', '2026-07-13', 51861.38), doc('4', 'B-26083', '2026-07-15', 61178.63),
      doc('5', 'B-26091', '2026-08-12', 63995.63), doc('6', 'B-26102', '2026-09-23', 75305.53),
      doc('7', 'F-26095', '2026-10-06', 88544.2), doc('8', 'B-26022', '2026-02-22', 22251.52),
    ];
    const m = matchBunkerInSheet(docs, lines, { 'B-26083': '79', 'B-26091': '80' });
    const total = docs.filter((d) => m.has(d.id)).reduce((s, d) => s + d.usd, 0);
    expect(m.size).toBe(7);
    expect(m.has('8')).toBe(false);
    expect(Math.round(total * 100) / 100).toBe(631953.44); // مجموع السبع المكرّرة هنا (والثامنة B-26105 ليست في هذه العيّنة)
  });
});
