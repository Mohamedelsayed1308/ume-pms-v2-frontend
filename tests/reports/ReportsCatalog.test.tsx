import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ReportsCatalog from '@/app/dashboard/reports/ReportsCatalog';
import { REPORT_REQUIRES, type CatKey, type ReportId } from '@/app/dashboard/reports/catalog';

function Harness({ screens, onOpen = () => {} }: { screens: string[] | null; onOpen?: (id: ReportId) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CatKey | 'all'>('all');
  const [favs, setFavs] = useState<ReportId[]>([]);
  const [open, setOpen] = useState(false);
  const can = (id: ReportId) => screens === null || screens.includes(REPORT_REQUIRES[id]);
  if (open) return <button onClick={() => setOpen(false)}>back</button>;
  return (
    <ReportsCatalog locale="ar" can={can} q={q} onQ={setQ} cat={cat} onCat={setCat} favs={favs} recents={[]}
      onOpen={(id) => { onOpen(id); setOpen(true); }}
      onTogglePin={(id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))} />
  );
}

describe('١٤ · الدليل', () => {
  it('البحث بالعربيّة بتشكيلٍ وبلا همزات، ويُعاد البحث والفئة عند الرجوع', () => {
    const onOpen = vi.fn();
    render(<Harness screens={null} onOpen={onOpen} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'مُستحقّات' } });
    expect(screen.getByRole('heading', { name: 'مستحقات مورد' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'أسعار الصرف' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /افتح التقرير/ })[0]);
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByText('back'));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('مُستحقّات');
  });
  it('الصلاحية تُخفي ما لا تسمح به الشاشات، وعدّاد الفئة عددُ تقارير لا أرقام بيانات', () => {
    render(<Harness screens={['/dashboard/suppliers']} />);
    expect(screen.getAllByRole('article').length).toBe(2);
    expect(screen.getByRole('button', { name: /الكل/ }).textContent).toContain('2');
  });
  it('بلا أيّ صلاحية: رسالة «لا تتوفر تقارير لصلاحياتك»', () => {
    render(<Harness screens={[]} />);
    expect(screen.getByText('لا تتوفر تقارير لصلاحياتك')).toBeTruthy();
  });
  it('التثبيت زرٌّ بحالةٍ معلنة، والمثبّت يظهر في «المفضلة»', () => {
    render(<Harness screens={null} />);
    const star = screen.getByRole('button', { name: 'تثبيت في المفضلة: كشف حساب مورد' });
    expect(star.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(star);
    expect(screen.getByRole('region', { name: 'المفضلة' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'إزالة من المفضلة: كشف حساب مورد' })[0].getAttribute('aria-pressed')).toBe('true');
  });
  it('بحثٌ بلا نتيجة: رسالةٌ وزرّ مسح', () => {
    render(<Harness screens={null} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث والفئة' }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
});
