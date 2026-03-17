import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  MapPin,
  MessageSquare,
  School,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import type { PortalViewer } from "@/lib/auth";
import type { PortalSection, UserRole } from "@/lib/domain";
import {
  formatLongDate,
  formatMoney,
  formatTimeRange,
  getAlerts,
  getAlertsFromSyncJobs,
  getBillingRowsFromContext,
  getBillingRows,
  getDashboardMetricsFromContext,
  getDashboardMetrics,
  getPortalContext,
  getProgramRowsFromContext,
  getRoleHeadline,
  getSettingsRoleRows,
  getSectionFallback,
  getSectionResourceRows,
  getSessionRosterView,
  getStudentTrendViewFromContext,
  getStudentTrendView,
  getTodayAssessmentSummary,
  getTodayResultsFromContext,
  getTodayResults,
  getTodaySessionsFromContext,
  getTodaySessions,
  getVisibleLeads,
  getVisibleLeadsFromContext,
  getVisibleNotes,
  getVisibleImportRuns,
  getVisibleImportRunsFromContext,
  getVisibleSyncJobs,
  getVisibleSyncJobsFromContext,
  getVisibleTaskCards,
  isSectionVisibleToRole,
  sectionMeta,
} from "@/lib/portal";
import { getPermissionProfile } from "@/lib/permissions";
import { getLiveAttendanceBundle } from "@/lib/live-attendance";
import { getLivePortalBundle } from "@/lib/live-portal";
import { AttendanceBoard } from "@/components/portal/attendance-board";
import { AcademicsActionPanel } from "@/components/portal/academics-action-panel";
import { AccountAuditLogPanel } from "@/components/portal/account-audit-log-panel";
import { BillingSyncPanel } from "@/components/portal/billing-sync-panel";
import { EngineerBreakGlassButton } from "@/components/portal/engineer-break-glass-button";
import { EngineerConsolePanels } from "@/components/portal/engineer-console-panels";
import { IntakeImportPanel } from "@/components/portal/intake-import-panel";
import { MessagingReplyPanel } from "@/components/portal/messaging-reply-panel";
import { PortalLiveSync } from "@/components/portal/portal-live-sync";
import { PortalNavPrefetch } from "@/components/portal/portal-nav-prefetch";
import { RoleManagementPanel } from "@/components/portal/role-management-panel";
import { TrendSparkline } from "@/components/portal/trend-sparkline";
import { DesktopUpdateButton } from "@/components/desktop-update-button";
import { InstallAppButton } from "@/components/install-app-button";
import { AdminDashboardPanels } from "@/components/portal/admin-dashboard-panels";
import { AdminBillingPanel } from "@/components/portal/admin-billing-panel";
import { AdminCohortOperationsPanel } from "@/components/portal/admin-cohort-operations-panel";
import { AdminFamilyOpsPanel } from "@/components/portal/admin-family-ops-panel";
import { AdminMessagingBulkPanel } from "@/components/portal/admin-messaging-bulk-panel";
import { AdminProgramArchivePanel } from "@/components/portal/admin-program-archive-panel";
import { StaffBillingPanel } from "@/components/portal/staff-billing-panel";
import { StaffCohortOperationsPanel } from "@/components/portal/staff-cohort-operations-panel";
import { StaffDashboardPanels } from "@/components/portal/staff-dashboard-panels";
import { StaffFamilyOpsPanel } from "@/components/portal/staff-family-ops-panel";
import { StaffMessagingPanel } from "@/components/portal/staff-messaging-panel";
import { InstructorAcademicsPanel } from "@/components/portal/instructor-academics-panel";
import { InstructorAttendanceSupportPanel } from "@/components/portal/instructor-attendance-support-panel";
import { InstructorDashboardPanels } from "@/components/portal/instructor-dashboard-panels";
import { TaAttendanceSupportPanel } from "@/components/portal/ta-attendance-support-panel";
import { TaDashboardPanels } from "@/components/portal/ta-dashboard-panels";
import { TaFamilySupportPanel } from "@/components/portal/ta-family-support-panel";
import { TaMessagingPanel } from "@/components/portal/ta-messaging-panel";

const sectionIcons: Record<PortalSection, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  cohorts: GraduationCap,
  attendance: ClipboardCheck,
  students: Users,
  families: School,
  programs: BookOpen,
  academics: LineChart,
  messaging: MessageSquare,
  billing: Wallet,
  integrations: Database,
  settings: Shield,
};

const roleLabels: Record<UserRole, string> = {
  engineer: "Engineer",
  admin: "Admin",
  staff: "Staff",
  ta: "TA",
  instructor: "Instructor",
};

const roleAccent: Record<UserRole, string> = {
  engineer: "border-[rgba(34,93,120,0.24)] bg-[rgba(34,93,120,0.12)] text-[color:var(--navy-strong)]",
  admin: "border-[rgba(23,56,75,0.24)] bg-[rgba(23,56,75,0.12)] text-[color:var(--navy-strong)]",
  staff: "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)]",
  ta: "border-[rgba(115,138,123,0.24)] bg-[rgba(115,138,123,0.16)] text-[color:var(--sage)]",
  instructor: "border-[rgba(16,37,51,0.16)] bg-[rgba(255,255,255,0.72)] text-[color:var(--navy-strong)]",
};

const tonePill: Record<"navy" | "copper" | "sage", string> = {
  navy: "from-[rgba(23,56,75,0.18)] to-[rgba(23,56,75,0.04)]",
  copper: "from-[rgba(187,110,69,0.22)] to-[rgba(187,110,69,0.05)]",
  sage: "from-[rgba(115,138,123,0.22)] to-[rgba(115,138,123,0.05)]",
};

function SectionPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="section-kicker">{eyebrow}</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">{title}</h3>
      <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">{description}</p>
    </div>
  );
}

function InvoiceStatusPill({ status }: { status: "paid" | "pending" | "overdue" }) {
  const styles = {
    paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
    pending: "border-amber-200 bg-amber-100 text-amber-800",
    overdue: "border-rose-200 bg-rose-100 text-rose-800",
  } as const;

  return (
    <span className={clsx("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", styles[status])}>
      {status}
    </span>
  );
}

function SyncStatusPill({ status }: { status: "healthy" | "warning" | "error" }) {
  const styles = {
    healthy: "border-emerald-200 bg-emerald-100 text-emerald-800",
    warning: "border-amber-200 bg-amber-100 text-amber-800",
    error: "border-rose-200 bg-rose-100 text-rose-800",
  } as const;

  return (
    <span className={clsx("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", styles[status])}>
      {status}
    </span>
  );
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function PortalShell({
  viewer,
  section,
}: {
  viewer: PortalViewer;
  section: PortalSection;
}) {
  const role = viewer.user.role;
  const meta = sectionMeta[section];
  const currentUser = viewer.user;
  const baseContext = getPortalContext(role);
  const livePortal =
    viewer.mode !== "preview" ? await getLivePortalBundle(viewer.user, section) : null;
  const context = livePortal
    ? {
        ...baseContext,
        currentDate: livePortal.currentDate,
        user: currentUser,
        visiblePrograms: livePortal.visiblePrograms,
        visibleCampuses: livePortal.visibleCampuses,
        visibleTerms: livePortal.visibleTerms,
        visibleUsers: livePortal.visibleUsers,
        visibleCohorts: livePortal.visibleCohorts,
        visibleSessions: livePortal.visibleSessions,
        visibleEnrollments: livePortal.visibleEnrollments,
        visibleStudents: livePortal.visibleStudents,
        visibleFamilies: livePortal.visibleFamilies,
        visibleAssessments: livePortal.visibleAssessments,
        visibleResults: livePortal.visibleResults,
        visibleInvoices: livePortal.visibleInvoices,
        visibleThreads: livePortal.visibleThreads,
        visibleLeads: livePortal.visibleLeads,
        visibleSyncJobs: livePortal.visibleSyncJobs,
        visibleImportRuns: livePortal.visibleImportRuns,
      }
    : {
        ...baseContext,
        user: currentUser,
      };
  const liveAttendance =
    viewer.mode !== "preview" && section === "attendance"
      ? await getLiveAttendanceBundle(viewer.user)
      : null;
  const metrics = livePortal
    ? getDashboardMetricsFromContext(role, context)
    : getDashboardMetrics(role);
  const alerts = livePortal ? getAlertsFromSyncJobs(role, context.visibleSyncJobs) : getAlerts(role);
  const todaySessions = (livePortal
    ? getTodaySessionsFromContext(context)
    : getTodaySessions(role)
  ).sort((left, right) => left.startAt.localeCompare(right.startAt));
  const todayResults = livePortal
    ? getTodayResultsFromContext(context)
    : getTodayResults(role);
  const visibleLeads = livePortal
    ? getVisibleLeadsFromContext(role, context)
    : getVisibleLeads(role);
  const visibleTaskCards = livePortal
    ? getVisibleTaskCards(role, livePortal.visibleAdminTasks)
    : getVisibleTaskCards(role);
  const visibleSyncJobs = livePortal
    ? getVisibleSyncJobsFromContext(role, context)
    : getVisibleSyncJobs(role);
  const visibleImportRuns = livePortal
    ? getVisibleImportRunsFromContext(role, context)
    : getVisibleImportRuns(role);
  const intakeSyncSource = livePortal?.intakeSyncSource ?? null;
  const billingSyncSource = livePortal?.billingSyncSource ?? null;
  const visibleNotes = livePortal ? livePortal.visibleNotes : getVisibleNotes(role);
  const visibleResources = livePortal ? livePortal.visibleResources : getSectionResourceRows(role);
  const visibleThreadPosts = livePortal?.visibleThreadPosts ?? {};
  const trendRows = livePortal
    ? getStudentTrendViewFromContext(role, context)
    : getStudentTrendView(role);
  const billingRows = livePortal
    ? getBillingRowsFromContext(context, role)
    : getBillingRows(role);
  const programRows = getProgramRowsFromContext(context);
  const settingsRoleRows = getSettingsRoleRows(livePortal?.settingsRoleStats ?? undefined);
  const accessible = isSectionVisibleToRole(role, section);
  const fallbackSection = getSectionFallback(role);
  const permissions = getPermissionProfile(role);
  const settingsReadinessRows =
    viewer.mode !== "preview" && livePortal
      ? [
          {
            label: "User access",
            detail: `${settingsRoleRows.reduce((sum, row) => sum + row.activeUsers, 0)} active accounts, ${settingsRoleRows.reduce((sum, row) => sum + row.suspendedUsers, 0)} suspended accounts, and ${settingsRoleRows.reduce((sum, row) => sum + row.templateUsers, 0)} setup templates are available for staff management.`,
            tone: "healthy" as const,
          },
          {
            label: "Program catalog",
            detail: `${countLabel(context.visiblePrograms.length, "program")} mapped across ${countLabel(context.visibleCampuses.length, "campus", "campuses")} and ${countLabel(context.visibleTerms.length, "term")} for the current operating window.`,
            tone: context.visiblePrograms.length > 0 ? ("healthy" as const) : ("warning" as const),
          },
          {
            label: "Current records",
            detail: `${context.visibleCohorts.length} cohorts, ${context.visibleSessions.length} sessions, ${context.visibleStudents.length} students, and ${context.visibleFamilies.length} families are available in the current dashboard view.`,
            tone: context.visibleCohorts.length > 0 ? ("healthy" as const) : ("warning" as const),
          },
          {
            label: "Assignment coverage",
            detail: `${settingsRoleRows.reduce((sum, row) => sum + row.assignmentLinks, 0)} cohort assignment links are controlling access across the dashboard.`,
            tone:
              settingsRoleRows.reduce((sum, row) => sum + row.assignmentLinks, 0) > 0
                ? ("healthy" as const)
                : ("warning" as const),
          },
          {
            label: "Systems status",
            detail: `${visibleSyncJobs.filter((job) => job.status === "healthy").length} healthy, ${visibleSyncJobs.filter((job) => job.status === "warning").length} warning, ${visibleSyncJobs.filter((job) => job.status === "error").length} error sync jobs are being monitored.`,
            tone:
              visibleSyncJobs.some((job) => job.status === "error")
                ? ("error" as const)
                : visibleSyncJobs.some((job) => job.status === "warning")
                  ? ("warning" as const)
                  : ("healthy" as const),
          },
        ]
      : [
          {
            label: "Preview access",
            detail: "Preview mode uses sample account roles so you can review the dashboard layout and permissions.",
            tone: "warning" as const,
          },
          {
            label: "Program catalog",
            detail: `${countLabel(context.visiblePrograms.length, "sample program")} with ${countLabel(context.visibleCampuses.length, "campus", "campuses")} and ${countLabel(context.visibleTerms.length, "term")} are available in preview mode.`,
            tone: "healthy" as const,
          },
          {
            label: "Current records",
            detail: `${context.visibleCohorts.length} cohorts and ${context.visibleStudents.length} students are available in preview mode.`,
            tone: "healthy" as const,
          },
          {
            label: "Assignment coverage",
            detail: `${settingsRoleRows.reduce((sum, row) => sum + row.assignmentLinks, 0)} sample role-to-cohort links show the intended access boundaries.`,
            tone: "healthy" as const,
          },
        ];

  const rosterMaps =
    liveAttendance?.rosters ??
    Object.fromEntries(todaySessions.map((session) => [session.id, getSessionRosterView(role, session.id)]));

  const attendanceSessions =
    liveAttendance?.sessions ??
    todaySessions.map((session) => ({
      id: session.id,
      title: session.title,
      timeLabel: formatTimeRange(session.startAt, session.endAt),
      roomLabel: session.roomLabel,
    }));
  const instructorSupportSessions =
    role === "instructor" && attendanceSessions.length === 0
      ? context.visibleSessions.map((session) => ({
          id: session.id,
          title: session.title,
          timeLabel: formatTimeRange(session.startAt, session.endAt),
          roomLabel: session.roomLabel,
        }))
      : attendanceSessions;
  const instructorSupportRosters =
    role === "instructor" && attendanceSessions.length === 0
      ? Object.fromEntries(
          context.visibleSessions.map((session) => [
            session.id,
            context.visibleEnrollments
              .filter(
                (enrollment) =>
                  enrollment.cohortId === session.cohortId && enrollment.status === "active",
              )
              .map((enrollment) => {
                const student = context.visibleStudents.find(
                  (candidate) => candidate.id === enrollment.studentId,
                );

                return student
                  ? {
                      studentId: student.id,
                      studentName: `${student.firstName} ${student.lastName}`,
                      attendance: "present" as const,
                      trend: [],
                    }
                  : null;
              })
              .filter((row): row is { studentId: string; studentName: string; attendance: "present"; trend: [] } => row !== null),
          ]),
        )
      : rosterMaps;
  const roleScopedCohortCount =
    role === "engineer" || role === "admin" || role === "staff"
      ? context.visibleCohorts.length
      : currentUser.assignedCohortIds.length || context.visibleCohorts.length;
  const canUseRolePreview = permissions.canPreviewRoles || viewer.mode === "live-role-preview";
  const previewChoices = (["admin", "staff", "ta", "instructor"] satisfies UserRole[]);
  const withPreviewRole = (path: string, candidateRole: UserRole) => `${path}?role=${candidateRole}`;
  const sectionHref = (path: string) =>
    viewer.mode === "live-role-preview" || viewer.mode === "preview" ? withPreviewRole(path, role) : path;
  const currentSectionHref = sectionHref(`/${section}`);
  const navHrefs = context.visibleSections
    .map((item) => sectionHref(`/${item}`))
    .filter((href) => href !== currentSectionHref);
  const snapshotDate = liveAttendance?.currentDate ?? context.currentDate;
  const attendanceHandoffNotes = liveAttendance?.handoffNotes ?? [];
  const attendanceExceptionFlags = liveAttendance?.exceptionFlags ?? [];
  const attendanceCoverageFlags = liveAttendance?.coverageFlags ?? [];
  const activeMaintenanceBanner = livePortal?.maintenanceBanner ?? null;
  const activeAdminAnnouncements = livePortal?.visibleAdminAnnouncements ?? [];
  const engineerConsole = livePortal?.engineerConsole ?? null;
  const adminOps = livePortal?.adminOps ?? null;
  const staffOps = livePortal?.staffOps ?? null;
  const taOps = livePortal?.taOps ?? null;
  const instructorOps = livePortal?.instructorOps ?? null;
  const visibleInstructorFollowUpFlags = livePortal?.visibleInstructorFollowUpFlags ?? [];

  return (
    <div className="min-h-screen px-4 py-5 lg:px-6 lg:py-6">
      <PortalLiveSync enabled={viewer.mode !== "preview"} section={section} />
      <PortalNavPrefetch hrefs={navHrefs} />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row">
        <aside className="glass-panel thin-scrollbar flex flex-col rounded-[2rem] border border-white/45 p-5 shadow-[var(--shadow)] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:w-[320px] xl:overflow-y-auto">
          <div className="rounded-[1.75rem] bg-[linear-gradient(145deg,rgba(14,34,49,0.96),rgba(23,56,75,0.92))] p-5 text-white">
            <div className="section-kicker text-white/60">IntoPrep internal</div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <h1 className="display-font text-3xl">IntoPrep Dashboard</h1>
                <p className="mt-2 max-w-[16rem] text-sm text-white/72">
                  One place to manage classes, cohorts, staff coordination, and daily operations.
                </p>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/72">
                v1
              </div>
            </div>
            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/52">Snapshot date</div>
              <div className="mt-2 text-lg font-semibold">{formatLongDate(snapshotDate)}</div>
              <div className="mt-2 text-sm text-white/60">
                {viewer.mode === "live"
                  ? "Current dashboard view for today’s schedule, classroom activity, and team workflows."
                  : "Reference view of the IntoPrep dashboard."}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="section-kicker">Navigation</div>
            <nav className="mt-3 space-y-2">
              {context.visibleSections.map((item) => {
                const Icon = sectionIcons[item];
                const active = item === section;
                return (
                  <Link
                    key={item}
                    href={sectionHref(`/${item}`)}
                    prefetch
                    className={clsx(
                      "nav-pill flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold",
                      active ? "nav-pill-active" : "text-[color:var(--muted)] hover:bg-white/75",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {sectionMeta[item].title}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-55" />
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-[color:var(--line)] bg-white/65 p-4">
            <div className="section-kicker">Current lane</div>
            <div className="mt-2 flex items-center gap-3">
              <div className={clsx("rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]", roleAccent[role])}>
                {viewer.mode === "live-role-preview" ? `Preview ${roleLabels[role]}` : roleLabels[role]}
              </div>
              <div className="text-sm font-semibold text-[color:var(--navy-strong)]">{currentUser.name}</div>
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">{currentUser.title}</div>
            {viewer.email ? (
              <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                {viewer.email}
              </div>
            ) : null}
            <p className="mt-4 text-sm text-[color:var(--muted)]">{getRoleHeadline(role)}</p>
            {canUseRolePreview ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/${section}`}
                  className={clsx(
                    "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                    viewer.mode === "live"
                      ? roleAccent.engineer
                      : "border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-stone-50",
                  )}
                >
                  Engineer live
                </Link>
                {previewChoices.map((candidate) => (
                  <Link
                    key={candidate}
                    href={withPreviewRole(`/${section}`, candidate)}
                    className={clsx(
                      "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                      candidate === role && viewer.mode === "live-role-preview"
                        ? roleAccent[candidate]
                        : "border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-stone-50",
                    )}
                  >
                    {roleLabels[candidate]}
                  </Link>
                ))}
              </div>
            ) : null}
            {viewer.mode !== "preview" ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DesktopUpdateButton />
                <InstallAppButton />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)] hover:bg-stone-50"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-[color:var(--line)] bg-white/65 p-4">
            <div className="section-kicker">Systems status</div>
            <div className="mt-3 space-y-3">
              {visibleSyncJobs.slice(0, 3).map((job) => (
                <div key={job.id} className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">{job.label}</div>
                    <SyncStatusPill status={job.status} />
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {job.cadence}
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{job.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1">
          {viewer.mode === "live-role-preview" ? (
            <div className="mb-5 rounded-[1.75rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-5 py-4 text-sm text-[color:var(--navy-strong)] shadow-[var(--shadow)]">
              Previewing the {roleLabels[role]} experience
              {viewer.previewSourceName ? ` using ${viewer.previewSourceName}` : ""}. Writes are blocked until you exit preview.
              <Link
                href={`/${section}`}
                className="ml-2 font-semibold text-[color:var(--copper)]"
              >
                Exit preview
              </Link>
            </div>
          ) : null}

          {activeMaintenanceBanner ? (
            <div
              className={clsx(
                "mb-5 rounded-[1.75rem] border px-5 py-4 text-sm shadow-[var(--shadow)]",
                activeMaintenanceBanner.tone === "error"
                  ? "border-rose-200 bg-rose-100 text-rose-800"
                  : activeMaintenanceBanner.tone === "warning"
                    ? "border-amber-200 bg-amber-100 text-amber-800"
                    : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
              )}
            >
              <div className="font-semibold">{activeMaintenanceBanner.message}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em]">
                {activeMaintenanceBanner.ownerName ?? "Unassigned"} ·{" "}
                {activeMaintenanceBanner.issueReference ?? "No issue reference"}
              </div>
            </div>
          ) : null}

          {activeAdminAnnouncements.length > 0 ? (
            <div className="mb-5 space-y-3">
              {activeAdminAnnouncements.slice(0, 2).map((announcement) => (
                <div
                  key={announcement.id}
                  className={clsx(
                    "rounded-[1.75rem] border px-5 py-4 text-sm shadow-[var(--shadow)]",
                    announcement.tone === "warning"
                      ? "border-amber-200 bg-amber-100 text-amber-800"
                      : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
                  )}
                >
                  <div className="font-semibold">{announcement.title}</div>
                  <div className="mt-1">{announcement.body}</div>
                </div>
              ))}
            </div>
          ) : null}

          {role === "engineer" &&
          viewer.mode === "live" &&
          engineerConsole &&
          engineerConsole.activeSensitiveAccessGrants.length > 0 ? (
            <div className="mb-5 rounded-[1.75rem] border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-5 py-4 text-sm text-[color:var(--navy-strong)] shadow-[var(--shadow)]">
              <div className="font-semibold">Break-glass access is active.</div>
              <div className="mt-1">
                {engineerConsole.activeSensitiveAccessGrants.length} scoped support grant
                {engineerConsole.activeSensitiveAccessGrants.length === 1 ? "" : "s"} are open right now. Review or revoke them in Settings.
              </div>
            </div>
          ) : null}

          <header className="glass-panel rounded-[2rem] border border-white/45 p-5 shadow-[var(--shadow)] lg:p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="section-kicker">{meta.eyebrow}</div>
                <h2 className="display-font mt-2 text-4xl text-[color:var(--navy-strong)] lg:text-5xl">
                  {meta.title}
                </h2>
                <p className="mt-4 max-w-4xl text-sm leading-7 text-[color:var(--muted)]">
                  {meta.summary}
                </p>
              </div>

              <div className="w-full max-w-xl rounded-[1.75rem] border border-[color:var(--line)] bg-[rgba(255,255,255,0.72)] p-4">
                <div className="section-kicker">{viewer.mode === "live" ? "Account" : "Preview role"}</div>
                {viewer.mode === "preview" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(roleLabels) as UserRole[]).map((candidate) => (
                      <Link
                        key={candidate}
                        href={withPreviewRole(`/${section}`, candidate)}
                        className={clsx(
                          "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                          candidate === role
                            ? roleAccent[candidate]
                            : "border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-stone-50",
                        )}
                      >
                        {roleLabels[candidate]}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[1.25rem] border border-[rgba(45,125,99,0.18)] bg-[rgba(45,125,99,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]">
                    {viewer.mode === "live-role-preview"
                      ? `Signed in as ${currentUser.name}. Preview writes are blocked.`
                      : `Signed in as ${currentUser.name}.`}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-3 text-sm text-[color:var(--muted)]">
                  <Clock3 className="h-4 w-4" />
                  {formatLongDate(snapshotDate)}
                </div>
              </div>
            </div>
          </header>

          {!accessible ? (
            <SectionPanel className="mt-5 p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="section-kicker">Restricted surface</div>
                  <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
                    {roleLabels[role]} access stops here
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
                    {role === "instructor"
                      ? "Instructors only see assigned classes, roster names, attendance controls, same-day scores, and read-only trends. Student profile, family, billing, messaging, and system surfaces remain hidden."
                      : "This area is outside the current role boundary. Use one of the visible sections below or switch to a different preview role."}
                  </p>
                </div>
                <Link
                  href={sectionHref(`/${fallbackSection}`)}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
                >
                  Go to {sectionMeta[fallbackSection].title}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </SectionPanel>
          ) : (
            <div className="mt-5 space-y-5">
              <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
                <SectionPanel className="overflow-hidden">
                  <div className="relative">
                    <div className="absolute inset-x-0 top-0 h-40 rounded-[1.6rem] bg-[radial-gradient(circle_at_top_left,rgba(187,110,69,0.18),transparent_45%),radial-gradient(circle_at_top_right,rgba(115,138,123,0.16),transparent_34%)]" />
                    <div className="relative">
                      <SectionHeading
                        eyebrow="Role brief"
                        title={roleLabels[role]}
                        description={getRoleHeadline(role)}
                      />
                      <div className="mt-5 flex flex-wrap gap-3">
                        <div
                          className={clsx(
                            "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                            roleAccent[role],
                          )}
                        >
                          {currentUser.title}
                        </div>
                        <div className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {roleScopedCohortCount} visible cohort{roleScopedCohortCount === 1 ? "" : "s"}
                        </div>
                        <div className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {todaySessions.length} live session{todaySessions.length === 1 ? "" : "s"} today
                        </div>
                      </div>
                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {visibleTaskCards.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                                {task.title}
                              </div>
                              <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                                {task.dueLabel}
                              </div>
                            </div>
                            <div className="mt-3 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                              {task.status === "active" ? "Needs motion" : "Watch item"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </SectionPanel>

                <SectionPanel>
                  <SectionHeading
                    eyebrow="Watch list"
                    title="Critical signals"
                    description="What needs human attention before the next class block or sync window."
                  />
                  <div className="mt-5 space-y-3">
                    {alerts.map((alert) => (
                      <div
                        key={alert.label}
                        className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {alert.tone === "healthy" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            ) : (
                              <AlertTriangle
                                className={clsx(
                                  "h-4 w-4",
                                  alert.tone === "warning" ? "text-amber-700" : "text-rose-700",
                                )}
                              />
                            )}
                            <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                              {alert.label}
                            </div>
                          </div>
                          <SyncStatusPill status={alert.tone} />
                        </div>
                        <p className="mt-3 text-sm text-[color:var(--muted)]">{alert.detail}</p>
                      </div>
                    ))}
                  </div>
                </SectionPanel>
              </section>

              <section className="grid grid-autofit gap-4">
                {metrics.map((metric) => (
                  <SectionPanel
                    key={metric.label}
                    className={clsx("metric-sheen p-0", `bg-gradient-to-br ${tonePill[metric.tone]}`)}
                  >
                    <div className="p-5">
                      <div className="section-kicker">{metric.label}</div>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-[color:var(--navy-strong)]">
                        {metric.value}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">{metric.detail}</p>
                    </div>
                  </SectionPanel>
                ))}
              </section>

              {renderSectionContent({
                section,
                role,
                viewerId: currentUser.id,
                viewerMode: viewer.mode,
                visibleLeads,
                todaySessions,
                trendRows,
                visibleNotes,
                visibleResources,
                visibleThreadPosts,
                visibleSyncJobs,
                visibleImportRuns,
                intakeSyncSource,
                billingSyncSource,
                billingRows,
                programRows,
                settingsRoleRows,
                settingsUsers: viewer.mode !== "preview" ? livePortal?.settingsUsers ?? null : null,
                settingsAuditLogs: viewer.mode !== "preview" ? livePortal?.settingsAuditLogs ?? null : null,
                adminOps,
                staffOps,
                taOps,
                instructorOps,
                visibleAdminTasks: livePortal?.visibleAdminTasks ?? [],
                visibleAdminAnnouncements: activeAdminAnnouncements,
                visibleInstructorFollowUpFlags,
                engineerConsole,
                settingsReadinessRows,
                attendanceSessions,
                rosterMaps,
                instructorSupportSessions,
                instructorSupportRosters,
                attendanceHandoffNotes,
                attendanceExceptionFlags,
                attendanceCoverageFlags,
                permissions,
                todayResults,
                context,
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function renderSectionContent({
  section,
  role,
  viewerId,
  viewerMode,
  visibleLeads,
  todaySessions,
  trendRows,
  visibleNotes,
  visibleResources,
  visibleThreadPosts,
  visibleSyncJobs,
  visibleImportRuns,
  intakeSyncSource,
  billingSyncSource,
  billingRows,
  programRows,
  settingsRoleRows,
  settingsUsers,
  settingsAuditLogs,
  adminOps,
  staffOps,
  taOps,
  instructorOps,
  visibleAdminTasks,
  visibleAdminAnnouncements,
  visibleInstructorFollowUpFlags,
  engineerConsole,
  settingsReadinessRows,
  attendanceSessions,
  rosterMaps,
  instructorSupportSessions,
  instructorSupportRosters,
  attendanceHandoffNotes,
  attendanceExceptionFlags,
  attendanceCoverageFlags,
  permissions,
  todayResults,
  context,
}: {
  section: PortalSection;
  role: UserRole;
  viewerId: string;
  viewerMode: PortalViewer["mode"];
  visibleLeads: ReturnType<typeof getVisibleLeads>;
  todaySessions: ReturnType<typeof getTodaySessions>;
  trendRows: ReturnType<typeof getStudentTrendView>;
  visibleNotes: ReturnType<typeof getVisibleNotes>;
  visibleResources: ReturnType<typeof getSectionResourceRows>;
  visibleThreadPosts: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["visibleThreadPosts"];
  visibleSyncJobs: ReturnType<typeof getVisibleSyncJobs>;
  visibleImportRuns: ReturnType<typeof getVisibleImportRuns>;
  intakeSyncSource: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["intakeSyncSource"];
  billingSyncSource: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["billingSyncSource"];
  billingRows: ReturnType<typeof getBillingRows>;
  programRows: ReturnType<typeof getProgramRowsFromContext>;
  settingsRoleRows: ReturnType<typeof getSettingsRoleRows>;
  settingsUsers: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["settingsUsers"];
  settingsAuditLogs: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["settingsAuditLogs"];
  adminOps: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["adminOps"];
  staffOps: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["staffOps"];
  taOps: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["taOps"];
  instructorOps: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["instructorOps"];
  visibleAdminTasks: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["visibleAdminTasks"];
  visibleAdminAnnouncements: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["visibleAdminAnnouncements"];
  visibleInstructorFollowUpFlags: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["visibleInstructorFollowUpFlags"];
  engineerConsole: NonNullable<Awaited<ReturnType<typeof getLivePortalBundle>>>["engineerConsole"];
  settingsReadinessRows: {
    label: string;
    detail: string;
    tone: "healthy" | "warning" | "error";
  }[];
  attendanceSessions: {
    id: string;
    title: string;
    timeLabel: string;
    roomLabel: string;
  }[];
  rosterMaps: Record<string, ReturnType<typeof getSessionRosterView>>;
  instructorSupportSessions: {
    id: string;
    title: string;
    timeLabel: string;
    roomLabel: string;
  }[];
  instructorSupportRosters: Record<string, ReturnType<typeof getSessionRosterView>>;
  attendanceHandoffNotes: NonNullable<Awaited<ReturnType<typeof getLiveAttendanceBundle>>>["handoffNotes"];
  attendanceExceptionFlags: NonNullable<Awaited<ReturnType<typeof getLiveAttendanceBundle>>>["exceptionFlags"];
  attendanceCoverageFlags: NonNullable<Awaited<ReturnType<typeof getLiveAttendanceBundle>>>["coverageFlags"];
  permissions: ReturnType<typeof getPermissionProfile>;
  todayResults: ReturnType<typeof getTodayResults>;
  context: ReturnType<typeof getPortalContext>;
}) {
  switch (section) {
    case "dashboard":
      return (
        <div className="space-y-5">
          {role === "engineer" && engineerConsole ? (
            <EngineerConsolePanels
              section="dashboard"
              engineerConsole={engineerConsole}
              syncJobs={visibleSyncJobs}
              intakeSyncSource={intakeSyncSource}
              billingSyncSource={billingSyncSource}
              users={settingsUsers}
            />
          ) : null}
          {role === "admin" && adminOps ? (
            <AdminDashboardPanels
              viewerMode={viewerMode}
              tasks={visibleAdminTasks}
              savedViews={adminOps.savedViews}
              announcements={visibleAdminAnnouncements}
              capacityForecastRows={adminOps.capacityForecastRows}
              users={settingsUsers}
              syncJobs={visibleSyncJobs}
              approvalRequests={adminOps.approvalRequests}
              escalations={adminOps.escalations}
            />
          ) : null}
          {role === "staff" && staffOps ? (
            <StaffDashboardPanels
              viewerMode={viewerMode}
              tasks={visibleAdminTasks}
              taskActivities={staffOps.taskActivities}
              leads={visibleLeads}
              threads={context.visibleThreads.map((thread) => ({
                id: thread.id,
                subject: thread.subject,
                lastMessageAt: thread.lastMessageAt,
                unreadCount: thread.unreadCount,
              }))}
              syncJobs={visibleSyncJobs}
              sessions={context.visibleSessions}
              sessionChecklists={staffOps.sessionChecklists}
              invoices={context.visibleInvoices}
              approvalRequests={staffOps.approvalRequests}
              escalations={staffOps.escalations}
            />
          ) : null}
          {role === "ta" && taOps ? (
            <TaDashboardPanels
              viewerMode={viewerMode}
              tasks={visibleAdminTasks}
              taskActivities={taOps.taskActivities}
              threads={context.visibleThreads}
              sessions={context.visibleSessions}
              sessionChecklists={taOps.sessionChecklists}
              handoffNotes={taOps.handoffNotes}
              coverageFlags={taOps.coverageFlags}
              announcements={visibleAdminAnnouncements}
              trendRows={trendRows}
            />
          ) : null}
          {role === "instructor" && instructorOps ? (
            <InstructorDashboardPanels
              viewerMode={viewerMode}
              tasks={visibleAdminTasks}
              taskActivities={instructorOps.taskActivities}
              followUpFlags={visibleInstructorFollowUpFlags}
              sessions={context.visibleSessions}
              students={context.visibleStudents}
            />
          ) : null}
          {(role === "admin" || role === "staff" || role === "ta") &&
          visibleInstructorFollowUpFlags.length > 0 ? (
            <SectionPanel>
              <SectionHeading
                eyebrow="Instructor watch"
                title="Teaching follow-up flags"
                description="Open classroom notes created by instructors for TA, staff, and admin follow-through."
              />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {visibleInstructorFollowUpFlags.slice(0, 6).map((flag) => (
                  <div
                    key={flag.id}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                        {flag.summary}
                      </div>
                      <span className="rounded-full border border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                        {flag.status}
                      </span>
                    </div>
                    {flag.note ? (
                      <div className="mt-2 text-sm text-[color:var(--muted)]">{flag.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </SectionPanel>
          ) : null}
          <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
            <SectionPanel>
              <SectionHeading
                eyebrow="Today’s flow"
                title="Live session stack"
                description="Visible sessions ordered by time with location, modality, and roster coverage."
              />
              <div className="mt-5 space-y-3">
                {todaySessions.map((session) => {
                  const cohort = context.visibleCohorts.find((item) => item.id === session.cohortId);
                  return (
                    <div
                      key={session.id}
                      className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                            {session.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted)]">
                            <Clock3 className="h-4 w-4" />
                            {formatTimeRange(session.startAt, session.endAt)}
                            <span>·</span>
                            <MapPin className="h-4 w-4" />
                            {session.roomLabel}
                          </div>
                        </div>
                        <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {cohort?.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionPanel>

            <SectionPanel>
              {role === "instructor" ? (
                <>
                  <SectionHeading
                    eyebrow="Read-only insight"
                    title="Today’s score picture"
                    description="Instructors can see same-day assessment totals, section breakdowns, and trend direction for assigned students."
                  />
                  <div className="mt-5 space-y-4">
                    {trendRows.map((student) => (
                      <div
                        key={student.studentId}
                        className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                              {student.studentName}
                            </div>
                            <div className="mt-1 text-sm text-[color:var(--muted)]">{student.focus}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-semibold text-[color:var(--navy-strong)]">
                              {student.latestScore ?? "—"}
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              {student.deltaFromPrevious && student.deltaFromPrevious >= 0 ? "+" : ""}
                              {student.deltaFromPrevious ?? 0} vs prior
                            </div>
                          </div>
                        </div>
                        <TrendSparkline className="mt-3" points={student.trend} tone="navy" />
                      </div>
                    ))}
                  </div>
                </>
              ) : role === "ta" ? (
                <>
                  <SectionHeading
                    eyebrow="Support lane"
                    title="Family threads"
                    description="TA messaging remains scoped to assigned cohorts and their families."
                  />
                  <div className="mt-5 space-y-3">
                    {context.visibleThreads.map((thread) => (
                      <div
                        key={thread.id}
                        className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                            {thread.subject}
                          </div>
                          <div className="rounded-full border border-[rgba(187,110,69,0.22)] bg-[rgba(187,110,69,0.12)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                            {thread.unreadCount} unread
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-[color:var(--muted)]">{thread.lastMessagePreview}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <SectionHeading
                    eyebrow="Pipeline"
                    title="Enrollment and finance snapshot"
                    description="Staff and admin see intake motion, sync readiness, and read-only billing risk."
                  />
                  <div className="mt-5 space-y-3">
                    {visibleLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                              {lead.studentName}
                            </div>
                            <div className="mt-1 text-sm text-[color:var(--muted)]">
                              {lead.guardianName} · {lead.targetProgram}
                            </div>
                          </div>
                          <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            {lead.stage}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionPanel>
          </section>
        </div>
      );

    case "calendar":
      return (
        <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <SectionPanel>
            <SectionHeading
              eyebrow="Week view"
              title="Scheduled instruction blocks"
              description="Class timing, modality, and rooming for visible cohorts."
            />
            <div className="mt-5 space-y-4">
              {context.visibleSessions
                .sort((left, right) => left.startAt.localeCompare(right.startAt))
                .map((session) => {
                  const cohort = context.visibleCohorts.find((item) => item.id === session.cohortId);
                  return (
                    <div
                      key={session.id}
                      className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                            {session.title}
                          </div>
                          <div className="mt-1 text-sm text-[color:var(--muted)]">
                            {formatLongDate(session.startAt.slice(0, 10))} · {formatTimeRange(session.startAt, session.endAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            {cohort?.name}
                          </span>
                          <span className="rounded-full border border-[rgba(115,138,123,0.22)] bg-[rgba(115,138,123,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--sage)]">
                            {session.mode}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </SectionPanel>

          <SectionPanel>
            <SectionHeading
              eyebrow="Campus load"
              title="Rooming and modality"
              description="Every visible campus footprint represented in the current role scope."
            />
            <div className="mt-5 space-y-3">
              {context.visibleCohorts.map((cohort) => (
                <div key={cohort.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{cohort.name}</div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">{cohort.roomLabel}</div>
                  <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    <span>{cohort.cadence}</span>
                    <span>{cohort.enrolled}/{cohort.capacity} filled</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>
        </section>
      );

    case "cohorts":
      return (
        <div className="space-y-5">
          {role === "admin" && adminOps ? (
            <AdminCohortOperationsPanel
              viewerMode={viewerMode}
              cohorts={context.visibleCohorts}
              archivedCohorts={adminOps.archivedCohorts}
              sessions={context.visibleSessions}
              students={context.visibleStudents}
              enrollments={context.visibleEnrollments}
              users={context.visibleUsers}
              forecastRows={adminOps.capacityForecastRows}
              savedViews={adminOps.savedViews}
            />
          ) : null}
          {role === "staff" && staffOps ? (
            <StaffCohortOperationsPanel
              viewerMode={viewerMode}
              cohorts={context.visibleCohorts}
              sessions={context.visibleSessions}
              students={context.visibleStudents}
              enrollments={context.visibleEnrollments}
              sessionChecklists={staffOps.sessionChecklists}
              savedViews={staffOps.savedViews}
            />
          ) : null}
          <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <SectionPanel>
              <SectionHeading
                eyebrow="Cohort inventory"
                title="Active teaching groups"
                description="Capacity, cadence, and staffing for every cohort visible to the current role."
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {context.visibleCohorts.map((cohort) => (
                  <div
                    key={cohort.id}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                  >
                    <div className="text-lg font-semibold text-[color:var(--navy-strong)]">{cohort.name}</div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">{cohort.cadence}</div>
                    <div className="mt-4 flex items-center justify-between text-sm text-[color:var(--muted)]">
                      <span>{cohort.roomLabel}</span>
                      <span>{cohort.enrolled}/{cohort.capacity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel>
              <SectionHeading
                eyebrow={role === "instructor" ? "Assigned trends" : "Academic direction"}
                title={role === "instructor" ? "Student progress pulse" : "Performance direction"}
                description={
                  role === "instructor"
                    ? "Read-only score trends for students attached to assigned classes."
                    : "Trend movement helps teaching teams decide where intervention is needed next."
                }
              />
              <div className="mt-5 space-y-4">
                {trendRows.map((student) => (
                  <div key={student.studentId} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-[color:var(--navy-strong)]">{student.studentName}</div>
                        <div className="mt-1 text-sm text-[color:var(--muted)]">{student.focus}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-semibold text-[color:var(--navy-strong)]">
                          {student.latestScore ?? "—"}
                        </div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {student.deltaFromPrevious && student.deltaFromPrevious >= 0 ? "+" : ""}
                          {student.deltaFromPrevious ?? 0} latest delta
                        </div>
                      </div>
                    </div>
                    <TrendSparkline className="mt-3" points={student.trend} tone={role === "instructor" ? "navy" : "copper"} />
                  </div>
                ))}
              </div>
            </SectionPanel>
          </section>
        </div>
      );

    case "attendance":
      return (
        <div className="space-y-5">
          <AttendanceBoard
            role={role}
            sessions={attendanceSessions}
            rosters={rosterMaps}
            persistence={{
              enabled: viewerMode === "live",
              endpoint: "/api/attendance",
            }}
            handoffNotes={attendanceHandoffNotes}
            exceptionFlags={attendanceExceptionFlags}
            coverageFlags={attendanceCoverageFlags}
            instructionalAccommodations={instructorOps?.instructionalAccommodations}
          />
          {role === "ta" && taOps ? (
            <TaAttendanceSupportPanel
              viewerMode={viewerMode}
              sessions={attendanceSessions}
              rosters={rosterMaps}
              sessionChecklists={taOps.sessionChecklists}
              handoffNotes={taOps.handoffNotes}
              exceptionFlags={taOps.attendanceExceptionFlags}
              coverageFlags={taOps.coverageFlags}
            />
          ) : null}
          {role === "instructor" && instructorOps ? (
            <InstructorAttendanceSupportPanel
              viewerMode={viewerMode}
              sessions={instructorSupportSessions}
              rosters={instructorSupportRosters}
              accommodations={instructorOps.instructionalAccommodations}
              followUpFlags={visibleInstructorFollowUpFlags}
            />
          ) : null}
        </div>
      );

    case "students":
      return (
        <SectionPanel>
          <SectionHeading
            eyebrow="Student directory"
            title="Academic-facing student list"
            description={
              role === "ta"
                ? "TA access stays limited to assigned-cohort student context plus family contact basics."
                : "TA, staff, and admin can see student records with support-ready context. Instructors do not see this surface."
            }
          />
          <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[color:var(--line)]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 bg-[rgba(23,56,75,0.06)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              <span>Student</span>
              <span>School</span>
              <span>Target</span>
              <span>Family contact</span>
            </div>
            {context.visibleStudents.map((student) => {
              const family = context.visibleFamilies.find((item) => item.id === student.familyId);
              return (
                <div
                  key={student.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-t border-[color:var(--line)] bg-white/75 px-5 py-4 text-sm"
                >
                  <div>
                    <div className="font-semibold text-[color:var(--navy-strong)]">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="mt-1 text-[color:var(--muted)]">Grade {student.gradeLevel}</div>
                    {role === "engineer" && !student.sensitiveAccessGranted ? (
                      <EngineerBreakGlassButton
                        scopeType="student"
                        scopeId={student.id}
                        label={`${student.firstName} ${student.lastName}`}
                        className="mt-3"
                      />
                    ) : null}
                  </div>
                  <div className="text-[color:var(--muted)]">{student.school}</div>
                  <div>
                    <div className="font-semibold text-[color:var(--navy-strong)]">{student.targetTest}</div>
                    <div className="mt-1 text-[color:var(--muted)]">{student.focus}</div>
                  </div>
                  <div className="text-[color:var(--muted)]">
                    {family
                      ? permissions.canViewFamilyProfiles ||
                        permissions.canViewFamilyContactBasics ||
                        family.sensitiveAccessGranted
                        ? family.email
                        : "Protected"
                      : "Restricted"}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>
      );

    case "families":
      return (
        <div className="space-y-5">
          {role === "admin" && adminOps ? (
            <AdminFamilyOpsPanel
              viewerMode={viewerMode}
              families={context.visibleFamilies}
              contactEvents={adminOps.familyContactEvents}
            />
          ) : null}
          {role === "staff" && staffOps ? (
            <StaffFamilyOpsPanel
              viewerMode={viewerMode}
              families={context.visibleFamilies}
              contactEvents={staffOps.familyContactEvents}
            />
          ) : null}
          {role === "ta" ? (
            <TaFamilySupportPanel
              families={context.visibleFamilies}
              students={context.visibleStudents}
              threads={context.visibleThreads}
            />
          ) : null}
          {role === "ta" ? null : (
            <section className="grid gap-4 md:grid-cols-2">
            {context.visibleFamilies.map((family) => {
              const invoice = billingRows.find((row) => row.familyName === family.familyName);
              return (
                <SectionPanel key={family.id}>
                  <div className="section-kicker">Guardian relationship</div>
                  <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
                    {family.familyName} family
                  </h3>
                  <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
                    <div>{family.guardianNames.join(" · ")}</div>
                    <div>{family.email}</div>
                    <div>{family.phone}</div>
                    <div>{family.notes}</div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Campus preference noted
                    </span>
                    {(permissions.canViewBilling || role === "engineer") && invoice ? (
                      <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                        {typeof invoice.amountDue === "number" ? formatMoney(invoice.amountDue) : "Protected"} due
                      </span>
                    ) : null}
                    {role === "engineer" && !family.sensitiveAccessGranted ? (
                      <EngineerBreakGlassButton
                        scopeType="family"
                        scopeId={family.id}
                        label={`${family.familyName} family`}
                      />
                    ) : null}
                  </div>
                </SectionPanel>
              );
            })}
            </section>
          )}
        </div>
      );

    case "programs":
      return (
        <div className="space-y-5">
          {role === "admin" && adminOps ? (
            <AdminProgramArchivePanel
              viewerMode={viewerMode}
              programs={context.visiblePrograms}
              archivedPrograms={adminOps.archivedPrograms}
            />
          ) : null}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {programRows.map((row) => (
              <SectionPanel key={row.cohortId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="section-kicker">{row.termName}</div>
                    <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
                      {row.cohortName}
                    </h3>
                  </div>
                  <span className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                    {row.programTrack}
                  </span>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">{row.programName}</div>
                <div className="mt-5 grid gap-3 text-sm text-[color:var(--muted)]">
                  <div className="rounded-2xl border border-[color:var(--line)] bg-white/75 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Delivery
                    </div>
                    <div className="mt-2 font-semibold text-[color:var(--navy-strong)]">{row.programFormat}</div>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--line)] bg-white/75 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Campus
                    </div>
                    <div className="mt-2 font-semibold text-[color:var(--navy-strong)]">
                      {row.campusName} · {row.campusModality}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--line)] bg-white/75 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Staffing
                    </div>
                    <div className="mt-2 font-semibold text-[color:var(--navy-strong)]">Lead: {row.lead}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {row.cadence}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-white/75 px-4 py-3 text-sm font-semibold text-[color:var(--navy-strong)]">
                  <span>Fill rate {row.fillRate}%</span>
                  <span>{formatMoney(row.tuition)}</span>
                </div>
              </SectionPanel>
            ))}
          </section>
        </div>
      );

    case "academics":
      if (role === "instructor" && instructorOps) {
        return (
          <InstructorAcademicsPanel
            viewerMode={viewerMode}
            viewerId={viewerId}
            students={context.visibleStudents}
            sessions={context.visibleSessions.map((session) => ({
              id: session.id,
              title: session.title,
              cohortId: session.cohortId,
            }))}
            notes={visibleNotes}
            sessionNotes={instructorOps.sessionInstructionNotes}
            accommodations={instructorOps.instructionalAccommodations}
            followUpFlags={visibleInstructorFollowUpFlags}
            trendRows={trendRows}
          />
        );
      }

      return (
        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <SectionPanel>
            <SectionHeading
              eyebrow="Same-day results"
              title="Assessment release board"
              description="Section breakdowns and momentum from the current benchmark release."
            />
            <div className="mt-5 space-y-3">
              {todayResults.map((result) => {
                const student = context.visibleStudents.find((item) => item.id === result.studentId)!;
                return (
                  <div
                    key={result.id}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="mt-1 text-sm text-[color:var(--muted)]">
                          {getTodayAssessmentSummary(result)}
                        </div>
                      </div>
                      <div className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                        {result.totalScore}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.sectionScores.map((sectionScore) => (
                        <span
                          key={`${result.id}-${sectionScore.label}`}
                          className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                        >
                          {sectionScore.label}: {sectionScore.score}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionPanel>

          <div className="space-y-5">
            {role !== "instructor" ? (
              <SectionPanel>
                {viewerMode === "live-role-preview" ? (
                  <div className="rounded-[1.5rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]">
                    Role preview is read-only. Exit preview to edit notes, resources, or scores.
                  </div>
                ) : (
                  <AcademicsActionPanel
                    viewerRole={role}
                    currentDate={context.currentDate}
                    cohorts={context.visibleCohorts.map((cohort) => ({
                      id: cohort.id,
                      name: cohort.name,
                    }))}
                    students={context.visibleStudents}
                    enrollments={context.visibleEnrollments}
                    assessments={context.visibleAssessments}
                    results={context.visibleResults}
                    notes={visibleNotes}
                  />
                )}
              </SectionPanel>
            ) : null}
            <SectionPanel>
              <SectionHeading
                eyebrow="Internal notes"
                title="Coaching memory"
                description="TA and staff can preserve coaching context and follow-up prompts."
              />
              <div className="mt-5 space-y-3">
                {visibleNotes.map((note) => (
                  <div key={note.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                    <div className="text-sm text-[color:var(--muted)]">{note.summary}</div>
                  </div>
                ))}
              </div>
            </SectionPanel>
            <SectionPanel>
              <SectionHeading
                eyebrow="Published resources"
                title="Support materials"
                description="Worksheets, decks, and replay links attached to visible cohorts."
              />
              <div className="mt-5 space-y-3">
                {visibleResources.map((resource) => (
                  <div
                    key={resource.id}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                  >
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {resource.title}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">{resource.kind}</div>
                    {resource.linkUrl ? (
                      <a
                        className="mt-3 inline-flex text-sm font-semibold text-[color:var(--copper)]"
                        href={resource.linkUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {resource.fileName ?? "Open resource"}
                      </a>
                    ) : resource.fileName ? (
                      <div className="mt-3 text-sm font-semibold text-[color:var(--copper)]">
                        {resource.fileName}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </SectionPanel>
          </div>
        </section>
      );

    case "messaging":
      return (
        <div className="space-y-5">
          {role === "admin" ? (
            <AdminMessagingBulkPanel
              viewerMode={viewerMode}
              cohorts={context.visibleCohorts}
              families={context.visibleFamilies}
              students={context.visibleStudents}
              enrollments={context.visibleEnrollments}
            />
          ) : null}
          {role === "staff" && staffOps ? (
            <StaffMessagingPanel
              viewerMode={viewerMode}
              cohorts={context.visibleCohorts}
              families={context.visibleFamilies}
              students={context.visibleStudents}
              enrollments={context.visibleEnrollments}
              templates={staffOps.outreachTemplates}
            />
          ) : null}
          {role === "ta" ? (
            <TaMessagingPanel
              viewerMode={viewerMode}
              cohorts={context.visibleCohorts}
              families={context.visibleFamilies}
              students={context.visibleStudents}
              enrollments={context.visibleEnrollments}
            />
          ) : null}
          <MessagingReplyPanel
            viewerRole={role}
            threads={context.visibleThreads}
            threadPosts={visibleThreadPosts}
            readOnly={viewerMode === "live-role-preview"}
          />
        </div>
      );

    case "billing":
      return role === "admin" && adminOps ? (
        <AdminBillingPanel
          viewerMode={viewerMode}
          rows={billingRows}
          notes={adminOps.billingFollowUpNotes}
          savedViews={adminOps.savedViews}
        />
      ) : role === "staff" && staffOps ? (
        <StaffBillingPanel
          viewerMode={viewerMode}
          rows={billingRows}
          tasks={visibleAdminTasks}
          notes={staffOps.billingFollowUpNotes}
          savedViews={staffOps.savedViews}
        />
      ) : (
        <SectionPanel>
          <SectionHeading
            eyebrow="Read-only finance"
            title="Invoice visibility"
            description="Billing stays hidden from instructors and TAs. Admin and staff can review balance posture here."
          />
          <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[color:var(--line)]">
            <div className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-4 bg-[rgba(23,56,75,0.06)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              <span>Family</span>
              <span>Amount due</span>
              <span>Source</span>
              <span>Status</span>
            </div>
            {billingRows.map((row) => (
              <div
                key={row.invoiceId}
                className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-4 border-t border-[color:var(--line)] bg-white/75 px-5 py-4 text-sm"
              >
                <div>
                  <div className="font-semibold text-[color:var(--navy-strong)]">{row.familyName}</div>
                  {role === "engineer" && !row.sensitiveAccessGranted ? (
                    <EngineerBreakGlassButton
                      scopeType="billing"
                      scopeId={context.visibleFamilies.find((family) => family.familyName === row.familyName)?.id ?? row.invoiceId}
                      label={`${row.familyName} billing`}
                      className="mt-2"
                    />
                  ) : null}
                </div>
                <span className="text-[color:var(--muted)]">
                  {typeof row.amountDue === "number" ? formatMoney(row.amountDue) : "Protected"}
                </span>
                <span className="text-[color:var(--muted)]">{row.source}</span>
                <InvoiceStatusPill status={row.status} />
              </div>
            ))}
          </div>
        </SectionPanel>
      );

    case "integrations":
      return (
        <div className="space-y-5">
          <IntakeImportPanel
            recentRuns={visibleImportRuns}
            syncSource={intakeSyncSource}
            readOnly={viewerMode === "live-role-preview"}
            canManageSource={permissions.canManageSyncSources}
          />
          <BillingSyncPanel
            syncSource={billingSyncSource}
            readOnly={viewerMode === "live-role-preview"}
            canManageSource={permissions.canManageSyncSources}
          />
          {role === "engineer" && engineerConsole ? (
            <EngineerConsolePanels
              section="integrations"
              engineerConsole={engineerConsole}
              syncJobs={visibleSyncJobs}
              intakeSyncSource={intakeSyncSource}
              billingSyncSource={billingSyncSource}
              users={settingsUsers}
            />
          ) : null}
          <section className="grid gap-4 md:grid-cols-2">
            {visibleSyncJobs.map((job) => (
              <SectionPanel key={job.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">{job.cadence}</div>
                    <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
                      {job.label}
                    </h3>
                  </div>
                  <SyncStatusPill status={job.status} />
                </div>
                <p className="mt-4 text-sm text-[color:var(--muted)]">{job.summary}</p>
                {job.runbookUrl ? (
                  <a
                    href={job.runbookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm font-semibold text-[color:var(--copper)]"
                  >
                    Open runbook
                  </a>
                ) : null}
              </SectionPanel>
            ))}
          </section>
        </div>
      );

    case "settings":
      return (
        <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <RoleManagementPanel
              viewerId={viewerId}
              viewerRole={role}
              viewerMode={viewerMode}
              users={viewerMode !== "preview" ? settingsUsers : null}
              cohorts={context.visibleCohorts.map((cohort) => ({
                id: cohort.id,
                name: cohort.name,
              }))}
            />
            {role === "engineer" && engineerConsole ? (
              <EngineerConsolePanels
                section="settings"
                engineerConsole={engineerConsole}
                syncJobs={visibleSyncJobs}
                intakeSyncSource={intakeSyncSource}
                billingSyncSource={billingSyncSource}
                users={settingsUsers}
              />
            ) : null}

            <SectionPanel>
              <SectionHeading
                eyebrow="Role matrix"
                title="Access boundaries"
                description="See how accounts, templates, and cohort assignments are distributed across each role."
              />
              <div className="mt-5 space-y-3">
                {settingsRoleRows.map((item) => (
                  <div key={item.role} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">{item.label}</div>
                      <div className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                        {item.activeUsers} active
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">{item.summary}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.suspendedUsers > 0 ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                          {item.suspendedUsers} suspended
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {item.templateUsers} template{item.templateUsers === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                        {item.assignmentLinks} assignment{item.assignmentLinks === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionPanel>
          </div>

          <div className="space-y-5">
            <AccountAuditLogPanel entries={viewerMode === "live" ? settingsAuditLogs : null} />

            <SectionPanel>
              <SectionHeading
                eyebrow="Operations view"
                title="Current readiness"
                description="Quick view of account setup, records coverage, and overall systems status."
              />
              <div className="mt-5 space-y-3">
                {settingsReadinessRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                        {row.label}
                      </div>
                      <SyncStatusPill status={row.tone} />
                    </div>
                    <div className="mt-3 text-sm text-[color:var(--muted)]">{row.detail}</div>
                  </div>
                ))}
              </div>
            </SectionPanel>
          </div>
        </section>
      );
  }
}
