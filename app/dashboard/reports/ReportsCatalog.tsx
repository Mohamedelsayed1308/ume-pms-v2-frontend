'use client';
import { Icon } from '@/components/ui/Icon';
import { matchesAllWords } from '@/lib/reports/text';
import { CATEGORIES, CAT_MAP, REPORTS, REPORT_MAP, searchText, type CatKey, type ReportId, type ReportMeta } from './catalog';

/*
 * دليل مركز التحليلات (تسليم التصميم v1.2 §3).
 *
 * لا يعرض أرقاماً من البيانات أبداً — عدّاد الفئة عددُ **التقارير المتاحة** لا
 * غير. والحالة (البحث · الفئة · المثبّتة · الحديثة) يملكها الأب، فتبقى عند
 * الرجوع من تقرير.
 */
const TX = {
  ar: {
    title: 'مركز التحليلات', sub: 'أجب عن سؤال إداري بسرعة: ابحث أو اختر تقريراً حسب الفئة.',
    searchLabel: 'بحث في التقارير', searchPh: 'ابحث باسم التقرير أو الغرض… مثل: رصيد مورد، overdue',
    cats: 'الفئات', all: 'الكل', favs: 'المفضلة', recents: 'المستخدمة مؤخراً', open: 'افتح التقرير',
    noResTitle: 'لا يوجد تقرير مطابق', noResBody: 'جرّب كلمة أخرى، أو اختر «الكل» من الفئات.', clear: 'مسح البحث والفئة',
    noAccessTitle: 'لا تتوفر تقارير لصلاحياتك', noAccessBody: 'تظهر التقارير حسب الشاشات المسموح لك بها (الموردين، الفواتير، السفن). اطلب الصلاحية من مسؤول النظام.',
    cardResult: 'النتائج', cardFilters: 'الفلاتر المطلوبة', pin: 'تثبيت في المفضلة: ', unpin: 'إزالة من المفضلة: ',
    of: (v: number, p: number) => `${v} من ${p} تقريراً متاحاً`, avail: (p: number) => `${p} تقريراً متاحاً لك`,
  },
  en: {
    title: 'Analytics Center', sub: 'Answer a business question fast: search or pick a report by category.',
    searchLabel: 'Search reports', searchPh: 'Search by name or purpose… e.g. supplier balance, متأخرة',
    cats: 'Categories', all: 'All', favs: 'Pinned', recents: 'Recently used', open: 'Open report',
    noResTitle: 'No matching reports', noResBody: 'Try another word, or choose “All”.', clear: 'Clear search & category',
    noAccessTitle: 'No reports for your role', noAccessBody: 'Reports follow the screens you can access (suppliers, invoices, vessels). Ask an administrator for access.',
    cardResult: 'Results', cardFilters: 'Required filters', pin: 'Pin ', unpin: 'Unpin ',
    of: (v: number, p: number) => `${v} of ${p} reports`, avail: (p: number) => `${p} reports available to you`,
  },
};

type Txt = typeof TX.ar | typeof TX.en;

/** بطاقة تقرير — مكوّنٌ مستقلّ لا يُنشأ داخل عرض الأب. */
function ReportCard({ r, en, T, pinned, onOpen, onTogglePin }: {
  r: ReportMeta; en: boolean; T: Txt; pinned: boolean; onOpen: (id: ReportId) => void; onTogglePin: (id: ReportId) => void;
}) {
  const c = CAT_MAP[r.cat];
  const L = (b: { ar: string; en: string }) => (en ? b.en : b.ar);
  return (
      <article className="group relative flex flex-col gap-3 rounded-[14px] border border-[#e4e7ec] bg-white p-4 transition-shadow hover:shadow-[0_4px_14px_rgba(16,24,40,.06)]">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ background: c.soft, color: c.ink }}>
            <Icon name={r.icon} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-extrabold text-[#101828] leading-snug">{L(r.title)}</h3>
            <p className="mt-1 text-[12.5px] leading-[1.6] text-[#475467]">{L(r.question)}</p>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePin(r.id); }} aria-pressed={pinned}
            aria-label={(pinned ? T.unpin : T.pin) + L(r.title)}
            className="shrink-0 w-9 h-9 max-md:w-11 max-md:h-11 rounded-[9px] flex items-center justify-center hover:bg-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill={pinned ? '#f2bd58' : 'none'} stroke={pinned ? '#b54708' : '#98a2b3'} strokeWidth="1.7" strokeLinejoin="round">
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-[#667085]">{T.cardResult}</dt><dd className="text-[#344054]">{L(r.resultType)}</dd>
          <dt className="text-[#667085]">{T.cardFilters}</dt><dd className="text-[#344054]">{L(r.needs)}</dd>
        </dl>
        <button type="button" onClick={() => onOpen(r.id)}
          className="mt-auto self-start inline-flex items-center gap-2 rounded-[9px] bg-[#00283a] px-4 h-9 max-md:h-11 text-[13px] font-bold text-white hover:bg-[#003a52] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea]">
          {T.open}<span aria-hidden="true">{en ? '→' : '←'}</span>
        </button>
      </article>
  );
}

function ReportGrid({ items, ...rest }: { items: ReportMeta[]; en: boolean; T: Txt; favs: ReportId[]; onOpen: (id: ReportId) => void; onTogglePin: (id: ReportId) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {items.map((r) => <ReportCard key={r.id} r={r} en={rest.en} T={rest.T} pinned={rest.favs.includes(r.id)} onOpen={rest.onOpen} onTogglePin={rest.onTogglePin} />)}
    </div>
  );
}

export interface CatalogProps {
  locale: 'ar' | 'en';
  can: (id: ReportId) => boolean;
  q: string; onQ: (v: string) => void;
  cat: CatKey | 'all'; onCat: (c: CatKey | 'all') => void;
  favs: ReportId[]; recents: ReportId[];
  onOpen: (id: ReportId) => void;
  onTogglePin: (id: ReportId) => void;
}

export default function ReportsCatalog(p: CatalogProps) {
  const en = p.locale === 'en';
  const T = en ? TX.en : TX.ar;
  const L = (b: { ar: string; en: string }) => (en ? b.en : b.ar);

  const permitted = REPORTS.filter((r) => p.can(r.id));
  const matches = (r: ReportMeta) => matchesAllWords(p.q, searchText(r));
  const visible = permitted.filter(matches).filter((r) => p.cat === 'all' || r.cat === p.cat);
  const browsing = !p.q.trim() && p.cat === 'all';
  const favItems = p.favs.filter((id) => REPORT_MAP[id] && p.can(id)).map((id) => REPORT_MAP[id]);
  const recentItems = p.recents.filter((id) => REPORT_MAP[id] && p.can(id) && !p.favs.includes(id)).map((id) => REPORT_MAP[id]);
  const chips = [
    { key: 'all' as const, label: T.all, n: permitted.filter(matches).length },
    ...CATEGORIES.filter((c) => permitted.some((r) => r.cat === c.key))
      .map((c) => ({ key: c.key, label: L(c.label), n: permitted.filter((r) => r.cat === c.key && matches(r)).length })),
  ];
  const resultLine = !permitted.length ? '' : (p.q.trim() || p.cat !== 'all') ? T.of(visible.length, permitted.length) : T.avail(permitted.length);

  const gridProps = { en, T, favs: p.favs, onOpen: p.onOpen, onTogglePin: p.onTogglePin };

  return (
    <div className="relative flex flex-col gap-5 [font-variant-numeric:tabular-nums_lining-nums]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[24px] max-md:text-[20px] font-extrabold text-[#00283a] tracking-[-.015em]">{T.title}</h1>
        <p className="m-0 text-[13.5px] text-[#475467]">{T.sub}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="relative max-w-[620px]">
          <span className="absolute top-1/2 -translate-y-1/2 start-3 text-[#667085] pointer-events-none"><Icon name="search" size={18} /></span>
          <input type="search" value={p.q} onChange={(e) => p.onQ(e.target.value)} aria-label={T.searchLabel} placeholder={T.searchPh}
            className="w-full h-[46px] rounded-xl border border-[#d0d5dd] bg-white ps-10 pe-3 text-[14px] text-[#101828] focus:outline-2 focus:outline-offset-2 focus:outline-[#3366ea]" />
        </div>
        {permitted.length > 0 && (
          <div role="group" aria-label={T.cats} className="flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const on = p.cat === c.key;
              return (
                <button key={c.key} type="button" aria-pressed={on} onClick={() => p.onCat(c.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-[34px] max-md:h-11 text-[12.5px] font-semibold ${on ? 'bg-[#00283a] text-white border-[#00283a]' : 'bg-white text-[#344054] border-[#d0d5dd] hover:bg-[#f9fafb]'}`}>
                  {c.label}
                  <span className={`rounded-full px-1.5 text-[11px] ${on ? 'bg-white/20 text-white' : 'bg-[#f2f4f7] text-[#475467]'}`}>{c.n}</span>
                </button>
              );
            })}
          </div>
        )}
        <p aria-live="polite" className="m-0 min-h-[18px] text-[12px] text-[#667085]">{resultLine}</p>
      </div>

      {!permitted.length && (
        <div role="status" className="rounded-[14px] border border-[#e4e7ec] bg-white p-8 text-center">
          <p className="font-bold text-[#101828]">{T.noAccessTitle}</p>
          <p className="mt-1 text-[13px] text-[#475467]">{T.noAccessBody}</p>
        </div>
      )}

      {browsing && favItems.length > 0 && (
        <section aria-label={T.favs} className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-extrabold text-[#101828]">{T.favs}</h2>
          <ReportGrid items={favItems} {...gridProps} />
        </section>
      )}
      {browsing && recentItems.length > 0 && (
        <section aria-label={T.recents} className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-extrabold text-[#101828]">{T.recents}</h2>
          <ReportGrid items={recentItems} {...gridProps} />
        </section>
      )}

      {CATEGORIES.map((c) => {
        const items = visible.filter((r) => r.cat === c.key);
        if (!items.length) return null;
        return (
          <section key={c.key} aria-label={L(c.label)} className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[#101828]">
              <span className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: c.soft, color: c.ink }}><Icon name={c.icon} size={17} /></span>
              {L(c.label)} <span className="text-[12px] font-normal text-[#667085]">({items.length})</span>
            </h2>
            <ReportGrid items={items} {...gridProps} />
          </section>
        );
      })}

      {permitted.length > 0 && !visible.length && (
        <div role="status" className="rounded-[14px] border border-[#e4e7ec] bg-white p-8 text-center">
          <p className="font-bold text-[#101828]">{T.noResTitle}</p>
          <p className="mt-1 text-[13px] text-[#475467]">{T.noResBody}</p>
          <button type="button" onClick={() => { p.onQ(''); p.onCat('all'); }}
            className="mt-3 rounded-[9px] border border-[#d0d5dd] bg-white px-4 h-9 text-[13px] font-semibold text-[#344054] hover:bg-[#f9fafb]">{T.clear}</button>
        </div>
      )}
    </div>
  );
}
