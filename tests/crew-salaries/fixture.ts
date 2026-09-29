import type { CycleViewData, Entry } from '@/lib/crewSalaries';

/* بياناتٌ اصطناعيّة لشاشة الدورة — لا بحّارة حقيقيّون. */
export const item = (over: object) => ({ key: 'basic', kind: 'basic', direction: 'earning', amount: '1131.33', currency: 'EUR', original_amount: '1131.33', original_currency: 'EUR', fx_rate: null, contract_amount: '1131.33', source: 'calc', review: 'auto', counted: true, formula: 'الأساسيّ 1697.00 ÷ 30 × 20', ...over });

export const entry = (over: Partial<Entry> & Record<string, unknown> = {}): Entry => ({
  key: '9102:EUR', crew_id: '9102', name: 'Bravo Test', rank: 'M/M', nationality: 'X', currency: 'EUR', contract_currency: 'EUR', payment_currency_exception: false, section: 'final',
  result: {
    currency: 'EUR', days: 20, day_rule: 'partial', service: { start: '2026-08-01', end: '2026-08-20' },
    items: [item({}), item({ key: 'sign_off_day', kind: 'sign_off_day', amount: '79.20', formula: '(الأساسيّ + الإضافيّ الثابت) ÷ 30' }), item({ key: 'email:t2:r1:lashing', kind: 'lashing', amount: '358.00', review: 'pending', counted: false, source: 'email' })] as Entry['result']['items'],
    earnings: '1210.53', deductions: '0.00', balance: '1210.53', complete: false,
    issues: [{ code: 'item_pending_review', blocking: true, message: 'x', itemKey: 'email:t2:r1:lashing' }],
  },
  differences: [{ kind: 'sign_off_day', calculated: '79.20', reported: '93.33', diff: '-14.13' }], source_conflicts: [],
  differences_acknowledged: false, diff_hash: 'a'.repeat(64), payable: false, eligible: false, blockers: [], approval: null, bank: null,
  provenance: [{ file: 'cfm.xlsx', sheet: 'Summary EUR', row: 17 }], date_checks: [], payout_match: null, bank_match: null,
  bank_candidates: [], accounts: [],
  extras: [
    { key: 'email:t2:r1:lashing', kind: 'lashing', amount: '358', currency: 'EUR', reason: 'Bonus', source: 'email', review: 'pending', flags: [] },
    { key: 'payout:r9:bonus', kind: 'bonus', amount: '358', currency: 'EUR', reason: 'Bonus — كشف الصرف', source: 'attachment', review: 'pending', flags: ['currency_inferred', 'possible_duplicate'], duplicate_of: 'email:t2:r1:lashing' },
  ],
  ...over,
}) as Entry;

export const ready = entry({
  key: '9201:USD', crew_id: '9201', name: 'Delta Test', currency: 'USD', contract_currency: 'USD', differences: [], differences_acknowledged: true, extras: [], eligible: true,
  result: { currency: 'USD', days: 30, day_rule: 'full_month', service: { start: '2026-08-01', end: '2026-08-31' }, items: [item({ currency: 'USD', original_currency: 'USD', amount: '1000.00' })] as Entry['result']['items'], earnings: '1000.00', deductions: '0.00', balance: '1000.00', complete: true, issues: [] },
});

export const view = (over: Partial<CycleViewData> = {}): CycleViewData => ({
  cycle: { id: 'c1', vessel: 'Test Vessel', month: '2026-08', status: 'draft', current_version: 0, approved_version_id: null },
  permissions: { approver_configured: false, can_approve: false, can_edit_fx: false },
  blocking: [], warnings: [],
  fx: { month: '2026-08', per_usd: {}, labels: [] },
  files: [
    { id: 'f1', parent_id: null, position: null, name: 'salary.msg', kind: 'email', class: 'email', status: 'extracted', flags: [], meta: { subject: 'Salary of Aug. 2026', from: 'crew@x', sent_at: '2026-08-24T16:16:13Z', inference: { vessel: 'Test Vessel', month: '2026-08', evidence: ['m'], conflicts: [] } }, size: 10 },
    { id: 'f2', parent_id: 'f1', position: 1, name: 'receipt.jpeg', kind: 'attachment', class: 'image', status: 'needs_manual', flags: ['image_manual_entry'], meta: {}, size: 5 },
  ],
  entries: [entry(), ready],
  unresolved: [{ key: 'email:note:p9', kind: 'note', detail: 'Kindly deposit 47.73€ (Lashing Bonus) in bank account of Master', amounts: [{ column: 'note', amount: '47.73', currency: 'EUR' }], source: { paragraph: 9 }, resolution: null }],
  unmatched: { payout: [], bank_blocks: [], lashing_pdf: [] },
  authorizations: [],
  totals: {
    EUR: { count: 1, matched: 0, different: 1, ready: 0, pending: 1, eligible: 0, approved: 0, missing_account: 1, missing_docs: 0, earnings: '1210.53', deductions: '0.00', balance: '1210.53' },
    USD: { count: 1, matched: 1, different: 0, ready: 0, pending: 1, eligible: 1, approved: 0, missing_account: 1, missing_docs: 0, earnings: '1000.00', deductions: '0.00', balance: '1000.00' },
  },
  complete: false,
  approved_version: null, changed_since_approval: false, versions: [], exports: [], audit: [],
  ...over,
});
