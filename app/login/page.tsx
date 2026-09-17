'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  /*
   * سببُ الخروج الأخير — يكتبه معترض الطلبات ويُقرأ مرّةً واحدةً ثمّ يُمحى،
   * فلا تبقى الرسالة معلّقةً في كلّ زيارةٍ للشاشة.
   */
  const [loggedOutReason, setLoggedOutReason] = useState('');
  useEffect(() => {
    try {
      const r = localStorage.getItem('ume_logout_reason');
      if (r) { setLoggedOutReason(r); localStorage.removeItem('ume_logout_reason'); }
    } catch { /* noop */ }
  }, []);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      router.push('/dashboard');
    } catch (e: any) {
      /*
       * ثلاثة أسباب كانت تظهر برسالةٍ واحدة.
       *
       * كان `catch` يبتلع الحالة كلّها، فالحدّ الأقصى للمحاولات (429) وانقطاع
       * الخادم يقولان «كلمة المرور غير صحيحة» — فيُعاد المحاولة بكلمةٍ صحيحة
       * فتُرفض، ولا شيء يدلّ على السبب. والبيانات الخاطئة تبقى غامضةً عمداً
       * (لا تقول أَوُجد البريد أم لا)، أمّا الاثنان الآخران فيُقالان صراحةً.
       */
      const st = e?.response?.status;
      if (st === 429) setError('محاولات كثيرة متتالية — انتظر دقيقة ثمّ أعد المحاولة. الكلمة الصحيحة تُرفض أيضاً خلال هذه المدّة.');
      else if (!e?.response) setError('تعذّر الوصول إلى الخادم — تحقّق من الاتصال ثمّ أعد المحاولة.');
      else if (st >= 500) setError('عطلٌ في الخادم — أعد المحاولة بعد قليل.');
      else setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  }

  // على الشاشات الضيّقة كانت البطاقة تلتصق بالحافّتين فتُقصّ زواياها المستديرة — ومن هنا `p-4`.
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          {/* الشعار الرسمي — على أرضيةٍ فاتحة يُعرض بألوانه كما هي */}
          <img src="/ume-logo.svg" alt="UME Holding" className="h-10 w-auto mx-auto mb-1" />
          <p className="text-gray-500 mt-1">نظام إدارة المشتريات والمدفوعات</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin@ume.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          {loggedOutReason === 'session_revoked' && !error && (
            <p className="text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-sm text-center">
              تم تسجيل خروجك لأن الحساب تم تسجيل الدخول إليه من جهاز آخر.
            </p>
          )}

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
