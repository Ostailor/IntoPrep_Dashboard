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
  | "password_changed";

export function normalizeManagedEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function recordAccountAuditLog(
  serviceClient: SupabaseClient<Database>,
  {
    actorId,
    targetUserId,
    targetEmail,
    action,
    summary,
    details,
  }: {
    actorId?: string | null;
    targetUserId?: string | null;
    targetEmail?: string | null;
    action: AccountGovernanceAction;
    summary: string;
    details?: Json;
  },
) {
  const { error } = await serviceClient.from("account_audit_logs").insert({
    actor_id: actorId ?? null,
    target_user_id: targetUserId ?? null,
    target_email: targetEmail ?? null,
    action,
    summary,
    details: details ?? {},
  });

  return error;
}
