import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { STATEMENTS, SUPPLIERS } from './fixtures';
import { STX } from '@/lib/reports/statementText';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import SupplierStatementReport from '@/app/dashboard/reports/SupplierStatementReport';

const T = STX.ar;
const idOf = (url: string) => url.split('/').pop()!;
const okImpl = (url: string) => Promise.resolve({ data: STATEMENTS[idOf(url)] });

function mount(props: Partial<Parameters<typeof SupplierStatementReport>[0]> = {}) {
  return render(
    <SupplierStatementReport locale="ar" userId="u-1" allowed suppliers={SUPPLIERS}
      suppliersLoading={false} suppliersError="" initial={null} {...props} />,
  );
}
const pick = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name }));
const runBtn = () => screen.getByRole('button', { name: T.run });

beforeEach(() => { get.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('١ · المورّد المكرّر في الرابط', () => {
  it('suppliers=s1,s1,unknown يُرسل طلباً واحداً لـ s1 وينبّه بالمستبعَد', async () => {
    get.mockImplementation(okImpl);
    mount({ initial: { sups: ['s1', 's1', 'unknown'], ccy: 'all' } });
    await screen.findByRole('heading', { name: 'Red Sea Marine' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/api/invoices/statement/supplier/s1');
    expect(screen.getByText(T.linkDropped(1))).toBeTruthy();
  });
});

describe('٤ · تغيير الاختيارات أثناء التحميل', () => {
  it('الردّ القديم يُتجاهَل، وتنبيه الإلغاء يظهر، ولا تُعرض نتائج قديمة', async () => {
    const pending: Record<string, (v: unknown) => void> = {};
    get.mockImplementation((url: string) => new Promise((res) => { pending[idOf(url) + (pending[idOf(url)] ? '#2' : '')] = res; }));
    mount();
    pick('Red Sea Marine');
    fireEvent.click(runBtn());
    pick('Suez Bunkering');                                         // يُلغي الطلب الجاري
    expect(screen.getByText(T.cancelled)).toBeTruthy();
    await act(async () => { pending.s1({ data: STATEMENTS.s1 }); });
    expect(screen.queryByRole('heading', { name: 'Red Sea Marine' })).toBeNull();

    // طلبان سريعان: الأحدث وحده يُعرض
    fireEvent.click(runBtn());
    await act(async () => {
      pending['s1#2']({ data: STATEMENTS.s1 });
      pending.s2({ data: STATEMENTS.s2 });
    });
    await screen.findByRole('heading', { name: 'Suez Bunkering' });
    expect(screen.getByRole('heading', { name: 'Red Sea Marine' })).toBeTruthy();
  });
});

describe('٥ · فشل التحديث', () => {
  it('يُبقي آخر نتائج ناجحة ويُظهر شريط «فشل التحديث»', async () => {
    get.mockImplementation(okImpl);
    mount();
    pick('Suez Bunkering');
    fireEvent.click(runBtn());
    await screen.findByRole('heading', { name: 'Suez Bunkering' });
    get.mockImplementation(() => Promise.reject(new Error('net')));
    fireEvent.click(runBtn());
    await screen.findByText(T.stale);
    expect(screen.getByRole('heading', { name: 'Suez Bunkering' })).toBeTruthy();
  });
});

describe('٩ · بلا صلاحية', () => {
  it('رسالة منعٍ وصفر طلبات — حتّى مع رابطٍ فيه مورّدون', async () => {
    get.mockImplementation(okImpl);
    mount({ allowed: false, initial: { sups: ['s1'], ccy: 'all' } });
    expect(screen.getByRole('alert').textContent).toBe(T.noAccess);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });
  it('مورّدٌ خارج القائمة المسموحة يُستبعد من الطلب', async () => {
    get.mockImplementation(okImpl);
    mount({ suppliers: SUPPLIERS.filter((s) => s.id !== 's3'), initial: { sups: ['s1', 's3'], ccy: 'all' } });
    await screen.findByRole('heading', { name: 'Red Sea Marine' });
    expect(get.mock.calls.map((c) => idOf(c[0]))).toEqual(['s1']);
  });
});

describe('١٢ · حالات الفراغ و«عرض كل العملات»', () => {
  it('ثلاث حالاتٍ منفصلة، والزرّ يُعيد التشغيل بكلّ العملات', async () => {
    get.mockImplementation(okImpl);
    mount({ initial: { sups: ['s2', 's4'], ccy: 'EUR' } });
    await screen.findByText(T.noCcyAny('EUR'));                    // لا أحد له يورو
    const s2 = screen.getByRole('region', { name: 'Suez Bunkering' });
    expect(within(s2).getByText(T.noCcyTx, { exact: false })).toBeTruthy();
    const s4 = screen.getByRole('region', { name: 'Port Services' });
    expect(within(s4).getAllByText(T.noTx).length).toBeGreaterThan(0);
    get.mockClear();
    fireEvent.click(within(s2).getByRole('button', { name: T.showAllCcy }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await screen.findByRole('table', { name: /Suez Bunkering · USD/ });
  });
  it('بحثٌ لا يطابق شيئاً في دفترٍ موجود', async () => {
    get.mockImplementation(okImpl);
    mount({ initial: { sups: ['s2'], ccy: 'all' } });
    await screen.findByRole('heading', { name: 'Suez Bunkering' });
    fireEvent.change(screen.getByLabelText(T.txSearch), { target: { value: 'لا-يوجد' } });
    expect(screen.getByText(T.noMatch)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: T.clearTxq }));
    expect(document.activeElement).toBe(screen.getByLabelText(T.txSearch));
  });
});

describe('«عرض كل العملات» يبني على المطبَّق', () => {
  it('لا يُرسل مورّداً أُضيف إلى المسوّدة دون تطبيق', async () => {
    get.mockImplementation(okImpl);
    mount({ initial: { sups: ['s2'], ccy: 'EUR' } });
    await screen.findByText(T.noCcyAny('EUR'));
    pick('Red Sea Marine');                                          // إضافةٌ غير مطبّقة
    get.mockClear();
    const s2 = screen.getByRole('region', { name: 'Suez Bunkering' });
    fireEvent.click(within(s2).getByRole('button', { name: T.showAllCcy }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(idOf(get.mock.calls[0][0])).toBe('s2');
  });
});

describe('٨ · نافذة الطباعة', () => {
  it('تحبس التركيز، وEsc يُغلقها ويُعيد التركيز، وinert يعود كما كان، وتحمل كلّ الصفوف', async () => {
    get.mockImplementation(okImpl);
    const outside = document.createElement('div');
    outside.inert = true;                                             // نافذةٌ أخرى كانت خاملةً قبلنا
    document.body.appendChild(outside);
    mount({ initial: { sups: ['s1'], ccy: 'all' } });
    await screen.findByRole('heading', { name: 'Red Sea Marine' });
    const opener = screen.getByRole('button', { name: T.print });
    opener.focus();
    fireEvent.click(opener);
    const dlg = await screen.findByRole('dialog');
    await waitFor(() => expect(dlg.contains(document.activeElement)).toBe(true));
    expect(dlg.querySelectorAll('tbody tr').length).toBe(6);         // كلّ المطابق من كلّ الصفحات
    // Tab من آخر زرٍّ يعود لأوّله
    const btns = within(dlg).getAllByRole('button');
    btns[btns.length - 1].focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(btns[0]);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(outside.inert).toBe(true);                                 // لم يُمسّ
    outside.remove();
  });
});

describe('٣ · الافتتاحيّ المفقود على الشاشة', () => {
  it('الدفتر يعرض «غير متاح» و«صافي تراكمي»، والملخّص بلا ختاميّ', async () => {
    get.mockImplementation(okImpl);
    mount({ initial: { sups: ['s3'], ccy: 'all' } });
    await screen.findByRole('heading', { name: 'Nile Catering' });
    // على الشاشة — وورقة الطباعة المخفيّة تحمل الرأس نفسه فتُستثنى بالتحديد
    const onScreen = screen.getByRole('region', { name: 'Nile Catering' });
    expect(within(onScreen).getByText(T.netBanner)).toBeTruthy();
    expect(within(onScreen).getByRole('columnheader', { name: T.netHead })).toBeTruthy();
    expect(within(onScreen).getAllByText(T.openingNA).length).toBeGreaterThan(0);
    // وورقة الطباعة تحمل الوسم نفسه
    const printRoot = document.querySelector('[data-print-root]') as HTMLElement;
    expect(within(printRoot).getByRole('columnheader', { name: T.netHead })).toBeTruthy();
    expect(printRoot.textContent).toContain(T.basisNet);
  });
});
