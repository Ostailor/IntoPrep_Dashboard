import { resolvePortalViewer } from "@/lib/auth";
import type { PortalSection } from "@/lib/domain";
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

  return <PortalShell viewer={viewer} section={section} />;
}
