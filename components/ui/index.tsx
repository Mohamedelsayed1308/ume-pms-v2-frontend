'use client';
import {
  createContext, useContext, useState, useCallback, useEffect, useRef, useMemo,
  type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type SelectHTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes,
} from 'react';
import { Icon } from './Icon';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * نظام واجهة UME
 *
 * القاعدة الحاكمة: **اللون دلالة لا زينة**، والمسافة إيقاع لا مصادفة. كل مكوّن
 * هنا يخدم قراءة بيانات مالية كثيفة — فالكثافة عالية والحدود تفصل والظلال خفيفة.
 *
 * وما يتكرّر في أكثر من شاشة يعيش هنا لا هناك: الجدول المبنيّ يدوياً في سبع عشرة
 * شاشة يعني سبع عشرة كثافة وسبعة عشر لون تمرير — وهو ما يجعل المنتج يبدو
 * مجموعة صفحات لا نظاماً واحداً.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export { Icon };
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ═══════════ Button ═══════════ */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';
const BTN_V: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 shadow-sm',
  outline: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm',
};
const BTN_S: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button(
  { variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: string },
) {
  return (
    <button disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap',
        'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        BTN_V[variant], BTN_S[size], className)}
      {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

/** زرّ أيقونة — التسمية إلزامية لأن الأيقونة وحدها لا تُقرأ بقارئ الشاشة. */
export function IconButton(
  { icon, label, size = 'md', variant = 'ghost', className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: Size; variant?: Variant },
) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <button aria-label={label} title={label}
      className={cx('inline-flex items-center justify-center rounded-lg transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed', BTN_V[variant], box, className)}
      {...rest}>
      <Icon name={icon} size={size === 'sm' ? 15 : 18} />
    </button>
  );
}

/* ═══════════ Surfaces ═══════════ */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  // حدٌّ أوضح من ظلّ أثقل: البيانات الكثيفة تحتاج فصلاً لا ارتفاعاً.
  return <div className={cx('bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_2px_rgba(16,24,40,.05)]', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200/80">
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * ترويسة الصفحة — العنوان والسياق والإجراءات في إيقاع واحد.
 *
 * كانت كل شاشة تبني ترويستها، فاختلفت أحجام العناوين والمسافات بين الشاشات
 * واختلّ الإحساس بأنها منتج واحد.
 */
export function PageHeader({ title, subtitle, actions, meta }:
  { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

/** شريط المرشِّحات — صفّ واحد بإيقاع ثابت، والإجراءات في طرفه. */
export function FilterBar({ children, actions, className }:
  { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200/80', className)}>
      {children}
      {actions && <div className="flex items-center gap-2 ms-auto">{actions}</div>}
    </div>
  );
}

/* ═══════════ Badge / Status ═══════════ */
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
const TONE: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};
const DOT: Record<Tone, string> = {
  neutral: 'bg-gray-400', success: 'bg-emerald-500', warning: 'bg-amber-500',
  danger: 'bg-red-500', info: 'bg-sky-500', brand: 'bg-brand-500',
};
export function Badge({ tone = 'neutral', children, className, dot, title }:
  { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; title?: string }) {
  return (
    <span title={title}
      className={cx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONE[tone], className)}>
      {dot && <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', DOT[tone])} />}
      {children}
    </span>
  );
}

/**
 * شارة حالة — نقطة ملوّنة ونصّ.
 *
 * اللون وحده لا يكفي: مَن لا يميّز الأحمر من الأخضر يقرأ النصّ، والنقطة تُسرّع
 * المسح البصري لمن يميّز. فالاثنان معاً لا أحدهما.
 */
export function StatusBadge({ tone = 'neutral', label, className }:
  { tone?: Tone; label: ReactNode; className?: string }) {
  return <Badge tone={tone} dot className={className}>{label}</Badge>;
}

/* ═══════════ Inputs ═══════════ */
export function Field({ label, error, hint, required, children }:
  { label?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
          {label}{required && <span className="text-red-500 ms-0.5">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-red-600 mt-1">{error}</span>}
    </label>
  );
}
/*
 * `max-w-full` ليس زينة: القائمة بعرض `auto` تتّسع لأطول خياراتها، واسم مورد
 * طويل يجعلها ٦٣١ بكسل في شاشة ٥٠٠ فتُقصّ خارج الحافّة. والحدّ الأعلى يمنع ذلك
 * دون أن يمسّ العرض المطلوب حيث تتّسع الشاشة.
 */
const CONTROL_BASE = 'border border-gray-300 rounded-lg px-3 h-9 text-sm bg-white text-gray-900 placeholder:text-gray-400 max-w-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-500';

/**
 * العرض الافتراضي كامل — إلا أن يطلب المستدعي غيره.
 *
 * `w-full` و`w-auto` أداتان بنفس الأولوية، فالغالبة منهما تُحسم بترتيبهما في ملف
 * الأنماط لا بترتيبهما في السلسلة. فكانت `w-auto` القادمة من شريط المرشِّحات
 * تخسر بصمت، وتتمدّد كل مرشِّحة لعرض الحاوية فتنكسر إلى سطرها.
 *
 * فالحلّ ألّا تُضاف `w-full` أصلاً متى صرّح المستدعي بعرض — لا أن يتنافسا.
 */
const control = (className?: string, extra?: string) => {
  const declaresWidth = /(?:^|\s)(w-|min-w-|max-w-|flex-1|grow|basis-)/.test(className ?? '');
  return cx(!declaresWidth && 'w-full', CONTROL_BASE, extra, className);
};

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={control(className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={control(className, 'cursor-pointer pe-8')} {...rest}>{children}</select>;
}
export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={control(className, 'h-auto py-2 min-h-[80px] resize-y')} {...rest} />;
}

/** حقل بحث — الأيقونة داخله ومسح سريع بزرّ. */
export function SearchInput({ value, onValueChange, placeholder, className }:
  { value: string; onValueChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <span className="absolute inset-y-0 start-2.5 flex items-center text-gray-400 pointer-events-none">
        <Icon name="search" size={15} />
      </span>
      <input value={value} onChange={(e) => onValueChange(e.target.value)} placeholder={placeholder}
        className={control(undefined, cx('ps-8', value && 'pe-8'))} />
      {value && (
        <button type="button" onClick={() => onValueChange('')} aria-label="مسح البحث"
          className="absolute inset-y-0 end-2 flex items-center text-gray-400 hover:text-gray-700">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/* ═══════════ Numbers ═══════════ */
/**
 * الأرقام المالية تُقرأ بالمقارنة العمودية لا بالقراءة الأفقية.
 *
 * `tabular-nums` يجعل كل رقم بعرض واحد فتصطفّ الخانات، والمحاذاة إلى اليسار
 * تجعل الآحاد تحت الآحاد. بلا هذا يصير عمود المبالغ نصّاً لا جدولاً.
 */
export function Num({ value, decimals = 2, className, muted }:
  { value: number | string | null | undefined; decimals?: number; className?: string; muted?: boolean }) {
  const n = Number(value ?? 0);
  return (
    <span dir="ltr" className={cx('tabular-nums', muted && 'text-gray-400', className)}>
      {n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
export function Money({ value, currency, decimals = 2, className, tone }:
  { value: number | string | null | undefined; currency?: string; decimals?: number; className?: string; tone?: 'default' | 'positive' | 'negative' | 'muted' }) {
  const toneCls = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-600'
    : tone === 'muted' ? 'text-gray-400' : '';
  return (
    <span dir="ltr" className={cx('tabular-nums whitespace-nowrap', toneCls, className)}>
      <Num value={value} decimals={decimals} />
      {currency && <span className="text-[0.85em] text-gray-500 ms-1">{currency}</span>}
    </span>
  );
}

/* ═══════════ Table ═══════════ */
type Density = 'compact' | 'normal';
const DensityCtx = createContext<Density>('normal');

/**
 * الجدول — غلافه يمرّر أفقياً وحده لا الصفحة.
 *
 * جدولٌ بخمسة عشر عموداً يجرّ الصفحة كلها معه على الشاشات الضيّقة، فتتحرّك
 * الترويسة والشريط الجانبي بلا داعٍ. الغلاف هنا يحبس التمرير داخله.
 */
export function Table({ children, density = 'normal', className, minWidth }:
  { children: ReactNode; density?: Density; className?: string; minWidth?: number }) {
  return (
    <DensityCtx.Provider value={density}>
      <div className="overflow-x-auto">
        <table className={cx('w-full text-sm border-collapse', className)}
          style={minWidth ? { minWidth } : undefined}>
          {children}
        </table>
      </div>
    </DensityCtx.Provider>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50/80 border-b border-gray-200">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}
export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="bg-gray-50/80 border-t-2 border-gray-200 font-semibold text-gray-900">{children}</tfoot>;
}

type Align = 'start' | 'end' | 'center' | 'num';
const alignCls = (a?: Align) =>
  a === 'num' ? 'text-left tabular-nums' : a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start';

export function TH({ align, sortable, sorted, onSort, children, className, ...rest }:
  ThHTMLAttributes<HTMLTableCellElement> & { align?: Align; sortable?: boolean; sorted?: 'asc' | 'desc' | false; onSort?: () => void }) {
  const d = useContext(DensityCtx);
  const inner = (
    <>
      {children}
      {sortable && (
        <span className={cx('inline-block ms-1 align-middle transition-opacity', sorted ? 'opacity-100' : 'opacity-30')}>
          <Icon name={sorted === 'desc' ? 'chevronDown' : 'chevronUp'} size={12} />
        </span>
      )}
    </>
  );
  return (
    <th scope="col"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : sortable ? 'none' : undefined}
      className={cx('font-medium text-[11px] uppercase tracking-wide text-gray-500 whitespace-nowrap',
        d === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5', alignCls(align), className)}
      {...rest}>
      {sortable
        ? <button type="button" onClick={onSort} className="inline-flex items-center hover:text-gray-800 transition-colors">{inner}</button>
        : inner}
    </th>
  );
}

export function TD({ align, children, className, ...rest }:
  TdHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  const d = useContext(DensityCtx);
  return (
    <td className={cx('text-gray-700 align-middle', d === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5', alignCls(align), className)} {...rest}>
      {children}
    </td>
  );
}

export function TR({ selected, onClick, children, className, ...rest }:
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr className={cx('transition-colors', selected ? 'bg-brand-50/70' : 'hover:bg-gray-50/80',
      onClick && 'cursor-pointer', className)} onClick={onClick} {...rest}>
      {children}
    </tr>
  );
}

/** هيكل تحميل للجدول — يحفظ الشكل فلا تقفز الصفحة عند وصول البيانات. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cx('h-7', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══════════ Pagination ═══════════ */
export function Pagination({ page, pageSize, total, onPage, onPageSize }:
  { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-200/80 text-sm">
      <p className="text-gray-500 text-xs">
        <Num value={from} decimals={0} />–<Num value={to} decimals={0} /> من <Num value={total} decimals={0} />
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="عدد الصفوف" className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs cursor-pointer">
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / صفحة</option>)}
          </select>
        )}
        <div className="flex items-center gap-1">
          <IconButton size="sm" variant="outline" icon="chevronRight" label="السابق"
            disabled={page <= 1} onClick={() => onPage(page - 1)} />
          <span className="px-2 text-xs text-gray-600 tabular-nums">{page} / {pages}</span>
          <IconButton size="sm" variant="outline" icon="chevronLeft" label="التالي"
            disabled={page >= pages} onClick={() => onPage(page + 1)} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Tabs ═══════════ */
export function Tabs({ tabs, value, onChange, className }:
  { tabs: { key: string; label: ReactNode; count?: number }[]; value: string; onChange: (k: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex items-center gap-1 overflow-x-auto', className)}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} role="tab" aria-selected={on} onClick={() => onChange(t.key)}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-medium whitespace-nowrap transition-colors',
              on ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}>
            {t.label}
            {t.count != null && (
              <span className={cx('rounded px-1.5 text-[11px] tabular-nums', on ? 'bg-white/20' : 'bg-gray-200 text-gray-700')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════ KPI ═══════════ */
/**
 * بطاقة مؤشّر — رقم واحد يُقرأ في لمحة.
 *
 * لا تُحشى بأكثر من رقم وسياقه: البطاقة التي تحمل خمسة أرقام لا تُقرأ في لمحة
 * وتفقد سبب وجودها.
 */
export function KpiCard({ label, value, unit, hint, tone = 'neutral', icon, trend, onClick }:
  {
    label: ReactNode; value: ReactNode; unit?: ReactNode; hint?: ReactNode;
    tone?: Tone; icon?: string; trend?: { value: number; label?: string }; onClick?: () => void;
  }) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper onClick={onClick}
      className={cx('bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-4 text-start w-full',
        onClick && 'hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-gray-500 font-medium leading-tight">{label}</p>
        {icon && (
          <span className={cx('shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ring-1 ring-inset', TONE[tone])}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-gray-900 tabular-nums leading-none" dir="ltr">{value}</span>
        {unit && <span className="text-xs font-medium text-gray-400">{unit}</span>}
      </div>
      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {trend && (
            <span className={cx('inline-flex items-center gap-0.5 font-medium tabular-nums',
              trend.value >= 0 ? 'text-emerald-600' : 'text-red-600')} dir="ltr">
              <Icon name={trend.value >= 0 ? 'chevronUp' : 'chevronDown'} size={12} />
              {Math.abs(trend.value).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-gray-400">{hint}</span>}
        </div>
      )}
    </Wrapper>
  );
}

/* ═══════════ Feedback ═══════════ */
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

export function EmptyState({ icon = 'file', title, description, action }:
  { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="w-11 h-11 mx-auto rounded-xl bg-gray-50 ring-1 ring-inset ring-gray-200 text-gray-400 flex items-center justify-center mb-3">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-gray-800 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** حالة خطأ — تقول ما حدث وتُتيح المحاولة، ولا تترك الشاشة فارغة بلا تفسير. */
export function ErrorState({ title = 'تعذّر تحميل البيانات', description, onRetry }:
  { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12 px-4" role="alert">
      <div className="w-11 h-11 mx-auto rounded-xl bg-red-50 ring-1 ring-inset ring-red-200 text-red-500 flex items-center justify-center mb-3">
        <Icon name="x" size={22} />
      </div>
      <p className="text-gray-800 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {onRetry && <div className="mt-4"><Button variant="outline" icon="refresh" onClick={onRetry}>إعادة المحاولة</Button></div>}
    </div>
  );
}

/** شريط تنبيه — للسياق الدائم لا للرسائل العابرة. */
export function Callout({ tone = 'info', children, className }:
  { tone?: Tone; children: ReactNode; className?: string }) {
  const border: Record<Tone, string> = {
    neutral: 'border-gray-200 bg-gray-50 text-gray-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    brand: 'border-brand-200 bg-brand-50 text-brand-900',
  };
  return <div className={cx('rounded-lg border px-4 py-2.5 text-sm', border[tone], className)}>{children}</div>;
}

/** تلميح — CSS فقط، بلا مكتبة ولا JS. */
export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('relative inline-flex group', className)}>
      {children}
      <span role="tooltip"
        className="pointer-events-none absolute bottom-full start-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block group-focus-within:block
                   whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow-lg z-50">
        {label}
      </span>
    </span>
  );
}

/* ═══════════ Overlays ═══════════ */
/** يحبس التركيز داخل الطبقة ويعيده لمصدره عند الإغلاق. */
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(
      node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }:
  { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-gray-900/50 backdrop-blur-[1px] overflow-y-auto"
      onClick={onClose} role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        className={cx('bg-white rounded-xl shadow-xl w-full ume-fade-in my-auto max-h-[92vh] flex flex-col', w)}
        onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <IconButton icon="x" label="إغلاق" size="sm" onClick={onClose} />
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0 bg-gray-50/60 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-md' }:
  { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50" onClick={onClose} role="presentation">
      {/* يفتح من الجهة الافتتاحية للاتجاه — يميناً في العربية ويساراً في الإنجليزية. */}
      <div ref={ref} role="dialog" aria-modal="true"
        className={cx('absolute inset-y-0 start-0 bg-white shadow-xl w-full flex flex-col', width)}
        style={{ animation: 'ume-slide-in-ltr .2s ease-out' }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <IconButton icon="x" label="إغلاق" size="sm" onClick={onClose} />
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ═══════════ Toast ═══════════ */
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; msg: string }
const ToastCtx = createContext<{ push: (t: ToastTone, m: string) => void } | null>(null);
let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, msg: string) => {
    const id = toastSeq++;
    setItems((s) => [...s, { id, tone, msg }]);
    // الخطأ يبقى أطول: الرسالة التي تختفي قبل أن تُقرأ لم تُرسَل.
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const dismiss = (id: number) => setItems((s) => s.filter((t) => t.id !== id));
  const tones: Record<ToastTone, { ring: string; icon: string; iconCls: string }> = {
    success: { ring: 'ring-emerald-200', icon: 'check', iconCls: 'bg-emerald-100 text-emerald-700' },
    error: { ring: 'ring-red-200', icon: 'x', iconCls: 'bg-red-100 text-red-700' },
    info: { ring: 'ring-brand-200', icon: 'bell', iconCls: 'bg-brand-100 text-brand-700' },
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2 items-end no-print" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id}
            className={cx('bg-white text-sm text-gray-800 ps-3 pe-2 py-2.5 rounded-xl shadow-lg ring-1 flex items-center gap-2.5 ume-fade-in max-w-sm', tones[t.tone].ring)}>
            <span className={cx('shrink-0 w-6 h-6 rounded-lg flex items-center justify-center', tones[t.tone].iconCls)}>
              <Icon name={tones[t.tone].icon} size={14} />
            </span>
            <span className="flex-1">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} aria-label="إغلاق التنبيه"
              className="shrink-0 text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100">
              <Icon name="x" size={13} />
            </button>
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

/* ═══════════ Sorting helper ═══════════ */
/** ترتيب جدول — حالة واحدة وثلاثة أطوار: تصاعدي، تنازلي، بلا ترتيب. */
export function useTableSort<K extends string>(initial?: K) {
  const [key, setKey] = useState<K | null>(initial ?? null);
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const toggle = useCallback((k: K) => {
    setKey((prev) => {
      if (prev !== k) { setDir('asc'); return k; }
      if (dir === 'asc') { setDir('desc'); return k; }
      setDir('asc'); return null;
    });
  }, [dir]);
  const sortedBy = useCallback((k: K) => (key === k ? dir : false as const), [key, dir]);
  return { key, dir, toggle, sortedBy };
}
