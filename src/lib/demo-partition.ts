import type { User, UserRole } from "@/lib/domain";

export interface DemoScopedRow {
  demo?: boolean | null;
}

export function canSeeAllDemoPartitions(role: UserRole) {
  return role === "engineer";
}

export function getDemoPartition(viewer: Pick<User, "demo">) {
  return Boolean(viewer.demo);
}

export function isSameDemoPartition(viewer: Pick<User, "role" | "demo">, row: DemoScopedRow) {
  return canSeeAllDemoPartitions(viewer.role) || Boolean(row.demo) === getDemoPartition(viewer);
}

export function applyDemoScope<Query>(
  query: Query,
  viewer: Pick<User, "role" | "demo">,
): Query {
  if (canSeeAllDemoPartitions(viewer.role)) {
    return query;
  }

  return (query as { eq: (column: string, value: boolean) => Query }).eq(
    "demo",
    getDemoPartition(viewer),
  );
}
