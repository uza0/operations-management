// Focused financial regression check. Uses synthetic data in memory, never .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@libsql/client');
const { drizzle } = require('drizzle-orm/libsql');
const { eq } = require('drizzle-orm');
const root = path.join(__dirname, '..');
const client = createClient({ url: 'file::memory:' });
let database;
let exportedRows;
const load = Module._load;
Module._load = function (id, ...args) {
  if (id === 'server-only') return {};
  if (id === '@/db') return { db: database };
  if (id === '@/lib/i18n/server') return { getT: async () => ({ locale: 'en', t: require('../src/lib/i18n/en.ts').en }) };
  if (id === '@/server/auth/rbac') return { requireRole: async () => ({ role: 'ADMIN' }) };
  if (id === '@/server/services/xlsx') return { buildXlsx: sheet => { exportedRows = sheet.rows; return Buffer.from('test-workbook'); } };
  if (id.startsWith('@/')) id = path.join(root, 'src', id.slice(2));
  return load.call(this, id, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const schema = require('../src/db/schema.ts');
database = drizzle(client, { schema });
const { memberLedger, payrollLedger, owedForLine } = require('../src/server/services/credit.ts');
const { collect } = require('../src/server/services/payment-file.ts');
const { SCHEMA_STATEMENTS } = require('../src/db/schema-sql.ts');

async function main() {
  for (const sql of SCHEMA_STATEMENTS) await client.execute(sql);
  await database.insert(schema.venues).values({ id: 'venue', name: 'Test venue' });
  await database.insert(schema.teamMembers).values([
    { id: 'worker', fullName: 'Test Worker', employeeCode: 'TEST-1', cardNumber: 'TEST-1', defaultPay: 45000 },
    { id: 'chairs-only', fullName: 'Chair Worker', employeeCode: 'TEST-2', cardNumber: 'TEST-2' },
    { id: 'monthly', fullName: 'Monthly Worker', employeeCode: 'TEST-3', salaried: true },
    { id: 'no-work', fullName: 'No Work', employeeCode: 'TEST-4' },
  ]);
  const event = { id: 'postponed', name: 'Postponed concert', type: 'CONCERT', venueId: 'venue', date: '2026-12-20', startTime: '20:00', teamArrivalTime: '17:00', externalId: 'TEST', seatPayDetachedAt: new Date(), status: 'PLANNING', payDefault: 35000 };
  await database.insert(schema.events).values([event, { ...event, id: 'draft', status: 'DRAFT', seatPayDetachedAt: null }]);
  await database.insert(schema.eventMembers).values([
    { id: 'membership', eventId: 'postponed', teamMemberId: 'worker', token: 'test-worker', payAmount: 45000 },
    { id: 'chair-membership', eventId: 'postponed', teamMemberId: 'chairs-only', token: 'test-chair', chairSetupOnly: true },
    { id: 'monthly-membership', eventId: 'postponed', teamMemberId: 'monthly', token: 'test-monthly' },
    { id: 'no-work-membership', eventId: 'postponed', teamMemberId: 'no-work', token: 'test-no-work' },
    { id: 'draft-membership', eventId: 'draft', teamMemberId: 'worker', token: 'test-draft' },
  ]);
  await database.insert(schema.seatSetupDetails).values([
    { id: 'day1', eventId: 'postponed', date: '2026-11-01', startTime: '12:00', payAmount: 35000 },
    { id: 'day2', eventId: 'postponed', date: '2026-11-03', startTime: '12:00', payAmount: 35000 },
    { id: 'future', eventId: 'postponed', date: '2026-12-18', startTime: '12:00', payAmount: 30000 },
  ]);
  const shift = (id, membership, detail, attended) => ({ id, eventId: 'postponed', eventMemberId: membership, detailId: detail, attended });
  await database.insert(schema.seatSetupMembers).values([
    shift('shift1', 'membership', 'day1', true),
    shift('shift2', 'membership', 'day2', true),
    shift('future-shift', 'membership', 'future', false),
    shift('chair-shift', 'chair-membership', 'day1', true),
    shift('monthly-shift', 'monthly-membership', 'day1', true),
    shift('no-work-shift', 'no-work-membership', 'day1', false),
  ]);
  let ledger = await memberLedger('worker');
  assert.equal(ledger.totalAmount, 70000, 'detached approved chairs are owed during planning');
  assert.equal(ledger.pendingAmount, 0, 'hidden concert must not acquire a pending event fee');
  assert.equal(ledger.lines.length, 1, 'ordinary drafts remain hidden');
  assert.equal(ledger.lines[0].amount, 0);
  assert.equal(owedForLine(ledger.lines[0]), 70000);
  assert.equal((await memberLedger('worker', { from: '2026-11-01', to: '2026-11-01' })).totalAmount, 35000, 'range follows chair dates rather than the postponed concert date');
  assert.equal((await memberLedger('worker', { from: '2026-11-02', to: '2026-11-02' })).lines.length, 0);
  assert.equal((await memberLedger('chairs-only')).totalAmount, 35000, 'approved detached work remains visible without a notification');
  assert.equal((await memberLedger('chairs-only')).pendingAmount, 0);
  assert.equal((await memberLedger('monthly')).totalAmount, 0);
  assert.equal((await memberLedger('no-work')).lines.length, 0);
  let payroll = await payrollLedger();
  const bundle = await collect({ from: '2026-11-01', to: '2026-11-30' });
  assert.equal(payroll.reduce((sum, row) => sum + row.totalAmount, 0), bundle.feesTotal, 'ledger and payment file agree');
  assert.equal(bundle.feesTotal, 105000);
  const { GET } = require('../src/app/api/credits/export/route.ts');
  assert.equal((await GET(new Request('https://test.invalid/api/credits/export?from=2026-11-01&to=2026-11-30'))).status, 200);
  const workerExport = exportedRows.filter(row => row[0] === 'Test Worker');
  assert.equal(workerExport.length, 2, 'export includes a detached-chair row and its total');
  assert.equal(workerExport[0][9], 70000);
  assert.equal(workerExport[1][9], 70000);
  await database.insert(schema.payouts).values({ id: 'paid', fromDate: '2026-11-01', toDate: '2026-11-30', totalAmount: 45000, createdByName: 'Test' });
  await database.update(schema.eventMembers).set({ payoutId: 'paid' }).where(eq(schema.eventMembers.id, 'membership'));
  await database.update(schema.seatSetupMembers).set({ payoutId: 'paid' }).where(eq(schema.seatSetupMembers.id, 'shift1'));
  ledger = await memberLedger('worker');
  assert.equal(ledger.totalAmount, 35000, 'event payment does not hide remaining chair wages');
  assert.equal(ledger.paidAmount, 35000);
  assert.equal(owedForLine(ledger.lines[0]), 35000);
  await database.update(schema.events).set({ status: 'READY' }).where(eq(schema.events.id, 'postponed'));
  await database.update(schema.eventMembers).set({ payoutId: null }).where(eq(schema.eventMembers.id, 'membership'));
  ledger = await memberLedger('worker');
  assert.equal(ledger.totalAmount, 35000);
  assert.equal(ledger.pendingAmount, 45000, 'ready concert fee remains pending, outside released chair wages');
  assert.equal(owedForLine(ledger.lines[0]), 35000);
  await database.update(schema.seatSetupMembers).set({ payoutId: 'paid' }).where(eq(schema.seatSetupMembers.id, 'shift2'));
  assert.equal((await memberLedger('worker')).totalAmount, 0, 'paid chairs cannot be owed twice');
  console.log('PASS: detached planning-event chairs; date ranges; monthly exclusion; chair-only work; draft privacy; payment-file parity; independent payment stamps; no premature concert fee; no duplicate chair wages.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => client.close());
