import { describe, expect, it } from "vitest";
import { normalizeSourceUrl } from "@/lib/intake-sync-shared";

describe("google forms sync source validation", () => {
  it("accepts https csv export urls", () => {
    expect(
      normalizeSourceUrl(
        "https://docs.google.com/spreadsheets/d/sheet123/export?format=csv&gid=0",
      ),
    ).toBe("https://docs.google.com/spreadsheets/d/sheet123/export?format=csv&gid=0");
  });

  it("rejects invalid or unsupported urls", () => {
    expect(() => normalizeSourceUrl("")).toThrow(/required/i);
    expect(() => normalizeSourceUrl("ftp://example.com/export.csv")).toThrow(/http or https/i);
    expect(() => normalizeSourceUrl("not-a-url")).toThrow(/valid/i);
  });
});
