/**
 * الزوراء × الكهرباء — the gate plan as the supervisor issued it.
 *
 * Transcribed from the printed distribution board, one entry per person, in the
 * board's own grouping: every gate and working point, the job each group does,
 * and who is on it. People are named by their roster code rather than their
 * name, so a rename in roster.ts can never silently move someone to another
 * gate — and a code that no longer exists stops the import with an error
 * instead of quietly dropping a person from the plan.
 *
 * The comment beside each code is the name on the board, kept so this file can
 * be checked against the paper it came from.
 */
import type { GateType, Task, WorkingPointType } from '@/lib/constants';

export const LIVE_VENUE = {
  name: 'ملعب نادي الزوراء',
  address: 'بغداد — الأعظمية',
  description: 'ملعب نادي الزوراء، مقر مباريات الفريق.',
  /** The photo the plan is drawn on; markers are placed over it in the app. */
  mapImageUrl: '/maps/al-zawraa-stadium-satellite.jpg',
  /** The supervisor's own map link, and the point it resolves to. */
  locationUrl: 'https://maps.app.goo.gl/Tezq8omTjdxU4iNe8',
  latitude: 33.344212,
  longitude: 44.368172,
};

export const LIVE_EVENT = {
  name: 'الزوراء × الكهرباء',
  type: 'FOOTBALL_MATCH' as const,
  status: 'READY' as const,
  date: '2026-09-06',
  startTime: '19:30',
  teamArrivalTime: '17:30',
  shiftEnd: '22:30',
  description: 'مباراة الدوري بين الزوراء والكهرباء على ملعب نادي الزوراء.',
};

export type PlanTeam = { task: Task; codes: string[] };

export type PlanLocation = {
  kind: 'GATE' | 'POINT';
  name: string;
  gateType?: GateType;
  pointType?: WorkingPointType;
  sortOrder: number;
  /** What the board asked for — the app compares it against what is assigned. */
  requiredStaff: number;
  teams: PlanTeam[];
};

export const LIVE_PLAN: PlanLocation[] = [
  {
    kind: 'GATE',
    name: 'بوابة رقم 1',
    gateType: 'GENERAL',
    sortOrder: 1,
    requiredStaff: 8,
    teams: [
      {
        task: 'INFORMATION',
        codes: [
        'TZ-049', // Abdallah Rasheed
        'TZ-051', // Ahmed Musa
        'TZ-056', // Ahmed Sataar
        'TZ-041', // Hassan Ali
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-016', // Jafar Abd
        'TZ-017', // Karar Ammar
        'TZ-053', // Mustafa Ibrahim
        'TZ-026', // Mustafa Mohammed
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة رقم 2',
    gateType: 'GENERAL',
    sortOrder: 2,
    requiredStaff: 6,
    teams: [
      {
        task: 'INFORMATION',
        codes: [
        'TZ-038', // Azad Qadir
        'TZ-043', // Haider Kataa
        'TZ-033', // Mohammed Rabah
        'TZ-036', // Mustafa Hassan
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-046', // Murtadha Mohammed
        'TZ-054', // Yousif Razzaq
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة رقم 3',
    gateType: 'GENERAL',
    sortOrder: 3,
    requiredStaff: 8,
    teams: [
      {
        task: 'INFORMATION',
        codes: [
        'TZ-004', // Adeeb Gahreeb
        'TZ-047', // Ameer Dawood
        'TZ-008', // Ameer Rifaat
        'TZ-021', // Mohammed Raad
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-068', // Ali Qassim
        'TZ-042', // Suhaib Qadir
        'TZ-030', // Thamer Abbas
        'TZ-057', // Yousif Raad
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة رقم 4',
    gateType: 'GENERAL',
    sortOrder: 4,
    requiredStaff: 8,
    teams: [
      {
        task: 'INFORMATION',
        codes: [
        'TZ-050', // Ahmed Waei
        'TZ-040', // Hussein Ali
        'TZ-052', // Ibrahim Ali
        'TZ-022', // Montather Salim
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-003', // Abduallah Muhammed
        'TZ-035', // Haider Hafez
        'TZ-061', // Mohammed Abbas
        'TZ-045', // Mujtaba Mohammed
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة VIP',
    gateType: 'VIP',
    sortOrder: 5,
    requiredStaff: 6,
    teams: [
      {
        task: 'VIP_MANAGEMENT',
        codes: [
        'TZ-006', // Ali Abdulhassan
        'TZ-044', // Yousif Ali
        ],
      },
      {
        task: 'INFORMATION',
        codes: [
        'TZ-018', // Mohammed Ayad
        'TZ-032', // Ziyad Tariq
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-002', // Abdalrhman Aysar
        'TZ-012', // Hasaneen Ali
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة الخصم',
    gateType: 'GENERAL',
    sortOrder: 6,
    requiredStaff: 2,
    teams: [
      {
        task: 'INFORMATION',
        codes: [
        'TZ-055', // Muqtada Riyadh
        ],
      },
      {
        task: 'ELECTRONIC_SCANNING',
        codes: [
        'TZ-010', // Bashar Muhammed
        ],
      },
    ],
  },
  {
    kind: 'GATE',
    name: 'بوابة Season',
    gateType: 'GENERAL',
    sortOrder: 7,
    requiredStaff: 4,
    teams: [
      {
        task: 'GATE_MANAGEMENT',
        codes: [
        'TZ-034', // Abdallah Omer
        'TZ-058', // Haitham Omer
        'TZ-065', // Jafar Dhiaa
        'TZ-019', // Mohammed Firas
        ],
      },
    ],
  },
  {
    kind: 'POINT',
    name: 'المبيعات',
    pointType: 'OTHER',
    sortOrder: 8,
    requiredStaff: 2,
    teams: [
      {
        task: 'PAPER_TICKETS',
        codes: [
        'TZ-009', // Baraa Talib
        'TZ-039', // Mohammed Matrood
        ],
      },
    ],
  },
  {
    kind: 'POINT',
    name: 'بوابة VAR',
    pointType: 'TECHNICAL',
    sortOrder: 9,
    requiredStaff: 2,
    teams: [
      {
        task: 'TECHNICAL_SUPPORT',
        codes: [
        'TZ-074', // Hassan Qassim
        'TZ-037', // Kadhim Ismail
        ],
      },
    ],
  },
  {
    kind: 'POINT',
    name: 'قسم SUP VR',
    pointType: 'TECHNICAL',
    sortOrder: 10,
    requiredStaff: 2,
    teams: [
      {
        task: 'TECHNICAL_SUPPORT',
        codes: [
        'TZ-020', // Mohammed Noman
        'TZ-025', // Mustafa Asaad
        ],
      },
    ],
  },
];
