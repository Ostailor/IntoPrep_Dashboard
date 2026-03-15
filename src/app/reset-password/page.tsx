import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePasswordAction } from "@/app/reset-password/actions";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const error =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;
  const message =
    typeof resolvedSearchParams.message === "string" ? resolvedSearchParams.message : undefined;
  const next =
    typeof resolvedSearchParams.next === "string" && resolvedSearchParams.next.startsWith("/")
      ? resolvedSearchParams.next
      : "/dashboard";
  const mode =
    typeof resolvedSearchParams.mode === "string" ? resolvedSearchParams.mode : "reset";

  if (!isSupabaseConfigured()) {
    redirect("/dashboard?role=admin");
  }

  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    redirect(
      `/login?error=${encodeURIComponent("Sign in to update your password.")}&next=${encodeURIComponent(next)}`,
    );
  }

  if (viewer.accountStatus === "suspended") {
    redirect(
      `/login?error=${encodeURIComponent(
        "Your IntoPrep portal account is suspended. Contact an engineer or admin.",
      )}`,
    );
  }

  const requiresPasswordChange = viewer.mustChangePassword || mode === "required";

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">Account security</div>
          <h1 className="display-font mt-3 text-5xl leading-tight text-[color:var(--navy-strong)]">
            {requiresPasswordChange
              ? "Set a new password before entering the portal."
              : "Choose a new password for your portal account."}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            {requiresPasswordChange
              ? "This account was provisioned with a managed default password or flagged for a reset. Portal data stays locked until you replace it."
              : "Use this recovery screen after opening a valid reset link or when changing your password from an authenticated session."}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Access stays blocked first",
                body: "Users marked for password change cannot open live portal data until this step is completed.",
              },
              {
                title: "Role stays unchanged",
                body: "Resetting a password does not change role scope, cohort assignments, or governance permissions.",
              },
              {
                title: "Admin-managed lifecycle",
                body: "Engineers and admins can still suspend accounts, issue reset emails, or delete accounts from Settings.",
              },
              {
                title: "Immediate recovery",
                body: "After the password is updated, the must-change-password lock is cleared for the current account.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[1.75rem] border border-[color:var(--line)] bg-white/70 p-5"
              >
                <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                  {item.title}
                </div>
                <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">Password change</div>
          <h2 className="display-font mt-3 text-3xl text-[color:var(--navy-strong)]">
            {requiresPasswordChange ? "Complete first sign-in" : "Update password"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
            Signed in as {viewer.email ?? viewer.user.name}.
          </p>

          {error ? (
            <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}

          <form action={updatePasswordAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="mode" value={mode} />
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                New password
              </label>
              <input
                required
                name="password"
                type="password"
                className="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm outline-none ring-0 focus:border-[rgba(187,110,69,0.34)]"
                placeholder="Choose a new password"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Confirm password
              </label>
              <input
                required
                name="confirmPassword"
                type="password"
                className="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm outline-none ring-0 focus:border-[rgba(187,110,69,0.34)]"
                placeholder="Enter the same password again"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-[color:var(--navy-strong)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Save new password
            </button>
          </form>

          <div className="mt-8 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Need a fresh email instead?{" "}
            <Link className="font-semibold text-[color:var(--navy-strong)]" href="/forgot-password">
              Request another reset link
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
