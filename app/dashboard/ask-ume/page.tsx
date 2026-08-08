'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Icon, Button, Spinner, cx } from '@/components/ui';
import { canHref } from '@/lib/profile';

interface Fact { label: string; value: string }
interface Action { label: string; route: string }
interface AskRes { answer: string; facts: Fact[]; sources: string[]; limitations: string[]; actions: Action[] }
interface Msg { role: 'user' | 'assistant'; content: string; res?: AskRes; error?: boolean }

type Bi = { ar: string; en: string };

export default function AskUmePage() {
  const { locale } = useI18n();
  const L = (b: Bi) => (locale === 'en' ? b.en : b.ar);
  const router = useRouter();
  const user = typeof window !== 'undefined' ? getUser() : null;
  const can = (h: string) => canHref(user, h);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, loading]);

  // اقتراحات مراعية للصلاحية
  const SUGGESTIONS: { q: Bi; need?: string }[] = [
    { q: { ar: 'ما الذي يحتاج انتباهي اليوم؟', en: 'What needs my attention today?' } },
    { q: { ar: 'أظهر الفواتير المتأخرة', en: 'Show overdue invoices' }, need: '/dashboard/invoices' },
    { q: { ar: 'أي مورد عليه أعلى مستحقات؟', en: 'Which supplier has the highest outstanding?' }, need: '/dashboard/suppliers' },
    { q: { ar: 'المدفوعات الفعلية هذا الشهر', en: 'Actual payments this month' }, need: '/dashboard/payments' },
    { q: { ar: 'لخّص مركب Alcudia Express', en: 'Summarize Alcudia Express' }, need: '/dashboard/vessels' },
    { q: { ar: 'ما المهام المتأخرة؟', en: 'Which tasks are overdue?' }, need: '/dashboard/tasks' },
  ].filter((s) => !s.need || can(s.need));

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput('');
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const next: Msg[] = [...msgs, { role: 'user', content: question }];
    setMsgs(next);
    setLoading(true);
    try {
      const res = await api.post('/api/ask-ume', { question, history });
      const d = res.data as AskRes;
      setMsgs([...next, { role: 'assistant', content: d.answer || '', res: d }]);
    } catch (err: any) {
      const msg = err?.response?.status === 401
        ? L({ ar: 'انتهت الجلسة — سجّل الدخول من جديد.', en: 'Session expired — please sign in again.' })
        : L({ ar: 'المساعد غير متاح مؤقتاً، حاول مرة أخرى.', en: 'Assistant is temporarily unavailable, please try again.' });
      setMsgs([...next, { role: 'assistant', content: msg, error: true }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Icon name="sparkle" size={24} /></span>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ask UME</h1>
          <p className="text-sm text-gray-500">{L({ ar: 'مساعد إداري ومالي — للقراءة فقط، من بيانات النظام المتاحة لك', en: 'Management & finance assistant — read-only, from data you can access' })}</p>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {msgs.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-sm mb-4">{L({ ar: 'اسأل عن المستحقات، المدفوعات الفعلية، الموردين، المراكب، أو المهام.', en: 'Ask about outstanding, actual payments, suppliers, vessels, or tasks.' })}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s.q.en} onClick={() => send(L(s.q))}
                  className="text-start text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white hover:border-brand-300 hover:bg-brand-50 text-gray-700 transition">
                  {L(s.q)}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={cx('max-w-[92%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm border', m.error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-white border-gray-100 text-gray-800')}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.res && (
                  <>
                    {m.res.facts?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {m.res.facts.map((f, j) => (
                          <span key={j} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs">
                            <span className="text-gray-500">{f.label}:</span><span className="font-semibold text-gray-800 tabular-nums">{f.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.res.limitations?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.res.limitations.map((l, j) => (
                          <p key={j} className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 flex items-start gap-1"><Icon name="bell" size={12} /> {l}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mt-2.5">
                      {m.res.sources?.map((s, j) => (
                        <span key={j} className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">{s}</span>
                      ))}
                    </div>
                    {m.res.actions?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        {m.res.actions.map((a, j) => (
                          <button key={j} onClick={() => router.push(a.route)}
                            className="inline-flex items-center gap-1 text-xs text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50">
                            {a.label} <Icon name={locale === 'en' ? 'chevronLeft' : 'chevronRight'} size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-400 flex items-center gap-2"><Spinner size={16} /> {L({ ar: 'أفكّر…', en: 'Thinking…' })}</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-canvas pt-2">
        <div className="flex gap-2 items-end bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={L({ ar: 'اكتب سؤالك…', en: 'Type your question…' })}
            rows={1}
            maxLength={1000}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus:outline-none max-h-32"
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? <Spinner size={16} /> : <Icon name="sparkle" size={16} />} {L({ ar: 'اسأل', en: 'Ask' })}
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 text-center mt-1.5">{L({ ar: 'للقراءة فقط · لكل عملة على حدة · المتبقّي = الإجمالي − المدفوع · مدفوعات فعلية من سجلات المدفوعات', en: 'Read-only · per currency · Outstanding = total − paid · actual payments from Payments records' })}</p>
      </div>
    </div>
  );
}
