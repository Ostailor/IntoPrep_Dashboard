import clsx from "clsx";

const toneStyles = {
  navy: {
    stroke: "#17384b",
    fill: "rgba(23, 56, 75, 0.12)",
  },
  copper: {
    stroke: "#bb6e45",
    fill: "rgba(187, 110, 69, 0.14)",
  },
  sage: {
    stroke: "#738a7b",
    fill: "rgba(115, 138, 123, 0.14)",
  },
};

export function TrendSparkline({
  points,
  tone = "copper",
  className,
}: {
  points: { label: string; score: number }[];
  tone?: keyof typeof toneStyles;
  className?: string;
}) {
  if (points.length === 0) {
    return (
      <div
        className={clsx(
          "flex h-14 items-center justify-center rounded-2xl border border-dashed border-[color:var(--line)] text-xs text-[color:var(--muted)]",
          className,
        )}
      >
        No trend history yet
      </div>
    );
  }

  const width = 180;
  const height = 56;
  const padding = 6;
  const scores = points.map((point) => point.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore || 1;

  const svgPoints = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.score - minScore) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const fillPoints = `${padding},${height - padding} ${svgPoints} ${width - padding},${height - padding}`;

  return (
    <div className={clsx("space-y-2", className)}>
      <svg
        className="h-14 w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend sparkline"
      >
        <polygon points={fillPoints} fill={toneStyles[tone].fill} />
        <polyline
          points={svgPoints}
          fill="none"
          stroke={toneStyles[tone].stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
        />
      </svg>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  );
}
