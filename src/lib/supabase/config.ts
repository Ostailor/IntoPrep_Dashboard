const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localQaMode = process.env.INTO_PREP_LOCAL_QA === "1";

export const isSupabaseConfigured = () => localQaMode || Boolean(publicUrl && publicAnonKey);

export const hasSupabaseServiceRole = () =>
  Boolean(publicUrl && publicAnonKey && serviceRoleKey);

export const getSupabasePublicConfig = () => {
  if (!publicUrl || !publicAnonKey) {
    throw new Error(
      "Supabase public environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return {
    url: publicUrl,
    anonKey: publicAnonKey,
  };
};

export const getSupabaseServiceConfig = () => {
  if (!publicUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return {
    url: publicUrl,
    serviceRoleKey,
  };
};
