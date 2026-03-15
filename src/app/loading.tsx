export default function Loading() {
  return (
    <main className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <section className="glass-panel rounded-[2.5rem] border border-white/45 p-8 lg:p-10">
          <div className="section-kicker">IntoPrep</div>
          <h1 className="display-font mt-3 text-4xl text-[color:var(--navy-strong)] lg:text-5xl">
            Opening your dashboard
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
            Loading the latest schedule, classroom activity, and account view.
          </p>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-[rgba(23,56,75,0.08)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[color:var(--navy-strong)]" />
          </div>
        </section>
      </div>
    </main>
  );
}
