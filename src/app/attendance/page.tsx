import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function AttendancePage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="attendance" searchParams={searchParams} />;
}
