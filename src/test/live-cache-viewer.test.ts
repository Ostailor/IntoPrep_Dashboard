import { describe, expect, it } from "vitest";
import type { User } from "@/lib/domain";
import { serializeLiveCacheViewer } from "@/lib/live-cache-viewer";

const engineerViewer: User = {
  id: "8d4e55c7-3738-48bc-86d5-5119fe2e4feb",
  name: "Engineer User",
  role: "engineer",
  title: "Engineer",
  assignedCohortIds: ["not-used-for-global-scope"],
};

describe("live cache viewer serialization", () => {
  it("preserves real user ids for global-scope portal renders", () => {
    expect(JSON.parse(serializeLiveCacheViewer(engineerViewer))).toEqual({
      id: engineerViewer.id,
      role: "engineer",
      assignedCohortIds: [],
    });
  });

  it("keeps assigned cohorts stable for scoped instructor renders", () => {
    const instructorViewer: User = {
      id: "65c53460-e568-487a-a1ac-83b64c10366b",
      name: "Instructor User",
      role: "instructor",
      title: "Instructor",
      assignedCohortIds: ["cohort-b", "cohort-a"],
    };

    expect(JSON.parse(serializeLiveCacheViewer(instructorViewer))).toEqual({
      id: instructorViewer.id,
      role: "instructor",
      assignedCohortIds: ["cohort-a", "cohort-b"],
    });
  });
});
