'use client';
import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useNotifications } from '@/lib/notifications';
import { cairoNow, dailyLine, firstNameOf, greetingText, periodOf, pickWorkLine, workLineText } from '@/lib/greeting';

/*
 * ترحيبٌ شخصيّ أعلى الرئيسيّة — تحيّةٌ بتوقيت القاهرة وسطرٌ ثانٍ واحد.
 *
 * ── لا اختلاف بين الخادم والمتصفّح ──
 * الوقت والمستخدم يُقرآن بـ `useSyncExternalStore`، ولقطة الخادم `null` بالتعريف:
 * الخادم لا يعرف المستخدم ولا ساعة القاهرة لحظة الفتح، فيحجز المساحة فقط، والنصّ
 * يُكتب في المتصفّح. فلا «hydration mismatch».
 *
 * ── ويتحدّث بلا إعادة تحميل ──
 * لقطة الوقت «شريحةُ» ثلاثين ثانية، يُعاد قراءتها كلّ ثلاثين ثانية وعند العودة إلى
 * التبويب — فتتبدّل التحيّة عند 05:00 و12:00 و17:00، والجملة اليوميّة عند منتصف
 * ليل القاهرة.
 *
 * ── والبيانات من مركز التنبيهات نفسه ──
 * المهامّ والفواتير يجلبها `NotificationsProvider` في إطار اللوحة أصلاً (بعد فحص
 * الصلاحية)، فلا طلب ثانياً هنا. والبيانات التجريبيّة في الرئيسيّة لا تُستعمل أبداً.
 */
const SLICE_MS = 30_000;

function subscribeTime(cb: () => void) {
  const id = setInterval(cb, SLICE_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') cb(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', cb);
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', cb); };
}
const timeSlice = () => Math.floor(Date.now() / SLICE_MS);
const noSnapshot = () => null;

// المستخدم في التخزين المحلّيّ نصّاً — والنصّ لقطةٌ ثابتةٌ يقارنها React بالمساواة
function subscribeUser(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}
const userRaw = () => { try { return localStorage.getItem('user'); } catch { return null; } };

export default function HomeGreeting() {
  const { locale } = useI18n();
  const lang = locale === 'en' ? 'en' : 'ar';
  const n = useNotifications();
  const slice = useSyncExternalStore(subscribeTime, timeSlice, noSnapshot);
  const raw = useSyncExternalStore(subscribeUser, userRaw, noSnapshot);
  const user = useMemo(() => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }, [raw]);

  // بداية الشريحة تكفي: 05:00 و12:00 و17:00 القاهرة تقع على حدود شرائح الثلاثين ثانية
  // (فرق القاهرة عن UTC ساعاتٌ كاملة)، فلا تتأخّر التحيّة عن موعدها
  const cairo = slice == null ? null : cairoNow(new Date(slice * SLICE_MS));
  const period = cairo ? periodOf(cairo.hour) : null;
  const greeting = period ? greetingText(period, firstNameOf(user), lang) : null;

  const loading = n.tasksState === 'loading' || n.invoicesState === 'loading';
  const dateKey = cairo?.dateKey ?? null;
  // حسابٌ خفيف (تصفية قائمتين) — بلا memo يتركه مُصرِّف React يقرّر
  const line = dateKey && !loading
    ? pickWorkLine({ user, todayKey: dateKey, tasks: [...n.tasks], invoices: [...n.invoices], tasksState: n.tasksState, invoicesState: n.invoicesState })
    : null;

  return (
    <div data-testid="home-greeting">
      <h1 aria-live="polite">{greeting ?? ' '}</h1>
      <p className="min-h-[1.5em] text-[15px] leading-relaxed">
        {!cairo || loading ? <span aria-hidden="true">{' '}</span>
          : line ? (
            <Link href={line.href} className="font-semibold text-[#00283a] underline decoration-[#6eb08b] decoration-2 underline-offset-4 hover:text-[#003a52] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3366ea] rounded-sm">
              {workLineText(line, lang)}
            </Link>
          ) : lang === 'ar' ? (
            // الجمل اليوميّة عربيّةٌ فقط — فلا تُعرض تحت تحيّةٍ إنجليزيّة، كي لا تختلط اللغتان
            <span data-testid="daily-line">{dailyLine(cairo.dateKey)}</span>
          ) : <span aria-hidden="true">{' '}</span>}
      </p>
    </div>
  );
}
