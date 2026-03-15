"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { AccountStatus, Cohort, UserRole } from "@/lib/domain";
import {
  canManageCohortAssignments,
  canDeleteRole,
  canSendPasswordResetForRole,
  canSuspendRole,
  getManageableRoleOptions,
  getProvisionableRoleOptions,
} from "@/lib/permissions";
import type { LiveSettingsUserRow } from "@/lib/live-portal";

interface RoleManagementPanelProps {
  viewerId: string;
  viewerRole: UserRole;
  users: LiveSettingsUserRow[] | null;
  cohorts: Pick<Cohort, "id" | "name">[];
}

const roleLabels: Record<UserRole, string> = {
  engineer: "Engineer",
  admin: "Admin",
  staff: "Staff",
  ta: "TA",
  instructor: "Instructor",
};

function getDefaultProvisionRole(
  roles: UserRole[],
): UserRole {
  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes("staff")) {
    return "staff";
  }

  return roles[0] ?? "instructor";
}

export function RoleManagementPanel({
  viewerId,
  viewerRole,
  users,
  cohorts,
}: RoleManagementPanelProps) {
  const router = useRouter();
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string[]>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const provisionableRoles = useMemo(
    () => getProvisionableRoleOptions(viewerRole),
    [viewerRole],
  );
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    title: "",
    role: getDefaultProvisionRole(provisionableRoles),
    password: "",
  });

  useEffect(() => {
    setDraftRoles(
      Object.fromEntries((users ?? []).map((user) => [user.id, user.role])) as Record<string, UserRole>,
    );
    setDraftAssignments(
      Object.fromEntries(
        (users ?? []).map((user) => [user.id, user.assignedCohortIds]),
      ) as Record<string, string[]>,
    );
  }, [users]);

  useEffect(() => {
    setCreateForm((current) => ({
      ...current,
      role: provisionableRoles.includes(current.role)
        ? current.role
        : getDefaultProvisionRole(provisionableRoles),
    }));
  }, [provisionableRoles]);

  const sortedUsers = useMemo(
    () => [...(users ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [users],
  );
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const cohortNameById = useMemo(
    () => new Map(sortedCohorts.map((cohort) => [cohort.id, cohort.name])),
    [sortedCohorts],
  );

  const handleCreate = () => {
    if (
      createForm.fullName.trim().length === 0 ||
      createForm.email.trim().length === 0 ||
      createForm.title.trim().length === 0 ||
      createForm.password.trim().length === 0
    ) {
      setError("Name, email, title, role, and default password are required.");
      setSuccess(null);
      return;
    }

    setPendingKey("create");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: createForm.fullName.trim(),
            email: createForm.email.trim(),
            title: createForm.title.trim(),
            role: createForm.role,
            password: createForm.password,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Account creation failed.");
        }

        setSuccess(
          `${createForm.email.trim().toLowerCase()} was provisioned as ${roleLabels[createForm.role]} with password change required on first sign-in.`,
        );
        setCreateForm({
          fullName: "",
          email: "",
          title: "",
          role: getDefaultProvisionRole(provisionableRoles),
          password: "",
        });
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Account creation failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleSave = (user: LiveSettingsUserRow) => {
    const nextRole = draftRoles[user.id] ?? user.role;

    if (nextRole === user.role) {
      return;
    }

    setPendingKey(`role:${user.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            role: nextRole,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Role update failed.");
        }

        setSuccess(`${user.name} is now ${roleLabels[nextRole]}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Role update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleStatusChange = (user: LiveSettingsUserRow, nextStatus: AccountStatus) => {
    const verb = nextStatus === "suspended" ? "suspend" : "reactivate";

    if (
      !window.confirm(
        `${verb[0]?.toUpperCase()}${verb.slice(1)} ${user.name}'s account? ${
          nextStatus === "suspended"
            ? "Portal access will be blocked until the account is re-enabled."
            : "Portal access will be restored immediately."
        }`,
      )
    ) {
      return;
    }

    setPendingKey(`status:${user.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            status: nextStatus,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Account status update failed.");
        }

        setSuccess(
          nextStatus === "suspended"
            ? `${user.name}'s account is now suspended.`
            : `${user.name}'s account is active again.`,
        );
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Account status update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handlePasswordReset = (user: LiveSettingsUserRow) => {
    if (
      !window.confirm(
        `Send a password reset email to ${user.email ?? user.name}? This will also require a password change before the next portal session.`,
      )
    ) {
      return;
    }

    setPendingKey(`reset:${user.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Password reset email failed.");
        }

        setSuccess(`Password reset email sent to ${user.email ?? user.name}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Password reset email failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleDelete = (user: LiveSettingsUserRow) => {
    if (
      !window.confirm(
        `Delete ${user.name}'s account permanently? This removes login access and deletes the account record.`,
      )
    ) {
      return;
    }

    setPendingKey(`delete:${user.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Account deletion failed.");
        }

        setSuccess(`${user.name}'s account was removed.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Account deletion failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleAssignmentSave = (user: LiveSettingsUserRow) => {
    const nextAssignments = draftAssignments[user.id] ?? [];

    setPendingKey(`assignments:${user.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/users/assignments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            cohortIds: nextAssignments,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Assignment update failed.");
        }

        setSuccess(`${user.name}'s cohort assignments were updated.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Assignment update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">User governance</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Role management
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Engineers provision admin access and can suspend or delete admin accounts. Admins can
        provision, suspend, reset, and delete staff, TA, and instructor accounts. Self-signup is
        disabled.
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

      {sortedUsers.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
          Role editing is only available when live Supabase users are present.
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
              Provision new account
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              Email is the login username. Set a default password here, then hand it to the user
              for first sign-in.
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Full name
                </span>
                <input
                  value={createForm.fullName}
                  onChange={(event) => {
                    const fullName = event.currentTarget.value;
                    setCreateForm((current) => ({ ...current, fullName }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                  placeholder="Jordan Ellis"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Email / username
                </span>
                <input
                  value={createForm.email}
                  onChange={(event) => {
                    const email = event.currentTarget.value;
                    setCreateForm((current) => ({ ...current, email }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                  placeholder="admin2@intoprep.dev"
                  type="email"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Title
                </span>
                <input
                  value={createForm.title}
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    setCreateForm((current) => ({ ...current, title }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                  placeholder="Operations Director"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Role
                </span>
                <select
                  value={createForm.role}
                  onChange={(event) => {
                    const role = event.currentTarget.value as UserRole;
                    setCreateForm((current) => ({
                      ...current,
                      role,
                    }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                >
                  {provisionableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Default password
              </span>
              <input
                value={createForm.password}
                onChange={(event) => {
                  const password = event.currentTarget.value;
                  setCreateForm((current) => ({ ...current, password }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                placeholder="IntoPrepTemp2026!"
                type="text"
              />
            </label>
            <button
              type="button"
              onClick={handleCreate}
              disabled={pendingKey === "create"}
              className={clsx(
                "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "create"
                  ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pendingKey === "create" ? "Creating..." : "Create account"}
            </button>
          </div>

          {sortedUsers.map((user) => {
            const editableRoles = getManageableRoleOptions(viewerRole, user.role);
            const canEdit = user.id !== viewerId && editableRoles.length > 0;
            const canSuspend = user.id !== viewerId && canSuspendRole(viewerRole, user.role);
            const canSendReset =
              user.id !== viewerId && canSendPasswordResetForRole(viewerRole, user.role);
            const canDelete = user.id !== viewerId && canDeleteRole(viewerRole, user.role);
            const canEditAssignments =
              user.id !== viewerId && canManageCohortAssignments(viewerRole, user.role);
            const draftRole = draftRoles[user.id] ?? user.role;
            const assignmentDraft = draftAssignments[user.id] ?? user.assignedCohortIds;
            const assignmentsChanged =
              assignmentDraft.length !== user.assignedCohortIds.length ||
              assignmentDraft.some((cohortId) => !user.assignedCohortIds.includes(cohortId));
            const isPending =
              pendingKey === `role:${user.id}` ||
              pendingKey === `delete:${user.id}` ||
              pendingKey === `status:${user.id}` ||
              pendingKey === `reset:${user.id}` ||
              pendingKey === `assignments:${user.id}`;

            return (
              <div
                key={user.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                        {user.name}
                      </div>
                      {user.id === viewerId ? (
                        <span className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                          You
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {user.title}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {user.email ?? "No profile email synced yet."}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={clsx(
                          "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
                          user.accountStatus === "active"
                            ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                            : "border border-amber-200 bg-amber-100 text-amber-700",
                        )}
                      >
                        {user.accountStatus}
                      </span>
                      {user.mustChangePassword ? (
                        <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                          Password reset required
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {user.assignedCohortIds.length} cohort
                        {user.assignedCohortIds.length === 1 ? "" : "s"}
                      </span>
                      {user.templateRole ? (
                        <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                          Template {roleLabels[user.templateRole]}
                        </span>
                      ) : null}
                    </div>
                    {user.assignedCohortIds.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {user.assignedCohortIds.map((cohortId) => (
                          <span
                            key={cohortId}
                            className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                          >
                            {cohortNameById.get(cohortId) ?? cohortId}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 lg:min-w-[260px]">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Role
                    </label>
                    {canEdit ? (
                      <>
                        <select
                          value={draftRole}
                          onChange={(event) => {
                            const nextRole = event.currentTarget.value as UserRole;
                            setDraftRoles((current) => ({
                              ...current,
                              [user.id]: nextRole,
                            }));
                          }}
                          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none focus:border-[rgba(187,110,69,0.34)]"
                          disabled={isPending}
                        >
                          {editableRoles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSave(user)}
                          disabled={isPending || draftRole === user.role}
                          className={clsx(
                            "rounded-full px-4 py-2 text-sm font-semibold text-white",
                            isPending || draftRole === user.role
                              ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                              : "bg-[color:var(--navy-strong)] hover:opacity-90",
                          )}
                        >
                          {isPending ? "Saving..." : "Save role"}
                        </button>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                        {user.id === viewerId
                          ? "You cannot change your own role."
                          : "Engineer approval required for this role."}
                      </div>
                    )}
                    {canSendReset ? (
                      <button
                        type="button"
                        onClick={() => handlePasswordReset(user)}
                        disabled={isPending}
                        className={clsx(
                          "rounded-full border px-4 py-2 text-sm font-semibold",
                          isPending
                            ? "cursor-wait border-[rgba(23,56,75,0.2)] bg-[rgba(23,56,75,0.08)] text-[color:var(--muted)]"
                            : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)] hover:bg-[rgba(23,56,75,0.12)]",
                        )}
                      >
                        {pendingKey === `reset:${user.id}` ? "Sending..." : "Send reset email"}
                      </button>
                    ) : null}
                    {canSuspend ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(
                            user,
                            user.accountStatus === "active" ? "suspended" : "active",
                          )
                        }
                        disabled={isPending}
                        className={clsx(
                          "rounded-full border px-4 py-2 text-sm font-semibold",
                          isPending
                            ? "cursor-wait border-amber-200 bg-amber-100 text-amber-700"
                            : "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200",
                        )}
                      >
                        {pendingKey === `status:${user.id}`
                          ? "Saving..."
                          : user.accountStatus === "active"
                            ? "Suspend account"
                            : "Re-enable account"}
                      </button>
                    ) : (
                      <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {user.id === viewerId
                          ? "Self-suspend disabled"
                          : user.role === "admin"
                            ? "Only engineer can suspend admin accounts"
                            : user.role === "engineer"
                              ? "Engineer accounts require engineer review"
                              : "Suspend not allowed"}
                      </div>
                    )}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        disabled={isPending}
                        className={clsx(
                          "rounded-full border px-4 py-2 text-sm font-semibold",
                          isPending
                            ? "cursor-wait border-rose-200 bg-rose-100 text-rose-700"
                            : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200",
                        )}
                      >
                        {pendingKey === `delete:${user.id}` ? "Removing..." : "Delete permanently"}
                      </button>
                    ) : (
                      <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {user.id === viewerId
                          ? "Self-delete disabled"
                          : user.role === "admin"
                            ? "Only engineer can delete admin accounts"
                            : user.role === "engineer"
                              ? "Engineer accounts require engineer review"
                              : "Delete not allowed"}
                      </div>
                    )}
                  </div>
                </div>

                {canEditAssignments ? (
                  <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Cohort assignments
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {sortedCohorts.map((cohort) => {
                        const checked = assignmentDraft.includes(cohort.id);
                        return (
                          <label
                            key={`${user.id}:${cohort.id}`}
                            className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                          >
                            <input
                              checked={checked}
                              className="h-4 w-4"
                              disabled={isPending}
                              onChange={(event) => {
                                const nextChecked = event.currentTarget.checked;
                                const nextAssignments = nextChecked
                                  ? [...(draftAssignments[user.id] ?? user.assignedCohortIds), cohort.id]
                                  : (draftAssignments[user.id] ?? user.assignedCohortIds).filter(
                                      (cohortId) => cohortId !== cohort.id,
                                    );
                                setDraftAssignments((current) => ({
                                  ...current,
                                  [user.id]: nextAssignments,
                                }));
                              }}
                              type="checkbox"
                            />
                            <span>{cohort.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAssignmentSave(user)}
                      disabled={isPending || !assignmentsChanged}
                      className={clsx(
                        "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
                        isPending || !assignmentsChanged
                          ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                          : "bg-[color:var(--navy-strong)] hover:opacity-90",
                      )}
                    >
                      {pendingKey === `assignments:${user.id}`
                        ? "Saving..."
                        : "Save assignments"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
