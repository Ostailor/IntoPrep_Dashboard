import type {
  AdminTask,
  AssessmentResult,
  AttendanceStatus,
  ImportRun,
  PortalSection,
  SyncStatus,
  User,
  UserRole,
} from "@/lib/domain";
import {
  academicNotes,
  assessmentResults,
  assessments,
  attendanceRecords,
  campuses,
  cohorts,
  DEMO_DATE,
  enrollments,
  families,
  importRuns,
  invoices,
  leads,
  messageThreads,
  programs,
  resources,
  scoreTrends,
  sessions,
  students,
  syncJobs,
  tasks,
  terms,
  users,
} from "@/lib/mock-data";
import {
  canAccessSection,
  canViewFamilyContactBasics,
  canViewAllSyncJobs,
  getPermissionProfile,
  getVisibleSections,
  hasGlobalPortalScope,
} from "@/lib/permissions";

export interface MetricCardData {
  label: string;
  value: string;
  detail: string;
  tone: "navy" | "copper" | "sage";
}

export interface AlertItem {
  label: string;
  tone: SyncStatus;
  detail: string;
}

export interface SessionRosterRow {
  studentId: string;
  studentName: string;
  gradeLevel?: string;
  school?: string;
  familyEmail?: string;
  familyPhone?: string;
  attendance: AttendanceStatus;
  latestAssessment?: {
    title: string;
    totalScore: number;
    deltaFromPrevious: number;
    sectionScores: { label: string; score: number }[];
  };
  trend: { label: string; score: number }[];
}

export interface PortalContext {
  currentDate: string;
  user: User;
  visibleSections: PortalSection[];
  visiblePrograms: typeof programs;
  visibleCampuses: typeof campuses;
  visibleTerms: typeof terms;
  visibleUsers: typeof users;
  visibleCohorts: typeof cohorts;
  visibleSessions: typeof sessions;
  visibleEnrollments: typeof enrollments;
  visibleStudents: typeof students;
  visibleFamilies: typeof families;
  visibleAssessments: typeof assessments;
  visibleResults: typeof assessmentResults;
  visibleInvoices: typeof invoices;
  visibleThreads: typeof messageThreads;
  visibleLeads: typeof leads;
  visibleSyncJobs: typeof syncJobs;
  visibleImportRuns: typeof importRuns;
}

export interface StudentTrendRow {
  studentId: string;
  studentName: string;
  focus: string;
  latestScore?: number;
  deltaFromPrevious?: number;
  trend: { label: string; score: number }[];
}

export interface ProgramRow {
  cohortId: string;
  cohortName: string;
  programName: string;
  programTrack: string;
  programFormat: string;
  tuition: number;
  campusName: string;
  campusModality: string;
  termName: string;
  lead: string;
  fillRate: number;
  cadence: string;
}

export interface SettingsRoleStats {
  activeUsers: Record<UserRole, number>;
  suspendedUsers: Record<UserRole, number>;
  templateUsers: Record<UserRole, number>;
  assignmentLinks: Record<UserRole, number>;
}

export interface SettingsRoleRow {
  role: UserRole;
  label: string;
  summary: string;
  activeUsers: number;
  suspendedUsers: number;
  templateUsers: number;
  assignmentLinks: number;
}

export interface SettingsManagedUserRow {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  title: string;
  assignedCohortCount: number;
  templateRole: UserRole | null;
}

export const sectionMeta: Record<
  PortalSection,
  { title: string; summary: string; eyebrow: string }
> = {
  dashboard: {
    title: "Operating pulse",
    summary: "Today’s schedule, teaching, intake, and billing at a glance.",
    eyebrow: "Command center",
  },
  calendar: {
    title: "Instruction calendar",
    summary: "This week’s classes, times, rooms, and teaching schedule.",
    eyebrow: "Schedule",
  },
  cohorts: {
    title: "Cohort map",
    summary: "Capacity, staffing, and progress across active cohorts.",
    eyebrow: "Cohorts",
  },
  attendance: {
    title: "Attendance board",
    summary: "Take attendance and review same-day score context by class.",
    eyebrow: "Classroom",
  },
  students: {
    title: "Student directory",
    summary: "Student records, academic focus, and support-ready context.",
    eyebrow: "Students",
  },
  families: {
    title: "Family context",
    summary: "Guardian contacts, notes, and support context for each family.",
    eyebrow: "Families",
  },
  programs: {
    title: "Program overview",
    summary: "Programs, campuses, terms, and current cohort structure.",
    eyebrow: "Offerings",
  },
  academics: {
    title: "Academic follow-up",
    summary: "Scores, notes, and support materials for classroom follow-up.",
    eyebrow: "Academics",
  },
  messaging: {
    title: "Family messaging",
    summary: "Threaded communication for cohort follow-up and family updates.",
    eyebrow: "Communication",
  },
  billing: {
    title: "Tuition visibility",
    summary: "Outstanding balances and current billing visibility.",
    eyebrow: "Billing",
  },
  integrations: {
    title: "Imports and systems",
    summary: "Imports, linked sources, and current systems status.",
    eyebrow: "Operations",
  },
  settings: {
    title: "Roles and access",
    summary: "Accounts, roles, assignments, and internal access controls.",
    eyebrow: "Administration",
  },
};

const userByRole: Record<UserRole, User> = {
  engineer: users.find((user) => user.role === "engineer")!,
  admin: users.find((user) => user.role === "admin")!,
  staff: users.find((user) => user.role === "staff")!,
  ta: users.find((user) => user.role === "ta")!,
  instructor: users.find((user) => user.id === "user-instructor")!,
};

export const getCurrentUser = (role: UserRole) => userByRole[role];

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const createEmptyRoleCounts = (): Record<UserRole, number> => ({
  engineer: 0,
  admin: 0,
  staff: 0,
  ta: 0,
  instructor: 0,
});

const settingsRoleCopy: Record<UserRole, { label: string; summary: string }> = {
  engineer: {
    label: "Engineer",
    summary: "System oversight, admin governance, incident controls, and break-glass support access.",
  },
  admin: {
    label: "Admin",
    summary: "All sections, billing visibility, sync monitoring, settings, and audit governance.",
  },
  staff: {
    label: "Staff",
    summary: "Operations across enrollment, academics, messaging, and read-only billing visibility.",
  },
  ta: {
    label: "TA",
    summary: "Assigned cohorts only, family communication allowed, no billing or system configuration.",
  },
  instructor: {
    label: "Instructor",
    summary: "Assigned classes only, attendance, instructional notes, classroom accommodations, and read-only trends.",
  },
};

export const getPortalContext = (role: UserRole): PortalContext => {
  const user = getCurrentUser(role);
  const cohortIds =
    hasGlobalPortalScope(role)
      ? cohorts.map((cohort) => cohort.id)
      : user.assignedCohortIds;

  const visibleCohorts = cohorts.filter((cohort) => cohortIds.includes(cohort.id));
  const visibleProgramIds = unique(visibleCohorts.map((cohort) => cohort.programId));
  const visibleCampusIds = unique(visibleCohorts.map((cohort) => cohort.campusId));
  const visibleTermIds = unique(visibleCohorts.map((cohort) => cohort.termId));
  const visibleSessions = sessions.filter((session) => cohortIds.includes(session.cohortId));
  const visibleEnrollments = enrollments.filter((enrollment) => cohortIds.includes(enrollment.cohortId));
  const studentIds = unique(visibleEnrollments.map((enrollment) => enrollment.studentId));
  const visibleStudents = students.filter((student) => studentIds.includes(student.id));
  const familyIds = unique(visibleStudents.map((student) => student.familyId));
  const visibleFamilies = families
    .filter((family) => familyIds.includes(family.id))
    .map((family) => ({
      ...family,
      notes: getPermissionProfile(role).canViewFamilyProfiles ? family.notes : "",
    }));
  const assessmentIds = unique(
    assessments.filter((assessment) => cohortIds.includes(assessment.cohortId)).map((assessment) => assessment.id),
  );
  const visibleAssessments = assessments.filter((assessment) => assessmentIds.includes(assessment.id));
  const visibleResults = assessmentResults.filter((result) => assessmentIds.includes(result.assessmentId));
  const visibleInvoices =
    role === "engineer" || role === "admin" || role === "staff"
      ? invoices
      : invoices.filter((invoice) => familyIds.includes(invoice.familyId));
  const visibleThreads =
    role === "engineer" || role === "admin" || role === "staff"
      ? messageThreads
      : messageThreads.filter((thread) => cohortIds.includes(thread.cohortId));

  return {
    currentDate: DEMO_DATE,
    user,
    visibleSections: getVisibleSections(role),
    visiblePrograms: programs.filter((program) => visibleProgramIds.includes(program.id)),
    visibleCampuses: campuses.filter((campus) => visibleCampusIds.includes(campus.id)),
    visibleTerms: terms.filter((term) => visibleTermIds.includes(term.id)),
    visibleUsers: users,
    visibleCohorts,
    visibleSessions,
    visibleEnrollments,
    visibleStudents,
    visibleFamilies,
    visibleAssessments,
    visibleResults,
    visibleInvoices,
    visibleThreads,
    visibleLeads: role === "engineer" || role === "admin" || role === "staff" ? leads : [],
    visibleSyncJobs: canViewAllSyncJobs(role) ? syncJobs : syncJobs.filter((job) => job.status !== "error"),
    visibleImportRuns: role === "engineer" || role === "admin" || role === "staff" ? importRuns : [],
  };
};

export const getVisibleLeadsFromContext = (
  role: UserRole,
  context: PortalContext,
) => (role === "engineer" || role === "admin" || role === "staff" ? context.visibleLeads : []);

export const getVisibleLeads = (role: UserRole) =>
  getVisibleLeadsFromContext(role, getPortalContext(role));

export const getVisibleTasks = (role: UserRole) =>
  tasks.filter((task) => task.ownerRole === role || task.ownerRole === "all");

function formatTaskDueLabel(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export const getVisibleTaskCards = (
  role: UserRole,
  liveAdminTasks: AdminTask[] = [],
) => {
  if (liveAdminTasks.length === 0) {
    return getVisibleTasks(role);
  }

  return liveAdminTasks.slice(0, 4).map((task) => ({
    id: task.id,
    ownerRole: role,
    title: task.title,
    dueLabel: formatTaskDueLabel(task.dueAt),
    status: task.status === "done" ? ("watch" as const) : ("active" as const),
  }));
};

export const getVisibleSyncJobsFromContext = (
  role: UserRole,
  context: PortalContext,
) => (canViewAllSyncJobs(role) ? context.visibleSyncJobs : context.visibleSyncJobs.filter((job) => job.status !== "error"));

export const getVisibleSyncJobs = (role: UserRole) =>
  getVisibleSyncJobsFromContext(role, getPortalContext(role));

export const getVisibleImportRunsFromContext = (
  role: UserRole,
  context: PortalContext,
): ImportRun[] => (role === "engineer" || role === "admin" || role === "staff" ? context.visibleImportRuns : []);

export const getVisibleImportRuns = (role: UserRole) =>
  getVisibleImportRunsFromContext(role, getPortalContext(role));

export const getRoleHeadline = (role: UserRole) => {
  switch (role) {
    case "engineer":
      return "System oversight, incident controls, admin governance, and audited support access when production issues need attention.";
    case "admin":
      return "Operations view across cohorts, classrooms, family follow-up, and tuition visibility.";
    case "staff":
      return "Enrollment, cohort health, and billing visibility without configuration access.";
    case "ta":
      return "Assigned-cohort support lane with family communication and academic operations.";
    case "instructor":
      return "Tight teaching lane: assigned classes, attendance, instructional notes, classroom supports, and read-only trends.";
  }
};

export const getTodaySessionsFromContext = (context: PortalContext) =>
  context.visibleSessions.filter((session) => session.startAt.startsWith(context.currentDate));

export const getTodayResultsFromContext = (context: PortalContext) => {
  const assessmentIds = context.visibleAssessments
    .filter((assessment) => assessment.date === context.currentDate)
    .map((assessment) => assessment.id);

  return context.visibleResults.filter((result) => assessmentIds.includes(result.assessmentId));
};

function buildTrendMapFromContext(context: PortalContext) {
  const assessmentMap = new Map(context.visibleAssessments.map((assessment) => [assessment.id, assessment]));
  const trendMap = new Map<string, { date: string; label: string; score: number }[]>();

  context.visibleResults.forEach((result) => {
    const assessment = assessmentMap.get(result.assessmentId);
    if (!assessment) {
      return;
    }

    const existing = trendMap.get(result.studentId) ?? [];
    existing.push({
      date: assessment.date,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }).format(new Date(`${assessment.date}T12:00:00-04:00`)),
      score: result.totalScore,
    });
    trendMap.set(result.studentId, existing);
  });

  return new Map(
    Array.from(trendMap.entries()).map(([studentId, points]) => [
      studentId,
      points
        .sort((left, right) => left.date.localeCompare(right.date))
        .map(({ label, score }) => ({ label, score })),
    ]),
  );
}

export const getStudentTrendViewFromContext = (
  role: UserRole,
  context: PortalContext,
): StudentTrendRow[] => {
  const todayResults = getTodayResultsFromContext(context);
  const trendMap = buildTrendMapFromContext(context);

  return context.visibleStudents.map((student) => {
    const latestResult = todayResults.find((result) => result.studentId === student.id);

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      focus: role === "instructor" ? student.focus : `${student.school} • Grade ${student.gradeLevel}`,
      latestScore: latestResult?.totalScore,
      deltaFromPrevious: latestResult?.deltaFromPrevious,
      trend: trendMap.get(student.id) ?? [],
    };
  });
};

export const getDashboardMetricsFromContext = (
  role: UserRole,
  context: PortalContext,
): MetricCardData[] => {
  const todaySessions = getTodaySessionsFromContext(context);
  const todayResults = getTodayResultsFromContext(context);
  const pendingInvoices = context.visibleInvoices.filter((invoice) => invoice.status !== "paid");
  const openLeads = getVisibleLeadsFromContext(role, context).length;
  const visibleSyncJobs = getVisibleSyncJobsFromContext(role, context);
  const healthySyncJobs = visibleSyncJobs.filter((job) => job.status === "healthy").length;

  switch (role) {
    case "engineer":
      return [
        {
          label: "Live profiles",
          value: String(context.visibleUsers.length),
          detail: "All authenticated users and role assignments are available for governance changes.",
          tone: "navy",
        },
        {
          label: "Operational coverage",
          value: String(context.visibleCohorts.length),
          detail: "Engineer access spans every cohort, campus, and sync path in the portal.",
          tone: "copper",
        },
        {
          label: "Import runs",
          value: String(getVisibleImportRunsFromContext(role, context).length),
          detail: "Recent intake activity and pipeline state are fully visible here.",
          tone: "sage",
        },
        {
          label: "Sync watch",
          value: `${healthySyncJobs}/${visibleSyncJobs.length}`,
          detail: "All sync jobs, including error-state fallbacks, remain visible for remediation.",
          tone: "navy",
        },
      ];
    case "admin":
      return [
        {
          label: "Active cohorts",
          value: String(context.visibleCohorts.length),
          detail: "Every live cohort, staffing lane, and classroom block in the current term.",
          tone: "navy",
        },
        {
          label: "Capacity watch",
          value: String(
            context.visibleCohorts.filter((cohort) => cohort.capacity > 0 && cohort.enrolled / cohort.capacity >= 0.85).length,
          ),
          detail: "Near-full cohorts that may need rebalancing or staffing attention.",
          tone: "copper",
        },
        {
          label: "Billing follow-up",
          value: `${pendingInvoices.length}`,
          detail: "Families with pending or overdue tuition visibility in the operations queue.",
          tone: "sage",
        },
        {
          label: "Today’s classrooms",
          value: String(todaySessions.length),
          detail: "Live classes, rooming, and staff coverage for the current day.",
          tone: "navy",
        },
      ];
    case "staff":
      return [
        {
          label: "New inquiries",
          value: String(openLeads),
          detail: "Fresh leads and waitlist movement since last sync.",
          tone: "navy",
        },
        {
          label: "Upcoming sessions",
          value: String(todaySessions.length),
          detail: "Sessions needing rooming, staffing, or communication prep.",
          tone: "copper",
        },
        {
          label: "Visible balances",
          value: String(pendingInvoices.length),
          detail: "Read-only finance visibility from QuickBooks and manual records.",
          tone: "sage",
        },
        {
          label: "Sync watch",
          value: `${healthySyncJobs}/${visibleSyncJobs.length}`,
          detail: "Pipeline health excluding admin-only remediation controls.",
          tone: "navy",
        },
      ];
    case "ta":
      return [
        {
          label: "Assigned students",
          value: String(context.visibleStudents.length),
          detail: "Students inside TA support coverage.",
          tone: "navy",
        },
        {
          label: "Live sessions",
          value: String(todaySessions.length),
          detail: "Classes requiring attendance, notes, and family follow-up.",
          tone: "copper",
        },
        {
          label: "Unread threads",
          value: String(context.visibleThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)),
          detail: "Family questions inside assigned cohorts.",
          tone: "sage",
        },
        {
          label: "Score releases",
          value: String(todayResults.length),
          detail: "Same-day assessment results ready for support messaging.",
          tone: "navy",
        },
      ];
    case "instructor":
      return [
        {
          label: "Today’s classes",
          value: String(todaySessions.length),
          detail: "Only assigned sessions are visible here.",
          tone: "navy",
        },
        {
          label: "Roster count",
          value: String(context.visibleStudents.length),
          detail: "Roster names only, no family or demographic profile data.",
          tone: "copper",
        },
        {
          label: "Average today score",
          value:
            todayResults.length > 0
              ? Math.round(
                  todayResults.reduce((sum, result) => sum + result.totalScore, 0) / todayResults.length,
                ).toString()
              : "0",
          detail: "Same-day test average across assigned students.",
          tone: "sage",
        },
        {
          label: "Trend up",
          value: String(todayResults.filter((result) => result.deltaFromPrevious > 0).length),
          detail: "Assigned students improving versus prior benchmark.",
          tone: "navy",
        },
      ];
  }
};

export const getDashboardMetrics = (role: UserRole): MetricCardData[] =>
  getDashboardMetricsFromContext(role, getPortalContext(role));

export const getAlertsFromSyncJobs = (
  role: UserRole,
  visibleSyncJobs: PortalContext["visibleSyncJobs"],
): AlertItem[] => {
  if (role === "instructor") {
    return [
      {
        label: "SAT Pulse Check is live",
        tone: "healthy",
        detail: "Today’s DSAT scores are visible read-only for your assigned students.",
      },
    ];
  }

  const roleScopedJobs =
    role === "ta"
      ? visibleSyncJobs.filter((job) => job.id !== "sync-quickbooks")
      : visibleSyncJobs;
  const prioritized = [...roleScopedJobs].sort((left, right) => {
    const rank = {
      error: 0,
      warning: 1,
      healthy: 2,
    } as const;

    return rank[left.status] - rank[right.status];
  });
  const issueItems = prioritized
    .filter((job) => job.status !== "healthy")
    .map((job) => ({
      label: job.label,
      tone: job.status,
      detail: job.summary,
    }));

  if (issueItems.length > 0) {
    return issueItems.slice(0, 3);
  }

  return prioritized.slice(0, 3).map((job) => ({
    label: job.label,
    tone: job.status,
    detail: job.summary,
  }));
};

export const getAlerts = (role: UserRole): AlertItem[] => {
  const items: AlertItem[] = [
    {
      label: "Scheduling bridge fallback",
      tone: "error",
      detail: "The legacy scheduling host is still unavailable; March 13 export remains in use.",
    },
    {
      label: "QuickBooks reconciliation",
      tone: "warning",
      detail: "One overdue invoice needs manual family matching before next outreach window.",
    },
    {
      label: "Google Forms intake",
      tone: "healthy",
      detail: "New registrations from March 14, 2026 synced cleanly on the 8:00 AM run.",
    },
  ];

  if (role === "instructor") {
    return [
      {
        label: "SAT Pulse Check is live",
        tone: "healthy",
        detail: "Today’s DSAT scores are visible read-only for your assigned students.",
      },
    ];
  }

  if (role === "ta") {
    return items.filter((item) => item.label !== "QuickBooks reconciliation");
  }

  return items;
};

export const getTodaySessions = (role: UserRole) =>
  getTodaySessionsFromContext(getPortalContext(role));

export const getTodayResults = (role: UserRole) =>
  getTodayResultsFromContext(getPortalContext(role));

const studentById = new Map(students.map((student) => [student.id, student]));
const familyById = new Map(families.map((family) => [family.id, family]));
const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));

export const getSessionRosterView = (role: UserRole, sessionId: string): SessionRosterRow[] => {
  const context = getPortalContext(role);
  const session = context.visibleSessions.find((item) => item.id === sessionId);

  if (!session) {
    return [];
  }

  const studentIds = enrollments
    .filter((enrollment) => enrollment.cohortId === session.cohortId && enrollment.status === "active")
    .map((enrollment) => enrollment.studentId);

  return studentIds
    .map((studentId) => {
      const student = studentById.get(studentId)!;
      const family = familyById.get(student.familyId)!;
      const latestResult = context.visibleResults.find((result) => result.studentId === studentId);
      const relatedAssessment = latestResult ? assessmentById.get(latestResult.assessmentId) : undefined;
      const trend = scoreTrends.find((snapshot) => snapshot.studentId === studentId)?.points ?? [];
      const attendance =
        attendanceRecords.find((record) => record.sessionId === sessionId && record.studentId === studentId)?.status ??
        "present";

      return {
        studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        gradeLevel: getPermissionProfile(role).canViewStudentProfileData ? student.gradeLevel : undefined,
        school: getPermissionProfile(role).canViewStudentProfileData ? student.school : undefined,
        familyEmail: canViewFamilyContactBasics(role) ? family.email : undefined,
        familyPhone: canViewFamilyContactBasics(role) ? family.phone : undefined,
        attendance,
        latestAssessment:
          latestResult && relatedAssessment
            ? {
                title: relatedAssessment.title,
                totalScore: latestResult.totalScore,
                deltaFromPrevious: latestResult.deltaFromPrevious,
                sectionScores: latestResult.sectionScores,
              }
            : undefined,
        trend,
      };
    })
    .sort((left, right) => left.studentName.localeCompare(right.studentName));
};

export const getStudentTrendView = (role: UserRole) =>
  getStudentTrendViewFromContext(role, getPortalContext(role));

export const getBillingRowsFromContext = (context: PortalContext, role: UserRole) => {
  if (!canAccessSection(role, "billing")) {
    return [];
  }

  const visibleFamilyById = new Map(context.visibleFamilies.map((family) => [family.id, family]));

  return context.visibleInvoices.map((invoice) => {
    const family = visibleFamilyById.get(invoice.familyId);

    if (!family) {
      return null;
    }

    return {
      invoiceId: invoice.id,
      familyName: family.familyName,
      amountDue: invoice.amountDue,
      dueDate: invoice.dueDate,
      status: invoice.status,
      source: invoice.source,
      followUpState: invoice.followUpState ?? "open",
      lastFollowUpAt: invoice.lastFollowUpAt ?? null,
      lastFollowUpByName: invoice.lastFollowUpByName ?? null,
      sensitiveAccessGranted: invoice.sensitiveAccessGranted ?? getPermissionProfile(role).canViewBilling,
    };
  }).filter((row) => row !== null);
};

export const getBillingRows = (role: UserRole) =>
  getBillingRowsFromContext(getPortalContext(role), role);

export const getProgramRowsFromContext = (context: PortalContext): ProgramRow[] => {
  const programById = new Map(context.visiblePrograms.map((program) => [program.id, program]));
  const campusById = new Map(context.visibleCampuses.map((campus) => [campus.id, campus]));
  const termById = new Map(context.visibleTerms.map((term) => [term.id, term]));
  const userById = new Map(context.visibleUsers.map((user) => [user.id, user]));

  return context.visibleCohorts.map((cohort) => {
    const program = programById.get(cohort.programId);
    const campus = campusById.get(cohort.campusId);
    const term = termById.get(cohort.termId);
    const lead = userById.get(cohort.leadInstructorId)?.name ?? "Unassigned";

    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      programName: program?.name ?? "Program unavailable",
      programTrack: program?.track ?? "Support",
      programFormat: program?.format ?? "Format unavailable",
      tuition: program?.tuition ?? 0,
      campusName: campus?.name ?? "Campus unavailable",
      campusModality: campus?.modality ?? "Unspecified",
      termName: term?.name ?? "Term unavailable",
      lead,
      fillRate: cohort.capacity > 0 ? Math.round((cohort.enrolled / cohort.capacity) * 100) : 0,
      cadence: cohort.cadence,
    };
  });
};

export const getProgramRows = () =>
  getProgramRowsFromContext(getPortalContext("admin"));

function getPreviewSettingsRoleStats(): SettingsRoleStats {
  const activeUsers = users.reduce((counts, user) => {
    counts[user.role] += 1;
    return counts;
  }, createEmptyRoleCounts());

  const templateUsers = users.reduce((counts, user) => {
    counts[user.role] += 1;
    return counts;
  }, createEmptyRoleCounts());

  const assignmentLinks = users.reduce((counts, user) => {
    counts[user.role] += user.assignedCohortIds.length;
    return counts;
  }, createEmptyRoleCounts());

  return {
    activeUsers,
    suspendedUsers: createEmptyRoleCounts(),
    templateUsers,
    assignmentLinks,
  };
}

export const getSettingsRoleRows = (
  stats: SettingsRoleStats = getPreviewSettingsRoleStats(),
): SettingsRoleRow[] =>
  (Object.keys(settingsRoleCopy) as UserRole[]).map((role) => ({
    role,
    label: settingsRoleCopy[role].label,
    summary: settingsRoleCopy[role].summary,
    activeUsers: stats.activeUsers[role] ?? 0,
    suspendedUsers: stats.suspendedUsers[role] ?? 0,
    templateUsers: stats.templateUsers[role] ?? 0,
    assignmentLinks: stats.assignmentLinks[role] ?? 0,
  }));

export const getSectionFallback = (role: UserRole) => getVisibleSections(role)[0] ?? "dashboard";

export const isSectionVisibleToRole = (role: UserRole, section: PortalSection) =>
  canAccessSection(role, section);

export const formatLongDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00-04:00`));

export const formatTimeRange = (startAt: string, endAt: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`;
};

export const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

export const getTodayAssessmentSummary = (result?: AssessmentResult) => {
  if (!result) {
    return "No assessment released";
  }
  const trendText = result.deltaFromPrevious >= 0 ? `+${result.deltaFromPrevious}` : `${result.deltaFromPrevious}`;
  return `${result.totalScore} (${trendText} vs prior)`;
};

export const getSectionResourceRows = (role: UserRole) => {
  const context = getPortalContext(role);
  const cohortIds = context.visibleCohorts.map((cohort) => cohort.id);
  return resources.filter((resource) => cohortIds.includes(resource.cohortId));
};

export const getVisibleNotes = (role: UserRole) => {
  const context = getPortalContext(role);
  const studentIds = context.visibleStudents.map((student) => student.id);
  return academicNotes.filter((note) => studentIds.includes(note.studentId));
};
