/**
 * Tiny vertical virtualizer.
 *
 * Hand-rolled (no `react-window` / `react-virtual` dep) because the
 * surface area we need is small: fixed row height, single column of
 * arbitrary React children, scroll container we control. Overscan +
 * `requestAnimationFrame` throttling keep scroll smooth at 60fps even
 * with 1000+ rows.
 *
 * Usage:
 *
 *   <VirtualRows
 *     count={items.length}
 *     rowHeight={36}
 *     maxHeight="60vh"
 *     renderRow={(i) => <Row data={items[i]} />}
 *   />
 *
 * The render function MUST produce a node whose outer height equals
 * `rowHeight`; the container positions it absolutely. Pad/border are
 * fine if they're inside that height.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface VirtualRowsProps {
  readonly count: number;
  readonly rowHeight: number;
  readonly renderRow: (index: number) => ReactNode;
  /** CSS max-height for the scroll viewport (default `60vh`). */
  readonly maxHeight?: string;
  /** Extra rows rendered above/below the viewport (default 6). */
  readonly overscan?: number;
  /** Optional sticky header that scrolls horizontally with rows. */
  readonly header?: ReactNode;
  /** Forwarded `key` for forcing reset on data identity changes. */
  readonly resetKey?: string | number;
  /** Optional className for the outer scroll viewport. */
  readonly className?: string;
  /** Optional style override merged into the outer scroll viewport. */
  readonly style?: React.CSSProperties;
}

export function VirtualRows({
  count,
  rowHeight,
  renderRow,
  maxHeight = "60vh",
  overscan = 6,
  header,
  resetKey,
  className,
  style,
}: VirtualRowsProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Measure viewport on mount + when the window resizes; cheap because
  // it only fires on resize, not on every render.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (node === null) return;
    const measure = () => setViewportHeight(node.clientHeight);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Reset scroll position when the underlying data identity changes
  // (different dice tuple loaded, filter cleared, etc.). Keeps users
  // anchored to the top of a fresh result set instead of a stale
  // mid-list scroll position.
  useEffect(() => {
    if (resetKey === undefined) return;
    const node = viewportRef.current;
    if (node === null) return;
    node.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  const totalHeight = count * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(count, startIndex + visibleCount);

  const rows: ReactNode[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    rows.push(
      <div
        key={i}
        style={{
          position: "absolute",
          top: i * rowHeight,
          left: 0,
          right: 0,
          height: rowHeight,
        }}
      >
        {renderRow(i)}
      </div>,
    );
  }

  return (
    <div
      ref={viewportRef}
      onScroll={(e) => {
        const y = e.currentTarget.scrollTop;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setScrollTop(y);
        });
      }}
      className={className}
      style={{
        position: "relative",
        overflowY: "auto",
        maxHeight,
        ...style,
      }}
    >
      {header}
      <div style={{ position: "relative", height: totalHeight }}>
        {rows}
      </div>
    </div>
  );
}
