import { ATTENDANCE_STATUSES, type AttendanceStatus, type User, type UserRole } from "@/lib/domain";
import { hasGlobalPortalScope } from "@/lib/permissions";

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}

export function canEditAttendance(role: UserRole) {
  return ["engineer", "admin", "staff", "ta", "instructor"].includes(role);
}

export function canViewFamilyAttendanceContext(role: UserRole) {
  return role !== "instructor";
}

export function viewerCanAccessCohort(viewer: User, cohortId: string) {
  if (hasGlobalPortalScope(viewer.role)) {
    return true;
  }

  return viewer.assignedCohortIds.includes(cohortId);
}
