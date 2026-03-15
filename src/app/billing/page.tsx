import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function BillingPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="billing" searchParams={searchParams} />;
}
