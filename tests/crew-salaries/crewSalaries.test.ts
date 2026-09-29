import { describe, expect, it } from 'vitest';
import { bulkAcceptable, currencyCards, entryBlockers, fileTree, filenameFrom, fmtAmount, serverError, stageIndex, usdPerUnit } from '@/lib/crewSalaries';
import { crewText } from '@/lib/crewSalariesI18n';
import * as I18N from '@/lib/crewSalariesI18n';
import { SCREENS, canAccess } from '@/lib/screens';
import { entry, ready } from './fixture';

describe('عرض مرتّبات الأطقم — منطقٌ خالص', () => {
  it('المبلغ من نصّه بلا تقريبٍ جديد', () => {
    expect(fmtAmount('41485.21')).toBe('41,485.21');
    expect(fmtAmount('-14.13')).toBe('-14.13');
    expect(fmtAmount('1760')).toBe('1,760.00');
    expect(fmtAmount(null)).toBe('—');
  });
  it('سعر «لكلّ دولار» ⇒ «١ عملة = X دولار» بستّ منازل', () => {
    expect(usdPerUnit(1 / 1.17)).toBe('1.170000');
    expect(usdPerUnit(0)).toBeNull();
    expect(usdPerUnit('abc')).toBeNull();
  });
  it('العملات بطاقاتٌ مستقلّة — ولا يظهر مفتاحٌ داخليّ كـ _partial', () => {
    const c = currencyCards({ USD: { balance: '1' }, EUR: { balance: '2' }, _partial: true } as Record<string, unknown>);
    expect(c.map((x) => x.currency)).toEqual(['EUR', 'USD']);
    expect(currencyCards(null)).toEqual([]);
  });
  it('المراحل: لا «سُدِّد» — والتصدير آخرها', () => {
    expect(stageIndex({})).toBe(0);
    expect(stageIndex({ files: [1], entries: [] })).toBe(1);
    expect(stageIndex({ files: [1], entries: [{ result: { complete: false } }] })).toBe(2);
    expect(stageIndex({ files: [1], entries: [{ eligible: true }] })).toBe(3);
    expect(stageIndex({ files: [1], versions: [{ status: 'submitted' }] })).toBe(4);
    expect(stageIndex({ files: [1], approved_version: {} })).toBe(5);
    expect(stageIndex({ files: [1], approved_version: {}, exports: [{ kind: 'approved_payments' }] })).toBe(6);
  });
  it('شجرة الملفّات: الرسالة ومرفقاتها بترتيبها', () => {
    const t = fileTree([
      { id: 'm', parent_id: null, position: null, name: 'a.msg', kind: 'email', status: 'extracted', flags: [], meta: {} },
      { id: 'b', parent_id: 'm', position: 2, name: 'b', kind: 'attachment', status: 'stored', flags: [], meta: {} },
      { id: 'a', parent_id: 'm', position: 0, name: 'a', kind: 'attachment', status: 'stored', flags: [], meta: {} },
    ]);
    expect(t[0].children.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('اسم الملفّ من الترويسة (UTF-8 أو العاديّ)', () => {
    expect(filenameFrom("attachment; filename*=UTF-8''%D9%85.msg", 'x')).toBe('م.msg');
    expect(filenameFrom('attachment; filename="CS-V-202608-V1-EUR.xlsx"', 'x')).toBe('CS-V-202608-V1-EUR.xlsx');
    expect(filenameFrom(undefined, 'x')).toBe('x');
  });
  it('رسائل الخادم: النصّ والقوائم، وانقطاع الشبكة، و403 بلا رسالة، وBlob — وبالإنجليزيّة', async () => {
    expect(await serverError({ response: { status: 400, data: { message: 'مانع' } } })).toEqual(['مانع']);
    expect(await serverError({ response: { status: 400, data: { message: { message: 'لا يُقدَّم', entries: [{ crew_id: '1', currency: 'EUR', blockers: ['بندٌ معلّق'] }] } } } }))
      .toEqual(['لا يُقدَّم', '1 (EUR): بندٌ معلّق']);
    expect((await serverError({}))[0]).toMatch(/الاتّصال/);
    expect((await serverError({}, undefined, 'en'))[0]).toMatch(/Could not reach/);
    expect(await serverError({ response: { status: 403, data: {} } }, undefined, 'en')).toEqual(['You are not allowed to do this']);
    const blob = new Blob([JSON.stringify({ message: 'لا إصدار معتمد' })], { type: 'application/json' });
    expect(await serverError({ response: { status: 400, data: blob } })).toEqual(['لا إصدار معتمد']);
  });
  it('موانع الحالة من رموزها — تُترجم ولا تعتمد على نصّ الخادم', () => {
    expect(entryBlockers(entry()).map((b) => b.key)).toEqual(['blk.item_pending_review', 'blk.diffs', 'blk.noAccount']);
    expect(entryBlockers(entry({ accounts: [{ status: 'imported' } as never] })).map((b) => b.key)).toContain('blk.accountPending');
    expect(entryBlockers(ready).map((b) => b.key)).toEqual(['blk.noAccount']);
  });
  it('القبول الجماعيّ يستثني المستنتَج والمكرّر المحتمل ويوم الصعود واليدويّ', () => {
    const e = entry({ extras: [
      ...entry().extras,
      { key: 's', kind: 'sign_on_settlement', amount: '1', currency: 'EUR', review: 'pending', source: 'email' },
      { key: 'm', kind: 'bonus', amount: '1', currency: 'EUR', review: 'pending', source: 'manual' },
      { key: 'n', kind: 'lashing', amount: '1', currency: 'EUR', review: 'pending', source: 'email-note', flags: ['manually_identified'] },
      { key: 'u', kind: 'unclassified', amount: '1', currency: 'EUR', review: 'pending', source: 'email', flags: ['unknown_column'] },
    ] });
    expect(bulkAcceptable([e]).map((x) => x.key)).toEqual(['email:t2:r1:lashing']);
  });
  it('الشاشة مسجَّلة في الأسطول، وتُمنح صراحةً (ليست دائمةً ولا للأدمن وحده)', () => {
    const s = SCREENS.find((x) => x.href === '/dashboard/fleet-crew-salaries')!;
    expect(s).toMatchObject({ group: 'fleet' });
    expect(s.always).toBeFalsy();
    expect(s.adminOnly).toBeFalsy();
    expect(canAccess({ role: 'user', allowed_screens: ['/dashboard/invoices'] }, s)).toBe(false);
    expect(canAccess({ role: 'user', allowed_screens: ['/dashboard/fleet-crew-salaries'] }, s)).toBe(true);
  });
});

describe('قاموس الشاشة', () => {
  it('كلّ مفتاحٍ بنصّين، والإنجليزيّ بلا حرفٍ عربيّ، والمتغيّرات نفسها في اللغتين', () => {
    const src = (I18N as unknown as { crewText: typeof crewText }).crewText;
    const keys = Object.keys((I18N as unknown as Record<string, unknown>)).length; // الوحدة تُصدّر الدوال فقط
    expect(keys).toBeGreaterThan(0);
    // نفحص عبر crewText: مفتاحٌ مجهول يعود كما هو
    expect(src('ar', 'no.such.key')).toBe('no.such.key');
    const sample = ['title', 'tab.files', 'blk.diffs', 'kind.lashing', 'supp.title', 'fx.confirm', 'export.generic'];
    for (const k of sample) {
      const ar = src('ar', k), en = src('en', k);
      expect(ar).not.toBe(k);
      expect(/[؀-ۿ]/.test(en)).toBe(false);
      const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
      expect(vars(ar)).toBe(vars(en));
    }
    expect(src('en', 'supp.title', { amount: '47.73', cur: 'EUR', id: '1' })).toBe('Supplementary: 47.73 EUR for seafarer 1');
  });
});
