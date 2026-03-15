import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="dashboard" searchParams={searchParams} />;
}
