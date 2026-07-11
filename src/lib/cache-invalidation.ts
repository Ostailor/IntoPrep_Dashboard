import { revalidateTag } from "next/cache";

const PORTAL_LIVE_TAG = "portal-live";

export function revalidatePortalLiveCache() {
  revalidateTag(PORTAL_LIVE_TAG, "max");
}

export function expirePortalLiveCache() {
  revalidateTag(PORTAL_LIVE_TAG, { expire: 0 });
}
