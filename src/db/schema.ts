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
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
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
    description: text('description'),
    /** DRAFT | PLANNING | READY | LIVE | COMPLETED | ARCHIVED */
    status: text('status').notNull().default('DRAFT'),
    /** Per-event map override; falls back to the venue map. */
    mapImageUrl: text('map_image_url'),
    reportNotes: text('report_notes'),
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
     * When this person was last sent their briefing, and by whom. Compared
     * against the assignment's own updatedAt so a member who was moved after
     * being told can be flagged — telling someone the wrong gate is worse than
     * telling them nothing.
     */
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
    checkInAt: integer('check_in_at', { mode: 'timestamp_ms' }),
    checkOutAt: integer('check_out_at', { mode: 'timestamp_ms' }),
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
    ...timestamps,
  },
  (t) => [index('issues_event_idx').on(t.eventId), index('issues_status_idx').on(t.status)],
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
export type AuditLog = typeof auditLogs.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
