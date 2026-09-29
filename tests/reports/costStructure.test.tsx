import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import VesselFinReport, { type FinData } from '@/app/dashboard/reports/VesselFinReport';
import { costSegments, costBreakdown, bucketsFromCodes, type ExecData } from '@/app/dashboard/reports/VesselExecReport';
import { COST_BUCKET_DEFAULTS, POSEIDON, PELAGOS, ALCUDIA } from '@/app/dashboard/reports/VesselProfitReport';

/*
 * رموز هيكل التكاليف — بأمر المالك ٢٩ سبتمبر ٢٠٢٦:
 * A عمولات الوكلاء · B البنكر · C المشتريات · D ميناء ومناولة · E الثابتة · F أخرى.
 * والشرط الحاكم: مجموع بنود كلّ رمزٍ = سطره في الحلقة، مهما تغيّر الربط.
 */

const DEFAULTS: Record<string, string> = { fuel: 'fuel', salaries: 'fixed', purchases: 'purchases', broker: 'agent', egyPort: 'port', ksaPort: 'port', otherExpsE: 'other' };

const exec = (over: Partial<ExecData> = {}, buckets: Record<string, string> = {}): ExecData => ({
  perVoyage: [], revenue: 100000, opExpenses: 0, opNet: 0,
  purchasesTotal: 8000, bunkerCost: 18000, salaries: 25000,
  // سطر الوكلاء 7,300 = بنودٌ مفصّلة 7,000 + 300 دون حدّ العرض
  agentExp: 7300, bookGap: -1000, count: 4,
  costLines: [
    { key: 'fuel', label: 'الوقود', value: 18000 },
    { key: 'broker', label: 'عمولة سمسار', value: 1500 },
    { key: 'egyPort', label: 'رسوم ميناء مصر', value: 2500 },
    { key: 'ksaPort', label: 'رسوم ميناء السعودية', value: 3000 },
    { key: 'otherExpsE', label: 'Other EXPS', value: -500 },
    { key: 'newKey', label: 'بند جديد', value: 500 },
    { key: 'salaries', label: 'مرتبات', value: 25000 },
    { key: 'purchases', label: 'المشتريات', value: 8000 },
  ],
  defaultBuckets: { ...DEFAULTS, ...buckets },
  ...over,
});
const byItem = [{ name: 'تموينات', value: 5000 }, { name: 'صيانة وقطع غيار', value: 2500 }];

describe('bucketsFromCodes', () => {
  it('maps saved codes to groups and ignores locked keys or codes outside A/D/F', () => {
    expect(bucketsFromCodes({ broker: 'D', egyPort: 'A', newKey: 'F', fuel: 'A', ksaPort: 'B', x: 'Z' }))
      .toEqual({ broker: 'port', egyPort: 'agent', newKey: 'other' });
  });
});

describe('default classification', () => {
  // بندٌ بلا تصنيفٍ افتراضيّ يقع في F صامتاً — كذلك وقعت رسوم ميناء بوسيدون (116 ألفاً)
  it.each([POSEIDON, PELAGOS, ALCUDIA])('every expense key of $vessel has a default group', (cfg) => {
    const keys = [...cfg.exportExp, ...cfg.importExp].map((x) => x.key);
    expect(keys.filter((k) => !COST_BUCKET_DEFAULTS[k])).toEqual([]);
  });
  it('Poseidon port fees on both legs are D (port & handling)', () => {
    expect([COST_BUCKET_DEFAULTS.ksaPortE, COST_BUCKET_DEFAULTS.egyPortI]).toEqual(['port', 'port']);
  });
});

describe('costBreakdown', () => {
  const byCode = (e: ExecData) => Object.fromEntries(costSegments(e).map((s) => [s.code, s.value]));

  it('each code adds up exactly to its line in the donut, and codes run A to F', () => {
    const e = exec();
    const g = costBreakdown(e, { purchasesByItem: byItem });
    expect(g.map((x) => x.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const segs = byCode(e);
    for (const x of g) expect(x.value).toBeCloseTo(segs[x.code], 6);
    expect(g.reduce((s, x) => s + x.value, 0)).toBeCloseTo(costSegments(e).reduce((s, x) => s + x.value, 0), 6);
  });

  it('shows the unexplained rest of the agency line and the ledger variance as their own lines under F', () => {
    const f = costBreakdown(exec(), { purchasesByItem: byItem }).find((x) => x.code === 'F')!;
    expect(f.items.find((i) => i.kind === 'residual')?.value).toBeCloseTo(300, 6);
    expect(f.items.find((i) => i.kind === 'gap')?.value).toBeCloseTo(1000, 6);
    // بندٌ جديد لا تصنيف له يذهب إلى F، والخصم السالب يبقى بإشارته
    expect(f.items.map((i) => [i.key, i.value])).toEqual(expect.arrayContaining([['newKey', 500], ['otherExpsE', -500]]));
  });

  it('C lists purchase items, and a gap between the items and the total stays visible', () => {
    const c = costBreakdown(exec({ purchasesTotal: 8000 }), { purchasesByItem: byItem }).find((x) => x.code === 'C')!;
    expect(c.items.map((i) => [i.key, i.value])).toEqual([['item:تموينات', 5000], ['item:صيانة وقطع غيار', 2500], ['purchases', 500]]);
    expect(c.value).toBe(8000);
    // بلا بنود مشتريات: سطرٌ واحد بالإجماليّ
    expect(costBreakdown(exec()).find((x) => x.code === 'C')!.items).toEqual([{ key: 'purchases', label: 'purchases', value: 8000, kind: undefined }]);
  });

  it('drops a group whose net is under half a dollar, as the donut does', () => {
    const e = exec({ agentExp: 7000, bookGap: 0, costLines: [{ key: 'newKey', label: 'n', value: 400 }, { key: 'otherExpsE', label: 'o', value: -400 }, { key: 'egyPort', label: 'e', value: 7000 }] });
    // بندان في F يلغي أحدهما الآخر ⇒ F صافيها صفر فتغيب عن الجدولين
    expect(costSegments(e).some((s) => s.code === 'F')).toBe(false);
    const g = costBreakdown(e);
    expect(g.map((x) => x.code)).toEqual(costSegments(e).map((s) => s.code).sort());
  });

  it('a saved code moves the item and its amount to the new group, and totals still match', () => {
    const e = exec({}, bucketsFromCodes({ broker: 'D' }));
    const g = costBreakdown(e, { purchasesByItem: byItem });
    expect(g.find((x) => x.code === 'A')).toBeUndefined();
    expect(g.find((x) => x.code === 'D')!.items.map((i) => i.key)).toEqual(['ksaPort', 'egyPort', 'broker']);
    const segs = byCode(e);
    for (const x of g) expect(x.value).toBeCloseTo(segs[x.code], 6);
  });
});

/* ── النافذة ── */

const side = (o: Partial<Record<string, number>>, exp: Record<string, number>) => ({
  truck: 0, truckC: 0, veh: 0, vehC: 0, pass: 0, passC: 0, discharge: 0, ...o, exp,
});
const data: FinData = {
  E: side({ truck: 60000, truckC: 30 }, { broker: 1500, egyPort: 2500, otherExpsE: -500, newKey: 500 }),
  I: side({ truck: 40000, truckC: 15 }, { ksaPort: 3000 }),
  revE: 60000, revI: 40000, revenue: 100000,
  expE: 4300, expI: 3000,
  opening: 10000, supplies: 20000, closing: 12000, bunkerCost: 18000,
  salaries: 25000, net: 48700,
  O: 0, P: 0, liqBassam: 0, liqIttihad: 0, count: 4,
};
const purchases = { byItem, items: [], total: 7500 };

function mount(opts: { codes?: Record<string, string>; onSet?: (k: string, c: string | null) => Promise<void> } = {}) {
  const e = exec({ purchasesTotal: 7500 }, bucketsFromCodes(opts.codes || {}));
  return render(
    <VesselFinReport cfg={{ vessel: 'Alcudia', agentExport: 'وكيل البسّام', agentImport: 'وكيل الاتحاد' }}
      month="2026-08" monthLabel="أغسطس 2026" data={data} purchases={purchases} exec={e}
      allocVoy={[]} labelOf={{ broker: 'عمولة سمسار', ksaPort: 'رسوم ميناء السعودية', newKey: 'بند جديد' }}
      revRows={[{ key: 'truck', cKey: 'truckC', label: 'شاحنات' }]}
      costCodes={opts.codes} defaultBuckets={DEFAULTS} onSetCostCode={opts.onSet} onClose={() => {}} />,
  );
}

const detailRows = () => {
  const t = document.querySelector('#vf-doc table.cs-detail') as HTMLTableElement;
  return Array.from(t.tBodies[0].rows).map((r) => Array.from(r.cells).map((c) => c.textContent?.trim()));
};

describe('financial report — cost structure detail', () => {
  it('prints the code next to every group in the donut table and under it every actual item with its code', () => {
    mount();
    const legend = document.querySelector('#vf-doc .dn table') as HTMLTableElement;
    expect(Array.from(legend.rows).slice(0, -1).map((r) => r.cells[0].textContent).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const rows = detailRows();
    expect(rows[0]).toEqual(['A', 'عمولات الوكلاء', '1,500.00', expect.any(String)]);
    expect(rows).toContainEqual(['D', 'EGP Port Dues', '2,500.00', expect.any(String)]);
    expect(rows).toContainEqual(['C', 'تموينات', '5,000.00', expect.any(String)]);
    expect(rows).toContainEqual(['F', 'فروق دفتر المركب (عمود BALANCE)', '1,000.00', expect.any(String)]);
    expect(rows.at(-1)).toEqual(['', 'إجمالي المصروفات', expect.any(String), '100%']);
  });

  it('follows a saved code: the broker moves from A to D in both tables', () => {
    mount({ codes: { broker: 'D' } });
    const rows = detailRows();
    expect(rows.some((r) => r[0] === 'A')).toBe(false);
    expect(rows).toContainEqual(['D', 'عمولة سمسار', '1,500.00', expect.any(String)]);
  });

  it('shows the item-codes editor to the admin only, and saves or resets a code', async () => {
    const { unmount } = mount();
    expect(screen.queryByRole('button', { name: /رموز البنود/ })).toBeNull();
    unmount();

    const onSet = vi.fn().mockResolvedValue(undefined);
    mount({ codes: { egyPort: 'A' }, onSet });
    fireEvent.click(screen.getByRole('button', { name: /رموز البنود/ }));
    // بنود الوكلاء وحدها — لا البنكر ولا المرتّبات ولا المشتريات
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(5);
    const broker = screen.getByRole('combobox', { name: 'عمولة سمسار' }) as HTMLSelectElement;
    expect(within(broker).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'A', 'D', 'F']);
    expect(broker.options[0].textContent).toContain('(A)');
    fireEvent.change(broker, { target: { value: 'D' } });
    await waitFor(() => expect(onSet).toHaveBeenCalledWith('broker', 'D'));
    const egy = screen.getAllByRole('combobox').find((s) => (s as HTMLSelectElement).value === 'A') as HTMLSelectElement;
    fireEvent.change(egy, { target: { value: '' } });
    await waitFor(() => expect(onSet).toHaveBeenCalledWith('egyPort', null));
  });

  it('warns on screen when the saved codes could not be loaded', () => {
    render(
      <VesselFinReport cfg={{ vessel: 'Alcudia', agentExport: 'a', agentImport: 'b' }}
        month="2026-08" monthLabel="أغسطس 2026" data={data} purchases={purchases} exec={exec({ purchasesTotal: 7500 })}
        allocVoy={[]} labelOf={{}} revRows={[]} costCodesWarn onClose={() => {}} />,
    );
    expect(screen.getByRole('status').textContent).toContain('تعذّرت قراءة رموز البنود');
    // والتنبيه خارج المستند: لا يُطبع ولا يدخل ملفّات «حفظ باسم»
    expect(document.querySelector('#vf-doc [role=status]')).toBeNull();
  });

  it('tells the admin when a code could not be saved', async () => {
    const onSet = vi.fn().mockRejectedValue(new Error('403'));
    mount({ onSet });
    fireEvent.click(screen.getByRole('button', { name: /رموز البنود/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'عمولة سمسار' }), { target: { value: 'F' } });
    expect((await screen.findByRole('alert')).textContent).toContain('تعذّر حفظ الرمز');
  });
});
