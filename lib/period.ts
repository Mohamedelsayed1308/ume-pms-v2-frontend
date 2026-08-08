// محدّد الفترة العام للوحة — يحوّل المفتاح لمدى تواريخ [from, to] شامل

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface Range { from: Date; to: Date }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function getRange(key: PeriodKey, customFrom?: string, customTo?: string): Range {
  const now = new Date();
  switch (key) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': {
      const day = now.getDay(); // 0=Sun … 6=Sat
      const from = startOfDay(now); from.setDate(now.getDate() - day);
      return { from, to: endOfDay(now) };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: endOfDay(now) };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case 'custom':
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : new Date(now.getFullYear(), now.getMonth(), 1),
        to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now),
      };
    case 'month':
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
}

// الفترة السابقة المكافئة (نفس الطول، مباشرة قبل from)
export function prevRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  const to = new Date(r.from.getTime() - 1);
  const from = new Date(to.getTime() - len);
  return { from, to };
}

export function inRange(dateStr: any, r: Range): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (!isFinite(t)) return false;
  return t >= r.from.getTime() && t <= r.to.getTime();
}

export const PERIOD_KEYS: PeriodKey[] = ['today', 'week', 'month', 'quarter', 'year', 'custom'];
