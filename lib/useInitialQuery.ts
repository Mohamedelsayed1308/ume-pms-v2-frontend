import { useEffect } from 'react';

// يقرأ ?key=... من الرابط بعد التحميل (عميل فقط) ويمرّره لمُحدِّث الحالة —
// بديل آمن عن useSearchParams لتجنّب اشتراط Suspense في التوليد الساكن.
export function useInitialQuery(setter: (v: string) => void, key = 'q') {
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(key);
      if (v) setter(v);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
