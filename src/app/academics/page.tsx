import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function AcademicsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="academics" searchParams={searchParams} />;
}
