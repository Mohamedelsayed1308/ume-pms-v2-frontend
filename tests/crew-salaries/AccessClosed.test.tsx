import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * مفتاح تفعيل المرتّبات مغلق (أو لم تُمنح الشاشة صراحةً): الخادم يرفض بـ 403 وسببه يظهر كما هو،
 * ولا يظهر الرفع ولا قائمة الدورات.
 */
const get = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: vi.fn(), put: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/dashboard/fleet-crew-salaries' }));
import Page from '@/app/dashboard/fleet-crew-salaries/page';
import { ToastProvider } from '@/components/ui';

describe('المرتّبات مغلقة', () => {
  it('سبب الخادم يظهر، ولا رفع ولا قائمة', async () => {
    get.mockRejectedValue({ response: { status: 403, data: { message: 'مرتّبات الأطقم مغلقةٌ بعد — متاحةٌ لصاحب صلاحية الاعتماد وحده حتّى تُفتح' } } });
    render(<ToastProvider><Page /></ToastProvider>);
    expect(await screen.findByText(/مغلقةٌ بعد/)).toBeTruthy();
    expect(screen.getByText('لا تملك صلاحية هذه الشاشة')).toBeTruthy();
    expect(screen.queryByText('استيراد')).toBeNull();
  });
});
