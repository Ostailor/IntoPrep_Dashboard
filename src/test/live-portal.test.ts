import { describe, expect, it, vi } from "vitest";
import {
  mapLiveCatalogRows,
  scopeLiveCatalogQuery,
} from "@/lib/live-portal";

vi.mock("server-only", () => ({}));

describe("live portal catalog mapping", () => {
  it("preserves catalog partitions without exposing Program tuition", () => {
    const programs = [{
      id: "program-demo",
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
      tuition: 1_450,
      is_archived: false,
      archived_at: null,
      demo: true,
    }];
    const mapped = mapLiveCatalogRows({
      programs,
      campuses: [{
        id: "campus-main",
        name: "Main Campus",
        location: "Wayne",
        modality: "In person",
        demo: false,
      }],
      terms: [{
        id: "term-demo",
        name: "Summer 2026",
        start_date: "2026-06-22",
        end_date: "2026-08-07",
        demo: true,
      }],
    });

    expect(mapped.programs).toEqual([{
      id: "program-demo",
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
      demo: true,
    }]);
    expect(mapped.programs[0]).not.toHaveProperty("tuition");
    expect(mapped.campuses[0]).toMatchObject({ id: "campus-main", demo: false });
    expect(mapped.terms[0]).toMatchObject({ id: "term-demo", demo: true });
  });

  it.each([
    { label: "Demo", demo: true },
    { label: "Main", demo: false },
  ])("scopes archived Program service queries to the $label partition", ({ demo }) => {
    const query = { eq: vi.fn() };
    query.eq.mockReturnValue(query);

    expect(scopeLiveCatalogQuery(query, { role: "admin", demo })).toBe(query);
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("demo", demo);
  });

  it("preserves cross-partition archived Program access for engineers", () => {
    const query = { eq: vi.fn() };
    query.eq.mockReturnValue(query);

    expect(scopeLiveCatalogQuery(query, { role: "engineer", demo: false })).toBe(query);
    expect(query.eq).not.toHaveBeenCalled();
  });

  it.each([
    { label: "Demo", demo: true },
    { label: "Main", demo: false },
  ])("scopes active live catalog service queries to the $label partition", ({ demo }) => {
    const query = { eq: vi.fn() };
    query.eq.mockReturnValue(query);

    expect(scopeLiveCatalogQuery(query, { role: "admin", demo })).toBe(query);
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("demo", demo);
  });

  it("preserves engineer dual-partition access for live catalogs", () => {
    const query = { eq: vi.fn() };
    query.eq.mockReturnValue(query);

    expect(scopeLiveCatalogQuery(query, { role: "engineer", demo: false })).toBe(query);
    expect(query.eq).not.toHaveBeenCalled();
  });
});
