'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Icon, Spinner } from '@/components/ui';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * إعادة صياغة الإيميلات
 *
 * ── ما لا تفعله هذه الشاشة ──
 * لا تقرأ من النظام شيئاً، ولا تُرسِل إيميلاً. تأخذ نصّاً وتردّ نصّاً، والنسخُ
 * بيد المستخدم. فالإرسالُ فعلٌ لا رجعة فيه، ولا يُؤتمن عليه مساعدٌ يكتب.
 *
 * ── والقيم إنجليزيّةٌ ثابتة ──
 * `supplier` و`follow_up` وأمثالُهما تُرسَل كما هي، لأنّ الخادم يتحقّق منها
 * بقوائم مغلقة. والترجمة في `lib/i18n.tsx` تخصّ ما يُرى لا ما يُرسَل.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Recipient = 'supplier' | 'customer' | 'colleague' | 'manager' | 'bank_auditor';
type Purpose =
  | 'follow_up' | 'payment_reminder' | 'document_request' | 'apology'
  | 'rejection' | 'clarification' | 'escalation' | 'other';
type Tone = 'neutral_formal' | 'firm' | 'friendly';
type Language = 'en' | 'ar' | 'both';
type Adjust = 'firmer' | 'softer' | 'shorter';

interface RewriteResponse {
  subject: string;
  body: string;
  language: Language;
  missing?: string[];
}

interface RecentRewrite {
  ts: number;
  recipient: Recipient;
  purpose: Purpose;
  tone: Tone;
  language: Language;
  subject: string;
  body: string;
}

const RECIPIENTS: Recipient[] = ['supplier', 'customer', 'colleague', 'manager', 'bank_auditor'];
const PURPOSES: Purpose[] = [
  'follow_up', 'payment_reminder', 'document_request', 'apology',
  'rejection', 'clarification', 'escalation', 'other',
];
const TONES: Tone[] = ['neutral_formal', 'firm', 'friendly'];
const LANGUAGES: Language[] = ['en', 'ar', 'both'];
const ADJUSTMENTS: Adjust[] = ['firmer', 'softer', 'shorter'];

/** نفس حدّ الخادم — فالرفض يقع هنا قبل أن يُنفَق نداء. */
const MAX_TEXT = 8000;

/*
 * السجلّ في المتصفّح وحده — لا جدول ولا هجرة.
 *
 * على نمط `ume_report_recents` في شاشة التقارير: قراءةٌ وكتابةٌ داخل
 * `try/catch`، لأنّ التخزين المحلّي قد يكون مقفلاً في وضع التصفّح الخاصّ،
 * وسقوطُه يجب ألّا يُسقط الشاشة.
 */
const RECENTS_KEY = 'ume_email_rewrite_recents';
const MAX_RECENTS = 10;

function readRecents(): RecentRewrite[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

function writeRecents(items: RecentRewrite[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS))); } catch { /* noop */ }
}

export default function EmailRewritePage() {
  const { t, dir } = useI18n();

  const [recipient, setRecipient] = useState<Recipient>('supplier');
  const [purpose, setPurpose] = useState<Purpose>('follow_up');
  const [tone, setTone] = useState<Tone>('neutral_formal');
  const [language, setLanguage] = useState<Language>('en');
  const [draft, setDraft] = useState('');
  const [incoming, setIncoming] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [outLang, setOutLang] = useState<Language>('en');
  const [missing, setMissing] = useState<string[]>([]);

  const [recents, setRecents] = useState<RecentRewrite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'all' | 'body' | null>(null);

  /*
   * القراءة داخل أثرٍ لا في القيمة الابتدائيّة.
   *
   * `localStorage` غير موجودٍ أثناء التصيير على الخادم، وقراءتُه في
   * `useState(() => …)` تجعل ما يُصيَّر على الخادم يخالف ما يُصيَّر على العميل
   * فتنكسر الإماهة. والأثرُ يعمل بعدها فيُوفّق بينهما.
   */
  // eslint-disable-next-line react-hooks/set-state-in-effect -- مقروءٌ من المتصفّح، ولا يوجد قبل الإماهة
  useEffect(() => { setRecents(readRecents()); }, []);

  /**
   * نداءٌ واحدٌ يخدم الصياغة والصقل.
   *
   * والفرق سطرٌ واحد: بلا `adjust` تُرسَل **مسودّة المستخدم**، ومعه يُرسَل
   * **المخرج الحالي**. فأزرار «أحزم / ألين / أقصر» تصقل الناتج ولا ترجع إلى
   * أوّل الطريق — ولو رجعت لضاع كلّ تعديلٍ كتبه المستخدم بيده.
   */
  async function rewrite(adjust?: Adjust) {
    const payloadDraft = adjust ? `Subject: ${subject}\n\n${body}`.trim() : draft.trim();
    if (!payloadDraft || loading) return;

    setLoading(true);
    setError('');
    setCopied(null);
    try {
      const res = await api.post('/api/email/rewrite', {
        recipient, purpose, tone, language,
        draft: payloadDraft,
        incoming: incoming.trim() || undefined,
        adjust,
      });
      const d = res.data as RewriteResponse;
      setSubject(d.subject || '');
      setBody(d.body || '');
      setOutLang(d.language || language);
      setMissing(Array.isArray(d.missing) ? d.missing : []);

      const item: RecentRewrite = {
        ts: Date.now(), recipient, purpose, tone,
        language: d.language || language,
        subject: d.subject || '', body: d.body || '',
      };
      const next = [item, ...recents].slice(0, MAX_RECENTS);
      setRecents(next);
      writeRecents(next);
    } catch (err) {
      // 429 له رسالته: «حاول تاني» بلا سببٍ يترك المستخدم يعيد النقر بلا طائل.
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 429 ? t('email.error.limit') : t('email.error.connection'));
    } finally {
      setLoading(false);
    }
  }

  async function copy(kind: 'all' | 'body') {
    const text = kind === 'all' ? `Subject: ${subject}\n\n${body}` : body;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch { setError(t('email.error.copy')); }
  }

  function clearRecents() {
    setRecents([]);
    try { localStorage.removeItem(RECENTS_KEY); } catch { /* noop */ }
  }

  /*
   * اتّجاه صندوق المخرج يتبع **لغة المخرج** لا لغة الواجهة.
   *
   * فمن يكتب واجهته عربيّةً ويطلب إيميلاً إنجليزيّاً يجب أن يرى الإنجليزيّة
   * من اليسار. و`both` فيه الاثنتان معاً، فيُترك للمتصفّح: `auto` يقرأ أوّل
   * حرفٍ ذي اتّجاهٍ في كلّ فقرة.
   */
  const outDir = outLang === 'ar' ? 'rtl' : outLang === 'en' ? 'ltr' : 'auto';

  const selectCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const labelCls = 'mb-1.5 block text-xs font-semibold text-gray-600';
  const counterCls = 'mt-1 text-end text-[11px] tabular-nums text-gray-400';

  /*
   * القوائم الأربع تُرسَم بحلقةٍ واحدة، ومفتاحُها هو اسم الحقل نفسه — فمفتاح
   * الترجمة يُشتقّ منه: `email.recipient` للعنوان، و`email.recipient.supplier`
   * للخيار. فإضافةُ قيمةٍ جديدةٍ لاحقاً لا تحتاج إلا سطراً في القائمة وسطراً
   * في القاموس.
   */
  const SELECTS: { key: string; value: string; set: (v: string) => void; opts: readonly string[] }[] = [
    { key: 'recipient', value: recipient, set: (v) => setRecipient(v as Recipient), opts: RECIPIENTS },
    { key: 'purpose', value: purpose, set: (v) => setPurpose(v as Purpose), opts: PURPOSES },
    { key: 'tone', value: tone, set: (v) => setTone(v as Tone), opts: TONES },
    { key: 'language', value: language, set: (v) => setLanguage(v as Language), opts: LANGUAGES },
  ];

  return (
    <div dir={dir}>
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon name="file" size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('email.title')}</h1>
          <p className="text-sm text-gray-500">{t('email.subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* ── المدخلات ── */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:col-span-4" dir="rtl">
          <h2 className="mb-3 text-sm font-bold text-gray-700">{t('email.input.title')}</h2>

          <label className={labelCls} htmlFor="email-draft">{t('email.draft')}</label>
          <textarea
            id="email-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_TEXT}
            rows={8}
            placeholder={t('email.draft.placeholder')}
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className={counterCls}>{draft.length} / {MAX_TEXT}</p>

          {/* الوارد مطويٌّ افتراضاً — فأكثر الصياغات تبدأ من الصفر لا من ردّ. */}
          <details className="mb-4 mt-2 rounded-xl border border-gray-200">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-gray-700">
              {t('email.incoming')}
            </summary>
            <div className="border-t border-gray-100 p-3">
              <textarea
                value={incoming}
                onChange={(e) => setIncoming(e.target.value)}
                maxLength={MAX_TEXT}
                rows={6}
                placeholder={t('email.incoming.placeholder')}
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className={counterCls}>{incoming.length} / {MAX_TEXT}</p>
            </div>
          </details>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SELECTS.map((s) => (
              <label key={s.key}>
                <span className={labelCls}>{t(`email.${s.key}`)}</span>
                <select value={s.value} onChange={(e) => s.set(e.target.value)} className={selectCls}>
                  {s.opts.map((v) => (
                    <option key={v} value={v}>{t(`email.${s.key}.${v}`)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <Button
            className="mt-4 w-full"
            onClick={() => rewrite()}
            disabled={loading || !draft.trim()}
          >
            {loading ? <Spinner size={16} /> : <Icon name="sparkle" size={16} />}
            <span className="ms-2">{t('email.rewrite')}</span>
          </Button>
        </section>

        {/* ── المخرج ── */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:col-span-5" dir="rtl">
          <h2 className="mb-3 text-sm font-bold text-gray-700">{t('email.output.title')}</h2>

          {!subject && !body && !loading ? (
            <p className="py-10 text-center text-sm text-gray-400">{t('email.output.empty')}</p>
          ) : (
            <>
              <label className={labelCls} htmlFor="email-subject">{t('email.subject')}</label>
              <input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                dir={outDir}
                className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />

              <label className={labelCls} htmlFor="email-body">{t('email.body')}</label>
              <textarea
                id="email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                dir={outDir}
                rows={14}
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
              />

              {/*
                * التنبيه الأصفر ليس خطأً — هو **وعدٌ محفوظ**.
                *
                * فالقاعدة الأولى تمنع اختراع رقم، فيترك المساعد `[ ]` مكانه.
                * وهذه القائمة تقول ما تُرك، فلا يُرسَل قوسٌ فارغٌ سهواً.
                */}
              {missing.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('email.missing')}</p>
                    <p className="mt-1 text-xs">{missing.join(' · ')}</p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copy('all')}>
                  <Icon name="clipboard" size={15} />
                  <span className="ms-1.5">{copied === 'all' ? t('email.copied') : t('email.copy.all')}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => copy('body')}>
                  <Icon name="clipboard" size={15} />
                  <span className="ms-1.5">{copied === 'body' ? t('email.copied') : t('email.copy.body')}</span>
                </Button>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className={labelCls}>{t('email.adjust')}</p>
                <div className="flex flex-wrap gap-2">
                  {ADJUSTMENTS.map((a) => (
                    <Button key={a} variant="outline" size="sm" disabled={loading} onClick={() => rewrite(a)}>
                      {t(`email.adjust.${a}`)}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── السجلّ المحلّي ── */}
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:col-span-3" dir="rtl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">{t('email.recents')}</h2>
            {recents.length > 0 && (
              <button onClick={clearRecents} className="text-xs text-gray-400 hover:text-red-600">
                {t('email.recents.clear')}
              </button>
            )}
          </div>

          {recents.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">{t('email.recents.empty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {recents.map((r) => (
                <li key={r.ts}>
                  <button
                    onClick={() => {
                      setSubject(r.subject);
                      setBody(r.body);
                      setOutLang(r.language);
                      setMissing([]);
                    }}
                    className="w-full rounded-lg border border-gray-100 px-2.5 py-2 text-start text-xs text-gray-700 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="line-clamp-1 font-medium">{r.subject || t('email.recents.untitled')}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {t(`email.recipient.${r.recipient}`)} · {t(`email.purpose.${r.purpose}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] leading-relaxed text-gray-400">
            {t('email.localOnly')}
          </p>
        </aside>
      </div>
    </div>
  );
}
