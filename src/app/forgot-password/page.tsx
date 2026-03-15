import Link from "next/link";
import { redirect } from "next/navigation";
import { requestPasswordResetAction } from "@/app/forgot-password/actions";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const error =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;
  const message =
    typeof resolvedSearchParams.message === "string" ? resolvedSearchParams.message : undefined;

  if (!isSupabaseConfigured()) {
    redirect("/dashboard?role=admin");
  }

  const viewer = await getAuthenticatedViewerForRequest();

  if (viewer?.accountStatus === "suspended") {
    redirect(
      `/login?error=${encodeURIComponent(
        "Your IntoPrep portal account is suspended. Contact an engineer or admin.",
      )}`,
    );
  }

  if (viewer?.mustChangePassword) {
    redirect("/reset-password?mode=required");
  }

  if (viewer) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">Recovery</div>
          <h1 className="display-font mt-3 text-5xl leading-tight text-[color:var(--navy-strong)]">
            Reset a portal password without reopening account setup.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            Enter the email used for the IntoPrep portal. We will send a secure recovery link that
            returns the user to a controlled password reset screen inside this app.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "First-login accounts",
                body: "Users created with a default password can also use this flow if they need a fresh reset link.",
              },
              {
                title: "No self-provisioning",
                body: "This flow only resets existing credentials. It does not create new accounts or elevate roles.",
              },
              {
                title: "Governed access",
                body: "Engineers and admins still control account creation, role changes, suspensions, and deletions from Settings.",
              },
              {
                title: "Protected handoff",
                body: "The reset link lands in the portal’s own password screen before any live data can be accessed.",
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
          <div className="section-kicker">Password reset</div>
          <h2 className="display-font mt-3 text-3xl text-[color:var(--navy-strong)]">
            Send recovery email
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
            We will email a recovery link if the account exists.
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

          <form action={requestPasswordResetAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Email
              </label>
              <input
                required
                name="email"
                type="email"
                className="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm outline-none ring-0 focus:border-[rgba(187,110,69,0.34)]"
                placeholder="admin@intoprep.dev"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-[color:var(--navy-strong)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Send recovery email
            </button>
          </form>

          <div className="mt-8 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Back to{" "}
            <Link className="font-semibold text-[color:var(--navy-strong)]" href="/login">
              login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
