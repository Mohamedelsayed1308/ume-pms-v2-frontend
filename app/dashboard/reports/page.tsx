'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface UserReport {
  user_id: string;
  user_name: string;
  total: number;
  by_vessel: { vessel: string; count: number }[];
}

export default function ReportsPage() {
  const [data, setData] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/invoices/report/by-user')
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  const totalInvoices = data.reduce((s, u) => s + u.total, 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">تقرير نشاط المستخدمين</h2>
        <p className="text-sm text-gray-500 mt-1">عدد الفواتير المسجلة لكل مستخدم مقسّمة حسب السفينة</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{totalInvoices}</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي الفواتير</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">{data.length}</p>
              <p className="text-sm text-gray-500 mt-1">عدد المستخدمين</p>
            </div>
            {data.slice(0, 2).map((u) => (
              <div key={u.user_id} className="bg-white rounded-xl shadow p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{u.total}</p>
                <p className="text-sm text-gray-500 mt-1">{u.user_name}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-right">
                <tr>
                  <th className="px-4 py-3">المستخدم</th>
                  <th className="px-4 py-3 text-center">إجمالي الفواتير</th>
                  <th className="px-4 py-3 text-center">نسبة المشاركة</th>
                  <th className="px-4 py-3">تفاصيل السفن</th>
                </tr>
              </thead>
              <tbody>
                {data.sort((a, b) => b.total - a.total).map((u) => (
                  <>
                    <tr key={u.user_id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                            {u.user_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800">{u.user_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-bold text-gray-800">{u.total}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${totalInvoices ? (u.total / totalInvoices) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10">
                            {totalInvoices ? Math.round((u.total / totalInvoices) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(expanded === u.user_id ? null : u.user_id)}
                          className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                        >
                          {expanded === u.user_id ? '▲ إخفاء' : '▼ عرض السفن'}
                        </button>
                      </td>
                    </tr>
                    {expanded === u.user_id && (
                      <tr key={`${u.user_id}-detail`} className="bg-blue-50 border-t">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="flex flex-wrap gap-2">
                            {u.by_vessel.sort((a, b) => b.count - a.count).map((v) => (
                              <div key={v.vessel} className="bg-white border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                <span className="text-blue-500">⚓</span>
                                <span className="text-sm font-medium text-gray-700">{v.vessel}</span>
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{v.count}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-400">
                      لا توجد بيانات — ستظهر هنا عند إضافة فواتير
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
