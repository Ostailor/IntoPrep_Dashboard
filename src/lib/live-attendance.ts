import type { User } from "@/lib/domain";
import { canViewFamilyAttendanceContext, viewerCanAccessCohort } from "@/lib/attendance";
import { formatTimeRange, type SessionRosterRow } from "@/lib/portal";
import { hasGlobalPortalScope } from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

interface AttendanceSessionCard {
  id: string;
  title: string;
  timeLabel: string;
  roomLabel: string;
}

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type AttendanceRecordRow = Database["public"]["Tables"]["attendance_records"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type CohortAssignmentRow = Database["public"]["Tables"]["cohort_assignments"]["Row"];

export interface LiveAttendanceBundle {
  currentDate: string;
  sessions: AttendanceSessionCard[];
  rosters: Record<string, SessionRosterRow[]>;
}

function getNewYorkDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function getNextDate(date: string) {
  const next = new Date(`${date}T00:00:00-04:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(next);
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

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];
type AssessmentResultRow = Database["public"]["Tables"]["assessment_results"]["Row"];

function buildStudentTrendMap(
  assessments: AssessmentRow[],
  results: AssessmentResultRow[],
) {
  const assessmentMap = byId(assessments);
  const trendMap = new Map<string, { label: string; score: number }[]>();

  results.forEach((result) => {
    const assessment = assessmentMap.get(result.assessment_id);
    if (!assessment) {
      return;
    }

    const existing = trendMap.get(result.student_id) ?? [];
    existing.push({
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }).format(new Date(`${assessment.date}T12:00:00-04:00`)),
      score: result.total_score,
    });
    trendMap.set(result.student_id, existing);
  });

  return trendMap;
}

export async function getLiveAttendanceBundle(
  viewer: User,
): Promise<LiveAttendanceBundle | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const currentDate = getNewYorkDate();
  const nextDate = getNextDate(currentDate);
  const accessibleCohortIds = await getAccessibleCohortIds(viewer);

  const sessionsQuery = serviceClient
    .from("sessions")
    .select("*")
    .gte("start_at", `${currentDate}T00:00:00-04:00`)
    .lt("start_at", `${nextDate}T00:00:00-04:00`)
    .order("start_at", { ascending: true });

  const scopedSessionsQuery =
    accessibleCohortIds && accessibleCohortIds.length > 0
      ? sessionsQuery.in("cohort_id", accessibleCohortIds)
      : accessibleCohortIds?.length === 0
        ? null
        : sessionsQuery;

  const sessionsResult = scopedSessionsQuery ? await scopedSessionsQuery : { data: [] };
  const sessions = (sessionsResult.data ?? []) as SessionRow[];

  if (sessions.length === 0) {
    return {
      currentDate,
      sessions: [],
      rosters: {},
    };
  }

  const cohortIds = Array.from(new Set(sessions.map((session) => session.cohort_id)));
  const sessionIds = sessions.map((session) => session.id);

  const [enrollmentsResult, attendanceRecordsResult, assessmentsResult, allAssessmentsResult] =
    await Promise.all([
    serviceClient
      .from("enrollments")
      .select("*")
      .in("cohort_id", cohortIds)
      .eq("status", "active"),
    serviceClient.from("attendance_records").select("*").in("session_id", sessionIds),
    serviceClient.from("assessments").select("*").in("cohort_id", cohortIds).eq("date", currentDate),
    serviceClient.from("assessments").select("*").in("cohort_id", cohortIds).order("date", { ascending: true }),
  ]);
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const attendanceRecords = (attendanceRecordsResult.data ?? []) as AttendanceRecordRow[];
  const assessments = (assessmentsResult.data ?? []) as AssessmentRow[];
  const allAssessments = (allAssessmentsResult.data ?? []) as AssessmentRow[];

  const studentIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.student_id)));
  const assessmentIds = assessments.map((assessment) => assessment.id);
  const allAssessmentIds = allAssessments.map((assessment) => assessment.id);

  const studentsResult = await serviceClient
    .from("students")
    .select("id, family_id, first_name, last_name, grade_level, school, focus")
    .in("id", studentIds);
  const studentRows = (studentsResult.data ?? []) as StudentRow[];
  const familyIds = canViewFamilyAttendanceContext(viewer.role)
    ? Array.from(new Set(studentRows.map((student) => student.family_id)))
    : [];

  const [familiesResult, todayResultsResult, historicalResultsResult] = await Promise.all([
    familyIds.length > 0
      ? serviceClient.from("families").select("id, email, phone").in("id", familyIds)
      : Promise.resolve({ data: [] }),
    assessmentIds.length > 0
      ? serviceClient.from("assessment_results").select("*").in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [], error: null }),
    allAssessmentIds.length > 0
      ? serviceClient.from("assessment_results").select("*").in("assessment_id", allAssessmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const familyRows = (familiesResult.data ?? []) as Pick<FamilyRow, "id" | "email" | "phone">[];
  const todayResults = (todayResultsResult.data ?? []) as AssessmentResultRow[];
  const historicalResults = (historicalResultsResult.data ?? []) as AssessmentResultRow[];

  const studentMap = new Map(studentRows.map((student) => [student.id, student]));
  const familyMap = new Map(familyRows.map((family) => [family.id, family]));
  const todayAssessmentByCohort = new Map(assessments.map((assessment) => [assessment.cohort_id, assessment]));
  const todayResultByStudent = new Map(todayResults.map((result) => [result.student_id, result]));
  const trendMap = buildStudentTrendMap(allAssessments, historicalResults);

  const rosters: Record<string, SessionRosterRow[]> = {};

  sessions.forEach((session) => {
    const cohortStudentIds = enrollments
      .filter((enrollment) => enrollment.cohort_id === session.cohort_id)
      .map((enrollment) => enrollment.student_id);

    const rows: SessionRosterRow[] = [];

    cohortStudentIds.forEach((studentId) => {
      const student = studentMap.get(studentId);
      if (!student) {
        return;
      }

      const family = canViewFamilyAttendanceContext(viewer.role)
        ? familyMap.get(student.family_id)
        : undefined;
      const attendance =
        attendanceRecords.find(
          (record) => record.session_id === session.id && record.student_id === studentId,
        )?.status ?? "present";
      const result = todayResultByStudent.get(studentId);
      const todayAssessment = todayAssessmentByCohort.get(session.cohort_id);

      rows.push({
        studentId,
        studentName: `${student.first_name} ${student.last_name}`,
        gradeLevel: viewer.role === "instructor" ? undefined : student.grade_level,
        school: viewer.role === "instructor" ? undefined : student.school,
        familyEmail: family?.email,
        familyPhone: family?.phone,
        attendance,
        latestAssessment:
          result && todayAssessment
            ? {
                title: todayAssessment.title,
                totalScore: result.total_score,
                deltaFromPrevious: result.delta_from_previous,
                sectionScores: Array.isArray(result.section_scores)
                  ? (result.section_scores as { label: string; score: number }[])
                  : [],
              }
            : undefined,
        trend: trendMap.get(studentId) ?? [],
      });
    });

    rows.sort((left, right) => left.studentName.localeCompare(right.studentName));
    rosters[session.id] = rows;
  });

  return {
    currentDate,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      timeLabel: formatTimeRange(session.start_at, session.end_at),
      roomLabel: session.room_label,
    })),
    rosters,
  };
}

export async function persistAttendanceStatus({
  viewer,
  sessionId,
  studentId,
  status,
}: {
  viewer: User;
  sessionId: string;
  studentId: string;
  status: "present" | "absent" | "tardy";
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: session } = await serviceClient
    .from("sessions")
    .select("id, cohort_id")
    .eq("id", sessionId)
    .maybeSingle();
  const typedSession = (session ?? null) as Pick<SessionRow, "id" | "cohort_id"> | null;

  if (!typedSession || !viewerCanAccessCohort(viewer, typedSession.cohort_id)) {
    throw new Error("You do not have access to this session.");
  }

  const { data: enrollment } = await serviceClient
    .from("enrollments")
    .select("id")
    .eq("cohort_id", typedSession.cohort_id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) {
    throw new Error("That student is not actively enrolled in this session.");
  }

  const recordId = `${sessionId}:${studentId}`;
  const { error } = await serviceClient.from("attendance_records").upsert(
    {
      id: recordId,
      session_id: sessionId,
      student_id: studentId,
      status,
      updated_by: viewer.id,
    },
    { onConflict: "session_id,student_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return { status };
}
