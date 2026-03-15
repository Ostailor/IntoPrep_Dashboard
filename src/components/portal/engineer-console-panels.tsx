"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { PortalSection } from "@/lib/domain";
import type {
  BillingSyncSource,
  EngineerSupportNote,
  IntakeSyncSource,
  MaintenanceBanner,
  SyncJob,
  UserRole,
} from "@/lib/domain";
import type {
  LiveEngineerConsoleBundle,
  LiveSettingsUserRow,
} from "@/lib/live-portal";

interface EngineerConsolePanelsProps {
  section: Extract<PortalSection, "dashboard" | "integrations" | "settings">;
  engineerConsole: LiveEngineerConsoleBundle;
  syncJobs: SyncJob[];
  intakeSyncSource: IntakeSyncSource | null;
  billingSyncSource: BillingSyncSource | null;
  users: LiveSettingsUserRow[] | null;
}

type FeedbackState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

type IncidentDrafts = Record<
  string,
  {
    ownerId: string;
    handoffNotes: string;
    mutedUntil: string;
  }
>;

type IntegrationDrafts = Record<
  string,
  {
    controlState: "active" | "paused" | "maintenance";
    ownerId: string;
    handoffNotes: string;
  }
>;

type FeatureDrafts = Record<
  string,
  {
    description: string;
    enabledRoles: UserRole[];
  }
>;

const roleLabels: Record<UserRole, string> = {
  engineer: "Engineer",
  admin: "Admin",
  staff: "Staff",
  ta: "TA",
  instructor: "Instructor",
};

const statusTone = {
  healthy: "border-emerald-200 bg-emerald-100 text-emerald-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  error: "border-rose-200 bg-rose-100 text-rose-800",
} as const;

const bannerTone = {
  info: "border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  error: "border-rose-200 bg-rose-100 text-rose-800",
} as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - localOffsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  return value.trim().length > 0 ? new Date(value).toISOString() : null;
}

function formatTimeRemaining(value: string) {
  const deltaMs = new Date(value).getTime() - Date.now();

  if (deltaMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.round(deltaMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${minutes}m left`;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[color:var(--line)] bg-white/75 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
        Engineer tools
      </div>
      <h4 className="mt-2 text-xl font-semibold text-[color:var(--navy-strong)]">{title}</h4>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function EngineerConsolePanels({
  section,
  engineerConsole,
  syncJobs,
  intakeSyncSource,
  billingSyncSource,
  users,
}: EngineerConsolePanelsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const activeUsers = useMemo(
    () => [...(users ?? [])].filter((user) => user.accountStatus === "active"),
    [users],
  );
  const ownerOptions = useMemo(
    () => activeUsers.map((user) => ({ id: user.id, label: `${user.name} · ${roleLabels[user.role]}` })),
    [activeUsers],
  );
  const [incidentDrafts, setIncidentDrafts] = useState<IncidentDrafts>({});
  const [integrationDrafts, setIntegrationDrafts] = useState<IntegrationDrafts>({});
  const [featureDrafts, setFeatureDrafts] = useState<FeatureDrafts>({});
  const [newFeatureKey, setNewFeatureKey] = useState("");
  const [newFeatureDescription, setNewFeatureDescription] = useState("");
  const [newFeatureRoles, setNewFeatureRoles] = useState<UserRole[]>(["staff"]);
  const [changeFreezeDraft, setChangeFreezeDraft] = useState({
    enabled: engineerConsole.changeFreeze?.enabled ?? false,
    scope: engineerConsole.changeFreeze?.scope ?? "operational_writes",
    reason: engineerConsole.changeFreeze?.reason ?? "",
    issueReference: engineerConsole.changeFreeze?.issueReference ?? "",
    expiresAt: toDateTimeLocalValue(engineerConsole.changeFreeze?.expiresAt),
  });
  const [bannerDraft, setBannerDraft] = useState({
    message: engineerConsole.maintenanceBanner?.message ?? "",
    tone: engineerConsole.maintenanceBanner?.tone ?? ("info" as MaintenanceBanner["tone"]),
    issueReference: engineerConsole.maintenanceBanner?.issueReference ?? "",
    ownerId: engineerConsole.maintenanceBanner?.ownerId ?? "",
    expiresAt: toDateTimeLocalValue(engineerConsole.maintenanceBanner?.expiresAt),
  });
  const [supportNoteDraft, setSupportNoteDraft] = useState({
    targetType: "sync_job" as EngineerSupportNote["targetType"],
    targetId: syncJobs[0]?.id ?? "",
    issueReference: "",
    body: "",
  });

  useEffect(() => {
    setIncidentDrafts(
      Object.fromEntries(
        syncJobs.map((job) => [
          job.id,
          {
            ownerId: job.ownerId ?? "",
            handoffNotes: job.handoffNotes ?? "",
            mutedUntil: toDateTimeLocalValue(job.mutedUntil),
          },
        ]),
      ),
    );
  }, [syncJobs]);

  useEffect(() => {
    setIntegrationDrafts(
      Object.fromEntries(
        [intakeSyncSource, billingSyncSource]
          .filter((source): source is IntakeSyncSource | BillingSyncSource => Boolean(source))
          .map((source) => [
            source.id,
            {
              controlState: source.controlState ?? "active",
              ownerId: source.ownerId ?? "",
              handoffNotes: source.handoffNotes ?? "",
            },
          ]),
      ),
    );
  }, [billingSyncSource, intakeSyncSource]);

  useEffect(() => {
    setFeatureDrafts(
      Object.fromEntries(
        engineerConsole.featureFlags.map((flag) => [
          flag.key,
          {
            description: flag.description,
            enabledRoles: flag.enabledRoles,
          },
        ]),
      ),
    );
  }, [engineerConsole.featureFlags]);

  useEffect(() => {
    setChangeFreezeDraft({
      enabled: engineerConsole.changeFreeze?.enabled ?? false,
      scope: engineerConsole.changeFreeze?.scope ?? "operational_writes",
      reason: engineerConsole.changeFreeze?.reason ?? "",
      issueReference: engineerConsole.changeFreeze?.issueReference ?? "",
      expiresAt: toDateTimeLocalValue(engineerConsole.changeFreeze?.expiresAt),
    });
  }, [engineerConsole.changeFreeze]);

  useEffect(() => {
    setBannerDraft({
      message: engineerConsole.maintenanceBanner?.message ?? "",
      tone: engineerConsole.maintenanceBanner?.tone ?? "info",
      issueReference: engineerConsole.maintenanceBanner?.issueReference ?? "",
      ownerId: engineerConsole.maintenanceBanner?.ownerId ?? "",
      expiresAt: toDateTimeLocalValue(engineerConsole.maintenanceBanner?.expiresAt),
    });
  }, [engineerConsole.maintenanceBanner]);

  const handleRequest = (
    key: string,
    runner: () => Promise<void>,
  ) => {
    setPendingKey(key);
    setFeedback(null);

    startTransition(async () => {
      try {
        await runner();
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: normalizeErrorMessage(error, "Engineer action failed."),
        });
      } finally {
        setPendingKey(null);
      }
    });
  };

  const requireTypedConfirmation = (message: string, expected: string) => {
    const typed = window.prompt(`${message}\n\nType ${expected} to continue.`);
    return typed === expected;
  };

  const handleRevokeGrant = (grantId: string) => {
    handleRequest(`grant:${grantId}`, async () => {
      const response = await fetch("/api/engineer/break-glass", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grantId }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Grant revoke failed.");
      }

      setFeedback({
        tone: "success",
        message: "Break-glass access revoked.",
      });
    });
  };

  const handleIncidentSave = (jobId: string, acknowledge: boolean) => {
    const draft = incidentDrafts[jobId] ?? {
      ownerId: "",
      handoffNotes: "",
      mutedUntil: "",
    };
    const issueReference =
      window.prompt(`Issue or incident reference for ${acknowledge ? "acknowledging" : "saving"} ${jobId}:`)?.trim() ??
      "";

    if (issueReference.length === 0) {
      return;
    }

    handleRequest(`incident:${jobId}:${acknowledge ? "ack" : "save"}`, async () => {
      const response = await fetch("/api/engineer/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          ownerId: draft.ownerId || null,
          handoffNotes: draft.handoffNotes,
          mutedUntil: fromDateTimeLocalValue(draft.mutedUntil),
          acknowledge,
          issueReference,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Incident update failed.");
      }

      setFeedback({
        tone: "success",
        message: acknowledge ? "Incident acknowledged." : "Incident details updated.",
      });
    });
  };

  const handleRepair = (
    action: "retry_sync" | "replay_sync" | "rerun_import" | "rebuild_cohort" | "rebuild_family",
    targetId: string,
  ) => {
    if (!requireTypedConfirmation("This repair action will mutate system state.", action.toUpperCase())) {
      return;
    }

    const issueReference = window.prompt(`Issue reference for ${action.replaceAll("_", " ")}:`)?.trim() ?? "";
    if (issueReference.length === 0) {
      return;
    }

    handleRequest(`repair:${action}:${targetId}`, async () => {
      const response = await fetch("/api/engineer/repair", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          targetId,
          issueReference,
        }),
      });
      const payload = (await response.json()) as { error?: string; summary?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Repair action failed.");
      }

      setFeedback({
        tone: "success",
        message: payload.summary ?? "Repair action completed.",
      });
    });
  };

  const handleIntegrationSave = (
    sourceType: "intake" | "billing",
    sourceId: string,
  ) => {
    const draft = integrationDrafts[sourceId];
    if (!draft) {
      return;
    }

    if (
      draft.controlState !== "active" &&
      !requireTypedConfirmation(
        `This will place ${sourceType === "intake" ? "Google Forms intake" : "QuickBooks billing"} into ${draft.controlState} mode.`,
        draft.controlState.toUpperCase(),
      )
    ) {
      return;
    }

    const issueReference = window.prompt("Issue or handoff reference for this integration state change:")?.trim() ?? "";
    if (issueReference.length === 0) {
      return;
    }

    handleRequest(`integration:${sourceId}`, async () => {
      const response = await fetch("/api/engineer/integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceType,
          sourceId,
          controlState: draft.controlState,
          ownerId: draft.ownerId || null,
          handoffNotes: draft.handoffNotes,
          issueReference,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Integration state update failed.");
      }

      setFeedback({
        tone: "success",
        message: "Integration state updated.",
      });
    });
  };

  const handleChangeFreezeSave = () => {
    if (
      !requireTypedConfirmation(
        changeFreezeDraft.enabled
          ? "This will block risky writes across the portal."
          : "This will remove the current write freeze.",
        changeFreezeDraft.enabled ? "FREEZE" : "UNFREEZE",
      )
    ) {
      return;
    }

    handleRequest("change-freeze", async () => {
      const response = await fetch("/api/engineer/change-freeze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: changeFreezeDraft.enabled,
          scope: changeFreezeDraft.scope,
          reason: changeFreezeDraft.reason,
          issueReference: changeFreezeDraft.issueReference,
          expiresAt: fromDateTimeLocalValue(changeFreezeDraft.expiresAt),
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Change freeze update failed.");
      }

      setFeedback({
        tone: "success",
        message: changeFreezeDraft.enabled
          ? "Change freeze enabled."
          : "Change freeze lifted.",
      });
    });
  };

  const handleBannerSave = () => {
    handleRequest("maintenance-banner", async () => {
      const response = await fetch("/api/engineer/maintenance-banner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: engineerConsole.maintenanceBanner?.id,
          message: bannerDraft.message,
          tone: bannerDraft.tone,
          issueReference: bannerDraft.issueReference,
          ownerId: bannerDraft.ownerId || null,
          expiresAt: fromDateTimeLocalValue(bannerDraft.expiresAt),
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Maintenance banner update failed.");
      }

      setFeedback({
        tone: "success",
        message: "Maintenance banner updated.",
      });
    });
  };

  const handleSupportNoteSave = () => {
    handleRequest("support-note", async () => {
      const response = await fetch("/api/engineer/support-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(supportNoteDraft),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Support note save failed.");
      }

      setSupportNoteDraft((current) => ({
        ...current,
        body: "",
      }));
      setFeedback({
        tone: "success",
        message: "Engineer support note added.",
      });
    });
  };

  const saveFeatureFlag = (key: string, description: string, enabledRoles: UserRole[]) => {
    handleRequest(`feature-flag:${key}`, async () => {
      const response = await fetch("/api/engineer/feature-flags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          description,
          enabledRoles,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Feature flag update failed.");
      }

      setFeedback({
        tone: "success",
        message: `Feature flag ${key} updated.`,
      });
      setNewFeatureKey("");
      setNewFeatureDescription("");
      setNewFeatureRoles(["staff"]);
    });
  };

  const renderFeedback = feedback ? (
    <div
      className={clsx(
        "rounded-[1.5rem] border px-4 py-3 text-sm",
        feedback.tone === "success"
          ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
          : "border-rose-200 bg-rose-100/90 text-rose-800",
      )}
    >
      {feedback.message}
    </div>
  ) : null;

  const renderBreakGlassMonitor = (
    <SectionCard
      title="Active break-glass monitor"
      description="Active sensitive-access grants auto-expire after 30 minutes and can be revoked immediately."
    >
      {engineerConsole.activeSensitiveAccessGrants.length === 0 ? (
        <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50/90 p-4 text-sm text-[color:var(--muted)]">
          No active sensitive-data grants right now.
        </div>
      ) : (
        <div className="space-y-3">
          {engineerConsole.activeSensitiveAccessGrants.map((grant) => (
            <div
              key={grant.id}
              className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                    {grant.scopeType.replaceAll("_", " ")} · {grant.scopeId}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">{grant.reason}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    <span>{grant.issueReference}</span>
                    <span>{formatDateTime(grant.createdAt)}</span>
                    <span>{formatTimeRemaining(grant.expiresAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeGrant(grant.id)}
                  disabled={pendingKey === `grant:${grant.id}`}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-sm font-semibold",
                    pendingKey === `grant:${grant.id}`
                      ? "cursor-wait border-rose-200 bg-rose-100 text-rose-700"
                      : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200",
                  )}
                >
                  {pendingKey === `grant:${grant.id}` ? "Revoking..." : "Revoke access"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );

  const renderDashboardPanels = (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <SectionCard
          title="System status"
          description="Release state, migration state, credential health, and drift checks in one place."
        >
          {engineerConsole.systemStatus ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    App version
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                    {engineerConsole.systemStatus.appVersion}
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Git commit
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                    {engineerConsole.systemStatus.buildCommit ?? "Unavailable"}
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Schema version
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                    {engineerConsole.systemStatus.schemaVersion ?? "Unavailable"}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {engineerConsole.systemStatus.configDrift.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                        {item.label}
                      </div>
                      <span
                        className={clsx(
                          "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          statusTone[item.tone],
                        )}
                      >
                        {item.tone}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">{item.detail}</div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {engineerConsole.systemStatus.credentialHealth.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                        {item.label}
                      </div>
                      <span
                        className={clsx(
                          "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          statusTone[item.tone],
                        )}
                      >
                        {item.tone}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </SectionCard>
        {renderBreakGlassMonitor}
      </div>
      <SectionCard
        title="Change log"
        description="Recent feature flags, maintenance banners, and integration-control changes."
      >
        {engineerConsole.changeLogEntries.length === 0 ? (
          <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50/90 p-4 text-sm text-[color:var(--muted)]">
            No recent engineer configuration changes have been recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {engineerConsole.changeLogEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
              >
                <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  {entry.summary}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  <span>{entry.actorName}</span>
                  <span>{entry.action.replaceAll("_", " ")}</span>
                  {entry.issueReference ? <span>{entry.issueReference}</span> : null}
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderIntegrationsPanels = (
    <div className="space-y-5">
      {renderFeedback}
      <SectionCard
        title="Incident controls"
        description="Acknowledge, assign, mute, and repair failing sync watches with clear ownership and runbook links."
      >
        <div className="space-y-4">
          {syncJobs.map((job) => {
            const draft = incidentDrafts[job.id] ?? {
              ownerId: "",
              handoffNotes: "",
              mutedUntil: "",
            };

            return (
              <div
                key={job.id}
                className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                        {job.label}
                      </div>
                      <span
                        className={clsx(
                          "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          statusTone[job.status],
                        )}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">{job.summary}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      <span>{job.cadence}</span>
                      {job.ownerName ? <span>Owner {job.ownerName}</span> : null}
                      {job.acknowledgedAt ? <span>Acknowledged {formatDateTime(job.acknowledgedAt)}</span> : null}
                      {job.mutedUntil ? <span>Muted until {formatDateTime(job.mutedUntil)}</span> : null}
                    </div>
                    {job.runbookUrl ? (
                      <a
                        href={job.runbookUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-sm font-semibold text-[color:var(--copper)]"
                      >
                        Open runbook
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <select
                    value={draft.ownerId}
                    onChange={(event) =>
                      setIncidentDrafts((current) => ({
                        ...current,
                        [job.id]: {
                          ...draft,
                          ownerId: event.currentTarget.value,
                        },
                      }))
                    }
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  >
                    <option value="">No owner</option>
                    {ownerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={draft.mutedUntil}
                    onChange={(event) =>
                      setIncidentDrafts((current) => ({
                        ...current,
                        [job.id]: {
                          ...draft,
                          mutedUntil: event.currentTarget.value,
                        },
                      }))
                    }
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  />
                  <textarea
                    value={draft.handoffNotes}
                    onChange={(event) =>
                      setIncidentDrafts((current) => ({
                        ...current,
                        [job.id]: {
                          ...draft,
                          handoffNotes: event.currentTarget.value,
                        },
                      }))
                    }
                    className="min-h-[88px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)] md:col-span-3"
                    placeholder="Handoff notes for the next engineer or operator."
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleIncidentSave(job.id, false)}
                    disabled={pendingKey === `incident:${job.id}:save`}
                    className={clsx(
                      "rounded-full px-4 py-2 text-sm font-semibold text-white",
                      pendingKey === `incident:${job.id}:save`
                        ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                        : "bg-[color:var(--navy-strong)] hover:opacity-90",
                    )}
                  >
                    {pendingKey === `incident:${job.id}:save` ? "Saving..." : "Save incident details"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIncidentSave(job.id, true)}
                    disabled={pendingKey === `incident:${job.id}:ack`}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-sm font-semibold",
                      pendingKey === `incident:${job.id}:ack`
                        ? "cursor-wait border-emerald-200 bg-emerald-100 text-emerald-700"
                        : "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                    )}
                  >
                    {pendingKey === `incident:${job.id}:ack` ? "Saving..." : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepair("retry_sync", job.id)}
                    disabled={pendingKey === `repair:retry_sync:${job.id}`}
                    className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)] hover:bg-[rgba(23,56,75,0.12)]"
                  >
                    Retry sync
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepair("replay_sync", job.id)}
                    disabled={pendingKey === `repair:replay_sync:${job.id}`}
                    className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-4 py-2 text-sm font-semibold text-[color:var(--copper)] hover:opacity-90"
                  >
                    Replay failed step
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Integration state"
        description="Pause or place a linked source into maintenance mode with clear ownership and handoff notes."
      >
        <div className="space-y-4">
          {[
            ["intake", intakeSyncSource] as const,
            ["billing", billingSyncSource] as const,
          ]
            .filter((entry): entry is ["intake" | "billing", IntakeSyncSource | BillingSyncSource] => Boolean(entry[1]))
            .map(([sourceType, source]) => {
              const draft = integrationDrafts[source.id] ?? {
                controlState: source.controlState ?? "active",
                ownerId: source.ownerId ?? "",
                handoffNotes: source.handoffNotes ?? "",
              };

              return (
                <div
                  key={source.id}
                  className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                        {source.label}
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--muted)]">{source.cadence}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        <span>State {draft.controlState}</span>
                        {source.ownerName ? <span>Owner {source.ownerName}</span> : null}
                        {source.changedAt ? <span>Updated {formatDateTime(source.changedAt)}</span> : null}
                      </div>
                      {source.runbookUrl ? (
                        <a
                          href={source.runbookUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-sm font-semibold text-[color:var(--copper)]"
                        >
                          Open runbook
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <select
                      value={draft.controlState}
                      onChange={(event) =>
                        setIntegrationDrafts((current) => ({
                          ...current,
                          [source.id]: {
                            ...draft,
                            controlState: event.currentTarget.value as "active" | "paused" | "maintenance",
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    <select
                      value={draft.ownerId}
                      onChange={(event) =>
                        setIntegrationDrafts((current) => ({
                          ...current,
                          [source.id]: {
                            ...draft,
                            ownerId: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    >
                      <option value="">No owner</option>
                      {ownerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={draft.handoffNotes}
                      onChange={(event) =>
                        setIntegrationDrafts((current) => ({
                          ...current,
                          [source.id]: {
                            ...draft,
                            handoffNotes: event.currentTarget.value,
                          },
                        }))
                      }
                      className="min-h-[88px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)] md:col-span-3"
                      placeholder="Handoff notes for this source."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleIntegrationSave(sourceType, source.id)}
                    disabled={pendingKey === `integration:${source.id}`}
                    className={clsx(
                      "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
                      pendingKey === `integration:${source.id}`
                        ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                        : "bg-[color:var(--navy-strong)] hover:opacity-90",
                    )}
                  >
                    {pendingKey === `integration:${source.id}` ? "Saving..." : "Save source state"}
                  </button>
                </div>
              );
            })}
        </div>
      </SectionCard>
    </div>
  );

  const renderSettingsPanels = (
    <div className="space-y-5">
      {renderFeedback}
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          {renderBreakGlassMonitor}
          <SectionCard
            title="Change freeze"
            description="Freeze risky writes during incidents while leaving reads available to the team."
          >
            <div className="grid gap-3">
              <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]">
                <input
                  type="checkbox"
                  checked={changeFreezeDraft.enabled}
                  onChange={(event) =>
                    setChangeFreezeDraft((current) => ({
                      ...current,
                      enabled: event.currentTarget.checked,
                    }))
                  }
                />
                <span>Freeze risky writes</span>
              </label>
              <select
                value={changeFreezeDraft.scope}
                onChange={(event) =>
                  setChangeFreezeDraft((current) => ({
                    ...current,
                    scope: event.currentTarget.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              >
                <option value="operational_writes">Operational writes</option>
                <option value="integration_writes">Integration writes</option>
                <option value="all_writes">All writes</option>
              </select>
              <textarea
                value={changeFreezeDraft.reason}
                onChange={(event) =>
                  setChangeFreezeDraft((current) => ({
                    ...current,
                    reason: event.currentTarget.value,
                  }))
                }
                className="min-h-[88px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Why is the portal in freeze mode?"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={changeFreezeDraft.issueReference}
                  onChange={(event) =>
                    setChangeFreezeDraft((current) => ({
                      ...current,
                      issueReference: event.currentTarget.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  placeholder="INC-142"
                />
                <input
                  type="datetime-local"
                  value={changeFreezeDraft.expiresAt}
                  onChange={(event) =>
                    setChangeFreezeDraft((current) => ({
                      ...current,
                      expiresAt: event.currentTarget.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                />
              </div>
              <button
                type="button"
                onClick={handleChangeFreezeSave}
                disabled={pendingKey === "change-freeze"}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "change-freeze"
                    ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "change-freeze" ? "Saving..." : "Save freeze state"}
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Maintenance banner"
            description="Post an internal banner so the team knows what is paused, delayed, or under review."
          >
            <div className="grid gap-3">
              <textarea
                value={bannerDraft.message}
                onChange={(event) =>
                  setBannerDraft((current) => ({
                    ...current,
                    message: event.currentTarget.value,
                  }))
                }
                className="min-h-[88px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Billing sync paused while invoice matching is repaired."
              />
              <div className="grid gap-3 md:grid-cols-3">
                <select
                  value={bannerDraft.tone}
                  onChange={(event) =>
                    setBannerDraft((current) => ({
                      ...current,
                      tone: event.currentTarget.value as MaintenanceBanner["tone"],
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
                <select
                  value={bannerDraft.ownerId}
                  onChange={(event) =>
                    setBannerDraft((current) => ({
                      ...current,
                      ownerId: event.currentTarget.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                >
                  <option value="">No owner</option>
                  {ownerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={bannerDraft.expiresAt}
                  onChange={(event) =>
                    setBannerDraft((current) => ({
                      ...current,
                      expiresAt: event.currentTarget.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                />
              </div>
              <input
                value={bannerDraft.issueReference}
                onChange={(event) =>
                  setBannerDraft((current) => ({
                    ...current,
                    issueReference: event.currentTarget.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="OPS-206"
              />
              <button
                type="button"
                onClick={handleBannerSave}
                disabled={pendingKey === "maintenance-banner"}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "maintenance-banner"
                    ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "maintenance-banner" ? "Saving..." : "Save maintenance banner"}
              </button>
            </div>
            {engineerConsole.maintenanceBanner ? (
              <div
                className={clsx(
                  "mt-4 rounded-[1.25rem] border px-4 py-3 text-sm",
                  bannerTone[engineerConsole.maintenanceBanner.tone],
                )}
              >
                <div className="font-semibold">{engineerConsole.maintenanceBanner.message}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.14em]">
                  {engineerConsole.maintenanceBanner.issueReference ?? "No issue reference"} ·{" "}
                  {engineerConsole.maintenanceBanner.ownerName ?? "Unassigned"}
                </div>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Feature flags"
            description="Stage internal rollouts by role without changing the main permission matrix."
          >
            <div className="space-y-4">
              {engineerConsole.featureFlags.map((flag) => {
                const draft = featureDrafts[flag.key] ?? {
                  description: flag.description,
                  enabledRoles: flag.enabledRoles,
                };
                return (
                  <div
                    key={flag.key}
                    className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
                  >
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                      {flag.key}
                    </div>
                    <textarea
                      value={draft.description}
                      onChange={(event) =>
                        setFeatureDrafts((current) => ({
                          ...current,
                          [flag.key]: {
                            ...draft,
                            description: event.currentTarget.value,
                          },
                        }))
                      }
                      className="mt-3 min-h-[72px] w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(Object.keys(roleLabels) as UserRole[]).map((role) => {
                        const enabled = draft.enabledRoles.includes(role);
                        return (
                          <label
                            key={`${flag.key}:${role}`}
                            className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                setFeatureDrafts((current) => ({
                                  ...current,
                                  [flag.key]: {
                                    ...draft,
                                    enabledRoles: event.currentTarget.checked
                                      ? [...draft.enabledRoles, role]
                                      : draft.enabledRoles.filter((candidate) => candidate !== role),
                                  },
                                }))
                              }
                            />
                            <span>{roleLabels[role]}</span>
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveFeatureFlag(flag.key, draft.description, draft.enabledRoles)}
                      disabled={pendingKey === `feature-flag:${flag.key}`}
                      className="mt-4 rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)] hover:bg-[rgba(23,56,75,0.12)]"
                    >
                      Save roles
                    </button>
                  </div>
                );
              })}

              <div className="rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-stone-50/80 p-4">
                <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  Add feature flag
                </div>
                <div className="mt-3 grid gap-3">
                  <input
                    value={newFeatureKey}
                    onChange={(event) => setNewFeatureKey(event.currentTarget.value)}
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    placeholder="new-rollout"
                  />
                  <textarea
                    value={newFeatureDescription}
                    onChange={(event) => setNewFeatureDescription(event.currentTarget.value)}
                    className="min-h-[72px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    placeholder="Describe what this flag controls."
                  />
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(roleLabels) as UserRole[]).map((role) => (
                      <label
                        key={`new-flag:${role}`}
                        className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                      >
                        <input
                          type="checkbox"
                          checked={newFeatureRoles.includes(role)}
                          onChange={(event) =>
                            setNewFeatureRoles((current) =>
                              event.currentTarget.checked
                                ? [...current, role]
                                : current.filter((candidate) => candidate !== role),
                            )
                          }
                        />
                        <span>{roleLabels[role]}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => saveFeatureFlag(newFeatureKey, newFeatureDescription, newFeatureRoles)}
                    disabled={pendingKey === `feature-flag:${newFeatureKey}` || newFeatureKey.trim().length === 0}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-white bg-[color:var(--navy-strong)] hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgba(23,56,75,0.46)]"
                  >
                    Save feature flag
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Schema inspector"
            description="Read-only counts for critical tables when the UI and database appear out of sync."
          >
            <div className="space-y-3">
              {engineerConsole.schemaInspectorRows.map((row) => (
                <div
                  key={row.tableName}
                  className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                      {row.tableName}
                    </div>
                    <div className="text-sm text-[color:var(--muted)]">{row.rowCount} rows</div>
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">{row.detail}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Engineer support notes"
          description="Keep troubleshooting context off the staff-facing workflow while preserving incident handoff detail."
        >
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={supportNoteDraft.targetType}
                onChange={(event) =>
                  setSupportNoteDraft((current) => ({
                    ...current,
                    targetType: event.currentTarget.value as EngineerSupportNote["targetType"],
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              >
                <option value="sync_job">Sync job</option>
                <option value="integration_source">Integration source</option>
                <option value="account">Account</option>
                <option value="cohort">Cohort</option>
                <option value="family">Family</option>
                <option value="support_case">Support case</option>
              </select>
              <input
                value={supportNoteDraft.targetId}
                onChange={(event) =>
                  setSupportNoteDraft((current) => ({
                    ...current,
                    targetId: event.currentTarget.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Target id"
              />
              <input
                value={supportNoteDraft.issueReference}
                onChange={(event) =>
                  setSupportNoteDraft((current) => ({
                    ...current,
                    issueReference: event.currentTarget.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="SUP-88"
              />
            </div>
            <textarea
              value={supportNoteDraft.body}
              onChange={(event) =>
                setSupportNoteDraft((current) => ({
                  ...current,
                  body: event.currentTarget.value,
                }))
              }
              className="min-h-[96px] rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="What the engineer observed, changed, or still needs handed off."
            />
            <button
              type="button"
              onClick={handleSupportNoteSave}
              disabled={pendingKey === "support-note"}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "support-note"
                  ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pendingKey === "support-note" ? "Saving..." : "Add support note"}
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {engineerConsole.supportNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
              >
                <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  {note.targetType.replaceAll("_", " ")} · {note.targetId}
                </div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">{note.body}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  <span>{note.issueReference}</span>
                  <span>{note.authorName}</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent engineer changes"
          description="Feature flags, maintenance updates, and integration state changes tracked in one feed."
        >
          {engineerConsole.changeLogEntries.length === 0 ? (
            <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50/90 p-4 text-sm text-[color:var(--muted)]">
              No recent engineer-only changes have been logged.
            </div>
          ) : (
            <div className="space-y-3">
              {engineerConsole.changeLogEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/80 p-4"
                >
                  <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                    {entry.summary}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    <span>{entry.actorName}</span>
                    <span>{entry.action.replaceAll("_", " ")}</span>
                    {entry.issueReference ? <span>{entry.issueReference}</span> : null}
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );

  if (section === "dashboard") {
    return renderDashboardPanels;
  }

  if (section === "integrations") {
    return renderIntegrationsPanels;
  }

  return renderSettingsPanels;
}
