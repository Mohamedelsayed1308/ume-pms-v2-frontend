/** Deterministic review fixtures. Never used for API writes or permissions. */
export type Period = 'month' | 'quarter' | 'year';
export type Route = 'all' | 'safaga' | 'jeddah';
export const periods: Record<Period, string> = { month: 'هذا الشهر', quarter: 'آخر ٣ أشهر', year: 'منذ بداية السنة' };
export const routes: Record<Route, string> = { all: 'كل الخطوط', safaga: 'ضبا ↔ سفاجا', jeddah: 'جدة ↔ سواكن' };
export const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'];
export const vessels = [
  { id: 'alcudia', name: 'Alcudia Express', route: 'safaga', profit: 931250, trips: 50, change: 23.2 },
  { id: 'gubal', name: 'Gubal Trader', route: 'jeddah', profit: 741608, trips: 34, change: -1 },
  { id: 'poseidon', name: 'Poseidon Express', route: 'safaga', profit: 715352, trips: 44, change: 6.5 },
  { id: 'wasa', name: 'Wasa Express', route: 'jeddah', profit: 650912, trips: 32, change: 5.8 },
  { id: 'dalila', name: 'Dalila', route: 'safaga', profit: 0, trips: 0, change: 0 },
] as const;
export const suppliers = ['Red Sea Marine Services', 'Suez Bunkering Co.', 'Gulf Marine Supply', 'Port Services Ltd.'];
const weights = [.3, .33, .37];
export const records = [2025, 2026].flatMap(year => Array.from({ length: 12 }, (_, month) => vessels.map((v, i) => {
  const quarter = Math.floor(month / 3);
  const factor = (year === 2025 ? .78 : 1) * (quarter === 2 ? 1 : quarter === 1 ? 1 / (1 + v.change / 100) : .82);
  const profit = Math.round(v.profit * weights[month % 3] * factor);
  const expenses = Math.round(profit * (1.6 + i * .12));
  const tripTotal = Math.round(v.trips * (year === 2025 ? .8 : 1));
  const trips = month % 3 === 2 ? tripTotal - Math.round(tripTotal * weights[0]) - Math.round(tripTotal * weights[1]) : Math.round(tripTotal * weights[month % 3]);
  return { year, month, vessel: v.id, route: v.route, profit, expenses, revenue: profit + expenses, trips };
}))).flat();
export type LedgerItem = { id: string; month: number; route: Exclude<Route, 'all'>; supplier: string; amount: number; days: number; side: 'payable' | 'receivable'; kind: 'invoice' | 'payment'; approval: boolean; task: boolean };
export const ledger: LedgerItem[] = Array.from({ length: 9 }, (_, month) => Array.from({ length: 12 }, (_, i) => ({
  id: `DEMO-${month + 1}-${i + 1}`, month, route: i % 2 ? 'jeddah' as const : 'safaga' as const,
  supplier: suppliers[i % 4], amount: 9500 + i * 3200 + month * 740,
  days: [-4, 0, 15, 42, 76, 103][i % 6], side: i > 5 ? 'receivable' as const : 'payable' as const,
  kind: i === 10 ? 'payment' as const : 'invoice' as const, approval: i === 2, task: i === 3,
}))).flat();
export function monthRange(period: Period) { return period === 'month' ? [8] : period === 'quarter' ? [6, 7, 8] : [0, 1, 2, 3, 4, 5, 6, 7, 8]; }
export function selectDashboard(period: Period, route: Route) {
  const range = monthRange(period);
  const matchesRoute = (r: { route: string }) => route === 'all' || r.route === route;
  const current = records.filter(r => r.year === 2026 && range.includes(r.month) && matchesRoute(r));
  const previous = records.filter(r => matchesRoute(r) && (period === 'year' ? r.year === 2025 && range.includes(r.month) : r.year === 2026 && range.map(m => m - range.length).includes(r.month)));
  const total = (rows: typeof records) => rows.reduce((a, r) => ({ profit: a.profit + r.profit, revenue: a.revenue + r.revenue, expenses: a.expenses + r.expenses, trips: a.trips + r.trips }), { profit: 0, revenue: 0, expenses: 0, trips: 0 });
  const totals = total(current);
  const fleet = vessels.filter(matchesRoute).map(v => ({ ...v, ...total(current.filter(r => r.vessel === v.id)), previous: total(previous.filter(r => r.vessel === v.id)).profit })).sort((a, b) => b.profit - a.profit);
  const entries = ledger.filter(r => range.includes(r.month) && matchesRoute(r));
  return { current, previous: total(previous), totals, fleet, entries, range,
    trend: months.map((label, month) => ({ label, month, ...total(records.filter(r => r.year === 2026 && r.month === month && matchesRoute(r))), parts: vessels.filter(matchesRoute).map(v => ({ id: v.id, profit: records.find(r => r.year === 2026 && r.month === month && r.vessel === v.id)?.profit || 0 })) })),
    vendors: suppliers.map(name => ({ name, amount: entries.filter(e => e.supplier === name && e.side === 'payable').reduce((sum, e) => sum + e.amount, 0) })).sort((a, b) => b.amount - a.amount),
  };
}
export function percentage(value: number, previous: number) { return previous ? (value - previous) / previous * 100 : null; }
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const compactMoney = (n: number) => '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'K' : n);
