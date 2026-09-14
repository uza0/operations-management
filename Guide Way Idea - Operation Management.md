{
  "project": {
    "name": "Operations Management",
    "subtitle": "Event Team & Gate Operations Platform",
    "version": "1.0.0",
    "project_type": "Internal Event Operations Management Platform",
    "status": "MVP_BUILD",
    "primary_language": "Arabic",
    "secondary_language": "English",
    "default_direction": "RTL",
    "description": "A modern internal web platform for managing event field teams, gates, working points, assignments, attendance, announcements, operational issues, venue maps, and event reports.",
    "core_positioning": "People + Places + Tasks + Time + Communication in one operational platform.",
    "important_note": "This is NOT a ticket-selling platform. It is an internal operations layer that helps event companies and field teams plan, distribute, communicate, monitor, and archive event operations."
  },

  "product_context": {
    "real_world_problem": [
      "Team Leaders manually distribute promoters and staff across stadium gates and operational points for every event.",
      "The same assignment process is repeated for every football match, concert, festival, or other event.",
      "Team members may not know their exact gate, working point, task, arrival time, or leader until they are contacted manually.",
      "When assignments change, communicating the change to the affected member is difficult.",
      "Attendance is often handled manually.",
      "Venue maps and staff assignments are usually disconnected from each other.",
      "There is no centralized operational history for assignments, changes, announcements, attendance, and issues.",
      "It is difficult to immediately identify understaffed gates.",
      "After an event, operational information can be lost instead of becoming reusable historical data."
    ],
    "solution": "Digitize the complete event team planning and field operations workflow into one centralized system.",
    "primary_users": [
      "Administrators",
      "Event Team Leaders",
      "Gate Leaders",
      "Team Members / Promoters"
    ],
    "target_use_cases": [
      "Football matches",
      "Concerts",
      "Festivals",
      "Exhibitions",
      "Conferences",
      "Promotional events",
      "Stadium operations",
      "Volunteer teams",
      "Event staffing operations"
    ]
  },

  "product_principles": {
    "mobile_first_for_members": true,
    "desktop_first_for_admin": true,
    "simple_field_experience": true,
    "secure_without_unnecessary_accounts": true,
    "real_time_when_available": true,
    "arabic_first": true,
    "responsive": true,
    "auditable": true,
    "modular_architecture": true,
    "future_ready": true,
    "avoid_overengineering_mvp": true,
    "do_not_build_unrequested_features": true
  },

  "roles": {
    "admin": {
      "name": "Admin",
      "authentication": "username_password",
      "permissions": [
        "create_events",
        "edit_events",
        "archive_events",
        "delete_events_when_safe",
        "create_venues",
        "edit_venues",
        "upload_maps",
        "create_gates",
        "create_working_points",
        "manage_team_members",
        "manage_event_team",
        "assign_members",
        "change_assignments",
        "manage_gate_leaders",
        "manage_attendance",
        "create_announcements",
        "manage_issues",
        "view_reports",
        "view_audit_logs",
        "manage_users",
        "view_all_events",
        "view_all_teams"
      ]
    },

    "event_team_leader": {
      "name": "Event Team Leader",
      "authentication": "username_password",
      "permissions": [
        "view_assigned_events",
        "manage_event_team",
        "assign_members",
        "change_assignments",
        "manage_gates",
        "manage_working_points",
        "view_event_map",
        "manage_attendance",
        "send_announcements",
        "view_and_manage_issues",
        "view_event_reports",
        "view_event_activity"
      ],
      "restriction": "Cannot manage unrelated events unless explicitly granted by Admin."
    },

    "gate_leader": {
      "name": "Gate Leader",
      "authentication": "account_or_secure_token",
      "permissions": [
        "view_assigned_gate",
        "view_assigned_members",
        "view_gate_map",
        "view_relevant_announcements",
        "record_or_confirm_attendance_when_authorized",
        "report_gate_issues",
        "view_gate_status"
      ],
      "restriction": "Cannot access unrelated gates, members, or events."
    },

    "team_member": {
      "name": "Team Member / Promoter",
      "authentication": "secure_personal_event_token_or_qr",
      "traditional_account_required": false,
      "permissions": [
        "view_own_assignment",
        "view_own_event_information",
        "view_own_gate",
        "view_own_working_point",
        "view_task",
        "view_arrival_time",
        "view_team_leader",
        "view_gate_leader",
        "view_event_map",
        "view_relevant_announcements",
        "report_issue"
      ],
      "restrictions": [
        "cannot view other members' private information",
        "cannot modify assignments",
        "cannot modify event data",
        "cannot view unrelated events",
        "cannot access admin dashboards"
      ]
    }
  },

  "security": {
    "authentication": {
      "admin": "secure authentication",
      "event_team_leader": "secure authentication",
      "gate_leader": "secure authentication or controlled token",
      "team_member": "secure random event token"
    },
    "member_access": {
      "method": "secure_random_token",
      "alternative": "QR code containing secure token",
      "must_not_use": [
        "public name search",
        "guessable member IDs",
        "sequential tokens",
        "phone-number-only authentication"
      ],
      "requirements": [
        "Token must be sufficiently random.",
        "Token must not expose database IDs.",
        "Member must only see their own assignment.",
        "Token should be revocable.",
        "Token should be rotatable.",
        "Token should be scoped to an event."
      ]
    },
    "authorization": {
      "use_rbac": true,
      "server_side_authorization_required": true,
      "never_rely_only_on_frontend_permissions": true
    },
    "audit": {
      "enabled": true,
      "track": [
        "assignment_changes",
        "event_changes",
        "gate_changes",
        "attendance_changes",
        "announcement_changes",
        "issue_status_changes",
        "permission_changes"
      ]
    },
    "privacy": {
      "principle": "minimum necessary personal data",
      "do_not_collect_unnecessary_sensitive_information": true
    }
  },

  "event_lifecycle": {
    "statuses": [
      "draft",
      "planning",
      "ready",
      "live",
      "completed",
      "archived"
    ],
    "rules": {
      "draft": "Basic event information exists but planning is incomplete.",
      "planning": "Team, gates, map, and assignments are being prepared.",
      "ready": "Event is operationally ready.",
      "live": "Event is currently active.",
      "completed": "Event operation has ended.",
      "archived": "Event is preserved for historical reporting."
    }
  },

  "event_types": [
    "football_match",
    "concert",
    "festival",
    "exhibition",
    "conference",
    "promotional_event",
    "other"
  ],

  "events": {
    "fields": [
      "id",
      "name",
      "type",
      "venue_id",
      "event_date",
      "event_start_time",
      "team_arrival_time",
      "description",
      "status",
      "created_by",
      "created_at",
      "updated_at"
    ],
    "required_fields": [
      "name",
      "type",
      "venue_id",
      "event_date",
      "event_start_time",
      "team_arrival_time"
    ],
    "features": [
      "create",
      "edit",
      "duplicate",
      "archive",
      "view",
      "change_status"
    ]
  },

  "venues": {
    "fields": [
      "id",
      "name",
      "address",
      "description",
      "map_image_url",
      "created_at",
      "updated_at"
    ],
    "features": [
      "create_venue",
      "edit_venue",
      "upload_map",
      "replace_map",
      "view_map"
    ]
  },

  "interactive_map": {
    "purpose": "Visually connect venue locations with operational assignments.",
    "technology_preference": [
      "Konva.js",
      "React-Konva",
      "equivalent_canvas_library"
    ],
    "features": [
      "upload_venue_image",
      "zoom",
      "pan",
      "drag_and_drop_markers",
      "select_marker",
      "edit_marker",
      "delete_marker",
      "duplicate_marker",
      "marker_toolbox",
      "responsive_map",
      "member_location_highlight",
      "gate_highlight",
      "working_point_highlight"
    ],
    "marker_types": [
      "gate",
      "working_point",
      "vip_entrance",
      "scanner_point",
      "wristband_point",
      "team_leader",
      "gate_leader",
      "team_member",
      "information_point",
      "emergency_point",
      "staff_entrance",
      "player_entrance",
      "other"
    ],
    "marker_fields": [
      "id",
      "event_id",
      "type",
      "name",
      "description",
      "x",
      "y",
      "linked_entity_type",
      "linked_entity_id"
    ],
    "coordinate_system": {
      "type": "relative",
      "x_range": "0-1",
      "y_range": "0-1",
      "reason": "Relative coordinates keep markers responsive across different screen sizes."
    }
  },

  "gates": {
    "fields": [
      "id",
      "event_id",
      "name",
      "type",
      "description",
      "capacity",
      "required_staff",
      "status",
      "leader_id",
      "map_x",
      "map_y",
      "created_at",
      "updated_at"
    ],
    "types": [
      "general",
      "vip",
      "staff",
      "players",
      "media",
      "other"
    ],
    "statuses": [
      "inactive",
      "ready",
      "active",
      "closed"
    ],
    "staffing_logic": {
      "required_staff": "Number of people required for the gate.",
      "assigned_staff": "Number of people currently assigned.",
      "difference": "required_staff - assigned_staff",
      "status_rules": {
        "understaffed": "assigned_staff < required_staff",
        "adequate": "assigned_staff == required_staff",
        "overstaffed": "assigned_staff > required_staff"
      }
    },
    "example": {
      "gate": "Gate 4",
      "required_staff": 5,
      "assigned_staff": 3,
      "difference": 2,
      "display": "Needs 2 more staff"
    }
  },

  "working_points": {
    "purpose": "Allow assignment to operational points that are not necessarily physical gates.",
    "types": [
      "scanner_area",
      "wristband_area",
      "vip_area",
      "information_point",
      "crowd_guidance",
      "staff_entrance",
      "player_entrance",
      "emergency_point",
      "technical_point",
      "other"
    ],
    "fields": [
      "id",
      "event_id",
      "name",
      "type",
      "description",
      "required_staff",
      "map_x",
      "map_y",
      "status"
    ]
  },

  "team_members": {
    "fields": [
      "id",
      "full_name",
      "phone",
      "employee_code",
      "active",
      "created_at",
      "updated_at"
    ],
    "principles": [
      "Keep personal information minimal.",
      "A team member can exist independently from an authentication account.",
      "The same person can participate in multiple events.",
      "Event participation must be separate from permanent team member identity."
    ]
  },

  "event_members": {
    "purpose": "Represent a team member participating in a specific event.",
    "fields": [
      "id",
      "event_id",
      "team_member_id",
      "participation_status",
      "secure_event_token",
      "token_expires_at",
      "created_at"
    ],
    "participation_statuses": [
      "invited",
      "confirmed",
      "active",
      "cancelled"
    ]
  },

  "assignments": {
    "purpose": "Define where, when, and how a team member works during an event.",
    "fields": [
      "id",
      "event_id",
      "team_member_id",
      "gate_id",
      "working_point_id",
      "task",
      "arrival_time",
      "shift_start",
      "shift_end",
      "is_gate_leader",
      "notes",
      "status",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at"
    ],
    "tasks": [
      "electronic_ticket_scanning",
      "paper_ticket_collection",
      "crowd_guidance",
      "wristband_distribution",
      "vip_management",
      "information",
      "gate_management",
      "security_support",
      "technical_support",
      "other"
    ],
    "statuses": [
      "assigned",
      "confirmed",
      "changed",
      "cancelled"
    ],
    "rules": [
      "A member can have multiple assignments only if their time ranges do not conflict.",
      "An assignment must belong to the selected event.",
      "A member cannot be assigned to a deleted gate.",
      "A member cannot be assigned to a deleted working point.",
      "The system should warn about time conflicts before saving.",
      "A member should be assignable to either a gate or working point.",
      "Assignment changes must be recorded in the audit log."
    ]
  },

  "assignment_change_history": {
    "enabled": true,
    "example": {
      "member": "Amir",
      "previous_location": "Gate 4",
      "new_location": "Gate 6",
      "changed_by": "Team Leader",
      "changed_at": "2026-09-13T17:14:00",
      "reason": "Gate 6 requires additional staff"
    },
    "fields": [
      "id",
      "event_id",
      "assignment_id",
      "member_id",
      "previous_gate_id",
      "new_gate_id",
      "previous_working_point_id",
      "new_working_point_id",
      "previous_task",
      "new_task",
      "reason",
      "changed_by",
      "changed_at"
    ]
  },

  "attendance": {
    "statuses": [
      "present",
      "late",
      "absent",
      "excused"
    ],
    "fields": [
      "id",
      "event_id",
      "team_member_id",
      "status",
      "check_in_time",
      "check_out_time",
      "recorded_by",
      "notes",
      "created_at",
      "updated_at"
    ],
    "mvp": {
      "method": "manual",
      "implemented_by": [
        "Admin",
        "Event Team Leader"
      ]
    },
    "future": [
      "qr_check_in",
      "secure_token_check_in",
      "optional_geofence",
      "automatic_timestamp"
    ]
  },

  "announcements": {
    "fields": [
      "id",
      "event_id",
      "title",
      "message",
      "priority",
      "audience_type",
      "target_gate_id",
      "target_working_point_id",
      "target_member_id",
      "created_by",
      "created_at",
      "expires_at"
    ],
    "priority_levels": [
      "normal",
      "important",
      "urgent"
    ],
    "audiences": [
      "entire_event_team",
      "specific_gate",
      "specific_working_point",
      "specific_member"
    ],
    "mvp_delivery": "In-app announcements",
    "future_delivery": [
      "browser_push_notifications",
      "mobile_push_notifications",
      "authorized_external_messaging"
    ]
  },

  "issues": {
    "purpose": "Allow field staff to report operational problems during an event.",
    "types": [
      "scanner_problem",
      "crowd_congestion",
      "missing_staff",
      "ticket_problem",
      "wristband_problem",
      "security_problem",
      "technical_problem",
      "other"
    ],
    "priorities": [
      "low",
      "medium",
      "high",
      "critical"
    ],
    "statuses": [
      "open",
      "acknowledged",
      "in_progress",
      "resolved",
      "closed"
    ],
    "fields": [
      "id",
      "event_id",
      "reporter_id",
      "gate_id",
      "working_point_id",
      "issue_type",
      "description",
      "priority",
      "status",
      "created_at",
      "acknowledged_at",
      "resolved_at",
      "resolved_by"
    ],
    "mvp": {
      "required": false,
      "architecture_ready": true
    }
  },

  "event_timeline": {
    "purpose": "Represent operational milestones throughout the event.",
    "example_milestones": [
      "team_arrival",
      "team_briefing",
      "gate_preparation",
      "scanner_preparation",
      "crowd_arrival",
      "scanning_start",
      "event_start",
      "gate_closing",
      "team_checkout"
    ],
    "fields": [
      "id",
      "event_id",
      "title",
      "description",
      "scheduled_time",
      "status",
      "created_at",
      "updated_at"
    ],
    "statuses": [
      "upcoming",
      "active",
      "completed",
      "cancelled"
    ]
  },

  "reserve_team": {
    "purpose": "Maintain backup staff who can replace unavailable or overloaded team members.",
    "example": {
      "active_staff": 28,
      "reserve_staff": 4
    },
    "replacement_flow": [
      "select_original_member",
      "select_replacement_member",
      "select_gate_or_point",
      "enter_reason",
      "confirm_replacement",
      "record_change_in_audit_log"
    ],
    "mvp": false,
    "phase": 2
  },

  "member_portal": {
    "route_pattern": "/member/{eventToken}",
    "authentication": "secure_event_token",
    "mobile_first": true,
    "primary_goal": "Answer the member's operational questions immediately.",
    "priority_information": [
      "Where do I go?",
      "When do I arrive?",
      "What is my task?",
      "Who is my leader?",
      "What are the latest instructions?",
      "How do I report a problem?"
    ],
    "sections": [
      "welcome",
      "event_information",
      "arrival_time",
      "assigned_gate",
      "assigned_working_point",
      "task",
      "gate_leader",
      "event_team_leader",
      "view_map",
      "announcements",
      "report_issue"
    ],
    "ui_requirements": [
      "Large touch targets",
      "Very clear gate/location display",
      "Clear arrival time",
      "Minimal navigation",
      "Fast loading",
      "Mobile responsive",
      "Arabic RTL by default"
    ],
    "privacy": [
      "Only show the current member's information.",
      "Do not expose other members.",
      "Do not expose unnecessary phone numbers."
    ]
  },

  "admin_dashboard": {
    "route": "/admin",
    "widgets": [
      "active_events",
      "upcoming_events",
      "completed_events",
      "total_team_members",
      "attendance_summary",
      "open_issues",
      "recent_events",
      "recent_activity"
    ],
    "quick_actions": [
      "create_event",
      "create_venue",
      "add_team_member",
      "open_active_event"
    ]
  },

  "team_leader_dashboard": {
    "route": "/leader",
    "widgets": [
      "assigned_events",
      "upcoming_event",
      "team_count",
      "attendance_summary",
      "understaffed_gates",
      "open_issues",
      "recent_announcements"
    ]
  },

  "event_dashboard": {
    "route_pattern": "/admin/events/{id}",
    "sections": [
      "overview",
      "map",
      "gates",
      "team",
      "assignments",
      "attendance",
      "timeline",
      "announcements",
      "issues",
      "reports",
      "activity"
    ]
  },

  "map_editor": {
    "layout": {
      "left_panel": "toolbox",
      "center": "interactive_canvas",
      "right_panel": "properties"
    },
    "tools": [
      "select",
      "gate",
      "working_point",
      "vip_entrance",
      "scanner",
      "wristband",
      "team_leader",
      "gate_leader",
      "member",
      "information",
      "emergency"
    ],
    "properties_panel": [
      "name",
      "type",
      "description",
      "status",
      "assigned_member",
      "gate_leader",
      "linked_entity"
    ],
    "actions": [
      "save",
      "delete",
      "duplicate",
      "move",
      "edit"
    ]
  },

  "assignment_interface": {
    "views": [
      "list_view",
      "map_view"
    ],
    "list_columns": [
      "member",
      "location",
      "task",
      "leader",
      "arrival_time",
      "shift",
      "status"
    ],
    "features": [
      "filter_by_gate",
      "filter_by_task",
      "filter_by_status",
      "search_member",
      "assign_member",
      "reassign_member",
      "bulk_assignment_when_safe",
      "conflict_warning",
      "understaffing_warning"
    ]
  },

  "live_operations": {
    "purpose": "Provide Team Leaders with a real-time operational overview.",
    "mvp": false,
    "phase": 2,
    "dashboard_elements": [
      "present_staff",
      "late_staff",
      "absent_staff",
      "gate_staffing",
      "gate_status",
      "open_issues",
      "urgent_announcements",
      "event_timeline"
    ],
    "gate_status_example": {
      "gate": "Gate 2",
      "staffing": "2/5",
      "status": "understaffed"
    }
  },

  "reports": {
    "event_report": {
      "sections": [
        "event_information",
        "venue",
        "team_size",
        "attendance",
        "gate_distribution",
        "assignment_summary",
        "issues",
        "announcements",
        "assignment_changes",
        "timeline",
        "notes"
      ]
    },
    "exports": [
      "PDF",
      "XLSX"
    ],
    "map_export": {
      "supported": true,
      "formats": [
        "PNG",
        "PDF"
      ]
    },
    "mvp": {
      "basic_report": true,
      "advanced_export": false
    }
  },

  "audit_logs": {
    "fields": [
      "id",
      "event_id",
      "actor_user_id",
      "action",
      "entity_type",
      "entity_id",
      "old_values",
      "new_values",
      "reason",
      "created_at"
    ],
    "actions": [
      "created",
      "updated",
      "deleted",
      "assigned",
      "reassigned",
      "attendance_updated",
      "announcement_created",
      "issue_updated",
      "status_changed"
    ],
    "ui_example": "Changed by Ahmed · 5:14 PM",
    "visibility": {
      "admin": true,
      "event_team_leader": true,
      "gate_leader": false,
      "team_member": false
    }
  },

  "notifications": {
    "mvp": [
      "in_app_announcements"
    ],
    "future": [
      "browser_push",
      "mobile_push",
      "email",
      "authorized_external_messaging"
    ]
  },

  "database": {
    "engine": "PostgreSQL",
    "recommended_provider": "Supabase",
    "entities": [
      "users",
      "team_members",
      "venues",
      "events",
      "event_members",
      "gates",
      "working_points",
      "assignments",
      "assignment_change_history",
      "attendance",
      "announcements",
      "issues",
      "event_timeline",
      "map_markers",
      "audit_logs"
    ],
    "data_model_rules": [
      "Do not mix person identity, authentication account, event membership, and assignment into one table.",
      "A Team Member is a person.",
      "A User is an authenticated operator.",
      "Event Membership means the person participates in a specific event.",
      "Assignment defines location and task for that event.",
      "Attendance belongs to event participation.",
      "Announcements belong to events and may target specific audiences.",
      "Issues belong to events.",
      "Audit logs track operational changes."
    ]
  },

  "database_relationships": {
    "users_to_events": "One user can manage multiple events depending on role.",
    "venues_to_events": "One venue can host multiple events.",
    "events_to_gates": "One event has many gates.",
    "events_to_working_points": "One event has many working points.",
    "events_to_event_members": "One event has many participants.",
    "team_members_to_event_members": "One team member can participate in many events.",
    "events_to_assignments": "One event has many assignments.",
    "team_members_to_assignments": "One member can have multiple non-conflicting assignments.",
    "gates_to_assignments": "A gate can have many assignments.",
    "working_points_to_assignments": "A working point can have many assignments.",
    "events_to_attendance": "One event has attendance records.",
    "events_to_announcements": "One event has many announcements.",
    "events_to_issues": "One event has many issues.",
    "events_to_timeline": "One event has many timeline milestones.",
    "events_to_map_markers": "One event has many map markers.",
    "events_to_audit_logs": "One event has many audit records."
  },

  "mvp": {
    "goal": "Solve the real recurring manual Team Leader workflow without unnecessary complexity.",
    "features": [
      "admin_login",
      "team_leader_login",
      "event_creation",
      "venue_creation",
      "venue_map_upload",
      "interactive_map",
      "gate_creation",
      "working_point_creation",
      "team_member_management",
      "event_team_management",
      "team_assignment",
      "arrival_time",
      "task_assignment",
      "secure_member_token",
      "member_portal",
      "member_map",
      "announcements",
      "manual_attendance",
      "basic_event_dashboard",
      "basic_audit_log",
      "basic_event_report"
    ],
    "must_work_end_to_end": [
      "Create event.",
      "Create or select venue.",
      "Upload venue map.",
      "Create gates.",
      "Set required staff per gate.",
      "Add team members.",
      "Assign team members to gates or working points.",
      "Set task and arrival time.",
      "Generate secure member token.",
      "Open member portal.",
      "Display assignment on member portal.",
      "Change assignment.",
      "Immediately reflect new assignment.",
      "Record assignment change in audit log.",
      "Send announcement.",
      "Display announcement to member.",
      "Record attendance.",
      "Display event operational summary."
    ]
  },

  "mvp_exclusions": {
    "features": [
      "AI",
      "machine_learning",
      "predictive_crowd_analysis",
      "GPS_tracking",
      "mandatory_geofencing",
      "WhatsApp_API",
      "SMS_gateway",
      "ticket_platform_integration",
      "payments",
      "payroll",
      "complex_HR",
      "native_mobile_apps",
      "advanced_analytics"
    ],
    "reason": "The MVP must validate the operational workflow before adding complex integrations and automation."
  },

  "phase_2": {
    "features": [
      "QR_check_in",
      "push_notifications",
      "gate_leader_accounts",
      "reserve_team",
      "live_operations_dashboard",
      "issue_reporting",
      "event_timeline",
      "PDF_export",
      "XLSX_export",
      "advanced_audit",
      "offline_caching"
    ]
  },

  "phase_3": {
    "features": [
      "smart_staff_allocation",
      "ticket_volume_based_staffing_recommendations",
      "authorized_ticket_platform_integration",
      "attendance_analytics",
      "performance_analytics",
      "gate_performance",
      "crowd_distribution_analysis",
      "operational_efficiency_metrics"
    ]
  },

  "smart_allocation": {
    "future_feature": true,
    "purpose": "Recommend optimal staff distribution based on event conditions.",
    "inputs": [
      "expected_ticket_count",
      "gate_capacity",
      "gate_type",
      "historical_crowd_data",
      "available_staff",
      "gate_importance",
      "expected_peak_time"
    ],
    "outputs": [
      "recommended_staff_per_gate",
      "understaffed_gate_warnings",
      "overstaffed_gate_warnings",
      "reserve_staff_recommendation"
    ],
    "decision_authority": "Team Leader",
    "rule": "The system recommends; the Team Leader remains responsible for the final assignment."
  },

  "ticket_platform_integration": {
    "mvp": false,
    "future": true,
    "architecture": {
      "flow": [
        "Ticket Platform",
        "Authorized API",
        "Ticket Data",
        "Operations Management",
        "Expected Gate Volume",
        "Staffing Recommendation"
      ]
    },
    "requirements": [
      "Use only authorized APIs.",
      "Do not scrape private systems.",
      "Do not modify ticketing data without explicit authorization.",
      "Keep the operations system usable without ticketing integration."
    ]
  },

  "offline_strategy": {
    "mvp": {
      "full_offline": false,
      "architecture_should_be_ready": true
    },
    "future": [
      "cache member assignment",
      "cache venue map",
      "cache critical announcements",
      "queue non-critical actions",
      "sync when connection returns"
    ],
    "priority": "Member portal should remain usable on weak mobile networks."
  },

  "technology": {
    "frontend": {
      "framework": "Next.js",
      "library": "React",
      "language": "TypeScript",
      "styling": "Tailwind CSS",
      "ui": "modern_component_based_UI"
    },
    "backend": {
      "preferred": "Next.js API/server actions or Node.js backend",
      "api_style": "REST or equivalent clean service architecture"
    },
    "database": {
      "engine": "PostgreSQL",
      "preferred_provider": "Supabase"
    },
    "authentication": {
      "preferred": "Supabase Auth"
    },
    "storage": {
      "preferred": "Supabase Storage",
      "usage": [
        "venue_map_images",
        "future_report_assets"
      ]
    },
    "realtime": {
      "preferred": "Supabase Realtime",
      "use_cases": [
        "assignment_updates",
        "announcements",
        "attendance_updates",
        "live_operations"
      ]
    },
    "map": {
      "preferred": "Konva.js or React-Konva"
    },
    "deployment": {
      "preferred": "Vercel"
    }
  },

  "supabase_requirements": {
    "if_used": true,
    "requirements": [
      "Use PostgreSQL relational design.",
      "Use Row Level Security where appropriate.",
      "Never expose service-role keys to the browser.",
      "Keep privileged operations server-side.",
      "Use secure storage policies.",
      "Use indexed foreign keys and common query fields.",
      "Use database constraints for important integrity rules.",
      "Use migrations instead of manually modifying production schema.",
      "Use environment variables for secrets.",
      "Do not hardcode credentials."
    ]
  },

  "routes": {
    "public": [
      "/member/{eventToken}"
    ],
    "authentication": [
      "/login"
    ],
    "admin": [
      "/admin",
      "/admin/events",
      "/admin/events/new",
      "/admin/events/{id}",
      "/admin/events/{id}/map",
      "/admin/events/{id}/team",
      "/admin/events/{id}/assignments",
      "/admin/events/{id}/attendance",
      "/admin/events/{id}/announcements",
      "/admin/events/{id}/issues",
      "/admin/events/{id}/reports",
      "/admin/events/{id}/activity",
      "/admin/team",
      "/admin/venues",
      "/admin/settings"
    ],
    "leader": [
      "/leader",
      "/leader/events",
      "/leader/events/{id}",
      "/leader/events/{id}/team",
      "/leader/events/{id}/map",
      "/leader/events/{id}/attendance",
      "/leader/events/{id}/issues"
    ]
  },

  "design_system": {
    "style": "professional modern operational premium",
    "visual_character": [
      "clean",
      "high_contrast",
      "efficient",
      "trustworthy",
      "fast",
      "professional"
    ],
    "avoid": [
      "generic_admin_template",
      "banking_dashboard_style",
      "social_media_style",
      "ticket_marketplace_style",
      "excessive_gradients",
      "excessive_animations",
      "cluttered_UI"
    ],
    "colors": {
      "operational": "green",
      "warning": "yellow_or_amber",
      "critical": "red",
      "information": "blue_or_neutral"
    },
    "rule": "Do not rely on color alone. Always combine color with text, icon, or status label."
  },

  "internationalization": {
    "default_language": "ar",
    "default_direction": "rtl",
    "supported_languages": [
      "ar",
      "en"
    ],
    "requirements": [
      "Do not hardcode Arabic strings directly into components.",
      "Use translation dictionaries.",
      "Switch direction automatically between RTL and LTR.",
      "Arabic should feel native, not translated as an afterthought.",
      "Use a modern Arabic font such as IBM Plex Sans Arabic, Noto Sans Arabic, or equivalent."
    ]
  },

  "responsive_design": {
    "desktop": true,
    "tablet": true,
    "mobile": true,
    "priority_devices": [
      "Android phones",
      "iPhones",
      "tablets",
      "laptops"
    ],
    "member_portal_priority": "mobile",
    "admin_priority": "desktop_tablet"
  },

  "accessibility": {
    "requirements": [
      "Large touch targets.",
      "Readable text.",
      "High contrast.",
      "Keyboard accessibility on desktop.",
      "Icons should have labels or accessible names.",
      "Do not communicate important state through color alone.",
      "Form validation must be clear.",
      "Error messages must be understandable."
    ]
  },

  "error_handling": {
    "rules": [
      "Warn if a member already has an overlapping assignment.",
      "Prevent deleting a gate that still has assigned members unless assignments are reassigned.",
      "Prevent deleting a working point that still has assignments.",
      "Warn if a gate is understaffed before event status becomes Ready.",
      "Show loading states.",
      "Show empty states.",
      "Show meaningful error states.",
      "Use confirmation dialogs for destructive actions.",
      "Do not silently discard unsaved changes."
    ]
  },

  "performance": {
    "requirements": [
      "Fast member portal on mid-range Android devices.",
      "Optimize venue map images.",
      "Lazy-load large assets when appropriate.",
      "Avoid unnecessary animations.",
      "Keep map dragging and zooming smooth.",
      "Avoid unnecessary database queries.",
      "Use pagination for large lists.",
      "Use indexes for common filters and foreign keys."
    ]
  },

  "demo_data": {
    "purpose": "The first launch should immediately demonstrate the product's real-world value.",
    "event": {
      "name": "Al-Zawraa vs Al-Shorta",
      "type": "football_match",
      "venue": "Stadium Demo",
      "status": "planning"
    },
    "gates": 8,
    "team_members": 32,
    "gate_leaders": 4,
    "team_leaders": 1,
    "assignments": true,
    "attendance": true,
    "announcements": true,
    "issues": true,
    "timeline": true,
    "map": true,
    "demo_scenarios": [
      "Admin opens event dashboard.",
      "Admin views 32 team members.",
      "Admin views 8 gates.",
      "One gate is intentionally understaffed.",
      "Team Leader assigns a reserve member.",
      "Amir is initially assigned to Gate 4.",
      "Team Leader moves Amir to Gate 6.",
      "Audit log records the change.",
      "Amir opens his secure member link.",
      "Amir sees Gate 6.",
      "Team Leader sends an urgent announcement.",
      "Amir sees the announcement.",
      "Team Leader records attendance.",
      "Dashboard updates attendance.",
      "Event report summarizes operations."
    ]
  },

  "user_experience_flow": {
    "admin_flow": [
      "Login",
      "Open dashboard",
      "Create event",
      "Select or create venue",
      "Upload map",
      "Create gates",
      "Set gate staffing requirements",
      "Create working points",
      "Add team members",
      "Add members to event",
      "Assign members",
      "Review staffing",
      "Set event to Ready",
      "Monitor event",
      "Complete event",
      "Generate report",
      "Archive event"
    ],
    "team_leader_flow": [
      "Login",
      "Open assigned event",
      "Review map",
      "Review gates",
      "Review team",
      "Assign members",
      "Check staffing",
      "Publish announcements",
      "Record attendance",
      "Handle issues",
      "Change assignments if necessary",
      "Review activity",
      "Complete event"
    ],
    "member_flow": [
      "Open secure personal event link",
      "See event",
      "See arrival time",
      "See assigned gate",
      "See assigned task",
      "See leader",
      "Open map",
      "Read announcements",
      "Report issue if necessary"
    ]
  },

  "operational_rules": {
    "readiness": [
      "Event should not be marked Ready if critical required data is missing.",
      "Understaffed gates should be clearly visible.",
      "Every active event member should have an assignment unless explicitly marked unassigned.",
      "Every assignment should have a task.",
      "Every assignment should have a location unless intentionally marked mobile/roaming."
    ],
    "assignment": [
      "Do not allow accidental conflicting assignments.",
      "Allow Team Leader to reassign members.",
      "Require confirmation for significant changes when appropriate.",
      "Record all important changes."
    ],
    "member_visibility": [
      "Member sees only their own assignment.",
      "Member sees event-wide announcements.",
      "Member sees announcements targeted to their gate or account.",
      "Member does not see other members' private information."
    ]
  },

  "future_business_model": {
    "potential_users": [
      "event management companies",
      "ticketing companies",
      "stadiums",
      "sports clubs",
      "concert organizers",
      "festival organizers",
      "exhibition companies",
      "conference organizers",
      "security staffing companies",
      "promotional teams",
      "volunteer organizations"
    ],
    "product_direction": "Keep the platform organization-agnostic. Do not hardcode it specifically for one stadium, club, or company."
  },

  "naming_and_branding": {
    "product_name": "Operations Management",
    "subtitle": "Event Team & Gate Operations Platform",
    "alternative_internal_description": "Event Operations Management System",
    "do_not_position_as": [
      "staff list app",
      "promoter list",
      "ticket selling system",
      "simple attendance app"
    ]
  },

  "acceptance_criteria": {
    "authentication": [
      "Admin can log in securely.",
      "Event Team Leader can log in securely.",
      "Unauthorized users cannot access protected dashboards."
    ],
    "event_management": [
      "Admin can create an event.",
      "Admin can edit event information.",
      "Event has a lifecycle status."
    ],
    "venue": [
      "Admin can create a venue.",
      "Admin can upload a venue map.",
      "Map displays correctly on desktop and mobile."
    ],
    "gates": [
      "Admin can create gates.",
      "Each gate has required staff.",
      "System calculates assigned versus required staff.",
      "Understaffed gates are visually identifiable."
    ],
    "team": [
      "Admin can create team members.",
      "Admin can add members to an event.",
      "Team Leader can assign members.",
      "Assignments contain location, task, and arrival time."
    ],
    "map": [
      "Gates can be placed on the map.",
      "Working points can be placed on the map.",
      "Markers can be moved.",
      "Marker coordinates remain responsive."
    ],
    "member_portal": [
      "Member can open secure personal event URL.",
      "Member sees their current assignment.",
      "Member sees arrival time.",
      "Member sees task.",
      "Member sees gate or working point.",
      "Member can view the map.",
      "Member can read announcements."
    ],
    "changes": [
      "Team Leader can reassign a member.",
      "Member portal reflects the updated assignment.",
      "Assignment change is recorded in audit history."
    ],
    "announcements": [
      "Team Leader can send an event-wide announcement.",
      "Member can see it.",
      "Urgent announcements are visually distinct."
    ],
    "attendance": [
      "Team Leader can mark a member Present.",
      "Team Leader can mark Late, Absent, or Excused.",
      "Attendance summary is visible in dashboard."
    ],
    "security": [
      "Member token cannot be guessed easily.",
      "Member cannot access another member's data.",
      "Privileged credentials are never exposed to the frontend."
    ]
  },

  "implementation_instructions_for_fable": {
    "role": "Act as a senior product engineer, UX designer, frontend engineer, backend engineer, and database architect.",
    "source_of_truth": true,
    "instructions": [
      "Treat this JSON as the main product specification.",
      "Build the MVP first.",
      "Do not implement Phase 2 or Phase 3 features unless required for architecture compatibility.",
      "Do not add unrelated features.",
      "Do not turn the product into a generic CRM, HR system, ticketing platform, or social platform.",
      "Prioritize the real Team Leader workflow.",
      "Make the member experience extremely simple.",
      "Make the admin and Team Leader interfaces operationally efficient.",
      "Use modular architecture so future features can be added without rewriting the MVP.",
      "Use realistic demo data.",
      "Use Arabic RTL as the default interface.",
      "Ensure English LTR support is structurally possible.",
      "Implement server-side authorization.",
      "Implement secure member tokens.",
      "Implement audit history for important operational changes.",
      "Implement validation and conflict detection.",
      "Optimize for mobile field usage.",
      "Keep the interactive map responsive.",
      "Do not use placeholder functionality where the MVP requires real functionality."
    ]
  },

  "deliverables": {
    "application": true,
    "database_schema": true,
    "database_migrations": true,
    "seed_data": true,
    "authentication": true,
    "authorization": true,
    "responsive_ui": true,
    "member_portal": true,
    "interactive_map": true,
    "audit_log": true,
    "README": true,
    "environment_example": true,
    "basic_tests": true,
    "deployment_instructions": true
  },

  "final_quality_bar": {
    "must_feel_like": [
      "a real internal operations product",
      "a production-oriented system",
      "a tool that a Team Leader could actually use during an event",
      "a system designed around field operations rather than database records"
    ],
    "must_not_feel_like": [
      "a school project",
      "a generic CRUD dashboard",
      "a static prototype",
      "a simple employee list",
      "a ticket marketplace"
    ],
    "success_definition": "A Team Leader should be able to create an event, prepare the venue map, define gates, distribute the team, communicate changes, monitor attendance, and review the event afterward without relying on scattered WhatsApp messages, spreadsheets, or manual lists."
  }
}