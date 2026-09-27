'use client';
import { useRef, useState } from 'react';
import api from '@/lib/api';
import { Badge, Button, Callout, Field, Input, cx } from '@/components/ui';
import { FILE_STATUS, flagLabel, serverError, type FileMeta } from '@/lib/crewSalaries';

/*
 * استيراد رسالة المرتّبات (.msg) أو تصدير CFM (.xlsx) كما هو.
 * النتيجة تُعرض بصدق: مكرّر لم يُخزَّن، أو ملفٌّ بلا دورة (يحتاج تعيين المركب والشهر)،
 * وحالة كلّ مرفق — ولا «نجاحٌ كامل» إن بقي شيءٌ يدويّ.
 */
interface ImportResult {
  duplicate: boolean; message?: string; cycle_id: string | null; needs_assignment?: boolean;
  inference?: FileMeta['inference'];
  attachments?: { position: number; name: string; class: string; status: string; flags: string[] }[];
}

export default function ImportPanel({ onDone, replaces, compact }: {
  onDone: (cycleId: string | null) => void;
  replaces?: { id: string; name: string } | null;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const send = async () => {
    if (!file) return;
    setBusy(true); setErrors([]); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    if (replaces) { fd.append('replaces', replaces.id); fd.append('reason', reason.trim()); }
    try {
      const r = await api.post('/api/crew-salaries/import', fd);
      setResult(r.data);
      setFile(null);
      if (input.current) input.current.value = '';
      onDone(r.data?.cycle_id ?? null);
    } catch (e) {
      setErrors(await serverError(e, 'تعذّر الاستيراد'));
    } finally { setBusy(false); }
  };

  const manual = (result?.attachments || []).filter((a) => a.status === 'needs_manual').length;
  return (
    <div className={cx('space-y-3', !compact && 'p-4')}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={replaces ? `نسخةٌ مصحَّحة بدل «${replaces.name}»` : 'رسالة المرتّبات (.msg) أو تصدير CFM (.xlsx)'} className="flex-1 min-w-[16rem]">
          <input ref={input} type="file" accept=".msg,.xlsx" aria-label="اختيار الملفّ"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700" />
        </Field>
        {replaces && (
          <Field label="سبب الاستبدال" required className="flex-1 min-w-[12rem]">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Button icon="plus" loading={busy} disabled={!file || (!!replaces && reason.trim().length < 3)} onClick={send}>استيراد</Button>
      </div>
      <p className="text-xs text-gray-500">يُحفظ الملفّ كما هو داخل النظام (غير عامّ). لا يُفتح رابطٌ ولا ماكرو، ومحتوى الرسالة بياناتٌ لا تعليمات.</p>

      {errors.length > 0 && (
        <Callout tone="danger" title="لم يُستورد">
          <ul className="list-disc ps-5">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Callout>
      )}
      {result?.duplicate && <Callout tone="info">{result.message}</Callout>}
      {result && !result.duplicate && (
        <Callout tone={result.needs_assignment || manual ? 'warning' : 'success'}
          title={result.needs_assignment ? 'استُورد — ويحتاج تعيين المركب والشهر' : manual ? `استُورد — و${manual} مرفقاً يحتاج إدخالاً يدويّاً` : 'استُورد واستُخرج'}>
          <div className="space-y-1">
            <p>المركب: <b>{result.inference?.vessel || '—'}</b> · الشهر: <b dir="ltr">{result.inference?.month || '—'}</b></p>
            {(result.inference?.conflicts?.length ?? 0) > 0 && <p className="text-red-700">تعارض: {result.inference?.conflicts?.join(' · ')}</p>}
            {(result.attachments || []).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {(result.attachments || []).map((a) => (
                  <li key={a.position} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge tone={FILE_STATUS[a.status]?.tone || 'neutral'}>{FILE_STATUS[a.status]?.label || a.status}</Badge>
                    <span dir="ltr" className="truncate max-w-[22rem]">{a.name}</span>
                    {(a.flags || []).map((f: string) => <span key={f} className="text-gray-500">· {flagLabel(f)}</span>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Callout>
      )}
    </div>
  );
}
