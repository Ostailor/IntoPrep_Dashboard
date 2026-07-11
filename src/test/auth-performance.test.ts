import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/local-qa", async () => ({
  ...(await vi.importActual<typeof import("@/lib/local-qa")>("@/lib/local-qa")),
  isLocalQaMode: () => false,
}));
vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseServiceRole: () => true,
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createServerClient,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createServiceClient,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (operation: unknown) => operation,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`Unexpected redirect to ${path}`);
  }),
}));

import {
  getAuthenticatedViewerForRequest,
  resolvePortalViewer,
} from "@/lib/auth";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });

  return { promise, resolve };
}

const authUser = {
  id: "user-1",
  email: "learner@example.com",
  user_metadata: {
    demo: false,
    full_name: "Existing Learner",
    role: "instructor",
    title: "Instructor",
  },
};

const activeProfile = {
  id: authUser.id,
  full_name: "Existing Learner",
  email: authUser.email,
  role: "instructor",
  title: "Instructor",
  account_status: "active",
  must_change_password: false,
  last_signed_in_at: new Date().toISOString(),
  session_revoked_at: null,
  deleted_at: null,
  deleted_by: null,
  demo: false,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-07-01T12:00:00.000Z",
};

function createServiceFixture({
  profile = activeProfile,
  template = null,
  deferProfileReads = false,
  deferProfileWrite = false,
  currentAssignments = [],
  assignmentsAfterMutationError = currentAssignments,
  assignmentMutationError = null,
}: {
  profile?: typeof activeProfile;
  template?: {
    email: string;
    full_name: string;
    role: "ta";
    title: string;
    assigned_cohort_ids: string[];
    account_status: "active";
    must_change_password: boolean;
    deleted_at: null;
    deleted_by: null;
    demo: boolean;
  } | null;
  deferProfileReads?: boolean;
  deferProfileWrite?: boolean;
  currentAssignments?: Array<{ cohort_id: string; role: string }>;
  assignmentsAfterMutationError?: Array<{ cohort_id: string; role: string }>;
  assignmentMutationError?: { message: string } | null;
} = {}) {
  const profileRead = createDeferred<{ data: typeof profile; error: null }>();
  const templateRead = createDeferred<{ data: typeof template; error: null }>();
  const profileWrite = createDeferred<{ data: null; error: null }>();
  const started: string[] = [];
  const assignmentUpserts: unknown[] = [];
  const assignmentDeletes: string[][] = [];
  let assignmentSelects = 0;

  const client = {
    from: vi.fn((table: string) => {
      let action = "";
      const query = {
        select: vi.fn(() => {
          action = "select";
          return query;
        }),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(() => {
          if (table === "profiles") {
            started.push("profiles");
            return deferProfileReads
              ? profileRead.promise
              : Promise.resolve({ data: profile, error: null });
          }

          started.push("user_templates");
          return deferProfileReads
            ? templateRead.promise
            : Promise.resolve({ data: template, error: null });
        }),
        upsert: vi.fn((values: unknown) => {
          action = "upsert";
          if (table === "profiles") {
            started.push("profile_write");
            return deferProfileWrite
              ? profileWrite.promise
              : Promise.resolve({ data: null, error: null });
          }

          assignmentUpserts.push(values);
          return Promise.resolve({ data: null, error: assignmentMutationError });
        }),
        update: vi.fn(() => {
          action = "update";
          return query;
        }),
        delete: vi.fn(() => {
          action = "delete";
          return query;
        }),
        in: vi.fn((_column: string, values: string[]) => {
          assignmentDeletes.push(values);
          return Promise.resolve({ data: null, error: null });
        }),
        then: (
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          let result: { data: unknown; error: null };
          if (table === "cohort_assignments" && action === "select") {
            assignmentSelects += 1;
            started.push("assignments");
            result = {
              data: assignmentSelects === 1
                ? currentAssignments
                : assignmentsAfterMutationError,
              error: null,
            };
          } else {
            result = { data: null, error: null };
          }

          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return query;
    }),
  };

  return {
    assignmentDeletes,
    assignmentUpserts,
    client,
    get assignmentSelects() {
      return assignmentSelects;
    },
    profileRead,
    profileWrite,
    started,
    templateRead,
  };
}

function createDeferredAuthClient() {
  const user = createDeferred<{ data: { user: typeof authUser }; error: null }>();
  const session = createDeferred<{
    data: { session: { access_token: string } };
    error: null;
  }>();
  const started: string[] = [];

  return {
    client: {
      auth: {
        getUser: vi.fn(() => {
          started.push("getUser");
          return user.promise;
        }),
        getSession: vi.fn(() => {
          started.push("getSession");
          return session.promise;
        }),
      },
    },
    resolveAll() {
      user.resolve({ data: { user: authUser }, error: null });
      session.resolve({ data: { session: { access_token: "header.payload.signature" } }, error: null });
    },
    started,
  };
}

describe("authentication network critical path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["page", () => resolvePortalViewer({ path: "/students" })],
    ["API", () => getAuthenticatedViewerForRequest()],
  ])("starts getUser and getSession together for the %s entrypoint", async (_kind, authenticate) => {
    const auth = createDeferredAuthClient();
    const service = createServiceFixture();
    mocks.createServerClient.mockReturnValue(auth.client);
    mocks.createServiceClient.mockReturnValue(service.client);

    const resultPromise = authenticate();
    await Promise.resolve();
    await Promise.resolve();

    expect(auth.started).toEqual(["getUser", "getSession"]);

    auth.resolveAll();
    await expect(resultPromise).resolves.toMatchObject({
      user: { id: authUser.id },
    });
  });

  it("overlaps profile hydration reads and reuses one assignment snapshot", async () => {
    const service = createServiceFixture({
      deferProfileReads: true,
      deferProfileWrite: true,
      currentAssignments: [
        { cohort_id: "cohort-a", role: "instructor" },
        { cohort_id: "cohort-stale", role: "ta" },
      ],
      template: {
        email: authUser.email,
        full_name: "Template Learner",
        role: "ta",
        title: "Teaching Assistant",
        assigned_cohort_ids: ["cohort-a", "cohort-b"],
        account_status: "active",
        must_change_password: false,
        deleted_at: null,
        deleted_by: null,
        demo: false,
      },
    });
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "header.payload.signature" } },
          error: null,
        }),
      },
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    const resultPromise = resolvePortalViewer({ path: "/students" });
    await vi.waitFor(() => expect(service.started).toContain("profiles"));

    expect(service.started).toEqual(["profiles", "user_templates"]);

    service.profileRead.resolve({ data: activeProfile, error: null });
    service.templateRead.resolve({
      data: {
        email: authUser.email,
        full_name: "Template Learner",
        role: "ta",
        title: "Teaching Assistant",
        assigned_cohort_ids: ["cohort-a", "cohort-b"],
        account_status: "active",
        must_change_password: false,
        deleted_at: null,
        deleted_by: null,
        demo: false,
      },
      error: null,
    });
    await vi.waitFor(() => expect(service.started).toContain("profile_write"));

    expect(service.started).toContain("assignments");

    service.profileWrite.resolve({ data: null, error: null });
    await expect(resultPromise).resolves.toMatchObject({
      user: {
        assignedCohortIds: ["cohort-a", "cohort-b"],
        role: "ta",
      },
    });
    expect(service.assignmentSelects).toBe(1);
    expect(service.assignmentUpserts).toEqual([[
      { cohort_id: "cohort-a", user_id: authUser.id, role: "ta" },
      { cohort_id: "cohort-b", user_id: authUser.id, role: "ta" },
    ]]);
    expect(service.assignmentDeletes).toEqual([["cohort-stale"]]);
  });

  it("rereads actual assignments when a template mutation returns an error", async () => {
    const service = createServiceFixture({
      assignmentMutationError: { message: "assignment upsert failed" },
      assignmentsAfterMutationError: [
        { cohort_id: "cohort-a", role: "ta" },
      ],
      currentAssignments: [
        { cohort_id: "cohort-a", role: "ta" },
      ],
      template: {
        email: authUser.email,
        full_name: "Template Learner",
        role: "ta",
        title: "Teaching Assistant",
        assigned_cohort_ids: ["cohort-a", "cohort-b"],
        account_status: "active",
        must_change_password: false,
        deleted_at: null,
        deleted_by: null,
        demo: false,
      },
    });
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "header.payload.signature" } },
          error: null,
        }),
      },
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    await expect(resolvePortalViewer({ path: "/students" })).resolves.toMatchObject({
      user: {
        assignedCohortIds: ["cohort-a"],
        role: "ta",
      },
    });
    expect(service.assignmentSelects).toBe(2);
  });
});
