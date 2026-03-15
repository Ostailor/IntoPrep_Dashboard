import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/login/actions";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function LoginPage({
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

  if (!isSupabaseConfigured()) {
    redirect("/dashboard?role=admin");
  }

  const viewer = await getAuthenticatedViewerForRequest();
  if (viewer) {
    redirect(next);
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">IntoPrep internal</div>
          <h1 className="display-font mt-3 text-5xl leading-tight text-[color:var(--navy-strong)] lg:text-6xl">
            Real auth and live operations start here.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            This build now supports Supabase-backed sign in plus live cohorts, schedules,
            students, families, attendance, same-day scores, read-only trend views, academic
            notes, support resources, billing snapshots, cohort messaging, lead intake, sync
            monitoring, linked Google Forms sync, linked QuickBooks billing sync, manual CSV
            fallback imports, program catalog visibility, and governance summaries.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Seeded role templates",
                body: "Provisioning starts in Settings. Engineer can create admin accounts, and admin can create staff, TA, and instructor accounts.",
              },
              {
                title: "Instructor scope",
                body: "Instructor accounts only get assigned classes, attendance, same-day scores, and read-only trends.",
              },
              {
                title: "TA scope",
                body: "TA accounts retain family communication and academic support access for assigned cohorts.",
              },
              {
                title: "Live portal ops",
                body: "All current portal sections, including programs and settings, now read from Supabase-backed operational data or live governance summaries.",
              },
              {
                title: "Engineer control",
                body: "Engineer accounts have full portal access and can create or delete admin accounts, plus manage every other role from Settings.",
              },
              {
                title: "Google Forms sync",
                body: "Engineer, admin, and staff users can save a linked Google Forms responses-sheet CSV URL or upload a manual CSV from Integrations to create leads, families, students, and enrollments.",
              },
              {
                title: "Billing sync",
                body: "Engineer, admin, and staff users can save a linked QuickBooks invoice CSV source, upload manual snapshots, and let the morning automation refresh finance visibility.",
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

          <div className="mt-8 rounded-[1.75rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] p-5 text-sm text-[color:var(--navy-strong)]">
            <div className="font-semibold">Need preview mode instead?</div>
            <div className="mt-2">
              Remove the Supabase environment variables and the portal will fall back to the
              original query-param role preview.
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">Access</div>
          <h2 className="display-font mt-3 text-3xl text-[color:var(--navy-strong)]">
            Sign in to the portal
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
            Use your IntoPrep internal account. New accounts must be provisioned by an engineer or
            admin inside Settings.
          </p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
            Need a packaged desktop install instead of the browser app? Visit{" "}
            <Link className="font-semibold text-[color:var(--navy-strong)]" href="/download">
              downloads
            </Link>
            .
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

          <div className="mt-6 space-y-6">
            <form action={signInAction} className="space-y-4">
              <input type="hidden" name="next" value={next} />
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
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Password
                </label>
                <input
                  required
                  name="password"
                  type="password"
                  className="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm outline-none ring-0 focus:border-[rgba(187,110,69,0.34)]"
                  placeholder="Enter your password"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-2xl bg-[color:var(--navy-strong)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Sign in
              </button>
              <div className="text-right text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                <Link
                  className="font-semibold text-[color:var(--navy-strong)]"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
            </form>

            <div className="rounded-[1.75rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] p-5 text-sm text-[color:var(--navy-strong)]">
              <div className="font-semibold">Account provisioning</div>
              <div className="mt-2">
                Engineer can create admin accounts with a default password. Admin can create and
                manage staff, TA, and instructor accounts. First-login password change is enforced,
                self-signup is disabled, and reset links are available here.
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Back to <Link className="font-semibold text-[color:var(--navy-strong)]" href="/dashboard?role=admin">preview mode</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
