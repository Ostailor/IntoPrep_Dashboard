import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export type AccountGovernanceAction =
  | "account_provisioned"
  | "role_updated"
  | "account_suspended"
  | "account_reactivated"
  | "account_deleted"
  | "password_reset_requested"
  | "password_changed"
  | "session_revoked"
  | "sensitive_access_granted"
  | "sensitive_access_revoked"
  | "sync_incident_updated"
  | "integration_control_updated"
  | "change_freeze_updated"
  | "maintenance_banner_updated"
  | "feature_flag_updated"
  | "support_note_logged"
  | "repair_action_run"
  | "billing_follow_up_updated"
  | "billing_exported"
  | "admin_task_updated"
  | "admin_saved_view_updated"
  | "family_contact_logged"
  | "admin_announcement_updated"
  | "cohort_operation_run"
  | "bulk_operation_run"
  | "archive_state_updated"
  | "task_activity_logged"
  | "lead_updated"
  | "approval_request_updated"
  | "escalation_updated"
  | "outreach_template_updated"
  | "session_checklist_updated"
  | "message_thread_started"
  | "session_handoff_logged"
  | "session_instruction_note_saved"
  | "instructor_follow_up_flag_created"
  | "attendance_exception_flagged"
  | "session_coverage_flagged";

export function normalizeManagedEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function recordAccountAuditLog(
  serviceClient: SupabaseClient<Database>,
  {
    actorId,
    targetUserId,
    targetEmail,
    targetType,
    issueReference,
    action,
    summary,
    details,
    demo,
  }: {
    actorId?: string | null;
    targetUserId?: string | null;
    targetEmail?: string | null;
    targetType?: string | null;
    issueReference?: string | null;
    action: AccountGovernanceAction;
    summary: string;
    details?: Json;
    demo?: boolean;
  },
) {
  let auditDemo = demo ?? false;

  if (demo === undefined) {
    const profileIds = [actorId, targetUserId].filter(
      (profileId): profileId is string => typeof profileId === "string" && profileId.length > 0,
    );

    if (profileIds.length > 0) {
      const { data } = await serviceClient
        .from("profiles")
        .select("demo")
        .in("id", Array.from(new Set(profileIds)));
      auditDemo = (data ?? []).some((profile) => profile.demo);
    } else if (targetEmail) {
      const normalizedEmail = targetEmail.toLowerCase();
      auditDemo =
        normalizedEmail.startsWith("demo.") ||
        normalizedEmail.startsWith("qa-") ||
        normalizedEmail.startsWith("qa+") ||
        normalizedEmail.startsWith("qa.") ||
        normalizedEmail.endsWith("@intoprep.test");
    }
  }

  const { error } = await serviceClient.from("account_audit_logs").insert({
    actor_id: actorId ?? null,
    target_user_id: targetUserId ?? null,
    target_email: targetEmail ?? null,
    target_type: targetType ?? null,
    issue_reference: issueReference ?? null,
    action,
    summary,
    details: details ?? {},
    demo: auditDemo,
  });

  return error;
}
