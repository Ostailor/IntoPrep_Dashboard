import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function StudentsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="students" searchParams={searchParams} />;
}
