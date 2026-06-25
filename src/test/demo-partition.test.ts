import { describe, expect, it } from "vitest";
import { getDemoPartition, isSameDemoPartition } from "@/lib/demo-partition";
import type { User } from "@/lib/domain";

const baseViewer: User = {
  id: "2d391f5f-159e-46fa-ae95-b8c015b2bb43",
  name: "Portal User",
  role: "admin",
  title: "Admin",
  assignedCohortIds: [],
};

describe("demo partitioning", () => {
  it("treats missing demo metadata as main data", () => {
    expect(getDemoPartition(baseViewer)).toBe(false);
    expect(isSameDemoPartition(baseViewer, { demo: false })).toBe(true);
    expect(isSameDemoPartition(baseViewer, { demo: true })).toBe(false);
  });

  it("keeps demo viewers scoped to demo rows", () => {
    const demoViewer = { ...baseViewer, demo: true };

    expect(getDemoPartition(demoViewer)).toBe(true);
    expect(isSameDemoPartition(demoViewer, { demo: true })).toBe(true);
    expect(isSameDemoPartition(demoViewer, { demo: false })).toBe(false);
  });

  it("allows engineers to inspect both partitions", () => {
    const engineerViewer: User = {
      ...baseViewer,
      role: "engineer",
      demo: false,
    };

    expect(isSameDemoPartition(engineerViewer, { demo: false })).toBe(true);
    expect(isSameDemoPartition(engineerViewer, { demo: true })).toBe(true);
  });
});
