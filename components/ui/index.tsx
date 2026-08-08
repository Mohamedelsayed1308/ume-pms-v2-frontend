'use client';
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';

export { Icon };
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ================= Button ================= */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';
const BTN_V: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-navy-800 text-white hover:bg-navy-700 shadow-sm',
  outline: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};
const BTN_S: Record<Size, string> = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };

export function Button(
  { variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: string },
) {
  return (
    <button disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed', BTN_V[variant], BTN_S[size], className)}
      {...rest}>
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

/* ================= Card ================= */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('bg-white rounded-2xl border border-gray-100 shadow-sm', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
      <div><h3 className="font-bold text-gray-800">{title}</h3>{subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

/* ================= Badge ================= */
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
const TONE: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-sky-50 text-sky-700',
  brand: 'bg-brand-50 text-brand-700',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', TONE[tone], className)}>{children}</span>;
}

/* ================= Input / Select ================= */
export function Field({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="block text-sm text-gray-600 mb-1">{label}</span>}
      {children}
      {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
    </label>
  );
}
const CONTROL = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500';
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'cursor-pointer', className)} {...rest}>{children}</select>;
}

/* ================= Spinner / Skeleton ================= */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse bg-gray-100 rounded-lg', className)} />;
}

/* ================= EmptyState ================= */
export function EmptyState({ icon = 'file', title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mb-3"><Icon name={icon} size={24} /></div>
      <p className="text-gray-700 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ================= Modal ================= */
export function Modal({ open, onClose, title, children, footer, size = 'md' }:
  { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className={cx('bg-white rounded-2xl shadow-xl w-full ume-fade-in max-h-[90vh] overflow-y-auto', w)} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
            <h3 className="font-bold text-gray-800">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100" aria-label="إغلاق"><Icon name="x" size={18} /></button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ================= Drawer (side panel) ================= */
export function Drawer({ open, onClose, title, children, width = 'max-w-md' }:
  { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className={cx('absolute inset-y-0 left-0 bg-white shadow-xl w-full flex flex-col', width)} style={{ animation: 'ume-slide-in-ltr .2s ease-out' }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h3 className="font-bold text-gray-800">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100" aria-label="إغلاق"><Icon name="x" size={18} /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ================= Toast ================= */
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; msg: string }
const ToastCtx = createContext<{ push: (t: ToastTone, m: string) => void } | null>(null);
let toastSeq = 1;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, msg: string) => {
    const id = toastSeq++;
    setItems((s) => [...s, { id, tone, msg }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3500);
  }, []);
  const tones: Record<ToastTone, { c: string; i: string }> = {
    success: { c: 'bg-emerald-600', i: 'check' }, error: { c: 'bg-red-600', i: 'x' }, info: { c: 'bg-brand-600', i: 'bell' },
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center no-print">
        {items.map((t) => (
          <div key={t.id} className={cx('text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 ume-fade-in', tones[t.tone].c)}>
            <Icon name={tones[t.tone].i} size={16} />{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const c = useContext(ToastCtx);
  return {
    success: (m: string) => c?.push('success', m),
    error: (m: string) => c?.push('error', m),
    info: (m: string) => c?.push('info', m),
  };
}
