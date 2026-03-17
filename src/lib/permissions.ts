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
  canViewFamilyContactBasics: boolean;
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
  canManageBillingFollowUp: boolean;
  canExportBilling: boolean;
  canManageOperationalTasks: boolean;
  canManageSavedViews: boolean;
  canManageAdminAnnouncements: boolean;
  canManageSchedules: boolean;
  canManageBulkOperations: boolean;
  canRunRoutineImports: boolean;
  canManageSyncSources: boolean;
  canUpdateAssignedTasks: boolean;
  canEditSessions: boolean;
  canMoveSingleEnrollment: boolean;
  canManageAssignedBillingFollowUp: boolean;
  canLogFamilyContact: boolean;
  canClaimLeads: boolean;
  canEscalateToAdmin: boolean;
  canSubmitApprovalRequests: boolean;
  canManageOwnTemplates: boolean;
  canUpdateSessionChecklists: boolean;
  canSavePersonalViews: boolean;
  canStartFamilyThreads: boolean;
}

const permissionProfiles: Record<UserRole, PermissionProfile> = {
  engineer: {
    accessibleSections: [...PORTAL_SECTIONS],
    canViewBilling: false,
    canViewFamilyProfiles: false,
    canViewFamilyContactBasics: false,
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
    canManageBillingFollowUp: false,
    canExportBilling: false,
    canManageOperationalTasks: false,
    canManageSavedViews: false,
    canManageAdminAnnouncements: false,
    canManageSchedules: false,
    canManageBulkOperations: false,
    canRunRoutineImports: true,
    canManageSyncSources: true,
    canUpdateAssignedTasks: false,
    canEditSessions: false,
    canMoveSingleEnrollment: false,
    canManageAssignedBillingFollowUp: false,
    canLogFamilyContact: false,
    canClaimLeads: false,
    canEscalateToAdmin: false,
    canSubmitApprovalRequests: false,
    canManageOwnTemplates: false,
    canUpdateSessionChecklists: true,
    canSavePersonalViews: false,
    canStartFamilyThreads: true,
  },
  admin: {
    accessibleSections: [...PORTAL_SECTIONS],
    canViewBilling: true,
    canViewFamilyProfiles: true,
    canViewFamilyContactBasics: true,
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
    canManageBillingFollowUp: true,
    canExportBilling: true,
    canManageOperationalTasks: true,
    canManageSavedViews: true,
    canManageAdminAnnouncements: true,
    canManageSchedules: true,
    canManageBulkOperations: true,
    canRunRoutineImports: true,
    canManageSyncSources: true,
    canUpdateAssignedTasks: true,
    canEditSessions: true,
    canMoveSingleEnrollment: true,
    canManageAssignedBillingFollowUp: true,
    canLogFamilyContact: true,
    canClaimLeads: true,
    canEscalateToAdmin: true,
    canSubmitApprovalRequests: true,
    canManageOwnTemplates: true,
    canUpdateSessionChecklists: true,
    canSavePersonalViews: true,
    canStartFamilyThreads: true,
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
    canViewFamilyContactBasics: true,
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
    canManageBillingFollowUp: false,
    canExportBilling: false,
    canManageOperationalTasks: false,
    canManageSavedViews: false,
    canManageAdminAnnouncements: false,
    canManageSchedules: false,
    canManageBulkOperations: false,
    canRunRoutineImports: true,
    canManageSyncSources: false,
    canUpdateAssignedTasks: true,
    canEditSessions: true,
    canMoveSingleEnrollment: true,
    canManageAssignedBillingFollowUp: true,
    canLogFamilyContact: true,
    canClaimLeads: true,
    canEscalateToAdmin: true,
    canSubmitApprovalRequests: true,
    canManageOwnTemplates: true,
    canUpdateSessionChecklists: true,
    canSavePersonalViews: true,
    canStartFamilyThreads: true,
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
    canViewFamilyProfiles: false,
    canViewFamilyContactBasics: true,
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
    canManageBillingFollowUp: false,
    canExportBilling: false,
    canManageOperationalTasks: false,
    canManageSavedViews: false,
    canManageAdminAnnouncements: false,
    canManageSchedules: false,
    canManageBulkOperations: false,
    canRunRoutineImports: false,
    canManageSyncSources: false,
    canUpdateAssignedTasks: true,
    canEditSessions: false,
    canMoveSingleEnrollment: false,
    canManageAssignedBillingFollowUp: false,
    canLogFamilyContact: false,
    canClaimLeads: false,
    canEscalateToAdmin: false,
    canSubmitApprovalRequests: false,
    canManageOwnTemplates: false,
    canUpdateSessionChecklists: true,
    canSavePersonalViews: false,
    canStartFamilyThreads: true,
  },
  instructor: {
    accessibleSections: ["dashboard", "calendar", "cohorts", "attendance", "academics"],
    canViewBilling: false,
    canViewFamilyProfiles: false,
    canViewFamilyContactBasics: false,
    canViewStudentProfileData: false,
    canManageScores: false,
    canMessageFamilies: false,
    canConfigureSystem: false,
    canManageRoles: false,
    canWriteAcademicNotes: true,
    canPublishResources: false,
    canGrantSensitiveAccess: false,
    canManageIncidents: false,
    canPreviewRoles: false,
    canRevokeSessions: false,
    canManageFeatureFlags: false,
    canManageBillingFollowUp: false,
    canExportBilling: false,
    canManageOperationalTasks: false,
    canManageSavedViews: false,
    canManageAdminAnnouncements: false,
    canManageSchedules: false,
    canManageBulkOperations: false,
    canRunRoutineImports: false,
    canManageSyncSources: false,
    canUpdateAssignedTasks: true,
    canEditSessions: false,
    canMoveSingleEnrollment: false,
    canManageAssignedBillingFollowUp: false,
    canLogFamilyContact: false,
    canClaimLeads: false,
    canEscalateToAdmin: false,
    canSubmitApprovalRequests: false,
    canManageOwnTemplates: false,
    canUpdateSessionChecklists: false,
    canSavePersonalViews: false,
    canStartFamilyThreads: false,
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
  permissionProfiles[role].canRunRoutineImports;

export const canViewFamilyContactBasics = (role: UserRole) =>
  permissionProfiles[role].canViewFamilyContactBasics;

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

export const canManageBillingFollowUp = (role: UserRole) =>
  permissionProfiles[role].canManageBillingFollowUp;

export const canExportBilling = (role: UserRole) =>
  permissionProfiles[role].canExportBilling;

export const canManageOperationalTasks = (role: UserRole) =>
  permissionProfiles[role].canManageOperationalTasks;

export const canManageSavedViews = (role: UserRole) =>
  permissionProfiles[role].canManageSavedViews;

export const canManageAdminAnnouncements = (role: UserRole) =>
  permissionProfiles[role].canManageAdminAnnouncements;

export const canManageSchedules = (role: UserRole) =>
  permissionProfiles[role].canManageSchedules;

export const canManageBulkOperations = (role: UserRole) =>
  permissionProfiles[role].canManageBulkOperations;

export const canManageSyncSources = (role: UserRole) =>
  permissionProfiles[role].canManageSyncSources;

export const canUpdateAssignedTasks = (role: UserRole) =>
  permissionProfiles[role].canUpdateAssignedTasks;

export const canEditSessions = (role: UserRole) =>
  permissionProfiles[role].canEditSessions;

export const canMoveSingleEnrollment = (role: UserRole) =>
  permissionProfiles[role].canMoveSingleEnrollment;

export const canManageAssignedBillingFollowUp = (role: UserRole) =>
  permissionProfiles[role].canManageAssignedBillingFollowUp;

export const canLogFamilyContact = (role: UserRole) =>
  permissionProfiles[role].canLogFamilyContact;

export const canClaimLeads = (role: UserRole) =>
  permissionProfiles[role].canClaimLeads;

export const canEscalateToAdmin = (role: UserRole) =>
  permissionProfiles[role].canEscalateToAdmin;

export const canSubmitApprovalRequests = (role: UserRole) =>
  permissionProfiles[role].canSubmitApprovalRequests;

export const canManageOwnTemplates = (role: UserRole) =>
  permissionProfiles[role].canManageOwnTemplates;

export const canUpdateSessionChecklists = (role: UserRole) =>
  permissionProfiles[role].canUpdateSessionChecklists;

export const canSavePersonalViews = (role: UserRole) =>
  permissionProfiles[role].canSavePersonalViews;

export const canStartFamilyThreads = (role: UserRole) =>
  permissionProfiles[role].canStartFamilyThreads;

export const canManageCohortAssignments = (
  managerRole: UserRole,
  targetRole: UserRole,
) => {
  if (targetRole !== "staff" && targetRole !== "ta" && targetRole !== "instructor") {
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
