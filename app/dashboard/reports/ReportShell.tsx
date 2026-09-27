'use client';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CAT_MAP, REPORT_MAP, type ReportId } from './catalog';

/*
 * إطار التقرير (تسليم التصميم v1.2 §2): مسار التنقّل · الرجوع · العنوان وسؤاله ·
 * التثبيت — ثمّ التقرير نفسه في `children`.
 *
 * التقارير الاثنا عشر الأخرى تُعرض داخله **بمكوّناتها القائمة كما هي**؛ الإطار
 * لا يمسّ فلاترها ولا حساباتها ولا تصديرها.
 */
export default function ReportShell({ id, locale, allowed, pinned, onBack, onTogglePin, children }: {
  id: ReportId; locale: 'ar' | 'en'; allowed: boolean; pinned: boolean;
  onBack: () => void; onTogglePin: () => void; children: ReactNode;
}) {
  const en = locale === 'en';
  const r = REPORT_MAP[id];
  const c = CAT_MAP[r.cat];
  const L = (b: { ar: string; en: string }) => (en ? b.en : b.ar);
  return (
    <div className="flex flex-col gap-4 [font-variant-numeric:tabular-nums_lining-nums]">
      <nav aria-label={en ? 'Breadcrumb' : 'مسار التنقل'} className="print:hidden text-[12px] text-[#667085]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><button type="button" onClick={onBack} className="text-[#234ed6] hover:text-[#1d3eb0] hover:underline">{en ? 'Analytics Center' : 'مركز التحليلات'}</button></li>
          <li aria-hidden="true">{en ? '›' : '‹'}</li>
          <li>{L(c.label)}</li>
          <li aria-hidden="true">{en ? '›' : '‹'}</li>
          <li aria-current="page" className="font-semibold text-[#344054]">{L(r.title)}</li>
        </ol>
      </nav>

      <header className="flex items-start gap-3">
        <button type="button" onClick={onBack} aria-label={en ? 'Back to Analytics Center' : 'رجوع لمركز التحليلات'}
          className="print:hidden shrink-0 mt-0.5 w-9 h-9 max-md:w-11 max-md:h-11 rounded-[9px] border border-[#e4e7ec] bg-white hover:bg-[#f9fafb] flex items-center justify-center text-[#344054] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">
          <Icon name={en ? 'chevronLeft' : 'chevronRight'} size={20} />
        </button>
        <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: c.soft, color: c.ink }}>
          <Icon name={r.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="m-0 text-[22px] max-md:text-[20px] font-extrabold text-[#00283a]">{L(r.title)}</h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: c.soft, color: c.ink }}>{L(c.label)}</span>
          </div>
          <p className="mt-0.5 text-[13px] text-[#475467]">{L(r.question)}</p>
        </div>
        <button type="button" onClick={onTogglePin} aria-pressed={pinned}
          aria-label={(pinned ? (en ? 'Unpin ' : 'إزالة من المفضلة: ') : (en ? 'Pin ' : 'تثبيت في المفضلة: ')) + L(r.title)}
          className="print:hidden shrink-0 w-9 h-9 max-md:w-11 max-md:h-11 rounded-[9px] border border-[#e4e7ec] bg-white flex items-center justify-center hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill={pinned ? '#f2bd58' : 'none'} stroke={pinned ? '#b54708' : '#98a2b3'} strokeWidth="1.7" strokeLinejoin="round">
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        </button>
      </header>

      {allowed ? children : (
        <div role="alert" className="rounded-[14px] border border-[#fecdca] bg-[#fef3f2] p-5 text-[13px] text-[#912018]">
          {en ? 'You don’t have access to this report. Open it once you are granted access to its screen.' : 'لا تملك صلاحية هذا التقرير. افتحه بعد منحك صلاحية الشاشة المرتبطة.'}
        </div>
      )}
    </div>
  );
}
