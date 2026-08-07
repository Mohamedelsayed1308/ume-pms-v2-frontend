// أدوات تنسيق مركزية للوحة — تتعامل بأمان مع null/0 وبتفصل العملات (مفيش جمع عبر عملات مختلفة)

export const n0 = (v: any) => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

// رقم صحيح بفواصل آلاف
export function fmtNum(v: any): string {
  return Math.round(n0(v)).toLocaleString('en-US');
}

// مبلغ مالي: فواصل + خانتان عشريتان + رمز العملة
export function fmtMoney(v: any, currency?: string): string {
  const s = n0(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

// مبلغ مختصر (2.3M / 45.6K) + عملة
export function fmtMoneyC(v: any, currency?: string): string {
  const x = n0(v); const a = Math.abs(x); const sign = x < 0 ? '-' : '';
  let s: string;
  if (a >= 1e6) s = `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  else if (a >= 1e4) s = `${sign}${(a / 1e3).toFixed(0)}K`;
  else s = fmtMoney(x);
  return currency ? `${s} ${currency}` : s;
}

// تجميع مبالغ حسب العملة → { USD: 123, EUR: 45 }
export function sumByCurrency<T>(items: T[], amount: (t: T) => number, ccy: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const c = (ccy(it) || 'USD').toUpperCase();
    out[c] = (out[c] || 0) + n0(amount(it));
  }
  return out;
}

// تحويل خريطة العملات لمصفوفة مرتبة (الأكبر أولاً)، مع تجاهل الأصفار
export function ccyEntries(map: Record<string, number>): { ccy: string; value: number }[] {
  return Object.entries(map)
    .filter(([, v]) => Math.abs(n0(v)) > 0.005)
    .map(([ccy, value]) => ({ ccy, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

// نص مختصر لكل العملات: "12,345 USD · 6,789 EUR" (أو "0" لو فاضي)
export function fmtCcyMap(map: Record<string, number>, compact = false): string {
  const e = ccyEntries(map);
  if (!e.length) return '0';
  return e.map(({ ccy, value }) => (compact ? fmtMoneyC(value, ccy) : fmtMoney(value, ccy))).join(' · ');
}

// نسبة التغيّر مقابل فترة سابقة (null لو مفيش أساس موثوق)
export function pctChange(cur: number, prev: number): number | null {
  if (!isFinite(prev) || prev === 0) return null;
  return ((n0(cur) - n0(prev)) / Math.abs(prev)) * 100;
}
