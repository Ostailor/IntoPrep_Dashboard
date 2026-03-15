import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { type AccountStatus, type UserRole } from "@/lib/domain";
import {
  normalizeManagedEmail,
  recordAccountAuditLog,
} from "@/lib/account-governance";
import {
  canDeleteRole,
  canManageRoleTransition,
  canProvisionRole,
  canSuspendRole,
  getPermissionProfile,
  isRole,
} from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { countActiveAdmins } from "@/lib/engineer-controls";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json({ error: "You cannot provision user accounts." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { email, fullName, title, role, password } = body ?? {};

  if (
    typeof email !== "string" ||
    typeof fullName !== "string" ||
    typeof title !== "string" ||
    typeof password !== "string" ||
    typeof role !== "string" ||
    !isRole(role)
  ) {
    return NextResponse.json({ error: "Invalid account provisioning payload." }, { status: 400 });
  }

  if (!canProvisionRole(viewer.user.role, role)) {
    return NextResponse.json({ error: "Your role cannot provision that account type." }, { status: 403 });
  }

  const normalizedEmail = normalizeManagedEmail(email);

  if (
    normalizedEmail.length === 0 ||
    fullName.trim().length === 0 ||
    title.trim().length === 0 ||
    password.length < 8
  ) {
    return NextResponse.json(
      { error: "Email, full name, title, and an 8+ character default password are required." },
      { status: 400 },
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: createdUser, error: createError } = await serviceClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      title: title.trim(),
      role,
      must_change_password: true,
    },
  });

  if (createError || !createdUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Account provisioning failed." },
      { status: 400 },
    );
  }

  const createdAuthUser = createdUser.user;
  const [profileUpsert, templateUpsert] = await Promise.all([
    serviceClient.from("profiles").upsert({
      id: createdAuthUser.id,
      email: normalizedEmail,
      full_name: fullName.trim(),
      role,
      title: title.trim(),
      account_status: "active",
      must_change_password: true,
    }),
    serviceClient.from("user_templates").upsert(
      {
        email: normalizedEmail,
        full_name: fullName.trim(),
        role,
        title: title.trim(),
        assigned_cohort_ids: [],
        account_status: "active",
        must_change_password: true,
      },
      { onConflict: "email" },
    ),
  ]);

  if (profileUpsert.error || templateUpsert.error) {
    await serviceClient.auth.admin.deleteUser(createdAuthUser.id);

    return NextResponse.json(
      {
        error:
          profileUpsert.error?.message ??
          templateUpsert.error?.message ??
          "Account provisioning failed.",
      },
      { status: 400 },
    );
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.user.id,
    targetUserId: createdAuthUser.id,
    targetEmail: normalizedEmail,
    action: "account_provisioned",
    summary: `${viewer.user.name} provisioned ${normalizedEmail} as ${role}.`,
    details: {
      role,
      title: title.trim(),
    },
  });

  return NextResponse.json({
    ok: true,
    userId: createdAuthUser.id,
    email: normalizedEmail,
    role,
  });
}

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json({ error: "You cannot manage user roles." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { userId, role } = body ?? {};

  if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
    return NextResponse.json({ error: "Invalid role update payload." }, { status: 400 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: targetProfileData } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const targetProfile = (targetProfileData ?? null) as ProfileRow | null;

  if (!targetProfile) {
    return NextResponse.json({ error: "That user profile could not be found." }, { status: 404 });
  }

  if (targetProfile.deleted_at) {
    return NextResponse.json({ error: "That account is no longer active." }, { status: 404 });
  }

  if (targetProfile.id === viewer.user.id) {
    return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
  }

  if (!canManageRoleTransition(viewer.user.role, targetProfile.role, role as UserRole)) {
    return NextResponse.json(
      { error: "Your role cannot apply that change." },
      { status: 403 },
    );
  }

  if (
    targetProfile.role === "admin" &&
    role !== "admin" &&
    targetProfile.account_status === "active" &&
    (await countActiveAdmins()) <= 1
  ) {
    return NextResponse.json(
      { error: "At least one active admin must remain in the portal." },
      { status: 403 },
    );
  }

  const [profileUpdate, assignmentUpdate] = await Promise.all([
    serviceClient.from("profiles").update({ role }).eq("id", targetProfile.id),
    serviceClient.from("cohort_assignments").update({ role }).eq("user_id", targetProfile.id),
  ]);

  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  if (assignmentUpdate.error) {
    return NextResponse.json({ error: assignmentUpdate.error.message }, { status: 400 });
  }

  if (targetProfile.email) {
    const templateUpdate = await serviceClient
      .from("user_templates")
      .update({ role })
      .eq("email", targetProfile.email.toLowerCase());

    if (templateUpdate.error) {
      return NextResponse.json({ error: templateUpdate.error.message }, { status: 400 });
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.user.id,
    targetUserId: targetProfile.id,
    targetEmail: targetProfile.email,
    targetType: "account",
    action: "role_updated",
    summary: `${viewer.user.name} changed ${targetProfile.email ?? targetProfile.id} from ${targetProfile.role} to ${role}.`,
    details: {
      fromRole: targetProfile.role,
      toRole: role,
    },
  });

  return NextResponse.json({
    ok: true,
    userId: targetProfile.id,
    role,
  });
}

export async function PUT(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json({ error: "You cannot change account status." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { userId, status } = body ?? {};

  if (
    typeof userId !== "string" ||
    (status !== "active" && status !== "suspended")
  ) {
    return NextResponse.json({ error: "Invalid account status payload." }, { status: 400 });
  }

  if (userId === viewer.user.id) {
    return NextResponse.json({ error: "You cannot change your own account status." }, { status: 403 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: targetProfileData } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const targetProfile = (targetProfileData ?? null) as ProfileRow | null;

  if (!targetProfile) {
    return NextResponse.json({ error: "That user profile could not be found." }, { status: 404 });
  }

  if (targetProfile.deleted_at) {
    return NextResponse.json({ error: "That account is no longer active." }, { status: 404 });
  }

  if (!canSuspendRole(viewer.user.role, targetProfile.role)) {
    return NextResponse.json(
      { error: "Your role cannot change that account status." },
      { status: 403 },
    );
  }

  if (
    targetProfile.role === "admin" &&
    status === "suspended" &&
    targetProfile.account_status === "active" &&
    (await countActiveAdmins()) <= 1
  ) {
    return NextResponse.json(
      { error: "At least one active admin must remain in the portal." },
      { status: 403 },
    );
  }

  const [profileUpdate, templateUpdate] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({
        account_status: status as AccountStatus,
        session_revoked_at: status === "suspended" ? new Date().toISOString() : undefined,
      })
      .eq("id", targetProfile.id),
    targetProfile.email
      ? serviceClient
          .from("user_templates")
          .update({ account_status: status as AccountStatus })
          .eq("email", targetProfile.email.toLowerCase())
      : Promise.resolve({ error: null }),
  ]);

  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  if (templateUpdate.error) {
    return NextResponse.json({ error: templateUpdate.error.message }, { status: 400 });
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.user.id,
    targetUserId: targetProfile.id,
    targetEmail: targetProfile.email,
    targetType: "account",
    action: status === "suspended" ? "account_suspended" : "account_reactivated",
    summary:
      status === "suspended"
        ? `${viewer.user.name} suspended ${targetProfile.email ?? targetProfile.id}.`
        : `${viewer.user.name} reactivated ${targetProfile.email ?? targetProfile.id}.`,
    details: {
      fromStatus: targetProfile.account_status,
      toStatus: status,
      role: targetProfile.role,
    },
  });

  return NextResponse.json({
    ok: true,
    userId: targetProfile.id,
    status,
  });
}

export async function DELETE(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json({ error: "You cannot delete user accounts." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { userId } = body ?? {};

  if (typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid account deletion payload." }, { status: 400 });
  }

  if (userId === viewer.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 403 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: targetProfileData } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const targetProfile = (targetProfileData ?? null) as ProfileRow | null;

  if (!targetProfile) {
    return NextResponse.json({ error: "That user profile could not be found." }, { status: 404 });
  }

  if (targetProfile.deleted_at) {
    return NextResponse.json({ error: "That account is no longer active." }, { status: 404 });
  }

  if (!canDeleteRole(viewer.user.role, targetProfile.role)) {
    return NextResponse.json({ error: "Your role cannot delete that account." }, { status: 403 });
  }

  if (
    targetProfile.role === "admin" &&
    targetProfile.account_status === "active" &&
    (await countActiveAdmins()) <= 1
  ) {
    return NextResponse.json(
      { error: "At least one active admin must remain in the portal." },
      { status: 403 },
    );
  }

  const deletedAt = new Date().toISOString();
  const [profileUpdate, templateUpdate, assignmentDelete] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({
        account_status: "suspended",
        deleted_at: deletedAt,
        deleted_by: viewer.user.id,
        session_revoked_at: deletedAt,
      })
      .eq("id", targetProfile.id),
    targetProfile.email
      ? serviceClient
          .from("user_templates")
          .update({
            account_status: "suspended",
            deleted_at: deletedAt,
            deleted_by: viewer.user.id,
          })
          .eq("email", targetProfile.email.toLowerCase())
      : Promise.resolve({ error: null }),
    serviceClient.from("cohort_assignments").delete().eq("user_id", targetProfile.id),
  ]);

  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  if (templateUpdate.error) {
    return NextResponse.json({ error: templateUpdate.error.message }, { status: 400 });
  }

  if (assignmentDelete.error) {
    return NextResponse.json({ error: assignmentDelete.error.message }, { status: 400 });
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.user.id,
    targetUserId: targetProfile.id,
    targetEmail: targetProfile.email,
    targetType: "account",
    action: "account_deleted",
    summary: `${viewer.user.name} deactivated ${targetProfile.email ?? targetProfile.id} and removed portal access.`,
    details: {
      deletedRole: targetProfile.role,
      deletedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    userId: targetProfile.id,
  });
}
