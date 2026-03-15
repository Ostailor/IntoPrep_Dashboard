import { PortalPage, type PortalSearchParams } from "@/components/portal/portal-page";

export default function SettingsPage({
  searchParams,
}: {
  searchParams: PortalSearchParams;
}) {
  return <PortalPage section="settings" searchParams={searchParams} />;
}
