import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { exportBillingCsv } from "@/lib/admin-operations";

export async function GET() {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return new Response("Not authenticated.", { status: 401 });
  }

  try {
    const csv = await exportBillingCsv({ viewer: viewer.user });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="intoprep-billing-follow-up.csv"',
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Billing export failed.", {
      status: 400,
    });
  }
}
