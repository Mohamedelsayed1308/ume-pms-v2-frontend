'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({ vessels: 0, suppliers: 0, invoices: 0, alerts: 0 });
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const [vessels, suppliers, invoices, alertsRes] = await Promise.all([
        api.get('/api/vessels'),
        api.get('/api/suppliers'),
        api.get('/api/invoices'),
        api.get('/api/invoices/alerts/due?days=30'),
      ]);
      setStats({
        vessels: vessels.data.length,
        suppliers: suppliers.data.length,
        invoices: invoices.data.length,
        alerts: alertsRes.data.length,
      });
      setAlerts(alertsRes.data.slice(0, 5));
    }
    load();
  }, []);

  const cards = [
    { label: 'السفن', value: stats.vessels, icon: '🚢', color: 'bg-blue-500' },
    { label: 'الموردين', value: stats.suppliers, icon: '🏭', color: 'bg-green-500' },
    { label: 'الفواتير', value: stats.invoices, icon: '🧾', color: 'bg-purple-500' },
    { label: 'تنبيهات الاستحقاق', value: stats.alerts, icon: '⚠️', color: 'bg-orange-500' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">لوحة التحكم</h2>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className={`${c.color} text-white rounded-xl p-4`}>
            <div className="text-3xl mb-2">{c.icon}</div>
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="text-sm opacity-90 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-gray-700 mb-4">⚠️ فواتير تستحق قريباً (30 يوم)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-500 border-b">
                <th className="pb-2">رقم الفاتورة</th>
                <th className="pb-2">المورد</th>
                <th className="pb-2">المركب</th>
                <th className="pb-2">المبلغ</th>
                <th className="pb-2">تاريخ الاستحقاق</th>
                <th className="pb-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="py-2">{inv.invoice_number}</td>
                  <td className="py-2">{inv.supplier?.name}</td>
                  <td className="py-2">{inv.vessel?.name ?? '—'}</td>
                  <td className="py-2">{Number(inv.total_amount).toLocaleString()} {inv.currency}</td>
                  <td className="py-2">{inv.due_date?.slice(0, 10)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      inv.is_overdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {inv.is_overdue
                        ? `متأخرة ${Math.abs(inv.days_until_due)} يوم`
                        : `${inv.days_until_due} يوم`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
