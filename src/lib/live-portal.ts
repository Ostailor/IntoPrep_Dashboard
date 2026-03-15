import {
  USER_ROLES,
  type AcademicNote,
  type AccountStatus,
  type Assessment,
  type AssessmentResult,
  type BillingSyncSource,
  type Campus,
  type Cohort,
  type Enrollment,
  type Family,
  type ImportRun,
  type IntakeSyncSource,
  type Invoice,
  type Lead,
  type MessagePost,
  type MessageThread,
  type Program,
  type ProgramTrack,
  type Resource,
  type Session,
  type SyncStatus,
  type SyncJob,
  type Student,
  type Term,
  type User,
  type UserRole,
} from "@/lib/domain";
import {
  canRunIntakeImports,
  getPermissionProfile,
  hasGlobalPortalScope,
} from "@/lib/permissions";
import { RESOURCE_BUCKET_NAME } from "@/lib/live-writes";
import type { Database, Json } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type CampusRow = Database["public"]["Tables"]["campuses"]["Row"];
type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];
type AssessmentResultRow = Database["public"]["Tables"]["assessment_results"]["Row"];
type AcademicNoteRow = Database["public"]["Tables"]["academic_notes"]["Row"];
type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type MessageThreadRow = Database["public"]["Tables"]["message_threads"]["Row"];
type MessagePostRow = Database["public"]["Tables"]["message_posts"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type SyncJobRow = Database["public"]["Tables"]["sync_jobs"]["Row"];
type BillingSyncSourceRow = Database["public"]["Tables"]["billing_sync_sources"]["Row"];
type IntakeSyncSourceRow = Database["public"]["Tables"]["intake_sync_sources"]["Row"];
type IntakeImportRunRow = Database["public"]["Tables"]["intake_import_runs"]["Row"];
type CohortAssignmentRow = Database["public"]["Tables"]["cohort_assignments"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserTemplateRow = Database["public"]["Tables"]["user_templates"]["Row"];
type AccountAuditLogRow = Database["public"]["Tables"]["account_audit_logs"]["Row"];

export interface LiveSettingsRoleStats {
  activeUsers: Record<UserRole, number>;
  suspendedUsers: Record<UserRole, number>;
  templateUsers: Record<UserRole, number>;
  assignmentLinks: Record<UserRole, number>;
}

export interface LiveSettingsUserRow {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  title: string;
  assignedCohortIds: string[];
  templateRole: UserRole | null;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
}

export interface LiveSettingsAuditRow {
  id: string;
  actorName: string;
  targetLabel: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface LivePortalBundle {
  currentDate: string;
  visiblePrograms: Program[];
  visibleCampuses: Campus[];
  visibleTerms: Term[];
  visibleUsers: User[];
  visibleCohorts: Cohort[];
  visibleSessions: Session[];
  visibleEnrollments: Enrollment[];
  visibleStudents: Student[];
  visibleFamilies: Family[];
  visibleAssessments: Assessment[];
  visibleResults: AssessmentResult[];
  visibleNotes: AcademicNote[];
  visibleResources: Resource[];
  visibleInvoices: Invoice[];
  visibleThreads: MessageThread[];
  visibleThreadPosts: Record<string, MessagePost[]>;
  visibleLeads: Lead[];
  visibleSyncJobs: SyncJob[];
  visibleImportRuns: ImportRun[];
  intakeSyncSource: IntakeSyncSource | null;
  billingSyncSource: BillingSyncSource | null;
  settingsRoleStats: LiveSettingsRoleStats | null;
  settingsUsers: LiveSettingsUserRow[] | null;
  settingsAuditLogs: LiveSettingsAuditRow[] | null;
}

function getNewYorkDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeTrack(value: string): ProgramTrack {
  switch (value) {
    case "SAT":
    case "ACT":
    case "Admissions":
    case "Support":
      return value;
    default:
      return "Support";
  }
}

function normalizeMode(value: string): Session["mode"] {
  switch (value) {
    case "In person":
    case "Hybrid":
    case "Zoom":
      return value;
    default:
      return "Hybrid";
  }
}

function normalizeCampusModality(value: string): Campus["modality"] {
  switch (value) {
    case "In person":
    case "Hybrid":
    case "Online":
      return value;
    default:
      return "Hybrid";
  }
}

function parseScoreArray(value: Json): { label: string; score: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const label = typeof entry.label === "string" ? entry.label : null;
    const score = typeof entry.score === "number" ? entry.score : null;

    return label !== null && score !== null ? [{ label, score }] : [];
  });
}

function normalizeSyncStatus(value: string): SyncStatus | null {
  switch (value) {
    case "healthy":
    case "warning":
    case "error":
      return value;
    default:
      return null;
  }
}

function mapIntakeSyncSource(row: IntakeSyncSourceRow): IntakeSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status ? normalizeSyncStatus(row.last_sync_status) : null,
    lastSyncSummary: row.last_sync_summary,
  };
}

function mapBillingSyncSource(row: BillingSyncSourceRow): BillingSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status ? normalizeSyncStatus(row.last_sync_status) : null,
    lastSyncSummary: row.last_sync_summary,
  };
}

function createEmptyRoleCounts(): Record<UserRole, number> {
  return USER_ROLES.reduce(
    (counts, role) => ({
      ...counts,
      [role]: 0,
    }),
    {} as Record<UserRole, number>,
  );
}

async function getAccessibleCohortIds(viewer: User) {
  if (hasGlobalPortalScope(viewer.role)) {
    return null;
  }

  if (viewer.assignedCohortIds.length > 0) {
    return viewer.assignedCohortIds;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("cohort_assignments")
    .select("cohort_id")
    .eq("user_id", viewer.id);

  return ((data ?? []) as Pick<CohortAssignmentRow, "cohort_id">[]).map(
    (assignment) => assignment.cohort_id,
  );
}

export async function getLivePortalBundle(
  viewer: User,
): Promise<LivePortalBundle | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const currentDate = getNewYorkDate();
  const accessibleCohortIds = await getAccessibleCohortIds(viewer);

  const cohortQuery = serviceClient.from("cohorts").select("*").order("name", { ascending: true });
  const scopedCohortQuery =
    accessibleCohortIds && accessibleCohortIds.length > 0
      ? cohortQuery.in("id", accessibleCohortIds)
      : accessibleCohortIds?.length === 0
        ? null
        : cohortQuery;
  const cohortsResult = scopedCohortQuery ? await scopedCohortQuery : { data: [] };
  const cohortRows = (cohortsResult.data ?? []) as CohortRow[];
  const cohortIds = cohortRows.map((cohort) => cohort.id);
  const programIds = unique(cohortRows.map((cohort) => cohort.program_id));
  const campusIds = unique(cohortRows.map((cohort) => cohort.campus_id));
  const termIds = unique(cohortRows.map((cohort) => cohort.term_id));
  const [sessionsResult, enrollmentsResult, assessmentsResult, assignmentsResult, programsResult, campusesResult, termsResult] =
    await Promise.all([
      cohortIds.length > 0
        ? serviceClient
            .from("sessions")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("start_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("enrollments")
            .select("*")
            .in("cohort_id", cohortIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("assessments")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("date", { ascending: true })
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("cohort_assignments")
            .select("*")
            .in("cohort_id", cohortIds)
        : Promise.resolve({ data: [] }),
      programIds.length > 0
        ? serviceClient.from("programs").select("*").in("id", programIds)
        : Promise.resolve({ data: [] }),
      campusIds.length > 0
        ? serviceClient.from("campuses").select("*").in("id", campusIds)
        : Promise.resolve({ data: [] }),
      termIds.length > 0
        ? serviceClient.from("terms").select("*").in("id", termIds)
        : Promise.resolve({ data: [] }),
    ]);

  const sessionRows = (sessionsResult.data ?? []) as SessionRow[];
  const enrollmentRows = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const assessmentRows = (assessmentsResult.data ?? []) as AssessmentRow[];
  const assignmentRows = (assignmentsResult.data ?? []) as CohortAssignmentRow[];
  const programRows = (programsResult.data ?? []) as ProgramRow[];
  const campusRows = (campusesResult.data ?? []) as CampusRow[];
  const termRows = (termsResult.data ?? []) as TermRow[];

  const studentIds = unique(enrollmentRows.map((enrollment) => enrollment.student_id));
  const assessmentIds = assessmentRows.map((assessment) => assessment.id);
  const assignedUserIds = unique(assignmentRows.map((assignment) => assignment.user_id));

  const studentsResult =
    studentIds.length > 0
      ? await serviceClient
          .from("students")
          .select("*")
          .in("id", studentIds)
      : { data: [] };
  const studentRows = (studentsResult.data ?? []) as StudentRow[];
  const familyIds =
    getPermissionProfile(viewer.role).canViewFamilyProfiles
      ? unique(studentRows.map((student) => student.family_id))
      : [];

  const [familiesResult, resultsResult, notesResult, resourcesResult, invoicesResult, threadsResult, leadsResult, syncJobsResult, importRunsResult, syncSourceResult, billingSyncSourceResult, profilesResult, templatesResult, auditLogsResult] = await Promise.all([
    familyIds.length > 0
      ? serviceClient.from("families").select("*").in("id", familyIds)
      : Promise.resolve({ data: [] }),
    assessmentIds.length > 0
      ? serviceClient
          .from("assessment_results")
          .select("*")
          .in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? studentIds.length > 0
        ? serviceClient
            .from("academic_notes")
            .select("*")
            .in("student_id", studentIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? cohortIds.length > 0
        ? serviceClient
            .from("resources")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("published_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff"
      ? familyIds.length > 0
        ? serviceClient
            .from("invoices")
            .select("*")
            .in("family_id", familyIds)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? cohortIds.length > 0
        ? serviceClient
            .from("message_threads")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("last_message_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff"
      ? serviceClient.from("leads").select("*").order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    serviceClient.from("sync_jobs").select("*").order("label", { ascending: true }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("intake_import_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("intake_sync_sources")
          .select("*")
          .eq("id", "google-forms-primary")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("billing_sync_sources")
          .select("*")
          .eq("id", "quickbooks-primary")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient.from("profiles").select("*").order("full_name", { ascending: true })
      : assignedUserIds.length > 0
        ? serviceClient.from("profiles").select("*").in("id", assignedUserIds)
        : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient.from("user_templates").select("*").order("email", { ascending: true })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient
          .from("account_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
  ]);

  const familyRows = (familiesResult.data ?? []) as FamilyRow[];
  const resultRows = (resultsResult.data ?? []) as AssessmentResultRow[];
  const noteRows = (notesResult.data ?? []) as AcademicNoteRow[];
  const resourceRows = (resourcesResult.data ?? []) as ResourceRow[];
  const invoiceRows = (invoicesResult.data ?? []) as InvoiceRow[];
  const threadRows = (threadsResult.data ?? []) as MessageThreadRow[];
  const leadRows = (leadsResult.data ?? []) as LeadRow[];
  const syncJobRows = (syncJobsResult.data ?? []) as SyncJobRow[];
  const importRunRows = (importRunsResult.data ?? []) as IntakeImportRunRow[];
  const syncSourceRow = (syncSourceResult.data ?? null) as IntakeSyncSourceRow | null;
  const billingSyncSourceRow = (billingSyncSourceResult.data ?? null) as BillingSyncSourceRow | null;
  const profileRows = (profilesResult.data ?? []) as ProfileRow[];
  const templateRows = (templatesResult.data ?? []) as UserTemplateRow[];
  const auditLogRows = (auditLogsResult.data ?? []) as AccountAuditLogRow[];
  const threadIds = threadRows.map((thread) => thread.id);

  const [threadPostsResult, resourceSignedUrlsResult] = await Promise.all([
    threadIds.length > 0
      ? serviceClient
          .from("message_posts")
          .select("*")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    Promise.all(
      resourceRows.map(async (resource) => {
        if (!resource.storage_path) {
          return [resource.id, resource.link_url ?? null] as const;
        }

        const { data, error } = await serviceClient.storage
          .from(RESOURCE_BUCKET_NAME)
          .createSignedUrl(resource.storage_path, 60 * 60);

        if (error) {
          return [resource.id, resource.link_url ?? null] as const;
        }

        return [resource.id, data.signedUrl] as const;
      }),
    ),
  ]);
  const threadPostRows = (threadPostsResult.data ?? []) as MessagePostRow[];
  const resourceUrlById = new Map(resourceSignedUrlsResult);
  const threadPostAuthorIds = unique(
    threadPostRows
      .map((post) => post.author_id)
      .filter((authorId): authorId is string => typeof authorId === "string"),
  );
  const missingAuthorIds = threadPostAuthorIds.filter(
    (authorId) => !profileRows.some((profile) => profile.id === authorId),
  );
  const messageAuthorProfilesResult =
    missingAuthorIds.length > 0
      ? await serviceClient.from("profiles").select("*").in("id", missingAuthorIds)
      : { data: [] };
  const messageAuthorProfiles = (messageAuthorProfilesResult.data ?? []) as ProfileRow[];
  const allProfileRows = [...profileRows, ...messageAuthorProfiles];

  const assignmentsByCohort = new Map<string, CohortAssignmentRow[]>();
  assignmentRows.forEach((assignment) => {
    const existing = assignmentsByCohort.get(assignment.cohort_id) ?? [];
    existing.push(assignment);
    assignmentsByCohort.set(assignment.cohort_id, existing);
  });

  const assignmentIdsByUser = new Map<string, string[]>();
  assignmentRows.forEach((assignment) => {
    const existing = assignmentIdsByUser.get(assignment.user_id) ?? [];
    existing.push(assignment.cohort_id);
    assignmentIdsByUser.set(assignment.user_id, existing);
  });

  const settingsRoleStats =
    viewer.role === "engineer" || viewer.role === "admin"
      ? {
          activeUsers: allProfileRows.reduce((counts, profile) => {
            if (profile.account_status === "active") {
              counts[profile.role] += 1;
            }
            return counts;
          }, createEmptyRoleCounts()),
          suspendedUsers: allProfileRows.reduce((counts, profile) => {
            if (profile.account_status === "suspended") {
              counts[profile.role] += 1;
            }
            return counts;
          }, createEmptyRoleCounts()),
          templateUsers: templateRows.reduce((counts, template) => {
            counts[template.role] += 1;
            return counts;
          }, createEmptyRoleCounts()),
          assignmentLinks: assignmentRows.reduce((counts, assignment) => {
            counts[assignment.role] += 1;
            return counts;
          }, createEmptyRoleCounts()),
        }
      : null;
  const templateRoleByEmail = new Map(
    templateRows.map((template) => [template.email.toLowerCase(), template.role]),
  );
  const settingsUsers =
    viewer.role === "engineer" || viewer.role === "admin"
      ? allProfileRows.map((profile) => ({
          id: profile.id,
          name: profile.full_name ?? "IntoPrep User",
          email: profile.email,
          role: profile.role,
          title: profile.title ?? "Portal User",
          assignedCohortIds: assignmentIdsByUser.get(profile.id) ?? [],
          templateRole: profile.email ? (templateRoleByEmail.get(profile.email.toLowerCase()) ?? null) : null,
          accountStatus: profile.account_status,
          mustChangePassword: profile.must_change_password,
        }))
      : null;
  const profilesById = new Map(allProfileRows.map((profile) => [profile.id, profile]));
  const threadPostsById = threadPostRows.reduce<Record<string, MessagePost[]>>((accumulator, post) => {
    const existing = accumulator[post.thread_id] ?? [];
    existing.push({
      id: post.id,
      threadId: post.thread_id,
      authorId: post.author_id,
      authorName:
        (post.author_id ? profilesById.get(post.author_id)?.full_name : null) ??
        "IntoPrep Team",
      body: post.body,
      createdAt: post.created_at,
    });
    accumulator[post.thread_id] = existing;
    return accumulator;
  }, {});
  const settingsAuditLogs =
    viewer.role === "engineer" || viewer.role === "admin"
      ? auditLogRows.map((log) => ({
          id: log.id,
          actorName:
            log.actor_id && profilesById.get(log.actor_id)?.full_name
              ? profilesById.get(log.actor_id)?.full_name ?? "IntoPrep User"
              : "System",
          targetLabel: log.target_email ?? "Removed account",
          action: log.action,
          summary: log.summary,
          createdAt: log.created_at,
        }))
      : null;

  return {
    currentDate,
    visiblePrograms: programRows.map((program) => ({
      id: program.id,
      name: program.name,
      track: normalizeTrack(program.track),
      format: program.format,
      tuition: program.tuition,
    })),
    visibleCampuses: campusRows.map((campus) => ({
      id: campus.id,
      name: campus.name,
      location: campus.location,
      modality: normalizeCampusModality(campus.modality),
    })),
    visibleTerms: termRows.map((term) => ({
      id: term.id,
      name: term.name,
      startDate: term.start_date,
      endDate: term.end_date,
    })),
    visibleUsers: profileRows.map((profile) => ({
      id: profile.id,
      name: profile.full_name ?? "IntoPrep User",
      role: profile.role,
      title: profile.title ?? "Portal User",
      assignedCohortIds: assignmentIdsByUser.get(profile.id) ?? [],
    })),
    visibleCohorts: cohortRows.map((cohort) => {
      const scopedAssignments = assignmentsByCohort.get(cohort.id) ?? [];
      const leadInstructorId =
        cohort.lead_instructor_id ??
        scopedAssignments.find((assignment) => assignment.role === "instructor")?.user_id ??
        "";

      return {
        id: cohort.id,
        name: cohort.name,
        programId: cohort.program_id,
        campusId: cohort.campus_id,
        termId: cohort.term_id,
        capacity: cohort.capacity,
        enrolled: cohort.enrolled,
        leadInstructorId,
        taIds: scopedAssignments
          .filter((assignment) => assignment.role === "ta")
          .map((assignment) => assignment.user_id),
        cadence: cohort.cadence,
        roomLabel: cohort.room_label,
      };
    }),
    visibleSessions: sessionRows.map((session) => ({
      id: session.id,
      cohortId: session.cohort_id,
      title: session.title,
      startAt: session.start_at,
      endAt: session.end_at,
      mode: normalizeMode(session.mode),
      roomLabel: session.room_label,
    })),
    visibleEnrollments: enrollmentRows.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.student_id,
      cohortId: enrollment.cohort_id,
      status: enrollment.status === "waitlist" ? "waitlist" : "active",
      registeredAt: enrollment.registered_at,
    })),
    visibleStudents: studentRows.map((student) => ({
      id: student.id,
      familyId: student.family_id,
      firstName: student.first_name,
      lastName: student.last_name,
      gradeLevel: student.grade_level,
      school: student.school,
      targetTest: normalizeTrack(student.target_test),
      focus: student.focus,
    })),
    visibleFamilies: familyRows.map((family) => ({
      id: family.id,
      familyName: family.family_name,
      guardianNames: family.guardian_names,
      email: family.email,
      phone: family.phone,
      preferredCampusId: family.preferred_campus_id,
      notes: family.notes,
    })),
    visibleAssessments: assessmentRows.map((assessment) => ({
      id: assessment.id,
      cohortId: assessment.cohort_id,
      title: assessment.title,
      date: assessment.date,
      sections: parseScoreArray(assessment.sections),
    })),
    visibleResults: resultRows.map((result) => ({
      id: result.id,
      assessmentId: result.assessment_id,
      studentId: result.student_id,
      totalScore: result.total_score,
      sectionScores: parseScoreArray(result.section_scores),
      deltaFromPrevious: result.delta_from_previous,
    })),
    visibleNotes: noteRows.map((note) => ({
      id: note.id,
      studentId: note.student_id,
      authorId: note.author_id ?? "",
      visibility: "internal",
      summary: note.summary,
      createdAt: note.created_at,
    })),
    visibleResources: resourceRows.map((resource) => ({
      id: resource.id,
      cohortId: resource.cohort_id,
      title: resource.title,
      kind:
        resource.kind === "Worksheet" || resource.kind === "Deck" || resource.kind === "Replay"
          ? resource.kind
          : "Worksheet",
      publishedAt: resource.published_at,
      linkUrl: resourceUrlById.get(resource.id) ?? resource.link_url,
      fileName: resource.file_name,
    })),
    visibleInvoices: invoiceRows.flatMap((invoice) => {
      const status =
        invoice.status === "paid" || invoice.status === "pending" || invoice.status === "overdue"
          ? invoice.status
          : null;
      const source = invoice.source === "QuickBooks" || invoice.source === "Manual" ? invoice.source : null;
      return status && source
        ? [
            {
              id: invoice.id,
              familyId: invoice.family_id,
              amountDue: invoice.amount_due,
              dueDate: invoice.due_date,
              status,
              source,
            },
          ]
        : [];
    }),
    visibleThreads: threadRows.map((thread) => ({
      id: thread.id,
      cohortId: thread.cohort_id,
      subject: thread.subject,
      participants: thread.participants,
      lastMessagePreview: thread.last_message_preview,
      lastMessageAt: thread.last_message_at,
      unreadCount: thread.unread_count,
    })),
    visibleThreadPosts: threadPostsById,
    visibleLeads: leadRows.flatMap((lead) => {
      const stage =
        lead.stage === "inquiry" ||
        lead.stage === "assessment" ||
        lead.stage === "registered" ||
        lead.stage === "waitlist"
          ? lead.stage
          : null;

      return stage
        ? [
            {
              id: lead.id,
              studentName: lead.student_name,
              guardianName: lead.guardian_name,
              targetProgram: lead.target_program,
              stage,
              submittedAt: lead.submitted_at,
            },
          ]
        : [];
    }),
    visibleSyncJobs: syncJobRows.flatMap((job) => {
      const status = normalizeSyncStatus(job.status);

      return status
        ? [
            {
              id: job.id,
              label: job.label,
              cadence: job.cadence,
              status,
              lastRunAt: job.last_run_at,
              summary: job.summary,
            },
          ]
        : [];
    }),
    visibleImportRuns: importRunRows.flatMap((run) => {
      const status =
        run.status === "completed" || run.status === "partial" || run.status === "failed"
          ? run.status
          : null;
      const source =
        run.source === "Google Forms CSV" || run.source === "Manual CSV"
          ? run.source
          : null;
      const errorSamples = Array.isArray(run.error_samples)
        ? run.error_samples.filter((entry): entry is string => typeof entry === "string")
        : [];

      return status && source
        ? [
            {
              id: run.id,
              source,
              filename: run.filename,
              status,
              startedAt: run.started_at,
              finishedAt: run.finished_at,
              importedCount: run.imported_count,
              leadCount: run.lead_count,
              familyCount: run.family_count,
              studentCount: run.student_count,
              enrollmentCount: run.enrollment_count,
              errorCount: run.error_count,
              summary: run.summary,
              errorSamples,
            },
          ]
        : [];
    }),
    intakeSyncSource: syncSourceRow ? mapIntakeSyncSource(syncSourceRow) : null,
    billingSyncSource: billingSyncSourceRow ? mapBillingSyncSource(billingSyncSourceRow) : null,
    settingsRoleStats,
    settingsUsers,
    settingsAuditLogs,
  };
}
