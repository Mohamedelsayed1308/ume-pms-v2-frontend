'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icon, cx } from '@/components/ui';
import FleetDashboard from './reports/FleetDashboard';
import MarketPage from './market/page';
import ManagementDashboard from './ManagementDashboard';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * الصفحة الرئيسيّة — ما يهمّ الإدارة التنفيذيّة أوّلاً
 *
 * بأمر المالك في ٢٨ أغسطس ٢٠٢٦: «لوحة الأسطول التنفيذيّة» و«تحليل السوق
 * الملاحيّ» فوق، ولوحة الإدارة تحتهما.
 *
 * ── ولماذا تبويبان لا لوحتان متتاليتان ──
 * لوحة الأسطول وحدها ثمانمئة سطرٍ بفلاترها ومساعدها، والسوق أربعمئة. وجمعُهما
 * رأسيّاً يدفن لوحة الإدارة تحت تمريرٍ لا ينتهي. فالتبويب يُبقي كلَّ لوحةٍ
 * كاملةً بلا اقتطاع، ويُبقي الإدارة على مرمى نظرة.
 *
 * ── والصلاحيّة يحرسها الخادم لا نحن ──
 * `api/fleet/dashboard` يتطلّب `/dashboard/vessels` أو `/dashboard/reports`،
 * و`api/market/analysis` يتطلّب `/dashboard/market`. والتبويبان يظهران للجميع
 * بأمر المالك — فمن لا صلاحيّة له يرى **رسالةً مفهومة** داخل التبويب، لا خطأً
 * أحمر ولا شاشةً فارغة. واللوحتان تتكفّلان بذلك بنفسيهما.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Tab = 'fleet' | 'market';

const TABS: { key: Tab; label: string; sub: string; icon: string; href: string }[] = [
  { key: 'fleet', label: 'لوحة الأسطول التنفيذية', sub: 'مؤشرات ومقارنات وأعداد المنقولات', icon: 'ship', href: '/dashboard/reports' },
  { key: 'market', label: 'تحليل السوق الملاحي', sub: 'حصص الوكلاء واتجاهات السوق', icon: 'chart', href: '/dashboard/market' },
];

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('fleet');
  /*
   * ما رآه المستخدم مرّةً يبقى مُركَّباً.
   *
   * ── ولماذا لا يُركَّبان معاً من أوّل لحظة ──
   * قِيس على الرئيسيّة: `api/market/analysis` كان يُنفَق **في كلّ فتحة** وتبويبه
   * مخفيّ — نحو ثلاث ثوانٍ لا يراها أحد. والرئيسيّة يفتحها كلُّ موظّفٍ كلَّ صباح.
   *
   * ── ولماذا لا يُفكَّك عند الخروج منه ──
   * لأنّه سيُعيد الجلب في كلّ تنقّلٍ بين التبويبين، وتضيع الفلاتر التي ضُبطت.
   * فالتركيب مرّةً واحدة، والإخفاء بعدها بـ `hidden`.
   */
  const [seen, setSeen] = useState<Record<Tab, boolean>>({ fleet: true, market: false });
  const open = (k: Tab) => { setTab(k); setSeen((s) => (s[k] ? s : { ...s, [k]: true })); };

  return (
    <div className="space-y-6">
      {/*
        * ── أزرارٌ بارزةٌ لا تبويباتٌ رفيعة ──
        * بأمر المالك: «تكون بأزرارٍ بارزةٍ ظاهرةٍ لِلَفت الانتباه». فهي بطاقتان
        * كبيرتان بعنوانٍ ووصفٍ وأيقونة، والمختارة تُعلن نفسها بلونٍ ممتلئ.
        */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TABS.map((x) => {
          const on = tab === x.key;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => open(x.key)}
              aria-pressed={on}
              className={cx(
                'group flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-start transition-all',
                on
                  ? 'border-transparent bg-navy-900 text-white shadow-lg scale-[1.01]'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50',
              )}
            >
              <span className={cx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                on ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600',
              )}>
                <Icon name={x.icon} size={22} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold">{x.label}</span>
                <span className={cx('block truncate text-xs', on ? 'text-white/70' : 'text-gray-500')}>{x.sub}</span>
              </span>
              {on && <span className="ms-auto shrink-0 text-white/60"><Icon name="check" size={18} /></span>}
            </button>
          );
        })}
      </div>

      {/*
        * الأسطول يُركَّب فوراً — هو التبويب المفتوح. والسوق ينتظر أوّل ضغطة.
        * وما رآه المستخدم مرّةً لا يُفكَّك بعدها، بل يُخفى.
        */}
      <div className={tab === 'fleet' ? '' : 'hidden'}>
        <FleetDashboard scope="currentYear" />
      </div>
      <div className={tab === 'market' ? '' : 'hidden'}>
        {seen.market && <MarketPage />}
      </div>

      {/* ── لوحة الإدارة تحتهما ── */}
      <div className="border-t border-gray-200 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-800">لوحة الإدارة</h2>
          <Link href="/dashboard/management" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
            افتحها وحدها ←
          </Link>
        </div>
        <ManagementDashboard />
      </div>
    </div>
  );
}
