/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  الترحيب الشخصيّ في الصفحة الرئيسيّة — المنطق الخالص (بلا واجهة)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── الوقت: القاهرة لا الجهاز ──
 * الفترة وتاريخ اليوم يُحسبان بالمنطقة `Africa/Cairo` عبر `Intl`، لا بفرق ساعاتٍ
 * ثابت: مصر تعمل بالتوقيت الصيفيّ (UTC+3) جزءاً من السنة وبالشتويّ (UTC+2)
 * الباقي، وفرقٌ ثابتٌ يُخطئ ساعةً نصف العام.
 *
 * ── والسطر الثاني: معلومةٌ واحدة بأولويّة ثابتة ──
 *   ١) مهامّ متأخّرة **مسندة للمستخدم نفسه**
 *   ٢) فواتير متأخّرة في نطاق صلاحيّته
 *   ٣) فواتير تستحقّ خلال سبعة أيّام في نطاق صلاحيّته
 * وإن لم يوجد شيء، أو لم تكن البيانات موثوقة، فجملةٌ يوميّةٌ ثابتةٌ طوال يوم القاهرة.
 *
 * ── وفشلُ الجلب ليس «لا شيء» ──
 * مصدرٌ فشل تحميله لا يُستنتج منه أنّ الأعمال مكتملة: يُتخطّى، ولا تُكتب جملةٌ
 * تدّعي الإنجاز. والجمل اليوميّة كلّها محايدة لا تقول «أنجزت كلّ شيء».
 */

export const CAIRO_TZ = 'Africa/Cairo';
export type DayPeriod = 'morning' | 'day' | 'evening';
export type Locale = 'ar' | 'en';

/** ساعة القاهرة وتاريخها (YYYY-MM-DD) للحظةٍ ما. */
export function cairoNow(now: Date): { hour: number; minute: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '0';
  return {
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** من 05:00 حتى قبل 12:00 صباح · من 12:00 حتى قبل 17:00 نهار · وما سواه مساء. */
export function periodOf(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'day';
  return 'evening';
}

/*
 * الاسم الأوّل من `full_name` — الحقل الوحيد للاسم في حساب المستخدم
 * (`{ id, email, full_name, role, allowed_screens }`).
 *
 * ولا يُستعمل البريد اسماً أبداً: قيمةٌ فيها `@` تُرفض، وكذا ما لا حرف فيه.
 * فإن لم يصلح الاسم عُرضت التحية بلا «يا» ولا اسمٍ بديل.
 */
export function firstNameOf(user: { full_name?: unknown } | null | undefined): string | null {
  const raw = typeof user?.full_name === 'string' ? user.full_name.trim() : '';
  if (!raw || raw.includes('@')) return null;
  const first = raw.split(/\s+/)[0];
  if (!first || first.includes('@') || !/\p{L}/u.test(first)) return null;
  return first.slice(0, 40);
}

const GREET: Record<Locale, Record<DayPeriod, string>> = {
  ar: { morning: 'صباح الخير', day: 'يومك سعيد', evening: 'مساء الخير' },
  en: { morning: 'Good morning', day: 'Have a good day', evening: 'Good evening' },
};

/** «صباح الخير يا محمد» — أو «صباح الخير» وحدها بلا اسمٍ صالح. لا تخلط اللغتين. */
export function greetingText(period: DayPeriod, name: string | null, locale: Locale = 'ar'): string {
  const base = GREET[locale][period];
  if (!name) return base;
  return locale === 'ar' ? `${base} يا ${name}` : `${base}, ${name}`;
}

/*
 * الجمل اليوميّة — خمس عشرة جملة ثابتة: أوّل خمس عشرة جملةً مختلفةً بترتيب قائمة المالك
 * (٢٧ سبتمبر ٢٠٢٦)، بعد حذف المكرّر منها. والاختيار برقم يوم القاهرة (عدد الأيّام
 * منذ ١٩٧٠) باقي القسمة على ١٥: ثابتٌ طوال اليوم، ويتغيّر يوماً بيوم، ويدور على
 * القائمة كلّها قبل أن يتكرّر — لا عشوائيّة ولا ذكاء اصطناعيّ.
 */
export const DAILY_LINES: readonly string[] = [
  'كلّ رقم دقيق اليوم قرار أصحّ غداً.',
  'خطوة منظّمة اليوم توفّر ساعة غداً.',
  'الدقّة عادة، ونحن نبنيها كلّ يوم.',
  'ابدأ بالأهمّ، والباقي يتبعه.',
  'أسطول يعمل بانتظام يبدأ بمكتب يعمل بانتظام.',
  'ما يُقاس يُدار، وما يُدار يتحسّن.',
  'مراجعة صغيرة اليوم تمنع مشكلة كبيرة غداً.',
  'إنجاز مهمّة واحدة أفضل من تأجيل مهام كثيرة.',
  'وضوح التفاصيل يجعل القرار أسهل.',
  'خلف كل رحلة ناجحة فريق يهتمّ بالتفاصيل.',
  'رتّب أولوياتك، وامنح كلّ مهمة وقتها.',
  'العمل المتقن يبدأ بمعلومة صحيحة.',
  'متابعة في وقتها تختصر كثيراً من الانتظار.',
  'أنجز ما تستطيع اليوم، وابنِ عليه غداً.',
  'نجاح الفريق تصنعه مساهمة كلّ فرد.',
];

export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
export function dailyLine(dateKey: string): string {
  const n = dayNumber(dateKey);
  return DAILY_LINES[((n % DAILY_LINES.length) + DAILY_LINES.length) % DAILY_LINES.length];
}

// ── التواريخ بصيغة YYYY-MM-DD تُقارَن نصّاً ──────────────────────────────────
const ymd = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/*
 * ── من صاحب المهمّة؟ ──
 * المهمّة تحمل `owner` نصّاً من قائمةٍ ثابتة في شاشة المهامّ
 * (`M.Elsayed` · `Bassel` · `Tarek` · `Shimaa` · `Other`) — **بلا ربطٍ بحساب
 * المستخدم**. فلا يُنسب للمستخدم إلّا ما يطابق اسمه مطابقةً تامّة (الاسم الكامل أو
 * الأوّل، بلا حساسيّة حروف)، أو ما نُصّ عليه في `TASK_OWNER_ALIASES` بمعرّف حسابه.
 * والتخمين ممنوع: «M.Elsayed» لا تُنسب لـ «Mohamed» إلّا بربطٍ صريح.
 */
export const TASK_OWNER_ALIASES: Record<string, string[]> = {
  // محمد السيد (mohamed@ume.com) — بطلب المالك ٢٧ سبتمبر ٢٠٢٦
  '8712bd6f-1880-4fd7-9a7d-8e9976e88eb1': ['M.Elsayed'],
};
const normName = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function ownerLabelsOf(user: { id?: unknown; full_name?: unknown } | null | undefined): Set<string> {
  const out = new Set<string>();
  const full = normName(user?.full_name);
  if (full && !full.includes('@')) out.add(full);
  const first = firstNameOf(user as { full_name?: unknown });
  if (first) out.add(normName(first));
  for (const a of TASK_OWNER_ALIASES[String(user?.id ?? '')] || []) out.add(normName(a));
  return out;
}

export type SourceState = 'ok' | 'failed' | 'forbidden' | 'loading';
export interface WorkInput {
  user: { id?: unknown; full_name?: unknown } | null;
  todayKey: string;                       // تاريخ القاهرة
  tasks: { status?: string; due_date?: string | null; owner?: string | null }[];
  invoices: { status?: string; due_date?: string | null }[];
  tasksState: SourceState;
  invoicesState: SourceState;
}
export type WorkLine =
  | { kind: 'tasks_overdue'; count: number; href: string }
  | { kind: 'invoices_overdue'; count: number; href: string }
  | { kind: 'invoices_due_soon'; count: number; href: string };

// الحالات الفعليّة في النظام: مهمّة pending|in_progress|done|cancelled · فاتورة unpaid|partial|paid|cancelled
const taskOpen = (t: { status?: string }) => t.status !== 'done' && t.status !== 'cancelled';
const invOpen = (i: { status?: string }) => i.status !== 'paid' && i.status !== 'cancelled';

/**
 * السطر الثاني من واقع العمل — أو `null` حين لا شيء يُعرض أو لا ثقة في البيانات.
 * الروابط تفتح الشاشة بالفلتر المطابق للعدّ نفسه.
 */
export function pickWorkLine(w: WorkInput): WorkLine | null {
  const today = w.todayKey;
  if (w.tasksState === 'ok' && w.user) {
    const mine = ownerLabelsOf(w.user);
    const owned = w.tasks.filter((t) => mine.has(normName(t.owner)));
    const overdue = owned.filter((t) => { const d = ymd(t.due_date); return taskOpen(t) && !!d && d < today; });
    if (overdue.length) {
      // يُفتح فلتر «متأخّرة» على المسؤول نفسه — والمسؤول هو تسمية المهمّة كما في الشاشة
      const label = String(overdue[0].owner ?? '');
      return { kind: 'tasks_overdue', count: overdue.length, href: `/dashboard/tasks?preset=overdue&owner=${encodeURIComponent(label)}` };
    }
  }
  if (w.invoicesState === 'ok') {
    const open = w.invoices.filter(invOpen);
    const overdue = open.filter((i) => { const d = ymd(i.due_date); return !!d && d < today; });
    if (overdue.length) return { kind: 'invoices_overdue', count: overdue.length, href: '/dashboard/invoices?preset=overdue' };
    const soon = addDays(today, 7);
    const dueSoon = open.filter((i) => { const d = ymd(i.due_date); return !!d && d >= today && d <= soon; });
    if (dueSoon.length) return { kind: 'invoices_due_soon', count: dueSoon.length, href: '/dashboard/invoices?preset=duesoon' };
  }
  return null;
}

/*
 * ── صياغة العدد بالعربيّة ──
 * ١: «مهمّة متأخّرة واحدة» · ٢: «مهمّتان متأخّرتان» · ٣–١٠: «٣ مهامّ متأخّرة» ·
 * ١١ فما فوق: «١١ مهمّةً متأخّرة». والفعل يتبع: «تحتاج / تحتاجان».
 */
const arNum = (n: number) => n.toLocaleString('ar-EG');
function arCount(n: number, f: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const hundred = n % 100;
  if (hundred >= 3 && hundred <= 10) return `${arNum(n)} ${f.few}`;
  return `${arNum(n)} ${f.many}`;
}

export function workLineText(line: WorkLine, locale: Locale = 'ar'): string {
  const n = line.count;
  if (locale === 'en') {
    if (line.kind === 'tasks_overdue') return `You have ${n} overdue ${n === 1 ? 'task that needs' : 'tasks that need'} follow-up.`;
    if (line.kind === 'invoices_overdue') return `${n} overdue ${n === 1 ? 'invoice is' : 'invoices are'} within your follow-up.`;
    return `${n} ${n === 1 ? 'invoice falls' : 'invoices fall'} due within the next seven days in your follow-up.`;
  }
  if (line.kind === 'tasks_overdue') {
    const c = arCount(n, { one: 'مهمّة متأخّرة واحدة', two: 'مهمّتان متأخّرتان', few: 'مهامّ متأخّرة', many: 'مهمّةً متأخّرة' });
    return `لديك ${c} ${n === 2 ? 'تحتاجان' : 'تحتاج'} المتابعة.`;
  }
  if (line.kind === 'invoices_overdue') {
    const c = arCount(n, { one: 'فاتورة متأخّرة واحدة', two: 'فاتورتان متأخّرتان', few: 'فواتير متأخّرة', many: 'فاتورةً متأخّرة' });
    return `في نطاق متابعتك ${c} عن موعد السداد.`;
  }
  const c = arCount(n, { one: 'فاتورة واحدة', two: 'فاتورتان', few: 'فواتير', many: 'فاتورةً' });
  return `في نطاق متابعتك ${c} ${n === 2 ? 'تستحقّان' : 'تستحقّ'} خلال الأيام السبعة القادمة.`;
}
