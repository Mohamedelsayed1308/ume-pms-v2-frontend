'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import api from '@/lib/api';

interface Action { tool: string; ok: boolean; detail: string }
interface Msg { role: 'user' | 'assistant'; content: string; actions?: Action[] }

const TOOL_LABEL: Record<string, string> = {
  create_task: 'إنشاء مهمة',
  update_task: 'تعديل مهمة',
  add_comment: 'تعليق',
};

const SUGGESTIONS = [
  'ضيف مهمة: متابعة فاتورة إيجار فازا، عاجل، مسؤولها Bassel، بكرة',
  'إيه المهام المتأخرة؟',
  'حوّل كل المهام المعلقة لـ Tarek إلى جارية',
];

export default function TaskAssistant({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, loading, open]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    const next = [...msgs, { role: 'user', content: message } as Msg];
    setMsgs(next);
    setLoading(true);
    try {
      const res = await api.post('/api/tasks/assistant', { message, history });
      const { reply, actions, changed } = res.data as { reply: string; actions: Action[]; changed: boolean };
      setMsgs([...next, { role: 'assistant', content: reply, actions }]);
      if (changed) onChanged();
    } catch (err: any) {
      const detail = err?.response?.data?.message || err?.message || 'حصل خطأ، حاول تاني';
      setMsgs([...next, { role: 'assistant', content: `⚠️ ${detail}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 shadow-lg transition"
        title="المساعد الذكي"
      >
        <Icon name="sparkle" size={18} />
        <span className="text-sm font-semibold">مساعد ذكي</span>
      </button>

      {open && (
        <div className="fixed bottom-24 left-6 z-40 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-indigo-600 text-white rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Icon name="sparkle" size={18} />
              <div>
                <p className="text-sm font-bold leading-tight">المساعد الذكي</p>
                <p className="text-[11px] text-indigo-200 leading-tight">مهام الفريق — UME PMS</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white text-lg">✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {msgs.length === 0 && (
              <div className="text-center text-gray-400 text-xs mt-6 space-y-3">
                <p>اسألني عن المهام أو خليني أضيف/أعدّل مهمة بالكلام.</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full text-right bg-white border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-600 hover:border-indigo-300 hover:text-indigo-700 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                }`}>
                  {m.content}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.actions.map((a, j) => (
                        <span
                          key={j}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            a.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                          title={a.detail}
                        >
                          {a.ok ? '✓' : '✕'} {TOOL_LABEL[a.tool] || a.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-end">
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm text-gray-400">…بيفكر</div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2 border-t bg-white rounded-b-2xl">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="اكتب رسالتك…"
                disabled={loading}
                className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition"
              >
                إرسال
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
