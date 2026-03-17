"use client";

import type { Family, MessageThread, Student } from "@/lib/domain";

interface TaFamilySupportPanelProps {
  families: Family[];
  students: Student[];
  threads: MessageThread[];
}

export function TaFamilySupportPanel({
  families,
  students,
  threads,
}: TaFamilySupportPanelProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {families.map((family) => {
        const familyStudents = students.filter((student) => student.familyId === family.id);
        const familyThreads = threads.filter((thread) => thread.familyId === family.id);

        return (
          <div
            key={family.id}
            className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]"
          >
            <div className="section-kicker">Assigned cohort family</div>
            <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
              {family.familyName} family
            </h3>
            <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
              <div>{family.guardianNames.join(" · ")}</div>
              <div>{family.email}</div>
              <div>{family.phone}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {familyStudents.map((student) => (
                <span
                  key={student.id}
                  className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                >
                  {student.firstName} {student.lastName}
                </span>
              ))}
              {familyThreads.length > 0 ? (
                <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                  {familyThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)} unread
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
