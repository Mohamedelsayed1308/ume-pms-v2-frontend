'use client';
import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';

interface Msg { role: 'user' | 'assistant'; content: string }

export default function FleetAssistant({ filters }: { filters?: any }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const suggestions = [
    'أي مركب حقّق أعلى صافي ربح؟',
    'قارن أعداد الشاحنات بين المراكب',
    'ما اتجاه الأرباح خلال الشهور؟',
    'أي مركب الأكفأ (متوسط صافي لكل رحلة)؟',
  ];

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/api/fleet/assistant', { message: q, history, filters });
      setMsgs((m) => [...m, { role: 'assistant', content: res.data?.reply || 'تمام.' }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'حصل خطأ في الاتصال بالمساعد. حاول تاني.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" dir="rtl">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5 text-right hover:bg-gray-50/60 transition-colors">
        <span className="font-bold text-gray-800 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)' }}>🤖</span>
          المساعد الذكي للأسطول
        </span>
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t p-4">
          <div className="max-h-80 overflow-y-auto space-y-3 mb-3">
            {msgs.length === 0 && (
              <div className="text-sm text-gray-500">
                اسأل عن أداء الأسطول — مقارنات، اتجاهات، كفاءة، وأعداد المنقولات.
                <div className="flex flex-wrap gap-2 mt-3">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 text-gray-700">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-end"><div className="bg-gray-100 text-gray-400 rounded-2xl px-3 py-2 text-sm">...</div></div>}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
              placeholder="اكتب سؤالك عن الأسطول..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="text-white text-sm px-5 py-2 rounded-xl disabled:opacity-50 shadow-sm transition-all" style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)' }}>إرسال</button>
          </div>
        </div>
      )}
    </div>
  );
}
