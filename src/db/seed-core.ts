/**
 * Demo data (spec §44).
 *
 * Builds a convincing operational picture the moment the app starts:
 *   • Al-Zawraa vs Al-Shorta — LIVE, 8 gates, 32-person team, full history
 *   • A concert in PLANNING and an exhibition COMPLETED, so the dashboard,
 *     empty states and reports all have something real to show.
 *
 * Called two ways, with the same result:
 *   • `npm run db:seed` — see seed.ts, the command-line wrapper
 *   • the first-run setup route, so a deployed site can fill itself without a
 *     terminal (src/app/api/setup/route.ts)
 */
import type { Client } from '@libsql/client';
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import bcrypt from 'bcryptjs';

import * as schema from './schema';
import { newId, newMemberToken } from '../lib/ids';

/* -------------------------------------------------------------------------- */

export type SeedContext = {
  db: LibSQLDatabase<typeof schema>;
  /** The raw client, for the two statements drizzle has no builder for. */
  sql: Client;
};

export type SeedResult = {
  adminUsername: string;
  adminPassword: string;
  leaderUsername: string;
  leaderPassword: string;
  gatePassword: string;
  memberToken: string;
};

/**
 * Assigned once at the start of seedDemoData. The seed is a single long
 * script rather than a library, so threading the handle through forty
 * statements would add noise without adding safety.
 */
let db: SeedContext['db'];
let sql: SeedContext['sql'];

const {
  users,
  eventAccess,
  teamMembers,
  venues,
  events,
  eventMembers,
  gates,
  workingPoints,
  assignments,
  assignmentChanges,
  attendance,
  announcements,
  issues,
  timelineItems,
  mapMarkers,
  auditLogs,
} = schema;

const MINUTES = 60 * 1000;

/**
 * The demo match is LIVE, so it is anchored to *today* — that keeps every
 * seeded timestamp in the past, makes "جارية" honest, and means the dashboard
 * looks right whenever the project is set up rather than only in one week of
 * 2026.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const today = new Date();
const EVENT_DATE = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const eventDay = new Date(`${EVENT_DATE}T00:00:00`);
const addDays = (days: number) => {
  const d = new Date(eventDay.getTime() + days * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/**
 * Seeded record timestamps are written RELATIVE to "now", anchored so the
 * latest one (18:30 on the match clock) lands at the present moment. Relative
 * ordering is preserved exactly, and nothing the demo claims already happened
 * is ever stamped in the future — whatever hour the project is set up.
 *
 * The event's own schedule (arrival 17:00, kick-off 19:30) stays as plain
 * clock strings; only stored timestamps are anchored this way.
 */
const MATCH_CLOCK_ANCHOR = 18 * 60 + 30;
const at = (hhmm: string, offsetMinutes = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  const minutesBeforeNow = MATCH_CLOCK_ANCHOR - (h * 60 + m + offsetMinutes);
  return new Date(Date.now() - minutesBeforeNow * MINUTES);
};

/**
 * The same anchor applied to the schedule the UI displays, so the whole demo
 * agrees with itself: the team arrived ninety minutes ago, kick-off is an hour
 * away, and the recorded check-in times sit just before the arrival time.
 */
const sched = (hhmm: string, offsetMinutes = 0) => {
  const d = at(hhmm, offsetMinutes);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A literal clock string, shifted by minutes.
 *
 * Unlike `sched`, this does not travel through "now": a check-in recorded as
 * 16:52 is stored as "16:52" whatever hour the seed is run, which is the whole
 * point of keeping clock values as text.
 */
const clock = (hhmm: string, offsetMinutes = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + offsetMinutes + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

async function wipe() {
  // Order matters only because foreign_keys is OFF above; kept explicit anyway.
  for (const table of [
    auditLogs,
    mapMarkers,
    timelineItems,
    issues,
    announcements,
    attendance,
    assignmentChanges,
    assignments,
    workingPoints,
    gates,
    eventMembers,
    eventAccess,
    events,
    venues,
    users,
    teamMembers,
  ]) {
    await db.delete(table).run();
  }
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

const PEOPLE = [
  'أحمد الربيعي',
  'أمير عبد الله',
  'حسين الجبوري',
  'مصطفى الكعبي',
  'محمد العبيدي',
  'حسن الساعدي',
  'علي الزبيدي',
  'عمر الدليمي',
  'كرار الموسوي',
  'سجاد البياتي',
  'مرتضى الخفاجي',
  'يوسف التميمي',
  'زيد الحسناوي',
  'حيدر الغريري',
  'باقر السوداني',
  'ليث الجابري',
  'رسول العامري',
  'أنس الحيالي',
  'طه المشهداني',
  'وسام الفهداوي',
  'سيف الدين الحديثي',
  'ضرغام المالكي',
  'عبد الله الشويلي',
  'علاء السامرائي',
  'زينب الشمري',
  'رغد العزاوي',
  'فاطمة الحلي',
  'سارة النعيمي',
  'مريم الطائي',
  'هبة الجنابي',
  'آية الركابي',
  'تبارك القيسي',
  'نبأ الأسدي',
  'دعاء الخزرجي',
  'شهد العقابي',
  'رند الجاف',
  'براء الدراجي',
  'مهند اللامي',
  'إبراهيم الزيدي',
  'قاسم البهادلي',
  'نور الهدى الصفار',
  'إسراء الحسيني',
  'عثمان الراوي',
  'جعفر الصائغ',
  'أمجد الشمخاني',
  'تميم العاني',
];

type Person = { id: string; name: string; code: string };

async function seedPeople(): Promise<Person[]> {
  const rows = PEOPLE.map((name, i) => ({
    id: newId(),
    fullName: name,
    phone: `+9647${(700000000 + i * 137911).toString().slice(0, 9)}`,
    employeeCode: `TZ-${String(1001 + i)}`,
    active: i < 44,
    notes: null,
  }));
  await db.insert(teamMembers).values(rows).run();
  return rows.map((r) => ({ id: r.id, name: r.fullName, code: r.employeeCode }));
}

/* -------------------------------------------------------------------------- */

export async function seedDemoData(ctx: SeedContext): Promise<SeedResult> {
  db = ctx.db;
  sql = ctx.sql;

  console.log('› resetting database…');
  await wipe();

  const people = await seedPeople();
  const byName = (name: string) => {
    const p = people.find((x) => x.name === name);
    if (!p) throw new Error(`seed: unknown person ${name}`);
    return p;
  };

  /* ---- users ------------------------------------------------------------ */
  console.log('› users…');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const leaderPassword = process.env.SEED_LEADER_PASSWORD ?? 'Leader@12345';
  const gatePassword = process.env.SEED_GATELEADER_PASSWORD ?? 'Gate@12345';

  const adminId = newId();
  const leaderId = newId();
  const leader2Id = newId();
  const gateLeaderUserId = newId();

  const hussein = byName('حسين الجبوري');

  await db.insert(users)
    .values([
      {
        id: adminId,
        username: process.env.SEED_ADMIN_USERNAME ?? 'admin',
        email: 'admin@operations.local',
        name: 'مشرف العمليات',
        passwordHash: bcrypt.hashSync(adminPassword, 10),
        role: 'ADMIN',
        active: true,
        teamMemberId: null,
      },
      {
        id: leaderId,
        username: process.env.SEED_LEADER_USERNAME ?? 'ahmed',
        email: 'ahmed@operations.local',
        name: 'أحمد الربيعي',
        passwordHash: bcrypt.hashSync(leaderPassword, 10),
        role: 'TEAM_LEADER',
        active: true,
        teamMemberId: byName('أحمد الربيعي').id,
      },
      {
        id: leader2Id,
        username: 'sara',
        email: 'sara@operations.local',
        name: 'سارة النعيمي',
        passwordHash: bcrypt.hashSync(leaderPassword, 10),
        role: 'TEAM_LEADER',
        active: true,
        teamMemberId: byName('سارة النعيمي').id,
      },
      {
        id: gateLeaderUserId,
        username: 'hussein',
        email: 'hussein@operations.local',
        name: 'حسين الجبوري',
        passwordHash: bcrypt.hashSync(gatePassword, 10),
        role: 'GATE_LEADER',
        active: true,
        teamMemberId: hussein.id,
      },
    ])
    .run();

  /* ---- venues ----------------------------------------------------------- */
  console.log('› venues…');
  const zawraaVenueId = newId();
  const arenaVenueId = newId();
  const fairVenueId = newId();

  await db.insert(venues)
    .values([
      {
        id: zawraaVenueId,
        name: 'ملعب الزوراء',
        address: 'شارع الكندي، حي الجامعة، بغداد',
        description: 'ملعب بسعة 12,000 متفرج، ثمان بوابات جماهيرية ومدخل خدمي ومدخل لاعبين.',
        mapImageUrl: '/maps/al-zawraa-stadium.png',
        // Real coordinates for Al-Zawraa Stadium, so the briefing a member
        // receives opens a map that actually goes somewhere.
        locationUrl: 'https://www.google.com/maps?q=33.313400,44.355600',
        latitude: 33.3134,
        longitude: 44.3556,
      },
      {
        id: arenaVenueId,
        name: 'قاعة بغداد الكبرى',
        address: 'المنصور، بغداد',
        description: 'قاعة مغلقة للحفلات والمؤتمرات، سعة 4,500 مقعد.',
        mapImageUrl: null,
      },
      {
        id: fairVenueId,
        name: 'معرض بغداد الدولي',
        address: 'الشعب، بغداد',
        description: 'أرض معارض متعددة القاعات مع ساحات خارجية.',
        mapImageUrl: null,
      },
    ])
    .run();

  /* ====================================================================== */
  /* EVENT A — Al-Zawraa vs Al-Shorta (LIVE, the full demo)                 */
  /* ====================================================================== */
  console.log('› event: الزوراء × الشرطة…');
  const eventAId = newId();

  await db.insert(events)
    .values({
      id: eventAId,
      name: 'الزوراء × الشرطة',
      type: 'FOOTBALL_MATCH',
      venueId: zawraaVenueId,
      date: EVENT_DATE,
      startTime: sched('19:30'),
      teamArrivalTime: sched('17:00'),
      teamDepartureTime: sched('22:30'),
      description:
        'مباراة الجولة السابعة من الدوري الممتاز. حضور متوقع 11,000 متفرج، مع تشغيل المسح الإلكتروني على كل البوابات الجماهيرية.',
      status: 'LIVE',
      mapImageUrl: null,
      reportNotes: null,
      createdById: adminId,
      createdAt: at('09:00', -60 * 24 * 6),
      updatedAt: at('17:20'),
    })
    .run();

  await db.insert(eventAccess)
    .values([
      {
        id: newId(),
        eventId: eventAId,
        userId: leaderId,
        role: 'TEAM_LEADER',
        gateId: null,
      },
    ])
    .run();

  /* ---- gates ------------------------------------------------------------ */
  type GateSpec = {
    key: string;
    name: string;
    type: string;
    required: number;
    status: string;
    capacity: number | null;
    description: string;
    x: number;
    y: number;
  };

  const gateSpecs: GateSpec[] = [
    { key: 'g1', name: 'البوابة 1', type: 'GENERAL', required: 4, status: 'ACTIVE', capacity: 2000, description: 'البوابة الشرقية الرئيسية — أعلى كثافة جماهيرية.', x: 0.8725, y: 0.5 },
    { key: 'g2', name: 'البوابة 2', type: 'GENERAL', required: 4, status: 'ACTIVE', capacity: 1800, description: 'الجهة الجنوبية الشرقية، مدرجات الدرجة الثانية.', x: 0.7634, y: 0.763 },
    { key: 'g3', name: 'البوابة 3', type: 'GENERAL', required: 5, status: 'ACTIVE', capacity: 2400, description: 'البوابة الجنوبية — تخدم المدرج الجنوبي بالكامل.', x: 0.5, y: 0.872 },
    { key: 'g4', name: 'البوابة 4', type: 'GENERAL', required: 3, status: 'ACTIVE', capacity: 1500, description: 'الجهة الجنوبية الغربية.', x: 0.2366, y: 0.763 },
    { key: 'g5', name: 'البوابة 5', type: 'GENERAL', required: 3, status: 'ACTIVE', capacity: 1400, description: 'البوابة الغربية، قرب نقطة الطوارئ.', x: 0.1275, y: 0.5 },
    { key: 'g6', name: 'البوابة 6', type: 'GENERAL', required: 3, status: 'ACTIVE', capacity: 1600, description: 'الجهة الشمالية الغربية، قرب منطقة المسح.', x: 0.2366, y: 0.237 },
    { key: 'g7', name: 'البوابة 7', type: 'STAFF', required: 2, status: 'READY', capacity: 300, description: 'مدخل الطاقم والإداريين — الطريق الخدمي الشمالي.', x: 0.5, y: 0.128 },
    { key: 'g8', name: 'البوابة 8', type: 'VIP', required: 3, status: 'ACTIVE', capacity: 400, description: 'بوابة كبار الشخصيات والإعلام.', x: 0.7634, y: 0.237 },
  ];

  const gateIds: Record<string, string> = {};
  await db.insert(gates)
    .values(
      gateSpecs.map((g, i) => {
        const id = newId();
        gateIds[g.key] = id;
        return {
          id,
          eventId: eventAId,
          name: g.name,
          type: g.type,
          description: g.description,
          capacity: g.capacity,
          requiredStaff: g.required,
          status: g.status,
          gateLeaderId: null,
          sortOrder: i,
        };
      }),
    )
    .run();

  /* ---- working points --------------------------------------------------- */
  type WpSpec = {
    key: string;
    name: string;
    type: string;
    required: number;
    status: string;
    description: string;
    x: number;
    y: number;
  };

  const wpSpecs: WpSpec[] = [
    { key: 'scan', name: 'منطقة المسح الإلكتروني', type: 'SCANNER_AREA', required: 2, status: 'ACTIVE', description: 'معالجة التذاكر التي يرفضها جهاز البوابة.', x: 0.145, y: 0.15 },
    { key: 'band', name: 'منطقة الأساور', type: 'WRISTBAND_AREA', required: 2, status: 'ACTIVE', description: 'توزيع أساور المناطق المخصصة.', x: 0.855, y: 0.15 },
    { key: 'info', name: 'نقطة الاستعلامات', type: 'INFORMATION', required: 1, status: 'ACTIVE', description: 'الساحة الرئيسية أمام المدخل الجنوبي الشرقي.', x: 0.855, y: 0.852 },
    { key: 'vip', name: 'استقبال كبار الشخصيات', type: 'VIP_AREA', required: 0, status: 'READY', description: 'المدرج الغربي.', x: 0.145, y: 0.852 },
    { key: 'emg', name: 'نقطة الطوارئ', type: 'EMERGENCY', required: 0, status: 'READY', description: 'نقطة تجمّع الإخلاء الغربية.', x: 0.06, y: 0.5 },
    { key: 'play', name: 'مدخل اللاعبين', type: 'PLAYER_ENTRANCE', required: 0, status: 'READY', description: 'النفق الجنوبي.', x: 0.6875, y: 0.916 },
  ];

  const wpIds: Record<string, string> = {};
  await db.insert(workingPoints)
    .values(
      wpSpecs.map((w, i) => {
        const id = newId();
        wpIds[w.key] = id;
        return {
          id,
          eventId: eventAId,
          name: w.name,
          type: w.type,
          description: w.description,
          requiredStaff: w.required,
          status: w.status,
          sortOrder: i,
        };
      }),
    )
    .run();

  /* ---- event team ------------------------------------------------------- */
  const teamA = [
    'أحمد الربيعي',
    'أمير عبد الله',
    'حسين الجبوري',
    'مصطفى الكعبي',
    'محمد العبيدي',
    'حسن الساعدي',
    'علي الزبيدي',
    'عمر الدليمي',
    'كرار الموسوي',
    'سجاد البياتي',
    'مرتضى الخفاجي',
    'يوسف التميمي',
    'زيد الحسناوي',
    'حيدر الغريري',
    'باقر السوداني',
    'ليث الجابري',
    'رسول العامري',
    'أنس الحيالي',
    'طه المشهداني',
    'وسام الفهداوي',
    'سيف الدين الحديثي',
    'ضرغام المالكي',
    'عبد الله الشويلي',
    'علاء السامرائي',
    'زينب الشمري',
    'رغد العزاوي',
    'فاطمة الحلي',
    'مريم الطائي',
    // reserve (4)
    'هبة الجنابي',
    'آية الركابي',
    'تبارك القيسي',
    'نبأ الأسدي',
  ];
  const RESERVE = new Set(['هبة الجنابي', 'آية الركابي', 'تبارك القيسي', 'نبأ الأسدي']);

  const emIds: Record<string, string> = {};
  await db.insert(eventMembers)
    .values(
      teamA.map((name) => {
        const id = newId();
        emIds[name] = id;
        return {
          id,
          eventId: eventAId,
          teamMemberId: byName(name).id,
          status: 'ACTIVE',
          token: newMemberToken(),
          tokenExpiresAt: null,
          isReserve: RESERVE.has(name),
          createdAt: at('09:00', -60 * 24 * 3),
          updatedAt: at('09:00', -60 * 24 * 3),
        };
      }),
    )
    .run();

  /* ---- assignments ------------------------------------------------------
   * Deliberately leaves gate 3 short by 2, gate 6 short by 1 and the wristband
   * area short by 1, so the staffing view has something real to flag.
   * -------------------------------------------------------------------- */
  type A = {
    member: string;
    loc: string; // "g1" | "wp:scan"
    task: string;
    arrival?: string;
    shift?: [string, string];
    gateLeader?: boolean;
  };

  const plan: A[] = [
    // Gate 1 — 4/4
    { member: 'مصطفى الكعبي', loc: 'g1', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'محمد العبيدي', loc: 'g1', task: 'ELECTRONIC_SCANNING' },
    { member: 'حسن الساعدي', loc: 'g1', task: 'ELECTRONIC_SCANNING' },
    { member: 'علي الزبيدي', loc: 'g1', task: 'CROWD_GUIDANCE' },
    // Gate 2 — 4/4
    { member: 'عمر الدليمي', loc: 'g2', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'كرار الموسوي', loc: 'g2', task: 'ELECTRONIC_SCANNING' },
    { member: 'سجاد البياتي', loc: 'g2', task: 'ELECTRONIC_SCANNING' },
    { member: 'مرتضى الخفاجي', loc: 'g2', task: 'CROWD_GUIDANCE' },
    // Gate 3 — 3/5  → understaffed by 2
    { member: 'حسين الجبوري', loc: 'g3', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'يوسف التميمي', loc: 'g3', task: 'ELECTRONIC_SCANNING' },
    { member: 'زيد الحسناوي', loc: 'g3', task: 'CROWD_GUIDANCE' },
    // Gate 4 — 3/3 (Amir starts here; the demo moves him to gate 6)
    { member: 'حيدر الغريري', loc: 'g4', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'أمير عبد الله', loc: 'g4', task: 'ELECTRONIC_SCANNING' },
    { member: 'باقر السوداني', loc: 'g4', task: 'PAPER_TICKETS' },
    // Gate 5 — 3/3
    { member: 'ليث الجابري', loc: 'g5', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'رسول العامري', loc: 'g5', task: 'ELECTRONIC_SCANNING' },
    { member: 'أنس الحيالي', loc: 'g5', task: 'CROWD_GUIDANCE' },
    // Gate 6 — 2/3 → understaffed by 1
    { member: 'طه المشهداني', loc: 'g6', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'وسام الفهداوي', loc: 'g6', task: 'ELECTRONIC_SCANNING' },
    // Gate 7 (staff) — 2/2
    { member: 'سيف الدين الحديثي', loc: 'g7', task: 'GATE_MANAGEMENT', gateLeader: true },
    { member: 'ضرغام المالكي', loc: 'g7', task: 'SECURITY_SUPPORT' },
    // Gate 8 (VIP) — 3/3
    { member: 'زينب الشمري', loc: 'g8', task: 'VIP_MANAGEMENT', gateLeader: true },
    { member: 'رغد العزاوي', loc: 'g8', task: 'VIP_MANAGEMENT' },
    { member: 'عبد الله الشويلي', loc: 'g8', task: 'ELECTRONIC_SCANNING' },
    // Working points
    { member: 'علاء السامرائي', loc: 'wp:scan', task: 'TECHNICAL_SUPPORT', arrival: sched('16:30') },
    { member: 'فاطمة الحلي', loc: 'wp:scan', task: 'ELECTRONIC_SCANNING', arrival: sched('16:30') },
    { member: 'مريم الطائي', loc: 'wp:band', task: 'WRISTBAND_DISTRIBUTION' }, // 1/2
    { member: 'أحمد الربيعي', loc: 'wp:info', task: 'INFORMATION', arrival: sched('16:00') },
  ];

  const assignmentIds: Record<string, string> = {};
  const assignmentRows = plan.map((a) => {
    const id = newId();
    assignmentIds[a.member] = id;
    const isGate = !a.loc.startsWith('wp:');
    return {
      id,
      eventId: eventAId,
      eventMemberId: emIds[a.member],
      gateId: isGate ? gateIds[a.loc] : null,
      workingPointId: isGate ? null : wpIds[a.loc.slice(3)],
      task: a.task,
      arrivalTime: a.arrival ?? sched('17:00'),
      shiftStart: a.shift?.[0] ?? sched('17:00'),
      shiftEnd: a.shift?.[1] ?? sched('22:30'),
      isGateLeader: Boolean(a.gateLeader),
      notes: null,
      status: 'ASSIGNED',
      createdById: leaderId,
      updatedById: null,
      createdAt: at('09:00', -60 * 24 * 2),
      updatedAt: at('09:00', -60 * 24 * 2),
    };
  });
  await db.insert(assignments).values(assignmentRows).run();

  // Gate leaders on the gate rows themselves.
  const gateLeaderByGate: Record<string, string> = {
    g1: 'مصطفى الكعبي',
    g2: 'عمر الدليمي',
    g3: 'حسين الجبوري',
    g4: 'حيدر الغريري',
    g5: 'ليث الجابري',
    g6: 'طه المشهداني',
    g7: 'سيف الدين الحديثي',
    g8: 'زينب الشمري',
  };
  for (const [key, name] of Object.entries(gateLeaderByGate)) {
    await sql.execute({
      sql: 'UPDATE gates SET gate_leader_id = ? WHERE id = ?',
      args: [emIds[name], gateIds[key]],
    });
    // The same fact in the member's own row, which is what the board and the
    // printed sheet read — see event_members.eventRole.
    await sql.execute({
      sql: "UPDATE event_members SET event_role = 'GATE_LEADER' WHERE id = ?",
      args: [emIds[name]],
    });
  }

  /*
   * Whoever runs the team on the day, and his second. Neither is a gate's
   * leader: they move between the gates, which is exactly why the role belongs
   * to the person rather than to a post.
   */
  for (const [name, role] of [
    ['علي الزبيدي', 'TEAM_LEADER'],
    ['مرتضى الخفاجي', 'ASSISTANT_TEAM_LEADER'],
    ['فاطمة الحلي', 'SECTION_SUPERVISOR'],
  ] as const) {
    await sql.execute({
      sql: 'UPDATE event_members SET event_role = ? WHERE id = ?',
      args: [role, emIds[name]],
    });
  }

  // Gate leader account is scoped to gate 3 only (spec §3.3).
  await db.insert(eventAccess)
    .values({
      id: newId(),
      eventId: eventAId,
      userId: gateLeaderUserId,
      role: 'GATE_LEADER',
      gateId: gateIds.g3,
    })
    .run();

  /* ---- one earlier reassignment, so the history is not empty ------------ */
  await db.insert(assignmentChanges)
    .values({
      id: newId(),
      assignmentId: assignmentIds['رسول العامري'],
      fromLocation: 'البوابة 2',
      toLocation: 'البوابة 5',
      fromTask: 'ELECTRONIC_SCANNING',
      toTask: 'ELECTRONIC_SCANNING',
      fromArrival: sched('17:00'),
      toArrival: sched('17:00'),
      reason: 'البوابة 5 كانت ناقصة عنصراً بعد اعتذار أحد الأعضاء.',
      changedById: leaderId,
      changedByName: 'أحمد الربيعي',
      createdAt: at('16:42'),
    })
    .run();

  /* ---- attendance ------------------------------------------------------- */
  const late = new Set(['كرار الموسوي', 'أنس الحيالي']);
  const absent = new Set(['باقر السوداني', 'نبأ الأسدي']);
  const excused = new Set(['تبارك القيسي']);

  await db.insert(attendance)
    .values(
      teamA.map((name, i) => {
        const status = late.has(name)
          ? 'LATE'
          : absent.has(name)
            ? 'ABSENT'
            : excused.has(name)
              ? 'EXCUSED'
              : 'PRESENT';
        return {
          id: newId(),
          eventId: eventAId,
          eventMemberId: emIds[name],
          status,
          checkInTime:
            status === 'PRESENT'
              ? clock('16:52', (i % 9) * 2)
              : status === 'LATE'
                ? clock('17:26', (i % 5) * 3)
                : null,
          checkOutTime: null,
          recordedById: leaderId,
          notes:
            status === 'EXCUSED'
              ? 'إجازة مسبقة معتمدة من قائد الفريق.'
              : status === 'ABSENT'
                ? 'لم يصل ولم يُجب على الاتصال.'
                : null,
          createdAt: at('17:00'),
          updatedAt: at('17:30'),
        };
      }),
    )
    .run();

  /* ---- announcements ---------------------------------------------------- */
  await db.insert(announcements)
    .values([
      {
        id: newId(),
        eventId: eventAId,
        title: 'بدء المسح الإلكتروني الساعة 5:30',
        message:
          'يرجى من جميع أعضاء البوابات التأكد من شحن أجهزة المسح وتسجيل الدخول عليها قبل 5:20. أي جهاز لا يعمل يُبلَّغ عنه فوراً عبر صفحة المشاكل.',
        priority: 'IMPORTANT',
        audience: 'EVENT',
        gateId: null,
        workingPointId: null,
        eventMemberId: null,
        createdById: leaderId,
        createdByName: 'أحمد الربيعي',
        expiresAt: null,
        createdAt: at('16:35'),
      },
      {
        id: newId(),
        eventId: eventAId,
        title: 'البوابة 3 تحتاج تعزيزاً',
        message:
          'الكثافة عند البوابة 3 أعلى من المتوقع. أي عضو احتياطي متاح يتوجه إلى البوابة 3 ويُبلغ قائد البوابة حسين.',
        priority: 'URGENT',
        audience: 'EVENT',
        gateId: null,
        workingPointId: null,
        eventMemberId: null,
        createdById: leaderId,
        createdByName: 'أحمد الربيعي',
        expiresAt: null,
        createdAt: at('18:05'),
      },
      {
        id: newId(),
        eventId: eventAId,
        title: 'تعليمات بوابة كبار الشخصيات',
        message:
          'لا يُسمح بالدخول من البوابة 8 إلا ببطاقة الدعوة مع الأسورة الذهبية. عند أي التباس يُحال الضيف إلى نقطة الاستعلامات.',
        priority: 'NORMAL',
        audience: 'GATE',
        gateId: gateIds.g8,
        workingPointId: null,
        eventMemberId: null,
        createdById: leaderId,
        createdByName: 'أحمد الربيعي',
        expiresAt: null,
        createdAt: at('17:10'),
      },
      {
        id: newId(),
        eventId: eventAId,
        title: 'تغذية الفريق',
        message: 'وجبة الفريق متوفرة في غرفة الطاقم خلف البوابة 7 من 6:00 حتى 6:45.',
        priority: 'NORMAL',
        audience: 'EVENT',
        gateId: null,
        workingPointId: null,
        eventMemberId: null,
        createdById: adminId,
        createdByName: 'مشرف العمليات',
        expiresAt: at('20:00'),
        createdAt: at('17:45'),
      },
    ])
    .run();

  /* ---- issues ----------------------------------------------------------- */
  await db.insert(issues)
    .values([
      {
        id: newId(),
        eventId: eventAId,
        type: 'CROWD_CONGESTION',
        description:
          'ازدحام شديد على مدخل البوابة 3، الصف امتد إلى الطريق الدائري ويحتاج توجيهاً إضافياً.',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        gateId: gateIds.g3,
        workingPointId: null,
        reportedByMemberId: emIds['حسين الجبوري'],
        reportedByUserId: null,
        reporterName: 'حسين الجبوري',
        acknowledgedAt: at('18:02'),
        resolvedAt: null,
        resolvedById: null,
        resolutionNote: null,
        createdAt: at('17:58'),
        updatedAt: at('18:02'),
      },
      {
        id: newId(),
        eventId: eventAId,
        type: 'SCANNER',
        description: 'جهاز المسح الثاني في البوابة 1 يفصل عن الشبكة كل بضع دقائق.',
        priority: 'MEDIUM',
        status: 'RESOLVED',
        gateId: gateIds.g1,
        workingPointId: null,
        reportedByMemberId: emIds['محمد العبيدي'],
        reportedByUserId: null,
        reporterName: 'محمد العبيدي',
        acknowledgedAt: at('17:22'),
        resolvedAt: at('17:41'),
        resolvedById: leaderId,
        resolutionNote: 'تم استبدال الجهاز بجهاز احتياطي من منطقة المسح.',
        createdAt: at('17:18'),
        updatedAt: at('17:41'),
      },
      {
        id: newId(),
        eventId: eventAId,
        type: 'MISSING_STAFF',
        description: 'البوابة 6 تعمل بعنصرين فقط والمطلوب ثلاثة.',
        priority: 'MEDIUM',
        status: 'OPEN',
        gateId: gateIds.g6,
        workingPointId: null,
        reportedByMemberId: emIds['طه المشهداني'],
        reportedByUserId: null,
        reporterName: 'طه المشهداني',
        acknowledgedAt: null,
        resolvedAt: null,
        resolvedById: null,
        resolutionNote: null,
        createdAt: at('18:12'),
        updatedAt: at('18:12'),
      },
    ])
    .run();

  /* ---- timeline --------------------------------------------------------- */
  const timeline: Array<[string, string, string, string]> = [
    [sched('17:00'), 'وصول الفريق', 'تجمّع الفريق عند غرفة الطاقم خلف البوابة 7.', 'COMPLETED'],
    [sched('17:15'), 'إحاطة الفريق', 'توزيع الأجهزة والأساور ومراجعة التكليفات.', 'COMPLETED'],
    [sched('17:30'), 'تجهيز البوابات', 'فتح الحواجز وتشغيل أجهزة المسح واختبار الشبكة.', 'COMPLETED'],
    [sched('18:00'), 'بدء المسح الإلكتروني', 'فتح البوابات الجماهيرية أمام الحضور.', 'ACTIVE'],
    [sched('19:00'), 'ذروة الدخول المتوقعة', 'تعزيز التوجيه على البوابات 1 و3.', 'UPCOMING'],
    [sched('19:30'), 'انطلاق المباراة', 'إبقاء عنصرين على كل بوابة بعد الانطلاق.', 'UPCOMING'],
    [sched('21:45'), 'إغلاق البوابات', 'إغلاق البوابات الجماهيرية وتأمين مسارات الخروج.', 'UPCOMING'],
    [sched('22:30'), 'انصراف الفريق', 'تسليم الأجهزة وتسجيل الانصراف.', 'UPCOMING'],
  ];
  await db.insert(timelineItems)
    .values(
      timeline.map(([time, title, description, status], i) => ({
        id: newId(),
        eventId: eventAId,
        title,
        description,
        scheduledTime: time,
        status,
        sortOrder: i,
      })),
    )
    .run();

  /* ---- map markers ------------------------------------------------------ */
  const markerRows = [
    ...gateSpecs.map((g) => ({
      id: newId(),
      eventId: eventAId,
      type: g.type === 'VIP' ? 'VIP_ENTRANCE' : g.type === 'STAFF' ? 'STAFF_ENTRANCE' : 'GATE',
      name: g.name,
      description: g.description,
      x: g.x,
      y: g.y,
      gateId: gateIds[g.key],
      workingPointId: null,
      eventMemberId: null,
    })),
    ...wpSpecs.map((w) => ({
      id: newId(),
      eventId: eventAId,
      type:
        w.type === 'SCANNER_AREA'
          ? 'SCANNER'
          : w.type === 'WRISTBAND_AREA'
            ? 'WRISTBAND'
            : w.type === 'INFORMATION'
              ? 'INFORMATION'
              : w.type === 'EMERGENCY'
                ? 'EMERGENCY'
                : w.type === 'PLAYER_ENTRANCE'
                  ? 'PLAYER_ENTRANCE'
                  : 'WORKING_POINT',
      name: w.name,
      description: w.description,
      x: w.x,
      y: w.y,
      gateId: null,
      workingPointId: wpIds[w.key],
      eventMemberId: null,
    })),
    {
      id: newId(),
      eventId: eventAId,
      type: 'TEAM_LEADER',
      name: 'مركز قيادة العمليات',
      description: 'موقع قائد الفريق أحمد الربيعي أثناء التشغيل.',
      x: 0.83,
      y: 0.79,
      gateId: null,
      workingPointId: wpIds.info,
      eventMemberId: emIds['أحمد الربيعي'],
    },
  ];
  await db.insert(mapMarkers).values(markerRows).run();

  /* ---- audit ------------------------------------------------------------ */
  await db.insert(auditLogs)
    .values([
      {
        id: newId(),
        eventId: eventAId,
        actorId: adminId,
        actorName: 'مشرف العمليات',
        action: 'CREATE',
        entity: 'EVENT',
        entityId: eventAId,
        entityLabel: 'الزوراء × الشرطة',
        oldValues: null,
        newValues: JSON.stringify({ status: 'DRAFT' }),
        reason: null,
        summary: 'أُنشئت الفعالية «الزوراء × الشرطة»',
        createdAt: at('09:00', -60 * 24 * 6),
      },
      {
        id: newId(),
        eventId: eventAId,
        actorId: leaderId,
        actorName: 'أحمد الربيعي',
        action: 'ASSIGN',
        entity: 'ASSIGNMENT',
        entityId: null,
        entityLabel: null,
        oldValues: null,
        newValues: JSON.stringify({ count: plan.length }),
        reason: null,
        summary: `اعتُمد توزيع ${plan.length} عضواً على البوابات ونقاط العمل`,
        createdAt: at('09:00', -60 * 24 * 2),
      },
      {
        id: newId(),
        eventId: eventAId,
        actorId: leaderId,
        actorName: 'أحمد الربيعي',
        action: 'REASSIGN',
        entity: 'ASSIGNMENT',
        entityId: assignmentIds['رسول العامري'],
        entityLabel: 'رسول العامري',
        oldValues: JSON.stringify({ location: 'البوابة 2' }),
        newValues: JSON.stringify({ location: 'البوابة 5' }),
        reason: 'البوابة 5 كانت ناقصة عنصراً بعد اعتذار أحد الأعضاء.',
        summary: 'نُقل رسول العامري من البوابة 2 إلى البوابة 5',
        createdAt: at('16:42'),
      },
      {
        id: newId(),
        eventId: eventAId,
        actorId: leaderId,
        actorName: 'أحمد الربيعي',
        action: 'STATUS_CHANGE',
        entity: 'EVENT',
        entityId: eventAId,
        entityLabel: 'الزوراء × الشرطة',
        oldValues: JSON.stringify({ status: 'READY' }),
        newValues: JSON.stringify({ status: 'LIVE' }),
        reason: null,
        summary: 'انتقلت الفعالية إلى حالة «جارية»',
        createdAt: at('17:20'),
      },
      {
        id: newId(),
        eventId: eventAId,
        actorId: leaderId,
        actorName: 'أحمد الربيعي',
        action: 'ANNOUNCE',
        entity: 'ANNOUNCEMENT',
        entityId: null,
        entityLabel: 'البوابة 3 تحتاج تعزيزاً',
        oldValues: null,
        newValues: JSON.stringify({ priority: 'URGENT' }),
        reason: null,
        summary: 'نُشر إعلان عاجل: البوابة 3 تحتاج تعزيزاً',
        createdAt: at('18:05'),
      },
    ])
    .run();

  /* ====================================================================== */
  /* EVENT B — concert in PLANNING                                           */
  /* ====================================================================== */
  console.log('› event: حفل…');
  const eventBId = newId();
  await db.insert(events)
    .values({
      id: eventBId,
      name: 'حفل الافتتاح — مهرجان بغداد للموسيقى',
      type: 'CONCERT',
      venueId: arenaVenueId,
      date: addDays(19),
      startTime: '20:00',
      teamArrivalTime: '17:30',
      teamDepartureTime: '23:30',
      description: 'ليلة الافتتاح، 4,200 تذكرة مباعة حتى الآن. الدخول بأسورة إلزامية.',
      status: 'PLANNING',
      mapImageUrl: null,
      reportNotes: null,
      createdById: adminId,
      createdAt: at('10:00', -60 * 24 * 2),
      updatedAt: at('10:00', -60 * 24 * 2),
    })
    .run();

  await db.insert(eventAccess)
    .values({
      id: newId(),
      eventId: eventBId,
      userId: leader2Id,
      role: 'TEAM_LEADER',
      gateId: null,
    })
    .run();

  const bGateIds: string[] = [];
  await db.insert(gates)
    .values(
      [
        { name: 'المدخل الرئيسي', type: 'GENERAL', required: 5 },
        { name: 'مدخل الشرفة', type: 'GENERAL', required: 3 },
        { name: 'مدخل كبار الشخصيات', type: 'VIP', required: 3 },
        { name: 'مدخل الفنانين', type: 'PLAYERS', required: 2 },
      ].map((g, i) => {
        const id = newId();
        bGateIds.push(id);
        return {
          id,
          eventId: eventBId,
          name: g.name,
          type: g.type,
          description: null,
          capacity: null,
          requiredStaff: g.required,
          status: 'INACTIVE',
          gateLeaderId: null,
          sortOrder: i,
        };
      }),
    )
    .run();

  const teamB = [
    'إبراهيم الزيدي',
    'قاسم البهادلي',
    'نور الهدى الصفار',
    'إسراء الحسيني',
    'عثمان الراوي',
    'جعفر الصائغ',
    'براء الدراجي',
    'مهند اللامي',
    'دعاء الخزرجي',
    'شهد العقابي',
  ];
  const bEmIds: Record<string, string> = {};
  await db.insert(eventMembers)
    .values(
      teamB.map((name) => {
        const id = newId();
        bEmIds[name] = id;
        return {
          id,
          eventId: eventBId,
          teamMemberId: byName(name).id,
          status: 'INVITED',
          token: newMemberToken(),
          tokenExpiresAt: null,
          isReserve: false,
        };
      }),
    )
    .run();

  await db.insert(assignments)
    .values(
      teamB.slice(0, 6).map((name, i) => ({
        id: newId(),
        eventId: eventBId,
        eventMemberId: bEmIds[name],
        gateId: bGateIds[i < 4 ? 0 : 1],
        workingPointId: null,
        task: i === 0 ? 'GATE_MANAGEMENT' : 'WRISTBAND_DISTRIBUTION',
        arrivalTime: '17:30',
        shiftStart: '17:30',
        shiftEnd: '23:30',
        isGateLeader: i === 0,
        notes: null,
        status: 'ASSIGNED',
        createdById: leader2Id,
        updatedById: null,
      })),
    )
    .run();

  await db.insert(auditLogs)
    .values({
      id: newId(),
      eventId: eventBId,
      actorId: adminId,
      actorName: 'مشرف العمليات',
      action: 'CREATE',
      entity: 'EVENT',
      entityId: eventBId,
      entityLabel: 'حفل الافتتاح — مهرجان بغداد للموسيقى',
      oldValues: null,
      newValues: JSON.stringify({ status: 'DRAFT' }),
      reason: null,
      summary: 'أُنشئت الفعالية «حفل الافتتاح — مهرجان بغداد للموسيقى»',
      createdAt: at('10:00', -60 * 24 * 2),
    })
    .run();

  /* ====================================================================== */
  /* EVENT C — completed exhibition (gives the report something to show)     */
  /* ====================================================================== */
  console.log('› event: معرض…');
  const eventCId = newId();
  await db.insert(events)
    .values({
      id: eventCId,
      name: 'معرض بغداد الدولي للكتاب — اليوم الختامي',
      type: 'EXHIBITION',
      venueId: fairVenueId,
      date: addDays(-14),
      startTime: '10:00',
      teamArrivalTime: '08:30',
      teamDepartureTime: '16:00',
      description: 'اليوم الأخير من المعرض، الدخول مجاني مع تسجيل عند البوابة.',
      status: 'COMPLETED',
      mapImageUrl: null,
      reportNotes:
        'يوم هادئ. الذروة بين 5 و7 مساءً. يُنصح بزيادة عنصر واحد على بوابة القاعة أ في النسخة القادمة.',
      createdById: adminId,
      createdAt: at('08:00', -60 * 24 * 20),
      updatedAt: at('20:00', -60 * 24 * 14),
    })
    .run();

  await db.insert(eventAccess)
    .values({
      id: newId(),
      eventId: eventCId,
      userId: leaderId,
      role: 'TEAM_LEADER',
      gateId: null,
    })
    .run();

  const cGateIds: string[] = [];
  await db.insert(gates)
    .values(
      [
        { name: 'بوابة القاعة أ', required: 3 },
        { name: 'بوابة القاعة ب', required: 3 },
        { name: 'البوابة الخارجية', required: 2 },
      ].map((g, i) => {
        const id = newId();
        cGateIds.push(id);
        return {
          id,
          eventId: eventCId,
          name: g.name,
          type: 'GENERAL',
          description: null,
          capacity: null,
          requiredStaff: g.required,
          status: 'CLOSED',
          gateLeaderId: null,
          sortOrder: i,
        };
      }),
    )
    .run();

  const teamC = [
    'أمير عبد الله',
    'زينب الشمري',
    'مريم الطائي',
    'حسن الساعدي',
    'علي الزبيدي',
    'رغد العزاوي',
    'هبة الجنابي',
    'آية الركابي',
  ];
  const cEmIds: Record<string, string> = {};
  await db.insert(eventMembers)
    .values(
      teamC.map((name) => {
        const id = newId();
        cEmIds[name] = id;
        return {
          id,
          eventId: eventCId,
          teamMemberId: byName(name).id,
          status: 'ACTIVE',
          token: newMemberToken(),
          tokenExpiresAt: null,
          isReserve: false,
        };
      }),
    )
    .run();

  await db.insert(assignments)
    .values(
      teamC.map((name, i) => ({
        id: newId(),
        eventId: eventCId,
        eventMemberId: cEmIds[name],
        gateId: cGateIds[i % 3],
        workingPointId: null,
        task: i % 3 === 0 ? 'GATE_MANAGEMENT' : 'INFORMATION',
        arrivalTime: '08:30',
        shiftStart: '08:30',
        shiftEnd: '20:00',
        isGateLeader: i < 3,
        notes: null,
        status: 'ASSIGNED',
        createdById: leaderId,
        updatedById: null,
      })),
    )
    .run();

  // The exhibition is the finished event the report is read from, so its team
  // carries a full history: everyone was briefed the day before.
  for (const name of teamC) {
    await db
      .update(eventMembers)
      .set({ notifiedAt: at('18:00', -60 * 24 * 15), notifiedById: leaderId })
      .where(eq(eventMembers.id, cEmIds[name]));
  }

  await db.insert(attendance)
    .values(
      teamC.map((name, i) => ({
        id: newId(),
        eventId: eventCId,
        eventMemberId: cEmIds[name],
        status: i === 5 ? 'LATE' : 'PRESENT',
        checkInAt: at('08:20', i * 4 - 60 * 24 * 14),
        checkOutAt: at('20:05', -60 * 24 * 14),
        recordedById: leaderId,
        notes: null,
      })),
    )
    .run();

  await db.insert(auditLogs)
    .values({
      id: newId(),
      eventId: eventCId,
      actorId: leaderId,
      actorName: 'أحمد الربيعي',
      action: 'STATUS_CHANGE',
      entity: 'EVENT',
      entityId: eventCId,
      entityLabel: 'معرض بغداد الدولي للكتاب — اليوم الختامي',
      oldValues: JSON.stringify({ status: 'LIVE' }),
      newValues: JSON.stringify({ status: 'COMPLETED' }),
      reason: null,
      summary: 'انتهت الفعالية «معرض بغداد الدولي للكتاب — اليوم الختامي»',
      createdAt: at('20:00', -60 * 24 * 14),
    })
    .run();

  /* ---- done ------------------------------------------------------------- */
  const amirToken = (
    await sql.execute({
      sql: 'SELECT token FROM event_members WHERE id = ?',
      args: [emIds['أمير عبد الله']],
    })
  ).rows[0] as unknown as { token: string };

  return {
    adminUsername: process.env.SEED_ADMIN_USERNAME ?? 'admin',
    adminPassword,
    leaderUsername: process.env.SEED_LEADER_USERNAME ?? 'ahmed',
    leaderPassword,
    gatePassword,
    memberToken: amirToken.token,
  };
}
