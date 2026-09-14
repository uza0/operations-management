# Operations Management
## Event Team & Gate Operations Platform

---

# 1. PROJECT OVERVIEW

Build a modern web-based internal operations management platform designed for event field teams working on football matches, concerts, festivals, exhibitions, and other ticketed events.

The platform is inspired by the real operational workflow of Ticket Zone / Digital Zone field teams.

The system is NOT a ticket-selling platform.

It is an internal operational platform that helps administrators and team leaders:

- Create and manage events.
- Define the event venue.
- Upload and configure an interactive venue map.
- Create gates and operational points.
- Add team members.
- Assign team members to gates and tasks.
- Assign Team Leaders and Gate Leaders.
- Define arrival times and responsibilities.
- Track attendance.
- Publish announcements and operational instructions.
- Report and manage operational issues.
- Allow every team member to securely view their assignment without requiring a traditional account.
- Generate event reports.
- Preserve historical event information.

The primary objective is to replace repetitive manual team distribution and communication with a centralized digital operational workflow.

---

# 2. REAL-WORLD PROBLEM

The current field workflow is repetitive.

For every football match or event, a Team Leader usually has to manually organize the team.

Example:

A football match may require:

- 30–40 promoters.
- Multiple stadium gates.
- Ticket scanning points.
- Wristband distribution points.
- VIP entrances.
- General entrances.
- Information points.
- Crowd guidance.
- Team leaders.
- Gate leaders.
- Reserve members.

The Team Leader manually decides:

- Who works at Gate 1?
- Who works at Gate 2?
- Who works at VIP?
- Who scans tickets?
- Who distributes wristbands?
- Who is the leader of each gate?
- What time should everyone arrive?
- Who is absent?
- Who replaced an absent member?
- What happens if a gate becomes overcrowded?
- How can everyone be informed about a sudden change?

This creates several operational problems:

1. Members may not know where they are assigned.
2. Members may repeatedly ask the Team Leader for their location.
3. Changes are difficult to communicate.
4. Attendance is often manual.
5. Venue maps and staff assignments are disconnected.
6. There is no centralized operational history.
7. It is difficult to know the current state of each gate.
8. There is no structured issue-reporting workflow.
9. After the event, operational information is often lost.

Operations Management solves these problems.

---

# 3. PRODUCT VISION

The product should become the central operational control system for event teams.

The workflow should be:

Event
→ Venue
→ Map
→ Gates
→ Team
→ Assignments
→ Attendance
→ Live Operations
→ Announcements
→ Issues
→ Event Report
→ Archive

The product should make the Team Leader's work faster, clearer, and less dependent on WhatsApp messages, spreadsheets, paper lists, and verbal instructions.

---

# 4. PRODUCT PRINCIPLES

The system must follow these principles:

### 4.1 Mobile First

Team members will primarily use smartphones during events.

The Member Portal must therefore be extremely easy to use on mobile.

### 4.2 Desktop First for Administration

Administrators and Team Leaders should have a powerful responsive dashboard optimized for desktop/tablet but still usable on mobile.

### 4.3 Simple in the Field

During an event, users do not have time to navigate complicated interfaces.

Important information must be visible immediately:

- Event
- Location
- Gate
- Task
- Arrival time
- Team Leader
- Announcements
- Issues

### 4.4 No unnecessary account creation

Team members should not need a traditional username/password account.

They should access their assignment using a secure personal event token or QR code.

### 4.5 Real-world flexibility

The system must allow assignments to change.

Events are dynamic.

A member may be moved from Gate 2 to Gate 5.

The system must record the change and clearly show the new assignment.

### 4.6 Transparency

Operational changes must be traceable.

For important changes, record:

- Previous value.
- New value.
- Who changed it.
- When it was changed.
- Optional reason.

---

# 5. USER ROLES

There are four main roles.

---

## ROLE 1 — ADMIN

The Admin is the highest operational role.

Admin requires:

- Username
- Password

Admin can:

- Create events.
- Edit events.
- Archive events.
- Manage venues.
- Upload venue maps.
- Create gates.
- Create operational points.
- Manage team members.
- Manage Team Leaders.
- Assign members.
- Modify assignments.
- Manage attendance.
- Create announcements.
- View and manage issues.
- View reports.
- Export reports.
- Manage users.
- View all events.
- View audit history.

---

# ROLE 2 — EVENT TEAM LEADER

The Event Team Leader manages a specific event or multiple assigned events.

Authentication:

- Username
- Password

Permissions:

- View assigned events.
- View event map.
- Manage team members for assigned events.
- Assign members.
- Change assignments.
- Assign Gate Leaders.
- Track attendance.
- Publish announcements.
- View operational issues.
- Resolve issues.
- View team status.
- View event reports.

The Event Team Leader should NOT automatically have access to unrelated events.

---

# ROLE 3 — GATE LEADER

A Gate Leader manages a specific gate or operational area.

Possible authentication:

- Account
OR
- Secure event token

Permissions:

- View assigned gate.
- View assigned members.
- View gate map.
- Record attendance for assigned members.
- Report issues.
- View relevant announcements.
- Send gate-specific announcements if authorized.

---

# ROLE 4 — TEAM MEMBER / PROMOTER

Team members do not require traditional accounts.

They receive a secure personal event token or QR code.

They can see:

- Their name.
- Event name.
- Event date.
- Arrival time.
- Assigned gate.
- Assigned task.
- Gate Leader.
- Team Leader.
- Venue map.
- Their location on the map.
- Announcements.
- Relevant instructions.
- Issue reporting interface.

They cannot:

- Modify assignments.
- View private information of other members.
- Manage events.
- View unrelated team members.
- Access administration functions.

---

# 6. SECURITY MODEL

Do NOT create a public page where a user can simply type another person's name and see their assignment.

Instead use a secure personal event token.

Example:

Event URL:

/event/ZR2026

Personal token:

A7K92P

The member opens:

/event/ZR2026

and enters the token.

Or scans a personal QR code.

The token identifies only that member for that event.

The member should not be able to enumerate other members.

---

# 7. EVENT LIFECYCLE

Every event has a lifecycle.

Statuses:

1. Draft
2. Planning
3. Ready
4. Live
5. Completed
6. Archived

### Draft

Basic event information is being created.

### Planning

Venue, map, gates and team are being configured.

### Ready

Assignments are completed and the event is ready.

### Live

The event is currently operating.

### Completed

The operational period has ended.

### Archived

The event is stored for historical reporting.

---

# 8. EVENT CREATION

Admin creates an event.

Required fields:

- Event name
- Event type
- Venue
- Event date
- Event start time
- Team arrival time
- Description
- Status

Event types:

- Football Match
- Concert
- Festival
- Exhibition
- Other

Example:

Event Name:
Zawraa vs Al-Shorta

Type:
Football Match

Venue:
Zawraa Stadium

Date:
20 September 2026

Event Start:
7:30 PM

Team Arrival:
5:00 PM

---

# 9. VENUE MANAGEMENT

A Venue represents the physical location.

Fields:

- Venue ID
- Venue Name
- Address
- Map Image
- Description
- Created At
- Updated At

Examples:

- Zawraa Stadium
- Concert Hall
- Baghdad Arena
- Festival Grounds

A venue can be reused by multiple events.

---

# 10. INTERACTIVE VENUE MAP

This is one of the most important features.

The administrator should be able to upload an image of the venue/stadium layout.

The system should display it as an interactive canvas.

The user can:

- Zoom.
- Pan.
- Add markers.
- Move markers.
- Delete markers.
- Edit markers.
- Save positions.

The map should support drag-and-drop.

---

# 11. MAP MARKER TYPES

Supported marker types:

- Gate
- Working Point
- VIP Entrance
- Scanner Point
- Wristband Point
- Team Leader
- Gate Leader
- Team Member
- Information Point
- Emergency Point

Each marker should have:

- ID
- Type
- Name
- X position
- Y position
- Description
- Optional linked entity

Coordinates should be stored relative to the map rather than as absolute screen pixels.

This allows the map to remain responsive on different screen sizes.

---

# 12. GATES

A gate represents an entrance or operational gate.

Gate fields:

- ID
- Event ID
- Name
- Type
- Description
- Required staff
- Assigned Team Leader / Gate Leader
- Map position
- Status

Gate types:

- General
- VIP
- Staff
- Players
- Media
- Other

Gate statuses:

- Inactive
- Ready
- Active
- Closed

Example:

Gate 04

Type:
General

Required Staff:
5

Task:
Ticket Scanning

Gate Leader:
Hussein

---

# 13. WORKING POINTS

Not every team member works directly at a gate.

Create operational points such as:

- Scanner Area
- Wristband Area
- VIP Area
- Information Point
- Crowd Guidance Point
- Staff Entrance
- Player Entrance
- Emergency Point

A team member can be assigned to either:

- Gate
OR
- Working Point

---

# 14. TEAM MEMBER MANAGEMENT

Admin can create reusable team members.

Fields:

- ID
- Full Name
- Phone
- Employee Code
- Active/Inactive
- Created At

Do not require excessive personal information.

The system should only store information needed for event operations.

---

# 15. TEAM ASSIGNMENT

This is the main operational feature.

The Team Leader sees:

### Available Team Members

Example:

- Ahmed
- Ali
- Amir
- Hussein
- Mustafa
- Mohammed
- Hassan

And:

### Available Locations

- Gate 1
- Gate 2
- Gate 3
- Gate 4
- VIP
- Scanner Area
- Wristband Area
- Reserve

The Team Leader can assign a member to a location.

The assignment contains:

- Member
- Event
- Gate / Working Point
- Task
- Arrival time
- Shift start
- Shift end
- Gate Leader status
- Notes
- Assignment status

---

# 16. TASK TYPES

Tasks should include:

- Electronic Ticket Scanning
- Paper Ticket Collection
- Crowd Guidance
- Wristband Distribution
- VIP Management
- Information
- Gate Management
- Security Support
- Technical Support
- Other

The system should allow Admin to configure additional task types in the future.

---

# 17. ASSIGNMENT STATUS

Assignments can have:

- Assigned
- Confirmed
- Changed
- Cancelled

When an assignment changes, the system should retain the previous assignment in the audit history.

---

# 18. ASSIGNMENT CHANGE

Example:

Original:

Amir
→ Gate 4
→ Ticket Scanning

Changed:

Amir
→ Gate 6
→ Ticket Scanning

The system records:

Changed by:
Team Leader Ahmed

Time:
4:35 PM

Reason:
Gate 6 needs additional staff.

The member portal should immediately show the new assignment.

---

# 19. MEMBER PORTAL

The member portal is intentionally simple.

Mobile-first.

Example:

OPERATIONS MANAGEMENT

Welcome, Amir

EVENT

Zawraa vs Al-Shorta

20 September 2026

---

YOUR ARRIVAL

5:00 PM

---

YOUR LOCATION

Gate 4

---

YOUR TASK

Electronic Ticket Scanning

---

YOUR GATE LEADER

Hussein

---

YOUR TEAM LEADER

Ahmed

---

[ View Venue Map ]

---

ANNOUNCEMENTS

Important instructions should appear here.

---

[ Report an Issue ]

---

# 20. MEMBER MAP VIEW

When the member opens the map:

Show:

- Entire venue map.
- Assigned gate.
- Member's position.
- Gate name.
- Important operational points.

Highlight the member's location clearly.

The map should be readable on a smartphone.

---

# 21. ATTENDANCE

The system should track attendance for every event.

Statuses:

- Present
- Late
- Absent
- Excused

Fields:

- Event
- Member
- Check-in time
- Check-out time
- Status
- Recorded by

For MVP:

Team Leader can manually record attendance.

Future:

- Personal QR Check-in
- Secure token Check-in
- Optional geofence validation

Do NOT require GPS for MVP.

---

# 22. ATTENDANCE DASHBOARD

Example:

TEAM ATTENDANCE

Total:
32

Present:
27

Late:
2

Absent:
3

Then member list:

Ahmed
5:02 PM
Present

Ali
5:15 PM
Late

Amir
5:00 PM
Present

Hussein
Not checked in
Absent

---

# 23. EVENT TIMELINE

Every event should support an operational timeline.

Example:

3:00 PM
Team Arrival

3:30 PM
Team Briefing

4:00 PM
Gate Preparation

5:00 PM
Ticket Scanning Starts

6:30 PM
Main Crowd Arrival

7:30 PM
Event Starts

10:00 PM
Gate Closing

10:30 PM
Team Check-out

This timeline can be configured by the Team Leader/Admin.

Members should only see relevant timeline information.

---

# 24. ANNOUNCEMENTS

The system needs an announcement system.

Admin and authorized Team Leaders can publish announcements.

Fields:

- Title
- Message
- Priority
- Audience
- Created By
- Created At
- Expiration

Priority:

- Normal
- Important
- Urgent

Audience:

- Entire Event Team
- Specific Gate
- Specific Working Point
- Specific Member

Example:

URGENT

Gate 3 requires one additional team member.

Another:

IMPORTANT

All members must arrive 30 minutes before gate opening.

---

# 25. REAL-TIME ANNOUNCEMENTS

When technically possible, announcements should appear without requiring a page refresh.

For MVP, use the backend's realtime capabilities if available.

Future:

- Push Notifications
- Browser Notifications
- SMS/WhatsApp integration if officially supported

Do NOT implement WhatsApp integration in MVP.

---

# 26. ISSUE REPORTING

This should be included in the architecture but can be implemented after the core MVP.

A team member can report:

- Scanner Problem
- Crowd Congestion
- Missing Staff
- Ticket Problem
- Wristband Problem
- Security Problem
- Technical Problem
- Other

Fields:

- Event
- Reporter
- Gate
- Issue Type
- Description
- Priority
- Status
- Created At
- Resolved At
- Resolved By

Priority:

- Low
- Medium
- High
- Critical

Status:

- Open
- Acknowledged
- In Progress
- Resolved
- Closed

---

# 27. LIVE OPERATIONS

This is a future/high-value feature.

The Team Leader can see the live state of the event.

Example:

LIVE OPERATIONS

Team:

Present: 28
Late: 2
Absent: 2

Gates:

Gate 1
4 / 4
GREEN

Gate 2
2 / 5
RED

Gate 3
4 / 4
GREEN

Gate 4
3 / 4
YELLOW

Issues:

RED
Gate 2 — Crowd Congestion

YELLOW
Gate 4 — Missing Staff

The venue map can display gate status visually.

---

# 28. RESERVE TEAM

The system should support reserve members.

Example:

Total team:
32

Required active:
28

Reserve:
4

If a member is absent, the Team Leader can replace them.

Example:

Hussein
Absent

Replace with:

Mustafa

The system records:

Original member:
Hussein

Replacement:
Mustafa

Gate:
Gate 3

Time:
5:15 PM

Reason:
Staff shortage

---

# 29. EVENT REPORT

After completion, the system generates a report.

Report should include:

- Event information
- Venue
- Date
- Team size
- Present members
- Late members
- Absent members
- Gate distribution
- Assignment summary
- Issues
- Announcements
- Changes
- Timeline
- Operational notes

Example:

EVENT REPORT

Zawraa vs Al-Shorta

Team:
32

Present:
29

Late:
2

Absent:
1

Gates:
8

Issues:
4

Announcements:
6

Assignment Changes:
3

---

# 30. EXPORT

Reports should eventually support:

- PDF
- Excel

Map export can optionally support:

- PNG
- PDF

---

# 31. AUDIT LOG

Transparency is an important part of the system.

Record important actions.

Example:

Assignment changed.

Previous:
Gate 2

New:
Gate 4

Changed by:
Ahmed

Time:
17:12

Reason:
Gate 4 required additional staff.

Audit logs should also cover:

- Assignment changes
- Event changes
- Gate changes
- Attendance corrections
- Announcement creation
- Issue status changes
- User permission changes

Audit logs should be read-only for normal users.

---

# 32. ADMIN DASHBOARD

The Admin Dashboard should contain:

### Overview

- Active Events
- Upcoming Events
- Completed Events
- Total Team Members
- Current Attendance
- Open Issues

### Recent Events

Cards showing:

Event name
Date
Venue
Team size
Status

### Quick Actions

- Create Event
- Manage Team
- Create Venue
- Open Live Event

---

# 33. EVENT DASHBOARD

Each event should have a dedicated dashboard.

Sections:

- Overview
- Map
- Gates
- Team
- Assignments
- Attendance
- Timeline
- Announcements
- Issues
- Reports
- Activity/Audit Log

---

# 34. EVENT OVERVIEW UI

Example:

EVENT

Zawraa vs Al-Shorta

Football Match

Zawraa Stadium

20 Sep 2026

7:30 PM

Status:
LIVE

---

TEAM

32 Members

28 Present

2 Late

2 Absent

---

GATES

8 Active Gates

---

ISSUES

2 Open Issues

---

ANNOUNCEMENTS

4 Active Announcements

---

# 35. INTERACTIVE MAP EDITOR UI

The map editor should have:

### Left Toolbar

- Select
- Gate
- Working Point
- VIP
- Scanner
- Wristband
- Team Leader
- Member
- Information
- Emergency

### Center

Large map canvas.

### Right Sidebar

Selected item properties:

Name
Type
Description
Assigned Member
Assigned Gate Leader
Status

Buttons:

Save
Delete
Duplicate

The interface should support drag-and-drop.

---

# 36. TEAM ASSIGNMENT UI

Provide two useful views.

### List View

Member | Location | Task | Leader | Arrival | Status

### Map View

Members shown directly on the venue map.

The Team Leader should be able to switch between both.

---

# 37. MOBILE MEMBER DESIGN

Do NOT copy the desktop dashboard onto mobile.

The Member Portal should be a purpose-built mobile experience.

Priority order:

1. Where do I go?
2. When do I arrive?
3. What is my task?
4. Who is my leader?
5. What are the latest instructions?
6. How do I report a problem?

---

# 38. DESIGN DIRECTION

The visual design should feel:

- Professional
- Modern
- Operational
- Premium
- Clean
- High contrast
- Fast
- Reliable

Avoid making it look like:

- A generic admin template.
- A banking dashboard.
- A social media application.
- A ticket-selling website.

It should visually communicate:

EVENT OPERATIONS
CONTROL
TEAM
GATES
LIVE STATUS

Use strong information hierarchy.

---

# 39. COLOR SYSTEM

Suggested visual language:

Primary:
Dark / neutral foundation.

Status colors:

Green:
Operational / ready / present.

Yellow:
Warning / late / partial.

Red:
Critical / absent / issue.

Blue or neutral:
Information.

Do not overuse colors.

Colors should primarily communicate status.

---

# 40. TYPOGRAPHY

The main interface is Arabic-first.

Support RTL correctly.

Use a clean Arabic UI font.

Recommended:

- IBM Plex Sans Arabic
- Noto Sans Arabic
- Or another modern Arabic UI font.

English must also be supported.

---

# 41. RESPONSIVENESS

The application must work on:

- Desktop
- Laptop
- Tablet
- Android
- iPhone

The Member Portal must be especially optimized for mobile.

---

# 42. TECHNICAL ARCHITECTURE

Preferred architecture:

Frontend:
Next.js / React

Styling:
Tailwind CSS

Backend:
Next.js server/API routes or Node.js backend

Database:
PostgreSQL

Recommended managed backend:
Supabase

Authentication:
Supabase Auth for Admin/Team Leader accounts

Storage:
Supabase Storage for venue maps

Realtime:
Supabase Realtime

Interactive Map:
Konva.js or an equivalent canvas library

Deployment:
Vercel

---

# 43. DATABASE ENTITIES

Create a normalized relational data model.

Core entities:

users
team_members
venues
events
event_members
gates
working_points
assignments
attendance
announcements
issues
event_timeline
map_markers
audit_logs

---

# 44. DATABASE RELATIONSHIP

Users:

Admin / Team Leaders / Gate Leaders

Events:

Each event belongs to a venue.

Event Members:

Connect team members to events.

Gates:

Belong to events.

Assignments:

Connect members to events and gates/working points.

Attendance:

Connect members to events.

Announcements:

Belong to events and optionally target specific gates/members.

Issues:

Belong to events and optionally gates.

Map Markers:

Belong to the event map and optionally reference a gate/member/working point.

Audit Logs:

Track important changes.

---

# 45. IMPORTANT DATA MODEL RULE

Do not mix a person's identity, account, event membership, and assignment into one database object.

Separate:

User
=
Authentication and permissions.

Team Member
=
Person who works events.

Event Membership
=
The fact that the person participates in a specific event.

Assignment
=
The person's operational location/task for that event.

This makes the system easier to scale.

---

# 46. ASSIGNMENT CONSTRAINTS

The system should prevent obvious conflicts.

For example:

A member should not normally have two active assignments for the same time period.

A gate should display:

Assigned:
4 / Required:
5

This should immediately indicate that the gate needs another member.

If a member is already assigned elsewhere, warn the Team Leader before assigning them again.

---

# 47. GATE CAPACITY

Each gate can have:

Required Staff

Current Staff

Difference

Example:

Gate 3

Required:
5

Assigned:
3

Status:
Needs 2 members

This should be visible on both list and map views.

---

# 48. SMART ALLOCATION — FUTURE

Do not implement AI in MVP.

However, design the data model so future smart allocation is possible.

Future algorithm inputs:

- Expected ticket volume.
- Gate capacity.
- Gate type.
- Historical crowd data.
- Number of available staff.
- Gate importance.
- Historical operational performance.

The system can then recommend:

Gate 1 → 6 staff
Gate 2 → 3 staff
Gate 3 → 5 staff
VIP → 4 staff
Reserve → 3 staff

The Team Leader remains in control.

The system only recommends.

---

# 49. FUTURE TICKET PLATFORM INTEGRATION

Do NOT attempt to directly modify the Ticket Zone ticketing system in MVP.

The Operations Management platform should initially be independent.

Future architecture can support API integration.

Potential future flow:

Ticket Platform
↓
Event Ticket Data
↓
Operations Management
↓
Expected Gate Volume
↓
Staff Allocation Recommendation

This could eventually make the platform significantly more valuable.

---

# 50. OFFLINE CONSIDERATIONS

Event venues may have weak internet.

The architecture should be prepared for limited connectivity.

Future functionality:

- Cache event assignment locally.
- Cache venue map.
- Cache announcements.
- Allow basic member information to remain available offline.
- Queue non-critical actions until connectivity returns.

Do not make full offline synchronization a requirement for MVP.

---

# 51. NOTIFICATION STRATEGY

MVP:

In-app announcements.

Phase 2:

Browser notifications / Push notifications.

Future:

Optional external messaging integrations.

Do not make WhatsApp mandatory.

---

# 52. ROUTES

Suggested routes:

/login

/admin

/admin/events

/admin/events/new

/admin/events/[id]

/admin/events/[id]/map

/admin/events/[id]/team

/admin/events/[id]/assignments

/admin/events/[id]/attendance

/admin/events/[id]/announcements

/admin/events/[id]/issues

/admin/events/[id]/reports

/admin/team

/admin/venues

/admin/settings

/leader

/leader/events

/leader/events/[id]

/leader/events/[id]/team

/leader/events/[id]/map

/leader/events/[id]/attendance

/leader/events/[id]/issues

/member/[eventToken]

---

# 53. MVP

The first version MUST remain focused.

MVP features:

1. Admin Login
2. Team Leader Login
3. Event Creation
4. Venue Creation
5. Venue Map Upload
6. Interactive Map
7. Gate Creation
8. Working Point Creation
9. Team Member Management
10. Team Assignment
11. Arrival Time
12. Task Assignment
13. Secure Member Token
14. Member Portal
15. Member Map
16. Announcements
17. Manual Attendance
18. Basic Event Dashboard
19. Basic Audit Log
20. Basic Event Report

---

# 54. DO NOT IMPLEMENT IN MVP

Do not spend time on:

- AI
- Machine learning
- GPS
- Geofencing
- WhatsApp API
- SMS gateway
- Ticket platform API
- Payment system
- Payroll
- Complex HR
- Native Android/iOS app
- Advanced analytics
- Predictive crowd analysis

These are future roadmap features.

---

# 55. PHASE 2

After MVP is stable:

- QR Check-in
- Push Notifications
- Gate Leader accounts
- Reserve members
- Live Operations
- Issue Reporting
- Event Timeline
- PDF Export
- Excel Export
- Better audit history
- Offline caching

---

# 56. PHASE 3

Advanced operations:

- Smart Staff Allocation
- Ticket-volume based staffing recommendations
- Ticket platform integration
- Attendance analytics
- Team performance analytics
- Historical gate performance
- Crowd distribution analytics
- Operational efficiency metrics

---

# 57. MAIN USER FLOW — ADMIN

Admin Login

↓

Dashboard

↓

Create Event

↓

Select/Create Venue

↓

Upload Venue Map

↓

Create Gates

↓

Create Working Points

↓

Add Team Leader

↓

Add Team Members

↓

Assign Team Members

↓

Set Tasks

↓

Set Arrival Times

↓

Review Map

↓

Publish Event

↓

Monitor Attendance

↓

Publish Announcements

↓

Monitor Issues

↓

Complete Event

↓

Generate Report

↓

Archive Event

---

# 58. MAIN USER FLOW — TEAM LEADER

Login

↓

My Events

↓

Open Event

↓

View Team

↓

View Map

↓

Assign Members

↓

Set Gate Leaders

↓

Review Gate Staffing

↓

Publish Instructions

↓

Record Attendance

↓

Monitor Team

↓

Handle Issues

↓

Change Assignments if required

↓

Complete Event

↓

Review Report

---

# 59. MAIN USER FLOW — TEAM MEMBER

Receive Event Token / QR

↓

Open Event Link

↓

Enter Token / Scan QR

↓

See Personal Event Information

↓

See Arrival Time

↓

See Gate

↓

See Task

↓

Open Map

↓

Read Announcements

↓

Arrive at Event

↓

Check-in through available method

↓

Perform Task

↓

Report Issue if necessary

↓

Check-out

---

# 60. EXAMPLE REAL EVENT

Use a realistic demo event.

Event:

Zawraa vs Al-Shorta

Venue:

Zawraa Stadium

Team:

32

Gates:

8

Example distribution:

Gate 1:
4 members

Gate 2:
4 members

Gate 3:
5 members

Gate 4:
4 members

Gate 5:
3 members

VIP:
4 members

Information:
2 members

Reserve:
6 members

The map should visually demonstrate these assignments.

---

# 61. UX REQUIREMENT

The user should never need to understand the database.

The interface must use operational language.

Instead of:

"Create Record"

Use:

"Add Team Member"

Instead of:

"Relation"

Use:

"Assign to Gate"

Instead of:

"Entity"

Use:

"Event"

Instead of:

"Coordinate"

Use:

"Map Location"

---

# 62. DASHBOARD PRIORITIES

Information hierarchy:

1. Active Event
2. Team Status
3. Gate Status
4. Critical Issues
5. Announcements
6. Assignments
7. Timeline
8. Reports

---

# 63. ERROR HANDLING

The system should provide clear messages.

Examples:

If assigning an already assigned member:

"Amir is already assigned to Gate 2 during this time. Do you want to move him to Gate 4?"

If deleting a gate with assigned members:

"This gate has 4 assigned members. Reassign them before deleting the gate."

If publishing an incomplete event:

"This event is not ready. Gate 3 still needs 2 team members."

---

# 64. CONFIRMATION DIALOGS

Use confirmation dialogs for destructive actions:

- Delete event
- Delete gate
- Remove team member
- Cancel assignment
- Archive event

Example:

"Are you sure you want to archive this event?"

Do not use confirmations for harmless actions.

---

# 65. AUDIT TRANSPARENCY

For important operational changes, show:

"Changed by Ahmed · 5:14 PM"

Example:

"Amir was moved from Gate 2 to Gate 4 by Ahmed at 5:14 PM."

This is important because the real-world workflow depends on transparency.

---

# 66. PERFORMANCE

The application should remain fast.

Avoid unnecessary animations.

Map interactions should be smooth.

Do not load huge images unnecessarily.

Venue maps should be optimized/compressed.

The Member Portal should load quickly even on mid-range Android phones and weaker networks.

---

# 67. ACCESSIBILITY

Use:

- Large touch targets.
- Clear status labels.
- High contrast.
- Icons + text rather than color alone.
- Readable Arabic typography.
- Keyboard accessibility for desktop users.

---

# 68. INTERNATIONALIZATION

Architecture should support Arabic and English from the beginning.

Default:

Arabic / RTL.

English:

English / LTR.

Do not hardcode Arabic text inside components in a way that makes translation difficult.

---

# 69. DEMO MODE

Create realistic seed/demo data.

Demo should include:

- One football match.
- One venue.
- Venue map.
- 8 gates.
- 32 members.
- Team Leader.
- Gate Leaders.
- Assignments.
- Attendance.
- Announcements.
- Example issue.
- Event timeline.

The system should look convincing immediately after startup.

---

# 70. PRODUCT POSITIONING

Do not position this as:

"A staff list application."

Position it as:

"An Event Team & Gate Operations Platform."

The value is operational coordination.

It manages:

- People
- Locations
- Tasks
- Time
- Communication
- Attendance
- Issues
- Event history

---

# 71. FUTURE BUSINESS POTENTIAL

Although initially designed for Ticket Zone / Digital Zone operations, the architecture should be generic enough to support:

- Event management companies.
- Concert organizers.
- Stadium operations.
- Festivals.
- Exhibitions.
- Conferences.
- Security staffing.
- Volunteer teams.
- Promotional teams.

Do not hardcode the product around only one stadium or one event.

---

# 72. IMPORTANT PRODUCT DECISION

Ticket Zone's ticket-selling system and Operations Management are separate systems initially.

Operations Management should not attempt to replace ticket sales.

It is an internal operations layer.

Potential future architecture:

Ticketing Platform
+
Operations Management

This separation allows the project to be developed independently and later integrated through APIs if authorized.

---

# 73. FINAL PRODUCT STRUCTURE

The complete platform should eventually consist of:

ADMIN
│
├── Dashboard
├── Events
├── Venues
├── Team
├── Team Leaders
├── Maps
├── Attendance
├── Announcements
├── Issues
├── Reports
└── Settings

EVENT
│
├── Overview
├── Map
├── Gates
├── Working Points
├── Team
├── Assignments
├── Attendance
├── Timeline
├── Announcements
├── Issues
├── Activity
└── Report

MEMBER
│
├── My Event
├── My Location
├── My Task
├── Venue Map
├── Announcements
└── Report Issue

---

# 74. DEVELOPMENT PRIORITY

Build in this exact order.

## STEP 1

Project setup.

- Next.js
- TypeScript
- Tailwind
- Supabase
- Environment configuration

## STEP 2

Database.

Create:

- users
- team_members
- venues
- events
- gates
- working_points
- assignments
- attendance
- announcements
- map_markers
- audit_logs

## STEP 3

Authentication.

Implement:

- Admin
- Team Leader

## STEP 4

Events.

Create:

- Event list
- Create event
- Event details
- Event status

## STEP 5

Venues and maps.

Implement:

- Venue management
- Map upload
- Map editor
- Marker system

## STEP 6

Team.

Implement:

- Team members
- Team leaders
- Event team

## STEP 7

Assignments.

Implement:

- Gate assignment
- Working point assignment
- Task
- Arrival time
- Assignment status
- Conflict warnings

## STEP 8

Member Portal.

Implement:

- Secure token
- Personal event view
- Assignment
- Map
- Announcements

## STEP 9

Attendance.

Implement manual attendance.

## STEP 10

Announcements.

Implement event and gate-specific announcements.

## STEP 11

Audit Logs.

Implement transparent assignment/change history.

## STEP 12

Reports.

Implement basic event report.

---

# 75. IMPORTANT IMPLEMENTATION RULES FOR FABLE

Do NOT build everything at once.

First build a clean MVP.

Do NOT add speculative features just because they are listed under future phases.

Do NOT add AI, GPS, WhatsApp, payment, ticket API integration or advanced analytics in the first implementation.

Prioritize:

1. Correct database structure.
2. Correct permissions.
3. Excellent event workflow.
4. Excellent interactive map.
5. Easy assignment workflow.
6. Excellent mobile member portal.
7. Clear attendance.
8. Clear announcements.
9. Audit transparency.
10. Clean responsive UI.

The application must be functional, not just visually impressive.

---

# 76. QUALITY REQUIREMENTS

Before considering MVP complete, verify:

- Admin cannot access unauthorized functions as Team Leader.
- Team Leader cannot access unrelated events.
- Members cannot view other members' private assignments.
- Members cannot modify assignments.
- Assignment conflicts are detected.
- Deleted/changed data does not silently destroy historical information.
- Map positions remain correct on different screen sizes.
- Arabic RTL works correctly.
- Mobile layout works correctly.
- Event status transitions work.
- Attendance calculations are correct.
- Announcements are scoped correctly.
- Audit logs are generated for important changes.
- Empty states are handled.
- Loading states are handled.
- Error states are handled.
- Destructive actions require confirmation.
- Demo data is realistic.

---

# 77. SUCCESS CRITERIA

The project is successful if a Team Leader can take a new event and complete the following without using spreadsheets or paper:

Create Event
→ Create Venue
→ Upload Map
→ Create Gates
→ Add Team
→ Assign Team
→ Set Arrival Times
→ Publish Instructions
→ Track Attendance
→ Handle Changes
→ Complete Event
→ Generate Report

And a team member can:

Open Link
→ Authenticate with Personal Token
→ See Event
→ See Location
→ See Task
→ See Arrival Time
→ See Map
→ Read Announcements
→ Report Issue

with minimal interaction.

---

# 78. FINAL PRODUCT STATEMENT

Operations Management is an internal event operations platform that transforms the repetitive manual process of organizing field teams into a structured digital workflow.

Instead of asking:

"Who is at Gate 3?"

"Where am I supposed to be?"

"When should I arrive?"

"Who is responsible for this gate?"

"Who is absent?"

"Who changed my assignment?"

"What is the latest instruction?"

the system provides one centralized source of truth.

The ultimate goal is:

## PEOPLE + PLACES + TASKS + TIME + COMMUNICATION

managed from one operational platform.

---

# 79. MVP SUCCESSFUL DEMO

The first impressive demonstration should show this scenario:

1. Admin logs in.
2. Admin opens "Zawraa vs Al-Shorta."
3. Event dashboard shows 32 members and 8 gates.
4. Admin opens interactive venue map.
5. Gates are visible on the map.
6. Team members are distributed visually.
7. Admin moves Amir from Gate 4 to Gate 6.
8. System records the change.
9. Amir opens his personal link.
10. Amir immediately sees Gate 6.
11. Team Leader publishes an urgent announcement.
12. Amir sees it immediately.
13. Team Leader records attendance.
14. Dashboard updates team statistics.
15. Gate 3 is shown as understaffed.
16. Team Leader assigns a reserve member.
17. Event is completed.
18. System generates the event report.

This demonstration should communicate the real value of the product within a few minutes.