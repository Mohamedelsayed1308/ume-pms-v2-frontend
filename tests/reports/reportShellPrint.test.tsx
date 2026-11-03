import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReportShell from '@/app/dashboard/reports/ReportShell';

/*
 * مستندات الطباعة `position: absolute` بلا أبٍ مُموضَع. إطارٌ `relative` في الطباعة يصير أباها،
 * وهو داخل `main` القابل للتمرير، فيُقصّ التقرير عند ورقةٍ واحدة (بلاغ ٣ نوفمبر ٢٠٢٦ في جوبال).
 */
describe('إطار التقرير في الطباعة', () => {
  it('لا يبقى مُموضَعاً عند الطباعة', () => {
    const { container } = render(
      <ReportShell id="gubal-profit" locale="ar" allowed pinned={false} onBack={() => {}} onTogglePin={() => {}}>
        <div id="gubal-doc" />
      </ReportShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    const cls = root.className.split(/\s+/);
    expect(cls).toContain('print:static');
    for (const p of ['relative', 'absolute', 'fixed', 'sticky']) {
      if (cls.includes(p)) expect(cls).toContain('print:static');
    }
    expect(cls.some((c) => /^print:(relative|absolute|fixed|sticky)$/.test(c))).toBe(false);
  });
});
