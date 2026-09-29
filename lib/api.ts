import axios from 'axios';

/*
 * عنوان الباك: الإنتاج افتراضيّاً كما كان. وبيئة تطويرٍ أو اختبارٍ منفصلة تضبط
 * `NEXT_PUBLIC_API_URL` (يُدمج وقت البناء) — فلا تلمس الإنتاج ولا جلساته.
 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim() || 'https://ume-pms-v2-backend-production.up.railway.app';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/*
 * خروجٌ عند 401 — مع تمييز إبطال الجلسة.
 *
 * الخادم يردّ `code: 'SESSION_REVOKED'` حين يدخل الحساب من جهازٍ آخر. فتُحفظ
 * العلامة قبل التحويل لتقرأها شاشة الدخول وتقول السبب — وإلّا خرج المستخدم
 * بلا تفسيرٍ وظنّ العطل في كلمته.
 *
 * والتحويل يُنفَّذ مرّةً واحدة: عدّة طلباتٍ متوازيةٍ من الجهاز القديم تُرَدّ كلّها
 * بـ401، ولا داعي لأن يَقفز المتصفّح مرّاتٍ.
 */
let redirecting = false;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (err.response?.data?.code === 'SESSION_REVOKED') {
        try { localStorage.setItem('ume_logout_reason', 'session_revoked'); } catch { /* noop */ }
      }
      localStorage.removeItem('token');
      if (!redirecting && !window.location.pathname.startsWith('/login')) {
        redirecting = true;
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
