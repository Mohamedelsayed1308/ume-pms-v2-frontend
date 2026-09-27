'use client';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Modal, Textarea } from '@/components/ui';
import { useCrewT } from '@/lib/crewSalariesI18n';

/*
 * نافذة السبب — كلّ قرارٍ ماليّ (رفض، تصحيح، إقرار فرق، اعتماد) يُسجَّل بسببه.
 * `ask()` تُعيد وعداً بالنصّ أو `null` عند الإلغاء، فلا يُرسل طلبٌ بلا سبب.
 */
interface Ask { title: ReactNode; label?: string; confirm?: string; danger?: boolean; hint?: ReactNode; optional?: boolean }

export function useReason() {
  const { t } = useCrewT();
  const [state, setState] = useState<(Ask & { open: boolean }) | null>(null);
  const [text, setText] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((a: Ask) => new Promise<string | null>((resolve) => {
    resolver.current = resolve;
    setText('');
    setState({ ...a, open: true });
  }), []);

  const close = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  const valid = state?.optional || text.trim().length >= 3;
  const dialog = (
    <Modal open={!!state?.open} onClose={() => close(null)} title={state?.title} size="md"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(null)}>{t('cancel')}</Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} disabled={!valid} onClick={() => close(text.trim())}>{state?.confirm || t('confirm')}</Button>
        </div>
      )}>
      {state?.hint && <div className="mb-3 text-sm text-gray-600">{state.hint}</div>}
      <Field label={state?.label || t('reason')} required={!state?.optional} hint={state?.optional ? undefined : t('reason.hint')}>
        <Textarea id="crew-reason" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
  return { ask, dialog };
}
