import type { ReactNode } from "react";

/**
 * The standard heading block that opens each section. Folio number, eyebrow
 * label, oversized display title, and a one-line dek (subtitle).
 */
export function PageHeader({
  folio,
  eyebrow,
  title,
  dek,
  right,
}: {
  folio: string;
  eyebrow: string;
  title: ReactNode;
  dek?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-8 sm:mb-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 sm:gap-6">
        <div className="flex items-baseline gap-2 sm:gap-3">
          <span className="font-mono text-[11px] tracking-wide-caps uppercase text-oxblood-500">
            §&nbsp;{folio}
          </span>
          <span className="label-caps">{eyebrow}</span>
        </div>
        {right}
      </div>
      <h1
        // The clamp lets the title shrink on tiny viewports so the
        // longest word (e.g. CATALOGUED.) fits the tabletop column at
        // 320px without breaking mid-character. On wider viewports it
        // grows back to the full editorial 4rem display size.
        className="font-display text-[clamp(1.75rem,8.5vw,4rem)] leading-[0.95] tracking-tight text-ink-500"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50, "WONK" 1' }}
      >
        {title}
      </h1>
      {dek && (
        <p className="mt-3 max-w-[620px] text-[15px] italic leading-snug text-ink-200 sm:mt-4 sm:text-[18px]">
          {dek}
        </p>
      )}
      <div className="divider-hair mt-6 sm:mt-8" />
    </header>
  );
}
