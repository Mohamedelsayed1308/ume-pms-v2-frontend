'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Button, Badge, Input, Select, Field, Skeleton, EmptyState, Modal, useToast, cx } from '@/components/ui';
import NewAccountModal from './NewAccountModal';

/*
 * الفواتير التي تنتظر قيداً.
 *
 * تُعرَض كلها لا المؤهَّلة وحدها: إخفاء غير المؤهَّلة يجعل السبب مجهولاً، فيظنّ
 * القارئ أن الفاتورة ضاعت لا أنها تنتظر دليلاً.
 *
 * والحساب يأتي من افتراضي المورّد فيُملأ وحده — والعمود هنا **للمراجعة وتعديل
 * ما يشذّ**، لا لإدخال ستة وثلاثين اختياراً متتالياً. الاختيار المتكرّر بلا تفكير
 * هو منبت أخطاء التصنيف.
 */

const money = (n: any, c?: string) =>
  `${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`;
const dateOnly = (d: any) => (d ? String(d).slice(0, 10) : '—');

interface Row {
  id: string; invoice_number: string; currency: string; total_amount: string;
  invoice_date: string; approval_status: string; supplier_id: string | null;
  supplier_name: string | null; vessel_name: string | null;
  receipt_count: number; debit_account_id: string | null;
  account_code: string | null; account_name: string | null;
  assumed_category: 'GOODS' | 'PERIOD_SERVICE'; eligible: boolean; reason: string;
}

export default function PostableInvoices({ entityId, onDone }: { entityId: string; onDone?: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyEligible, setOnlyEligible] = useState(true);

  // تجاوزات محلية: ما غيّره المستخدم في هذه الجلسة يعلو على الافتراضي.
  const [override, setOverride] = useState<Record<string, { account?: string; category?: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: string[]; failed: { ref: string; msg: string }[] } | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);

  async function load() {
    if (!entityId) return;
    setLoading(true);
    const r = await Promise.allSettled([
      api.get(`/api/accounting/bridge/postable-invoices?legal_entity_id=${entityId}`),
      api.get(`/api/accounting/accounts?legal_entity_id=${entityId}`),
    ]);
    if (r[0].status === 'fulfilled') setRows(r[0].value.data || []);
    if (r[1].status === 'fulfilled') {
      const CAPITALIZABLE = ['1200', '1510'];
      const usable = (r[1].value.data || []).filter((a: any) =>
        a.is_postable && a.is_active !== false &&
        (a.account_type === 'expense' || CAPITALIZABLE.includes(a.code)));
      const rank = (g: string) => ({ VESSEL_OPEX: 0, ADMIN: 1, FINANCE: 2 } as any)[g] ?? 3;
      usable.sort((a: any, b: any) => rank(a.account_group) - rank(b.account_group) || a.code.localeCompare(b.code));
      setAccounts(usable);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [entityId]);

  const acctOf = (r: Row) => override[r.id]?.account ?? r.debit_account_id ?? '';
  const catOf = (r: Row) => override[r.id]?.category ?? r.assumed_category;

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (onlyEligible ? r.eligible : true))
      .filter((r) => !s || [r.invoice_number, r.supplier_name].some((v) => (v || '').toLowerCase().includes(s)));
  }, [rows, q, onlyEligible]);

  // القابل للإنشاء: مؤهَّل وله حساب. بلا حساب لا قيد — ولا يُخمَّن.
  const readyIds = useMemo(
    () => shown.filter((r) => r.eligible && acctOf(r)).map((r) => r.id), [shown, override]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allSelected = readyIds.length > 0 && readyIds.every((id) => selected.has(id));
  const missingAccount = shown.filter((r) => r.eligible && !acctOf(r)).length;

  function toggleAll() {
    setSelected((p) => {
      const n = new Set(p);
      if (allSelected) readyIds.forEach((id) => n.delete(id));
      else readyIds.forEach((id) => n.add(id));
      return n;
    });
  }

  async function createDrafts() {
    setBusy(true);
    const ok: string[] = []; const failed: { ref: string; msg: string }[] = [];
    for (const r of selectedRows) {
      try {
        await api.post(`/api/accounting/bridge/supplier-invoice/${r.id}`, {
          legal_entity_id: entityId,
          debit_account_id: acctOf(r),
          category: catOf(r),
          backdated_reason:
            `إثبات فاتورة ${r.invoice_number} المؤرَّخة ${dateOnly(r.invoice_date)} — الدفتر بدأ التشغيل الفعلي في أغسطس 2026.`,
        });
        ok.push(r.invoice_number);
      } catch (e: any) {
        failed.push({ ref: r.invoice_number, msg: e?.response?.data?.message || 'تعذّر الإنشاء' });
      }
    }
    setResult({ ok, failed });
    setSelected(new Set()); setConfirmOpen(false); setBusy(false);
    await load(); onDone?.();
  }

  const label = (a: any) =>
    `${a.code} — ${a.name}` +
    (a.account_group === 'VESSEL_OPEX' ? '  [تشغيل مركب]'
      : a.account_group === 'ADMIN' ? '  [إدارية]'
      : a.account_group === 'FINANCE' ? '  [تمويلية]' : '');

  if (loading) return <div className="p-4 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Input placeholder="بحث برقم الفاتورة أو المورّد…" value={q}
          onChange={(e: any) => setQ(e.target.value)} className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
          المؤهَّلة فقط
        </label>
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2 ms-auto">
            <span className="text-sm text-gray-600">{selectedRows.length} محدَّدة</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
            <Button size="sm" variant="primary" onClick={() => setConfirmOpen(true)}>أنشئ المسوّدات</Button>
          </div>
        )}
      </div>

      {missingAccount > 0 && (
        <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <b>{missingAccount}</b> فاتورة مؤهَّلة بلا حساب. اختر لها حساباً في العمود، أو اضبط افتراضي مورّدها
          مرّة واحدة في شاشة الموردين فيملأ كل فواتيره.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!readyIds.length}
                  title="تحديد المؤهَّل الذي له حساب" />
              </th>
              <th className="px-4 py-2 text-right">الفاتورة</th>
              <th className="px-4 py-2 text-right">المورّد</th>
              <th className="px-4 py-2 text-right">التاريخ</th>
              <th className="px-4 py-2 text-left">المبلغ</th>
              <th className="px-4 py-2 text-right w-72">حساب المصروف</th>
              <th className="px-4 py-2 text-right">التصنيف</th>
              <th className="px-4 py-2 text-center">الأهلية</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => {
              const chosen = acctOf(r);
              const isOverridden = !!override[r.id]?.account && override[r.id]?.account !== r.debit_account_id;
              return (
                <tr key={r.id} className={cx('hover:bg-blue-50/40', selected.has(r.id) && 'bg-blue-50')}>
                  <td className="px-3 py-2">
                    {r.eligible && chosen && (
                      <input type="checkbox" checked={selected.has(r.id)}
                        onChange={() => setSelected((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-4 py-2">
                    <div className="min-w-[13rem] break-words leading-snug" dir="auto"
                      title={r.supplier_name || ''}>{r.supplier_name || '—'}</div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{dateOnly(r.invoice_date)}</td>
                  <td className="px-4 py-2 text-left tabular-nums whitespace-nowrap">{money(r.total_amount, r.currency)}</td>
                  <td className="px-4 py-2">
                    <Select value={chosen}
                      onChange={(e: any) => {
                        if (e.target.value === '__new') { setNewFor(r.id); return; }
                        setOverride((p) => ({ ...p, [r.id]: { ...p[r.id], account: e.target.value } }));
                      }}
                      className={cx('text-xs', !chosen && 'border-amber-400')}>
                      <option value="">— بلا حساب —</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
                      <option value="__new">＋ حساب جديد…</option>
                    </Select>
                    {isOverridden && <div className="mt-0.5 text-[11px] text-blue-600">مُعدَّل عن افتراضي المورّد</div>}
                  </td>
                  <td className="px-4 py-2">
                    <Select value={catOf(r)}
                      onChange={(e: any) => setOverride((p) => ({ ...p, [r.id]: { ...p[r.id], category: e.target.value } }))}
                      className="text-xs">
                      <option value="GOODS">سلع</option>
                      <option value="PERIOD_SERVICE">خدمة بفترة</option>
                    </Select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {r.eligible
                      ? <Badge tone="success">مؤهَّلة</Badge>
                      : <Badge tone="warning" className="cursor-help">{r.reason.slice(0, 28)}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && (
          <EmptyState icon="check" title="لا فواتير تنتظر"
            description={onlyEligible ? 'كل المؤهَّل دخل الدفتر. أزل «المؤهَّلة فقط» لترى ما ينتظر دليلاً.' : 'لا نتائج بهذا البحث.'} />
        )}
      </div>

      <NewAccountModal open={!!newFor} onClose={() => setNewFor(null)} entityId={entityId} defaultType="expense"
        onCreated={(a) => {
          setAccounts((prev) => [...prev, a]);
          if (newFor) setOverride((p) => ({ ...p, [newFor]: { ...p[newFor], account: a.id } }));
        }} />

      <Modal open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)}
        title={`إنشاء ${selectedRows.length} مسوّدة`} size="lg">
        <div className="space-y-4">
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {selectedRows.map((r) => {
                  const a = accounts.find((x) => x.id === acctOf(r));
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.invoice_number}</td>
                      <td className="px-3 py-1.5 text-xs">{a ? `${a.code} — ${a.name}` : '—'}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-xs">{money(r.total_amount, r.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            تُنشأ <b>مسوّدات</b> لا قيوداً مُرحَّلة. راجعها في تبويب <b>القيود</b> ثم رحّلها هناك —
            فتكون المراجعة مرّتين قبل ما لا رجعة فيه.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>إلغاء</Button>
            <Button variant="primary" onClick={createDrafts} loading={busy}>
              أنشئ {selectedRows.length} مسوّدة
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="نتيجة الإنشاء">
        {result && (
          <div className="space-y-3">
            {result.ok.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-sm font-medium text-emerald-900">أُنشئت {result.ok.length} مسوّدة</div>
                <div className="mt-1 font-mono text-xs text-emerald-800">{result.ok.join(' · ')}</div>
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-sm font-medium text-red-900">تعذّر {result.failed.length}</div>
                <ul className="mt-1 space-y-1 text-xs text-red-800">
                  {result.failed.map((f, i) => <li key={i}><b>{f.ref}</b> — {f.msg}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setResult(null)}>إغلاق</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
