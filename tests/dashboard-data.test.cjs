const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.join(__dirname, '../components/dashboard/demo-data.ts');
const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const fixture = new Module(file);
fixture._compile(compiled, file);
const { selectDashboard, percentage } = fixture.exports;

for (const period of ['month', 'quarter', 'year']) {
  test(period + ': route totals reconcile with all routes', () => {
    const all = selectDashboard(period, 'all');
    const a = selectDashboard(period, 'safaga'), b = selectDashboard(period, 'jeddah');
    for (const key of ['profit', 'revenue', 'expenses', 'trips']) assert.equal(all.totals[key], a.totals[key] + b.totals[key]);
  });
  for (const route of ['all', 'safaga', 'jeddah']) {
    test(period + '/' + route + ': charts, fleet, KPIs and ledger share scope', () => {
      const d = selectDashboard(period, route);
      assert.equal(d.totals.revenue - d.totals.expenses, d.totals.profit);
      assert.equal(d.fleet.reduce((n, v) => n + v.profit, 0), d.totals.profit);
      assert.equal(d.trend.filter(m => d.range.includes(m.month)).reduce((n, m) => n + m.profit, 0), d.totals.profit);
      assert.ok(d.entries.every(e => d.range.includes(e.month) && (route === 'all' || e.route === route)));
    });
  }
}
test('quarterly trips are allocated without rounding extra voyages', () => {
  assert.equal(selectDashboard('quarter', 'all').totals.trips, 160);
});
test('inactive vessel never displays an infinite percentage', () => {
  assert.equal(percentage(0, 0), null);
  assert.equal(selectDashboard('quarter', 'all').fleet.find(v => v.id === 'dalila').trips, 0);
});
test('year comparison uses matching months in the previous year', () => {
  const d = selectDashboard('year', 'all');
  assert.ok(d.previous.profit > 0 && d.previous.profit < d.totals.profit);
  assert.equal(d.range.length, 9);
});
