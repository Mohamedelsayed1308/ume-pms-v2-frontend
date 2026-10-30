'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import type { AnItem } from '@/lib/reports/vesselAnalyst';

/*
 * المساعد الذكي في كارت المركب — زرّ «🤖» لكلّ بند وخانة سؤالٍ حرّ.
 *
 * السياق يبنيه الكارت (`buildContext`) عند كلّ سؤال، فيتبع الفترة المختارة. وما دام
 * بندٌ «في التركيز» تُسأل الأسئلة التالية عنه بسياقه، وإزالته تعيد السؤال إلى الكارت كلّه.
 */

export interface AnalystAsk { item: AnItem; nonce: number }
interface Turn { q: string; a?: string; err?: string; focus?: string; truncated?: boolean }

const apiMessage = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

/* ── عرض Markdown بسيط بلا HTML خام: عناوين ونقاط وخطّ عريض ورمز وجداول ── */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b>
      : p.startsWith('`') ? <code key={i} dir="ltr" className="bg-gray-100 rounded px-1 font-mono text-[0.85em]">{p.slice(1, -1)}</code>
        : <Fragment key={i}>{p}</Fragment>);
}
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={out.length} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse">
            <tbody>{rows.map((r, ri) => <tr key={ri} className={ri === 0 ? 'bg-gray-50 font-semibold' : 'border-t'}>{r.map((c, ci) => <td key={ci} className="px-2 py-1 whitespace-nowrap">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^#{1,4}\s/.test(l)) out.push(<p key={out.length} className="font-bold text-gray-800 mt-2">{inline(l.replace(/^#+\s/, ''))}</p>);
    else if (/^\s*([-•*]|\d+\.)\s/.test(l)) out.push(<p key={out.length} className="ps-4 -indent-3">• {inline(l.replace(/^\s*([-•*]|\d+\.)\s/, ''))}</p>);
    else if (l.trim()) out.push(<p key={out.length}>{inline(l)}</p>);
  }
  return <div className="space-y-1 leading-relaxed">{out}</div>;
}

export default function VesselAnalystPanel({ vessel, period, buildContext, ask }: {
  vessel: string;
  period: string;
  buildContext: (item: AnItem | null) => unknown;
  ask: AnalystAsk | null;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<AnItem | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastNonce = useRef(0);

  const send = async (question: string, item: AnItem | null) => {
    if (!question.trim() || busy) return;
    const history = turns.filter((t) => t.a).slice(-3).flatMap((t) => [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a! }]);
    setTurns((ts) => [...ts, { q: question, focus: item?.label }]);
    setBusy(true);
    try {
      const r = await api.post('/api/vessel-analyst/ask', {
        vessel, question,
        item: item ? { key: 'key' in item ? item.key : item.kind, label: item.label, kind: item.kind === 'revenue' || item.kind === 'manualRevenue' ? 'revenue' : 'expense', side: 'side' in item ? item.side : undefined } : null,
        context: buildContext(item),
        history,
      });
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, a: r.data?.answer || '', truncated: !!r.data?.truncated } : t)));
    } catch (e) {
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, err: apiMessage(e) || 'تعذّر الوصول إلى المساعد' } : t)));
    } finally { setBusy(false); }
  };

  // زرّ البند في الكارت: يضعه في التركيز ويسأل عنه
  useEffect(() => {
    if (!ask || ask.nonce === lastNonce.current) return;
    lastNonce.current = ask.nonce;
    setFocus(ask.item);
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void send(`حلّل بند «${ask.item.label}» في ${period}: الإجماليّ ونسبته، وتوزيعه على الرحلات والشاذّ منها، واتّجاهه شهراً بشهر، وعلاقته بالأعداد، ومصادره، وما يستحقّ المراجعة.`, ask.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- يُطلق بنقرة الزرّ وحدها
  }, [ask]);

  const submit = () => { const s = q; setQ(''); void send(s, focus); };

  return (
    <div ref={boxRef} className="bg-white rounded-xl shadow p-4 print:hidden scroll-mt-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-gray-800">🤖 المساعد الذكي — اسأل عن أيّ بند</h3>
        {turns.length > 0 && <button onClick={() => { setTurns([]); setFocus(null); }} className="text-xs text-gray-500 hover:text-gray-800">مسح المحادثة</button>}
      </div>
      <p className="text-xs text-gray-500 mb-3">اضغط 🤖 بجوار أيّ بندٍ في الكارت لتحليله، أو اكتب سؤالك. الأرقام من الكارت للفترة المختارة ({period})، والمساعد يشرحها ولا يعدّل شيئاً.</p>

      {turns.length > 0 && (
        <div className="space-y-3 mb-3 max-h-[32rem] overflow-y-auto">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="bg-blue-50 text-blue-900 rounded-lg px-3 py-2 text-sm">
                {t.focus && <span className="text-xs text-blue-600 block">🎯 {t.focus}</span>}
                {t.q}
              </div>
              {t.a != null && <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-800"><MiniMarkdown text={t.a} />{t.truncated && <p className="text-xs text-amber-600 mt-1">… الجواب طويل فقُطع — اسأل عن جزءٍ منه.</p>}</div>}
              {t.err && <p className="text-sm text-red-600">⚠️ {t.err}</p>}
              {t.a == null && !t.err && <p className="text-sm text-gray-400">… يحلّل</p>}
            </div>
          ))}
        </div>
      )}

      {focus && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="bg-amber-100 text-amber-800 rounded-full px-3 py-1">🎯 الأسئلة عن: {focus.label}</span>
          <button onClick={() => setFocus(null)} className="text-gray-500 hover:text-gray-800" aria-label="إزالة التركيز">✕ الكارت كلّه</button>
        </div>
      )}
      <div className="flex gap-2">
        <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={focus ? `سؤالٌ عن ${focus.label}…` : 'مثال: لماذا ارتفعت رسوم ميناء مصر في أكتوبر؟'}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={submit} disabled={busy || !q.trim()} className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? '…' : 'اسأل'}</button>
      </div>
    </div>
  );
}

/** زرّ «🤖» الصغير بجوار البند. */
export function AnalyzeButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={`حلّل: ${label}`} aria-label={`حلّل ${label}`}
      className="print:hidden ms-1 text-xs opacity-40 hover:opacity-100 focus:opacity-100 transition-opacity">🤖</button>
  );
}
