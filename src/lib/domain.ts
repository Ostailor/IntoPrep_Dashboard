export const USER_ROLES = ["engineer", "admin", "staff", "ta", "instructor"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PORTAL_SECTIONS = [
  "dashboard",
  "calendar",
  "cohorts",
  "attendance",
  "students",
  "families",
  "programs",
  "academics",
  "messaging",
  "billing",
  "integrations",
  "settings",
] as const;

export type PortalSection = (typeof PORTAL_SECTIONS)[number];

export const ATTENDANCE_STATUSES = ["present", "absent", "tardy"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type SyncStatus = "healthy" | "warning" | "error";
export type ProgramTrack = "SAT" | "ACT" | "Admissions" | "Support";
export type SensitiveScopeType = "student" | "family" | "billing" | "support_case";
export type IntegrationControlState = "active" | "paused" | "maintenance";
export type BillingFollowUpState = "open" | "in_progress" | "resolved";
export type LeadStage = "inquiry" | "assessment" | "registered" | "waitlist";
export type AdminTaskType =
  | "billing_follow_up"
  | "family_communication"
  | "attendance_follow_up"
  | "score_cleanup"
  | "cohort_staffing";
export type AdminTaskStatus = "open" | "in_progress" | "done";
export type AdminTaskTargetType = "invoice" | "family" | "cohort" | "student" | "user";
export type ContactSource = "email" | "phone" | "sms" | "meeting" | "portal_message";
export type CapacityForecastState = "near_full" | "balanced" | "underfilled";
export type TaskActivityNoteType = "progress" | "handoff" | "blocker";
export type ApprovalRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ApprovalRequestType =
  | "bulk_cohort_move"
  | "staffing_change"
  | "archive_restore"
  | "billing_export"
  | "source_configuration";
export type ApprovalTargetType =
  | "cohort"
  | "session"
  | "invoice"
  | "family"
  | "integration_source";
export type AdminEscalationStatus = "open" | "acknowledged" | "closed";
export type AdminEscalationSourceType =
  | "task"
  | "lead"
  | "billing_follow_up"
  | "family"
  | "thread"
  | "cohort"
  | "session";
export type OutreachTemplateCategory =
  | "schedule_change"
  | "missed_attendance"
  | "score_follow_up"
  | "billing_handoff"
  | "general";
export type MessageThreadCategory = "attendance" | "scheduling" | "academic_follow_up";
export type AttendanceExceptionFlagType =
  | "late_pattern"
  | "missing_guardian_reply"
  | "needs_staff_follow_up";
export type SessionCoverageStatus =
  | "needs_substitute"
  | "availability_change"
  | "clear";
export type InstructorFollowUpTargetType = "student" | "session";
export type InstructorFollowUpStatus = "open" | "acknowledged" | "resolved";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  assignedCohortIds: string[];
}

export interface Lead {
  id: string;
  studentName: string;
  guardianName: string;
  targetProgram: string;
  stage: LeadStage;
  submittedAt: string;
  ownerId?: string | null;
  ownerName?: string | null;
  followUpDueAt?: string | null;
  notes?: string | null;
}

export interface Family {
  id: string;
  familyName: string;
  guardianNames: string[];
  email: string;
  phone: string;
  preferredCampusId: string;
  notes: string;
  sensitiveAccessGranted?: boolean;
}

export interface Student {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  school: string;
  targetTest: ProgramTrack;
  focus: string;
  sensitiveAccessGranted?: boolean;
}

export interface Program {
  id: string;
  name: string;
  track: ProgramTrack;
  format: string;
  tuition: number;
}

export interface Campus {
  id: string;
  name: string;
  location: string;
  modality: "In person" | "Hybrid" | "Online";
}

export interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Cohort {
  id: string;
  name: string;
  programId: string;
  campusId: string;
  termId: string;
  capacity: number;
  enrolled: number;
  leadInstructorId: string;
  taIds: string[];
  cadence: string;
  roomLabel: string;
}

export interface CohortAssignment {
  id: string;
  cohortId: string;
  userId: string;
  role: UserRole;
}

export interface Enrollment {
  id: string;
  studentId: string;
  cohortId: string;
  status: "active" | "waitlist";
  registeredAt: string;
}

export interface Session {
  id: string;
  cohortId: string;
  title: string;
  startAt: string;
  endAt: string;
  mode: "In person" | "Hybrid" | "Zoom";
  roomLabel: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
}

export interface Assessment {
  id: string;
  cohortId: string;
  title: string;
  date: string;
  sections: { label: string; score: number }[];
}

export interface AssessmentResult {
  id: string;
  assessmentId: string;
  studentId: string;
  totalScore: number;
  sectionScores: { label: string; score: number }[];
  deltaFromPrevious: number;
}

export interface ScoreTrendSnapshot {
  studentId: string;
  points: { label: string; score: number }[];
}

export interface AcademicNote {
  id: string;
  studentId: string;
  authorId: string;
  authorName?: string | null;
  visibility: "internal";
  summary: string;
  createdAt: string;
}

export interface SessionInstructionNote {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstructionalAccommodation {
  id: string;
  studentId: string;
  title: string;
  detail: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstructorFollowUpFlag {
  id: string;
  targetType: InstructorFollowUpTargetType;
  targetId: string;
  cohortId: string;
  summary: string;
  note?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: InstructorFollowUpStatus;
}

export interface Resource {
  id: string;
  cohortId: string;
  title: string;
  kind: "Worksheet" | "Deck" | "Replay";
  publishedAt: string;
  linkUrl?: string | null;
  fileName?: string | null;
}

export interface Invoice {
  id: string;
  familyId: string;
  amountDue: number | null;
  dueDate: string;
  status: "paid" | "pending" | "overdue";
  source: "QuickBooks" | "Manual";
  followUpState?: BillingFollowUpState;
  lastFollowUpAt?: string | null;
  lastFollowUpBy?: string | null;
  lastFollowUpByName?: string | null;
  sensitiveAccessGranted?: boolean;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: "ACH" | "Zelle" | "Venmo" | "QuickBooks";
  postedAt: string;
}

export interface MessageThread {
  id: string;
  cohortId: string;
  familyId?: string | null;
  category?: MessageThreadCategory | null;
  subject: string;
  participants: string[];
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MessagePost {
  id: string;
  threadId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SyncJob {
  id: string;
  label: string;
  cadence: string;
  status: SyncStatus;
  lastRunAt: string;
  summary: string;
  ownerId?: string | null;
  ownerName?: string | null;
  acknowledgedAt?: string | null;
  mutedUntil?: string | null;
  handoffNotes?: string | null;
  runbookUrl?: string | null;
}

export interface ImportRun {
  id: string;
  source: "Google Forms CSV" | "Manual CSV";
  filename: string;
  status: "completed" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  importedCount: number;
  leadCount: number;
  familyCount: number;
  studentCount: number;
  enrollmentCount: number;
  errorCount: number;
  summary: string;
  errorSamples: string[];
}

export interface IntakeSyncSource {
  id: string;
  label: string;
  sourceUrl: string;
  cadence: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lastSyncSummary: string | null;
  controlState?: IntegrationControlState;
  ownerId?: string | null;
  ownerName?: string | null;
  handoffNotes?: string | null;
  changedAt?: string | null;
  runbookUrl?: string | null;
}

export interface BillingSyncSource {
  id: string;
  label: string;
  sourceUrl: string;
  cadence: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lastSyncSummary: string | null;
  controlState?: IntegrationControlState;
  ownerId?: string | null;
  ownerName?: string | null;
  handoffNotes?: string | null;
  changedAt?: string | null;
  runbookUrl?: string | null;
}

export interface BillingSyncRun {
  status: SyncStatus;
  summary: string;
  importedCount: number;
  matchedCount: number;
  warningCount: number;
  errorSamples: string[];
}

export interface Task {
  id: string;
  ownerRole: UserRole | "all";
  title: string;
  dueLabel: string;
  status: "active" | "watch";
}

export interface BillingFollowUpNote {
  id: string;
  invoiceId: string;
  familyId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AdminTask {
  id: string;
  taskType: AdminTaskType;
  targetType: AdminTaskTargetType;
  targetId: string;
  title: string;
  details?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  dueAt?: string | null;
  status: AdminTaskStatus;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  noteType: TaskActivityNoteType;
  statusFrom?: AdminTaskStatus | null;
  statusTo?: AdminTaskStatus | null;
  createdAt: string;
}

export interface AdminSavedView {
  id: string;
  name: string;
  section: PortalSection;
  filterState: Record<string, string | string[] | boolean | number>;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyContactEvent {
  id: string;
  familyId: string;
  contactSource: ContactSource;
  summary: string;
  outcome: string;
  actorId: string | null;
  actorName: string;
  contactAt: string;
  createdAt: string;
}

export interface SessionChecklist {
  id: string;
  sessionId: string;
  roomConfirmed: boolean;
  rosterReviewed: boolean;
  materialsReady: boolean;
  familyNoticeSentIfNeeded: boolean;
  attendanceComplete: boolean;
  scoresLoggedIfNeeded: boolean;
  followUpSentIfNeeded: boolean;
  notesClosedOut: boolean;
  updatedBy?: string | null;
  updatedByName?: string | null;
  updatedAt: string;
}

export interface SessionHandoffNote {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AttendanceExceptionFlag {
  id: string;
  sessionId: string;
  studentId: string;
  flagType: AttendanceExceptionFlagType;
  note: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface SessionCoverageFlag {
  id: string;
  sessionId: string;
  status: SessionCoverageStatus;
  note: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequest {
  id: string;
  requestType: ApprovalRequestType;
  targetType: ApprovalTargetType;
  targetId: string;
  reason: string;
  handoffNote?: string | null;
  requestedBy: string;
  requestedByName: string;
  status: ApprovalRequestStatus;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface AdminEscalation {
  id: string;
  sourceType: AdminEscalationSourceType;
  sourceId: string;
  reason: string;
  handoffNote?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: AdminEscalationStatus;
}

export interface OutreachTemplate {
  id: string;
  ownerId: string;
  title: string;
  category: OutreachTemplateCategory;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  tone: "info" | "warning";
  visibleRoles: UserRole[];
  isActive: boolean;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  startsAt: string;
  expiresAt?: string | null;
}

export interface CapacityForecastRow {
  cohortId: string;
  cohortName: string;
  enrolled: number;
  capacity: number;
  fillRate: number;
  state: CapacityForecastState;
  detail: string;
}

export interface SensitiveAccessGrant {
  id: string;
  scopeType: SensitiveScopeType;
  scopeId: string;
  reason: string;
  issueReference: string;
  grantedBy: string;
  grantedByName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface EngineerSupportNote {
  id: string;
  targetType: "sync_job" | "integration_source" | "account" | "cohort" | "family" | "support_case";
  targetId: string;
  issueReference: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface FeatureFlag {
  key: string;
  description: string;
  enabledRoles: UserRole[];
  updatedBy?: string | null;
  updatedByName?: string | null;
  updatedAt: string;
}

export interface ChangeFreezeState {
  id: string;
  enabled: boolean;
  scope: string;
  reason?: string | null;
  issueReference?: string | null;
  setBy?: string | null;
  setByName?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface MaintenanceBanner {
  id: string;
  message: string;
  tone: "info" | "warning" | "error";
  issueReference?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  startsAt: string;
  expiresAt?: string | null;
}

export interface EngineerChangeLogEntry {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  createdAt: string;
  issueReference?: string | null;
}

export interface EngineerSystemStatus {
  appVersion: string;
  buildCommit: string | null;
  schemaVersion: string | null;
  currentHealth: SyncStatus;
  configDrift: {
    id: string;
    label: string;
    tone: SyncStatus;
    detail: string;
  }[];
  credentialHealth: {
    id: string;
    label: string;
    tone: SyncStatus;
    detail: string;
  }[];
}

export interface SchemaInspectorRow {
  tableName: string;
  rowCount: number;
  detail: string;
}
