import { MARKER_COLORS } from './brand';

/**
 * Authoritative value lists for every "enum" column in the schema.
 * SQLite has no enum type, so these constants + zod validation are what keep
 * the data honest. Labels live in the translation dictionaries, never here.
 */

export const ROLES = ['ADMIN', 'TEAM_LEADER', 'GATE_LEADER'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What a person is on the ground for one event, over and above standing at a
 * post. This is NOT the account role above: a team member has no account, and
 * the person leading the team on match day is frequently not the person who
 * signs in to plan it. Null — the ordinary case — is an ordinary member.
 */
export const EVENT_ROLES = [
  'TEAM_LEADER',
  'ASSISTANT_TEAM_LEADER',
  'GATE_LEADER',
  'SECTION_SUPERVISOR',
] as const;
export type EventRole = (typeof EVENT_ROLES)[number];

/**
 * How far a role reaches, which is also how many people may hold it:
 *   EVENT — one for the whole event (team leader, his assistant)
 *   GATE  — one per gate or working point
 *   LANE  — one per job within a location (a scanning line's supervisor)
 * Giving a role to a second person moves it; it is never held twice.
 */
export const EVENT_ROLE_SCOPE: Record<EventRole, 'EVENT' | 'GATE' | 'LANE'> = {
  TEAM_LEADER: 'EVENT',
  ASSISTANT_TEAM_LEADER: 'EVENT',
  GATE_LEADER: 'GATE',
  SECTION_SUPERVISOR: 'LANE',
};

export const EVENT_TYPES = [
  'FOOTBALL_MATCH',
  'CONCERT',
  'FESTIVAL',
  'EXHIBITION',
  'CONFERENCE',
  'PROMOTIONAL',
  'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'READY',
  'LIVE',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Allowed lifecycle moves. Anything else is rejected server-side. */
export const EVENT_STATUS_FLOW: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PLANNING', 'ARCHIVED'],
  PLANNING: ['DRAFT', 'READY', 'ARCHIVED'],
  READY: ['PLANNING', 'LIVE', 'ARCHIVED'],
  LIVE: ['READY', 'COMPLETED'],
  COMPLETED: ['LIVE', 'ARCHIVED'],
  ARCHIVED: ['COMPLETED'],
};

export const GATE_TYPES = ['GENERAL', 'VIP', 'STAFF', 'PLAYERS', 'MEDIA', 'OTHER'] as const;
export type GateType = (typeof GATE_TYPES)[number];

export const LOCATION_STATUSES = ['INACTIVE', 'READY', 'ACTIVE', 'CLOSED'] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const WORKING_POINT_TYPES = [
  'SCANNER_AREA',
  'WRISTBAND_AREA',
  'VIP_AREA',
  'INFORMATION',
  'CROWD_GUIDANCE',
  'STAFF_ENTRANCE',
  'PLAYER_ENTRANCE',
  'EMERGENCY',
  'TECHNICAL',
  'OTHER',
] as const;
export type WorkingPointType = (typeof WORKING_POINT_TYPES)[number];

export const TASKS = [
  'ELECTRONIC_SCANNING',
  'PAPER_TICKETS',
  'CROWD_GUIDANCE',
  'WRISTBAND_DISTRIBUTION',
  /*
   * Handing a wristband over and fastening one onto a person are two different
   * jobs at a venue: the first happens at a wristband desk, the second happens
   * at the gate, standing directly behind whoever is scanning the tickets.
   * They are counted and staffed separately, so they are separate tasks.
   */
  'WRISTBAND_FITTING',
  'VIP_MANAGEMENT',
  'INFORMATION',
  'GATE_MANAGEMENT',
  'SECURITY_SUPPORT',
  'TECHNICAL_SUPPORT',
  'OTHER',
] as const;
export type Task = (typeof TASKS)[number];

export const ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'CONFIRMED',
  'CHANGED',
  'CANCELLED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const EVENT_MEMBER_STATUSES = [
  'INVITED',
  'CONFIRMED',
  'ACTIVE',
  'CANCELLED',
] as const;
export type EventMemberStatus = (typeof EVENT_MEMBER_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  'PENDING',
  'PRESENT',
  'LATE',
  'ABSENT',
  'EXCUSED',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const PRIORITIES = ['NORMAL', 'IMPORTANT', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AUDIENCES = ['EVENT', 'GATE', 'WORKING_POINT', 'MEMBER'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const ISSUE_TYPES = [
  'SCANNER',
  'CROWD_CONGESTION',
  'MISSING_STAFF',
  'TICKET',
  'WRISTBAND',
  'SECURITY',
  'TECHNICAL',
  'OTHER',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const TIMELINE_STATUSES = [
  'UPCOMING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TimelineStatus = (typeof TIMELINE_STATUSES)[number];

export const MARKER_TYPES = [
  'GATE',
  'WORKING_POINT',
  'VIP_ENTRANCE',
  'SCANNER',
  'WRISTBAND',
  'TEAM_LEADER',
  'GATE_LEADER',
  'TEAM_MEMBER',
  'INFORMATION',
  'EMERGENCY',
  'STAFF_ENTRANCE',
  'PLAYER_ENTRANCE',
  'OTHER',
] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];

/** Short glyph + accent per marker type. Never colour alone (spec §35). */
export const MARKER_STYLE: Record<MarkerType, { glyph: string; color: string }> = {
  GATE: { glyph: 'G', color: MARKER_COLORS.GATE },
  WORKING_POINT: { glyph: 'W', color: MARKER_COLORS.WORKING_POINT },
  VIP_ENTRANCE: { glyph: 'V', color: MARKER_COLORS.VIP_ENTRANCE },
  SCANNER: { glyph: 'S', color: MARKER_COLORS.SCANNER },
  WRISTBAND: { glyph: 'B', color: MARKER_COLORS.WRISTBAND },
  TEAM_LEADER: { glyph: 'TL', color: MARKER_COLORS.TEAM_LEADER },
  GATE_LEADER: { glyph: 'GL', color: MARKER_COLORS.GATE_LEADER },
  TEAM_MEMBER: { glyph: 'M', color: MARKER_COLORS.TEAM_MEMBER },
  INFORMATION: { glyph: 'i', color: MARKER_COLORS.INFORMATION },
  EMERGENCY: { glyph: '+', color: MARKER_COLORS.EMERGENCY },
  STAFF_ENTRANCE: { glyph: 'ST', color: MARKER_COLORS.STAFF_ENTRANCE },
  PLAYER_ENTRANCE: { glyph: 'P', color: MARKER_COLORS.PLAYER_ENTRANCE },
  OTHER: { glyph: '•', color: MARKER_COLORS.OTHER },
};

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'ASSIGN',
  'REASSIGN',
  'ATTENDANCE',
  'ANNOUNCE',
  'ISSUE',
  'TOKEN_ROTATE',
  'LOGIN',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  'EVENT',
  'VENUE',
  'GATE',
  'WORKING_POINT',
  'TEAM_MEMBER',
  'EVENT_MEMBER',
  'ASSIGNMENT',
  'ATTENDANCE',
  'ANNOUNCEMENT',
  'ISSUE',
  'MAP_MARKER',
  'TIMELINE',
  'USER',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/* -------------------------------------------------------------------------- */
/* The team's verdict on an event                                              */
/* -------------------------------------------------------------------------- */

/**
 * The answers the end-of-event questionnaire accepts.
 *
 * Stored as codes rather than as the words on screen, so the same answer can
 * be counted across events and read back in either language — and so that
 * rewording a question next season does not orphan last season's answers.
 */

/** Yes / sort of / no. One scale, asked about four different things. */
export const FEEDBACK_DEGREES = ['YES', 'SOMEWHAT', 'NO'] as const;
export type FeedbackDegree = (typeof FEEDBACK_DEGREES)[number];

export const FEEDBACK_BRIEFINGS = ['TOO_SHORT', 'RIGHT', 'TOO_LONG', 'NONE'] as const;
export type FeedbackBriefing = (typeof FEEDBACK_BRIEFINGS)[number];

export const FEEDBACK_STAFFING = [
  'MORE_THAN_ENOUGH',
  'ENOUGH',
  'SHORT',
  'VERY_SHORT',
] as const;
export type FeedbackStaffing = (typeof FEEDBACK_STAFFING)[number];

export const FEEDBACK_UNSURE = ['NO', 'ONCE_OR_TWICE', 'OFTEN'] as const;
export type FeedbackUnsure = (typeof FEEDBACK_UNSURE)[number];

export const FEEDBACK_PROBLEMS = [
  'SCANNING',
  'WRISTBANDS',
  'SEATING',
  'GATES',
  'CROWD',
  'NONE',
  'OTHER',
] as const;
export type FeedbackProblem = (typeof FEEDBACK_PROBLEMS)[number];

export const FEEDBACK_AGAIN = ['DEFINITELY', 'YES', 'MAYBE', 'NO'] as const;
export type FeedbackAgain = (typeof FEEDBACK_AGAIN)[number];

export const FEEDBACK_RESPONSIBILITY = ['YES', 'AFTER_TRAINING', 'NOT_NOW'] as const;
export type FeedbackResponsibility = (typeof FEEDBACK_RESPONSIBILITY)[number];

/**
 * How many answers a group needs before it is shown on its own.
 *
 * An average of one answer is that person's answer with their name taken off,
 * which is not anonymity — and the people filling this in were promised
 * anonymity. Below this many responses the report shows the count and nothing
 * else; the same floor decides whether a job is recorded alongside an answer
 * at all.
 */
export const FEEDBACK_MIN_GROUP = 3;

/** Staffing verdict for a gate or working point (spec §9 / §25). */
export type StaffingLevel = 'UNDERSTAFFED' | 'ADEQUATE' | 'OVERSTAFFED';

export function staffingLevel(assigned: number, required: number): StaffingLevel {
  if (assigned < required) return 'UNDERSTAFFED';
  if (assigned > required) return 'OVERSTAFFED';
  return 'ADEQUATE';
}
