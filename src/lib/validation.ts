import { z } from 'zod';

import {
  ASSIGNMENT_STATUSES,
  ATTENDANCE_STATUSES,
  AUDIENCES,
  EVENT_STATUSES,
  EVENT_TYPES,
  GATE_TYPES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  LOCATION_STATUSES,
  MARKER_TYPES,
  PRIORITIES,
  TASKS,
  TIMELINE_STATUSES,
  WORKING_POINT_TYPES,
} from './constants';
import { DATE_RE, TIME_RE } from './time';

const time = z.string().regex(TIME_RE, 'invalidTime');
const date = z.string().regex(DATE_RE, 'invalidDate');
const shortText = z.string().trim().min(1).max(160);
const longText = z.string().trim().max(2000).optional().nullable();

export const eventSchema = z.object({
  name: shortText,
  type: z.enum(EVENT_TYPES),
  venueId: z.string().min(1),
  date,
  startTime: time,
  teamArrivalTime: time,
  description: longText,
  status: z.enum(EVENT_STATUSES).optional(),
});

/**
 * A pasted maps link. Anything https is accepted — Google Maps, Apple Maps, OSM,
 * a short link from a phone's share sheet — but nothing else, so a stray bit of
 * text never ends up as a link someone taps in the field.
 */
const mapsUrl = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'invalidUrl')
  .optional()
  .nullable();

const latitude = z.coerce.number().min(-90).max(90).optional().nullable();
const longitude = z.coerce.number().min(-180).max(180).optional().nullable();

export const venueSchema = z.object({
  name: shortText,
  address: z.string().trim().max(300).optional().nullable(),
  description: longText,
  locationUrl: mapsUrl,
  latitude,
  longitude,
});

export const teamMemberSchema = z.object({
  fullName: shortText,
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9\s()-]*$/, 'invalidNumber')
    .optional()
    .nullable(),
  employeeCode: z.string().trim().min(1).max(40),
  active: z.boolean().optional(),
  notes: longText,
});

export const gateSchema = z.object({
  name: shortText,
  type: z.enum(GATE_TYPES),
  description: longText,
  capacity: z.number().int().min(0).max(200000).nullable().optional(),
  requiredStaff: z.number().int().min(0).max(500),
  status: z.enum(LOCATION_STATUSES),
  gateLeaderId: z.string().nullable().optional(),
});

export const workingPointSchema = z.object({
  name: shortText,
  type: z.enum(WORKING_POINT_TYPES),
  description: longText,
  requiredStaff: z.number().int().min(0).max(500),
  status: z.enum(LOCATION_STATUSES),
});

export const assignmentSchema = z
  .object({
    eventMemberId: z.string().min(1),
    gateId: z.string().optional().nullable(),
    workingPointId: z.string().optional().nullable(),
    task: z.enum(TASKS),
    arrivalTime: time,
    shiftStart: time,
    shiftEnd: time,
    isGateLeader: z.boolean().optional(),
    notes: longText,
    status: z.enum(ASSIGNMENT_STATUSES).optional(),
  })
  .refine((v) => Boolean(v.gateId) !== Boolean(v.workingPointId), {
    message: 'locationExclusive',
    path: ['gateId'],
  });

export const attendanceSchema = z.object({
  eventMemberId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  notes: longText,
});

export const announcementSchema = z.object({
  title: shortText,
  message: z.string().trim().min(1).max(2000),
  priority: z.enum(PRIORITIES),
  audience: z.enum(AUDIENCES),
  gateId: z.string().optional().nullable(),
  workingPointId: z.string().optional().nullable(),
  eventMemberId: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export const issueSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  description: z.string().trim().min(1).max(2000),
  priority: z.enum(ISSUE_PRIORITIES),
  gateId: z.string().optional().nullable(),
  workingPointId: z.string().optional().nullable(),
});

export const issueStatusSchema = z.object({
  status: z.enum(ISSUE_STATUSES),
  resolutionNote: longText,
});

export const timelineSchema = z.object({
  title: shortText,
  description: longText,
  scheduledTime: time,
  status: z.enum(TIMELINE_STATUSES),
});

export const markerSchema = z.object({
  id: z.string().optional(),
  type: z.enum(MARKER_TYPES),
  name: shortText,
  description: longText,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  gateId: z.string().nullable().optional(),
  workingPointId: z.string().nullable().optional(),
  eventMemberId: z.string().nullable().optional(),
});

export const markersPayloadSchema = z.object({
  markers: z.array(markerSchema).max(400),
});

/* -------------------------------------------------------------------------- */

/** Reads a FormData string, returning null for empty values. */
export function str(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function num(form: FormData, key: string, fallback = 0): number {
  const value = str(form, key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

/** Maps a zod failure onto a dictionary key we already have a message for. */
export function firstIssueKey(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'generic';
  if (typeof issue.message === 'string' && /^[a-zA-Z]+$/.test(issue.message)) {
    return issue.message;
  }
  if (issue.code === 'too_small' || issue.code === 'invalid_type') return 'required';
  if (issue.code === 'too_big') return 'tooLong';
  return 'generic';
}
