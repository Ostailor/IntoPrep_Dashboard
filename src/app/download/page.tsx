import Link from "next/link";

const desktopReleasesUrl =
  process.env.NEXT_PUBLIC_DESKTOP_RELEASES_URL ??
  "https://github.com/Ostailor/IntoPrep_Dashboard/releases";

export default function DownloadPage() {
  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">IntoPrep install</div>
          <h1 className="display-font mt-3 text-5xl leading-tight text-[color:var(--navy-strong)] lg:text-6xl">
            Choose how you want to use IntoPrep.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            Most staff should use the browser version. If you prefer a normal desktop app on your
            computer, download the installer below.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.9rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Option 1
              </div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--navy-strong)]">
                Use it in your browser
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
                Open IntoPrep in Chrome, Edge, or Safari and sign in. This is the easiest option
                and works right away.
              </p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-full bg-[color:var(--navy-strong)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open IntoPrep
                </Link>
              </div>
            </div>

            <div className="rounded-[1.9rem] border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Option 2
              </div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--navy-strong)]">
                Download the desktop app
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
                If you want IntoPrep as a normal app on your computer, open the latest downloads
                page and choose the file for your device.
              </p>
              <div className="mt-6">
                <a
                  href={desktopReleasesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-[rgba(187,110,69,0.28)] bg-white/80 px-5 py-3 text-sm font-semibold text-[color:var(--navy-strong)] hover:opacity-90"
                >
                  Open downloads
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[1.9rem] border border-[color:var(--line)] bg-white/72 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              Before you start
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--navy-strong)]">
              <div>You need an internal IntoPrep account to sign in.</div>
              <div>If you do not have access yet, ask an engineer or admin.</div>
              <div>Your portal data is the same whether you use the browser or desktop app.</div>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">Simple steps</div>
          <h2 className="display-font mt-3 text-3xl text-[color:var(--navy-strong)]">
            Install in a few minutes
          </h2>

          <div className="mt-6 space-y-4">
            {[
              "Open the downloads page.",
              "Choose the newest file for Mac or Windows.",
              "Install the app and open IntoPrep.",
              "Sign in with your internal account.",
            ].map((line) => (
              <div
                key={line}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 px-4 py-4 text-sm leading-7 text-[color:var(--muted)]"
              >
                {line}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[1.9rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] p-6 text-sm text-[color:var(--navy-strong)]">
            <div className="font-semibold">Not sure which one to use?</div>
            <div className="mt-2">
              Start with the browser version. If you want IntoPrep to feel like a regular app on
              your computer, download the desktop version later.
            </div>
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
