/**
 * Operations Management — database schema
 * ---------------------------------------------------------------------------
 * Data model rule (spec §45): identity, person, event participation and
 * operational assignment are four separate tables and must never be merged.
 *
 *   users          -> authentication + permissions
 *   team_members   -> a person who works events (reusable across events)
 *   event_members  -> that person participating in ONE event (+ secure token)
 *   assignments    -> that participation's location + task + time
 *
 * Portability: only `sqliteTable`, `text`, `integer` and `real` are used, all
 * of which have direct PostgreSQL equivalents. Times are stored as "HH:mm"
 * strings and calendar days as "YYYY-MM-DD" so no timezone conversion can ever
 * corrupt an arrival time. See docs/POSTGRES_MIGRATION.md.
 */
import { sql, relations } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch() * 1000)`;

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(now),
};

/* -------------------------------------------------------------------------- */
/* Identity & access                                                          */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email'),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** ADMIN | TEAM_LEADER | GATE_LEADER */
    role: text('role').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /** A Gate Leader account is backed by a real field person. */
    teamMemberId: text('team_member_id').references(() => teamMembers.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_username_unique').on(t.username),
    index('users_role_idx').on(t.role),
  ],
);

/**
 * Explicit grant of one event to one non-admin user. Without a row here a Team
 * Leader cannot reach the event at all (spec §3.2). `gateId` narrows a Gate
 * Leader to a single gate (spec §3.3).
 */
export const eventAccess = sqliteTable(
  'event_access',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** TEAM_LEADER | GATE_LEADER */
    role: text('role').notNull(),
    gateId: text('gate_id'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('event_access_user_idx').on(t.userId),
    index('event_access_event_idx').on(t.eventId),
  ],
);

/* -------------------------------------------------------------------------- */
/* People & places (reusable across events)                                   */
/* -------------------------------------------------------------------------- */

export const teamMembers = sqliteTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    employeeCode: text('employee_code').notNull(),
    /**
     * The Super Key card they carry.
     *
     * It belongs to the ticketing system, not to this one: a supervisor at a
     * gate reads it off the card in someone's hand to tie the person in front
     * of him to the account scanning tickets. Optional, because not everyone
     * has been issued one and a missing card is no reason to be unable to add
     * a man to tomorrow's event.
     */
    cardNumber: text('card_number'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /**
     * On the company's payroll, not on this one.
     *
     * A few people work the events on a monthly contract: they are on the
     * team, they stand at a gate, they are counted in the staffing and they
     * answer the questionnaire — but what they are owed is settled elsewhere
     * and has nothing to do with this system. The distinction matters because
     * the alternative is a zero next to their name, and a zero reads as an
     * unpaid debt rather than as "not our column".
     */
    salaried: integer('salaried', { mode: 'boolean' }).notNull().default(false),
    /**
     * What this person is paid for one event, in dinars.
     *
     * Set once on the person rather than argued about per event: most of the
     * team are on the standard rate, a few are on a higher one by agreement,
     * and the supervisor's answer to "how much does he get" should be in one
     * place and change in one place. Null means "whatever this event pays",
     * which is the right answer for somebody new until a rate is agreed.
     *
     * It is copied onto each event membership when they are invited, so the
     * figure a closed event was settled at stays what it was settled at.
     */
    defaultPay: real('default_pay'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('team_members_code_unique').on(t.employeeCode),
    index('team_members_active_idx').on(t.active),
  ],
);

export const venues = sqliteTable('venues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  description: text('description'),
  mapImageUrl: text('map_image_url'),
  /**
   * Where the place actually is, for the briefing a member receives on their
   * phone. Either a link someone pasted (Google Maps, and anything else that
   * opens in a maps app) or coordinates captured from a device standing there —
   * the second is what a venue with no address on any map needs.
   */
  locationUrl: text('location_url'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** FOOTBALL_MATCH | CONCERT | FESTIVAL | EXHIBITION | CONFERENCE | PROMOTIONAL | OTHER */
    type: text('type').notNull(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'restrict' }),
    /** "YYYY-MM-DD" — a calendar day, deliberately timezone-free. */
    date: text('date').notNull(),
    /** "HH:mm" */
    startTime: text('start_time').notNull(),
    /** "HH:mm" — when the field team must be on site. */
    teamArrivalTime: text('team_arrival_time').notNull(),
    /**
     * When the team stands down, as "HH:mm".
     *
     * Together with the arrival time this is the shift the whole team works,
     * set once when the event is created. Every assignment starts from these
     * two, so adding the forty-eighth person asks nothing about hours; only
     * somebody whose hours genuinely differ carries their own.
     *
     * Null on events created before this existed — those keep whatever their
     * assignments already say.
     */
    teamDepartureTime: text('team_departure_time'),
    description: text('description'),
    /** DRAFT | PLANNING | READY | LIVE | COMPLETED | ARCHIVED */
    status: text('status').notNull().default('DRAFT'),
    /** Per-event map override; falls back to the venue map. */
    mapImageUrl: text('map_image_url'),
    reportNotes: text('report_notes'),
    /**
     * Work days this event is worth to someone who worked it — the baseline
     * every member starts from, which an individual can be moved off. One day
     * is the ordinary case; an event whose team sets up the hall the day
     * before is worth two to the people who did that, and they carry the
     * difference on their own row, not here.
     */
    creditDaysDefault: real('credit_days_default').notNull().default(1),
    /**
     * What this event pays one promoter, in Iraqi dinars — the baseline every
     * member starts from, which an individual can be moved off.
     *
     * This replaces `credit_days_default` above: the company pays per event,
     * not per day, so the figure that matters at the end of a month is a sum
     * of money rather than a count of days. The old column is left in place
     * because migrations here only ever add, never drop, and because the day
     * figures already recorded against past events are the only record of
     * what those events were reckoned at; nothing reads it any more.
     */
    payDefault: real('pay_default').notNull().default(30000),
    /**
     * How long someone has to answer an invitation to THIS event, in hours.
     *
     * Per event because the answer depends on the event: a fortnight's notice
     * for a league match, four hours for a concert that was moved. Null
     * follows the house default.
     */
    responseWindowHours: integer('response_window_hours'),
    /**
     * When the board stopped being a draft.
     *
     * A supervisor builds a distribution over days: he drags a man onto a
     * gate, moves him off at midnight, swaps two sections in the morning. If
     * every drag reached the promoters' phones, each of them would be told
     * three times where to stand and twice that it changed — and the one who
     * acted on the first message is at the wrong gate. So the board is a
     * draft until somebody says it is ready, and only then does a promoter
     * see his place.
     *
     * Null means draft, which is also what every event created before this
     * column existed reads as — the safe side: nothing is published by
     * accident, and the supervisor publishes it himself.
     */
    boardPublishedAt: integer('board_published_at', { mode: 'timestamp_ms' }),
    boardPublishedById: text('board_published_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * Opens the read-only distribution sheet to anyone holding the link.
     *
     * The sheet is the printed gate roster in web form: names, gates and
     * tasks — the same thing that gets taped to the wall at the venue. It
     * carries no phone numbers and no personal member links, and the token
     * can be rotated at any time, which revokes every copy of the old link.
     */
    boardToken: text('board_token'),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [index('events_status_idx').on(t.status), index('events_date_idx').on(t.date)],
);

/**
 * Participation of a team member in one event, carrying the secure personal
 * token used by the passwordless member portal (spec §3.4 / §12).
 */
export const eventMembers = sqliteTable(
  'event_members',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    teamMemberId: text('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'restrict' }),
    /** INVITED | CONFIRMED | ACTIVE | CANCELLED */
    status: text('status').notNull().default('INVITED'),
    /** 32 random hex chars from crypto.randomBytes — never derived from an id. */
    token: text('token').notNull(),
    tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp_ms' }),
    /** Reserve members are on the team but excluded from gate staffing counts. */
    isReserve: integer('is_reserve', { mode: 'boolean' }).notNull().default(false),
    /**
     * What this event is worth to THIS person, when it is not the event's
     * default: two days for someone who came the day before to lay out the
     * seating, half a day for someone who covered part of a shift. Null means
     * "the ordinary case" and follows the event — so raising an event's
     * default later still moves everyone who was never singled out.
     *
     * Absence is handled by the rule, not by this column: see
     * src/server/services/credit.ts.
     */
    creditDays: real('credit_days'),
    /**
     * What this event pays THIS person, when it is not the event's default.
     * Null — the ordinary case — follows the event, so raising an event's
     * figure later still moves everyone who was never singled out, and the
     * handful of people on their own rate keep it.
     *
     * Absence is handled by the rule, not by this column: see
     * src/server/services/credit.ts.
     */
    payAmount: real('pay_amount'),
    /** Why this person is off the default — it appears in the payroll report. */
    creditNote: text('credit_note'),
    /**
     * TEAM_LEADER | ASSISTANT_TEAM_LEADER | GATE_LEADER | SECTION_SUPERVISOR.
     *
     * Null — the ordinary case — is an ordinary member, so nothing has to be
     * filled in for the great majority of a roster. It lives here rather than
     * on the assignment because it describes the person's standing in this
     * event, which survives being moved from one gate to another; a gate
     * leader's gate is simply wherever their assignment puts them.
     *
     * assignments.isGateLeader and gates.gateLeaderId stay in step with the
     * GATE_LEADER value (src/server/actions/board.ts), so every screen that
     * already knew about gate leaders keeps working unchanged.
     */
    eventRole: text('event_role'),
    /**
     * When this person was last sent their briefing, and by whom. Compared
     * against the assignment's own updatedAt so a member who was moved after
     * being told can be flagged — telling someone the wrong gate is worse than
     * telling them nothing.
     */
    /*
     * That this person has answered the questionnaire — never what they
     * answered. The answers live in `feedback_responses`, which carries no
     * member id, so this column is what makes chasing the rest possible
     * without making anyone's answers findable.
     */
    /*
     * How this person is paid for THIS event, stamped when they are added
     * from their standing contract. Kept per event rather than read live off
     * the person, so that someone coming off a monthly contract in March does
     * not make January's closed events suddenly owe him money.
     */
    payMode: text('pay_mode').notNull().default('EVENT'),
    /**
     * The handing-over this person's pay for this event went out in.
     *
     * Null means still owed. It is what makes a balance mean "not yet paid"
     * rather than "ever earned", and it is what stops a rate correction from
     * repricing money that has already left the building.
     */
    payoutId: text('payout_id').references(() => payouts.id, { onDelete: 'set null' }),
    feedbackAt: integer('feedback_at', { mode: 'timestamp_ms' }),
    /* ---- the invitation, and the answer to it ------------------------- */

    /**
     * When an answer stops being useful.
     *
     * Computed once, when the link is sent, and stored — never recomputed on
     * the way in. A deadline that moves every time the page is opened is not
     * a deadline, it is a sliding promise, and the man refreshing at midnight
     * would see eighteen hours left for ever.
     */
    respondBy: integer('respond_by', { mode: 'timestamp_ms' }),
    /** When they said yes. */
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    /** When they said no, and which of the short reasons they picked. */
    declinedAt: integer('declined_at', { mode: 'timestamp_ms' }),
    declineReason: text('decline_reason'),
    notifiedAt: integer('notified_at', { mode: 'timestamp_ms' }),
    notifiedById: text('notified_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('event_members_token_unique').on(t.token),
    uniqueIndex('event_members_event_person_unique').on(t.eventId, t.teamMemberId),
    index('event_members_event_idx').on(t.eventId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Operational locations                                                       */
/* -------------------------------------------------------------------------- */

export const gates = sqliteTable(
  'gates',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** GENERAL | VIP | STAFF | PLAYERS | MEDIA | OTHER */
    type: text('type').notNull().default('GENERAL'),
    description: text('description'),
    capacity: integer('capacity'),
    requiredStaff: integer('required_staff').notNull().default(1),
    /** INACTIVE | READY | ACTIVE | CLOSED */
    status: text('status').notNull().default('INACTIVE'),
    gateLeaderId: text('gate_leader_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * The columns this location is divided into on the distribution board —
     * a JSON array of task codes, e.g. ["ELECTRONIC_SCANNING","INFORMATION"].
     *
     * A gate is not one undifferentiated group of people: it is a scanning
     * line and an information desk, and the supervisor thinks in those
     * columns when handing out names. Null means the location has not been
     * divided yet and falls back to a sensible default for its kind.
     */
    lanes: text('lanes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('gates_event_name_unique').on(t.eventId, t.name),
    index('gates_event_idx').on(t.eventId),
  ],
);

export const workingPoints = sqliteTable(
  'working_points',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SCANNER_AREA | WRISTBAND_AREA | VIP_AREA | INFORMATION | CROWD_GUIDANCE | STAFF_ENTRANCE | PLAYER_ENTRANCE | EMERGENCY | TECHNICAL | OTHER */
    type: text('type').notNull().default('OTHER'),
    description: text('description'),
    requiredStaff: integer('required_staff').notNull().default(1),
    /** INACTIVE | READY | ACTIVE | CLOSED */
    status: text('status').notNull().default('INACTIVE'),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * The columns this location is divided into on the distribution board —
     * a JSON array of task codes, e.g. ["ELECTRONIC_SCANNING","INFORMATION"].
     *
     * A gate is not one undifferentiated group of people: it is a scanning
     * line and an information desk, and the supervisor thinks in those
     * columns when handing out names. Null means the location has not been
     * divided yet and falls back to a sensible default for its kind.
     */
    lanes: text('lanes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('working_points_event_name_unique').on(t.eventId, t.name),
    index('working_points_event_idx').on(t.eventId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Assignments — the core operational object                                   */
/* -------------------------------------------------------------------------- */

export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventMemberId: text('event_member_id')
      .notNull()
      .references(() => eventMembers.id, { onDelete: 'cascade' }),
    /**
     * Exactly one of gateId / workingPointId is set. Enforced in
     * src/server/services/assignments.ts and, on PostgreSQL, by a CHECK
     * constraint (see docs/POSTGRES_MIGRATION.md).
     */
    gateId: text('gate_id').references(() => gates.id, { onDelete: 'restrict' }),
    workingPointId: text('working_point_id').references(() => workingPoints.id, {
      onDelete: 'restrict',
    }),
    /** ELECTRONIC_SCANNING | PAPER_TICKETS | CROWD_GUIDANCE | ... */
    task: text('task').notNull(),
    /** "HH:mm" */
    arrivalTime: text('arrival_time').notNull(),
    shiftStart: text('shift_start').notNull(),
    shiftEnd: text('shift_end').notNull(),
    isGateLeader: integer('is_gate_leader', { mode: 'boolean' })
      .notNull()
      .default(false),
    notes: text('notes'),
    /** ASSIGNED | CONFIRMED | CHANGED | CANCELLED */
    status: text('status').notNull().default('ASSIGNED'),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedById: text('updated_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    index('assignments_event_idx').on(t.eventId),
    index('assignments_member_idx').on(t.eventMemberId),
    index('assignments_gate_idx').on(t.gateId),
    index('assignments_wp_idx').on(t.workingPointId),
    index('assignments_status_idx').on(t.status),
  ],
);

/** Immutable move history: "Amir moved from Gate 4 to Gate 6" (spec §15). */
export const assignmentChanges = sqliteTable(
  'assignment_changes',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    fromLocation: text('from_location'),
    toLocation: text('to_location'),
    fromTask: text('from_task'),
    toTask: text('to_task'),
    fromArrival: text('from_arrival'),
    toArrival: text('to_arrival'),
    reason: text('reason'),
    changedById: text('changed_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changedByName: text('changed_by_name').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('assignment_changes_assignment_idx').on(t.assignmentId)],
);

/* -------------------------------------------------------------------------- */
/* Attendance                                                                  */
/* -------------------------------------------------------------------------- */

export const attendance = sqliteTable(
  'attendance',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventMemberId: text('event_member_id')
      .notNull()
      .references(() => eventMembers.id, { onDelete: 'cascade' }),
    /** PENDING | PRESENT | LATE | ABSENT | EXCUSED */
    status: text('status').notNull().default('PENDING'),
    /**
     * When the person actually arrived and left, as "HH:mm" — the same shape
     * as every other clock value in this schema, and for the same reason: a
     * timestamp is read back through whatever timezone the server happens to
     * run in, so an arrival recorded at 17:05 in Baghdad displayed as 14:05
     * once the app moved to a host running on UTC. A clock string reads back
     * as the clock it was written from.
     *
     * Both are optional and stay editable: the supervisor is often writing
     * down what happened an hour ago, not clocking someone in live.
     */
    checkInTime: text('check_in_time'),
    checkOutTime: text('check_out_time'),
    /**
     * The timestamp columns these replaced. Nothing reads or writes them any
     * more; they stay so that upgrading an existing database is a pure
     * addition — no dropped column, no rewritten table, nothing to lose if an
     * upgrade is interrupted. Drop them in a later release, once no deployment
     * still holds times only in this form.
     */
    legacyCheckInAt: integer('check_in_at', { mode: 'timestamp_ms' }),
    legacyCheckOutAt: integer('check_out_at', { mode: 'timestamp_ms' }),
    /**
     * The moment the person said they had arrived, from their own phone.
     *
     * Kept apart from the supervisor's approval on purpose. One is when he
     * got there; the other is when somebody with a radio got round to looking
     * at his name. Treating the second as the first is how a man who stood at
     * the gate from five o'clock is recorded as arriving at six.
     */
    reportedArrivalAt: integer('reported_arrival_at', { mode: 'timestamp_ms' }),
    /** When a supervisor confirmed it, and who. */
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    approvedById: text('approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** The moment they said they were leaving, same distinction. */
    reportedDepartureAt: integer('reported_departure_at', { mode: 'timestamp_ms' }),
    recordedById: text('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('attendance_member_unique').on(t.eventMemberId),
    index('attendance_event_idx').on(t.eventId),
    index('attendance_status_idx').on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Communication                                                               */
/* -------------------------------------------------------------------------- */

export const announcements = sqliteTable(
  'announcements',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    /** NORMAL | IMPORTANT | URGENT */
    priority: text('priority').notNull().default('NORMAL'),
    /** EVENT | GATE | WORKING_POINT | MEMBER */
    audience: text('audience').notNull().default('EVENT'),
    gateId: text('gate_id').references(() => gates.id, { onDelete: 'cascade' }),
    workingPointId: text('working_point_id').references(() => workingPoints.id, {
      onDelete: 'cascade',
    }),
    eventMemberId: text('event_member_id').references(() => eventMembers.id, {
      onDelete: 'cascade',
    }),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByName: text('created_by_name').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('announcements_event_idx').on(t.eventId),
    index('announcements_priority_idx').on(t.priority),
  ],
);

export const issues = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** SCANNER | CROWD_CONGESTION | MISSING_STAFF | TICKET | WRISTBAND | SECURITY | TECHNICAL | OTHER */
    type: text('type').notNull(),
    description: text('description').notNull(),
    /** LOW | MEDIUM | HIGH | CRITICAL */
    priority: text('priority').notNull().default('MEDIUM'),
    /** OPEN | ACKNOWLEDGED | IN_PROGRESS | RESOLVED | CLOSED */
    status: text('status').notNull().default('OPEN'),
    gateId: text('gate_id').references(() => gates.id, { onDelete: 'set null' }),
    workingPointId: text('working_point_id').references(() => workingPoints.id, {
      onDelete: 'set null',
    }),
    reportedByMemberId: text('reported_by_member_id').references(
      () => eventMembers.id,
      { onDelete: 'set null' },
    ),
    reportedByUserId: text('reported_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reporterName: text('reporter_name').notNull(),
    acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp_ms' }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    resolvedById: text('resolved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),

    /**
     * The id the reporting device gave this report before it ever reached a
     * server.
     *
     * A promoter inside a full stadium has no signal, so a report is written
     * to their own phone first and sent when the network comes back — which
     * means the same report can be sent twice: once by the retry, once by the
     * tap they made again because nothing seemed to happen. The device's id is
     * what lets the server recognise the second one as the first, so it is
     * unique and it is the only thing standing between an operations board and
     * a wall of duplicates.
     */
    clientId: text('client_id'),

    /**
     * Who owns this report RIGHT NOW — not who eventually closed it.
     *
     * The gate's own leader gets it on arrival: they are standing nearest to
     * it and can act without asking anyone. `resolvedById` below records who
     * finished it, which is a different question and often a different person.
     */
    assigneeUserId: text('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: integer('assigned_at', { mode: 'timestamp_ms' }),

    /**
     * When this report becomes late.
     *
     * Set once, at creation, from the priority — a medical call is two
     * minutes and a shortage of wristbands is half an hour, and treating them
     * alike is how a board full of red stops meaning anything. Nothing runs in
     * the background to check it: "late" is computed when somebody looks, which
     * is the only honest thing a server with no scheduler can claim.
     */
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),

    /** When it passed its target unanswered and reached the team leader. */
    escalatedAt: integer('escalated_at', { mode: 'timestamp_ms' }),

    /**
     * The reporter said it is still happening after someone marked it resolved.
     *
     * This is the half of the loop that decides whether anyone reports anything
     * a second time: a promoter who watches a real problem get closed from a
     * desk, and has no way to say so, stops using the system that evening.
     */
    reopenedAt: integer('reopened_at', { mode: 'timestamp_ms' }),
    reopenCount: integer('reopen_count').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    index('issues_event_idx').on(t.eventId),
    index('issues_status_idx').on(t.status),
    index('issues_assignee_idx').on(t.assigneeUserId),
    uniqueIndex('issues_client_id_unique').on(t.clientId),
  ],
);

/* -------------------------------------------------------------------------- */
/* The main-gate detail                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A posting at the venue's own front gate for the hours before the doors of
 * the hall itself open.
 *
 * At a mall venue the audience starts arriving four or five hours early, long
 * before the hall gates are staffed, and they come through the complex's main
 * entrance rather than through any of the event's gates. So a handful of
 * people are pulled forward to stand there — some scanning tickets, some
 * fitting wristbands — and two hours before the show they go back to the posts
 * they are actually assigned to.
 *
 * It is modelled separately from `assignments` for exactly that reason: these
 * people have NOT been moved. Their gate assignment is still theirs, is still
 * what the staffing arithmetic counts and what the printed sheet shows them
 * against; this is an earlier shift on top of it. Writing it as an assignment
 * would make every one of them look like a reassignment and leave their real
 * gate one short.
 *
 * Optional by design: most venues never need one, so an event has no detail
 * until somebody creates it.
 */
export const mainGateDetails = sqliteTable(
  'main_gate_details',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** What the place is called — "البوابة الرئيسية للمجمع" and the like. */
    name: text('name').notNull(),
    /** "HH:mm", like every other clock value here — never a timestamp. */
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [uniqueIndex('main_gate_details_event_unique').on(t.eventId)],
);

export const mainGateMembers = sqliteTable(
  'main_gate_members',
  {
    id: text('id').primaryKey(),
    detailId: text('detail_id')
      .notNull()
      .references(() => mainGateDetails.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventMemberId: text('event_member_id')
      .notNull()
      .references(() => eventMembers.id, { onDelete: 'cascade' }),
    /** Usually ELECTRONIC_SCANNING or WRISTBAND_FITTING — the pair at a gate. */
    task: text('task').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('main_gate_members_unique').on(t.detailId, t.eventMemberId),
    index('main_gate_members_event_idx').on(t.eventId),
  ],
);

/**
 * The crew that sets out the chairs the day before.
 *
 * Most events at a hall are built before they happen: somebody spends the
 * afternoon before putting out rows of seats so that the evening itself can
 * start on time. It is a different day, a different job and a different rate
 * from the event, and until now the system had no idea it existed — the
 * people who did it either went unpaid or were paid on a piece of paper.
 *
 * It is optional: one row per event, and only for the events that need it.
 *
 * The rate is flat and lives here rather than on each person. Everyone on
 * this shift is paid the same for it whatever they earn on the night —
 * including whoever leads them — and keeping one number on the shift is what
 * makes that true by construction instead of by remembering.
 */
export const seatSetupDetails = sqliteTable(
  'seat_setup_details',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** "YYYY-MM-DD" — its own day, usually the one before the event. */
    date: text('date').notNull(),
    /** "HH:mm", like every other clock value here — never a timestamp. */
    startTime: text('start_time').notNull(),
    /**
     * When they expect to finish, which on this shift is a guess: the chairs
     * are done when they are done. Arrival and departure are recorded per
     * person, and neither is held to this.
     */
    endTime: text('end_time'),
    notes: text('notes'),
    /** Flat, for everyone on the shift. 30,000 IQD unless changed. */
    payAmount: real('pay_amount').notNull().default(30000),
    ...timestamps,
  },
  /*
   * Several shifts per event, not one. A hall of six thousand seats is not
   * laid out in an afternoon: the big events are built over two or three
   * days, each of them a day's work and a day's pay for whoever turns up.
   */
  (t) => [index('seat_setup_details_event_idx').on(t.eventId, t.date)],
);

export const seatSetupMembers = sqliteTable(
  'seat_setup_members',
  {
    id: text('id').primaryKey(),
    detailId: text('detail_id')
      .notNull()
      .references(() => seatSetupDetails.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventMemberId: text('event_member_id')
      .notNull()
      .references(() => eventMembers.id, { onDelete: 'cascade' }),
    /*
     * "HH:mm" and both nullable. This shift does not keep to a timetable:
     * people arrive as they can and leave when the room is ready, and a
     * required time would only be a number somebody has to correct later.
     */
    checkInTime: text('check_in_time'),
    checkOutTime: text('check_out_time'),
    /** Whether the day is counted for them. Set when the supervisor says so. */
    attended: integer('attended', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),

    /*
     * The chair day is invited in its own right.
     *
     * It is a different day's work for a different fee, and a man can be free
     * on the Thursday afternoon and busy on the Friday night, or the other way
     * round. So being picked for the crew asks him a question of its own, and
     * his answer to the event's invitation is not an answer to this one.
     */
    notifiedAt: integer('notified_at', { mode: 'timestamp_ms' }),
    respondBy: integer('respond_by', { mode: 'timestamp_ms' }),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    declinedAt: integer('declined_at', { mode: 'timestamp_ms' }),
    declineReason: text('decline_reason'),

    /*
     * And it is attended in its own right, by the same two sentences as the
     * event itself: he says he is here, somebody who can see him says so too.
     * `attended` — the fact that decides the fee — is set by the approval and
     * by nothing he can press himself.
     */
    reportedArrivalAt: integer('reported_arrival_at', { mode: 'timestamp_ms' }),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    approvedById: text('approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reportedDepartureAt: integer('reported_departure_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('seat_setup_members_unique').on(t.detailId, t.eventMemberId),
    index('seat_setup_members_event_idx').on(t.eventId),
  ],
);

/**
 * What an evening cost, beside what it paid.
 *
 * Water for a gate in July, a taxi for somebody sent across town for
 * wristbands, a print run of the distribution sheet — small sums the team
 * leader puts out of his own pocket or the company's, and which until now
 * lived in a note on his phone and were argued about a week later.
 *
 * Deliberately NOT part of anybody's credit. A promoter's pay is a rate times
 * an attendance and nothing else; an expense is the event's cost, not a
 * person's earning, and merging the two would make "what do we owe the team"
 * a figure nobody could check. It is totalled per event and it stays there.
 */
export const eventExpenses = sqliteTable(
  'event_expenses',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** FOOD | TRANSPORT | SUPPLIES | PRINTING | EQUIPMENT | OTHER */
    category: text('category').notNull().default('OTHER'),
    description: text('description').notNull(),
    /** Dinars. */
    amount: real('amount').notNull(),
    /** Who entered it — a cost with no name on it is one nobody answers for. */
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByName: text('created_by_name').notNull(),
    ...timestamps,
  },
  (t) => [index('event_expenses_event_idx').on(t.eventId)],
);

/**
 * What one person's rate has been, and from when.
 *
 * The rate on the person is what the next invitation copies. This is the
 * record of how it got there — and the thing that makes a correction
 * possible: "he has been on fifty since the twelfth" is a different statement
 * from "he is on fifty now", and only the first one can put right an event
 * that was already invited at the old figure.
 *
 * Append-only. A rate that turns out to be wrong is corrected by recording
 * the right one from the right date, never by editing the line that says what
 * everybody believed at the time.
 */
export const memberRates = sqliteTable(
  'member_rates',
  {
    id: text('id').primaryKey(),
    teamMemberId: text('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    /** Dinars for one event. Zero is a real answer: see `salaried`. */
    amount: real('amount').notNull(),
    /** "YYYY-MM-DD" — events from this date on are worth this. */
    effectiveFrom: text('effective_from').notNull(),
    note: text('note'),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByName: text('created_by_name').notNull(),
    ...timestamps,
  },
  (t) => [index('member_rates_member_idx').on(t.teamMemberId, t.effectiveFrom)],
);

/**
 * One handing-over of wages, covering a span of dates.
 *
 * The company does not pay by the month or by the night: several events pile
 * up and are settled together. So "what is owed" is not a sum of everything
 * ever worked — it is the sum of what has not yet been handed over, and that
 * needs a record of each handing-over rather than a date somebody remembers.
 *
 * The span is by event date. An event outside it stays owed and joins the
 * next one by doing nothing at all, which is the behaviour that matters: a
 * man who worked the twentieth when the payout ran to the nineteenth keeps
 * his twentieth.
 */
export const payouts = sqliteTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    /** "YYYY-MM-DD", inclusive at both ends. */
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    /** What it came to, kept as written so a later rate change cannot move it. */
    totalAmount: real('total_amount').notNull(),
    /** How many people it covered. */
    peopleCount: integer('people_count').notNull().default(0),
    note: text('note'),
    createdById: text('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByName: text('created_by_name').notNull(),
    ...timestamps,
  },
  (t) => [index('payouts_range_idx').on(t.fromDate, t.toDate)],
);

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the people who actually worked the event thought of it.
 *
 * The closing report says what happened; this says how it felt to be standing
 * at gate 6 while it happened, which is where the next event's fixes come
 * from. One entry per person per event, written through their own personal
 * link and editable by them until they stop caring — never by a supervisor,
 * because feedback somebody else can rewrite is not feedback.
 *
 * It opens when the event is marked finished: before that the evening is not
 * over and the answer would be a guess.
 */
export const eventFeedback = sqliteTable(
  'event_feedback',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventMemberId: text('event_member_id')
      .notNull()
      .references(() => eventMembers.id, { onDelete: 'cascade' }),
    /** 1–5. The one number that can be averaged across events. */
    rating: integer('rating').notNull(),
    /** What went well, what went wrong, and what to do differently. */
    wentWell: text('went_well'),
    problems: text('problems'),
    suggestions: text('suggestions'),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('event_feedback_member_unique').on(t.eventId, t.eventMemberId),
    index('event_feedback_event_idx').on(t.eventId),
  ],
);

/**
 * The end-of-event questionnaire, kept deliberately apart from the person.
 *
 * There is no member id on this table and there is no way to put one back:
 * the row knows which event it belongs to and nothing else about who wrote
 * it. That is the whole point. The form promises the answers are anonymous,
 * and a promise that holds only as long as nobody opens the database is not
 * one worth making — a supervisor reading "the briefing was useless" should
 * not be able to find out who typed it, and neither should anyone else.
 *
 * Who has answered is tracked on the member row instead (`feedbackAt`), so
 * the chasing-up still works: the list of who has not replied is knowable,
 * what each of them said is not.
 *
 * `role` is the job the writer was doing, and it is recorded ONLY when enough
 * people shared that job to hide in — otherwise "the only person on VIP" is a
 * name written in a different alphabet.
 */
export const feedbackResponses = sqliteTable(
  'feedback_responses',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** The writer's task, or null when too few shared it to be anonymous. */
    role: text('role'),

    /* Before the gates opened. */
    instructionsClear: integer('instructions_clear'),
    knewDuties: text('knew_duties'),
    briefingLength: text('briefing_length'),

    /* How the evening was organised. */
    organisation: integer('organisation'),
    staffing: text('staffing'),
    distributionGood: text('distribution_good'),
    unsureMoments: text('unsure_moments'),
    unsureWhy: text('unsure_why'),

    /* When something went wrong. */
    knewWhoToAsk: text('knew_who_to_ask'),
    supportSpeed: integer('support_speed'),
    problemKind: text('problem_kind'),
    problemPrevention: text('problem_prevention'),

    /* The people who came to the event. */
    guestsInformed: text('guests_informed'),
    guestCommonIssue: text('guest_common_issue'),
    guestImprovement: text('guest_improvement'),

    /* The evening as a whole. */
    overall: integer('overall'),
    keepDoing: text('keep_doing'),
    hardest: text('hardest'),

    /* Next time. */
    workAgain: text('work_again'),
    moreResponsibility: text('more_responsibility'),
    freeNote: text('free_note'),

    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (t) => [index('feedback_responses_event_idx').on(t.eventId)],
);

export const timelineItems = sqliteTable(
  'timeline_items',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** "HH:mm" */
    scheduledTime: text('scheduled_time').notNull(),
    /** UPCOMING | ACTIVE | COMPLETED | CANCELLED */
    status: text('status').notNull().default('UPCOMING'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('timeline_event_idx').on(t.eventId)],
);

/* -------------------------------------------------------------------------- */
/* Map                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Marker positions are NORMALIZED to the map image: x and y are 0..1, so the
 * same coordinates render correctly on a 27" desktop and a 5" phone
 * (spec §7 / §11).
 */
export const mapMarkers = sqliteTable(
  'map_markers',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** GATE | WORKING_POINT | VIP_ENTRANCE | SCANNER | WRISTBAND | TEAM_LEADER | GATE_LEADER | TEAM_MEMBER | INFORMATION | EMERGENCY | STAFF_ENTRANCE | PLAYER_ENTRANCE | OTHER */
    type: text('type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    x: real('x').notNull(),
    y: real('y').notNull(),
    gateId: text('gate_id').references(() => gates.id, { onDelete: 'cascade' }),
    workingPointId: text('working_point_id').references(() => workingPoints.id, {
      onDelete: 'cascade',
    }),
    eventMemberId: text('event_member_id').references(() => eventMembers.id, {
      onDelete: 'cascade',
    }),
    ...timestamps,
  },
  (t) => [index('map_markers_event_idx').on(t.eventId)],
);

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').references(() => events.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    /** CREATE | UPDATE | DELETE | STATUS_CHANGE | ASSIGN | REASSIGN | ATTENDANCE | ANNOUNCE | ISSUE | TOKEN_ROTATE | LOGIN */
    action: text('action').notNull(),
    /** EVENT | VENUE | GATE | WORKING_POINT | TEAM_MEMBER | EVENT_MEMBER | ASSIGNMENT | ATTENDANCE | ANNOUNCEMENT | ISSUE | MAP_MARKER | TIMELINE | USER */
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    entityLabel: text('entity_label'),
    /** Small, human-readable JSON snapshots. */
    oldValues: text('old_values'),
    newValues: text('new_values'),
    reason: text('reason'),
    summary: text('summary').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('audit_event_idx').on(t.eventId),
    index('audit_entity_idx').on(t.entity, t.entityId),
    index('audit_created_idx').on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* 16. Uploaded files                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Map images live here rather than on disk.
 *
 * Two hosts taught this: Next.js indexes `public/` once at boot, so a file
 * written there at runtime 404s until a restart; and a serverless host has no
 * writable disk at all. Images are downscaled before they are stored, so a row
 * stays small and the map loads fast on a stadium connection.
 */
export const uploads = sqliteTable('uploads', {
  /** The file name in the URL: /uploads/<name>. */
  name: text('name').primaryKey(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  uploadedById: text('uploaded_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamps.createdAt,
});

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  teamMember: one(teamMembers, {
    fields: [users.teamMemberId],
    references: [teamMembers.id],
  }),
  access: many(eventAccess),
}));

export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  eventMembers: many(eventMembers),
}));

export const venuesRelations = relations(venues, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  venue: one(venues, { fields: [events.venueId], references: [venues.id] }),
  createdBy: one(users, { fields: [events.createdById], references: [users.id] }),
  members: many(eventMembers),
  gates: many(gates),
  workingPoints: many(workingPoints),
  assignments: many(assignments),
  attendance: many(attendance),
  announcements: many(announcements),
  issues: many(issues),
  timeline: many(timelineItems),
  markers: many(mapMarkers),
  access: many(eventAccess),
}));

export const eventAccessRelations = relations(eventAccess, ({ one }) => ({
  event: one(events, { fields: [eventAccess.eventId], references: [events.id] }),
  user: one(users, { fields: [eventAccess.userId], references: [users.id] }),
  gate: one(gates, { fields: [eventAccess.gateId], references: [gates.id] }),
}));

export const eventMembersRelations = relations(eventMembers, ({ one, many }) => ({
  event: one(events, { fields: [eventMembers.eventId], references: [events.id] }),
  teamMember: one(teamMembers, {
    fields: [eventMembers.teamMemberId],
    references: [teamMembers.id],
  }),
  assignments: many(assignments),
  attendance: one(attendance, {
    fields: [eventMembers.id],
    references: [attendance.eventMemberId],
  }),
}));

export const gatesRelations = relations(gates, ({ one, many }) => ({
  event: one(events, { fields: [gates.eventId], references: [events.id] }),
  gateLeader: one(eventMembers, {
    fields: [gates.gateLeaderId],
    references: [eventMembers.id],
  }),
  assignments: many(assignments),
  markers: many(mapMarkers),
}));

export const workingPointsRelations = relations(workingPoints, ({ one, many }) => ({
  event: one(events, { fields: [workingPoints.eventId], references: [events.id] }),
  assignments: many(assignments),
  markers: many(mapMarkers),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  event: one(events, { fields: [assignments.eventId], references: [events.id] }),
  eventMember: one(eventMembers, {
    fields: [assignments.eventMemberId],
    references: [eventMembers.id],
  }),
  gate: one(gates, { fields: [assignments.gateId], references: [gates.id] }),
  workingPoint: one(workingPoints, {
    fields: [assignments.workingPointId],
    references: [workingPoints.id],
  }),
  changes: many(assignmentChanges),
}));

export const assignmentChangesRelations = relations(assignmentChanges, ({ one }) => ({
  assignment: one(assignments, {
    fields: [assignmentChanges.assignmentId],
    references: [assignments.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  event: one(events, { fields: [attendance.eventId], references: [events.id] }),
  eventMember: one(eventMembers, {
    fields: [attendance.eventMemberId],
    references: [eventMembers.id],
  }),
  recordedBy: one(users, {
    fields: [attendance.recordedById],
    references: [users.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  event: one(events, { fields: [announcements.eventId], references: [events.id] }),
  gate: one(gates, { fields: [announcements.gateId], references: [gates.id] }),
  workingPoint: one(workingPoints, {
    fields: [announcements.workingPointId],
    references: [workingPoints.id],
  }),
  eventMember: one(eventMembers, {
    fields: [announcements.eventMemberId],
    references: [eventMembers.id],
  }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  event: one(events, { fields: [issues.eventId], references: [events.id] }),
  gate: one(gates, { fields: [issues.gateId], references: [gates.id] }),
  workingPoint: one(workingPoints, {
    fields: [issues.workingPointId],
    references: [workingPoints.id],
  }),
  reportedByMember: one(eventMembers, {
    fields: [issues.reportedByMemberId],
    references: [eventMembers.id],
  }),
  resolvedBy: one(users, { fields: [issues.resolvedById], references: [users.id] }),
}));

export const timelineItemsRelations = relations(timelineItems, ({ one }) => ({
  event: one(events, { fields: [timelineItems.eventId], references: [events.id] }),
}));

export const mapMarkersRelations = relations(mapMarkers, ({ one }) => ({
  event: one(events, { fields: [mapMarkers.eventId], references: [events.id] }),
  gate: one(gates, { fields: [mapMarkers.gateId], references: [gates.id] }),
  workingPoint: one(workingPoints, {
    fields: [mapMarkers.workingPointId],
    references: [workingPoints.id],
  }),
  eventMember: one(eventMembers, {
    fields: [mapMarkers.eventMemberId],
    references: [eventMembers.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  event: one(events, { fields: [auditLogs.eventId], references: [events.id] }),
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventMember = typeof eventMembers.$inferSelect;
export type Gate = typeof gates.$inferSelect;
export type WorkingPoint = typeof workingPoints.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentChange = typeof assignmentChanges.$inferSelect;
export type AttendanceRecord = typeof attendance.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type TimelineItem = typeof timelineItems.$inferSelect;
export type MapMarker = typeof mapMarkers.$inferSelect;
export type MainGateDetail = typeof mainGateDetails.$inferSelect;
export type MainGateMember = typeof mainGateMembers.$inferSelect;
export type EventFeedback = typeof eventFeedback.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
