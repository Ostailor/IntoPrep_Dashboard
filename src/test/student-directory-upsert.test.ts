import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/domain";

const mocks = vi.hoisted(() => ({
  assertWritesAllowed: vi.fn(),
  createServiceClient: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/config", async () => ({
  ...(await vi.importActual<typeof import("@/lib/supabase/config")>("@/lib/supabase/config")),
  hasSupabaseServiceRole: () => true,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createServiceClient,
}));
vi.mock("@/lib/engineer-controls", () => ({
  assertWritesAllowed: mocks.assertWritesAllowed,
}));
vi.mock("@/lib/account-governance", () => ({
  recordAccountAuditLog: mocks.recordAudit,
}));
vi.mock("@/lib/attendance", () => ({
  viewerCanAccessCohort: vi.fn(),
}));
vi.mock("@/lib/staff-operations", () => ({
  moveSingleEnrollment: vi.fn(),
}));
vi.mock("@/lib/live-writes", () => ({
  persistAssessmentResult: vi.fn(),
}));

import { upsertStudentDirectoryRecord } from "@/lib/student-directory-writes";

type QueryResult = { data: unknown; error: { message: string } | null };

function makeQuery(result: QueryResult) {
  const query: Record<string, unknown> & PromiseLike<QueryResult> = {
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  for (const method of ["eq", "insert", "is", "limit", "order", "select", "update"] as const) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result);

  return query as typeof query & {
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

function makeViewer(demo: boolean): User {
  return {
    id: demo ? "admin-demo" : "admin-main",
    name: demo ? "Demo Admin" : "Main Admin",
    role: "admin",
    title: "Administrator",
    assignedCohortIds: [],
    demo,
  };
}

function makeServiceFixture({
  targetDemo,
  studentDemo = targetDemo,
  familyDemo = targetDemo,
}: {
  targetDemo: boolean;
  studentDemo?: boolean;
  familyDemo?: boolean;
}) {
  const definitions = makeQuery({
    data: [
      {
        id: "field-accommodations",
        key: "accommodations",
        label: "Accommodations",
        data_type: "text",
        header_aliases: [],
        required: false,
        sensitive: true,
        sort_order: 10,
        demo: targetDemo,
      },
      {
        id: "field-grad-year",
        key: "graduation_year",
        label: "Graduation year",
        data_type: "number",
        header_aliases: [],
        required: false,
        sensitive: true,
        sort_order: 20,
        demo: targetDemo,
      },
    ],
    error: null,
  });
  const studentRead = makeQuery({
    data: {
      id: "student-1",
      family_id: "family-1",
      first_name: "Ava",
      last_name: "Stone",
      email: "ava@example.com",
      phone: null,
      grade_level: "11",
      school: "Great Valley",
      target_test: "SAT",
      focus: "Reading timing",
      external_id: "S-100",
      custom_fields: {
        accommodations: "Extended time",
        graduation_year: 2026,
        imported_only: "preserve me",
      },
      demo: studentDemo,
    },
    error: null,
  });
  const familyRead = makeQuery({
    data: { id: "family-1", demo: familyDemo },
    error: null,
  });
  const familyUpdate = makeQuery({ data: null, error: null });
  const studentUpdate = makeQuery({ data: null, error: null });
  const queues = {
    student_field_definitions: [definitions],
    students: [studentRead, studentUpdate],
    families: [familyRead, familyUpdate],
  };
  const client = {
    from: vi.fn((table: keyof typeof queues) => queues[table].shift()),
  };

  return { client, definitions, familyUpdate, studentUpdate };
}

async function updateExistingStudent(viewer: User) {
  return upsertStudentDirectoryRecord({
    viewer,
    studentId: "student-1",
    firstName: "Ava",
    lastName: "Stone",
    gradeLevel: "11",
    school: "Great Valley",
    targetTest: "SAT",
    focus: "Reading timing",
    parent1Name: "Jordan Stone",
    parent1Email: "jordan@example.com",
    parent1Phone: "555-0100",
    parent2Name: "",
    parent2Email: "",
    parent2Phone: "",
    studentEmail: "ava@example.com",
    studentPhone: "",
    externalId: undefined,
    customFields: { accommodations: null, graduation_year: 2027 },
    guardianName: undefined,
    familyEmail: undefined,
    familyPhone: undefined,
    familyNotes: "",
  });
}

describe("student directory partitioned updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertWritesAllowed.mockResolvedValue(undefined);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    "keeps an admin update inside the demo=%s partition",
    async (demo) => {
      const fixture = makeServiceFixture({ targetDemo: demo });
      mocks.createServiceClient.mockReturnValue(fixture.client);

      await expect(updateExistingStudent(makeViewer(demo))).resolves.toEqual({
        studentId: "student-1",
        familyId: "family-1",
      });

      expect(fixture.definitions.eq).toHaveBeenCalledWith("demo", demo);
      expect(fixture.familyUpdate.eq.mock.calls).toEqual([
        ["id", "family-1"],
        ["demo", demo],
      ]);
      expect(fixture.studentUpdate.eq.mock.calls).toEqual([
        ["id", "student-1"],
        ["demo", demo],
      ]);
      expect(fixture.studentUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          external_id: "S-100",
          custom_fields: {
            graduation_year: 2027,
            imported_only: "preserve me",
          },
          demo,
        }),
      );
    },
  );

  it("rejects an existing student from the opposite partition", async () => {
    const fixture = makeServiceFixture({ targetDemo: true, studentDemo: false });
    mocks.createServiceClient.mockReturnValue(fixture.client);

    await expect(updateExistingStudent(makeViewer(true))).rejects.toThrow(
      "That student could not be found.",
    );
    expect(fixture.familyUpdate.update).not.toHaveBeenCalled();
    expect(fixture.studentUpdate.update).not.toHaveBeenCalled();
  });

  it("rejects an existing family from the opposite partition", async () => {
    const fixture = makeServiceFixture({ targetDemo: true, familyDemo: false });
    mocks.createServiceClient.mockReturnValue(fixture.client);

    await expect(updateExistingStudent(makeViewer(true))).rejects.toThrow(
      "That family could not be found.",
    );
    expect(fixture.familyUpdate.update).not.toHaveBeenCalled();
    expect(fixture.studentUpdate.update).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "scopes the default Campus lookup before creating a demo=%s student",
    async (demo) => {
      const definitions = makeQuery({ data: [], error: null });
      const campus = makeQuery({
        data: {
          id: demo ? "campus-demo" : "campus-main",
          name: demo ? "Demo Campus" : "Main Campus",
          location: "Wayne",
          modality: "In person",
          demo,
        },
        error: null,
      });
      const familyInsert = makeQuery({ data: null, error: null });
      const studentInsert = makeQuery({ data: null, error: null });
      const queues = {
        student_field_definitions: [definitions],
        campuses: [campus],
        families: [familyInsert],
        students: [studentInsert],
      };
      const client = {
        from: vi.fn((table: keyof typeof queues) => queues[table].shift()),
      };
      mocks.createServiceClient.mockReturnValue(client);

      await upsertStudentDirectoryRecord({
        viewer: makeViewer(demo),
        firstName: "Ada",
        lastName: "Lovelace",
        gradeLevel: "11",
        school: "Great Valley",
        targetTest: "SAT",
        focus: "Reading timing",
        parent1Name: "Jordan Lovelace",
        parent1Email: "jordan@example.com",
        parent1Phone: "555-0100",
        guardianName: undefined,
        familyEmail: undefined,
        familyPhone: undefined,
      });

      expect(campus.eq).toHaveBeenCalledWith("demo", demo);
      expect(familyInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
        preferred_campus_id: demo ? "campus-demo" : "campus-main",
        demo,
      }));
    },
  );
});
