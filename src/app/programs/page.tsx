import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function ProgramsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="programs" searchParams={searchParams} />;
}
