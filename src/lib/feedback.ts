import type {
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackSubmission,
  User,
} from "@/lib/domain";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type FeedbackSubmissionRow = Database["public"]["Tables"]["feedback_submissions"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const feedbackCategories: FeedbackCategory[] = ["addition", "bug", "confusing", "other"];
const feedbackPriorities: FeedbackPriority[] = ["normal", "urgent"];
const feedbackStatuses: FeedbackStatus[] = ["new", "reviewed", "planned", "resolved", "closed"];

function normalizeFeedbackCategory(value: unknown): FeedbackCategory {
  return typeof value === "string" && feedbackCategories.includes(value as FeedbackCategory)
    ? (value as FeedbackCategory)
    : "addition";
}

function normalizeFeedbackPriority(value: unknown): FeedbackPriority {
  return typeof value === "string" && feedbackPriorities.includes(value as FeedbackPriority)
    ? (value as FeedbackPriority)
    : "normal";
}

function normalizeFeedbackStatus(value: unknown): FeedbackStatus {
  return typeof value === "string" && feedbackStatuses.includes(value as FeedbackStatus)
    ? (value as FeedbackStatus)
    : "new";
}

function cleanSingleLine(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanBody(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function mapFeedbackSubmission(
  row: FeedbackSubmissionRow,
  profileById: Map<string, ProfileRow>,
): FeedbackSubmission {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterEmail: row.reporter_email,
    reporterName: row.reporter_name,
    reporterRole: row.reporter_role,
    category: normalizeFeedbackCategory(row.category),
    priority: normalizeFeedbackPriority(row.priority),
    status: normalizeFeedbackStatus(row.status),
    subject: row.subject,
    body: row.body,
    pagePath: row.page_path,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by ? (profileById.get(row.reviewed_by)?.full_name ?? null) : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProfilesByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("profiles").select("*").in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

export async function submitFeedback({
  viewer,
  email,
  category,
  priority,
  subject,
  body,
  pagePath,
  userAgent,
}: {
  viewer: User;
  email?: string | null;
  category: unknown;
  priority: unknown;
  subject: unknown;
  body: unknown;
  pagePath: unknown;
  userAgent?: string | null;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Feedback storage is not configured.");
  }

  const cleanSubject = cleanSingleLine(subject, 140);
  const cleanMessage = cleanBody(body, 4000);

  if (cleanSubject.length < 3) {
    throw new Error("Add a short subject so the team knows what this is about.");
  }

  if (cleanMessage.length < 10) {
    throw new Error("Add a little more detail before sending feedback.");
  }

  const cleanPath = cleanSingleLine(pagePath, 500);
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("feedback_submissions")
    .insert({
      reporter_id: viewer.id,
      reporter_email: email ?? null,
      reporter_name: viewer.name,
      reporter_role: viewer.role,
      category: normalizeFeedbackCategory(category),
      priority: normalizeFeedbackPriority(priority),
      subject: cleanSubject,
      body: cleanMessage,
      page_path: cleanPath.length > 0 ? cleanPath : null,
      user_agent: userAgent?.slice(0, 500) ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Feedback could not be saved.");
  }

  return data.id;
}

export async function listFeedbackSubmissions(viewer: User) {
  if (!hasSupabaseServiceRole() || viewer.role !== "engineer") {
    return [];
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("feedback_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as FeedbackSubmissionRow[];
  const profileById = await getProfilesByIds(
    rows
      .map((row) => row.reviewed_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
  );

  return rows.map((row) => mapFeedbackSubmission(row, profileById));
}

export async function updateFeedbackStatus({
  viewer,
  feedbackId,
  status,
}: {
  viewer: User;
  feedbackId: unknown;
  status: unknown;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Feedback storage is not configured.");
  }

  if (viewer.role !== "engineer") {
    throw new Error("Only engineer users can triage feedback.");
  }

  const cleanId = cleanSingleLine(feedbackId, 80);
  const nextStatus = normalizeFeedbackStatus(status);

  if (cleanId.length === 0) {
    throw new Error("Choose a feedback item to update.");
  }

  const reviewedAt = nextStatus === "new" ? null : new Date().toISOString();
  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient
    .from("feedback_submissions")
    .update({
      status: nextStatus,
      reviewed_by: nextStatus === "new" ? null : viewer.id,
      reviewed_at: reviewedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cleanId);

  if (error) {
    throw new Error(error.message);
  }

  return { status: nextStatus, reviewedAt };
}
