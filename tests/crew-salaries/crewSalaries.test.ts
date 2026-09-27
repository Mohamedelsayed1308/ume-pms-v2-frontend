import { describe, expect, it } from 'vitest';
import { currencyCards, fileTree, filenameFrom, fmtAmount, serverError, stageIndex, usdPerUnit } from '@/lib/crewSalaries';
import { SCREENS, canAccess } from '@/lib/screens';

describe('عرض مرتّبات الأطقم — منطقٌ خالص', () => {
  it('المبلغ من نصّه بلا تقريبٍ جديد', () => {
    expect(fmtAmount('41485.21')).toBe('41,485.21');
    expect(fmtAmount('-14.13')).toBe('-14.13');
    expect(fmtAmount('1760')).toBe('1,760.00');
    expect(fmtAmount(null)).toBe('—');
  });
  it('سعر «لكلّ دولار» ⇒ «١ عملة = X دولار»، والصفر أو النصّ ليس سعراً', () => {
    expect(usdPerUnit(1 / 1.15)).toBe('1.150000');
    expect(usdPerUnit(0)).toBeNull();
    expect(usdPerUnit('abc')).toBeNull();
  });
  it('العملات بطاقاتٌ مستقلّة — لا مجموع عبرها', () => {
    const c = currencyCards({ USD: { balance: '1' }, EUR: { balance: '2' } });
    expect(c.map((x) => x.currency)).toEqual(['EUR', 'USD']);
    expect(currencyCards(null)).toEqual([]);
  });
  it('المراحل: لا «سُدِّد» — والتصدير آخرها', () => {
    expect(stageIndex({})).toBe(0);
    expect(stageIndex({ files: [1], entries: [] })).toBe(1);
    expect(stageIndex({ files: [1], entries: [{ result: { complete: false } }] })).toBe(2);
    expect(stageIndex({ files: [1], entries: [{ result: { complete: true }, differences_acknowledged: true }] })).toBe(3);
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
    expect(t).toHaveLength(1);
    expect(t[0].children.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('اسم الملفّ من الترويسة (UTF-8 أو العاديّ)', () => {
    expect(filenameFrom("attachment; filename*=UTF-8''%D9%85.msg", 'x')).toBe('م.msg');
    expect(filenameFrom('attachment; filename="CS-V-202608-V1-EUR.xlsx"', 'x')).toBe('CS-V-202608-V1-EUR.xlsx');
    expect(filenameFrom(undefined, 'x')).toBe('x');
  });
  it('رسائل الخادم: النصّ والقوائم، وانقطاع الشبكة، و403 بلا رسالة', async () => {
    expect(await serverError({ response: { status: 400, data: { message: 'مانع' } } })).toEqual(['مانع']);
    expect(await serverError({ response: { status: 400, data: { message: { message: 'لا يُقدَّم', entries: [{ crew_id: '1', currency: 'EUR', blockers: ['بندٌ معلّق'] }] } } } }))
      .toEqual(['لا يُقدَّم', '1 (EUR): بندٌ معلّق']);
    expect(await serverError({ response: { status: 409, data: { message: { message: 'مكرَّر', conflicts: ['x'] } } } })).toEqual(['مكرَّر', 'x']);
    expect((await serverError({}))[0]).toMatch(/الاتّصال/);
    expect(await serverError({ response: { status: 403, data: {} } })).toEqual(['لا تملك صلاحية هذا الإجراء']);
    const blob = new Blob([JSON.stringify({ message: 'لا إصدار معتمد' })], { type: 'application/json' });
    expect(await serverError({ response: { status: 400, data: blob } })).toEqual(['لا إصدار معتمد']);
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
