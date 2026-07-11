"use client";

import { useState } from "react";
import type { UserRole } from "@/lib/domain";
import type { StudentWorkbookExportScope } from "@/lib/student-workbook-export";

interface StudentWorkbookExportActionsProps {
  role: UserRole;
}

const ACTIONS: Array<{ scope: StudentWorkbookExportScope; label: string }> = [
  { scope: "students", label: "Download Student Information" },
  { scope: "scores", label: "Download Scores" },
  { scope: "all", label: "Download Everything" },
];

export function buildStudentWorkbookExportHref(
  scope: StudentWorkbookExportScope,
  targetDemo?: boolean,
) {
  const query = new URLSearchParams({ scope });
  if (typeof targetDemo === "boolean") query.set("targetDemo", String(targetDemo));
  return `/api/students/export?${query.toString()}`;
}

export function StudentWorkbookExportActions({ role }: StudentWorkbookExportActionsProps) {
  const engineer = role === "engineer";
  const [target, setTarget] = useState<"" | "demo" | "main">("");

  if (role !== "engineer" && role !== "admin" && role !== "staff") return null;

  const targetDemo = target === "" ? undefined : target === "demo";
  const enabled = !engineer || targetDemo !== undefined;

  return (
    <div className="flex flex-wrap items-end gap-2" aria-label="Student workbook downloads">
      {engineer ? (
        <label className="text-xs font-semibold text-[color:var(--navy-strong)]">
          Export data partition
          <select
            value={target}
            onChange={(event) => setTarget(event.currentTarget.value as "" | "demo" | "main")}
            className="mt-1 block rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Choose Demo or Main</option>
            <option value="demo">Demo</option>
            <option value="main">Main</option>
          </select>
        </label>
      ) : null}
      {ACTIONS.map((action) => enabled ? (
        <a
          key={action.scope}
          href={buildStudentWorkbookExportHref(action.scope, engineer ? targetDemo : undefined)}
          className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--navy-strong)] hover:bg-stone-50"
        >
          {action.label}
        </a>
      ) : (
        <span
          key={action.scope}
          aria-disabled="true"
          className="cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400"
        >
          {action.label}
        </span>
      ))}
    </div>
  );
}
