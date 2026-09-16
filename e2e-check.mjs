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
await admin.keyboard.press('Escape');

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
