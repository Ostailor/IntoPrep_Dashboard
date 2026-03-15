import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function IntegrationsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="integrations" searchParams={searchParams} />;
}
