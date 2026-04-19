/**
 * DifficultyMeter — five-pip difficulty strip.
 *
 * Buckets:
 *   <  10 → 1 pip (trivial)
 *   < 25 → 2 pips
 *   < 50 → 3 pips
 *   < 75 → 4 pips
 *   ≥ 90 → 5 pips
 *   null → italic "no solution"
 *
 * Pure presentational; no MobX subscription.
 */
export interface DifficultyMeterProps {
  readonly difficulty: number | null;
  readonly showValue?: boolean;
  readonly size?: "sm" | "md";
}

function pipsFor(d: number): number {
  if (d < 10) return 1;
  if (d < 25) return 2;
  if (d < 50) return 3;
  if (d < 75) return 4;
  return 5;
}

export function DifficultyMeter({ difficulty, showValue = false, size = "md" }: DifficultyMeterProps) {
  if (difficulty === null) {
    return (
      <span
        className="font-mono italic"
        style={{ color: "var(--color-ink-muted)", fontSize: size === "sm" ? 10 : 12 }}
      >
        no solution
      </span>
    );
  }
  const filled = pipsFor(difficulty);
  const w = size === "sm" ? 6 : 8;
  const h = size === "sm" ? 14 : 20;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-end gap-[2px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: w,
              height: h * (0.55 + (i / 4) * 0.45),
              borderRadius: 1,
              background: i < filled ? "var(--color-accent)" : "color-mix(in oklab, var(--color-rule) 80%, transparent)",
            }}
          />
        ))}
      </span>
      {showValue ? (
        <span
          className="font-mono tabular"
          style={{ color: "var(--color-ink-muted)", fontSize: size === "sm" ? 11 : 13 }}
        >
          {difficulty.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}
