import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServiceConfig } from "@/lib/supabase/config";

export function createSupabaseServiceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
