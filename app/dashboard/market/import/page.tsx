'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Card, Icon, Button, EmptyState, cx } from '@/components/ui';

const AGENCIES = [
  { key: 'BADAWY', name: 'بدوي' }, { key: 'ETIHAD', name: 'الاتحاد' },
  { key: 'PAN_MARINE', name: 'بان مارين' }, { key: 'TRIMOV', name: 'تريموف' },
];
const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('en-US');
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const M = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const ymLabel = (idx: number) => { const y = Math.floor(idx / 12); const m = idx % 12; return `${M[m]} ${y}`; };

export default function MarketImportPage() {
  const user = typeof window !== 'undefined' ? getUser() : null;
  const isAdmin = user?.role === 'admin';

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  const [agencies, setAgencies] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ ship_key: '', ship_name_ar: '', agency_key: 'BADAWY', agency_name_ar: 'بدوي', valid_from: '', valid_to: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [agencyMsg, setAgencyMsg] = useState('');

  const loadAgencies = () => api.get('/api/market/agency-history').then((r) => setAgencies(r.data)).catch(() => {});
  const loadLogs = () => api.get('/api/market/import-logs').then((r) => setLogs(r.data)).catch(() => {});
  useEffect(() => { if (isAdmin) { loadAgencies(); loadLogs(); } }, [isAdmin]);

  if (!isAdmin) return (
    <div dir="rtl"><Card className="p-10"><EmptyState icon="shield" title="هذه الشاشة للمسؤول (أدمن) فقط" description="استيراد بيانات السوق وإدارة تاريخ الوكالات متاح للأدمن." /></Card></div>
  );

  async function doPreview() {
    if (!file) return; setBusy(true); setErr(''); setPreview(null); setResult(null);
    try { const fd = new FormData(); fd.append('file', file); const r = await api.post('/api/market/import/preview', fd); setPreview(r.data); }
    catch (e: any) { setErr(e?.response?.data?.message || 'تعذّرت المعاينة'); } finally { setBusy(false); }
  }
  async function doCommit() {
    if (!file) return; setBusy(true); setErr('');
    try { const fd = new FormData(); fd.append('file', file); const r = await api.post('/api/market/import', fd); setResult(r.data); setPreview(null); loadLogs(); loadAgencies(); }
    catch (e: any) { setErr(e?.response?.data?.message || 'تعذّر الاستيراد'); } finally { setBusy(false); }
  }
  async function saveAgency() {
    setAgencyMsg('');
    try {
      const body: any = { ...form, valid_to: form.valid_to || null };
      if (editId) await api.put(`/api/market/agency-history/${editId}`, body); else await api.post('/api/market/agency-history', body);
      setForm({ ship_key: '', ship_name_ar: '', agency_key: 'BADAWY', agency_name_ar: 'بدوي', valid_from: '', valid_to: '' }); setEditId(null); loadAgencies();
    } catch (e: any) { setAgencyMsg(e?.response?.data?.message || 'خطأ'); }
  }
  async function delAgency(id: string) {
    if (!confirm('حذف هذه الفترة قد يؤثر على تقارير سابقة تعتمد على تحديد الوكيل. متابعة؟')) return;
    await api.delete(`/api/market/agency-history/${id}`); loadAgencies();
  }

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">استيراد بيانات السوق وإدارة الوكالات</h1>
          <p className="text-sm text-gray-500 mt-0.5">رفع ملف Excel (شيت Import_Data + Agency_History) — معاينة قبل الحفظ</p>
        </div>
        <Link href="/dashboard/market"><Button variant="outline" size="sm"><Icon name="chart" size={15} /> لوحة السوق</Button></Link>
      </div>

      {/* ── الاستيراد ── */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-3">١. استيراد ملف Excel</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }}
            className="text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-navy-900 file:text-white file:px-3 file:py-2 file:text-sm" />
          <Button size="sm" onClick={doPreview} disabled={!file || busy}>{busy ? 'جارٍ…' : 'معاينة'}</Button>
          {file && <span className="text-xs text-gray-500">{file.name} · {kb(file.size)}</span>}
        </div>
        {err && <p className="text-red-500 text-sm mt-3">{err}</p>}

        {preview && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Stat label="إجمالي الصفوف" value={preview.rows_total} />
              <Stat label="مقبولة" value={preview.rows_accepted} tone="text-emerald-600" />
              <Stat label="مرفوضة" value={preview.rows_rejected} tone="text-red-600" />
              <Stat label="فروق حساب" value={preview.mismatches?.length || 0} tone="text-amber-600" />
            </div>
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              {preview.period && <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">الفترة: {ymLabel(preview.period.from)} → {ymLabel(preview.period.to)}</span>}
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">تاريخ وكالات: {preview.agencyHistory?.length || 0} صف</span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 font-mono">hash: {preview.file_hash?.slice(0, 12)}…</span>
            </div>
            {preview.rejects?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-red-600 mb-1">صفوف مرفوضة:</p>
                <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                  {preview.rejects.map((r: any, i: number) => <div key={i} className="text-gray-600">صف {r.row} ({r.key}): {r.reasons.join('، ')}</div>)}
                </div>
              </div>
            )}
            {preview.mismatches?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-amber-600 mb-1">فروق بين الملف وإعادة الحساب الخادمية (سنعتمد الحساب الخادمي):</p>
                <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                  {preview.mismatches.map((m: any, i: number) => <div key={i} className="text-gray-600">{m.key} · {m.field}: الملف {fmt(m.file)} → المحسوب {fmt(m.computed)}</div>)}
                </div>
              </div>
            )}
            {preview.mismatches?.length === 0 && <p className="text-xs text-emerald-600 mb-3">✓ لا فروق — القيم المحسوبة تطابق الملف.</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={doCommit} disabled={busy || !preview.rows_accepted}>{busy ? 'جارٍ الحفظ…' : `تأكيد الاستيراد (${preview.rows_accepted} صف)`}</Button>
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}>إلغاء</Button>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="font-bold text-emerald-800 flex items-center gap-2"><Icon name="check" size={18} /> تم الاستيراد بنجاح</p>
              <p className="text-sm text-gray-700 mt-1">حُفظ {result.result.rows_accepted} سجل سوق (Upsert) · بُذر {result.agencySeeded} صف تاريخ وكالة · رُفض {result.result.rows_rejected}.</p>
              <Link href="/dashboard/market"><Button size="sm" className="mt-3"><Icon name="chart" size={15} /> فتح لوحة السوق</Button></Link>
            </div>
          </div>
        )}
      </Card>

      {/* ── إدارة تاريخ الوكالة ── */}
      <Card className="p-5">
        <h3 className="font-bold text-gray-800 mb-3">٢. تاريخ وكالات السفن</h3>
        {/* form */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <input placeholder="مفتاح السفينة" value={form.ship_key} onChange={(e) => setForm({ ...form, ship_key: e.target.value.toUpperCase() })} className="border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="اسم السفينة" value={form.ship_name_ar} onChange={(e) => setForm({ ...form, ship_name_ar: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
          <select value={form.agency_key} onChange={(e) => { const a = AGENCIES.find((x) => x.key === e.target.value); setForm({ ...form, agency_key: e.target.value, agency_name_ar: a?.name || '' }); }} className="border rounded-lg px-2 py-1.5 text-sm">
            {AGENCIES.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          <input type="date" title="من" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
          <input type="date" title="إلى (فارغ=مفتوح)" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" />
          <Button size="sm" onClick={saveAgency}>{editId ? 'حفظ التعديل' : 'إضافة فترة'}</Button>
        </div>
        {agencyMsg && <p className="text-red-500 text-xs mb-2">{agencyMsg}</p>}
        {editId && <p className="text-xs text-amber-600 mb-2">⚠️ تعديل فترة قائمة قد يؤثر على تحديد الوكيل في تقارير سابقة. <button onClick={() => { setEditId(null); setForm({ ship_key: '', ship_name_ar: '', agency_key: 'BADAWY', agency_name_ar: 'بدوي', valid_from: '', valid_to: '' }); }} className="underline">إلغاء التعديل</button></p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="text-gray-500 text-xs border-b-2 border-gray-100">
              <th className="text-right py-2 px-2">السفينة</th><th className="text-right py-2 px-2">الوكيل</th><th className="text-right py-2 px-2">من</th><th className="text-right py-2 px-2">إلى</th><th className="py-2 px-2"></th>
            </tr></thead>
            <tbody>
              {agencies.map((h) => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="py-2 px-2 font-medium">{h.ship_name_ar || h.ship_key}</td>
                  <td className="py-2 px-2">{h.agency_name_ar || h.agency_key}</td>
                  <td className="py-2 px-2 text-gray-500">{h.valid_from}</td>
                  <td className="py-2 px-2">{h.valid_to || <span className="text-emerald-600 text-xs">مفتوح (حالي)</span>}</td>
                  <td className="py-2 px-2 text-left">
                    <button onClick={() => { setEditId(h.id); setForm({ ship_key: h.ship_key, ship_name_ar: h.ship_name_ar || '', agency_key: h.agency_key, agency_name_ar: h.agency_name_ar || '', valid_from: h.valid_from, valid_to: h.valid_to || '' }); }} className="text-indigo-600 text-xs hover:underline ml-2">تعديل</button>
                    <button onClick={() => delAgency(h.id)} className="text-red-500 text-xs hover:underline">حذف</button>
                  </td>
                </tr>
              ))}
              {agencies.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">لا يوجد تاريخ وكالات بعد (يُبذر تلقائياً عند الاستيراد)</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── سجل الاستيراد ── */}
      <Card className="p-5 overflow-x-auto">
        <h3 className="font-bold text-gray-800 mb-3">٣. سجل عمليات الاستيراد</h3>
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="text-gray-500 text-xs border-b-2 border-gray-100">
            <th className="text-right py-2 px-2">الملف</th><th className="text-right py-2 px-2">المستخدم</th><th className="text-right py-2 px-2">الوقت</th><th className="text-left py-2 px-2">مقبول/مرفوض</th><th className="text-right py-2 px-2">hash</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-gray-50">
                <td className="py-2 px-2 font-medium">{l.filename}</td>
                <td className="py-2 px-2 text-gray-600">{l.uploaded_by || '—'}</td>
                <td className="py-2 px-2 text-gray-500">{l.created_at?.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-2 px-2 text-left tabular-nums">{l.rows_accepted}/{l.rows_rejected}</td>
                <td className="py-2 px-2 text-gray-400 font-mono text-xs">{l.file_hash?.slice(0, 10) || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">لا عمليات استيراد بعد</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className={cx('text-xl font-bold', tone || 'text-gray-700')}>{fmt(value)}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
