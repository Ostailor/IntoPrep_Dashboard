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
  improving: {
    stroke: "#047857",
    fill: "rgba(4, 120, 87, 0.14)",
  },
  plateauing: {
    stroke: "#b45309",
    fill: "rgba(180, 83, 9, 0.14)",
  },
  declining: {
    stroke: "#be123c",
    fill: "rgba(190, 18, 60, 0.14)",
  },
};

function getTrendTone(points: { label: string; score: number }[]) {
  if (points.length < 2) {
    return "plateauing" as const;
  }

  const delta = points.at(-1)!.score - points[0]!.score;

  if (delta > 20) {
    return "improving" as const;
  }

  if (delta < -20) {
    return "declining" as const;
  }

  return "plateauing" as const;
}

export function TrendSparkline({
  points,
  tone,
  className,
  onClick,
}: {
  points: { label: string; score: number }[];
  tone?: keyof typeof toneStyles;
  className?: string;
  onClick?: () => void;
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
  const resolvedTone = tone ?? getTrendTone(points);
  const content = (
    <>
      <svg
        className="h-14 w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend sparkline"
      >
        <polygon points={fillPoints} fill={toneStyles[resolvedTone].fill} />
        <polyline
          points={svgPoints}
          fill="none"
          stroke={toneStyles[resolvedTone].stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
        />
      </svg>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx("w-full space-y-2 rounded-2xl text-left outline-none transition focus:ring-2 focus:ring-[rgba(23,56,75,0.18)]", className)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={clsx("space-y-2", className)}>
      {content}
    </div>
  );
}
