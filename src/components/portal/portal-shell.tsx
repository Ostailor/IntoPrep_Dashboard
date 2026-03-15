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
  getVisibleTasks,
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
import { IntakeImportPanel } from "@/components/portal/intake-import-panel";
import { MessagingReplyPanel } from "@/components/portal/messaging-reply-panel";
import { PortalLiveSync } from "@/components/portal/portal-live-sync";
import { PortalNavPrefetch } from "@/components/portal/portal-nav-prefetch";
import { RoleManagementPanel } from "@/components/portal/role-management-panel";
import { TrendSparkline } from "@/components/portal/trend-sparkline";
import { DesktopUpdateButton } from "@/components/desktop-update-button";
import { InstallAppButton } from "@/components/install-app-button";

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
    viewer.mode === "live" ? await getLivePortalBundle(viewer.user, section) : null;
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
    viewer.mode === "live" && section === "attendance"
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
  const visibleTasks = getVisibleTasks(role);
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
    viewer.mode === "live" && livePortal
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
  const roleScopedCohortCount =
    role === "engineer" || role === "admin" || role === "staff"
      ? context.visibleCohorts.length
      : currentUser.assignedCohortIds.length || context.visibleCohorts.length;
  const isPreview = viewer.mode === "preview";
  const roleHref = (path: string, candidateRole = role) =>
    isPreview ? `${path}?role=${candidateRole}` : path;
  const currentSectionHref = roleHref(`/${section}`);
  const navHrefs = context.visibleSections
    .map((item) => roleHref(`/${item}`))
    .filter((href) => href !== currentSectionHref);
  const snapshotDate = liveAttendance?.currentDate ?? context.currentDate;

  return (
    <div className="min-h-screen px-4 py-5 lg:px-6 lg:py-6">
      <PortalLiveSync enabled={viewer.mode === "live"} section={section} />
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
                    href={roleHref(`/${item}`)}
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
                {roleLabels[role]}
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
            {viewer.mode === "live" ? (
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
                        href={roleHref(`/${section}`, candidate)}
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
                    Signed in as {currentUser.name}.
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
                  href={roleHref(`/${fallbackSection}`)}
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
                      <div className={clsx("rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]", roleAccent[role])}>
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
                        {visibleTasks.map((task) => (
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
                settingsUsers: viewer.mode === "live" ? livePortal?.settingsUsers ?? null : null,
                settingsAuditLogs: viewer.mode === "live" ? livePortal?.settingsAuditLogs ?? null : null,
                settingsReadinessRows,
                attendanceSessions,
                rosterMaps,
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
  settingsReadinessRows,
  attendanceSessions,
  rosterMaps,
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
  permissions: ReturnType<typeof getPermissionProfile>;
  todayResults: ReturnType<typeof getTodayResults>;
  context: ReturnType<typeof getPortalContext>;
}) {
  switch (section) {
    case "dashboard":
      return (
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
      );

    case "attendance":
      return (
        <AttendanceBoard
          role={role}
          sessions={attendanceSessions}
          rosters={rosterMaps}
          persistence={{
            enabled: viewerMode === "live",
            endpoint: "/api/attendance",
          }}
        />
      );

    case "students":
      return (
        <SectionPanel>
          <SectionHeading
            eyebrow="Student directory"
            title="Academic-facing student list"
            description="TA, staff, and admin can see student records with support-ready context. Instructors do not see this surface."
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
                  </div>
                  <div className="text-[color:var(--muted)]">{student.school}</div>
                  <div>
                    <div className="font-semibold text-[color:var(--navy-strong)]">{student.targetTest}</div>
                    <div className="mt-1 text-[color:var(--muted)]">{student.focus}</div>
                  </div>
                  <div className="text-[color:var(--muted)]">
                    {permissions.canViewFamilyProfiles && family ? family.email : "Restricted"}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>
      );

    case "families":
      return (
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
                  {permissions.canViewBilling && invoice ? (
                    <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                      {formatMoney(invoice.amountDue)} due
                    </span>
                  ) : null}
                </div>
              </SectionPanel>
            );
          })}
        </section>
      );

    case "programs":
      return (
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
      );

    case "academics":
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
        <MessagingReplyPanel
          viewerRole={role}
          threads={context.visibleThreads}
          threadPosts={visibleThreadPosts}
        />
      );

    case "billing":
      return (
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
                <span className="font-semibold text-[color:var(--navy-strong)]">{row.familyName}</span>
                <span className="text-[color:var(--muted)]">{formatMoney(row.amountDue)}</span>
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
          <IntakeImportPanel recentRuns={visibleImportRuns} syncSource={intakeSyncSource} />
          <BillingSyncPanel syncSource={billingSyncSource} />
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
              users={viewerMode === "live" ? settingsUsers : null}
              cohorts={context.visibleCohorts.map((cohort) => ({
                id: cohort.id,
                name: cohort.name,
              }))}
            />

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
