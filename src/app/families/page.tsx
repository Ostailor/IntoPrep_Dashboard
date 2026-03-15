import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function FamiliesPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="families" searchParams={searchParams} />;
}
