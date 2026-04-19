/**
 * `export` — placeholder.
 *
 * The bulk export pipeline lives on the `agent/phase-1-export` branch
 * (PLAN-A). Once it merges, this command will delegate to
 * `scripts/export.ts`. Until then, print a deferral notice with a
 * pointer the user can act on immediately.
 */
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";

export const exportCommand: CommandFn = async (_args, ctx, out): Promise<CommandResult> => {
  writeln(
    out,
    ansi.yellow(
      "export deferred to Phase 1 — once it merges, run `npm run export` directly.",
      ctx.tty,
    ),
  );
  writeln(
    out,
    ansi.gray(
      "see docs/agent-plans/PLAN-A-bulk-export.md for the full pipeline scope.",
      ctx.tty,
    ),
  );
  return { exitCode: 0 };
};
