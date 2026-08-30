# PLAN-D — Phase 2: CLI REPL

**Branch:** `agent/phase-2-cli`
**Estimated scope:** ~500–800 LoC + tests
**Depends on:** Phase 0 foundation (already on `main`)
**Blocks:** Nothing — the CLI is a leaf surface
**Synergy:** Once Plan A (export pipeline) lands, the CLI can also load datasets and answer "what's the easiest equation for cell X" in O(1).

## Goal

Ship a self-contained command-line REPL + one-shot CLI that wraps the Phase 0 services. Two reasons this matters:

1. **Architectural feedback.** A non-web consumer of `core/` + `services/` flushes out any web-specific assumptions hiding in the API. If something is awkward to use from a script, it's probably awkward to use from a feature store too.
2. **Immediate utility.** The user gets a working solver/explorer right now, before the web Play surface lands.

## File boundary

### WILL create

- `src/cli/index.ts` — argv router. Supports both REPL mode (no args, drops into prompt) and one-shot mode (e.g. `n2k solve --mode aether --dice -3,7,11 --target 47`).
- `src/cli/repl.ts` — interactive loop (Node `readline`). State: current `Mode`, current `dice`, current `board`. Every command is a verb; `help` lists them.
- `src/cli/commands/` — one file per command. See "Command set" below.
- `src/cli/render.ts` — pure formatters: equation → string, breakdown → table, board → grid. Reuses `services/parsing.ts::formatEquation` for equations; adds ANSI color when `process.stdout.isTTY` (no chalk dep — write a 30-line ANSI helper).
- `src/cli/parseArgs.ts` — minimal argv parser (no yargs / commander). Supports `--key value`, `--flag`, `--key=value`, positional args, `--`. ~80 LoC.
- `tests/cli/parseArgs.test.ts` — argv parser unit tests.
- `tests/cli/commands.test.ts` — for each command, assert that running it programmatically produces the expected text/exit code. Use a fake `Writable` stream as stdout.
- `tests/cli/render.test.ts` — formatter tests including ANSI on/off behavior.
- `tests/cli/repl.test.ts` — end-to-end REPL test: feed a script of inputs into the loop and assert outputs.

### MAY modify

- `package.json` — add a `"bin": { "n2k": "src/cli/index.ts" }` (run through `tsx` in dev) AND a `"cli": "tsx src/cli/index.ts"` script. Add `tsx` if not already a dep — it should be.
- `tsconfig.json` — ensure `"src/cli/**/*.ts"` is included.
- `docs/changelog.md` — append a "Phase 2 CLI REPL" section.
- `docs/roadmap.md` — check off Phase 2 boxes.

### MUST NOT touch

- `src/core/`, `src/services/` — foundation is stable.
- `web/` — out of scope.
- Any other agent's branch files (none of yours overlap with PLAN-A or PLAN-B's path lists, but double-check `src/` paths before adding).

## Command set

Each command is implemented as a function `(args, ctx, out) => Promise<{ exitCode: number }>` so it's trivially testable. The REPL and one-shot dispatcher both call the same functions.

| Verb        | One-shot example                                       | What it does |
|-------------|--------------------------------------------------------|--------------|
| `mode`      | `n2k mode aether`                                      | In REPL: switch active mode. One-shot: print active. |
| `dice`      | `n2k dice 2,3,5`                                       | Set / print active dice. Validates with `isLegalDiceForMode`. |
| `roll`      | `n2k roll --arity 3`                                   | Generate random legal dice for the active mode. |
| `board`     | `n2k board random` or `n2k board pattern --kind threes`| Generate / print active board. |
| `solve`     | `n2k solve --target 47` or `n2k solve --target 47 --dice 2,3,5 --mode standard` | One easiest solution. Pretty-prints with breakdown. |
| `solve-all` | `n2k solve-all --target 47 --limit 50`                 | All solutions, sorted by difficulty asc, optional `--limit`. |
| `sweep`     | `n2k sweep --dice 2,3,5`                               | Streaming sweep — prints `target → easiest difficulty` lines as the solver finds them. |
| `explain`   | `n2k explain --equation "2 * 3 ^ 2 * 5 = 90"`          | Difficulty breakdown table for a parsed equation (note: requires the parser, see below). |
| `export`    | `n2k export --mode standard --out ./data-out`          | Once Plan A lands, delegates to `scripts/export.ts`. Until then, prints "deferred to Phase 1". |
| `help`      | `n2k help` or `n2k help solve`                         | Lists commands or shows usage for one. |
| `quit`      | (REPL only)                                            | Exits the REPL. |

### Equation parsing dependency

`explain` needs `parseEquation` which is **not yet implemented** in `services/parsing.ts` (Phase 0 deliberately deferred it). For this plan:

- Implement `parseEquation` **inside `src/cli/parseEquation.ts`** (NOT inside `src/services/parsing.ts` — that's the foundation, off-limits). When the official `parseEquation` ships later, the CLI version is replaced.
- Grammar: `<term> <op> <term> [<op> <term>] [<op> <term>] [<op> <term>] = <number>`. Terms are integers or `<base>^<exp>`; negative bases require parens: `(-3)^2`. Whitespace-flexible. Operators: `+ - * /`.
- Validate the parsed result evaluates to the claimed total; throw a helpful error if not.

## Concrete API contract for command functions

```ts
export interface CliContext {
  /** Mutable across REPL turns. One-shot mode constructs a fresh ctx per call. */
  mode: Mode;
  dice: readonly number[] | null;
  board: Board | null;
  /** true when stdout supports ANSI colors. */
  readonly tty: boolean;
}

export interface CommandResult { readonly exitCode: number; }

export type CommandFn = (
  args: ParsedArgs,
  ctx: CliContext,
  out: Writable,
) => Promise<CommandResult>;
```

## Acceptance criteria

- `npm run typecheck` clean.
- `npm test` clean — at least 35 new tests across `tests/cli/`.
- `npm run cli` drops into a working REPL.
- `npx tsx src/cli/index.ts solve --mode standard --dice 2,3,5 --target 47` prints a valid equation OR a clear "no solution" message and exits 0/1 appropriately.
- `--help` works on both the top-level CLI and per-command (`solve --help`).
- Sweep streams output incrementally (verified by interleaving stdout writes in a test, not just by collecting at the end).
- ANSI colors automatically disabled when stdout is piped (`process.stdout.isTTY === false`).

## Stretch goals

- Auto-completion in the REPL (Node readline supports it via `completer`).
- A `--json` global flag that switches every command's output from human text to machine-readable JSON, so the CLI is also a scripting target.
- A `bench` command that runs a quick perf test of the solver and reports timings.

## Hand-off / merge

Open the PR with title `Phase 2: CLI REPL` referencing this plan file. Include in the PR body:
- An asciinema recording or copy-paste transcript of a REPL session
- The full list of commands with one-line descriptions
- Confirmation that the foundation modules were not modified
