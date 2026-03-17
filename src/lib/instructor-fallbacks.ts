import type { InstructorFollowUpStatus, InstructorFollowUpTargetType } from "@/lib/domain";

const SESSION_NOTE_MARKER = "[[INSTRUCTOR_SESSION_NOTE]]";
const FOLLOW_UP_MARKER = "[[INSTRUCTOR_FOLLOW_UP]]";

export function isMissingSupabaseTableError(
  error: { message?: string | null; code?: string | null } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

export function buildFallbackSessionNoteBody(body: string) {
  return `${SESSION_NOTE_MARKER}\n${body.trim()}`;
}

export function isFallbackSessionNoteBody(body: string | null | undefined) {
  return typeof body === "string" && body.startsWith(SESSION_NOTE_MARKER);
}

export function stripFallbackSessionNoteBody(body: string) {
  return isFallbackSessionNoteBody(body)
    ? body.slice(SESSION_NOTE_MARKER.length).trimStart()
    : body;
}

export function buildFallbackFollowUpReason(
  targetType: InstructorFollowUpTargetType,
  summary: string,
) {
  return `${FOLLOW_UP_MARKER}[${targetType}] ${summary.trim()}`;
}

export function parseFallbackFollowUpReason(reason: string | null | undefined): {
  targetType: InstructorFollowUpTargetType;
  summary: string;
} | null {
  if (typeof reason !== "string") {
    return null;
  }

  const match = /^\[\[INSTRUCTOR_FOLLOW_UP\]\]\[(student|session)\]\s+([\s\S]+)$/.exec(
    reason.trim(),
  );

  if (!match) {
    return null;
  }

  const [, targetType, summary] = match;
  return {
    targetType: targetType as InstructorFollowUpTargetType,
    summary,
  };
}

export function mapEscalationStatusToInstructorFollowUpStatus(
  status: string,
): InstructorFollowUpStatus | null {
  switch (status) {
    case "open":
      return "open";
    case "acknowledged":
      return "acknowledged";
    case "closed":
      return "resolved";
    default:
      return null;
  }
}
