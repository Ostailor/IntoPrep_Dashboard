"use client";

import {
  startTransition,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Family, Student } from "@/lib/domain";

interface AdminMessagingBulkPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  families: Family[];
  students: Student[];
  enrollments: Enrollment[];
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseCsvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === "\"") {
      if (inQuotes && source[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((value) => normalizeHeader(value));
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

export function AdminMessagingBulkPanel({
  viewerMode,
  cohorts,
  families,
  students,
  enrollments,
}: AdminMessagingBulkPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const visibleFamilies = useMemo(() => {
    const studentIds = enrollments
      .filter((enrollment) => enrollment.cohortId === cohortId && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    const cohortFamilyIds = new Set(
      students
        .filter((student) => studentIds.includes(student.id))
        .map((student) => student.familyId),
    );
    return families.filter((family) => cohortFamilyIds.has(family.id));
  }, [cohortId, enrollments, families, students]);
  const familyIdsByCohortId = useMemo(() => {
    const next = new Map<string, string[]>();

    cohorts.forEach((cohort) => {
      const studentIds = enrollments
        .filter((enrollment) => enrollment.cohortId === cohort.id && enrollment.status === "active")
        .map((enrollment) => enrollment.studentId);
      const cohortFamilyIds = new Set(
        students
          .filter((student) => studentIds.includes(student.id))
          .map((student) => student.familyId),
      );
      next.set(cohort.id, families.filter((family) => cohortFamilyIds.has(family.id)).map((family) => family.id));
    });

    return next;
  }, [cohorts, enrollments, families, students]);
  const familyById = useMemo(() => new Map(families.map((family) => [family.id, family])), [families]);

  const importCsvFile = async (file: File) => {
    try {
      const raw = await file.text();
      const rows = parseCsvRows(raw);

      if (rows.length === 0) {
        setError("The CSV did not contain any data rows.");
        setSuccess(null);
        return;
      }

      const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
      const cohortByName = new Map(
        cohorts.map((cohort) => [normalizeLookupValue(cohort.name), cohort]),
      );
      const requestedCohortId =
        rows[0]?.cohort_id ||
        cohortByName.get(normalizeLookupValue(rows[0]?.cohort_name))?.id ||
        cohortId;
      const nextCohortId = cohortById.has(requestedCohortId) ? requestedCohortId : cohortId;
      const allowedFamilyIds = new Set(familyIdsByCohortId.get(nextCohortId) ?? []);
      const selectedIds = new Set<string>();

      rows.forEach((row) => {
        const familyId = row.family_id;
        const familyName = normalizeLookupValue(row.family_name);
        const guardianEmail = normalizeLookupValue(
          row.guardian_email || row.family_email || row.email,
        );

        if (familyId && allowedFamilyIds.has(familyId)) {
          selectedIds.add(familyId);
          return;
        }

        for (const candidateId of allowedFamilyIds) {
          const family = familyById.get(candidateId);
          if (!family) {
            continue;
          }
          if (familyName && normalizeLookupValue(family.familyName) === familyName) {
            selectedIds.add(candidateId);
            break;
          }
          if (guardianEmail && normalizeLookupValue(family.email) === guardianEmail) {
            selectedIds.add(candidateId);
            break;
          }
        }
      });

      setCohortId(nextCohortId);
      setFamilyIds(Array.from(selectedIds));
      setSubject(rows[0]?.subject || rows[0]?.message_subject || "");
      setBody(rows[0]?.body || rows[0]?.message_body || rows[0]?.message || "");
      setError(null);
      setSuccess(
        `CSV loaded. ${selectedIds.size} family${selectedIds.size === 1 ? "" : "ies"} matched in the selected cohort.`,
      );
    } catch (csvError) {
      setError(csvError instanceof Error ? csvError.message : "CSV import failed.");
      setSuccess(null);
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    await importCsvFile(file);
    event.currentTarget.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await importCsvFile(file);
  };

  const handleSend = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/messaging/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cohortId,
            familyIds,
            subject,
            body,
          }),
        });
        const payload = (await response.json()) as { error?: string; sentCount?: number };
        if (!response.ok) {
          throw new Error(payload.error ?? "Bulk family message failed.");
        }
        setFamilyIds([]);
        setSubject("");
        setBody("");
        setSuccess(`Started ${payload.sentCount ?? 0} family threads.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Bulk family message failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Bulk messaging</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Family outreach by cohort
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Open new family threads for a cohort update without sending one-off messages manually.
      </p>
      {error ? (
        <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragActive(false);
        }}
        onDrop={handleDrop}
        className={clsx(
          "mt-5 rounded-[1.5rem] border border-dashed px-4 py-4 transition",
          isDragActive
            ? "border-[rgba(187,110,69,0.42)] bg-[rgba(187,110,69,0.08)]"
            : "border-[color:var(--line)] bg-stone-50/80",
        )}
      >
        <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Drag and drop a CSV to prefill this message
        </div>
        <div className="mt-2 text-sm text-[color:var(--muted)]">
          Supported columns: <code>cohort_id</code> or <code>cohort_name</code>, plus any of{" "}
          <code>family_id</code>, <code>family_name</code>, or <code>guardian_email</code>. The
          first row can also include <code>subject</code> and <code>body</code>.
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={readOnly}
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-semibold",
              readOnly
                ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                : "border-[rgba(23,56,75,0.14)] bg-white text-[color:var(--navy-strong)] hover:bg-stone-50",
            )}
          >
            Choose CSV
          </button>
          <div className="text-sm text-[color:var(--muted)]">
            The CSV only pre-fills the form. You can still edit everything before sending.
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileSelection}
        />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[0.75fr_1.25fr]">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Cohort
          </span>
          <span className="text-sm text-[color:var(--muted)]">
            Choose the cohort whose families should receive this update.
          </span>
          <select
            value={cohortId}
            onChange={(event) => {
              const nextCohortId = event.currentTarget.value;
              setCohortId(nextCohortId);
              setFamilyIds([]);
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Families
          </span>
          <span className="text-sm text-[color:var(--muted)]">
            Select one or more family records in the current cohort. Command-click or Ctrl-click
            to pick more than one.
          </span>
          <select
            multiple
            value={familyIds}
            onChange={(event) => {
              const nextFamilyIds = Array.from(event.currentTarget.selectedOptions).map(
                (option) => option.value,
              );
              setFamilyIds(nextFamilyIds);
            }}
            className="min-h-[148px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {visibleFamilies.map((family) => (
              <option key={family.id} value={family.id}>
                {family.familyName} · {family.guardianNames.join(" / ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Subject line
        </span>
        <span className="text-sm text-[color:var(--muted)]">
          This becomes the title of the new family thread.
        </span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.currentTarget.value)}
          className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="Example: Schedule update for Wednesday SAT cohort"
          disabled={readOnly}
        />
      </label>
      <label className="mt-3 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Message body
        </span>
        <span className="text-sm text-[color:var(--muted)]">
          Write the update families should read when the thread opens.
        </span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
          className="min-h-[136px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="Share the cohort update, what changed, and any action the family should take."
          disabled={readOnly}
        />
      </label>
      <button
        type="button"
        onClick={handleSend}
        disabled={pending || readOnly}
        className={clsx(
          "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
          pending || readOnly
            ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
            : "bg-[color:var(--navy-strong)] hover:opacity-90",
        )}
      >
        {pending ? "Starting..." : readOnly ? "Preview only" : "Start family threads"}
      </button>
    </section>
  );
}
