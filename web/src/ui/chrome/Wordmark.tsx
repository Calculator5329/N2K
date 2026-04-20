/**
 * The N2K Almanac wordmark. Designed to feel like the spine-stamp of an
 * old reference book: tall display serif, oxblood letterform with the
 * subtitle in spaced caps below.
 */
export function Wordmark({ size = "default" }: { size?: "default" | "compact" }) {
  if (size === "compact") {
    return (
      <div className="flex items-baseline gap-2 leading-none">
        <span
          className="font-display text-[28px] font-medium text-oxblood-500"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          N2K
        </span>
        <span className="label-caps text-ink-100">Almanac</span>
      </div>
    );
  }

  return (
    <div className="leading-none">
      <div
        className="font-display text-[clamp(3.25rem,12vw,5.5rem)] font-medium text-oxblood-500 text-display-tight"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 1' }}
      >
        The N2K
        <br />
        <span className="italic text-ink-500" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}>
          Almanac
        </span>
      </div>
    </div>
  );
}
