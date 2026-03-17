import { redirect } from "next/navigation";
import { resolvePortalViewer } from "@/lib/auth";
import type { PortalSection } from "@/lib/domain";
import { canAccessSection, getVisibleSections } from "@/lib/permissions";
import { PortalShell } from "@/components/portal/portal-shell";

export type PortalSearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function PortalPage({
  section,
  searchParams,
}: {
  section: PortalSection;
  searchParams: PortalSearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const viewer = await resolvePortalViewer({
    previewRole: resolvedSearchParams.role,
    path: `/${section}`,
  });

  if (!canAccessSection(viewer.user.role, section)) {
    const fallbackSection = getVisibleSections(viewer.user.role)[0] ?? "dashboard";
    redirect(`/${fallbackSection}`);
  }

  return <PortalShell viewer={viewer} section={section} />;
}
