'use client';
import { useEffect, useRef, useState } from 'react';
import type { SaveFormat } from '@/lib/reports/saveAs';

/**
 * زرّ «حفظ باسم» في رأس نافذة تقرير: PDF · Excel · PowerPoint.
 *
 * يقرأ المستند المعروض من `target` لحظة الضغط، فيخرج الملفّ باللغة والأقسام
 * الظاهرة. والتحويل كلّه في المتصفّح — لا يُرسَل التقرير إلى أيّ خادم.
 *
 * وأثناء الحفظ تُغطّى الصفحة بطبقةٍ شفّافة: تبديل اللغة أو إخفاء قسمٍ في منتصف
 * تصوير الـPDF يُخرج صفحاتٍ قُطعت على مواضع مستندٍ لم يعد موجوداً.
 */
export default function SaveAsMenu({ target, title, fileName, en }: {
  target: () => HTMLElement | null;
  title: string;
  fileName: string;
  en: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SaveFormat | null>(null);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const T = (ar: string, eng: string) => (en ? eng : ar);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('focusin', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 6000);
    return () => clearTimeout(t);
  }, [err]);

  const run = async (fmt: SaveFormat) => {
    const root = target();
    if (!root) return;
    setOpen(false); setErr(''); setBusy(fmt);
    try {
      const { saveReport } = await import('@/lib/reports/saveAs');
      await saveReport(fmt, root, title, fileName);
    } catch (e) {
      console.error('save-as', e);
      setErr(T('تعذّر إنشاء الملفّ — أعد المحاولة.', 'Could not create the file — try again.'));
    } finally {
      setBusy(null);
    }
  };

  /** الأسهم تتنقّل بين الخيارات، وHome/End إلى طرفيها */
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') || []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (j: number) => { e.preventDefault(); items[(j + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };

  const items: { fmt: SaveFormat; label: string; hint: string }[] = [
    { fmt: 'pdf', label: 'PDF', hint: T('نسخةٌ مطابقة للشاشة', 'Exact copy of the screen') },
    { fmt: 'xlsx', label: 'Excel', hint: T('ورقةٌ لكلّ قسم · أرقامٌ قابلةٌ للجمع', 'One sheet per section · live numbers') },
    { fmt: 'pptx', label: 'PowerPoint', hint: T('شرائح بجداولَ قابلةٍ للتحرير', 'Slides with editable tables') },
  ];

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => { setErr(''); setOpen((v) => !v); }} disabled={!!busy}
        aria-haspopup="menu" aria-expanded={open}
        className="bg-[#0f2c5c] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#0b2147] disabled:opacity-60">
        {busy ? T('جارٍ الحفظ…', 'Saving…') : T('💾 حفظ باسم', '💾 Save as')} ▾
      </button>
      {open && (
        <div ref={menu} role="menu" onKeyDown={onMenuKey}
          className="absolute z-20 mt-1 end-0 w-60 bg-white border rounded-lg shadow-lg py-1 text-start">
          {items.map((i) => (
            <button key={i.fmt} type="button" role="menuitem" onClick={() => run(i.fmt)}
              className="w-full text-start px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
              <div className="text-sm font-semibold text-gray-800">{i.label}</div>
              <div className="text-xs text-gray-500">{i.hint}</div>
            </button>
          ))}
        </div>
      )}
      {err && (
        <button type="button" role="alert" onClick={() => setErr('')}
          className="absolute mt-1 end-0 w-60 text-start text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {err}
        </button>
      )}
      {busy && <div className="fixed inset-0 z-[70] cursor-wait" aria-hidden="true" />}
    </div>
  );
}
