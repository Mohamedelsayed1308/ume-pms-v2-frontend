'use client';
import { useMemo, useState } from 'react';
import api from '@/lib/api';
import type { MontePackage } from '@/lib/reports/montePackage';
import { KIND_LABEL, describeInput, inputStatuses, type InputKind, type MonteInput, type InputStatus } from '@/lib/reports/monteInputs';

/*
 * مدخلات فريق مونتي داخل الكارت (انظر `lib/reports/monteInputs.ts`).
 * كلّ من يرى شاشة التقارير يُدخل، والمُدخَل يدخل الأرقام في التحديث الآليّ التالي.
 * لا تعديل ولا حذف: التصحيح مُدخَلٌ جديد، والإلغاء بسببٍ يبقى في السجلّ.
 */

type Field = { k: string; ar: string; en: string; type: 'month' | 'text' | 'number' | 'date' | 'currency'; opt?: boolean; hint?: [string, string]; currencies?: string[] };

const NOTE: Field = { k: 'note', ar: 'المستند / الملاحظة', en: 'Document / note', type: 'text' };
const FORMS: Record<InputKind, { fields: Field[]; help: [string, string] }> = {
  ship_cost: {
    help: ['مصروفٌ على السفينة في شهره، لا على رحلة. البند باسمٍ قائم يُجمع معه، وباسمٍ جديد يصير سطراً جديداً. السالب استردادٌ أو إشعارٌ دائن.',
      'A ship cost in its month, not a voyage. An existing item name adds to it; a new name becomes a new line. Negative = refund.'],
    fields: [
      { k: 'month', ar: 'الشهر', en: 'Month', type: 'month' },
      { k: 'label', ar: 'البند', en: 'Item', type: 'text' },
      { k: 'amount', ar: 'المبلغ', en: 'Amount', type: 'number' },
      { k: 'currency', ar: 'العملة', en: 'Currency', type: 'currency', currencies: ['USD', 'SAR', 'EUR'] },
      NOTE,
    ],
  },
  salary: {
    help: ['مرتّبات CFM للشهر. الخانة الفارغة تُبقي ما كان، والصفر يُكتب صفراً. الأحدث للشهر يغلب.',
      'CFM salaries for the month. A blank keeps the current value; zero is written as zero. The latest per month wins.'],
    fields: [
      { k: 'month', ar: 'الشهر', en: 'Month', type: 'month' },
      { k: 'usd', ar: 'بالدولار', en: 'USD', type: 'number', opt: true },
      { k: 'eur', ar: 'باليورو', en: 'EUR', type: 'number', opt: true },
      NOTE,
    ],
  },
  agent_return: {
    help: ['من «إحصائية سفر العبارة» عند كنزي لرِجل العودة. ما تُدخله يغلب ما قبله، والفارغ لا يغيّر شيئاً. الركّاب على المركب والبرّادات برأس للمقارنة فقط.',
      "From Kenzy's return-leg statistics. What you enter overrides; blanks change nothing. On-board passengers and reefers with head are for comparison only."],
    fields: [
      { k: 'voyage', ar: 'الرحلة (رقمان)', en: 'Voyage (2 digits)', type: 'text' },
      { k: 'tickets', ar: 'تذاكر العودة', en: 'Return tickets', type: 'number', opt: true },
      { k: 'no_head', ar: 'برّادات بلا رأس', en: 'Trailers without head', type: 'number', opt: true },
      { k: 'cars', ar: 'سيّارات مرتجع', en: 'Return cars', type: 'number', opt: true },
      { k: 'tript', ar: 'تريبتك', en: 'Triptyque', type: 'number', opt: true },
      { k: 'mafi', ar: 'مافي', en: 'Mafi', type: 'number', opt: true },
      { k: 'tidder', ar: 'تيدر', en: 'Tidder', type: 'number', opt: true },
      { k: 'luggage', ar: 'حاويات أمتعة', en: 'Luggage containers', type: 'number', opt: true },
      { k: 'pax', ar: 'الركّاب على المركب (للمقارنة)', en: 'Passengers on board (comparison)', type: 'number', opt: true },
      { k: 'reefers', ar: 'برّادات برأس (للمقارنة)', en: 'Reefers with head (comparison)', type: 'number', opt: true },
      NOTE,
    ],
  },
  eur_rate: {
    help: ['متوسّط سعر اليورو بالدولار للشهر — يحرّك المرتّبات والتأمين باليورو.',
      'Monthly average USD per EUR — drives EUR salaries and insurance.'],
    fields: [
      { k: 'month', ar: 'الشهر', en: 'Month', type: 'month' },
      { k: 'rate', ar: 'دولار لكلّ يورو', en: 'USD per EUR', type: 'number' },
      NOTE,
    ],
  },
  egp_rate: {
    help: ['سعر الدولار بالجنيه المصريّ لفاتورة ضخّ بنكر سفاجا (4/10) — يحرّك سعر وقود سفاجا.',
      'EGP per USD for the Safaga pumping invoice (4/10) — drives the Safaga fuel price.'],
    fields: [
      { k: 'rate', ar: 'جنيه لكلّ دولار', en: 'EGP per USD', type: 'number' },
      { k: 'date', ar: 'التاريخ', en: 'Date', type: 'date', opt: true },
      NOTE,
    ],
  },
  fuel_invoice: {
    help: ['قيمة فاتورة تموينٍ بتاريخه شاملةً أتعاب الوكيل. لتموينٍ في الكارت يكفي التاريخ والقيمة؛ والتموين الجديد يحتاج الكميّة والرصيد قبله.',
      'A bunker invoice by date, including agent fees. For a bunker already in the card, date and amount suffice; a new one needs tons and ROB before.'],
    fields: [
      { k: 'date', ar: 'تاريخ التموين', en: 'Bunker date', type: 'date' },
      { k: 'invoice', ar: 'رقم الفاتورة', en: 'Invoice no.', type: 'text' },
      { k: 'amount', ar: 'القيمة', en: 'Amount', type: 'number' },
      { k: 'currency', ar: 'العملة', en: 'Currency', type: 'currency', currencies: ['SAR', 'USD'] },
      { k: 'tons', ar: 'الكميّة بالطنّ (لتموينٍ جديد)', en: 'Tons (new bunker)', type: 'number', opt: true },
      { k: 'rob_before', ar: 'الرصيد قبله بالطنّ (لتموينٍ جديد)', en: 'ROB before (new bunker)', type: 'number', opt: true },
      { ...NOTE, opt: true },
    ],
  },
};

const STATUS: Record<InputStatus['state'], [string, string, string]> = {
  applied: ['أُدرج', 'Applied', 'text-emerald-700'],
  waiting: ['ينتظر التحديث التالي', 'Waiting for next update', 'text-amber-700'],
  rejected: ['لم يُطبَّق', 'Not applied', 'text-red-700'],
  voided: ['مُلغى', 'Cancelled', 'text-gray-500 line-through'],
  superseded: ['حلّ محلّه أحدث', 'Superseded', 'text-gray-500'],
};

const apiErrors = (e: unknown): string[] => {
  const d = (e as { response?: { data?: { message?: string; errors?: string[] } } })?.response?.data;
  return d?.errors?.length ? d.errors : [d?.message || 'تعذّر الحفظ'];
};

export default function MonteTeamInputs({ inputs, pkg, en, onChanged }: {
  inputs: MonteInput[]; pkg: MontePackage; en: boolean; onChanged: () => void;
}) {
  const T = (ar: string, eng: string) => (en ? eng : ar);
  const months = pkg.monthly.map((m) => m.month);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<InputKind>('ship_cost');
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');

  const statuses = useMemo(() => inputStatuses(inputs, pkg), [inputs, pkg]);
  const rows = useMemo(() => inputs.filter((i) => i.kind !== 'void').sort((a, b) => b.at.localeCompare(a.at)), [inputs]);
  const waiting = rows.filter((i) => statuses.get(i.id)?.state === 'waiting').length;
  const labels = useMemo(() => Array.from(new Set(pkg.monthly.flatMap((m) => (m.fixed_items || []).map((x) => x.label)))), [pkg]);

  const pick = (k: InputKind) => { setKind(k); setForm({}); setErrors([]); setOk(''); };
  const val = (f: Field) => form[f.k] ?? (f.type === 'month' ? months[months.length - 1] : f.type === 'currency' ? f.currencies![0] : f.k === 'date' && kind === 'egp_rate' ? '2026-10-04' : '');

  const submit = async () => {
    const data: Record<string, unknown> = {};
    for (const f of FORMS[kind].fields) {
      const v = val(f).trim();
      data[f.k] = f.type === 'number' ? (v === '' ? null : Number(v.replace(/,/g, ''))) : v;
    }
    setBusy(true); setErrors([]); setOk('');
    try {
      await api.post('/api/vessel-profit-inputs/monte', { kind, data });
      setForm({}); setOk(T('حُفظ — يدخل الأرقام في التحديث الآليّ التالي', 'Saved — enters the numbers on the next automatic update'));
      onChanged();
    } catch (e) {
      setErrors(apiErrors(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (i: MonteInput) => {
    const reason = window.prompt(T('سبب الإلغاء؟', 'Reason for cancelling?'));
    if (!reason?.trim()) return;
    try {
      await api.post(`/api/vessel-profit-inputs/monte/${i.id}/void`, { reason });
      onChanged();
    } catch (e) {
      window.alert(apiErrors(e).join('\n'));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 print:hidden" data-testid="monte-team-inputs">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold text-gray-800">{T('✍️ مدخلات الفريق', '✍️ Team inputs')}</h3>
        <span className="text-xs text-gray-500">
          {T(`${rows.length} مُدخَلاً`, `${rows.length} inputs`)}
          {waiting ? ` · ${T(`${waiting} ينتظر التحديث التالي`, `${waiting} waiting`)}` : ''}
        </span>
        <button onClick={() => setOpen(!open)} className="ms-auto bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-700">
          {open ? T('إغلاق', 'Close') : T('＋ مُدخَلٌ جديد', '＋ New input')}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {T('يدخل الأرقام في التحديث الآليّ التالي (كلّ ساعتين) باسم من أدخله. لا تعديل ولا حذف: التصحيح مُدخَلٌ جديد، والإلغاء بسبب.',
          'Enters the numbers on the next automatic update (every two hours) under your name. No edits or deletes: correct with a new input, cancel with a reason.')}
      </p>

      {open && (
        <div className="mt-3 border rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMS) as InputKind[]).map((k) => (
              <button key={k} onClick={() => pick(k)}
                className={`text-sm px-3 py-1 rounded-full border ${kind === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {en ? KIND_LABEL[k][1] : KIND_LABEL[k][0]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600">{en ? FORMS[kind].help[1] : FORMS[kind].help[0]}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FORMS[kind].fields.map((f) => (
              <label key={f.k} className={`text-sm space-y-1 ${f.k === 'note' ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                <span className="text-gray-700">{en ? f.en : f.ar}{f.opt ? '' : ' *'}</span>
                {f.type === 'month' ? (
                  <select aria-label={en ? f.en : f.ar} value={val(f)} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="w-full border rounded px-2 py-1">
                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : f.type === 'currency' ? (
                  <select aria-label={en ? f.en : f.ar} value={val(f)} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="w-full border rounded px-2 py-1">
                    {f.currencies!.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input aria-label={en ? f.en : f.ar} value={val(f)} list={f.k === 'label' ? 'monte-input-labels' : undefined}
                    type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} dir={f.type === 'number' ? 'ltr' : undefined}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="w-full border rounded px-2 py-1" />
                )}
              </label>
            ))}
          </div>
          <datalist id="monte-input-labels">{labels.map((l) => <option key={l} value={l} />)}</datalist>
          {errors.map((e, i) => <p key={i} className="text-sm text-red-700">⛔ {e}</p>)}
          {ok && <p className="text-sm text-emerald-700">{ok}</p>}
          <button disabled={busy} onClick={submit} className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? T('جارٍ الحفظ…', 'Saving…') : T('حفظ المُدخَل', 'Save input')}
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-start py-1.5 px-2">{T('الوقت', 'When')}</th>
                <th className="text-start py-1.5 px-2">{T('من', 'By')}</th>
                <th className="text-start py-1.5 px-2">{T('النوع', 'Type')}</th>
                <th className="text-start py-1.5 px-2">{T('التفاصيل', 'Details')}</th>
                <th className="text-start py-1.5 px-2">{T('الحالة', 'Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const s = statuses.get(i.id)!;
                const [ar, eng, cls] = STATUS[s.state];
                const why = s.state === 'rejected' ? `: ${s.reason}` : s.state === 'voided' ? `: ${s.reason} (${s.by})` : '';
                return (
                  <tr key={i.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 px-2 text-xs text-gray-500 whitespace-nowrap">{new Date(i.at).toLocaleString(en ? 'en-GB' : 'ar-EG')}</td>
                    <td className="py-1.5 px-2">{i.by.name}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{en ? KIND_LABEL[i.kind as InputKind][1] : KIND_LABEL[i.kind as InputKind][0]}</td>
                    <td className="py-1.5 px-2">{describeInput(i)}{i.data.note ? <span className="text-xs text-gray-500"> · {String(i.data.note)}</span> : null}</td>
                    <td className={`py-1.5 px-2 text-xs ${cls}`}>{en ? eng : ar}{why}</td>
                    <td className="py-1.5 px-2">
                      {s.state !== 'voided' && (
                        <button onClick={() => cancel(i)} className="text-xs text-red-600 hover:underline">{T('إلغاء', 'Cancel')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
