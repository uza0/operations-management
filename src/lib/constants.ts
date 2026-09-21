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
  GATE: { glyph: 'G', color: '#10b981' },
  WORKING_POINT: { glyph: 'W', color: '#3b82f6' },
  VIP_ENTRANCE: { glyph: 'V', color: '#a855f7' },
  SCANNER: { glyph: 'S', color: '#06b6d4' },
  WRISTBAND: { glyph: 'B', color: '#f59e0b' },
  TEAM_LEADER: { glyph: 'TL', color: '#f43f5e' },
  GATE_LEADER: { glyph: 'GL', color: '#fb923c' },
  TEAM_MEMBER: { glyph: 'M', color: '#94a3b8' },
  INFORMATION: { glyph: 'i', color: '#38bdf8' },
  EMERGENCY: { glyph: '+', color: '#ef4444' },
  STAFF_ENTRANCE: { glyph: 'ST', color: '#84cc16' },
  PLAYER_ENTRANCE: { glyph: 'P', color: '#14b8a6' },
  OTHER: { glyph: '•', color: '#64748b' },
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

/** Staffing verdict for a gate or working point (spec §9 / §25). */
export type StaffingLevel = 'UNDERSTAFFED' | 'ADEQUATE' | 'OVERSTAFFED';

export function staffingLevel(assigned: number, required: number): StaffingLevel {
  if (assigned < required) return 'UNDERSTAFFED';
  if (assigned > required) return 'OVERSTAFFED';
  return 'ADEQUATE';
}
