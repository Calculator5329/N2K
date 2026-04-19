/**
 * Command dispatch table. Adding a new verb means adding it here and
 * extending {@link COMMAND_SPECS} in `help.ts`.
 */
import type { CommandFn } from "../context.js";
import { boardCommand } from "./board.js";
import { diceCommand } from "./dice.js";
import { explainCommand } from "./explain.js";
import { exportCommand } from "./export.js";
import { helpCommand } from "./help.js";
import { modeCommand } from "./mode.js";
import { rollCommand } from "./roll.js";
import { solveAllCommand, solveCommand } from "./solve.js";
import { sweepCommand } from "./sweep.js";

export const COMMANDS: Readonly<Record<string, CommandFn>> = {
  mode: modeCommand,
  dice: diceCommand,
  roll: rollCommand,
  board: boardCommand,
  solve: solveCommand,
  "solve-all": solveAllCommand,
  sweep: sweepCommand,
  explain: explainCommand,
  export: exportCommand,
  help: helpCommand,
};

export const COMMAND_NAMES: readonly string[] = Object.keys(COMMANDS);
