'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

const statusLabel: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئي', paid: 'مدفوعة', cancelled: 'ملغاة' };
const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };

type ReportType = 'supplier-statement' | 'unpaid-supplier' | 'unpaid-vessel' | 'vessel-suppliers' | 'due-alerts' | 'user-activity' | 'dept-delays';

interface UserReport {
  user_id: string;
  user_name: string;
  total: number;
  by_vessel: { vessel: string; count: number }[];
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('due-alerts');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedVessel, setSelectedVessel] = useState('');
  const [daysAhead, setDaysAhead] = useState('30');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get('/api/suppliers'), api.get('/api/vessels')]).then(([s, v]) => {
      setSuppliers(s.data);
      setVessels(v.data);
    });
  }, []);

  async function runReport() {
    setLoading(true);
    setData(null);
    try {
      let res;
      if (reportType === 'supplier-statement' && selectedSupplier) {
        res = await api.get(`/api/invoices/statement/supplier/${selectedSupplier}`);
      } else if (reportType === 'unpaid-supplier' && selectedSupplier) {
        res = await api.get(`/api/invoices/unpaid/by-supplier/${selectedSupplier}`);
      } else if (reportType === 'unpaid-vessel' && selectedVessel) {
        res = await api.get(`/api/invoices/unpaid/by-vessel/${selectedVessel}`);
      } else if (reportType === 'vessel-suppliers' && selectedVessel) {
        res = await api.get(`/api/vessels/${selectedVessel}/suppliers`);
      } else if (reportType === 'due-alerts') {
        res = await api.get(`/api/invoices/alerts/due?days=${daysAhead}`);
      } else if (reportType === 'user-activity') {
        res = await api.get('/api/invoices/report/by-user');
      } else if (reportType === 'dept-delays') {
        res = await api.get('/api/invoices/report/department-delays');
      }
      if (res) setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  const reports = [
    { id: 'due-alerts', label: '⚠️ تنبيهات الاستحقاق', desc: 'فواتير مستحقة خلال فترة محددة' },
    { id: 'supplier-statement', label: '📒 كشف حساب مورد', desc: 'مدين / دائن / رصيد متراكم' },
    { id: 'unpaid-supplier', label: '🔴 مستحقات مورد', desc: 'الفواتير غير المدفوعة أو الجزئية لمورد' },
    { id: 'unpaid-vessel', label: '🚢 مستحقات مركب', desc: 'الفواتير غير المدفوعة على مركب معين' },
    { id: 'vessel-suppliers', label: '📊 موردو المركب', desc: 'حجم تعامل كل مورد على المركب' },
    { id: 'user-activity', label: '👤 نشاط المستخدمين', desc: 'عدد الفواتير لكل مستخدم حسب السفينة' },
    { id: 'dept-delays', label: '🔔 تأخرات الأقسام', desc: 'فواتير تجاوزت 3 أيام بدون إجراء' },
  ];

  const needsSupplier = ['supplier-statement', 'unpaid-supplier'].includes(reportType);
  const needsVessel = ['unpaid-vessel', 'vessel-suppliers'].includes(reportType);
  const needsDays = reportType === 'due-alerts';
  const noFilter = reportType === 'user-activity' || reportType === 'dept-delays';

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">التقارير</h2>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {reports.map((r) => (
          <button key={r.id} onClick={() => { setReportType(r.id as ReportType); setData(null); }}
            className={`p-3 rounded-xl border text-right transition-all ${reportType === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
            <div className="font-medium text-sm">{r.label}</div>
            <div className="text-xs text-gray-500 mt-1">{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 mb-6 flex items-end gap-4">
        {needsSupplier && (
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">المورد</label>
            <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— اختر المورد —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {needsVessel && (
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">المركب</label>
            <select value={selectedVessel} onChange={(e) => setSelectedVessel(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— اختر المركب —</option>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        {needsDays && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">خلال (يوم)</label>
            <select value={daysAhead} onChange={(e) => setDaysAhead(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="7">7 أيام</option>
              <option value="15">15 يوم</option>
              <option value="30">30 يوم</option>
              <option value="60">60 يوم</option>
              <option value="90">90 يوم</option>
              <option value="0">متأخرة فقط</option>
            </select>
          </div>
        )}
        {noFilter && <p className="text-sm text-gray-400 flex-1">لا يحتاج فلتر — اضغط عرض التقرير</p>}
        <button onClick={runReport} disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'جاري...' : 'عرض التقرير'}
        </button>
      </div>

      {/* Results */}
      {data && (
        <div className="bg-white rounded-xl shadow p-4">

          {/* Due Alerts */}
          {reportType === 'due-alerts' && Array.isArray(data) && (
            <>
              <h3 className="font-bold text-gray-700 mb-4">⚠️ فواتير مستحقة — {data.length} فاتورة</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">رقم الفاتورة</th>
                    <th className="px-4 py-2">المورد</th>
                    <th className="px-4 py-2">السفينة</th>
                    <th className="px-4 py-2">المبلغ</th>
                    <th className="px-4 py-2">المتبقي</th>
                    <th className="px-4 py-2">تاريخ الاستحقاق</th>
                    <th className="px-4 py-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv: any) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                      <td className="px-4 py-2">{inv.supplier?.name}</td>
                      <td className="px-4 py-2">{inv.vessel?.name || '—'}</td>
                      <td className="px-4 py-2">{Number(inv.total_amount).toLocaleString()} {inv.currency}</td>
                      <td className="px-4 py-2 text-red-600 font-medium">{(+inv.total_amount - +inv.paid_amount).toLocaleString()}</td>
                      <td className="px-4 py-2">{inv.due_date?.slice(0, 10)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${inv.is_overdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {inv.is_overdue ? `متأخرة ${Math.abs(inv.days_until_due)} يوم` : `${inv.days_until_due} يوم`}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gray-400">لا توجد فواتير مستحقة</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Supplier Statement */}
          {reportType === 'supplier-statement' && data.supplier && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-700">📒 كشف حساب — {data.supplier.name}</h3>
                <div className="flex gap-6 text-sm">
                  <span className="text-red-600">إجمالي مدين: <strong>{Number(data.summary.total_debit).toLocaleString()}</strong></span>
                  <span className="text-green-600">إجمالي دائن: <strong>{Number(data.summary.total_credit).toLocaleString()}</strong></span>
                  <span className={data.summary.balance > 0 ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>
                    الرصيد: {Number(data.summary.balance).toLocaleString()}
                  </span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">التاريخ</th>
                    <th className="px-4 py-2">البيان</th>
                    <th className="px-4 py-2">السفينة</th>
                    <th className="px-4 py-2">مدين</th>
                    <th className="px-4 py-2">دائن</th>
                    <th className="px-4 py-2">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t: any, i: number) => (
                    <tr key={i} className={`border-t ${t.type === 'debit' ? 'bg-red-50/30' : 'bg-green-50/30'}`}>
                      <td className="px-4 py-2 text-gray-500">{t.date?.slice(0, 10)}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2 text-gray-500">{t.vessel || '—'}</td>
                      <td className="px-4 py-2 text-red-600 font-medium">{t.debit > 0 ? Number(t.debit).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-green-600 font-medium">{t.credit > 0 ? Number(t.credit).toLocaleString() : '—'}</td>
                      <td className={`px-4 py-2 font-bold ${t.running_balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {Number(t.running_balance).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-bold">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right">الإجمالي</td>
                    <td className="px-4 py-2 text-red-700">{Number(data.summary.total_debit).toLocaleString()}</td>
                    <td className="px-4 py-2 text-green-700">{Number(data.summary.total_credit).toLocaleString()}</td>
                    <td className={`px-4 py-2 ${data.summary.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {Number(data.summary.balance).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {/* Unpaid by Supplier or Vessel */}
          {(reportType === 'unpaid-supplier' || reportType === 'unpaid-vessel') && Array.isArray(data) && (
            <>
              <h3 className="font-bold text-gray-700 mb-4">🔴 الفواتير غير المسددة — {data.length} فاتورة</h3>
              <div className="flex gap-6 text-sm mb-4">
                <span className="text-gray-600">إجمالي: <strong>{data.reduce((s: number, i: any) => s + +i.total_amount, 0).toLocaleString()}</strong></span>
                <span className="text-red-600">المتبقي: <strong>{data.reduce((s: number, i: any) => s + (+i.total_amount - +i.paid_amount), 0).toLocaleString()}</strong></span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">رقم الفاتورة</th>
                    {reportType === 'unpaid-vessel' && <th className="px-4 py-2">المورد</th>}
                    {reportType === 'unpaid-supplier' && <th className="px-4 py-2">السفينة</th>}
                    <th className="px-4 py-2">المبلغ</th>
                    <th className="px-4 py-2">المدفوع</th>
                    <th className="px-4 py-2">المتبقي</th>
                    <th className="px-4 py-2">الاستحقاق</th>
                    <th className="px-4 py-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv: any) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                      {reportType === 'unpaid-vessel' && <td className="px-4 py-2">{inv.supplier?.name}</td>}
                      {reportType === 'unpaid-supplier' && <td className="px-4 py-2">{inv.vessel?.name || '—'}</td>}
                      <td className="px-4 py-2">{Number(inv.total_amount).toLocaleString()} {inv.currency}</td>
                      <td className="px-4 py-2 text-green-600">{Number(inv.paid_amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-red-600 font-bold">{(+inv.total_amount - +inv.paid_amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-500">{inv.due_date?.slice(0, 10) || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${statusColor[inv.status]}`}>{statusLabel[inv.status]}</span>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gray-400">لا توجد فواتير مستحقة</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Vessel Suppliers */}
          {reportType === 'vessel-suppliers' && Array.isArray(data) && (
            <>
              <h3 className="font-bold text-gray-700 mb-4">📊 موردو المركب — {data.length} مورد</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-right">
                  <tr>
                    <th className="px-4 py-2">المورد</th>
                    <th className="px-4 py-2">عدد الفواتير</th>
                    <th className="px-4 py-2">إجمالي الفواتير</th>
                    <th className="px-4 py-2">المدفوع</th>
                    <th className="px-4 py-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 font-medium">{row.supplier_name}</td>
                      <td className="px-4 py-2 text-center">{row.total_invoices}</td>
                      <td className="px-4 py-2">{Number(row.total_amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-green-600">{Number(row.paid_amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-red-600 font-bold">{(+row.total_amount - +row.paid_amount).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {/* Department Delays */}
          {reportType === 'dept-delays' && Array.isArray(data) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-700">🔔 تأخرات الأقسام — {data.length} فاتورة متأخرة</h3>
                <p className="text-xs text-gray-400">الفواتير التي تجاوزت 3 أيام في نفس الحالة</p>
              </div>
              {data.length === 0 ? (
                <p className="text-center py-10 text-green-600 font-medium">✅ لا توجد تأخرات — كل الأقسام تعمل في الوقت المحدد</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-right">
                    <tr>
                      <th className="px-4 py-2">رقم الفاتورة</th>
                      <th className="px-4 py-2">المورد</th>
                      <th className="px-4 py-2">السفينة</th>
                      <th className="px-4 py-2">المبلغ</th>
                      <th className="px-4 py-2">الحالة</th>
                      <th className="px-4 py-2">تاريخ الحالة</th>
                      <th className="px-4 py-2 text-center">أيام التأخر</th>
                      <th className="px-4 py-2">القسم المسؤول</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((inv: any) => (
                      <tr key={inv.id} className="border-t hover:bg-red-50/30">
                        <td className="px-4 py-2 font-mono text-blue-700">{inv.invoice_number}</td>
                        <td className="px-4 py-2">{inv.supplier || '—'}</td>
                        <td className="px-4 py-2">{inv.vessel || '—'}</td>
                        <td className="px-4 py-2">{Number(inv.total_amount).toLocaleString()} {inv.currency}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            inv.approval_status === 'waiting_po' ? 'bg-orange-100 text-orange-700' :
                            inv.approval_status === 'delivery_missing' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {inv.approval_status === 'waiting_po' ? 'Waiting PO' :
                             inv.approval_status === 'delivery_missing' ? 'Delivery Missing' : 'Send to Pay'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{inv.approval_status_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            inv.days_delayed > 7 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {inv.days_delayed} يوم
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium text-gray-700">{inv.department}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* User Activity */}
          {reportType === 'user-activity' && Array.isArray(data) && (
            <>
              <h3 className="font-bold text-gray-700 mb-4">👤 نشاط المستخدمين — {data.length} مستخدم</h3>
              {(() => {
                const users = data as UserReport[];
                const total = users.reduce((s, u) => s + u.total, 0);
                return (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-right">
                      <tr>
                        <th className="px-4 py-2">المستخدم</th>
                        <th className="px-4 py-2 text-center">عدد الفواتير</th>
                        <th className="px-4 py-2">نسبة المشاركة</th>
                        <th className="px-4 py-2">السفن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.sort((a, b) => b.total - a.total).map((u) => (
                        <>
                          <tr key={u.user_id} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                                  {u.user_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{u.user_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center font-bold text-lg">{u.total}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${total ? (u.total / total) * 100 : 0}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 w-8">{total ? Math.round((u.total / total) * 100) : 0}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <button onClick={() => setExpanded(expanded === u.user_id ? null : u.user_id)}
                                className="text-blue-600 text-xs hover:underline">
                                {expanded === u.user_id ? '▲ إخفاء' : '▼ عرض السفن'}
                              </button>
                            </td>
                          </tr>
                          {expanded === u.user_id && (
                            <tr key={`${u.user_id}-d`} className="bg-blue-50 border-t">
                              <td colSpan={4} className="px-6 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {u.by_vessel.sort((a, b) => b.count - a.count).map((v) => (
                                    <div key={v.vessel} className="bg-white border border-blue-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                      <span className="text-blue-500 text-sm">⚓</span>
                                      <span className="text-sm text-gray-700">{v.vessel}</span>
                                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{v.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد بيانات بعد</td></tr>
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
