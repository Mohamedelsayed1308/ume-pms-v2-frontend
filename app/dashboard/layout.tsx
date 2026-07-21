'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠' },
  { href: '/dashboard/vessels', label: 'السفن', icon: '🚢' },
  { href: '/dashboard/suppliers', label: 'الموردين', icon: '🏭' },
  { href: '/dashboard/purchase-orders', label: 'أوامر الشراء', icon: '📋' },
  { href: '/dashboard/invoices', label: 'الفواتير', icon: '🧾' },
  { href: '/dashboard/payments', label: 'المدفوعات', icon: '💳' },
  { href: '/dashboard/reports', label: 'التقارير', icon: '📊' },
  { href: '/dashboard/customers', label: 'العملاء', icon: '🤝' },
  { href: '/dashboard/hire-invoices', label: 'فواتير الإيجار', icon: '🚢💰' },
  { href: '/dashboard/shipping-companies', label: 'شركات الشحن', icon: '🏢' },
  { href: '/dashboard/management-invoices', label: 'فواتير الإدارة', icon: '📄' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    setUser(getUser());
  }, [router]);

  return (
    <div className="flex h-screen bg-gray-100" dir="rtl">
      {/* Sidebar */}
      <aside className="w-56 bg-blue-900 text-white flex flex-col">
        <div className="p-4 border-b border-blue-800">
          <h1 className="font-bold text-lg">UME Holding</h1>
          <p className="text-blue-300 text-xs mt-1">PMS</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-blue-800">
          <p className="text-blue-300 text-xs mb-2">{user?.full_name}</p>
          <button
            onClick={logout}
            className="w-full text-right text-sm text-blue-300 hover:text-white"
          >
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
