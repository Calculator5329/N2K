/**
 * Inline difficulty meter — a 5-pip line akin to a star rating, but using
 * filled bookmark glyphs. Difficulty is bucketed:
 *   0–10 = trivial   ▁▁▁▁▁
 *   10–25 = easy     ▆▁▁▁▁
 *   25–50 = medium   ▆▆▁▁▁
 *   50–75 = hard     ▆▆▆▁▁
 *   75–90 = brutal   ▆▆▆▆▁
 *   90+ = nightmare  ▆▆▆▆▆
 */
const PIPS = 5;

function pipsFor(difficulty: number): number {
  if (difficulty <= 10) return 0;
  if (difficulty <= 25) return 1;
  if (difficulty <= 50) return 2;
  if (difficulty <= 75) return 3;
  if (difficulty <= 90) return 4;
  return 5;
}

export function DifficultyMeter({
  difficulty,
  showValue = true,
  size = "md",
}: {
  difficulty: number | null;
  showValue?: boolean;
  size?: "sm" | "md";
}) {
  if (difficulty === null) {
    return (
      <span className="font-mono text-[12px] text-ink-100 italic">no solution</span>
    );
  }

  const filled = pipsFor(difficulty);
  const tileSize = size === "sm" ? "w-1.5 h-3.5" : "w-2 h-5";
  const valueClass =
    size === "sm" ? "text-[11px]" : "text-[13px]";

  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-end gap-[2px]">
        {Array.from({ length: PIPS }).map((_, i) => (
          <span
            key={i}
            className={[
              "block",
              tileSize,
              i < filled ? "bg-oxblood-500" : "bg-ink-100/15",
            ].join(" ")}
            style={{ borderRadius: "1px" }}
          />
        ))}
      </span>
      {showValue && (
        <span className={`font-mono tabular text-ink-200 ${valueClass}`}>
          {difficulty.toFixed(2)}
        </span>
      )}
    </span>
  );
}
