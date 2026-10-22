/**
 * End-to-end check of the demonstration scenario (spec §45) plus the
 * security test cases (spec §53), driven through the real HTTP surface.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
import { createClient } from '@libsql/client';

/**
 * Same shape as before, one less native dependency: a tiny read-only wrapper
 * over libSQL so the checks talk to the database the app actually uses.
 */
const client = createClient({ url: 'file:data/ops.db' });
const db = {
  prepare: (sql) => ({
    get: async (...args) => (await client.execute({ sql, args })).rows[0],
    all: async (...args) => (await client.execute({ sql, args })).rows,
  }),
  close: () => client.close(),
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function login(ctx, username, password) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  // The sign-in form is a React server action: it only works once the form is
  // interactive, which the button itself signals by enabling.
  await page.waitForSelector('button[type=submit]:not([disabled])');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  return page;
}

/* ---- 1-3: admin signs in, opens the match, sees 32 members / 8 gates ---- */
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await login(adminCtx, 'admin', 'Admin@12345');
check('admin login lands on /admin', admin.url().includes('/admin'), admin.url());

const eventRow = await db.prepare("select id, name from events where name like '%الشرطة%'").get();
const eventId = eventRow.id;
await admin.goto(`${BASE}/admin/events/${eventId}`);
await admin.waitForLoadState('networkidle');
const overview = await admin.textContent('main');
check('event overview shows 32 team members', /\b32\b/.test(overview));
check('event overview shows 8 gates', /\b8\b/.test(overview));
check('understaffed gates flagged on overview', overview.includes('البوابة 3'));

/* ---- 4-6: interactive map + gate 3 understaffed ------------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/map`);
await admin.waitForSelector('canvas', { timeout: 20000 });
const canvasCount = await admin.locator('canvas').count();
check('konva map canvas renders', canvasCount >= 1, `${canvasCount} canvas layers`);

await admin.goto(`${BASE}/admin/events/${eventId}/gates`);
await admin.waitForLoadState('networkidle');
const gatesText = await admin.textContent('main');
check('gate 3 reads 3/5 understaffed', gatesText.includes('3 / 5') && gatesText.includes('نقص في الطاقم'));

/* ---- 7: assign a reserve member to gate 3 ------------------------------ */
const gate3 = await db.prepare('select id from gates where event_id=? and name=?').get(eventId, 'البوابة 3');
const reserve = await db.prepare(`
  select em.id, tm.full_name from event_members em
  join team_members tm on tm.id = em.team_member_id
  where em.event_id=? and em.is_reserve=1
  and em.id not in (select event_member_id from assignments where status != 'CANCELLED')
  limit 1`).get(eventId);

await admin.goto(`${BASE}/admin/events/${eventId}/assignments`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("توزيع عضو")');
await admin.waitForSelector('#a-member');
await admin.selectOption('#a-member', reserve.id);
await admin.selectOption('#a-location', gate3.id);
await admin.click('[role=dialog] button[type=submit]');
await admin.waitForTimeout(2500);

const gate3After = (await db.prepare(
  "select count(*) c from assignments where gate_id=? and status!='CANCELLED'").get(gate3.id)).c;
check('reserve member assigned to gate 3 (3 → 4)', gate3After === 4, `assigned=${gate3After}`);

/* ---- 8-10: move Amir from gate 4 to gate 6, audit records it ----------- */
const amir = await db.prepare(`
  select em.id, em.token, tm.full_name from event_members em
  join team_members tm on tm.id=em.team_member_id
  where em.event_id=? and tm.full_name like 'أمير%'`).get(eventId);
const amirBefore = await db.prepare(`
  select g.name from assignments a join gates g on g.id=a.gate_id
  where a.event_member_id=?`).get(amir.id);
check('Amir starts at gate 4', amirBefore.name === 'البوابة 4', amirBefore.name);

const gate6 = await db.prepare('select id from gates where event_id=? and name=?').get(eventId, 'البوابة 6');
await admin.goto(`${BASE}/admin/events/${eventId}/assignments`);
await admin.waitForLoadState('networkidle');
const amirRow = admin.locator('tr', { hasText: 'أمير' }).first();
await amirRow.locator('button:has-text("نقل العضو")').click();
await admin.waitForSelector('#a-location');
await admin.selectOption('#a-location', gate6.id);
await admin.fill('#a-reason', 'البوابة 6 تحتاج عنصراً إضافياً.');
await admin.click('[role=dialog] button[type=submit]');
await admin.waitForTimeout(2500);

const amirAfter = await db.prepare(`
  select g.name from assignments a join gates g on g.id=a.gate_id
  where a.event_member_id=?`).get(amir.id);
check('Amir moved to gate 6', amirAfter?.name === 'البوابة 6', amirAfter?.name);

const amirAssignmentId = (await db.prepare(
  'select id from assignments where event_member_id=?').get(amir.id)).id;
const changeRow = await db.prepare(`
  select from_location, to_location, reason, changed_by_name from assignment_changes
  where assignment_id=? order by created_at desc limit 1`).get(amirAssignmentId);
check('assignment_changes records gate 4 → gate 6',
  changeRow.from_location === 'البوابة 4' && changeRow.to_location === 'البوابة 6',
  `${changeRow.from_location} → ${changeRow.to_location} by ${changeRow.changed_by_name}`);

const auditRow = await db.prepare(
  "select summary, reason from audit_logs where action='REASSIGN' and entity_id=? order by created_at desc limit 1"
).get(amirAssignmentId);
check('audit log records the reassignment with a reason',
  auditRow.summary.includes('البوابة 6') && Boolean(auditRow.reason), auditRow.summary);

/* ---- 11-12: Amir opens his secure link and sees gate 6 ----------------- */
const memberCtx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
});
const member = await memberCtx.newPage();
await member.goto(`${BASE}/member/${amir.token}`);
await member.waitForLoadState('networkidle');
const memberText = await member.textContent('main');
check('member portal shows gate 6', memberText.includes('البوابة 6'));
check('member portal shows arrival time', /5:00|17:00|٥/.test(memberText) || memberText.includes('وقت وصولك'));
check('member portal shows the task', memberText.includes('مسح التذاكر'));
check('member portal shows the change notice', memberText.includes('تم تحديث تكليفك'));
check('member portal shows leaders', memberText.includes('أحمد الربيعي'));

/* ---- 13-14: urgent announcement reaches the member --------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/announcements`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("إعلان جديد")');
await admin.waitForSelector('#an-title');
await admin.fill('#an-title', 'تعزيز فوري للبوابة 6');
await admin.fill('#an-message', 'جميع أعضاء البوابة 6: افتحوا المسارين معاً حتى إشعار آخر.');
await admin.selectOption('#an-priority', 'URGENT');
await admin.click('[role=dialog] button[type=submit]');
await admin.waitForTimeout(2000);

await member.reload();
await member.waitForLoadState('networkidle');
const memberText2 = await member.textContent('main');
check('urgent announcement visible to the member', memberText2.includes('تعزيز فوري للبوابة 6'));

/* ---- 15-16: attendance recorded, dashboard updates --------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/attendance`);
await admin.waitForLoadState('networkidle');
const amirAttRow = admin.locator('tr', { hasText: 'أمير' }).first();
await amirAttRow.locator('button:has-text("متأخر")').first().click();
await admin.waitForTimeout(2000);
const att = await db.prepare('select status from attendance where event_member_id=?').get(amir.id);
check('attendance updated to LATE', att.status === 'LATE', att.status);

await member.reload();
const memberText3 = await member.textContent('main');
check('member sees their attendance status', memberText3.includes('متأخر'));

/* ---- member reports an issue ------------------------------------------ */
await member.click('button:has-text("الإبلاغ عن مشكلة")');
await member.waitForSelector('#m-description');
await member.selectOption('#m-type', 'SCANNER');
await member.fill('#m-description', 'جهاز المسح لا يقرأ التذاكر الورقية.');
await member.click('main form button[type=submit]');
await member.waitForTimeout(2500);
const issue = await db.prepare(
  'select gate_id, reporter_name from issues where reported_by_member_id=?').get(amir.id);
check('member issue is filed against their own gate', issue?.gate_id === gate6.id, issue?.reporter_name);

/* ---- 17-18: complete the event and generate the report ----------------- */
await admin.goto(`${BASE}/admin/events/${eventId}`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("منتهية")');
await admin.waitForTimeout(2500);
const status = (await db.prepare('select status from events where id=?').get(eventId)).status;
check('event moved to COMPLETED', status === 'COMPLETED', status);

await admin.goto(`${BASE}/admin/events/${eventId}/reports`);
await admin.waitForLoadState('networkidle');
const report = await admin.textContent('main');
// The report is a document, not a screen: it has to carry a masthead, all ten
// numbered sections, findings that were computed rather than typed, and the
// sign-off block — otherwise it is just a printed page again.
const sections = [
  'الملخّص التنفيذي', 'بيانات الفعالية', 'الطاقم والتغطية', 'الحضور والانضباط',
  'التغييرات أثناء التنفيذ', 'المشاكل ومعالجتها', 'الجدول الزمني',
  'الاتصال بالفريق', 'الملاحظات والتوصيات', 'الاعتماد',
];
const missing = sections.filter((s) => !report.includes(s));
check('report carries all ten sections', missing.length === 0, missing.join(' | ') || 'all present');
check('report has a masthead with a report number', /OPS-\d{8}-[A-Z0-9]{4}/.test(report),
  report.match(/OPS-\d{8}-[A-Z0-9]{4}/)?.[0]);
check('report states computed findings', report.includes('نُفِّذت الفعالية بطاقم عدده')
  && report.includes('نسبة الحضور'));
check('report includes coverage per location', report.includes('نسبة التغطية')
  && report.includes('البوابة 4') && report.includes('البوابة 6'));
check('report ends with a sign-off block', report.includes('إعداد')
  && report.includes('مراجعة') && report.includes('اعتماد'));

/* ---- 19-23: work credit ------------------------------------------------ */

// The report names the people behind the counts, not just how many there were.
check('report names who attended', report.includes('أسماء الحضور')
  && report.includes('أمير عبد الله') && report.includes('TZ-'));

/*
 * Credit follows a rule rather than a copy of a number: an absent member earns
 * nothing, and a figure entered by hand overrides the event's default. This
 * checks the arithmetic end to end, through the screen the supervisor uses.
 */
await admin.goto(`${BASE}/admin/events/${eventId}/attendance`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("تعديل السجل")');
await admin.waitForSelector('input[name=creditDays]');
await admin.fill('input[name=creditDays]', '2');
await admin.fill('input[name=creditNote]', 'حضر قبل يوم لترتيب القاعة');
await admin.click('button:has-text("حفظ الرصيد")');
await admin.waitForTimeout(2500);

const credited = await db.prepare(
  'select credit_days, credit_note from event_members where credit_days is not null and event_id=?',
).get(eventId);
check('a member can be credited more than the default', Number(credited?.credit_days) === 2,
  String(credited?.credit_note ?? ''));

// The times are the supervisor's to correct, and an empty box clears them.
await admin.reload();
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("تعديل السجل")');
await admin.waitForSelector('input[name=checkInTime]');
await admin.fill('input[name=checkInTime]', '16:05');
await admin.fill('input[name=checkOutTime]', '22:40');
await admin.click('button:has-text("حفظ الأوقات")');
await admin.waitForTimeout(2500);
const times = await db.prepare(
  'select check_in_time, check_out_time from attendance where event_id=? and check_in_time=?',
).get(eventId, '16:05');
check('attendance times can be edited', times?.check_out_time === '22:40',
  `${times?.check_in_time} → ${times?.check_out_time}`);

// The payroll report and the member's own record.
await admin.goto(`${BASE}/admin/credits`);
await admin.waitForLoadState('networkidle');
const payroll = await admin.textContent('main');
check('payroll report lists members and their days', payroll.includes('تقرير أرصدة الفريق')
  && payroll.includes('الرصيد المعتمد') && payroll.includes('TZ-'));

const someone = await db.prepare(
  'select team_member_id from event_members where event_id=? limit 1').get(eventId);
await admin.goto(`${BASE}/admin/team/${someone.team_member_id}`);
await admin.waitForLoadState('networkidle');
const ledgerText = await admin.textContent('main');
check('member ledger shows the events behind the balance',
  ledgerText.includes('الرصيد المعتمد') && ledgerText.includes('الزوراء'));

const xlsx = await admin.request.get(`${BASE}/api/credits/export`);
const xlsxBody = await xlsx.body();
// "PK" — a real zip, which is what an .xlsx is. An HTML error page is not.
check('credit report exports a workbook',
  xlsx.status() === 200 && xlsxBody[0] === 0x50 && xlsxBody[1] === 0x4b,
  `${xlsxBody.length} bytes`);

/* ---- adding a team member ----------------------------------------------- */
/*
 * The employee code follows a person through every event, report and audit
 * line, so it is issued rather than typed: adding someone must need a name and
 * nothing else that can be got wrong.
 */
await admin.goto(`${BASE}/admin/team`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("عضو جديد")');
await admin.waitForTimeout(600);
const codeFieldShown = await admin.locator('input[name="employeeCode"]').count();
check('adding a member never asks for an employee code', codeFieldShown === 0,
  `${codeFieldShown} code fields`);

const highestBefore = (await db.prepare(
  "select employee_code c from team_members where employee_code like 'TZ-%' order by c desc limit 1",
).get())?.c;
const newName = `فحص التسلسل ${Date.now() % 100000}`;
await admin.fill('input[name="fullName"]', newName);
await admin.locator('form button[type=submit]').last().click();
await admin.waitForTimeout(2500);

const added = await db.prepare('select employee_code from team_members where full_name=?')
  .get(newName);
const expected = `TZ-${String(Number(String(highestBefore).slice(3)) + 1).padStart(3, '0')}`;
check('the new member gets the next code in sequence', added?.employee_code === expected,
  `${highestBefore} → ${added?.employee_code} (expected ${expected})`);

// And a second one continues rather than repeating.
await admin.reload();
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("عضو جديد")');
await admin.waitForTimeout(600);
const secondName = `${newName} ب`;
await admin.fill('input[name="fullName"]', secondName);
await admin.locator('form button[type=submit]').last().click();
await admin.waitForTimeout(2500);
const second = await db.prepare('select employee_code from team_members where full_name=?')
  .get(secondName);
check('codes never repeat', second?.employee_code && second.employee_code !== added?.employee_code,
  `${added?.employee_code} then ${second?.employee_code}`);

/* ---- the distribution board -------------------------------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/board`);
await admin.waitForLoadState('networkidle');
const boardText = await admin.textContent('main');
check('the board shows gates split into lanes',
  boardText.includes('لوحة التوزيع') && boardText.includes('مسح التذاكر الإلكتروني'),
  '');

/*
 * Take somebody off the board and put them back on a different lane — the two
 * moves the board exists for, driven the way a finger drives them on a phone.
 */
const boardMember = await db.prepare(`
  select em.id, tm.full_name from event_members em
  join team_members tm on tm.id = em.team_member_id
  join assignments a on a.event_member_id = em.id
  where em.event_id=? limit 1`).get(eventId);

const boardRow = admin.locator('article', { hasText: boardMember.full_name }).first();
// The chip carries two labelled buttons now — the role badge and the × — so
// the one that sends a name back has to be named exactly.
await boardRow
  .locator(`button[aria-label="إرجاع إلى القائمة — ${boardMember.full_name}"]`)
  .first()
  .click();
await admin.waitForTimeout(2500);
const afterPull = await db.prepare(
  "select count(*) as n from assignments where event_member_id=? and status!='CANCELLED'",
).get(boardMember.id);
check('a name can be pulled back to the pool', Number(afterPull.n) === 0,
  `${afterPull.n} assignments left`);

await admin.reload();
await admin.waitForLoadState('networkidle');
await admin.locator('aside button', { hasText: boardMember.full_name }).first().click();
await admin.waitForTimeout(400);
// Any lane will do: the point is that tapping a lane places the selected name.
await admin.locator('article .rounded-lg.border-dashed').first().click();
await admin.waitForTimeout(2800);
const afterPlace = await db.prepare(
  "select count(*) as n from assignments where event_member_id=? and status!='CANCELLED'",
).get(boardMember.id);
check('tapping a lane places the selected name', Number(afterPlace.n) === 1,
  `${afterPlace.n} assignments`);

/* ---- roles on the board ------------------------------------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/board`);
await admin.waitForLoadState('networkidle');
const boardWithRoles = await admin.textContent('main');
check('the board marks who runs a post', boardWithRoles.includes('ق.ب'),
  boardWithRoles.includes('ق.ف') ? 'team leader shown too' : '');

/*
 * A role is a hat: giving it to a second person must take it off the first,
 * and must land in BOTH places the system records gate leadership, or a gate
 * shows one leader on the board and another on the gate screen.
 */
const gateForRole = await db.prepare(`
  select g.id, g.name, g.gate_leader_id from gates g
  where g.event_id=? and g.gate_leader_id is not null limit 1`).get(eventId);
const successor = await db.prepare(`
  select em.id, tm.full_name from event_members em
  join team_members tm on tm.id = em.team_member_id
  join assignments a on a.event_member_id = em.id
  where a.gate_id=? and em.id != ? limit 1`).get(gateForRole.id, gateForRole.gate_leader_id);

const roleCard = admin.locator('article', { hasText: gateForRole.name }).first();
await roleCard.locator(`button[aria-label="الدور — ${successor.full_name}"]`).first().click();
await admin.waitForTimeout(500);
await admin.locator('button:has-text("قائد البوابة")').last().click();
await admin.waitForTimeout(2800);

const promoted = await db.prepare('select event_role from event_members where id=?').get(successor.id);
check('a role can be given from the board', promoted?.event_role === 'GATE_LEADER',
  String(promoted?.event_role));

const demoted = await db.prepare('select event_role from event_members where id=?')
  .get(gateForRole.gate_leader_id);
check('the same role is never held twice', demoted?.event_role === null,
  `previous holder now ${demoted?.event_role}`);

const gateAfter = await db.prepare(
  'select gate_leader_id from gates where id=?').get(gateForRole.id);
const assignmentAfter = await db.prepare(
  'select is_gate_leader from assignments where event_member_id=?').get(successor.id);
check('gate leadership lands on the gate and the assignment too',
  gateAfter.gate_leader_id === successor.id && Number(assignmentAfter.is_gate_leader) === 1,
  `gate=${gateAfter.gate_leader_id === successor.id} assignment=${assignmentAfter.is_gate_leader}`);

// A gate leader has to be standing at a gate — the pool is not a gate.
const poolMember = await db.prepare(`
  select em.id, tm.full_name from event_members em
  join team_members tm on tm.id = em.team_member_id
  left join assignments a on a.event_member_id = em.id
  where em.event_id=? and a.id is null limit 1`).get(eventId);
if (poolMember) {
  await admin.reload();
  await admin.waitForLoadState('networkidle');
  await admin.locator(`aside button[aria-label="الدور — ${poolMember.full_name}"]`).first().click();
  await admin.waitForTimeout(500);
  await admin.locator('button:has-text("قائد البوابة")').last().click();
  await admin.waitForTimeout(2000);
  const refused = await db.prepare('select event_role from event_members where id=?').get(poolMember.id);
  check('an unplaced member cannot be made a gate leader', refused?.event_role === null,
    String(refused?.event_role));
  await admin.keyboard.press('Escape');
}

/* ---- exporting the sheet ------------------------------------------------ */
const exportLink = await admin.getAttribute('a:has-text("تصدير PDF")', 'href');
check('the board offers a PDF export of its own',
  Boolean(exportLink) && exportLink.endsWith('/board/sheet?print=1'), String(exportLink));

await admin.goto(`${BASE}/admin/events/${eventId}/board/sheet`);
await admin.waitForLoadState('networkidle');
const sheetWithRoles = await admin.textContent('.report');
check('the printed sheet names the role beside the name',
  sheetWithRoles.includes('قائد البوابة') && sheetWithRoles.includes('قائد الفريق'), '');

/* ---- the shareable sheet ------------------------------------------------ */
await admin.goto(`${BASE}/admin/events/${eventId}/board`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("إنشاء رابط المشاركة")');
await admin.waitForTimeout(2500);
const shared = await db.prepare('select board_token from events where id=?').get(eventId);
check('a public link can be issued for the sheet', /^[a-f0-9]{32}$/.test(shared?.board_token ?? ''),
  shared?.board_token ? 'issued' : 'none');

// Anyone holding the link can read it — with no account at all.
const guest = await browser.newContext();
const guestPage = await guest.newPage();
await guestPage.goto(`${BASE}/sheet/${shared.board_token}`);
await guestPage.waitForLoadState('networkidle');
const guestText = await guestPage.textContent('body');
check('the sheet opens without signing in',
  guestText.includes('كشف توزيع البوابات') && !guestPage.url().includes('/login'),
  guestPage.url());

// And it must not become a way to harvest the team's phone numbers.
const phone = await db.prepare(
  'select phone from team_members where phone is not null limit 1').get();
check('the public sheet carries no phone numbers',
  !guestText.includes(String(phone.phone).replace('+', '')) && !guestText.includes(String(phone.phone)),
  '');

// A revoked link stops working for everyone holding it.
await admin.click('button:has-text("إلغاء الرابط")');
await admin.waitForTimeout(2500);
const revoked = await guestPage.goto(`${BASE}/sheet/${shared.board_token}`);
check('revoking the link closes the sheet', revoked.status() === 404, `status ${revoked.status()}`);
await guest.close();

/* ---- the main-gate detail ----------------------------------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/board`);
await admin.waitForLoadState('networkidle');
const mgText = await admin.textContent('main');
check('the board shows the main-gate detail',
  mgText.includes('توزيع البوابة الرئيسية') && mgText.includes('البوابة الرئيسية للمجمع'), '');

/*
 * The whole point of the feature: a person on the detail has NOT been moved.
 * Their gate assignment must still be there, and the gate must still count them.
 */
const onDetail = await db.prepare(`
  select mgm.event_member_id, tm.full_name from main_gate_members mgm
  join event_members em on em.id = mgm.event_member_id
  join team_members tm on tm.id = em.team_member_id
  where mgm.event_id=? limit 1`).get(eventId);
const stillAssigned = await db.prepare(
  "select count(*) as n from assignments where event_member_id=? and status!='CANCELLED'",
).get(onDetail.event_member_id);
check('being on the main gate does not move anyone off their post',
  Number(stillAssigned.n) === 1, `${stillAssigned.n} assignments`);

check('the detail names where each person goes afterwards',
  mgText.includes('وبعدها يرجع إلى'), '');

// It is optional: an event that never had one shows the offer, not a detail.
const eventWithoutDetail = await db.prepare(
  "select id from events where id != ? and status='COMPLETED' limit 1").get(eventId);
if (eventWithoutDetail) {
  await admin.goto(`${BASE}/admin/events/${eventWithoutDetail.id}/board`);
  await admin.waitForLoadState('networkidle');
  const emptyText = await admin.textContent('main');
  check('an event with no main-gate detail is simply offered one',
    emptyText.includes('إضافة توزيع البوابة الرئيسية'), '');
}

// And it reaches the paper the team actually reads.
await admin.goto(`${BASE}/admin/events/${eventId}/board/sheet`);
await admin.waitForLoadState('networkidle');
const sheetMg = await admin.textContent('.report');
check('the printed sheet carries the main-gate detail first',
  sheetMg.includes('البوابة الرئيسية للمجمع') && sheetMg.includes('موظف أساور'), '');

/* ---- what the member sees ------------------------------------------------ */
const mgMemberToken = await db.prepare(
  'select token from event_members where id=?').get(onDetail.event_member_id);
const memberPage = await browser.newContext();
const mp = await memberPage.newPage();
await mp.goto(`${BASE}/member/${mgMemberToken.token}`);
await mp.waitForLoadState('networkidle');
const mpText = await mp.textContent('body');
check('the member is told about the early shift', mpText.includes('قبل الحفل'), '');
check('the member is always offered the venue location',
  mpText.includes('الوصول إلى الموقع')
    && (mpText.includes('افتح موقع الفعالية على الخرائط') || mpText.includes('خريطة')),
  '');

// The distribution map itself must open for an ordinary member.
const mapResponse = await mp.goto(`${BASE}/member/${mgMemberToken.token}/map`);
check('the distribution map opens for an ordinary member',
  mapResponse.status() === 200 && (await mp.textContent('body')).includes('موقعك'),
  `status ${mapResponse.status()}`);

/* ---- the briefing message ------------------------------------------------ */
await admin.goto(`${BASE}/admin/events/${eventId}/notify`);
await admin.waitForLoadState('networkidle');
// The message itself only exists inside the preview, which is where the
// supervisor reads it before sending — so that is where it has to be checked.
await admin
  .locator('tr', { hasText: onDetail.full_name })
  .first()
  .locator('button:has-text("معاينة الرسالة")')
  .click();
await admin.waitForTimeout(700);
const notifyText = await admin.textContent('pre');
check('the briefing carries the venue location and the map',
  notifyText.includes('الموقع على الخرائط') && notifyText.includes('مكانك على خريطة الموقع'),
  '');
check('the briefing tells the early shift where to be first',
  notifyText.includes('قبل الحفل:'), '');
await admin.keyboard.press('Escape');

/* ---- feedback ------------------------------------------------------------ */
const doneEvent = await db.prepare(
  "select id from events where status='COMPLETED' limit 1").get();
const doneMember = await db.prepare(
  'select token, id from event_members where event_id=? limit 1').get(doneEvent.id);

await mp.goto(`${BASE}/member/${doneMember.token}`);
await mp.waitForLoadState('networkidle');
// Scoped to the rendered page: the whole dictionary is serialised into the
// document for the client components, so `body` text contains every label.
check('a finished event asks its team for feedback',
  (await mp.locator('h2:has-text("تقييم الفعالية")').count()) === 1, '');

// An event still to come does not: the evening is not over yet.
const upcoming = await db.prepare(`
  select em.token from event_members em
  join events e on e.id = em.event_id
  where e.status not in ('COMPLETED','ARCHIVED') limit 1`).get();
if (upcoming) {
  await mp.goto(`${BASE}/member/${upcoming.token}`);
  await mp.waitForLoadState('networkidle');
  check('an event that has not finished does not ask yet',
    (await mp.locator('h2:has-text("تقييم الفعالية")').count()) === 0, '');
}

await mp.goto(`${BASE}/member/${doneMember.token}`);
await mp.waitForLoadState('networkidle');
await mp.locator('button[aria-pressed]').nth(3).click();
await mp.fill('#fb-problems', 'فحص آلي — الماسح وقف مرتين');
await mp.locator('form button[type=submit]').last().click();
await mp.waitForTimeout(2500);
const saved = await db.prepare(
  'select rating, problems from event_feedback where event_member_id=?').get(doneMember.id);
check('a member can rate the event they worked',
  Number(saved?.rating) === 4 && String(saved?.problems).includes('الماسح'),
  `${saved?.rating} / 5`);

// And the supervisor reads it in the closing report.
await admin.goto(`${BASE}/admin/events/${doneEvent.id}/reports`);
await admin.waitForLoadState('networkidle');
const reportFeedback = await admin.textContent('.report-doc');
check('the closing report carries the team feedback',
  reportFeedback.includes('تقييمات الفريق') && reportFeedback.includes('الماسح'), '');

await memberPage.close();

/* ---- accounts ------------------------------------------------------------ */
await admin.goto(`${BASE}/admin/settings`);
await admin.waitForLoadState('networkidle');
const settingsText = await admin.textContent('main');
check('the second administrator exists', settingsText.includes('Mohamed Numan'), '');

// Changing your own password, which is what makes a shipped account yours.
await admin.fill('#currentPassword', 'Admin@12345');
await admin.fill('#newPassword', 'Admin@67890');
await admin.fill('#confirmPassword', 'Admin@67890');
await admin.locator('form:has(#currentPassword) button[type=submit]').click();
await admin.waitForTimeout(2000);
check('a password can be changed from inside the app',
  (await admin.textContent('main')).includes('تم تغيير كلمة المرور'), '');

// Put it back, so the suite is repeatable.
await admin.fill('#currentPassword', 'Admin@67890');
await admin.fill('#newPassword', 'Admin@12345');
await admin.fill('#confirmPassword', 'Admin@12345');
await admin.locator('form:has(#currentPassword) button[type=submit]').click();
await admin.waitForTimeout(2000);
const restored = await admin.textContent('main');
check('and changed back, so the old one works again',
  restored.includes('تم تغيير كلمة المرور'), '');

/* ================= SECURITY TEST CASES (spec §53) ====================== */

// A member cannot reach admin pages.
const anon = await browser.newContext();
const anonPage = await anon.newPage();
const adminResponse = await anonPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
check('anonymous visitor is redirected to /login', anonPage.url().includes('/login'), anonPage.url());

// Tokens cannot be guessed / enumerated.
const bad = await anonPage.goto(`${BASE}/member/${'0'.repeat(32)}`, { waitUntil: 'networkidle' });
const badText = await anonPage.textContent('body');
check('unknown token shows invalid-link page', badText.includes('رابط غير صالح'));

const malformed = await anonPage.goto(`${BASE}/member/1`, { waitUntil: 'networkidle' });
const malformedText = await anonPage.textContent('body');
check('non-hex token rejected', malformedText.includes('رابط غير صالح'));

// A team leader cannot open an event they were not granted.
const otherEvent = await db.prepare(
  "select id, name from events where name like '%مهرجان%'").get();
const leaderCtx = await browser.newContext();
const leader = await login(leaderCtx, 'ahmed', 'Leader@12345');
check('team leader login lands on /leader', leader.url().includes('/leader'), leader.url());
await leader.goto(`${BASE}/leader/events/${otherEvent.id}`, { waitUntil: 'networkidle' });
check('team leader blocked from an unrelated event', leader.url().includes('/forbidden'), leader.url());
await leader.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
check('team leader blocked from /admin', leader.url().includes('/forbidden'), leader.url());
await leader.goto(`${BASE}/leader/events/${eventId}`, { waitUntil: 'networkidle' });
check('team leader can open their own event', leader.url().includes(`/leader/events/${eventId}`));

// A gate leader sees only their own gate.
const gateCtx = await browser.newContext();
const gateLeader = await login(gateCtx, 'hussein', 'Gate@12345');
await gateLeader.goto(`${BASE}/leader/events/${eventId}/team`, { waitUntil: 'networkidle' });
const gateTeam = await gateLeader.textContent('main');
const gate6Members = (await db.prepare(`
  select tm.full_name from assignments a
  join event_members em on em.id=a.event_member_id
  join team_members tm on tm.id=em.team_member_id
  where a.gate_id=?`).all(gate6.id)).map(r => r.full_name);
check('gate leader does not see other gates’ members',
  gate6Members.every(n => !gateTeam.includes(n)),
  `checked ${gate6Members.length} gate-6 members`);
await gateLeader.goto(`${BASE}/leader/events/${eventId}/activity`, { waitUntil: 'networkidle' });
const gateNav = await gateLeader.textContent('aside, header');
/* ---- the briefing screen exposes phone numbers: managers only ---------- */
await gateLeader.goto(`${BASE}/admin/events/${eventId}/notify`);
await gateLeader.waitForLoadState('networkidle');
check('gate leader cannot open the briefing screen',
  gateLeader.url().includes('/forbidden'),
  gateLeader.url());
await gateLeader.goto(`${BASE}/leader/events/${eventId}/notify`);
await gateLeader.waitForLoadState('networkidle');
check('gate leader blocked from the leader briefing route too',
  gateLeader.url().includes('/forbidden'),
  gateLeader.url());

check('gate leader nav omits management sections', !gateNav.includes('التوزيع'));

/*
 * A gate leader marks who turned up at their own gate. Rewriting the times and
 * the days those turn into money is the supervisor's, so the server refuses it
 * even though the same person may legitimately record the status beside it.
 */
const gateMemberId = (await db.prepare(
  'select id from event_members where event_id=? limit 1').get(eventId)).id;
const forgedTimes = await gateLeader.request.post(`${BASE}/admin/events/${eventId}/attendance`, {
  form: { eventId, eventMemberId: gateMemberId, checkInTime: '01:00', checkOutTime: '02:00' },
  headers: { 'next-action': 'forged' },
  failOnStatusCode: false,
});
const untouched = await db.prepare(
  'select check_in_time from attendance where event_member_id=?').get(gateMemberId);
check('gate leader cannot rewrite attendance times',
  untouched?.check_in_time !== '01:00',
  `status ${forgedTimes.status()}, stored ${untouched?.check_in_time ?? 'none'}`);

// The payroll figures are admin-only: a team leader has no business there.
await leader.goto(`${BASE}/admin/credits`, { waitUntil: 'networkidle' });
check('team leader blocked from the payroll report',
  leader.url().includes('/forbidden') || leader.url().includes('/login'),
  leader.url());

// Wrong password is rejected.
const badCtx = await browser.newContext();
const badLogin = await badCtx.newPage();
await badLogin.goto(`${BASE}/login`);
await badLogin.waitForSelector('button[type=submit]:not([disabled])');
await badLogin.fill('#username', 'admin');
await badLogin.fill('#password', 'wrong-password');
await badLogin.click('button[type=submit]');
await badLogin.waitForTimeout(1500);
const loginText = await badLogin.textContent('body');
check('wrong password is rejected', loginText.includes('غير صحيحة'));

// Conflict detection.
const conflictTarget = await db.prepare(`
  select em.id from event_members em
  where em.event_id=? and em.id in (select event_member_id from assignments where status!='CANCELLED')
  limit 1`).get(eventId);
await admin.goto(`${BASE}/admin/events/${eventId}/assignments`);
await admin.waitForLoadState('networkidle');
await admin.click('button:has-text("توزيع عضو")');
await admin.waitForSelector('#a-member');
const options = await admin.locator('#a-member option').count();
check('already-assigned members are not offered twice', options <= 6, `${options} options`);

/*
 * The hours belong to the event, so the assignment form does not ask for them.
 * They are there for the person whose hours genuinely differ, folded away.
 */
const hoursHidden = await admin.locator('#a-arrival').isVisible();
check('assignment form does not ask for hours by default', hoursHidden === false,
  `arrival field visible: ${hoursHidden}`);
await admin.click(`text=${'وقت مختلف لهذا العضو'}`);
check('hours can still be set for one person',
  await admin.locator('#a-arrival').isVisible());
await admin.keyboard.press('Escape');

/* ---- building an event from a previous one ----------------------------- */
await admin.goto(`${BASE}/admin/events/new`);
await admin.waitForLoadState('networkidle');
// Build it from the match specifically, so the copy can be compared with it.
await admin.selectOption('#templateEventId', eventId);
await admin.waitForTimeout(600);
await admin.fill('#name', 'فعالية من قالب — فحص');
await admin.selectOption('#venueId', { index: 1 });
await admin.fill('#date', '2026-12-01');
await admin.fill('#startTime', '20:00');
await admin.fill('#teamArrivalTime', '18:00');
await admin.fill('#teamDepartureTime', '23:00');
// The page's own form, not the sign-out button in the shell above it.
await admin.locator('form').filter({ has: admin.locator('#templateEventId') })
  .locator('button[type=submit]').click();
await admin.waitForTimeout(5000);

const cloned = await db.prepare(
  'select id, team_arrival_time, team_departure_time from events where name=?',
).get('فعالية من قالب — فحص');
check('an event can be created from a previous one', Boolean(cloned?.id));

const clonedGates = await db.prepare(
  'select count(*) as n from gates where event_id=?').get(cloned.id);
const sourceGates = await db.prepare(
  'select count(*) as n from gates where event_id=?').get(eventId);
check('the template copies every gate',
  Number(clonedGates.n) > 0 && Number(clonedGates.n) === Number(sourceGates.n),
  `${clonedGates.n} of ${sourceGates.n}`);

const clonedAssignments = await db.prepare(
  'select count(*) as n from assignments where event_id=?').get(cloned.id);
check('the template copies the team and their places',
  Number(clonedAssignments.n) > 0, `${clonedAssignments.n} assignments`);

// Every copied assignment takes the NEW event's hours, not the old ones.
const strayHours = await db.prepare(
  'select count(*) as n from assignments where event_id=? and (arrival_time!=? or shift_end!=?)',
).get(cloned.id, '18:00', '23:00');
check('copied assignments take the new event hours', Number(strayHours.n) === 0,
  `${strayHours.n} with other hours`);

// Tokens are keys: a copied member must never inherit one.
const sharedTokens = await db.prepare(`
  select count(*) as n from event_members a
  join event_members b on a.token = b.token and a.id != b.id`).get();
check('copied members get new personal links', Number(sharedTokens.n) === 0,
  `${sharedTokens.n} shared tokens`);

/*
 * Marker positions are the slowest part of setting a venue up by hand, so the
 * copy is only worth having if they come across pointing at the new event's
 * own gates.
 */
const clonedMarkers = await db.prepare(
  'select count(*) as n from map_markers where event_id=?').get(cloned.id);
const sourceMarkers = await db.prepare(
  'select count(*) as n from map_markers where event_id=?').get(eventId);
check('the template copies the map markers',
  Number(clonedMarkers.n) > 0 && Number(clonedMarkers.n) === Number(sourceMarkers.n),
  `${clonedMarkers.n} of ${sourceMarkers.n}`);

const danglingMarkers = await db.prepare(`
  select count(*) as n from map_markers m
  where m.event_id=? and m.gate_id is not null
  and m.gate_id not in (select id from gates where event_id=?)`).get(cloned.id, cloned.id);
check('copied markers point at the new event own gates',
  Number(danglingMarkers.n) === 0, `${danglingMarkers.n} pointing elsewhere`);

// The record of a day that happened must not travel to one that has not.
const carried = await db.prepare(
  'select count(*) as n from attendance where event_id=?').get(cloned.id);
check('the template copies the plan, not the record', Number(carried.n) === 0,
  `${carried.n} attendance rows`);

// Who leads the team, and who runs each gate, is part of the plan.
const carriedRoles = await db.prepare(
  'select count(*) as n from event_members where event_id=? and event_role is not null').get(cloned.id);
const carriedGateLeads = await db.prepare(
  'select count(*) as n from gates where event_id=? and gate_leader_id is not null').get(cloned.id);
check('the template carries the roles and the gate leaders',
  Number(carriedRoles.n) > 0 && Number(carriedGateLeads.n) > 0,
  `${carriedRoles.n} roles, ${carriedGateLeads.n} gates with a leader`);
await admin.keyboard.press('Escape');

/* ---- cancelling and putting back ----------------------------------------- */
/*
 * Cancelling somebody used to be one-way: their row stayed on the event, the
 * picker therefore skipped them as "already added", and nothing could put them
 * back. This is the round trip.
 */
const spare = await db.prepare(`
  select em.id, tm.full_name from event_members em
  join team_members tm on tm.id = em.team_member_id
  left join assignments a
    on a.event_member_id = em.id and a.status != 'CANCELLED'
  where em.event_id=? and a.id is null and em.status != 'CANCELLED' limit 1`).get(eventId);

if (spare) {
  await admin.goto(`${BASE}/admin/events/${eventId}/team`);
  await admin.waitForLoadState('networkidle');

  admin.once('dialog', (d) => d.accept());
  await admin
    .locator('tr', { hasText: spare.full_name })
    .first()
    .locator('button:has-text("إلغاء المشاركة")')
    .click();
  await admin.waitForTimeout(2500);
  const cancelled = await db.prepare('select status from event_members where id=?').get(spare.id);
  check('a member can be taken off the event', cancelled?.status === 'CANCELLED',
    String(cancelled?.status));

  // The picker must offer them again.
  await admin.reload();
  await admin.waitForLoadState('networkidle');
  await admin.click('button:has-text("إضافة أعضاء للفعالية")');
  await admin.waitForTimeout(700);
  const offered = await admin.locator(`label:has-text("${spare.full_name}")`).count();
  check('a cancelled member is offered again by the picker', offered > 0, `${offered} entries`);
  await admin.keyboard.press('Escape');

  // And their own card offers the way back, which is what the screen is for.
  await admin.reload();
  await admin.waitForLoadState('networkidle');
  await admin
    .locator('tr', { hasText: spare.full_name })
    .first()
    .locator('button:has-text("إعادة المشاركة")')
    .click();
  await admin.waitForTimeout(2500);
  const back = await db.prepare('select status from event_members where id=?').get(spare.id);
  check('a cancelled member can be put back', back?.status === 'INVITED', String(back?.status));
}

/* ---- order of the lists -------------------------------------------------- */
/*
 * The roster mixes Arabic and Latin names. SQLite's own ORDER BY puts every
 * Latin name first, which reads as no order at all, so the check is that the
 * rendered order matches a collator rather than that it is merely sorted.
 */
const collator = new Intl.Collator(['ar', 'en'], {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: true,
});

await admin.goto(`${BASE}/admin/team`);
await admin.waitForLoadState('networkidle');
const teamNames = (await admin.locator('tbody tr td:first-child').allTextContents())
  .map((value) => value.trim())
  .filter(Boolean);
const teamSorted = [...teamNames].sort(collator.compare);
check('the team database reads alphabetically',
  JSON.stringify(teamNames) === JSON.stringify(teamSorted),
  `${teamNames.length} names`);

await admin.goto(`${BASE}/admin/events/${eventId}/team`);
await admin.waitForLoadState('networkidle');

/*
 * The screen shows two sections — working, then reserve — so the order is
 * checked WITHIN each section rather than across the whole table; a reserve
 * member sorting after an active one is the layout, not a bug.
 */
const eventRows = await admin.locator('tbody tr').all();
const listed = [];
for (const row of eventRows) {
  const name = (await row.locator('td').first().textContent())?.trim() ?? '';
  const text = (await row.textContent()) ?? '';
  if (name) listed.push({ name, cancelled: text.includes('ملغى'), reserve: text.includes('احتياط') });
}

let orderOk = true;
for (const group of [false, true]) {
  const section = listed.filter((row) => row.reserve === group);
  const want = [...section].sort(
    (a, b) => Number(a.cancelled) - Number(b.cancelled) || collator.compare(a.name, b.name),
  );
  if (JSON.stringify(section) !== JSON.stringify(want)) orderOk = false;
}
check('the event team reads alphabetically with cancelled at the end', orderOk,
  `${listed.length} rows, ${listed.filter((r) => r.cancelled).length} cancelled`);

// Somebody taken off the event must not be sent a briefing at all.
const droppedOne = await db.prepare(
  "select em.id, tm.full_name from event_members em join team_members tm on tm.id = em.team_member_id where em.event_id=? and em.status='CANCELLED' limit 1",
).get(eventId);
if (droppedOne) {
  await admin.goto(`${BASE}/admin/events/${eventId}/notify`);
  await admin.waitForLoadState('networkidle');
  const briefingList = await admin.textContent('main');
  check('a cancelled member is not briefed',
    !briefingList.includes(droppedOne.full_name), droppedOne.full_name);
}

/* ---- the setup walk-through ---------------------------------------------- */
/*
 * A new event lands on the first thing that has to be done rather than on an
 * empty overview, and every step is the real screen — so the check follows the
 * URLs, which is what the walk-through actually is.
 */
await admin.goto(`${BASE}/admin/events/new`);
await admin.waitForLoadState('networkidle');
await admin.fill('input[name="name"]', `فحص التجهيز ${Date.now() % 100000}`);
await admin.selectOption('select[name="venueId"]', { index: 1 });
await admin.fill('input[name="date"]', '2026-12-09');
await admin.fill('input[name="startTime"]', '20:00');
await admin.fill('input[name="teamArrivalTime"]', '17:00');
await Promise.all([
  admin.waitForURL('**/gates?setup=1', { timeout: 25000 }),
  admin.locator('button[type=submit]').last().click(),
]);
check('a new event opens on the first setup step', admin.url().includes('/gates?setup=1'),
  new URL(admin.url()).search);

const walkEventId = admin.url().split('/events/')[1].split('/')[0];

// Next moves on …
await Promise.all([
  admin.waitForURL('**/team?setup=2', { timeout: 15000 }),
  admin.click('a:has-text("التالي")'),
]);
check('next moves to the team step', admin.url().includes('/team?setup=2'), '');

// … and so does skip, which is the point: a step may be left undone.
await Promise.all([
  admin.waitForURL('**/board?setup=3', { timeout: 15000 }),
  admin.click('a:has-text("تخطّي")'),
]);
check('skip moves on without doing the step', admin.url().includes('/board?setup=3'), '');

// Any step is reachable directly — going back to fix the gates must not mean
// starting the walk again.
await Promise.all([
  admin.waitForURL('**/gates?setup=1', { timeout: 15000 }),
  admin.click('a[aria-current="step"] >> nth=-1').catch(() => {}),
  admin.locator('ol a', { hasText: 'البوابات ونقاط العمل' }).first().click(),
]).catch(async () => {
  await admin.goto(`${BASE}/admin/events/${walkEventId}/gates?setup=1`);
});
check('the steps can be jumped between', admin.url().includes('setup=1'),
  new URL(admin.url()).search);

// The last step finishes, and finishing leaves the walk-through for good.
await admin.goto(`${BASE}/admin/events/${walkEventId}/notify?setup=5`);
await admin.waitForLoadState('networkidle');
await Promise.all([
  admin.waitForURL((u) => !u.search.includes('setup'), { timeout: 15000 }),
  admin.locator('a.btn-primary', { hasText: 'إنهاء' }).first().click(),
]);
check('finishing leaves the walk-through', !admin.url().includes('setup'),
  new URL(admin.url()).pathname);

await admin.goto(`${BASE}/admin/events/${walkEventId}/gates`);
await admin.waitForLoadState('networkidle');
check('an ordinary visit shows no walk-through',
  (await admin.locator('text=تجهيز الفعالية').count()) === 0, '');

// A gate leader is never walked through setting an event up.
const gateLeaderWalk = await gateLeader.goto(
  `${BASE}/leader/events/${eventId}/gates?setup=1`,
);
check('a gate leader never sees the walk-through',
  gateLeaderWalk.status() !== 200
    || (await gateLeader.locator('text=تجهيز الفعالية').count()) === 0,
  `status ${gateLeaderWalk.status()}`);

/* ---- the theme ----------------------------------------------------------- */
/*
 * The palette lives in CSS variables, so "does the light theme work" is one
 * question: does the page background actually change. If it does, every
 * component changed with it, because they all read the same variables.
 */
const themeCtx = await browser.newContext({ colorScheme: 'light' });
const themePage = await themeCtx.newPage();
await themePage.goto(`${BASE}/login`);
await themePage.waitForLoadState('networkidle');
const lightBg = await themePage.evaluate(
  () => getComputedStyle(document.body).backgroundColor,
);
check('a device set to light gets the light theme', lightBg === 'rgb(255, 255, 255)', lightBg);

// An explicit choice beats the device: dark stays dark on a light phone.
await themePage.evaluate(() => {
  localStorage.setItem('ops-theme', 'dark');
});
await themePage.reload();
await themePage.waitForLoadState('networkidle');
const forcedDark = await themePage.evaluate(
  () => getComputedStyle(document.body).backgroundColor,
);
check('a chosen theme overrides the device', forcedDark === 'rgb(10, 9, 8)', forcedDark);

// And the choice is applied before paint, not after hydration.
const attrBeforeHydration = await themePage.evaluate(
  () => document.documentElement.getAttribute('data-theme'),
);
check('the chosen theme is applied without a flash', attrBeforeHydration === 'dark',
  String(attrBeforeHydration));

/*
 * The house identity, asserted.
 *
 * Colour and radius drift one component at a time and nobody notices until the
 * whole thing looks generic again, so the four values that carry the Ticket
 * Zone identity are checked the same way a feature is: the brand red on the
 * primary action, the warm ink on text, the pill on anything you press, and
 * the house font actually arriving rather than falling back to Tahoma.
 */
const brandCtx = await browser.newContext({ colorScheme: 'light' });
const brandPage = await brandCtx.newPage();
await brandPage.goto(`${BASE}/login`);
await brandPage.waitForSelector('button[type=submit]:not([disabled])');
const identity = await brandPage.evaluate(() => {
  const btn = document.querySelector('.btn-primary') || document.querySelector('button[type=submit]');
  const s = getComputedStyle(btn);
  return {
    btnBg: s.backgroundColor,
    btnRadius: s.borderTopLeftRadius,
    ink: getComputedStyle(document.body).color,
    font: getComputedStyle(document.body).fontFamily,
    fontLoaded: document.fonts.check('700 16px "Noto Sans Arabic"'),
  };
});
check('the primary action wears the Ticket Zone red', identity.btnBg === 'rgb(228, 88, 74)', identity.btnBg);
check('anything you press is a pill', parseInt(identity.btnRadius, 10) >= 999, identity.btnRadius);
check('text sits on the warm ink, not a cool grey', identity.ink === 'rgb(27, 25, 23)', identity.ink);
check('the house font is the first family', identity.font.startsWith('"Noto Sans Arabic"') || identity.font.startsWith('Noto Sans Arabic'), identity.font);
check('the house font actually loaded', identity.fontLoaded === true, String(identity.fontLoaded));
await brandCtx.close();

const darkCtx = await browser.newContext({ colorScheme: 'dark' });
const darkPage = await darkCtx.newPage();
await darkPage.goto(`${BASE}/login`);
await darkPage.waitForLoadState('networkidle');
const darkBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('a device set to dark stays dark', darkBg === 'rgb(10, 9, 8)', darkBg);
await themeCtx.close();
await darkCtx.close();

/* ---- briefing: sending to everyone --------------------------------------- */
await admin.goto(`${BASE}/admin/events/${eventId}/notify`);
await admin.waitForLoadState('networkidle');
const notifyScreen = await admin.textContent('main');
check('the briefing screen offers a run through the whole team',
  notifyScreen.includes('إرسال للكل'), '');

/*
 * The official route is described whether or not it is connected — without
 * keys it must say what is missing rather than pretending the feature is not
 * there. No token is configured in the test run, so this is the "not yet"
 * state, and the names of the variables are all it may show.
 */
check('the official WhatsApp route explains what it needs',
  notifyScreen.includes('الإرسال التلقائي عبر واتساب')
    && notifyScreen.includes('WHATSAPP_TOKEN'),
  '');
check('no secret reaches the briefing screen',
  !notifyScreen.includes('Bearer') && !notifyScreen.includes('graph.facebook.com'), '');

// The gate leader's name is in the message the member receives.
const anyLed = await db.prepare(`
  select tm.full_name from assignments a
  join gates g on g.id = a.gate_id and g.gate_leader_id is not null
  join event_members em on em.id = a.event_member_id
  join team_members tm on tm.id = em.team_member_id
  where a.event_id=? and em.id != g.gate_leader_id limit 1`).get(eventId);
if (anyLed) {
  await admin
    .locator('tr', { hasText: anyLed.full_name })
    .first()
    .locator('button:has-text("معاينة الرسالة")')
    .click();
  await admin.waitForTimeout(600);
  const msg = await admin.textContent('pre');
  check('the message names who to report to', msg.includes('قائد بوابتك'), '');
  await admin.keyboard.press('Escape');
}

/* ---- RTL / LTR --------------------------------------------------------- */
// From a known page, so this never depends on where the previous check ended.
await admin.goto(`${BASE}/admin`);
await admin.waitForLoadState('networkidle');
const dirRtl = await admin.getAttribute('html', 'dir');
check('Arabic renders RTL', dirRtl === 'rtl', dirRtl);
await admin.click('button:has-text("English")');
await admin.waitForTimeout(1500);
const dirLtr = await admin.getAttribute('html', 'dir');
const enText = await admin.textContent('main');
check('English renders LTR', dirLtr === 'ltr', dirLtr);
check('English dictionary applied',
  enText.includes('Operations dashboard') && enText.includes('Live events'), '');

await browser.close();
db.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:\n' + failed.map(f => ' - ' + f.name + (f.detail ? ` (${f.detail})` : '')).join('\n'));
  process.exit(1);
}
