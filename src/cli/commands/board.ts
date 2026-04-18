/**
 * `board` — generate / print the active board.
 *
 *   board random              — random board in the mode's target range
 *   board pattern --kind <k>  — pattern board (sixes / threes / pairs / triples)
 *   board                     — print the active board (or "no board")
 */
import {
  generatePatternBoard,
  generateRandomBoard,
} from "../../services/generators.js";
import { optionalString } from "../parseArgs.js";
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";
import { makeBoard, renderBoard } from "../render.js";

const PATTERN_PRESETS: Readonly<Record<string, readonly number[]>> = {
  sixes: [6],
  threes: [3],
  fives: [5],
  pairs: [2, 4],
  triples: [2, 3, 5],
};

export const boardCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const verb = args.positionals[0];
  if (verb === "random") {
    const cells = generateRandomBoard(ctx.mode);
    ctx.board = makeBoard(cells);
  } else if (verb === "pattern") {
    const kind = optionalString(args, "kind") ?? "sixes";
    const preset = PATTERN_PRESETS[kind];
    if (preset === undefined) {
      writeln(
        out,
        ansi.red(
          `unknown pattern --kind "${kind}" (try: ${Object.keys(PATTERN_PRESETS).join(", ")})`,
          ctx.tty,
        ),
      );
      return { exitCode: 1 };
    }
    ctx.board = makeBoard(generatePatternBoard(preset));
  } else if (verb !== undefined) {
    writeln(
      out,
      ansi.red(
        `unknown board verb "${verb}" (expected "random" or "pattern")`,
        ctx.tty,
      ),
    );
    return { exitCode: 1 };
  }

  if (ctx.board === null) {
    writeln(out, ansi.gray("board: (unset — try `board random`)", ctx.tty));
    return { exitCode: 0 };
  }

  writeln(out, renderBoard(ctx.board, ctx.tty));
  return { exitCode: 0 };
};
