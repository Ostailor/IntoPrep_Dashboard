import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function CalendarPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="calendar" searchParams={searchParams} />;
}
