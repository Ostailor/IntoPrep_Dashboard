import type { UserRole } from "@/lib/domain";
import type { PortalContext, SessionRosterRow } from "@/lib/portal";
import { getPermissionProfile } from "@/lib/permissions";

function groupRows<Row>(rows: Row[], getKey: (row: Row) => string) {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key);

    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return groups;
}

function groupValues<Row>(
  rows: Row[],
  getKey: (row: Row) => string,
  getValue: (row: Row) => string,
) {
  const groups = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key);

    if (group) {
      group.add(getValue(row));
    } else {
      groups.set(key, new Set([getValue(row)]));
    }
  }

  return groups;
}

export function buildVisibleSessionRosterMaps(
  role: UserRole,
  context: PortalContext,
): Record<string, SessionRosterRow[]> {
  const permissions = getPermissionProfile(role);
  const studentById = new Map(context.visibleStudents.map((student) => [student.id, student]));
  const familyById = new Map(context.visibleFamilies.map((family) => [family.id, family]));
  const assessmentById = new Map(
    context.visibleAssessments.map((assessment) => [assessment.id, assessment]),
  );
  const assessmentIdsByCohort = groupValues(
    context.visibleAssessments,
    (assessment) => assessment.cohortId,
    (assessment) => assessment.id,
  );
  const resultsByStudent = groupRows(
    context.visibleResults,
    (result) => result.studentId,
  );
  const enrollmentsByCohort = groupRows(
    context.visibleEnrollments.filter((enrollment) => enrollment.status === "active"),
    (enrollment) => enrollment.cohortId,
  );
  const sessionsByCohort = groupRows(
    context.visibleSessions,
    (session) => session.cohortId,
  );
  const rosterByCohort = new Map<string, SessionRosterRow[]>();

  for (const cohortId of sessionsByCohort.keys()) {
    const assessmentIds = assessmentIdsByCohort.get(cohortId) ?? new Set<string>();
    const rows = (enrollmentsByCohort.get(cohortId) ?? [])
      .map((enrollment): SessionRosterRow | null => {
        const student = studentById.get(enrollment.studentId);

        if (!student) {
          return null;
        }

        const family = familyById.get(student.familyId);
        const practiceTests = (resultsByStudent.get(student.id) ?? [])
          .filter((result) => assessmentIds.has(result.assessmentId))
          .map((result) => {
            const assessment = assessmentById.get(result.assessmentId);

            return assessment
              ? {
                  resultId: result.id,
                  assessmentId: result.assessmentId,
                  title: assessment.title,
                  date: assessment.date,
                  totalScore: result.totalScore,
                  deltaFromPrevious: result.deltaFromPrevious,
                  sectionScores: result.sectionScores,
                  notes: result.notes,
                }
              : null;
          })
          .filter((result): result is NonNullable<typeof result> => result !== null)
          .sort((left, right) => right.date.localeCompare(left.date));
        const latestTest = practiceTests[0];

        return {
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          cohortId,
          gradeLevel: permissions.canViewStudentProfileData ? student.gradeLevel : undefined,
          school: permissions.canViewStudentProfileData ? student.school : undefined,
          familyEmail: permissions.canViewFamilyContactBasics ? family?.email : undefined,
          familyPhone: permissions.canViewFamilyContactBasics ? family?.phone : undefined,
          attendance: "present",
          latestAssessment: latestTest
            ? {
                title: latestTest.title,
                totalScore: latestTest.totalScore,
                deltaFromPrevious: latestTest.deltaFromPrevious,
                sectionScores: latestTest.sectionScores,
                date: latestTest.date,
                notes: latestTest.notes,
              }
            : undefined,
          practiceTests,
          trend: [],
        };
      })
      .filter((row): row is SessionRosterRow => row !== null)
      .sort((left, right) => left.studentName.localeCompare(right.studentName));

    rosterByCohort.set(cohortId, rows);
  }

  return Object.fromEntries(
    context.visibleSessions.map((session) => [
      session.id,
      rosterByCohort.get(session.cohortId) ?? [],
    ]),
  );
}
