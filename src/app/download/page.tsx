import Link from "next/link";

const desktopReleasesUrl =
  process.env.NEXT_PUBLIC_DESKTOP_RELEASES_URL ??
  "https://github.com/Ostailor/IntoPrep_Dashboard/releases";

export default function DownloadPage() {
  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">IntoPrep install</div>
          <h1 className="display-font mt-3 text-5xl leading-tight text-[color:var(--navy-strong)] lg:text-6xl">
            Download the desktop app or install the web app.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            The desktop app is a thin shell around the live IntoPrep portal. That means normal
            GitHub and Vercel releases update the experience inside the app without wiping data or
            forcing a reinstall for every portal change.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.75rem] border border-[color:var(--line)] bg-white/70 p-5">
              <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                Browser install
              </div>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                Open the production site in Chrome or Edge and use the browser install prompt or
                the in-app install button. This is the fastest path and stays current with normal
                web deployments.
              </p>
              <div className="mt-5">
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-full bg-[color:var(--navy-strong)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open the portal
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[color:var(--line)] bg-white/70 p-5">
              <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                Desktop installers
              </div>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                GitHub Actions can build downloadable installers for macOS and Windows. Use the
                latest release assets when you want a packaged desktop app instead of the browser
                install flow.
              </p>
              <div className="mt-5">
                <a
                  href={desktopReleasesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-[rgba(187,110,69,0.28)] bg-[rgba(187,110,69,0.14)] px-4 py-3 text-sm font-semibold text-[color:var(--copper)] hover:opacity-90"
                >
                  View desktop releases
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] p-5 text-sm text-[color:var(--navy-strong)]">
            <div className="font-semibold">Safe updates</div>
            <div className="mt-2">
              Portal data stays in Supabase. Web updates ship through GitHub and Vercel. Database
              changes stay additive through migrations, and the desktop shell only needs a new
              installer when native packaging settings or OS integration changes.
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">How it works</div>
          <h2 className="display-font mt-3 text-3xl text-[color:var(--navy-strong)]">
            One portal, two delivery modes
          </h2>

          <div className="mt-6 space-y-4">
            {[
              "The web app remains the source of truth and continues to deploy from GitHub to Vercel.",
              "The downloadable desktop app points at the production portal, so staff see the newest web release inside the desktop shell.",
              "Supabase migrations stay versioned and additive, so app updates do not destroy live tables or historical records.",
              "Only native-shell changes require a new installer release. Normal portal changes do not.",
            ].map((line) => (
              <div
                key={line}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 px-4 py-4 text-sm leading-7 text-[color:var(--muted)]"
              >
                {line}
              </div>
            ))}
          </div>

          <div className="mt-8 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Back to{" "}
            <Link className="font-semibold text-[color:var(--navy-strong)]" href="/login">
              sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
