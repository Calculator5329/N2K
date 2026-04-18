/**
 * Tiny ANSI helper. No `chalk` dep — colors are simple SGR sequences and
 * the entire surface fits in 30 lines.
 *
 * Every wrapper is a no-op when `enabled` is false, so the CLI can pass
 * a single `tty` boolean through the codebase and uniformly disable
 * colors when stdout is piped.
 */

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function wrap(code: number): (s: string, enabled: boolean) => string {
  const open = `${ESC}${code}m`;
  return (s, enabled) => (enabled ? `${open}${s}${RESET}` : s);
}

export const ansi = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
} as const;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip every ANSI escape — useful for measuring printed width in tests. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
