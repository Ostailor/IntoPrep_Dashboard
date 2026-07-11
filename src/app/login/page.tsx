import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/login/actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
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
    return (
      <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
            <div className="section-kicker">Setup required</div>
            <h1 className="display-font mt-3 text-4xl leading-tight text-[color:var(--navy-strong)] lg:text-5xl">
              IntoPrep authentication is not configured.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
              This portal only runs against a live Supabase project. Add the Supabase environment
              variables before handing the dashboard off or testing sign-in.
            </p>
            <div className="mt-8 rounded-[1.9rem] border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] p-6 text-sm leading-7 text-[color:var(--navy-strong)]">
              Configure <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
              {" "}and the server-side Supabase credentials, then reload this page.
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getAuthenticatedViewerForRequest({ allowPasswordChangeRequired: true });
  if (viewer) {
    if (viewer.mustChangePassword) {
      redirect(`/reset-password?mode=required&next=${encodeURIComponent(next)}`);
    }

    redirect(next);
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel overflow-hidden p-6 lg:p-8">
          <div className="operations-image -m-6 mb-7 min-h-[230px] p-6 text-white lg:-m-8 lg:mb-8 lg:min-h-[300px] lg:p-8">
            <div className="section-kicker text-white/72">IntoPrep operations</div>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-normal lg:text-6xl">
              The internal command center for cohorts, classes, and family follow-up.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/76">
              Coordinate daily class operations, attendance, academic follow-up, billing status,
              and staff workflows across IntoPrep.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Classroom flow",
                value: "Attendance, scores, and same-day follow-up",
              },
              {
                label: "Student view",
                value: "Class rosters, trends, and academic follow-up in one place",
              },
              {
                label: "Internal control",
                value: "Role-based access for staff, TA, instructors, admin, and engineer",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-[color:var(--line)] bg-white p-5"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                  {item.label}
                </div>
                <div className="mt-3 text-lg font-semibold leading-7 text-[color:var(--navy-strong)]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-[rgba(17,69,84,0.16)] bg-[rgba(17,69,84,0.06)] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Daily usage
              </div>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[color:var(--navy-strong)]">
                <div>Staff oversee enrollment, scheduling, finance visibility, and campus operations.</div>
                <div>TA users support assigned cohorts with attendance, academic notes, resources, and family communication.</div>
                <div>Instructors stay focused on assigned classes, roster attendance, same-day score context, and student trends.</div>
              </div>
            </div>

            <div className="rounded-lg border border-[rgba(49,95,212,0.2)] bg-[rgba(49,95,212,0.08)] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Access model
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--navy-strong)]">
                <div>Accounts are provisioned internally by an engineer or admin.</div>
                <div>Each user sees only the sections and cohort data allowed for their role.</div>
                <div>Use the desktop app or browser interchangeably with the same account.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel p-6 lg:p-8">
          <div className="section-kicker">Staff access</div>
          <h2 className="mt-3 text-3xl font-semibold text-[color:var(--navy-strong)]">
            Sign in to IntoPrep
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
            Use your internal IntoPrep email and password to enter the operations dashboard.
          </p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
            Need the desktop install? Visit{" "}
            <Link className="font-semibold text-[color:var(--navy-strong)]" href="/download">
              downloads
            </Link>
            . Need access? Ask an engineer or admin to provision your account.
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
                <label
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                  htmlFor="login-email"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  required
                  name="email"
                  type="email"
                  className="focus-ring w-full rounded-lg border border-[color:var(--line)] bg-white px-4 py-3 text-sm"
                  placeholder="name@intoprep.com"
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                  htmlFor="login-password"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  required
                  name="password"
                  type="password"
                  className="focus-ring w-full rounded-lg border border-[color:var(--line)] bg-white px-4 py-3 text-sm"
                  placeholder="Enter your password"
                />
              </div>
              <PendingSubmitButton
                idleLabel="Sign in"
                pendingLabel="Signing in..."
                className="w-full rounded-lg bg-[color:var(--navy-strong)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              />
              <div className="text-right text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                <Link
                  className="font-semibold text-[color:var(--navy-strong)]"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
            </form>

            <div className="rounded-lg border border-[rgba(17,69,84,0.16)] bg-[rgba(17,69,84,0.06)] p-5 text-sm text-[color:var(--navy-strong)]">
              <div className="font-semibold">Internal access only</div>
              <div className="mt-2">
                This dashboard is for internal IntoPrep use. If your account is new, you may be
                asked to change your password on first sign-in.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
