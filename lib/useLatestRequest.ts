import { useCallback, useEffect, useState } from 'react';

/*
 * «الطلب الأحدث وحده يُحتسب».
 *
 * كلّ طلبٍ يأخذ رقماً ومُلغياً (`AbortController`). بدء طلبٍ جديد أو الإلغاء
 * الصريح يُبطل ما قبله، وردُّ الطلب المُبطَل يُتجاهَل ولو وصل. فلا تظهر نتائج
 * اختياراتٍ قديمة فوق اختياراتٍ جديدة.
 */
export function createLatestRequest() {
  let current = 0;
  let ctrl: AbortController | null = null;
  return {
    start() {
      ctrl?.abort();
      ctrl = new AbortController();
      current += 1;
      return { id: current, signal: ctrl.signal };
    },
    isLatest(id: number) { return id === current; },
    /** يُبطل الطلب الجاري إن وُجد، ويُرجع هل كان هناك ما يُبطَل. */
    cancel(): boolean {
      const had = !!ctrl && !ctrl.signal.aborted;
      ctrl?.abort();
      ctrl = null;
      current += 1;
      return had;
    },
  };
}

export function useLatestRequest() {
  // يُنشأ مرّةً واحدةً طوال عمر المكوّن
  const [r] = useState(createLatestRequest);
  // مغادرة الشاشة تُبطل ما بقي معلّقاً
  useEffect(() => () => { r.cancel(); }, [r]);
  const start = useCallback(() => r.start(), [r]);
  const isLatest = useCallback((id: number) => r.isLatest(id), [r]);
  const cancel = useCallback(() => r.cancel(), [r]);
  return { start, isLatest, cancel };
}
