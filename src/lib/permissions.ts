import {
  PORTAL_SECTIONS,
  type PortalSection,
  USER_ROLES,
  type UserRole,
} from "@/lib/domain";

export interface PermissionProfile {
  accessibleSections: PortalSection[];
  canViewBilling: boolean;
  canViewFamilyProfiles: boolean;
  canViewStudentProfileData: boolean;
  canManageScores: boolean;
  canMessageFamilies: boolean;
  canConfigureSystem: boolean;
  canManageRoles: boolean;
  canWriteAcademicNotes: boolean;
  canPublishResources: boolean;
  canGrantSensitiveAccess: boolean;
  canManageIncidents: boolean;
  canPreviewRoles: boolean;
  canRevokeSessions: boolean;
  canManageFeatureFlags: boolean;
}

const permissionProfiles: Record<UserRole, PermissionProfile> = {
  engineer: {
    accessibleSections: [...PORTAL_SECTIONS],
    canViewBilling: false,
    canViewFamilyProfiles: false,
    canViewStudentProfileData: false,
    canManageScores: true,
    canMessageFamilies: true,
    canConfigureSystem: true,
    canManageRoles: true,
    canWriteAcademicNotes: true,
    canPublishResources: true,
    canGrantSensitiveAccess: true,
    canManageIncidents: true,
    canPreviewRoles: true,
    canRevokeSessions: true,
    canManageFeatureFlags: true,
  },
  admin: {
    accessibleSections: [...PORTAL_SECTIONS],
    canViewBilling: true,
    canViewFamilyProfiles: true,
    canViewStudentProfileData: true,
    canManageScores: true,
    canMessageFamilies: true,
    canConfigureSystem: true,
    canManageRoles: true,
    canWriteAcademicNotes: true,
    canPublishResources: true,
    canGrantSensitiveAccess: false,
    canManageIncidents: false,
    canPreviewRoles: false,
    canRevokeSessions: false,
    canManageFeatureFlags: false,
  },
  staff: {
    accessibleSections: [
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
    ],
    canViewBilling: true,
    canViewFamilyProfiles: true,
    canViewStudentProfileData: true,
    canManageScores: true,
    canMessageFamilies: true,
    canConfigureSystem: false,
    canManageRoles: false,
    canWriteAcademicNotes: true,
    canPublishResources: true,
    canGrantSensitiveAccess: false,
    canManageIncidents: false,
    canPreviewRoles: false,
    canRevokeSessions: false,
    canManageFeatureFlags: false,
  },
  ta: {
    accessibleSections: [
      "dashboard",
      "calendar",
      "cohorts",
      "attendance",
      "students",
      "families",
      "academics",
      "messaging",
    ],
    canViewBilling: false,
    canViewFamilyProfiles: true,
    canViewStudentProfileData: true,
    canManageScores: true,
    canMessageFamilies: true,
    canConfigureSystem: false,
    canManageRoles: false,
    canWriteAcademicNotes: true,
    canPublishResources: true,
    canGrantSensitiveAccess: false,
    canManageIncidents: false,
    canPreviewRoles: false,
    canRevokeSessions: false,
    canManageFeatureFlags: false,
  },
  instructor: {
    accessibleSections: ["dashboard", "calendar", "cohorts", "attendance"],
    canViewBilling: false,
    canViewFamilyProfiles: false,
    canViewStudentProfileData: false,
    canManageScores: false,
    canMessageFamilies: false,
    canConfigureSystem: false,
    canManageRoles: false,
    canWriteAcademicNotes: false,
    canPublishResources: false,
    canGrantSensitiveAccess: false,
    canManageIncidents: false,
    canPreviewRoles: false,
    canRevokeSessions: false,
    canManageFeatureFlags: false,
  },
};

export const isRole = (value: string): value is UserRole =>
  USER_ROLES.includes(value as UserRole);

export const normalizeRole = (value?: string | string[]): UserRole => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isRole(candidate) ? candidate : "admin";
};

export const getPermissionProfile = (role: UserRole) => permissionProfiles[role];

export const getVisibleSections = (role: UserRole) =>
  permissionProfiles[role].accessibleSections;

export const canAccessSection = (role: UserRole, section: PortalSection) =>
  permissionProfiles[role].accessibleSections.includes(section);

export const hasGlobalPortalScope = (role: UserRole) =>
  role === "engineer" || role === "admin" || role === "staff";

export const canRunIntakeImports = (role: UserRole) =>
  role === "engineer" || role === "admin" || role === "staff";

export const canViewAllSyncJobs = (role: UserRole) =>
  role === "engineer" || role === "admin" || role === "staff";

export const canManageRoleTransition = (
  managerRole: UserRole,
  currentRole: UserRole,
  nextRole: UserRole,
) => {
  if (managerRole === "engineer") {
    return currentRole !== "engineer" && nextRole !== "engineer";
  }

  if (managerRole === "admin") {
    return (
      currentRole !== "engineer" &&
      currentRole !== "admin" &&
      nextRole !== "engineer" &&
      nextRole !== "admin"
    );
  }

  return false;
};

export const canProvisionRole = (
  managerRole: UserRole,
  targetRole: UserRole,
) => {
  if (managerRole === "engineer") {
    return targetRole !== "engineer";
  }

  if (managerRole === "admin") {
    return targetRole === "staff" || targetRole === "ta" || targetRole === "instructor";
  }

  return false;
};

export const canSuspendRole = (
  managerRole: UserRole,
  targetRole: UserRole,
) => {
  if (managerRole === "engineer") {
    return targetRole !== "engineer";
  }

  if (managerRole === "admin") {
    return targetRole === "staff" || targetRole === "ta" || targetRole === "instructor";
  }

  return false;
};

export const canDeleteRole = (
  managerRole: UserRole,
  targetRole: UserRole,
) => {
  if (managerRole === "engineer") {
    return targetRole !== "engineer";
  }

  if (managerRole === "admin") {
    return targetRole === "staff" || targetRole === "ta" || targetRole === "instructor";
  }

  return false;
};

export const canSendPasswordResetForRole = (
  managerRole: UserRole,
  targetRole: UserRole,
) => canSuspendRole(managerRole, targetRole);

export const canGrantSensitiveAccess = (role: UserRole) =>
  permissionProfiles[role].canGrantSensitiveAccess;

export const canManageIncidents = (role: UserRole) =>
  permissionProfiles[role].canManageIncidents;

export const canPreviewRoles = (role: UserRole) =>
  permissionProfiles[role].canPreviewRoles;

export const canRevokeSessions = (role: UserRole) =>
  permissionProfiles[role].canRevokeSessions;

export const canManageFeatureFlags = (role: UserRole) =>
  permissionProfiles[role].canManageFeatureFlags;

export const canManageCohortAssignments = (
  managerRole: UserRole,
  targetRole: UserRole,
) => {
  if (targetRole !== "ta" && targetRole !== "instructor") {
    return false;
  }

  if (managerRole === "engineer") {
    return true;
  }

  if (managerRole === "admin") {
    return true;
  }

  return false;
};

export const getProvisionableRoleOptions = (managerRole: UserRole) =>
  USER_ROLES.filter((candidateRole) => canProvisionRole(managerRole, candidateRole));

export const getManageableRoleOptions = (
  managerRole: UserRole,
  currentRole: UserRole,
) => USER_ROLES.filter((candidateRole) => canManageRoleTransition(managerRole, currentRole, candidateRole));
