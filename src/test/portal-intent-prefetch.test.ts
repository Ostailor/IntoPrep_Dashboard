import { describe, expect, it } from "vitest";
import { claimIntentPrefetch } from "@/lib/portal-intent-prefetch";

describe("portal intent prefetch claims", () => {
  it("claims each href only once", () => {
    const seen = new Set<string>();

    expect(claimIntentPrefetch(seen, "/students")).toBe(true);
    expect(claimIntentPrefetch(seen, "/students")).toBe(false);
    expect(claimIntentPrefetch(seen, "/calendar")).toBe(true);
  });
});
