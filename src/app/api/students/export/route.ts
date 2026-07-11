import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canRunStudentImports } from "@/lib/permissions";
import {
  exportStudentWorkbook,
  StudentWorkbookExportPermissionError,
  type StudentWorkbookExportScope,
} from "@/lib/student-workbook-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();
  if (
    !viewer ||
    viewer.mode !== "live" ||
    viewer.accountStatus === "suspended" ||
    viewer.mustChangePassword === true ||
    !canRunStudentImports(viewer.user.role)
  ) {
    return NextResponse.json({ error: "You cannot export students." }, { status: 403 });
  }

  try {
    const query = parseExportQuery(new URL(request.url).searchParams);
    const { bytes, filename } = await exportStudentWorkbook({
      viewer: viewer.user,
      scope: query.scope,
      requestedTarget: query.requestedTarget,
    });

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof StudentWorkbookExportPermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof StudentWorkbookExportQueryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Student export failed." }, { status: 500 });
  }
}

class StudentWorkbookExportQueryError extends Error {}

function parseExportQuery(searchParams: URLSearchParams): {
  scope: StudentWorkbookExportScope;
  requestedTarget: boolean | undefined;
} {
  if ([...searchParams.keys()].some((key) => key !== "scope" && key !== "targetDemo")) {
    throw new StudentWorkbookExportQueryError("Student export query is invalid.");
  }
  const scopes = searchParams.getAll("scope");
  const targets = searchParams.getAll("targetDemo");
  if (scopes.length !== 1 || targets.length > 1) {
    throw new StudentWorkbookExportQueryError("Student export query is invalid.");
  }
  const scope = scopes[0];
  if (scope !== "students" && scope !== "scores" && scope !== "all") {
    throw new StudentWorkbookExportQueryError("Student export scope is invalid.");
  }
  if (targets.length === 0) {
    return { scope, requestedTarget: undefined };
  }
  if (targets[0] === "true") return { scope, requestedTarget: true };
  if (targets[0] === "false") return { scope, requestedTarget: false };
  throw new StudentWorkbookExportQueryError("Student export target is invalid.");
}
