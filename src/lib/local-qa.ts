import type { User, UserRole } from "@/lib/domain";

export const LOCAL_QA_COOKIE = "intoprep-local-qa-role";
export const LOCAL_QA_PASSWORD = "IntoPrepQA!2026";

const qaRoles = ["admin", "staff", "ta", "instructor"] as const satisfies UserRole[];

export function isLocalQaMode() {
  return process.env.INTO_PREP_LOCAL_QA === "1";
}

export function getLocalQaRole(value: unknown): UserRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  return qaRoles.find((role) => normalized.includes(role)) ?? null;
}

export function getLocalQaEmail(role: UserRole) {
  return `qa-${role}@intoprep.local`;
}

export function getLocalQaUser(role: UserRole): User {
  const labels: Record<UserRole, { name: string; title: string }> = {
    engineer: { name: "QA Engineer", title: "Engineering Console" },
    admin: { name: "QA Admin", title: "Operations Administrator" },
    staff: { name: "QA Staff", title: "Campus Operations" },
    ta: { name: "QA TA", title: "Teaching Assistant" },
    instructor: { name: "QA Instructor", title: "Lead Instructor" },
  };

  return {
    id: `local-qa-${role}`,
    name: labels[role].name,
    role,
    title: labels[role].title,
    assignedCohortIds:
      role === "ta" || role === "instructor" ? ["qa-sat-weekend"] : [],
  };
}
