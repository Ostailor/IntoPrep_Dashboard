import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function MessagingPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="messaging" searchParams={searchParams} />;
}
