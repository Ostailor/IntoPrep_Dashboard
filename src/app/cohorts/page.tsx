import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function CohortsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="cohorts" searchParams={searchParams} />;
}
