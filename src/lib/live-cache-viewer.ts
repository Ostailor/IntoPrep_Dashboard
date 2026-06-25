import type { User } from "@/lib/domain";
import { hasGlobalPortalScope } from "@/lib/permissions";

export function serializeLiveCacheViewer(viewer: User) {
  return JSON.stringify({
    id: viewer.id,
    role: viewer.role,
    demo: viewer.demo,
    assignedCohortIds: hasGlobalPortalScope(viewer.role)
      ? []
      : [...viewer.assignedCohortIds].sort(),
  });
}
