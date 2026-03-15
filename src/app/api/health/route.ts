import { NextResponse } from "next/server";
import { hasSupabaseServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      supabasePublic: isSupabaseConfigured(),
      supabaseServiceRole: hasSupabaseServiceRole(),
      cronSecret: Boolean(process.env.CRON_SECRET),
      syncAlertEmail: Boolean(process.env.RESEND_API_KEY && process.env.SYNC_ALERT_EMAIL_FROM),
    },
  });
}
